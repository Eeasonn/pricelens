// ============================================================
// 竞品对标配置块组件级测试（2026-11-10 UI 审计落地回归；2026-11-11 编辑恢复重锚）：
// - 「矩阵」徽章有 tooltip 统一说明句（MATRIX_READONLY_HINT）；
// - 「编辑」按钮恢复可点（2026-11-11 Eason：不再置灰）：GTM 态可点击打开对标
//   配置弹窗（title = 编辑说明句）；查阅者态仍禁编辑（RBAC 语义不变）。
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

describe('BenchmarkConfigBlock · 编辑恢复（2026-11-11）', () => {
  it('行尾「矩阵」徽章悬停出统一说明句（tooltip 同源）', async () => {
    render(<BenchmarkConfigBlock />);
    // 行尾孤词徽章是导航行上的第一个「矩阵」（竞品 chip 内的小徽章在其后）
    const badge = screen.getAllByText('矩阵')[0]!;
    fireEvent.mouseEnter(badge);
    // antd Tooltip 异步渲染（raf），findBy 等待
    expect(await screen.findByText(MATRIX_READONLY_HINT)).toBeTruthy();
  });

  it('「编辑」按钮恢复可点：title = 编辑说明句、可点击打开对标配置弹窗', () => {
    render(<BenchmarkConfigBlock />);
    const edit = editButton();
    expect(edit).not.toBeNull();
    expect(edit!.disabled).toBe(false);
    expect(edit!.title).toBe('编辑该配置的对标竞品');
    fireEvent.click(edit!);
    // 弹窗打开：标题「配置对标 · 型号」出现
    expect(screen.getAllByText(/配置对标/).length).toBeGreaterThan(0);
  });

  it('查阅者态：按钮仍禁用（RBAC），title 保持「查阅者不可修改配置」', () => {
    render(<BenchmarkConfigBlock canEdit={false} />);
    const edit = editButton();
    expect(edit).not.toBeNull();
    expect(edit!.disabled).toBe(true);
    expect(edit!.title).toContain('查阅者');
  });
});
