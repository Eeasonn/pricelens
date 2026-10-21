// ============================================================
// offer 徽章 + 详情卡（第四十八轮重构）：图上每枚徽章 = 白底琥珀描边圆片 +
// 按权益类型的图标（折扣券=Tag / 分期=CreditCard / 赠品=Gift），落在线上点中心；
// 悬停出摘要（headline 合并一行），点击出结构化三区卡（折扣（含优惠券）/分期/赠品，
// 只渲染存在的区）：区 = headline+类别 → 权益说明 → 至日期·剩余天数，
// 分期区附银行价/关税估算。offer 是文本权益不计价（§3.1），绝不画线。
// 口径不变：同一系列「同档期+同权益组合」只标首周（buildOfferMarkers 去重）。
// 历史口径：第十五轮弃「票签+%」；第四十二轮图标缩小落线上；本轮按类型分图标+白底圆片。
// ============================================================
import { useState } from 'react';
import { Popover } from 'antd';
import { CreditCardOutlined, GiftOutlined, TagOutlined } from '@ant-design/icons';
import type { OfferDetail, OfferInfo } from '../../dataModel/types';
import { offerList, offerSummary } from './chartModel';
import { color, formatPrice, radius, shadow, space } from '../../theme/tokens';

const KIND_META: Record<OfferDetail['kind'], { label: string; icon: JSX.Element }> = {
  discount: { label: '折扣 · 券', icon: <TagOutlined /> },
  installment: { label: '分期', icon: <CreditCardOutlined /> },
  gift: { label: '赠品', icon: <GiftOutlined /> },
};

/** 结构化权益卡：三类权益各一区，只渲染存在的区 */
function OfferCard({ offer }: { offer: OfferInfo }) {
  return (
    <div style={{ width: 252 }}>
      {offerList(offer).map((d, i) => (
        <div key={d.kind} style={i > 0 ? { borderTop: `1px solid ${color.hairline}`, marginTop: space.xs, paddingTop: space.xs } : undefined}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <span style={{ color: color.warning, display: 'inline-flex' }}>{KIND_META[d.kind].icon}</span>
            <span style={{ color: color.ink, fontWeight: 600 }}>{d.headline}</span>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: color.mute }}>{KIND_META[d.kind].label}</span>
          </div>
          <div style={{ marginTop: 3, fontSize: 11, lineHeight: '16px', color: color.body }}>{d.detail || d.promoName}</div>
          <div className="tnum" style={{ marginTop: 2, fontSize: 11, color: color.mute }}>
            至 {d.endDate.slice(5)} · 活动剩 {d.remainingDays} 天
            {d.promoName && d.detail ? ` · ${d.promoName}` : ''}
          </div>
          {d.kind === 'installment' && (d.bankPriceRub != null || d.tariffEstRub != null) && (
            <div className="tnum" style={{ marginTop: 2, fontSize: 11, color: color.mute }}>
              {d.bankPriceRub != null && <span>银行价 {formatPrice(d.bankPriceRub, 'local')}</span>}
              {d.bankPriceRub != null && d.tariffEstRub != null && <span> / </span>}
              {d.tariffEstRub != null && <span>关税约 {formatPrice(d.tariffEstRub, 'local')}</span>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function OfferPopover({ x, y, offer }: { x: number; y: number; offer: OfferInfo }) {
  // 悬停摘要用自绘小气泡（antd Tooltip 与 Popover 同触发点嵌套时会吞掉注入的
  // 点击事件，导致卡片弹不出来——故 Tooltip 弃用）
  const [hover, setHover] = useState(false);
  return (
    <>
      {hover && (
        <div
          style={{
            position: 'absolute',
            left: x,
            top: y - 38, // 徽章上移后气泡随迁
            transform: 'translateX(-50%)',
            background: 'rgba(31, 31, 31, 0.92)',
            color: '#fff',
            fontSize: 10,
            lineHeight: '16px',
            padding: '1px 8px',
            borderRadius: radius.pill,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 30,
          }}
        >
          {offerSummary(offer)}
        </div>
      )}
      <Popover
        trigger="click"
        placement="top"
        styles={{ body: { padding: space.md, background: color.canvas, boxShadow: shadow.l5, borderRadius: radius.modal } }}
        content={<OfferCard offer={offer} />}
      >
        <button
          type="button"
          title="查看促销权益"
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            left: x,
            // 第四十八轮：上移到点上方 13px——点中心在悬停时是「跳转商城」按钮的位置，
            // 两者重叠会互相吃点击（点徽章误开商城）；让位后徽章悬停/点击各自成立
            top: y - 13,
            width: 14,
            height: 14,
            background: color.canvas,
            border: '1.5px solid ' + color.warning,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            cursor: 'pointer',
            padding: 0,
            zIndex: 7,
            transform: 'translate(-50%, -50%)',
            boxShadow: '0 1px 2px rgba(0,0,0,0.10)',
          }}
        >
          <span style={{ fontSize: 8, lineHeight: 1, color: color.warning, display: 'inline-flex' }}>
            <GiftOutlined />
          </span>
        </button>
      </Popover>
    </>
  );
}
