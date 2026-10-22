// ============================================================
// 多平台比价（第一百三十四轮）：单产品在各平台的价格对比——次级功能，
// 入口 = 价格看板工具行「⋯ 更多」菜单。
// 口径：各平台 = 该平台全部渠道/店铺内最低在架价（platformPriceSpread 同源，
// **与左上平台筛选无关**——比价的意义就是并列看全部平台）；SKU = 该配置的
// 最低价代表色（lowestPriceColorSku，缺省回退该配置首个颜色 SKU）；
// 时间 = 看板筛选范围按周展开（比价恒按周，粒度/查看窗口无关）；币种随看板。
// ============================================================
import { useMemo, useState } from 'react';
import { ConfigProvider, Modal, Select } from 'antd';
import { useFilters } from '../../state/FiltersContext';
import { dimChannel, dimProduct } from '../../data';
import { filterBarTheme } from '../../components/FilterBar';
import { bucketIdOfDate, dateOfBucket } from '../../components/FilterBar/timeUtils';
import { brandOfModel, modelNameOf } from '../../components/ProductCascader/tree';
import { lowestPriceColorSku, platformPriceSpread } from '../../dataModel/aggregate';
import { dataBucketRange, enumerateBuckets } from './helpers';
import { color, fontSize, radius, selectAccent, selectSoft, selectSoftInk } from '../../theme/tokens';

interface ProductOption {
  key: string; // `${modelId}|${romram}`
  modelId: string;
  romram: string;
  label: string;
}

interface PlatformRow {
  platform: string;
  shops: number;
  prices: (number | null)[]; // 与 weeks 对齐；null = 该周该平台无在架价
  latest: number | null; // 窗口内最后一个有价周
  vsLowest: number | null; // 最新价相对全场最低 +x.x
  lowest: boolean;
}

const fmtPrice = (v: number, usd: boolean): string =>
  `${usd ? '$' : ''}${Math.round(v).toLocaleString('en-US')}`;

export default function PlatformCompareModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state } = useFilters();
  const cc = state.countryCode;
  const usd = state.currency === 'usd';

  // 产品选项 = 当前看板全部产品对（主品在前、对比随卡序；selKey 去重）
  const products = useMemo<ProductOption[]>(() => {
    const out: ProductOption[] = [];
    const seen = new Set<string>();
    for (const card of state.mains) {
      for (const sel of [card.main, ...card.compares]) {
        if (!sel) continue;
        const key = `${sel.modelId}|${sel.romram}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          key,
          modelId: sel.modelId,
          romram: sel.romram,
          label: `${brandOfModel(sel.modelId)} ${modelNameOf(sel.modelId)} ${sel.romram}`,
        });
      }
    }
    return out;
  }, [state.mains]);
  const [picked, setPicked] = useState<string | null>(null);
  const activeKey = picked != null && products.some((p) => p.key === picked) ? picked : products[0]?.key ?? null;
  const active = products.find((p) => p.key === activeKey) ?? null;

  // 周桶 = 看板筛选范围（rangeStart/End 为当前粒度桶 id，换算成周 id）∩ 数据全量周域
  const weeks = useMemo<string[]>(() => {
    const [ds, de] = dataBucketRange('week');
    let lo = ds;
    let hi = de;
    const sD = state.rangeStart ? dateOfBucket(state.rangeStart, state.granularity) : null;
    const eD = state.rangeEnd ? dateOfBucket(state.rangeEnd, state.granularity) : null;
    if (sD) lo = lo > bucketIdOfDate(sD, 'week') ? lo : bucketIdOfDate(sD, 'week');
    if (eD) hi = hi < bucketIdOfDate(eD, 'week') ? hi : bucketIdOfDate(eD, 'week');
    if (lo > hi) return [];
    return enumerateBuckets('week', ds, de).map((b) => b.id).filter((id) => id >= lo && id <= hi);
  }, [state.rangeStart, state.rangeEnd, state.granularity]);

  const rows = useMemo<PlatformRow[]>(() => {
    if (!active || !open) return [];
    // 代表色 = 最低价颜色 SKU；无价数据回退该配置首个颜色
    const skuId = lowestPriceColorSku(active.modelId, active.romram, cc)
      ?? dimProduct.find((p) => p.model_id === active.modelId && p.romram.replace(/\s+/g, '') === active.romram.replace(/\s+/g, '') && p.countries.includes(cc))?.sku_id
      ?? null;
    if (!skuId) return [];
    const shopsByPlatform = new Map<string, number>();
    for (const c of dimChannel) {
      if (c.country_code !== cc) continue;
      shopsByPlatform.set(c.platform, (shopsByPlatform.get(c.platform) ?? 0) + c.shops);
    }
    const pricesByPlatform = new Map<string, (number | null)[]>();
    weeks.forEach((wid, i) => {
      for (const { platform, price } of platformPriceSpread(skuId, wid, cc, state.currency)) {
        let arr = pricesByPlatform.get(platform);
        if (!arr) {
          arr = new Array<number | null>(weeks.length).fill(null);
          pricesByPlatform.set(platform, arr);
        }
        arr[i] = price;
      }
    });
    const out: PlatformRow[] = [...shopsByPlatform.entries()].map(([platform, shops]) => {
      const prices = pricesByPlatform.get(platform) ?? new Array<number | null>(weeks.length).fill(null);
      let latest: number | null = null;
      for (let i = prices.length - 1; i >= 0; i--) {
        if (prices[i] != null) {
          latest = prices[i];
          break;
        }
      }
      return { platform, shops, prices, latest, vsLowest: null, lowest: false };
    });
    const priced = out.filter((r) => r.latest != null);
    const min = priced.length ? Math.min(...priced.map((r) => r.latest!)) : null;
    for (const r of out) {
      if (r.latest != null && min != null) r.vsLowest = r.latest / min - 1;
      r.lowest = r.latest != null && r.latest === min;
    }
    // 最低价平台置顶，其余按最新价升序，无价殿后（按名称）
    return out.sort((a, b) => {
      if (a.latest != null && b.latest != null) return a.latest - b.latest || a.platform.localeCompare(b.platform);
      if (a.latest != null) return -1;
      if (b.latest != null) return 1;
      return a.platform.localeCompare(b.platform);
    });
  }, [active, open, weeks, cc, state.currency]);

  // 走势纵轴全域（全场最低~最高）拉伸，行与行可比
  const yDomain = useMemo(() => {
    const all = rows.flatMap((r) => r.prices).filter((v): v is number => v != null);
    if (!all.length) return null;
    const lo = Math.min(...all);
    const hi = Math.max(...all);
    return { lo, hi: hi > lo ? hi : lo + 1 };
  }, [rows]);

  const sparkPath = (prices: (number | null)[], w: number, h: number, pad: number): string => {
    if (!yDomain || weeks.length < 2) return '';
    const x = (i: number): number => pad + (i / (weeks.length - 1)) * (w - pad * 2);
    const y = (v: number): number => pad + (1 - (v - yDomain.lo) / (yDomain.hi - yDomain.lo)) * (h - pad * 2);
    const segs: string[] = [];
    let pts: string[] = [];
    for (let i = 0; i < prices.length; i++) {
      const v = prices[i];
      if (v == null) {
        if (pts.length) {
          segs.push(pts.join(' '));
          pts = [];
        }
        continue;
      }
      pts.push(`${pts.length ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`);
      const nxt = prices[i + 1];
      if (nxt != null) pts.push(`H${x(i + 1).toFixed(1)}`, `V${y(nxt).toFixed(1)}`);
    }
    if (pts.length) segs.push(pts.join(' '));
    return segs.join(' ');
  };

  return (
    <Modal open={open} onCancel={onClose} footer={null} centered width={700} title="多平台比价">
      <ConfigProvider theme={filterBarTheme}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '2px 0 12px' }}>
          <span style={{ fontSize: 12, color: color.mute, flexShrink: 0 }}>产品</span>
          <Select
            style={{ width: 420 }}
            value={activeKey ?? undefined}
            placeholder={products.length ? '选择产品' : '当前看板没有可选产品'}
            notFoundContent="当前看板没有可选产品"
            showSearch
            optionFilterProp="label"
            disabled={!products.length}
            onChange={(k) => setPicked(k)}
            options={products.map((p) => ({ value: p.key, label: p.label }))}
          />
          <span style={{ fontSize: fontSize.caption, color: color.mute, marginLeft: 'auto', whiteSpace: 'nowrap' }}>
            按周 · {usd ? 'USD' : '本币'}
          </span>
        </div>
        {active ? (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(130px, 1.1fr) 110px 90px 190px',
                gap: '0 12px',
                alignItems: 'center',
                padding: '4px 10px',
                fontSize: fontSize.caption,
                color: color.mute,
                borderBottom: `1px solid ${color.hairline}`,
              }}
            >
              <span>平台</span>
              <span style={{ textAlign: 'right' }}>最新价</span>
              <span style={{ textAlign: 'right' }}>比最低</span>
              <span style={{ textAlign: 'center' }}>价格走势（{weeks.length} 周）</span>
            </div>
            {rows.map((r) => (
              <div
                key={r.platform}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(130px, 1.1fr) 110px 90px 190px',
                  gap: '0 12px',
                  alignItems: 'center',
                  padding: '7px 10px',
                  borderRadius: radius.control,
                  background: r.lowest ? selectSoft : undefined,
                  borderBottom: `1px solid ${color.hairline}`,
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <span style={{ fontSize: fontSize.bodySm, fontWeight: r.lowest ? 600 : 400, color: r.lowest ? selectSoftInk : color.body }}>
                    {r.platform}
                  </span>
                  <span style={{ fontSize: fontSize.caption, color: color.mute, whiteSpace: 'nowrap' }}>· {r.shops} 店铺</span>
                </span>
                <span className="tnum" style={{ textAlign: 'right', fontSize: fontSize.bodySm, fontWeight: 600, color: r.lowest ? selectSoftInk : color.ink }}>
                  {r.latest != null ? fmtPrice(r.latest, usd) : '—'}
                  {r.lowest && (
                    <span
                      style={{
                        marginLeft: 6,
                        fontSize: fontSize.caption,
                        lineHeight: '16px',
                        padding: '0 5px',
                        borderRadius: radius.pill,
                        background: selectSoftInk,
                        color: '#fff',
                        verticalAlign: 1,
                      }}
                    >
                      最低
                    </span>
                  )}
                </span>
                <span className="tnum" style={{ textAlign: 'right', fontSize: fontSize.caption, color: r.lowest ? selectSoftInk : color.mute }}>
                  {r.vsLowest != null && r.vsLowest > 0.0005 ? `+${(r.vsLowest * 100).toFixed(1)}%` : r.lowest ? '—' : '—'}
                </span>
                <span style={{ display: 'flex', justifyContent: 'center' }}>
                  {yDomain && weeks.length >= 2 && r.prices.some((v) => v != null) ? (
                    <svg width={180} height={34} role="img" aria-label={`${r.platform} 价格走势`}>
                      <path d={sparkPath(r.prices, 180, 34, 4)} fill="none" stroke={r.lowest ? selectAccent : '#a8b3c2'} strokeWidth={r.lowest ? 1.8 : 1.4} strokeLinejoin="round" />
                    </svg>
                  ) : (
                    <span style={{ fontSize: fontSize.caption, color: color.mute }}>范围内无价</span>
                  )}
                </span>
              </div>
            ))}
            <div style={{ fontSize: fontSize.caption, color: color.mute, marginTop: 10, lineHeight: '18px' }}>
              各平台价格 = 该平台全部店铺内最低在架价（折后价口径，取所选配置的最低价颜色 SKU）；时间范围随看板筛选。
            </div>
          </>
        ) : (
          <div style={{ padding: '28px 0', textAlign: 'center', fontSize: fontSize.bodySm, color: color.mute }}>
            请先在价格看板选择产品，再做多平台比价
          </div>
        )}
      </ConfigProvider>
    </Modal>
  );
}
