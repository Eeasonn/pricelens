// ============================================================
// ChartToolbar compactLeft（2026-11-05 Eason「这些功能就收到左边的设置图标里」）：
// true = 「隐藏对比产品」插槽与 Y 轴范围（自适应/上限/下限）不再占工具行左簇，
// 改渲染在齿轮弹层顶部（分区 对比产品 / Y 轴范围）；齿轮标题改「图表显示设置」，
// Y 轴范围设自定义上下限时齿轮带蓝点。false/缺省 = 既有行为逐字节不变
// （量价页 priceTypesAfter 槽 = 销毛成本开关，保持原位）。
// ============================================================
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ChartToolbar from '../ChartToolbar';
import type { ReactElement } from 'react';

afterEach(cleanup);

const HIDDEN_CTL = (
  <button type="button" data-testid="hidden-compare-ctl">隐藏对比产品</button>
);

const SCALE = { min: 1000, max: 2000, interval: 100 };

function Toolbar(props: { compactLeft?: boolean; yLimit?: { min: number | null; max: number | null } }): ReactElement {
  return (
    <ChartToolbar
      mode="all"
      currency="usd"
      priceTypesAfter={HIDDEN_CTL}
      compactLeft={props.compactLeft}
      yLimit={props.yLimit ?? { min: null, max: null }}
      onYLimit={() => {}}
      yRangeScale={SCALE}
      promoBandsOn={false}
      onPromoBandsOn={() => {}}
      onOffersOn={() => {}}
    />
  );
}

const openGear = (): void => {
  fireEvent.click(screen.getByRole('button', { name: '图表显示设置' }));
};

describe('ChartToolbar compactLeft：左簇收进设置齿轮', () => {
  it('compactLeft：工具行不再渲染 隐藏对比产品 与 上限/下限 输入，齿轮弹层分区承载两者', () => {
    const { container } = render(<Toolbar compactLeft />);
    // 行内：隐藏对比产品按钮与 YLimitInputs 数字框都不出现（右侧开关组 checkbox 除外）
    expect(screen.queryByTestId('hidden-compare-ctl')).toBeNull();
    expect(container.querySelectorAll('input[type="number"], input[type="text"]')).toHaveLength(0);
    // 齿轮可访问名改「图表显示设置」；打开弹层
    openGear();
    expect(screen.getByTestId('hidden-compare-ctl')).toBeTruthy();
    expect(screen.getByText('对比产品')).toBeTruthy();
    expect(screen.getByText('Y 轴范围')).toBeTruthy();
    // 弹层内出现 上限/下限 输入（YLimitInputs 标签语言）
    expect(screen.getByText('上限')).toBeTruthy();
    expect(screen.getByText('下限')).toBeTruthy();
  });

  it('缺省（量价页等既有调用方）：左簇照常占行，弹层无新分区', () => {
    const { container } = render(<Toolbar />);
    expect(screen.getByTestId('hidden-compare-ctl')).toBeTruthy();
    expect(container.querySelectorAll('input').length).toBeGreaterThanOrEqual(2);
    // 既有齿轮可访问名不变
    fireEvent.click(screen.getByRole('button', { name: 'Y 轴显示设置' }));
    expect(screen.queryByText('对比产品')).toBeNull();
    expect(screen.queryByText('Y 轴范围')).toBeNull();
  });

  it('compactLeft + 自定义上下限：齿轮蓝点（已修改）', () => {
    const { container } = render(<Toolbar compactLeft yLimit={{ min: 1200, max: null }} />);
    const gear = screen.getByRole('button', { name: '图表显示设置' });
    // RoundIconButton 蓝点 = active 态的 <i> 角标
    expect(container.querySelector('i[aria-hidden]')).toBeTruthy();
    expect(gear.getAttribute('aria-label')).toBe('图表显示设置');
  });
});
