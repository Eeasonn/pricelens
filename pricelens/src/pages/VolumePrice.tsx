// ============================================================
// 第一百一十三轮（2026-10-21）量价看板：三面板并排（价格折线 + 底部销量柱）。
// 面板结构照价格看板分离模式：共享 Y 轴列（SplitAxisColumn，三面板价格并集
// 算一次 computeYAxis 受控传入，含步长滞回与刷选冻结）、共享 X 刷选条（只调
// 查看时间段，粒度切换走 actions.setGranularity）、跨面板悬停参考线 + 面板头
// 销量读数随悬停列联动。时间窗口 / 自适应 / 桶换算与价格看板同口径（§6.5）。
// 销量柱：绘图区底部默认 34%；上限恒为各面板自动 niceCeil(窗口内最大值)，
// 柱高线性映射。柱区高度调节 = 每图右侧「销量轴」拉伸柄（上下拖 12%..100%、
// 双击复位 34%，bandFracs 随 yAxisResetKey 复位）；原标题行三档口径 Segmented、
// 单图上限覆写药丸已删。图内不画名称药丸（产品名在面板头），图贴左缘。
// 销量为估算口径（dataModel/volume），接入真实销量后替换。
// 默认三槽：槽1 = 自有首个勾选（无则竞品首个）；槽2/3 = 其对标竞品前两个，
// 不足用竞品勾选补，仍不足留空；自有首选或国家/产业变化时重置三槽。
// 第一百一十四轮（评审）：①悬停明细改图下方居中预留框（Chart tipBox；无悬停灰色
// 斜体提示）②横向虚线随鼠标 Y 横跨三面板（crossY 共享）③标题行「价格显示」
// 详细/精简（默认精简）④面板头/下拉分组不再出现「自有」字样标注（铁律）。
// 第一百一十九轮（走查会）：①时间筛选簇上移卡顶工具行，底部左位改「同步」开关——
// 同步 = 三面板共用一条查看时间调整条（原行为）；非同步 = 每张图底部独立时间轴
// （PanelTimeTrack，互不影响），用于对齐不同上市节奏产品的可比区间。
// ②悬停时间列/图内拖选高亮随同步态走：同步 = 三面板同列联动，非同步 = 各面板独立。
// ③大盘卡时间域：同步 = 共享窗口；非同步 = 各面板生效窗口的并集。
// 第一百二十三轮：底部共享刷选条退役——每面板底部恒渲染同一条独立时间轴（同步 =
// 三图同段查看时间、拖任一条同步调整；非同步 = 各图独立），底部只留「同步」开关，
// 切换同步态不再改变面板高度与轨道横向位置。
// 第一百二十六轮：时间轴并为单层——图内 x 轴日期标签删除，面板底部 PanelTimeTrack
// 成为唯一日期层（拖柄/平移/刻度口径不变）；「同步」开关从底部独立行挪进共享 Y 轴
// 列正下方，与各面板时间轴同一水平线，语义不变（同步 = 三图共用窗口拖任一联动）。
// 第一百三十一轮波2：时间筛选簇上移顶部筛选条（FilterBar showTime），卡顶工具行
// 只剩齿轮簇；范围在页外被改时查看窗口整体复位为新范围（监听范围变化自理）。
// 本轮（视图态跨页保留 P1-5）：slots / synced / panelWins / labelMode 改
// usePageViewState（sessionStorage 会话态）——切价格看板再切回全部保留；刷新或
// 新开页签回到默认（页签级会话口径）。瞬态（悬停/拖选/柱区比例/几何）不持久化。
// ============================================================
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ConfigProvider, Segmented } from 'antd';
import { useFilters } from '../state/FiltersContext';
import usePageViewState from '../state/usePageViewState';
import FilterBar from '../components/FilterBar';
import PageHeader from '../components/PageHeader';
import { filterBarTheme } from '../components/FilterBar';
import { ownBrand } from '../components/ProductCascader/tree';
import Chart from '../chart/PriceTrend/Chart';
import ChartToolbar from '../chart/PriceTrend/ChartToolbar';
// 第一百三十一轮波2：卡顶时间筛选簇上移顶部筛选条，本页不再引用 XBrush/TimeRangeCluster
import SplitAxisColumn from '../chart/PriceTrend/SplitAxisColumn';
import { collectTierValues, type LineShapeChoice } from '../chart/PriceTrend/chartModel';
import {
  adaptiveRangeOf,
  computeYAxis,
  convertWindowIds,
  dataBucketRange,
  enumerateBuckets,
  estGridLeft,
  normalizeWindow,
  perUsdOf,
  seriesSpanRange,
  splitAxisWidth,
  type Bucket,
  type StripGeom,
  type YScale,
} from '../chart/PriceTrend/helpers';
import { buildSeries, lowestPriceColorSku } from '../dataModel/aggregate';
import { volumeByBuckets } from '../dataModel/volume';
import { dimProduct } from '../data';
import type { AggMode, Series, SeriesPoint } from '../dataModel/types';
import type { MainProduct } from '../state/filtersTypes';
import { brandColorOf, color, fontSize, radius, selectAccent, selectSoft, selectSoftInk, shadow, space } from '../theme/tokens';
import VolumeBars, { BAND_FRAC_DEFAULT } from './volume/VolumeBars';
import PanelHeader, { type VolumeOption } from './volume/PanelHeader';
import PanelTimeTrack from './volume/PanelTimeTrack';
import MarketBoard from './volume/MarketBoard';
import { normalizePanelWindow, vMaxOf, type VolumeSlot } from './volume/volumeAxis';

const SLOTS = 3;
const PANEL_HEAD_H = 32; // 面板头定高：共享轴列的纵向对齐基准
const PANEL_GRID_TOP = 14; // 面板图顶窄空气带（同分离模式）
const CHART_GRID_LEFT = 8; // 图贴面板左缘：名称药丸已删，产品名在面板头
const CHART_GRID_RIGHT = 56; // 第一百一十五轮：右侧预留销量轴列（轨道线3px+右侧刻度数字+骑线拖柄）

interface SlotInfo {
  isOwn: boolean;
  brand: string;
  skuIds: string[];
}

/** 槽位 → 取数信息：代表 SKU = 最低价颜色（无价数据回退该配置全部颜色 SKU） */
function resolveSlot(slot: VolumeSlot, cc: string): SlotInfo | null {
  const norm = slot.romram.replace(/\s+/g, '');
  const rows = dimProduct.filter((p) => p.model_id === slot.modelId && p.romram.replace(/\s+/g, '') === norm);
  if (rows.length === 0) return null;
  const pool = rows.filter((p) => p.countries.includes(cc));
  const skuPool = pool.length ? pool : rows;
  const low = lowestPriceColorSku(slot.modelId, slot.romram, cc);
  const skuIds = low != null && skuPool.some((p) => p.sku_id === low) ? [low] : skuPool.map((p) => p.sku_id);
  return { isOwn: rows[0].is_own === true, brand: rows[0].brand, skuIds };
}

/** 默认三槽（第一百一十七轮；第一百二十轮随单主品卡形）：槽1 = 首张主分析卡的主品；
 *  槽2/3 = 该卡对比区前两个；后续卡（主品 + 对比区）依次补位 */
function defaultSlots(mains: MainProduct[]): (VolumeSlot | null)[] {
  const picks: VolumeSlot[] = [];
  const push = (s: VolumeSlot | null): void => {
    if (!s || picks.length >= SLOTS) return;
    if (picks.some((p) => p.modelId === s.modelId && p.romram.replace(/\s+/g, '') === s.romram.replace(/\s+/g, ''))) return;
    picks.push(s);
  };
  for (const card of mains) {
    if (card.main) push({ modelId: card.main.modelId, romram: card.main.romram });
    for (const c of card.compares) push({ modelId: c.modelId, romram: c.romram });
    if (picks.length >= SLOTS) break;
  }
  return [0, 1, 2].map((i) => picks[i] ?? null);
}

export default function VolumePrice() {
  const { state, actions } = useFilters();
  const cc = state.countryCode;

  // ---- 视图状态（同价格看板口径；三面板共用）。槽位/同步态/面板独立窗口/价格
  //      显示 = 会话态跨页保留（P1-5，usePageViewState）；其余为瞬态 ----
  const [slots, setSlots] = usePageViewState<(VolumeSlot | null)[]>('volume.slots', () => defaultSlots(state.mains));
  const [sliderScale, setSliderScale] = useState(1);
  const [yCompress, setYCompress] = useState(false);
  const [showYTicks, setShowYTicks] = useState(true);
  const [lineShape, setLineShape] = useState<LineShapeChoice>('auto');
  // 第一百一十四轮（评审）：价格显示（默认精简，会话态跨页保留）+ 三面板共享悬停纵向位置（横向虚线）
  const [labelMode, setLabelMode] = usePageViewState<'detail' | 'compact'>('volume.labelMode', () => 'compact');
  const [crossY, setCrossY] = useState<number | null>(null);
  const [adjusting, setAdjusting] = useState(false); // 刷选拖动中冻结价格 Y 轴
  const [windowIds, setWindowIds] = useState<[string, string] | null>(null);
  const [bandFracs, setBandFracs] = useState<number[]>(() => new Array(SLOTS).fill(BAND_FRAC_DEFAULT)); // 各图柱区高比例（右侧拉伸柄）
  // ---- 第119轮（走查会）：同步/非同步查看时间。同步 = 三面板共用窗口（原行为）；
  //      非同步 = 每面板独立时间轴（panelWins 记各面板窗口，null = 未单独调整过）。
  //      两项均会话态跨页保留（P1-5）----
  const [synced, setSynced] = usePageViewState<boolean>('volume.synced', () => true);
  const [panelWins, setPanelWins] = usePageViewState<([number, number] | null)[]>('volume.panelWins', () => [null, null, null]);
  const [hoverIdxs, setHoverIdxs] = useState<(number | null)[]>([null, null, null]); // 各面板悬停时间列（同步模式三列恒等）
  const [geoms, setGeoms] = useState<(StripGeom | null)[]>([null, null, null]); // 各面板绘图区横向几何
  // ---- 第118轮（评审）：图内拖选时间段——面板级高亮（brush = 已提交，
  //      brushLive = 拖动中实时预览；高亮只做聚焦分析，不改动查看时间）----
  const [brushes, setBrushes] = useState<([number, number] | null)[]>([null, null, null]);
  const [brushLive, setBrushLive] = useState<([number, number] | null)[]>([null, null, null]);

  // 首张主分析卡 / 国家 / 产业变化 → 三槽重置为默认（手选槽位此时被重置）
  const slotResetKey = JSON.stringify([state.mains[0]?.main?.modelId ?? null, state.mains[0]?.main?.romram ?? null, cc, state.industry]);
  const slotResetRef = useRef(slotResetKey);
  useEffect(() => {
    if (slotResetRef.current === slotResetKey) return;
    slotResetRef.current = slotResetKey;
    setSlots(defaultSlots(state.mains));
    setPanelWins([null, null, null]);
    setBrushes([null, null, null]);
    setBrushLive([null, null, null]);
    setHoverIdxs([null, null, null]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotResetKey]);

  // 换产品/价格类型/币种 → 高度倍率与销量柱区比例复位（同看板 §5.6）
  const yAxisResetKey = JSON.stringify([slots, state.priceTypes, state.currency]);
  useEffect(() => {
    setSliderScale(1);
    setBandFracs(new Array(SLOTS).fill(BAND_FRAC_DEFAULT));
  }, [yAxisResetKey]);

  // 粒度切换 → 窗口端点对齐新粒度桶边界（保持同一时间跨度）；面板独立时间轴按桶号
  // 失义回落共享窗口（第119轮）
  const granRef = useRef(state.granularity);
  useLayoutEffect(() => {
    if (granRef.current === state.granularity) return;
    const prev = granRef.current;
    granRef.current = state.granularity;
    setWindowIds((ids) => (ids ? convertWindowIds(ids, prev, state.granularity) : null));
    setPanelWins([null, null, null]);
  }, [state.granularity]);

  // ---- 取数：每面板独立 buildSeries（数据全集，窗口切片照分离模式） ----
  const [dataStart, dataEnd] = useMemo(() => dataBucketRange(state.granularity), [state.granularity]);
  const buckets: Bucket[] = useMemo(
    () => enumerateBuckets(state.granularity, dataStart, dataEnd),
    [state.granularity, dataStart, dataEnd],
  );

  const panelData = useMemo(
    () =>
      slots.map((slot, i) => {
        if (!slot) return { idx: i, key: `empty-${i}`, slot: null, isOwn: false, brand: '', series: [] as Series[] };
        const info = resolveSlot(slot, cc);
        let series: Series[] = [];
        if (info && info.skuIds.length > 0) {
          try {
            series = buildSeries({
              groups: [{ modelId: slot.modelId, romram: slot.romram, skuIds: info.skuIds, isOwn: info.isOwn }],
              granularity: state.granularity,
              startBucket: dataStart,
              endBucket: dataEnd,
              currency: state.currency,
              agg: state.agg,
              platform: state.platform,
              scope: { countryCode: cc, industry: state.industry },
            });
          } catch {
            series = []; // 空态不崩
          }
        }
        return {
          idx: i,
          key: `${slot.modelId}__${slot.romram.replace(/\s+/g, '')}`,
          slot,
          isOwn: info?.isOwn ?? false,
          brand: info?.brand ?? '',
          series,
        };
      }),
    [slots, cc, state.industry, state.granularity, dataStart, dataEnd, state.currency, state.agg, state.platform],
  );

  // 时间自适应：三面板数据跨度并集 → 上方极值筛选器（同 index.tsx 写法；
  // 本 effect 声明在粒度换算之后：切粒度先换桶，自适应范围随后覆盖）
  const span = useMemo(() => seriesSpanRange(panelData.flatMap((p) => p.series)), [panelData]);
  const adaptiveBounds = useMemo(
    () => (state.adaptive ? adaptiveRangeOf(buckets, span, 0) : null),
    [state.adaptive, buckets, span],
  );
  const adaptiveKey = adaptiveBounds ? `${state.granularity}|${adaptiveBounds[0]}|${adaptiveBounds[1]}` : '';
  const adaptiveAppliedRef = useRef('');
  useLayoutEffect(() => {
    if (!adaptiveBounds) {
      adaptiveAppliedRef.current = '';
      return;
    }
    if (adaptiveAppliedRef.current === adaptiveKey) return;
    adaptiveAppliedRef.current = adaptiveKey;
    actions.set({ rangeStart: adaptiveBounds[0], rangeEnd: adaptiveBounds[1] });
    setWindowIds(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adaptiveKey]);

  // 第一百三十一轮波2：时间筛选器上移顶部筛选条后，改范围不再经过本页——
  // 顶部时间簇手动选段（或页外改动）时查看窗口整体复位为新范围（原
  // onRangeFilterChange 的 setWindowIds(null) 语义随迁）。粒度切换不触发：
  // 范围端点随换粒度换算，窗口已按跨度对齐新桶（上方 granRef 联动）。
  const rangeWatchRef = useRef({ gran: state.granularity, key: `${state.rangeStart}|${state.rangeEnd}` });
  useEffect(() => {
    const prev = rangeWatchRef.current;
    const key = `${state.rangeStart}|${state.rangeEnd}`;
    if (prev.gran === state.granularity && prev.key === key) return;
    rangeWatchRef.current = { gran: state.granularity, key };
    if (prev.gran !== state.granularity) return; // 换粒度：窗口已按跨度换桶
    setWindowIds(null); // 范围在图外被改 → 窗口复位为整个新范围
  }, [state.granularity, state.rangeStart, state.rangeEnd]);

  const win = useMemo(
    () => normalizeWindow(buckets, windowIds, [state.rangeStart, state.rangeEnd]),
    [buckets, windowIds, state.rangeStart, state.rangeEnd],
  );
  const filterBounds = useMemo<[number, number]>(() => {
    const indexOf = (id: string, fallback: number): number => {
      const i = buckets.findIndex((b) => b.id === id);
      return i >= 0 ? i : fallback;
    };
    const start = indexOf(state.rangeStart, 0);
    const end = indexOf(state.rangeEnd, Math.max(0, buckets.length - 1));
    return start <= end ? [start, end] : [end, start];
  }, [buckets, state.rangeStart, state.rangeEnd]);

  // ---- 第119轮（走查会）：各面板生效窗口。同步 = 三面板共用共享窗口（原行为）；
  //      非同步 = 各面板独立窗口（未单独调整过的回落共享窗口，越界钳回可调全域）----
  const effWins = useMemo<[number, number][]>(
    () => [0, 1, 2].map((i) => normalizePanelWindow(panelWins[i], win.s, win.e, filterBounds[0], filterBounds[1])),
    [panelWins, win.s, win.e, filterBounds],
  );
  const toggleSynced = (): void => {
    if (synced) setPanelWins([0, 1, 2].map(() => [win.s, win.e] as [number, number]));
    else setPanelWins([null, null, null]);
    setSynced(!synced);
  };

  // 查看窗口/粒度/同步切换 → 高亮时间段下标失义，自动清除（第118/119轮）
  useEffect(() => {
    setBrushes([null, null, null]);
    setBrushLive([null, null, null]);
  }, [win.s, win.e, state.granularity, synced]);

  // 非同步下面板独立调时间轴只动 effWins，不触发上面的整体清除（共享窗口未变）——
  // 第一百二十五轮：按面板窗口签名精确清，只清窗口变了的面板（下标随窗口平移失义）
  const effWinSigsRef = useRef<string[] | null>(null);
  useEffect(() => {
    const prev = effWinSigsRef.current;
    const next = effWins.map(([s, e]) => `${s}:${e}`);
    effWinSigsRef.current = next;
    if (!prev || next.every((sig, i) => sig === prev[i])) return;
    setBrushes((cur) => cur.map((b, i) => (next[i] === prev[i] ? b : null)));
    setBrushLive((cur) => cur.map((b, i) => (next[i] === prev[i] ? b : null)));
  }, [effWins]);

  // 窗口切片（同分离模式 sliceVis：含边缘续接标记）；非同步时各面板按各自窗口切
  const sliceVis = (list: Series[], s: number, e: number): Series[] => {
    if (s > e) return [];
    const listed = (p?: SeriesPoint) => !!p && (p.price != null || p.rrp != null);
    return list
      .map((x) => {
        const points = x.points.slice(s, e + 1);
        const edgeStart = listed(points[0]) && (listed(x.points[s - 1]) || listed(x.points[s - 2]));
        const edgeEnd = listed(points[points.length - 1]) && (listed(x.points[e + 1]) || listed(x.points[e + 2]));
        return { ...x, points, edgeStart, edgeEnd };
      })
      .filter((x) => x.points.length > 0);
  };
  const panelViews = useMemo(
    () => panelData.map((p, i) => ({ ...p, vis: sliceVis(p.series, effWins[i][0], effWins[i][1]) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [panelData, effWins],
  );

  // ---- 共享价格 Y 轴：三面板可见系列并集算一次（步长滞回 + 刷选冻结） ----
  const visUnion = useMemo(() => panelViews.flatMap((p) => p.vis), [panelViews]);
  const scaleRef = useRef<YScale | null>(null);
  const yCfg = useMemo(() => {
    if (adjusting && scaleRef.current) return scaleRef.current;
    const next = computeYAxis({
      series: visUnion,
      priceTypes: state.priceTypes,
      sliderScale,
      allowBreak: yCompress,
      perUsd: perUsdOf(state.currency),
      prev: scaleRef.current,
    });
    scaleRef.current = next;
    return next;
  }, [visUnion, state.priceTypes, sliderScale, adjusting, yCompress, state.currency]);
  const tierValues = useMemo(() => collectTierValues(visUnion, state.priceTypes), [visUnion, state.priceTypes]);

  // ---- 销量：各面板生效窗口桶口径（非同步时各面板独立；不随平台/币种变化） ----
  const domainIds = useMemo(() => buckets.map((b) => b.id), [buckets]);
  const volumes = useMemo(
    () =>
      panelData.map((p, i) => {
        if (!p.slot) return [];
        const ids = domainIds.slice(effWins[i][0], effWins[i][1] + 1);
        return volumeByBuckets(p.slot.modelId, p.slot.romram, cc, state.granularity, ids);
      }),
    [panelData, domainIds, effWins, cc, state.granularity],
  );
  // 各图销量轴上限恒自动（niceCeil 窗口内最大值）
  const panelVMax = volumes.map((vs) => vMaxOf(vs));

  // 大盘卡时间域（第119轮）：同步 = 共享窗口；非同步 = 各面板生效窗口的并集
  const marketWin = useMemo<[number, number]>(() => {
    if (synced) return [win.s, win.e];
    let s = Infinity;
    let e = -Infinity;
    for (const [a, b] of effWins) {
      s = Math.min(s, a);
      e = Math.max(e, b);
    }
    return [Math.max(0, s), Math.min(Math.max(0, buckets.length - 1), e)];
  }, [synced, win.s, win.e, effWins, buckets.length]);

  // 面板头下拉选项：当前国家 × 产业去重到（型号, 配置），分组 [自有品牌名][竞品]
  // （第一百一十四轮铁律：不出现「我司」标注——自有组以品牌名作组名）
  const productOptions = useMemo<{ label: string; options: VolumeOption[] }[]>(() => {
    const seen = new Set<string>();
    const collect = (own: boolean): VolumeOption[] => {
      const out: VolumeOption[] = [];
      for (const p of dimProduct) {
        if (p.industry !== state.industry || !p.countries.includes(cc) || p.is_own !== own) continue;
        const key = `${p.model_id}|${p.romram}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ value: key, label: `${p.brand} ${p.model_name} ${p.romram}` });
      }
      out.sort((a, b) => a.label.localeCompare(b.label));
      return out;
    };
    const ownOpts = collect(true);
    const compOpts = collect(false);
    return ownOpts.length > 0
      ? [{ label: ownBrand(), options: ownOpts }, { label: '其他品牌', options: compOpts }]
      : [{ label: '其他品牌', options: compOpts }];
  }, [cc, state.industry]);

  // 槽位选择 / 几何上报
  const onSlotSelect = (i: number, key: string | null): void => {
    setSlots((prev) =>
      prev.map((s, k) => {
        if (k !== i) return s;
        if (key == null) return null;
        const sep = key.indexOf('|');
        return { modelId: key.slice(0, sep), romram: key.slice(sep + 1) };
      }),
    );
  };
  const onGeomOf = (i: number) => (g: StripGeom | null): void => {
    setGeoms((prev) => {
      const cur = prev[i];
      if (cur === g) return prev;
      if (cur && g && cur.plotLeft === g.plotLeft && cur.plotWidth === g.plotWidth && cur.n === g.n) return prev;
      const next = [...prev];
      next[i] = g;
      return next;
    });
  };

  // 面板头销量读数：悬停列优先，无悬停取最新有值期
  const volumeReading = (vs: (number | null)[], hov: number | null): number | null => {
    if (hov != null) return vs[hov] ?? null;
    for (let i = vs.length - 1; i >= 0; i--) if (vs[i] != null) return vs[i];
    return null;
  };

  // 面板独立窗口调整（非同步）：只动自己的生效窗口
  const onPanelWindowChange = (idx: number) => (s2: number, e2: number): void => {
    if (!buckets[s2] || !buckets[e2]) return;
    setPanelWins((prev) => prev.map((x, k) => (k === idx ? [s2, e2] : x)));
  };
  // 悬停时间列：同步 = 三面板同列（原行为）；非同步 = 只亮本面板
  const onHoverOf = (idx: number) => (v: number | null): void => {
    setHoverIdxs((prev) => {
      if (synced) return prev.every((x) => x === v) ? prev : [v, v, v];
      return prev.map((x, k) => (k === idx ? v : x));
    });
  };
  // 图内拖选时间段（第118轮）：同步 = 三面板联动；非同步 = 各面板独立高亮
  const onBrushChangeOf = (idx: number) => (r: [number, number] | null, committing: boolean): void => {
    if (committing) {
      setBrushLive([null, null, null]);
      setBrushes((prev) => (synced ? [r, r, r] : prev.map((x, k) => (k === idx ? r : x))));
    } else {
      setBrushLive((prev) => (synced ? [r, r, r] : prev.map((x, k) => (k === idx ? r : x))));
    }
  };

  const setPriceType = (key: 'discounted' | 'rrp', val: boolean): void => {
    const next = { ...state.priceTypes, [key]: val };
    if (!next.discounted && !next.rrp) return; // 至少保留一种价格
    actions.set({ priceTypes: next });
  };

  /** 刷选只调整查看窗口；粒度切换走 actions.setGranularity（保持时间跨度） */
  const onWindowChange = (s: number, e: number): void => {
    if (!buckets[s] || !buckets[e]) return;
    setWindowIds([buckets[s].id, buckets[e].id]);
  };

  /** 「同步」开关（第119轮走查会；第126轮移到共享轴列下方、与时间轴行齐平）：
   *  同步 = 各图查看同一段时间，拖任一图的时间轴三图一起动；非同步 = 各图时间
   *  范围独立调整（用于对齐不同上市节奏产品的可比区间） */
  const syncToggle = (
    <button
      type="button"
      aria-label="同步查看时间"
      aria-pressed={synced}
      title={synced ? '同步：三张图共用一段查看时间' : '独立：各图分别调整'}
      onClick={toggleSynced}
      style={{
        height: 30, padding: '0 9px', borderRadius: radius.control,
        border: `1px solid ${synced ? selectAccent : color.hairlineStrong}`,
        background: synced ? selectSoft : color.canvas,
        color: synced ? selectSoftInk : color.body,
        font: 'inherit', fontSize: fontSize.caption, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
      }}
    >同步</button>
  );

  return (
    <div data-lpl-scroll style={{ height: '100%', overflowX: 'auto', background: color.canvasSoft }}>
      <div style={{ minWidth: 1280, minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
        <PageHeader title="量价看板" />
        <FilterBar showTime />
        <main style={{ flex: 1, padding: space.lg }}>
          <section
            style={{
              background: color.canvas,
              boxShadow: shadow.l1,
              borderRadius: radius.card,
              padding: space.lg,
            }}
          >
            {/* 标题行：平台/币种（右侧）+ 月季汇总 */}
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: space.md, marginBottom: space.sm }}>
              <h2 style={{ margin: 0, fontSize: fontSize.displaySm, fontWeight: 600, color: color.ink }}>量价走势</h2>
              <ConfigProvider theme={filterBarTheme}>
                <div
                  style={{
                    marginLeft: 'auto',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    color: color.mute,
                    fontSize: 12,
                  }}
                >
                  {/* 第一百一十五轮（评审）：平台/币种收进顶部筛选条，标题行不再重复 */}
                  {/* 价格显示（第一百一十四轮，评审）：与币种切换同款控件位——
                      精简 = 图上仅最高/最低/最新三价（默认），详细 = 全量价格标签 */}
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    价格显示{' '}
                    <Segmented
                      size="small"
                      value={labelMode}
                      onChange={(v) => setLabelMode(v as 'detail' | 'compact')}
                      options={[
                        { label: '精简', value: 'compact' },
                        { label: '详细', value: 'detail' },
                      ]}
                    />
                  </span>
                </div>
              </ConfigProvider>
              {state.granularity !== 'week' && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: space.sm,
                    fontSize: fontSize.bodySm,
                    color: color.body,
                  }}
                >
                  <span>汇总：</span>
                  <Segmented
                    size="small"
                    value={state.agg}
                    onChange={(v) => actions.set({ agg: v as AggMode })}
                    options={[
                      { label: '平均值', value: 'avg' },
                      { label: '最小值', value: 'min' },
                    ]}
                  />
                </div>
              )}
            </div>

            {/* 常驻工具行：齿轮（每格高度/Y 刻度线/自动压缩/折线样式）+ 折后价/RRP 胶囊；
                第131轮波2：时间筛选簇上移顶部筛选条，本行只剩齿轮簇 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 34, padding: '0 6px', marginBottom: 2 }}>
              <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                <ChartToolbar
                  currency={state.currency}
                  sliderScale={sliderScale}
                  onSliderScale={setSliderScale}
                  showYTicks={showYTicks}
                  onShowYTicks={setShowYTicks}
                  yCompress={yCompress}
                  onYCompress={setYCompress}
                  lineShape={lineShape}
                  onLineShape={setLineShape}
                  priceTypes={state.priceTypes}
                  onPriceTypeToggle={setPriceType}
                />
              </div>
            </div>

            {/* 面板区：[共享 Y 轴列][三面板网格]；柱层在价格线之下（zIndex 0 < 1）。
                第一百二十六轮：轴列纵向撑满面板区，「同步」开关落列底、与各面板
                时间轴同一水平线（原底部独立行删除） */}
            <div style={{ display: 'flex', alignItems: 'stretch', gap: space.md, marginBottom: space.sm }}>
              <div
                style={{
                  flex: `0 0 ${splitAxisWidth(state.currency)}px`,
                  paddingTop: PANEL_HEAD_H,
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <SplitAxisColumn
                  yScale={yCfg}
                  currency={state.currency}
                  industry={state.industry}
                  gridLeft={estGridLeft(state.currency)}
                  panelGridTop={PANEL_GRID_TOP}
                  showYTicks={showYTicks}
                  tierValues={tierValues}
                />
                <div style={{ flex: 1 }} />
                {/* 与时间轴行齐平：容器高/下边距 = PanelTimeTrack（52 + 6），按钮对准
                    轨道带（带高 20、居中 = 上移 5px） */}
                {buckets.length > 0 && visUnion.length > 0 && (
                  <div style={{ height: 52, marginBottom: 6, position: 'relative', flexShrink: 0 }}>
                    <div style={{ position: 'absolute', left: 0, right: 0, top: -5, display: 'flex', justifyContent: 'center' }}>
                      {syncToggle}
                    </div>
                  </div>
                )}
              </div>
              <div style={{ flex: '1 1 0', minWidth: 0 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: space.md }}>
                  {panelViews.map((p) => (
                    <div
                      key={p.key}
                      style={{
                        border: `1px solid ${color.hairline}`,
                        borderRadius: radius.card,
                        background: color.canvas,
                        padding: '0 8px 0',
                        position: 'relative',
                        isolation: 'isolate',
                      }}
                    >
                      <PanelHeader
                        slot={p.slot}
                        options={productOptions}
                        brand={p.brand}
                        volume={volumeReading(volumes[p.idx], hoverIdxs[p.idx])}
                        onSelect={(key) => onSlotSelect(p.idx, key)}
                      />
                      <div style={{ position: 'relative' }}>
                        <VolumeBars
                          geom={geoms[p.idx]}
                          plotTop={PANEL_GRID_TOP}
                          plotHeight={yCfg.plotHeight}
                          values={volumes[p.idx]}
                          vMax={panelVMax[p.idx]}
                          color={p.vis[0]?.color ?? brandColorOf(p.brand)}
                          hoverIdx={hoverIdxs[p.idx]}
                          bandFrac={bandFracs[p.idx] ?? BAND_FRAC_DEFAULT}
                          onBandFrac={(v) => setBandFracs((prev) => prev.map((f, k) => (k === p.idx ? v : f)))}
                        />
                        <Chart
                          series={p.vis}
                          granularity={state.granularity}
                          currency={state.currency}
                          priceTypes={state.priceTypes}
                          gridLeft={CHART_GRID_LEFT}
                          gridRight={CHART_GRID_RIGHT} // 第一百一十五轮：右侧预留销量轴列（轴线+刻度+拖柄不与绘图区重叠）
                          gridTop={PANEL_GRID_TOP}
                          chrome={false}
                          axisChrome={false}
                          showYTicks={showYTicks}
                          enableDrill={false}
                          windowKey={`${effWins[p.idx][0]}:${effWins[p.idx][1]}:${p.key}`}
                          yScale={yCfg}
                          volumes={volumes[p.idx]}
                          hideNamePills // 第一百一十三轮（评审）：面板内不画产品药丸，产品名在面板头
                          lineShape={lineShape}
                          labelMode={labelMode} // 第一百一十四轮（评审）：价格显示 详细/精简
                          tipBox // 第一百一十四轮（评审）：悬停明细 = 图下方居中预留框
                          // 第一百二十六轮：图内 x 轴日期标签删除——面板底部时间轴是唯一日期层
                          crosshairIdx={hoverIdxs[p.idx]}
                          onCrosshairMove={onHoverOf(p.idx)}
                          crosshairY={crossY} // 第一百一十四轮（评审）：横向虚线横跨三面板
                          onCrosshairYMove={setCrossY}
                          brush={brushLive[p.idx] ?? brushes[p.idx]} // 第118/119轮：拖选高亮随同步态联动或独立
                          onBrushChange={onBrushChangeOf(p.idx)}
                          onGeom={onGeomOf(p.idx)}
                          emptyHint={p.slot ? '该产品在所选时间范围内无数据' : '请选择产品'}
                        />
                      </div>
                      {/* 本图时间轴（第一百二十三轮起同步/非同步恒在，位置对齐绘图区左右缘）：
                          同步 = 三图查看同一段时间，拖任一条同步调整；非同步 = 各图独立调整。
                          恒渲染保证切换同步只改联动行为，面板高度与轨道横向位置不变 */}
                      <div style={{ margin: '0 48px 6px 8px' }}>
                        <PanelTimeTrack
                          ids={domainIds}
                          lo={filterBounds[0]}
                          hi={filterBounds[1]}
                          s={synced ? win.s : effWins[p.idx][0]}
                          e={synced ? win.e : effWins[p.idx][1]}
                          granularity={state.granularity}
                          onChange={synced ? onWindowChange : onPanelWindowChange(p.idx)}
                          onAdjusting={setAdjusting}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </section>

          {/* 大盘分析（第118轮引入；第119轮走查会补齐）：窗口内各期大盘销量柱（绝对台数，
              堆叠 = 品牌构成）+ 档位筛选 + 点击柱子选期下钻 + 大盘环比贡献拆解。
              时间域：同步 = 共享窗口；非同步 = 各面板生效窗口的并集 */}
          {buckets.length > 0 && (
            <section
              style={{
                marginTop: space.md,
                background: color.canvas,
                boxShadow: shadow.l1,
                borderRadius: radius.card,
                padding: space.lg,
              }}
            >
              <MarketBoard
                cc={cc}
                industry={state.industry}
                granularity={state.granularity}
                buckets={buckets}
                winS={marketWin[0]}
                winE={marketWin[1]}
              />
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
