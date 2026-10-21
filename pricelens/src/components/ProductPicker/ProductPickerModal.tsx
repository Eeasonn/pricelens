// ============================================================
// 选择产品浮窗（第一百一十七轮二次迭代）：
// 主体 = 若干「分析对」左右排布——左 = 主分析产品（视觉显著、单选感：
//   一个产品 + 其配置行，浅蓝底强调），中间分界线骑「⚡自动匹配」圆钮
//   （点击填充右侧），右 = 对比产品（视觉弱、多选感：条目列表）。
// 条目粒度 = 品牌 + 产品名 + 配置 + 颜色（历史一致：颜色为次级筛选，
//   默认最低价色，点开可换/多选均价）；主品与对比条目均支持二次编辑——
//   「切换」浮层内 同品牌换产品 → 同产品换配置 → 同型号换颜色 逐层快速筛。
// 下方 = 统一产品树（填满弹窗宽度、固定高度、信息不截断；产品行「＋全部
//   型号」快捷 = 单产品多配置一键成卡；系列行「整系列」快捷 = 多卡）。
// 多对与快捷产生的多对视觉完全同构（无「组合」痕迹）；配额每卡 ≤8 条
//   产品线在选择时收口；即改即存，「完成」只关窗。
// ============================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import { Checkbox, Input, Modal, Popover, Select, Tooltip } from 'antd';
import {
  HolderOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  ThunderboltFilled,
  CloseOutlined,
  SwapOutlined,
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
  type ModelNode,
  type RomramNode,
} from '../ProductCascader/tree';
import { CascadePanel, type CascadeColumnSpec, type CascadeRowItem } from '../ProductCascader';
import ColorFlyout from '../ProductCascader/ColorFlyout';
import BrandDot, { brandLabelOf } from '../BrandMark';
import { cardQuota, isHuaweiModel, mapConfigsToProduct, MAX_LINES_PER_CHART, selKey } from '../../state/mainSelection';
import { LPL } from '../../state/lplKeys';
import { color, fontSize, radius, selectAccent, selectSoft, selectSoftInk } from '../../theme/tokens';

const TREE_H = 348; // 产品树固定高度（不随内容自适应跳变）
const PAIR_LIST_MAX_H = 258; // 分析对列表区最大高（多对时纵向滚动）

const norm = (s: string): string => s.replace(/\s+/g, '');

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

// ---------------- 快速切换（二次编辑：同品牌换产品 / 同产品换配置） ----------------

interface SwitchTarget {
  brand: string;
  modelId: string;
  romram: string;
}

function QuickSwitch({
  brands,
  modelsOfBrand,
  romramsOfModel,
  value,
  onChange,
  label,
}: {
  brands: { key: string; label: string }[];
  modelsOfBrand: (brand: string) => { key: string; label: string }[];
  romramsOfModel: (modelId: string) => string[];
  value: SwitchTarget;
  onChange: (next: SwitchTarget) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const selStyle = { fontSize: 12, width: '100%' };
  return (
    <Popover
      trigger="click"
      placement="bottomLeft"
      open={open}
      onOpenChange={setOpen}
      styles={{ body: { padding: '10px 12px', width: 360 } }}
      content={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} onClick={(e) => e.stopPropagation()}>
          <div style={{ fontSize: 12, fontWeight: 600, color: color.ink }}>切换 · 逐层筛选</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: color.mute }}>
            品牌
            <Select
              size="small"
              style={selStyle}
              value={value.brand}
              options={brands}
              onChange={(b) => {
                const first = modelsOfBrand(b)[0];
                if (!first) return;
                const roms = romramsOfModel(first.key);
                onChange({ brand: b, modelId: first.key, romram: roms[0] ?? '' });
              }}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: color.mute }}>
            产品
            <Select
              size="small"
              style={selStyle}
              showSearch
              optionFilterProp="label"
              value={value.modelId}
              options={modelsOfBrand(value.brand)}
              onChange={(m) => {
                const roms = romramsOfModel(m);
                onChange({ brand: value.brand, modelId: m, romram: roms[0] ?? '' });
              }}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: color.mute }}>
            配置
            <Select
              size="small"
              style={selStyle}
              value={value.romram}
              options={romramsOfModel(value.modelId).map((r) => ({ value: r, label: r }))}
              onChange={(r) => onChange({ ...value, romram: r })}
            />
          </label>
          <div style={{ fontSize: 11, color: color.mute }}>颜色在条目旁的色块里切换（可多色取均价）</div>
        </div>
      }
    >
      <span
        role="button"
        aria-label={label}
        title={label}
        onClick={(e) => e.stopPropagation()}
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
        }}
      >
        <SwapOutlined style={{ fontSize: 10 }} /> 切换
      </span>
    </Popover>
  );
}

// ---------------- 主浮窗 ----------------

export default function ProductPickerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, actions } = useFilters();
  const mains = state.mains;

  // 当前编辑对（树「＋对比」与配置勾选的落点）：null = 无卡
  const [activeCardId, setActiveCardId] = useState<string | null>(mains[0]?.modelId ?? null);
  useEffect(() => {
    if (open && !mains.some((c) => c.modelId === activeCardId)) setActiveCardId(mains[0]?.modelId ?? null);
  }, [open, mains, activeCardId]);

  // ---- 树与索引 ----
  const fullTree = useMemo(() => buildProductTree(state.industry, state.countryCode), [state.industry, state.countryCode]);
  const romramByKey = useMemo(() => {
    const m = new Map<string, RomramNode>();
    for (const b of fullTree) for (const s of b.series) for (const md of s.models) for (const r of md.romrams) m.set(r.key, r);
    return m;
  }, [fullTree]);
  const modelsByBrand = useMemo(() => {
    const m = new Map<string, ModelNode[]>();
    for (const b of fullTree) {
      const list: ModelNode[] = [];
      for (const s of b.series) list.push(...s.models);
      m.set(b.key, list);
    }
    return m;
  }, [fullTree]);
  const romramsByModel = useMemo(() => {
    const m = new Map<string, RomramNode[]>();
    for (const b of fullTree) for (const s of b.series) for (const md of s.models) m.set(md.modelId, md.romrams);
    return m;
  }, [fullTree]);

  const [search, setSearch] = useState('');
  const tree = useMemo(() => searchProductTree(fullTree, search), [fullTree, search]);

  // ---- 卡片写操作 ----
  const activeCard = mains.find((c) => c.modelId === activeCardId) ?? null;

  const updateCard = (modelId: string, patch: Partial<MainProduct>): void => {
    actions.setMains(mains.map((c) => (c.modelId === modelId ? { ...c, ...patch } : c)));
  };

  const removeCard = (modelId: string): void => {
    actions.setMains(mains.filter((c) => c.modelId !== modelId));
    if (activeCardId === modelId) setActiveCardId(null);
  };

  /** 树配置行勾选：收进对应主品卡（无卡即建卡） */
  const toggleConfig = (node: RomramNode): void => {
    const existing = mains.find((c) => c.modelId === node.modelId);
    const inCard = existing?.configs.some((c) => norm(c.romram) === norm(node.romram));
    if (existing && inCard) {
      updateCard(node.modelId, { configs: existing.configs.filter((c) => norm(c.romram) !== norm(node.romram)) });
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

  /** 产品行快捷「＋全部型号」：单产品多配置一键成卡/并卡（与手选多卡视觉同构） */
  const addAllConfigs = (modelId: string): void => {
    const nodes = romramsByModel.get(modelId) ?? [];
    const usable = nodes.filter((r) => r.romram !== '—' || nodes.length === 1);
    if (!usable.length) return;
    const existing = mains.find((c) => c.modelId === modelId);
    if (existing) {
      const configs = [...existing.configs];
      for (const r of usable) {
        if (!configs.some((c) => norm(c.romram) === norm(r.romram))) {
          configs.push({ modelId, romram: r.romram, skuIds: defaultColorSkuIds(r) });
        }
      }
      updateCard(modelId, { configs: configs.sort((a, b) => compareRomram(a.romram, b.romram)) });
    } else {
      actions.setMains([
        ...mains,
        {
          modelId,
          configs: usable.map((r) => ({ modelId, romram: r.romram, skuIds: defaultColorSkuIds(r) })),
          compares: [],
        },
      ]);
    }
    setActiveCardId(modelId);
  };

  /** 系列行快捷「整系列设为主分析」：每型号一张卡、带入全部在售配置 */
  const addSeriesAsMain = (models: { modelId: string }[]): void => {
    const rest = mains.filter((c) => !models.some((m) => m.modelId === c.modelId));
    const cards: MainProduct[] = models.map((m) => {
      const prev = mains.find((c) => c.modelId === m.modelId);
      const all = romramsByModel.get(m.modelId) ?? [];
      const nodes = all.filter((r) => r.romram !== '—' || all.length === 1);
      const configs = nodes.map(
        (r) => prev?.configs.find((c) => norm(c.romram) === norm(r.romram)) ?? { modelId: m.modelId, romram: r.romram, skuIds: defaultColorSkuIds(r) },
      );
      return { modelId: m.modelId, configs, compares: prev?.compares ?? [] };
    });
    actions.setMains([...rest, ...cards]);
    if (cards.length) setActiveCardId(cards[0].modelId);
  };

  const toggleCompare = (node: RomramNode): void => {
    if (!activeCard) return;
    const exists = activeCard.compares.find((c) => c.modelId === node.modelId && norm(c.romram) === norm(node.romram));
    if (exists) {
      actions.setCardCompares(
        activeCard.modelId,
        activeCard.compares.filter((c) => !(c.modelId === node.modelId && norm(c.romram) === norm(node.romram))),
      );
      return;
    }
    if (activeCard.modelId === node.modelId) return;
    if (activeCard.compares.length >= cardQuota(activeCard)) return;
    actions.setCardCompares(activeCard.modelId, [
      ...activeCard.compares,
      { modelId: node.modelId, romram: node.romram, skuIds: defaultColorSkuIds(node) },
    ]);
  };

  /** 主品换产品（同品牌逐层切换）：配置/颜色映射见 mapConfigsToProduct（金测锚定） */
  const switchMainProduct = (card: MainProduct, target: SwitchTarget): void => {
    if (target.modelId === card.modelId) return;
    const nodes = romramsByModel.get(target.modelId) ?? [];
    if (!nodes.length) return;
    const configs = mapConfigsToProduct(
      card.configs,
      card.modelId,
      target.modelId,
      (m, r) => romramByKey.get(`${m}|${r}`),
      () => nodes.map((n) => n.romram),
    );
    if (!configs.length) configs.push({ modelId: target.modelId, romram: nodes[0].romram, skuIds: defaultColorSkuIds(nodes[0]) });
    const rest = mains.filter((c) => c.modelId !== card.modelId && c.modelId !== target.modelId);
    actions.setMains([...rest, { modelId: target.modelId, configs, compares: card.compares }]);
    setActiveCardId(target.modelId);
  };

  /** 主品配置行换配置（同产品下快速切换型号） */
  const switchMainConfig = (card: MainProduct, fromRom: string, toRom: string): void => {
    if (norm(fromRom) === norm(toRom)) return;
    if (card.configs.some((c) => norm(c.romram) === norm(toRom))) return; // 已有该配置
    const node = romramByKey.get(`${card.modelId}|${toRom}`);
    if (!node) return;
    updateCard(card.modelId, {
      configs: card.configs
        .map((c) => (norm(c.romram) === norm(fromRom) ? { modelId: card.modelId, romram: toRom, skuIds: defaultColorSkuIds(node) } : c))
        .sort((a, b) => compareRomram(a.romram, b.romram)),
    });
  };

  /** 主品加配置（卡内「＋配置」：该产品其余配置快速加行） */
  const addMainConfig = (card: MainProduct, romram: string): void => {
    const node = romramByKey.get(`${card.modelId}|${romram}`);
    if (!node || card.configs.some((c) => norm(c.romram) === norm(romram))) return;
    updateCard(card.modelId, {
      configs: [...card.configs, { modelId: card.modelId, romram, skuIds: defaultColorSkuIds(node) }].sort((a, b) => compareRomram(a.romram, b.romram)),
    });
  };

  /** 对比条目切换（换品牌/产品/配置 = 整条替换；颜色回默认） */
  const switchCompare = (card: MainProduct, oldSel: ProductSelection, target: SwitchTarget): void => {
    if (target.modelId === card.modelId && norm(target.romram) === norm(oldSel.romram)) return;
    if (target.modelId === card.modelId) return; // 不与主品同产品
    if (card.compares.some((c) => c !== oldSel && c.modelId === target.modelId && norm(c.romram) === norm(target.romram))) return;
    const node = romramByKey.get(`${target.modelId}|${target.romram}`);
    if (!node) return;
    actions.setCardCompares(
      card.modelId,
      card.compares.map((c) => (c === oldSel ? { modelId: target.modelId, romram: target.romram, skuIds: defaultColorSkuIds(node) } : c)),
    );
  };

  // ---- 级联路径 ----
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

  const configOwner = useMemo(() => {
    const m = new Map<string, MainProduct>();
    for (const card of mains) for (const c of card.configs) m.set(`${c.modelId}|${norm(c.romram)}`, card);
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
      trailing: <span style={{ fontSize: 10.5, color: color.mute, flexShrink: 0 }}>{b.modelCount} 型号</span>,
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
          <Tooltip title="整系列设为主分析（每型号一张卡，带入全部配置）">
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
              <PlusOutlined style={{ fontSize: 9 }} /> 整系列
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
      trailing: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {m.eol && (
            <span style={{ fontSize: 10, color: color.mute, border: `1px solid ${color.hairline}`, borderRadius: radius.pill, padding: '0 6px', lineHeight: '16px' }}>退市</span>
          )}
          <Tooltip title="该产品全部配置收进一张主分析卡（单产品多型号）">
            <span
              onClick={(e) => {
                e.stopPropagation();
                addAllConfigs(m.modelId);
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
              }}
            >
              <PlusOutlined style={{ fontSize: 9 }} /> 全部型号
            </span>
          </Tooltip>
        </span>
      ),
    }));
    const leafItems: CascadeRowItem[] = (model?.romrams ?? []).map((r) => {
      const ownerCard = configOwner.get(`${r.modelId}|${norm(r.romram)}`);
      const isMainConfig = ownerCard?.modelId === r.modelId;
      const inActiveCompare = activeCard?.compares.some((c) => c.modelId === r.modelId && norm(c.romram) === norm(r.romram)) ?? false;
      const sameAsActiveMain = activeCard != null && activeCard.modelId === r.modelId;
      const quotaFull = activeCard != null && activeCard.compares.length >= cardQuota(activeCard);
      const compareDisabled = activeCard == null || (!inActiveCompare && (sameAsActiveMain || quotaFull));
      return {
        key: r.key,
        label: r.romram,
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
            <Tooltip
              title={
                activeCard == null
                  ? '先在上方点选一个分析对'
                  : sameAsActiveMain && !inActiveCompare
                    ? '主分析产品不对比自身配置'
                    : quotaFull && !inActiveCompare
                      ? `本图最多 ${MAX_LINES_PER_CHART} 条产品线（配置 + 对比）`
                      : inActiveCompare
                        ? '移除该对比'
                        : `加入「${modelNameOf(activeCard.modelId)}」的对比区`
              }
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  height: 20,
                  padding: '0 8px',
                  borderRadius: radius.pill,
                  fontSize: 11,
                  fontWeight: 600,
                  color: compareDisabled ? color.mute : inActiveCompare ? color.canvas : selectSoftInk,
                  background: inActiveCompare ? selectAccent : selectSoft,
                  border: `1px solid ${inActiveCompare ? selectAccent : 'rgba(0, 112, 243, 0.40)'}`,
                  cursor: compareDisabled ? 'not-allowed' : 'pointer',
                  opacity: compareDisabled ? 0.5 : 1,
                  flexShrink: 0,
                }}
              >
                {inActiveCompare ? '✓ 对比' : '＋对比'}
              </span>
            </Tooltip>
          </span>
        ),
      };
    });
    return [
      { items: brandItems, flex: 0.85 },
      { items: seriesItems, flex: 1.0 },
      { items: modelItems, flex: 1.5 },
      { items: leafItems, flex: 1.15 },
    ];
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
    const label = mains.length === 1 ? modelNameOf(mains[0].modelId) : `${modelNameOf(mains[0].modelId)} 等 ${mains.length} 款`;
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
  const handleClose = (): void => {
    recordCombo();
    onClose();
  };

  const totalCompares = new Set(mains.flatMap((c) => c.compares.map(selKey))).size;
  const switchBrands = fullTree.map((b) => ({ key: b.key, label: brandLabelOf(b.key) }));
  const modelsOpts = (b: string) => (modelsByBrand.get(b) ?? []).map((m) => ({ key: m.modelId, label: m.label }));
  const romOpts = (mid: string) => (romramsByModel.get(mid) ?? []).map((r) => r.romram);

  return (
    <Modal
      open={open}
      onCancel={handleClose}
      width={1000}
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

      {/* 分析对列表（左右排布） */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: PAIR_LIST_MAX_H, overflowY: 'auto', padding: 1 }}>
        {mains.length === 0 && (
          <div
            style={{
              border: `1px dashed ${color.hairlineStrong}`,
              borderRadius: radius.card,
              padding: '16px',
              fontSize: 12.5,
              color: color.mute,
              textAlign: 'center',
            }}
          >
            先在下方产品树选择主分析产品（点配置行即建对；产品行「全部型号」、系列行「整系列」可一键成卡）
          </div>
        )}
        {mains.map((card) => {
          const isActive = card.modelId === activeCardId;
          const quota = cardQuota(card);
          const huawei = isHuaweiModel(card.modelId);
          const allRoms = romOpts(card.modelId);
          const restConfigs = allRoms.filter((r) => !card.configs.some((c) => norm(c.romram) === norm(r)));
          return (
            <div
              key={card.modelId}
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
              onClick={() => setActiveCardId(card.modelId)}
              style={{
                position: 'relative',
                display: 'flex',
                gap: 12,
                alignItems: 'stretch',
                padding: '6px 6px 6px 2px',
                borderRadius: radius.card,
                border: `1px solid ${isActive ? selectAccent : dropCard === card.modelId ? color.link : color.hairline}`,
                background: color.canvas,
                cursor: 'pointer',
                opacity: dragCard === card.modelId ? 0.45 : undefined,
                boxShadow: dropCard === card.modelId ? 'inset 0 0 0 2px rgba(0, 112, 243, 0.35)' : undefined,
              }}
            >
              {/* 拖拽把手（换序 = 面板顺序） */}
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
                title="拖动调整顺序（= 分离面板顺序）"
                onClick={(e) => e.stopPropagation()}
                style={{ display: 'inline-flex', alignItems: 'center', cursor: 'grab', color: color.mute, flexShrink: 0 }}
              >
                <HolderOutlined style={{ fontSize: 12 }} />
              </span>

              {/* 左：主分析产品（显著 · 单选感） */}
              <div
                style={{
                  flex: '0 0 320px',
                  minWidth: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  padding: '8px 10px',
                  background: selectSoft,
                  border: `1px solid ${isActive ? selectAccent : 'rgba(0, 112, 243, 0.40)'}`,
                  borderRadius: radius.control,
                  boxSizing: 'border-box',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ fontSize: 11, fontWeight: 600, color: selectSoftInk, letterSpacing: 0.2 }}>主分析产品 · 单选</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                  <BrandDot brand={brandOfModel(card.modelId)} />
                  <span
                    title={modelNameOf(card.modelId)}
                    style={{ fontSize: 14.5, fontWeight: 700, color: color.ink, whiteSpace: 'nowrap', overflow: 'visible', flexShrink: 1 }}
                  >
                    {modelNameOf(card.modelId)}
                  </span>
                  <QuickSwitch
                    label={`切换主分析产品 ${modelNameOf(card.modelId)}`}
                    brands={switchBrands}
                    modelsOfBrand={modelsOpts}
                    romramsOfModel={romOpts}
                    value={{ brand: brandOfModel(card.modelId), modelId: card.modelId, romram: card.configs[0]?.romram ?? '' }}
                    onChange={(t) => switchMainProduct(card, t)}
                  />
                  <span
                    role="button"
                    aria-label={`删除分析对 ${modelNameOf(card.modelId)}`}
                    title="删除整个分析对"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeCard(card.modelId);
                    }}
                    style={{ marginLeft: 'auto', display: 'inline-flex', padding: 4, cursor: 'pointer', color: color.mute, flexShrink: 0 }}
                  >
                    <CloseOutlined style={{ fontSize: 11 }} />
                  </span>
                </div>
                {/* 配置行：配置（可换）+ 颜色（次级筛选）+ 删行 */}
                {card.configs.map((sel) => {
                  const node = romramByKey.get(`${card.modelId}|${sel.romram}`);
                  const romOptions = allRoms.filter((r) => norm(r) !== norm(sel.romram));
                  return (
                    <div key={`${card.modelId}|${sel.romram}`} style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <Popover
                        trigger="click"
                        placement="bottomLeft"
                        styles={{ body: { padding: '6px 4px', minWidth: 160 } }}
                        content={
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            {romOptions.map((r) => (
                              <span
                                key={r}
                                onClick={() => switchMainConfig(card, sel.romram, r)}
                                style={{
                                  padding: '3px 10px',
                                  fontSize: 12,
                                  color: color.body,
                                  cursor: 'pointer',
                                  whiteSpace: 'nowrap',
                                  borderRadius: radius.control,
                                }}
                              >
                                {r}
                              </span>
                            ))}
                          </div>
                        }
                      >
                        <span
                          title="点击切换配置（同产品快速换型号）"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            height: 22,
                            padding: '0 10px',
                            borderRadius: radius.pill,
                            background: color.canvas,
                            border: '1px solid rgba(0, 112, 243, 0.40)',
                            fontSize: 12,
                            color: color.ink,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {sel.romram}
                        </span>
                      </Popover>
                      <ColorChip
                        node={node}
                        skuIds={sel.skuIds}
                        tone="strong"
                        currency={state.currency}
                        onToggle={(skuId, next) => {
                          const configs = card.configs.map((c) =>
                            c === sel
                              ? { ...c, skuIds: next ? [...new Set([...c.skuIds, skuId])] : c.skuIds.filter((id) => id !== skuId) }
                              : c,
                          );
                          updateCard(card.modelId, { configs: configs.filter((c) => c.skuIds.length > 0) });
                        }}
                        onReset={() => node && updateCard(card.modelId, { configs: card.configs.map((c) => (c === sel ? { ...c, skuIds: defaultColorSkuIds(node) } : c)) })}
                      />
                      <span
                        role="button"
                        aria-label={`移除配置 ${sel.romram}`}
                        title="移除该配置"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateCard(card.modelId, { configs: card.configs.filter((c) => c !== sel) });
                        }}
                        style={{ display: 'inline-flex', padding: 3, cursor: 'pointer', color: color.mute }}
                      >
                        <CloseOutlined style={{ fontSize: 9 }} />
                      </span>
                    </div>
                  );
                })}
                {/* ＋配置（该产品其余配置快速加行） */}
                {restConfigs.length > 0 && (
                  <Popover
                    trigger="click"
                    placement="bottomLeft"
                    styles={{ body: { padding: '6px 4px', minWidth: 160 } }}
                    content={
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {restConfigs.map((r) => (
                          <span
                            key={r}
                            onClick={() => addMainConfig(card, r)}
                            style={{ padding: '3px 10px', fontSize: 12, color: color.body, cursor: 'pointer', whiteSpace: 'nowrap', borderRadius: radius.control }}
                          >
                            ＋ {r}
                          </span>
                        ))}
                      </div>
                    }
                  >
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 3,
                        alignSelf: 'flex-start',
                        height: 20,
                        padding: '0 9px',
                        borderRadius: radius.pill,
                        border: `1px dashed ${color.hairlineStrong}`,
                        fontSize: 11,
                        color: color.body,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <PlusOutlined style={{ fontSize: 9 }} /> 配置
                    </span>
                  </Popover>
                )}
              </div>

              {/* 中：分界线 + 骑线 ⚡ 自动匹配 */}
              <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                <Tooltip
                  title={huawei ? '按对标矩阵自动填充本对右侧对比区' : '自动匹配基于对标矩阵，仅支持华为产品；请手动挑选对比'}
                >
                  <span
                    role="button"
                    aria-label={`自动匹配对比 ${modelNameOf(card.modelId)}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (huawei) actions.autoMatchCard(card.modelId);
                    }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 34,
                      height: 34,
                      borderRadius: '50%',
                      background: huawei ? selectAccent : color.canvasSoft,
                      border: `2px solid ${color.canvas}`,
                      boxShadow: huawei ? `0 0 0 1px ${selectAccent}` : `0 0 0 1px ${color.hairline}`,
                      color: huawei ? '#fff' : color.mute,
                      cursor: huawei ? 'pointer' : 'not-allowed',
                    }}
                  >
                    <ThunderboltFilled style={{ fontSize: 13 }} />
                  </span>
                </Tooltip>
              </div>

              {/* 右：对比产品（弱 · 多选感） */}
              <div
                style={{
                  flex: '1 1 0',
                  minWidth: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  padding: '8px 10px',
                  background: color.canvas,
                  border: `1px solid ${color.hairline}`,
                  borderRadius: radius.control,
                  boxSizing: 'border-box',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ fontSize: 11, fontWeight: 600, color: color.mute }}>
                  对比产品 · 可多选 <span className="tnum">{card.compares.length}/{quota}</span>
                </div>
                {card.compares.length === 0 && (
                  <div style={{ fontSize: 11.5, color: color.mute, lineHeight: '20px' }}>
                    点中间 ⚡ 自动匹配{huawei ? '' : '（该品牌暂不支持，请手动添加）'}，或在下方产品树点「＋对比」
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto', maxHeight: 116 }}>
                  {card.compares.map((sel) => {
                    const node = romramByKey.get(`${sel.modelId}|${sel.romram}`);
                    return (
                      <div
                        key={`${sel.modelId}|${sel.romram}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '2px 6px 2px 8px',
                          background: color.canvasSoft,
                          borderRadius: radius.control,
                          minWidth: 0,
                        }}
                      >
                        <BrandDot brand={brandOfModel(sel.modelId)} />
                        <span
                          title={`${brandLabelOf(brandOfModel(sel.modelId))} ${modelNameOf(sel.modelId)} ${sel.romram}`}
                          style={{ fontSize: 12, color: color.body, whiteSpace: 'nowrap', overflow: 'visible', flexShrink: 1 }}
                        >
                          {modelNameOf(sel.modelId)}
                          <span style={{ color: color.mute }}> · {sel.romram}</span>
                        </span>
                        <ColorChip
                          node={node}
                          skuIds={sel.skuIds}
                          tone="soft"
                          currency={state.currency}
                          onToggle={(skuId, next) => {
                            const compares = card.compares.map((c) =>
                              c === sel
                                ? { ...c, skuIds: next ? [...new Set([...c.skuIds, skuId])] : c.skuIds.filter((id) => id !== skuId) }
                                : c,
                            );
                            actions.setCardCompares(card.modelId, compares.filter((c) => c.skuIds.length > 0));
                          }}
                          onReset={() =>
                            node &&
                            actions.setCardCompares(
                              card.modelId,
                              card.compares.map((c) => (c === sel ? { ...c, skuIds: defaultColorSkuIds(node) } : c)),
                            )
                          }
                        />
                        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                          <QuickSwitch
                            label={`切换对比产品 ${modelNameOf(sel.modelId)}`}
                            brands={switchBrands}
                            modelsOfBrand={modelsOpts}
                            romramsOfModel={romOpts}
                            value={{ brand: brandOfModel(sel.modelId), modelId: sel.modelId, romram: sel.romram }}
                            onChange={(t) => switchCompare(card, sel, t)}
                          />
                          <span
                            role="button"
                            aria-label={`移除对比 ${modelNameOf(sel.modelId)} ${sel.romram}`}
                            title="移除该对比"
                            onClick={() => actions.setCardCompares(card.modelId, card.compares.filter((c) => c !== sel))}
                            style={{ display: 'inline-flex', padding: 3, cursor: 'pointer', color: color.mute }}
                          >
                            <CloseOutlined style={{ fontSize: 10 }} />
                          </span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 全局动作行 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
        <span
          onClick={() => treeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })}
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

      {/* 产品树：填满弹窗宽度、固定高度、信息不截断 */}
      <div ref={treeRef} style={{ marginTop: 12, borderTop: `1px solid ${color.hairline}`, paddingTop: 10 }}>
        <Input
          allowClear
          prefix={<SearchOutlined style={{ color: color.mute }} />}
          placeholder="搜索品牌 / 系列 / 产品"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ marginBottom: 8, width: 320 }}
        />
        <div style={{ display: 'flex' }}>
          <CascadePanel columns={columns} fill height={TREE_H} />
        </div>
      </div>
    </Modal>
  );
}
