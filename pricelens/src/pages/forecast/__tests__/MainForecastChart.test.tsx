// ============================================================
// WP5 · 主图组件测试（jsdom）：只验证 React 组装与行为开关，不验证像素。
// 覆盖：受控视图（heightScale / showYTicks / labelMode / promoBandOn）、
// controls 插槽、缺数「—」不造 0、手调墨色与库存琥珀双状态共存、
// 图例「数据系列 / 说明项」分组与真实显隐、价格线历史实线 / 预测虚线接缝。
// 2026-11-04 评审大减法：黑线 / 把握帽 / 把握区间带 / 调价档期锚点竖线 /
// 档期琥珀色带全部下线（销量只留柱、促销只留轴下日期标注），本文件同步
// 删除相关断言并新增「下线」回归断言；调整原因改选填（空原因手调可渲染）。
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

const barWithTitle = (label: string): Element | null =>
  Array.from(document.querySelectorAll('svg rect')).find((rect) =>
    Array.from(rect.querySelectorAll('title')).some((title) => (title.textContent ?? '').includes(label)),
  ) ?? null;

const forecastPriceLine = (): Element | null =>
  Array.from(document.querySelectorAll('svg path')).find(
    (path) => path.getAttribute('stroke') === brandColor.HUAWEI && path.getAttribute('stroke-dasharray') === '6 5',
  ) ?? null;

const historyPriceLine = (): Element | null =>
  Array.from(document.querySelectorAll('svg path')).find(
    (path) => path.getAttribute('stroke') === brandColor.HUAWEI && !path.getAttribute('stroke-dasharray'),
  ) ?? null;

describe('主图 · 受控视图（MainForecastView 默认 = 当前视觉）', () => {
  it('默认视图常量：heightScale 1 / showYTicks true / compact / promoBandOn true', () => {
    expect(DEFAULT_MAIN_FORECAST_VIEW).toEqual({ heightScale: 1, showYTicks: true, labelMode: 'compact', promoBandOn: true });
  });

  it('不传 view：viewBox 高度 = 默认（380），促销日期标注、刻度与紧凑周标签齐全，档期色带不渲染', () => {
    renderChart();
    expect(document.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 1180 380');
    // 促销只留轴下日期标注（不上色带）：标注文字在，琥珀色带 rect 不在。
    expect(svgTexts().some((text) => text === '黑五档期 11.14–12.02')).toBe(true);
    const amberBand = Array.from(document.querySelectorAll('svg rect')).find((rect) => rect.getAttribute('fill') === color.warningSoft);
    expect(amberBand).toBeUndefined();
    expect(document.body.textContent).toContain('万台');
    // compact = 每 2 个 + 末尾 → 9 个周标签。
    expect(xLabels()).toHaveLength(9);
  });

  it('promoBandOn=false：促销日期标注消失，其余结构保留', () => {
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

  it('原因选填：空原因手调只留菱形与名录周号，可正常应用渲染（2026-11-04 评审）', () => {
    const tuned = { ...baseParams, manual: { 50: { value: 60000, reason: '' } } };
    const result = computeWorkbench(fixture, tuned);
    renderChart({ params: tuned, result });
    // 菱形还在，title 不带原因冒号。
    const inkDiamond = Array.from(document.querySelectorAll('svg path')).find(
      (path) => path.getAttribute('fill') === color.ink && (path.getAttribute('d') ?? '').includes('l5 5'),
    );
    expect(inkDiamond).not.toBeUndefined();
    expect(inkDiamond!.querySelector('title')?.textContent).toBe('手调');
    // 柱 title 不产生「手调：」空尾巴。
    const tunedBar = barWithTitle('W50');
    expect(tunedBar!.querySelector('title')?.textContent).toContain('手调');
    expect(tunedBar!.querySelector('title')?.textContent).not.toContain('手调：');
    // 图下名录只列周号，不出现空冒号；修正事实照常报告。
    const text = document.body.textContent ?? '';
    expect(text).toContain('手调 · W50');
    expect(text).not.toContain('手调 · W50：');
    expect(text).toContain('库存上限修正 · W50 起');
  });
});

describe('主图 · 图例分组与真实显隐', () => {
  it('数据系列 4 项均为可点击按钮（aria-pressed），说明项为纯文字；把握区间图例已下线', () => {
    renderChart();
    const pressedButtons = Array.from(document.querySelectorAll('button[aria-pressed]'));
    expect(pressedButtons).toHaveLength(4);
    const labels = pressedButtons.map((button) => button.textContent ?? '');
    expect(labels.join('|')).toContain('周销 实际');
    expect(labels.join('|')).toContain('周销 预测');
    expect(labels.join('|')).toContain('价格');
    expect(labels.join('|')).toContain('上一代');
    expect(labels.join('|')).not.toContain('把握区间');
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

  it('点击「周销 实际」隐藏历史实柱；预测虚柱不受影响', () => {
    renderChart();
    expect(barWithTitle('W44')).not.toBeNull();
    const actualButton = Array.from(document.querySelectorAll('button[aria-pressed]')).find((button) =>
      (button.textContent ?? '').includes('周销 实际'),
    );
    fireEvent.click(actualButton!);
    expect(barWithTitle('W44')).toBeNull();
    expect(barWithTitle('W45')).not.toBeNull();
  });
});

describe('主图 · 2026-11-04 评审大减法下线回归', () => {
  // 复刻组件几何派生（默认视图 heightScale = 1；与 MainForecastChart 同公式，非像素断言）。
  const SLOT = (1180 - 64 - 64) / 16;
  const xOf = (index: number): number => 64 + (index + 0.5) * SLOT;
  const round1 = (value: number): number => Number(value.toFixed(1));
  const scalesOf = (weeks: WorkbenchWeekResult[]): { yPrice: (value: number) => number } => {
    const prices = weeks.map((week) => week.price);
    const priceLo = Math.min(...prices);
    const priceHi = Math.max(...prices);
    const pad = (priceHi - priceLo) * 0.12 || Math.max(1, priceHi * 0.12);
    return {
      yPrice: (value: number): number => 34 + 300 * (1 - (value - (priceLo - pad)) / (priceHi + pad - (priceLo - pad))),
    };
  };
  const pathCoords = (d: string): Array<[number, number]> =>
    (d.match(/[ML]\s*-?\d+(?:\.\d+)?\s+-?\d+(?:\.\d+)?/g) ?? []).map((pair) => {
      const [px, py] = pair.slice(1).trim().split(/\s+/).map(Number);
      return [px, py];
    });

  it('黑线下线：无墨色销量连线（历史实线 / 预测虚线均不渲染），销量只留柱', () => {
    renderChart();
    const inkPaths = Array.from(document.querySelectorAll('svg path')).filter((path) => path.getAttribute('stroke') === color.ink);
    expect(inkPaths).toHaveLength(0);
    // 柱还在：历史实柱（浅蓝）+ 预测虚柱（描边）。
    const historyBar = barWithTitle('W44');
    expect(historyBar!.getAttribute('fill')).toBe(color.link);
    const forecastBar = barWithTitle('W45');
    expect(forecastBar!.getAttribute('stroke')).toBe(color.link);
    expect(forecastBar!.getAttribute('stroke-dasharray')).toBe('4 3');
  });

  it('把握帽 / 把握区间带下线：无帽线组、无半透明带，「把握」话术全下（计算函数保留待主线清理）', () => {
    renderChart();
    const bandPaths = Array.from(document.querySelectorAll('svg path')).filter(
      (path) =>
        (path.getAttribute('fill') === color.link && path.getAttribute('fill-opacity') === '0.14') ||
        (path.getAttribute('fill') === brandColor.HUAWEI && path.getAttribute('fill-opacity') === '0.1'),
    );
    expect(bandPaths).toHaveLength(0);
    const capGroups = Array.from(document.querySelectorAll('svg g')).filter((group) => group.getAttribute('stroke') === color.warning);
    expect(capGroups).toHaveLength(0);
    const text = document.body.textContent ?? '';
    expect(text).not.toContain('把握');
    expect(document.querySelector('svg')?.getAttribute('aria-label')).not.toContain('把握');
  });

  it('档位线下线：无调价/档期锚点竖线与编号圆点（事件锚点色竖线不在此列）', () => {
    renderChart();
    const anchorLines = Array.from(document.querySelectorAll('svg line')).filter(
      (line) => line.getAttribute('stroke') === color.hairlineStrong && line.getAttribute('stroke-dasharray') === '3 4',
    );
    expect(anchorLines).toHaveLength(0);
    const anchorCircles = Array.from(document.querySelectorAll('svg circle')).filter(
      (circle) => circle.getAttribute('stroke') === color.hairlineStrong,
    );
    expect(anchorCircles).toHaveLength(0);
  });

  it('预测段虚线区分：价格历史段实线、预测段虚线（6 5）', () => {
    renderChart();
    expect(historyPriceLine()).not.toBeNull();
    expect(forecastPriceLine()).not.toBeNull();
  });

  it('价格线接缝连续：预测线首点 = 最后历史点（W44 中心 x，$849 数据派生 y）', () => {
    renderChart();
    const { yPrice } = scalesOf(baseResult.weeks);
    const coords = pathCoords(forecastPriceLine()!.getAttribute('d') ?? '');
    expect(coords[0]).toEqual([round1(xOf(7)), round1(yPrice(849))]);
  });

  it('促销日期标注在 aria 与轴下：W46 起最小标记，档期琥珀色带不再渲染', () => {
    renderChart();
    expect(document.querySelector('svg')?.getAttribute('aria-label')).toContain('促销档期 W46 起');
    // 轴下标注 = 起点小刻度 + 日期文字（无 warningSoft 底带 rect）。
    const markText = svgTexts().find((text) => text === '黑五档期 11.14–12.02');
    expect(markText).toBeDefined();
    const amberBand = Array.from(document.querySelectorAll('svg rect')).find((rect) => rect.getAttribute('fill') === color.warningSoft);
    expect(amberBand).toBeUndefined();
  });
});
