// ============================================================
// §6.2 钉顶卡片（第九轮口径 = 图例/明细两态）：
// - 常驻：选完产品即出现。未悬停且未锁定 = 图例态：品牌色小点+品牌+产品名单行居中，
//   不出明细（用户反馈：没锁定时不该展示 RRP/折后价/来源）；
//   悬停列或锁定列 = 明细态：小点+名称、RRP、折后价（竞品附与我们的价差%）、
//   来源（平台店铺名超链接，取证跳转）；移出后回图例态（锁定列保持明细）。
// - 卡片即 BI 图例：点击切换选中/未选中，未选中系列折线隐藏、底色浅一档、内容减淡。
// - 底色 = 品牌色掺灰提亮 + 80% 透明度（brandTintBg）：选中浅品牌色/未选中浅浅品牌色。
// - 卡宽 = 绘图区 1/6（cardWidthFor），整组居中、从中间向外拓展；>6 个自动换排，
//   排数 = ceil(N/6) 只随产品选择变化（helpers.gridTopFor 决定图顶预留，悬停不变高）。
// - offer 不进卡片（图上 offer 小图标承载）。
// ============================================================
import type { CurrencyMode, Series } from '../../dataModel/types';
import { color, formatPrice, radius, shadow } from '../../theme/tokens';
import BrandDot, { brandTintBg } from '../../components/BrandMark';
import { CARD_GAP, CARD_H, cardWidthFor, diffPct } from './helpers';

export interface PinnedTooltipsProps {
  series: Series[]; // 全部勾选系列（含图例取消选中的——卡片常驻）
  hiddenKeys: Set<string>; // 图例未选中的系列 key（折线已隐藏）
  index: number | null; // 钉住的桶下标；null = 图例态
  currency: CurrencyMode;
  priceTypes: { discounted: boolean; rrp: boolean };
  left: number; // 绘图区左缘
  top: number; // 卡片区 top
  maxWidth: number; // 绘图区宽
  onToggle?: (key: string) => void; // 图例点击（弹窗迷你图可不传）
}

export default function PinnedTooltips(props: PinnedTooltipsProps) {
  const { series, hiddenKeys, index, currency, priceTypes, left, top, maxWidth, onToggle } = props;
  if (series.length === 0) return null;

  // 我司基准价 = 第一个在当前桶有主价的我司系列（竞品价差锚点）
  const mainVal = (s: Series): number | null => {
    if (index == null) return null;
    const pt = s.points[index];
    if (!pt) return null;
    return priceTypes.discounted ? pt.price : pt.rrp;
  };
  let ownVal: number | null = null;
  for (const s of series) {
    if (!s.isOwn) continue;
    const v = mainVal(s);
    if (v != null) {
      ownVal = v;
      break;
    }
  }

  const cardW = cardWidthFor(maxWidth);

  return (
    <div
      style={{
        position: 'absolute',
        left,
        top,
        width: maxWidth,
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center', // 整组居中，从中间向外拓展
        gap: CARD_GAP,
        zIndex: 6,
        pointerEvents: 'none', // 空隙不挡图；卡片自身恢复可点
      }}
    >
      {series.map((s) => {
        const selected = !hiddenKeys.has(s.key);
        const detail = index != null;
        const pt = detail ? s.points[index] : undefined;
        const main = mainVal(s);
        const diff = detail && !s.isOwn && ownVal != null && main != null ? diffPct(main, ownVal) : null;
        return (
          <div
            key={s.key}
            role={onToggle ? 'button' : undefined}
            aria-pressed={onToggle ? !selected : undefined}
            title={onToggle ? `${s.label}（点击${selected ? '隐藏' : '显示'}折线）` : s.label}
            onClick={
              onToggle
                ? (e) => {
                    e.stopPropagation();
                    onToggle(s.key);
                  }
                : undefined
            }
            style={{
              width: cardW,
              height: CARD_H,
              boxSizing: 'border-box',
              background: brandTintBg(s.brand, selected),
              borderRadius: radius.control,
              boxShadow: shadow.l2,
              padding: '6px 10px',
              cursor: onToggle ? 'pointer' : 'default',
              pointerEvents: 'auto',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center', // 两态内容都垂直居中，卡高不变无跳动感
              gap: 2,
              overflow: 'hidden',
              opacity: selected ? 1 : 0.72,
              transition: 'background .12s ease, opacity .12s ease',
              flexShrink: 0,
            }}
          >
            {index == null ? (
              /* 图例态：品牌色小点 + 品牌+产品名，单行居中（不出明细） */
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  fontSize: 12,
                  lineHeight: '16px',
                  fontWeight: 600,
                  color: color.ink,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                }}
              >
                <BrandDot brand={s.brand} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.label}</span>
              </div>
            ) : (
              <>
                {/* 明细态：小点+名称 / RRP / 折后价(+价差%) / 来源超链接 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 16 }}>
                  <BrandDot brand={s.brand} />
                  <div
                    title={s.label}
                    style={{
                      fontSize: 12,
                      lineHeight: '16px',
                      fontWeight: 600,
                      color: color.ink,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {s.label}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 12, lineHeight: '16px' }}>
                  <span style={{ color: color.mute }}>RRP</span>
                  <span className="tnum" style={{ color: color.body }}>
                    {formatPrice(pt?.rrp ?? null, currency)}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 13, lineHeight: '18px' }}>
                  <span style={{ fontSize: 11, color: color.mute }}>折后价</span>
                  <span className="tnum" style={{ fontWeight: 600, color: color.ink }}>
                    {formatPrice(pt?.price ?? null, currency)}
                  </span>
                  {diff && (
                    <span
                      className="tnum"
                      style={{ fontSize: 11, color: diff.tone === 'rich' ? color.error : color.link }}
                      title="与我们的价差"
                    >
                      {diff.text}
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    lineHeight: '16px',
                    color: color.body,
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 6,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                  }}
                >
                  <span style={{ color: color.mute, flexShrink: 0 }}>来源</span>
                  {pt?.url ? (
                    <a
                      href={pt.url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      title={`打开 ${pt.shopName ?? ''} 取证页`}
                      style={{ color: color.link, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis' }}
                    >
                      {pt.shopName ?? '—'}
                    </a>
                  ) : (
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{pt?.shopName ?? '—'}</span>
                  )}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
