// ============================================================
// 两段式启动的数据前置段（2026-11-14 数据包机制）：mount 前先把持久化的数据
// 包 applyDataPack 原位置换——必须发生在任何数据消费方模块初始化之前
// （main.tsx 据此动态 import App，App 树全部模块在置换后才加载，各模块级缓存
// Map 因此天然一致）。任何失败都回落内置数据（只在控制台警告，不阻塞 mount）。
// 2026-11-16 审视修复：apply 失败的包（版本不匹配/内容损坏）永远不会成功载入，
// 留在 IndexedDB 只会每次启动重复失败——顺手清除，让「配置页重新导入」成为
// 唯一恢复路径；读取失败（IDB 不可用等瞬时问题）不动存储。
// 2026-11-18 服务模式（前后端分离）：探测到本机 Python 服务器时优先装载服务器
// 数据包（GET /api/pack，gzip v2 编码包）；优先级 = 服务器包 > IndexedDB 导入包
// > 构建期内置。服务器无包/装载失败继续走 IndexedDB 链（多一层兜底：曾用单文件
// 模式导入过的机器切到服务器模式但尚未导包时，旧包仍优于内置）。
// ============================================================
import { applyDataPack } from './index';
import { clearDataPack, loadDataPack } from './dataPackStore';
import { detectServiceMode, fetchServerPack } from './serviceMode';
import { LPL } from '../state/lplKeys';

/** 服务模式配置镜像（WP-D）：启动时 GET /api/config → 写入 localStorage 同名键
 *  （读时消费点零改动）。服务器权威：快照缺的段 = 移除本地键（对齐服务器状态），
 *  防本机与服务器漂移。任何失败静默跳过（本地配置仍可用）。 */
async function mirrorServerConfig(): Promise<void> {
  try {
    const res = await fetch('/api/config', { cache: 'no-store' });
    if (!res.ok) return;
    const cfg = (await res.json()) as Record<string, unknown> | null;
    if (!cfg || typeof cfg !== 'object') return;
    const dicts = (cfg.dictionaries ?? null) as Record<string, unknown> | null;
    const mapping: Array<[string, string]> = [
      [LPL.cfgSeriesRules, 'seriesRules'],
      [LPL.cfgModelAliases, 'modelAliases'],
      [LPL.cfgTierLadders, 'tierLadders'],
      [LPL.cfgPromoRows, 'promoRows'],
      [LPL.cfgBenchmarkMatrix, 'benchmarkMatrix'],
      [LPL.cfgCountryAliases, dicts ? 'countryCodes' : ''],
      [LPL.cfgPlatformAliases, dicts ? 'platformAliases' : ''],
      [LPL.cfgStoreAliases, dicts ? 'storeAliases' : ''],
      [LPL.cfgIndustryOfCat, dicts ? 'industryOfCat' : ''],
    ];
    const store = (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!store) return;
    for (const [key, src] of mapping) {
      if (!src) continue;
      const value = src === 'countryCodes' || src === 'platformAliases' || src === 'storeAliases' || src === 'industryOfCat'
        ? dicts?.[src]
        : cfg[src];
      try {
        if (value == null) store.removeItem(key);
        else store.setItem(key, JSON.stringify(value));
      } catch {
        /* 存储不可用：静默降级 */
      }
    }
  } catch {
    // 服务器未启动 / 网络问题——静默跳过
  }
}

export async function applyPersistedDataPack(): Promise<void> {
  if (await detectServiceMode()) {
    await mirrorServerConfig();
    try {
      const serverPack = await fetchServerPack();
      if (serverPack) {
        const applied = applyDataPack(serverPack);
        if (applied.ok) return;
        console.warn('[PriceLens 数据] 服务器数据包无效，回落本机持久化数据：', applied.error);
      }
    } catch (error) {
      console.warn('[PriceLens 数据] 服务器数据包读取失败，回落本机持久化数据：', error);
    }
  }
  try {
    const pack = await loadDataPack();
    if (!pack) return;
    const applied = applyDataPack(pack);
    if (!applied.ok) {
      console.warn('[PriceLens 数据] 持久化数据包无效，已回落内置数据：', applied.error);
      await clearDataPack();
    }
  } catch (error) {
    console.warn('[PriceLens 数据] 持久化数据包读取失败，使用内置数据：', error);
  }
}
