// ============================================================
// 推演工作台 v2 · 量价参考卡（WP3）组件测试：
// 上一代选择器受控（写入 params.prevGenReferenceId，由页面持有状态）、
// 友商选择器仅卡内对照（不触发主链回调）、缺数不造 0（实线断开 +
// 灰虚桥接 + 「—」）、空参照池空态、生产话术（无禁词）、
// 同周龄比值显示来自模型（卡内不另算比值）。
// ============================================================
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ReferencePanel from '../ReferencePanel';
import { workbenchFixture, type WorkbenchFixture } from '../workbenchFixture';
import { baseWorkbenchParams, computeWorkbench, type WorkbenchResult } from '../workbenchModel';
import { brandColor, color } from '../../../theme/tokens';

afterEach(cleanup);

const fixture = workbenchFixture;

interface RenderOptions {
  fixture?: WorkbenchFixture;
  prevGenReferenceId?: string;
  onPrevGenReferenceChange?: (id: string) => void;
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
    />,
  );
  return { ...utils, onPrevGenReferenceChange };
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

/** 第一块图（上一代卡）内的主品实线路径集合（role="img" 的 svg；antd Select 箭头图标无 role）。 */
function mainPaths(): SVGPathElement[] {
  return Array.from(
    document.querySelectorAll('svg[role="img"]')[0]?.querySelectorAll(`path[stroke="${brandColor.HUAWEI}"]`) ?? [],
  );
}

describe('量价参考卡 · 上一代选择器受控（WP3 Step 1–2）', () => {
  it('选择 Pura 90 必须调用 onPrevGenReferenceChange；受控显示值在父组件更新前保持不变', async () => {
    const { onPrevGenReferenceChange } = renderPanel({ prevGenReferenceId: 'ref-mate80' });
    await pickOption('选择上一代参照对象', 'Pura 90 Pro（上上代）');
    expect(onPrevGenReferenceChange).toHaveBeenCalledTimes(1);
    expect(onPrevGenReferenceChange).toHaveBeenCalledWith('ref-pura90');
    // 受控语义：props 未变时显示仍是当前受控值（不得卡内自改状态）
    const shown = document.querySelectorAll('.ant-select-selection-item');
    expect(shown[0]?.textContent).toBe('Mate 80（上一代）');
  });

  it('友商选择器仅卡内查看状态：切换不触发 onPrevGenReferenceChange；文案明示仅对照、不改主图基线', async () => {
    const { onPrevGenReferenceChange } = renderPanel({ prevGenReferenceId: 'ref-mate80' });
    await pickOption('选择友商参照对象', 'Galaxy S25 促销期');
    expect(onPrevGenReferenceChange).not.toHaveBeenCalled();
    const text = document.body.textContent ?? '';
    expect(text).toContain('Galaxy S25 促销期');
    expect(text).toContain('仅对照');
    expect(text).toContain('不修改主图基线');
  });

  it('上一代选择语义可见：选择写入主链、经同周龄比值校正主图基线', () => {
    renderPanel({ prevGenReferenceId: 'ref-mate80' });
    const text = document.body.textContent ?? '';
    expect(text).toContain('同周龄比值');
    expect(text).toContain('主图基线校正');
  });
});

describe('量价参考卡 · 缺数几何（WP3 Step 2–3）', () => {
  /** W42（index 5）主品销量缺失。 */
  const missingFixture: WorkbenchFixture = {
    ...fixture,
    weeks: fixture.weeks.map((week, index) => (index === 5 ? { ...week, sales: null } : week)),
  };

  it('主品缺数周不得画成零值点：实线在缺失处断开为两段；缺数显示「—」', () => {
    renderPanel({ fixture: missingFixture });
    const paths = mainPaths();
    expect(paths.length).toBeGreaterThan(0);
    const totalStarts = paths.reduce((count, path) => count + ((path.getAttribute('d') ?? '').match(/M/g) ?? []).length, 0);
    expect(totalStarts).toBe(2);
    expect(document.body.textContent).toContain('显示「—」');
  });

  it('跨缺失段用灰虚线桥接（只连缺失两侧有值点，与参照虚线区分）', () => {
    renderPanel({ fixture: missingFixture });
    const firstSvg = document.querySelectorAll('svg[role="img"]')[0];
    const dashed = Array.from(firstSvg?.querySelectorAll(`path[stroke="${color.hairlineStrong}"]`) ?? []);
    const bridge = dashed.find((path) => path.getAttribute('stroke-dasharray') === '2 3');
    expect(bridge).toBeTruthy();
    expect(((bridge?.getAttribute('d') ?? '').match(/M/g) ?? []).length).toBe(1);
  });

  it('无缺数时主品为单一实线段（回归）', () => {
    renderPanel({ prevGenReferenceId: 'ref-mate80' });
    const paths = mainPaths();
    expect(paths.length).toBe(1);
    expect(((paths[0]?.getAttribute('d') ?? '').match(/M/g) ?? []).length).toBe(1);
  });
});

describe('量价参考卡 · 空参照池（WP3 Step 2）', () => {
  it('上一代参照池为空显示「暂无可参照历史」，不崩溃、不回调', () => {
    const emptyFixture: WorkbenchFixture = {
      ...fixture,
      references: { ...fixture.references, prevGenPool: [] },
    };
    const { onPrevGenReferenceChange } = renderPanel({ fixture: emptyFixture, prevGenReferenceId: '' });
    expect(screen.getByText('暂无可参照历史')).toBeTruthy();
    expect(onPrevGenReferenceChange).not.toHaveBeenCalled();
  });

  it('友商参照池为空同样显示空态', () => {
    const emptyFixture: WorkbenchFixture = {
      ...fixture,
      references: { ...fixture.references, competitorPool: [] },
    };
    renderPanel({ fixture: emptyFixture });
    expect(screen.getByText('暂无可参照历史')).toBeTruthy();
  });
});

describe('量价参考卡 · 生产话术与模型比值（WP3 Step 4 / 禁词 / 只消费模型）', () => {
  it('卡头为「历史参照」+「仅历史」轻量标识；无禁词（因子 / 首当其冲 / 一定是 /（演示）/ 我司）', () => {
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
