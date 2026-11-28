// @vitest-environment jsdom
// 页头搜索 = Agent 快速筛选入口：输入意图 → 筛选预览 → Enter 应用 → 撤销恢复
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App as AntdApp } from 'antd';
import { AgentProvider, useAgent } from '../../state/AgentContext';
import { FiltersProvider, useFilters } from '../../state/FiltersContext';
import { PageProvider } from '../../state/PageContext';
import PriceTrendSearch from '../PriceTrendSearch';
import type { FiltersState } from '../../state/filtersTypes';

vi.mock('../AlertCenter', () => ({ useAlerts: () => [] }));

const probe: { state: FiltersState | null; agentOpen: boolean } = { state: null, agentOpen: false };
function Probe() {
  probe.state = useFilters().state;
  probe.agentOpen = useAgent().open;
  return null;
}

function renderSearch() {
  return render(<AntdApp component={false}><PageProvider><FiltersProvider><AgentProvider>
    <PriceTrendSearch /><Probe />
  </AgentProvider></FiltersProvider></PageProvider></AntdApp>);
}

const input = () => screen.getByLabelText('PriceAgent 快速筛选') as HTMLInputElement;
const type = (value: string) => {
  fireEvent.focus(input());
  fireEvent.change(input(), { target: { value } });
};

beforeEach(() => {
  window.history.replaceState(null, '', '/?p=dashboard');
  sessionStorage.clear();
  try { window.localStorage.clear(); } catch { /* in-memory fallback */ }
});
afterEach(() => {
  cleanup();
  document.querySelectorAll('.ant-message').forEach((node) => node.remove());
});

describe('PriceTrendSearch · 快速筛选预览', () => {
  it('输入意图显示预览行；Enter 应用；撤销恢复本次改动的键', async () => {
    renderSearch();
    const before = probe.state!;
    expect(before.viewMode).toBe('compare');
    expect(input().placeholder).toBe('快速筛选：产品 / 国家 / 档位…');
    type('Mate X7 同档 苹果 三星 按品牌分列');
    const region = await screen.findByRole('region', { name: '筛选预览' });
    expect(within(region).getByText('产品')).toBeTruthy();
    expect(within(region).getByText('视图')).toBeTruthy();
    expect(within(region).getByText('在对话中分析')).toBeTruthy();
    expect(within(region).getByText(/应用/)).toBeTruthy();

    fireEvent.keyDown(input(), { key: 'Enter' });
    await waitFor(() => expect(probe.state!.viewMode).toBe('columns'));
    expect(probe.state!.mains.some((card) => card.main?.modelId === 'own-huawei-mate-x7')).toBe(true);
    expect(screen.queryByRole('region', { name: '筛选预览' })).toBeNull();

    const undo = await screen.findByRole('button', { name: '撤销' });
    expect(undo.closest('.lpl-quick-search-feedback')).not.toBeNull();
    act(() => { fireEvent.click(undo); });
    await waitFor(() => expect(probe.state!.viewMode).toBe('compare'));
    expect(JSON.stringify(probe.state!.mains.map((card) => card.main))).toBe(JSON.stringify(before.mains.map((card) => card.main)));
    expect(probe.state!.currency).toBe(before.currency);
  });

  it('问题类输入提供「转到对话深度分析」', async () => {
    renderSearch();
    type('为什么 Mate X7 同档 苹果 更便宜');
    const region = await screen.findByRole('region', { name: '筛选预览' });
    expect(within(region).getByRole('button', { name: '转到对话深度分析' })).toBeTruthy();
  });

  it('普通型号搜索不显示预览，Enter 仍选产品', async () => {
    renderSearch();
    type('Mate X7');
    await new Promise((resolve) => setTimeout(resolve, 220));
    expect(screen.queryByRole('region', { name: '筛选预览' })).toBeNull();
    expect(screen.getByLabelText('产品命中结果')).toBeTruthy();
  });

  it('有预览时 ↑↓ 显式选中的产品命中，Enter 仍选该产品', async () => {
    renderSearch();
    // 「Pura 90s」同时命中 Pro 与 Pro Max（≥2 个产品 = 结构化预览），产品列表也有两条
    type('Pura 90s');
    await screen.findByRole('region', { name: '筛选预览' });
    const hits = within(screen.getByLabelText('产品命中结果')).getAllByRole('button').filter((node) => node.hasAttribute('data-search-model-id'));
    expect(hits.length).toBeGreaterThanOrEqual(2);
    const second = hits[1].getAttribute('data-search-model-id');
    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    fireEvent.keyDown(input(), { key: 'Enter' });
    // 选产品走原有路径：单卡 = 被箭头选中的那一款
    await waitFor(() => expect(probe.state!.mains.map((card) => card.main?.modelId)).toEqual([second]));
  });

  it('⌘K 在看板聚焦页头搜索而不是打开 Agent 面板', async () => {
    renderSearch();
    expect(document.activeElement).not.toBe(input());
    act(() => { fireEvent.keyDown(window, { key: 'k', metaKey: true }); });
    await waitFor(() => expect(document.activeElement).toBe(input()));
    expect(probe.agentOpen).toBe(false);
    expect(screen.getByRole('dialog', { name: '价格走势快速搜索结果' })).toBeTruthy();
  });
});
