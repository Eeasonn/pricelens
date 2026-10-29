// ============================================================
// 多平台对比次级视图（第一百六十四轮，Eason 三点）：价格走势卡的「多平台对比」
// 页签——页签主动进入（不带产品筛选，进来自己选）；图例药丸比价按钮进入则带上
// 该产品。退役原 PlatformCompareModal 弹窗形态（第一百四十九~一百五十轮）。
// 页内三层：
// ① 产品切换：只在顶部筛选器已选的产品之间换（主品在前），不再另开全量产品树。
// ② 店铺多选 chips（概念同对比产品区，无主品）：默认 = 每个平台一条「自动」
//    线（平台内每周最低价店铺，chip 只写平台名不缀「自动」）；热区分离（追补
//    拍板）——chip 本体点击 = 屏蔽/恢复折线（虚线置灰，同主图产品药丸语言），
//    行尾常驻筛选小图标 = 弹级联改选该线取数店铺（平台自动/具体店铺/卖家互切，
//    底部「自动」= 回平台内每周最低价），✕ 移除该条；「＋ 添加店铺」弹三级
//    级联（平台→店铺→卖家，行尾 ＋/✓ 即加即撤、连点不关）增减具体店铺/卖家。
// ③ 图表 = 主界面完全同款：Chart（工具行/大促档期底色/悬停明细/价格标签/端点
//    标记全部同参）+ 底部查看窗口毛刷（XBrush），时间窗/视图开关与主图共用
//    同一份状态（页签切换互不重置）。每条店铺线覆写 key/名称/线色（同产品
//    多条线，品牌键与品牌色都会撞），线色用低饱和平台色板（原弹窗色板沿用）。
// 第一百八十五轮（外部 UX 审计落地）：店铺线取数异常 ≠ 空态——不再静默回落
// 「暂无数据」，failed 标记走「数据加载异常 / 请刷新重试」（沿用空态排版）。
// ============================================================
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Button, Popover } from 'antd';
import { CheckOutlined, DownOutlined, FilterOutlined, PlusOutlined } from '@ant-design/icons';
import { useFilters } from '../../state/FiltersContext';
import { useChartContent } from '../../state/chartContent';
import { dimChannel, dimPromo, dimProduct } from '../../data';
import type { Series, SeriesPoint, SkuGroupQuery } from '../../dataModel/types';
import { buildSeries, lowestPriceColorSku, sellersOfChannel } from '../../dataModel/aggregate';
import BrandDot, { brandLabelOf } from '../../components/BrandMark';
import { brandOfModel, configTextOf, modelNameOf } from '../../components/ProductCascader/tree';
import { autoColumnWidth, CascadePanel, measureText } from '../../components/ProductCascader';
import type { CascadeRowItem } from '../../components/ProductCascader';
import ChannelSelectPopover from '../../components/ChannelSelectPopover';
import type { PlatformSelection } from '../../state/filtersTypes';
import { color, fontSize, formatPrice, radius, selectAccent, selectSoft, selectSoftInk, space } from '../../theme/tokens';
import { DeleteX } from '../../components/ProductPicker/pickerBits';
import { preferredSelectedProduct, selectedProductsOf, type SelectedProductPick } from './selectedProducts';
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

/** 取数异常占位（第一百八十五轮，外部 UX 审计）：异常 ≠ 空态——主句 + 副句，
 *  样式沿用 Chart 空态居中排版（灰字），与「暂无数据」明确区分 */
const LOAD_ERROR_HINT = (
  <>
    数据加载异常
    <div style={{ marginTop: 4, fontSize: fontSize.caption }}>请刷新重试</div>
  </>
);

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

// 多平台对比的会话内状态（第一百八十九轮定版：切回多产品再进，恢复此前产品/
// 店铺/屏蔽选择；时间窗本就与主图共享，无需另存）。模块级单例——组件随视图
// 切换卸载后仍在；换国家时 cc 失配整体作废，落回各平台「自动」默认线。
let pcSession: {
  cc: string;
  picked: ProductPick | null;
  shops: ShopLine[];
  hiddenIds: ReadonlySet<string>;
} | null = null;

const normRom = (s: string): string => s.replace(/\s+/g, '');

function defaultShopsOf(cc: string): ShopLine[] {
  const set = new Set<string>();
  for (const c of dimChannel) if (c.country_code === cc) set.add(c.platform);
  return [...set].map((pf) => ({ id: `pf:${pf}`, kind: 'platform' as const, platform: pf }));
}

function shopLabelOf(sh: ShopLine): string {
  // 平台线不缀「自动」二字（第一百六十四轮，Eason）：口径注说明平台 chip = 平台内
  // 每周最低价店铺；具体店铺 = 渠道显示名；卖家 = 渠道 · 卖家
  if (sh.kind === 'platform') return sh.platform;
  const ch = dimChannel.find((c) => c.channel_id === sh.channelId);
  const base = ch?.display_name ?? sh.platform;
  return sh.kind === 'seller' ? `${base} · ${sh.seller}` : base;
}

function shopQueryOf(sh: ShopLine): SkuGroupQuery['platform'] {
  if (sh.kind === 'platform') return { platforms: [sh.platform], shopIds: [] };
  return { platforms: [], shopIds: [sh.channelId!], seller: sh.seller ?? null };
}

/** chip 当前口径（店铺 chip 修改入口用，与 shopQueryOf 同构） */
function chipQueryOf(sh: ShopLine): PlatformSelection {
  if (sh.kind === 'platform') return { platforms: [sh.platform], shopIds: [] };
  return { platforms: [], shopIds: [sh.channelId!], seller: sh.seller ?? null };
}

// ---------------- ① 已选产品切换（只在顶部筛选器的产品之间换） ----------------

const samePick = (a: SelectedProductPick, b: SelectedProductPick): boolean =>
  a.modelId === b.modelId && normRom(a.romram) === normRom(b.romram);

function ProductIdentity({ value }: { value: SelectedProductPick }) {
  const cfg = configTextOf(value.romram);
  return (
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
  );
}

function SelectedProductSwitch({
  options,
  value,
  onChange,
}: {
  options: SelectedProductPick[];
  value: SelectedProductPick | null;
  onChange: (p: SelectedProductPick) => void;
}) {
  const [open, setOpen] = useState(false);
  if (options.length === 0 || !value) {
    return <span style={{ fontSize: fontSize.bodySm, color: color.mute }}>请先在上方选择产品</span>;
  }
  const canSwitch = options.length > 1;
  const face = (
    <span
      style={{
        height: 32,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '0 10px',
        borderRadius: radius.control,
        border: `1px solid ${open ? selectAccent : color.hairline}`,
        background: color.canvas,
        minWidth: 240,
        maxWidth: 420,
      }}
    >
      <ProductIdentity value={value} />
      {canSwitch && <DownOutlined style={{ marginLeft: 'auto', fontSize: 10, color: color.mute, flexShrink: 0 }} />}
    </span>
  );
  if (!canSwitch) return face;
  return (
    <Popover
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      arrow={false}
      placement="bottomLeft"
      styles={{ body: { padding: 6, width: 320 } }}
      content={
        <div role="listbox" aria-label="已选产品" style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 320, overflowY: 'auto' }}>
          {options.map((opt) => {
            const on = samePick(opt, value);
            return (
              <button
                key={`${opt.modelId}|${normRom(opt.romram)}`}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => {
                  onChange(opt);
                  setOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  width: '100%',
                  minHeight: 32,
                  padding: '4px 8px',
                  border: 'none',
                  borderRadius: radius.control,
                  background: on ? selectSoft : 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <ProductIdentity value={opt} />
              </button>
            );
          })}
        </div>
      }
    >
      <button
        type="button"
        aria-label={`对比产品：${[brandLabelOf(brandOfModel(value.modelId)), modelNameOf(value.modelId), configTextOf(value.romram)].filter(Boolean).join(' ')}，在已选产品间切换`}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="在上方已选的产品间切换"
        style={{ padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}
      >
        {face}
      </button>
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
    const shopsTotal = r.chans.reduce((a, c) => a + c.shops, 0);
    return {
      key: r.platform,
      label: r.platform,
      active: active === r.platform,
      onActivate: () => {
        setActive(r.platform);
        setPane(null);
      },
      // 平台行 = 纯导航（第一百六十四轮，Eason：行内「自动」胶囊位置不对——
      // 平台自动线由 chips 行承载，这里不再放每行开关）
      trailing: <span style={{ fontSize: 10, color: color.mute, flexShrink: 0 }}>· {shopsTotal} 店铺</span>,
    };
  });
  const platformExtraW =
    Math.max(0, ...rows.map((r) => measureText(`· ${r.chans.reduce((a, c) => a + c.shops, 0)} 店铺`) * (10 / 13))) + space.xs;
  const channelItems: CascadeRowItem[] = (activeRow?.chans ?? []).map((c) => {
    const on = has(`ch:${c.channel_id}`);
    return {
      key: c.channel_id,
      label: c.display_name,
      active: pane === c.channel_id,
      onActivate: () => setPane(c.channel_id),
      trailing: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <button
            type="button"
            aria-label={`${on ? '移除' : '添加'}店铺 ${c.display_name}`}
            title={on ? '点击移除该店铺线' : '添加该店铺线（店铺内每周最低价）'}
            onClick={(e) => {
              e.stopPropagation();
              onToggle({ id: `ch:${c.channel_id}`, kind: 'channel', platform: c.platform, channelId: c.channel_id });
            }}
            className="lpl-hit"
            style={{ position: 'relative', ...addPillOf(on) }}
          >
            {on ? <CheckOutlined style={{ fontSize: 11 }} /> : <PlusOutlined style={{ fontSize: 11 }} />} 店铺
          </button>
          <span style={{ fontSize: 10, color: color.mute, flexShrink: 0 }}>· {c.shops} 店铺</span>
        </span>
      ),
    };
  });
  // 「＋ 店铺」胶囊宽（图标 11 + 间隙 3 + 文案 + 左右 padding 16 + 边框 2）
  const addPillW = measureText('店铺') * (11 / 13) + 32;
  const channelExtraW =
    addPillW +
    6 +
    Math.max(0, ...(activeRow?.chans ?? []).map((c) => measureText(`· ${c.shops} 店铺`) * (10 / 13))) +
    space.xs;
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
              { items: platformItems, extraW: platformExtraW },
              ...(activeRow ? [{ items: channelItems, extraW: channelExtraW }] : []),
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
      <button
        type="button"
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
      </button>
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
  onLabelMode: (v: 'detail' | 'compact') => void;
  tipMode: 'discount' | 'wow';
  onTipMode: (v: 'discount' | 'wow') => void;
  priceTypes: { discounted: boolean; rrp: boolean };
  onPriceTypeToggle: (key: 'discounted' | 'rrp', val: boolean) => void;
  promoBandsOn: boolean;
  onPromoBandsOn: (v: boolean) => void;
  offersOn: boolean;
  onOffersOn: (v: boolean) => void;
  changeThreshold: number | null;
  onChangeThreshold: (v: number | null) => void;
}) {
  const { state } = useFilters();
  const { setPriceSubview } = useChartContent();
  const cc = state.countryCode;

  // 产品只在顶部已选清单里切换。手选优先；否则用进入时带入的主品；再否则清单里的主品。
  // 手选跨卸载保留（189 定版：会话内再进恢复），初值从模块级快照取（同国家才有效）。
  const options = useMemo(() => selectedProductsOf(state.mains), [state.mains]);
  const [picked, setPicked] = useState<ProductPick | null>(() =>
    pcSession && pcSession.cc === cc ? pcSession.picked : null,
  );
  const matchOption = (p: ProductPick | null): SelectedProductPick | undefined =>
    p ? options.find((o) => samePick(o, p)) : undefined;
  const product = matchOption(picked) ?? matchOption(props.preset) ?? preferredSelectedProduct(state.mains, options);
  const productKey = product ? `${product.modelId}|${normRom(product.romram)}` : '';

  // 店铺多选：默认 = 各平台自动；换国家重置（渠道/卖家名按国家各有一套）；
  // 会话快照同国家则恢复（189 定版）。chip 本体点击 = 屏蔽/恢复折线（图例显隐，
  // 同主图产品药丸语言）；chip 行尾筛选小图标 = 弹级联改选口径（第一百六十四轮
  // 追补拍板：热区分离）；✕ = 移除
  const [shops, setShops] = useState<ShopLine[]>(() =>
    pcSession && pcSession.cc === cc ? pcSession.shops : defaultShopsOf(cc),
  );
  const [editId, setEditId] = useState<string | null>(null); // 正在改选的店铺 chip
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(
    () => (pcSession && pcSession.cc === cc ? new Set(pcSession.hiddenIds) : new Set()), // 屏蔽中的线（chip 虚线置灰）
  );
  useEffect(() => {
    setShops(defaultShopsOf(cc));
    setEditId(null);
    setHiddenIds(new Set());
  }, [cc]);
  // 会话快照落盘：任何变更即写，切回多产品（组件卸载）后仍在
  useEffect(() => {
    pcSession = { cc, picked, shops, hiddenIds };
  }, [cc, picked, shops, hiddenIds]);
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
  const toggleHidden = (id: string): void =>
    setHiddenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  /** chip 级联改选：把该 chip 的线替换为新口径（原地替换，撞已有 chip 的去重；
   *  id 口径与「添加店铺」一致：pf:/ch:/sl:） */
  const applyChipPick = (chip: ShopLine, sel: PlatformSelection | null): void => {
    if (sel == null) return;
    let next: ShopLine;
    if (sel.shopIds.length > 0) {
      const cid = sel.shopIds[0];
      const pf = dimChannel.find((c) => c.channel_id === cid)?.platform ?? chip.platform;
      next = sel.seller
        ? { id: `sl:${cid}:${sel.seller}`, kind: 'seller', platform: pf, channelId: cid, seller: sel.seller }
        : { id: `ch:${cid}`, kind: 'channel', platform: pf, channelId: cid };
    } else {
      next = { id: `pf:${sel.platforms[0]}`, kind: 'platform', platform: sel.platforms[0] };
    }
    setShops((prev) => {
      const replaced = prev.map((s) => (s.id === chip.id ? next : s));
      const seen = new Set<string>();
      return replaced.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)));
    });
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

  // 每条店铺线一组：buildSeries 后覆写 key/名称/线色（同产品多线，品牌键/品牌色会撞）。
  // 第一百八十五轮（外部 UX 审计）：取数异常 ≠ 空态——failed 标记随结果上交，
  // 渲染层改显「数据加载异常」，不再静默伪装成「暂无数据」
  const shopSeriesRes = useMemo<{ series: Series[]; failed: boolean }>(() => {
    if (!product || !repSkuId || shops.length === 0) return { series: [], failed: false };
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
    let failed = false;
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
      failed = true;
    }
    if (!failed && built.length !== shops.length) return { series: [], failed: false };
    return {
      series: built.map((s, i) => ({
        ...s,
        key: shops[i].id,
        label: shopLabelOf(shops[i]),
        color: PLATFORM_PALETTE[i % PLATFORM_PALETTE.length],
      })),
      failed,
    };
  }, [product, repSkuId, shops, state.granularity, state.currency, state.agg, cc, state.industry]);
  const shopSeries = shopSeriesRes.series;

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

  // chip 悬停/改选中 = 图上高亮该线（与主图例药丸同语义；弹层开着时该线保持高亮）
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

  // 空态/异常提示（第一百八十五轮：取数异常优先于全部空态文案）
  const emptyHint = shopSeriesRes.failed
    ? LOAD_ERROR_HINT
    : !product
      ? '请先在上方筛选器选择产品，再做多平台对比'
      : shops.length === 0
        ? '点击「＋ 添加店铺」选择要对比的平台 / 店铺'
        : winSeries.length === 0
          ? '该产品在所选店铺暂无价格数据'
          : shownSeries.length === 0
            ? '店铺折线均已隐藏，点击上方店铺恢复显示'
            : undefined;

  return (
    <div className="lpl-fade-in">
      {/* ① 单产品筛选器 + ② 店铺 chips（chip 即图例：点击屏蔽/恢复，✕ 移除） */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <span style={{ fontSize: 12, color: color.mute, flexShrink: 0 }}>产品</span>
        <SelectedProductSwitch options={options} value={product} onChange={setPicked} />
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
                tabIndex={0}
                aria-pressed={off}
                aria-label={`取数店铺：${shopLabelOf(sh)}，点击隐藏/恢复折线`}
                title={off ? '点击恢复显示该店铺折线' : '点击隐藏该店铺折线'}
                onMouseEnter={() => setHoverKey(sh.id)}
                onMouseLeave={() => setHoverKey(null)}
                onFocus={() => setHoverKey(sh.id)}
                onBlur={() => setHoverKey(null)}
                onKeyDown={(e) => {
                  // chip 内嵌「修改取数店铺」「移除」两个原生按钮，外壳用 span：
                  // 键盘 Enter/Space 同点击（嵌套 button 非法）
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleHidden(sh.id);
                  }
                }}
                onClick={() => toggleHidden(sh.id)}
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
                {/* 整条无数据 = 只标「无数据」（第一百七十四轮，Eason：短划线去掉）；
                    有数据但所选时间窗内无价 = 仍以「—」占位 */}
                {!hasData ? (
                  <span style={{ fontSize: 10, color: color.mute }}>无数据</span>
                ) : (
                  <span className="tnum" style={{ fontWeight: 600, color: off ? color.mute : color.ink }}>
                    · {latest != null ? formatPrice(latest, state.currency) : '—'}
                  </span>
                )}
                {/* 竖分割线（第一百七十四轮，Eason）：线以左 = chip 本体点击（显示/隐藏
                    折线）；线以右 = 筛选（改选口径）/✕（移除）各自独立功能——
                    视觉上把「显隐」与「改选/移除」分成两段，降低理解负担 */}
                <span aria-hidden style={{ width: 1, height: 12, background: color.hairline, flexShrink: 0 }} />
                {/* 筛选小图标（第一百六十四轮追补拍板：热区分离——本体管显隐，这里管
                    改选口径；常驻显示不悬停藏，同 163 轮比价图标口径） */}
                <span onClick={(e) => e.stopPropagation()} style={{ display: 'inline-flex' }}>
                  <Popover
                    trigger="click"
                    open={editId === sh.id}
                    onOpenChange={(o) => setEditId(o ? sh.id : null)}
                    arrow={false}
                    placement="bottomLeft"
                    destroyTooltipOnHide
                    styles={{ body: { padding: 0 } as const }}
                    content={
                      <ChannelSelectPopover
                        cc={cc}
                        skuIds={repSkuId ? [repSkuId] : []}
                        current={chipQueryOf(sh)}
                        scope="platform"
                        scopePlatform={sh.platform}
                        onPick={(sel) => {
                          applyChipPick(sh, sel);
                          setEditId(null);
                        }}
                      />
                    }
                  >
                    <button
                      type="button"
                      aria-label={`修改取数店铺：${shopLabelOf(sh)}`}
                      title="点击修改取数店铺（平台 / 店铺 / 卖家）"
                      className="lpl-hit"
                      style={{
                        position: 'relative',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 18,
                        height: 18,
                        borderRadius: radius.pill,
                        color: color.mute,
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      <FilterOutlined style={{ fontSize: 11 }} />
                    </button>
                  </Popover>
                </span>
                <span onClick={(e) => e.stopPropagation()} style={{ display: 'inline-flex' }}>
                  <DeleteX label={`移除 ${shopLabelOf(sh)}`} size={10} onClick={() => toggleShop(sh)} />
                </span>
              </span>
            );
          })}
          <AddShopPill cc={cc} shops={shops} onToggle={toggleShop} onRestoreDefault={restoreDefault} />
          {/* 返回入口（189 定版）：进入多平台后，工具行原位入口在此变为返回钮——
              主导航仍只有「价格走势」选中，不出现第二处页签高亮 */}
          <span style={{ marginLeft: 'auto', flexShrink: 0, display: 'inline-flex' }}>
            <button
              type="button"
              className="lpl-text-entry"
              title="回到多产品对比（多产品 × 主品基准）"
              onClick={() => setPriceSubview('products')}
              style={{
                border: 'none',
                background: 'transparent',
                font: 'inherit',
                fontSize: 12,
                color: color.body,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                padding: '4px 2px',
              }}
            >
              ← 返回多产品对比
            </button>
          </span>
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
        gridTop={48}
        showXLabels
        hideNamePills
        legendHoverKey={hoverKey ?? editId}
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
        onLabelMode={props.onLabelMode}
        tipMode={props.tipMode}
        onTipMode={props.onTipMode}
        promoBandsOn={props.promoBandsOn}
        onPromoBandsOn={props.onPromoBandsOn}
        promoBands={promoBands}
        changeThreshold={props.changeThreshold}
        onPriceTypeToggle={props.onPriceTypeToggle}
        offersOn={props.offersOn}
        onOffersOn={props.onOffersOn}
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
        平台 chip = 该平台内每周最低价店铺；点 chip 本体（竖线以左）隐藏/恢复折线，行尾筛选图标改选具体店铺 / 卖家，「＋ 添加店铺」增减对比线，✕ 移除。折后价口径，取所选配置的最低价颜色 SKU；时间范围随看板筛选，图内底色 = 大促档期。
      </div>
    </div>
  );
}
