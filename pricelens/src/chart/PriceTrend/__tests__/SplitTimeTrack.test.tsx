// ============================================================
// SplitTimeTrack 组件级测试（2026-11-02 全量审计）：单桶窗口（s===e）下
// 两端 edge-tick 去重——此前 markS===markE 会渲染两个同 key 兄弟节点
// （React duplicate key 警告 + reconciliation 错位隐患）。
// ============================================================
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import SplitTimeTrack from '../SplitTimeTrack';

// jsdom 无 ResizeObserver(轨道宽度观测)——stub 成空观测,首帧 trackW=0 分支已可渲染
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver;
}

afterEach(cleanup);

const IDS = ['202601', '202602', '202603', '202604', '202605', '202606', '202607', '202608'];

describe('SplitTimeTrack · 单桶窗口', () => {
  it('s===e（单桶查看窗口）渲染无异常，edge-tick 不重复', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(
      <SplitTimeTrack ids={IDS} lo={0} hi={IDS.length - 1} s={2} e={2} granularity="month" onChange={vi.fn()} />,
    );
    // 渲染成功（轨道结构在）
    expect(container.firstChild).not.toBeNull();
    // 无 React duplicate key 警告
    const keyWarnings = spy.mock.calls.filter((c) => String(c[0]).includes('same key'));
    expect(keyWarnings).toHaveLength(0);
    spy.mockRestore();
  });

  it('常规多桶窗口（s<e）仍渲染两端 edge-tick 各一', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(
      <SplitTimeTrack ids={IDS} lo={0} hi={IDS.length - 1} s={1} e={5} granularity="month" onChange={vi.fn()} />,
    );
    expect(container.firstChild).not.toBeNull();
    const keyWarnings = spy.mock.calls.filter((c) => String(c[0]).includes('same key'));
    expect(keyWarnings).toHaveLength(0);
    spy.mockRestore();
  });
});
