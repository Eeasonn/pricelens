// ============================================================
// 分列视图图（2026-11-27 二轮「视图：对标 / 分列」；前身 = 品牌全景 BrandPanorama）：
// 选择草稿恒为 mains（唯一草稿），本组件接收 columnsOf 分好的列组逐组一张图、
// 三列网格换行。分组依据（品牌 / 系列 / 档位）只是摆法，不改选择。
// 口径与交互（决策记录见 .impeccable/surfaces/stable-optimization-20261127.md §4）：
// · 无默认主品、无默认价差基准；基准只能由用户在工具行显式选「临时基准」——选定后
//   悬停明细出价差列、图下分列价格明细出价差区、区间量尺量基准线；未选 = 只看价格。
// · 默认共享：查看时间轴（各图底部时间轨、拖任一条全部联动）、区间刷选、Y 轴
//   （全部图并集算一次受控传入）、跨图悬停十字线；Y 轴可切「独立」（各图自适应、
//   各自带轴）；时间轴可切「轴同步」关（各图独立调整查看时间）。
// · 颜色 = 品牌色（brandColorOf，跨品牌分组照样可辨）；组内多条线靠直接标签
//   （名称带药丸带线型样条）、线型（虚线节律按组内序循环）、tooltip、悬停隔离辨认。
// · 折线全画：不设条数上限、不自动减少、不强制切图（合并线数限制不在这里重现）；
//   可读性由图例搜索 / 隔离 / 主动隐藏（LegendTools）与标签 / 图体适应承担。
// · 缺采不造点（buildSeries 同口径：缺采周 null、虚线跨接）；图下为分列价格明细
//   （Dashboard 经 onSeriesWindow 渲染 TrendTables）。
// ============================================================
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ConfigProvider, Segmented, Select } from 'antd';
import { useFilters } from '../../state/FiltersContext';
import { filterBarTheme } from '../../components/FilterBar';
import { INDUSTRY_LABELS } from '../../dataModel/scope';
import { selKey } from '../../state/mainSelection';
import { splicedSeriesOf, splicedSeriesPointsOf, genShortName, type LineageChain } from './lineageModel';
import { buildSeries, lifecycleDeltaOf } from '../../dataModel/aggregate';
import { brandOfModel, modelNameOf, ownBrand } from '../../components/ProductCascader/tree';
import { configTextOf } from '../../components/ProductCascader';
import type { ColumnGroup } from './columnsModel';
// 取数口径 = 顶部全局平台筛选器（与价格页同口径；2026-11-27 演进版退场后是唯一口径）
import { platformLevelForChannel } from '../../state/urlSync';
import usePageViewState from '../../state/usePageViewState';
import { dimPromo, dimTime } from '../../data';
import type { Granularity, Series, SeriesPoint, SeriesQuery } from '../../dataModel/types';
import { brandColorOf, color, radius, selectAccent, selectSoft, selectSoftInk, space } from '../../theme/tokens';
import Chart from './Chart';
import SplitAxisColumn from './SplitAxisColumn';
import SplitTimeTrack, { normalizePanelWindow, SPLIT_TRACK_H } from './SplitTimeTrack';
import LegendTools from './LegendTools';
import { brushInWindow, type RangeMode } from './rangeRuler';
import {
  GRID,
  PANE_HEAD_H,
  axisTickTextsOf,
  bucketAnchorDate,
  bucketSpans,
  computeYAxis,
  convertWindowIds,
  dataBucketRange,
  enumerateBuckets,
  estGridLeft,
  normalizeWindow,
  perUsdOf,
  seriesSpanRange,
  splitAxisWidth,
  tailDefaultRange,
  tailWindowIds,
  NARROW_DEFAULT_BUCKETS,
  type Bucket,
  type YScale,
} from './helpers';
import {
  buildPromoBands,
  collectTierValues,
  nameZoneTwoRowDegraded,
  nameZoneWidthOf,
  seriesPillMetaOf,
  type LineShapeChoice,
  type PromoBand,
} from './chartModel';
import { recentFourWeekChange, seriesKeyMatches, seriesKeyOf, type DetailBucket, type TableGroup } from './tableModel';
import { useNarrowViewport } from '../../state/useNarrowViewport';
import { useConfigVersion } from '../../state/configStore';
import BrandDot, { brandLabelOf } from '../../components/BrandMark';

/** 组内线型循环：首条实线，其后虚线节律两两可辨；缺采跨接段
 *  恒为 [4, 4] 短虚线桥（opacity .9），不进本表 */
export const COLUMNS_DASH_PATTERNS: readonly (readonly number[])[] = [[], [10, 5], [2, 4], [12, 4, 2, 4], [6, 3], [16, 4]];

/** 组内第 i 条线的线型（i = 0 实线 → undefined；按循环表取） */
export function dashPatternAt(i: number): number[] | undefined {
  const p = COLUMNS_DASH_PATTERNS[((i % COLUMNS_DASH_PATTERNS.length) + COLUMNS_DASH_PATTERNS.length) % COLUMNS_DASH_PATTERNS.length];
  return p.length ? [...p] : undefined;
}

/** 三列网格：≤3 组 = 每组一列；更多组每行最多 3 个、换行 */
export const COLUMNS_GRID = 3;
export function columnsGridOf(groupCount: number): number {
  return Math.max(1, Math.min(COLUMNS_GRID, groupCount));
}

const PANEL_HEAD_H = 30; // 分列图卡头行（组名 + 款数）
const Y_AXIS_TOP_BAND = 16;

/** 取数异常占位（与 PriceTrend 同语言） */
const LOAD_ERROR_HINT = (
  <>
    数据加载异常
    <div style={{ marginTop: 4, fontSize: 12 }}>请刷新重试</div>
  </>
);

const listed = (p?: SeriesPoint): boolean => !!p && (p.price != null || p.rrp != null);

/** 窗口切片 + 边缘续接标记（与 PriceTrend.sliceVis 同逻辑） */
function sliceVis(list: Series[], s: number, e: number): Series[] {
  if (s > e) return [];
  return list
    .map((x) => {
      const points = x.points.slice(s, e + 1);
      const edgeStart = listed(points[0]) && (listed(x.points[s - 1]) || listed(x.points[s - 2]));
      const edgeEnd = listed(points[points.length - 1]) && (listed(x.points[e + 1]) || listed(x.points[e + 2]));
      return { ...x, points, edgeStart, edgeEnd };
    })
    .filter((x) => x.points.length > 0);
}

export default function ColumnsView(props: {
  /** 列组（columnsOf 产出：分组依据已由调用方决定）；组件只管摆放与交互 */
  groups: ColumnGroup[];
  /** 代际模式（2026-11-28 三轮返修：代际走共享 Chart，与分列同语言）：
   *  组键 → 该组的代际链。传入后：取数扩展到全部代，每组的系列替换为
   *  「每链一条拼接序列」（活跃代点全真 + overlap 淡线），线型强制 step。 */
  lineage?: ReadonlyMap<string, LineageChain[]>;
  /** 分组依据（brand 时卡头带品牌点、空态文案按品牌语义；series/tier 只出组名） */
  groupBy: 'brand' | 'series' | 'tier';
  /** 图下「分列价格明细」取数口（与 PriceTrend.onSeriesWindow 同契约，Dashboard 渲染） */
  onSeriesWindow?: (
    groups: TableGroup[],
    buckets: DetailBucket[],
    fourWeekChanges: ReadonlyMap<string, number | null>,
  ) => void;
}) {
  const { state, actions } = useFilters();
  const configVersion = useConfigVersion();
  const narrowViewport = useNarrowViewport();
  const columns = state.columns;
  const sharedY = columns.sharedY !== false;
  const baselineKey = columns.baselineKey ?? null;
  const groups = props.groups;
  const lineage = props.lineage ?? null;
  const sels = useMemo(() => groups.flatMap((g) => g.sels), [groups]);
  // 代际模式：取数扩展到全部代（含拼接出来的未在册上一代）——去重保序
  const querySels = useMemo(() => {
    if (!lineage) return sels;
    const seen = new Set<string>();
    const out: typeof sels = [];
    for (const chains of lineage.values()) {
      for (const c of chains) {
        for (const g of c.gens) {
          if (seen.has(g.key)) continue;
          seen.add(g.key);
          out.push(g.sel);
        }
      }
    }
    return out;
  }, [lineage, sels]);
  const selCount = sels.length;

  // ---- 视图设置：与对标视图共用同一批会话态键（两视图切换时显示设置一致）----
  const [sliderScale] = usePageViewState<number>('dashboard.sliderScale', () => 1);
  const [yCompress] = usePageViewState<boolean>('dashboard.yCompress', () => false);
  const [showYTicks] = usePageViewState<boolean>('dashboard.showYTicks', () => true);
  const [showTiers] = usePageViewState<boolean>('dashboard.showTiers', () => false);
  const [lineShapePref] = usePageViewState<LineShapeChoice>('dashboard.lineShape', () => 'smooth');
  // 代际模式恒 step（拼接口径 = 期内恒定阶梯，平滑会虚构中间价——2026-11-28 定版）
  const lineShape: LineShapeChoice = lineage ? 'step' : lineShapePref;
  const [labelMode] = usePageViewState<'detail' | 'compact'>('dashboard.labelMode', () => 'compact');
  const [tipMode] = usePageViewState<'discount' | 'wow'>('dashboard.tipMode', () => 'wow');
  const [rangeMode, setRangeMode] = usePageViewState<RangeMode>('dashboard.rangeMode', () => 'extreme');
  // 分列视图自己的视图态：时间轴同步 / 各图独立窗口
  const [synced, setSynced] = usePageViewState<boolean>('columns.synced', () => true);
  const [brandWins, setBrandWins] = usePageViewState<Record<string, [number, number] | null>>('columns.groupWins', () => ({}));
  const [brandWinsGran, setBrandWinsGran] = usePageViewState<string>('columns.groupWinsGran', () => state.granularity);
  const commitBrandWins = (
    v: Record<string, [number, number] | null> | ((p: Record<string, [number, number] | null>) => Record<string, [number, number] | null>),
  ): void => {
    setBrandWins(v);
    setBrandWinsGran(state.granularity);
  };
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set());
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const [brushRange, setBrushRange] = useState<[number, number] | null>(null);
  const [crossIdx, setCrossIdx] = useState<number | null>(null);
  const [brandCross, setBrandCross] = useState<Record<string, number | null>>({});
  const [crossY, setCrossY] = useState<number | null>(null);
  const [promoBandsOn, setPromoBandsOn] = useState(false);

  // ---- 取数：列组选择 → SeriesQuery → buildSeries（与对标视图同口径）----
  const [dataStart, dataEnd] = useMemo(() => dataBucketRange(state.granularity), [state.granularity]);
  const stablePlatform = useMemo(() => platformLevelForChannel(state.platform), [state.platform]);
  const query: SeriesQuery = useMemo(
    () => ({
      groups: querySels.map((g) => ({
        ...g,
        isOwn: false,
        platform: stablePlatform,
      })),
      granularity: state.granularity,
      startBucket: dataStart,
      endBucket: dataEnd,
      currency: state.currency,
      agg: state.agg,
      financingType: state.financingType,
      financingTerms: state.financingTerms,
      scope: { countryCode: state.countryCode, industry: state.industry },
    }),
    [querySels, stablePlatform, state.platform, state.granularity, dataStart, dataEnd, state.currency, state.agg, state.financingType, state.financingTerms, state.countryCode, state.industry],
  );
  const allSeriesRes = useMemo<{ series: Series[]; failed: boolean }>(() => {
    if (query.groups.length === 0) return { series: [], failed: false };
    try {
      return { series: buildSeries(query), failed: false };
    } catch {
      return { series: [], failed: true };
    }
  }, [query, configVersion]);
  // 线型：组内按选择序赋值（颜色 = 品牌色，同组多条靠虚线节律辨认）
  const allSeries = useMemo<Series[]>(() => {
    const order = new Map<string, number>();
    for (const g of groups) g.sels.forEach((s, i) => order.set(selKey(s), i));
    return allSeriesRes.series.map((s) => {
      const sel = sels.find((g) => seriesKeyMatches(s.key, seriesKeyOf(g)));
      const i = sel ? order.get(selKey(sel)) ?? 0 : 0;
      const dash = dashPatternAt(i);
      return dash ? { ...s, lineDash: dash } : s;
    });
  }, [allSeriesRes, groups, sels]);
  const weeklySeries = useMemo<Series[]>(() => {
    if (state.granularity === 'week') return allSeries;
    if (query.groups.length === 0) return [];
    const [startBucket, endBucket] = dataBucketRange('week');
    try {
      return buildSeries({ ...query, granularity: 'week', startBucket, endBucket });
    } catch {
      return [];
    }
  }, [allSeries, query, state.granularity, configVersion]);

  // ---- 全集桶 / 默认近段窗口 / 查看窗口（与 PriceTrend 同口径；视图态键共用）----
  const buckets: Bucket[] = useMemo(() => enumerateBuckets(state.granularity, dataStart, dataEnd), [state.granularity, dataStart, dataEnd]);
  const bucketIds = useMemo(() => buckets.map((b) => b.id), [buckets]);
  const span = useMemo(() => seriesSpanRange(allSeries), [allSeries]);
  // 代际视图默认窗口 = 拼接链全数据域（最早有价桶 → 最晚，含 splice 进来的上一代——
  //  allSeries 在代际模式已扩展全部代，span 即链域；2026-11-28 返修①：尾窗会把链压进
  //  卡片右缘一窄条）。用户仍可用时间轨收窄；收窄结果存独立视图态键（见下），
  //  不污染对标/分列的窗口记忆。对标/分列窗口逻辑原样。
  const tailBounds = useMemo(
    () => {
      // 代际模式：初始窗口恒 = 链全数据域，不看 adaptive——该开关控制的是对标/分列的
      // 近段跟随；代际内的时间轨收窄走 lineage.windowIds（不落 adaptive=false，
      // 见 onWindowChange），不存在「用户固定范围」被覆盖的问题（2026-11-28 返修①补）
      if (lineage) {
        if (!buckets.length || !span) return null;
        const lo = Math.max(0, Math.min(span[0], buckets.length - 1));
        const hi = Math.max(lo, Math.min(span[1], buckets.length - 1));
        return [buckets[lo].id, buckets[hi].id];
      }
      if (!state.adaptive) return null;
      return tailDefaultRange(buckets, span, state.granularity);
    },
    [state.adaptive, buckets, span, state.granularity, lineage],
  );
  const selectedProductKey = JSON.stringify(sels.map((g) => `${g.modelId}|${g.romram}`).sort());
  const tailKey = tailBounds ? `${state.granularity}|${tailBounds[0]}|${tailBounds[1]}|${selectedProductKey}` : '';
  const tailAppliedRef = useRef('');
  // 代际窗口独立于对标/分列（2026-11-28 返修①）：初始 = 链全数据域，用户收窄后记忆在
  //  lineage 自己的键，切视图互不污染
  const windowKey = lineage ? 'lineage.windowIds' : 'dashboard.windowIds';
  const windowGranKey = lineage ? 'lineage.windowIdsGran' : 'dashboard.windowIdsGran';
  const [windowIds, setWindowIdsRaw] = usePageViewState<[string, string] | null>(windowKey, () => null);
  const [windowIdsGran, setWindowIdsGran] = usePageViewState<string>(windowGranKey, () => state.granularity);
  const commitWindowIds = (v: [string, string] | null | ((p: [string, string] | null) => [string, string] | null)): void => {
    setWindowIdsRaw(v);
    setWindowIdsGran(state.granularity);
  };
  useLayoutEffect(() => {
    if (!tailBounds) {
      tailAppliedRef.current = '';
      return;
    }
    if (tailAppliedRef.current === tailKey) return;
    tailAppliedRef.current = tailKey;
    if (lineage) {
      // 代际：初始窗口写进 lineage 自己的视图态键，不动 filters.rangeStart/End——
      // 那是共享筛选态，写它会冲掉用户在对标/分列的时间范围（2026-11-28 返修①补）
      commitWindowIds(tailBounds as [string, string]);
    } else {
      if (state.rangeStart !== tailBounds[0] || state.rangeEnd !== tailBounds[1]) {
        actions.set({ rangeStart: tailBounds[0], rangeEnd: tailBounds[1] });
      }
      commitWindowIds(null);
    }
    commitBrandWins({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tailKey]);
  // 粒度切换：窗口端点换算到新粒度桶边界；独立窗口失义回落共享窗口
  const granRef = useRef(state.granularity);
  useLayoutEffect(() => {
    if (granRef.current === state.granularity) return;
    const prev = granRef.current;
    granRef.current = state.granularity;
    setWindowIdsRaw((ids) => (ids ? convertWindowIds(ids, prev, state.granularity) : null));
    setWindowIdsGran(state.granularity);
    commitBrandWins({});
  }, [state.granularity]);
  useLayoutEffect(() => {
    if (brandWinsGran === state.granularity) return;
    setBrandWins({});
    setBrandWinsGran(state.granularity);
  }, [brandWinsGran, state.granularity, setBrandWins, setBrandWinsGran]);
  useLayoutEffect(() => {
    if (windowIdsGran === state.granularity) return;
    setWindowIdsRaw(null);
    setWindowIdsGran(state.granularity);
  }, [windowIdsGran, state.granularity, setWindowIdsRaw, setWindowIdsGran]);
  // 时间筛选器在图外改范围 → 查看窗口复位为新范围
  const rangeWatchRef = useRef({ gran: state.granularity, key: `${state.rangeStart}|${state.rangeEnd}` });
  useEffect(() => {
    const prev = rangeWatchRef.current;
    const key = `${state.rangeStart}|${state.rangeEnd}`;
    if (prev.gran === state.granularity && prev.key === key) return;
    rangeWatchRef.current = { gran: state.granularity, key };
    if (prev.gran !== state.granularity) return;
    commitWindowIds(null);
  }, [state.granularity, state.rangeStart, state.rangeEnd]);
  // 桶集合变化（粒度 / 国家 / 时间筛选）= 下标失义，刷选与悬停清掉
  const bucketIdsKey = bucketIds.join(',');
  useEffect(() => {
    setBrushRange(null);
    setCrossIdx(null);
    setBrandCross({});
  }, [bucketIdsKey]);
  // 选择集变化 = 图例隐藏 / 悬停残留失效
  const selSig = JSON.stringify(sels.map(selKey));
  useEffect(() => {
    setHiddenKeys(new Set());
    setHoverKey(null);
  }, [selSig]);

  const filterBounds = useMemo<[number, number]>(() => {
    // 代际：域 = 全桶——共享筛选范围是「对标/分列查看窗口」的持久化，代际拼接链天然
    // 跨代，钳到那个尾窗会把链砍掉大半（2026-11-28 返修①补②：win 解钳只是第一步，
    // 面板窗 normalizePanelWindow 与时间轨 lo/hi 也吃同一份 filterBounds，须同源放宽）
    if (lineage) return [0, Math.max(0, buckets.length - 1)];
    const indexOf = (id: string, fallback: number): number => {
      const i = buckets.findIndex((b) => b.id === id);
      return i >= 0 ? i : fallback;
    };
    const start = indexOf(state.rangeStart, 0);
    const end = indexOf(state.rangeEnd, Math.max(0, buckets.length - 1));
    return start <= end ? [start, end] : [end, start];
  }, [buckets, state.rangeStart, state.rangeEnd, lineage]);
  // 代际：窗口不受共享筛选时间范围钳制——filters.rangeStart/End 是「当前查看窗口」的
  // 持久化（对标/分列语义），而代际的数据域天然跨代（ splice 上一代），钳到对标尾窗
  // 会把链砍掉大半。域 = 全桶；收窄仍走 lineage.windowIds（2026-11-28 返修①补）
  const win = useMemo(
    () =>
      normalizeWindow(
        buckets,
        windowIds ??
          (narrowViewport && state.granularity === 'week'
            ? tailWindowIds(bucketIds.slice(filterBounds[0], filterBounds[1] + 1), NARROW_DEFAULT_BUCKETS)
            : null),
        lineage ? undefined : [state.rangeStart, state.rangeEnd],
      ),
    [buckets, windowIds, narrowViewport, state.granularity, bucketIds, filterBounds, state.rangeStart, state.rangeEnd, lineage],
  );

  // ---- 列组图集合：系列归属 = 选择按 selKey 落到组（series.brand 只用于配色，
  //      series/tier 跨品牌组不能按 s.brand 归组） ----
  // 代际模式：每组系列 = 每链一条拼接序列（活跃代点全真复制 + genLabel 附当代名；
  //  overlap = 老一代在交接后仍有价的淡线系列）。拼接需要全集桶——用 buckets（下方
  //  同一份枚举；useMemo 顺序上 buckets 已在前）。
  const lineagePanelSeries = useMemo(() => {
    if (!lineage) return null;
    const byKey = new Map<string, Series>();
    for (const s of allSeries) byKey.set(s.key, s);
    const out = new Map<string, Series[]>();
    for (const g of groups) {
      const chains = lineage.get(g.key) ?? [];
      const list: Series[] = [];
      chains.forEach((chain, ci) => {
        const genSels = chain.gens.map((gen) => gen.sel);
        const genSeriesArr = genSels.map((sel) => {
          const sk = seriesKeyOf(sel);
          return allSeries.find((x) => seriesKeyMatches(x.key, sk)) ?? null;
        });
        const seriesBySelKey = new Map<string, Series>();
        chain.gens.forEach((gen, gi) => {
          if (genSeriesArr[gi]) seriesBySelKey.set(gen.key, genSeriesArr[gi]!);
        });
        const spliced = splicedSeriesOf(chain, seriesBySelKey);
        const genAt = new Map<string, number>();
        for (const pt of spliced.points) if (pt.genIndex != null) genAt.set(pt.bucketId, pt.genIndex);
        // 链标签：最老 → 最新短名（单代链 = 该代全名 + 未登记上一代后缀）
        const tipLabel = chain.gens[chain.gens.length - 1].label;
        const chainLabel = chain.gens.length > 1
          ? `${genShortName(chain.gens[0].label)} → ${genShortName(tipLabel)}`
          : tipLabel;
        const suffix = chain.registered ? '' : '（未登记上一代）';
        const brandKey = brandOfModel(chain.gens[chain.gens.length - 1].sel.modelId);
        const points = splicedSeriesPointsOf(
          genSeriesArr,
          chain.gens.map((gen) => gen.label),
          genAt,
          buckets,
        );
        list.push({
          key: `lineage:${chain.key}`,
          isOwn: brandKey === ownBrand(),
          brand: brandKey,
          label: `${chainLabel}${suffix}`,
          skuIds: chain.gens[chain.gens.length - 1].sel.skuIds,
          color: brandColorOf(brandKey),
          points,
          lineDash: dashPatternAt(ci),
        });
        // overlap：老一代交接后仍有价的淡线（同色系、细虚线、不进图例隐藏语义——
        // 与主链同生死：键带主链前缀，隐藏主链时 Chart 侧只按精确键匹配故独立；
        //  图例药丸只列主链，overlap 作主链的陪衬存在）
        for (const ov of spliced.overlap) {
          const ovPoints: Series['points'] = buckets.map((b) => {
            const hit = ov.points.find((x) => x.bucketId === b.id);
            const ref = genSeriesArr[ov.genIndex]?.points.find((x) => x.bucketId === b.id) ?? null;
            if (!hit || !ref) {
              return {
                bucketId: b.id, xLabel: b.xLabel, anchorDate: '', rrp: null, price: null,
                missing: true, offer: null, url: '', shopName: null, genLabel: null,
              };
            }
            return { ...ref, genLabel: chain.gens[ov.genIndex]?.label ?? null };
          });
          if (!ovPoints.some((x) => !x.missing)) continue;
          list.push({
            key: `lineage:${chain.key}#overlap${ov.genIndex}`,
            isOwn: brandKey === ownBrand(),
            brand: brandKey,
            label: `${chain.gens[ov.genIndex]?.label ?? ''}（上一代在售）`,
            skuIds: [],
            color: brandColorOf(brandKey),
            points: ovPoints,
            lineDash: [2, 3],
          });
        }
      });
      out.set(g.key, list);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineage, groups, allSeries, buckets]);

  // 代际交接标记：组键 → [{ bucketId, label }]（全局桶 id；Chart 侧换算窗口内下标）
  const lineageHandovers = useMemo(() => {
    if (!lineage) return null;
    const out = new Map<string, { bucketId: string; label: string }[]>();
    for (const g of groups) {
      const chains = lineage.get(g.key) ?? [];
      const marks: { bucketId: string; label: string }[] = [];
      for (const chain of chains) {
        const genSeriesArr = chain.gens.map((gen) => {
          const sk = seriesKeyOf(gen.sel);
          return allSeries.find((x) => seriesKeyMatches(x.key, sk)) ?? null;
        });
        const seriesBySelKey = new Map<string, Series>();
        chain.gens.forEach((gen, gi) => {
          if (genSeriesArr[gi]) seriesBySelKey.set(gen.key, genSeriesArr[gi]!);
        });
        const spliced = splicedSeriesOf(chain, seriesBySelKey);
        for (const st of spliced.steps) {
          if (st.handover) marks.push({ bucketId: st.bucketId, label: genShortName(chain.gens[st.genIndex]?.label ?? '') });
        }
      }
      out.set(g.key, marks);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineage, groups, allSeries]);

  const groupSig = groups.map((g) => g.key).join('|');
  const panelData = useMemo(
    () =>
      groups.map((g) => {
        const keys = g.sels.map((sel) => seriesKeyOf(sel));
        return {
          key: g.key,
          label: g.label,
          brand: g.brand,
          series: lineagePanelSeries?.get(g.key) ?? allSeries.filter((s) => keys.some((k) => seriesKeyMatches(s.key, k))),
          failed: allSeriesRes.failed,
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groupSig, allSeries, allSeriesRes.failed, lineagePanelSeries],
  );
  const effWins = useMemo(() => {
    const m: Record<string, [number, number]> = {};
    for (const p of panelData) m[p.key] = normalizePanelWindow(brandWins[p.key] ?? null, win.s, win.e, filterBounds[0], filterBounds[1]);
    return m;
  }, [panelData, brandWins, win.s, win.e, filterBounds]);
  const panelViews = useMemo(
    () =>
      panelData.map((p) => {
        const [ps, pe] = effWins[p.key] ?? [win.s, win.e];
        const all = sliceVis(p.series, ps, pe);
        return { ...p, all, vis: all.filter((x) => !hiddenKeys.has(x.key)), win: [ps, pe] as [number, number] };
      }),
    [panelData, effWins, win.s, win.e, hiddenKeys],
  );

  // ---- Y 轴：共享 = 全部品牌可见系列并集算一次；独立 = 各图自适应 ----
  const adaptKey = JSON.stringify([
    selectedProductKey,
    [...hiddenKeys].sort().join(','),
    state.priceTypes.discounted, state.priceTypes.rrp,
    state.currency, state.granularity, state.rangeStart, state.rangeEnd,
    yCompress,
    stablePlatform,
    panelViews.map((p) => p.win.join(':')).join('|'),
  ]);
  // 刻度基线（步长滞回 + 非触发时机冻结）按键存：共享 Y 轴全部图共用一个键，独立 Y 轴每品牌一键
  const SHARED_SCALE_KEY = '__shared__';
  const scaleBaseRef = useRef<{ key: string; intervalUsd: Record<string, number> } | null>(null);
  const scalePrevRef = useRef<Record<string, YScale>>({});
  const scaleFor = useCallback(
    (refKey: string, series: Series[]): YScale => {
      if (adjusting && scalePrevRef.current[refKey]) return scalePrevRef.current[refKey];
      const frozen = scaleBaseRef.current && scaleBaseRef.current.key === adaptKey && scaleBaseRef.current.intervalUsd[refKey] != null
        ? { intervalUsd: scaleBaseRef.current.intervalUsd[refKey] }
        : undefined;
      return computeYAxis({
        series,
        priceTypes: state.priceTypes,
        sliderScale,
        allowBreak: yCompress,
        perUsd: perUsdOf(state.currency),
        prev: scalePrevRef.current[refKey],
        freeze: frozen,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [adaptKey, state.priceTypes, sliderScale, yCompress, state.currency, adjusting],
  );
  const scales = useMemo(() => {
    const m: Record<string, YScale> = {};
    if (sharedY) {
      // 并集算一次，全部品牌图受控传入同一模型（刻度逐像素一致）
      const union = scaleFor(SHARED_SCALE_KEY, panelViews.flatMap((p) => p.vis));
      for (const p of panelViews) m[p.key] = union;
      return m;
    }
    for (const p of panelViews) m[p.key] = scaleFor(p.key, p.vis);
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedY, panelViews, scaleFor]);
  useEffect(() => {
    if (adjusting) return; // 刷选拖动中冻结：不更新基线
    const prev: Record<string, YScale> = {};
    const intervalUsd: Record<string, number> = {};
    if (sharedY) {
      // 未选品牌时没有任何图：不建基线（空态不渲染图）
      const first = panelViews[0];
      if (first) {
        prev[SHARED_SCALE_KEY] = scales[first.key];
        intervalUsd[SHARED_SCALE_KEY] = scales[first.key].intervalUsd;
      }
    } else {
      for (const p of panelViews) {
        prev[p.key] = scales[p.key];
        intervalUsd[p.key] = scales[p.key].intervalUsd;
      }
    }
    scalePrevRef.current = prev;
    scaleBaseRef.current = { key: adaptKey, intervalUsd };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adaptKey, scales, adjusting, sharedY, panelViews]);

  const yAxisVisible = showYTicks || (state.currency === 'usd' && showTiers);
  const panelGridTop = (yAxisVisible ? Y_AXIS_TOP_BAND : 8) + PANE_HEAD_H;
  // 名称带宽：合并 / 全部品牌图统一取全局最长名（各图等宽，名称完整不换行）
  const nameZoneW = useMemo(() => {
    const widthOf = (list: Series[], plotH: number): number => {
      const pills = list.map((s) => seriesPillMetaOf(s));
      // 生命周期第二行只在季粒度渲染（与 PriceTrend.nameZoneW 同口径）
      const quarter = state.granularity === 'quarter';
      const degraded = nameZoneTwoRowDegraded(pills.map((p) => p.cfg || ''), plotH, (i) => quarter && lifecycleDeltaOf(list[i].skuIds) != null);
      return nameZoneWidthOf(degraded ? pills.map((p) => (p.cfg ? { ...p, name: `${p.name} ${p.cfg}`.trim(), cfg: '' } : p)) : pills);
    };
    const w = Math.max(0, ...panelViews.map((p) => widthOf(p.vis, scales[p.key]?.plotHeight ?? Number.POSITIVE_INFINITY)));
    // 代际视图名称带封顶 120px（2026-11-28 返修②）：链名（「老 → 新 + 配置」）天然长，
    // 三列窄卡下全宽名称带吃掉 ~40% 绘图区；药丸文本超长截断，全名留在 pill title。
    return lineage ? Math.min(w, 120) : w;
  }, [panelViews, scales, state.granularity, lineage]);
  const tickTexts = useMemo(() => {
    // 共享 Y 轴 = 全图同一份刻度文案；独立 Y 轴 = 各图自己的（共享轴列不出）
    const first = panelViews[0];
    return first ? axisTickTextsOf(scales[first.key]) : [];
  }, [scales, panelViews]);
  const axisW = splitAxisWidth(state.currency, showYTicks, showTiers, tickTexts);
  const ownAxisGridLeft = estGridLeft(state.currency, showYTicks, showTiers, tickTexts, nameZoneW);
  const tierValues = useMemo(() => collectTierValues(panelViews.flatMap((p) => p.vis), state.priceTypes), [panelViews, state.priceTypes]);

  // ---- 大促背景带（随国家日历；各图按自己的生效窗口自算）----
  const scopedPromos = useMemo(() => {
    const fromSeries = new Set<string>();
    for (const s of allSeries) for (const pl of s.channelBadge?.platforms ?? []) fromSeries.add(pl);
    const lower = new Set([...fromSeries].map((p) => p.toLowerCase().replace(/[^a-z0-9]/g, '')));
    return dimPromo.filter(
      (p) => p.country_code === state.countryCode
        && (p.platforms == null || p.platforms.some((pl) => lower.has(pl.toLowerCase().replace(/[^a-z0-9]/g, ''))) || fromSeries.size === 0),
    );
  }, [state.countryCode, allSeries]);
  const promoBandsOf = useCallback(
    (p: { key: string; win: [number, number] }): PromoBand[] => {
      if (!promoBandsOn) return [];
      return buildPromoBands({ promos: scopedPromos, spans: bucketSpans(state.granularity, buckets.slice(p.win[0], p.win[1] + 1)) });
    },
    [promoBandsOn, scopedPromos, state.granularity, buckets],
  );

  // ---- 交互 ----
  const onWindowChange = (s: number, e: number): void => {
    if (!buckets[s] || !buckets[e]) return;
    commitWindowIds([buckets[s].id, buckets[e].id]);
  };
  const onGroupWindowChange = (groupKey: string) => (s: number, e: number): void => {
    if (!buckets[s] || !buckets[e]) return;
    commitBrandWins((prev) => ({ ...prev, [groupKey]: [s, e] }));
  };
  const toggleSynced = (): void => {
    if (synced) commitBrandWins((prev) => {
      const next = { ...prev };
      for (const p of panelViews) next[p.key] = [win.s, win.e];
      return next;
    });
    else commitBrandWins({});
    setSynced(!synced);
    setCrossIdx(null);
    setBrandCross({});
  };
  const onCrossOf = (groupKey: string) => (v: number | null): void => {
    if (synced) setCrossIdx((cur) => (cur === v ? cur : v));
    else setBrandCross((prev) => (prev[groupKey] === v ? prev : { ...prev, [groupKey]: v }));
  };
  const toggleHidden = (key: string): void => {
    setHiddenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const allWindowSeries = useMemo(() => panelViews.flatMap((p) => p.all), [panelViews]);
  // 基准：用户显式选的临时基准；基准系列须在图上（有数据）才生效
  const baseline = useMemo(() => {
    if (!baselineKey) return null;
    const sel = sels.find((g) => selKey(g) === baselineKey) ?? null;
    if (!sel) return null;
    const key = seriesKeyOf(sel);
    const owner = panelViews.find((p) => p.all.some((x) => seriesKeyMatches(x.key, key))) ?? null;
    return owner ? { key, groupKey: owner.key, sel } : null;
  }, [baselineKey, sels, panelViews]);
  const baselineOptions = useMemo(
    () =>
      groups.map((g) => ({
        label: g.label,
        options: g.sels
          .map((sel) => {
            const key = seriesKeyOf(sel);
            const onChart = allWindowSeries.some((x) => seriesKeyMatches(x.key, key));
            return { value: selKey(sel), label: `${modelNameOf(sel.modelId)}${configTextOf(sel.romram) ? ` ${configTextOf(sel.romram)}` : ''}`, disabled: !onChart };
          }),
      })),
    [groups, allWindowSeries],
  );

  // ---- 图下「品牌价格明细」取数：每品牌一组、按共享窗口切片（宽表列头 = 共享窗口桶）----
  const sharedSlice = useMemo(() => panelData.map((p) => ({ ...p, vis: sliceVis(p.series, win.s, win.e) })), [panelData, win.s, win.e]);
  const tableGroups: TableGroup[] = useMemo(
    () =>
      sharedSlice.map((p, i) => {
        const base = baseline && baseline.groupKey === p.key ? baseline.key : null;
        const series = base
          ? [...p.vis].sort((a, b) => (seriesKeyMatches(a.key, base) ? -1 : seriesKeyMatches(b.key, base) ? 1 : 0))
          : p.vis;
        return { id: `columns-${p.key}`, ordinal: i + 1, mainKey: base, series, label: p.label };
      }),
    [sharedSlice, baseline],
  );
  const tableBuckets = useMemo<DetailBucket[]>(
    () =>
      buckets.slice(win.s, win.e + 1).map((b) => ({
        id: b.id,
        xLabel: b.xLabel,
        anchorDate: bucketAnchorDate(state.granularity, b.id) ?? '',
      })),
    [buckets, win.s, win.e, state.granularity],
  );
  // 「近 4 周环比」锚定当前窗口末周：周粒度 = 末桶；月 / 季 = 末桶内最晚的周
  const tableEndWeekId = useMemo<string | null>(() => {
    const endBucket = buckets[win.e];
    if (!endBucket) return null;
    if (state.granularity === 'week') return endBucket.id;
    const field = state.granularity === 'month' ? 'month_id' : 'quarter_id';
    let endWeek: string | null = null;
    for (const row of dimTime) {
      if (row[field] !== endBucket.id) continue;
      if (endWeek == null || row.week_id > endWeek) endWeek = row.week_id;
    }
    return endWeek;
  }, [buckets, win.e, state.granularity]);
  const fourWeekChanges = useMemo<ReadonlyMap<string, number | null>>(
    () => new Map<string, number | null>(weeklySeries.map((s): [string, number | null] => [
      s.key,
      recentFourWeekChange(tableEndWeekId == null ? [] : s.points.filter((pt) => pt.bucketId <= tableEndWeekId)),
    ])),
    [weeklySeries, tableEndWeekId],
  );
  const onSeriesWindowRef = useRef(props.onSeriesWindow);
  onSeriesWindowRef.current = props.onSeriesWindow;
  useEffect(() => {
    onSeriesWindowRef.current?.(tableGroups, tableBuckets, fourWeekChanges);
  }, [tableGroups, tableBuckets, fourWeekChanges]);

  // ---- 渲染 ----
  const cols = columnsGridOf(panelViews.length);
  const rows: typeof panelViews[] = [];
  for (let i = 0; i < panelViews.length; i += cols) rows.push(panelViews.slice(i, i + cols));

  /** 时间轴同步开关（与各品牌图底部时间轨同一水平线；共享 Y 轴时挂在第一行的轴列下，
   *  独立 Y 轴没有轴列则放回工具行——同一份状态、同一枚按钮） */
  const syncToggle = (
    <button
      type="button"
      aria-label="轴同步"
      aria-pressed={synced}
      title={synced ? '同步：各品牌图共用一段查看时间，拖任一时间轨全部联动' : '独立：各品牌图分别调整查看时间'}
      onClick={toggleSynced}
      style={{
        height: 30, padding: '0 9px', borderRadius: radius.control,
        border: `1px solid ${synced ? selectAccent : color.hairlineStrong}`,
        background: synced ? selectSoft : color.canvas,
        color: synced ? selectSoftInk : color.body,
        font: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
        whiteSpace: 'nowrap',
      }}
    >
      轴同步
    </button>
  );
  /** 共享 Y 轴列：每行一根（同一 yScale，三列网格换行后各行都读得到刻度） */
  const axisColumn = (scale: YScale, withToggle: boolean) => (
    <div style={{ flex: `0 0 ${axisW}px`, paddingTop: PANEL_HEAD_H, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      <SplitAxisColumn
        yScale={scale}
        currency={state.currency}
        industry={state.industry}
        gridLeft={axisW}
        panelGridTop={panelGridTop}
        showYTicks={showYTicks}
        showTiers={showTiers}
        tickTexts={tickTexts}
        tierValues={tierValues}
      />
      <div style={{ height: SPLIT_TRACK_H, position: 'relative', flexShrink: 0 }}>
        {withToggle && (
          <div style={{ position: 'absolute', left: 0, right: 0, top: -2, display: 'flex', justifyContent: 'center' }}>
            {syncToggle}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div data-testid="columns-view" className="lpl-fade-in">
      {/* 工具行 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: space.md, rowGap: 6, minHeight: 32, marginBottom: space.sm, padding: '0 6px' }}>
        <ConfigProvider theme={filterBarTheme}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: color.mute }}>Y 轴</span>
            <Segmented
              size="small"
              aria-label="Y 轴"
              value={sharedY ? 'shared' : 'independent'}
              onChange={(v) => actions.setColumns({ sharedY: v === 'shared' })}
              options={[
                { label: '共享', value: 'shared' },
                { label: '独立', value: 'independent' },
              ]}
            />
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span id="lpl-columns-baseline-label" style={{ fontSize: 12, color: color.mute }}>价差基准</span>
            <Select
              size="small"
              aria-labelledby="lpl-columns-baseline-label"
              placeholder="无（只看价格）"
              value={baselineKey ?? undefined}
              onChange={(v) => actions.setColumns({ baselineKey: (v as string | undefined) ?? null })}
              options={baselineOptions}
              allowClear
              showSearch
              optionFilterProp="label"
              style={{ width: 220 }}
              popupMatchSelectWidth={false}
              disabled={selCount === 0}
            />
          </span>
        </ConfigProvider>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {!sharedY && groups.length > 0 && syncToggle}
          {allWindowSeries.length > 0 && (
            <LegendTools series={allWindowSeries} hiddenKeys={hiddenKeys} onSetHidden={setHiddenKeys} onHover={setHoverKey} />
          )}
        </span>
      </div>

      {groups.length === 0 ? (
        <div role="status" data-testid="columns-empty" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 220, border: `1px dashed ${color.hairlineStrong}`, borderRadius: radius.card, background: color.canvas, color: color.mute, fontSize: 13, textAlign: 'center', padding: space.lg }}>
          <div style={{ fontWeight: 600, color: color.body }}>分列视图尚未选择产品</div>
          <div>点击筛选条「{INDUSTRY_LABELS[state.industry] ?? ''}」入口选择产品（按产品或按档位）；可选多个品牌 / 系列 / 档位，逐组一张图。</div>
        </div>
      ) : (
        <div className="lpl-card-scroll" style={{ display: 'flex', flexDirection: 'column', gap: space.md }}>
          {rows.map((row, ri) => (
            <div key={`row-${ri}`} style={{ display: 'flex', alignItems: 'flex-start', gap: space.md }}>
              {sharedY && scales[row[0].key] && axisColumn(scales[row[0].key], ri === 0)}
              <div style={{ flex: '1 1 0', minWidth: 0, display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(280px, 1fr))`, gap: space.md }}>
                {row.map((p) => {
                  const scale = scales[p.key];
                  const pw = p.win;
                  const ownBrush = brushInWindow(brushRange, pw[0], pw[1]);
                  const baselineHere = baseline && baseline.groupKey === p.key ? baseline.key : null;
                  const hoverHere = hoverKey != null && p.all.some((x) => x.key === hoverKey) ? hoverKey : null;
                  return (
                    <div
                      key={p.key}
                      role="figure"
                      aria-label={`${p.label} 价格走势`}
                      data-testid="columns-card"
                      style={{
                        position: 'relative',
                        minWidth: 280,
                        border: `1px solid ${color.hairline}`,
                        borderRadius: radius.card,
                        padding: '0 8px',
                        background: color.canvas,
                        boxSizing: 'border-box',
                      }}
                    >
                      <div style={{ height: PANEL_HEAD_H, display: 'flex', alignItems: 'center', gap: 8, padding: '0 4px', minWidth: 0 }}>
                        {p.brand ? <BrandDot brand={p.brand} /> : null}
                        <span style={{ fontSize: 13, fontWeight: 600, color: color.ink, whiteSpace: 'nowrap' }}>{p.label}</span>
                        <span className="tnum" style={{ fontSize: 11, color: color.mute, whiteSpace: 'nowrap' }}>
                          {p.series.length} 款
                          {baselineHere ? ' · 含基准' : ''}
                        </span>
                      </div>
                      <Chart
                        // 区间刷选：选了临时基准 = 量尺只量基准线（悬停药丸可临时带出一条）；
                        // 未选基准 = 普通高亮刷选，全部折线保留
                        series={ownBrush && baselineHere ? p.vis.filter((v) => seriesKeyMatches(v.key, baselineHere) || v.key === hoverHere) : p.vis}
                        hiddenKeys={hiddenKeys}
                        nameSeries={p.all}
                        onToggleHidden={toggleHidden}
                        brush={ownBrush}
                        onBrushChange={(r) => setBrushRange(r ? [r[0] + pw[0], r[1] + pw[0]] : null)}
                        rangeMode={baselineHere ? rangeMode : undefined}
                        onRangeMode={baselineHere ? setRangeMode : undefined}
                        rulerKey={baselineHere ?? null}
                        granularity={state.granularity}
                        currency={state.currency}
                        priceTypes={state.priceTypes}
                        tipMode={tipMode}
                        gridLeft={sharedY ? nameZoneW : ownAxisGridLeft}
                        gridTop={panelGridTop}
                        chrome={false}
                        axisChrome={sharedY ? false : undefined}
                        axisTickTexts={sharedY ? undefined : axisTickTextsOf(scale)}
                        showYTicks={showYTicks}
                        showTiers={showTiers}
                        enableOffer={false}
                        windowKey={`${pw[0]}:${pw[1]}:${p.key}:${sharedY ? 's' : 'i'}`}
                        yScale={scale}
                        nameZoneWidth={nameZoneW}
                        paneLabels
                        paneLabelLayout="head"
                        tipDiffBaseKey={baselineHere}
                        legendHoverKey={hoverHere}
                        lineShape={lineShape}
                        markers={
                          lineageHandovers?.get(p.key)
                            ?.map((m) => {
                              const gi = bucketIds.indexOf(m.bucketId);
                              const wi = gi - pw[0];
                              return wi >= 0 && wi <= pw[1] - pw[0] ? { idx: wi, label: m.label } : null;
                            })
                            .filter(Boolean) as { idx: number; label: string }[]
                        }
                        labelMode={labelMode}
                        promoBandsOn={promoBandsOn}
                        promoBands={promoBandsOf(p)}
                        anomalyActions
                        showXLabels
                        crosshairIdx={synced ? crossIdx : brandCross[p.key] ?? null}
                        onCrosshairMove={onCrossOf(p.key)}
                        crosshairY={synced && sharedY ? crossY : null}
                        onCrosshairYMove={setCrossY}
                        emptyHint={p.failed ? LOAD_ERROR_HINT : state.countryCode === 'ZA' ? '南非运营商小册子暂无该产品的已发布月度数据' : '该组已选产品在所选时间范围内无数据'}
                      />
                      <div style={{ margin: `0 ${8 + GRID.right}px 6px ${8 + (sharedY ? nameZoneW : ownAxisGridLeft)}px` }}>
                        <SplitTimeTrack
                          ids={bucketIds}
                          lo={filterBounds[0]}
                          hi={filterBounds[1]}
                          s={pw[0]}
                          e={pw[1]}
                          granularity={state.granularity}
                          onChange={synced ? onWindowChange : onGroupWindowChange(p.key)}
                          onAdjusting={setAdjusting}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
