// ============================================================
// 推演工作台 v2 · 量价参考卡（A1 参考卡重构）组件测试：
// 参考池整池开放（lifecyclePool 全池下拉，分组：进主链 / 对照）、
// 上一代槽选择映射 chainRefId 写 params.prevGenReferenceId（受控，
// 由页面持有状态）、对照产品不写主链（卡内标注「对照 · 不影响主图基线」）、
// 友商槽仅卡内查看、缺数不造 0（柱不画 + 「—」注记）、空参照池空态、
// 生产话术（无禁词）、同周龄比值显示来自模型（卡内不另算比值）、
// 智能弹框（主图输入信号 → transient 提示条 → 条目定位事件周 → 可关闭）。
// jsdom 无 ResizeObserver：stub 之；clientWidth 覆写为 600 让图进入就绪态。
// ============================================================
// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ReferencePanel, { type ReferenceInputSignal } from '../ReferencePanel';
import { workbenchFixture, type WorkbenchFixture } from '../workbenchFixture';
import { baseWorkbenchParams, computeWorkbench, type WorkbenchResult } from '../workbenchModel';

beforeAll(() => {
  Element.prototype.setPointerCapture ??= () => undefined;
  Element.prototype.releasePointerCapture ??= () => undefined;
  Element.prototype.hasPointerCapture ??= () => false;
});
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  });
  Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', { configurable: true, value: 600 });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const fixture = workbenchFixture;

interface RenderOptions {
  fixture?: WorkbenchFixture;
  prevGenReferenceId?: string;
  onPrevGenReferenceChange?: (id: string) => void;
  inputSignal?: ReferenceInputSignal | null;
}

function renderPanel(options: RenderOptions = {}) {
  const currentFixture = options.fixture ?? fixture;
  const prevGenReferenceId = options.prevGenReferenceId ?? currentFixture.references.prevGenPool[0]?.id ?? '';
  const onPrevGenReferenceChange = options.onPrevGenReferenceChange ?? vi.fn();
  const params = { ...baseWorkbenchParams(currentFixture), prevGenReferenceId };
  const result: WorkbenchResult = computeWorkbench(currentFixture, params);
  const utils = render(
    <ReferencePanel
      fixture={currentFixture}
      result={result}
      prevGenReferenceId={prevGenReferenceId}
      onPrevGenReferenceChange={onPrevGenReferenceChange}
      inputSignal={options.inputSignal ?? null}
    />,
  );
  return { ...utils, onPrevGenReferenceChange, result };
}

/** 打开 antd Select 并点选可见选项（点击只认虚拟列表里的 .ant-select-item-option，ARIA 镜像 listbox 不可点）。 */
async function pickOption(triggerLabel: string, optionText: string): Promise<void> {
  const trigger = screen.getAllByLabelText(triggerLabel)[0];
  const selector = trigger.querySelector('.ant-select-selector') ?? trigger;
  fireEvent.mouseDown(selector);
  const dropdown = await waitFor(() => {
    const el = document.querySelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');
    if (!el) throw new Error('dropdown 未展开');
    return el;
  });
  const option = [...dropdown.querySelectorAll('.ant-select-item-option')]
    .find((item) => item.textContent === optionText);
  if (!option) throw new Error(`option 未找到：${optionText}`);
  fireEvent.click(option);
}

describe('量价参考卡 · 参考池下拉与主链映射（A1）', () => {
  it('选择池内上一代（Pura 90）映射 chainRefId 写 onPrevGenReferenceChange；卡内视图即时切换到所选产品', async () => {
    const { onPrevGenReferenceChange, rerender } = renderPanel({ prevGenReferenceId: 'ref-mate80' });
    await pickOption('选择上一代参照对象', 'Pura 90 Pro（上上代）');
    expect(onPrevGenReferenceChange).toHaveBeenCalledTimes(1);
    expect(onPrevGenReferenceChange).toHaveBeenCalledWith('ref-pura90');
    // 槽位为卡内视图态：显示即时切到所选产品；父组件应用回调后（prevGenReferenceId = ref-pura90）保持一致
    const shown = document.querySelectorAll('.ant-select-selection-item');
    expect(shown[0]?.textContent).toBe('Pura 90 Pro（上上代）');
    rerender(
      <ReferencePanel
        fixture={fixture}
        result={computeWorkbench(fixture, { ...baseWorkbenchParams(fixture), prevGenReferenceId: 'ref-pura90' })}
        prevGenReferenceId="ref-pura90"
        onPrevGenReferenceChange={() => {}}
        inputSignal={null}
      />,
    );
    const shownAfter = document.querySelectorAll('.ant-select-selection-item');
    expect(shownAfter[0]?.textContent).toBe('Pura 90 Pro（上上代）');
    expect(screen.getAllByText('进主链 · 基线校正')).toHaveLength(1);
  });

  it('池下拉整池开放：上一代槽也能看到友商产品；选友商 = 纯对照（不写主链，双卡出对照标注）', async () => {
    const { onPrevGenReferenceChange } = renderPanel({ prevGenReferenceId: 'ref-mate80' });
    // 默认上一代槽在主链：徽标「进主链 · 基线校正」恰好一处
    expect(screen.getAllByText('进主链 · 基线校正')).toHaveLength(1);
    await pickOption('选择上一代参照对象', 'Galaxy S25（友商同期）');
    expect(onPrevGenReferenceChange).not.toHaveBeenCalled();
    // 两卡均为对照：标注各一处
    expect(screen.getAllByText('对照 · 不影响主图基线')).toHaveLength(2);
    expect(screen.queryByText('进主链 · 基线校正')).toBeNull();
  });

  it('友商选择器仅卡内查看状态：切换不触发 onPrevGenReferenceChange；文案明示对照语义', async () => {
    const { onPrevGenReferenceChange } = renderPanel({ prevGenReferenceId: 'ref-mate80' });
    await pickOption('选择友商参照对象', 'iPhone 17（友商同期）');
    expect(onPrevGenReferenceChange).not.toHaveBeenCalled();
    const text = document.body.textContent ?? '';
    expect(text).toContain('iPhone 17（友商同期）');
    expect(text).toContain('对照 · 不影响主图基线');
    expect(text).toContain('不修改主图基线');
  });

  it('上一代选择语义可见：选择写入主链、经同周龄比值校正主图基线', () => {
    renderPanel({ prevGenReferenceId: 'ref-mate80' });
    const text = document.body.textContent ?? '';
    expect(text).toContain('同周龄比值');
    expect(text).toContain('主图基线校正');
  });
});

describe('量价参考卡 · 缺数纪律（缺数不造 0）', () => {
  it('X200 缺采周（W13、W14）：柱不画（50 根）且显示「—」注记', async () => {
    renderPanel({ prevGenReferenceId: 'ref-mate80' });
    await pickOption('选择友商参照对象', 'X200（友商同期）');
    const text = document.body.textContent ?? '';
    expect(text).toContain('缺数周 W13、W14 显示「—」，不计 0');
    const overlay = Array.from(document.querySelectorAll('svg[role="img"]'))
      .find((node) => (node.getAttribute('aria-label') ?? '').includes('X200'));
    expect(overlay).toBeTruthy();
    // 量柱在独立的 VolumeBars svg 层（VIVO 品牌色半透明），缺采周不画
    const bars = Array.from(document.querySelectorAll('rect')).filter((rect) =>
      (rect.getAttribute('fill') ?? '').startsWith('rgba(38, 147, 202'));
    expect(bars.length).toBe(50);
  });
});

describe('量价参考卡 · 空参照池（A1）', () => {
  it('参考池为空显示「暂无可参照历史」（单空态），不崩溃、不回调', () => {
    const emptyFixture: WorkbenchFixture = {
      ...fixture,
      references: { ...fixture.references, lifecyclePool: [] },
    };
    const { onPrevGenReferenceChange } = renderPanel({ fixture: emptyFixture, prevGenReferenceId: '' });
    expect(screen.getAllByText('暂无可参照历史')).toHaveLength(1);
    expect(onPrevGenReferenceChange).not.toHaveBeenCalled();
  });
});

describe('量价参考卡 · 生产话术与模型比值（禁词 / 只消费模型）', () => {
  it('卡头 hint 为「历史参照」+「仅历史」轻量标识；无禁词（因子 / 首当其冲 / 一定是 /（演示）/ 我司）', () => {
    renderPanel();
    const text = document.body.textContent ?? '';
    expect(text).toContain('历史参照');
    expect(text).toContain('仅历史');
    for (const banned of ['因子', '首当其冲', '一定是', '（演示）', '我司', '置信区间', '无约束需求']) {
      expect(text).not.toContain(banned);
    }
  });

  it('同周龄比值显示来自模型考量（Pura 90 W45 = 40000/45000 = ×0.89），卡内不另算比值', () => {
    renderPanel({ prevGenReferenceId: 'ref-pura90' });
    const text = document.body.textContent ?? '';
    expect(text).toContain('×0.89');
  });

  it('参照缺数（友商 id 被误传为主链参照）时展示模型回退说明「参照缺数，未修正」', () => {
    renderPanel({ prevGenReferenceId: 'ref-ip17' });
    expect(document.body.textContent).toContain('参照缺数，未修正');
  });
});

describe('量价参考卡 · 智能弹框（主图输入 → 参照表现提示条）', () => {
  const signal: ReferenceInputSignal = { seq: 1, kind: 'event', weekLabel: 'W47' };

  it('inputSignal 触发 transient 提示条：列出参照产品类似时间的事件读数', () => {
    renderPanel({ inputSignal: signal });
    expect(screen.getByText('我参考了这些产品')).toBeTruthy();
    const text = document.body.textContent ?? '';
    expect(text).toContain('主图录入产品事件（W47）后');
    expect(text).toContain('Mate 80 618 档期脉冲 +42%×4 周');
    expect(text).toContain('Galaxy S25 首销促销期 −6%×4 周');
  });

  it('点击条目定位到对应事件周（图内窗口缩至 16 周并含事件）；可手动关闭', async () => {
    renderPanel({ inputSignal: signal });
    fireEvent.click(screen.getByRole('button', { name: 'Mate 80 618 档期脉冲 +42%×4 周' }));
    expect(screen.getByText('查看 16/52 周')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('关闭参照提示'));
    expect(screen.queryByText('我参考了这些产品')).toBeNull();
  });

  it('无信号不出现提示条；手动微调信号组稿口径不同（「手动微调」）', () => {
    const { rerender } = renderPanel();
    expect(screen.queryByText('我参考了这些产品')).toBeNull();
    rerender(
      <ReferencePanel
        fixture={fixture}
        result={computeWorkbench(fixture, { ...baseWorkbenchParams(fixture), prevGenReferenceId: 'ref-mate80' })}
        prevGenReferenceId="ref-mate80"
        onPrevGenReferenceChange={() => {}}
        inputSignal={{ seq: 1, kind: 'manual', weekLabel: 'W49' }}
      />,
    );
    expect(screen.getByText('我参考了这些产品')).toBeTruthy();
    expect(document.body.textContent ?? '').toContain('主图手动微调（W49）后');
  });
});
