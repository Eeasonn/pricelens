import { useMemo, useState } from 'react';
import type { CurrencyMode } from '../../dataModel/types';
import type { OverviewCompRow, OverviewModel, OverviewTierBand } from '../../dataModel/aggregate';
import { computeYAxis, perUsdOf, yPxOf, type Geom, type YScale } from '../../chart/PriceTrend/helpers';
import { buildTickRows, buildTierBoxes } from '../../chart/PriceTrend/chartModel';
import BrandDot, { brandLabelOf } from '../../components/BrandMark';
import { brandColorOf, color, formatPrice, radius, space } from '../../theme/tokens';
import { canonicalProductName, formatAsOfWeek, groupedVisibleCompetitors, latestAsOfWeek } from './visibleData';

type VisibleBand = {
  band: OverviewTierBand;
  ownModels: OverviewModel[];
};

export interface MarketMapProps {
  bands: readonly VisibleBand[];
  currency: CurrencyMode;
  asOf: string;
  /** 点击产品行，展开并滚到底下同一产品的明细。 */
  onOpenProduct: (model: OverviewModel) => void;
}

function modelPrice(model: OverviewModel): { min: number | null; max: number | null; mid: number | null } {
  const values = model.rows.map((row) => row.price).filter((value): value is number => value != null);
  if (values.length === 0) return { min: null, max: null, mid: null };
  const min = Math.min(...values);
  const max = Math.max(...values);
  return { min, max, mid: (min + max) / 2 };
}





const DEFAULT_BRAND_ORDER = ['APPLE', 'SAMSUNG', 'HONOR', 'XIAOMI'];
// 1280px 设计基线：USD 轴 140px + 产品列 250px 后，4 个 180px 品牌列可完整显示；更多列横向滚动。
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

function CompetitorCell({ rows }: { rows: OverviewCompRow[] | undefined }) {
  if (!rows || rows.length === 0) return <span style={{ color: color.hairlineStrong, fontSize: 11 }}>—</span>;
  const names = [...new Map(rows.map((row) => [canonicalProductName(row), row.brand])).entries()];
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
      {names.map(([name, brand]) => <span key={`${brand}-${name}`} title={name} style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: brandColorOf(brand), fontSize: 11.5, fontWeight: 600 }}><BrandDot brand={brand} size={6} />{name}</span>)}
    </span>
  );
}

/**
 * 市场摆位概要：复用价格看板的连续 Y 轴和刻度，产品纵向排列，竞品横向对齐。
 * 这里只回答“在售产品有哪些、每个产品对应哪些竞品”；折扣/RRP/价差/预警留在明细表。
 */
export default function MarketMap({ bands, currency, asOf, onOpenProduct }: MarketMapProps) {
  const ownModels = bands.flatMap(({ ownModels: models }) => models)
    .map((model) => ({ model, price: modelPrice(model), comps: groupedVisibleCompetitors(model) }))
    .sort((a, b) => (b.price.mid ?? -1) - (a.price.mid ?? -1) || canonicalProductName(a.model).localeCompare(canonicalProductName(b.model)));
  // Competitor columns are relational only. Keep them out of the scale so a
  // benchmark price cannot move the own-product axis without being plotted.
  const allValues = ownModels.flatMap(({ model }) => model.rows.map((row) => row.price))
    .filter((value): value is number => value != null);
  const competitorCount = new Set(ownModels.flatMap(({ comps }) => comps.map((group) => group[0]?.skuId.split('__')[0]).filter((value): value is string => !!value))).size;
  const scale = scaleForValues(allValues, currency, ownModels.length);
  const plotTop = 40;
  const geom: Geom = { gridLeft: 0, plotLeft: 0, plotTop, plotWidth: 1, plotHeight: scale.plotHeight, scale, n: 1 };
  const ticks = buildTickRows(geom);
  const tierBoxes = buildTierBoxes({ enabled: currency === 'usd', geom, tierValues: allValues });
  const axisWidth = currency === 'usd' ? 140 : 78;
  const [brandOrder, setBrandOrder] = useState<BrandOrder>('default');
  const discoveredBrands = useMemo(
    () => [...new Set(ownModels.flatMap(({ comps }) => comps.flatMap((group) => group.map((row) => brandKeyOf(row.brand)))))],
    [ownModels],
  );
  const brandColumns = useMemo(() => {
    const rank = (brand: string): number => {
      const index = DEFAULT_BRAND_ORDER.indexOf(brand);
      return index >= 0 ? index : DEFAULT_BRAND_ORDER.length;
    };
    return [...discoveredBrands]
      .sort((a, b) => {
        if (brandOrder === 'alpha') return brandHeaderLabel(a).localeCompare(brandHeaderLabel(b), 'en');
        if (brandOrder === 'coverage') {
          const aCount = ownModels.reduce((sum, item) => sum + item.comps.filter((group) => brandKeyOf(group[0]?.brand ?? '') === a).length, 0);
          const bCount = ownModels.reduce((sum, item) => sum + item.comps.filter((group) => brandKeyOf(group[0]?.brand ?? '') === b).length, 0);
          return bCount - aCount || rank(a) - rank(b) || a.localeCompare(b);
        }
        return rank(a) - rank(b) || brandHeaderLabel(a).localeCompare(brandHeaderLabel(b), 'en');
      })
      .map((key) => ({ key, label: brandHeaderLabel(key) }));
  }, [brandOrder, discoveredBrands, ownModels]);
  const columnTemplate = `minmax(250px, 1.05fr) repeat(${brandColumns.length}, minmax(180px, 1fr))`;
  const minMapWidth = axisWidth + 250 + Math.max(brandColumns.length, 1) * 180;
  // 价格接近的产品仍需保持“一产品一行”。先按真实 Y 位置排布，再做最小行距碰撞处理；
  // 刻度和网格线保持真实价格位置，产品文字只在必要时做小幅上下让位。
  const rowTops = new Map<string, number>();
  let lastBottom = plotTop + 4;
  for (const item of ownModels) {
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
        <span style={{ fontSize: 11, color: color.mute }}>分析范围：全分析期 · 查看窗口：最新有值周 {asOf} · 周度采样 · 纵轴 = 我司产品当前价（{currency === 'usd' ? 'USD' : '本币'}）</span>
        <span style={{ flex: 1 }} />
        <span className="tnum" style={{ fontSize: 12, color: color.body }}>我司产品 <strong style={{ color: color.ink, fontSize: 16 }}>{ownModels.length}</strong></span>
        <span style={{ color: color.hairlineStrong }}>·</span>
        <span className="tnum" style={{ fontSize: 12, color: color.body }}>已配置竞品 <strong style={{ color: color.ink, fontSize: 16 }}>{competitorCount}</strong></span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        <span style={{ color: color.mute, fontSize: 11 }}>品牌列顺序</span>
        {([
          ['default', '默认顺序'],
          ['coverage', '竞品数量'],
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
        <span style={{ color: color.mute, fontSize: 10.5 }}>竞品列仅作对标关系，不参与纵轴刻度 · 每屏最多 {MAX_VISIBLE_BRAND_COLUMNS} 个品牌列，更多品牌可横向滚动</span>
      </div>

      <div style={{ marginTop: 10, overflowX: 'auto', border: `1px solid ${color.hairline}`, borderRadius: radius.control, background: color.canvasSoft }}>
        <div style={{ position: 'relative', minWidth: minMapWidth, height: totalHeight, background: color.canvas }}>
          {/* 与价格看板同口径的左侧 Y 轴：美元显示档位带，本币只显示刻度。 */}
          <div aria-label={`我司产品当前价（${currency === 'usd' ? 'USD' : '本币'}）`} style={{ position: 'sticky', zIndex: 8, left: 0, width: axisWidth, height: totalHeight, boxSizing: 'border-box', borderRight: `1px solid ${color.hairlineStrong}`, background: color.canvas, boxShadow: '2px 0 3px rgba(0,0,0,.04)' }}>
            <span style={{ position: 'absolute', left: 8, top: 8, fontSize: 10, lineHeight: '12px', color: color.mute, whiteSpace: 'nowrap' }}>我司当前价</span>
            {tierBoxes.map((box, index) => <div key={`${box.label}-${index}`} style={{ position: 'absolute', left: 0, top: box.top, width: 64, height: box.h, boxSizing: 'border-box', border: box.empty ? `1px dashed ${color.hairline}` : `1px solid ${color.hairline}`, background: box.empty ? 'transparent' : index % 2 === 0 ? color.canvasSoft2 : color.canvasSoft, display: 'grid', placeItems: 'center', overflow: 'hidden', pointerEvents: 'none' }}>{box.h >= 16 && <span style={{ fontSize: 10, lineHeight: '12px', color: box.empty ? color.mute : color.body, whiteSpace: 'nowrap' }}>{box.label}</span>}</div>)}
            {ticks.map((tick) => <span key={tick.v} className="tnum" style={{ position: 'absolute', right: 10, top: tick.y - 8, fontSize: 12, lineHeight: '16px', color: color.body, whiteSpace: 'nowrap' }}>{tick.text}</span>)}
          </div>

          <div style={{ position: 'absolute', left: axisWidth, right: 0, top: 0, height: totalHeight, overflow: 'visible' }}>
            <div style={{ position: 'absolute', zIndex: 4, top: 0, left: 0, right: 0, height: plotTop, boxSizing: 'border-box', display: 'grid', gridTemplateColumns: columnTemplate, alignItems: 'center', borderBottom: `1px solid ${color.hairline}`, background: color.canvas, overflow: 'visible' }}>
              <div style={{ position: 'sticky', zIndex: 6, left: axisWidth, boxSizing: 'border-box', padding: '0 14px', color: color.mute, fontSize: 11, lineHeight: '16px', borderRight: `1px solid ${color.hairline}`, height: '100%', display: 'flex', alignItems: 'center', background: color.canvas, boxShadow: '2px 0 3px rgba(0,0,0,.03)' }}>产品</div>
              {brandColumns.map((brand, index) => <div key={brand.key} style={{ boxSizing: 'border-box', padding: '0 12px', color: brandColorOf(brand.key), fontSize: 11, lineHeight: '16px', fontWeight: 700, borderRight: index === brandColumns.length - 1 ? 0 : `1px solid ${color.hairline}`, height: '100%', display: 'flex', alignItems: 'center', whiteSpace: 'nowrap' }}>{brand.label}</div>)}
            </div>
            {ticks.map((tick) => <div key={`line-${tick.v}`} style={{ position: 'absolute', left: 0, right: 0, top: tick.y, borderTop: `1px solid ${color.hairline}`, pointerEvents: 'none' }} />)}
            {ownModels.map(({ model, price, comps }) => {
              return (
                <div key={model.modelId} style={{ position: 'absolute', left: 0, right: 0, top: rowTops.get(model.modelId) ?? 0, minHeight: 36, display: 'grid', gridTemplateColumns: columnTemplate, alignItems: 'center', zIndex: 1 }}>
                  <button type="button" onClick={() => onOpenProduct(model)} title={`展开 ${canonicalProductName(model)} 的型号与配置明细`} style={{ position: 'sticky', zIndex: 5, left: axisWidth, display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, height: '100%', padding: '4px 10px 4px 14px', border: 0, borderRight: `1px solid ${color.hairline}`, background: color.canvas, textAlign: 'left', font: 'inherit', cursor: 'pointer', boxShadow: '2px 0 3px rgba(0,0,0,.03)' }}>
                    <BrandDot brand={model.brand} size={9} />
                    <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: brandColorOf(model.brand), fontSize: 13, fontWeight: 650 }}>{canonicalProductName(model)}</span>
                      <span className="tnum" style={{ color: color.body, fontSize: 10.5, lineHeight: '13px', whiteSpace: 'nowrap' }}>
                        {price.min == null ? '暂无当前价' : price.min === price.max ? formatPrice(price.min, currency) : `${formatPrice(price.min, currency)} – ${formatPrice(price.max, currency)}`} · 截至 {formatAsOfWeek(latestAsOfWeek(model))}
                      </span>
                    </span>
                  </button>
                  {brandColumns.map((brand, index) => {
                    const group = comps.filter((rows) => brandKeyOf(rows[0]?.brand ?? '') === brand.key).flat();
                    return <div key={brand.key} style={{ minWidth: 0, height: '100%', display: 'flex', alignItems: 'center', padding: '0 10px', borderRight: index === brandColumns.length - 1 ? 0 : `1px solid ${color.hairline}`, background: color.canvas }}><CompetitorCell rows={group.length ? group : undefined} /></div>;
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
