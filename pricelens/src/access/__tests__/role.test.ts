// ============================================================
// 访问角色单测（2026-11-06 GTM/查阅者权限分组）：
// - 默认 gtm（未设置/垃圾值——不可锁死现网用户）
// - setRole/getRole 读写与持久化
// - canEditConfig 能力判定（viewer = false）
// - setRole 派发 ROLE_CHANGED_EVENT（配置页控件态即时刷新）
// ============================================================
// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  ACCESS_ROLE_KEY,
  ROLE_CHANGED_EVENT,
  canEditConfig,
  getRole,
  setRole,
} from '../role';

// 本仓库 vitest jsdom 不带 localStorage：装内存桩（同 DataQualityBlock.test 手法）
beforeAll(() => {
  const w = window as unknown as { localStorage?: Storage };
  if (w.localStorage) return;
  const mem = new Map<string, string>();
  const shim: Storage = {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => void mem.set(k, String(v)),
    removeItem: (k) => void mem.delete(k),
    clear: () => void mem.clear(),
    key: (i) => [...mem.keys()][i] ?? null,
    get length() {
      return mem.size;
    },
  };
  Object.defineProperty(w, 'localStorage', { configurable: true, value: shim });
});

afterAll(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe('role 读写与默认值', () => {
  it('未设置 → 默认 gtm（现网人人可配，避免升级后突然锁死）', () => {
    expect(getRole()).toBe('gtm');
    expect(canEditConfig()).toBe(true);
  });

  it('垃圾值回退默认 gtm（不抛错、不锁死）', () => {
    window.localStorage.setItem(ACCESS_ROLE_KEY, 'admin');
    expect(getRole()).toBe('gtm');
    expect(canEditConfig()).toBe(true);
  });

  it('setRole 持久化并可读回', () => {
    setRole('viewer');
    expect(window.localStorage.getItem(ACCESS_ROLE_KEY)).toBe('viewer');
    expect(getRole()).toBe('viewer');
    setRole('gtm');
    expect(getRole()).toBe('gtm');
  });
});

describe('canEditConfig 能力判定', () => {
  it('viewer → 不可编辑配置', () => {
    setRole('viewer');
    expect(canEditConfig()).toBe(false);
  });

  it('gtm → 可编辑配置', () => {
    setRole('gtm');
    expect(canEditConfig()).toBe(true);
  });
});

describe('角色变更广播', () => {
  it('setRole 派发 ROLE_CHANGED_EVENT（detail = 新角色）', () => {
    const handler = vi.fn();
    window.addEventListener(ROLE_CHANGED_EVENT, handler);
    setRole('viewer');
    expect(handler).toHaveBeenCalledTimes(1);
    expect((handler.mock.calls[0][0] as CustomEvent).detail).toBe('viewer');
    window.removeEventListener(ROLE_CHANGED_EVENT, handler);
  });
});
