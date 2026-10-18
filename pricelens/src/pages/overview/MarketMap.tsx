import type { ReactNode } from 'react';
import type { CurrencyMode } from '../../dataModel/types';
import type { OverviewModel, OverviewTierBand } from '../../dataModel/aggregate';
import { TIER_LABELS } from '../../dataModel/aggregate';
import { brandLabelOf } from '../../components/BrandMark';
import BrandGlyph from '../../components/BrandGlyph';
import { color, formatPrice, radius, selectSoftInk, shadow, space } from '../../theme/tokens';

type VisibleBand = {
  band: OverviewTierBand;
  ownModels: OverviewModel[];
};

export interface MarketMapProps {
  bands: readonly VisibleBand[];
  currency: CurrencyMode;
  asOf: string;
  onOpenProduct: (model: OverviewModel) => void;
  onCompare: (model: OverviewModel) => void;
}

type MapEntry = {
  model: OverviewModel;
  tierCode: OverviewTierBand['tierCode'];
  min: number | null;
  max: number | null;
  mid: number | null;
};

const BIN_COUNT = 5;

function modelPrice(model: OverviewModel): Pick<MapEntry, 'min' | 'max' | 'mid'> {
  const prices = model.rows.map((row) => row.price).filter((price): price is number => price != null);
  if (prices.length === 0) return { min: null, max: null, mid: null };
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return { min, max, mid: (min + max) / 2 };
}

function niceStep(range: number): number {
  const rough = Math.max(range / 4, 1);
  const power = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / power;
  return (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * power;
}

function LegendItem({ swatch, children }: { swatch: string; children: ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: color.body }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: swatch, flexShrink: 0 }} />
      {children}
    </span>
  );
}

function ProductCard({ entry, currency, onOpen, onCompare }: {
  entry: MapEntry;
  currency: CurrencyMode;
  onOpen: () => void;
  onCompare: () => void;
}) {
  const { model } = entry;
  const competitors = [...new Set(model.comps.map((comp) => `${brandLabelOf(comp.brand)} ${comp.modelName}`))];
  const priceLabel = entry.min == null
    ? '暂无现价'
    : entry.min === entry.max
      ? formatPrice(entry.min, currency)
      : `${formatPrice(entry.min, currency)}–${formatPrice(entry.max, currency)}`;

  return (
    <article
      onClick={onOpen}
      title="点击查看型号明细"
      style={{
        minWidth: 0,
        minHeight: 82,
        padding: '8px 9px',
        border: `1px solid ${model.isOwn ? 'rgba(199, 0, 11, 0.28)' : color.hairline}`,
        borderTop: `3px solid ${model.isOwn ? '#c7000b' : color.hairlineStrong}`,
        borderRadius: radius.card,
        background: model.isOwn ? color.canvas : color.canvasSoft,
        boxShadow: shadow.l1,
        cursor: 'pointer',
        transition: 'box-shadow .15s ease, border-color .15s ease',
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.borderColor = model.isOwn ? '#c7000b' : color.hairlineStrong;
        event.currentTarget.style.boxShadow = shadow.l2;
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.borderColor = model.isOwn ? 'rgba(199, 0, 11, 0.28)' : color.hairline;
        event.currentTarget.style.boxShadow = shadow.l1;
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
        <BrandGlyph brand={model.brand} size={14} />
        <strong style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, color: color.ink }}>
          {model.modelName.toLowerCase().startsWith(brandLabelOf(model.brand).toLowerCase()) ? model.modelName : `${brandLabelOf(model.brand)} ${model.modelName}`}
        </strong>
        <span style={{ marginLeft: 'auto', flexShrink: 0, fontSize: 9.5, color: model.isOwn ? '#a40009' : color.mute }}>{model.isOwn ? '我司' : '竞品'}</span>
      </div>
      <div className="tnum" style={{ marginTop: 4, display: 'flex', alignItems: 'baseline', gap: 5 }}>
        <span style={{ fontSize: 15, lineHeight: '19px', fontWeight: 700, color: color.ink }}>{priceLabel}</span>
        <span style={{ fontSize: 10, color: color.mute }}>{model.rows.length} 配置</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4, minWidth: 0 }}>
        <span style={{ flexShrink: 0, fontSize: 10, color: color.mute }}>{competitors.length ? `竞品 ${competitors.length}` : '未配置竞品'}</span>
        {competitors.length > 0 && (
          <span title={competitors.join('、')} style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 10, color: color.body }}>
            {competitors[0]}{competitors.length > 1 ? ` +${competitors.length - 1}` : ''}
          </span>
        )}
        <button type="button" onClick={(event) => { event.stopPropagation(); onCompare(); }} style={{ marginLeft: 'auto', border: 0, padding: 0, background: 'transparent', color: selectSoftInk, fontSize: 10, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          看走势
        </button>
      </div>
    </article>
  );
}

/** 粗粒度首页视图：纵轴使用当前折后价，产品按价格带分组；上市价档位只作卡片标签。 */
export default function MarketMap({ bands, currency, asOf, onOpenProduct, onCompare }: MarketMapProps) {
  const entries: MapEntry[] = bands.flatMap(({ band, ownModels }) => ownModels.map((model) => ({ model, tierCode: band.tierCode, ...modelPrice(model) })));
  const priced = entries.flatMap((entry) => [entry.min, entry.max]).filter((value): value is number => value != null);
  const step = niceStep(priced.length > 1 ? Math.max(...priced) - Math.min(...priced) : Math.max(priced[0] ?? 100, 100));
  const minValue = priced.length ? Math.max(0, Math.floor(Math.min(...priced) / step) * step) : 0;
  const maxValue = priced.length ? Math.ceil(Math.max(...priced) / step) * step : step * 4;
  const span = Math.max(maxValue - minValue, step);
  const bins = Array.from({ length: BIN_COUNT }, (_, index) => {
    const high = maxValue - (span * index) / BIN_COUNT;
    const low = maxValue - (span * (index + 1)) / BIN_COUNT;
    return { high, low, items: [] as MapEntry[] };
  });
  for (const entry of entries) {
    const value = entry.mid ?? minValue;
    const index = Math.max(0, Math.min(BIN_COUNT - 1, Math.floor(((maxValue - value) / span) * BIN_COUNT)));
    bins[index].items.push(entry);
  }
  const compCount = new Set(entries.flatMap((entry) => entry.model.comps.map((comp) => comp.skuId.split('__')[0]))).size;

  return (
    <section aria-label="市场价格地图" style={{ marginTop: space.lg, padding: space.lg, border: `1px solid ${color.hairline}`, borderRadius: radius.card, background: color.canvas, boxShadow: shadow.l1 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 18, lineHeight: '24px', color: color.ink }}>市场价格地图</h2>
        <span style={{ fontSize: 11, color: color.mute }}>{asOf} · 我司 {entries.length} · 对标竞品型号 {compCount}</span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 12 }}>
          <LegendItem swatch="#c7000b">我司产品</LegendItem>
          <LegendItem swatch={color.hairlineStrong}>竞品摘要</LegendItem>
        </span>
      </div>
      <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '72px minmax(0, 1fr)', minWidth: 0 }}>
        <div style={{ display: 'grid', gridTemplateRows: `repeat(${BIN_COUNT}, minmax(88px, auto))`, borderRight: `1px solid ${color.hairlineStrong}` }}>
          {bins.map((bin, index) => (
            <div key={index} style={{ position: 'relative', borderTop: index === 0 ? 0 : `1px solid ${color.hairline}` }}>
              <span className="tnum" style={{ position: 'absolute', top: 7, right: 9, fontSize: 10.5, color: color.mute, whiteSpace: 'nowrap' }}>{formatPrice(bin.high, currency)}</span>
              {index === BIN_COUNT - 1 && <span className="tnum" style={{ position: 'absolute', bottom: 7, right: 9, fontSize: 10.5, color: color.mute, whiteSpace: 'nowrap' }}>{formatPrice(minValue, currency)}</span>}
              {index === 0 && <span style={{ position: 'absolute', left: 4, top: 8, writingMode: 'vertical-rl', fontSize: 10, letterSpacing: 1, color: color.mute }}>当前折后价</span>}
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateRows: `repeat(${BIN_COUNT}, minmax(88px, auto))`, background: 'repeating-linear-gradient(to bottom, transparent 0, transparent calc(20% - 1px), rgba(0,0,0,.07) calc(20% - 1px), rgba(0,0,0,.07) 20%)' }}>
          {bins.map((bin, index) => (
            <div key={index} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 260px))', justifyContent: 'start', alignContent: 'start', gap: 8, padding: '10px 0 10px 12px', borderTop: index === 0 ? 0 : `1px solid ${color.hairline}` }}>
              {bin.items.sort((a, b) => (b.mid ?? -1) - (a.mid ?? -1)).map((entry) => (
                <div key={entry.model.modelId} style={{ minWidth: 0 }}>
                  <div style={{ marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 9.5, color: color.mute }} title={TIER_LABELS[entry.tierCode]}>{TIER_LABELS[entry.tierCode]}</div>
                  <ProductCard entry={entry} currency={currency} onOpen={() => onOpenProduct(entry.model)} onCompare={() => onCompare(entry.model)} />
                </div>
              ))}
              {bin.items.length === 0 && <span style={{ fontSize: 11, color: color.hairlineStrong }}>—</span>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
