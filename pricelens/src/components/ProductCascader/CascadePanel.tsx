// ============================================================
// 通用级联面板 + 触发器（按 AntD Cascader 视觉范式自绘）
// 列 = 层级；行 = 可勾选（Checkbox）/ 仅展开 / 带行尾内容（均值徽标 /「配置 SKU…」）
// 反馈 2.4：行选中/悬停高亮（active）由深灰改为浅蓝（selectSoft）；
// 反馈 2.2/2.3：触发器开启态聚焦边框浅蓝、徽标不撑破窄触发器。
// 供 ProductBox（我司/竞品级联）与 PlatformBox（平台→店铺）复用
// ============================================================
import type { ReactNode } from 'react';
import { Checkbox, Tooltip } from 'antd';
import { DownOutlined } from '@ant-design/icons';
import { color, fontSize, radius, selectAccent, selectSoft, space } from '../../theme/tokens';

export interface CascadeRowItem {
  key: string;
  label: string;
  /** 行首前置内容（品牌图标等，位于 checkbox 与文本之间） */
  leading?: ReactNode;
  /** undefined = 本层不可勾选（如 SKU 层） */
  checkState?: 'checked' | 'indeterminate' | 'none';
  onCheckChange?: (next: boolean) => void;
  /** hover/点击 → 展开下一列（父子联动路径） */
  onActivate?: () => void;
  /** 点击行文本的附加行为（如平台树：点文字=勾选）；不传则点击仅激活 */
  onLabelClick?: () => void;
  active?: boolean;
  /** 行尾内容（均值徽标 /「配置 SKU…」按钮），点击不触发行激活 */
  trailing?: ReactNode;
  /** 置灰锁：#a1a1a1 文字 + 🔒，可见不可点（§4.3） */
  locked?: boolean;
}

const ROW_H = 32;

function Column({ items, width, last }: { items: CascadeRowItem[]; width: number; last: boolean }) {
  return (
    <div
      style={{
        width,
        maxHeight: 328,
        overflowY: 'auto',
        borderRight: last ? undefined : `1px solid ${color.hairline}`,
        background: color.canvas,
        flexShrink: 0,
      }}
    >
      {items.map((item) => (
        <div
          key={item.key}
          onMouseEnter={item.onActivate}
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
            cursor: item.onActivate ? 'pointer' : 'default',
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
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>
            {item.locked ? '🔒' : ''}
          </span>
          {item.trailing}
        </div>
      ))}
      {!items.length && (
        <div style={{ padding: space.md, fontSize: fontSize.caption, color: color.mute }}>暂无数据</div>
      )}
    </div>
  );
}

/** 多列级联面板（悬停展开 + 父子联动勾选，AntD Cascader 范式） */
export function CascadePanel({ columns }: { columns: { width: number; items: CascadeRowItem[] }[] }) {
  return (
    <div
      style={{
        display: 'flex',
        background: color.canvas,
        borderRadius: radius.control,
        boxShadow: `0 0 0 1px ${color.hairline}`,
        overflow: 'hidden',
      }}
    >
      {columns.map((c, i) => (
        <Column key={i} width={c.width} items={c.items} last={i === columns.length - 1} />
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
