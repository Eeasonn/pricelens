// 图下方单周明细卡（视觉 demo：detail-card 三栏网格）。
// 左 = 日期/桶号 + 产品名与配置 + 观察点说明；中 = RRP / 折后价 / 环比 / 销量；
// 右 = 当月成本 / 单台销毛 / 销毛率（三格都显式带「模拟」）。
// 环比涨跌用涨蓝跌琥珀（第一百八十七轮定案）；缺采显示 —，不借用相邻周。
// 窄容器时改单列（index.css 的容器查询 .lpl-volume-detail）。
import type { CSSProperties, ReactNode } from 'react';
import BrandDot from '../../components/BrandMark';
import { color, font, radius, selectSoft, selectSoftInk } from '../../theme/tokens';
import type { WeekDetailModel } from './weekDetail';

const VALUE_FONT: CSSProperties = {
  marginTop: 4,
  fontFamily: font.family,
  fontVariantNumeric: 'tabular-nums',
  fontSize: 16,
  lineHeight: '22px',
  fontWeight: 600,
  color: color.ink,
  whiteSpace: 'nowrap',
};

function Metric(props: { label: string; children: ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ color: color.mute, fontSize: 11, lineHeight: '15px', whiteSpace: 'nowrap' }}>{props.label}</div>
      <div className="tnum" style={VALUE_FONT}>{props.children}</div>
    </div>
  );
}

/** 环比徽章：涨蓝 / 跌琥珀（底色 warningSoft 保小字对比），方向不只靠颜色（± 符号在文案里） */
function WowBadge(props: { text: string; dir: 'up' | 'down' | 'flat' }) {
  const down = props.dir === 'down';
  return (
    <span
      className="tnum"
      style={{
        display: 'inline-block',
        padding: '2px 6px',
        borderRadius: radius.pill,
        fontSize: 12,
        lineHeight: '16px',
        fontWeight: 700,
        fontFamily: font.family,
        fontVariantNumeric: 'tabular-nums',
        color: props.dir === 'up' ? selectSoftInk : down ? '#b45309' : color.body,
        background: down ? color.warningSoft : selectSoft,
      }}
    >
      {props.text}
    </span>
  );
}

const MISSING = '—';

export default function WeekDetailCard(props: {
  model: WeekDetailModel;
  brand: string;
  nameText: string;
  romText: string;
  summaryId?: string;
}) {
  if (!props.model.visible) return null;
  const m = props.model;
  return (
    <article
      className="lpl-volume-detail"
      id={props.summaryId}
      aria-label="当前观察点详细数值"
      style={{
        display: 'grid',
        gridTemplateColumns: '176px minmax(0, 1.25fr) minmax(0, 1fr)',
        gap: 0,
        marginTop: 12,
        padding: '14px 16px',
        border: `1px solid ${color.hairline}`,
        borderRadius: radius.card,
        background: color.canvas,
      }}
    >
      <div
        className="lpl-volume-detail-product"
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          minWidth: 0,
          paddingRight: 16,
          borderRight: `1px solid ${color.hairline}`,
        }}
      >
        <div className="tnum" style={{ fontFamily: font.family, fontVariantNumeric: 'tabular-nums', fontSize: 16, lineHeight: '22px', fontWeight: 600, color: color.ink, whiteSpace: 'nowrap' }}>
          {m.date || MISSING}
          {m.period && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 400, color: color.mute }}>{m.period}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 12, lineHeight: '16px', color: color.body, minWidth: 0, whiteSpace: 'nowrap' }}>
          <BrandDot brand={props.brand} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{props.nameText}</span>
          {props.romText && (
            <span className="tnum" style={{ flexShrink: 0, fontSize: 10, lineHeight: '14px', fontWeight: 600, padding: '0 6px', borderRadius: radius.pill, color: selectSoftInk, background: selectSoft, fontFamily: font.family, fontVariantNumeric: 'tabular-nums' }}>
              {props.romText}
            </span>
          )}
        </div>
        <div className="lpl-volume-detail-sub" style={{ marginTop: 4, color: color.mute, fontSize: 11, lineHeight: '14px' }}>
          当前观察点 · 移出图表回到区间末周
        </div>
      </div>
      <div
        className="lpl-volume-detail-weekly"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          alignItems: 'center',
          paddingInline: 16,
          borderRight: `1px solid ${color.hairline}`,
        }}
      >
        <Metric label="RRP">
          <span style={{ color: color.mute, fontWeight: 400 }}>{m.rrp ?? MISSING}</span>
        </Metric>
        <Metric label="折后价">{m.price ?? MISSING}</Metric>
        <Metric label={m.wowLabel}>
          {m.wow ? <WowBadge text={m.wow.text} dir={m.wow.dir} /> : <span style={{ color: color.mute, fontWeight: 400 }}>{MISSING}</span>}
        </Metric>
        <Metric label={m.volumeLabel}>
          {m.volume != null ? <>{m.volume}<span style={{ marginLeft: 3, fontSize: 11, fontWeight: 400, color: color.mute }}>台</span></> : <span style={{ color: color.mute, fontWeight: 400 }}>{MISSING}</span>}
        </Metric>
      </div>
      <div
        className="lpl-volume-detail-monthly"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', alignItems: 'center', paddingLeft: 16 }}
      >
        <Metric label="当月成本 · 模拟">
          {m.margin.kind === 'ready' ? <>{m.margin.cost}<span style={{ marginLeft: 2, fontSize: 11, fontWeight: 400, color: color.mute }}>/台</span></> : <span style={{ color: color.mute, fontWeight: 400 }}>{MISSING}</span>}
        </Metric>
        <Metric label="单台销毛 · 模拟">
          {m.margin.kind === 'ready' ? <>{m.margin.margin}<span style={{ marginLeft: 2, fontSize: 11, fontWeight: 400, color: color.mute }}>/台</span></> : <span style={{ color: color.mute, fontWeight: 400 }}>{MISSING}</span>}
        </Metric>
        <Metric label="销毛率 · 模拟">
          {m.margin.kind === 'ready' ? m.margin.rate : <span style={{ color: color.mute, fontWeight: 400 }}>{MISSING}</span>}
        </Metric>
      </div>
    </article>
  );
}
