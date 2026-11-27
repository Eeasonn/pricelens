// ============================================================
// 明细表「分析提示」规则层（insights.ts）：阈值边界（恰好 5pp/5% 触发、4.9 不触发）、
// 翻转压制同对价差变化、无基准组跳过成对规则、缺价桶不插值、组内排序、id 稳定。
// ============================================================
import { describe, expect, it } from 'vitest';
import type { Series, SeriesPoint } from '../../../dataModel/types';
import { buildInsights } from '../insights';
import type { DetailBucket, TableGroup } from '../tableModel';

const N = 4;
const buckets: DetailBucket[] = Array.from({ length: N }, (_, i) => ({
  id: `20262${i}`,
  xLabel: `0${i + 1}-07`,
  anchorDate: `2026-0${i + 1}-07`,
}));

const pt = (price: number | null, i: number, suspect?: SeriesPoint['suspect']): SeriesPoint => ({
  bucketId: buckets[i].id,
  xLabel: buckets[i].xLabel,
  anchorDate: buckets[i].anchorDate,
  rrp: null,
  price,
  missing: price == null,
  offer: null,
  url: '',
  shopName: null,
  ...(suspect ? { suspect } : {}),
});

const mk = (key: string, label: string, prices: Array<number | null>): Series => ({
  key,
  isOwn: key === 'main',
  brand: label.split(' ')[0],
  label,
  skuIds: [key],
  color: '#000',
  points: prices.map((p, i) => pt(p, i)),
});

const ctx = { currencyLabel: 'USD', granularityLabel: '周' };
const group = (series: Series[], mainKey: string | null = 'main'): TableGroup => ({ id: 'g1', mainKey, series });
const run = (g: TableGroup, fw: Array<[string, number | null]> = []) =>
  buildInsights([g], buckets, new Map(fw), ctx).get('g1') ?? [];

describe('buildInsights · crossover', () => {
  it('对比品从高于基准翻转为低于基准：一条 crossover，标题带现价差', () => {
    const out = run(group([mk('main', 'HUAWEI Mate', [100, 100, 100, 100]), mk('c', 'APPLE iPhone', [110, 105, 100, 95.9])]));
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('crossover');
    expect(out[0].title).toBe('APPLE iPhone 已低于 HUAWEI Mate（−4.1%）');
    expect(out[0].figures.map((f) => f.value)).toEqual(['+10.0%', '−4.1%', '真实（周度平台实抓）']);
    expect(out[0].bucketId).toBe(buckets[3].id);
    expect(out[0].evidence.map((e) => e.step)).toEqual(['输入', '筛选', '公式', '舍入', '输出']);
  });
  it('翻转压制同一对的 gapShift（价差变化远超 5pp 也只出 crossover）', () => {
    const out = run(group([mk('main', 'HUAWEI Mate', [100, 100, 100, 100]), mk('c', 'APPLE iPhone', [80, 90, 100, 130])]));
    expect(out.map((i) => i.kind)).toEqual(['crossover']);
    expect(out[0].title).toContain('已高于');
  });
});

describe('buildInsights · gapShift 阈值', () => {
  it('恰好 5pp 触发（+3.0% → +8.0% 扩大）', () => {
    const out = run(group([mk('main', 'HUAWEI Mate', [100, 100, 100, 100]), mk('c', 'APPLE iPhone', [103, 104, 106, 108])]));
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('gapShift');
    expect(out[0].title).toBe('APPLE iPhone 相对 HUAWEI Mate 的价差由 +3.0% 扩大到 +8.0%');
  });
  it('4.9pp 不触发', () => {
    const out = run(group([mk('main', 'HUAWEI Mate', [1000, 1000, 1000, 1000]), mk('c', 'APPLE iPhone', [1030, 1040, 1060, 1079])]));
    expect(out).toEqual([]);
  });
  it('价差收窄写「收窄到」', () => {
    const out = run(group([mk('main', 'HUAWEI Mate', [100, 100, 100, 100]), mk('c', 'APPLE iPhone', [112, 110, 108, 105])]));
    expect(out[0].title).toContain('收窄到 +5.0%');
  });
  it('缺价桶不参与：首末取「双方都有价」的桶，不插值', () => {
    // 基准首桶缺价、对比末桶缺价 → 只用第 2、3 桶（+3% → +8%）
    const out = run(group([mk('main', 'HUAWEI Mate', [null, 100, 100, 100]), mk('c', 'APPLE iPhone', [200, 103, 108, null])]));
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('gapShift');
    expect(out[0].bucketId).toBe(buckets[2].id);
    expect(out[0].figures[1].value).toBe('+8.0%');
  });
  it('双方共有价期数 < 2 不出成对规则', () => {
    const out = run(group([mk('main', 'HUAWEI Mate', [100, 100, null, null]), mk('c', 'APPLE iPhone', [null, 150, 90, 80])]));
    expect(out.filter((i) => i.kind === 'crossover' || i.kind === 'gapShift')).toEqual([]);
  });
});

describe('buildInsights · 无基准组', () => {
  it('mainKey = null：跳过成对规则，只出 priceMove/coverage', () => {
    const g = group([mk('a', 'HUAWEI Mate', [100, 100, 100, 100]), mk('c', 'APPLE iPhone', [110, 105, 100, 80])], null);
    const out = run(g, [['c', -0.06]]);
    expect(out.map((i) => i.kind)).toEqual(['priceMove']);
  });
});

describe('buildInsights · priceMove 阈值', () => {
  const g = () => group([mk('main', 'HUAWEI Mate', [100, 100, 100, 100])]);
  it('恰好 −5% 触发，标题「降价 5.0%」', () => {
    const out = run(g(), [['main', -0.05]]);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('HUAWEI Mate 近 4 周降价 5.0%');
    expect(out[0].figures[0].value).toBe('−5.0%');
  });
  it('+6.2% 写「涨价」', () => {
    expect(run(g(), [['main', 0.062]])[0].title).toBe('HUAWEI Mate 近 4 周涨价 6.2%');
  });
  it('4.9% 与 null 不触发', () => {
    expect(run(g(), [['main', 0.049]])).toEqual([]);
    expect(run(g(), [['main', null]])).toEqual([]);
  });
});

describe('buildInsights · coverage', () => {
  it('有价 < 50% 触发；恰好 50% 不触发；隔离点算无价', () => {
    const one = run(group([mk('main', 'HUAWEI Mate', [100, null, null, null])]));
    expect(one.map((i) => i.title)).toEqual(['HUAWEI Mate 可见区间仅 1/4 期有价，结论需谨慎']);
    expect(run(group([mk('main', 'HUAWEI Mate', [100, 100, null, null])]))).toEqual([]);
    const s = mk('main', 'HUAWEI Mate', [100, 100, null, null]);
    s.points[1] = pt(100, 1, 'quarantined');
    expect(run(group([s])).map((i) => i.kind)).toEqual(['coverage']);
  });
});

describe('buildInsights · 排序与 id', () => {
  it('severity 降序，同级按幅度降序；id 跨次计算稳定', () => {
    const g = group([
      mk('main', 'HUAWEI Mate', [100, 100, 100, 100]),
      mk('c1', 'APPLE iPhone', [103, 104, 106, 108]), // gapShift 5pp
      mk('c2', 'SAMSUNG Galaxy', [100, 105, 110, 120]), // gapShift 20pp
      mk('c3', 'XIAOMI 15', [110, 100, 95, 90]), // crossover
      mk('c4', 'HONOR Magic', [null, null, null, 100]), // coverage
    ]);
    const fw: Array<[string, number | null]> = [['main', -0.07], ['c1', 0.12]];
    const a = run(g, fw);
    expect(a.map((i) => `${i.kind}:${i.seriesKey}`)).toEqual([
      'crossover:c3',
      'gapShift:c2',
      'gapShift:c1',
      'priceMove:c1',
      'priceMove:main',
      'coverage:c4',
    ]);
    const b = run(g, fw);
    expect(b.map((i) => i.id)).toEqual(a.map((i) => i.id));
    expect(a[0].id).toBe(`crossover|c3|main|${buckets[3].id}`);
  });
  it('文案不含因果断言', () => {
    const g = group([mk('main', 'HUAWEI Mate', [100, 100, 100, 100]), mk('c', 'APPLE iPhone', [110, 105, 100, 95])]);
    for (const it of run(g, [['c', -0.1]])) {
      expect(it.title).not.toMatch(/因为|导致|由于/);
      for (const e of it.evidence) expect(e.text).not.toMatch(/因为|导致|由于/);
    }
  });
});
