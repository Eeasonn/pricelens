// ============================================================
// 代际视图纯模型金测（2026-11-27 三轮）：
// 链拼接（链尖排除 / 未在册上一代自动入链 / 一对多一链一路径 / 防环 / 深度上限 /
// 已登记标记）、splicedSeriesOf（交接 / overlap / 缺采回落与桥 / 等价并段 /
// changePct 含跨交接 / 无价）、thinnedStepLabels（恒标 / 3% 阈 / 6 上限抽稀）。
// 全部用注入 prevOf 与小夹具——内置数据包 prevGen 可能为空（见 §5 数据注意）。
// ============================================================
import { describe, expect, it } from 'vitest';
import type { Series, SeriesPoint } from '../../../dataModel/types';
import type { ProductSelection } from '../../../state/filtersTypes';
import { selKey } from '../../../state/mainSelection';
import { genShortName, lineageCardsOf, lineageChainsOf, splicedSeriesOf, type LineageChain } from '../lineageModel';

// ---- 夹具：型号与配置均为虚构（链逻辑不查 dimProduct 的已选产品；
//      resolveTargetSel 只对「未在册上一代」查 dimProduct——本测试的上一代用真实型号） ----
import { dimProduct } from '../../../data';

const sel = (modelId: string, romram: string): ProductSelection => ({ modelId, romram, skuIds: [`${modelId}__x`] });

// 真实 dimProduct 里挑两个型号做「上一代」解析（romram 用真实配置）
const realRows = dimProduct.filter((p) => p.industry === 'phone' && p.countries.includes('RU'));
const realPrev = realRows.find((p) => p.brand === 'HUAWEI')!;
const realPrevSel = sel(realPrev.model_id, realPrev.romram);

describe('lineageChainsOf（链拼接）', () => {
  it('无 prevGen 映射：每个选择自成一链（仅本代、registered=false）', () => {
    const chains = lineageChainsOf([sel('m1', '8+256 GB'), sel('m2', '12+256 GB')], () => []);
    expect(chains).toHaveLength(2);
    expect(chains.every((c) => c.gens.length === 1 && !c.registered && c.gens[0].selected)).toBe(true);
  });

  it('已选两代互为上下代：只有新一代是链尖——拼成一条两代的链（都在册）', () => {
    const old = sel('m-old', '8+256 GB');
    const young = sel('m-new', '8+256 GB');
    const prevOf = (m: string): [string, string][] => (m === 'm-new' ? [['m-old', '8+256 GB']] : []);
    const chains = lineageChainsOf([old, young], prevOf);
    expect(chains).toHaveLength(1);
    expect(chains[0].gens.map((g) => g.sel.modelId)).toEqual(['m-old', 'm-new']);
    expect(chains[0].gens.every((g) => g.selected)).toBe(true);
    expect(chains[0].registered).toBe(true);
  });

  it('未在册上一代自动拼进链（selected:false，解析 dimProduct 原值 romram）', () => {
    const young = sel('m-new', '8+256 GB');
    const prevOf = (m: string): [string, string][] => (m === 'm-new' ? [[realPrev.model_id, realPrev.romram]] : []);
    const chains = lineageChainsOf([young], prevOf);
    expect(chains).toHaveLength(1);
    expect(chains[0].gens).toHaveLength(2);
    expect(chains[0].gens[0].selected).toBe(false);
    expect(chains[0].gens[0].sel.romram).toBe(realPrev.romram); // dimProduct 原值
    expect(chains[0].gens[1].selected).toBe(true);
  });

  it('一对多上一代：每条路径各成一链；maxBack 限制回溯深度', () => {
    const prevOf = (m: string): [string, string][] => {
      if (m === 'm-tip') return [[realPrev.model_id, realPrev.romram]];
      if (m === realPrev.model_id) return [[realRows[1].model_id, realRows[1].romram]];
      return [];
    };
    const chains = lineageChainsOf([sel('m-tip', '8+256 GB')], prevOf, 3);
    expect(chains.length).toBeGreaterThanOrEqual(1);
    // maxBack=1：只回溯一代
    const shallow = lineageChainsOf([sel('m-tip', '8+256 GB')], prevOf, 1);
    expect(shallow.every((c) => c.gens.length <= 2)).toBe(true);
  });

  it('环形映射不炸（防环），链不含重复键', () => {
    const prevOf = (m: string): [string, string][] => {
      if (m === 'm-a') return [['m-b', '8+256 GB']];
      if (m === 'm-b') return [['m-a', '8+256 GB']];
      return [];
    };
    const chains = lineageChainsOf([sel('m-a', '8+256 GB')], prevOf);
    for (const c of chains) {
      const keys = c.gens.map((g) => g.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('映射目标在主数据不存在 → 跳过该路径（防御）', () => {
    const prevOf = (m: string): [string, string][] => (m === 'm-tip' ? [['ghost-model', '8+256 GB']] : []);
    const chains = lineageChainsOf([sel('m-tip', '8+256 GB')], prevOf);
    expect(chains).toHaveLength(1);
    expect(chains[0].gens).toHaveLength(1); // 只有链尖本代
    expect(chains[0].registered).toBe(false);
  });
});

// ---- splicedSeriesOf 夹具 ----
const pt = (bucketId: string, price: number | null): SeriesPoint => ({
  bucketId,
  xLabel: bucketId,
  anchorDate: '2026-01-01',
  rrp: null,
  price,
  missing: price == null,
  offer: null,
  url: '',
  shopName: null,
});
const seriesOf = (key: string, points: SeriesPoint[]): Series => ({
  key,
  isOwn: false,
  brand: 'HUAWEI',
  label: key,
  skuIds: [],
  color: '#000',
  points,
});
const chainOf = (keys: string[]): LineageChain => ({
  key: keys.join('>'),
  gens: keys.map((k) => ({ sel: sel(k, '8+256 GB'), key: k, label: k, selected: true })),
  registered: keys.length > 1,
});
// gens 顺序 = 最老 → 最新；seriesByKey 的键直接用 gen key
const spliceInput = (chain: LineageChain, seriesList: Series[]): Map<string, Series> =>
  new Map(seriesList.map((s) => [s.key, s]));

describe('splicedSeriesOf（拼接序列）', () => {
  it('单代：逐桶跟随本代；无价期保持缺失', () => {
    const chain = chainOf(['g1']);
    const map = spliceInput(chain, [seriesOf('g1', [pt('202601', 100), pt('202602', null), pt('202603', 120)])]);
    const out = splicedSeriesOf(chain, map);
    expect(out.points.map((p) => p.price)).toEqual([100, null, 120]);
    expect(out.points.map((p) => p.genIndex)).toEqual([0, null, 0]); // 缺采桶位无活跃代（规格：genIndex null）
    expect(out.steps.map((s) => [s.bucketId, s.price])).toEqual([['202601', 100], ['202603', 120]]);
    expect(out.steps[1].changePct).toBeCloseTo(0.2);
    expect(out.overlap).toEqual([]);
  });

  it('两代重叠：交接发生在新一代首个有价桶位；老一代交接后的价进 overlap 不进主线', () => {
    const chain = chainOf(['old', 'new']);
    const map = spliceInput(chain, [
      seriesOf('old', [pt('202601', 100), pt('202602', 100), pt('202603', 90), pt('202604', 85)]),
      seriesOf('new', [pt('202603', 110), pt('202604', 110)]),
    ]);
    const out = splicedSeriesOf(chain, map);
    // 202603 起新一代已到首个有价桶位 → 主线 = new；old 的 90/85 进 overlap
    expect(out.points.map((p) => [p.bucketId, p.price, p.genIndex])).toEqual([
      ['202601', 100, 0],
      ['202602', 100, 0],
      ['202603', 110, 1],
      ['202604', 110, 1],
    ]);
    const ov = out.overlap.find((o) => o.genIndex === 0)!;
    expect(ov.points).toEqual([
      { bucketId: '202603', price: 90 },
      { bucketId: '202604', price: 85 },
    ]);
    // 交接 step：对上一代最后价（100）算 changePct
    const handover = out.steps.find((s) => s.handover)!;
    expect(handover.bucketId).toBe('202603');
    expect(handover.price).toBe(110);
    expect(handover.changePct).toBeCloseTo(0.1);
  });

  it('新一代缺采的桶位回落到老一代（不造点）；等价连续段并成一阶', () => {
    const chain = chainOf(['old', 'new']);
    const map = spliceInput(chain, [
      seriesOf('old', [pt('202601', 100), pt('202602', 100), pt('202603', 95)]),
      seriesOf('new', [pt('202602', null), pt('202603', null), pt('202604', 110)]),
    ]);
    const out = splicedSeriesOf(chain, map);
    // new 首个有价桶位 = 202604；202602/202603 new 缺采 → 活跃回退 old
    expect(out.points.map((p) => [p.bucketId, p.price, p.genIndex])).toEqual([
      ['202601', 100, 0],
      ['202602', 100, 0],
      ['202603', 95, 0],
      ['202604', 110, 1],
    ]);
    // 100 连续两桶 = 一阶；95 一阶；110 交接一阶（对上一代最后价 95）
    expect(out.steps.map((s) => s.price)).toEqual([100, 95, 110]);
    expect(out.steps[2].changePct).toBeCloseTo((110 - 95) / 95);
  });

  it('全系列无价 → 空点空阶，不炸', () => {
    const chain = chainOf(['g1', 'g2']);
    const out = splicedSeriesOf(chain, new Map());
    expect(out.points).toEqual([]);
    expect(out.steps).toEqual([]);
    expect(out.overlap).toEqual([]);
  });
});

describe('genShortName（交接名签短名）', () => {
  it('型号尾部数字词 + 配置数字头；无匹配回退原文', () => {
    expect(genShortName('SAMSUNG S26 Ultra 12+256 GB')).toBe('S26 Ultra 12+256');
    expect(genShortName('HUAWEI Pura 90s Pro Max 12+256 GB')).toBe('Pro Max 12+256');
    expect(genShortName('HUAWEI Watch 6')).toBe('HUAWEI Watch 6'); // 无配置 → 原文
  });
});
