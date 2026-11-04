// ============================================================
// 量价预测 · v3 情报候选审核工作区 hook（forecast-global-ia-review 附录 B.4.3 /
// B.4.8 / B.5.10 / 任务 8）：候选状态机（new/removed/editing/accepted/rejected）
// + 编辑草稿 + 已应用事件链接（appliedEventIds）+ 批次号（batchId）+ 20 步
// before/after 撤销；本地持久化 LPL3.forecast.intelligenceReview.<scopeHash>
// （登记见 lplKeys.ts；scopeHash 口径同 referenceWorkspace：模型版本 + 国家 +
// 产业 + 渠道 + 产品稳定序列化，v2/v3 不串工作区）。
// localStorage 写入失败不静默丢数据：内存态继续，saveState = 'unpersisted'，
// 卡显式「未持久化 · 重试」（retryPersist），模式同 useReferenceWorkspace。
// 读取经 sanitize：坏 JSON 整体回空、坏候选逐条隔离（schemaVersion 变化的
// 原始值保留备份键，不直接销毁）；单条坏候选不致整页崩溃。
// 撤销 = 重放该条/该批次 before 补丁，不回滚后续无关编辑（B.4.8）；
// 事件数值本身仍走页面 params setter（任务 10 接线），本工作区只保存
// 候选状态与事件链接——来源映射绝不进入 WorkbenchParams。
// 红线：本工作区绝不进入 WorkbenchParams / computeWorkbench。
// ============================================================
import { useSyncExternalStore } from 'react';
import { LPL } from '../../state/lplKeys';
import type { CandidateReview, EventRecommendation, IntelligenceReviewState } from './intelligenceModel';

export const INTELLIGENCE_REVIEW_HISTORY_MAX = 20;
const SCHEMA_VERSION = 1;

/** 撤销历史条目（B.4.8 before/after 补丁）：按 candidateId 的状态补丁。 */
export interface IntelligenceHistoryEntry {
  action: 'status' | 'draft' | 'apply' | 'batch';
  label: string;
  candidateIds: string[];
  batchId: string | null;
  before: Record<string, CandidateReview | undefined>;
  after: Record<string, CandidateReview | undefined>;
}

/** 审核工作区持久化形态。 */
export interface IntelligenceReviewWorkspace {
  scopeKey: string;
  schemaVersion: number;
  byCandidate: Record<string, CandidateReview | undefined>;
  history: IntelligenceHistoryEntry[];
  updatedAt: string;
}

export function intelligenceReviewStorageKey(scopeKey: string): string {
  return `${LPL.intelligenceReview}.${scopeKey}`;
}

/** 空工作区。 */
export function emptyIntelligenceWorkspace(scopeKey: string): IntelligenceReviewWorkspace {
  return { scopeKey, schemaVersion: SCHEMA_VERSION, byCandidate: {}, history: [], updatedAt: '' };
}

const STATUS_VALUES: ReadonlyArray<CandidateReview['status']> = ['new', 'removed', 'editing', 'accepted', 'rejected'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value);
}

/** 候选审核条目 sanitize：错型/未知状态逐条回退 new，不致整页崩溃。 */
function sanitizeCandidateReview(value: unknown): CandidateReview | null {
  if (!isRecord(value)) return null;
  const status = STATUS_VALUES.includes(value.status as CandidateReview['status'])
    ? (value.status as CandidateReview['status'])
    : 'new';
  const draft = isRecord(value.draft) ? (value.draft as unknown as EventRecommendation) : null;
  const appliedEventIds = Array.isArray(value.appliedEventIds)
    ? value.appliedEventIds.filter((id): id is string => typeof id === 'string')
    : [];
  return {
    status,
    draft,
    appliedEventIds,
    batchId: typeof value.batchId === 'string' ? value.batchId : null,
    reviewedAt: typeof value.reviewedAt === 'string' ? value.reviewedAt : null,
  };
}

/** 工作区 sanitize（读取路径）：坏 JSON → 空；schema 不识别 → 备份原始值。 */
export function migrateIntelligenceWorkspace(
  raw: unknown,
  scopeKey: string,
): { workspace: IntelligenceReviewWorkspace; backup: unknown | null } {
  if (!isRecord(raw)) return { workspace: emptyIntelligenceWorkspace(scopeKey), backup: null };
  if (raw.schemaVersion !== SCHEMA_VERSION) {
    return { workspace: emptyIntelligenceWorkspace(scopeKey), backup: raw };
  }
  const byCandidate: Record<string, CandidateReview | undefined> = {};
  if (isRecord(raw.byCandidate)) {
    for (const [candidateId, entry] of Object.entries(raw.byCandidate)) {
      const clean = sanitizeCandidateReview(entry);
      if (clean != null) byCandidate[candidateId] = clean;
    }
  }
  const history = Array.isArray(raw.history)
    ? raw.history.filter(isRecord).map((entry) => ({
      action: (['status', 'draft', 'apply', 'batch'] as const).includes(entry.action as IntelligenceHistoryEntry['action'])
        ? (entry.action as IntelligenceHistoryEntry['action'])
        : 'status',
      label: typeof entry.label === 'string' ? entry.label : '',
      candidateIds: Array.isArray(entry.candidateIds) ? entry.candidateIds.filter((id): id is string => typeof id === 'string') : [],
      batchId: typeof entry.batchId === 'string' ? entry.batchId : null,
      before: isRecord(entry.before) ? (entry.before as Record<string, CandidateReview | undefined>) : {},
      after: isRecord(entry.after) ? (entry.after as Record<string, CandidateReview | undefined>) : {},
    }))
    : [];
  return {
    workspace: {
      scopeKey,
      schemaVersion: SCHEMA_VERSION,
      byCandidate,
      history: history.slice(-INTELLIGENCE_REVIEW_HISTORY_MAX),
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : '',
    },
    backup: null,
  };
}

// ---------------- 模块级 store（同 reference 模式；useSyncExternalStore 自持） ----------------

export interface IntelligenceReviewSnapshot {
  workspace: IntelligenceReviewWorkspace;
  /** 'ready' = 已持久化；'unpersisted' = 最近一次写入失败（内存态仍有效）。 */
  saveState: 'ready' | 'unpersisted';
}

interface WorkspaceStore {
  snapshot: IntelligenceReviewSnapshot;
  listeners: Set<() => void>;
  loaded: boolean;
}

const stores = new Map<string, WorkspaceStore>();

function ensureLoaded(store: WorkspaceStore, scopeKey: string): void {
  if (store.loaded) return;
  store.loaded = true;
  let workspace = emptyIntelligenceWorkspace(scopeKey);
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(intelligenceReviewStorageKey(scopeKey));
      if (raw != null) {
        const migrated = migrateIntelligenceWorkspace(JSON.parse(raw), scopeKey);
        workspace = migrated.workspace;
        if (migrated.backup != null) {
          try {
            localStorage.setItem(`${intelligenceReviewStorageKey(scopeKey)}.backup`, JSON.stringify(migrated.backup));
          } catch { /* 备份失败不阻断主流程 */ }
        }
      }
    }
  } catch {
    workspace = emptyIntelligenceWorkspace(scopeKey);
  }
  store.snapshot = { workspace, saveState: 'ready' };
}

const emit = (store: WorkspaceStore): void => {
  for (const listener of store.listeners) listener();
};

/** 提交内存态 + 尝试持久化；失败置 'unpersisted'（内存态不中断，显式可重试）。 */
function commit(store: WorkspaceStore, workspace: IntelligenceReviewWorkspace): void {
  let saveState: IntelligenceReviewSnapshot['saveState'] = 'ready';
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(intelligenceReviewStorageKey(workspace.scopeKey), JSON.stringify(workspace));
    }
  } catch {
    saveState = 'unpersisted';
  }
  store.snapshot = { workspace, saveState };
  emit(store);
}

function getStore(scopeKey: string): WorkspaceStore {
  let store = stores.get(scopeKey);
  if (!store) {
    store = {
      snapshot: { workspace: emptyIntelligenceWorkspace(scopeKey), saveState: 'ready' },
      listeners: new Set(),
      loaded: false,
    };
    stores.set(scopeKey, store);
  }
  return store;
}

const subscribeStore = (scopeKey: string) => (listener: () => void): (() => void) => {
  const store = getStore(scopeKey);
  store.listeners.add(listener);
  return () => store.listeners.delete(listener);
};

const getSnapshotOf = (scopeKey: string) => (): IntelligenceReviewSnapshot => {
  const store = getStore(scopeKey);
  ensureLoaded(store, scopeKey);
  return store.snapshot;
};

/** 测试隔离：丢弃全部内存 store（localStorage 数据另行清理）。 */
export function resetIntelligenceReviewForTests(): void {
  stores.clear();
}

/** 默认候选状态（B.4.3）：new、无草稿、无落点。 */
export function newCandidateReview(): CandidateReview {
  return { status: 'new', draft: null, appliedEventIds: [], batchId: null, reviewedAt: null };
}

/** 推入撤销历史（≤20 步，尾部最新；同批多条候选 = 一个动作一个条目）。 */
function pushHistory(
  workspace: IntelligenceReviewWorkspace,
  entry: IntelligenceHistoryEntry,
): IntelligenceReviewWorkspace {
  const history = [...workspace.history, entry].slice(-INTELLIGENCE_REVIEW_HISTORY_MAX);
  return { ...workspace, history, updatedAt: new Date().toISOString() };
}

function patchCandidates(
  workspace: IntelligenceReviewWorkspace,
  patch: Record<string, CandidateReview | undefined>,
): IntelligenceReviewWorkspace {
  return { ...workspace, byCandidate: { ...workspace.byCandidate, ...patch } };
}

// ---------------- React 绑定 ----------------

export type CandidateStatus = CandidateReview['status'];

/**
 * 情报候选审核工作区（B.5.10：浏览器本地持久化 + 20 步 before/after 撤销）。
 * 页面级持有（任务 10 接线 ForecastPage）；面板经 reviewState + onReviewChange
 * 受控消费。scopeHash = referenceScopeHash([modelVersion, country, industry,
 * channel, product])（同一稳定序列化，v2/v3 不串工作区）。
 */
export function useIntelligenceReview(scopeKey: string): {
  reviewState: IntelligenceReviewState;
  saveState: 'ready' | 'unpersisted';
  retryPersist: () => void;
  undo: () => void;
  canUndo: boolean;
  lastActionLabel: string | null;
  /** 设置候选状态（removed/rejected/new…；reason 选填记入草稿备注位）。 */
  setStatus: (candidateId: string, status: CandidateStatus, opts?: { reason?: string }) => void;
  /** 保存编辑草稿并转入 editing（审核弹层关闭不丢草稿）。 */
  setDraft: (candidateId: string, draft: EventRecommendation) => void;
  /** 单条应用：accepted + 事件链接 + 批次号（一个撤销动作）。 */
  applyCandidate: (candidateId: string, eventId: string, batchId: string) => void;
  /** 批次应用：多条候选共享同一 batchId，整批一个撤销动作（原子批次）。 */
  applyBatch: (entries: Array<{ candidateId: string; eventId: string }>, batchId: string) => void;
} {
  const snapshot = useSyncExternalStore(subscribeStore(scopeKey), getSnapshotOf(scopeKey), getSnapshotOf(scopeKey));
  const workspace = snapshot.workspace;

  const retryPersist = (): void => {
    const store = getStore(scopeKey);
    ensureLoaded(store, scopeKey);
    commit(store, store.snapshot.workspace);
  };

  /** 撤销最近一个动作：只重放该条/该批次的 before 补丁，不动后续无关编辑。 */
  const undo = (): void => {
    const store = getStore(scopeKey);
    ensureLoaded(store, scopeKey);
    const current = store.snapshot.workspace;
    const last = current.history[current.history.length - 1];
    if (last == null) return;
    const byCandidate = { ...current.byCandidate };
    for (const [candidateId, before] of Object.entries(last.before)) {
      if (before == null) delete byCandidate[candidateId];
      else byCandidate[candidateId] = before;
    }
    commit(store, { ...current, byCandidate, history: current.history.slice(0, -1), updatedAt: new Date().toISOString() });
  };

  const setStatus = (candidateId: string, status: CandidateStatus, opts?: { reason?: string }): void => {
    const store = getStore(scopeKey);
    ensureLoaded(store, scopeKey);
    const current = store.snapshot.workspace;
    const before = current.byCandidate[candidateId] ?? newCandidateReview();
    const reason = opts?.reason?.trim() ?? '';
    const after: CandidateReview = {
      ...before,
      status,
      draft: before.draft ?? null,
      reviewedAt: status === 'accepted' ? new Date().toISOString() : before.reviewedAt,
    };
    if (reason !== '') {
      // 拒绝/移除原因选填：附加到草稿 rationale 尾部备注（原文情报不改动）。
      after.draft = after.draft != null ? { ...after.draft, rationale: reason } : after.draft;
    }
    commit(store, pushHistory(patchCandidates(current, { [candidateId]: after }), {
      action: 'status',
      label: status,
      candidateIds: [candidateId],
      batchId: null,
      before: { [candidateId]: before },
      after: { [candidateId]: after },
    }));
  };

  const setDraft = (candidateId: string, draft: EventRecommendation): void => {
    const store = getStore(scopeKey);
    ensureLoaded(store, scopeKey);
    const current = store.snapshot.workspace;
    const before = current.byCandidate[candidateId] ?? newCandidateReview();
    const after: CandidateReview = { ...before, status: 'editing', draft };
    commit(store, pushHistory(patchCandidates(current, { [candidateId]: after }), {
      action: 'draft',
      label: '草稿',
      candidateIds: [candidateId],
      batchId: null,
      before: { [candidateId]: before },
      after: { [candidateId]: after },
    }));
  };

  const applyCandidate = (candidateId: string, eventId: string, batchId: string): void => {
    applyBatch([{ candidateId, eventId }], batchId);
  };

  /** 原子批次：同批候选共享 batchId；任一项失败语义由调用方先 validate 保证
   *  （B.4.8：任何单项失败则整批不写入——面板批量确认前逐项校验）。 */
  const applyBatch = (entries: Array<{ candidateId: string; eventId: string }>, batchId: string): void => {
    const store = getStore(scopeKey);
    ensureLoaded(store, scopeKey);
    const current = store.snapshot.workspace;
    const now = new Date().toISOString();
    const before: Record<string, CandidateReview | undefined> = {};
    const after: Record<string, CandidateReview | undefined> = {};
    const patch: Record<string, CandidateReview | undefined> = {};
    for (const { candidateId, eventId } of entries) {
      const previous = current.byCandidate[candidateId] ?? newCandidateReview();
      before[candidateId] = previous;
      const next: CandidateReview = {
        status: 'accepted',
        draft: previous.draft,
        appliedEventIds: [...previous.appliedEventIds, eventId],
        batchId,
        reviewedAt: now,
      };
      after[candidateId] = next;
      patch[candidateId] = next;
    }
    commit(store, pushHistory(patchCandidates(current, patch), {
      action: entries.length > 1 ? 'batch' : 'apply',
      label: entries.length > 1 ? `批次 ${batchId}（${entries.length} 条）` : `应用 ${entries[0]?.eventId ?? ''}`,
      candidateIds: entries.map((entry) => entry.candidateId),
      batchId,
      before,
      after,
    }));
  };

  const lastEntry = workspace.history.length > 0 ? workspace.history[workspace.history.length - 1] : null;

  return {
    reviewState: { byCandidate: workspace.byCandidate },
    saveState: snapshot.saveState,
    retryPersist,
    undo,
    canUndo: workspace.history.length > 0,
    lastActionLabel: lastEntry?.label ?? null,
    setStatus,
    setDraft,
    applyCandidate,
    applyBatch,
  };
}
