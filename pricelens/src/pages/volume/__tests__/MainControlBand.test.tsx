// ============================================================
// MainControlBand / GroupCompareEntry 组件级测试（2026-11-03 主品视图改版）：
// 顶部控制区三件套——①产品显隐药丸（常驻同位切换：显示实线 / 隐藏虚线降透明，
// aria-pressed 表达状态，点击回调带面板 key）；②DNS 店铺 chip（明细卡原款：
// 触发钮 + aria，浮层同源 ChannelSelectPopover——本测试只验触发钮语义，
// 浮层行为归共用组件既有契约）；③「进入本组对比」轻量文字钮（价格走势
// 「多平台对比」同款，aria-label 沿用原明细卡入口文案，点击切组视图回调）。
// 焦点承接：registerHost 上报药丸宿主（restoreAll 后焦点落回 button.lpl-lg-pill）。
// ============================================================
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import MainControlBand, { GroupCompareEntry, type MainControlBandItem } from '../MainControlBand';
import type { PlatformSelection } from '../../../state/filtersTypes';

afterEach(cleanup);

const SEL: PlatformSelection = { platforms: ['DNS'], shopIds: ['RU:DNS:offline'] };

const ITEMS: MainControlBandItem[] = [
  {
    key: 'm-80__12+256gb', brand: 'HUAWEI', name: 'Pura 80 Pro 12+256 GB',
    nameText: 'Pura 80 Pro', romText: '12+256 GB', hidden: false,
    channel: { label: '京东自营', auto: false },
    channelCtl: { cc: 'RU', skuIds: ['s1'], current: SEL, onPick: vi.fn() },
  },
  {
    key: 'mate-60__12+512gb', brand: 'HUAWEI', name: 'Mate 60 12+512 GB',
    nameText: 'Mate 60', romText: '12+512 GB', hidden: true,
    channel: { label: '自动', auto: true },
    channelCtl: { cc: 'RU', skuIds: ['s2'], current: null, onPick: vi.fn(), autoLabel: '京东自营' },
  },
  {
    key: 'nova-12__256gb', brand: 'HUAWEI', name: 'nova 12 256 GB',
    nameText: 'nova 12', romText: '256 GB', hidden: false,
    channel: null, channelCtl: null,
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

  it('DNS 店铺 chip 原款迁入：显式平台 aria-pressed、自动平台带 autoLabel 语义', () => {
    render(<MainControlBand items={ITEMS} onToggle={vi.fn()} />);
    const chip = screen.getByRole('button', { name: '取价平台：京东自营，点击筛选平台-店铺' });
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    const autoChip = screen.getByRole('button', { name: '取价平台：自动，点击筛选平台-店铺' });
    expect(autoChip.getAttribute('aria-pressed')).toBe('false');
  });

  it('无渠道徽标的产品不出 chip；registerHost 上报每个药丸宿主（焦点承接通道）', () => {
    const registerHost = vi.fn();
    render(<MainControlBand items={ITEMS} onToggle={vi.fn()} registerHost={registerHost} />);
    expect(screen.queryByRole('button', { name: /取价平台：256 GB/ })).toBeNull();
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
