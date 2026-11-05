// ============================================================
// 第196轮整改5（Eason 领导要求）：量层测试。
// Chart：量层开启 = 价格绘图区下方量带（柱|面积两模式）+ 右侧量轴三档刻度
// （vMax / vMax/2 / 0，随量层缩放）；柱视觉常量与量价页 VolumeBars 同源
// （柱宽 0.62×列宽、rx=1、α0.18/悬停 0.38）；量层关闭 = 不渲染。
// ChartToolbar：大促档期左侧「量」开关（默认关）+ 开启后同组 柱|面积 Segmented。
// ============================================================
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { waitForGeom } from './chartTestUtils';
import Chart from '../Chart';
import ChartToolbar from '../ChartToolbar';
import { niceCeil } from '../../../dataModel/volume';
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
  },
];

const baseProps = {
  series,
  granularity: 'week' as const,
  currency: 'usd' as const,
  priceTypes: { discounted: true, rrp: false },
  gridLeft: 60,
  gridTop: 36,
  showXLabels: true,
  tipMode: 'wow' as const,
};

const VOLUMES: (number | null)[] = [5200, 4800, null, 6100, 3900];


beforeEach(() => {
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

describe('第196轮整改5：量层（价格绘图区下方 + 右轴）', () => {
  it('柱模式：非空销量逐桶出柱（rx=1），null 桶不出柱', async () => {
    const { container } = render(<Chart {...baseProps} volumeOn volumes={VOLUMES} volumeHeight={120} volumeColor="#c7000b" /> as ReactElement);
    await waitForGeom(container);
    const rects = container.querySelectorAll('svg rect');
    // 非 null 销量 = 4 桶 → 4 柱；null 桶不出柱
    expect(rects.length).toBe(VOLUMES.filter((v) => v != null).length);
    // VolumeBars 同款视觉常量：rx = 1
    for (const r of rects) expect(r.getAttribute('rx')).toBe('1');
    // 柱宽 = 0.62 × 列宽（列宽 = plotWidth/n，量层开启时 gridRight = 56）
    const colW = (900 - 60 - 56) / 5;
    expect(Number(rects[0].getAttribute('width'))).toBeCloseTo(0.62 * colW, 5);
  });

  it('右轴三档刻度随量层缩放（vMax=niceCeil(max)、vMax/2、0），仅量层开启出现', async () => {
    const vMax = niceCeil(Math.max(...VOLUMES.filter((v): v is number => v != null)));
    const { container } = render(<Chart {...baseProps} volumeOn volumes={VOLUMES} volumeHeight={120} /> as ReactElement);
    await waitForGeom(container);
    expect(screen.getByText(vMax.toLocaleString('en-US'))).toBeTruthy();
    expect(screen.getByText(Math.round(vMax / 2).toLocaleString('en-US'))).toBeTruthy();
    expect(screen.getByText('0')).toBeTruthy();
    // 右轴线存在（量轴 hairline）
    const wrapper = container.firstElementChild as HTMLElement;
    const axisLines = Array.from(wrapper.querySelectorAll('div[style]')).filter((d) => (d as HTMLElement).style.height === '120px' && (d as HTMLElement).style.width === '1px');
    expect(axisLines.length).toBeGreaterThanOrEqual(1);
    // 关闭量层 = 刻度全消失
    cleanup();
    const { container: c2 } = render(<Chart {...baseProps} volumes={VOLUMES} /> as ReactElement);
    await waitForGeom(c2);
    expect(screen.queryByText(vMax.toLocaleString('en-US'))).toBeNull();
  });

  it('面积模式：纯半透明面积（无描边线），不出柱 rect', async () => {
    const { container } = render(<Chart {...baseProps} volumeOn volumeMode="area" volumes={VOLUMES} volumeHeight={120} /> as ReactElement);
    await waitForGeom(container);
    expect(container.querySelectorAll('svg rect').length).toBe(0);
    const path = container.querySelector('svg path');
    expect(path).toBeTruthy();
    // 无边界描边线：stroke = none
    expect(path!.getAttribute('stroke')).toBe('none');
    // 半透明填充（缺省色 = color.mute，α0.18 与柱模式同透明度语言）
    expect(path!.getAttribute('fill')).toMatch(/^rgba\(.+, 0\.18\)$/);
    // 路径语法良构（2026-11-05 Eason「面积无呈现」回归）：每个命令后坐标必须成对
    // ——旧实现拼出「M x y volBase L …」奇数序列，M 吞掉后续 x 当配对值整条画出界
    const d = path!.getAttribute('d') ?? '';
    expect(d).not.toBe('');
    for (const seg of d.split(/(?=[MLZ])/).filter((s) => s.trim() && !s.trim().startsWith('Z'))) {
      const nums = seg.trim().slice(1).trim().split(/[\s,]+/).map(Number);
      expect(nums.length % 2).toBe(0);
      expect(nums.every((n) => Number.isFinite(n))).toBe(true);
    }
  });

  it('量层开启时 canvas 网格让出量带（grid.bottom 增大）→ 时间标签下移，量带无分界线', async () => {
    // x 轴线隐藏由 buildOption bottomExtra 承担；此处验证 DOM 侧量带区域无分界横线：
    // 量带区间内（plotBottom ~ plotBottom+volBandH）不存在横贯线元素
    const { container } = render(<Chart {...baseProps} volumeOn volumes={VOLUMES} volumeHeight={120} /> as ReactElement);
    await waitForGeom(container);
    const wrapper = container.firstElementChild as HTMLElement;
    // 量带 = plotTop + plotHeight 起；全图层中不应有 height=1 的横线落在量带内
    const hrules = Array.from(wrapper.querySelectorAll('div[style]')).filter((d) => {
      const st = (d as HTMLElement).style;
      return st.height === '1px' && Number(st.width.replace('px', '')) > 100;
    });
    for (const d of hrules) {
      const top = Number((d as HTMLElement).style.top.replace('px', ''));
      // 绘图区内横向虚线（悬停十字等）不在量带（> 460）内
      expect(top).toBeLessThan(36 + 448);
    }
  });
});

describe('第196轮整改5：工具行「量」开关（大促档期左侧 + 柱|面积）', () => {
  const toolbarBase = {
    mode: 'actions' as const,
    currency: 'usd' as const,
    onPromoBandsOn: vi.fn(),
    onOffersOn: vi.fn(),
  };

  it('量开关在大促档期之前（左侧同组），默认关；点击开启回调 true', () => {
    const onVolumeOn = vi.fn();
    render(<ChartToolbar {...toolbarBase} volumeOn={false} onVolumeOn={onVolumeOn} /> as ReactElement);
    const box = screen.getByText('量').closest('div')!.parentElement!.parentElement!;
    const labels = Array.from(box.querySelectorAll('label span')).map((s) => s.textContent);
    const volIdx = labels.indexOf('量');
    const promoIdx = labels.indexOf('大促档期');
    expect(volIdx).toBeGreaterThanOrEqual(0);
    expect(promoIdx).toBeGreaterThan(volIdx); // 量在大促档期左侧
    fireEvent.click(screen.getByText('量'));
    expect(onVolumeOn).toHaveBeenCalledWith(true);
  });

  it('开启后同组追加 柱|面积 Segmented；点「面积」回调 area', () => {
    const onVolumeMode = vi.fn();
    render(<ChartToolbar {...toolbarBase} volumeOn onVolumeOn={vi.fn()} volumeMode="bar" onVolumeMode={onVolumeMode} /> as ReactElement);
    expect(screen.getByText('柱')).toBeTruthy();
    expect(screen.getByText('面积')).toBeTruthy();
    fireEvent.click(screen.getByText('面积'));
    expect(onVolumeMode).toHaveBeenCalledWith('area');
  });

  it('未传量回调（量价/预测页等调用方）→ 不渲染量控件，原组框不变', () => {
    render(<ChartToolbar {...toolbarBase} /> as ReactElement);
    expect(screen.queryByText('量')).toBeNull();
    expect(screen.getByText('大促档期')).toBeTruthy();
  });
});
