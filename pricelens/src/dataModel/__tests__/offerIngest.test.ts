// ============================================================
// offer 原表归一引擎单测（2026-11-18 数据包 v3「原表模式」）：
// 与 scripts/ingest_real.py + patch_dim_categories.py 逐字对齐的关键分支——
// 双语表头/同义列、手机/平板拆列、穿戴三分支（升维/唯一尺寸剥词/大·小脏行）、
// 规格拆列形态（Category1/2/info）、汇率倒挂自愈、去重保留最低价、别名与
// 系列规则配置表、YYYY0WW 周期。纯函数直调，不触数据集与 localStorage。
// ============================================================
import { describe, expect, it } from 'vitest';
import { buildFromOffers, parseRomram, type OfferSourceRow } from '../offerIngest';
import { normkey } from '../ingestText';
import type { DimRegion } from '../types';

const REGION_BASE: DimRegion[] = [
  {
    region_code: 'EURASIA', region_name: '欧亚', country_code: 'RU', country_name: 'R国',
    enabled: false, sort: 29, currency: 'RUB', core_platforms: ['DNS', 'OZON'],
    default_platform: 'DNS', default_own_models: {},
  },
  {
    region_code: 'EU', region_name: '欧洲', country_code: 'DE', country_name: '德国',
    enabled: false, sort: 2, currency: 'EUR', core_platforms: [], default_platform: null, default_own_models: {},
  },
];

/** 最小原样行（默认 RU 手机 12+512 GB Mate 80 Pro DNS 一行；字段覆盖式重写） */
const baseRow = (over: Partial<OfferSourceRow> = {}): OfferSourceRow => ({
  时间周期: '2026-10-21',
  品类: '手机',
  品牌: 'HUAWEI',
  型号: 'Mate 80 Pro',
  型号规格: '12+512 GB Black',
  平台: 'DNS',
  '国家/地区': 'R国',
  店铺类型: '官网',
  店铺名称: 'DNS 数字',
  显示店铺名称: 'DNS 官网',
  '平台建议零售价-本币': 89999,
  '平台成交价-本币': 79999,
  货币: 'RUB',
  汇率: 80,
  是否组合销售: 'N',
  分期付款: '',
  促销政策: '',
  网址链接: 'u1',
  截图命名: 's1',
  采集时间: '2026-10-21 10:00:00',
  ...over,
});

const run = (rows: OfferSourceRow[], ctx?: Partial<Parameters<typeof buildFromOffers>[1]>) =>
  buildFromOffers(rows, {
    seriesRules: null, modelAliasRows: null, tierLadders: null, promoRows: null, benchmarkRows: null,
    regionBase: REGION_BASE, ...ctx,
  });

describe('parseRomram（拆列三分支）', () => {
  it('phone：RAM+ROM+颜色 / 裸 ROM 两种形态', () => {
    expect(parseRomram('phone', '12+512 GB Black')).toEqual({ romram: '12+512 GB', romKey: '12+512gb', color: 'Black', colorKey: 'Black' });
    expect(parseRomram('phone', '12+1T 黑色')).toEqual({ romram: '12+1 TB', romKey: '12+1tb', color: '黑色', colorKey: '黑色' });
    expect(parseRomram('phone', '256 GB Starlight')).toEqual({ romram: '256 GB', romKey: '256gb', color: 'Starlight', colorKey: 'Starlight' });
  });
  it('tablet：尺寸+存储保留在 romram，联网方式塌缩进颜色', () => {
    const parts = parseRomram('tablet', '12.2"/WIFI/8+256 GB Black');
    expect(parts.romram).toBe('12.2" 8+256 GB');
    expect(parts.color).toBe('WiFi');
    expect(parts.romKey).toBe('12.2inwifi8+256gb');
  });
  it("wearable：尺寸+联网整体进 color 变体，romram 塌缩为型号级", () => {
    const parts = parseRomram('wearable', '46mm GPS Black');
    expect(parts.romram).toBe('—');
    expect(parts.color).toBe('46mm GPS Black');
    expect(parts.romKey).toBe('46mmgps');
  });
  it("空规格 → std 与破折号（D2 空行补色走源侧，引擎不造颜色）", () => {
    expect(parseRomram('wearable', '')).toEqual({ romram: '—', romKey: 'std', color: '—', colorKey: '—' });
  });
});

describe('列名归一', () => {
  it('双语表头（换行）与同义列（规格→型号规格）都收', () => {
    const result = run([
      { '时间周期\nperiod': '2026-10-21', 品类: '手机', 品牌: 'HUAWEI', 型号: 'Mate 80 Pro', 规格: '12+512 GB Black', 平台: 'DNS', '国家/地区': 'R国', 店铺类型: '官网', 货币: 'RUB', 汇率: 80 },
    ]);
    expect(result.factRows).toHaveLength(1);
    expect(result.dims.product[0].romram).toBe('12+512 GB');
  });
  it('缺核心必备列 → 报错列出缺项', () => {
    expect(() => run([{ 时间周期: '2026-10-21', 品类: '手机' }])).toThrow(/缺少必要字段/);
  });
  it('tech_date YYYY0WW 形态归一成 YYYYWW', () => {
    const result = run([baseRow({ 时间周期: '2026043' })]);
    expect(result.factRows[0].week_id).toBe('202643');
  });
});

describe('规格拆列形态（Category1/Category2/info）', () => {
  it('穿戴：Category1 即维度（直升表盘），GT 6 Pro 空 cat1 = 型号级', () => {
    const result = run([
      baseRow({ 品类: '穿戴', 型号: 'Watch GT 6', 型号规格: '', Category1: '46mm', Category2: '', info: 'Black' }),
      baseRow({ 品类: '穿戴', 型号: 'Watch GT 6', 型号规格: '', Category1: '42mm', Category2: '', info: 'Black' }),
      baseRow({ 品类: '穿戴', 型号: 'Watch GT 6 Pro', 型号规格: '', Category1: '', Category2: '', info: 'Black' }),
    ]);
    const bySku = new Map(result.dims.product.map((p) => [p.sku_id, p]));
    expect(bySku.get('own-huawei-watch-gt-6__46mm__black')!.romram).toBe('46mm');
    expect(bySku.get('own-huawei-watch-gt-6__42mm__black')!.romram).toBe('42mm');
    const pro = bySku.get('own-huawei-watch-gt-6-pro__std__black')!;
    expect(pro.romram).toBe('—');
    expect(pro.cat1).toBeNull();
  });
  it('平板：cat2 屏幕并入 romram 前缀、cat1 存储', () => {
    const result = run([baseRow({ 品类: '平板', 型号: 'MatePad Pro', 型号规格: '', Category1: '8+256 GB', Category2: '13.2', info: 'Black' })]);
    const p = result.dims.product[0];
    expect(p.romram).toBe('13.2" 8+256 GB');
    expect(p.cat2).toBe('13.2"');
    expect(p.cat1).toBe('8+256 GB');
  });
});

describe('穿戴三分支（patch_dim_categories 口径）', () => {
  it("唯一尺寸：剥词不作维度（GT 6 Pro 口径）", () => {
    const result = run([baseRow({ 品类: '穿戴', 型号: 'Watch GT 6 Pro', 型号规格: '46mm Black' })]);
    expect(result.dims.product[0].romram).toBe('—');
    expect(result.dims.product[0].color).toBe('Black');
  });
  it('「大/小」脏行：正身行已覆盖该国 → 剔行', () => {
    const result = run([
      baseRow({ 品类: '穿戴', 型号: 'Watch 6', 型号规格: '46mm Black' }),
      baseRow({ 品类: '穿戴', 型号: 'Watch 6', 型号规格: '大' }),
    ]);
    expect(result.factRows).toHaveLength(1);
    expect(result.diag.droppedBy['穿戴脏色行(正身已覆盖)']).toBe(1);
  });
  it('「大/小」脏行：无正身覆盖（该国唯一价格载体）→ 保留清洗', () => {
    const result = run([baseRow({ 品类: '穿戴', 型号: 'Watch 6', 型号规格: '大', '国家/地区': '德国' })]);
    expect(result.factRows).toHaveLength(1);
    expect(result.factRows[0].country_code).toBe('DE');
    expect(result.diag.fixed['穿戴脏色行清洗保留']).toBe(1);
  });
});

describe('行清洗与派生', () => {
  it('汇率倒挂自愈：常态 ≥1 币种出现 <1 行 → 取倒数（组中位数参照，单行组不可辨）', () => {
    const result = run([
      baseRow({ '平台成交价-本币': 70000, '平台建议零售价-本币': 80000 }),
      baseRow({ 汇率: 0.0125 }),
    ]);
    expect(result.diag.fixed['汇率倒挂(取倒数)']).toBe(1);
    // 两行同键同刻 → 去重保留最低价（70000 行），修复后两行汇率同为 80
    expect(result.factRows).toHaveLength(1);
    expect(result.factRows[0].price_local).toBe(70000);
    expect(result.factRows[0].fx).toBe(80);
  });
  it('去重：同键同刻保留最低价', () => {
    const result = run([
      baseRow({ '平台成交价-本币': 88999 }),
      baseRow(),
    ]);
    expect(result.factRows).toHaveLength(1);
    expect(result.factRows[0].price_local).toBe(79999);
  });
  it('未知国家行剔除并计数', () => {
    const result = run([baseRow({ '国家/地区': '火星' }), baseRow()]);
    expect(result.factRows).toHaveLength(1);
    expect(result.diag.droppedBy['未知国家']).toBe(1);
  });
  it('渠道：平台别名归并（mvm→Mvideo）+ 官网→独立站 + channel_id 形态', () => {
    const result = run([baseRow({ 平台: 'mvm', 店铺类型: '官网' })]);
    expect(result.dims.channel[0].channel_id).toBe('RU:mvideo:独立站');
    expect(result.dims.channel[0].store_type).toBe('独立站');
  });
  it('地区重算：有事实国家 enabled + 货币众数', () => {
    const result = run([baseRow()]);
    const ru = result.dims.region.find((r) => r.country_code === 'RU')!;
    const de = result.dims.region.find((r) => r.country_code === 'DE')!;
    expect(ru.enabled).toBe(true);
    expect(de.enabled).toBe(false);
    expect(ru.currency).toBe('RUB');
  });
  it('2026-11-18 审计 P1-1：品牌大小写混杂 → 统一大写后仍判我司（prefixOf 不再翻车）', () => {
    const result = run([baseRow({ 品牌: 'Huawei' }), baseRow({ 品牌: 'huawei', 平台: 'OZON', 店铺名称: 'OZON 店', 显示店铺名称: 'OZON 店' })]);
    expect(result.dims.product.every((p) => p.is_own)).toBe(true);
    expect(result.dims.product.every((p) => p.model_id.startsWith('own-huawei-'))).toBe(true);
    // 同一品牌两种写法不分裂：两行同键或同型号，model_id 全一致
    expect(new Set(result.dims.product.map((p) => p.model_id)).size).toBe(1);
    expect(result.dims.product[0].brand).toBe('HUAWEI');
  });
  it('2026-11-18 审计 P1-2：空「型号」行剔除并计数（不再生成 *-x 幻影型号）', () => {
    const result = run([baseRow({ 型号: '' }), baseRow({ 型号: '  ' }), baseRow()]);
    expect(result.factRows).toHaveLength(1);
    expect(result.diag.droppedBy['无型号']).toBe(2);
    expect(result.dims.product.every((p) => !/-x__/.test(p.sku_id))).toBe(true);
  });
  it('2026-11-18 审计 P2-1：未知店铺类型钳制归 3P（对齐 Python where(isin) 兜底）', () => {
    const result = run([baseRow({ 店铺类型: '官方在线' })]);
    expect(result.dims.channel[0].store_type).toBe('3P');
  });
  it('2026-11-18 审计 P1-1 连锁：品牌小写行 + 大写别名规则仍并组（键两侧同归一）', () => {
    const result = run([
      baseRow({ 型号: 'MatePad SE 11', 品类: '平板', 型号规格: '11"/4+128 GB Black', 品牌: 'Huawei' }),
      baseRow({ 型号: 'MatePad SE', 品类: '平板', 型号规格: '11"/4+128 GB Black', 品牌: 'huawei' }),
    ], { modelAliasRows: [{ brand: 'HUAWEI', from: 'MatePad SE 11', to: 'MatePad SE' }] });
    // 两种大小写写法经大写归一后与别名键同域 → 两 SKU 并一型号（正名取组内
    // 众数型号名，此处两行同票取先入组的 'MatePad SE 11'）
    expect(new Set(result.dims.product.map((p) => p.model_id))).toEqual(new Set(['own-huawei-matepad-se-11']));
  });
  it('normkey 剥品牌词/连接词（别名与 id 归一的地基）', () => {
    expect(normkey('HUAWEI', '华为 MatePad SE 11')).toBe('matepad se 11');
    expect(normkey('HUAWEI', 'MatePad SE')).toBe('matepad se');
    expect(normkey('XIAOMI', 'Redmi Note 14 5G')).toBe('redmi note 14');
  });
});

describe('配置表 ctx 参与派生', () => {
  it('型号别名：品牌|原始 → 目标（归一键），两 SKU 并一', () => {
    const result = run([
      baseRow({ 型号: 'MatePad SE 11', 品类: '平板', 型号规格: '11"/4+128 GB Black' }),
      baseRow({ 型号: 'MatePad SE', 品类: '平板', 型号规格: '11"/4+128 GB Black' }),
    ], { modelAliasRows: [{ brand: 'HUAWEI', from: 'MatePad SE 11', to: 'MatePad SE' }] });
    expect(new Set(result.dims.product.map((p) => p.model_id)).size).toBe(1);
  });
  it('系列规则配置行覆盖内置（前缀 + re: 正则两种形态）', () => {
    const result = run([baseRow(), baseRow({ 品牌: 'XIAOMI', 型号: 'Xiaomi 16 Pro Max', 型号规格: '16+512 GB Gray' })], {
      seriesRules: [
        { brand: 'HUAWEI', pattern: 'Mate 80', series: 'Mate80 专属系列' },
        { brand: 'XIAOMI', pattern: 're:^16 Pro', series: '小米16 测试线' },
      ],
    });
    const mate = result.dims.product.find((p) => p.model_name === 'Mate 80 Pro')!;
    expect(mate.series).toBe('Mate80 专属系列');
    const xiaomi = result.dims.product.find((p) => p.brand === 'XIAOMI')!;
    expect(xiaomi.series).toBe('小米16 测试线');
  });
  it('阶梯配置行覆盖内置分档', () => {
    const result = run([baseRow()], { tierLadders: { phone: [100] } });
    expect(result.dims.product[0].tier_code).toBe('100+');
  });
  it('大促档期与对标矩阵直接进维表', () => {
    const result = run([baseRow()], {
      promoRows: [{ promo_id: 'RU-双11-RU-2026-11-01', country_code: 'RU', promo_name: '双11', start_date: '2026-11-01', end_date: '2026-11-11', depth_hint: '深', platforms: null, channel_raw: '' }],
      benchmarkRows: [{ country_code: 'RU', own_model_id: 'own-huawei-mate-80-pro', own_romram: '12+512 GB', competitor_sku_id: 'cmp-x', sort: 0, source: 'matrix' }],
    });
    expect(result.dims.promo).toHaveLength(1);
    expect(result.dims.benchmark).toHaveLength(1);
  });
});

describe('C3 解析字典注入（2026-11-18 显性化）', () => {
  it('自定义国家别名/品类映射/平台别名/店铺类型别名全量替换生效；不传 = 出厂默认', () => {
    // 注入字典：自定义国名「露西亚」→ RU、品类「智慧机」→ phone、平台「某电商」→ Mvideo、店铺「旗舰店」→ 1P
    const dictionaries = {
      countryCodes: { 露西亚: 'RU' },
      industryOfCat: { 智慧机: 'phone' as const },
      platformAliases: { 某电商: 'Mvideo' },
      storeAliases: { 旗舰店: '1P' },
    };
    const result = run([
      baseRow({ '国家/地区': '露西亚', 品类: '智慧机', 平台: '某电商', 店铺类型: '旗舰店' }),
    ], { dictionaries });
    expect(result.factRows).toHaveLength(1);
    expect(result.factRows[0].country_code).toBe('RU');
    expect(result.dims.product[0].industry).toBe('phone');
    expect(result.dims.channel[0].platform).toBe('Mvideo');
    expect(result.dims.channel[0].store_type).toBe('1P');
    // 全量替换语义：出厂词汇失效（「R国」不在自定义字典里 → 该行未知国家剔除；
    // 混一行有效行验证剔除计数——全无效行会被引擎保护性拒绝）
    const result2 = run([
      baseRow({ '国家/地区': '露西亚', 品类: '智慧机', 平台: '某电商', 店铺类型: '旗舰店' }),
      baseRow({ '国家/地区': 'R国', 品类: '智慧机', 平台: '某电商', 店铺类型: '旗舰店' }),
    ], { dictionaries });
    expect(result2.factRows).toHaveLength(1);
    expect(result2.diag.droppedBy['未知国家']).toBe(1);
    // 不传 = 出厂默认行为不变
    const result3 = run([baseRow()]);
    expect(result3.factRows).toHaveLength(1);
    expect(result3.factRows[0].country_code).toBe('RU');
  });
});
