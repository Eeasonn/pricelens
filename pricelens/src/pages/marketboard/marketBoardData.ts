// ============================================================
// 大盘图表 · 分产业模拟数据集（GFK 看板复刻配套）
// 三张图共用一份产业数据：①核心档位品牌份额趋势 ②品牌份额趋势 ③各品牌
// 核心档位结构同比变化。数据口径：
// · 穿戴：档位结构、档位容量与品牌份额锚定 GFK 阿联酋穿戴大盘看板截图
//   （202508 / 202606 / 202607 / 202608 四个锚点月，量为万台、ASP 为 USD）；
// · 手机 / 平板：品牌结构与档位带参考 IDC / Counterpoint 2025 公开口径整理，
//   量级按阿联酋单市场体量估计；
// · 除锚点月外的月度序列由 marketBoardModel 按锚点确定性插值，无随机数。
// 全部为演示用模拟数据，切换真实数据源时仅需替换本文件。
// ============================================================

/** 「其他品牌」固定键：不进入 brands 堆叠清单，由份额差值计算补齐 */
export const OTHERS = 'OTHERS';

export interface MarketTier {
  id: string;
  /** 业务档位名，如「25–50」（USD 价带） */
  label: string;
  min: number | null;
  max: number | null;
}

export interface MonthValue {
  month: string; // YYYYMM
  value: number;
}

export interface MonthShares {
  month: string; // YYYYMM
  /** 品牌键 -> 份额 %（不含 OTHERS，差值补齐） */
  shares: Record<string, number>;
}

export interface MarketIndustryData {
  id: string;
  label: string;
  region: string;
  /** 口径一句话说明（卡片来源徽标 tooltip 用） */
  intro: string;
  /** 品牌堆叠清单（自下而上），不含 OTHERS */
  brands: string[];
  tiers: MarketTier[];
  /** 图 1 / 图 3 共用的细化锚点月 */
  anchorMonths: string[];
  /** 图 3 同比对：[本期, 去年同期] */
  yoyMonths: [string, string];
  /** 图 2 月度域（YYYYMM 升序） */
  trendMonths: string[];
  /** 早期大盘总量锚点（万台），细化锚点月的总量由档位容量求和得出 */
  volumeHistory: MonthValue[];
  /** ASP 锚点（USD），覆盖早期手写值与细化锚点月 */
  aspAnchors: MonthValue[];
  /** 早期品牌份额锚点（%），细化锚点月的份额由档位数据加权计算 */
  overallHistory: MonthShares[];
  /** tierId -> 锚点月 -> 大盘容量（万台） */
  tierVolume: Record<string, Record<string, number>>;
  /** tierId -> 锚点月 -> 品牌 -> 份额 %（不含 OTHERS，差值补齐） */
  tierShare: Record<string, Record<string, Record<string, number>>>;
}

const TIERS_WEARABLE: MarketTier[] = [
  { id: 'u25', label: '<25', min: null, max: 25 },
  { id: 'u25_50', label: '25–50', min: 25, max: 50 },
  { id: 'u50_75', label: '50–75', min: 50, max: 75 },
  { id: 'u75_150', label: '75–150', min: 75, max: 150 },
  { id: 'u150_300', label: '150–300', min: 150, max: 300 },
  { id: 'o300', label: '>300', min: 300, max: null },
];

/** 穿戴：阿联酋，档位/份额锚定 GFK 看板截图（IMG_9476 / IMG_9368 / IMG_9371） */
const WEARABLES: MarketIndustryData = {
  id: 'wearables',
  label: '智能穿戴',
  region: '阿联酋',
  intro: '口径参考 GFK 阿联酋穿戴大盘看板（2025-08–2026-08），档位为 USD 价带；数值为演示用模拟数据',
  brands: ['APPLE', 'SAMSUNG', 'HUAWEI', 'MI', 'HONOR', 'GARMIN', 'AMAZFIT', 'GOOGLE', 'WHOOP'],
  tiers: TIERS_WEARABLE,
  anchorMonths: ['202508', '202606', '202607', '202608'],
  yoyMonths: ['202608', '202508'],
  trendMonths: months('202408', '202608'),
  volumeHistory: [
    { month: '202408', value: 9.6 },
    { month: '202412', value: 12.6 },
    { month: '202504', value: 9.9 },
  ],
  aspAnchors: [
    { month: '202408', value: 133 },
    { month: '202412', value: 140 },
    { month: '202504', value: 128 },
    { month: '202508', value: 125 },
    { month: '202606', value: 134 },
    { month: '202607', value: 139 },
    { month: '202608', value: 153 },
  ],
  overallHistory: [
    { month: '202408', shares: { APPLE: 24, SAMSUNG: 23, HUAWEI: 8, MI: 6, HONOR: 4, GARMIN: 8, AMAZFIT: 5, GOOGLE: 0, WHOOP: 2 } },
    { month: '202412', shares: { APPLE: 25, SAMSUNG: 22, HUAWEI: 9, MI: 6, HONOR: 4, GARMIN: 9, AMAZFIT: 4, GOOGLE: 0, WHOOP: 3 } },
    { month: '202504', shares: { APPLE: 24, SAMSUNG: 22, HUAWEI: 9, MI: 6, HONOR: 4, GARMIN: 9, AMAZFIT: 4, GOOGLE: 0, WHOOP: 2 } },
  ],
  tierVolume: {
    u25: { '202508': 3.2, '202606': 2.1, '202607': 2.5, '202608': 2.2 },
    u25_50: { '202508': 2.5, '202606': 3.1, '202607': 4.1, '202608': 2.8 },
    u50_75: { '202508': 0.6, '202606': 0.5, '202607': 0.6, '202608': 0.5 },
    u75_150: { '202508': 1.0, '202606': 1.2, '202607': 1.3, '202608': 1.3 },
    u150_300: { '202508': 1.3, '202606': 2.0, '202607': 2.4, '202608': 1.2 },
    o300: { '202508': 1.7, '202606': 2.4, '202607': 1.8, '202608': 1.3 },
  },
  tierShare: {
    u25: {
      '202508': { HUAWEI: 4, MI: 3, AMAZFIT: 2, HONOR: 1 },
      '202606': { HUAWEI: 4, MI: 2, AMAZFIT: 1, HONOR: 1 },
      '202607': { HUAWEI: 1, MI: 2, AMAZFIT: 1 },
      '202608': { HUAWEI: 10, MI: 2, AMAZFIT: 1 },
    },
    u25_50: {
      '202508': { SAMSUNG: 12, HUAWEI: 14, MI: 7, AMAZFIT: 1 },
      '202606': { SAMSUNG: 13, HUAWEI: 12, MI: 11, HONOR: 8, AMAZFIT: 1 },
      '202607': { SAMSUNG: 16, HUAWEI: 11, MI: 12, HONOR: 7 },
      '202608': { SAMSUNG: 9, HUAWEI: 12, MI: 12, HONOR: 7, AMAZFIT: 1 },
    },
    u50_75: {
      '202508': { SAMSUNG: 5, HUAWEI: 22, MI: 3, AMAZFIT: 2 },
      '202606': { SAMSUNG: 4, HUAWEI: 20, MI: 6, AMAZFIT: 2 },
      '202607': { SAMSUNG: 3, HUAWEI: 19, MI: 5, AMAZFIT: 4, HONOR: 2 },
      '202608': { SAMSUNG: 2, HUAWEI: 27, MI: 6, HONOR: 7 },
    },
    u75_150: {
      '202508': { SAMSUNG: 30, HUAWEI: 42, MI: 1, HONOR: 1, GARMIN: 5, AMAZFIT: 2, WHOOP: 1 },
      '202606': { SAMSUNG: 28, HUAWEI: 3, GARMIN: 5, GOOGLE: 44, AMAZFIT: 1, WHOOP: 1 },
      '202607': { SAMSUNG: 34, HUAWEI: 3, GARMIN: 12, GOOGLE: 38, AMAZFIT: 1, WHOOP: 2 },
      '202608': { SAMSUNG: 18, HUAWEI: 13, GARMIN: 2, GOOGLE: 63, AMAZFIT: 1, WHOOP: 1 },
    },
    u150_300: {
      '202508': { APPLE: 23, SAMSUNG: 23, HUAWEI: 18, GARMIN: 1, GOOGLE: 1, WHOOP: 32 },
      '202606': { APPLE: 9, SAMSUNG: 23, HUAWEI: 17, GARMIN: 1, GOOGLE: 2, WHOOP: 46 },
      '202607': { APPLE: 9, SAMSUNG: 21, HUAWEI: 20, GARMIN: 2, GOOGLE: 12, WHOOP: 34 },
      '202608': { APPLE: 15, SAMSUNG: 17, HUAWEI: 28, GARMIN: 2, GOOGLE: 3, WHOOP: 31 },
    },
    o300: {
      '202508': { APPLE: 46, SAMSUNG: 11, HUAWEI: 4, GARMIN: 30, WHOOP: 6 },
      '202606': { APPLE: 35, SAMSUNG: 10, HUAWEI: 3, GARMIN: 40, GOOGLE: 1, WHOOP: 9 },
      '202607': { APPLE: 49, SAMSUNG: 7, HUAWEI: 3, GARMIN: 29, GOOGLE: 1, WHOOP: 8 },
      '202608': { APPLE: 54, SAMSUNG: 12, HUAWEI: 3, GARMIN: 17, WHOOP: 12 },
    },
  },
};

const TIERS_PHONE: MarketTier[] = [
  { id: 'u100', label: '<100', min: null, max: 100 },
  { id: 'u100_200', label: '100–200', min: 100, max: 200 },
  { id: 'u200_400', label: '200–400', min: 200, max: 400 },
  { id: 'u400_600', label: '400–600', min: 400, max: 600 },
  { id: 'u600_1000', label: '600–1000', min: 600, max: 1000 },
  { id: 'o1000', label: '>1000', min: 1000, max: null },
];

/** 手机：阿联酋，品牌结构参考 IDC / Counterpoint 2025 GCC 公开口径整理 */
const PHONES: MarketIndustryData = {
  id: 'phone',
  label: '智能手机',
  region: '阿联酋',
  intro: '档位与品牌结构参考 IDC / Counterpoint 2025 GCC 公开口径整理，档位为 USD 价带；数值为演示用模拟数据',
  brands: ['APPLE', 'SAMSUNG', 'HUAWEI', 'MI', 'HONOR', 'OPPO', 'VIVO'],
  tiers: TIERS_PHONE,
  anchorMonths: ['202508', '202606', '202607', '202608'],
  yoyMonths: ['202608', '202508'],
  trendMonths: months('202408', '202608'),
  volumeHistory: [
    { month: '202408', value: 35.5 },
    { month: '202412', value: 43.5 },
    { month: '202504', value: 36.5 },
  ],
  aspAnchors: [
    { month: '202408', value: 430 },
    { month: '202412', value: 442 },
    { month: '202504', value: 436 },
    { month: '202508', value: 441 },
    { month: '202606', value: 439 },
    { month: '202607', value: 442 },
    { month: '202608', value: 480 },
  ],
  overallHistory: [
    { month: '202408', shares: { APPLE: 19, SAMSUNG: 23, HUAWEI: 4, MI: 11, HONOR: 5, OPPO: 8, VIVO: 8 } },
    { month: '202412', shares: { APPLE: 21, SAMSUNG: 23, HUAWEI: 4, MI: 11, HONOR: 5, OPPO: 7, VIVO: 7 } },
    { month: '202504', shares: { APPLE: 20, SAMSUNG: 22, HUAWEI: 4, MI: 11, HONOR: 5, OPPO: 8, VIVO: 8 } },
  ],
  tierVolume: {
    u100: { '202508': 5.0, '202606': 4.6, '202607': 4.8, '202608': 4.9 },
    u100_200: { '202508': 7.5, '202606': 7.0, '202607': 7.2, '202608': 7.4 },
    u200_400: { '202508': 9.5, '202606': 9.0, '202607': 9.2, '202608': 9.4 },
    u400_600: { '202508': 6.5, '202606': 6.2, '202607': 6.4, '202608': 6.8 },
    u600_1000: { '202508': 5.5, '202606': 5.8, '202607': 6.4, '202608': 7.5 },
    o1000: { '202508': 4.0, '202606': 3.4, '202607': 3.5, '202608': 5.0 },
  },
  tierShare: {
    u100: {
      '202508': { MI: 12, OPPO: 6, VIVO: 6, HONOR: 3, SAMSUNG: 5, HUAWEI: 1 },
      '202606': { MI: 11, OPPO: 6, VIVO: 6, HONOR: 3, SAMSUNG: 5, HUAWEI: 1 },
      '202607': { MI: 12, OPPO: 6, VIVO: 6, HONOR: 3, SAMSUNG: 5, HUAWEI: 1 },
      '202608': { MI: 13, OPPO: 6, VIVO: 6, HONOR: 3, SAMSUNG: 5, HUAWEI: 1 },
    },
    u100_200: {
      '202508': { MI: 20, SAMSUNG: 16, OPPO: 12, VIVO: 12, HONOR: 8, HUAWEI: 3 },
      '202606': { MI: 19, SAMSUNG: 16, OPPO: 12, VIVO: 12, HONOR: 8, HUAWEI: 3 },
      '202607': { MI: 20, SAMSUNG: 16, OPPO: 12, VIVO: 12, HONOR: 8, HUAWEI: 3 },
      '202608': { MI: 21, SAMSUNG: 16, OPPO: 12, VIVO: 12, HONOR: 8, HUAWEI: 3 },
    },
    u200_400: {
      '202508': { SAMSUNG: 24, MI: 16, OPPO: 12, VIVO: 12, HONOR: 9, HUAWEI: 5, APPLE: 2 },
      '202606': { SAMSUNG: 23, MI: 16, OPPO: 12, VIVO: 12, HONOR: 9, HUAWEI: 5, APPLE: 3 },
      '202607': { SAMSUNG: 24, MI: 16, OPPO: 12, VIVO: 12, HONOR: 9, HUAWEI: 5, APPLE: 3 },
      '202608': { SAMSUNG: 25, MI: 16, OPPO: 12, VIVO: 12, HONOR: 9, HUAWEI: 5, APPLE: 3 },
    },
    u400_600: {
      '202508': { APPLE: 28, SAMSUNG: 32, HUAWEI: 6, HONOR: 6, MI: 9, OPPO: 7, VIVO: 7 },
      '202606': { APPLE: 30, SAMSUNG: 30, HUAWEI: 6, HONOR: 6, MI: 9, OPPO: 7, VIVO: 7 },
      '202607': { APPLE: 30, SAMSUNG: 30, HUAWEI: 6, HONOR: 6, MI: 9, OPPO: 7, VIVO: 7 },
      '202608': { APPLE: 32, SAMSUNG: 29, HUAWEI: 6, HONOR: 6, MI: 8, OPPO: 7, VIVO: 7 },
    },
    u600_1000: {
      '202508': { APPLE: 48, SAMSUNG: 34, HUAWEI: 5, HONOR: 3, MI: 2, OPPO: 2 },
      '202606': { APPLE: 50, SAMSUNG: 33, HUAWEI: 5, HONOR: 3, MI: 2, OPPO: 2 },
      '202607': { APPLE: 51, SAMSUNG: 32, HUAWEI: 5, HONOR: 3, MI: 2, OPPO: 2 },
      '202608': { APPLE: 52, SAMSUNG: 32, HUAWEI: 4, HONOR: 3, MI: 2, OPPO: 2 },
    },
    o1000: {
      '202508': { APPLE: 68, SAMSUNG: 20, HUAWEI: 3, HONOR: 1, MI: 1 },
      '202606': { APPLE: 66, SAMSUNG: 21, HUAWEI: 3, HONOR: 1, MI: 1 },
      '202607': { APPLE: 67, SAMSUNG: 20, HUAWEI: 3, HONOR: 1, MI: 1 },
      '202608': { APPLE: 72, SAMSUNG: 19, HUAWEI: 3, HONOR: 1, MI: 1 },
    },
  },
};

const TIERS_TABLET: MarketTier[] = [
  { id: 'u200', label: '<200', min: null, max: 200 },
  { id: 'u200_400', label: '200–400', min: 200, max: 400 },
  { id: 'u400_700', label: '400–700', min: 400, max: 700 },
  { id: 'u700_1000', label: '700–1000', min: 700, max: 1000 },
  { id: 'u1000_1500', label: '1000–1500', min: 1000, max: 1500 },
  { id: 'o1500', label: '>1500', min: 1500, max: null },
];

/** 平板：阿联酋，品牌结构参考 IDC / Counterpoint 2025 全球/区域公开口径整理 */
const TABLETS: MarketIndustryData = {
  id: 'tablet',
  label: '平板电脑',
  region: '阿联酋',
  intro: '品牌结构参考 IDC / Counterpoint 2025 平板公开口径整理，档位为 USD 价带；数值为演示用模拟数据',
  brands: ['APPLE', 'SAMSUNG', 'HUAWEI', 'LENOVO', 'MI', 'HONOR'],
  tiers: TIERS_TABLET,
  anchorMonths: ['202508', '202606', '202607', '202608'],
  yoyMonths: ['202608', '202508'],
  trendMonths: months('202408', '202608'),
  volumeHistory: [
    { month: '202408', value: 6.8 },
    { month: '202412', value: 9.4 },
    { month: '202504', value: 7.0 },
  ],
  aspAnchors: [
    { month: '202408', value: 401 },
    { month: '202412', value: 414 },
    { month: '202504', value: 406 },
    { month: '202508', value: 409 },
    { month: '202606', value: 419 },
    { month: '202607', value: 416 },
    { month: '202608', value: 407 },
  ],
  overallHistory: [
    { month: '202408', shares: { APPLE: 36, SAMSUNG: 19, HUAWEI: 6, LENOVO: 9, MI: 6, HONOR: 3 } },
    { month: '202412', shares: { APPLE: 37, SAMSUNG: 19, HUAWEI: 6, LENOVO: 9, MI: 6, HONOR: 3 } },
    { month: '202504', shares: { APPLE: 36, SAMSUNG: 19, HUAWEI: 6, LENOVO: 9, MI: 6, HONOR: 3 } },
  ],
  tierVolume: {
    u200: { '202508': 2.6, '202606': 2.9, '202607': 3.1, '202608': 2.8 },
    u200_400: { '202508': 2.2, '202606': 2.4, '202607': 2.5, '202608': 2.3 },
    u400_700: { '202508': 1.3, '202606': 1.5, '202607': 1.6, '202608': 1.5 },
    u700_1000: { '202508': 0.6, '202606': 0.7, '202607': 0.8, '202608': 0.7 },
    u1000_1500: { '202508': 0.35, '202606': 0.4, '202607': 0.42, '202608': 0.38 },
    o1500: { '202508': 0.15, '202606': 0.2, '202607': 0.18, '202608': 0.12 },
  },
  tierShare: {
    u200: {
      '202508': { SAMSUNG: 18, LENOVO: 12, MI: 10, HONOR: 6, HUAWEI: 4, APPLE: 3 },
      '202606': { SAMSUNG: 18, LENOVO: 12, MI: 10, HONOR: 6, HUAWEI: 4, APPLE: 3 },
      '202607': { SAMSUNG: 18, LENOVO: 12, MI: 10, HONOR: 6, HUAWEI: 4, APPLE: 3 },
      '202608': { SAMSUNG: 18, LENOVO: 12, MI: 10, HONOR: 6, HUAWEI: 4, APPLE: 3 },
    },
    u200_400: {
      '202508': { SAMSUNG: 22, APPLE: 12, MI: 12, LENOVO: 10, HUAWEI: 8, HONOR: 5 },
      '202606': { SAMSUNG: 22, APPLE: 13, MI: 12, LENOVO: 10, HUAWEI: 8, HONOR: 5 },
      '202607': { SAMSUNG: 22, APPLE: 13, MI: 12, LENOVO: 10, HUAWEI: 8, HONOR: 5 },
      '202608': { SAMSUNG: 22, APPLE: 13, MI: 12, LENOVO: 10, HUAWEI: 8, HONOR: 5 },
    },
    u400_700: {
      '202508': { APPLE: 38, SAMSUNG: 22, HUAWEI: 10, LENOVO: 8, MI: 6, HONOR: 3 },
      '202606': { APPLE: 38, SAMSUNG: 22, HUAWEI: 10, LENOVO: 8, MI: 6, HONOR: 3 },
      '202607': { APPLE: 37, SAMSUNG: 22, HUAWEI: 11, LENOVO: 8, MI: 6, HONOR: 3 },
      '202608': { APPLE: 37, SAMSUNG: 22, HUAWEI: 11, LENOVO: 8, MI: 6, HONOR: 3 },
    },
    u700_1000: {
      '202508': { APPLE: 58, SAMSUNG: 20, HUAWEI: 6, LENOVO: 4 },
      '202606': { APPLE: 58, SAMSUNG: 20, HUAWEI: 6, LENOVO: 4 },
      '202607': { APPLE: 57, SAMSUNG: 20, HUAWEI: 7, LENOVO: 4 },
      '202608': { APPLE: 57, SAMSUNG: 20, HUAWEI: 7, LENOVO: 4 },
    },
    u1000_1500: {
      '202508': { APPLE: 72, SAMSUNG: 14, HUAWEI: 4 },
      '202606': { APPLE: 72, SAMSUNG: 14, HUAWEI: 4 },
      '202607': { APPLE: 71, SAMSUNG: 14, HUAWEI: 5 },
      '202608': { APPLE: 71, SAMSUNG: 14, HUAWEI: 5 },
    },
    o1500: {
      '202508': { APPLE: 78, SAMSUNG: 10, HUAWEI: 3 },
      '202606': { APPLE: 78, SAMSUNG: 10, HUAWEI: 3 },
      '202607': { APPLE: 77, SAMSUNG: 10, HUAWEI: 4 },
      '202608': { APPLE: 77, SAMSUNG: 10, HUAWEI: 4 },
    },
  },
};

/** 闭区间逐月枚举（YYYYMM，含首尾） */
function months(start: string, end: string): string[] {
  const out: string[] = [];
  let y = Number(start.slice(0, 4));
  let m = Number(start.slice(4, 6));
  const endY = Number(end.slice(0, 4));
  const endM = Number(end.slice(4, 6));
  while (y < endY || (y === endY && m <= endM)) {
    out.push(`${y}${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

/** 产业清单（预览页产业切换即遍历此表） */
export const MARKET_INDUSTRIES: MarketIndustryData[] = [WEARABLES, PHONES, TABLETS];
