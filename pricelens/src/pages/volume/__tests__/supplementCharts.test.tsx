// ============================================================
// 量价走势补充图组件测试（2026-11-03）：MarginCostCard（销毛成本）与
// InventoryDosCard（库存 · DOS）——卡头标识（模拟成本 / 演示数据）、
// 有数据出图、无数据空态、演示口径标识（PRODUCT.md 数据边界要求）。
// jsdom 无 ResizeObserver：stub 之；clientWidth 覆写为 600 让卡进入就绪态。
// ============================================================
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import MarginCostCard, { weeklyMarginOf } from '../MarginCostCard';
import InventoryDosCard from '../InventoryDosCard';
import { inventoryDemoOf } from '../inventoryDemo';
import type { MarginCostPoint } from '../marginCost';

const IDS = ['202635', '202636', '202637', '202638'];
const LABELS = ['08-27', '09-03', '09-10', '09-17'];

const mkMargin = (cost: number, revenue: number): MarginCostPoint => ({
  bucketId: '202609',
  monthId: '202609',
  unitRevenue: revenue,
  unitCost: cost,
  unitMargin: revenue - cost,
  marginRate: (revenue - cost) / revenue,
  simulated: true,
});

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', { configurable: true, value: 600 });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('MarginCostCard · 销毛成本图', () => {
  const marginPoints: (MarginCostPoint | null)[] = [mkMargin(598, 899), mkMargin(598, 899), mkMargin(598, 849), mkMargin(598, 849)];

  it('有数据：渲染卡头与「模拟成本 · 月版本」标识（数据边界显性化）', () => {
    render(<MarginCostCard name="Mate 90" bucketLabels={LABELS} volumes={[1800, 2600, 3400, 3900]} marginPoints={marginPoints} />);
    expect(screen.getByText('销毛成本')).toBeTruthy();
    expect(screen.getByText('Mate 90')).toBeTruthy();
    expect(screen.getByText('模拟成本 · 月版本')).toBeTruthy();
    expect(document.querySelector('svg')).toBeTruthy();
  });

  it('无成本数据：不画图，给空态文案', () => {
    render(<MarginCostCard name="Mate 90" bucketLabels={LABELS} volumes={[1800, 2600, 3400, 3900]} marginPoints={[null, null, null, null]} />);
    expect(screen.getByText('当前产品在所选范围内无销毛成本数据')).toBeTruthy();
    expect(document.querySelector('svg')).toBeNull();
  });

  it('weeklyMarginOf：周销 × 单台毛利 / 1e4，缺销量或成本为 null', () => {
    expect(weeklyMarginOf([1000, null, 2000], [mkMargin(600, 900), mkMargin(600, 900), null])).toEqual([30, null, null]);
  });
});

describe('InventoryDosCard · 库存 DOS 图', () => {
  const points = inventoryDemoOf({
    modelId: 'mate-90',
    romram: '12+512',
    countryCode: 'RU',
    granularity: 'week',
    bucketIds: IDS,
    volumes: [1800, 2600, 3400, 3900],
  });

  it('有数据：渲染卡头与「演示数据」标识', () => {
    render(<InventoryDosCard name="Mate 90" bucketLabels={LABELS} points={points} />);
    expect(screen.getByText('库存 · DOS')).toBeTruthy();
    expect(screen.getByText('演示数据')).toBeTruthy();
    expect(document.querySelector('svg')).toBeTruthy();
  });

  it('DOS 70 / 90 天参考线标注（手机档讨论口径）', () => {
    const { container } = render(<InventoryDosCard name="Mate 90" bucketLabels={LABELS} points={points} />);
    const texts = Array.from(container.querySelectorAll('svg text')).map((t) => t.textContent ?? '');
    // 演示库存约 5–9 周销（DOS 35–63 天），dosMax 至少 91 容下 90 天线 → 70/90 均应出现
    expect(texts.some((s) => s.includes('70 天'))).toBe(true);
    expect(texts.some((s) => s.includes('90 天'))).toBe(true);
  });

  it('无库存数据：空态文案', () => {
    render(<InventoryDosCard name="Mate 90" bucketLabels={LABELS} points={IDS.map((id) => ({ bucketId: id, siUnits: null, channelInv: null, channelDos: null, fullDos: null }))} />);
    expect(screen.getByText('当前产品在所选范围内无库存数据')).toBeTruthy();
    expect(document.querySelector('svg')).toBeNull();
  });
});
