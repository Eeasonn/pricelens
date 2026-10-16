// ============================================================
// Chart 纯计算层（第十八轮抽离）：几何 / 标签避让计划 / 端点标记 /
// ECharts option 构建 / DOM 刻度与档位带数据。全部是显式入参 → 显式输出的
// 纯函数（无 hooks、无副作用、同输入同输出），Chart.tsx 只做 useMemo 调用与渲染。
// 抽离为机械搬移：逐行对应原 Chart.tsx 的同名 useMemo，行为不变；
// 金测（chartModel.golden.test.ts）以快照+不变量钉住 17 轮迭代沉淀的边界行为。
// ============================================================
import type { EChartsOption } from 'echarts';
import type { CurrencyMode, DimPromo, Granularity, OfferDetail, OfferInfo, OfferKind, Series, SeriesPoint } from '../../dataModel/types';
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

/** 折线形态三选一（第五十四轮追补③，齿轮）：auto = 自适应粒度——周=阶梯
 *  （逐周跳变语义），月/季=平滑（聚合值是期内均值，方形阶梯会把均值画成平台跳变，
 *  失真）；缺省 auto（用户定版）。step/smooth = 强制指定 */
export type LineShapeChoice = 'auto' | 'step' | 'smooth';

/** 三态选择 → buildOption 的二元形态（auto 按粒度解析） */
export function resolveLineShape(choice: LineShapeChoice, gran: Granularity): 'step' | 'smooth' {
  if (choice === 'auto') return gran === 'week' ? 'step' : 'smooth';
  return choice;
}

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
  /** 折线形态（第三十八轮，齿轮可选）：step=方形阶梯（默认，价格在期内恒定）；
   *  smooth=平滑曲线（最初形态）。只换线形，数据/标签/避让不受影响 */
  lineShape?: 'step' | 'smooth';
}): EChartsOption | null {
  if (!p.geom) return null;
  const { geom, series, priceTypes, granularity, labelPlan, gridTop, endpointMarks } = p;
  const first = series[0];
  if (!first) return null;
  const focusOn = p.focusKey != null;
  const xLabels = first.points.map((pt) => pt.xLabel);
  const lineWidth = (s: Series): number => (s.isOwn ? 3 : 2);
  const shape = p.lineShape === 'smooth'
    ? ({ smooth: true, smoothMonotone: 'x' as const } as const)
    : ({ step: 'end' as const } as const); // 第三十六轮：方形阶梯（Keepa 式，跳变发生在新价点横轴位置）
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
            color: s.color, // 第四十二轮：数值标签跟品牌色
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
        ...shape,
        connectNulls: false,
        // 数据点圆点删除（第三十八轮）：悬停浮窗承担点检视，线面更干净；
        // symbolSize 0 而非 symbol 'none'（第二十轮教训：'none' 会吞数值标签）
        symbolSize: 0,
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
          ...shape, // 与主价线同形态
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
          color: s.color, // 第四十二轮：数值标签跟品牌色
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
        ...shape,
        // symbolSize 0（第二十轮修复）：原 symbol 'none' 会让 ECharts 吞掉整条系列的
        // 数值标签（仅 RRP 模式下一个标签都不渲染）；size 0 只隐符号
        symbolSize: 0,
        connectNulls: false,
        // 第五十二轮：RRP 改细实线（比折后价细一档，取代虚线）——账面价作参照线
        // 退居背景层，粗细对比表达「主价/参照」层级，不再用线型区分
        lineStyle: { color: s.color, width: s.isOwn ? 1.5 : 1, opacity: dim ? 0.15 : 0.85 },
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
      // 第四十七轮：margin 22 = 轴线下方先留出大促图标专用行（DOM 层图标带占
      // plotBottom+4~18），标签整体下移不再与图标贴近
      axisLabel: { interval: 'auto', hideOverlap: true, fontSize: 12, color: color.body, fontFamily: font.family, margin: 22 },
    },
    // 值轴整体隐藏（第七轮）：刻度线/标签/断裂符号/档位带全部 DOM 层绘制
    yAxis: { show: false, min: 0, max: 1 },
    series: sArr,
  } as unknown as EChartsOption;
}

// ---------------- DOM 覆盖层数据（刻度/端点徽标/offer 图标/档位带） ----------------

/** offer 三权益展开为列表（折扣→分期→赠品固定次序，第四十八轮） */
export function offerList(offer: OfferInfo | null | undefined): OfferDetail[] {
  if (!offer) return [];
  return [offer.discount, offer.installment, offer.gift].filter((d): d is OfferDetail => d != null);
}

/** 悬停摘要一行：「券 −10% · 6 期免息 · 赠无线耳机」 */
export function offerSummary(offer: OfferInfo | null | undefined): string {
  return offerList(offer)
    .map((d) => d.headline)
    .join(' · ');
}

/** 悬停浮窗结构化三字段行（第五十轮）：折扣/分期/赠品 各占一行（只出有值的字段），
 *  label 为固定类别名，text = 该权益的一眼短文案（headline） */
export function offerLineItems(
  offer: OfferInfo | null | undefined,
): { kind: OfferKind; label: string; text: string }[] {
  return offerList(offer).map((d) => ({
    kind: d.kind,
    label: d.kind === 'discount' ? '折扣' : d.kind === 'installment' ? '分期' : '赠品',
    text: d.headline,
  }));
}

/** offer 徽章：同一系列「同档期+同权益组合」只标首周（窗口内；原按 title 去重的口径，
 *  结构化后签名 = 档期+headline 集合） */
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
      const sig = offerList(pt.offer)
        .map((d) => `${d.promoName}|${d.headline}`)
        .join(';');
      if (!pt.offer || pt.price == null || seen.has(sig)) return;
      seen.add(sig);
      out.push({ key: `${s.key}|${sig}|${i}`, x: xPxOf(p.geom!, i), y: yPxOf(p.geom!, pt.price), offer: pt.offer });
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

// ---------------- 价格摘要条（第三十四轮：账面价 vs 成交价三件套） ----------------

/** 摘要条一项 = 一条系列某时点的三元组（折后价 / RRP / 折扣率）+ 竞品差价率 + 来源店铺 */
export interface PriceSummaryItem {
  key: string;
  brand: string;
  name: string; // curveNameOf 同款（去品牌前缀/容量后缀）
  color: string;
  isOwn: boolean;
  price: number | null; // 折后价
  rrp: number | null; // RRP（划线价）
  /** 折扣率 = price/rrp − 1（负 = 低于账面价）；两者不全或 rrp≤0 为 null */
  discount: number | null;
  /** 竞品专属：price 相对首个我司系列 price 的差价率（负 = 竞品比我便宜）；无我司基准为 null */
  diffVsOwn: number | null;
  asOf: string | null; // 该点的 xLabel（周=MM-DD / 月=YYYYMM / 季=YYYYQn）
  shop: string | null; // 该点来源店铺（来源口径随点走）
  url: string; // 取证跳转链接（摘要条「来源」超链接用）
}

/**
 * 摘要条纯计算（第三十四轮引入，第三十五轮扩展时点模式）：口径固定「折后价 vs RRP」，
 * 与图表 priceTypes 无关。
 * - atIdx 缺省 = 窗口内最后有值点（默认态「最新」）；
 * - atIdx 给定 = 悬停时点模式（迪总：划过图表摘要条显示所选时点）——固定取该下标，
 *   该时点无值的系列输出全 null 项（摘要条显示「—」）。
 */
export function buildPriceSummary(series: Series[], atIdx?: number | null): PriceSummaryItem[] {
  const items: PriceSummaryItem[] = series.map((s) => {
    let idx = -1;
    if (atIdx != null) {
      idx = atIdx >= 0 && atIdx < s.points.length ? atIdx : -1;
    } else {
      for (let i = s.points.length - 1; i >= 0; i--) {
        if (s.points[i].price != null || s.points[i].rrp != null) {
          idx = i;
          break;
        }
      }
    }
    const pt = idx >= 0 ? s.points[idx] : null;
    const price = pt?.price ?? null;
    const rrp = pt?.rrp ?? null;
    const discount = price != null && rrp != null && rrp > 0 ? price / rrp - 1 : null;
    return {
      key: s.key,
      brand: s.brand,
      name: curveNameOf(s),
      color: s.color,
      isOwn: s.isOwn,
      price,
      rrp,
      discount,
      diffVsOwn: null,
      asOf: pt?.xLabel ?? null,
      shop: pt?.shopName ?? null,
      url: pt?.url ?? '',
    };
  });
  const ownPrice = items.find((it) => it.isOwn && it.price != null)?.price ?? null;
  if (ownPrice != null && ownPrice > 0) {
    for (const it of items) {
      if (!it.isOwn && it.price != null) it.diffVsOwn = it.price / ownPrice - 1;
    }
  }
  return items;
}

// ---------------- 大促背景带（第三十四轮：俄区促销日历 → 图内时间带 + 图下事件行） ----------------

export interface PromoBand {
  key: string; // promo_id
  name: string; // 全名（事件卡用）
  shortName: string; // 带内缩写 = promo_name 首段（如「黑五」「11.11」「开学季」）
  depth: DimPromo['depth_hint'];
  startIdx: number; // 覆盖的首桶（窗口局部下标）
  endIdx: number; // 覆盖的末桶
  startFrac: number; // 首桶内左缘分数 [0,1)
  endFrac: number; // 末桶内右缘分数 (0,1]
  weeks: number; // 覆盖桶数（endIdx − startIdx + 1）
  dateText: string; // MM.DD–MM.DD
}

/**
 * 促销日历 → 窗口内时间带（第三十四轮）：桶覆盖区间由 bucketSpans 给出，promo 与桶按
 * 日期区间相交判定；边缘分数 = 相交天数 / 桶跨天数，渲染层据 (idx, frac) 换算像素。
 * 输出按 startIdx 升序（= 图内编号锚点顺序）。
 */
export function buildPromoBands(p: {
  promos: Pick<DimPromo, 'promo_id' | 'promo_name' | 'start_date' | 'end_date' | 'depth_hint'>[];
  spans: { start: string; end: string }[];
}): PromoBand[] {
  const DAY = 86400000;
  const utc = (s: string): number => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  const out: PromoBand[] = [];
  for (const promo of p.promos) {
    const ps = utc(promo.start_date);
    const pe = utc(promo.end_date);
    let startIdx = -1;
    let endIdx = -1;
    let startFrac = 0;
    let endFrac = 1;
    for (let i = 0; i < p.spans.length; i++) {
      const bs = utc(p.spans[i].start);
      const be = utc(p.spans[i].end);
      if (ps > be || pe < bs) continue;
      const len = Math.max(1, be - bs);
      if (startIdx < 0) {
        startIdx = i;
        startFrac = Math.min(1, Math.max(0, (ps - bs) / len));
      }
      endIdx = i;
      endFrac = Math.min(1, Math.max(0, (pe - bs) / len));
    }
    if (startIdx < 0) continue;
    out.push({
      key: promo.promo_id,
      name: promo.promo_name,
      shortName: promo.promo_name.split(/\s+/)[0] ?? promo.promo_name,
      depth: promo.depth_hint,
      startIdx,
      endIdx,
      startFrac,
      endFrac,
      weeks: endIdx - startIdx + 1,
      dateText: `${promo.start_date.slice(5).replace('-', '.')}–${promo.end_date.slice(5).replace('-', '.')}`,
    });
  }
  return out.sort((a, b) => a.startIdx - b.startIdx || a.endIdx - b.endIdx);
}

/**
 * 桶的日期覆盖区间（促销带相交判定用）已移至 helpers.bucketSpans（那边可读 dimTime）。
 */

// ---------------- 特殊降价点 / 最高最低参照线（第三十五轮） ----------------

/** 降价点判定阈值：折后价相对前一个有值点下降 ≥ 5% 视为「特殊降价」
 *  （月/季桶下 5% 已是明显异动；10% 在本数据集永不触发，demo 不可见） */
export const DROP_THRESHOLD = 0.05;

/**
 * 特殊降价点（第三十五轮，迪总：特殊降价点显示降价幅度）：
 * 折后价相对前一个有值点降幅 ≥ DROP_THRESHOLD 的点位；首点不标；缺采跨接后仍与前
 * 有值点比较。key = `${seriesKey}|${idx}`，值 = 降幅正数（0.23 → 渲染 ↓23%）。
 */
/**
 * 价格变化标记（第四十二轮：阈值可调 + 含上涨；第四十六轮：threshold 0 = 标出全部
 * 真实变化——价格未动的点仍不标，关闭语义由调用方传负值/null 承担）：相较前一有值点
 * |Δ| ≥ threshold 的点返回带符号变化率（负=降、正=升），渲染层据此出 ↓/↑ 徽标。
 * epsilon 兜浮点边界（90/100−1 = −0.0999…98）。
 */
export function buildChangeMarks(series: Series[], threshold: number = DROP_THRESHOLD): Map<string, number> {
  const out = new Map<string, number>();
  if (!(threshold >= 0)) return out;
  for (const s of series) {
    let prev: number | null = null;
    s.points.forEach((pt, i) => {
      if (pt.price == null) return;
      if (prev != null && prev > 0) {
        const chg = pt.price / prev - 1;
        if (Math.abs(chg) > 1e-9 && Math.abs(chg) >= threshold - 1e-9) out.set(`${s.key}|${i}`, chg);
      }
      prev = pt.price;
    });
  }
  return out;
}

export interface ExtremeMark {
  key: string;
  color: string;
  maxV: number;
  maxIdx: number; // 最高点下标（渲染层画点上方胶囊）
  minV: number;
  minIdx: number; // 最低点下标（渲染层画点下方胶囊 + 高亮点环，Keepa「最低价」画法）
}

/**
 * 窗口内最高/最低价点标记（第三十六轮改口径，迪总：如 Keepa 图——标签钉在极值点旁，
 * 不拉全宽虚线）：主价口径（primaryPriceOf）的窗口极值及其首个出现下标；
 * maxV === minV（全程一条价）不画——标签与价格线重合无信息量。
 */
export function buildExtremeMarks(p: {
  geom: Geom | null;
  series: Series[];
  priceTypes: PriceTypes;
}): ExtremeMark[] {
  if (!p.geom) return [];
  const out: ExtremeMark[] = [];
  for (const s of p.series) {
    let maxV: number | null = null;
    let minV: number | null = null;
    let maxIdx = -1;
    let minIdx = -1;
    s.points.forEach((pt, i) => {
      const v = primaryPriceOf(pt, p.priceTypes);
      if (v == null) return;
      if (maxV == null || v > maxV) {
        maxV = v;
        maxIdx = i;
      }
      if (minV == null || v < minV) {
        minV = v;
        minIdx = i;
      }
    });
    if (maxV == null || minV == null || maxIdx < 0 || minIdx < 0 || maxV === minV) continue;
    out.push({ key: s.key, color: s.color, maxV, maxIdx, minV, minIdx });
  }
  return out;
}
