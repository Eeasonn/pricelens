// ============================================================
// 合并多组 · 方案 B「主品切换」（2026-11-08 Eason 选型，
// 高保真稿 merged-volume-variants 方案 B）：
// ①candidates ≥2：量带（vMax 刻度/柱色/极值标注/区间量尺/悬停量卡归属）跟随
//   volumeActiveKey；缺省第一个候选；未知 key 回落第一个；单候选/缺省 = 原行为。
// ②切换入口：销量归属药丸点击循环（描强调边 + ⇄）；名称带候选主品药丸右侧
//   「量」按钮直接指定（药丸本体点击 = 隐藏/恢复，语义不变）。
// ③悬停量卡：候选 ≥2 时每个候选主品一行（色点+名称+当周销量），柱只画 active。
// 名称带 pill 文本 = curveNameOf（去品牌/GB），aria 文案据此取 'nova 14 256'。
// ============================================================
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { waitForGeom } from './chartTestUtils';
import Chart from '../Chart';
import type { Series } from '../../../dataModel/types';

vi.mock('echarts/core', async () => await import('./echartsStub'));
vi.mock('echarts/charts', () => ({ LineChart: class {}, ScatterChart: class {} }));
vi.mock('echarts/components', () => ({ GridComponent: class {} }));
vi.mock('echarts/renderers', () => ({ CanvasRenderer: class {} }));

class ResizeObserverStub {
  cb: ResizeObserverCallback;
  constructor(cb: ResizeObserverCallback) {
    this.cb = cb;
  }
  observe(el: Element): void {
    setTimeout(() => this.cb([{ target: el, contentRect: { width: 900 } } as ResizeObserverEntry], this as unknown as ResizeObserver), 0);
  }
  unobserve(): void {}
  disconnect(): void {}
}
if (typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver === 'undefined') {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
}

const OWN_A = 'OWN_A__12GB';
const OWN_B = 'OWN_B__256GB';
const mkSeries = (key: string, label: string, color: string): Series => ({
  key,
  isOwn: true,
  brand: 'HUAWEI',
  label,
  skuIds: ['sku'],
  color,
  points: [1000, 990, 980, 970, 960].map((p, i) => ({
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
});
const series = [mkSeries(OWN_A, 'HUAWEI Pura 80 12GB', '#c7000b'), mkSeries(OWN_B, 'HUAWEI nova 14 256GB', '#8a0a10')];
const volumesA = [1000, 1100, null, 1300, 900]; // max 1300 → bandMax 2000
const volumesB = [4000, 4200, null, 5000, 3800]; // max 5000 → bandMax 6000

const baseProps = {
  series,
  granularity: 'week' as const,
  currency: 'usd' as const,
  priceTypes: { discounted: true, rrp: false },
  gridLeft: 60,
  gridTop: 36,
  showXLabels: true,
  tipMode: 'wow' as const,
  volumeOn: true,
  volumes: volumesA,
  volumeMode: 'bar' as const,
  volumeColor: '#c7000b',
  volumeHeight: 120,
  volumeOwner: { key: OWN_A, brand: 'HUAWEI', text: 'Pura 80 12GB' },
  nameZoneWidth: 120,
  paneLabels: true,
  rangeMode: 'extreme' as const,
  onVolumeActiveKey: vi.fn(),
  volumeCandidates: [
    { key: OWN_A, brand: 'HUAWEI', text: 'Pura 80 12GB', color: '#c7000b', volumes: volumesA },
    { key: OWN_B, brand: 'HUAWEI', text: 'nova 14 256GB', color: '#8a0a10', volumes: volumesB },
  ],
};

beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

describe('合并多组 · 量带归属切换（方案 B）', () => {
  it('缺省 = 第一个候选：量轴上限按候选 A（2,000）、归属药丸 = A 且描强调边', async () => {
    const { container } = render(<Chart {...baseProps} /> as ReactElement);
    await waitForGeom(container);
    expect(screen.getByLabelText('销量归属：Pura 80 12GB；点击切换到下一组主品的销量')).toBeTruthy();
    expect(document.body.textContent).toContain('1,500');
    const pill = document.querySelector('[data-testid="volume-owner-pill"]') as HTMLElement;
    expect(pill.style.border).toContain('rgb(0, 112, 243)');
  });

  it('volumeActiveKey = 候选 B：量轴上限切到 B（6,000）、极值标注换 B 的量值', async () => {
    const { container } = render(<Chart {...baseProps} volumeActiveKey={OWN_B} /> as ReactElement);
    await waitForGeom(container);
    expect(document.body.textContent).toContain('6,000');
    expect(document.body.textContent).not.toContain('2,000');
    expect(screen.getByTestId('volume-mark-max').textContent).toBe('5 000'); // 图上裸数 = fmtInt 空格千分位（2026-11-10 审计修）
    expect(screen.getByLabelText('设为量带归属：nova 14 256').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByLabelText('设为量带归属：Pura 80 12').getAttribute('aria-pressed')).toBe('false');
  });

  it('归属药丸点击 = 循环切换（A → B）', async () => {
    const onKey = vi.fn();
    const { container } = render(<Chart {...baseProps} onVolumeActiveKey={onKey} /> as ReactElement);
    await waitForGeom(container);
    fireEvent.click(screen.getByTestId('volume-owner-pill'));
    expect(onKey).toHaveBeenCalledWith(OWN_B);
  });

  it('名称带候选药丸右侧「量」按钮：点击直接指定归属；药丸本体点击仍是隐藏/恢复', async () => {
    const onKey = vi.fn();
    const onToggle = vi.fn();
    const { container } = render(<Chart {...baseProps} onVolumeActiveKey={onKey} onToggleHidden={onToggle} /> as ReactElement);
    await waitForGeom(container);
    fireEvent.click(screen.getByLabelText('设为量带归属：nova 14 256'));
    expect(onKey).toHaveBeenLastCalledWith(OWN_B);
    // active（受控 prop）未随回调变化 → A 仍是当前归属，点已归属品 = no-op（不重复派发）
    fireEvent.click(screen.getByLabelText('设为量带归属：Pura 80 12'));
    expect(onKey).toHaveBeenCalledTimes(1);
    // 药丸本体 = 隐藏语义（title 不变），点「量」不触发隐藏
    expect(screen.getAllByTitle('点击隐藏该产品').length).toBe(2);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('悬停量卡：候选 ≥2 = 每个候选一行（名称+当周销量）', async () => {
    const { container } = render(<Chart {...baseProps} volumeActiveKey={OWN_B} /> as ReactElement);
    await waitForGeom(container);
    // 悬停量带捕获层（React 合成事件在捕获层自身，不从 wrap 冒泡下来）
    const band = document.querySelector('[data-testid="volume-hover-layer"]') as HTMLElement;
    fireEvent.mouseMove(band, { clientX: 300 });
    const card = document.querySelector('[data-testid="volume-hover-card"]');
    expect(card).toBeTruthy();
    expect(card?.textContent).toContain('Pura 80 12');
    expect(card?.textContent).toContain('nova 14 256');
    // 第 2 桶：A=1100、B=4200（fmt 千分位）
    expect(card?.textContent).toContain('1,100');
    expect(card?.textContent).toContain('4,200');
  });

  it('单候选 = 原行为：无「量」按钮、归属药丸不可切（hairline 边）、悬停量卡单行无候选名', async () => {
    const single = {
      ...baseProps,
      volumeCandidates: [baseProps.volumeCandidates[0]],
      onVolumeActiveKey: undefined,
    };
    const { container } = render(<Chart {...single} /> as ReactElement);
    await waitForGeom(container);
    expect(screen.queryByLabelText(/设为量带归属/)).toBeNull();
    const pill = document.querySelector('[data-testid="volume-owner-pill"]') as HTMLElement;
    expect(pill.style.border).toContain('rgb(235, 235, 235)');
    expect(pill.textContent).not.toContain('⇄');
    // 悬停量带捕获层（React 合成事件在捕获层自身，不从 wrap 冒泡下来）
    const band = document.querySelector('[data-testid="volume-hover-layer"]') as HTMLElement;
    fireEvent.mouseMove(band, { clientX: 300 });
    const card = document.querySelector('[data-testid="volume-hover-card"]');
    expect(card?.textContent).not.toContain('nova 14 256');
  });

  it('未知 activeKey 回落第一个候选（mains 变化后失效自愈）', async () => {
    const { container } = render(<Chart {...baseProps} volumeActiveKey="GONE__1TB" /> as ReactElement);
    await waitForGeom(container);
    expect(screen.getByLabelText('销量归属：Pura 80 12GB；点击切换到下一组主品的销量')).toBeTruthy();
  });
});
