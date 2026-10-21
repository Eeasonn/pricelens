// ============================================================
// 通用级联面板 + 触发器（按 AntD Cascader 视觉范式自绘）
// 列 = 层级；行 = 可勾选（Checkbox）/ 仅展开 / 带行尾内容（均值徽标 /「配置 SKU…」）
// 反馈 2.4：行选中/悬停高亮（active）由深灰改为浅蓝（selectSoft）；
// 反馈 2.2/2.3：触发器开启态聚焦边框浅蓝、徽标不撑破窄触发器。
// 第一百一十五轮（评审，对齐国家筛选器交互）：
//  - 父级行尾加右向小箭头；下一层只在「点击」后展开（移除悬停自动展开）；
//  - 每列宽度自适应内容（长产品名/型号不再省略号截断；上限防列失控）。
// 供 ProductBox（自有产品级联）、PlatformBox（平台→店铺）与选择产品浮窗复用。
// 第一百一十七轮二次迭代：fill 模式——面板填满父容器宽度，列按内容基础宽 +
// 弹性权重分配剩余宽度，行文本不再省略号截断（窄容器时整面板横向滚动兜底），
// 高度固定（height 透传，不随内容自适应跳变）。
// ============================================================
import { useEffect, useRef, type ReactNode } from 'react';
import { Checkbox, Tooltip } from 'antd';
import { DownOutlined, LockOutlined, RightOutlined } from '@ant-design/icons';
import { color, fontSize, radius, selectAccent, selectSoft, space } from '../../theme/tokens';

export interface CascadeRowItem {
  key: string;
  label: string;
  /** 行首前置内容（品牌图标等，位于 checkbox 与文本之间） */
  leading?: ReactNode;
  /** undefined = 本层不可勾选（如 SKU 层） */
  checkState?: 'checked' | 'indeterminate' | 'none';
  onCheckChange?: (next: boolean) => void;
  /** 点击行 → 展开下一列（父子联动路径） */
  onActivate?: () => void;
  /** 点击行文本的附加行为（如平台树：点文字=勾选）；不传则点击仅激活 */
  onLabelClick?: () => void;
  active?: boolean;
  /** 行尾内容（均值徽标 /「配置 SKU…」按钮），点击不触发行激活 */
  trailing?: ReactNode;
  /** 置灰锁：#a1a1a1 文字 + 锁图标，可见不可点（§4.3） */
  locked?: boolean;
}

const ROW_H = 32;

// ---------------- 文本宽度测量（列宽自适应用；懒建 canvas，缓存字体） ----------------

let measureCtx: CanvasRenderingContext2D | null = null;
const MEASURE_FONT = '13px -apple-system, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif';

/** 13px 正文下单行文本像素宽（容错：无 DOM 环境按 8px/字符粗估） */
export function measureText(s: string): number {
  if (!s) return 0;
  if (typeof document === 'undefined') return s.length * 8;
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
  if (!measureCtx) return s.length * 8;
  measureCtx.font = MEASURE_FONT;
  return measureCtx.measureText(s).width;
}

/** 列宽自适应（第一百一十五轮）：最长行文本 + 行内 chrome（复选框/前置/箭头/行尾）
 *  + 呼吸位；min/max 钳制。extraW = 调用方对行尾内容（颜色胶囊等）的额外预留。
 *  第一百二十三轮起导出：选择产品浮窗按「四列自适应宽之和」定浮窗宽度，
 *  需在调用方拿到与面板一致的列宽计算。 */
export function autoColumnWidth(items: CascadeRowItem[], opts: { min?: number; max?: number; extraW?: number; noMaxClip?: boolean }): number {
  const chrome =
    2 * 10 + // 行左右 padding
    6 + // 文本前 gap
    (items.some((i) => i.checkState) ? 24 : 0) + // 复选框
    (items.some((i) => i.leading) ? 18 : 0) + // 前置品牌点
    16 + // 父级行尾展开箭头（统一预留）
    (opts.extraW ?? 0);
  const textW = items.reduce((w, i) => Math.max(w, measureText(i.label) + (i.locked ? 14 : 0)), 0);
  // 行文字实际渲染字号 = fontSize.bodySm（14px），measureText 按 13px 基准测量 →
  // 折算到实际字号再计呼吸位（第一百二十三轮：label + 行尾必须完整可见）
  const min = opts.min ?? 148;
  const max = opts.noMaxClip ? 1600 : (opts.max ?? 380);
  return Math.min(max, Math.max(min, Math.ceil(textW * (fontSize.bodySm / 13) * 1.06) + chrome + 8));
}

export interface CascadeColumnSpec {
  /** 固定列宽；缺省 = 按内容自适应（第一百一十五轮） */
  width?: number;
  items: CascadeRowItem[];
  /** 自适应下限/上限（缺省 148 / 380；fill 模式上限放开到 1600，信息优先） */
  min?: number;
  max?: number;
  /** 行尾内容（颜色胶囊等）的宽度预留 */
  extraW?: number;
  /** fill 模式弹性权重（缺省 1）：剩余宽度按权重摊给各列 */
  flex?: number;
}

function Column({ items, width, last, open, fillFlex, height }: { items: CascadeRowItem[]; width: number; last: boolean; open: boolean; fillFlex?: number; height?: number }) {
  const noClip = fillFlex != null;
  const hasActive = items.some((item) => item.active);
  const activeKey = items.find((item) => item.active)?.key;
  const columnRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const column = columnRef.current;
      const selected = column?.querySelector<HTMLElement>('[aria-selected="true"]');
      if (!column || !selected) return;
      const bounds = column.getBoundingClientRect();
      const row = selected.getBoundingClientRect();
      if (row.top < bounds.top) column.scrollTop += row.top - bounds.top;
      else if (row.bottom > bounds.bottom) column.scrollTop += row.bottom - bounds.bottom;
    });
    return () => cancelAnimationFrame(frame);
  }, [activeKey, open]);
  return (
    <div
      ref={columnRef}
      role="group"
      style={fillFlex != null ? {
        // fill 模式：基础宽 = 内容自适应（flex-basis），剩余宽度按权重摊入；
        // 不收缩（第一百二十三轮）：容器窄于列宽和时保持各列完整宽，由面板
        // 整体横向滚动兜底——列内文本与行尾内容永不截断
        flex: `${fillFlex} 0 ${width}px`,
        height: height ?? 348,
        overflowY: 'auto',
        borderRight: last ? undefined : `1px solid ${color.hairline}`,
        background: color.canvas,
        boxSizing: 'border-box',
      } : {
        width,
        maxHeight: height ?? 328,
        overflowY: 'auto',
        borderRight: last ? undefined : `1px solid ${color.hairline}`,
        background: color.canvas,
        flexShrink: 0,
      }}
    >
      {items.map((item, index) => {
        const expandable = !last && Boolean(item.onActivate);
        return (
        <div
          key={item.key}
          role="treeitem"
          aria-label={item.label}
          aria-selected={Boolean(item.active)}
          aria-checked={item.checkState ? item.checkState === 'checked' : undefined}
          aria-expanded={expandable ? Boolean(item.active) : undefined}
          tabIndex={item.active || (!hasActive && index === 0) ? 0 : -1}
          onFocus={item.onActivate}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            const rows = Array.from(event.currentTarget.parentElement?.querySelectorAll<HTMLElement>(':scope > [role="treeitem"]') ?? []);
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              rows[Math.max(0, Math.min(rows.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))]?.focus();
            } else if (event.key === 'ArrowRight' && item.onActivate) {
              event.preventDefault();
              const nextColumn = event.currentTarget.parentElement?.nextElementSibling;
              item.onActivate();
              requestAnimationFrame(() => nextColumn?.querySelector<HTMLElement>('[role="treeitem"]')?.focus());
            } else if (event.key === 'ArrowLeft') {
              event.preventDefault();
              event.currentTarget.parentElement?.previousElementSibling?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
            } else if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              item.onActivate?.();
              item.onLabelClick?.();
            }
          }}
          onClick={() => {
            item.onActivate?.();
            item.onLabelClick?.();
          }}
          style={{
            height: ROW_H,
            display: 'flex',
            alignItems: 'center',
            gap: space.sm,
            padding: `0 ${space.md}px`,
            background: item.active ? selectSoft : 'transparent',
            cursor: item.onActivate || item.onLabelClick ? 'pointer' : 'default',
            outlineOffset: -2,
          }}
        >
          {item.checkState && (
            <Checkbox
              checked={item.checkState === 'checked'}
              indeterminate={item.checkState === 'indeterminate'}
              onChange={(e) => item.onCheckChange?.(e.target.checked)}
              onClick={(e) => e.stopPropagation()}
              style={{ marginRight: 0 }}
            />
          )}
          {item.leading}
          <span
            title={item.label}
            style={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: fontSize.bodySm,
              color: item.locked ? color.hairlineStrong : color.ink,
              whiteSpace: 'nowrap',
              overflow: noClip ? 'visible' : 'hidden',
              textOverflow: noClip ? undefined : 'ellipsis',
            }}
          >
            <span style={noClip ? undefined : { overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>
            {item.locked && <LockOutlined aria-hidden style={{ fontSize: 10, flexShrink: 0 }} />}
          </span>
          {item.trailing}
          {/* 父级行尾展开箭头（第一百一十五轮，对齐国家筛选器）：提示可点击下钻 */}
          {expandable && (
            <RightOutlined aria-hidden style={{ fontSize: 9, color: color.mute, flexShrink: 0 }} />
          )}
        </div>
        );
      })}
      {!items.length && (
        <div style={{ padding: space.md, fontSize: fontSize.caption, color: color.mute }}>暂无数据</div>
      )}
    </div>
  );
}

/** 多列级联面板（点击展开 + 父子联动勾选，AntD Cascader 范式；列宽自适应）。
 *  fill = 填满父容器宽度（列弹性分配、文本不截断、整面板横滚兜底）；
 *  height = 列固定高度（fill 模式默认 348，普通模式仍 maxHeight 328）。 */
export function CascadePanel({ columns, open = true, fill = false, height }: { columns: CascadeColumnSpec[]; open?: boolean; fill?: boolean; height?: number }) {
  return (
    <div
      role="tree"
      style={{
        display: 'flex',
        width: fill ? '100%' : undefined,
        background: color.canvas,
        borderRadius: radius.control,
        boxShadow: `0 0 0 1px ${color.hairline}`,
        overflowX: fill ? 'auto' : 'hidden',
        overflowY: 'hidden',
      }}
    >
      {columns.map((c, i) => (
        <Column
          key={`${i}-${c.items[0]?.key ?? ''}`}
          width={c.width ?? autoColumnWidth(c.items, { ...c, noMaxClip: fill })}
          items={c.items}
          last={i === columns.length - 1}
          open={open}
          fillFlex={fill ? (c.flex ?? 1) : undefined}
          height={height}
        />
      ))}
    </div>
  );
}

/** 级联触发器（类 Select）：高 32px / hairline 边框 / 6px 圆角 / 白底（§4.3）；
 * open = 面板展开态 → 聚焦边框浅蓝（反馈 2.4）；leading = 行首品牌图标等前置内容 */
export function CascadeTrigger({
  labels,
  badges,
  placeholder,
  open,
  leading,
  onClick,
}: {
  labels: string[];
  badges?: ReactNode;
  placeholder: string;
  open?: boolean;
  leading?: ReactNode;
  onClick?: () => void;
}) {
  const shown = labels.slice(0, 2).join('、');
  const rest = labels.length - 2;
  return (
    <Tooltip title={labels.join('、')} styles={{ root: { maxWidth: 420 } }}>
      <div
        onClick={onClick}
        style={{
          height: 32,
          border: `1px solid ${open ? selectAccent : color.hairline}`,
          borderRadius: radius.control,
          background: color.canvas,
          display: 'flex',
          alignItems: 'center',
          gap: space.sm,
          padding: `0 ${space.sm + 4}px`,
          cursor: 'pointer',
          minWidth: 0,
          overflow: 'hidden',
        }}
      >
        {leading}
        {labels.length ? (
          <span
            className="tnum"
            style={{
              fontSize: fontSize.bodySm,
              color: color.ink,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {shown}
            {rest > 0 ? ` 等 ${labels.length} 个` : ''}
          </span>
        ) : (
          <span
            style={{
              fontSize: fontSize.bodySm,
              color: color.mute,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {placeholder}
          </span>
        )}
        {badges}
        <DownOutlined style={{ marginLeft: 'auto', fontSize: 10, color: color.mute, flexShrink: 0 }} />
      </div>
    </Tooltip>
  );
}
