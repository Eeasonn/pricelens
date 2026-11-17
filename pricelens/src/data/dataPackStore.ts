// ============================================================
// 数据包持久化（IndexedDB 单键 KV，2026-11-14 Eason「价格数据完全以导入方式
// 承载」）：事实包 8.5 万行解码后 ~6MB、压缩 b64 ~2.8MB，超出 localStorage
// 配额，故用 IndexedDB（file:// 直开在 Chromium/Safari 下同样可用）。
// 优雅降级：浏览器拒绝（隐私模式/配额/file:// 策略）时读侧回 null、写侧返回
// persisted:false——导入仍在当前会话生效（内存置换），UI 据此提示
// 「数据包仅本次会话生效」。每次操作独立开连接（低频操作，无需连接池）。
// ============================================================
import type { AnyPricelensDataPack, LegacyPricelensDataPack, PricelensDataPack } from './index';

const DB_NAME = 'pricelens-data';
const DB_VERSION = 1;
const STORE = 'kv';
const KEY = 'dataPack';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('当前环境不支持 IndexedDB'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 打开失败'));
    request.onblocked = () => reject(new Error('IndexedDB 被其他连接占用'));
  });
}

function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        // 错误/中止路径同样要关连接（2026-11-16 审视修复：此前只有 complete 关，
        // 失败时连接滞留到 GC；低频操作，连不关只是积压，但失败语义要干净）
        const closeAnd = (fn: () => void): void => {
          try { db.close(); } catch { /* 已关 */ }
          fn();
        };
        const request = run(tx.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => closeAnd(() => reject(request.error ?? new Error('IndexedDB 操作失败')));
        tx.oncomplete = () => db.close();
        tx.onabort = () => closeAnd(() => reject(tx.error ?? new Error('IndexedDB 事务中止')));
      }),
  );
}

/** 读取持久化的数据包；无包或环境不可用 = null（回落内置数据） */
export async function loadDataPack(): Promise<AnyPricelensDataPack | null> {
  try {
    const raw = await withStore<AnyPricelensDataPack | undefined>('readonly', (store) => store.get(KEY) as IDBRequest<AnyPricelensDataPack | undefined>);
    return raw ?? null;
  } catch {
    return null;
  }
}

/** 写入数据包；persisted = false 表示环境拒绝持久化（本会话仍生效） */
export async function saveDataPack(pack: PricelensDataPack | LegacyPricelensDataPack): Promise<{ persisted: boolean }> {
  try {
    await withStore('readwrite', (store) => store.put(pack, KEY) as IDBRequest<IDBValidKey>);
    return { persisted: true };
  } catch {
    return { persisted: false };
  }
}

/** 清除持久化数据包（还原内置数据）。返回 cleared = 是否确认删除成功——
 *  false 时 UI 必须如实提示而不是谎报「已还原」（刷新后包会被重新载入，
 *  用户操作与结果相反）。环境不可用视为已清除（本就没有持久化包）。 */
export async function clearDataPack(): Promise<{ cleared: boolean }> {
  try {
    await withStore('readwrite', (store) => store.delete(KEY) as IDBRequest<undefined>);
    return { cleared: true };
  } catch (error) {
    if (error instanceof Error && error.message.includes('不支持 IndexedDB')) return { cleared: true };
    return { cleared: false };
  }
}
