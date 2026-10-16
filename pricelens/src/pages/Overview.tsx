// ============================================================
// 国家总览（第三十七轮施工 / 第三十八轮反馈修订）：国家层面主界面 = 竞品矩阵大表。
// 档位带（tier_code 从高到低）× 行配对——型号与它的映射竞品同处一个包裹格子
// （左我司 / 右竞品小表，竞品行间横向分隔线），一体性一眼可读。
// 第三十八轮：筛选行回归（国家/产业/产品）+ 新增价格档位筛选（产品/档位为
// 本页视图态，空 = 全部）；看板 Chart 的折线形态开关在其齿轮弹层内。
// 第四十五轮：产品名带品牌名（Huawei Pura 90s Pro…）；「添加竞品」下沉到每个
// ROM 行（弹窗按该 ROM 预选）；迷你图 X 刻度占位互斥自适应；「其他在售竞品」
// 带尾区删除（未建对标不再展示）；产品筛选器加宽。
// 纯展示层：结构全部来自 buildOverviewMatrix（金测锚定），本文件不取数。
// ============================================================
import { useEffect, useLayoutEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { ConfigProvider, Segmented, Select } from 'antd';
import { SwapOutlined } from '@ant-design/icons';
import { usePage } from '../state/PageContext';
import { useFilters } from '../state/FiltersContext';
import { navBus } from '../state/navBus';
import type { ProductSelection } from '../state/filtersTypes';
import { buildOverviewMatrix, TIER_LABELS } from '../dataModel/aggregate';
import type { OverviewModel, OverviewRow, OverviewSparkPoint } from '../dataModel/aggregate';
import type { DimBenchmark } from '../dataModel/types';
import { filterBarTheme } from '../components/FilterBar';
import CountryBox from '../components/FilterBar/CountryBox';
import PlatformBox from '../components/FilterBar/PlatformBox';
import { IndustryControl, OwnProductControl } from '../components/FilterBar/ProductBox';
import { dimChannel, dimTime } from '../data';
import { getEffectiveBenchmark } from '../state/configStore';
import { CONFIG_CHANGED_EVENT } from '../state/lplKeys';
import PageHeader from '../components/PageHeader';
import BenchConfigModal from './overview/BenchConfigModal';
import MultiPlatformModal from './overview/MultiPlatformModal';
import BrandDot, { brandLabelOf } from '../components/BrandMark';
import BrandGlyph from '../components/BrandGlyph';
import MatrixSpark from './overview/MatrixSpark';
import { AlertBell, alertDigest, TYPE_STYLE, pctText, useAlerts } from '../components/AlertCenter';
import { groupAlertsBySeries, latestByType, seriesKeyOfSku, type AlertItem } from '../dataModel/alerts';
import { diffPct } from '../chart/PriceTrend/helpers';
import { DiscountBadge } from '../chart/PriceTrend/PriceSummary';
import { color, fontSize, formatPrice, radius, selectSoft, selectSoftInk, shadow, space } from '../theme/tokens';

const norm = (r: string): string => r.replace(/\s+/g, '');

/** 总览筛选行单元格：外置前缀标签 + 32px 控件（与看板筛选条同语言） */
function FilterCell({ label, min, children }: { label: string; min?: number; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 32, minWidth: min ?? 0, flexShrink: 0 }}>
      <span style={{ fontSize: 12, color: color.mute, flexShrink: 0, whiteSpace: 'nowrap' }}>{label}</span>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}

// 第五十四轮：型号头行「竞品对比/多平台对比」按钮（原 ModelActions）删除——两动作
// 下沉到我司 ROM 行行尾固定显示（竞品对比 = 该 ROM 下钻看板；多平台对比 = 弹窗预选该 ROM）

/** 颜色次级菜单（第四十四轮建；第五十二轮追补三随「颜色列」删除而下线——用户定版
 *  总览行 = 看板页签式「品牌+产品名+RAMROM」一段式，颜色下钻留在看板/级联侧） */

/** 盒内统一行栅格（第五十三轮定版）：产品（页签式）｜当前售价（页签同款横向三件套：
 *  折扣徽章+现价+划线 RRP，第五十二轮追补三竖排改横排并加宽）｜竞品对比（加宽）｜
 *  价格趋势（周期最低+日期 与 迷你图 同区）——四列，竖线全程连续
 *  （分隔线画在 Td 上、行内边距收进单元格里，行与行的线首尾相接不断开）。 */
const ROW_GRID: CSSProperties = {
  // 第五十五轮：预警列 100 → 216（格内直接放最新预警凝练详情，用户指定），
  // 售价/价差/趋势三列各收一点找补；产品列 flex 吸收
  display: 'grid',
  gridTemplateColumns: 'minmax(0,1fr) 168px 96px 216px 240px',
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

/** 列标题（表头行用）：13/700/mute，全部居中（第五十二轮追补三定居中；第五十三轮字号增大加粗） */
function Th(props: { children?: ReactNode; first?: boolean; last?: boolean }) {
  return (
    <Td first={props.first} last={props.last} justify="center">
      <span style={{ fontSize: 13, fontWeight: 700, color: color.mute, whiteSpace: 'nowrap' }}>{props.children}</span>
    </Td>
  );
}

/** 价差读数（P0①）：红 = 行内产品贵于基准（风险），蓝 = 便宜（优势）。
 *  第五十二轮起仅竞品行使用：diffPct(竞品, 我司同配置)。 */
function DiffCell(props: { label: string; diff: ReturnType<typeof diffPct> }) {
  const { label, diff } = props;
  return (
    <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
      <span style={{ display: 'block', fontSize: 10, color: color.mute }}>{label}</span>
      {diff ? (
        <span
          className="tnum"
          title={`${label}：正 = 前项贵于基准（红），负 = 便宜（蓝）`}
          style={{ fontSize: 12.5, fontWeight: 600, color: diff.tone === 'rich' ? color.error : color.link }}
        >
          {diff.text}
        </span>
      ) : (
        <span className="tnum" style={{ fontSize: 12.5, color: color.hairlineStrong }}>
          —
        </span>
      )}
    </span>
  );
}

/** 周期最低价读数（P0②；第五十二轮追补三简化）：低 {最低价} · {发生周三日期 MM-DD}
 *  ——并入「价格趋势」区（用户：分割线放在最小值前）；Wxx 改日期、覆盖% 删除 */
function MinCell(props: { points: OverviewSparkPoint[]; minV: number | null; minIdx: number; currency: 'usd' | 'local'; dateOf: (weekId: string) => string }) {
  const { points, minV, minIdx, currency, dateOf } = props;
  return (
    <span className="tnum" title="周期最低价与发生周（采集锚周三）" style={{ whiteSpace: 'nowrap', fontSize: 10.5, color: color.body }}>
      {minV != null ? (
        <>
          低 {formatPrice(minV, currency)} · {dateOf(points[minIdx].weekId)}
        </>
      ) : (
        '—'
      )}
    </span>
  );
}

/** 共享值域：盒内我司 + 全部映射竞品的 min/max 并集（第四十轮） */
function boxDomain(series: OverviewSparkPoint[][]): { domainMin: number; domainMax: number } | undefined {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const pts of series) {
    for (const pt of pts) {
      if (pt.price == null) continue;
      if (pt.price < min) min = pt.price;
      if (pt.price > max) max = pt.price;
    }
  }
  return min === Number.POSITIVE_INFINITY ? undefined : { domainMin: min, domainMax: max };
}

/** 价差方向（第五十二轮追补，用户拍板）：'comp' = 竞品比我司（默认，diffPct(竞品,我司)）、
 *  'own' = 我司比竞品（diffPct(我司,竞品)）；切换器在我司行原「vs 主竞品」空槽位 */
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

/** 我司 ROM 行（第五十四轮定版）：主列 = 点+品牌+产品名（14/700）+ROMRAM（15/700 更大，
 *  用户：主要凸显的就是这个不同）+ 我司胶囊；行尾固定 竞品对比/多平台对比（＋添加竞品保留）。
 *  第五十四轮：整行点击进看板与行内「对比 ↗」删除（用户点名）——下钻只走「竞品对比」按钮 */
function OwnRomRow(props: {
  row: OverviewRow;
  currency: 'usd' | 'local';
  domainMin?: number;
  domainMax?: number;
  /** 竞品对比：该 ROM + 其对标竞品下钻看板（原整行点击/对比↗ 的唯一入口） */
  onCompare: () => void;
  /** 预警列（追补⑨）：父层按系列组装好的状态单元格（第五十五轮起含订阅铃铛） */
  alertCell?: ReactNode;
  /** 迷你图点周（追补⑧）：带该周焦点进看板 */
  onPickWeek?: (weekId: string) => void;
  /** 多平台对比：弹窗按该 ROM 预选 */
  onMultiPlatform: () => void;
  onConfigBench: () => void;
  diffDir: DiffDir;
  onToggleDiffDir: () => void;
  /** 该 ROM 已配置对标竞品才出切换器（无竞品价差无意义） */
  canToggleDiff: boolean;
  /** weekId → 采集锚周三日期 MM-DD */
  dateOf: (weekId: string) => string;
}) {
  const { row, currency } = props;
  return (
    <div className="lpl-ov-row" style={{ ...ROW_GRID }}>
      <Td first padY={9}>
        {/* 撑满主列宽（第五十四轮）：动作簇 marginLeft auto 才能推到行尾空白处固定显示 */}
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, width: '100%' }}>
          <BrandDot brand={row.brand} />
          {/* 第五十三轮追加：我司行显性化——名称 14px/700，ROM+RAM 再大一档 15px/700
              （用户：主要凸显的就是 ROM+RAM 这个不同）；竞品行维持 13px/600 形成主次 */}
          <span style={{ fontSize: 14, fontWeight: 700, color: color.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
            {brandLabelOf(row.brand)} {row.modelName}
          </span>
          <span style={{ fontSize: 15, fontWeight: 700, color: color.ink, whiteSpace: 'nowrap', flexShrink: 0 }}>
            {row.romram}
          </span>
          {/* 「我司」胶囊第五十四轮追补删除（用户圈删）：行归属已由型号头行表达 */}
          <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <span
              role="button"
              title="为该配置添加/调整对标竞品"
              onClick={(e) => {
                e.stopPropagation();
                props.onConfigBench();
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                fontSize: 10.5,
                fontWeight: 600,
                color: selectSoftInk,
                background: selectSoft,
                border: '1px solid rgba(0, 112, 243, 0.40)',
                borderRadius: radius.pill,
                padding: '1px 8px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              ＋ 添加竞品
            </span>
            {/* 第五十四轮：行尾固定双按钮（原型号头 ModelActions + 行内对比↗ 收编于此）。
                追补⑦显性化：竞品对比 = 实心蓝主按钮（下钻看板的主 CTA）、多平台对比 = 描边蓝，
                字号 10.5→12、内边距加大一档（用户：按钮再显性一点） */}
            <span
              role="button"
              title="进入价格看板：该 ROM + 对标竞品走势"
              onClick={props.onCompare}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                fontSize: 12,
                fontWeight: 600,
                color: '#ffffff',
                background: '#0070f3',
                border: '1px solid #0070f3',
                borderRadius: radius.pill,
                padding: '3px 12px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              竞品对比
            </span>
            <span
              role="button"
              title="多平台对比：该产品的价格按平台展开"
              onClick={props.onMultiPlatform}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                fontSize: 12,
                fontWeight: 600,
                color: '#0070f3',
                background: color.canvas,
                border: '1px solid rgba(0, 112, 243, 0.55)',
                borderRadius: radius.pill,
                padding: '3px 12px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              多平台对比
            </span>
          </span>
        </span>
      </Td>
      {/* 当前售价（第五十三轮）：完全参考看板时点页签——横向三件套 折扣徽章+现价+划线 RRP，
          字号与页签一致（17px/700 主价、11px 划线、徽章同组件） */}
      <Td justify="end" padY={9}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
          {row.discountPct != null && <DiscountBadge discount={row.discountPct} />}
          <span className="tnum" style={{ fontSize: 17, lineHeight: '22px', fontWeight: 700, color: color.ink }}>
            {formatPrice(row.price, currency)}
          </span>
          {row.rrp != null && (
            <span
              className="tnum"
              title="RRP（官方建议零售价）"
              style={{ fontSize: 11, lineHeight: '15px', color: color.mute, textDecoration: 'line-through' }}
            >
              {formatPrice(row.rrp, currency)}
            </span>
          )}
        </span>
      </Td>
      {/* 价差方向切换器（第五十二轮追补）：竞品比我司 ⇄ 我司比竞品，作用于本框竞品列 */}
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
      <Td>{props.alertCell}</Td>
      {/* 价格趋势区（追补三）：分割线在最低价前——「低 $x · 日期」与迷你图同区 */}
      <Td last padY={9}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0, width: '100%' }}>
          <MinCell points={row.points} minV={row.minV} minIdx={row.minIdx} currency={currency} dateOf={props.dateOf} />
          <span style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'flex-end' }}>
            <MatrixSpark
              points={row.points}
              lineColor={row.lineColor}
              currency={currency}
              width={104}
              domainMin={props.domainMin}
              domainMax={props.domainMax}
              onPickWeek={props.onPickWeek}
            />
          </span>
        </span>
      </Td>
    </div>
  );
}

/** 竞品行（映射竞品，第四十五轮起「其他」不再展示）：与我司行同四列栅格；行间横向分隔线。
 *  第五十二轮追补三：主列改看板页签式（点+品牌+产品名+RAMROM），主竞品保留产品名后蓝胶囊；
 *  价差方向随我司行切换器——'comp' = 竞品比我司（红=竞品贵）、'own' = 我司比竞品（红=我司贵） */
function CompRomRow(props: {
  skuId?: string;
  brand: string;
  name: string;
  romram: string;
  price: number | null;
  rrp: number | null;
  lineColor: string;
  points: OverviewRow['points'];
  currency: 'usd' | 'local';
  domainMin?: number;
  domainMax?: number;
  primary?: boolean;
  /** 对标我司 ROM 的现价（价差基准） */
  ownPrice?: number | null;
  /** 价差方向：随我司行切换器 */
  diffDir?: DiffDir;
  /** 预警列（追补⑨）：父层按系列组装好的状态单元格 */
  alertCell?: ReactNode;
  /** 迷你图点周（追补⑧）：带该周焦点进看板（上下文 = 所在 ROM 框的我司行） */
  onPickWeek?: (weekId: string) => void;
  /** 周期最低价 + 下标（P0②，aggregate extremes 同源） */
  minV?: number | null;
  minIdx?: number;
  /** weekId → 采集锚周三日期 MM-DD */
  dateOf: (weekId: string) => string;
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
          {/* 页签同款字体（第五十三轮 11px → 13px/600/ink，与我司行一致） */}
          <span style={{ fontSize: 13, fontWeight: 600, color: color.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {brandLabelOf(props.brand)} {props.name} {props.romram}
          </span>
          {/* 「主竞品」胶囊第五十四轮追补删除（用户圈删） */}
        </span>
      </Td>
      {/* 当前售价（第五十三轮）：页签同款横向三件套，与我司行完全一致 */}
      <Td justify="end">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
          {discount != null && <DiscountBadge discount={discount} />}
          <span className="tnum" style={{ fontSize: 17, lineHeight: '22px', fontWeight: 700, color: color.ink }}>
            {formatPrice(props.price, props.currency)}
          </span>
          {props.rrp != null && (
            <span
              className="tnum"
              title="RRP（官方建议零售价）"
              style={{ fontSize: 11, lineHeight: '15px', color: color.mute, textDecoration: 'line-through' }}
            >
              {formatPrice(props.rrp, props.currency)}
            </span>
          )}
        </span>
      </Td>
      <Td justify="end">
        <DiffCell label={dir === 'comp' ? 'vs 我司' : 'vs 此竞品'} diff={diff} />
      </Td>
      <Td>{props.alertCell}</Td>
      {/* 价格趋势区（追补三）：「低 $x · 日期」与迷你图同区 */}
      <Td last>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0, width: '100%' }}>
          <MinCell points={props.points} minV={props.minV ?? null} minIdx={props.minIdx ?? -1} currency={props.currency} dateOf={props.dateOf} />
          <span style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'flex-end' }}>
            <MatrixSpark
              points={props.points}
              lineColor={props.lineColor}
              currency={props.currency}
              width={104}
              domainMin={props.domainMin}
              domainMax={props.domainMax}
              onPickWeek={props.onPickWeek}
            />
          </span>
        </span>
      </Td>
    </div>
  );
}

export default function Overview() {
  const { go } = usePage();
  const { state, actions } = useFilters();
  const currency = state.currency;
  // 第四十四轮：竞品映射吃「生效矩阵」（配置页/配置对标弹窗的手动快照优先，回退 auto），
  // CONFIG_CHANGED_EVENT → 重建（看板 autoMatch 开时竞品组同事件自动跟随）
  const [bench, setBench] = useState<DimBenchmark[]>(() => getEffectiveBenchmark());

  // 追补⑧（总览↔看板闭环①）：看板「← 返回总览该产品」携带 modelId——挂载后滚动定位
  // 到该型号头行（滚动容器 = [data-lpl-scroll]，延时等首帧渲染；IAB 注意事项同 openCompare）
  useLayoutEffect(() => {
    const target = navBus.overviewScrollTo;
    if (!target) return;
    navBus.overviewScrollTo = null;
    window.setTimeout(() => {
      const scroller = document.querySelector<HTMLElement>('[data-lpl-scroll]');
      const el = document.querySelector<HTMLElement>(`[data-model-id="${target}"]`);
      if (!scroller || !el) return;
      scroller.scrollTop =
        el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 12;
    }, 160);
  }, []);
  useEffect(() => {
    const h = () => setBench(getEffectiveBenchmark());
    window.addEventListener(CONFIG_CHANGED_EVENT, h);
    return () => window.removeEventListener(CONFIG_CHANGED_EVENT, h);
  }, []);
  // 第五十一轮：平台筛选进入矩阵口径（applyPlatform 因子与看板同源；OZON 基准不变）
  const bands = useMemo(() => buildOverviewMatrix(currency, bench, state.platform), [currency, bench, state.platform]);
  const [mpSel, setMpSel] = useState<{ model: OverviewModel; romram: string } | null>(null); // 多平台对比弹窗（第五十三轮实装；第五十四轮按 ROM 预选）
  // 第四十五轮：「添加竞品」入口下沉到 ROM 行 → 记录型号+ROM，弹窗按该 ROM 预选
  const [benchSel, setBenchSel] = useState<{ modelId: string; romram: string } | null>(null);
  // 第五十二轮追补：价差方向（竞品比我司 / 我司比竞品），每 ROM 框独立，默认竞品比我司
  const [diffDirs, setDiffDirs] = useState<Record<string, DiffDir>>({});
  // 追补三：weekId → 采集锚周三日期（MM-DD）——最低价标记由 Wxx 改日期
  const dateOf = useMemo(() => {
    const m = new Map(dimTime.map((w) => [w.week_id, w.week_wed_date.slice(5)]));
    return (weekId: string): string => m.get(weekId) ?? weekId;
  }, []);
  const toggleDiffDir = (key: string): void =>
    setDiffDirs((prev) => ({ ...prev, [key]: (prev[key] ?? 'comp') === 'comp' ? 'own' : 'comp' }));
  const benchModel = useMemo(
    () => (benchSel ? bands.flatMap((b) => b.models).find((m) => m.modelId === benchSel.modelId) ?? null : null),
    [bands, benchSel],
  );
  // 第四十三轮：产品筛选 = 看板同款级联（受控注入），默认选 Pura 90s Pro（全部 ROM·代表色）；
  // 价格档位筛选同前。空产品选择 = 全部。
  const [selTiers, setSelTiers] = useState<string[]>([]);
  const [prodSel, setProdSel] = useState<ProductSelection[]>(() => {
    const pura = bands.flatMap((b) => b.models).find((m) => m.isOwn && m.modelName === 'Pura 90s Pro');
    return pura ? pura.rows.map((r) => ({ modelId: pura.modelId, romram: r.romram, skuIds: [r.skuId] })) : [];
  });

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

  const asOf = useMemo(() => {
    let w = '';
    for (const b of bands) for (const m of b.models) for (const r of m.rows) if (r.asOfWeek > w) w = r.asOfWeek;
    return w === '' ? '—' : `${w.slice(0, 4)}-W${w.slice(4)}`;
  }, [bands]);
  // 口径条平台文案（第五十一轮）：随筛选行平台选择联动（与看板共享 state.platform）
  const platformLabel = useMemo(() => {
    const sel = state.platform;
    if (!sel || (sel.platforms.length === 0 && sel.shopIds.length === 0)) return '未筛选（可抓取最低价口径）';
    const shopNameById = new Map(dimChannel.map((c) => [c.shop_id, c.shop_name]));
    return [...sel.platforms, ...sel.shopIds.map((id) => shopNameById.get(id) ?? id)].join('、');
  }, [state.platform]);
  const counts = useMemo(() => {
    const ms = bands.flatMap((b) => b.models);
    return { all: ms.length, own: ms.filter((m) => m.isOwn).length, comp: ms.length - ms.filter((m) => m.isOwn).length };
  }, [bands]);

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

  return (
    // data-lpl-scroll：追补⑧「← 返回总览」滚动定位的滚动容器标记（与看板同约定）
    <div data-lpl-scroll style={{ height: '100%', overflowX: 'auto', background: color.canvasSoft }}>
      <div style={{ minWidth: 1280, minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* 顶栏 64px（共享 PageHeader，预警中心重构统一四页铬架） */}
        <PageHeader title="国家总览" />

        <main style={{ flex: 1, padding: space.lg }}>
          <section style={{ background: color.canvas, boxShadow: shadow.l1, borderRadius: radius.card, padding: space.lg }}>
            {/* 口径条：国家层面上下文 + 币种 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: space.md, flexWrap: 'wrap' }}>
              <span style={{ fontSize: fontSize.displaySm, fontWeight: 600, color: color.ink }}>俄罗斯 · 手机竞品矩阵</span>
              <span style={{ fontSize: fontSize.caption, color: color.mute }}>
                平台 {platformLabel} · 在售型号 {counts.all}（我司 {counts.own} / 竞品 {counts.comp}）
              </span>
              <span style={{ flex: 1 }} />
              <Segmented
                size="small"
                value={currency}
                onChange={(v) => actions.set({ currency: v as 'usd' | 'local' })}
                options={[
                  { label: 'USD $', value: 'usd' },
                  { label: 'RUB ₽', value: 'local' },
                ]}
              />
            </div>

            {/* 筛选行（第三十八轮）：国家/产业为共享口径态；产品/价格档位为本页视图态（空 = 全部） */}
            <ConfigProvider theme={filterBarTheme}>
              <div style={{ display: 'flex', gap: 10, rowGap: 8, flexWrap: 'wrap', marginTop: space.base }}>
                <FilterCell label="国家">
                  <CountryBox />
                </FilterCell>
                <FilterCell label="产业">
                  <IndustryControl />
                </FilterCell>
                <FilterCell min={400} label="产品">
                  <OwnProductControl selection={prodSel} onSelectionChange={setProdSel} />
                </FilterCell>
                {/* 平台（第五十一轮）：看板同款级联（平台→店铺），共享 state.platform 双页联动 */}
                <FilterCell min={180} label="平台">
                  <PlatformBox />
                </FilterCell>
                <FilterCell min={280} label="价格档位">
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
              </div>
            </ConfigProvider>

            {/* 档位带 × 包裹格子矩阵（型号与映射竞品一体成格） */}
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
              return (
                <section key={band.tierCode} style={{ marginTop: space.xl }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: space.md, padding: `0 0 ${space.sm}px` }}>
                    <span style={{ fontSize: fontSize.bodySm, fontWeight: 600, color: color.ink }}>
                      {TIER_LABELS[band.tierCode]}
                    </span>
                    <span style={{ fontSize: fontSize.caption, color: color.mute }}>
                      我司 {ownModels.length} · 竞品 {compCount}
                    </span>
                    <span style={{ flex: 1 }} />
                    <span style={{ fontSize: fontSize.caption, color: color.mute }}>对标 = ROM 级映射 · 行尾「＋添加竞品」维护</span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: space.lg }}>
                    {ownModels.map((m) => (
                      <div key={m.modelId} style={{ display: 'flex', flexDirection: 'column', gap: space.sm }}>
                        {/* 型号头行：ROM 格子的归属（品牌图标（华为=花瓣标，第五十四轮追补用户指定）
                            +名称/生命周期/快捷按钮；第四十五轮名称带品牌名）。
                            data-model-id = 看板「← 返回总览」的滚动定位锚点（追补⑧） */}
                        <div data-model-id={m.modelId} style={{ display: 'flex', alignItems: 'center', gap: space.sm, padding: '0 2px' }}>
                          <BrandGlyph brand={m.brand} size={16} />
                          <span style={{ fontSize: 15, fontWeight: 600, color: color.ink }}>
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
                          <span style={{ flex: 1 }} />
                        </div>
                        {/* ROM 包裹格：行组表格——我司行在上、映射竞品在下（第四十轮对齐定版） */}
                        {m.rows.map((r) => {
                          const romComps = m.comps.filter((c) => c.ownRomrams.some((x) => norm(x) === norm(r.romram)));
                          const domain = boxDomain([r.points, ...romComps.map((c) => c.points)]);
                          const dirKey = `${m.modelId}__${r.romram}`;
                          const dir = diffDirs[dirKey] ?? 'comp';
                          return (
                            <div
                              key={r.romram}
                              style={{
                                border: `1px solid ${color.hairline}`,
                                borderRadius: radius.card,
                                background: color.canvas,
                                overflow: 'hidden',
                              }}
                            >
                              {/* 表头行（第五十二轮追补三）：四列全居中——产品｜当前售价｜竞品对比｜
                                  价格趋势（价格趋势区 = 周期最低+日期 与迷你图同区，分割线在最低价前） */}
                              <div style={{ ...ROW_GRID, borderBottom: `1px solid ${color.hairline}` }}>
                                <Th first>产品</Th>
                                <Th>当前售价</Th>
                                <Th>竞品对比</Th>
                                <Th>预警</Th>
                                <Th last>价格趋势</Th>
                              </div>
                              <OwnRomRow
                                row={r}
                                currency={currency}
                                domainMin={domain?.domainMin}
                                domainMax={domain?.domainMax}
                                diffDir={dir}
                                onToggleDiffDir={() => toggleDiffDir(dirKey)}
                                canToggleDiff={romComps.length > 0}
                                dateOf={dateOf}
                                onCompare={() =>
                                  // 追补⑧：下钻携带周期最低价周——看板窗口直接对准「低 $x · 发生周」
                                  openCompare(m, r.romram, r.minIdx >= 0 ? r.points[r.minIdx]?.weekId ?? null : null)
                                }
                                alertCell={alertCellFor(r.skuId)}
                                onPickWeek={(w) => openCompare(m, r.romram, w)}
                                onMultiPlatform={() => setMpSel({ model: m, romram: r.romram })}
                                onConfigBench={() => setBenchSel({ modelId: m.modelId, romram: r.romram })}
                              />
                              <div
                                style={{
                                  background: color.canvasSoft,
                                  borderTop: `1px solid ${color.hairline}`,
                                }}
                              >
                                {romComps.length === 0 ? (
                                  <div style={{ padding: '8px 16px' }}>
                                    <div
                                      style={{
                                        border: `1px dashed ${color.hairlineStrong}`,
                                        borderRadius: radius.card,
                                        padding: '8px 12px',
                                        fontSize: 12,
                                        color: color.mute,
                                      }}
                                    >
                                      未配置对标竞品 — 点行尾「＋添加竞品」添加
                                    </div>
                                  </div>
                                ) : (
                                  romComps.map((c) => (
                                    <CompRomRow
                                      key={c.skuId}
                                      skuId={c.skuId}
                                      brand={c.brand}
                                      name={c.modelName}
                                      romram={c.romram}
                                      price={c.price}
                                      rrp={c.rrp}
                                      lineColor={c.lineColor}
                                      points={c.points}
                                      currency={currency}
                                      domainMin={domain?.domainMin}
                                      domainMax={domain?.domainMax}
                                      primary={c.primary}
                                      ownPrice={r.price}
                                      diffDir={dir}
                                      dateOf={dateOf}
                                      minV={c.minV}
                                      minIdx={c.minIdx}
                                      alertCell={alertCellFor(c.skuId)}
                                      onPickWeek={(w) => openCompare(m, r.romram, w)}
                                    />
                                  ))
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
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

        <footer
          style={{ flexShrink: 0, padding: `${space.md}px ${space.lg}px`, fontSize: fontSize.caption, color: color.mute }}
        >
          {/* 追补⑦：只留平台/业务口径，删 UI 语义解释与 demo 字样（用户：AI 解释性字眼） */}
          口径：现价/RRP = 最新有值周（{asOf}） · 档位按上市价（USD）归档 ·
          折后价 = OZON 基准 × 平台因子（DNS +0.8% / M.Video +1.5%） ·
          参考汇率 80₽/$（配置页可改）
        </footer>
      </div>

      {/* 配置对标（第四十四轮）：看板同款配置存储，保存后事件刷新矩阵与看板竞品；
          第四十五轮起由各 ROM 行进入，预选对应 ROM */}
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
