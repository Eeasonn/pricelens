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
import { detectServiceMode, fetchServerPack, watchServerPack } from './serviceMode';
import { LPL } from '../state/lplKeys';

/** 服务模式配置镜像（WP-D）：启动时 GET /api/config → 写入 localStorage 同名键
 *  （读时消费点零改动）。服务器权威：快照缺的段 = 移除本地键（对齐服务器状态），
 *  防本机与服务器漂移。任何失败静默跳过（本地配置仍可用）。
 *  2026-11-18 审计加固：①服务器 config.json 缺失/坏档（返回 {}）≠「显性清空」
 *  ——跳过镜像，不再误删本地 9 键；②dictionaries 段整体缺失时对四个 C3 键
 *  显式 removeItem（与业务规则段的「缺段=移除」不变量对齐）；③4s 超时纪律
 *  （服务器重建中不再白屏阻塞启动）；④待发队列重试（syncConfigToServer 失败
 *  时落 LPL3.config.syncPending，启动时重发——离线/瞬断期间导入的配置不再
 *  被服务器旧配置静默覆盖丢失）。 */
const SYNC_PENDING_KEY = 'LPL3.config.syncPending';

async function mirrorServerConfig(): Promise<void> {
  const store = typeof localStorage !== 'undefined' ? localStorage : null;
  if (!store) return;
  // 待发队列先行：上次同步失败的配置快照重发（成功才清；服务器仍不可达则保留）
  const pending = store.getItem(SYNC_PENDING_KEY);
  if (pending) {
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: pending,
      });
      if (res.ok) store.removeItem(SYNC_PENDING_KEY);
    } catch {
      /* 服务器仍不可达：保留待发，下次启动再试 */
    }
  }
  let cfg: Record<string, unknown> | null = null;
  try {
    const res = await fetch('/api/config', { cache: 'no-store' });
    if (res.ok) cfg = (await res.json()) as Record<string, unknown> | null;
  } catch {
    return; // 服务器未启动 / 超时——本地配置原样保留
  }
  if (!cfg || typeof cfg !== 'object' || Object.keys(cfg).length === 0) {
    return; // 服务器无配置（新装/坏档）≠ 显性清空：不动本地键
  }
  const dicts = (cfg.dictionaries ?? null) as Record<string, unknown> | null;
  const mapping: Array<[string, string, Record<string, unknown> | null]> = [
    [LPL.cfgSeriesRules, 'seriesRules', null],
    [LPL.cfgModelAliases, 'modelAliases', null],
    [LPL.cfgTierLadders, 'tierLadders', null],
    [LPL.cfgPromoRows, 'promoRows', null],
    [LPL.cfgBenchmarkMatrix, 'benchmarkMatrix', null],
    [LPL.cfgCountryAliases, 'countryCodes', dicts],
    [LPL.cfgPlatformAliases, 'platformAliases', dicts],
    [LPL.cfgStoreAliases, 'storeAliases', dicts],
    [LPL.cfgIndustryOfCat, 'industryOfCat', dicts],
  ];
  for (const [key, src, section] of mapping) {
    const value = section != null ? section[src] : cfg[src];
    try {
      if (value == null) store.removeItem(key);
      else store.setItem(key, JSON.stringify(value));
    } catch {
      /* 存储不可用：静默降级 */
    }
  }
}

export async function applyPersistedDataPack(): Promise<void> {
  if (await detectServiceMode()) {
    await mirrorServerConfig();
    try {
      const serverPack = await fetchServerPack();
      if (serverPack) {
        const applied = applyDataPack(serverPack);
        if (applied.ok) {
          // 数据看门：data/ 文件夹被编辑 → 服务器自动重派生 → 刷新载新包；
          // 基线 = 已装载包的 generatedAt（堵「装载与首拍之间重建被吞」窗口）。
          // 应用失败回落 IndexedDB 时不挂看门（数据口径已错位，避免错误刷新）。
          const gen = (serverPack as { generatedAt?: string })?.generatedAt ?? null;
          watchServerPack(typeof gen === 'string' ? gen : null);
          return;
        }
        console.warn('[PriceLens 数据] 服务器数据包无效，回落本机持久化数据：', applied.error);
      }
    } catch (error) {
      console.warn('[PriceLens 数据] 服务器数据包读取失败，回落本机持久化数据：', error);
    }
  }
  // 离线模式：挂离线自愈看门（服务器中途出现自动切入服务模式）——但拿到的是
  // 本地数据基线，传 null 让首拍建立基线
  watchServerPack(null);
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
