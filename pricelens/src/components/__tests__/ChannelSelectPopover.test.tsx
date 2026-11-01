// ============================================================
// ChannelSelectPopover 组件级测试(2026-11-02 全量审计):
// 重置 effect 依赖按内容签名——skuIds 内联数组(每次渲染新引用)不再误触发重置,
// 弹层打开期间父组件 re-render 不清空用户已输入的搜索词/已展开的平台列;
// sku 内容真实变化(切产品)或切国家照常重置。
// ============================================================
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import ChannelSelectPopover from '../ChannelSelectPopover';

afterEach(cleanup);

const SKU = 'own-huawei-pura-90s-pro-max__12-256gb__black';

function mount(skuIds: string[], cc = 'RU') {
  return render(
    <ChannelSelectPopover cc={cc} skuIds={skuIds} current={null} onPick={vi.fn()} />,
  );
}

describe('ChannelSelectPopover · 重置 effect 内容签名', () => {
  it('父组件以同内容新数组引用 re-render:搜索词保留(原引用依赖会清空)', async () => {
    const { rerender } = mount([SKU]);
    const input = await screen.findByRole('textbox');
    fireEvent.change(input, { target: { value: 'DNS' } });
    expect((input as HTMLInputElement).value).toBe('DNS');
    // 同内容、新引用(模拟 PlatformCompareView 内联 [repSkuId] 的每次渲染)
    rerender(
      <ChannelSelectPopover cc="RU" skuIds={[SKU]} current={null} onPick={vi.fn()} />,
    );
    const inputAfter = await screen.findByRole('textbox');
    expect((inputAfter as HTMLInputElement).value).toBe('DNS');
  });

  it('sku 内容真实变化:重置搜索词', async () => {
    const { rerender } = mount([SKU]);
    const input = await screen.findByRole('textbox');
    fireEvent.change(input, { target: { value: 'DNS' } });
    rerender(
      <ChannelSelectPopover cc="RU" skuIds={['own-huawei-mate-x7__16-512gb__black']} current={null} onPick={vi.fn()} />,
    );
    const inputAfter = await screen.findByRole('textbox');
    expect((inputAfter as HTMLInputElement).value).toBe('');
  });

  it('切国家:重置搜索词', async () => {
    const { rerender } = mount([SKU], 'RU');
    const input = await screen.findByRole('textbox');
    fireEvent.change(input, { target: { value: 'DNS' } });
    rerender(
      <ChannelSelectPopover cc="DE" skuIds={[SKU]} current={null} onPick={vi.fn()} />,
    );
    const inputAfter = await screen.findByRole('textbox');
    expect((inputAfter as HTMLInputElement).value).toBe('');
  });
});
