// ============================================================
// 自动时间被「非用户路径」退出时的一次性通知信封（2026-11-09 用户反馈：
// Agent 价差卡/预警定位/带 rs=re 的分享链接会静默把自动时间关掉，之后
// 范围不再跟随，用户感知为「自动时间不按逻辑来」却找不到原因）。
// 写侧：AgentContext(Stable).applyFilter 应用含 adaptive:false 的补丁、
// urlSync 读入 rs/re 时 markAutoTimeExit(reason)。
// 读侧：TimeBox 监听 state.adaptive 翻 false 时消费一次——有信封 = 这次
// 退出来自程序路径，显示「已固定时间范围」提示条 + 一键回自动；无信封 =
// 用户自己手选范围，不打扰。用户点「回自动」或重新开自动即清信封。
// ============================================================
export interface AutoTimeExit {
  reason: string;
}

let lastExit: AutoTimeExit | null = null;

export function markAutoTimeExit(reason: string): void {
  lastExit = { reason };
}

export function consumeAutoTimeExit(): AutoTimeExit | null {
  const exit = lastExit;
  lastExit = null;
  return exit;
}

export function clearAutoTimeExit(): void {
  lastExit = null;
}
