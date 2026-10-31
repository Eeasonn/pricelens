import { RobotOutlined } from '@ant-design/icons';
import { useAgent } from '../../state/AgentContext';
import { color, selectAccent, selectSoft, selectSoftInk } from '../../theme/tokens';

export default function AgentLauncher() {
  const { open, running, unreadCount, openAgent } = useAgent();
  return (
    <button
      type="button"
      aria-label="打开 PriceLens Agent"
      aria-pressed={open}
      onClick={() => openAgent('dock')}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 10px',
        border: `1px solid ${open ? selectAccent : color.hairline}`, borderRadius: 6,
        background: open ? selectSoft : color.canvas, color: open ? selectSoftInk : color.body,
        fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
      }}
    >
      <RobotOutlined />
      <span>问 PriceLens</span>
      {unreadCount > 0 && <span aria-label={`${unreadCount} 条未读 Agent 结果`} style={{ minWidth: 16, height: 16, padding: '0 4px', display: 'inline-grid', placeItems: 'center', borderRadius: 9999, background: color.ink, color: color.onPrimary, fontSize: 10, lineHeight: 1 }}>{unreadCount > 9 ? '9+' : unreadCount}</span>}
      {running && <span aria-label="运行中" style={{ width: 6, height: 6, borderRadius: '50%', background: color.link }} />}
    </button>
  );
}
