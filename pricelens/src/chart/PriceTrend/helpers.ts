// ============================================================
// §6 价格走势图共享工具：布局常量 / 桶枚举 / Y 轴计算（拖柄>档位>自动 + 滑杆控 step）/
// 拖柄换算 / brush 平移 / 标签纵向避让
// 图表负责人（Agent C，第二轮）内部实现；只依赖冻结层（src/data、theme/tokens、dataModel/types）
// 关键决策：ECharts grid 全部用固定边距（不用 containLabel），
// 因此绘图区像素可用纯公式复现（xPxOf/yPxOf），DOM 覆盖层与 canvas 标签共用同一几何。
// 第二轮口径：Y 轴上下拖柄 = 调整 min/max（格数×TICK_PX = 绘图高，随拖动增减）；
// brush 窗口可整体拖动平移，‹ › 箭头固定于轨道两端做整窗步进平移（原"扩窗"作废）。
// 第三轮口径：brush 轨道 = 数据全集时间轴（不再 = 筛选范围）；窗口越出筛选范围时，
// 上层把筛选范围左/右极值扩展到窗口端点（箭头/拖柄/平移拖动全部如此）。
// ============================================================
import { dimTime } from '../../data';
import type { Granularity, Series, SeriesPoint } from '../../dataModel/types';

// ---------------- 布局常量（Chart 的 grid 与 DOM 覆盖层共用） ----------------

/** grid 固定边距：top 预留钉顶附框行（§6.2 附框钉在绘图区上方同一水平线） */
export const GRID = { top: 78, bottom: 36, right: 24 } as const;

/** §6.6 每格像素间距恒定（拖柄/滑杆都以此为基准换算） */
export const TICK_PX = 46;
/** 非 manual 档（自动/档位）的基准容器高（由此推出格数） */
export const BASE_CHART_HEIGHT = 470;
/** 容器高度上限（拖柄扩高的硬顶；格数上限由此推出） */
export const MAX_CHART_HEIGHT = 960;

const BASE_PLOT = BASE_CHART_HEIGHT - GRID.top - GRID.bottom;

/** §6.6(新) 格数约束：用户要求 max > min + ≥4 格；上限由容器高度硬顶推出 */
export const MIN_CELLS = 4;
export const MAX_CELLS = Math.floor((MAX_CHART_HEIGHT - GRID.top - GRID.bottom) / TICK_PX);

/** §6.5 刷选窗口最小 4 个桶 */
export const MIN_WINDOW = 4;

// ---------------- 钉顶卡片（第三轮 = 常驻图例卡）几何 ----------------

export const CARD_GAP = 8; // 卡片间距
export const CARD_H = 86; // 卡片固定高（明细态 4 行紧凑 / 图例态小点+名称，内容垂直居中）
export const CARDS_PER_ROW = 6; // 单卡 = 绘图区 1/6，一排最多 6 张，超出换排

/** 单卡宽：占绘图区 1/6（扣掉 5 道缝），整组居中、从中间向外拓展 */
export function cardWidthFor(plotWidth: number): number {
  return Math.max(120, Math.floor((plotWidth - (CARDS_PER_ROW - 1) * CARD_GAP) / CARDS_PER_ROW));
}

/** 图顶预留高 = 卡片排数（ceil(N/6)）× 卡高 + 上下留白；排数只随产品选择变化，悬停不变高 */
export function gridTopFor(seriesCount: number): number {
  const rows = Math.max(1, Math.ceil(seriesCount / CARDS_PER_ROW));
  return 6 + rows * CARD_H + (rows - 1) * CARD_GAP + 6;
}

const clampInt = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, Math.round(v)));

/** §3.3 整数千分位（RUB 空格惯例；轴/标签不带币种符号，保持图面干净） */
export function fmtInt(v: number): string {
  return Math.round(v)
    .toLocaleString('ru-RU')
    .replace(/\u00A0/g, ' ');
}

/** Y 轴左边距按最长刻度文本估算 + 26px 步长滑杆 gutter（滑杆常驻 Y 轴左侧） */
export function estGridLeft(axisMax: number): number {
  const chars = fmtInt(axisMax).length;
  return Math.max(56, Math.round(chars * 8.6) + 18) + 26;
}

// ---------------- Y 轴（§6.6 优先级：拖柄 min/max > 档位 chips > 自动；滑杆独立控制 step） ----------------

/** §6.6 nice 步长：1/2/2.5/5 ×10^k */
export function niceStep(raw: number): number {
  if (!(raw > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const r = raw / p;
  const m = r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10;
  return m * p;
}

export interface YConfig {
  min: number;
  max: number;
  interval: number;
  cells: number; // (max−min)/interval 的整数格数（决定容器高）
  plotHeight: number; // cells × TICK_PX
}

/** 拖柄手动态的冻结状态（首次拖动时以当前自动/档位几何为起点生成） */
export interface YManualRange {
  min: number;
  max: number;
  step: number;
}

/**
 * 计算最终 Y 轴 min/max/interval/格数/绘图高（§6.6 第三轮口径）。
 * 刻度值域（min/max/interval）只由拖柄/档位/自动决定，滑杆**不参与**：
 * 滑杆（sliderScale）只缩放"每格像素高度"（plotHeight = 格数×TICK_PX×scale）——
 * 刻度值 90000/91000/…/96000 七个值不变，拖动只让每格之间的高度变高或变矮。
 * - manual（拖柄，优先级最高）：step/格数/min/max 全部冻结。
 * - tierRange（档位）：min/max 锁定；无上限档时 max 撑满整数格。
 * - 自动：随所选全部线值域 ±8% padding，min 向下取整格、max 向上撑满整数格。
 */
export function computeYAxis(params: {
  series: Series[];
  priceTypes: { discounted: boolean; rrp: boolean };
  tierRange: { min: number; max: number | null } | null;
  manual: YManualRange | null;
  sliderScale: number;
}): YConfig {
  let dMin = Number.POSITIVE_INFINITY;
  let dMax = Number.NEGATIVE_INFINITY;
  for (const s of params.series) {
    for (const pt of s.points) {
      if (params.priceTypes.discounted && pt.price != null) {
        if (pt.price < dMin) dMin = pt.price;
        if (pt.price > dMax) dMax = pt.price;
      }
      if (params.priceTypes.rrp && pt.rrp != null) {
        if (pt.rrp < dMin) dMin = pt.rrp;
        if (pt.rrp > dMax) dMax = pt.rrp;
      }
    }
  }
  if (!Number.isFinite(dMin)) {
    dMin = 0;
    dMax = 100;
  }
  const dataRange = Math.max(1, dMax - dMin);

  // 每格像素高 = 格数 × TICK_PX × 滑杆倍率（只改间距，不改刻度值）
  const plotHeightOf = (cells: number): number =>
    Math.round(cells * TICK_PX * Math.min(Math.max(params.sliderScale, 0.5), 3));

  // 优先级最高：拖柄手动态（step/格数/min/max 冻结）
  const m = params.manual;
  if (m) {
    const step = Math.max(1, m.step);
    const cells = clampInt((m.max - m.min) / step, MIN_CELLS, MAX_CELLS);
    const min = Math.max(0, m.min);
    return { min, max: min + cells * step, interval: step, cells, plotHeight: plotHeightOf(cells) };
  }

  const cells = clampInt(BASE_PLOT / TICK_PX, MIN_CELLS, MAX_CELLS); // 目标 ≈8 格
  const tier = params.tierRange;
  if (tier) {
    const min = Math.max(0, tier.min);
    const max0 = tier.max != null ? Math.max(min + 1, tier.max) : dMax + dataRange * 0.08;
    const interval = Math.max(1, niceStep((max0 - min) / cells));
    const max = tier.max != null ? tier.max : min + interval * Math.ceil((max0 - min) / interval - 1e-9);
    const realCells = Math.max(1, Math.round((max - min) / interval));
    return { min, max, interval, cells: realCells, plotHeight: plotHeightOf(realCells) };
  }
  // 自动：±8% padding
  const pad = dataRange * 0.08;
  const min0 = Math.max(0, dMin - pad);
  const max0 = dMax + pad;
  const interval = Math.max(1, niceStep((max0 - min0) / cells));
  const min = Math.max(0, Math.floor(min0 / interval) * interval);
  const max = min + interval * Math.ceil((max0 - min) / interval - 1e-9);
  const realCells = Math.max(1, Math.round((max - min) / interval));
  return { min, max, interval, cells: realCells, plotHeight: plotHeightOf(realCells) };
}

// ---------------- §6.6 拖柄换算（纯函数，Node 可测） ----------------

/** 拖动换算所依据的起点几何（指针按下瞬间捕获，整个手势期间 px/价格 比例恒定） */
export interface HandleDragBase {
  min: number;
  max: number;
  interval: number;
  plotTop: number;
  plotHeight: number;
}

/**
 * 拖柄拖动换算：把指针 y（相对图表容器顶）换算为价格并吸附到 step 整数格。
 * 上柄 → 只改 max（min 不变）；下柄 → 只改 min（max 不变）。
 * 约束：格数 ∈ [MIN_CELLS, MAX_CELLS]（即 max > min + ≥4 格）；下柄同时保证 min ≥ 0。
 * 迟滞吸附：refCells = 上一次落定的格数。指针相对基准跨满一整格才跳一格 ——
 * 若按 round 半格吸附，半格触发/整格跳动，视觉步进是指针速度的 2 倍，拖柄过快难控；
 * 迟滞后指针每格 px 与柄体步进 1:1。refCells 缺省 = 对按下点的连续格数取整
 * （锚点），供上层在 pointerdown 时算初始基准——柄体中心与绘图区边缘差半个
 * GRIP_H，若首跳也走 round，上拖刚过 9px 就会进位窜一格。
 * 返回可直接写入 manual 状态的 {min, max, step}。
 */
export function snapHandleDrag(
  yRel: number,
  mode: 'top' | 'bottom',
  base: HandleDragBase,
  refCells?: number,
): YManualRange {
  const step = Math.max(1, base.interval);
  const span = Math.max(step, base.max - base.min);
  const v = base.max - ((yRel - base.plotTop) / Math.max(1, base.plotHeight)) * span;
  const raw = (mode === 'top' ? v - base.min : base.max - v) / step;
  // 迟滞：向上越过 refCells+1 取 floor、向下越过 refCells-1 取 ceil，区间内保持原格
  const cells =
    refCells == null
      ? Math.round(raw)
      : raw > refCells
        ? Math.floor(raw)
        : raw < refCells
          ? Math.ceil(raw)
          : refCells;
  if (mode === 'top') {
    const c = Math.min(MAX_CELLS, Math.max(MIN_CELLS, cells));
    return { min: base.min, max: base.min + c * step, step };
  }
  const c = Math.min(
    Math.min(MAX_CELLS, Math.max(MIN_CELLS, Math.floor(base.max / step))),
    Math.max(MIN_CELLS, cells),
  );
  return { min: base.max - c * step, max: base.max, step };
}

// ---------------- 桶（§6.5 刷选 / §6.3 下钻） ----------------

export interface Bucket {
  id: string; // 周 YYYYWW / 月 YYYYMM / 季 YYYYQn（字符串比较）
  xLabel: string; // 周=周三 MM-DD / 月=YYYYMM / 季=YYYYQn（与 aggregate 同口径）
}

/** 枚举筛选范围内的全部桶（与 dataModel/aggregate.buildBuckets 同口径，只读 dimTime） */
export function enumerateBuckets(g: Granularity, startId: string, endId: string): Bucket[] {
  if (g === 'week') {
    return dimTime
      .filter((r) => r.week_id >= startId && r.week_id <= endId)
      .map((r) => ({ id: r.week_id, xLabel: r.week_wed_date.slice(5) }));
  }
  const field = g === 'month' ? ('month_id' as const) : ('quarter_id' as const);
  const ids: string[] = [];
  for (const r of dimTime) {
    const id = r[field];
    if (id >= startId && id <= endId && !ids.includes(id)) ids.push(id);
  }
  return ids.sort().map((id) => ({ id, xLabel: id }));
}

const bucketField = (g: Granularity): 'week_id' | 'month_id' | 'quarter_id' =>
  g === 'week' ? 'week_id' : g === 'month' ? 'month_id' : 'quarter_id';

/** §6.5 联动：粒度切换 → 窗口端点对齐新粒度桶边界（覆盖同一时间跨度） */
export function convertWindowIds(
  ids: [string, string],
  from: Granularity,
  to: Granularity,
): [string, string] | null {
  if (from === to) return ids;
  const f = bucketField(from);
  const t = bucketField(to);
  let lo: string | null = null;
  let hi: string | null = null;
  for (const r of dimTime) {
    if (r[f] >= ids[0] && r[f] <= ids[1]) {
      const v = r[t];
      if (lo == null || v < lo) lo = v;
      if (hi == null || v > hi) hi = v;
    }
  }
  return lo != null && hi != null ? [lo, hi] : null;
}

/** 数据全集的桶范围（当前粒度）。brush 轨道 = 全时间轴：窗口可越出筛选范围平移，
 *  越出时上层把筛选范围极值扩展到窗口端点（§6.5 第三轮口径）。 */
export function dataBucketRange(g: Granularity): [string, string] {
  const f = bucketField(g);
  let lo: string | null = null;
  let hi: string | null = null;
  for (const r of dimTime) {
    const v = r[f];
    if (lo == null || v < lo) lo = v;
    if (hi == null || v > hi) hi = v;
  }
  return lo != null && hi != null ? [lo, hi] : ['000001', '999999'];
}

/**
 * 窗口 id → 区间索引（渲染期钳取，幂等）。
 * bounds = 筛选范围 [rangeStart, rangeEnd]：窗口恒被钳入其中（范围缩小 → 窗口收缩），
 * ids=null 表示"整个筛选范围"；≥4 桶的最小窗约束也只在筛选范围内撑开，
 * 窄筛选（<4 桶）时窗口 = 整个筛选范围，不越界。
 */
export function normalizeWindow(
  buckets: Bucket[],
  ids: [string, string] | null,
  bounds?: [string, string],
): { s: number; e: number } {
  const n = buckets.length;
  if (n === 0) return { s: 0, e: -1 };
  const idxOf = (id: string): number => {
    const i = buckets.findIndex((b) => b.id === id);
    if (i >= 0) return i;
    if (id < buckets[0].id) return 0;
    if (id > buckets[n - 1].id) return n - 1;
    let a = 0;
    let b = n - 1;
    while (a < b) {
      const m = (a + b + 1) >> 1;
      if (buckets[m].id <= id) a = m;
      else b = m - 1;
    }
    return a;
  };
  let lo = 0;
  let hi = n - 1;
  if (bounds) {
    lo = Math.max(0, Math.min(n - 1, idxOf(bounds[0])));
    hi = Math.max(0, Math.min(n - 1, idxOf(bounds[1])));
    if (lo > hi) [lo, hi] = [hi, lo];
  }
  if (!ids) return { s: lo, e: hi };
  let s = Math.max(lo, Math.min(hi, idxOf(ids[0])));
  let e = Math.max(lo, Math.min(hi, idxOf(ids[1])));
  if (s > e) [s, e] = [e, s];
  e = Math.min(hi, e);
  if (e - s + 1 < MIN_WINDOW) {
    e = Math.min(hi, s + MIN_WINDOW - 1);
    s = Math.max(lo, e - MIN_WINDOW + 1);
  }
  return { s, e };
}

/** §6.5(新) 平移步长：月=1 月、季=1 季、周=4 周（箭头点击 / 拖窗口吸附均按整桶计） */
export function panStep(g: Granularity): number {
  return g === 'week' ? 4 : 1;
}

/**
 * §6.5(新) 窗口整体平移（拖动中间蓝色窗口）：delta=平移桶数（右正左负），
 * clamp 在 [0, n−len]（窗口 ⊆ 筛选范围、宽度不变）。
 */
export function panWindow(s: number, e: number, n: number, delta: number): { s: number; e: number } {
  const len = e - s + 1;
  const ns = Math.min(Math.max(0, s + delta), Math.max(0, n - len));
  return { s: ns, e: ns + len - 1 };
}

/**
 * §6.5(新) 固定箭头步进：dir=−1 向过去（‹）、+1 向未来（›），窗口整体平移一个步长；
 * 窗口顶到数据边界时该方向平移量为 0（调用方据此置灰）。
 */
export function shiftWindow(
  s: number,
  e: number,
  n: number,
  step: number,
  dir: -1 | 1,
): { s: number; e: number } {
  const shift = dir === -1 ? Math.min(step, s) : Math.min(step, n - 1 - e);
  return { s: s + dir * shift, e: e + dir * shift };
}

/** §6.3 下钻：季桶 → 该季月桶范围（2026Q3 → 202607..202609） */
export function quarterMonths(qid: string): [string, string] {
  const m = /^(\d{4})Q([1-4])$/.exec(qid);
  if (!m) return [qid, qid];
  const y = Number(m[1]);
  const q = Number(m[2]);
  const pad = (n: number) => String(n).padStart(2, '0');
  return [`${y}${pad((q - 1) * 3 + 1)}`, `${y}${pad(q * 3)}`];
}

/** §6.3 下钻：月桶 → 该月周桶范围（以 dimTime 为准） */
export function monthWeeks(mid: string): [string, string] | null {
  let lo: string | null = null;
  let hi: string | null = null;
  for (const r of dimTime) {
    if (r.month_id === mid) {
      if (lo == null || r.week_id < lo) lo = r.week_id;
      if (hi == null || r.week_id > hi) hi = r.week_id;
    }
  }
  return lo != null && hi != null ? [lo, hi] : null;
}

// ---------------- 缺采（§6.4） ----------------

/** 缺采连续段（两侧都有有值点才会自然跨接） */
export function gapRuns(pts: SeriesPoint[]): [number, number][] {
  const runs: [number, number][] = [];
  let start = -1;
  for (let i = 0; i < pts.length; i++) {
    if (pts[i].missing) {
      if (start < 0) start = i;
    } else if (start >= 0) {
      runs.push([start, i - 1]);
      start = -1;
    }
  }
  if (start >= 0) runs.push([start, pts.length - 1]);
  return runs.filter(([a, b]) => a - 1 >= 0 && b + 1 < pts.length);
}

/** 空心点位置：缺采点落在跨接段线性插值处（首尾悬空的缺采段不画） */
export function hollowPoints(pts: SeriesPoint[]): [number, number][] {
  const out: [number, number][] = [];
  for (const [a, b] of gapRuns(pts)) {
    const vp = pts[a - 1].price;
    const vn = pts[b + 1].price;
    if (vp == null || vn == null) continue;
    for (let i = a; i <= b; i++) {
      const t = (i - (a - 1)) / (b + 1 - (a - 1));
      out.push([i, vp + (vn - vp) * t]);
    }
  }
  return out;
}

/** §6.4 周视图价格标签：仅价格发生变化后的第一个点（同价连续周不标；缺采不标、不打断比较链） */
export function weekLabeledIdx(pts: SeriesPoint[], useRrp: boolean): Set<number> {
  const out = new Set<number>();
  let last: number | null = null;
  pts.forEach((p, i) => {
    const v = useRrp ? p.rrp : p.price;
    if (v == null) return;
    if (last == null || v !== last) out.add(i);
    last = v;
  });
  return out;
}

// ---------------- 价差（§6.2 附框） ----------------

/**
 * §6.2 附框数值：两价同选只显折后价、仅勾 RRP 显 RRP（§3.2）。
 * 该桶无实际值（缺采/窗口内全缺采）→ null，调用方据此不出卡（用户反馈 #6：不再出 "—" 卡）。
 */
export function tooltipValue(
  p: SeriesPoint | undefined,
  priceTypes: { discounted: boolean; rrp: boolean },
): number | null {
  if (!p) return null;
  return priceTypes.discounted ? p.price : p.rrp;
}

/** 价差 =（竞品−我司）/我司；红=竞品贵、蓝=竞品便宜 */
export function diffPct(comp: number, own: number): { text: string; tone: 'rich' | 'cheap' } | null {
  if (!(own > 0)) return null;
  const pct = ((comp - own) / own) * 100;
  if (!Number.isFinite(pct)) return null;
  const r = Math.abs(pct) < 0.05 ? 0 : Math.round(pct * 10) / 10;
  const sign = r > 0 ? '+' : r < 0 ? '\u2212' : '±';
  return { text: `${sign}${Math.abs(r).toFixed(1)}%`, tone: r > 0 ? 'rich' : 'cheap' };
}

// ---------------- 几何（canvas 与 DOM 覆盖层共用的纯公式） ----------------

export interface Geom {
  gridLeft: number;
  plotLeft: number;
  plotTop: number;
  plotWidth: number;
  plotHeight: number;
  min: number;
  max: number;
  interval: number;
  n: number; // 桶数
}

/** 点位置=桶中点（category + boundaryGap） */
export function xPxOf(g: Geom, i: number): number {
  return g.plotLeft + (g.plotWidth / g.n) * (i + 0.5);
}

export function yPxOf(g: Geom, v: number): number {
  return g.plotTop + ((g.max - v) / (g.max - g.min)) * g.plotHeight;
}

// ---------------- 标签纵向避让（§6.2 多系列标签） ----------------

export interface AvoidItem {
  kind: 'price' | 'name';
  seriesKey: string;
  pointIdx: number;
  left: number; // 标签左右边界（px）
  right: number;
  top: number; // 期望 top（canvas 标签的默认位置）
  h: number;
  text: string;
  color: string;
  /** 必放项（系列名 + 首末/最大/最小）：冲突时纵向推挤；非必放项冲突即隐藏 */
  pinned?: boolean;
}

export interface AvoidResult {
  /** seriesKey → pointIdx → dy（相对默认位置的纵向偏移，喂给 ECharts label.offset）。
   *  只包含被保留的价格标签 —— 该 map 同时就是"可见标签集" */
  dy: Record<string, Record<number, number>>;
  /** 系列名标签（DOM 层渲染；seriesKey 用于回查品牌图标） */
  names: { x: number; y: number; text: string; color: string; seriesKey: string }[];
}

/**
 * 两遍式标签布局（确定性）：
 * 第一遍放必放项（pinned：系列名 + 每系列首/末/最大/最小值标签）——自下而上贪心，
 * 与 x 区间重叠的已放置标签保持间距，冲突时向上移（推挤量 = dy）。
 * 第二遍放次要候选（变价点等）——期望位无冲突才放置，冲突即隐藏：
 * 长窗口下宁缺不叠，杜绝旧版"逐个上推"堆出的数值高塔。
 */
export function resolveCollisions(items: AvoidItem[], plotTop: number): AvoidResult {
  const dy: Record<string, Record<number, number>> = {};
  const names: AvoidResult['names'] = [];
  const GAP = 4;
  const placed: { left: number; right: number; top: number; h: number }[] = [];
  const collides = (l: number, r: number, t: number, h: number): boolean =>
    placed.some((q) => l < q.right && q.left < r && t < q.top + q.h + GAP && t + h + GAP > q.top);
  // 第一遍：必放项
  const pinned = items
    .filter((it) => it.pinned)
    .sort((a, b) => b.top - a.top || a.left - b.left); // 自下而上；同高左先（确定序）
  for (const it of pinned) {
    let top = it.top;
    for (const q of placed) {
      const xOverlap = it.left < q.right && q.left < it.right;
      if (xOverlap) top = Math.min(top, q.top - it.h - GAP);
    }
    top = Math.max(plotTop + 2, top);
    // clamp 到顶后仍可能与已放置标签重叠（多系列同时被裁出 Y 视野）→ 向下堆叠找空位
    for (let guard = 0; guard < 64; guard++) {
      const hit = placed.find(
        (q) =>
          it.left < q.right && q.left < it.right && top < q.top + q.h + GAP && top + it.h + GAP > q.top,
      );
      if (!hit) break;
      top = hit.top + hit.h + GAP;
    }
    placed.push({ left: it.left, right: it.right, top, h: it.h });
    if (it.kind === 'price') {
      (dy[it.seriesKey] ??= {})[it.pointIdx] = top - it.top;
    } else {
      names.push({ x: it.left, y: top, text: it.text, color: it.color, seriesKey: it.seriesKey });
    }
  }
  // 第二遍：次要候选，冲突即隐藏
  const others = items
    .filter((it) => !it.pinned)
    .sort((a, b) => b.top - a.top || a.left - b.left);
  for (const it of others) {
    if (collides(it.left, it.right, it.top, it.h)) continue;
    placed.push({ left: it.left, right: it.right, top: it.top, h: it.h });
    (dy[it.seriesKey] ??= {})[it.pointIdx] = 0;
  }
  return { dy, names };
}
