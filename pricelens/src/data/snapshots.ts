// ============================================================
// 电商页面快照证据注册表（2026-11-11 页面快照证据绑定）：
// 截图按实际商品 URL 绑定（取代第五十轮的 (店铺, 周) 哈希轮转——无关示例图不再
// 冒充任何商品的历史凭证）。历史截图（kind:'historical'）还须匹配采集周
// （record.weekId === 所选周桶）；后补的当前页面截图（kind:'current-page'）是
// 独立证据类别，不能自动成为历史凭证——快照浮窗对 current 显式提示
// 「非所选周期凭证」。没有匹配就返回空，不制造占位证据。
// 截图旁的 *.source.json 保存采集元数据与 SHA256（取证；本表字段与其同源）。
// 数据接入后历史证据改由 fact.snapshot_url 直读，匹配语义不变。
// ============================================================
import dnsPura90sCurrent from '../assets/snapshots/dns-pura90s-20261111-current.jpg';
import captureMeta from '../assets/snapshots/dns-pura90s-20261111-source.json';
import demoDnsIphone17 from '../assets/snapshots/dns-iphone17.jpg';
import demoMvideoPura80 from '../assets/snapshots/mvideo-pura80.jpg';
import demoMvideoSearch from '../assets/snapshots/mvideo-search.jpg';

export interface PageSnapshot {
  src: string; // 截图（构建期内嵌 data URL）
  sourceUrl: string; // 采集时的商品页 URL（URL 级绑定）
  capturedAt: string; // 采集时点 ISO（截图实际采集时间，非所选周期日期）
  sourceLabel: string; // 来源商城
  pageLabel: string; // 页面说明
  /** historical = 历史页面证据（须匹配 weekId）；current-page = 后补当前页证据；
   *  demo = 模拟占位（第五十轮示例图，2026-11-17 Eason 拍板恢复——显式标注模拟，
   *  绝不冒充真实凭证；真实匹配优先于 demo） */
  kind: 'historical' | 'current-page';
  /** 模拟占位标记（demo 池成员恒 true）；真实证据无此字段 */
  demo?: true;
  /** 历史证据所属统计周（YYYYWW）；current-page 不带 */
  weekId?: string;
  priceText: string; // 截图页面价（原币种，截图当时的页面显示价）
}

/** 当前页面补充证据（2026-11-11 DNS 真实商品深链截图；元数据见同目录 source.json） */
const REGISTRY: PageSnapshot[] = [
  {
    src: dnsPura90sCurrent,
    sourceUrl: captureMeta.url,
    capturedAt: captureMeta.capturedAt,
    sourceLabel: 'DNS',
    pageLabel: 'HUAWEI Pura 90s Pro Max 12/256 Black 商品现页 · 86 499 ₽',
    kind: 'current-page',
    priceText: '86 499 ₽',
  },
];

/** 模拟占位池（第五十轮示例图恢复，2026-11-17 Eason「先把模拟的恢复了」）：
 *  无真实匹配证据时按 (商品 URL + 所选周) 稳定哈希轮转展示一张，浮窗显式标注
 *  「模拟占位」——不冒充真实凭证（2026-11-11 证据绑定原则保留） */
const DEMO_POOL: PageSnapshot[] = [
  {
    src: demoDnsIphone17, sourceUrl: '', capturedAt: '2026-10-18T12:00:00Z',
    sourceLabel: 'DNS', pageLabel: '示例页面截图（模拟占位）', kind: 'current-page', demo: true, priceText: '示例',
  },
  {
    src: demoMvideoPura80, sourceUrl: '', capturedAt: '2026-10-18T12:00:00Z',
    sourceLabel: 'MVIDEO', pageLabel: '示例页面截图（模拟占位）', kind: 'current-page', demo: true, priceText: '示例',
  },
  {
    src: demoMvideoSearch, sourceUrl: '', capturedAt: '2026-10-18T12:00:00Z',
    sourceLabel: 'MVIDEO', pageLabel: '示例搜索页截图（模拟占位）', kind: 'current-page', demo: true, priceText: '示例',
  },
];

/** (URL + 周) 稳定哈希 → 模拟占位池索引（同商品同周恒同一张，第五十轮口径） */
function demoIndexFor(url: string, weekId?: string): number {
  let h = 0;
  const key = `${url}|${weekId ?? ''}`;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h % DEMO_POOL.length;
}

/** URL 归一：只接受 http(s) 商品深链；剥 hash 锚点（同页定位不算换页），
 *  保留 query（同一商品页不同参数视为不同 URL，如 ?sku=512 的变体页）。 */
function normalizeUrl(raw: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  return `${parsed.origin}${parsed.pathname}${parsed.search}`;
}

/** 按商品 URL（+ 历史证据的采集周）匹配页面快照；无匹配恒返回双 null，
 *  绝不轮转占位。extra = 调用方临时注入的证据（测试/未来 fact 直读）。 */
export function snapshotFor(
  url: string,
  weekId?: string,
  extra: PageSnapshot[] = [],
): { historical: PageSnapshot | null; current: PageSnapshot | null; demo: PageSnapshot | null } {
  const key = normalizeUrl(url);
  if (!key) return { historical: null, current: null, demo: null };
  const pool = [...REGISTRY, ...extra];
  const sameUrl = (r: PageSnapshot): boolean => normalizeUrl(r.sourceUrl) === key;
  const historical = weekId
    ? pool.find((r) => r.kind === 'historical' && r.weekId === weekId && sameUrl(r)) ?? null
    : null;
  const current = pool.find((r) => r.kind === 'current-page' && !r.demo && sameUrl(r)) ?? null;
  // 模拟占位（2026-11-17 Eason 恢复）：仅当历史与现页证据皆无真实匹配时给出
  const demo = historical || current
    ? null
    : DEMO_POOL[demoIndexFor(key, weekId)];
  return { historical, current, demo };
}
