// ============================================================
// 「价差与明细」宽表纯计算层测试（第一百二十三轮）：钉住按组分块的基准规则
// （主品在组内才是基准；空对/主品无数据不出价差）、按卡归组（groupsOfCards：
// 卡序/主品在前/空对/缺数据跳过/同一对比被多卡引用各组各出）、系列 key 同构、
// 日期列文案、折扣率/最新时点/Offering 文案。
// ============================================================
import { describe, expect, it } from 'vitest';
import type { Series, SeriesPoint } from '../../../dataModel/types';
import type { MainProduct, ProductSelection } from '../../../state/filtersTypes';
import {
  compareKeysOfGroups,
  baseKeyOf,
  bucketDateText,
  discountOf,
  fmtPct,
  groupNumText,
  groupOrdinal,
  groupsOfCards,
  onlyMainState,
  latestIdxOf,
  offerText,
  seriesKeyOf,
} from '../tableModel';
import * as tableModel from '../tableModel';

const PT = (price: number | null, rrp: number | null = null): SeriesPoint => ({
  bucketId: '202601',
  xLabel: '01-07',
  anchorDate: '2026-01-07',
  rrp,
  price,
  missing: price == null,
  offer: null,
  url: 'https://example.test',
  shopName: null,
});

const mk = (key: string, isOwn = false): Series => ({
  key,
  isOwn,
  brand: isOwn ? 'HUAWEI' : 'SAMSUNG',
  label: `${key} 12+256 GB`,
  skuIds: [key],
  color: '#000',
  points: [PT(100, 120), PT(null), PT(90, 120)],
});

describe('recentFourWeekChange：最近 4 周均价对比此前 4 周均价', () => {
  const changeOf = (prices: (number | null)[]): number | null | undefined => {
    const fn = (tableModel as typeof tableModel & {
      recentFourWeekChange?: (points: ReadonlyArray<Pick<SeriesPoint, 'price'>>) => number | null;
    }).recentFourWeekChange;
    return fn?.(prices.map((price) => PT(price)));
  };

  it('两个窗口各取均价，不退化为最新两周涨跌', () => {
    expect(changeOf([100, 120, 80, 100, 110, 120, 130, 140])).toBeCloseTo(0.25, 10);
  });

  it('窗口内忽略缺价周，按各自有效周均价计算', () => {
    expect(changeOf([100, null, 80, 120, 110, null, 130, 150])).toBeCloseTo(0.3, 10);
  });

  it('此前窗口完全无有效价格时返回 null', () => {
    expect(changeOf([null, null, null, null, 100, 110, 120, 130])).toBeNull();
  });
});

describe('seriesKeyOf：勾选组 → 系列 key 与 buildSeries 同构', () => {
  it('配置去空格后以 __ 连接', () => {
    expect(seriesKeyOf({ modelId: 'own-HUAWEI-Pura90sProMax', romram: '12+256 GB' })).toBe('own-HUAWEI-Pura90sProMax__12+256GB');
  });
});

describe('baseKeyOf：价差基准 = 本组主分析产品', () => {
  it('主品在组内 → 主品 key（即使不是首个/非自有）', () => {
    expect(baseKeyOf({ mainKey: 'b', series: [mk('a', true), mk('b')] })).toBe('b');
  });
  it('空对（mainKey null）→ null，不退化到自有/首个系列', () => {
    expect(baseKeyOf({ mainKey: null, series: [mk('a', true), mk('b')] })).toBeNull();
  });
  it('主品在所选范围内无数据（组内无该系列）→ null', () => {
    expect(baseKeyOf({ mainKey: 'x', series: [mk('a', true)] })).toBeNull();
  });
});

describe('groupsOfCards：按卡归组（图例带/宽表共用取数口）', () => {
  const sel = (modelId: string): ProductSelection => ({ modelId, romram: '12+256 GB', skuIds: [] });
  // 系列 key 与 seriesKeyOf 同构：`a` → `a__12+256GB`
  const K = (m: string): string => seriesKeyOf(sel(m));
  const card = (id: string, main: string | null, compares: string[] = []): MainProduct => ({
    id,
    main: main == null ? null : sel(main),
    compares: compares.map(sel),
  });

  it('卡序保持：输出组 = 卡序，id = 卡 id，ordinal 从 1 起', () => {
    const gs = groupsOfCards([card('c2', 'd'), card('c1', 'a')], [mk(K('a')), mk(K('d'))]);
    expect(gs.map((g) => g.id)).toEqual(['c2', 'c1']);
    expect(gs.map((g) => g.ordinal)).toEqual([1, 2]);
  });

  it('主品在前 + 对比按卡内序（series 乱序传入不影响的组内排序）', () => {
    const gs = groupsOfCards(
      [card('c1', 'a', ['b', 'c'])],
      [mk(K('c')), mk(K('b')), mk(K('a'))], // 乱序
    );
    expect(gs[0].series.map((s) => s.key)).toEqual([K('a'), K('b'), K('c')]);
    expect(gs[0].mainKey).toBe(K('a'));
  });

  it('空对：mainKey null、组内无主品（对比照常按卡内序）', () => {
    const gs = groupsOfCards([card('c0', null, ['b', 'a'])], [mk(K('a')), mk(K('b'))]);
    expect(gs[0].mainKey).toBeNull();
    expect(gs[0].series.map((s) => s.key)).toEqual([K('b'), K('a')]);
  });

  it('缺数据跳过：所选系列不在 series 列表时不产出条目；主品缺数据时 mainKey 保留、基准为 null', () => {
    const gs = groupsOfCards([card('c1', 'a', ['x', 'b'])], [mk(K('a')), mk(K('b'))]);
    expect(gs[0].series.map((s) => s.key)).toEqual([K('a'), K('b')]);
    const gs2 = groupsOfCards([card('c2', 'z', ['b'])], [mk(K('b'))]);
    expect(gs2[0].mainKey).toBe(K('z'));
    expect(gs2[0].series.map((s) => s.key)).toEqual([K('b')]);
    expect(baseKeyOf(gs2[0])).toBeNull();
  });

  it('同一对比被多卡引用：各组各出一条（同一实例引用，hidden 状态天然同步）', () => {
    const sB = mk(K('b'));
    const gs = groupsOfCards([card('c1', 'a', ['b']), card('c2', 'c', ['b'])], [mk(K('a')), sB, mk(K('c'))]);
    expect(gs[0].series.map((s) => s.key)).toEqual([K('a'), K('b')]);
    expect(gs[1].series.map((s) => s.key)).toEqual([K('c'), K('b')]);
    expect(gs[0].series[1]).toBe(sB); // 同一引用
  });

  it('某产品既是甲组主品又是乙组对比：两组各自按角色归位', () => {
    const gs = groupsOfCards([card('c1', 'a', ['b']), card('c2', 'b', ['c'])], [mk(K('a')), mk(K('b')), mk(K('c'))]);
    expect(gs[0].series.map((s) => s.key)).toEqual([K('a'), K('b')]);
    expect(gs[1].mainKey).toBe(K('b'));
    expect(gs[1].series.map((s) => s.key)).toEqual([K('b'), K('c')]);
  });

  it('全组缺数据的卡仍占组位（ordinal 不跳号），组内为空数组', () => {
    const gs = groupsOfCards([card('c1', 'a', []), card('c2', 'z', ['x'])], [mk(K('a'))]);
    expect(gs.map((g) => g.ordinal)).toEqual([1, 2]);
    expect(gs[1].series).toEqual([]);
  });
});

describe('列头日期与单元格文案', () => {
  it('bucketDateText：周原样、月 YYYY-MM、季原样', () => {
    expect(bucketDateText('week', '10-07')).toBe('10-07');
    expect(bucketDateText('month', '202610')).toBe('2026-10');
    expect(bucketDateText('quarter', '2026Q4')).toBe('2026Q4');
  });
  it('fmtPct：带符号一位小数，|x|<0.05% 归 0.0%', () => {
    expect(fmtPct(-0.1234)).toBe('−12.3%');
    expect(fmtPct(0.005)).toBe('+0.5%');
    expect(fmtPct(0.0004)).toBe('0.0%');
  });
  it('discountOf：折后价/RRP−1；缺价或 RRP 非正为 null', () => {
    expect(discountOf({ price: 90, rrp: 120 })).toBeCloseTo(-0.25);
    expect(discountOf({ price: null, rrp: 120 })).toBeNull();
    expect(discountOf({ price: 90, rrp: 0 })).toBeNull();
    expect(discountOf(undefined)).toBeNull();
  });
  it('latestIdxOf：最后一个有价或有 RRP 的下标；全缺 -1', () => {
    expect(latestIdxOf(mk('a'), 3)).toBe(2);
    expect(latestIdxOf({ points: [PT(null), PT(null)] }, 2)).toBe(-1);
    expect(latestIdxOf(mk('a'), 2)).toBe(0); // 只看前 n 桶
  });
  it('offerText：无权益空串；有权益按「；」连接明细', () => {
    expect(offerText({ offer: null })).toBe('');
    expect(
      offerText({
        offer: {
          discount: { kind: 'discount', headline: '券 −10%', detail: '满减券 −10%', anchorDate: '2026-01-07' },
          installment: null,
          gift: { kind: 'gift', headline: '赠耳机', detail: '赠无线耳机', anchorDate: '2026-01-07' },
        } as unknown as SeriesPoint['offer'],
      }),
    ).toBe('满减券 −10%；赠无线耳机');
  });
  it('groupOrdinal：第 N 组', () => {
    expect(groupOrdinal(2)).toBe('第 2 组');
  });
  it('groupNumText：宽表组头只留数字（图例带仍用 groupOrdinal）', () => {
    expect(groupNumText(2)).toBe('2');
    expect(groupNumText(11)).toBe('11');
  });
});

describe('全局「仅查看主产品」（第一百七十四轮上移标题行、跨组生效）', () => {
  const sel = (modelId: string): ProductSelection => ({ modelId, romram: '12+256 GB', skuIds: [] });
  const K = (m: string): string => seriesKeyOf(sel(m));
  const card = (id: string, main: string | null, compares: string[] = []): MainProduct => ({
    id,
    main: main == null ? null : sel(main),
    compares: compares.map(sel),
  });

  it('compareKeysOfGroups：全部组的对比系列并集，不含各卡主品', () => {
    const gs = groupsOfCards([card('c1', 'a', ['b', 'c']), card('c2', 'd', ['b'])], [mk(K('a')), mk(K('b')), mk(K('c')), mk(K('d'))]);
    expect(compareKeysOfGroups(gs)).toEqual([K('b'), K('c'), K('b')]);
  });

  it('空对（mainKey null）组内系列全部算对比', () => {
    const gs = groupsOfCards([card('c0', null, ['b'])], [mk(K('b'))]);
    expect(compareKeysOfGroups(gs)).toEqual([K('b')]);
  });

  it('onlyMainState：全藏 = active；有没藏的 = 未激活；无对比 = hasCompares false', () => {
    const gs = groupsOfCards([card('c1', 'a', ['b', 'c'])], [mk(K('a')), mk(K('b')), mk(K('c'))]);
    expect(onlyMainState(gs, new Set())).toEqual({ hasCompares: true, active: false });
    expect(onlyMainState(gs, new Set([K('b')]))).toEqual({ hasCompares: true, active: false });
    expect(onlyMainState(gs, new Set([K('b'), K('c')]))).toEqual({ hasCompares: true, active: true });
    const noCmp = groupsOfCards([card('c1', 'a')], [mk(K('a'))]);
    expect(onlyMainState(noCmp, new Set())).toEqual({ hasCompares: false, active: false });
  });
});
