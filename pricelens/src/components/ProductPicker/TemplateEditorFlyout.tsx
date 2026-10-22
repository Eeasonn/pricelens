// ============================================================
// 模板编辑浮窗（第一百三十一轮）：模板 chip /「更多」下拉 ✎ 进入的二级浮层。
// 固定定位层（zIndex 1550，高于选择浮窗面板 1500、低于内部弹层 1600/1650），
// 视觉语言与「选择产品」浮窗一致：一张产品对一个整框——主分析产品（左，
// 极浅蓝底）+ 竖分界线 + 对比产品（右）。
// 支持改模板名、逐对换主品/改配置、增删对比产品、删除整对、新增一对、
// 删除模板（轻确认）。改动即存：每次编辑立即经 onPatch 写回
// LPL3.ui.mainCombos 原位置。外点关闭（白名单 = 本浮层、选择浮窗面板、
// 各级弹层），点选择浮窗面板只关本浮层不关主浮窗。
// ============================================================
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Input, Popconfirm, Popover, Tooltip } from 'antd';
import { DeleteOutlined, SearchOutlined } from '@ant-design/icons';
import { autoColumnWidth, CascadePanel, type CascadeColumnSpec, type CascadeRowItem } from '../ProductCascader';
import {
  defaultColorSkuIds,
  searchProductTree,
  type BrandNode,
  type ModelNode,
  type RomramNode,
} from '../ProductCascader';
import BrandDot, { brandLabelOf } from '../BrandMark';
import { useFilters } from '../../state/FiltersContext';
import type { MainProduct, ProductSelection } from '../../state/filtersTypes';
import { cardQuota, MAX_LINES_PER_CHART, MAINS_CAP, newCardId, remapSelection, selKey } from '../../state/mainSelection';
import { color, radius, selectAccent, selectSoft, selectSoftInk } from '../../theme/tokens';
import {
  AddPill,
  CardTag,
  ColorChip,
  DeleteX,
  GroupDeleteX,
  POPOVER_H,
  POPOVER_Z,
  RomramChip,
  RowText,
  StateTag,
  SwapPill,
  TIP_Z,
  EDITOR_Z,
  PAIR_LIST_MAX_H,
  mainTitleOf,
  pillW,
  textW,
  useTreeData,
  ROW_GAP,
} from './pickerBits';
import { defaultTemplateName, type StoredCombo } from './combos';

/** 编辑浮窗内的选品上下文（main/replace-compare 选完关窗；compare 连点不关） */
type EditorPickCtx =
  | { kind: 'main'; cardId: string }
  | { kind: 'compare'; cardId: string }
  | { kind: 'replace-compare'; cardId: string; sel: ProductSelection }
  | { kind: 'new' };

const rowKey = (r: RomramNode): string => `${r.modelId}|${r.romram.replace(/\s+/g, '')}`;

// ---------------- 选品树浮窗（品牌→系列→产品→配置四列，轻量版） ----------------

/** 模板编辑用的选品树：与主浮窗的更换树同一视觉语言（无档位筛选/排序/批量动作）。
 *  main/new/replace-compare 上下文选完关窗；compare 上下文连点增删不关。 */
function PickPopover({
  ctx,
  currentKey,
  blockedKeys,
  checkedKeys,
  quotaFull,
  mainSelKey,
  initialModelId,
  onPick,
  keepOpen,
  children,
}: {
  ctx: EditorPickCtx;
  /** 当前/被替换条目（叶行「当前」标识） */
  currentKey?: string;
  /** 不可选（他卡主品等，叶行「已选」标识并拦点） */
  blockedKeys?: Set<string>;
  /** 对比区已有（compare 上下文勾选态） */
  checkedKeys?: Set<string>;
  /** compare 上下文配额满（未勾选行拦点） */
  quotaFull?: boolean;
  /** 本卡主品（compare 上下文不可与主品重复占线） */
  mainSelKey?: string;
  initialModelId?: string;
  onPick: (r: RomramNode) => void;
  keepOpen?: boolean;
  children: ReactNode;
}) {
  const { fullTree } = useTreeData();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const tree = useMemo(() => searchProductTree(fullTree, search), [fullTree, search]);

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
    setPath(locate(tree));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, search]);

  const brand = tree.find((b) => b.key === path?.[0]) ?? tree[0];
  const series = brand?.series.find((s) => s.key === path?.[1]) ?? brand?.series[0];
  const model = series?.models.find((m) => m.modelId === path?.[2]) ?? series?.models[0];
  const compareCtx = ctx.kind === 'compare';

  const pick = (r: RomramNode): void => {
    const k = rowKey(r);
    if (currentKey === k) return;
    if (blockedKeys?.has(k)) return;
    if (compareCtx) {
      const checked = checkedKeys?.has(k) ?? false;
      if (!checked && (quotaFull || mainSelKey === k)) return;
    }
    onPick(r);
    if (!keepOpen) setOpen(false);
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
    const modelItems: CascadeRowItem[] = (series?.models ?? []).map((m: ModelNode) => ({
      key: m.modelId,
      label: m.label,
      leading: <BrandDot brand={m.brand} />,
      active: model?.modelId === m.modelId,
      onActivate: () => setPath([brand.key, series.key, m.modelId]),
      trailing: m.eol ? (
        <span style={{ fontSize: 10, color: color.mute, border: `1px solid ${color.hairline}`, borderRadius: radius.pill, padding: '0 6px', lineHeight: '16px', flexShrink: 0 }}>退市</span>
      ) : undefined,
    }));
    const romramItems: CascadeRowItem[] = (model?.romrams ?? []).map((r) => {
      const k = rowKey(r);
      if (compareCtx) {
        const checked = checkedKeys?.has(k) ?? false;
        const sameAsMain = mainSelKey === k;
        const full = quotaFull && !checked;
        const disabled = !checked && (sameAsMain || full);
        return {
          key: r.key,
          label: r.romram,
          checkState: checked ? 'checked' : 'none',
          onCheckChange: () => {
            if (checked || !disabled) pick(r);
          },
          onLabelClick: () => pick(r),
          trailing: (
            <Tooltip
              zIndex={TIP_Z}
              title={
                sameAsMain && !checked
                  ? '主分析产品不对比自身配置'
                  : full
                    ? `每张图最多 ${MAX_LINES_PER_CHART} 条线（含主分析产品）`
                    : checked
                      ? '移除该对比'
                      : '加入对比区'
              }
            >
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  if (!disabled) pick(r);
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
                  border: `1px solid ${checked ? selectAccent : 'rgba(0, 112, 243, 0.40)'}`,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: disabled ? 0.5 : 1,
                  flexShrink: 0,
                }}
              >
                {checked ? '✓ 对比' : '＋对比'}
              </span>
            </Tooltip>
          ),
        } satisfies CascadeRowItem;
      }
      const isCurrent = currentKey === k;
      const blocked = blockedKeys?.has(k) ?? false;
      return {
        key: r.key,
        label: r.romram,
        onLabelClick: () => {
          if (!isCurrent && !blocked) pick(r);
        },
        trailing: isCurrent ? <StateTag text="当前" /> : blocked ? <StateTag text="已选" /> : undefined,
      } satisfies CascadeRowItem;
    });

    // 行尾内容宽度预留（与主浮窗同口径：列宽容纳 label + 行尾，无省略号）
    const brandExtra = tree.reduce((w, b) => Math.max(w, textW(`${b.modelCount} 型号`, 10)), 0) + ROW_GAP;
    const eolPillW = textW('退市', 10) + 8;
    const seriesExtra = (brand?.series ?? []).some((s) => s.eol) ? eolPillW + ROW_GAP : 0;
    const modelExtra = (series?.models ?? []).some((m) => m.eol) ? eolPillW + ROW_GAP : 0;
    const romramExtra = (compareCtx ? pillW('✓ 对比', 11) : Math.max(textW('当前', 10), textW('已选', 10))) + ROW_GAP;

    return [
      { items: brandItems, width: autoColumnWidth(brandItems, { extraW: brandExtra, noMaxClip: true }) },
      { items: seriesItems, width: autoColumnWidth(seriesItems, { extraW: seriesExtra, noMaxClip: true }) },
      { items: modelItems, width: autoColumnWidth(modelItems, { extraW: modelExtra, noMaxClip: true }) },
      { items: romramItems, width: autoColumnWidth(romramItems, { extraW: romramExtra, noMaxClip: true }) },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, brand, series, model, ctx, checkedKeys, blockedKeys, quotaFull, mainSelKey, currentKey]);

  const panelW = columns.reduce((w, c) => w + (c.width ?? 0), 0);
  const widthCap = Math.min(typeof window === 'undefined' ? 1148 : window.innerWidth - 48, 1100);
  const bodyW = Math.max(360, Math.min(panelW + 20, widthCap));

  return (
    <Popover
      trigger="click"
      open={open}
      zIndex={POPOVER_Z}
      onOpenChange={(o) => {
        setOpen(o);
        setSearch('');
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
          </div>
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

// ---------------- 产品对卡（与主浮窗组框同构：左主品右对比，分界线隔开） ----------------

function PairCard({
  card,
  index,
  total,
  cards,
  onPatchCard,
  onDeleteCard,
}: {
  card: MainProduct;
  index: number;
  total: number;
  cards: MainProduct[];
  onPatchCard: (cardId: string, patch: (c: MainProduct) => MainProduct) => void;
  onDeleteCard: (cardId: string) => void;
}) {
  const { state } = useFilters();
  const { romramByKey } = useTreeData();
  const nodeOf = (sel: ProductSelection): RomramNode | undefined => romramByKey.get(`${sel.modelId}|${sel.romram}`);
  const takenMainKeys = useMemo(
    () => new Set(cards.filter((c) => c.id !== card.id && c.main).map((c) => selKey(c.main!))),
    [cards, card.id],
  );
  const quota = cardQuota(card);
  const full = card.compares.length >= quota;

  /** 落配置：换主品/换对比条目尽量沿用同色；新增走默认最低价色 */
  const buildSel = (from: ProductSelection | null, r: RomramNode): ProductSelection =>
    from ? remapSelection(from, romramByKey.get(`${from.modelId}|${from.romram}`), r) : { modelId: r.modelId, romram: r.romram, skuIds: defaultColorSkuIds(r) };

  const pickInCard = (ctx: EditorPickCtx, r: RomramNode): void => {
    if (ctx.kind === 'main') {
      onPatchCard(ctx.cardId, (c) => {
        const nextMain = buildSel(c.main, r);
        const key = selKey(nextMain);
        // 与主品同组的对比项不再重复占线（对齐主浮窗 withMain 口径）
        return { ...c, main: nextMain, compares: c.compares.filter((x) => selKey(x) !== key) };
      });
      return;
    }
    if (ctx.kind === 'replace-compare') {
      onPatchCard(ctx.cardId, (c) => {
        const next = buildSel(ctx.sel, r);
        const key = selKey(next);
        if (c.compares.some((x) => x !== ctx.sel && selKey(x) === key)) return c; // 他条目已占同组
        return { ...c, compares: c.compares.map((x) => (x === ctx.sel ? next : x)) };
      });
      return;
    }
    if (ctx.kind === 'new') {
      // 新增一对由外层处理（此处不会到达：new 上下文挂在浮窗底部，不经 PairCard）
      return;
    }
    // compare：连点增删（剔除与主品同组、配额收口在渲染前已拦）
    onPatchCard(ctx.cardId, (c) => {
      const exists = c.compares.find((x) => selKey(x) === rowKey(r));
      return exists
        ? { ...c, compares: c.compares.filter((x) => x !== exists) }
        : { ...c, compares: [...c.compares, buildSel(null, r)] };
    });
  };

  const main = card.main;
  const mainTitle = main ? mainTitleOf(main) : null;
  const checkedKeys = useMemo(() => new Set(card.compares.map(selKey)), [card.compares]);

  return (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        flexShrink: 0,
        borderRadius: radius.card,
        border: `1px solid ${color.hairline}`,
        background: color.canvas,
      }}
    >
      {total > 1 && <CardTag index={index} />}
      {/* 组头一行：与主浮窗同构——「主分析产品」「对比产品」标题 + 右侧删对 ✕ */}
      <div style={{ display: 'flex', alignItems: 'center', height: 34, paddingRight: 8, flexShrink: 0 }}>
        <span style={{ width: 16, flexShrink: 0 }} />
        <div style={{ flex: '0 0 300px', minWidth: 0, paddingLeft: 12, fontSize: 11, fontWeight: 600, color: color.mute, letterSpacing: 0.2 }}>主分析产品</div>
        <div aria-hidden style={{ width: 1, flexShrink: 0 }} />
        <div style={{ flex: '1 1 0', minWidth: 0, position: 'relative', display: 'flex', alignItems: 'center', height: '100%' }}>
          <span style={{ paddingLeft: 10, fontSize: 11, fontWeight: 600, color: color.mute, letterSpacing: 0.2 }}>对比产品</span>
          <span style={{ marginLeft: 'auto', display: 'inline-flex' }}>
            <Popconfirm
              zIndex={POPOVER_Z}
              title="删除该组？"
              description="组内对比产品一并移除"
              okText="删除"
              cancelText="取消"
              okButtonProps={{ danger: true, size: 'small' }}
              cancelButtonProps={{ size: 'small' }}
              onConfirm={() => onDeleteCard(card.id)}
            >
              <span style={{ display: 'inline-flex' }}>
                <GroupDeleteX label={main ? `删除该组 ${mainTitle?.model ?? ''}` : '删除该组'} />
              </span>
            </Popconfirm>
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'stretch' }}>
        {/* 左格：主分析产品（极浅蓝底） */}
        <div
          style={{
            flex: '0 0 300px',
            minWidth: 0,
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            background: 'rgba(0, 112, 243, 0.04)',
            boxSizing: 'border-box',
          }}
        >
          {main ? (
            <div
              style={{
                position: 'relative',
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 7,
                minWidth: 0,
                padding: '4px 12px 30px',
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, maxWidth: '100%' }}>
                <BrandDot brand={mainTitle!.brand} />
                <RowText title={mainTitle!.brandLabel}>{mainTitle!.brandLabel}</RowText>
                <RowText strong title={mainTitle!.full}>
                  {mainTitle!.model}
                </RowText>
              </span>
              <RomramChip>{main.romram}</RomramChip>
              <ColorChip
                node={nodeOf(main)}
                skuIds={main.skuIds}
                tone="strong"
                currency={state.currency}
                onToggle={(skuId, next) => {
                  const skuIds = next ? [...new Set([...main.skuIds, skuId])] : main.skuIds.filter((id) => id !== skuId);
                  if (!skuIds.length) return;
                  onPatchCard(card.id, (c) => (c.main ? { ...c, main: { ...c.main, skuIds } } : c));
                }}
                onReset={() => {
                  const node = nodeOf(main);
                  if (node) onPatchCard(card.id, (c) => (c.main ? { ...c, main: { ...c.main, skuIds: defaultColorSkuIds(node) } } : c));
                }}
              />
              <span style={{ position: 'absolute', bottom: 6, right: 8, display: 'inline-flex' }}>
                <PickPopover
                  ctx={{ kind: 'main', cardId: card.id }}
                  currentKey={selKey(main)}
                  blockedKeys={takenMainKeys}
                  initialModelId={main.modelId}
                  onPick={(r) => pickInCard({ kind: 'main', cardId: card.id }, r)}
                >
                  <SwapPill label={`更换主分析产品 ${mainTitle!.model}`} />
                </PickPopover>
              </span>
            </div>
          ) : (
            <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 12px 30px' }}>
              <PickPopover
                ctx={{ kind: 'main', cardId: card.id }}
                blockedKeys={takenMainKeys}
                onPick={(r) => pickInCard({ kind: 'main', cardId: card.id }, r)}
              >
                <AddPill label="选择主分析产品" big />
              </PickPopover>
            </div>
          )}
        </div>

        {/* 分界线：主分析产品 | 对比产品 */}
        <div aria-hidden style={{ width: 1, background: color.hairline, flexShrink: 0 }} />

        {/* 右格：对比产品 */}
        <div
          style={{
            flex: '1 1 0',
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            padding: '8px 10px 10px',
            boxSizing: 'border-box',
          }}
        >
          {card.compares.length === 0 ? (
            <div style={{ flex: 1, minHeight: 92, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <div style={{ fontSize: 11, color: color.mute }}>暂无对比产品</div>
              <PickPopover
                ctx={{ kind: 'compare', cardId: card.id }}
                checkedKeys={checkedKeys}
                quotaFull={full}
                mainSelKey={main ? selKey(main) : undefined}
                initialModelId={main?.modelId}
                keepOpen
                onPick={(r) => pickInCard({ kind: 'compare', cardId: card.id }, r)}
              >
                <AddPill label="添加对比产品" />
              </PickPopover>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto', maxHeight: 122 }}>
                {card.compares.map((sel) => {
                  const t = mainTitleOf(sel);
                  return (
                    <div
                      key={selKey(sel)}
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
                        <BrandDot brand={t.brand} />
                        <RowText title={t.brandLabel}>{t.brandLabel}</RowText>
                      </span>
                      <RowText title={t.full}>{t.model}</RowText>
                      <RomramChip>{sel.romram}</RomramChip>
                      <ColorChip
                        node={nodeOf(sel)}
                        skuIds={sel.skuIds}
                        tone="soft"
                        currency={state.currency}
                        onToggle={(skuId, next) => {
                          const skuIds = next ? [...new Set([...sel.skuIds, skuId])] : sel.skuIds.filter((id) => id !== skuId);
                          if (!skuIds.length) return;
                          onPatchCard(card.id, (c) => ({ ...c, compares: c.compares.map((x) => (x === sel ? { ...sel, skuIds } : x)) }));
                        }}
                        onReset={() => {
                          const node = nodeOf(sel);
                          if (node) onPatchCard(card.id, (c) => ({ ...c, compares: c.compares.map((x) => (x === sel ? { ...sel, skuIds: defaultColorSkuIds(node) } : x)) }));
                        }}
                      />
                      <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                        <PickPopover
                          ctx={{ kind: 'replace-compare', cardId: card.id, sel }}
                          currentKey={selKey(sel)}
                          initialModelId={sel.modelId}
                          onPick={(r) => pickInCard({ kind: 'replace-compare', cardId: card.id, sel }, r)}
                        >
                          <SwapPill label={`更换对比产品 ${t.model}`} />
                        </PickPopover>
                        <DeleteX
                          label={`移除对比 ${t.model} ${sel.romram}`}
                          size={10}
                          onClick={() => onPatchCard(card.id, (c) => ({ ...c, compares: c.compares.filter((x) => x !== sel) }))}
                        />
                      </span>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 6 }}>
                <PickPopover
                  ctx={{ kind: 'compare', cardId: card.id }}
                  checkedKeys={checkedKeys}
                  quotaFull={full}
                  mainSelKey={main ? selKey(main) : undefined}
                  initialModelId={main?.modelId}
                  keepOpen
                  onPick={(r) => pickInCard({ kind: 'compare', cardId: card.id }, r)}
                >
                  <AddPill label="添加对比产品" disabled={full} />
                </PickPopover>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------- 模板编辑浮窗（固定定位二级层） ----------------

export default function TemplateEditorFlyout({
  combo,
  onPatch,
  onDelete,
  onClose,
}: {
  combo: StoredCombo;
  /** 改动即存：写回模板原位置 */
  onPatch: (next: StoredCombo) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  // 模板名受控输入：每次击键实时写入（空名不写；失焦/回车空值回默认名）
  const [name, setName] = useState(combo.label);
  // combo 引用变化 = 外部切换了编辑目标（非本浮窗产出的改动）→ 名称跟随复位
  const lastProduced = useRef<StoredCombo | null>(null);
  useEffect(() => {
    if (combo !== lastProduced.current) {
      lastProduced.current = null;
      setName(combo.label);
    }
  }, [combo]);

  const patch = (next: StoredCombo): void => {
    lastProduced.current = next;
    onPatch(next);
  };

  const changeName = (v: string): void => {
    setName(v);
    if (v.trim()) patch({ ...combo, label: v.trim() });
  };
  const commitName = (): void => {
    if (name.trim()) return;
    const d = defaultTemplateName(combo.cards);
    setName(d);
    patch({ ...combo, label: d });
  };

  // 外点关闭：本浮层、选择浮窗面板与各级弹层内点击不关（点选择浮窗面板
  // 只关本浮层，主浮窗自己的白名单也会放行本浮层）
  useEffect(() => {
    const onDoc = (e: MouseEvent): void => {
      const t = e.target instanceof Element ? e.target : null;
      if (!t) return;
      if (t.closest('[data-lpl-template-editor]')) return;
      if (t.closest('[data-lpl-picker-panel]')) return;
      if (t.closest('.ant-popover')) return;
      if (t.closest('.ant-popconfirm')) return;
      if (t.closest('.ant-dropdown')) return;
      if (t.closest('.ant-modal') || t.closest('.ant-modal-mask')) return;
      onClose();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [onClose]);

  const patchCard = (cardId: string, f: (c: MainProduct) => MainProduct): void => {
    patch({ ...combo, cards: combo.cards.map((c) => (c.id === cardId ? f(c) : c)) });
  };

  const deleteCard = (cardId: string): void => {
    if (combo.cards.length <= 1) {
      onDelete(); // 最后一对删掉 = 模板删除
      return;
    }
    patch({ ...combo, cards: combo.cards.filter((c) => c.id !== cardId) });
  };

  const takenMainKeys = useMemo(
    () => new Set(combo.cards.filter((c) => c.main).map((c) => selKey(c.main!))),
    [combo.cards],
  );

  const addPair = (r: RomramNode): void => {
    patch({
      ...combo,
      cards: [...combo.cards, { id: newCardId(), main: { modelId: r.modelId, romram: r.romram, skuIds: defaultColorSkuIds(r) }, compares: [] }],
    });
  };

  return createPortal(
    <div
      data-lpl-template-editor
      style={{
        position: 'fixed',
        top: 72,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: EDITOR_Z,
        width: 'min(860px, calc(100vw - 48px))',
        maxHeight: 'calc(100vh - 120px)',
        overflowY: 'auto',
        background: color.canvas,
        borderRadius: radius.card,
        border: `1px solid ${color.hairline}`,
        boxShadow: '0 6px 24px rgba(0, 0, 0, 0.12)',
        padding: 12,
        boxSizing: 'border-box',
      }}
    >
      {/* 顶栏：模板名（可改）· 组数 · 删除模板 · 关闭 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, minHeight: 26 }}>
        <span style={{ fontSize: 12, color: color.mute, flexShrink: 0 }}>模板</span>
        <Input
          size="small"
          value={name}
          maxLength={40}
          aria-label="模板名称"
          onChange={(e) => changeName(e.target.value)}
          onBlur={commitName}
          onPressEnter={commitName}
          style={{ width: 264 }}
        />
        <span className="tnum" style={{ fontSize: 11, color: color.mute, flexShrink: 0 }}>
          {combo.cards.length} 组
        </span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <Popconfirm
            zIndex={POPOVER_Z}
            title="删除该模板？"
            description="删除后不可恢复"
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true, size: 'small' }}
            cancelButtonProps={{ size: 'small' }}
            onConfirm={onDelete}
          >
            <span style={{ display: 'inline-flex' }}>
              <span
                role="button"
                aria-label="删除模板"
                title="删除模板"
                className="lpl-pk-del"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  height: 24,
                  padding: '0 10px',
                  borderRadius: radius.pill,
                  border: `1px solid ${color.hairline}`,
                  background: color.canvas,
                  fontSize: 12,
                  color: color.mute,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                <DeleteOutlined style={{ fontSize: 11 }} /> 删除模板
              </span>
            </span>
          </Popconfirm>
          <DeleteX label="关闭" size={12} onClick={onClose} />
        </span>
      </div>

      {/* 产品对列表（一对一个整框） */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: PAIR_LIST_MAX_H, overflowY: 'auto', padding: 1 }}>
        {combo.cards.length === 0 && (
          <div
            style={{
              flexShrink: 0,
              borderRadius: radius.card,
              border: `1px dashed ${color.hairlineStrong}`,
              background: color.canvas,
              minHeight: 120,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              color: color.mute,
            }}
          >
            模板暂无内容，在下方新增一组
          </div>
        )}
        {combo.cards.map((card, idx) => (
          <PairCard
            key={card.id}
            card={card}
            index={idx}
            total={combo.cards.length}
            cards={combo.cards}
            onPatchCard={patchCard}
            onDeleteCard={deleteCard}
          />
        ))}
      </div>

      {/* 新增一对：列表正下方的延长带正中（与主浮窗「添加主分析产品」同形态） */}
      {combo.cards.length > 0 && (
        <div
          style={{
            marginTop: -10,
            flexShrink: 0,
            border: `1px solid ${color.hairline}`,
            borderTop: 'none',
            borderRadius: `0 0 ${radius.card}px ${radius.card}px`,
            padding: '12px 0',
            display: 'flex',
            justifyContent: 'center',
            background: color.canvas,
          }}
        >
          <Tooltip title={combo.cards.length >= MAINS_CAP ? `最多 ${MAINS_CAP} 组` : '再添一组产品对'} zIndex={TIP_Z}>
            <span style={{ display: 'inline-flex' }}>
              <PickPopover
                ctx={{ kind: 'new' }}
                blockedKeys={takenMainKeys}
                onPick={addPair}
              >
                <AddPill label="新增一组" big disabled={combo.cards.length >= MAINS_CAP} />
              </PickPopover>
            </span>
          </Tooltip>
        </div>
      )}
    </div>,
    document.body,
  );
}
