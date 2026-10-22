// ============================================================
// 选择产品浮窗（第一百二十二轮修订；第三次迭代基础见 git 史）：
// 主体 = 若干「组」左右排布——左 = 主分析产品（唯一产品+型号+颜色，
//   浅蓝底强调），右 = 对比产品（无外框、条目列表 + 常驻「＋ 添加对比产品」
//   触发）；多组时每组顶部一行「第 N 组 · 配置 · 颜色」卡级标识，同主品
//   不同配置的多组靠它区分。
// 自动匹配 = 纯一次性动作（第一百二十六轮：「对比自动跟随主品」模式退役）：
//   对比区标题行居左「⚡ 自动匹配竞品」按组重算，顶栏「全部自动匹配」按全部
//   华为主品组重算；平时对比区完全由用户持有。
// 产品树不再常驻：唯一更换入口 = 行尾「更换」→ 完整树浮窗（品牌→系列→
//   产品→型号，预定位当前路径，搜索保留）。颜色不进树浮窗：点型号行即按
//   默认最低价色落选，换色只在已选条目的色块（蓝描边 = 可编辑；只读配置
//   chip 无描边）。
// 第一百二十三轮：档位融入树浮窗——搜索行右侧「档位」Select 按配置级档位
//   （tier_by_country，同型号不同配置可跨档）过滤四列树，与搜索叠加；选中
//   档位后树上方提示带给批量动作（主品上下文 = 该档全部我司配置「全部各成
//   一组」；对比上下文 = 该档全部配置「全部加入对比」）——顶部「按档位」
//   主体模式退役后的一键集结落点。浮窗宽度 = 四列自适应宽之和（trailing
//   计入列宽，信息不许截断），上限 min(视口-48, 1100)，超限才横向滚动。
// 主品空缺 = 空组（仅历史数据可能出现；空态不提供先加对比入口）。
// 「全部型号」= 每配置一张卡 / 每配置一条对比（不再并卡）；配额每卡
// 1 主品 + ≤7 对比 = 8 条线在选择时收口，卡数 ≤ 8；即改即存。
// 添加主分析产品 = 最后一个组框向下延长的底边正中的显性大按钮。
// 破坏性动作轻确认：删整组、「最近」恢复覆盖当前已选。
// ============================================================
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Input, Modal, Popconfirm, Popover, Segmented, Select, Tooltip } from 'antd';
import {
  CloseOutlined,
  HolderOutlined,
  PlusOutlined,
  RollbackOutlined,
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
  filterProductTreeByTier,
  modelEntryInfo,
  modelNameOf,
  ownBrand,
  searchProductTree,
  sortModelNodes,
  tiersOfScope,
  type BrandNode,
  type ModelNode,
  type ModelSortMode,
  type RomramNode,
} from '../ProductCascader/tree';
import { autoColumnWidth, CascadePanel, measureText, type CascadeColumnSpec, type CascadeRowItem } from '../ProductCascader';
import ColorFlyout from '../ProductCascader/ColorFlyout';
import BrandDot, { brandLabelOf } from '../BrandMark';
import {
  cardQuota,
  EMPTY_MAIN_LABEL,
  isHuaweiModel,
  MAINS_CAP,
  MAX_LINES_PER_CHART,
  newCardId,
  remapSelection,
  selKey,
  withMain,
} from '../../state/mainSelection';
import { appendTierCards, configsInTier } from '../../state/tierSelection';
import { TIER_LABELS } from '../../dataModel/aggregate';
import { tierLabelShort } from '../../chart/PriceTrend/helpers';
import { LPL } from '../../state/lplKeys';
import { color, fontSize, formatPrice, radius, selectAccent, selectSoft, selectSoftInk } from '../../theme/tokens';

const POPOVER_H = 300; // 树浮窗列高（固定，不随内容跳变）
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

/** 完整内容签名（主品 + 对比区 + 颜色）：「最近」恢复是否会覆盖当前已选的判定依据
 *  （comboSignature 只看主品集合，是最近列表去重口径，不够严） */
function contentSignature(cards: MainProduct[]): string {
  const sel = (s: ProductSelection): string => `${selKey(s)}#${[...s.skuIds].sort().join(',')}`;
  return cards.map((c) => `${c.main ? sel(c.main) : '~'}:${c.compares.map(sel).join('+')}`).join('|');
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
        className="lpl-pk-ghost"
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
          background: color.canvas,
          border: `1px solid ${EDITABLE_BORDER}`,
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

/** 可编辑 chip 的描边（主品/对比条目同一语言；只读配置 chip 无描边） */
const EDITABLE_BORDER = 'rgba(0, 112, 243, 0.30)';

/** 树数据索引（浮窗与条目共用；按国家/产业缓存）。
 *  第一百二十三轮：romramsByModel（全量配置索引）退役——「全部型号」在档位
 *  筛选下 = 该产品在该档位内的配置，取过滤后树节点自带的 romrams。 */
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
  return { fullTree, romramByKey };
}

const usableRomrams = (nodes: RomramNode[]): RomramNode[] =>
  nodes.filter((r) => r.romram !== '—' || nodes.length === 1);

/** 条目只读文字（更换收口后不可点；超长省略号 + title 全称） */
function RowText({
  children,
  strong,
  title,
}: {
  children: ReactNode;
  strong?: boolean;
  title?: string;
}) {
  return (
    <span
      title={title}
      style={{
        display: 'inline-flex',
        minWidth: 0,
        maxWidth: strong ? 240 : 170,
        fontSize: strong ? 14 : 12,
        fontWeight: strong ? 700 : 500,
        color: strong ? color.ink : color.body,
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{children}</span>
    </span>
  );
}

/** 只读配置 chip（无描边；描边 = 可编辑，与颜色 chip 区分） */
function RomramChip({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 20,
        padding: '0 8px',
        borderRadius: radius.pill,
        fontSize: 11,
        fontWeight: 600,
        color: color.body,
        background: 'rgba(0, 0, 0, 0.06)',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      {children}
    </span>
  );
}

/** 虚线触发 pill（「＋ 添加…」家族统一形态） */
function AddPill({ label, onClick, disabled, big }: { label: string; onClick?: () => void; disabled?: boolean; big?: boolean }) {
  return (
    <span
      role="button"
      aria-label={label}
      aria-disabled={disabled || undefined}
      className="lpl-pk-ghost"
      onClick={disabled ? undefined : onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        height: big ? 38 : 22,
        padding: big ? '0 20px' : '0 9px',
        justifyContent: big ? 'center' : undefined,
        borderRadius: radius.pill,
        border: `1px dashed ${disabled ? color.hairline : color.hairlineStrong}`,
        fontSize: big ? 13 : 11,
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
      className="lpl-pk-ghost"
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

function DeleteX({ label, onClick, size = 11 }: { label: string; onClick?: () => void; size?: number }) {
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

/** 「⚡ 自动匹配」一次性动作 pill（中性 ghost；可点/置灰两态） */
function MatchPill({
  label,
  text,
  can,
  tip,
  onClick,
  size = 'sm',
}: {
  label: string;
  text: string;
  can: boolean;
  tip: string;
  onClick: () => void;
  size?: 'sm' | 'md';
}) {
  const md = size === 'md';
  return (
    <Tooltip title={tip}>
      <span
        role="button"
        aria-label={label}
        aria-disabled={!can || undefined}
        className="lpl-pk-ghost"
        onClick={(e) => {
          e.stopPropagation();
          if (can) onClick();
        }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: md ? 5 : 3,
          height: md ? 26 : 20,
          padding: md ? '0 12px' : '0 8px',
          borderRadius: radius.pill,
          fontSize: md ? 12 : 11,
          fontWeight: 600,
          color: can ? color.body : color.mute,
          background: color.canvas,
          border: `1px solid ${color.hairline}`,
          cursor: can ? 'pointer' : 'not-allowed',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        <ThunderboltFilled style={{ fontSize: md ? 11 : 10 }} /> {text}
      </span>
    </Tooltip>
  );
}

/** 当前/已选 灰标（树浮窗叶行尾） */
function StateTag({ text }: { text: string }) {
  return (
    <span style={{ fontSize: 10, color: color.mute, flexShrink: 0, whiteSpace: 'nowrap' }}>{text}</span>
  );
}

// ---------------- 更换树浮窗（完整树：唯一更换入口） ----------------

/** 13px 基准测量 → 实际字号折算（行尾内容宽度预留用） */
const textW = (s: string, px: number): number => measureText(s) * (px / 13);
/** 行尾小 pill 宽（文本 + padding 0 8px + 边框 2px） */
const pillW = (s: string, px: number): number => textW(s, px) + 18;
const ROW_GAP = 8; // 级联行内 label ↔ 行尾间距（space.sm）

/** 档位批量动作 pill（浅蓝描边 ghost，与「＋ 全部型号」同语言） */
function TierBatchPill({ text, disabled, onClick }: { text: string; disabled?: boolean; onClick?: () => void }) {
  return (
    <span
      role="button"
      aria-label={text}
      aria-disabled={disabled || undefined}
      className="lpl-pk-ghost"
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onClick?.();
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        height: 20,
        padding: '0 8px',
        borderRadius: radius.pill,
        fontSize: 11,
        color: disabled ? color.mute : selectSoftInk,
        background: color.canvas,
        border: '1px solid rgba(0, 112, 243, 0.40)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      <PlusOutlined style={{ fontSize: 9 }} /> {text}
    </span>
  );
}

/** 完整树浮窗：品牌→系列→产品→型号四列，预定位当前条目路径；
 *  主品上下文选完型号落地关窗；对比上下文连点不关。
 *  第一百二十三轮：①搜索行右侧「档位」Select——按配置级档位
 *  （tier_by_country，同型号不同配置可跨档）过滤四列树，与搜索叠加，
 *  关窗回「全部档位」；②选中档位后树上方批量动作带（主品上下文 =
 *  该档全部我司配置「全部各成一组」；对比上下文 = 该档全部配置
 *  「全部加入对比」）；③浮窗宽 = 四列自适应宽之和（行尾计入列宽），
 *  上限 min(视口-48, 1100)，超限面板内横向滚动。 */
function LevelSwitchPopover({
  ctx,
  initialModelId,
  openSignal,
  children,
}: {
  ctx: PickerCtx;
  initialModelId?: string;
  openSignal?: boolean;
  children: ReactNode;
}) {
  const { state, actions } = useFilters();
  const mains = state.mains;
  const currency = state.currency;
  const { fullTree, romramByKey } = useTreeData();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [tier, setTier] = useState<string | null>(null); // null = 全部档位；关窗即回默认
  const [modelSort, setModelSort] = useState<ModelSortMode>('default'); // 型号列排序

  useEffect(() => {
    if (openSignal) setOpen(true);
  }, [openSignal]);

  // 档位过滤（配置级）与树内搜索叠加：先档位剪枝、再按关键词命中
  const scopedTree = useMemo(
    () => (tier ? filterProductTreeByTier(fullTree, tier, state.countryCode) : fullTree),
    [fullTree, tier, state.countryCode],
  );
  const tree = useMemo(() => searchProductTree(scopedTree, search), [scopedTree, search]);

  // 打开/搜索/换档位时定位：优先当前条目的型号路径，否则首个结果
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
    setPath(locate(tree));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, search, tier]);

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
      actions.setMains(mains.map((c) => (c.id === card.id ? withMain(c, sel) : c)));
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

  /** 「全部型号」：主品上下文 = 每配置一张卡；对比上下文 = 每配置一条对比。
   *  第一百二十三轮：入参改过滤后的型号节点——档位筛选下 = 该产品在该档位
   *  内的全部配置（「＋ 全部型号」语义随筛选收窄）。 */
  const pickAllConfigs = (m: ModelNode): void => {
    const sels = usableRomrams(m.romrams).map(
      (r): ProductSelection => ({ modelId: m.modelId, romram: r.romram, skuIds: defaultColorSkuIds(r) }),
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
    // 第一百二十五轮（K2）：批量落卡不再静默丢弃当前卡对比区——对齐单点路径
    // pickConfig→withMain 的沿用口径：首张新卡继承（剔同 selKey、截配额），
    // 其余新卡保持空、由 setMains 的自动匹配按需补。
    if ((ctx.kind === 'set-main' || ctx.kind === 'replace-main') && activeCard?.compares.length) {
      const first = cards[0];
      cards[0] = {
        ...first,
        compares: activeCard.compares.filter((c) => selKey(c) !== selKey(first.main!)).slice(0, cardQuota(first)),
      };
    }
    actions.setMains([...list, ...cards]);
    setOpen(false);
  };

  // ---- 档位批量动作（第一百二十三轮：替代原「按档位」模式的一键集结） ----

  const tierOptions = useMemo(
    () => tiersOfScope(state.industry, state.countryCode).map((t) => ({
      value: t,
      label: tierLabelShort(TIER_LABELS[t] ?? t),
    })),
    [state.industry, state.countryCode],
  );
  const tierOwnConfigs = useMemo(
    () => (tier ? configsInTier(state.industry, tier, state.countryCode, true) : []),
    [tier, state.industry, state.countryCode],
  );
  const tierAllConfigs = useMemo(
    () => (tier ? configsInTier(state.industry, tier, state.countryCode) : []),
    [tier, state.industry, state.countryCode],
  );
  // 更换主品（replace-main）同属主品语义：批量动作 = 该档逐配置建组（追加不动当前卡），
  // 不能落对比分支——那会把整档配置塞进本卡对比区（IAB 冒烟发现）
  const tierBatchCtx = ctx.kind === 'add-main' || ctx.kind === 'set-main' || ctx.kind === 'replace-main';

  /** 主品上下文：该档全部我司配置逐配置成组（矩阵补对比区；封顶/去重在纯函数收口） */
  const tierGroupAll = (): void => {
    if (!tier) return;
    const base = ctx.kind === 'set-main' && activeCard ? mains.filter((c) => c.id !== activeCard.id) : mains;
    let next = appendTierCards(state.industry, tier, state.countryCode, base);
    if (next === base) return;
    // 第一百二十五轮（K2）：set-main 批量成组不再丢弃空对先挂的对比区——不改
    // appendTierCards（返回 base+新卡、对比区按矩阵填），在此对结果后处理：首张
    // 新卡若未带对比区则沿用被移除空对的（剔同 selKey、截配额）；已被矩阵填好
    // 则不覆盖。replace-main 分支本就追加不动当前卡，无需处理。
    if (ctx.kind === 'set-main' && activeCard?.compares.length) {
      const inherit = activeCard.compares;
      const baseIds = new Set(base.map((c) => c.id));
      const firstNew = next.find((c) => !baseIds.has(c.id));
      if (firstNew && !firstNew.compares.length) {
        next = next.map((c) =>
          c === firstNew
            ? { ...c, compares: inherit.filter((x) => selKey(x) !== selKey(c.main!)).slice(0, cardQuota(c)) }
            : c,
        );
      }
    }
    actions.setMains(next);
    setOpen(false);
  };

  /** 对比上下文：该档全部配置加入对比区（本卡配额封顶、与主品同型号跳过、连点不关） */
  const tierCompareAll = (): void => {
    const card = activeCard;
    if (!card || !tier) return;
    const base = replaceCompareCtx ? card.compares.filter((c) => c !== ctx.sel) : card.compares;
    const seen = new Set(base.map(selKey));
    const added = [...base];
    for (const sel of tierAllConfigs) {
      if (card.main?.modelId === sel.modelId) continue;
      const k = selKey(sel);
      if (seen.has(k)) continue;
      if (added.length >= cardQuota(card)) break;
      seen.add(k);
      added.push(sel);
    }
    actions.setCardCompares(card.id, added);
    if (replaceCompareCtx) setOpen(false);
  };

  /** 型号行尾「档位缩写 · 现价」灰字（现价 = 入门配置默认色最新价，币种随筛选）；
   *  首末档的「入门 · 」「旗舰 · 」前缀只在档位下拉里保留，行尾去掉以免与现价的 · 连成三段 */
  const modelTagText = (m: ModelNode): string => {
    const { tierCode, price } = modelEntryInfo(m, currency);
    const tier = tierCode ? tierLabelShort((TIER_LABELS[tierCode] ?? tierCode).replace(/^(入门|旗舰) · /, '')) : '';
    const priceText = price != null ? formatPrice(Math.round(price), currency) : '';
    return [tier, priceText].filter(Boolean).join(' · ');
  };

  const columns: CascadeColumnSpec[] = useMemo(() => {
    if (!brand || !series) return [];
    const brandItems: CascadeRowItem[] = tree.map((b) => ({
      key: b.key,
      label: brandLabelOf(b.key),
      leading: <BrandDot brand={b.key} />,
      active: brand.key === b.key,
      onActivate: () => {
        const s = b.series[0];
        setPath([b.key, s?.key ?? '', s?.models[0]?.modelId ?? '']);
      },
      trailing: <span style={{ fontSize: 10, color: color.mute, flexShrink: 0 }}>{b.modelCount} 型号</span>,
    }));
    const seriesItems: CascadeRowItem[] = (brand?.series ?? []).map((s) => ({
      key: s.key,
      label: s.title,
      active: series?.key === s.key,
      onActivate: () => setPath([brand.key, s.key, s.models[0]?.modelId ?? '']),
      trailing: s.eol ? (
        <span style={{ fontSize: 10, color: color.mute, border: `1px solid ${color.hairline}`, borderRadius: radius.pill, padding: '0 6px', lineHeight: '16px', flexShrink: 0 }}>退市</span>
      ) : undefined,
    }));
    const sortedModels = sortModelNodes(series?.models ?? [], modelSort, currency);
    const modelItems: CascadeRowItem[] = sortedModels.map((m) => {
      const tag = modelTagText(m);
      return {
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
                  pickAllConfigs(m);
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
            {tag && <span className="tnum" style={{ fontSize: 10, color: color.mute, flexShrink: 0, whiteSpace: 'nowrap' }}>{tag}</span>}
          </span>
        ),
      };
    });
    const romramItems: CascadeRowItem[] = (model?.romrams ?? []).map((r) => {
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
          // 第一百二十五轮（K3）：复选框补成真控件（此前缺 onCheckChange，点了没反应）——
          // 勾 = 已在对比区；disabled 只拦「未选中时加」，已选中仍可点掉。
          checkState: inCompares ? 'checked' : 'none',
          onCheckChange: () => {
            if (inCompares || !disabled) toggleCompare(r);
          },
          onLabelClick: () => toggleCompare(r),
          trailing: (
            <Tooltip
              title={
                sameAsMain && !inCompares
                  ? '主分析产品不对比自身配置'
                  : quotaFull && !inCompares
                    ? `每张图最多 ${MAX_LINES_PER_CHART} 条线（含主分析产品）`
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
                  color: disabled ? color.mute : selectSoftInk,
                  background: selectSoft,
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
      // 第一百二十五轮（K3）：主品选择为单选语义，不渲染复选框（此前是点了
      // 没反应的摆设）；列宽的 24px 复选框预留随 checkState 缺省自动收窄。
      return {
        key: r.key,
        label: r.romram,
        onLabelClick: () => {
          if (!blocked) pickConfig(r);
        },
        trailing: isCurrent ? <StateTag text="当前" /> : taken ? <StateTag text="已选" /> : undefined,
      } satisfies CascadeRowItem;
    });

    // 行尾内容宽度预留（第一百二十三轮：列宽必须容纳 label + 行尾，四列信息完整
    // 可见、无省略号）——按各列行尾实际文案折算，autoColumnWidth 计入 chrome
    const brandExtra = tree.reduce((w, b) => Math.max(w, textW(`${b.modelCount} 型号`, 10)), 0) + ROW_GAP;
    const eolPillW = textW('退市', 10) + 8; // 文本 + padding 0 6px + 边框 2px
    const seriesExtra = (brand?.series ?? []).some((s) => s.eol) ? eolPillW + ROW_GAP : 0;
    const allCfgPillW = pillW('全部型号', 11) + 12; // ＋ 图标 9 + 内间隙 3
    const modelTagW = (series?.models ?? []).reduce((w, m) => Math.max(w, textW(modelTagText(m), 10)), 0);
    const modelExtra = ((series?.models ?? []).some((m) => m.eol) ? eolPillW + 6 : 0)
      + allCfgPillW + 6 + modelTagW + ROW_GAP;
    const romramExtra = (comparesCtx
      ? pillW('✓ 对比', 11)
      : Math.max(textW('当前', 10), textW('已选', 10))) + ROW_GAP;

    return [
      { items: brandItems, width: autoColumnWidth(brandItems, { extraW: brandExtra, noMaxClip: true }) },
      { items: seriesItems, width: autoColumnWidth(seriesItems, { extraW: seriesExtra, noMaxClip: true }) },
      { items: modelItems, width: autoColumnWidth(modelItems, { extraW: modelExtra, noMaxClip: true }) },
      { items: romramItems, width: autoColumnWidth(romramItems, { extraW: romramExtra, noMaxClip: true }) },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, brand, series, model, ctx, mains, activeCard, modelSort, currency]);

  // 浮窗宽 = 四列自适应宽之和 + 内边距（搜索/档位筛选改变列内容时随之变化）；
  // 上限 = min(视口 - 48, 1100)，超限由面板内横向滚动兜底
  const panelW = columns.reduce((w, c) => w + (c.width ?? 0), 0);
  const widthCap = Math.min(typeof window === 'undefined' ? 1148 : window.innerWidth - 48, 1100);
  const bodyW = Math.max(360, Math.min(panelW + 20, widthCap));
  // set-main 的空组卡在批量动作中会被移除，封顶判定按移除后的基数算
  const tierBase = ctx.kind === 'set-main' && activeCard ? mains.filter((c) => c.id !== activeCard.id) : mains;
  const tierGroupDisabled = tierBase.length >= MAINS_CAP || tierOwnConfigs.length === 0;
  const tierCompareDisabled = !activeCard || (activeCard.compares.length >= cardQuota(activeCard) && !replaceCompareCtx);

  return (
    <Popover
      trigger="click"
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        setSearch('');
        if (!o) setTier(null); // 关窗档位筛选回「全部档位」
      }}
      placement="bottomLeft"
      styles={{ body: { padding: 10, width: bodyW } }}
      content={
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Input
              allowClear
              size="small"
              prefix={<SearchOutlined style={{ color: color.mute }} />}
              placeholder="搜索品牌 / 系列 / 产品"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ flex: 1, minWidth: 0 }}
            />
            <Select
              size="small"
              aria-label="价格档位"
              value={tier ?? ''}
              onChange={(v) => setTier(v === '' ? null : v)}
              style={{ width: 138, flexShrink: 0 }}
              popupMatchSelectWidth={false}
              options={[{ value: '', label: '全部档位' }, ...tierOptions]}
            />
            <Segmented
              size="small"
              aria-label="型号排序"
              value={modelSort}
              onChange={(v) => setModelSort(v as ModelSortMode)}
              options={[
                { label: '默认', value: 'default' },
                { label: '价格', value: 'price' },
                { label: '名称', value: 'name' },
              ]}
            />
          </div>
          {tier && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 8,
                padding: '4px 10px',
                borderRadius: radius.control,
                background: selectSoft,
                fontSize: 12,
                color: selectSoftInk,
                whiteSpace: 'nowrap',
              }}
            >
              <span className="tnum">
                {tierBatchCtx
                  ? `该档位 ${brandLabelOf(ownBrand())} 共 ${tierOwnConfigs.length} 个配置`
                  : `该档位共 ${tierAllConfigs.length} 个配置`}
              </span>
              {tierBatchCtx ? (
                <Tooltip title={tierGroupDisabled ? `最多 ${MAINS_CAP} 组` : '该档位全部配置逐配置成组，各按对标矩阵带出对比区'}>
                  <TierBatchPill text="全部各成一组" disabled={tierGroupDisabled} onClick={tierGroupAll} />
                </Tooltip>
              ) : (
                <Tooltip title={tierCompareDisabled ? `每张图最多 ${MAX_LINES_PER_CHART} 条线（含主分析产品）` : '该档位全部配置加入本组对比区'}>
                  <TierBatchPill text="全部加入对比" disabled={tierCompareDisabled} onClick={tierCompareAll} />
                </Tooltip>
              )}
            </div>
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
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minWidth: 0 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0, minWidth: 0 }}>
        <BrandDot brand={brand} />
        <RowText title={brandLabelOf(brand)}>{brandLabelOf(brand)}</RowText>
      </span>
      <RowText strong title={`${brandLabelOf(brand)} ${modelNameOf(main.modelId)} ${main.romram}`}>
        {modelNameOf(main.modelId)}
      </RowText>
      <RomramChip>{main.romram}</RomramChip>
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
        <LevelSwitchPopover ctx={{ kind: 'replace-main', cardId: card.id }} initialModelId={main.modelId}>
          <SwapPill label={`更换主分析产品 ${modelNameOf(main.modelId)}`} />
        </LevelSwitchPopover>
        <Popconfirm
          title="删除该组？"
          description="组内对比产品一并移除"
          okText="删除"
          cancelText="取消"
          okButtonProps={{ danger: true, size: 'small' }}
          cancelButtonProps={{ size: 'small' }}
          onConfirm={() => actions.setMains(mains.filter((c) => c.id !== card.id))}
        >
          <span style={{ display: 'inline-flex' }}>
            <DeleteX label={`删除该组 ${modelNameOf(main.modelId)}`} />
          </span>
        </Popconfirm>
      </span>
    </div>
  );
}

function CompareRow({ card, sel }: { card: MainProduct; sel: ProductSelection }) {
  const { state, actions } = useFilters();
  const { romramByKey } = useTreeData();
  const node = romramByKey.get(`${sel.modelId}|${sel.romram}`);
  const brand = brandOfModel(sel.modelId);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 6px 2px 8px',
        background: color.canvasSoft,
        borderRadius: radius.control,
        minWidth: 0,
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0, minWidth: 0 }}>
        <BrandDot brand={brand} />
        <RowText title={brandLabelOf(brand)}>{brandLabelOf(brand)}</RowText>
      </span>
      <RowText title={`${brandLabelOf(brand)} ${modelNameOf(sel.modelId)} ${sel.romram}`}>
        {modelNameOf(sel.modelId)}
      </RowText>
      <RomramChip>{sel.romram}</RomramChip>
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
        <LevelSwitchPopover ctx={{ kind: 'replace-compare', cardId: card.id, sel }} initialModelId={sel.modelId}>
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

/** 组顶标识（多组时显示）：左「第 N 组」，右 = 主品配置·颜色（同主品多组的差异提到卡级） */
function CardTag({ card, index }: { card: MainProduct; index: number }) {
  const { romramByKey } = useTreeData();
  const node = card.main ? romramByKey.get(`${card.main.modelId}|${card.main.romram}`) : undefined;
  const colorLabel = card.main ? colorLabelOf(node, card.main.skuIds) : '';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px 0 34px',
        fontSize: 11,
        color: color.mute,
      }}
    >
      <span>第 {index + 1} 组</span>
      <span className="tnum">{card.main ? `${card.main.romram}${colorLabel ? ` · ${colorLabel}` : ''}` : EMPTY_MAIN_LABEL}</span>
    </div>
  );
}

/** 对比区标题行居左「⚡ 自动匹配竞品」：一次性按矩阵重算本组对比区（仅华为主品可点） */
function AutoMatchInline({ card }: { card: MainProduct }) {
  const { actions } = useFilters();
  const huawei = card.main != null && isHuaweiModel(card.main.modelId);
  const tip =
    card.main == null
      ? '先选择主分析产品'
      : huawei
        ? '按对标矩阵重算本组对比区'
        : '自动匹配基于对标矩阵，仅支持华为产品；请手动添加';
  return (
    <MatchPill
      label={`自动匹配竞品${card.main ? ` ${modelNameOf(card.main.modelId)}` : ''}`}
      text="自动匹配竞品"
      can={huawei}
      tip={tip}
      onClick={() => actions.autoMatchCard(card.id)}
    />
  );
}

/** 对比区常驻「＋ 添加对比产品」（点开完整树浮窗连点加） */
function AddCompareTrigger({ card }: { card: MainProduct }) {
  const quota = cardQuota(card);
  const full = card.compares.length >= quota;
  return (
    <Tooltip title={full ? `每张图最多 ${MAX_LINES_PER_CHART} 条线（含主分析产品）` : '挑选对比产品（可连续添加）'}>
      <span style={{ alignSelf: 'flex-start', display: 'inline-flex' }}>
        <LevelSwitchPopover ctx={{ kind: 'compares', cardId: card.id }} initialModelId={card.main?.modelId}>
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
    // 第一百二十五轮（K4）：全空内容（只有空对卡、无主品无对比）不进「最近」——
    // 签名互相碰撞且无恢复价值
    if (!mains.some((c) => c.main || c.compares.length)) return;
    // 组合名按去重后的主品型号表述：同型号多组不带「等」（等 = 还有其他型号）
    const names = [...new Set(mains.map((c) => (c.main ? modelNameOf(c.main.modelId) : '对比产品')))];
    const label =
      names.length === 1
        ? mains.length === 1
          ? names[0]
          : `${names[0]} · ${mains.length} 组`
        : names.length === 2
          ? names.join('、')
          : `${names[0]} 等 ${names.length} 款`;
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
  const huaweiCards = mains.filter((c) => c.main != null && isHuaweiModel(c.main.modelId));
  const currentSig = contentSignature(mains);

  /** 「最近」恢复：覆盖当前已选内容（当前为空或与该组合相同时直接套用，否则轻确认） */
  const applyCombo = (c: StoredCombo): void => {
    actions.setMains(c.cards.map((x) => ({ ...x, id: newCardId() })));
  };

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
            每组生成一张图：左侧主分析产品，右侧对比产品
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
      {/* 顶栏：「最近」组合（可点恢复；覆盖非空且不同的当前已选时轻确认）
          + 全局「全部自动匹配」（显眼位，与最近齐平） */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap', minHeight: 26 }}>
        {combos.length > 0 && (
          <>
            <span style={{ fontSize: 12, color: color.mute, flexShrink: 0 }}>最近</span>
          {combos.map((c, i) => {
            const needConfirm = mains.length > 0 && contentSignature(c.cards) !== currentSig;
            const summary = c.cards.map((x) => (x.main ? `${modelNameOf(x.main.modelId)} ${x.main.romram}` : '对比产品')).join('、');
            const chip = (
              <span
                role="button"
                aria-label={`恢复组合 ${c.label}`}
                title={`恢复：${summary}`}
                className="lpl-pk-ghost"
                onClick={needConfirm ? undefined : () => applyCombo(c)}
                style={{
                  height: 22,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '0 9px 0 10px',
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
                <RollbackOutlined style={{ fontSize: 10, color: color.mute }} />
              </span>
            );
            return needConfirm ? (
              <Popconfirm
                key={i}
                title="恢复该组合？"
                description="将替换当前已选的全部内容"
                okText="恢复"
                cancelText="取消"
                okButtonProps={{ size: 'small' }}
                cancelButtonProps={{ size: 'small' }}
                onConfirm={() => applyCombo(c)}
              >
                {chip}
              </Popconfirm>
            ) : (
              <span key={i} style={{ display: 'inline-flex' }}>
                {chip}
              </span>
            );
          })}
          </>
        )}
        <span style={{ marginLeft: 'auto' }}>
          <MatchPill
            label="全部自动匹配"
            text="全部自动匹配"
            size="md"
            can={huaweiCards.length > 0}
            tip={huaweiCards.length === 0 ? '自动匹配基于对标矩阵，仅支持华为产品' : '按对标矩阵重算全部华为主品组的对比区'}
            onClick={() => actions.autoMatchAll()}
          />
        </span>
      </div>

      {/* 分析对列表（左右排布） */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: PAIR_LIST_MAX_H, overflowY: 'auto', padding: 1 }}>
        {mains.length === 0 && (
          /* 默认新增状态：整幅大框正中一个「选择主分析产品」（不提供先加对比入口）；
             左浅蓝区预示主品落位（背景层，不参与布局） */
          <div
            style={{
              position: 'relative',
              borderRadius: radius.card,
              border: `1px dashed ${color.hairlineStrong}`,
              background: color.canvas,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: 0,
                width: 300,
                background: selectSoft,
                borderRight: '1px solid rgba(0, 112, 243, 0.40)',
              }}
            />
            <div style={{ position: 'relative', minHeight: 180, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <LevelSwitchPopover ctx={{ kind: 'add-main' }}>
                <AddPill label="选择主分析产品" big />
              </LevelSwitchPopover>
            </div>
          </div>
        )}
        {mains.map((card, idx) => {
          const huawei = card.main != null && isHuaweiModel(card.main.modelId);
          const isLast = idx === mains.length - 1;
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
                flexDirection: 'column',
                gap: 4,
                padding: '6px 6px 6px 2px',
                // 最后一个组向下延长放「添加主分析产品」：底边直角与延长带衔接
                borderRadius: isLast ? `${radius.card}px ${radius.card}px 0 0` : radius.card,
                border: `1px solid ${dropCard === card.id ? color.link : color.hairline}`,
                background: color.canvas,
                opacity: dragCard === card.id ? 0.45 : undefined,
                boxShadow: dropCard === card.id ? 'inset 0 0 0 2px rgba(0, 112, 243, 0.35)' : undefined,
              }}
            >
              {mains.length > 1 && <CardTag card={card} index={idx} />}
              <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
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
                title="拖动调整顺序"
                style={{ display: 'inline-flex', alignItems: 'center', cursor: 'grab', color: color.mute, flexShrink: 0 }}
              >
                <HolderOutlined style={{ fontSize: 12 }} />
              </span>

              {/* 左：主分析产品（显著） */}
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
                <div style={{ fontSize: 11, fontWeight: 600, color: selectSoftInk, letterSpacing: 0.2 }}>主分析产品</div>
                {/* 第一百二十五轮（K1）：空对卡补删除入口——MainRow 在 main 为空时返回
                    null，组内此前无任何删法，误建空卡永久占位；✕ 与 MainRow 行尾同款同位 */}
                {card.main ? (
                  <MainRow card={card} />
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <LevelSwitchPopover ctx={{ kind: 'set-main', cardId: card.id }}>
                      <AddPill label="选择主分析产品" big />
                    </LevelSwitchPopover>
                    <Popconfirm
                      title="删除该组？"
                      description="组内对比产品一并移除"
                      okText="删除"
                      cancelText="取消"
                      okButtonProps={{ danger: true, size: 'small' }}
                      cancelButtonProps={{ size: 'small' }}
                      onConfirm={() => actions.setMains(mains.filter((c) => c.id !== card.id))}
                    >
                      <span style={{ marginLeft: 'auto', display: 'inline-flex' }}>
                        <DeleteX label="删除该组" />
                      </span>
                    </Popconfirm>
                  </div>
                )}
              </div>

              {/* 右：对比产品（弱；无外框，条目行自成骨架） */}
              <div
                style={{
                  flex: '1 1 0',
                  minWidth: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 5,
                  padding: '8px 10px',
                  boxSizing: 'border-box',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AutoMatchInline card={card} />
                  <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: color.mute }}>
                    对比产品 <span className="tnum">{card.compares.length}/{cardQuota(card)}</span> 条
                  </span>
                </div>
                {card.compares.length === 0 && (
                  <div style={{ fontSize: 11, color: color.mute, lineHeight: '18px' }}>
                    {card.main == null
                      ? '可先挑选对比产品，补选主分析产品后即成一组'
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
                <AddCompareTrigger card={card} />
              </div>
              </div>
            </div>
          );
        })}
        {/* 第一百二十六轮：添加主分析产品 = 最后一个组框向下延长的底边正中（显性化） */}
        {mains.length > 0 && (
          <div
            style={{
              marginTop: -10,
              border: `1px solid ${color.hairline}`,
              borderTop: 'none',
              borderRadius: `0 0 ${radius.card}px ${radius.card}px`,
              padding: '12px 0',
              display: 'flex',
              justifyContent: 'center',
              background: color.canvas,
            }}
          >
            <Tooltip title={mains.length >= MAINS_CAP ? `最多 ${MAINS_CAP} 组` : '再选一款主分析产品，多组自动分图'}>
              <span style={{ display: 'inline-flex' }}>
                <LevelSwitchPopover ctx={{ kind: 'add-main' }} initialModelId={lastModelId}>
                  <AddPill label="添加主分析产品" big disabled={mains.length >= MAINS_CAP} />
                </LevelSwitchPopover>
              </span>
            </Tooltip>
          </div>
        )}
      </div>
    </Modal>
  );
}
