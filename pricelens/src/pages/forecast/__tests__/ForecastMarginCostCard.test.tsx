// ============================================================
// WP5 · 成本销毛卡组件测试（jsdom）：
// $M 轴与 tooltip 同源（禁「万$」标原始 USD）、周销毛图例真实显隐、
// 负单台销毛零基线向下表达不丢柱、空态文案、缺数周销「—」。
// 2026-11-04 评审定位修正：销毛 = 经营结果而非输入——卡标题 / 口径行 /
// IoBar / 输出框按「输入（量价）→ 结果（销毛）」标注（模型计算不动）。
// ============================================================
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { workbenchFixture } from '../workbenchFixture';
import { baseWorkbenchParams, computeWorkbench, type WorkbenchResult } from '../workbenchModel';
import ForecastMarginCostCard from '../ForecastMarginCostCard';

const fixture = workbenchFixture;
const baseResult = computeWorkbench(fixture, baseWorkbenchParams(fixture));

afterEach(cleanup);

const renderCard = (result: WorkbenchResult) => render(<ForecastMarginCostCard fixture={fixture} result={result} />);

const marginBars = (): Element[] =>
  Array.from(document.querySelectorAll('svg rect')).filter((rect) =>
    Array.from(rect.querySelectorAll('title')).some((title) => (title.textContent ?? '').includes('周销毛')),
  );

describe('成本销毛 · $M 轴（禁万$）', () => {
  it('轴刻度与 tooltip 均为 $M 格式，全文不出现「万$」', () => {
    renderCard(baseResult);
    const text = document.body.textContent ?? '';
    expect(text).not.toContain('万$');
    expect(/\$\d+(\.\d+)?M/.test(text)).toBe(true);
    // 基线 0 刻度存在（$0.0M）。
    expect(text).toContain('$0.0M');
    // tooltip（title）也用 $M：如「周销毛 $」+ M 格式。
    const titles = Array.from(document.querySelectorAll('svg rect title')).map((title) => title.textContent ?? '');
    expect(titles.some((title) => title.includes('周销毛 $') && title.includes('M'))).toBe(true);
  });

  it('周销毛图例可点击真实显隐', () => {
    renderCard(baseResult);
    expect(marginBars().length).toBeGreaterThan(0);
    const marginButton = Array.from(document.querySelectorAll('button[aria-pressed]')).find((button) =>
      (button.textContent ?? '').includes('周销毛'),
    );
    expect(marginButton).toBeDefined();
    fireEvent.click(marginButton!);
    expect(marginButton!.getAttribute('aria-pressed')).toBe('false');
    expect(marginBars()).toHaveLength(0);
    fireEvent.click(marginButton!);
    expect(marginBars().length).toBeGreaterThan(0);
  });

  it('预测起点从周状态派生：预测段销毛柱为虚柱（forecast 起点不再写死 8）', () => {
    // 截断 10 周历史 + 6 周预测的合成窗口：预测虚柱只出现在 status=forecast 的周。
    const weeks = baseResult.weeks.slice(0, 8).concat(baseResult.weeks.slice(10));
    const shifted = weeks.map((week, index) => ({
      ...week,
      status: index < 10 ? ('actual' as const) : ('forecast' as const),
      final: index < 10 ? week.final : week.final,
    }));
    renderCard({ ...baseResult, weeks: shifted });
    const forecastBars = marginBars().filter((rect) => rect.getAttribute('stroke-dasharray'));
    expect(forecastBars).toHaveLength(4); // 合成窗口只有 4 个预测周。
    expect(forecastBars.every((rect) => (rect.getAttribute('stroke') ?? '').length > 0)).toBe(true);
  });
});

describe('成本销毛 · 依赖链路条（A3）', () => {
  it('链路完整：主图价格预测 + 成本月版本 → 单台销毛 → × 主图 SO → 预测期销毛（末节点激活注「不回写主图」）', () => {
    renderCard(baseResult);
    const steps = Array.from(document.querySelectorAll('[data-flow-step]'));
    expect(steps.map((el) => el.getAttribute('data-flow-step'))).toEqual([
      '主图价格预测', '成本月版本', '单台销毛', '× 主图 SO', '预测期销毛',
    ]);
    const bar = document.querySelector('[data-flow-bar]') as HTMLElement;
    expect(bar.getAttribute('aria-label')).toContain('主图价格预测 + 成本月版本 → 单台销毛 → × 主图 SO → 预测期销毛');
    const last = steps[steps.length - 1] as HTMLElement;
    expect(last.getAttribute('data-state')).toBe('active');
    expect(last.textContent).toContain('不回写主图');
    // 公式收 title：单台销毛节点 = 主图价格 − 成本月版本
    const unitStep = steps[2] as HTMLElement;
    expect(unitStep.getAttribute('title')).toContain('主图价格 − 成本月版本');
  });

  it('空态也渲染依赖链路条（关系先于数据可见）', () => {
    renderCard({ ...baseResult, weeks: [] });
    expect(document.querySelectorAll('[data-flow-step]').length).toBe(5);
    expect(document.querySelector('[data-flow-step="预测期销毛"]')?.getAttribute('data-state')).toBe('active');
  });
});

describe('成本销毛 · 经营结果定位（2026-11-04 评审：输入（量价）→ 结果（销毛））', () => {
  it('卡标题标注「经营结果」，口径行注明由上述量价与成本推导', () => {
    renderCard(baseResult);
    const h2 = document.querySelector('h2');
    expect(h2?.textContent).toContain('成本销毛 · 经营结果');
    const text = document.body.textContent ?? '';
    expect(text).toContain('经营结果 · 由上述量价与成本推导');
    expect(text).toContain('对销毛不满意');
  });

  it('IoBar 重排为 输入（量价）→ 经营结果：预测期销毛（不修正主图）', () => {
    renderCard(baseResult);
    const text = document.body.textContent ?? '';
    expect(text).toContain('输入（量价）');
    expect(text).toContain('经营结果：预测期销毛');
    expect(text).toContain('仅调价参考');
  });

  it('成本定位口径：成本只是是否调价的参考、不进模型输入；输出框首行 = 经营结果推导口径', () => {
    renderCard(baseResult);
    const text = document.body.textContent ?? '';
    expect(text).toContain('成本只是是否调价的参考');
    expect(text).toContain('不进模型输入');
    expect(text).toContain('由上述量价与成本推导');
    // aria 同步声明经营结果定位
    const svg = document.querySelector('svg[role="img"]') as SVGSVGElement;
    expect(svg.getAttribute('aria-label')).toContain('经营结果 · 由上述量价与成本推导');
  });

  it('空态同样保留经营结果定位文案', () => {
    renderCard({ ...baseResult, weeks: [] });
    const text = document.body.textContent ?? '';
    expect(text).toContain('暂无成本销毛数据');
    expect(text).toContain('经营结果 · 由上述量价与成本推导');
    expect(text).toContain('输入（量价）');
  });

  it('把握话术退役：中性 chip「推演参考 · 波动 ±8%」，无「把握」字样（评审 1b：置信区间提示不必要）', () => {
    renderCard(baseResult);
    const text = document.body.textContent ?? '';
    expect(text).toContain('推演参考 · 波动 ±8%');
    expect(text).not.toContain('把握');
    // 口径收 title：非统计置信区间
    const chip = Array.from(document.querySelectorAll('span[title]'))
      .find((el) => (el.textContent ?? '') === '推演参考 · 波动 ±8%');
    expect(chip?.getAttribute('title')).toContain('非统计置信区间');
  });
});

describe('成本销毛 · 负单台销毛（零基线向下）与空态', () => {
  it('负周销毛不丢柱：柱从零基线向下（top = 零基线），零基线网格线存在', () => {
    const withNegative = {
      ...baseResult,
      weeks: baseResult.weeks.map((week, index) => (index === 9 ? { ...week, weeklyMargin: -800000 } : week)),
    };
    renderCard(withNegative);
    const negBar = marginBars().find((rect) =>
      Array.from(rect.querySelectorAll('title')).some((title) => (title.textContent ?? '').includes('W46')),
    );
    expect(negBar).not.toBeUndefined();
    const negTop = Number(negBar!.getAttribute('y'));
    const posBar = marginBars().find((rect) =>
      Array.from(rect.querySelectorAll('title')).some((title) => (title.textContent ?? '').includes('W45')),
    );
    expect(posBar).not.toBeUndefined();
    const posTop = Number(posBar!.getAttribute('y'));
    // 负柱顶端在正柱顶端之下（向下表达）。
    expect(negTop).toBeGreaterThan(posTop);
    // 零基线网格线（强分隔）穿过负柱顶端。
    const baseline = Array.from(document.querySelectorAll('svg line')).find(
      (line) => Math.abs(Number(line.getAttribute('y1')) - negTop) < 0.6,
    );
    expect(baseline).not.toBeUndefined();
    expect(baseline!.getAttribute('stroke')).toBe('#a1a1a1');
  });

  it('负周销毛 tooltip 为 $M 带符号（$-0.8M），不是万$', () => {
    const withNegative = {
      ...baseResult,
      weeks: baseResult.weeks.map((week, index) => (index === 9 ? { ...week, weeklyMargin: -800000 } : week)),
    };
    renderCard(withNegative);
    const titles = Array.from(document.querySelectorAll('svg rect title')).map((title) => title.textContent ?? '');
    expect(titles.some((title) => title.includes('$-0.8M'))).toBe(true);
    expect(document.body.textContent).not.toContain('万$');
  });

  it('无周数据：显「暂无成本销毛数据」，不渲染 SVG、无 NaN', () => {
    renderCard({ ...baseResult, weeks: [] });
    expect(document.querySelector('svg')).toBeNull();
    const text = document.body.textContent ?? '';
    expect(text).toContain('暂无成本销毛数据');
    expect(text).not.toContain('NaN');
  });

  it('预测周 final 缺失：tooltip 周销显「—」不当 0', () => {
    const withNull = {
      ...baseResult,
      weeks: baseResult.weeks.map((week, index) => (index === 8 ? { ...week, final: null } : week)),
    };
    renderCard(withNull);
    const titles = Array.from(document.querySelectorAll('svg rect title')).map((title) => title.textContent ?? '');
    expect(titles.some((title) => title.includes('W45') && title.includes('周销 —'))).toBe(true);
    expect(titles.some((title) => title.includes('W45') && title.includes('周销 0'))).toBe(false);
  });
});
