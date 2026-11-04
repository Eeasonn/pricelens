// ============================================================
// useReferenceWorkspace（localStorage 工作区）单测（jsdom）：
// 持久化往返（刷新恢复：丢内存缓存后按 localStorage 读回）、revision 递增、
// 撤销 before/after patch（连续 create A + B 后撤销不清掉 A）、软删除 + 撤销
// 恢复、预标覆写（baseFingerprint）+ 恢复预标 + 撤销、编辑器草稿自动保存
// （未提交内容不进撤销历史）与丢弃（带撤销）、写入失败显式「未持久化」+
// 重试、scopeHash 稳定、未来 schemaVersion 原始值落备份键。
// jsdom 自带 localStorage；仍装防御性内存桩（历史坑），测试间清库 + 清缓存。
// ============================================================
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { LifecycleProductSeed } from '../workbenchFixture';
import {
  referenceScopeHash,
  referenceUndoLabel,
  resetReferenceWorkspacesForTests,
  referenceWorkspaceStorageKey,
  useReferenceWorkspace,
  discardReferenceEditorDraft,
} from '../useReferenceWorkspace';

const SCOPE = 'scope-test';
const KEY = referenceWorkspaceStorageKey(SCOPE);

const product: LifecycleProductSeed = {
  id: 'lc-test',
  label: 'Test（上一代）',
  brand: 'HUAWEI',
  launchWeekLabel: '2025-W02',
  points: new Array(52).fill(1000),
  pricePoints: new Array(52).fill(899),
  promoBands: [],
  events: [
    { id: 'ev-1', week: 22, type: 'promo', label: '618 档期脉冲', impactPct: 42, impactWeeks: 4 },
  ],
};

beforeEach(() => {
  // 防御性 shim（历史坑：某些 jsdom 配置无 localStorage）
  if (typeof globalThis.localStorage === 'undefined') {
    const mem = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => mem.get(k) ?? null,
        setItem: (k: string, v: string) => void mem.set(k, v),
        removeItem: (k: string) => void mem.delete(k),
        clear: () => mem.clear(),
      },
    });
  }
  localStorage.clear();
  resetReferenceWorkspacesForTests();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const fieldsOf = (label: string) => ({
  typeId: 'promo',
  startWeek: 22,
  endWeek: 25,
  label,
  note: '平台补贴与档期降价叠加',
  impact: { magnitudePct: 42, durationWeeks: 4, decay: 'unspecified' as const },
});

describe('useReferenceWorkspace · 持久化与刷新恢复', () => {
  it('createComposed 落 localStorage；丢内存缓存后新 hook 读回（刷新 / 重开页签恢复）', () => {
    const first = renderHook(() => useReferenceWorkspace(SCOPE));
    act(() => { first.result.current.createComposed('lc-test', fieldsOf('店庆补贴')); });
    const raw = localStorage.getItem(KEY);
    expect(raw).toBeTruthy();
    const stored = JSON.parse(raw as string);
    expect(Object.keys(stored.composed)).toHaveLength(1);
    expect(stored.revision).toBe(1);
    // 模拟刷新：内存 store 全部丢弃，仅存 localStorage
    resetReferenceWorkspacesForTests();
    const second = renderHook(() => useReferenceWorkspace(SCOPE));
    const composed = Object.values(second.result.current.workspace.composed);
    expect(composed).toHaveLength(1);
    expect(composed[0]?.label).toBe('店庆补贴');
    expect(second.result.current.workspace.revision).toBe(1);
  });

  it('scopeHash 稳定（同输入同 hash、异输入异 hash），键含 scopeHash', () => {
    expect(referenceScopeHash(['v1', '俄罗斯', '手机', '全渠道', 'P'])).toBe(referenceScopeHash(['v1', '俄罗斯', '手机', '全渠道', 'P']));
    expect(referenceScopeHash(['v1', '俄罗斯', '手机', '全渠道', 'P']))
      .not.toBe(referenceScopeHash(['v2', '俄罗斯', '手机', '全渠道', 'P']));
    expect(KEY).toBe('LPL3.forecast.referenceWorkspace.scope-test');
  });

  it('未来 schemaVersion：原始值保留在备份键，工作区为空不销毁数据', () => {
    localStorage.setItem(KEY, JSON.stringify({ schemaVersion: 99, composed: { x: { id: 'x' } } }));
    const { result } = renderHook(() => useReferenceWorkspace(SCOPE));
    expect(Object.keys(result.current.workspace.composed)).toHaveLength(0);
    const backup = localStorage.getItem(`${KEY}.backup`);
    expect(backup).toBeTruthy();
    expect(JSON.parse(backup as string)).toEqual({ schemaVersion: 99, composed: { x: { id: 'x' } } });
  });
});

describe('useReferenceWorkspace · 撤销（before/after patch）与软删除', () => {
  it('连续 create A、B 后撤销：只撤最后一步（B），A 保留；再撤销清空且 history 出栈', () => {
    const { result } = renderHook(() => useReferenceWorkspace(SCOPE));
    act(() => { result.current.createComposed('lc-test', { ...fieldsOf('A'), label: 'A' }); });
    act(() => { result.current.createComposed('lc-test', { ...fieldsOf('B'), label: 'B', startWeek: 30, endWeek: 31 }); });
    expect(Object.keys(result.current.workspace.composed)).toHaveLength(2);
    act(() => { result.current.undo(); });
    expect(Object.keys(result.current.workspace.composed)).toHaveLength(1);
    const labels = Object.values(result.current.workspace.composed).map((r) => r.label);
    expect(labels).toEqual(['A']);
    act(() => { result.current.undo(); });
    expect(Object.keys(result.current.workspace.composed)).toHaveLength(0);
    expect(result.current.canUndo).toBe(false);
  });

  it('删除 = 软删除（deletedAt），撤销后恢复且保留原记录字段', () => {
    const { result } = renderHook(() => useReferenceWorkspace(SCOPE));
    let id = '';
    act(() => { id = result.current.createComposed('lc-test', fieldsOf('店庆补贴')).id; });
    act(() => { result.current.deleteComposed(id); });
    expect(result.current.workspace.composed[id]?.deletedAt).toBeTruthy();
    expect(referenceUndoLabel(result.current.lastAction)).toBe('已删除事件');
    act(() => { result.current.undo(); });
    expect(result.current.workspace.composed[id]?.deletedAt).toBeNull();
    expect(result.current.workspace.composed[id]?.label).toBe('店庆补贴');
  });

  it('预标覆写：保存 patch + baseFingerprint；恢复预标删除 override；均可撤销', () => {
    const { result } = renderHook(() => useReferenceWorkspace(SCOPE));
    const key = 'lc-test::ev-1';
    act(() => { result.current.savePresetOverride(product, 'ev-1', fieldsOf('618（改）')); });
    const ovr = result.current.workspace.overrides[key];
    expect(ovr?.patch.label).toBe('618（改）');
    expect(typeof ovr?.baseFingerprint).toBe('string');
    expect(ovr?.baseFingerprint.length).toBeGreaterThan(0);
    act(() => { result.current.restorePreset(product, 'ev-1'); });
    expect(result.current.workspace.overrides[key]).toBeUndefined();
    expect(referenceUndoLabel(result.current.lastAction)).toBe('已恢复预标');
    act(() => { result.current.undo(); });
    expect(result.current.workspace.overrides[key]?.patch.label).toBe('618（改）');
  });

  it('编辑器草稿：自动保存不进撤销历史；丢弃带撤销；clearEditorDraft 静默清除', () => {
    const { result } = renderHook(() => useReferenceWorkspace(SCOPE));
    const draft = {
      id: 'lc-test::new',
      mode: 'create' as const,
      productId: 'lc-test',
      eventId: null,
      value: { typeId: 'promo', startWeek: null, endWeek: null, label: '未写完', note: '', impact: null },
      baseRevision: null,
      updatedAt: '2026-11-04T00:00:00.000Z',
    };
    const revisionBefore = result.current.workspace.revision;
    act(() => { result.current.setEditorDraft(draft); });
    // 自动保存：草稿持久化，但不产生历史（未提交内容不参与撤销）
    expect(result.current.workspace.editorDrafts['lc-test::new']?.value.label).toBe('未写完');
    expect(result.current.workspace.history).toHaveLength(0);
    expect(result.current.workspace.revision).toBe(revisionBefore);
    act(() => { discardReferenceEditorDraft(SCOPE, 'lc-test::new'); });
    expect(result.current.workspace.editorDrafts['lc-test::new']).toBeUndefined();
    expect(referenceUndoLabel(result.current.lastAction)).toBe('已丢弃草稿');
    act(() => { result.current.undo(); });
    expect(result.current.workspace.editorDrafts['lc-test::new']?.value.label).toBe('未写完');
    // 保存成功路径：clearEditorDraft 静默移除（无历史条目，最后动作仍为空）
    act(() => { result.current.setEditorDraft(draft); });
    act(() => { result.current.clearEditorDraft('lc-test::new'); });
    expect(result.current.workspace.editorDrafts['lc-test::new']).toBeUndefined();
    expect(referenceUndoLabel(result.current.lastAction)).toBeNull();
  });
});

describe('useReferenceWorkspace · 写入失败显式「未持久化」+ 重试', () => {
  it('setItem 抛错 → saveState unpersisted（内存态保留）；恢复存储后 retryPersist → ready', () => {
    const { result } = renderHook(() => useReferenceWorkspace(SCOPE));
    const failing = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    act(() => { result.current.createComposed('lc-test', fieldsOf('店庆补贴')); });
    expect(result.current.saveState).toBe('unpersisted');
    expect(Object.values(result.current.workspace.composed)).toHaveLength(1); // 内存态不中断
    failing.mockRestore();
    act(() => { result.current.retryPersist(); });
    expect(result.current.saveState).toBe('ready');
    const stored = JSON.parse(localStorage.getItem(KEY) as string);
    expect(Object.keys(stored.composed)).toHaveLength(1);
  });
});
