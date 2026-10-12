// ============================================================
// §6.4 周视图 offer：有 offer 的起始周打琥珀 #f5a623 促销标签形小图标（同档期跨多周只打一次，
// 按 offer.title 分组取首周，由调用方分组）；点击弹浮窗（L5 阴影、warning-soft 内衬）：
// 促销名称、权益文本、有效期（至 MM-DD · 活动剩 N 天）、银行价/关税估算（若有）、关联平台。
// offer 是文本权益不计价（§3.1），绝不画线。
// 第十五轮反馈：图标弃「促销票签+%」（百分号太抽象），改用琥珀 GiftOutlined 礼物图标
// + 轻投影（从曲线上浮起）；hover 微放大、cursor pointer；
// 锚定在数据点右上角 45°（中心距点 ≈24px），不遮正上方的价格标签。
// ============================================================
import { useState, type MouseEvent } from 'react';
import { Popover } from 'antd';
import { GiftOutlined } from '@ant-design/icons';
import type { OfferInfo } from '../../dataModel/types';
import { color, formatPrice, radius, shadow, space } from '../../theme/tokens';

export default function OfferPopover({ x, y, offer }: { x: number; y: number; offer: OfferInfo }) {
  const [hover, setHover] = useState(false);
  const onToggle = (e: MouseEvent<HTMLButtonElement>): void => e.stopPropagation();
  return (
    <Popover
      trigger="click"
      placement="top"
      styles={{ body: { padding: 0, background: color.canvas, boxShadow: shadow.l5, borderRadius: radius.modal } }}
      content={
        <div
          style={{
            background: color.warningSoft,
            borderRadius: radius.control,
            padding: space.md,
            maxWidth: 300,
            fontSize: 12,
            lineHeight: '17px',
            color: color.body,
          }}
        >
          <div style={{ fontWeight: 500, color: color.ink, marginBottom: space.xs }}>
            <GiftOutlined style={{ color: color.warning, marginRight: space.xs }} />
            {offer.title}
          </div>
          {offer.text && <div style={{ marginBottom: space.xs }}>{offer.text}</div>}
          <div className="tnum">有效期：至 {offer.endDate.slice(5)} · 活动剩 {offer.remainingDays} 天</div>
          {offer.bankPriceRub != null && (
            <div className="tnum">银行价 {formatPrice(offer.bankPriceRub, 'local')}</div>
          )}
          {offer.tariffEstRub != null && (
            <div className="tnum">关税估算 {formatPrice(offer.tariffEstRub, 'local')}</div>
          )}
          {offer.platforms.length > 0 && <div>关联平台：{offer.platforms.join(' / ')}</div>}
        </div>
      }
    >
      <button
        type="button"
        title="查看促销权益"
        onClick={onToggle}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          position: 'absolute',
          left: x + 8,
          top: y - 26, // 中心 ≈ (x+17, y−17)：数据点右上角 45°，避开正上方价格标签
          width: 18,
          height: 18,
          background: 'transparent',
          border: 'none',
          display: 'grid',
          placeItems: 'center',
          cursor: 'pointer',
          padding: 0,
          zIndex: 7,
          transform: hover ? 'scale(1.15)' : 'scale(1)',
          transition: 'transform .12s ease',
        }}
      >
        <GiftOutlined
          style={{ fontSize: 16, color: color.warning, filter: 'drop-shadow(0 1px 1.5px rgba(0,0,0,0.30))' }}
        />
      </button>
    </Popover>
  );
}
