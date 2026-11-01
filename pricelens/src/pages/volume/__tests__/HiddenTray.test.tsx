// ============================================================
// HiddenTray 组件级测试（2026-11-01 量价产品显隐 · 方案 A）：暂存条渲染 /
// 无障碍组语义 / 迷你药丸恢复回调 / 全部恢复 / 空清单不渲染 / 节点上报
// （焦点承接的 ref 通道）。
// ============================================================
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import HiddenTray, { type HiddenTrayItem } from '../HiddenTray';

afterEach(cleanup);

const ITEMS: HiddenTrayItem[] = [
  { key: 'own-pura-80-pro__12+256gb', brand: 'HUAWEI', nameText: 'Pura 80 Pro', romText: '12+256 GB' },
  { key: 'cmp-apple-iphone-17-pro__12+256gb', brand: 'APPLE', nameText: 'iPhone 17 Pro', romText: '12+256 GB' },
];

describe('HiddenTray · 暂存条', () => {
  it('无隐藏项时整条不渲染', () => {
    const { container } = render(<HiddenTray items={[]} onRestore={vi.fn()} onRestoreAll={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('渲染计数标签与 role=group 的无障碍语义（已隐藏产品，N 个）', () => {
    render(<HiddenTray items={ITEMS} onRestore={vi.fn()} onRestoreAll={vi.fn()} />);
    expect(screen.getByText('已隐藏（2）：')).toBeDefined();
    expect(screen.getByRole('group', { name: '已隐藏产品，2 个' })).toBeDefined();
  });

  it('迷你药丸点击触发对应产品的恢复；全部恢复按钮触发整批恢复', () => {
    const onRestore = vi.fn();
    const onRestoreAll = vi.fn();
    render(<HiddenTray items={ITEMS} onRestore={onRestore} onRestoreAll={onRestoreAll} />);
    fireEvent.click(screen.getByRole('button', { name: '恢复显示 Pura 80 Pro 12+256 GB' }));
    expect(onRestore).toHaveBeenCalledWith('own-pura-80-pro__12+256gb');
    fireEvent.click(screen.getByRole('button', { name: '全部恢复' }));
    expect(onRestoreAll).toHaveBeenCalledTimes(1);
  });

  it('配置 chip 只在有配置时出现；无配置产品不出 chip', () => {
    render(
      <HiddenTray
        items={[{ key: 'k', brand: 'HONOR', nameText: 'Band 10', romText: '' }]}
        onRestore={vi.fn()}
        onRestoreAll={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: '恢复显示 Band 10' })).toBeDefined();
  });

  it('迷你药丸节点经 registerItem 上报（焦点承接通道），卸载时置空', () => {
    const registerItem = vi.fn();
    const { unmount } = render(<HiddenTray items={ITEMS} onRestore={vi.fn()} onRestoreAll={vi.fn()} registerItem={registerItem} />);
    const attach = registerItem.mock.calls.filter(([key, el]) => key === ITEMS[0].key && el != null);
    expect(attach).toHaveLength(1);
    unmount();
    const detach = registerItem.mock.calls.filter(([key, el]) => key === ITEMS[0].key && el == null);
    expect(detach).toHaveLength(1);
  });
});
