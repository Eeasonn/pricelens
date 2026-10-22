// ============================================================
// 价格摘要条（第三十六轮定版 / 第四十六轮改版）：核心视觉页签——固定显示窗口内
// 最新时点（不随悬停变换，时点明细看悬停浮窗）。条目 = 并排 3 个等宽小框
// （圆角与大框一致），每框必含三件套：折扣率 + 折后价 + 划线 RRP（用户口径：
// 三项恒显，0% 也不省略）；我司与竞品完全同款；来源为取证超链接。折扣徽章
// 0% 中性蓝、≥15% 转琥珀预警、溢价 +X% 琥珀。数据 = buildPriceSummary（最新有值点）。
// 第五十六轮（领导页面清洁要求）：时点页签撤出看板主视觉——stack/chrome 两 prop
// 供时点明细抽屉复用（单列纵向堆叠、无外层卡壳），入口 = 工具行「⋯ 更多」菜单。
// ============================================================
import type { CurrencyMode, Granularity } from '../../dataModel/types';
import { ExportOutlined } from '@ant-design/icons';
import BrandDot from '../../components/BrandMark';
import { AlertBell } from '../../components/AlertCenter';
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

/** 时点日期格式化（第五十六轮再版导出：图右侧时点面板头部复用同一口径） */
export function fmtPointDate(gran: Granularity, x: string | null): string {
  return fmtAsOf(gran, x);
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
  alertCounts,
  subscribedKeys,
  onToggleSubscribe,
  stack,
  chrome = true,
  showHeader = true,
}: {
  items: PriceSummaryItem[];
  currency: CurrencyMode;
  granularity: Granularity;
  /** 时点日期覆盖（第五十四轮追补①）：窗口末桶内最新周的三锚日（MM-DD）——
   *  月/季粒度的条目 xLabel 是 2026-10 / 2026Q4，不是「一天」；上层给到则恒显该日 */
  pointDate?: string | null;
  /** 预警触发展示（追补⑨）：seriesKey → 触发条数；>0 时订阅铃铛挂黄点 */
  alertCounts?: Record<string, number>;
  /** 预警订阅（第五十三轮从图表图例 chips 挪入本页签尾，「来源」之后） */
  subscribedKeys?: Set<string>;
  onToggleSubscribe?: (key: string) => void;
  /** 第五十六轮：true = 单列纵向堆叠（时点明细抽屉用）；缺省 = 3 列等宽宫格 */
  stack?: boolean;
  /** false = 不渲染外层卡片壳（抽屉自备 chrome）；缺省 = 白卡+投影 */
  chrome?: boolean;
  /** 第五十六轮再版：false = 不渲染「时点 XX-XX」头行（面板自备头部时用） */
  showHeader?: boolean;
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
  const renderItem = (it: PriceSummaryItem): React.ReactElement => {
  // 店铺来源（取证超链接）——三区横排与窄栏两行两版共用
  const shopNode = it.shop && (
    <span style={{ fontSize: 10, lineHeight: '14px', whiteSpace: 'nowrap', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
          {it.shop}
          <ExportOutlined style={{ fontSize: 11, marginLeft: 2 }} />
        </a>
      ) : (
        <span style={{ color: color.mute }}>{it.shop}</span>
      )}
    </span>
  );
  // 订阅铃铛（第五十三轮挪入；第五十四轮居中放大）＋触发黄点（追补⑨）。
  // 预警中心重构：换统一 AlertBell 共享组件（未订阅 = 描边灰、已订阅 = 金实心
  // + 触发金点），与总览行尾/预警页矩阵同一形态同一语义
  const bellNode = onToggleSubscribe && (
    <AlertBell
      subscribed={subscribedKeys?.has(it.key) ?? false}
      count={alertCounts?.[it.key] ?? 0}
      onToggle={() => onToggleSubscribe(it.key)}
    />
  );

  // 窄栏两行卡（第五十六轮再版二，用户截图批注）：图右侧时点面板 336px 塞不下
  // 三区横排——产品名截断「Pura 90s …」、划线 RRP 与店铺链接叠字。改上下两行：
  // 上行 = 品牌点 + 全名（整行宽度，基本不截断）+ 订阅铃铛居右；
  // 下行 = 折扣徽章 + 现价 + 划线 RRP，来源链接推到行尾右对齐
  if (stack) {
    return (
      <div
        key={it.key}
        style={{
          minWidth: 0,
          padding: '8px 10px',
          borderRadius: radius.card,
          background: color.canvasSoft,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <BrandDot brand={it.brand} />
          <span
            title={it.name}
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: color.ink,
              flex: '1 1 0',
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {it.name}
          </span>
          {bellNode}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
          {it.discount != null && <DiscountBadge discount={it.discount} />}
          <span
            className="tnum"
            title={it.price != null ? undefined : '该时点暂无价格'}
            style={{ fontSize: 17, lineHeight: '22px', fontWeight: 700, color: it.price != null ? color.ink : color.hairlineStrong, whiteSpace: 'nowrap' }}
          >
            {formatPrice(it.price, currency)}
          </span>
          {it.rrp != null && (
            <span className="tnum" title="RRP（官方建议零售价）" style={{ fontSize: 11, lineHeight: '15px', color: color.mute, textDecoration: 'line-through', whiteSpace: 'nowrap' }}>
              {formatPrice(it.rrp, currency)}
            </span>
          )}
          <span style={{ flex: '1 1 0', minWidth: 0 }} />
          {shopNode}
        </div>
      </div>
    );
  }

  return (
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
          title={it.price != null ? undefined : '该时点暂无价格'}
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
        {shopNode}
        {bellNode}
      </span>
    </div>
  );
  };

  return (
    <div
      style={
        chrome
          ? {
              padding: '10px 16px',
              marginBottom: space.sm,
              borderRadius: radius.card,
              background: color.canvas,
              boxShadow: shadow.l1, // 显性化（第三十六轮）：核心视觉页签，抬一层
            }
          : undefined
      }
    >
      {/* 时点：左上角明显展示（第四十二轮），固定最新有值时点、不随悬停变换；
          第五十四轮追补①：pointDate 给到时恒显窗口末桶内最新周的三锚日，
          不再随粒度显示 2026-10 / 2026Q4（用户：时点应为最新那一周对应的那一天）；
          第五十六轮再版：showHeader=false 供图右侧时点面板复用（面板自备头部） */}
      {showHeader && (
        <div style={{ marginBottom: 8 }}>
          <span className="tnum" style={{ fontSize: 13, fontWeight: 700, color: color.ink, whiteSpace: 'nowrap' }}>
            时点 {pointDate ?? fmtAsOf(granularity, asOf)}
          </span>
        </div>
      )}
      {/* 并排 3 款产品、等宽（第四十六轮）：超出 3 个自动换排，每框宽度恒一致；
          第五十六轮 stack = 单列纵向堆叠（时点明细抽屉——领导页面清洁要求，
          时点页签撤出主视觉收进二级） */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: stack ? 'minmax(0, 1fr)' : 'repeat(3, minmax(0,1fr))',
          gap: stack ? 8 : 10,
        }}
      >
        {items.map(renderItem)}
      </div>
    </div>
  );
}
