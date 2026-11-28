// ============================================================
// 明细表「分析提示」条：默认仅一条，其余按需展开；计算过程在独立浮层中
// 呈现；忽略写 sessionStorage，追问以含标题的 prompt 调 openAgent。
// ============================================================
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { Insight } from '../insights';

const openAgent = vi.fn();
vi.mock('../../../state/AgentContext', () => ({ useAgent: () => ({ openAgent }) }));

import InsightStrip, { INSIGHT_DISMISS_KEY } from '../InsightStrip';
import TrendTables from '../TrendTables';
import type { TableGroup } from '../tableModel';
import type { CurrencyMode, Granularity, Series } from '../../../dataModel/types';

const mkInsight = (n: number): Insight => ({
  id: `priceMove|s${n}||202620`,
  kind: 'priceMove',
  groupKey: 'g1',
  seriesKey: `s${n}`,
  title: `产品${n} 近 4 周降价 ${n + 5}.0%`,
  figures: [{ label: '近4周环比', value: `−${n + 5}.0%` }],
  bucketId: '202620',
  evidence: [
    { step: '输入', text: '输入文本' },
    { step: '筛选', text: '筛选文本' },
    { step: '公式', text: '公式文本' },
    { step: '舍入', text: '舍入文本' },
    { step: '输出', text: '输出文本' },
  ],
  severity: 2,
  magnitude: 0.05,
  seriesLabel: `产品${n}`,
});

const mount = (count = 5, onLocate = vi.fn()) =>
  render(<InsightStrip groupTitle="第一组" insights={Array.from({ length: count }, (_, i) => mkInsight(i + 1))} onLocate={onLocate} />);

beforeEach(() => window.sessionStorage.clear());
afterEach(() => {
  cleanup();
  openAgent.mockReset();
});

describe('InsightStrip', () => {
  it('region 命名；默认仅一条主提示，其余按需展开', () => {
    mount(5);
    expect(screen.getByRole('region', { name: '第一组 分析提示' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^追问：/ })).toHaveLength(1);
    expect(screen.queryByText('产品2 近 4 周降价 7.0%')).toBeNull();
    expect(screen.queryByText('输入文本')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '另有 4 条' }));
    expect(screen.getAllByRole('button', { name: /^追问：/ })).toHaveLength(5);
  });

  it('没有提示时不渲染', () => {
    const { container } = mount(0);
    expect(container.innerHTML).toBe('');
  });

  it('计算过程在带标题的独立浮层按需展开，不挤开明细', () => {
    mount(1);
    const btn = screen.getByRole('button', { name: '计算过程：产品1 近 4 周降价 6.0%' });
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('输入文本')).toBeNull();
    fireEvent.click(btn);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    const dialog = screen.getByRole('dialog', { name: '计算过程：产品1 近 4 周降价 6.0%' });
    expect(within(dialog).getByRole('heading', { name: '计算过程' })).toBeTruthy();
    const list = within(dialog).getByRole('list', { name: '计算步骤' });
    expect(list.textContent).toContain('输入输入文本');
    expect(list.textContent).toContain('输出输出文本');
    expect(screen.getByRole('region').contains(dialog)).toBe(false);
    fireEvent.click(within(dialog).getByRole('button', { name: '关闭计算过程' }));
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });

  it('忽略：卡片消失，id 写入 sessionStorage，重新挂载仍隐藏', () => {
    mount(2);
    fireEvent.click(screen.getByRole('button', { name: '忽略：产品1 近 4 周降价 6.0%' }));
    expect(screen.queryByText('产品1 近 4 周降价 6.0%')).toBeNull();
    expect(JSON.parse(window.sessionStorage.getItem(INSIGHT_DISMISS_KEY) ?? '[]')).toEqual(['priceMove|s1||202620']);
    cleanup();
    mount(2);
    expect(screen.queryByText('产品1 近 4 周降价 6.0%')).toBeNull();
    expect(screen.getByText('产品2 近 4 周降价 7.0%')).toBeTruthy();
  });

  it('追问：openAgent(dock) 的 prompt 含标题与结构化上下文', () => {
    mount(1);
    fireEvent.click(screen.getByRole('button', { name: '追问：产品1 近 4 周降价 6.0%' }));
    expect(openAgent).toHaveBeenCalledTimes(1);
    const [mode, prompt] = openAgent.mock.calls[0];
    expect(mode).toBe('dock');
    expect(prompt).toContain('请解释这条分析提示并给出核查建议：产品1 近 4 周降价 6.0%');
    expect(prompt).toContain('结构化上下文：');
    expect(prompt).toContain('"bucketId":"202620"');
  });

  it('TrendTables 集成：提示条渲染在表格网格之外；定位给目标列铺 selectSoft 高亮', () => {
    const buckets = [0, 1, 2, 3].map((i) => ({ id: `20262${i}`, xLabel: `0${i + 1}-07`, anchorDate: `2026-0${i + 1}-07` }));
    const mkS = (key: string, label: string, prices: number[]): Series => ({
      key, isOwn: key === 'main', brand: label.split(' ')[0], label, skuIds: [key], color: '#000',
      points: prices.map((p, i) => ({ bucketId: buckets[i].id, xLabel: buckets[i].xLabel, anchorDate: buckets[i].anchorDate, rrp: null, price: p, missing: false, offer: null, url: '', shopName: null })),
    });
    const groups: TableGroup[] = [{ id: 'g1', mainKey: 'main', series: [mkS('main', 'HUAWEI Mate', [100, 100, 100, 100]), mkS('c', 'APPLE iPhone', [110, 105, 100, 95])] }];
    render(<TrendTables groups={groups} buckets={buckets} fourWeekChanges={new Map()} currency={'usd' as CurrencyMode} granularity={'week' as Granularity} />);
    const region = screen.getByRole('region', { name: /分析提示$/ });
    expect(screen.getByRole('table').contains(region)).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: /^定位：APPLE iPhone 已低于/ }));
    const head = document.querySelector<HTMLElement>(`[data-bucket-col="${buckets[3].id}"]`)!;
    expect(head.style.boxShadow).toContain('9999px');
    expect(document.querySelector<HTMLElement>(`[data-bucket-col="${buckets[0].id}"]`)!.style.boxShadow).toBe('');
  });

  it('定位：回传 bucketId', () => {
    const onLocate = vi.fn();
    mount(1, onLocate);
    fireEvent.click(screen.getByRole('button', { name: '定位：产品1 近 4 周降价 6.0%' }));
    expect(onLocate).toHaveBeenCalledWith('202620');
  });
});
