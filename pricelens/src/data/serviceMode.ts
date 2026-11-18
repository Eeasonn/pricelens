// ============================================================
// 服务模式探测与服务器数据通道（2026-11-18 前后端分离，Eason「Windows 上起
// 本机服务器而不是单 HTML」）：
//  - 启动时 fetch /api/ping 探测本机 Python 服务器（pricelens/server/server.py，
//    端口 8321；dev 下经 vite proxy '/api'）——file:// 直开单文件时相对路径
//    fetch 直接失败 = 离线单文件模式（既有链路零影响）；
//  - 服务模式（内部主力）：数据承载在服务器 SQLite——启动包 GET /api/pack（gzip
//    编码 v2 包，117MB 原表 ≈ 10-20MB）、导入 POST /api/datapack（File 直接做
//    body 流式上传，前端零内存压力——浏览器端 v3 导入 117MB 必崩的根治）；
//  - 单文件模式（兜底保留）：外网演示 / 无 Python 环境，IndexedDB 链路原样。
// ============================================================

let serviceModeDetected: boolean | null = null;

/** 启动探测：/api/ping 2.5s 超时；任何失败（含 file:// 协议拒载）= 离线模式 */
export async function detectServiceMode(): Promise<boolean> {
  if (serviceModeDetected != null) return serviceModeDetected;
  try {
    const controller = new AbortController();
    // 全局 setTimeout（浏览器与 node 测试环境通用；不用 window.setTimeout）
    const timer = setTimeout(() => controller.abort(), 2500);
    try {
      const res = await fetch('/api/ping', { signal: controller.signal, cache: 'no-store' });
      if (res.ok) {
        const info = (await res.json()) as { ok?: unknown };
        serviceModeDetected = info?.ok === true;
        return serviceModeDetected;
      }
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // file:// / 服务器未启动 / 超时——全部静默回落离线模式
  }
  serviceModeDetected = false;
  return false;
}

/** 同步读探测缓存（bootstrap 之后任意时刻；未探测过 = false） */
export function isServiceMode(): boolean {
  return serviceModeDetected === true;
}

/** 服务器最新 v2 包（服务模式启动装载用）；无包/失败 = null（回落 IndexedDB/内置） */
export async function fetchServerPack(): Promise<unknown | null> {
  try {
    const res = await fetch('/api/pack', { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  }
}
