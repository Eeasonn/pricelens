// ============================================================
// 预警中心入口与共享件（第五十二轮建 / 追补⑨升页面 / 预警中心重构收编）。
// - AlertBell：统一订阅铃铛（未订阅 = 描边灰、已订阅 = 金色实心 + 触发金点），
//   看板时点页签 / 总览行尾与预警列 / 预警页矩阵行尾共用——原三处形态互不一致
//   （无字实心铃 / 带字整组按钮 / 文字链接），重构后同一组件同一语义；
// - useAlerts()：引擎统一入参（state → AlertCfg），页面/总览列/看板共用一份结果；
// - TypePill / TYPE_STYLE / pctText：类型徽标与文案（总览预警列、预警页共用）。
// 四类预警（alerts.ts）：调价 / 折扣 / 平台价差 / 档位间距。
// ============================================================
import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Drawer, Input, Tag } from 'antd';
import {
  ALERT_LIFECYCLE_LABEL,
  ALERT_PRIORITY_LABEL,
  type AlertAction,
  type AlertLifecycle,
  type AlertRecord,
} from '../dataModel/alertLifecycle';
import { BellFilled, BellOutlined } from '@ant-design/icons';
import { useFilters } from '../state/FiltersContext';
import { buildAlerts, type AlertItem, type AlertType } from '../dataModel/alerts';
import { color, formatPrice, radius } from '../theme/tokens';

/** 类型徽标：调价 = 蓝、折扣 = 琥珀、平台价差 = 紫、档位间距 = 玫红 */
export const TYPE_STYLE: Record<AlertType, { label: string; short: string; fg: string; bg: string }> = {
  'price-change': { label: '调价', short: '调价', ...color.alert.priceChange },
  promo: { label: '折扣', short: '折扣', ...color.alert.promo },
  'platform-gap': { label: '平台价差', short: '平台', ...color.alert.platformGap },
  'own-gap': { label: '档位间距', short: '间距', ...color.alert.ownGap },
};

export function TypePill({ type }: { type: AlertType }) {
  const s = TYPE_STYLE[type];
  return (
    <span
      role="img"
      aria-label={`${s.label}预警`}
      title={`${s.label}预警`}
      style={{
        flexShrink: 0,
        padding: '0 7px',
        fontSize: 10,
        fontWeight: 700,
        lineHeight: '16px',
        borderRadius: radius.pill,
        color: s.fg,
        background: s.bg,
      }}
    >
      {s.label}
    </span>
  );
}

/** 比例（小数）→ 带符号百分比文案，按百分数单位保留 digits 位（−0.0434 → −4.3%） */
export const pctText = (v: number | null, digits = 1): string => {
  if (v == null || !Number.isFinite(v)) return '—';
  const p = v * 100;
  const r = Math.round(Math.abs(p) * 10 ** digits) / 10 ** digits;
  const sign = p < -1e-9 ? '−' : p > 1e-9 ? '+' : '±';
  return `${sign}${r}%`;
};

/**
 * 单条预警的凝练读数（第五十五轮，用户：详情要凝练、能放进总览预警格）：
 * 调价 = ↓x.x% → $价；折扣 = 促销加深/收窄 x.xpp；平台价差 = 平台差 +x.x%；
 * 档位间距 = 间距 +x.x%。完整口径（较 RRP、平台明细等）留给悬停 title 与预警页展开的历史明细。
 */
export function alertDigest(a: AlertItem, currency: 'usd' | 'local'): string {
  switch (a.type) {
    case 'price-change': {
      const arrow = a.wowPct != null && a.wowPct < 0 ? '↓' : '↑';
      const pct = a.wowPct != null && Number.isFinite(a.wowPct) ? `${Math.abs(a.wowPct * 100).toFixed(1)}%` : '—';
      return `${arrow}${pct} → ${formatPrice(a.price, currency)}`;
    }
    case 'promo':
      const delta = a.promoDeltaPp != null && Number.isFinite(a.promoDeltaPp) ? a.promoDeltaPp : null;
      return `促销${delta != null && delta > 0 ? '加深' : '收窄'} ${delta == null ? '—' : `${Math.abs(delta).toFixed(1)}pp`}`;
    case 'platform-gap':
      return `平台差 ${pctText(a.gapPct)}`;
    case 'own-gap':
      return `间距 ${pctText(a.ownGapPct)}`;
  }
}

/** 预警引擎统一入参（state → AlertCfg）：预警页 / 页头徽标 / 总览列 / 看板共用 */
export function useAlerts(): AlertItem[] {
  const { state } = useFilters();
  return useMemo(
    () =>
      buildAlerts({
        subs: state.alertSubs,
        enabled: state.alertTypes,
        thresholds: state.alertThresholds,
        products: state.alertProducts,
        currency: state.currency,
        scope: { countryCode: state.countryCode, industry: state.industry },
        platform: state.platform,
      }),
    [
      state.alertSubs,
      state.alertTypes,
      state.alertThresholds,
      state.alertProducts,
      state.currency,
      state.countryCode,
      state.industry,
      state.platform,
    ],
  );
}

/** 统一订阅铃铛（预警中心重构）：未订阅 = 描边弱灰铃、已订阅 = 金色实心铃（antd gold-6），
 *  外挂 Badge 金点 = 该系列当前最新态有触发（悬停显条数）。点击 = 切换该系列订阅。
 *  受控组件：订阅态与回调由调用方给（看板/总览/预警页同语义）。 */
export function AlertBell({ subscribed, count = 0, size = 14, onToggle }: {
  subscribed: boolean;
  /** 该系列当前最新态触发条数（>0 挂金点；历史条数不传入） */
  count?: number;
  size?: number;
  onToggle: () => void;
}) {
  return (
    <Badge dot={count > 0} color={color.alert.bell} title={`${count} 条最新预警`}>
      <button
        type="button"
        aria-label={subscribed ? '已订阅 · 点击取消订阅该产品的价格预警' : '订阅该产品的价格预警'}
        aria-pressed={subscribed}
        title={subscribed ? '已订阅 · 点击取消' : '订阅该产品的价格预警'}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className="lpl-hit"
        style={{
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          padding: '0 1px',
          cursor: 'pointer',
          // 订阅态 = 黄色铃铛（追补⑤定稿 antd gold-6）
          color: subscribed ? color.alert.bell : color.hairlineStrong,
          flexShrink: 0,
        }}
      >
        {subscribed ? <BellFilled style={{ fontSize: size }} /> : <BellOutlined style={{ fontSize: size }} />}
      </button>
    </Badge>
  );
}

/** 生命周期标签与详情抽屉（预警中心 P0/P1）：矩阵、收件箱、Agent 深链共用。 */

export function AlertLifecycleTag({ lifecycle }: { lifecycle: AlertLifecycle }) {
  const palette: Record<AlertLifecycle, { color: string; bg: string }> = {
    new: { color: color.alert.lifecycle.new.fg, bg: color.alert.lifecycle.new.bg },
    acknowledged: { color: color.alert.lifecycle.acknowledged.fg, bg: color.alert.lifecycle.acknowledged.bg },
    investigating: { color: color.alert.lifecycle.investigating.fg, bg: color.alert.lifecycle.investigating.bg },
    action_required: { color: color.alert.lifecycle.actionRequired.fg, bg: color.alert.lifecycle.actionRequired.bg },
    resolved: { color: color.alert.lifecycle.resolved.fg, bg: color.alert.lifecycle.resolved.bg },
    snoozed: { color: color.alert.lifecycle.snoozed.fg, bg: color.alert.lifecycle.snoozed.bg },
    dismissed: { color: color.alert.lifecycle.dismissed.fg, bg: color.alert.lifecycle.dismissed.bg },
  };
  const s = palette[lifecycle];
  return <Tag style={{ margin: 0, border: 0, color: s.color, background: s.bg, fontSize: 11 }}>{ALERT_LIFECYCLE_LABEL[lifecycle]}</Tag>;
}

export interface AlertDetailDrawerProps {
  record: AlertRecord | null;
  open: boolean;
  onClose: () => void;
  onAction: (action: AlertAction) => void;
  onOpenAgent?: (record: AlertRecord) => void;
  onOpenDashboard?: (record: AlertRecord) => void;
}

/** 右侧详情抽屉：事实、规则快照、证据和处理动作保持同一上下文。 */
export function AlertDetailDrawer({ record, open, onClose, onAction, onOpenAgent, onOpenDashboard }: AlertDetailDrawerProps) {
  const [ownerId, setOwnerId] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => { setOwnerId(record?.ownerId ?? ''); setNote(''); }, [record?.alertId, record?.ownerId]);
  if (!record) return null;
  const threshold = record.ruleSnapshot.threshold == null ? '—' : `${record.type === 'own-gap' ? '< ' : '≥ '}${(record.ruleSnapshot.threshold * 100).toFixed(1)}%`;
  const valueSummary = record.type === 'platform-gap'
    ? `平台差 ${pctText(record.gapPct)}`
    : record.type === 'own-gap'
      ? `档位间距 ${pctText(record.ownGapPct)}`
      : record.type === 'promo'
        ? `促销变化 ${record.promoDeltaPp == null ? '—' : `${record.promoDeltaPp > 0 ? '+' : ''}${record.promoDeltaPp.toFixed(1)}pp`}`
        : `较前有价周 ${pctText(record.wowPct)} → ${formatPrice(record.price, record.ruleSnapshot.currency ?? 'usd')}`;
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="预警详情"
      width={440}
      destroyOnClose={false}
      styles={{ body: { padding: 0 } }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
        <div style={{ padding: '16px 20px 14px', borderBottom: `1px solid ${color.hairline}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
            <TypePill type={record.type} />
            <AlertLifecycleTag lifecycle={record.lifecycle} />
            <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: color.alert.priority[record.priority] }}>{ALERT_PRIORITY_LABEL[record.priority]}</span>
          </div>
          <div style={{ fontSize: 16, lineHeight: 1.4, fontWeight: 700, color: color.ink }}>{record.brand} {record.modelName}</div>
          <div className="tnum" style={{ marginTop: 3, fontSize: 12, color: color.mute }}>{record.romram} · {record.weekLabel} · {record.weekId}</div>
          <div style={{ marginTop: 10, padding: '9px 10px', borderRadius: radius.card, background: color.canvasSoft, color: color.body, fontSize: 12 }}>{valueSummary}</div>
        </div>
        <div style={{ padding: '14px 20px', display: 'grid', gap: 14 }}>
          <section>
            <div style={{ fontSize: 11, fontWeight: 700, color: color.mute, marginBottom: 7 }}>触发事实</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
              <Fact label="当前值" value={formatPrice(record.price, record.ruleSnapshot.currency ?? 'usd')} />
              <Fact label="较 RRP" value={pctText(record.vsRrpPct)} />
              <Fact label="阈值" value={threshold} />
              <Fact label="影响评分" value={`${record.priorityScore} · ${ALERT_PRIORITY_LABEL[record.priority]}`} />
            </div>
          </section>
          <section>
            <div style={{ fontSize: 11, fontWeight: 700, color: color.mute, marginBottom: 7 }}>规则与数据快照</div>
            <div style={{ fontSize: 11, lineHeight: 1.7, color: color.body }}>
              <div>规则版本：<span className="tnum">{record.ruleVersion}</span></div>
              <div>数据版本：<span className="tnum">{record.dataVersion}</span></div>
              <div>作用域：{record.ruleSnapshot.scope.countryCode} · {record.ruleSnapshot.scope.industry}</div>
              <div>扫描时间：<span className="tnum">{record.ruleSnapshot.capturedAt}</span></div>
            </div>
          </section>
          <section>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 7 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: color.mute }}>证据（{record.evidence.length}）</div>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: record.evidenceStatus === 'verified' ? color.alert.evidence.verified : color.alert.evidence.pending }}>{record.evidenceStatus === 'verified' ? '已核验' : record.evidenceStatus === 'missing' ? '证据缺失' : '部分覆盖'}</span>
            </div>
            <div style={{ display: 'grid', gap: 7 }}>
              {record.evidence.map((evidence) => <div key={evidence.id} style={{ padding: '8px 9px', border: `1px solid ${color.hairline}`, borderRadius: radius.control }}><div style={{ fontSize: 11, fontWeight: 600, color: color.ink }}>{evidence.label}</div><div style={{ marginTop: 2, fontSize: 11, lineHeight: 1.5, color: color.body }}>{evidence.detail}</div></div>)}
            </div>
          </section>
          <section>
            <div style={{ fontSize: 11, fontWeight: 700, color: color.mute, marginBottom: 7 }}>处理</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {record.lifecycle === 'new' && <Button size="small" onClick={() => onAction({ kind: 'acknowledge' })}>确认收到</Button>}
              {(record.lifecycle === 'new' || record.lifecycle === 'acknowledged') && <Button size="small" onClick={() => onAction({ kind: 'investigate' })}>开始核查</Button>}
              {record.lifecycle === 'investigating' && <Button size="small" type="primary" onClick={() => onAction({ kind: 'action_required' })}>标记需行动</Button>}
              {record.lifecycle === 'action_required' && <Button size="small" type="primary" onClick={() => onAction({ kind: 'resolve', resolutionCode: 'fixed' })}>标记解决</Button>}
              {record.lifecycle !== 'dismissed' && record.lifecycle !== 'resolved' && <Button size="small" onClick={() => onAction({ kind: 'dismiss', resolutionCode: 'not_applicable' })}>忽略</Button>}
              {record.lifecycle === 'snoozed' ? <Button size="small" onClick={() => onAction({ kind: 'unsnooze' })}>结束静默</Button> : <Button size="small" onClick={() => onAction({ kind: 'snooze', until: new Date(Date.now() + 24 * 3600 * 1000).toISOString() })}>静默 24 小时</Button>}
              {(record.lifecycle === 'resolved' || record.lifecycle === 'dismissed') && <Button size="small" onClick={() => onAction({ kind: 'reopen' })}>重新打开</Button>}
            </div>
            <div style={{ display: 'flex', gap: 7, marginTop: 9 }}>
              <Input size="small" value={ownerId} onChange={(event) => setOwnerId(event.target.value)} placeholder="负责人（可选）" aria-label="负责人" />
              <Button size="small" onClick={() => onAction({ kind: 'assign', ownerId: ownerId.trim() || undefined })}>分配</Button>
            </div>
            <div style={{ display: 'flex', gap: 7, marginTop: 7 }}>
              <Input size="small" value={note} onChange={(event) => setNote(event.target.value)} placeholder="添加处理备注" aria-label="处理备注" />
              <Button size="small" disabled={!note.trim()} onClick={() => { onAction({ kind: 'note', detail: note.trim() }); setNote(''); }}>记录</Button>
            </div>
          </section>
          <section>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 7 }}><div style={{ fontSize: 11, fontWeight: 700, color: color.mute }}>活动记录</div><span style={{ marginLeft: 'auto', fontSize: 11, color: color.mute }}>{record.activities.length} 条</span></div>
            <div style={{ display: 'grid', gap: 7 }}>
              {[...record.activities].reverse().slice(0, 8).map((item) => <div key={item.id} style={{ display: 'flex', gap: 8, fontSize: 11, lineHeight: 1.5, color: color.body }}><span style={{ width: 6, height: 6, marginTop: 5, borderRadius: 99, background: color.link, flexShrink: 0 }} /><span><span className="tnum" style={{ color: color.mute }}>{item.at}</span> · {item.detail}</span></div>)}
            </div>
          </section>
        </div>
        <div style={{ marginTop: 'auto', display: 'flex', gap: 8, padding: '12px 20px', borderTop: `1px solid ${color.hairline}` }}>
          {onOpenDashboard && <Button size="small" onClick={() => onOpenDashboard(record)}>回看板</Button>}
          {onOpenAgent && <Button size="small" type="primary" onClick={() => onOpenAgent(record)}>让 Agent 解释</Button>}
        </div>
      </div>
    </Drawer>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div style={{ padding: '7px 8px', background: color.canvasSoft, borderRadius: radius.control }}><div style={{ fontSize: 10, color: color.mute }}>{label}</div><div className="tnum" style={{ marginTop: 2, fontSize: 12, color: color.ink, fontWeight: 600 }}>{value}</div></div>;
}
