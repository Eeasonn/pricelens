// ============================================================
// §5.2 框二：产品（反馈 2.1 + 第 1/8/9 条重构）
// ① 产业：收起为下拉单选（手机默认；平板/穿戴/音频置灰 #a1a1a1 + 🔒）
// ② 华为产品 / ③ 竞品产品：三层级联
//    系列（我司）/ 品牌（竞品）→ 产品名（仅展开、不可勾选）→ RAM+ROM（勾选层：
//    checkbox + 行尾「配置 SKU…」按钮 + 均值徽标；ROMRAM 主数据原样显示，如 12+256 GB）
//    默认勾选仍落 RAM+ROM 层、自动带最低价颜色（lowestPriceColorSku）；多 SKU 均值徽标保留
// 「配置 SKU…」→ 居中小弹框（SkuModal ~380px，反馈第 9 条；原 360px 右侧抽屉已删除）
// 反馈第 8 条：竞品不随我司产品自动带出；「匹配竞品」按钮点击才按配置矩阵
// （configStore / LPL3.config.benchmark，缺省 dimBenchmark）为当前所有已选我司产品
// 带出默认竞品组（并集、主竞品在前），再次点击重新匹配；带出后临时增删不回写配置。
// 「匹配上一代」（第四轮新增）：按生效上一代关系（LPL3.config.prevGen 手动维护优先，
// 回退 dim_product.prev_model_id）为当前已选我司产品带出上一代同配置组（追加不覆盖，
// 幂等可反复点击）；上一代关系在配置页「上一代关系」块维护。
// 两个匹配按钮均为关键功能：浅蓝底+蓝描边+图标显性化（区别于普通文字链接）。
// ============================================================
import { useMemo, useState, type CSSProperties } from 'react';
import { Button, Popover, Select, Tooltip, message } from 'antd';
import { AimOutlined, HistoryOutlined } from '@ant-design/icons';
import type { ReactNode } from 'react';
import { useFilters } from '../../state/FiltersContext';
import { groupsFromPrevGeneration } from '../../state/configStore';
import { color, fontSize, radius, selectSoft, selectSoftInk } from '../../theme/tokens';
import BrandDot from '../BrandMark';
import { CascadePanel, CascadeTrigger, MeanBadge, SkuModal } from '../ProductCascader';
import type { CascadeRowItem } from '../ProductCascader';
import {
  addRomram,
  addRomrams,
  brandOfModel,
  buildCompetitorTree,
  buildOwnTree,
  checkStateOfChildren,
  checkStateOfRomram,
  findSelection,
  modelNameOf,
  ownBrand,
  removeRomram,
  removeRomrams,
  selectionLabel,
  shortRomram,
  toggleSku,
  type ModelNode,
  type RomramNode,
} from '../ProductCascader/tree';
import type { ProductSelection } from '../../state/filtersTypes';

/** 「配置 SKU…」按钮文案（逐字照抄 spec，含中文省略号） */
const CONFIG_SKU_TEXT = '配置 SKU…';

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

// ---------------- ②③ 产品级联（我司/竞品对称三层） ----------------

/** 「配置 SKU…」行尾按钮（RAM+ROM 勾选层 → 居中小弹框的入口） */
function ConfigSkuButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="link"
      size="small"
      style={{ padding: 0, height: 22, fontSize: fontSize.caption, flexShrink: 0 }}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {CONFIG_SKU_TEXT}
    </Button>
  );
}

// 第一列 136：品牌色小点 + 品牌文本（checkbox + 点 + 最长品牌名并排）
const CASCADE_WIDTHS = { group: 136, model: 152, romram: 240 };

/** 竞品触发器品牌图标：所选竞品同品牌 → 该品牌；混品牌 → 空串（不出图） */
function compTriggerBrand(list: ProductSelection[]): string {
  const brands = new Set(list.map((s) => brandOfModel(s.modelId)));
  return brands.size === 1 ? [...brands][0] : '';
}

/**
 * 我司/竞品共用的三层级联控件：
 * 列 1 系列/品牌（勾选=整组勾选）、列 2 产品名（仅展开，无 checkbox）、
 * 列 3 RAM+ROM（勾选层 + 均值徽标 + 「配置 SKU…」→ 居中弹框）。
 */
function ProductCascadeControl({ kind }: { kind: 'own' | 'comp' }) {
  const { state, actions } = useFilters();
  const tree = useMemo(() => (kind === 'own' ? buildOwnTree() : buildCompetitorTree()), [kind]);

  const list = kind === 'own' ? state.own : state.competitors;
  const writeList = (next: ProductSelection[]): void => {
    if (kind === 'own') actions.setOwnSelection(next);
    else actions.set({ competitors: next }); // 竞品临时增删不回写配置（§5.2③/§13）
  };

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string[]>([]);
  // 弹框节点与开关分离：关闭动画期间保留 node，避免标题闪回「配置 SKU」
  const [modalNode, setModalNode] = useState<RomramNode | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // ---- 活动路径（hover 展开）：[组, 产品名, ROMRAM?] ----
  const group = tree.find((g) => g.key === active[0]) ?? null;
  const activeModel: ModelNode | null = group?.models.find((m) => m.key === active[1]) ?? null;
  const shownGroup = group ?? tree[0] ?? null;
  const shownModel: ModelNode | null = activeModel ?? shownGroup?.models[0] ?? null;
  const shownRomram: RomramNode | null =
    shownModel?.romrams.find((r) => r.key === active[2]) ?? shownModel?.romrams[0] ?? null;

  // 打开面板时把活动路径修正到首个勾选组 / 首个叶节点
  const defaultPath = (): string[] => {
    const sel = list[0];
    for (const g of tree) {
      for (const m of g.models) {
        for (const r of m.romrams) {
          if (!sel || (r.modelId === sel.modelId && r.romram === sel.romram)) return [g.key, m.key, r.key];
        }
      }
    }
    return tree.length ? [tree[0].key] : [];
  };

  const columns: { width: number; items: CascadeRowItem[] }[] = [
    {
      width: CASCADE_WIDTHS.group,
      // 第一列前置品牌图标：我司=系列列（恒 HUAWEI）、竞品=品牌列（行品牌名即 key）
      items: tree.map<CascadeRowItem>((g) => ({
        key: g.key,
        label: g.title,
        leading: <BrandDot brand={kind === 'own' ? ownBrand() : g.key} />,
        checkState: checkStateOfChildren(list, g.models.flatMap((m) => m.romrams)),
        onCheckChange: (next) => {
          const all = g.models.flatMap((m) => m.romrams);
          writeList(next ? addRomrams(list, all) : removeRomrams(list, all));
        },
        onActivate: () => setActive([g.key]),
        active: shownGroup?.key === g.key,
      })),
    },
    {
      width: CASCADE_WIDTHS.model,
      // 产品名层仅展开不可勾选（反馈第 1 条）：无 checkState → 无 checkbox
      items: (shownGroup?.models ?? []).map<CascadeRowItem>((m) => ({
        key: m.key,
        label: m.label,
        onActivate: () => setActive([shownGroup!.key, m.key]),
        active: shownModel?.key === m.key,
      })),
    },
    {
      width: CASCADE_WIDTHS.romram,
      // RAM+ROM = 勾选层；ROMRAM 显示主数据原样（如 `12+256 GB`，Apple 仅容量 `256 GB`）
      items: (shownModel?.romrams ?? []).map<CascadeRowItem>((r) => {
        const sel = findSelection(list, r);
        return {
          key: r.key,
          label: r.romram,
          checkState: checkStateOfRomram(list, r),
          onCheckChange: (next) => writeList(next ? addRomram(list, r) : removeRomram(list, r)),
          onActivate: () => setActive([shownGroup!.key, shownModel!.key, r.key]),
          active: shownRomram?.key === r.key,
          trailing: (
            <>
              {sel && sel.skuIds.length > 1 ? <MeanBadge count={sel.skuIds.length} /> : null}
              <ConfigSkuButton onClick={() => { setModalNode(r); setModalOpen(true); }} />
            </>
          ),
        };
      }),
    },
  ];

  // ---- 配置 SKU 弹框（反馈第 9 条：居中 Modal，替代原右侧抽屉） ----
  const modalChecked = modalNode ? (findSelection(list, modalNode)?.skuIds ?? []) : [];
  const handleSkuToggle = (skuId: string, next: boolean) => {
    if (!modalNode) return;
    writeList(toggleSku(list, modalNode, skuId, next));
  };

  // ---- 触发器内容 ----
  const labels = list.map(selectionLabel);
  const badges = list
    .filter((s) => s.skuIds.length > 1)
    .slice(0, 2) // 触发器宽度有限：均值徽标最多展示 2 枚，完整信息见 Tooltip
    .map((s) => <MeanBadge key={`${s.modelId}|${s.romram}`} count={s.skuIds.length} />);

  return (
    <>
      <Popover
        trigger="click"
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (o) {
            // 修正活动路径：失效时回落到首个勾选组 / 首个叶节点
            const g = tree.find((x) => x.key === active[0]);
            if (!g) setActive(defaultPath());
            else if (!g.models.some((m) => m.key === active[1])) setActive([g.key]);
          }
        }}
        arrow={false}
        placement="bottomLeft"
        styles={{ body: { padding: 0 } as const }}
        content={<CascadePanel columns={columns} />}
      >
        <div>
          <CascadeTrigger
            labels={labels}
            badges={badges}
            placeholder={kind === 'own' ? '选择产品' : '选择竞品'}
            open={open}
            leading={<BrandDot brand={kind === 'own' ? ownBrand() : compTriggerBrand(list)} />}
          />
        </div>
      </Popover>
      <SkuModal
        node={modalNode}
        open={modalOpen}
        checkedSkuIds={modalChecked}
        currency={state.currency}
        onClose={() => setModalOpen(false)}
        afterClose={() => setModalNode(null)}
        onToggle={handleSkuToggle}
      />
    </>
  );
}

export function OwnProductControl() {
  return <ProductCascadeControl kind="own" />;
}

export function CompetitorControl() {
  return <ProductCascadeControl kind="comp" />;
}
