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
// 2026-11-06 量价同骨架（Eason 拍板，.impeccable/surfaces/range-ruler-volume-skeleton.md
// 「量价走势」节）：每个面板（主品视图 + 组内对比分离面板）改用价格走势同款 <Chart>——
// ①一条价格线（本面板产品，品牌色）+ 底部销量柱量带（恒开恒柱，volumeMode="bar"）；
// ②拖选 = Chart 内建区间量尺（时间胶囊 + 区间极差/区间涨跌切换 + 每层量尺），
//   选区全量桶下标存页面级 brushRange（brushInWindow 换算到各面板窗口），一份选区全面板
//   共享；桶清单变化（粒度/国家/时间筛选）即清除；③档位带不画（showTiers=false）、
//   不下钻（enableDrill=false）；④「销毛成本」开 + 我司面板：costs（marginCostOf.unitCost，
//   隔离周断开）+ margins（悬停销毛率迷你卡），成本值并入面板 Y 轴再按价格页同款
//   volPlan 压缩（量带 = 压缩前总高 30%）；竞品面板无成本无销毛；⑤名称带 nameZoneWidth
//   （随面板产品名自适应）+ paneLabels 图层标注（价格 USD / 销量 台·模拟 / 成本·模拟）。
// 随之退役：面板内 VolumeBars 覆盖层、PointerShield 指针承接层、PanelExtremeMarks、
// 双 SpreadRangeCard 极差卡、页面级 PanelHoverTip / 周明细卡悬停读数（分离面板）、
// CostBarChart 成本柱呈现、「销毛呈现方式」下垂柱/顶部销毛线 Segmented、面板内可点击
// 图例行（legendOff）、共享 Y 轴列（SplitAxisColumn——每面板 Chart 自画轴）；「时间轴
// 同步」开关移至工具行呈现槽。合并单图（MergedCompareChart）路径原样保留（含其图下
// 明细卡行），库存 · DOS 卡、面板时间轨、胶囊带/收纳区、组页签、全局平台筛选器不变。
// ============================================================
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
// 区间量尺与量价同骨架（2026-11-06 Eason 拍板，见 .impeccable/surfaces/range-ruler-volume-skeleton.md）：
// 读数方式（区间极差|区间涨跌）会话态 + 选区按全量桶下标存储、按面板查看窗口换算
import { brushInWindow, type RangeMode } from '../chart/PriceTrend/rangeRuler';
// 名称带自适应宽（nameZoneWidthOf）与曲线系列名（curveNameOf）与价格页同源
import { curveNameOf, nameZoneWidthOf, type LineShapeChoice } from '../chart/PriceTrend/chartModel';
import {
  BREAK_PX,
  GRID,
  PANE_HEAD_H,
  TICK_PX,
  adaptiveRangeOf,
  axisTickTextsOf,
  computeYAxis,
  convertWindowIds,
  dataBucketRange,
  enumerateBuckets,
  estGridLeft,
  normalizeWindow,
  perUsdOf,
  seriesSpanRange,
  shortBucketLabel,
  type Bucket,
  type YScale,
} from '../chart/PriceTrend/helpers';
import { buildSeries, lowestPriceColorSku } from '../dataModel/aggregate';
import { volumeByBuckets } from '../dataModel/volume';
import { dimProduct } from '../data';
import type { Series, SeriesPoint } from '../dataModel/types';
import { brandColorOf, color, fontSize, formatPrice, radius, selectAccent, selectSoft, selectSoftInk, shadow, space } from '../theme/tokens';
import { flatSelections } from '../state/mainSelection';
import { validVolumeViewMode, volumeProductRefs, type VolumeViewMode } from './volume/volumeView';
import MergedCompareChart, { type MergedCompareProduct } from './volume/MergedCompareChart';
import InventoryDosCard from './volume/InventoryDosCard';
import { inventoryDemoOf } from './volume/inventoryDemo';
import PanelTimeTrack from './volume/PanelTimeTrack';
import HiddenTray, { HiddenVault, type HiddenTrayItem } from './volume/HiddenTray';
import { marginCostAvailabilityOf, marginCostOf } from './volume/marginCost';
import WeekDetailCard from './volume/WeekDetailCard';
import MainControlBand, { GroupCompareEntry } from './volume/MainControlBand';
import { weekDetailModel } from './volume/weekDetail';
import { normalizePanelWindow, vMaxOf, type VolumeSlot } from './volume/volumeAxis';
import { formatVolumeAmount, resolveSelectedWindow, shouldUseWanUnits } from './volume/periodSummary';
import { STABLE } from '../appChannel';

// 与价格走势分离卡片同一套：拖柄骑在上边线正中，上半凸出卡片；滚动区垫高避免裁切
const PANEL_GRIP_H = 14;
const SCROLL_PAD_TOP = 10;
/** 面板图顶窄空气带（同价格页分离面板：刻度开 = 16，全关 = 8） */
const Y_AXIS_TOP_BAND = 16;
/** 量带高度占比（2026-11-06 同价格页 volPlan：量带 = 压缩前总高 × 30%） */
const VOL_BAND_RATIO = 0.3;
const LOAD_ERROR_HINT: ReactNode = (
  <>
    数据加载异常
    <div style={{ marginTop: 4, fontSize: 12 }}>请刷新重试</div>
  </>
);

/** 面板网格列模板（2026-11-05 整改1① 对位 single-source）：胶囊带行与面板网格
 *  必须由本函数取同一条字符串——同容器宽（trackWidth 内）、同模板、同 gap，
 *  胶囊组逐格居中于其面板上方 */
const panelGridCols = (count: number): string => `repeat(${Math.max(1, count)}, minmax(0, 1fr))`;

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
  // 销毛成本开关（2026-11-06 量价同骨架改版：成本柱呈现退役——开 = 价格层叠成本面积
  // （仅我司面板），悬停看销毛率迷你卡；关 = 纯价格线 + 销量柱）。
  // 组内对比下不允许显示销毛成本（对比时放在下方不合理）：强制关、开关禁用。会话态跨页保留
  const [showMargin, setShowMargin] = usePageViewState<boolean>('volume.showMargin', () => false);
  const marginLocked = safeViewMode.kind === 'group';
  const marginOn = showMargin && !marginLocked;
  const toggleMargin = (): void => {
    if (marginLocked) return;
    setShowMargin(!showMargin);
  };
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
  // 价格档位带开关（第一百九十三轮）：2026-11-06 量价同骨架拍板「档位带不画」——
  // 本页面板恒 showTiers={false}，齿轮里的档位开关一并撤下（showTiersToggle={false}）
  const [lineShape, setLineShape] = usePageViewState<LineShapeChoice>('volume.lineShape', () => 'auto');
  // 第一百一十四轮（评审）：价格显示（默认精简，会话态跨页保留）+ 全面板共享悬停纵向位置（横向虚线）
  const [labelMode, setLabelMode] = usePageViewState<'detail' | 'compact'>('volume.labelMode', () => 'compact');
  // 悬停页签比率：默认周环比（与价格看板同一默认）；会话态跨页保留（192 轮）
  const [tipMode, setTipMode] = usePageViewState<'discount' | 'wow'>('volume.tipMode', () => 'wow');
  // 区间读数方式（2026-11-06 同价格页）：区间极差（默认）| 区间涨跌，会话态跨页保留
  const [rangeMode, setRangeMode] = usePageViewState<RangeMode>('volume.rangeMode', () => 'extreme');
  const [crossY, setCrossY] = useState<number | null>(null);
  const [adjusting, setAdjusting] = useState(false); // 刷选拖动中冻结价格 Y 轴
  // 查看窗口 = 会话态跨页保留（与价格看板对齐；范围改动等失义路径照旧复位）
  const [windowIds, setWindowIds] = usePageViewState<[string, string] | null>('volume.windowIds', () => null);
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
  // ---- 图内拖选区间（2026-11-06 同价格页）：页面级一份选区，全面板共享；
  //      存全量桶下标，喂面板前用 brushInWindow 换算到各自查看窗口（窗口外不显示）。
  //      拖动中的实时预览由 Chart 内部处理，松手才提交到 brushRange ----
  const [brushRange, setBrushRange] = useState<[number, number] | null>(null);

  // 面板数变化（顶部筛选器增删产品）→ 各面板态数组随动（保旧值补空位）；
  // 换产品/价格类型/币种 → 价格高度倍率复位（同看板 §5.6）
  useEffect(() => {
    const fit = <T,>(fill: T) => (prev: T[]): T[] => Array.from({ length: panelCount }, (_, i) => prev[i] ?? fill);
    setHoverIdxs(fit<number | null>(null));
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

  // 选区（2026-11-06 同价格页）：桶清单变化 = 下标失义，选区清掉
  //（粒度换桶 / 国家换数 / 顶部时间筛选改窗口；面板独立窗口不触发——
  // brushInWindow 换算后窗口外自然不显示，窗口拖回来选区还在）
  useEffect(() => {
    setBrushRange(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buckets, cc, win.s, win.e]);

  // 换产品清单（顶部筛选器增删产品）→ 悬停列随面板重置；独立窗口按面板
  // 挂在数组下标上，中间删面板会错位串到下一张面板（2026-11-01 审查 P2），一并清。
  useEffect(() => {
    setHoverIdxs(panelSpecs.map(() => null));
    setPanelWins(panelSpecs.map(() => null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelSpecs]);

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

  // ---- 可见面板系列并集（2026-11-06 起只作名称带宽度与面板 Y 轴输入；
  //      被隐藏面板不进并集，设计 §5.3：隐藏即退出并集、刻度收缩，与价格页口径一致） ----
  const visUnion = useMemo(
    () => panelViews.filter((p) => !hiddenSet.has(p.spec.key)).flatMap((p) => p.vis),
    [panelViews, hiddenSet],
  );



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
  // ---- 面板价格 Y 轴（2026-11-06 量价同骨架，算法与价格页 volPlan 同一）----
  // 「销毛成本」开：可见我司面板的模拟成本折成合成序列并入轴输入（成本面积要可见）；
  // 隔离周成本不进图（与旧呈现同口径），合成序列同位置置 null。
  const costAxisSeries = useMemo<Series[]>(() => {
    if (!marginOn) return [];
    const out: Series[] = [];
    for (const panel of visiblePanels) {
      if (!panel.spec.isOwn) continue;
      const pts = marginCosts[panel.idx] ?? [];
      if (!pts.some((mp) => mp != null)) continue;
      const visPts = panel.vis[0]?.points ?? [];
      out.push({
        key: `${panel.spec.key}::cost`,
        isOwn: panel.spec.isOwn,
        brand: panel.brand,
        label: panel.name,
        skuIds: panel.spec.skuIds,
        color: panel.vis[0]?.color ?? brandColorOf(panel.brand),
        points: visPts.map((pt, i) => ({
          ...pt,
          price: pts[i] && visPts[i]?.suspect !== 'quarantined' ? pts[i]!.unitCost : null,
          rrp: null,
        })),
      });
    }
    return out;
  }, [marginOn, visiblePanels, marginCosts]);
  const axisInput = useMemo(
    () => (marginOn ? [...visUnion, ...costAxisSeries] : visUnion),
    [marginOn, visUnion, costAxisSeries],
  );
  // 步长滞回 prev（同价格页）：窗口平移/价格小漂移不换档；拖时间轴中（adjusting）冻结
  const scaleRef = useRef<YScale | null>(null);
  const yCfg = useMemo(() => {
    if (adjusting && scaleRef.current) return scaleRef.current;
    const next = computeYAxis({
      series: axisInput,
      priceTypes: state.priceTypes,
      sliderScale,
      allowBreak: yCompress,
      perUsd: perUsdOf(state.currency),
      prev: scaleRef.current,
    });
    scaleRef.current = next;
    return next;
  }, [axisInput, state.priceTypes, sliderScale, adjusting, yCompress, state.currency]);
  // 量带规划：量带 = 压缩前总高 × 30%，价格绘图区以有效 sliderScale 等比压缩
  //（格值与步长不变，只改每格像素高）——与价格页合并图/分离面板同一算法同一比例
  // 2026-11-07 稳定版三轮（Eason「标题还是不好」）：图层标题 head 版式——价格标题独占图顶一行，
  // gridTop 计入 PANE_HEAD_H（同价格页）；演进版版式不变
  const panelGridTop = (showYTicks ? Y_AXIS_TOP_BAND : 8) + (STABLE ? PANE_HEAD_H : 0);
  const volPlan = useMemo<{ scale: YScale; volH: number }>(() => {
    const breaks = yCfg.breaks.length * BREAK_PX;
    const unit = yCfg.plotHeight - breaks; // cells × TICK_PX × sliderScale
    const totalH0 = panelGridTop + yCfg.plotHeight + GRID.bottom;
    const volH = Math.max(40, Math.round(totalH0 * VOL_BAND_RATIO));
    if (unit <= 0) return { scale: yCfg, volH };
    const targetPlot = Math.max(breaks + TICK_PX, yCfg.plotHeight - volH);
    const sEff = Math.min(3, Math.max(0.5, ((targetPlot - breaks) / unit) * sliderScale));
    return {
      volH,
      scale: computeYAxis({
        series: axisInput,
        priceTypes: state.priceTypes,
        sliderScale: sEff,
        allowBreak: yCompress,
        perUsd: perUsdOf(state.currency),
        prev: scaleRef.current,
      }),
    };
  }, [yCfg, panelGridTop, sliderScale, axisInput, state.priceTypes, yCompress, state.currency]);
  const yFinal = volPlan.scale;
  const volH = volPlan.volH;
  // 名称带自适应宽（2026-11-06 同价格页 nameZoneWidthOf）：按可见面板产品名取最长
  const nameZoneW = useMemo(() => nameZoneWidthOf(visUnion.map((s) => curveNameOf(s))), [visUnion]);
  // 左缘 = 轴列（仅刻度，档位带不画）+ 名称带；刻度文案自适应轴列宽（同价格页）
  const yAxisTickTexts = useMemo(() => axisTickTextsOf(yFinal), [yFinal]);
  const gridLeft = useMemo(
    () => estGridLeft(state.currency, showYTicks, false, yAxisTickTexts, nameZoneW),
    [state.currency, showYTicks, yAxisTickTexts, nameZoneW],
  );

  // 合并单图明细卡行仍按全量域摘要取数（分离面板明细卡已退役——时点读数走 Chart 悬停浮层）
  const summaryLive = orderedPanels.map((p) => {
    const [viewStart, viewEnd] = effWins[p.idx] ?? [0, 0];
    const [start, end] = resolveSelectedWindow(viewStart, viewEnd, null);
    return {
      key: p.key,
      volumes: summaryVolumes[p.idx] ?? [],
      windowStart: start,
      windowEnd: end,
    };
  });
  const summaryRows = summaryLive;

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

  /** 「时间轴同步」开关（第119轮走查会；第148轮改名「时间轴同步」两行竖排；
   *  2026-11-03 起主产品视图同款可见，语义两视图通用；2026-11-06 共享轴列退役后
   *  移驻工具行呈现槽，合并单图态不渲染——合并图自带完整 X 轴）：
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

  // 面板渲染体（2026-11-06 量价同骨架改版）：
  // - 分离面板（主品视图 + 组内对比）= 价格走势同款 <Chart>：本面板产品价格线 +
  //   底部销量柱量带 + 区间量尺拖选 + 名称带/图层标注；时点读数走 Chart 悬停浮层，
  //   页面级明细卡/极差卡/指针承接层退役。
  // - 合并单图：panelNodes 不渲染面板，仅用于收集各产品明细卡（该路径原样保留）。
  const detailCards = new Map<string, ReactNode>();
  const panelNodes = visiblePanels.map((p, panelIndex) => {
                      const pill = pillOf(p);
                      if (mergedOn) {
                      // ---- 合并单图：明细卡观察列跟随合并图共享窗口（原行为原样保留）----
                      const mPts = (p.series[0]?.points ?? []).slice(win.s, win.e + 1);
                      const viewLen = mPts.length;
                      const activeIdx = viewLen > 0 ? Math.min(viewLen - 1, Math.max(0, mergedHover ?? viewLen - 1)) : null;
                      const activePoint = activeIdx != null ? (mPts[activeIdx] ?? null) : null;
                      const marginPoints = marginCosts[p.idx] ?? [];
                      const marginUnavailable = marginCostAvailabilityOf(p.spec.isOwn, marginPoints) === 'empty';
                      const marginPoint = activeIdx != null ? marginPoints[activeIdx] ?? null : null;
                      // ---- 单周明细卡口径：缺采显示 —，环比只跟上一**可信**桶比
                      //      （只跨隔离周回看，缺采周仍显示 —，不借用相邻值）。
                      //      上一桶取全量域（视图切片首桶的前一周在域内可能有值）。
                      let prevTrustedPrice: number | null = null;
                      let wowSkip = 0;
                      const wowSkipBuckets: string[] = [];
                      if (activeIdx != null) {
                        const allPts = p.series[0]?.points ?? [];
                        for (let k = win.s + activeIdx - 1; k >= 0; k--) {
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
                      const row = summaryRows.find((item) => item.key === p.key);
                      const windowLo = row ? Math.min(row.windowStart, row.windowEnd) : 0;
                      const windowHi = row ? Math.max(row.windowStart, row.windowEnd) : -1;
                      const volumeSlice = row ? row.volumes.slice(windowLo, windowHi + 1) : [];
                      // 万单位档：区间内非空值全部 ≥1 万才开（混合量级开万档会把小值抹成「0万」）
                      const volumeWan = shouldUseWanUnits(volumeSlice);
                      const formatVolume = (value: number) => formatVolumeAmount(value, volumeWan);
                      const detail = weekDetailModel({
                        granularity: state.granularity,
                        bucketId: activePoint?.bucketId ?? '',
                        xLabel: activePoint?.xLabel ?? '',
                        price: activePoint?.price ?? null,
                        rrp: activePoint?.rrp ?? null,
                        prevPrice: prevTrustedPrice,
                        volume: activeIdx != null ? (mergedVolumes[p.idx]?.[activeIdx] ?? null) : null,
                        marginPoint,
                        marginUnavailable,
                        formatMoney: (value) => formatPrice(Math.round(value), state.currency),
                        formatVolume,
                        wowSkip,
                        wowSkipBuckets,
                        priceSuspect: activePoint?.suspect,
                      });
                      // 异常守卫裁定回调：观察点打标时可用（明细卡内同名行）
                      const canExempt = !!activePoint?.suspect && activePoint.suspect !== 'exempted' && activePoint.price != null;
                      const canIsolate = activePoint?.suspect === 'pending' && activePoint.price != null;
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
                      return null; // 合并态不渲染分离面板
                      }
                      // ---- 分离面板（2026-11-06 价格走势同款 Chart 骨架）----
                      const ws = effWins[p.idx]?.[0] ?? 0;
                      const we = effWins[p.idx]?.[1] ?? 0;
                      // 页面级选区 → 本面板查看窗口下标；窗口外不显示（窗口拖回来还在）
                      const panelBrush = brushInWindow(brushRange, ws, we);
                      // 线与柱用品牌色（spec 拍板；不再把主品视图压成中性墨）
                      const seriesColor = p.vis[0]?.color ?? brandColorOf(p.brand);
                      // 「销毛成本」开 + 我司面板：成本面积 + 悬停销毛率迷你卡。
                      // 隔离周成本不进图（价格不可信 → 成本断开，同旧呈现口径）
                      const visPts = p.vis[0]?.points ?? [];
                      const marginMasked = marginOn && p.spec.isOwn
                        ? (marginCosts[p.idx] ?? []).map((mp, mi) => (visPts[mi]?.suspect === 'quarantined' ? null : mp))
                        : null;
                      const costs = marginMasked?.map((mp) => (mp ? mp.unitCost : null)) ?? null;
                      const hasCost = costs?.some((v) => v != null) === true;
                      // 面板根四边用长属性而非 border 简写：阅读态同元素仅设 borderLeft，
                      // 简写↔长属性在同一次重渲染间切换会触发 React 控制台混用警告（2026-11-01 控制台卫生）
                      const panelEdge = dropTarget === p.spec.key && draggingPanel !== p.spec.key ? color.link : color.hairline;
                      const panelPadX = reading ? 12 : 8;
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
                        {/* 价格走势同款 Chart 骨架（2026-11-06 量价同骨架）：本面板产品一条
                            价格线（品牌色）+ 底部销量柱量带（恒开恒柱）+ 区间量尺拖选 +
                            名称带/图层标注。悬停明细 = Chart 内建浮层（页面级明细卡/
                            极差卡/指针承接层已随旧组合退役） */}
                        <Chart
                          series={p.vis}
                          granularity={state.granularity}
                          currency={state.currency}
                          priceTypes={state.priceTypes}
                          tipMode={tipMode}
                          gridLeft={gridLeft}
                          gridTop={panelGridTop}
                          axisTickTexts={yAxisTickTexts}
                          chrome={false} // 面板不渲染设置行：统管权在页面工具行（同价格页分离面板）
                          showYTicks={showYTicks}
                          showTiers={false} // 档位带不画（量价同骨架拍板）
                          enableDrill={false}
                          windowKey={`${ws}:${we}:${p.key}`}
                          yScale={yFinal}
                          nameZoneWidth={nameZoneW} // 名称带（刻度右→绘图区左、与线位对齐，同价格页）
                          paneLabels // 图层标注：价格 USD / 销量 台·模拟（有成本时价格行写「价格 / 成本」）
                          paneLabelLayout={STABLE ? 'head' : 'pill'} // 2026-11-07 稳定版三轮：标题独占行、左缘对齐轴列
                          tipDiffBaseKey={p.vis[0]?.key ?? null}
                          margins={hasCost ? (marginMasked ?? undefined) : undefined} // 销毛迷你卡（我司）
                          costs={hasCost ? (costs ?? undefined) : undefined} // 成本面积（我司；Y 轴已把成本算进来）
                          volumeOn // 量带恒开、恒为柱（本页不提供「量」开关，同拍板）
                          volumeMode="bar"
                          volumeColor={seriesColor}
                          volumes={volumes[p.idx]}
                          volumeHeight={volH}
                          volumeOwner={p.vis[0] ? { key: p.vis[0].key, brand: p.brand, text: curveNameOf(p.vis[0]) } : null}
                          brush={panelBrush} // 页面级选区（全量桶下标 → 本面板窗口下标）
                          onBrushChange={(r) => setBrushRange(r ? [r[0] + ws, r[1] + ws] : null)}
                          rangeMode={rangeMode}
                          onRangeMode={setRangeMode}
                          rulerKey={p.vis[0]?.key ?? null} // 价格量尺量本面板产品线
                          anomalyActions // 指针承接层退役后，隔离点裁定入口回归图上胶囊（同价格页）
                          lineShape={lineShape}
                          labelMode={labelMode}
                          markExtremes={false}
                          showXLabels
                          crosshairY={crossY} // 横向虚线跨全部面板
                          onCrosshairYMove={setCrossY}
                          crosshairIdx={hoverIdxs[p.idx] ?? null} // 时间列联动（同步 = 全面板同列）
                          onCrosshairMove={onHoverOf(p.idx)}
                          emptyHint={p.failed ? LOAD_ERROR_HINT : '该产品在所选时间范围内无数据'}
                        />
                        {/* 本图时间轴（同步/非同步恒在，左右缘对齐面板绘图区）：
                            同步 = 全图查看同一段时间，拖任一条同步调整；非同步 = 各图独立调整。
                            恒渲染保证切换同步只改联动行为，面板高度与轨道横向位置不变 */}
                        <div style={{ margin: `0 ${panelPadX + GRID.right}px 6px ${panelPadX + gridLeft}px` }}>
                          <PanelTimeTrack
                            ids={domainIds}
                            lo={filterBounds[0]}
                            hi={filterBounds[1]}
                            s={timeSynced ? win.s : ws}
                            e={timeSynced ? win.e : we}
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
      title={marginLocked ? '本组对比下不显示销毛成本' : marginOn ? '显示中：价格层叠成本面积，悬停看销毛率；点击关闭' : '显示销毛成本：价格层叠成本面积，悬停看销毛率'}
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
                  showTiers={false}
                  showTiersToggle={false} // 档位带不画（2026-11-06 量价同骨架拍板），齿轮不再出档位开关
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
                      {/* 「时间轴同步」（共享轴列退役后移驻工具行，紧随销毛成本）：
                          合并单图自带完整 X 轴，开关随轴列一并隐藏 */}
                      {!mergedOn && syncToggle}
                      {reading && vaultItems.length > 0 && (
                        <>
                          <span aria-hidden style={{ width: 1, height: 16, background: color.hairline, flexShrink: 0 }} />
                          <HiddenVault items={vaultItems} onRestore={restorePanel} onRestoreAll={restoreAllPanels} registerItem={registerVaultItem} />
                        </>
                      )}
                    </div>
                  }
                  /* 呈现槽（2026-11-06 量价同骨架改版）：「销毛呈现方式」二式随成本柱
                     退役；本槽仅组内对比出 分离面板|合并单图 切换（合并态保留以便切回）。
                     主品控制带仍在面板上方的胶囊带行 */
                  presentationSlot={safeViewMode.kind === 'group' ? (
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
            {/* 面板区（2026-11-06 量价同骨架改版）：单一横滚容器，共享 Y 轴列退役——
                每个面板 Chart 自画轴（刻度/名称带/量轴右列都在面板内），>3 个面板时
                同一轨道宽（N/3 × 可用宽）横滚。窄视口在卡内横向拖动（minWidth 880
                保面板可读下限）。合并单图仍自带完整 X 轴全宽呈现 */}
            {(() => {
              const trackRatio = visibleCount > 0 ? visibleCount / Math.min(visibleCount, 3) : 1;
              const trackWidth = `calc(${trackRatio} * 100%)`;
              // 列模板 single-source（2026-11-05 整改1①）：胶囊带 / 面板网格
              // 必须同一条字符串、同一个 gap——胶囊带逐格居中对齐的结构化保证
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
              // 明细卡行（合并单图专用，2026-11-06 起分离面板无明细卡）：合并态观察列
              // 跟随合并图，卡片列与合并图产品同序
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
                        字符串）、同 gap，每个胶囊组居中于其面板正上方；隐藏产品在收纳区，
                        恢复后回原列位。随面板横滚区一起滚动，列位恒对齐 */}
                    {reading && panelCount > 0 && (
                      <div style={{ marginBottom: space.sm }}>
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
                      /* 并排上限 3（第一百八十轮，Eason：与价格看板同规则）——≤3 个按个数
                          均分一行；>3 个不折行，横向拖动查看（每格恒为视口 1/3 宽）。
                          渲染序 = 拖拽换位序（orderedPanels）；渲染前按隐藏集过滤，
                          列数按可见数重算。共享轴列已退役：每面板 Chart 自画轴 */
                      <div
                        style={{
                          minWidth: 0,
                          display: 'grid',
                          gridTemplateColumns: gridCols,
                          gap: gridGap,
                          padding: `${reading ? 0 : SCROLL_PAD_TOP}px 0 0`,
                        }}
                      >
                        {panelNodes}
                      </div>
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
