// ============================================================
// 量价预测 · 推演工作台 v3 · SI 逐月确认工作区 hook（任务 6 · B.4.3 / B.5.10）：
// useSiConfirmations(modelVersion, siPlanMonthly) →
//   { byMonth, statusOf, confirmMonth, resetMonth, resetAll, saveState, retryPersist }
// - 持久化键 = `forecast.siConfirmation.<modelVersion>`（v3 = workbench-demo-v3），
//   走 usePageViewState 同族 sessionStorage 前缀（LPL3.view.*，页签会话）；
//   数值仍以 params.siPlanMonthly 为准，本工作区只存「确认」事实。
// - 状态（B.4.3）：无记录 = pending（待确认）；记录且 confirmedValue === 当前值 =
//   confirmed（已确认）；记录但值不同 = modified（已修改·待确认，自动回开）。
// - 存储失败不能静默丢数据（B.5.10）：写失败置 saveState='unpersisted'（内存态
//   继续），卡显式「未持久化 · 重试」，retryPersist 重写当前内存态。
// - 读取经 sanitize：坏 JSON / 错型条目逐项剔除（不因一条坏记录崩溃）。
// 红线：本 hook 绝不写 WorkbenchParams / computeWorkbench，也不触发模型重算。
// ============================================================
import { useCallback, useRef, useState } from 'react';
import { VIEW_STATE_PREFIX } from '../../state/usePageViewState';

/** 单月确认事实（B.4.3 SiConfirmation）：确认时的值 + 确认时间（ISO）。 */
export interface SiConfirmation {
  confirmedValue: number;
  confirmedAt: string;
}

/** 确认工作区（B.4.3 SiConfirmationState）：键 = 统一 12 个预测月键。 */
export interface SiConfirmationState {
  byMonth: Record<string, SiConfirmation | undefined>;
}

/** 单月状态（B.4.3）：confirmed = 已确认；modified = 已修改·待确认；pending = 待确认。 */
export type SiMonthStatus = 'confirmed' | 'modified' | 'pending';

/** 持久化状态：ready = 已落 sessionStorage；unpersisted = 最近一次写入失败（内存态仍有效）。 */
export type SiSaveState = 'ready' | 'unpersisted';

export function emptySiConfirmationState(): SiConfirmationState {
  return { byMonth: {} };
}

/** 存储键（含 usePageViewState 同族 LPL3.view. 前缀）：`forecast.siConfirmation.<modelVersion>`。 */
export function siConfirmationKey(modelVersion: string): string {
  return `${VIEW_STATE_PREFIX}forecast.siConfirmation.${modelVersion}`;
}

/** 单月状态派生（B.4.3：当前值 !== confirmedValue 时即使历史确认过也回到待确认）。 */
export function siMonthStatusOf(entry: SiConfirmation | undefined, currentValue: number): SiMonthStatus {
  if (entry == null) return 'pending';
  return entry.confirmedValue === currentValue ? 'confirmed' : 'modified';
}

/** 读回 sanitize：只保留 { confirmedValue: 有限非负数, confirmedAt: 字符串 } 的条目。 */
function sanitizeState(value: unknown): SiConfirmationState {
  if (typeof value !== 'object' || value == null) return emptySiConfirmationState();
  const byMonth = (value as { byMonth?: unknown }).byMonth;
  if (typeof byMonth !== 'object' || byMonth == null) return emptySiConfirmationState();
  const out: SiConfirmationState['byMonth'] = {};
  for (const [key, entry] of Object.entries(byMonth as Record<string, unknown>)) {
    if (typeof entry !== 'object' || entry == null) continue;
    const confirmedValue = (entry as { confirmedValue?: unknown }).confirmedValue;
    const confirmedAt = (entry as { confirmedAt?: unknown }).confirmedAt;
    if (typeof confirmedValue === 'number' && Number.isFinite(confirmedValue) && confirmedValue >= 0
      && typeof confirmedAt === 'string' && confirmedAt !== '') {
      out[key] = { confirmedValue, confirmedAt };
    }
  }
  return { byMonth: out };
}

function readState(modelVersion: string): SiConfirmationState {
  try {
    if (typeof sessionStorage === 'undefined') return emptySiConfirmationState();
    const raw = sessionStorage.getItem(siConfirmationKey(modelVersion));
    if (raw == null) return emptySiConfirmationState();
    return sanitizeState(JSON.parse(raw));
  } catch {
    return emptySiConfirmationState();
  }
}

/** 提交内存态 + 尝试持久化；失败置 'unpersisted'（内存态不中断，B.5.10）。 */
function persist(state: SiConfirmationState, modelVersion: string): SiSaveState {
  try {
    if (typeof sessionStorage === 'undefined') return 'unpersisted';
    sessionStorage.setItem(siConfirmationKey(modelVersion), JSON.stringify(state));
    return 'ready';
  } catch {
    return 'unpersisted';
  }
}

export interface UseSiConfirmationsResult {
  /** 当前确认事实表（键 = 预测月键；无条目 = 该月未确认过）。 */
  byMonth: SiConfirmationState['byMonth'];
  /** 单月状态：value 缺省时取 siPlanMonthly 当前值。 */
  statusOf: (monthKey: string, currentValue?: number) => SiMonthStatus;
  /** 确认某月：写入 { confirmedValue, confirmedAt } 并持久化。 */
  confirmMonth: (monthKey: string, confirmedValue: number) => void;
  /** 清某月确认记录（该月回到待确认；「恢复基准」用）。 */
  resetMonth: (monthKey: string) => void;
  /** 清全部确认记录（页面级「重置基准」用；不清成本价格 / 参考事件工作区）。 */
  resetAll: () => void;
  /** 'ready' = 已持久化；'unpersisted' = 最近一次写入失败。 */
  saveState: SiSaveState;
  /** 重试持久化当前内存态。 */
  retryPersist: () => void;
}

export default function useSiConfirmations(
  modelVersion: string,
  siPlanMonthly: Record<string, number>,
): UseSiConfirmationsResult {
  const [state, setState] = useState<SiConfirmationState>(() => readState(modelVersion));
  const [saveState, setSaveState] = useState<SiSaveState>('ready');
  const stateRef = useRef(state);
  stateRef.current = state;

  const commit = useCallback((next: SiConfirmationState) => {
    stateRef.current = next;
    setState(next);
    setSaveState(persist(next, modelVersion));
  }, [modelVersion]);

  const confirmMonth = useCallback((monthKey: string, confirmedValue: number) => {
    if (typeof confirmedValue !== 'number' || !Number.isFinite(confirmedValue) || confirmedValue < 0) return;
    const prev = stateRef.current;
    commit({
      byMonth: {
        ...prev.byMonth,
        [monthKey]: { confirmedValue: Math.round(confirmedValue), confirmedAt: new Date().toISOString() },
      },
    });
  }, [commit]);

  const resetMonth = useCallback((monthKey: string) => {
    const prev = stateRef.current;
    if (prev.byMonth[monthKey] == null) return;
    const byMonth = { ...prev.byMonth };
    delete byMonth[monthKey];
    commit({ byMonth });
  }, [commit]);

  const resetAll = useCallback(() => {
    commit(emptySiConfirmationState());
  }, [commit]);

  const retryPersist = useCallback(() => {
    setSaveState(persist(stateRef.current, modelVersion));
  }, [modelVersion]);

  const statusOf = useCallback((monthKey: string, currentValue?: number) =>
    siMonthStatusOf(state.byMonth[monthKey], currentValue ?? siPlanMonthly[monthKey] ?? 0), [state.byMonth, siPlanMonthly]);

  return { byMonth: state.byMonth, statusOf, confirmMonth, resetMonth, resetAll, saveState, retryPersist };
}
