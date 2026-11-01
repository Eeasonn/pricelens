import type { CSSProperties } from 'react';
import { color, font } from '../../theme/tokens';
import { SPREAD_CARD_H, SPREAD_CARD_W, type SpreadCardModel } from './spreadCards';

export default function SpreadRangeCard(props: {
  title: string;
  model: SpreadCardModel;
  /** 标题前的系列色短划（价格/销量各自的量纲色），只作识别不作状态 */
  accent?: string;
  style?: CSSProperties;
}) {
  if (!props.model.visible) return null;
  const rateMissing = props.model.secondary === '—';
  return (
    <div
      role="group"
      aria-label={props.model.ariaLabel}
      className="lpl-spread-card"
      style={{
        width: SPREAD_CARD_W,
        height: SPREAD_CARD_H,
        boxSizing: 'border-box',
        padding: '8px 10px',
        background: color.canvas,
        border: `1px solid ${color.hairline}`,
        borderRadius: 6,
        boxShadow: 'none',
        ...props.style,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, lineHeight: '14px', color: color.mute }}>
        <span aria-hidden style={{ flexShrink: 0, width: 10, height: 2, background: props.accent ?? color.hairlineStrong }} />
        {props.title}
      </div>
      <div className="tnum" style={{ marginTop: 2, fontFamily: font.family, fontVariantNumeric: 'tabular-nums', fontSize: 22, lineHeight: '26px', fontWeight: 600, color: color.ink, whiteSpace: 'nowrap' }}>{props.model.primary}</div>
      <div className="tnum" style={{ marginTop: 1, fontFamily: font.family, fontVariantNumeric: 'tabular-nums', fontSize: 13, lineHeight: '16px', color: color.body, whiteSpace: 'nowrap' }}>
        {rateMissing ? props.model.secondary : <><span aria-hidden>↕ </span>{props.model.secondary}</>}
      </div>
      <div className="tnum" style={{ marginTop: 2, fontFamily: font.family, fontVariantNumeric: 'tabular-nums', fontSize: 11, lineHeight: '14px', color: color.mute, whiteSpace: 'nowrap' }}>{props.model.span}</div>
    </div>
  );
}
