// ============================================================
// 预警中心金测（第五十二轮建 / 第五十三轮扩三类 / 追补⑨四类独立阈值+own-gap）：
// 钉住 alerts.ts 的规则边界与确定性。数据 = src/data 造数产物（固定批次），
// 锚点随数据重生成需同步复核。
// ============================================================
import { describe, expect, it } from 'vitest';
import { dimProduct } from '../../data';
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
import { DEFAULT_DATA_SCOPE } from '../scope';

/** 任取一个我司系列 key（Pura 90s Pro 首个 ROM）与一个竞品系列 key */
const ownSku = dimProduct.find((p) => p.is_own && p.model_name === 'Pura 90s Pro')!;
const compSku = dimProduct.find((p) => !p.is_own && p.brand === 'APPLE')!;
const ownKey = seriesKeyOfSku(ownSku.sku_id);
const compKey = seriesKeyOfSku(compSku.sku_id);
const PURA_512 = seriesKeyOfSku(
  dimProduct.find((p) => p.is_own && p.model_name === 'Pura 90s Pro' && p.romram.startsWith('12+512'))!.sku_id,
);
const ALL_ON = { 'price-change': true, promo: true, 'platform-gap': true, 'own-gap': false };
const ALL_OFF = { 'price-change': false, promo: false, 'platform-gap': false, 'own-gap': false };

/** 三类共用阈值的旧口径配置（own-gap 关） */
const cfg = (subs: string[], thr: number, currency: 'usd' | 'local' = 'usd'): AlertCfg => ({
  subs,
  enabled: { ...ALL_ON },
  thresholds: { 'price-change': thr, promo: thr, 'platform-gap': thr, 'own-gap': 0.15 },
  currency,
});

describe('alertSeriesMeta / seriesKeyOfSku', () => {
  it('seriesKeyOfSku → modelId__romram去空格；meta 回查同组且 isOwn 正确', () => {
    expect(ownKey).toBe(`${ownSku.sku_id.split('__')[0]}__${ownSku.romram.replace(/\s+/g, '')}`);
    const meta = alertSeriesMeta(ownKey)!;
    expect(meta).not.toBeNull();
    expect(meta.isOwn).toBe(true);
    expect(meta.brand).toBe(ownSku.brand);
    expect(meta.label).toContain(ownSku.model_name);
    expect(alertSeriesMeta(compKey)!.isOwn).toBe(false);
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
    const only = (t: AlertCfg['enabled']['promo'] extends never ? never : string) =>
      buildAlerts({
        subs: [ownKey, compKey],
        enabled: { ...ALL_OFF, [t]: true },
        thresholds: { 'price-change': 0.02, promo: 0.02, 'platform-gap': 0.02, 'own-gap': 0.15 },
      });
    expect(only('price-change').every((a) => a.type === 'price-change')).toBe(true);
    expect(only('promo').every((a) => a.type === 'promo')).toBe(true);
    expect(only('platform-gap').every((a) => a.type === 'platform-gap')).toBe(true);
    expect(only('price-change').length).toBeGreaterThan(0);
  });

  it('按产品覆写：产品 A 关折扣、产品 B 覆写更严阈值（追补⑨）', () => {
    const base: AlertCfg = {
      subs: [ownKey, compKey],
      enabled: { ...ALL_ON },
      thresholds: { 'price-change': 0.02, promo: 0.02, 'platform-gap': 0.02, 'own-gap': 0.15 },
    };
    const withRule: AlertCfg = {
      ...base,
      products: {
        [ownKey]: { types: { promo: false } },
        [compKey]: { thresholds: { 'price-change': 0.1 } },
      },
    };
    const out = buildAlerts(withRule);
    expect(out.some((a) => a.type === 'promo' && a.seriesKey === ownKey)).toBe(false);
    const strict = out.filter((a) => a.type === 'price-change' && a.seriesKey === compKey);
    for (const a of strict) expect(Math.abs(a.wowPct!)).toBeGreaterThanOrEqual(0.1 - 1e-6);
    // 未覆写的键不受影响
    expect(out.some((a) => a.type === 'promo' && a.seriesKey === compKey)).toBe(true);
  });

  it('确定性：同入参两次调用逐字节一致', () => {
    const a = buildAlerts(cfg([ownKey, compKey], 0.05));
    const b = buildAlerts(cfg([ownKey, compKey], 0.05));
    expect(a).toEqual(b);
  });

  it('结构不变量：promo 必带力度差/VsRRP；price-change 必带 WoW（第五十三轮起我司也出）；platform-gap 仅我司', () => {
    const alerts = buildAlerts(cfg([ownKey, compKey], 0.02));
    expect(alerts.length).toBeGreaterThan(0);
    for (const a of alerts) {
      expect(a.key).toBe(`${a.seriesKey}|${a.weekId}|${a.type}`);
      expect(a.weekLabel).toMatch(/^\d{2}-\d{2}$/);
      if (a.type === 'promo') {
        expect(a.promoDeltaPp).not.toBeNull();
        expect(Math.abs(a.promoDeltaPp!)).toBeGreaterThanOrEqual(2 - 1e-6); // 阈值 2% = 2pp
        if (a.vsRrpPct != null && a.price != null && a.rrp) {
          expect(a.vsRrpPct).toBeCloseTo(a.price / a.rrp - 1, 6);
        }
      } else if (a.type === 'price-change') {
        expect(a.wowPct).not.toBeNull();
        expect(Math.abs(a.wowPct!)).toBeGreaterThanOrEqual(0.02 - 1e-6);
      } else {
        // 平台价差：仅我司品牌系列；价差 ≥ 阈值；高低平台齐全且价差自洽
        expect(alertSeriesMeta(a.seriesKey)!.isOwn).toBe(true);
        expect(a.gapPct).not.toBeNull();
        expect(a.gapPct!).toBeGreaterThanOrEqual(0.02 - 1e-6);
        expect(a.gapHighPlatform).not.toBeNull();
        expect(a.gapLowPlatform).not.toBeNull();
        expect(a.gapHighPrice!).toBeGreaterThan(a.gapLowPrice!);
        expect(a.gapHighPrice! / a.gapLowPrice! - 1).toBeCloseTo(a.gapPct!, 3);
      }
    }
  });

  it('平台价差 demo 口径：demo 因子价差上限 ~1.8% → 2% 阈值恒不触发、1.5% 有触发（M.Video 高 / OZON 低）', () => {
    const at2 = buildAlerts(cfg([ownKey], 0.02)).filter((a) => a.type === 'platform-gap');
    expect(at2.length).toBe(0);
    const at15 = buildAlerts(cfg([ownKey], 0.015)).filter((a) => a.type === 'platform-gap');
    expect(at15.length).toBeGreaterThan(0);
    for (const a of at15) {
      expect(a.gapLowPlatform).toBe('OZON'); // OZON = 基准恒最低（因子均 ≥ 0）
      expect(a.gapHighPlatform).toBe('M.Video'); // +1.5% > DNS +0.8%（抖动 ±0.3% 不改序）
    }
  });

  it('档位间距 own-gap（追补⑨）：Pura 90s Pro 两档间距 ~7.8% → 15% 触发、5% 不触发；成对字段自洽', () => {
    const cfgGap = (thr: number): AlertCfg => ({
      subs: [ownKey, PURA_512],
      enabled: { ...ALL_OFF, 'own-gap': true },
      thresholds: { 'price-change': 0, promo: 0, 'platform-gap': 0, 'own-gap': thr },
    });
    const at15 = buildAlerts(cfgGap(0.15)).filter((a) => a.type === 'own-gap');
    expect(at15.length).toBe(1);
    const g = at15[0];
    expect(g.pairLowLabel).toContain('12+256');
    expect(g.pairHighLabel).toContain('12+512');
    expect(g.pairHighSeriesKey).toBe(PURA_512);
    expect(g.pairHighPrice!).toBeGreaterThan(g.pairLowPrice!);
    expect(g.ownGapPct!).toBeCloseTo(g.pairHighPrice! / g.pairLowPrice! - 1, 6);
    expect(g.ownGapPct!).toBeLessThan(0.15);
    // 方向正确：间距 ≥ 阈值不触发
    expect(buildAlerts(cfgGap(0.05)).filter((a) => a.type === 'own-gap').length).toBe(0);
  });

  it('阈值单调：严阈值(15%)预警集 ⊆ 宽阈值(5%)预警集（全集订阅，两侧均非空）', () => {
    const keys = [...new Set(dimProduct.map((p) => seriesKeyOfSku(p.sku_id)))];
    const wide = new Set(buildAlerts(cfg(keys, 0.05)).map((a: AlertItem) => a.key));
    const strict = buildAlerts(cfg(keys, 0.15)).map((a) => a.key);
    expect(strict.length).toBeGreaterThan(0);
    for (const k of strict) expect(wide.has(k)).toBe(true);
  });

  it('币种只改展示价：触发集一致、价格按币种折算', () => {
    const usd = buildAlerts(cfg([compKey], 0.05));
    const rub = buildAlerts(cfg([compKey], 0.05, 'local'));
    expect(usd.map((a) => a.key)).toEqual(rub.map((a) => a.key));
    if (usd.length > 0) {
      expect(rub[0].price!).toBeGreaterThan(usd[0].price!); // ₽ ≈ 80×$
    }
  });

  it('作用域与平台口径：不支持作用域恒空；显式 DNS 使用确定性平台因子，缺省仍是 OZON 基准', () => {
    const baseCfg: AlertCfg = {
      ...cfg([compKey], 0.0001),
      enabled: { ...ALL_OFF, 'price-change': true },
      scope: DEFAULT_DATA_SCOPE,
    };
    const base = buildAlerts(baseCfg);
    const dnsCfg: AlertCfg = {
      ...baseCfg,
      platform: { platforms: ['DNS'], shopIds: [] },
    };
    const dns = buildAlerts(dnsCfg);
    // 同一配置必须逐字节稳定；平台抖动也不能引入非确定性。
    expect(dns).toEqual(buildAlerts(dnsCfg));
    const baseByKey = new Map(base.map((a) => [a.key, a]));
    const common = dns.filter((a) => baseByKey.has(a.key));
    expect(common.length).toBeGreaterThan(0);
    expect(common.some((a) => a.price !== baseByKey.get(a.key)!.price)).toBe(true);
    expect(buildAlerts({ ...baseCfg, scope: { countryCode: 'CN', industry: 'phone' } })).toEqual([]);
    // 显式传 null 与旧的缺省入参保持同一 OZON 基准口径。
    expect(buildAlerts({ ...baseCfg, platform: null })).toEqual(base);

    const gapCfg: AlertCfg = {
      ...cfg([ownKey], 0.015),
      enabled: { ...ALL_OFF, 'platform-gap': true },
      thresholds: { 'price-change': 0, promo: 0, 'platform-gap': 0.015, 'own-gap': 0.15 },
    };
    const gapBase = buildAlerts(gapCfg).filter((a) => a.type === 'platform-gap');
    const gapDns = buildAlerts({ ...gapCfg, platform: { platforms: ['DNS'], shopIds: [] } }).filter((a) => a.type === 'platform-gap');
    expect(gapDns.map((a) => a.key)).toEqual(gapBase.map((a) => a.key));
    expect(gapDns.map((a) => a.gapPct)).toEqual(gapBase.map((a) => a.gapPct));
  });

  it('排序：最新周在前（周 id 降序）', () => {
    const alerts = buildAlerts(cfg([ownKey, compKey], 0.02));
    for (let i = 1; i < alerts.length; i++) {
      expect(alerts[i - 1].weekId >= alerts[i].weekId).toBe(true);
    }
  });

  it('demo 数据在 5% 阈值下有真实预警可看（批次 2026-W41 锚：全 36 系列 910 条 = 降促 441 + 调价 469；调价含我司扩围 +64）', () => {
    const keys = [...new Set(dimProduct.map((p) => seriesKeyOfSku(p.sku_id)))];
    const alerts = buildAlerts(cfg(keys, 0.05));
    expect(alerts.length).toBe(910);
    expect(alerts.filter((a) => a.type === 'promo').length).toBe(441);
    expect(alerts.filter((a) => a.type === 'price-change').length).toBe(469);
    expect(alerts.filter((a) => a.type === 'platform-gap').length).toBe(0); // 5% 下平台价差不触发（上限 ~1.8%）
  });

  it('demo 数据在 1.5% 默认阈值下三类齐发（第五十三轮默认档锚：全 36 系列 2898 条 = 降促 1059 + 调价 1086 + 平台价差 753）', () => {
    const keys = [...new Set(dimProduct.map((p) => seriesKeyOfSku(p.sku_id)))];
    const alerts = buildAlerts(cfg(keys, 0.015));
    expect(alerts.length).toBe(2898);
    expect(alerts.filter((a) => a.type === 'promo').length).toBe(1059);
    expect(alerts.filter((a) => a.type === 'price-change').length).toBe(1086);
    expect(alerts.filter((a) => a.type === 'platform-gap').length).toBe(753);
  });
});

describe('groupAlertsBySeries / groupAlertsByWeek（预警中心重构）', () => {
  it('按系列聚合：own-gap 双归档（低价档与高价档各计一次），其余单归档', () => {
    const cfgGap: AlertCfg = {
      subs: [ownKey, PURA_512],
      enabled: { ...ALL_OFF, 'own-gap': true },
      thresholds: { 'price-change': 0, promo: 0, 'platform-gap': 0, 'own-gap': 0.15 },
    };
    const m = groupAlertsBySeries(buildAlerts(cfgGap));
    expect(m.get(ownKey)!.length).toBe(1);
    expect(m.get(PURA_512)!.length).toBe(1);
    expect(m.get(ownKey)![0].type).toBe('own-gap');
    expect(m.get(ownKey)![0].pairHighSeriesKey).toBe(PURA_512);
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
