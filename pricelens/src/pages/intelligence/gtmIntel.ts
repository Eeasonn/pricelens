// ============================================================
// GTM 情报工作台 · 数据契约与示例 fixture（t428u Batch3，2026-11-07）
// ----------------------------------------------------------------
// 设计定稿：docs/design/pricelens-t428u-design-20261107.md §6.1/§14、
// docs/design/zcode-briefs/batch3-iterate-gtm.md。
// 五模块（新品 / 竞品 / 渠道 / 价格促销 / 市场事件），每条情报默认 5 要素：
//   ①是什么（title+summary）②哪里（region）③什么时候（eventDate）
//   ④关键变化（change，缺则 null → UI 显示「暂无」）
//   ⑤对 GTM 的意义（gtmMeaning，必须挂证据或标「示例判断」）
// 诚实性纪律（不许伪装实时）：
//   - dataMode='sample' 只代表示例，UI 必须带「示例」徽章；
//   - dataMode='local' 是仓内真实本地数据（如 dim_promo 促销日历）；
//   - dataMode='pending' 是结构占位（渠道模块），绝不填任何伪实时数值。
// 真实图片仅用 Wikimedia Commons 明确 CC0/CC BY/CC BY-SA 授权的本地下载件
// （pricelens/public/gtm-samples/ + ATTRIBUTION.md）；未配图 / 加载失败一律
// 中性灰底缩写 fallback，不画热图不堆渐变。
// ============================================================
import { dimPromo, dimRegion, dimTime } from '../../data';
import type { DimPromo, Granularity, Industry } from '../../dataModel/types';

export type IntelModuleId = 'new-product' | 'competitor' | 'channel' | 'promo' | 'market-event';

/** 条目级数据状态：sample=示例（必带徽章）；local=仓内本地真实数据；pending=待接入结构占位 */
export type IntelDataMode = 'sample' | 'local' | 'pending';

export interface IntelImage {
  /** 本地路径（public/gtm-samples/ 下真实下载件；加载失败走灰底 fallback） */
  src: string;
  alt: string;
  /** 授权署名（作者），与 public/gtm-samples/ATTRIBUTION.md 一致 */
  credit: string;
  /** 许可简称（CC0 / CC BY 4.0 / CC BY-SA 4.0） */
  license: string;
  /** Commons 文件页（溯源 + 许可全文） */
  sourceUrl: string;
}

export interface IntelEvidence {
  /** 来源状态文案（如「演示样例 · 官方发布摘要」）；pending 时为「待接入」 */
  label: string;
  /** 原始链接（真实源接入后才有；示例数据不伪造外链，图片授权链接除外） */
  url?: string;
  /** 采集 / 快照时间 */
  capturedAt?: string;
}

export interface IntelItem {
  id: string;
  module: IntelModuleId;
  dataMode: IntelDataMode;
  /** 品牌大写口径（dimProduct.brand 同源）；fallback 缩写与品牌点用 */
  brand?: string;
  /** 机型名（产品类条目） */
  model?: string;
  title: string;
  summary: string;
  region: string;
  /** 空数组 = 结构性条目，不做国家过滤（渠道占位 / 全局市场事件） */
  countries: string[];
  /** 空数组 = 不限产业（市场级事件） */
  industries: Industry[];
  eventDate: string;
  /** 与筛选时间窗相关的条目给起止周 id（YYYYWW 字典序比较）；缺省 = 常驻 */
  weekIds?: [string, string];
  change: string | null;
  gtmMeaning: string;
  /** 'evidence' = 判断挂仓内证据；'sample' = UI 追加「示例判断」标注 */
  gtmBasis: 'evidence' | 'sample';
  /** 挂证据时的证据描述（gtmBasis='evidence' 必填） */
  evidenceNote?: string;
  image?: IntelImage;
  evidence: IntelEvidence;
}

export interface IntelModuleMeta {
  id: IntelModuleId;
  label: string;
  /** 分区副标题：说清数据现状，不装实时 */
  hint: string;
}

export const INTEL_MODULES: IntelModuleMeta[] = [
  { id: 'new-product', label: '新品', hint: '上市节奏与价格锚 · 示例数据，真实新品源待接入' },
  { id: 'competitor', label: '竞品', hint: '对标档位与价格动作 · 示例数据，动态情报源待接入' },
  { id: 'channel', label: '渠道', hint: '上架 / 下架 / 可见促销位 · 真实采集源待接入（结构占位）' },
  { id: 'promo', label: '价格促销', hint: '促销日历 = 本地数据（dim_promo）+ 促销动作示例' },
  { id: 'market-event', label: '市场事件', hint: '汇率 / 成本 / 需求侧观察 · 示例数据' },
];

export const INTEL_MODULE_LABEL: Record<IntelModuleId, string> = Object.fromEntries(
  INTEL_MODULES.map((m) => [m.id, m.label]),
) as Record<IntelModuleId, string>;

/** dataMode 徽章文案（UI 与测试共用口径） */
export const INTEL_DATA_MODE_LABEL: Record<IntelDataMode, string> = {
  sample: '示例',
  local: '本地',
  pending: '待接入',
};

// ------------------------------------------------------------
// 时间桶工具：任意粒度筛选区间（week/month/quarter 桶 id）统一映射为
// week_id 起止（dimTime 为唯一日历源）；范围标签与旧情报页同口径
// （周 2026W19、月 2026-05、季 2026Q2 原样）。
// ------------------------------------------------------------

function dimTimeIndex(rowId: string, granularity: Granularity): number {
  return dimTime.findIndex((row) =>
    granularity === 'week' ? row.week_id === rowId
      : granularity === 'month' ? row.month_id === rowId
        : row.quarter_id === rowId,
  );
}

/** 筛选区间 → [起始周 id, 结束周 id]（含端点）；非法区间回退整段日历 */
export function weekIdRange(granularity: Granularity, rangeStart: string, rangeEnd: string): [string, string] {
  const start = Math.max(0, dimTimeIndex(rangeStart, granularity));
  const end = dimTimeIndex(rangeEnd, granularity);
  const last = dimTime.length - 1;
  const endIndex = end === -1 ? last : Math.min(end, last);
  return start > endIndex
    ? [dimTime[0].week_id, dimTime[last].week_id]
    : [dimTime[start].week_id, dimTime[endIndex].week_id];
}

export function bucketRangeLabel(granularity: Granularity, rangeStart: string, rangeEnd: string): string {
  const format = (id: string): string => {
    if (!/^\d{6}$/.test(id)) return id;
    if (granularity === 'week') return `${id.slice(0, 4)}W${id.slice(4)}`;
    if (granularity === 'month') return `${id.slice(0, 4)}-${id.slice(4)}`;
    return id;
  };
  const first = format(rangeStart);
  const last = format(rangeEnd);
  return first === last ? first : `${first}–${last}`;
}

// ------------------------------------------------------------
// 演示汇率序列（R国 CBR 周度，与旧情报页同一序列；币种固定 RUB——
// 多国真实汇率序列接入前不随国家拼接，避免把 RUB 数值错标成他币）
// ------------------------------------------------------------
export const FX_WEEKLY = [
  78.4, 77.8, 76.9, 75.4, 74.8, 72.1, 70.7902, 72.2, 74.1, 76.8, 78.5, 80.4,
  82.2, 84.6, 86.9963, 85.9, 84.8, 85.4811, 84, 83.2, 82.1, 81.4, 81, 80.8664,
];

function fxSliceIndexes(granularity: Granularity, rangeStart: string, rangeEnd: string): [number, number] {
  const [startWeek, endWeek] = weekIdRange(granularity, rangeStart, rangeEnd);
  const start = dimTime.findIndex((row) => row.week_id === startWeek);
  const end = dimTime.findIndex((row) => row.week_id === endWeek);
  const last = FX_WEEKLY.length - 1;
  if (start === -1 || end === -1) return [0, last];
  return [Math.max(0, Math.min(start, last)), Math.max(0, Math.min(end, last))];
}

function pctChangeText(start: number, end: number): string {
  const pct = start === 0 ? 0 : ((end - start) / start) * 100;
  return `${pct >= 0 ? '+' : '−'}${Math.abs(pct).toFixed(1)}%`;
}

/** 当前筛选区间上的汇率摘要（数值随 FiltersState 时间窗联动，状态 = 示例） */
export function fxRangeSummary(granularity: Granularity, rangeStart: string, rangeEnd: string): {
  pair: string;
  start: number;
  end: number;
  min: number;
  max: number;
  delta: string;
  rangeLabel: string;
} {
  const [startIdx, endIdx] = fxSliceIndexes(granularity, rangeStart, rangeEnd);
  const slice = FX_WEEKLY.slice(startIdx, endIdx + 1);
  const start = FX_WEEKLY[startIdx];
  const end = FX_WEEKLY[endIdx];
  return {
    pair: 'USD / RUB',
    start,
    end,
    min: Math.min(...slice),
    max: Math.max(...slice),
    delta: pctChangeText(start, end),
    rangeLabel: bucketRangeLabel(granularity, rangeStart, rangeEnd),
  };
}

// ------------------------------------------------------------
// scope 过滤契约：国家 / 产业 / 时间窗（weekIds 与区间做重叠判定）
// ------------------------------------------------------------
export interface IntelScope {
  countryCode: string;
  industry: Industry;
  granularity: Granularity;
  rangeStart: string;
  rangeEnd: string;
}

export function intelItemInScope(item: IntelItem, scope: IntelScope): boolean {
  if (item.countries.length > 0 && !item.countries.includes(scope.countryCode)) return false;
  if (item.industries.length > 0 && !item.industries.includes(scope.industry)) return false;
  if (item.weekIds) {
    const [windowStart, windowEnd] = weekIdRange(scope.granularity, scope.rangeStart, scope.rangeEnd);
    const [itemStart, itemEnd] = item.weekIds;
    // 区间重叠（week_id 字典序比较）；窗内无关联周的判断类条目随窗口收起
    if (itemStart > windowEnd || itemEnd < windowStart) return false;
  }
  return true;
}

export function filterIntelItems(items: IntelItem[], scope: IntelScope): IntelItem[] {
  return items.filter((item) => intelItemInScope(item, scope));
}

// ------------------------------------------------------------
// 本地促销日历（dim_promo，仓内真实数据）→ 价格促销模块条目。
// 仅输出与筛选时间窗重叠的促销窗口；无重叠时该模块只剩示例条目/空态。
// ------------------------------------------------------------
function promoOverlapWindow(promo: DimPromo, scope: IntelScope): boolean {
  const [windowStart, windowEnd] = weekIdRange(scope.granularity, scope.rangeStart, scope.rangeEnd);
  const startWeek = dimTime.find((row) => row.week_id === windowStart);
  const endWeek = dimTime.find((row) => row.week_id === windowEnd);
  if (!startWeek || !endWeek) return true; // 日历异常时保守放行，由 UI 空态兜底
  // 周一日期字符串可直接字典序比较；窗口尾周按周末（+6 天）收口
  const windowEndPlusWeek = addDaysIso(endWeek.week_start_date, 6);
  return promo.end_date >= startWeek.week_start_date && promo.start_date <= windowEndPlusWeek;
}

function addDaysIso(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function countryNameOf(countryCode: string): string {
  return dimRegion.find((row) => row.country_code === countryCode)?.country_name ?? countryCode;
}

export function buildLocalPromoItems(scope: IntelScope): IntelItem[] {
  return dimPromo
    .filter((promo) => promo.country_code === scope.countryCode && promoOverlapWindow(promo, scope))
    .map((promo) => ({
      id: `promo-cal-${promo.promo_id}`,
      module: 'promo' as const,
      dataMode: 'local' as const,
      title: promo.promo_name,
      summary: '本地促销日历窗口事件（全市场口径，不限产业）。',
      region: countryNameOf(promo.country_code),
      countries: [promo.country_code],
      industries: [],
      eventDate: `${promo.start_date} → ${promo.end_date}`,
      change: `促销深度：${promo.depth_hint} · ${promo.platforms ? promo.platforms.join(' / ') : '全渠道'}`,
      gtmMeaning: '促销窗口内的价格线变化需区分促销价与常态价；规则提示，不是销量预测。',
      gtmBasis: 'evidence' as const,
      evidenceNote: `本地促销日历 dim_promo（${promo.country_code} 共 ${dimPromo.filter((p) => p.country_code === promo.country_code).length} 条）`,
      evidence: { label: '本地促销日历 dim_promo', capturedAt: '2026-10-20' },
    }));
}

/** 汇率市场事件条目（数值随筛选区间联动；仍标示例） */
export function buildFxIntelItem(scope: IntelScope): IntelItem | null {
  // RUB 演示序列只服务 R国口径：其他国家不显示（不把 RUB 数值错挂他国）
  if (scope.countryCode !== 'RU') return null;
  const fx = fxRangeSummary(scope.granularity, scope.rangeStart, scope.rangeEnd);
  const easing = fx.delta.startsWith('−') ? '回落' : '上行';
  return {
    id: 'me-fx-rub',
    module: 'market-event',
    dataMode: 'sample',
    title: `USD / RUB 区间${easing}`,
    summary: `选定区间 ${fx.delta}，收于 ${fx.end.toFixed(4)}（区间 ${fx.min.toFixed(4)}–${fx.max.toFixed(4)}）。`,
    region: countryNameOf('RU'),
    countries: ['RU'],
    industries: [],
    eventDate: `区间 ${fx.rangeLabel}`,
    change: fx.delta,
    gtmMeaning: '本币折算压力的背景变量；不能把某一周价格变化直接归因于汇率。',
    gtmBasis: 'sample',
    evidence: { label: `演示 CBR 序列 · ${fx.rangeLabel}` },
  };
}

// ------------------------------------------------------------
// 静态示例 fixture（文案均为示例判断，UI 必须显示「示例」徽章）。
// 刻意保留 np-mate80-ru 一条未配图条目：演示灰底缩写 fallback；
// 加载失败（离线单文件 / 断网）走同一 fallback。
// ------------------------------------------------------------
export const GTM_INTEL_ITEMS: IntelItem[] = [
  // ---------- 新品 ----------
  {
    id: 'np-iphone17-ru',
    module: 'new-product',
    dataMode: 'sample',
    brand: 'APPLE',
    model: 'iPhone 17 Pro',
    title: 'iPhone 17 Pro 首发进入 R国电渠',
    summary: '旗舰档新锚点上市，256GB 起售配置已见于 DNS 产品页。',
    region: 'R国',
    countries: ['RU'],
    industries: ['phone'],
    eventDate: '2026-09-26（W39 首销周）',
    weekIds: ['202636', '202642'],
    change: '首发标价 86 999 ₽（DNS 产品页快照 2026-10-15）',
    gtmMeaning: '高端锚整体上移；上市 4 周内核对 Mate 80 Pro 的档位间距与 RRP 预留。',
    gtmBasis: 'sample',
    image: {
      src: '/gtm-samples/iphone-17-pro.jpg',
      alt: 'Apple iPhone 17 Pro 真机照片（示意）',
      credit: 'Olgierd Rudak',
      license: 'CC0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:IPhone_17_Pro_(2025-12-28).jpg',
    },
    evidence: { label: '演示样例 · 官方发布摘要', capturedAt: '2026-10-30' },
  },
  {
    id: 'np-mate80-ru',
    module: 'new-product',
    dataMode: 'sample',
    brand: 'HUAWEI',
    model: 'Mate 80 Pro',
    title: 'Mate 80 Pro R国上市在即（内部关注）',
    summary: '自有旗舰换代节点临近，渠道铺货与首销资源待锁定。',
    region: 'R国',
    countries: ['RU'],
    industries: ['phone'],
    eventDate: '预计 2026-11（日期待确认）',
    weekIds: ['202640', '202642'],
    change: null, // 刻意无关键变化：UI 显示「暂无」+ 灰底缩写 fallback
    gtmMeaning: '上市前 3–4 周锁定 RRP、首铺量与以旧换新权益；暂不下价格结论。',
    gtmBasis: 'sample',
    evidence: { label: '内部关注项 · 暂无快照' },
  },
  {
    id: 'np-pura80-de',
    module: 'new-product',
    dataMode: 'sample',
    brand: 'HUAWEI',
    model: 'Pura 80 Pro',
    title: 'Pura 80 Pro 德国渠道扩展上市',
    summary: '西欧重点市场高端影像机型进入多渠道销售（切到德国可见，演示国家联动）。',
    region: '德国',
    countries: ['DE'],
    industries: ['phone'],
    eventDate: '2026-06-27（W26 起陆续上架）',
    weekIds: ['202626', '202642'],
    change: '多电渠同步上架 12+512 配置（渠道覆盖待核对）',
    gtmMeaning: '欧洲高端档供给恢复；对比折叠档 Mate X6 的价位衔接再定促销节奏。',
    gtmBasis: 'sample',
    image: {
      src: '/gtm-samples/huawei-pura-80-pro.jpg',
      alt: 'HUAWEI Pura 80 Pro 真机照片（示意）',
      credit: 'Leongyy02',
      license: 'CC BY-SA 4.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Huawei_Pura_80_Pro_Glazed_Red.jpg',
    },
    evidence: { label: '演示样例 · 渠道覆盖待核对', capturedAt: '2026-10-30' },
  },
  // ---------- 竞品 ----------
  {
    id: 'cp-s25u-ru',
    module: 'competitor',
    dataMode: 'sample',
    brand: 'SAMSUNG',
    model: 'Galaxy S25 Ultra',
    title: 'Galaxy S25 Ultra 促销加深',
    summary: 'W42 折后价相对基准下探，促销权益同步加码（示例事件）。',
    region: 'R国',
    countries: ['RU'],
    industries: ['phone'],
    eventDate: '2026-W42',
    weekIds: ['202642', '202642'],
    change: '促销加深 3.5pp（12+256 配置，演示事件行）',
    gtmMeaning: '高端竞品让价窗口内，核对 Mate 80 Pro 上市定价的相对位置。',
    gtmBasis: 'sample',
    image: {
      src: '/gtm-samples/galaxy-s25-ultra.jpg',
      alt: 'Samsung Galaxy S25 Ultra 真机照片（示意）',
      credit: 'Alvis Jean',
      license: 'CC BY-SA 4.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Samsung_Galaxy_S25_Ultra_Titanium_Silverblue.jpg',
    },
    evidence: { label: '演示事件行 · 可回看事实行核对', capturedAt: '2026-10-30' },
  },
  {
    id: 'cp-magic8-ru',
    module: 'competitor',
    dataMode: 'sample',
    brand: 'HONOR',
    model: 'Magic8 Pro',
    title: 'HONOR Magic8 Pro 上架，与 nova 系列价带重叠',
    summary: '新旗舰进入 R国电渠，中高端价带竞争密度上升（示例事件）。',
    region: 'R国',
    countries: ['RU'],
    industries: ['phone'],
    eventDate: '2026-W41',
    weekIds: ['202641', '202642'],
    change: '12+512 到店价与 nova 15 Pro 高配重叠（待核对事实行）',
    gtmMeaning: 'nova 系列促销节奏需避开正面价格冲突，优先看权益差异。',
    gtmBasis: 'sample',
    image: {
      src: '/gtm-samples/honor-magic8-pro.jpg',
      alt: 'HONOR Magic8 Pro 真机照片（示意）',
      credit: 'X-SHLIED',
      license: 'CC BY 4.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:The_back_of_the_Honor_Magic8_Pro.jpg',
    },
    evidence: { label: '演示事件行 · 待核对事实行', capturedAt: '2026-10-30' },
  },
  {
    id: 'cp-mi15u-ru',
    module: 'competitor',
    dataMode: 'sample',
    brand: 'XIAOMI',
    model: 'Xiaomi 15 Ultra',
    title: 'Xiaomi 15 Ultra 高端位供给恢复',
    summary: '超高端安卓供给恢复，ultra 档位可选集变大（示例观察）。',
    region: 'R国',
    countries: ['RU'],
    industries: ['phone'],
    eventDate: '2026-W40',
    weekIds: ['202640', '202642'],
    change: '渠道到货改善（示例观察）',
    gtmMeaning: '超高端档分流的候选解释之一；需与 Apple 上市效应区分，不单独归因。',
    gtmBasis: 'sample',
    image: {
      src: '/gtm-samples/xiaomi-15-ultra.jpg',
      alt: 'Xiaomi 15 Ultra 真机照片（示意）',
      credit: 'Andreas Fuchs / Weber Shandwick',
      license: 'CC BY-SA 4.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Xiaomi_15_Ultra.jpg',
    },
    evidence: { label: '演示观察 · 供给口径待核', capturedAt: '2026-10-30' },
  },
  // ---------- 渠道（结构占位：真实采集源待接入，不填伪数值） ----------
  {
    id: 'ch-visibility-pending',
    module: 'channel',
    dataMode: 'pending',
    title: '渠道上架与可见性监测（结构占位）',
    summary: '平台上架 / 下架、可见促销位与店铺覆盖的真实采集源待接入；接入前不展示任何伪实时数据。',
    region: '当前筛选国家',
    countries: [],
    industries: [],
    eventDate: '—',
    change: null,
    gtmMeaning: '接入后回答三件事：在哪架上 / 什么位置可见 / 覆盖差是否来自采集口径。',
    gtmBasis: 'sample',
    evidence: { label: '待接入' },
  },
  // ---------- 价格促销（本地日历条目由 buildLocalPromoItems 动态生成） ----------
  {
    id: 'pm-offer-text-ru',
    module: 'promo',
    dataMode: 'sample',
    brand: 'APPLE',
    model: 'iPhone 17',
    title: '促销权益文本变化（未计入价格线）',
    summary: '平台 Offer 文案出现赠品权益变化，折后价未动（示例事件）。',
    region: 'R国',
    countries: ['RU'],
    industries: ['phone'],
    eventDate: '2026-W42',
    weekIds: ['202642', '202642'],
    change: '权益文本变化；价格线不变',
    gtmMeaning: 'Offer 只作为关注项，回商品页或快照核对，不进价格事实线。',
    gtmBasis: 'sample',
    evidence: { label: '演示样例 · 快照待核对', capturedAt: '2026-10-30' },
  },
  // ---------- 市场事件 ----------
  {
    id: 'me-dram-4q26',
    module: 'market-event',
    dataMode: 'sample',
    title: '4Q26 DRAM 合约价预测 +10–15%',
    summary: '行业合约价季度环比预测（TrendForce 摘要，行业级观察）。',
    region: '全球（含当前国家）',
    countries: [],
    industries: [],
    eventDate: '2026-09-30（预测发布）',
    weekIds: ['202640', '202642'],
    change: '+10–15%（QoQ 预测区间）',
    gtmMeaning: '只转换为单台成本情景，不能直接把季度涨幅叠加到成本或终端价格。',
    gtmBasis: 'sample',
    evidence: { label: 'TrendForce 摘要 · 2026-09-30', capturedAt: '2026-09-30' },
  },
  {
    id: 'me-premium-search-ru',
    module: 'market-event',
    dataMode: 'sample',
    title: '高端机搜索热度连续 3 周改善',
    summary: '需求侧机会观察（示例序列，非平台事实）。',
    region: 'R国',
    countries: ['RU'],
    industries: [],
    eventDate: '2026-W41',
    weekIds: ['202639', '202642'],
    change: '环比 +8%（示例）',
    gtmMeaning: '需求侧回暖的候选信号；与新品上市效应混合，不能单独归因。',
    gtmBasis: 'sample',
    evidence: { label: '演示情报 · 观察口径', capturedAt: '2026-10-30' },
  },
];

/** 页面装配入口：静态示例 + 本地促销日历 + 汇率动态条目，按 scope 过滤 */
export function intelItemsForScope(scope: IntelScope): IntelItem[] {
  const dynamic: IntelItem[] = [...buildLocalPromoItems(scope)];
  const fx = buildFxIntelItem(scope);
  if (fx) dynamic.push(fx);
  return filterIntelItems([...GTM_INTEL_ITEMS, ...dynamic], scope);
}

/** 模块空态文案：区分「该模块本就待接入」与「当前筛选无条目」 */
export function moduleEmptyReason(module: IntelModuleId): string {
  if (module === 'channel') return '渠道真实采集源待接入——接入前不展示任何伪实时数据。';
  return '当前国家 / 产业 / 时间窗内没有可展示的条目；真实情报源接入后此处显示采集结果。';
}
