// ============================================================
// §6 价格走势图共享工具：布局常量 / 桶枚举 / Y 轴（自适应分段压缩刻度）/
// 标签纵向避让 / 缺采跨接 / 几何纯公式
// 图表负责人（Agent C，第二轮）内部实现；只依赖冻结层（src/data、theme/tokens、dataModel/types）
// 关键决策：ECharts grid 全部用固定边距（不用 containLabel），
// 因此绘图区像素可用纯公式复现（xPxOf/yPxOf），DOM 覆盖层与 canvas 标签共用同一几何。
// ============================================================
// 第七轮（Y 轴简化，branch feature/y-axis-adaptive）：
// - 拖柄调 min/max（snapHandleDrag/YManualRange）整体删除：Y 轴 = 纯自适应。
// - 刻度 12px + K/M 缩写（fmtAxisShort），刻度 gutter 按缩写后宽度估算。
// - 高度自适应：格数 = ceil(有效跨度/interval)，跨度大 → 格数多 → 容器自动变高。
// - 断裂轴（空白压缩）：所选产品值域中间的空白带 ≥ 阈值时压成固定高度条，
//   轴上以虚线断轴符号表示；yPxOf 变分段线性映射（segs），ECharts 只负责画几何
//   （数据喂归一化伪值 yNormOf，值轴隐藏），刻度线/标签/断轴符号/档位带全部 DOM 层绘制。
// ============================================================
import { dimTime } from '../../data';
import type { CurrencyMode, Granularity, Series, SeriesPoint } from '../../dataModel/types';
import { getFxRate } from '../../state/fx';

// ---------------- 布局常量（Chart 的 grid 与 DOM 覆盖层共用） ----------------

/** grid 固定边距：top 预留钉顶附框行（§6.2 附框钉在绘图区上方同一水平线） */
export const GRID = { top: 78, bottom: 40, right: 24 } as const; // bottom 含大促图标专用行 22px + 轴标签（第四十七轮）

/** §6.6 每格像素间距恒定（高度自适应的基准）。
 *  第十二轮 46→92：×1.0 倍率下刻度密度降一倍（同高约半数刻度，如 60K~110K 直接 10K 一档），
 *  伸缩滑杆 ×0.5 即旧版 ×1.0 的密度；
 *  第五十轮 92→80：默认 ×1 每格再缩一截（迪总反馈图偏高），×0.5 档仍可读；
 *  第五十二轮 80→64：默认 ×1 一屏化——筛选器+主看板（截止促销热力带）在 ~900px
 *  视口内完整可见（100% 缩放），×0.5 档 32px 仍保底可读 */
export const TICK_PX = 64;
/** 格数约束：下限保可读，上限防失控（跨度再大也不超 16 格 ≈ 1472px 绘图高） */
export const MIN_CELLS = 4;
export const MAX_CELLS = 16;
/** 目标格数：interval 按它取 nice 值（第十二轮 8→5，配合 TICK_PX 翻倍后总高与旧版同量级） */
const TARGET_CELLS = 5;

/** 段像素需求下限（第三十二轮）：值簇内每系列保底像素（线 + 标签呼吸位）× 伸缩倍率。
 *  纯按值域跨度占比分配段高时，「多条系列挤在窄簇」的段会被塌缩（nova 案：8 条线
 *  只分到 ~13% 像素）；需求下限让 plotHeight 随簇内系列数适度生长（高度自适应的
 *  系列数维度），上限防失控。 */
export const MIN_PX_PER_SERIES = 40;
/** 系列名称小药丸块高（第八十二轮）：药丸（1~2 行）+来源链接的实际块高——
 *  段像素需求下限按 max(MIN_PX_PER_SERIES, 此值) 取，多产品时自动把段抬到
 *  n×52px，名称药丸之间不再拥挤（真实高度不足的段才生长，否则旧口径）。 */
export const NAME_PX_PER_SERIES = 52;
export const SERIES_PX_CAP = 12;

/** §6.5 刷选窗口最小 4 个桶 */
export const MIN_WINDOW = 4;

// ---------------- Y 轴左侧布局（第七轮+八轮修订） ----------------

/** 产品名称预留带宽：起点贴近左缘的系列名收进这里（可两行换行），折线永不进入 */
export const NAME_ZONE_W = 148;
/** 档位带（仅 USD）宽 + 与刻度列的间距 */
export const TIER_BAND_W = 64;
export const TIER_BAND_GAP = 8;

// ---------------- 断裂轴（空白压缩）阈值设计 ----------------
// 空白带 = 相邻两簇价格值之间的无人区。压缩条件（三者同时满足才出断轴）：
// 1. 空白 ≥ 总跨度 × BREAK_GAP_RATIO（20%）：小空隙不值得压，避免轴碎；
// 2. 空白 ≥ 2×interval：至少空出两格，一格的"空"是正常留白；
// 3. 断开后每段 ≥ 总跨度 × SEG_MIN_RATIO（8%）：防止压出读不了的窄条。
// 最多 BREAK_MAX（2）处断轴；断轴条固定 BREAK_PX 高，段高按各自跨度占比分配。
export const BREAK_GAP_RATIO = 0.2;
export const BREAK_MAX = 2;
export const SEG_MIN_RATIO = 0.08;
export const BREAK_PX = 24;

/** 步长滞回区间（第十一轮）：沿用上一次步长所能接受的格数范围，出界才换档。
 *  换档（步长翻倍 → 格数腰斩 → 图高突跳）只应发生在数据跨度实质变化时，
 *  不应被窗口平移/一周价格漂移触发。第十二轮随 TARGET_CELLS 5 调整为 5~9
 *  （就近档典型落在 3~8 格：允许细档沿用到 9 格才换档；缩侧 <5 即重拟合）。 */
export const STICKY_MIN_CELLS = 5;
export const STICKY_MAX_CELLS = 9;

// ---------------- 钉顶卡片（第三轮 = 常驻图例卡）几何 ----------------

export const CARD_GAP = 8; // 卡片间距
export const CARD_H = 86; // 卡片固定高（四行信息卡，内容垂直居中）
export const CARDS_PER_ROW = 6; // 单卡 = 绘图区 1/6，一排最多 6 张，超出换排

/** 单卡宽：占绘图区 1/6（扣掉 5 道缝），整组居中、从中间向外拓展 */
export function cardWidthFor(plotWidth: number): number {
  return Math.max(120, Math.floor((plotWidth - (CARDS_PER_ROW - 1) * CARD_GAP) / CARDS_PER_ROW));
}

/** 图顶预留高 = 卡片排数（ceil(N/6)）× 卡高 + 上下留白；排数只随产品选择变化，悬停不变高。
 *  第十二轮：上下留白 6→3，压缩标题排与页签排之间的空白 */
export function gridTopFor(seriesCount: number): number {
  const rows = Math.max(1, Math.ceil(seriesCount / CARDS_PER_ROW));
  return 3 + rows * CARD_H + (rows - 1) * CARD_GAP + 3;
}

const clampInt = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, Math.round(v)));

/** §3.3 整数千分位（RUB 空格惯例；轴/标签不带币种符号，保持图面干净） */
export function fmtInt(v: number): string {
  return Math.round(v)
    .toLocaleString('ru-RU')
    .replace(/\u00A0/g, ' ');
}

/** Y 轴刻度缩写（约定俗成 K/M；≥100 万用 M、≥1000 用 K，1 位小数去尾 0）。
 *  点上价格标签仍用 fmtInt 全值，只有轴刻度缩写。
 *  第二十二轮起轴刻度改用 fmtAxisTick（步长感知）；本函数保留为其 interval 缺省形态。 */
export function fmtAxisShort(v: number): string {
  const abs = Math.abs(v);
  const trim = (n: number): string => {
    const s = n >= 100 ? Math.round(n).toString() : n.toFixed(1);
    return s.replace(/\.0$/, '');
  };
  if (abs >= 1e6) return `${trim(v / 1e6)}M`;
  if (abs >= 1e3) return `${trim(v / 1e3)}K`;
  return fmtInt(v);
}

/** 步长 d 需要的小数位（使 d×10^dec 为整数）：0.05→2、0.25→2、2.5→1、5→0 */
const decimalsOfStep = (d: number): number => {
  if (!(d > 0)) return 1;
  for (let dec = 0; dec <= 4; dec++) {
    if (Math.abs(d * 10 ** dec - Math.round(d * 10 ** dec)) < 1e-6) return dec;
  }
  return 4;
};

/** Y 轴刻度缩写·步长感知（第二十二轮）：K/M 缩写的小数位跟随刻度步长——
 *  固定 1 位小数时，1000 量级上 50 一档的 1050/1100/1150 会全部塌缩成「1.1K」；
 *  步长 50 → 两位小数（1.05K/1.1K/1.15K），RUB 常规步长（≥1000）输出与旧版完全一致。
 *  interval 缺省（≤0）退化为 fmtAxisShort。 */
export function fmtAxisTick(v: number, interval: number): string {
  const abs = Math.abs(v);
  if (abs < 1e3) return fmtInt(v);
  if (!(interval > 0)) return fmtAxisShort(v);
  const div = abs < 1e6 ? 1e3 : 1e6;
  const unit = abs < 1e6 ? 'K' : 'M';
  const dec = decimalsOfStep(interval / div);
  let s = (v / div).toFixed(dec);
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return `${s}${unit}`;
}

/** 刻度列宽：按最长缩写刻度估（12px 字号 ≈7.2px/字符）+ 两侧呼吸 */
export function axisTickGutter(ticks: number[], interval = 0): number {
  const chars = ticks.length ? Math.max(...ticks.map((t) => fmtAxisTick(t, interval).length)) : 3;
  return Math.max(34, Math.round(chars * 7.2) + 12);
}

/** Y 轴总左缘 = [档位带(仅USD)] + 刻度列 + 名称预留带（estGridLeft 沿用旧名；滑杆已移至工具行，不占左缘）。
 *  interval 传入时补采样 max−interval：步长感知的最宽文案（如 62.5K）常在轴中段而非顶点。 */
export function estGridLeft(axisMax: number, currency: CurrencyMode = 'local', interval = 0): number {
  const samples = interval > 0 ? [axisMax / 2, axisMax - interval, axisMax] : [axisMax / 2, axisMax];
  const tickW = axisTickGutter(samples.filter((v) => v > 0), interval);
  return (currency === 'usd' ? TIER_BAND_W + TIER_BAND_GAP : 0) + tickW + NAME_ZONE_W;
}

// ---------------- Y 轴（第七轮：纯自适应 + 空白压缩分段刻度） ----------------

/** 币种 → 每 1 USD 兑本币数（第二十三轮：档位锚定 USD 用，与 fact 折算同源参考汇率；
 *  未来加币种在此登记即可，档位/格数/图高自动与 USD 呈现对齐） */
export function perUsdOf(currency: CurrencyMode): number {
  return currency === 'usd' ? 1 : getFxRate();
}

/** §6.6 nice 步长：1/2/2.5/5 ×10^k。
 *  第十一轮起**就近取档**（档界 = 相邻档中点 1.5/2.25/3.75/7.5）：
 *  旧版进位取档在档界附近极不稳定——跨度/8 从 4 869 涨到 5 149（+5.7%）步长即从 5K 翻到 10K，
 *  刻度翻档连带格数腰斩、图高突跳 184px（第十轮用户反馈的高度突变即此根因之一）。 */
export function niceStep(raw: number): number {
  if (!(raw > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const r = raw / p;
  const m = r < 1.5 ? 1 : r < 2.25 ? 2 : r < 3.75 ? 2.5 : r < 7.5 ? 5 : 10;
  return m * p;
}

/** 一个值段的真实域 + 像素区（pTop/pH 由 buildYScale 分配，含断裂带） */
export interface ScaleSeg {
  min: number;
  max: number;
  pTop: number; // 段顶像素（相对容器顶）
  pH: number; // 段像素高
}

/**
 * 自适应分段刻度（第七轮核心）：
 * - min/max/interval/cells 全部由所选系列值域推导，无任何手动覆盖；
 * - 值簇之间的空白带（≥阈值）压成 BREAK_PX 固定条 → 段像素高按跨度占比分配；
 * - 格数 = ceil(有效跨度/interval)：跨度大 → 格数多 → 容器高自适应增大（避免曲线压扁）。
 */
export interface YScale {
  min: number; // 全域下界（= 最下段.min）
  max: number; // 全域上界（= 最上段.max）
  interval: number;
  /** interval 的锚定基准 = USD 等值空间步长（第二十三轮）：步长滞回跨币种复现用；
   *  perUsd=1 时与 interval 相等。本币 interval = niceStep(intervalUsd × perUsd) */
  intervalUsd: number;
  cells: number; // 有效格数（不含断裂带；决定容器高）
  plotHeight: number; // 绘图总高（含断裂带条），= cells×TICK_PX×scale + 断裂条
  segs: ScaleSeg[]; // 自上而下（值高在上）
  breaks: number[]; // 断裂条中心 yPx（自上而下）
  sliderScale: number;
}

/** 收集当前显示口径下的全部价格值（两价同收：断轴/极值都以可见点为准；
 *  第十八轮导出共享：computeYAxis 与 Chart 档位带（collectTierValues）同一实现 */
export function collectVisibleValues(series: Series[], priceTypes: { discounted: boolean; rrp: boolean }): number[] {
  const out: number[] = [];
  for (const s of series) {
    for (const pt of s.points) {
      if (priceTypes.discounted && pt.price != null) out.push(pt.price);
      if (priceTypes.rrp && pt.rrp != null) out.push(pt.rrp);
    }
  }
  return out;
}

/**
 * 计算 Y 轴分段刻度（第七轮口径，唯一入口；第十一轮加步长滞回 prev）。
 * 空数据/单点退化为 0–100 单段（与旧自动口径一致，不崩）。
 */
export function computeYAxis(params: {
  series: Series[];
  priceTypes: { discounted: boolean; rrp: boolean };
  sliderScale: number;
  /** 上一次的 Y 轴模型（第十一轮步长滞回）：其 interval 若仍能给出合理格数则沿用，
   *  保证窗口平移/价格小漂移时 刻度步长与图高稳定（见 STICKY_* 常量） */
  prev?: YScale | null;
  /** Y 轴自动压缩（第二十轮）：缺省开 = 值簇空白 ≥ 阈值处断轴压缩；
   *  false = 跳过断轴检测，单段完全连续（齿轮弹层开关，关闭后不留任何断轴视觉） */
  allowBreak?: boolean;
  /** 每 1 USD 兑本币数（第二十三轮，perUsdOf 的产物；缺省 1 = 值已是 USD）：
   *  档位选择锚定 USD 等值空间，换币种不改变格数/图高（见 tierLocal） */
  perUsd?: number;
}): YScale {
  const scale = Math.min(Math.max(params.sliderScale, 0.5), 3);
  const end = (partial: Omit<YScale, 'sliderScale'>): YScale => ({ ...partial, sliderScale: scale });
  const perUsd = params.perUsd != null && params.perUsd > 0 ? params.perUsd : 1;

  const vals = collectVisibleValues(params.series, params.priceTypes);
  if (!vals.length) {
    const seg = { min: 0, max: 100, pTop: 0, pH: MIN_CELLS * TICK_PX * scale };
    return end({ min: 0, max: 100, interval: 25, intervalUsd: 25, cells: MIN_CELLS, plotHeight: seg.pH, segs: [seg], breaks: [] });
  }

  const rawMin = Math.min(...vals);
  const rawMax = Math.max(...vals);
  // 单值/近单值退化（第二十轮起常见：RRP 稳定后，仅 RRP 视图 = 恒定价一条线）：
  // 轴跨度至少撑到量级的 2%，否则 interval 细于刻度可分辨度，整轴刻度显示同一个数
  const minSpan = Math.max(1, rawMax * 0.02);
  const degenerate = rawMax - rawMin < minSpan;
  const axisMin = degenerate ? (rawMin + rawMax) / 2 - minSpan / 2 : rawMin;
  const axisMax = degenerate ? (rawMin + rawMax) / 2 + minSpan / 2 : rawMax;

  // ---- 0) 档位锚定 USD（第二十三轮）：niceStep 的档位量化对不同币种不成比例——同一数据
  //      USD 直接取档 100，RUB 值×80 后直接取档却得 5K（=62.5 USD/格），且断轴阈值/整格
  //      吸附随本币步长走，RUB 曾把 USD 会断的空白带吞掉（断轴消失）、格数 5→8 显"拉伸"。
  //      修法 = 轴模型全链路（断轴检测/呼吸位/吸附/格数/像素分配）都在 USD 等值空间
  //      计算（下述 *U 值），输出时仅两处换算回本币：段域 ×perUsd、步长 tierLocal 吸附
  //      本币 nice 档（100×80=8000→10K）。perUsd=1 时 U 恒等 1，行为与旧版逐字节一致。
  const U = perUsd;
  const axisMinU = axisMin / U;
  const axisMaxU = axisMax / U;
  const rawSpanU = Math.max(1, axisMaxU - axisMinU);
  /** 本币显示步长 = USD 步长 × perUsd 吸附本币 nice 档；perUsd=1 时 niceStep 是不动点 */
  const tierLocal = (usdTier: number): number => niceStep(usdTier * U);

  // ---- 1) 空白带检测（第二十一轮改口径）：断轴只允许出现在**没有任何系列轨迹经过**
  //      的空白带——平滑曲线连续经过自身两点之间的全部中间值，因此每系列占用其自身
  //      [min,max]，区间合并后的空隙才是候选断点。旧口径（值点集合的相邻空隙）会把
  //      单产品自身的降价/涨价过程误判为"空白"压出断轴（用户：同一产品曲线过程中
  //      不应出现任何断点）。allowBreak=false 时整段跳过——cuts 为空 → 单段连续轴。
  //      （占用区间合并结果 mergedRanges 同时供段像素需求下限使用（第三十二轮））
  const interval0 = niceStep(rawSpanU / TARGET_CELLS);
  const ranges: { lo: number; hi: number }[] = [];
  for (const s of params.series) {
    let lo: number | null = null;
    let hi: number | null = null;
    for (const pt of s.points) {
      const vs = [
        ...(params.priceTypes.discounted ? [pt.price] : []),
        ...(params.priceTypes.rrp ? [pt.rrp] : []),
      ];
      for (const v of vs) {
        if (v == null) continue;
        const vu = v / U; // USD 等值空间
        lo = lo == null ? vu : Math.min(lo, vu);
        hi = hi == null ? vu : Math.max(hi, vu);
      }
    }
    if (lo != null && hi != null) ranges.push({ lo, hi });
  }
  ranges.sort((a, b) => a.lo - b.lo);
  const mergedRanges: { lo: number; hi: number }[] = [];
  for (const r of ranges) {
    const last = mergedRanges[mergedRanges.length - 1];
    if (last != null && r.lo <= last.hi) last.hi = Math.max(last.hi, r.hi);
    else mergedRanges.push({ ...r });
  }
  const candidates: { at: number; gap: number }[] = []; // at = 空白带下缘值（簇间分割线）
  if (params.allowBreak !== false) {
    for (let i = 1; i < mergedRanges.length; i++) {
      const gap = mergedRanges[i].lo - mergedRanges[i - 1].hi;
      if (gap >= Math.max(rawSpanU * BREAK_GAP_RATIO, interval0 * 2))
        candidates.push({ at: (mergedRanges[i - 1].hi + mergedRanges[i].lo) / 2, gap });
    }
    candidates.sort((a, b) => b.gap - a.gap);
  }
  const cuts = candidates.slice(0, BREAK_MAX).map((c) => c.at).sort((a, b) => a - b);
  // 段最小占比约束：切出的段至少占 8%，否则弃切（合回）
  const validCuts: number[] = [];
  for (const cut of cuts) {
    const bounds = [axisMinU, ...validCuts, cut, axisMaxU];
    let ok = true;
    for (let i = 1; i < bounds.length; i++) {
      if (bounds[i] - bounds[i - 1] < rawSpanU * SEG_MIN_RATIO) ok = false;
    }
    if (ok) validCuts.push(cut);
  }

  // ---- 2) 段域紧贴数据簇（第八轮修订）：断裂内缘只让出 0.6×interval0 的呼吸位，
  //      不再把空白带中点当边界——否则段内侧残留大片无值区和无义刻度（用户反馈）。
  //      外缘（全域最底/最顶）留 6%，按最终 interval 吸附整格。（全部 USD 空间值）
  const dataBounds = [axisMinU, ...validCuts, axisMaxU];
  const innerPad = interval0 * 0.6;
  const segDomains: { min: number; max: number }[] = [];
  for (let i = 0; i < dataBounds.length - 1; i++) {
    const lo = dataBounds[i] + (i === 0 ? -rawSpanU * 0.06 : innerPad);
    const hi = dataBounds[i + 1] - (i === dataBounds.length - 2 ? -rawSpanU * 0.06 : innerPad);
    segDomains.push({ min: lo, max: hi });
  }
  const pseudoSpan0 = segDomains.reduce((acc, d) => acc + (d.max - d.min), 0);
  // 外缘吸附评估：给定步长做"最下段.min 向下取整格、最上段.max 向上撑满整格"，
  // 返回吸附后的伪跨度与格数。顶格锚点 = 单段时取吸附后的底（全域保持整格数，两端刻度都顶边）；
  // 多段时取末段自身下缘（与旧实现一致）。中段域不变，伪跨度按首末差值修正。
  const snapWith = (cand: number): { lo: number; hi: number; pseudoSpan: number; cells: number } => {
    const first = segDomains[0];
    const last = segDomains[segDomains.length - 1];
    const lo = Math.max(0, Math.floor(first.min / cand) * cand);
    const anchorMin = segDomains.length === 1 ? lo : last.min;
    const hi = anchorMin + cand * Math.ceil((last.max - anchorMin) / cand - 1e-9);
    // 两端向外吸附扩展都使跨度变大（底缘下移 + 顶缘上移）
    const pseudoSpan = pseudoSpan0 + (first.min - lo) + (hi - last.max);
    return { lo, hi, pseudoSpan, cells: clampInt(pseudoSpan / cand, MIN_CELLS, MAX_CELLS) };
  };
  // 步长选择（第十一轮）：就近档为基准；上一次的步长若仍能给出 STICKY 区间内的格数则沿用——
  // 窗口平移/一周价格漂移只改变吸附格数（±46px 一档），不再触发步长换档
  // （换档 = 步长翻倍 + 格数腰斩 = 图高突跳的根源，第十轮用户反馈即此）。
  // 断轴时步长不细于连续轴档位（第二十二轮）：压缩只回收空白像素；若放任伪跨度变小
  // 让就近档随之变细（100→50），格数反而 4.65→7.33、图高比不压缩还多 208px，
  // 且 K 缩写下 1050/1100/1150 三个刻度全部塌缩成「1.1K」。intervalCont 复现不压缩
  // （单段）的伪跨度 = 全域 ±6% 外缘，与断轴档取更粗者。
  // （步长比较/吸附/滞回全部发生在 USD 空间；本币步长只在出口 tierLocal 换算一次）
  const intervalRaw = niceStep(pseudoSpan0 / TARGET_CELLS);
  const intervalCont = niceStep((rawSpanU * 1.12) / TARGET_CELLS);
  const interval = segDomains.length > 1 ? Math.max(intervalRaw, intervalCont) : intervalRaw;
  let snapped = snapWith(interval);
  let finalInterval = interval;
  const prevInterval = params.prev?.intervalUsd;
  if (prevInterval && prevInterval !== interval) {
    const cand = snapWith(prevInterval);
    if (cand.cells >= STICKY_MIN_CELLS && cand.cells <= STICKY_MAX_CELLS) {
      snapped = cand;
      finalInterval = prevInterval;
    }
  }
  segDomains[0].min = snapped.lo;
  segDomains[segDomains.length - 1].max = snapped.hi;
  const pseudoSpan = snapped.pseudoSpan;
  const cells = clampInt(pseudoSpan / finalInterval, MIN_CELLS, MAX_CELLS);
  const availPx = Math.round(cells * TICK_PX * scale);

  // ---- 2.5) 段像素需求下限（第三十二轮）：与段值域相交的系列数 × 每系列保底像素
  //      （× 伸缩倍率，滑杆语义不变）。占比份额低于需求时抬升该段，plotHeight 相应
  //      增长（高度自适应的系列数维度）；无一段触需时与旧口径逐字节一致。
  const segBaseH = segDomains.map(
    (d) => Math.max(12, Math.round(((d.max - d.min) / pseudoSpan) * availPx)),
  );
  const segFinalH = segDomains.map((d, i) => {
    let n = 0;
    for (const r of mergedRanges) {
      if (r.lo <= d.max && r.hi >= d.min) n++;
    }
    const need = Math.min(n, SERIES_PX_CAP) * Math.max(MIN_PX_PER_SERIES, NAME_PX_PER_SERIES) * scale;
    return Math.round(need) > segBaseH[i] ? Math.round(need) : segBaseH[i];
  });
  const grown = segFinalH.some((h, i) => h > segBaseH[i]);
  // 第五十四轮追补②：需求下限只准长不准缩——外缘整格吸附留下的空档使段占比
  // ×availPx 低于 availPx 本身，原 grown 分支会让总高跌破 cells×TICK_PX
  // （每格高度标尺失效，周→季可缩 80px）；钳回 availPx 保底。
  const plotHeight =
    Math.max(availPx, grown ? segFinalH.reduce((a, b) => a + b, 0) : 0) + (segDomains.length - 1) * BREAK_PX;

  // ---- 3) 像素分配：值高在上；段高 ∝ 跨度（需求下限抬升见 2.5）；段间插入断裂条 ----
  const segs: ScaleSeg[] = [];
  const breaks: number[] = [];
  let cursor = 0; // 自顶向下累计
  for (let i = segDomains.length - 1; i >= 0; i--) {
    const d = segDomains[i];
    const h = segFinalH[i];
    segs.push({ min: d.min, max: d.max, pTop: cursor, pH: h });
    cursor += h;
    if (i > 0) {
      breaks.push(cursor + BREAK_PX / 2);
      cursor += BREAK_PX;
    }
  }

  // 出口换算回本币（第二十三轮）：段域/极值 ×perUsd；步长吸附本币 nice 档（tick 值
  // 与 fmtAxisTick 用本币 interval），USD 空间步长随行带出供滞回跨币种复现
  return end({
    min: segDomains[0].min * U,
    max: segDomains[segDomains.length - 1].max * U,
    interval: tierLocal(finalInterval),
    intervalUsd: finalInterval,
    cells,
    plotHeight,
    segs: segs.map((s) => ({ ...s, min: s.min * U, max: s.max * U })),
    breaks,
  });
}

/** 段内刻度值（interval 整数倍，升序） */
export function segTicks(seg: ScaleSeg, interval: number): number[] {
  const out: number[] = [];
  for (let v = Math.ceil(seg.min / interval) * interval; v <= seg.max + 1e-9; v += interval) {
    out.push(Math.round(v * 100) / 100);
  }
  return out;
}

// ---------------- 几何（canvas 与 DOM 覆盖层共用的纯公式） ----------------

export interface Geom {
  gridLeft: number;
  plotLeft: number;
  plotTop: number;
  plotWidth: number;
  plotHeight: number;
  scale: YScale;
  n: number; // 桶数
}

/** 促销热力带所需的横向几何原语（第十五轮：与时间轴逐像素对齐；由 Chart.onGeom 上报，
 *  只含动画/高度无关的三个字段，避免过渡帧连坐重渲染） */
export interface StripGeom {
  plotLeft: number;
  plotWidth: number;
  n: number;
}

/** 点位置=桶中点（category + boundaryGap） */
export function xPxOf(g: Geom, i: number): number {
  return g.plotLeft + (g.plotWidth / g.n) * (i + 0.5);
}

/** 分段线性映射：值 → 像素 y（容器绝对坐标；断裂带内无值，越界钳到最近段缘） */
export function yPxOf(g: Geom, v: number): number {
  const segs = g.scale.segs;
  let seg = segs[0];
  for (const s of segs) {
    seg = s;
    if (v >= s.min) break; // segs 自上而下（值域降序），找到首个 min ≤ v 的段
  }
  if (v > seg.max) return g.plotTop + seg.pTop; // 高于段顶（不应发生，防御）
  const t = (seg.max - v) / Math.max(1e-9, seg.max - seg.min);
  return g.plotTop + seg.pTop + t * seg.pH;
}

/** ECharts 归一化伪值（0..1，ECharts 值轴自下而上）：值轴隐藏后，几何全部由分段映射决定。
 *  数据喂伪值、DOM 用 yPxOf，两者同源恒一致（注意方向翻转：y 大 → 伪值大）。 */
export function yNormOf(g: Geom, v: number): number {
  return 1 - (yPxOf(g, v) - g.plotTop) / Math.max(1, g.plotHeight);
}

// ---------------- 价格档位（§7.1 tier_code 口径；左轴档位带，仅 USD） ----------------
// tier_code 按上市价 USD 归档，档位边界固定：<200 / 200-400 / 400-600 / 600-800 / 800-1000 / 1000+。
// 本币（RUB）映射未定义（汇率波动），故档位带只在 USD 币种下渲染。

export const DEFAULT_TIERS: { label: string; min: number; max: number | null }[] = [
  { label: '<200', min: 0, max: 200 },
  { label: '200~400', min: 200, max: 400 },
  { label: '400~600', min: 400, max: 600 },
  { label: '600~800', min: 600, max: 800 },
  { label: '800~1000', min: 800, max: 1000 },
  { label: '1000+', min: 1000, max: null },
];

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

/** 时点页签日期（第五十四轮追补①）：窗口末桶内最新日历周 → 周三锚日 MM-DD。 *  月/季粒度不再显示 2026-10 / 2026Q4——时点恒为「最新那一周对应的那一天」
 *  （用户：时点随粒度在 10-07 / 2026-10 / 2026Q4 之间跳变，后两者不是「一天」）。
 *  窗口平移到过去时跟随窗口（与摘要条数值口径一致），找不到回退 null。 */
export function bucketLatestWeekLabel(g: Granularity, bucketId: string): string | null {
  if (g === 'week') {
    const r = dimTime.find((x) => x.week_id === bucketId);
    return r ? r.week_wed_date.slice(5) : null;
  }
  let best: { week_id: string; week_wed_date: string } | null = null;
  for (const r of dimTime) {
    if ((g === 'month' ? r.month_id : r.quarter_id) !== bucketId) continue;
    if (!best || r.week_id > best.week_id) best = r;
  }
  return best ? best.week_wed_date.slice(5) : null;
}

/** 分离共享轴列宽（第五十四轮追补⑤）：只含实际轴元素——USD = 档位带（+开刻度时的
 *  刻度列），非 USD = 仅刻度列；不开刻度且无档位带时为 0。面板 gridLeft=0 后，
 *  主图 gridLeft 里的名称预留带（NAME_ZONE_W）不再摊在轴列里，宽度全部让给卡片。 */
export function splitAxisWidth(currency: CurrencyMode, gridLeft: number, showYTicks: boolean): number {
  const tierPart = currency === 'usd' ? TIER_BAND_W + TIER_BAND_GAP : 0;
  if (!showYTicks) return currency === 'usd' ? TIER_BAND_W : 0;
  return tierPart + Math.max(34, gridLeft - tierPart - NAME_ZONE_W);
}

/** 周 id → 当前粒度桶 id（追补⑧：总览下钻焦点周跨粒度换算——总览迷你图是周度序列，
 *  看板可能停在月/季粒度，直接 findIndex 会找不到而跳过聚焦） */
export function bucketIdOfWeek(g: Granularity, weekId: string): string | null {
  if (g === 'week') return weekId;
  const r = dimTime.find((x) => x.week_id === weekId);
  if (!r) return null;
  return g === 'month' ? r.month_id : r.quarter_id;
}

/** 桶的日期覆盖区间（第三十四轮，大促背景带相交判定用）：周桶 = 锚周三 ±3 天；
 *  月/季桶 = 首末周周三 ±3 天。dimTime 未就绪时回退桶 id 自身（不会相交于合法日期）。 */
export function bucketSpans(g: Granularity, buckets: Bucket[]): { start: string; end: string }[] {
  const DAY = 86400000;
  const utc = (s: string): number => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  const iso = (t: number): string => new Date(t).toISOString().slice(0, 10);
  const wedOf = new Map(dimTime.map((r) => [r.week_id, r.week_wed_date]));
  const weeksOfBucket = new Map<string, string[]>();
  if (g !== 'week') {
    const field = g === 'month' ? 'month_id' : 'quarter_id';
    for (const r of dimTime) {
      const arr = weeksOfBucket.get(r[field]);
      if (arr) arr.push(r.week_id);
      else weeksOfBucket.set(r[field], [r.week_id]);
    }
  }
  return buckets.map((b) => {
    const ids = g === 'week' ? [b.id] : (weeksOfBucket.get(b.id) ?? []).sort();
    const first = ids.length ? wedOf.get(ids[0]) : undefined;
    const last = ids.length ? wedOf.get(ids[ids.length - 1]) : undefined;
    if (!first || !last) return { start: b.id, end: b.id };
    return { start: iso(utc(first) - 3 * DAY), end: iso(utc(last) + 3 * DAY) };
  });
}

/** §6.5(新) 平移步长：月=1 月、季=1 季、周=4 周（箭头点击 / 拖窗口吸附均按整桶计） */
export function panStep(g: Granularity): number {
  return g === 'week' ? 4 : 1;
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
 * §6.5(新) 窗口整体平移（拖动中间蓝色窗口）：delta=平移桶数（右正左负），
 * clamp 在轨道 [lo, hi]（第十九轮起轨道 = 筛选范围；窗口 ⊆ 轨道、宽度不变）。
 */
export function panWindow(s: number, e: number, lo: number, hi: number, delta: number): { s: number; e: number } {
  const len = e - s + 1;
  const ns = Math.min(Math.max(lo, s + delta), Math.max(lo, hi - len + 1));
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

// ---------------- 时间自适应（自动极值 = 所选产品最早/最晚有效价格桶） ----------------

/**
 * 所选系列的数据跨度（全集桶下标区间）：任一点有折后价或 RRP 即算在售。
 * points 与全集 buckets 同长同序（buildSeries 按全集取数），下标可直接对齐。
 * 无任何有值点 → null（调用方保持现范围不动）。
 */
export function seriesSpanRange(series: Series[]): [number, number] | null {
  let lo: number | null = null;
  let hi: number | null = null;
  for (const s of series) {
    const pts = s.points;
    for (let i = 0; i < pts.length; i++) {
      if (pts[i].price == null && pts[i].rrp == null) continue;
      if (lo == null || i < lo) lo = i;
      if (hi == null || i > hi) hi = i;
    }
  }
  return lo != null && hi != null ? [lo, hi] : null;
}

/**
 * 自适应可选范围 = 跨度 ±pad 个桶，钳在数据全集内；看板自动模式传 pad=0，
 * 因而上方筛选器直接显示产品最早/最晚有效价格桶：
 * 左缘不早于数据起点、右缘不晚于数据末端（数据生成到当前时间，即"不超当前时间"）。
 * 例：跨度 202603..202608 → 可选 202601..202610；跨度到 202610 → 右缘钳 202610。
 * 无桶/无跨度 → null。
 */
export function adaptiveRangeOf(
  buckets: Bucket[],
  span: [number, number] | null,
  pad = 2,
): [string, string] | null {
  if (!buckets.length || !span) return null;
  const lo = Math.max(0, span[0] - pad);
  const hi = Math.min(buckets.length - 1, span[1] + pad);
  return [buckets[lo].id, buckets[hi].id];
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

// ---------------- 缺采（§6.4；第二十四轮：仅虚线跨接，撤销空心插值点） ----------------

/**
 * 被跨接段吸收的孤立有值点集合（第二十四轮）：某有值周的左右紧邻都是缺采时，该周
 * 不再展示数据点/数值标签，虚线桥整段直连越过——用户口径：虚线段中间不应残留孤立点
 * （如 iPhone 17 8+256 @202620）。系列在窗口内的首个/末个有值点不吸收（唯一/双有值点
 * 的短系列不能整条消失）；M-o-M-o-M 链式形态迭代吸收到不动点。
 */
export function gapAbsorbedIdx(pts: SeriesPoint[]): Set<number> {
  const valIdx: number[] = [];
  pts.forEach((pt, i) => {
    if (pt.price != null) valIdx.push(i);
  });
  if (valIdx.length <= 2) return new Set();
  const first = valIdx[0];
  const last = valIdx[valIdx.length - 1];
  const out = new Set<number>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const i of valIdx) {
      if (i === first || i === last || out.has(i)) continue;
      const lGap = pts[i - 1].price == null || out.has(i - 1); // i>first ⇒ i-1 在界内
      const rGap = pts[i + 1].price == null || out.has(i + 1); // i<last ⇒ i+1 在界内
      if (lGap && rGap) {
        out.add(i);
        changed = true;
      }
    }
  }
  return out;
}

/** 缺采连续段（两侧都有有值点才会自然跨接）；被吸收的孤立有值点并入所在跨接段，
 *  跨接桥整段直连、不在中途落点（第二十四轮） */
export function gapRuns(pts: SeriesPoint[]): [number, number][] {
  const absorbed = gapAbsorbedIdx(pts);
  const runs: [number, number][] = [];
  let start = -1;
  for (let i = 0; i < pts.length; i++) {
    if (pts[i].missing || absorbed.has(i)) {
      if (start < 0) start = i;
    } else if (start >= 0) {
      runs.push([start, i - 1]);
      start = -1;
    }
  }
  if (start >= 0) runs.push([start, pts.length - 1]);
  return runs.filter(([a, b]) => a - 1 >= 0 && b + 1 < pts.length);
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

/** 价差 =（竞品−我司）/我司；红=竞品贵、蓝=竞品便宜 */
export function diffPct(comp: number, own: number): { text: string; tone: 'rich' | 'cheap' } | null {
  if (!(own > 0)) return null;
  const pct = ((comp - own) / own) * 100;
  if (!Number.isFinite(pct)) return null;
  const r = Math.abs(pct) < 0.05 ? 0 : Math.round(pct * 10) / 10;
  const sign = r > 0 ? '+' : r < 0 ? '−' : '±';
  return { text: `${sign}${Math.abs(r).toFixed(1)}%`, tone: r > 0 ? 'rich' : 'cheap' };
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
  /** 名称区宽度裁剪（>0 时 DOM 按此宽省略号截断，如名称预留带内） */
  maxW?: number;
  /** 名称项锚点（第三十二轮）：系列首点像素位置，避让推离超阈值时画引线到这 */
  anchorX?: number;
  anchorY?: number;
  /** 第八十二轮：名称药丸的隐藏态（折线已屏蔽 → 虚线置灰药丸） */
  hidden?: boolean;
}

export interface AvoidResult {
  /** seriesKey → pointIdx → dy（相对默认位置的纵向偏移，喂给 ECharts label.offset）。
   *  只包含被保留的价格标签 —— 该 map 同时就是"可见标签集" */
  dy: Record<string, Record<number, number>>;
  /** 系列名标签（DOM 层渲染；seriesKey 用于回查品牌图标）。
   *  第三十二轮起带完整避让盒（w/h）与推离量 dy、锚点（anchorX/Y）——渲染层据此
   *  精确复位（含生命周期第二行）并画引线；金测以"盒互不相交"不变量钉住 */
  names: {
    x: number;
    y: number;
    w: number;
    h: number;
    dy: number;
    text: string;
    color: string;
    seriesKey: string;
    maxW?: number;
    anchorX: number;
    anchorY: number;
    /** 第八十二轮：药丸隐藏态（折线已屏蔽） */
    hidden?: boolean;
  }[];
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
      names.push({
        x: it.left,
        y: top,
        w: it.right - it.left,
        h: it.h,
        dy: top - it.top,
        text: it.text,
        color: it.color,
        seriesKey: it.seriesKey,
        maxW: it.maxW,
        anchorX: it.anchorX ?? it.left,
        anchorY: it.anchorY ?? top,
        hidden: it.hidden,
      });
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
