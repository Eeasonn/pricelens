// ============================================================
// 筛选条单元格骨架（反馈 2.2/2.5 重构）：
// 「标题在上、控件在下」，标题行/控件行统一高度（20 + 8 + 32），
// 使各筛选器控件行底部对齐；筛选器之间用 1px hairline 竖线分隔
// （上下内缩、不顶满卡片高度）。供 index.tsx 与 ProductBox 复用。
// ============================================================
import type { ReactNode } from 'react';
import { Tooltip } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import { color, fontSize, space } from '../../theme/tokens';

/** 控件行统一高度 = antd 默认控件高（32px），底部对齐的基准 */
export const CONTROL_ROW_H = 32;

/** 标题行统一高度（bodySm 14/500 居左，与 §4.1 框标题一致） */
export const TITLE_ROW_H = 20;

export function FilterCell({
  title,
  info,
  extra,
  width,
  children,
}: {
  title: string;
  info?: string;
  /** 标题行右侧附加内容（如竞品产品标题旁的「匹配竞品」按钮） */
  extra?: ReactNode;
  width: number;
  children: ReactNode;
}) {
  return (
    <div style={{ width, flexShrink: 0, minWidth: 0 }}>
      <div
        style={{
          height: TITLE_ROW_H,
          marginBottom: space.sm,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          fontSize: fontSize.bodySm,
          fontWeight: 500,
          color: color.ink,
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</span>
        {info && (
          <Tooltip title={info}>
            <ExclamationCircleOutlined
              style={{ fontSize: 12, fontWeight: 400, color: color.mute, cursor: 'help', flexShrink: 0 }}
            />
          </Tooltip>
        )}
        {extra && <span style={{ marginLeft: 'auto', flexShrink: 0, display: 'inline-flex' }}>{extra}</span>}
      </div>
      <div style={{ height: CONTROL_ROW_H }}>{children}</div>
    </div>
  );
}

/** 筛选器之间 1px hairline 竖线：上下内缩（不顶满卡高），左右 8px 呼吸 */
export function FilterDivider() {
  return (
    <div
      aria-hidden
      style={{
        width: 1,
        flexShrink: 0,
        alignSelf: 'stretch',
        margin: `${space.md}px 8px`,
        background: color.hairline,
      }}
    />
  );
}
