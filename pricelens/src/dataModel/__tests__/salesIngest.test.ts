// ============================================================
// PSI 销量归一化纯函数（2026-11-17 Eason 契约，接口预留）单测：
// 周期间 YYYY0WW ↔ YYYYWW、国家别名、存储/表盘/屏幕规范形、型号解析
// （我司优先）、PSI 源行 → 事实行（同键求和 + unmatched/skipped 计数）。
// 归一规则与 scripts/patch_dim_categories.py（模拟底表回填）逐字对齐。
// ============================================================
import { describe, expect, it } from 'vitest';
import type { DimProduct, DimRegion } from '../types';
import {
  effectiveCatsOf,
  effectiveCat3Of,
  normalizeCaseSize,
  normalizeCountryCode,
  normalizeModelKey,
  normalizePeriodId,
  normalizeSalesRows,
  normalizeScreen,
  normalizeStorage,
  resolveModelId,
  storageKeyOf,
  stripScreenPrefix,
} from '../salesIngest';

const regions: DimRegion[] = [
  { region_code: 'RU', region_name: '欧亚', country_code: 'RU', country_name: 'R国', enabled: true, sort: 1, currency: 'RUB', core_platforms: [], default_platform: null, default_own_models: {} },
  { region_code: 'DE', region_name: '欧洲', country_code: 'DE', country_name: '德国', enabled: true, sort: 2, currency: 'EUR', core_platforms: [], default_platform: null, default_own_models: {} },
];

const mkProduct = (over: Partial<DimProduct> & Pick<DimProduct, 'sku_id' | 'model_id' | 'model_name'>): DimProduct => ({
  industry: 'phone',
  brand: 'HUAWEI',
  is_own: true,
  series: 'S',
  romram: '12+256 GB',
  color: 'Black',
  tier_code: '200-400',
  tier_by_country: {},
  ref_price_usd: null,
  launch_date: '2026-05-06',
  eol_date: null,
  first_week: '202619',
  last_week: '202646',
  countries: ['RU'],
  ...over,
});

const products: DimProduct[] = [
  mkProduct({ sku_id: 'cmp-honor-watch-6__std__black', model_id: 'cmp-honor-watch-6', model_name: 'Watch 6', brand: 'HONOR', is_own: false, industry: 'wearable', romram: '—' }),
  mkProduct({ sku_id: 'own-huawei-watch-6__42mm__x', model_id: 'own-huawei-watch-6', model_name: 'Watch 6', industry: 'wearable', romram: '42mm', color: '—', cat1: '42mm' }),
  mkProduct({ sku_id: 'own-huawei-nova-14__std__black', model_id: 'own-huawei-nova-14', model_name: 'nova 14', industry: 'phone' }),
  mkProduct({ sku_id: 'own-huawei-matepad-pro__std__x', model_id: 'own-huawei-matepad-pro', model_name: 'MatePad Pro 2025', industry: 'tablet', romram: '12.2" 12+256 GB', cat1: '12+256 GB', cat2: '12.2"' }),
  mkProduct({ sku_id: 'own-huawei-freearc__std__black', model_id: 'own-huawei-freearc', model_name: 'FreeArc', industry: 'audio', romram: '—' }),
];

describe('normalizePeriodId（YYYY0WW ↔ YYYYWW）', () => {
  it('YYYY0WW 七位 → YYYYWW 六位（2026043 → 202643）', () => {
    expect(normalizePeriodId('2026043')).toBe('202643');
    expect(normalizePeriodId(2026043)).toBe('202643');
  });
  it('个位周补零（2026005 → 202605）', () => {
    expect(normalizePeriodId('2026005')).toBe('202605');
  });
  it('已是 YYYYWW 直通；数字输入直通', () => {
    expect(normalizePeriodId('202643')).toBe('202643');
    expect(normalizePeriodId(202643)).toBe('202643');
  });
  it('非法输入 = null（分隔位错 / 周越界 / 文本）', () => {
    expect(normalizePeriodId('2026100')).toBeNull(); // 分隔位非 0（10 月不是周）
    expect(normalizePeriodId('2026054')).toBeNull();
    expect(normalizePeriodId('2026000')).toBeNull();
    expect(normalizePeriodId('abc')).toBeNull();
    expect(normalizePeriodId('')).toBeNull();
    expect(normalizePeriodId(null)).toBeNull();
  });
});

describe('normalizeCountryCode', () => {
  it('国家码大小写直通', () => {
    expect(normalizeCountryCode('ru', regions)).toBe('RU');
    expect(normalizeCountryCode('DE', regions)).toBe('DE');
  });
  it('英文国名与 R国 别名（Eason 口径 R国=Russia）', () => {
    expect(normalizeCountryCode('Russia', regions)).toBe('RU');
    expect(normalizeCountryCode('R国', regions)).toBe('RU');
    expect(normalizeCountryCode('德国', regions)).toBe('DE');
    expect(normalizeCountryCode('Germany', regions)).toBe('DE');
  });
  it('未登记 = null', () => {
    expect(normalizeCountryCode('Mars', regions)).toBeNull();
    expect(normalizeCountryCode('', regions)).toBeNull();
  });
});

describe('normalizeStorage / storageKeyOf（存储规范形）', () => {
  it('常见写法归一到 12+512 GB', () => {
    expect(normalizeStorage('12+512 GB')).toBe('12+512 GB');
    expect(normalizeStorage('12+512gb')).toBe('12+512 GB');
    expect(normalizeStorage('12+512')).toBe('12+512 GB');
    expect(normalizeStorage('8/128 GB')).toBe('8+128 GB');
  });
  it('TB 简写归一（12+1T ≡ 12+1 TB），匹配键同为 GB 数值', () => {
    expect(normalizeStorage('12+1T')).toBe('12+1 TB');
    expect(normalizeStorage('12+1 tb')).toBe('12+1 TB');
    expect(storageKeyOf('12+1T')).toBe(storageKeyOf('12+1 TB'));
    expect(storageKeyOf('12+1T')).toBe('12|1024');
  });
  it('单存储（256 GB / 1 tb）', () => {
    expect(normalizeStorage('256 GB')).toBe('256 GB');
    expect(normalizeStorage('1 tb')).toBe('1 TB');
    expect(storageKeyOf('256GB')).toBe('0|256');
  });
  it('解不出 = 空串（—/规格未标明/无数字）', () => {
    expect(normalizeStorage('—')).toBe('');
    expect(normalizeStorage('规格未标明')).toBe('');
    expect(normalizeStorage('42mm')).toBe(''); // 表盘词不是存储
    expect(normalizeStorage(null)).toBe('');
  });
});

describe('normalizeCaseSize / normalizeScreen（表盘/屏幕规范形）', () => {
  it('表盘：42mm / 42 mm / 42MM → 42mm；解不出 = null', () => {
    expect(normalizeCaseSize('42mm')).toBe('42mm');
    expect(normalizeCaseSize('42 mm Black')).toBe('42mm');
    expect(normalizeCaseSize('42MM')).toBe('42mm');
    expect(normalizeCaseSize('Black')).toBeNull();
    // 表盘是两位数尺寸（40–49mm），不吞任意数字
    expect(normalizeCaseSize('12+512 GB')).toBeNull();
  });
  it('屏幕：直/弯引号、寸、inch → N.N"', () => {
    expect(normalizeScreen('11.5" 8+128 GB')).toBe('11.5"');
    expect(normalizeScreen("11.5' WiFi")).toBe('11.5"');
    expect(normalizeScreen('13.2寸')).toBe('13.2"');
    expect(normalizeScreen('11-inch')).toBe('11"');
    expect(normalizeScreen('12+256 GB')).toBeNull();
  });
  it('stripScreenPrefix 剥屏幕前缀留存储段', () => {
    expect(stripScreenPrefix('11.5" 12+256 GB PaperMatte')).toBe('12+256 GB PaperMatte');
    expect(stripScreenPrefix('11-inch 4+128 GB')).toBe('4+128 GB');
    expect(stripScreenPrefix('12+256 GB')).toBe('12+256 GB');
  });
});

describe('resolveModelId（PSI Product → model_id）', () => {
  it('归一键命中：大小写/空白/标点不敏感', () => {
    expect(resolveModelId('nova 14', products)).toBe('own-huawei-nova-14');
    expect(resolveModelId('Nova14', products)).toBe('own-huawei-nova-14');
  });
  it('我司优先：Watch 6 同键命中我司与 Honor 竞品 → own', () => {
    expect(resolveModelId('Watch 6', products)).toBe('own-huawei-watch-6');
    expect(resolveModelId('watch6', products)).toBe('own-huawei-watch-6');
  });
  it('别名表：原文直查与归一兜底', () => {
    expect(resolveModelId('HUAWEI MatePad Pro 2026款', products, { 'HUAWEI MatePad Pro 2026款': 'MatePad Pro 2025' })).toBe('own-huawei-matepad-pro');
    expect(resolveModelId('MatePadPro2025', products)).toBe('own-huawei-matepad-pro');
  });
  it('解不出 = null', () => {
    expect(resolveModelId('iPhone 18', products)).toBeNull();
    expect(resolveModelId('', products)).toBeNull();
  });
});

describe('effectiveCatsOf（型号维度口径，匹配两侧同用）', () => {
  it('显式 cat 字段优先', () => {
    const p = products.find((x) => x.model_id === 'own-huawei-matepad-pro')!;
    expect(effectiveCatsOf(p)).toEqual({ cat1: '12+256 GB', cat2: '12.2"' });
  });
  it('手机回落：romram 解析存储', () => {
    const p = mkProduct({ sku_id: 'x1', model_id: 'm1', model_name: 'X1', industry: 'phone', romram: '8+128 GB' });
    expect(effectiveCatsOf(p)).toEqual({ cat1: '8+128 GB', cat2: '' });
  });
  it('穿戴回落：color 解析表盘（未回填 cat1 的行）', () => {
    const p = mkProduct({ sku_id: 'x2', model_id: 'm2', model_name: 'X2', industry: 'wearable', romram: '—', color: '46mm Black' });
    expect(effectiveCatsOf(p)).toEqual({ cat1: '46mm', cat2: '' });
  });
  it('音频 = 产品级（双双为空）', () => {
    const p = mkProduct({ sku_id: 'x3', model_id: 'm3', model_name: 'X3', industry: 'audio', romram: '—' });
    expect(effectiveCatsOf(p)).toEqual({ cat1: '', cat2: '' });
  });
});

describe('normalizeSalesRows（PSI 源行 → 事实行）', () => {
  it('归一 + 同键求和 + 排序稳定', () => {
    const out = normalizeSalesRows([
      { country: 'R国', product: 'Watch 6', category1: '42mm', periodId: '2026043', qty: 100 },
      { country: 'RU', product: 'watch6', category1: '42mm', periodId: '202643', qty: 23 },
      { country: 'Russia', product: 'nova 14', category1: '12+256GB', periodId: '2026043', qty: 7 },
    ], { regions, products });
    expect(out.unmatched).toBe(0);
    expect(out.skipped).toBe(0);
    expect(out.facts).toEqual([
      { week_id: '202643', country_code: 'RU', model_id: 'own-huawei-nova-14', cat1: '12+256 GB', cat2: '', qty: 7 },
      { week_id: '202643', country_code: 'RU', model_id: 'own-huawei-watch-6', cat1: '42mm', cat2: '', qty: 123 },
    ]);
  });
  it('平板双维度（屏幕列裸数字也收）；音频产品级（空维度键）', () => {
    const out = normalizeSalesRows([
      { country: 'RU', product: 'MatePad Pro 2025', category1: '12+512 GB', category2: '13.2', periodId: '2026044', qty: 5 },
      { country: 'RU', product: 'FreeArc', periodId: '2026044', qty: 9 },
    ], { regions, products });
    expect(out.facts).toEqual([
      { week_id: '202644', country_code: 'RU', model_id: 'own-huawei-freearc', cat1: '', cat2: '', qty: 9 },
      { week_id: '202644', country_code: 'RU', model_id: 'own-huawei-matepad-pro', cat1: '12+512 GB', cat2: '13.2"', qty: 5 },
    ]);
  });
  it('国家/型号解析失败计 unmatched；周期/QTY 非法计 skipped', () => {
    const out = normalizeSalesRows([
      { country: 'RU', product: '不存在型号', periodId: '2026043', qty: 1 },
      { country: '火星', product: 'nova 14', periodId: '2026043', qty: 1 },
      { country: 'RU', product: 'nova 14', periodId: '2026999', qty: 1 },
      { country: 'RU', product: 'nova 14', periodId: '2026043', qty: 0 },
      { country: 'RU', product: 'nova 14', periodId: '2026043', qty: -3 },
    ], { regions, products });
    expect(out.facts).toEqual([]);
    expect(out.unmatched).toBe(2);
    expect(out.skipped).toBe(3);
  });
  it('空产品维表（未初始化）→ 全部 unmatched，不抛错', () => {
    const out = normalizeSalesRows([{ country: 'RU', product: 'nova 14', periodId: '2026043', qty: 1 }], { regions, products: [] });
    expect(out.facts).toEqual([]);
    expect(out.unmatched).toBe(1);
  });
  it('normalizeModelKey 保留中日韩文字', () => {
    expect(normalizeModelKey('Watch 6')).toBe('watch6');
    expect(normalizeModelKey('华为 Watch-6（Pro）')).toBe('华为watch6pro');
  });
});

// ============================================================
// 2026-11-27 四表结构：服务器发已解析的销量事实（fact_sales matched 行），页面直接采用；
// cat3（平板柔光）进取数键。原始行（旧静态包 / 模拟数据）仍走上面的型号名解析路径。
// ============================================================
describe('normalizeSalesRows（已解析行：带 modelId 直接采用）', () => {
  it('不再按型号名解析：product 只是展示用，别名表不参与', () => {
    const out = normalizeSalesRows([
      { country: 'RU', product: '', modelId: 'own-huawei-nova-14', category1: '12+512 GB', periodId: '202508', qty: 10 },
      { country: '德国', product: '随便写的名字', modelId: 'own-huawei-freearc', periodId: '202643', qty: 4 },
    ], { regions, products, aliases: { '随便写的名字': 'own-huawei-watch-6' } });
    expect(out.facts).toEqual([
      { week_id: '202508', country_code: 'RU', model_id: 'own-huawei-nova-14', cat1: '12+512 GB', cat2: '', qty: 10 },
      { week_id: '202643', country_code: 'DE', model_id: 'own-huawei-freearc', cat1: '', cat2: '', qty: 4 },
    ]);
    expect(out.unmatched).toBe(0);
  });

  it('category 原样采用（已是匹配表目标行的值），cat3 非空才随行携带', () => {
    const out = normalizeSalesRows([
      { country: 'RU', product: '', modelId: 'own-huawei-matepad-pro', category1: '12+256 GB', category2: '12.2"', category3: 'Normal', periodId: '202508', qty: 3 },
      { country: 'RU', product: '', modelId: 'own-huawei-matepad-pro', category1: '12+256 GB', category2: '12.2"', category3: 'PaperMatte', periodId: '202508', qty: 8 },
      { country: 'RU', product: '', modelId: 'own-huawei-matepad-pro', category1: '12+256 GB', category2: '12.2"', periodId: '202508', qty: 5 },
    ], { regions, products });
    // 同存储同尺寸：Normal / PaperMatte / 未带 cat3 是三个不同的键，不互相合并（cat3 空的排最前）
    expect(out.facts).toEqual([
      { week_id: '202508', country_code: 'RU', model_id: 'own-huawei-matepad-pro', cat1: '12+256 GB', cat2: '12.2"', qty: 5 },
      { week_id: '202508', country_code: 'RU', model_id: 'own-huawei-matepad-pro', cat1: '12+256 GB', cat2: '12.2"', cat3: 'Normal', qty: 3 },
      { week_id: '202508', country_code: 'RU', model_id: 'own-huawei-matepad-pro', cat1: '12+256 GB', cat2: '12.2"', cat3: 'PaperMatte', qty: 8 },
    ]);
  });

  it('同键求和 + psiType 混合标注；型号不在维表 → unmatched', () => {
    const out = normalizeSalesRows([
      { country: 'RU', product: '', modelId: 'own-huawei-nova-14', category1: '12+256 GB', periodId: '202508', qty: 10, psiType: 'Sell Out' },
      { country: 'RU', product: '', modelId: 'own-huawei-nova-14', category1: '12+256 GB', periodId: '202508', qty: 2, psiType: 'simulated' },
      { country: 'RU', product: '', modelId: 'own-huawei-ghost', periodId: '202508', qty: 99 },
    ], { regions, products });
    expect(out.facts).toEqual([
      { week_id: '202508', country_code: 'RU', model_id: 'own-huawei-nova-14', cat1: '12+256 GB', cat2: '', qty: 12, psiType: 'mixed' },
    ]);
    expect(out.unmatched).toBe(1);
  });

  it('PSI 的 Period ID 2025008 → 202508（Eason 2026-11-27 真实写法）', () => {
    const out = normalizeSalesRows([
      { country: 'RU', product: '', modelId: 'own-huawei-nova-14', category1: '12+256 GB', periodId: '2025008', qty: 1 },
    ], { regions, products });
    expect(out.facts[0].week_id).toBe('202508');
  });
});

describe('effectiveCat3Of（平板柔光：取数键第三段）', () => {
  it('显式 cat3 优先', () => {
    expect(effectiveCat3Of(mkProduct({ sku_id: 'x', model_id: 'm', model_name: 'M', industry: 'tablet', cat3: 'PaperMatte' }))).toBe('PaperMatte');
  });
  it('未回填时按 romram 推断；非平板为空', () => {
    expect(effectiveCat3Of(mkProduct({ sku_id: 'x', model_id: 'm', model_name: 'M', industry: 'tablet', romram: '12.2" 12+256 GB PaperMatte' }))).toBe('PaperMatte');
    expect(effectiveCat3Of(mkProduct({ sku_id: 'x', model_id: 'm', model_name: 'M', industry: 'tablet', romram: '12" 柔光版 8+256 GB' }))).toBe('PaperMatte');
    expect(effectiveCat3Of(mkProduct({ sku_id: 'x', model_id: 'm', model_name: 'M', industry: 'tablet', romram: '12.2" 12+256 GB' }))).toBe('Normal');
    expect(effectiveCat3Of(mkProduct({ sku_id: 'x', model_id: 'm', model_name: 'M', industry: 'phone' }))).toBe('');
  });
});
