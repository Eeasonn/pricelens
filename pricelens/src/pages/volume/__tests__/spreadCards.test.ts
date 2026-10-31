import { describe, expect, it } from 'vitest';
import { pricePointValid, rangeSpreadOf, volumePointValid } from '../periodSummary';
import {
  SPREAD_CARD_H,
  SPREAD_CARD_W,
  spreadCardBandBox,
  spreadCardModel,
  spreadCardPlan,
  type SpreadExtremeMark,
} from '../spreadCards';

const formatMoney = (value: number) => `$${Math.round(value)}`;
const formatCount = (value: number) => String(Math.round(value));

describe('区间极差卡片', () => {
  it('价格卡读出最高、最低、绝对差值和极差率', () => {
    const spread = rangeSpreadOf([1103, null, 863], pricePointValid);
    const card = spreadCardModel(spread, formatMoney, '价格');
    expect(card.visible).toBe(true);
    expect(card.high).toBe('$1103');
    expect(card.low).toBe('$863');
    expect(card.middle).toBe('$240 · 27.8%');
    expect(card.ariaLabel).toBe('价格区间最高 $1103，最低 $863，极差 $240，极差率 27.8%');
  });

  it('最低销量为 0 时中间只留绝对量差和 —', () => {
    const card = spreadCardModel(rangeSpreadOf([0, null, 40], volumePointValid), formatCount, '销量');
    expect(card.middle).toBe('40 · —');
    expect(card.ariaLabel).toContain('极差率 —');
  });

  it('单点或常量序列极差为 0 · 0.0%', () => {
    const single = spreadCardModel(rangeSpreadOf([null, 863], pricePointValid), formatMoney, '价格');
    expect(single.middle).toBe('$0 · 0.0%');
    expect(single.high).toBe(single.low);
    const flat = spreadCardModel(rangeSpreadOf([12, 12, 12], pricePointValid), formatMoney, '价格');
    expect(flat.middle).toBe('$0 · 0.0%');
  });

  it('没有有效点时不显示卡片', () => {
    expect(spreadCardModel(rangeSpreadOf([null, null], pricePointValid), formatMoney, '价格').visible).toBe(false);
  });

  it('价格卡贴左缘、销量卡贴右缘，各自居中夹在自己的虚线之间', () => {
    const plan = spreadCardPlan({
      plotLeft: 16,
      plotTop: 14,
      plotWidth: 640,
      plotHeight: 280,
      extremeMarks: [{ x: 320, y: 250 }],
      priceBandY: [40, 200],
      volumeBandY: [100, 180],
    });
    expect(plan.place).toBe('plot');
    expect(plan.price.left).toBe(24);
    expect(plan.price.height).toBe(SPREAD_CARD_H);
    expect(plan.volume.height).toBe(plan.price.height);
    expect(plan.price.top).toBe((40 + 200) / 2 - SPREAD_CARD_H / 2);
    expect(plan.volume.top).toBe((100 + 180) / 2 - SPREAD_CARD_H / 2);
    expect(plan.volume.top).not.toBe(plan.price.top);
    expect(plan.volume.left).toBe(16 + 640 - SPREAD_CARD_W - 8);
    expect(plan.volume.left).toBeGreaterThan(plan.price.left + plan.price.width);
  });

  it('虚线间距再大，两张卡也保持同一高度并居中', () => {
    const wide = spreadCardBandBox(40, 200, 14, 280);
    expect(wide).toEqual({ top: (40 + 200) / 2 - SPREAD_CARD_H / 2, height: SPREAD_CARD_H });
    const tight = spreadCardBandBox(270, 290, 14, 280);
    expect(tight.height).toBe(SPREAD_CARD_H);
    expect(tight.top + tight.height).toBeLessThanOrEqual(14 + 280);
  });

  it('销量卡停在本图右缘内，不伸进下一张图', () => {
    const plan = spreadCardPlan({
      plotLeft: 16,
      plotTop: 14,
      plotWidth: 400,
      plotHeight: 280,
      extremeMarks: [],
      frameRight: 486,
    });
    expect(plan.place).toBe('plot');
    expect(plan.volume.left + plan.volume.width).toBeLessThanOrEqual(486);
    expect(plan.volume.left + plan.volume.width).toBeLessThanOrEqual(16 + 400);
  });

  it('销量卡压住最低点及其标签时上下挪开，不改变左右位置', () => {
    const dot: SpreadExtremeMark = { x: 340, y: 150, label: 'below' };
    const plan = spreadCardPlan({
      plotLeft: 16,
      plotTop: 14,
      plotWidth: 400,
      plotHeight: 280,
      extremeMarks: [dot],
      volumeBandY: [100, 180],
    });
    const centeredTop = (100 + 180) / 2 - SPREAD_CARD_H / 2;
    expect(plan.volume.left).toBe(16 + 400 - SPREAD_CARD_W - 8);
    expect(plan.volume.top).not.toBe(centeredTop);
    // 挪开后与圆点、标签都不相交
    const labelTop = dot.y + 5;
    const clear = plan.volume.top + plan.volume.height <= labelTop || plan.volume.top >= labelTop + 16;
    expect(clear).toBe(true);
    expect(plan.volume.top + plan.volume.height).toBeLessThanOrEqual(14 + 280);
  });

  it('带内带外都挪不开时回落到居中位', () => {
    const plan = spreadCardPlan({
      plotLeft: 16,
      plotTop: 14,
      plotWidth: 400,
      plotHeight: 72,
      extremeMarks: [{ x: 340, y: 50 }],
      volumeBandY: [40, 60],
    });
    expect(plan.volume.top).toBe(14);
  });

  it('窄图上两张卡上下错开，不互相叠压', () => {
    const plan = spreadCardPlan({
      plotLeft: 16,
      plotTop: 14,
      plotWidth: 200,
      plotHeight: 280,
      extremeMarks: [],
      priceBandY: [40, 140],
      volumeBandY: [50, 130],
    });
    const priceBottom = plan.price.top + plan.price.height;
    const overlapY = plan.volume.top < priceBottom && plan.price.top < plan.volume.top + plan.volume.height;
    const overlapX = plan.volume.left < plan.price.left + plan.price.width && plan.price.left < plan.volume.left + plan.volume.width;
    expect(overlapX && overlapY).toBe(false);
  });
});
