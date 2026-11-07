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
import { lastSetOption } from './echartsStub';
import { buildVolumeMarks, VOL_MARK_H, volumeBarHeightOf } from '../chartModel';
import Chart, { tipGroupPlacement } from '../Chart';
import ChartToolbar from '../ChartToolbar';
import { niceCeil } from '../../../dataModel/volume';
import { volumeBandMaxOf } from '../rangeRuler';
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

  it('右轴三档刻度随量层缩放（vMax=volumeBandMaxOf(max) 细档取整、vMax/2、0），仅量层开启出现', async () => {
    // 2026-11-06 Eason 拍板「收紧」：量带上限改细档取整（原 niceCeil 会把 4,582 取到 10,000）
    const vMax = volumeBandMaxOf(Math.max(...VOLUMES.filter((v): v is number => v != null)));
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

  it('面积模式：平滑曲线 + 纵向渐变填充（无描边线），不出柱 rect', async () => {
    const { container } = render(<Chart {...baseProps} volumeOn volumeMode="area" volumes={VOLUMES} volumeHeight={120} /> as ReactElement);
    await waitForGeom(container);
    expect(container.querySelectorAll('svg rect').length).toBe(0);
    const path = container.querySelector('svg path');
    expect(path).toBeTruthy();
    // 无边界描边线：stroke = none
    expect(path!.getAttribute('stroke')).toBe('none');
    // 渐变填充（2026-11-05 Eason：从下往上渐变色）= url(#id)，且 defs 里有两档 stop
    const fill = path!.getAttribute('fill') ?? '';
    expect(fill).toMatch(/^url\(#.+\)$/);
    const gradId = fill.slice(5, -1);
    const grad = container.querySelector(`linearGradient[id="${gradId}"]`);
    expect(grad).toBeTruthy();
    const stops = grad!.querySelectorAll('stop');
    expect(stops.length).toBe(2);
    // 2026-11-05 复检五件套①：再淡 50%（0.34/0.04 → 0.17/0.02）
    expect(stops[0].getAttribute('stop-color')).toMatch(/, 0\.17\)$/);
    expect(stops[1].getAttribute('stop-color')).toMatch(/, 0\.02\)$/);
    // 路径语法良构（含平滑 C 段）：按命令收敛坐标数（M/L=2、C=6、Z=0）
    // ——旧实现拼出「M x y volBase L …」奇数序列，M 吞掉后续 x 当配对值整条画出界
    const d = path!.getAttribute('d') ?? '';
    expect(d).not.toBe('');
    expect(d).toContain('C'); // 平滑（2026-11-05 Eason）
    const arity: Record<string, number> = { M: 2, L: 2, C: 6, Z: 0 };
    const segs = d.match(/[MLCZ][^MLCZ]*/g) ?? [];
    expect(segs.length).toBeGreaterThan(0);
    for (const seg of segs) {
      const cmd = seg[0];
      const nums = seg.slice(1).trim().split(/[\s,]+/).filter(Boolean).map(Number);
      expect(nums.length).toBe(arity[cmd]);
      expect(nums.every((n) => Number.isFinite(n))).toBe(true);
    }
    // 起点落基线、闭合回基线（面积底边完整）
    expect(d.trim().startsWith('M')).toBe(true);
    expect(d.trim().endsWith('Z')).toBe(true);
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

// ---------------- 2026-11-05 复检五件套 ----------------
describe('量层五件套（归属药丸 / 悬停小卡 / 三点标注 / 联动高亮）', () => {
  const COMP = 'COMP__12GB';
  const mkPts = (prices: number[]) =>
    prices.map((p, i) => ({
      bucketId: `2026${20 + i}`,
      xLabel: `06-0${i + 1}`,
      anchorDate: '2026-06-01',
      rrp: p + 100,
      price: p,
      missing: false,
      offer: null,
      url: '',
      shopName: null,
    }));
  const twoSeries: Series[] = [
    { ...series[0], points: mkPts([1000, 990, 980, 970, 960]) },
    { ...series[0], key: COMP, isOwn: false, brand: 'APPLE', label: 'APPLE iPhone 17 128GB', color: '#1d1d1f', points: mkPts([1100, 1080, 1060, 1040, 1020]) },
  ];
  const OWNER = { key: OWN, brand: 'HUAWEI', text: 'Mate 70 12' };
  const GRID_LEFT = 200;
  const ZONE_W = 188;
  const BAND_H = 120;
  const DISTINCT: (number | null)[] = [5200, 3000, null, 6100, 4000]; // 最高 idx3 / 最低 idx1 / 最新 idx4
  const props = {
    ...baseProps,
    series: twoSeries,
    gridLeft: GRID_LEFT,
    nameZoneWidth: ZONE_W,
    volumeOn: true,
    volumes: DISTINCT,
    volumeHeight: BAND_H,
    volumeColor: '#c7000b',
    volumeOwner: OWNER,
  };
  const plotWidth = 900 - GRID_LEFT - 56;
  const colX = (i: number): number => GRID_LEFT + (plotWidth / 5) * (i + 0.5);
  const layerOf = (c: HTMLElement): HTMLElement => c.querySelector('[data-testid="volume-hover-layer"]') as HTMLElement;
  const px = (v: string): number => Number(v.replace('px', ''));
  /** 喂给 ECharts 的各系列折线 opacity（按 color 区分我司/对比；仅看主价线 z=12） */
  const lineOpacity = (lineColor: string): number | undefined => {
    const opt = lastSetOption() as { series: { z?: number; lineStyle?: { color?: string; opacity?: number } }[] };
    return opt.series.find((x) => x.z === 12 && x.lineStyle?.color === lineColor)?.lineStyle?.opacity;
  };

  it('②归属药丸：量带左缘（绘图区外、名称带同列）显示主品名；无量数据 / 关量层不渲染', async () => {
    const { container } = render(<Chart {...props} /> as ReactElement);
    await waitForGeom(container);
    const pill = screen.getByLabelText('销量归属：Mate 70 12');
    expect(pill.textContent).toContain('Mate 70 12');
    const layer = layerOf(container);
    expect(px(pill.style.left)).toBe(GRID_LEFT - ZONE_W + 4); // 与名称带药丸同一 x
    // 量带内垂直居中（定位锚 = 量带中线，不依赖药丸高）
    expect(px(pill.style.top)).toBe(px(layer.style.top) + BAND_H / 2);
    expect(pill.style.transform).toBe('translateY(-50%)');
    // 规格与名称带药丸一致：内边距 / 圆角 / 文字；不截断（无 maxWidth / 省略号，长度随内容）
    const namePill = screen.getByRole('button', { name: 'Mate 70 12' });
    expect(pill.style.padding).toBe(namePill.style.padding);
    expect(pill.style.borderRadius).toBe(namePill.style.borderRadius);
    expect(pill.style.gap).toBe(namePill.style.gap);
    const text = pill.querySelector('span:last-child') as HTMLElement;
    const nameText = namePill.querySelector('span:last-child') as HTMLElement;
    expect(text.style.fontSize).toBe('11px');
    expect(text.style.fontSize).toBe(nameText.style.fontSize);
    expect(text.style.lineHeight).toBe(nameText.style.lineHeight);
    expect(text.style.whiteSpace).toBe('nowrap');
    expect(pill.style.maxWidth).toBe('');
    expect(text.style.textOverflow).toBe('');
    expect(text.style.overflow).toBe('');
    cleanup();
    const { container: c2 } = render(<Chart {...props} volumes={[null, null, null, null, null]} /> as ReactElement);
    await waitForGeom(c2);
    expect(screen.queryByLabelText(/销量归属/)).toBeNull();
    expect(layerOf(c2)).toBeNull();
    cleanup();
    const { container: c3 } = render(<Chart {...props} volumeOn={false} /> as ReactElement);
    await waitForGeom(c3);
    expect(screen.queryByLabelText(/销量归属/)).toBeNull();
  });

  it('③悬停量带：捕获层只占量带；出单行「销量 N 台」（无日期、无产品行）+ 该桶竖线；离开恢复', async () => {
    const { container } = render(<Chart {...props} /> as ReactElement);
    await waitForGeom(container);
    const layer = layerOf(container);
    // 只占量带：高度 = 量带高，顶 = 价格绘图区底缘（36 + plotHeight），不覆盖价格区
    expect(px(layer.style.height)).toBe(BAND_H);
    expect(px(layer.style.top)).toBeGreaterThan(baseProps.gridTop);
    expect(screen.queryByTestId('volume-hover-card')).toBeNull();
    fireEvent.mouseMove(layer, { clientX: colX(3), clientY: px(layer.style.top) + 10 });
    const card = screen.getByTestId('volume-hover-card');
    expect(card.textContent).toBe('销量 6,100 台');
    expect(px(card.style.height)).toBe(30); // 与销毛卡同高（单行语言）
    const rule = screen.getByTestId('volume-hover-rule');
    expect(px(rule.style.height)).toBe(BAND_H);
    expect(Math.abs(px(rule.style.left) - colX(3))).toBeLessThanOrEqual(1);
    // 缺量桶：明说无值，不造 0
    fireEvent.mouseMove(layer, { clientX: colX(2), clientY: px(layer.style.top) + 10 });
    expect(screen.getByTestId('volume-hover-card').textContent).toBe('销量 —');
    fireEvent.mouseLeave(layer);
    expect(screen.queryByTestId('volume-hover-card')).toBeNull();
    expect(screen.queryByTestId('volume-hover-rule')).toBeNull();
  });

  it('③悬停价格区不触发量值小卡（不劫持价格悬停）；价格浮层照常', async () => {
    const { container } = render(<Chart {...props} /> as ReactElement);
    await waitForGeom(container);
    fireEvent.mouseMove(container.firstElementChild as Element, { clientX: colX(1), clientY: 120 });
    expect(screen.queryByTestId('volume-hover-card')).toBeNull();
    expect(screen.getByText('周环比')).toBeTruthy();
    expect(lineOpacity('#1d1d1f')).toBeUndefined(); // 价格区悬停不触发量带联动降淡
  });

  it('④三点标注：柱|面积两模式都标，随量开关出现/消失，无量数据不标', async () => {
    for (const mode of ['bar', 'area'] as const) {
      const { container } = render(<Chart {...props} volumeMode={mode} /> as ReactElement);
      await waitForGeom(container);
      expect(screen.getByTestId('volume-mark-max').textContent).toBe('6,100');
      expect(screen.getByTestId('volume-mark-min').textContent).toBe('3,000');
      expect(screen.getByTestId('volume-mark-latest').textContent).toBe('4,000');
      // 去框：纯数字文本（品牌色 / 10px / 等宽数字），无底色无边框
      for (const kind of ['max', 'min', 'latest']) {
        const mark = screen.getByTestId(`volume-mark-${kind}`);
        expect(mark.style.fontSize).toBe('10px');
        expect(mark.style.fontVariantNumeric).toBe('tabular-nums');
        expect(mark.style.color).toBe('rgb(199, 0, 11)');
        expect(mark.style.background).toBe('');
        expect(mark.style.border).toBe('');
        expect(mark.style.borderRadius).toBe('');
      }
      cleanup();
    }
    const { container: off } = render(<Chart {...props} volumeOn={false} /> as ReactElement);
    await waitForGeom(off);
    expect(screen.queryByTestId('volume-mark-max')).toBeNull();
    cleanup();
    const { container: empty } = render(<Chart {...props} volumes={[null, null, null, null, null]} /> as ReactElement);
    await waitForGeom(empty);
    expect(screen.queryByTestId('volume-mark-max')).toBeNull();
  });

  it('④标注位置与避让（buildVolumeMarks）：最高在上/最低在下/最新看来向，同桶只一枚，不出带不越右缘不互压', () => {
    const base = { vMax: niceCeil(6100), plotLeft: 100, plotWidth: 500, n: 5, bandTop: 400, bandH: 120 };
    const marks = buildVolumeMarks({ ...base, values: DISTINCT });
    const of = (k: string) => marks.find((m) => m.kind === k)!;
    const pointY = (v: number): number => base.bandTop + base.bandH - volumeBarHeightOf(v, base.vMax, base.bandH);
    expect(of('max').y + VOL_MARK_H).toBeLessThanOrEqual(pointY(6100));
    expect(of('min').y).toBeGreaterThanOrEqual(pointY(3000));
    expect(of('latest').y).toBeGreaterThanOrEqual(pointY(4000)); // 4000 < 前值 6100 → 回落标下方
    // 来向反过来：最新较前值上升 → 标上方
    const rising = buildVolumeMarks({ ...base, values: [5200, 3000, 3500, 4000, 4500] }).find((m) => m.idx === 4)!;
    expect(rising.kind).toBe('latest');
    expect(rising.y + VOL_MARK_H).toBeLessThanOrEqual(pointY(4500));
    // 同桶身兼最低+最新 → 只一枚
    const merged = buildVolumeMarks({ ...base, values: [5200, 4800, null, 6100, 3900] });
    expect(merged.map((m) => m.text)).toEqual(['6,100', '3,900']);
    // 只一个有值桶 → 一枚；全空 → 不标
    expect(buildVolumeMarks({ ...base, values: [null, 2000, null, null, null] }).length).toBe(1);
    expect(buildVolumeMarks({ ...base, values: [null, null, null, null, null] })).toEqual([]);
    // 窄带 + 相邻近值：盒互不相交、不出带、不越右缘
    const tight = { ...base, plotWidth: 90, n: 5, bandH: 70 };
    const crowded = buildVolumeMarks({ ...tight, values: [6000, 6100, 5900, 6050, 5950] });
    expect(crowded.length).toBe(3);
    for (const m of crowded) {
      expect(m.y).toBeGreaterThanOrEqual(tight.bandTop);
      expect(m.y + m.h).toBeLessThanOrEqual(tight.bandTop + tight.bandH);
      expect(m.x + m.w).toBeLessThanOrEqual(tight.plotLeft + tight.plotWidth);
      expect(m.x).toBeGreaterThanOrEqual(tight.plotLeft);
    }
    for (const a of crowded) {
      for (const b of crowded) {
        if (a.idx >= b.idx) continue;
        const xHit = a.x < b.x + b.w && b.x < a.x + a.w;
        const yHit = a.y < b.y + b.h && b.y < a.y + a.h;
        expect(xHit && yHit).toBe(false);
      }
    }
  });

  it('⑤悬停量带：只留主品线，对比品线在 ECharts option 里真实降淡；离开恢复', async () => {
    const { container } = render(<Chart {...props} /> as ReactElement);
    await waitForGeom(container);
    expect(lineOpacity('#1d1d1f')).toBeUndefined();
    const layer = layerOf(container);
    fireEvent.mouseMove(layer, { clientX: colX(1), clientY: px(layer.style.top) + 10 });
    expect(lineOpacity('#1d1d1f')).toBe(0.15);
    expect(lineOpacity('#c7000b')).toBeUndefined();
    // 名称引线只属于悬停名称药丸：量带联动不从名称带拉长线横穿绘图区
    expect(container.querySelectorAll('svg line').length).toBe(0);
    fireEvent.mouseLeave(layer);
    expect(lineOpacity('#1d1d1f')).toBeUndefined();
  });

  it('②⑤悬停药丸同通道：高亮主品线但不出量值小卡；键盘聚焦等价', async () => {
    const { container } = render(<Chart {...props} /> as ReactElement);
    await waitForGeom(container);
    const pill = screen.getByLabelText('销量归属：Mate 70 12');
    fireEvent.mouseEnter(pill);
    expect(lineOpacity('#1d1d1f')).toBe(0.15);
    expect(screen.queryByTestId('volume-hover-card')).toBeNull();
    fireEvent.mouseLeave(pill);
    expect(lineOpacity('#1d1d1f')).toBeUndefined();
    fireEvent.focus(pill);
    expect(lineOpacity('#1d1d1f')).toBe(0.15);
    fireEvent.blur(pill);
    expect(lineOpacity('#1d1d1f')).toBeUndefined();
  });

  it('⑤悬停中关闭量层：捕获层卸载不触发 mouseleave，高亮自愈，不残留降淡', async () => {
    const { container, rerender } = render(<Chart {...props} /> as ReactElement);
    await waitForGeom(container);
    const layer = layerOf(container);
    fireEvent.mouseMove(layer, { clientX: colX(1), clientY: px(layer.style.top) + 10 });
    expect(lineOpacity('#1d1d1f')).toBe(0.15);
    rerender(<Chart {...props} volumeOn={false} /> as ReactElement);
    expect(lineOpacity('#1d1d1f')).toBeUndefined();
    expect(screen.queryByTestId('volume-hover-card')).toBeNull();
  });

  it('悬停量带时不在价格区与量带交界画横虚线（「中间无分界线」）', async () => {
    const onY = vi.fn();
    const { container } = render(<Chart {...props} onCrosshairYMove={onY} /> as ReactElement);
    await waitForGeom(container);
    const layer = layerOf(container);
    fireEvent.mouseMove(layer, { clientX: colX(1), clientY: px(layer.style.top) + 10 });
    expect(onY).toHaveBeenLastCalledWith(null);
    // 回到价格区：纵向位置照常上报（价格悬停逻辑未受影响）
    fireEvent.mouseMove(container.firstElementChild as Element, { clientX: colX(1), clientY: 120 });
    expect(onY).toHaveBeenLastCalledWith(120);
  });

  it('三卡同组定位（tipGroupPlacement）：主卡定侧，贴线边 = 卡在右取主卡左缘 / 卡在左取主卡右缘', () => {
    const right = tipGroupPlacement(100, 800, 300, 400);
    expect(right).toEqual({ mainLeft: 316, side: 'right', edgeX: 316 });
    const left = tipGroupPlacement(100, 800, 800, 400);
    expect(left).toEqual({ mainLeft: 384, side: 'left', edgeX: 784 }); // 右缘 = 触发线 − 16
    // 左翻越绘图区左缘被钳回：贴线边跟主卡实际位置走，三卡不脱节
    const clamped = tipGroupPlacement(100, 300, 300, 280);
    expect(clamped).toEqual({ mainLeft: 108, side: 'left', edgeX: 388 });
  });

  const cardEls = (container: HTMLElement) => {
    const zIndexed = (el: Element): HTMLElement => el.closest('div[style*="z-index"]') as HTMLElement;
    return {
      main: zIndexed(screen.getByText('周环比')),
      margin: zIndexed(screen.getByText('销毛率')),
      volume: container.querySelector('[data-testid="volume-hover-card"]') as HTMLElement,
    };
  };
  const margins = DISTINCT.map(() => ({ bucketId: '2026-06', monthId: '2026-06', unitRevenue: 900, unitCost: 600, unitMargin: 300, marginRate: 0.32, simulated: true as const }));

  it('三卡同侧：主卡在右 = 销毛卡 / 销量卡左缘与主卡左缘对齐一线', async () => {
    const { container } = render(<Chart {...props} margins={margins} /> as ReactElement);
    await waitForGeom(container);
    const layer = layerOf(container);
    fireEvent.mouseMove(layer, { clientX: colX(1), clientY: px(layer.style.top) + 10 });
    const { main, margin, volume } = cardEls(container);
    expect(px(main.style.left)).toBeCloseTo(colX(1) + 16, 5);
    expect(px(margin.style.left)).toBe(px(main.style.left));
    expect(px(volume.style.left)).toBe(px(main.style.left));
    expect(margin.style.transform).toBe('');
    expect(volume.style.transform).toBe('');
  });

  it('三卡同翻：主卡翻到左侧 = 销毛卡 / 销量卡一起翻，右缘与主卡右缘对齐一线；垂直位置不变', async () => {
    const { container } = render(<Chart {...props} margins={margins} /> as ReactElement);
    await waitForGeom(container);
    const layer = layerOf(container);
    fireEvent.mouseMove(layer, { clientX: colX(4), clientY: px(layer.style.top) + 10 });
    const { main, margin, volume } = cardEls(container);
    // 主卡 content-box：外框右缘 = left + 内容宽 + 左右内边距 + 左右描边（真机按外框贴线）
    const outerW = px(main.style.width) + px(main.style.paddingLeft) + px(main.style.paddingRight)
      + px(main.style.borderLeftWidth) + px(main.style.borderRightWidth);
    expect(outerW).toBe(px(main.style.width) + 22);
    const mainRight = px(main.style.left) + outerW;
    expect(mainRight).toBeCloseTo(colX(4) - 16, 5); // 外框不越过触发线（留 16px）
    expect(px(margin.style.left)).toBeCloseTo(mainRight, 5);
    expect(px(volume.style.left)).toBeCloseTo(mainRight, 5);
    expect(margin.style.transform).toBe('translateX(-100%)');
    expect(volume.style.transform).toBe('translateX(-100%)');
    // 垂直：销毛卡贴主卡上方 8px，销量卡贴量带顶
    expect(px(main.style.top) - px(margin.style.top) - px(margin.style.height)).toBe(8);
    expect(px(volume.style.top)).toBe(px(layer.style.top) + 4);
  });

  it('该列无价（主卡不在场）：销量卡自己定侧，照常显示', async () => {
    const gap = twoSeries.map((s) => ({ ...s, points: s.points.map((pt, i) => (i === 1 ? { ...pt, price: null, rrp: null, missing: true } : pt)) }));
    const { container } = render(<Chart {...props} series={gap} /> as ReactElement);
    await waitForGeom(container);
    const layer = layerOf(container);
    fireEvent.mouseMove(layer, { clientX: colX(1), clientY: px(layer.style.top) + 10 });
    expect(screen.queryByText('周环比')).toBeNull();
    const card = screen.getByTestId('volume-hover-card');
    expect(card.textContent).toBe('销量 3,000 台');
    expect(px(card.style.left)).toBeCloseTo(colX(1) + 16, 5);
  });
});
