// 区间量价摘要展示：每个量价面板一张，只读，不改变筛选或图表窗口。
import type { Granularity } from '../../dataModel/types';
import { color } from '../../theme/tokens';
import { buildPeriodSummary, type MoveTone } from './periodSummary';

export const PERIOD_SUMMARY_HEIGHT = 62;

const TONE: Record<MoveTone, string> = {
  up: color.link,
  down: '#b45309',
  flat: color.body,
  none: color.mute,
};

function Metric({
  label,
  pct,
  tone,
}: {
  label: string;
  pct: string | null;
  tone: MoveTone;
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11, lineHeight: '16px', color: color.mute }}>{label}</div>
      <div className="tnum" style={{ marginTop: 2, fontSize: 17, lineHeight: '22px', fontWeight: 600, color: pct ? TONE[tone] : color.mute }}>
        {pct ?? '—'}
      </div>
    </div>
  );
}

export default function PeriodVolumePriceSummary(props: {
  prices: readonly (number | null)[];
  volumes: readonly (number | null)[];
  granularity: Granularity;
  startId?: string;
  endId?: string;
  currency: 'local' | 'usd';
  periodCount: number;
  windowStart?: number;
  windowEnd?: number;
}) {
  const model = buildPeriodSummary(props);
  const label = `区间量价摘要 ${model.windowLabel}${model.directionLabel ? ` ${model.directionLabel}` : ''}`;
  return (
    <section
      aria-label={label}
      aria-live="polite"
      className="lpl-period-summary"
      style={{
        height: PERIOD_SUMMARY_HEIGHT,
        boxSizing: 'border-box',
        margin: '0 4px',
        padding: '5px 4px 6px',
        borderTop: `1px solid ${color.hairline}`,
        minWidth: 0,
      }}
    >
      {model.empty ? (
        <div style={{ fontSize: 12, lineHeight: '18px', color: color.mute }}>当前区间暂无量价数据</div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
            <span className="tnum" style={{ fontSize: 11, lineHeight: '16px', color: color.mute, minWidth: 0 }}>
              区间变化 · {model.windowLabel}
            </span>
          </div>
          <div className="lpl-period-cols">
            <Metric label="价变" pct={model.pricePct} tone={model.priceTone} />
            <Metric label="量变" pct={model.volumePct} tone={model.volumeTone} />
          </div>
        </>
      )}
    </section>
  );
}
