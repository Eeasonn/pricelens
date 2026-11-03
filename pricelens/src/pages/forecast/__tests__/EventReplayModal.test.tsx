// ============================================================
// 推演工作台 v2 · 主图小事件录入弹窗（WP3）组件测试：
// 四类回放场景全部可达（同类型多场景出「选择历史回放场景」Select）、
// 切类型 / 切场景幅度重取该场景预填值、提交带有效 replayId、
// 窄屏安全（弹窗宽度受视口约束 + 回放区 auto-fit 单列 + 图表 maxWidth、
// footer 不横溢）、文案收缩（标题 / 主按钮 / 教学说明迁 title）、
// 禁词清理（我司 → 本品）。
// ============================================================
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import EventReplayModal from '../EventReplayModal';
import { workbenchFixture } from '../workbenchFixture';
import type { ProductEventSeed } from '../workbenchFixture';

afterEach(cleanup);

const fixture = workbenchFixture;

function renderModal() {
  const onSubmit = vi.fn<(event: Omit<ProductEventSeed, 'id'>) => void>();
  const onCancel = vi.fn();
  render(
    <EventReplayModal
      fixture={fixture}
      forecastWeeks={[{ week: 'W45', weekNumber: 45 }]}
      onSubmit={onSubmit}
      onCancel={onCancel}
    />,
  );
  return { onSubmit, onCancel };
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

function magnitudeInput(): HTMLInputElement {
  return screen.getByLabelText('事件影响幅度（%）') as HTMLInputElement;
}

describe('产品事件弹窗 · 渲染与默认回放（WP3 Step 7）', () => {
  it('标题「新增产品事件 · 历史参照」；主按钮「应用事件」；默认竞品上市回放预填 −6% 且带有效 replayId', () => {
    const { onSubmit } = renderModal();
    expect(screen.getByText('新增产品事件 · 历史参照')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '应用事件' }));
    expect(onSubmit).toHaveBeenCalledWith({
      type: 'competitor-launch',
      label: 'Galaxy S26 Ultra 上市',
      week: 45,
      magnitudePct: -6,
      replayId: 'rp-comp-promo',
    });
    expect(magnitudeInput().value).toContain('-6');
  });
});

describe('产品事件弹窗 · 四类回放场景全部可达（WP3 Step 5）', () => {
  it('同类型多场景出现 aria-label「选择历史回放场景」Select；切场景幅度重取预填值；提交带该场景 replayId', async () => {
    const { onSubmit } = renderModal();
    fireEvent.click(screen.getByRole('radio', { name: '营销价促' }));
    expect((await screen.findAllByLabelText('选择历史回放场景')).length).toBeGreaterThan(0);
    // 默认第一条场景（官方价促）预填 +15%
    expect(magnitudeInput().value).toContain('15');
    // 切到第二条场景（大促降价）→ 幅度重取 +30%，回放说明同步切换
    await pickOption('选择历史回放场景', '大促降价（档期脉冲）');
    expect(magnitudeInput().value).toContain('30');
    expect(screen.getByText('事实回放 · 大促降价（档期脉冲）')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '应用事件' }));
    expect(onSubmit).toHaveBeenCalledWith({
      type: 'own-promo',
      label: '官方电商节价促',
      week: 45,
      magnitudePct: 30,
      replayId: 'rp-promo-sale',
    });
  });

  it('切类型时幅度重置为该类型场景预填值（不残留上一类型手输值）', () => {
    renderModal();
    fireEvent.change(magnitudeInput(), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('radio', { name: '自家品挤兑' }));
    expect(magnitudeInput().value).toContain('-9');
  });
});

describe('产品事件弹窗 · 窄屏安全（WP3 Step 6）', () => {
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
    // antd 两字中文按钮自动插空（取 消）；footer 两键都在可达范围
    expect(screen.getByRole('button', { name: /取\s*消/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: '应用事件' })).toBeTruthy();
  });
});

describe('产品事件弹窗 · 文案与禁词（WP3 Step 7–8）', () => {
  it('教学说明（可改 / 画锚点 / 图下删除）迁 title 不占可见文本；类型 hint 用「本品」不用「我司」', () => {
    renderModal();
    const text = document.body.textContent ?? '';
    // 组件字符串：类型 hint 已用「本品」（fixture 回放段因果句归 WP6 集成阶段统一清理）。
    expect(text).toContain('分流本品同期销量');
    expect(text).not.toContain('分流我司同期销量');
    expect(text).not.toContain('可在图下名录删除');
    expect(text).not.toContain('按回放段预填，可改');
    const titled = document.querySelector<HTMLElement>('[title*="画锚点"]');
    expect(titled?.getAttribute('title') ?? '').toContain('图下名录');
    expect(titled?.getAttribute('title') ?? '').toContain('按回放段预填');
    expect(document.querySelector<HTMLElement>('[title*="按回放段预填"]')).toBeTruthy();
  });
});
