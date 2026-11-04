// ============================================================
// 任务 8（AI 情报转化与人工审核）Step 2：面板失败测试。
// 文档给定两条用例照抄（B.6 任务 8 Step 2）；面板 props 工厂
// （makeReviewPanelProps / makeMixedBatchProps / makeCostRecommendation）
// 按任务分工本地定义（B.6.2 形态；任务 10 收敛回共享 workbenchV3TestFactory）。
// 追加自有用例：availability 非 ready 空态（不画五条假候选）、依据状态文案
// （不给概率分）、批量移除整组撤销、useIntelligenceReview 持久化 / 撤销 /
// 20 步上限 / 写入失败「未持久化 · 重试」。
// ============================================================
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;

// 本仓库未装 @testing-library/jest-dom：文档给定用例的 toBeDisabled 断言
// 以测试文件内最小 matcher shim 承接（判定 disabled / aria-disabled）。
expect.extend({
  toBeDisabled(received: unknown) {
    const el = received as HTMLElement | null;
    const disabled = el != null
      && ((el as HTMLButtonElement).disabled === true || el.getAttribute('aria-disabled') === 'true');
    return {
      pass: disabled,
      message: (): string => `expected element ${disabled ? 'not ' : ''}to be disabled`,
    };
  },
});
declare module 'vitest' {
  interface Assertion<T> {
    toBeDisabled: () => T;
  }
}

// 防御性 localStorage 内存桩（历史坑：某些 jsdom 配置无 localStorage；
// 与 useReferenceWorkspace.test 同一模式），测试间清库 + 清审核 store 缓存。
beforeEach(() => {
  if (typeof globalThis.localStorage === 'undefined') {
    const mem = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => mem.get(k) ?? null,
        setItem: (k: string, v: string) => void mem.set(k, v),
        removeItem: (k: string) => void mem.delete(k),
        clear: () => mem.clear(),
      },
    });
  }
  localStorage.clear();
  resetIntelligenceReviewForTests();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

import { act } from 'react';
import IntelligenceReviewPanel from '../IntelligenceReviewPanel';
import { resetIntelligenceReviewForTests, useIntelligenceReview } from '../useIntelligenceReview';
import { workbenchFixture } from '../workbenchFixture';
import { buildForecastCalendar } from '../workbenchCalendar';
import { baseWorkbenchParams, computeWorkbench, type WorkbenchParams, type WorkbenchResult } from '../workbenchModel';
import type { EventRecommendation, IntelligenceItem } from '../intelligenceModel';

/** B.6.2 makeProductIntelligence 本地化。 */
function makeProductIntelligence(): IntelligenceItem {
  return {
    intelligenceId: 'intelligence-sim-promo',
    title: '官方价促',
    summary: '模拟官方价促情报',
    excerpt: '模拟摘录，仅用于审核界面测试',
    sourceName: '模拟情报源',
    sourceUrl: null,
    publishedAt: '2026-11-01T00:00:00Z',
    capturedAt: '2026-11-02T00:00:00Z',
    dataStatus: 'simulated',
    scope: {
      country: workbenchFixture.context.country,
      industry: workbenchFixture.context.industry,
      channel: workbenchFixture.context.channel,
      product: workbenchFixture.context.product,
    },
  };
}

/** B.6.2 makeProductRecommendation 本地化。 */
function makeProductRecommendation(startWeekId: string, endWeekId: string): EventRecommendation {
  return {
    candidateId: 'candidate-sim-promo',
    intelligenceId: 'intelligence-sim-promo',
    target: 'product-range',
    eventType: 'own-promo',
    label: '',
    range: { startWeekId, endWeekId },
    startMonth: null,
    startDay: null,
    durationMonths: null,
    magnitudePct: 8,
    decay: 'flat',
    unitCost: null,
    evidenceState: 'supported',
    missingFields: [],
    rationale: '模拟历史回放参考',
    replayId: 'rp-own-marketing',
  };
}

/** B.6.2 makeCostRecommendation（模块内私有）本地化。 */
function makeCostRecommendation(): EventRecommendation {
  return {
    candidateId: 'candidate-sim-cost',
    intelligenceId: 'intelligence-sim-cost',
    target: 'cost-reference',
    eventType: null,
    label: '',
    range: null,
    startMonth: '2026-12',
    startDay: null,
    durationMonths: null,
    magnitudePct: null,
    decay: null,
    unitCost: 600,
    evidenceState: 'supported',
    missingFields: [],
    rationale: '模拟成本版本参考',
    replayId: null,
  };
}

/** B.6.2 makeReviewPanelProps 本地化（availability ready + 单条产品范围候选）。 */
function makeReviewPanelProps(
  onApplyParams: React.ComponentProps<typeof IntelligenceReviewPanel>['onApplyParams'],
): React.ComponentProps<typeof IntelligenceReviewPanel> {
  const calendar = buildForecastCalendar(workbenchFixture.calendar);
  const params = baseWorkbenchParams(workbenchFixture);
  return {
    availability: 'ready',
    items: [makeProductIntelligence()],
    recommendations: [makeProductRecommendation(calendar.forecastWeeks[0].id, calendar.forecastWeeks[3].id)],
    calendar,
    params,
    result: computeWorkbench(workbenchFixture, params),
    marginScenario: { costOverrides: {}, priceOverrides: {} },
    reviewState: { byCandidate: {} },
    onReviewChange: vi.fn(),
    onApplyParams,
    onApplyMargin: vi.fn(),
  };
}

/** B.6.2 makeMixedBatchProps 本地化：主图 + ④成本 跨目标两条候选。 */
function makeMixedBatchProps(): React.ComponentProps<typeof IntelligenceReviewPanel> {
  const base = makeReviewPanelProps(vi.fn());
  const baseItems = base.items ?? [];
  const baseRecs = base.recommendations ?? [];
  const costItem: IntelligenceItem = {
    ...makeProductIntelligence(),
    intelligenceId: 'intelligence-sim-cost',
    title: '内存成本变化',
  };
  return {
    ...base,
    items: [baseItems[0], costItem],
    recommendations: [baseRecs[0], makeCostRecommendation()],
  };
}

const calendar = buildForecastCalendar(workbenchFixture.calendar);

describe('IntelligenceReviewPanel · 审核闭环（文档给定用例照抄）', () => {
  it('requires preview confirmation and applies once', () => {
    const onApplyParams = vi.fn();
    render(<IntelligenceReviewPanel {...makeReviewPanelProps(onApplyParams)} />);
    fireEvent.click(screen.getByRole('button', { name: /接受.*官方价促/ }));
    expect(onApplyParams).not.toHaveBeenCalled();
    expect(screen.getByText('影响预览')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '确认应用事件' }));
    expect(onApplyParams).toHaveBeenCalledTimes(1);
    expect(screen.getByText('已应用 · 查看落点')).toBeTruthy();
  });

  it('rejects a mixed-target batch apply while allowing batch removal', () => {
    render(<IntelligenceReviewPanel {...makeMixedBatchProps()} />);
    fireEvent.click(screen.getByLabelText('选择当前 Top5'));
    expect(screen.getByRole('button', { name: '批量预览' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '批量移除' }));
    expect(screen.getByText('已移除 2 条 · 撤销')).toBeTruthy();
  });
});

describe('IntelligenceReviewPanel · 空、依据状态与整组撤销（自有用例）', () => {
  it('availability 非 ready：空态「候选生成能力待接入」+ 禁用按钮，不画五条假候选', () => {
    render(<IntelligenceReviewPanel availability="pending" />);
    expect(screen.getByText('候选生成能力待接入')).toBeTruthy();
    expect(screen.getByRole('button', { name: '更新候选' })).toBeDisabled();
    expect(screen.queryByText(/候选事件位/)).toBeNull();
    expect(screen.queryByRole('button', { name: /接受/ })).toBeNull();
  });

  it('依据状态不给概率：partial → 部分待核并逐项列出缺字段；接受打开弹层显示「该幅度为人工假设」', () => {
    const base = makeReviewPanelProps(vi.fn());
    const baseRecs = base.recommendations ?? [];
    const partial = { ...baseRecs[0], evidenceState: 'partial' as const, missingFields: ['durationMonths', 'magnitudePct'] };
    render(<IntelligenceReviewPanel {...base} recommendations={[partial]} />);
    expect(screen.getByText('部分待核')).toBeTruthy();
    expect(screen.getByText(/缺字段/)).toBeTruthy();
    expect(screen.getByText(/时长/)).toBeTruthy();
    // 依据状态不给概率/置信度表达（幅度建议的 % 属于建议数值，不受此限）。
    expect(screen.queryByText(/概率|置信度/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /接受.*官方价促/ }));
    expect(screen.getByText('该幅度为人工假设')).toBeTruthy();
  });

  it('ready 但无候选：「当前情报没有可转化事件」；仍保留人工事件提示', () => {
    render(<IntelligenceReviewPanel {...makeReviewPanelProps(vi.fn())} recommendations={[]} items={[]} />);
    expect(screen.getByText('当前情报没有可转化事件')).toBeTruthy();
  });

  it('批量移除整组一个撤销动作：撤销后两条候选回到待审核', () => {
    render(<IntelligenceReviewPanel {...makeMixedBatchProps()} />);
    fireEvent.click(screen.getByLabelText('选择当前 Top5'));
    fireEvent.click(screen.getByRole('button', { name: '批量移除' }));
    fireEvent.click(screen.getByText('已移除 2 条 · 撤销'));
    expect(screen.queryByText('已移除 2 条 · 撤销')).toBeNull();
    expect(screen.getByRole('button', { name: /接受.*官方价促/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /接受.*内存成本变化/ })).toBeTruthy();
  });
});

describe('useIntelligenceReview · 状态机 / 持久化 / 撤销（自有用例）', () => {
  const KEY_PREFIX = 'LPL3.forecast.intelligenceReview';

  it('setStatus → removed；undo 恢复；持久化到 LPL3.forecast.intelligenceReview.<scopeHash>', () => {
    const scopeHash = 't8hooka';
    const { result } = renderHook(() => useIntelligenceReview(scopeHash));
    expect(result.current.saveState).toBe('ready');
    act(() => {
      result.current.setStatus('candidate-a', 'removed');
    });
    expect(result.current.reviewState.byCandidate['candidate-a']?.status).toBe('removed');
    expect(localStorage.getItem(`${KEY_PREFIX}.${scopeHash}`)).toContain('candidate-a');
    act(() => {
      result.current.undo();
    });
    expect(result.current.reviewState.byCandidate['candidate-a']?.status).toBe('new');
  });

  it('apply 记录 accepted + appliedEventIds + batchId + reviewedAt；整批一个撤销', () => {
    const scopeHash = 't8hookb';
    const { result } = renderHook(() => useIntelligenceReview(scopeHash));
    act(() => {
      result.current.applyBatch([
        { candidateId: 'c1', eventId: 'pe-1' },
        { candidateId: 'c2', eventId: 'pe-2' },
      ], 'batch-1');
    });
    const state = result.current.reviewState.byCandidate;
    expect(state.c1?.status).toBe('accepted');
    expect(state.c1?.batchId).toBe('batch-1');
    expect(state.c1?.appliedEventIds).toEqual(['pe-1']);
    expect(state.c2?.appliedEventIds).toEqual(['pe-2']);
    expect(state.c1?.reviewedAt).toBeTruthy();
    act(() => {
      result.current.undo();
    });
    expect(result.current.reviewState.byCandidate.c1?.status).toBe('new');
    expect(result.current.reviewState.byCandidate.c2?.status).toBe('new');
  });

  it('撤销历史上限 20 步：第 21 次操作后只能回退 20 步', () => {
    const scopeHash = 't8hookc';
    const { result } = renderHook(() => useIntelligenceReview(scopeHash));
    act(() => {
      for (let index = 0; index < 21; index += 1) {
        result.current.setStatus(`candidate-${index}`, 'removed');
      }
    });
    for (let index = 0; index < 20; index += 1) {
      act(() => {
        result.current.undo();
      });
    }
    expect(result.current.canUndo).toBe(false);
  });

  it('localStorage 写入失败：saveState = unpersisted（内存态继续），重试后恢复 ready', async () => {
    const scopeHash = 't8hookd';
    const real = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => null,
        setItem: () => { throw new Error('quota'); },
        removeItem: () => {},
        clear: () => {},
      },
    });
    const { result } = renderHook(() => useIntelligenceReview(scopeHash));
    act(() => {
      result.current.setStatus('candidate-x', 'rejected');
    });
    expect(result.current.saveState).toBe('unpersisted');
    expect(result.current.reviewState.byCandidate['candidate-x']?.status).toBe('rejected');
    // 恢复可写存储后重试 → ready + 持久化成功。
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: real });
    act(() => {
      result.current.retryPersist();
    });
    await waitFor(() => expect(result.current.saveState).toBe('ready'));
    expect(localStorage.getItem(`${KEY_PREFIX}.${scopeHash}`)).toContain('candidate-x');
    localStorage.removeItem(`${KEY_PREFIX}.${scopeHash}`);
  });

  it('坏 JSON / 错型候选逐条隔离，不崩溃（回空工作区）', () => {
    const scopeHash = 't8hooke';
    localStorage.setItem(`${KEY_PREFIX}.${scopeHash}`, '{not-json');
    const { result } = renderHook(() => useIntelligenceReview(scopeHash));
    expect(result.current.reviewState.byCandidate).toEqual({});
    expect(result.current.saveState).toBe('ready');
    localStorage.removeItem(`${KEY_PREFIX}.${scopeHash}`);
  });
});

/** 类型级守卫（编译期验证 WorkbenchParams / WorkbenchResult 面板消费面）。 */
export type __PanelContract = WorkbenchParams | WorkbenchResult;
