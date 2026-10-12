// ============================================================
// §5.2 框二：产品（反馈 2.1 + 第 1/8/9 条重构；第十四轮级联标准化；第十五轮标签/颜色）
// ① 产业：收起为下拉单选（手机默认；平板/穿戴/音频置灰 #a1a1a1 + 🔒）
// ② 华为产品 / ③ 竞品产品：**标准 antd Cascader multiple**（完全参考官方
//    cascader-demo-multiple：multiple + maxTagCount="responsive"）——
//    系列（我司）/ 品牌（竞品）→ 产品名 → RAM+ROM（叶层），全层标准勾选传播，
//    勾系列/产品 = 其下全部配置；自定义三列面板 / SKU 弹框 / 均值徽标已删除。
//    勾选语义保持不变：每个勾选配置仍取默认最低价颜色（defaultColorSkuIds），
//    匹配竞品/匹配上一代带出的组原样保留。
// 第十五轮：① 已选标签（displayRender）显产品名——倒数第二层才可读（ROMRAM 看不懂），
//    同产品多配置时补 ROMRAM 后缀区分；② 档位行内「颜色」小按钮（按钮名 = 当前
//    生效颜色，默认 = 最低价色），点击在级联面板右侧弹出颜色浮层：可多选颜色
//    （多选时折后价取所选颜色均价——只改 skuIds 集合，下游聚合天然均值）、
//    「恢复默认色」一键回退；未勾选时点颜色按钮 = 先勾上该配置再弹层。
// 反馈第 8 条：竞品不随我司产品自动带出；「匹配竞品」按钮点击才按配置矩阵
// （configStore / LPL3.config.benchmark，缺省 dimBenchmark）为当前所有已选我司产品
// 带出默认竞品组（并集、主竞品在前），再次点击重新匹配；带出后临时增删不回写配置。
// 「匹配上一代」（第四轮新增）：按生效上一代关系（LPL3.config.prevGen 手动维护优先，
// 回退 dim_product.prev_model_id）为当前已选我司产品带出上一代同配置组（追加不覆盖，
// 幂等可反复点击）；上一代关系在配置页「上一代关系」块维护。
// 两个匹配按钮均为关键功能：浅蓝底+蓝描边+图标显性化（区别于普通文字链接）。
// ============================================================
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Button, Cascader, Checkbox, Select, Tooltip, message } from 'antd';
import { AimOutlined, HistoryOutlined } from '@ant-design/icons';
import { useFilters } from '../../state/FiltersContext';
import { groupsFromPrevGeneration } from '../../state/configStore';
import { color, fontSize, formatPrice, radius, selectSoft, selectSoftInk, space } from '../../theme/tokens';
import {
  addRomram,
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

// ---------------- 「匹配竞品」/「匹配上一代」（关键功能按钮） ----------------

/**
 * 两个匹配按钮的显性化样式（浅蓝底 + 蓝描边 + 图标 + 600 字重）：
 * 悬停由 antd 默认接管（筛选条作用域 colorPrimary=selectAccent，蓝边蓝字加深）。
 */
const MATCH_BTN_STYLE: CSSProperties = {
  height: 24,
  padding: '0 10px',
  fontSize: fontSize.caption,
  fontWeight: 600,
  color: selectSoftInk,
  background: selectSoft,
  borderColor: 'rgba(0, 112, 243, 0.40)',
  borderRadius: radius.control,
  boxShadow: 'none',
};

/** 竞品产品标题旁按钮：按配置矩阵为当前已选我司产品带出默认竞品组 */
export function MatchCompetitorButton() {
  const { actions } = useFilters();
  return (
    <Tooltip title="按配置矩阵带出当前已选我司产品的默认竞品组；矩阵可在「配置」页维护">
      <Button
        type="default"
        size="small"
        icon={<AimOutlined />}
        style={MATCH_BTN_STYLE}
        onClick={actions.resetCompetitorsToConfig}
      >
        匹配竞品
      </Button>
    </Tooltip>
  );
}

/** 华为产品标题旁按钮：按生效上一代关系带出上一代同配置组（追加、幂等） */
export function MatchPrevGenButton() {
  const { state, actions } = useFilters();
  const onClick = () => {
    if (!state.own.length) {
      message.warning('请先在「华为产品」选择产品');
      return;
    }
    const { added, missing } = groupsFromPrevGeneration(state.own);
    if (added.length) {
      actions.setOwnSelection([...state.own, ...added]);
      const names = added.map((g) => `${modelNameOf(g.modelId)} · ${shortRomram(g.romram)}`).join('、');
      const missNote = missing.length ? `；${missing.join('、')} 未维护上一代关系` : '';
      message.success(`已带出上一代：${names}${missNote}`);
    } else if (missing.length) {
      message.warning(`未维护上一代关系：${missing.join('、')}（可在「配置」页维护）`);
    } else {
      message.info('上一代产品已全部在选中列表中');
    }
  };
  return (
    <Tooltip title="为当前已选我司产品带出上一代型号（同配置自动勾选），用于新旧代际价格对比；上一代关系可在「配置」页维护">
      <Button type="default" size="small" icon={<HistoryOutlined />} style={MATCH_BTN_STYLE} onClick={onClick}>
        匹配上一代
      </Button>
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

/**
 * 我司/竞品共用的标准级联多选（官方 cascader-demo-multiple 同款：
 * `<Cascader multiple maxTagCount="responsive" />`）。
 * options：系列（我司）/ 品牌（竞品）→ 产品名 → RAM+ROM（叶层，附「颜色」按钮）；
 * 全层标准勾选传播（勾系列/产品 = 其下全部配置），父子联动由 antd 接管。
 * value ↔ ProductSelection[] 双向映射：路径 = [系列/品牌 key, modelId, romram]，
 * 勾选配置的 skuIds 保持默认最低价颜色（defaultColorSkuIds），已有勾选原样保留；
 * 颜色浮层改写的 skuIds 走同一数据通道。
 */
function ProductCascadeControl({ kind }: { kind: 'own' | 'comp' }) {
  const { state, actions } = useFilters();
  const tree = useMemo(() => (kind === 'own' ? buildOwnTree() : buildCompetitorTree()), [kind]);

  const list = kind === 'own' ? state.own : state.competitors;
  const writeList = (next: ProductSelection[]): void => {
    if (kind === 'own') actions.setOwnSelection(next);
    else actions.set({ competitors: next }); // 竞品临时增删不回写配置（§5.2③/§13）
  };

  // 颜色浮层锚点档位（`${modelId}|${romram}`），null = 收起
  const [colorPanelKey, setColorPanelKey] = useState<string | null>(null);

  // 勾选被移除（含在浮层里取消最后一个颜色 → 整组退场）时同步收起浮层
  useEffect(() => {
    if (colorPanelKey && !list.some((s) => `${s.modelId}|${s.romram}` === colorPanelKey)) {
      setColorPanelKey(null);
    }
  }, [list, colorPanelKey]);

  // options + 路径查询表（系列/品牌 key ↔ modelId；modelId|romram ↔ 配置节点）。
  // 叶层 label = ROMRAM + 「颜色」按钮（按钮名 = 当前生效颜色，默认 = 最低价色）；
  // 依赖 list：按钮文案随颜色多选即时更新。
  const { options, groupKeyOfModel, romramNodeOf } = useMemo(() => {
    const gk = new Map<string, string>();
    const rn = new Map<string, RomramNode>();
    const leafLabel = (r: RomramNode): ReactNode => {
      const pool = r.selectableColors.length ? r.selectableColors : r.colors;
      if (!pool.length) return r.romram;
      const sel = findSelection(list, r);
      const chosen = sel ? pool.filter((c) => sel.skuIds.includes(c.skuId)) : [];
      const defIds = defaultColorSkuIds(r);
      const defColor = pool.find((c) => c.skuId === defIds[0])?.color ?? pool[0].color;
      const text =
        chosen.length === 0
          ? defColor
          : chosen.length === 1
            ? chosen[0].color
            : `${chosen[0].color}+${chosen.length - 1}`;
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span>{r.romram}</span>
          <span
            role="button"
            title={`颜色 ${text} · 点击修改（可多选，多选取均价）`}
            onClick={(e) => {
              e.stopPropagation(); // 只弹颜色浮层，不触发档位勾选/取消
              e.preventDefault();
              if (!findSelection(list, r)) writeList(addRomram(list, r));
              setColorPanelKey(r.key);
            }}
            onMouseDown={(e) => {
              // 与 antd popup 同款：挡住 mousedown 默认行为（防焦点转移关弹层），
              // 同时不冒泡给 rc 的关闭/勾选监听
              e.stopPropagation();
              e.preventDefault();
            }}
            style={COLOR_CHIP}
          >
            {text}
          </span>
        </span>
      );
    };
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
            return { value: r.romram, label: leafLabel(r) };
          }),
        };
      }),
    }));
    return { options: opts, groupKeyOfModel: gk, romramNodeOf: rn };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, list]);

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
  };

  // 已选标签：显产品名（倒数第二层）；同产品多配置时补 ROMRAM 后缀区分
  const displayRender = (_labels: string[], selectedOptions?: { value?: unknown }[]): ReactNode => {
    const modelId = String(selectedOptions?.[1]?.value ?? '');
    const romram = String(selectedOptions?.[2]?.value ?? '');
    const sameModel = list.filter((s) => s.modelId === modelId).length;
    return sameModel > 1 ? `${modelNameOf(modelId)} · ${shortRomram(romram)}` : modelNameOf(modelId);
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
        onToggle={(skuId, next) => writeList(toggleSku(list, node, skuId, next))}
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

  return (
    <Cascader
      style={{ width: '100%' }}
      options={options}
      value={value}
      onChange={onChange as unknown as (value: unknown) => void}
      multiple
      maxTagCount="responsive"
      placeholder={kind === 'own' ? '选择产品' : '选择竞品'}
      displayRender={displayRender}
      popupRender={(menu) => (
        <div style={{ display: 'flex', alignItems: 'stretch' }}>
          {menu}
          {colorPanelNode}
        </div>
      )}
      onOpenChange={(open) => {
        if (!open) setColorPanelKey(null);
      }}
    />
  );
}

export function OwnProductControl() {
  return <ProductCascadeControl kind="own" />;
}

export function CompetitorControl() {
  return <ProductCascadeControl kind="comp" />;
}
