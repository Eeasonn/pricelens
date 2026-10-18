import type { ReactNode } from 'react';
import type { OverviewSummary } from '../../dataModel/overviewSummary';
import { color, radius, space } from '../../theme/tokens';

function SummaryCard({ title, value, detail }: { title: string; value: ReactNode; detail: ReactNode }) {
  return (
    <article
      style={{
        minWidth: 0,
        padding: '12px 14px',
        border: `1px solid ${color.hairline}`,
        borderRadius: radius.card,
        background: color.canvasSoft,
      }}
    >
      <div style={{ fontSize: 12, color: color.mute }}>{title}</div>
      <div className="tnum" style={{ marginTop: 4, fontSize: 26, lineHeight: '32px', fontWeight: 700, color: color.ink }}>
        {value}
      </div>
      <div style={{ marginTop: 2, fontSize: 11, lineHeight: '16px', color: color.mute }}>{detail}</div>
    </article>
  );
}

export default function IndustrySummary({ summary }: { summary: OverviewSummary }) {
  const latestWeek = summary.latestAlertWeek
    ? `${summary.latestAlertWeek.slice(0, 4)}-W${summary.latestAlertWeek.slice(4)}`
    : null;

  return (
    <section
      aria-label="产业摘要"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
        gap: space.md,
        marginTop: space.base,
      }}
    >
      <SummaryCard title="我司型号" value={summary.ownModels} detail={`${summary.ownRoms} 个 ROM`} />
      <SummaryCard
        title="ROM 对标覆盖率"
        value={`${Math.round(summary.mappingPct * 100)}%`}
        detail={`${summary.mappedRoms} / ${summary.ownRoms} 个 ROM 已对标`}
      />
      <SummaryCard title="深折扣 ROM" value={summary.deepDiscountRoms} detail="折扣率 ≤ −15%" />
      <SummaryCard
        title="最新预警"
        value={summary.latestAlertCount}
        detail={latestWeek ? `${latestWeek} · 已订阅产品` : '已订阅产品 · 当前无触发'}
      />
    </section>
  );
}
