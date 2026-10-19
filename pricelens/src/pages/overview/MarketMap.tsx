import { useEffect, useMemo, useState } from 'react';
import type { DragEvent as ReactDragEvent } from 'react';
import type { CurrencyMode } from '../../dataModel/types';
import type { OverviewModel } from '../../dataModel/aggregate';
import { bucketLatestWeekLabel, tierLabelShort } from '../../chart/PriceTrend/helpers';
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
// 1280px 设计基线：USD 轴 90px + 我司列 250px 后，4 个 180px 品牌列可完整显示；更多列横向滚动。
const MAX_VISIBLE_BRAND_COLUMNS = 4;
// 品牌列手动顺序的持久化 key（视图偏好，不进筛选器版本体系）
const BRAND_ORDER_STORAGE_KEY = 'LPL3.map.brandOrder';
// 价位轴布局（第九十二轮对齐看板档位区块样式；因画布更高，字号与区块宽度按比例放大）：
// [档位区块 = 档位文字 40 居中竖排 | 刻度文字 44 右对齐叠带][短横线 6]
const TIER_TEXT_W = 40;
const TICK_ZONE_W = 44;
const TICK_DASH_W = 6;
const AXIS_BAND_W = TIER_TEXT_W + TICK_ZONE_W;

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
  // 定高 + border-box：行距按 CARD_H 预算，content-box 会让实际高度超出预算、
  // 下一行卡片盖住上一行的下边缘（用户反馈的「卡片下边缘缺失」即此）
  const style = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
    maxWidth: '100%',
    width: '100%',
    height: 34,
    boxSizing: 'border-box' as const,
    padding: '3px 9px',
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
  const axisWidth = (currency === 'usd' ? AXIS_BAND_W : TICK_ZONE_W) + TICK_DASH_W;
  // 我司品牌固定占最左 sticky 列（主视角原则）；竞品品牌列 = 手动拖拽顺序
  // （第九十二轮：三个排序选项删除——默认序兜底，拖过即全以手动序为准）
  const ownBrands = useMemo(() => [...new Set(ownModels.map((m) => brandKeyOf(m.brand)))], [ownModels]);
  const compBrands = useMemo(
    () => [...new Set(models.filter((m) => !m.isOwn).map((m) => brandKeyOf(m.brand)))],
    [models],
  );
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
      return i >= 0 ? i : manualOrder.length; // 新出现的品牌排在手动序末尾
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
        <span style={{ color: color.mute, fontSize: 11 }}>拖动品牌列头可调整列顺序（自动记住）</span>
        <span style={{ color: color.mute, fontSize: 10.5 }}>每屏最多 {MAX_VISIBLE_BRAND_COLUMNS + 1} 个品牌列，更多品牌可横向滚动</span>
      </div>

      <div style={{ marginTop: 10, overflowX: 'auto', border: `1px solid ${color.hairline}`, borderRadius: radius.control, background: color.canvasSoft }}>
        <div style={{ position: 'relative', minWidth: minMapWidth, height: totalHeight, background: color.canvas }}>
          {/* 左侧价位轴：美元显示档位带，本币只显示刻度；域随数据裁剪 */}
          <div style={{ position: 'sticky', zIndex: 8, left: 0, width: axisWidth, height: totalHeight, boxSizing: 'border-box', borderRight: `1px solid ${color.hairlineStrong}`, background: color.canvas, boxShadow: '2px 0 3px rgba(0,0,0,.04)' }}>
            {/* 价位轴（第九十二轮对齐看板样式）：档位区块贴左（文字竖排居中、1K 缩写），
                刻度 10px 右对齐叠画在区块背景上，右缘短横线与刻度对齐；
                画布比看板高 → 字号与区块宽度按比例放大（40/44/6） */}
            {tierBoxes.map((box, index) => (
              <div
                key={`${box.label}-${index}`}
                title={`价格档位 ${tierLabelShort(box.label)}（USD）${box.empty ? '· 当前无产品' : ''}`}
                style={{ position: 'absolute', left: 0, top: box.top, width: currency === 'usd' ? AXIS_BAND_W : TICK_ZONE_W, height: box.h, boxSizing: 'border-box', border: box.empty ? `1px dashed ${color.hairline}` : `1px solid ${color.hairline}`, background: box.empty ? 'transparent' : index % 2 === 0 ? color.canvasSoft2 : color.canvasSoft, display: 'flex', alignItems: 'center', overflow: 'hidden', pointerEvents: 'none' }}
              >
                {currency === 'usd' && (
                  <span style={{ width: TIER_TEXT_W, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, lineHeight: '13px', color: box.empty ? color.mute : color.body, whiteSpace: 'nowrap' }}>
                    {box.h < 30 ? (
                      box.h >= 14 ? <span style={{ fontSize: 9.5, lineHeight: '12px' }}>{tierLabelShort(box.label)}</span> : null
                    ) : (
                      (() => {
                        const parts = tierLabelShort(box.label).split('~');
                        const lines = parts.length === 2 ? [parts[0], '~', parts[1]] : [tierLabelShort(box.label)];
                        return lines.map((ln, k) => <span key={`${ln}-${k}`}>{ln}</span>);
                      })()
                    )}
                  </span>
                )}
              </div>
            ))}
            {ticks.map((tick) => (
              <span key={tick} className="tnum" style={{ position: 'absolute', right: TICK_DASH_W, top: vToY(tick) - 9, width: TICK_ZONE_W, paddingRight: 3, boxSizing: 'border-box', textAlign: 'right', fontSize: 10, lineHeight: '18px', color: color.mute, whiteSpace: 'nowrap', zIndex: 1 }}>{fmtTick(tick)}</span>
            ))}
            {ticks.map((tick) => (
              <span key={`dash-${tick}`} style={{ position: 'absolute', right: 0, top: vToY(tick), width: TICK_DASH_W, height: 1, background: color.hairlineStrong, pointerEvents: 'none', zIndex: 1 }} />
            ))}
          </div>

          <div style={{ position: 'absolute', left: axisWidth, right: 0, top: 0, height: totalHeight, overflow: 'visible' }}>
            <div style={{ position: 'absolute', zIndex: 4, top: 0, left: 0, right: 0, height: plotTop, boxSizing: 'border-box', display: 'grid', gridTemplateColumns: columnTemplate, alignItems: 'center', borderBottom: `1px solid ${color.hairline}`, background: color.canvas, overflow: 'visible' }}>
              <div style={{ position: 'sticky', zIndex: 6, left: axisWidth, boxSizing: 'border-box', padding: '0 14px', color: color.mute, fontSize: 11, lineHeight: '16px', borderRight: `1px solid ${color.hairline}`, height: '100%', display: 'flex', alignItems: 'center', background: color.canvas, boxShadow: '2px 0 3px rgba(0,0,0,.03)' }}>{ownBrands.map((b) => brandHeaderLabel(b)).join(' / ') || '产品'}</div>
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
                  style={{ boxSizing: 'border-box', padding: '0 12px', color: brandColorOf(brand.key), fontSize: 11, lineHeight: '16px', fontWeight: 700, borderRight: index === brandColumns.length - 1 ? 0 : `1px solid ${color.hairline}`, height: '100%', display: 'flex', alignItems: 'center', whiteSpace: 'nowrap', cursor: 'grab', opacity: draggingBrand === brand.key ? 0.4 : undefined, background: dropBrand === brand.key && draggingBrand !== brand.key ? '#edf5ff' : undefined, boxShadow: dropBrand === brand.key && draggingBrand !== brand.key ? 'inset 0 0 0 2px rgba(0, 112, 243, 0.35)' : undefined }}
                >
                  {brand.label}
                </div>
              ))}
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
