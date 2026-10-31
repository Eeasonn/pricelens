// ============================================================
// 第一百一十三轮（2026-10-21）量价看板：三面板并排（价格折线 + 底部销量柱）。
// 面板结构照价格看板分离模式：共享 Y 轴列（SplitAxisColumn，三面板价格并集
// 算一次 computeYAxis 受控传入，含步长滞回与刷选冻结）、共享 X 刷选条（只调
// 查看时间段，粒度切换走 actions.setGranularity）、跨面板悬停参考线 + 面板头
// 销量读数随悬停列联动。时间窗口 / 自适应 / 桶换算与价格看板同口径（§6.5）。
// 销量柱：上限默认各面板自动 niceCeil(窗口内最大值)，轴顶提供「最高值」输入，
// 下限固定为 0；柱高按 0→最高值线性映射，越界值钳在轴缘，不保留旧拉伸柄几何。
// 图内不画名称药丸（产品名在面板头），图贴左缘。
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
// 第一百六十七轮（Eason）：面板改为跟随顶部筛选器所选产品铺开——顶部「选择产品」
// 筛选器选了哪些产品（各卡主品+对比区，依次去重），底下就每产品一个面板全量铺开；
// 面板头的独立产品下拉退役（PanelHeader 转纯展示），原三槽 slots 机制
// （defaultSlots/手选槽位/槽位重置键）一并退役。同步/独立时间轴、悬停联动、
// 图内拖选高亮按面板数动态生效，语义不变。
// ============================================================
// 第一百九十一轮（Eason 五点）：面板头升级为价格页分离面板同构 [拖柄][产品药丸]——
// ①拖柄照价格页范式（拖到目标面板松手换位，dragover 描边 + 拖动降透明反馈）；
// 换序只记本地会话态 panelOrder（不落盘），面板渲染序 = panelOrder 优先、缺省回落
// 数据序。②产品药丸 = BrandLegendStrip 导出的 PillUnit（上行 16px 平台小药丸 =
// 该产品取价渠道徽标，点击弹渠道选择浮层，onPick 回写 setSelectionPlatform 后
// 量价取数随所选平台重算；下行两行产品药丸 = 品牌行 + 名称加粗 + 配置浅蓝底 chip）。
// 原纯文字面板头退役（信息已由药丸承载），面板头定高随药丸加高并与共享轴列对齐。
// 屏蔽/悬停联动量价页没有，onToggle/onHover 传 no-op。
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { HolderOutlined } from '@ant-design/icons';
import { useFilters } from '../state/FiltersContext';
import usePageViewState from '../state/usePageViewState';
import type { PlatformSelection, ProductSelection } from '../state/filtersTypes';
import ChartContentBar from '../components/ChartContentBar';
import BrandDot, { brandLabelOf } from '../components/BrandMark';
import Chart from '../chart/PriceTrend/Chart';
import { VIEW_WINDOW_CAPTION_H } from '../chart/PriceTrend/XBrush';
import ChartToolbar from '../chart/PriceTrend/ChartToolbar';
import { PillUnit, PlatformRow } from '../chart/PriceTrend/BrandLegendStrip';
// 卡顶时间筛选簇在顶部筛选条。这里只取查看窗口说明行高度，用来对齐同步按钮。
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
  yPxOf,
} from '../chart/PriceTrend/helpers';
import { buildSeries, lowestPriceColorSku } from '../dataModel/aggregate';
import { volumeByBuckets } from '../dataModel/volume';
import { dimProduct } from '../data';
import { applySyncedPlatforms, pinnedSelectionFromBadge, restorePlatformSync, snapshotPlatformSync, type PlatformSyncCardSnap } from '../chart/PriceTrend/platformSync';
import type { Series, SeriesPoint } from '../dataModel/types';
import { brandColorOf, color, font, fontSize, formatPrice, radius, selectAccent, selectSoft, selectSoftInk, shadow, space } from '../theme/tokens';
import { volumeAdaptiveSeries } from './volume/volumeAdaptive';
import { validVolumeViewMode, volumeProductRefs, type VolumeViewMode } from './volume/volumeView';
import VolumeBars from './volume/VolumeBars';
import PanelHeader from './volume/PanelHeader';
import PanelTimeTrack from './volume/PanelTimeTrack';
import MarginCostBand from './volume/MarginCostBand';
import { marginCostAvailabilityOf, marginCostOf } from './volume/marginCost';
import { lastValidMarginIndex, marginFocusIndex } from './volume/marginCostGeometry';
import SpreadRangeCard from './volume/SpreadRangeCard';
import { spreadCardModel, spreadCardPlan } from './volume/spreadCards';
import { commitVolumeAxisLimit, normalizePanelWindow, vMaxOf, volumeRangeOf, type VolumeAxisLimits, type VolumeSlot } from './volume/volumeAxis';
import { formatVolumeAmount, pricePointValid, rangeMarksInView, rangeSpreadOf, resolveSelectedWindow, volumePointValid } from './volume/periodSummary';

// 面板头定高（第一百九十一轮，Eason 五点）：面板头改 [拖柄][PillUnit] 后随药丸
// 加高——可换行的平台小药丸（28px）+ 2px 间距 + 两行产品药丸，另给店铺同步按钮
// 留出同高空间；共享轴列和面板图从这里统一对齐。
const PANEL_HEAD_H = 68;
// 与价格走势分离卡片同一套：拖柄骑在上边线正中，上半凸出卡片；滚动区垫高避免裁切
const PANEL_GRIP_H = 14;
const SCROLL_PAD_TOP = 10;
const PANEL_GRID_TOP = 14; // 面板图顶窄空气带（同分离模式）
const LOAD_ERROR_HINT: ReactNode = (
  <>
    数据加载异常
    <div style={{ marginTop: 4, fontSize: 12 }}>请刷新重试</div>
  </>
);

const CHART_GRID_LEFT = 8; // 图贴面板左缘：名称药丸已删，产品名在面板头
const CHART_GRID_RIGHT = 78; // 右侧预留销量轴列（轴线 + 最高值输入框）

interface SlotInfo {
  isOwn: boolean;
  brand: string;
  name: string;
  skuIds: string[];
}

/** 槽位 → 取数信息：代表 SKU = 最低价颜色（无价数据回退该配置全部颜色 SKU）；
 *  name = 「型号 + 配置」展示文本（无配置层级产品不带「—」） */
function resolveSlot(slot: VolumeSlot, cc: string): SlotInfo | null {
  const norm = slot.romram.replace(/\s+/g, '');
  const rows = dimProduct.filter((p) => p.model_id === slot.modelId && p.romram.replace(/\s+/g, '') === norm);
  if (rows.length === 0) return null;
  const pool = rows.filter((p) => p.countries.includes(cc));
  const skuPool = pool.length ? pool : rows;
  const low = lowestPriceColorSku(slot.modelId, slot.romram, cc);
  const skuIds = low != null && skuPool.some((p) => p.sku_id === low) ? [low] : skuPool.map((p) => p.sku_id);
  return {
    isOwn: rows[0].is_own === true,
    brand: rows[0].brand,
    name: `${rows[0].model_name}${rows[0].romram !== '—' ? ` ${rows[0].romram}` : ''}`,
    skuIds,
  };
}

/** 面板 key（modelId__配置去空格）→ 选择项键（modelId|配置去空格）——与筛选状态
 *  selKey 同口径，setSelectionPlatform 按它定位选择项（同价格页 pickChannel 的
 *  非同步分支） */
function selKeyOfPanel(panelKey: string): string {
  const i = panelKey.indexOf('__');
  return i <= 0 ? panelKey : `${panelKey.slice(0, i)}|${panelKey.slice(i + 2)}`;
}

/** 面板头产品药丸规格（第一百九十一轮，Eason 五点）：与 BrandLegendStrip 的
 *  PillSpec 同构的本地结构（该类型未导出，跨页传 props 走 TS 结构化兼容） */
interface PanelPillSpec {
  key: string;
  brand: string;
  brandLabel: string;
  text: string;
  nameText: string;
  romText: string;
  hidden: boolean;
  main: boolean;
  wrapChannelLabel?: boolean;
  channel?: { label: string; auto: boolean } | null;
  channelCtl?: {
    cc: string;
    skuIds: string[];
    current: PlatformSelection | null;
    onPick: (sel: PlatformSelection | null) => void;
    autoLabel?: string;
  };
}

/** 量价面板取数清单（第一百六十七轮）：顶部筛选器所选产品 = 各卡「主品 + 对比区」
 *  依次铺开去重；每产品一面板，国家变化时 SKU 口径随 resolveSlot 重算 */
interface PanelSpec {
  key: string;
  cardId: string;
  modelId: string;
  romram: string;
  isOwn: boolean;
  isMain: boolean;
  brand: string;
  name: string;
  skuIds: string[];
  platform: PlatformSelection | null; // 该产品取价口径（null = 自动，第一百九十一轮随渠道徽标接入）
}

export default function VolumePrice() {
  const { state, actions } = useFilters();
  const cc = state.countryCode;
  // 主产品经营视图是量价卡内的瞬态：切走再回来回到默认主产品，不写入筛选器或 URL。
  const [viewMode, setViewMode] = useState<VolumeViewMode>({ kind: 'mains' });
  const safeViewMode = validVolumeViewMode(state.mains, viewMode);
  const reading = safeViewMode.kind === 'mains';
  useEffect(() => {
    if (safeViewMode !== viewMode) setViewMode(safeViewMode);
  }, [safeViewMode, viewMode]);

  // ---- 面板清单：默认只铺各卡主品；组内对比才展开该卡的主品与竞品 ----
  const panelSpecs = useMemo<PanelSpec[]>(() => {
    const out: PanelSpec[] = [];
    const seen = new Set<string>();
    for (const ref of volumeProductRefs(state.mains, safeViewMode)) {
      const sel = ref.selection;
      const norm = sel.romram.replace(/\s+/g, '');
      const key = `${sel.modelId}__${norm}`;
      if (seen.has(key)) continue;
      const info = resolveSlot(sel, cc);
      if (!info || info.skuIds.length === 0) continue;
      seen.add(key);
      out.push({
        key,
        cardId: ref.cardId,
        modelId: sel.modelId,
        romram: sel.romram,
        isMain: ref.isMain,
        ...info,
        platform: sel.platform ?? null,
      });
    }
    return out;
  }, [state.mains, cc, safeViewMode]);
  const panelCount = panelSpecs.length;
  // 量价页把同步入口放在每个主产品面板左侧；状态按卡保存，避免把一个主产品
  // 的店铺口径误传给另一张主产品卡。快照用于再次点击时恢复同步前的选择。
  const [storeSyncMap, setStoreSyncMap] = useState<Record<string, boolean>>({});
  const storeSyncSnapshotsRef = useRef<Record<string, PlatformSyncCardSnap | null>>({});

  // ---- 视图状态（同价格看板口径；全部面板共用）。同步态/面板独立窗口/价格
  //      显示 = 会话态跨页保留（P1-5，usePageViewState）；其余为瞬态。
  //      第一百九十二轮（Eason）：Y 轴设置四件套（每格高度/自动压缩/Y 刻度线/
  //      折线样式）与页签显示一并转会话态——切价格看板再切回不再被清 ----
  const [sliderScale, setSliderScale] = usePageViewState<number>('volume.sliderScale', () => 1);
  const [yCompress, setYCompress] = usePageViewState<boolean>('volume.yCompress', () => false);
  const [showYTicks, setShowYTicks] = usePageViewState<boolean>('volume.showYTicks', () => true);
  // 价格档位带开关（第一百九十三轮，Eason）：与 Y 刻度线独立
  const [showTiers, setShowTiers] = usePageViewState<boolean>('volume.showTiers', () => true);
  const [lineShape, setLineShape] = usePageViewState<LineShapeChoice>('volume.lineShape', () => 'auto');
  // 第一百一十四轮（评审）：价格显示（默认精简，会话态跨页保留）+ 全面板共享悬停纵向位置（横向虚线）
  const [labelMode, setLabelMode] = usePageViewState<'detail' | 'compact'>('volume.labelMode', () => 'compact');
  // 悬停页签比率：默认周环比（与价格看板同一默认）；会话态跨页保留（192 轮）
  const [tipMode, setTipMode] = usePageViewState<'discount' | 'wow'>('volume.tipMode', () => 'wow');
  const [crossY, setCrossY] = useState<number | null>(null);
  const [adjusting, setAdjusting] = useState(false); // 刷选拖动中冻结价格 Y 轴
  // 查看窗口 = 会话态跨页保留（与价格看板对齐；范围改动等失义路径照旧复位）
  const [windowIds, setWindowIds] = usePageViewState<[string, string] | null>('volume.windowIds', () => null);
  const [volumeLimits, setVolumeLimits] = useState<VolumeAxisLimits[]>(() => panelSpecs.map(() => ({ max: null })));
  // ---- 第119轮（走查会）：同步/非同步查看时间。同步 = 全部面板共用窗口（原行为）；
  //      非同步 = 每面板独立时间轴（panelWins 记各面板窗口，null = 未单独调整过）。
  //      两项均会话态跨页保留（P1-5）----
  const [synced, setSynced] = usePageViewState<boolean>('volume.synced', () => true);
  // 主产品视图没有「时间轴同步」开关，各图固定共用一段查看时间。
  const timeSynced = reading || synced;
  const [panelWins, setPanelWinsRaw] = usePageViewState<([number, number] | null)[]>('volume.panelWins', () => panelSpecs.map(() => null));
  // 面板独立窗口伴生粒度（跨粒度错位修复）：panelWins 存的是裸桶下标，只在本粒度
  // 内可解释。挂载期间切粒度有下方 granRef 效果整组重置；但跨页往返（卸载期间在
  // 别页切了粒度）再回来时 granRef 挂载即初始化、永不触发——旧粒度下标被当新粒度
  // 解释，面板静默显示错误时间段。故写入窗口时随行记录粒度，挂载时粒度不符即整组
  // 失效回落共享窗口。
  const [panelWinsGran, setPanelWinsGran] = usePageViewState<string>('volume.panelWinsGran', () => state.granularity);
  const setPanelWins = useCallback(
    (v: ([number, number] | null)[] | ((prev: ([number, number] | null)[]) => ([number, number] | null)[])) => {
      setPanelWinsRaw(v);
      setPanelWinsGran(state.granularity);
    },
    [setPanelWinsRaw, setPanelWinsGran, state.granularity],
  );
  useLayoutEffect(() => {
    if (panelWinsGran === state.granularity) return;
    setPanelWins(panelSpecs.map(() => null)); // 联动写伴生粒度 = 当前粒度
    // 仅挂载期判定一次：挂载后粒度变化走 granRef 效果，重复判定会双写
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [hoverIdxs, setHoverIdxs] = useState<(number | null)[]>(() => panelSpecs.map(() => null)); // 各面板悬停时间列（同步模式恒等）
  const [geoms, setGeoms] = useState<(StripGeom | null)[]>(() => panelSpecs.map(() => null)); // 各面板绘图区横向几何
  // ---- 图内拖选时间段：面板级高亮（brush = 已提交，brushLive = 拖动中实时预览）。
  //      摘要卡与高亮区间同源；未拖选时回退到本图查看窗口。 ----
  const [brushes, setBrushes] = useState<([number, number] | null)[]>(() => panelSpecs.map(() => null));
  const [brushLive, setBrushLive] = useState<([number, number] | null)[]>(() => panelSpecs.map(() => null));

  // 面板数变化（顶部筛选器增删产品）→ 各面板态数组随动（保旧值补空位）；
  // 换产品/价格类型/币种 → 价格高度倍率与销量轴限位复位（同看板 §5.6）
  useEffect(() => {
    const fit = <T,>(fill: T) => (prev: T[]): T[] => Array.from({ length: panelCount }, (_, i) => prev[i] ?? fill);
    setHoverIdxs(fit<number | null>(null));
    setGeoms(fit<StripGeom | null>(null));
    setBrushes(fit<[number, number] | null>(null));
    setBrushLive(fit<[number, number] | null>(null));
    setVolumeLimits(fit<VolumeAxisLimits>({ max: null }));
    setPanelWins(fit<[number, number] | null>(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelCount]);
  // 换产品/价格类型/币种才复位。比较稳定键，而不是 panelSpecs 的数组引用：
  // 每次挂载引用都是新的，无条件 setSliderScale(1) 会覆写会话里的每格高度。
  const scaleResetKey = JSON.stringify([panelSpecs.map((p) => p.key), state.priceTypes, state.currency]);
  const scaleResetSeenRef = useRef<string | null>(null);
  useEffect(() => {
    if (scaleResetSeenRef.current === null || scaleResetSeenRef.current === scaleResetKey) {
      scaleResetSeenRef.current = scaleResetKey;
      return;
    }
    scaleResetSeenRef.current = scaleResetKey;
    setSliderScale(1);
    setVolumeLimits(panelSpecs.map(() => ({ max: null })));
  }, [scaleResetKey, panelSpecs]);

  // 粒度切换 → 窗口端点对齐新粒度桶边界（保持同一时间跨度）；面板独立时间轴按桶号
  // 失义回落共享窗口（第119轮）
  const granRef = useRef(state.granularity);
  useLayoutEffect(() => {
    if (granRef.current === state.granularity) return;
    const prev = granRef.current;
    granRef.current = state.granularity;
    setWindowIds((ids) => (ids ? convertWindowIds(ids, prev, state.granularity) : null));
    setPanelWins((prev) => prev.map(() => null));
  }, [state.granularity]);

  // ---- 取数：每面板独立 buildSeries（数据全集，窗口切片照分离模式） ----
  const [dataStart, dataEnd] = useMemo(() => dataBucketRange(state.granularity), [state.granularity]);
  const buckets: Bucket[] = useMemo(
    () => enumerateBuckets(state.granularity, dataStart, dataEnd),
    [state.granularity, dataStart, dataEnd],
  );

  const panelData = useMemo(
    () =>
      panelSpecs.map((spec, i) => {
        let series: Series[] = [];
        let failed = false;
        if (spec.skuIds.length > 0) {
          try {
            series = buildSeries({
              // 第一百九十一轮（Eason 五点）：组级取价口径随选择项接入——选了平台/
              // 渠道后量价曲线真的跟随重算（buildSeries 按组解析渠道；null = 自动）
              groups: [{ modelId: spec.modelId, romram: spec.romram, skuIds: spec.skuIds, isOwn: spec.isOwn, platform: spec.platform }],
              granularity: state.granularity,
              startBucket: dataStart,
              endBucket: dataEnd,
              currency: state.currency,
              agg: state.agg,
              scope: { countryCode: cc, industry: state.industry },
            });
          } catch {
            series = [];
            failed = true;
          }
        }
        return {
          failed,
          idx: i,
          // 前缀面板号：两个面板出现同一产品时 React key 仍唯一（同 key 面板会串挂 DOM/图表实例）
          key: `${i}:${spec.key}`,
          spec,
          isOwn: spec.isOwn,
          brand: spec.brand,
          name: spec.name,
          series,
        };
      }),
    [panelSpecs, cc, state.industry, state.granularity, dataStart, dataEnd, state.currency, state.agg],
  );

  // 时间自适应：只按当前画面上的产品重套上方极值。
  // 默认主产品视图不含对比产品，不能沿用价格页按主品+对比产品算出的更宽范围。
  // 组内对比才把该组正在显示的竞品算进跨度。
  // 本 effect 声明在粒度换算之后：切粒度先换桶，自适应范围随后覆盖。
  const adaptiveSeries = useMemo(
    () => volumeAdaptiveSeries(
      panelData.map((panel) => ({ isMain: panel.spec.isMain, series: panel.series })),
      safeViewMode,
    ),
    [panelData, safeViewMode],
  );
  const span = useMemo(() => seriesSpanRange(adaptiveSeries), [adaptiveSeries]);
  const adaptiveBounds = useMemo(
    () => (state.adaptive ? adaptiveRangeOf(buckets, span, 0) : null),
    [state.adaptive, buckets, span],
  );
  const adaptiveProductKey = adaptiveSeries.map((series) => series.key).join('|');
  const adaptiveKey = adaptiveBounds
    ? `${state.granularity}|${adaptiveBounds[0]}|${adaptiveBounds[1]}|${adaptiveProductKey}`
    : '';
  const adaptiveAppliedRef = useRef('');
  const adaptiveMountedRef = useRef(false);
  useLayoutEffect(() => {
    if (!adaptiveBounds) {
      adaptiveAppliedRef.current = '';
      return;
    }
    if (adaptiveAppliedRef.current === adaptiveKey) return;
    // 端点与本页跨度不一致就重套，即使现范围仍盖住主产品数据。
    // 挂载时端点已经一致：保留会话里的查看窗口。
    adaptiveAppliedRef.current = adaptiveKey;
    const rangeUnchanged = state.rangeStart === adaptiveBounds[0] && state.rangeEnd === adaptiveBounds[1];
    if (!rangeUnchanged) {
      actions.set({ rangeStart: adaptiveBounds[0], rangeEnd: adaptiveBounds[1] });
      rangeWatchRef.current = { gran: state.granularity, key: `${adaptiveBounds[0]}|${adaptiveBounds[1]}` };
      setWindowIds(null);
      setPanelWins((prev) => prev.map(() => null));
    } else if (adaptiveMountedRef.current) {
      setWindowIds(null);
      setPanelWins((prev) => prev.map(() => null));
    }
    adaptiveMountedRef.current = true;
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

  // ---- 第119轮（走查会）：各面板生效窗口。同步 = 全部面板共用共享窗口（原行为）；
  //      非同步 = 各面板独立窗口（未单独调整过的回落共享窗口，越界钳回可调全域）----
  const effWins = useMemo<[number, number][]>(
    () => panelSpecs.map((_, i) => normalizePanelWindow(panelWins[i] ?? null, win.s, win.e, filterBounds[0], filterBounds[1])),
    [panelSpecs, panelWins, win.s, win.e, filterBounds],
  );
  const toggleSynced = (): void => {
    if (synced) setPanelWins(panelSpecs.map(() => [win.s, win.e] as [number, number]));
    else setPanelWins(panelSpecs.map(() => null));
    setSynced(!synced);
  };

  // 查看窗口/粒度/同步切换 → 高亮时间段下标失义，自动清除（第118/119轮）
  useEffect(() => {
    setBrushes((prev) => prev.map(() => null));
    setBrushLive((prev) => prev.map(() => null));
  }, [win.s, win.e, state.granularity, timeSynced]);

  // 换产品清单（顶部筛选器增删产品）→ 悬停列/高亮段随面板重置
  useEffect(() => {
    setHoverIdxs(panelSpecs.map(() => null));
    setBrushes(panelSpecs.map(() => null));
    setBrushLive(panelSpecs.map(() => null));
  }, [panelSpecs]);

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

  // ---- 面板顺序拖拽换位（第一百九十一轮，Eason 五点；同价格页分离面板范式）：
  //      本地会话态不落盘，换序只影响显示顺序。panelOrder 记面板 key（PanelSpec.key
  //      = modelId__配置去空格，跨增删产品稳定；React key 另带下标前缀防重挂）序，
  //      null = 数据序；面板态数组仍按下标挂各自面板，重排不串态 ----
  const [panelOrder, setPanelOrder] = useState<string[] | null>(null);
  const [hiddenPanelKeys, setHiddenPanelKeys] = useState<Set<string>>(() => new Set());
  const [draggingPanel, setDraggingPanel] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  // 展示顺序：拖拽换位后记录 key 序；null = 数据序（同价格页 orderedPanels）
  const orderedPanels = useMemo(() => {
    if (safeViewMode.kind === 'mains' || !panelOrder || panelOrder.length === 0) return panelViews;
    const idx = (k: string) => {
      const i = panelOrder.indexOf(k);
      return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    };
    return [...panelViews].sort((a, b) => idx(a.spec.key) - idx(b.spec.key));
  }, [panelViews, panelOrder, safeViewMode]);
  // 拖拽落点 = 把被拖面板插到目标面板当前位置（同价格页 movePanelTo）
  const movePanelTo = (dragKey: string, targetKey: string): void => {
    if (dragKey === targetKey) return;
    const keys = orderedPanels.map((p) => p.spec.key);
    const from = keys.indexOf(dragKey);
    const to = keys.indexOf(targetKey);
    if (from < 0 || to < 0) return;
    keys.splice(to, 0, keys.splice(from, 1)[0]);
    setPanelOrder(keys);
  };

  // 面板头产品药丸（第一百九十一轮，Eason 五点）：key = 面板 key；名称/配置拆自
  // 面板规格（name =「型号 + 配置」，nameText 去配置后缀、'—' 出空）；渠道徽标与
  // 浮层语境直接用 buildSeries 回显的 channelBadge（选平台=平台名、自动=最新有价周
  // 实际平台名）。量价页无屏蔽/悬停联动，onToggle/onHover 传 no-op；onPick 回写
  // setSelectionPlatform（selKey 定位）→ panelSpecs 重算 → 量价曲线随所选平台重取
  const pillOf = (p: (typeof panelViews)[number]): PanelPillSpec => {
    const rom = p.spec.romram !== '—' ? p.spec.romram : '';
    const badge = p.series[0]?.channelBadge ?? null;
    return {
      key: p.spec.key,
      brand: p.brand,
      brandLabel: brandLabelOf(p.brand),
      text: p.name,
      nameText: rom && p.name.endsWith(rom) ? p.name.slice(0, p.name.length - rom.length).trim() : p.name,
      romText: rom,
      hidden: false,
      main: false,
      wrapChannelLabel: true,
      channel: badge ? { label: badge.label, auto: badge.auto } : null,
      channelCtl: {
        cc,
        skuIds: p.spec.skuIds,
        current: p.spec.platform,
        onPick: (sel) => actions.setSelectionPlatform(selKeyOfPanel(p.spec.key), sel),
        autoLabel: badge?.auto ? badge.label : undefined,
      },
    };
  };

  const toggleStoreSync = (p: (typeof panelViews)[number]): void => {
    if (!p.spec.isMain) return;
    const card = state.mains.find((item) => item.id === p.spec.cardId);
    if (!card?.main) return;
    const cardId = card.id;
    if (storeSyncMap[cardId]) {
      const snap = storeSyncSnapshotsRef.current[cardId];
      if (snap) actions.setMains(restorePlatformSync(state.mains, [snap]));
      storeSyncSnapshotsRef.current[cardId] = null;
      setStoreSyncMap((prev) => ({ ...prev, [cardId]: false }));
      return;
    }
    const snap = snapshotPlatformSync([card])[0] ?? null;
    const source = pinnedSelectionFromBadge(p.series[0]?.channelBadge ?? null, card.main.platform ?? null);
    const syncedCard = applySyncedPlatforms([card], source)[0];
    if (!syncedCard) return;
    actions.setMains(state.mains.map((item) => (item.id === cardId ? syncedCard : item)));
    storeSyncSnapshotsRef.current[cardId] = snap;
    setStoreSyncMap((prev) => ({ ...prev, [cardId]: true }));
  };

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
        const ids = domainIds.slice(effWins[i][0], effWins[i][1] + 1);
        return volumeByBuckets(p.spec.modelId, p.spec.romram, cc, state.granularity, ids);
      }),
    [panelData, domainIds, effWins, cc, state.granularity],
  );
  const summaryVolumes = useMemo(
    () =>
      panelData.map((p) => volumeByBuckets(p.spec.modelId, p.spec.romram, cc, state.granularity, domainIds)),
    [panelData, domainIds, cc, state.granularity],
  );
  const marginCosts = useMemo(
    () => panelData.map((panel, i) => {
      const ids = domainIds.slice(effWins[i][0], effWins[i][1] + 1);
      return marginCostOf({
        modelId: panel.spec.modelId,
        romram: panel.spec.romram,
        countryCode: cc,
        points: panel.series.flatMap((series) => series.points),
        bucketIds: ids,
      });
    }),
    [panelData, domainIds, effWins, cc],
  );
  // 各图销量轴上限恒自动（niceCeil 窗口内最大值）
  const panelVMax = volumes.map((vs) => vMaxOf(vs));
  const onVolumeAxisLimit = (idx: number, kind: 'max', value: number | null): void => {
    setVolumeLimits((prev) => {
      const next = [...prev];
      const current = next[idx] ?? { max: null };
      next[idx] = commitVolumeAxisLimit(current, kind, value, panelVMax[idx] ?? 1);
      return next;
    });
  };
  const summaryLive = orderedPanels.map((p) => {
    const [viewStart, viewEnd] = effWins[p.idx] ?? [0, 0];
    // Chart 接收的是本图查看窗口切片，brush 下标从 0 开始；摘要使用全量
    // domain 的序列，因此需要把拖选区间平移回全量桶下标。拖动中优先采用
    // brushLive，让上方区间变化随着当前选择即时更新；没有高亮时沿用查看窗口。
    const selectedBrush = brushLive[p.idx] ?? brushes[p.idx];
    const [start, end] = resolveSelectedWindow(viewStart, viewEnd, selectedBrush);
    return {
      key: p.key,
      failed: p.failed,
      prices: (p.series[0]?.points ?? []).map((pt) => pt.price),
      volumes: summaryVolumes[p.idx] ?? [],
      startId: domainIds[start],
      endId: domainIds[end],
      periodCount: Math.max(0, end - start + 1),
      windowStart: start,
      windowEnd: end,
    };
  });
  const summaryRows = summaryLive;

  // 几何上报（面板头下拉与槽位选择已随第一百六十七轮退役）
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

  // 面板独立窗口调整（非同步）：只动自己的生效窗口
  const onPanelWindowChange = (idx: number) => (s2: number, e2: number): void => {
    if (!buckets[s2] || !buckets[e2]) return;
    setPanelWins((prev) => prev.map((x, k) => (k === idx ? [s2, e2] : x)));
  };
  // 悬停时间列：同步 = 全面板同列（原行为）；非同步 = 只亮本面板
  const onHoverOf = (idx: number) => (v: number | null): void => {
    setHoverIdxs((prev) => {
      if (timeSynced) return prev.every((x) => x === v) ? prev : prev.map(() => v);
      return prev.map((x, k) => (k === idx ? v : x));
    });
  };
  // 图内拖选时间段（第118轮）：同步 = 全面板联动；非同步 = 各面板独立高亮
  const onBrushChangeOf = (idx: number) => (r: [number, number] | null, committing: boolean): void => {
    if (committing) {
      setBrushLive((prev) => prev.map(() => null));
      setBrushes((prev) => (timeSynced ? prev.map(() => r) : prev.map((x, k) => (k === idx ? r : x))));
    } else {
      setBrushLive((prev) => (timeSynced ? prev.map(() => r) : prev.map((x, k) => (k === idx ? r : x))));
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

  /** 「时间轴同步」开关（第119轮走查会；第126轮移到共享轴列下方、与时间轴行齐平；
   *  第148轮改名「时间轴同步」两行竖排、与整条时间轴块垂直居中）：
   *  同步 = 各图查看同一段时间，拖任一图的时间轴三图一起动；非同步 = 各图时间
   *  范围独立调整（用于对齐不同上市节奏产品的可比区间） */
  const syncToggle = (
    <button
      type="button"
      aria-label="时间轴同步"
      aria-pressed={synced}
      title={synced ? '同步：三张图共用一段查看时间' : '独立：各图分别调整'}
      onClick={toggleSynced}
      style={{
        height: 30, padding: '0 9px', borderRadius: radius.control,
        border: `1px solid ${synced ? selectAccent : color.hairlineStrong}`,
        background: synced ? selectSoft : color.canvas,
        color: synced ? selectSoftInk : color.body,
        font: 'inherit', fontSize: fontSize.caption, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
        lineHeight: '13px',
      }}
    >
      <span style={{ display: 'block' }}>时间轴</span>
      <span style={{ display: 'block' }}>同步</span>
    </button>
  );

  const panelLead = reading ? 0 : SCROLL_PAD_TOP + PANEL_GRIP_H;

  return (
    <>
      {/* 页面壳（页头/筛选条/滚动容器）第一百八十四轮上移 App.AnalysisShell 共享——
          本组件只负责图表卡与大盘卡，价格走势↔量价走势切页不再整页重挂。 */}
      <section
        style={{
          background: color.canvas,
          boxShadow: reading ? undefined : shadow.l1,
          borderRadius: reading ? 0 : radius.card,
          padding: 0,
          overflow: 'hidden',
        }}
      >
        <ChartContentBar />
        <div style={{ padding: `${space.sm}px ${space.lg}px ${space.md}px` }}>
            {/* 常驻工具行：齿轮（每格高度/Y 刻度线/自动压缩/折线样式）+ 折后价/RRP 胶囊；
                第131轮波2：时间筛选簇上移顶部筛选条，本行只剩齿轮簇 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 32, padding: '0 6px', marginBottom: 8 }}>
              <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                <ChartToolbar
                  currency={state.currency}
                  sliderScale={sliderScale}
                  onSliderScale={setSliderScale}
                  showYTicks={showYTicks}
                  showTiers={showTiers}
                  onShowTiers={setShowTiers}
                  onShowYTicks={setShowYTicks}
                  yCompress={yCompress}
                  onYCompress={setYCompress}
                  lineShape={lineShape}
                  onLineShape={setLineShape}
                  priceTypes={state.priceTypes}
                  onPriceTypeToggle={setPriceType}
                  tipMode={tipMode}
                  onTipMode={setTipMode}
                  labelMode={labelMode}
                  onLabelMode={setLabelMode}
                />
              </div>
            </div>

            {/* 组内对比是同一量价卡内的次级视图，一次只看一组。 */}
            {safeViewMode.kind === 'group' && (
              <nav aria-label="组内对比切换" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: space.sm }}>
                <button
                  type="button"
                  onClick={() => setViewMode({ kind: 'mains' })}
                  style={{ border: 'none', background: 'none', padding: 0, color: color.link, fontSize: 12, cursor: 'pointer' }}
                >
                  ← 返回主产品视图
                </button>
                {state.mains.filter((card) => card.main).map((card, index) => {
                  const active = safeViewMode.cardId === card.id;
                  return (
                    <button
                      key={card.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setViewMode({ kind: 'group', cardId: card.id })}
                      style={{
                        height: 24,
                        padding: '0 8px',
                        border: `1px solid ${active ? color.link : color.hairline}`,
                        borderRadius: radius.control,
                        background: active ? selectSoft : color.canvas,
                        color: active ? selectSoftInk : color.body,
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      第 {index + 1} 组
                    </button>
                  );
                })}
              </nav>
            )}

            {/* 面板区：[共享 Y 轴列][三面板网格]；柱层在价格线之下（zIndex 0 < 1）。
                第一百二十六轮：轴列纵向撑满面板区，「同步」开关落列底、与各面板
                时间轴同一水平线（原底部独立行删除）。
                第一百八十二轮：窄视口在卡内横向拖动（内层 minWidth 880 保面板可读下限） */}
            <div className="lpl-card-scroll" style={{ overflowX: 'auto', marginBottom: space.sm }}>
            <div style={{ display: 'flex', alignItems: 'stretch', gap: space.md, minWidth: 880, width: '100%' }}>
              <div
                style={{
                  flex: `0 0 ${splitAxisWidth(state.currency, showYTicks, showTiers)}px`,
                  paddingTop: panelLead + PANEL_HEAD_H,
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <SplitAxisColumn
                  yScale={yCfg}
                  currency={state.currency}
                  industry={state.industry}
                  gridLeft={estGridLeft(state.currency, showYTicks, showTiers)}
                  panelGridTop={PANEL_GRID_TOP}
                  showYTicks={showYTicks}
                  showTiers={showTiers}
                  tierValues={tierValues}
                />
                <div style={{ flex: 1 }} />
                {/* 与时间轴轨道带齐平：轨道高 52，其下是说明行 VIEW_WINDOW_CAPTION_H。
                    槽位仍高 52、按钮 top -5 对准轨道带中心；下边距加上说明行高度，
                    否则按钮会比轨道带低出一整行说明。 */}
                {buckets.length > 0 && visUnion.length > 0 && (
                  <div style={{ height: 52, marginBottom: 6 + VIEW_WINDOW_CAPTION_H, position: 'relative', flexShrink: 0 }}>
                    {!reading && (
                      <div style={{ position: 'absolute', left: 0, right: 0, top: -5, display: 'flex', justifyContent: 'center' }}>
                        {syncToggle}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div style={{ flex: '1 1 0', minWidth: 0 }}>
                {panelCount === 0 ? (
                  <div
                    style={{
                      padding: '48px 0',
                      textAlign: 'center',
                      fontSize: fontSize.bodySm,
                      color: color.mute,
                      border: `1px dashed ${color.hairline}`,
                      borderRadius: radius.card,
                    }}
                  >
                    在上方筛选器选择产品后，这里按所选产品铺开量价走势
                  </div>
                ) : (
                  // 并排上限 3（第一百八十轮，Eason：与价格看板同规则）——≤3 个按个数
                  // 均分一行；>3 个不折行，横向拖动查看（轨道宽 = N/3 × 100%，每格
                  // 恒为视口 1/3 宽）
                  <div className="lpl-card-scroll" style={{ overflowX: 'auto', overflowY: 'hidden', padding: `${reading ? 0 : SCROLL_PAD_TOP}px 0 0` }}>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(${panelCount}, minmax(0, 1fr))`,
                        gap: reading ? 0 : space.md,
                        width: `${(panelCount / Math.min(panelCount, 3)) * 100}%`,
                      }}
                    >
                    {/* 第一百九十一轮（Eason 五点）：渲染序 = 拖拽换位序（orderedPanels，
                        panelOrder 缺省回落数据序）；拖柄拖到目标面板松手换位 */}
                    {orderedPanels.map((p, panelIndex) => {
                      const pill = pillOf(p);
                      const panelHidden = !reading && hiddenPanelKeys.has(p.spec.key);
                      const toggleHidden = (): void => {
                        setHiddenPanelKeys((prev) => {
                          const next = new Set(prev);
                          if (next.has(p.spec.key)) next.delete(p.spec.key);
                          else next.add(p.spec.key);
                          return next;
                        });
                      };
                      const row = summaryRows.find((item) => item.key === p.key);
                      const viewStart = effWins[p.idx]?.[0] ?? 0;
                      const brush = brushLive[p.idx] ?? brushes[p.idx] ?? null;
                      const ranged = brush != null && !!row && !row.failed && !panelHidden;
                      const priceMarks = ranged && row
                        ? rangeMarksInView(row.prices, row.windowStart, row.windowEnd, viewStart, pricePointValid, (value) => formatPrice(Math.round(value), state.currency))
                        : [];
                      const volumeSlice = row ? row.volumes.slice(Math.min(row.windowStart, row.windowEnd), Math.max(row.windowStart, row.windowEnd) + 1) : [];
                      const volumeWan = volumeSlice.some((value) => value != null && Math.abs(value) >= 10000);
                      const volumeMarks = ranged && row
                        ? rangeMarksInView(row.volumes, row.windowStart, row.windowEnd, viewStart, volumePointValid, (value) => formatVolumeAmount(value, volumeWan))
                        : [];
                      const windowLo = row ? Math.min(row.windowStart, row.windowEnd) : 0;
                      const windowHi = row ? Math.max(row.windowStart, row.windowEnd) : -1;
                      const priceSpread = ranged && row
                        ? rangeSpreadOf(row.prices.slice(windowLo, windowHi + 1), pricePointValid)
                        : null;
                      const volumeSpread = ranged && row
                        ? rangeSpreadOf(row.volumes.slice(windowLo, windowHi + 1), volumePointValid)
                        : null;
                      const priceCard = priceSpread
                        ? spreadCardModel(priceSpread, (value) => formatPrice(Math.round(value), state.currency), '价格')
                        : null;
                      const volumeCard = volumeSpread
                        ? spreadCardModel(volumeSpread, (value) => formatVolumeAmount(value, volumeWan), '销量')
                        : null;
                      const strip = geoms[p.idx];
                      const slot = strip && strip.n > 0 ? strip.plotWidth / strip.n : 0;
                      const [volumeAxisMin, volumeAxisMax] = volumeRangeOf(volumeLimits[p.idx], panelVMax[p.idx] ?? 1);
                      const volumeAxisSpan = Math.max(1, volumeAxisMax - volumeAxisMin);
                      const volumeY = (value: number): number => {
                        const ratio = Math.min(1, Math.max(0, (value - volumeAxisMin) / volumeAxisSpan));
                        return PANEL_GRID_TOP + yCfg.plotHeight - ratio * yCfg.plotHeight;
                      };
                      const priceY = (value: number): number => yPxOf({
                        gridLeft: CHART_GRID_LEFT,
                        plotLeft: strip?.plotLeft ?? CHART_GRID_LEFT,
                        plotTop: PANEL_GRID_TOP,
                        plotWidth: strip?.plotWidth ?? 1,
                        plotHeight: yCfg.plotHeight,
                        scale: yCfg,
                        n: strip?.n ?? 1,
                      }, value);
                      const markXOf = (index: number): number => (strip ? strip.plotLeft + slot * (index + 0.5) : 0);
                      const extremeMarks = strip
                        ? [
                          ...priceMarks.map((mark) => ({
                            x: markXOf(mark.index),
                            y: priceY(mark.value),
                            label: mark.kind === 'min' ? ('below' as const) : ('above' as const),
                          })),
                          ...volumeMarks.map((mark) => ({ x: markXOf(mark.index), y: volumeY(mark.value) })),
                        ]
                        : [];
                      const cardPlan = strip && (priceCard?.visible || volumeCard?.visible)
                        ? spreadCardPlan({
                          plotLeft: strip.plotLeft,
                          plotTop: PANEL_GRID_TOP,
                          plotWidth: strip.plotWidth,
                          plotHeight: yCfg.plotHeight,
                          extremeMarks,
                          frameRight: strip.plotLeft + strip.plotWidth + CHART_GRID_RIGHT - 8,
                          priceBandY: priceSpread?.min && priceSpread.max
                            ? [priceY(priceSpread.max.value), priceY(priceSpread.min.value)]
                            : null,
                          volumeBandY: volumeSpread?.min && volumeSpread.max
                            ? [volumeY(volumeSpread.max.value), volumeY(volumeSpread.min.value)]
                            : null,
                        })
                        : null;
                      // 引导线只画「极值点 → 极差卡」一段：价格线到价格卡右缘、销量线到销量卡左缘，
                      // 各留 4px 缝；点落在卡片后方（x 在卡区间内/外侧）时不画线只留点
                      const priceCardRight = cardPlan ? cardPlan.price.left + cardPlan.price.width : null;
                      const volumeCardLeft = cardPlan ? cardPlan.volume.left : null;
                      const priceMarkViews = priceMarks.map((mark) => {
                        const x = markXOf(mark.index);
                        const toX = priceCardRight != null && x > priceCardRight ? priceCardRight + 4 : x;
                        return { ...mark, toward: 'left' as const, toX };
                      });
                      const volumeMarkViews = volumeMarks.map((mark) => {
                        const x = markXOf(mark.index);
                        const toX = volumeCardLeft != null && x < volumeCardLeft ? volumeCardLeft - 4 : x;
                        return { ...mark, toX };
                      });
                      return (
                      <div
                        key={p.key}
                        onDragOver={reading ? undefined : (e) => {
                          if (!draggingPanel || draggingPanel === p.spec.key) return;
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                          setDropTarget(p.spec.key);
                        }}
                        onDragLeave={reading ? undefined : () => setDropTarget((t) => (t === p.spec.key ? null : t))}
                        onDrop={reading ? undefined : (e) => {
                          e.preventDefault();
                          if (draggingPanel) movePanelTo(draggingPanel, p.spec.key);
                          setDraggingPanel(null);
                          setDropTarget(null);
                        }}
                        style={reading ? {
                          background: 'transparent',
                          padding: '0 12px',
                          position: 'relative',
                          minWidth: 0,
                          borderLeft: panelIndex > 0 ? `1px solid ${color.hairline}` : undefined,
                        } : {
                          border: `1px solid ${dropTarget === p.spec.key && draggingPanel !== p.spec.key ? color.link : color.hairline}`,
                          boxShadow:
                            dropTarget === p.spec.key && draggingPanel !== p.spec.key
                              ? 'inset 0 0 0 2px rgba(0, 112, 243, 0.35)'
                              : undefined,
                          borderRadius: radius.card,
                          background: color.canvas,
                          padding: `${PANEL_GRIP_H}px 8px 0`,
                          position: 'relative',
                          isolation: 'isolate',
                          opacity: draggingPanel === p.spec.key ? 0.45 : undefined,
                        }}
                      >
                        {!reading && (
                        <span
                          draggable
                          onDragStart={(e) => {
                            setDraggingPanel(p.spec.key);
                            e.dataTransfer.effectAllowed = 'move';
                            e.dataTransfer.setData('text/plain', p.spec.key);
                          }}
                          onDragEnd={() => {
                            setDraggingPanel(null);
                            setDropTarget(null);
                          }}
                          role="button"
                          aria-label={`拖动调整 ${p.name} 面板位置`}
                          title="拖动调整面板顺序"
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            zIndex: 10,
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '0 9px',
                            height: 18,
                            background: color.canvas,
                            border: `1px solid ${draggingPanel === p.spec.key ? color.link : color.hairline}`,
                            borderRadius: radius.pill,
                            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.06)',
                            cursor: 'grab',
                            color: color.mute,
                            lineHeight: '16px',
                          }}
                        >
                          <HolderOutlined style={{ fontSize: 10 }} />
                        </span>
                        )}
                        <div style={{ height: PANEL_HEAD_H, padding: '0 4px 2px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, minWidth: 0 }}>
                          <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: reading ? 'flex-start' : 'center' }}>
                          {reading ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, minWidth: 0, maxWidth: '100%' }}>
                              <PlatformRow pill={pill} dimmed={false} />
                              <div style={{ minWidth: 0, maxWidth: '100%' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                                  <BrandDot brand={p.brand} size={6} />
                                  <span style={{ fontSize: 10, lineHeight: '12px', color: color.mute, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pill.brandLabel}</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, marginTop: 1 }}>
                                  <span style={{ fontSize: 12, lineHeight: '16px', fontWeight: 600, color: color.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pill.nameText}</span>
                                  {pill.romText && (
                                    <span className="tnum" style={{ flexShrink: 0, fontSize: 10, lineHeight: '14px', fontWeight: 600, padding: '0 6px', borderRadius: radius.pill, color: selectSoftInk, background: selectSoft, fontFamily: font.family, fontVariantNumeric: 'tabular-nums' }}>{pill.romText}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          ) : (
                          <PanelHeader
                            brand={p.brand}
                            name={p.name}
                            isMain={p.spec.isMain}
                            syncActive={storeSyncMap[p.spec.cardId] === true}
                            onStoreSync={p.spec.isMain ? () => toggleStoreSync(p) : undefined}
                          >
                            <PillUnit pill={{ ...pill, hidden: panelHidden }} dimmed={false} onToggle={toggleHidden} onHover={() => {}} />
                          </PanelHeader>
                          )}
                          </div>
                          {safeViewMode.kind === 'mains' && p.spec.isMain && (state.mains.find((card) => card.id === p.spec.cardId)?.compares.length ?? 0) > 0 && (
                            <button
                              type="button"
                              aria-label={`查看 ${p.name} 所在组的 ${state.mains.find((card) => card.id === p.spec.cardId)?.compares.length ?? 0} 款对比产品`}
                              onClick={() => setViewMode({ kind: 'group', cardId: p.spec.cardId })}
                              style={{ flex: '0 0 auto', border: 'none', background: 'none', padding: 0, color: color.link, fontSize: 11, lineHeight: '14px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                            >
                              本组对比（{state.mains.find((card) => card.id === p.spec.cardId)?.compares.length ?? 0}）
                            </button>
                          )}
                        </div>
                        <div style={{ position: 'relative' }}>
                          <VolumeBars
                            geom={geoms[p.idx] ?? null}
                            plotTop={PANEL_GRID_TOP}
                            plotHeight={yCfg.plotHeight}
                            values={panelHidden ? [] : volumes[p.idx]}
                            vMax={panelVMax[p.idx]}
                            color={p.vis[0]?.color ?? brandColorOf(p.brand)}
                            hoverIdx={hoverIdxs[p.idx] ?? null}
                            axisLimits={volumeLimits[p.idx] ?? { max: null }}
                            onAxisLimit={(kind, value) => onVolumeAxisLimit(p.idx, kind, value)}
                            rangeMarks={panelHidden ? [] : volumeMarkViews}
                          />
                          <Chart
                            series={panelHidden ? [] : p.vis}
                            granularity={state.granularity}
                            currency={state.currency}
                            priceTypes={state.priceTypes}
                            tipMode={tipMode}
                            gridLeft={CHART_GRID_LEFT}
                            gridRight={CHART_GRID_RIGHT} // 右侧预留销量轴列（轴线+最高值输入框不与绘图区重叠）
                            gridTop={PANEL_GRID_TOP}
                            chrome={false}
                            axisChrome={false}
                            showYTicks={showYTicks}
                            showTiers={showTiers}
                            enableDrill={false}
                            windowKey={`${effWins[p.idx][0]}:${effWins[p.idx][1]}:${p.key}`}
                            yScale={yCfg}
                            volumes={volumes[p.idx]}
                            hideNamePills // 第一百一十三轮（评审）：面板内不画产品药丸，产品名在面板头
                            lineShape={lineShape}
                            labelMode={labelMode} // 第一百一十四轮（评审）：价格显示 详细/精简
                            markExtremes={brush != null}
                            tipBox // 第一百一十四轮（评审）：悬停明细 = 图下方居中预留框
                            // 与价格走势分离面板一致，图内保留周刻度；底部时间轴继续承载窗口拖拽。
                            showXLabels
                            crosshairIdx={marginFocusIndex((marginCosts[p.idx] ?? []).length, hoverIdxs[p.idx] ?? null, lastValidMarginIndex(marginCosts[p.idx] ?? []))}
                            onCrosshairMove={onHoverOf(p.idx)}
                            crosshairY={crossY} // 第一百一十四轮（评审）：横向虚线横跨全部面板
                            onCrosshairYMove={setCrossY}
                            brush={brushLive[p.idx] ?? brushes[p.idx] ?? null} // 第118/119轮：拖选高亮随同步态联动或独立
                            extendCrosshair
                            showBrushHint={false}
                            dimOutsideBrush={false}
                            onBrushChange={onBrushChangeOf(p.idx)}
                            rangeMarks={priceMarkViews}
                            onGeom={onGeomOf(p.idx)}
                            emptyHint={panelHidden ? '已隐藏，点击产品名恢复显示' : p.failed ? LOAD_ERROR_HINT : '该产品在所选时间范围内无数据'}
                          />
                          {cardPlan && (
                            <>
                              {priceCard?.visible && (
                                <SpreadRangeCard title="价格" model={priceCard} style={{ position: 'absolute', left: cardPlan.price.left, top: cardPlan.price.top, height: cardPlan.price.height, zIndex: 17, boxShadow: 'none' }} />
                              )}
                              {volumeCard?.visible && (
                                <SpreadRangeCard title="销量" model={volumeCard} style={{ position: 'absolute', left: cardPlan.volume.left, top: cardPlan.volume.top, height: cardPlan.volume.height, zIndex: 17, boxShadow: 'none' }} />
                              )}
                            </>
                          )}
                        </div>
                        <MarginCostBand
                          geom={geoms[p.idx] ?? null}
                          points={marginCosts[p.idx] ?? []}
                          currency={state.currency}
                          seriesColor={p.vis[0]?.color ?? brandColorOf(p.brand)}
                          hoverIdx={hoverIdxs[p.idx] ?? null}
                          onHover={onHoverOf(p.idx)}
                          empty={marginCostAvailabilityOf(p.spec.isOwn, marginCosts[p.idx] ?? []) === 'empty'}
                        />
                        {/* 本图时间轴（第一百二十三轮起同步/非同步恒在，位置对齐绘图区左右缘）：
                            同步 = 全图查看同一段时间，拖任一条同步调整；非同步 = 各图独立调整。
                            恒渲染保证切换同步只改联动行为，面板高度与轨道横向位置不变 */}
                        <div style={{ margin: `0 ${CHART_GRID_RIGHT}px 6px 8px` }}>
                          <PanelTimeTrack
                            ids={domainIds}
                            lo={filterBounds[0]}
                            hi={filterBounds[1]}
                            s={timeSynced ? win.s : effWins[p.idx][0]}
                            e={timeSynced ? win.e : effWins[p.idx][1]}
                            granularity={state.granularity}
                            onChange={timeSynced ? onWindowChange : onPanelWindowChange(p.idx)}
                            onAdjusting={setAdjusting}
                          />
                        </div>
                      </div>
                      );
                    })}
                    </div>
                  </div>
                )}
          </div>
      </div>
      </div>
      </div>

      </section>
    </>
  );
}
