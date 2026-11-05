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
// 2026-11-03 主品视图改版（Eason 两轮拍板）：
// ①成本柱呈现补齐「K 线式极值点」——选中区间内在图上标出价格最高/最低（同心双环）
//   与销量最高/最低（白芯菱形）四个位置，形状语言与价格走势页/经典呈现同源
//   （PanelExtremeMarks 两种呈现共用），为 SpreadRangeCard 极差读数提供位置标注，
//   title 报「锚日 + 极值类别 + 数值」；区间未选中不画。
// ②主品视图（未进本组对比）明细卡行退役——时点读数收进面板悬停浮窗
//   （PanelHoverTip：日期/桶号 + RRP + 折后价 + 环比 + 销量 + 成本销毛行随
//   「销毛成本」开关显隐，与明细卡同一份 weekDetailModel 口径；异常守卫裁定行
//   仅在观察点打标时出现在面板底部）。上方工具行改为三件套：中区产品显隐药丸带
//   （常驻同位切换，全隐藏走空态「全部恢复」，暂存条只在组视图出现）+ DNS 店铺
//   chip（明细卡原款迁入，onPick 数据流不变）+ 行尾「进入本组对比」轻量文字钮
//   （价格走势「多平台对比」同款同位，GroupCompareEntry）。RRP 不再单独占位，
//   悬停浮窗保留。组视图明细卡行原样保留（组内主参照）。
// ============================================================
// 量价改版收口（视觉 demo：design-proposals/pricelens-volume-spread-layout-demo.html，
// 局部决策见 .impeccable/surfaces/volume-main-product.md）：把 demo 的区间阅读语言落到
// 每个面板——①元信息行（图例 + 所选区间胶囊/拖选提示）；②双极差卡上移到主图上方并排；
// ③选区 = 浅蓝底带 + 双侧竖线，区间极值改画尺寸标注尺（垂直双箭头 + Δ 标签 + 白底标签框
// + 水平引线 + 极值空心圆），替代原「极值横线带」；④时点读数从图内 tipBox 浮层改为图下
// 单周明细卡（三栏：锚日/产品 | RRP/折后价/环比/销量 | 当月成本/单台销毛/销毛率·模拟）；
// ⑤脚注行补口径说明。指针交互（悬停列/拖选区间/横向参考位）由面板自绘 PointerShield
// 统一接管，图表层不再出跟随浮层；观察列 = 悬停 ?? 区间末周 ?? 窗口末桶，十字线贯穿
// 主图 + 成本销毛带，键盘 ←/→/Home/End 切换。缺采仍显示 — 不插值；涨蓝跌琥珀不变。
// ============================================================
// 第一百九十一轮（Eason 五点）：面板头升级为价格页分离面板同构 [拖柄][产品药丸]——
// ①拖柄照价格页范式（拖到目标面板松手换位，dragover 描边 + 拖动降透明反馈）；
// 换序只记本地会话态 panelOrder（不落盘），面板渲染序 = panelOrder 优先、缺省回落
// 数据序。②产品药丸：第一百九十一轮 = BrandLegendStrip 导出的 PillUnit（上行 16px
// 平台小药丸 + 下行两行产品药丸）；2026-11-03 明细卡单行化（Eason 拍板，高保真稿
// design-proposals/volume-detail-card-compact.html 方案 A）后退役——身份区改紧凑
// 单行胶囊（品牌点 + 名称 + 配置 chip，点击隐藏面板）+ DNS 店铺筛选 chip（渠道
// 选择浮层同款，onPick 回写 setSelectionPlatform 后量价取数随所选平台重算），
// 全部并入图下明细卡首行（2026-11-02 已并入，本次只压形态）。屏蔽/悬停联动
// 量价页没有。
// ============================================================
// 2026-11-05 三针整改（Eason 看图反馈）：
// ①胶囊带逐格严格居中对齐 + 隐藏收纳区改位——胶囊带只放**可见面板**胶囊
//   （gridColumns = 可见面板数，与面板网格同一条模板字符串/同 gap/同轴列偏移，
//   对位参数 single-source），隐藏产品移入工具行「销毛成本」右侧的 HiddenVault
//   专用收纳区（迷你芯片、>3 枚收缩为 +N，点击恢复回原列位；「全部恢复」并入），
//   主品视图不再渲染面板区下方 HiddenTray（组内对比视图行为不变）；
// ②主图图例（经典 折后价/RRP/销量、销毛成本 折后价/成本/销量/销毛率）全部
//   可点击切换对应元素显隐，隐藏态降透明（全站图例语言 opacity .45），会话态
//   跨页保留（volume.legendOff）；库存卡/销毛卡图例已在各卡内支持（确认覆盖）；
// ③X 轴格式审计收口：成本柱呈现补 X 轴日历标签行（axisTickPlan 口径，周 =
//   2026W33，月 MM/季 Qn + 年份第二行），库存 · DOS 卡改传 shortBucketLabel
//   标签（原先周粒度是周三 MM-DD）；「时间轴同步」开关承载盒改为轨道带同几何
//   （TRACK_RAIL_H）+ flex 居中——按钮中心恒等于轨道带中心，不再依赖按钮高度。
// ============================================================
// 2026-11-05 平台口径收口（Eason 指令：「删除店铺同步的功能，删除每个产品卡片
// 选店铺的功能。改为在顶部产品后面加一个平台筛选器，它筛选的结果会作用于底下
// 所有的产品。我们不允许每个产品单独选择平台店铺。」）：
// ①每卡 DNS 店铺 chip 退役（MainControlBand 胶囊带 + 组视图明细卡身份区），
//   ChannelSelectPopover 随之从本页撤下（价格走势页共用件保留）；
// ②「店铺同步」按钮退役（组视图明细卡 + 会话态 volume.storeSync / 快照还原
//   链路整体删除；platformSync.ts 纯函数由价格走势页继续使用）；
// ③面板取价口径改读全局平台筛选器——顶部筛选条「产品」后的平台 Select
//   （FilterBar.PlatformSelectBox）写 state.platform，本页 panelSpecs 全部
//   面板按它取数（选平台 = 该平台全部渠道、平台内每周最低价店铺；默认 =
//   默认店铺/默认平台自动口径）。每产品选择项上的 platform 覆写字段不再被
//   本页消费（价格走势页图例渠道 chip 语义不变）。
// ============================================================
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { Segmented } from 'antd';
import { HolderOutlined } from '@ant-design/icons';
import { useFilters } from '../state/FiltersContext';
import { useConfigVersion } from '../state/configStore';
import AnomalyQualityChip, { anomalyBucketTextOf, registerAnomalyIsolated, type AnomalyChipPoint } from '../components/AnomalyQualityChip';
import { addAnomalyMark } from '../dataModel/anomaly';
import usePageViewState from '../state/usePageViewState';
import type { PlatformSelection } from '../state/filtersTypes';
import ChartContentBar from '../components/ChartContentBar';
import BrandDot from '../components/BrandMark';
import Chart from '../chart/PriceTrend/Chart';
import ChartToolbar from '../chart/PriceTrend/ChartToolbar';
// 卡顶时间筛选簇在顶部筛选条。这里只取查看窗口说明行高度，用来对齐同步按钮。
import SplitAxisColumn from '../chart/PriceTrend/SplitAxisColumn';
import { collectTierValues, type LineShapeChoice } from '../chart/PriceTrend/chartModel';
import {
  GRID,
  adaptiveRangeOf,
  computeYAxis,
  convertWindowIds,
  dataBucketRange,
  enumerateBuckets,
  estGridLeft,
  normalizeWindow,
  perUsdOf,
  seriesSpanRange,
  shortBucketLabel,
  splitAxisWidth,
  yPxOf,
  type Bucket,
  type StripGeom,
  type YScale,
} from '../chart/PriceTrend/helpers';
import { buildSeries, lowestPriceColorSku } from '../dataModel/aggregate';
import { volumeByBuckets } from '../dataModel/volume';
import { dimProduct } from '../data';
import type { Granularity, Series, SeriesPoint } from '../dataModel/types';
import { brandColorOf, color, font, fontSize, formatPrice, radius, selectAccent, selectSoft, selectSoftInk, shadow, space } from '../theme/tokens';
import { flatSelections } from '../state/mainSelection';
import { validVolumeViewMode, volumeProductRefs, type VolumeViewMode } from './volume/volumeView';
import VolumeBars from './volume/VolumeBars';
import CostBarChart, { COST_RATE_H, costRateAxisMaxOf } from './volume/CostBarChart';
import MergedCompareChart, { type MergedCompareProduct } from './volume/MergedCompareChart';
import InventoryDosCard from './volume/InventoryDosCard';
import { inventoryDemoOf } from './volume/inventoryDemo';
import PanelTimeTrack, { TRACK_BLOCK_H, TRACK_RAIL_H } from './volume/PanelTimeTrack';
import HiddenTray, { HiddenVault, type HiddenTrayItem } from './volume/HiddenTray';
import { marginCostAvailabilityOf, marginCostOf } from './volume/marginCost';
import { marginCrossX } from './volume/marginCostGeometry';
import SpreadRangeCard from './volume/SpreadRangeCard';
import WeekDetailCard, { SuspectActions } from './volume/WeekDetailCard';
import PanelExtremeMarks from './volume/PanelExtremeMarks';
import PanelHoverTip from './volume/PanelHoverTip';
import MainControlBand, { GroupCompareEntry } from './volume/MainControlBand';
import PointerShield from './volume/PointerShield';
import { detailDateOf, weekDetailModel } from './volume/weekDetail';
import { SPREAD_CARD_H, spreadCardEmptyModel, spreadCardModel, spreadCardRow } from './volume/spreadCards';
import { commitVolumeAxisLimit, fitVolumeLimitsByKey, normalizePanelWindow, vMaxOf, volumeRangeOf, type VolumeAxisLimits, type VolumeSlot } from './volume/volumeAxis';
import { niceCeil } from '../dataModel/volume';
import { formatVolumeAmount, pricePointValid, rangeBandInView, rangeSpreadOf, resolveSelectedWindow, shouldUseWanUnits, volumePointValid } from './volume/periodSummary';

// 与价格走势分离卡片同一套：拖柄骑在上边线正中，上半凸出卡片；滚动区垫高避免裁切
const PANEL_GRIP_H = 14;
const SCROLL_PAD_TOP = 10;
const PANEL_GRID_TOP = 14; // 面板图顶窄空气带（同分离模式）
// 面板内图例元信息行定高（2026-11-02 Eason：0 刻度要对在 X 轴上）：图例 30 + 上下边距 4/8；
// 共享轴列的上偏移必须把这一行算进去，否则轴刻度整体比绘图区高出 42px（两种呈现都受影响）
const PANEL_META_ROW_H = 30;
const PANEL_META_H = PANEL_META_ROW_H + 4 + 8;
const LOAD_ERROR_HINT: ReactNode = (
  <>
    数据加载异常
    <div style={{ marginTop: 4, fontSize: 12 }}>请刷新重试</div>
  </>
);

const CHART_GRID_LEFT = 8; // 图贴面板左缘：名称药丸已删，产品名在面板头
const CHART_GRID_RIGHT = 78; // 右侧预留销量轴列（轴线 + 最高值输入框）

/** 品牌色 → 半透明 rgba（成本柱图例/柱面用） */
function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return `rgba(23, 23, 23, ${alpha})`;
  return `rgba(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}, ${alpha})`;
}

/** 粒度名词（周/月/季）：脚注与无障碍文案随粒度换字，不把「周」硬套在月/季视图 */
const granNounOf = (granularity: Granularity): string => (granularity === 'week' ? '周' : granularity === 'month' ? '月' : '季');

/** 面板网格列模板（2026-11-05 整改1① 对位 single-source）：胶囊带行与面板网格
 *  必须由本函数取同一条字符串——同容器宽（trackWidth 内）、同模板、同 gap、
 *  同轴列偏移（lead），胶囊组逐格居中于其面板上方 */
const panelGridCols = (count: number): string => `repeat(${Math.max(1, count)}, minmax(0, 1fr))`;

/** 主图图例可点击项（2026-11-05 整改2）：aria-pressed + 隐藏态降透明（全站图例
 *  显隐语言 opacity .45，SuppLegend/WorkbenchLegend 同款），glyph 形态随各系列 */
function LegendToggleItem(props: { label: string; off: boolean; onToggle: () => void; glyph: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={!props.off}
      title={props.off ? `显示${props.label}` : `隐藏${props.label}`}
      onClick={props.onToggle}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
        border: 'none', background: 'none', padding: 0, font: 'inherit', fontSize: 11, lineHeight: '14px',
        color: 'inherit', cursor: 'pointer', opacity: props.off ? 0.45 : 1,
      }}
    >
      {props.glyph}
      {props.label}
    </button>
  );
}

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

/** 面板身份文案（胶囊/暂存条/收纳区共用）：name = 「型号 + 配置」展示名，
 *  nameText 去配置后缀、romText = 配置原文（'—' 出空）。
 *  2026-11-05：DNS 店铺 chip 退役后，药丸规格只剩身份文案。 */
interface PanelPillSpec {
  text: string;
  nameText: string;
  romText: string;
}

/** 量价面板取数清单（第一百六十七轮）：顶部筛选器所选产品 = 各卡「主品 + 对比区」
 *  依次铺开去重；每产品一面板，国家变化时 SKU 口径随 resolveSlot 重算。
 *  2026-11-05（Eason）：platform = 全局平台筛选器口径（state.platform，所有面板
 *  同一口径），每产品选择项上的 platform 覆写不再被本页消费 */
interface PanelSpec {
  key: string;
  cardId: string;
  modelId: string;
  romram: string;
  isOwn: boolean;
  brand: string;
  name: string;
  skuIds: string[];
  platform: PlatformSelection | null;
}

export default function VolumePrice() {
  const { state, actions } = useFilters();
  const cc = state.countryCode;
  // 配置版本（2026-11-01 异常守卫）：守卫规则/人工裁定保存后面板取数立即重算
  const configVersion = useConfigVersion();
  // 主产品经营视图是量价卡内的瞬态：切走再回来回到默认主产品，不写入筛选器或 URL。
  const [viewMode, setViewMode] = useState<VolumeViewMode>({ kind: 'mains' });
  const safeViewMode = validVolumeViewMode(state.mains, viewMode);
  const reading = safeViewMode.kind === 'mains';
  useEffect(() => {
    if (safeViewMode !== viewMode) setViewMode(safeViewMode);
  }, [safeViewMode, viewMode]);

  // ---- 产品显隐（2026-11-01 设计方案 A：移除式隐藏 + 暂存条）：
  //      点击面板头药丸 = 该产品面板整体移出网格，被隐藏产品收进面板区下方的
  //      「已隐藏」暂存条；会话态跨页保留、不进 URL；视图模式切换与
  //      产品清单/价格类型/币种变化清空（挂进下方 scaleResetKey 复位效果） ----
  const [hiddenPanels, setHiddenPanels] = usePageViewState<string[]>('volume.hiddenPanels', () => []);
  const hiddenSet = useMemo(() => new Set(hiddenPanels), [hiddenPanels]);
  // 销毛成本开关（2026-11-02 Eason；2026-11-03 收口：经典带成本销毛带形态与
  // 「经典 | 成本柱」呈现切换一并退役，开启即成本柱呈现）：
  // 关 = 经典纯量价（折线 + 销量柱，无成本无销毛带，回到最初的量价图）；
  // 开 = 成本柱呈现（柱高折后价 + 成本位置灰线 + 销量右轴细线 + 销毛率下垂柱）。
  // 组内对比下不允许显示销毛成本（对比时放在下方不合理）：强制关、开关禁用。会话态跨页保留
  const [showMargin, setShowMargin] = usePageViewState<boolean>('volume.showMargin', () => false);
  const marginLocked = safeViewMode.kind === 'group';
  const marginOn = showMargin && !marginLocked;
  // 呈现方式（2026-11-03 五条反馈收口）：销毛成本开关 = 呈现总开关，「经典」形态退役——
  // 开 = 成本柱呈现（柱高折后价 + 成本位置灰线 + 销量右轴细线 + 销毛率下垂柱），关 = 纯量价
  const costbar = marginOn;
  const toggleMargin = (): void => {
    if (marginLocked) return;
    setShowMargin(!showMargin);
  };
  // 销毛呈现二式（2026-11-04 Eason）：下垂柱（默认，下半区）| 顶部销毛线（平滑虚线 +
  // 最高/最低/最新三点标值，不与价格/销量共用 Y 轴）。收进 ⋯ 菜单「呈现」行，会话态。
  const [marginLineOn, setMarginLineOn] = usePageViewState<boolean>('volume.marginLine', () => false);
  // 面板呈现二式（2026-11-04 Eason，纯量价 + 组内对比限定）：分离面板（默认 = 现状）|
  // 合并单图（组内产品合并同一张图：销量面积叠层 + 折后价平滑线，内建量/价双轴）。
  // 会话态跨页保留；仅组内对比视图出切换槽（主品视图合并不适用）；销毛开（主品视图）
  // 的「呈现」行仍是既有销毛呈现二式，互不占用。
  const [mergedCompare, setMergedCompare] = usePageViewState<boolean>('volume.mergedCompare', () => false);
  const mergedOn = !marginOn && safeViewMode.kind === 'group' && mergedCompare;
  // 合并单图观察列（瞬态，不持久化）：联动图内列高亮/读值浮层与图下各产品明细卡
  const [mergedHover, setMergedHover] = useState<number | null>(null);

  // 视图模式切换（阅读 ↔ 组内对比 / 换组）即清空隐藏集：两视图面板集不同，
  // 「一次看一组」的心智下从空集开始
  const switchViewMode = (mode: VolumeViewMode): void => {
    setViewMode(mode);
    setHiddenPanels((prev) => (prev.length === 0 ? prev : []));
  };
  // 焦点承接（设计 §5.5）：隐藏后药丸随面板卸载，焦点移到暂存条对应迷你药丸
  // （组视图 HiddenTray）或收纳区对应芯片（主品视图 HiddenVault，2026-11-05 整改1）；
  // 迷你药丸/芯片恢复后焦点回该面板头药丸；「全部恢复」后落到第一个恢复面板的药丸
  const pendingFocusRef = useRef<{ where: 'tray' | 'panel' | 'vault'; key: string } | null>(null);
  const trayItemRefs = useRef(new Map<string, HTMLButtonElement>());
  const vaultItemRefs = useRef(new Map<string, HTMLButtonElement>());
  const emptyRestoreRef = useRef<HTMLButtonElement | null>(null);
  const panelPillHostRefs = useRef(new Map<string, HTMLSpanElement>());
  const registerTrayItem = (key: string, el: HTMLButtonElement | null): void => {
    if (el) trayItemRefs.current.set(key, el);
    else trayItemRefs.current.delete(key);
  };
  const registerVaultItem = (key: string, el: HTMLButtonElement | null): void => {
    if (el) vaultItemRefs.current.set(key, el);
    else vaultItemRefs.current.delete(key);
  };
  const registerPanelPillHost = (key: string, el: HTMLSpanElement | null): void => {
    if (el) panelPillHostRefs.current.set(key, el);
    else panelPillHostRefs.current.delete(key);
  };
  useLayoutEffect(() => {
    const pending = pendingFocusRef.current;
    if (!pending) return;
    pendingFocusRef.current = null;
    if (pending.where === 'vault') {
      const chip = vaultItemRefs.current.get(pending.key);
      if (chip) {
        chip.focus();
        return;
      }
      // 主品视图收纳区恒渲染（有隐藏必有芯片），缺兜底到空态「全部恢复」
      emptyRestoreRef.current?.focus();
      return;
    }
    if (pending.where === 'tray') {
      const mini = trayItemRefs.current.get(pending.key);
      if (mini) {
        mini.focus();
        return;
      }
      // 藏到零时暂存条不渲染（空态承担恢复）——焦点落到空态「全部恢复」，
      // 键盘用户的 Tab 流不断、可直接回滚
      emptyRestoreRef.current?.focus();
      return;
    }
    const pill = panelPillHostRefs.current.get(pending.key)?.querySelector('button.lpl-lg-pill');
    if (pill instanceof HTMLElement) pill.focus();
  });

  // ---- 面板清单：默认只铺各卡主品；组内对比才展开该卡的主品与竞品。
  //      取价口径 = 全局平台筛选器（state.platform，2026-11-05 Eason：所有面板
  //      同一口径，每产品不再单独绑平台店铺）；换平台即全部面板重取数 ----
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
        ...info,
        platform: state.platform ?? null,
      });
    }
    return out;
  }, [state.mains, cc, safeViewMode, state.platform]);
  const panelCount = panelSpecs.length;

  // ---- 视图状态（同价格看板口径；全部面板共用）。同步态/面板独立窗口/价格
  //      显示 = 会话态跨页保留（P1-5，usePageViewState）；其余为瞬态。
  //      第一百九十二轮（Eason）：Y 轴设置四件套（每格高度/自动压缩/Y 刻度线/
  //      折线样式）与页签显示一并转会话态——切价格看板再切回不再被清 ----
  const [sliderScale, setSliderScale] = usePageViewState<number>('volume.sliderScale', () => 1);
  const [yCompress, setYCompress] = usePageViewState<boolean>('volume.yCompress', () => false);
  const [showYTicks, setShowYTicks] = usePageViewState<boolean>('volume.showYTicks', () => true);
  // 价格档位带开关（第一百九十三轮，Eason）：与 Y 刻度线独立
  const [showTiers, setShowTiers] = usePageViewState<boolean>('volume.showTiers', () => true);
  // 成本柱呈现（销毛成本开启）下档位没有作用（2026-11-02 Eason），强制不画且不留
  // 档位列空白；用户的档位开关设置只对经典量价生效
  const effShowTiers = marginOn ? false : showTiers;
  const [lineShape, setLineShape] = usePageViewState<LineShapeChoice>('volume.lineShape', () => 'auto');
  // 第一百一十四轮（评审）：价格显示（默认精简，会话态跨页保留）+ 全面板共享悬停纵向位置（横向虚线）
  const [labelMode, setLabelMode] = usePageViewState<'detail' | 'compact'>('volume.labelMode', () => 'compact');
  // 悬停页签比率：默认周环比（与价格看板同一默认）；会话态跨页保留（192 轮）
  const [tipMode, setTipMode] = usePageViewState<'discount' | 'wow'>('volume.tipMode', () => 'wow');
  // ---- 主图图例显隐（2026-11-05 整改2）：图例项点击切换对应图表元素显隐，
  //      隐藏态图例降透明（全站语言 opacity .45），会话态跨页保留。键空间：
  //      经典 = 'discounted' | 'rrp' | 'volume'；销毛成本 = 'cbPrice' | 'cbCost'
  //      | 'cbVolume' | 'cbMargin'。图例只切显隐，不重算轴（yCfg/costBarMax
  //      仍按全量可见面板序列）----
  const [legendOff, setLegendOff] = usePageViewState<Record<string, boolean>>('volume.legendOff', () => ({}));
  const legendOffOf = useCallback((key: string): boolean => legendOff[key] === true, [legendOff]);
  const toggleLegend = useCallback((key: string): void => {
    setLegendOff((prev) => ({ ...prev, [key]: !prev[key] }));
  }, [setLegendOff]);
  // 经典模式传给 Chart 的价格口径 = 全局筛选 ∩ 图例显隐（图例隐藏只影响本页图内
  // 渲染，不回写全局 priceTypes——顶部筛选条的价格开关语义保持独立）
  const classicPriceTypes = useMemo(
    () => ({
      ...state.priceTypes,
      discounted: state.priceTypes.discounted && !legendOffOf('discounted'),
      rrp: state.priceTypes.rrp && !legendOffOf('rrp'),
    }),
    [state.priceTypes, legendOffOf],
  );
  const [crossY, setCrossY] = useState<number | null>(null);
  const [adjusting, setAdjusting] = useState(false); // 刷选拖动中冻结价格 Y 轴
  // 查看窗口 = 会话态跨页保留（与价格看板对齐；范围改动等失义路径照旧复位）
  const [windowIds, setWindowIds] = usePageViewState<[string, string] | null>('volume.windowIds', () => null);
  // 销量轴限位按面板 key 存（2026-11-01 审计 P3）：删中间面板不再把限位平移到
  // 下一张（原按下标存依赖 scaleResetKey 兜底复位）；成员变化由 fitVolumeLimitsByKey 收纳。
  const [volumeLimits, setVolumeLimits] = useState<Record<string, VolumeAxisLimits>>({});
  // ---- 第119轮（走查会）：同步/非同步查看时间。同步 = 全部面板共用窗口（原行为）；
  //      非同步 = 每面板独立时间轴（panelWins 记各面板窗口，null = 未单独调整过）。
  //      两项均会话态跨页保留（P1-5）。2026-11-03：开关两视图通用——主产品视图
  //      同款出现在共享轴列底部，默认开，语义与组内对比完全一致 ----
  const [synced, setSynced] = usePageViewState<boolean>('volume.synced', () => true);
  const timeSynced = synced;
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
    setPanelWins(fit<[number, number] | null>(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelCount]);
  // 面板成员变化（增删/换成员，含同数置换）→ 销量轴限位表按 key 收纳（见上注）
  const panelKeysSig = JSON.stringify(panelSpecs.map((p) => p.key));
  useEffect(() => {
    setVolumeLimits((prev) => fitVolumeLimitsByKey(prev, panelSpecs.map((p) => p.key)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelKeysSig]);
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
    setVolumeLimits({});
    // 产品清单/价格类型/币种变化 → 隐藏集清空（与价格页 hiddenKeys 复位时机对齐）
    setHiddenPanels((prev) => (prev.length === 0 ? prev : []));
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
              // 取价口径 = 全局平台筛选器（2026-11-05 Eason）：buildSeries 按口径
              // 解析渠道——选平台 = 该平台全部渠道（平台内每周最低价店铺），
              // null = 默认店铺/默认平台自动口径；所有面板同口径
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
    [panelSpecs, cc, state.industry, state.granularity, dataStart, dataEnd, state.currency, state.agg, configVersion],
  );

  // 时间自适应（2026-11-02 Eason 纠偏）：自动范围 = 顶部所选全部产品（各卡主品 +
  // 对比产品）的最早/最晚有效价格桶，与价格页同一口径——不再只看画面上的面板。
  // 原先主产品视图只按主品算：切到量价页范围收窄、切回价格页又放宽，用户感知为
  // 「自动时间不是所选产品的最早时间」。跨度取数照价格页合并图口径（flatSelections
  // 去重 + 全集桶），只用来算范围、不参与渲染；视图模式/产品显隐只影响画面不影响范围。
  // 本 effect 声明在粒度换算之后：切粒度先换桶，自适应范围随后覆盖。
  const { mainSels: selMains, compareSels: selCompares } = useMemo(() => flatSelections(state.mains), [state.mains]);
  const selectionSeries = useMemo<Series[]>(() => {
    const groups = [...selMains, ...selCompares].map((g) => ({ ...g, isOwn: false }));
    if (groups.length === 0) return [];
    try {
      return buildSeries({
        groups,
        granularity: state.granularity,
        startBucket: dataStart,
        endBucket: dataEnd,
        currency: state.currency,
        agg: state.agg,
        scope: { countryCode: cc, industry: state.industry },
      });
    } catch {
      return [];
    }
  }, [selMains, selCompares, state.granularity, dataStart, dataEnd, state.currency, state.agg, cc, state.industry, configVersion]);
  const span = useMemo(() => seriesSpanRange(selectionSeries), [selectionSeries]);
  const adaptiveBounds = useMemo(
    () => (state.adaptive ? adaptiveRangeOf(buckets, span, 0) : null),
    [state.adaptive, buckets, span],
  );
  const adaptiveProductKey = JSON.stringify([
    selMains.map(({ modelId, romram }) => `${modelId}|${romram}`).sort(),
    selCompares.map(({ modelId, romram }) => `${modelId}|${romram}`).sort(),
  ]);
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
  //      非同步 = 各面板独立窗口（未单独调整过的回落共享窗口，越界钳回可调全域）。
  //      timeSynced（开同步）恒用共享窗口；2026-11-03 起两视图同一语义——主产品
  //      视图要独立窗口需显式关掉轴列底部的「时间轴同步」开关，开关可见即无
  //      「残留独立窗口把图冻结在旧段」的死角（2026-11-01 审查 P1 的口径保留）。----
  const effWins = useMemo<[number, number][]>(
    () => panelSpecs.map((_, i) => normalizePanelWindow(timeSynced ? null : panelWins[i] ?? null, win.s, win.e, filterBounds[0], filterBounds[1])),
    [panelSpecs, timeSynced, panelWins, win.s, win.e, filterBounds],
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

  // 换产品清单（顶部筛选器增删产品）→ 悬停列/高亮段随面板重置；独立窗口按面板
  // 挂在数组下标上，中间删面板会错位串到下一张面板（2026-11-01 审查 P2），一并清。
  useEffect(() => {
    setHoverIdxs(panelSpecs.map(() => null));
    setBrushes(panelSpecs.map(() => null));
    setBrushLive(panelSpecs.map(() => null));
    setPanelWins(panelSpecs.map(() => null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  // ---- 渲染层过滤（设计 §7 核心手法）：面板态数组（hoverIdxs/geoms/brushes/
  //      brushLive/volumeLimits/panelWins）全按下标挂全量面板、一律不动；只在
  //      orderedPanels 之后按隐藏集过滤出可见面板再渲染，天然避免下标错位 ----
  const visiblePanels = useMemo(() => orderedPanels.filter((p) => !hiddenSet.has(p.spec.key)), [orderedPanels, hiddenSet]);
  const visibleCount = visiblePanels.length;
  const hidePanel = (key: string): void => {
    setHiddenPanels((prev) => (prev.includes(key) ? prev : [...prev, key]));
    pendingFocusRef.current = { where: 'tray', key };
  };
  const restorePanel = (key: string): void => {
    setHiddenPanels((prev) => prev.filter((k) => k !== key));
    pendingFocusRef.current = { where: 'panel', key };
  };
  const restoreAllPanels = (): void => {
    const first = (visibleCount > 0 ? orderedPanels.find((p) => hiddenSet.has(p.spec.key)) : orderedPanels[0])?.spec.key;
    setHiddenPanels((prev) => (prev.length === 0 ? prev : []));
    if (first) pendingFocusRef.current = { where: 'panel', key: first };
  };
  // 主品视图药丸显隐（2026-11-05 整改1② 改版）：胶囊带只放**可见面板**胶囊，
  // 点击 = 隐藏（收进「销毛成本」右侧 HiddenVault 收纳区，焦点承接 'vault'）；
  // 收纳区芯片点击 = 恢复（restorePanel，焦点回胶囊带原列位）；全隐藏仍走面板区
  // 空态「全部恢复」（restoreAllPanels 的焦点落到控制区药丸），收纳区行尾也有
  // 「全部恢复」轻量钮。组视图明细卡药丸继续走 hidePanel/restorePanel（暂存条
  // 承接，交互不变）。
  const hideFromBand = (key: string): void => {
    setHiddenPanels((prev) => (prev.includes(key) ? prev : [...prev, key]));
    pendingFocusRef.current = { where: 'vault', key };
  };
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

  // 面板身份文案（2026-11-05 起）：名称/配置拆自面板规格（name =「型号 + 配置」，
  // nameText 去配置后缀、'—' 出空），供组视图明细卡胶囊、暂存条与收纳区共用。
  // 原 DNS 店铺 chip 的渠道徽标/浮层语境随每卡选店退役一并删除。
  const pillOf = (p: (typeof panelViews)[number]): PanelPillSpec => {
    const rom = p.spec.romram !== '—' ? p.spec.romram : '';
    return {
      text: p.name,
      nameText: rom && p.name.endsWith(rom) ? p.name.slice(0, p.name.length - rom.length).trim() : p.name,
      romText: rom,
    };
  };

  // 暂存条清单（组内对比视图专用，2026-11-05 整改1② 起主品视图恢复入口 =
  // 收纳区 HiddenVault）：跟随当前展示序（拖拽换位序优先）；产品已从筛选器移除
  // 的隐藏项不再出现（面板 key 不在清单里即随暂存条消失）。全隐藏时空态承担
  // 恢复，暂存条不重复渲染（设计 §4.A.5）。
  const trayItems = useMemo<HiddenTrayItem[]>(() => {
    if (panelCount > 0 && visibleCount === 0) return [];
    return orderedPanels
      .filter((p) => hiddenSet.has(p.spec.key))
      .map((p) => {
        const pill = pillOf(p);
        return { key: p.spec.key, brand: p.brand, nameText: pill.nameText, romText: pill.romText };
      });
  }, [orderedPanels, hiddenSet, panelCount, visibleCount]);

  // 异常守卫人工裁定（2026-11-01）：单周明细卡「确认真实价格 / 标记异常」→
  // addAnomalyMark 留痕 + CONFIG_CHANGED_EVENT 广播（configVersion 使面板重取数）
  const markPanelPoint = (
    panel: (typeof panelViews)[number],
    point: SeriesPoint | null,
    action: 'exempt' | 'isolate',
  ): void => {
    if (!point || point.bucketId === '') return;
    addAnomalyMark({
      countryCode: cc,
      seriesKey: panel.spec.key,
      bucketId: point.bucketId,
      action,
      label: `${panel.brand} ${panel.name}`,
      price: point.price,
      wow: point.suspectWow ?? null,
      ts: Date.now(),
      granularity: state.granularity, // 清单桶文案按粒度显示
    });
  };

  // 异常守卫（2026-11-01）：本页（可见面板 × 可见窗口）隔离点清单——工具行只读 chip
  const anomalyIsolated = useMemo<AnomalyChipPoint[]>(() => {
    const out: AnomalyChipPoint[] = [];
    for (const panel of visiblePanels) {
      for (const series of panel.vis) {
        for (const pt of series.points) {
          if (pt.suspect !== 'quarantined' || pt.price == null) continue;
          const wow = pt.suspectWow;
          out.push({
            label: `${panel.brand} ${panel.name}`,
            bucketText: anomalyBucketTextOf(state.granularity, pt.bucketId),
            price: formatPrice(pt.price, state.currency),
            wow: wow != null ? `${wow > 0.005 ? '+' : wow < -0.005 ? '−' : '±'}${Math.round(Math.abs(wow) * 100)}%` : null,
          });
        }
      }
    }
    registerAnomalyIsolated('volume', out);
    return out;
  }, [visiblePanels, state.granularity, state.currency]);

  // ---- 共享价格 Y 轴：可见面板系列并集算一次（步长滞回 + 刷选冻结）。
  //      被隐藏面板不进并集（设计 §5.3：隐藏即退出并集、刻度收缩，与价格页口径一致） ----
  const visUnion = useMemo(
    () => panelViews.filter((p) => !hiddenSet.has(p.spec.key)).flatMap((p) => p.vis),
    [panelViews, hiddenSet],
  );
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
  // ---- 合并单图数据（2026-11-04 Eason）：纯量价 + 组内对比 + 合并呈现时生效——
  //      销量/价格取组内各产品既有 panel 数据源、共享查看窗口切片（与分离面板
  //      同源同窗口），只改呈现不改数值；销量轴上限 = 合并窗口全产品并集 nice 上限，
  //      万档判定与明细卡同一份 shouldUseWanUnits 口径 ----
  const mergedVolumes = useMemo(
    () =>
      (mergedOn
        ? panelData.map((p) => volumeByBuckets(p.spec.modelId, p.spec.romram, cc, state.granularity, domainIds.slice(win.s, win.e + 1)))
        : []),
    [mergedOn, panelData, cc, state.granularity, domainIds, win.s, win.e],
  );
  const mergedProducts = useMemo<MergedCompareProduct[]>(
    () =>
      (mergedOn
        ? visiblePanels.map((p) => ({
          key: p.spec.key,
          name: p.name,
          brand: p.brand,
          color: p.series[0]?.color ?? brandColorOf(p.brand),
          points: (p.series[0]?.points ?? []).slice(win.s, win.e + 1),
          volumes: mergedVolumes[p.idx] ?? [],
        }))
        : []),
    [mergedOn, visiblePanels, mergedVolumes, win.s, win.e],
  );
  const mergedVMax = useMemo(() => vMaxOf(mergedProducts.flatMap((pr) => [...pr.volumes])), [mergedProducts]);
  const mergedWan = useMemo(() => shouldUseWanUnits(mergedProducts.flatMap((pr) => [...pr.volumes])), [mergedProducts]);
  const mergedFormatVolume = useCallback((v: number) => formatVolumeAmount(v, mergedWan), [mergedWan]);
  const marginCosts = useMemo(
    () => panelData.map((panel, i) => {
      const ids = domainIds.slice(effWins[i][0], effWins[i][1] + 1);
      return marginCostOf({
        modelId: panel.spec.modelId,
        romram: panel.spec.romram,
        countryCode: cc,
        // 异常守卫（2026-11-01）：隔离周价格不进月均收入（不造销毛的口径起点）
        points: panel.series.flatMap((series) => series.points).filter((pt) => pt.suspect !== 'quarantined'),
        bucketIds: ids,
      });
    }),
    [panelData, domainIds, effWins, cc],
  );
  // 成本柱模式 $ 刻度：从 0 起，上限覆盖可见面板的折后价与成本（柱形语义需要 0 基线）。
  // 友商不填模拟成本（marginCostAvailabilityOf = empty，与明细卡/经典成本带同口径）：
  // 成本不进上限、图上也不画成本线与销毛率柱
  const costBarMax = useMemo(() => {
    let m = 0;
    for (const panel of panelViews) {
      if (hiddenSet.has(panel.spec.key)) continue;
      for (const series of panel.vis) for (const pt of series.points) if (pt.price != null && pt.price > m) m = pt.price;
      if (marginCostAvailabilityOf(panel.spec.isOwn, marginCosts[panel.idx] ?? []) === 'empty') continue;
      for (const point of marginCosts[panel.idx] ?? []) if (point && point.unitCost > m) m = point.unitCost;
    }
    return m;
  }, [panelViews, hiddenSet, marginCosts]);
  const yCfgCost = useMemo(() => computeYAxis({
    series: visUnion,
    priceTypes: state.priceTypes,
    sliderScale: 1,
    allowBreak: false,
    perUsd: perUsdOf(state.currency),
    yMin: 0,
    yMax: costBarMax > 0 ? niceCeil(costBarMax * 1.06) : undefined,
  }), [visUnion, state.priceTypes, state.currency, costBarMax]);
  // 成本柱销毛率共享轴上限（2026-11-02 Eason：下方左侧加销毛率轴）：可见面板最大销毛率
  // 向上取整到 10% 档，所有面板同一比例——下垂深度可直接横向比较；隔离周不计
  const costRateAxisMax = useMemo(() => {
    const rates: number[] = [];
    for (const panel of panelViews) {
      if (hiddenSet.has(panel.spec.key)) continue;
      if (marginCostAvailabilityOf(panel.spec.isOwn, marginCosts[panel.idx] ?? []) === 'empty') continue;
      const pts = panel.vis[0]?.points;
      (marginCosts[panel.idx] ?? []).forEach((mp, i) => {
        if (mp && pts?.[i]?.suspect !== 'quarantined') rates.push(mp.marginRate);
      });
    }
    return costRateAxisMaxOf(rates);
  }, [panelViews, hiddenSet, marginCosts]);
  const costRateTicks = useMemo(
    () => (costRateAxisMax > 0
      ? [
        { y: COST_RATE_H / 2, text: `${Math.round(costRateAxisMax * 50)}%` },
        { y: COST_RATE_H, text: `${Math.round(costRateAxisMax * 100)}%` },
      ]
      : []),
    [costRateAxisMax],
  );
  // 各图销量轴上限恒自动（niceCeil 窗口内最大值）
  const panelVMax = volumes.map((vs) => vMaxOf(vs));
  const onVolumeAxisLimit = (key: string, kind: 'max', value: number | null, autoMax: number): void => {
    setVolumeLimits((prev) => ({ ...prev, [key]: commitVolumeAxisLimit(prev[key], kind, value, autoMax) }));
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
      // 异常守卫（2026-11-01）：隔离标记随价格序列并行携带（可信链极差用）
      suspects: (p.series[0]?.points ?? []).map((pt) => pt.suspect),
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
   *  第148轮改名「时间轴同步」两行竖排、与整条时间轴块垂直居中；2026-11-03 起
   *  主产品视图同款可见，语义两视图通用）：
   *  同步 = 各图查看同一段时间，拖任一图的时间轴全部联动；非同步 = 各图时间
   *  范围独立调整（用于对齐不同上市节奏产品的可比区间） */
  const syncToggle = (
    <button
      type="button"
      aria-label="时间轴同步"
      aria-pressed={synced}
      title={synced ? '同步：各图共用一段查看时间' : '独立：各图分别调整'}
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

  // 轴列到面板内容顶的引导距离：组内对比面板 = 滚动区垫高 + 1px 上边框 + 拖柄内边距
  //（原漏算边框，组视图 0 刻度比基线高 1px）；阅读视图面板无边框无内边距 = 0
  const panelLead = reading ? 0 : SCROLL_PAD_TOP + 1 + PANEL_GRIP_H;

  // 面板渲染体前置（2026-11-02 布局重排）：明细卡要在面板行之前的独立明细行渲染，
  // 故面板体先 map 成节点数组，明细卡元素收集进 detailCards 供明细行使用。
  const detailCards = new Map<string, ReactNode>();
  const panelNodes = visiblePanels.map((p, panelIndex) => {
                      const pill = pillOf(p);
                      const row = summaryRows.find((item) => item.key === p.key);
                      // 合并单图（2026-11-04 Eason）：明细卡观察列跟随合并图共享窗口
                      //（分离面板 = 各面板生效窗口，现状不变）
                      const viewStart = mergedOn ? win.s : (effWins[p.idx]?.[0] ?? 0);
                      const brush = brushLive[p.idx] ?? brushes[p.idx] ?? null;
                      const ranged = brush != null && !!row && !row.failed;
                      const windowLo = row ? Math.min(row.windowStart, row.windowEnd) : 0;
                      const windowHi = row ? Math.max(row.windowStart, row.windowEnd) : -1;
                      const volumeSlice = row ? row.volumes.slice(windowLo, windowHi + 1) : [];
                      // 万单位档：区间内非空值全部 ≥1 万才开（混合量级开万档会把小值抹成「0万」）
                      const volumeWan = shouldUseWanUnits(volumeSlice);
                      const formatVolume = (value: number) => formatVolumeAmount(value, volumeWan);
                      // 可信链极差（2026-11-01 异常守卫）：隔离周不进极差/标注尺；
                      // 区间内有价格但全被隔离 → 空卡「区间内无可信价格」
                      const trustedPrices = row
                        ? row.prices.map((v, i) => (row.suspects[i] === 'quarantined' ? null : v))
                        : [];
                      const priceSliceHasAny = ranged && row
                        ? row.prices.slice(windowLo, windowHi + 1).some(pricePointValid)
                        : false;
                      const priceSpread = ranged && row
                        ? rangeSpreadOf(trustedPrices.slice(windowLo, windowHi + 1), pricePointValid)
                        : null;
                      const volumeSpread = ranged && row
                        ? rangeSpreadOf(row.volumes.slice(windowLo, windowHi + 1), volumePointValid)
                        : null;
                      // rangeSpreadOf 恒返回对象（无可信点时 min/max/spread 为 null），
                      // 可信极差判定必须看字段而不是对象真值——否则空卡分支不可达
                      const priceCard = priceSpread?.min != null && priceSpread.spread != null
                        ? spreadCardModel(priceSpread, (value) => formatPrice(Math.round(value), state.currency), '价格')
                        : priceSliceHasAny
                          ? spreadCardEmptyModel('价格')
                          : null;
                      const volumeCard = volumeSpread
                        ? spreadCardModel(volumeSpread, formatVolume, '销量')
                        : null;
                      const priceBand = ranged && row
                        ? rangeBandInView(trustedPrices, row.windowStart, row.windowEnd, viewStart, pricePointValid)
                        : null;
                      const volumeBand = ranged && row
                        ? rangeBandInView(row.volumes, row.windowStart, row.windowEnd, viewStart, volumePointValid)
                        : null;
                      const strip = geoms[p.idx];
                      // 阅读视图 = 全部华为面板，品牌红 × N 重复刺眼（2026-11-02 反馈）：改中性墨色系
//（价线 = ink，柱/带 = 半透明浅墨，符合「灰白+墨+单蓝强调」配色铁律）；
// 组内对比保留品牌色以区分竞品
const seriesColor = reading ? color.ink : (p.vis[0]?.color ?? brandColorOf(p.brand));
                      const cardRow = strip ? spreadCardRow(strip.plotLeft, strip.plotWidth) : null;
                      const marginPoints = marginCosts[p.idx] ?? [];
                      const marginUnavailable = marginCostAvailabilityOf(p.spec.isOwn, marginPoints) === 'empty';
                      // ---- 观察列（demo：activeIndex）：悬停列 ?? 所选区间末周 ?? 窗口末桶。
                      //      十字线、明细卡、销量柱/销毛柱高亮、成本点全部跟同一列。
                      //      合并单图：观察列 = 合并图悬停列 ?? 窗口末桶（共享窗口切片）。
                      const mPts = mergedOn ? (p.series[0]?.points ?? []).slice(win.s, win.e + 1) : null;
                      const viewLen = mergedOn ? (mPts?.length ?? 0) : (strip?.n ?? p.vis[0]?.points.length ?? 0);
                      const brushEnd = brush ? Math.max(brush[0], brush[1]) : null;
                      const hoverSeed = mergedOn ? mergedHover : (hoverIdxs[p.idx] ?? brushEnd);
                      const activeIdx = viewLen > 0
                        ? Math.min(viewLen - 1, Math.max(0, hoverSeed ?? viewLen - 1))
                        : null;
                      const activePoint = activeIdx != null
                        ? (mergedOn ? (mPts?.[activeIdx] ?? null) : (p.vis[0]?.points[activeIdx] ?? null))
                        : null;
                      const marginPoint = activeIdx != null ? marginPoints[activeIdx] ?? null : null;
                      // 隔离周成本不进图（与水位/成本柱两形态一致：价格不可信 → 成本不显示）
                      const marginPointsMasked = p.vis[0]?.points
                        ? marginPoints.map((mp, mi) => (p.vis[0]?.points[mi]?.suspect === 'quarantined' ? null : mp))
                        : marginPoints;
                      const crossX = strip && activeIdx != null ? marginCrossX(strip, activeIdx) : null;
                      // ---- 图下单周明细卡：缺采显示 —，环比只跟上一桶比，不借用相邻值。
                      //      上一桶取全量域（视图切片首桶的前一周在域内可能有值，
                      //      按切片取会把窗口首周误显成缺采「—」）。
                      // 环比对上一**可信**点（2026-11-01 异常守卫）：只跨隔离周回看
                      //（缺采周仍显示 —，维持「不借用相邻周」的既有口径），跨过时
                      // 明细卡环比旁加「跨 N 隔离周」小注
                      let prevTrustedPrice: number | null = null;
                      let wowSkip = 0;
                      const wowSkipBuckets: string[] = [];
                      if (activeIdx != null) {
                        const allPts = p.series[0]?.points ?? [];
                        for (let k = viewStart + activeIdx - 1; k >= 0; k--) {
                          const pk = allPts[k];
                          if (pk == null) break;
                          if (pk.price == null) break; // 上一桶缺采：环比 —
                          if (pk.suspect === 'quarantined') {
                            wowSkip += 1;
                            wowSkipBuckets.push(pk.bucketId);
                            continue;
                          }
                          prevTrustedPrice = pk.price;
                          break;
                        }
                      }
                      const detail = weekDetailModel({
                        granularity: state.granularity,
                        bucketId: activePoint?.bucketId ?? '',
                        xLabel: activePoint?.xLabel ?? '',
                        price: activePoint?.price ?? null,
                        rrp: activePoint?.rrp ?? null,
                        prevPrice: prevTrustedPrice,
                        volume: activeIdx != null ? (mergedOn ? (mergedVolumes[p.idx]?.[activeIdx] ?? null) : (volumes[p.idx]?.[activeIdx] ?? null)) : null,
                        marginPoint,
                        marginUnavailable,
                        formatMoney: (value) => formatPrice(Math.round(value), state.currency),
                        formatVolume,
                        wowSkip,
                        wowSkipBuckets,
                        priceSuspect: activePoint?.suspect,
                      });
                      // ---- 尺寸标注尺几何：价格尺在选区左侧、销量尺在选区右侧（demo 同位），
                      //      水平引线从极值点引到尺，极值点画空心圆
                      const slot = strip && strip.n > 0 ? strip.plotWidth / strip.n : 0;
                      const xAt = (index: number): number => (strip?.plotLeft ?? 0) + slot * (index + 0.5);
                      // 价格 Y 坐标换算随呈现走：经典 = 主图 yCfg（可断轴）；成本柱 =
                      // yCfgCost（0 基线，极值点必须落在柱顶价格帽上，两种呈现同点位语义）
                      const priceYOf = (value: number): number => yPxOf({
                        gridLeft: CHART_GRID_LEFT,
                        plotLeft: strip?.plotLeft ?? CHART_GRID_LEFT,
                        plotTop: PANEL_GRID_TOP,
                        plotWidth: strip?.plotWidth ?? 1,
                        plotHeight: (costbar ? yCfgCost : yCfg).plotHeight,
                        scale: costbar ? yCfgCost : yCfg,
                        n: strip?.n ?? 1,
                      }, value);
                      const [volumeAxisMin, volumeAxisMax] = volumeRangeOf(volumeLimits[p.key] ?? { max: null }, panelVMax[p.idx] ?? 1);
                      const volumeAxisSpan = Math.max(1, volumeAxisMax - volumeAxisMin);
                      const volumeYOf = (value: number): number => {
                        const ratio = Math.min(1, Math.max(0, (value - volumeAxisMin) / volumeAxisSpan));
                        return PANEL_GRID_TOP + yCfg.plotHeight - ratio * yCfg.plotHeight;
                      };
                      const granNoun = granNounOf(state.granularity);
                      // 面板根四边用长属性而非 border 简写：阅读态同元素仅设 borderLeft，
                      // 简写↔长属性在同一次重渲染间切换会触发 React 控制台混用警告（2026-11-01 控制台卫生）
                      const panelEdge = dropTarget === p.spec.key && draggingPanel !== p.spec.key ? color.link : color.hairline;
                      // 异常守卫裁定回调（两视图同源）：观察点打标时可用。主品视图明细卡
                      // 退役后在面板底部裁定行复用同一份（2026-11-03 改版），组视图仍在卡内
                      const canExempt = !!activePoint?.suspect && activePoint.suspect !== 'exempted' && activePoint.price != null;
                      const canIsolate = activePoint?.suspect === 'pending' && activePoint.price != null;
                      return (
                      <div
                        key={p.key}
                        className="lpl-volume-panel"
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
                          // 内部 z 序（极差卡 z30 等）封在面板内：横滚时不越过 sticky 轴列
                          isolation: 'isolate',
                          minWidth: 0,
                          borderLeft: panelIndex > 0 ? `1px solid ${color.hairline}` : undefined,
                        } : {
                          borderTop: `1px solid ${panelEdge}`,
                          borderRight: `1px solid ${panelEdge}`,
                          borderBottom: `1px solid ${panelEdge}`,
                          borderLeft: `1px solid ${panelEdge}`,
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
                        {/* 图表元信息行（视觉 demo：chart-meta）：左 = 图例，右 = 所选区间
                            胶囊（含清除）；无选区时右侧留空（拖动提示语已删，2026-11-02 Eason）。定高
                            PANEL_META_ROW_H——共享轴列按同一常量上偏移，刻度才与绘图区对齐 */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, height: PANEL_META_ROW_H, overflow: 'hidden', padding: '0 4px', margin: '4px 0 8px' }}>
                          {/* 图例（2026-11-05 整改2）：全部项可点击切换对应图表元素显隐
                              （隐藏态降透明 = 全站图例语言）；状态存会话态 volume.legendOff */}
                          <div role="group" aria-label="图例（点击切换元素显隐）" style={{ display: 'flex', alignItems: 'center', gap: 14, color: color.mute, fontSize: 11, lineHeight: '14px', flexWrap: 'nowrap', minWidth: 0, overflow: 'hidden' }}>
                            {costbar ? (
                              <>
                                <LegendToggleItem
                                  label="折后价"
                                  off={legendOffOf('cbPrice')}
                                  onToggle={() => toggleLegend('cbPrice')}
                                  glyph={<span aria-hidden style={{ width: 10, height: 12, borderRadius: 1, background: hexToRgba(seriesColor, 0.15), boxShadow: `inset 0 0 0 1.5px ${seriesColor}` }} />}
                                />
                                <LegendToggleItem
                                  label="成本"
                                  off={legendOffOf('cbCost')}
                                  onToggle={() => toggleLegend('cbCost')}
                                  glyph={<span aria-hidden style={{ width: 14, height: 2, background: color.mute }} />}
                                />
                                <LegendToggleItem
                                  label="销量"
                                  off={legendOffOf('cbVolume')}
                                  onToggle={() => toggleLegend('cbVolume')}
                                  glyph={<span aria-hidden style={{ width: 14, height: 1.5, background: selectAccent }} />}
                                />
                                <LegendToggleItem
                                  label={marginLineOn ? '销毛率（顶部线 · 标注最高/最低/最新）' : '销毛率（下垂）'}
                                  off={legendOffOf('cbMargin')}
                                  onToggle={() => toggleLegend('cbMargin')}
                                  glyph={<span aria-hidden style={marginLineOn ? { width: 14, height: 0, borderTop: '2px dashed #f5a623' } : { width: 8, height: 10, borderRadius: 1, background: 'rgba(245, 166, 35, 0.32)' }} />}
                                />
                              </>
                            ) : (
                              <>
                                {state.priceTypes.discounted && (
                                  <LegendToggleItem
                                    label="折后价"
                                    off={legendOffOf('discounted')}
                                    onToggle={() => toggleLegend('discounted')}
                                    glyph={<span aria-hidden style={{ width: 16, height: 2, background: seriesColor }} />}
                                  />
                                )}
                                {state.priceTypes.rrp && (
                                  <LegendToggleItem
                                    label="RRP"
                                    off={legendOffOf('rrp')}
                                    onToggle={() => toggleLegend('rrp')}
                                    glyph={<span aria-hidden style={{ width: 16, height: 1, background: seriesColor, opacity: 0.85 }} />}
                                  />
                                )}
                                <LegendToggleItem
                                  label="销量"
                                  off={legendOffOf('volume')}
                                  onToggle={() => toggleLegend('volume')}
                                  glyph={<span aria-hidden style={{ width: 8, height: 9, borderRadius: 1, background: seriesColor, opacity: 0.22 }} />}
                                />
                              </>
                            )}
                          </div>
                        </div>
                        {/* 主图 + 成本销毛带同一相对容器：十字线贯穿两图（demo：crosshair） */}
                        <div style={{ position: 'relative' }}>
                        {/* 所选区间胶囊（含清除）：居中悬浮在所选区间顶部（2026-11-02 Eason：原放元信息行
                            右上角太隐晦）；横向钳在绘图区内，zIndex 压过极差卡，可点 */}
                        {ranged && brush && row && strip && (() => {
                          const slot = strip.plotWidth / Math.max(1, strip.n);
                          const lo = Math.min(brush[0], brush[1]);
                          const hi = Math.max(brush[0], brush[1]);
                          const half = 76;
                          const cx = Math.min(strip.plotLeft + strip.plotWidth - half, Math.max(strip.plotLeft + half, strip.plotLeft + slot * ((lo + hi + 1) / 2)));
                          return (
                            <span
                              className="tnum lpl-brush-capsule"
                              style={{
                                position: 'absolute', top: -2, left: cx, transform: 'translateX(-50%)', zIndex: 31,
                                display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 24, padding: '2px 4px 2px 10px',
                                border: '1px solid rgba(0, 112, 243, 0.35)', borderRadius: radius.pill,
                                background: selectSoft, color: selectSoftInk, fontSize: 11, lineHeight: '16px',
                                fontFamily: font.family, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
                                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.06)',
                              }}
                            >
                              {detailDateOf(state.granularity, p.vis[0]?.points[lo]?.xLabel ?? '')} — {detailDateOf(state.granularity, p.vis[0]?.points[hi]?.xLabel ?? '')}
                              <button
                                type="button"
                                aria-label="清除所选区间"
                                title="清除所选区间"
                                className="lpl-hit"
                                onClick={() => onBrushChangeOf(p.idx)(null, true)}
                                style={{ display: 'inline-grid', placeItems: 'center', width: 20, height: 20, padding: 0, border: 0, borderRadius: radius.pill, background: 'transparent', color: selectSoftInk, fontSize: 12, lineHeight: 1, cursor: 'pointer' }}
                              >
                                ×
                              </button>
                            </span>
                          );
                        })()}
                        {/* 双极差卡（2026-11-02 反馈④）：悬浮在图表顶部表面、不占布局高度——
                            absolute 贴绘图区顶缘下让出胶囊一行，pointerEvents 关闭以免挡住下方拖选/悬停 */}
                        {(priceCard?.visible || volumeCard?.visible) && strip && cardRow && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', width: strip.plotWidth, position: 'absolute', top: PANEL_GRID_TOP + 14, left: strip.plotLeft, zIndex: 30, pointerEvents: 'none' }}>
                            {priceCard?.visible
                              ? <SpreadRangeCard title="价格极差" accent={seriesColor} model={priceCard} style={{ width: cardRow.width }} />
                              : <span />}
                            {volumeCard?.visible
                              ? <SpreadRangeCard title="销量极差" accent={seriesColor} model={volumeCard} style={{ width: cardRow.width }} />
                              : <span />}
                          </div>
                        )}
                          <div
                            className="lpl-volume-stack"
                            tabIndex={0}
                            role="group"
                            aria-label={`${p.name}量价与成本销毛对照图。左右方向键切换观察${granNoun}，拖动鼠标选择区间。`}
                            aria-describedby={detail.visible ? `volume-detail-${p.idx}` : undefined}
                            onKeyDown={(event) => {
                              if (viewLen <= 0 || activeIdx == null) return;
                              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                              event.preventDefault();
                              const next = event.key === 'Home'
                                ? 0
                                : event.key === 'End'
                                  ? viewLen - 1
                                  : event.key === 'ArrowLeft'
                                    ? Math.max(0, activeIdx - 1)
                                    : Math.min(viewLen - 1, activeIdx + 1);
                              onHoverOf(p.idx)(next);
                            }}
                            style={{ position: 'relative' }}
                          >
                          {costbar ? (
                            <CostBarChart
                              geom={geoms[p.idx] ?? null}
                              plotTop={PANEL_GRID_TOP}
                              plotHeight={yCfgCost.plotHeight}
                              yScale={yCfgCost}
                              points={p.vis[0]?.points ?? []}
                              costPoints={marginUnavailable ? [] : marginPointsMasked}
                              volumes={volumes[p.idx]}
                              volumeAxisMax={volumeAxisMax}
                              rateAxisMax={costRateAxisMax}
                              marginLineOn={marginLineOn}
                              granularity={state.granularity}
                              hidePrice={legendOffOf('cbPrice')}
                              hideCost={legendOffOf('cbCost')}
                              hideVolume={legendOffOf('cbVolume')}
                              hideMargin={legendOffOf('cbMargin')}
                              currency={state.currency}
                              seriesColor={seriesColor}
                              focusIdx={activeIdx}
                              selectionBand={ranged && brush ? { startIndex: brush[0], endIndex: brush[1] } : null}
                              onGeom={onGeomOf(p.idx)}
                              name={p.name}
                              emptyHint={p.failed ? LOAD_ERROR_HINT : '该产品在所选时间范围内无数据'}
                            />
                          ) : (
                            <>
                              <VolumeBars
                                geom={geoms[p.idx] ?? null}
                                plotTop={PANEL_GRID_TOP}
                                plotHeight={yCfg.plotHeight}
                                values={legendOffOf('volume') ? [] : volumes[p.idx]}
                                vMax={panelVMax[p.idx]}
                                color={seriesColor}
                                hoverIdx={activeIdx}
                                axisLimits={volumeLimits[p.key] ?? { max: null }}
                                onAxisLimit={(kind, value) => onVolumeAxisLimit(p.key, kind, value, panelVMax[p.idx] ?? 1)}
                                selectionBand={ranged && brush ? { startIndex: brush[0], endIndex: brush[1] } : null}
                              />
                              <Chart
                                series={reading ? p.vis.map((series) => ({ ...series, color: seriesColor })) : p.vis}
                            granularity={state.granularity}
                            currency={state.currency}
                            // 图例显隐只影响本图渲染（整改2）：经典价格线按 图例∩全局 口径，
                            // 不回写顶部筛选条的 priceTypes
                            priceTypes={classicPriceTypes}
                            gridLeft={CHART_GRID_LEFT}
                            gridRight={CHART_GRID_RIGHT}
                            gridTop={PANEL_GRID_TOP}
                            chrome={false}
                            axisChrome={false}
                            showYTicks={showYTicks}
                            showTiers={showTiers}
                            enableDrill={false}
                            windowKey={`${effWins[p.idx][0]}:${effWins[p.idx][1]}:${p.key}`}
                            yScale={yCfg}
                            hideNamePills
                            lineShape={lineShape}
                            labelMode={labelMode}
                            markExtremes={false}
                            showXLabels
                            crosshairY={crossY}
                            externalCrosshair
                            onGeom={onGeomOf(p.idx)}
                            emptyHint={p.failed ? LOAD_ERROR_HINT : '该产品在所选时间范围内无数据'}
                          />
                            </>
                          )}
                          {/* 指针承接层：悬停列 / 拖选区间 / 横向参考位统一从面板接管 */}
                          {strip && !p.failed && viewLen > 0 && (
                            <PointerShield
                              plotLeft={strip.plotLeft}
                              plotTop={PANEL_GRID_TOP}
                              plotWidth={strip.plotWidth}
                              plotHeight={yCfg.plotHeight}
                              extraBottom={marginOn ? 60 : GRID.bottom}
                              n={viewLen}
                              onHover={onHoverOf(p.idx)}
                              onBrush={onBrushChangeOf(p.idx)}
                              onCrossY={setCrossY}
                            />
                          )}
                          {/* 极值点标识（2026-11-01 晚反馈定稿；2026-11-03 扩展到成本柱呈现）：
                              选中区间内标出价格最高/最低（同心双环）与销量最高/最低（白芯菱形）
                              的位置——形状语言与价格走势页同源，两种呈现共用 PanelExtremeMarks；
                              title 报「锚日 + 极值类别 + 数值」。点位可悬停（g 自带命中），svg
                              根仍不承接指针；zIndex 5 需在指针承接层之上 title 才可达。
                              经典呈现保留观察点空心圆；成本柱的观察点圆由 CostBarChart 自绘 */}
                          {strip && ranged && slot > 0 && (
                            <svg aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 5, overflow: 'visible' }}>
                              <PanelExtremeMarks
                                priceBand={priceBand}
                                volumeBand={volumeBand}
                                priceSpreadValue={priceSpread?.spread ?? null}
                                volumeSpreadValue={volumeSpread?.spread ?? null}
                                xAt={xAt}
                                priceYOf={priceYOf}
                                volumeYOf={volumeYOf}
                                seriesColor={seriesColor}
                                formatPriceText={(value) => formatPrice(Math.round(value), state.currency)}
                                formatVolumeText={formatVolume}
                                labelOf={(index) => detailDateOf(state.granularity, p.vis[0]?.points[index]?.xLabel ?? '')}
                              />
                              {!costbar && activePoint?.price != null && activeIdx != null && (
                                <circle cx={xAt(activeIdx)} cy={priceYOf(activePoint.price)} r={4} fill={color.canvas} stroke={seriesColor} strokeWidth={1.5} />
                              )}
                            </svg>
                          )}
                          {/* 悬停浮窗（2026-11-03 主品视图改版）：明细卡行退役后主品观察列的
                              时点读数收进本浮窗（组视图仍走图下明细卡）。跟随悬停列、右缘左翻，
                              无悬停不渲染；键盘 ←/→ 走悬停通路，读数经 aria-describedby 关联 */}
                          {reading && strip && crossX != null && hoverIdxs[p.idx] != null && detail.visible && (
                            <PanelHoverTip
                              model={detail}
                              showMargin={marginOn}
                              x={crossX}
                              plotLeft={strip.plotLeft}
                              plotWidth={strip.plotWidth}
                              // 选区激活时双极差卡悬浮在绘图区顶缘（top 14 + 高 92）：浮窗压到
                              // 其下，避免同角重叠；无选区时贴绘图区顶空气带
                              top={PANEL_GRID_TOP + (ranged ? SPREAD_CARD_H + 26 : 4)}
                              summaryId={`volume-detail-${p.idx}`}
                            />
                          )}
                          </div>
                          {crossX != null && (
                            <div aria-hidden style={{ position: 'absolute', left: Math.round(crossX) - 0.5, top: PANEL_GRID_TOP, bottom: 0, width: 1, background: color.hairlineStrong, pointerEvents: 'none', zIndex: 4 }} />
                          )}
                        </div>
                        {/* 图下明细卡 = 组视图承载（2026-11-03 主品视图改版）：主品视图退役
                            明细卡行，时点读数改走悬停浮窗；组视图明细卡仍是组内主参照，
                            身份区 = 紧凑胶囊（点击隐藏，暂存条恢复）——原「同步店铺」钮与
                            DNS 店铺 chip 已随 2026-11-05 平台口径收口退役（取价口径统一
                            走顶部筛选条的全局平台筛选器）。「本组对比」入口在主品视图
                            控制区，卡片不再挂 */}
                        {/* 明细卡收集进 detailCards（JSX children 内的语句容器：
                            IIFE 执行 set、渲染 null——set 的返回值是 Map，
                            直接渲染会触发 React 对可迭代对象的展开报错） */}
                        {(() => {
                          if (reading) return null;
                          detailCards.set(
                            p.spec.key,
                            <WeekDetailCard
                            model={detail}
                            identity={
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0, maxWidth: '100%' }}>
                                {/* 单行身份胶囊：品牌点 + 产品名 + 配置 chip；点击 = 隐藏面板
                                    （暂存条可恢复）。className 保留 lpl-lg-pill——隐藏/恢复的
                                    焦点承接按它定位（panelPillHostRefs 消费处） */}
                                <span ref={(el) => registerPanelPillHost(p.spec.key, el)} style={{ display: 'inline-flex', minWidth: 0, maxWidth: '100%' }}>
                                  <button
                                    type="button"
                                    className="lpl-lg-pill"
                                    title="点击隐藏该产品"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      hidePanel(p.spec.key);
                                    }}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 5,
                                      maxWidth: '100%',
                                      padding: '3px 9px 3px 8px',
                                      border: `1px solid ${color.hairline}`,
                                      borderRadius: radius.pill,
                                      background: color.canvas,
                                      font: 'inherit',
                                      minWidth: 0,
                                      cursor: 'pointer',
                                    }}
                                  >
                                    <BrandDot brand={p.brand} />
                                    <span
                                      title={pill.text}
                                      style={{
                                        fontSize: 12,
                                        lineHeight: '16px',
                                        fontWeight: 600,
                                        color: color.ink,
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                      }}
                                    >
                                      {pill.nameText}
                                    </span>
                                    {pill.romText && (
                                      <span
                                        style={{
                                          flexShrink: 0,
                                          fontSize: 10,
                                          lineHeight: '14px',
                                          fontWeight: 600,
                                          padding: '0 6px',
                                          borderRadius: radius.pill,
                                          color: selectSoftInk,
                                          background: selectSoft,
                                          whiteSpace: 'nowrap',
                                        }}
                                      >
                                        {pill.romText}
                                      </span>
                                    )}
                                  </button>
                                </span>
                              </span>
                            }
                            summaryId={`volume-detail-${p.idx}`}
                            showMargin={marginOn}
                            onExempt={canExempt ? () => markPanelPoint(p, activePoint, 'exempt') : undefined}
                            onIsolate={canIsolate ? () => markPanelPoint(p, activePoint, 'isolate') : undefined}
                            />
                          );
                          return null;
                        })()}
                        {/* 主品视图异常守卫裁定行（2026-11-03）：明细卡退役后，待核对/被隔离
                            观察点的「确认真实价格 / 标记异常」保留在面板底部——仅在观察点
                            打标时出现，平时不占布局（组视图走明细卡内同名行，口径同源） */}
                        {reading && (canExempt || canIsolate) && (
                          <div style={{ margin: '6px 12px 0' }}>
                            <SuspectActions
                              suspect={activePoint?.suspect}
                              onExempt={canExempt ? () => markPanelPoint(p, activePoint, 'exempt') : undefined}
                              onIsolate={canIsolate ? () => markPanelPoint(p, activePoint, 'isolate') : undefined}
                            />
                          </div>
                        )}
                        {/* 脚注行已删（2026-11-02 Eason：图上不要解释性用语）；本图时间轴
                            （第一百二十三轮起同步/非同步恒在，位置对齐绘图区左右缘）：
                            同步 = 全图查看同一段时间，拖任一条同步调整；非同步 = 各图独立调整。
                            恒渲染保证切换同步只改联动行为，面板高度与轨道横向位置不变 */}
                        <div style={{ margin: `12px ${CHART_GRID_RIGHT}px 6px 8px` }}>
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
  });
  // ---- 主品视图顶部控制区数据（2026-11-03 改版；2026-11-05 整改1 收口）----
  // 产品显隐药丸带：只放**可见面板**（展示序）——隐藏产品移入 HiddenVault 收纳区，
  // 不再占带内格，胶囊带列数 = 可见面板数与面板网格完全一致（逐格居中对齐）；
  // nameText/romText 与明细卡身份区同源（pillOf）。原 DNS 店铺 chip 字段随
  // 2026-11-05 每卡选店退役一并删除。
  const mainBandItems = reading
    ? visiblePanels.map((p) => {
        const pill = pillOf(p);
        return {
          key: p.spec.key,
          brand: p.brand,
          name: p.name,
          nameText: pill.nameText,
          romText: pill.romText,
          hidden: false,
        };
      })
    : [];
  // 收纳区清单（主品视图）：被隐藏产品按展示序排（恢复后胶囊回面板网格原列位）
  const vaultItems = reading
    ? orderedPanels
      .filter((p) => hiddenSet.has(p.spec.key))
      .map((p) => {
        const pill = pillOf(p);
        return { key: p.spec.key, brand: p.brand, nameText: pill.nameText, romText: pill.romText };
      })
    : [];
  // 「本组对比」入口随格（2026-11-04 Eason 看图反馈）：每张有对比区的主品卡一枚，
  // 挂主品控制带对应胶囊组之后（面板 key 对位，不再堆工具行最右端——多卡时逐格
  // 就位、不再互相堆叠）；语义 = switchViewMode 到该卡组视图。价格走势「多平台
  // 对比」同款轻量文字钮不变。
  const compareEntries = reading
    ? (() => {
      const map = new Map<string, ReactNode>();
      for (const p of orderedPanels) {
        const card = state.mains.find((item) => item.id === p.spec.cardId);
        if (!card?.main || card.compares.length === 0) continue;
        map.set(p.spec.key, (
          <GroupCompareEntry
            name={p.name}
            count={card.compares.length}
            onEnter={() => switchViewMode({ kind: 'group', cardId: card.id })}
          />
        ));
      }
      return map;
    })()
    : new Map<string, ReactNode>();

  // 销毛成本开关（2026-11-03 Eason 反馈：上移工具行、与齿轮/⋯ 同簇——
  // 原位置在明细卡行左侧的轴列缩进里，独自占一行左侧留白且与齿轮不对齐）
  const marginCtl = (
    <button
      type="button"
      aria-pressed={marginOn}
      aria-label={marginOn ? '隐藏销毛成本' : '显示销毛成本'}
      aria-disabled={marginLocked || undefined}
      title={marginLocked ? '本组对比下不显示销毛成本' : marginOn ? '显示中：成本柱呈现；点击回到纯量价图' : '显示销毛成本：切到成本柱呈现'}
      onClick={toggleMargin}
      style={{
        height: 24,
        padding: '0 8px',
        border: `1px solid ${marginOn ? color.link : color.hairline}`,
        borderRadius: radius.control,
        background: marginOn ? selectSoft : color.canvas,
        color: marginLocked ? color.mute : marginOn ? selectSoftInk : color.body,
        font: 'inherit',
        fontSize: 11,
        fontWeight: 600,
        lineHeight: '22px',
        cursor: marginLocked ? 'not-allowed' : 'pointer',
        whiteSpace: 'nowrap',
        opacity: marginLocked ? 0.55 : 1,
        flexShrink: 0,
      }}
    >
      销毛成本
    </button>
  );

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
            {/* 已隐藏托盘（2026-11-02 反馈④）：置顶于齿轮行上方——组视图仍走「明细卡
                药丸点击隐藏 → 暂存条恢复」的焦点承接链路；主品视图（2026-11-03 改版）
                药丸常驻上方控制区、显隐同位切换，不再出暂存条（全隐藏走空态「全部恢复」） */}
            {!reading && trayItems.length > 0 && (
              <div style={{ marginBottom: space.sm }}>
                <HiddenTray items={trayItems} onRestore={restorePanel} onRestoreAll={restoreAllPanels} registerItem={registerTrayItem} />
              </div>
            )}
            {/* 工具行（2026-11-02 反馈②；2026-11-03 主品视图改版）：主品视图 = 齿轮簇（左）
                + 产品显隐药丸带与 DNS 店铺 chip（中区 legend 槽）+ 「进入本组对比」轻量
                文字钮（行尾 compareEntry 槽，价格走势「多平台对比」同款同位——一体性）；
                组视图 = 齿轮簇（左）与组内切换（中段），明细卡身份区照旧承载药丸/店铺 chip。
                （2026-11-03 五条反馈：经典|成本柱呈现切换已退役，销毛成本开关 = 呈现总开关） */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '0 6px', marginBottom: 2 }}>
              <div style={reading ? { flex: '1 1 auto', minWidth: 0 } : { flex: '0 0 auto' }}>
                <ChartToolbar
                  currency={state.currency}
                  sliderScale={sliderScale}
                  onSliderScale={setSliderScale}
                  showYTicks={showYTicks}
                  showTiers={marginOn ? true : showTiers}
                  showTiersToggle={!marginOn}
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
                  anomalySlot={<AnomalyQualityChip page="volume" />}
                  priceTypesAfter={
                    /* 「销毛成本」右侧专用收纳区（2026-11-05 整改1②）：主品视图隐藏
                       产品以迷你芯片直显（>3 枚收缩为 +N），点击恢复面板显示（胶囊回
                       原列位）；「全部恢复」并入收纳区。组视图不出（暂存条行为不变） */
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      {marginCtl}
                      {reading && vaultItems.length > 0 && (
                        <>
                          <span aria-hidden style={{ width: 1, height: 16, background: color.hairline, flexShrink: 0 }} />
                          <HiddenVault items={vaultItems} onRestore={restorePanel} onRestoreAll={restoreAllPanels} registerItem={registerVaultItem} />
                        </>
                      )}
                    </div>
                  }
                  /* 主品控制带（胶囊 + 本组对比入口）2026-11-04 下移到面板上方的
                     胶囊带行（按面板位置对齐），不再占工具行 legend/compareEntry 槽 */
                  presentationSlot={marginOn ? (
                    <Segmented
                      size="small"
                      aria-label="销毛呈现方式"
                      value={marginLineOn ? 'line' : 'bars'}
                      onChange={(v) => setMarginLineOn(v === 'line')}
                      options={[
                        { label: '下垂柱', value: 'bars' },
                        { label: '顶部销毛线', value: 'line' },
                      ]}
                    />
                  ) : safeViewMode.kind === 'group' ? (
                    // 纯量价 + 组内对比：面板呈现二式（2026-11-04 Eason）——分离面板（默认）
                    // | 合并单图；主品视图不出本槽（合并仅组内对比适用）
                    <Segmented
                      size="small"
                      aria-label="面板呈现方式"
                      value={mergedCompare ? 'merged' : 'split'}
                      onChange={(v) => setMergedCompare(v === 'merged')}
                      options={[
                        { label: '分离面板', value: 'split' },
                        { label: '合并单图', value: 'merged' },
                      ]}
                    />
                  ) : undefined}
                />
              </div>
              {/* 中段：组内对比切换（仅组视图渲染）——同一量价卡内的次级视图，一次只看一组。
                  2026-11-04（Eason 看图反馈）：组别切换改页签形式——价格走势明细表
                  「产品组」页签同款（文字 + 当前组墨色下划线，lpl-chart-tab），页签名
                  = 该组主品展示名（不再「第 N 组」编号按钮）；「返回主产品视图」保留
                  页签行左端。主品视图本段不渲染：中区让位给主品控制带（胶囊带行） */}
              {safeViewMode.kind === 'group' && (
                <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', justifyContent: 'center' }}>
                  <nav aria-label="组内对比切换" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'center', gap: 18 }}>
                    <button
                      type="button"
                      onClick={() => switchViewMode({ kind: 'mains' })}
                      className="lpl-chart-tab"
                      style={{
                        height: 32, marginBottom: -1, padding: '0 2px',
                        border: 'none', borderBottom: '2px solid transparent',
                        background: 'transparent', font: 'inherit', fontSize: 13,
                        color: color.body, cursor: 'pointer', whiteSpace: 'nowrap',
                      }}
                    >
                      ← 返回主产品视图
                    </button>
                    <div role="tablist" aria-label="产品组" style={{ display: 'flex', alignItems: 'flex-end', gap: 18, borderBottom: `1px solid ${color.hairline}` }}>
                      {state.mains.filter((card): card is typeof card & { main: NonNullable<typeof card.main> } => card.main != null).map((card, index) => {
                        const active = safeViewMode.cardId === card.id;
                        // 页签名 = 该组主品展示名（型号 + 配置；与面板头/胶囊同源口径）
                        const tabName = resolveSlot(card.main, cc)?.name ?? card.main.modelId;
                        return (
                          <button
                            key={card.id}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            title={`第 ${index + 1} 组：${tabName}`}
                            onClick={() => switchViewMode({ kind: 'group', cardId: card.id })}
                            className="lpl-chart-tab"
                            style={{
                              height: 32,
                              marginBottom: -1,
                              padding: '0 2px',
                              border: 'none',
                              borderBottom: `2px solid ${active ? color.ink : 'transparent'}`,
                              background: 'transparent',
                              font: 'inherit',
                              fontSize: 13,
                              fontWeight: active ? 600 : 400,
                              color: active ? color.ink : color.body,
                              cursor: 'pointer',
                              whiteSpace: 'nowrap',
                              transition: 'color 160ms ease, border-color 160ms ease, background-color 160ms ease',
                            }}
                          >
                            {tabName}
                          </button>
                        );
                      })}
                    </div>
                  </nav>
                </div>
              )}
            </div>
            {/* 面板区（2026-11-02 结构重排，Eason 三条反馈）：单一横滚容器内两行——
                行 1 = 明细卡行：左侧按轴列宽留白（卡片左边不再有刻度），列宽与面板网格完全一致；
                行 2 = [共享 Y 轴列（sticky 钉左）][面板网格]。>3 个面板时两行同一轨道宽
                （N/3 × 可用宽）一起横滚、轴列钉住不动；轴刻度按「面板顶 + 图例行定高」对齐绘图区。
                第一百二十六轮：轴列纵向撑满面板区，「同步」开关落列底、与各面板时间轴同一水平线。
                第一百八十二轮：窄视口在卡内横向拖动（minWidth 880 保面板可读下限）。
                全隐藏空态时不渲染轴列——computeYAxis 走 0-100 空数据兜底，默认刻度与空态并排反而误导 */}
            {(() => {
              const axisW = visibleCount > 0 ? splitAxisWidth(state.currency, showYTicks, effShowTiers) : 0;
              const lead = axisW > 0 ? axisW + space.md : 0;
              const trackRatio = visibleCount > 0 ? visibleCount / Math.min(visibleCount, 3) : 1;
              const trackWidth = `calc(${lead}px + ${trackRatio} * (100% - ${lead}px))`;
              // 列模板 single-source（2026-11-05 整改1①）：明细卡行 / 胶囊带 / 面板网格
              // 三处必须同一条字符串、同一个 gap——胶囊带逐格居中对齐的结构化保证
              const gridCols = panelGridCols(visibleCount);
              const gridGap = reading ? 0 : space.md;
              const emptyBoxStyle = {
                padding: '48px 0',
                textAlign: 'center' as const,
                fontSize: fontSize.bodySm,
                color: color.mute,
                border: `1px dashed ${color.hairline}`,
                borderRadius: radius.card,
              };
              // 明细卡行（组视图主参照）：分离/合并两呈现共用——合并态观察列跟随合并图。
              // offset = 共享轴列宽偏移（2026-11-04 Eason 看图反馈：数据卡要与各面板
              // 对齐——行起点 = 轴列宽 + 列距，与面板网格同一起点；合并单图无轴列 = 0）
              const detailRow = (offset: number) => detailCards.size > 0 ? (
                <div style={{ marginBottom: space.sm, marginLeft: offset }}>
                  <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: gridGap }}>
                    {[...detailCards.values()].map((card, i) => (
                      <div
                        key={visiblePanels[i]?.spec.key ?? i}
                        style={{ containerType: 'inline-size', minWidth: 0, padding: reading ? '0 12px' : 0 }}
                      >
                        {card}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null;
              return (
                <div className="lpl-card-scroll" style={{ overflowX: 'auto', marginBottom: space.sm }}>
                  <div style={{ minWidth: 880, width: trackWidth }}>
                    {/* 主品控制带行（2026-11-04 Eason 看图反馈；2026-11-05 整改1① 收口）：
                        胶囊组 + 「本组对比」入口按面板位置对齐——只放**可见面板**胶囊，
                        gridColumns = 可见面板数（panelGridCols 与面板网格同一条模板
                        字符串）、同 gap、同轴列偏移（marginLeft lead），每个胶囊组
                        居中于其面板正上方；隐藏产品在收纳区，恢复后回原列位。随面板
                        横滚区一起滚动，列位恒对齐 */}
                    {reading && panelCount > 0 && (
                      <div style={{ marginBottom: space.sm, marginLeft: lead }}>
                        <MainControlBand
                          items={mainBandItems}
                          entries={compareEntries}
                          gridColumns={Math.max(1, visibleCount)}
                          gridGap={gridGap}
                          onToggle={hideFromBand}
                          registerHost={registerPanelPillHost}
                        />
                      </div>
                    )}
                    {panelCount === 0 ? (
                      <div style={emptyBoxStyle}>在上方筛选器选择产品后，这里按所选产品铺开量价走势</div>
                    ) : visibleCount === 0 ? (
                      // 全隐藏空态（设计 §4.A.5）：允许隐藏到零，虚线框空态 + 居中「全部恢复」
                      // 出口；此时暂存条不再重复渲染
                      <div style={emptyBoxStyle}>
                        已隐藏全部产品
                        <div style={{ marginTop: 12 }}>
                          <button
                            type="button"
                            ref={emptyRestoreRef}
                            onClick={restoreAllPanels}
                            style={{
                              height: 28,
                              padding: '0 16px',
                              border: `1px solid ${color.hairline}`,
                              borderRadius: radius.control,
                              background: color.canvas,
                              color: color.ink,
                              font: 'inherit',
                              fontSize: fontSize.caption,
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            全部恢复
                          </button>
                        </div>
                      </div>
                    ) : mergedOn ? (
                      // 合并单图（2026-11-04 Eason）：组内产品合并全宽单图——内建量/价双轴
                      // 与完整 X 轴（axisTickPlan 日历周口径），不再走 SplitAxisColumn +
                      // 面板网格；面板级时间轨与「同步」开关在合并态隐藏（合并图自带完整
                      // X 轴，查看窗口沿用共享窗口）；明细卡行照旧保留（无轴列，不偏移）
                      <>
                        {detailRow(0)}
                        <MergedCompareChart
                          products={mergedProducts}
                          bucketIds={domainIds.slice(win.s, win.e + 1)}
                          granularity={state.granularity}
                          currency={state.currency}
                          volumeAxisMax={mergedVMax}
                          formatVolume={mergedFormatVolume}
                          plotHeight={yCfg.plotHeight}
                          focusIdx={mergedHover}
                          onHover={setMergedHover}
                        />
                      </>
                    ) : (
                      <>
                        {/* 明细信息行：紧跟工具行，每面板一张明细卡正对其面板。
                            （2026-11-03 Eason 反馈曾去轴列缩进；2026-11-04 看图反馈
                            恢复对齐——行起点计入共享轴列宽 + 列距，卡片列与面板列
                            逐列对齐） */}
                        {detailRow(lead)}
                        <div style={{ display: 'flex', alignItems: 'stretch', gap: space.md }}>
                          <div
                            style={{
                              position: 'sticky',
                              left: 0,
                              zIndex: 3,
                              flex: `0 0 ${axisW}px`,
                              background: color.canvas,
                              // 面板顶 → 图例元信息行（定高）→ 绘图区：轴列按同一常量上偏移，
                              // 刻度与绘图区逐像素对齐（0 刻度落在成本柱 X 轴基线上）
                              paddingTop: panelLead + PANEL_META_H,
                              display: 'flex',
                              flexDirection: 'column',
                            }}
                          >
                            <SplitAxisColumn
                              yScale={marginOn ? yCfgCost : yCfg}
                              currency={state.currency}
                              industry={state.industry}
                              gridLeft={estGridLeft(state.currency, showYTicks, effShowTiers)}
                              panelGridTop={PANEL_GRID_TOP}
                              showYTicks={showYTicks}
                              showTiers={effShowTiers}
                              tierValues={tierValues}
                              belowTicks={marginOn && !marginLineOn ? costRateTicks : undefined}
                            />
                            <div style={{ flex: 1 }} />
                            {/* 与时间轴轨道带对中（2026-11-05 整改3）：开关承载盒复刻轨道带
                                几何（同 TRACK_BLOCK_H 块 + marginBottom 6，承载盒 = top 0 /
                                高 TRACK_RAIL_H 与 PanelTimeTrack 的 rail 同值），盒内 flex
                                居中——按钮中心恒等于轨道带中心，不再依赖按钮自身高度
                                （原 top -5 魔法数随高度漂移，已退役）；两侧行几何由常量
                                保证（轨道下说明行已删，2026-11-02 Eason） */}
                            {buckets.length > 0 && visUnion.length > 0 && (
                              <div style={{ height: TRACK_BLOCK_H, marginBottom: 6, position: 'relative', flexShrink: 0 }}>
                                <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: TRACK_RAIL_H, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  {syncToggle}
                                </div>
                              </div>
                            )}
                          </div>
                          {/* 并排上限 3（第一百八十轮，Eason：与价格看板同规则）——≤3 个按个数
                              均分一行；>3 个不折行，横向拖动查看（每格恒为视口 1/3 宽）。
                              第一百九十一轮：渲染序 = 拖拽换位序（orderedPanels）；
                              2026-11-01 显隐改版：渲染前按隐藏集过滤，列数按可见数重算 */}
                          <div
                            style={{
                              flex: '1 1 0',
                              minWidth: 0,
                              display: 'grid',
                              gridTemplateColumns: gridCols,
                              gap: gridGap,
                              padding: `${reading ? 0 : SCROLL_PAD_TOP}px 0 0`,
                            }}
                          >
                            {panelNodes}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })()}
            {/* 补充图（2026-11-03 Eason 复盘：销毛成本已由成本柱模式在主面板承担，
                独立销毛图撤下——组件保留给量价预测页；库存 · DOS 独立图全宽呈现，
                跟随全窗口口径（与顶部摘要一致），不进面板横滚轨道 */}
            {(() => {
              const own = panelViews.find((p) => p.spec.isOwn && !hiddenSet.has(p.spec.key));
              if (!own || domainIds.length === 0) return null;
              // X 轴标签（2026-11-05 整改3 审计修正）：改传 shortBucketLabel 日历格式
              //（周 = 2026W33、月 = MM、季 = Qn，与主图/价格走势页同源）——原传
              // bucket.xLabel（周 = 周三 MM-DD）与量价图轴格式不一致
              const labels = buckets.map((b) => shortBucketLabel(state.granularity, b.id));
              const ownVolumes = summaryVolumes[own.idx] ?? [];
              return (
                <div style={{ marginTop: space.xs, marginBottom: space.sm }}>
                  <InventoryDosCard
                    name={own.name}
                    bucketLabels={labels}
                    points={inventoryDemoOf({
                      modelId: own.spec.modelId,
                      romram: own.spec.romram,
                      countryCode: cc,
                      granularity: state.granularity,
                      bucketIds: domainIds,
                      volumes: ownVolumes,
                    })}
                  />
                </div>
              );
            })()}
      </div>

      {/* 已隐藏暂存条（设计 §4.A.3 → 2026-11-05 整改1② 收口）：主品视图的恢复
          入口已改为工具行「销毛成本」右侧的 HiddenVault 收纳区，面板区下方不再
          出暂存条；组内对比视图仍在面板区上方沿用 HiddenTray（行为不变） */}
      </section>
    </>
  );
}
// MARKER-CHECK-777
