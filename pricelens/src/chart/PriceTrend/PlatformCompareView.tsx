// ============================================================
// 多平台对比次级视图（第一百六十四轮，Eason 三点）：价格走势卡的「多平台对比」
// 页签——页签主动进入（不带产品筛选，进来自己选）；图例药丸比价按钮进入则带上
// 该产品。退役原 PlatformCompareModal 弹窗形态（第一百四十九~一百五十轮）。
// 页内三层：
// ① 单产品筛选器：与产品选择同款四列树（品牌→系列→产品→配置，带搜索），
//    触发器为白底圆角框（同主品框视觉）；单选语义，选完即关。
// ② 店铺多选 chips（概念同对比产品区，无主品）：默认 = 每个平台一条「自动」
//    线（平台内每周最低价店铺）；「＋ 添加店铺」弹三级级联（平台→店铺→卖家，
//    行尾 ＋/✓ 即加即撤、连点不关）增减具体店铺/卖家；chip 即图例——点击屏蔽
//    /恢复折线（虚线置灰），✕ 移除该条。
// ③ 图表 = 主界面完全同款：Chart（工具行/大促档期底色/悬停明细/价格标签/端点
//    标记全部同参）+ 底部查看窗口毛刷（XBrush），时间窗/视图开关与主图共用
//    同一份状态（页签切换互不重置）。每条店铺线覆写 key/名称/线色（同产品
//    多条线，品牌键与品牌色都会撞），线色用低饱和平台色板（原弹窗色板沿用）。
// ============================================================
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Button, Input, Popover } from 'antd';
import { CheckOutlined, DownOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useFilters } from '../../state/FiltersContext';
import { dimChannel, dimPromo, dimProduct } from '../../data';
import type { Series, SeriesPoint, SkuGroupQuery } from '../../dataModel/types';
import { buildSeries, lowestPriceColorSku, sellersOfChannel } from '../../dataModel/aggregate';
import BrandDot, { brandLabelOf } from '../../components/BrandMark';
import { brandOfModel, configTextOf, modelNameOf, searchProductTree } from '../../components/ProductCascader/tree';
import type { BrandNode, RomramNode } from '../../components/ProductCascader/tree';
import { autoColumnWidth, CascadePanel, measureText } from '../../components/ProductCascader';
import type { CascadeRowItem } from '../../components/ProductCascader';
import { color, fontSize, formatPrice, radius, selectAccent, selectSoft, selectSoftInk, space } from '../../theme/tokens';
import { DeleteX, POPOVER_H, POPOVER_Z, StateTag, useTreeData } from '../../components/ProductPicker/pickerBits';
import Chart from './Chart';
import XBrush from './XBrush';
import {
  bucketSpans,
  computeYAxis,
  dataBucketRange,
  estGridLeft,
  perUsdOf,
  type Bucket,
  type YScale,
} from './helpers';
import { buildPromoBands, type LineShapeChoice, type PromoBand } from './chartModel';

/** 店铺线色板（低饱和六色，原多平台比价弹窗色板沿用；超出循环取色） */
const PLATFORM_PALETTE = ['#4c78a8', '#c78a4b', '#6f9e6a', '#a878a8', '#9d755d', '#4fa3a5'];

/** 一条店铺线 = chips 里的一项：
 *  platform = 平台自动（平台内每周最低价店铺）；channel = 具体店铺（渠道）；
 *  seller = 渠道内具体卖家 */
export interface ShopLine {
  id: string;
  kind: 'platform' | 'channel' | 'seller';
  platform: string;
  channelId?: string;
  seller?: string;
}

interface ProductPick {
  modelId: string;
  romram: string;
}

const normRom = (s: string): string => s.replace(/\s+/g, '');

function defaultShopsOf(cc: string): ShopLine[] {
  const set = new Set<string>();
  for (const c of dimChannel) if (c.country_code === cc) set.add(c.platform);
  return [...set].map((pf) => ({ id: `pf:${pf}`, kind: 'platform' as const, platform: pf }));
}

function shopLabelOf(sh: ShopLine): string {
  if (sh.kind === 'platform') return `${sh.platform} · 自动`;
  const ch = dimChannel.find((c) => c.channel_id === sh.channelId);
  const base = ch?.display_name ?? sh.platform;
  return sh.kind === 'seller' ? `${base} · ${sh.seller}` : base;
}

function shopQueryOf(sh: ShopLine): SkuGroupQuery['platform'] {
  if (sh.kind === 'platform') return { platforms: [sh.platform], shopIds: [] };
  return { platforms: [], shopIds: [sh.channelId!], seller: sh.seller ?? null };
}

// ---------------- ① 单产品筛选器（同款四列树 + 主品框视觉触发器） ----------------

/** 无配置层级产品（唯一可用配置为「—」）型号行即选择叶 */
const usableRomramsOf = (nodes: RomramNode[]): RomramNode[] =>
  nodes.filter((r) => r.romram !== '—' || nodes.length === 1);

function SingleProductBox({
  value,
  onChange,
}: {
  value: ProductPick | null;
  onChange: (p: ProductPick) => void;
}) {
  const { fullTree } = useTreeData();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const tree = useMemo(() => searchProductTree(fullTree, search), [fullTree, search]);

  // 打开/搜索时定位：优先当前产品的型号路径，否则首个结果
  const [path, setPath] = useState<[string, string, string] | null>(null);
  useEffect(() => {
    if (!open) return;
    const locate = (t: BrandNode[]): [string, string, string] | null => {
      if (value) {
        for (const b of t) {
          for (const s of b.series) {
            if (s.models.some((m) => m.modelId === value.modelId)) return [b.key, s.key, value.modelId];
          }
        }
      }
      const b = t[0];
      const s = b?.series[0];
      const m = s?.models[0];
      return b && s && m ? [b.key, s.key, m.modelId] : null;
    };
    setPath(locate(tree));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, search]);

  const brand = tree.find((b) => b.key === path?.[0]) ?? tree[0];
  const series = brand?.series.find((s) => s.key === path?.[1]) ?? brand?.series[0];
  const model = series?.models.find((m) => m.modelId === path?.[2]) ?? series?.models[0];
  const currentKey = value ? `${value.modelId}|${normRom(value.romram)}` : '';

  const pick = (r: RomramNode): void => {
    onChange({ modelId: r.modelId, romram: r.romram });
    setOpen(false);
  };

  const eolPill = (on: boolean): CascadeRowItem['trailing'] =>
    on ? (
      <span style={{ fontSize: 10, color: color.mute, border: `1px solid ${color.hairline}`, borderRadius: radius.pill, padding: '0 6px', lineHeight: '16px', flexShrink: 0 }}>退市</span>
    ) : undefined;
  const eolPillW = measureText('退市') * (10 / 13) + 12 + 8;

  const romramRow = (r: RomramNode): CascadeRowItem => ({
    key: r.key,
    label: r.romram,
    onLabelClick: () => pick(r),
    trailing: currentKey === `${r.modelId}|${normRom(r.romram)}` ? <StateTag text="当前" /> : undefined,
  });

  const drilledUsable = model ? usableRomramsOf(model.romrams) : [];
  const modelDegenerate = drilledUsable.length === 1 && drilledUsable[0].romram === '—';

  const colItems: CascadeRowItem[][] = [
    tree.map((b) => ({
      key: b.key,
      label: brandLabelOf(b.key),
      leading: <BrandDot brand={b.key} />,
      active: brand?.key === b.key,
      onActivate: () => {
        const s = b.series[0];
        setPath([b.key, s?.key ?? '', s?.models[0]?.modelId ?? '']);
      },
      trailing: <span style={{ fontSize: 10, color: color.mute, flexShrink: 0 }}>{b.modelCount} 型号</span>,
    })),
    (brand?.series ?? []).map((s) => ({
      key: s.key,
      label: s.title,
      active: series?.key === s.key,
      onActivate: () => setPath(brand ? [brand.key, s.key, s.models[0]?.modelId ?? ''] : null),
      trailing: eolPill(!!s.eol),
    })),
    (series?.models ?? []).map((m) => {
      const usable = usableRomramsOf(m.romrams);
      // 无配置层级的型号（唯一配置「—」）行即选择叶（与选择产品浮窗同口径）
      if (usable.length === 1 && usable[0].romram === '—') {
        const leaf = romramRow(usable[0]);
        return { ...leaf, key: m.modelId, label: m.label, leading: <BrandDot brand={m.brand} /> };
      }
      return {
        key: m.modelId,
        label: m.label,
        leading: <BrandDot brand={m.brand} />,
        active: model?.modelId === m.modelId,
        onActivate: () => setPath(brand && series ? [brand.key, series.key, m.modelId] : null),
        trailing: eolPill(!!m.eol),
      };
    }),
    // 无配置层级的型号钻入后第四列留空（叶子已上提到型号行），不渲染「—」
    model && !modelDegenerate ? drilledUsable.map(romramRow) : [],
  ];
  const columns = colItems.map((items) => ({ items, width: autoColumnWidth(items, { extraW: eolPillW, noMaxClip: true }) }));
  const panelW = columns.reduce((w, c) => w + (c.width ?? 0), 0);
  const bodyW = Math.max(360, Math.min(panelW + 20, Math.min(typeof window === 'undefined' ? 1148 : window.innerWidth - 48, 1100)));

  const cfg = value ? configTextOf(value.romram) : '';
  return (
    <Popover
      trigger="click"
      open={open}
      zIndex={POPOVER_Z}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setSearch('');
      }}
      arrow={false}
      placement="bottomLeft"
      styles={{ body: { padding: 10, width: bodyW } }}
      content={
        <div>
          <Input
            allowClear
            size="small"
            prefix={<SearchOutlined style={{ color: color.mute }} />}
            placeholder="搜索品牌 / 系列 / 产品"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ marginBottom: 8 }}
          />
          <div style={{ display: 'flex' }}>
            <CascadePanel columns={columns} fill height={POPOVER_H} />
          </div>
        </div>
      }
    >
      {/* 触发器：白底圆角框（同主品框视觉），品牌点 + 品牌 + 型号 + 配置 chip */}
      <div
        role="button"
        aria-label={value ? `对比产品：${[brandLabelOf(brandOfModel(value.modelId)), modelNameOf(value.modelId), cfg].filter(Boolean).join(' ')}，点击更换` : '选择产品'}
        title={value ? '点击更换产品' : '点击选择产品'}
        style={{
          height: 32,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '0 10px',
          borderRadius: radius.control,
          border: `1px solid ${open ? selectAccent : color.hairline}`,
          background: color.canvas,
          cursor: 'pointer',
          minWidth: 240,
          maxWidth: 420,
        }}
      >
        {value ? (
          <>
            <BrandDot brand={brandOfModel(value.modelId)} />
            <span style={{ fontSize: 12, color: color.mute, whiteSpace: 'nowrap' }}>{brandLabelOf(brandOfModel(value.modelId))}</span>
            <span style={{ fontSize: fontSize.bodySm, fontWeight: 600, color: color.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {modelNameOf(value.modelId)}
            </span>
            {cfg && (
              <span style={{ fontSize: 10, lineHeight: '16px', padding: '0 6px', borderRadius: radius.pill, background: selectSoft, color: selectSoftInk, flexShrink: 0 }}>
                {value.romram}
              </span>
            )}
          </>
        ) : (
          <span style={{ fontSize: fontSize.bodySm, color: color.mute }}>选择产品</span>
        )}
        <DownOutlined style={{ marginLeft: 'auto', fontSize: 10, color: color.mute, flexShrink: 0 }} />
      </div>
    </Popover>
  );
}

// ---------------- ② 添加店铺（三级级联：行尾 ＋/✓ 即加即撤、连点不关） ----------------

function AddShopPill({
  cc,
  shops,
  onToggle,
  onRestoreDefault,
}: {
  cc: string;
  shops: ShopLine[];
  onToggle: (line: ShopLine) => void;
  onRestoreDefault: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string | null>(null); // 左列展开的平台
  const [pane, setPane] = useState<string | null>(null); // 第三列展开的渠道
  useEffect(() => {
    setActive(null);
    setPane(null);
  }, [cc, open]);

  const rows = useMemo(() => {
    const byPlatform = new Map<string, typeof dimChannel>();
    for (const c of dimChannel) {
      if (c.country_code !== cc) continue;
      const arr = byPlatform.get(c.platform) ?? [];
      arr.push(c);
      byPlatform.set(c.platform, arr);
    }
    return [...byPlatform.entries()].map(([platform, chans]) => ({ platform, chans }));
  }, [cc]);
  const activeRow = rows.find((r) => r.platform === active) ?? null;
  const paneChannel = pane ? dimChannel.find((c) => c.channel_id === pane) ?? null : null;
  const paneSellers = useMemo(() => (pane ? sellersOfChannel(cc, pane) : []), [cc, pane]);

  const has = (id: string): boolean => shops.some((s) => s.id === id);
  const addPillOf = (on: boolean): CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 3,
    height: 20,
    padding: '0 8px',
    borderRadius: radius.pill,
    fontSize: 11,
    fontWeight: 600,
    color: selectSoftInk,
    background: selectSoft,
    border: `1px solid ${on ? selectAccent : 'rgba(0, 112, 243, 0.35)'}`,
    cursor: 'pointer',
    flexShrink: 0,
  });

  const platformItems: CascadeRowItem[] = rows.map((r) => {
    const on = has(`pf:${r.platform}`);
    const shopsTotal = r.chans.reduce((a, c) => a + c.shops, 0);
    return {
      key: r.platform,
      label: r.platform,
      active: active === r.platform,
      onActivate: () => {
        setActive(r.platform);
        setPane(null);
      },
      trailing: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span
            role="button"
            aria-label={`${on ? '移除' : '添加'} ${r.platform} 自动店铺`}
            title={on ? '点击移除该平台自动线' : '添加该平台自动线（平台内每周最低价店铺）'}
            onClick={(e) => {
              e.stopPropagation();
              onToggle({ id: `pf:${r.platform}`, kind: 'platform', platform: r.platform });
            }}
            style={addPillOf(on)}
          >
            {on ? <CheckOutlined style={{ fontSize: 11 }} /> : <PlusOutlined style={{ fontSize: 11 }} />} 自动
          </span>
          <span style={{ fontSize: 10, color: color.mute, flexShrink: 0 }}>· {shopsTotal} 店铺</span>
        </span>
      ),
    };
  });
  const channelItems: CascadeRowItem[] = (activeRow?.chans ?? []).map((c) => {
    const on = has(`ch:${c.channel_id}`);
    return {
      key: c.channel_id,
      label: c.display_name,
      active: pane === c.channel_id,
      onActivate: () => setPane(c.channel_id),
      trailing: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span
            role="button"
            aria-label={`${on ? '移除' : '添加'}店铺 ${c.display_name}`}
            title={on ? '点击移除该店铺线' : '添加该店铺线（店铺内每周最低价）'}
            onClick={(e) => {
              e.stopPropagation();
              onToggle({ id: `ch:${c.channel_id}`, kind: 'channel', platform: c.platform, channelId: c.channel_id });
            }}
            style={addPillOf(on)}
          >
            {on ? <CheckOutlined style={{ fontSize: 11 }} /> : <PlusOutlined style={{ fontSize: 11 }} />} 店铺
          </span>
          <span style={{ fontSize: 10, color: color.mute, flexShrink: 0 }}>· {c.shops} 店铺</span>
        </span>
      ),
    };
  });
  const sellerItems: CascadeRowItem[] = paneChannel
    ? paneSellers.map((x) => {
        const id = `sl:${paneChannel.channel_id}:${x.seller}`;
        const on = has(id);
        return {
          key: x.seller,
          label: x.seller,
          active: on,
          onLabelClick: () =>
            onToggle({ id, kind: 'seller', platform: paneChannel.platform, channelId: paneChannel.channel_id, seller: x.seller }),
          trailing: <span style={{ fontSize: 10, color: color.mute, flexShrink: 0 }}>· {x.weeks} 周</span>,
        };
      })
    : [];
  const sellerColW = useMemo(() => {
    if (!paneChannel) return 0;
    const full: CascadeRowItem[] = paneSellers.map((x) => ({ key: x.seller, label: x.seller }));
    return autoColumnWidth(full, { extraW: measureText('· 24 周') + space.xs, min: 200, max: 360 });
  }, [paneChannel, paneSellers]);

  const defaults = useMemo(() => defaultShopsOf(cc), [cc]);
  const isDefault = shops.length === defaults.length && defaults.every((d) => has(d.id));

  return (
    <Popover
      trigger="click"
      open={open}
      arrow={false}
      placement="bottomLeft"
      styles={{ body: { padding: 0 } as const }}
      onOpenChange={setOpen}
      content={
        <div>
          <CascadePanel
            open
            columns={[
              { items: platformItems },
              ...(activeRow ? [{ items: channelItems }] : []),
              ...(paneChannel && sellerColW > 0 ? [{ items: sellerItems, width: sellerColW }] : []),
            ]}
          />
          <div style={{ padding: `6px ${space.md}px`, borderTop: `1px solid ${color.hairline}` }}>
            <Button
              type="link"
              size="small"
              style={{ padding: 0, height: 20, fontSize: 12 }}
              disabled={isDefault}
              onClick={onRestoreDefault}
            >
              恢复默认（各平台自动）
            </Button>
          </div>
        </div>
      }
    >
      <span
        role="button"
        aria-label="添加店铺"
        title="添加平台 / 店铺 / 卖家对比线"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          height: 24,
          padding: '0 10px',
          borderRadius: radius.pill,
          fontSize: 12,
          fontWeight: 600,
          color: color.body,
          background: color.canvas,
          border: `1px dashed ${color.hairlineStrong}`,
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        <PlusOutlined style={{ fontSize: 10 }} /> 添加店铺
      </span>
    </Popover>
  );
}

// ---------------- ③ 次级视图主体 ----------------

export default function PlatformCompareView(props: {
  /** 药丸比价按钮带入的产品（页签主动进入 = null，进来自己选） */
  preset: ProductPick | null;
  buckets: Bucket[];
  win: { s: number; e: number };
  filterBounds: [number, number];
  adjusting: boolean;
  onWindowChange: (s: number, e: number) => void;
  onAdjusting: (v: boolean) => void;
  // 与主图共用的视图开关（页签切换不重置）
  sliderScale: number;
  onSliderScale: (v: number) => void;
  yCompress: boolean;
  onYCompress: (v: boolean) => void;
  showYTicks: boolean;
  onShowYTicks: (v: boolean) => void;
  lineShape: LineShapeChoice;
  onLineShape: (v: LineShapeChoice) => void;
  labelMode: 'detail' | 'compact';
  priceTypes: { discounted: boolean; rrp: boolean };
  onPriceTypeToggle: (key: 'discounted' | 'rrp', val: boolean) => void;
  promoBandsOn: boolean;
  onPromoBandsOn: (v: boolean) => void;
  offersOn: boolean;
  onOffersOn: (v: boolean) => void;
  maxMinOn: boolean;
  onMaxMinOn: (v: boolean) => void;
  changeThreshold: number | null;
  onChangeThreshold: (v: number | null) => void;
}) {
  const { state } = useFilters();
  const cc = state.countryCode;

  // 产品：药丸按钮每次发起都落到该产品；页签主动进入保持上次手选（首次 = 未选）
  const [picked, setPicked] = useState<ProductPick | null>(null);
  useEffect(() => setPicked(null), [props.preset]);
  const product = picked ?? props.preset;
  const productKey = product ? `${product.modelId}|${normRom(product.romram)}` : '';

  // 店铺多选：默认 = 各平台自动；换国家重置（渠道/卖家名按国家各有一套）
  const [shops, setShops] = useState<ShopLine[]>(() => defaultShopsOf(cc));
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    setShops(defaultShopsOf(cc));
    setHiddenIds(new Set());
  }, [cc]);
  useEffect(() => {
    setHiddenIds(new Set());
  }, [productKey]);

  const toggleShop = (line: ShopLine): void => {
    setShops((prev) => (prev.some((s) => s.id === line.id) ? prev.filter((s) => s.id !== line.id) : [...prev, line]));
  };
  const restoreDefault = (): void => {
    setShops(defaultShopsOf(cc));
    setHiddenIds(new Set());
  };

  // 代表色 = 最低价颜色 SKU（与主图代表色口径一致）；无价数据回退该配置首个 SKU
  const repSkuId = useMemo<string | null>(() => {
    if (!product) return null;
    return (
      lowestPriceColorSku(product.modelId, product.romram, cc, state.currency)
      ?? dimProduct.find((p) => p.model_id === product.modelId && normRom(p.romram) === normRom(product.romram) && p.countries.includes(cc))?.sku_id
      ?? null
    );
  }, [product, cc, state.currency]);

  // 每条店铺线一组：buildSeries 后覆写 key/名称/线色（同产品多线，品牌键/品牌色会撞）
  const shopSeries = useMemo<Series[]>(() => {
    if (!product || !repSkuId || shops.length === 0) return [];
    const [dataStart, dataEnd] = dataBucketRange(state.granularity);
    const groups = shops.map(
      (sh): SkuGroupQuery => ({
        modelId: product.modelId,
        romram: product.romram,
        skuIds: [repSkuId],
        isOwn: false,
        platform: shopQueryOf(sh),
      }),
    );
    let built: Series[] = [];
    try {
      built = buildSeries({
        groups,
        granularity: state.granularity,
        startBucket: dataStart,
        endBucket: dataEnd,
        currency: state.currency,
        agg: state.agg,
        scope: { countryCode: cc, industry: state.industry },
      });
    } catch {
      built = []; // 空态不崩
    }
    if (built.length !== shops.length) return [];
    return built.map((s, i) => ({
      ...s,
      key: shops[i].id,
      label: shopLabelOf(shops[i]),
      color: PLATFORM_PALETTE[i % PLATFORM_PALETTE.length],
    }));
  }, [product, repSkuId, shops, state.granularity, state.currency, state.agg, cc, state.industry]);

  // 窗口切片 + 边缘续接标记（与主图 visSeries 同逻辑）
  const winSeries = useMemo<Series[]>(() => {
    if (props.win.s > props.win.e) return [];
    const listed = (p?: SeriesPoint) => !!p && (p.price != null || p.rrp != null);
    return shopSeries
      .map((s) => {
        const points = s.points.slice(props.win.s, props.win.e + 1);
        const edgeStart = listed(points[0]) && (listed(s.points[props.win.s - 1]) || listed(s.points[props.win.s - 2]));
        const edgeEnd =
          listed(points[points.length - 1]) && (listed(s.points[props.win.e + 1]) || listed(s.points[props.win.e + 2]));
        return { ...s, points, edgeStart, edgeEnd };
      })
      .filter((s) => s.points.length > 0);
  }, [shopSeries, props.win.s, props.win.e]);
  const shownSeries = useMemo(() => winSeries.filter((s) => !hiddenIds.has(s.key)), [winSeries, hiddenIds]);

  // Y 轴自适应（与主图同参：刷选拖动中冻结 + 步长滞回）
  const scaleRef = useRef<YScale | null>(null);
  const yCfg = useMemo(() => {
    if (props.adjusting && scaleRef.current) return scaleRef.current;
    return computeYAxis({
      series: shownSeries,
      priceTypes: state.priceTypes,
      sliderScale: props.sliderScale,
      allowBreak: props.yCompress,
      perUsd: perUsdOf(state.currency),
      prev: scaleRef.current,
    });
  }, [shownSeries, state.priceTypes, props.sliderScale, props.adjusting, props.yCompress, state.currency]);
  useEffect(() => {
    if (!(props.adjusting && scaleRef.current)) scaleRef.current = yCfg;
  }, [yCfg, props.adjusting]);

  // 大促档期底色：按所选店铺线的平台并集过滤促销日历（与主图 scopedPromos 同参）
  const scopedPromos = useMemo(() => {
    const lower = new Set(shops.map((s) => s.platform.toLowerCase().replace(/[^a-z0-9]/g, '')));
    return dimPromo.filter(
      (p) => p.country_code === cc
        && (p.platforms == null || p.platforms.some((pl) => lower.has(pl.toLowerCase().replace(/[^a-z0-9]/g, '')))),
    );
  }, [shops, cc]);
  const winBuckets = useMemo(() => props.buckets.slice(props.win.s, props.win.e + 1), [props.buckets, props.win.s, props.win.e]);
  const promoBands = useMemo<PromoBand[]>(
    () => (props.promoBandsOn ? buildPromoBands({ promos: scopedPromos, spans: bucketSpans(state.granularity, winBuckets) }) : []),
    [props.promoBandsOn, scopedPromos, state.granularity, winBuckets],
  );

  // chip 悬停 = 图上高亮该线（与主图例药丸同语义）
  const [hoverKey, setHoverKey] = useState<string | null>(null);

  const gridLeft = estGridLeft(state.currency);
  const latestOf = (s: Series): number | null => {
    for (let i = s.points.length - 1; i >= 0; i--) {
      const v = s.points[i]?.price;
      if (v != null) return v;
    }
    return null;
  };
  const seriesById = useMemo(() => new Map(winSeries.map((s) => [s.key, s])), [winSeries]);

  const emptyHint = !product
    ? '点击上方「选择产品」开始多平台对比'
    : shops.length === 0
      ? '点击「＋ 添加店铺」选择要对比的平台 / 店铺'
      : winSeries.length === 0
        ? '该产品在所选店铺暂无价格数据'
        : shownSeries.length === 0
          ? '店铺折线均已隐藏，点击上方店铺恢复显示'
          : undefined;

  return (
    <div>
      {/* ① 单产品筛选器 + ② 店铺 chips（chip 即图例：点击屏蔽/恢复，✕ 移除） */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: color.mute, flexShrink: 0 }}>产品</span>
        <SingleProductBox value={product} onChange={setPicked} />
        <span aria-hidden style={{ width: 1, height: 20, background: color.hairline, flexShrink: 0 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minWidth: 0 }}>
          {shops.map((sh, i) => {
            const off = hiddenIds.has(sh.id);
            const line = seriesById.get(sh.id);
            const latest = line ? latestOf(line) : null;
            const hasData = shopSeries.some((s) => s.key === sh.id && s.points.some((p) => p.price != null));
            return (
              <span
                key={sh.id}
                role="button"
                aria-pressed={off}
                title={off ? '点击恢复显示该店铺折线' : '点击隐藏该店铺折线'}
                onMouseEnter={() => setHoverKey(sh.id)}
                onMouseLeave={() => setHoverKey(null)}
                onClick={() =>
                  setHiddenIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(sh.id)) next.delete(sh.id);
                    else next.add(sh.id);
                    return next;
                  })
                }
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  height: 24,
                  padding: '0 6px 0 9px',
                  borderRadius: radius.pill,
                  fontSize: 12,
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  opacity: off ? 0.45 : hasData ? undefined : 0.6,
                  background: color.canvas,
                  border: `1px ${off ? 'dashed' : 'solid'} ${off ? color.hairlineStrong : color.hairline}`,
                  color: off ? color.mute : color.body,
                }}
              >
                <i aria-hidden style={{ width: 12, height: 3, borderRadius: 2, background: PLATFORM_PALETTE[i % PLATFORM_PALETTE.length], flexShrink: 0 }} />
                <span style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{shopLabelOf(sh)}</span>
                <span className="tnum" style={{ fontWeight: 600, color: off ? color.mute : color.ink }}>
                  · {latest != null ? formatPrice(latest, state.currency) : '—'}
                </span>
                {!hasData && <span style={{ fontSize: 10, color: color.mute }}>· 无数据</span>}
                <span onClick={(e) => e.stopPropagation()} style={{ display: 'inline-flex' }}>
                  <DeleteX label={`移除 ${shopLabelOf(sh)}`} size={10} onClick={() => toggleShop(sh)} />
                </span>
              </span>
            );
          })}
          <AddShopPill cc={cc} shops={shops} onToggle={toggleShop} onRestoreDefault={restoreDefault} />
        </div>
      </div>

      {/* ③ 图表 = 主界面完全同款（工具行随 Chart chrome 渲染，开关与主图共用；
          店铺线不走月/季圈点下钻——下钻取数组按产品对定位，店铺线无对应口径） */}
      <Chart
        series={shownSeries}
        granularity={state.granularity}
        currency={state.currency}
        priceTypes={state.priceTypes}
        gridLeft={gridLeft}
        gridTop={36}
        showXLabels
        hideNamePills
        legendHoverKey={hoverKey}
        showYTicks={props.showYTicks}
        onShowYTicks={props.onShowYTicks}
        enableDrill={false}
        windowKey={`pfcmp:${props.win.s}:${props.win.e}`}
        yScale={yCfg}
        sliderScale={props.sliderScale}
        onSliderScale={props.onSliderScale}
        yCompress={props.yCompress}
        onYCompress={props.onYCompress}
        lineShape={props.lineShape}
        onLineShape={props.onLineShape}
        labelMode={props.labelMode}
        promoBandsOn={props.promoBandsOn}
        onPromoBandsOn={props.onPromoBandsOn}
        promoBands={promoBands}
        maxMinOn={props.maxMinOn}
        changeThreshold={props.changeThreshold}
        onPriceTypeToggle={props.onPriceTypeToggle}
        offersOn={props.offersOn}
        onOffersOn={props.onOffersOn}
        onMaxMinOn={props.onMaxMinOn}
        onChangeThreshold={props.onChangeThreshold}
        emptyHint={emptyHint}
      />
      {/* 查看窗口毛刷：与主图共用同一窗口（页签切换不重置） */}
      {props.buckets.length > 0 && winSeries.length > 0 && (
        <XBrush
          buckets={props.buckets}
          s={props.win.s}
          e={props.win.e}
          lo={props.filterBounds[0]}
          hi={props.filterBounds[1]}
          plotLeft={gridLeft}
          granularity={state.granularity}
          onChange={props.onWindowChange}
          onAdjusting={props.onAdjusting}
        />
      )}
      {/* 口径注（业务语） */}
      <div style={{ fontSize: 11, color: color.mute, marginTop: 8, lineHeight: '17px' }}>
        「平台 · 自动」= 该平台内每周最低价店铺；具体店铺/卖家经「＋ 添加店铺」增减，点店铺隐藏/恢复折线、✕ 移除。折后价口径，取所选配置的最低价颜色 SKU；时间范围随看板筛选，图内底色 = 大促档期。
      </div>
    </div>
  );
}
