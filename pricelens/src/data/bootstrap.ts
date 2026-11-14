// ============================================================
// 两段式启动的数据前置段（2026-11-14 数据包机制）：mount 前先读 IndexedDB
// 里持久化的数据包并 applyDataPack 原位置换——必须发生在任何数据消费方模块
// 初始化之前（main.tsx 据此动态 import App，App 树全部模块在置换后才加载，
// 各模块级缓存 Map 因此天然一致）。任何失败都回落内置数据（只在控制台警告，
// 不阻塞 mount）。
// ============================================================
import { applyDataPack } from './index';
import { loadDataPack } from './dataPackStore';

export async function applyPersistedDataPack(): Promise<void> {
  try {
    const pack = await loadDataPack();
    if (!pack) return;
    const applied = applyDataPack(pack);
    if (!applied.ok) console.warn('[PriceLens 数据] 持久化数据包无效，已回落内置数据：', applied.error);
  } catch (error) {
    console.warn('[PriceLens 数据] 持久化数据包读取失败，使用内置数据：', error);
  }
}
