// ============================================================
// 预警中心金测（2026-10-20 真实数据版）：
// 钉住 alerts.ts 的规则边界与确定性。数据 = scripts/ingest_real.py 产物的真实爬取价；
// demo 因子口径（平台价差上限 1.8%、固定 −10.3% 生命周期锚）已删，锚点改为
// 从 factPriceWeekly / platformPriceSpread 独立直算。作用域 = RU / phone。
// ============================================================
import { describe, expect, it } from 'vitest';
import { dimProduct, dimRegion } from '../../data';
import {
  alertSeriesMeta,
  buildAlerts,
  groupAlertsBySeries,
  groupAlertsByWeek,
  latestAlerts,
  latestByType,
  seriesKeyOfSku,
  type AlertCfg,
  type AlertItem,
} from '../alerts';
import { platformPriceSpread } from '../aggregate';

const SCOPE = { countryCode: 'RU', industry: 'phone' } as const;

// 华为锚系列 = HUAWEI nova 14 12+256 GB：RU 有 DNS/OZON/M.Video 多平台真实行、22 个采数周，
// 四类规则均可观察（价格波动 + 真实跨平台价差）。
const ownSku = dimProduct.find((p) => p.sku_id === 'own-huawei-nova-14__12-256gb__black')!;
const ownKey = seriesKeyOfSku(ownSku.sku_id); // own-huawei-nova-14__12+256GB
// 竞品锚系列 = iPhone 17 Pro 12+256 GB（RU 矩阵主竞品之一，全周期在采）
const compSku = dimProduct.find((p) => p.sku_id === 'cmp-apple-iphone-17-pro__12-256gb__blue')!;
const compKey = seriesKeyOfSku(compSku.sku_id);
// RU 默认华为机型 Pura 90s Pro Max 的两档（own-gap 结构锚：最新现价 1 021 vs 1 142 USD）
const PURA_256 = seriesKeyOfSku(dimProduct.find((p) => p.sku_id === 'own-huawei-pura-90s-pro-max__12-256gb__black')!.sku_id);
const PURA_512 = seriesKeyOfSku(dimProduct.find((p) => p.sku_id === 'own-huawei-pura-90s-pro-max__12-512gb__black')!.sku_id);

const ALL_ON = { 'price-change': true, promo: true, 'platform-gap': true, 'own-gap': false };
const ALL_OFF = { 'price-change': false, promo: false, 'platform-gap': false, 'own-gap': false };

const cfg = (subs: string[], thr: number, currency: 'usd' | 'local' = 'usd'): AlertCfg => ({
  subs,
  enabled: { ...ALL_ON },
  thresholds: { 'price-change': thr, promo: thr, 'platform-gap': thr, 'own-gap': 0.15 },
  currency,
  scope: SCOPE,
});

/** 全 RU-phone 订阅集（预警中心「全开」档的真实规模 = 200 个系列） */
const ALL_KEYS = [...new Set(dimProduct.filter((p) => p.industry === 'phone' && p.countries.includes('RU')).map((p) => seriesKeyOfSku(p.sku_id)))];

describe('alertSeriesMeta / seriesKeyOfSku', () => {
  it('seriesKeyOfSku → modelId__romram去空格；meta 回查同组且 isOwn 正确', () => {
    expect(ownKey).toBe(`${ownSku.sku_id.split('__')[0]}__${ownSku.romram.replace(/\s+/g, '')}`);
    const meta = alertSeriesMeta(ownKey)!;
    expect(meta).not.toBeNull();
    expect(meta.isOwn).toBe(true);
    expect(meta.brand).toBe(ownSku.brand);
    expect(meta.label).toContain(ownSku.model_name);
    expect(meta.skuId).toBe(ownSku.sku_id); // 代表 SKU = 组内字典序首个
    expect(alertSeriesMeta(compKey)!.isOwn).toBe(false);
  });

  it('meta 按作用域过滤：phone 作用域下 tablet 系列 = null，tablet 作用域可回查', () => {
    const tabSku = dimProduct.find((p) => p.is_own && p.industry === 'tablet' && p.countries.includes('RU'))!;
    const tabKey = seriesKeyOfSku(tabSku.sku_id);
    expect(alertSeriesMeta(tabKey)).toBeNull(); // 缺省作用域 RU/phone
    expect(alertSeriesMeta(tabKey, { countryCode: 'RU', industry: 'tablet' })!.isOwn).toBe(true);
  });

  it('未知 key / 非法 key = null（不抛错）', () => {
    expect(alertSeriesMeta('no-such-model__12+256')).toBeNull();
    expect(alertSeriesMeta('without-separator')).toBeNull();
  });
});

describe('buildAlerts 规则边界', () => {
  it('空订阅 / 阈值 0 → 恒空（阈值必须为正）', () => {
    expect(buildAlerts(cfg([], 0.05))).toEqual([]);
    expect(buildAlerts(cfg([ownKey, compKey], 0))).toEqual([]);
    expect(buildAlerts(cfg([ownKey, compKey], -0.1))).toEqual([]);
  });

  it('类型开关：只开一类只出该类（追补⑨）', () => {
    const only = (t: 'price-change' | 'promo' | 'platform-gap') =>
      buildAlerts({
        subs: [ownKey, compKey],
        enabled: { ...ALL_OFF, [t]: true },
        thresholds: { 'price-change': 0.02, promo: 0.02, 'platform-gap': 0.02, 'own-gap': 0.15 },
        scope: SCOPE,
      });
    expect(only('price-change').every((a) => a.type === 'price-change')).toBe(true);
    expect(only('promo').every((a) => a.type === 'promo')).toBe(true);
    expect(only('platform-gap').every((a) => a.type === 'platform-gap')).toBe(true);
    expect(only('price-change').length).toBeGreaterThan(0);
    expect(only('platform-gap').length).toBeGreaterThan(0); // 真实跨平台价差可触发
  });

  it('按产品覆写：产品 A 关折扣、产品 B 覆写更严阈值（追补⑨）', () => {
    const base: AlertCfg = {
      subs: [ownKey, compKey],
      enabled: { ...ALL_ON },
      thresholds: { 'price-change': 0.02, promo: 0.02, 'platform-gap': 0.02, 'own-gap': 0.15 },
      scope: SCOPE,
    };
    // 阳性对照：基线里确实存在两条会被覆写掉的输出
    const baseOut = buildAlerts(base);
    expect(baseOut.some((a) => a.type === 'promo' && a.seriesKey === compKey)).toBe(true);
    expect(baseOut.filter((a) => a.type === 'price-change' && a.seriesKey === ownKey).length).toBeGreaterThan(0);
    const withRule: AlertCfg = {
      ...base,
      products: {
        [compKey]: { types: { promo: false } },
        [ownKey]: { thresholds: { 'price-change': 0.1 } },
      },
    };
    const out = buildAlerts(withRule);
    expect(out.some((a) => a.type === 'promo' && a.seriesKey === compKey)).toBe(false);
    const strict = out.filter((a) => a.type === 'price-change' && a.seriesKey === ownKey);
    expect(strict.length).toBeGreaterThan(0);
    for (const a of strict) expect(Math.abs(a.wowPct!)).toBeGreaterThanOrEqual(0.1 - 1e-6);
    // 未覆写的维度不受影响：竞品仍可出调价（2% 档）
    expect(out.some((a) => a.type === 'price-change' && a.seriesKey === compKey)).toBe(true);
  });

  it('确定性：同入参两次调用逐字节一致', () => {
    const a = buildAlerts(cfg([ownKey, compKey], 0.05));
    const b = buildAlerts(cfg([ownKey, compKey], 0.05));
    expect(a).toEqual(b);
  });

  it('结构不变量：promo 必带力度差；price-change 必带 WoW；platform-gap 仅华为且高低平台与 spread 直算一致', () => {
    const alerts = buildAlerts(cfg([ownKey, compKey], 0.02));
    expect(alerts.length).toBeGreaterThan(0);
    for (const a of alerts) {
      expect(a.key).toBe(`${a.seriesKey}|${a.weekId}|${a.type}`);
      expect(a.weekLabel).toMatch(/^\d{2}-\d{2}$/);
      if (a.type === 'promo') {
        expect(a.promoDeltaPp).not.toBeNull();
        expect(Math.abs(a.promoDeltaPp!)).toBeGreaterThanOrEqual(2 - 1e-6); // 阈值 2% = 2pp
        if (a.vsRrpPct != null && a.price != null && a.rrp) {
          // price 为展示取整，vsRrpPct 按未取整价算（第一百三十九轮口径修复）：
          // 容差 = 取整半步 / 价位（~$200 起 ≤ 0.00025）
          expect(a.vsRrpPct).toBeCloseTo(a.price / a.rrp - 1, 3);
        }
      } else if (a.type === 'price-change') {
        expect(a.wowPct).not.toBeNull();
        expect(Math.abs(a.wowPct!)).toBeGreaterThanOrEqual(0.02 - 1e-6);
      } else {
        // 平台价差：仅华为品牌系列；字段与 platformPriceSpread 独立直算一致
        expect(alertSeriesMeta(a.seriesKey, SCOPE)!.isOwn).toBe(true);
        expect(a.gapPct).not.toBeNull();
        expect(a.gapPct!).toBeGreaterThanOrEqual(0.02 - 1e-6);
        const spread = platformPriceSpread(metaSkuOf(a.seriesKey), a.weekId, 'RU', 'usd');
        expect(spread.length).toBeGreaterThanOrEqual(2);
        expect(a.gapLowPlatform).toBe(spread[0].platform);
        expect(a.gapHighPlatform).toBe(spread[spread.length - 1].platform);
        expect(a.gapLowPrice).toBe(Math.round(spread[0].price));
        expect(a.gapHighPrice).toBe(Math.round(spread[spread.length - 1].price));
        expect(a.gapHighPrice!).toBeGreaterThan(a.gapLowPrice!);
        // gapPct 按未取整价计算，字段价已取整：±1 价差在 ~$300 价位 ≈ ±0.0035，容差取 0.01
        expect(a.gapHighPrice! / a.gapLowPrice! - 1).toBeCloseTo(a.gapPct!, 1);
      }
    }
  });

  it('平台价差真实口径：nova 14 12+256 @2% 触发 11 条，仅落多平台并存周；单平台周（如 202641 纯 DNS）不触发', () => {
    const gaps = buildAlerts(cfg([ownKey], 0.02)).filter((a) => a.type === 'platform-gap');
    expect(gaps.length).toBe(11); // fact 实况：22 个采数周中 11 周该系列存在 ≥2 平台且价差 ≥2%
    expect(new Set(gaps.map((a) => a.weekId)).has('202641')).toBe(false); // 该周只有 DNS 行 → 无价差
    for (const a of gaps) {
      const spread = platformPriceSpread(ownSku.sku_id, a.weekId, 'RU', 'usd');
      expect(spread.length).toBeGreaterThanOrEqual(2);
      expect(a.gapLowPrice!).toBeLessThanOrEqual(a.gapHighPrice!);
    }
    // 阈值升到 10%：仍触发的周必然真实价差 ≥10%（如 202640：OZON 258.62 / DNS 339.37 ≈ +31.2%）
    const at10 = buildAlerts(cfg([ownKey], 0.1)).filter((a) => a.type === 'platform-gap');
    expect(at10.length).toBeGreaterThan(0);
    expect(at10.length).toBeLessThan(gaps.length);
    for (const a of at10) expect(a.gapPct!).toBeGreaterThanOrEqual(0.1 - 1e-6);
  });

  it('档位间距 own-gap（追补⑨）：Pura 90s Pro Max 两档最新现价间距 ~11.9% → 15% 触发、5% 不触发；成对字段自洽', () => {
    const cfgGap = (thr: number): AlertCfg => ({
      subs: [PURA_256, PURA_512],
      enabled: { ...ALL_OFF, 'own-gap': true },
      thresholds: { 'price-change': 0, promo: 0, 'platform-gap': 0, 'own-gap': thr },
      scope: SCOPE,
    });
    const at15 = buildAlerts(cfgGap(0.15)).filter((a) => a.type === 'own-gap');
    expect(at15.length).toBe(1);
    const g = at15[0];
    expect(g.pairLowLabel).toContain('12+256');
    expect(g.pairHighLabel).toContain('12+512');
    expect(g.pairHighSeriesKey).toBe(PURA_512);
    expect(g.pairHighPrice!).toBeGreaterThan(g.pairLowPrice!);
    // 锚点：最新周（202642）现价 1 021 / 1 142 USD（DNS 渠道，fact 直算）
    expect(g.pairLowPrice).toBe(1021);
    expect(g.pairHighPrice).toBe(1142);
    // ownGapPct 按未取整价比（第一百三十九轮），pair 价为展示取整：容差 1e-3
    expect(g.ownGapPct!).toBeCloseTo(g.pairHighPrice! / g.pairLowPrice! - 1, 3);
    expect(g.ownGapPct!).toBeCloseTo(0.1189, 3);
    // 方向正确：间距 ≥ 阈值不触发
    expect(buildAlerts(cfgGap(0.05)).filter((a) => a.type === 'own-gap').length).toBe(0);
  });

  it('阈值单调：严阈值(15%)预警集 ⊆ 宽阈值(5%)预警集（全 RU-phone 订阅，两侧均非空）', () => {
    const wide = new Set(buildAlerts(cfg(ALL_KEYS, 0.05)).map((a: AlertItem) => a.key));
    const strict = buildAlerts(cfg(ALL_KEYS, 0.15)).map((a) => a.key);
    expect(strict.length).toBeGreaterThan(0);
    for (const k of strict) expect(wide.has(k)).toBe(true);
  });

  it('币种只改展示价：触发集一致、₽ 价格按行内汇率高于 $（≠ 固定 ×80）', () => {
    const usd = buildAlerts(cfg([compKey], 0.05));
    const rub = buildAlerts(cfg([compKey], 0.05, 'local'));
    expect(usd.map((a) => a.key)).toEqual(rub.map((a) => a.key));
    expect(usd.length).toBeGreaterThan(0);
    expect(rub[0].price!).toBeGreaterThan(usd[0].price!);
    const ratio = rub[0].price! / usd[0].price!;
    expect(ratio).toBeGreaterThan(70); // 2026-05..10 RUB 行内汇率区间 73.81..85.45
    expect(ratio).toBeLessThan(90);
  });

  it('作用域与平台口径：不支持作用域恒空；RU 缺省平台 = DNS，显式 DNS 与缺省同口径、显式 OZON 改取价不改价差', () => {
    const baseCfg: AlertCfg = {
      subs: [ownKey, compKey],
      enabled: { ...ALL_OFF, 'price-change': true, 'platform-gap': true },
      thresholds: { 'price-change': 0.02, promo: 0.02, 'platform-gap': 0.02, 'own-gap': 0.15 },
      scope: SCOPE,
    };
    const base = buildAlerts(baseCfg);
    // 同一配置必须逐字节稳定
    expect(base).toEqual(buildAlerts(baseCfg));
    // RU 默认平台 = DNS（dim_region.core_platforms[0]）→ 显式 DNS 与缺省逐字节同口径
    const dns = buildAlerts({ ...baseCfg, platform: { platforms: ['DNS'], shopIds: [] } });
    expect(dns).toEqual(base);
    // 显式传 null 与缺省入参同口径
    expect(buildAlerts({ ...baseCfg, platform: null })).toEqual(base);
    // 显式 OZON：调价取价随渠道变化（nova 14 该周 OZON 明显低于 DNS）
    const ozon = buildAlerts({ ...baseCfg, platform: { platforms: ['OZON'], shopIds: [] } });
    const baseByKey = new Map(base.map((a) => [a.key, a]));
    const common = ozon.filter((a) => baseByKey.has(a.key));
    expect(common.length).toBeGreaterThan(0);
    expect(common.some((a) => a.price !== baseByKey.get(a.key)!.price)).toBe(true);
    // 平台价差预警与渠道选择无关（各国全平台独立最低价口径）：keys 与 gapPct 不变
    const gapOf = (xs: AlertItem[]) => xs.filter((a) => a.type === 'platform-gap');
    expect(gapOf(ozon).map((a) => [a.key, a.gapPct])).toEqual(gapOf(base).map((a) => [a.key, a.gapPct]));
    // 不支持作用域恒空
    expect(buildAlerts({ ...baseCfg, scope: { countryCode: 'CN', industry: 'phone' } })).toEqual([]);
    expect(dimRegion.find((r) => r.country_code === 'CN')?.enabled ?? false).toBe(false);
  });

  it('排序：最新周在前（周 id 降序）', () => {
    const alerts = buildAlerts(cfg([ownKey, compKey], 0.02));
    for (let i = 1; i < alerts.length; i++) {
      expect(alerts[i - 1].weekId >= alerts[i].weekId).toBe(true);
    }
  });

  it('真实数据全量锚（200 系列 @2%）：1652 条 = 调价 1367 + 平台价差 219 + 降促 66', () => {
    // 2026-10-23：比率链改未取整价（第一百三十九轮口径修复，低价系列取整到 0
    // 曾制造假预警/断链）——调价/降促触发集随之变化；平台价差计数不变（锚系列单色）。
    // 本轮：低侧异常价守卫剔除 RU W19 DNS 独立站脏批（12 个 HONOR 系列 W19 假价
    // $1.83~$25.7），其在 W20 制造的 12 条假调价 + 1 条假降促随之消失；平台价差计数不变。
    const alerts = buildAlerts(cfg(ALL_KEYS, 0.02));
    expect(ALL_KEYS.length).toBe(200); // RU phone 全部 系列×配置
    expect(alerts.length).toBe(1652);
    expect(alerts.filter((a) => a.type === 'price-change').length).toBe(1367);
    expect(alerts.filter((a) => a.type === 'platform-gap').length).toBe(219); // 真实跨平台价差普遍存在
    expect(alerts.filter((a) => a.type === 'promo').length).toBe(66);
  });

  it('真实数据全量锚 @5%：899 条（调价 662 + 平台价差 175 + 降促 62）；放开 own-gap 加 9 条档位间距', () => {
    const alerts = buildAlerts(cfg(ALL_KEYS, 0.05));
    expect(alerts.length).toBe(899);
    expect(alerts.filter((a) => a.type === 'price-change').length).toBe(662);
    expect(alerts.filter((a) => a.type === 'platform-gap').length).toBe(175);
    expect(alerts.filter((a) => a.type === 'promo').length).toBe(62);
    const withGap = buildAlerts({ ...cfg(ALL_KEYS, 0.05), enabled: { ...ALL_ON, 'own-gap': true }, thresholds: { 'price-change': 0.05, promo: 0.05, 'platform-gap': 0.05, 'own-gap': 0.15 } });
    expect(withGap.filter((a) => a.type === 'own-gap').length).toBe(9); // 多档华为机型的贴近档位对
    expect(withGap.length).toBe(908);
  });
});

describe('groupAlertsBySeries / groupAlertsByWeek（预警中心重构）', () => {
  it('按系列聚合：own-gap 双归档（低价档与高价档各计一次），其余单归档', () => {
    const cfgGap: AlertCfg = {
      subs: [PURA_256, PURA_512],
      enabled: { ...ALL_OFF, 'own-gap': true },
      thresholds: { 'price-change': 0, promo: 0, 'platform-gap': 0, 'own-gap': 0.15 },
      scope: SCOPE,
    };
    const m = groupAlertsBySeries(buildAlerts(cfgGap));
    expect(m.get(PURA_256)!.length).toBe(1);
    expect(m.get(PURA_512)!.length).toBe(1);
    expect(m.get(PURA_256)![0].type).toBe('own-gap');
    expect(m.get(PURA_256)![0].pairHighSeriesKey).toBe(PURA_512);
  });

  it('按周分组：保序（周降序、周内原序）、weekLabel 组内一致、拼接还原全量', () => {
    const alerts = buildAlerts(cfg([ownKey, compKey], 0.02));
    const weeks = groupAlertsByWeek(alerts);
    for (let i = 1; i < weeks.length; i++) expect(weeks[i - 1].weekId > weeks[i].weekId).toBe(true);
    for (const w of weeks) for (const a of w.items) expect(a.weekLabel).toBe(w.weekLabel);
    expect(weeks.flatMap((w) => w.items.map((a) => a.key))).toEqual(alerts.map((a) => a.key));
    expect(groupAlertsByWeek([])).toEqual([]);
  });

  it('最新态（第五十五轮）：每系列×类型只留最新一条；latestByType 行内去重适配 own-gap 双归档', () => {
    const alerts = buildAlerts(cfg([ownKey, compKey], 0.02));
    const latest = latestAlerts(alerts);
    // 每个 (seriesKey, type) 恰好一条，且都是该对在全量中的首条（= 最新周）
    const pairSet = new Set(latest.map((a) => `${a.seriesKey}|${a.type}`));
    expect(pairSet.size).toBe(latest.length);
    for (const a of latest) {
      const first = alerts.find((x) => x.seriesKey === a.seriesKey && x.type === a.type);
      expect(first!.key).toBe(a.key);
    }
    // 单系列行内去重：首条即最新
    const perOwn = latestByType(alerts.filter((a) => a.seriesKey === compKey));
    const types = perOwn.map((a) => a.type);
    expect(new Set(types).size).toBe(types.length);
    expect(latestAlerts([])).toEqual([]);
    expect(latestByType([])).toEqual([]);
  });
});

/** 系列 key → 代表 SKU（与 alertSeriesMeta 的代表 SKU 同规则：组内字典序首个；仅供结构不变量回查） */
function metaSkuOf(seriesKey: string): string {
  const sep = seriesKey.indexOf('__');
  const modelId = seriesKey.slice(0, sep);
  const rom = seriesKey.slice(sep + 2);
  return dimProduct
    .filter((p) => p.sku_id.startsWith(modelId + '__') && p.romram.replace(/\s+/g, '') === rom)
    .sort((a, b) => a.sku_id.localeCompare(b.sku_id))[0].sku_id;
}
