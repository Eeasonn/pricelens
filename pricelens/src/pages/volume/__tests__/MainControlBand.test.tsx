// ============================================================
// MainControlBand / GroupCompareEntry 组件级测试（2026-11-03 主品视图改版；
// 2026-11-05 平台口径收口改写）：顶部控制区两件套——①产品显隐药丸（常驻同位
// 切换：显示实线 / 隐藏虚线降透明，aria-pressed 表达状态，点击回调带面板 key）；
// ②「进入本组对比」轻量文字钮（价格走势「多平台对比」同款，aria-label 沿用
// 原明细卡入口文案，点击切组视图回调）。
// 原第二件「DNS 店铺 chip」随 2026-11-05 Eason 指令退役（每产品不再单独选平台
// 店铺，取价平台统一走顶部筛选条的全局平台筛选器），channel/channelCtl 字段
// 从 MainControlBandItem 删除，对应断言一并移除。
// 焦点承接：registerHost 上报药丸宿主（restoreAll 后焦点落回 button.lpl-lg-pill）。
// ============================================================
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import MainControlBand, { GroupCompareEntry, type MainControlBandItem } from '../MainControlBand';

afterEach(cleanup);

const ITEMS: MainControlBandItem[] = [
  {
    key: 'm-80__12+256gb', brand: 'HUAWEI', name: 'Pura 80 Pro 12+256 GB',
    nameText: 'Pura 80 Pro', romText: '12+256 GB', hidden: false,
  },
  {
    key: 'mate-60__12+512gb', brand: 'HUAWEI', name: 'Mate 60 12+512 GB',
    nameText: 'Mate 60', romText: '12+512 GB', hidden: true,
  },
];

describe('MainControlBand · 主品控制区药丸带', () => {
  it('空清单不渲染', () => {
    const { container } = render(<MainControlBand items={[]} onToggle={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('显示态药丸：aria-pressed=true、实线描边；隐藏态：aria-pressed=false、虚线降透明', () => {
    const { container } = render(<MainControlBand items={ITEMS} onToggle={vi.fn()} />);
    const visible = screen.getByRole('button', { name: '隐藏 Pura 80 Pro 12+256 GB' });
    const hidden = screen.getByRole('button', { name: '恢复显示 Mate 60 12+512 GB' });
    expect(visible.getAttribute('aria-pressed')).toBe('true');
    expect(hidden.getAttribute('aria-pressed')).toBe('false');
    expect((visible as HTMLElement).style.borderStyle).toBe('solid');
    expect((hidden as HTMLElement).style.borderStyle).toBe('dashed');
    expect(hidden.className).toContain('lpl-lg-pill');
    expect(container.textContent).toContain('Pura 80 Pro');
    expect(container.textContent).toContain('12+256 GB');
  });

  it('点击药丸 = 切换该产品显隐（回调带面板 key，显/隐同一路径）', () => {
    const onToggle = vi.fn();
    render(<MainControlBand items={ITEMS} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole('button', { name: '隐藏 Pura 80 Pro 12+256 GB' }));
    expect(onToggle).toHaveBeenCalledWith('m-80__12+256gb');
    fireEvent.click(screen.getByRole('button', { name: '恢复显示 Mate 60 12+512 GB' }));
    expect(onToggle).toHaveBeenCalledWith('mate-60__12+512gb');
  });

  it('2026-11-05 平台口径收口：每卡不再有取价平台 chip（全局平台筛选器唯一入口）', () => {
    const { container } = render(<MainControlBand items={ITEMS} onToggle={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /取价平台：/ })).toBeNull();
    expect(container.querySelectorAll('button')).toHaveLength(ITEMS.length);
  });

  it('registerHost 上报每个药丸宿主（焦点承接通道）', () => {
    const registerHost = vi.fn();
    render(<MainControlBand items={ITEMS} onToggle={vi.fn()} registerHost={registerHost} />);
    const keys = registerHost.mock.calls.map((call) => call[0]);
    expect(keys).toEqual(ITEMS.map((item) => item.key));
    expect(registerHost.mock.calls[0][1]).toBeInstanceOf(HTMLSpanElement);
  });
});

describe('GroupCompareEntry · 进入本组对比入口', () => {
  it('价格走势「多平台对比」同款轻量文字钮：aria-label 沿用原明细卡入口文案', () => {
    const onEnter = vi.fn();
    render(<GroupCompareEntry name="Pura 80 Pro 12+256 GB" count={3} onEnter={onEnter} />);
    const btn = screen.getByRole('button', { name: '查看 Pura 80 Pro 12+256 GB 所在组的 3 款对比产品' });
    expect(btn.className).toBe('lpl-text-entry');
    expect(btn.textContent).toBe('本组对比（3）→');
    fireEvent.click(btn);
    expect(onEnter).toHaveBeenCalledTimes(1);
  });
});
