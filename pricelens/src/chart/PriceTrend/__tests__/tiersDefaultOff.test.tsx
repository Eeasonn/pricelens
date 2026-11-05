// ============================================================
// 第196轮整改2（Eason）：档位默认关 + 齿轮「已修改」蓝点按本页默认值判断。
// ① Chart 未受控（内部缺省）时：价格档位带不渲染（TierBand 小标缺席）、Y 刻度照常；
// ② showTiers 显式传 true（显示设置打开 / 量价页等调用方）→ 档位带照常渲染；
// ③ ChartToolbar：showTiers 偏离 tiersDefault 才亮「已修改」蓝点——价格页默认关
//   （tiersDefault=false，开档位才亮灯）、量价页默认开（缺省 true，关档位亮灯）。
// ============================================================
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { waitForGeom } from './chartTestUtils';
import Chart from '../Chart';
import ChartToolbar from '../ChartToolbar';
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

const OWN = 'OWN__12GB';
const series: Series[] = [
  {
    key: OWN,
    isOwn: true,
    brand: 'HUAWEI',
    label: 'HUAWEI Mate 70 12GB',
    skuIds: ['sku-1'],
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

const baseProps = {
  series,
  granularity: 'week' as const,
  currency: 'usd' as const,
  priceTypes: { discounted: true, rrp: false },
  gridLeft: 76, // 名称带 14（呼吸位）+ 轴列 62（仅刻度自适应）
  gridTop: 36,
};



beforeEach(() => {
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

describe('第196轮整改2：价格档位默认关（Y 轴默认只显示刻度）', () => {
  it('未受控（内部缺省）：档位带不渲染，Y 刻度标签照常显示', async () => {
    const { container } = render(<Chart {...baseProps} /> as ReactElement);
    await waitForGeom(container);
    // 档位带常驻小标缺席（TierBand 整带不渲染）
    expect(screen.queryByTitle('价格档位（USD）')).toBeNull();
    // Y 刻度标签照常（DOM 刻度 = tnum 文字格）
    const tickTexts = container.querySelectorAll('div.tnum');
    expect(tickTexts.length).toBeGreaterThan(0);
  });

  it('showTiers=true（显示设置打开 / 量价页调用方）：档位带照常渲染', async () => {
    const { container } = render(<Chart {...baseProps} gridLeft={140} showTiers /> as ReactElement);
    await waitForGeom(container);
    expect(screen.getByTitle('价格档位（USD）')).toBeTruthy();
  });

  it('仅刻度（默认态）轴列不预留档位空位：gridLeft 全部给呼吸带+刻度列', async () => {
    // 默认态 gridLeft = 76 时绘图区左缘 = 76；档位带关闭后不存在「刻度右移让位」
    const { container } = render(<Chart {...baseProps} /> as ReactElement);
    await waitForGeom(container);
    const ticks = container.querySelectorAll('div.tnum');
    expect(ticks.length).toBeGreaterThan(0);
    // 第一枚刻度左缘紧贴容器左缘（tickLeft = 0，无档位区块在前）
    const first = ticks[0] as HTMLElement;
    expect(Number(first.style.left.replace('px', ''))).toBe(0);
  });
});

describe('第196轮整改2：齿轮「已修改」蓝点按本页默认值判断', () => {
  const toolbarBase = {
    mode: 'cluster' as const,
    currency: 'usd' as const,
    sliderScale: 1,
    onSliderScale: vi.fn(),
    onShowYTicks: vi.fn(),
    onShowTiers: vi.fn(),
    onYCompress: vi.fn(),
    onLineShape: vi.fn(),
  };

  it('价格页（默认关）：showTiers=false 无蓝点；=true（用户打开）亮蓝点', () => {
    const { unmount } = render(<ChartToolbar {...toolbarBase} showYTicks showTiers={false} tiersDefault={false} /> as ReactElement);
    expect(screen.queryByTitle('Y 轴显示设置（已修改）')).toBeNull();
    expect(screen.getByTitle('Y 轴显示设置')).toBeTruthy();
    unmount();
    render(<ChartToolbar {...toolbarBase} showYTicks showTiers tiersDefault={false} /> as ReactElement);
    expect(screen.getByTitle('Y 轴显示设置（已修改）')).toBeTruthy();
  });

  it('量价页（缺省默认开）：showTiers=false 亮蓝点（旧语义不变）', () => {
    render(<ChartToolbar {...toolbarBase} showYTicks showTiers={false} /> as ReactElement);
    expect(screen.getByTitle('Y 轴显示设置（已修改）')).toBeTruthy();
  });
});
