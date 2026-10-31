import { describe, expect, it } from 'vitest';
import type { MainProduct } from '../../../state/filtersTypes';
import { validVolumeViewMode, volumeProductRefs } from '../volumeView';

const sel = (modelId: string, romram = '12+256 GB') => ({ modelId, romram, skuIds: [`${modelId}__${romram}`] });
const cards: MainProduct[] = [
  { id: 'a', main: sel('own-a'), compares: [sel('comp-a1'), sel('comp-a2')] },
  { id: 'b', main: sel('own-b'), compares: [sel('comp-b1')] },
  { id: 'empty', main: null, compares: [sel('comp-empty')] },
];

describe('volumeProductRefs', () => {
  it('主视图只保留各卡主品并跳过空主品卡', () => {
    const rows = volumeProductRefs(cards, { kind: 'mains' });
    expect(rows.map((r) => [r.cardId, r.selection.modelId, r.isMain])).toEqual([
      ['a', 'own-a', true],
      ['b', 'own-b', true],
    ]);
  });

  it('组内视图按 cardId 返回主品与全部竞品', () => {
    const rows = volumeProductRefs(cards, { kind: 'group', cardId: 'a' });
    expect(rows.map((r) => [r.selection.modelId, r.isMain])).toEqual([
      ['own-a', true],
      ['comp-a1', false],
      ['comp-a2', false],
    ]);
  });

  it('组不存在或主品被删除时回主视图', () => {
    expect(validVolumeViewMode(cards, { kind: 'group', cardId: 'missing' })).toEqual({ kind: 'mains' });
    expect(validVolumeViewMode(cards, { kind: 'group', cardId: 'empty' })).toEqual({ kind: 'mains' });
  });

  it('组内模式不读取其他组产品', () => {
    const rows = volumeProductRefs(cards, { kind: 'group', cardId: 'b' });
    expect(rows.map((r) => r.selection.modelId)).toEqual(['own-b', 'comp-b1']);
    expect(rows.some((r) => r.selection.modelId === 'comp-a1')).toBe(false);
  });

  it('同型号同配置跨卡去重且保留先出现者', () => {
    const duplicated: MainProduct[] = [
      { id: 'a', main: sel('same'), compares: [] },
      { id: 'b', main: sel('same'), compares: [] },
    ];
    expect(volumeProductRefs(duplicated, { kind: 'mains' }).map((r) => r.cardId)).toEqual(['a']);
  });
});
