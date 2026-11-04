// ============================================================
// 推演工作台 v2 · 量价参考卡组件测试（A5 参考卡二轮重构，jsdom）：
// 多面板管理（默认 2 面板；＋ 添加参考下拉分组追加；面板头 × 删除且至少
// 保留 1 个；上一代面板删除 → 主链回退下一个链内面板 / 默认参照）、
// >2 面板单一横滚容器不折行（每格 1/2 可视宽）、共享时间轨（拖柄键盘微调
// → 全部面板窗口联动 + 选区失义清除）、历史事件补录全流程（类型 / 下拉选周 /
// 说明必填 / 在图上点选模式 / 提交锚点上图 / 名录「预标 / 补录」分组与删除）、
// 缺数不造 0、空参照池空态、生产话术（无禁词）、同周龄比值显示来自模型、
// 智能弹框（主图输入信号 → transient 提示条 → 条目定位共享窗口 → 可关闭）。
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

/** 「＋ 添加参考」下拉：点开菜单并点选产品项（菜单挂在 body portal）。 */
async function addRef(productLabel: string): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: '添加参考面板' }));
  const item = await waitFor(() => {
    const el = [...document.querySelectorAll('.ant-dropdown:not(.ant-dropdown-hidden) [role="menuitem"]')]
      .find((node) => node.textContent === productLabel);
    if (!el) throw new Error(`menu item 未找到：${productLabel}`);
    return el;
  });
  fireEvent.click(item);
}

/** 补录弹层作用域（可见 popover，取最后一个 = 最新打开的 portal），隔离历史隐藏 popover。 */
async function visiblePopover(): Promise<HTMLElement> {
  return await waitFor(() => {
    const pops = [...document.querySelectorAll('.ant-popover:not(.ant-popover-hidden)')]
      .filter((el) => (el.textContent ?? '').includes('仅本次会话'));
    const el = pops.pop();
    if (!el) throw new Error('补录弹层未展开');
    return el as HTMLElement;
  });
}

/** 打开指定面板的补录弹层。 */
async function openComposer(productLabel: string): Promise<HTMLElement> {
  fireEvent.click(screen.getByRole('button', { name: `为 ${productLabel} 补录历史事件` }));
  return await visiblePopover();
}

/** 弹层内说明输入（作用域限定，隔离历史隐藏 popover 里的同名输入）。 */
function noteInputIn(popover: HTMLElement): HTMLInputElement {
  const el = popover.querySelector('[aria-label="补录事件说明（必填）"]');
  if (!el) throw new Error('说明输入未找到');
  return el as HTMLInputElement;
}

/** 弹层内提交按钮（按文字定位，作用域限定）。 */
function submitButtonIn(popover: HTMLElement): HTMLElement {
  const el = [...popover.querySelectorAll('button')].find((node) => node.textContent === '补录到图上');
  if (!el) throw new Error('提交按钮未找到');
  return el as HTMLElement;
}

/** 在弹层内经下拉选周（生命周期周序 0 基 → W{week+1}；取最新展开的下拉 portal）。 */
async function pickWeekInPopover(popover: HTMLElement, week: number): Promise<void> {
  const trigger = popover.querySelector('[aria-label="选择补录事件周"]');
  if (!trigger) throw new Error('周下拉未找到');
  fireEvent.mouseDown(trigger.querySelector('.ant-select-selector') ?? trigger);
  const dropdown = await waitFor(() => {
    const el = [...document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')].pop();
    if (!el) throw new Error('周下拉未展开');
    return el;
  });
  const option = [...dropdown.querySelectorAll('.ant-select-item-option')]
    .find((item) => item.textContent === `W${week + 1}`);
  if (!option) throw new Error(`周选项未找到：W${week + 1}`);
  fireEvent.click(option);
}

/** 第 index 个面板的 PointerShield（面板序 = 渲染序）。 */
function shieldOf(container: HTMLElement, index: number): HTMLElement {
  const shields = Array.from(container.querySelectorAll('div'))
    .filter((node) => (node as HTMLElement).style.cursor === 'crosshair');
  const el = shields[index];
  if (!el) throw new Error(`PointerShield #${index} 未找到`);
  return el as HTMLElement;
}

/** 图内 X 轴周标签（svg text，精确匹配；避开名录行 W{n} 拆分文本与时间轨 span）。 */
function hasChartXLabel(label: string): boolean {
  return Array.from(document.querySelectorAll('svg text')).some((node) => node.textContent === label);
}

/** 补录提交已生效（名录落条目；jsdom 无动画事件，离场 popover 壳不卸载，只看功能结果）。 */
async function waitForComposerSubmitted(note: string): Promise<void> {
  await waitFor(() => expect(screen.getByText(note)).toBeTruthy());
}

describe('量价参考卡 · 多面板管理（A5）', () => {
  it('默认 2 面板 = 上一代 Mate 80（进主链徽标恰一处）+ 友商 Galaxy S25（对照）', () => {
    renderPanel({ prevGenReferenceId: 'ref-mate80' });
    expect(screen.getAllByText('Mate 80（上一代）').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Galaxy S25（友商同期）').length).toBeGreaterThan(0);
    expect(screen.getAllByText('进主链 · 基线校正')).toHaveLength(1);
    expect(screen.getAllByText('对照 · 不影响主图基线')).toHaveLength(1);
    // 面板头标注「补录 · 会话内」+ 补录叙述小字
    expect(screen.getAllByText('补录 · 会话内').length).toBe(2);
    expect(screen.getByText('历史事件补录：为已发生的量价变化补记原因（会话内草稿，刷新即清）')).toBeTruthy();
  });

  it('「＋ 添加参考」下拉分组（上一代 · 进主链 / 友商 · 对照）且只列未添加产品；追加上一代面板写主链', async () => {
    const { onPrevGenReferenceChange } = renderPanel({ prevGenReferenceId: 'ref-mate80' });
    fireEvent.click(screen.getByRole('button', { name: '添加参考面板' }));
    const menu = await waitFor(() => {
      const el = document.querySelector('.ant-dropdown:not(.ant-dropdown-hidden)');
      if (!el) throw new Error('菜单未展开');
      return el;
    });
    const groupTitles = [...menu.querySelectorAll('.ant-dropdown-menu-item-group-title')].map((n) => n.textContent);
    expect(groupTitles).toEqual(['上一代 · 进主链', '友商 / 其他 · 对照']);
    const items = [...menu.querySelectorAll('[role="menuitem"]')].map((n) => n.textContent);
    // Mate 80 / Galaxy S25 已添加：不出现
    expect(items).toEqual(['Pura 90 Pro（上上代）', 'iPhone 17（友商同期）', 'X200（友商同期）']);
    const pura = [...menu.querySelectorAll('[role="menuitem"]')]
      .find((node) => node.textContent === 'Pura 90 Pro（上上代）');
    fireEvent.click(pura as HTMLElement);
    expect(onPrevGenReferenceChange).toHaveBeenCalledWith('ref-pura90');
    // 面板数 = 3：删除入口随新面板出现
    expect(screen.getByLabelText('删除参考面板：Pura 90 Pro（上上代）')).toBeTruthy();
  });

  it('>2 面板不折行：单一横滚容器（lpl-card-scroll）+ 每格 1/2 可视宽轨道 + 全面板网格列', async () => {
    const { container } = renderPanel({ prevGenReferenceId: 'ref-mate80' });
    // 2 面板：轨道 = 100%（均分一行）
    const scroll = container.querySelector('.lpl-card-scroll') as HTMLElement;
    expect(scroll).toBeTruthy();
    const inner2 = scroll.firstElementChild as HTMLElement;
    expect(inner2.style.width).toBe('100%');
    expect(inner2.style.minWidth).toBe('880px');
    await addRef('iPhone 17（友商同期）');
    await addRef('Pura 90 Pro（上上代）');
    await addRef('X200（友商同期）');
    // 5 面板：轨道宽 = 2.5 × 可视宽 + 1.5 × 列距（12px）→ 每格恒为可视宽 1/2
    const inner5 = scroll.firstElementChild as HTMLElement;
    expect(inner5.style.width).toBe('calc(250% + 18px)');
    const grid = inner5.firstElementChild as HTMLElement;
    expect(grid.style.gridTemplateColumns).toBe('repeat(5, minmax(0, 1fr))');
    expect(screen.getByLabelText('删除参考面板：X200（友商同期）')).toBeTruthy();
  });

  it('面板删除：面板数递减；至少保留 1 个（最后一个面板 × 删除禁用）', async () => {
    const { onPrevGenReferenceChange } = renderPanel({ prevGenReferenceId: 'ref-mate80' });
    fireEvent.click(screen.getByLabelText('删除参考面板：Galaxy S25（友商同期）'));
    expect(screen.queryByLabelText('删除参考面板：Galaxy S25（友商同期）')).toBeNull();
    expect(onPrevGenReferenceChange).not.toHaveBeenCalled(); // 对照面板不影响主链
    fireEvent.click(screen.getByLabelText('删除参考面板：Mate 80（上一代）'));
    const last = screen.getByLabelText('删除参考面板：Mate 80（上一代）');
    expect(last).toBeTruthy();
    // 只剩 1 个面板时 × 删除禁用，不再回调
    expect((last as HTMLButtonElement).disabled).toBe(true);
    expect(onPrevGenReferenceChange).not.toHaveBeenCalled();
  });

  it('删除上一代面板 → 主链回退：还有链内面板时指向它；无链内面板时回默认参照并在徽标体现', async () => {
    const { onPrevGenReferenceChange, rerender } = renderPanel({ prevGenReferenceId: 'ref-mate80' });
    // 加 Pura 90（写主链 ref-pura90）→ 父层应用回调后徽标切到 Pura 90 面板
    await addRef('Pura 90 Pro（上上代）');
    expect(onPrevGenReferenceChange).toHaveBeenLastCalledWith('ref-pura90');
    rerender(
      <ReferencePanel
        fixture={fixture}
        result={computeWorkbench(fixture, { ...baseWorkbenchParams(fixture), prevGenReferenceId: 'ref-pura90' })}
        prevGenReferenceId="ref-pura90"
        onPrevGenReferenceChange={onPrevGenReferenceChange}
        inputSignal={null}
      />,
    );
    expect(screen.getAllByText('进主链 · 基线校正')).toHaveLength(1);
    // 删 Mate 80（非当前主链面板）→ 不触发主链回调
    fireEvent.click(screen.getByLabelText('删除参考面板：Mate 80（上一代）'));
    expect(onPrevGenReferenceChange).toHaveBeenLastCalledWith('ref-pura90');
    // 再删 Pura 90（唯一链内面板）→ 主链回退默认 ref-mate80，且无面板显示进主链徽标
    fireEvent.click(screen.getByLabelText('删除参考面板：Pura 90 Pro（上上代）'));
    expect(onPrevGenReferenceChange).toHaveBeenLastCalledWith('ref-mate80');
    expect(screen.queryByText('进主链 · 基线校正')).toBeNull();
    // 页面应用回调后（rerender 主链 = 默认），模型比值行兜底在卡底
    rerender(
      <ReferencePanel
        fixture={fixture}
        result={computeWorkbench(fixture, { ...baseWorkbenchParams(fixture), prevGenReferenceId: 'ref-mate80' })}
        prevGenReferenceId="ref-mate80"
        onPrevGenReferenceChange={() => {}}
        inputSignal={null}
      />,
    );
    expect(document.body.textContent ?? '').toContain('主图基线校正');
  });

  it('页面侧重置基准（prevGenReferenceId 外部变化）→ 首个链内面板产品跟随主链参照', () => {
    const { rerender } = renderPanel({ prevGenReferenceId: 'ref-mate80' });
    rerender(
      <ReferencePanel
        fixture={fixture}
        result={computeWorkbench(fixture, { ...baseWorkbenchParams(fixture), prevGenReferenceId: 'ref-pura90' })}
        prevGenReferenceId="ref-pura90"
        onPrevGenReferenceChange={() => {}}
        inputSignal={null}
      />,
    );
    // 默认面板无 Pura 90 → 首个链内面板（Mate 80 槽）产品切换为 Pura 90，徽标进主链
    expect(screen.getAllByText('Pura 90 Pro（上上代）').length).toBeGreaterThan(0);
    expect(screen.getAllByText('进主链 · 基线校正')).toHaveLength(1);
  });
});

describe('量价参考卡 · 共享时间轨（面板窗口联动）', () => {
  it('起点拖柄键盘右移 8 周 → 全部面板 X 标签联动（W1 消失、W9 起显示），时间轨端点标签跟随', () => {
    renderPanel({ prevGenReferenceId: 'ref-mate80' });
    expect(hasChartXLabel('W1')).toBe(true);
    expect(screen.getAllByText('W52').length).toBeGreaterThan(0);
    const handle = screen.getByLabelText('参考时间窗起点拖柄');
    for (let i = 0; i < 8; i++) fireEvent.keyDown(handle, { key: 'ArrowRight' });
    // 两个面板的图 X 标签与时间轨端点全部联动：图内 W1 消失（轨道全域刻度 W1 保留）
    expect(hasChartXLabel('W1')).toBe(false);
    expect(screen.getAllByText('W9').length).toBeGreaterThanOrEqual(3); // 2 图 X 标签 + 轨道端点
    expect(screen.getAllByText('W52').length).toBeGreaterThan(0);
  });

  it('终点拖柄键盘左移钳制最小窗口（8 周）；共享时间轨随窗口更新端点', () => {
    renderPanel({ prevGenReferenceId: 'ref-mate80' });
    const handle = screen.getByLabelText('参考时间窗终点拖柄');
    for (let i = 0; i < 60; i++) fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    // 最小 8 周窗口 [0,7]：起点留在 W1，图内 W52 消失、端点标签到 W8
    expect(hasChartXLabel('W1')).toBe(true);
    expect(hasChartXLabel('W52')).toBe(false);
    expect(screen.getAllByText('W8').length).toBeGreaterThanOrEqual(3);
    expect(screen.getByLabelText('平移参考时间窗')).toBeTruthy();
  });

  it('智能弹框条目定位：点击条目 → 共享窗口平移到事件附近 16 周（全面板联动）', () => {
    renderPanel({ prevGenReferenceId: 'ref-mate80', inputSignal: { seq: 1, kind: 'event', weekLabel: 'W47' } });
    expect(screen.getByText('我参考了这些产品')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Mate 80 618 档期脉冲 +42%×4 周' }));
    // 共享窗口 [16,31]（16 周）：两图 X 标签与轨道端点联动
    expect(screen.getAllByText('W17').length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByText('W32').length).toBeGreaterThanOrEqual(3);
    expect(hasChartXLabel('W1')).toBe(false);
    fireEvent.click(screen.getByLabelText('关闭参照提示'));
    expect(screen.queryByText('我参考了这些产品')).toBeNull();
  });

  it('无信号不出现提示条；信号按面板列出各参照产品事件（对照面板同样进入）', () => {
    renderPanel({ inputSignal: { seq: 1, kind: 'manual', weekLabel: 'W49' } });
    expect(screen.getByText('我参考了这些产品')).toBeTruthy();
    expect(document.body.textContent ?? '').toContain('主图手动微调（W49）后');
    expect(document.body.textContent ?? '').toContain('Mate 80 618 档期脉冲 +42%×4 周');
    expect(document.body.textContent ?? '').toContain('Galaxy S25 首销促销期 −6%×4 周');
  });
});

describe('量价参考卡 · 历史事件补录（「作业」感全流程）', () => {
  it('弹层全流程（下拉选周式）：类型五选 → 选周 → 说明必填校验 → 提交锚点上图 + 名录补录组 → 名录删除', async () => {
    renderPanel({ prevGenReferenceId: 'ref-mate80' });
    const popover = await openComposer('Mate 80（上一代）');
    // 「仅本次会话 · 历史补录」标识
    expect(popover.textContent).toContain('仅本次会话 · 历史补录');
    // 说明必填：不填提交 → 报错且不落名录
    fireEvent.click(screen.getByRole('button', { name: '补录到图上' }));
    expect(popover.textContent).toContain('必须填写说明');
    expect(popover.textContent).toContain('必须选择事件周');
    expect(document.body.textContent ?? '').toContain('预标');
    expect(document.body.textContent ?? '').not.toContain('补录（会话内草稿）');
    // 类型 → 促销投放；周 → W23（周序 22）；说明
    fireEvent.click(screen.getByRole('radio', { name: '促销投放' }));
    await pickWeekInPopover(popover, 22);
    fireEvent.change(noteInputIn(popover), { target: { value: '店庆补贴压价' } });
    fireEvent.click(submitButtonIn(popover));
    // 提交生效：名录出现补录组条目；锚点上图（title 带「补录 ·」前缀）；弹层收起（提示条不出现）
    await waitForComposerSubmitted('店庆补贴压价');
    expect(screen.queryByText('点击图上某周完成补录')).toBeNull();
    expect(Array.from(document.querySelectorAll('svg title')).map((t) => t.textContent ?? ''))
      .toContain('补录 · 促销投放（W23）：店庆补贴压价');
    expect(screen.getByText('补录（会话内草稿）')).toBeTruthy();
    expect(screen.getByText('店庆补贴压价')).toBeTruthy();
    // 名录删除 → 锚点与名录条目消失
    fireEvent.click(screen.getByLabelText('删除补录事件：店庆补贴压价'));
    expect(screen.queryByText('店庆补贴压价')).toBeNull();
    expect(screen.queryByText('补录（会话内草稿）')).toBeNull();
    expect(Array.from(document.querySelectorAll('svg title')).map((t) => t.textContent ?? '').some((t) => t.includes('店庆补贴压价'))).toBe(false);
  });

  it('图上点选式：弹层收起 → 面板顶提示条「点击图上某周完成补录」→ 点周带值回归 → 提交', async () => {
    const { container } = renderPanel({ prevGenReferenceId: 'ref-mate80' });
    await openComposer('Galaxy S25（友商同期）');
    fireEvent.click(screen.getByRole('button', { name: '在图上点选' }));
    // 弹层收起（提示条出现 = 点选态接管）
    expect(screen.getByText('点击图上某周完成补录')).toBeTruthy();
    // 在友商面板（第 2 面板）图上点击窗口内列 1（W2，周序 1）
    const shield = shieldOf(container, 1);
    fireEvent.pointerDown(shield, { pointerId: 7, clientX: 12, clientY: 60 });
    fireEvent.pointerUp(shield, { pointerId: 7, clientX: 12, clientY: 60 });
    // 弹层回归带值（已选 W2），已选类型保留
    const popoverBack = await waitFor(() => {
      const pops = [...document.querySelectorAll('.ant-popover:not(.ant-popover-hidden)')];
      const el = pops.find((p) => (p.textContent ?? '').includes('已选 W2（上市起第 2 周）'));
      if (!el) throw new Error('弹层未回归带值');
      return el as HTMLElement;
    });
    expect(popoverBack.textContent).toContain('已选 W2（上市起第 2 周）');
    fireEvent.change(noteInputIn(popoverBack), { target: { value: '首销促销投放' } });
    fireEvent.click(submitButtonIn(popoverBack));
    await waitForComposerSubmitted('首销促销投放');
    expect(Array.from(document.querySelectorAll('svg title')).map((t) => t.textContent ?? ''))
      .toContain('补录 · 竞品上市（W2）：首销促销投放');
    // 提示条随提交收起
    expect(screen.queryByText('点击图上某周完成补录')).toBeNull();
  });

  it('点选模式可取消：取消补录 → 提示条消失且弹层回归（草稿保留）', async () => {
    renderPanel({ prevGenReferenceId: 'ref-mate80' });
    const popover = await openComposer('Mate 80（上一代）');
    fireEvent.click(screen.getByRole('button', { name: '在图上点选' }));
    expect(screen.getByText('点击图上某周完成补录')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '取消补录点选' }));
    // 取消点选 = 回到弹层继续编辑（草稿不丢）
    await visiblePopover();
    expect(screen.queryByText('点击图上某周完成补录')).toBeNull();
    expect(noteInputIn(popover)).toBeTruthy();
  });

  it('补录按面板产品隔离：两面板各自补录互不影响；删除面板不清其他面板补录', async () => {
    renderPanel({ prevGenReferenceId: 'ref-mate80' });
    let popover = await openComposer('Mate 80（上一代）');
    await pickWeekInPopover(popover, 2);
    fireEvent.change(noteInputIn(popover), { target: { value: '官方降价抢先手' } });
    fireEvent.click(submitButtonIn(popover));
    await waitForComposerSubmitted('官方降价抢先手');
    popover = await openComposer('Galaxy S25（友商同期）');
    await pickWeekInPopover(popover, 3);
    fireEvent.change(noteInputIn(popover), { target: { value: '对比机促销提前' } });
    fireEvent.click(submitButtonIn(popover));
    await waitForComposerSubmitted('对比机促销提前');
    expect(screen.getByText('官方降价抢先手')).toBeTruthy();
    expect(screen.getByText('对比机促销提前')).toBeTruthy();
    // 删除友商面板：Mate 80 的补录草稿保留
    fireEvent.click(screen.getByLabelText('删除参考面板：Galaxy S25（友商同期）'));
    expect(screen.getByText('官方降价抢先手')).toBeTruthy();
    expect(screen.queryByText('对比机促销提前')).toBeNull();
  });
});

describe('量价参考卡 · 缺数纪律 / 空池 / 话术与模型比值', () => {
  it('X200 缺采周（W13、W14）：柱不画（50 根）且显示「—」注记', async () => {
    const { container } = renderPanel({ prevGenReferenceId: 'ref-mate80' });
    await addRef('X200（友商同期）');
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

  it('参考池为空显示「暂无可参照历史」（单空态），不崩溃、不回调', () => {
    const emptyFixture: WorkbenchFixture = {
      ...fixture,
      references: { ...fixture.references, lifecyclePool: [] },
    };
    const { onPrevGenReferenceChange } = renderPanel({ fixture: emptyFixture, prevGenReferenceId: '' });
    expect(screen.getAllByText('暂无可参照历史')).toHaveLength(1);
    expect(onPrevGenReferenceChange).not.toHaveBeenCalled();
  });

  it('卡头 hint 为「历史参照」+「仅历史」轻量标识；无禁词（因子 / 首当其冲 / 一定是 /（演示）/ 我司）', () => {
    renderPanel();
    const text = document.body.textContent ?? '';
    expect(text).toContain('历史参照');
    expect(text).toContain('仅历史');
    for (const banned of ['因子', '首当其冲', '一定是', '（演示）', '我司', '置信区间', '无约束需求']) {
      expect(text).not.toContain(banned);
    }
  });

  it('同周龄比值显示来自模型考量（Pura 90 W45 = ×0.89），卡内不另算比值', () => {
    renderPanel({ prevGenReferenceId: 'ref-pura90' });
    const text = document.body.textContent ?? '';
    expect(text).toContain('×0.89');
  });

  it('参照缺数（误传非池内主链 id）时展示模型回退说明「参照缺数，未修正」', () => {
    renderPanel({ prevGenReferenceId: 'ref-ip17' });
    expect(document.body.textContent).toContain('参照缺数，未修正');
  });
});
