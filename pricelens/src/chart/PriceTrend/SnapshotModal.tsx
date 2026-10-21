// ============================================================
// §6.4 页面快照浮窗（第五十轮新增）：点击周视图悬停「快照」图标弹出。
// 取证语义重构：历史价格点不再跳商城现页（现页价格早已变化，取证失真），
// 改为展示采集当时的电商页面截图——截图上方一行「采集日期 + 来源商城 + 当时价格」，
// 截图主体下方弱化保留「打开商城现页」次链接（活页仅作参考，不作取证）。
// 快照注册表见 src/data/snapshots.ts（demo 轮转绑定；接入后换 fact.snapshot_url）。
// ============================================================
import { Modal } from 'antd';
import { ExportOutlined } from '@ant-design/icons';
import { color, fontSize, radius, shadow, space } from '../../theme/tokens';
import { snapshotFor } from '../../data/snapshots';

export interface SnapshotInfo {
  seriesLabel: string; // 产品名（品牌+型号+ROMRAM）
  shopName: string | null; // 最低价来源店铺
  bucketId: string; // 周桶 id（YYYYWW）
  dateText: string; // 该周锚日文案（MM-DD）
  priceText: string; // 该时点价格（已格式化，显示币种）
  url: string; // 商城现页（弱化次链接）
}

export interface SnapshotModalProps {
  info: SnapshotInfo | null;
  onClose: () => void;
}

export default function SnapshotModal({ info, onClose }: SnapshotModalProps) {
  if (!info) return null;
  const snap = snapshotFor(info.shopName, info.bucketId);
  return (
    <Modal
      open
      centered
      footer={null}
      width={640}
      onCancel={onClose}
      title={null}
      styles={{
        content: { borderRadius: radius.modal, boxShadow: shadow.l5, padding: space.lg },
        header: { display: 'none' },
      }}
    >
      {/* 标题行：产品 · 时点 · 来源 */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: space.sm, marginBottom: space.xs }}>
        <span style={{ fontSize: fontSize.bodyMd, fontWeight: 600, color: color.ink }}>页面快照</span>
        <span style={{ fontSize: fontSize.caption, color: color.body, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {info.seriesLabel} · {info.dateText} · {info.shopName ?? '电商平台'}
        </span>
      </div>
      {/* 截图上方：采集日期（口径行）+ 该时点价格 */}
      <div
        className="tnum"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: space.sm,
          padding: `${space.xs}px ${space.sm}px`,
          background: color.canvasSoft2,
          borderRadius: radius.control,
          fontSize: fontSize.caption,
          color: color.body,
        }}
      >
        <span>
          采集日期 <span style={{ fontWeight: 600, color: color.ink }}>{snap.capturedAt}</span>
        </span>
        <span style={{ color: color.hairlineStrong }}>|</span>
        <span>
          当时价格 <span style={{ fontWeight: 600, color: color.ink }}>{info.priceText}</span>
        </span>
        <span style={{ marginLeft: 'auto', color: color.mute }}>{snap.sourceLabel} · {snap.pageLabel}</span>
      </div>
      {/* 截图主体 */}
      <img
        src={snap.src}
        alt={`${snap.sourceLabel} 页面快照（采集于 ${snap.capturedAt}）`}
        style={{
          display: 'block',
          width: '100%',
          marginTop: space.sm,
          borderRadius: radius.control,
          border: `1px solid ${color.hairline}`,
        }}
      />
      {/* 页脚：取证口径 + 弱化的活页次链接 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: space.md, marginTop: space.sm }}>
        <span style={{ fontSize: fontSize.caption, color: color.mute }}>
          历史时点以页面快照取证
        </span>
        <a
          href={info.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          style={{ marginLeft: 'auto', fontSize: fontSize.caption, color: color.mute, whiteSpace: 'nowrap' }}
        >
          打开商城现页 <ExportOutlined />
        </a>
      </div>
    </Modal>
  );
}
