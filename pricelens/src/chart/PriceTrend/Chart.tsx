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
// - 折后价：monotone 平滑实线品牌色（我司 3px / 竞品 2px），白底圆环圈点 r≈3.5
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
// ============================================================
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { Popover } from 'antd';
import { ExportOutlined, TagOutlined } from '@ant-design/icons';
// 按需注册（第十八轮）：全量 'echarts' → core + Line/Scatter + Grid + Canvas，
// bundle 约省 500KB；本图只画 line/scatter（RRP step、缺采虚线桥均 line），tooltip 已禁用
import * as echarts from 'echarts/core';
import { LineChart, ScatterChart } from 'echarts/charts';
import { GridComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([LineChart, ScatterChart, GridComponent, CanvasRenderer]);
import type { CurrencyMode, Granularity, Series, SeriesPoint } from '../../dataModel/types';
import { color, font, fontSize, formatPrice, radius, selectSoft, selectSoftInk, shadow } from '../../theme/tokens';
import { lifecycleDeltaOf, type LifecycleDelta } from '../../dataModel/aggregate';
import {
  BREAK_PX,
  GRID,
  NAME_ZONE_W,
  estGridLeft,
  TICK_PX,
  AXIS_BAND_W,
  AXIS_GAP,
  TICK_ZONE_W,
  TICK_DASH_W,
  computeYAxis,
  perUsdOf,
  xPxOf,
  yPxOf,
  type Geom,
  type StripGeom,
  type YScale,
} from './helpers';
// 纯计算层（第十八轮抽离）：几何/标签计划/端点/option/DOM 数据全部显式入参纯函数
import {
  buildChangeMarks,
  buildExtremeMarks,
  curveNameOf,
  FOCUS_MODE_THRESHOLD,

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
  type ExtremeMark,
  type LineShapeChoice,
  type PromoBand,
  type SeriesNameItem,
} from './chartModel';
import SnapshotIcon from './SnapshotIcon';
import SnapshotModal, { type SnapshotInfo } from './SnapshotModal';
import DrillIcon from './DrillIcon';
import OfferPopover from './OfferPopover';
import ChartToolbar from './ChartToolbar';
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
  /** 图顶卡片区预留高；缺省按 series 数量推（gridTopFor） */
  gridTop?: number;
  // 系列图例页签由看板层通过 legend 注入图顶工具行中央，底部只保留时间轴。
  enableDrill?: boolean; // 月/季视图圈点下钻
  enableJump?: boolean; // 周视图悬停跳转
  enableOffer?: boolean; // 周视图 offer 图标
  onDrill?: (seriesKey: string, bucketId: string) => void;
  emptyHint?: string;
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
  /** 绘图区横向几何原语上报（第十五轮：促销热力带与时间轴逐像素对齐用） */
  onGeom?: (g: StripGeom | null) => void;
  /** 大促背景带开关（第三十四轮，受控，缺省内部状态 true）：俄区促销档期在绘图区着色 */
  promoBandsOn?: boolean;
  /** 开关提交（缺省写内部状态） */
  onPromoBandsOn?: (v: boolean) => void;
  /** 促销带数据（index 层按窗口算好；空 = 无带） */
  promoBands?: PromoBand[];
  /** 最高/最低价点标签（第三十六轮改口径：Keepa 式点旁胶囊；标题行开关） */
  maxMinOn?: boolean;
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
  /** 最高/最低价开关提交（中区圆框组） */
  onMaxMinOn?: (v: boolean) => void;
  /** 价格变化提醒开关+阈值提交（中区圆框组；null=关） */
  onChangeThreshold?: (v: number | null) => void;
  /** 第五十六轮：打开促销力度明细抽屉（工具行「⋯ 更多」二级菜单入口） */
  onOpenPromoDetail?: () => void;
  // ---- 第五十四轮追补：工具行抽 ChartToolbar 共享组件；分离模式面板 chrome=false
  //      不渲染设置行，由面板网格上方的常驻工具行统一控制 ----
  /** 图顶工具行显隐（缺省 true）；false = 整行不渲染（含齿轮），gridTop 由调用方收窄 */
  chrome?: boolean;
  /** 图顶工具行中间的系列页签；用于把图例从时间区域上移到工具行中央。 */
  legend?: ReactNode;
  /** 轴列绘制（第五十四轮追补⑤）：false = 面板不画档位带/刻度标签/断轴省略号——
   *  分离模式这三样由卡片外侧的共享轴列（SplitAxisColumn）统一承担，面板只留绘图区；
   *  Y 刻度横线仍随 showYTicks 画在面板内（读数辅助属于绘图区） */
  axisChrome?: boolean;
  /** Y 刻度线显隐（受控；缺省内部状态——下钻弹窗等自管场景不受影响） */
  showYTicks?: boolean;
  onShowYTicks?: (v: boolean) => void;
  /** 第七十四轮（分离面板）：true = 系列名全部固定进左侧名称预留带空白处，
   *  不锚在各折线起点旁；主图与下钻弹窗缺省关闭维持原避让语义 */
  namesInZone?: boolean;
  /** 第八十二轮：名称药丸全集（含已屏蔽系列——药丸仍渲染为虚线置灰态）；缺省 = series */
  nameSeries?: Series[];
  /** 屏蔽中的系列 key 集（与 nameSeries 搭配；药丸点击 → onToggleHidden 切换） */
  hiddenKeys?: Set<string>;
  /** 名称药丸点击的显隐切换回调；缺省 = 药丸不可切换 */
  onToggleHidden?: (seriesKey: string) => void;
  /** 第八十八轮：系列联动映射（竞品⇄我司）——悬停名称药丸时返回与该系列
   *  联动高亮的系列 key 集；缺省 = 无联动（悬停只亮自身） */
  pairingsOf?: (seriesKey: string) => string[];
  /** 折线形态（受控；缺省内部状态）。'auto' = 按粒度自适应（第五十四轮追补③：
   *  周=阶梯 / 月季=平滑，默认） */
  lineShape?: LineShapeChoice;
  onLineShape?: (v: LineShapeChoice) => void;
  // 第五十三轮：图例页签订阅铃铛撤除——订阅入口上移到时点页签（PriceSummary）尾
  // （用户：铃铛应在「上面大的页签」即来源链接之后，不该在图表小页签上）
}

const HIT_PX = 12; // 圈点点击/悬停命中半径

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
        fontSize: 10.5,
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

/** 系列名称小药丸（第八十二轮再版）：顶部图例页签同款样式——统一灰字不取品牌色，
 *  点击 = 切换该系列折线显隐（屏蔽态 = 虚线置灰，同页签语言）；来源链接斜体挂在
 *  药丸下方，仍直达商城现页。悬停药丸 = 显示该系列的起点指引线（默认全部隐藏）。
 *  避让盒 = 渲染盒（药丸 行高16×行数+内边距6 + 链接13 + 生命周期14）。 */
function ZoneNamePill(props: {
  nm: SeriesNameItem;
  brand: string;
  deltaPct: { pct: number } | null;
  latest: SeriesPoint | undefined;
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
      <span
        role="button"
        aria-pressed={props.hidden}
        title={props.hidden ? '点击恢复显示该产品' : '点击屏蔽该产品'}
        onClick={(e) => {
          e.stopPropagation();
          props.onToggle(nm.seriesKey);
        }}
        onMouseEnter={() => props.onHover(nm.seriesKey)}
        onMouseLeave={() => props.onHover(null)}
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
      </span>
      {props.latest && (
        <a
          href={props.latest.url}
          target="_blank"
          rel="noreferrer"
          title={`打开来源商城 · ${props.latest.shopName ?? '电商平台'}（现页，价格以截图为准）`}
          onClick={(e) => e.stopPropagation()}
          onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
          onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 2,
            fontSize: 10.5,
            lineHeight: '13px',
            fontStyle: 'italic',
            fontWeight: 500,
            color: color.link,
            whiteSpace: 'nowrap',
          }}
        >
          {props.latest.shopName ?? '来源'}
          <ExportOutlined style={{ fontSize: 9 }} />
        </a>
      )}
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
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const chartDivRef = useRef<HTMLDivElement | null>(null); // ECharts 挂载层（背景带之下、DOM 覆盖层之下）
  const chartRef = useRef<echarts.ECharts | null>(null);
  const [width, setWidth] = useState(0);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  // 聚焦模式（第三十二轮）：多系列时名称退场，悬停折线（±HIT_PX）高亮单系列，
  // 其余系列/徽标/标签降透明；识别职责 = 右上图例 chips（第三十五轮起）
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const focusMode = series.length > FOCUS_MODE_THRESHOLD;
  const focusActive = focusKey != null;
  // 悬停的名称药丸（第八十二轮）：仅该系列的起点指引线可见（默认全部隐藏）
  const [hoverNameKey, setHoverNameKey] = useState<string | null>(null);
  // 第八十八轮 联动高亮集合：悬停名称药丸时 = 该系列 + 其映射系列（我司⇄竞品）；
  // 折线悬停聚焦时 = 单系列。非空时集合外的一切（线/药丸/徽标）降透明。
  const litKeys: string[] | null =
    hoverNameKey != null && props.pairingsOf
      ? [hoverNameKey, ...props.pairingsOf(hoverNameKey)]
      : focusKey != null
        ? [focusKey]
        : null;
  // Y 刻度线显隐（第十二轮）：齿轮弹层内开关。第三十五轮起默认关（迪总：不自动选择）。
  // 第五十四轮追补：可受控（分离模式下由常驻工具行统一写，全面板同值）
  const [innerShowYTicks, setInnerShowYTicks] = useState(false);
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
  // 页面快照浮窗（第五十轮）：悬停「快照」图标点击弹出——历史点取证 = 截图，不再跳现页
  const [snapInfo, setSnapInfo] = useState<SnapshotInfo | null>(null);

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
  const selfScale: YScale = useMemo(() => {
    const next = computeYAxis({
      series,
      priceTypes,
      sliderScale,
      allowBreak: yCompress,
      perUsd: perUsdOf(currency), // 档位锚定 USD（第二十三轮）：迷你图换币种不拉伸
      prev: selfPrevRef.current,
    });
    selfPrevRef.current = next;
    return next;
  }, [series, priceTypes, sliderScale, yCompress, currency]);
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
  // 用 animH（动画中）而非目标高度，大变化时整体缓动伸缩
  const totalH = gridTop + Math.round(animH) + GRID.bottom;

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
        totalH,
        gridTop,
        series,
        scale: displayScale,
        currency,
        gridLeft: props.gridLeft,
      }),
    [width, totalH, gridTop, series, displayScale, currency, props.gridLeft],
  );

  // ---- 绘图区横向几何原语上报（第十五轮为图下热力带对齐引入；第五十六轮热力带
  //      收进二级抽屉后主流程不再消费，保留通用上报能力）；只按三个原语组成的
  //      key 触发，高度过渡帧（displayScale 变）不重发 ----
  const stripKey = geom ? `${geom.plotLeft}|${geom.plotWidth}|${geom.n}` : '';
  useLayoutEffect(() => {
    props.onGeom?.(geom ? { plotLeft: geom.plotLeft, plotWidth: geom.plotWidth, n: geom.n } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stripKey]);

  // ---- 端点标记（S=真实起点 / E=连续 3 区间无值才确认的截止 / in·out=窗口续接点），
  //      语义详见 chartModel.buildEndpointMarks；canvas 不画默认符号，DOM 徽标接管 ----
  const endpointMarks = useMemo(() => buildEndpointMarks(series), [series]);

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
  // 系列名跳转载体（第五十七轮建；第五十九轮改直显目的地）：每系列最后一个
  // 有值且带 url 的点（退市后停在清库末点，语义仍是「该产品现页」）。
  // 第八十二轮：按名称药丸全集取（已屏蔽系列药丸仍带来源链接）。
  const nameAll = props.nameSeries ?? series;
  const latestPointByKey = useMemo(() => {
    const m = new Map<string, SeriesPoint>();
    for (const s of nameAll) {
      for (let i = s.points.length - 1; i >= 0; i--) {
        const p = s.points[i];
        if (p.price != null && p.url) {
          m.set(s.key, p);
          break;
        }
      }
    }
    return m;
  }, [nameAll]);

  const labelPlan = useMemo(
    () =>
      buildLabelPlan({
        geom,
        series,
        granularity,
        priceTypes,
        endpointMarks,
        lifecycleRow: (key) => lifecycleDeltas.get(key) != null,
        sourceRow: (key) => latestPointByKey.has(key),
        forceNameZone: props.namesInZone === true,
        nameOnlySeries: nameAll.filter((s) => !series.some((v) => v.key === s.key)),
        hiddenKeys: props.hiddenKeys,
      }),
    [geom, series, granularity, priceTypes, endpointMarks, lifecycleDeltas, latestPointByKey, props.namesInZone, props.hiddenKeys, nameAll],
  );

  // ---- ECharts option（值轴隐藏，数据喂归一化伪值；纯构建见 chartModel.buildOption）----
  // focusKey（第三十二轮聚焦模式）：非聚焦系列降透明 0.15、数值标签隐藏
  const option = useMemo(
    () => buildOption({ geom, series, priceTypes, granularity, labelPlan, gridTop, endpointMarks, focusKey, focusKeys: litKeys ?? undefined, lineShape }),
    [geom, series, priceTypes, granularity, labelPlan, gridTop, endpointMarks, focusKey, litKeys, lineShape],
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
      setFocusKey(null);
      if (el) el.style.cursor = 'default';
      return;
    }
    if (!hit) {
      setHoverIdx(null);
      setFocusKey(null);
      if (el) el.style.cursor = 'default';
      return;
    }
    setHoverIdx(hit.idx);
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
    if (el) el.style.cursor = props.enableDrill ? 'pointer' : 'default';
  };

  const onMouseLeave = (): void => {
    setHoverIdx(null);
    setFocusKey(null);
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

  // ---- offer 图标与端点徽标的几何（纯构建见 chartModel） ----
  const offerMarkers = useMemo(
    () => buildOfferMarkers({ enabled: props.enableOffer, geom, series }),
    [props.enableOffer, geom, series],
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
  // 最高/最低极值点（第三十六轮点标签口径；主价口径窗口极值及首个出现下标）
  const extremeMarks: ExtremeMark[] = useMemo(
    () => buildExtremeMarks({ geom, series, priceTypes }),
    [geom, series, priceTypes],
  );

  const empty = series.length === 0;
  const brandByKey = useMemo(() => new Map([...series, ...nameAll].map((s) => [s.key, s.brand])), [series, nameAll]);

  // ---- DOM 刻度/断轴/档位带数据（纯构建见 chartModel） ----
  // 左缘布局（第八十六轮定宽）：[档位带(仅USD) 40][刻度文字 44][短横线 6][名称预留带][绘图区]。
  // 轴区总宽恒定，不随「显示 Y 刻度线」开关变化（开关只控标签/短横线/网格线显隐）；
  // 档位带盒贴容器左缘（bandLeft = 0），刻度文字右对齐，短横线画在轴区右缘与刻度对齐。
  const tickZoneRight = geom ? geom.plotLeft - NAME_ZONE_W : 0; // 轴区右缘（短横线起点）
  const bandLeft = tickZoneRight - TICK_DASH_W - AXIS_GAP - AXIS_BAND_W;
  const tickRows = useMemo(() => buildTickRows(geom), [geom]);

  // 有值档位过滤（第八轮）：完全不存在该价格档位的数据时不显示该档（用户反馈 400~600 空档）
  const tierValues = useMemo(() => collectTierValues(series, priceTypes), [series, priceTypes]);

  const showTierBand = currency === 'usd' && geom != null && props.axisChrome !== false;
  const tierBoxes = useMemo(
    () => buildTierBoxes({ enabled: showTierBand, geom, tierValues }),
    [showTierBand, geom, tierValues],
  );

  return (
    <div
      ref={wrapRef}
      style={{ position: 'relative', width: '100%', height: totalH } as CSSProperties}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
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
      {/* ECharts 挂载层 */}
      <div ref={chartDivRef} style={{ position: 'absolute', inset: 0, zIndex: 1 }} />
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
                alignItems: 'center',
                padding: '0 6px',
                boxSizing: 'border-box',
                zIndex: 3,
              }}
            >
              <ChartToolbar
                legend={props.legend}
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
                promoBandsOn={promoBandsOn}
                onPromoBandsOn={commitPromoBandsOn}
                offersOn={props.offersOn}
                onOffersOn={props.onOffersOn}
                maxMinOn={props.maxMinOn}
                onMaxMinOn={props.onMaxMinOn}
                changeThreshold={changeThreshold}
                onChangeThreshold={props.onChangeThreshold}
                onOpenPromoDetail={props.onOpenPromoDetail}
              />
            </div>
          )}
          {/* DOM 刻度线 + 缩写标签（12px，与时间轴同字号；ECharts 值轴已隐藏；齿轮弹层可关）。
              第五十四轮追补⑤：分离面板 axisChrome=false 时标签由共享轴列承担，面板只画横线 */}
          {showYTicks && tickRows.map((t) => (
            <Fragment key={`tk-${t.v}`}>
              <div
                style={{
                  position: 'absolute',
                  left: geom.plotLeft,
                  top: Math.round(t.y) - 0.5,
                  width: geom.plotWidth,
                  height: 1,
                  background: color.hairline,
                  pointerEvents: 'none',
                  zIndex: 0,
                }}
              />
              {props.axisChrome !== false && (
                <div
                  className="tnum"
                  style={{
                    position: 'absolute',
                    // 第八十六轮：刻度文字右对齐、贴在档位带右界一侧（9px 灰字，
                    // 比档位带标签小一号、同底部时间轴颜色）；宽度恒定不随开关变化
                    left: tickZoneRight - TICK_DASH_W - TICK_ZONE_W,
                    top: Math.round(t.y) - 7,
                    width: TICK_ZONE_W,
                    textAlign: 'right',
                    fontSize: 9,
                    lineHeight: '14px',
                    color: color.mute,
                    pointerEvents: 'none',
                    zIndex: 1,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {t.text}
                </div>
              )}
              {/* 刻度短横线（第八十六轮）：画在轴区右外侧、与刻度文字/绘图区刻度位对齐，
                  表达「文字 ↔ 折线位置」关系；随「显示 Y 刻度线」开关显隐（轴宽恒定不变） */}
              {showYTicks && props.axisChrome !== false && (
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
                    分离面板 axisChrome=false 时由共享轴列绘制 */}
                {props.axisChrome !== false && (
                  <svg
                    width="14"
                    height="16"
                    viewBox="0 0 14 16"
                    style={{
                      position: 'absolute',
                      left: tickZoneRight - TICK_DASH_W / 2 - 7,
                      top: geom.plotTop + b - 8,
                      pointerEvents: 'none',
                      zIndex: 2,
                    }}
                    aria-hidden
                  >
                    {[3, 8, 13].map((cy) => (
                      <circle key={cy} cx="7" cy={cy} r="1.5" fill={color.hairlineStrong} />
                    ))}
                  </svg>
                )}
              </div>
            );
          })}
          {/* 档位带（仅 USD）：Y 轴左侧档位框，框住对应刻度区段（如 200~400 框住 200..400）；
              无数据的档 = 虚线占位（第三十二轮，梯子连续可读）；本币不渲染；图隐藏（空态）时整块消失。
              第八十六轮：带宽压缩至 40 并贴轴区左缘（bandLeft=0）；「A~B」档位标签换行竖排居中
              （A / ~ / B），矮档（<38px）退化为单行小字 */}
          {showTierBand &&
            tierBoxes.map((tb, i) => (
              <div
                key={`tier-${tb.label}-${i}`}
                title={`价格档位 ${tb.label}（USD）${tb.empty ? '· 当前无产品' : ''}`}
                style={{
                  position: 'absolute',
                  left: bandLeft,
                  top: tb.top,
                  width: AXIS_BAND_W,
                  height: tb.h,
                  boxSizing: 'border-box',
                  border: tb.empty ? `1px dashed ${color.hairline}` : `1px solid ${color.hairline}`,
                  background: tb.empty ? 'transparent' : i % 2 === 0 ? color.canvasSoft2 : color.canvasSoft,
                  display: 'grid',
                  placeItems: 'center',
                  overflow: 'hidden',
                  pointerEvents: 'none',
                  zIndex: 1,
                }}
              >
                {(() => {
                  const parts = tb.label.split('~');
                  const lines = parts.length === 2 ? [parts[0], '~', parts[1]] : [tb.label];
                  const labelColor = tb.empty ? color.mute : color.body;
                  if (tb.h < 38) {
                    return tb.h >= 14 ? (
                      <span style={{ fontSize: 8, lineHeight: '10px', color: labelColor, whiteSpace: 'nowrap' }}>
                        {tb.label}
                      </span>
                    ) : null;
                  }
                  return (
                    <span
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        fontSize: 9,
                        lineHeight: '12px',
                        color: labelColor,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {lines.map((ln, k) => (
                        <span key={`${ln}-${k}`}>{ln}</span>
                      ))}
                    </span>
                  );
                })()}
              </div>
            ))}
          {/* 最高/最低点标签（第三十六轮，Keepa 式点旁胶囊，不再拉全宽虚线）：
              最高 = 点上方胶囊；最低 = 高亮点环 + 点下方胶囊 */}
          {props.maxMinOn &&
            extremeMarks.map((m) => {
              const dim = litKeys != null && !litKeys.includes(m.key);
              const pill = (tag: string, v: number) => (
                <span
                  className="tnum"
                  style={{
                    display: 'inline-block',
                    padding: '1px 7px',
                    fontSize: 10,
                    lineHeight: '15px',
                    fontWeight: 700,
                    color: m.color,
                    background: color.canvas,
                    border: `1px solid ${m.color}`,
                    borderRadius: radius.pill,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {tag} {fmt_mm(v)}
                </span>
              );
              return (
                <div key={`xm-${m.key}`} style={{ opacity: dim ? 0.15 : undefined }}>
                  <div
                    style={{
                      position: 'absolute',
                      left: xPxOf(geom, m.maxIdx),
                      // 钳回容器内：分离面板 chrome=false 无工具行预留（gridTop 收窄到 14），
                      // 最高点贴 plot 顶时胶囊不再越出面板压住面板头
                      top: Math.max(2, yPxOf(geom, m.maxV) - 30),
                      transform: 'translateX(-50%)',
                      pointerEvents: 'none',
                      zIndex: 8,
                    }}
                  >
                    {pill('最高', m.maxV)}
                  </div>
                  {/* 第五十四轮追补⑤：最低点不再画高亮环（用户：直接显示标签即可） */}
                  <div
                    style={{
                      position: 'absolute',
                      left: xPxOf(geom, m.minIdx),
                      top: yPxOf(geom, m.minV) + 26,
                      transform: 'translateX(-50%)',
                      pointerEvents: 'none',
                      zIndex: 8,
                    }}
                  >
                    {pill('最低', m.minV)}
                  </div>
                </div>
              );
            })}
          {/* 价格变化点（第三十五轮起；第四十二轮阈值齿轮可调、含上涨）：相较前一有值点
              |Δ|≥阈值的点下方 ↓/↑X% 徽标（Keepa「价格下降了 30%」画法）；聚焦降透明 */}
          {geom &&
            series.map((s) =>
              s.points.map((pt, i) => {
                const chg = changeMarks.get(`${s.key}|${i}`);
                if (chg == null || pt.price == null) return null;
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
                      top: yPxOf(geom, pt.price) + 9,
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
          {/* 大促档期图标（第四十二轮）：时间轴与图表之间的窄条，仅图标不换行，点击出档期卡 */}
          {promoBandsOn &&
            geom &&
            promoBands.map((b) => {
              const midFrac = (b.startIdx + b.startFrac + b.endIdx + b.endFrac) / 2 / geom.n;
              const mid = geom.plotLeft + midFrac * geom.plotWidth;
              return (
                <div
                  key={`pm-${b.key}`}
                  style={{
                    position: 'absolute',
                    left: mid,
                    top: geom.plotTop + geom.plotHeight + 4, // 专用行（第四十七轮）：轴标签 margin 22 下推，图标带 +4~18 独占
                    transform: 'translateX(-50%)',
                    zIndex: 9,
                  }}
                >
                  <Popover trigger="click" placement="top" content={<PromoEventCard band={b} />}>
                    <span
                      role="button"
                      title={`${b.name} ${b.dateText} · 点击看档期详情`}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        pointerEvents: 'auto',
                        display: 'grid',
                        placeItems: 'center',
                        width: 16,
                        height: 14,
                        cursor: 'pointer',
                      }}
                    >
                      <TagOutlined style={{ fontSize: 12, color: '#b45309' }} />
                    </span>
                  </Popover>
                </div>
              );
            })}
          {/* 悬停浮层（第三十五轮，Keepa 式）：时间 + 各产品折后价；跟随十字竖线，右缘自动左翻 */}
          {hoverIdx != null &&
            hoverIdx < geom.n &&
            (() => {
              const rows = series
                .map((s) => ({ s, v: primaryPriceOf(s.points[hoverIdx], priceTypes) }))
                .filter((r) => r.v != null) as { s: (typeof series)[number]; v: number }[];
              if (rows.length === 0) return null;
              // 第四十八轮：有 offer 的系列在价格行下附权益行；第五十轮改结构化三字段
              // （折扣/分期/赠品 各占一行，只出有值的字段），随「offer 权益」开关整体显隐
              const offerRows = rows.map((r) =>
                props.enableOffer ? offerLineItems(r.s.points[hoverIdx]?.offer) : [],
              );
              const nOfferLines = offerRows.reduce((acc, l) => acc + l.length, 0);
              const x0 = xPxOf(geom, hoverIdx);
              // 第六十一轮：浮窗宽度随内容动态适配——三列各取本列最宽数值（ch 单位贴合
              // tabular 数字宽），间距收紧（gap 6），不再用固定 324 留白
              const priceCh = Math.max(...rows.map((r) => fmt_mm(r.v).length));
              const rrpCh = Math.max(
                2,
                ...rows.map((r) => {
                  const rr = r.s.points[hoverIdx].rrp;
                  return rr != null ? fmt_mm(rr).length : 0;
                }),
              );
              const nameEst = Math.max(...rows.map((r) => curveNameOf(r.s).length)) * 6.2 + 14;
              const W = Math.ceil(20 + 6 * 6 + 2 + 38 + priceCh * 8.5 + rrpCh * 7.3 + Math.max(96, nameEst));
              const flip = x0 + 16 + W > geom.plotLeft + geom.plotWidth;
              const left = flip ? x0 - 16 - W : x0 + 16;
              const top = Math.min(
                Math.max(geom.plotTop + 8, 40),
                geom.plotTop + geom.plotHeight - 36 - (rows.length * 20 + nOfferLines * 16),
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
                  <div style={{ fontSize: 12, fontWeight: 600, color: color.ink, marginBottom: 3 }}>
                    {fmt_hoverDate(granularity, series[0]?.points[hoverIdx]?.xLabel ?? '')}
                  </div>
                  {rows.map(({ s, v }, ri) => {
                    const pt = s.points[hoverIdx];
                    const dim = litKeys != null && !litKeys.includes(s.key);
                    const items = offerRows[ri];
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
                          {/* 第六十轮：折扣/现价/RRP 三列定宽右对齐（跨行同列对齐，表格读数）；
                              现价字号=折线上价格标签同款 14px。第六十一轮修：span 须 inline-block
                              （inline 忽略 width，textAlign right 落空=三列没对齐）+ 列间灰短竖线 */}
                          <span className="tnum" style={{ width: 38, textAlign: 'right', flexShrink: 0, display: 'inline-flex', justifyContent: 'flex-end' }}>
                            {disc != null && <MiniDiscountBadge discount={disc} dim={dim} />}
                          </span>
                          <span aria-hidden style={{ width: 1, height: 14, background: color.hairlineStrong, flexShrink: 0 }} />
                          <span className="tnum" style={{ width: `${priceCh}ch`, textAlign: 'right', flexShrink: 0, display: 'inline-block', fontSize: 14, fontWeight: 600, color: color.ink }}>
                            {fmt_mm(v)}
                          </span>
                          <span aria-hidden style={{ width: 1, height: 14, background: color.hairlineStrong, flexShrink: 0 }} />
                          <span
                            className="tnum"
                            style={{ width: `${rrpCh}ch`, textAlign: 'right', flexShrink: 0, display: 'inline-block', fontSize: 12, color: pt?.rrp != null ? color.mute : 'transparent', textDecoration: 'line-through' }}
                          >
                            {pt?.rrp != null ? fmt_mm(pt.rrp) : '0'}
                          </span>
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
                </div>
              );
            })()}
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
                    ? '数据在窗口左侧延续，可拉伸时间窗口查看'
                    : '数据在窗口右侧延续，可拉伸时间窗口查看'
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
                    latest={latestPointByKey.get(nm.seriesKey)}
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
          {/* 悬停快照取证（第五十轮，替代跳转商城；仅周视图；空心点不渲染）：
              「快照」胶囊点击弹页面快照浮窗；聚焦模式非聚焦系列降透明 */}
          {props.enableJump &&
            hoverIdx != null &&
            series.map((s) => {
              const p = s.points[hoverIdx];
              if (!p || p.missing || p.price == null || !p.url) return null;
              const dim = litKeys != null && !litKeys.includes(s.key);
              return (
                <span key={`snap-${s.key}`} style={{ opacity: dim ? 0.15 : undefined }}>
                  <SnapshotIcon
                    x={xPxOf(geom, hoverIdx)}
                    y={yPxOf(geom, p.price)}
                    onClick={() =>
                      setSnapInfo({
                        seriesLabel: curveNameOf(s),
                        shopName: p.shopName,
                        bucketId: p.bucketId,
                        dateText: fmt_hoverDate(granularity, p.xLabel),
                        priceText: formatPrice(p.price, props.currency),
                        url: p.url,
                      })
                    }
                  />
                </span>
              );
            })}
          {/* 悬停下钻（仅月/季，第二十轮）：悬停竖线上的有值点变白底黑「下钻」图标
              （同周视图跳转图标款式），点击 = 下钻该期间（与圈点点击同一 onDrill）；
              聚焦模式非聚焦系列降透明 */}
          {props.enableDrill &&
            props.onDrill &&
            hoverIdx != null &&
            series.map((s) => {
              const p = s.points[hoverIdx];
              const v = p ? primaryPriceOf(p, priceTypes) : null;
              if (v == null) return null;
              const dim = litKeys != null && !litKeys.includes(s.key);
              return (
                <span key={`dl-${s.key}`} style={{ opacity: dim ? 0.15 : undefined }}>
                  <DrillIcon
                    x={xPxOf(geom, hoverIdx)}
                    y={yPxOf(geom, v)}
                    title={granularity === 'quarter' ? '下钻查看该季月度趋势' : '下钻查看该月周度趋势'}
                    onClick={() => props.onDrill!(s.key, p.bucketId)}
                  />
                </span>
              );
            })}
        </>
      )}
      {/* 页面快照浮窗（第五十轮）：antd Modal 传送门渲染，居中小弹框 */}
      <SnapshotModal info={snapInfo} onClose={() => setSnapInfo(null)} />
    </div>
  );
}
