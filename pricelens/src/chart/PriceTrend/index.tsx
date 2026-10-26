// ============================================================
// §4.1 图卡内容 + §6 价格走势全家桶编排：
// 第一行 = 左 [折后价|RRP 复选]；右 [汇总]（仅月/季，写回 state.agg）
// ——每格高度伸缩滑杆（第十轮）收进图内币种符号旁的齿轮弹层（Popover），不占版面；
//   倍率状态仍在本层（与刷选冻结共用 yCfg），经 yScale/sliderScale 受控传入 Chart
// 下方 = Chart（ECharts+覆盖层）> XBrush（重采样窗口）。
// 第五十六轮（领导页面清洁要求）：最高/最低价与价格变化提醒等次级开关收进
// 「⋯ 更多」二级菜单且默认关闭。再版（第112轮）：时点摘要（折扣率/
// 现价/划线RRP/来源横排）唯一入口 = 标题行「时点摘要」按钮（打开态高亮），
// 点击后图右侧原地展开 336px 内嵌面板（纵向一行一产品框，图表收窄不遮挡）；
// 不持久化，每次进页默认收起。主视觉 = 标题行+工具行+图。
// Y 轴口径（第七/九轮）：纯自适应分段压缩刻度，无手动覆盖；刷选拖动中冻结 Y 轴
// （onAdjusting），松手统一重算一次——调节过程只有横向重采样，体验稳定。
// 容器高由 Y 模型派生：格数×TICK_PX + 断裂条 + 图顶卡片区 + 底边距（跨度大 → 自动变高）。
// 数据流 = useFilters().state.mains（主分析卡）→ SeriesQuery → buildSeries → 窗口切片 → PriceTrend
// 第一百一十七轮：面板 = 主分析卡（≥2 卡自动分离），配额在选择时收口，图上不截断
// 时间自适应（默认开）按所选产品最早/最晚有效价格桶确定上方极值筛选器；
// 底部刷选轨道只在该筛选范围内提供查看窗口。
// 上方极值筛选器手动改值即转入自定义；底部拖柄/平移只调整筛选范围内的查看窗口。
// 取数仍按数据全集（数据量小、内存计算）：窗口边缘的续接线需要范围外的邻点。
// 分离模式时间轴体系（本轮，对齐量价看板）：每张分离面板底部各自一条独立时间轴
// （SplitTimeTrack：轨道+拖柄+平移+键盘微调）；第一百五十二轮追补：分离面板图内
// 同恢复时间轴（showXLabels，与合并主图同口径）；「同步」开关默认开
// （放在共享轴列下方、与时间轴行齐平垂直居中）= 全面板共用查看窗口、拖任一面板
// 时间轴全部联动，关 = 各面板独立调整（panelWins，未单独设置的面板回落共享窗口），
// 粒度切换/自适应重算/换卡后独立窗口整体回落。
// 第一百三十一轮波2：时间筛选器统一上移顶部筛选条（FilterBar showTime）——
// 分离模式底部共享 XBrush 退役（每面板时间轴已承担全部调整）；合并模式底部
// XBrush 保留（单图唯一的查看窗口调整轴）但左列时间筛选簇收掉、轨道通栏。
// 顶部筛选器改范围时查看窗口整体复位为新范围（下方 rangeWatch 联动自理）。
// 第一百五十二轮（业务意见）：合并主图与分离面板恢复图内时间轴（showXLabels，
// 周刻度 YYYYWxx 自带年份）；三条轨道刻度密度再降、中间刻度只画线——日期标注
// 只保留拖柄首尾与跨年刻度（XBrush/SplitTimeTrack/PanelTimeTrack 同口径）。
// 本轮（多平台比价深化 + 视图态跨页保留）：
// ① 比价弹窗补「比当前看板」差价率（弹窗内自理）；比价入口 = 工具行「多平台
//    比价」胶囊按钮（图例块级「⇄ 比价」入口已随第一百四十二轮追补三退役，
//    弹窗不再带产品预选）；
// ③ mergeView、windowIds 改 usePageViewState（sessionStorage 会话态）——切页
//    返回保留上次分析状态；windowIds 恢复后仍走原有换算（粒度切换）/失义
//    （范围改动 rangeWatch）路径，自适应首跑在范围未变时不再复位窗口。
// ============================================================
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button, Checkbox, ConfigProvider, Segmented, Tooltip } from 'antd';
import { HolderOutlined, ProfileOutlined } from '@ant-design/icons';
import { useFilters } from '../../state/FiltersContext';
import { filterBarTheme } from '../../components/FilterBar';
import { navBus } from '../../state/navBus';
import { modelNameOf } from '../../components/ProductCascader/tree';
import { useAlerts } from '../../components/AlertCenter';
import { groupAlertsBySeries, latestAlerts } from '../../dataModel/alerts';
import { buildSeries, defaultPlatformAnchorOf, tierOf, tierOrderOf } from '../../dataModel/aggregate';
import { flatSelections, MERGE_LINES_CAP, MAX_LINES_PER_CHART } from '../../state/mainSelection';
import usePageViewState from '../../state/usePageViewState';
import { dimPromo, dimProduct, dimRegion } from '../../data';
import type {
  AggMode,
  Granularity,
  Series,
  SeriesPoint,
  SeriesQuery,
  SkuGroupQuery,
} from '../../dataModel/types';
import type { ProductSelection } from '../../state/filtersTypes';
import { color, fontSize, radius, selectAccent, selectSoft, selectSoftInk, space } from '../../theme/tokens';
import Chart from './Chart';
import ChartToolbar from './ChartToolbar';
import XBrush from './XBrush';
import SplitTimeTrack, { normalizePanelWindow, SPLIT_TRACK_H } from './SplitTimeTrack';
import DrillModal, { type DrillInfo } from './DrillModal';
import {
  buildPriceSummary,
  buildPromoBands,
  collectTierValues,
  dedupeSpecText,
  type LineShapeChoice,
  type PromoBand,
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
import PlatformCompareModal from './PlatformCompareModal';
import PointPanel from './PointPanel';
import { groupsOfCards, seriesKeyOf, type DetailBucket, type LegendGroup, type TableGroup } from './tableModel';
import SplitScrollBar from './SplitScrollBar';
import BrandLegendStrip from './BrandLegendStrip';

/** 分离面板内图例带高度（定高：共享轴列按此对齐面板绘图区顶；第一百二十三轮④
 *  单行药丸带 44 → 30，第一百四十五轮药丸固定两行（品牌行 + 产品行）30 → 40） */
const PANEL_LEGEND_H = 40;

/** 面板头/无障碍文案：面板 = 主分析卡；卡未选主品（空对）时以对比产品组示之。
 *  空对组名分工：图表面板/图例保留「对比产品」（组名仍有内容），宽表组头用
 *  EMPTY_MAIN_LABEL 显性提示未选主品（见 TrendTables）。 */
const panelLabelOf = (card: { main: ProductSelection | null }): string =>
  card.main ? modelNameOf(card.main.modelId) : '对比产品';

export default function PriceTrend(props: {
  /** 第110轮（评审）立、第一百二十三轮按组：图下「价差与明细」取数口——按主分析卡
   *  （选择浮窗卡序）上报各组 = 卡 id + 主品系列 key + 本卡全部系列（主品在前，含被
   *  图例屏蔽者）× 图上可见时间段，每次变化上报一次；页面层据此在图卡下方渲染
   *  同源宽表（币种/平台/粒度/时间段随图联动） */
  onSeriesWindow?: (groups: TableGroup[], buckets: DetailBucket[]) => void;
} = {}) {
  const { state, actions } = useFilters();
  // 第一百一十七轮：每张卡 = 型号 + 配置 + 它自己的对比区，分离面板 = 直接展开卡。
  // 第一百二十三轮：「按档位」主体模式退役（档位批量动作并入选择产品浮窗），
  // 面板取数 = state.mains 原样。
  const effMains = state.mains;
  const mainsEmpty = effMains.length === 0;
  // 合并图（单卡）取数组：全部主品配置 + 全部对比区并集（按卡序去重）
  const { mainSels, compareSels } = useMemo(() => flatSelections(effMains), [effMains]);

  // ---- 图表内部状态 ----
  const [sliderScale, setSliderScale] = useState<number>(1); // 每格高度倍率（不改刻度值；松手才提交）
  const [yCompress, setYCompress] = useState<boolean>(false); // Y 轴自动压缩（第三十五轮起默认关 = 完全连续；迪总「不自动选择」）
  const [adjusting, setAdjusting] = useState(false); // 刷选拖动中（冻结 Y 轴自适应）
  // 查看窗口（null = 整个筛选范围）：会话态跨页保留（P1-5）——切页返回恢复；
  // 粒度切换换算 / 范围改动复位（rangeWatch）等失义路径不变
  const [windowIds, setWindowIds] = usePageViewState<[string, string] | null>('dashboard.windowIds', () => null);
  // 分离模式同步/独立查看时间：同步（默认）= 全面板共用共享窗口，拖任一面板的时间轴
  // 全部联动；独立 = 各面板单独调整（panelWins 按面板 key 记窗口，未单独调整过的
  // 面板回落共享窗口）。粒度切换/自适应重算/换卡后独立窗口整体回落共享窗口。
  // 会话态跨页保留（与量价页对齐：synced/panelWins 同保留）
  const [synced, setSynced] = usePageViewState<boolean>('dashboard.synced', () => true);
  const [panelWins, setPanelWins] = usePageViewState<Record<string, [number, number] | null>>('dashboard.panelWins', () => ({}));
  // 面板独立时间段的粒度戳（本轮体检补）：panelWins 存的是时间桶下标，只在写入
  // 时的粒度下有意义——用户切去别的页面换了粒度再回来，旧下标会被新粒度错读，
  // 面板静默显示错误时间段。写 panelWins 一律走 commitPanelWins（同步盖当前
  // 粒度戳）；戳对不上时整体回落共享时间段（下方校验）
  const [panelWinsGran, setPanelWinsGran] = usePageViewState<string>('dashboard.panelWinsGran', () => state.granularity);
  const commitPanelWins = (
    v: Record<string, [number, number] | null> | ((p: Record<string, [number, number] | null>) => Record<string, [number, number] | null>),
  ): void => {
    setPanelWins(v);
    setPanelWinsGran(state.granularity);
  };
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set()); // 图例取消选中的系列（折线隐藏）
  const [drill, setDrill] = useState<DrillInfo | null>(null);
  const [promoBandsOn, setPromoBandsOn] = useState(false); // 大促档期（第七十七轮起默认关）
  const [offersOn, setOffersOn] = useState(false); // offer 权益显隐：关 = 不画徽章、浮窗不出权益行（第七十七轮起默认关）
  // 最高/最低价 + 价格变化提醒（第五十六轮）：非主要功能——默认关，收进工具行
  // 「⋯ 更多」二级菜单（领导页面清洁要求）；启用时 ⋯ 按钮带蓝点提示
  const [maxMinOn, setMaxMinOn] = useState(false);
  // 价格变化提醒：null=关；阈值=小数（0.05=5%），滑杆 0~15% 连贯可调（0.5 步进）
  const [changeThreshold, setChangeThreshold] = useState<number | null>(null);
  // 多平台比价弹窗：入口 = 图例药丸悬停「店铺」小按钮（第一百五十轮起，每个
  // 产品直进自己的多平台比价、弹窗预选该产品；工具行胶囊按钮退役——原「多组
  // 产品里再选一款」的二次选择路径删除，142 追补三的块头「⇄ 比价」结论随
  // 入口本位迁移一并作废）
  const [platformCompareOpen, setPlatformCompareOpen] = useState(false);
  const [compareInit, setCompareInit] = useState<{ modelId: string; romram: string } | null>(null);

  /** 图例药丸比价入口：记录发起产品并打开弹窗 */
  const openCompareFor = (p: { modelId: string; romram: string }): void => {
    setCompareInit(p);
    setPlatformCompareOpen(true);
  };
  // 时点摘要面板（第112轮）：唯一入口 = 标题行「时点摘要」按钮，纯手动开合；
  // 不持久化（每次进页面默认收起）
  const [pointPanelOpen, setPointPanelOpen] = useState(false);
  // 齿轮弹层视图开关（第五十四轮追补上提到本层）：分离模式下由常驻工具行
  // 统一写，主图与全部分离面板同值（此前是各 Chart 实例内部状态，互相不同步）
  const [showYTicks, setShowYTicks] = useState(true); // Y 刻度线（第九十一轮恢复；默认开）
  // 折线形态（第五十四轮追补③）：auto=按粒度自适应（周=阶梯 / 月季=平滑），缺省
  const [lineShape, setLineShape] = useState<LineShapeChoice>('auto');
  // 价格显示（第一百一十四轮，评审）：精简 = 每系列仅最高/最低/最新三价直标（默认）；
  // 详细 = 现行全量标签口径。价格看板合并/分离两模式同值
  const [labelMode, setLabelMode] = useState<'detail' | 'compact'>('compact');
  // 第一百一十四轮：分离模式横向虚线（跨面板共享悬停纵向位置；与 splitHoverIdx 同机制）
  const [splitCrossY, setSplitCrossY] = useState<number | null>(null);
  // 第一百一十五轮：顶部图例带悬停的产品——合并图单键；分离模式记录面板 + 系列
  //（悬停只作用于本图：高亮该系列 + 对标映射，其余降透明，图内起点画指引虚线）
  const [legendHoverKey, setLegendHoverKey] = useState<string | null>(null);
  const [panelLegendHover, setPanelLegendHover] = useState<{ panel: string; key: string } | null>(null);

  // §5.6/§6.6：切换产品/价格类型/币种 → 滑杆倍率复位 ×1；图例显隐一并复位
  const yAxisResetKey = JSON.stringify([effMains, state.priceTypes, state.currency]);
  useEffect(() => {
    setSliderScale(1);
    setHiddenKeys(new Set());
  }, [yAxisResetKey]);

  // §6.5 联动：粒度切换 → 窗口端点对齐新粒度桶边界（保持同一时间跨度）；
  // 面板独立窗口按桶号失义，一并回落共享窗口
  const granRef = useRef(state.granularity);
  useLayoutEffect(() => {
    if (granRef.current === state.granularity) return;
    const prev = granRef.current;
    granRef.current = state.granularity;
    setWindowIds((ids) => (ids ? convertWindowIds(ids, prev, state.granularity) : null));
    commitPanelWins({}); // 独立时间段按桶号失义，回落共享时间段并盖新粒度戳
  }, [state.granularity]);
  // 面板独立时间段跨粒度自愈（本轮体检）：粒度戳与当前粒度对不上（用户在别的
  // 页面换了粒度再回来，或页内换粒度后戳未跟上）→ 旧下标按新粒度解释会让面板
  // 静默显示错误时间段——整体回落共享时间段并把戳对齐当前粒度。用布局 effect：
  // 回落在首帧绘制前完成，不露错位的一闪
  useLayoutEffect(() => {
    if (panelWinsGran === state.granularity) return;
    setPanelWins({});
    setPanelWinsGran(state.granularity);
  }, [panelWinsGran, state.granularity, setPanelWins, setPanelWinsGran]);

  // ---- 取数：useFilters().state → SeriesQuery → buildSeries（§7.3 唯一口径） ----
  // 按数据全集取数（内存小数据集，成本可忽略）：跨度/自适应范围、窗口边缘续接
  // 都要看范围外的邻点；当前选区决定图上可见的数据段。
  const [dataStart, dataEnd] = useMemo(() => dataBucketRange(state.granularity), [state.granularity]);

  const query: SeriesQuery = useMemo(
    () => ({
      // isOwn 由数据层按型号事实判定（华为产品恒真）；主分析/对比是角色，
      // 图上不因角色改样式（第一百一十七轮）
      groups: [...mainSels, ...compareSels].map((g) => ({ ...g, isOwn: false })),
      granularity: state.granularity,
      startBucket: dataStart,
      endBucket: dataEnd,
      currency: state.currency,
      agg: state.agg,
      platform: state.platform,
      scope: { countryCode: state.countryCode, industry: state.industry },
    }),
    [mainSels, compareSels, state.granularity, dataStart, dataEnd, state.currency, state.agg, state.platform, state.countryCode, state.industry],
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
  // 桶 id 序（面板时间轴的全域刻度输入，与 buckets 同序）
  const bucketIds = useMemo(() => buckets.map((b) => b.id), [buckets]);

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
    mainSels.map(({ modelId, romram }) => `${modelId}|${romram}`).sort(),
    compareSels.map(({ modelId, romram }) => `${modelId}|${romram}`).sort(),
  ]);
  const adaptiveKey = adaptiveBounds
    ? `${state.granularity}|${adaptiveBounds[0]}|${adaptiveBounds[1]}|${selectedProductKey}`
    : '';
  const adaptiveAppliedRef = useRef('');
  // 本轮（视图态跨页保留）：挂载首跑若范围已与自动极值一致（会话态恢复场景，
  // rangeStart/End 已持久化）则不复位窗口——切页返回时持久化恢复的 windowIds
  // 不被自适应重套清掉；范围确有变化（如从总览换国进入）仍按原样复位
  const adaptiveMountedRef = useRef(false);
  useLayoutEffect(() => {
    if (!adaptiveBounds) {
      adaptiveAppliedRef.current = '';
      return;
    }
    if (adaptiveAppliedRef.current === adaptiveKey) return;
    // 挂载首跑守卫（跨页往返）：顶部时间范围是全局筛选器，量价页可能已按其三槽
    // 写入自适应范围——只要现范围仍覆盖本页任一数据桶就沿用、不覆写（切页不再
    // 静默改用户的筛选器）；范围与本页数据完全脱节（换国进入/首次为空）才重套
    if (!adaptiveMountedRef.current) {
      const dataLo = span ? buckets[span[0]]?.id ?? null : null;
      const dataHi = span ? buckets[span[1]]?.id ?? null : null;
      if (
        dataLo && dataHi && state.rangeStart && state.rangeEnd &&
        !(state.rangeEnd < dataLo || state.rangeStart > dataHi)
      ) {
        adaptiveAppliedRef.current = adaptiveKey;
        adaptiveMountedRef.current = true;
        return;
      }
    }
    adaptiveAppliedRef.current = adaptiveKey;
    const rangeUnchanged = state.rangeStart === adaptiveBounds[0] && state.rangeEnd === adaptiveBounds[1];
    actions.set({ rangeStart: adaptiveBounds[0], rangeEnd: adaptiveBounds[1] });
    // 本次范围变化出自自适应首跑：同步 rangeWatch 基线，否则紧随其后的 rangeWatch
    // 会把「范围被图外改动」复位吞掉挂载焦点周刚设的查看窗口
    rangeWatchRef.current = { gran: state.granularity, key: `${adaptiveBounds[0]}|${adaptiveBounds[1]}` };
    if (adaptiveMountedRef.current || !rangeUnchanged) {
      setWindowIds(null); // 窗口复位 = 整个自动极值范围
      commitPanelWins({}); // 自适应重算 → 面板独立窗口一并回落共享窗口
    }
    adaptiveMountedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adaptiveKey]);

  // 面板集合变化（选择浮窗增删卡）→ 独立窗口失义，整体回落共享窗口
  const panelKeysKey = JSON.stringify(effMains.map((c) => c.id));
  useEffect(() => {
    commitPanelWins({});
  }, [panelKeysKey]);

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

  // 第一百三十一轮波2：时间筛选器上移顶部筛选条后，改范围不再经过本组件——
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

  // 图例可见系列：声明下移至 cappedVisSeries 之后（见 splitActive 段）

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

  // ---- 分离显示（第一百一十七轮定版）：分离与否由主分析卡数决定——
  // ≥2 张卡默认分离（每面板 = 一张卡：型号全部配置线 + 它自己的对比线），
  // 单卡合并成图；手动开关与「折线超限强制分离」退役（配额已在选择时收口，
  // 图上永远装得下）。面板顺序 = 卡序（选择浮窗内拖拽），页内把手拖拽仍可覆盖。
  // 第一百二十三轮⑥（宽容合并）：≥2 组默认分图但可切回一张图（单产品多型号等
  // 用户认为该合并的场景）；合并可用 = 全部组系列去重总数 ≤ MERGE_LINES_CAP，
  // 超限「合并」项置灰，选区变化致超限时自动回落分图。mergeView 会话态跨页保留
  //（P1-5，见下方 usePageViewState 声明）。
  const multiCards = effMains.length >= 2;
  // 合并/分图选择：会话态跨页保留（P1-5）——切页返回保持上次选择；超限回落逻辑不变
  const [mergeView, setMergeView] = usePageViewState<boolean>('dashboard.mergeView', () => false);
  const mergeLines = mainSels.length + compareSels.length; // 全部组系列去重总数
  const mergeOk = mergeLines <= MERGE_LINES_CAP;
  useEffect(() => {
    if (mergeView && !mergeOk) setMergeView(false); // 超限回落分图；回到限内不自动回跳，由用户重选
  }, [mergeView, mergeOk]);
  const splitActive = multiCards && !mergeView;
  // 分离模式一行可见面板数：卡片始终横向排列，超出视口后由轨道滚动查看。
  // 默认 2 个兼顾图表可读性；3 个适合宽屏快速扫读。
  const [splitColumns, setSplitColumns] = useState<2 | 3>(2);
  // 图例可见系列（图例药丸取消选中的不画线；Y 轴自适应随之收缩；药丸/促销表仍显示全部）
  const chartSeries: Series[] = useMemo(
    () => visSeries.filter((s) => !hiddenKeys.has(s.key)),
    [visSeries, hiddenKeys],
  );
  // 第110轮（评审）：分离模式跨图参考线——任一面板悬停的时间列下标共享给全部面板，
  // 其余面板在同一时间列画 1px 虚线；任意面板移出即清空。
  // 独立查看时间下面板窗口不同、下标失义：只亮悬停面板自己（panelHoverIdxs 按面板记）
  const [splitHoverIdx, setSplitHoverIdx] = useState<number | null>(null);
  const [panelHoverIdxs, setPanelHoverIdxs] = useState<Record<string, number | null>>({});
  // 跨产品/竞品视角下价位跨度天然拉大 → 多组进入时（分图或合并，第一百二十三轮⑥
  // 起不再只看分图态）自动开「Y 轴自动压缩」；用户手动关闭后本段会话内不再强制
  //（回到单组再进才重置）
  const yCompressAutoRef = useRef(false);
  useEffect(() => {
    if (multiCards && !yCompressAutoRef.current) {
      yCompressAutoRef.current = true;
      setYCompress(true);
    }
    if (!multiCards) yCompressAutoRef.current = false;
  }, [multiCards]);
  // 面板顺序（第七十九轮：卡片上边线拖移把手拖拽换位，取代已移除的箭头调序）
  const [panelOrder, setPanelOrder] = useState<string[]>([]); // 面板 key 序；空 = own 序
  const [draggingPanel, setDraggingPanel] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const panelData = useMemo(() => {
    if (!splitActive) return [];
    // 第一百一十七轮：面板 = 主分析卡直接展开（配置线 + 本卡对比线）——
    // 矩阵映射在选择时已算进卡的对比区，渲染层不再做映射/回退/截断。
    return effMains.map((card) => {
      let series: Series[] = [];
      try {
        series = buildSeries({
          groups: [...(card.main ? [card.main] : []), ...card.compares].map((g) => ({ ...g, isOwn: false })),
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
      return { key: card.id, card, series };
    });
  }, [splitActive, effMains, state.granularity, dataStart, dataEnd, state.currency, state.agg, state.platform, state.countryCode, state.industry]);

  // 各面板生效窗口：同步 = 全面板共用共享窗口；独立 = 面板自己的窗口
  //（未单独调整过回落共享窗口，越界钳回可调全域并保住最小窗口跨度）
  const effWins = useMemo(() => {
    const m: Record<string, [number, number]> = {};
    for (const p of panelData) {
      m[p.key] = normalizePanelWindow(panelWins[p.key] ?? null, win.s, win.e, filterBounds[0], filterBounds[1]);
    }
    return m;
  }, [panelData, panelWins, win.s, win.e, filterBounds]);

  // 「同步」开关：开→关 = 各面板以当前共享窗口为起点（此后可各自调整）；
  // 关→开 = 全部回落共享窗口。联动行为切换后跨面板参考线的时间列下标失义，一并清空
  const toggleSynced = (): void => {
    if (synced) {
      commitPanelWins((prev) => {
        const next = { ...prev };
        for (const p of panelData) next[p.key] = [win.s, win.e];
        return next;
      });
    } else {
      commitPanelWins({});
    }
    setSynced(!synced);
    setSplitHoverIdx(null);
    setPanelHoverIdxs({});
  };

  // 面板窗口切片（与单图 visSeries 同逻辑：窗口切片 + 边缘续接标记）；独立模式下
  // 各面板按各自生效窗口切
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
    () =>
      panelData.map((p) => {
        const [ps, pe] = effWins[p.key] ?? [win.s, win.e];
        const all = sliceVis(p.series, ps, pe); // 全量（含被图例页签屏蔽的系列，页签要能恢复显示）
        return { ...p, all, vis: all.filter((x) => !hiddenKeys.has(x.key)) };
      }),
    [panelData, effWins, hiddenKeys, win.s, win.e],
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
    const groups = [...(panel.card.main ? [panel.card.main] : []), ...panel.card.compares];
    return (seriesKey: string, bucketId: string) => {
      if (state.granularity === 'week') return;
      const s = panel.series.find((x) => x.key === seriesKey);
      const grp = groups.find((g) => `${g.modelId}__${g.romram.replace(/\s+/g, '')}` === seriesKey);
      if (!s || !grp) return;
      setDrill({
        group: { modelId: grp.modelId, romram: grp.romram, skuIds: s.skuIds, isOwn: s.isOwn },
        label: s.label,
        originGran: state.granularity === 'quarter' ? 'quarter' : 'month',
        originBucket: bucketId,
      });
    };
  };

  // ---- 价格摘要条（第三十六轮定版）：固定显示窗口内最新时点（不随悬停变换，
  //      时点明细看悬停浮窗）；竞品与我司同款样式、来源为取证超链接 ----
  // 第110轮（评审）：时点摘要产品清单按价位档从高到低、同档按现价从高到低排列
  //（第一百二十五轮起档位 = skuIds[0] 的国别档位 tierOf（分国优先、全局兜底），
  //  产业档位梯 tierOrderOf 定序；只读维表）；
  // 渲染期对名称做单位/叠词去重（如「16+1 TB TB」类重复文案收敛）
  const summary = useMemo(() => {
    const items = buildPriceSummary(chartSeries);
    const ladder = tierOrderOf(state.industry);
    const tierRank = new Map<string, number>();
    for (const s of chartSeries) {
      const sku = s.skuIds[0] != null ? dimProduct.find((p) => p.sku_id === s.skuIds[0]) : null;
      const i = sku ? ladder.indexOf(tierOf(sku, state.countryCode)) : -1;
      tierRank.set(s.key, i < 0 ? -1 : i);
    }
    return items
      .map((it) => ({ ...it, name: dedupeSpecText(it.name) }))
      .sort((a, b) => {
        const r = (tierRank.get(b.key) ?? -1) - (tierRank.get(a.key) ?? -1);
        if (r !== 0) return r;
        return (b.price ?? Number.NEGATIVE_INFINITY) - (a.price ?? Number.NEGATIVE_INFINITY);
      });
  }, [chartSeries, state.industry, state.countryCode]);

  // 时点摘要按卡分组（第一百四十二轮）：≥2 张产品卡时每组一个小框（PointPanel），
  // 组序 = 选择浮窗卡序；组内沿用上面的档位/现价排序
  const summaryGroups = useMemo(() => {
    if (effMains.length < 2) return null;
    const keyToCard = new Map<string, number>();
    effMains.forEach((card, i) => {
      for (const sel of [card.main, ...card.compares]) {
        if (!sel) continue;
        keyToCard.set(seriesKeyOf(sel), i);
      }
    });
    const byCard = new Map<number, typeof summary>();
    for (const it of summary) {
      const card = keyToCard.get(it.key);
      if (card == null) continue;
      const arr = byCard.get(card);
      if (arr) arr.push(it);
      else byCard.set(card, [it]);
    }
    return [...byCard.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([card, items]) => ({
        ordinal: card + 1,
        mainKey: effMains[card]?.main ? seriesKeyOf(effMains[card].main!) : null,
        items,
      }));
  }, [summary, effMains]);

  // ---- 大促背景带（第三十四轮）：dim_promo ∩ 窗口桶覆盖区间；随窗口联动 ----
  const winBuckets = useMemo(() => buckets.slice(win.s, win.e + 1), [buckets, win]);

  // ---- 图下「价差与明细」同源取数（第110轮立，第一百二十三轮按组）：按主分析卡
  // 上报各组，组序 = 卡序（选择浮窗排列；页内面板拖拽只换图位，不改表序）。
  // 分图/合并（含单组）同口径：合并多组 = 并集系列按卡归组（不再只取第一组），
  // 分图 = 各面板全部系列（含被图例屏蔽者——宽表有自己的组筛选，屏蔽只管折线）。
  // 同款对比产品被多卡对标时在各组各自出现（组内语义完整）。
  // 行集 = 组 × 可见时间段，经 onSeriesWindow 上报页面层渲染（与图共享粒度/币种/平台/时间段）
  const tableGroups: LegendGroup[] = useMemo(
    // 宽表列头 = 共享窗口桶；独立窗口模式下各组系列也按共享窗口切片对齐——
    // 原按各面板独立窗口切片，points[i] 与列头 buckets[i] 错位（数据错列）
    () => groupsOfCards(effMains, splitActive ? panelData.flatMap((p) => sliceVis(p.series, win.s, win.e)) : visSeries),
    [effMains, splitActive, panelData, win.s, win.e, visSeries],
  );
  const tableBuckets = useMemo<DetailBucket[]>(
    () =>
      winBuckets.map((b) => ({
        id: b.id,
        xLabel: b.xLabel,
        anchorDate: bucketAnchorDate(state.granularity, b.id) ?? '',
      })),
    [winBuckets, state.granularity],
  );
  const onSeriesWindowRef = useRef(props.onSeriesWindow);
  onSeriesWindowRef.current = props.onSeriesWindow;
  useEffect(() => {
    onSeriesWindowRef.current?.(tableGroups, tableBuckets);
  }, [tableGroups, tableBuckets]);

  // 图例悬停键失效自愈（本轮体检）：悬停药丸期间该系列被筛选/增删产品移出集合时，
  // BrandLegendStrip 内部会自清并回调 onHover(null)——但整条图例带卸载（分离↔合并
  // 切换、面板随卡删除）时回调无从发出，这里残留的悬停键会让图继续错误降透明。
  // 按当前图上键集兜底校验：合并 = 合并图例的组键集；分离 = 对应面板的系列键集
  useEffect(() => {
    if (legendHoverKey != null && !tableGroups.some((g) => g.series.some((s) => s.key === legendHoverKey))) {
      setLegendHoverKey(null);
    }
  }, [legendHoverKey, tableGroups]);
  useEffect(() => {
    if (panelLegendHover == null) return;
    const p = panelViews.find((x) => x.key === panelLegendHover.panel);
    if (!p || !p.all.some((s) => s.key === panelLegendHover.key)) setPanelLegendHover(null);
  }, [panelLegendHover, panelViews]);

  // 时点页签日期（第五十四轮追补①）：窗口末桶内最新日历周的周三锚日（MM-DD）——
  // 月/季粒度不再显示 2026-10 / 2026Q4（用户：时点恒为最新那一周对应的那一天；
  // 窗口平移到过去时跟随窗口，与摘要条数值口径一致）
  const pointDate = useMemo(() => {
    const last = winBuckets[winBuckets.length - 1];
    return last ? bucketLatestWeekLabel(state.granularity, last.id) : null;
  }, [winBuckets, state.granularity]);

  const winSpans = useMemo(() => bucketSpans(state.granularity, winBuckets), [state.granularity, winBuckets]);
  // 大促档期按国家取日历；标注了适用平台的档期（如亚马逊 Prime Day）只在所选平台、
  // 或未选时的默认店铺归属平台（未配置回国家默认平台）显示
  const scopedPromos = useMemo(() => {
    const defaultPlatform = defaultPlatformAnchorOf(state.countryCode);
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
  // 各分离面板的大促带随面板生效窗口自算：startIdx/endIdx 是相对窗口的局部下标，
  // 独立窗口下直接喂共享窗口的带会整体错位/画出绘图区（同步模式两窗口一致，结果同价）
  const panelPromoBands = useMemo(() => {
    const m: Record<string, PromoBand[]> = {};
    if (!promoBandsOn) return m;
    for (const p of panelViews) {
      const [ps, pe] = effWins[p.key] ?? [win.s, win.e];
      m[p.key] = buildPromoBands({
        promos: scopedPromos,
        spans: bucketSpans(state.granularity, buckets.slice(ps, pe + 1)),
      });
    }
    return m;
  }, [promoBandsOn, panelViews, effWins, win.s, win.e, scopedPromos, state.granularity, buckets]);

  // Y 轴 = 自适应分段刻度；刷选拖动中冻结（沿用上次 scale，只做横向重采样），
  // 松手统一重算一次 —— 调节过程不再实时改变纵轴（第九轮反馈）。
  // scaleRef 同时是步长滞回的 prev（第十一轮）：存的是"上一次未冻结"的模型，
  // 只要旧步长仍给得出 5~13 格就沿用，窗口平移/价格小漂移不再触发刻度换档+图高突跳
  const scaleRef = useRef<YScale | null>(null);
  const yCfg = useMemo(() => {
    if (adjusting && scaleRef.current) return scaleRef.current;
    return computeYAxis({
      series: chartSeries,
      priceTypes: state.priceTypes,
      sliderScale,
      allowBreak: yCompress,
      perUsd: perUsdOf(state.currency), // 档位锚定 USD（第二十三轮）：换币种格数/图高与 USD 相近
      prev: scaleRef.current,
    });
  }, [chartSeries, state.priceTypes, sliderScale, adjusting, yCompress, state.currency]);
  // 滞回基线在渲染提交后写入（渲染期写 ref 会被丢弃的并发渲染污染）
  useEffect(() => {
    if (!(adjusting && scaleRef.current)) scaleRef.current = yCfg;
  }, [yCfg, adjusting]);
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
    if (!splitActive || panelViews.length === 0) return null;
    // 第一百二十五轮：刷选拖动中冻结共享 Y 轴（与上面合并图 yCfg 同款）——
    // 调节过程只做横向重采样，松手统一重算一次
    if (adjusting && splitScaleRef.current) return splitScaleRef.current;
    return computeYAxis({
      series: panelViews.flatMap((p) => p.vis),
      priceTypes: state.priceTypes,
      sliderScale,
      allowBreak: yCompress,
      perUsd: perUsdOf(state.currency),
      prev: splitScaleRef.current,
    });
  }, [splitActive, panelViews, state.priceTypes, sliderScale, adjusting, yCompress, state.currency]);
  // 滞回基线提交后写入；分离模式退出时清档（与主图 scaleRef 各自独立，两模式互不串档）
  useEffect(() => {
    if (!splitActive || panelViews.length === 0) {
      splitScaleRef.current = null;
      return;
    }
    if (!(adjusting && splitScaleRef.current)) splitScaleRef.current = splitYCfg;
  }, [splitActive, panelViews.length, splitYCfg, adjusting]);
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
  // 容纳把手凸出上边线的上半——轴列偏移同步 = 各段之和。
  // PANEL_HEAD_H 已随面板头删除退役（第一百四十六轮，与药丸信息重复）
  const PANEL_GRIP_H = 14;
  const SCROLL_PAD_TOP = 10;

  // 分离卡片横向轨道的滚动引用；溢出滑块由 SplitScrollBar 自行测量渲染。
  const splitScrollRef = useRef<HTMLDivElement | null>(null);

  // ---- 下钻（§6.3）：seriesKey → 取数组，单组重查 ----
  const selByKey = useMemo(() => {
    const m = new Map<string, ProductSelection>();
    for (const s of [...mainSels, ...compareSels]) {
      m.set(`${s.modelId}__${s.romram.replace(/\s+/g, '')}`, s);
    }
    return m;
  }, [mainSels, compareSels]);

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

  /** 独立模式下面板时间轴只动自己的生效窗口（共享窗口未变）。 */
  const onPanelWindowChange = (key: string) => (s: number, e: number): void => {
    if (!buckets[s] || !buckets[e]) return;
    commitPanelWins((prev) => ({ ...prev, [key]: [s, e] }));
  };

  // 跨面板悬停参考线：同步 = 任一面板悬停的时间列广播到全部面板（同一查看窗口，
  // 下标同义）；独立 = 各面板窗口不同，只亮本面板
  const onPanelHoverOf = (key: string) => (v: number | null): void => {
    if (synced) setSplitHoverIdx((cur) => (cur === v ? cur : v));
    else setPanelHoverIdxs((prev) => (prev[key] === v ? prev : { ...prev, [key]: v }));
  };

  /** 「时间轴同步」开关（第148轮改名两行「时间轴/同步」；与各面板时间轴同一
      水平线）：开 = 各面板查看同一段时间，拖任一面板的时间轴全部联动；
      关 = 各面板时间范围独立调整（用于对齐不同上市节奏产品的可比区间） */
  const syncToggle = (
    <button
      type="button"
      aria-label="时间轴同步"
      aria-pressed={synced}
      title={synced ? '同步：各面板共用一段查看时间' : '独立：各面板分别调整'}
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
          价格走势
          {multiCards && (
            <span style={{ fontSize: 14, fontWeight: 600, color: color.mute, marginLeft: 2 }}>
              （{effMains.length} 组）
            </span>
          )}
        </h2>
        {/* 第一百二十三轮⑥（宽容合并）：≥2 组时可选「分图 / 合并」——默认分图
            （第一百一十七轮口径），合并适合单产品多型号等用户认为该同图的场景；
            「每行 2/3 个」只在分图态出现 */}
        {multiCards && (
          <Segmented
            size="small"
            value={splitActive ? 'split' : 'merge'}
            onChange={(v) => setMergeView(v === 'merge')}
            options={[
              { label: '分图', value: 'split' },
              mergeOk
                ? { label: '合并', value: 'merge' }
                : {
                    label: (
                      <Tooltip title={`合并后共 ${mergeLines} 条，超过合并上限 ${MERGE_LINES_CAP} 条（每组最多 ${MAX_LINES_PER_CHART} 条）`}>
                        <span>合并</span>
                      </Tooltip>
                    ),
                    value: 'merge',
                    disabled: true,
                  },
            ]}
          />
        )}
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
        <ConfigProvider theme={filterBarTheme}>
          {/* 第一百一十五轮（评审）：平台/币种收进顶部筛选条，标题行不再重复 */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12, color: color.mute, fontSize: 12 }}>
            {/* 价格显示（第一百一十四轮，评审）：与币种切换同款控件位——精简 = 图上仅
                最高/最低/最新三价（默认），详细 = 全量价格标签 */}
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
            <span>汇总</span>
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

      {/* 空态引导带（第一百一十七轮）：未选主分析产品时给一句出口；
          「无对比」「超线截断」等旧引导退役（无对比是合法状态；配额已前移到选择时） */}
      {mainsEmpty && (
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
          <span>点击上方「选择产品」开始分析</span>
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
            <div style={{ flex: `0 0 ${splitAxisWidth(state.currency)}px`, paddingTop: SCROLL_PAD_TOP + PANEL_GRIP_H + PANEL_LEGEND_H, display: 'flex', flexDirection: 'column' }}>
              {splitYCfg && (
                <SplitAxisColumn
                  yScale={splitYCfg}
                  currency={state.currency}
                  industry={state.industry}
                  gridLeft={splitGridLeft}
                  panelGridTop={panelGridTop}
                  showYTicks={showYTicks}
                  tierValues={splitTierValues}
                />
              )}
              {/* 「时间轴同步」开关（与各面板时间轴同一水平线）：轴列体与面板绘图区同高，
                  其下正是各面板的时间轴行——按钮与时间轴拖柄（轨道带，高 20）中心对齐，
                  不含下方日期字（第一百四十九轮澄清口径）。top -2 = 轨道带居中（-5）再补偿
                  SplitAxisColumn 与面板轨道行的实测 3px 恒差（面板卡 1px 边框 + chartH 取整） */}
              {splitYCfg && (
                <div style={{ height: SPLIT_TRACK_H, position: 'relative', flexShrink: 0 }}>
                  <div style={{ position: 'absolute', left: 0, right: 0, top: -2, display: 'flex', justifyContent: 'center' }}>
                    {syncToggle}
                  </div>
                </div>
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
                  // 本面板生效窗口（同步 = 共享窗口；独立 = 面板自己的窗口）
                  const pw = effWins[p.key] ?? ([win.s, win.e] as [number, number]);
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
                        aria-label={`拖动调整 ${panelLabelOf(p.card)} 面板位置`}
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
                      {/* 组/角色图例带（第一百一十五轮立，第一百二十三轮④按组）：本面板
                          单组（主品药丸 + vs + 对比药丸，含屏蔽者）；悬停药丸 = 该系列
                          高亮 + 起点指引线，点击 = 屏蔽/恢复折线。第一百四十六轮面板头
                          「型号 对比 N」行删除（Eason：与药丸信息重复）——面板内产品
                          标识完全由两行药丸承载 */}
                      <div style={{ height: PANEL_LEGEND_H, padding: '0 4px 2px', display: 'flex', alignItems: 'center', minWidth: 0 }}>
                        <BrandLegendStrip
                          groups={groupsOfCards([p.card], p.all)}
                          hiddenKeys={hiddenKeys}
                          onToggleHidden={toggleLegend}
                          onHover={(key) => setPanelLegendHover(key == null ? null : { panel: p.key, key })}
                          onCompareProduct={openCompareFor}
                        />
                      </div>
                      <Chart
                        series={p.vis}
                        granularity={state.granularity}
                        currency={state.currency}
                        priceTypes={state.priceTypes}
                        gridLeft={NAME_ZONE_W // 第一百一十五轮：名称药丸上移图顶后左缘只留呼吸带（原 188px 名称带回收）
                        }
                        gridTop={panelGridTop}
                        chrome={false} // 面板不渲染设置行（第五十四轮追补）：统管权在上方常驻行
                        axisChrome={false} // 面板不画轴（追补⑤）：档位带/刻度/断轴号在共享轴列
                        showYTicks={showYTicks}
                        enableDrill={state.granularity !== 'week'}
                        enableOffer={state.granularity === 'week' && offersOn}
                        onDrill={makePanelDrill(p)}
                        windowKey={`${pw[0]}:${pw[1]}:${p.key}`}
                        yScale={splitYCfg ?? undefined}
                        hideNamePills // 第一百一十五轮：产品名在面板顶部图例带，图内不再画药丸
                        legendHoverKey={panelLegendHover?.panel === p.key ? panelLegendHover.key : null}
                        lineShape={lineShape}
                        labelMode={labelMode} // 第一百一十四轮：价格显示 详细/精简
                        promoBandsOn={promoBandsOn}
                        promoBands={panelPromoBands[p.key] ?? []}
                        maxMinOn={maxMinOn}
                        changeThreshold={changeThreshold}
                        showXLabels // 第一百五十二轮追补：分离面板同恢复图内时间轴（与合并主图
                        // 同口径——周 YYYYWxx、axisTickPlan 抽稀；下方 SplitTimeTrack 保留
                        // 拖柄调整与首尾/跨年标注）
                        crosshairIdx={synced ? splitHoverIdx : panelHoverIdxs[p.key] ?? null}
                        onCrosshairMove={onPanelHoverOf(p.key)}
                        crosshairY={splitCrossY} // 第一百一十四轮：横向虚线跨全部面板
                        onCrosshairYMove={setSplitCrossY}
                        emptyHint="该配置在所选时间范围内无数据"
                      />
                      {/* 本图时间轴：每张分离面板底部各自一条（同步 = 拖任一条全面板
                          联动；独立 = 只调本图）。左右缘对齐绘图区 = 卡片内边距 + 图内
                          名称带 / 右留白；拖动中冻结共享 Y 轴（onAdjusting） */}
                      <div style={{ margin: `0 ${8 + GRID.right}px 6px ${8 + NAME_ZONE_W}px` }}>
                        <SplitTimeTrack
                          ids={bucketIds}
                          lo={filterBounds[0]}
                          hi={filterBounds[1]}
                          s={synced ? win.s : pw[0]}
                          e={synced ? win.e : pw[1]}
                          granularity={state.granularity}
                          onChange={synced ? onWindowChange : onPanelWindowChange(p.key)}
                          onAdjusting={setAdjusting}
                        />
                      </div>
                    </div>
                  );
                  })}
                </div>
              </div>
              {/* 常驻横向滑动块（第七十九轮）：轨道溢出时出现，拖拽/点按均可移动查看 */}
              <SplitScrollBar trackRef={splitScrollRef} />
            </div>
          </div>
          {/* 第一百三十一轮波2：分离模式底部共享 XBrush 退役——时间筛选器已上移顶部
              筛选条，共享/独立窗口调整由各面板底部 SplitTimeTrack（+「同步」开关）
              全权承担，底部不再有重复的时间条 */}
        </>
      ) : (
        <>
          {/* 组/角色图例带（第一百一十五轮立，第一百二十三轮④按组）：合并图（单组
              或多组并回一张图）也按组出块（单组不显组号）——主品药丸 + vs + 对比
              药丸（点击屏蔽/恢复，悬停该系列高亮 + 起点指引线）；块间灰短竖线分隔，
              对比超 3 个走块内 ‹› 滚动（主品恒可见），整排放不下两侧 ‹› 滚动；
              与宽表同用 groupsOfCards 取数 */}
          <div style={{ marginBottom: 6, minWidth: 0 }}>
            <BrandLegendStrip
              groups={tableGroups}
              hiddenKeys={hiddenKeys}
              onToggleHidden={toggleLegend}
              onHover={setLegendHoverKey}
              onCompareProduct={openCompareFor}
            />
          </div>
          <Chart
            series={chartSeries}
            granularity={state.granularity}
            currency={state.currency}
            priceTypes={state.priceTypes}
            gridLeft={gridLeft}
            gridTop={gridTop}
            showXLabels // 第一百五十二轮：图内恢复独立时间轴（业务意见）——周刻度 YYYYWxx、
            // 密度按 axisTickPlan 抽稀；底部轨道收敛为拖柄/跨年标注的查看窗口毛刷
            hideNamePills // 第一百一十五轮：产品名在图顶图例带，图内不再画药丸
            legendHoverKey={legendHoverKey}
            showYTicks={showYTicks}
            onShowYTicks={setShowYTicks}
            enableDrill={state.granularity !== 'week'}
            enableOffer={state.granularity === 'week' && offersOn}
            onDrill={onDrill}
            windowKey={`${win.s}:${win.e}`}
            yScale={yCfg}
            sliderScale={sliderScale}
            onSliderScale={setSliderScale}
            yCompress={yCompress}
            onYCompress={setYCompress}
            lineShape={lineShape}
            onLineShape={setLineShape}
            labelMode={labelMode} // 第一百一十四轮：价格显示 详细/精简
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
                ? '所有产品已隐藏，点击上方产品名恢复显示'
                : undefined
            }
          />
        </>
      )}
      {/* X 刷选条（合并模式唯一底部时间轴，第一百三十一轮波2起为纯查看窗口轨道）：
          只调整上方极值范围内的查看窗口；时间筛选在顶部筛选条。 */}
          {!splitActive && buckets.length > 0 && visSeries.length > 0 && (
            <XBrush
              buckets={buckets}
              s={win.s}
              e={win.e}
              lo={filterBounds[0]}
              hi={filterBounds[1]}
              plotLeft={gridLeft}
              granularity={state.granularity}
              onChange={onWindowChange}
              onAdjusting={setAdjusting}
            />
          )}
        </div>
        {/* 图右侧时点摘要面板（第112轮）：仅标题行按钮手动开合；收起时不渲染 */}
        <PointPanel
          open={pointPanelOpen}
          onCollapse={() => setPointPanelOpen(false)}
          items={summary}
          groups={summaryGroups}
          currency={state.currency}
          granularity={state.granularity}
          pointDate={pointDate}
          alertCounts={alertCounts}
          subscribedKeys={subscribedKeys}
          onToggleSubscribe={toggleAlertSub}
        />
      </div>

      {/* 多平台比价弹窗（入口 = 图例药丸悬停店铺图标，initialProduct = 发起
          产品）：单产品各平台价格趋势对比 + 比当前看板差价率，数据层
          platformPriceSpread = 全平台口径（与左上平台筛选无关） */}
      <PlatformCompareModal
        open={platformCompareOpen}
        onClose={() => setPlatformCompareOpen(false)}
        initialProduct={compareInit}
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
