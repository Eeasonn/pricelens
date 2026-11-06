import { getLocalCurrency } from '../state/fx';
// ============================================================
// §4.3 视觉 token（Vercel 设计语言）—— 全项目唯一样式常量来源
// 冻结文件：子 Agent 只许引用，不许修改
// ============================================================

export const color = {
  canvas: '#ffffff', // 卡片/弹层表面
  canvasSoft: '#fafafa', // 页面底色
  canvasSoft2: '#f5f5f5', // 下拉菜单/悬停内衬
  hairline: '#ebebeb', // 1px 分隔线/边框
  hairlineStrong: '#a1a1a1', // 强分隔/禁用文字
  ink: '#171717', // 主文字/主按钮（唯一主 CTA 色）
  body: '#4d4d4d', // 次级文字
  mute: '#737373', // 占位/最弱文字（第一百八十二轮：#888888 白底对比 3.5:1 不足，加深至 4.7:1）
  link: '#0070f3', // 链接；语义色"竞品贵于我/我便宜"
  error: '#ee0000', // 语义色"我贵于竞品"；错误
  warning: '#f5a623', // offer 图标/浮窗强调（琥珀）
  warningInk: '#805b00', // warningSoft 上的文字/徽标文字
  warningSoft: '#ffefcf', // offer 浮窗内衬
  onPrimary: '#ffffff', // ink 表面上的文字
  /** Alert type/status colors are centralized so chips, inbox rows and drawers stay aligned. */
  alert: {
    priceChange: { fg: '#0053c2', bg: '#e8f1ff' },
    promo: { fg: '#b45309', bg: '#fff7e6' },
    platformGap: { fg: '#6d28d9', bg: '#f5f3ff' },
    ownGap: { fg: '#be123c', bg: '#fff1f2' },
    lifecycle: {
      new: { fg: '#0053c2', bg: '#e8f1ff' },
      acknowledged: { fg: '#475569', bg: '#f1f5f9' },
      investigating: { fg: '#6d28d9', bg: '#f5f3ff' },
      actionRequired: { fg: '#b45309', bg: '#fff7e6' },
      resolved: { fg: '#15803d', bg: '#f0fdf4' },
      snoozed: { fg: '#64748b', bg: '#f8fafc' },
      dismissed: { fg: '#64748b', bg: '#f8fafc' },
    },
    priority: { P1: '#b42318', P2: '#b45309', P3: '#737373' },
    evidence: { verified: '#15803d', pending: '#b45309' },
    bell: '#faad14',
  },
} as const;

/** 品牌数据色（图表线色，恒定不换）：我司线永远 HUAWEI 色且最粗。
 *  第一百八十二轮：HONOR #00ccff 白底对比仅 1.9:1，加深至 #0099cc（3.3:1，
 *  达到图形对象 3:1 底线）；其余品牌已达标不动 */
export const brandColor: Record<string, string> = {
  HUAWEI: '#c7000b',
  APPLE: '#1d1d1f',
  SAMSUNG: '#0000cc',
  HONOR: '#0099cc',
  VIVO: '#2693ca',
  XIAOMI: '#ff6900',
};

/**
 * 品牌色统一入口：已登记品牌沿用价格看板的固定颜色；新国家/产业出现新品牌时，
 * 按品牌名稳定落到扩展色板，避免回退成难以区分的黑色。
 */
const BRAND_EXTENDED_PALETTE = ['#7c3aed', '#0891b2', '#15803d', '#be123c', '#a16207', '#4f46e5', '#0f766e', '#c026d3'];
export function brandColorOf(brand: string): string {
  const key = brand.trim().toUpperCase();
  const exact = brandColor[brand] ?? brandColor[key];
  if (exact) return exact;
  let hash = 0;
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return BRAND_EXTENDED_PALETTE[hash % BRAND_EXTENDED_PALETTE.length];
}

export const font = {
  family: 'Inter, -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
  mono: 'Geist Mono, ui-monospace, monospace',
} as const;

export const fontSize = {
  displaySm: 20, // 区块标题「价格走势」20/600/28
  bodyMd: 16,
  bodySm: 14, // 筛选器、按钮、表格、轴刻度、价格标签
  caption: 12, // 徽标、页脚、附框小字
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
} as const;

export const radius = {
  control: 6, // 按钮/输入/chip
  card: 8, // 卡片
  modal: 12, // 弹窗
  pill: 9999, // 圆胶囊
} as const;

/** 动效令牌：时长三档 + 入场/退场两条标准曲线，全站动画统一取值（不再即兴） */
export const motion = {
  fast: 160, // 悬停反馈、连线/浮层入场、置灰
  base: 240, // 模式切换、面板宽度形变、chip 滑入
  slow: 320, // 跨页接力收起
  agentFull: 720, // Agent 全屏与 dock 的同壳体连续收窄，给用户确认和空间重排时间
  searchEntrance: 200, // 页头快速搜索面板只在打开时入场
  searchResult: 120, // 快速搜索结果换算/换模式时的交叉淡化
  searchExit: 140, // 快速搜索面板退场，避免关闭时瞬间消失
  enter: 'cubic-bezier(0.25, 0.8, 0.3, 1)', // 入场（快出缓停）
  exit: 'cubic-bezier(0.4, 0, 0.2, 1)', // 退场（匀出急停）
} as const;

/** 层叠小偏移 + inset hairline，不用单层大投影 */
export const shadow = {
  l1: 'inset 0 0 0 1px rgba(0,0,0,.08)',
  l2: '0 1px 1px rgba(0,0,0,.02), 0 2px 2px rgba(0,0,0,.04), inset 0 0 0 1px rgba(0,0,0,.08)',
  l5: '0 1px 1px rgba(0,0,0,.02), 0 8px 16px -4px rgba(0,0,0,.04), 0 24px 32px -8px rgba(0,0,0,.06), inset 0 0 0 1px rgba(0,0,0,.08)',
} as const;

// ============================================================
// 反馈 2.4 追加：筛选控件选中/悬停/聚焦浅蓝态（仅筛选条作用域使用，
// 不影响 ink 主按钮与图表 chips；主强调色与 color.link 同值保持一致）
// ============================================================
export const selectSoft = '#e8f1ff'; // 选中/悬停底色（浅蓝）
export const selectSoftInk = '#0053c2'; // 选中态文字（深蓝）
export const selectAccent = '#0070f3'; // 聚焦边框/选中强调（浅蓝系）

// ============================================================
// 量价参考卡 · 事件类型色板（referenceEventPalette）：事件类型库的默认
// 八色语义 token。前三项与兜底项取既有语义色（link / warning / mute），挤兑
// 取扩展图表色板的 #be123c（压力/风险类；2026-11-06 P0-2：ink 退出事件色，
// 墨色只留给唯一主按钮，与主图 PRODUCT_EVENT_COLOR.cannibalization 同步换色
// 保持同源），后四项取扩展图表色板中的既值（#0f766e / #be123c / #a16207 /
// #0891b2）。仅作为参考卡事件类型的默认/恢复默认色，不反写主图
// PRODUCT_EVENT_COLOR，不作为 UI 状态色使用；用户改色经类型库持久化，
// 事件只存 typeId 不复制色值。语义说明见 DESIGN.md「Colors」。
// ============================================================
export const referenceEventPalette: readonly string[] = [
  color.link, // 竞品上市 / 我司上市（默认，同主图 competitor-launch）
  color.warning, // 促销投放（同主图营销价促色系）
  '#be123c', // 挤兑（压力/风险类，同主图 cannibalization；2026-11-06 起 ink 不再作事件色）
  color.mute, // 其他（中性兜底）
  '#0f766e', // 扩展：增长/份额类事件
  '#be123c', // 扩展：压力/风险类事件
  '#a16207', // 扩展：成本/供给类事件
  '#0891b2', // 扩展：渠道/库存类事件
];

// ============================================================
// 时间轨道色（第一百三十三轮收敛）：价格看板刷选条（XBrush）、分离面板
// 轨道（SplitTimeTrack）、量价面板轨道（PanelTimeTrack）三处共用的
// 同一组色值——此前三份硬编码拷贝，此处统一出口（色值不变，仅收敛来源）
// ============================================================
export const trackColors = {
  rail: '#edf0f4', // 轨道底
  fill: '#dceaff', // 选中段底
  fillStrong: '#c7ddff', // 拖动中的选中段底
  handle: '#4f8fe8', // 拖柄
  handleSoft: '#8db4f0', // 选中段内衬描边
  tick: '#aeb8c6', // 中间刻度线
} as const;

/**
 * §3.3 数值显示规则：价格一律整数（调用方保证传入已取整数值）。
 * USD：千分位逗号 + 前缀 $（如 $1,234）；本币：按当前国家本币格式化——
 * RUB 沿用「千分位空格 + 后缀 ₽」（74 990 ₽），其余币种「代码 + 千分位」（SAR 3,799 / MXN 10,499），
 * 不用窄符号以免 MX$/R$ 与 USD 混淆。
 */
export function formatPrice(v: number | null | undefined, currency: 'local' | 'usd'): string {
  if (v == null) return '—';
  if (currency === 'usd') return '$' + v.toLocaleString('en-US');
  return formatLocalMoney(v, getLocalCurrency());
}

/** 币种符号：常见币种用符号，其余用 ISO 代码（避免 MX$/R$ 与美元混淆） */
export function currencySymbol(code: string): string {
  return ({ RUB: '₽', USD: '$', EUR: '€', GBP: '£', JPY: '¥' } as Record<string, string>)[code] ?? code;
}

/** 当前国家本币符号（看板左上角币种徽标等处用） */
export function localCurrencySymbol(): string {
  return currencySymbol(getLocalCurrency());
}

export function formatLocalMoney(v: number, code: string): string {
  if (code === 'RUB') return v.toLocaleString('ru-RU').replace(/\u00A0/g, ' ') + ' ₽';
  if (code === 'USD') return '$' + v.toLocaleString('en-US');
  return `${code} ${v.toLocaleString('en-US')}`;
}
