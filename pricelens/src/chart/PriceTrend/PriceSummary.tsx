// ============================================================
// 价格摘要条（第三十六轮定版 / 第四十六轮改版）：核心视觉页签——固定显示窗口内
// 最新时点（不随悬停变换，时点明细看悬停浮窗）。条目 = 并排 3 个等宽小框
// （圆角与大框一致），每框必含三件套：折扣率 + 折后价 + 划线 RRP（用户口径：
// 三项恒显，0% 也不省略）；我司与竞品完全同款；来源为取证超链接。折扣徽章
// 0% 中性蓝、≥15% 转琥珀预警、溢价 +X% 琥珀。数据 = buildPriceSummary（最新有值点）。
// ============================================================
import { BellFilled } from '@ant-design/icons';
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

/** 折扣徽章（第四十六轮起恒显）：−X% 圆角胶囊；0% 中性；溢价 +X% 转琥珀。
 *  第五十三轮导出：总览「当前售价」列复用同一组件（用户：完全参考页签显示方式） */
export function DiscountBadge({ discount }: { discount: number }) {
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
  pointDate,
  subscribedKeys,
  onToggleSubscribe,
}: {
  items: PriceSummaryItem[];
  currency: CurrencyMode;
  granularity: Granularity;
  /** 时点日期覆盖（第五十四轮追补①）：窗口末桶内最新周的三锚日（MM-DD）——
   *  月/季粒度的条目 xLabel 是 2026-10 / 2026Q4，不是「一天」；上层给到则恒显该日 */
  pointDate?: string | null;
  /** 预警订阅（第五十三轮从图表图例 chips 挪入本页签尾，「来源」之后） */
  subscribedKeys?: Set<string>;
  onToggleSubscribe?: (key: string) => void;
}) {
  if (items.length === 0) return null;
  const asOf = items.find((it) => it.asOf != null)?.asOf ?? null;

  // 统一项模板（第三十五轮）：我司/竞品同款字号与信息结构；第四十六轮起每项
  // 包在等宽小框里（圆角 = 大框 radius.card），三件套恒显。
  // 第五十四轮追补（用户标注定版）：三区结构——产品居左 ｜ 价格信息居中 ｜ 店铺+铃铛居右，
  // 区界画灰色短隔线（产品与折扣率之间、RRP 与店铺链接之间）；铃铛改实心放大（更粗更显眼）
  const Sep = (
    <span aria-hidden style={{ width: 1, height: 14, background: color.hairlineStrong, flexShrink: 0 }} />
  );
  const renderItem = (it: PriceSummaryItem): React.ReactElement => (
    <div
      key={it.key}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        minWidth: 0,
        padding: '8px 10px',
        borderRadius: radius.card, // 与大框同曲率（第四十六轮）
        background: color.canvasSoft,
      }}
    >
      {/* 左区：产品（整体居左；1.6 配比保产品名尽量不截断，超出省略号兜底） */}
      <span style={{ flex: '1.6 1 0', minWidth: 0, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
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
      </span>
      {Sep}
      {/* 中区：价格信息（折扣率+现价+RRP，居中） */}
      <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
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
      </span>
      {Sep}
      {/* 右区：店铺链接 + 订阅铃铛（整体居右；铃铛第五十四轮放大改实心——更粗更显眼） */}
      <span style={{ flex: '1 1 0', minWidth: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
        {it.shop && (
          <span style={{ fontSize: 10.5, lineHeight: '14px', whiteSpace: 'nowrap', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
                {it.shop} ↗
              </a>
            ) : (
              <span style={{ color: color.mute }}>{it.shop}</span>
            )}
          </span>
        )}
        {/* 订阅铃铛（第五十三轮挪入；第五十四轮居右放大）：三种预警（调价/降促/平台价差） */}
        {onToggleSubscribe && (
          <span
            role="button"
            title={
              subscribedKeys?.has(it.key)
                ? '已订阅预警（调价 / 降促 / 平台价差）· 点击取消订阅'
                : '订阅预警（调价 / 降促 / 平台价差）'
            }
            onClick={() => onToggleSubscribe(it.key)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '0 1px',
              cursor: 'pointer',
              // 订阅态 = 黄色铃铛（第五十四轮追补⑤批注：原来沿用预警琥珀 #b45309 偏棕，
              // 用户口径「黄色铃铛色」→ antd gold-6）
              color: subscribedKeys?.has(it.key) ? '#faad14' : color.hairlineStrong,
              flexShrink: 0,
            }}
          >
            <BellFilled style={{ fontSize: 14 }} />
          </span>
        )}
      </span>
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
      {/* 时点：左上角明显展示（第四十二轮），固定最新有值时点、不随悬停变换；
          第五十四轮追补①：pointDate 给到时恒显窗口末桶内最新周的三锚日，
          不再随粒度显示 2026-10 / 2026Q4（用户：时点应为最新那一周对应的那一天） */}
      <div style={{ marginBottom: 8 }}>
        <span className="tnum" style={{ fontSize: 13, fontWeight: 700, color: color.ink, whiteSpace: 'nowrap' }}>
          时点 {pointDate ?? fmtAsOf(granularity, asOf)}
        </span>
      </div>
      {/* 并排 3 款产品、等宽（第四十六轮）：超出 3 个自动换排，每框宽度恒一致 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 10 }}>
        {items.map(renderItem)}
      </div>
    </div>
  );
}
