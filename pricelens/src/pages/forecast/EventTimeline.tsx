// ============================================================
// 事件时间轴：上市 / 大促 / 供应波动 / 竞品上市 / 竞品促销 / 成本变化 /
// 清库促销放在图下方的事件行，避免长文本漂浮在图内。
// 事件类型文字 + 色条双通道表达；竞品事件带简单版边界说明。
// ============================================================
import { color, fontSize, radius, selectAccent, space } from '../../theme/tokens';
import type { ForecastEvent, ForecastEventType } from './forecastModel';

const TYPE_TEXT: Record<ForecastEventType, string> = {
  lifecycle: '生命周期',
  promo: '促销',
  supply: '供给',
  competitor: '竞品',
  cost: '成本',
};

const typeBarColor: Record<ForecastEventType, string> = {
  lifecycle: selectAccent,
  promo: color.warning,
  supply: color.error,
  competitor: color.ink,
  cost: color.warning,
};

export default function EventTimeline({ events }: { events: ForecastEvent[] }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: color.mute, marginBottom: space.sm }}>事件时间轴（生命周期周，模拟事件表 · 来源 demo_seed）</div>
      <div tabIndex={0} role="group" aria-label="事件时间轴" style={{ display: 'flex', gap: space.sm, overflowX: 'auto', paddingBottom: 4 }}>
        {events.map((event) => (
          <article
            key={event.id}
            style={{
              flex: '0 0 auto',
              width: 214,
              border: `1px solid ${color.hairline}`,
              borderLeft: `2px solid ${typeBarColor[event.type]}`,
              borderRadius: radius.control,
              padding: `${space.md - 2}px ${space.md}px`,
              display: 'grid',
              gap: 4,
              alignContent: 'start',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="mono tnum" style={{ fontSize: 11, fontWeight: 600, color: color.body }}>{event.weekLabel}</span>
              <span style={{ fontSize: 10, color: color.mute }}>{TYPE_TEXT[event.type]}</span>
            </div>
            <div style={{ fontSize: fontSize.bodySm, fontWeight: 600, color: color.ink }}>{event.label}</div>
            <div style={{ fontSize: 11, color: color.body }}>{event.shape}</div>
            <div style={{ fontSize: 11, lineHeight: 1.55, color: color.mute }}>{event.detail}</div>
          </article>
        ))}
      </div>
    </div>
  );
}
