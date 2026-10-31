import type { CSSProperties } from 'react';
import { color, font } from '../../theme/tokens';
import { SPREAD_CARD_H, SPREAD_CARD_W, type SpreadCardModel } from './spreadCards';

export default function SpreadRangeCard(props: {
  title: string;
  model: SpreadCardModel;
  style?: CSSProperties;
}) {
  if (!props.model.visible) return null;
  return (
    <div
      role="group"
      aria-label={props.model.ariaLabel}
      style={{
        width: SPREAD_CARD_W,
        height: SPREAD_CARD_H,
        boxSizing: 'border-box',
        padding: '4px 8px',
        overflow: 'hidden',
        background: color.canvas,
        border: `1px solid ${color.hairline}`,
        borderRadius: 6,
        pointerEvents: 'none',
        ...props.style,
      }}
    >
      <div style={{ fontSize: 10, lineHeight: '12px', color: color.mute }}>{props.title}</div>
      <div className="tnum" style={{ fontFamily: font.family, fontVariantNumeric: 'tabular-nums', fontSize: 15, lineHeight: '18px', fontWeight: 600, color: color.ink, whiteSpace: 'nowrap' }}>{props.model.high}</div>
      <div className="tnum" style={{ fontFamily: font.family, fontVariantNumeric: 'tabular-nums', fontSize: 11, lineHeight: '14px', color: color.body, whiteSpace: 'nowrap' }}>
        <span aria-hidden>↕ </span>
        {props.model.middle}
      </div>
      <div className="tnum" style={{ fontFamily: font.family, fontVariantNumeric: 'tabular-nums', fontSize: 15, lineHeight: '18px', fontWeight: 600, color: color.ink, whiteSpace: 'nowrap' }}>{props.model.low}</div>
    </div>
  );
}
