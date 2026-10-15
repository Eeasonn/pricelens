// 国家总览矩阵金测（第三十七轮）：锚定档位结构 / 排序 / 代表色 / 竞品映射 / 极值 / 币种
import { describe, expect, it } from 'vitest';
import { buildOverviewMatrix, TIER_LABELS } from '../aggregate';

describe('buildOverviewMatrix 金测', () => {
  const bands = buildOverviewMatrix('usd');

  it('档位带：从高到低五个带，600-800 无产品不输出', () => {
    expect(bands.map((b) => b.tierCode)).toEqual(['1000+', '800-1000', '400-600', '200-400', '<200']);
  });

  it('各带型号数锚点（我司 14 + 竞品 26 = 40 型号全覆盖）', () => {
    expect(bands.map((b) => b.models.length)).toEqual([17, 5, 7, 10, 1]);
    expect(bands.flatMap((b) => b.models).filter((m) => m.isOwn)).toHaveLength(14);
    expect(bands.flatMap((b) => b.models).filter((m) => !m.isOwn)).toHaveLength(26);
  });

  it('带内按上市价降序：1000+ 首位 Mate XT（$2374）', () => {
    const top = bands[0].models;
    expect(top[0].modelName).toBe('Mate XT');
    expect(top[0].launchPriceUsd).toBe(2374);
    expect(top.map((m) => m.modelName)).toEqual([
      'Mate XT',
      'Galaxy Z Fold7',
      'Mate X7',
      'iPhone 17 Pro',
      'Galaxy S25 Ultra',
      'Galaxy S26 Ultra',
      'Magic V5',
      'Mate X6',
      'iPhone 16 Pro',
      'Pura 80 Ultra',
      'Galaxy S26+',
      'Galaxy S25+',
      'iPhone 17',
      'Magic 8 Pro',
      'Galaxy S26',
      'iPhone 16',
      'Magic 7 Pro',
    ]);
  });

  it('Mate X7：4 ROM 行现价降序，代表色行价格/极值锚点，序列 93 周全周期', () => {
    const x7 = bands[0].models.find((m) => m.modelId === 'own-mate-x7')!;
    expect(x7.rows.map((r) => r.romram)).toEqual(['16+1TB', '16+512 GB', '12+512 GB', '12+256 GB']);
    const top = x7.rows[0];
    expect(top.price).toBe(2468);
    expect(top.rrp).toBe(2500);
    expect(top.points).toHaveLength(93);
    expect(top.maxV).toBe(2500);
    expect(top.maxIdx).toBe(47);
    expect(top.minV).toBe(2285);
    expect(top.minIdx).toBe(84);
    expect(top.lineColor).toBe('#c7000b');
  });

  it('Pura 90s Pro 12+256：代表色 = 最低价色 Orange，$835/RRP $875，折扣率 ≈ −4.6%', () => {
    const pura = bands[1].models.find((m) => m.modelId === 'own-pura-90s-pro')!;
    const row = pura.rows.find((r) => r.romram.startsWith('12+256'))!;
    expect(row.skuId.endsWith('__Orange')).toBe(true);
    expect(row.price).toBe(835);
    expect(row.rrp).toBe(875);
    expect(row.discountPct).toBeCloseTo(835 / 875 - 1, 12);
    expect(row.colors).toHaveLength(4); // 颜色次级菜单全量
  });

  it('竞品映射：Pura 90s Pro 并集 4 行、主竞品在前；Honor 600 跨 ROM 聚合 ownRomrams', () => {
    const pura = bands[1].models.find((m) => m.modelId === 'own-pura-90s-pro')!;
    expect(pura.comps.map((c) => c.skuId)).toEqual([
      'cmp-iphone-17__8+512GB__Black',
      'cmp-iphone-17__8+256GB__Black',
      'cmp-galaxy-s26__12+512GB__Black',
      'cmp-galaxy-s26__12+256GB__Black',
    ]);
    expect(pura.comps[0].primary).toBe(true);
    expect(pura.comps[0].ownRomrams).toEqual(['12+512 GB']); // 8+512 只对标我司 12+512

    const nova15 = bands[2].models.find((m) => m.modelId === 'own-nova-15')!;
    const honor = nova15.comps.find((c) => c.modelName === 'Honor 600')!;
    expect(honor.ownRomrams).toEqual(['12+256 GB', '12+512 GB']);
    expect(honor.primary).toBe(false);
  });

  it('未建对标的型号 comps 为空：Mate X6 / Pura 80 Ultra', () => {
    const x6 = bands[0].models.find((m) => m.modelId === 'own-mate-x6')!;
    const p80u = bands[0].models.find((m) => m.modelId === 'own-pura-80-ultra')!;
    expect(x6.comps).toEqual([]);
    expect(p80u.comps).toEqual([]);
  });

  it('生命周期锚点（模型全 SKU 口径）：Pura 80 Pro ≈ −10.1% / nova 15 ≈ −14.9%', () => {
    const p80 = bands[1].models.find((m) => m.modelId === 'own-pura-80-pro')!;
    const n15 = bands[2].models.find((m) => m.modelId === 'own-nova-15')!;
    expect(+(p80.lifecyclePct! * 100).toFixed(1)).toBe(-10.1);
    expect(+(n15.lifecyclePct! * 100).toFixed(1)).toBe(-14.9);
    expect(bands[0].models.find((m) => m.modelId === 'cmp-galaxy-s26-ultra')!.lifecyclePct).toBeNull();
  });

  it('币种：₽ 口径 Pura 90s Pro 12+256 = 66 800（同一 SKU 两口径 ×80 汇率自洽）', () => {
    const rub = buildOverviewMatrix('local');
    const row = rub[1].models.find((m) => m.modelId === 'own-pura-90s-pro')!.rows.find((r) => r.romram.startsWith('12+256'))!;
    expect(row.price).toBe(66800);
  });

  it('确定性：同币种两次调用逐字节一致', () => {
    expect(JSON.stringify(buildOverviewMatrix('usd'))).toBe(JSON.stringify(buildOverviewMatrix('usd')));
  });

  it('第四十四轮：竞品行带颜色清单（含对标 SKU）；外部 benchmark 参数生效', () => {
    const pura = bands[1].models.find((m) => m.modelId === 'own-pura-90s-pro')!;
    const c0 = pura.comps[0];
    expect(c0.colors.length).toBeGreaterThanOrEqual(2);
    expect(c0.colors.some((c) => c.skuId === c0.skuId)).toBe(true);
    const empty = buildOverviewMatrix('usd', []);
    expect(empty[1].models.find((m) => m.modelId === 'own-pura-90s-pro')!.comps).toEqual([]);
  });

  it('TIER_LABELS 六档齐全', () => {
    expect(Object.keys(TIER_LABELS)).toEqual(['1000+', '800-1000', '600-800', '400-600', '200-400', '<200']);
  });

  it('第五十一轮：平台筛选进矩阵口径——OZON 基准不变；DNS/M.Video 按因子抬价（与看板 buildSeries 同源）', () => {
    const puraOf = (m: ReturnType<typeof buildOverviewMatrix>) =>
      m[1].models.find((x) => x.modelId === 'own-pura-90s-pro')!.rows.find((r) => r.romram.startsWith('12+256'))!;
    const ozon = puraOf(buildOverviewMatrix('usd'));
    const dns = puraOf(buildOverviewMatrix('usd', undefined, { platforms: ['DNS'], shopIds: [] }));
    const mv = puraOf(buildOverviewMatrix('usd', undefined, { platforms: ['M.Video'], shopIds: [] }));
    expect(ozon.price).toBe(835); // 基准平台无因子（旧口径不变）
    // 折后价过 applyPlatform（+0.8% / +1.5% 因子 ± 0.3% 固定 seed 抖动）；RRP 官方阶梯不随平台
    expect(dns.price! / ozon.price!).toBeGreaterThanOrEqual(1.005);
    expect(dns.price! / ozon.price!).toBeLessThanOrEqual(1.011);
    expect(mv.price! / ozon.price!).toBeGreaterThanOrEqual(1.012);
    expect(mv.price! / ozon.price!).toBeLessThanOrEqual(1.018);
    expect(dns.rrp).toBe(ozon.rrp);
    // 迷你图序列同长同形，数值随平台
    expect(dns.points.length).toBe(ozon.points.length);
    expect(dns.points.some((p, i) => p.price !== ozon.points[i].price)).toBe(true);
    // 多平台并选取均值口径与看板一致（介于 OZON 与 M.Video 之间）
    const all = puraOf(buildOverviewMatrix('usd', undefined, { platforms: ['OZON', 'DNS', 'M.Video'], shopIds: [] }));
    expect(all.price!).toBeGreaterThanOrEqual(ozon.price!);
    expect(all.price!).toBeLessThanOrEqual(mv.price!);
  });
});
