// ============================================================
// §6.2/§6.3/§6.4 图主体：ECharts canvas + DOM 覆盖层。
// - 折后价：monotone 平滑实线品牌色（我司 3px / 竞品 2px），白底圆环圈点 r≈3.5
// - RRP：虚线 6/4 + step 阶梯（平段+调价点垂直跳变，不平滑），同色 75% 不透明度
// - 缺采：跨接段虚线 + 空心圆点，曲线自然跨接不中断（桥接系列 + 插值散点）
// - 价格标签：自适应避让（helpers.resolveCollisions 两遍式）——
//   P0 必放 = 每系列首/末有值点 + 窗口最大/最小；P1 = 变价点（周）/全部点（月/季），冲突即隐藏；
//   dy map 同时是可见集，长窗口宁缺不叠
// - 系列名：第一个有值点左侧（垂直居中；左缘放不下 → 点上方），品牌色 13px/600，
//   DOM 层 zIndex 9 置于所有图层之上
// - X 刻度：周=周三 MM-DD；月/季=mono 技术标记；点位置=桶中点
// - 轴单位：Y 轴顶端=币种（₽/$）、X 轴右端下方=粒度（周/月/季），caption mute（用户反馈 #5）
// - 悬停：十字竖线（DOM）+ 钉顶附框 + 周视图跳转图标 + offer 图标；ECharts tooltip 禁用
// - 点击：月/季圈点（±12px 命中）触发下钻；周视图无下钻
// ============================================================
import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react';
import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';
import type { CurrencyMode, Granularity, OfferInfo, Series, SeriesPoint } from '../../dataModel/types';
import { color, font, fontSize } from '../../theme/tokens';
import {
  GRID,
  computeYAxis,
  estGridLeft,
  fmtInt,
  gapRuns,
  gridTopFor,
  hollowPoints,
  resolveCollisions,
  weekLabeledIdx,
  xPxOf,
  yPxOf,
  type AvoidItem,
  type Geom,
  type YConfig,
} from './helpers';
import PinnedTooltips from './PinnedTooltips';
import JumpIcon from './JumpIcon';
import OfferPopover from './OfferPopover';
import BrandDot from '../../components/BrandMark';

export interface ChartProps {
  series: Series[];
  granularity: Granularity;
  currency: CurrencyMode;
  priceTypes: { discounted: boolean; rrp: boolean };
  height: number;
  /** Y 轴配置；null/缺省 → 内部自动适配（±8%，用于弹窗迷你图） */
  y?: YConfig | null;
  /** Y 轴左边距；缺省按最长刻度估算 */
  gridLeft?: number;
  /** 图顶卡片区预留高；缺省按 series 数量推（gridTopFor） */
  gridTop?: number;
  /** 钉顶卡片数据（=全部勾选系列，含图例取消选中的）；缺省用 series */
  legendSeries?: Series[];
  /** 图例未选中的系列 key（折线已隐藏，卡片浅色） */
  hiddenKeys?: Set<string>;
  /** 图例点击回调（缺省=卡片不可点，弹窗迷你图用） */
  onToggleLegend?: (key: string) => void;
  enableDrill?: boolean; // 月/季视图圈点下钻
  enableJump?: boolean; // 周视图悬停跳转
  enableOffer?: boolean; // 周视图 offer 图标
  onDrill?: (seriesKey: string, bucketId: string) => void;
  emptyHint?: string;
  /** 窗口标识（起止下标）；变化 = 重采样换列，锁定列下标失义 → 复位 */
  windowKey?: string;
}

const HIT_PX = 12; // 圈点点击/悬停命中半径
const LABEL_DISTANCE = 4;
const LABEL_LINE_HEIGHT = 20;
const NAME_FONT_SIZE = 13;
const NAME_LINE_HEIGHT = 18;
const NAME_LOGO_W = 12; // 系列名前置品牌色小点（8px）+ 间距 4，避让宽度估算用
const NO_KEYS = new Set<string>(); // hiddenKeys 缺省值

export default function Chart(props: ChartProps) {
  const { series, granularity, currency, priceTypes, height } = props;
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const chartDivRef = useRef<HTMLDivElement | null>(null); // ECharts 挂载层（背景带之下、DOM 覆盖层之下）
  const chartRef = useRef<echarts.ECharts | null>(null);
  const [width, setWidth] = useState(0);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [lockedIdx, setLockedIdx] = useState<number | null>(null); // 点击锁定的时间列（跨悬停常驻）

  // 图顶卡片区预留：缺省按 series 数量推（弹窗迷你图）
  const gridTop = props.gridTop ?? gridTopFor(Math.max(props.series.length, 1));

  // 粒度切换 → 桶列表变化，锁定列下标失义 → 复位
  useEffect(() => {
    setLockedIdx(null);
  }, [granularity]);

  // 窗口平移/缩放（XBrush 拖柄/箭头）→ 同下标已指向不同时间桶，锁定列复位
  useEffect(() => {
    setLockedIdx(null);
  }, [props.windowKey]);

  // 主价线：折后价优先；仅勾 RRP 时 RRP 成为主价线（标签/下钻/跳转跟随）
  const primaryOf = (p: SeriesPoint): number | null => (priceTypes.discounted ? p.price : p.rrp);

  // ---- 容器宽度（ResizeObserver） ----
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const en of entries) setWidth(en.contentRect.width);
    });
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // ---- ECharts 实例 ----
  useEffect(() => {
    const el = chartDivRef.current;
    if (!el) return;
    const chart = echarts.init(el, null, { renderer: 'canvas' });
    chartRef.current = chart;
    return () => {
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  // ---- 几何（纯公式复现 grid，保证 DOM 层与 canvas 一致） ----
  const geom: Geom | null = useMemo(() => {
    const n = series[0]?.points.length ?? 0;
    if (!width || width < 160 || n === 0 || height < 160) return null;
    const yCfg =
      props.y ??
      computeYAxis({
        series,
        priceTypes,
        tierRange: null,
        manual: null,
        sliderScale: 1,
      });
    const gl = props.gridLeft ?? estGridLeft(yCfg.max);
    if (gl + GRID.right > width - 48) return null;
    return {
      gridLeft: gl,
      plotLeft: gl,
      plotTop: gridTop,
      plotWidth: width - gl - GRID.right,
      plotHeight: height - gridTop - GRID.bottom,
      min: yCfg.min,
      max: yCfg.max,
      interval: yCfg.interval,
      n,
    };
  }, [width, height, gridTop, series, priceTypes, props.y, props.gridLeft]);

  // ---- 标签避让计划（价格标签 dy + 系列名位置 + 可见集） ----
  // 自适应规则（长窗口数值防叠）：
  // P0 必放 = 每系列首个/末个有值点 + 窗口内最大/最小（形状锚点，冲突时纵向推挤）；
  // P1 候选 = 变价点（周）/ 全部点（月/季），期望位无冲突才显示，冲突即隐藏；
  // 系列名 = 第一个有值点左侧（垂直居中于该点）；绘图区左缘放不下 → 点上方（首点必有值）。
  const labelPlan = useMemo(() => {
    const empty = { dy: {} as Record<string, Record<number, number>>, names: [] as AvoidResultNames[] };
    if (!geom) return empty;
    const items: AvoidItem[] = [];
    const nameW = (t: string): number => NAME_LOGO_W + t.length * (NAME_FONT_SIZE * 0.62) + 6;
    const priceW = (t: string): number => t.length * (fontSize.bodySm * 0.62) + 8;
    for (const s of series) {
      const pts = s.points;
      const valIdx: number[] = [];
      pts.forEach((p, i) => {
        if (primaryOf(p) != null) valIdx.push(i);
      });
      if (valIdx.length === 0) continue;
      let maxI = valIdx[0];
      let minI = valIdx[0];
      for (const i of valIdx) {
        if ((primaryOf(pts[i]) ?? 0) > (primaryOf(pts[maxI]) ?? 0)) maxI = i;
        if ((primaryOf(pts[i]) ?? 0) < (primaryOf(pts[minI]) ?? 0)) minI = i;
      }
      const p0 = new Set<number>([valIdx[0], valIdx[valIdx.length - 1], maxI, minI]);
      const change = granularity === 'week' ? weekLabeledIdx(pts, !priceTypes.discounted) : new Set<number>(valIdx);
      const pushPrice = (i: number, pinned: boolean): void => {
        const v = primaryOf(pts[i]);
        if (v == null) return;
        const text = fmtInt(v);
        const cx = xPxOf(geom, i);
        const w = priceW(text);
        items.push({
          kind: 'price',
          seriesKey: s.key,
          pointIdx: i,
          pinned,
          left: cx - w / 2,
          right: cx + w / 2,
          top: yPxOf(geom, v) - LABEL_DISTANCE - LABEL_LINE_HEIGHT,
          h: LABEL_LINE_HEIGHT,
          text,
          color: color.ink,
        });
      };
      p0.forEach((i) => pushPrice(i, true));
      valIdx.forEach((i) => {
        if (!p0.has(i) && change.has(i)) pushPrice(i, false);
      });
      // 系列名：第一个有值点左侧（垂直居中于该点）；左缘放不下 → 点上方堆叠
      const fi = valIdx[0];
      const v0 = primaryOf(pts[fi]) ?? 0;
      const px = xPxOf(geom, fi);
      const py = yPxOf(geom, v0);
      const nw = nameW(s.label);
      const leftAt = px - 8 - nw;
      const above = leftAt < geom.plotLeft + 2;
      items.push({
        kind: 'name',
        seriesKey: s.key,
        pointIdx: fi,
        pinned: true,
        left: above ? px - 4 : leftAt,
        right: above ? px - 4 + nw : px - 8,
        top: above ? py - LABEL_DISTANCE - LABEL_LINE_HEIGHT - NAME_LINE_HEIGHT : py - NAME_LINE_HEIGHT / 2,
        h: NAME_LINE_HEIGHT,
        text: s.label,
        color: s.color,
      });
    }
    const res = resolveCollisions(items, geom.plotTop);
    return { dy: res.dy, names: res.names as AvoidResultNames[] };
  }, [geom, series, granularity, priceTypes, props.priceTypes.discounted]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- ECharts option ----
  const option = useMemo<EChartsOption | null>(() => {
    if (!geom) return null;
    const first = series[0];
    if (!first) return null;
    const xLabels = first.points.map((p) => p.xLabel);
    const monthLike = granularity !== 'week';
    const lineWidth = (s: Series): number => (s.isOwn ? 3 : 2);
    const sArr: Record<string, unknown>[] = [];

    for (const s of series) {
      const dyMap = labelPlan.dy[s.key] ?? {};
      if (priceTypes.discounted) {
        const data = s.points.map((p, i) => ({
          value: p.price,
          label: {
            show: p.price != null && dyMap[i] !== undefined,
            position: 'top' as const,
            distance: LABEL_DISTANCE,
            offset: [0, dyMap[i] ?? 0],
            color: color.ink,
            fontSize: fontSize.bodySm,
            fontWeight: 400,
            fontFamily: font.family,
            lineHeight: LABEL_LINE_HEIGHT,
            formatter: p.price != null ? fmtInt(p.price) : '',
          },
        }));
        sArr.push({
          type: 'line',
          data,
          smooth: true,
          smoothMonotone: 'x',
          connectNulls: false,
          symbol: 'circle',
          symbolSize: 7,
          itemStyle: { color: color.canvas, borderColor: s.color, borderWidth: 2 },
          lineStyle: { color: s.color, width: lineWidth(s) },
          z: 12,
          silent: true,
        });
        // 缺采跨接段：虚线桥接 + 空心圆点（曲线自然跨接不中断）
        for (const [a, b] of gapRuns(s.points)) {
          const vp = s.points[a - 1].price;
          const vn = s.points[b + 1].price;
          if (vp == null || vn == null) continue;
          const bridge = s.points.map((_, i) => (i === a - 1 ? vp : i === b + 1 ? vn : null));
          sArr.push({
            type: 'line',
            data: bridge,
            smooth: true,
            smoothMonotone: 'x',
            connectNulls: true,
            symbol: 'none',
            lineStyle: { color: s.color, width: lineWidth(s), type: [4, 4], opacity: 0.9 },
            z: 11,
            silent: true,
          });
        }
        const hollow = hollowPoints(s.points);
        if (hollow.length > 0) {
          sArr.push({
            type: 'scatter',
            data: hollow.map(([i, v]) => ({ value: [i, v] })),
            symbol: 'circle',
            symbolSize: 7,
            itemStyle: { color: '#ffffff', borderColor: s.color, borderWidth: 2 },
            z: 13,
            silent: true,
          });
        }
      }
      if (priceTypes.rrp) {
        // 两价同选不标 RRP（避免重复）；仅 RRP 时 = 主价线，可见集与折后价同源（避让后 dy）
        const rdata = s.points.map((p, i) => ({
          value: p.rrp,
          label: {
            show: !priceTypes.discounted && p.rrp != null && dyMap[i] !== undefined,
            position: 'top' as const,
            distance: LABEL_DISTANCE,
            offset: [0, dyMap[i] ?? 0],
            color: color.ink,
            fontSize: fontSize.bodySm,
            fontWeight: 400,
            fontFamily: font.family,
            lineHeight: LABEL_LINE_HEIGHT,
            formatter: p.rrp != null ? fmtInt(p.rrp) : '',
          },
        }));
        sArr.push({
          type: 'line',
          data: rdata,
          step: 'end',
          symbol: 'none',
          connectNulls: false,
          lineStyle: { color: s.color, width: s.isOwn ? 2 : 1.5, type: [6, 4], opacity: 0.75 },
          z: 6,
          silent: true,
        });
      }
    }

    return {
      animation: false,
      tooltip: { show: false },
      textStyle: { fontFamily: font.family },
      grid: { left: geom.gridLeft, right: GRID.right, top: gridTop, bottom: GRID.bottom },
      xAxis: {
        type: 'category',
        data: xLabels,
        boundaryGap: true,
        axisLine: { lineStyle: { color: color.hairline } },
        axisTick: { show: false },
        axisLabel: monthLike
          ? {
              interval: 'auto',
              hideOverlap: true,
              formatter: (v: string) => `{mono|${v}}`,
              rich: { mono: { fontFamily: font.mono, fontSize: 12, color: color.body } },
            }
          : { interval: 'auto', hideOverlap: true, fontSize: 12, color: color.body, fontFamily: font.family },
      },
      yAxis: {
        type: 'value',
        min: geom.min,
        max: geom.max,
        interval: geom.interval,
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: color.hairline } },
        axisLabel: {
          fontSize: fontSize.bodySm,
          color: color.body,
          fontFamily: font.family,
          formatter: (v: number) => fmtInt(v),
        },
      },
      series: sArr,
    } as unknown as EChartsOption;
  }, [geom, series, priceTypes, granularity, labelPlan]);

  // ---- setOption / resize ----
  useEffect(() => {
    const c = chartRef.current;
    if (!c) return;
    if (geom && option) {
      c.resize();
      c.setOption(option, { notMerge: true });
    } else {
      c.clear();
    }
  }, [option, geom]);

  // ---- 悬停定位（鼠标 x → 桶下标；点左右各占一半区间的命中语义由取整保证） ----
  const locate = (e: ReactMouseEvent<HTMLDivElement>): { idx: number; mx: number; my: number } | null => {
    const el = wrapRef.current;
    if (!el || !geom) return null;
    const rect = el.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    if (mx < geom.plotLeft || mx > geom.plotLeft + geom.plotWidth) return null;
    const idx = Math.min(geom.n - 1, Math.max(0, Math.floor((mx - geom.plotLeft) / (geom.plotWidth / geom.n))));
    return { idx, mx, my };
  };

  const onMouseMove = (e: ReactMouseEvent<HTMLDivElement>): void => {
    const hit = locate(e);
    const el = wrapRef.current;
    // 图顶卡片区不是时间轴触发域：悬停列清空（有锁定列时保持锁定明细，BUG 修复：
    // 锁定后指针挪到页签上明细不再消失）；无锁定 → 卡片回图例态
    if (hit && hit.my < gridTop) {
      setHoverIdx(null);
      if (el) el.style.cursor = 'default';
      return;
    }
    if (!hit) {
      setHoverIdx(null);
      if (el) el.style.cursor = 'default';
      return;
    }
    setHoverIdx(hit.idx);
    if (el) el.style.cursor = 'pointer'; // 点击可锁定/解锁该时间列
  };

  const onMouseLeave = (): void => {
    setHoverIdx(null);
    if (wrapRef.current) wrapRef.current.style.cursor = 'default';
  };

  const onClick = (e: ReactMouseEvent<HTMLDivElement>): void => {
    if (!geom) return;
    const hit = locate(e);
    if (!hit || hit.my < gridTop) return; // 卡片区点击不进入图表（卡片图例点击已 stopPropagation）
    // 命中圆点（±12px）→ 月/季下钻；否则点击 = 锁定/解锁该时间列（常驻浅灰背景带）
    if (props.enableDrill && props.onDrill) {
      let bestKey: string | null = null;
      let bestD = Number.POSITIVE_INFINITY;
      for (const s of series) {
        const v = primaryOf(s.points[hit.idx]);
        if (v == null) continue;
        const d = Math.abs(hit.my - yPxOf(geom, v));
        if (d < bestD) {
          bestD = d;
          bestKey = s.key;
        }
      }
      if (bestKey && bestD <= HIT_PX) {
        props.onDrill(bestKey, series[0].points[hit.idx].bucketId);
        return;
      }
    }
    setLockedIdx((prev) => (prev === hit.idx ? null : hit.idx));
  };

  // ---- offer 图标：按 offer.title 分组取首周（窗口内） ----
  const offerMarkers = useMemo(() => {
    if (!props.enableOffer || !geom) return [];
    const out: { key: string; x: number; y: number; offer: OfferInfo }[] = [];
    for (const s of series) {
      const seen = new Set<string>();
      s.points.forEach((p, i) => {
        if (!p.offer || p.price == null || seen.has(p.offer.title)) return;
        seen.add(p.offer.title);
        out.push({ key: `${s.key}|${p.offer.title}|${i}`, x: xPxOf(geom, i), y: yPxOf(geom, p.price), offer: p.offer });
      });
    }
    return out;
  }, [props.enableOffer, geom, series]);

  const empty = series.length === 0;
  const brandByKey = useMemo(() => new Map(series.map((s) => [s.key, s.brand])), [series]);

  // 全系列被图例隐藏时 geom 为 null，但图例卡必须仍可点（恢复入口），用回退几何定位
  const legendFallback: { left: number; width: number } | null =
    geom == null && props.legendSeries != null && props.legendSeries.length > 0 && width >= 160
      ? {
          left: props.gridLeft ?? 56,
          width: Math.max(160, width - (props.gridLeft ?? 56) - GRID.right),
        }
      : null;

  return (
    <div
      ref={wrapRef}
      style={{ position: 'relative', width: '100%', height } as CSSProperties}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
    >
      {/* 时间列背景带（canvas 之下）：锁定=浅灰常驻、悬停=极浅灰（点击锁定/再点解锁） */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
        {geom && lockedIdx != null && lockedIdx < geom.n && (
          <div
            style={{
              position: 'absolute',
              left: geom.plotLeft + (geom.plotWidth / geom.n) * lockedIdx,
              top: geom.plotTop,
              width: geom.plotWidth / geom.n,
              height: geom.plotHeight,
              background: 'rgba(15, 15, 15, 0.06)',
            }}
          />
        )}
        {geom && hoverIdx != null && hoverIdx !== lockedIdx && (
          <div
            style={{
              position: 'absolute',
              left: geom.plotLeft + (geom.plotWidth / geom.n) * hoverIdx,
              top: geom.plotTop,
              width: geom.plotWidth / geom.n,
              height: geom.plotHeight,
              background: 'rgba(15, 15, 15, 0.03)',
            }}
          />
        )}
      </div>
      {/* ECharts 挂载层 */}
      <div ref={chartDivRef} style={{ position: 'absolute', inset: 0, zIndex: 1 }} />
      {empty && (
        <div
          style={{
            height: '100%',
            display: 'grid',
            placeItems: 'center',
            color: color.mute,
            fontSize: fontSize.bodySm,
          }}
        >
          {props.emptyHint ?? '暂无数据，请先在上方筛选器选择产品'}
        </div>
      )}
      {geom && (
        <>
          {/* 轴单位（用户反馈 #5）：Y 轴顶端 = 币种（caption mute），X 轴右端下方 = 时间粒度 */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: gridTop - 34,
              width: geom.gridLeft,
              textAlign: 'center',
              fontSize: fontSize.caption,
              lineHeight: '16px',
              color: color.mute,
              pointerEvents: 'none',
              zIndex: 1,
            }}
          >
            {currency === 'usd' ? '$' : '₽'}
          </div>
          <div
            style={{
              position: 'absolute',
              right: 6,
              top: geom.plotTop + geom.plotHeight + 10,
              fontSize: fontSize.caption,
              lineHeight: '16px',
              color: color.mute,
              pointerEvents: 'none',
              zIndex: 1,
            }}
          >
            {granularity === 'week' ? '周' : granularity === 'month' ? '月' : '季'}
          </div>
          {/* 锁定提示：悬停列顶部（悬停锁定列 = 点击解锁） */}
          {hoverIdx != null && hoverIdx < geom.n && (
            <div
              style={{
                position: 'absolute',
                left: geom.plotLeft + (geom.plotWidth / geom.n) * hoverIdx,
                top: geom.plotTop + 4,
                width: geom.plotWidth / geom.n,
                textAlign: 'center',
                fontSize: 10,
                lineHeight: '12px',
                color: color.hairlineStrong,
                pointerEvents: 'none',
                zIndex: 1,
                whiteSpace: 'nowrap',
              }}
            >
              {hoverIdx === lockedIdx ? '点击解锁' : '点击锁定'}
            </div>
          )}
          {/* 十字竖线（DOM 层，替代 ECharts axisPointer） */}
          {hoverIdx != null && hoverIdx < geom.n && (
            <div
              style={{
                position: 'absolute',
                left: Math.round(xPxOf(geom, hoverIdx)) - 0.5,
                top: geom.plotTop,
                width: 1,
                height: geom.plotHeight,
                background: color.hairlineStrong,
                opacity: 0.7,
                pointerEvents: 'none',
                zIndex: 1,
              }}
            />
          )}
          {/* 系列名（第一个有值点左侧/点上方兜底，DOM 层 13px/600，前置品牌色小点；
              zIndex 9 = 全图层最上，白描边保证不被任何元素遮挡） */}
          {labelPlan.names.map((nm, i) => (
            <div
              key={`nm-${i}-${nm.text}`}
              style={{
                position: 'absolute',
                left: nm.x,
                top: nm.y,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: NAME_FONT_SIZE,
                fontWeight: 600,
                lineHeight: `${NAME_LINE_HEIGHT}px`,
                color: nm.color,
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
                zIndex: 9,
                textShadow: '0 1px 0 #fff, 0 -1px 0 #fff, 1px 0 0 #fff, -1px 0 0 #fff',
              }}
            >
              <BrandDot brand={brandByKey.get(nm.seriesKey) ?? ''} />
              {nm.text}
            </div>
          ))}
          {/* offer 图标（仅周视图；点击浮窗） */}
          {offerMarkers.map((m) => (
            <OfferPopover key={m.key} x={m.x} y={m.y} offer={m.offer} />
          ))}
          {/* 悬停跳转取证（仅周视图；空心点不可跳） */}
          {props.enableJump &&
            hoverIdx != null &&
            series.map((s) => {
              const p = s.points[hoverIdx];
              if (!p || p.missing || p.price == null || !p.url) return null;
              return <JumpIcon key={`jp-${s.key}`} x={xPxOf(geom, hoverIdx)} y={yPxOf(geom, p.price)} url={p.url} />;
            })}
        </>
      )}
      {/* 钉顶卡片（常驻图例卡：悬停列/锁定列=该列明细态；移出后/指针在卡片区=图例态，
          已锁定则保持锁定列明细不消失）。全系列隐藏时 geom 为 null → 用回退几何保持卡片可点（恢复入口） */}
      {(geom || legendFallback) && (
        <PinnedTooltips
          series={props.legendSeries ?? series}
          hiddenKeys={props.hiddenKeys ?? NO_KEYS}
          index={!geom ? null : hoverIdx ?? lockedIdx}
          currency={currency}
          priceTypes={priceTypes}
          left={geom ? geom.plotLeft : legendFallback!.left}
          top={6}
          maxWidth={geom ? geom.plotWidth : legendFallback!.width}
          onToggle={props.onToggleLegend}
        />
      )}
    </div>
  );
}

type AvoidResultNames = { x: number; y: number; text: string; color: string; seriesKey: string };
