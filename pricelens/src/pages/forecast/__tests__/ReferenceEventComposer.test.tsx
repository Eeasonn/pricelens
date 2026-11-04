// ============================================================
// 推演工作台 v2 · 历史事件补录弹层组件测试（A5 参考卡二轮重构，jsdom）：
// 事件类型五选（色点与锚点同源）、周下拉 +「在图上点选」入口、说明必填
// 校验（首次提交尝试后才报错）、提交载荷（week 非空 + note 去空白）、
// 「仅本次会话 · 历史补录」标识、取消回调。值受控：父层持有 type/week/note。
// ============================================================
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import ReferenceEventComposer, {
  REFERENCE_EVENT_TONES,
  referenceEventTypeLabel,
  type ReferenceComposerValue,
} from '../ReferenceEventComposer';
import { workbenchFixture } from '../workbenchFixture';
import { color } from '../../../theme/tokens';

afterEach(cleanup);

const MATE80 = workbenchFixture.references.lifecyclePool[0];

describe('ReferenceEventComposer · 事件类型（色系与既有锚点同源）', () => {
  it('五个类型选项齐备，选中态切换经 onChange；「其他」为中性灰（非新增语义色）', () => {
    const onChange = vi.fn();
    render(
      <ReferenceEventComposer
        product={MATE80}
        value={{ type: 'competitor-launch', week: null, note: '' }}
        onChange={onChange}
        onPick={vi.fn()}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const group = screen.getByRole('radiogroup', { name: '补录事件类型' });
    const options = [...group.querySelectorAll('[role="radio"]')];
    expect(options.map((o) => o.textContent)).toEqual(['竞品上市', '我司上市', '促销投放', '挤兑', '其他']);
    expect(options[0]?.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('radio', { name: '促销投放' }));
    expect(onChange).toHaveBeenCalledWith({ type: 'promo' });
    // 色源：上市蓝 / 促销琥珀 / 挤兑墨，全部来自既有锚点色（link / warning / ink）
    expect(REFERENCE_EVENT_TONES['competitor-launch']).toBe(color.link);
    expect(REFERENCE_EVENT_TONES.promo).toBe(color.warning);
    expect(REFERENCE_EVENT_TONES.cannibalization).toBe(color.ink);
    expect(referenceEventTypeLabel('other')).toBe('其他');
  });
});

describe('ReferenceEventComposer · 周选择两式（下拉 + 在图上点选）', () => {
  it('周下拉覆盖全生命周期 52 周；选择经 onChange 带生命周期周序（0 基）', async () => {
    const onChange = vi.fn();
    render(
      <ReferenceEventComposer
        product={MATE80}
        value={{ type: 'competitor-launch', week: null, note: '' }}
        onChange={onChange}
        onPick={vi.fn()}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const trigger = screen.getAllByLabelText('选择补录事件周')[0];
    fireEvent.mouseDown(trigger.querySelector('.ant-select-selector') ?? trigger);
    const dropdown = await waitFor(() => {
      const el = document.querySelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');
      if (!el) throw new Error('dropdown 未展开');
      return el;
    });
    const options = [...dropdown.querySelectorAll('.ant-select-item-option')];
    expect(options.length).toBe(52);
    expect(options[0]?.textContent).toBe('W1');
    expect(options[21]?.textContent).toBe('W22');
    fireEvent.click(options[21] as HTMLElement);
    expect(onChange).toHaveBeenCalledWith({ week: 21 });
  });

  it('「在图上点选」触发 onPick（父层收起弹层、面板顶提示条，点完周带值回归）', () => {
    const onPick = vi.fn();
    render(
      <ReferenceEventComposer
        product={MATE80}
        value={{ type: 'promo', week: null, note: '' }}
        onChange={vi.fn()}
        onPick={onPick}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '在图上点选' }));
    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it('点选回归带值：week 受控回填后显示「已选 W..」，已填类型 / 说明不丢，提交携带该周', () => {
    const onSubmit = vi.fn();
    // 模拟父层：先填写类型与说明 → 图上点选返回 week = 21 → 弹层带值回归
    function PickHost() {
      const [value, setValue] = useState<ReferenceComposerValue>({ type: 'promo', week: null, note: '黑五前哨促销' });
      return (
        <div>
          <button type="button" aria-label="模拟点选回归" onClick={() => setValue((prev) => ({ ...prev, week: 21 }))}>
            pick-return
          </button>
          <ReferenceEventComposer
            product={MATE80}
            value={value}
            onChange={(patch) => setValue((prev) => ({ ...prev, ...patch }))}
            onPick={vi.fn()}
            onSubmit={onSubmit}
            onCancel={vi.fn()}
          />
        </div>
      );
    }
    render(<PickHost />);
    fireEvent.click(screen.getByRole('button', { name: '模拟点选回归' }));
    expect(screen.getByText('已选 W22（上市起第 22 周）')).toBeTruthy();
    expect((screen.getByLabelText('补录事件说明（必填）') as HTMLInputElement).value).toBe('黑五前哨促销');
    expect(screen.getByRole('radio', { name: '促销投放' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: '补录到图上' }));
    expect(onSubmit).toHaveBeenCalledWith({ type: 'promo', week: 21, note: '黑五前哨促销' });
  });
});

describe('ReferenceEventComposer · 说明必填与提交', () => {
  it('说明为空：首次提交尝试显示必填错误且不提交；填后提交载荷 = { type, week, note }（去空白）', () => {
    const onSubmit = vi.fn();
    // 受控宿主：value 随输入更新（与父层真实接线一致）
    function NoteHost() {
      const [value, setValue] = useState<ReferenceComposerValue>({ type: 'cannibalization', week: 21, note: '  ' });
      return (
        <ReferenceEventComposer
          product={MATE80}
          value={value}
          onChange={(patch) => setValue((prev) => ({ ...prev, ...patch }))}
          onPick={vi.fn()}
          onSubmit={onSubmit}
          onCancel={vi.fn()}
        />
      );
    }
    render(<NoteHost />);
    fireEvent.click(screen.getByRole('button', { name: '补录到图上' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(document.body.textContent ?? '').toContain('必须填写说明');
    const input = screen.getByLabelText('补录事件说明（必填）') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '  Pura 90 上市挤兑  ' } });
    fireEvent.click(screen.getByRole('button', { name: '补录到图上' }));
    expect(onSubmit).toHaveBeenCalledWith({ type: 'cannibalization', week: 21, note: 'Pura 90 上市挤兑' });
  });

  it('「仅本次会话 · 历史补录」标识在场（作业草稿语义）；取消触发 onCancel', () => {
    const onCancel = vi.fn();
    render(
      <ReferenceEventComposer
        product={MATE80}
        value={{ type: 'other', week: 5, note: '渠道库存补货扰动' }}
        onChange={vi.fn()}
        onPick={vi.fn()}
        onSubmit={vi.fn()}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByText('仅本次会话 · 历史补录')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
