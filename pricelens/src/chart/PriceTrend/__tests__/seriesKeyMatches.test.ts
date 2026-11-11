// ============================================================
// seriesKeyMatches · 选择键↔系列键的融资后缀感知匹配（2026-11-11）：
// ZA 月度系列 key 带期数后缀（__i36/__pp），宽表分组 groupsOfCards 用裸键
// 精确相等会整组落空 → 明细表消失（实机 BUG 回归）。
// 同界验证：__ 边界不误吞（watchgt6__ 不匹配 watchgt6pro__…）。
// ============================================================
import { describe, expect, it } from 'vitest';
import { baseKeyOf, compareKeysOfGroups, groupsOfCards, seriesKeyMatches } from '../tableModel';
import type { Series } from '../../../dataModel/types';
import type { MainProduct } from '../../../state/filtersTypes';

const mkSeries = (key: string): Series => ({
  key, isOwn: true, brand: 'Huawei', label: 'Huawei Watch GT 6',
  skuIds: [], color: '#000', points: [],
});

const card = (main: { modelId: string; romram: string }, extra?: Partial<MainProduct>): MainProduct => ({
  id: 'card-1', main: { ...main, skuIds: [] }, compares: [], auto: true, ...extra,
});

describe('seriesKeyMatches · 融资后缀感知键匹配（2026-11-11）', () => {
  it('裸相等或前缀 + __ 边界命中；不同型号不误吞', () => {
    expect(seriesKeyMatches('za-booklet-huawei-watchgt6__规格未标明__i36', 'za-booklet-huawei-watchgt6__规格未标明')).toBe(true);
    expect(seriesKeyMatches('za-booklet-huawei-watchgt6__规格未标明__pp', 'za-booklet-huawei-watchgt6__规格未标明')).toBe(true);
    expect(seriesKeyMatches('za-booklet-huawei-watchgt6__规格未标明', 'za-booklet-huawei-watchgt6__规格未标明')).toBe(true);
    // __ 边界：watchgt6 的选择键不吞 watchgt6pro 的系列
    expect(seriesKeyMatches('za-booklet-huawei-watchgt6pro__46mm', 'za-booklet-huawei-watchgt6__规格未标明')).toBe(false);
    expect(seriesKeyMatches('own-huawei-watch-gt-6__46mm__black', 'own-huawei-watch-gt-6__46mm')).toBe(true);
  });

  it('groupsOfCards：无后缀系列照旧精确命中；融资后缀变体整组认领（明细表回归）', () => {
    const bare = mkSeries('za-booklet-huawei-watchgt6__规格未标明');
    expect(groupsOfCards([card({ modelId: 'za-booklet-huawei-watchgt6', romram: '规格未标明' })], [bare])[0]!.series).toHaveLength(1);
    const variants = [
      mkSeries('za-booklet-huawei-watchgt6__规格未标明__i24'),
      mkSeries('za-booklet-huawei-watchgt6__规格未标明__i36'),
      mkSeries('za-booklet-huawei-watchgt6__规格未标明__i48'),
    ];
    expect(groupsOfCards([card({ modelId: 'za-booklet-huawei-watchgt6', romram: '规格未标明' })], variants)[0]!.series).toHaveLength(3);
  });

  it('baseKeyOf / compareKeysOfGroups：主品后缀变体不算对比品', () => {
    const g = groupsOfCards(
      [card(
        { modelId: 'za-booklet-huawei-watchgt6', romram: '规格未标明' },
        { compares: [{ modelId: 'cmp-apple-watch-se', romram: '42mm', skuIds: [] }] },
      )],
      [mkSeries('za-booklet-huawei-watchgt6__规格未标明__i36'), mkSeries('cmp-apple-watch-se__42mm__midnight')],
    )[0]!;
    expect(baseKeyOf(g)).toBe('za-booklet-huawei-watchgt6__规格未标明');
    expect(compareKeysOfGroups([g])).toEqual(['cmp-apple-watch-se__42mm__midnight']);
  });
});
