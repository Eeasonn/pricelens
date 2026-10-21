// ============================================================
// 第118轮 大盘分析金测：档位×品牌结构 / 环比贡献拆解 / 排序确定性。
// 第一百二十三轮重做：贡献拆解改必选档位的 brandContribution
// （品牌行 + 产品子行，Δ 降序）；marketTimeStack / marketTierOptions 退役删除。
// 纯函数（fixture 为主）+ 真实数据不变量（RU × phone 大盘非空且配置唯一）。
// ============================================================
import { describe, expect, it } from 'vitest';
import { dimProduct } from '../../data';
import type { DimProduct } from '../types';
import {
  brandContribution,
  fmtSignedInt,
  marketBrandOrder,
  marketConfigs,
  marketKeyOf,
  tierStructure,
  type MarketConfig,
} from '../market';

/** fixture 构造器：只填 marketConfigs 消费的字段 */
function prod(over: Partial<DimProduct>): DimProduct {
  return {
    sku_id: 'cmp-X-x__8+128 GB__Black',
    model_id: 'cmp-X-x',
    industry: 'phone',
    brand: 'XBRAND',
    is_own: false,
    series: '',
    model_name: 'X1',
    romram: '8+128 GB',
    color: 'Black',
    tier_code: '200-400',
    tier_by_country: {},
    ref_price_usd: null,
    launch_date: '2026-05-06',
    eol_date: null,
    first_week: '202619',
    last_week: '202642',
    countries: ['RU'],
    prev_model_id: null,
    next_model_id: null,
    ...over,
  };
}

const FIX: DimProduct[] = [
  // 同型号同配置两个颜色 → 归一为一个配置
  prod({ sku_id: 'cmp-A-a1__12+256 GB__Black', model_id: 'cmp-A-a1', brand: 'ALPHA', model_name: 'A1', romram: '12+256 GB', tier_by_country: { RU: '600-800' } }),
  prod({ sku_id: 'cmp-A-a1__12+256 GB__White', model_id: 'cmp-A-a1', brand: 'ALPHA', model_name: 'A1', romram: '12+256 GB', tier_by_country: { RU: '600-800' } }),
  // 无分国档位 → 回全局 tier_code
  prod({ sku_id: 'cmp-B-b1__8+128 GB__Black', model_id: 'cmp-B-b1', brand: 'BETA', model_name: 'B1', tier_code: '200-400', tier_by_country: {} }),
  // 他国 / 他产业 → 不入大盘
  prod({ sku_id: 'cmp-C-c1__8+128 GB__Black', model_id: 'cmp-C-c1', brand: 'GAMMA', model_name: 'C1', countries: ['BR'] }),
  prod({ sku_id: 'cmp-D-d1__—__—', model_id: 'cmp-D-d1', brand: 'GAMMA', model_name: 'D1', industry: 'tablet' }),
];

const keyOf = (c: MarketConfig, romram: string): string => `${c.modelId}|${romram.replace(/\s+/g, '')}`;

describe('大盘分析 · marketConfigs', () => {
  it('按国家×产业过滤，同型号同配置多颜色归一，分国档位优先', () => {
    const cs = marketConfigs(FIX, 'RU', 'phone');
    expect(cs.map((c) => c.modelId)).toEqual(['cmp-A-a1', 'cmp-B-b1']);
    expect(cs[0]).toMatchObject({ brand: 'ALPHA', modelName: 'A1', romram: '12+256 GB', tierCode: '600-800', label: 'A1 12+256 GB' });
    expect(cs[1].tierCode).toBe('200-400'); // 回全局兜底
  });

  it('marketKeyOf 去配置空格（与销量估算取数键同口径）', () => {
    const cs = marketConfigs(FIX, 'RU', 'phone');
    expect(marketKeyOf(cs[0])).toBe('cmp-A-a1|12+256GB');
  });
});

describe('大盘分析 · marketBrandOrder / tierStructure', () => {
  const cs = marketConfigs(FIX, 'RU', 'phone');
  const vol = new Map<string, number | null>([
    [keyOf(cs[0], cs[0].romram), 100],
    [keyOf(cs[1], cs[1].romram), 300],
  ]);

  it('品牌序：自有置顶，其余按量降序；零量品牌不入序', () => {
    expect(marketBrandOrder(cs, vol, 'ALPHA')).toEqual(['ALPHA', 'BETA']);
    expect(marketBrandOrder(cs, vol, 'BETA')).toEqual(['BETA', 'ALPHA']);
  });

  it('档位结构：只出有量档位、按阶梯序、档内自有置底其余量降序、合计正确', () => {
    const st = tierStructure(cs, vol, ['<200', '200-400', '400-600', '600-800', '800-1000', '1000+'], ['ALPHA', 'BETA']);
    expect(st.map((s) => s.tierCode)).toEqual(['200-400', '600-800']);
    expect(st[0]).toEqual({ tierCode: '200-400', total: 300, byBrand: [{ brand: 'BETA', vol: 300 }] });
    expect(st[1].total).toBe(100);
    expect(st[1].byBrand).toEqual([{ brand: 'ALPHA', vol: 100 }]);
  });

  it('null/0 销量的配置不计入结构', () => {
    const vol2 = new Map<string, number | null>([
      [keyOf(cs[0], cs[0].romram), 0],
      [keyOf(cs[1], cs[1].romram), null],
    ]);
    expect(tierStructure(cs, vol2, ['200-400', '600-800'], ['ALPHA'])).toEqual([]);
  });

  it('阶梯外档位殿后保留（与 tiersOfScope 同口径）：阶梯内按序在前、阶梯外按代码序追加', () => {
    // 阶梯外档位 = 不在 phone ladder 的自定义档（如业务临时声明档）
    const CS: DimProduct[] = [
      prod({ sku_id: 'cmp-Z-z9__8+128 GB__Black', model_id: 'cmp-Z-z9', brand: 'BETA', model_name: 'Z9', tier_code: '3000-4000', tier_by_country: {} }),
      prod({ sku_id: 'cmp-Y-y9__8+128 GB__Black', model_id: 'cmp-Y-y9', brand: 'BETA', model_name: 'Y9', tier_code: '2500-3000', tier_by_country: {} }),
      prod({ sku_id: 'cmp-B-b1__8+128 GB__Black', model_id: 'cmp-B-b1', brand: 'ALPHA', model_name: 'B1', tier_code: '200-400', tier_by_country: {} }),
    ];
    const cs = marketConfigs(CS, 'RU', 'phone');
    const vol = new Map<string, number | null>(cs.map((c) => [marketKeyOf(c), 100]));
    const st = tierStructure(cs, vol, ['<200', '200-400', '400-600', '600-800', '800-1000', '1000+'], ['ALPHA', 'BETA']);
    expect(st.map((s) => s.tierCode)).toEqual(['200-400', '2500-3000', '3000-4000']);
    expect(st[0].total).toBe(100);
    expect(st[2].byBrand).toEqual([{ brand: 'BETA', vol: 100 }]);
  });
});

describe('大盘分析 · brandContribution（第一百二十三轮：必选档位 · 品牌+产品行）', () => {
  // 多品牌多档位 fixture：HUAWEI = 自有；BETA 跨档位且 200-400 档内两个配置
  const CS: DimProduct[] = [
    prod({ sku_id: 'cmp-A-a1__12+256 GB__Black', model_id: 'cmp-A-a1', brand: 'HUAWEI', is_own: true, model_name: 'A1', romram: '12+256 GB', tier_by_country: { RU: '600-800' } }),
    prod({ sku_id: 'cmp-B-b1__8+128 GB__Black', model_id: 'cmp-B-b1', brand: 'BETA', model_name: 'B1', tier_code: '200-400', tier_by_country: {} }),
    prod({ sku_id: 'cmp-B-b2__8+512 GB__Black', model_id: 'cmp-B-b2', brand: 'BETA', model_name: 'B2', romram: '8+512 GB', tier_code: '200-400', tier_by_country: {} }),
    prod({ sku_id: 'cmp-B-e1__8+256 GB__Black', model_id: 'cmp-B-e1', brand: 'BETA', model_name: 'E1', romram: '8+256 GB', tier_by_country: { RU: '400-600' } }),
    prod({ sku_id: 'cmp-G-g1__16+512 GB__Black', model_id: 'cmp-G-g1', brand: 'GAMMA', model_name: 'G1', romram: '16+512 GB', tier_by_country: { RU: '600-800' } }),
  ];
  const cs = marketConfigs(CS, 'RU', 'phone');
  const [cA, cB1, cB2, cE, cG] = cs;

  it('档位过滤 + Δ 降序：只出该档位品牌行（拉动最上、拖累最下），其他档位变化不入合计', () => {
    const prev = new Map<string, number | null>([
      [marketKeyOf(cA), 100],
      [marketKeyOf(cG), 50],
      [marketKeyOf(cB1), 300], // 200-400 档：应被档位过滤挡在表外
    ]);
    const sel = new Map<string, number | null>([
      [marketKeyOf(cA), 94],
      [marketKeyOf(cG), 70],
      [marketKeyOf(cB1), 400],
    ]);
    const { rows, total } = brandContribution(cs, prev, sel, '600-800');
    expect(rows.map((r) => [r.brand, r.delta])).toEqual([
      ['GAMMA', 20],
      ['HUAWEI', -6],
    ]);
    expect(total).toBe(14); // BETA 的 +100 不入（档位已滤）
    expect(rows[0].products).toEqual([{ key: marketKeyOf(cG), label: 'G1 16+512 GB', delta: 20 }]);
    expect(rows[1].products).toEqual([{ key: marketKeyOf(cA), label: 'A1 12+256 GB', delta: -6 }]);
  });

  it('同品牌多产品：子行 Δ 降序，品牌合计 = 子行之和', () => {
    const prev = new Map<string, number | null>([
      [marketKeyOf(cB1), 300],
      [marketKeyOf(cB2), 100],
    ]);
    const sel = new Map<string, number | null>([
      [marketKeyOf(cB1), 400],
      [marketKeyOf(cB2), 60],
    ]);
    const { rows, total } = brandContribution(cs, prev, sel, '200-400');
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.brand).toBe('BETA');
    expect(r.delta).toBe(60);
    expect(r.products.map((p) => [p.label, p.delta])).toEqual([
      ['B1 8+128 GB', 100],
      ['B2 8+512 GB', -40],
    ]);
    expect(r.delta).toBe(r.products.reduce((acc, p) => acc + p.delta, 0));
    expect(total).toBe(60);
  });

  it('Δ = 0 不出：产品行与品牌行都不出（品牌子行互相抵消 → 品牌行整体隐藏）', () => {
    // 产品级：E1 两期同量 → 不出子行
    const flat = new Map<string, number | null>([[marketKeyOf(cE), 200]]);
    const bc1 = brandContribution([cE], flat, flat, '400-600');
    expect(bc1.rows).toEqual([]);
    expect(bc1.total).toBe(0);
    // 品牌级：B1 +100 与 B2 −100 抵消 → 品牌行不出，合计 0
    const prev = new Map<string, number | null>([
      [marketKeyOf(cB1), 100],
      [marketKeyOf(cB2), 200],
    ]);
    const sel = new Map<string, number | null>([
      [marketKeyOf(cB1), 200],
      [marketKeyOf(cB2), 100],
    ]);
    const bc2 = brandContribution(cs, prev, sel, '200-400');
    expect(bc2.rows).toEqual([]);
    expect(bc2.total).toBe(0);
  });

  it('两期全缺的配置跳过：不成行、不计合计；任一期缺采按 0 计（在架变化如实计入）', () => {
    const prev = new Map<string, number | null>([
      [marketKeyOf(cA), 80], // 仅上一期在架 → 全额拖累
      [marketKeyOf(cE), null], // 两期全缺 → 跳过
    ]);
    const sel = new Map<string, number | null>([
      [marketKeyOf(cA), null],
      [marketKeyOf(cG), 30], // 仅当前期在架 → 全额拉动
    ]);
    const { rows, total } = brandContribution(cs, prev, sel, '600-800');
    expect(rows.map((r) => [r.brand, r.delta])).toEqual([
      ['GAMMA', 30],
      ['HUAWEI', -80],
    ]);
    expect(total).toBe(-50);
  });

  it('上一期整期为 null（数据起点）→ 全部行按拉动/拖累如实计', () => {
    const prev = new Map<string, number | null>([[marketKeyOf(cA), null]]);
    const sel = new Map<string, number | null>([[marketKeyOf(cA), 30]]);
    const { rows, total } = brandContribution([cA], prev, sel, '600-800');
    expect(rows).toEqual([{ brand: 'HUAWEI', delta: 30, products: [{ key: marketKeyOf(cA), label: 'A1 12+256 GB', delta: 30 }] }]);
    expect(total).toBe(30);
  });

  it('无该档位配置 → 空行 + 0', () => {
    const vol = new Map<string, number | null>([[marketKeyOf(cA), 100]]);
    expect(brandContribution(cs, vol, vol, '1000+')).toEqual({ rows: [], total: 0 });
  });

  it('真实维度同构：configs 按 tierCode 分组后各档位行数与 configs 一致（分组不重不漏）', () => {
    const prev = new Map<string, number | null>(cs.map((c) => [marketKeyOf(c), 10]));
    const sel = new Map<string, number | null>(cs.map((c) => [marketKeyOf(c), 25]));
    let sum = 0;
    for (const t of ['200-400', '400-600', '600-800']) {
      const { rows, total } = brandContribution(cs, prev, sel, t);
      const prods = rows.reduce((acc, r) => acc + r.products.length, 0);
      expect(prods).toBe(cs.filter((c) => c.tierCode === t).length);
      sum += total;
    }
    expect(sum).toBe(cs.length * 15);
  });
});

describe('大盘分析 · fmtSignedInt', () => {
  it('带符号整数（U+2212 负号、千分位）', () => {
    expect(fmtSignedInt(94)).toBe('+94');
    expect(fmtSignedInt(-1770)).toBe('−1,770');
    expect(fmtSignedInt(0)).toBe('0');
  });
});

describe('大盘分析 · 真实数据不变量（RU × phone）', () => {
  it('大盘配置非空、(型号,配置) 唯一、品牌都在维表登记色板内', () => {
    const cs = marketConfigs(dimProduct, 'RU', 'phone');
    expect(cs.length).toBeGreaterThan(0);
    const keys = cs.map(marketKeyOf);
    expect(new Set(keys).size).toBe(keys.length);
    for (const c of cs) expect(c.tierCode.length).toBeGreaterThan(0);
    expect(marketBrandOrder(cs, new Map(), 'HUAWEI')).toEqual([]); // 全缺量 → 空序不崩
  });
});
