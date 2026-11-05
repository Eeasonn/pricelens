// ============================================================
// 异常价格守卫（2026-11-01 设计方案 A：全局数据质量口径 + 隔离态标注）。
// 设计正典 docs/design/2026-11-01-price-anomaly-threshold.md：
//   - 判定在取数层（buildSeries 产点后追加 pass），输出点级 suspect 标志；
//     所有消费方（主图/宽表/量价/多平台/预警）同源，跨页一致由单点保证。
//   - 公式与既有环比口径逐字一致：chg = price_i / price_{i-1} − 1（对上一
//     原始有值观测点，prev 跨缺采延续）；涨跌对称单阈值。
//   - 瞬态超阈（V 型）自动隔离；持续位移（K=2）与末端候选只标注不隔离——
//     宁可漏（多看一眼）不可错杀（静默改数字）。
//   - 三类豁免：促销带下跌自动放行 / RRP 同步放行 / 人工裁定（双向、可撤销）。
//   - 隔离 ≠ 删除：原值永远在点结构里（「不吞点」），只是不参与派生计算。
// 本模块不依赖 aggregate（防环）；促销带判定直接读维表（任意档期，不分平台）。
// ============================================================
import { dimPromo } from '../data';
import { CONFIG_CHANGED_EVENT, LPL } from '../state/lplKeys';

/** 点级打标状态（与 SeriesPoint.suspect 同构；缺省 = 可信不打标） */
export type SuspectState = 'quarantined' | 'pending' | 'exempted';

export interface AnomalyRule {
  enabled: boolean;
  /** 相邻观测点变化幅度阈值（百分比 10–90 整数；50 = 50%） */
  thresholdPct: number;
}

/** 默认关闭（2026-11-05 Eason：守卫默认不开；配置页显式打开的用户不受影响）。
 *  阈值保留 50%：瞬态+豁免规则已把促销/官方调价放行，50% 几乎只命中采集事故。 */
export const DEFAULT_ANOMALY_RULE: AnomalyRule = { enabled: false, thresholdPct: 50 };
export const ANOMALY_CUSTOM_MIN = 10;
export const ANOMALY_CUSTOM_MAX = 90;

/** 人工裁定动作：exempt = 确认真实价格；isolate = 标记异常（手动隔离） */
export type AnomalyMarkAction = 'exempt' | 'isolate';

export type AnomalyGranularity = 'week' | 'month' | 'quarter';

export interface AnomalyMark {
  countryCode: string;
  /** 系列 key = modelId__配置去空格（与图例/预警同空间） */
  seriesKey: string;
  /** 裁定时的桶 id（周 YYYYWW 为主口径；月/季点裁定存该桶 id，命中按构成周扩散） */
  bucketId: string;
  action: AnomalyMarkAction;
  /** 裁定时粒度（清单桶文案按它显示：周 2026W39 / 月 2026-10 / 季原样；旧记录缺省按周） */
  granularity?: AnomalyGranularity;
  /** 留痕快照（清单展示用，避免回查口径漂移） */
  label: string;
  price: number | null;
  wow: number | null;
  ts: number;
}

// ---------------- localStorage 读写（全部防御性；node 测试环境回默认） ----------------

/** 存储访问：浏览器/jdom 走 window.localStorage；不可用环境（node SSR/测试）= null */
function storageOf(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  } catch {
    /* 受限环境 */
  }
  return null;
}

function readJson<T>(key: string): T | null {
  try {
    const store = storageOf();
    if (!store) return null;
    const raw = store.getItem(key);
    if (raw == null) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    const store = storageOf();
    if (!store) return;
    store.setItem(key, JSON.stringify(value));
  } catch {
    /* 存储不可用：静默降级为仅本次会话不持久（打标仍随重算生效） */
  }
}

export function notifyAnomalyChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(CONFIG_CHANGED_EVENT));
}

function clampCustomPct(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  const i = Math.round(n);
  if (i < ANOMALY_CUSTOM_MIN || i > ANOMALY_CUSTOM_MAX) return null;
  return i;
}

export function readAnomalyRule(): AnomalyRule {
  const raw = readJson<Partial<AnomalyRule>>(LPL.cfgAnomalyRule);
  if (raw == null || typeof raw !== 'object') return { ...DEFAULT_ANOMALY_RULE };
  const pct = clampCustomPct(raw.thresholdPct) ?? DEFAULT_ANOMALY_RULE.thresholdPct;
  return { enabled: raw.enabled === true, thresholdPct: pct };
}

export function saveAnomalyRule(rule: AnomalyRule): void {
  const pct = clampCustomPct(rule.thresholdPct) ?? DEFAULT_ANOMALY_RULE.thresholdPct;
  writeJson(LPL.cfgAnomalyRule, { enabled: rule.enabled === true, thresholdPct: pct });
  notifyAnomalyChanged();
}

function readAnomalyMarks(): AnomalyMark[] {
  const raw = readJson<unknown>(LPL.cfgAnomalyMarks);
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (m): m is AnomalyMark =>
      m != null && typeof m === 'object' && typeof (m as AnomalyMark).countryCode === 'string'
        && typeof (m as AnomalyMark).seriesKey === 'string' && typeof (m as AnomalyMark).bucketId === 'string'
        && ((m as AnomalyMark).action === 'exempt' || (m as AnomalyMark).action === 'isolate'),
  );
}

/** 记一条人工裁定（同点覆写：先移除同 cc+系列+桶的旧记录再新增，最新在前） */
export function addAnomalyMark(mark: AnomalyMark): void {
  const marks = readAnomalyMarks().filter(
    (m) => !(m.countryCode === mark.countryCode && m.seriesKey === mark.seriesKey && m.bucketId === mark.bucketId),
  );
  marks.unshift(mark);
  writeJson(LPL.cfgAnomalyMarks, marks);
  notifyAnomalyChanged();
}

/** 撤销一条人工裁定（清单行尾「撤销」）；撤销后回到自动判定 */
export function undoAnomalyMark(countryCode: string, seriesKey: string, bucketId: string, ts: number): void {
  const marks = readAnomalyMarks().filter(
    (m) => !(m.countryCode === countryCode && m.seriesKey === seriesKey && m.bucketId === bucketId && m.ts === ts),
  );
  writeJson(LPL.cfgAnomalyMarks, marks);
  notifyAnomalyChanged();
}

export function listAnomalyMarks(): AnomalyMark[] {
  return readAnomalyMarks();
}

/** 某国某系列的人工裁定（bucketId → 动作） */
export function anomalyManualOf(countryCode: string, seriesKey: string): Map<string, AnomalyMarkAction> {
  const out = new Map<string, AnomalyMarkAction>();
  for (const m of readAnomalyMarks()) {
    if (m.countryCode === countryCode && m.seriesKey === seriesKey) out.set(m.bucketId, m.action);
  }
  return out;
}

// ---------------- 判定（纯函数，确定性） ----------------

/** 判定输入点（只要求价格与桶标识；rrp/anchorDate 供豁免判定） */
export interface SuspectSourcePoint {
  bucketId: string;
  price: number | null;
  rrp?: number | null;
  anchorDate?: string;
}

export interface SuspectVerdict {
  state: SuspectState;
  /** transient 瞬态隔离 / shift 持续位移 / tail 末端候选 / manual 人工 */
  reason: 'transient' | 'shift' | 'tail' | 'manual';
  /** 相对上一原始有值点的环比（胶囊文案用） */
  wow: number | null;
}

export interface DetectSuspectsCtx {
  rule: AnomalyRule;
  /** 人工裁定（bucketId → 动作），优先于自动规则 */
  manual?: Map<string, AnomalyMarkAction>;
  /** 促销带命中（按锚日；任意档期）。返回 true 且该点为下跌 → 自动放行 */
  promoHit?: (p: SuspectSourcePoint) => boolean;
}

const EPS = 1e-9;

/**
 * 相邻观测点异常判定（buildSeries 与预警扫描共用同一纯函数）：
 * - 首点不判；prev 跨缺采延续（对上一**原始**有值点——先看真实世界再谈可信）；
 * - 「回到可信水平」的点不是候选（脏点后的干净回弹对可信基线几乎没动）；
 * - 候选点依次过 人工裁定 → 促销带下跌 → RRP 同向同步 三类豁免；
 * - V 型（下一有值点回到上一可信水平）→ 自动隔离；持续位移 / 末端 → 只标注；
 * - 可信链（lastTrusted）跳过隔离点——计算层「对上一可信点」的判定基础。
 */
export function detectSuspects(points: SuspectSourcePoint[], ctx: DetectSuspectsCtx): Map<number, SuspectVerdict> {
  const out = new Map<number, SuspectVerdict>();
  const rule = ctx.rule;
  if (!rule.enabled || !(rule.thresholdPct > 0)) return out;
  const t = rule.thresholdPct / 100;
  const n = points.length;
  let prevIdx = -1; // 上一原始有值点（检测基准）
  let lastTrusted: number | null = null; // 上一可信价（隔离点跳过；pending/exempt 照常入链）
  for (let i = 0; i < n; i++) {
    const p = points[i].price;
    if (p == null || !(p > 0)) continue;
    const prev = prevIdx >= 0 ? points[prevIdx].price ?? null : null;
    const wow = prev != null && prev > 0 ? p / prev - 1 : null;
    const manual = ctx.manual?.get(points[i].bucketId);
    if (manual === 'exempt') {
      out.set(i, { state: 'exempted', reason: 'manual', wow });
    } else if (manual === 'isolate') {
      out.set(i, { state: 'quarantined', reason: 'manual', wow });
    } else {
      const nearTrusted = lastTrusted != null && lastTrusted > 0 && Math.abs(p / lastTrusted - 1) < t;
      const candidate = wow != null && Math.abs(wow) >= t - EPS && !nearTrusted;
      if (candidate) {
        // 豁免 1：促销带且为下跌（大促不涨价；促销带背景已在图上，双重标注冗余）
        const promoOk = wow < 0 && ctx.promoHit?.(points[i]) === true;
        // 豁免 2：RRP 同步（相对前点 RRP 变化且价格同向 = 官方调价传导）
        const rrpPrev = points[prevIdx]?.rrp ?? null;
        const rrpCur = points[i].rrp ?? null;
        const rrpSync =
          rrpCur != null && rrpPrev != null && rrpCur !== rrpPrev && prev != null
          && Math.sign(p - prev) === Math.sign(rrpCur - rrpPrev);
        if (!promoOk && !rrpSync) {
          let nextIdx = -1;
          for (let j = i + 1; j < n; j++) {
            const q = points[j].price;
            if (q != null && q > 0) {
              nextIdx = j;
              break;
            }
          }
          if (nextIdx < 0) {
            // 末端候选：未来未到无法区分瞬态/持续——只标注，绝不静默剔除最新一周
            out.set(i, { state: 'pending', reason: 'tail', wow });
          } else {
            const next = points[nextIdx].price ?? 0;
            const backToTrusted = lastTrusted != null && lastTrusted > 0 && Math.abs(next / lastTrusted - 1) < t;
            if (backToTrusted) out.set(i, { state: 'quarantined', reason: 'transient', wow });
            else out.set(i, { state: 'pending', reason: 'shift', wow }); // 持续位移（K=2，§8 拍板）
          }
        }
      }
    }
    prevIdx = i;
    const verdict = out.get(i);
    if (verdict == null || verdict.state !== 'quarantined') lastTrusted = p;
  }
  return out;
}

/** 促销带命中（按锚日，任意档期、不分平台——与图面促销背景带同一日历） */
export function promoBandHitOf(countryCode: string): (p: SuspectSourcePoint) => boolean {
  const promos = dimPromo.filter((p) => p.country_code === countryCode);
  return (p) => {
    const d = p.anchorDate;
    if (!d) return false;
    return promos.some((m) => m.start_date <= d && d <= m.end_date);
  };
}

/** 隔离点判定谓词（下游派生计算共用：极差/环比/均值/预警 prev 链） */
export const isTrustedPoint = (p: { suspect?: string }): boolean => p.suspect !== 'quarantined';
