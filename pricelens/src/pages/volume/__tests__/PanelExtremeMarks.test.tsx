// ============================================================
// PanelExtremeMarks 组件级测试（2026-11-03 成本柱「K 线式极值点」）：
// 选中区间内的价格/销量极值点标识——价格同心双环、销量白芯菱形（价格走势
// 同源形状）；title 报「锚日 + 极值类别 + 数值」；flat / 无可信极差 / 无区间
// 不画。经典与成本柱两种呈现共用本组件（宿主换算 Y 坐标）。
// ============================================================
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import PanelExtremeMarks from '../PanelExtremeMarks';
import type { RangeBand } from '../periodSummary';

afterEach(cleanup);

const PRICE_BAND: RangeBand = {
  startIndex: 1, endIndex: 4, high: 120, low: 80, flat: false,
  dots: [{ index: 2, value: 120 }, { index: 4, value: 80 }],
};
const VOLUME_BAND: RangeBand = {
  startIndex: 1, endIndex: 4, high: 3000, low: 1200, flat: false,
  dots: [{ index: 1, value: 3000 }, { index: 3, value: 1200 }],
};

function mount(overrides: Partial<Parameters<typeof PanelExtremeMarks>[0]> = {}) {
  const props: Parameters<typeof PanelExtremeMarks>[0] = {
    priceBand: PRICE_BAND,
    volumeBand: VOLUME_BAND,
    priceSpreadValue: 40,
    volumeSpreadValue: 1800,
    xAt: (i) => i * 10,
    priceYOf: (v) => v,
    volumeYOf: (v) => v / 2,
    seriesColor: '#c7000b',
    formatPriceText: (v) => `$${v}`,
    formatVolumeText: (v) => String(v),
    labelOf: (i) => `10-0${i + 1}`,
    ...overrides,
  };
  const { container } = render(
    <svg data-testid="host"><PanelExtremeMarks {...props} /></svg>,
  );
  return container;
}

describe('PanelExtremeMarks · 区间极值点', () => {
  it('价格最高/最低各一枚同心双环（外空心环 + 内实心点），落在数据位', () => {
    const container = mount({ volumeBand: null, volumeSpreadValue: null });
    const groups = container.querySelectorAll('g');
    expect(groups).toHaveLength(2);
    groups.forEach((g) => {
      const circles = g.querySelectorAll('circle');
      expect(circles).toHaveLength(2);
      // 外环空心（fill none）+ 内点实心（fill 系列色）
      expect(circles[0].getAttribute('fill')).toBe('none');
      expect(circles[1].getAttribute('fill')).toBe('#c7000b');
    });
    const [hi, lo] = Array.from(groups);
    expect(hi.querySelector('circle')?.getAttribute('cx')).toBe('20'); // xAt(2)
    expect(lo.querySelector('circle')?.getAttribute('cx')).toBe('40'); // xAt(4)
  });

  it('销量最高/最低各一枚白芯菱形（canvas 底 + 系列色描边，rotate 45）', () => {
    const container = mount({ priceBand: null, priceSpreadValue: null });
    const groups = container.querySelectorAll('g');
    expect(groups).toHaveLength(2);
    groups.forEach((g) => {
      const rect = g.querySelector('rect');
      expect(rect?.getAttribute('transform')).toContain('rotate(45');
      expect(rect?.getAttribute('fill')).toBe('#ffffff');
      expect(rect?.getAttribute('stroke')).toBe('#c7000b');
    });
  });

  it('title 报「锚日 + 极值类别 + 数值」（周 + 值）', () => {
    const container = mount();
    const titles = Array.from(container.querySelectorAll('title')).map((t) => t.textContent);
    expect(titles).toContain('10-03 价格极值 $120');
    expect(titles).toContain('10-05 价格极值 $80');
    expect(titles).toContain('10-02 销量极值 3000');
    expect(titles).toContain('10-04 销量极值 1200');
  });

  it('最高＝最低（flat）不画该量纲的点', () => {
    const container = mount({ priceBand: { ...PRICE_BAND, flat: true, dots: [{ index: 2, value: 100 }] } });
    const titles = Array.from(container.querySelectorAll('title')).map((t) => t.textContent);
    expect(titles.every((t) => t.includes('销量极值'))).toBe(true);
    expect(container.querySelectorAll('g')).toHaveLength(2);
  });

  it('无可信极差（spread null）不画点；两个量纲都没有时组件返回 null', () => {
    expect(mount({ priceSpreadValue: null }).querySelectorAll('g').length).toBe(2);
    const empty = mount({ priceBand: null, volumeBand: null, priceSpreadValue: null, volumeSpreadValue: null });
    expect(empty.querySelector('[data-testid="host"]')?.children).toHaveLength(0);
  });
});
