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
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Button, ConfigProvider, Modal, Popover, Segmented, Select } from 'antd';
import { usePage } from '../state/PageContext';
import { useFilters } from '../state/FiltersContext';
import type { ProductSelection } from '../state/filtersTypes';
import { buildOverviewMatrix, TIER_LABELS } from '../dataModel/aggregate';
import type { OverviewColorOpt, OverviewModel, OverviewRow, OverviewSparkPoint } from '../dataModel/aggregate';
import type { DimBenchmark } from '../dataModel/types';
import { filterBarTheme } from '../components/FilterBar';
import CountryBox from '../components/FilterBar/CountryBox';
import PlatformBox from '../components/FilterBar/PlatformBox';
import { IndustryControl, OwnProductControl } from '../components/FilterBar/ProductBox';
import { dimChannel } from '../data';
import { getEffectiveBenchmark } from '../state/configStore';
import { CONFIG_CHANGED_EVENT } from '../state/lplKeys';
import BenchConfigModal from './overview/BenchConfigModal';
import BrandDot, { brandLabelOf } from '../components/BrandMark';
import MatrixSpark from './overview/MatrixSpark';
import { diffPct } from '../chart/PriceTrend/helpers';
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

/** 型号卡头部的快捷动作（总览统一扩展位：后续量·价/成本推演挂同一排）。
 *  第四十五轮：「添加竞品」下沉到各 ROM 行（映射粒度 = ROM 级，入口跟着粒度走）。 */
function ModelActions(props: { onCompare: () => void; onMultiPlatform: () => void }) {
  return (
    <span style={{ display: 'inline-flex', gap: 6, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
      <Button size="small" style={{ height: 24, fontSize: 12 }} onClick={props.onCompare}>
        竞品对比
      </Button>
      <Button size="small" style={{ height: 24, fontSize: 12 }} onClick={props.onMultiPlatform}>
        多平台对比
      </Button>
    </span>
  );
}

/** 颜色次级菜单：ROM 行内的「N 色」chip → 点开列出各色现价（代表色=最低价色 打标） */
function ColorMenu(props: {
  colors: OverviewColorOpt[];
  currency: 'usd' | 'local';
  repSku: string;
  /** 代表色标文案：我司=最低价色；竞品=对标色（第四十四轮） */
  repLabel?: string;
}) {
  const { colors, currency, repSku, repLabel = '最低价色' } = props;
  if (colors.length <= 1) return null;
  const content = (
    <div style={{ minWidth: 190 }}>
      <div style={{ fontSize: 11, color: color.mute, marginBottom: 4 }}>
        各颜色现价 · {currency === 'usd' ? 'USD' : 'RUB'}
      </div>
      {colors.map((c) => (
        <div
          key={c.skuId}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, padding: '3px 0', fontSize: 12 }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span
              aria-hidden
              style={{ width: 8, height: 8, borderRadius: 9999, border: `1.5px solid ${color.hairlineStrong}`, display: 'inline-block' }}
            />
            {c.color}
            {c.skuId === repSku && (
              <span style={{ fontSize: 10, color: color.link, background: '#e8f1ff', borderRadius: radius.pill, padding: '0 6px' }}>
                {repLabel}
              </span>
            )}
          </span>
          <span className="tnum" style={{ color: color.body }}>
            {formatPrice(c.price, currency)}
          </span>
        </div>
      ))}
    </div>
  );
  return (
    <Popover content={content} trigger="click" placement="bottomLeft">
      <button
        className="lpl-ov-colors"
        onClick={(e) => e.stopPropagation()}
        title="按颜色查看现价"
      >
        {colors.length} 色 ▾
      </button>
    </Popover>
  );
}

/** 盒内统一行栅格：主体 ｜ 价格列 ｜ 价差(PID) ｜ 低·覆盖 ｜ 迷你图——我司行与竞品行同构对齐。
 *  第五十一轮 P0：三列扩五列（价差 / 周期最低价+周 / 在售覆盖） */
const ROW_GRID: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0,1fr) 96px 84px 112px 150px',
  alignItems: 'center',
  columnGap: 10,
};

/** 价差读数（P0①）：红 = 行内产品贵于基准（风险），蓝 = 便宜（优势）——两行型共用同一规则。
 *  diffPct(a, b) = (a−b)/b：我司行传 (我司, 主竞品)，竞品行传 (竞品, 我司)。 */
function DiffCell(props: { label: string; diff: ReturnType<typeof diffPct> }) {
  const { label, diff } = props;
  return (
    <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
      <span style={{ display: 'block', fontSize: 10, color: color.mute }}>{label}</span>
      {diff ? (
        <span
          className="tnum"
          title={`${label}：正 = 行内产品贵于基准（红），负 = 便宜（蓝）`}
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

/** 低·覆盖读数（P0②④）：周期最低价+发生周（Keepa 语义）+ 在售覆盖%。
 *  覆盖 = 在售期内有值周占比（首末有值周之间；未上市周不计入，缺采≈缺货） */
function MinCoverCell(props: { points: OverviewSparkPoint[]; minV: number | null; minIdx: number; currency: 'usd' | 'local' }) {
  const { points, minV, minIdx, currency } = props;
  const valIdx = points.map((p, i) => (p.price != null ? i : -1)).filter((i) => i >= 0);
  const span = valIdx.length ? valIdx[valIdx.length - 1] - valIdx[0] + 1 : 0;
  const cov = span ? Math.round((valIdx.length / span) * 100) : 0;
  const week = minIdx >= 0 ? `W${points[minIdx].weekId.slice(4)}` : null;
  const low = cov < 90; // 全量 SKU 在售期覆盖中位 ~97%；<90% = 长缺采/退市前异常区
  return (
    <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
      <span className="tnum" style={{ display: 'block', fontSize: 10.5, color: color.body }}>
        {minV != null ? (
          <>
            低 {formatPrice(minV, currency)} · {week}
          </>
        ) : (
          '—'
        )}
      </span>
      <span
        className="tnum"
        title="在售覆盖 = 在售期内有值周占比（首末有值周之间）；偏低 = 缺采/缺货"
        style={{ display: 'block', fontSize: 10.5, color: low ? '#b45309' : color.mute, fontWeight: low ? 600 : 400 }}
      >
        覆盖 {cov}%
      </span>
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

/** 我司 ROM 行：主体（ROM+颜色菜单+折扣徽标）｜ 价格列 ｜ 迷你图；整行点击进看板。
 *  行尾两个动作：对比 ↗（下钻看板）＋ 添加竞品（第四十五轮下沉到 ROM 粒度，
 *  点击开配置对标弹窗并预选该 ROM）。 */
function OwnRomRow(props: {
  row: OverviewRow;
  currency: 'usd' | 'local';
  domainMin?: number;
  domainMax?: number;
  /** 主竞品现价（P0① 价差基准；该 ROM 未对标 = null → 价差列 '—'） */
  benchPrice?: number | null;
  onOpen: () => void;
  onConfigBench: () => void;
}) {
  const { row, currency } = props;
  // 折扣率常显（P0③）：≤−15% 保留琥珀警示胶囊，其余中性小胶囊
  const discount =
    row.discountPct != null ? (
      row.discountPct <= -0.15 ? (
        <span
          className="tnum"
          style={{ fontSize: 10.5, fontWeight: 600, color: '#b45309', background: '#fff7e6', borderRadius: radius.pill, padding: '1px 6px' }}
        >
          {Math.round(row.discountPct * 100)}%
        </span>
      ) : (
        <span
          className="tnum"
          title="现价 / RRP − 1"
          style={{ fontSize: 10.5, color: color.body, background: color.canvasSoft2, borderRadius: radius.pill, padding: '1px 6px' }}
        >
          {Math.round(row.discountPct * 100)}%
        </span>
      )
    ) : null;
  return (
    <div
      className="lpl-ov-row"
      onClick={props.onOpen}
      title="进入价格看板：该 ROM + 对标竞品走势"
      style={{ ...ROW_GRID, padding: '9px 16px', cursor: 'pointer' }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <BrandDot brand={row.brand} size={8} />
        <span style={{ fontSize: 13.5, fontWeight: 600, color: color.ink }}>{row.romram}</span>
        <ColorMenu colors={row.colors} currency={currency} repSku={row.skuId} />
        {discount}
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
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
          <span
            role="button"
            title="进入价格看板：该 ROM + 对标竞品走势"
            onClick={(e) => {
              e.stopPropagation();
              props.onOpen();
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 2,
              fontSize: 10.5,
              fontWeight: 600,
              color: color.link,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            对比 ↗
          </span>
        </span>
      </span>
      <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
        <span className="tnum" style={{ fontSize: 15, fontWeight: 600, color: color.ink }}>
          {formatPrice(row.price, currency)}
        </span>
        {row.rrp != null && (
          <span className="tnum" style={{ display: 'block', fontSize: 10, color: color.mute, textDecoration: 'line-through' }}>
            {formatPrice(row.rrp, currency)}
          </span>
        )}
      </span>
      <DiffCell
        label="vs 主竞品"
        diff={row.price != null && props.benchPrice != null ? diffPct(row.price, props.benchPrice) : null}
      />
      <MinCoverCell points={row.points} minV={row.minV} minIdx={row.minIdx} currency={currency} />
      <MatrixSpark
        points={row.points}
        lineColor={row.lineColor}
        currency={currency}
        domainMin={props.domainMin}
        domainMax={props.domainMax}
      />
    </div>
  );
}

/** 竞品行（映射竞品，第四十五轮起「其他」不再展示）：与我司行同栅格；行间横向分隔线。
 *  第五十一轮 P0：价差列 = vs 我司（同 ROM 基准）；低·覆盖列同构 */
function CompRomRow(props: {
  skuId?: string;
  brand: string;
  name: string;
  romram: string;
  colorName?: string;
  price: number | null;
  rrp: number | null;
  lineColor: string;
  points: OverviewRow['points'];
  currency: 'usd' | 'local';
  domainMin?: number;
  domainMax?: number;
  colors?: OverviewColorOpt[];
  tag?: string;
  tagAccent?: boolean;
  /** 对标我司 ROM 的现价（价差基准） */
  ownPrice?: number | null;
  /** 周期最低价 + 下标（P0②，aggregate extremes 同源） */
  minV?: number | null;
  minIdx?: number;
}) {
  return (
    <div className="lpl-ov-comp-row" style={{ ...ROW_GRID, padding: '7px 16px' }}>
      <span style={{ minWidth: 0, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <BrandDot brand={props.brand} size={7} />
          <span style={{ fontSize: 12.5, fontWeight: 600, color: color.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {/* 第四十五轮：竞品名带品牌名（型号名已含品牌词则不重复） */}
            {!props.name.toLowerCase().startsWith(brandLabelOf(props.brand).toLowerCase()) && (
              <span style={{ color: color.mute }}>{brandLabelOf(props.brand)} </span>
            )}
            {props.name}
          </span>
          <span style={{ fontSize: 10.5, color: color.mute, whiteSpace: 'nowrap' }}>
            {props.romram}
            {props.colorName ? ` · ${props.colorName}` : ''}
          </span>
        </span>
        {props.colors && props.colors.length > 1 && (
          <ColorMenu colors={props.colors} currency={props.currency} repSku={props.skuId ?? ''} repLabel="对标色" />
        )}
        {props.tag && (
          <span
            className="tnum"
            style={{ display: 'block', fontSize: 10, marginTop: 1, color: props.tagAccent ? color.link : color.mute, paddingLeft: 13 }}
          >
            {props.tag}
          </span>
        )}
      </span>
      <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
        <span className="tnum" style={{ fontSize: 13, fontWeight: 600, color: color.ink }}>
          {formatPrice(props.price, props.currency)}
        </span>
        {props.rrp != null && (
          <span className="tnum" style={{ display: 'block', fontSize: 10, color: color.mute, textDecoration: 'line-through' }}>
            {formatPrice(props.rrp, props.currency)}
          </span>
        )}
      </span>
      <DiffCell
        label="vs 我司"
        diff={props.price != null && props.ownPrice != null ? diffPct(props.price, props.ownPrice) : null}
      />
      <MinCoverCell points={props.points} minV={props.minV ?? null} minIdx={props.minIdx ?? -1} currency={props.currency} />
      <MatrixSpark
        points={props.points}
        lineColor={props.lineColor}
        currency={props.currency}
        domainMin={props.domainMin}
        domainMax={props.domainMax}
      />
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
  useEffect(() => {
    const h = () => setBench(getEffectiveBenchmark());
    window.addEventListener(CONFIG_CHANGED_EVENT, h);
    return () => window.removeEventListener(CONFIG_CHANGED_EVENT, h);
  }, []);
  // 第五十一轮：平台筛选进入矩阵口径（applyPlatform 因子与看板同源；OZON 基准不变）
  const bands = useMemo(() => buildOverviewMatrix(currency, bench, state.platform), [currency, bench, state.platform]);
  const [mpOpen, setMpOpen] = useState(false);
  // 第四十五轮：「添加竞品」入口下沉到 ROM 行 → 记录型号+ROM，弹窗按该 ROM 预选
  const [benchSel, setBenchSel] = useState<{ modelId: string; romram: string } | null>(null);
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

  /** 竞品对比：型号（或单 ROM）进看板；自动匹配关时仍按配置矩阵带出该型号竞品 */
  const openCompare = (m: OverviewModel, romram?: string): void => {
    const rows = romram ? m.rows.filter((r) => norm(r.romram) === norm(romram)) : m.rows;
    if (rows.length === 0) return;
    const list: ProductSelection[] = rows.map((r) => ({ modelId: m.modelId, romram: r.romram, skuIds: [r.skuId] }));
    actions.setOwnSelection(list);
    if (!state.autoMatch) actions.resetCompetitorsToConfig();
    go('dashboard');
  };

  return (
    <div style={{ height: '100%', overflowX: 'auto', background: color.canvasSoft }}>
      <div style={{ minWidth: 1280, minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* 顶栏 64px（与看板/配置同构） */}
        <header
          style={{
            height: 64,
            flexShrink: 0,
            background: color.canvas,
            boxShadow: shadow.l1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: `0 ${space.lg}px`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: space.md }}>
            <span style={{ fontSize: fontSize.bodyMd, fontWeight: 600, color: color.ink }}>PriceLens</span>
            <span style={{ fontSize: fontSize.caption, color: color.mute }}>
              欧亚 / R国 · 国家总览 · 数据批次 <span className="tnum">{asOf}</span>
            </span>
          </div>
          <div style={{ display: 'flex', gap: space.sm }}>
            <Button size="small" type="primary" style={{ height: 28 }}>
              总览
            </Button>
            <Button size="small" style={{ height: 28 }} onClick={() => go('dashboard')}>
              价格看板
            </Button>
            <Button size="small" style={{ height: 28 }} onClick={() => go('config')}>
              配置
            </Button>
          </div>
        </header>

        <main style={{ flex: 1, padding: space.lg }}>
          <section style={{ background: color.canvas, boxShadow: shadow.l1, borderRadius: radius.card, padding: space.lg }}>
            {/* 口径条：国家层面上下文 + 币种 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: space.md, flexWrap: 'wrap' }}>
              <span style={{ fontSize: fontSize.displaySm, fontWeight: 600, color: color.ink }}>俄罗斯 · 手机竞品矩阵</span>
              <span style={{ fontSize: fontSize.caption, color: color.mute }}>
                平台 {platformLabel} · 全周期 2025-W01 → {asOf}（93 周） · 在售型号 {counts.all}（我司 {counts.own} / 竞品 {counts.comp}）
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
                    <span style={{ fontSize: fontSize.caption, color: color.mute }}>对标 = ROM 级映射 · 配置页维护</span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: space.lg }}>
                    {ownModels.map((m) => (
                      <div key={m.modelId} style={{ display: 'flex', flexDirection: 'column', gap: space.sm }}>
                        {/* 型号头行：ROM 格子的归属（品牌+名称/生命周期/快捷按钮；第四十五轮名称带品牌名） */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: space.sm, padding: '0 2px' }}>
                          <BrandDot brand={m.brand} size={9} />
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
                          <ModelActions onCompare={() => openCompare(m)} onMultiPlatform={() => setMpOpen(true)} />
                        </div>
                        {/* ROM 包裹格：行组表格——我司行在上、映射竞品在下（第四十轮对齐定版） */}
                        {m.rows.map((r) => {
                          const romComps = m.comps.filter((c) => c.ownRomrams.some((x) => norm(x) === norm(r.romram)));
                          const primaryComp = romComps.find((c) => c.primary) ?? romComps[0];
                          const domain = boxDomain([r.points, ...romComps.map((c) => c.points)]);
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
                              <OwnRomRow
                                row={r}
                                currency={currency}
                                domainMin={domain?.domainMin}
                                domainMax={domain?.domainMax}
                                benchPrice={primaryComp?.price ?? null}
                                onOpen={() => openCompare(m, r.romram)}
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
                                      未配置对标竞品 — 可在配置页维护映射
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
                                      colorName={c.color}
                                      price={c.price}
                                      rrp={c.rrp}
                                      lineColor={c.lineColor}
                                      points={c.points}
                                      currency={currency}
                                      domainMin={domain?.domainMin}
                                      domainMax={domain?.domainMax}
                                      colors={c.colors}
                                      tag={`← ${r.romram}${c.primary ? ' · 主竞品' : ''}`}
                                      tagAccent={c.primary}
                                      ownPrice={r.price}
                                      minV={c.minV}
                                      minIdx={c.minIdx}
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
          口径：现价/RRP = 最新有值周（{asOf}） · 我司 ROM 行取最低价色为代表 · 迷你图 = 全周期周度折后价（●最高 ○最低） ·
          价差 = 行内产品相对基准（vs 主竞品 / vs 我司；红 = 行内更贵） · 覆盖 = 在售期内有值周占比（低于 90% 琥珀警示） ·
          档位按上市价（USD）归档 · 折后价 = OZON 基准 × 平台因子（DNS +0.8% / M.Video +1.5%，demo 演示口径） ·
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

      {/* 多平台对比（统一扩展位）：demo 为单平台口径，数据接入后此入口直接启用 */}
      <Modal
        open={mpOpen}
        width={440}
        centered
        title="多平台对比 · 规划中"
        onCancel={() => setMpOpen(false)}
        footer={
          <Button type="primary" size="small" onClick={() => setMpOpen(false)}>
            知道了
          </Button>
        }
      >
        <div style={{ fontSize: fontSize.bodySm, color: color.body, lineHeight: 1.7 }}>
          当前 demo 为「单平台多产品」口径：所有价格取自同一平台（OZON）。各平台同 SKU 采集数据接入后，此入口将直接启用
          「单产品多平台」视图——同一产品的价格轨迹按平台展开并显示平台间价差。
          <div style={{ marginTop: 8, fontSize: fontSize.caption, color: color.mute }}>
            总览的快捷按钮为统一扩展位：后续「量·价分析」「成本上涨后的渠道推演」等模块也将挂接在同一入口。
          </div>
        </div>
      </Modal>
    </div>
  );
}
