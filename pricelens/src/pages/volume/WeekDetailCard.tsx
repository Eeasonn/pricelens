// 图下方单周明细卡（2026-11-02 Eason 三轮收敛后的最终形态）：
// 头部一行 = 价格页同款 PillUnit（平台小药丸 = 店铺筛选、产品药丸点击隐藏；组内对比主品
//   左侧挂 36×36「店铺同步」）+ 日期/桶号（对齐药丸名行）+ 右挂「本组对比（N）」——
//   原「药丸行 + 日期行」两行合并为一行（Eason：药丸行可以删，与日期行同一行）；
// 指标一行 = RRP / 折后价 / 环比 / 销量（+ 开销毛成本时：当月成本 / 单台销毛 / 销毛率，
//   三格都显式带「模拟」；竖 hairline 分组）。窄卡片指标自动换行（flexWrap + minWidth）。
// 环比涨跌用涨蓝跌琥珀（第一百八十七轮定案）；缺采显示 —，不借用相邻周。
// 无观察点（范围内无数据）时头部照常渲染（隐藏/店铺入口不能随卡消失），指标区显提示。
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
    <div style={{ flex: '1 1 0', minWidth: 76 }}>
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
  display: 'flex',
  flexDirection: 'column',
  marginTop: 6, // 工具行只剩齿轮后卡片再上提（Eason：第一行空出来了）
  padding: '10px 16px 12px',
  border: `1px solid ${color.hairline}`,
  borderRadius: radius.card,
  background: color.canvas,
  minWidth: 0,
};

/** 日期块：13px（Eason：层级 = 产品药丸 > 指标值 16 > 日期 13 > 桶号 11），
 *  paddingBottom 对齐 PillUnit 第二行（产品药丸名行） */
const DATE_STYLE: CSSProperties = {
  flex: '0 0 auto',
  paddingBottom: 9,
  paddingLeft: 2,
  fontFamily: font.family,
  fontVariantNumeric: 'tabular-nums',
  fontSize: 13,
  lineHeight: '18px',
  fontWeight: 600,
  color: color.ink,
  whiteSpace: 'nowrap',
};

export default function WeekDetailCard(props: {
  model: WeekDetailModel;
  /** 身份区（2026-11-02 Eason：面板头并入明细卡头部）：价格页同款 PillUnit 宿主
   *  （组内对比主品含左侧 36×36 店铺同步） */
  identity: ReactNode;
  /** 头部右端轻量动作：阅读视图主品 = 本组对比入口 */
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
      {m.visible && m.period && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 400, color: color.mute }}>{m.period}</span>}
    </div>
  );
  const header = (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', columnGap: 12, rowGap: 4, minWidth: 0 }}>
      {props.identity}
      {dateBlock}
      <div style={{ flex: '1 1 0' }} />
      {props.identityActions && <div style={{ flex: '0 0 auto', paddingBottom: 8 }}>{props.identityActions}</div>}
    </div>
  );
  if (!m.visible) {
    return (
      <article className="lpl-volume-detail" id={props.summaryId} aria-label="当前观察点详细数值" style={CARD_STYLE}>
        {header}
        <div style={{ borderTop: `1px solid ${color.hairline}`, marginTop: 8, paddingTop: 10, color: color.mute, fontSize: 12, lineHeight: '18px' }}>
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
      {/* 指标行：周口径四格（+ 开销毛成本时月口径三格，竖 hairline 分组）；窄卡自动换行 */}
      <div style={{ borderTop: `1px solid ${color.hairline}`, marginTop: 8, padding: '10px 0 0', display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', rowGap: 8, minWidth: 0 }}>
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
        {showMargin && (
          <div style={{ flex: '2 1 220px', minWidth: 220, borderLeft: `1px solid ${color.hairline}`, paddingLeft: 14, display: 'flex' }}>
            {m.marginMasked ? (
              // 被隔离周不造销毛（2026-11-01 异常守卫）：三格合并显「价格不可信」提示
              <div style={{ color: color.mute, fontSize: 12, lineHeight: '18px', alignSelf: 'center' }}>
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
        )}
        {/* 被隔离/待核对点：人工裁定入口（预览-确认-记录-撤销），独立整行不被指标格挤压 */}
        {m.priceSuspect && m.priceSuspect !== 'exempted' && (props.onExempt || props.onIsolate) && (
          <div style={{ flex: '1 1 100%', display: 'flex', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
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
    </article>
  );
}
