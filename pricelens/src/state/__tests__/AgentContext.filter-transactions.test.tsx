// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { AgentProvider, useAgent } from '../AgentContext';
import { FiltersProvider, useFilters } from '../FiltersContext';
import { PageProvider } from '../PageContext';

vi.mock('../../components/AlertCenter', () => ({ useAlerts: () => [] }));

const wrapper = ({ children }: { children: ReactNode }) => <PageProvider><FiltersProvider><AgentProvider>{children}</AgentProvider></FiltersProvider></PageProvider>;
const filterCard = (id: string, patch: { currency?: 'local' | 'usd'; granularity?: 'week' | 'month' }) => ({ kind: 'filter' as const, id, title: id, patch, changes: [] });

beforeEach(() => {
  window.history.replaceState(null, '', '/?p=dashboard');
  sessionStorage.clear();
  try { window.localStorage.clear(); } catch { /* FiltersProvider has an in-memory fallback. */ }
});
afterEach(cleanup);

describe('stable Agent · 筛选事务撤销', () => {
  it('A→B 后禁止 A 误撤销 B；按交易顺序恢复并同步活动/重做状态', () => {
    const { result } = renderHook(() => ({ agent: useAgent(), filters: useFilters() }), { wrapper });
    let txA = '';
    let txB = '';
    act(() => { const applied = result.current.agent.applyFilter(filterCard('tx-a', { currency: 'local' })); if (!applied.ok) throw new Error(applied.error); txA = applied.transactionId; });
    act(() => { const applied = result.current.agent.applyFilter(filterCard('tx-b', { granularity: 'month' })); if (!applied.ok) throw new Error(applied.error); txB = applied.transactionId; });
    expect(result.current.filters.state.currency).toBe('local');
    expect(result.current.filters.state.granularity).toBe('month');

    let undone = true;
    act(() => { undone = result.current.agent.undoFilter(txA); });
    expect(undone).toBe(false);
    expect(result.current.filters.state.currency).toBe('local');
    expect(result.current.filters.state.granularity).toBe('month');
    expect(result.current.agent.appliedFilterIds.has(txA)).toBe(true);
    expect(result.current.agent.appliedFilterIds.has(txB)).toBe(true);

    act(() => { undone = result.current.agent.undoFilter(txB); });
    expect(undone).toBe(true);
    expect(result.current.filters.state.granularity).toBe('week');
    expect(result.current.agent.appliedFilterIds.has(txB)).toBe(false);
    expect(result.current.agent.redoFilterIds.has(txB)).toBe(true);

    act(() => { undone = result.current.agent.undoFilter(txA); });
    expect(undone).toBe(true);
    expect(result.current.filters.state.currency).toBe('usd');
    expect(result.current.agent.appliedFilterIds.has(txA)).toBe(false);
    expect(result.current.agent.redoFilterIds.has(txA)).toBe(true);

    act(() => { undone = result.current.agent.redoFilter(txA); });
    expect(undone).toBe(true);
    expect(result.current.filters.state.currency).toBe('local');
    expect(result.current.agent.appliedFilterIds.has(txA)).toBe(true);
    expect(result.current.agent.redoFilterIds.has(txA)).toBe(false);
  });

  it('卡片交易映射在撤销/重做间保留，新对话时清空', () => {
    const { result } = renderHook(() => ({ agent: useAgent() }), { wrapper });
    let transaction = '';
    act(() => { const applied = result.current.agent.applyFilter(filterCard('persist-card', { currency: 'local' })); if (!applied.ok) throw new Error(applied.error); transaction = applied.transactionId; });
    expect(result.current.agent.filterTransactions.get('persist-card')).toBe(transaction);
    act(() => { result.current.agent.undoFilter(transaction); });
    expect(result.current.agent.filterTransactions.get('persist-card')).toBe(transaction);
    act(() => { result.current.agent.redoFilter(transaction); });
    expect(result.current.agent.filterTransactions.get('persist-card')).toBe(transaction);
    act(() => { result.current.agent.newConversation(); });
    expect(result.current.agent.filterTransactions.size).toBe(0);
  });

  it('同一张卡重复应用也生成独立交易，撤销一张不会清除另一张的活动状态', () => {
    const { result } = renderHook(() => ({ agent: useAgent(), filters: useFilters() }), { wrapper });
    let first = '';
    let second = '';
    act(() => { const applied = result.current.agent.applyFilter(filterCard('same-card', { currency: 'local' })); if (!applied.ok) throw new Error(applied.error); first = applied.transactionId; });
    act(() => { const applied = result.current.agent.applyFilter(filterCard('same-card', { granularity: 'month' })); if (!applied.ok) throw new Error(applied.error); second = applied.transactionId; });
    expect(second).not.toBe(first);

    let undone = true;
    act(() => { undone = result.current.agent.undoFilter(first); });
    expect(undone).toBe(false);
    act(() => { undone = result.current.agent.undoFilter(second); });
    expect(undone).toBe(true);
    expect(result.current.agent.appliedFilterIds.has(first)).toBe(true);
    expect(result.current.agent.appliedFilterIds.has(second)).toBe(false);
    expect(result.current.filters.state.currency).toBe('local');

    act(() => { undone = result.current.agent.undoFilter(first); });
    expect(undone).toBe(true);
    expect(result.current.filters.state.currency).toBe('usd');
  });
});
