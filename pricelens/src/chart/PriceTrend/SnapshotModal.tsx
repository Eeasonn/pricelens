import { Modal } from 'antd';
import { ExportOutlined } from '@ant-design/icons';
import { color, fontSize, radius, shadow, space } from '../../theme/tokens';
import { snapshotFor } from '../../data/snapshots';

export interface SnapshotInfo {
  seriesLabel: string;
  shopName: string | null;
  bucketId: string;
  granularity: 'week' | 'month' | 'quarter';
  dateText: string;
  priceText: string;
  url: string;
}

export interface SnapshotModalProps {
  info: SnapshotInfo | null;
  onClose: () => void;
}

export default function SnapshotModal({ info, onClose }: SnapshotModalProps) {
  if (!info) return null;
  const { historical, current } = snapshotFor(info.url, info.granularity === 'week' ? info.bucketId : '');
  const snapshot = historical ?? current;
  const week = info.granularity === 'week' && /^\d{6}$/.test(info.bucketId)
    ? `${info.bucketId.slice(0, 4)}-W${info.bucketId.slice(4)}` : info.bucketId;
  const safeUrl = /^https?:\/\//i.test(info.url) ? info.url : null;
  return (
    <Modal
      open
      centered
      footer={null}
      width={1120}
      onCancel={onClose}
      title="页面快照"
      styles={{ content: { borderRadius: radius.modal, boxShadow: shadow.l5, padding: space.lg } }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.sm, color: color.body, fontSize: fontSize.bodySm }}>
        <span>{info.seriesLabel}</span>
        <span>{info.shopName ?? '电商平台'}</span>
        <span className="tnum">所选历史事实 · {week} · {info.dateText} · {info.priceText}</span>
      </div>
      <div role="status" style={{
        marginTop: space.md, padding: space.md, borderRadius: radius.control,
        background: historical ? color.canvasSoft2 : color.warningSoft,
        color: historical ? color.body : color.warningInk, fontSize: fontSize.bodySm,
      }}>
        {historical
          ? '已匹配该商品与所选周期的历史页面快照。'
          : current
            ? `暂无 ${week} 历史快照。下图为当前页面补充证据，不能证明所选周期的价格。`
            : '暂无快照。未找到与该商品及所选周期匹配的页面证据。'}
      </div>
      {snapshot && <>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.sm, alignItems: 'baseline', marginTop: space.md, color: color.body, fontSize: fontSize.bodySm }}>
          <strong style={{ color: color.ink }}>{historical ? '历史页面证据' : '当前页面补充证据'}</strong>
          <span className="tnum">截图采集 {snapshot.capturedAt.replace('T', ' ').replace('Z', ' UTC')}</span>
          <span>{snapshot.sourceLabel}</span>
          <span className="tnum">截图页面价 {snapshot.priceText}</span>
        </div>
        <img
          src={snapshot.src}
          alt={`${snapshot.sourceLabel} · ${snapshot.pageLabel} · ${snapshot.capturedAt} · ${historical ? '历史页面证据' : '当前页面补充证据，非所选周期凭证'}`}
          style={{ display: 'block', width: '100%', marginTop: space.sm, borderRadius: radius.control, border: `1px solid ${color.hairline}` }}
        />
      </>}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: space.md, marginTop: space.md, fontSize: fontSize.caption, color: color.mute }}>
        <span>历史事实按所选统计周期展示；截图保留实际采集时点及原币种。</span>
        {safeUrl && <a href={safeUrl} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()} style={{ marginLeft: 'auto', color: color.link }}>
          打开商城现页 <ExportOutlined aria-hidden />
        </a>}
      </div>
    </Modal>
  );
}
