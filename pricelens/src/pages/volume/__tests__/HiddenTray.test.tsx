// ============================================================
// HiddenTray 组件级测试（2026-11-01 量价产品显隐 · 方案 A）：暂存条渲染 /
// 无障碍组语义 / 迷你药丸恢复回调 / 全部恢复 / 空清单不渲染 / 节点上报
// （焦点承接的 ref 通道）。
// 2026-11-05 整改1② 扩充：HiddenVault 主品视图收纳区（「销毛成本」右侧）——
// 芯片恢复回调 / +N 收缩与展开 / 全部恢复 / 节点上报 / 空清单不渲染。
// ============================================================
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import HiddenTray, { HiddenVault, VAULT_CHIP_LIMIT, type HiddenTrayItem } from '../HiddenTray';

afterEach(cleanup);

const ITEMS: HiddenTrayItem[] = [
  { key: 'own-pura-80-pro__12+256gb', brand: 'HUAWEI', nameText: 'Pura 80 Pro', romText: '12+256 GB' },
  { key: 'cmp-apple-iphone-17-pro__12+256gb', brand: 'APPLE', nameText: 'iPhone 17 Pro', romText: '12+256 GB' },
];

const manyItems = (n: number): HiddenTrayItem[] =>
  Array.from({ length: n }, (_, i) => ({ key: `k${i}`, brand: 'HUAWEI', nameText: `产品 ${i + 1}`, romText: '' }));

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

describe('HiddenVault · 主品视图收纳区（销毛成本右侧，2026-11-05 整改1②）', () => {
  it('无隐藏项时不渲染；有项时出 role=group 无障碍语义与「全部恢复」', () => {
    const { container } = render(<HiddenVault items={[]} onRestore={vi.fn()} onRestoreAll={vi.fn()} />);
    expect(container.firstChild).toBeNull();
    render(<HiddenVault items={ITEMS} onRestore={vi.fn()} onRestoreAll={vi.fn()} />);
    expect(screen.getByRole('group', { name: '已隐藏产品收纳区，2 个，点击芯片恢复面板显示' })).toBeDefined();
    expect(screen.getByRole('button', { name: '恢复全部已隐藏产品' })).toBeDefined();
  });

  it('芯片点击触发对应产品恢复（胶囊回面板原列位的恢复入口）', () => {
    const onRestore = vi.fn();
    render(<HiddenVault items={ITEMS} onRestore={onRestore} onRestoreAll={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '恢复显示 Pura 80 Pro 12+256 GB' }));
    expect(onRestore).toHaveBeenCalledWith('own-pura-80-pro__12+256gb');
  });

  it(`不超过 ${VAULT_CHIP_LIMIT} 个全直显；超过时收缩为前 ${VAULT_CHIP_LIMIT - 1} 枚 + 「+N」展开芯片`, () => {
    render(<HiddenVault items={manyItems(VAULT_CHIP_LIMIT)} onRestore={vi.fn()} onRestoreAll={vi.fn()} />);
    expect(screen.getAllByRole('button', { name: /^恢复显示 产品/ })).toHaveLength(VAULT_CHIP_LIMIT);
    cleanup();
    render(<HiddenVault items={manyItems(VAULT_CHIP_LIMIT + 2)} onRestore={vi.fn()} onRestoreAll={vi.fn()} />);
    expect(screen.getAllByRole('button', { name: /^恢复显示 产品/ })).toHaveLength(VAULT_CHIP_LIMIT - 1);
    const fold = screen.getByRole('button', { name: '展开其余 3 个已隐藏产品' });
    expect(fold.getAttribute('aria-expanded')).toBe('false');
    expect(fold.textContent).toBe('+3');
  });

  it('「+N」点击展开全部（aria-expanded 翻转、芯片齐全、可收起）；恢复到上限内自动收回', () => {
    const { rerender } = render(<HiddenVault items={manyItems(VAULT_CHIP_LIMIT + 2)} onRestore={vi.fn()} onRestoreAll={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '展开其余 3 个已隐藏产品' }));
    expect(screen.getAllByRole('button', { name: /^恢复显示 产品/ })).toHaveLength(VAULT_CHIP_LIMIT + 2);
    const fold = screen.getByRole('button', { name: /收起其余已隐藏产品/ });
    expect(fold.getAttribute('aria-expanded')).toBe('true');
    expect(fold.textContent).toBe('收起');
    // 清单收缩回上限内 → 展开态自动收回（下次超限重新从收缩态开始）
    rerender(<HiddenVault items={manyItems(2)} onRestore={vi.fn()} onRestoreAll={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /收起其余已隐藏产品/ })).toBeNull();
  });

  it('芯片节点经 registerItem 上报（焦点承接通道：隐藏后焦点落到芯片）', () => {
    const registerItem = vi.fn();
    const { unmount } = render(<HiddenVault items={ITEMS} onRestore={vi.fn()} onRestoreAll={vi.fn()} registerItem={registerItem} />);
    const attach = registerItem.mock.calls.filter(([key, el]) => key === ITEMS[1].key && el != null);
    expect(attach).toHaveLength(1);
    unmount();
    const detach = registerItem.mock.calls.filter(([key, el]) => key === ITEMS[1].key && el == null);
    expect(detach).toHaveLength(1);
  });
});
