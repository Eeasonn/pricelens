// ============================================================
// 市场摆位（原市场摆位概要）。双模式（用户定版）：
// 【竞品对比】= 分段带摆位图：我司列 sticky 最左 + 竞品品牌列（拖拽调序），
//   卡片左上角灰色走势图标点击 = 跳看板只看该产品；悬停我司卡片 → 仅其对标竞品
//   保持高亮、其余置灰；我司卡片后三分之一滑入「查看详情」→ 对比浮窗
//   （我司各型号 vs 竞品各型号：型号/RRP/折后价/折扣四列横向对齐），浮窗右侧
//   通栏「查看价格走势」→ 内容右收动画后跳看板并展开时点摘要。
// 【在售产品】= 零间距表格：一行一产品（首列浅蓝底：产品名+RRP区间+折后价区间+
//   采集时间），后续列 = 该产品各型号从小到大（型号+RRP+折后价+折扣），
//   仍按价格档位分段带纵向分组。
// 轴：USD = 档位分段带（带高随档内产品数伸缩，摆位与档位必然对齐）；
//     本币 = 线性刻度轴（仅竞品模式）。
// ============================================================
import { HolderOutlined, ExclamationCircleFilled, LineChartOutlined } from '@ant-design/icons';
import { useEffect, useMemo, useState } from 'react';
import type { DragEvent as ReactDragEvent } from 'react';
import { Modal, Segmented, Tooltip } from 'antd';
import type { CurrencyMode } from '../../dataModel/types';
import { lowestPriceColorSku, type OverviewModel, type OverviewRow } from '../../dataModel/aggregate';
import { bucketLatestWeekLabel, tierLabelShort } from '../../chart/PriceTrend/helpers';
import { DiscountBadge } from '../../chart/PriceTrend/PriceSummary';
import BrandDot, { brandLabelOf } from '../../components/BrandMark';
import { useFilters } from '../../state/FiltersContext';
import { usePage } from '../../state/PageContext';
import { navBus } from '../../state/navBus';
import type { ProductSelection } from '../../state/filtersTypes';
import { brandColorOf, color, radius, selectAccent, selectSoft, selectSoftInk, space } from '../../theme/tokens';

export interface MarketMapProps {
  /** 全市场型号（我司+竞品矩阵全量）：摆位只看真实现价，不依赖竞品匹配关系（第七十七轮）。 */
  models: OverviewModel[];
  currency: CurrencyMode;
  /** 产业显示名（标题前段：手机 · 市场摆位） */
  industryLabel: string;
}

type MapMode = 'table' | 'market';

/** 型号现价：现价 = 最新采集周的代表配置价；另留区间与采集周（YYYYWW）供悬浮提示。 */
function modelPrice(model: OverviewModel): {
  min: number | null;
  max: number | null;
  mid: number | null;
  current: number | null;
  asOf: string;
} {
  const rows = model.rows;
  const values = rows.map((row) => row.price).filter((value): value is number => value != null);
  const weeks = rows.map((row) => row.asOfWeek).sort();
  const asOf = weeks.length > 0 ? weeks[weeks.length - 1] : '';
  const freshest = rows.find((row) => row.asOfWeek === asOf && row.price != null);
  if (values.length === 0) return { min: null, max: null, mid: null, current: null, asOf };
  const min = Math.min(...values);
  const max = Math.max(...values);
  return { min, max, mid: (min + max) / 2, current: freshest?.price ?? null, asOf };
}

function modelOnly(brand: string, modelName: string): string {
  const label = brandLabelOf(brand);
  return modelName.toLowerCase().startsWith(`${label.toLowerCase()} `) ? modelName.slice(label.length + 1) : modelName;
}

const fmtPrice = (value: number, currency: CurrencyMode): string =>
  `${currency === 'usd' ? '$' : '₽'}${Math.round(value).toLocaleString('en-US')}`;

/** 型号从小到大排序键：容量为主（1TB=1024）、RAM 为辅 */
function romramSizeKey(romram: string): number {
  const tb = romram.match(/(\d+)\s*TB/i);
  const gb = romram.match(/(\d+)\s*GB/i);
  const pair = romram.match(/(\d+)\s*\+\s*(\d+)/);
  const storage = tb ? Number(tb[1]) * 1024 : gb ? Number(gb[1]) : 0;
  const ram = pair ? Number(pair[1]) : 0;
  return storage * 100 + ram;
}

function brandKeyOf(brand: string): string {
  return brand.trim().toUpperCase();
}

function brandHeaderLabel(brand: string): string {
  if (brand === 'APPLE' || brand === 'XIAOMI') return brand;
  return brandLabelOf(brand);
}

/** 走势跳转小图标（用户定版：每块左上角灰色折线小图标，点击跳看板只看该产品） */
function TrendDot({ onClick, title }: { onClick: () => void; title: string }) {
  return (
    <span
      role="button"
      aria-label={title}
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{
        position: 'absolute',
        top: 3,
        left: 4,
        lineHeight: 0,
        color: color.hairlineStrong,
        zIndex: 2,
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.color = color.link)}
      onMouseLeave={(e) => (e.currentTarget.style.color = color.hairlineStrong)}
    >
      <LineChartOutlined style={{ fontSize: 10 }} />
    </span>
  );
}

/** 我司小卡（竞品对比模式）：浅蓝底 + 悬停后三分之一滑入「查看详情」 */
function OwnChip({
  model,
  price,
  currency,
  dimmed,
  hovered,
  onHover,
  onOpenTrend,
  onOpenDetail,
}: {
  model: OverviewModel;
  price: { min: number | null; max: number | null; current: number | null; asOf: string };
  currency: CurrencyMode;
  dimmed: boolean;
  hovered: boolean;
  onHover: (id: string | null) => void;
  onOpenTrend: () => void;
  onOpenDetail: () => void;
}) {
  const label = modelOnly(model.brand, model.modelName);
  const dateText = price.asOf ? bucketLatestWeekLabel('week', price.asOf) ?? '' : '';
  const priceText = price.current != null ? fmtPrice(price.current, currency) : '—';
  return (
    <span
      title={`${model.modelName} · 现价 ${priceText}${dateText ? `（${dateText} 采集）` : ''} · 悬停查看对标竞品`}
      onMouseEnter={() => onHover(model.modelId)}
      onMouseLeave={() => onHover(null)}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        minWidth: 0,
        maxWidth: '100%',
        width: '100%',
        height: 38,
        boxSizing: 'border-box',
        padding: '3px 9px 3px 18px',
        background: 'rgba(0, 112, 243, 0.07)',
        border: `1px solid rgba(0, 112, 243, 0.35)`,
        borderRadius: radius.control,
        overflow: 'hidden',
        cursor: 'pointer',
        opacity: dimmed ? 0.3 : 1,
        transition: 'opacity 200ms ease, border-color 200ms ease',
        textAlign: 'left' as const,
        font: 'inherit',
      }}
    >
      <TrendDot title={`只看 ${model.modelName} 的价格走势`} onClick={onOpenTrend} />
      <span style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
        <BrandDot brand={model.brand} size={6} />
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: brandColorOf(model.brand), fontSize: 12, fontWeight: 650 }}>{label}</span>
      </span>
      {price.current != null && (
        <span style={{ flexShrink: 0, marginLeft: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <span className="tnum" style={{ fontSize: 9.5, lineHeight: '11px', color: color.mute, whiteSpace: 'nowrap' }}>{dateText}</span>
          <span className="tnum" style={{ fontSize: 12, lineHeight: '15px', fontWeight: 700, color: color.ink, whiteSpace: 'nowrap' }}>{priceText}</span>
        </span>
      )}
      {/* 后三分之一滑入「查看详情」（从右到左） */}
      <span
        role="button"
        aria-label={`查看 ${model.modelName} 的竞品对比详情`}
        onClick={(e) => {
          e.stopPropagation();
          onOpenDetail();
        }}
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          width: '34%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: selectAccent,
          color: '#fff',
          fontSize: 11,
          fontWeight: 600,
          whiteSpace: 'nowrap',
          transform: hovered ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 240ms cubic-bezier(0.25, 0.8, 0.3, 1)',
        }}
      >
        查看详情
      </span>
    </span>
  );
}

/** 竞品小卡（竞品对比模式）：白底；走势图标可点，卡片本身不交互 */
function CompChip({
  model,
  price,
  currency,
  dimmed,
  onOpenTrend,
}: {
  model: OverviewModel;
  price: { min: number | null; max: number | null; current: number | null; asOf: string };
  currency: CurrencyMode;
  dimmed: boolean;
  onOpenTrend: () => void;
}) {
  const label = modelOnly(model.brand, model.modelName);
  const dateText = price.asOf ? bucketLatestWeekLabel('week', price.asOf) ?? '' : '';
  const priceText = price.current != null ? fmtPrice(price.current, currency) : '—';
  return (
    <span
      title={`${model.modelName} · 现价 ${priceText}${dateText ? `（${dateText} 采集）` : ''}`}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        minWidth: 0,
        maxWidth: '100%',
        width: '100%',
        height: 38,
        boxSizing: 'border-box',
        padding: '3px 9px 3px 18px',
        background: color.canvas,
        border: `1px solid ${color.hairline}`,
        borderRadius: radius.control,
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
        opacity: dimmed ? 0.25 : 1,
        transition: 'opacity 200ms ease',
        textAlign: 'left' as const,
        font: 'inherit',
      }}
    >
      <TrendDot title={`只看 ${model.modelName} 的价格走势`} onClick={onOpenTrend} />
      <span style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
        <BrandDot brand={model.brand} size={6} />
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: brandColorOf(model.brand), fontSize: 12, fontWeight: 650 }}>{label}</span>
      </span>
      {price.current != null && (
        <span style={{ flexShrink: 0, marginLeft: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <span className="tnum" style={{ fontSize: 9.5, lineHeight: '11px', color: color.mute, whiteSpace: 'nowrap' }}>{dateText}</span>
          <span className="tnum" style={{ fontSize: 12, lineHeight: '15px', fontWeight: 700, color: color.ink, whiteSpace: 'nowrap' }}>{priceText}</span>
        </span>
      )}
    </span>
  );
}

/** 对比浮窗内的一组（我司或单个竞品）：组头 = 品牌点+名称，行 = 型号从小到大 */
function CompareGroup({ brand, name, own, rows, currency }: {
  brand: string;
  name: string;
  own: boolean;
  rows: OverviewRow[];
  currency: CurrencyMode;
}) {
  const sorted = [...rows].sort((a, b) => romramSizeKey(a.romram) - romramSizeKey(b.romram));
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <BrandDot brand={brand} size={7} />
        <span style={{ fontSize: 12.5, fontWeight: 700, color: own ? brandColorOf(brand) : color.ink }}>{name}</span>
        {own && (
          <span style={{ fontSize: 10.5, lineHeight: '16px', padding: '0 7px', borderRadius: radius.pill, background: selectSoft, color: selectSoftInk, fontWeight: 600 }}>我司</span>
        )}
      </div>
      <div style={{ border: `1px solid ${color.hairline}`, borderRadius: radius.control, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr 1fr 0.7fr', background: color.canvasSoft, padding: '5px 12px', fontSize: 11, color: color.mute }}>
          <span>型号</span>
          <span className="tnum" style={{ textAlign: 'right' }}>RRP</span>
          <span className="tnum" style={{ textAlign: 'right' }}>折后价</span>
          <span style={{ textAlign: 'right' }}>折扣</span>
        </div>
        {sorted.map((row, index) => (
          <div
            key={row.skuId}
            style={{
              display: 'grid',
              gridTemplateColumns: '1.25fr 1fr 1fr 0.7fr',
              alignItems: 'center',
              padding: '6px 12px',
              fontSize: 12,
              borderTop: index === 0 ? 'none' : `1px solid ${color.hairline}`,
              background: color.canvas,
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: color.ink, fontWeight: 600 }}>{row.romram}</span>
            <span className="tnum" style={{ textAlign: 'right', color: color.mute, textDecoration: 'line-through' }}>{row.rrp != null ? fmtPrice(row.rrp, currency) : '—'}</span>
            <span className="tnum" style={{ textAlign: 'right', color: color.ink, fontWeight: 700 }}>{row.price != null ? fmtPrice(row.price, currency) : '—'}</span>
            <span style={{ display: 'flex', justifyContent: 'flex-end' }}>
              {row.discountPct != null ? <DiscountBadge discount={row.discountPct} /> : <span style={{ color: color.mute }}>—</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const MARKET_TIERS: [number, number, string][] = [
  [0, 200, '<200'],
  [200, 400, '200~400'],
  [400, 600, '400~600'],
  [600, 800, '600~800'],
  [800, 1000, '800~1000'],
  [1000, Number.POSITIVE_INFINITY, '1000+'],
];

export default function MarketMap({ models, currency, industryLabel }: MarketMapProps) {
  const { actions } = useFilters();
  const { go } = usePage();
  const [mode, setMode] = useState<MapMode>('market');
  // 标题括号内 = 全图最新采集周锚日（与卡片右上角采集日期同口径）
  const latestDate = useMemo(() => {
    let w = '';
    for (const m of models) for (const r of m.rows) if (r.asOfWeek > w) w = r.asOfWeek;
    return w ? bucketLatestWeekLabel('week', w) ?? '' : '';
  }, [models]);
  const market = useMemo(
    () => models
      .map((model) => ({ model, price: modelPrice(model) }))
      .sort((a, b) => (b.price.mid ?? -1) - (a.price.mid ?? -1) || a.model.modelName.localeCompare(b.model.modelName)),
    [models],
  );
  const ownItems = useMemo(() => market.filter(({ model }) => model.isOwn), [market]);
  const ownCount = ownItems.length;
  const compCount = market.length - ownCount;
  const allValues = market.flatMap(({ model }) => model.rows.map((row) => row.price)).filter((value): value is number => value != null);
  // 价位轴（第八十一轮）：域 = 数据范围 ±4%，不再从 0 拉到整档——顶部不再有空档。
  const vMax = allValues.length ? Math.max(...allValues) : 3000;
  const vMin = allValues.length ? Math.min(...allValues) : 0;
  const vSpan = Math.max(1, vMax - vMin);
  const axisTop = vMax + vSpan * 0.02;
  const axisBottom = Math.max(0, vMin - vSpan * 0.02);
  const plotTop = 34;
  const vToY = (value: number): number => {
    const plotHeight = Math.max(market.length * 26, 320);
    return plotTop + ((axisTop - value) / (axisTop - axisBottom)) * plotHeight;
  };
  const fmtTick = (value: number): string => {
    const trim = (n: number): string => String(+(n.toFixed(1)));
    if (value >= 1e6) return `${trim(value / 1e6)}M`;
    if (value >= 1000) return `${trim(value / 1000)}K`;
    return String(Math.round(value));
  };
  const usd = currency === 'usd';
  const CARD_H = 38; // 卡片高（走势图标让位后的统一行高）
  const BAND_GAP = 2;
  const BAND_PAD = 5;
  const ROW_H = 62; // 在售产品表：行内容高（行间留 TABLE_GAP，分隔线贯穿全宽）
  const TABLE_GAP = 10;

  // —— 分段带：竞品模式 = 全市场；在售产品模式 = 仅我司产品 ——
  const activeItems = mode === 'table' ? ownItems : market;
  const bandRects = useMemo(() => {
    if (!usd) return [];
    let top = plotTop;
    const rects: { label: string; lo: number; top: number; h: number; items: typeof activeItems }[] = [];
    for (const [lo, hi, label] of [...MARKET_TIERS].reverse()) {
      const items = activeItems.filter(({ price }) => {
        const v = price.mid ?? price.min;
        return v != null && v >= lo && v < hi;
      });
      if (items.length === 0) continue;
      const h = mode === 'table'
        ? items.length * (ROW_H + TABLE_GAP)
        : Math.max(76, items.length * (CARD_H + BAND_GAP) + BAND_PAD * 2);
      rects.push({ label, lo, top, h, items });
      top += h;
    }
    return rects;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeItems, usd, mode]);

  const tierBoxes = usd
    ? bandRects.map((b) => ({ label: b.label, top: b.top, h: b.h, empty: false }))
    : (mode === 'market'
      ? MARKET_TIERS
        .map(([lo, hi, label]) => {
          const lo2 = Math.max(lo, axisBottom);
          const hi2 = Math.min(hi, axisTop);
          if (lo2 >= hi2) return null;
          const top = vToY(hi2);
          return { label, top, h: vToY(lo2) - top, empty: !allValues.some((v) => v >= lo && v < hi) };
        })
        .filter((b): b is { label: string; top: number; h: number; empty: boolean } => b != null && b.h >= 8)
      : []);
  const ticks: number[] = useMemo(() => {
    if (usd) return [];
    const tickStep = (() => {
      const raw = (axisTop - axisBottom) / 5;
      const pow = 10 ** Math.floor(Math.log10(Math.max(1e-9, raw)));
      for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * pow) return m * pow;
      return 10 * pow;
    })();
    const out: number[] = [];
    for (let i = Math.ceil(axisBottom / tickStep); i <= Math.floor(axisTop / tickStep); i++) out.push(i * tickStep);
    return out;
  }, [usd, axisTop, axisBottom]);
  const axisMarks: { y: number; label: string | null }[] = usd
    ? bandRects.map((b) => ({ y: b.top + b.h, label: b.lo > 0 ? fmtTick(b.lo) : null }))
    : ticks.map((tick) => ({ y: vToY(tick), label: fmtTick(tick) }));
  const axisWidth = (usd ? 84 : 44) + 6;

  // —— 卡片纵向位置 ——
  const rowTops = new Map<string, number>();
  // 行块拉伸高：槽位之间的空隙归入上一行——竞品模式我司列底色借此连续不断点
  const rowHeights = new Map<string, number>();
  let lastBottom: number;
  if (usd) {
    for (const band of bandRects) {
      const pitch = mode === 'table' ? ROW_H + TABLE_GAP : CARD_H + BAND_GAP;
      const pad = mode === 'table' ? 0 : BAND_PAD;
      band.items.forEach((item, index) => {
        const top = band.top + pad + index * pitch;
        rowTops.set(item.model.modelId, top);
        const bottom = index < band.items.length - 1 ? band.top + pad + (index + 1) * pitch : band.top + band.h;
        rowHeights.set(item.model.modelId, Math.max(CARD_H, bottom - top));
      });
    }
    lastBottom = bandRects.length > 0 ? bandRects[bandRects.length - 1].top + bandRects[bandRects.length - 1].h : plotTop;
  } else {
    lastBottom = plotTop + 2;
    const ladder = activeItems.map((item) => {
      const rawTop = vToY(item.price.mid ?? item.price.min ?? axisBottom) - CARD_H / 2;
      return { modelId: item.model.modelId, top: Math.max(rawTop, lastBottom + 2) };
    });
    ladder.forEach((slot, index) => {
      rowTops.set(slot.modelId, slot.top);
      const nextTop = index < ladder.length - 1 ? ladder[index + 1].top : slot.top + CARD_H;
      rowHeights.set(slot.modelId, nextTop - slot.top);
    });
    lastBottom = ladder.length > 0 ? ladder[ladder.length - 1].top + CARD_H : plotTop + 2;
  }
  const totalHeight = usd ? lastBottom + 10 : Math.max(plotTop + Math.max(market.length * 26, 320) + 12, lastBottom + 12);

  // —— 竞品模式：品牌列（我司 sticky 最左；竞品列手动拖拽序） ——
  const ownBrands = useMemo(() => [...new Set(models.filter((m) => m.isOwn).map((m) => brandKeyOf(m.brand)))], [models]);
  const compBrands = useMemo(() => [...new Set(models.filter((m) => !m.isOwn).map((m) => brandKeyOf(m.brand)))], [models]);
  const DEFAULT_BRAND_ORDER = ['APPLE', 'SAMSUNG', 'HONOR', 'XIAOMI'];
  const MAX_VISIBLE_BRAND_COLUMNS = 4;
  const BRAND_ORDER_STORAGE_KEY = 'LPL3.map.brandOrder';
  const [manualOrder, setManualOrder] = useState<string[]>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(BRAND_ORDER_STORAGE_KEY) ?? '[]');
      return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(BRAND_ORDER_STORAGE_KEY, JSON.stringify(manualOrder));
    } catch {
      /* 隐私模式等场景写入失败不阻塞 */
    }
  }, [manualOrder]);
  const brandColumns = useMemo(() => {
    const rank = (brand: string): number => {
      const index = DEFAULT_BRAND_ORDER.indexOf(brand);
      return index >= 0 ? index : DEFAULT_BRAND_ORDER.length;
    };
    const base = [...compBrands]
      .sort((a, b) => rank(a) - rank(b) || brandHeaderLabel(a).localeCompare(brandHeaderLabel(b), 'en'))
      .map((key) => ({ key, label: brandHeaderLabel(key) }));
    if (manualOrder.length === 0) return base;
    const pos = (key: string): number => {
      const i = manualOrder.indexOf(key);
      return i >= 0 ? i : manualOrder.length;
    };
    return [...base].sort((a, b) => pos(a.key) - pos(b.key));
  }, [compBrands, manualOrder]);
  const [draggingBrand, setDraggingBrand] = useState<string | null>(null);
  const [dropBrand, setDropBrand] = useState<string | null>(null);
  const moveBrandTo = (dragKey: string, targetKey: string): void => {
    if (dragKey === targetKey) return;
    const keys = brandColumns.map((c) => c.key);
    const from = keys.indexOf(dragKey);
    const to = keys.indexOf(targetKey);
    if (from < 0 || to < 0) return;
    keys.splice(to, 0, keys.splice(from, 1)[0]);
    setManualOrder(keys);
  };

  // —— 交互：悬停我司 → 仅对标竞品高亮；详情浮窗；走势跳转 ——
  const [hoverOwnId, setHoverOwnId] = useState<string | null>(null);
  const litKeys = useMemo(() => {
    if (!hoverOwnId) return null;
    const own = models.find((m) => m.modelId === hoverOwnId);
    const keys = new Set<string>([hoverOwnId]);
    for (const c of own?.comps ?? []) keys.add(c.skuId.split('__')[0]);
    return keys;
  }, [hoverOwnId, models]);
  const [detailModelId, setDetailModelId] = useState<string | null>(null);
  const [collapsing, setCollapsing] = useState(false);
  const detailModel = models.find((m) => m.modelId === detailModelId) ?? null;

  const selOf = (modelId: string, romram: string): ProductSelection => ({
    modelId,
    romram,
    skuIds: [lowestPriceColorSku(modelId, romram) ?? ''],
  });

  /** 跳看板只看该产品：我司 = 该产品（全部或单配置）；竞品 = 竞品视角单配置 */
  const openTrend = (model: OverviewModel, row?: OverviewRow): void => {
    if (model.isOwn) {
      const own = row ? [selOf(model.modelId, row.romram)] : model.rows.map((r) => selOf(model.modelId, r.romram));
      actions.set({ subjectMode: 'product', own });
    } else {
      const rep = row ?? model.rows[0];
      actions.set({
        own: [],
        competitors: rep ? [{ modelId: model.modelId, romram: rep.romram, skuIds: [rep.skuId] }] : [],
        autoMatch: false,
      });
    }
    go('dashboard');
  };

  /** 对比浮窗「查看价格走势」：内容右收动画 → 跳看板并展开保持显示的时点摘要 */
  const collapseAndGo = (): void => {
    const model = detailModel;
    if (!model) return;
    setCollapsing(true);
    window.setTimeout(() => {
      const comps = model.comps ?? [];
      const compSels: ProductSelection[] = [];
      const seenComp = new Set<string>();
      for (const c of comps) {
        const key = `${c.skuId.split('__')[0]}|${c.romram}`;
        if (seenComp.has(key)) continue;
        seenComp.add(key);
        compSels.push({ modelId: c.skuId.split('__')[0], romram: c.romram, skuIds: [c.skuId] });
      }
      actions.set({
        subjectMode: 'product',
        own: model.rows.map((r) => selOf(model.modelId, r.romram)),
        competitors: compSels,
        autoMatch: false,
      });
      navBus.dashboardPointPanel = true;
      go('dashboard');
      setDetailModelId(null);
      setCollapsing(false);
    }, 340);
  };

  // —— 在售产品表：列 = 型号从小到大；列数 = 全场最多配置数 ——
  const tableProducts = useMemo(
    () => ownItems.map(({ model, price }) => ({
      model,
      price,
      rows: [...model.rows].sort((a, b) => romramSizeKey(a.romram) - romramSizeKey(b.romram)),
    })),
    [ownItems],
  );
  const maxConfigCols = Math.max(1, ...tableProducts.map((p) => p.rows.length));
  const tableTemplate = `minmax(240px, 1.15fr) repeat(${maxConfigCols}, minmax(168px, 1fr))`;
  const tableWidth = 240 + maxConfigCols * 176;

  return (
    <section aria-label="市场摆位概要" style={{ marginTop: space.md, padding: space.md, border: `1px solid ${color.hairline}`, borderRadius: radius.card, background: color.canvas }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 18, lineHeight: '24px', color: color.ink }}>
          {industryLabel} · 市场摆位
          {latestDate && <span style={{ fontWeight: 400 }}>（{latestDate}）</span>}
        </h2>
        {/* 操作提示收进警示图标（用户反馈：两行常驻文案太吵） */}
        <Tooltip title={<span>拖动品牌列头可调整列顺序（自动记住）<br />每屏最多 {MAX_VISIBLE_BRAND_COLUMNS + 1} 个品牌列，更多品牌可横向滚动<br />卡片左上角图标 = 跳看板只看该产品走势</span>}>
          <ExclamationCircleFilled style={{ color: '#faad14', fontSize: 14, cursor: 'help', transform: 'translateY(-1px)' }} />
        </Tooltip>
        <span style={{ flex: 1 }} />
        {/* 视角切换（用户定版）：圆角分段控件，与币种切换同语言 */}
        <Segmented
          value={mode}
          onChange={(v) => setMode(v as MapMode)}
          options={[
            { label: '在售产品', value: 'table' },
            { label: '竞品对比', value: 'market' },
          ]}
        />
        <span style={{ flex: 1 }} />
        <span className="tnum" style={{ fontSize: 12, color: color.body }}>我司产品 <strong style={{ color: color.ink, fontSize: 16 }}>{ownCount}</strong></span>
        <span style={{ color: color.hairlineStrong }}>·</span>
        <span className="tnum" style={{ fontSize: 12, color: color.body }}>市场竞品 <strong style={{ color: color.ink, fontSize: 16 }}>{compCount}</strong></span>
      </div>

      <div style={{ marginTop: 10, overflowX: 'auto', border: `1px solid ${color.hairline}`, borderRadius: radius.control, background: color.canvasSoft }}>
        <div key={mode} className="lpl-mode-fade" style={{ position: 'relative', minWidth: mode === 'table' ? tableWidth : undefined, height: totalHeight, background: color.canvas }}>
          {/* 左侧价位轴：美元显示档位带，本币只显示刻度 */}
          <div style={{ position: 'sticky', zIndex: 8, left: 0, width: axisWidth, height: totalHeight, boxSizing: 'border-box', background: color.canvas }}>
            {tierBoxes.map((box, index) => (
              <div
                key={`${box.label}-${index}`}
                title={`价格档位 ${tierLabelShort(box.label)}（USD）`}
                style={{ position: 'absolute', left: 0, top: box.top, width: usd ? 84 : 44, height: box.h, boxSizing: 'border-box', border: box.empty ? `1px dashed ${color.hairline}` : `1px solid ${color.hairline}`, background: box.empty ? 'transparent' : index % 2 === 0 ? color.canvasSoft2 : color.canvasSoft, display: 'flex', alignItems: 'center', overflow: 'hidden', pointerEvents: 'none' }}
              >
                {usd && (
                  <span style={{ width: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, lineHeight: '13px', color: box.empty ? color.mute : color.body, whiteSpace: 'nowrap' }}>
                    {(() => {
                      const parts = tierLabelShort(box.label).split('~');
                      const lines = parts.length === 2 ? [parts[0], '~', parts[1]] : [tierLabelShort(box.label)];
                      return lines.map((ln, k) => <span key={`${ln}-${k}`}>{ln}</span>);
                    })()}
                  </span>
                )}
              </div>
            ))}
            {axisMarks.map((mark, index) => (
              <span key={`tick-${index}`} className="tnum" style={{ position: 'absolute', right: 6, top: mark.y - 9, width: 44, paddingRight: 3, boxSizing: 'border-box', textAlign: 'right', fontSize: 10, lineHeight: '18px', color: color.mute, whiteSpace: 'nowrap', zIndex: 1 }}>{mark.label}</span>
            ))}
            {axisMarks.map((mark, index) => (
              <span key={`dash-${index}`} style={{ position: 'absolute', right: 0, top: mark.y, width: 6, height: 1, background: color.hairlineStrong, pointerEvents: 'none', zIndex: 1 }} />
            ))}
          </div>

          {mode === 'table' ? (
            /* —— 在售产品：零间距表格（一行一产品，列 = 型号从小到大） —— */
            <div style={{ position: 'absolute', left: axisWidth, right: 0, top: 0, height: totalHeight, overflow: 'visible' }}>
              {tableProducts.map(({ model, price, rows }) => {
                const top = rowTops.get(model.modelId) ?? 0;
                const prices = rows.map((r) => r.price).filter((v): v is number => v != null);
                const rrps = rows.map((r) => r.rrp).filter((v): v is number => v != null);
                const dateText = price.asOf ? bucketLatestWeekLabel('week', price.asOf) ?? '' : '';
                const rangeText = (vals: number[]): string =>
                  vals.length === 0 ? '—' : vals.length === 1 ? fmtPrice(vals[0], currency) : `${fmtPrice(Math.min(...vals), currency)} – ${fmtPrice(Math.max(...vals), currency)}`;
                return (
                  <div key={model.modelId} style={{ position: 'absolute', left: 0, top, width: tableWidth - axisWidth, height: ROW_H, display: 'grid', gridTemplateColumns: tableTemplate, background: color.canvas }}>
                    <div style={{ position: 'sticky', zIndex: 5, left: axisWidth, height: '100%', padding: '7px 12px 7px 14px', boxSizing: 'border-box', background: '#f3f8ff', borderRight: `1px solid ${color.hairline}` }}>
                      <div style={{ position: 'relative' }}>
                        <TrendDot title={`只看 ${model.modelName} 的价格走势`} onClick={() => openTrend(model)} />
                        <div style={{ fontSize: 12.5, fontWeight: 650, color: brandColorOf(model.brand), paddingLeft: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{modelOnly(model.brand, model.modelName)}</div>
                      </div>
                      <div className="tnum" style={{ marginTop: 3, fontSize: 10.5, lineHeight: '14px', color: color.mute, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        RRP {rangeText(rrps)}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 1 }}>
                        <span className="tnum" style={{ fontSize: 11.5, fontWeight: 700, color: color.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>折后 {rangeText(prices)}</span>
                        <span className="tnum" style={{ marginLeft: 'auto', fontSize: 9.5, color: color.mute, flexShrink: 0 }}>{dateText}</span>
                      </div>
                    </div>
                    {Array.from({ length: maxConfigCols }, (_, i) => {
                      const row = rows[i];
                      return (
                        <div key={i} style={{ position: 'relative', height: '100%', padding: '14px 10px 6px 20px', boxSizing: 'border-box', borderRight: i === maxConfigCols - 1 ? 'none' : `1px solid ${color.hairline}` }}>
                          {row && (
                            <>
                              <TrendDot title={`只看 ${model.modelName} ${row.romram} 的价格走势`} onClick={() => openTrend(model, row)} />
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                                <span style={{ fontSize: 11.5, fontWeight: 600, color: color.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.romram}</span>
                                {row.discountPct != null && <DiscountBadge discount={row.discountPct} />}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
                                <span className="tnum" style={{ fontSize: 10, color: color.mute, textDecoration: 'line-through', whiteSpace: 'nowrap' }}>{row.rrp != null ? fmtPrice(row.rrp, currency) : ''}</span>
                                <span className="tnum" style={{ fontSize: 12, fontWeight: 700, color: color.ink, whiteSpace: 'nowrap' }}>{row.price != null ? fmtPrice(row.price, currency) : '—'}</span>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
              {/* 分隔线：每个产品行底部一条，从最左贯穿到最右（行间空隙内，不压卡片） */}
              {tableProducts.map(({ model }) => {
                const top = rowTops.get(model.modelId) ?? 0;
                return (
                  <div
                    key={`divider-${model.modelId}`}
                    style={{ position: 'absolute', left: 0, right: 0, top: top + ROW_H, height: 1, background: color.hairline, zIndex: 6, pointerEvents: 'none' }}
                  />
                );
              })}
            </div>
          ) : (
            /* —— 竞品对比：分段带摆位 + 品牌列 —— */
            <div style={{ position: 'absolute', left: axisWidth, right: 0, top: 0, height: totalHeight, overflow: 'visible' }}>
              <div style={{ position: 'absolute', zIndex: 4, top: 0, left: 0, right: 0, height: plotTop, boxSizing: 'border-box', display: 'grid', gridTemplateColumns: `minmax(250px, 1.05fr) repeat(${Math.max(brandColumns.length, 1)}, minmax(180px, 1fr))`, alignItems: 'center', borderBottom: `1px solid ${color.hairline}`, background: color.canvas, overflow: 'visible' }}>
                <div style={{ position: 'sticky', zIndex: 6, left: axisWidth, boxSizing: 'border-box', padding: '0 14px', color: color.ink, fontSize: 13, lineHeight: '18px', fontWeight: 600, borderRight: `1px solid ${color.hairline}`, height: '100%', display: 'flex', alignItems: 'center', background: '#f3f8ff', boxShadow: '2px 0 3px rgba(0,0,0,.03)' }}>{ownBrands.map((b) => brandHeaderLabel(b)).join(' / ') || '产品'}</div>
                {brandColumns.map((brand, index) => (
                  <div
                    key={brand.key}
                    draggable
                    title="拖动调整品牌列顺序"
                    onDragStart={(e: ReactDragEvent<HTMLDivElement>) => {
                      setDraggingBrand(brand.key);
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', brand.key);
                    }}
                    onDragOver={(e: ReactDragEvent<HTMLDivElement>) => {
                      if (!draggingBrand || draggingBrand === brand.key) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      setDropBrand(brand.key);
                    }}
                    onDragLeave={() => setDropBrand((t) => (t === brand.key ? null : t))}
                    onDrop={(e: ReactDragEvent<HTMLDivElement>) => {
                      e.preventDefault();
                      if (draggingBrand) moveBrandTo(draggingBrand, brand.key);
                      setDraggingBrand(null);
                      setDropBrand(null);
                    }}
                    onDragEnd={() => {
                      setDraggingBrand(null);
                      setDropBrand(null);
                    }}
                    style={{ boxSizing: 'border-box', padding: '0 12px', color: brandColorOf(brand.key), fontSize: 13, lineHeight: '18px', fontWeight: 700, borderRight: index === brandColumns.length - 1 ? 0 : `1px solid ${color.hairline}`, height: '100%', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', cursor: 'grab', opacity: draggingBrand === brand.key ? 0.4 : undefined, background: dropBrand === brand.key && draggingBrand !== brand.key ? '#edf5ff' : undefined, boxShadow: dropBrand === brand.key && draggingBrand !== brand.key ? 'inset 0 0 0 2px rgba(0, 112, 243, 0.35)' : undefined }}
                  >
                    <HolderOutlined style={{ fontSize: 11, color: draggingBrand === brand.key ? color.link : color.mute }} />
                    {brand.label}
                  </div>
                ))}
              </div>
              {axisMarks.map((mark, index) => (
                <div key={`line-${index}`} style={{ position: 'absolute', left: 0, right: 0, top: mark.y, borderTop: `1px solid ${color.hairline}`, pointerEvents: 'none' }} />
              ))}
              {market.map(({ model, price }) => {
                const isOwn = model.isOwn;
                const dimmed = litKeys != null && !litKeys.has(model.modelId);
                const compIndex = brandColumns.findIndex((b) => b.key === brandKeyOf(model.brand));
                return (
                  <div key={model.modelId} style={{ position: 'absolute', left: 0, right: 0, top: rowTops.get(model.modelId) ?? 0, height: rowHeights.get(model.modelId) ?? CARD_H, display: 'grid', gridTemplateColumns: `minmax(250px, 1.05fr) repeat(${Math.max(brandColumns.length, 1)}, minmax(180px, 1fr))`, alignItems: 'center', zIndex: 1 }}>
                    <div style={{ position: 'sticky', zIndex: 5, left: axisWidth, display: 'flex', alignItems: 'flex-start', minWidth: 0, height: '100%', padding: '0 10px 0 14px', borderRight: `1px solid ${color.hairline}`, background: '#f3f8ff' }}>
                      {isOwn && (
                        <OwnChip
                          model={model}
                          price={price}
                          currency={currency}
                          dimmed={false}
                          hovered={hoverOwnId === model.modelId}
                          onHover={setHoverOwnId}
                          onOpenTrend={() => openTrend(model)}
                          onOpenDetail={() => setDetailModelId(model.modelId)}
                        />
                      )}
                    </div>
                    {brandColumns.map((brand, index) => {
                      const here = brandKeyOf(model.brand) === brand.key && !isOwn;
                      return (
                        <div key={brand.key} style={{ minWidth: 0, height: '100%', display: 'flex', alignItems: 'flex-start', padding: '0 10px', borderRight: index === brandColumns.length - 1 ? 0 : `1px solid ${color.hairline}` }}>
                          {here && compIndex >= 0 && (
                            <CompChip model={model} price={price} currency={currency} dimmed={dimmed} onOpenTrend={() => openTrend(model)} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 对比浮窗：左 = 我司 vs 竞品型号矩阵；右 = 通栏「查看价格走势」 */}
      <Modal
        open={detailModel != null}
        onCancel={() => {
          if (!collapsing) setDetailModelId(null);
        }}
        footer={null}
        centered
        width={940}
        styles={{ content: { padding: 0, borderRadius: 12, overflow: 'hidden' } }}
        title={null}
      >
        {detailModel && (
          <div style={{ display: 'flex', alignItems: 'stretch', height: 520 }}>
            <div
              style={{
                flex: 1,
                minWidth: 0,
                padding: '16px 18px',
                overflowY: 'auto',
                transform: collapsing ? 'translateX(80px)' : 'translateX(0)',
                opacity: collapsing ? 0 : 1,
                transition: 'transform 320ms cubic-bezier(0.4, 0, 0.2, 1), opacity 320ms ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <BrandDot brand={detailModel.brand} size={8} />
                <span style={{ fontSize: 16, fontWeight: 700, color: color.ink }}>{detailModel.modelName}</span>
                <span style={{ fontSize: 11, color: color.mute }}>各型号 vs 对标竞品 · 型号从小到大</span>
              </div>
              <CompareGroup brand={detailModel.brand} name={modelOnly(detailModel.brand, detailModel.modelName)} own rows={detailModel.rows} currency={currency} />
              {(detailModel.comps ?? []).map((c) => (
                <CompareGroup
                  key={c.skuId}
                  brand={c.brand}
                  name={`${c.modelName} ${c.romram}`}
                  own={false}
                  rows={[
                    {
                      skuId: c.skuId,
                      brand: c.brand,
                      modelName: c.modelName,
                      romram: c.romram,
                      isOwn: false,
                      lineColor: c.lineColor,
                      price: c.price,
                      rrp: c.rrp,
                      discountPct: c.price != null && c.rrp != null && c.rrp > 0 ? c.price / c.rrp - 1 : null,
                      asOfWeek: '',
                      colors: c.colors,
                      points: c.points,
                      maxV: c.maxV,
                      maxIdx: c.maxIdx,
                      minV: c.minV,
                      minIdx: c.minIdx,
                    },
                  ]}
                  currency={currency}
                />
              ))}
            </div>
            <div
              role="button"
              aria-label="查看价格走势"
              title="跳转价格看板并展开时点摘要"
              onClick={collapseAndGo}
              style={{
                width: 190,
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                background: 'linear-gradient(180deg, #f0f6ff 0%, #e3efff 100%)',
                borderLeft: `1px solid ${color.hairline}`,
                cursor: 'pointer',
                transform: collapsing ? 'translateX(0) scale(1.02)' : 'translateX(0)',
                transition: 'background 320ms ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'linear-gradient(180deg, #e3efff 0%, #d5e7ff 100%)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'linear-gradient(180deg, #f0f6ff 0%, #e3efff 100%)')}
            >
              <LineChartOutlined style={{ fontSize: 26, color: selectSoftInk }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: selectSoftInk, writingMode: 'vertical-rl', letterSpacing: 4 }}>查看价格走势</span>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}
