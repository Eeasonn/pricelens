// ============================================================
// 产品事件弹窗 v3 组件测试（forecast-global-ia-review 任务 7 Step 2）：
// 任意起止周闭区间（起周 / 止周选择、反向自动排序、实际起止日期 + 派生周数）、
// 幅度 = 起始峰值、形状递减（默认）/ 恒定可改、名称选填、
// 「预览事件 → 确认应用事件」两步提交（预览显示逐周影响）、
// 回放场景切换（幅度重取预填值 + replayId）、窄屏安全、文案禁词清理。
// 工厂 makeRangeEditorProps 定义在本文件本地（B.6.2 共享工厂不写 UI 工厂）。
// ============================================================
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import EventReplayModal from '../EventReplayModal';
import { workbenchFixture } from '../workbenchFixture';
import type { ProductEventSeed } from '../workbenchFixture';
import { buildForecastCalendar } from '../workbenchCalendar';

afterEach(cleanup);

const fixture = workbenchFixture;
const calendar = buildForecastCalendar(fixture.calendar);

/** 统一预测周的选项（id = 跨年周 ID，label = 同值；与页面 forecastWeekOptions 同构）。 */
const FORECAST_WEEK_OPTIONS = calendar.forecastWeeks.map((week) => ({ id: week.id, label: week.id }));

/** 本地工厂：范围事件编辑器 props（任务 7 Step 2）。 */
function makeRangeEditorProps(onSubmit: (event: Omit<ProductEventSeed, 'id'>) => void) {
  return {
    fixture,
    forecastWeeks: FORECAST_WEEK_OPTIONS,
    onSubmit,
    onCancel: vi.fn(),
  };
}

function renderModal(props: Partial<React.ComponentProps<typeof EventReplayModal>> = {}) {
  const onSubmit = vi.fn<(event: Omit<ProductEventSeed, 'id'>) => void>();
  const onCancel = vi.fn();
  render(
    <EventReplayModal
      {...makeRangeEditorProps(onSubmit)}
      {...props}
      onCancel={props.onCancel ?? onCancel}
    />,
  );
  return { onSubmit, onCancel };
}

/** 打开起周 / 止周选择并点选可见选项（下拉选项为可点击按钮，文本即周 ID）。 */
async function pickWeek(label: '事件起周' | '事件止周', weekId: string): Promise<void> {
  fireEvent.mouseDown(screen.getByLabelText(label));
  const option = await waitFor(() => {
    const el = [...document.querySelectorAll('[role="option"]')]
      .find((node) => (node.textContent ?? '') === weekId && node.getAttribute('aria-disabled') !== 'true');
    if (!el) throw new Error(`option 未找到：${label} ${weekId}`);
    return el as HTMLElement;
  });
  fireEvent.click(option);
}

function magnitudeInput(): HTMLInputElement {
  return screen.getByLabelText('事件影响幅度（%）') as HTMLInputElement;
}

/** 打开同类型回放场景下拉并点选（点击只认可见 dropdown 的 .ant-select-item-option）。 */
async function pickScenario(optionText: string): Promise<void> {
  const trigger = screen.getAllByLabelText('选择历史回放场景')[0];
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

// ============================================================
// 任务 7 Step 2（给定测试）：自由闭区间两步提交
// ============================================================
describe('产品事件弹窗 v3 · 自由范围编辑器（任务 7 Step 2）', () => {
  it('submits a free closed range with optional name and explicit shape', async () => {
    const onSubmit = vi.fn();
    render(<EventReplayModal {...makeRangeEditorProps(onSubmit)} />);
    fireEvent.mouseDown(screen.getByLabelText('事件起周'));
    fireEvent.click(screen.getByText('2026W45'));
    fireEvent.mouseDown(screen.getByLabelText('事件止周'));
    fireEvent.click(screen.getByText('2026W48'));
    fireEvent.click(screen.getByRole('radio', { name: '恒定' }));
    fireEvent.click(screen.getByRole('button', { name: '预览事件' }));
    fireEvent.click(screen.getByRole('button', { name: '确认应用事件' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      startWeekId: '2026W45', endWeekId: '2026W48', decay: 'flat',
    }));
  });

  it('反向选择自动排序：起 2026W47 / 止 2026W45 → 提交同一起止闭区间（起 ≤ 止）', async () => {
    const { onSubmit } = renderModal();
    await pickWeek('事件起周', '2026W47');
    await pickWeek('事件止周', '2026W45');
    fireEvent.click(screen.getByRole('button', { name: '预览事件' }));
    fireEvent.click(screen.getByRole('button', { name: '确认应用事件' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      startWeekId: '2026W45',
      endWeekId: '2026W47',
    }));
  });

  it('始终显示实际起止日期与派生周数；预览显示逐周影响（递减线性衰减）', async () => {
    const { onSubmit } = renderModal();
    await pickWeek('事件起周', '2026W45');
    await pickWeek('事件止周', '2026W48');
    // 幅度（起始峰值）改 +8%。
    fireEvent.change(magnitudeInput(), { target: { value: '8' } });
    const text = document.body.textContent ?? '';
    // 实际起止日期（起周一 2026-11-02，止周日 2026-11-29）+ 派生周数。
    expect(text).toContain('2026-11-02');
    expect(text).toContain('2026-11-29');
    expect(text).toContain('4 周');
    fireEvent.click(screen.getByRole('button', { name: '预览事件' }));
    const preview = screen.getByRole('group', { name: '事件影响预览' });
    // decreasing（默认）：起始峰值 +8%，线性递减 +8% → +6% → +4% → +2%。
    expect(preview.textContent).toContain('2026W45');
    expect(preview.textContent).toContain('+8%');
    expect(preview.textContent).toContain('+2%');
    fireEvent.click(screen.getByRole('button', { name: '确认应用事件' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ decay: 'decreasing', magnitudePct: 8 }));
  });

  it('未选起止周时预览按钮禁用（不阻塞名称）：名称选填、两步提交前可改参数', async () => {
    const { onSubmit } = renderModal();
    const previewButton = screen.getByRole('button', { name: '预览事件' }) as HTMLButtonElement;
    expect(previewButton.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('事件名称（选填）'), { target: { value: '店庆补贴' } });
    expect(previewButton.disabled).toBe(true);
    await pickWeek('事件起周', '2026W50');
    await pickWeek('事件止周', '2027W02');
    expect(previewButton.disabled).toBe(false);
    fireEvent.click(previewButton);
    fireEvent.click(screen.getByRole('button', { name: '确认应用事件' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      label: '店庆补贴',
      startWeekId: '2026W50',
      endWeekId: '2027W02',
    }));
  });
});

// ============================================================
// 迁移：渲染与默认回放（WP3 Step 7 → v3 两步提交契约）
// ============================================================
describe('产品事件弹窗 · 渲染与默认回放', () => {
  it('标题「新增产品事件 · 历史参照」；默认竞品上市回放预填 −6%；两步提交带有效 replayId 与单周范围', async () => {
    const { onSubmit } = renderModal();
    expect(screen.getByText('新增产品事件 · 历史参照')).toBeTruthy();
    expect(magnitudeInput().value).toContain('-6');
    // 单周为特例：起止同周（2026W45）。
    await pickWeek('事件起周', '2026W45');
    await pickWeek('事件止周', '2026W45');
    fireEvent.click(screen.getByRole('button', { name: '预览事件' }));
    fireEvent.click(screen.getByRole('button', { name: '确认应用事件' }));
    expect(onSubmit).toHaveBeenCalledWith({
      type: 'competitor-launch',
      label: 'Galaxy S26 Ultra 上市',
      startWeekId: '2026W45',
      endWeekId: '2026W45',
      magnitudePct: -6,
      decay: 'decreasing',
      replayId: 'rp-comp-promo',
    });
  });
});

// ============================================================
// 回放场景全部可达（WP3 Step 5 → v3 契约）
// ============================================================
describe('产品事件弹窗 · 四类回放场景全部可达', () => {
  it('同类型多场景出现「选择历史回放场景」Select；切场景幅度重取预填值；提交带该场景 replayId', async () => {
    const { onSubmit } = renderModal();
    fireEvent.click(screen.getByRole('radio', { name: '营销价促' }));
    expect((await screen.findAllByLabelText('选择历史回放场景')).length).toBeGreaterThan(0);
    expect(magnitudeInput().value).toContain('15');
    await pickScenario('大促降价（档期脉冲）');
    expect(magnitudeInput().value).toContain('30');
    expect(screen.getByText('事实回放 · 大促降价（档期脉冲）')).toBeTruthy();
    await pickWeek('事件起周', '2026W45');
    await pickWeek('事件止周', '2026W45');
    fireEvent.click(screen.getByRole('button', { name: '预览事件' }));
    fireEvent.click(screen.getByRole('button', { name: '确认应用事件' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      type: 'own-promo',
      magnitudePct: 30,
      replayId: 'rp-promo-sale',
    }));
  });

  it('切类型时幅度重置为该类型场景预填值（不残留上一类型手输值）', () => {
    renderModal();
    fireEvent.change(magnitudeInput(), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('radio', { name: '自家品挤兑' }));
    expect(magnitudeInput().value).toContain('-9');
  });
});

// ============================================================
// 窄屏安全（WP3 Step 6）
// ============================================================
describe('产品事件弹窗 · 窄屏安全', () => {
  it('弹窗宽度受视口约束（390px 不横溢）；回放区 auto-fit 可单列；图表 maxWidth 100%；footer 两键可达', () => {
    renderModal();
    const modal = document.querySelector<HTMLElement>('.ant-modal');
    expect(`${modal?.getAttribute('style') ?? ''} ${modal?.style.width ?? ''}`).toContain('100vw');
    const svg = document.querySelector('svg[aria-label="参考品当时事实回放段"]') as SVGSVGElement | null;
    expect(svg).toBeTruthy();
    expect((svg?.parentElement as HTMLElement)?.style.gridTemplateColumns)
      .toBe('repeat(auto-fit, minmax(min(100%, 300px), 1fr))');
    expect((svg?.parentElement as HTMLElement)?.style.gridTemplateColumns).toContain('min(100%');
    expect(svg?.getAttribute('style') ?? '').toContain('max-width');
    expect(screen.getByRole('button', { name: /取\s*消/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: '预览事件' })).toBeTruthy();
  });
});

// ============================================================
// 文案与禁词（WP3 Step 7–8 → v3 范围口径）
// ============================================================
describe('产品事件弹窗 · 文案与禁词', () => {
  it('教学说明（可改 / 画范围锚 / 名录删除）迁 title 不占可见文本；类型 hint 用「本品」不用「我司」', () => {
    renderModal();
    const text = document.body.textContent ?? '';
    expect(text).toContain('分流本品同期销量');
    expect(text).not.toContain('分流我司同期销量');
    expect(text).not.toContain('可在图下名录删除');
    expect(text).not.toContain('按回放段预填，可改');
    const titled = document.querySelector<HTMLElement>('[title*="画锚点"]');
    expect(titled?.getAttribute('title') ?? '').toContain('图下名录');
    expect(document.querySelector<HTMLElement>('[title*="按回放段预填"]')).toBeTruthy();
    // 范围口径可见：形状默认递减 + 起始峰值说明。
    expect(text).toContain('递减');
    expect(text).toContain('恒定');
    expect(text).toContain('起始峰值');
  });
});
