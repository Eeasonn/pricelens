import { useMemo, useState } from 'react';
import type { CurrencyMode } from '../../dataModel/types';
import type { OverviewModel } from '../../dataModel/aggregate';
import { computeYAxis, perUsdOf, yPxOf, type Geom, type YScale } from '../../chart/PriceTrend/helpers';
import { buildTickRows, buildTierBoxes } from '../../chart/PriceTrend/chartModel';
import BrandDot, { brandLabelOf } from '../../components/BrandMark';
import { brandColorOf, color, radius, space } from '../../theme/tokens';

export interface MarketMapProps {
  /** 全市场型号（我司+竞品矩阵全量）：摆位只看真实现价，不依赖竞品匹配关系（第七十七轮）。 */
  models: OverviewModel[];
  currency: CurrencyMode;
  asOf: string;
  /** 点击我司产品，展开并滚到底下同一产品的明细；竞品仅为市场摆位参考，不可点。 */
  onOpenProduct: (model: OverviewModel) => void;
  selectedModelId?: string | null;
}

function modelPrice(model: OverviewModel): { min: number | null; max: number | null; mid: number | null } {
  const values = model.rows.map((row) => row.price).filter((value): value is number => value != null);
  if (values.length === 0) return { min: null, max: null, mid: null };
  const min = Math.min(...values);
  const max = Math.max(...values);
  return { min, max, mid: (min + max) / 2 };
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

type PlotSeries = {
  key: string;
  isOwn: boolean;
  brand: string;
  label: string;
  skuIds: string[];
  color: string;
  points: { bucketId: string; xLabel: string; anchorDate: string; rrp: number | null; price: number | null; missing: boolean; offer: null; url: string; shopName: string | null }[];
};

function scaleForValues(values: number[], currency: CurrencyMode, rowCount: number): YScale {
  const points = values.map((value, index) => ({ bucketId: `current-${index}`, xLabel: '', anchorDate: '', rrp: null, price: value, missing: false, offer: null, url: '', shopName: null }));
  const series: PlotSeries[] = [{ key: 'market-map', isOwn: true, brand: '', label: '', skuIds: [], color: color.ink, points }];
  const base = computeYAxis({ series, priceTypes: { discounted: true, rrp: false }, sliderScale: 1, allowBreak: false, perUsd: perUsdOf(currency) });
  // 概要图以“每个产品一行”为主，压缩价格看板的默认格距，避免少量产品撑出长段空白。
  const targetScale = Math.max(0.75, Math.min(2, (rowCount * 38) / Math.max(1, base.plotHeight)));
  return computeYAxis({ series, priceTypes: { discounted: true, rrp: false }, sliderScale: targetScale, allowBreak: false, perUsd: perUsdOf(currency) });
}

/** 单个产品chip：品牌色点+型号名，title 带真实现价。我司可点，竞品纯摆位。 */
function ModelChip({ model, mid, currency, clickable, onClick }: {
  model: OverviewModel;
  mid: number | null;
  currency: CurrencyMode;
  clickable: boolean;
  onClick?: () => void;
}) {
  const label = modelOnly(model.brand, model.modelName);
  const title = mid != null ? `${model.modelName} · 现价 ${fmtPrice(mid, currency)}` : model.modelName;
  const inner = (
    <>
      <BrandDot brand={model.brand} size={6} />
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
    </>
  );
  const style = {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
    maxWidth: '100%',
    padding: 0,
    border: 0,
    background: 'transparent',
    textAlign: 'left' as const,
    font: 'inherit',
    color: brandColorOf(model.brand),
    fontSize: 11.5,
    fontWeight: 600,
    cursor: clickable ? 'pointer' : 'default',
  };
  if (!clickable) return <span title={title} style={style}>{inner}</span>;
  return (
    <button type="button" title={`${title} · 点击展开该产品的明细`} onClick={onClick} style={style}>
      {inner}
    </button>
  );
}

/**
 * 市场摆位概要（第七十七轮定版）：复用价格看板的连续 Y 轴和刻度，全市场每个品牌
 * 的所有在售型号按真实现价纵向摆位（我司列固定最左、sticky），不依赖竞品匹配关系。
 * 这里只回答「各品牌在售产品有哪些、各摆在哪一段价位」；折扣/RRP/价差/预警留在明细表。
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
  const scale = scaleForValues(allValues, currency, market.length);
  const plotTop = 40;
  const geom: Geom = { gridLeft: 0, plotLeft: 0, plotTop, plotWidth: 1, plotHeight: scale.plotHeight, scale, n: 1 };
  const ticks = buildTickRows(geom);
  const tierBoxes = buildTierBoxes({ enabled: currency === 'usd', geom, tierValues: allValues });
  const axisWidth = currency === 'usd' ? 140 : 78;
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
  // 价格接近的产品仍需保持“一产品一行”。先按真实 Y 位置排布，再做最小行距碰撞处理；
  // 刻度和网格线保持真实价格位置，产品文字只在必要时做小幅上下让位。
  const rowTops = new Map<string, number>();
  let lastBottom = plotTop + 4;
  for (const item of market) {
    const rawTop = yPxOf(geom, item.price.mid ?? item.price.min ?? 0) - 18;
    const top = Math.max(rawTop, lastBottom + 4);
    rowTops.set(item.model.modelId, top);
    lastBottom = top + 36;
  }
  // 产品行只允许向下避让；如果密集产品超过价格轴高度，就增长画布，不能把第一行上移遮住表头。
  const totalHeight = Math.max(plotTop + scale.plotHeight + 12, lastBottom + 12);

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
          {/* 与价格看板同口径的左侧 Y 轴：美元显示档位带，本币只显示刻度。 */}
          <div style={{ position: 'sticky', zIndex: 8, left: 0, width: axisWidth, height: totalHeight, boxSizing: 'border-box', borderRight: `1px solid ${color.hairlineStrong}`, background: color.canvas, boxShadow: '2px 0 3px rgba(0,0,0,.04)' }}>
            {tierBoxes.map((box, index) => <div key={`${box.label}-${index}`} style={{ position: 'absolute', left: 0, top: box.top, width: 64, height: box.h, boxSizing: 'border-box', border: box.empty ? `1px dashed ${color.hairline}` : `1px solid ${color.hairline}`, background: box.empty ? 'transparent' : index % 2 === 0 ? color.canvasSoft2 : color.canvasSoft, display: 'grid', placeItems: 'center', overflow: 'hidden', pointerEvents: 'none' }}>{box.h >= 16 && <span style={{ fontSize: 10, lineHeight: '12px', color: box.empty ? color.mute : color.body, whiteSpace: 'nowrap' }}>{box.label}</span>}</div>)}
            {ticks.map((tick) => <span key={tick.v} className="tnum" style={{ position: 'absolute', right: 10, top: tick.y - 8, fontSize: 12, lineHeight: '16px', color: color.body, whiteSpace: 'nowrap' }}>{tick.text}</span>)}
          </div>

          <div style={{ position: 'absolute', left: axisWidth, right: 0, top: 0, height: totalHeight, overflow: 'visible' }}>
            <div style={{ position: 'absolute', zIndex: 4, top: 0, left: 0, right: 0, height: plotTop, boxSizing: 'border-box', display: 'grid', gridTemplateColumns: columnTemplate, alignItems: 'center', borderBottom: `1px solid ${color.hairline}`, background: color.canvas, overflow: 'visible' }}>
              <div style={{ position: 'sticky', zIndex: 6, left: axisWidth, boxSizing: 'border-box', padding: '0 14px', color: color.mute, fontSize: 11, lineHeight: '16px', borderRight: `1px solid ${color.hairline}`, height: '100%', display: 'flex', alignItems: 'center', background: color.canvas, boxShadow: '2px 0 3px rgba(0,0,0,.03)' }}>{ownBrands.map((b) => brandHeaderLabel(b)).join(' / ') || '产品'}</div>
              {brandColumns.map((brand, index) => <div key={brand.key} style={{ boxSizing: 'border-box', padding: '0 12px', color: brandColorOf(brand.key), fontSize: 11, lineHeight: '16px', fontWeight: 700, borderRight: index === brandColumns.length - 1 ? 0 : `1px solid ${color.hairline}`, height: '100%', display: 'flex', alignItems: 'center', whiteSpace: 'nowrap' }}>{brand.label}</div>)}
            </div>
            {ticks.map((tick) => <div key={`line-${tick.v}`} style={{ position: 'absolute', left: 0, right: 0, top: tick.y, borderTop: `1px solid ${color.hairline}`, pointerEvents: 'none' }} />)}
            {market.map(({ model, price }) => {
              const selected = selectedModelId === model.modelId;
              const isOwn = model.isOwn;
              return (
                <div key={model.modelId} style={{ position: 'absolute', left: 0, right: 0, top: rowTops.get(model.modelId) ?? 0, minHeight: 36, display: 'grid', gridTemplateColumns: columnTemplate, alignItems: 'center', zIndex: 1 }}>
                  <div style={{ position: 'sticky', zIndex: 5, left: axisWidth, display: 'flex', alignItems: 'center', minWidth: 0, height: '100%', padding: '4px 10px 4px 14px', borderRight: `1px solid ${color.hairline}`, background: selected ? '#f0f6ff' : color.canvas, boxShadow: selected ? 'inset 3px 0 0 #0070f3, 2px 0 3px rgba(0,0,0,.03)' : '2px 0 3px rgba(0,0,0,.03)' }}>
                    {isOwn && <ModelChip model={model} mid={price.mid} currency={currency} clickable onClick={() => onOpenProduct(model)} />}
                  </div>
                  {brandColumns.map((brand, index) => {
                    const here = brandKeyOf(model.brand) === brand.key && !isOwn;
                    return (
                      <div key={brand.key} style={{ minWidth: 0, height: '100%', display: 'flex', alignItems: 'center', padding: '0 10px', borderRight: index === brandColumns.length - 1 ? 0 : `1px solid ${color.hairline}`, background: selected ? '#f7faff' : color.canvas }}>
                        {here && <ModelChip model={model} mid={price.mid} currency={currency} clickable={false} />}
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
