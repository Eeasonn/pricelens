import type { CurrencyMode } from '../../dataModel/types';
import type { OverviewCompRow, OverviewModel, OverviewTierBand } from '../../dataModel/aggregate';
import { computeYAxis, perUsdOf, yPxOf, type Geom, type YScale } from '../../chart/PriceTrend/helpers';
import { buildTickRows, buildTierBoxes } from '../../chart/PriceTrend/chartModel';
import { brandLabelOf } from '../../components/BrandMark';
import { color, radius, space } from '../../theme/tokens';

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

const normRom = (value: string): string => value.replace(/\s+/g, '');

function modelPrice(model: OverviewModel): { min: number | null; max: number | null; mid: number | null } {
  const values = model.rows.map((row) => row.price).filter((value): value is number => value != null);
  if (values.length === 0) return { min: null, max: null, mid: null };
  const min = Math.min(...values);
  const max = Math.max(...values);
  return { min, max, mid: (min + max) / 2 };
}

function visibleComps(model: OverviewModel): OverviewCompRow[] {
  const visibleRoms = new Set(model.rows.map((row) => normRom(row.romram)));
  return model.comps.filter((comp) => comp.ownRomrams.some((romram) => visibleRoms.has(normRom(romram))));
}

function compGroups(model: OverviewModel): OverviewCompRow[][] {
  const groups = new Map<string, OverviewCompRow[]>();
  for (const comp of visibleComps(model)) {
    const modelId = comp.skuId.split('__')[0];
    const rows = groups.get(modelId);
    if (rows) rows.push(comp);
    else groups.set(modelId, [comp]);
  }
  return [...groups.values()].map((rows) => [...rows].sort((a, b) => Number(b.primary) - Number(a.primary) || (b.price ?? -1) - (a.price ?? -1)));
}

function modelOnly(brand: string, modelName: string): string {
  const label = brandLabelOf(brand);
  return modelName.toLowerCase().startsWith(`${label.toLowerCase()} `) ? modelName.slice(label.length + 1) : modelName;
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
  const targetScale = Math.max(1, Math.min(3, (rowCount * 48) / Math.max(1, base.plotHeight)));
  return computeYAxis({ series, priceTypes: { discounted: true, rrp: false }, sliderScale: targetScale, allowBreak: false, perUsd: perUsdOf(currency) });
}

function CompetitorCell({ rows }: { rows: OverviewCompRow[] | undefined }) {
  if (!rows || rows.length === 0) return <span style={{ color: color.hairlineStrong, fontSize: 11 }}>—</span>;
  const names = [...new Set(rows.map((row) => modelOnly(row.brand, row.modelName)))];
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
      {names.map((name) => <span key={name} title={name} style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: color.body, fontSize: 11.5 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: color.hairlineStrong, flexShrink: 0 }} />{name}</span>)}
    </span>
  );
}

/**
 * 市场摆位概要：复用价格看板的连续 Y 轴和刻度，产品纵向排列，竞品横向对齐。
 * 这里只回答“在售产品有哪些、每个产品对应哪些竞品”；折扣/RRP/价差/预警留在明细表。
 */
export default function MarketMap({ bands, currency, asOf, onOpenProduct }: MarketMapProps) {
  const ownModels = bands.flatMap(({ ownModels: models }) => models)
    .map((model) => ({ model, price: modelPrice(model), comps: compGroups(model) }))
    .sort((a, b) => (b.price.mid ?? -1) - (a.price.mid ?? -1) || a.model.modelName.localeCompare(b.model.modelName));
  const allValues = ownModels.flatMap(({ model, comps }) => [
    ...model.rows.map((row) => row.price),
    ...comps.flatMap((group) => group.map((row) => row.price)),
  ]).filter((value): value is number => value != null);
  const competitorCount = new Set(ownModels.flatMap(({ comps }) => comps.map((group) => group[0]?.skuId.split('__')[0]).filter((value): value is string => !!value))).size;
  const scale = scaleForValues(allValues, currency, ownModels.length);
  const plotTop = 38;
  const geom: Geom = { gridLeft: 0, plotLeft: 0, plotTop, plotWidth: 1, plotHeight: scale.plotHeight, scale, n: 1 };
  const ticks = buildTickRows(geom);
  const tierBoxes = buildTierBoxes({ enabled: currency === 'usd', geom, tierValues: allValues });
  const axisWidth = currency === 'usd' ? 140 : 78;
  const totalHeight = plotTop + scale.plotHeight + 12;
  const brandColumns = [
    { key: 'APPLE', label: 'APPLE' },
    { key: 'SAMSUNG', label: 'Samsung' },
    { key: 'HONOR', label: 'Honor' },
    { key: 'XIAOMI', label: 'XIAOMI' },
  ] as const;
  const columnTemplate = 'minmax(250px, 1.05fr) repeat(4, minmax(190px, 1fr))';
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
  const overflow = Math.max(0, lastBottom - (plotTop + scale.plotHeight));
  if (overflow > 0) {
    for (const [modelId, top] of rowTops) rowTops.set(modelId, top - overflow);
  }

  return (
    <section aria-label="市场摆位概要" style={{ marginTop: space.lg, padding: space.lg, border: `1px solid ${color.hairline}`, borderRadius: radius.card, background: color.canvas }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 18, lineHeight: '24px', color: color.ink }}>市场摆位概要</h2>
        <span style={{ fontSize: 11, color: color.mute }}>数据截至 {asOf} · 当前价</span>
        <span style={{ flex: 1 }} />
        <span className="tnum" style={{ fontSize: 12, color: color.body }}>我司产品 <strong style={{ color: color.ink, fontSize: 16 }}>{ownModels.length}</strong></span>
        <span style={{ color: color.hairlineStrong }}>·</span>
        <span className="tnum" style={{ fontSize: 12, color: color.body }}>已配置竞品 <strong style={{ color: color.ink, fontSize: 16 }}>{competitorCount}</strong></span>
      </div>

      <div style={{ marginTop: 14, overflowX: 'auto', border: `1px solid ${color.hairline}`, borderRadius: radius.control, background: color.canvasSoft }}>
        <div style={{ position: 'relative', minWidth: 1120, height: totalHeight, background: color.canvas }}>
          {/* 与价格看板同口径的左侧 Y 轴：美元显示档位带，本币只显示刻度。 */}
          <div style={{ position: 'absolute', left: 0, top: 0, width: axisWidth, height: totalHeight, borderRight: `1px solid ${color.hairlineStrong}` }}>
            {tierBoxes.map((box, index) => <div key={`${box.label}-${index}`} style={{ position: 'absolute', left: 0, top: box.top, width: 64, height: box.h, boxSizing: 'border-box', border: box.empty ? `1px dashed ${color.hairline}` : `1px solid ${color.hairline}`, background: box.empty ? 'transparent' : index % 2 === 0 ? color.canvasSoft2 : color.canvasSoft, display: 'grid', placeItems: 'center', overflow: 'hidden', pointerEvents: 'none' }}>{box.h >= 16 && <span style={{ fontSize: 10, lineHeight: '12px', color: box.empty ? color.mute : color.body, whiteSpace: 'nowrap' }}>{box.label}</span>}</div>)}
            {ticks.map((tick) => <span key={tick.v} className="tnum" style={{ position: 'absolute', right: 10, top: tick.y - 8, fontSize: 12, lineHeight: '16px', color: color.body, whiteSpace: 'nowrap' }}>{tick.text}</span>)}
          </div>

          <div style={{ position: 'absolute', left: axisWidth, right: 0, top: 0, height: totalHeight }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: plotTop, display: 'grid', gridTemplateColumns: columnTemplate, alignItems: 'center', borderBottom: `1px solid ${color.hairline}`, background: color.canvas }}>
              <div style={{ paddingLeft: 14, color: color.mute, fontSize: 11, borderRight: `1px solid ${color.hairline}`, height: '100%', display: 'flex', alignItems: 'center' }}>产品</div>
              {brandColumns.map((brand) => <div key={brand.key} style={{ paddingLeft: 12, color: color.body, fontSize: 11, fontWeight: 600, borderRight: brand.key === 'XIAOMI' ? 0 : `1px solid ${color.hairline}`, height: '100%', display: 'flex', alignItems: 'center' }}>{brand.label}</div>)}
            </div>
            {ticks.map((tick) => <div key={`line-${tick.v}`} style={{ position: 'absolute', left: 0, right: 0, top: tick.y, borderTop: `1px solid ${color.hairline}`, pointerEvents: 'none' }} />)}
            {ownModels.map(({ model, price, comps }) => {
              return (
                <div key={model.modelId} style={{ position: 'absolute', left: 0, right: 0, top: rowTops.get(model.modelId) ?? 0, minHeight: 36, display: 'grid', gridTemplateColumns: columnTemplate, alignItems: 'center', zIndex: 1 }}>
                  <button type="button" onClick={() => onOpenProduct(model)} title={`展开 ${model.modelName} 的型号与配置明细`} style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, height: '100%', padding: '4px 10px 4px 14px', border: 0, borderRight: `1px solid ${color.hairline}`, background: color.canvas, textAlign: 'left', font: 'inherit', cursor: 'pointer' }}>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#c7000b', flexShrink: 0 }} />
                    <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#c7000b', fontSize: 13, fontWeight: 650 }}>{model.modelName}</span>
                  </button>
                  {brandColumns.map((brand, index) => {
                    const group = comps.find((rows) => rows[0]?.brand === brand.key);
                    return <div key={brand.key} style={{ minWidth: 0, height: '100%', display: 'flex', alignItems: 'center', padding: '0 10px', borderRight: index === brandColumns.length - 1 ? 0 : `1px solid ${color.hairline}`, background: color.canvas }}><CompetitorCell rows={group} /></div>;
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
