// ============================================================
// §4.1 图卡内容 + §6 价格走势全家桶编排：
// 第一行 = 左 [折后价|RRP 复选]；右 [汇总]（仅月/季，写回 state.agg）
// ——每格高度伸缩滑杆（第十轮）收进图内币种符号旁的齿轮弹层（Popover），不占版面；
//   倍率状态仍在本层（与刷选冻结共用 yCfg），经 yScale/sliderScale 受控传入 Chart
// 下方 = Chart（ECharts+覆盖层）> XBrush（重采样窗口）。
// 第五十六轮（领导页面清洁要求）：促销力度热力带（原横向色格带）撤出主视觉，
// 收进「⋯ 更多」二级菜单 → 右侧抽屉纵向表格（PromoDrawer）；最高/最低价与
// 价格变化提醒同收二级菜单且默认关闭。再版（第112轮）：时点摘要（折扣率/
// 现价/划线RRP/来源横排）唯一入口 = 标题行「时点摘要」按钮（打开态高亮），
// 点击后图右侧原地展开 336px 内嵌面板（纵向一行一产品框，图表收窄不遮挡）；
// 不持久化，每次进页默认收起。主视觉 = 标题行+工具行+图。
// Y 轴口径（第七/九轮）：纯自适应分段压缩刻度，无手动覆盖；刷选拖动中冻结 Y 轴
// （onAdjusting），松手统一重算一次——调节过程只有横向重采样，体验稳定。
// 容器高由 Y 模型派生：格数×TICK_PX + 断裂条 + 图顶卡片区 + 底边距（跨度大 → 自动变高）。
// 数据流 = useFilters().state → SeriesQuery → buildSeries → 窗口切片 → PriceTrend
// 时间自适应（默认开）按所选产品最早/最晚有效价格桶确定上方极值筛选器；
// 底部刷选轨道只在该筛选范围内提供查看窗口。
// 上方极值筛选器手动改值即转入自定义；底部拖柄/平移只调整筛选范围内的查看窗口。
// 取数仍按数据全集（数据量小、内存计算）：窗口边缘的续接线需要范围外的邻点。
// ============================================================
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button, Checkbox, ConfigProvider, Segmented, Switch } from 'antd';
import { HolderOutlined, ProfileOutlined } from '@ant-design/icons';
import { useFilters } from '../../state/FiltersContext';
import { tierSubjectSelections } from '../../state/tierSelection';
import PlatformBox from '../../components/FilterBar/PlatformBox';
import CurrencyBox from '../../components/FilterBar/CurrencyBox';
import { filterBarTheme } from '../../components/FilterBar';
import { navBus } from '../../state/navBus';
import { modelNameOf } from '../../components/ProductCascader/tree';
import { useAlerts } from '../../components/AlertCenter';
import { groupAlertsBySeries, latestAlerts } from '../../dataModel/alerts';
import { buildSeries } from '../../dataModel/aggregate';
import { getEffectiveBenchmark } from '../../state/configStore';
import { dimPromo, dimProduct, dimRegion, dimTier } from '../../data';
import type {
  AggMode,
  Granularity,
  Series,
  SeriesPoint,
  SeriesQuery,
  SkuGroupQuery,
} from '../../dataModel/types';
import type { ProductSelection } from '../../state/filtersTypes';
import { color, fontSize, radius, space } from '../../theme/tokens';
import Chart from './Chart';
import ChartToolbar from './ChartToolbar';
import XBrush from './XBrush';
import DrillModal, { type DrillInfo } from './DrillModal';
import {
  buildPriceSummary,
  buildPromoBands,
  collectTierValues,
  dedupeSpecText,
  type LineShapeChoice,
} from './chartModel';
import SplitAxisColumn from './SplitAxisColumn';
import {
  GRID,
  adaptiveRangeOf,
  bucketLatestWeekLabel,
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
  bucketIdOfWeek,
  bucketAnchorDate,
  NAME_ZONE_W,
  type Bucket,
  type YScale,
} from './helpers';
import PromoDrawer from './PromoDrawer';
import PointPanel from './PointPanel';
import SplitScrollBar from './SplitScrollBar';

export default function PriceTrend(props: {
  /** 第八十五轮：竞品-only 引导带里「去总览配置对标」的回跳 */
  onBackToOverview?: () => void;
  /** 第110轮（评审）：图下「核心信息明细」取数口——图上可见时间段 × 图上系列
   *  （分离模式 = 各面板系列并集，同款产品去重）每次变化上报一次；页面层据此
   *  在图卡下方渲染同源明细表（币种/平台/粒度/时间段随图联动）
   *  第一百一十三轮（评审）：第三参 full = 完整范围（上方极值筛选范围）数据 +
   *  当前查看窗口在其中的下标 s/e——明细表时间筛选默认跟图，也可在完整范围内自选 */
  onSeriesWindow?: (
    series: Series[],
    buckets: { id: string; xLabel: string; anchorDate: string }[],
    full: { series: Series[]; buckets: { id: string; xLabel: string; anchorDate: string }[]; s: number; e: number },
  ) => void;
} = {}) {
  const { state, actions } = useFilters();
  // 主体模式有效选择集：按产品 = 勾选原样；按档位 = 该档全部我司配置 + 各自对标竞品
  // 自动集结（tierSubjectSelections）。档位在当前产业无我司产品时回退按产品，避免空图。
  // 页内画图/配对/面板/降级引导统一读有效集；state.own 勾选态只作为按产品模式的取值。
  const effSelections = useMemo(() => {
    if (state.subjectMode !== 'tier' || !state.tier) return { own: state.own, competitors: state.competitors };
    const resolved = tierSubjectSelections(state.industry, state.tier);
    return resolved ?? { own: state.own, competitors: state.competitors };
  }, [state.subjectMode, state.tier, state.industry, state.own, state.competitors]);
  const effOwn = effSelections.own;
  const effComps = effSelections.competitors;
  // 第八十五轮 视角语义：竞品-only（无我司有竞品）与 无对标（有我司无竞品）
  const compOnly = effOwn.length === 0 && effComps.length > 0;
  const noComp = effOwn.length > 0 && effComps.length === 0;
  const compModelCount = new Set(effComps.map((c) => c.modelId)).size;

  // ---- 图表内部状态 ----
  const [sliderScale, setSliderScale] = useState<number>(1); // 每格高度倍率（不改刻度值；松手才提交）
  const [yCompress, setYCompress] = useState<boolean>(false); // Y 轴自动压缩（第三十五轮起默认关 = 完全连续；迪总「不自动选择」）
  const [adjusting, setAdjusting] = useState(false); // 刷选拖动中（冻结 Y 轴自适应）
  const [windowIds, setWindowIds] = useState<[string, string] | null>(null); // null=整个筛选范围
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set()); // 图例取消选中的系列（折线隐藏）
  const [drill, setDrill] = useState<DrillInfo | null>(null);
  const [promoBandsOn, setPromoBandsOn] = useState(false); // 大促档期（第七十七轮起默认关）
  const [offersOn, setOffersOn] = useState(false); // offer 权益显隐：关 = 不画徽章、浮窗不出权益行（第七十七轮起默认关）
  // 最高/最低价 + 价格变化提醒（第五十六轮）：非主要功能——默认关，收进工具行
  // 「⋯ 更多」二级菜单（领导页面清洁要求）；启用时 ⋯ 按钮带蓝点提示
  const [maxMinOn, setMaxMinOn] = useState(false);
  // 价格变化提醒：null=关；阈值=小数（0.05=5%），滑杆 0~15% 连贯可调（0.5 步进）
  const [changeThreshold, setChangeThreshold] = useState<number | null>(null);
  // 促销力度明细抽屉（第五十六轮）：原图下横向热力带收进二级抽屉（纵向表格）
  const [promoDetailOpen, setPromoDetailOpen] = useState(false);
  // 时点摘要面板（第112轮）：唯一入口 = 标题行「时点摘要」按钮，纯手动开合；
  // 不持久化（每次进页面默认收起）；促销明细抽屉打开时自动收起（右侧空间冲突）
  const [pointPanelOpen, setPointPanelOpen] = useState(false);
  const openPromoDetail = (): void => {
    setPointPanelOpen(false); // 右侧空间冲突：打开促销明细时收起时点面板
    setPromoDetailOpen(true);
  };
  // 齿轮弹层视图开关（第五十四轮追补上提到本层）：分离模式下由常驻工具行
  // 统一写，主图与全部分离面板同值（此前是各 Chart 实例内部状态，互相不同步）
  const [showYTicks, setShowYTicks] = useState(true); // Y 刻度线（第九十一轮恢复；默认开）
  // 折线形态（第五十四轮追补③）：auto=按粒度自适应（周=阶梯 / 月季=平滑），缺省
  const [lineShape, setLineShape] = useState<LineShapeChoice>('auto');

  // §5.6/§6.6：切换产品/价格类型/币种 → 滑杆倍率复位 ×1；图例显隐一并复位
  const yAxisResetKey = JSON.stringify([effOwn, effComps, state.priceTypes, state.currency]);
  useEffect(() => {
    setSliderScale(1);
    setHiddenKeys(new Set());
  }, [yAxisResetKey]);

  // §6.5 联动：粒度切换 → 窗口端点对齐新粒度桶边界（保持同一时间跨度）
  const granRef = useRef(state.granularity);
  useLayoutEffect(() => {
    if (granRef.current === state.granularity) return;
    const prev = granRef.current;
    granRef.current = state.granularity;
    setWindowIds((ids) => (ids ? convertWindowIds(ids, prev, state.granularity) : null));
  }, [state.granularity]);

  // ---- 取数：useFilters().state → SeriesQuery → buildSeries（§7.3 唯一口径） ----
  // 按数据全集取数（内存小数据集，成本可忽略）：跨度/自适应范围、窗口边缘续接
  // 都要看范围外的邻点；当前选区决定图上可见的数据段。
  const [dataStart, dataEnd] = useMemo(() => dataBucketRange(state.granularity), [state.granularity]);

  const query: SeriesQuery = useMemo(
    () => ({
      groups: [
        ...effOwn.map((g) => ({ ...g, isOwn: true })),
        ...effComps.map((g) => ({ ...g, isOwn: false })),
      ],
      granularity: state.granularity,
      startBucket: dataStart,
      endBucket: dataEnd,
      currency: state.currency,
      agg: state.agg,
      platform: state.platform,
      scope: { countryCode: state.countryCode, industry: state.industry },
    }),
    [effOwn, effComps, state.granularity, dataStart, dataEnd, state.currency, state.agg, state.platform, state.countryCode, state.industry],
  );

  const allSeries: Series[] = useMemo(() => {
    if (query.groups.length === 0) return [];
    try {
      return buildSeries(query);
    } catch {
      return []; // 空态不崩
    }
  }, [query]);

  // 全集桶 = 桶枚举基准（自适应跨度、窗口下标、边缘续接都基于全集下标空间）
  const buckets: Bucket[] = useMemo(
    () => enumerateBuckets(state.granularity, dataStart, dataEnd),
    [state.granularity, dataStart, dataEnd],
  );

  // ---- 时间自适应：上方极值筛选器 = 所选产品最早/最晚有效价格桶 ----
  // 范围变化时窗口复位为整个范围。即使新增产品落在原有跨度内，也要重新套用一次
  // 自动极值（例如从总览聚焦周进入后，清除局部窗口）。
  // 关闭时清 key；用户手动刷选后的自定义范围不受产品变化影响。
  // 注意本 effect 声明在 granRef 联动之后：粒度切换时先换桶、自适应范围随后覆盖。
  const span = useMemo(() => seriesSpanRange(allSeries), [allSeries]);
  const adaptiveBounds = useMemo(
    () => (state.adaptive ? adaptiveRangeOf(buckets, span, 0) : null),
    [state.adaptive, buckets, span],
  );
  const selectedProductKey = JSON.stringify([
    effOwn.map(({ modelId, romram }) => `${modelId}|${romram}`).sort(),
    effComps.map(({ modelId, romram }) => `${modelId}|${romram}`).sort(),
  ]);
  const adaptiveKey = adaptiveBounds
    ? `${state.granularity}|${adaptiveBounds[0]}|${adaptiveBounds[1]}|${selectedProductKey}`
    : '';
  const adaptiveAppliedRef = useRef('');
  useLayoutEffect(() => {
    if (!adaptiveBounds) {
      adaptiveAppliedRef.current = '';
      return;
    }
    if (adaptiveAppliedRef.current === adaptiveKey) return;
    adaptiveAppliedRef.current = adaptiveKey;
    actions.set({ rangeStart: adaptiveBounds[0], rangeEnd: adaptiveBounds[1] });
    setWindowIds(null); // 窗口复位 = 整个自动极值范围
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adaptiveKey]);

  // 追补⑧（总览↔看板闭环②）：总览下钻（竞品对比/迷你图点周）携带「焦点周」——
  // 挂载后窗口对准该周 ±8 周（月 ±2 桶、季 ±1 桶，时间跨度近似），直接回答
  // 「这个低价是怎么发生的」。声明在自适应 effect 之后：挂载首帧自适应先落范围，
  // 这里再聚焦（最终窗口以焦点为准）；normalizeWindow 渲染期会把窗口钳入筛选范围。
  // 焦点周经 bucketIdOfWeek 跨粒度换算（总览给周 id，看板可能停在月/季）。navBus 一次性消费
  useEffect(() => {
    const wk = navBus.dashboardFocusWeekId;
    if (!wk) return;
    navBus.dashboardFocusWeekId = null;
    const id = bucketIdOfWeek(state.granularity, wk);
    const i = id != null ? buckets.findIndex((b) => b.id === id) : -1;
    if (i < 0) return;
    const half = state.granularity === 'week' ? 8 : state.granularity === 'month' ? 2 : 1;
    setWindowIds([buckets[Math.max(0, i - half)].id, buckets[Math.min(buckets.length - 1, i + half)].id]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 从总览带入焦点周时 windowIds 可暂时缩小可见段；刷选后回到完整选区。
  const win = useMemo(
    () => normalizeWindow(buckets, windowIds, [state.rangeStart, state.rangeEnd]),
    [buckets, windowIds, state.rangeStart, state.rangeEnd],
  );
  // 左侧时间筛选器的范围 = 底部窗口轨道的范围；窗口本身仍可在轨道内缩放查看。
  const filterBounds = useMemo<[number, number]>(() => {
    const indexOf = (id: string, fallback: number): number => {
      const i = buckets.findIndex((b) => b.id === id);
      return i >= 0 ? i : fallback;
    };
    const start = indexOf(state.rangeStart, 0);
    const end = indexOf(state.rangeEnd, Math.max(0, buckets.length - 1));
    return start <= end ? [start, end] : [end, start];
  }, [buckets, state.rangeStart, state.rangeEnd]);


  // §6.5 窗口内所有桶压满绘图宽度（重采样重绘，无横向滚动条）
  // 第十三轮：edgeStart/edgeEnd = 边缘点在窗口外 2 周内仍有数据（该点非真实开头/截止，
  // 图上画灰色续接短线；右缘为最新时间时无续接 → 按真实截止处理）
  const visSeries: Series[] = useMemo(() => {
    if (win.s > win.e) return [];
    const listed = (p?: SeriesPoint) => !!p && (p.price != null || p.rrp != null);
    return allSeries
      .map((s) => {
        const points = s.points.slice(win.s, win.e + 1);
        const edgeStart = listed(points[0]) && (listed(s.points[win.s - 1]) || listed(s.points[win.s - 2]));
        const edgeEnd =
          listed(points[points.length - 1]) && (listed(s.points[win.e + 1]) || listed(s.points[win.e + 2]));
        return { ...s, points, edgeStart, edgeEnd };
      })
      .filter((s) => s.points.length > 0);
  }, [allSeries, win]);

  // 图例可见系列（卡片取消选中的不画线；Y 轴自适应随之收缩；卡片/促销表仍显示全部）
  const chartSeries: Series[] = useMemo(
    () => visSeries.filter((s) => !hiddenKeys.has(s.key)),
    [visSeries, hiddenKeys],
  );
  const toggleLegend = (key: string): void => {
    setHiddenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // 预警订阅（第五十二轮建；第五十三轮入口上移）：时点页签（PriceSummary）尾铃铛
  // = 按系列（modelId__romram）订阅预警中心，四类预警（追补⑨）
  const alerts = useAlerts();
  const subscribedKeys = useMemo(() => new Set(state.alertSubs), [state.alertSubs]);
  const toggleAlertSub = (key: string): void => actions.toggleAlertSub(key);

  // 追补⑨：看板预警显示——时点页签铃铛黄点 = 该系列触发条数（与预警中心页同一引擎）
  const alertCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const [key, items] of groupAlertsBySeries(latestAlerts(alerts))) m[key] = items.length;
    return m;
  }, [alerts]);

  // 可分离面板不足 2 时收起分离视图并清理顺序（第八十七轮：面板单位放宽为
  // 「任意产品·配置」，我司/竞品视角分别以各自配置数为准）。
  // 第110轮（2026-10-20 评审）：分离显示默认关——仅当「我司配置 ≥2」且用户从未
  // 手动拨过开关时自动分离（单规格、竞品视角默认合并图）；回到不足 2 个可分面板
  // 自动关闭并清理顺序。手动拨过 = 尊重用户选择，此后自动语义退场（与 Y 压缩同一
  // 先例）。按档位模式配置数随档位跳变，依赖此自动跟随。
  const splitAutoOffRef = useRef(false);
  const splitManualRef = useRef(false);
  useEffect(() => {
    const panelable = effOwn.length > 0 ? effOwn.length : effComps.length;
    if (panelable < 2) {
      splitAutoOffRef.current = true;
      setSplitOn(false);
      setPanelOrder([]);
      return;
    }
    if (splitManualRef.current) return; // 手动拨过：不再自动干预
    if (effOwn.length >= 2) {
      splitAutoOffRef.current = false;
      setSplitOn(true);
    }
    // 其余（我司单配置 / 竞品视角多配置）：维持默认关，不自动分离
  }, [effOwn, effComps]);

  // ---- 分离显示：多 ROM 勾选时主图变为同一横向滚动轨道，每面板 =
  // 一个 ROM + 其对标竞品（生效矩阵按 own_romram 取、主竞品 sort 序）；共享 Y 轴 =
  // 全面板 series 并集算一次 computeYAxis 受控传入；X 轴各面板独立绘制（同窗口桶）；
  // 系列页签按面板拆开、放各卡片顶部居中（第七十五轮，PillRowScroller 左右滚动）；
  // 共享刷选条联动全部面板
  // 第110轮（评审）：默认关——我司多规格（≥2 配置）才自动分离，见上方自动逻辑
  const [splitOn, setSplitOn] = useState(false);
  // 分离模式一行可见面板数：卡片始终横向排列，超出视口后由轨道滚动查看。
  // 默认 2 个兼顾图表可读性；3 个适合宽屏快速扫读。
  const [splitColumns, setSplitColumns] = useState<2 | 3>(2);
  // 第八十七轮：分离单位 = 任意「产品·配置」——同产品多配置、跨产品多选、
  // 竞品视角（无我司、竞品 ≥2）均可分离；我司优先（有我司时竞品作对标随面板）。
  const configSources = useMemo(
    () =>
      effOwn.length > 0
        ? effOwn.map((sel) => ({ sel, isOwn: true as const }))
        : effComps.map((sel) => ({ sel, isOwn: false as const })),
    [effOwn, effComps],
  );
  const multiProduct = new Set(configSources.map((c) => c.sel.modelId)).size > 1;
  // 第八十八轮：竞品⇄我司联动映射（seriesKey → 联动系列 keys）——悬停名称药丸时
  // 折线/药丸联动高亮；按生效对标矩阵构建（合并图与分离面板共用同一份）
  const pairingsBySeries = useMemo(() => {
    const m = new Map<string, string[]>();
    if (effOwn.length === 0) return m;
    const bench = getEffectiveBenchmark();
    const add = (a: string, b: string): void => {
      m.set(a, [...(m.get(a) ?? []), b]);
    };
    for (const own of effOwn) {
      const ownKey = `${own.modelId}__${own.romram.replace(/\s+/g, '')}`;
      for (const b of bench) {
        if (b.own_model_id !== own.modelId || b.own_romram !== own.romram) continue;
        const p = dimProduct.find((r) => r.sku_id === b.competitor_sku_id);
        if (!p) continue;
        const compKey = `${p.sku_id.split('__')[0]}__${p.romram.replace(/\s+/g, '')}`;
        add(ownKey, compKey);
        add(compKey, ownKey);
      }
    }
    return m;
  }, [effOwn]);
  const splitActive = splitOn && configSources.length >= 2;
  // 第110轮（评审）：分离模式跨图参考线——任一面板悬停的时间列下标共享给全部面板，
  // 其余面板在同一时间列画 1px 虚线；任意面板移出即清空
  const [splitHoverIdx, setSplitHoverIdx] = useState<number | null>(null);
  // 跨产品/竞品视角分离时价位跨度天然拉大 → 进入时自动开「Y 轴自动压缩」；
  // 用户手动关闭后本段分离会话内不再强制（退出分离再进才重置）
  const yCompressAutoRef = useRef(false);
  useEffect(() => {
    if (splitActive && (multiProduct || effOwn.length === 0) && !yCompressAutoRef.current) {
      yCompressAutoRef.current = true;
      setYCompress(true);
    }
    if (!splitActive) yCompressAutoRef.current = false;
  }, [splitActive, multiProduct, effOwn.length]);
  // 面板顺序（第七十九轮：卡片上边线拖移把手拖拽换位，取代已移除的箭头调序）
  const [panelOrder, setPanelOrder] = useState<string[]>([]); // 面板 key 序；空 = own 序
  const [draggingPanel, setDraggingPanel] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const panels = useMemo(() => {
    if (!splitActive) return [];
    const bench = getEffectiveBenchmark();
    // 分离面板必须遵循筛选条当前的竞品选择。此前这里直接读取生效对标矩阵，
    // 即使用户在筛选条删空竞品，面板仍会把默认对标重新画出来。
    const selectedByKey = new Map(
      effComps.map((group) => [`${group.modelId}|${group.romram.replace(/\s+/g, '')}`, group]),
    );
    return configSources.map(({ sel, isOwn }) => {
      const key = `${sel.modelId}__${sel.romram.replace(/\s+/g, '')}`;
      if (!isOwn) {
        // 竞品视角（第八十七轮）：面板 = 纯竞品配置；无我司锚点，映射语义不适用
        return { key, sel, comps: [] as ProductSelection[], isOwn: false as const, compTags: [] };
      }
      const seen = new Set<string>();
      const compTags: { key: string; name: string; primary: boolean }[] = [];
      const mappedComps = bench
        .filter((b) => b.own_model_id === sel.modelId && b.own_romram === sel.romram)
        .sort((a, b) => a.sort - b.sort)
        .map((b) => {
          const p = dimProduct.find((r) => r.sku_id === b.competitor_sku_id);
          if (!p) return null;
          const group = selectedByKey.get(`${p.sku_id.split('__')[0]}|${p.romram.replace(/\s+/g, '')}`);
          if (!group || seen.has(group.modelId + '|' + group.romram)) return null;
          seen.add(group.modelId + '|' + group.romram);
          // 第八十八轮：主竞品标志（sort=1）供面板头名单 ★ 标注
          const primary = bench.some(
            (x) => x.own_model_id === sel.modelId && x.own_romram === sel.romram && x.competitor_sku_id === p.sku_id && x.sort === 1,
          );
          compTags.push({ key: key, name: modelNameOf(group.modelId), primary });
          return group;
        })
        .filter((x): x is ProductSelection => x != null);
      // 手动模式没有 own-ROM 关联时，至少按同一容量匹配，避免把全局竞品
      // 重复画到每一张 ROM 卡片；有配置映射时优先遵循映射顺序。
      const fallbackComps = effComps.filter(
        (group) => group.romram.replace(/\s+/g, '') === sel.romram.replace(/\s+/g, '') && !seen.has(group.modelId + '|' + group.romram),
      );
      for (const group of fallbackComps) {
        compTags.push({ key: `${group.modelId}__${group.romram.replace(/\s+/g, '')}`, name: modelNameOf(group.modelId), primary: false });
      }
      const comps = state.autoMatch ? mappedComps : [...mappedComps, ...fallbackComps];
      return { key, sel, comps, isOwn: true as const, compTags };
    });
  }, [splitActive, configSources, effComps, state.autoMatch]);

  const panelData = useMemo(() => {
    if (panels.length === 0) return [];
    return panels.map(({ key, sel, comps, isOwn, compTags }) => {
      let series: Series[] = [];
      try {
        series = buildSeries({
          groups: [
            { ...sel, isOwn },
            ...comps.map((c) => ({ ...c, isOwn: false })),
          ],
          granularity: state.granularity,
          startBucket: dataStart,
          endBucket: dataEnd,
          currency: state.currency,
          agg: state.agg,
          platform: state.platform,
          scope: { countryCode: state.countryCode, industry: state.industry },
        });
      } catch {
        series = []; // 空态不崩
      }
      return { key, sel, comps, isOwn, compTags, series };
    });
  }, [panels, state.granularity, dataStart, dataEnd, state.currency, state.agg, state.platform, state.countryCode, state.industry]);

  // 面板窗口切片（与单图 visSeries 同逻辑：win 切片 + 边缘续接标记）
  const sliceVis = (list: Series[]): Series[] => {
    if (win.s > win.e) return [];
    const listed = (p?: SeriesPoint) => !!p && (p.price != null || p.rrp != null);
    return list
      .map((s) => {
        const points = s.points.slice(win.s, win.e + 1);
        const edgeStart = listed(points[0]) && (listed(s.points[win.s - 1]) || listed(s.points[win.s - 2]));
        const edgeEnd = listed(points[points.length - 1]) && (listed(s.points[win.e + 1]) || listed(s.points[win.e + 2]));
        return { ...s, points, edgeStart, edgeEnd };
      })
      .filter((s) => s.points.length > 0);
  };
  const panelViews = useMemo(
    () =>
      panelData.map((p) => ({
        ...p,
        all: sliceVis(p.series), // 全量（含被图例页签屏蔽的系列，页签要能恢复显示）
        vis: sliceVis(p.series).filter((s) => !hiddenKeys.has(s.key)),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [panelData, win, hiddenKeys],
  );

  // 展示顺序：拖拽把手换位后记录 key 序；空 = 数据序
  const orderedPanels = useMemo(() => {
    if (panelOrder.length === 0) return panelViews;
    const idx = (k: string) => {
      const i = panelOrder.indexOf(k);
      return i === -1 ? 999 : i;
    };
    return [...panelViews].sort((a, b) => idx(a.key) - idx(b.key));
  }, [panelViews, panelOrder]);
  // 拖拽落点 = 把被拖面板插到目标面板当前位置
  const movePanelTo = (dragKey: string, targetKey: string): void => {
    if (dragKey === targetKey) return;
    const keys = orderedPanels.map((p) => p.key);
    const from = keys.indexOf(dragKey);
    const to = keys.indexOf(targetKey);
    if (from < 0 || to < 0) return;
    keys.splice(to, 0, keys.splice(from, 1)[0]);
    setPanelOrder(keys);
  };

  // 共享 Y 轴：全面板 series 并集算一次（各面板受控传入同一 yScale，刻度逐像素一致）。
  // splitYCfg/splitGridLeft 声明在主图 gridLeft 之后（见下方）

  // 面板下钻：seriesKey 在面板内查找（主图 allSeries 不含面板 series）
  const makePanelDrill = (
    panel: (typeof panelViews)[number],
  ): ((seriesKey: string, bucketId: string) => void) => {
    const groups = [
      { ...panel.sel, isOwn: panel.isOwn },
      ...panel.comps.map((c) => ({ ...c, isOwn: false })),
    ];
    return (seriesKey: string, bucketId: string) => {
      if (state.granularity === 'week') return;
      const s = panel.series.find((x) => x.key === seriesKey);
      const grp = groups.find((g) => `${g.modelId}__${g.romram.replace(/\s+/g, '')}` === seriesKey);
      if (!s || !grp) return;
      setDrill({
        group: { modelId: grp.modelId, romram: grp.romram, skuIds: s.skuIds, isOwn: grp.isOwn },
        label: s.label,
        originGran: state.granularity === 'quarter' ? 'quarter' : 'month',
        originBucket: bucketId,
      });
    };
  };

  // ---- 价格摘要条（第三十六轮定版）：固定显示窗口内最新时点（不随悬停变换，
  //      时点明细看悬停浮窗）；竞品与我司同款样式、来源为取证超链接 ----
  // 第110轮（评审）：时点摘要产品清单按价位档从高到低、同档按现价从高到低排列
  //（档位 = skuIds[0] 产品维 tier_code，产业档位梯 dimTier.ladders 定序；只读维表）；
  // 渲染期对名称做单位/叠词去重（如「16+1 TB TB」类重复文案收敛）
  const summary = useMemo(() => {
    const items = buildPriceSummary(chartSeries);
    const ladder = dimTier.ladders[state.industry] ?? [];
    const tierRank = new Map<string, number>();
    for (const s of chartSeries) {
      const sku = s.skuIds[0] != null ? dimProduct.find((p) => p.sku_id === s.skuIds[0]) : null;
      const i = sku ? ladder.indexOf(sku.tier_code) : -1;
      tierRank.set(s.key, i < 0 ? -1 : i);
    }
    return items
      .map((it) => ({ ...it, name: dedupeSpecText(it.name) }))
      .sort((a, b) => {
        const r = (tierRank.get(b.key) ?? -1) - (tierRank.get(a.key) ?? -1);
        if (r !== 0) return r;
        return (b.price ?? Number.NEGATIVE_INFINITY) - (a.price ?? Number.NEGATIVE_INFINITY);
      });
  }, [chartSeries, state.industry]);

  // ---- 大促背景带（第三十四轮）：dim_promo ∩ 窗口桶覆盖区间；随窗口联动 ----
  const winBuckets = useMemo(() => buckets.slice(win.s, win.e + 1), [buckets, win]);

  // ---- 图下「核心信息明细」同源取数（第110轮，评审）：合并模式 = 窗口内全部系列
  //（含被名称药丸屏蔽者——明细表有自己的产品筛选，屏蔽只管折线）；分离模式 =
  // 各面板系列并集（同款竞品被多张面板对标时按系列去重）。行集 = 系列 × 可见时间段，
  // 经 onSeriesWindow 上报页面层渲染（明细表与图共享粒度/币种/平台/时间段口径）
  const tableSeries: Series[] = useMemo(() => {
    if (!splitActive) return visSeries;
    const seen = new Set<string>();
    const out: Series[] = [];
    for (const p of panelViews) {
      for (const s of p.all) {
        if (seen.has(s.key)) continue;
        seen.add(s.key);
        out.push(s);
      }
    }
    return out;
  }, [splitActive, visSeries, panelViews]);
  const tableBuckets = useMemo(
    () =>
      winBuckets.map((b) => ({
        id: b.id,
        xLabel: b.xLabel,
        anchorDate: bucketAnchorDate(state.granularity, b.id) ?? '',
      })),
    [winBuckets, state.granularity],
  );
  // 第一百一十三轮（评审）：明细表自选时间段所需的完整范围数据——覆盖上方极值
  // 筛选范围（filterBounds [lo,hi]）而非仅当前查看窗口。合并模式 = allSeries 按
  // 筛选范围切片（含被名称药丸屏蔽者——屏蔽只管折线）；分离模式 = 各面板系列
  // 并集去重（与 tableSeries 同序）后按筛选范围切片。边缘续接标记对表无意义，不带。
  const fullBuckets = useMemo(
    () =>
      buckets.slice(filterBounds[0], filterBounds[1] + 1).map((b) => ({
        id: b.id,
        xLabel: b.xLabel,
        anchorDate: bucketAnchorDate(state.granularity, b.id) ?? '',
      })),
    [buckets, filterBounds, state.granularity],
  );
  const fullTableSeries: Series[] = useMemo(() => {
    const [lo, hi] = filterBounds;
    const sliceRange = (list: Series[]): Series[] =>
      list
        .map((s) => ({ ...s, points: s.points.slice(lo, hi + 1) }))
        .filter((s) => s.points.length > 0);
    if (!splitActive) return sliceRange(allSeries);
    const seen = new Set<string>();
    const union: Series[] = [];
    for (const p of panelData) {
      for (const s of p.series) {
        if (seen.has(s.key)) continue;
        seen.add(s.key);
        union.push(s);
      }
    }
    return sliceRange(union);
  }, [splitActive, allSeries, panelData, filterBounds]);
  const onSeriesWindowRef = useRef(props.onSeriesWindow);
  onSeriesWindowRef.current = props.onSeriesWindow;
  useEffect(() => {
    // 窗口下标相对完整范围（full 从 filterBounds[0] 起）换算，钳到 ≥0
    onSeriesWindowRef.current?.(tableSeries, tableBuckets, {
      series: fullTableSeries,
      buckets: fullBuckets,
      s: Math.max(0, win.s - filterBounds[0]),
      e: Math.max(0, win.e - filterBounds[0]),
    });
  }, [tableSeries, tableBuckets, fullTableSeries, fullBuckets, win.s, win.e, filterBounds]);

  // 时点页签日期（第五十四轮追补①）：窗口末桶内最新日历周的周三锚日（MM-DD）——
  // 月/季粒度不再显示 2026-10 / 2026Q4（用户：时点恒为最新那一周对应的那一天；
  // 窗口平移到过去时跟随窗口，与摘要条数值口径一致）
  const pointDate = useMemo(() => {
    const last = winBuckets[winBuckets.length - 1];
    return last ? bucketLatestWeekLabel(state.granularity, last.id) : null;
  }, [winBuckets, state.granularity]);

  const winSpans = useMemo(() => bucketSpans(state.granularity, winBuckets), [state.granularity, winBuckets]);
  // 大促档期按国家取日历；标注了适用平台的档期（如亚马逊 Prime Day）只在该平台被选中/为默认电渠时显示
  const scopedPromos = useMemo(() => {
    const defaultPlatform = dimRegion.find((r) => r.country_code === state.countryCode)?.default_platform ?? null;
    const selected = state.platform && (state.platform.platforms.length || state.platform.shopIds.length)
      ? new Set([...state.platform.platforms, ...state.platform.shopIds.map((id) => id.split(':')[1] ?? '')])
      : new Set(defaultPlatform ? [defaultPlatform] : []);
    const selectedLower = new Set([...selected].map((p) => p.toLowerCase().replace(/[^a-z0-9]/g, '')));
    return dimPromo.filter(
      (p) => p.country_code === state.countryCode
        && (p.platforms == null || p.platforms.some((pl) => selectedLower.has(pl.toLowerCase().replace(/[^a-z0-9]/g, '')))),
    );
  }, [state.countryCode, state.platform]);
  const promoBands = useMemo(
    () => (promoBandsOn ? buildPromoBands({ promos: scopedPromos, spans: winSpans }) : []),
    [promoBandsOn, winSpans, scopedPromos],
  );

  // Y 轴 = 自适应分段刻度；刷选拖动中冻结（沿用上次 scale，只做横向重采样），
  // 松手统一重算一次 —— 调节过程不再实时改变纵轴（第九轮反馈）。
  // scaleRef 同时是步长滞回的 prev（第十一轮）：存的是"上一次未冻结"的模型，
  // 只要旧步长仍给得出 5~13 格就沿用，窗口平移/价格小漂移不再触发刻度换档+图高突跳
  const scaleRef = useRef<YScale | null>(null);
  const yCfg = useMemo(() => {
    if (adjusting && scaleRef.current) return scaleRef.current;
    const next = computeYAxis({
      series: chartSeries,
      priceTypes: state.priceTypes,
      sliderScale,
      allowBreak: yCompress,
      perUsd: perUsdOf(state.currency), // 档位锚定 USD（第二十三轮）：换币种格数/图高与 USD 相近
      prev: scaleRef.current,
    });
    scaleRef.current = next;
    return next;
  }, [chartSeries, state.priceTypes, sliderScale, adjusting, yCompress, state.currency]);
  // 图顶预留（第三十五轮）：钉顶卡片删除，36px 只保留 ₽/$+齿轮（左）与图例 chips（右）
  const gridTop = 36;
  // 分离面板图顶（第五十四轮追补）：面板 chrome=false 无工具行，只留窄空气带——
  // S/E 徽标上探 7.5px、名称避让钳 plotTop+2，14px 够用；极值胶囊已在 Chart 内钳回容器
  const panelGridTop = 14;
  // 容器高由 Y 模型派生：格数×TICK_PX×倍率 + 断裂条 + 图顶卡片区 + 底边距（跨度大 → 自动变高）
  const chartHeight = yCfg.plotHeight + gridTop + GRID.bottom;
  // 第八十三轮：关「显示 Y 刻度线」时刻度列塌缩，右侧内容左移对齐
  const gridLeft = estGridLeft(state.currency);

  // 分离显示共享 Y 轴：全面板 series 并集算一次（各面板受控传入同一 yScale，刻度逐像素一致）。
  // 第五十四轮追补②：补上步长滞回 prev——此前缺 prev，季粒度把促销低谷平均掉后
  // rawSpan 收窄 706→662、跨过 niceStep 的 150 档界，步长 200→100、格数 5→9，
  // 图高 +68%（用户：切到季度 Y 轴高度显著拉高）。带 prev 后季沿用 200（5 格 ∈ 滞回区间），
  // 图高与周完全一致。splitScaleRef 与主图 scaleRef 各自独立（两模式互不串档）
  const splitScaleRef = useRef<YScale | null>(null);
  const splitYCfg = useMemo(() => {
    if (!splitActive || panelViews.length === 0) {
      splitScaleRef.current = null;
      return null;
    }
    const next = computeYAxis({
      series: panelViews.flatMap((p) => p.vis),
      priceTypes: state.priceTypes,
      sliderScale,
      allowBreak: yCompress,
      perUsd: perUsdOf(state.currency),
      prev: splitScaleRef.current,
    });
    splitScaleRef.current = next;
    return next;
  }, [splitActive, panelViews, state.priceTypes, sliderScale, yCompress, state.currency]);
  const splitGridLeft = useMemo(
    () => (splitYCfg ? estGridLeft(state.currency) : gridLeft),
    [splitYCfg, state.currency, gridLeft],
  );
  // 共享轴列的档位带数据（第五十四轮追补⑤）：与面板同一份并集判定「档内有无数据」
  const splitTierValues = useMemo(
    () => collectTierValues(panelViews.flatMap((p) => p.vis), state.priceTypes),
    [panelViews, state.priceTypes],
  );
  // 面板头行高（追补⑤重排）：轴列用同一偏移对齐面板绘图区顶。
  // 第七十九轮：卡片顶部预留拖移把手行（PANEL_GRIP_H），滚动容器再垫 SCROLL_PAD_TOP
  // 容纳把手凸出上边线的上半——轴列偏移同步 = 三段之和。
  const PANEL_HEAD_H = 24;
  const PANEL_GRIP_H = 14;
  const SCROLL_PAD_TOP = 10;

  // 分离卡片横向轨道的滚动引用；溢出滑块由 SplitScrollBar 自行测量渲染。
  const splitScrollRef = useRef<HTMLDivElement | null>(null);

  // ---- 下钻（§6.3）：seriesKey → 取数组，单组重查 ----
  const selByKey = useMemo(() => {
    const m = new Map<string, ProductSelection>();
    for (const s of [...effOwn, ...effComps]) {
      m.set(`${s.modelId}__${s.romram.replace(/\s+/g, '')}`, s);
    }
    return m;
  }, [effOwn, effComps]);

  const onDrill = (seriesKey: string, bucketId: string): void => {
    const s = allSeries.find((x) => x.key === seriesKey);
    const sel = selByKey.get(seriesKey);
    if (!s || !sel || state.granularity === 'week') return;
    const group: SkuGroupQuery = { modelId: sel.modelId, romram: sel.romram, skuIds: s.skuIds, isOwn: s.isOwn };
    setDrill({
      group,
      label: s.label,
      originGran: state.granularity === 'quarter' ? 'quarter' : 'month',
      originBucket: bucketId,
    });
  };

  const buildRange = (group: SkuGroupQuery, gran: Granularity, startBucket: string, endBucket: string): Series[] => {
    try {
      return buildSeries({
        groups: [group],
        granularity: gran,
        startBucket,
        endBucket,
        currency: state.currency,
        agg: state.agg,
        platform: state.platform,
        scope: { countryCode: state.countryCode, industry: state.industry },
      });
    } catch {
      return [];
    }
  };

  // ---- 交互 handlers ----
  const setPriceType = (key: 'discounted' | 'rrp', val: boolean): void => {
    const next = { ...state.priceTypes, [key]: val };
    if (!next.discounted && !next.rrp) return; // 至少保留一种价格
    actions.set({ priceTypes: next });
  };

  /** Bottom brush is the time filter: any move becomes a custom analysis range. */
  const onWindowChange = (s: number, e: number): void => {
    if (!buckets[s] || !buckets[e]) return;
    setWindowIds([buckets[s].id, buckets[e].id]);
  };

  /** 左侧时间筛选器：用户明确指定极值后退出自动，并重置底部窗口。 */
  const onRangeFilterChange = (startId: string, endId: string): void => {
    const start = buckets.findIndex((b) => b.id === startId);
    const end = buckets.findIndex((b) => b.id === endId);
    if (start < 0 || end < 0) return;
    const lo = Math.min(start, end);
    const hi = Math.max(start, end);
    actions.set({ adaptive: false, rangeStart: buckets[lo].id, rangeEnd: buckets[hi].id });
    setWindowIds(null);
  };

  // ---- 渲染 ----
  return (
    <div>
      {/* 标题行（第十二轮引入）：产品与配置的选择统一在顶部筛选器级联（第九十轮，
          chips 撤除）；分离开关与视图开关留在图上——筛选器=数据口径，图上=视图焦点 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: space.md,
          marginBottom: space.sm,
        }}
      >
        <h2 style={{ margin: 0, fontSize: fontSize.displaySm, fontWeight: 600, color: color.ink }}>
          {compOnly ? (
            <>竞品价格走势<span style={{ fontSize: 14, fontWeight: 600, color: color.mute, marginLeft: 2 }}>（{compModelCount} 款）</span></>
          ) : (
            <>价格走势</>
          )}
        </h2>
        {/* 分离显示（第五十四轮拍板；第七十七轮「每行几个」并入此设置、默认开；
            第八十七轮面板单位放宽为任意产品·配置，竞品视角亦可分离） */}
        {configSources.length >= 2 && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Switch
              size="small"
              checked={splitOn}
              onChange={(v) => {
                splitManualRef.current = true;
                setSplitOn(v);
              }}
            />
            <span style={{ fontSize: 12.5, color: color.body, whiteSpace: 'nowrap' }}>分离显示</span>
            {splitActive && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 8 }}>
                <span style={{ fontSize: 11, color: color.mute, whiteSpace: 'nowrap' }}>每行</span>
                <Segmented
                  size="small"
                  value={splitColumns}
                  onChange={(v) => setSplitColumns(v as 2 | 3)}
                  options={[{ label: '2 个', value: 2 }, { label: '3 个', value: 3 }]}
                />
              </span>
            )}
          </span>
        )}
        <ConfigProvider theme={filterBarTheme}>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12, color: color.mute, fontSize: 12 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              平台 <span style={{ width: 160 }}><PlatformBox /></span>
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>币种 <CurrencyBox /></span>
            {/* 时点摘要唯一入口（第112轮）：纯手动开合，打开态 primary 高亮 */}
            <Button
              size="small"
              icon={<ProfileOutlined />}
              type={pointPanelOpen ? 'primary' : 'default'}
              onClick={() => setPointPanelOpen((v) => !v)}
              title="各产品最新折扣、现价、RRP 与来源"
            >
              时点摘要
            </Button>
          </div>
        </ConfigProvider>
        {/* 数据汇总：仅月/季粒度出现（§6.1），写回 state.agg */}
        {state.granularity !== 'week' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: space.sm, fontSize: fontSize.bodySm, color: color.body }}>
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

      {/* 降级状态引导带（第八十五轮）：竞品-only / 无对标 两种状态各给一句出口，
          不堵死场景但保持「我司主线」的默认叙事 */}
      {(compOnly || noComp) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: space.sm,
            padding: '6px 12px',
            border: `1px solid ${color.hairline}`,
            borderRadius: radius.control,
            background: color.canvasSoft,
            fontSize: 12,
            color: color.body,
          }}
        >
          {compOnly && (
            <span>未选择我司产品 · 当前为竞品对比视角；在上方筛选器选择我司产品后可进行对标分析</span>
          )}
          {noComp && (
            <>
              <span>未配置对标竞品 · 当前仅展示自身走势</span>
              <button
                type="button"
                onClick={props.onBackToOverview}
                style={{ border: 0, background: 'transparent', color: color.link, font: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}
              >
                去总览配置对标 →
              </button>
            </>
          )}
        </div>
      )}

      {/* 图主体 + 图右侧时点面板（第112轮）：flex 行 = [图列 flex1][时点面板 336px]。
          时点摘要仅由标题行「时点摘要」按钮手动展开，收起时面板不渲染、图占满整行。
          （Y 轴纯自适应；合并模式的系列页签仍在工具行居中承载）。
          分离显示：多 ROM 勾选时主图变为单行横向轨道——每面板一个
          ROM+其对标竞品，共享 Y 轴（并集算一次受控传入）、X 轴各面板独立绘制；
          共享刷选条联动全部面板；系列页签按面板拆开、放各卡片顶部居中（第七十五轮）。
          第五十四轮追补：工具行不再随面板重复——面板网格上方常驻一条（ChartToolbar），
          面板 chrome=false，全部视图开关由常驻行统一控制 */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
        <div style={{ flex: '1 1 0', minWidth: 0 }}>
          {splitActive ? (
        <>
          {/* 常驻工具行（第五十四轮追补，用户需求）：分离模式下这一行仍常驻在摘要页签
              与面板网格之间，统管底下全部分离面板——大促/offer/极值/变化提醒 + 齿轮
              （每格高度/刻度线/自动压缩/折线样式）+ 折后价/RRP；面板内不再各有设置行 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 32, padding: '0 6px', marginBottom: 2 }}>
              {/* 系列页签不进共享工具行（第七十五轮）：分离模式下按面板拆到各卡片
                  顶部居中，本行只保留视图开关；合并模式的页签仍在工具行中央 */}
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
                promoBandsOn={promoBandsOn}
                onPromoBandsOn={setPromoBandsOn}
                offersOn={offersOn}
                onOffersOn={setOffersOn}
                maxMinOn={maxMinOn}
                onMaxMinOn={setMaxMinOn}
                changeThreshold={changeThreshold}
                onChangeThreshold={setChangeThreshold}
                onOpenPromoDetail={openPromoDetail}
              />
            </div>
          </div>
          {/* 分离面板：所有卡片固定在同一横向轨道；共享 Y 轴固定在左侧，轨道超出视口时横向滚动。
              每行可见 2/3 个由标题行「分离显示」设置控制（第七十七轮并入），卡片保持
              最小宽度以避免图表与系列名拥挤。 */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: space.md,
              marginBottom: space.sm,
            }}
          >
            <div style={{ flex: `0 0 ${splitAxisWidth(state.currency)}px`, paddingTop: SCROLL_PAD_TOP + PANEL_GRIP_H + PANEL_HEAD_H }}>
              {splitYCfg && (
                <SplitAxisColumn
                  yScale={splitYCfg}
                  currency={state.currency}
                  gridLeft={splitGridLeft}
                  panelGridTop={panelGridTop}
                  showYTicks={showYTicks}
                  tierValues={splitTierValues}
                />
              )}
            </div>
            <div style={{ flex: '1 1 0', minWidth: 0 }}>
              <div
                ref={splitScrollRef}
                className="price-trend-split-scroll"
                role="region"
                aria-label="分离走势面板，可横向滚动"
                tabIndex={0}
                style={{
                  overflowX: 'auto',
                  overflowY: 'hidden',
                  scrollbarGutter: 'stable',
                  // 顶部垫高容纳拖移把手凸出上边线的上半；原生滚动条已隐藏，
                  // 溢出提示由下方常驻滑动块（SplitScrollBar）承担
                  padding: `${SCROLL_PAD_TOP}px 0 6px`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'stretch', gap: space.md, width: '100%', minWidth: 0 }}>
                  {orderedPanels.map((p) => {
                  const isDragging = draggingPanel === p.key;
                  const isDropTarget = dropTarget === p.key && !isDragging;
                  return (
                    <div
                      key={p.key}
                      onDragOver={(e) => {
                        if (!draggingPanel || draggingPanel === p.key) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        setDropTarget(p.key);
                      }}
                      onDragLeave={() => setDropTarget((t) => (t === p.key ? null : t))}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (draggingPanel) movePanelTo(draggingPanel, p.key);
                        setDraggingPanel(null);
                        setDropTarget(null);
                      }}
                      style={{
                        flex: `0 0 calc((100% - ${(splitColumns - 1) * Number(space.md)}px) / ${splitColumns})`,
                        // 宽度由「每行 2/3 个」控制，不设固定最小宽度；否则窄屏下
                        // 选择 2 个时仍只能看到一张完整卡片，失去切换该视图的意义。
                        minWidth: 0,
                        position: 'relative',
                        border: `1px solid ${isDropTarget ? color.link : color.hairline}`,
                        boxShadow: isDropTarget ? 'inset 0 0 0 2px rgba(0, 112, 243, 0.35)' : undefined,
                        borderRadius: radius.card,
                        padding: `${PANEL_GRIP_H}px 8px 0`, // 顶部预留把手行（第七十九轮）
                        background: color.canvas,
                        boxSizing: 'border-box',
                        opacity: isDragging ? 0.45 : undefined,
                      }}
                    >
                      {/* 拖移把手（第七十九轮）：骑在上边线居中处，拖到目标卡片上松手即换位 */}
                      <span
                        draggable
                        onDragStart={(e) => {
                          setDraggingPanel(p.key);
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('text/plain', p.key);
                        }}
                        onDragEnd={() => {
                          setDraggingPanel(null);
                          setDropTarget(null);
                        }}
                        role="button"
                        aria-label={`拖动调整 ${p.sel.romram} 面板位置`}
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
                          border: `1px solid ${draggingPanel === p.key ? color.link : color.hairline}`,
                          borderRadius: radius.pill,
                          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.06)',
                          cursor: 'grab',
                          color: color.mute,
                          lineHeight: '16px',
                        }}
                      >
                        <HolderOutlined style={{ fontSize: 10 }} />
                      </span>
                      {/* 面板头（第七十五轮定版）：型号留左上角；系列页签按面板拆开、
                          顶部居中只列该卡片对应的产品，两侧提示性小箭头可滚动查看；
                          不再写「我司 + 对标竞品」 */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          height: PANEL_HEAD_H, // 定高：轴列对齐基准（追补⑤）
                          padding: '0 4px',
                        }}
                      >
                        {/* 卡顶图例页签已撤（第八十二轮）：名称药丸接管显隐切换职能 */}
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: color.ink, whiteSpace: 'nowrap', flexShrink: 0 }}>
                          {/* 第八十七轮：跨产品/竞品视角时面板头带产品名（单我司产品维持纯 ROM） */}
                          {(multiProduct || !p.isOwn) ? `${modelNameOf(p.sel.modelId)} · ${p.sel.romram}` : p.sel.romram}
                        </span>
                        {p.isOwn && p.compTags.length > 0 && (
                          <span
                            title={`该配置的对标竞品：${p.compTags.map((t) => `${t.primary ? '★' : ''}${t.name}`).join('、')}`}
                            style={{ marginLeft: 'auto', minWidth: 0, fontSize: 10.5, lineHeight: '16px', color: color.mute, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                          >
                            对标 {p.compTags.length}:{p.compTags.map((t) => `${t.primary ? '★' : ''}${t.name}`).join(' · ')}
                          </span>
                        )}
                      </div>
                      <Chart
                        series={p.vis}
                        granularity={state.granularity}
                        currency={state.currency}
                        priceTypes={state.priceTypes}
                        gridLeft={NAME_ZONE_W} // 追补⑤②：与合并模式同宽的名称预留带在面板内侧（此前 0 导致名称与折线重叠）
                        gridTop={panelGridTop}
                        chrome={false} // 面板不渲染设置行（第五十四轮追补）：统管权在上方常驻行
                        axisChrome={false} // 面板不画轴（追补⑤）：档位带/刻度/断轴号在共享轴列
                        showYTicks={showYTicks}
                        enableDrill={state.granularity !== 'week'}
                        enableJump={state.granularity === 'week'}
                        enableOffer={state.granularity === 'week' && offersOn}
                        onDrill={makePanelDrill(p)}
                        windowKey={`${win.s}:${win.e}:${p.key}`}
                        yScale={splitYCfg ?? undefined}
                        namesInZone // 第七十四轮：系列名全部固定进面板左侧名称空白带
                        pairingsOf={(key) => pairingsBySeries.get(key) ?? []} // 第八十八轮：竞品⇄我司悬停联动
                        nameSeries={p.all} // 第八十二轮：药丸全集（含屏蔽系列，虚线置灰）
                        hiddenKeys={hiddenKeys}
                        onToggleHidden={toggleLegend} // 药丸点击 = 切换折线显隐（取代顶部页签）
                        lineShape={lineShape}
                        promoBandsOn={promoBandsOn}
                        promoBands={promoBands}
                        maxMinOn={maxMinOn}
                        changeThreshold={changeThreshold}
                        // 第110轮（评审）：每张小图自带时间轴日期标签（单卡可独立截图进 PPT）
                        showXLabels
                        crosshairIdx={splitHoverIdx}
                        onCrosshairMove={setSplitHoverIdx}
                        emptyHint="该配置在所选时间范围内无数据"
                      />
                    </div>
                  );
                  })}
                </div>
              </div>
              {/* 常驻横向滑动块（第七十九轮）：轨道溢出时出现，拖拽/点按均可移动查看 */}
              <SplitScrollBar trackRef={splitScrollRef} />
            </div>
          </div>
          {/* 共享刷选条：一个窗口联动全部面板 */}
          {buckets.length > 0 && visSeries.length > 0 && (
            <XBrush
              buckets={buckets}
              s={win.s}
              e={win.e}
              lo={filterBounds[0]}
              hi={filterBounds[1]}
              plotLeft={splitGridLeft}
              adaptive={state.adaptive}
              granularity={state.granularity}
              onChange={onWindowChange}
              onRangeChange={onRangeFilterChange}
              onGranularityChange={actions.setGranularity}
              onToggleAdaptive={() => actions.set({ adaptive: !state.adaptive })}
              onAdjusting={setAdjusting}
            />
          )}
        </>
      ) : (
        <>
          <Chart
            series={chartSeries}
            granularity={state.granularity}
            currency={state.currency}
            priceTypes={state.priceTypes}
            gridLeft={gridLeft}
            gridTop={gridTop}
            namesInZone // 第八十轮：合并模式与分离面板一致，系列名固定进 Y 轴右侧名称空白带
            pairingsOf={(key) => pairingsBySeries.get(key) ?? []} // 第八十八轮：竞品⇄我司悬停联动
            nameSeries={visSeries} // 第八十二轮：药丸全集（含屏蔽系列），取代顶部图例页签
            hiddenKeys={hiddenKeys}
            onToggleHidden={toggleLegend}
            showYTicks={showYTicks}
            onShowYTicks={setShowYTicks}
            enableDrill={state.granularity !== 'week'}
            enableJump={state.granularity === 'week'}
            enableOffer={state.granularity === 'week' && offersOn}
            onDrill={onDrill}
            windowKey={`${win.s}:${win.e}`}
            onOpenPromoDetail={openPromoDetail}
            yScale={yCfg}
            sliderScale={sliderScale}
            onSliderScale={setSliderScale}
            yCompress={yCompress}
            onYCompress={setYCompress}
            lineShape={lineShape}
            onLineShape={setLineShape}
            promoBandsOn={promoBandsOn}
            onPromoBandsOn={setPromoBandsOn}
            promoBands={promoBands}
            maxMinOn={maxMinOn}
            changeThreshold={changeThreshold}
            onPriceTypeToggle={setPriceType}
            offersOn={offersOn}
            onOffersOn={setOffersOn}
            onMaxMinOn={setMaxMinOn}
            onChangeThreshold={setChangeThreshold}
            emptyHint={
              visSeries.length > 0 && chartSeries.length === 0
                ? '所有产品已在图中屏蔽，点击名称药丸恢复显示'
                : undefined
            }
          />
        </>
      )}
      {/* X 刷选条只调整上方极值范围内的查看窗口。 */}
          {!splitActive && buckets.length > 0 && visSeries.length > 0 && (
            <XBrush
              buckets={buckets}
              s={win.s}
              e={win.e}
              lo={filterBounds[0]}
              hi={filterBounds[1]}
              plotLeft={gridLeft}
              adaptive={state.adaptive}
              granularity={state.granularity}
              onChange={onWindowChange}
              onRangeChange={onRangeFilterChange}
              onGranularityChange={actions.setGranularity}
              onToggleAdaptive={() => actions.set({ adaptive: !state.adaptive })}
              onAdjusting={setAdjusting}
            />
          )}
        </div>
        {/* 图右侧时点摘要面板（第112轮）：仅标题行按钮手动开合；收起时不渲染 */}
        <PointPanel
          open={pointPanelOpen}
          onCollapse={() => setPointPanelOpen(false)}
          items={summary}
          currency={state.currency}
          granularity={state.granularity}
          pointDate={pointDate}
          alertCounts={alertCounts}
          subscribedKeys={subscribedKeys}
          onToggleSubscribe={toggleAlertSub}
        />
      </div>

      {/* 促销力度明细抽屉（第五十六轮）：原图下横向热力带收进二级抽屉——纵向表格
          （行=时间最新在上，列=产品），入口在工具行「⋯ 更多」菜单；分离模式传
          面板并集（与屏上所见一致），单图模式传 visSeries；随窗口联动 */}
      <PromoDrawer
        open={promoDetailOpen}
        onClose={() => setPromoDetailOpen(false)}
        series={splitActive ? panelViews.flatMap((p) => p.all) : visSeries}
        currency={state.currency}
        granularity={state.granularity}
      />

      {/* 月/季下钻弹窗 */}
      <DrillModal
        info={drill}
        currency={state.currency}
        agg={state.agg}
        priceTypes={state.priceTypes}
        platform={state.platform}
        buildRange={buildRange}
        onClose={() => setDrill(null)}
      />
    </div>
  );
}
