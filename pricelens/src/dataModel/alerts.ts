// ============================================================
// 预警中心纯计算层（第五十二轮建 / 第五十三轮扩三类 / 追补⑨细化四类独立阈值）：
// 订阅系列 × 周度扫描 → 规则预警。四类规则（demo，与看板/总览同源数据）：
// - 调价预警 price-change = 相邻有值周 |折后价变化| ≥ 阈值（华为/竞品都出）；
// - 折扣预警 promo = 促销力度 = 1 − 折后价/RRP，相邻有值周 |Δ力度| ≥ 阈值；
// - 平台价差预警 platform-gap = 仅华为品牌：同一周各平台独立折后价最高/最低差 ≥ 阈值；
// - 档位间距预警 own-gap（追补⑨新增）= 同型号相邻 ROM 档（按最新现价升序）
//   间距 = 高价/低价 − 1 **低于** 阈值 → 两档太近、价位没有合理分开（方向与前三类相反，
//   属型号/档位结构层，阈值为全局级不按产品覆盖）；
// - 缺采周不打断比较链（prev 跨缺采延续，与 buildChangeMarks 同口径）；
// - 价格口径（第一百三十八轮对齐）= 代表色单 SKU（lowestPriceColorSku 最低价颜色，
//   与看板默认取色/总览/多平台比价同源；原全色均值口径淘汰）；平台随 cfg.platform
//   （与看板平台选择同构），缺省 = 默认店铺链，币种随入参折算。
// 配置（追补⑨）：四类各自 全局开关+阈值；订阅产品可按类型覆写开关与阈值
// （products[key]）。确定性纯函数：同入参两次调用输出逐字节一致；金测锚定。
// ============================================================
import { dimChannel, dimProduct, dimTime } from '../data';
import type { CurrencyMode, DataScope } from './types';
import { DEFAULT_DATA_SCOPE, isDataScopeSupported } from './scope';
import { platformPriceSpread, priceForSelection, lowestPriceColorSku } from './aggregate';
import { anomalyManualOf, detectSuspects, promoBandHitOf, readAnomalyRule } from './anomaly';
import { displayRrpOf } from './currency';
import { errorProvenance, REAL_ALERT_PROVENANCE, type DataProvenance, type DataResult } from './provenance';

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
  /** 仅在单渠道选择时生效；与筛选器 PlatformSelection 对齐。 */
  seller?: string | null;
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
  /** 与看板同构的平台选择；缺省/null/空选择 = 默认店铺链（预填/覆盖 → 默认平台）。 */
  platform?: AlertPlatformSelection | null;
  /** Optional adapter-provided source contract; defaults to the real price fact batch. */
  provenance?: DataProvenance;
}

export const ALERT_TYPES: AlertType[] = ['price-change', 'promo', 'platform-gap', 'own-gap'];

/** 展示价取整：≥1 取整；<1（低价配件，如 $0.3x 表带）保留两位小数，取整到 0 会误读为无价 */
function displayRound(v: number): number {
  return Math.abs(v) < 1 ? Math.round(v * 100) / 100 : Math.round(v);
}

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
  /** Source and as-of metadata carried with every trigger for Agent / detail views. */
  provenance: DataProvenance;
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
const timeAsc = [...dimTime].sort((a, b) => a.week_id.localeCompare(b.week_id));

/** 阈值来自可持久化状态，运行时仍需防御 NaN/Infinity/负数。 */
function positiveThreshold(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function platformCacheKey(platform: AlertPlatformSelection | null | undefined): string {
  if (!platform) return 'default';
  return `${[...platform.platforms].sort().join(',')}|${[...platform.shopIds].sort().join(',')}|${platform.seller ?? ''}`;
}

/**
 * 代表色取价与看板保持同一选择口径。
 * 默认店铺链直接复用 aggregate 的成熟实现；显式平台/渠道时逐 SKU 取最新有价周最低者，
 * 避免预警仍按默认平台选色而与用户当前看板渠道不一致。
 */
function representativeSkuForSelection(
  modelId: string,
  romram: string,
  scope: DataScope,
  currency: CurrencyMode,
  platform: AlertPlatformSelection | null | undefined,
): string | null {
  const isDefault = !platform || (platform.platforms.length === 0 && platform.shopIds.length === 0 && !platform.seller);
  if (isDefault) return lowestPriceColorSku(modelId, romram, scope.countryCode, currency);
  const rows = dimProduct
    .filter(
      (p) =>
        p.sku_id.startsWith(modelId + '__') &&
        norm(p.romram) === norm(romram) &&
        p.industry === scope.industry &&
        p.countries.includes(scope.countryCode),
    )
    .sort((a, b) => a.sku_id.localeCompare(b.sku_id));
  for (let i = timeAsc.length - 1; i >= 0; i--) {
    const weekId = timeAsc[i].week_id;
    let best: { skuId: string; price: number } | null = null;
    for (const row of rows) {
      const hit = priceForSelection(row.sku_id, weekId, scope.countryCode, platform, currency);
      if (!hit) continue;
      if (!best || hit.price < best.price - EPS || (Math.abs(hit.price - best.price) <= EPS && row.sku_id < best.skuId)) {
        best = { skuId: row.sku_id, price: hit.price };
      }
    }
    if (best) return best.skuId;
  }
  return null;
}

/** seriesKey（modelId__romram去空格）→ 系列元数据；无产品行 = null */
export function alertSeriesMeta(seriesKey: string, scope: DataScope = DEFAULT_DATA_SCOPE): AlertSeriesMeta | null {
  const sep = seriesKey.indexOf('__');
  if (sep < 0) return null;
  const modelId = seriesKey.slice(0, sep);
  const rom = seriesKey.slice(sep + 2);
  const rows = dimProduct
    .filter((p) => p.sku_id.startsWith(modelId + '__') && norm(p.romram) === rom && p.industry === scope.industry && p.countries.includes(scope.countryCode))
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
 * own-gap = 型号级结构预警：订阅内的华为系列按型号分组，组内 ≥2 档时按各档
 * 「最新有值周现价」升序做相邻对，间距低于阈值即报（不随产品覆写）。
 */
export function buildAlerts(cfg: AlertCfg): AlertItem[] {
  const currency = cfg.currency ?? 'usd';
  const scope = cfg.scope ?? DEFAULT_DATA_SCOPE;
  const provenance = cfg.provenance ?? REAL_ALERT_PROVENANCE;
  // 与其他取数入口保持一致：不支持的国家/产业不产生任何预警。
  if (!isDataScopeSupported(scope)) return [];
  // 持久化状态或外部调用可能带重复/空 key；重复订阅会导致重复事件，且 own-gap
  // 会把同一档位当成两档参与排序。先归一化一次，保证结果稳定且幂等。
  const subs = [...new Set(cfg.subs.filter((key): key is string => typeof key === 'string' && key.length > 0))];
  if (subs.length === 0) return [];
  // 当前事实表价格不挂店铺明细，国家由 dimChannel 的可用渠道承载；
  // 以可用国家作为事实数据门槛，同时按产品产业过滤，便于后续接入多国家数据。
  const countryAvailable = dimChannel.some((c) => c.country_code === scope.countryCode);
  if (!countryAvailable) return [];
  const out: AlertItem[] = [];
  // 各系列被隔离的周（own-gap「最新有值且可信周」同走可信链）
  const quarantinedBySeries = new Map<string, Set<string>>();
  const metaCache = new Map<string, AlertSeriesMeta | null>();
  const repSkuCache = new Map<string, string | null>();
  const spreadCache = new Map<string, { platform: string; price: number }[]>();
  const metaOf = (key: string): AlertSeriesMeta | null => {
    if (!metaCache.has(key)) metaCache.set(key, alertSeriesMeta(key, scope));
    return metaCache.get(key) ?? null;
  };
  const repOf = (key: string, meta: AlertSeriesMeta): string | null => {
    const cacheKey = `${key}|${scope.countryCode}|${scope.industry}|${currency}|${platformCacheKey(cfg.platform)}`;
    if (!repSkuCache.has(cacheKey)) {
      repSkuCache.set(cacheKey, representativeSkuForSelection(key.split('__')[0], meta.romram, scope, currency, cfg.platform));
    }
    return repSkuCache.get(cacheKey) ?? null;
  };
  for (const key of subs) {
    const meta = metaOf(key);
    if (!meta) continue;
    // 代表色单 SKU（第一百三十八轮口径对齐）：lowestPriceColorSku 最低价颜色，
    // 与看板默认取色/总览/多平台比价同源——预警「现价」与图上折线同一条线；
    // 无代表色 = 该系列无价格数据，整系列不产预警（原全色均值口径同样全周缺采）
    const repSkuId = repOf(key, meta);
    if (!repSkuId) continue;
    // ---- 异常价格守卫（2026-11-01 数据质量口径）：先整链取数 → 与 buildSeries 同一
    //      判定纯函数 → 隔离周不触发任何预警、也不进 prev 链（对上一**可信**点比较——
    //      脏点回弹的 ±60% 假「调价」预警正是本守卫要消灭的现实缺陷）。扫描链为
    //      代表色单 SKU 周价（与图面组均值链各自独立判定，同一规则同一公式）。 ----
    const weekRows: { w: (typeof timeAsc)[number]; price: number; rrp: number | null }[] = [];
    for (const w of timeAsc) {
      const hit = priceForSelection(repSkuId, w.week_id, scope.countryCode, cfg.platform ?? null, currency);
      if (!hit) continue; // 缺采：跳过（prev 跨周延续由下方的链式遍历承担）
      weekRows.push({ w, price: hit.price, rrp: displayRrpOf(hit.row, currency) });
    }
    const verdicts = detectSuspects(
      weekRows.map((r) => ({ bucketId: r.w.week_id, price: r.price, rrp: r.rrp, anchorDate: r.w.week_wed_date })),
      {
        rule: readAnomalyRule(),
        manual: anomalyManualOf(scope.countryCode, key),
        promoHit: promoBandHitOf(scope.countryCode),
      },
    );
    const quarantinedWeeks = new Set<string>();
    verdicts.forEach((v, i) => {
      if (v.state === 'quarantined' && weekRows[i]) quarantinedWeeks.add(weekRows[i].w.week_id);
    });
    quarantinedBySeries.set(key, quarantinedWeeks);
    let prevPrice: number | null = null;
    let prevIntensity: number | null = null;
    for (const row of weekRows) {
      const w = row.w;
      if (quarantinedWeeks.has(w.week_id)) continue; // 隔离周：不触发预警、不进 prev 链
      // 比率链（力度/环比/对 RRP）全部用未取整值——低价系列（如 $0.3x 配件）取整到 0
      // 会凭空算出 100% 折扣并使环比链恒假断链；取整只发生在展示字段
      const rrp = row.rrp;
      const intensity = rrp != null && rrp > 0 ? 1 - row.price / rrp : null;
      const base = {
        seriesKey: key,
        brand: meta.brand,
        modelName: meta.modelName,
        romram: meta.romram,
        isOwn: meta.isOwn,
        weekId: w.week_id,
        weekLabel: w.week_wed_date.slice(5),
        price: displayRound(row.price),
        rrp,
        vsRrpPct: rrp != null && rrp > 0 ? row.price / rrp - 1 : null,
        wowPct: prevPrice != null && prevPrice > 0 ? row.price / prevPrice - 1 : null,
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
        provenance,
      };
      const thr = (t: AlertType): number => effThreshold(cfg, key, t);
      const promoThreshold = positiveThreshold(thr('promo'));
      const priceThreshold = positiveThreshold(thr('price-change'));
      const platformThreshold = positiveThreshold(thr('platform-gap'));
      // 折扣预警（促销力度变化，双价齐全且前周也有力度）：|Δ力度| ≥ 阈值（阈值 ≤0 = 关）
      if (
        effEnabled(cfg, key, 'promo') &&
        promoThreshold != null &&
        intensity != null &&
        prevIntensity != null &&
        Math.abs(intensity - prevIntensity) >= promoThreshold - EPS
      ) {
        out.push({
          ...base,
          key: `${key}|${w.week_id}|promo`,
          type: 'promo',
          promoDeltaPp: (intensity - prevIntensity) * 100,
        });
      }
      // 调价预警（华为/竞品都出）：|WoW| ≥ 阈值（阈值 ≤0 = 关）
      if (effEnabled(cfg, key, 'price-change') && priceThreshold != null && prevPrice != null && prevPrice > 0) {
        const wow = row.price / prevPrice - 1;
        if (Math.abs(wow) >= priceThreshold - EPS) {
          out.push({
            ...base,
            key: `${key}|${w.week_id}|price-change`,
            type: 'price-change',
            wowPct: wow,
          });
        }
      }
      // 平台价差预警（仅华为品牌系列）：周内各平台独立价 最高/最低 − 1 ≥ 阈值（阈值 ≤0 = 关）
      if (effEnabled(cfg, key, 'platform-gap') && platformThreshold != null && meta.isOwn) {
        // 平台价差 = 该国该周各平台真实最低价的最高/最低 − 1（单平台国家无价差）；
        // 取价 SKU = 代表色（与上文现价同一条线，原字典序首色口径已对齐淘汰）
        const spreadKey = `${repSkuId}|${w.week_id}|${scope.countryCode}|${currency}`;
        const spread = spreadCache.get(spreadKey) ?? platformPriceSpread(repSkuId, w.week_id, scope.countryCode, currency);
        spreadCache.set(spreadKey, spread);
        const low = spread[0];
        const high = spread[spread.length - 1];
        const gap = spread.length >= 2 && low.price > 0 ? high.price / low.price - 1 : 0;
        if (gap >= platformThreshold - EPS) {
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
      prevPrice = row.price;
      prevIntensity = intensity;
    }
  }
  // 档位间距预警（追补⑨，型号级）：订阅内华为系列按型号分组，最新有值现价相邻对
  const ownGapThreshold = positiveThreshold(cfg.thresholds['own-gap']);
  if (cfg.enabled['own-gap'] && ownGapThreshold != null) {
    const latestOf = (key: string): { price: number; weekId: string; weekLabel: string } | null => {
      const meta = metaOf(key);
      if (!meta || !meta.isOwn) return null;
      // 档位间距同代表色口径：与上文现价/看板默认取色同一条线
      const repSkuId = repOf(key, meta);
      if (!repSkuId) return null;
      // 异常守卫（2026-11-01）：取最新「有值且可信」周（隔离周不算现价）
      const quarantined = quarantinedBySeries.get(key);
      for (let i = timeAsc.length - 1; i >= 0; i--) {
        const w = timeAsc[i];
        if (quarantined?.has(w.week_id)) continue;
        const hit = priceForSelection(repSkuId, w.week_id, scope.countryCode, cfg.platform ?? null, currency);
        // price 保持未取整：档位间距比值不吃取整误差（低价配件取整到 0 会把间距算飞）
        if (hit) return { price: hit.price, weekId: w.week_id, weekLabel: w.week_wed_date.slice(5) };
      }
      return null;
    };
    const byModel = new Map<string, string[]>();
    for (const key of subs) {
      const meta = metaOf(key);
      if (!meta?.isOwn) continue;
      const modelId = key.split('__')[0];
      const arr = byModel.get(modelId);
      if (arr) arr.push(key);
      else byModel.set(modelId, [key]);
    }
    for (const [modelId, keys] of byModel) {
      if (keys.length < 2) continue;
      const priced = keys
        .map((k) => ({ key: k, meta: metaOf(k)!, px: latestOf(k) }))
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
        if (gap < ownGapThreshold - EPS) {
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
            price: displayRound(low.px.price),
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
            pairLowPrice: displayRound(low.px.price),
            pairHighPrice: displayRound(high.px.price),
            ownGapPct: gap,
            pairHighSeriesKey: high.key,
            provenance,
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

/** Adapter-facing wrapper: callers can distinguish no scope, no triggers and
 * a failed calculation instead of treating every empty array as the same. */
export function buildAlertResult(cfg: AlertCfg): DataResult<AlertItem[]> {
  const provenance = cfg.provenance ?? REAL_ALERT_PROVENANCE;
  const scope = cfg.scope ?? DEFAULT_DATA_SCOPE;
  if (!isDataScopeSupported(scope)) {
    return {
      state: 'empty',
      provenance: { ...provenance, freshness: 'missing', asOf: null },
      reason: 'out_of_scope',
      message: '当前国家或产业没有可用的价格事实，暂时无法生成预警。',
    };
  }
  if (!cfg.subs.some((key) => typeof key === 'string' && key.length > 0)) {
    return {
      state: 'empty',
      provenance,
      reason: 'not_configured',
      message: '尚未配置监控产品，暂时没有可计算的预警范围。',
    };
  }
  try {
    return { state: 'ready', data: buildAlerts(cfg), provenance };
  } catch (error) {
    const message = error instanceof Error ? error.message : '预警计算失败。';
    return {
      state: 'error',
      provenance: errorProvenance(provenance.source, message),
      error: { code: 'ALERT_ENGINE_FAILED', message: '预警计算失败，请刷新后重试。', retryable: true },
    };
  }
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

// 处理层契约从独立模块 re-export，旧的 alerts.ts 单一入口调用方无需迁移。
export {
  alertAgentContextOf,
  alertIdOf,
  alertPriorityOf,
  alertPriorityScore,
  alertRuleVersionOf,
  bulkTransitionAlertRecords,
  contextFingerprintOf,
  evidenceOf,
  materializeAlertRecords,
  ruleSnapshotOf,
  summarizeAlertRecords,
  toAlertRecord,
  transitionAlertRecord,
} from './alertLifecycle';
export type {
  AlertAction,
  AlertActivity,
  AlertAgentContext,
  AlertEvidence,
  AlertEvidenceStatus,
  AlertLifecycle,
  AlertPriority,
  AlertRecord,
  AlertResolutionCode,
  AlertRuleSnapshot,
} from './alertLifecycle';
