// ============================================================
// §6.2/§6.3/§6.4 图主体：ECharts canvas + DOM 覆盖层。
// 第七轮（branch feature/y-axis-adaptive）Y 轴简化重构：
// - 值轴纯自适应（computeYAxis 分段压缩刻度），拖柄/档位 chips 删除；
// - ECharts 值轴整体隐藏，刻度线/刻度标签（12px K/M 缩写）/断轴符号/档位带全部 DOM 层绘制——
//   分段映射的数据喂归一化伪值（yNormOf），DOM 与 canvas 同源几何恒一致；
// - 断裂轴：值簇空白 ≥ 阈值（helpers 阈值常量）压成 BREAK_PX 条，双虚线 + 轴上断轴符号；
// - 档位带（仅 USD）：Y 轴左侧新增一列档位框（如 200~400 框住 200..400 刻度区段），
//   本币映射未定义不渲染；图隐藏（空态/几何失效）时随之隐藏；
// - 名称预留带：绘图区左缘常驻 NAME_ZONE_W 空白带，折线不进入——
//   系列名右缘锚在起点左侧、随窗口平移连续左移（第十轮：不再跳变），
//   滑到预留带左界即停驻带内（同一文案，位置连续）；文案去品牌前缀 + 去容量后缀 GB/TB
//   （品牌由色点/图例卡表达，第十轮）
// - 第十轮：每格高度伸缩滑杆收进币种符号旁的齿轮弹层（Popover），不占任何版面；
//   Y 轴模型可由外部传入（yScale，含刷选冻结与伸缩倍率），迷你图缺省内部自算
// - 折后价：monotone 平滑实线品牌色（我司 3px / 竞品 2px），白底圆环圈点 r≈3.5
// - RRP：虚线 6/4 + step 阶梯（平段+调价点垂直跳变，不平滑），同色 75% 不透明度
// - 缺采：跨接段虚线 + 空心圆点；价格标签自适应避让（resolveCollisions 两遍式）
// - 悬停：十字竖线（DOM）+ 钉顶附框 + 周视图跳转图标 + offer 图标；ECharts tooltip 禁用
// - 点击：月/季圈点（±12px 命中）触发下钻；周视图点击 = 锁定/解锁该时间列
// ============================================================
import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react';
import { Checkbox, Popover } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';
import type { CurrencyMode, Granularity, OfferInfo, Series, SeriesPoint } from '../../dataModel/types';
import { color, font, fontSize } from '../../theme/tokens';
import {
  BREAK_PX,
  DEFAULT_TIERS,
  GRID,
  NAME_ZONE_W,
  TICK_PX,
  TIER_BAND_GAP,
  TIER_BAND_W,
  computeYAxis,
  estGridLeft,
  fmtAxisShort,
  fmtInt,
  gapRuns,
  gridTopFor,
  hollowPoints,
  resolveCollisions,
  segTicks,
  weekLabeledIdx,
  xPxOf,
  yNormOf,
  yPxOf,
  type AvoidItem,
  type Geom,
  type YScale,
} from './helpers';
import PinnedTooltips from './PinnedTooltips';
import JumpIcon from './JumpIcon';
import OfferPopover from './OfferPopover';
import ScaleSlider from './ScaleSlider';
import BrandDot from '../../components/BrandMark';

export interface ChartProps {
  series: Series[];
  granularity: Granularity;
  currency: CurrencyMode;
  priceTypes: { discounted: boolean; rrp: boolean };
  // 第七轮：height/y 已删 —— 容器高 = gridTop + plotHeight + GRID.bottom（自适应派生），
  // Y 轴 = 纯自适应分段刻度（无手动覆盖）
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
  /** 外部计算的 Y 轴模型（主图传入，含刷选拖动冻结与伸缩倍率）；缺省内部自适应（迷你图） */
  yScale?: YScale;
  /** 每格高度伸缩倍率（受控；缺省用内部状态，齿轮弹层在两种模式下都可用） */
  sliderScale?: number;
  /** 伸缩倍率提交（滑杆松手回调；缺省写内部状态） */
  onSliderScale?: (v: number) => void;
}

const HIT_PX = 12; // 圈点点击/悬停命中半径
const LABEL_DISTANCE = 4;
const LABEL_LINE_HEIGHT = 20;
const NAME_FONT_SIZE = 13;
const NAME_LINE_HEIGHT = 18;
const NAME_LOGO_W = 12; // 系列名前置品牌色小点（8px）+ 间距 4，避让宽度估算用
const ZONE_FONT = 12; // 名称预留带内字号（小一号）+ 两行换行
const ZONE_LINE_H = 16;
const NO_KEYS = new Set<string>(); // hiddenKeys 缺省值
/** 高度过渡动画（第十一轮）：高度变化超过 2 格（步长换档/换产品/伸缩大幅调整）时，
 *  以缓动缩放过渡而不是瞬跳；≤2 格的小步（整格吸附、断裂条）即时生效保持跟手 */
const H_ANIM_THRESHOLD_PX = 2 * TICK_PX;
const H_ANIM_MS = 280;

/** 曲线上的系列名（第十轮）：去品牌前缀（品牌由色点/图例卡表达）+ 去容量后缀 GB/TB */
function curveNameOf(s: Series): string {
  const bp = `${s.brand} `;
  const noBrand = s.label.startsWith(bp) ? s.label.slice(bp.length) : s.label;
  return noBrand.replace(/\s*(GB|TB)$/i, '').trim();
}

export default function Chart(props: ChartProps) {
  const { series, granularity, currency, priceTypes } = props;
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const chartDivRef = useRef<HTMLDivElement | null>(null); // ECharts 挂载层（背景带之下、DOM 覆盖层之下）
  const chartRef = useRef<echarts.ECharts | null>(null);
  const [width, setWidth] = useState(0);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [lockedIdx, setLockedIdx] = useState<number | null>(null); // 点击锁定的时间列（跨悬停常驻）
  // Y 刻度线显隐（第十二轮）：齿轮弹层内开关，只隐藏刻度线+数字标签（档位带/断轴标记保留）
  const [showYTicks, setShowYTicks] = useState(true);

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

  // 每格高度伸缩（第十轮）：主图受控于上层 index（同一份 sliderScale 状态），迷你图用内部状态；
  // 齿轮弹层里的滑杆松手才提交，两种模式下都可用
  const [innerSliderScale, setInnerSliderScale] = useState(1);
  const sliderScale = props.sliderScale ?? innerSliderScale;
  const commitSliderScale = props.onSliderScale ?? setInnerSliderScale;

  // ---- Y 轴：自适应分段刻度（外部 yScale 优先——主图用它承接刷选冻结与伸缩倍率；
  //      内部自算必须吃 sliderScale，第十轮修复：此前硬编码 ×1 导致滑杆提交后图表纹丝不动）。
  //      selfPrevRef 传 prev 做步长滞回（第十一轮），迷你图同样获得稳定刻度 ----
  const selfPrevRef = useRef<YScale | null>(null);
  const selfScale: YScale = useMemo(() => {
    const next = computeYAxis({ series, priceTypes, sliderScale, prev: selfPrevRef.current });
    selfPrevRef.current = next;
    return next;
  }, [series, priceTypes, sliderScale]);
  const scale = props.yScale ?? selfScale;

  // ---- 高度过渡动画：animH = 当前视觉高度，缓动逼近目标 scale.plotHeight。
  //      动画期间按比例 k 缩放整段纵向几何（段 pTop/pH、断裂条中心、plotHeight）——
  //      yPxOf/yNormOf 只依赖这些字段，canvas 伪值与 DOM 覆盖层天然同源跟随 ----
  const animHRef = useRef(scale.plotHeight);
  const [animH, setAnimH] = useState(scale.plotHeight);
  const animRafRef = useRef<number | null>(null);
  useEffect(() => {
    const to = scale.plotHeight;
    const from = animHRef.current;
    if (from === to) return;
    if (Math.abs(to - from) <= H_ANIM_THRESHOLD_PX) {
      if (animRafRef.current != null) cancelAnimationFrame(animRafRef.current);
      animRafRef.current = null;
      animHRef.current = to;
      setAnimH(to);
      return;
    }
    const t0 = performance.now();
    const step = (now: number): void => {
      const p = Math.min(1, (now - t0) / H_ANIM_MS);
      const cur = from + (to - from) * (1 - Math.pow(1 - p, 3)); // easeOutCubic
      animHRef.current = cur;
      setAnimH(cur);
      animRafRef.current = p < 1 ? requestAnimationFrame(step) : null;
    };
    animRafRef.current = requestAnimationFrame(step);
    return () => {
      if (animRafRef.current != null) cancelAnimationFrame(animRafRef.current);
    };
  }, [scale.plotHeight]);
  const k = scale.plotHeight > 0 ? animH / scale.plotHeight : 1;
  const displayScale: YScale = useMemo(
    () =>
      k === 1
        ? scale
        : {
            ...scale,
            plotHeight: scale.plotHeight * k,
            segs: scale.segs.map((s) => ({ ...s, pTop: s.pTop * k, pH: s.pH * k })),
            breaks: scale.breaks.map((b) => b * k),
          },
    [scale, k],
  );
  // 容器高由 Y 模型派生：格数×TICK_PX + 断裂条 + 图顶卡片区 + 底边距（跨度大 → 自动变高）；
  // 用 animH（动画中）而非目标高度，大变化时整体缓动伸缩
  const totalH = gridTop + Math.round(animH) + GRID.bottom;

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
    if (!width || width < 160 || n === 0 || totalH < 160) return null;
    const gl = props.gridLeft ?? estGridLeft(displayScale.max, currency);
    if (gl + GRID.right > width - 48) return null;
    return {
      gridLeft: gl,
      plotLeft: gl,
      plotTop: gridTop,
      plotWidth: width - gl - GRID.right,
      plotHeight: displayScale.plotHeight,
      scale: displayScale,
      n,
    };
  }, [width, totalH, gridTop, series, displayScale, currency, props.gridLeft]);

  // ---- 标签避让计划（价格标签 dy + 系列名位置 + 可见集） ----
  // 自适应规则（长窗口数值防叠）：
  // P0 必放 = 每系列首个/末个有值点 + 窗口内最大/最小（形状锚点，冲突时纵向推挤）；
  // P1 候选 = 变价点（周）/ 全部点（月/季），期望位无冲突才显示，冲突即隐藏；
  // 系列名（第十轮）= 右缘锚在起点左侧 8px、随窗口平移连续左移；滑到名称预留带左界
  // 即停驻带内（同一文案同一锚点语义，位置连续不跳变），折线永不进入预留带。
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
      // 系列名（第十轮）：文案去品牌前缀 + 去容量后缀（GB/TB）——品牌由色点/图例卡表达。
      // 位置 = 右缘锚在起点左侧连续滑动；besideLeft 触到带左界 → 停驻带内（左对齐，
      // 仅当名宽超出带宽才换两行）——切换瞬间 left 恒等于 zoneLeft，无位置跳变。
      const fi = valIdx[0];
      const v0 = primaryOf(pts[fi]) ?? 0;
      const px = xPxOf(geom, fi);
      const py = yPxOf(geom, v0);
      const nameText = curveNameOf(s);
      const nw = nameW(nameText);
      const zoneLeft = geom.plotLeft - NAME_ZONE_W + 4;
      const besideLeft = px - 8 - nw;
      const useZone = besideLeft < zoneLeft;
      const zoneBoxW = Math.min(nw, NAME_ZONE_W - 8);
      const zoneLines = nw > NAME_ZONE_W - 8 ? 2 : 1;
      items.push({
        kind: 'name',
        seriesKey: s.key,
        pointIdx: fi,
        pinned: true,
        left: useZone ? zoneLeft : besideLeft,
        right: useZone ? zoneLeft + zoneBoxW : px - 8,
        top: useZone ? py - (zoneLines * ZONE_LINE_H) / 2 : py - NAME_LINE_HEIGHT / 2,
        h: useZone ? zoneLines * ZONE_LINE_H : NAME_LINE_HEIGHT,
        text: nameText,
        color: s.color,
        maxW: useZone ? zoneBoxW : undefined,
      });
    }
    const res = resolveCollisions(items, geom.plotTop);
    return { dy: res.dy, names: res.names as AvoidResultNames[] };
  }, [geom, series, granularity, priceTypes, props.priceTypes.discounted]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- 端点标记（第十三轮引入、第十四轮改为 DOM 徽标）：
  //      S = 真实开头（该段连续有值区间的首点）；E = 真实截止（其后连续两周无值，
  //      或窗口右缘且无续接数据）；in/out = 窗口左/右缘的续接点（窗口外 2 周内仍有
  //      数据，非真实首尾）。标记点在 canvas 上不再画默认符号，由 DOM 徽标接管 ----
  const endpointMarks = useMemo(() => {
    const marks = new Map<string, 'S' | 'E' | 'in' | 'out'>();
    for (const s of series) {
      const n = s.points.length;
      const val = (i: number): number | null => s.points[i]?.price ?? null;
      const isStart = (i: number): boolean => {
        if (val(i) == null) return false;
        if (i === 0) return !s.edgeStart;
        if (val(i - 1) != null) return false;
        return i === 1 || val(i - 2) == null; // 前面连续两周无值才算新开头（1 周断采视为连续）
      };
      const isEnd = (i: number): boolean => {
        if (val(i) == null) return false;
        if (i + 1 < n && val(i + 1) != null) return false; // 非段尾
        if (i === n - 1) return !s.edgeEnd; // 触右缘：有续接=非截止
        return val(i + 1) == null && (i + 2 < n ? val(i + 2) == null : true);
      };
      for (let i = 0; i < n; i++) {
        if (val(i) == null) continue;
        const st = isStart(i);
        const en = isEnd(i);
        if (i === 0 && s.edgeStart) marks.set(`${s.key}|${i}`, 'in');
        else if (st) marks.set(`${s.key}|${i}`, 'S');
        if (i === n - 1 && s.edgeEnd) marks.set(`${s.key}|${i}`, 'out');
        else if (en) marks.set(`${s.key}|${i}`, 'E');
      }
    }
    return marks;
  }, [series]);

  // ---- ECharts option（值轴隐藏，数据喂归一化伪值） ----
  const option = useMemo<EChartsOption | null>(() => {
    if (!geom) return null;
    const first = series[0];
    if (!first) return null;
    const xLabels = first.points.map((p) => p.xLabel);
    const lineWidth = (s: Series): number => (s.isOwn ? 3 : 2);
    const sArr: Record<string, unknown>[] = [];

    for (const s of series) {
      const dyMap = labelPlan.dy[s.key] ?? {};
      if (priceTypes.discounted) {
        // 端点（第十四轮）：带标记的点在 canvas 上不画默认符号，由 DOM 徽标接管
        const data = s.points.map((p, i) => {
          const marked = endpointMarks.has(`${s.key}|${i}`);
          return {
            value: p.price != null ? yNormOf(geom, p.price) : null,
            symbol: marked ? 'none' : undefined,
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
          };
        });
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
          const bridge = s.points.map((_, i) =>
            i === a - 1 ? yNormOf(geom, vp) : i === b + 1 ? yNormOf(geom, vn) : null,
          );
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
            data: hollow.map(([i, v]) => ({ value: [i, yNormOf(geom, v)] })),
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
          value: p.rrp != null ? yNormOf(geom, p.rrp) : null,
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
        // 第十二轮：月/季标签弃 mono rich，与周视图同一字体字号（全页数字字体统一）
        axisLabel: { interval: 'auto', hideOverlap: true, fontSize: 12, color: color.body, fontFamily: font.family },
      },
      // 值轴整体隐藏（第七轮）：刻度线/标签/断裂符号/档位带全部 DOM 层绘制
      yAxis: { show: false, min: 0, max: 1 },
      series: sArr,
    } as unknown as EChartsOption;
  }, [geom, series, priceTypes, granularity, labelPlan, gridTop]);

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
    // 图顶卡片区不是时间轴触发域：悬停列清空（有锁定列时保持锁定明细；
    // 无锁定 → 卡片回图例态）
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

  // ---- 端点徽标几何（第十四轮）：S/E = 实心品牌色圆内白字（稍大于普通点）；
  //      ‹/› = 窗口边缘续接点（白底品牌描边 + 外向箭头），替代原灰色延长线 ----
  const endpointBadges = useMemo(() => {
    if (!geom) return [];
    const out: { key: string; x: number; y: number; kind: 'S' | 'E' | 'in' | 'out'; color: string }[] = [];
    for (const s of series) {
      s.points.forEach((p, i) => {
        const kind = endpointMarks.get(`${s.key}|${i}`);
        if (!kind || p.price == null) return;
        out.push({ key: `${s.key}|${i}`, x: xPxOf(geom, i), y: yPxOf(geom, p.price), kind, color: s.color });
      });
    }
    return out;
  }, [geom, series, endpointMarks]);

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

  // ---- DOM 刻度/断轴/档位带数据 ----
  // 左缘布局：[档位带(仅USD)][刻度列][名称预留带][绘图区]（滑杆已移至工具行，不占左缘）
  const tierPart = currency === 'usd' ? TIER_BAND_W + TIER_BAND_GAP : 0;
  const tickW = geom ? Math.max(34, geom.gridLeft - tierPart - NAME_ZONE_W) : 44;
  const tierLeft = geom ? geom.gridLeft - NAME_ZONE_W - tickW - TIER_BAND_GAP - TIER_BAND_W : 0;
  const tickRows = useMemo(() => {
    if (!geom) return [];
    const out: { v: number; y: number }[] = [];
    for (const seg of geom.scale.segs) {
      for (const v of segTicks(seg, geom.scale.interval)) out.push({ v, y: yPxOf(geom, v) });
    }
    return out;
  }, [geom]);

  // 有值档位过滤（第八轮）：完全不存在该价格档位的数据时不显示该档（用户反馈 400~600 空档）
  const tierValues = useMemo(() => {
    const out: number[] = [];
    for (const s of series) {
      for (const pt of s.points) {
        if (priceTypes.discounted && pt.price != null) out.push(pt.price);
        if (priceTypes.rrp && pt.rrp != null) out.push(pt.rrp);
      }
    }
    return out;
  }, [series, priceTypes]);

  const showTierBand = currency === 'usd' && geom != null;
  // 档位带按段裁剪：档位只画在与其值域相交的段上（跨断裂的档不会画出"跨越"错觉）
  const tierBoxes = useMemo(() => {
    if (!showTierBand || !geom) return [];
    const out: { label: string; top: number; h: number }[] = [];
    for (const tier of DEFAULT_TIERS) {
      const tHi = tier.max ?? Number.POSITIVE_INFINITY;
      if (!tierValues.some((v) => v >= tier.min && v < tHi)) continue; // 无数据的档不画
      for (const seg of geom.scale.segs) {
        const lo = Math.max(tier.min, seg.min);
        const hi = Math.min(tHi, seg.max); // tHi=∞（1000+ 档）时即 seg.max
        if (lo >= hi - 1e-9) continue;
        const top = yPxOf(geom, hi);
        const h = yPxOf(geom, lo) - top;
        if (h < 2) continue;
        out.push({ label: tier.label, top, h });
      }
    }
    return out;
  }, [showTierBand, geom, tierValues]);

  // 主价线：折后价优先；仅勾 RRP 时 RRP 成为主价线（标签/下钻/跳转跟随）
  function primaryOf(p: SeriesPoint): number | null {
    return priceTypes.discounted ? p.price : p.rrp;
  }

  return (
    <div
      ref={wrapRef}
      style={{ position: 'relative', width: '100%', height: totalH } as CSSProperties}
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
          {/* 轴单位 + Y 轴显示设置（第十二轮）：币种符号与齿轮组成同组居中，
              两种币种下符号↔齿轮间距恒为 6px；弹层内含伸缩滑杆与刻度线开关 */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: gridTop - 36,
              width: geom.gridLeft - NAME_ZONE_W,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 6,
              zIndex: 3,
            }}
          >
            <span style={{ fontSize: fontSize.caption, lineHeight: '16px', color: color.mute, pointerEvents: 'none' }}>
              {currency === 'usd' ? '$' : '₽'}
            </span>
            <Popover
              trigger="click"
              placement="bottom"
              content={
                <div style={{ width: 236 }}>
                  <div style={{ fontSize: 12, color: color.mute, marginBottom: 8 }}>每格高度（不改 Y 轴刻度值）</div>
                  <ScaleSlider scale={sliderScale} onCommit={commitSliderScale} />
                  <div style={{ fontSize: 11, color: color.mute, marginTop: 8 }}>拖动后松手生效；双击滑杆复位 ×1.00</div>
                  <div style={{ borderTop: `1px solid ${color.hairline}`, margin: '10px 0' }} />
                  <Checkbox checked={showYTicks} onChange={(e) => setShowYTicks(e.target.checked)}>
                    <span style={{ fontSize: 12 }}>显示 Y 刻度线</span>
                  </Checkbox>
                </div>
              }
            >
              <button
                type="button"
                title="Y 轴显示设置（每格高度伸缩 / 刻度线显隐）"
                aria-label="Y 轴显示设置"
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: 20,
                  height: 20,
                  display: 'grid',
                  placeItems: 'center',
                  padding: 0,
                  border: `1px solid ${color.hairline}`,
                  borderRadius: 4,
                  background: color.canvas,
                  color: color.mute,
                  cursor: 'pointer',
                }}
              >
                <SettingOutlined style={{ fontSize: 12 }} />
              </button>
            </Popover>
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
          {/* DOM 刻度线 + 缩写标签（12px，与时间轴同字号；ECharts 值轴已隐藏；齿轮弹层可关） */}
          {showYTicks && tickRows.map((t) => (
            <div key={`tk-${t.v}`}>
              <div
                style={{
                  position: 'absolute',
                  left: geom.plotLeft,
                  top: Math.round(t.y) - 0.5,
                  width: geom.plotWidth,
                  height: 1,
                  background: color.hairline,
                  pointerEvents: 'none',
                  zIndex: 0,
                }}
              />
              <div
                className="tnum"
                style={{
                  position: 'absolute',
                  left: geom.plotLeft - NAME_ZONE_W - tickW,
                  top: Math.round(t.y) - 8,
                  width: tickW - 8,
                  textAlign: 'right',
                  fontSize: 12,
                  lineHeight: '16px',
                  color: color.body,
                  pointerEvents: 'none',
                  zIndex: 1,
                  whiteSpace: 'nowrap',
                }}
              >
                {fmtAxisShort(t.v)}
              </div>
            </div>
          ))}
          {/* 断裂轴：压缩空白条 = 绘图区极浅灰带（暗示该段值域被隐藏）+ 上下虚线边，
              轴上为纵向省略号标注（第八轮：替代斜线符号） */}
          {geom.scale.breaks.map((b, i) => {
            const stripTop = geom.plotTop + b - BREAK_PX / 2;
            return (
              <div key={`brk-${i}`}>
                {/* 极浅灰带（zIndex 0 = 画在数据线之下，但断裂带内本就无数据线） */}
                <div
                  style={{
                    position: 'absolute',
                    left: geom.plotLeft,
                    top: Math.round(stripTop),
                    width: geom.plotWidth,
                    height: BREAK_PX,
                    background: color.canvasSoft2,
                    borderTop: `1px dashed ${color.hairlineStrong}`,
                    borderBottom: `1px dashed ${color.hairlineStrong}`,
                    opacity: 0.85,
                    pointerEvents: 'none',
                    zIndex: 0,
                  }}
                />
                {/* 轴上纵向省略号（⋮）：刻度列居中 */}
                <svg
                  width="14"
                  height="16"
                  viewBox="0 0 14 16"
                  style={{
                    position: 'absolute',
                    left: geom.plotLeft - NAME_ZONE_W - tickW / 2 - 7,
                    top: geom.plotTop + b - 8,
                    pointerEvents: 'none',
                    zIndex: 2,
                  }}
                  aria-hidden
                >
                  {[3, 8, 13].map((cy) => (
                    <circle key={cy} cx="7" cy={cy} r="1.5" fill={color.hairlineStrong} />
                  ))}
                </svg>
              </div>
            );
          })}
          {/* 档位带（仅 USD）：Y 轴左侧档位框，框住对应刻度区段（如 200~400 框住 200..400）；
              完全无数据的档不显示；本币不渲染；图隐藏（空态）时整块随之消失 */}
          {showTierBand &&
            tierBoxes.map((tb, i) => (
              <div
                key={`tier-${tb.label}-${i}`}
                title={`价格档位 ${tb.label}（USD）`}
                style={{
                  position: 'absolute',
                  left: tierLeft,
                  top: tb.top,
                  width: TIER_BAND_W,
                  height: tb.h,
                  boxSizing: 'border-box',
                  border: `1px solid ${color.hairline}`,
                  background: i % 2 === 0 ? color.canvasSoft2 : color.canvasSoft,
                  display: 'grid',
                  placeItems: 'center',
                  overflow: 'hidden',
                  pointerEvents: 'none',
                  zIndex: 1,
                }}
              >
                {tb.h >= 16 && (
                  <span style={{ fontSize: 10, lineHeight: '12px', color: color.body, whiteSpace: 'nowrap' }}>
                    {tb.label}
                  </span>
                )}
              </div>
            ))}
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
          {/* 端点徽标（第十四轮）：S=起点、E=截止（实心品牌色圆内白字，稍大于普通点）；
              ‹/›=窗口边缘续接点（白底品牌描边+外向箭头），数据在窗口外延续 */}
          {endpointBadges.map((b) => {
            const big = b.kind === 'S' || b.kind === 'E';
            return (
              <div
                key={`ep-${b.key}`}
                title={
                  b.kind === 'S'
                    ? 'S = 起点（该配置首个有价周）'
                    : b.kind === 'E'
                      ? 'E = 截止（其后连续两周无数据）'
                      : b.kind === 'in'
                        ? '数据在窗口左侧延续，可拉伸时间窗口查看'
                        : '数据在窗口右侧延续，可拉伸时间窗口查看'
                }
                style={{
                  position: 'absolute',
                  left: b.x,
                  top: b.y,
                  width: big ? 15 : 13,
                  height: big ? 15 : 13,
                  transform: 'translate(-50%, -50%)',
                  borderRadius: '50%',
                  boxSizing: 'border-box',
                  display: 'grid',
                  placeItems: 'center',
                  background: big ? b.color : color.canvas,
                  border: `1.5px solid ${big ? color.canvas : b.color}`,
                  color: big ? color.canvas : b.color,
                  fontSize: big ? 9 : 10,
                  fontWeight: 700,
                  lineHeight: 1,
                  fontFamily: font.family,
                  pointerEvents: 'none',
                  zIndex: 8,
                }}
              >
                {b.kind === 'in' ? '‹' : b.kind === 'out' ? '›' : b.kind}
              </div>
            );
          })}
          {/* 系列名（起点旁 13px / 名称预留带 12px 两行换行，前置品牌色小点；
              zIndex 9 = 全图层最上，白描边保证不被任何元素遮挡） */}
          {labelPlan.names.map((nm, i) => (
            <div
              key={`nm-${i}-${nm.text}`}
              title={nm.text}
              style={{
                position: 'absolute',
                left: nm.x,
                top: nm.y,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: nm.maxW != null ? ZONE_FONT : NAME_FONT_SIZE,
                fontWeight: 600,
                lineHeight: nm.maxW != null ? `${ZONE_LINE_H}px` : `${NAME_LINE_HEIGHT}px`,
                color: nm.color,
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
                zIndex: 9,
                textShadow: '0 1px 0 #fff, 0 -1px 0 #fff, 1px 0 0 #fff, -1px 0 0 #fff',
                ...(nm.maxW != null ? { maxWidth: nm.maxW } : null),
              }}
            >
              <BrandDot brand={brandByKey.get(nm.seriesKey) ?? ''} />
              <span
                style={
                  nm.maxW != null
                    ? {
                        display: '-webkit-box',
                        WebkitBoxOrient: 'vertical' as const,
                        WebkitLineClamp: 2,
                        overflow: 'hidden',
                        wordBreak: 'break-word',
                        whiteSpace: 'normal',
                      }
                    : undefined
                }
              >
                {nm.text}
              </span>
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
          top={3}
          maxWidth={geom ? geom.plotWidth : legendFallback!.width}
          onToggle={props.onToggleLegend}
        />
      )}
    </div>
  );
}

type AvoidResultNames = { x: number; y: number; text: string; color: string; seriesKey: string; maxW?: number };
