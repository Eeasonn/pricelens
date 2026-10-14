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
// - 缺采：跨接段仅虚线（第二十四轮撤销空心插值点）；价格标签自适应避让（resolveCollisions 两遍式）
// - 悬停：十字竖线（DOM）+ 钉顶附框 + 周视图跳转图标 + 月/季下钻图标（第二十轮）+ offer 图标；
//   ECharts tooltip 禁用
// - 点击：月/季圈点（±12px 命中）触发下钻；周视图点击 = 锁定/解锁该时间列
// - 第二十轮：S/E 端点数值标签必放（symbolSize 0 修复 symbol 'none' 吞标签）；
//   齿轮弹层「Y 轴自动压缩」开关（关 = 无断轴完全连续）
// - 第三十二轮（多系列防挤）：
//   ① 生命周期第二行计入名称避让盒（此前盒高少算 ~14px + 渲染自行上移 7px → 名称互压）；
//   ② 名称被避让推离锚点超 NAME_LEADER_PX → 画细引线连回首点；
//   ③ 聚焦模式：系列数 > FOCUS_MODE_THRESHOLD 时图面名称/生命周期行退场（识别走
//      图例卡），悬停折线（±HIT_PX）高亮该系列、其余降透明 0.15，聚焦系列名称回归；
//   ④ 月/季 P1 标签候选改「显示值变化点」；多系列时最大/最小降 P1；
//   ⑤ 空档位画虚线占位框（梯子连续可读）
// ============================================================
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react';
import { Checkbox, Popover } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
// 按需注册（第十八轮）：全量 'echarts' → core + Line/Scatter + Grid + Canvas，
// bundle 约省 500KB；本图只画 line/scatter（RRP step、缺采虚线桥均 line），tooltip 已禁用
import * as echarts from 'echarts/core';
import { LineChart, ScatterChart } from 'echarts/charts';
import { GridComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([LineChart, ScatterChart, GridComponent, CanvasRenderer]);
import type { CurrencyMode, Granularity, Series } from '../../dataModel/types';
import { color, font, fontSize } from '../../theme/tokens';
import { lifecycleDeltaOf, type LifecycleDelta } from '../../dataModel/aggregate';
import {
  BREAK_PX,
  GRID,
  NAME_ZONE_W,
  TICK_PX,
  TIER_BAND_GAP,
  TIER_BAND_W,
  computeYAxis,
  gridTopFor,
  perUsdOf,
  xPxOf,
  yPxOf,
  type Geom,
  type StripGeom,
  type YScale,
} from './helpers';
// 纯计算层（第十八轮抽离）：几何/标签计划/端点/option/DOM 数据全部显式入参纯函数
import {
  FOCUS_MODE_THRESHOLD,
  NAME_FONT_SIZE,
  NAME_LEADER_PX,
  NAME_LINE_HEIGHT,
  ZONE_FONT,
  ZONE_LINE_H,
  buildEndpointBadges,
  buildEndpointMarks,
  buildGeom,
  buildLabelPlan,
  buildOfferMarkers,
  buildOption,
  buildTierBoxes,
  buildTickRows,
  collectTierValues,
  primaryPriceOf,
  scaleToDisplay,
  type SeriesNameItem,
} from './chartModel';
import PinnedTooltips from './PinnedTooltips';
import JumpIcon from './JumpIcon';
import DrillIcon from './DrillIcon';
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
  /** 是否渲染钉顶图例卡（第二十六轮：季/月下钻弹窗不渲染，配 gridTop 收窄） */
  showLegendCards?: boolean;
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
  /** Y 轴自动压缩（第二十轮，受控）：开 = 值簇空白 ≥ 阈值处断轴压缩；
   *  关 = 无断轴，Y 轴完全连续展示。缺省用内部状态，齿轮弹层在两种模式下都可用 */
  yCompress?: boolean;
  /** 压缩开关提交（缺省写内部状态） */
  onYCompress?: (v: boolean) => void;
  /** 绘图区横向几何原语上报（第十五轮：促销热力带与时间轴逐像素对齐用） */
  onGeom?: (g: StripGeom | null) => void;
}

const HIT_PX = 12; // 圈点点击/悬停命中半径
const NO_KEYS = new Set<string>(); // hiddenKeys 缺省值
/** 高度过渡动画（第十一轮）：高度变化超过 2 格（步长换档/换产品/伸缩大幅调整）时，
 *  以缓动缩放过渡而不是瞬跳；≤2 格的小步（整格吸附、断裂条）即时生效保持跟手 */
const H_ANIM_THRESHOLD_PX = 2 * TICK_PX;
const H_ANIM_MS = 280;

export default function Chart(props: ChartProps) {
  const { series, granularity, currency, priceTypes } = props;
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const chartDivRef = useRef<HTMLDivElement | null>(null); // ECharts 挂载层（背景带之下、DOM 覆盖层之下）
  const chartRef = useRef<echarts.ECharts | null>(null);
  const [width, setWidth] = useState(0);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [lockedIdx, setLockedIdx] = useState<number | null>(null); // 点击锁定的时间列（跨悬停常驻）
  // 聚焦模式（第三十二轮）：多系列时名称退场，悬停折线（±HIT_PX）高亮单系列，
  // 其余系列/徽标/标签降透明；识别职责 = 钉顶图例卡
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const focusMode = series.length > FOCUS_MODE_THRESHOLD;
  const focusActive = focusKey != null;
  // Y 刻度线显隐（第十二轮）：齿轮弹层内开关，只隐藏刻度线+数字标签（档位带保留）
  const [showYTicks, setShowYTicks] = useState(true);
  // Y 轴自动压缩（第二十轮，语义升级）：齿轮弹层内开关。开 = 值簇空白 ≥ 阈值处断轴
  // 压缩（灰带/虚线边/轴上省略号随断轴出现）；关 = 不产生断轴，Y 轴完全连续展示
  // （替代第十六轮「断轴处显示省略号」——只藏⋮不改断轴的旧语义）
  const [innerYCompress, setInnerYCompress] = useState(true);
  const yCompress = props.yCompress ?? innerYCompress;
  const commitYCompress = props.onYCompress ?? setInnerYCompress;

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
    const next = computeYAxis({
      series,
      priceTypes,
      sliderScale,
      allowBreak: yCompress,
      perUsd: perUsdOf(currency), // 档位锚定 USD（第二十三轮）：迷你图换币种不拉伸
      prev: selfPrevRef.current,
    });
    selfPrevRef.current = next;
    return next;
  }, [series, priceTypes, sliderScale, yCompress, currency]);
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
  const displayScale: YScale = useMemo(() => scaleToDisplay(scale, k), [scale, k]);
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
  const geom: Geom | null = useMemo(
    () =>
      buildGeom({
        width,
        totalH,
        gridTop,
        series,
        scale: displayScale,
        currency,
        gridLeft: props.gridLeft,
      }),
    [width, totalH, gridTop, series, displayScale, currency, props.gridLeft],
  );

  // ---- 促销热力带对齐（第十五轮）：把绘图区横向几何原语上报给下方 PromoTable；
  //      只按三个原语组成的 key 触发，高度过渡帧（displayScale 变）不重发；
  //      useLayoutEffect（第十七轮）：绘制前送达，热力带不必在过渡帧整表退场 ----
  const stripKey = geom ? `${geom.plotLeft}|${geom.plotWidth}|${geom.n}` : '';
  useLayoutEffect(() => {
    props.onGeom?.(geom ? { plotLeft: geom.plotLeft, plotWidth: geom.plotWidth, n: geom.n } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stripKey]);

  // ---- 端点标记（S=真实起点 / E=连续 3 区间无值才确认的截止 / in·out=窗口续接点），
  //      语义详见 chartModel.buildEndpointMarks；canvas 不画默认符号，DOM 徽标接管 ----
  const endpointMarks = useMemo(() => buildEndpointMarks(series), [series]);

  // ---- 生命周期调价幅度（第二十七轮：仅季粒度，系列名第二行）----
  // 恒本币、锚在数据（与窗口/显示币种无关）；完结/在售统显「生命周期 −X%」（第二十九轮：不再带「暂」）
  // 第三十二轮：先于 labelPlan 计算——第二行高度要计入名称避让盒
  const lifecycleDeltas = useMemo(() => {
    const m = new Map<string, LifecycleDelta | null>();
    if (granularity !== 'quarter') return m;
    for (const s of series) m.set(s.key, lifecycleDeltaOf(s.skuIds));
    return m;
  }, [series, granularity]);

  // ---- 标签避让计划（价格标签 dy + 系列名位置 + 可见集）----
  // 规则详见 chartModel.buildLabelPlan（P0 必放首末 + S/E 端点（第二十轮），超聚焦阈值
  // 时最大/最小降 P1（第三十二轮）；P1 = 变价点（周）/显示值变化点（月/季）冲突即隐；
  // lifecycleRow：季粒度生命周期第二行计入名称避让盒（第三十二轮，名称互压根因修复））
  const labelPlan = useMemo(
    () =>
      buildLabelPlan({
        geom,
        series,
        granularity,
        priceTypes,
        endpointMarks,
        lifecycleRow: (key) => lifecycleDeltas.get(key) != null,
      }),
    [geom, series, granularity, priceTypes, endpointMarks, lifecycleDeltas],
  );

  // ---- ECharts option（值轴隐藏，数据喂归一化伪值；纯构建见 chartModel.buildOption）----
  // focusKey（第三十二轮聚焦模式）：非聚焦系列降透明 0.15、数值标签隐藏
  const option = useMemo(
    () => buildOption({ geom, series, priceTypes, granularity, labelPlan, gridTop, endpointMarks, focusKey }),
    [geom, series, priceTypes, granularity, labelPlan, gridTop, endpointMarks, focusKey],
  );

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
      setFocusKey(null);
      if (el) el.style.cursor = 'default';
      return;
    }
    if (!hit) {
      setHoverIdx(null);
      setFocusKey(null);
      if (el) el.style.cursor = 'default';
      return;
    }
    setHoverIdx(hit.idx);
    // 聚焦检测（第三十二轮）：悬停列上最近的有值系列（±HIT_PX）→ 高亮该系列；
    // 空白处悬停 = 取消聚焦（全部系列恢复常态）
    if (focusMode && geom) {
      let bestKey: string | null = null;
      let bestD = Number.POSITIVE_INFINITY;
      for (const s of series) {
        const v = primaryPriceOf(s.points[hit.idx], priceTypes);
        if (v == null) continue;
        const d = Math.abs(hit.my - yPxOf(geom, v));
        if (d < bestD) {
          bestD = d;
          bestKey = s.key;
        }
      }
      setFocusKey(bestKey != null && bestD <= HIT_PX ? bestKey : null);
    }
    if (el) el.style.cursor = 'pointer'; // 点击可锁定/解锁该时间列
  };

  const onMouseLeave = (): void => {
    setHoverIdx(null);
    setFocusKey(null);
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
        const v = primaryPriceOf(s.points[hit.idx], priceTypes);
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

  // ---- offer 图标与端点徽标的几何（纯构建见 chartModel） ----
  const offerMarkers = useMemo(
    () => buildOfferMarkers({ enabled: props.enableOffer, geom, series }),
    [props.enableOffer, geom, series],
  );
  const endpointBadges = useMemo(
    () => buildEndpointBadges({ geom, series, marks: endpointMarks, priceTypes }),
    [geom, series, endpointMarks, priceTypes],
  );

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

  // ---- DOM 刻度/断轴/档位带数据（纯构建见 chartModel） ----
  // 左缘布局：[档位带(仅USD)][刻度列][名称预留带][绘图区]（滑杆已移至工具行，不占左缘）
  const tierPart = currency === 'usd' ? TIER_BAND_W + TIER_BAND_GAP : 0;
  const tickW = geom ? Math.max(34, geom.gridLeft - tierPart - NAME_ZONE_W) : 44;
  const tierLeft = geom ? geom.gridLeft - NAME_ZONE_W - tickW - TIER_BAND_GAP - TIER_BAND_W : 0;
  const tickRows = useMemo(() => buildTickRows(geom), [geom]);

  // 有值档位过滤（第八轮）：完全不存在该价格档位的数据时不显示该档（用户反馈 400~600 空档）
  const tierValues = useMemo(() => collectTierValues(series, priceTypes), [series, priceTypes]);

  const showTierBand = currency === 'usd' && geom != null;
  const tierBoxes = useMemo(
    () => buildTierBoxes({ enabled: showTierBand, geom, tierValues }),
    [showTierBand, geom, tierValues],
  );

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
          {/* 轴单位 + Y 轴显示设置（第十二轮起）：币种符号与齿轮组成同组居中，
              两种币种下符号↔齿轮间距恒为 6px；弹层内含伸缩滑杆、刻度线开关与断轴省略号开关
              （第十六轮：placement 改 bottomLeft，弹层与齿轮左对齐不再向左溢出） */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: Math.max(gridTop - 36, 0),
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
              placement="bottomLeft"
              content={
                <div style={{ width: 236 }}>
                  <div style={{ fontSize: 12, color: color.mute, marginBottom: 8 }}>每格高度（不改 Y 轴刻度值）</div>
                  <ScaleSlider scale={sliderScale} onCommit={commitSliderScale} />
                  <div style={{ fontSize: 11, color: color.mute, marginTop: 8 }}>拖动后松手生效；双击滑杆复位 ×1.00</div>
                  <div style={{ borderTop: `1px solid ${color.hairline}`, margin: '10px 0' }} />
                  <Checkbox checked={showYTicks} onChange={(e) => setShowYTicks(e.target.checked)}>
                    <span style={{ fontSize: 12 }}>显示 Y 刻度线</span>
                  </Checkbox>
                  <div style={{ marginTop: 6 }}>
                    <Checkbox checked={yCompress} onChange={(e) => commitYCompress(e.target.checked)}>
                      <span style={{ fontSize: 12 }}>Y 轴自动压缩</span>
                    </Checkbox>
                    <div style={{ fontSize: 11, color: color.mute, marginTop: 4, lineHeight: '16px' }}>
                      值簇间空白压成断轴；取消后 Y 轴完全连续展示
                    </div>
                  </div>
                </div>
              }
            >
              <button
                type="button"
                title="Y 轴显示设置（每格高度伸缩 / 刻度线显隐 / Y 轴自动压缩）"
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
          {/* 聚焦模式提示（第三十二轮）：与左侧币种/齿轮同排的右侧空白区——
              放在 X 轴标签行会与末位桶标签重叠 */}
          {focusMode && (
            <div
              style={{
                position: 'absolute',
                right: 8,
                top: Math.max(gridTop - 36, 0),
                fontSize: fontSize.caption,
                lineHeight: '16px',
                color: color.mute,
                pointerEvents: 'none',
                zIndex: 3,
              }}
            >
              已选 {series.length} 个系列 · 悬停折线聚焦单系列
            </div>
          )}
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
                {t.text}
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
                {/* 轴上纵向省略号（⋮）：刻度列居中（「Y 轴自动压缩」关闭 = 不产生断轴，自然无符号） */}
                {
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
                }
              </div>
            );
          })}
          {/* 档位带（仅 USD）：Y 轴左侧档位框，框住对应刻度区段（如 200~400 框住 200..400）；
              无数据的档 = 虚线占位（第三十二轮，梯子连续可读）；本币不渲染；图隐藏（空态）时整块消失 */}
          {showTierBand &&
            tierBoxes.map((tb, i) => (
              <div
                key={`tier-${tb.label}-${i}`}
                title={`价格档位 ${tb.label}（USD）${tb.empty ? '· 当前无产品' : ''}`}
                style={{
                  position: 'absolute',
                  left: tierLeft,
                  top: tb.top,
                  width: TIER_BAND_W,
                  height: tb.h,
                  boxSizing: 'border-box',
                  border: tb.empty ? `1px dashed ${color.hairline}` : `1px solid ${color.hairline}`,
                  background: tb.empty ? 'transparent' : i % 2 === 0 ? color.canvasSoft2 : color.canvasSoft,
                  display: 'grid',
                  placeItems: 'center',
                  overflow: 'hidden',
                  pointerEvents: 'none',
                  zIndex: 1,
                }}
              >
                {tb.h >= 16 && (
                  <span
                    style={{
                      fontSize: 10,
                      lineHeight: '12px',
                      color: tb.empty ? color.mute : color.body,
                      whiteSpace: 'nowrap',
                    }}
                  >
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
              ‹/›=窗口边缘续接点（白底品牌描边+外向箭头），数据在窗口外延续。
              聚焦模式（第三十二轮）：非聚焦系列降透明 */}
          {endpointBadges.map((b) => {
            const big = b.kind === 'S' || b.kind === 'E';
            const dim = focusActive && b.key.split('|')[0] !== focusKey;
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
                  opacity: dim ? 0.15 : undefined,
                }}
              >
                {b.kind === 'in' ? '‹' : b.kind === 'out' ? '›' : b.kind}
              </div>
            );
          })}
          {/* 系列名（起点旁 13px / 名称预留带 12px 两行换行，前置品牌色小点；
              zIndex 9 = 全图层最上，白描边保证不被任何元素遮挡）。
              第二十七轮：季粒度下名称下方第二行 = 生命周期调价幅度（统显「生命周期 −X%」，
              第二十九轮起不再带「暂」；恒本币、锚在数据）。
              第三十二轮：①第二行计入避让盒（计划盒 = 渲染盒，不再自行上移 7px）；
              ②聚焦模式（>FOCUS_MODE_THRESHOLD 系列）名称退场，仅聚焦系列回归 */}
          {(() => {
            const visibleNames = focusMode
              ? labelPlan.names.filter((nm) => nm.seriesKey === focusKey)
              : labelPlan.names;
            return (
              <>
                {/* 名称引线（第三十二轮）：避让推离锚点超 NAME_LEADER_PX 时画细线连回首点，
                    消除"标签塔读不出哪条线是谁"的归属歧义（zIndex 8 = 徽标层，名称之下） */}
                <svg
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    pointerEvents: 'none',
                    zIndex: 8,
                  }}
                >
                  {visibleNames
                    .filter((nm) => Math.abs(nm.dy) > NAME_LEADER_PX)
                    .map((nm) => (
                      <line
                        key={`ld-${nm.seriesKey}`}
                        x1={nm.x + nm.w + 3}
                        y1={nm.y + nm.h / 2}
                        x2={nm.anchorX - 8}
                        y2={nm.anchorY}
                        stroke={color.hairlineStrong}
                        strokeWidth={1}
                        opacity={0.9}
                      />
                    ))}
                </svg>
                {visibleNames.map((nm) => {
                  const delta = lifecycleDeltas.get(nm.seriesKey) ?? null;
                  const pctLabel = delta
                    ? (delta.pct < 0 ? '−' : delta.pct > 0 ? '+' : '±') + Math.abs(delta.pct * 100).toFixed(1) + '%'
                    : '';
                  const nameRow = (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
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
                  );
                  return (
                    <div
                      key={`nm-${nm.seriesKey}`}
                      title={nm.text}
                      style={{
                        position: 'absolute',
                        left: nm.x,
                        top: nm.y, // 计划盒 = 渲染盒（含生命周期第二行），第三十二轮起不再偏移
                        display: 'flex',
                        flexDirection: delta ? 'column' : 'row',
                        alignItems: delta ? 'flex-start' : 'center',
                        gap: delta ? 1 : 4,
                        fontSize: nm.maxW != null ? ZONE_FONT : NAME_FONT_SIZE,
                        fontWeight: 600,
                        lineHeight: nm.maxW != null ? `${ZONE_LINE_H}px` : `${NAME_LINE_HEIGHT}px`,
                        color: nm.color,
                        whiteSpace: 'nowrap',
                        pointerEvents: 'none',
                        zIndex: 9,
                        opacity: focusActive && nm.seriesKey !== focusKey ? 0.2 : undefined,
                        textShadow: '0 1px 0 #fff, 0 -1px 0 #fff, 1px 0 0 #fff, -1px 0 0 #fff',
                        ...(nm.maxW != null ? { maxWidth: nm.maxW } : null),
                      }}
                    >
                      {nameRow}
                      {delta && (
                        <span style={{ paddingLeft: 13, fontSize: 11, lineHeight: '13px', whiteSpace: 'nowrap' }}>
                          <span style={{ color: color.mute, fontWeight: 500 }}>
                            生命周期{' '}
                          </span>
                          <span style={{ color: color.ink, fontWeight: 700, fontFamily: font.family }}>{pctLabel}</span>
                        </span>
                      )}
                    </div>
                  );
                })}
              </>
            );
          })()}
          {/* offer 图标（仅周视图；点击浮窗） */}
          {offerMarkers.map((m) => (
            <OfferPopover key={m.key} x={m.x} y={m.y} offer={m.offer} />
          ))}
          {/* 悬停跳转取证（仅周视图；空心点不可跳）；聚焦模式非聚焦系列降透明 */}
          {props.enableJump &&
            hoverIdx != null &&
            series.map((s) => {
              const p = s.points[hoverIdx];
              if (!p || p.missing || p.price == null || !p.url) return null;
              const dim = focusActive && s.key !== focusKey;
              return (
                <span key={`jp-${s.key}`} style={{ opacity: dim ? 0.15 : undefined }}>
                  <JumpIcon x={xPxOf(geom, hoverIdx)} y={yPxOf(geom, p.price)} url={p.url} />
                </span>
              );
            })}
          {/* 悬停下钻（仅月/季，第二十轮）：悬停竖线上的有值点变白底黑「下钻」图标
              （同周视图跳转图标款式），点击 = 下钻该期间（与圈点点击同一 onDrill）；
              聚焦模式非聚焦系列降透明 */}
          {props.enableDrill &&
            props.onDrill &&
            hoverIdx != null &&
            series.map((s) => {
              const p = s.points[hoverIdx];
              const v = p ? primaryPriceOf(p, priceTypes) : null;
              if (v == null) return null;
              const dim = focusActive && s.key !== focusKey;
              return (
                <span key={`dl-${s.key}`} style={{ opacity: dim ? 0.15 : undefined }}>
                  <DrillIcon
                    x={xPxOf(geom, hoverIdx)}
                    y={yPxOf(geom, v)}
                    title={granularity === 'quarter' ? '下钻查看该季月度趋势' : '下钻查看该月周度趋势'}
                    onClick={() => props.onDrill!(s.key, p.bucketId)}
                  />
                </span>
              );
            })}
        </>
      )}
      {/* 钉顶卡片（常驻图例卡：悬停列/锁定列=该列明细态；移出后/指针在卡片区=图例态，
          已锁定则保持锁定列明细不消失）。全系列隐藏时 geom 为 null → 用回退几何保持卡片可点（恢复入口）。
          showLegendCards=false（下钻弹窗）不渲染 */}
      {props.showLegendCards !== false && (geom || legendFallback) && (
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
