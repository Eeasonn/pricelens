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
// ②竞品对比入口分两层：产品条主按钮进入全部型号，ROM 行按钮进入单型号；
// 添加竞品/多平台对比等次要动作收进产品条右侧「⋯」菜单；未配置对标的虚线占位删除。
// 纯展示层：结构全部来自 buildOverviewMatrix（金测锚定），本文件不取数。
// ============================================================
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ConfigProvider, Dropdown, Select, Segmented } from 'antd';
import { DownOutlined, MoreOutlined, SwapOutlined } from '@ant-design/icons';
import { usePage } from '../state/PageContext';
import { useFilters } from '../state/FiltersContext';
import { useOverviewView } from '../state/OverviewViewContext';
import { resolveCompExpansion } from '../state/overviewViewState';
import { navBus } from '../state/navBus';
import type { ProductSelection } from '../state/filtersTypes';
import { buildOverviewMatrix, TIER_LABELS } from '../dataModel/aggregate';
import type { OverviewCompRow, OverviewModel, OverviewRow } from '../dataModel/aggregate';
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
import MarketMap from './overview/MarketMap';
import BrandDot, { brandLabelOf } from '../components/BrandMark';
import BrandGlyph from '../components/BrandGlyph';
import { AlertBell, alertDigest, TYPE_STYLE, pctText, useAlerts } from '../components/AlertCenter';
import { groupAlertsBySeries, latestAlerts, latestByType, seriesKeyOfSku, type AlertItem } from '../dataModel/alerts';
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

// 第五十四轮：型号头行的动作收进产品条；产品条主按钮打开全部型号对比，
// ROM 行固定保留单型号对比入口，多平台对比由产品条右侧菜单打开。

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

/** 明细信息行：左侧固定语义标签，右侧只放一个信息，避免 RRP/价差/提示互相挤在同一行。 */
function OverviewMetricLine(props: { label: string; children?: ReactNode; align?: 'start' | 'end' }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '42px minmax(0,1fr)', alignItems: props.align === 'end' ? 'center' : 'start', columnGap: 8, minHeight: 25, padding: '2px 0' }}>
      <span style={{ color: color.mute, fontSize: 11.5, lineHeight: '20px', whiteSpace: 'nowrap' }}>{props.label}</span>
      <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', minHeight: 20 }}>{props.children}</div>
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
  onOpen: (a: AlertItem) => void;
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
        onClick={() => onOpen(latest[0])}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3, cursor: 'pointer', minWidth: 0 }}
      >
        {latest.map((a) => (
          <span
            key={a.key}
            role="button"
            title={lineTitle(a)}
            onClick={(event) => {
              event.stopPropagation();
              onOpen(a);
            }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, maxWidth: '100%', cursor: 'pointer' }}
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
        // 把产品信息和右侧动作拆成两个网格区。旧版所有节点都在同一条
        // flex 行里，窄卡片会被不可收缩的产品名/生命周期撑出卡片，导致
        // 竞品对比按钮和更多菜单跑到下一列（截图中的底部错位）。
        display: 'grid',
        gridTemplateColumns: 'auto auto minmax(0, 1fr) auto',
        alignItems: 'center',
        columnGap: 10,
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
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2, minWidth: 0, overflow: 'hidden' }}>
        <span
          title={`${brandLabelOf(m.brand)} ${m.modelName}`}
          style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 15, lineHeight: '20px', fontWeight: 600, color: color.ink, whiteSpace: 'nowrap' }}
        >
          {m.modelName.toLowerCase().startsWith(brandLabelOf(m.brand).toLowerCase()) ? null : (
            <span style={{ color: color.mute }}>{brandLabelOf(m.brand)} </span>
          )}
          {m.modelName}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap' }}>
          {m.lifecyclePct != null && (
            <span className="tnum" style={{ flexShrink: 0, fontSize: 11, color: m.lifecyclePct <= -0.05 ? color.error : color.body }}>
              生命周期 {m.lifecyclePct > 0 ? '+' : ''}
              {(m.lifecyclePct * 100).toFixed(1)}%
            </span>
          )}
          <span style={{ fontSize: 11, color: color.mute, flexShrink: 0 }}>{props.romCount} 个配置</span>
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
                borderRadius: radius.pill, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit', flexShrink: 0,
              }}
            >
              <DownOutlined style={{ fontSize: 9, transform: props.compsExpanded ? undefined : 'rotate(-90deg)', transition: 'transform 0.15s' }} />
              {props.compsExpanded ? `收起竞品（${props.compCount}）` : `展开竞品（${props.compCount}）`}
            </button>
            ) : (
              <span style={{ fontSize: 11, color: color.mute, flexShrink: 0 }}>竞品 {props.compCount}</span>
            ))}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, minWidth: 0, flexShrink: 0 }}>
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
    </div>
  );
}

/** 我司 ROM 行（第六十六轮改版；第七十一轮保留单型号对比入口）：品牌+产品名由上方产品条表达，
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

/**
 * 型号与配置明细（第七十一轮）：把旧的「字段做列、我司/竞品做行」转成
 * 「我司产品｜竞品 1｜竞品 2」三列矩阵。左侧树固定为阅读锚点，产品行是
 * 第一层，展开后一次看完该产品的 ROM、折扣、现价、RRP、价差和预警。
 * 竞品列默认显示主竞品与次竞品；其余已经配置的竞品收进同一产品的下钻区，
 * 通过「展开全部竞品」查看，避免首屏被低价值的竞品行撑高。
 */
function ProductDetailMatrix(props: {
  visibleBands: { band: { tierCode: OverviewModel['tierCode']; models: OverviewModel[] }; ownModels: OverviewModel[] }[];
  currency: 'usd' | 'local';
  prodStatus: { isExpanded: (id: string) => boolean };
  compStatus: { isExpanded: (id: string) => boolean };
  setProductExpanded: (id: string, expanded: boolean) => void;
  setCompExpanded: (id: string, expanded: boolean) => void;
  onCompare: (model: OverviewModel, romram?: string) => void;
  onMultiPlatform: (model: OverviewModel) => void;
  onConfigBench: (model: OverviewModel) => void;
  alertCellFor: (skuId: string | undefined) => ReactNode;
  productAlertChip: (model: OverviewModel) => ReactNode;
  diffDirs: Record<string, DiffDir>;
  toggleDiffDir: (key: string) => void;
  selectedModelId?: string | null;
}) {
  const {
    visibleBands,
    currency,
    prodStatus,
    compStatus,
    setProductExpanded,
    setCompExpanded,
    onCompare,
    onMultiPlatform,
    onConfigBench,
    alertCellFor,
    productAlertChip,
    diffDirs,
    toggleDiffDir,
    selectedModelId,
  } = props;

  type CompGroup = { modelId: string; brand: string; modelName: string; rows: OverviewCompRow[]; min: number | null; max: number | null };

  const priceRange = (prices: (number | null)[]): string => {
    const values = prices.filter((p): p is number => p != null);
    if (values.length === 0) return '暂无价格';
    const min = Math.min(...values);
    const max = Math.max(...values);
    return min === max ? formatPrice(min, currency) : `${formatPrice(min, currency)} – ${formatPrice(max, currency)}`;
  };

  const groupCompetitors = (model: OverviewModel): CompGroup[] => {
    const groups = new Map<string, OverviewCompRow[]>();
    for (const row of model.comps) {
      const modelId = row.skuId.split('__')[0];
      const rows = groups.get(modelId);
      if (rows) rows.push(row);
      else groups.set(modelId, [row]);
    }
    return [...groups.entries()].map(([modelId, rows]) => {
      const sorted = [...rows].sort((a, b) => Number(b.primary) - Number(a.primary) || (b.price ?? -1) - (a.price ?? -1));
      const prices = rows.map((r) => r.price).filter((p): p is number => p != null);
      return {
        modelId,
        brand: sorted[0]?.brand ?? rows[0].brand,
        modelName: sorted[0]?.modelName ?? rows[0].modelName,
        rows: sorted,
        min: prices.length ? Math.min(...prices) : null,
        max: prices.length ? Math.max(...prices) : null,
      };
    });
  };

  const ownPriceRange = (model: OverviewModel): string => priceRange(model.rows.map((r) => r.price));

  const cellBase: CSSProperties = {
    minWidth: 0,
    padding: '13px 14px',
    borderRight: `1px solid ${color.hairline}`,
    borderBottom: `1px solid ${color.hairline}`,
    background: color.canvas,
  };

  const modelNode = (model: OverviewModel, expanded: boolean, groups: CompGroup[]): ReactNode => {
    return (
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <button
            type="button"
            onClick={() => setProductExpanded(model.modelId, !expanded)}
            aria-expanded={expanded}
            style={{
              display: 'grid',
              gridTemplateColumns: '20px 18px minmax(0,1fr)',
              alignItems: 'center',
              gap: 8,
              flex: 1,
              minWidth: 0,
              padding: 0,
              border: 0,
              background: 'transparent',
              color: color.ink,
              textAlign: 'left',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, border: `1px solid ${expanded ? 'rgba(0,112,243,.45)' : color.hairlineStrong}`, borderRadius: radius.pill, color: expanded ? selectSoftInk : color.mute, background: expanded ? selectSoft : color.canvas, fontSize: 12, lineHeight: '16px' }}>{expanded ? '−' : '+'}</span>
            <BrandGlyph brand={model.brand} size={17} />
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 14, lineHeight: '20px', fontWeight: 700 }}>{model.modelName}</span>
            </span>
          </button>
          <button type="button" aria-label={`查看 ${model.modelName} 全部型号的竞品对比`} title="查看全部型号对比" onClick={(e) => { e.stopPropagation(); onCompare(model); }} style={{ flexShrink: 0, minHeight: 30, padding: '4px 11px', border: '1px solid rgba(0,112,243,.55)', borderRadius: radius.pill, background: color.link, color: '#fff', font: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>全部型号对比</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 10, paddingLeft: 46 }}>
          <span style={{ color: color.mute, fontSize: 11.5 }}>价格区间</span>
          <span className="tnum" style={{ color: color.ink, fontSize: 16, lineHeight: '22px', fontWeight: 750 }}>{ownPriceRange(model)}</span>
          {productAlertChip(model)}
          <Dropdown trigger={['click']} placement="bottomRight" menu={{ items: [{ key: 'mp', label: '多平台对比' }, { key: 'bench', label: '添加竞品' }], onClick: ({ key }) => key === 'mp' ? onMultiPlatform(model) : onConfigBench(model) }}>
            <button type="button" onClick={(e) => e.stopPropagation()} style={{ width: 24, height: 24, padding: 0, border: `1px solid ${color.hairline}`, borderRadius: radius.pill, background: color.canvas, color: color.mute, cursor: 'pointer' }} title="更多动作"><MoreOutlined style={{ fontSize: 12 }} /></button>
          </Dropdown>
          {groups.length > 2 && <button type="button" onClick={(e) => { e.stopPropagation(); setCompExpanded(model.modelId, !compStatus.isExpanded(model.modelId)); }} style={{ minHeight: 24, padding: '2px 8px', border: `1px solid ${color.hairline}`, borderRadius: radius.pill, background: compStatus.isExpanded(model.modelId) ? selectSoft : color.canvas, color: compStatus.isExpanded(model.modelId) ? selectSoftInk : color.body, font: 'inherit', fontSize: 10.5, cursor: 'pointer' }}>{compStatus.isExpanded(model.modelId) ? '收起其他竞品' : `其他竞品 ${groups.length - 2}`}</button>}
        </div>
      </div>
    );
  };

  const competitorCell = (group: CompGroup | undefined, model: OverviewModel): ReactNode => {
    if (!group) return <span style={{ color: color.hairlineStrong, fontSize: 12 }}>未配置竞品</span>;
    const representative = group.rows[0];
    const own = model.rows.find((r) => representative.ownRomrams.some((x) => norm(x) === norm(r.romram))) ?? model.rows[0];
    const diff = representative.price != null && own?.price != null ? diffPct(representative.price, own.price) : null;
    return (
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <BrandGlyph brand={group.brand} size={18} />
          <div style={{ minWidth: 0 }}>
            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 700 }}>{brandLabelOf(group.brand)} {group.modelName}</div>
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          <OverviewMetricLine label="折后价"><span className="tnum" style={{ fontSize: 18, lineHeight: '24px', fontWeight: 750, color: color.ink }}>{priceRange(group.rows.map((r) => r.price))}</span></OverviewMetricLine>
          <OverviewMetricLine label="RRP"><span className="tnum" style={{ fontSize: 14, lineHeight: '20px', color: color.body }}>{priceRange(group.rows.map((r) => r.rrp))}</span></OverviewMetricLine>
          <OverviewMetricLine label="折扣"><span className="tnum" style={{ fontSize: 13, lineHeight: '20px', color: color.body }}>{group.rows.some((r) => r.price != null && r.rrp != null) ? `${Math.round(Math.min(...group.rows.filter((r) => r.price != null && r.rrp != null).map((r) => (r.price! / r.rrp!) - 1)) * 100)}% – ${Math.round(Math.max(...group.rows.filter((r) => r.price != null && r.rrp != null).map((r) => (r.price! / r.rrp!) - 1)) * 100)}%` : '—'}</span></OverviewMetricLine>
          <OverviewMetricLine label="价差"><span className="tnum" style={{ padding: '3px 8px', borderRadius: radius.pill, background: diff?.tone === 'rich' ? '#fff0f0' : '#edf5ff', color: diff ? (diff.tone === 'rich' ? color.error : color.link) : color.mute, fontSize: 13, lineHeight: '18px', fontWeight: 700 }}>{diff ? `${diff.text} · ${diff.tone === 'rich' ? '高于我司' : '低于我司'}` : '暂无价差'}</span></OverviewMetricLine>
        </div>
      </div>
    );
  };

  /** 首层只显示产品级摘要；型号、RRP、折扣和价差在展开产品后再出现。 */
  const competitorSummaryCell = (group: CompGroup | undefined, model: OverviewModel): ReactNode => {
    if (!group) {
      return (
        <div style={{ minHeight: 58, display: 'flex', alignItems: 'center', color: color.hairlineStrong, fontSize: 12 }}>
          未配置竞品
        </div>
      );
    }
    const representative = group.rows[0];
    const ownPrices = model.rows.map((r) => r.price).filter((p): p is number => p != null);
    const compPrices = group.rows.map((r) => r.price).filter((p): p is number => p != null);
    const ownMin = ownPrices.length ? Math.min(...ownPrices) : null;
    const ownMax = ownPrices.length ? Math.max(...ownPrices) : null;
    const compMin = compPrices.length ? Math.min(...compPrices) : null;
    const compMax = compPrices.length ? Math.max(...compPrices) : null;
    const relation = ownMin == null || ownMax == null || compMin == null || compMax == null
      ? null
      : compMin >= ownMax ? '整体高于我司' : compMax <= ownMin ? '整体低于我司' : '价位重叠';
    return (
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <BrandGlyph brand={group.brand} size={18} />
          <div style={{ minWidth: 0 }}>
            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 700 }}>{brandLabelOf(group.brand)} {group.modelName}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginTop: 11 }}>
          <span style={{ color: color.mute, fontSize: 11.5 }}>价格区间</span>
          <span className="tnum" style={{ fontSize: 16, lineHeight: '22px', fontWeight: 750, color: color.ink }}>{priceRange(group.rows.map((r) => r.price))}</span>
        </div>
        {relation && <div style={{ marginTop: 4, fontSize: 11, color: relation === '整体高于我司' ? color.error : relation === '整体低于我司' ? color.link : color.mute }}>{relation}</div>}
      </div>
    );
  };

  const configRows = (model: OverviewModel, groups: CompGroup[]): ReactNode => {
    const configLine = (row: OverviewRow, showDiff = true): ReactNode => {
      const romComps = model.comps.filter((c) => c.ownRomrams.some((x) => norm(x) === norm(row.romram)));
      const dirKey = `${model.modelId}__${row.romram}`;
      const dir = diffDirs[dirKey] ?? 'comp';
      return (
        <div key={row.romram} style={{ minHeight: 42, padding: '7px 0 8px' }}>
          <OverviewMetricLine label="折后价"><span className="tnum" style={{ fontSize: 18, lineHeight: '24px', fontWeight: 750, color: color.ink }}>{formatPrice(row.price, currency)}</span></OverviewMetricLine>
          <OverviewMetricLine label="RRP"><span className="tnum" style={{ fontSize: 14, lineHeight: '20px', color: color.body }}>{formatPrice(row.rrp, currency)}</span></OverviewMetricLine>
          <OverviewMetricLine label="折扣">{row.discountPct != null ? <DiscountBadge discount={row.discountPct} /> : <span style={{ color: color.hairlineStrong, fontSize: 12 }}>—</span>}</OverviewMetricLine>
          {showDiff && romComps.length > 0 && <OverviewMetricLine label="价差"><button type="button" onClick={() => toggleDiffDir(dirKey)} style={{ padding: '3px 8px', border: `1px solid ${color.hairline}`, borderRadius: radius.pill, background: color.canvas, color: color.body, font: 'inherit', fontSize: 11, cursor: 'pointer' }}><SwapOutlined style={{ fontSize: 10 }} /> {dir === 'comp' ? '竞品比我司' : '我司比竞品'}</button></OverviewMetricLine>}
          <OverviewMetricLine label="提示">{alertCellFor(row.skuId)}</OverviewMetricLine>
        </div>
      );
    };

    const compLine = (comp: OverviewCompRow, own: OverviewRow): ReactNode => {
      const dir = diffDirs[`${model.modelId}__${own?.romram ?? ''}`] ?? 'comp';
      const diff = comp.price != null && own?.price != null ? (dir === 'comp' ? diffPct(comp.price, own.price) : diffPct(own.price, comp.price)) : null;
      const discount = comp.price != null && comp.rrp != null && comp.rrp > 0 ? comp.price / comp.rrp - 1 : null;
      return (
        <div key={comp.skuId} style={{ minHeight: 42, padding: '7px 0 8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, minHeight: 24 }}>
            <BrandDot brand={comp.brand} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 700 }}>{comp.romram}</span>
          </div>
          <OverviewMetricLine label="折后价"><span className="tnum" style={{ fontSize: 18, lineHeight: '24px', fontWeight: 750, color: color.ink }}>{formatPrice(comp.price, currency)}</span></OverviewMetricLine>
          <OverviewMetricLine label="RRP"><span className="tnum" style={{ fontSize: 14, lineHeight: '20px', color: color.body }}>{formatPrice(comp.rrp, currency)}</span></OverviewMetricLine>
          <OverviewMetricLine label="折扣">{discount != null ? <DiscountBadge discount={discount} /> : <span style={{ color: color.hairlineStrong, fontSize: 12 }}>—</span>}</OverviewMetricLine>
          <OverviewMetricLine label="价差"><span className="tnum" style={{ padding: '3px 8px', borderRadius: radius.pill, background: diff ? (diff.tone === 'rich' ? '#fff0f0' : '#edf5ff') : color.canvasSoft2, color: diff ? (diff.tone === 'rich' ? color.error : color.link) : color.mute, fontSize: 13, lineHeight: '18px', fontWeight: 700 }}>{diff ? diff.text : '暂无价差'}</span></OverviewMetricLine>
          <OverviewMetricLine label="提示">{alertCellFor(comp.skuId)}</OverviewMetricLine>
        </div>
      );
    };

    // 以“每个 ROM 一行”作为同一个 CSS Grid row，同时放入我司、竞品 1、竞品 2
    // 三个单元格。这样任一侧内容变高时，三列会共同撑高同一行，不再逐列漂移。
    return (
      <div style={{ gridColumn: '1 / -1', minWidth: 980, display: 'grid', gridTemplateColumns: '340px repeat(2, minmax(300px, 1fr))' }}>
        {model.rows.flatMap((row) => {
          const ownCell = (
            <div key={`own-${row.romram}`} style={{ ...cellBase, position: 'sticky', left: 0, zIndex: 3, padding: '4px 14px 7px 48px', background: '#fbfcff' }}>
              <div style={{ position: 'absolute', left: 27, top: 0, bottom: 0, width: 1, background: '#dbe3f1' }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minWidth: 0 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12.5, fontWeight: 700 }}><span style={{ color: color.hairlineStrong }}>└</span><BrandDot brand={row.brand} />{row.romram}</span>
                <button type="button" aria-label={`查看 ${model.modelName} ${row.romram} 的竞品对比`} title="查看该型号对比" onClick={() => onCompare(model, row.romram)} style={{ flexShrink: 0, minHeight: 23, padding: '2px 8px', border: '1px solid rgba(0,112,243,.45)', borderRadius: radius.pill, background: color.canvas, color: color.link, font: 'inherit', fontSize: 10.5, fontWeight: 650, cursor: 'pointer', whiteSpace: 'nowrap' }}>查看型号对比</button>
              </div>
              {configLine(row)}
            </div>
          );
          const competitorCells = [0, 1].map((index) => {
            const group = groups[index];
            const matches = group?.rows.filter((comp) => comp.ownRomrams.some((x) => norm(x) === norm(row.romram))) ?? [];
            return (
              <div key={`comp-${index}-${row.romram}`} style={{ ...cellBase, padding: '4px 14px 7px', background: '#fbfcff', borderRight: index === 1 ? 0 : `1px solid ${color.hairline}` }}>
                {matches.length ? matches.map((comp) => compLine(comp, row)) : <div style={{ minHeight: 42, padding: '7px 0 8px' }}><OverviewMetricLine label="提示"><span style={{ color: color.hairlineStrong, fontSize: 12 }}>未匹配该配置</span></OverviewMetricLine></div>}
              </div>
            );
          });
          return [ownCell, ...competitorCells];
        })}
      </div>
    );
  };

    return (
      <div style={{ marginTop: space.md, border: `1px solid ${color.hairline}`, borderRadius: radius.card, overflow: 'hidden', background: color.canvas }}>
      <div style={{ overflowX: 'auto', overflowY: 'visible' }}>
        <div style={{ minWidth: 980, display: 'grid', gridTemplateColumns: '340px repeat(2, minmax(300px, 1fr))' }}>
          <div style={{ ...cellBase, position: 'sticky', left: 0, zIndex: 5, background: '#fbfcfd', padding: '12px 14px' }}><strong style={{ fontSize: 14 }}>我司产品</strong><span style={{ display: 'block', marginTop: 3, fontSize: 11, color: color.mute }}>当前价区间</span></div>
          {['竞品 1', '竞品 2'].map((title) => <div key={title} style={{ ...cellBase, background: '#fbfcfd', padding: '12px 14px' }}><strong style={{ fontSize: 14 }}>{title}</strong><span style={{ display: 'block', marginTop: 3, fontSize: 11, color: color.mute }}>当前价区间</span></div>)}

          {visibleBands.flatMap(({ ownModels }) => ownModels).map((model) => {
            const expanded = prodStatus.isExpanded(model.modelId);
            const groups = groupCompetitors(model);
            return (
              <Fragment key={model.modelId}>
                <div data-model-id={model.modelId} style={{ ...cellBase, position: 'sticky', left: 0, zIndex: 3, background: selectedModelId === model.modelId ? '#f0f6ff' : color.canvas, padding: '14px', boxShadow: selectedModelId === model.modelId ? 'inset 3px 0 0 #0070f3' : undefined }}>{modelNode(model, expanded, groups)}</div>
                <div style={{ ...cellBase, background: selectedModelId === model.modelId ? '#f7faff' : color.canvas }}>{competitorSummaryCell(groups[0], model)}</div>
                <div style={{ ...cellBase, borderRight: 0, background: selectedModelId === model.modelId ? '#f7faff' : color.canvas }}>{competitorSummaryCell(groups[1], model)}</div>
                {expanded && <>
                  {configRows(model, groups)}
                  {compStatus.isExpanded(model.modelId) && groups.length > 2 && <div style={{ gridColumn: '2 / -1', padding: '11px 14px 13px', borderBottom: `1px solid ${color.hairline}`, background: '#f8fafc' }}><div style={{ marginBottom: 7, color: color.mute, fontSize: 10.5 }}>其他已配置竞品</div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(230px, 1fr))', gap: 8 }}>{groups.slice(2).map((group) => <div key={group.modelId} style={{ padding: '9px 10px', border: `1px solid ${color.hairline}`, borderRadius: radius.control, background: color.canvas }}>{competitorCell(group, model)}</div>)}</div></div>}
                </>}
              </Fragment>
            );
          })}
        </div>
      </div>
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
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  type DetailFilter = 'all' | 'comp' | 'diff' | 'alert';
  const [detailFilter, setDetailFilter] = useState<DetailFilter>('all');
  const alerts = useAlerts();
  const alertsBySeries = useMemo(() => groupAlertsBySeries(alerts), [alerts]);
  const latestAlertsBySeries = useMemo(() => groupAlertsBySeries(latestAlerts(alerts)), [alerts]);
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

  const hasVisibleComp = (model: OverviewModel): boolean => model.comps.some((c) => c.ownRomrams.some((rom) => model.rows.some((r) => norm(r.romram) === norm(rom))));
  const hasVisibleDiff = (model: OverviewModel): boolean => model.rows.some((row) => {
    const own = row.price;
    if (own == null) return false;
    return model.comps.some((comp) => {
      if (comp.price == null || !comp.ownRomrams.some((rom) => norm(rom) === norm(row.romram))) return false;
      return Math.abs(comp.price - own) >= 0.01;
    });
  });
  const hasVisibleAlert = (model: OverviewModel): boolean => model.rows.some((row) => {
    const key = seriesKeyOfSku(row.skuId);
    return (latestAlertsBySeries.get(key)?.length ?? 0) > 0;
  });
  const detailBands = useMemo(
    () => visibleBands
      .map((band) => ({ ...band, ownModels: band.ownModels.filter((model) => detailFilter === 'all' || (detailFilter === 'comp' ? hasVisibleComp(model) : detailFilter === 'diff' ? hasVisibleDiff(model) : hasVisibleAlert(model))) }))
      .filter((band) => band.ownModels.length > 0),
    [visibleBands, detailFilter, latestAlertsBySeries],
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
    const ownModels = ms.filter((m) => m.isOwn);
    return { all: ms.length, own: ownModels.length, comp: ms.length - ownModels.length };
  }, [bands]);

  /** 粗粒度市场图 → 细粒度明细：先展开目标产品，再把用户带到对应产品条。 */
  const focusProduct = (model: OverviewModel): void => {
    setSelectedModelId(model.modelId);
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
            count={latestAlertsBySeries.get(key)?.length ?? 0}
            onToggle={() => actions.toggleAlertSub(key)}
          />
        }
        onOpen={(a) => {
          navBus.alertsFocus = { modelId: key.split('__')[0], modelName: a.modelName, seriesKey: key, type: a.type, weekId: a.weekId };
          go('alerts');
        }}
      />
    );
  };
  // 第七十轮：产品条预警徽标 = 该产品已订阅系列的预警计数（无触发不占位，点击进预警中心）
  const productAlertChip = (m: OverviewModel): ReactNode => {
    const keys = new Set<string>();
    for (const r of m.rows) {
      const key = seriesKeyOfSku(r.skuId);
      if (!state.alertSubs.includes(key)) continue;
      for (const item of latestAlertsBySeries.get(key) ?? []) keys.add(item.key);
    }
    const count = keys.size;
    if (count === 0) return null;
    return (
      <span
        role="button"
        title="查看该产品的预警详情"
        onClick={(e) => {
          e.stopPropagation();
          navBus.alertsFocus = { modelId: m.modelId, modelName: m.modelName };
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

        <main style={{ flex: 1, padding: `${space.md}px ${space.lg}px ${space.lg}px` }}>
          <section style={{ background: color.canvas, boxShadow: shadow.l1, borderRadius: radius.card, padding: space.md }}>
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

            <MarketMap
              bands={visibleBands}
              currency={currency}
              asOf={asOf}
              onOpenProduct={focusProduct}
              selectedModelId={selectedModelId}
            />

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: space.xl, paddingBottom: space.sm }}>
              <h2 style={{ margin: 0, fontSize: 18, lineHeight: '24px', color: color.ink }}>型号与配置明细</h2>
              <Segmented
                size="small"
                value={detailFilter}
                onChange={(value) => setDetailFilter(value as DetailFilter)}
                options={[
                  { label: '全部产品', value: 'all' },
                  { label: '有竞品', value: 'comp' },
                  { label: '有价差', value: 'diff' },
                  { label: '有预警', value: 'alert' },
                ]}
              />
              <span style={{ fontSize: 11, color: color.mute }}>{detailBands.reduce((n, band) => n + band.ownModels.length, 0)} 个产品</span>
            </div>

            <ProductDetailMatrix
              visibleBands={detailBands}
              currency={currency}
              prodStatus={prodStatus}
              compStatus={compStatus}
              setProductExpanded={setProductExpanded}
              setCompExpanded={setCompExpanded}
              onCompare={(model, romram) => openCompare(model, romram)}
              onMultiPlatform={(model) => setMpSel({ model, romram: null })}
              onConfigBench={(model) => setBenchSel({ modelId: model.modelId, romram: null })}
              alertCellFor={alertCellFor}
              productAlertChip={productAlertChip}
              diffDirs={diffDirs}
              toggleDiffDir={toggleDiffDir}
              selectedModelId={selectedModelId}
            />

            {detailBands.length === 0 && (
              <div style={{ padding: `${space.xl}px 0`, textAlign: 'center', fontSize: fontSize.bodySm, color: color.mute }}>
                当前筛选无匹配产品 — 请调整筛选条件
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
