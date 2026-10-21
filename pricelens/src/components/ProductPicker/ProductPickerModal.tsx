// ============================================================
// 选择产品浮窗（第一百一十七轮，统一产品选择器）：
// 上 = 主分析产品卡列表（每卡 = 型号 + 配置 chips + 它自己的对比区），
// 下 = 统一产品树（品牌→系列→型号→配置，含华为；搜索 + 系列快捷整组）。
// 交互约定：
// - 配置行勾选 = 收进对应主品卡（无卡即建卡）；行尾「＋对比」加进当前编辑卡；
// - 卡片点击切换编辑目标（浅蓝描边），拖拽把手换序 = 分离面板顺序；
// - 每卡 ⚡ 自动匹配（华为卡）；顶部「全部自动匹配」= 回到自动跟随；
// - 配额：每卡 配置数 + 对比数 ≤ 8（选择时收口，图上不再截断）；
// - 即改即存（无草稿）：改动直接写 FiltersContext，「完成」只关窗。
// ============================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import { Checkbox, Input, Modal, Tooltip } from 'antd';
import {
  HolderOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  ThunderboltFilled,
  CloseOutlined,
} from '@ant-design/icons';
import { useFilters } from '../../state/FiltersContext';
import type { MainProduct, ProductSelection } from '../../state/filtersTypes';
import {
  buildProductTree,
  brandOfModel,
  compareRomram,
  defaultColorSkuIds,
  modelNameOf,
  searchProductTree,
  shortRomram,
  type RomramNode,
} from '../ProductCascader/tree';
import { CascadePanel, type CascadeColumnSpec, type CascadeRowItem } from '../ProductCascader';
import ColorFlyout from '../ProductCascader/ColorFlyout';
import BrandDot, { brandLabelOf } from '../BrandMark';
import { cardQuota, isHuaweiModel, MAX_LINES_PER_CHART, selKey } from '../../state/mainSelection';
import { LPL } from '../../state/lplKeys';
import { color, fontSize, radius, selectAccent, selectSoft, selectSoftInk, shadow } from '../../theme/tokens';

// ---------------- 最近使用组合（localStorage LPL3.ui.mainCombos，上限 5） ----------------

interface StoredCombo {
  label: string;
  cards: MainProduct[];
}

function readCombos(): StoredCombo[] {
  try {
    const raw = localStorage.getItem(LPL.uiMainCombos);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (c): c is StoredCombo =>
        typeof c === 'object' && c !== null && typeof (c as StoredCombo).label === 'string' && Array.isArray((c as StoredCombo).cards),
    );
  } catch {
    return [];
  }
}

function comboSignature(cards: MainProduct[]): string {
  return cards.map((c) => `${c.modelId}:${c.configs.map((s) => s.romram).join('/')}`).join('|');
}

// ---------------- 小组件：chips ----------------

function SelChip({
  sel,
  onRemove,
  onBodyClick,
  tone,
}: {
  sel: ProductSelection;
  onRemove: () => void;
  onBodyClick?: () => void;
  tone: 'main' | 'compare';
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '2px 4px 2px 8px',
        background: color.canvas,
        border: `1px solid ${tone === 'main' ? selectAccent : color.hairline}`,
        borderRadius: radius.pill,
        fontSize: 12,
        lineHeight: '18px',
        color: color.body,
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      <BrandDot brand={brandOfModel(sel.modelId)} />
      <span
        onClick={onBodyClick}
        style={{ cursor: onBodyClick ? 'pointer' : 'default', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis' }}
        title={onBodyClick ? '点击调整颜色' : undefined}
      >
        {modelNameOf(sel.modelId)} · {shortRomram(sel.romram)}
      </span>
      <span
        role="button"
        aria-label="移除"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        style={{ display: 'inline-flex', alignItems: 'center', padding: '0 3px', cursor: 'pointer', color: color.mute }}
      >
        <CloseOutlined style={{ fontSize: 9 }} />
      </span>
    </span>
  );
}

/** 树行尾「＋对比」胶囊：加进当前编辑卡；已在该卡对比区 = 实心可移除 */
function CompareAddChip({ active, disabled, title }: { active: boolean; disabled: boolean; title: string }) {
  return (
    <Tooltip title={title}>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 3,
          height: 20,
          padding: '0 8px',
          borderRadius: radius.pill,
          fontSize: 11,
          fontWeight: 600,
          color: disabled ? color.mute : active ? color.canvas : selectSoftInk,
          background: active ? selectAccent : selectSoft,
          border: `1px solid ${active ? selectAccent : 'rgba(0, 112, 243, 0.40)'}`,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          flexShrink: 0,
        }}
      >
        {active ? '✓ 对比' : '＋对比'}
      </span>
    </Tooltip>
  );
}

// ---------------- 主浮窗 ----------------

export default function ProductPickerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, actions } = useFilters();
  const mains = state.mains;

  // 当前编辑卡（「＋对比」的落点）：null = 无卡（按钮引导先建卡）
  const [activeCardId, setActiveCardId] = useState<string | null>(mains[0]?.modelId ?? null);
  useEffect(() => {
    if (open && !mains.some((c) => c.modelId === activeCardId)) setActiveCardId(mains[0]?.modelId ?? null);
  }, [open, mains, activeCardId]);

  // 卡内颜色浮层锚点（`${modelId}|${romram}`）；浮层绝对定位挂在卡下方
  const [colorAnchor, setColorAnchor] = useState<string | null>(null);

  // ---- 卡片编辑（写回走 actions；主品结构 = setMains、对比区 = setCardCompares） ----
  const activeCard = mains.find((c) => c.modelId === activeCardId) ?? null;

  const updateCard = (modelId: string, patch: Partial<MainProduct>): void => {
    actions.setMains(mains.map((c) => (c.modelId === modelId ? { ...c, ...patch } : c)));
  };

  const toggleConfig = (node: RomramNode): void => {
    const existing = mains.find((c) => c.modelId === node.modelId);
    const inCard = existing?.configs.some((c) => selKey(c) === selKey({ modelId: node.modelId, romram: node.romram, skuIds: [] }));
    if (existing && inCard) {
      updateCard(node.modelId, { configs: existing.configs.filter((c) => c.romram !== node.romram) });
      return;
    }
    const sel: ProductSelection = { modelId: node.modelId, romram: node.romram, skuIds: defaultColorSkuIds(node) };
    if (existing) {
      updateCard(node.modelId, { configs: [...existing.configs, sel].sort((a, b) => compareRomram(a.romram, b.romram)) });
    } else {
      actions.setMains([...mains, { modelId: node.modelId, configs: [sel], compares: [] }]);
    }
    setActiveCardId(node.modelId);
  };

  const removeCard = (modelId: string): void => {
    actions.setMains(mains.filter((c) => c.modelId !== modelId));
    if (activeCardId === modelId) setActiveCardId(null);
  };

  /** 系列快捷：整系列设为主分析（每型号建卡、带入全部在售配置；自动跟随按卡配额收口） */
  const addSeriesAsMain = (models: { modelId: string; romrams: RomramNode[] }[]): void => {
    const rest = mains.filter((c) => !models.some((m) => m.modelId === c.modelId));
    const cards: MainProduct[] = models.map((m) => {
      const prev = mains.find((c) => c.modelId === m.modelId);
      const configs = m.romrams
        .filter((r) => !r.key.endsWith('|—') || m.romrams.length === 1)
        .map((r) => prev?.configs.find((c) => c.romram === r.romram) ?? { modelId: m.modelId, romram: r.romram, skuIds: defaultColorSkuIds(r) });
      return { modelId: m.modelId, configs, compares: prev?.compares ?? [] };
    });
    actions.setMains([...rest, ...cards]);
    if (cards.length) setActiveCardId(cards[0].modelId);
  };

  const toggleCompare = (node: RomramNode): void => {
    if (!activeCard) return;
    const key = selKey({ modelId: node.modelId, romram: node.romram, skuIds: [] });
    const exists = activeCard.compares.find((c) => selKey(c) === key);
    if (exists) {
      actions.setCardCompares(activeCard.modelId, activeCard.compares.filter((c) => c.romram !== node.romram || c.modelId !== node.modelId));
      return;
    }
    if (activeCard.modelId === node.modelId) return; // 同卡不比自身配置
    if (activeCard.compares.length >= cardQuota(activeCard)) return; // 配额满
    actions.setCardCompares(activeCard.modelId, [
      ...activeCard.compares,
      { modelId: node.modelId, romram: node.romram, skuIds: defaultColorSkuIds(node) },
    ]);
  };

  // ---- 树 ----
  const fullTree = useMemo(() => buildProductTree(state.industry, state.countryCode), [state.industry, state.countryCode]);
  /** 配置节点索引（卡内颜色浮层反查 RomramNode） */
  const romramByKey = useMemo(() => {
    const m = new Map<string, RomramNode>();
    for (const b of fullTree) for (const s of b.series) for (const md of s.models) for (const r of md.romrams) m.set(r.key, r);
    return m;
  }, [fullTree]);
  const [search, setSearch] = useState('');
  const tree = useMemo(() => searchProductTree(fullTree, search), [fullTree, search]);

  // 级联路径（品牌|系列|型号），空段回退首项；搜索时自动聚焦首个命中型号
  const [path, setPath] = useState<[string, string, string] | null>(null);
  const brand = tree.find((b) => b.key === path?.[0]) ?? tree[0];
  const series = brand?.series.find((s) => s.key === path?.[1]) ?? brand?.series[0];
  const model = series?.models.find((m) => m.modelId === path?.[2]) ?? series?.models[0];
  useEffect(() => {
    if (!open) return;
    if (search && tree.length) {
      const b = tree[0];
      const s = b.series[0];
      const m = s?.models[0];
      setPath(m ? [b.key, s.key, m.modelId] : null);
    } else if (tree.length) {
      // 打开/清空搜索：回到当前首个主品的品牌，便于继续编辑
      const firstMain = mains[0] ? brandOfModel(mains[0].modelId) : null;
      const b = tree.find((x) => x.key === firstMain) ?? tree[0];
      const s = b.series[0];
      const m = s?.models[0];
      setPath(m ? [b.key, s.key, m.modelId] : null);
    } else {
      setPath(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, search, tree.length]);

  // 主品配置勾选态索引：modelId|romram → 卡
  const configOwner = useMemo(() => {
    const m = new Map<string, MainProduct>();
    for (const card of mains) for (const c of card.configs) m.set(selKey(c), card);
    return m;
  }, [mains]);

  const columns: CascadeColumnSpec[] = useMemo(() => {
    const brandItems: CascadeRowItem[] = tree.map((b) => ({
      key: b.key,
      label: brandLabelOf(b.key),
      leading: <BrandDot brand={b.key} />,
      active: brand?.key === b.key,
      onActivate: () => {
        const s = b.series[0];
        setPath([b.key, s?.key ?? '', s?.models[0]?.modelId ?? '']);
      },
      trailing: b.modelCount > 0 ? (
        <span style={{ fontSize: 10.5, color: color.mute, flexShrink: 0 }}>{b.modelCount} 型号</span>
      ) : undefined,
    }));
    const seriesItems: CascadeRowItem[] = (brand?.series ?? []).map((s) => ({
      key: s.key,
      label: s.title,
      active: series?.key === s.key,
      onActivate: () => setPath([brand.key, s.key, s.models[0]?.modelId ?? '']),
      trailing: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {s.eol && (
            <span style={{ fontSize: 10, color: color.mute, border: `1px solid ${color.hairline}`, borderRadius: radius.pill, padding: '0 6px', lineHeight: '16px' }}>退市</span>
          )}
          <Tooltip title="整系列设为主分析（每型号建卡，带入全部配置）">
            <span
              onClick={(e) => {
                e.stopPropagation();
                addSeriesAsMain(s.models);
              }}
              style={{
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
                border: '1px solid rgba(0, 112, 243, 0.40)',
                cursor: 'pointer',
              }}
            >
              <PlusOutlined style={{ fontSize: 9 }} /> 主分析
            </span>
          </Tooltip>
        </span>
      ),
    }));
    const modelItems: CascadeRowItem[] = (series?.models ?? []).map((m) => ({
      key: m.modelId,
      label: m.label,
      leading: <BrandDot brand={m.brand} />,
      active: model?.modelId === m.modelId,
      onActivate: () => setPath([brand.key, series.key, m.modelId]),
      trailing: m.eol ? (
        <span style={{ fontSize: 10, color: color.mute, border: `1px solid ${color.hairline}`, borderRadius: radius.pill, padding: '0 6px', lineHeight: '16px', flexShrink: 0 }}>退市</span>
      ) : undefined,
    }));
    const leafItems: CascadeRowItem[] = (model?.romrams ?? []).map((r) => {
      const ownerCard = configOwner.get(r.key);
      const isMainConfig = ownerCard?.modelId === r.modelId;
      const compareKey = selKey({ modelId: r.modelId, romram: r.romram, skuIds: [] });
      const inActiveCompare = activeCard?.compares.some((c) => selKey(c) === compareKey) ?? false;
      const sameAsActiveMain = activeCard != null && activeCard.modelId === r.modelId;
      const quotaFull = activeCard != null && activeCard.compares.length >= cardQuota(activeCard);
      const compareDisabled = activeCard == null || (!inActiveCompare && (sameAsActiveMain || quotaFull));
      return {
        key: r.key,
        label: shortRomram(r.romram),
        checkState: isMainConfig ? ('checked' as const) : ('none' as const),
        onCheckChange: () => toggleConfig(r),
        onLabelClick: () => toggleConfig(r),
        trailing: (
          <span
            onClick={(e) => {
              e.stopPropagation();
              if (!compareDisabled) toggleCompare(r);
            }}
          >
            <CompareAddChip
              active={inActiveCompare}
              disabled={compareDisabled}
              title={
                activeCard == null
                  ? '先在上方点选一张主分析卡'
                  : sameAsActiveMain && !inActiveCompare
                    ? '主分析卡不对比自身配置'
                    : quotaFull && !inActiveCompare
                      ? `本卡最多 ${MAX_LINES_PER_CHART} 条产品线（配置 + 对比）`
                      : inActiveCompare
                        ? '移除该对比'
                        : `加入「${modelNameOf(activeCard.modelId)}」的对比区`
              }
            />
          </span>
        ),
      };
    });
    return [{ items: brandItems }, { items: seriesItems, max: 300 }, { items: modelItems }, { items: leafItems, extraW: 96 }];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, brand, series, model, configOwner, activeCard, mains]);

  // ---- 卡片拖拽换序（= 分离面板顺序） ----
  const [dragCard, setDragCard] = useState<string | null>(null);
  const [dropCard, setDropCard] = useState<string | null>(null);
  const moveCard = (from: string, to: string): void => {
    if (from === to) return;
    const ids = mains.map((c) => c.modelId);
    const i = ids.indexOf(from);
    const j = ids.indexOf(to);
    if (i < 0 || j < 0) return;
    ids.splice(j, 0, ids.splice(i, 1)[0]);
    actions.setMains(ids.map((id) => mains.find((c) => c.modelId === id)!));
  };

  // ---- 最近组合 ----
  const [combos, setCombos] = useState<StoredCombo[]>(() => readCombos());
  const recordCombo = (): void => {
    if (!mains.length) return;
    const label =
      mains.length === 1
        ? `${modelNameOf(mains[0].modelId)}`
        : `${modelNameOf(mains[0].modelId)} 等 ${mains.length} 款`;
    const sig = comboSignature(mains);
    const next = [{ label, cards: mains.map((c) => ({ ...c })) }, ...combos.filter((c) => comboSignature(c.cards) !== sig)].slice(0, 5);
    setCombos(next);
    try {
      localStorage.setItem(LPL.uiMainCombos, JSON.stringify(next));
    } catch {
      /* 存储不可用忽略 */
    }
  };

  const treeRef = useRef<HTMLDivElement | null>(null);
  const focusTree = (): void => treeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  const handleClose = (): void => {
    recordCombo();
    setColorAnchor(null);
    onClose();
  };

  // ---- 渲染 ----
  const totalCompares = new Set(mains.flatMap((c) => c.compares.map(selKey))).size;

  return (
    <Modal
      open={open}
      onCancel={handleClose}
      width={940}
      centered
      title={
        <span style={{ fontSize: fontSize.displaySm }}>
          选择产品
          <span style={{ fontSize: 12, fontWeight: 400, color: color.mute, marginLeft: 10 }}>
            主分析 1 款或多款（多款自动分图）；每款自带对比产品
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
            <Tooltip key={i} title={c.cards.map((x) => modelNameOf(x.modelId)).join('、')}>
              <span
                onClick={() => {
                  actions.setMains(c.cards.map((x) => ({ ...x })));
                  setActiveCardId(c.cards[0]?.modelId ?? null);
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
                <BrandDot brand={brandOfModel(c.cards[0].modelId)} />
                {c.label}
              </span>
            </Tooltip>
          ))}
        </div>
      )}

      {/* 主分析卡区 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 264, overflowY: 'auto', padding: 1 }}>
        {mains.length === 0 && (
          <div
            style={{
              border: `1px dashed ${color.hairlineStrong}`,
              borderRadius: radius.card,
              padding: '14px 16px',
              fontSize: 12.5,
              color: color.mute,
              textAlign: 'center',
            }}
          >
            先在下方产品树选择 1 款主分析产品（点配置行即收进对应卡片；系列行可整组设为主分析）
          </div>
        )}
        {mains.map((card) => {
          const isActive = card.modelId === activeCardId;
          const quota = cardQuota(card);
          const huawei = isHuaweiModel(card.modelId);
          return (
            <div
              key={card.modelId}
              onClick={() => setActiveCardId(card.modelId)}
              onDragOver={(e) => {
                if (!dragCard || dragCard === card.modelId) return;
                e.preventDefault();
                setDropCard(card.modelId);
              }}
              onDragLeave={() => setDropCard((t) => (t === card.modelId ? null : t))}
              onDrop={(e) => {
                e.preventDefault();
                if (dragCard) moveCard(dragCard, card.modelId);
                setDragCard(null);
                setDropCard(null);
              }}
              style={{
                position: 'relative',
                border: `1px solid ${isActive ? selectAccent : dropCard === card.modelId ? color.link : color.hairline}`,
                boxShadow: isActive ? 'inset 0 0 0 1px ' + selectAccent : undefined,
                borderRadius: radius.card,
                background: color.canvas,
                padding: '8px 12px 8px 8px',
                cursor: 'pointer',
                opacity: dragCard === card.modelId ? 0.45 : undefined,
              }}
            >
              {/* 卡头：拖拽把手 + 品牌点 + 型号名 + 卡操作 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  draggable
                  onDragStart={(e) => {
                    setDragCard(card.modelId);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragEnd={() => {
                    setDragCard(null);
                    setDropCard(null);
                  }}
                  title="拖动调整卡片顺序（= 分离面板顺序）"
                  style={{ display: 'inline-flex', cursor: 'grab', color: color.mute, padding: '2px 2px' }}
                >
                  <HolderOutlined style={{ fontSize: 12 }} />
                </span>
                <BrandDot brand={brandOfModel(card.modelId)} />
                <span style={{ fontSize: 13, fontWeight: 700, color: color.ink }}>{modelNameOf(card.modelId)}</span>
                <Tooltip title={huawei ? '按对标矩阵重算本卡对比区' : '自动匹配基于对标矩阵，仅支持华为产品；请手动挑选对比'}>
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      if (huawei) actions.autoMatchCard(card.modelId);
                    }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      height: 22,
                      padding: '0 9px',
                      borderRadius: radius.pill,
                      fontSize: 11.5,
                      fontWeight: 600,
                      color: huawei ? selectSoftInk : color.mute,
                      background: huawei ? selectSoft : color.canvasSoft,
                      border: `1px solid ${huawei ? 'rgba(0, 112, 243, 0.40)' : color.hairline}`,
                      cursor: huawei ? 'pointer' : 'not-allowed',
                      flexShrink: 0,
                    }}
                  >
                    <ThunderboltFilled style={{ fontSize: 10 }} />
                    自动匹配
                  </span>
                </Tooltip>
                <span
                  role="button"
                  aria-label={`删除主分析 ${modelNameOf(card.modelId)}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeCard(card.modelId);
                  }}
                  style={{ marginLeft: 'auto', display: 'inline-flex', padding: 4, cursor: 'pointer', color: color.mute }}
                >
                  <CloseOutlined style={{ fontSize: 11 }} />
                </span>
              </div>
              {/* 配置 chips */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 7 }}>
                <span style={{ fontSize: 11.5, color: color.mute, flexShrink: 0 }}>配置</span>
                {card.configs.map((sel) => {
                  const anchor = selKey(sel);
                  return (
                    <span key={anchor} style={{ position: 'relative' }}>
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          setColorAnchor(colorAnchor === anchor ? null : anchor);
                        }}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          height: 22,
                          padding: '0 10px',
                          borderRadius: radius.pill,
                          background: selectSoft,
                          border: `1px solid ${colorAnchor === anchor ? selectAccent : 'rgba(0, 112, 243, 0.40)'}`,
                          fontSize: 12,
                          color: selectSoftInk,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {shortRomram(sel.romram)}
                        <span style={{ fontSize: 10.5, opacity: 0.75 }}>{sel.skuIds.length > 1 ? `${sel.skuIds.length} 色` : '单色'}</span>
                      </span>
                      {colorAnchor === anchor && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            position: 'absolute',
                            top: 26,
                            left: 0,
                            zIndex: 30,
                            width: 272,
                            background: color.canvas,
                            border: `1px solid ${color.hairline}`,
                            borderRadius: radius.card,
                            boxShadow: shadow.l2,
                          }}
                        >
                          {(() => {
                            const node = romramByKey.get(anchor);
                            const sel = card.configs.find((c) => `${card.modelId}|${c.romram}` === anchor);
                            if (!node || !sel) return null;
                            return (
                              <ColorFlyout
                                node={node}
                                list={sel ? [sel] : []}
                                currency={state.currency}
                                onToggle={(skuId, next) => {
                                  const configs = card.configs.map((c) =>
                                    c.romram === sel.romram
                                      ? {
                                          ...c,
                                          skuIds: next
                                            ? [...new Set([...c.skuIds, skuId])]
                                            : c.skuIds.filter((id) => id !== skuId),
                                        }
                                      : c,
                                  );
                                  // 取消最后一个颜色 = 该配置退场（与级联同语义）
                                  updateCard(card.modelId, { configs: configs.filter((c) => c.skuIds.length > 0) });
                                }}
                                onReset={() => {
                                  updateCard(card.modelId, {
                                    configs: card.configs.map((c) =>
                                      c.romram === sel.romram ? { ...c, skuIds: defaultColorSkuIds(node) } : c,
                                    ),
                                  });
                                }}
                              />
                            );
                          })()}
                        </div>
                      )}
                    </span>
                  );
                })}
              </div>
              {/* 对比区 chips */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                <span style={{ fontSize: 11.5, color: color.mute, flexShrink: 0 }}>
                  对比 <span className="tnum">{card.compares.length}/{quota}</span>
                </span>
                {card.compares.map((sel) => (
                  <SelChip
                    key={selKey(sel)}
                    sel={sel}
                    tone="compare"
                    onRemove={() =>
                      actions.setCardCompares(
                        card.modelId,
                        card.compares.filter((c) => !(c.modelId === sel.modelId && c.romram === sel.romram)),
                      )
                    }
                  />
                ))}
                {card.compares.length === 0 && (
                  <span style={{ fontSize: 11.5, color: color.mute }}>
                    在下方产品树点「＋对比」加入本卡{huawei ? '，或点上方「自动匹配」' : ''}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 全局动作行 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
        <span
          onClick={() => focusTree()}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            height: 26,
            padding: '0 12px',
            borderRadius: radius.pill,
            border: `1px dashed ${color.hairlineStrong}`,
            fontSize: 12,
            color: color.body,
            cursor: 'pointer',
            background: color.canvas,
          }}
        >
          <PlusOutlined style={{ fontSize: 10 }} /> 新增主分析产品
        </span>
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
              border: `1px solid rgba(0, 112, 243, 0.40)`,
              cursor: 'pointer',
            }}
          >
            <ReloadOutlined style={{ fontSize: 11 }} /> 全部自动匹配
          </span>
        </Tooltip>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            marginLeft: 'auto',
            fontSize: 12,
            color: color.mute,
          }}
        >
          <Checkbox
            checked={state.autoMatch}
            onChange={(e) => actions.setAutoMatch(e.target.checked)}
          />
          对比自动跟随主品
          <span style={{ color: color.hairlineStrong }}>｜</span>
          每图最多 {MAX_LINES_PER_CHART} 条产品线
        </span>
      </div>

      {/* 产品树 */}
      <div ref={treeRef} style={{ marginTop: 12, borderTop: `1px solid ${color.hairline}`, paddingTop: 10 }}>
        <Input
          allowClear
          prefix={<SearchOutlined style={{ color: color.mute }} />}
          placeholder="搜索品牌 / 系列 / 型号"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ marginBottom: 8, width: 320 }}
        />
        <div style={{ display: 'flex', alignItems: 'flex-start' }}>
          <CascadePanel columns={columns} />
        </div>
      </div>
    </Modal>
  );
}
