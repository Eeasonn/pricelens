import { useMemo, useState } from 'react';
import type { CurrencyMode } from '../../dataModel/types';
import type { OverviewModel } from '../../dataModel/aggregate';
import { bucketLatestWeekLabel } from '../../chart/PriceTrend/helpers';
import BrandDot, { brandLabelOf } from '../../components/BrandMark';
import { brandColorOf, color, font, radius, space } from '../../theme/tokens';

export interface MarketMapProps {
  /** 全市场型号（我司+竞品矩阵全量）：摆位只看真实现价，不依赖竞品匹配关系（第七十七轮）。 */
  models: OverviewModel[];
  currency: CurrencyMode;
  asOf: string;
  /** 点击我司产品，展开并滚到底下同一产品的明细；竞品仅为市场摆位参考，不可点。 */
  onOpenProduct: (model: OverviewModel) => void;
  selectedModelId?: string | null;
}

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
  // 现价 = 最新采集周里价最高的配置（rows 本身现价降序，取首个落在最新周的代表行）
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

const DEFAULT_BRAND_ORDER = ['APPLE', 'SAMSUNG', 'HONOR', 'XIAOMI'];
// 1280px 设计基线：USD 轴 140px + 我司列 250px 后，4 个 180px 品牌列可完整显示；更多列横向滚动。
const MAX_VISIBLE_BRAND_COLUMNS = 4;
type BrandOrder = 'default' | 'coverage' | 'alpha';

function brandKeyOf(brand: string): string {
  return brand.trim().toUpperCase();
}

function brandHeaderLabel(brand: string): string {
  if (brand === 'APPLE' || brand === 'XIAOMI') return brand;
  return brandLabelOf(brand);
}

/** 产品小卡（第八十三轮）：明显的独立卡片（白底描边圆角+轻投影）；左侧品牌点+
 *  型号名，右侧现价（单值），上方灰色小字为价格采集日期（MM-DD，最新采集周锚日）。 */
function ModelChip({ model, price, currency, clickable, onClick }: {
  model: OverviewModel;
  price: { min: number | null; max: number | null; current: number | null; asOf: string };
  currency: CurrencyMode;
  clickable: boolean;
  onClick?: () => void;
}) {
  const label = modelOnly(model.brand, model.modelName);
  const dateText = price.asOf ? bucketLatestWeekLabel('week', price.asOf) ?? '' : '';
  const priceText = price.current != null ? fmtPrice(price.current, currency) : '—';
  const rangeText = price.min != null && price.max != null && price.min !== price.max
    ? ` · 区间 ${fmtPrice(price.min, currency)}–${fmtPrice(price.max, currency)}`
    : '';
  const title = `${model.modelName} · 现价 ${priceText}${dateText ? `（${dateText} 采集）` : ''}${rangeText}`;
  const inner = (
    <>
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
    </>
  );
  const style = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
    maxWidth: '100%',
    width: '100%',
    padding: '4px 9px',
    background: color.canvas,
    border: `1px solid ${color.hairline}`,
    borderRadius: radius.control,
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
    textAlign: 'left' as const,
    font: 'inherit',
    cursor: clickable ? 'pointer' : 'default',
  };
  if (!clickable) return <span title={title} className="lpl-map-card" style={style}>{inner}</span>;
  return (
    <button type="button" title={`${title} · 点击展开该产品的明细`} onClick={onClick} className="lpl-map-card" style={style}>
      {inner}
    </button>
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

/**
 * 市场摆位概要（第七十七轮定版；第八十一轮小卡与价位轴迭代）：
 * 复用连续价位轴，全市场每个品牌的在售型号按真实现价纵向摆位（我司列 sticky 最左），
 * 不依赖竞品匹配关系。第八十一轮：价位轴域裁到数据范围 ±4%（消顶部/底部大段空档）、
 * 刻度与档位带按同一映射就地生成；产品小卡带现价与采集周。
 */
export default function MarketMap({ models, currency, asOf, onOpenProduct, selectedModelId }: MarketMapProps) {
  const market = useMemo(
    () => models
      .map((model) => ({ model, price: modelPrice(model) }))
      .sort((a, b) => (b.price.mid ?? -1) - (a.price.mid ?? -1) || a.model.modelName.localeCompare(b.model.modelName)),
    [models],
  );
  const ownModels = useMemo(() => models.filter((m) => m.isOwn), [models]);
  const ownCount = ownModels.length;
  const compCount = models.length - ownCount;
  const allValues = market.flatMap(({ model }) => model.rows.map((row) => row.price)).filter((value): value is number => value != null);
  // 价位轴（第八十一轮）：域 = 数据范围 ±4%，不再从 0 拉到整档——顶部不再有空档。
  const vMax = allValues.length ? Math.max(...allValues) : 3000;
  const vMin = allValues.length ? Math.min(...allValues) : 0;
  const vSpan = Math.max(1, vMax - vMin);
  const axisTop = vMax + vSpan * 0.02;
  const axisBottom = Math.max(0, vMin - vSpan * 0.02);
  const plotTop = 34;
  const plotHeight = Math.max(market.length * 26, 320);
  const vToY = (value: number): number => plotTop + ((axisTop - value) / (axisTop - axisBottom)) * plotHeight;
  const fmtTick = (value: number): string => {
    const trim = (n: number): string => String(+(n.toFixed(1)));
    if (value >= 1e6) return `${trim(value / 1e6)}M`;
    if (value >= 1000) return `${trim(value / 1000)}K`;
    return String(Math.round(value));
  };
  const tickStep = (() => {
    const raw = (axisTop - axisBottom) / 5;
    const pow = 10 ** Math.floor(Math.log10(Math.max(1e-9, raw)));
    for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * pow) return m * pow;
    return 10 * pow;
  })();
  const ticks: number[] = [];
  for (let i = Math.ceil(axisBottom / tickStep); i <= Math.floor(axisTop / tickStep); i++) ticks.push(i * tickStep);
  const tierHasValue = (lo: number, hi: number): boolean => allValues.some((v) => v >= lo && v < hi);
  const tierBoxes = (currency === 'usd'
    ? MARKET_TIERS
      .map(([lo, hi, label]) => {
        const lo2 = Math.max(lo, axisBottom);
        const hi2 = Math.min(hi, axisTop);
        if (lo2 >= hi2) return null;
        const top = vToY(hi2);
        return { label, top, h: vToY(lo2) - top, empty: !tierHasValue(lo, hi) };
      })
      .filter((b): b is { label: string; top: number; h: number; empty: boolean } => b != null && b.h >= 8)
    : []);
  const axisWidth = currency === 'usd' ? 104 : 78;
  const [brandOrder, setBrandOrder] = useState<BrandOrder>('default');
  // 我司品牌固定占最左 sticky 列（主视角原则）；其余品牌按所选顺序排。
  const ownBrands = useMemo(() => [...new Set(ownModels.map((m) => brandKeyOf(m.brand)))], [ownModels]);
  const compBrands = useMemo(
    () => [...new Set(models.filter((m) => !m.isOwn).map((m) => brandKeyOf(m.brand)))],
    [models],
  );
  const brandColumns = useMemo(() => {
    const rank = (brand: string): number => {
      const index = DEFAULT_BRAND_ORDER.indexOf(brand);
      return index >= 0 ? index : DEFAULT_BRAND_ORDER.length;
    };
    const countOf = (brand: string): number => models.filter((m) => brandKeyOf(m.brand) === brand).length;
    return [...compBrands]
      .sort((a, b) => {
        if (brandOrder === 'alpha') return brandHeaderLabel(a).localeCompare(brandHeaderLabel(b), 'en');
        if (brandOrder === 'coverage') return countOf(b) - countOf(a) || rank(a) - rank(b) || a.localeCompare(b);
        return rank(a) - rank(b) || brandHeaderLabel(a).localeCompare(brandHeaderLabel(b), 'en');
      })
      .map((key) => ({ key, label: brandHeaderLabel(key) }));
  }, [brandOrder, compBrands, models]);
  const columnTemplate = `minmax(250px, 1.05fr) repeat(${Math.max(brandColumns.length, 1)}, minmax(180px, 1fr))`;
  const minMapWidth = axisWidth + 250 + Math.max(brandColumns.length, 1) * 180;
  // 价格接近的产品仍需保持“一产品一行”。先按真实 Y 位置排布，再做最小行距碰撞处理。
  const CARD_H = 34; // 产品小卡：单行（名称左 + 采集日期/现价右）
  const rowTops = new Map<string, number>();
  let lastBottom = plotTop + 2;
  for (const item of market) {
    const rawTop = vToY(item.price.mid ?? item.price.min ?? axisBottom) - CARD_H / 2;
    const top = Math.max(rawTop, lastBottom + 2);
    rowTops.set(item.model.modelId, top);
    lastBottom = top + CARD_H;
  }
  // 产品行只允许向下避让；如果密集产品超过价格轴高度，就增长画布，不能把第一行上移遮住表头。
  const totalHeight = Math.max(plotTop + plotHeight + 12, lastBottom + 12);

  return (
    <section aria-label="市场摆位概要" style={{ marginTop: space.md, padding: space.md, border: `1px solid ${color.hairline}`, borderRadius: radius.card, background: color.canvas }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 18, lineHeight: '24px', color: color.ink }}>市场摆位概要</h2>
        <span style={{ fontSize: 11, color: color.mute }}>数据截至 {asOf} · 当前价</span>
        <span style={{ flex: 1 }} />
        <span className="tnum" style={{ fontSize: 12, color: color.body }}>我司产品 <strong style={{ color: color.ink, fontSize: 16 }}>{ownCount}</strong></span>
        <span style={{ color: color.hairlineStrong }}>·</span>
        <span className="tnum" style={{ fontSize: 12, color: color.body }}>市场竞品 <strong style={{ color: color.ink, fontSize: 16 }}>{compCount}</strong></span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        <span style={{ color: color.mute, fontSize: 11 }}>品牌列顺序</span>
        {([
          ['default', '默认顺序'],
          ['coverage', '产品数量'],
          ['alpha', '字母顺序'],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={brandOrder === value}
            onClick={() => setBrandOrder(value)}
            style={{ minHeight: 24, padding: '2px 9px', border: `1px solid ${brandOrder === value ? color.link : color.hairline}`, borderRadius: radius.pill, background: brandOrder === value ? '#edf5ff' : color.canvas, color: brandOrder === value ? color.link : color.body, font: 'inherit', fontSize: 10.5, fontWeight: brandOrder === value ? 700 : 500, cursor: 'pointer' }}
          >
            {label}
          </button>
        ))}
        <span style={{ color: color.mute, fontSize: 10.5 }}>每屏最多 {MAX_VISIBLE_BRAND_COLUMNS + 1} 个品牌列，更多品牌可横向滚动</span>
      </div>

      <div style={{ marginTop: 10, overflowX: 'auto', border: `1px solid ${color.hairline}`, borderRadius: radius.control, background: color.canvasSoft }}>
        <div style={{ position: 'relative', minWidth: minMapWidth, height: totalHeight, background: color.canvas }}>
          {/* 左侧价位轴：美元显示档位带，本币只显示刻度；域随数据裁剪 */}
          <div style={{ position: 'sticky', zIndex: 8, left: 0, width: axisWidth, height: totalHeight, boxSizing: 'border-box', borderRight: `1px solid ${color.hairlineStrong}`, background: color.canvas, boxShadow: '2px 0 3px rgba(0,0,0,.04)' }}>
            {tierBoxes.map((box, index) => <div key={`${box.label}-${index}`} style={{ position: 'absolute', left: 0, top: box.top, width: 64, height: box.h, boxSizing: 'border-box', border: box.empty ? `1px dashed ${color.hairline}` : `1px solid ${color.hairline}`, background: box.empty ? 'transparent' : index % 2 === 0 ? color.canvasSoft2 : color.canvasSoft, display: 'grid', placeItems: 'center', overflow: 'hidden', pointerEvents: 'none' }}>{box.h >= 16 && <span style={{ fontSize: 10, lineHeight: '12px', color: box.empty ? color.mute : color.body, whiteSpace: 'nowrap' }}>{box.label}</span>}</div>)}
            {ticks.map((tick) => <span key={tick} className="tnum" style={{ position: 'absolute', left: currency === 'usd' ? 66 : 4, top: vToY(tick) - 7, fontSize: 9, lineHeight: '14px', fontFamily: font.family, fontVariantNumeric: 'tabular-nums', color: color.mute, whiteSpace: 'nowrap' }}>{fmtTick(tick)}</span>)}
          </div>

          <div style={{ position: 'absolute', left: axisWidth, right: 0, top: 0, height: totalHeight, overflow: 'visible' }}>
            <div style={{ position: 'absolute', zIndex: 4, top: 0, left: 0, right: 0, height: plotTop, boxSizing: 'border-box', display: 'grid', gridTemplateColumns: columnTemplate, alignItems: 'center', borderBottom: `1px solid ${color.hairline}`, background: color.canvas, overflow: 'visible' }}>
              <div style={{ position: 'sticky', zIndex: 6, left: axisWidth, boxSizing: 'border-box', padding: '0 14px', color: color.mute, fontSize: 11, lineHeight: '16px', borderRight: `1px solid ${color.hairline}`, height: '100%', display: 'flex', alignItems: 'center', background: color.canvas, boxShadow: '2px 0 3px rgba(0,0,0,.03)' }}>{ownBrands.map((b) => brandHeaderLabel(b)).join(' / ') || '产品'}</div>
              {brandColumns.map((brand, index) => <div key={brand.key} style={{ boxSizing: 'border-box', padding: '0 12px', color: brandColorOf(brand.key), fontSize: 11, lineHeight: '16px', fontWeight: 700, borderRight: index === brandColumns.length - 1 ? 0 : `1px solid ${color.hairline}`, height: '100%', display: 'flex', alignItems: 'center', whiteSpace: 'nowrap' }}>{brand.label}</div>)}
            </div>
            {ticks.map((tick) => <div key={`line-${tick}`} style={{ position: 'absolute', left: 0, right: 0, top: vToY(tick), borderTop: `1px solid ${color.hairline}`, pointerEvents: 'none' }} />)}
            {market.map(({ model, price }) => {
              const selected = selectedModelId === model.modelId;
              const isOwn = model.isOwn;
              return (
                <div key={model.modelId} style={{ position: 'absolute', left: 0, right: 0, top: rowTops.get(model.modelId) ?? 0, minHeight: CARD_H, display: 'grid', gridTemplateColumns: columnTemplate, alignItems: 'center', zIndex: 1 }}>
                  <div style={{ position: 'sticky', zIndex: 5, left: axisWidth, display: 'flex', alignItems: 'center', minWidth: 0, height: '100%', padding: '3px 10px 3px 14px', borderRight: `1px solid ${color.hairline}`, background: selected ? '#f0f6ff' : color.canvas, boxShadow: selected ? 'inset 3px 0 0 #0070f3, 2px 0 3px rgba(0,0,0,.03)' : '2px 0 3px rgba(0,0,0,.03)' }}>
                    {isOwn && <ModelChip model={model} price={price} currency={currency} clickable onClick={() => onOpenProduct(model)} />}
                  </div>
                  {brandColumns.map((brand, index) => {
                    const here = brandKeyOf(model.brand) === brand.key && !isOwn;
                    return (
                      <div key={brand.key} style={{ minWidth: 0, height: '100%', display: 'flex', alignItems: 'center', padding: '3px 10px', borderRight: index === brandColumns.length - 1 ? 0 : `1px solid ${color.hairline}`, background: selected ? '#f7faff' : color.canvas }}>
                        {here && <ModelChip model={model} price={price} currency={currency} clickable={false} />}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
