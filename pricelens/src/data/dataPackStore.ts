// ============================================================
// 数据包持久化（IndexedDB 单键 KV，2026-11-14 Eason「价格数据完全以导入方式
// 承载」）：事实包 8.5 万行解码后 ~6MB、压缩 b64 ~2.8MB，超出 localStorage
// 配额，故用 IndexedDB（file:// 直开在 Chromium/Safari 下同样可用）。
// 优雅降级：浏览器拒绝（隐私模式/配额/file:// 策略）时读侧回 null、写侧返回
// persisted:false——导入仍在当前会话生效（内存置换），UI 据此提示
// 「数据包仅本次会话生效」。每次操作独立开连接（低频操作，无需连接池）。
// ============================================================
import type { PricelensDataPack } from './index';

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
        const request = run(tx.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('IndexedDB 操作失败'));
        tx.oncomplete = () => db.close();
      }),
  );
}

/** 读取持久化的数据包；无包或环境不可用 = null（回落内置数据） */
export async function loadDataPack(): Promise<PricelensDataPack | null> {
  try {
    const raw = await withStore<PricelensDataPack | undefined>('readonly', (store) => store.get(KEY) as IDBRequest<PricelensDataPack | undefined>);
    return raw ?? null;
  } catch {
    return null;
  }
}

/** 写入数据包；persisted = false 表示环境拒绝持久化（本会话仍生效） */
export async function saveDataPack(pack: PricelensDataPack): Promise<{ persisted: boolean }> {
  try {
    await withStore('readwrite', (store) => store.put(pack, KEY) as IDBRequest<IDBValidKey>);
    return { persisted: true };
  } catch {
    return { persisted: false };
  }
}

/** 清除持久化数据包（还原内置数据）；环境不可用时静默视为已清除 */
export async function clearDataPack(): Promise<void> {
  try {
    await withStore('readwrite', (store) => store.delete(KEY) as IDBRequest<undefined>);
  } catch {
    /* 环境不可用 = 本就没有持久化包 */
  }
}
