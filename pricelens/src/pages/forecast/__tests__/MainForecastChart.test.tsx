// ============================================================
// WP5 · 主图组件测试（jsdom）：只验证 React 组装与行为开关，不验证像素。
// 覆盖：受控视图（heightScale / showYTicks / labelMode / promoBandOn）、
// controls 插槽、缺数「—」不造 0、手调墨色与库存琥珀双状态共存、
// 图例「数据系列 / 说明项」分组与真实显隐、预测把握区间带（A4：
// 两组带 + ±8%/±2% 宽度参数 + 预测线/带与末历史点无缝衔接 + 缺数回退）。
// ============================================================
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { brandColor, color } from '../../../theme/tokens';
import { niceCeil } from '../../../dataModel/volume';
import { workbenchFixture } from '../workbenchFixture';
import { baseWorkbenchParams, computeWorkbench, type WorkbenchParams, type WorkbenchResult, type WorkbenchWeekResult } from '../workbenchModel';
import MainForecastChart, { DEFAULT_MAIN_FORECAST_VIEW, type MainForecastView } from '../MainForecastChart';

const fixture = workbenchFixture;
const baseParams = baseWorkbenchParams(fixture);
const baseResult = computeWorkbench(fixture, baseParams);

afterEach(cleanup);

interface RenderOpts {
  params?: WorkbenchParams;
  result?: WorkbenchResult;
  view?: Partial<MainForecastView>;
  controls?: ReactNode;
}

const renderChart = (opts: RenderOpts = {}) =>
  render(
    <MainForecastChart
      fixture={fixture}
      params={{ productEvents: opts.params?.productEvents ?? [] }}
      result={opts.result ?? baseResult}
      onTuneWeek={() => {}}
      onRemoveProductEvent={() => {}}
      view={opts.view}
      controls={opts.controls}
    />,
  );

const svgTexts = (): string[] =>
  Array.from(document.querySelectorAll('svg text')).map((node) => node.textContent ?? '');

const xLabels = (): string[] => svgTexts().filter((text) => /^W\d+$/.test(text));

const priceLinePaths = (): Element[] =>
  Array.from(document.querySelectorAll('svg path')).filter((path) => path.getAttribute('stroke') === brandColor.HUAWEI);

const inkSolidPaths = (): Element[] =>
  Array.from(document.querySelectorAll('svg path')).filter(
    (path) => path.getAttribute('stroke') === color.ink && !path.getAttribute('stroke-dasharray'),
  );

const barWithTitle = (label: string): Element | null =>
  Array.from(document.querySelectorAll('svg rect')).find((rect) =>
    Array.from(rect.querySelectorAll('title')).some((title) => (title.textContent ?? '').includes(label)),
  ) ?? null;

describe('主图 · 受控视图（MainForecastView 默认 = 当前视觉）', () => {
  it('默认视图常量：heightScale 1 / showYTicks true / compact / promoBandOn true', () => {
    expect(DEFAULT_MAIN_FORECAST_VIEW).toEqual({ heightScale: 1, showYTicks: true, labelMode: 'compact', promoBandOn: true });
  });

  it('不传 view：viewBox 高度 = 默认（380），促销带、刻度与紧凑周标签齐全', () => {
    renderChart();
    expect(document.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 1180 380');
    expect(svgTexts().some((text) => text.includes('黑五档期'))).toBe(true);
    expect(document.body.textContent).toContain('万台');
    // compact = 每 2 个 + 末尾 → 9 个周标签。
    expect(xLabels()).toHaveLength(9);
  });

  it('promoBandOn=false：档期带与带标签消失，其余结构保留', () => {
    renderChart({ view: { promoBandOn: false } });
    expect(svgTexts().some((text) => text.includes('黑五档期'))).toBe(false);
    expect(document.querySelector('svg')).not.toBeNull();
  });

  it('showYTicks=false：纵轴刻度与网格隐藏（左轴万台 + 右轴价格刻度）', () => {
    renderChart({ view: { showYTicks: false } });
    // 只看轴刻度 <text>（柱 title 里的「万台」读数属于数据读数，不算轴）。
    const texts = svgTexts().join('|');
    expect(texts).not.toContain('万台');
    expect(texts).not.toContain('$850');
    // 数据读数（柱 title）不受影响。
    expect(document.body.textContent).toContain('周销 7.0 万台');
  });

  it('labelMode=detail：每周标签（16 个）；heightScale=0.5：viewBox 高度 = TOP + 150 + BOTTOM', () => {
    const detail = renderChart({ view: { labelMode: 'detail' } });
    expect(xLabels()).toHaveLength(16);
    detail.unmount();
    const compressed = renderChart({ view: { heightScale: 0.5 } });
    expect(compressed.container.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 1180 230');
  });

  it('heightScale 只缩放绘图区：宽度不变、周标签仍在（底部结构不丢）', () => {
    renderChart({ view: { heightScale: 2 } });
    expect(document.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 1180 680');
    expect(xLabels().length).toBeGreaterThan(0);
  });

  it('controls 插槽渲染在主图上方（DOM 顺序先于 svg）', () => {
    renderChart({ controls: <div>共享工具行</div> });
    expect(document.body.textContent).toContain('共享工具行');
    const svg = document.querySelector('svg');
    const tools = Array.from(document.querySelectorAll('div')).find((node) => node.textContent === '共享工具行');
    expect(svg).not.toBeNull();
    expect(tools).toBeDefined();
    expect(svg!.compareDocumentPosition(tools!) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });

  it('不传 controls：不渲染多余插槽', () => {
    const { container } = renderChart();
    expect(container.textContent).not.toContain('共享工具行');
  });
});

describe('主图 · 缺数几何与「—」', () => {
  it('预测周 final 缺失：数据表显「—」、该行无微调按钮、其余预测周保留按钮', () => {
    const withNull = {
      ...baseResult,
      weeks: baseResult.weeks.map((week, index) => (index === 10 ? { ...week, final: null } : week)),
    };
    renderChart({ result: withNull });
    const rowW47 = Array.from(document.querySelectorAll('tbody tr')).find((row) => (row.textContent ?? '').includes('W47'));
    expect(rowW47).toBeDefined();
    expect(rowW47!.textContent).toContain('—');
    expect(rowW47!.querySelectorAll('button')).toHaveLength(0);
    // 其余 7 个预测周仍有微调按钮。
    const tuneButtons = Array.from(document.querySelectorAll('button')).filter((button) => button.textContent === '微调');
    expect(tuneButtons).toHaveLength(7);
  });

  it('weeks 为空：不渲染 SVG、不产出 NaN，给出空态文案', () => {
    renderChart({ result: { ...baseResult, weeks: [] } });
    expect(document.querySelector('svg')).toBeNull();
    const text = document.body.textContent ?? '';
    expect(text).not.toContain('NaN');
    expect(text.length).toBeGreaterThan(0);
  });
});

describe('主图 · 手调（墨色）与库存上限修正（琥珀）双状态共存', () => {
  it('默认链：截断周预测柱琥珀描边；名录/aria 报告修正起点', () => {
    renderChart();
    const cappedBar = barWithTitle('W50');
    expect(cappedBar).not.toBeNull();
    expect(cappedBar!.getAttribute('stroke')).toBe(color.warning);
    expect(document.body.textContent).toContain('库存上限修正 · W50 起');
    expect(document.querySelector('svg')?.getAttribute('aria-label')).toContain('库存上限修正 W50 起');
  });

  it('手调落在截断周：柱恢复预测描边（蓝）、菱形转墨色；修正事实仍在名录（supplyCapped）', () => {
    const tuned = { ...baseParams, manual: { 50: { value: 60000, reason: '黑五加投，按会议口径上调' } } };
    const result = computeWorkbench(fixture, tuned);
    const w50 = result.weeks.find((week) => week.weekNumber === 50);
    expect(w50?.supplyCapped).toBe(true);
    expect(w50?.capped).toBe(false);
    renderChart({ params: tuned, result });
    const tunedBar = barWithTitle('W50');
    expect(tunedBar!.getAttribute('stroke')).toBe(color.link);
    // 手调菱形 = 墨色（非琥珀）。
    const inkDiamond = Array.from(document.querySelectorAll('svg path')).find(
      (path) => path.getAttribute('fill') === color.ink && (path.getAttribute('d') ?? '').includes('l5 5'),
    );
    expect(inkDiamond).not.toBeUndefined();
    const amberDiamond = Array.from(document.querySelectorAll('svg path')).find(
      (path) => path.getAttribute('fill') === color.warning && (path.getAttribute('d') ?? '').includes('l5 5'),
    );
    expect(amberDiamond).toBeUndefined();
    // 图下名录：手调原因 + 修正事实（不因手调消失）。
    const text = document.body.textContent ?? '';
    expect(text).toContain('手调 · W50');
    expect(text).toContain('黑五加投，按会议口径上调');
    expect(text).toContain('库存上限修正 · W50 起');
    expect(text).not.toContain('未触发库存上限修正');
  });
});

describe('主图 · 图例分组与真实显隐', () => {
  it('数据系列 5 项均为可点击按钮（aria-pressed），说明项为纯文字', () => {
    renderChart();
    const pressedButtons = Array.from(document.querySelectorAll('button[aria-pressed]'));
    expect(pressedButtons).toHaveLength(5);
    const labels = pressedButtons.map((button) => button.textContent ?? '');
    expect(labels.join('|')).toContain('周销 实际');
    expect(labels.join('|')).toContain('周销 预测');
    expect(labels.join('|')).toContain('价格');
    expect(labels.join('|')).toContain('上一代');
    expect(labels.join('|')).toContain('把握区间');
    // 说明项：库存描边是预测样式，不是按钮。
    const note = Array.from(document.querySelectorAll('span')).find((span) => (span.textContent ?? '').includes('预测样式'));
    expect(note).toBeDefined();
    expect(note!.closest('button')).toBeNull();
  });

  it('点击「价格」隐藏价格线并置 aria-pressed=false；再点恢复', () => {
    renderChart();
    expect(priceLinePaths().length).toBeGreaterThan(0);
    const priceButton = Array.from(document.querySelectorAll('button[aria-pressed]')).find((button) =>
      (button.textContent ?? '').includes('价格'),
    );
    expect(priceButton).toBeDefined();
    fireEvent.click(priceButton!);
    expect(priceButton!.getAttribute('aria-pressed')).toBe('false');
    expect(priceLinePaths()).toHaveLength(0);
    fireEvent.click(priceButton!);
    expect(priceLinePaths().length).toBeGreaterThan(0);
  });

  it('点击「周销 实际」隐藏历史实线；预测虚线不受影响', () => {
    renderChart();
    expect(inkSolidPaths().length).toBeGreaterThan(0);
    const actualButton = Array.from(document.querySelectorAll('button[aria-pressed]')).find((button) =>
      (button.textContent ?? '').includes('周销 实际'),
    );
    fireEvent.click(actualButton!);
    expect(inkSolidPaths()).toHaveLength(0);
    const dashedInk = Array.from(document.querySelectorAll('svg path')).filter(
      (path) => path.getAttribute('stroke') === color.ink && path.getAttribute('stroke-dasharray'),
    );
    expect(dashedInk.length).toBeGreaterThan(0);
  });
});

describe('主图 · 预测把握区间带与历史接缝（A4）', () => {
  // 复刻组件几何派生（默认视图 heightScale = 1；与 MainForecastChart 同公式，非像素断言）。
  const SLOT = (1180 - 64 - 64) / 16;
  const xOf = (index: number): number => 64 + (index + 0.5) * SLOT;
  const round1 = (value: number): number => Number(value.toFixed(1));
  const scalesOf = (weeks: WorkbenchWeekResult[]): { y: (value: number) => number; yPrice: (value: number) => number } => {
    const volumeValues = weeks.flatMap((week) => [week.sales, week.final]).filter((value): value is number => value != null);
    const volumePeak = Math.max(0, ...volumeValues, ...weeks.map((week) => week.prevGenSales));
    const yMax = Math.max(1, niceCeil(volumePeak * 1.12));
    const prices = weeks.map((week) => week.price);
    const bandExtents = weeks.flatMap((week) => {
      if (week.status !== 'forecast') return [];
      const pct = week.capped ? 0.02 : 0.08;
      return [week.price * (1 + pct), week.price * (1 - pct)];
    });
    const priceLo = Math.min(...prices, ...bandExtents);
    const priceHi = Math.max(...prices, ...bandExtents);
    const pad = (priceHi - priceLo) * 0.12 || Math.max(1, priceHi * 0.12);
    return {
      y: (value: number): number => 34 + 300 * (1 - value / yMax),
      yPrice: (value: number): number => 34 + 300 * (1 - (value - (priceLo - pad)) / (priceHi + pad - (priceLo - pad))),
    };
  };
  const pathCoords = (d: string): Array<[number, number]> =>
    (d.match(/[ML]\s*-?\d+(?:\.\d+)?\s+-?\d+(?:\.\d+)?/g) ?? []).map((pair) => {
      const [px, py] = pair.slice(1).trim().split(/\s+/).map(Number);
      return [px, py];
    });
  const bandPath = (fill: string, opacity: string): Element | null =>
    Array.from(document.querySelectorAll('svg path')).find(
      (path) => path.getAttribute('fill') === fill && path.getAttribute('fill-opacity') === opacity,
    ) ?? null;
  const salesBand = (): Element | null => bandPath(color.link, '0.14');
  const priceBand = (): Element | null => bandPath(brandColor.HUAWEI, '0.1');
  const forecastInkLine = (): Element | null =>
    Array.from(document.querySelectorAll('svg path')).find(
      (path) => path.getAttribute('stroke') === color.ink && path.getAttribute('stroke-dasharray') === '5 4',
    ) ?? null;
  const forecastPriceLine = (): Element | null =>
    Array.from(document.querySelectorAll('svg path')).find(
      (path) => path.getAttribute('stroke') === brandColor.HUAWEI && path.getAttribute('stroke-dasharray') === '6 5',
    ) ?? null;

  it('两组把握带存在：销量带蓝（fill-opacity 0.14）、价格带品牌红（0.10）；带与帽、虚柱并存', () => {
    renderChart();
    expect(salesBand()).not.toBeNull();
    expect(priceBand()).not.toBeNull();
    // 把握帽仍在（帽线组 stroke 挂在 <g> 上）：修正周琥珀帽。
    const capGroup = Array.from(document.querySelectorAll('svg g')).find((group) => group.getAttribute('stroke') === color.warning);
    expect(capGroup).not.toBeUndefined();
    // 预测虚柱仍在（柱=值，带=线的区间）。
    const forecastBar = barWithTitle('W45');
    expect(forecastBar).not.toBeNull();
    // 图例说明项 + aria 同步。
    expect(document.body.textContent).toContain('预测把握区间（±8% / 修正周 ±2%）');
    expect(document.querySelector('svg')?.getAttribute('aria-label')).toContain('把握区间带（常规 ±8% / 修正周 ±2%）');
  });

  it('接缝连续：销量带 / 周销预测线 / 价格预测线首点 = 最后有值历史点（W44 中心 x）', () => {
    renderChart();
    const { y, yPrice } = scalesOf(baseResult.weeks);
    const anchorX = round1(xOf(7));
    const anchorSalesY = round1(y(43000));
    // W44 = HISTORY_SALES 末点 43000 / HISTORY_PRICES 末点 849。
    const salesBandCoords = pathCoords(salesBand()!.getAttribute('d') ?? '');
    expect(salesBandCoords[0]).toEqual([anchorX, anchorSalesY]);
    const forecastLineCoords = pathCoords(forecastInkLine()!.getAttribute('d') ?? '');
    expect(forecastLineCoords[0]).toEqual([anchorX, anchorSalesY]);
    const forecastPriceCoords = pathCoords(forecastPriceLine()!.getAttribute('d') ?? '');
    expect(forecastPriceCoords[0]).toEqual([anchorX, round1(yPrice(849))]);
  });

  it('带宽参数与柱顶把握帽同参：未修正周 ±8%（W45）、修正周 ±2%（W50）', () => {
    renderChart();
    const { y } = scalesOf(baseResult.weeks);
    const coords = pathCoords(salesBand()!.getAttribute('d') ?? '');
    // 顶边顺序 = [W44 锚点, W45..W52]，W45 = coords[1]（±8%）；W50 = coords[6]（capped ±2%）。
    const w45 = baseResult.weeks[8];
    const w50 = baseResult.weeks[13];
    expect(w45.capped).toBe(false);
    expect(w50.capped).toBe(true);
    expect(coords[1]).toEqual([round1(xOf(8)), round1(y(w45.final! * 1.08))]);
    expect(coords[6]).toEqual([round1(xOf(13)), round1(y(w50.final! * 1.02))]);
    // 底边逆序：W45 底 = coords[16]（±8% 下缘）；W50 底 = coords[11]（±2% 下缘）。
    expect(coords[16]).toEqual([round1(xOf(8)), round1(y(w45.final! * 0.92))]);
    expect(coords[11]).toEqual([round1(xOf(13)), round1(y(w50.final! * 0.98))]);
  });

  it('价格带纳入价格轴数据域：带上缘不越出绘图区（y ≥ TOP）', () => {
    renderChart();
    const { yPrice } = scalesOf(baseResult.weeks);
    const coords = pathCoords(priceBand()!.getAttribute('d') ?? '');
    const minUpperY = Math.min(...coords.slice(0, 9).map(([, py]) => py));
    expect(minUpperY).toBeGreaterThanOrEqual(34);
    const maxLowerY = Math.max(...coords.slice(9).map(([, py]) => py));
    expect(maxLowerY).toBeLessThanOrEqual(334);
  });

  it('历史末周缺数：锚定回退到最后一个有值历史点（W43），线仍连续、无缺数标注', () => {
    const withNullHistoryEnd = {
      ...baseResult,
      weeks: baseResult.weeks.map((week, index) => (index === 7 ? { ...week, sales: null, final: null } : week)),
    };
    renderChart({ result: withNullHistoryEnd });
    const { y } = scalesOf(withNullHistoryEnd.weeks);
    // W44 缺数 → 锚定最后一个有值历史点 W43（HISTORY_SALES[6] = 39000）。
    const salesBandCoords = pathCoords(salesBand()!.getAttribute('d') ?? '');
    expect(salesBandCoords[0]).toEqual([round1(xOf(6)), round1(y(39000))]);
    const forecastLineCoords = pathCoords(forecastInkLine()!.getAttribute('d') ?? '');
    expect(forecastLineCoords[0]).toEqual([round1(xOf(6)), round1(y(39000))]);
    expect(document.body.textContent).not.toContain('历史末周缺数');
  });

  it('全历史缺数：带与预测线自首个有值预测点起，图下名录标注衔接说明', () => {
    const noHistory = {
      ...baseResult,
      weeks: baseResult.weeks.map((week) => (week.status === 'actual' ? { ...week, sales: null, final: null } : week)),
    };
    const withNote = renderChart({ result: noHistory });
    const { y } = scalesOf(noHistory.weeks);
    const w45 = noHistory.weeks[8];
    const firstForecastX = round1(xOf(8));
    const salesBandCoords = pathCoords(salesBand()!.getAttribute('d') ?? '');
    expect(salesBandCoords[0]).toEqual([firstForecastX, round1(y(w45.final! * 1.08))]);
    const forecastLineCoords = pathCoords(forecastInkLine()!.getAttribute('d') ?? '');
    expect(forecastLineCoords[0]).toEqual([firstForecastX, round1(y(w45.final!))]);
    expect(document.body.textContent).toContain('历史末周缺数 · 周销预测线自 W45 起');
    // 有历史锚时该标注不出现（先卸载上一棵树，避免 DOM 文本累积）。
    withNote.unmount();
    renderChart();
    expect(document.body.textContent).not.toContain('历史末周缺数');
  });

  it('把握带随「柱顶帽 = 把握区间」开关显隐；说明项文字不受开关影响', () => {
    renderChart();
    expect(salesBand()).not.toBeNull();
    const bandButton = Array.from(document.querySelectorAll('button[aria-pressed]')).find((button) =>
      (button.textContent ?? '').includes('把握区间'),
    );
    fireEvent.click(bandButton!);
    expect(salesBand()).toBeNull();
    expect(priceBand()).toBeNull();
    expect(document.body.textContent).toContain('预测把握区间（±8% / 修正周 ±2%）');
    fireEvent.click(bandButton!);
    expect(salesBand()).not.toBeNull();
  });
});
