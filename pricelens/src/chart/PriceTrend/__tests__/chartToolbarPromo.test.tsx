// ============================================================
// ChartToolbar 大促档期形态回归（2026-11-03 量价页接线）：
// ① 价格页形态 = onPromoBandsOn + onOffersOn 双回调 → 两颗 Checkbox 成组（原行为）；
// ② promoOnly 形态 = 只传 onPromoBandsOn + promoOnly → 仅「大促档期」一颗（量价页）；
// ③ 只传 onPromoBandsOn 不传 promoOnly → 不渲染（原行为：缺 offer 回调不出组）；
// ④ 开关提交走原生 input click（受控 Checkbox）。
// ============================================================
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ChartToolbar from '../ChartToolbar';

afterEach(cleanup);

const checkboxes = (): HTMLInputElement[] =>
  Array.from(document.querySelectorAll('input[type=checkbox]'));

describe('ChartToolbar · 大促档期组形态', () => {
  it('价格页形态：双回调渲染「大促档期」+「促销权益」两颗', () => {
    render(
      <ChartToolbar mode="actions" promoBandsOn={false} onPromoBandsOn={vi.fn()} offersOn={false} onOffersOn={vi.fn()} />,
    );
    expect(screen.getByText('大促档期')).toBeTruthy();
    expect(screen.getByText('促销权益')).toBeTruthy();
    expect(checkboxes()).toHaveLength(2);
  });

  it('promoOnly 形态：只渲染「大促档期」一颗（量价页，无 offer 层）', () => {
    render(<ChartToolbar mode="actions" promoOnly promoBandsOn={false} onPromoBandsOn={vi.fn()} />);
    expect(screen.getByText('大促档期')).toBeTruthy();
    expect(screen.queryByText('促销权益')).toBeNull();
    expect(checkboxes()).toHaveLength(1);
  });

  it('只传 onPromoBandsOn 不传 promoOnly：组不渲染（原行为不变）', () => {
    render(<ChartToolbar mode="actions" promoBandsOn={false} onPromoBandsOn={vi.fn()} />);
    expect(screen.queryByText('大促档期')).toBeNull();
    expect(checkboxes()).toHaveLength(0);
  });

  it('点击原生 input 提交开关（promoOnly 形态）', () => {
    const onPromoBandsOn = vi.fn();
    render(<ChartToolbar mode="actions" promoOnly promoBandsOn={false} onPromoBandsOn={onPromoBandsOn} />);
    const input = screen.getByText('大促档期').closest('label')?.querySelector('input');
    expect(input).toBeTruthy();
    fireEvent.click(input!);
    expect(onPromoBandsOn).toHaveBeenCalledWith(true);
  });
});
