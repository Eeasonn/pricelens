// 产业下拉与「自有产品」受控级联（总览筛选行复用）。
// 第一百一十七轮：看板侧我司/竞品级联与自动匹配按钮由「选择产品」浮窗取代，
// 本文件只保留总览仍需要的控件；ColorFlyout 已抽至 ProductCascader/ColorFlyout。
// 第一百二十三轮：TierControl（按档位模式选择器）随主体模式退役删除——
// 档位筛选融入「选择产品」浮窗的树（ProductPickerModal.LevelSwitchPopover）。
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Cascader, Checkbox, Select, Tooltip } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { useFilters } from '../../state/FiltersContext';
import { color, fontSize, formatPrice, radius, selectAccent, selectSoft, selectSoftInk } from '../../theme/tokens';
import {
  buildOwnTree,
  defaultColorSkuIds,
  findSelection,
  modelNameOf,
  configTextOf,
  toggleSku,
  type RomramNode,
} from '../ProductCascader/tree';
import type { ProductSelection } from '../../state/filtersTypes';
import type { CurrencyMode } from '../../dataModel/types';
import { CascadePanel, measureText, type CascadeRowItem } from '../ProductCascader';
import ColorFlyout, { COLOR_CHIP } from '../ProductCascader/ColorFlyout';
import { INDUSTRY_LABELS, INDUSTRY_ORDER, industriesOfCountry } from '../../dataModel/scope';

// ---------------- ① 产业下拉（反馈 2.1） ----------------

function lockedOption(text: string): ReactNode {
  return (
    <span style={{ color: color.hairlineStrong }}>
      {text} <LockOutlined style={{ fontSize: 10 }} />
    </span>
  );
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

// ---------------- ②③ 产品级联（标准 antd Cascader multiple） ----------------

// 已选标签内容用 displayRender 定制（multiple 模式下它就是每个标签的文案；
// 注意 tagRender 拿到的 value 是 rc-cascader 拼接后的标量 key，不是路径，不可用）。

/** Cascader owns the selected tags; CascadePanel owns the open three-column path. */
function ProductCascadeControl({
  selection,
  onSelectionChange,
  emptyPlaceholder,
  productLevel,
}: {
  /** 受控注入（总览产品筛选复用同款级联；第一百一十七轮起必须受控） */
  selection: ProductSelection[];
  onSelectionChange: (next: ProductSelection[]) => void;
  emptyPlaceholder?: string;
  /** 第八十六轮：收窄到产品层——面板只留组/型号两列，勾选型号即整产品；
   *  ROM 粒度的取舍交给看板标题行的配置 chips（消除上下重复入口） */
  productLevel?: boolean;
}) {
  const { state } = useFilters();
  const tree = useMemo(
    () => buildOwnTree(state.industry, state.countryCode),
    [state.industry, state.countryCode],
  );
  const list = selection;
  const writeList = (next: ProductSelection[]): void => onSelectionChange(next);

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
    if (productLevel) {
      const cfg = configTextOf(labels[2] ?? '');
      return labels.length >= 3 && cfg ? `${labels[1]} · ${cfg}` : labels[labels.length - 1];
    }
    const name = String(labels[1] ?? '');
    const romram = String(labels[2] ?? '');
    const sameModel = list.filter((s) => modelNameOf(s.modelId) === name).length;
    const cfg = configTextOf(romram);
    return sameModel > 1 && cfg ? `${name} · ${cfg}` : name;
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
      onActivate: () => {
        setActiveLeafKey(r.key);
      },
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
  // 配置列颜色胶囊的宽度预留（自适应列宽用）：最长胶囊文案按 11px 折算 + 胶囊内边距
  const leafChipW = (model?.romrams ?? []).reduce((w, r) => {
    const pool = r.selectableColors.length ? r.selectableColors : r.colors;
    const chosen = findSelection(list, r);
    const selectedColors = pool.filter((c) => chosen?.skuIds.includes(c.skuId));
    const defaultColor = pool.find((c) => c.skuId === defaultColorSkuIds(r)[0])?.color ?? pool[0]?.color;
    const colorLabel = selectedColors.length > 1
      ? `${selectedColors[0].color}+${selectedColors.length - 1}`
      : selectedColors[0]?.color ?? defaultColor;
    return Math.max(w, measureText(colorLabel ?? '') * (11 / 13));
  }, 0);
  const leafExtraW = Math.ceil(leafChipW + 20);

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
      placeholder={emptyPlaceholder ?? '选择产品'}
      displayRender={displayRender}
      popupRender={() => (
        <div style={{ display: 'flex', alignItems: 'stretch' }}>
          {/* 第一百一十五轮：列宽自适应（长产品名/型号完整显示），不再固定 145/190/190 */}
          <CascadePanel open={menuOpen} columns={productLevel ? [
            { items: groupItems },
            { items: modelItems },
          ] : [
            { items: groupItems },
            { items: modelItems },
            { items: leafItems, extraW: leafExtraW },
          ]} />
          {colorPanelNode}
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
  selection: ProductSelection[];
  onSelectionChange: (next: ProductSelection[]) => void;
  emptyPlaceholder?: string;
  productLevel?: boolean;
}) {
  return <ProductCascadeControl {...p} />;
}
