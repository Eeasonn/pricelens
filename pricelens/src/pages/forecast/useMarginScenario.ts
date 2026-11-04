// ============================================================
// 量价预测 · ④成本销毛工作区 hook（任务 9 · IA 文档 B.5.10 / 4.3-4.4）：
// MarginScenario 会话持久化（sessionStorage 页签级，键 =
// `forecast.marginScenario.${modelVersion}`，v3 = forecast.marginScenario.
// workbench-demo-v3，按模型版本隔离不串版本）+ 20 步 before/after 撤销 +
// 写入失败显式「未持久化 · 重试」（内存态继续，不静默丢数据，模式与
// useReferenceWorkspace 一致）。
// 本 hook 只承载成本/价格情景，绝不进入 WorkbenchParams / computeWorkbench
// 主链；范围校验（预测周 / horizon 月）由 computeMarginView 归一化统一处理，
// 存储读取只做形状校验（坏 JSON / 错型逐项剔除，永不使页面崩溃）。
// 组件经 useSyncExternalStore 自持快照（antd Modal portal 不随父 props
// 更新——弹层内组件必须自持数据源，既有坑）。
// ============================================================
import { useSyncExternalStore } from 'react';
import type { MonthKey, WeekId } from './workbenchCalendar';
import type { MarginCostOverride, MarginPriceOverride, MarginScenario } from './marginScenarioModel';
import { emptyMarginScenario } from './marginScenarioModel';

/** 撤销历史上限（B.5.10：20 步 before/after）。 */
export const MARGIN_HISTORY_LIMIT = 20;

/** 会话存储键：按模型版本隔离（forecast.marginScenario.workbench-demo-v3）。 */
export function marginScenarioStorageKey(modelVersion: string): string {
  return `forecast.marginScenario.${modelVersion}`;
}

/** 撤销历史条目：整情景 before/after 快照（情景体量小，整存最稳）。 */
export interface MarginScenarioHistoryEntry {
  /** 动作读数（撤销条文案）：成本假设 / 价格手调 / 还原成本 / 清除价格手调 / 还原成本与价格基准。 */
  label: string;
  before: MarginScenario;
  after: MarginScenario;
}

/** 会话工作区：情景 + 20 步撤销历史。 */
export interface MarginScenarioWorkspace {
  scenario: MarginScenario;
  history: MarginScenarioHistoryEntry[];
}

export interface MarginScenarioSnapshot {
  workspace: MarginScenarioWorkspace;
  /** 'ready' = 已持久化；'unpersisted' = 最近一次写入失败（内存态仍有效）。 */
  saveState: 'ready' | 'unpersisted';
}

interface ScenarioStore {
  snapshot: MarginScenarioSnapshot;
  listeners: Set<() => void>;
  loaded: boolean;
}

const stores = new Map<string, ScenarioStore>();

// ---------------- 形状校验（坏 JSON / 错型逐项剔除，不崩溃） ----------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringOf(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** 情景形状校验：错型 / 非有限 / 负成本 / 非正价格逐条剔除（范围校验归一化在视图层）。 */
export function sanitizeMarginScenario(value: unknown): MarginScenario {
  const scenario = emptyMarginScenario();
  if (!isRecord(value)) return scenario;
  const sourceCost = isRecord(value.costOverrides) ? value.costOverrides : {};
  const sourcePrice = isRecord(value.priceOverrides) ? value.priceOverrides : {};
  for (const [monthKey, entry] of Object.entries(sourceCost)) {
    if (!isRecord(entry)) continue;
    const unitCost = finiteNumber(entry.unitCost);
    if (unitCost == null || unitCost < 0) continue;
    scenario.costOverrides[monthKey] = { unitCost, reason: stringOf(entry.reason) };
  }
  for (const [weekId, entry] of Object.entries(sourcePrice)) {
    if (!isRecord(entry)) continue;
    const price = finiteNumber(entry.price);
    if (price == null || price <= 0) continue;
    scenario.priceOverrides[weekId] = { price, reason: stringOf(entry.reason), batchId: stringOf(entry.batchId) };
  }
  return scenario;
}

function sanitizeWorkspace(value: unknown): MarginScenarioWorkspace {
  const scenario = isRecord(value) ? sanitizeMarginScenario(value.scenario) : emptyMarginScenario();
  const history: MarginScenarioHistoryEntry[] = [];
  if (isRecord(value) && Array.isArray(value.history)) {
    for (const entry of value.history) {
      if (!isRecord(entry) || stringOf(entry.label) === '') continue;
      const before = sanitizeMarginScenario(entry.before);
      const after = sanitizeMarginScenario(entry.after);
      history.push({ label: stringOf(entry.label), before, after });
      if (history.length >= MARGIN_HISTORY_LIMIT) break;
    }
  }
  return { scenario, history };
}

// ---------------- 会话存储（读失败兜底 / 写失败显式未持久化） ----------------

function readWorkspace(storageKey: string): MarginScenarioWorkspace {
  try {
    if (typeof sessionStorage === 'undefined') return { scenario: emptyMarginScenario(), history: [] };
    const raw = sessionStorage.getItem(storageKey);
    if (raw == null) return { scenario: emptyMarginScenario(), history: [] };
    return sanitizeWorkspace(JSON.parse(raw));
  } catch {
    return { scenario: emptyMarginScenario(), history: [] };
  }
}

function writeWorkspace(storageKey: string, workspace: MarginScenarioWorkspace): boolean {
  try {
    if (typeof sessionStorage === 'undefined') return false;
    sessionStorage.setItem(storageKey, JSON.stringify(workspace));
    return true;
  } catch {
    return false;
  }
}

function ensureLoaded(store: ScenarioStore, storageKey: string): void {
  if (store.loaded) return;
  store.loaded = true;
  store.snapshot = { workspace: readWorkspace(storageKey), saveState: 'ready' };
}

const emit = (store: ScenarioStore): void => {
  for (const listener of store.listeners) listener();
};

/** 提交内存态 + 尝试持久化；失败置 'unpersisted'（内存态不中断，可重试）。 */
function commit(store: ScenarioStore, storageKey: string, workspace: MarginScenarioWorkspace): void {
  const persisted = writeWorkspace(storageKey, workspace);
  store.snapshot = { workspace, saveState: persisted ? 'ready' : 'unpersisted' };
  emit(store);
}

function getStore(storageKey: string): ScenarioStore {
  let store = stores.get(storageKey);
  if (!store) {
    store = {
      snapshot: { workspace: { scenario: emptyMarginScenario(), history: [] }, saveState: 'ready' },
      listeners: new Set(),
      loaded: false,
    };
    stores.set(storageKey, store);
  }
  return store;
}

const subscribeStore = (storageKey: string) => (listener: () => void): (() => void) => {
  const store = getStore(storageKey);
  store.listeners.add(listener);
  return () => store.listeners.delete(listener);
};

const snapshotOf = (storageKey: string) => (): MarginScenarioSnapshot => {
  const store = getStore(storageKey);
  ensureLoaded(store, storageKey);
  return store.snapshot;
};

/** 撤销历史入栈：20 步上限，超出丢最旧（before/after 快照不可变）。 */
function pushHistory(
  workspace: MarginScenarioWorkspace,
  label: string,
  before: MarginScenario,
  after: MarginScenario,
): MarginScenarioWorkspace {
  return { scenario: after, history: [...workspace.history, { label, before, after }].slice(-MARGIN_HISTORY_LIMIT) };
}

// ---------------- React 绑定 ----------------

export interface UseMarginScenarioResult {
  /** 当前情景（读取经形状校验；范围归一化由 computeMarginView 统一处理）。 */
  scenario: MarginScenario;
  saveState: 'ready' | 'unpersisted';
  /** 写入失败后重试持久化（内存态不变）。 */
  retryPersist: () => void;
  canUndo: boolean;
  undo: () => void;
  /** 最近一次动作读数（撤销条文案；无历史 = null）。 */
  lastAction: string | null;
  /** 成本版本假设（只写④工作区；原因选填；可撤销）。 */
  setCostOverride: (monthKey: MonthKey, unitCost: number, reason: string) => void;
  /** 还原单月成本基准（可撤销）。 */
  clearCostOverride: (monthKey: MonthKey) => void;
  /** 应用价格批次（PriceAdjustDialog 确认后的周价格记录，整批一条历史）。 */
  applyPriceOverrides: (
    entries: Record<WeekId, MarginPriceOverride>,
    meta?: { label?: string },
  ) => void;
  /** 清除某周价格手调（可撤销）。 */
  clearPriceOverride: (weekId: WeekId) => void;
  /** ④独立「还原成本与价格基准」：清空情景（不与参考卡工作区混清；可撤销）。 */
  resetScenario: () => void;
}

export default function useMarginScenario(modelVersion: string): UseMarginScenarioResult {
  const storageKey = marginScenarioStorageKey(modelVersion);
  const snapshot = useSyncExternalStore(subscribeStore(storageKey), snapshotOf(storageKey), snapshotOf(storageKey));
  const workspace = snapshot.workspace;

  const retryPersist = (): void => {
    const store = getStore(storageKey);
    ensureLoaded(store, storageKey);
    commit(store, storageKey, store.snapshot.workspace);
  };

  const undo = (): void => {
    const store = getStore(storageKey);
    ensureLoaded(store, storageKey);
    const current = store.snapshot.workspace;
    if (!current.history.length) return;
    const last = current.history[current.history.length - 1]!;
    commit(store, storageKey, { scenario: last.before, history: current.history.slice(0, -1) });
  };

  const setCostOverride = (monthKey: MonthKey, unitCost: number, reason: string): void => {
    const store = getStore(storageKey);
    ensureLoaded(store, storageKey);
    const current = store.snapshot.workspace;
    if (!Number.isFinite(unitCost) || unitCost < 0) return;
    const before = current.scenario;
    const after: MarginScenario = {
      ...before,
      costOverrides: { ...before.costOverrides, [monthKey]: { unitCost, reason: reason.trim() } },
    };
    commit(store, storageKey, pushHistory(current, '成本假设', before, after));
  };

  const clearCostOverride = (monthKey: MonthKey): void => {
    const store = getStore(storageKey);
    ensureLoaded(store, storageKey);
    const current = store.snapshot.workspace;
    if (current.scenario.costOverrides[monthKey] == null) return;
    const before = current.scenario;
    const costOverrides = { ...before.costOverrides };
    delete costOverrides[monthKey];
    commit(store, storageKey, pushHistory(current, '还原成本', before, { ...before, costOverrides }));
  };

  const applyPriceOverrides = (
    entries: Record<WeekId, MarginPriceOverride>,
    meta?: { label?: string },
  ): void => {
    const store = getStore(storageKey);
    ensureLoaded(store, storageKey);
    const current = store.snapshot.workspace;
    const clean = sanitizeMarginScenario({ costOverrides: current.scenario.costOverrides, priceOverrides: entries });
    if (Object.keys(clean.priceOverrides).length === 0) return;
    const before = current.scenario;
    const after: MarginScenario = {
      ...before,
      priceOverrides: { ...before.priceOverrides, ...clean.priceOverrides },
    };
    commit(store, storageKey, pushHistory(current, meta?.label ?? '价格手调', before, after));
  };

  const clearPriceOverride = (weekId: WeekId): void => {
    const store = getStore(storageKey);
    ensureLoaded(store, storageKey);
    const current = store.snapshot.workspace;
    if (current.scenario.priceOverrides[weekId] == null) return;
    const before = current.scenario;
    const priceOverrides = { ...before.priceOverrides };
    delete priceOverrides[weekId];
    commit(store, storageKey, pushHistory(current, '清除价格手调', before, { ...before, priceOverrides }));
  };

  const resetScenario = (): void => {
    const store = getStore(storageKey);
    ensureLoaded(store, storageKey);
    const current = store.snapshot.workspace;
    const before = current.scenario;
    if (Object.keys(before.costOverrides).length === 0 && Object.keys(before.priceOverrides).length === 0) return;
    commit(store, storageKey, pushHistory(current, '还原成本与价格基准', before, emptyMarginScenario()));
  };

  const lastHistory = workspace.history.length > 0 ? workspace.history[workspace.history.length - 1]! : null;

  return {
    scenario: workspace.scenario,
    saveState: snapshot.saveState,
    retryPersist,
    canUndo: workspace.history.length > 0,
    undo,
    lastAction: lastHistory?.label ?? null,
    setCostOverride,
    clearCostOverride,
    applyPriceOverrides,
    clearPriceOverride,
    resetScenario,
  };
}

/** 测试隔离：丢弃全部内存 store（并清除对应 sessionStorage 键）。 */
export function resetMarginScenarioStoresForTests(): void {
  for (const [storageKey, store] of stores) {
    for (const listener of store.listeners) listener();
    try {
      if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(storageKey);
    } catch {
      /* 清理失败不阻断测试 */
    }
  }
  stores.clear();
}
