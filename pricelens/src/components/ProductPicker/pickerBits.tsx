// ============================================================
// 「选择产品」浮窗共用小件（第一百三十一轮自 ProductPickerModal 抽出，
// 代码原样搬运不改行为）：层级常量、颜色 chip、条目文本/配置 chip、
// 各类 pill、删组 ✕、树数据索引。模板编辑浮窗（TemplateEditorFlyout）
// 与主浮窗共用同一套视觉语言。
// ============================================================
import { useMemo, type ReactNode } from 'react';
import { Popover } from 'antd';
import { CloseOutlined, PlusOutlined, SwapOutlined } from '@ant-design/icons';
import { useFilters } from '../../state/FiltersContext';
import ColorFlyout from '../ProductCascader/ColorFlyout';
import { brandLabelOf } from '../BrandMark';
import { color, radius, selectSoftInk } from '../../theme/tokens';
import {
  brandOfModel,
  buildProductTree,
  configTextOf,
  defaultColorSkuIds,
  measureText,
  modelNameOf,
  type RomramNode,
} from '../ProductCascader';

// ---------------- 层级 ----------------

// 层级：浮窗面板压过页面全部内容；模板编辑浮窗再高一档；面板内再弹层
// （树/颜色/轻确认）更高一档，气泡提示再高一档（antd Tooltip 缺省层级低于面板，
// 须显式抬升）
export const PANEL_Z = 1500;
export const EDITOR_Z = 1550;
export const POPOVER_Z = 1600;
export const TIP_Z = 1650;

export const POPOVER_H = 300; // 树浮窗列高（固定，不随内容跳变）
export const PAIR_LIST_MAX_H = 440; // 分析对列表区最大高（多对时纵向滚动）

/** 可编辑 chip 的描边（主品/对比条目同一语言；只读配置 chip 无描边） */
export const EDITABLE_BORDER = 'rgba(0, 112, 243, 0.35)';

/** Esc 让位判定（主浮窗/模板编辑浮窗共用）：页面存在可见的内层弹层
 *  （Modal / Popover / 轻确认 / 下拉）时为真——外层浮窗的 Esc 关闭先让
 *  内层弹层自行处理，不连带收起外层 */
export function innerLayerOpen(): boolean {
  if (typeof document === 'undefined') return false;
  return !!document.querySelector(
    '.ant-modal-root, .ant-popover:not(.ant-popover-hidden), .ant-dropdown:not(.ant-dropdown-hidden), .ant-select-dropdown:not(.ant-select-dropdown-hidden)',
  );
}

// ---------------- 颜色 chip（次级筛选：点开换色 / 多色均价） ----------------

export function colorLabelOf(node: RomramNode | undefined, skuIds: string[]): string {
  if (!node) return '';
  const pool = node.selectableColors.length ? node.selectableColors : node.colors;
  const chosen = pool.filter((c) => skuIds.includes(c.skuId));
  if (chosen.length > 1) return `${chosen[0].color}+${chosen.length - 1}`;
  if (chosen.length === 1) return chosen[0].color;
  return pool.find((c) => c.skuId === defaultColorSkuIds(node)[0])?.color ?? pool[0]?.color ?? '';
}

export function ColorChip({
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
      zIndex={POPOVER_Z}
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

/** 树数据索引（浮窗与条目共用；按国家/产业缓存）。
 *  romramByKey：全量配置节点索引（key = `modelId|romram`）。 */
export function useTreeData() {
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

/** 条目只读文字（更换收口后不可点；超长省略号 + title 全称） */
export function RowText({
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
export function RomramChip({ children }: { children: ReactNode }) {
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

/** 虚线触发 pill（「＋ 添加…」家族统一形态）。第一百八十二轮：原生 button（键盘可达） */
export function AddPill({ label, onClick, disabled, big }: { label: string; onClick?: () => void; disabled?: boolean; big?: boolean }) {
  return (
    <button
      type="button"
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
    </button>
  );
}

/** 行尾「更换」ghost pill（= 完整树浮窗的显性入口）：仅图标，语义走 aria-label/title */
export function SwapPill({ label, onClick }: { label: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="lpl-pk-ghost"
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 20,
        padding: '0 6px',
        borderRadius: radius.pill,
        color: color.mute,
        background: color.canvas,
        border: `1px solid ${color.hairline}`,
        cursor: 'pointer',
        flexShrink: 0,
      }}
    >
      <SwapOutlined style={{ fontSize: 11 }} />
    </button>
  );
}

export function DeleteX({ label, onClick, size = 11 }: { label: string; onClick?: () => void; size?: number }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="lpl-hit"
      style={{ position: 'relative', display: 'inline-flex', padding: 4, cursor: 'pointer', color: color.mute, flexShrink: 0 }}
    >
      <CloseOutlined style={{ fontSize: size }} />
    </button>
  );
}

/** 整框右上角的删组 ✕（主品的删除 = 整组删除，入口提到组框右上角以更明显的
 *  方式呈现；悬停红化，轻确认后连对比区一并移除） */
export function GroupDeleteX({ label }: { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="lpl-pk-del lpl-hit"
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 22,
        height: 22,
        borderRadius: radius.control,
        border: `1px solid ${color.hairline}`,
        background: color.canvas,
        color: color.mute,
        cursor: 'pointer',
      }}
    >
      <CloseOutlined style={{ fontSize: 11 }} />
    </button>
  );
}

/** 当前/已选 灰标（树浮窗叶行尾） */
export function StateTag({ text }: { text: string }) {
  return (
    <span style={{ fontSize: 10, color: color.mute, flexShrink: 0, whiteSpace: 'nowrap' }}>{text}</span>
  );
}

// ---------------- 树浮窗列宽预留 ----------------

/** 13px 基准测量 → 实际字号折算（行尾内容宽度预留用） */
export const textW = (s: string, px: number): number => measureText(s) * (px / 13);
/** 行尾小 pill 宽（文本 + padding 0 8px + 边框 2px） */
export const pillW = (s: string, px: number): number => textW(s, px) + 18;
export const ROW_GAP = 8; // 级联行内 label ↔ 行尾间距（space.sm）

/** 主品行展示要素（品牌 key / 品牌中文名 / 产品名 / 全称 title）——主浮窗与编辑浮窗同构 */
export function mainTitleOf(main: { modelId: string; romram: string }): {
  brand: string;
  brandLabel: string;
  model: string;
  full: string;
} {
  const brand = brandOfModel(main.modelId);
  const model = modelNameOf(main.modelId);
  return { brand, brandLabel: brandLabelOf(brand), model, full: [brandLabelOf(brand), model, configTextOf(main.romram)].filter(Boolean).join(' ') };
}

/** 供类型引用（编辑浮窗条目形与主卡一致） */
export type { MainProduct, ProductSelection } from '../../state/filtersTypes';
