// ============================================================
// 区间量尺图层（2026-11-06 Eason 拍板）：
// Chart：rangeMode + brush + onBrushChange → RangeRulerLayer（选区带/白幕/量尺/
//   极值点/时间胶囊/区间极差|区间涨跌切换/单周提示）；选区态撤全局价格标签与
//   销量三点标注；选区外单桶点击不产生选区；选区态只渲染主品+悬停带出线由
//   index 层过滤（chartSeriesForRange）。
// RangeRulerLayer：区间极差双向箭头/区间涨跌单向箭头；两层幅度框同宽同列；
//   单周提示；箭头短于框高 + 12 不画箭头。
// 量带上限：volumeBandMaxOf 细档（volumeLayer.test 已覆盖）。
// ============================================================
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { waitForGeom } from './chartTestUtils';
import Chart from '../Chart';
import { RANGE_MODE_LABEL, RULER_CHIP_H, rangeRulerTexts } from '../rangeRuler';
import type { RangeRuler } from '../rangeRuler';
import type { Series } from '../../../dataModel/types';
import { color, radius, shadow } from '../../../theme/tokens';

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

const volumes = [5200, 4800, null, 6100, 3900];

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
  volumes,
  volumeMode: 'bar' as const,
  volumeColor: '#c7000b',
  volumeHeight: 120,
  volumeOwner: { key: OWN, brand: 'HUAWEI', text: 'Mate 70 12GB' },
  nameZoneWidth: 120,
  paneLabels: true,
  rangeMode: 'extreme' as const,
};

beforeEach(() => {
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

describe('区间量尺（Chart 接线）', () => {
  it('有选区：出量尺图层（价格+销量两列量尺）、时间胶囊与读数切换', async () => {
    const { container } = render(<Chart {...baseProps} brush={[1, 3]} onBrushChange={() => {}} onRangeMode={() => {}} /> as ReactElement);
    await waitForGeom(container);
    const layer = document.querySelector('[data-testid="range-ruler"]');
    expect(layer).toBeTruthy();
    expect(document.querySelector('[data-testid="range-ruler-price"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="range-ruler-volume"]')).toBeTruthy();
    // 时间胶囊 + 两种读数方式按钮
    expect(screen.getByText('2026W21 – 2026W23')).toBeTruthy();
    expect(screen.getByRole('button', { name: RANGE_MODE_LABEL.extreme })).toBeTruthy();
    expect(screen.getByRole('button', { name: RANGE_MODE_LABEL.trend })).toBeTruthy();
    // 朗读摘要
    expect(document.querySelector('[aria-live="polite"]')?.textContent).toContain('极差率');
  });

  // 2026-11-07 Eason「极差卡片用跟产品卡片一样的风格」：幅度框容器与悬停产品卡同一套 CSS
  it('幅度框 = 悬停产品卡同款容器（白底 + hairline 描边 + 卡片圆角 + L2 投影），两行：率 / 数量', async () => {
    const { container } = render(<Chart {...baseProps} brush={[1, 3]} onBrushChange={() => {}} onRangeMode={() => {}} /> as ReactElement);
    await waitForGeom(container);
    // 产品卡容器样式参照（Chart 悬停卡同值）：经同一 CSSOM 归一化后逐项比对
    const ref = document.createElement('div');
    ref.style.background = color.canvas;
    ref.style.border = `1px solid ${color.hairline}`;
    ref.style.boxShadow = shadow.l2;
    for (const kind of ['price', 'volume'] as const) {
      const chip = document.querySelector(`[data-testid="range-ruler-chip-${kind}"]`) as HTMLElement;
      expect(chip).toBeTruthy();
      expect(chip.style.background).toBe(ref.style.background);
      expect(chip.style.border).toBe(ref.style.border);
      expect(chip.style.boxShadow).toBe(ref.style.boxShadow);
      expect(chip.style.borderRadius).toBe(`${radius.card}px`);
      expect(chip.style.height).toBe(`${RULER_CHIP_H}px`);
      // 两行：第一行率（13px / 600），第二行数量（11px）
      const [rate, amount] = Array.from(chip.children) as HTMLElement[];
      expect(rate.textContent).toContain('%');
      expect(rate.style.fontSize).toBe('13px');
      expect(rate.style.fontWeight).toBe('600');
      expect(amount.style.fontSize).toBe('11px');
    }
    expect((document.querySelector('[data-testid="range-ruler-chip-price"]') as HTMLElement).children[1].textContent).toContain('$');
    expect((document.querySelector('[data-testid="range-ruler-chip-volume"]') as HTMLElement).children[1].textContent).toContain('台');
  });

  it('只选一个桶：不出量尺，出「请选择周范围」提示', async () => {
    const { container } = render(<Chart {...baseProps} brush={[2, 2]} onBrushChange={() => {}} /> as ReactElement);
    await waitForGeom(container);
    // 极值点仍标（这一桶的价格），但不画量尺列
    expect(document.querySelector('[data-testid="range-ruler-price"]')).toBeNull();
    expect(document.querySelector('[data-testid="range-ruler-volume"]')).toBeNull();
    expect(screen.getByText('请选择周范围')).toBeTruthy();
    expect(screen.queryByRole('button', { name: RANGE_MODE_LABEL.trend })).toBeNull();
  });

  it('选区态：全局价格标签撤下（setOption 无数值标签）、销量三点标注不渲染', async () => {
    const { container } = render(<Chart {...baseProps} brush={[0, 4]} onBrushChange={() => {}} /> as ReactElement);
    await waitForGeom(container);
    expect(document.querySelector('[data-testid^="volume-mark-"]')).toBeNull();
  });

  it('无选区：悬停出「↔ 拖动选择时间段」，不出量尺', async () => {
    const { container } = render(<Chart {...baseProps} brush={null} onBrushChange={() => {}} /> as ReactElement);
    await waitForGeom(container);
    expect(document.querySelector('[data-testid="range-ruler"]')).toBeNull();
    fireEvent.mouseMove(container.firstElementChild as HTMLElement, { clientX: 300, clientY: 200 });
    await Promise.resolve();
    expect(screen.getByText('↔ 拖动选择时间段')).toBeTruthy();
  });

  it('未传 rangeMode：维持旧版选区高亮（不出量尺）', async () => {
    const { container } = render(<Chart {...baseProps} brush={[1, 3]} onBrushChange={() => {}} rangeMode={undefined} /> as ReactElement);
    await waitForGeom(container);
    expect(document.querySelector('[data-testid="range-ruler"]')).toBeNull();
  });

  it('切到区间涨跌：胶囊按钮 aria-pressed 跟随', async () => {
    const onMode = vi.fn();
    const { container } = render(<Chart {...baseProps} brush={[0, 4]} onBrushChange={() => {}} onRangeMode={onMode} /> as ReactElement);
    await waitForGeom(container);
    const trend = screen.getByRole('button', { name: RANGE_MODE_LABEL.trend });
    expect(trend.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(trend);
    expect(onMode).toHaveBeenCalledWith('trend');
  });
});

describe('图层标注（paneLabels）', () => {
  it('价格层与销量层各有一条，销量带「模拟」徽标', async () => {
    const { container } = render(<Chart {...baseProps} /> as ReactElement);
    await waitForGeom(container);
    const price = document.querySelector('[data-testid="pane-label-price"]');
    const volume = document.querySelector('[data-testid="pane-label-volume"]');
    expect(price?.textContent).toContain('价格');
    expect(price?.textContent).toContain('USD');
    expect(volume?.textContent).toContain('销量');
    expect(volume?.textContent).toContain('模拟');
  });

  it('成本数据传入：价格标注变「价格 / 成本」；浮动成本胶囊已去重删除（2026-11-10 审计）', async () => {
    const costs = [400, 400, 400, 400, 400];
    const { container } = render(<Chart {...baseProps} costs={costs} volumeColor="#c7000b" /> as ReactElement);
    await waitForGeom(container);
    expect(document.querySelector('[data-testid="pane-label-price"]')?.textContent).toContain('成本');
    // 浮动「成本·模拟」胶囊（cost-pill）删除：成本层归属 = 顶部图例行 + 价格节头 + 细线本体
    expect(document.querySelector('[data-testid="cost-pill"]')).toBeNull();
  });

  it('未传 nameZoneWidth：不出图层标注（无名称带可挂）', async () => {
    const props = { ...baseProps, nameZoneWidth: undefined };
    const { container } = render(<Chart {...props} /> as ReactElement);
    await waitForGeom(container);
    expect(document.querySelector('[data-testid="pane-label-price"]')).toBeNull();
  });
});

// 2026-11-07 稳定版三轮（Eason「标题还是不好」）：head 版式 = 标题独占行、左缘 = 图左缘；
// 价格标题在图顶行（plotTop − 刻度字半高 8 − 留白 8 − 行高 16），销量标题在量带顶下 16px，
// 位置只由版式定、不随数据；单线图不重复出销量归属药丸
describe('图层标题 head 版式（稳定版）', () => {
  const headProps = { ...baseProps, paneLabelLayout: 'head' as const };
  const topOf = (sel: string): number => parseFloat((document.querySelector(sel) as HTMLElement).style.top);
  const leftOf = (sel: string): number => parseFloat((document.querySelector(sel) as HTMLElement).style.left);

  it('价格标题在图顶行、销量标题在量带左上，两者左缘 = 图左缘（同一条竖线）', async () => {
    const { container } = render(<Chart {...headProps} /> as ReactElement);
    await waitForGeom(container);
    // gridTop 36 = plotTop → 36 − 8 − 8 − 16 = 4：标题行在顶格刻度字（plotTop − 8 起）之上留 8px
    expect(topOf('[data-testid="pane-label-price"]')).toBe(4);
    // 量带顶 = 价格绘图区底（量带悬停层 top）；标题 = 带顶 + 8（最低刻度字下探）+ 8（留白）
    const bandTop = topOf('[data-testid="volume-hover-layer"]');
    expect(topOf('[data-testid="pane-label-volume"]')).toBe(bandTop + 16);
    expect(leftOf('[data-testid="pane-label-price"]')).toBe(0);
    expect(leftOf('[data-testid="pane-label-volume"]')).toBe(0);
    // 标题字号 12px / 600 墨色（高于 10px 刻度字与 11px 名称药丸一档）
    const noun = (document.querySelector('[data-testid="pane-label-price"]') as HTMLElement).firstElementChild as HTMLElement;
    expect(noun.style.fontSize).toBe('12px');
    expect(noun.style.fontWeight).toBe('600');
  });

  it('价格标题位置不随数据漂移（pill 版式贴最高名称药丸；head 版式恒在图顶行）', async () => {
    const lowSeries: Series[] = [{ ...series[0], points: series[0].points.map((pt) => ({ ...pt, price: (pt.price ?? 0) - 600 })) }];
    const a = render(<Chart {...headProps} /> as ReactElement);
    await waitForGeom(a.container);
    const topA = topOf('[data-testid="pane-label-price"]');
    a.unmount();
    const b = render(<Chart {...headProps} series={lowSeries} /> as ReactElement);
    await waitForGeom(b.container);
    expect(topOf('[data-testid="pane-label-price"]')).toBe(topA);
  });

  it('单线图（名称带只有归属品一条）：不重复出销量归属药丸；多线图照出、贴销量标题下', async () => {
    const one = render(<Chart {...headProps} /> as ReactElement);
    await waitForGeom(one.container);
    expect(screen.queryByLabelText('销量归属：Mate 70 12GB')).toBeNull();
    one.unmount();
    const other: Series = { ...series[0], key: 'CMP__256GB', isOwn: false, brand: 'APPLE', label: 'APPLE iPhone 16 256GB', color: '#1d1d1f' };
    const multi = render(<Chart {...headProps} nameSeries={[series[0], other]} /> as ReactElement);
    await waitForGeom(multi.container);
    const pill = screen.getByLabelText('销量归属：Mate 70 12GB');
    const bandTop = topOf('[data-testid="volume-hover-layer"]');
    // 药丸中线 = 标题底（带顶 + 16 + 16）+ 6 + 半个药丸高 12
    expect(parseFloat(pill.style.top)).toBe(bandTop + 50);
  });

  it('缺省版式（pill，演进版）不变：价格标题仍在名称带列', async () => {
    const { container } = render(<Chart {...baseProps} /> as ReactElement);
    await waitForGeom(container);
    // gridLeft 60 − nameZoneWidth 120 + 4 → 钳到 2（名称带列左缘），不是 head 的 0
    expect(leftOf('[data-testid="pane-label-price"]')).toBe(2);
  });
});

describe('悬停卡成本脚行', () => {
  it('悬停有成本的列：主卡多一行「当月成本 模拟 N」', async () => {
    const costs = [400, 400, 400, 400, 400];
    const { container } = render(<Chart {...baseProps} costs={costs} volumeColor="#c7000b" /> as ReactElement);
    await waitForGeom(container);
    const wrap = container.firstElementChild as HTMLElement;
    fireEvent.mouseMove(wrap, { clientX: 300, clientY: 200 });
    await Promise.resolve();
    expect(document.querySelector('[data-testid="tip-cost-row"]')?.textContent).toContain('当月成本');
  });

  it('成本细线去平滑（2026-11-10 审计修）：path 只含 M/L 直线段，不画「下滑回升」曲线叙事', async () => {
    const costs = [400, 500, 480, 520, 460];
    const { container } = render(<Chart {...baseProps} costs={costs} volumeColor="#c7000b" /> as ReactElement);
    await waitForGeom(container);
    const path = document.querySelector('[data-testid="cost-line"] path');
    expect(path).toBeTruthy();
    const d = path?.getAttribute('d') ?? '';
    expect(d).not.toContain('C'); // 无贝塞尔段（此前复用面积平滑曲线）
    expect(d).toContain('L'); // 逐桶直线连接
  });
});

describe('品牌进名称带与悬停卡（2026-11-07 Eason 采纳 A）', () => {
  it('名称带药丸点击 = 隐藏 / 恢复（onToggleHidden 接线；hiddenKeys 虚线态）', async () => {
    const onToggle = vi.fn();
    const hiddenKeys = new Set<string>();
    const { container } = render(
      <Chart
        series={series}
        granularity='week'
        currency='usd'
        priceTypes={{ discounted: true, rrp: false }}
        gridLeft={60}
        gridTop={36}
        tipMode='wow'
        nameZoneWidth={120}
        hiddenKeys={hiddenKeys}
        nameSeries={series}
        onToggleHidden={onToggle}
      /> as ReactElement,
    );
    await waitForGeom(container);
    const pillButton = [...container.querySelectorAll('button[title="点击隐藏该产品"]')][0] as HTMLButtonElement;
    fireEvent.click(pillButton);
    expect(onToggle).toHaveBeenCalledWith(OWN);
  });

  it('名称带药丸：默认只写型号；悬停 / 聚焦在药丸上方出加粗品牌行（不并入文字）', async () => {
    const { container } = render(<Chart {...baseProps} /> as ReactElement);
    await waitForGeom(container);
    const pillButton = [...container.querySelectorAll('button[title="点击隐藏该产品"]')][0] as HTMLButtonElement;
    const textSpan = pillButton.querySelector('[data-testid="name-pill-text"]') as HTMLSpanElement;
    expect(textSpan.textContent).toBe('Mate 70 12');
    // 品牌行默认不渲染
    expect(container.querySelector('.lpl-brand-row')).toBeNull();
    // 悬停 → 药丸上方出品牌行（加粗、文字 = 品牌名）
    fireEvent.mouseEnter(pillButton);
    const row = container.querySelector('.lpl-brand-row') as HTMLElement;
    expect(row).not.toBeNull();
    expect(row.textContent).toBe('Huawei');
    expect(row.style.fontWeight).toBe('700');
    // 文字保持纯型号（不再并入品牌）
    expect(textSpan.textContent).toBe('Mate 70 12');
    fireEvent.mouseLeave(pillButton);
    expect(container.querySelector('.lpl-brand-row')).toBeNull();
    // 键盘聚焦同样展开
    fireEvent.focus(pillButton);
    expect(container.querySelector('.lpl-brand-row')).not.toBeNull();
  });

  it('悬停明细行产品名前加品牌（Huawei Mate 70 12GB）', async () => {
    // 素图（无量层 / 无名称带 / 无选区）：与 marginMiniCard 同一悬停配方
    const { container } = render(
      <Chart
        series={series}
        granularity='week'
        currency='usd'
        priceTypes={{ discounted: true, rrp: false }}
        gridLeft={60}
        gridTop={36}
        tipMode='wow'
      /> as ReactElement,
    );
    await waitForGeom(container);
    const plotLeft = 60;
    const colW = (900 - 60 - 24) / 5;
    const wrap = container.firstElementChild as HTMLElement;
    fireEvent.mouseMove(wrap, { clientX: plotLeft + colW * 1.5, clientY: 200 });
    await Promise.resolve();
    const nameCell = container.querySelector('span[title="Huawei Mate 70 12"]');
    expect(nameCell).not.toBeNull();
    expect(nameCell?.textContent).toBe('Huawei Mate 70 12');
  });
});

describe('幅度框文案（RANGE_MODE_LABEL / rangeRulerTexts 快照锚点）', () => {
  it('区间极差第一行率第二行金额', () => {
    const r: RangeRuler = { state: 'ok', a: { index: 0, value: 678 }, b: { index: 1, value: 525 }, dir: 0, delta: 153, rate: 29.1 };
    expect(rangeRulerTexts(r, { kind: 'price', formatPrice: (v) => `$${v}`, unitNoun: '周' })).toEqual({ primary: '29.1%', secondary: '$153' });
  });
});
