// ============================================================
// 预警中心纯计算层（第五十二轮建 / 第五十三轮扩三类 / 追补⑨细化四类独立阈值）：
// 订阅系列 × 周度扫描 → 规则预警。四类规则（demo，与看板/总览同源数据）：
// - 调价预警 price-change = 相邻有值周 |折后价变化| ≥ 阈值（我司/竞品都出）；
// - 折扣预警 promo = 促销力度 = 1 − 折后价/RRP，相邻有值周 |Δ力度| ≥ 阈值；
// - 平台价差预警 platform-gap = 仅我司品牌：同一周各平台独立折后价最高/最低差 ≥ 阈值；
// - 档位间距预警 own-gap（追补⑨新增）= 同型号相邻 ROM 档（按最新现价升序）
//   间距 = 高价/低价 − 1 **低于** 阈值 → 两档太近、价位没有合理分开（方向与前三类相反，
//   属型号/档位结构层，阈值为全局级不按产品覆盖）；
// - 缺采周不打断比较链（prev 跨缺采延续，与 buildChangeMarks 同口径）；
// - 价格恒 OZON 基准（单平台口径，与总览矩阵一致），币种随入参折算。
// 配置（追补⑨）：四类各自 全局开关+阈值；订阅产品可按类型覆写开关与阈值
// （products[key]）。确定性纯函数：同入参两次调用输出逐字节一致；金测锚定。
// ============================================================
import { dimChannel, dimProduct, dimTime, factPriceWeekly } from '../data';
import type { CurrencyMode, DataScope } from './types';
import { DEFAULT_DATA_SCOPE, isDataScopeSupported } from './scope';
import { platformPriceForSelection, platformPriceSpread } from './aggregate';
import { displayLocalValue } from './currency';
import { getFxRate } from '../state/fx';

export type AlertType = 'price-change' | 'promo' | 'platform-gap' | 'own-gap';

export type AlertThresholds = Record<AlertType, number>; // 小数（0.05 = 5%）
export type AlertTypeSwitches = Record<AlertType, boolean>;

/** 单产品覆写（追补⑨）：缺省字段回落全局 */
export interface AlertProductRule {
  types?: Partial<AlertTypeSwitches>;
  thresholds?: Partial<AlertThresholds>;
}

/** 与筛选器 PlatformSelection 同构；数据层不反向依赖 state。 */
export interface AlertPlatformSelection {
  platforms: string[];
  shopIds: string[];
}

export interface AlertCfg {
  subs: string[]; // 启用预警的系列（modelId__romram去空格）
  enabled: AlertTypeSwitches; // 四类全局开关
  thresholds: AlertThresholds; // 四类全局阈值
  /** 按产品覆写（own-gap 为型号级，不参与产品覆写） */
  products?: Record<string, AlertProductRule>;
  currency?: CurrencyMode;
  /** 数据作用域；缺省 = 当前 demo 的 RU / phone。 */
  scope?: DataScope;
  /** 与看板同构的平台选择；缺省/null/空选择 = OZON 基准。 */
  platform?: AlertPlatformSelection | null;
}

export const ALERT_TYPES: AlertType[] = ['price-change', 'promo', 'platform-gap', 'own-gap'];

export interface AlertItem {
  key: string; // `${seriesKey}|${weekId}|${type}`
  type: AlertType;
  seriesKey: string; // modelId__romram去空格（订阅/图例同空间）
  brand: string;
  modelName: string;
  romram: string;
  isOwn: boolean;
  weekId: string; // YYYYWW
  weekLabel: string; // 采集锚周三 MM-DD
  price: number | null; // 现折后价（入参币种，已取整）
  rrp: number | null;
  vsRrpPct: number | null; // price/rrp − 1（对比 RRP 幅度）
  wowPct: number | null; // 相邻有值周 price 变化（对比前周幅度）
  promoDeltaPp: number | null; // 促销力度变化（百分点，正 = 加深）
  // ---- 平台价差（仅 platform-gap 出）----
  gapPct: number | null; // 周内平台价差 = 最高/最低 − 1
  gapHighPlatform: string | null;
  gapLowPlatform: string | null;
  gapHighPrice: number | null;
  gapLowPrice: number | null;
  // ---- 档位间距（仅 own-gap 出，追补⑨）----
  pairLowLabel: string | null; // 低价档
  pairHighLabel: string | null; // 高价档
  pairLowPrice: number | null;
  pairHighPrice: number | null;
  ownGapPct: number | null; // 高/低 − 1（**低于**阈值 = 档位太近）
  pairHighSeriesKey: string | null; // 高价档系列（低价档 = seriesKey 本身）
}

export interface AlertSeriesMeta {
  seriesKey: string;
  label: string; // 品牌 + 型号 + ROMRAM（订阅 chips 展示）
  brand: string;
  modelName: string;
  romram: string;
  isOwn: boolean;
  skuId: string; // 代表 SKU（组内字典序首个）
}

const norm = (s: string): string => s.replace(/\s+/g, '');
const EPS = 1e-9;
const countryOf = (p: { country_code?: string }): string => p.country_code ?? DEFAULT_DATA_SCOPE.countryCode;

// 模块内懒构建一次（aggregate.factIndex 为私有实现，此处独立建同构索引）；
// 事实层只保留本币字段，USD 按当前参考汇率在扫描时派生，避免与配置口径分叉。
interface FactCell {
  priceRub: number | null;
  rrpRub: number | null;
}
let cellIdx: Map<string, Map<string, FactCell>> | null = null;
function factCellIndex(): Map<string, Map<string, FactCell>> {
  if (!cellIdx) {
    cellIdx = new Map();
    for (const row of factPriceWeekly) {
      let byWeek = cellIdx.get(row.sku_id);
      if (!byWeek) {
        byWeek = new Map();
        cellIdx.set(row.sku_id, byWeek);
      }
      byWeek.set(row.week_id, {
        priceRub: row.discounted_price_rub,
        rrpRub: row.rrp_rub,
      });
    }
  }
  return cellIdx;
}

const timeAsc = [...dimTime].sort((a, b) => (a.week_id < b.week_id ? -1 : 1));

/** seriesKey（modelId__romram去空格）→ 系列元数据；无产品行 = null */
export function alertSeriesMeta(seriesKey: string, scope: DataScope = DEFAULT_DATA_SCOPE): AlertSeriesMeta | null {
  const sep = seriesKey.indexOf('__');
  if (sep < 0) return null;
  const modelId = seriesKey.slice(0, sep);
  const rom = seriesKey.slice(sep + 2);
  const rows = dimProduct
    .filter((p) => p.sku_id.startsWith(modelId + '__') && norm(p.romram) === rom && p.industry === scope.industry && countryOf(p) === scope.countryCode)
    .sort((a, b) => a.sku_id.localeCompare(b.sku_id));
  if (rows.length === 0) return null;
  const head = rows[0];
  return {
    seriesKey,
    label: `${head.brand} ${head.model_name} ${head.romram}`,
    brand: head.brand,
    modelName: head.model_name,
    romram: head.romram,
    isOwn: head.is_own === true,
    skuId: head.sku_id,
  };
}

/** 任意 SKU → 其所属系列 key（总览行/型号块组装订阅集用） */
export function seriesKeyOfSku(skuId: string): string {
  const p = dimProduct.find((r) => r.sku_id === skuId);
  if (!p) return skuId;
  return `${p.sku_id.split('__')[0]}__${norm(p.romram)}`;
}

/** 单系列单类型的有效配置：产品覆写优先，回落全局（追补⑨） */
function effEnabled(cfg: AlertCfg, key: string, type: AlertType): boolean {
  return cfg.products?.[key]?.types?.[type] ?? cfg.enabled[type];
}
function effThreshold(cfg: AlertCfg, key: string, type: AlertType): number {
  return cfg.products?.[key]?.thresholds?.[type] ?? cfg.thresholds[type];
}

/**
 * 订阅系列的预警扫描（唯一入口，追补⑨改配置对象入参）。
 * own-gap = 型号级结构预警：订阅内的我司系列按型号分组，组内 ≥2 档时按各档
 * 「最新有值周现价」升序做相邻对，间距低于阈值即报（不随产品覆写）。
 */
export function buildAlerts(cfg: AlertCfg): AlertItem[] {
  const currency = cfg.currency ?? 'usd';
  const scope = cfg.scope ?? DEFAULT_DATA_SCOPE;
  // 与其他取数入口保持一致：不支持的国家/产业不产生任何预警。
  if (!isDataScopeSupported(scope)) return [];
  if (cfg.subs.length === 0) return [];
  const px = factCellIndex();
  const fxRate = getFxRate();
  // 当前事实表价格不挂店铺明细，国家由 dimChannel 的可用渠道承载；
  // 以可用国家作为事实数据门槛，同时按产品产业过滤，便于后续接入多国家数据。
  const countryAvailable = dimChannel.some((c) => c.country_code === scope.countryCode);
  if (!countryAvailable) return [];
  const scopedProducts = dimProduct.filter((p) => p.industry === scope.industry && countryOf(p) === scope.countryCode);
  const out: AlertItem[] = [];
  for (const key of cfg.subs) {
    const meta = alertSeriesMeta(key, scope);
    if (!meta) continue;
    const group = scopedProducts
      .filter((p) => p.sku_id.startsWith(`${key.split('__')[0]}__`) && norm(p.romram) === norm(meta.romram))
      .sort((a, b) => a.sku_id.localeCompare(b.sku_id));
    let prevPrice: number | null = null;
    let prevIntensity: number | null = null;
    for (const w of timeAsc) {
      // 组内多色均值（与 buildSeries 组聚合同语言）；RRP = 官方阶梯组内一条，取首个有值
      let sum = 0;
      let baseSum = 0;
      let n = 0;
      let rrp: number | null = null;
      for (const p of group) {
        const cell = px.get(p.sku_id)?.get(w.week_id);
        if (!cell) continue;
        const base = displayLocalValue(cell.priceRub, currency, fxRate);
        if (base != null) {
          baseSum += base;
          sum += platformPriceForSelection(base, p.sku_id, w.week_id, cfg.platform);
          n++;
        }
        if (rrp == null) rrp = displayLocalValue(cell.rrpRub, currency, fxRate);
      }
      if (n === 0) continue; // 缺采：prev 跨周延续（比较链不断）
      const price = Math.round(sum / n);
      const basePrice = Math.round(baseSum / n);
      const intensity = rrp != null && rrp > 0 ? 1 - price / rrp : null;
      const base = {
        seriesKey: key,
        brand: meta.brand,
        modelName: meta.modelName,
        romram: meta.romram,
        isOwn: meta.isOwn,
        weekId: w.week_id,
        weekLabel: w.week_wed_date.slice(5),
        price,
        rrp,
        vsRrpPct: rrp != null && rrp > 0 ? price / rrp - 1 : null,
        wowPct: prevPrice != null && prevPrice > 0 ? price / prevPrice - 1 : null,
        promoDeltaPp: null as number | null,
        gapPct: null as number | null,
        gapHighPlatform: null as string | null,
        gapLowPlatform: null as string | null,
        gapHighPrice: null as number | null,
        gapLowPrice: null as number | null,
        pairLowLabel: null as string | null,
        pairHighLabel: null as string | null,
        pairLowPrice: null as number | null,
        pairHighPrice: null as number | null,
        ownGapPct: null as number | null,
        pairHighSeriesKey: null as string | null,
      };
      const thr = (t: AlertType): number => effThreshold(cfg, key, t);
      // 折扣预警（促销力度变化，双价齐全且前周也有力度）：|Δ力度| ≥ 阈值（阈值 ≤0 = 关）
      if (
        effEnabled(cfg, key, 'promo') &&
        thr('promo') > 0 &&
        intensity != null &&
        prevIntensity != null &&
        Math.abs(intensity - prevIntensity) >= thr('promo') - EPS
      ) {
        out.push({
          ...base,
          key: `${key}|${w.week_id}|promo`,
          type: 'promo',
          promoDeltaPp: (intensity - prevIntensity) * 100,
        });
      }
      // 调价预警（我司/竞品都出）：|WoW| ≥ 阈值（阈值 ≤0 = 关）
      if (effEnabled(cfg, key, 'price-change') && thr('price-change') > 0 && prevPrice != null && prevPrice > 0) {
        const wow = price / prevPrice - 1;
        if (Math.abs(wow) >= thr('price-change') - EPS) {
          out.push({
            ...base,
            key: `${key}|${w.week_id}|price-change`,
            type: 'price-change',
            wowPct: wow,
          });
        }
      }
      // 平台价差预警（仅我司品牌系列）：周内各平台独立价 最高/最低 − 1 ≥ 阈值（阈值 ≤0 = 关）
      if (effEnabled(cfg, key, 'platform-gap') && thr('platform-gap') > 0 && meta.isOwn) {
        // 平台价差从 OZON 基准价展开，避免在 DNS/M.Video 选择下重复套用平台因子。
        const spread = platformPriceSpread(basePrice, meta.skuId, w.week_id);
        const low = spread[0];
        const high = spread[spread.length - 1];
        const gap = low.price > 0 ? high.price / low.price - 1 : 0;
        if (gap >= thr('platform-gap') - EPS) {
          out.push({
            ...base,
            key: `${key}|${w.week_id}|platform-gap`,
            type: 'platform-gap',
            gapPct: gap,
            gapHighPlatform: high.platform,
            gapLowPlatform: low.platform,
            gapHighPrice: Math.round(high.price),
            gapLowPrice: Math.round(low.price),
          });
        }
      }
      prevPrice = price;
      prevIntensity = intensity;
    }
  }
  // 档位间距预警（追补⑨，型号级）：订阅内我司系列按型号分组，最新有值现价相邻对
  if (cfg.enabled['own-gap']) {
    const latestOf = (key: string): { price: number; weekId: string; weekLabel: string } | null => {
      const meta = alertSeriesMeta(key, scope);
      if (!meta || !meta.isOwn) return null;
      const group = scopedProducts
        .filter((p) => p.sku_id.startsWith(`${key.split('__')[0]}__`) && norm(p.romram) === norm(meta.romram))
        .sort((a, b) => a.sku_id.localeCompare(b.sku_id));
      for (let i = timeAsc.length - 1; i >= 0; i--) {
        const w = timeAsc[i];
        let sum = 0;
        let n = 0;
        for (const p of group) {
          const cell = px.get(p.sku_id)?.get(w.week_id);
          const base = cell ? displayLocalValue(cell.priceRub, currency, fxRate) : null;
          if (base != null) {
            sum += platformPriceForSelection(base, p.sku_id, w.week_id, cfg.platform);
            n++;
          }
        }
        if (n > 0) return { price: Math.round(sum / n), weekId: w.week_id, weekLabel: w.week_wed_date.slice(5) };
      }
      return null;
    };
    const byModel = new Map<string, string[]>();
    for (const key of cfg.subs) {
      const meta = alertSeriesMeta(key, scope);
      if (!meta?.isOwn) continue;
      const modelId = key.split('__')[0];
      const arr = byModel.get(modelId);
      if (arr) arr.push(key);
      else byModel.set(modelId, [key]);
    }
    const thr = cfg.thresholds['own-gap'];
    for (const [modelId, keys] of byModel) {
      if (keys.length < 2) continue;
      const priced = keys
        .map((k) => ({ key: k, meta: alertSeriesMeta(k, scope)!, px: latestOf(k) }))
        .filter((x) => x.px != null && x.meta != null) as {
        key: string;
        meta: AlertSeriesMeta;
        px: { price: number; weekId: string; weekLabel: string };
      }[];
      priced.sort((a, b) => a.px.price - b.px.price);
      for (let i = 1; i < priced.length; i++) {
        const low = priced[i - 1];
        const high = priced[i];
        const gap = low.px.price > 0 ? high.px.price / low.px.price - 1 : 0;
        if (gap < thr - EPS) {
          out.push({
            key: `own-gap|${modelId}|${low.key}|${high.key}`,
            type: 'own-gap',
            seriesKey: low.key,
            brand: low.meta.brand,
            modelName: low.meta.modelName,
            romram: low.meta.romram,
            isOwn: true,
            weekId: high.px.weekId,
            weekLabel: high.px.weekLabel,
            price: low.px.price,
            rrp: null,
            vsRrpPct: null,
            wowPct: null,
            promoDeltaPp: null,
            gapPct: null,
            gapHighPlatform: null,
            gapLowPlatform: null,
            gapHighPrice: null,
            gapLowPrice: null,
            pairLowLabel: low.meta.label,
            pairHighLabel: high.meta.label,
            pairLowPrice: low.px.price,
            pairHighPrice: high.px.price,
            ownGapPct: gap,
            pairHighSeriesKey: high.key,
          });
        }
      }
    }
  }
  // 最新周在前；同周按类型名字序、再按系列 key（确定性序）
  return out.sort(
    (a, b) =>
      b.weekId.localeCompare(a.weekId) ||
      a.type.localeCompare(b.type) ||
      a.seriesKey.localeCompare(b.seriesKey),
  );
}

// ============================================================
// 分组纯函数（预警中心重构追加）：总览预警列 / 预警页矩阵与事件流共用，
// 与 buildAlerts 同一确定性口径，金测锚定。
// ============================================================

/** 触发按系列聚合：own-gap 同时归属低价档（seriesKey）与高价档（pairHighSeriesKey），
 *  组内保 buildAlerts 输出序（最新周在前）。总览「预警」列与预警页矩阵单元格共用。 */
export function groupAlertsBySeries(alerts: AlertItem[]): Map<string, AlertItem[]> {
  const m = new Map<string, AlertItem[]>();
  for (const a of alerts) {
    const low = m.get(a.seriesKey);
    if (low) low.push(a);
    else m.set(a.seriesKey, [a]);
    if (a.pairHighSeriesKey) {
      const high = m.get(a.pairHighSeriesKey);
      if (high) high.push(a);
      else m.set(a.pairHighSeriesKey, [a]);
    }
  }
  return m;
}

export interface AlertWeekGroup {
  weekId: string;
  weekLabel: string; // 采集锚周三 MM-DD（组内一致）
  items: AlertItem[];
}

/** 触发按周分组（预警页事件流）：buildAlerts 已按周降序，此函数只做保序分组。 */
export function groupAlertsByWeek(alerts: AlertItem[]): AlertWeekGroup[] {
  const groups: AlertWeekGroup[] = [];
  const idx = new Map<string, AlertWeekGroup>();
  for (const a of alerts) {
    let g = idx.get(a.weekId);
    if (!g) {
      g = { weekId: a.weekId, weekLabel: a.weekLabel, items: [] };
      idx.set(a.weekId, g);
      groups.push(g);
    }
    g.items.push(a);
  }
  return groups;
}

/**
 * 最新态预警（第五十五轮，用户口径：主视觉只报最新、历史进次级视图）：
 * 每个系列 × 类型只保留最新一条（输入为 buildAlerts 输出序 = 最新周在前，保序去重）。
 * 总览预警列 / 预警页矩阵与概览计数共用；own-gap 为型号级单条，天然只出现一次。
 */
export function latestAlerts(alerts: AlertItem[]): AlertItem[] {
  const seen = new Set<string>();
  const out: AlertItem[] = [];
  for (const a of alerts) {
    const k = `${a.seriesKey}|${a.type}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(a);
  }
  return out;
}

/** 单系列内每类型取最新一条（输入为该系列周降序事件，保序去重）；
 *  own-gap 双归档的行（pairHighSeriesKey = 本系列）在调用方按行内列表去重同样适用。 */
export function latestByType(items: AlertItem[]): AlertItem[] {
  const seen = new Set<AlertType>();
  const out: AlertItem[] = [];
  for (const a of items) {
    if (seen.has(a.type)) continue;
    seen.add(a.type);
    out.push(a);
  }
  return out;
}
