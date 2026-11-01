// ============================================================
// 异常价格只读状态 chip（2026-11-01 异常价格守卫 · 设计方案 A；2026-11-01 晚
// Eason 反馈：「数据质量」抽象难懂，改名「异常价格」——与图上 疑/待核对/已隔离
// 同一族语言，chip 即该守卫的口径状态）：
// 价格走势 / 量价 / 多平台对比三页工具行右端常驻——提示当前全局口径与本页
// 隔离数；点击弹只读 Popover（规则一句话 + 本页隔离点清单 + 「查看配置」）。
// 口径唯一写入口 = 配置页（chip 不改全局值）；预测页为模拟数据不放 chip。
// ============================================================
import { Popover } from 'antd';
import { usePage } from '../state/PageContext';
import { readAnomalyRule } from '../dataModel/anomaly';
import { color, fontSize, radius, selectSoft, selectSoftInk } from '../theme/tokens';

export interface AnomalyChipPoint {
  /** 产品显示名（品牌 型号 配置） */
  label: string;
  /** 桶文案（如 2026W31 / 2026-07） */
  bucketText: string;
  price: string | null;
  /** 环比文案（如 −61%）；缺省 — */
  wow: string | null;
}

/** 桶 id → 业务文案（周 2026W31 / 月 2026-07 / 季原样），与单周明细卡同口径 */
export function anomalyBucketTextOf(granularity: 'week' | 'month' | 'quarter', bucketId: string): string {
  if (granularity === 'week' && /^\d{6}$/.test(bucketId)) return `${bucketId.slice(0, 4)}W${bucketId.slice(4)}`;
  if (granularity === 'month' && /^\d{6}$/.test(bucketId)) return `${bucketId.slice(0, 4)}-${bucketId.slice(4)}`;
  return bucketId;
}

export default function AnomalyQualityChip(props: {
  /** 本页（当前窗口序列）被隔离的点；空 = 无隔离 */
  isolated: AnomalyChipPoint[];
  /** 窄屏短文案（390px：异常价 ≥50% · 隔离 2） */
  narrow?: boolean;
}) {
  const { go } = usePage();
  const rule = readAnomalyRule();
  const count = props.isolated.length;
  const pct = `≥${rule.thresholdPct}%`;
  const ruleText = rule.enabled
    ? `相邻两个观测点的折后价变化超过 ${rule.thresholdPct}% 时，该点标记为异常价格：图上保留原值但不参与计算。真实大促与官方调价自动放行，也可在图上逐点确认。`
    : '异常价格守卫已关闭：所有价格点均按原值参与计算。可在配置页开启。';
  return (
    <Popover
      trigger="click"
      placement="bottomRight"
      arrow={false}
      content={
        <div style={{ width: 300 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: color.ink }}>异常价格守卫</div>
          <div style={{ marginTop: 4, fontSize: 12, lineHeight: '18px', color: color.body }}>{ruleText}</div>
          {count > 0 && (
            <>
              <div style={{ marginTop: 10, fontSize: 12, fontWeight: 600, color: color.ink }}>
                本页隔离 {count} 点<span style={{ marginLeft: 6, fontWeight: 400, color: color.mute }}>原值保留，未参与计算</span>
              </div>
              <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 168, overflowY: 'auto' }}>
                {props.isolated.slice(0, 12).map((p, i) => (
                  <div
                    key={`${p.label}|${p.bucketText}|${i}`}
                    className="tnum"
                    style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, lineHeight: '16px', color: color.body, whiteSpace: 'nowrap' }}
                  >
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.label}</span>
                    <span style={{ flexShrink: 0, color: color.mute }}>{p.bucketText}</span>
                    <span style={{ flexShrink: 0, fontWeight: 600, color: color.ink }}>{p.price ?? '—'}</span>
                    <span style={{ flexShrink: 0, color: '#b45309' }}>{p.wow ?? '—'}</span>
                  </div>
                ))}
                {count > 12 && (
                  <div style={{ fontSize: 11, lineHeight: '16px', color: color.mute }}>等 {count} 点（图上胶囊逐点可见）</div>
                )}
              </div>
            </>
          )}
          <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${color.hairline}`, display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => go('config')}
              style={{
                border: 'none',
                background: 'transparent',
                padding: 0,
                font: 'inherit',
                fontSize: 12,
                color: color.link,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              查看配置 →
            </button>
          </div>
        </div>
      }
    >
      <button
        type="button"
        aria-haspopup="dialog"
        title="异常价格守卫：当前判定口径与本页隔离数，点击查看"
        className="lpl-quality-chip"
        style={{
          height: 24,
          padding: '0 10px',
          borderRadius: radius.control,
          border: `1px solid ${count > 0 && rule.enabled ? 'rgba(180, 83, 9, 0.4)' : color.hairline}`,
          background: color.canvas,
          color: color.body,
          font: 'inherit',
          fontSize: fontSize.caption,
          lineHeight: '13px',
          fontWeight: 600,
          cursor: 'pointer',
          flexShrink: 0,
          whiteSpace: 'nowrap',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        {props.narrow ? '异常价' : '异常价格'}
        {rule.enabled ? (
          <span
            className="tnum"
            style={{
              color: count > 0 ? '#b45309' : selectSoftInk,
              background: count > 0 ? undefined : selectSoft,
              borderRadius: radius.pill,
              padding: count > 0 ? undefined : '0 6px',
            }}
          >
            {pct}
          </span>
        ) : (
          <span style={{ color: color.mute }}>关</span>
        )}
        {rule.enabled && count > 0 && (
          <span className="tnum" style={{ color: '#b45309' }}>
            · 隔离 {count}
          </span>
        )}
      </button>
    </Popover>
  );
}
