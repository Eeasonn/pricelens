// ============================================================
// Chart 渲染测试共享工具：jsdom 无布局，Chart 依赖 ResizeObserver 派发容器宽度。
// RO 桩异步回调在并行负载下时序不稳，这里轮询等待 geom 就绪（首个 DOM 刻度格出现），
// 避免偶发「图体未渲染」误报。
// ============================================================
export const waitForGeom = async (container: HTMLElement, timeoutMs = 2000): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (container.querySelectorAll('div.tnum').length > 0) return;
    await new Promise((r) => setTimeout(r, 5));
  }
};
