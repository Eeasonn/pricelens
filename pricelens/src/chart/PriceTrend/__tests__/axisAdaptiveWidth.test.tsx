// ============================================================
// 第196轮整改2（Eason）：轴列宽度内容自适应测试。
// 三场景（axisChrome 纯函数 + SplitAxisColumn 渲染一致性）：
// ① 只显示刻度 → 轴列 = 刻度标签宽（随刻度文案收回，钳 [34, 64]）+ 短横线；
// ② 只显示档位 → 档位带左对齐绘图区左缘，不预留刻度空位（宽 = 档位文字带）；
// ③ 两者同开 → 现状堆叠（档位区块 + 短横线），不受文案影响。
// 未传文案（量价/多平台/下钻）= 固定宽，行为不变。
// ============================================================
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import {
  AXIS_BAND_W,
  NAME_BAND_W,
  NAME_ZONE_W,
  TICK_DASH_W,
  TICK_PX,
  TIER_LABEL_W,
  axisChrome,
  axisFixedWidth,
  axisTickTextsOf,
  computeYAxis,
  estGridLeft,
  splitAxisWidth,
  tickZoneWidthFor,
} from '../helpers';
import SplitAxisColumn from '../SplitAxisColumn';
import type { Series } from '../../../dataModel/types';

const mkSeries = (): Series[] => [
  {
    key: 'OWN__1',
    isOwn: true,
    brand: 'HUAWEI',
    label: 'HUAWEI Mate 70',
    skuIds: ['s'],
    color: '#c7000b',
    points: [900, 1000, 1100].map((p, i) => ({
      bucketId: `2026${20 + i}`,
      xLabel: '05-06',
      anchorDate: '2026-05-06',
      rrp: p + 100,
      price: p,
      missing: false,
      offer: null,
      url: '',
      shopName: null,
    })),
    platform: null,
    channelBadge: null,
  },
];

const scale = computeYAxis({
  series: mkSeries(),
  priceTypes: { discounted: true, rrp: false },
  sliderScale: 1,
  allowBreak: false,
  perUsd: 1,
});

afterEach(() => cleanup());

describe('第196轮整改2：轴列宽度内容自适应', () => {
  it('场景①：只显示刻度 → 传刻度文案时轴列宽随内容收回（短横线保留）', () => {
    const texts = ['900', '950', '1K', '1.05K', '1.1K'];
    const fixed = axisChrome('usd', true, false);
    const adapt = axisChrome('usd', true, false, texts);
    expect(fixed.width).toBe(64 + TICK_DASH_W); // 未传文案 = 旧固定宽（量价页等不变）
    expect(tickZoneWidthFor(texts)).toBeLessThan(64);
    expect(adapt.width).toBe(tickZoneWidthFor(texts) + TICK_DASH_W);
    expect(adapt.tickLeft).toBe(0);
    expect(adapt.dashLeft).toBe(tickZoneWidthFor(texts));
    // 钳制：极长文案封顶旧固定宽（上限框/旧布局不放大）
    expect(tickZoneWidthFor(['12,345,678'])).toBeLessThanOrEqual(64);
    // 钳制下限：不窄于 34（呼吸位）
    expect(tickZoneWidthFor(['5'])).toBeGreaterThanOrEqual(34);
  });

  it('场景②：只显示档位 → 宽 = 档位文字带，不预留刻度空位', () => {
    const c = axisChrome('usd', false, true);
    expect(c.width).toBe(TIER_LABEL_W);
    expect(c.tierWidth).toBe(TIER_LABEL_W);
    expect(c.tickWidth).toBe(0);
    expect(c.dashLeft).toBe(0);
    // 刻度文案传入也不影响（该场景无刻度）
    expect(axisChrome('usd', false, true, ['1K'])).toEqual(c);
  });

  it('场景③：两者同开 → 现状堆叠（档位区块 + 短横线），文案不改变宽度', () => {
    const c = axisChrome('usd', true, true);
    expect(c.width).toBe(AXIS_BAND_W + TICK_DASH_W);
    expect(axisChrome('usd', true, true, ['1K', '1.05K'])).toEqual(c);
  });

  it('estGridLeft / splitAxisWidth 与 axisChrome 同源一致（含名称带宽与刻度文案）', () => {
    const texts = axisTickTextsOf(scale);
    expect(texts.length).toBeGreaterThan(0);
    expect(estGridLeft('usd', true, false, texts, 188)).toBe(axisFixedWidth('usd', true, false, texts) + 188);
    expect(splitAxisWidth('usd', true, false, texts)).toBe(axisFixedWidth('usd', true, false, texts));
    // 缺省名称带 = 呼吸位 14（下钻弹窗等自管场景不变）
    expect(estGridLeft('usd', true, false)).toBe(axisFixedWidth('usd', true, false) + NAME_ZONE_W);
    // 显式传 188 基准（名称带恢复）
    expect(estGridLeft('usd', true, false, undefined, NAME_BAND_W)).toBe(axisFixedWidth('usd', true, false) + NAME_BAND_W);
  });

  it('SplitAxisColumn 渲染宽 = 同源 axisChrome 宽（自适应传文案即收窄，不传即固定）', () => {
    const texts = axisTickTextsOf(scale);
    const { container: c1 } = render(
      <SplitAxisColumn yScale={scale} currency="usd" industry="phone" gridLeft={0} panelGridTop={16} showYTicks showTiers={false} tierValues={[900, 1000, 1100]} tickTexts={texts} />,
    );
    expect((c1.firstElementChild as HTMLElement).style.width).toBe(`${axisChrome('usd', true, false, texts).width}px`);
    const { container: c2 } = render(
      <SplitAxisColumn yScale={scale} currency="usd" industry="phone" gridLeft={0} panelGridTop={16} showYTicks showTiers={false} tierValues={[900, 1000, 1100]} />,
    );
    expect((c2.firstElementChild as HTMLElement).style.width).toBe(`${64 + TICK_DASH_W}px`);
    // 仅档位：宽 = 档位文字带（30），不预留刻度空位
    const { container: c3 } = render(
      <SplitAxisColumn yScale={scale} currency="usd" industry="phone" gridLeft={0} panelGridTop={16} showYTicks={false} showTiers tierValues={[900, 1000, 1100]} />,
    );
    expect((c3.firstElementChild as HTMLElement).style.width).toBe(`${TIER_LABEL_W}px`);
  });

  it('刻度文案集与 buildTickRows 同源（segTicks × fmtAxisTick，取全集为安全上界）', () => {
    const texts = axisTickTextsOf(scale);
    // computeYAxis 产物（含抽稀前的全集）文案必为 K 缩写/整数格式
    for (const t of texts) expect(t).toMatch(/^[\d,.]+K?$/);
    // 每格高 TICK_PX：plotHeight = cells × TICK_PX（无断轴）——文案数量随格数
    expect(scale.plotHeight).toBe(scale.cells * TICK_PX);
  });
});
