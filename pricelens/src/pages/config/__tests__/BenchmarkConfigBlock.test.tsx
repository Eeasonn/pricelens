// ============================================================
// 竞品对标配置块组件级测试（2026-11-10 UI 审计落地回归）：
// - matrix-only 只读态的「矩阵」孤词徽章有 tooltip 统一说明句（MATRIX_READONLY_HINT）；
// - 禁用「编辑」按钮 title 与徽章 tooltip 同源同句（两处口径一致，可从 DOM 断言）；
// - 禁用「编辑」标签色 = color.mute（antd 默认禁用灰过虚）且光标 not-allowed；
// - 查阅者态 title 保持「查阅者不可修改配置」（RBAC 语义不受统一句影响）。
// 组件只读 useFilters（Context 自带默认值 + noop actions），可直渲染；
// localStorage 桩同 DataQualityBlock.test 手法。
// ============================================================
// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import BenchmarkConfigBlock, { MATRIX_READONLY_HINT } from '../BenchmarkConfigBlock';

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

afterEach(() => {
  window.localStorage.clear();
  cleanup();
});

const editButton = (): HTMLButtonElement | null => {
  const el = screen.queryAllByText('编辑').find((n) => n.closest('button'));
  return el ? (el.closest('button') as HTMLButtonElement) : null;
};

describe('BenchmarkConfigBlock · 矩阵直配只读态（UI 审计 2026-11-10）', () => {
  it('行尾「矩阵」徽章悬停出统一说明句（tooltip 与禁用编辑 title 同源）', async () => {
    render(<BenchmarkConfigBlock />);
    // 行尾孤词徽章是导航行上的第一个「矩阵」（竞品 chip 内的小徽章在其后）
    const badge = screen.getAllByText('矩阵')[0]!;
    fireEvent.mouseEnter(badge);
    // antd Tooltip 异步渲染（raf），findBy 等待
    expect(await screen.findByText(MATRIX_READONLY_HINT)).toBeTruthy();
  });

  it('禁用「编辑」按钮：title = 统一说明句、标签色 color.mute、光标 not-allowed', () => {
    render(<BenchmarkConfigBlock />);
    const edit = editButton();
    expect(edit).not.toBeNull();
    expect(edit!.disabled).toBe(true);
    expect(edit!.title).toBe(MATRIX_READONLY_HINT);
    // jsdom 将 hex 序列化为 rgb（color.mute = #737373 = rgb(115,115,115)）
    expect(edit!.style.color).toBe('rgb(115, 115, 115)');
    expect(edit!.style.cursor).toBe('not-allowed');
  });

  it('查阅者态：title 保持「查阅者不可修改配置，请联系 GTM」', () => {
    render(<BenchmarkConfigBlock canEdit={false} />);
    const edit = editButton();
    expect(edit).not.toBeNull();
    expect(edit!.disabled).toBe(true);
    expect(edit!.title).toContain('查阅者');
  });
});
