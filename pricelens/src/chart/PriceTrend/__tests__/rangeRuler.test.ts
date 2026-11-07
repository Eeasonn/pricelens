import { describe, expect, it } from 'vitest';
import {
  brushInWindow,
  rangeRulerOf,
  rangeRulerTexts,
  rulerColumnOf,
  rulerLayerOf,
  rulerSummaryOf,
  volumeBandMaxOf,
  type RangeRuler,
} from '../rangeRuler';

const price = (v: number | null | undefined): v is number => v != null && v > 0;
const volume = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);

describe('rangeRulerOf · 区间极差', () => {
  it('取区间内最早的最高点与最早的最低点，率相对最低', () => {
    const r = rangeRulerOf([583, null, 697, 733, 585, 525, 532, 525], 2, 7, 'extreme', price);
    expect(r.state).toBe('ok');
    if (r.state !== 'ok') return;
    expect(r.a).toEqual({ index: 3, value: 733 });
    expect(r.b).toEqual({ index: 5, value: 525 });
    expect(r.dir).toBe(0);
    expect(r.delta).toBe(208);
    expect(r.rate).toBeCloseTo((208 / 525) * 100, 6);
  });

  it('最低为 0 时率不可算（销量）', () => {
    const r = rangeRulerOf([0, 120, 80], 0, 2, 'extreme', volume);
    expect(r.state).toBe('ok');
    if (r.state !== 'ok') return;
    expect(r.rate).toBeNull();
    expect(r.delta).toBe(120);
  });

  it('全部相等 = flat', () => {
    const r = rangeRulerOf([600, 600, 600], 0, 2, 'extreme', price);
    expect(r.state).toBe('flat');
  });
});

describe('rangeRulerOf · 区间涨跌', () => {
  it('期初 / 期末取最早、最晚的有效桶，缺采不插值', () => {
    const r = rangeRulerOf([null, 525, 678, 600, null], 0, 4, 'trend', price);
    expect(r.state).toBe('ok');
    if (r.state !== 'ok') return;
    expect(r.a).toEqual({ index: 1, value: 525 });
    expect(r.b).toEqual({ index: 3, value: 600 });
    expect(r.dir).toBe(1);
    expect(r.delta).toBe(75);
    expect(r.rate).toBeCloseTo((75 / 525) * 100, 6);
  });

  it('下跌方向为 −1', () => {
    const r = rangeRulerOf([617, 580, 595], 0, 2, 'trend', price);
    expect(r.state === 'ok' && r.dir).toBe(-1);
  });

  it('期末等于期初 = flat', () => {
    const r = rangeRulerOf([600, 650, 600], 0, 2, 'trend', price);
    expect(r.state).toBe('flat');
  });
});

describe('rangeRulerOf · 边界', () => {
  it('区间内只有 1 个有效桶 = single', () => {
    expect(rangeRulerOf([null, 577, null], 0, 2, 'extreme', price).state).toBe('single');
    expect(rangeRulerOf([null, 577, null], 0, 2, 'trend', price).state).toBe('single');
  });

  it('区间内没有有效桶 = empty', () => {
    expect(rangeRulerOf([583, null, null, 697], 1, 2, 'extreme', price).state).toBe('empty');
  });

  it('有效判定可排除隔离点', () => {
    const quarantined = new Set([1]);
    const valid = (v: number | null | undefined, i: number): v is number => price(v) && !quarantined.has(i);
    const r = rangeRulerOf([600, 9999, 610], 0, 2, 'extreme', valid);
    expect(r.state === 'ok' && r.a.value).toBe(610);
  });

  it('起止颠倒时按升序处理', () => {
    const r = rangeRulerOf([500, 600, 700], 2, 0, 'trend', price);
    expect(r.state === 'ok' && r.a.index).toBe(0);
  });
});

describe('rangeRulerTexts', () => {
  const usd = (n: number): string => `$${Math.round(n).toLocaleString('en-US')}`;
  const ok = (over: Partial<Extract<RangeRuler, { state: 'ok' }>>): RangeRuler => ({
    state: 'ok',
    a: { index: 0, value: 678 },
    b: { index: 1, value: 525 },
    dir: 0,
    delta: 153,
    rate: 29.142857,
    ...over,
  });

  it('区间极差：第一行率，第二行金额，不带正负号', () => {
    expect(rangeRulerTexts(ok({}), { kind: 'price', formatPrice: usd, unitNoun: '周' })).toEqual({
      primary: '29.1%',
      secondary: '$153',
    });
  });

  it('区间涨跌：两行都带正负号（减号用 −）', () => {
    expect(
      rangeRulerTexts(ok({ dir: -1, delta: -22, rate: -3.565 }), { kind: 'price', formatPrice: usd, unitNoun: '周' }),
    ).toEqual({ primary: '−3.6%', secondary: '−$22' });
    expect(
      rangeRulerTexts(ok({ dir: 1, delta: 814, rate: 37.7 }), { kind: 'volume', formatPrice: usd, unitNoun: '周' }),
    ).toEqual({ primary: '+37.7%', secondary: '+814 台' });
  });

  it('销量两端都 ≥ 1 万时用万单位', () => {
    const r = ok({ a: { index: 0, value: 41177 }, b: { index: 1, value: 14579 }, delta: 26598, rate: 182.4 });
    expect(rangeRulerTexts(r, { kind: 'volume', formatPrice: usd, unitNoun: '季' })).toEqual({
      primary: '182.4%',
      secondary: '2.7万台',
    });
  });

  it('率不可算显示 —', () => {
    expect(rangeRulerTexts(ok({ rate: null }), { kind: 'price', formatPrice: usd, unitNoun: '周' }).primary).toBe('—');
  });

  it('flat：极差 0.0%，涨跌 ±0.0%，数量为 0', () => {
    const flat: RangeRuler = { state: 'flat', a: { index: 0, value: 600 }, b: { index: 2, value: 600 } };
    expect(rangeRulerTexts(flat, { kind: 'price', formatPrice: usd, unitNoun: '周', mode: 'extreme' })).toEqual({
      primary: '0.0%',
      secondary: '$0',
    });
    expect(rangeRulerTexts(flat, { kind: 'volume', formatPrice: usd, unitNoun: '周', mode: 'trend' })).toEqual({
      primary: '±0.0%',
      secondary: '0 台',
    });
  });

  it('single：— 与「仅 1 个有效周」', () => {
    const single: RangeRuler = { state: 'single', a: { index: 1, value: 577 } };
    expect(rangeRulerTexts(single, { kind: 'price', formatPrice: usd, unitNoun: '月' })).toEqual({
      primary: '—',
      secondary: '仅 1 个有效月',
    });
  });
});

describe('rulerColumnOf', () => {
  it('选区右侧放得下 → 右外侧', () => {
    expect(rulerColumnOf({ bandLeft: 300, bandRight: 600, plotLeft: 100, plotRight: 1000, chipW: 60 })).toEqual({
      x: 642,
      side: 'right',
    });
  });

  it('右侧放不下 → 左外侧', () => {
    expect(rulerColumnOf({ bandLeft: 700, bandRight: 980, plotLeft: 100, plotRight: 1000, chipW: 60 })).toEqual({
      x: 658,
      side: 'left',
    });
  });

  it('两侧都放不下 → 选区内靠右', () => {
    expect(rulerColumnOf({ bandLeft: 110, bandRight: 990, plotLeft: 100, plotRight: 1000, chipW: 60 })).toEqual({
      x: 950,
      side: 'inside',
    });
  });
});

describe('volumeBandMaxOf', () => {
  it('留 10% 余量后按细档取整', () => {
    expect(volumeBandMaxOf(4582)).toBe(6000);
    expect(volumeBandMaxOf(4089)).toBe(5000);
    expect(volumeBandMaxOf(15068)).toBe(20000);
    expect(volumeBandMaxOf(41177)).toBe(50000);
    expect(volumeBandMaxOf(1050)).toBe(1200);
  });

  it('无数据为 0', () => {
    expect(volumeBandMaxOf(0)).toBe(0);
    expect(volumeBandMaxOf(Number.NaN)).toBe(0);
  });
});

describe('rulerLayerOf', () => {
  const measure = (t: string, size: number): number => t.length * size * 0.6;
  const base = {
    unitNoun: '周',
    plotLeft: 100,
    plotRight: 1100,
    colW: 40,
    formatPrice: (v: number): string => `$${Math.round(v)}`,
    measure,
  };
  const priceSide = (values: (number | null)[]) => ({
    kind: 'price' as const,
    values,
    valid: price,
    yOf: (v: number) => 400 - v / 2,
    top: 16,
    bottom: 400,
    color: '#c7000b',
  });
  const volSide = (values: (number | null)[]) => ({
    kind: 'volume' as const,
    values,
    valid: volume,
    yOf: (v: number) => 560 - v / 50,
    top: 401,
    bottom: 560,
    color: '#c7000b',
  });

  it('两层幅度框同宽、同一条竖线，框心在两点中间', () => {
    const m = rulerLayerOf({
      ...base,
      mode: 'extreme',
      start: 2,
      end: 5,
      sides: [priceSide([500, 520, 678, 600, 525, 560]), volSide([1000, 2000, 4000, 3000, 2100, 2500])],
    });
    expect(m.single).toBe(false);
    expect(m.bandLeft).toBe(180);
    expect(m.bandRight).toBe(340);
    expect(m.side).toBe('right');
    expect(m.parts).toHaveLength(2);
    const [pr, vr] = m.parts;
    expect(pr.chipY).toBeCloseTo((pr.a!.y + pr.b!.y) / 2, 6);
    expect(vr.chipY).not.toBeNull();
    expect(m.columnX).toBe(340 + 12 + m.chipW / 2);
  });

  it('箭头短于框高 + 12 时不画箭头', () => {
    const m = rulerLayerOf({ ...base, mode: 'trend', start: 0, end: 1, sides: [priceSide([600, 640])] });
    expect(m.parts[0].drawArrow).toBe(false);
    const tall = rulerLayerOf({ ...base, mode: 'trend', start: 0, end: 1, sides: [priceSide([500, 700])] });
    expect(tall.parts[0].drawArrow).toBe(true);
  });

  it('框心钳在该层范围内', () => {
    const m = rulerLayerOf({ ...base, mode: 'extreme', start: 0, end: 1, sides: [priceSide([768, 760])] });
    expect(m.parts[0].chipY).toBeGreaterThanOrEqual(16 + 17);
  });

  it('只选一个桶 = single，不出框', () => {
    const m = rulerLayerOf({ ...base, mode: 'extreme', start: 3, end: 3, sides: [priceSide([500, 520, 678, 600])] });
    expect(m.single).toBe(true);
    expect(m.parts[0].chipY).toBeNull();
    expect(m.parts[0].a?.value).toBe(600);
  });

  it('朗读摘要区分两种读数方式', () => {
    const labels = { range: '2026W25 至 2026W33', bucketOf: (i: number) => `W${i}`, formatPrice: (v: number) => `$${v}`, unitNoun: '周' };
    const ext = rulerLayerOf({ ...base, mode: 'extreme', start: 0, end: 2, sides: [priceSide([525, 678, 577])] });
    expect(rulerSummaryOf(ext, labels)).toContain('最高 $678（W1），最低 $525（W0），极差率 29.1%，极差 $153');
    const trend = rulerLayerOf({ ...base, mode: 'trend', start: 0, end: 2, sides: [priceSide([525, 678, 577])] });
    expect(rulerSummaryOf(trend, labels)).toContain('期初 $525（W0），期末 $577（W2），涨跌 +9.9%，+$52');
  });
});

describe('brushInWindow', () => {
  it('换算成窗口内下标，越界侧贴边', () => {
    expect(brushInWindow([5, 9], 3, 20)).toEqual([2, 6]);
    expect(brushInWindow([1, 9], 3, 20)).toEqual([0, 6]);
    expect(brushInWindow([15, 30], 3, 20)).toEqual([12, 17]);
  });

  it('与窗口不相交 = null；无选区 = null', () => {
    expect(brushInWindow([0, 2], 3, 20)).toBeNull();
    expect(brushInWindow(null, 3, 20)).toBeNull();
  });
});
