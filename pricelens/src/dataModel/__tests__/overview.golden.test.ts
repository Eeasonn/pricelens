// 国家总览矩阵金测（2026-10-20 真实数据版）：锚定档位结构 / 排序 / 代表色 / 竞品映射 / 币种 / 平台口径。
// 作用域 = RU / phone（DEFAULT_DATA_SCOPE）。锚点优先从 factPriceWeekly / 维表独立直算；
// 钉死的数字均注明来源（dim_product.ref_price_usd / dim_benchmark / fact 最低价行）。
import { describe, expect, it } from 'vitest';
import { dimBenchmark, dimChannel, dimProduct, dimTime, dimTier, factPriceWeekly } from '../../data';
import { buildOverviewMatrix, lifecycleDeltaOf, TIER_LABELS, tierOrderOf } from '../aggregate';
import { DEFAULT_DATA_SCOPE } from '../scope';

const CC = 'RU';
const bands = buildOverviewMatrix('usd', undefined, null, DEFAULT_DATA_SCOPE);
const flatModels = bands.flatMap((b) => b.models);
const findModel = (modelId: string) => flatModels.find((m) => m.modelId === modelId)!;

/** fact 直算：某 SKU 某周在某平台集合内的最低 price_usd（与 latestOf 的取价口径同源、独立实现） */
function minUsdPriceAt(skuId: string, weekId: string, platform: string | null): number | null {
  const channels = dimChannel.filter((c) => c.country_code === CC && (platform == null || c.platform === platform));
  const ids = new Set(channels.map((c) => c.channel_id));
  const vals = factPriceWeekly
    .filter((r) => r.sku_id === skuId && r.week_id === weekId && ids.has(r.channel_id) && r.price_usd != null)
    .map((r) => r.price_usd!);
  return vals.length ? Math.min(...vals) : null;
}

describe('buildOverviewMatrix 金测', () => {
  it('档位带：完整覆盖 phone 阶梯（真实数据六档全有产品），顺序 = 阶梯高 → 低', () => {
    expect(bands.map((b) => b.tierCode)).toEqual([...tierOrderOf('phone')].reverse());
    expect(bands.map((b) => b.tierCode)).toEqual(['1000+', '800-1000', '600-800', '400-600', '200-400', '<200']);
    expect(bands.every((b) => b.models.length > 0)).toBe(true); // 空档不输出
  });

  it('各带型号数锚点（RU phone 实况：我司 20 + 竞品 83 = 103 型号全覆盖）', () => {
    expect(bands.map((b) => b.models.length)).toEqual([33, 5, 12, 21, 23, 9]);
    expect(flatModels.filter((m) => m.isOwn)).toHaveLength(20);
    expect(flatModels.filter((m) => !m.isOwn)).toHaveLength(83);
    // 覆盖完备：矩阵型号数 = 维表中 RU 有事实行的 phone 型号数
    const ruPhoneModels = new Set(
      dimProduct.filter((p) => p.industry === 'phone' && p.countries.includes(CC)).map((p) => p.model_id),
    );
    expect(flatModels).toHaveLength(ruPhoneModels.size);
  });

  it('带内按上市参考价（ref_price_usd）降序：1000+ 首位 iPhone Duo（$4 023.1），首位我司 = Mate XT', () => {
    const top = bands[0].models;
    expect(top[0].modelName).toBe('iPhone Duo');
    expect(top[0].launchPriceUsd).toBe(4023.1); // dim_product.ref_price_usd
    expect(top[0].isOwn).toBe(false);
    expect(top.find((m) => m.isOwn)!.modelName).toBe('Mate XT');
    // 排序不变量：launchPriceUsd 降序，同价按名称字典序
    for (let i = 1; i < top.length; i++) {
      expect(top[i - 1].launchPriceUsd).toBeGreaterThanOrEqual(top[i].launchPriceUsd);
      if (top[i - 1].launchPriceUsd === top[i].launchPriceUsd) {
        expect(top[i - 1].modelName.localeCompare(top[i].modelName)).toBeLessThanOrEqual(0);
      }
    }
  });

  it('Pura 90s Pro Max 12+256（RU 默认我司机型）：行现价降序、代表色行价格锚定最新周 DNS 真实最低价', () => {
    const pura = findModel('own-huawei-pura-90s-pro-max');
    expect(pura.isOwn).toBe(true);
    expect(pura.rows.map((r) => r.romram)).toEqual(['12+512 GB', '12+256 GB']); // 现价降序（1142 > 1021）
    const row = pura.rows[1];
    expect(row.skuId).toBe('own-huawei-pura-90s-pro-max__12-256gb__black'); // 默认渠道最低价色
    expect(row.asOfWeek).toBe('202642'); // 最新采数周
    // 85 799 ₽ / 84.04（行内汇率）= 1 020.93 —— fact 该周 DNS 渠道行
    expect(row.price).toBe(1020.93);
    expect(row.rrp).toBe(1020.93); // 官网价 = 成交价（无折扣）
    expect(row.discountPct).toBe(0);
    expect(row.colors).toHaveLength(4); // Black / Gold / Orange / Purple 颜色次级菜单全量
    expect(row.points).toHaveLength(dimTime.length); // 序列 = dim_time 全 24 周（缺采 = null 点）
    expect(row.maxV!).toBeCloseTo(Math.max(...row.points.map((p) => p.price).filter((v): v is number => v != null)), 6);
    expect(row.minV!).toBeCloseTo(Math.min(...row.points.map((p) => p.price).filter((v): v is number => v != null)), 6);
    // 与 fact 直算同源
    expect(row.price).toBe(minUsdPriceAt(row.skuId, '202642', 'DNS'));
  });

  it('竞品映射：Pura 90s Pro Max 并集 4 行、主竞品（iPhone 17 Pro，sort=1）在前；映射与 dim_benchmark 一致', () => {
    const pura = findModel('own-huawei-pura-90s-pro-max');
    expect(pura.comps.map((c) => c.skuId)).toEqual([
      'cmp-apple-iphone-17-pro__12-512gb__blue',
      'cmp-apple-iphone-17-pro__12-256gb__blue',
      'cmp-samsung-s26-ultra__12-512gb__black',
      'cmp-samsung-s26-ultra__12-256gb__black',
    ]);
    expect(pura.comps[0].primary).toBe(true);
    expect(pura.comps[0].ownRomrams).toEqual(['12+512 GB']);
    // 独立直算：comp 集合 = RU 矩阵中该型号的全部竞品 SKU；ownRomrams = 映射到的我司配置并集
    const benchRows = dimBenchmark.filter((b) => b.country_code === CC && b.own_model_id === 'own-huawei-pura-90s-pro-max');
    expect(new Set(pura.comps.map((c) => c.skuId))).toEqual(new Set(benchRows.map((b) => b.competitor_sku_id)));
    for (const c of pura.comps) {
      expect(c.ownRomrams).toEqual(
        [...new Set(benchRows.filter((b) => b.competitor_sku_id === c.skuId).map((b) => b.own_romram))].sort(),
      );
    }
    // 竞品行带颜色清单：含自身代表 SKU（颜色次级菜单）
    const c0 = pura.comps[0];
    expect(c0.colors.length).toBeGreaterThanOrEqual(2);
    expect(c0.colors.some((c) => c.skuId === c0.skuId)).toBe(true);
  });

  it('未建对标的型号 comps 为空（RU 矩阵无 Mate X6 / Pura 80 Ultra 行）；benchmark 入参可整体置空', () => {
    expect(findModel('own-huawei-mate-x6').comps).toEqual([]);
    expect(findModel('own-huawei-pura-80-ultra').comps).toEqual([]);
    const empty = buildOverviewMatrix('usd', [], null, DEFAULT_DATA_SCOPE);
    expect(empty.flatMap((b) => b.models).find((m) => m.modelId === 'own-huawei-pura-90s-pro-max')!.comps).toEqual([]);
  });

  it('生命周期（模型全 SKU 口径）：等于 lifecycleDeltaOf 独立计算；真实数据口径为「首销季 → 末季季均折后价(本币)」', () => {
    const pura = findModel('own-huawei-pura-90s-pro-max');
    const allSkuIds = dimProduct.filter((p) => p.model_id === 'own-huawei-pura-90s-pro-max').map((p) => p.sku_id);
    expect(pura.lifecyclePct).toBe(lifecycleDeltaOf(allSkuIds, CC)!.pct);
    // 锚点：上市周 RRP 83 299 ₽（202631）→ 末季季均 85 0xx ₽，现价略高于首销季（+1.7%）
    expect(+(pura.lifecyclePct! * 100).toFixed(1)).toBe(1.7);
    // 竞品型号不出生命周期
    expect(findModel('cmp-apple-iphone-17-pro').lifecyclePct).toBeNull();
  });

  it('币种自洽：₽ 口径 = USD 口径 × 行内汇率（85 799 / 84.04 = 1 020.93）', () => {
    const rub = buildOverviewMatrix('local', undefined, null, DEFAULT_DATA_SCOPE);
    const usdRow = findModel('own-huawei-pura-90s-pro-max').rows[1];
    const rubRow = rub.flatMap((b) => b.models).find((m) => m.modelId === 'own-huawei-pura-90s-pro-max')!.rows[1];
    expect(rubRow.price).toBe(85799); // fact price_local 直读（本币不折算）
    const fxRow = factPriceWeekly.find(
      (r) => r.sku_id === usdRow.skuId && r.week_id === '202642' && r.channel_id === 'RU:dns:独立站',
    )!;
    expect(rubRow.price!).toBeCloseTo(usdRow.price! * fxRow.fx, 1); // 行内汇率折算往返自洽
  });

  it('确定性：同币种两次调用逐字节一致', () => {
    expect(JSON.stringify(buildOverviewMatrix('usd', undefined, null, DEFAULT_DATA_SCOPE))).toBe(
      JSON.stringify(buildOverviewMatrix('usd', undefined, null, DEFAULT_DATA_SCOPE)),
    );
  });

  it('平台筛选进矩阵口径 = 真实平台最低价（无因子）：Mate X7 16+512 该 M.Video 低于默认 DNS', () => {
    const rowOf = (m: ReturnType<typeof buildOverviewMatrix>) =>
      m.flatMap((b) => b.models).find((x) => x.modelId === 'own-huawei-mate-x7')!.rows[0]; // 16+512 GB
    const dns = rowOf(buildOverviewMatrix('usd', undefined, null, DEFAULT_DATA_SCOPE)); // 缺省 = RU 默认平台 DNS
    const mv = rowOf(buildOverviewMatrix('usd', undefined, { platforms: ['M.Video'], shopIds: [] }, DEFAULT_DATA_SCOPE));
    const all = rowOf(
      buildOverviewMatrix('usd', undefined, { platforms: ['DNS', 'M.Video'], shopIds: [] }, DEFAULT_DATA_SCOPE),
    );
    // 锚（202642 fact 直算）：DNS 1 588.52 / M.Video 1 570.67 —— 真实数据无固定平台高低序
    expect(dns.price).toBe(minUsdPriceAt('own-huawei-mate-x7__16-512gb__black', '202642', 'DNS'));
    expect(mv.price).toBe(minUsdPriceAt('own-huawei-mate-x7__16-512gb__black', '202642', 'M.Video'));
    expect(mv.price!).toBeLessThan(dns.price!);
    // 多平台并选取渠道内最低价：并集 = 两平台最小
    expect(all.price).toBe(Math.min(dns.price!, mv.price!));
    // RRP 随行（真实抓取：各渠道行自带 rrp_local）——DNS 官网价=成交价 1 588.52；
    // M.Video 划线价 159 999₽/84.04 = 1 903.84，成交价 131 999₽ → 折扣率 <0
    expect(dns.rrp).toBe(1588.52);
    expect(mv.rrp).toBe(1903.84);
    expect(mv.price!).toBeCloseTo((131999 / 84.04), 2);
    // 迷你图同长，数值随平台不同
    expect(mv.points.length).toBe(dns.points.length);
    expect(mv.points.some((p, i) => p.price !== dns.points[i].price)).toBe(true);
  });

  it('TIER_LABELS 跨产业平铺（dim_tier 全部档位），tierOrderOf(phone) 为六档阶梯', () => {
    expect(tierOrderOf('phone')).toEqual(['<200', '200-400', '400-600', '600-800', '800-1000', '1000+']);
    const allCodes = new Set(Object.values(dimTier.ladders).flat());
    expect(Object.keys(TIER_LABELS).sort()).toEqual([...allCodes].sort());
    expect(TIER_LABELS['1000+']).toBe('旗舰 · $1000+');
  });

  it('作用域：不支持的国家恒空；SA（另一启用国）可出矩阵', () => {
    expect(buildOverviewMatrix('usd', undefined, null, { countryCode: 'CN', industry: 'phone' })).toEqual([]);
    const sa = buildOverviewMatrix('usd', undefined, null, { countryCode: 'SA', industry: 'phone' });
    expect(sa.length).toBeGreaterThan(0);
    expect(sa.flatMap((b) => b.models).every((m) => m.isOwn || m.modelId.includes('cmp-'))).toBe(true);
  });
});
