// ============================================================
// 第118轮 大盘分析金测：档位×品牌结构 / 环比贡献拆解 / 排序确定性。
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
