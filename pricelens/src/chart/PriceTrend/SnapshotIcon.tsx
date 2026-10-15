// ============================================================
// §6.4 周视图悬停快照取证（第五十轮重构，替代跳转商城）：
// 悬停竖线上的有值点变「快照」胶囊按钮（文件图标+文字，白底品牌蓝描边，
// 比旧 ↗ 圆片更显性）。历史时点打开商城现页没有意义（价格早已变化），
// 点击弹「页面快照」浮窗（SnapshotModal）：采集当时的电商页面截图 +
// 截图上方标注采集日期。空心（missing）点不渲染（由调用方过滤）。
// 快照注册表见 src/data/snapshots.ts。
// ============================================================
import type { CSSProperties, MouseEvent } from 'react';
import { FileTextOutlined } from '@ant-design/icons';
import { color, radius, shadow } from '../../theme/tokens';

export default function SnapshotIcon({ x, y, onClick }: { x: number; y: number; onClick: () => void }) {
  const style: CSSProperties = {
    position: 'absolute',
    left: x,
    top: y,
    transform: 'translate(-50%, -50%)',
    height: 20,
    padding: '0 7px',
    borderRadius: radius.pill,
    background: color.canvas,
    border: `1px solid ${color.link}`,
    boxShadow: shadow.l2,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 3,
    cursor: 'pointer',
    zIndex: 8,
    fontSize: 10,
    fontWeight: 600,
    color: color.link,
    whiteSpace: 'nowrap',
  };
  return (
    <button
      type="button"
      title="查看该时点的电商页面快照"
      style={style}
      onClick={(e: MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <FileTextOutlined style={{ fontSize: 10 }} />
      快照
    </button>
  );
}
