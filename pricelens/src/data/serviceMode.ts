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
// 2026-11-18 审计加固：探测失败不再永久缓存（watchServerPack 双向自愈——离线
// 模式下服务器中途出现也会自动切入）；所有 fetch 带超时纪律（探测/轮询 2.5s、
// 启动拉包/镜像 4s、导入上传 5 分钟上限）；轮询幂等护栏；重建中（rebuilding）
// 跳过基线对比，防止把「重建完成前的旧包」当成基线。
// ============================================================

let serviceModeDetected: boolean | null = null;
let watcherStarted = false;

const fetchWithTimeout = async (url: string, ms: number, init?: RequestInit): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' });
  } finally {
    clearTimeout(timer);
  }
};

/** 启动探测：/api/ping 2.5s 超时；任何失败（含 file:// 协议拒载）= 离线模式。
 *  结果仅作本次会话初值——离线模式下 watchServerPack 会持续重探（服务器中途
 *  出现自动切入服务模式），不再永久缓存。 */
export async function detectServiceMode(): Promise<boolean> {
  if (serviceModeDetected != null) return serviceModeDetected;
  try {
    const res = await fetchWithTimeout('/api/ping', 2500);
    if (res.ok) {
      const info = (await res.json()) as { ok?: unknown };
      serviceModeDetected = info?.ok === true;
      return serviceModeDetected;
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
    const res = await fetchWithTimeout('/api/pack', 4000);
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  }
}

/** 服务模式数据看门（2026-11-18 Eason「数据文件编辑完前端就变化」）：
 *  - 服务模式：轮询 /api/ping 的 meta.generatedAt 与**已装载包**的基线对比
 *    （基线由调用方传入，堵「启动装载与首拍之间发生重建被吞」的窗口）；
 *    rebuilding=true（服务器后台重建中）跳过——等完成后下拍再比；
 *    变化 → 刷新页面载新包。仅可见标签页轮询。
 *  - 离线模式（探测失败过）：持续重探——服务器中途启动/从挂死恢复时自动
 *    reload 切入服务模式（修复审计「探测负结果永久缓存 × 服务器恢复不可达」）。
 *  幂等：watcherStarted 护栏，重复调用只挂一个 interval。 */
/** 页面是否有打开的浮层（antd Modal/Drawer/Popover/Dropdown）——有则不自动
 *  reload（销毁进行中的预览/编辑），改顶栏横幅让用户点刷新（2026-11-18 审计
 *  挂账「reload 无用户协商」） */
function hasBlockingOverlay(): boolean {
  try {
    const visible = (el: Element): boolean => {
      const s = getComputedStyle(el);
      return s.display !== 'none' && s.visibility !== 'hidden';
    };
    if (Array.from(document.querySelectorAll('.ant-modal-wrap')).some(visible)) return true;
    if (document.querySelector('.ant-drawer-open')) return true;
    if (Array.from(document.querySelectorAll('.ant-popover:not(.ant-popover-hidden)')).some(visible)) return true;
    if (document.querySelector('.ant-dropdown-open')) return true;
    return false;
  } catch {
    return false;
  }
}

/** 顶栏刷新横幅（幂等）：「服务器数据已更新」+ 立即刷新按钮 */
function showRefreshBanner(): void {
  if (document.getElementById('lpl-server-refresh-banner')) return;
  const bar = document.createElement('div');
  bar.id = 'lpl-server-refresh-banner';
  bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;gap:12px;padding:10px 16px;background:#1f3864;color:#fff;font-size:13px;font-family:system-ui,-apple-system,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,0.25);';
  const text = document.createElement('span');
  text.textContent = '服务器数据已更新（data/ 文件变更已重新派生）';
  const btn = document.createElement('button');
  btn.textContent = '立即刷新';
  btn.style.cssText = 'padding:4px 14px;border:1px solid rgba(255,255,255,0.6);background:transparent;color:#fff;font-size:13px;border-radius:4px;cursor:pointer;';
  btn.onclick = (): void => window.location.reload();
  bar.append(text, btn);
  document.body.prepend(bar);
}

export function watchServerPack(baselineGeneratedAt: string | null, intervalMs = 15000): void {
  if (typeof window === 'undefined' || watcherStarted) return;
  watcherStarted = true;
  let lastGen: string | null = baselineGeneratedAt ?? null;
  const poll = async (): Promise<void> => {
    if (document.visibilityState !== 'visible') return;
    try {
      const res = await fetchWithTimeout('/api/ping', 2500);
      if (!res.ok) return;
      const info = (await res.json()) as {
        ok?: unknown;
        hasPack?: unknown;
        rebuilding?: unknown;
        meta?: { generatedAt?: string } | null;
      };
      if (info?.ok !== true) return;
      if (serviceModeDetected !== true) {
        // 离线模式自愈：服务器出现了（有数据源即值得切入服务模式）→ 重载
        if (info.hasPack === true) window.location.reload();
        return;
      }
      if (info.rebuilding === true) return; // 后台重建中：等完成，不比对旧包
      if (info.hasPack !== true) return;
      const gen = info.meta?.generatedAt ?? '';
      if (!gen) return;
      if (lastGen == null) {
        lastGen = gen; // 未传基线（兜底）：首拍建立基线
        return;
      }
      if (gen !== lastGen) {
        if (hasBlockingOverlay()) showRefreshBanner(); // 浮层打开中：横幅协商，不打断
        else window.location.reload();
      }
    } catch {
      // 服务器暂不可达：静默，下拍再试
    }
  };
  window.setInterval(poll, intervalMs);
  void poll();
}
