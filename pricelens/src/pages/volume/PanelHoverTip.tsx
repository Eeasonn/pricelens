// ============================================================
// 量价面板 · 悬停浮窗（2026-11-03 主品视图改版，Eason）：明细卡行退役后，
// 观察列的时点读数全部收进本浮窗——信息结构参照价格走势悬停小卡：日期/桶号
// + RRP（删除线参照口径）+ 折后价（含异常守卫徽标）+ 环比胶囊（涨蓝跌琥珀，
// 隔离周「已隔离 · 不计环比」）+ 销量 + 成本销毛行（随「销毛成本」开关显隐；
// 竞品/空桶按既有语义显示 —，隔离周合并「价格不可信」）。
// 取数模型与组视图图下明细卡同一份（weekDetailModel）：缺采 — 不借用、环比
// 跳隔离周等口径两处一致；「模拟」小标口径同明细卡。
// 只读浮层（pointerEvents none，不挡指针承接层），跟随观察列、右缘自动左翻；
// 无悬停不渲染。summaryId 供面板 stack 的 aria-describedby 关联（键盘 ←/→
// 走悬停通路后焦点上下文仍能读到同一份读数）。
// ============================================================
import type { CSSProperties } from 'react';
import { color, font, radius, shadow } from '../../theme/tokens';
import { LABEL_FONT, SuspectTag, VALUE_FONT, WowBadge } from './WeekDetailCard';
import type { WeekDetailModel } from './weekDetail';

const MISSING = '—';

const SEP: CSSProperties = {
  flex: '0 0 1px',
  alignSelf: 'center',
  height: 12,
  background: color.hairlineStrong,
};

/** 「模拟」行首小标：与明细卡同一枚（当月模拟口径，不靠颜色单独表达） */
const SIM_TAG: CSSProperties = {
  flexShrink: 0,
  padding: '1px 6px',
  borderRadius: radius.pill,
  fontSize: 10,
  lineHeight: '14px',
  fontWeight: 700,
  color: '#b45309',
  background: color.warningSoft,
  whiteSpace: 'nowrap',
};

const MARGIN_ROW: CSSProperties = {
  marginTop: 2,
  paddingTop: 3,
  borderTop: `1px solid ${color.hairline}`,
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  columnGap: 5,
  rowGap: 2,
  fontSize: 11,
  lineHeight: '16px',
  color: color.body,
  whiteSpace: 'nowrap',
};

const MARGIN_VALUE: CSSProperties = {
  fontWeight: 600,
  color: color.ink,
  fontVariantNumeric: 'tabular-nums',
};

export default function PanelHoverTip(props: {
  model: WeekDetailModel;
  /** 「销毛成本」开关：开 = 浮窗带成本销毛行（竞品/空桶显 —） */
  showMargin: boolean;
  /** 观察列中心横坐标（宿主相对容器坐标） */
  x: number;
  plotLeft: number;
  plotWidth: number;
  /** 浮窗顶边（缺省贴绘图区顶空气带内） */
  top?: number;
  /** ARIA：面板 stack 的 aria-describedby 目标 id */
  summaryId?: string;
}) {
  const m = props.model;
  if (!m.visible) return null;
  const W = 232;
  const GAP = 14;
  const rightEdge = props.plotLeft + props.plotWidth;
  const flip = props.x + GAP + W > rightEdge;
  const left = flip ? Math.max(props.plotLeft, props.x - GAP - W) : Math.min(rightEdge - W, props.x + GAP);
  const marginReady = m.margin.kind === 'ready';
  return (
    <div
      id={props.summaryId}
      aria-label="当前观察点详细数值"
      style={{
        position: 'absolute',
        left,
        top: props.top ?? 6,
        width: W,
        boxSizing: 'border-box',
        zIndex: 20,
        pointerEvents: 'none',
        background: color.canvas,
        border: `1px solid ${color.hairline}`,
        borderRadius: radius.card,
        boxShadow: shadow.l2,
        padding: '6px 10px 7px',
        fontFamily: font.family,
      }}
    >
      {/* 日期/桶号：与明细卡同层级（12px 墨色 + 桶号 11px mute） */}
      <div className="tnum" style={{ fontSize: 12, lineHeight: '16px', fontWeight: 600, color: color.ink, marginBottom: 3, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
        {m.date}
        {m.period && <span style={{ marginLeft: 5, fontSize: 11, fontWeight: 400, color: color.mute }}>{m.period}</span>}
      </div>
      {/* RRP（删除线参照）+ 折后价 + 环比：一行放不下自然折行，不截断 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 6, rowGap: 3, minWidth: 0 }}>
        {m.rrp != null && (
          <>
            <span className="tnum" title={`RRP ${m.rrp}`} style={{ flexShrink: 0, fontSize: 11, lineHeight: '20px', color: color.mute, textDecoration: 'line-through', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
              RRP {m.rrp}
            </span>
            <span style={SEP} aria-hidden />
          </>
        )}
        <span title="折后价" style={{ ...VALUE_FONT, display: 'inline-flex', alignItems: 'center', minWidth: 0, overflow: 'hidden' }}>
          <span style={m.price != null ? { overflow: 'hidden', textOverflow: 'ellipsis' } : { color: color.mute, fontWeight: 400 }}>
            {m.price ?? MISSING}
          </span>
          {m.priceSuspect && <SuspectTag kind={m.priceSuspect} />}
        </span>
        <span style={SEP} aria-hidden />
        {m.priceSuspect === 'quarantined' ? (
          <span title="该周价格已隔离，不计算环比（原值可见）" style={{ color: '#b45309', fontSize: 12, lineHeight: '20px', whiteSpace: 'nowrap' }}>
            已隔离 · 不计环比
          </span>
        ) : (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
            <span style={LABEL_FONT}>{m.wowLabel}</span>
            {m.wow ? (
              <>
                <WowBadge text={m.wow.text} dir={m.wow.dir} />
                {m.wowSkip > 0 && (
                  <span
                    className="tnum"
                    title={`环比对上一可信点，跨过 ${m.wowSkip} 个已隔离周（${m.wowSkipBuckets.join('、')}）`}
                    style={{ flexShrink: 0, fontSize: 10, lineHeight: '20px', color: color.mute, whiteSpace: 'nowrap' }}
                  >
                    跨{m.wowSkip}隔离周
                  </span>
                )}
              </>
            ) : (
              <span style={{ ...VALUE_FONT, color: color.mute, fontWeight: 400 }}>{MISSING}</span>
            )}
          </span>
        )}
      </div>
      {/* 销量行（价格走势浮窗同语言：hairline 分隔 + 右对齐数值） */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, paddingTop: 3, borderTop: `1px solid ${color.hairline}`, fontSize: 11, lineHeight: '18px' }}>
        <span style={LABEL_FONT}>{m.volumeLabel}</span>
        {m.volume != null ? (
          <span className="tnum" style={{ marginLeft: 'auto', fontWeight: 600, fontSize: 12, color: color.ink, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
            {m.volume}
            <span style={{ marginLeft: 2, fontWeight: 400, color: color.mute }}>台</span>
          </span>
        ) : (
          <span className="tnum" style={{ marginLeft: 'auto', ...VALUE_FONT, color: color.mute, fontWeight: 400 }}>{MISSING}</span>
        )}
      </div>
      {/* 成本销毛行：随「销毛成本」开关显隐；隔离周合并提示，空桶/竞品显 — */}
      {props.showMargin && (
        m.marginMasked ? (
          <div style={{ ...MARGIN_ROW, display: 'block' }}>
            价格不可信<span style={{ marginLeft: 6, fontSize: 10, color: color.mute }}>该周已隔离，不计算销毛</span>
          </div>
        ) : (
          <div style={MARGIN_ROW}>
            <span style={SIM_TAG}>模拟</span>
            <span>当月成本 {marginReady ? <span className="tnum" style={MARGIN_VALUE}>{m.margin.cost}<span style={{ marginLeft: 2, fontWeight: 400, color: color.mute }}>/台</span></span> : <span className="tnum" style={{ color: color.mute }}>{MISSING}</span>}</span>
            <span style={{ color: color.hairlineStrong }}>·</span>
            <span>单台销毛 {marginReady ? <span className="tnum" style={MARGIN_VALUE}>{m.margin.margin}<span style={{ marginLeft: 2, fontWeight: 400, color: color.mute }}>/台</span></span> : <span className="tnum" style={{ color: color.mute }}>{MISSING}</span>}</span>
            <span style={{ color: color.hairlineStrong }}>·</span>
            <span>销毛率 {marginReady ? <span className="tnum" style={MARGIN_VALUE}>{m.margin.rate}</span> : <span className="tnum" style={{ color: color.mute }}>{MISSING}</span>}</span>
          </div>
        )
      )}
    </div>
  );
}
