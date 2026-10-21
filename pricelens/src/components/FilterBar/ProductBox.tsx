// 产业、我司产品与竞品控件。竞品级联始终可编辑；实际修改时退出自动匹配。
// 产品与竞品级联默认展开到已选配置所在的最细层，颜色仍在档位浮层编辑。
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Cascader, Checkbox, Select, Tooltip } from 'antd';
import { useFilters } from '../../state/FiltersContext';
import { color, fontSize, formatPrice, radius, selectAccent, selectSoft, selectSoftInk } from '../../theme/tokens';
import {
  buildCompetitorTree,
  buildOwnTree,
  defaultColorSkuIds,
  findSelection,
  modelNameOf,
  shortRomram,
  toggleSku,
  type RomramNode,
} from '../ProductCascader/tree';
import type { ProductSelection } from '../../state/filtersTypes';
import type { CurrencyMode, DimProduct } from '../../dataModel/types';
import { CascadePanel, type CascadeRowItem } from '../ProductCascader';
import { getEffectiveBenchmark } from '../../state/configStore';
import { dimProduct } from '../../data';
import { TIER_LABELS, tierOf, tierOrderOf } from '../../dataModel/aggregate';
import { INDUSTRY_LABELS, INDUSTRY_ORDER, industriesOfCountry } from '../../dataModel/scope';
import { tierLabelShort } from '../../chart/PriceTrend/helpers';

// ---------------- ① 产业下拉（反馈 2.1） ----------------

function lockedOption(text: string): ReactNode {
  return <span style={{ color: color.hairlineStrong }}>{text} 🔒</span>;
}

export function IndustryControl() {
  const { state, actions } = useFilters();
  const available = useMemo(() => new Set(industriesOfCountry(state.countryCode)), [state.countryCode]);
  const options = INDUSTRY_ORDER.map((ind) =>
    available.has(ind)
      ? { value: ind, label: INDUSTRY_LABELS[ind] }
      : { value: ind, label: lockedOption(INDUSTRY_LABELS[ind]), disabled: true },
  );
  return (
    <Select
      id="scope-industry"
      aria-label="产业"
      value={state.industry}
      style={{ width: '100%' }}
      popupMatchSelectWidth={false}
      onChange={(v) => actions.set({ industry: v as typeof state.industry })}
      options={options}
    />
  );
}

// ---------------- 竞品自动匹配模式 ----------------

/** Auto is a selectable mode, not a lock on the competitor cascader. */
export function AutoMatchControl() {
  const { state, actions } = useFilters();
  return (
    <Tooltip title={state.autoMatch ? '已按自有产品自动匹配竞品；直接修改右侧竞品会退出自动模式' : '点击后按自有产品重新匹配竞品'}>
      <button
        type="button"
        aria-label="自动匹配竞品"
        aria-pressed={state.autoMatch}
        onClick={() => actions.setAutoMatch(!state.autoMatch)}
        style={{
          height: 30, padding: '0 9px', flexShrink: 0, borderRadius: radius.control,
          border: `1px solid ${state.autoMatch ? selectAccent : color.hairlineStrong}`,
          background: state.autoMatch ? selectSoft : color.canvas,
          color: state.autoMatch ? selectSoftInk : color.body,
          font: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer',
        }}
      >自动</button>
    </Tooltip>
  );
}

// ---------------- ②③ 产品级联（标准 antd Cascader multiple） ----------------

/** 档位行内「颜色」按钮：迷你版匹配按钮样式（浅蓝底蓝描边胶囊），点击弹颜色浮层 */
const COLOR_CHIP: CSSProperties = {
  height: 18,
  padding: '0 7px',
  display: 'inline-flex',
  alignItems: 'center',
  fontSize: 11,
  fontWeight: 600,
  lineHeight: '16px',
  color: selectSoftInk,
  background: selectSoft,
  border: '1px solid rgba(0, 112, 243, 0.40)',
  borderRadius: radius.pill,
  cursor: 'pointer',
  flexShrink: 0,
};

/** 颜色浮层（第十五轮）：档位行「颜色」按钮点击后在级联面板右侧弹出；勾选/取消颜色
 *  直接改写该勾选组的 skuIds（toggleSku：取消最后一个颜色 = 整组退场），下游聚合
 *  对 skuIds 取均值，多色即均价。列显各颜色最新折后价，辅助挑选。 */
function ColorFlyout({
  node,
  list,
  currency,
  onToggle,
  onReset,
}: {
  node: RomramNode;
  list: ProductSelection[];
  currency: CurrencyMode;
  onToggle: (skuId: string, next: boolean) => void;
  onReset: () => void;
}) {
  const pool = node.selectableColors.length ? node.selectableColors : node.colors;
  const sel = findSelection(list, node);
  return (
    <div
      style={{
        width: 232,
        boxSizing: 'border-box',
        flexShrink: 0,
        borderLeft: `1px solid ${color.hairline}`,
        background: color.canvas,
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: color.ink, whiteSpace: 'nowrap' }}>
        颜色
        <span style={{ fontWeight: 400, color: color.mute }}>
          {' '}· {modelNameOf(node.modelId)} {shortRomram(node.romram)}
        </span>
      </div>
      <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', overflowY: 'auto', maxHeight: 228 }}>
        {pool.map((c) => (
          <label
            key={c.skuId}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
              lineHeight: '26px',
              color: color.body,
              cursor: 'pointer',
            }}
          >
            <Checkbox
              checked={sel?.skuIds.includes(c.skuId) ?? false}
              onChange={(e) => onToggle(c.skuId, e.target.checked)}
              style={{ fontSize: 12 }}
            />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.color}</span>
            <span className="tnum" style={{ marginLeft: 'auto', fontSize: 11, color: color.mute }}>
              {formatPrice(currency === 'usd' ? c.latestUsd : c.latestLocal, currency)}
            </span>
          </label>
        ))}
      </div>
      <div
        style={{
          marginTop: 6,
          paddingTop: 6,
          borderTop: `1px solid ${color.hairline}`,
          fontSize: 11,
          lineHeight: '16px',
          color: color.mute,
        }}
      >
        多选颜色时，折后价取所选颜色的均价。
        <a onClick={onReset} style={{ fontSize: 11, marginLeft: 4 }}>
          恢复默认色
        </a>
      </div>
    </div>
  );
}

// 已选标签内容用 displayRender 定制（multiple 模式下它就是每个标签的文案；
// 注意 tagRender 拿到的 value 是 rc-cascader 拼接后的标量 key，不是路径，不可用）。

/** 对标预览列（仅我司级联）：跟随展开/悬停的型号或配置——悬停型号列该型号全部映射，
 *  悬停某配置只列该配置的精确映射；未配置时给一句说明。与颜色浮层互斥——浮层打开时宽度让位。 */
function BenchPreview({
  modelLabel,
  items,
}: {
  modelLabel: string;
  items: { key: string; name: string; spec: string; primary: boolean }[];
}) {
  return (
    <div
      style={{
        width: 196,
        boxSizing: 'border-box',
        flexShrink: 0,
        borderLeft: `1px solid ${color.hairline}`,
        background: color.canvas,
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: color.ink, whiteSpace: 'nowrap' }}>
        对标竞品
        <span style={{ fontWeight: 400, color: color.mute }}> · {modelLabel}</span>
      </div>
      {items.length ? (
        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', overflowY: 'auto', maxHeight: 284 }}>
          {items.map((it) => (
            <div
              key={it.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                lineHeight: '26px',
                color: color.body,
                whiteSpace: 'nowrap',
              }}
            >
              {it.primary && <span style={{ color: '#b45309', flexShrink: 0 }}>★</span>}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.name}</span>
              <span style={{ color: color.mute, flexShrink: 0 }}>{it.spec}</span>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ marginTop: 6, fontSize: 11, lineHeight: '16px', color: color.mute }}>该产品尚未配置对标竞品</div>
      )}
    </div>
  );
}

/** Cascader owns the selected tags; CascadePanel owns the open three-column path. */
function ProductCascadeControl({
  kind,
  selection,
  onSelectionChange,
  emptyPlaceholder,
  productLevel,
}: {
  kind: 'own' | 'comp';
  /** 第四十三轮：受控注入（总览产品筛选复用同款级联）；缺省 = 绑定 FiltersContext */
  selection?: ProductSelection[];
  onSelectionChange?: (next: ProductSelection[]) => void;
  emptyPlaceholder?: string;
  /** 第八十六轮：收窄到产品层——面板只留组/型号两列，勾选型号即整产品；
   *  ROM 粒度的取舍交给看板标题行的配置 chips（消除上下重复入口） */
  productLevel?: boolean;
}) {
  const { state, actions } = useFilters();
  const tree = useMemo(
    () => (kind === 'own' ? buildOwnTree(state.industry, state.countryCode) : buildCompetitorTree(state.industry, state.countryCode)),
    [kind, state.industry, state.countryCode],
  );
  const list = selection ?? (kind === 'own' ? state.own : state.competitors);
  const writeList = (next: ProductSelection[]): void => {
    if (onSelectionChange) {
      onSelectionChange(next);
      return;
    }
    if (kind === 'own') actions.setOwnSelection(next);
    else actions.set({ competitors: next, autoMatch: false }); // 手动修改竞品即退出自动模式，不回写配置
  };

  // 颜色浮层锚点档位（`${modelId}|${romram}`），null = 收起。
  // 未勾选配置也可弹层（第十六轮：按钮只开浮层不改勾选）；收起走显式路径：
  // 下拉关闭 / 浮层内取消最后一个颜色 / 菜单里锚点被取消勾选（含父级联动）
  const [colorPanelKey, setColorPanelKey] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  // 配置列悬停锚点：高亮与对标预览跟随鼠标（null = 未悬停过，回退首个勾选配置）
  const [activeLeafKey, setActiveLeafKey] = useState<string | null>(null);

  // Keep string labels for the Cascader tags. The open menu is rendered below.
  const { options, groupKeyOfModel, romramNodeOf } = useMemo(() => {
    const gk = new Map<string, string>();
    const rn = new Map<string, RomramNode>();
    const opts = tree.map((g) => ({
      value: g.key,
      label: g.title,
      children: g.models.map((m) => {
        gk.set(m.modelId, g.key);
        return {
          value: m.modelId,
          label: m.label,
          children: m.romrams.map((r) => {
            rn.set(r.key, r);
            return { value: r.romram, label: r.romram };
          }),
        };
      }),
    }));
    return { options: opts, groupKeyOfModel: gk, romramNodeOf: rn };
  }, [tree]);

  // ProductSelection[] → 勾选路径（叶 = [系列/品牌, 产品, ROMRAM]）
  const value = useMemo(
    () =>
      list
        .map((sel) => {
          const g = groupKeyOfModel.get(sel.modelId);
          return g != null ? [g, sel.modelId, sel.romram] : null;
        })
        .filter((v): v is string[] => v != null),
    [list, groupKeyOfModel],
  );

  // 勾选路径 → ProductSelection[]：新勾选配置默认带最低价颜色，已有勾选原样保留。
  // 第八十六轮：productLevel 用 SHOW_PARENT——整产品勾满时 onChange 只给 2 段父路径
  //（部分勾选仍是 3 段叶路径），此处按路径长度展开成全部 ROM 勾选。
  const onChange = (values: (string | number)[][]): void => {
    const next: ProductSelection[] = [];
    const pushRom = (modelId: string, r: RomramNode): void => {
      const keep = findSelection(list, r);
      next.push(keep ? { ...keep } : { modelId, romram: r.romram, skuIds: defaultColorSkuIds(r) });
    };
    for (const path of values) {
      if (path.length >= 3) {
        const modelId = String(path[1]);
        const romram = String(path[2]);
        const node = romramNodeOf.get(`${modelId}|${romram}`);
        if (node) pushRom(modelId, node);
      } else if (productLevel && path.length === 2) {
        const modelId = String(path[1]);
        const model = tree.flatMap((g) => g.models).find((m) => m.modelId === modelId);
        for (const r of model?.romrams ?? []) pushRom(modelId, r);
      } else if (productLevel && path.length === 1) {
        const grp = tree.find((g) => g.key === String(path[0]));
        for (const m of grp?.models ?? []) for (const r of m.romrams) pushRom(m.modelId, r);
      }
    }
    writeList(next);
    // 锚点档位被取消勾选（含父级联动传导）→ 同步收起颜色浮层
    if (colorPanelKey && !next.some((s) => `${s.modelId}|${s.romram}` === colorPanelKey)) {
      setColorPanelKey(null);
    }
  };

  // 已选标签：显产品名（labels[1] = option.label = 型号名，非 modelId）。
  // productLevel（SHOW_PARENT）：整产品勾满 = 2 段父路径 → 产品名；部分勾选 = 3 段
  // 叶路径 → 产品名 · ROM（提示粒度收窄）；整组合选 = 1 段组名。杜绝空标签。
  const displayRender = (labels: string[]): ReactNode => {
    if (!labels || labels.length === 0) return '';
    if (productLevel) return labels.length >= 3 ? `${labels[1]} · ${shortRomram(labels[2])}` : labels[labels.length - 1];
    const name = String(labels[1] ?? '');
    const romram = String(labels[2] ?? '');
    const sameModel = list.filter((s) => modelNameOf(s.modelId) === name).length;
    return sameModel > 1 ? `${name} · ${shortRomram(romram)}` : name;
  };

  // 颜色浮层节点（popupRender 挂到级联面板右侧）
  const colorPanelNode = useMemo(() => {
    if (!colorPanelKey) return null;
    const node = romramNodeOf.get(colorPanelKey);
    if (!node) return null;
    return (
      <ColorFlyout
        node={node}
        list={list}
        currency={state.currency}
        onToggle={(skuId, next) => {
          const after = toggleSku(list, node, skuId, next);
          writeList(after);
          // 取消最后一个颜色 = 整组退场 → 同步收起浮层
          if (!findSelection(after, node)) setColorPanelKey(null);
        }}
        onReset={() =>
          writeList(
            list.map((s) =>
              s.modelId === node.modelId && s.romram === node.romram ? { ...s, skuIds: defaultColorSkuIds(node) } : s,
            ),
          )
        }
      />
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorPanelKey, romramNodeOf, list, state.currency]);

  // Multiple Cascader does not restore an active path on open. Keep its trigger/tags,
  // but render a controlled three-column menu focused on the first selected leaf.
  const [activePath, setActivePath] = useState<[string, string] | null>(null);
  const firstSelection = list.find((s) => groupKeyOfModel.has(s.modelId));
  const initialGroup = firstSelection ? groupKeyOfModel.get(firstSelection.modelId) : tree[0]?.key;
  const group = tree.find((g) => g.key === activePath?.[0]) ?? tree.find((g) => g.key === initialGroup) ?? tree[0];
  const model = group?.models.find((m) => m.modelId === activePath?.[1])
    ?? group?.models.find((m) => m.modelId === firstSelection?.modelId)
    ?? group?.models[0];
  const configsOf = (models: typeof group.models) => models.flatMap((m) => m.romrams.map((r) => r));
  const checkStateOf = (nodes: RomramNode[]): CascadeRowItem['checkState'] => {
    const count = nodes.filter((r) => findSelection(list, r)).length;
    return count === nodes.length && count > 0 ? 'checked' : count > 0 ? 'indeterminate' : 'none';
  };
  const updateConfigs = (nodes: RomramNode[], checked: boolean) => {
    const keys = new Set(nodes.map((r) => r.key));
    const next = list.filter((s) => !keys.has(`${s.modelId}|${s.romram}`));
    if (checked) {
      for (const r of nodes) next.push(findSelection(list, r) ?? {
        modelId: r.modelId, romram: r.romram, skuIds: defaultColorSkuIds(r),
      });
    }
    writeList(next);
    if (colorPanelKey && !next.some((s) => `${s.modelId}|${s.romram}` === colorPanelKey)) setColorPanelKey(null);
  };
  const groupItems: CascadeRowItem[] = tree.map((g) => {
    const nodes = configsOf(g.models);
    return {
      key: g.key, label: g.title, active: group?.key === g.key,
      checkState: checkStateOf(nodes),
      onActivate: () => {
        setActivePath([g.key, g.models[0]?.modelId ?? '']);
        setActiveLeafKey(null);
      },
      onCheckChange: (checked) => updateConfigs(nodes, checked),
      onLabelClick: () => updateConfigs(nodes, checkStateOf(nodes) !== 'checked'),
    };
  });
  const modelItems: CascadeRowItem[] = (group?.models ?? []).map((m) => {
    const nodes = m.romrams;
    return {
      key: m.modelId, label: m.label, active: model?.modelId === m.modelId,
      checkState: checkStateOf(nodes),
      onActivate: () => {
        setActivePath([group.key, m.modelId]);
        setActiveLeafKey(null);
      },
      onCheckChange: (checked) => updateConfigs(nodes, checked),
      onLabelClick: () => updateConfigs(nodes, checkStateOf(nodes) !== 'checked'),
    };
  });
  const leafItems: CascadeRowItem[] = (model?.romrams ?? []).map((r) => {
    const pool = r.selectableColors.length ? r.selectableColors : r.colors;
    const chosen = findSelection(list, r);
    const selectedColors = pool.filter((c) => chosen?.skuIds.includes(c.skuId));
    const defaultColor = pool.find((c) => c.skuId === defaultColorSkuIds(r)[0])?.color ?? pool[0]?.color;
    const colorLabel = selectedColors.length > 1
      ? `${selectedColors[0].color}+${selectedColors.length - 1}`
      : selectedColors[0]?.color ?? defaultColor;
    return {
      key: r.key, label: r.romram,
      active: activeLeafKey != null
        ? r.key === activeLeafKey
        : r.key === `${firstSelection?.modelId}|${firstSelection?.romram}` && model?.modelId === firstSelection?.modelId,
      checkState: chosen ? 'checked' : 'none',
      onActivate: () => setActiveLeafKey(r.key),
      onCheckChange: (checked) => updateConfigs([r], checked),
      onLabelClick: () => updateConfigs([r], !chosen),
      trailing: colorLabel && (
        <button
          type="button" title={`颜色 ${colorLabel} · 点击修改`}
          onClick={(e) => { e.stopPropagation(); setColorPanelKey(r.key); }}
          onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
          style={{ ...COLOR_CHIP, width: 'auto', border: '1px solid rgba(0, 112, 243, 0.40)', fontFamily: 'inherit' }}
        >{colorLabel}</button>
      ),
    };
  });

  // 对标预览名单：悬停在配置行 = 该配置的精确映射；否则 = 当前型号的全部映射。
  // （配置列/型号列的行悬停都由 activePath/activeLeafKey 承载，无新增交互态）
  const benchPreview = useMemo(() => {
    if (kind !== 'own' || productLevel || !model) return null;
    const romram = activeLeafKey != null && activeLeafKey.startsWith(`${model.modelId}|`)
      ? activeLeafKey.slice(model.modelId.length + 1)
      : null;
    const seen = new Map<string, { key: string; name: string; spec: string; primary: boolean }>();
    for (const b of getEffectiveBenchmark()) {
      if (b.own_model_id !== model.modelId) continue;
      if (romram != null && b.own_romram !== romram) continue;
      const p = dimProduct.find((r) => r.sku_id === b.competitor_sku_id);
      if (!p) continue;
      const prev = seen.get(p.sku_id);
      if (prev) {
        if (b.sort === 1) prev.primary = true;
        continue;
      }
      seen.set(p.sku_id, {
        key: p.sku_id,
        name: modelNameOf(p.sku_id.split('__')[0]),
        spec: shortRomram(p.romram),
        primary: b.sort === 1,
      });
    }
    const items = [...seen.values()].sort((a, b) => Number(b.primary) - Number(a.primary));
    const label = `${model.label}${romram != null ? ` ${shortRomram(romram)}` : ''}`;
    return <BenchPreview modelLabel={label} items={items} />;
  }, [kind, productLevel, model, activeLeafKey]);

  return (
    <Cascader
      style={{ width: '100%' }}
      options={options}
      value={value}
      onChange={onChange as unknown as (value: unknown) => void}
      multiple
      // 第八十六轮：productLevel 用 SHOW_PARENT——整产品勾满坍缩成一个产品名标签
      //（部分勾选仍逐配置显示，提示粒度收窄）；竞品级联维持 SHOW_CHILD 逐配置标签
      showCheckedStrategy={productLevel ? Cascader.SHOW_PARENT : Cascader.SHOW_CHILD}
      maxTagCount="responsive"
      placeholder={kind === 'own' ? (emptyPlaceholder ?? '选择产品') : '选择竞品'}
      displayRender={displayRender}
      popupRender={() => (
        <div style={{ display: 'flex', alignItems: 'stretch' }}>
          <CascadePanel open={menuOpen} columns={productLevel ? [
            { width: 175, items: groupItems },
            { width: 215, items: modelItems },
          ] : [
            { width: 145, items: groupItems },
            { width: 190, items: modelItems },
            { width: 190, items: leafItems },
          ]} />
          {/* 颜色浮层打开时占住右侧位，对标预览让位（二者互斥控宽） */}
          {colorPanelNode ?? benchPreview}
        </div>
      )}
      onOpenChange={(open) => {
        setMenuOpen(open);
        if (open) {
          setActivePath([initialGroup ?? '', firstSelection?.modelId ?? tree[0]?.models[0]?.modelId ?? '']);
          // 配置列初始高亮 = 首个勾选配置（与旧视觉一致），悬停后跟随鼠标
          setActiveLeafKey(firstSelection ? `${firstSelection.modelId}|${firstSelection.romram}` : null);
        } else {
          setColorPanelKey(null);
          setActiveLeafKey(null);
        }
      }}
    />
  );
}

export function OwnProductControl(p: {
  selection?: ProductSelection[];
  onSelectionChange?: (next: ProductSelection[]) => void;
  emptyPlaceholder?: string;
  productLevel?: boolean;
} = {}) {
  return <ProductCascadeControl kind="own" {...p} />;
}

export function CompetitorControl() {
  return <ProductCascadeControl kind="comp" />;
}

/** 按档位主体模式的档位选择器：选项 = 当前产业下有我司产品的价格档位（高档在前） */
export function TierControl() {
  const { state, actions } = useFilters();
  const options = useMemo(() => {
    const present = new Set<string>();
    for (const p of dimProduct) {
      if (p.is_own && p.industry === state.industry && p.countries.includes(state.countryCode)) present.add(tierOf(p, state.countryCode));
    }
    const order = [...tierOrderOf(state.industry)].reverse();
    return order.filter((t) => present.has(t)).map((t) => ({ value: t, label: tierLabelShort(TIER_LABELS[t] ?? t) }));
  }, [state.industry, state.countryCode]);
  const value = state.tier != null && options.some((o) => o.value === state.tier) ? state.tier : undefined;
  return (
    <Select
      id="subject-tier"
      aria-label="价格档位"
      value={value}
      placeholder="选择价格档位"
      style={{ width: '100%' }}
      popupMatchSelectWidth={false}
      onChange={(v) => actions.set({ tier: v as DimProduct['tier_code'] })}
      options={options}
      allowClear={false}
    />
  );
}
