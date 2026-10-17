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
import type { CurrencyMode } from '../../dataModel/types';
import { CascadePanel, type CascadeRowItem } from '../ProductCascader';

// ---------------- ① 产业下拉（反馈 2.1） ----------------

function lockedOption(text: string): ReactNode {
  return <span style={{ color: color.hairlineStrong }}>{text} 🔒</span>;
}

export function IndustryControl() {
  const { state } = useFilters();
  return (
    <Select
      value={state.industry}
      style={{ width: '100%' }}
      popupMatchSelectWidth={false}
      onChange={() => {
        /* 平板/穿戴/音频置灰（§5.2①），手机唯一可选 */
      }}
      options={[
        { value: 'phone', label: '手机' },
        { value: 'pad', label: lockedOption('平板'), disabled: true },
        { value: 'wear', label: lockedOption('穿戴'), disabled: true },
        { value: 'audio', label: lockedOption('音频'), disabled: true },
      ]}
    />
  );
}

// ---------------- 竞品自动匹配模式 ----------------

/** Auto is a selectable mode, not a lock on the competitor cascader. */
export function AutoMatchControl() {
  const { state, actions } = useFilters();
  return (
    <Tooltip title={state.autoMatch ? '已按我司产品自动匹配竞品；直接修改右侧竞品会退出自动模式' : '点击后按我司产品重新匹配竞品'}>
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
              {formatPrice(currency === 'usd' ? c.latestUsd : c.latestRub, currency)}
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

/** Cascader owns the selected tags; CascadePanel owns the open three-column path. */
function ProductCascadeControl({
  kind,
  selection,
  onSelectionChange,
}: {
  kind: 'own' | 'comp';
  /** 第四十三轮：受控注入（总览产品筛选复用同款级联）；缺省 = 绑定 FiltersContext */
  selection?: ProductSelection[];
  onSelectionChange?: (next: ProductSelection[]) => void;
}) {
  const { state, actions } = useFilters();
  const tree = useMemo(() => (kind === 'own' ? buildOwnTree(state.industry) : buildCompetitorTree()), [kind, state.industry]);
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

  // 勾选路径 → ProductSelection[]：新勾选配置默认带最低价颜色，已有勾选原样保留
  const onChange = (values: (string | number)[][]): void => {
    const next: ProductSelection[] = [];
    for (const path of values) {
      const modelId = String(path[1]);
      const romram = String(path[2]);
      const node = romramNodeOf.get(`${modelId}|${romram}`);
      if (!node) continue;
      const keep = findSelection(list, node);
      next.push(keep ? { ...keep } : { modelId, romram, skuIds: defaultColorSkuIds(node) });
    }
    writeList(next);
    // 锚点档位被取消勾选（含父级联动传导）→ 同步收起颜色浮层
    if (colorPanelKey && !next.some((s) => `${s.modelId}|${s.romram}` === colorPanelKey)) {
      setColorPanelKey(null);
    }
  };

  // 已选标签：显产品名（labels[1] = option.label = 型号名，非 modelId）；同产品
  // 多配置时补 ROMRAM 后缀区分。<3 段的父路径兜底显示末段，杜绝空标签。
  const displayRender = (labels: string[]): ReactNode => {
    if (!labels || labels.length < 3) return labels?.[labels.length - 1] ?? '';
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
      onActivate: () => setActivePath([g.key, g.models[0]?.modelId ?? '']),
      onCheckChange: (checked) => updateConfigs(nodes, checked),
      onLabelClick: () => updateConfigs(nodes, checkStateOf(nodes) !== 'checked'),
    };
  });
  const modelItems: CascadeRowItem[] = (group?.models ?? []).map((m) => {
    const nodes = m.romrams;
    return {
      key: m.modelId, label: m.label, active: model?.modelId === m.modelId,
      checkState: checkStateOf(nodes),
      onActivate: () => setActivePath([group.key, m.modelId]),
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
      active: r.key === `${firstSelection?.modelId}|${firstSelection?.romram}` && model?.modelId === firstSelection?.modelId,
      checkState: chosen ? 'checked' : 'none',
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

  return (
    <Cascader
      style={{ width: '100%' }}
      options={options}
      value={value}
      onChange={onChange as unknown as (value: unknown) => void}
      multiple
      // 第三十轮：整组勾满时 SHOW_PARENT（antd 默认）会把全部叶子路径坍缩成一个
      // 父路径（如 ["Mate"]），displayRender 拿不到型号段 → 触发器空标签。
      // 改 SHOW_CHILD：value 恒为叶子三段路径，标签=逐配置，与「匹配竞品」
      // 带出的部分勾选语义一致。
      showCheckedStrategy={Cascader.SHOW_CHILD}
      maxTagCount="responsive"
      placeholder={kind === 'own' ? '选择产品' : '选择竞品'}
      displayRender={displayRender}
      popupRender={() => (
        <div style={{ display: 'flex', alignItems: 'stretch' }}>
          <CascadePanel open={menuOpen} columns={[
            { width: 145, items: groupItems },
            { width: 190, items: modelItems },
            { width: 190, items: leafItems },
          ]} />
          {colorPanelNode}
        </div>
      )}
      onOpenChange={(open) => {
        setMenuOpen(open);
        if (open) setActivePath([initialGroup ?? '', firstSelection?.modelId ?? tree[0]?.models[0]?.modelId ?? '']);
        else setColorPanelKey(null);
      }}
    />
  );
}

export function OwnProductControl(p: {
  selection?: ProductSelection[];
  onSelectionChange?: (next: ProductSelection[]) => void;
} = {}) {
  return <ProductCascadeControl kind="own" {...p} />;
}

export function CompetitorControl() {
  return <ProductCascadeControl kind="comp" />;
}
