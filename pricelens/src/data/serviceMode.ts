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

/** 服务模式数据看门（2026-11-18 Eason「数据文件编辑完前端就变化」）：轮询
 *  /api/ping 的 meta.generatedAt——服务器侧 data/ 文件夹（offers.json/sales.json/
 *  config.json）被编辑后自动重派生、包 generatedAt 变化 → 刷新页面载新包。
 *  仅可见标签页轮询（后台标签不打扰，切回时下一拍刷新）。 */
export function watchServerPack(intervalMs = 15000): void {
  if (typeof window === 'undefined' || serviceModeDetected !== true) return;
  let lastSeen: string | null = null;
  const poll = async (): Promise<void> => {
    if (document.visibilityState !== 'visible') return;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2500);
      try {
        const res = await fetch('/api/ping', { signal: controller.signal, cache: 'no-store' });
        if (!res.ok) return;
        const info = (await res.json()) as { hasPack?: unknown; meta?: { generatedAt?: string } | null };
        if (info?.hasPack !== true) return;
        const gen = info.meta?.generatedAt ?? '';
        if (lastSeen == null) {
          lastSeen = gen; // 首拍只建立基线（启动时装载的即当前包）
          return;
        }
        if (gen !== lastSeen) window.location.reload();
      } finally {
        clearTimeout(timer);
      }
    } catch {
      // 服务器暂不可达：静默，下拍再试
    }
  };
  window.setInterval(poll, intervalMs);
  void poll();
}
