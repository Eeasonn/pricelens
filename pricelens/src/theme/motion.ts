// 减少动态效果统一入口（第一百八十五轮，外部 UX 审计）：
// CSS 侧由 index.css 的 prefers-reduced-motion 全局块降级；JS 侧动画
// （图表高度动画、behavior:'smooth' 滚动）从这里取值，保证系统设置在
// 两类动画上同样生效。取值即时读取，不做订阅（动画触发都是一次性动作）。
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** JS 滚动行为：开启减少动态效果时退回瞬时跳转，否则平滑滚动 */
export function scrollBehaviorOf(): 'smooth' | 'auto' {
  return prefersReducedMotion() ? 'auto' : 'smooth';
}
