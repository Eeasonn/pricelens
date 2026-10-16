// ============================================================
// 预警中心（第五十二轮建 / 第五十三轮扩三类）：规则预警的订阅与通知聚合。
// 入口三处——①看板时点页签尾铃铛（PriceSummary 内，按系列订阅；第五十三轮从图表
// 图例小页签上移）；②总览型号块「订阅预警」（我司全部 ROM + 映射竞品一键订阅）；
// ③页头铃铛 = 中心本体（三页共用）。
// 通知三类（alerts.ts 纯计算，共用一条阈值线）：调价预警（折后价 WoW，我司/竞品都出）、
// 降促预警（促销力度变化，通知附 对比 RRP 幅度 + 对比前周幅度）、
// 平台价差预警（仅我司品牌：周内各平台独立价最高/最低差，单品牌多平台渠道价控）。
// demo 口径：周度抓取 · OZON 基准。
// ============================================================
import { useMemo, useState } from 'react';
import { Badge, Button, Drawer, Empty, Slider } from 'antd';
import { BellFilled, BellOutlined } from '@ant-design/icons';
import { useFilters } from '../state/FiltersContext';
import { buildAlerts, alertSeriesMeta, type AlertType } from '../dataModel/alerts';
import { color, fontSize, formatPrice, radius } from '../theme/tokens';

/** 类型徽标：调价 = 蓝、降促 = 琥珀（与降价徽标同语言）、平台价差 = 紫 */
const TYPE_STYLE: Record<AlertType, { label: string; fg: string; bg: string }> = {
  'price-change': { label: '调价', fg: '#0053c2', bg: '#e8f1ff' },
  promo: { label: '降促', fg: '#b45309', bg: '#fff7e6' },
  'platform-gap': { label: '平台价差', fg: '#6d28d9', bg: '#f5f3ff' },
};

function TypePill({ type }: { type: AlertType }) {
  const s = TYPE_STYLE[type];
  return (
    <span
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
const pctText = (v: number | null, digits = 1): string => {
  if (v == null) return '—';
  const p = v * 100;
  const r = Math.round(Math.abs(p) * 10 ** digits) / 10 ** digits;
  const sign = p < -1e-9 ? '−' : p > 1e-9 ? '+' : '±';
  return `${sign}${r}%`;
};

/** 页头铃铛 = 预警中心本体（总览/看板/配置三页头共用） */
export default function AlertCenterButton() {
  const { state, actions } = useFilters();
  const [open, setOpen] = useState(false);
  const alerts = useMemo(
    () => buildAlerts(state.alertSubs, state.alertThreshold, state.currency),
    [state.alertSubs, state.alertThreshold, state.currency],
  );
  const subLabels = useMemo(
    () => state.alertSubs.map((k) => alertSeriesMeta(k)).filter((m): m is NonNullable<typeof m> => m != null),
    [state.alertSubs],
  );
  const visible = alerts.slice(0, 120);
  // 三类计数（第五十三轮）：阈值线共用，但各类量级差异大，分型计数帮助调节阈值
  const byType = useMemo(() => {
    const c: Record<AlertType, number> = { promo: 0, 'price-change': 0, 'platform-gap': 0 };
    for (const a of alerts) c[a.type]++;
    return c;
  }, [alerts]);

  return (
    <>
      <Badge count={alerts.length} size="small" overflowCount={99} title={`${alerts.length} 条预警`}>
        <Button
          size="small"
          icon={<BellOutlined />}
          style={{ height: 28 }}
          title="预警中心：订阅系列的调价 / 降促 / 平台价差通知"
          onClick={() => setOpen(true)}
        >
          预警
        </Button>
      </Badge>
      <Drawer
        title={
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            预警中心
            <span style={{ fontSize: 11, fontWeight: 400, color: color.mute }}>周度抓取 · OZON 基准 · 规则预警（demo）</span>
          </span>
        }
        width={440}
        open={open}
        onClose={() => setOpen(false)}
      >
        {/* 变化阈值：调价 / 降促 / 平台价差三类共用一条阈值线（可自定义） */}
        <div style={{ fontSize: 12, color: color.body, marginBottom: 6 }}>变化阈值（调价 / 降促 / 平台价差共用）</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Slider
            style={{ flex: 1, margin: '0 2px' }}
            min={1}
            max={15}
            step={0.5}
            value={+(state.alertThreshold * 100).toFixed(1)}
            onChange={(v) => actions.setAlertThreshold(+(v as number) / 100)}
            tooltip={{ formatter: (v) => `≥ ${v ?? 0}%` }}
          />
          <span className="tnum" style={{ fontSize: 12, color: color.ink, fontWeight: 600, whiteSpace: 'nowrap' }}>
            ≥ {+(state.alertThreshold * 100).toFixed(1)}%
          </span>
        </div>

        {/* 订阅管理 */}
        <div style={{ fontSize: 12, color: color.body, margin: '16px 0 6px' }}>
          已订阅系列 <span className="tnum" style={{ fontWeight: 600 }}>{state.alertSubs.length}</span>
          <span style={{ fontSize: 11, color: color.mute, marginLeft: 8 }}>入口：看板时点页签铃铛 / 总览型号「订阅预警」</span>
        </div>
        {subLabels.length === 0 ? (
          <div style={{ fontSize: 12, color: color.mute, padding: '4px 0 2px' }}>尚未订阅 — 在看板时点页签或总览型号行点击 🔔 即可订阅</div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {subLabels.map((m) => (
              <span
                key={m.seriesKey}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  height: 22,
                  padding: '0 8px',
                  fontSize: 11,
                  borderRadius: radius.pill,
                  border: `1px solid ${color.hairline}`,
                  background: color.canvasSoft2,
                  color: color.body,
                  maxWidth: '100%',
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.label}</span>
                <span
                  role="button"
                  title="取消订阅"
                  onClick={() => actions.toggleAlertSub(m.seriesKey)}
                  style={{ cursor: 'pointer', color: color.mute, flexShrink: 0 }}
                >
                  ×
                </span>
              </span>
            ))}
          </div>
        )}

        {/* 预警列表（最新周在前，最多展示 120 条）；三类分型计数（第五十三轮） */}
        <div style={{ fontSize: 12, color: color.body, margin: '16px 0 6px', display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span>
            预警通知 <span className="tnum" style={{ fontWeight: 600 }}>{alerts.length}</span> 条
          </span>
          <span className="tnum" style={{ fontSize: 11, color: color.mute }}>
            调价 {byType['price-change']} · 降促 {byType.promo} · 平台价差 {byType['platform-gap']}
          </span>
        </div>
        {visible.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <span style={{ fontSize: 12, color: color.mute }}>
                {state.alertSubs.length === 0 ? '订阅后，价格异动将在这里汇总' : '当前阈值下暂无触发'}
              </span>
            }
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {visible.map((a) => (
              <div
                key={a.key}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 3,
                  padding: '8px 2px',
                  borderBottom: `1px solid ${color.hairline}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <TypePill type={a.type} />
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: color.ink, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.brand} {a.modelName} {a.romram}
                  </span>
                  <span className="tnum" style={{ marginLeft: 'auto', fontSize: 11, color: color.mute, flexShrink: 0 }}>
                    {a.weekLabel} · W{a.weekId.slice(4)}
                  </span>
                </div>
                <div className="tnum" style={{ fontSize: 11.5, color: color.body, paddingLeft: 2 }}>
                  {a.type === 'promo' ? (
                    <>
                      现价 {formatPrice(a.price, state.currency)} · 较 RRP {pctText(a.vsRrpPct)} · 较前周{' '}
                      {pctText(a.wowPct)}（促销力度 {a.promoDeltaPp != null ? (a.promoDeltaPp > 0 ? '+' : '−') : ''}
                      {a.promoDeltaPp != null ? Math.abs(a.promoDeltaPp).toFixed(1) : '—'}pp）
                    </>
                  ) : a.type === 'platform-gap' ? (
                    <>
                      {a.gapHighPlatform} {formatPrice(a.gapHighPrice, state.currency)} ／ {a.gapLowPlatform}{' '}
                      {formatPrice(a.gapLowPrice, state.currency)}（价差 {pctText(a.gapPct)}）
                    </>
                  ) : (
                    <>
                      折后价较前周 {pctText(a.wowPct)} → 现价 {formatPrice(a.price, state.currency)}
                    </>
                  )}
                </div>
              </div>
            ))}
            {alerts.length > visible.length && (
              <div style={{ paddingTop: 8, fontSize: 11, color: color.mute }}>
                仅展示最近 120 条，共 {alerts.length} 条
              </div>
            )}
          </div>
        )}
        <div style={{ marginTop: 16, fontSize: fontSize.caption, color: color.mute, lineHeight: '18px' }}>
          口径：调价 = 折后价相邻有值周变化（我司/竞品均通知）；降促 = 促销力度（1 − 折后价/RRP）变化；
          平台价差 = 同周各平台独立折后价最高/最低差（仅我司品牌，demo 因子 DNS +0.8% / M.Video +1.5% ±0.3%）。
          三类共用一条阈值线，按相邻有值周比较（缺采不打断比较链）；价格为 OZON 基准单平台口径。
          生产版由采集调度触发推送，demo 为全量回放。
        </div>
      </Drawer>
    </>
  );
}

/** 总览型号块订阅按钮（第五十二轮建；第五十三轮三类口径）：keys = 该型号我司全部 ROM +
 *  映射竞品的系列 key；全部已订阅 = 已订阅态（点击整组退订），否则一键补齐订阅 */
export function SubscribeButton({ keys }: { keys: string[] }) {
  const { state, actions } = useFilters();
  const allOn = keys.length > 0 && keys.every((k) => state.alertSubs.includes(k));
  return (
    <Button
      size="small"
      style={{ height: 24, fontSize: 12 }}
      icon={allOn ? <BellFilled style={{ color: '#b45309' }} /> : <BellOutlined style={{ color: color.mute }} />}
      title={allOn ? '已订阅该产品的调价 / 降促 / 平台价差通知 · 点击整组退订' : '订阅该产品的调价 / 降促 / 平台价差通知（含其映射竞品）'}
      onClick={() => actions.setAlertSubs(keys, !allOn)}
    >
      {allOn ? '已订阅预警' : '订阅预警'}
    </Button>
  );
}
