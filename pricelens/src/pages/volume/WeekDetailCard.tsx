// 图下方单周明细卡（视觉 demo：detail-card 三栏网格）。
// 左 = 身份区（2026-11-02 Eason：面板头并入明细卡首行——价格页同款 PillUnit：平台小药丸
//      = 店铺筛选、产品药丸点击隐藏）+ 日期/桶号行（右挂本组对比 / 店铺同步轻量动作）；
// 中 = RRP / 折后价 / 环比 / 销量；右 = 当月成本 / 单台销毛 / 销毛率（三格都显式带「模拟」）。
// 环比涨跌用涨蓝跌琥珀（第一百八十七轮定案）；缺采显示 —，不借用相邻周。
// 无观察点（范围内无数据）时身份区照常渲染（隐藏/店铺入口不能随卡消失），指标区合并显提示。
// 窄容器时改单列（index.css 的容器查询 .lpl-volume-detail）。
import type { CSSProperties, ReactNode } from 'react';
import { Popconfirm } from 'antd';
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
  display: 'grid',
  // 身份列 200：药丸 + 「10-14 2026W42」(13px) + 右挂「本组对比（N）」一行放得下（176 时互相压盖）；
  // ≤780px 容器查询整卡改单列（index.css）
  gridTemplateColumns: '200px minmax(0, 1.25fr) minmax(0, 1fr)',
  gap: 0,
  marginTop: 6, // 工具行只剩齿轮后卡片再上提（Eason：第一行空出来了）
  padding: '12px 16px',
  border: `1px solid ${color.hairline}`,
  borderRadius: radius.card,
  background: color.canvas,
};

export default function WeekDetailCard(props: {
  model: WeekDetailModel;
  /** 身份区（2026-11-02 Eason：面板头并入明细卡首行）：价格页同款 PillUnit 宿主 */
  identity: ReactNode;
  /** 日期行右侧轻量动作：阅读视图主品 = 本组对比入口；组内对比主品 = 店铺同步开关 */
  identityActions?: ReactNode;
  /** 异常守卫裁定入口（2026-11-01）：观察点打标时出现（已确认态不再出） */
  onExempt?: () => void;
  onIsolate?: () => void;
  /** ARIA：卡片标题元素 id（codex 会话：可访问名关联） */
  summaryId?: string;
}) {
  const m = props.model;
  const identityCol = (
    <div
      className="lpl-volume-detail-product"
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'flex-start',
        minWidth: 0,
        paddingRight: 16,
        borderRight: `1px solid ${color.hairline}`,
      }}
    >
      {props.identity}
      {/* 日期行：右挂动作放不下时折到下一行（flexWrap），绝不压盖日期 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: 8, rowGap: 2, marginTop: 6, width: '100%', minWidth: 0 }}>
        {/* 日期 13px（Eason：原 16px 与指标值同级显得过大）——层级：产品药丸 > 指标值 16 > 日期 13 > 桶号 11 */}
        <div className="tnum" style={{ flex: '0 0 auto', fontFamily: font.family, fontVariantNumeric: 'tabular-nums', fontSize: 13, lineHeight: '18px', fontWeight: 600, color: color.ink, whiteSpace: 'nowrap' }}>
          {m.visible ? m.date || MISSING : MISSING}
          {m.visible && m.period && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 400, color: color.mute }}>{m.period}</span>}
        </div>
        {props.identityActions}
      </div>
    </div>
  );
  if (!m.visible) {
    return (
      <article className="lpl-volume-detail" id={props.summaryId} aria-label="当前观察点详细数值" style={CARD_STYLE}>
        {identityCol}
        <div className="lpl-volume-detail-weekly" style={{ gridColumn: '2 / -1', display: 'flex', alignItems: 'center', paddingInline: 16, color: color.mute, fontSize: 12, lineHeight: '18px' }}>
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
      {identityCol}
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
        <Metric label="折后价">
          {m.price != null ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', minWidth: 0 }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.price}</span>
              {m.priceSuspect && <SuspectTag kind={m.priceSuspect} />}
            </span>
          ) : MISSING}
        </Metric>
        <Metric label={m.wowLabel}>
          {m.wow ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
              <WowBadge text={m.wow.text} dir={m.wow.dir} />
              {m.wowSkip > 0 && (
                <span
                  className="tnum"
                  title={`环比对上一可信点，跨过 ${m.wowSkip} 个已隔离周（${m.wowSkipBuckets.join('、')}）`}
                  style={{ flexShrink: 0, fontSize: 10, lineHeight: '13px', color: color.mute, whiteSpace: 'nowrap' }}
                >
                  跨{m.wowSkip}隔离周
                </span>
              )}
            </span>
          ) : m.priceSuspect === 'quarantined' ? (
            <span title="该周价格已隔离，不计算环比（原值可见）" style={{ color: '#b45309', fontWeight: 400, fontSize: 12, whiteSpace: 'normal', lineHeight: '16px' }}>已隔离<br />不计环比</span>
          ) : (
            <span style={{ color: color.mute, fontWeight: 400 }}>{MISSING}</span>
          )}
        </Metric>
        <Metric label={m.volumeLabel}>
          {m.volume != null ? <>{m.volume}<span style={{ marginLeft: 3, fontSize: 11, fontWeight: 400, color: color.mute }}>台</span></> : <span style={{ color: color.mute, fontWeight: 400 }}>{MISSING}</span>}
        </Metric>
        {/* 被隔离/待核对点：原值保留 + 人工裁定入口（预览-确认-记录-撤销）。
            独立整行——放指标格内会在窄面板被邻列长文本（跨N隔离周等）压住点不到 */}
        {m.priceSuspect && m.priceSuspect !== 'exempted' && (props.onExempt || props.onIsolate) && (
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
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
      </div>
      <div
        className="lpl-volume-detail-monthly"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', alignItems: 'center', paddingLeft: 16 }}
      >
        {m.marginMasked ? (
          // 被隔离周不造销毛（2026-11-01 异常守卫）：三格合并显「价格不可信」提示
          <div style={{ gridColumn: '1 / -1', color: color.mute, fontSize: 12, lineHeight: '18px' }}>
            价格不可信<span style={{ marginLeft: 6, fontSize: 11 }}>该周已隔离，不计算销毛</span>
          </div>
        ) : (
          <>
            <Metric label="当月成本 · 模拟">
              {m.margin.kind === 'ready' ? <>{m.margin.cost}<span style={{ marginLeft: 2, fontSize: 11, fontWeight: 400, color: color.mute }}>/台</span></> : <span style={{ color: color.mute, fontWeight: 400 }}>{MISSING}</span>}
            </Metric>
            <Metric label="单台销毛 · 模拟">
              {m.margin.kind === 'ready' ? <>{m.margin.margin}<span style={{ marginLeft: 2, fontSize: 11, fontWeight: 400, color: color.mute }}>/台</span></> : <span style={{ color: color.mute, fontWeight: 400 }}>{MISSING}</span>}
            </Metric>
            <Metric label="销毛率 · 模拟">
              {m.margin.kind === 'ready' ? m.margin.rate : <span style={{ color: color.mute, fontWeight: 400 }}>{MISSING}</span>}
            </Metric>
          </>
        )}
      </div>
    </article>
  );
}
