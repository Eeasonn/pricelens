import type { CurrencyMode } from '../../dataModel/types';
import type { OverviewModel, OverviewTierBand } from '../../dataModel/aggregate';
import { TIER_LABELS } from '../../dataModel/aggregate';
import { brandLabelOf } from '../../components/BrandMark';
import BrandGlyph from '../../components/BrandGlyph';
import { color, formatPrice, radius, shadow, space } from '../../theme/tokens';

type VisibleBand = {
  band: OverviewTierBand;
  ownModels: OverviewModel[];
};

export interface MarketMapProps {
  bands: readonly VisibleBand[];
  currency: CurrencyMode;
  asOf: string;
  /** 点击产品概要框，展开并滚到底下同一产品的明细行。 */
  onOpenProduct: (model: OverviewModel) => void;
}

function priceRange(model: OverviewModel, currency: CurrencyMode): string {
  const prices = model.rows.map((row) => row.price).filter((price): price is number => price != null);
  if (prices.length === 0) return '暂无现价';
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? formatPrice(min, currency) : `${formatPrice(min, currency)}–${formatPrice(max, currency)}`;
}

function shortModelName(model: OverviewModel): string {
  const brand = brandLabelOf(model.brand);
  return model.modelName.toLowerCase().startsWith(brand.toLowerCase()) ? model.modelName : `${brand} ${model.modelName}`;
}

function competitorName(brand: string, modelName: string): string {
  const label = brandLabelOf(brand);
  return modelName.toLowerCase().startsWith(label.toLowerCase()) ? modelName : `${label} ${modelName}`;
}

const normRom = (value: string): string => value.replace(/\s+/g, '');

function ProductSummary({ model, currency, onOpen }: { model: OverviewModel; currency: CurrencyMode; onOpen: () => void }) {
  const visibleRoms = new Set(model.rows.map((row) => normRom(row.romram)));
  const visibleComps = model.comps.filter((item) => item.ownRomrams.some((romram) => visibleRoms.has(normRom(romram))));
  const competitorNames = [...new Set(visibleComps.map((item) => competitorName(item.brand, item.modelName)))].slice(0, 3);
  const competitorCount = new Set(visibleComps.map((item) => item.skuId.split('__')[0])).size;
  return (
    <button
      type="button"
      onClick={onOpen}
      title={`展开 ${shortModelName(model)} 的型号与配置明细`}
      style={{
        display: 'block',
        width: '100%',
        minWidth: 0,
        minHeight: 86,
        padding: '10px 11px',
        border: `1px solid ${color.hairline}`,
        borderRadius: radius.card,
        background: color.canvas,
        textAlign: 'left',
        font: 'inherit',
        cursor: 'pointer',
        transition: 'border-color .15s ease',
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.borderColor = 'rgba(0,112,243,.5)';
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.borderColor = color.hairline;
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
        <BrandGlyph brand={model.brand} size={16} />
        <strong style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12.5, color: color.ink }}>{shortModelName(model)}</strong>
        <span style={{ marginLeft: 'auto', flexShrink: 0, color: color.mute, fontSize: 10 }}>›</span>
      </span>
      <span className="tnum" style={{ display: 'block', marginTop: 8, color: color.ink, fontSize: 15, lineHeight: '18px', fontWeight: 700 }}>{priceRange(model, currency)}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, marginTop: 6, color: color.mute, fontSize: 10.5 }}>
        <span style={{ flexShrink: 0 }}>{model.rows.length} 配置</span>
        <span style={{ color: color.hairlineStrong }}>·</span>
        <span style={{ flexShrink: 0, color: competitorCount ? color.body : color.mute }}>{competitorCount ? `竞品 ${competitorCount}` : '未配置竞品'}</span>
      </span>
      {competitorNames.length > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, marginTop: 6, overflow: 'hidden' }}>
        {competitorNames.slice(0, 2).map((name) => <span key={name} title={name} style={{ minWidth: 0, maxWidth: 112, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '2px 6px', border: `1px solid ${color.hairline}`, borderRadius: radius.pill, background: color.canvasSoft, color: color.body, fontSize: 9.5 }}>{name}</span>)}
        {competitorCount > 2 && <span style={{ flexShrink: 0, color: color.mute, fontSize: 9.5 }}>+{competitorCount - 2}</span>}
      </span>}
    </button>
  );
}

/**
 * 市场摆位概要图：只保留“产品覆盖 + 竞品关系”两件事。
 * 每个产品只占一个轻量圆角框，按上市价档位分组；点击框直接打开下方同一产品的明细。
 */
export default function MarketMap({ bands, currency, asOf, onOpenProduct }: MarketMapProps) {
  const ownModels = bands.flatMap(({ ownModels: models }) => models);
  const competitorModelIds = new Set(ownModels.flatMap((model) => {
    const visibleRoms = new Set(model.rows.map((row) => normRom(row.romram)));
    return model.comps.filter((comp) => comp.ownRomrams.some((romram) => visibleRoms.has(normRom(romram)))).map((comp) => comp.skuId.split('__')[0]);
  }));
  return (
    <section aria-label="市场摆位概要" style={{ marginTop: space.lg, padding: space.lg, border: `1px solid ${color.hairline}`, borderRadius: radius.card, background: color.canvas, boxShadow: shadow.l1 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 18, lineHeight: '24px', color: color.ink }}>市场摆位概要</h2>
        <span style={{ fontSize: 11, color: color.mute }}>数据截至 {asOf} · 当前价</span>
        <span style={{ flex: 1 }} />
        <span className="tnum" style={{ fontSize: 12, color: color.body }}>我司产品 <strong style={{ color: color.ink, fontSize: 16 }}>{ownModels.length}</strong></span>
        <span style={{ color: color.hairlineStrong }}>·</span>
        <span className="tnum" style={{ fontSize: 12, color: color.body }}>已配置竞品 <strong style={{ color: color.ink, fontSize: 16 }}>{competitorModelIds.size}</strong></span>
        <span style={{ color: color.hairlineStrong }}>·</span>
        <span style={{ fontSize: 12, color: color.body }}>覆盖价位带 <strong style={{ color: color.ink, fontSize: 16 }}>{bands.length}</strong></span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
        {bands.map(({ band, ownModels }) => (
          <div key={band.tierCode} style={{ display: 'grid', gridTemplateColumns: '142px minmax(0,1fr)', gap: 12, alignItems: 'stretch' }}>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '10px 12px', borderLeft: `3px solid ${color.hairlineStrong}`, borderRadius: radius.control, background: color.canvasSoft }}>
              <strong style={{ fontSize: 12.5, color: color.ink }}>{TIER_LABELS[band.tierCode]}</strong>
              <span style={{ marginTop: 4, color: color.mute, fontSize: 10.5 }}>{ownModels.length} 个产品</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8, minWidth: 0 }}>
              {ownModels.map((model) => <ProductSummary key={model.modelId} model={model} currency={currency} onOpen={() => onOpenProduct(model)} />)}
            </div>
          </div>
        ))}
        {bands.length === 0 && <div style={{ padding: '20px 0', textAlign: 'center', color: color.mute, fontSize: 12 }}>当前筛选无匹配产品</div>}
      </div>
    </section>
  );
}
