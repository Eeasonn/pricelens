// ============================================================
// §6.2/§6.3/§6.4 图主体：ECharts canvas + DOM 覆盖层。
// 第七轮（branch feature/y-axis-adaptive）Y 轴简化重构：
// - 值轴纯自适应（computeYAxis 分段压缩刻度），拖柄/档位 chips 删除；
// - ECharts 值轴整体隐藏，刻度线/刻度标签（12px K/M 缩写）/断轴符号/档位带全部 DOM 层绘制——
//   分段映射的数据喂归一化伪值（yNormOf），DOM 与 canvas 同源几何恒一致；
// - 断裂轴：值簇空白 ≥ 阈值（helpers 阈值常量）压成 BREAK_PX 条，双虚线 + 轴上断轴符号；
// - 档位带（仅 USD）：Y 轴左侧新增一列档位框（如 200~400 框住 200..400 刻度区段），
//   本币映射未定义不渲染；图隐藏（空态/几何失效）时随之隐藏；
// - 名称预留带：绘图区左缘常驻 NAME_ZONE_W 空白带，折线不进入——
//   系列名右缘锚在起点左侧、随窗口平移连续左移（第十轮：不再跳变），
//   滑到预留带左界即停驻带内（同一文案，位置连续）；文案去品牌前缀 + 去容量后缀 GB/TB
//   （品牌由色点/图例卡表达，第十轮）
// - 第十轮：每格高度伸缩滑杆收进币种符号旁的齿轮弹层（Popover），不占任何版面；
//   Y 轴模型可由外部传入（yScale，含刷选冻结与伸缩倍率），迷你图缺省内部自算
// - 折后价：monotone 平滑实线品牌色（第一百一十五轮起全系列同宽 2px，自有线不再加粗）
// - RRP：细实线（第五十二轮，比折后价细一档取代虚线）+ step 阶梯（平段+调价点垂直
//   跳变，不平滑），同色 85% 不透明度——粗细对比表达「主价/参照」层级
// - 缺采：跨接段仅虚线（第二十四轮撤销空心插值点）；价格标签自适应避让（resolveCollisions 两遍式）
// - 悬停：十字竖线（DOM）+ 钉顶附框（含折扣率胶囊，第五十二轮）+ 月/季下钻图标 +
//   offer 图标 + 「快照」取证胶囊（第五十轮）；ECharts tooltip 禁用
// - 第五十二轮 图顶工具行单行三区：左 = $/齿轮 + 折后价/RRP 粗细线胶囊；中 = 系列图例页签
//   （由看板层注入并居中）；右 = 大促档期/offer/最高最低/价格变化提醒圆框组
// - 点击：月/季圈点（±12px 命中）触发下钻；周视图点击 = 锁定/解锁该时间列
// - 第二十轮：S/E 端点数值标签必放（symbolSize 0 修复 symbol 'none' 吞标签）；
//   齿轮弹层「Y 轴自动压缩」开关（关 = 无断轴完全连续）
// - 第三十二轮（多系列防挤）：
//   ① 生命周期第二行计入名称避让盒（此前盒高少算 ~14px + 渲染自行上移 7px → 名称互压）；
//   ② 名称被避让推离锚点超 NAME_LEADER_PX → 画细引线连回首点；
//   ③ 聚焦模式：系列数 > FOCUS_MODE_THRESHOLD 时图面名称/生命周期行退场（识别走
//      图例卡），悬停折线（±HIT_PX）高亮该系列、其余降透明 0.15，聚焦系列名称回归；
//   ④ 月/季 P1 标签候选改「显示值变化点」；多系列时最大/最小降 P1；
//   ⑤ 空档位画虚线占位框（梯子连续可读）
// - 第一百一十三轮（评审）：明细浮层联动——浮层取数列 tipIdx = 本图悬停列 ?? 外部
//   crosshairIdx（第110轮参考线机制的延伸）：分离模式悬停任一面板时间列，其余面板
//   同列同步出各自的明细浮层（各显各的系列价格；十字实线/参考线图标仍只跟真实鼠标）。
//   新增 volumes 入参：量价看板浮层在价格行后追加「销量 …台」行
// - 第一百一十四轮（评审）：①悬停数据点只画品牌色小圆点（快照/下钻悬停图标全撤，
//   快照查看收进图下核心信息明细的取证列）；②横向虚线随鼠标 Y 实时横跨所有图
//   （crosshairY 受控联动，与竖向参考线同机制）；③tipBox=true 时浮层改为图下方
//   居中预留框（量价看板；无悬停显灰色斜体提示）；④labelMode='compact' 精简标签
//   （每系列仅最高/最低/最新三价，白底胶囊避线）
// - 第一百八十五轮（外部 UX 审计落地）：悬停浮层周环比徽章翻转为「涨蓝跌琥珀」
//   （与图上变化标记同一口径，全站唯一）；Y 轴刻度字号 8px → 10px（Y_TICK_FONT）；
//   高度动画在系统「减少动态效果」开启时跳过直接落终值；emptyHint 放宽为 ReactNode
//   供调用方区分「暂无数据」与「数据加载异常」
// ============================================================
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { Popover } from 'antd';
import { TagOutlined, CloseOutlined } from '@ant-design/icons';
// 按需注册（第十八轮）：全量 'echarts' → core + Line/Scatter + Grid + Canvas，
// bundle 约省 500KB；本图只画 line/scatter（RRP step、缺采虚线桥均 line），tooltip 已禁用
import * as echarts from 'echarts/core';
import { LineChart, ScatterChart } from 'echarts/charts';
import { GridComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([LineChart, ScatterChart, GridComponent, CanvasRenderer]);
import type { CurrencyMode, Granularity, Series } from '../../dataModel/types';
import { color, font, fontSize, radius, selectSoft, selectSoftInk, shadow } from '../../theme/tokens';
import { measureText } from '../../components/ProductCascader';
import { lifecycleDeltaOf, type LifecycleDelta } from '../../dataModel/aggregate';
import { useFilters } from '../../state/FiltersContext';
// 第一百八十五轮（外部 UX 审计）：JS 动画统一吃系统「减少动态效果」设置
import { prefersReducedMotion } from '../../theme/motion';
import {
  BREAK_PX,
  GRID,
  NAME_ZONE_W,
  estGridLeft,
  gapAbsorbedIdx,
  TICK_PX,
  AXIS_BAND_W,
  TICK_ZONE_W,
  TICK_DASH_W,
  TIER_LABEL_W,
  computeYAxis,
  perUsdOf,
  tierLabelShort,
  xPxOf,
  yPxOf,
  type Geom,
  type StripGeom,
  type YScale,
} from './helpers';
// 纯计算层（第十八轮抽离）：几何/标签计划/端点/option/DOM 数据全部显式入参纯函数
import {
  buildChangeMarks,
  curveNameOf,
  FOCUS_MODE_THRESHOLD,
  Y_TICK_FONT, // 第一百八十五轮（外部 UX 审计）：Y 轴刻度字号 8px → 10px（共享常量）

  buildEndpointBadges,
  buildEndpointMarks,
  buildGeom,
  buildLabelPlan,
  buildOfferMarkers,
  offerLineItems,
  buildOption,
  buildTierBoxes,
  buildTickRows,
  collectTierValues,
  primaryPriceOf,
  resolveLineShape,
  scaleToDisplay,
  thinTickRows,
  type LineShapeChoice,
  type PromoBand,
  type SeriesNameItem,
} from './chartModel';
import OfferPopover from './OfferPopover';
import ChartToolbar from './ChartToolbar';
import YLimitHandles, { type YLimitState } from './YLimitHandles';
import BrandDot from '../../components/BrandMark';

export interface ChartProps {
  series: Series[];
  granularity: Granularity;
  currency: CurrencyMode;
  priceTypes: { discounted: boolean; rrp: boolean };
  // 第七轮：height/y 已删 —— 容器高 = gridTop + plotHeight + GRID.bottom（自适应派生），
  // Y 轴 = 纯自适应分段刻度（无手动覆盖）
  /** Y 轴左边距；缺省按最长刻度估算 */
  gridLeft?: number;
  /** 第一百一十五轮：右侧留白（量价面板预留销量轴列，轴信息不与绘图区重叠）；缺省 GRID.right */
  gridRight?: number;
  /** 图顶卡片区预留高；缺省按 series 数量推（gridTopFor） */
  gridTop?: number;
  // 系列图例页签由看板层通过 legend 注入图顶工具行中央，底部只保留时间轴。
  enableDrill?: boolean; // 月/季视图圈点下钻
  enableOffer?: boolean; // 周视图 offer 图标
  onDrill?: (seriesKey: string, bucketId: string) => void;
  /** 空态文案（第一百八十五轮放宽为 ReactNode：调用方可用「主句 + 副句」节点
   *  区分「暂无数据」与「数据加载异常」，沿用同一居中排版） */
  emptyHint?: ReactNode;
  /** 窗口标识（起止下标）；变化 = 重采样换列，锁定列下标失义 → 复位 */
  windowKey?: string;
  /** 外部计算的 Y 轴模型（主图传入，含刷选拖动冻结与伸缩倍率）；缺省内部自适应（迷你图） */
  yScale?: YScale;
  /** 每格高度伸缩倍率（受控；缺省用内部状态，齿轮弹层在两种模式下都可用） */
  sliderScale?: number;
  /** 伸缩倍率提交（滑杆松手回调；缺省写内部状态） */
  onSliderScale?: (v: number) => void;
  /** Y 轴自动压缩（第二十轮，受控）：开 = 值簇空白 ≥ 阈值处断轴压缩；
   *  关 = 无断轴，Y 轴完全连续展示。缺省用内部状态，齿轮弹层在两种模式下都可用 */
  yCompress?: boolean;
  /** 压缩开关提交（缺省写内部状态） */
  onYCompress?: (v: boolean) => void;
  /** Y 轴上下限（第一百六十六轮，Eason）：上下限拖柄的受控值（null = 该侧自动）。
   *  传入 onYLimit 才渲染拖柄——迷你图/下钻弹窗等自管场景不传不渲染 */
  yLimit?: YLimitState;
  /** 限位提交：拖动中实时（未吸附原值，模型层吸附整格）/ 双击传 null 恢复该侧自动 */
  onYLimit?: (kind: 'min' | 'max', v: number | null) => void;
  /** 绘图区横向几何原语上报（第十五轮：促销热力带与时间轴逐像素对齐用） */
  onGeom?: (g: StripGeom | null) => void;
  /** 大促背景带开关（第三十四轮，受控，缺省内部状态 true）：俄区促销档期在绘图区着色 */
  promoBandsOn?: boolean;
  /** 开关提交（缺省写内部状态） */
  onPromoBandsOn?: (v: boolean) => void;
  /** 促销带数据（index 层按窗口算好；空 = 无带） */
  promoBands?: PromoBand[];
  /** 价格变化提醒阈值（第四十六轮挪出齿轮到标题行，受控）：相较前一有值点
   *  |Δ|≥阈值出 ↓/↑ 徽标；null=关闭；0=标出全部真实变化 */
  changeThreshold?: number | null;
  // ---- 第五十二轮 图顶工具行三区（全部受控入参，缺省 = 不渲染对应区，下钻弹窗复用） ----
  /** 折后价/RRP 显隐切换（左区粗/细线胶囊） */
  onPriceTypeToggle?: (key: 'discounted' | 'rrp', next: boolean) => void;
  /** offer 权益开关（中区圆框组） */
  offersOn?: boolean;
  /** offer 权益开关提交 */
  onOffersOn?: (v: boolean) => void;
  /** 价格变化提醒开关+阈值提交（中区圆框组；null=关） */
  onChangeThreshold?: (v: number | null) => void;
  // ---- 第五十四轮追补：工具行抽 ChartToolbar 共享组件；分离模式面板 chrome=false
  //      不渲染设置行，由面板网格上方的常驻工具行统一控制 ----
  /** 图顶工具行显隐（缺省 true）；false = 整行不渲染（含齿轮），gridTop 由调用方收窄 */
  chrome?: boolean;
  /** 图顶工具行中间的系列页签；用于把图例从时间区域上移到工具行中央。
   *  第一百七十八轮起 = 看板合并模式注入产品药丸带（工具行中区常驻居中） */
  legend?: ReactNode;
  /** RRP 胶囊之后的插槽（第一百七十八轮）：短竖线 + 全局「仅查看主产品」 */
  priceTypesAfter?: ReactNode;
  /** 悬停小页签比率口径：wow = 周环比（默认）；discount = 折扣率（vs RRP） */
  tipMode?: 'discount' | 'wow';
  onTipMode?: (v: 'discount' | 'wow') => void;
  onLabelMode?: (v: 'detail' | 'compact') => void;
  /** 时点摘要开合（工具行 ⋯ 菜单；不传 = 菜单里不出现） */
  pointPanelOpen?: boolean;
  onPointPanelToggle?: () => void;
  /** 轴列绘制（第五十四轮追补⑤）：false = 面板不画档位带/刻度标签/断轴省略号——
   *  分离模式这三样由卡片外侧的共享轴列（SplitAxisColumn）统一承担，面板只留绘图区。
   *  绘图区网格提示线已移除（第九十轮） */
  axisChrome?: boolean;
  /** Y 刻度线（第九十一轮恢复齿轮开关，缺省开 = 刻度值 + 短横线）；
   *  关 = 只保留价格档位带，档位文字居中整个轴区宽度。轴区总宽恒定不随开关变化。
   *  受控传 onShowYTicks（看板层统一写）；缺省用内部状态（下钻弹窗等自管场景） */
  showYTicks?: boolean;
  onShowYTicks?: (v: boolean) => void;
  /** 第八十二轮：名称药丸全集（含已屏蔽系列——药丸仍渲染为虚线置灰态）；缺省 = series */
  nameSeries?: Series[];
  /** 屏蔽中的系列 key 集（与 nameSeries 搭配；药丸点击 → onToggleHidden 切换） */
  hiddenKeys?: Set<string>;
  /** 名称药丸点击的显隐切换回调；缺省 = 药丸不可切换 */
  onToggleHidden?: (seriesKey: string) => void;
  /** 第一百一十五轮：顶部品牌图例带悬停的产品（受控入站）——图内高亮该系列，
   *  并在其价格线起点画竖向指引虚线；null = 无悬停（图内名称药丸悬停态不受影响） */
  legendHoverKey?: string | null;
  /** 折线形态（受控；缺省内部状态）。'auto' = 按粒度自适应（第五十四轮追补③：
   *  周=阶梯 / 月季=平滑，默认） */
  lineShape?: LineShapeChoice;
  onLineShape?: (v: LineShapeChoice) => void;
  /** 第110轮（评审）：true = 本图自带时间轴日期标签（分离模式每张小图可独立
   *  截图进 PPT）；缺省 false = 时间标签仍由底部刷选条统一承担 */
  showXLabels?: boolean;
  // ---- 第110轮（评审）：分离模式跨图参考线 ----
  /** 外部受控的悬停时间列下标（其他面板悬停时本面板同列画 1px 虚线参考线）；null = 无 */
  crosshairIdx?: number | null;
  /** 本图悬停时间列变化上报（分离模式联动用）；移出绘图区/图顶 = null */
  onCrosshairMove?: (idx: number | null) => void;
  // ---- 第一百一十四轮（评审）：横向虚线横跨所有图 ----
  /** 外部受控的悬停纵向位置（容器坐标 px，已钳入绘图区）——多面板共享 Y 轴时
   *  任一面板悬停，全部面板在同一高度画横向虚线；null = 无 */
  crosshairY?: number | null;
  /** 本图悬停纵向位置上报（与 onCrosshairMove 同一次 mousemove 内触发）；移出 = null */
  onCrosshairYMove?: (y: number | null) => void;
  // ---- 第一百一十三轮（评审）：联动明细浮层 + 销量行 ----
  /** 量价看板传入的销量序列，与 series.points 下标对齐（同窗同长）；浮层在系列价格行后、
   *  若该列值非 null 追加一行「销量 …台」；缺省不传或该列 null = 不渲染销量行 */
  volumes?: (number | null)[];
  /** 第一百一十三轮（评审）：true = 折线起点旁的系列名称药丸整体不画（量价看板：
   *  产品名已在面板头，面板内空间留给绘图区）；缺省 false 维持原语义 */
  hideNamePills?: boolean;
  /** 第一百一十四轮（评审）：true = 悬停明细改为「图下方居中预留框」（量价看板：
   *  浮层不再盖图；无悬停时框内显灰色斜体提示文案）；缺省 false = 跟随十字线的浮层 */
  tipBox?: boolean;
  /** 第一百一十四轮（评审）：'compact' = 精简标签——每系列只标最高/最低/最新三价
   *  （数字直标无框、位置避线），其余数值标签不画；缺省 'detail' = 现行全量标签口径 */
  labelMode?: 'detail' | 'compact';
  // ---- 第118轮（评审）：图内拖选时间段（量价看板三面板联动高亮分析） ----
  /** 已提交的高亮时间段（可见窗口桶下标 [起,止]）；null = 无。非空时：时间段外
   *  整体降透明、悬停明细只响应时间段内、高亮区顶部显示时间范围（点 × 清除） */
  brush?: [number, number] | null;
  /** 拖选上报：拖动中 committing=false 实时预览；松手 committing=true 提交或清除
   *  （拖距过小视为点击：已有高亮 = 清除，无高亮 = 忽略）。缺省 = 不启用拖选 */
  onBrushChange?: (r: [number, number] | null, committing: boolean) => void;
  // 第五十三轮：图例页签订阅铃铛撤除——订阅入口上移到时点页签（PriceSummary）尾
  // （用户：铃铛应在「上面大的页签」即来源链接之后，不该在图表小页签上）
}

const HIT_PX = 12; // 圈点点击/悬停命中半径
/** 第一百一十四轮：图下方居中明细预留框高度（tipBox 模式；日期行+一产品行+销量行 + 内边距） */
const TIP_BOX_H = 84;
/** 悬停数据点小圆点直径（第一百一十四轮：替代快照/下钻悬停图标） */
const HOVER_DOT_PX = 7;

/** 浮层/参照线数值格式（第三十五轮）：千分位整数 */
const fmt_mm = (v: number): string => v.toLocaleString('en-US');
/** 悬停浮层时间标题：周=MM-DD / 月=YYYY-MM / 季=YYYYQn */
const fmt_hoverDate = (gran: Granularity, x: string): string => {
  if (!x) return '';
  if (gran === 'week') return x;
  if (gran === 'month') return `${x.slice(0, 4)}-${x.slice(4)}`;
  return x;
};

/** 大促档期事件卡（第三十六轮；第四十七轮精简：只留名称/起止/深度） */
function PromoEventCard({ band }: { band: PromoBand }) {
  return (
    <div style={{ width: 208 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: color.ink, display: 'flex', alignItems: 'center', gap: 6 }}>
        <i
          style={{
            display: 'inline-block',
            width: 8,
            height: 8,
            borderRadius: radius.pill,
            background: `rgba(235, 87, 87, ${band.depth === '深' ? 0.75 : band.depth === '中' ? 0.5 : 0.3})`,
            boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)',
          }}
        />
        {band.name}
      </div>
      <div className="tnum" style={{ marginTop: 6, fontSize: 12, color: color.body }}>
        起止 {band.dateText.replace('–', ' ~ ')}
      </div>
      <div style={{ marginTop: 4, fontSize: 12, color: color.body }}>
        促销深度
        <span style={{ fontWeight: 600, color: '#b45309', marginLeft: 6 }}>{band.depth}</span>
      </div>
    </div>
  );
}
/** 高度过渡动画（第十一轮）：高度变化超过 2 格（步长换档/换产品/伸缩大幅调整）时，
 *  以缓动缩放过渡而不是瞬跳；≤2 格的小步（整格吸附、断裂条）即时生效保持跟手 */
const H_ANIM_THRESHOLD_PX = 2 * TICK_PX;
const H_ANIM_MS = 280;

/** 折后价/RRP 切换胶囊已迁 ChartToolbar（第五十四轮追补，随工具行整体抽离） */

/** 悬停浮窗折扣率胶囊（第五十二轮）：时点卡 DiscountBadge 同语言——0% 中性蓝、
 *  深折扣（≤−15%）与溢价转琥珀；仅折后价口径下且双价齐全才出 */
function MiniDiscountBadge({ discount, dim }: { discount: number; dim?: boolean }) {
  const pct = Math.round(Math.abs(discount) * 100);
  const warn = discount <= -0.15 || discount > 0.005;
  const label = pct === 0 ? '0%' : `${discount < 0 ? '−' : '+'}${pct}%`;
  return (
    <span
      className="tnum"
      title={discount > 0.005 ? `较 RRP 高 ${pct}%（溢价）` : `较 RRP 低 ${pct}%`}
      style={{
        flexShrink: 0,
        padding: '0 5px',
        fontSize: 10,
        lineHeight: '15px',
        fontWeight: 700,
        borderRadius: radius.pill,
        color: warn ? '#b45309' : selectSoftInk,
        background: warn ? color.warningSoft : selectSoft,
        opacity: dim ? 0.3 : undefined,
      }}
    >
      {label}
    </span>
  );
}

/** 系列名称小药丸（第八十二轮再版；第九十轮删来源链接行）：顶部图例页签同款样式
 *  ——统一灰字不取品牌色，点击 = 切换该系列折线显隐（屏蔽态 = 虚线置灰，同页签语言）。
 *  悬停药丸 = 显示该系列的起点指引线（默认全部隐藏）。
 *  避让盒 = 渲染盒（药丸 行高16×行数+内边距6 + 生命周期14）。 */
function ZoneNamePill(props: {
  nm: SeriesNameItem;
  brand: string;
  deltaPct: { pct: number } | null;
  hidden: boolean;
  dimmed: boolean;
  onToggle: (seriesKey: string) => void;
  onHover: (seriesKey: string | null) => void;
}) {
  const { nm } = props;
  const delta = props.deltaPct != null;
  const pct = props.deltaPct?.pct ?? 0;
  const pctLabel = props.deltaPct != null
    ? (pct < 0 ? '\u2212' : pct > 0 ? '+' : '\u00b1') + Math.abs(pct * 100).toFixed(1) + '%'
    : '';
  return (
    <div
      style={{
        position: 'absolute',
        left: Math.max(2, nm.x),
        top: nm.y, // 计划盒 = 渲染盒
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 1,
        opacity: props.hidden ? 0.45 : props.dimmed ? 0.2 : undefined,
        zIndex: 9,
      }}
    >
      <button
        type="button"
        aria-pressed={props.hidden}
        title={props.hidden ? '点击恢复显示该产品' : '点击隐藏该产品'}
        onClick={(e) => {
          e.stopPropagation();
          props.onToggle(nm.seriesKey);
        }}
        onMouseEnter={() => props.onHover(nm.seriesKey)}
        onMouseLeave={() => props.onHover(null)}
        onFocus={() => props.onHover(nm.seriesKey)}
        onBlur={() => props.onHover(null)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          maxWidth: nm.maxW ?? 200,
          padding: '3px 8px',
          background: color.canvas,
          border: `1px ${props.hidden ? 'dashed' : 'solid'} ${props.hidden ? color.hairlineStrong : color.hairline}`,
          borderRadius: radius.pill,
          cursor: 'pointer',
        }}
      >
        <BrandDot brand={props.brand} />
        <span
          style={
            nm.maxW != null
              ? {
                  display: '-webkit-box',
                  WebkitBoxOrient: 'vertical' as const,
                  WebkitLineClamp: 2,
                  overflow: 'hidden',
                  wordBreak: 'break-word',
                  whiteSpace: 'normal',
                  fontSize: 11,
                  lineHeight: '16px',
                  color: color.body,
                }
              : { fontSize: 11, lineHeight: '16px', color: color.body, whiteSpace: 'nowrap' }
          }
        >
          {nm.text}
        </span>
      </button>
      {delta && (
        <span style={{ paddingLeft: 13, fontSize: 11, lineHeight: '13px', whiteSpace: 'nowrap', opacity: props.hidden ? 0.45 : undefined }}>
          <span style={{ color: color.mute, fontWeight: 500 }}>
            生命周期{' '}
          </span>
          <span style={{ color: color.ink, fontWeight: 700, fontFamily: font.family }}>{pctLabel}</span>
        </span>
      )}
    </div>
  );
}

export default function Chart(props: ChartProps) {
  const { series, granularity, currency, priceTypes } = props;
  // 档位带阶梯随产业（tierBandsOf）——产业属全局筛选，从 FiltersContext 直取，
  // 调用方（含量价看板/下钻弹窗）无需逐层传 prop
  const { state: filterState } = useFilters();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const chartDivRef = useRef<HTMLDivElement | null>(null); // ECharts 挂载层（背景带之下、DOM 覆盖层之下）
  const chartRef = useRef<echarts.ECharts | null>(null);
  const [width, setWidth] = useState(0);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  // 第一百一十四轮：悬停纵向位置（容器坐标，钳入绘图区）——横向虚线跟随；
  // 多面板布局经 onCrosshairYMove 上报、crosshairY 受控回灌全部面板
  const [hoverY, setHoverY] = useState<number | null>(null);
  // 聚焦模式（第三十二轮）：多系列时名称退场，悬停折线（±HIT_PX）高亮单系列，
  // 其余系列/徽标/标签降透明；识别职责 = 右上图例 chips（第三十五轮起）
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const focusMode = series.length > FOCUS_MODE_THRESHOLD;
  const focusActive = focusKey != null;
  // 悬停的名称药丸（第八十二轮）：仅该系列的起点指引线可见（默认全部隐藏）
  const [hoverNameKey, setHoverNameKey] = useState<string | null>(null);
  // ---- 第118轮：图内拖选时间段（量价看板）----
  // 拖动数据在 ref 内逐帧变化（anchor/当前列/起点横距/是否已越过拖动阈值），
  // dragging + brushTick 仅驱动重渲；松手提交或清除（见 window 监听 effect）
  const [brushDragging, setBrushDragging] = useState(false);
  const [, setBrushTick] = useState(0);
  const brushDragRef = useRef<{ a: number; b: number; startX: number; moved: boolean } | null>(null);
  const brushEnabled = props.onBrushChange != null && series.length > 0;
  // 窗口标识变化 = 可见列整体重采样（第七轮契约，本轮体检补真消费）：悬停列下标
  // 按旧列号记、窗口一换继续保留会指错列；聚焦态与图内拖选草稿一并复位，避免
  // 跨窗口残留。键未变（含首次挂载）不动作
  const prevWindowKeyRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (prevWindowKeyRef.current === props.windowKey) return;
    prevWindowKeyRef.current = props.windowKey;
    setHoverIdx(null);
    setFocusKey(null);
    brushDragRef.current = null;
    setBrushDragging(false);
  }, [props.windowKey]);
  // 第一百一十五轮：顶部品牌图例带悬停的产品（受控入站）——与图内药丸悬停同语义
  const legendHoverKey = props.legendHoverKey ?? null;
  // 第一百一十六轮 联动高亮集合：悬停名称药丸/图例药丸时 = 仅该系列自身
  //（不再联动其对标竞品/我司）；折线悬停聚焦时 = 单系列。非空时集合外的一切
  //（线/药丸/徽标）降透明。
  const litKeys: string[] | null =
    legendHoverKey != null
      ? [legendHoverKey]
      : hoverNameKey != null
        ? [hoverNameKey]
        : focusKey != null
          ? [focusKey]
          : null;
  // Y 刻度线（第九十一轮）：受控开关，缺省开 = 刻度值+短横线；关 = 仅价格档位
  const [innerShowYTicks, setInnerShowYTicks] = useState(true);
  const showYTicks = props.showYTicks ?? innerShowYTicks;
  const commitShowYTicks = props.onShowYTicks ?? setInnerShowYTicks;
  // Y 轴自动压缩（第二十轮）：齿轮弹层内开关。第三十五轮起默认关 = Y 轴完全连续
  const [innerYCompress, setInnerYCompress] = useState(false);
  const yCompress = props.yCompress ?? innerYCompress;
  const commitYCompress = props.onYCompress ?? setInnerYCompress;
  // 大促背景带（第三十四轮）：俄区促销日历档期着色 + 带内锚点；图下事件行由 index 层渲染
  const [innerPromoBands, setInnerPromoBands] = useState(true);
  const promoBandsOn = props.promoBandsOn ?? innerPromoBands;
  const commitPromoBandsOn = props.onPromoBandsOn ?? setInnerPromoBands;
  const promoBands = props.promoBands ?? [];
  // 中区圆框组的渲染条件已随工具行迁入 ChartToolbar（第五十四轮追补）
  // 折线形态（第三十八轮齿轮可选；第五十四轮追补③加 auto 档并设为缺省）——
  // auto = 按粒度自适应：周=方形阶梯（逐周跳变语义）、月/季=平滑（期内均值画阶梯=失真平台）
  const [innerLineShape, setInnerLineShape] = useState<LineShapeChoice>('auto');
  const lineShapeChoice = props.lineShape ?? innerLineShape;
  const commitLineShape = props.onLineShape ?? setInnerLineShape;
  const lineShape = resolveLineShape(lineShapeChoice, granularity);
  // 价格变化阈值（第四十六轮起受控于标题行开关+连贯滑杆；旧版齿轮 Select 的内部
  // 默认 5 与档位 0.05 单位不一致 = 实际恒关闭，一并修正）
  const changeThreshold = props.changeThreshold ?? null;

  // 图顶预留（第三十五轮定版）：₽/$+齿轮（左）与图例 chips（右）单行 36px；
  // 第四十二轮：大促档期图标移到时间轴与图表之间的窄条，图顶不再随大促行数增高
  const gridTop = props.gridTop ?? 36;
  /* 第三十五轮：点击锁定列（lockedIdx）整体删除——悬停即更新摘要条，无常驻锁定态 */

  // 每格高度伸缩（第十轮）：主图受控于上层 index（同一份 sliderScale 状态），迷你图用内部状态；
  // 齿轮弹层里的滑杆松手才提交，两种模式下都可用
  const [innerSliderScale, setInnerSliderScale] = useState(1);
  const sliderScale = props.sliderScale ?? innerSliderScale;
  const commitSliderScale = props.onSliderScale ?? setInnerSliderScale;

  // ---- Y 轴：自适应分段刻度（外部 yScale 优先——主图用它承接刷选冻结与伸缩倍率；
  //      内部自算必须吃 sliderScale，第十轮修复：此前硬编码 ×1 导致滑杆提交后图表纹丝不动）。
  //      selfPrevRef 传 prev 做步长滞回（第十一轮），迷你图同样获得稳定刻度 ----
  const selfPrevRef = useRef<YScale | null>(null);
  const selfScale: YScale = useMemo(
    () =>
      computeYAxis({
        series,
        priceTypes,
        sliderScale,
        allowBreak: yCompress,
        perUsd: perUsdOf(currency), // 档位锚定 USD（第二十三轮）：迷你图换币种不拉伸
        prev: selfPrevRef.current,
        yMin: props.yLimit?.min ?? null, // 上下限拖柄（第一百六十六轮）：内部自算路径同样吃覆盖
        yMax: props.yLimit?.max ?? null,
      }),
    [series, priceTypes, sliderScale, yCompress, currency, props.yLimit],
  );
  // 滞回基线在渲染提交后写入——useMemo 工厂里写 ref 会被并发丢弃的渲染/StrictMode
  // 双跑污染，被丢弃的中间刻度会成为下次滞回基线
  useEffect(() => {
    selfPrevRef.current = selfScale;
  }, [selfScale]);
  const scale = props.yScale ?? selfScale;

  // ---- 高度过渡动画：animH = 当前视觉高度，缓动逼近目标 scale.plotHeight。
  //      动画期间按比例 k 缩放整段纵向几何（段 pTop/pH、断裂条中心、plotHeight）——
  //      yPxOf/yNormOf 只依赖这些字段，canvas 伪值与 DOM 覆盖层天然同源跟随 ----
  const animHRef = useRef(scale.plotHeight);
  const [animH, setAnimH] = useState(scale.plotHeight);
  const animRafRef = useRef<number | null>(null);
  useEffect(() => {
    const to = scale.plotHeight;
    const from = animHRef.current;
    if (from === to) return;
    // 第一百八十五轮（外部 UX 审计）：系统开启「减少动态效果」时跳过 280ms 缓动，
    // 直接落终值（与 CSS 侧 prefers-reduced-motion 全局降级同语义）
    if (prefersReducedMotion()) {
      if (animRafRef.current != null) cancelAnimationFrame(animRafRef.current);
      animRafRef.current = null;
      animHRef.current = to;
      setAnimH(to);
      return;
    }
    if (Math.abs(to - from) <= H_ANIM_THRESHOLD_PX) {
      if (animRafRef.current != null) cancelAnimationFrame(animRafRef.current);
      animRafRef.current = null;
      animHRef.current = to;
      setAnimH(to);
      return;
    }
    const t0 = performance.now();
    const step = (now: number): void => {
      const p = Math.min(1, (now - t0) / H_ANIM_MS);
      const cur = from + (to - from) * (1 - Math.pow(1 - p, 3)); // easeOutCubic
      animHRef.current = cur;
      setAnimH(cur);
      animRafRef.current = p < 1 ? requestAnimationFrame(step) : null;
    };
    animRafRef.current = requestAnimationFrame(step);
    return () => {
      if (animRafRef.current != null) cancelAnimationFrame(animRafRef.current);
    };
  }, [scale.plotHeight]);
  const k = scale.plotHeight > 0 ? animH / scale.plotHeight : 1;
  const displayScale: YScale = useMemo(() => scaleToDisplay(scale, k), [scale, k]);
  // 容器高由 Y 模型派生：格数×TICK_PX + 断裂条 + 图顶卡片区 + 底边距（跨度大 → 自动变高）；
  // 用 animH（动画中）而非目标高度，大变化时整体缓动伸缩。
  // 第一百一十四轮：tipBox 模式在底边距下再垫一条居中明细预留框（canvas 不进入）
  const tipBoxOn = props.tipBox === true;
  const chartH = gridTop + Math.round(animH) + GRID.bottom;
  const totalH = chartH + (tipBoxOn ? TIP_BOX_H : 0);

  // ---- 容器宽度（ResizeObserver） ----
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const en of entries) setWidth(en.contentRect.width);
    });
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // ---- ECharts 实例 ----
  useEffect(() => {
    const el = chartDivRef.current;
    if (!el) return;
    const chart = echarts.init(el, null, { renderer: 'canvas' });
    chartRef.current = chart;
    return () => {
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  // canvas 跟随容器宽度（第五十四轮：分离显示面板为半宽挂载/容器宽度变化时重设画布，
  // 否则 canvas 保持 init 时刻宽度溢出面板；主图尺寸稳定时 resize 为幂等空操作）
  useEffect(() => {
    chartRef.current?.resize();
  }, [width]);

  // ---- 几何（纯公式复现 grid，保证 DOM 层与 canvas 一致） ----
  const geom: Geom | null = useMemo(
    () =>
      buildGeom({
        width,
        totalH: chartH,
        gridTop,
        series,
        scale: displayScale,
        currency,
        gridLeft: props.gridLeft,
        gridRight: props.gridRight,
      }),
    [width, chartH, gridTop, series, displayScale, currency, props.gridLeft, props.gridRight],
  );

  // ---- 第一百一十五轮（评审）：量价明细框条位置 = 「时间 X 轴标签底」与「容器
  //      下边界」之间垂直居中（此前贴底偏下）；geom 未就绪时空态兜底贴 chartH ----
  const tipBandTop = geom ? geom.plotTop + geom.plotHeight + (props.showXLabels ? 22 : 6) : chartH;
  const tipBandH = Math.max(60, totalH - tipBandTop);

  // ---- 绘图区横向几何原语上报（第十五轮为图下热力带对齐引入；第五十六轮热力带
  //      收进二级抽屉后主流程不再消费，保留通用上报能力）；只按三个原语组成的
  //      key 触发，高度过渡帧（displayScale 变）不重发 ----
  const stripKey = geom ? `${geom.plotLeft}|${geom.plotWidth}|${geom.n}` : '';
  useLayoutEffect(() => {
    props.onGeom?.(geom ? { plotLeft: geom.plotLeft, plotWidth: geom.plotWidth, n: geom.n } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stripKey]);

  // ---- 第118轮：拖选时间段的 window 级监听（拖出图面仍跟手；松手处提交/清除）----
  const geomRef = useRef<Geom | null>(null);
  geomRef.current = geom;
  useEffect(() => {
    if (!brushDragging) return;
    const idxAt = (clientX: number): number | null => {
      const el = wrapRef.current;
      const g = geomRef.current;
      if (!el || !g || g.n === 0) return null;
      const mx = clientX - el.getBoundingClientRect().left;
      return Math.min(g.n - 1, Math.max(0, Math.floor(((mx - g.plotLeft) / g.plotWidth) * g.n)));
    };
    const onMove = (ev: MouseEvent): void => {
      const st = brushDragRef.current;
      if (!st) return;
      if (Math.abs(ev.clientX - st.startX) > 4) st.moved = true;
      const idx = idxAt(ev.clientX);
      if (idx != null && idx !== st.b) {
        st.b = idx;
        setBrushTick((t) => t + 1);
      }
      if (wrapRef.current) wrapRef.current.style.cursor = 'ew-resize';
    };
    const onUp = (): void => {
      const st = brushDragRef.current;
      brushDragRef.current = null;
      setBrushDragging(false);
      if (wrapRef.current) wrapRef.current.style.cursor = 'default';
      if (!st) return;
      if (!st.moved) {
        // 点击（未越过拖动阈值）：已有高亮 = 清除；无高亮 = 忽略，不产生单列高亮
        if (props.brush) props.onBrushChange?.(null, true);
        return;
      }
      props.onBrushChange?.([Math.min(st.a, st.b), Math.max(st.a, st.b)], true);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brushDragging]);

  // ---- 端点标记（S=真实起点 / E=连续 3 区间无值才确认的截止 / in·out=窗口续接点），
  //      语义详见 chartModel.buildEndpointMarks；canvas 不画默认符号，DOM 徽标接管 ----
  const endpointMarks = useMemo(() => buildEndpointMarks(series), [series]);
  // 第一百二十五轮：跨接吸收的孤立有值点集（悬停小圆点不叠画）；系列级缓存避免每次悬停重算
  const absorbedByKey = useMemo(
    () => new Map(series.map((s) => [s.key, gapAbsorbedIdx(s.points)])),
    [series],
  );

  // ---- 生命周期调价幅度（第二十七轮：仅季粒度，系列名第二行）----
  // 恒本币、锚在数据（与窗口/显示币种无关）；完结/在售统显「生命周期 −X%」（第二十九轮：不再带「暂」）
  // 第三十二轮：先于 labelPlan 计算——第二行高度要计入名称避让盒
  const lifecycleDeltas = useMemo(() => {
    const m = new Map<string, LifecycleDelta | null>();
    if (granularity !== 'quarter') return m;
    for (const s of series) m.set(s.key, lifecycleDeltaOf(s.skuIds));
    return m;
  }, [series, granularity]);

  // ---- 标签避让计划（价格标签 dy + 系列名位置 + 可见集）----
  // 规则详见 chartModel.buildLabelPlan（P0 必放首末 + S/E 端点（第二十轮），超聚焦阈值
  // 时最大/最小降 P1（第三十二轮）；P1 = 变价点（周）/显示值变化点（月/季）冲突即隐；
  // lifecycleRow：季粒度生命周期第二行计入名称避让盒（第三十二轮，名称互压根因修复））
  // 系列名跳转载体（第五十七轮建；第五十九轮改直显目的地）：每系列最后一个
  // 有值且带 url 的点（退市后停在清库末点，语义仍是「该产品现页」）
  const nameAll = props.nameSeries ?? series;
  const labelMode = props.labelMode ?? 'detail';

  const labelPlan = useMemo(
    () =>
      buildLabelPlan({
        geom,
        series,
        granularity,
        priceTypes,
        endpointMarks,
        lifecycleRow: (key) => lifecycleDeltas.get(key) != null,
        nameOnlySeries: nameAll.filter((s) => !series.some((v) => v.key === s.key)),
        hiddenKeys: props.hiddenKeys,
        hideNames: props.hideNamePills === true, // 第一百一十三轮：量价面板禁画名称药丸
        labelMode, // 第一百一十四轮：精简 = 仅最高/最低/最新三价
      }),
    [geom, series, granularity, priceTypes, endpointMarks, lifecycleDeltas, props.hiddenKeys, nameAll, props.hideNamePills, labelMode],
  );

  // ---- ECharts option（值轴隐藏，数据喂归一化伪值；纯构建见 chartModel.buildOption）----
  // focusKey（第三十二轮聚焦模式）：非聚焦系列降透明 0.15、数值标签隐藏
  const option = useMemo(
    () =>
      buildOption({
        geom,
        series,
        priceTypes,
        granularity,
        labelPlan,
        gridTop,
        endpointMarks,
        focusKey,
        focusKeys: litKeys ?? undefined,
        lineShape,
        xLabels: props.showXLabels === true, // 第110轮：分离面板自带时间轴标签
        labelMode,
        gridRight: props.gridRight,
      }),
    [geom, series, priceTypes, granularity, labelPlan, gridTop, endpointMarks, focusKey, litKeys, lineShape, props.showXLabels, labelMode, props.gridRight],
  );

  // ---- setOption / resize ----
  useEffect(() => {
    const c = chartRef.current;
    if (!c) return;
    if (geom && option) {
      c.resize();
      c.setOption(option, { notMerge: true });
    } else {
      c.clear();
    }
  }, [option, geom]);

  // ---- 悬停定位（鼠标 x → 桶下标；点左右各占一半区间的命中语义由取整保证） ----
  const locate = (e: ReactMouseEvent<HTMLDivElement>): { idx: number; mx: number; my: number } | null => {
    const el = wrapRef.current;
    if (!el || !geom) return null;
    const rect = el.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    if (mx < geom.plotLeft || mx > geom.plotLeft + geom.plotWidth) return null;
    const idx = Math.min(geom.n - 1, Math.max(0, Math.floor((mx - geom.plotLeft) / (geom.plotWidth / geom.n))));
    return { idx, mx, my };
  };

  const onMouseMove = (e: ReactMouseEvent<HTMLDivElement>): void => {
    const hit = locate(e);
    const el = wrapRef.current;
    // 图顶区（币种/齿轮/图例 chips 行）不是时间轴触发域：悬停列清空
    if (hit && hit.my < gridTop) {
      setHoverIdx(null);
      setHoverY(null);
      setFocusKey(null);
      props.onCrosshairMove?.(null); // 第110轮：跨图参考线随悬停列清空
      props.onCrosshairYMove?.(null); // 第一百一十四轮：横向虚线一并清空
      if (el) el.style.cursor = 'default';
      return;
    }
    if (!hit) {
      setHoverIdx(null);
      setHoverY(null);
      setFocusKey(null);
      props.onCrosshairMove?.(null);
      props.onCrosshairYMove?.(null);
      if (el) el.style.cursor = 'default';
      return;
    }
    setHoverIdx(hit.idx);
    props.onCrosshairMove?.(hit.idx); // 第110轮：上报时间列 → 其他分离面板画同列参考线
    // 第一百一十四轮：纵向位置钳入绘图区上报 → 全部面板同高度横向虚线（逐像素跟随）
    if (geom) {
      const y = Math.min(
        geom.plotTop + geom.plotHeight,
        Math.max(geom.plotTop, Math.round(hit.my)),
      );
      setHoverY(y);
      props.onCrosshairYMove?.(y);
    }
    // 聚焦检测（第三十二轮）：悬停列上最近的有值系列（±HIT_PX）→ 高亮该系列；
    // 空白处悬停 = 取消聚焦（全部系列恢复常态）
    if (focusMode && geom) {
      let bestKey: string | null = null;
      let bestD = Number.POSITIVE_INFINITY;
      for (const s of series) {
        const v = primaryPriceOf(s.points[hit.idx], priceTypes);
        if (v == null) continue;
        const d = Math.abs(hit.my - yPxOf(geom, v));
        if (d < bestD) {
          bestD = d;
          bestKey = s.key;
        }
      }
      setFocusKey(bestKey != null && bestD <= HIT_PX ? bestKey : null);
    }
    if (el) el.style.cursor = brushDragging ? 'ew-resize' : brushEnabled ? 'crosshair' : props.enableDrill ? 'pointer' : 'default';
  };

  const onMouseLeave = (): void => {
    setHoverIdx(null);
    setHoverY(null);
    setFocusKey(null);
    props.onCrosshairMove?.(null); // 第110轮：移出图表 = 跨图参考线全部移除
    props.onCrosshairYMove?.(null); // 第一百一十四轮：横向虚线一并移除
    if (wrapRef.current) wrapRef.current.style.cursor = 'default';
  };

  const onClick = (e: ReactMouseEvent<HTMLDivElement>): void => {
    if (!geom) return;
    const hit = locate(e);
    if (!hit || hit.my < gridTop) return; // 图顶区点击不进入图表（图例 chips 点击已 stopPropagation）
    // 第三十五轮：点击锁定列删除——点击仅保留月/季圈点下钻
    if (props.enableDrill && props.onDrill) {
      let bestKey: string | null = null;
      let bestD = Number.POSITIVE_INFINITY;
      for (const s of series) {
        const v = primaryPriceOf(s.points[hit.idx], priceTypes);
        if (v == null) continue;
        const d = Math.abs(hit.my - yPxOf(geom, v));
        if (d < bestD) {
          bestD = d;
          bestKey = s.key;
        }
      }
      if (bestKey && bestD <= HIT_PX) {
        props.onDrill(bestKey, series[0].points[hit.idx].bucketId);
      }
    }
  };

  // ---- 第118轮：图内按下开始拖选（绘图区内起手；图顶工具行不触发）----
  const onBrushMouseDown = (e: ReactMouseEvent<HTMLDivElement>): void => {
    if (!brushEnabled || !geom) return;
    const hit = locate(e);
    if (!hit || hit.my < gridTop) return;
    brushDragRef.current = { a: hit.idx, b: hit.idx, startX: e.clientX, moved: false };
    setBrushDragging(true);
    if (wrapRef.current) wrapRef.current.style.cursor = 'ew-resize';
  };

  // ---- offer 图标与端点徽标的几何（纯构建见 chartModel） ----
  const offerMarkers = useMemo(
    () => buildOfferMarkers({ enabled: props.enableOffer, geom, series, priceTypes }),
    [props.enableOffer, geom, series, priceTypes],
  );
  const endpointBadges = useMemo(
    () => buildEndpointBadges({ geom, series, marks: endpointMarks, priceTypes }),
    [geom, series, endpointMarks, priceTypes],
  );
  // 特殊降价点（第三十五轮）：降幅 ≥10% 的点位 DOM 徽标数据
  const changeMarks = useMemo(
    () => (changeThreshold == null ? new Map<string, number>() : buildChangeMarks(series, changeThreshold)),
    [series, changeThreshold],
  );
  const empty = series.length === 0;
  const brandByKey = useMemo(() => new Map([...series, ...nameAll].map((s) => [s.key, s.brand])), [series, nameAll]);

  // ---- DOM 刻度/断轴/档位带数据（纯构建见 chartModel） ----
  // 左缘布局（第八十九轮）：[档位区块(贴左缘 0)=档位文字居左|灰竖线|刻度文字右对齐叠带上][短横线][名称预留带][绘图区]。
  // 轴区总宽恒定，不随「显示 Y 刻度线」开关变化（开关只控标签/短横线/网格线显隐）；
  // 刻度文字叠画在档位区块背景上（zIndex 2），区块与名称预留带之间以短横线过渡。
  const tickZoneRight = geom ? geom.plotLeft - NAME_ZONE_W : 0; // 轴区右缘（短横线起点）
  const tickRows = useMemo(() => thinTickRows(buildTickRows(geom)), [geom]);

  // 有值档位过滤（第八轮）：完全不存在该价格档位的数据时不显示该档（用户反馈 400~600 空档）
  const tierValues = useMemo(() => collectTierValues(series, priceTypes), [series, priceTypes]);

  const showTierBand = currency === 'usd' && geom != null && props.axisChrome !== false;
  const tierBoxes = useMemo(
    () => buildTierBoxes({ enabled: showTierBand, geom, tierValues, industry: filterState.industry }),
    [showTierBand, geom, tierValues, filterState.industry],
  );

  // 第一百一十三轮（评审）：明细浮层取数列 = 本图真实悬停列优先，缺省回落外部联动列
  // （crosshairIdx，第110轮参考线机制延伸）——分离模式悬停任一面板时间列，其余面板
  // 同列同步出各自的明细浮层。十字实线/快照/下钻图标仍只跟 hoverIdx（真实鼠标）
  // 第118轮：高亮时间段提交后，悬停明细只响应时间段内（时间段外整体降透明）
  const tipIdxRaw = hoverIdx ?? props.crosshairIdx ?? null;
  const brushCommitted = props.brush ?? null;
  const tipIdx =
    brushCommitted && tipIdxRaw != null && (tipIdxRaw < brushCommitted[0] || tipIdxRaw > brushCommitted[1])
      ? null
      : tipIdxRaw;

  return (
    <div
      ref={wrapRef}
      style={{ position: 'relative', width: '100%', height: totalH } as CSSProperties}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      onMouseDown={onBrushMouseDown}
      onClick={onClick}
    >
      {/* 背景带层（canvas 之下，第三十五轮：点击锁定的灰色列背景已删，只留大促带） */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
        {geom &&
          promoBandsOn &&
          promoBands.map((b) => {
            const bw = geom.plotWidth / geom.n;
            const left = geom.plotLeft + (b.startIdx + b.startFrac) * bw;
            const right = geom.plotLeft + (b.endIdx + b.endFrac) * bw;
            const w = Math.max(2, right - left);
            const fill =
              b.depth === '深'
                ? 'rgba(235, 87, 87, 0.055)'
                : b.depth === '中'
                  ? 'rgba(235, 87, 87, 0.035)'
                  : 'rgba(235, 87, 87, 0.018)';
            return (
              <div key={`pb-${b.key}`}>
                <div
                  style={{
                    position: 'absolute',
                    left,
                    top: geom.plotTop,
                    width: w,
                    height: geom.plotHeight,
                    background: fill,
                  }}
                />
              </div>
            );
          })}
      </div>
      {/* ECharts 挂载层（第一百一十四轮：高度不含 tipBox 预留框——canvas 网格仍止于底边距） */}
      <div ref={chartDivRef} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: chartH, zIndex: 1 }} />
      {empty && (
        <div
          style={{
            height: '100%',
            display: 'grid',
            placeItems: 'center',
            color: color.mute,
            fontSize: fontSize.bodySm,
          }}
        >
          {props.emptyHint ?? '暂无数据，请先在上方筛选器选择产品'}
        </div>
      )}
      {geom && (
        <>
          {/* 图顶工具行（第五十二轮单行三区 → 第五十四轮追补抽 ChartToolbar 共享组件）：
              左 = 币种符号 + 齿轮弹层 + 折后价/RRP 胶囊；右 = 大促/offer/极值/变化提醒
              圆框组（居右，阈值数值定宽防抖动）。分离模式面板 chrome=false 整行不渲染——
              由面板网格上方的常驻工具行统一控制（index 层渲染同一组件） */}
          {props.chrome !== false && (
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                height: gridTop,
                width: '100%',
                display: 'flex',
                // 功能键一行在上，产品药丸一行在下；两行之间、药丸与绘图区之间留出间距
                flexDirection: props.legend ? 'column' : 'row',
                alignItems: props.legend ? 'stretch' : 'center',
                justifyContent: 'flex-start',
                gap: props.legend ? 20 : 0,
                padding: props.legend ? '8px 6px 20px' : '0 6px',
                boxSizing: 'border-box',
                zIndex: 3,
              }}
            >
              <ChartToolbar
                priceTypesAfter={props.priceTypesAfter}
                currency={currency}
                sliderScale={sliderScale}
                onSliderScale={commitSliderScale}
                showYTicks={showYTicks}
                onShowYTicks={commitShowYTicks}
                yCompress={yCompress}
                onYCompress={commitYCompress}
                // 追补⑤修：必须传「原始三态」——此前传解析后的二值形态，
                // auto 永远轮不到选中（选自适应 = 仍亮在阶梯/平滑，用户：无选中态）
                lineShape={lineShapeChoice}
                onLineShape={commitLineShape}
                priceTypes={priceTypes}
                onPriceTypeToggle={props.onPriceTypeToggle}
                tipMode={props.tipMode}
                onTipMode={props.onTipMode}
                labelMode={props.labelMode}
                onLabelMode={props.onLabelMode}
                pointPanelOpen={props.pointPanelOpen}
                onPointPanelToggle={props.onPointPanelToggle}
                promoBandsOn={promoBandsOn}
                onPromoBandsOn={commitPromoBandsOn}
                offersOn={props.offersOn}
                onOffersOn={props.onOffersOn}
                changeThreshold={changeThreshold}
                onChangeThreshold={props.onChangeThreshold}
              />
              {/* 药丸带整行（第一百七十九轮）：工具行之下的完整一行（左起满宽，
                  垂直居中于剩余高度）；横向超出隐匿（药丸带自带块内滚动） */}
              {props.legend && (
                <div style={{ minHeight: 0, display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
                  {props.legend}
                </div>
              )}
            </div>
          )}
          {/* 悬停小页签的比率口径（第一百八十轮，Eason）：discount=折扣率（vs RRP，
              缺省）；wow=周环比（vs 上一周期折后价）——由标题行「页签显示」开关控制 */}
          {/* DOM 刻度标签（8px；ECharts 值轴已隐藏）。第九十一轮：随齿轮「Y 刻度线」
              开关显隐（关 = 只留档位带）；绘图区网格提示线已移除（第九十轮）；
              分离面板 axisChrome=false 时标签/短横线由共享轴列承担 */}
          {showYTicks && tickRows.map((t) => (
            <Fragment key={`tk-${t.v}`}>
              {props.axisChrome !== false && (
                <div
                  className="tnum"
                  style={{
                    position: 'absolute',
                    // 刻度文字右对齐、叠画在档位区块背景上（区块右段）；第一百八十五轮
                    // 起字号取共享常量 Y_TICK_FONT=10（原 8px 过小不可读）
                    left: tickZoneRight - TICK_DASH_W - TICK_ZONE_W,
                    top: Math.round(t.y) - 7,
                    width: TICK_ZONE_W,
                    paddingRight: 3,
                    boxSizing: 'border-box',
                    textAlign: 'right',
                    fontSize: Y_TICK_FONT,
                    lineHeight: '14px',
                    color: color.mute,
                    pointerEvents: 'none',
                    zIndex: 2,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {t.text}
                </div>
              )}
              {/* 刻度短横线：画在轴区右外侧、与刻度文字/绘图区刻度位对齐，
                  表达「文字 ↔ 折线位置」关系 */}
              {props.axisChrome !== false && (
                <div
                  style={{
                    position: 'absolute',
                    left: tickZoneRight - TICK_DASH_W,
                    top: Math.round(t.y) - 0.5,
                    width: TICK_DASH_W,
                    height: 1,
                    background: color.hairlineStrong,
                    pointerEvents: 'none',
                    zIndex: 1,
                  }}
                />
              )}
            </Fragment>
          ))}
          {/* 断裂轴：压缩空白条 = 绘图区极浅灰带（暗示该段值域被隐藏）+ 上下虚线边，
              轴上为纵向省略号标注（第八轮：替代斜线符号） */}
          {geom.scale.breaks.map((b, i) => {
            const stripTop = geom.plotTop + b - BREAK_PX / 2;
            return (
              <div key={`brk-${i}`}>
                {/* 极浅灰带（zIndex 0 = 画在数据线之下，但断裂带内本就无数据线） */}
                <div
                  style={{
                    position: 'absolute',
                    left: geom.plotLeft,
                    top: Math.round(stripTop),
                    width: geom.plotWidth,
                    height: BREAK_PX,
                    background: color.canvasSoft2,
                    borderTop: `1px dashed ${color.hairlineStrong}`,
                    borderBottom: `1px dashed ${color.hairlineStrong}`,
                    opacity: 0.85,
                    pointerEvents: 'none',
                    zIndex: 0,
                  }}
                />
                {/* 轴上纵向省略号（⋮）：刻度列居中（「Y 轴自动压缩」关闭 = 不产生断轴，自然无符号）；
                    分离面板 axisChrome=false 时由共享轴列绘制。第一百八十二轮：悬停提示 +
                    role=img 明示「刻度非连续」，避免把压缩段读成连续坐标 */}
                {props.axisChrome !== false && (
                  <svg
                    width="14"
                    height="16"
                    viewBox="0 0 14 16"
                    role="img"
                    aria-label="刻度非连续：段与段之间的值域已压缩"
                    style={{
                      position: 'absolute',
                      left: tickZoneRight - TICK_DASH_W / 2 - 7,
                      top: geom.plotTop + b - 8,
                      pointerEvents: 'auto',
                      cursor: 'help',
                      zIndex: 2,
                    }}
                  >
                    <title>刻度非连续：段与段之间的值域已压缩</title>
                    {[3, 8, 13].map((cy) => (
                      <circle key={cy} cx="7" cy={cy} r="1.5" fill={color.hairlineStrong} />
                    ))}
                  </svg>
                )}
              </div>
            );
          })}
          {/* 档位区块（仅 USD）：贴容器左缘的整块竖向色带 = [档位文字区 | 灰竖线 | 刻度文字区]，
              刻度（zIndex 2）与短横线叠画在区块上；无数据的档 = 虚线占位（第三十二轮，梯子连续可读）；
              本币不渲染；图隐藏（空态）时整块消失。
              第九十一轮：分界竖线删除；档位文字三行竖排居中（关「Y 刻度线」时居中整块） */}
          {showTierBand &&
            tierBoxes.map((tb, i) => (
              <div
                key={`tier-${tb.label}-${i}`}
                title={`价格档位 ${tb.label}（USD）${tb.empty ? '· 当前无产品' : ''}`}
                style={{
                  position: 'absolute',
                  left: 0,
                  top: tb.top,
                  width: AXIS_BAND_W,
                  height: tb.h,
                  boxSizing: 'border-box',
                  border: tb.empty ? `1px dashed ${color.hairline}` : `1px solid ${color.hairline}`,
                  background: tb.empty ? 'transparent' : i % 2 === 0 ? color.canvasSoft2 : color.canvasSoft,
                  display: 'flex',
                  alignItems: 'center',
                  overflow: 'hidden',
                  pointerEvents: 'none',
                  zIndex: 1,
                }}
              >
                <span
                  style={{
                    // 关「Y 刻度线」时档位文字居中整个轴区宽度（第九十一轮）
                    width: showYTicks ? TIER_LABEL_W : AXIS_BAND_W,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 9,
                    lineHeight: '11px',
                    color: tb.empty ? color.mute : color.body,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {(() => {
                    // 恒三行竖排（第九十三轮：矮档不再退化单行）
                    const parts = tierLabelShort(tb.label).split('~');
                    const lines = parts.length === 2 ? [parts[0], '~', parts[1]] : [tierLabelShort(tb.label)];
                    return lines.map((ln, k) => <span key={`${ln}-${k}`}>{ln}</span>);
                  })()}
                </span>
              </div>
            ))}
          {/* Y 轴上下限拖柄（第一百六十六轮，Eason）：轴区上/下缘细拖柄，拖动自定义
              价格上限/下限；传入 onYLimit 才渲染（分离面板 chrome=false 不渲染——
              共享轴列 SplitAxisColumn 承担），双击恢复自动 */}
          {props.onYLimit && geom && props.axisChrome !== false && (
            <YLimitHandles
              scale={displayScale}
              plotTop={geom.plotTop}
              plotHeight={geom.plotHeight}
              trackWidth={tickZoneRight}
              limit={props.yLimit ?? { min: null, max: null }}
              onLimit={props.onYLimit}
            />
          )}
          {/* 价格变化点（第三十五轮起；第四十二轮阈值齿轮可调、含上涨）：相较前一有值点
              |Δ|≥阈值的点下方 ↓/↑X% 徽标（Keepa「价格下降了 30%」画法）；聚焦降透明。
              第一百二十五轮：y 锚定主价口径（primaryPriceOf）——仅 RRP 视图贴 RRP 线，
              变化率仍按折后价比较 */}
          {geom &&
            series.map((s) =>
              s.points.map((pt, i) => {
                const chg = changeMarks.get(`${s.key}|${i}`);
                const v = primaryPriceOf(pt, priceTypes);
                if (chg == null || v == null) return null;
                const down = chg < 0;
                const pct = Math.round(Math.abs(chg) * 100);
                const dim = litKeys != null && !litKeys.includes(s.key);
                return (
                  <span
                    key={`dp-${s.key}|${i}`}
                    title={`较前一有值点${down ? '下降' : '上涨'} ${pct}%`}
                    style={{
                      position: 'absolute',
                      left: xPxOf(geom, i),
                      top: yPxOf(geom, v) + 9,
                      transform: 'translateX(-50%)',
                      padding: '0 5px',
                      fontSize: 10,
                      lineHeight: '14px',
                      fontWeight: 700,
                      color: down ? '#b45309' : color.link,
                      background: color.canvas,
                      border: `1px solid ${down ? 'rgba(235, 87, 87, 0.4)' : 'rgba(0, 112, 243, 0.35)'}`,
                      borderRadius: radius.pill,
                      pointerEvents: 'none',
                      zIndex: 8,
                      opacity: dim ? 0.15 : undefined,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {down ? '↓' : '↑'}
                    {pct}%
                  </span>
                );
              }),
            )}
          {/* 大促档期标志（第四十二轮窄条）：默认纯图标（名称悬停可见）；空间够
              （与相邻标志互不重叠、不越绘图区左右缘）时显示「图标 + 档期名」胶囊，
              放不下自动回落纯图标（第一百四十七轮，Eason） */}
          {promoBandsOn &&
            geom &&
            (() => {
              const items = promoBands
                .map((b) => ({
                  b,
                  mid: geom.plotLeft + (((b.startIdx + b.startFrac + b.endIdx + b.endFrac) / 2 / geom.n) * geom.plotWidth),
                }))
                .sort((x, y) => x.mid - y.mid);
              const ICON_W = 16;
              const labelW = (name: string): number => ICON_W + 4 + measureText(name) * (10 / 13) + 12;
              let lastRight = -Infinity;
              return items.map(({ b, mid }, i) => {
                const lo = i === 0 ? geom.plotLeft - 16 : lastRight + 8;
                const hi = i + 1 < items.length ? items[i + 1].mid - 10 : geom.plotLeft + geom.plotWidth + 16;
                const w = labelW(b.name);
                const withLabel = mid - w / 2 >= lo && mid + w / 2 <= hi;
                lastRight = mid + (withLabel ? w / 2 : ICON_W / 2);
                return (
                  <div
                    key={`pm-${b.key}`}
                    style={{
                      position: 'absolute',
                      left: mid,
                      // 专用行（第四十七轮）：轴标签 margin 22 下推，图标带 +4~18 独占；
                      // 第110轮：小图自带时间轴标签（占 +7~19）→ 档期标志下移让位（+24~38，
                      // 仍在 GRID.bottom=40 留白内）
                      top: geom.plotTop + geom.plotHeight + (props.showXLabels ? 24 : 4),
                      transform: 'translateX(-50%)',
                      zIndex: 9,
                    }}
                  >
                    <Popover trigger="click" placement="top" content={<PromoEventCard band={b} />}>
                      <button
                        type="button"
                        aria-label={`${b.name} ${b.dateText}，点击看档期详情`}
                        title={`${b.name} ${b.dateText} · 点击看档期详情`}
                        onClick={(e) => e.stopPropagation()}
                        className="lpl-hit"
                        style={{
                          position: 'relative',
                          pointerEvents: 'auto',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          height: 16,
                          padding: withLabel ? '0 7px 0 5px' : '0 2px',
                          borderRadius: radius.pill,
                          border: withLabel ? '1px solid rgba(180, 83, 9, 0.3)' : undefined,
                          background: withLabel ? color.canvas : undefined,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <TagOutlined style={{ fontSize: withLabel ? 10 : 12, color: '#b45309' }} />
                        {withLabel && (
                          <span style={{ fontSize: 10, lineHeight: '12px', color: '#b45309', fontWeight: 500 }}>{b.name}</span>
                        )}
                      </button>
                    </Popover>
                  </div>
                );
              });
            })()}
          {/* 悬停明细（第三十五轮，Keepa 式）：时间 + 各产品折后价。
              第一百一十三轮（评审）：取数列 tipIdx = 本图悬停列 ?? 外部联动列。
              第一百一十四轮（评审）：tipBox 模式（量价看板）不画浮层——同一份明细
              内容改渲在图下方居中预留框（无悬停显灰色斜体提示），不再遮挡图面 */}
          {(() => {
            if (tipIdx == null || !geom || tipIdx >= geom.n) return null;
            const rows = series
              .map((s) => ({ s, v: primaryPriceOf(s.points[tipIdx], priceTypes) }))
              .filter((r) => r.v != null) as { s: (typeof series)[number]; v: number }[];
            // tipBox 模式悬停列无采数（如后上市产品悬停到上市前时间）：框内出日期 +
            // 灰字说明，不回落「请鼠标移入」提示（鼠标确已在图上）
            if (tipBoxOn && rows.length === 0) {
              return (
                <div
                  style={{
                    position: 'absolute',
                    top: tipBandTop,
                    left: 0,
                    right: 0,
                    height: tipBandH,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    pointerEvents: 'none',
                    zIndex: 20,
                  }}
                >
                  <div
                    style={{
                      minWidth: 240,
                      maxWidth: '86%',
                      padding: '7px 14px',
                      background: color.canvas,
                      border: `1px solid ${color.hairline}`,
                      borderRadius: radius.card,
                      fontSize: 12,
                      color: color.body,
                    }}
                  >
                    <span style={{ fontWeight: 600, color: color.ink }}>
                      {fmt_hoverDate(granularity, series[0]?.points[tipIdx]?.xLabel ?? '')}
                    </span>
                    <span style={{ marginLeft: 10, color: color.mute }}>该时间无采集价格</span>
                  </div>
                </div>
              );
            }
            if (rows.length === 0) return null;
            // 第一百一十三轮：量价看板传入的该列销量（与 points 同下标）；null = 不出销量行
            const volVal = props.volumes?.[tipIdx] ?? null;
            // 第四十八轮：有 offer 的系列在价格行下附权益行；第五十轮改结构化三字段
            // （折扣/分期/赠品 各占一行，只出有值的字段），随「offer 权益」开关整体显隐
            const offerRows = rows.map((r) =>
              props.enableOffer ? offerLineItems(r.s.points[tipIdx]?.offer) : [],
            );
            const nOfferLines = offerRows.reduce((acc, l) => acc + l.length, 0);
            // 第六十一轮：浮窗宽度随内容动态适配——三列各取本列最宽数值，间距收紧
            //（gap 6），不再用固定 324 留白。第一百八十四轮：列宽换算成 px 供表头
            // 与数据行共用（ch 随字号变化，10px 表头与 13/14px 数值同 ch 数不同宽 =
            // 此前表头与列错位的根因），表头与数值一律列内居中
            const priceCh = Math.max(...rows.map((r) => fmt_mm(r.v).length));
            const rrpCh = Math.max(
              2,
              ...rows.map((r) => {
                const rr = r.s.points[tipIdx].rrp;
                return rr != null ? fmt_mm(rr).length : 0;
              }),
            );
            const priceW = Math.round(priceCh * 8.4) + 8; // 数值 14px tabular：数字 ≈0.6em
            const rrpW = Math.max(30, Math.round(rrpCh * 7.2) + 8); // 数值 12px tabular
            const body = (
              <>
                <div style={{ fontSize: 12, fontWeight: 600, color: color.ink, marginBottom: 3 }}>
                  {fmt_hoverDate(granularity, series[0]?.points[tipIdx]?.xLabel ?? '')}
                </div>
                {/* 列标题行（第一百八十轮立完整表头；第一百八十四轮，Eason：列序改
                    RRP → 折后价 → 周环比|折扣率，表头与数据列同宽同居中）。
                    第一百八十八轮（Eason）：标题改墨色、与数据行紧贴，列间竖线
                    满行高——表头(13)接数据行(20)首尾相续成一条贯穿线，不再断线 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, lineHeight: '13px', fontWeight: 600, color: color.ink }}>
                  <span style={{ width: 8, flexShrink: 0 }} />
                  <span style={{ flex: '1 1 0', minWidth: 0 }}>产品</span>
                  <span className="tnum" style={{ width: rrpW, textAlign: 'center', flexShrink: 0, whiteSpace: 'nowrap' }}>RRP</span>
                  <span aria-hidden style={{ width: 1, height: 13, background: color.hairlineStrong, flexShrink: 0 }} />
                  <span className="tnum" style={{ width: priceW, textAlign: 'center', flexShrink: 0, whiteSpace: 'nowrap' }}>折后价</span>
                  <span aria-hidden style={{ width: 1, height: 13, background: color.hairlineStrong, flexShrink: 0 }} />
                  <span style={{ width: 38, textAlign: 'center', flexShrink: 0, whiteSpace: 'nowrap' }}>
                    {props.tipMode === 'discount' ? '折扣率' : '周环比'}
                  </span>
                  {/* 尾部快照占位已随快照入口一并删除（188 轮）：两侧 flex 分配必须
                      对称，否则数据行名称列比表头宽、整列右移错位 */}
                </div>
                {rows.map(({ s, v }, ri) => {
                  const pt = s.points[tipIdx];
                  const dim = litKeys != null && !litKeys.includes(s.key);
                  const items = offerRows[ri];
                  // 周环比（第一百八十轮）：本列折后价相对上一列；首列/缺采 = null
                  const prevV = tipIdx > 0 ? primaryPriceOf(s.points[tipIdx - 1], priceTypes) : null;
                  const wow = prevV != null && prevV > 0 && v != null ? v / prevV - 1 : null;
                  // 折扣率胶囊（第五十二轮）：与时点卡同语言（vs RRP；仅折后价口径出）
                  const disc =
                    priceTypes.discounted && pt?.price != null && pt?.rrp != null && pt.rrp > 0
                      ? pt.price / pt.rrp - 1
                      : null;
                  return (
                    <Fragment key={s.key}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: 13,
                          lineHeight: '20px',
                          opacity: dim ? 0.3 : undefined,
                        }}
                      >
                        <BrandDot brand={s.brand} />
                        {/* flex 1 吸收剩余宽度：右侧三列定宽从右缘起算，跨行同列对齐 */}
                        <span
                          title={curveNameOf(s)}
                          style={{ flex: '1 1 0', minWidth: 0, color: color.body, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        >
                          {curveNameOf(s)}
                        </span>
                        {/* 三列定宽列内居中（第一百八十四轮：同 px 宽与表头共列，居中
                            对齐；原右对齐 + 表头 ch 宽随字号缩水导致表头错位）。
                            现价字号=折线上价格标签同款 14px；span 用 inline-block 使
                            width+textAlign 生效 */}
                        <span
                          className="tnum"
                          style={{ width: rrpW, textAlign: 'center', flexShrink: 0, display: 'inline-block', fontSize: 12, color: pt?.rrp != null ? color.mute : 'transparent', textDecoration: 'line-through' }}
                        >
                          {pt?.rrp != null ? fmt_mm(pt.rrp) : '0'}
                        </span>
                        {/* 竖线满行高（188 轮）：相邻行首尾相续、上接表头线 = 一条贯穿 */}
                        <span aria-hidden style={{ width: 1, height: 20, background: color.hairlineStrong, flexShrink: 0 }} />
                        <span className="tnum" style={{ width: priceW, textAlign: 'center', flexShrink: 0, display: 'inline-block', fontSize: 14, fontWeight: 600, color: color.ink }}>
                          {fmt_mm(v)}
                        </span>
                        <span aria-hidden style={{ width: 1, height: 20, background: color.hairlineStrong, flexShrink: 0 }} />
                        <span style={{ width: 38, flexShrink: 0, display: 'inline-flex', justifyContent: 'center' }}>
                          {props.tipMode !== 'discount'
                            ? (wow != null && (
                                <span
                                  className="tnum"
                                  title={`折后价较上一周期${wow > 0 ? `+${Math.round(Math.abs(wow) * 1000) / 10}%` : wow < 0 ? `−${Math.round(Math.abs(wow) * 1000) / 10}%` : '持平'}`}
                                  // 第一百八十五轮（外部 UX 审计）：时间涨跌全站唯一口径
                                  // = 涨蓝（color.link）跌琥珀（#b45309），原「涨琥珀跌蓝」翻转；
                                  // 琥珀态底色随 MiniDiscountBadge 同款 warningSoft，保证小字对比度
                                  style={{
                                    flexShrink: 0,
                                    padding: '0 5px',
                                    fontSize: 10,
                                    lineHeight: '15px',
                                    fontWeight: 700,
                                    borderRadius: radius.pill,
                                    color: wow > 0.005 ? color.link : wow < -0.005 ? '#b45309' : selectSoftInk,
                                    background: wow < -0.005 ? color.warningSoft : selectSoft,
                                    opacity: dim ? 0.3 : undefined,
                                  }}
                                >
                                  {wow > 0 ? '+' : wow < 0 ? '−' : '±'}{Math.round(Math.abs(wow) * 1000) / 10}%
                                </span>
                              ))
                            : (disc != null && <MiniDiscountBadge discount={disc} dim={dim} />)}
                        </span>
                        {/* 快照入口已删除（本轮，Eason）：悬停小卡只读；取证走明细表快照列 */}
                      </div>
                      {items.map((it) => (
                        <div
                          key={it.kind}
                          style={{
                            paddingLeft: 13,
                            fontSize: 11,
                            lineHeight: '16px',
                            display: 'flex',
                            gap: 5,
                            opacity: dim ? 0.3 : undefined,
                          }}
                        >
                          <span style={{ color: color.mute, flexShrink: 0 }}>{it.label}</span>
                          <span
                            style={{
                              color: color.warning,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {it.text}
                          </span>
                        </div>
                      ))}
                    </Fragment>
                  );
                })}
                {/* 第一百一十三轮：销量行（量价看板传入 volumes 时）——价格行同语言：
                    顶部 1px hairline 分隔、行高 18px，小灰字 label + tnum 数值右对齐；
                    该列值 null（缺采/未传）整行不渲染 */}
                {volVal != null && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      marginTop: 2,
                      paddingTop: 3,
                      borderTop: `1px solid ${color.hairline}`,
                      fontSize: 11,
                      lineHeight: '18px',
                    }}
                  >
                    <span style={{ color: color.mute, flexShrink: 0 }}>销量</span>
                    <span
                      className="tnum"
                      style={{ marginLeft: 'auto', flexShrink: 0, fontWeight: 600, color: color.ink, whiteSpace: 'nowrap' }}
                    >
                      {fmt_mm(Math.round(volVal))}
                      <span style={{ marginLeft: 2, fontWeight: 400, color: color.mute }}>台</span>
                    </span>
                  </div>
                )}
              </>
            );
            // ---- tipBox 模式：图下方居中预留框（本图悬停 ?? 外部联动列均有内容） ----
            if (tipBoxOn) {
              return (
                <div
                  style={{
                    position: 'absolute',
                    top: tipBandTop,
                    left: 0,
                    right: 0,
                    height: tipBandH,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    pointerEvents: 'none',
                    zIndex: 20,
                  }}
                >
                  <div
                    style={{
                      minWidth: 240,
                      maxWidth: '86%',
                      padding: '7px 14px',
                      background: color.canvas,
                      border: `1px solid ${color.hairline}`,
                      borderRadius: radius.card,
                    }}
                  >
                    {body}
                  </div>
                </div>
              );
            }
            // ---- 浮层模式：跟随十字竖线，右缘自动左翻 ----
            const x0 = xPxOf(geom, tipIdx);
            const nameEst = Math.max(...rows.map((r) => curveNameOf(r.s).length)) * 6.2 + 14;
            const hasSnap = rows.some((r) => r.s.points[tipIdx]?.price != null);
            const W = Math.ceil(20 + 6 * 6 + 2 + 38 + priceCh * 8.5 + rrpCh * 7.3 + Math.max(96, nameEst)) + (hasSnap ? 16 : 0);
            const flip = x0 + 16 + W > geom.plotLeft + geom.plotWidth;
            const left = flip ? x0 - 16 - W : x0 + 16;
            const top = Math.min(
              Math.max(geom.plotTop + 8, 40),
              geom.plotTop + geom.plotHeight - 36 - (rows.length * 20 + nOfferLines * 16 + (volVal != null ? 23 : 0)),
            );
            return (
              <div
                style={{
                  position: 'absolute',
                  left,
                  top,
                  width: W,
                  background: color.canvas,
                  border: `1px solid ${color.hairline}`,
                  borderRadius: radius.card,
                  boxShadow: shadow.l2,
                  padding: '6px 10px 7px',
                  pointerEvents: 'none',
                  zIndex: 20,
                }}
              >
                {body}
              </div>
            );
          })()}
          {/* tipBox 模式无悬停时的居中提示（第一百一十四轮，评审：预留框常驻，
              灰色斜体提示引导鼠标移入上方图表；悬停在无采数列时改显「该时间无采集价格」） */}
          {tipBoxOn && (tipIdx == null || !geom || tipIdx >= geom.n) && (
            <div
              style={{
                position: 'absolute',
                top: tipBandTop,
                left: 0,
                right: 0,
                height: tipBandH,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
                zIndex: 20,
              }}
            >
              <span style={{ fontSize: 12, color: color.mute, fontStyle: 'italic' }}>
                请鼠标移入上方图表查看时点详细信息
              </span>
            </div>
          )}
          {/* 十字竖线（DOM 层，替代 ECharts axisPointer） */}
          {hoverIdx != null && hoverIdx < geom.n && (
            <div
              style={{
                position: 'absolute',
                left: Math.round(xPxOf(geom, hoverIdx)) - 0.5,
                top: geom.plotTop,
                width: 1,
                height: geom.plotHeight,
                background: color.hairlineStrong,
                opacity: 0.7,
                pointerEvents: 'none',
                zIndex: 1,
              }}
            />
          )}
          {/* 跨图参考线（第110轮，评审）：分离模式下其他面板悬停的时间列在本面板
              同列画 1px 虚线（本面板自身悬停 = 上面的实线十字已足够，不叠画）；
              任意面板移出即全部移除 */}
          {props.crosshairIdx != null &&
            props.crosshairIdx < geom.n &&
            hoverIdx == null && (
              <div
                style={{
                  position: 'absolute',
                  left: Math.round(xPxOf(geom, props.crosshairIdx)) - 0.5,
                  top: geom.plotTop,
                  width: 1,
                  height: geom.plotHeight,
                  background: `repeating-linear-gradient(180deg, ${color.hairlineStrong} 0 4px, transparent 4px 8px)`,
                  opacity: 0.55,
                  pointerEvents: 'none',
                  zIndex: 1,
                }}
              />
            )}
          {/* 横向虚线（第一百一十四轮，评审）：跟随鼠标纵向位置实时变化——本图悬停
              （hoverY，逐像素）优先，缺省回落外部联动 crosshairY（多面板共享 Y 轴，
              任一面板悬停 → 全部面板同高度画线，横向虚线横跨所有图） */}
          {(hoverY ?? props.crosshairY ?? null) != null &&
            (hoverY ?? props.crosshairY)! >= geom.plotTop &&
            (hoverY ?? props.crosshairY)! <= geom.plotTop + geom.plotHeight && (
              <div
                style={{
                  position: 'absolute',
                  left: geom.plotLeft,
                  top: Math.round(hoverY ?? props.crosshairY!) - 0.5,
                  width: geom.plotWidth,
                  height: 1,
                  background: `repeating-linear-gradient(90deg, ${color.hairlineStrong} 0 4px, transparent 4px 8px)`,
                  opacity: 0.55,
                  pointerEvents: 'none',
                  zIndex: 1,
                }}
              />
            )}
          {/* 图内拖选时间段（第118轮，量价看板三面板联动高亮分析）：拖动中/已提交的
              高亮带 + 时间段外整体降透明 + 高亮区顶部时间范围胶囊（点 × 清除）；
              无高亮悬停时出「↔ 拖动选择时间段」暗示（视觉暗示可拖选） */}
          {(() => {
            if (!geom || !brushEnabled) return null;
            const drag = brushDragRef.current;
            const range: [number, number] | null = drag
              ? [Math.min(drag.a, drag.b), Math.max(drag.a, drag.b)]
              : (props.brush ?? null);
            const dateOf = (i: number): string => fmt_hoverDate(granularity, series[0]?.points[i]?.xLabel ?? '');
            if (!range || range[1] < range[0]) {
              if (drag || hoverIdx == null) return null;
              return (
                <div
                  style={{
                    position: 'absolute',
                    left: geom.plotLeft + geom.plotWidth / 2,
                    top: geom.plotTop + 6,
                    transform: 'translateX(-50%)',
                    zIndex: 16,
                    pointerEvents: 'none',
                  }}
                >
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      padding: '2px 10px',
                      fontSize: 11,
                      lineHeight: '16px',
                      color: color.body,
                      background: 'rgba(255, 255, 255, 0.92)',
                      border: `1px solid ${color.hairline}`,
                      borderRadius: radius.pill,
                      boxShadow: shadow.l2,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    ↔ 拖动选择时间段
                  </span>
                </div>
              );
            }
            const [bs, be] = range;
            const colW = geom.plotWidth / geom.n;
            const bandLeft = geom.plotLeft + bs * colW;
            const bandW = (be - bs + 1) * colW;
            const plotRight = geom.plotLeft + geom.plotWidth;
            const chipCenter = Math.min(Math.max(bandLeft + bandW / 2, geom.plotLeft + 96), plotRight - 96);
            return (
              <>
                {/* 高亮带（绘图区全高，画在数据线之上、价格标记之下） */}
                <div
                  style={{
                    position: 'absolute',
                    left: bandLeft,
                    top: geom.plotTop,
                    width: bandW,
                    height: geom.plotHeight,
                    background: 'rgba(0, 112, 243, 0.08)',
                    borderTop: '1px solid rgba(0, 112, 243, 0.5)',
                    borderBottom: '1px solid rgba(0, 112, 243, 0.5)',
                    pointerEvents: 'none',
                    zIndex: 6,
                  }}
                />
                {/* 时间段外降透明（白幕盖住折线/柱/价格标记，浮层与胶囊在其上） */}
                {bandLeft - geom.plotLeft > 0.5 && (
                  <div
                    style={{
                      position: 'absolute',
                      left: geom.plotLeft,
                      top: geom.plotTop,
                      width: bandLeft - geom.plotLeft,
                      height: geom.plotHeight,
                      background: 'rgba(255, 255, 255, 0.66)',
                      pointerEvents: 'none',
                      zIndex: 15,
                    }}
                  />
                )}
                {plotRight - (bandLeft + bandW) > 0.5 && (
                  <div
                    style={{
                      position: 'absolute',
                      left: bandLeft + bandW,
                      top: geom.plotTop,
                      width: plotRight - (bandLeft + bandW),
                      height: geom.plotHeight,
                      background: 'rgba(255, 255, 255, 0.66)',
                      pointerEvents: 'none',
                      zIndex: 15,
                    }}
                  />
                )}
                {/* 高亮区顶部时间范围胶囊（× 清除；按下/点击不透传，避免误起拖选） */}
                <div
                  style={{
                    position: 'absolute',
                    left: chipCenter,
                    top: geom.plotTop + 4,
                    transform: 'translateX(-50%)',
                    zIndex: 16,
                  }}
                >
                  <span
                    onMouseDown={(ev) => ev.stopPropagation()}
                    onClick={(ev) => ev.stopPropagation()}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '1px 6px 1px 9px',
                      fontSize: 11,
                      lineHeight: '17px',
                      color: selectSoftInk,
                      background: color.canvas,
                      border: '1px solid rgba(0, 112, 243, 0.5)',
                      borderRadius: radius.pill,
                      boxShadow: shadow.l2,
                      whiteSpace: 'nowrap',
                      userSelect: 'none',
                    }}
                  >
                    <span className="tnum">
                      {dateOf(bs)} – {dateOf(be)}
                    </span>
                    {!drag && (
                      <button
                        type="button"
                        aria-label="清除时间段选择"
                        title="清除时间段选择"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          props.onBrushChange?.(null, true);
                        }}
                        className="lpl-hit"
                        style={{
                          position: 'relative',
                          display: 'inline-grid',
                          placeItems: 'center',
                          width: 14,
                          height: 14,
                          borderRadius: '50%',
                          cursor: 'pointer',
                          color: color.mute,
                        }}
                      >
                        <CloseOutlined style={{ fontSize: 8 }} />
                      </button>
                    )}
                  </span>
                </div>
              </>
            );
          })()}
          {/* 图例悬停指引线（第一百一十五轮）：顶部品牌图例带悬停某产品 → 图内该系列
              价格线起点画竖向虚线（横跨绘图区）+ 起点品牌色小圆点，提示线的位置；
              同时该系列与对标映射系列保持常态、其余降透明（litKeys 机制） */}
          {(() => {
            if (legendHoverKey == null || !geom) return null;
            const target = [...series, ...nameAll].find((s) => s.key === legendHoverKey);
            if (!target) return null;
            let idx = -1;
            let val: number | null = null;
            for (let i = 0; i < target.points.length; i++) {
              const v = primaryPriceOf(target.points[i], priceTypes);
              if (v != null) {
                idx = i;
                val = v;
                break;
              }
            }
            if (idx < 0 || val == null) return null;
            const gx = Math.round(xPxOf(geom, idx)) - 0.5;
            const brandDot = (
              <span
                aria-hidden
                style={{
                  position: 'absolute',
                  left: xPxOf(geom, idx),
                  top: yPxOf(geom, val),
                  width: 7,
                  height: 7,
                  transform: 'translate(-50%, -50%)',
                  borderRadius: '50%',
                  boxSizing: 'border-box',
                  background: target.color,
                  border: '1.5px solid #fff',
                  boxShadow: '0 0 0 1px rgba(0,0,0,0.08)',
                  pointerEvents: 'none',
                  zIndex: 8,
                }}
              />
            );
            return (
              <div key="legend-guide">
                <div
                  style={{
                    position: 'absolute',
                    left: gx,
                    top: geom.plotTop,
                    width: 1,
                    height: geom.plotHeight,
                    background: `repeating-linear-gradient(180deg, ${color.hairlineStrong} 0 4px, transparent 4px 8px)`,
                    opacity: 0.8,
                    pointerEvents: 'none',
                    zIndex: 7,
                  }}
                />
                {brandDot}
              </div>
            );
          })()}
          {/* 悬停数据点小圆点（第一百一十四轮，评审）：悬停/联动时间列上有值的系列
              各画一枚品牌色小圆点（白描边），取代原快照/下钻悬停图标；该点已有
              S/E/‹› 端点徽标或属跨接孤立点时不叠画 */}
          {tipIdx != null &&
            tipIdx < geom.n &&
            series.map((s) => {
              const pt = s.points[tipIdx];
              const v = pt ? primaryPriceOf(pt, priceTypes) : null;
              if (v == null) return null;
              const mk = endpointMarks.get(`${s.key}|${tipIdx}`);
              if (mk || absorbedByKey.get(s.key)?.has(tipIdx)) return null; // 端点徽标已在同位表达 / 跨接孤立点无可见点
              const dim = litKeys != null && !litKeys.includes(s.key);
              return (
                <span
                  key={`hd-${s.key}`}
                  aria-hidden
                  style={{
                    position: 'absolute',
                    left: xPxOf(geom, tipIdx),
                    top: yPxOf(geom, v),
                    width: HOVER_DOT_PX,
                    height: HOVER_DOT_PX,
                    transform: 'translate(-50%, -50%)',
                    borderRadius: '50%',
                    boxSizing: 'border-box',
                    background: s.color,
                    border: '1.5px solid #fff',
                    boxShadow: '0 0 0 1px rgba(0,0,0,0.08)',
                    pointerEvents: 'none',
                    zIndex: 8,
                    opacity: dim ? 0.15 : undefined,
                  }}
                />
              );
            })}
          {/* 端点徽标（第十四轮引入；第五十四轮追补④改版）：数据点圆点取消后 S/E 无需
              再用字母承载——S=起点 / E=截止改为品牌色实心小圆点（直径 8px = 原徽标一半，
              白描边浮在折线端点上方即可表达「开始/结束」）；‹/›=窗口边缘续接点维持
              白底品牌描边+外向箭头（数据在窗口外延续）。
              聚焦模式（第三十二轮）：非聚焦系列降透明 */}
          {endpointBadges.map((b) => {
            const se = b.kind === 'S' || b.kind === 'E';
            const dim = litKeys != null && !litKeys.includes(b.key.split('|')[0]);
            if (se) {
              return (
                <span
                  key={`ep-${b.key}`}
                  title={
                    b.kind === 'S'
                      ? '起点（该配置首个有价周）'
                      : '截止（其后连续数周无数据）'
                  }
                  style={{
                    position: 'absolute',
                    left: b.x,
                    top: b.y,
                    width: 8,
                    height: 8,
                    transform: 'translate(-50%, -50%)',
                    borderRadius: '50%',
                    boxSizing: 'border-box',
                    background: b.color,
                    border: '1.5px solid #fff',
                    boxShadow: '0 0 0 1px rgba(0,0,0,0.08)',
                    pointerEvents: 'none',
                    zIndex: 8,
                    opacity: dim ? 0.15 : undefined,
                  }}
                />
              );
            }
            return (
              <div
                key={`ep-${b.key}`}
                title={
                  b.kind === 'in'
                    ? '左侧还有更早的价格数据，可拉长时间范围查看'
                    : '右侧还有更新的价格数据，可拉长时间范围查看'
                }
                style={{
                  position: 'absolute',
                  left: b.x,
                  top: b.y,
                  width: 13,
                  height: 13,
                  transform: 'translate(-50%, -50%)',
                  borderRadius: '50%',
                  boxSizing: 'border-box',
                  display: 'grid',
                  placeItems: 'center',
                  background: color.canvas,
                  border: `1.5px solid ${b.color}`,
                  color: b.color,
                  fontSize: 10,
                  fontWeight: 700,
                  lineHeight: 1,
                  fontFamily: font.family,
                  pointerEvents: 'none',
                  zIndex: 8,
                  opacity: dim ? 0.15 : undefined,
                }}
              >
                {b.kind === 'in' ? '‹' : '›'}
              </div>
            );
          })}
          {/* 系列名称小药丸（第八十二轮再版）：顶部图例页签同款（统一灰字不取品牌色），
              点击 = 切换折线显隐（屏蔽态虚线置灰），取代上方图例页签职能；来源链接
              斜体挂药丸下方；指引线默认隐藏、悬停药丸才显示该系列的起点引线。
              zIndex 9 = 全图层最上。聚焦模式不再隐藏药丸（它们承担显隐开关职能），
              悬停折线聚焦时非聚焦药丸降透明。 */}
          {(() => {
            return (
              <>
                {/* 名称引线（第八十二轮）：默认全部隐藏，悬停名称药丸时画该系列
                    起点连接线（zIndex 8，徽标层之下、药丸之下） */}
                <svg
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    pointerEvents: 'none',
                    zIndex: 8,
                  }}
                >
                  {labelPlan.names
                    .filter((nm) => !nm.hidden && nm.seriesKey === hoverNameKey)
                    .map((nm) => (
                      <line
                        key={`ld-${nm.seriesKey}`}
                        x1={nm.x + nm.w + 3}
                        y1={nm.y + nm.h / 2}
                        x2={nm.anchorX - 8}
                        y2={nm.anchorY}
                        stroke={color.hairlineStrong}
                        strokeWidth={1}
                        opacity={0.9}
                      />
                    ))}
                </svg>
                {labelPlan.names.map((nm) => (
                  <ZoneNamePill
                    key={`nm-${nm.seriesKey}`}
                    nm={nm}
                    brand={brandByKey.get(nm.seriesKey) ?? ''}
                    deltaPct={lifecycleDeltas.get(nm.seriesKey) ?? null}
                    hidden={nm.hidden ?? false}
                    dimmed={litKeys != null && !litKeys.includes(nm.seriesKey)}
                    onToggle={(k) => props.onToggleHidden?.(k)}
                    onHover={setHoverNameKey}
                  />
                ))}
              </>
            );
          })()}
          {/* offer 图标（仅周视图；点击浮窗） */}
          {offerMarkers.map((m) => (
            <OfferPopover key={m.key} x={m.x} y={m.y} offer={m.offer} />
          ))}
          {/* 快照取证弹窗（第一百四十轮追补）：入口在悬停明细每行行尾（图面不画
              图标，第一百一十四轮撤图面悬停图标的原则不变）；图下明细表取证列
              仍各有一份入口，两路同弹窗 */} 
          {/* 悬停列上只画品牌色小圆点；月/季下钻仍由点击有值点（±HIT_PX）触发 */}
        </>
      )}
    </div>
  );
}
