// ============================================================
// 选择产品浮窗（第一百二十轮，第三次迭代）：
// 主体 = 若干「分析对」左右排布——左 = 主分析产品（唯一产品+型号+颜色，
//   浅蓝底强调、单选感），中间分界线骑「⚡ 自动匹配竞品」按钮，右 =
//   对比产品（弱、多选感：条目列表 + 常驻「＋ 添加对比产品」触发）。
// 产品树不再常驻：改为「更换/添加」时按需弹出的层级浮窗——条目显示文字
//   本身分四段（品牌/产品/型号/颜色），点任一段 = 从该层向下续选的树切片
//   （预定位当前路径）；行尾「更换」= 完整树浮窗的显性入口。
// 颜色不进树浮窗：点型号行即按默认最低价色落选，换色只在已选条目的色块。
// 主品空缺 = 空对：允许先挂对比条目，补选主品后沿用（不进 URL）。
// 「全部型号」= 每配置一张卡 / 每配置一条对比（不再并卡）；配额每卡
//   1 主品 + ≤7 对比 = 8 条线在选择时收口，卡数 ≤ 8；即改即存。
// ============================================================
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Checkbox, Input, Modal, Popover, Tooltip } from 'antd';
import {
  CloseOutlined,
  HolderOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  SwapOutlined,
  ThunderboltFilled,
} from '@ant-design/icons';
import { useFilters } from '../../state/FiltersContext';
import type { MainProduct, ProductSelection } from '../../state/filtersTypes';
import {
  buildProductTree,
  brandOfModel,
  defaultColorSkuIds,
  modelNameOf,
  searchProductTree,
  type BrandNode,
  type RomramNode,
} from '../ProductCascader/tree';
import { CascadePanel, type CascadeColumnSpec, type CascadeRowItem } from '../ProductCascader';
import ColorFlyout from '../ProductCascader/ColorFlyout';
import BrandDot, { brandLabelOf } from '../BrandMark';
import {
  cardQuota,
  isHuaweiModel,
  MAINS_CAP,
  MAX_LINES_PER_CHART,
  newCardId,
  remapSelection,
  selKey,
} from '../../state/mainSelection';
import { LPL } from '../../state/lplKeys';
import { color, fontSize, radius, selectAccent, selectSoft, selectSoftInk } from '../../theme/tokens';

const POPOVER_H = 300; // 树浮窗列高（固定，不随内容跳变）
const POPOVER_W = { brand: 700, product: 540, config: 240 } as const;
const PAIR_LIST_MAX_H = 440; // 分析对列表区最大高（多对时纵向滚动）

const norm = (s: string): string => s.replace(/\s+/g, '');
const nodeSelKey = (r: RomramNode): string => `${r.modelId}|${norm(r.romram)}`;

// ---------------- 浮窗落点上下文 ----------------

type PickerCtx =
  | { kind: 'add-main' } // 新建一张主分析卡（全局动作/空对左块）
  | { kind: 'set-main'; cardId: string } // 空对补选主品
  | { kind: 'replace-main'; cardId: string } // 换主品（对比区保留）
  | { kind: 'compares'; cardId: string } // 对比区增删（连点，不关浮窗）
  | { kind: 'replace-compare'; cardId: string; sel: ProductSelection }; // 整条替换

type PickerLevel = keyof typeof POPOVER_W;

// ---------------- 最近使用组合（localStorage LPL3.ui.mainCombos，上限 5） ----------------

interface StoredCombo {
  label: string;
  cards: MainProduct[];
}

function isSelection(v: unknown): v is ProductSelection {
  return typeof v === 'object' && v !== null
    && typeof (v as ProductSelection).modelId === 'string'
    && typeof (v as ProductSelection).romram === 'string'
    && Array.isArray((v as ProductSelection).skuIds);
}

function isStoredCard(v: unknown): v is MainProduct {
  if (typeof v !== 'object' || v === null) return false;
  const c = v as MainProduct;
  return typeof c.id === 'string'
    && (c.main === null || isSelection(c.main))
    && Array.isArray(c.compares)
    && c.compares.every(isSelection);
}

function readCombos(): StoredCombo[] {
  try {
    const raw = localStorage.getItem(LPL.uiMainCombos);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (c): c is StoredCombo =>
        typeof c === 'object' && c !== null && typeof (c as StoredCombo).label === 'string'
        && Array.isArray((c as StoredCombo).cards) && (c as StoredCombo).cards.every(isStoredCard),
    );
  } catch {
    return [];
  }
}

function comboSignature(cards: MainProduct[]): string {
  return cards.map((c) => (c.main ? selKey(c.main) : `~${c.compares.map(selKey).join('+')}`)).join('|');
}

// ---------------- 颜色 chip（次级筛选：点开换色 / 多色均价） ----------------

function colorLabelOf(node: RomramNode | undefined, skuIds: string[]): string {
  if (!node) return '';
  const pool = node.selectableColors.length ? node.selectableColors : node.colors;
  const chosen = pool.filter((c) => skuIds.includes(c.skuId));
  if (chosen.length > 1) return `${chosen[0].color}+${chosen.length - 1}`;
  if (chosen.length === 1) return chosen[0].color;
  return pool.find((c) => c.skuId === defaultColorSkuIds(node)[0])?.color ?? pool[0]?.color ?? '';
}

function ColorChip({
  node,
  skuIds,
  onToggle,
  onReset,
  tone,
  currency,
}: {
  node: RomramNode | undefined;
  skuIds: string[];
  onToggle: (skuId: string, next: boolean) => void;
  onReset: () => void;
  tone: 'strong' | 'soft';
  currency: 'usd' | 'local';
}) {
  const label = colorLabelOf(node, skuIds);
  if (!node || !label) return null;
  return (
    <Popover
      trigger="click"
      placement="bottomLeft"
      styles={{ body: { padding: 0, width: 272 } }}
      content={
        <ColorFlyout
          node={node}
          list={[{ modelId: node.modelId, romram: node.romram, skuIds }]}
          currency={currency}
          onToggle={onToggle}
          onReset={onReset}
        />
      }
    >
      <span
        title={`颜色 ${label} · 点击切换`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          height: 20,
          padding: '0 8px',
          borderRadius: radius.pill,
          fontSize: 11,
          fontWeight: 600,
          color: tone === 'strong' ? selectSoftInk : color.body,
          background: tone === 'strong' ? color.canvas : color.canvasSoft,
          border: `1px solid ${tone === 'strong' ? 'rgba(0, 112, 243, 0.40)' : color.hairline}`,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        {label}
      </span>
    </Popover>
  );
}

// ---------------- 通用小件 ----------------

/** 树数据索引（浮窗与条目共用；按国家/产业缓存） */
function useTreeData() {
  const { state } = useFilters();
  const fullTree = useMemo(
    () => buildProductTree(state.industry, state.countryCode),
    [state.industry, state.countryCode],
  );
  const romramByKey = useMemo(() => {
    const m = new Map<string, RomramNode>();
    for (const b of fullTree) for (const s of b.series) for (const md of s.models) for (const r of md.romrams) m.set(r.key, r);
    return m;
  }, [fullTree]);
  const romramsByModel = useMemo(() => {
    const m = new Map<string, RomramNode[]>();
    for (const b of fullTree) for (const s of b.series) for (const md of s.models) m.set(md.modelId, md.romrams);
    return m;
  }, [fullTree]);
  return { fullTree, romramByKey, romramsByModel };
}

const usableRomrams = (nodes: RomramNode[]): RomramNode[] =>
  nodes.filter((r) => r.romram !== '—' || nodes.length === 1);

/** 可点文字段（显示即入口：hover 浅蓝底提示逐层切换） */
function Seg({
  children,
  onClick,
  strong,
  chip,
  small,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  strong?: boolean;
  chip?: boolean;
  small?: boolean;
  title?: string;
}) {
  const [hover, setHover] = useState(false);
  return (
    <span
      role="button"
      title={title}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: chip ? '1px 9px' : '1px 5px',
        borderRadius: chip ? radius.pill : 5,
        fontSize: small ? 12 : strong ? 14 : 12.5,
        fontWeight: strong ? 700 : chip ? 600 : small ? 500 : 400,
        color: chip ? color.ink : color.body,
        background: hover ? selectSoft : chip ? color.canvas : 'transparent',
        border: `1px solid ${chip ? 'rgba(0, 112, 243, 0.40)' : 'transparent'}`,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        minWidth: 0,
        maxWidth: small ? 170 : 250,
      }}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{children}</span>
    </span>
  );
}

/** 虚线触发 pill（「＋ 添加…」家族统一形态） */
function AddPill({ label, onClick, disabled, big }: { label: string; onClick?: () => void; disabled?: boolean; big?: boolean }) {
  return (
    <span
      role="button"
      aria-label={label}
      onClick={disabled ? undefined : onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        height: big ? 34 : 22,
        padding: big ? '0 14px' : '0 9px',
        alignSelf: big ? 'stretch' : undefined,
        justifyContent: big ? 'center' : undefined,
        borderRadius: radius.pill,
        border: `1px dashed ${disabled ? color.hairline : color.hairlineStrong}`,
        fontSize: big ? 12.5 : 11.5,
        color: disabled ? color.mute : color.body,
        background: color.canvas,
        cursor: disabled ? 'not-allowed' : 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      <PlusOutlined style={{ fontSize: 10 }} /> {label}
    </span>
  );
}

/** 行尾「更换」ghost pill（= 完整树浮窗的显性入口） */
function SwapPill({ label, onClick }: { label: string; onClick?: () => void }) {
  return (
    <span
      role="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        height: 20,
        padding: '0 7px',
        borderRadius: radius.pill,
        fontSize: 11,
        color: color.mute,
        background: color.canvas,
        border: `1px solid ${color.hairline}`,
        cursor: 'pointer',
        flexShrink: 0,
        whiteSpace: 'nowrap',
      }}
    >
      <SwapOutlined style={{ fontSize: 10 }} /> 更换
    </span>
  );
}

function DeleteX({ label, onClick, size = 11 }: { label: string; onClick: () => void; size?: number }) {
  return (
    <span
      role="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      style={{ display: 'inline-flex', padding: 4, cursor: 'pointer', color: color.mute, flexShrink: 0 }}
    >
      <CloseOutlined style={{ fontSize: size }} />
    </span>
  );
}

/** 当前/已选 灰标（树浮窗叶行尾） */
function StateTag({ text }: { text: string }) {
  return (
    <span style={{ fontSize: 10.5, color: color.mute, flexShrink: 0, whiteSpace: 'nowrap' }}>{text}</span>
  );
}

// ---------------- 层级切换树浮窗（产品树的按需切片） ----------------

/** 起始层级 = 条目上被点的文字段：brand = 完整树；product = 系列→产品→型号；
 *  config = 该产品全部型号（单列）。选完型号落地；对比上下文连点不关。 */
function LevelSwitchPopover({
  level,
  ctx,
  initialModelId,
  openSignal,
  children,
}: {
  level: PickerLevel;
  ctx: PickerCtx;
  initialModelId?: string;
  openSignal?: boolean;
  children: ReactNode;
}) {
  const { state, actions } = useFilters();
  const mains = state.mains;
  const { fullTree, romramByKey, romramsByModel } = useTreeData();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const tree = useMemo(() => searchProductTree(fullTree, search), [fullTree, search]);

  useEffect(() => {
    if (openSignal) setOpen(true);
  }, [openSignal]);

  // 打开/搜索时定位：优先当前条目的型号路径，否则首个结果
  const [path, setPath] = useState<[string, string, string] | null>(null);
  useEffect(() => {
    if (!open) return;
    const locate = (t: BrandNode[]): [string, string, string] | null => {
      if (initialModelId) {
        for (const b of t) {
          for (const s of b.series) {
            if (s.models.some((m) => m.modelId === initialModelId)) return [b.key, s.key, initialModelId];
          }
        }
      }
      const b = t[0];
      const s = b?.series[0];
      const m = s?.models[0];
      return b && s && m ? [b.key, s.key, m.modelId] : null;
    };
    setPath(locate(search ? tree : fullTree));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, search]);

  const brand = tree.find((b) => b.key === path?.[0]) ?? tree[0];
  const series = brand?.series.find((s) => s.key === path?.[1]) ?? brand?.series[0];
  const model = series?.models.find((m) => m.modelId === path?.[2]) ?? series?.models[0];
  const activeCard = 'cardId' in ctx ? mains.find((c) => c.id === ctx.cardId) ?? null : null;
  const comparesCtx = ctx.kind === 'compares';
  const replaceCompareCtx = ctx.kind === 'replace-compare';

  /** 主品落位：add-main 建卡；set-main 补选；replace-main 整卡替换（颜色同色优先） */
  const pickConfig = (r: RomramNode): void => {
    if (comparesCtx) return;
    const card = activeCard;
    if (replaceCompareCtx) {
      if (!card || card.main?.modelId === r.modelId) return;
      if (card.compares.some((c) => c !== ctx.sel && selKey(c) === nodeSelKey(r))) return;
      const oldNode = romramByKey.get(`${ctx.sel.modelId}|${ctx.sel.romram}`);
      actions.setCardCompares(
        card.id,
        card.compares.map((c) => (c === ctx.sel ? remapSelection(ctx.sel, oldNode, r) : c)),
      );
      setOpen(false);
      return;
    }
    let sel: ProductSelection;
    if (ctx.kind === 'replace-main' && card?.main) {
      sel = remapSelection(card.main, romramByKey.get(`${card.main.modelId}|${card.main.romram}`), r);
    } else {
      sel = { modelId: r.modelId, romram: r.romram, skuIds: defaultColorSkuIds(r) };
    }
    if (ctx.kind === 'add-main') {
      if (mains.some((c) => c.main && selKey(c.main) === selKey(sel))) return;
      if (mains.length >= MAINS_CAP) return;
      actions.setMains([...mains, { id: newCardId(), main: sel, compares: [] }]);
    } else if (card) {
      actions.setMains(mains.map((c) => (c.id === card.id ? { ...c, main: sel } : c)));
    }
    setOpen(false);
  };

  /** 对比区加/移一条（连点） */
  const toggleCompare = (r: RomramNode): void => {
    if (ctx.kind !== 'compares' || !activeCard) return;
    const card = activeCard;
    const exists = card.compares.find((c) => selKey(c) === nodeSelKey(r));
    if (exists) {
      actions.setCardCompares(card.id, card.compares.filter((c) => c !== exists));
      return;
    }
    if (card.main?.modelId === r.modelId) return;
    if (card.compares.length >= cardQuota(card)) return;
    actions.setCardCompares(card.id, [...card.compares, { modelId: r.modelId, romram: r.romram, skuIds: defaultColorSkuIds(r) }]);
  };

  /** 「全部型号」：主品上下文 = 每配置一张卡；对比上下文 = 每配置一条对比 */
  const pickAllConfigs = (modelId: string): void => {
    const sels = usableRomrams(romramsByModel.get(modelId) ?? []).map(
      (r): ProductSelection => ({ modelId, romram: r.romram, skuIds: defaultColorSkuIds(r) }),
    );
    if (!sels.length) return;
    if (comparesCtx || replaceCompareCtx) {
      const card = activeCard;
      if (!card) return;
      const base = replaceCompareCtx ? card.compares.filter((c) => c !== ctx.sel) : card.compares;
      const seen = new Set(base.map(selKey));
      const added = [...base];
      for (const sel of sels) {
        if (card.main?.modelId === sel.modelId) continue;
        const k = selKey(sel);
        if (seen.has(k)) continue;
        if (added.length >= cardQuota(card)) break;
        seen.add(k);
        added.push(sel);
      }
      actions.setCardCompares(card.id, added);
      if (replaceCompareCtx) setOpen(false);
      return;
    }
    let list = mains;
    if ((ctx.kind === 'replace-main' || ctx.kind === 'set-main') && activeCard) {
      list = mains.filter((c) => c.id !== activeCard.id);
    }
    const seen = new Set(list.flatMap((c) => (c.main ? [selKey(c.main)] : [])));
    const cards: MainProduct[] = [];
    for (const sel of sels) {
      const k = selKey(sel);
      if (seen.has(k)) continue;
      if (list.length + cards.length >= MAINS_CAP) break;
      seen.add(k);
      cards.push({ id: newCardId(), main: sel, compares: [] });
    }
    if (!cards.length) return;
    actions.setMains([...list, ...cards]);
    setOpen(false);
  };

  const columns: CascadeColumnSpec[] = useMemo(() => {
    if (!brand) return [];
    const cols: CascadeColumnSpec[] = [];
    if (level === 'brand') {
      cols.push({
        items: tree.map((b) => ({
          key: b.key,
          label: brandLabelOf(b.key),
          leading: <BrandDot brand={b.key} />,
          active: brand.key === b.key,
          onActivate: () => {
            const s = b.series[0];
            setPath([b.key, s?.key ?? '', s?.models[0]?.modelId ?? '']);
          },
          trailing: <span style={{ fontSize: 10.5, color: color.mute, flexShrink: 0 }}>{b.modelCount} 型号</span>,
        })),
        flex: 0.85,
      });
    }
    if (level !== 'config') {
      cols.push({
        items: (brand?.series ?? []).map((s) => ({
          key: s.key,
          label: s.title,
          active: series?.key === s.key,
          onActivate: () => setPath([brand.key, s.key, s.models[0]?.modelId ?? '']),
          trailing: s.eol ? (
            <span style={{ fontSize: 10, color: color.mute, border: `1px solid ${color.hairline}`, borderRadius: radius.pill, padding: '0 6px', lineHeight: '16px', flexShrink: 0 }}>退市</span>
          ) : undefined,
        })),
        flex: 1.0,
      });
      cols.push({
        items: (series?.models ?? []).map((m) => ({
          key: m.modelId,
          label: m.label,
          leading: <BrandDot brand={m.brand} />,
          active: model?.modelId === m.modelId,
          onActivate: () => setPath([brand.key, series.key, m.modelId]),
          trailing: (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              {m.eol && (
                <span style={{ fontSize: 10, color: color.mute, border: `1px solid ${color.hairline}`, borderRadius: radius.pill, padding: '0 6px', lineHeight: '16px' }}>退市</span>
              )}
              <Tooltip title={comparesCtx || replaceCompareCtx ? '该产品全部配置加入对比区' : '该产品全部配置各成一张主分析卡'}>
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    pickAllConfigs(m.modelId);
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 3,
                    height: 20,
                    padding: '0 8px',
                    borderRadius: radius.pill,
                    fontSize: 11,
                    color: selectSoftInk,
                    background: color.canvas,
                    border: '1px solid rgba(0, 112, 243, 0.40)',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <PlusOutlined style={{ fontSize: 9 }} /> 全部型号
                </span>
              </Tooltip>
            </span>
          ),
        })),
        flex: 1.5,
      });
    }
    cols.push({
      items: (model?.romrams ?? []).map((r) => {
        const key = nodeSelKey(r);
        if (comparesCtx && activeCard) {
          const card = activeCard;
          const inCompares = card.compares.some((c) => selKey(c) === key);
          const sameAsMain = card.main?.modelId === r.modelId;
          const quotaFull = card.compares.length >= cardQuota(card);
          const disabled = !inCompares && (sameAsMain || quotaFull);
          return {
            key: r.key,
            label: r.romram,
            checkState: 'none' as const,
            onLabelClick: () => toggleCompare(r),
            trailing: (
              <Tooltip
                title={
                  sameAsMain && !inCompares
                    ? '主分析产品不对比自身配置'
                    : quotaFull && !inCompares
                      ? `本图最多 ${MAX_LINES_PER_CHART} 条产品线（主品 + 对比）`
                      : inCompares
                        ? '移除该对比'
                        : '加入对比区'
                }
              >
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!disabled) toggleCompare(r);
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    height: 20,
                    padding: '0 8px',
                    borderRadius: radius.pill,
                    fontSize: 11,
                    fontWeight: 600,
                    color: disabled ? color.mute : inCompares ? color.canvas : selectSoftInk,
                    background: inCompares ? selectAccent : selectSoft,
                    border: `1px solid ${inCompares ? selectAccent : 'rgba(0, 112, 243, 0.40)'}`,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.5 : 1,
                    flexShrink: 0,
                  }}
                >
                  {inCompares ? '✓ 对比' : '＋对比'}
                </span>
              </Tooltip>
            ),
          } satisfies CascadeRowItem;
        }
        const isCurrent = replaceCompareCtx
          ? selKey(ctx.sel) === key
          : ctx.kind !== 'add-main' && activeCard?.main != null && selKey(activeCard.main) === key;
        const taken = !replaceCompareCtx
          && mains.some((c) => c.main != null && selKey(c.main) === key && !('cardId' in ctx && c.id === ctx.cardId));
        const blocked = isCurrent || taken;
        return {
          key: r.key,
          label: r.romram,
          checkState: 'none' as const,
          onLabelClick: () => {
            if (!blocked) pickConfig(r);
          },
          trailing: isCurrent ? <StateTag text="当前" /> : taken ? <StateTag text="已选" /> : undefined,
        } satisfies CascadeRowItem;
      }),
      flex: 1.15,
    });
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, brand, series, model, level, ctx, mains, activeCard, romramsByModel]);

  return (
    <Popover
      trigger="click"
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setSearch('');
      }}
      placement="bottomLeft"
      styles={{ body: { padding: 10, width: POPOVER_W[level] } }}
      content={
        <div>
          {level !== 'config' && (
            <Input
              allowClear
              size="small"
              prefix={<SearchOutlined style={{ color: color.mute }} />}
              placeholder="搜索品牌 / 系列 / 产品"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ marginBottom: 8, width: 240 }}
            />
          )}
          <div style={{ display: 'flex' }}>
            <CascadePanel columns={columns} fill height={POPOVER_H} />
          </div>
        </div>
      }
    >
      {children}
    </Popover>
  );
}

// ---------------- 条目行（主品 / 对比条目 同构：分段即入口） ----------------

function MainRow({ card }: { card: MainProduct }) {
  const { state, actions } = useFilters();
  const mains = state.mains;
  const { romramByKey } = useTreeData();
  const main = card.main;
  if (!main) return null;
  const brand = brandOfModel(main.modelId);
  const node = romramByKey.get(`${main.modelId}|${main.romram}`);
  const ctx: PickerCtx = { kind: 'replace-main', cardId: card.id };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', minWidth: 0 }}>
      <LevelSwitchPopover level="brand" ctx={ctx} initialModelId={main.modelId}>
        <Seg title={`品牌 ${brandLabelOf(brand)} · 点击换品牌`}>
          <BrandDot brand={brand} />
          {brandLabelOf(brand)}
        </Seg>
      </LevelSwitchPopover>
      <LevelSwitchPopover level="product" ctx={ctx} initialModelId={main.modelId}>
        <Seg strong title={`${modelNameOf(main.modelId)} · 点击换产品（可跨系列）`}>
          {modelNameOf(main.modelId)}
        </Seg>
      </LevelSwitchPopover>
      <LevelSwitchPopover level="config" ctx={ctx} initialModelId={main.modelId}>
        <Seg chip title={`${main.romram} · 点击换型号`}>
          {main.romram}
        </Seg>
      </LevelSwitchPopover>
      <ColorChip
        node={node}
        skuIds={main.skuIds}
        tone="strong"
        currency={state.currency}
        onToggle={(skuId, next) => {
          const skuIds = next ? [...new Set([...main.skuIds, skuId])] : main.skuIds.filter((id) => id !== skuId);
          if (!skuIds.length) return;
          actions.setMains(mains.map((c) => (c.id === card.id ? { ...c, main: { ...main, skuIds } } : c)));
        }}
        onReset={() =>
          node && actions.setMains(mains.map((c) => (c.id === card.id ? { ...c, main: { ...main, skuIds: defaultColorSkuIds(node) } } : c)))
        }
      />
      <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
        <LevelSwitchPopover level="brand" ctx={ctx} initialModelId={main.modelId}>
          <SwapPill label={`更换主分析产品 ${modelNameOf(main.modelId)}`} />
        </LevelSwitchPopover>
        <DeleteX
          label={`删除分析对 ${modelNameOf(main.modelId)}`}
          onClick={() => actions.setMains(mains.filter((c) => c.id !== card.id))}
        />
      </span>
    </div>
  );
}

function CompareRow({ card, sel }: { card: MainProduct; sel: ProductSelection }) {
  const { state, actions } = useFilters();
  const { romramByKey } = useTreeData();
  const node = romramByKey.get(`${sel.modelId}|${sel.romram}`);
  const brand = brandOfModel(sel.modelId);
  const ctx: PickerCtx = { kind: 'replace-compare', cardId: card.id, sel };
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        padding: '2px 6px 2px 8px',
        background: color.canvasSoft,
        borderRadius: radius.control,
        minWidth: 0,
      }}
    >
      <LevelSwitchPopover level="brand" ctx={ctx} initialModelId={sel.modelId}>
        <Seg small title={`品牌 ${brandLabelOf(brand)} · 点击换品牌`}>
          <BrandDot brand={brand} />
          {brandLabelOf(brand)}
        </Seg>
      </LevelSwitchPopover>
      <LevelSwitchPopover level="product" ctx={ctx} initialModelId={sel.modelId}>
        <Seg small title={`${brandLabelOf(brand)} ${modelNameOf(sel.modelId)} · 点击换产品（可跨系列）`}>
          {modelNameOf(sel.modelId)}
        </Seg>
      </LevelSwitchPopover>
      <LevelSwitchPopover level="config" ctx={ctx} initialModelId={sel.modelId}>
        <Seg small chip title={`${sel.romram} · 点击换型号`}>
          {sel.romram}
        </Seg>
      </LevelSwitchPopover>
      <ColorChip
        node={node}
        skuIds={sel.skuIds}
        tone="soft"
        currency={state.currency}
        onToggle={(skuId, next) => {
          const skuIds = next ? [...new Set([...sel.skuIds, skuId])] : sel.skuIds.filter((id) => id !== skuId);
          if (!skuIds.length) return;
          actions.setCardCompares(card.id, card.compares.map((c) => (c === sel ? { ...sel, skuIds } : c)));
        }}
        onReset={() =>
          node && actions.setCardCompares(card.id, card.compares.map((c) => (c === sel ? { ...sel, skuIds: defaultColorSkuIds(node) } : c)))
        }
      />
      <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
        <LevelSwitchPopover level="brand" ctx={ctx} initialModelId={sel.modelId}>
          <SwapPill label={`更换对比产品 ${modelNameOf(sel.modelId)}`} />
        </LevelSwitchPopover>
        <DeleteX
          label={`移除对比 ${modelNameOf(sel.modelId)} ${sel.romram}`}
          size={10}
          onClick={() => actions.setCardCompares(card.id, card.compares.filter((c) => c !== sel))}
        />
      </span>
    </div>
  );
}

// ---------------- 分析对部件 ----------------

/** 分界线「⚡ 自动匹配竞品」（华为主品可点；空对/非华为置灰） */
function AutoMatchButton({ card }: { card: MainProduct }) {
  const { actions } = useFilters();
  const label = card.main ? modelNameOf(card.main.modelId) : '';
  const can = card.main != null && isHuaweiModel(card.main.modelId);
  return (
    <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
      <Tooltip
        title={
          card.main == null
            ? '先选择主分析产品'
            : can
              ? '按对标矩阵自动填充本对右侧对比区'
              : '自动匹配基于对标矩阵，仅支持华为产品；请手动挑选对比'
        }
      >
        <span
          role="button"
          aria-label={`自动匹配竞品${label ? ` ${label}` : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            if (can) actions.autoMatchCard(card.id);
          }}
          style={{
            display: 'inline-flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
            width: 58,
            height: 48,
            borderRadius: 9,
            boxSizing: 'border-box',
            background: can ? selectAccent : color.canvasSoft,
            border: `2px solid ${color.canvas}`,
            boxShadow: can ? `0 0 0 1px ${selectAccent}` : `0 0 0 1px ${color.hairline}`,
            color: can ? '#fff' : color.mute,
            cursor: can ? 'pointer' : 'not-allowed',
          }}
        >
          <ThunderboltFilled style={{ fontSize: 13 }} />
          <span style={{ fontSize: 10, lineHeight: '12px', fontWeight: 600, textAlign: 'center' }}>
            自动匹配
            <br />
            竞品
          </span>
        </span>
      </Tooltip>
    </div>
  );
}

/** 对比区常驻「＋ 添加对比产品」（空态/有态同一样式；点开完整树浮窗连点加） */
function AddCompareTrigger({ card, autoOpen }: { card: MainProduct; autoOpen?: boolean }) {
  const quota = cardQuota(card);
  const full = card.compares.length >= quota;
  return (
    <Tooltip title={full ? `本图最多 ${MAX_LINES_PER_CHART} 条产品线（主品 + 对比）` : '挑选对比产品（可连续添加）'}>
      <span style={{ alignSelf: 'flex-start', display: 'inline-flex' }}>
        <LevelSwitchPopover level="brand" ctx={{ kind: 'compares', cardId: card.id }} initialModelId={card.main?.modelId} openSignal={autoOpen}>
          <AddPill label="添加对比产品" disabled={full} />
        </LevelSwitchPopover>
      </span>
    </Tooltip>
  );
}

// ---------------- 主浮窗 ----------------

export default function ProductPickerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, actions } = useFilters();
  const mains = state.mains;

  // 空对先加对比：建卡后自动展开该卡的添加浮窗（一次性信号）
  const [autoOpenCardId, setAutoOpenCardId] = useState<string | null>(null);

  // ---- 卡片拖拽换序（= 分离面板顺序） ----
  const [dragCard, setDragCard] = useState<string | null>(null);
  const [dropCard, setDropCard] = useState<string | null>(null);
  const moveCard = (from: string, to: string): void => {
    if (from === to) return;
    const ids = mains.map((c) => c.id);
    const i = ids.indexOf(from);
    const j = ids.indexOf(to);
    if (i < 0 || j < 0) return;
    ids.splice(j, 0, ids.splice(i, 1)[0]);
    actions.setMains(ids.map((id) => mains.find((c) => c.id === id)!));
  };

  // ---- 最近组合 ----
  const [combos, setCombos] = useState<StoredCombo[]>(() => readCombos());
  const recordCombo = (): void => {
    if (!mains.length) return;
    const firstName = mains[0]?.main ? modelNameOf(mains[0].main.modelId) : '对比产品';
    const label = mains.length === 1 ? firstName : `${firstName} 等 ${mains.length} 款`;
    const sig = comboSignature(mains);
    const next = [{ label, cards: mains.map((c) => ({ ...c })) }, ...combos.filter((c) => comboSignature(c.cards) !== sig)].slice(0, 5);
    setCombos(next);
    try {
      localStorage.setItem(LPL.uiMainCombos, JSON.stringify(next));
    } catch {
      /* 存储不可用忽略 */
    }
  };
  const handleClose = (): void => {
    recordCombo();
    onClose();
  };

  const totalCompares = new Set(mains.flatMap((c) => c.compares.map(selKey))).size;
  const lastModelId = [...mains].reverse().find((c) => c.main)?.main?.modelId;

  return (
    <Modal
      open={open}
      onCancel={handleClose}
      width={880}
      centered
      title={
        <span style={{ fontSize: fontSize.displaySm }}>
          选择产品
          <span style={{ fontSize: 12, fontWeight: 400, color: color.mute, marginLeft: 10 }}>
            每对 = 左侧 1 款主分析产品 + 右侧多款对比产品；多对自动分图
          </span>
        </span>
      }
      footer={
        <button
          type="button"
          onClick={handleClose}
          style={{
            height: 30,
            padding: '0 18px',
            borderRadius: radius.control,
            border: '1px solid ' + selectAccent,
            background: selectAccent,
            color: '#fff',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          完成{mains.length ? `（主分析 ${mains.length} · 对比 ${totalCompares}）` : ''}
        </button>
      }
      styles={{ body: { paddingTop: 12 } }}
    >
      {/* 最近组合 */}
      {combos.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: color.mute, flexShrink: 0 }}>最近</span>
          {combos.map((c, i) => (
            <Tooltip key={i} title={c.cards.map((x) => (x.main ? modelNameOf(x.main.modelId) : '对比产品')).join('、')}>
              <span
                onClick={() => {
                  actions.setMains(c.cards.map((x) => ({ ...x, id: newCardId() })));
                }}
                style={{
                  height: 22,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '0 10px',
                  borderRadius: radius.pill,
                  border: `1px solid ${color.hairline}`,
                  background: color.canvas,
                  fontSize: 12,
                  color: color.body,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {c.cards[0].main && <BrandDot brand={brandOfModel(c.cards[0].main.modelId)} />}
                {c.label}
              </span>
            </Tooltip>
          ))}
        </div>
      )}

      {/* 分析对列表（左右排布） */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: PAIR_LIST_MAX_H, overflowY: 'auto', padding: 1 }}>
        {mains.length === 0 && (
          /* 默认新增状态：一对空骨架——左选主品、右可先挂对比 */
          <div
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'stretch',
              padding: 10,
              borderRadius: radius.card,
              border: `1px dashed ${color.hairlineStrong}`,
              background: color.canvas,
            }}
          >
            <div
              style={{
                flex: '0 0 300px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                padding: '10px 12px',
                background: selectSoft,
                border: '1px solid rgba(0, 112, 243, 0.40)',
                borderRadius: radius.control,
                boxSizing: 'border-box',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 600, color: selectSoftInk, letterSpacing: 0.2 }}>主分析产品 · 单选</div>
              <LevelSwitchPopover level="brand" ctx={{ kind: 'add-main' }}>
                <AddPill label="选择主分析产品" big />
              </LevelSwitchPopover>
            </div>
            <AutoMatchButton card={{ id: 'ghost', main: null, compares: [] }} />
            <div
              style={{
                flex: '1 1 0',
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                padding: '10px 12px',
                background: color.canvas,
                border: `1px solid ${color.hairline}`,
                borderRadius: radius.control,
                boxSizing: 'border-box',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 600, color: color.mute }}>对比产品 · 可多选</div>
              <Tooltip title="先挑选对比产品（之后补选主分析产品即配成一对）">
                <span style={{ alignSelf: 'flex-start', display: 'inline-flex' }}>
                  <AddPill
                    label="添加对比产品"
                    onClick={() => {
                      const id = newCardId();
                      actions.setMains([...mains, { id, main: null, compares: [] }]);
                      setAutoOpenCardId(id);
                    }}
                  />
                </span>
              </Tooltip>
            </div>
          </div>
        )}
        {mains.map((card) => {
          const huawei = card.main != null && isHuaweiModel(card.main.modelId);
          return (
            <div
              key={card.id}
              onDragOver={(e) => {
                if (!dragCard || dragCard === card.id) return;
                e.preventDefault();
                setDropCard(card.id);
              }}
              onDragLeave={() => setDropCard((t) => (t === card.id ? null : t))}
              onDrop={(e) => {
                e.preventDefault();
                if (dragCard) moveCard(dragCard, card.id);
                setDragCard(null);
                setDropCard(null);
              }}
              style={{
                position: 'relative',
                display: 'flex',
                gap: 10,
                alignItems: 'stretch',
                padding: '6px 6px 6px 2px',
                borderRadius: radius.card,
                border: `1px solid ${dropCard === card.id ? color.link : color.hairline}`,
                background: color.canvas,
                opacity: dragCard === card.id ? 0.45 : undefined,
                boxShadow: dropCard === card.id ? 'inset 0 0 0 2px rgba(0, 112, 243, 0.35)' : undefined,
              }}
            >
              {/* 拖拽把手（换序 = 分离面板顺序） */}
              <span
                draggable
                onDragStart={(e) => {
                  setDragCard(card.id);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragEnd={() => {
                  setDragCard(null);
                  setDropCard(null);
                }}
                title="拖动调整顺序（= 分离面板顺序）"
                style={{ display: 'inline-flex', alignItems: 'center', cursor: 'grab', color: color.mute, flexShrink: 0 }}
              >
                <HolderOutlined style={{ fontSize: 12 }} />
              </span>

              {/* 左：主分析产品（显著 · 单选感） */}
              <div
                style={{
                  flex: '0 0 300px',
                  minWidth: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  padding: '8px 10px',
                  background: selectSoft,
                  border: '1px solid rgba(0, 112, 243, 0.40)',
                  borderRadius: radius.control,
                  boxSizing: 'border-box',
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 600, color: selectSoftInk, letterSpacing: 0.2 }}>主分析产品 · 单选</div>
                {card.main ? (
                  <MainRow card={card} />
                ) : (
                  <LevelSwitchPopover level="brand" ctx={{ kind: 'set-main', cardId: card.id }}>
                    <AddPill label="选择主分析产品" big />
                  </LevelSwitchPopover>
                )}
              </div>

              {/* 中：分界线 + 自动匹配竞品 */}
              <AutoMatchButton card={card} />

              {/* 右：对比产品（弱 · 多选感） */}
              <div
                style={{
                  flex: '1 1 0',
                  minWidth: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 5,
                  padding: '8px 10px',
                  background: color.canvas,
                  border: `1px solid ${color.hairline}`,
                  borderRadius: radius.control,
                  boxSizing: 'border-box',
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 600, color: color.mute }}>
                  对比产品 · 可多选 <span className="tnum">{card.compares.length}/{cardQuota(card)}</span>
                </div>
                {card.compares.length === 0 && (
                  <div style={{ fontSize: 11.5, color: color.mute, lineHeight: '18px' }}>
                    {card.main == null
                      ? '可先挑选对比产品，补选主分析产品后即配成一对'
                      : huawei
                        ? '点「自动匹配竞品」一键带出，或手动添加'
                        : '该品牌暂不支持自动匹配，请手动添加'}
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto', maxHeight: 122 }}>
                  {card.compares.map((sel) => (
                    <CompareRow key={selKey(sel)} card={card} sel={sel} />
                  ))}
                </div>
                <AddCompareTrigger card={card} autoOpen={autoOpenCardId === card.id} />
              </div>
            </div>
          );
        })}
      </div>

      {/* 全局动作行 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
        <Tooltip title={mains.length >= MAINS_CAP ? `最多 ${MAINS_CAP} 张主分析卡` : undefined}>
          <span style={{ display: 'inline-flex' }}>
            <LevelSwitchPopover level="brand" ctx={{ kind: 'add-main' }} initialModelId={lastModelId}>
              <AddPill label="添加主分析产品" disabled={mains.length >= MAINS_CAP} />
            </LevelSwitchPopover>
          </span>
        </Tooltip>
        <Tooltip title={state.autoMatch ? '对比区随主品配置自动跟随（当前：自动）' : '回到自动：全部华为主品卡按矩阵重算对比区'}>
          <span
            onClick={() => actions.setAutoMatch(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              height: 26,
              padding: '0 12px',
              borderRadius: radius.pill,
              fontSize: 12,
              fontWeight: 600,
              color: selectSoftInk,
              background: selectSoft,
              border: '1px solid rgba(0, 112, 243, 0.40)',
              cursor: 'pointer',
            }}
          >
            <ReloadOutlined style={{ fontSize: 11 }} /> 全部自动匹配
          </span>
        </Tooltip>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 'auto', fontSize: 12, color: color.mute }}>
          <Checkbox checked={state.autoMatch} onChange={(e) => actions.setAutoMatch(e.target.checked)} />
          对比自动跟随主品
          <span style={{ color: color.hairlineStrong }}>｜</span>
          每图最多 {MAX_LINES_PER_CHART} 条产品线
        </span>
      </div>
    </Modal>
  );
}
