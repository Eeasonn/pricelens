// ============================================================
// §5.2 框二：产品（反馈 2.1 + 第 1/8/9 条重构；第十四轮级联标准化）
// ① 产业：收起为下拉单选（手机默认；平板/穿戴/音频置灰 #a1a1a1 + 🔒）
// ② 华为产品 / ③ 竞品产品：**标准 antd Cascader multiple**（完全参考官方
//    cascader-demo-multiple：multiple + maxTagCount="responsive"）——
//    系列（我司）/ 品牌（竞品）→ 产品名 → RAM+ROM（叶层），全层标准勾选传播，
//    勾系列/产品 = 其下全部配置；自定义三列面板 / SKU 弹框 / 均值徽标已删除。
//    勾选语义保持不变：每个勾选配置仍取默认最低价颜色（defaultColorSkuIds），
//    匹配竞品/匹配上一代带出的组原样保留。
// 反馈第 8 条：竞品不随我司产品自动带出；「匹配竞品」按钮点击才按配置矩阵
// （configStore / LPL3.config.benchmark，缺省 dimBenchmark）为当前所有已选我司产品
// 带出默认竞品组（并集、主竞品在前），再次点击重新匹配；带出后临时增删不回写配置。
// 「匹配上一代」（第四轮新增）：按生效上一代关系（LPL3.config.prevGen 手动维护优先，
// 回退 dim_product.prev_model_id）为当前已选我司产品带出上一代同配置组（追加不覆盖，
// 幂等可反复点击）；上一代关系在配置页「上一代关系」块维护。
// 两个匹配按钮均为关键功能：浅蓝底+蓝描边+图标显性化（区别于普通文字链接）。
// ============================================================
import { useMemo, type CSSProperties } from 'react';
import { Button, Cascader, Select, Tooltip, message } from 'antd';
import { AimOutlined, HistoryOutlined } from '@ant-design/icons';
import type { ReactNode } from 'react';
import { useFilters } from '../../state/FiltersContext';
import { groupsFromPrevGeneration } from '../../state/configStore';
import { color, fontSize, radius, selectSoft, selectSoftInk } from '../../theme/tokens';
import {
  buildCompetitorTree,
  buildOwnTree,
  defaultColorSkuIds,
  findSelection,
  modelNameOf,
  shortRomram,
  type RomramNode,
} from '../ProductCascader/tree';
import type { ProductSelection } from '../../state/filtersTypes';

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

// ---------------- ②③ 产品级联（标准 antd Cascader multiple，第十四轮） ----------------

/**
 * 我司/竞品共用的标准级联多选（官方 cascader-demo-multiple 同款：
 * `<Cascader multiple maxTagCount="responsive" />`）。
 * options：系列（我司）/ 品牌（竞品）→ 产品名 → RAM+ROM（叶层）；
 * 全层标准勾选传播（勾系列/产品 = 其下全部配置），父子联动由 antd 接管。
 * value ↔ ProductSelection[] 双向映射：路径 = [系列/品牌 key, modelId, romram]，
 * 勾选配置的 skuIds 保持默认最低价颜色（defaultColorSkuIds），已有勾选原样保留。
 */
function ProductCascadeControl({ kind }: { kind: 'own' | 'comp' }) {
  const { state, actions } = useFilters();
  const tree = useMemo(() => (kind === 'own' ? buildOwnTree() : buildCompetitorTree()), [kind]);

  const list = kind === 'own' ? state.own : state.competitors;
  const writeList = (next: ProductSelection[]): void => {
    if (kind === 'own') actions.setOwnSelection(next);
    else actions.set({ competitors: next }); // 竞品临时增删不回写配置（§5.2③/§13）
  };

  // options + 路径查询表（系列/品牌 key ↔ modelId；modelId|romram ↔ 配置节点）
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
  };

  return (
    <Cascader
      style={{ width: '100%' }}
      options={options}
      value={value}
      onChange={onChange as unknown as (value: unknown) => void}
      multiple
      maxTagCount="responsive"
      placeholder={kind === 'own' ? '选择产品' : '选择竞品'}
    />
  );
}

export function OwnProductControl() {
  return <ProductCascadeControl kind="own" />;
}

export function CompetitorControl() {
  return <ProductCascadeControl kind="comp" />;
}
