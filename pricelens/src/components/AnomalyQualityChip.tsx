// ============================================================
// 异常价格守卫状态行（2026-11-01 异常价格守卫 · 设计方案 A；2026-11-01 晚
// Eason 两轮反馈定稿：①「数据质量」抽象难懂 → 改名「异常价格」族；②工具行
// 常驻 chip 太显眼 → 收进工具行「⋯ 更多显示选项」菜单作一行状态，点击弹只读
// Popover（规则一句话 + 本页隔离点清单 + 「查看配置」）：
// 价格走势 / 量价 / 多平台对比三页 ⋯ 菜单内常驻；口径唯一写入口 = 配置页；
// 预测页为模拟数据不放。
// ============================================================
import { useSyncExternalStore } from 'react';
import { Popover } from 'antd';
import { usePage } from '../state/PageContext';
import { readAnomalyRule } from '../dataModel/anomaly';
import { color, fontSize, radius, selectSoft, selectSoftInk } from '../theme/tokens';

// ---------------- 本页隔离点注册表（自持数据源） ----------------
// 2026-11-01 晚实测（三重探针）：打开中的 ⋯ Popover portal 不随父级 props 更新
// （父级渲染、isolated 已重算为 0，portal 内组件却不被调用）——状态行改用
// useSyncExternalStore：页面在 memo 内注册最新清单，引用变化即广播轻量事件，
// chip 自行重渲染读最新数组，完全不依赖 props 流。
const isolatedStore = new Map<string, AnomalyChipPoint[]>();
const EMPTY: AnomalyChipPoint[] = [];
const ISOLATED_EVENT = 'lpl-anomaly-isolated-changed';

/** 页面在计算 anomalyIsolated 的 memo 内注册（渲染期调用；引用不变不广播）。
 *  广播走微任务——渲染期同步 dispatch 会触发「渲染中 setState」警告 */
export function registerAnomalyIsolated(page: AnomalyChipPage, list: AnomalyChipPoint[]): void {
  if (isolatedStore.get(page) === list) return;
  isolatedStore.set(page, list);
  if (typeof window === 'undefined') return;
  queueMicrotask(() => window.dispatchEvent(new Event(ISOLATED_EVENT)));
}

const subscribeIsolated = (cb: () => void): (() => void) => {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(ISOLATED_EVENT, cb);
  return () => window.removeEventListener(ISOLATED_EVENT, cb);
};

export type AnomalyChipPage = 'price' | 'volume' | 'platform';

/** 状态行数据点（⋯ 菜单内一行（label + 状态），点击弹只读 Popover（placement 右上）） */
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
  /** 页面键：读注册表中该页最新隔离清单 */
  page: AnomalyChipPage;
}) {
  const { go } = usePage();
  const rule = readAnomalyRule();
  const isolated = useSyncExternalStore(subscribeIsolated, () => isolatedStore.get(props.page) ?? EMPTY);
  const count = isolated.length;
  const pct = `≥${rule.thresholdPct}%`;
  const ruleText = rule.enabled
    ? `相邻两个观测点的折后价变化超过 ${rule.thresholdPct}% 时，该点标记为异常价格：图上保留原值但不参与计算。真实大促与官方调价自动放行，也可在图上逐点确认。`
    : '异常价格守卫已关闭：所有价格点均按原值参与计算。可在配置页开启。';
  return (
    <Popover
      trigger="click"
      placement="rightTop"
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
                {isolated.slice(0, 12).map((p, i) => (
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
        className="lpl-quality-chip lpl-quality-row"
        data-ts={Date.now()}
        style={{
          width: '100%',
          height: 30,
          padding: '0 8px',
          border: 'none',
          borderRadius: radius.control,
          background: 'transparent',
          color: color.body,
          font: 'inherit',
          fontSize: fontSize.caption,
          lineHeight: '13px',
          fontWeight: 600,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          textAlign: 'left',
        }}
      >
        异常价格守卫
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }} className="tnum">
          {rule.enabled ? (
            <span style={{ color: count > 0 ? '#b45309' : selectSoftInk }}>
              {pct}
              {count > 0 ? ` · 隔离 ${count}` : ''}
            </span>
          ) : (
            <span style={{ color: color.mute }}>已关闭</span>
          )}
        </span>
      </button>
    </Popover>
  );
}
