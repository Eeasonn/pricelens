// ============================================================
// WeekDetailCard 组件级测试（2026-11-03 单行摘要条紧凑化 · Eason 拍板
// design-proposals/volume-detail-card-compact.html 方案 A）：
// 单行渲染 / RRP 同值省略与异值删除线 / 缺采 — / 隔离周环比与销毛屏蔽 /
// 迷你销毛行（单「模拟」标）/ 无数据态 / 裁定按钮行 / 本组对比入口。
// 模型级口径（缺采不借用、环比跳隔离周等）见同目录 weekDetail.test.ts。
// ============================================================
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import WeekDetailCard from '../WeekDetailCard';
import type { WeekDetailModel } from '../weekDetail';

afterEach(cleanup);

const BASE: WeekDetailModel = {
  visible: true,
  date: '10-14',
  period: '2026W42',
  wowLabel: '周环比',
  volumeLabel: '周销量',
  rrp: '$595',
  price: '$595',
  wow: { text: '+1.2%', dir: 'up' },
  wowSkip: 0,
  wowSkipBuckets: [],
  marginMasked: false,
  volume: '2,281',
  margin: { kind: 'empty', cost: '', margin: '', rate: '' },
};

function renderCard(model: Partial<WeekDetailModel> = {}, props: Partial<Parameters<typeof WeekDetailCard>[0]> = {}) {
  return render(
    <WeekDetailCard
      model={{ ...BASE, ...model }}
      identity={<span>身份宿主</span>}
      {...props}
    />,
  );
}

describe('WeekDetailCard · 单行摘要条', () => {
  it('常态：身份宿主、日期/桶号、折后价、环比胶囊、销量与本组对比入口同行渲染', () => {
    renderCard({}, { identityActions: <button type="button">本组对比（3）</button> });
    expect(screen.getByText('身份宿主')).toBeDefined();
    expect(screen.getByText('10-14')).toBeDefined();
    expect(screen.getByText('2026W42')).toBeDefined();
    expect(screen.getByText('$595')).toBeDefined();
    expect(screen.getByText('+1.2%')).toBeDefined();
    expect(screen.getByText('2,281')).toBeDefined();
    expect(screen.getByText('台')).toBeDefined();
    expect(screen.getByRole('button', { name: '本组对比（3）' })).toBeDefined();
  });

  it('RRP 同值省略（拍板②）：折后价 = RRP 时不出现 RRP 字样', () => {
    renderCard();
    expect(screen.queryByText(/^RRP/)).toBeNull();
  });

  it('RRP 异值：折后价旁挂「RRP $699」删除线小字', () => {
    renderCard({ rrp: '$699' });
    expect(screen.getByText('RRP $699')).toBeDefined();
    expect(screen.getByText('$595')).toBeDefined();
  });

  it('RRP 缺失时同样省略；缺采值显示 — 不借用', () => {
    renderCard({ rrp: null, price: null, wow: null, volume: null });
    expect(screen.queryByText(/^RRP/)).toBeNull();
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(3);
  });

  it('跨隔离周小注：wowSkip>0 时胶囊旁挂「跨 N 隔离周」', () => {
    renderCard({ wowSkip: 2, wowSkipBuckets: ['2026W40', '2026W41'] });
    expect(screen.getByText('跨2隔离周')).toBeDefined();
  });

  it('观察周被隔离：环比改「已隔离 · 不计环比」，不再出胶囊', () => {
    renderCard({ priceSuspect: 'quarantined', wow: null, marginMasked: true });
    expect(screen.getByText('已隔离 · 不计环比')).toBeDefined();
    expect(screen.queryByText('+1.2%')).toBeNull();
  });

  it('销毛关（显式 false）：不出迷你销毛行', () => {
    const { container } = renderCard({}, { showMargin: false });
    expect(container.textContent).not.toContain('模拟');
    expect(container.textContent).not.toContain('当月成本');
  });

  it('销毛开 + 数据就绪：单「模拟」小标覆盖三值（拍板③）', () => {
    renderCard(
      { margin: { kind: 'ready', cost: '$404', margin: '$191', rate: '32.1%' } },
      { showMargin: true },
    );
    expect(screen.getAllByText('模拟').length).toBe(1);
    expect(screen.getByText('当月成本')).toBeDefined();
    expect(screen.getByText('$404')).toBeDefined();
    expect(screen.getByText('单台销毛')).toBeDefined();
    expect(screen.getByText('$191')).toBeDefined();
    expect(screen.getByText('销毛率')).toBeDefined();
    expect(screen.getByText('32.1%')).toBeDefined();
  });

  it('销毛开但当月无数据：三值显 —（竞品/空桶不借用）', () => {
    const { container } = renderCard({ margin: { kind: 'gap', cost: '', margin: '', rate: '' } }, { showMargin: true });
    expect(container.textContent).toContain('当月成本');
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3);
  });

  it('被隔离周不造销毛：迷你行合并「价格不可信」提示', () => {
    renderCard({ priceSuspect: 'quarantined', wow: null, marginMasked: true }, { showMargin: true });
    expect(screen.getByText('价格不可信')).toBeDefined();
    expect(screen.getByText('该周已隔离，不计算销毛')).toBeDefined();
    expect(screen.queryByText('当月成本')).toBeNull();
  });

  it('无观察点：头部照常渲染（隐藏/店铺入口不随卡消失），指标区显提示', () => {
    renderCard({ visible: false, date: '', period: '' });
    expect(screen.getByText('身份宿主')).toBeDefined();
    expect(screen.getByText('该时间范围内无数据')).toBeDefined();
    expect(screen.queryByText('周环比')).toBeNull();
  });

  it('待核对点：裁定入口「确认真实价格 / 标记异常」整行出现', () => {
    renderCard({ priceSuspect: 'pending' }, { onExempt: vi.fn(), onIsolate: vi.fn() });
    expect(screen.getByRole('button', { name: '确认真实价格' })).toBeDefined();
    expect(screen.getByRole('button', { name: '标记异常' })).toBeDefined();
  });

  it('已确认点：裁定入口不再出现（exempted 态）', () => {
    renderCard({ priceSuspect: 'exempted' }, { onExempt: vi.fn(), onIsolate: vi.fn() });
    expect(screen.queryByRole('button', { name: '确认真实价格' })).toBeNull();
    expect(screen.queryByRole('button', { name: '标记异常' })).toBeNull();
  });

  it('待核对徽标挂在折后价旁；ARIA 摘要语义保留', () => {
    renderCard({ priceSuspect: 'pending' }, { summaryId: 'volume-detail-0' });
    expect(screen.getByText('待核对')).toBeDefined();
    expect(screen.getByLabelText('当前观察点详细数值')).toBeDefined();
  });
});
