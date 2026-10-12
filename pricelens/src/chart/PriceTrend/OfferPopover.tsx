// ============================================================
// §6.4 周视图 offer：有 offer 的起始周打琥珀 #f5a623 促销标签形小图标（同档期跨多周只打一次，
// 按 offer.title 分组取首周，由调用方分组）；点击弹浮窗（L5 阴影、warning-soft 内衬）：
// 促销名称、权益文本、有效期（至 MM-DD · 活动剩 N 天）、银行价/关税估算（若有）、关联平台。
// offer 是文本权益不计价（§3.1），绝不画线。
// 第二轮反馈 #7 图标重绘：16×16 内联 SVG「促销票签」——琥珀圆角票签（右缘两个半圆打孔缺口）
// + 白色 % 符号 + 细白描边 + 轻投影（从曲线上浮起）；hover 微放大、cursor pointer；
// 锚定在数据点右上角 45°（中心距点 ≈24px），不遮正上方的价格标签。
// ============================================================
import { useState, type MouseEvent } from 'react';
import { Popover } from 'antd';
import { GiftOutlined } from '@ant-design/icons';
import type { OfferInfo } from '../../dataModel/types';
import { color, formatPrice, radius, shadow, space } from '../../theme/tokens';

/** 促销票签图标（内联 SVG，无图片/新依赖） */
function OfferTagIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      aria-hidden
      style={{ display: 'block', filter: 'drop-shadow(0 1px 1.5px rgba(0,0,0,0.30))' }}
    >
      {/* 票签主体：圆角横签，右缘两个半圆打孔缺口 */}
      <path
        d="M2.5 2 H13.5 A2.5 2.5 0 0 1 16 4.5 V5.1 A1.1 1.1 0 0 0 16 7.3 V8.7 A1.1 1.1 0 0 0 16 10.9 V11.5 A2.5 2.5 0 0 1 13.5 14 H2.5 A2.5 2.5 0 0 1 0 11.5 V4.5 A2.5 2.5 0 0 1 2.5 2 Z"
        fill={color.warning}
        stroke="#ffffff"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      {/* 白色 % 符号（几何绘制，不依赖字体） */}
      <circle cx="5.2" cy="6.2" r="1.55" fill="none" stroke="#ffffff" strokeWidth="1.3" />
      <circle cx="10.8" cy="9.8" r="1.55" fill="none" stroke="#ffffff" strokeWidth="1.3" />
      <path d="M11.2 4.6 L4.8 11.4" stroke="#ffffff" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

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
        <OfferTagIcon />
      </button>
    </Popover>
  );
}
