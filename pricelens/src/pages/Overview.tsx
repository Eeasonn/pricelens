// ============================================================
// 国家总览（第三十七轮施工 / 第三十八轮反馈修订）：国家层面主界面 = 竞品矩阵大表。
// 档位带（tier_code 从高到低）× 行配对——型号与它的映射竞品同处一个包裹格子
// （我司行在上 / 映射竞品在下，竞品行浅灰底），一体性一眼可读。
// 第六十六轮改版（用户反馈）：①产品名不再双层重复——型号头行表达品牌+产品，
// 我司行主列只放配置 ROMRAM；②价格拆三列右对齐（折扣率｜折后价｜RRP，RRP 无划线）；
// ③迷你图删除（总览无意义）。
// 第六十七轮（用户反馈）：①「周期最低」列删除，全表六列（产品｜折扣率｜折后价｜
// RRP｜价差｜预警）；②竞品区折叠由 Provider 保存——全景默认收起、单产品默认展开，
// 收起保留 ROM 竞品摘要，产品头与顶栏全局动作共享状态。
// 第六十八轮（用户反馈）：筛选条与看板拉齐——独立白卡（.lpl-fb）+ 同宽度同序
// （国家 210｜产业 155｜我司产品 flex｜平台 160｜价格档位 flex），标签统一「我司产品」。
// 第七十轮（用户反馈：收起竞品后仍不够整洁）：①产品级折叠——默认每产品一条产品条
// （箭头+品牌+名称+生命周期+N 个配置+竞品 N ⋯⋯ 价区间｜预警｜竞品对比｜⋯），
// 一屏看清「这个国家这个产业有哪些产品」；点击产品条才展开配置（ROM）明细，
// 单产品可见时自动展开（视图态存 Provider，切页保留）。
// ②我司 ROM 行内三按钮（添加竞品/竞品对比/多平台对比）撤除——竞品对比升产品条
// 主按钮（全配置下钻），次要动作收进产品条右侧「⋯」菜单；未配置对标的虚线占位删除。
// 纯展示层：结构全部来自 buildOverviewMatrix（金测锚定），本文件不取数。
// ============================================================
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ConfigProvider, Dropdown, Select } from 'antd';
import { DownOutlined, MoreOutlined, SwapOutlined } from '@ant-design/icons';
import { usePage } from '../state/PageContext';
import { useFilters } from '../state/FiltersContext';
import { useOverviewView } from '../state/OverviewViewContext';
import { resolveCompExpansion } from '../state/overviewViewState';
import { navBus } from '../state/navBus';
import type { ProductSelection } from '../state/filtersTypes';
import { buildOverviewMatrix, TIER_LABELS } from '../dataModel/aggregate';
import type { OverviewModel, OverviewRow } from '../dataModel/aggregate';
import { buildOverviewSummary, summarizeCompetitors } from '../dataModel/overviewSummary';
import { scopeLabels } from '../dataModel/scope';
import type { DimBenchmark } from '../dataModel/types';
import { filterBarTheme } from '../components/FilterBar';
import ScopeFields from '../components/FilterBar/ScopeFields';
import PlatformBox from '../components/FilterBar/PlatformBox';
import CurrencyBox from '../components/FilterBar/CurrencyBox';
import { OwnProductControl } from '../components/FilterBar/ProductBox';
import { dimChannel } from '../data';
import { getEffectiveBenchmark } from '../state/configStore';
import { CONFIG_CHANGED_EVENT } from '../state/lplKeys';
import PageHeader from '../components/PageHeader';
import BenchConfigModal from './overview/BenchConfigModal';
import MultiPlatformModal from './overview/MultiPlatformModal';
import IndustrySummary from './overview/IndustrySummary';
import MarketMap from './overview/MarketMap';
import BrandDot, { brandLabelOf } from '../components/BrandMark';
import BrandGlyph from '../components/BrandGlyph';
import { AlertBell, alertDigest, TYPE_STYLE, pctText, useAlerts } from '../components/AlertCenter';
import { groupAlertsBySeries, latestByType, seriesKeyOfSku, type AlertItem } from '../dataModel/alerts';
import { diffPct } from '../chart/PriceTrend/helpers';
import { DiscountBadge } from '../chart/PriceTrend/PriceSummary';
import { color, fontSize, formatPrice, radius, selectSoft, selectSoftInk, shadow, space } from '../theme/tokens';

const norm = (r: string): string => r.replace(/\s+/g, '');

/** 总览筛选行单元格（第六十八轮与看板拉齐）：外置 12px 标签 + gap 6 + 30px 控件
 *  （高度/字号走 filterBarTheme），width 固定 / flex 弹性两种，同 FilterBar 的 Field */
function FilterCell(props: { label: string; width?: number; flex?: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: props.width, flex: props.flex, minWidth: 0, flexShrink: props.width ? 0 : undefined }}>
      <span style={{ fontSize: 12, color: color.mute, flexShrink: 0, whiteSpace: 'nowrap' }}>{props.label}</span>
      <div style={{ flex: 1, minWidth: 0 }}>{props.children}</div>
    </div>
  );
}

// 第五十四轮：型号头行「竞品对比/多平台对比」按钮（原 ModelActions）删除——两动作
// 下沉到我司 ROM 行行尾固定显示（竞品对比 = 该 ROM 下钻看板；多平台对比 = 弹窗预选该 ROM）

/** 颜色次级菜单（第四十四轮建；第五十二轮追补三随「颜色列」删除而下线——用户定版
 *  总览行 = 看板页签式「品牌+产品名+RAMROM」一段式，颜色下钻留在看板/级联侧） */

/** 盒内统一行栅格（第六十七轮定版）：产品｜折扣率｜折后价｜RRP｜价差｜预警
 *  ——六列，数值列右对齐成表格读数；竖线全程连续（分隔线画在 Td 上、行内边距收进
 *  单元格里，行与行的线首尾相接不断开）。 */
const ROW_GRID: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0,1fr) 76px 96px 84px 112px 216px',
  alignItems: 'stretch',
  columnGap: 0,
};

/** 表格单元：右缘竖向分隔线（末列不带）+ 单元格自带内边距（行不再有横向 padding），
 *  alignSelf stretch 让线撑满行高、跨行首尾相接 = 连续竖线。
 *  padY = 行的纵向呼吸（同行的所有单元格必须一致）。 */
function Td(props: { children?: ReactNode; first?: boolean; last?: boolean; justify?: 'start' | 'center' | 'end'; padY?: number }) {
  const { first, last, justify = 'start', padY = 7 } = props;
  return (
    <div
      style={{
        alignSelf: 'stretch',
        display: 'flex',
        alignItems: 'center',
        justifyContent: justify === 'end' ? 'flex-end' : justify === 'center' ? 'center' : 'flex-start',
        minWidth: 0,
        paddingBlock: padY,
        paddingLeft: first ? 16 : 10,
        paddingRight: last ? 16 : 10,
        borderRight: last ? undefined : `1px solid ${color.hairline}`,
      }}
    >
      {props.children}
    </div>
  );
}

/** 列标题（表头行用）：13/700/mute；数值列随数据右对齐，其余居中（第六十六轮起表头对齐随列） */
function Th(props: { children?: ReactNode; first?: boolean; last?: boolean; justify?: 'start' | 'center' | 'end' }) {
  return (
    <Td first={props.first} last={props.last} justify={props.justify ?? 'center'}>
      <span style={{ fontSize: 13, fontWeight: 700, color: color.mute, whiteSpace: 'nowrap' }}>{props.children}</span>
    </Td>
  );
}

/** 价差方向（第五十二轮追补，用户拍板）：'comp' = 竞品比我司（默认，diffPct(竞品,我司)）、
 *  'own' = 我司比竞品（diffPct(我司,竞品)）；切换器在我司行「价差」列 */
type DiffDir = 'comp' | 'own';

/** 预警列单元格（第五十五轮改版，用户口径）：铃铛统一放预警格（所有行），格子只报
 *  「最新态」——每类型最新一条的凝练详情（调价 ↓x% → $价 / 促销加深 x pp / 平台差 / 间距），
 *  历史计数（×N）不再展示，历史在预警中心次级视图看；未订阅 = 「—」、静默 = 「监控中」 */
function OverviewAlertCell({ items, subscribed, currency, bell, onOpen }: {
  items: AlertItem[];
  subscribed: boolean;
  currency: 'usd' | 'local';
  bell?: ReactNode;
  onOpen: () => void;
}) {
  const latest = subscribed ? latestByType(items) : [];
  const lineTitle = (a: AlertItem): string =>
    (a.type === 'own-gap'
      ? `${a.pairLowLabel} / ${a.pairHighLabel}：间距 ${pctText(a.ownGapPct)}（低于阈值）`
      : `${a.brand} ${a.modelName} ${a.romram}：${TYPE_STYLE[a.type].label} ${pctText(
          a.type === 'promo' ? a.promoDeltaPp : a.type === 'platform-gap' ? a.gapPct : a.wowPct,
        )}`) + ` · ${a.weekLabel}（W${a.weekId.slice(4)}）— 点击进预警中心`;
  let status: ReactNode;
  if (!subscribed) {
    status = <span style={{ fontSize: 11, color: color.hairlineStrong }}>—</span>;
  } else if (latest.length === 0) {
    status = <span style={{ fontSize: 10.5, color: '#0a7d38' }}>监控中</span>;
  } else {
    status = (
      <span
        role="button"
        onClick={onOpen}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3, cursor: 'pointer', minWidth: 0 }}
      >
        {latest.map((a) => (
          <span
            key={a.key}
            title={lineTitle(a)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, maxWidth: '100%' }}
          >
            <span
              style={{
                flexShrink: 0,
                padding: '0 6px',
                fontSize: 10,
                fontWeight: 700,
                lineHeight: '16px',
                borderRadius: radius.pill,
                color: TYPE_STYLE[a.type].fg,
                background: TYPE_STYLE[a.type].bg,
                whiteSpace: 'nowrap',
              }}
            >
              {TYPE_STYLE[a.type].short}
            </span>
            <span className="tnum" style={{ fontSize: 11, fontWeight: 600, color: color.body, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {alertDigest(a, currency)}
            </span>
          </span>
        ))}
      </span>
    );
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0, width: '100%' }}>
      {bell}
      {status}
    </span>
  );
}

/** 产品条（第七十轮降噪改版）：每产品一条，收起态 = 只看它——箭头+品牌图标+产品名+
 *  生命周期+N 个配置+竞品 N（展开态换成竞品折叠开关）⋯⋯右侧价区间｜预警｜竞品对比｜⋯。
 *  点击整条 = 展开/收起配置明细；条内按钮 stopPropagation 不触发折叠；
 *  data-model-id = 看板「← 返回总览」的滚动定位锚点（追补⑧）。 */
function ProductStrip(props: {
  model: OverviewModel;
  expanded: boolean;
  romCount: number;
  /** 映射到可见 ROM 的去重竞品型号数 */
  compCount: number;
  compsExpanded: boolean;
  priceMin: number | null;
  priceMax: number | null;
  currency: 'usd' | 'local';
  alertChip?: ReactNode;
  onToggle: () => void;
  onToggleComps: () => void;
  onCompare: () => void;
  onMultiPlatform: () => void;
  onConfigBench: () => void;
}) {
  const { model: m, expanded } = props;
  return (
    <div
      data-model-id={m.modelId}
      onClick={props.onToggle}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: expanded ? '7px 2px' : '9px 10px',
        border: expanded ? undefined : `1px solid ${color.hairline}`,
        borderRadius: expanded ? undefined : radius.card,
        background: expanded ? undefined : color.canvasSoft,
        cursor: 'pointer',
        minWidth: 0,
      }}
    >
      <DownOutlined
        style={{ fontSize: 10, color: color.mute, flexShrink: 0, transform: expanded ? undefined : 'rotate(-90deg)', transition: 'transform 0.15s' }}
      />
      <BrandGlyph brand={m.brand} size={16} />
      <span style={{ fontSize: 15, fontWeight: 600, color: color.ink, whiteSpace: 'nowrap' }}>
        {m.modelName.toLowerCase().startsWith(brandLabelOf(m.brand).toLowerCase()) ? null : (
          <span style={{ color: color.mute }}>{brandLabelOf(m.brand)} </span>
        )}
        {m.modelName}
      </span>
      {m.lifecyclePct != null && (
        <span className="tnum" style={{ fontSize: 11, color: m.lifecyclePct <= -0.05 ? color.error : color.body }}>
          生命周期 {m.lifecyclePct > 0 ? '+' : ''}
          {(m.lifecyclePct * 100).toFixed(1)}%
        </span>
      )}
      <span style={{ fontSize: 11, color: color.mute, whiteSpace: 'nowrap' }}>{props.romCount} 个配置</span>
      {props.compCount > 0 &&
        (expanded ? (
          <button
            type="button"
            aria-expanded={props.compsExpanded}
            title={props.compsExpanded ? '收起该产品的对标竞品' : '展开该产品的对标竞品'}
            onClick={(e) => {
              e.stopPropagation();
              props.onToggleComps();
            }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              minHeight: 22, padding: '1px 8px', fontSize: 11, fontWeight: 600,
              color: props.compsExpanded ? selectSoftInk : color.body,
              background: props.compsExpanded ? selectSoft : color.canvas,
              border: `1px solid ${props.compsExpanded ? 'rgba(0, 112, 243, 0.40)' : color.hairlineStrong}`,
              borderRadius: radius.pill, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit',
            }}
          >
            <DownOutlined style={{ fontSize: 9, transform: props.compsExpanded ? undefined : 'rotate(-90deg)', transition: 'transform 0.15s' }} />
            {props.compsExpanded ? `收起竞品（${props.compCount}）` : `展开竞品（${props.compCount}）`}
          </button>
        ) : (
          <span style={{ fontSize: 11, color: color.mute, whiteSpace: 'nowrap' }}>竞品 {props.compCount}</span>
        ))}
      <span style={{ flex: 1 }} />
      {props.priceMin != null && (
        <span
          className="tnum"
          title="该产品各配置的现价区间"
          style={{ fontSize: 13, fontWeight: 600, color: color.ink, whiteSpace: 'nowrap' }}
        >
          {props.priceMin === props.priceMax
            ? formatPrice(props.priceMin, props.currency)
            : `${formatPrice(props.priceMin, props.currency)} – ${formatPrice(props.priceMax, props.currency)}`}
        </span>
      )}
      {props.alertChip}
      <span
        role="button"
        title="进入价格看板：该产品全部配置与对标竞品走势"
        onClick={(e) => {
          e.stopPropagation();
          props.onCompare();
        }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          fontSize: 12,
          fontWeight: 600,
          color: '#0070f3',
          background: color.canvas,
          border: '1px solid rgba(0, 112, 243, 0.55)',
          borderRadius: radius.pill,
          padding: '2px 10px',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        竞品对比
      </span>
      <Dropdown
        trigger={['click']}
        placement="bottomRight"
        menu={{
          items: [
            { key: 'mp', label: '多平台对比' },
            { key: 'bench', label: '添加竞品' },
          ],
          onClick: ({ key }) => (key === 'mp' ? props.onMultiPlatform() : props.onConfigBench()),
        }}
      >
        <span
          role="button"
          title="更多动作：多平台对比 / 配置对标竞品"
          onClick={(e) => e.stopPropagation()}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 22,
            height: 22,
            color: color.mute,
            borderRadius: radius.pill,
            border: `1px solid ${color.hairline}`,
            background: color.canvas,
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <MoreOutlined style={{ fontSize: 12 }} />
        </span>
      </Dropdown>
    </div>
  );
}

/** 我司 ROM 行（第六十六轮改版；第七十轮行内三按钮撤除）：品牌+产品名由上方产品条表达，
 *  主列只放配置 ROMRAM（15/700，用户：要凸显的就是配置差异）；价格三列右对齐
 *  （折扣率徽章｜折后价 17/700｜RRP 无划线 12.5 mute）；「价差」列 = 方向切换器。 */
function OwnRomRow(props: {
  row: OverviewRow;
  currency: 'usd' | 'local';
  /** 预警列（追补⑨）：父层按系列组装好的状态单元格（第五十五轮起含订阅铃铛） */
  alertCell?: ReactNode;
  diffDir: DiffDir;
  onToggleDiffDir: () => void;
  /** 该 ROM 已配置对标竞品才出切换器（无竞品价差无意义） */
  canToggleDiff: boolean;
}) {
  const { row, currency } = props;
  return (
    <div className="lpl-ov-row" style={{ ...ROW_GRID }}>
      <Td first padY={9}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, width: '100%' }}>
          <BrandDot brand={row.brand} />
          <span style={{ fontSize: 15, fontWeight: 700, color: color.ink, whiteSpace: 'nowrap', flexShrink: 0 }}>
            {row.romram}
          </span>
        </span>
      </Td>
      <Td justify="end" padY={9}>
        {row.discountPct != null ? (
          <DiscountBadge discount={row.discountPct} />
        ) : (
          <span className="tnum" style={{ fontSize: 12, color: color.hairlineStrong }}>—</span>
        )}
      </Td>
      <Td justify="end" padY={9}>
        <span className="tnum" style={{ fontSize: 17, lineHeight: '22px', fontWeight: 700, color: color.ink }}>
          {formatPrice(row.price, currency)}
        </span>
      </Td>
      <Td justify="end" padY={9}>
        {row.rrp != null ? (
          <span className="tnum" title="RRP（官方建议零售价）" style={{ fontSize: 12.5, color: color.mute }}>
            {formatPrice(row.rrp, currency)}
          </span>
        ) : (
          <span className="tnum" style={{ fontSize: 12, color: color.hairlineStrong }}>—</span>
        )}
      </Td>
      {/* 价差方向切换器：竞品比我司 ⇄ 我司比竞品，作用于本框竞品列 */}
      <Td justify="center" padY={9}>
        {props.canToggleDiff ? (
          <span
            role="button"
            title="切换价差方向：竞品比我司 ⇄ 我司比竞品"
            onClick={(e) => {
              e.stopPropagation();
              props.onToggleDiffDir();
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 8px',
              fontSize: 10.5,
              fontWeight: 600,
              color: color.body,
              background: color.canvasSoft2,
              border: `1px solid ${color.hairline}`,
              borderRadius: radius.pill,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            <SwapOutlined style={{ fontSize: 10, color: color.mute }} />
            {props.diffDir === 'comp' ? '竞品比我司' : '我司比竞品'}
          </span>
        ) : null}
      </Td>
      <Td last>{props.alertCell}</Td>
    </div>
  );
}

/** 竞品行（映射竞品，第四十五轮起「其他」不再展示）：与我司行同六列栅格；行浅灰底。
 *  第六十七轮：「价差」列 = 纯读数（方向随我司行切换器，'comp' = 竞品比我司：
 *  红=竞品贵、蓝=便宜；'own' = 我司比竞品）。 */
function CompRomRow(props: {
  brand: string;
  name: string;
  romram: string;
  price: number | null;
  rrp: number | null;
  currency: 'usd' | 'local';
  /** 对标我司 ROM 的现价（价差基准） */
  ownPrice?: number | null;
  /** 价差方向：随我司行切换器 */
  diffDir?: DiffDir;
  /** 预警列（追补⑨）：父层按系列组装好的状态单元格 */
  alertCell?: ReactNode;
}) {
  const dir = props.diffDir ?? 'comp';
  const discount = props.price != null && props.rrp != null && props.rrp > 0 ? props.price / props.rrp - 1 : null;
  const diff =
    props.price != null && props.ownPrice != null
      ? dir === 'comp'
        ? diffPct(props.price, props.ownPrice)
        : diffPct(props.ownPrice, props.price)
      : null;
  return (
    <div className="lpl-ov-comp-row" style={{ ...ROW_GRID }}>
      <Td first>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <BrandDot brand={props.brand} />
          <span style={{ fontSize: 13, fontWeight: 600, color: color.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {brandLabelOf(props.brand)} {props.name} {props.romram}
          </span>
        </span>
      </Td>
      <Td justify="end">
        {discount != null ? (
          <DiscountBadge discount={discount} />
        ) : (
          <span className="tnum" style={{ fontSize: 12, color: color.hairlineStrong }}>—</span>
        )}
      </Td>
      <Td justify="end">
        <span className="tnum" style={{ fontSize: 17, lineHeight: '22px', fontWeight: 700, color: color.ink }}>
          {formatPrice(props.price, props.currency)}
        </span>
      </Td>
      <Td justify="end">
        {props.rrp != null ? (
          <span className="tnum" title="RRP（官方建议零售价）" style={{ fontSize: 12.5, color: color.mute }}>
            {formatPrice(props.rrp, props.currency)}
          </span>
        ) : (
          <span className="tnum" style={{ fontSize: 12, color: color.hairlineStrong }}>—</span>
        )}
      </Td>
      <Td justify="end">
        {diff ? (
          <span
            className="tnum"
            title="价差：正 = 前项贵于基准（红），负 = 便宜（蓝）"
            style={{ fontSize: 12.5, fontWeight: 600, color: diff.tone === 'rich' ? color.error : color.link }}
          >
            {diff.text}
          </span>
        ) : (
          <span className="tnum" style={{ fontSize: 12, color: color.hairlineStrong }}>—</span>
        )}
      </Td>
      <Td last>{props.alertCell}</Td>
    </div>
  );
}

export default function Overview() {
  const { go } = usePage();
  const { state, actions } = useFilters();
  const {
    prodSel,
    setProdSel,
    selTiers,
    setSelTiers,
    compExpansion,
    setCompExpanded,
    productExpansion,
    setProductExpanded,
    setAllProductsExpanded,
    scrollTop,
  } = useOverviewView();
  const currency = state.currency;
  const rootRef = useRef<HTMLDivElement>(null);
  // 第四十四轮：竞品映射吃「生效矩阵」（配置页/配置对标弹窗的手动快照优先，回退 auto），
  // CONFIG_CHANGED_EVENT → 重建（看板 autoMatch 开时竞品组同事件自动跟随）
  const [bench, setBench] = useState<DimBenchmark[]>(() => getEffectiveBenchmark());

  useLayoutEffect(() => {
    const scroller = rootRef.current;
    if (!scroller) return;
    const target = navBus.overviewScrollTo;
    if (!target) {
      scroller.scrollTop = scrollTop.current;
      return;
    }
    const timer = window.setTimeout(() => {
      if (navBus.overviewScrollTo === target) navBus.overviewScrollTo = null;
      const el = scroller.querySelector<HTMLElement>(`[data-model-id="${target}"]`);
      if (!el) return;
      scroller.scrollTop =
        el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 12;
    }, 160);
    return () => window.clearTimeout(timer);
  }, [scrollTop]);
  useEffect(() => {
    const h = () => setBench(getEffectiveBenchmark());
    window.addEventListener(CONFIG_CHANGED_EVENT, h);
    return () => window.removeEventListener(CONFIG_CHANGED_EVENT, h);
  }, []);
  // 第五十一轮：平台筛选进入矩阵口径（applyPlatform 因子与看板同源；OZON 基准不变）
  const bands = useMemo(
    () => buildOverviewMatrix(currency, bench, state.platform, state),
    [currency, bench, state.platform, state.countryCode, state.industry],
  );
  const [mpSel, setMpSel] = useState<{ model: OverviewModel; romram: string | null } | null>(null); // 多平台对比弹窗（第五十三轮实装；第七十轮起产品条进入、ROM 在弹窗内切）
  // 第四十五轮：「添加竞品」入口下沉（第七十轮起从产品条「⋯」进入）→ 记录型号，弹窗内选 ROM
  const [benchSel, setBenchSel] = useState<{ modelId: string; romram: string | null } | null>(null);
  // 第五十二轮追补：价差方向（竞品比我司 / 我司比竞品），每 ROM 框独立，默认竞品比我司
  const [diffDirs, setDiffDirs] = useState<Record<string, DiffDir>>({});
  const toggleDiffDir = (key: string): void =>
    setDiffDirs((prev) => ({ ...prev, [key]: (prev[key] ?? 'comp') === 'comp' ? 'own' : 'comp' }));
  const benchModel = useMemo(
    () => (benchSel ? bands.flatMap((b) => b.models).find((m) => m.modelId === benchSel.modelId) ?? null : null),
    [bands, benchSel],
  );

  const tierOptions = useMemo(
    () => bands.map((b) => ({ value: b.tierCode, label: TIER_LABELS[b.tierCode] })),
    [bands],
  );

  /** 产品选择 → 型号可见 ROM 集；null = 未筛选（全部） */
  const modelRomFilter = useMemo(() => {
    if (prodSel.length === 0) return null;
    const map = new Map<string, Set<string>>();
    for (const sel of prodSel) {
      const set = map.get(sel.modelId) ?? new Set<string>();
      set.add(norm(sel.romram));
      map.set(sel.modelId, set);
    }
    return map;
  }, [prodSel]);

  /** 档位/产品过滤后的可见带（我司型号驱动；竞品与「其他」跟随可见型号重算） */
  const visibleBands = useMemo(
    () =>
      bands
        .filter((b) => selTiers.length === 0 || selTiers.includes(b.tierCode))
        .map((b) => ({
          band: b,
          ownModels: b.models
            .filter((m) => m.isOwn && (modelRomFilter === null || modelRomFilter.has(m.modelId)))
            .map((m) =>
              modelRomFilter !== null && modelRomFilter.has(m.modelId)
                ? { ...m, rows: m.rows.filter((r) => modelRomFilter.get(m.modelId)!.has(norm(r.romram))) }
                : m,
            )
            .filter((m) => m.rows.length > 0),
        }))
        .filter((x) => x.ownModels.length > 0),
    [bands, modelRomFilter, selTiers],
  );

  /** 可见型号 id（随筛选）——全局折叠按钮的判定与批量目标 */
  const visibleModelIds = useMemo(
    () => visibleBands.flatMap((x) => x.ownModels.map((m) => m.modelId)),
    [visibleBands],
  );
  const compStatus = useMemo(() => resolveCompExpansion(visibleModelIds, compExpansion), [visibleModelIds, compExpansion]);
  // 第七十轮：产品级折叠走同一套规则——单产品可见 = 自动展开，多产品 = 默认收起
  const prodStatus = useMemo(() => resolveCompExpansion(visibleModelIds, productExpansion), [visibleModelIds, productExpansion]);
  const nextAllExpanded = !prodStatus.allExpanded;
  const visibleOwnCount = visibleBands.reduce((total, x) => total + x.ownModels.length, 0);
  const hasViewFilter = prodSel.length > 0 || selTiers.length > 0;

  const asOf = useMemo(() => {
    let w = '';
    for (const b of bands) for (const m of b.models) for (const r of m.rows) if (r.asOfWeek > w) w = r.asOfWeek;
    return w === '' ? '—' : `${w.slice(0, 4)}-W${w.slice(4)}`;
  }, [bands]);
  // 口径条平台文案（第五十一轮）：随筛选行平台选择联动（与看板共享 state.platform）
  const platformLabel = useMemo(() => {
    const sel = state.platform;
    if (!sel || (sel.platforms.length === 0 && sel.shopIds.length === 0)) return '全部平台';
    const shopNameById = new Map(dimChannel.map((c) => [c.shop_id, c.shop_name]));
    return [...sel.platforms, ...sel.shopIds.map((id) => shopNameById.get(id) ?? id)].join('、');
  }, [state.platform]);
  const counts = useMemo(() => {
    const ms = bands.flatMap((b) => b.models);
    return { all: ms.length, own: ms.filter((m) => m.isOwn).length, comp: ms.length - ms.filter((m) => m.isOwn).length };
  }, [bands]);

  /** 粗粒度市场图 → 细粒度明细：先展开目标产品，再把用户带到对应产品条。 */
  const focusProduct = (model: OverviewModel): void => {
    setProductExpanded(model.modelId, true);
    window.setTimeout(() => {
      const scroller = rootRef.current;
      const target = scroller?.querySelector<HTMLElement>(`[data-model-id="${model.modelId}"]`);
      if (!scroller || !target) return;
      scroller.scrollTop = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 18;
    }, 0);
  };

  /** 竞品对比：型号（或单 ROM）进看板；自动匹配关时仍按配置矩阵带出该型号竞品。
   *  第五十四轮追补：切页后延时把看板滚到价格走势区——筛选器留在上方，顶部圆形 ↑ 可回。
   *  滚动在 Overview 闭包里延时执行（跨组件卸载存活；全局查滚动容器，与 StrictMode/HMR 无关） */
  const openCompare = (m: OverviewModel, romram?: string, /** 追补⑧：携带「周期最低价周」为看板窗口焦点 */ focusWeekId?: string | null): void => {
    const rows = romram ? m.rows.filter((r) => norm(r.romram) === norm(romram)) : m.rows;
    if (rows.length === 0) return;
    const list: ProductSelection[] = rows.map((r) => ({ modelId: m.modelId, romram: r.romram, skuIds: [r.skuId] }));
    actions.setOwnSelection(list);
    if (!state.autoMatch) actions.resetCompetitorsToConfig();
    navBus.dashboardFocusWeekId = focusWeekId ?? null;
    go('dashboard');
    // 切页后滚到价格走势区（滚动容器 = [data-lpl-scroll]，html/body 锁 100% 高、window 不滚；
    // IAB 环境 scrollTo() 无效需直接赋值）。注：IAB webview 会在切页后 ~12s 内反复清零程序
    // 滚动（已验证与应用代码无关），真实 Chrome 单次滚动即稳定生效。
    window.setTimeout(() => {
      const scroller = document.querySelector<HTMLElement>('[data-lpl-scroll]');
      const trend = document.querySelector<HTMLElement>('[data-lpl-trend]');
      if (!scroller || !trend) return;
      scroller.scrollTop =
        trend.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 12;
    }, 160);
  };

  // 追补⑨：总览「预警」列——按系列聚合触发（预警中心重构：收编为 alerts.ts 纯函数，
  // own-gap 同时归属低价档与高价档，与预警页矩阵同源）。第五十五轮：铃铛统一进预警格
  const alerts = useAlerts();
  const alertsBySeries = useMemo(() => groupAlertsBySeries(alerts), [alerts]);
  const industrySummary = useMemo(() => buildOverviewSummary(bands, alerts), [bands, alerts]);
  const { country, industry } = scopeLabels(state);
  const alertCellFor = (skuId: string | undefined): ReactNode => {
    if (!skuId) return null;
    const key = seriesKeyOfSku(skuId);
    return (
      <OverviewAlertCell
        items={alertsBySeries.get(key) ?? []}
        subscribed={state.alertSubs.includes(key)}
        currency={currency}
        bell={
          <AlertBell
            subscribed={state.alertSubs.includes(key)}
            count={alertsBySeries.get(key)?.length ?? 0}
            onToggle={() => actions.toggleAlertSub(key)}
          />
        }
        onOpen={() => go('alerts')}
      />
    );
  };
  // 第七十轮：产品条预警徽标 = 该产品已订阅系列的预警计数（无触发不占位，点击进预警中心）
  const productAlertChip = (m: OverviewModel): ReactNode => {
    let count = 0;
    for (const r of m.rows) {
      const key = seriesKeyOfSku(r.skuId);
      if (!state.alertSubs.includes(key)) continue;
      count += alertsBySeries.get(key)?.length ?? 0;
    }
    if (count === 0) return null;
    return (
      <span
        role="button"
        title="查看该产品的预警详情"
        onClick={(e) => {
          e.stopPropagation();
          go('alerts');
        }}
        style={{
          flexShrink: 0,
          padding: '1px 8px',
          fontSize: 10.5,
          fontWeight: 700,
          lineHeight: '16px',
          borderRadius: radius.pill,
          color: '#b45309',
          background: color.warningSoft,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        预警 {count}
      </span>
    );
  };

  return (
    <div
      ref={rootRef}
      data-lpl-scroll
      onScroll={(event) => {
        scrollTop.current = event.currentTarget.scrollTop;
      }}
      style={{ height: '100%', overflowX: 'auto', overflowY: 'auto', background: color.canvasSoft }}
    >
      <div style={{ minWidth: 1280, minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* 顶栏 64px（共享 PageHeader，预警中心重构统一四页铬架） */}
        <PageHeader title="国家总览" />

        {/* 筛选条（第六十八轮与看板拉齐）：独立白卡 + .lpl-fb 同类名 + 同宽度同序——
            国家｜产业｜我司产品｜平台｜价格档位；控件 30px/字号 13 走 filterBarTheme。
            国家/产业为共享口径态；我司产品/价格档位为本页视图态（空 = 全部） */}
        <div style={{ padding: `${space.md}px ${space.lg}px 0` }}>
          <ConfigProvider theme={filterBarTheme}>
            <section className="lpl-fb" style={{ background: color.canvas, boxShadow: shadow.l1, borderRadius: radius.card, padding: `8px ${space.lg}px` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 30, flexWrap: 'wrap' }}>
                <ScopeFields />
                <FilterCell label="我司产品" flex="1 1 285px">
                  <OwnProductControl
                    selection={prodSel}
                    onSelectionChange={setProdSel}
                    emptyPlaceholder="全部我司产品"
                  />
                </FilterCell>
                {/* 平台（第五十一轮）：看板同款级联（平台→店铺），共享 state.platform 双页联动；
                    控件宽与看板图顶同款 160（外置标签另加 30） */}
                <FilterCell label="平台" width={200}>
                  <PlatformBox />
                </FilterCell>
                <FilterCell label="价格档位" flex="1 1 220px">
                  <Select
                    mode="multiple"
                    allowClear
                    maxTagCount="responsive"
                    placeholder="全部档位"
                    style={{ width: '100%' }}
                    value={selTiers}
                    onChange={setSelTiers}
                    options={tierOptions}
                  />
                </FilterCell>
                <FilterCell label="币种" width={150}>
                  <CurrencyBox />
                </FilterCell>
              </div>
            </section>
          </ConfigProvider>
        </div>

        <main style={{ flex: 1, padding: space.lg }}>
          <section style={{ background: color.canvas, boxShadow: shadow.l1, borderRadius: radius.card, padding: space.lg }}>
            {/* 口径条：国家层面上下文 + 币种 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: space.md, flexWrap: 'wrap' }}>
              <span style={{ fontSize: fontSize.displaySm, fontWeight: 600, color: color.ink }}>{country} · {industry}竞品矩阵</span>
              <span style={{ fontSize: fontSize.caption, color: color.mute }}>
                平台 {platformLabel} · 在售型号 {counts.all}（我司 {counts.own} / 竞品 {counts.comp}）
              </span>
              {hasViewFilter && (
                <span style={{ fontSize: fontSize.caption, color: selectSoftInk }}>
                  当前显示我司 {visibleOwnCount} / 全量 {counts.own}
                </span>
              )}
              <span style={{ flex: 1 }} />
              {/* 第七十轮：全局开关升产品级——收起 = 只看产品条列表，展开 = 全部进配置明细
                  （竞品级开关保留在产品条上）；默认规则：单产品自动展开、多产品收起 */}
              <button
                type="button"
                disabled={visibleModelIds.length === 0}
                aria-expanded={prodStatus.allExpanded}
                title={nextAllExpanded ? '展开全部产品到配置明细' : '收起全部产品，只看产品列表'}
                onClick={() => setAllProductsExpanded(visibleModelIds, nextAllExpanded)}
                style={{
                  minHeight: 24, padding: '0 10px', borderRadius: radius.control,
                  border: `1px solid ${visibleModelIds.length === 0 ? color.hairline : color.hairlineStrong}`,
                  background: color.canvas, color: visibleModelIds.length === 0 ? color.hairlineStrong : color.body,
                  font: 'inherit', fontSize: 12, cursor: visibleModelIds.length === 0 ? 'default' : 'pointer', whiteSpace: 'nowrap',
                }}
              >
                {nextAllExpanded ? '展开全部产品' : '收起全部产品'}
              </button>
            </div>

            <IndustrySummary summary={industrySummary} />

            <MarketMap
              bands={visibleBands}
              currency={currency}
              asOf={asOf}
              onOpenProduct={focusProduct}
              onCompare={(model) => openCompare(model)}
            />

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: space.xl, paddingBottom: space.sm }}>
              <h2 style={{ margin: 0, fontSize: 18, lineHeight: '24px', color: color.ink }}>型号与配置明细</h2>
            </div>

            {visibleBands.some(({ ownModels }) => ownModels.some((model) => prodStatus.isExpanded(model.modelId))) && (
              <div style={{ ...ROW_GRID, marginBottom: space.sm, border: `1px solid ${color.hairline}`, borderRadius: radius.card, background: color.canvasSoft }}>
                <Th first>产品 / 配置</Th>
                <Th justify="end">折扣率</Th>
                <Th justify="end">折后价</Th>
                <Th justify="end">RRP</Th>
                <Th>价差</Th>
                <Th last>预警</Th>
              </div>
            )}

            {/* 档位带 × 产品条列表（第七十轮降噪改版）：默认每产品一条产品条；
                展开的产品在条下列配置（ROM）包裹格（行组表格：我司行在上、映射竞品在下）。
                六列明细表头只服务展开态——带内全收起时不渲染。 */}
            {visibleBands.map(({ band, ownModels }) => {
              // 第四十五轮：「其他在售竞品」带尾区删除——矩阵只呈现已建对标的竞品；
              // 竞品计数 = 可见 ROM 映射到的去重型号数
              const compCount = new Set(
                ownModels.flatMap((m) => {
                  const visRoms = new Set(m.rows.map((r) => norm(r.romram)));
                  return m.comps
                    .filter((c) => c.ownRomrams.some((x) => visRoms.has(norm(x))))
                    .map((c) => c.skuId.split('__')[0]);
                }),
              ).size;
              const anyExpanded = ownModels.some((m) => prodStatus.isExpanded(m.modelId));
              return (
                <section key={band.tierCode} style={{ marginTop: space.base }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: space.md, padding: `0 0 ${space.sm}px` }}>
                    <span style={{ fontSize: fontSize.bodySm, fontWeight: 600, color: color.ink }}>
                      {TIER_LABELS[band.tierCode]}
                    </span>
                    <span style={{ fontSize: fontSize.caption, color: color.mute }}>
                      我司 {ownModels.length} · 竞品 {compCount}
                    </span>
                  </div>

                  <div
                    style={{
                      display: anyExpanded ? 'flex' : 'grid',
                      flexDirection: anyExpanded ? 'column' : undefined,
                      gridTemplateColumns: anyExpanded ? undefined : 'repeat(auto-fit, minmax(360px, 1fr))',
                      gap: anyExpanded ? undefined : space.sm,
                    }}
                  >
                    {ownModels.map((m) => {
                      const expanded = prodStatus.isExpanded(m.modelId);
                      const visRoms = new Set(m.rows.map((r) => norm(r.romram)));
                      const compsExpanded = compStatus.isExpanded(m.modelId);
                      // 产品条竞品计数 = 映射到可见 ROM 的去重竞品型号数（与带级竞品数同口径）
                      const modelCompCount = new Set(
                        m.comps
                          .filter((c) => c.ownRomrams.some((x) => visRoms.has(norm(x))))
                          .map((c) => c.skuId.split('__')[0]),
                      ).size;
                      const prices = m.rows.map((r) => r.price).filter((p): p is number => p != null);
                      const priceMin = prices.length > 0 ? Math.min(...prices) : null;
                      const priceMax = prices.length > 0 ? Math.max(...prices) : null;
                      return (
                      <div key={m.modelId} style={{ paddingBlock: anyExpanded ? (expanded ? space.sm : space.xs) : 0 }}>
                        <ProductStrip
                          model={m}
                          expanded={expanded}
                          romCount={m.rows.length}
                          compCount={modelCompCount}
                          compsExpanded={compsExpanded}
                          priceMin={priceMin}
                          priceMax={priceMax}
                          currency={currency}
                          alertChip={productAlertChip(m)}
                          onToggle={() => setProductExpanded(m.modelId, !expanded)}
                          onToggleComps={() => setCompExpanded(m.modelId, !compsExpanded)}
                          onCompare={() => openCompare(m)}
                          onMultiPlatform={() => setMpSel({ model: m, romram: null })}
                          onConfigBench={() => setBenchSel({ modelId: m.modelId, romram: null })}
                        />
                        {/* ROM 包裹格：行组表格——我司行在上、映射竞品在下（第四十轮对齐定版） */}
                        {expanded && m.rows.map((r, romIndex) => {
                          const romComps = m.comps.filter((c) => c.ownRomrams.some((x) => norm(x) === norm(r.romram)));
                          const dirKey = `${m.modelId}__${r.romram}`;
                          const dir = diffDirs[dirKey] ?? 'comp';
                          const compSummary = summarizeCompetitors(r.price, romComps, dir);
                          return (
                            <div
                              key={r.romram}
                              style={{
                                marginTop: space.xs,
                                border: `1px solid ${color.hairline}`,
                                borderRadius: radius.card,
                                background: color.canvas,
                                overflow: 'hidden',
                              }}
                            >
                              <OwnRomRow
                                row={r}
                                currency={currency}
                                diffDir={dir}
                                onToggleDiffDir={() => toggleDiffDir(dirKey)}
                                canToggleDiff={romComps.length > 0}
                                alertCell={alertCellFor(r.skuId)}
                              />
                              {/* 未配置对标的 ROM 不再渲染竞品区（第七十轮撤虚线占位；添加竞品在产品条「⋯」） */}
                              {romComps.length > 0 && (
                              <div
                                id={`overview-comps-${m.modelId}-${romIndex}`}
                                style={{
                                  background: color.canvasSoft,
                                  borderTop: `1px solid ${color.hairline}`,
                                }}
                              >
                                {compsExpanded ? (
                                  romComps.map((c) => (
                                    <CompRomRow
                                      key={c.skuId}
                                      brand={c.brand}
                                      name={c.modelName}
                                      romram={c.romram}
                                      price={c.price}
                                      rrp={c.rrp}
                                      currency={currency}
                                      ownPrice={r.price}
                                      diffDir={dir}
                                      alertCell={alertCellFor(c.skuId)}
                                    />
                                  ))
                                ) : (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: space.lg, flexWrap: 'wrap', padding: '10px 16px', fontSize: 12, color: color.body }}>
                                    <span style={{ fontWeight: 600, color: color.ink }}>竞品 {compSummary.count} 个</span>
                                    <span>
                                      现价区间{' '}
                                      <span className="tnum">
                                        {compSummary.minPrice == null
                                          ? '—'
                                          : compSummary.minPrice === compSummary.maxPrice
                                            ? formatPrice(compSummary.minPrice, currency)
                                            : `${formatPrice(compSummary.minPrice, currency)} – ${formatPrice(compSummary.maxPrice, currency)}`}
                                      </span>
                                    </span>
                                    <span>
                                      价差区间（{dir === 'comp' ? '竞品比我司' : '我司比竞品'}）{' '}
                                      <span className="tnum">
                                        {compSummary.minDiff == null
                                          ? '—'
                                          : compSummary.minDiff === compSummary.maxDiff
                                            ? pctText(compSummary.minDiff)
                                            : `${pctText(compSummary.minDiff)} – ${pctText(compSummary.maxDiff)}`}
                                      </span>
                                    </span>
                                  </div>
                                )}
                              </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}

            {visibleBands.length === 0 && (
              <div style={{ padding: `${space.xl}px 0`, textAlign: 'center', fontSize: fontSize.bodySm, color: color.mute }}>
                当前筛选无匹配产品 — 请调整产品或价格档位
              </div>
            )}
          </section>
        </main>

      </div>

      {/* 配置对标（第四十四轮）：看板同款配置存储，保存后事件刷新矩阵与看板竞品；
          第七十轮起由产品条「⋯」进入（ROM 在弹窗内切换） */}
      <BenchConfigModal
        open={benchModel != null}
        model={benchModel}
        bands={bands}
        initialRomram={benchSel?.romram ?? null}
        onClose={() => setBenchSel(null)}
      />

      {/* 多平台对比（第五十三轮实装）：单产品多平台视角——周度三平台折线 + 最新周价差，
          数据与「平台价差预警」同源（buildPlatformCompare / platformPriceSpread） */}
      <MultiPlatformModal
        open={mpSel != null}
        model={mpSel?.model ?? null}
        initialRomram={mpSel?.romram ?? null}
        currency={currency}
        onClose={() => setMpSel(null)}
      />
    </div>
  );
}
