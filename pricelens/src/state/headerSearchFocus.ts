// ============================================================
// 页头快速搜索的聚焦句柄（2026-11-27 · 搜索框 = Agent 快速筛选入口）：
// ⌘/Ctrl+K 在页头搜索已挂载（价格走势页）时聚焦并展开搜索，其余页面仍打开
// Agent 对话面板。搜索组件挂载时登记句柄、卸载时注销；AgentContext 的全局
// 快捷键先问这里，未登记再走 openAgent('dock')。模块级单例：同一时刻只有一个页头。
// ============================================================
type FocusHandle = () => void;

let handle: FocusHandle | null = null;

/** 登记页头搜索的聚焦函数；返回注销函数（只注销自己登记的那一个）。 */
export function registerHeaderSearch(focus: FocusHandle): () => void {
  handle = focus;
  return () => {
    if (handle === focus) handle = null;
  };
}

/** 页头搜索已挂载 → 聚焦并返回 true；否则返回 false（调用方回落到 Agent 面板）。 */
export function focusHeaderSearch(): boolean {
  if (!handle) return false;
  handle();
  return true;
}
