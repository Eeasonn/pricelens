import { describe, expect, it } from 'vitest';
import { pricePointValid, rangeSpreadOf, volumePointValid } from '../periodSummary';
import { SPREAD_CARD_H, SPREAD_CARD_W, spreadCardModel, spreadCardRow } from '../spreadCards';

const formatMoney = (value: number) => `$${Math.round(value)}`;
const formatCount = (value: number) => String(Math.round(value));

describe('区间幅度卡', () => {
  it('主读数是极差率，其次是绝对差值，最低到最高只作依据', () => {
    const card = spreadCardModel(rangeSpreadOf([1103, null, 863], pricePointValid), formatMoney, '价格');
    expect(card.visible).toBe(true);
    expect(card.primary).toBe('27.8%');
    expect(card.secondary).toBe('$240');
    expect(card.span).toBe('$863–$1103');
    expect(card.ariaLabel).toBe('价格极差率 27.8%，极差 $240，最低 $863，最高 $1103');
  });

  it('最低销量为 0 时主读数改成绝对量差，比例为 —', () => {
    const card = spreadCardModel(rangeSpreadOf([0, null, 40], volumePointValid), formatCount, '销量');
    expect(card.primary).toBe('40');
    expect(card.secondary).toBe('—');
    expect(card.span).toBe('0–40');
    expect(card.ariaLabel).toContain('极差率 —');
  });

  it('单点或常量序列显示 0 和 0.0%', () => {
    const single = spreadCardModel(rangeSpreadOf([null, 863], pricePointValid), formatMoney, '价格');
    expect(single.primary).toBe('0.0%');
    expect(single.secondary).toBe('$0');
    expect(single.span).toBe('$863–$863');
    const flat = spreadCardModel(rangeSpreadOf([12, 12, 12], pricePointValid), formatMoney, '价格');
    expect(flat.primary).toBe('0.0%');
    expect(flat.secondary).toBe('$0');
  });

  it('没有有效点时不显示卡片', () => {
    expect(spreadCardModel(rangeSpreadOf([null, null], pricePointValid), formatMoney, '价格').visible).toBe(false);
  });

  it('两张卡同尺寸，分别贴住主图左右缘，互不重叠', () => {
    const row = spreadCardRow(16, 640);
    expect(row.height).toBe(SPREAD_CARD_H);
    expect(row.width).toBe(SPREAD_CARD_W);
    expect(row.priceLeft).toBe(16);
    expect(row.volumeLeft + row.width).toBe(16 + 640);
    expect(row.volumeLeft).toBeGreaterThanOrEqual(row.priceLeft + row.width);
  });

  it('绘图区放不下两张全宽卡时一起缩小，仍然左右对齐且不重叠', () => {
    const row = spreadCardRow(8, 180);
    expect(row.width).toBeLessThan(SPREAD_CARD_W);
    expect(row.priceLeft).toBe(8);
    expect(row.volumeLeft + row.width).toBe(8 + 180);
    expect(row.volumeLeft).toBeGreaterThanOrEqual(row.priceLeft + row.width);
    expect(row.height).toBe(SPREAD_CARD_H);
  });
});
