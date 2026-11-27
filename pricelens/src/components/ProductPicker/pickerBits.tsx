// ============================================================
// 「选择产品」浮窗共用小件（第一百三十一轮自 ProductPickerModal 抽出，
// 代码原样搬运不改行为）：层级常量、颜色 chip、条目文本/配置 chip、
// 各类 pill、删组 ✕、树数据索引。模板编辑浮窗（TemplateEditorFlyout）
// 与主浮窗共用同一套视觉语言。
// 第一百八十五轮（外部 UX 审计落地）：①颜色 chip 可点 span 改原生 button
//   （Tab 可达、Enter/Space 可切，182 轮 AddPill 同款做法）；②新增浮窗
//   落点视口钳制纯函数 clampPanelPos（窄屏浮窗不越视口）与焦点归还小件
//   captureFocusRestore（浮窗关闭把焦点还给触发器，主浮窗/编辑浮窗共用）。
// 第一百九十轮（外部 UX 审计落地）：①useTopEscClose——浮层 Esc 分层关闭
//   （每次 Esc 只关最上层、焦点归还触发器），树级联/颜色 chip/图表工具行
//   浮层共用，补掉「外层让位、内层不响应」的死区；②cascadePlacementOf——
//   级联浮层动态宽的落位翻转纯函数（锚点右侧放不下改锚右缘，不再顶出视口）。
// ============================================================
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Popover } from 'antd';
import { CloseOutlined, PlusOutlined, SwapOutlined } from '@ant-design/icons';
import { useFilters } from '../../state/FiltersContext';
import ColorFlyout from '../ProductCascader/ColorFlyout';
import { brandLabelOf } from '../BrandMark';
import { color, formatPrice, radius, selectSoftInk } from '../../theme/tokens';
import { frameColumnWidth } from '../ProductCascader/CascadePanel';
import {
  brandOfModel,
  buildProductTree,
  configTextOf,
  defaultColorSkuIds,
  measureText,
  modelEntryInfo,
  modelNameOf,
  type BrandNode,
  type ModelNode,
  type RomramNode,
} from '../ProductCascader';
import { TIER_LABELS } from '../../dataModel/aggregate';
import { tierLabelShort } from '../../chart/PriceTrend/helpers';

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

// ---------------- 窄屏视口钳制（第一百八十五轮） ----------------

/** 视口安全边距：钳制后浮窗至少离视口左/右/上缘这么远 */
export const PICKER_EDGE = 24;
/** 底边露出的最小可见高度：锚点滚到视口底部时浮窗至少还露出这么多 */
export const PICKER_MIN_VISIBLE = 52;

/** 浮窗落点视口钳制（纯函数，金测见 __tests__/viewport.test.ts）：
 *  左缘钳进 [24, vw-24-panelW]（右缘不越 24px 边距），顶边钳进
 *  [24, vh-76]；底边不越界由调用方的 maxHeight = 100vh - top - 24 收口。 */
export function clampPanelPos(
  left: number,
  top: number,
  panelW: number,
  vw: number,
  vh: number,
): { left: number; top: number } {
  const leftMax = Math.max(PICKER_EDGE, vw - PICKER_EDGE - panelW);
  const topMax = Math.max(PICKER_EDGE, vh - PICKER_EDGE - PICKER_MIN_VISIBLE);
  return {
    left: Math.min(Math.max(left, PICKER_EDGE), leftMax),
    top: Math.min(Math.max(top, PICKER_EDGE), topMax),
  };
}

/** 主浮窗可读最小高（2026-11-13 Eason「任何情况下产品筛选框都不显示不全」）：
 *  下方剩余空间不足此高且上方更宽裕时，浮窗翻到锚点上方（底边贴触发器顶向上长） */
export const PICKER_MIN_PANEL_H = 320;

export interface PanelPlacement {
  /** true = 翻到锚点上方（渲染用 bottom 锚定，面板向上长） */
  above: boolean;
  /** above = false 时面板 top（已钳进视口安全边距）；above = true 时填 0（不用） */
  top: number;
  /** above = true 时面板 bottom 距视口顶的距离（锚顶 − 6px 缝）；above = false 填 0 */
  bottom: number;
  /** maxHeight（px）：below = 视口底安全边距 − top；above = 锚顶 − 6 − 上缘安全边距 */
  maxH: number;
}

/** 主浮窗纵向落位（纯函数；水平钳制仍走 clampPanelPos）：默认锚点下方（锚底 + 6）。
 *  下方放不下一块可读面板（< PICKER_MIN_PANEL_H）且上方更宽裕 → 翻上方——
 *  旧逻辑恒向下、锚点贴视口底时 maxHeight 只剩 PICKER_MIN_VISIBLE 的缝（浮窗
 *  「显示不全」）。两侧都不足时取更宽裕一侧，配合 maxHeight 收口，任何视口下
 *  浮窗都可滚动读全、上下缘恒不越 24px 安全边距。 */
export function panelPlacementOf(anchorTop: number, anchorBottom: number, vw: number, vh: number): PanelPlacement {
  const GAP = 6;
  const belowTop = Math.min(
    Math.max(anchorBottom + GAP, PICKER_EDGE),
    Math.max(PICKER_EDGE, vh - PICKER_EDGE - PICKER_MIN_VISIBLE),
  );
  const belowSpace = vh - PICKER_EDGE - belowTop;
  const aboveSpace = anchorTop - GAP - PICKER_EDGE;
  if (belowSpace < PICKER_MIN_PANEL_H && aboveSpace > belowSpace) {
    return { above: true, top: PICKER_EDGE, bottom: vh - anchorTop + GAP, maxH: Math.max(PICKER_MIN_VISIBLE, Math.round(aboveSpace)) };
  }
  return { above: false, top: belowTop, bottom: 0, maxH: Math.max(PICKER_MIN_VISIBLE, Math.round(belowSpace)) };
}

/** 浮窗焦点归还（主浮窗 / 模板编辑浮窗共用）：调用时记下当前焦点元素
 *  （= 打开浮窗的触发器），返回的函数在浮窗关闭/卸载时把焦点还回去；
 *  触发器已不在文档中（随外层浮窗一并卸载）则跳过，由更外层继续归还。 */
export function captureFocusRestore(): () => void {
  const prev =
    typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
  return () => {
    if (prev && prev.isConnected) prev.focus();
  };
}

/** 可编辑 chip 的描边（主品/对比条目同一语言；只读配置 chip 无描边） */
export const EDITABLE_BORDER = 'rgba(0, 112, 243, 0.35)';

// ---------------- Esc 分层关闭（第一百九十轮，外部 UX 审计） ----------------

/** 打开中的浮层栈：后开者在栈顶。Esc 只由栈顶（最上层浮层）响应，
 *  关一层；同一事件经 capture 拦截 + stopPropagation，不再落到外层浮窗的
 *  document 监听上（外层原有的 innerLayerOpen 让位机制继续兜底非本栈浮层）。 */
const escLayerStack: symbol[] = [];

/** antd 自管 Esc 的弹层在场则让位：Modal / Select 下拉 / Dropdown 自己响应
 *  Escape，本次 Esc 先关它们，下一次再关本层（避免一次 Esc 连关两层）。 */
function antdEscLayerOpen(): boolean {
  if (typeof document === 'undefined') return false;
  return !!document.querySelector(
    '.ant-modal-root, .ant-select-dropdown:not(.ant-select-dropdown-hidden), .ant-dropdown:not(.ant-dropdown-hidden)',
  );
}

/** 浮层 Esc 关闭：open 期间挂 document capture keydown。仅当自己是栈顶
 *  （最上层）才响应 Escape——焦点先归还触发器（captureFocusRestore，外点
 *  关闭等其他退出路径同样归还），再 onClose。供树级联浮层、颜色 chip、
 *  图表工具行浮层等内层 antd Popover 使用：这些弹层自身不响应 Esc，此前
 *  外层让位、内层不接，形成「谁都不关闭」的死区。 */
export function useTopEscClose(open: boolean, onClose: () => void): void {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const id = Symbol('lpl-esc-layer');
    escLayerStack.push(id);
    const restore = captureFocusRestore();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      if (escLayerStack[escLayerStack.length - 1] !== id) return; // 只关最上层
      if (antdEscLayerOpen()) return; // Modal/下拉自管 Esc：让位
      e.preventDefault();
      e.stopPropagation();
      restore();
      closeRef.current();
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      const i = escLayerStack.indexOf(id);
      if (i >= 0) escLayerStack.splice(i, 1);
      restore();
    };
  }, [open]);
}

/** 级联浮层落位（纯函数，金测见 __tests__/viewport.test.ts）：树浮层宽度
 *  动态（最宽 ≈ 视口 - 48），固定 bottomLeft 在锚点靠右时整体顶出右缘——
 *  antd 只会平移不会翻转。锚点左侧放不下即改 bottomRight（右缘对齐锚点、
 *  向左展开）；两侧都放不下（浮层宽 ≈ 视口）时 bottomRight 配合 antd 平移
 *  收益仍更大。 */
export function cascadePlacementOf(
  triggerLeft: number,
  bodyW: number,
  vw: number,
): 'bottomLeft' | 'bottomRight' {
  return triggerLeft + bodyW + PICKER_EDGE <= vw ? 'bottomLeft' : 'bottomRight';
}

/** Esc 让位判定（主浮窗/模板编辑浮窗共用）：页面存在可见的内层弹层
 *  （Modal / Popover / 轻确认 / 下拉）时为真——外层浮窗的 Esc 关闭先让
 *  内层弹层自行处理，不连带收起外层 */
export function innerLayerOpen(): boolean {
  if (typeof document === 'undefined') return false;
  return !!document.querySelector(
    '.ant-modal-root, .ant-popover:not(.ant-popover-hidden), .ant-dropdown:not(.ant-dropdown-hidden), .ant-select-dropdown:not(.ant-select-dropdown-hidden)',
  );
}

// ---------------- 版本 chip（次级筛选：收颜色/表盘/联网方式，点开切换 / 多选均价） ----------------

export function colorLabelOf(node: RomramNode | undefined, skuIds: string[]): string {
  if (!node) return '';
  const pool = node.selectableColors.length ? node.selectableColors : node.colors;
  // 2026-11-17 穿戴结构化（表盘升配置维）：配置下无任何实色（全 '—'）= 没有次级
  // 信息可切，版本胶囊整个不渲染（ Watch 6 42mm 配置这类节点不再亮一枚「—」）
  if (pool.every((c) => c.color === '—')) return '';
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
  // 第一百九十轮：改受控 + useTopEscClose——换色浮层此前不响应 Esc（外层
  // 浮窗让位给它、它自己不接），Esc 死区；现每次 Esc 只关最上层并还焦触发器
  const [open, setOpen] = useState(false);
  useTopEscClose(open, () => setOpen(false));
  if (!node || !label) return null;
  return (
    <Popover
      trigger="click"
      open={open}
      onOpenChange={setOpen}
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
      {/* 第一百八十五轮：可点 span 改原生 button——Tab 可达、Enter/Space 可开
          换色浮层（全局 button 外观重置已剥默认样式，视觉与 span 版一致） */}
      <button
        type="button"
        title={`版本 ${label} · 点击切换`}
        aria-label={`版本 ${label}，点击切换`}
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
      </button>
    </Popover>
  );
}

// ---------------- 通用小件 ----------------

/** 树数据索引（浮窗与条目共用；按国家/产业缓存）。
 *  romramByKey：全量配置节点索引（key = `modelId|romram`）。 */
export function useTreeData() {
  const { state } = useFilters();
  const fullTree = useMemo(
    () => buildProductTree(state.industry, state.countryCode, state.financingType, state.financingTerms),
    [state.industry, state.countryCode, state.financingType, state.financingType, state.financingTerms],
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

/** 型号行尾「档位缩写 · 现价」灰字（现价 = 入门配置默认色最新价，币种随筛选）；
 *  首末档的「入门 · 」「旗舰 · 」前缀只在档位下拉里保留，行尾去掉以免与现价的 · 连成三段 */
export const modelTagText = (m: ModelNode, currency: 'usd' | 'local'): string => {
  const { tierCode, price } = modelEntryInfo(m, currency);
  const tier = tierCode ? tierLabelShort((TIER_LABELS[tierCode] ?? tierCode).replace(/^(入门|旗舰) · /, '')) : '';
  const priceText = price != null ? formatPrice(Math.round(price), currency) : '';
  return [tier, priceText].filter(Boolean).join(' · ');
};

/** 树浮窗四列固定骨架（2026-11-27，纯函数）：按**未过滤全量树**取各列最大行宽——
 *  品牌 = 最长品牌名 + 最大「N 型号」行尾；系列 = 最长系列名（任一退市则留退市
 *  胶囊位）；型号 = 最长型号名 + 行尾（退市胶囊 + 「档位 · 现价」，对比上下文再留
 *  对比胶囊）；配置 = 最长配置名 + 对比胶囊 / 「当前」状态位。各列用与自适应列宽
 *  完全相同的公式（frameColumnWidth）。调用方在打开时刻算一次并冻结：品牌 / 系列 /
 *  型号 / 勾选 / 搜索 / 档位变化都不改变列宽，外框宽 = 四列和（超上限才横向滚动）。 */
export function cascadeFrameOf(
  tree: readonly BrandNode[],
  currency: 'usd' | 'local',
  opts: { compareCtx: boolean; modelTag?: boolean },
): { brand: number; series: number; model: number; romram: number; total: number } {
  const seriesAll = tree.flatMap((b) => b.series);
  const modelsAll = seriesAll.flatMap((s) => s.models);
  const romramsAll = modelsAll.flatMap((m) => m.romrams);
  const eolPillW = textW('退市', 10) + 8; // 文本 + padding 0 6px + 边框 2px
  const maxW = (texts: readonly string[]): number => texts.reduce((w, t) => Math.max(w, textW(t, 10)), 0);
  const brandExtra = maxW(tree.map((b) => `${b.modelCount} 型号`)) + ROW_GAP;
  const seriesExtra = seriesAll.some((s) => s.eol) ? eolPillW + ROW_GAP : 0;
  // modelTag = false：型号行尾不带「档位 · 现价」（模板编辑浮窗的树）
  const tagW = opts.modelTag === false ? 0 : maxW(modelsAll.map((m) => modelTagText(m, currency)));
  // 配置列 / 无配置层级型号行的行尾：对比上下文 = 对比胶囊（图标 11 + 间隙 3 计入）；
  // 其余上下文 = 「当前」/「已选」状态位
  const leafW = opts.compareCtx ? pillW('对比', 11) + 14 : maxW(['当前', '已选']);
  const modelExtra = (modelsAll.some((m) => m.eol) ? eolPillW + 6 : 0)
    + Math.max(tagW, leafW + 6 + tagW) + ROW_GAP;
  const romramExtra = leafW + ROW_GAP;
  const brand = frameColumnWidth(tree.map((b) => brandLabelOf(b.key)), { checkbox: true, leading: true, extraW: brandExtra });
  const series = frameColumnWidth(seriesAll.map((s) => s.title), { checkbox: true, extraW: seriesExtra });
  const model = frameColumnWidth(modelsAll.map((m) => m.label), { checkbox: true, leading: true, extraW: modelExtra });
  const romram = frameColumnWidth(romramsAll.map((r) => r.romram), { checkbox: true, extraW: romramExtra });
  return { brand, series, model, romram, total: brand + series + model + romram };
}
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
