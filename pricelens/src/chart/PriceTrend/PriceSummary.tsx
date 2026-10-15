// ============================================================
// 价格摘要条（第三十六轮定版 / 第四十六轮改版）：核心视觉页签——固定显示窗口内
// 最新时点（不随悬停变换，时点明细看悬停浮窗）。条目 = 并排 3 个等宽小框
// （圆角与大框一致），每框必含三件套：折扣率 + 折后价 + 划线 RRP（用户口径：
// 三项恒显，0% 也不省略）；我司与竞品完全同款；来源为取证超链接。折扣徽章
// 0% 中性蓝、≥15% 转琥珀预警、溢价 +X% 琥珀。数据 = buildPriceSummary（最新有值点）。
// ============================================================
import type { CurrencyMode, Granularity } from '../../dataModel/types';
import BrandDot from '../../components/BrandMark';
import { color, fontSize, formatPrice, radius, selectSoft, selectSoftInk, shadow, space } from '../../theme/tokens';
import type { PriceSummaryItem } from './chartModel';

/** 深折扣预警阈值：≥15% 折扣徽章从品牌蓝转琥珀（B 端中性色原则） */
const DEEP_DISCOUNT = 0.15;

function fmtAsOf(gran: Granularity, x: string | null): string {
  if (!x) return '';
  if (gran === 'week') return x;
  if (gran === 'month') return `${x.slice(0, 4)}-${x.slice(4)}`;
  return x;
}

/** 折扣徽章（第四十六轮起恒显）：−X% 圆角胶囊；0% 中性；溢价 +X% 转琥珀 */
function DiscountBadge({ discount }: { discount: number }) {
  const pct = Math.round(Math.abs(discount) * 100);
  const warn = discount <= -DEEP_DISCOUNT || discount > 0.005;
  const label = pct === 0 ? '0%' : `${discount < 0 ? '−' : '+'}${pct}%`;
  return (
    <span
      title={discount > 0.005 ? `较 RRP 高 ${pct}%（溢价）` : `较 RRP 低 ${pct}%`}
      style={{
        flexShrink: 0,
        padding: '1px 7px',
        fontSize: fontSize.caption,
        fontWeight: 700,
        lineHeight: '16px',
        borderRadius: radius.pill,
        color: warn ? '#b45309' : selectSoftInk,
        background: warn ? color.warningSoft : selectSoft,
      }}
    >
      {label}
    </span>
  );
}

export default function PriceSummary({
  items,
  currency,
  granularity,
}: {
  items: PriceSummaryItem[];
  currency: CurrencyMode;
  granularity: Granularity;
}) {
  if (items.length === 0) return null;
  const asOf = items.find((it) => it.asOf != null)?.asOf ?? null;

  // 统一项模板（第三十五轮）：我司/竞品同款字号与信息结构；第四十六轮起每项
  // 包在等宽小框里（圆角 = 大框 radius.card），三件套恒显
  const renderItem = (it: PriceSummaryItem): React.ReactElement => (
    <div
      key={it.key}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        minWidth: 0,
        padding: '8px 12px',
        borderRadius: radius.card, // 与大框同曲率（第四十六轮）
        background: color.canvasSoft,
      }}
    >
      <BrandDot brand={it.brand} />
      <span
        title={it.name}
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: color.ink,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {it.name}
      </span>
      {it.discount != null && <DiscountBadge discount={it.discount} />}
      <span
        className="tnum"
        title={it.price != null ? undefined : '该时点无采数'}
        style={{ fontSize: 17, lineHeight: '22px', fontWeight: 700, color: it.price != null ? color.ink : color.hairlineStrong, whiteSpace: 'nowrap' }}
      >
        {formatPrice(it.price, currency)}
      </span>
      {it.rrp != null && (
        <span className="tnum" title="RRP（官方建议零售价）" style={{ fontSize: 11, lineHeight: '15px', color: color.mute, textDecoration: 'line-through', whiteSpace: 'nowrap' }}>
          {formatPrice(it.rrp, currency)}
        </span>
      )}
      {it.shop && (
        <span style={{ fontSize: 10.5, lineHeight: '14px', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {it.url ? (
            <a
              href={it.url}
              target="_blank"
              rel="noreferrer"
              title={`来源取证 · ${it.shop}（点击跳转）`}
              style={{ color: color.link, textDecoration: 'none' }}
              onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
              onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
            >
              来源 {it.shop} ↗
            </a>
          ) : (
            <span style={{ color: color.mute }}>来源 {it.shop}</span>
          )}
        </span>
      )}
    </div>
  );

  return (
    <div
      style={{
        padding: '10px 16px',
        marginBottom: space.sm,
        borderRadius: radius.card,
        background: color.canvas,
        boxShadow: shadow.l1, // 显性化（第三十六轮）：核心视觉页签，抬一层
      }}
    >
      {/* 时点：左上角明显展示（第四十二轮），固定最新有值时点、不随悬停变换 */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
        <span className="tnum" style={{ fontSize: 13, fontWeight: 700, color: color.ink, whiteSpace: 'nowrap' }}>
          时点 {fmtAsOf(granularity, asOf)}
        </span>
        <span style={{ fontSize: 11, color: color.mute, whiteSpace: 'nowrap' }}>
          窗口内最新有值时点 · 逐点明细见图表悬停
        </span>
      </div>
      {/* 并排 3 款产品、等宽（第四十六轮）：超出 3 个自动换排，每框宽度恒一致 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 10 }}>
        {items.map(renderItem)}
      </div>
    </div>
  );
}
