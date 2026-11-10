// ============================================================
// 异常价格守卫（2026-11-01 数据质量口径）测试：
// - detectSuspects 判定纯函数：V 型隔离 / 持续位移（K=2 只标注）/ 末端候选 /
//   促销带下跌放行 / RRP 同步放行 / 人工裁定双向 / 脏点后干净回弹不误伤 /
//   缺采跨周延续 / 首点不判 / 阈值含等于 / 关闭态零输出 / 可信链跨隔离；
// - 规则与人工裁定的存取（默认 50 开、非法档位钳制、同点覆写、撤销）；
// - buildSeries 端到端锚点（真实数据：DE 穿戴 Galaxy Watch 8 Classic 46mm
//   2026W39 为瞬态隔离点——脏数据批次里真实存在的 V 型）。
// ============================================================
// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  addAnomalyMark,
  anomalyManualOf,
  detectSuspects,
  listAnomalyMarks,
  readAnomalyRule,
  saveAnomalyRule,
  undoAnomalyMark,
  DEFAULT_ANOMALY_RULE,
  type AnomalyRule,
  type SuspectSourcePoint,
} from '../anomaly';
import { buildSeries } from '../aggregate';
import { dimProduct } from '../../data';
import { dataBucketRange } from '../../chart/PriceTrend/helpers';

// 本仓 vitest 的 jsdom 环境未提供 localStorage —— 补内存实现（生产浏览器恒有）
beforeAll(() => {
  const w = window as unknown as { localStorage?: Storage };
  if (w.localStorage) return;
  const mem = new Map<string, string>();
  const shim: Storage = {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => void mem.set(k, String(v)),
    removeItem: (k) => void mem.delete(k),
    clear: () => void mem.clear(),
    key: (i) => [...mem.keys()][i] ?? null,
    get length() {
      return mem.size;
    },
  };
  Object.defineProperty(w, 'localStorage', { configurable: true, value: shim });
});

afterEach(() => {
  window.localStorage.clear();
});

const RULE = (thresholdPct: number, enabled = true): AnomalyRule => ({ enabled, thresholdPct });

const pts = (prices: (number | null)[], opts?: { rrp?: (number | null)[]; anchorDates?: string[] }): SuspectSourcePoint[] =>
  prices.map((price, i) => ({
    bucketId: `w${i}`,
    price,
    rrp: opts?.rrp?.[i] ?? null,
    anchorDate: opts?.anchorDates?.[i] ?? `2026-01-${String(i + 1).padStart(2, '0')}`,
  }));

const stateOf = (v: { prices: (number | null)[]; ctx?: Parameters<typeof detectSuspects>[1] }) => {
  const points = pts(v.prices);
  const verdicts = detectSuspects(points, v.ctx ?? { rule: RULE(50) });
  return verdicts;
};

describe('detectSuspects · 判定纯函数', () => {
  it('V 型瞬态（超阈后回落到可信水平）→ 自动隔离', () => {
    const v = stateOf({ prices: [100, 250, 102] });
    expect(v.size).toBe(1);
    const [idx, verdict] = [...v][0];
    expect(idx).toBe(1);
    expect(verdict.state).toBe('quarantined');
    expect(verdict.reason).toBe('transient');
    expect(verdict.wow).toBeCloseTo(1.5, 6);
  });

  it('脏点后的干净回弹不是候选（对可信基线几乎没动）——30% 档同判', () => {
    const v = stateOf({ prices: [100, 200, 105], ctx: { rule: RULE(30) } });
    expect(v.size).toBe(1);
    expect([...v][0][0]).toBe(1); // 只有脏点被隔离，回弹点 105 干净
  });

  it('持续位移（新水平维持 ≥2 点，K=2）→ 只标注不隔离（pending/shift）', () => {
    const v = stateOf({ prices: [100, 220, 225, 224] });
    expect(v.size).toBe(1);
    const [idx, verdict] = [...v][0];
    expect(idx).toBe(1);
    expect(verdict.state).toBe('pending');
    expect(verdict.reason).toBe('shift');
  });

  it('序列末端候选 → 只标注（pending/tail），最新一周绝不静默剔除', () => {
    const v = stateOf({ prices: [100, 250] });
    expect(v.size).toBe(1);
    const [, verdict] = [...v][0];
    expect(verdict.state).toBe('pending');
    expect(verdict.reason).toBe('tail');
  });

  it('首点不判（无 prev）；正常波动不标', () => {
    expect(stateOf({ prices: [900, 910, 905] }).size).toBe(0);
  });

  it('阈值含等于：恰好 50% 也判（与既有环比口径一致）', () => {
    const v = stateOf({ prices: [100, 150, 101] });
    expect(v.size).toBe(1);
    expect([...v][0][1].state).toBe('quarantined');
  });

  it('缺采周不打断比较链（prev 跨缺采延续）', () => {
    const v = stateOf({ prices: [100, null, 250, 102] });
    expect(v.size).toBe(1);
    expect([...v][0][0]).toBe(2);
  });

  it('促销带且为下跌 → 自动放行（放行点参与可信链，其后的回升周按规则可再成候选）', () => {
    const promoHit = (p: SuspectSourcePoint): boolean => p.bucketId === 'w1';
    const down = stateOf({ prices: [250, 100, 252], ctx: { rule: RULE(50), promoHit } });
    // 下跌周（w1）放行不标；回升周相对促销价 +152% 超阈 → 末端候选只标注（计算照常，
    // 人工可「确认真实价格」消掉）——真实大促降幅通常 < 阈值，此为构造的极端档期
    expect(down.size).toBe(1);
    expect([...down][0][0]).toBe(2);
    expect([...down][0][1].state).toBe('pending');
    const up = stateOf({ prices: [100, 250, 251], ctx: { rule: RULE(50), promoHit } });
    expect(up.size).toBe(1); // 上涨仍判（持续位移 → pending）
    expect([...up][0][1].state).toBe('pending');
  });

  it('RRP 同向同步（官方调价传导）→ 放行', () => {
    const v = stateOf({
      prices: [100, 180, 182],
      ctx: { rule: RULE(50) },
    });
    const points = pts([100, 180, 182], { rrp: [100, 180, 180] });
    const verdicts = detectSuspects(points, { rule: RULE(50) });
    expect(v.size).toBe(1); // 无 RRP 信息：持续位移待核对
    expect(verdicts.size).toBe(0); // RRP 同步：不标
  });

  it('人工确认真实价格（exempt）→ 打已确认标且参与可信链', () => {
    const manual = new Map([['w1', 'exempt' as const]]);
    const v = stateOf({ prices: [100, 250, 252], ctx: { rule: RULE(50), manual } });
    expect(v.size).toBe(1);
    const [idx, verdict] = [...v][0];
    expect(idx).toBe(1);
    expect(verdict.state).toBe('exempted');
    expect(verdict.reason).toBe('manual');
  });

  it('人工标记异常（isolate）→ 隔离且退出可信链（其后回弹按旧可信水平判干净）', () => {
    const manual = new Map([['w1', 'isolate' as const]]);
    const v = stateOf({ prices: [100, 250, 102], ctx: { rule: RULE(30), manual } });
    expect(v.size).toBe(1);
    const [idx, verdict] = [...v][0];
    expect(idx).toBe(1);
    expect(verdict.state).toBe('quarantined');
    expect(verdict.reason).toBe('manual');
  });

  it('关闭守卫 → 零输出（人工裁定也停）', () => {
    const manual = new Map([['w1', 'isolate' as const]]);
    expect(stateOf({ prices: [100, 250, 102], ctx: { rule: RULE(50, false), manual } }).size).toBe(0);
  });

  it('连续异常串保守处理：第二点贴近脏水平不成候选（宁可漏，人工隔离兜底）', () => {
    const v = stateOf({ prices: [100, 200, 190, 105] });
    // 200 = 持续位移 pending；190 相对 200 变化 5% <T 不成候选；105 回落对 190 变化
    // −44.7% < 50% 不成候选 → 串内只标第一点
    expect(v.size).toBe(1);
    expect([...v][0][1].state).toBe('pending');
  });
});

describe('异常守卫 · 规则与人工裁定存取', () => {
  it('默认规则 = 开启 50%（§8 拍板 1）；localStorage 缺省/坏值回默认', () => {
    expect(readAnomalyRule()).toEqual(DEFAULT_ANOMALY_RULE);
    window.localStorage.setItem('LPL3.config.anomalyRule', '{oops');
    expect(readAnomalyRule()).toEqual(DEFAULT_ANOMALY_RULE);
    window.localStorage.setItem('LPL3.config.anomalyRule', JSON.stringify({ enabled: true, thresholdPct: 999 }));
    expect(readAnomalyRule().thresholdPct).toBe(50); // 越界档位钳回默认
  });

  it('saveAnomalyRule 规范化落盘并广播 CONFIG_CHANGED_EVENT', () => {
    let fired = 0;
    window.addEventListener('lpl3-config-changed', () => { fired += 1; });
    saveAnomalyRule({ enabled: true, thresholdPct: 30 });
    expect(fired).toBe(1);
    expect(readAnomalyRule()).toEqual({ enabled: true, thresholdPct: 30 });
  });

  it('人工裁定：同点覆写（最新在前）、按系列读取、撤销回到自动判定', () => {
    const base = { countryCode: 'DE', seriesKey: 'k1', bucketId: '202639', label: 'X', price: 547, wow: 0.59, ts: 1 };
    addAnomalyMark({ ...base, action: 'isolate' });
    addAnomalyMark({ ...base, action: 'exempt', ts: 2 }); // 同点覆写
    expect(listAnomalyMarks()).toHaveLength(1);
    expect(listAnomalyMarks()[0].action).toBe('exempt');
    expect(anomalyManualOf('DE', 'k1').get('202639')).toBe('exempt');
    expect(anomalyManualOf('DE', 'k2').size).toBe(0); // 其他系列不受影响
    undoAnomalyMark('DE', 'k1', '202639', 2);
    expect(listAnomalyMarks()).toHaveLength(0);
  });
});

describe('异常守卫 · buildSeries 端到端锚点（真实数据）', () => {
  it('默认关闭（2026-11-05 Eason 拍板）：同场景不产隔离点，脱敏线不受守卫影响', () => {
    // 层级塌缩（2026-11-10）：穿戴 romram 一律 '—'（表盘尺寸并进 color='46mm Black'）；sku_id 不变，按 sku_id 定位
    const row = dimProduct.find((p) => p.sku_id === 'cmp-samsung-galaxy-watch-8-classic__46mm__black');
    expect(row).toBeDefined();
    const [startBucket, endBucket] = dataBucketRange('week');
    const series = buildSeries({
      groups: [{ modelId: 'cmp-samsung-galaxy-watch-8-classic', romram: '—', skuIds: [row!.sku_id], isOwn: false }],
      granularity: 'week',
      startBucket,
      endBucket,
      currency: 'usd',
      agg: 'avg',
      scope: { countryCode: 'DE', industry: 'wearable' },
    });
    expect(series).toHaveLength(1);
    expect(readAnomalyRule().enabled).toBe(false);
    expect(series[0].points.filter((pt) => pt.suspect === 'quarantined')).toEqual([]);
  });

  it('显式开启后：DE 穿戴 Galaxy Watch 8 Classic 46mm 2026W39 为瞬态隔离点（50%）', () => {
    saveAnomalyRule({ enabled: true, thresholdPct: 50 });
    try {
      // 层级塌缩（2026-11-10）：查找锚改 sku_id（romram 键已 '—'）；锚值 2026W39 / 50% 瞬态
      // 来自同一事实行（sku_id 未变），且显式单 SKU 取数，塌缩不影响中位基数 → 原样成立
      const row = dimProduct.find((p) => p.sku_id === 'cmp-samsung-galaxy-watch-8-classic__46mm__black');
      expect(row).toBeDefined();
      const [startBucket, endBucket] = dataBucketRange('week');
      const series = buildSeries({
        groups: [{ modelId: 'cmp-samsung-galaxy-watch-8-classic', romram: '—', skuIds: [row!.sku_id], isOwn: false }],
        granularity: 'week',
        startBucket,
        endBucket,
        currency: 'usd',
        agg: 'avg',
        scope: { countryCode: 'DE', industry: 'wearable' },
      });
      expect(series).toHaveLength(1);
      const isolated = series[0].points.filter((pt) => pt.suspect === 'quarantined');
      expect(isolated.map((pt) => pt.bucketId)).toEqual(['202639']);
      expect(isolated[0].suspectReason).toBe('transient');
      expect(isolated[0].suspectWow).toBeGreaterThan(0.5);
    } finally {
      saveAnomalyRule({ enabled: false, thresholdPct: 50 });
    }
  });
});
