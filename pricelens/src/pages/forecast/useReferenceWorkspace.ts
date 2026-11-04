// ============================================================
// 量价参考卡 · 本地工作区 hook（localStorage 持久化作业层）：
// 已保存补录（软删除）/ 预标覆写 / 编辑器未提交草稿（自动保存）/ 撤销历史
// （20 步 before/after patch 重放）/ 写入失败显式「未持久化」状态 + 重试。
// 键 = LPL3.forecast.referenceWorkspace.<scopeKey>（登记见 lplKeys.ts）；
// scopeKey 由模型版本 + 国家 + 产业 + 渠道 + 产品稳定序列化（FNV-1a hash）。
// 读取经 migrateReferenceWorkspace sanitize（坏记录逐条隔离；schemaVersion
// 变化的原始值保留备份键，不直接销毁）。
// 组件经 useSyncExternalStore 自持快照（antd Popover portal 不随父 props
// 更新——弹层内组件必须自持数据源，既有坑）。
// 红线：本工作区绝不进入 WorkbenchParams / computeWorkbench。
// ============================================================
import { useSyncExternalStore } from 'react';
import { LPL } from '../../state/lplKeys';
import {
  emptyReferenceWorkspace,
  migrateReferenceWorkspace,
  newComposedEventId,
  overrideKeyOf,
  presetFingerprint,
  pushReferenceHistory,
  undoLastReferenceAction,
  validateReferenceDraftValue,
  type ComposedReferenceEvent,
  type ReferenceEditorDraft,
  type ReferenceEventEditableFields,
  type ReferenceEventOverride,
  type ReferenceHistoryEntry,
  type ReferenceWorkspace,
  type ReferenceWorkspaceAction,
} from './referenceEventModel';
import type { LifecycleProductSeed } from './workbenchFixture';

// ---------------- scopeKey（稳定序列化） ----------------

/** FNV-1a 32bit hash → hex；稳定、无依赖。 */
export function referenceScopeHash(parts: ReadonlyArray<string>): string {
  const text = parts.join('|');
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function referenceWorkspaceStorageKey(scopeKey: string): string {
  return `${LPL.referenceWorkspace}.${scopeKey}`;
}

// ---------------- 快照 ----------------

export interface ReferenceWorkspaceSnapshot {
  workspace: ReferenceWorkspace;
  /** 'ready' = 已持久化；'unpersisted' = 最近一次写入失败（内存态仍有效）。 */
  saveState: 'ready' | 'unpersisted';
}

interface WorkspaceStore {
  snapshot: ReferenceWorkspaceSnapshot;
  listeners: Set<() => void>;
  loaded: boolean;
}

const stores = new Map<string, WorkspaceStore>();

function ensureLoaded(store: WorkspaceStore, scopeKey: string): void {
  if (store.loaded) return;
  store.loaded = true;
  let workspace = emptyReferenceWorkspace(scopeKey);
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(referenceWorkspaceStorageKey(scopeKey));
      if (raw != null) {
        const migrated = migrateReferenceWorkspace(JSON.parse(raw), scopeKey);
        workspace = migrated.workspace;
        if (migrated.backup != null) {
          // schemaVersion 变化：原始值保留在备份键，不直接销毁
          try {
            localStorage.setItem(`${referenceWorkspaceStorageKey(scopeKey)}.backup`, JSON.stringify(migrated.backup));
          } catch { /* 备份失败不阻断主流程 */ }
        }
      }
    }
  } catch {
    workspace = emptyReferenceWorkspace(scopeKey);
  }
  store.snapshot = { workspace, saveState: 'ready' };
}

const emit = (store: WorkspaceStore): void => {
  for (const listener of store.listeners) listener();
};

/** 提交内存态 + 尝试持久化；失败置 'unpersisted'（内存态不中断）。 */
function commit(store: WorkspaceStore, workspace: ReferenceWorkspace): void {
  let saveState: ReferenceWorkspaceSnapshot['saveState'] = 'ready';
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(referenceWorkspaceStorageKey(workspace.scopeKey), JSON.stringify(workspace));
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
    store = { snapshot: { workspace: emptyReferenceWorkspace(scopeKey), saveState: 'ready' }, listeners: new Set(), loaded: false };
    stores.set(scopeKey, store);
  }
  return store;
}

const subscribeStore = (scopeKey: string) => (listener: () => void): (() => void) => {
  const store = getStore(scopeKey);
  store.listeners.add(listener);
  return () => store.listeners.delete(listener);
};

const getSnapshotOf = (scopeKey: string) => (): ReferenceWorkspaceSnapshot => {
  const store = getStore(scopeKey);
  ensureLoaded(store, scopeKey);
  return store.snapshot;
};

/** 测试隔离：丢弃全部内存 store（localStorage 数据另行清理）。 */
export function resetReferenceWorkspacesForTests(): void {
  stores.clear();
}

// ---------------- React 绑定 ----------------

export function useReferenceWorkspace(scopeKey: string): {
  snapshot: ReferenceWorkspaceSnapshot;
  workspace: ReferenceWorkspace;
  saveState: 'ready' | 'unpersisted';
  retryPersist: () => void;
  undo: () => void;
  canUndo: boolean;
  lastAction: ReferenceWorkspaceAction | null;
  setEditorDraft: (draft: ReferenceEditorDraft) => void;
  clearEditorDraft: (draftId: string) => void;
  createComposed: (productId: string, fields: ReferenceEventEditableFields) => ComposedReferenceEvent;
  editComposed: (eventId: string, fields: ReferenceEventEditableFields) => void;
  deleteComposed: (eventId: string) => void;
  savePresetOverride: (product: LifecycleProductSeed, sourceEventId: string, fields: ReferenceEventEditableFields) => void;
  restorePreset: (product: LifecycleProductSeed, sourceEventId: string) => void;
} {
  const snapshot = useSyncExternalStore(subscribeStore(scopeKey), getSnapshotOf(scopeKey), getSnapshotOf(scopeKey));
  const workspace = snapshot.workspace;

  const retryPersist = (): void => {
    const store = getStore(scopeKey);
    ensureLoaded(store, scopeKey);
    commit(store, store.snapshot.workspace);
  };

  const undo = (): void => {
    const store = getStore(scopeKey);
    ensureLoaded(store, scopeKey);
    commit(store, undoLastReferenceAction(store.snapshot.workspace));
  };

  /** 编辑器草稿自动保存（不参与撤销历史、不 bump revision：未提交内容不入历史）。 */
  const setEditorDraft = (draft: ReferenceEditorDraft): void => {
    const store = getStore(scopeKey);
    ensureLoaded(store, scopeKey);
    commit(store, {
      ...store.snapshot.workspace,
      editorDrafts: { ...store.snapshot.workspace.editorDrafts, [draft.id]: draft },
      updatedAt: new Date().toISOString(),
    });
  };

  /** 保存成功后静默移除编辑器草稿（内容已成为事件，不入撤销历史）。 */
  const clearEditorDraft = (draftId: string): void => {
    const store = getStore(scopeKey);
    ensureLoaded(store, scopeKey);
    const current = store.snapshot.workspace;
    if (!current.editorDrafts[draftId]) return;
    const drafts = { ...current.editorDrafts };
    delete drafts[draftId];
    commit(store, { ...current, editorDrafts: drafts, updatedAt: new Date().toISOString() });
  };

  const createComposed = (productId: string, fields: ReferenceEventEditableFields): ComposedReferenceEvent => {
    const store = getStore(scopeKey);
    ensureLoaded(store, scopeKey);
    const current = store.snapshot.workspace;
    const now = new Date().toISOString();
    const record: ComposedReferenceEvent = {
      id: newComposedEventId(),
      productId,
      typeId: fields.typeId,
      startWeek: fields.startWeek,
      endWeek: fields.endWeek,
      label: fields.label,
      note: fields.note,
      impact: fields.impact,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    const next = pushReferenceHistory(current, {
      action: 'create',
      targetId: record.id,
      before: { composed: { [record.id]: null } },
      after: { composed: { [record.id]: record } },
    });
    commit(store, next);
    return record;
  };

  const editComposed = (eventId: string, fields: ReferenceEventEditableFields): void => {
    const store = getStore(scopeKey);
    ensureLoaded(store, scopeKey);
    const current = store.snapshot.workspace;
    const existing = current.composed[eventId];
    if (!existing || existing.deletedAt != null) return;
    const now = new Date().toISOString();
    const updated: ComposedReferenceEvent = {
      ...existing,
      typeId: fields.typeId,
      startWeek: fields.startWeek,
      endWeek: fields.endWeek,
      label: fields.label,
      note: fields.note,
      impact: fields.impact,
      revision: existing.revision + 1,
      updatedAt: now,
    };
    commit(store, pushReferenceHistory(current, {
      action: 'edit',
      targetId: eventId,
      before: { composed: { [eventId]: existing } },
      after: { composed: { [eventId]: updated } },
    }));
  };

  const deleteComposed = (eventId: string): void => {
    const store = getStore(scopeKey);
    ensureLoaded(store, scopeKey);
    const current = store.snapshot.workspace;
    const existing = current.composed[eventId];
    if (!existing || existing.deletedAt != null) return;
    const now = new Date().toISOString();
    const updated: ComposedReferenceEvent = { ...existing, deletedAt: now, updatedAt: now };
    commit(store, pushReferenceHistory(current, {
      action: 'delete',
      targetId: eventId,
      before: { composed: { [eventId]: existing } },
      after: { composed: { [eventId]: updated } },
    }));
  };

  /** 预标覆写：键 = productId + sourceEventId；保存 baseFingerprint（源更新检测）。 */
  const savePresetOverride = (product: LifecycleProductSeed, sourceEventId: string, fields: ReferenceEventEditableFields): void => {
    const store = getStore(scopeKey);
    ensureLoaded(store, scopeKey);
    const current = store.snapshot.workspace;
    const seed = product.events.find((ev) => ev.id === sourceEventId);
    if (!seed) return;
    const key = overrideKeyOf(product.id, sourceEventId);
    const existing = current.overrides[key];
    const now = new Date().toISOString();
    const baseFingerprint = presetFingerprint(seed);
    const record: ReferenceEventOverride = {
      id: key,
      scopeKey,
      productId: product.id,
      sourceEventId,
      baseFingerprint,
      patch: {
        typeId: fields.typeId,
        startWeek: fields.startWeek,
        endWeek: fields.endWeek,
        label: fields.label,
        note: fields.note,
        impact: fields.impact,
      },
      revision: (existing?.revision ?? 0) + 1,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    commit(store, pushReferenceHistory(current, {
      action: 'edit',
      targetId: key,
      before: { overrides: { [key]: existing ?? null } },
      after: { overrides: { [key]: record } },
    }));
  };

  /** 恢复预标：删除该事件的 override，回到当前 fixture 原值（可撤销）。 */
  const restorePreset = (product: LifecycleProductSeed, sourceEventId: string): void => {
    const store = getStore(scopeKey);
    ensureLoaded(store, scopeKey);
    const current = store.snapshot.workspace;
    const key = overrideKeyOf(product.id, sourceEventId);
    const existing = current.overrides[key];
    if (!existing) return;
    commit(store, pushReferenceHistory(current, {
      action: 'restore-preset',
      targetId: key,
      before: { overrides: { [key]: existing } },
      after: { overrides: { [key]: null } },
    }));
  };

  const lastHistory = workspace.history.length > 0 ? workspace.history[workspace.history.length - 1] : null;

  return {
    snapshot,
    workspace,
    saveState: snapshot.saveState,
    retryPersist,
    undo,
    canUndo: workspace.history.length > 0,
    lastAction: lastHistory?.action ?? null,
    setEditorDraft,
    clearEditorDraft,
    createComposed,
    editComposed,
    deleteComposed,
    savePresetOverride,
    restorePreset,
  };
}

/** 丢弃编辑器草稿（显式清除；带撤销）。导出独立函数供面板层使用。 */
export function discardReferenceEditorDraft(scopeKey: string, draftId: string): void {
  const store = getStore(scopeKey);
  ensureLoaded(store, scopeKey);
  const current = store.snapshot.workspace;
  const draft = current.editorDrafts[draftId];
  if (!draft) return;
  commit(store, pushReferenceHistory(current, {
    action: 'discard-draft',
    targetId: draftId,
    before: { editorDrafts: { [draftId]: draft } },
    after: { editorDrafts: { [draftId]: null } },
  }));
}

/** 草稿提交前校验（label/note/起止周）。 */
export function isDraftSubmittable(value: Parameters<typeof validateReferenceDraftValue>[0]): boolean {
  return validateReferenceDraftValue(value).ok;
}

/** 撤销条文案（卡底轻量操作条）。 */
export function referenceUndoLabel(action: ReferenceHistoryEntry['action'] | null): string | null {
  switch (action) {
    case 'create':
    case 'edit':
      return '已保存事件';
    case 'delete':
      return '已删除事件';
    case 'restore-preset':
      return '已恢复预标';
    case 'discard-draft':
      return '已丢弃草稿';
    case 'clear':
      return '已清空本卡草稿';
    default:
      return null;
  }
}
