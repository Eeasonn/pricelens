// ============================================================
// 电商页面快照注册表（第五十轮）：历史价格点的「取证」改为页面截图展示——
// 历史时点打开商城现页没有意义（价格/上下架早已变化），点击悬停「快照」图标
// 弹窗看采集当时的页面截图，截图上方标注采集日期。
// demo 阶段：三张真实电商截屏（2026-10-15 采集，M.Video ×2 / DNS ×1），
// 按 (店铺, 周) 稳定哈希轮转绑定，保证同一时点恒定同一张；
// 数据接入后本文件替换为 fact.snapshot_url 直读，接口不变。
// ============================================================
import dnsIphone17 from '../assets/snapshots/dns-iphone17.jpg';
import mvideoPura80 from '../assets/snapshots/mvideo-pura80.jpg';
import mvideoSearch from '../assets/snapshots/mvideo-search.jpg';

export interface PageSnapshot {
  src: string; // 截图（构建期内嵌 data URL）
  capturedAt: string; // 采集日期 YYYY-MM-DD
  sourceLabel: string; // 来源商城
  pageLabel: string; // 页面说明
}

const SNAPSHOTS: PageSnapshot[] = [
  {
    src: mvideoPura80,
    capturedAt: '2026-10-15',
    sourceLabel: 'М.Видео',
    pageLabel: 'HUAWEI Pura 80 Pro 12/512 产品页 · 69 999 ₽（−23%）',
  },
  {
    src: mvideoSearch,
    capturedAt: '2026-10-15',
    sourceLabel: 'М.Видео',
    pageLabel: 'Pura 80 系列搜索结果页 · 全系在架价',
  },
  {
    src: dnsIphone17,
    capturedAt: '2026-10-15',
    sourceLabel: 'DNS',
    pageLabel: 'Apple iPhone 17 256GB 产品页 · 86 999 ₽',
  },
];

/** 稳定轮转：同一 (店铺, 周) 恒定取同一张快照（确定性，刷新/换机一致） */
export function snapshotFor(shopName: string | null, weekId: string): PageSnapshot {
  const key = `${shopName ?? ''}|${weekId}`;
  let h = 5381;
  for (let i = 0; i < key.length; i++) h = ((h * 33) ^ key.charCodeAt(i)) >>> 0;
  return SNAPSHOTS[h % SNAPSHOTS.length];
}
