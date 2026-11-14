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

export interface PageSnapshot {
  src: string; // 截图（构建期内嵌 data URL）
  sourceUrl: string; // 采集时的商品页 URL（URL 级绑定）
  capturedAt: string; // 采集时点 ISO（截图实际采集时间，非所选周期日期）
  sourceLabel: string; // 来源商城
  pageLabel: string; // 页面说明
  /** historical = 历史页面证据（须匹配 weekId）；current-page = 后补当前页证据 */
  kind: 'historical' | 'current-page';
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
): { historical: PageSnapshot | null; current: PageSnapshot | null } {
  const key = normalizeUrl(url);
  if (!key) return { historical: null, current: null };
  const pool = [...REGISTRY, ...extra];
  const sameUrl = (r: PageSnapshot): boolean => normalizeUrl(r.sourceUrl) === key;
  const historical = weekId
    ? pool.find((r) => r.kind === 'historical' && r.weekId === weekId && sameUrl(r)) ?? null
    : null;
  const current = pool.find((r) => r.kind === 'current-page' && sameUrl(r)) ?? null;
  return { historical, current };
}
