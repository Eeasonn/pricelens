// ============================================================
// 「现价与落档」纯模型测试（2026-11-27 口径，见 dataModel/tierPrice.ts 头注）：
// pickCurrentPrice 剔除规则 / priceBandOf 阶梯边界 / neighborBands 相邻档
// 全部确定性断言；latestPricePoints / currentTierOfSelection 锚真实数据——
// 锚点从事实表独立直算（与 aggregatePlatform.test.ts 同手法），随数据重生成自动对齐。
// ============================================================
import { describe, expect, it } from 'vitest';
import {
  currentPriceOf,
  currentPricesByGroup, groupKeyOf,
  currentTierOfSelection,
  latestPricePoints,
  neighborBands,
  pickCurrentPrice,
  priceBandOf,
  type PricePoint,
} from '../tierPrice';
import { dimProduct, factPriceMonthly, factPriceWeekly } from '../../data';

const pt = (usd: number, over: Partial<PricePoint> = {}): PricePoint => ({
  usd,
  local: null,
  sku: 'sku-a',
  channel: 'ch-1',
  ...over,
});

describe('pickCurrentPrice（规则 3-4：异常剔除 + 最低现价）', () => {
  it('空点集 → 全 null，period 透传', () => {
    expect(pickCurrentPrice([], null)).toEqual({ usd: null, local: null, period: null, points: 0, dropped: [] });
    expect(pickCurrentPrice([], '202648').period).toBe('202648');
  });

  it('单点永不剔除（哪怕价格再低）', () => {
    const r = pickCurrentPrice([pt(40, { local: 800 })], '202648');
    expect(r.usd).toBe(40);
    expect(r.local).toBe(800);
    expect(r.points).toBe(1);
    expect(r.dropped).toEqual([]);
  });

  it('[100,100,40] → 40 低于均值 30% 以上被剔除，现价 100', () => {
    // 均值 80，阈值 56；40 < 56 剔除
    const r = pickCurrentPrice([pt(100), pt(100), pt(40)], '202648');
    expect(r.usd).toBe(100);
    expect(r.points).toBe(3);
    expect(r.dropped).toHaveLength(1);
    expect(r.dropped[0].usd).toBe(40);
  });

  it('[100,95,90] → 无剔除，现价 = 最低 90，并带出同一行本币价', () => {
    // 均值 95，阈值 66.5；全部 ≥ 阈值
    const r = pickCurrentPrice([pt(100, { local: 2000 }), pt(95, { local: 1900 }), pt(90, { local: 1800 })], '202648');
    expect(r.usd).toBe(90);
    expect(r.local).toBe(1800);
    expect(r.dropped).toEqual([]);
  });

  it('恰为均值 70% 的点不剔除（严格小于才剔除）', () => {
    // 两点 [70, 100]：均值 85，阈值 59.5，都不剔 → 构造恰 70%：均值 m，x = 0.7m
    // 用 [x, y] 使 x = 0.7 × (x+y)/2 → 2x = 0.7x + 0.7y → 1.3x = 0.7y → y = 13/7 x
    // 取 x = 70, y = 130：均值 100，阈值 70，70 恰不剔
    const r = pickCurrentPrice([pt(70), pt(130)], '202648');
    expect(r.dropped).toEqual([]);
    expect(r.usd).toBe(70);
  });

  it('剔除后现价取剩余点的最低值，且带出该最低行而非剔除行', () => {
    const r = pickCurrentPrice([pt(200, { local: 4000 }), pt(210, { local: 4200 }), pt(50, { local: 1000 })], '202648');
    // 均值 ≈153.3，阈值 ≈107.3；50 剔除
    expect(r.usd).toBe(200);
    expect(r.local).toBe(4000);
  });
});

describe('priceBandOf（规则 1+5：USD 落档，min 含 max 不含）', () => {
  it('phone 阶梯边界：199.99→<200，200→200-400，400→400-600，1000→1000+', () => {
    expect(priceBandOf('phone', 199.99)).toBe('<200');
    expect(priceBandOf('phone', 200)).toBe('200-400');
    expect(priceBandOf('phone', 400)).toBe('400-600');
    expect(priceBandOf('phone', 599.99)).toBe('400-600');
    expect(priceBandOf('phone', 1000)).toBe('1000+');
    expect(priceBandOf('phone', 999.99)).toBe('800-1000');
    expect(priceBandOf('phone', 1500)).toBe('1000+');
    expect(priceBandOf('phone', 0)).toBe('<200');
  });

  it('null → null（暂无现价）', () => {
    expect(priceBandOf('phone', null)).toBeNull();
  });
});

describe('neighborBands（阶梯 ±1 档）', () => {
  it('底端 lower=null：phone <200', () => {
    expect(neighborBands('phone', '<200')).toEqual({ lower: null, upper: '200-400' });
  });

  it('顶端 upper=null：phone 1000+', () => {
    expect(neighborBands('phone', '1000+')).toEqual({ lower: '800-1000', upper: null });
  });

  it('中间档两侧齐全：phone 400-600', () => {
    expect(neighborBands('phone', '400-600')).toEqual({ lower: '200-400', upper: '600-800' });
  });

  it('未知档 → 双 null', () => {
    expect(neighborBands('phone', 'not-a-tier')).toEqual({ lower: null, upper: null });
  });
});

describe('latestPricePoints / currentPriceOf（规则 2，锚真实数据）', () => {
  it('周度市场：cmp-samsung-s26 黑色 SKU 在 MX 的最新期 = 事实表 max week，点数与手工过滤一致', () => {
    const sku = 'cmp-samsung-s26__12-256gb__black';
    const rows = factPriceWeekly.filter((r) => r.country_code === 'MX' && r.sku_id === sku && r.price_usd != null);
    expect(rows.length).toBeGreaterThan(0);
    const maxWeek = rows.reduce((m, r) => (r.week_id > m ? r.week_id : m), rows[0].week_id);
    const expected = rows.filter((r) => r.week_id === maxWeek);

    const { period, points } = latestPricePoints([sku], 'MX');
    expect(period).toBe(maxWeek);
    expect(points).toHaveLength(expected.length);
    // 逐点与事实行对齐（sku/channel/seller/usd/local 同源）
    const key = (p: { sku: string; channel: string; seller?: string; usd: number }) => `${p.sku}|${p.channel}|${p.seller ?? ''}|${p.usd}`;
    expect(points.map(key).sort()).toEqual(
      expected.map((r) => `${r.sku_id}|${r.channel_id}|${r.seller}|${r.price_usd}`).sort(),
    );
    // currentPriceOf 串联：period 相同、现价 = 该期剔除后最低 usd
    const cur = currentPriceOf([sku], 'MX');
    expect(cur.period).toBe(maxWeek);
    expect(cur.points).toBe(expected.length);
    const manual = pickCurrentPrice(points, maxWeek);
    expect(cur.usd).toBe(manual.usd);
  });

  it('ZA（运营商小册子）：prepaid 行最新期 = max period_id，installment 行不进点集', () => {
    const sku = 'za-booklet-apple-watchseries11__42mmgps';
    const prepaid = factPriceMonthly.filter(
      (r) => r.country_code === 'ZA' && r.sku_id === sku && r.price_type === 'prepaid' && r.price_usd != null,
    );
    expect(prepaid.length).toBeGreaterThan(0);
    const maxPeriod = prepaid.reduce((m, r) => (r.period_id > m ? r.period_id : m), prepaid[0].period_id);
    const expected = prepaid.filter((r) => r.period_id === maxPeriod);

    const { period, points } = latestPricePoints([sku], 'ZA');
    expect(period).toBe(maxPeriod);
    expect(points).toHaveLength(expected.length);
    // 该 SKU 确有 installment 行（证明剔除真的在起作用，而不是数据里恰好没有）
    const installments = factPriceMonthly.filter(
      (r) => r.country_code === 'ZA' && r.sku_id === sku && r.price_type === 'installment' && r.price_usd != null && r.period_id === maxPeriod,
    );
    expect(installments.length).toBeGreaterThan(0);
    expect(points.every((p) => p.usd > 0)).toBe(true);
  });

  it('无价格点 → period null、空集', () => {
    expect(latestPricePoints(['nonexistent-sku'], 'MX')).toEqual({ period: null, points: [] });
  });
});

describe('currentTierOfSelection（型号 × 配置组 → 现价落档，锚真实数据）', () => {
  it('cmp-samsung-s26 12+256 GB 在 MX：tier = 组内现价落入的 phone 档，skuIds = 该国全部颜色 SKU', () => {
    const rows = dimProduct.filter((p) => p.model_id === 'cmp-samsung-s26' && p.romram.replace(/\s+/g, '') === '12+256GB' && p.countries.includes('MX'));
    expect(rows.length).toBeGreaterThan(0);
    const { tier, price } = currentTierOfSelection({ modelId: 'cmp-samsung-s26', romram: '12+256 GB', skuIds: [] }, 'MX');
    // 与手工串联同口径：全部颜色 SKU 集取价 → 落档
    const manual = currentPriceOf(rows.map((p) => p.sku_id), 'MX');
    expect(price).toEqual(manual);
    expect(tier).toBe(priceBandOf('phone', manual.usd));
    expect(tier).not.toBeNull(); // 该型号在 MX 有价（数据重生成后若无价，本断言随之提示口径漂移）
    // romram 空白差异不敏感（norm 归一）
    const spaced = currentTierOfSelection({ modelId: 'cmp-samsung-s26', romram: '12+256  GB', skuIds: [] }, 'MX');
    expect(spaced.price).toEqual(price);
  });

  it('该国无覆盖 SKU → tier null、空裁定', () => {
    // s26 不在 BR 覆盖（countries 无 BR）
    const rows = dimProduct.filter((p) => p.model_id === 'cmp-samsung-s26' && p.countries.includes('BR'));
    expect(rows).toHaveLength(0);
    const { tier, price } = currentTierOfSelection({ modelId: 'cmp-samsung-s26', romram: '12+256 GB', skuIds: [] }, 'BR');
    expect(tier).toBeNull();
    expect(price).toEqual({ usd: null, local: null, period: null, points: 0, dropped: [] });
  });
});

describe('currentPricesByGroup（批量：一遍扫描，逐组与 currentTierOfSelection 一致）', () => {
  it('phone/MX：抽查若干真实组，批量结果与逐组裁定逐项一致（tier/price/sel）', () => {
    const batch = currentPricesByGroup('phone', 'MX');
    // 批量覆盖 dimProduct 中该产业覆盖该国的全部组
    const expectedGroups = new Set(
      dimProduct.filter((p) => p.industry === 'phone' && p.countries.includes('MX')).map((p) => groupKeyOf(p.model_id, p.romram)),
    );
    expect(new Set(batch.keys())).toEqual(expectedGroups);
    // 抽查：有价的 s26 组 + 另外至多 4 个组逐一对账
    const sample = ['cmp-samsung-s26__12-256gb__black']
      .map((sku) => dimProduct.find((p) => p.sku_id === sku))
      .filter((p): p is NonNullable<typeof p> => p != null)
      .concat(dimProduct.filter((p) => p.industry === 'phone' && p.countries.includes('MX')).slice(0, 4));
    const seen = new Set<string>();
    for (const row of sample) {
      const key = groupKeyOf(row.model_id, row.romram);
      if (seen.has(key)) continue;
      seen.add(key);
      const entry = batch.get(key);
      expect(entry).toBeDefined();
      const single = currentTierOfSelection({ modelId: row.model_id, romram: row.romram, skuIds: [] }, 'MX');
      expect(entry!.tier).toBe(single.tier);
      expect(entry!.price).toEqual(single.price);
      expect(entry!.sel.modelId).toBe(row.model_id);
      expect(entry!.sel.romram).toBe(row.romram);
    }
  });

  it('phone/RU：批量与逐组一致（周度市场第二个国家抽查）', () => {
    const batch = currentPricesByGroup('phone', 'RU');
    const rows = dimProduct.filter((p) => p.industry === 'phone' && p.countries.includes('RU')).slice(0, 3);
    for (const row of rows) {
      const key = groupKeyOf(row.model_id, row.romram);
      const single = currentTierOfSelection({ modelId: row.model_id, romram: row.romram, skuIds: [] }, 'RU');
      expect(batch.get(key)?.price).toEqual(single.price);
      expect(batch.get(key)?.tier).toBe(single.tier);
    }
  });

  it('wearable/ZA：运营商小册子市场批量结果与逐组一致（prepaid 口径）', () => {
    const batch = currentPricesByGroup('wearable', 'ZA');
    expect(batch.size).toBeGreaterThan(0);
    const key = [...batch.keys()].find((k) => (batch.get(k)?.price.points ?? 0) > 0);
    expect(key).toBeDefined();
    const [modelId, romram] = key!.split('|');
    const single = currentTierOfSelection({ modelId, romram, skuIds: [] }, 'ZA');
    expect(batch.get(key!)!.price).toEqual(single.price);
    expect(batch.get(key!)!.tier).toBe(single.tier);
  });
});
