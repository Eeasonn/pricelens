// ============================================================
// 配置页「数据质量」块（2026-11-01 异常价格守卫 · 设计方案 A §4.A.1）：
// - 开关「异常价格守卫」+ 档位 Segmented（关闭 / 30% / 50% / 自定义 10–90 整数），
//   默认开启 50%（§8 拍板 1）；即改即存 LPL3.config.anomalyRule + 广播（取数层
//   立即重算，全部派生数字随之更新）；
// - 一句业务说明（含行级 5% 低侧守卫的文档化——§8 拍板 5：只说明不改行为）；
// - 人工裁定清单：图上逐点「确认真实价格 / 标记异常」的留痕（产品/周/原值/环比/
//   动作/时间），行尾「撤销」回到自动判定。
// 不进 URL、不进 LPL3.filters（默认店铺先例）；唯一写入口 = 本块 + 图上逐点裁定。
// ============================================================
import { useEffect, useMemo, useState } from 'react';
import { Button, Empty, Segmented, Switch, Tag } from 'antd';
import {
  ANOMALY_CUSTOM_MAX,
  ANOMALY_CUSTOM_MIN,
  listAnomalyMarks,
  readAnomalyRule,
  saveAnomalyRule,
  undoAnomalyMark,
  type AnomalyRule,
} from '../../dataModel/anomaly';
import { CONFIG_CHANGED_EVENT } from '../../state/lplKeys';
import { color, fontSize, radius, space } from '../../theme/tokens';

/** 桶 id → 业务文案：按裁定时的粒度（周 2026W39 / 月 2026-10 / 季原样）。
 *  注意周/月 id 同为 6 位数字（YYYYWW vs YYYYMM），不看粒度会把月裁定错显成「2026W10」。 */
const bucketText = (bucketId: string, granularity?: 'week' | 'month' | 'quarter'): string => {
  const gran = granularity ?? 'week';
  if (gran === 'week' && /^\d{6}$/.test(bucketId)) return `${bucketId.slice(0, 4)}W${bucketId.slice(4)}`;
  if (gran === 'month' && /^\d{6}$/.test(bucketId)) return `${bucketId.slice(0, 4)}-${bucketId.slice(4)}`;
  return bucketId;
};

const fmtTime = (ts: number): string => {
  const d = new Date(ts);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

const fmtPct = (v: number | null): string =>
  v == null ? '—' : `${v > 0.005 ? '+' : v < -0.005 ? '−' : '±'}${Math.round(Math.abs(v) * 100)}%`;

export default function DataQualityBlock() {
  const [rule, setRule] = useState<AnomalyRule>(() => readAnomalyRule());
  const [tick, setTick] = useState(0);
  const [customDraft, setCustomDraft] = useState<string>('');
  const [customError, setCustomError] = useState<string | null>(null);
  // 自定义模式：点「自定义」即进入（输入当前档预填），提交/选回预设档才退出——
  // 否则选中态会被 rule 值拉回预设档，输入框一闪即逝
  const [customMode, setCustomMode] = useState(false);

  // 广播后重读（图上逐点裁定 / 本块保存都会广播；幂等）
  useEffect(() => {
    const reread = (): void => {
      setRule(readAnomalyRule());
      setCustomMode(false);
      setTick((t) => t + 1);
    };
    window.addEventListener(CONFIG_CHANGED_EVENT, reread);
    return () => window.removeEventListener(CONFIG_CHANGED_EVENT, reread);
  }, []);

  const commit = (next: AnomalyRule): void => {
    saveAnomalyRule(next);
    setRule(next);
  };

  const segValue = !rule.enabled ? 'off' : customMode ? 'custom' : rule.thresholdPct === 30 ? '30' : rule.thresholdPct === 50 ? '50' : 'custom';

  const commitCustom = (): void => {
    const n = Math.round(Number(customDraft));
    if (!Number.isFinite(n) || n < ANOMALY_CUSTOM_MIN || n > ANOMALY_CUSTOM_MAX) {
      setCustomError(`请输入 ${ANOMALY_CUSTOM_MIN}–${ANOMALY_CUSTOM_MAX} 的整数`);
      return;
    }
    setCustomError(null);
    commit({ enabled: true, thresholdPct: n });
    setCustomMode(true); // 提交成功后停在自定义档（输入框保留显示当前值）
  };

  const marks = useMemo(() => listAnomalyMarks(), [tick]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
        <span style={{ fontSize: fontSize.bodySm, color: color.ink, fontWeight: 600, flexShrink: 0 }}>异常价格守卫</span>
        <Switch
          size="small"
          checked={rule.enabled}
          aria-label="异常价格守卫开关"
          onChange={(on) => commit({ ...rule, enabled: on })}
        />
        <Segmented
          size="small"
          value={segValue}
          onChange={(v) => {
            const val = v as string;
            if (val === 'off') {
              setCustomMode(false);
              commit({ enabled: false, thresholdPct: rule.thresholdPct });
            } else if (val === '30') {
              setCustomMode(false);
              commit({ enabled: true, thresholdPct: 30 });
            } else if (val === '50') {
              setCustomMode(false);
              commit({ enabled: true, thresholdPct: 50 });
            } else {
              setCustomMode(true);
              setCustomDraft(String(rule.thresholdPct));
              setCustomError(null);
            }
          }}
          options={[
            { label: '关闭', value: 'off' },
            { label: '30%', value: '30' },
            { label: '50%', value: '50' },
            { label: '自定义', value: 'custom' },
          ]}
        />
        {segValue === 'custom' && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <input
              type="text"
              inputMode="numeric"
              aria-label="自定义阈值百分比"
              value={customDraft}
              onChange={(e) => setCustomDraft(e.target.value)}
              onFocus={() => {
                if (customDraft === '') setCustomDraft(String(rule.thresholdPct));
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitCustom();
              }}
              onBlur={commitCustom}
              className="tnum"
              style={{
                width: 56,
                height: 24,
                padding: '0 6px',
                border: `1px solid ${customError ? 'rgba(235, 87, 87, 0.6)' : color.hairline}`,
                borderRadius: radius.control,
                font: 'inherit',
                fontSize: fontSize.caption,
                color: color.ink,
                outline: 'none',
              }}
            />
            <span style={{ fontSize: fontSize.caption, color: color.mute }}>%</span>
          </span>
        )}
        {customError && <span style={{ fontSize: fontSize.caption, color: '#b45309' }}>{customError}</span>}
        <Tag
          color={rule.enabled ? 'blue' : 'default'}
          style={{ marginInlineEnd: 0, fontSize: fontSize.caption, lineHeight: '18px', flexShrink: 0 }}
        >
          {rule.enabled ? `当前口径 ≥${rule.thresholdPct}%` : '已关闭'}
        </Tag>
      </div>
      <div style={{ fontSize: fontSize.caption, color: color.mute, marginTop: space.sm, lineHeight: '18px' }}>
        相邻两个观测点的折后价变化幅度超过阈值时，该点标记为异常价格：图上保留原值（空心点 + 疑似幅度）但不参与极差、环比、均价与预警计算。
        真实大促（促销档期内下跌）与官方调价（RRP 同步变化）自动放行；持续两周以上的新价位只标注「待核对」不隔离；最新一周只标注不隔离。
        也可在图上逐点「确认真实价格 / 标记异常」，下方清单留痕可撤销。改动即时生效于全部页面。
      </div>
      <div style={{ fontSize: fontSize.caption, color: color.mute, marginTop: space.xs, lineHeight: '18px' }}>
        另有条目级守卫自动剔除零价、负价与明显低于参考价的异常采集行，此类行不进入任何页面。
      </div>

      <div style={{ marginTop: space.md }}>
        <div style={{ fontSize: fontSize.bodySm, fontWeight: 600, color: color.ink, marginBottom: space.sm }}>
          人工裁定清单
          <span style={{ marginLeft: 8, fontWeight: 400, color: color.mute, fontSize: fontSize.caption }}>
            只记人工操作；促销带与 RRP 同步的自动放行不进清单
          </span>
        </div>
        {marks.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无人工裁定；在图上胶囊或量价明细卡可逐点裁定" />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2.2fr) 72px 88px 64px minmax(96px, 1fr) 104px 52px', gap: space.xs, fontSize: fontSize.caption, alignItems: 'center' }}>
            <span style={{ color: color.mute }}>产品</span>
            <span style={{ color: color.mute }}>周</span>
            <span style={{ color: color.mute }}>原值</span>
            <span style={{ color: color.mute }}>环比</span>
            <span style={{ color: color.mute }}>动作</span>
            <span style={{ color: color.mute }}>时间</span>
            <span />
            {marks.map((m) => (
              <div key={`${m.countryCode}|${m.seriesKey}|${m.bucketId}|${m.ts}`} style={{ display: 'contents' }}>
                <span title={`${m.label}（${m.countryCode}）`} style={{ color: color.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.label}
                </span>
                <span className="tnum" style={{ color: color.body }}>{bucketText(m.bucketId, m.granularity)}</span>
                <span className="tnum" style={{ color: color.body }}>{m.price != null ? Math.round(m.price).toLocaleString('en-US') : '—'}</span>
                <span className="tnum" style={{ color: m.action === 'isolate' ? '#b45309' : color.body }}>{fmtPct(m.wow)}</span>
                <span>
                  <Tag
                    color={m.action === 'exempt' ? 'blue' : 'gold'}
                    style={{ marginInlineEnd: 0, fontSize: fontSize.caption, lineHeight: '18px' }}
                  >
                    {m.action === 'exempt' ? '确认真实价格' : '标记异常'}
                  </Tag>
                </span>
                <span className="tnum" title={new Date(m.ts).toISOString()} style={{ color: color.mute }}>{fmtTime(m.ts)}</span>
                <Button
                  size="small"
                  onClick={() => {
                    undoAnomalyMark(m.countryCode, m.seriesKey, m.bucketId, m.ts);
                    setTick((t) => t + 1);
                  }}
                >
                  撤销
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
