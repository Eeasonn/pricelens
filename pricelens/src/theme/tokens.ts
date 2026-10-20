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
  mute: '#888888', // 占位/最弱文字
  link: '#0070f3', // 链接；语义色"竞品贵于我/我便宜"
  error: '#ee0000', // 语义色"我贵于竞品"；错误
  warning: '#f5a623', // offer 图标/浮窗强调（琥珀）
  warningSoft: '#ffefcf', // offer 浮窗内衬
  onPrimary: '#ffffff', // ink 表面上的文字
} as const;

/** 品牌数据色（图表线色，恒定不换）：我司线永远 HUAWEI 色且最粗 */
export const brandColor: Record<string, string> = {
  HUAWEI: '#c7000b',
  APPLE: '#1d1d1f',
  SAMSUNG: '#1428a0',
  HONOR: '#e8710a', // 刻意与 offer 琥珀 #f5a623 区分
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

/**
 * §3.3 数值显示规则：价格一律整数（调用方保证传入已取整数值）。
 * RUB：千分位空格 + 后缀 ₽（如 74 990 ₽）；USD：千分位逗号 + 前缀 $（如 $1,234）。
 */
export function formatPrice(v: number | null | undefined, currency: 'local' | 'usd'): string {
  if (v == null) return '—';
  if (currency === 'usd') return '$' + v.toLocaleString('en-US');
  return v.toLocaleString('ru-RU').replace(/\u00A0/g, ' ') + ' ₽';
}
