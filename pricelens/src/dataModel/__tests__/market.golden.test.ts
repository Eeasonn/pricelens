// ============================================================
// 第118轮 大盘分析金测：档位×品牌结构 / 环比贡献拆解 / 排序确定性。
// 第120轮 追加：marketTimeStack 时间轴堆叠 / marketTierOptions 档位选项。
// 纯函数（fixture 为主）+ 真实数据不变量（RU × phone 大盘非空且配置唯一）。
// ============================================================
import { describe, expect, it } from 'vitest';
import { dimProduct } from '../../data';
import type { DimProduct } from '../types';
import {
  contributionRows,
  fmtSignedInt,
  marketBrandOrder,
  marketConfigs,
  marketKeyOf,
  marketTierOptions,
  marketTimeStack,
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
});

describe('大盘分析 · contributionRows', () => {
  const cs = marketConfigs(FIX, 'RU', 'phone');
  const kA = keyOf(cs[0], cs[0].romram);
  const kB = keyOf(cs[1], cs[1].romram);

  it('Δ = 选中期 − 上一期；品牌粒度聚合；两期全缺跳过、零变化不出、按 |Δ| 降序', () => {
    const prev = new Map<string, number | null>([
      [kA, 120],
      [kB, 300],
    ]);
    const sel = new Map<string, number | null>([
      [kA, 94],
      [kB, null], // 在架 → 0，拖累 300
    ]);
    const { rows, total } = contributionRows(cs, prev, sel, 'brand');
    expect(rows).toEqual([
      { key: 'BETA', label: 'BETA', brand: 'BETA', tierCode: '200-400', delta: -300 },
      { key: 'ALPHA', label: 'ALPHA', brand: 'ALPHA', tierCode: '600-800', delta: -26 },
    ]);
    expect(total).toBe(-326);
  });

  it('产品粒度：同品牌不同配置各自成行；任一期缺采按 0 计', () => {
    const prev = new Map<string, number | null>([
      [kA, 50],
      [kB, 50],
    ]);
    const sel = new Map<string, number | null>([
      [kA, 90],
      [kB, 20],
    ]);
    const { rows } = contributionRows(cs, prev, sel, 'product');
    expect(rows.map((r) => [r.key, r.delta])).toEqual([
      [kA, 40],
      [kB, -30],
    ]);
    expect(rows[0].label).toBe('A1 12+256 GB');
  });

  it('上一期整期为 null（数据起点）→ 全部行按拉动/拖累如实计', () => {
    const prev = new Map<string, number | null>([[kA, null]]);
    const sel = new Map<string, number | null>([[kA, 30]]);
    const { rows, total } = contributionRows(cs, prev, sel, 'brand');
    expect(rows).toEqual([{ key: 'ALPHA', label: 'ALPHA', brand: 'ALPHA', tierCode: '600-800', delta: 30 }]);
    expect(total).toBe(30);
  });
});

describe('大盘分析 · fmtSignedInt', () => {
  it('带符号整数（U+2212 负号、千分位）', () => {
    expect(fmtSignedInt(94)).toBe('+94');
    expect(fmtSignedInt(-1770)).toBe('−1,770');
    expect(fmtSignedInt(0)).toBe('0');
  });
});

describe('大盘分析 · marketTimeStack / marketTierOptions（第120轮时间轴堆叠）', () => {
  // 多品牌多档位 fixture：HUAWEI = 自有；BETA 跨两档位；ZETA/OMEGA 刻意排在 brandOrder 序外
  const CS6: DimProduct[] = [
    prod({ sku_id: 'cmp-A-a1__12+256 GB__Black', model_id: 'cmp-A-a1', brand: 'HUAWEI', is_own: true, model_name: 'A1', romram: '12+256 GB', tier_by_country: { RU: '600-800' } }),
    prod({ sku_id: 'cmp-B-b1__8+128 GB__Black', model_id: 'cmp-B-b1', brand: 'BETA', model_name: 'B1', tier_code: '200-400', tier_by_country: {} }),
    prod({ sku_id: 'cmp-B-e1__8+256 GB__Black', model_id: 'cmp-B-e1', brand: 'BETA', model_name: 'E1', romram: '8+256 GB', tier_by_country: { RU: '400-600' } }),
    prod({ sku_id: 'cmp-G-g1__16+512 GB__Black', model_id: 'cmp-G-g1', brand: 'GAMMA', model_name: 'G1', romram: '16+512 GB', tier_by_country: { RU: '600-800' } }),
    prod({ sku_id: 'cmp-Z-z1__8+128 GB__Black', model_id: 'cmp-Z-z1', brand: 'ZETA', model_name: 'Z1', tier_by_country: { RU: '800-1000' } }),
    prod({ sku_id: 'cmp-O-o1__8+128 GB__Black', model_id: 'cmp-O-o1', brand: 'OMEGA', model_name: 'O1', tier_by_country: { RU: '200-400' } }),
  ];
  const cs = marketConfigs(CS6, 'RU', 'phone');
  const [cA, cB, cE, cG, cZ, cO] = cs;
  const ORDER = ['HUAWEI', 'BETA', 'GAMMA']; // ZETA / OMEGA 不在序内

  /** 展平构造 (配置 × 期下标) 台数表：键 = `${marketKeyOf(c)}|${bi}`（与组件同口径） */
  const flat = (rows: [bi: number, c: MarketConfig, v: number | null][]): Map<string, number | null> => {
    const m = new Map<string, number | null>();
    for (const [bi, c, v] of rows) m.set(`${marketKeyOf(c)}|${bi}`, v);
    return m;
  };

  it('品牌堆叠序：按 brandOrder（自有首位 = 视觉置底），序外品牌殿后按量降序；total = 各品牌合计', () => {
    const vol = flat([
      [0, cA, 100],
      [0, cB, 300],
      [0, cE, 200],
      [0, cG, 50],
      [0, cZ, 80],
      [0, cO, 20],
    ]);
    const cols = marketTimeStack(cs, vol, null, ORDER);
    expect(cols).toHaveLength(1);
    expect(cols[0].total).toBe(750);
    expect(cols[0].byBrand.map((b) => b.brand)).toEqual(['HUAWEI', 'BETA', 'GAMMA', 'ZETA', 'OMEGA']);
    expect(cols[0].byBrand.map((b) => b.vol)).toEqual([100, 500, 50, 80, 20]);
  });

  it('tierFilter 生效：只聚合该档位配置；与「先过滤 configs 再传 null」等价；无匹配档位 → 空数组', () => {
    const vol = flat([
      [0, cA, 100],
      [0, cB, 300],
      [0, cG, 50],
    ]);
    const colsT = marketTimeStack(cs, vol, '600-800', ORDER);
    expect(colsT).toHaveLength(1);
    expect(colsT[0]).toEqual({ total: 150, byBrand: [{ brand: 'HUAWEI', vol: 100 }, { brand: 'GAMMA', vol: 50 }] });
    const sub = cs.filter((c) => c.tierCode === '600-800');
    expect(marketTimeStack(sub, vol, null, ORDER)).toEqual(colsT);
    expect(marketTimeStack(cs, vol, '1000+', ORDER)).toEqual([]);
  });

  it('null 台数剔除：缺采配置不计入 total 与分段，其余配置照常聚合', () => {
    const vol = flat([
      [0, cA, null],
      [0, cB, 300],
      [0, cG, null],
    ]);
    const cols = marketTimeStack(cs, vol, null, ORDER);
    expect(cols[0]).toEqual({ total: 300, byBrand: [{ brand: 'BETA', vol: 300 }] });
  });

  it('total = 0 的期照常输出（空档位），期数由键集推断', () => {
    const vol = flat([
      [0, cA, 100],
      [0, cB, 300],
      [1, cA, null],
      [1, cB, null],
      [1, cE, null],
      [1, cG, null],
      [1, cZ, null],
      [1, cO, null],
    ]);
    const cols = marketTimeStack(cs, vol, null, ORDER);
    expect(cols).toHaveLength(2);
    expect(cols[0].total).toBe(400);
    expect(cols[1]).toEqual({ total: 0, byBrand: [] });
  });

  it('跨多桶聚合：期与期独立、同品牌跨档位合并、缺采期与在架期交错', () => {
    const vol = flat([
      [0, cB, 300],
      [0, cE, 200],
      [0, cA, 100],
      [1, cB, 120],
      [1, cE, 80],
      [1, cA, null],
      [2, cB, 40],
      [2, cE, 60],
      [2, cA, 90],
      [2, cG, 30],
    ]);
    const cols = marketTimeStack(cs, vol, null, ORDER);
    expect(cols.map((c) => c.total)).toEqual([600, 200, 220]);
    expect(cols[0].byBrand).toEqual([{ brand: 'HUAWEI', vol: 100 }, { brand: 'BETA', vol: 500 }]);
    expect(cols[1].byBrand).toEqual([{ brand: 'BETA', vol: 200 }]);
    expect(cols[2].byBrand).toEqual([
      { brand: 'HUAWEI', vol: 90 },
      { brand: 'BETA', vol: 100 },
      { brand: 'GAMMA', vol: 30 },
    ]);
  });

  it('档位过滤后接环比表：contributionRows 只出该档位品牌/产品行，其他档位变化不计入合计', () => {
    const sub = cs.filter((c) => c.tierCode === '600-800'); // HUAWEI A1 + GAMMA G1
    const prev = new Map<string, number | null>([
      [marketKeyOf(cA), 100],
      [marketKeyOf(cG), 50],
      [marketKeyOf(cB), 300], // 200-400 档位：应被档位过滤挡在表外
    ]);
    const sel = new Map<string, number | null>([
      [marketKeyOf(cA), 94],
      [marketKeyOf(cG), 70],
      [marketKeyOf(cB), 400],
    ]);
    const { rows, total } = contributionRows(sub, prev, sel, 'brand');
    expect(rows.map((r) => [r.key, r.delta])).toEqual([
      ['GAMMA', 20],
      ['HUAWEI', -6],
    ]);
    expect(total).toBe(14); // BETA 的 +100 不入（档位已滤）
    // 产品粒度同口径：两行 = 该档位的两个配置
    const prod = contributionRows(sub, prev, sel, 'product');
    expect(prod.rows.map((r) => [r.key, r.delta])).toEqual([
      [marketKeyOf(cG), 20],
      [marketKeyOf(cA), -6],
    ]);
  });

  it('marketTierOptions：实际出现的档位按产业阶梯序去重；空配置 → 空', () => {
    const ladder = ['<200', '200-400', '400-600', '600-800', '800-1000', '1000+'];
    expect(marketTierOptions(cs, ladder)).toEqual(['200-400', '400-600', '600-800', '800-1000']);
    expect(marketTierOptions([], ladder)).toEqual([]);
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
