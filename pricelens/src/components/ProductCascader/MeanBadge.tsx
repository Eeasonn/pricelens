// ============================================================
// §5.2 多 SKU 均值徽标：`均值 ×N`，悬停说明逐字照抄 spec
// ============================================================
import { Tooltip } from 'antd';
import { color, fontSize, radius, space } from '../../theme/tokens';

export default function MeanBadge({ count }: { count: number }) {
  return (
    <Tooltip title="选择多个 SKU 时显示均值">
      <span
        className="tnum"
        style={{
          display: 'inline-block',
          flexShrink: 0,
          padding: `0 ${space.sm}px`,
          borderRadius: radius.pill,
          background: color.canvasSoft2,
          color: color.body,
          fontSize: fontSize.caption,
          lineHeight: '18px',
          whiteSpace: 'nowrap',
        }}
      >
        均值 ×{count}
      </span>
    </Tooltip>
  );
}
