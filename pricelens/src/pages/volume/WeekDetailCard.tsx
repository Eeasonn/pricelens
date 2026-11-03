// 图下方单周明细卡（2026-11-03 Eason 拍板：紧凑化单行摘要条，高保真稿
// design-proposals/volume-detail-card-compact.html 方案 A）：
// 单行 = 身份区（面板头并入，宿主在 VolumePrice：紧凑胶囊 + DNS 店铺 chip +
//   组内对比主品的单行「同步店铺」）+ 日期/桶号 + 折后价（RRP 同值省略、异值挂
//   删除线小字）+ 环比胶囊（涨蓝跌琥珀）+ 销量 + 右挂「本组对比（N）」；
//   窄卡放不下自然折行（flexWrap + rowGap 4），不截断不溢出。
// 原两行药丸身份区（53px）与「label 上、值下」指标堆叠（41px）退役——卡高
//   141px → 38px；销毛成本开时追加第二行迷你销毛条（38 → 65px）。
// 销毛三格（2026-11-02 Eason 开关）：「模拟」一枚行首小标覆盖三值（拍板③：
//   不再逐格带「· 模拟」）；被隔离周不造销毛，合并显示「价格不可信」提示。
// 缺采显示 —，不借用相邻周；环比只对上一可信点，跨隔离周时胶囊旁挂小注。
// 无观察点（范围内无数据）时头部照常渲染（隐藏/店铺入口不能随卡消失），指标区显提示。
import type { CSSProperties, ReactNode } from 'react';
import { Popconfirm } from 'antd';
import { color, font, radius, selectSoft, selectSoftInk } from '../../theme/tokens';
import type { WeekDetailModel } from './weekDetail';

/** 行内值：14px/20 600（层级 = 身份胶囊名 12 > 指标值 14 > 日期 12 > 标签/桶号 11） */
const VALUE_FONT: CSSProperties = {
  fontFamily: font.family,
  fontVariantNumeric: 'tabular-nums',
  fontSize: 14,
  lineHeight: '20px',
  fontWeight: 600,
  color: color.ink,
  whiteSpace: 'nowrap',
};

const LABEL_FONT: CSSProperties = {
  fontSize: 11,
  lineHeight: '20px',
  color: color.mute,
  whiteSpace: 'nowrap',
};

/** 竖分隔线：身份+日期 与 指标区之间的一道轻隔断 */
const SEP_STYLE: CSSProperties = {
  flex: '0 0 1px',
  alignSelf: 'center',
  height: 14,
  background: color.hairline,
};

/** 迷你销毛行：单行摘要条下的第二行（开销毛成本时），上缘 hairline */
const MINI_ROW_STYLE: CSSProperties = {
  marginTop: 5,
  paddingTop: 5,
  borderTop: `1px solid ${color.hairline}`,
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  columnGap: 6,
  rowGap: 3,
  fontSize: 12,
  lineHeight: '16px',
  color: color.body,
  whiteSpace: 'nowrap',
};

/** 「模拟」行首小标（拍板③）：一枚覆盖整组三值，替代逐格「· 模拟」 */
const SIM_TAG_STYLE: CSSProperties = {
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

function WowBadge(props: { text: string; dir: 'up' | 'down' | 'flat' }) {
  const down = props.dir === 'down';
  return (
    <span
      className="tnum"
      style={{
        display: 'inline-block',
        padding: '1px 6px',
        borderRadius: radius.pill,
        fontSize: 11,
        lineHeight: '16px',
        fontWeight: 700,
        fontFamily: font.family,
        fontVariantNumeric: 'tabular-nums',
        color: props.dir === 'up' ? selectSoftInk : down ? '#b45309' : color.body,
        background: down ? color.warningSoft : selectSoft,
        whiteSpace: 'nowrap',
      }}
    >
      {props.text}
    </span>
  );
}

const MISSING = '—';

/** 异常守卫小徽标（2026-11-01）：隔离/待核对/已确认——琥珀/蓝，文字承载状态 */
function SuspectTag(props: { kind: 'quarantined' | 'pending' | 'exempted' }) {
  const text = props.kind === 'quarantined' ? '已隔离' : props.kind === 'pending' ? '待核对' : '已确认';
  const blue = props.kind === 'exempted';
  return (
    <span
      style={{
        flexShrink: 0,
        marginLeft: 6,
        padding: '1px 6px',
        fontSize: 10,
        lineHeight: '14px',
        fontWeight: 700,
        borderRadius: radius.pill,
        color: blue ? selectSoftInk : '#b45309',
        background: blue ? selectSoft : color.warningSoft,
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </span>
  );
}

const CARD_STYLE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  marginTop: 6,
  padding: '6px 12px',
  border: `1px solid ${color.hairline}`,
  borderRadius: radius.card,
  background: color.canvas,
  minWidth: 0,
};

/** 日期：12px（2026-11-03 单行化后与身份名同级，桶号 11px mute 随行） */
const DATE_STYLE: CSSProperties = {
  flex: '0 0 auto',
  paddingLeft: 2,
  fontFamily: font.family,
  fontVariantNumeric: 'tabular-nums',
  fontSize: 12,
  lineHeight: '20px',
  fontWeight: 600,
  color: color.ink,
  whiteSpace: 'nowrap',
};

/** RRP 删除线小字：仅 RRP ≠ 折后价时出现（同值省略，拍板②） */
const RRP_STYLE: CSSProperties = {
  flexShrink: 0,
  fontFamily: font.family,
  fontVariantNumeric: 'tabular-nums',
  fontSize: 11,
  lineHeight: '20px',
  color: color.mute,
  textDecoration: 'line-through',
  whiteSpace: 'nowrap',
};

export default function WeekDetailCard(props: {
  model: WeekDetailModel;
  /** 身份区宿主（2026-11-03 拍板⑤）：紧凑单行胶囊 + DNS 店铺 chip
   *  （组内对比主品含左侧单行「同步店铺」钮），由 VolumePrice 构造 */
  identity: ReactNode;
  /** 单行右端轻量动作：阅读视图主品 = 本组对比入口 */
  identityActions?: ReactNode;
  /** 异常守卫裁定入口（2026-11-01）：观察点打标时出现（已确认态不再出） */
  onExempt?: () => void;
  onIsolate?: () => void;
  /** ARIA：卡片标题元素 id（codex 会话：可访问名关联） */
  summaryId?: string;
  /** 销毛成本开关（2026-11-02 Eason）：关 / 组内对比时不显示成本销毛三格 */
  showMargin?: boolean;
}) {
  const m = props.model;
  const showMargin = props.showMargin !== false;
  const dateBlock = (
    <div className="tnum" style={DATE_STYLE}>
      {m.visible ? m.date || MISSING : MISSING}
      {m.visible && m.period && <span style={{ marginLeft: 4, fontSize: 11, fontWeight: 400, color: color.mute }}>{m.period}</span>}
    </div>
  );
  // 折后价 + RRP：同值（含 RRP 缺失）只显折后价；异值折后价旁挂 RRP 删除线小字
  const rrpSame = m.rrp != null && m.price != null && m.rrp === m.price;
  const priceBlock = (
    <span
      className="tnum"
      title="折后价"
      style={{ ...VALUE_FONT, display: 'inline-flex', alignItems: 'center', minWidth: 0, overflow: 'hidden' }}
    >
      <span style={m.price != null ? { overflow: 'hidden', textOverflow: 'ellipsis' } : { color: color.mute, fontWeight: 400 }}>
        {m.price ?? MISSING}
      </span>
      {m.visible && m.price != null && m.priceSuspect && <SuspectTag kind={m.priceSuspect} />}
    </span>
  );
  const rrpBlock = m.visible && m.rrp != null && !rrpSame ? (
    <span className="tnum" style={RRP_STYLE} title={`RRP ${m.rrp}`}>RRP {m.rrp}</span>
  ) : null;
  // 环比：胶囊 + 跨隔离周小注；观察周被隔离时整段改「已隔离 · 不计环比」
  const wowBlock = m.priceSuspect === 'quarantined' ? (
    <span
      title="该周价格已隔离，不计算环比（原值可见）"
      style={{ color: '#b45309', fontSize: 12, lineHeight: '20px', whiteSpace: 'nowrap' }}
    >
      已隔离 · 不计环比
    </span>
  ) : (
    <>
      <span style={LABEL_FONT}>{m.wowLabel}</span>
      {m.wow ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
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
        </span>
      ) : (
        <span style={{ ...VALUE_FONT, color: color.mute, fontWeight: 400 }}>{MISSING}</span>
      )}
    </>
  );
  const volumeBlock = (
    <>
      <span style={LABEL_FONT}>{m.volumeLabel}</span>
      {m.volume != null ? (
        <span className="tnum" style={VALUE_FONT}>
          {m.volume}
          <span style={{ marginLeft: 3, fontSize: 11, fontWeight: 400, color: color.mute }}>台</span>
        </span>
      ) : (
        <span style={{ ...VALUE_FONT, color: color.mute, fontWeight: 400 }}>{MISSING}</span>
      )}
    </>
  );
  // 迷你销毛行：ready 显三值（各带「模拟」行首标覆盖），empty/gap 显 —；被隔离周合并提示
  const marginReady = m.margin.kind === 'ready';
  const marginBlock = showMargin && m.visible && (
    m.marginMasked ? (
      <div style={MINI_ROW_STYLE}>
        价格不可信<span style={{ marginLeft: 6, fontSize: 11 }}>该周已隔离，不计算销毛</span>
      </div>
    ) : (
      <div style={MINI_ROW_STYLE}>
        <span style={SIM_TAG_STYLE}>模拟</span>
        <span>当月成本 {marginReady ? <span className="tnum" style={{ fontWeight: 600, color: color.ink }}>{m.margin.cost}<span style={{ marginLeft: 2, fontSize: 11, fontWeight: 400, color: color.mute }}>/台</span></span> : <span className="tnum" style={{ color: color.mute }}>{MISSING}</span>}</span>
        <span style={{ color: color.hairlineStrong }}>·</span>
        <span>单台销毛 {marginReady ? <span className="tnum" style={{ fontWeight: 600, color: color.ink }}>{m.margin.margin}<span style={{ marginLeft: 2, fontSize: 11, fontWeight: 400, color: color.mute }}>/台</span></span> : <span className="tnum" style={{ color: color.mute }}>{MISSING}</span>}</span>
        <span style={{ color: color.hairlineStrong }}>·</span>
        <span>销毛率 {marginReady ? <span className="tnum" style={{ fontWeight: 600, color: color.ink }}>{m.margin.rate}</span> : <span className="tnum" style={{ color: color.mute }}>{MISSING}</span>}</span>
      </div>
    )
  );
  const header = (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 8, rowGap: 4, minWidth: 0 }}>
      {props.identity}
      {dateBlock}
      {m.visible && (
        <>
          <span style={SEP_STYLE} aria-hidden />
          {priceBlock}
          {rrpBlock}
          {wowBlock}
          {volumeBlock}
        </>
      )}
      <span style={{ flex: '1 1 0', minWidth: 0 }} />
      {props.identityActions && <span style={{ flexShrink: 0, display: 'inline-flex' }}>{props.identityActions}</span>}
    </div>
  );
  if (!m.visible) {
    return (
      <article className="lpl-volume-detail" id={props.summaryId} aria-label="当前观察点详细数值" style={CARD_STYLE}>
        {header}
        <div style={{ borderTop: `1px solid ${color.hairline}`, marginTop: 5, paddingTop: 5, color: color.mute, fontSize: 12, lineHeight: '18px' }}>
          该时间范围内无数据
        </div>
      </article>
    );
  }
  return (
    <article
      className="lpl-volume-detail"
      id={props.summaryId}
      aria-label="当前观察点详细数值"
      style={CARD_STYLE}
    >
      {header}
      {marginBlock}
      {/* 被隔离/待核对点：人工裁定入口（预览-确认-记录-撤销），独立整行不被挤压 */}
      {m.priceSuspect && m.priceSuspect !== 'exempted' && (props.onExempt || props.onIsolate) && (
        <div style={{ borderTop: `1px solid ${color.hairline}`, marginTop: 5, paddingTop: 5, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {props.onExempt && (
            <Popconfirm
              title="确认该价格为真实价格？"
              description="确认后该点参与计算并保留「已确认」标注，可在配置页撤销"
              okText="确认"
              cancelText="取消"
              okButtonProps={{ size: 'small' }}
              cancelButtonProps={{ size: 'small' }}
              onConfirm={props.onExempt}
            >
              <button
                type="button"
                title="确认该价格为真实价格：参与计算并留痕（配置页可撤销）"
                style={{ height: 20, padding: '0 8px', border: `1px solid ${color.hairline}`, borderRadius: radius.control, background: color.canvas, color: color.body, font: 'inherit', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                确认真实价格
              </button>
            </Popconfirm>
          )}
          {props.onIsolate && m.priceSuspect === 'pending' && (
            <Popconfirm
              title="标记该价格为异常？"
              description="标记后该点退出计算（原值保留），可在配置页撤销"
              okText="标记"
              cancelText="取消"
              okButtonProps={{ size: 'small', danger: true }}
              cancelButtonProps={{ size: 'small' }}
              onConfirm={props.onIsolate}
            >
              <button
                type="button"
                title="标记该价格为异常：退出计算（原值保留），配置页可撤销"
                style={{ height: 20, padding: '0 8px', border: '1px solid rgba(235, 87, 87, 0.4)', borderRadius: radius.control, background: color.canvas, color: '#b45309', font: 'inherit', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                标记异常
              </button>
            </Popconfirm>
          )}
        </div>
      )}
    </article>
  );
}
