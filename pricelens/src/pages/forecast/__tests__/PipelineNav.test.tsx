// ============================================================
// 量价预测 · 推演工作台 v3 · PipelineNav 组件测试（jsdom · 任务 6）：
// 正典：design-proposals/forecast-global-ia-review.md B.5.2 / B.6 任务 6 Step 2。
// 覆盖：文档给定用例（点「③ 库存修正」→ onNavigate(3) 且不改 params）、
// 四节点实时状态（①学习状态+参考名 / ②人工调整数 / ③SI 待确认数+首修正周 /
// ④预测期销毛+暂不联动销量）、④节点 title 固定话术、点击 aria-current="step"。
// makePipelineProps 为 B.6.2 工厂的任务 6 本地版（marginView 用 PipelineMarginRead
// 最小读取切片；任务 9 MarginView 到位后由任务 10 收敛为 computeMarginView）。
// ============================================================
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import PipelineNav from '../PipelineNav';
import { workbenchFixture } from '../workbenchFixture';
import { baseWorkbenchParams, computeWorkbench, withMarketMonthOverride } from '../workbenchModel';
import type { WorkbenchParams } from '../workbenchModel';
import { buildForecastCalendar } from '../workbenchCalendar';

const fixture = workbenchFixture;
const calendar = buildForecastCalendar(fixture.calendar);
const base = baseWorkbenchParams(fixture);

/** B.6.2 makePipelineProps 契约的任务 6 本地版（marginView = PipelineMarginRead 切片）。 */
const makePipelineProps = (
  params: WorkbenchParams,
  onNavigate: (stage: 1 | 2 | 3 | 4) => void,
): ComponentProps<typeof PipelineNav> => {
  const result = computeWorkbench(fixture, params);
  return {
    calendar,
    result,
    params,
    confirmationState: { byMonth: {} },
    marginView: { forecastMargin: result.summary.forecastMargin, priceDemandLinked: false },
    onNavigate,
  };
};

afterEach(cleanup);

describe('PipelineNav（任务 6 Step 2 文档给定用例）', () => {
  it('navigates to a stage without changing params', () => {
    const onNavigate = vi.fn();
    const params = baseWorkbenchParams(fixture);
    render(<PipelineNav {...makePipelineProps(params, onNavigate)} />);
    fireEvent.click(screen.getByRole('button', { name: /③ 库存修正/ }));
    expect(onNavigate).toHaveBeenCalledWith(3);
    expect(params).toEqual(baseWorkbenchParams(fixture));
  });
});

describe('PipelineNav · 四节点状态与交互', () => {
  it('四个节点齐全且带实时状态：①学习+参考名 / ②AI 基线 / ③待确认+首修正周 / ④期销毛+暂不联动销量', () => {
    const onNavigate = vi.fn();
    const { container } = render(<PipelineNav {...makePipelineProps(base, onNavigate)} referenceLabel="Mate 80（上一代）· 同周龄对齐" />);
    const nav = container.querySelector('[data-pipeline-nav]') as HTMLElement;
    expect(nav).not.toBeNull();
    const stage1 = screen.getByRole('button', { name: /① 自动学习基线/ });
    expect(stage1.textContent).toContain('自动学习');
    expect(stage1.textContent).toContain('Mate 80（上一代）');
    const stage2 = screen.getByRole('button', { name: /② 大盘修正/ });
    expect(stage2.textContent).toContain('AI 基线');
    const stage3 = screen.getByRole('button', { name: /③ 库存修正/ });
    expect(stage3.textContent).toContain('SI 待确认 12 / 12');
    expect(stage3.textContent).toContain('2026W46 起');
    const stage4 = screen.getByRole('button', { name: /④ 成本及销毛/ });
    expect(stage4.textContent).toContain('$595.3M');
    expect(stage4.textContent).toContain('暂不联动销量');
  });

  it('①学习回退 / ②人工调整数 / ③全确认+未触发 的状态派生', () => {
    const onNavigate = vi.fn();
    const fat = baseWorkbenchParams(fixture);
    const params: WorkbenchParams = {
      ...withMarketMonthOverride({ ...fat, siPlanMonthly: Object.fromEntries(Object.keys(fat.siPlanMonthly).map((key) => [key, 400000])) }, '2026-11', 120, ''),
    };
    const result = computeWorkbench(fixture, params);
    const confirmed = Object.fromEntries(
      calendar.forecastMonths.map((month) => [month.key, { confirmedValue: 400000, confirmedAt: '2026-11-05T00:00:00.000Z' }]),
    );
    const { container } = render(
      <PipelineNav
        calendar={calendar}
        result={result}
        params={params}
        confirmationState={{ byMonth: confirmed }}
        marginView={{ forecastMargin: result.summary.forecastMargin, priceDemandLinked: false }}
        onNavigate={onNavigate}
      />,
    );
    expect((container.querySelector('[data-pipeline-stage="2"]')?.textContent ?? '')).toContain('人工调整 1');
    const stage3 = container.querySelector('[data-pipeline-stage="3"]') as HTMLElement;
    expect(stage3.textContent).toContain('SI 待确认 0 / 12');
    expect(stage3.textContent).toContain('未触发');
  });

  it('点击只定位：onNavigate 收到节点序号，按钮标 aria-current="step"，不写 params', () => {
    const onNavigate = vi.fn();
    const params = baseWorkbenchParams(fixture);
    const snapshot = JSON.stringify(params);
    render(<PipelineNav {...makePipelineProps(params, onNavigate)} />);
    const stage2 = screen.getByRole('button', { name: /② 大盘修正/ });
    fireEvent.click(stage2);
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith(2);
    expect(stage2.getAttribute('aria-current')).toBe('step');
    expect(screen.getByRole('button', { name: /③ 库存修正/ }).getAttribute('aria-current')).toBeNull();
    expect(JSON.stringify(params)).toBe(snapshot);
    fireEvent.click(screen.getByRole('button', { name: /④ 成本及销毛/ }));
    expect(onNavigate).toHaveBeenLastCalledWith(4);
    expect(screen.getByRole('button', { name: /④ 成本及销毛/ }).getAttribute('aria-current')).toBe('step');
    expect(stage2.getAttribute('aria-current')).toBeNull();
  });

  it('④节点 title 固定：「④读取最终 SO、价格与成本，输出经营结果；不回写主图」', () => {
    const onNavigate = vi.fn();
    render(<PipelineNav {...makePipelineProps(base, onNavigate)} />);
    const stage4 = screen.getByRole('button', { name: /④ 成本及销毛/ });
    expect(stage4.getAttribute('title')).toBe('④读取最终 SO、价格与成本，输出经营结果；不回写主图');
  });

  it('窄屏横向滚动：nav 容器 overflowX = auto，节点不换行', () => {
    const onNavigate = vi.fn();
    const { container } = render(<PipelineNav {...makePipelineProps(base, onNavigate)} />);
    const nav = container.querySelector('[data-pipeline-nav]') as HTMLElement;
    expect(nav.style.overflowX).toBe('auto');
    for (const button of Array.from(nav.querySelectorAll('button'))) {
      expect(button.style.whiteSpace).toBe('nowrap');
    }
  });
});
