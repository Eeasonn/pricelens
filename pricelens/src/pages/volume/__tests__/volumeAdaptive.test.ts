import { describe, expect, it } from 'vitest';
import { volumeAdaptiveSeries } from '../volumeAdaptive';

const panels = [
  { isMain: true, series: ['own-a'] },
  { isMain: false, series: ['comp-a'] },
  { isMain: true, series: ['own-b'] },
];

describe('volumeAdaptiveSeries', () => {
  it('主产品视图只保留主产品序列', () => {
    expect(volumeAdaptiveSeries(panels, { kind: 'mains' })).toEqual(['own-a', 'own-b']);
  });

  it('组内对比保留画面上的主品和竞品', () => {
    expect(volumeAdaptiveSeries(panels, { kind: 'group', cardId: 'a' })).toEqual(['own-a', 'comp-a', 'own-b']);
  });
});
