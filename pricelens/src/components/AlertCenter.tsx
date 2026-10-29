// ============================================================
// 预警中心入口与共享件（第五十二轮建 / 追补⑨升页面 / 预警中心重构收编）。
// - AlertBell：统一订阅铃铛（未订阅 = 描边灰、已订阅 = 金色实心 + 触发金点），
//   看板时点页签 / 总览行尾与预警列 / 预警页矩阵行尾共用——原三处形态互不一致
//   （无字实心铃 / 带字整组按钮 / 文字链接），重构后同一组件同一语义；
// - useAlerts()：引擎统一入参（state → AlertCfg），页面/总览列/看板共用一份结果；
// - TypePill / TYPE_STYLE / pctText：类型徽标与文案（总览预警列、预警页共用）。
// 四类预警（alerts.ts）：调价 / 折扣 / 平台价差 / 档位间距。
// ============================================================
import { useMemo } from 'react';
import { Badge } from 'antd';
import { BellFilled, BellOutlined } from '@ant-design/icons';
import { useFilters } from '../state/FiltersContext';
import { buildAlerts, type AlertItem, type AlertType } from '../dataModel/alerts';
import { color, formatPrice, radius } from '../theme/tokens';

/** 类型徽标：调价 = 蓝、折扣 = 琥珀、平台价差 = 紫、档位间距 = 玫红 */
export const TYPE_STYLE: Record<AlertType, { label: string; short: string; fg: string; bg: string }> = {
  'price-change': { label: '调价', short: '调价', fg: '#0053c2', bg: '#e8f1ff' },
  promo: { label: '折扣', short: '折扣', fg: '#b45309', bg: '#fff7e6' },
  'platform-gap': { label: '平台价差', short: '平台', fg: '#6d28d9', bg: '#f5f3ff' },
  'own-gap': { label: '档位间距', short: '间距', fg: '#be123c', bg: '#fff1f2' },
};

export function TypePill({ type }: { type: AlertType }) {
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
export const pctText = (v: number | null, digits = 1): string => {
  if (v == null) return '—';
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
      const pct = a.wowPct != null ? `${Math.abs(a.wowPct * 100).toFixed(1)}%` : '—';
      return `${arrow}${pct} → ${formatPrice(a.price, currency)}`;
    }
    case 'promo':
      return `促销${(a.promoDeltaPp ?? 0) > 0 ? '加深' : '收窄'} ${Math.abs(a.promoDeltaPp ?? 0).toFixed(1)}pp`;
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
    <Badge dot={count > 0} color="#faad14" title={`${count} 条最新预警`}>
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
          color: subscribed ? '#faad14' : color.hairlineStrong,
          flexShrink: 0,
        }}
      >
        {subscribed ? <BellFilled style={{ fontSize: size }} /> : <BellOutlined style={{ fontSize: size }} />}
      </button>
    </Badge>
  );
}
