// ============================================================
// Chart 纯计算层（第十八轮抽离）：几何 / 标签避让计划 / 端点标记 /
// ECharts option 构建 / DOM 刻度与档位带数据。全部是显式入参 → 显式输出的
// 纯函数（无 hooks、无副作用、同输入同输出），Chart.tsx 只做 useMemo 调用与渲染。
// 抽离为机械搬移：逐行对应原 Chart.tsx 的同名 useMemo，行为不变；
// 金测（chartModel.golden.test.ts）以快照+不变量钉住 17 轮迭代沉淀的边界行为。
// ============================================================
import type { EChartsOption } from 'echarts';
import type { CurrencyMode, Granularity, OfferInfo, Series, SeriesPoint } from '../../dataModel/types';
import { color, font, fontSize } from '../../theme/tokens';
import {
  GRID,
  NAME_ZONE_W,
  DEFAULT_TIERS,
  collectVisibleValues,
  estGridLeft,
  fmtAxisTick,
  fmtInt,
  gapAbsorbedIdx,
  gapRuns,
  resolveCollisions,
  segTicks,
  weekLabeledIdx,
  xPxOf,
  yNormOf,
  yPxOf,
  type AvoidItem,
  type AvoidResult,
  type Geom,
  type YScale,
} from './helpers';

// ---------------- 共享类型与排版常量（Chart 渲染层也用） ----------------

export type PriceTypes = { discounted: boolean; rrp: boolean };
export type SeriesMark = 'S' | 'E' | 'in' | 'out';
export type SeriesNameItem = AvoidResult['names'][number];

export const LABEL_DISTANCE = 4;
export const LABEL_LINE_HEIGHT = 20;
/** 端点徽标点的标签距离（第二十轮）：徽标直径 15px（S/E）/13px（‹›）大于普通符号 7px，
 *  canvas 标签需让出徽标半径再留呼吸位，否则标签下缘压进徽标 */
export const endpointLabelDistance = (kind: SeriesMark): number => (kind === 'S' || kind === 'E' ? 12 : 10);
export const NAME_FONT_SIZE = 13;
export const NAME_LINE_HEIGHT = 18;
const NAME_LOGO_W = 12; // 系列名前置品牌色小点（8px）+ 间距 4，避让宽度估算用
export const ZONE_FONT = 12; // 名称预留带内字号（小一号）+ 两行换行
export const ZONE_LINE_H = 16;
/** 生命周期第二行占高（第三十二轮）：11px 字号 13px 行高 + 行距 1——
 *  必须计入名称避让盒，否则相邻名称互压 ~14px（用户底线：名称互不遮挡） */
export const LIFECYCLE_ROW_H = 14;
/** 聚焦模式阈值（第三十二轮）：系列数 > 阈值时图面名称/生命周期行退场，
 *  识别走「悬停折线高亮单系列」+ 钉顶图例卡——0 个常驻名称 = 0 遮挡 */
export const FOCUS_MODE_THRESHOLD = 8;
/** 名称被避让推离锚点超过该像素 → 画细引线连回首点（第三十二轮） */
export const NAME_LEADER_PX = 14;

/** 曲线上的系列名（第十轮）：去品牌前缀（品牌由色点/图例卡表达）+ 去容量后缀 GB/TB */
export function curveNameOf(s: Series): string {
  const bp = `${s.brand} `;
  const noBrand = s.label.startsWith(bp) ? s.label.slice(bp.length) : s.label;
  return noBrand.replace(/\s*(GB|TB)$/i, '').trim();
}

/** 主价线：折后价优先；仅勾 RRP 时 RRP 成为主价线（标签/下钻/跳转跟随） */
export function primaryPriceOf(p: SeriesPoint, priceTypes: PriceTypes): number | null {
  return priceTypes.discounted ? p.price : p.rrp;
}

/** 月/季桶的 P1 候选（第三十二轮）：标签文案（fmtInt 口径）发生变化的首个点。
 *  桶聚合值几乎逐桶微动，旧口径「全部点都试放」在长窗口下制造数值噪声；
 *  与周视图 weekLabeledIdx 同构，只是比较口径 = 显示值而非原始值。 */
export function bucketLabeledIdx(pts: SeriesPoint[], priceTypes: PriceTypes): Set<number> {
  const out = new Set<number>();
  let last: string | null = null;
  pts.forEach((pt, i) => {
    const v = primaryPriceOf(pt, priceTypes);
    if (v == null) return;
    const text = fmtInt(v);
    if (last == null || text !== last) out.add(i);
    last = text;
  });
  return out;
}

// ---------------- 高度过渡帧的显示模型（第十一轮动画的等比缩放） ----------------

/** 动画期间按比例 k 缩放整段纵向几何（段 pTop/pH、断裂条中心、plotHeight）——
 *  yPxOf/yNormOf 只依赖这些字段，canvas 伪值与 DOM 覆盖层天然同源跟随 */
export function scaleToDisplay(scale: YScale, k: number): YScale {
  if (k === 1) return scale;
  return {
    ...scale,
    plotHeight: scale.plotHeight * k,
    segs: scale.segs.map((s) => ({ ...s, pTop: s.pTop * k, pH: s.pH * k })),
    breaks: scale.breaks.map((b) => b * k),
  };
}

// ---------------- 几何（grid 纯公式复现，DOM 与 canvas 同源） ----------------

/** 容器过窄/无数据/放不下左缘布局 → null（图退化为空态，图例卡走回退几何） */
export function buildGeom(p: {
  width: number;
  totalH: number;
  gridTop: number;
  series: Series[];
  scale: YScale;
  currency: CurrencyMode;
  gridLeft?: number;
}): Geom | null {
  const n = p.series[0]?.points.length ?? 0;
  if (!p.width || p.width < 160 || n === 0 || p.totalH < 160) return null;
  const gl = p.gridLeft ?? estGridLeft(p.scale.max, p.currency, p.scale.interval);
  if (gl + GRID.right > p.width - 48) return null;
  return {
    gridLeft: gl,
    plotLeft: gl,
    plotTop: p.gridTop,
    plotWidth: p.width - gl - GRID.right,
    plotHeight: p.scale.plotHeight,
    scale: p.scale,
    n,
  };
}

// ---------------- 端点标记（第十三轮引入、第十四轮改为 DOM 徽标） ----------------

/** S = 真实开头（该段连续有值区间的首点）；E = 真实截止（其后连续 3 个区间均无值才
 *  确认——数据末端/最新批次一律不标 E）；in/out = 窗口左/右缘的续接点（窗口外
 *  2 周内仍有数据，非真实首尾）。key = `${seriesKey}|${pointIdx}` */
export function buildEndpointMarks(series: Series[]): Map<string, SeriesMark> {
  const marks = new Map<string, SeriesMark>();
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
      // 其后连续 3 个区间都无值才确认截止；数据末端观察不足 3 个区间，不标 E
      return i + 3 < n && val(i + 1) == null && val(i + 2) == null && val(i + 3) == null;
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
}

// ---------------- 标签避让计划（价格标签 dy + 系列名位置 + 可见集） ----------------
// 自适应规则（长窗口数值防叠）：
// P0 必放 = 每系列首个/末个有值点 + 窗口内最大/最小（形状锚点，冲突时纵向推挤）+ S/E；
//   第三十二轮：系列数超聚焦阈值时最大/最小降为 P1（冲突即隐）——多系列下
//   每系列 4~6 个必放标签会堆出脱离曲线的数值塔；
// P1 候选 = 变价点（周）/ 显示值变化点（月/季，第三十二轮），期望位无冲突才显示；
// 系列名（第十轮）= 右缘锚在起点左侧 8px、随窗口平移连续左移；滑到名称预留带
// 左界即停驻带内（同一文案同一锚点语义，位置连续不跳变），折线永不进入预留带。
// 第三十二轮：季粒度生命周期第二行计入名称避让盒（LIFECYCLE_ROW_H），整个名称块
// 以锚点为中心——渲染层不再自行上移 7px，计划盒 = 渲染盒。

export interface LabelPlan {
  dy: Record<string, Record<number, number>>;
  names: SeriesNameItem[];
}

const EMPTY_LABEL_PLAN: LabelPlan = { dy: {}, names: [] };

export function buildLabelPlan(p: {
  geom: Geom | null;
  series: Series[];
  granularity: Granularity;
  priceTypes: PriceTypes;
  /** 端点标记（第二十轮）：S/E 点即使不是首末/极值（段中截止的 E）也必放数值标签 */
  endpointMarks: Map<string, SeriesMark>;
  /** 该系列是否渲染「生命周期 −X%」第二行（季粒度；第三十二轮起计入避让盒） */
  lifecycleRow?: (seriesKey: string) => boolean;
}): LabelPlan {
  if (!p.geom) return EMPTY_LABEL_PLAN;
  const { geom, series, granularity, priceTypes, endpointMarks } = p;
  const items: AvoidItem[] = [];
  const nameW = (t: string): number => NAME_LOGO_W + t.length * (NAME_FONT_SIZE * 0.62) + 6;
  const priceW = (t: string): number => t.length * (fontSize.bodySm * 0.62) + 8;
  // 多系列（超聚焦阈值）：最大/最小从必放降为候选——必放项只保留首/末/S/E
  const demoteExtremes = series.length > FOCUS_MODE_THRESHOLD;
  for (const s of series) {
    const pts = s.points;
    const absorbed = gapAbsorbedIdx(pts); // 孤立有值周不产生数值标签（第二十四轮）
    const valIdx: number[] = [];
    pts.forEach((pt, i) => {
      if (primaryPriceOf(pt, priceTypes) != null) valIdx.push(i);
    });
    if (valIdx.length === 0) continue;
    let maxI = valIdx[0];
    let minI = valIdx[0];
    for (const i of valIdx) {
      if ((primaryPriceOf(pts[i], priceTypes) ?? 0) > (primaryPriceOf(pts[maxI], priceTypes) ?? 0)) maxI = i;
      if ((primaryPriceOf(pts[i], priceTypes) ?? 0) < (primaryPriceOf(pts[minI], priceTypes) ?? 0)) minI = i;
    }
    const p0 = new Set<number>([valIdx[0], valIdx[valIdx.length - 1]]);
    if (!demoteExtremes) {
      p0.add(maxI);
      p0.add(minI);
    }
    // 端点标记点（S/E）必放（第二十轮）：E 是"段中真实截止"时未必是首末/极值，
    // 单独并入 P0，保证 S/E 徽标旁恒有数值
    const markOf = (i: number): SeriesMark | undefined => endpointMarks.get(`${s.key}|${i}`);
    for (const i of valIdx) {
      const mk = markOf(i);
      if (mk === 'S' || mk === 'E') p0.add(i);
    }
    const change = granularity === 'week'
      ? weekLabeledIdx(pts, !priceTypes.discounted)
      : bucketLabeledIdx(pts, priceTypes);
    if (demoteExtremes) {
      change.add(maxI);
      change.add(minI);
    }
    const pushPrice = (i: number, pinned: boolean, dist: number = LABEL_DISTANCE): void => {
      if (absorbed.has(i)) return;
      const v = primaryPriceOf(pts[i], priceTypes);
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
        top: yPxOf(geom, v) - dist - LABEL_LINE_HEIGHT,
        h: LABEL_LINE_HEIGHT,
        text,
        color: color.ink,
      });
    };
    p0.forEach((i) => {
      const mk = markOf(i);
      pushPrice(i, true, mk ? endpointLabelDistance(mk) : LABEL_DISTANCE);
    });
    valIdx.forEach((i) => {
      if (p0.has(i)) return;
      const mk = markOf(i);
      if (change.has(i)) pushPrice(i, false, mk ? endpointLabelDistance(mk) : LABEL_DISTANCE);
    });
    // 系列名（第十轮）：文案去品牌前缀 + 去容量后缀（GB/TB）——品牌由色点/图例卡表达。
    // 位置 = 右缘锚在起点左侧连续滑动；besideLeft 触到带左界 → 停驻带内（左对齐，
    // 仅当名宽超出带宽才换两行）——切换瞬间 left 恒等于 zoneLeft，无位置跳变。
    // 第三十二轮：生命周期第二行计入盒高，整块以锚点纵向居中（含引导线所需锚点）。
    const fi = valIdx[0];
    const v0 = primaryPriceOf(pts[fi], priceTypes) ?? 0;
    const px = xPxOf(geom, fi);
    const py = yPxOf(geom, v0);
    const nameText = curveNameOf(s);
    const nw = nameW(nameText);
    const zoneLeft = geom.plotLeft - NAME_ZONE_W + 4;
    const besideLeft = px - 8 - nw;
    const useZone = besideLeft < zoneLeft;
    const zoneBoxW = Math.min(nw, NAME_ZONE_W - 8);
    const zoneLines = nw > NAME_ZONE_W - 8 ? 2 : 1;
    const baseH = useZone ? zoneLines * ZONE_LINE_H : NAME_LINE_HEIGHT;
    const fullH = p.lifecycleRow?.(s.key) ? baseH + LIFECYCLE_ROW_H : baseH;
    items.push({
      kind: 'name',
      seriesKey: s.key,
      pointIdx: fi,
      pinned: true,
      left: useZone ? zoneLeft : besideLeft,
      right: useZone ? zoneLeft + zoneBoxW : px - 8,
      top: py - fullH / 2,
      h: fullH,
      text: nameText,
      color: s.color,
      maxW: useZone ? zoneBoxW : undefined,
      anchorX: px,
      anchorY: py,
    });
  }
  const res = resolveCollisions(items, geom.plotTop);
  return { dy: res.dy, names: res.names };
}

// ---------------- ECharts option（值轴隐藏，数据喂归一化伪值） ----------------

export function buildOption(p: {
  geom: Geom | null;
  series: Series[];
  priceTypes: PriceTypes;
  granularity: Granularity;
  labelPlan: LabelPlan;
  gridTop: number;
  endpointMarks: Map<string, SeriesMark>;
  /** 聚焦模式（第三十二轮）：非聚焦系列整体降透明 0.15、数值标签隐藏；
   *  null/缺省 = 无聚焦，输出与旧口径逐字段一致 */
  focusKey?: string | null;
}): EChartsOption | null {
  if (!p.geom) return null;
  const { geom, series, priceTypes, granularity, labelPlan, gridTop, endpointMarks } = p;
  const first = series[0];
  if (!first) return null;
  const focusOn = p.focusKey != null;
  const xLabels = first.points.map((pt) => pt.xLabel);
  const lineWidth = (s: Series): number => (s.isOwn ? 3 : 2);
  const sArr: Record<string, unknown>[] = [];

  for (const s of series) {
    const dyMap = labelPlan.dy[s.key] ?? {};
    const dim = focusOn && s.key !== p.focusKey; // 聚焦高亮：其余系列降透明
    if (priceTypes.discounted) {
      // 端点（第十四轮徽标 + 第二十轮修复）：带标记的点不再画默认符号——改用
      // symbolSize 0 而非 symbol 'none'（ECharts 的 line 标签画在符号元素上，
      // symbol 'none' 会连数值标签一起吞掉；size 0 只隐符号、标签照常渲染）。
      // 被跨接段吸收的孤立有值周同样不画点（第二十四轮：标签在 buildLabelPlan 一并抑制）
      const absorbed = gapAbsorbedIdx(s.points);
      const data = s.points.map((pt, i) => {
        const mark = endpointMarks.get(`${s.key}|${i}`);
        return {
          value: pt.price != null ? yNormOf(geom, pt.price) : null,
          symbolSize: mark || absorbed.has(i) ? 0 : undefined,
          label: {
            show: pt.price != null && !dim && dyMap[i] !== undefined,
            position: 'top' as const,
            distance: mark ? endpointLabelDistance(mark) : LABEL_DISTANCE,
            offset: [0, dyMap[i] ?? 0],
            color: color.ink,
            fontSize: fontSize.bodySm,
            fontWeight: 400,
            fontFamily: font.family,
            lineHeight: LABEL_LINE_HEIGHT,
            formatter: pt.price != null ? fmtInt(pt.price) : '',
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
        itemStyle: { color: color.canvas, borderColor: s.color, borderWidth: 2, ...(dim ? { opacity: 0.15 } : {}) },
        lineStyle: { color: s.color, width: lineWidth(s), ...(dim ? { opacity: 0.15 } : {}) },
        z: 12,
        silent: true,
      });
      // 缺采跨接段：仅虚线桥接（第二十四轮：撤销空心插值点——未抓取的周不再展示
      // 数据点，跨接语义完全由虚线承担；曲线自然跨接不中断）
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
          lineStyle: { color: s.color, width: lineWidth(s), type: [4, 4], opacity: dim ? 0.15 : 0.9 },
          z: 11,
          silent: true,
        });
      }
    }
    if (priceTypes.rrp) {
      // 两价同选不标 RRP（避免重复）；仅 RRP 时 = 主价线，可见集与折后价同源（避让后 dy）
      const rdata = s.points.map((pt, i) => ({
        value: pt.rrp != null ? yNormOf(geom, pt.rrp) : null,
        label: {
          show: !dim && !priceTypes.discounted && pt.rrp != null && dyMap[i] !== undefined,
          position: 'top' as const,
          distance: LABEL_DISTANCE,
          offset: [0, dyMap[i] ?? 0],
          color: color.ink,
          fontSize: fontSize.bodySm,
          fontWeight: 400,
          fontFamily: font.family,
          lineHeight: LABEL_LINE_HEIGHT,
          formatter: pt.rrp != null ? fmtInt(pt.rrp) : '',
        },
      }));
      sArr.push({
        type: 'line',
        data: rdata,
        step: 'end',
        // symbolSize 0（第二十轮修复）：原 symbol 'none' 会让 ECharts 吞掉整条系列的
        // 数值标签（仅 RRP 模式下一个标签都不渲染）；size 0 只隐符号
        symbolSize: 0,
        connectNulls: false,
        lineStyle: { color: s.color, width: s.isOwn ? 2 : 1.5, type: [6, 4], opacity: dim ? 0.15 : 0.75 },
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
}

// ---------------- DOM 覆盖层数据（刻度/端点徽标/offer 图标/档位带） ----------------

/** offer 图标：按 offer.title 分组取首周（窗口内） */
export function buildOfferMarkers(p: {
  enabled: boolean | undefined;
  geom: Geom | null;
  series: Series[];
}): { key: string; x: number; y: number; offer: OfferInfo }[] {
  if (!p.enabled || !p.geom) return [];
  const out: { key: string; x: number; y: number; offer: OfferInfo }[] = [];
  for (const s of p.series) {
    const seen = new Set<string>();
    s.points.forEach((pt, i) => {
      if (!pt.offer || pt.price == null || seen.has(pt.offer.title)) return;
      seen.add(pt.offer.title);
      out.push({ key: `${s.key}|${pt.offer.title}|${i}`, x: xPxOf(p.geom!, i), y: yPxOf(p.geom!, pt.price), offer: pt.offer });
    });
  }
  return out;
}

/** 端点徽标几何（第十四轮 + 第二十轮口径跟随）：S/E = 实心品牌色圆内白字（稍大于普通点）；
 *  ‹/› = 窗口边缘续接点（白底品牌描边 + 外向箭头），替代原灰色延长线。
 *  位置跟随主价线（primaryPriceOf）：仅 RRP 时贴 RRP 虚线，不再钳在折后价的轴外 */
export function buildEndpointBadges(p: {
  geom: Geom | null;
  series: Series[];
  marks: Map<string, SeriesMark>;
  priceTypes: PriceTypes;
}): { key: string; x: number; y: number; kind: SeriesMark; color: string }[] {
  if (!p.geom) return [];
  const out: { key: string; x: number; y: number; kind: SeriesMark; color: string }[] = [];
  for (const s of p.series) {
    s.points.forEach((pt, i) => {
      const kind = p.marks.get(`${s.key}|${i}`);
      const v = kind ? primaryPriceOf(pt, p.priceTypes) : null;
      if (!kind || v == null) return;
      out.push({ key: `${s.key}|${i}`, x: xPxOf(p.geom!, i), y: yPxOf(p.geom!, v), kind, color: s.color });
    });
  }
  return out;
}

/** DOM 刻度线行：各段的 interval 整数倍刻度 + 绝对 y 像素 + 步长感知缩写文案
 *  （第二十二轮：50 步长在 K 级曾是 1.05K/1.1K/1.15K 三档同显 1.1K） */
export function buildTickRows(geom: Geom | null): { v: number; y: number; text: string }[] {
  if (!geom) return [];
  const out: { v: number; y: number; text: string }[] = [];
  for (const seg of geom.scale.segs) {
    for (const v of segTicks(seg, geom.scale.interval)) {
      out.push({ v, y: yPxOf(geom, v), text: fmtAxisTick(v, geom.scale.interval) });
    }
  }
  return out;
}

/** 当前显示口径下全部价格值（两价同收，档位带有无数据以此判定） */
export function collectTierValues(series: Series[], priceTypes: PriceTypes): number[] {
  return collectVisibleValues(series, priceTypes);
}

/** 档位带按段裁剪：档位只画在与其值域相交的段上（跨断裂的档不会画出"跨越"错觉）。
 *  第三十二轮：完全无数据的档不再整档消失——标记 empty 交渲染层画虚线占位框
 *  （第八轮"空档不画"针对的是实心框像数据区；相邻档都在时缺一档读起来像 bug，
 *  虚线+透明占位无此歧义且保持梯子连续可读） */
export function buildTierBoxes(p: {
  enabled: boolean;
  geom: Geom | null;
  tierValues: number[];
}): { label: string; top: number; h: number; empty: boolean }[] {
  if (!p.enabled || !p.geom) return [];
  const out: { label: string; top: number; h: number; empty: boolean }[] = [];
  for (const tier of DEFAULT_TIERS) {
    const tHi = tier.max ?? Number.POSITIVE_INFINITY;
    const hasData = p.tierValues.some((v) => v >= tier.min && v < tHi);
    for (const seg of p.geom.scale.segs) {
      const lo = Math.max(tier.min, seg.min);
      const hi = Math.min(tHi, seg.max); // tHi=∞（1000+ 档）时即 seg.max
      if (lo >= hi - 1e-9) continue;
      const top = yPxOf(p.geom, hi);
      const h = yPxOf(p.geom, lo) - top;
      if (h < 2) continue;
      out.push({ label: tier.label, top, h, empty: !hasData });
    }
  }
  return out;
}
