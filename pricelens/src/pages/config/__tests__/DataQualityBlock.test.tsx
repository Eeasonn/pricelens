// ============================================================
// 数据质量块组件级测试（2026-11-01 异常守卫 QA 修复回归）：
// - 自定义档模式（QA Bug#2）：点「自定义」即进入自定义模式出输入框，提交合法值
//   停在自定义档；选回预设档退出；非法值被拒不落盘；
// - 规则读写：默认 50 开；开关即改即存并广播。
// ============================================================
// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import DataQualityBlock from '../DataQualityBlock';
import { readAnomalyRule } from '../../../dataModel/anomaly';

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

const segItem = (name: string) => screen.getAllByText(name).find((el) => el.closest('.ant-segmented-item')) ?? screen.getByText(name);

describe('DataQualityBlock · 档位交互', () => {
  it('默认关闭（2026-11-05 Eason 拍板：守卫默认不开），阈值保留 50%', () => {
    render(<DataQualityBlock />);
    expect(readAnomalyRule()).toEqual({ enabled: false, thresholdPct: 50 });
    expect(screen.getByText('已关闭')).toBeDefined();
  });

  it('QA Bug#2 回归：点「自定义」即进入自定义模式（输入框出现且选中态保持）', () => {
    render(<DataQualityBlock />);
    fireEvent.click(screen.getByRole('switch')); // 默认关（2026-11-05），阈值区先开启
    expect(screen.queryByLabelText('自定义阈值百分比')).toBeNull();
    fireEvent.click(segItem('自定义'));
    expect(screen.getByLabelText('自定义阈值百分比')).toBeDefined();
    // 选中态不再被 rule 值拉回预设档（输入框保持挂载）
    expect(screen.getByLabelText('自定义阈值百分比')).toBeTruthy();
  });

  it('自定义提交合法值落盘并停在自定义档；选回预设档输入框消失', () => {
    render(<DataQualityBlock />);
    fireEvent.click(screen.getByRole('switch'));
    fireEvent.click(segItem('自定义'));
    const input = screen.getByLabelText('自定义阈值百分比') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '20' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(readAnomalyRule()).toEqual({ enabled: true, thresholdPct: 20 });
    expect(screen.getByText('当前口径 ≥20%')).toBeDefined();
    fireEvent.click(segItem('50%'));
    expect(readAnomalyRule().thresholdPct).toBe(50);
    expect(screen.queryByLabelText('自定义阈值百分比')).toBeNull();
  });

  it('非法值（5 / abc / 95）被拒：提示 10–90 且规则不落盘', () => {
    render(<DataQualityBlock />);
    fireEvent.click(screen.getByRole('switch'));
    fireEvent.click(segItem('30%'));
    fireEvent.click(segItem('自定义'));
    const input = screen.getByLabelText('自定义阈值百分比') as HTMLInputElement;
    for (const bad of ['5', 'abc', '95']) {
      fireEvent.change(input, { target: { value: bad } });
      fireEvent.keyDown(input, { key: 'Enter' });
    }
    expect(screen.getByText('请输入 10–90 的整数')).toBeDefined();
    expect(readAnomalyRule().thresholdPct).toBe(30); // 未被非法值覆写
  });

  it('R2-3 回归：月粒度裁定显示 2026-09（周/月桶 id 同为 6 位数字，须按裁定粒度区分）', () => {
    window.localStorage.setItem('LPL3.config.anomalyMarks', JSON.stringify([
      { countryCode: 'DE', seriesKey: 'k1', bucketId: '202609', action: 'isolate', label: 'XIAOMI Band 10', price: 40, wow: -0.4, ts: 1, granularity: 'month' },
    ]));
    render(<DataQualityBlock />);
    expect(screen.getByText('2026-09')).toBeDefined();
    expect(screen.queryByText('2026W09')).toBeNull(); // 修复前月 id 会被错显成周号
  });

  it('开关即改即存并广播 CONFIG_CHANGED_EVENT（默认关 → 点开 = 已启用）', () => {
    const fired = vi.fn();
    window.addEventListener('lpl3-config-changed', fired);
    render(<DataQualityBlock />);
    fireEvent.click(screen.getByRole('switch'));
    expect(fired).toHaveBeenCalled();
    expect(readAnomalyRule().enabled).toBe(true);
    expect(screen.getByText('当前口径 ≥50%')).toBeDefined();
    window.removeEventListener('lpl3-config-changed', fired);
  });
});
