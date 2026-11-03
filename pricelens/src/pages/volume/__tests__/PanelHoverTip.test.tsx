// ============================================================
// PanelHoverTip 组件级测试（2026-11-03 主品视图改版）：明细卡行退役后主品
// 观察列的悬停浮窗——日期/桶号 + RRP + 折后价 + 环比 + 销量 + 成本销毛行
// （随「销毛成本」开关显隐）；隔离周「已隔离 · 不计环比」与销毛屏蔽语义；
// 缺采 — 不借用；右缘自动左翻。与组视图明细卡同一份 weekDetailModel 口径。
// ============================================================
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import PanelHoverTip from '../PanelHoverTip';
import type { WeekDetailModel } from '../weekDetail';

afterEach(cleanup);

const BASE: WeekDetailModel = {
  visible: true,
  date: '10-14',
  period: '2026W42',
  wowLabel: '周环比',
  volumeLabel: '周销量',
  rrp: '$699',
  price: '$595',
  wow: { text: '+1.2%', dir: 'up' },
  wowSkip: 0,
  wowSkipBuckets: [],
  marginMasked: false,
  volume: '2,281',
  margin: { kind: 'empty', cost: '', margin: '', rate: '' },
};

const mount = (model: Partial<WeekDetailModel> = {}, props: Partial<Parameters<typeof PanelHoverTip>[0]> = {}) =>
  render(
    <div style={{ position: 'relative' }}>
      <PanelHoverTip
        model={{ ...BASE, ...model }}
        showMargin={false}
        x={100}
        plotLeft={0}
        plotWidth={400}
        summaryId="volume-detail-0"
        {...props}
      />
    </div>,
  );

describe('PanelHoverTip · 主品悬停浮窗', () => {
  it('日期/桶号、RRP（删除线参照）、折后价、环比胶囊、销量与 ARIA 关联齐备', () => {
    mount();
    expect(screen.getByText('10-14')).toBeDefined();
    expect(screen.getByText('2026W42')).toBeDefined();
    expect(screen.getByText('RRP $699')).toBeDefined();
    expect(screen.getByText('$595')).toBeDefined();
    expect(screen.getByText('+1.2%')).toBeDefined();
    expect(screen.getByText('周环比')).toBeDefined();
    expect(screen.getByText('2,281')).toBeDefined();
    expect(screen.getByText('台')).toBeDefined();
    expect(screen.getByLabelText('当前观察点详细数值').id).toBe('volume-detail-0');
  });

  it('销毛成本开关关（默认）：不出成本销毛行', () => {
    const { container } = mount();
    expect(container.textContent).not.toContain('模拟');
    expect(container.textContent).not.toContain('当月成本');
  });

  it('销毛成本开 + 数据就绪：单「模拟」标覆盖 当月成本/单台销毛/销毛率 三值', () => {
    mount({ margin: { kind: 'ready', cost: '$404', margin: '$191', rate: '32.1%' } }, { showMargin: true });
    expect(screen.getAllByText('模拟')).toHaveLength(1);
    expect(screen.getByText('当月成本')).toBeDefined();
    expect(screen.getByText('$404')).toBeDefined();
    expect(screen.getByText('单台销毛')).toBeDefined();
    expect(screen.getByText('$191')).toBeDefined();
    expect(screen.getByText('销毛率')).toBeDefined();
    expect(screen.getByText('32.1%')).toBeDefined();
  });

  it('当月无销毛数据（gap）：三值显 —（竞品/空桶不借用）', () => {
    mount({}, { showMargin: true });
    expect(screen.getByText('当月成本')).toBeDefined();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3);
  });

  it('观察周被隔离：「已隔离 · 不计环比」+ 销毛行合并「价格不可信」', () => {
    mount({ priceSuspect: 'quarantined', wow: null, marginMasked: true }, { showMargin: true });
    expect(screen.getByText('已隔离 · 不计环比')).toBeDefined();
    expect(screen.queryByText('+1.2%')).toBeNull();
    expect(screen.getByText('价格不可信')).toBeDefined();
    expect(screen.getByText('该周已隔离，不计算销毛')).toBeDefined();
  });

  it('缺采值显示 — 不借用；RRP 缺失整段不渲染', () => {
    mount({ rrp: null, price: null, wow: null, volume: null });
    expect(screen.queryByText(/^RRP/)).toBeNull();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3);
  });

  it('跨隔离周小注：wowSkip>0 时胶囊旁挂「跨 N 隔离周」', () => {
    mount({ wowSkip: 2, wowSkipBuckets: ['2026W40', '2026W41'] });
    expect(screen.getByText('跨2隔离周')).toBeDefined();
  });

  it('跟随观察列、右缘自动左翻：列中心靠右时 left 反转到指针左侧', () => {
    const { container, rerender } = mount({}, { x: 50 });
    const tip = () => container.querySelector<HTMLElement>('[aria-label="当前观察点详细数值"]')!;
    expect(tip().style.left).toBe('64px'); // 50 + 14（间距）
    rerender(
      <div style={{ position: 'relative' }}>
        <PanelHoverTip model={BASE} showMargin={false} x={390} plotLeft={0} plotWidth={400} />
      </div>,
    );
    expect(Number.parseFloat(tip().style.left)).toBeLessThan(390); // 390 - 14 - 232（浮窗宽）
  });
});
