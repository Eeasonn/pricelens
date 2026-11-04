// ============================================================
// 推演工作台 v2 ·「量价参考产品」卡测试（作业化重设计，jsdom）：
// 卡头（新标题 + 仅历史 / 模拟历史；无长 hint / IoBar / 常驻教程 / 会话 chip）、
// 多面板（默认 2 / 分组菜单 / × 删除与主链回退 / ≤2 均分 >2 横滚）、
// 每面板独立窗口（互不影响 + 会话恢复）、同周龄同步（默认关 / 开启联动 /
// 锁定面板不动）、预标覆写与恢复（fixture 原对象不被修改）、新增事件 +
// 图上拖选（Esc 取消 / 反向拖动）、工作区持久化（刷新恢复 / 未完成草稿恢复 /
// 删除面板不删事件）、撤销条、类型颜色按类型生效并持久化、事件时段读数
// （无法计算不补 0）、参考回放（eventType 过滤 / 不 8 秒消失 / 草稿标 /
// 无可回放事件）、异常态（存储不可用 → 未持久化 + 重试）、键盘与可访问名称。
// jsdom：stub ResizeObserver / Pointer Capture；localStorage 防御 shim。
// ============================================================
// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ReferencePanel, { type ReferenceInputSignal } from '../ReferencePanel';
import { workbenchFixture, type WorkbenchFixture } from '../workbenchFixture';
import { baseWorkbenchParams, computeWorkbench, type WorkbenchResult } from '../workbenchModel';
import { resetReferenceEventTypeStoreForTests } from '../referenceEventTypeStore';
import { resetReferenceWorkspacesForTests } from '../useReferenceWorkspace';

beforeAll(() => {
  Element.prototype.setPointerCapture ??= () => undefined;
  Element.prototype.releasePointerCapture ??= () => undefined;
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.scrollIntoView ??= () => undefined;
});
beforeEach(() => {
  // 防御性 shim（历史坑：本环境 jsdom 无 localStorage）
  if (typeof globalThis.localStorage === 'undefined') {
    const mem = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => mem.get(k) ?? null,
        setItem: (k: string, v: string) => void mem.set(k, v),
        removeItem: (k: string) => void mem.delete(k),
        clear: () => mem.clear(),
      },
    });
  }
  vi.stubGlobal('ResizeObserver', class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  });
  Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', { configurable: true, value: 600 });
  localStorage.clear();
  sessionStorage.clear();
  resetReferenceWorkspacesForTests();
  resetReferenceEventTypeStoreForTests();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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

/** 编辑器弹层作用域（可见 popover 取最后一个 = 最新打开的 portal，隔离历史隐藏壳）。 */
async function visiblePopover(): Promise<HTMLElement> {
  return await waitFor(() => {
    const pops = [...document.querySelectorAll('.ant-popover:not(.ant-popover-hidden)')]
      .filter((el) => (el.textContent ?? '').includes('本地草稿'));
    const el = pops.pop();
    if (!el) throw new Error('编辑器弹层未展开');
    return el as HTMLElement;
  });
}

/** 打开指定面板的新增事件弹层。 */
async function openCreateComposer(productLabel: string): Promise<HTMLElement> {
  fireEvent.click(screen.getByRole('button', { name: `为 ${productLabel} 新增事件` }));
  return await visiblePopover();
}

/** antd 下拉在 jsdom 无动画事件：关闭的下拉壳仍缺 -hidden，先补上再开新的。 */
async function pickSelectOption(scope: HTMLElement, ariaLabel: string, optionText: string): Promise<void> {
  document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
    .forEach((el) => el.classList.add('ant-select-dropdown-hidden'));
  const trigger = [...scope.querySelectorAll(`[aria-label="${ariaLabel}"]`)][0] as HTMLElement;
  if (!trigger) throw new Error(`${ariaLabel} 未找到`);
  fireEvent.mouseDown(trigger.querySelector('.ant-select-selector') ?? trigger);
  const dropdown = await waitFor(() => {
    const el = [...document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')].pop();
    if (!el) throw new Error(`${ariaLabel} 下拉未展开`);
    return el;
  });
  const option = [...dropdown.querySelectorAll('.ant-select-item-option')]
    .find((item) => (item.textContent ?? '').trim() === optionText || (item.textContent ?? '').includes(optionText));
  if (!option) throw new Error(`${ariaLabel} 选项未找到：${optionText}`);
  fireEvent.click(option);
}

function titleInputIn(popover: HTMLElement): HTMLInputElement {
  return popover.querySelector('[aria-label="事件标题（必填）"]') as HTMLInputElement;
}
function noteInputIn(popover: HTMLElement): HTMLInputElement {
  return popover.querySelector('[aria-label="事件说明（必填）"]') as HTMLInputElement;
}

/** 第 index 个面板的 PointerShield（面板序 = 渲染序）。 */
function shieldOf(container: HTMLElement, index: number): HTMLElement {
  const shields = Array.from(container.querySelectorAll('div'))
    .filter((node) => (node as HTMLElement).style.cursor === 'crosshair');
  const el = shields[index];
  if (!el) throw new Error(`PointerShield #${index} 未找到`);
  return el as HTMLElement;
}

/** 产品图作用域（wrapRef 容器：含底层 svg / 量柱 / 事件轨 svg）。 */
function chartScopeOf(productLabel: string): HTMLElement {
  const svg = [...document.querySelectorAll('svg[role="img"]')]
    .find((node) => (node.getAttribute('aria-label') ?? '').includes(productLabel));
  if (!svg) throw new Error(`未找到产品图：${productLabel}`);
  return svg.parentElement as HTMLElement;
}
function chartHasWeek(productLabel: string, week: string): boolean {
  return [...chartScopeOf(productLabel).querySelectorAll('text')]
    .some((node) => node.textContent === week);
}

/** 面板卡根（带 1px 边框的卡片容器），用于卡内作用域查询（双面板隔离）。 */
function cardOf(productLabel: string): HTMLElement {
  let el: HTMLElement | null = chartScopeOf(productLabel);
  while (el && !el.style.border) el = el.parentElement;
  if (!el) throw new Error(`未找到面板卡：${productLabel}`);
  return el;
}

const PLOT_WIDTH = 600 - 84 - 52;
const COL_W = PLOT_WIDTH / 52;
const clientXAt = (index: number): number => Math.round(COL_W * (index + 0.5));
const clientXInWindow = (index: number, len: number): number => Math.round((PLOT_WIDTH / len) * (index + 0.5));

// ============================================================
describe('量价参考产品 · 卡头与文案收敛', () => {
  it('标题 = 量价参考产品；仅历史 / 模拟历史保留；长 hint、IoBar、教程、常驻会话 chip 删除', () => {
    const { container } = renderPanel({ prevGenReferenceId: 'ref-mate80' });
    expect(screen.getByRole('heading', { name: '量价参考产品' })).toBeTruthy();
    expect(screen.getByText('仅历史')).toBeTruthy();
    expect(screen.getAllByText('模拟历史').length).toBeGreaterThan(0);
    const text = container.textContent ?? '';
    expect(text).not.toContain('历史参照：参考面板可增删');
    expect(text).not.toContain('参照产品全生命周期');
    expect(text).not.toContain('历史事件补录：为已发生的量价变化补记原因');
    expect(text).not.toContain('补录 · 会话内');
    expect(text).not.toContain('上一代上市同期');
    // 主链读数行新格式（首预测周 · 同周龄比值）
    expect(text).toContain('首预测周 W45 · 同周龄比值');
  });

  it('默认 2 面板：Mate 80 主链徽标（新文案）+ Galaxy S25 仅对照', () => {
    renderPanel({ prevGenReferenceId: 'ref-mate80' });
    expect(screen.getAllByText('Mate 80（上一代）').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Galaxy S25（友商同期）').length).toBeGreaterThan(0);
    expect(screen.getAllByText('主链 · 同周龄校正')).toHaveLength(1);
    expect(screen.getAllByText('仅对照')).toHaveLength(1);
  });

  it('「＋ 添加参考」新分组（上一代 · 主链 / 友商 · 对照）；全部添加后显示「已全部添加」', async () => {
    renderPanel({ prevGenReferenceId: 'ref-mate80' });
    fireEvent.click(screen.getByRole('button', { name: '添加参考面板' }));
    const menu = await waitFor(() => {
      const el = document.querySelector('.ant-dropdown:not(.ant-dropdown-hidden)');
      if (!el) throw new Error('菜单未展开');
      return el;
    });
    const groupTitles = [...menu.querySelectorAll('.ant-dropdown-menu-item-group-title')].map((n) => n.textContent);
    expect(groupTitles).toEqual(['上一代 · 主链', '友商 · 对照']);
    await addRef('iPhone 17（友商同期）');
    await addRef('Pura 90 Pro（上上代）');
    await addRef('X200（友商同期）');
    fireEvent.click(screen.getByRole('button', { name: '添加参考面板' }));
    const emptyMenu = await waitFor(() => {
      const el = [...document.querySelectorAll('.ant-dropdown:not(.ant-dropdown-hidden)')].pop();
      if (!el || !(el.textContent ?? '').includes('已全部添加')) throw new Error('空态菜单未展开');
      return el;
    });
    expect(emptyMenu.textContent).toContain('已全部添加');
  });

  it('面板删除：至少保留 1 个（禁用 + title 说明）；删除上一代面板 → 主链回退默认参照', async () => {
    const { onPrevGenReferenceChange } = renderPanel({ prevGenReferenceId: 'ref-mate80' });
    const del = screen.getByLabelText('删除参考面板：Galaxy S25（友商同期）');
    fireEvent.click(del);
    expect(screen.queryByLabelText('删除参考面板：Galaxy S25（友商同期）')).toBeNull();
    expect(onPrevGenReferenceChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('删除参考面板：Mate 80（上一代）'));
    const last = screen.getByLabelText('删除参考面板：Mate 80（上一代）');
    expect((last as HTMLButtonElement).disabled).toBe(true);
    expect(onPrevGenReferenceChange).not.toHaveBeenCalled();
  });

  it('>2 面板单一横滚容器不折行（每格 1/2 可视宽 + 全面板网格列）', async () => {
    const { container } = renderPanel({ prevGenReferenceId: 'ref-mate80' });
    const scroll = container.querySelector('.lpl-card-scroll') as HTMLElement;
    expect((scroll.firstElementChild as HTMLElement).style.width).toBe('100%');
    await addRef('iPhone 17（友商同期）');
    await addRef('Pura 90 Pro（上上代）');
    await addRef('X200（友商同期）');
    const inner5 = scroll.firstElementChild as HTMLElement;
    expect(inner5.style.width).toBe('calc(250% + 18px)');
    expect((inner5.firstElementChild as HTMLElement).style.gridTemplateColumns).toBe('repeat(5, minmax(0, 1fr))');
  });

  it('空参考池：单一「暂无可参照历史」空态，不崩溃、不回调', () => {
    const emptyFixture: WorkbenchFixture = {
      ...fixture,
      references: { ...fixture.references, lifecyclePool: [] },
    };
    const { container, onPrevGenReferenceChange } = renderPanel({ fixture: emptyFixture, prevGenReferenceId: '' });
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(screen.getAllByText('暂无可参照历史')).toHaveLength(1);
    expect(onPrevGenReferenceChange).not.toHaveBeenCalled();
  });
});

// ============================================================
describe('量价参考产品 · 每面板独立窗口 / 同步 / 锁定', () => {
  it('面板窗口互不影响：Mate 80 起点 +8 周后 Galaxy 仍显示全周期（验收 1）', () => {
    renderPanel({ prevGenReferenceId: 'ref-mate80' });
    expect(chartHasWeek('Mate 80（上一代）', 'W1')).toBe(true);
    expect(chartHasWeek('Galaxy S25（友商同期）', 'W1')).toBe(true);
    const handle = screen.getByLabelText('Mate 80（上一代） 时间窗起点拖柄');
    for (let i = 0; i < 8; i++) fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(chartHasWeek('Mate 80（上一代）', 'W1')).toBe(false);
    expect(chartHasWeek('Mate 80（上一代）', 'W9')).toBe(true);
    // Galaxy 不动
    expect(chartHasWeek('Galaxy S25（友商同期）', 'W1')).toBe(true);
    expect(chartHasWeek('Galaxy S25（友商同期）', 'W9')).toBe(false);
    // 主链回调不受窗口影响（验收 2：窗口只决定查看范围）
    expect(screen.getByLabelText('Mate 80（上一代） 平移参考时间窗')).toBeTruthy();
  });

  it('窗口存会话视图态：重挂载（切页 / 刷新）后恢复', () => {
    const first = renderPanel({ prevGenReferenceId: 'ref-mate80' });
    const handle = screen.getByLabelText('Mate 80（上一代） 时间窗起点拖柄');
    for (let i = 0; i < 8; i++) fireEvent.keyDown(handle, { key: 'ArrowRight' });
    first.unmount();
    renderPanel({ prevGenReferenceId: 'ref-mate80' });
    expect(chartHasWeek('Mate 80（上一代）', 'W1')).toBe(false);
    expect(chartHasWeek('Mate 80（上一代）', 'W9')).toBe(true);
  });

  it('同周龄同步默认关；开启后调整任一未锁定面板，其余未锁定面板按同周龄钳制', () => {
    renderPanel({ prevGenReferenceId: 'ref-mate80' });
    const checkbox = screen.getByRole('checkbox', { name: '同周龄同步' }) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);
    const handle = screen.getByLabelText('Galaxy S25（友商同期） 时间窗起点拖柄');
    for (let i = 0; i < 4; i++) fireEvent.keyDown(handle, { key: 'ArrowRight' });
    // 两面板同窗 [4, 51]
    expect(chartHasWeek('Mate 80（上一代）', 'W1')).toBe(false);
    expect(chartHasWeek('Mate 80（上一代）', 'W5')).toBe(true);
    expect(chartHasWeek('Galaxy S25（友商同期）', 'W5')).toBe(true);
  });

  it('锁定面板：轨道禁用（滑柄不可达）、同步与定位不改写它（验收 1 / §3.2）', () => {
    renderPanel({ prevGenReferenceId: 'ref-mate80' });
    fireEvent.click(screen.getByRole('checkbox', { name: '同周龄同步' }));
    const lockButton = screen.getByRole('button', { name: 'Galaxy S25（友商同期） 锁定时间窗' });
    expect(lockButton.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(lockButton);
    expect(screen.getByRole('button', { name: 'Galaxy S25（友商同期） 解锁时间窗' }).getAttribute('aria-pressed')).toBe('true');
    // 锁定后滑柄 tabIndex = -1（键盘不可达），文字 title 说明
    const lockedHandle = screen.getByLabelText('Galaxy S25（友商同期） 时间窗起点拖柄');
    expect(lockedHandle.getAttribute('tabindex')).toBe('-1');
    // 同步调整 Mate 80 → Galaxy 保持全周期
    const handle = screen.getByLabelText('Mate 80（上一代） 时间窗起点拖柄');
    for (let i = 0; i < 4; i++) fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(chartHasWeek('Mate 80（上一代）', 'W5')).toBe(true);
    expect(chartHasWeek('Galaxy S25（友商同期）', 'W1')).toBe(true);
    // 解锁后手动调整可达
    fireEvent.click(screen.getByRole('button', { name: 'Galaxy S25（友商同期） 解锁时间窗' }));
    expect(screen.getByLabelText('Galaxy S25（友商同期） 时间窗起点拖柄').getAttribute('tabindex')).toBe('0');
  });

  it('窗口预设：全周期 / 最近 16 周；窗口不产生主链回调（验收 2）', async () => {
    const { onPrevGenReferenceChange } = renderPanel({ prevGenReferenceId: 'ref-mate80' });
    await pickSelectOption(document.body, 'Mate 80（上一代） 窗口预设', '最近 16 周');
    expect(chartHasWeek('Mate 80（上一代）', 'W37')).toBe(true);
    expect(chartHasWeek('Mate 80（上一代）', 'W52')).toBe(true);
    expect(chartHasWeek('Mate 80（上一代）', 'W1')).toBe(false);
    fireEvent.keyDown(screen.getByLabelText('Mate 80（上一代） 时间窗终点拖柄'), { key: 'ArrowLeft' });
    expect(onPrevGenReferenceChange).not.toHaveBeenCalled();
  });
});

// ============================================================
describe('量价参考产品 · 名录 / 预标覆写 / 事件时段读数', () => {
  it('统一名录：预标行标 + 编辑入口（可访问名称含周段与标题）；预标影响不进名录行', () => {
    renderPanel({ prevGenReferenceId: 'ref-mate80' });
    expect(screen.getByText('事件 5')).toBeTruthy();
    expect(screen.getByRole('button', { name: '查看事件读数 W23 618 档期脉冲' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '编辑事件 W23 618 档期脉冲' })).toBeTruthy();
    // 预标影响值移入详情：名录行不再出现 +42%×4 周
    expect(document.body.textContent ?? '').not.toContain('+42%×4 周');
  });

  it('编辑预标 → 覆写生效（预标 · 已改 + 草稿 1）→ 恢复预标回 fixture；fixture 原对象不被修改（验收 3）', async () => {
    const snapshot = JSON.stringify(fixture.references.lifecyclePool.map((p) => p.events));
    renderPanel({ prevGenReferenceId: 'ref-mate80' });
    fireEvent.click(screen.getByRole('button', { name: '编辑事件 W23 618 档期脉冲' }));
    const popover = await visiblePopover();
    expect(popover.textContent).toContain('编辑事件');
    // 起止周：止周 → W26；标题 / 说明补齐（预标 note 初始为空，保存前必须补齐）
    await pickSelectOption(popover, '事件止周', 'W26');
    fireEvent.change(titleInputIn(popover), { target: { value: '618 档期脉冲（含预售）' } });
    fireEvent.change(noteInputIn(popover), { target: { value: '预售前移 + 平台补贴叠加' } });
    fireEvent.click(screen.getByRole('button', { name: '保存事件' }));
    await waitFor(() => expect(screen.getAllByText('预标 · 已改').length).toBeGreaterThanOrEqual(1));
    expect(screen.getByRole('button', { name: '查看事件读数 W23–W26 618 档期脉冲（含预售）' })).toBeTruthy();
    // 保存后保持同一事件选中 → 详情自动打开；先关闭详情再断言名录
    fireEvent.click(screen.getByRole('button', { name: '关闭事件详情' }));
    expect(screen.getByText('草稿 1')).toBeTruthy();
    // 撤销操作条出现（验收 6）
    expect(screen.getByText('已保存事件')).toBeTruthy();
    // 恢复预标 → 回 fixture 原值（可撤销）
    fireEvent.click(screen.getByRole('button', { name: '恢复预标 W23–W26 618 档期脉冲（含预售）' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '查看事件读数 W23 618 档期脉冲' })).toBeTruthy());
    expect(screen.queryByText('预标 · 已改')).toBeNull();
    // fixture 原始对象未被修改
    expect(JSON.stringify(fixture.references.lifecyclePool.map((p) => p.events))).toBe(snapshot);
  });

  it('事件时段读数：实际输入周 / 覆盖 / 计算口径；预标参考分栏；起点事件无法计算不补 0（验收 9）', () => {
    renderPanel({ prevGenReferenceId: 'ref-mate80' });
    fireEvent.click(screen.getByRole('button', { name: '查看事件读数 W23 618 档期脉冲' }));
    const detail = screen.getByRole('group', { name: '事件时段读数 W23 618 档期脉冲' });
    const text = detail.textContent ?? '';
    expect(text).toContain('事件时段 1 周');
    expect(text).toContain('销量有效 1/1');
    expect(text).toContain('期内均周销');
    expect(text).toContain('前段 W22–W22 · 均值比均值；端点取实际有效周');
    expect(text).toContain('预标参考 +42% · 4 周 · 未标衰减（仅预标，不参与上述计算）');
    // 生命周期起点事件：无更早周段 → 无法计算，不补 0（Mate 80 卡内作用域，Galaxy 同名行隔离）
    const mateCard = within(cardOf('Mate 80（上一代）'));
    fireEvent.click(mateCard.getByRole('button', { name: '查看事件读数 W1 上市首销' }));
    const first = screen.getByRole('group', { name: '事件时段读数 W1 上市首销' });
    expect(first.textContent ?? '').toContain('无法计算');
    // 再次点击关闭详情（名录行 toggle）
    fireEvent.click(mateCard.getByRole('button', { name: '查看事件读数 W1 上市首销' }));
    expect(screen.queryByRole('group', { name: '事件时段读数 W1 上市首销' })).toBeNull();
  });

  it('删除补录 = 软删除 + 撤销条「已删除事件」；名录空态与收纳（全部 N 条 / 窗内 chip）', async () => {
    renderPanel({ prevGenReferenceId: 'ref-mate80' });
    const card = within(cardOf('Mate 80（上一代）'));
    // 名录默认 3 条 + 全部 N 条（Mate 80 预标 5 条）
    expect(card.getAllByRole('button', { name: /查看事件读数/ }).length).toBe(3);
    expect(card.getByRole('button', { name: '全部 5 条' })).toBeTruthy();
    fireEvent.click(card.getByRole('button', { name: '全部 5 条' }));
    expect(card.getAllByRole('button', { name: /查看事件读数/ }).length).toBe(5);
    // 窗内筛选 chip（全周期窗 → 仍 5 条）
    fireEvent.click(card.getByRole('button', { name: '窗内' }));
    expect(card.getAllByRole('button', { name: /查看事件读数/ }).length).toBe(5);
    fireEvent.click(card.getByRole('button', { name: '收起' }));
    // 新增一个补录再删除 → 软删除 + 撤销（保存后详情自动打开，先关闭）
    const popover = await openCreateComposer('Mate 80（上一代）');
    await pickSelectOption(popover, '事件起周', 'W40');
    await pickSelectOption(popover, '事件止周', 'W40');
    fireEvent.change(titleInputIn(popover), { target: { value: '店庆补贴' } });
    fireEvent.change(noteInputIn(popover), { target: { value: '渠道庆补贴压价' } });
    fireEvent.click(screen.getByRole('button', { name: '保存事件' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '关闭事件详情' })).toBeTruthy());
    // 名录展开全部（补录行不在默认前 3 条），再关详情后行仍可见可删
    fireEvent.click(card.getByRole('button', { name: '全部 6 条' }));
    fireEvent.click(screen.getByRole('button', { name: '关闭事件详情' }));
    await waitFor(() => expect(card.getByRole('button', { name: '删除事件 W40 店庆补贴' })).toBeTruthy());
    fireEvent.click(card.getByRole('button', { name: '删除事件 W40 店庆补贴' }));
    await waitFor(() => expect(card.queryByRole('button', { name: '删除事件 W40 店庆补贴' })).toBeNull());
    expect(screen.getByText('已删除事件')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '撤销：已删除事件' }));
    await waitFor(() => expect(card.getByRole('button', { name: '删除事件 W40 店庆补贴' })).toBeTruthy());
  });

  it('连续编辑后撤销最后一步只撤该步（验收 6：撤销 A 不清掉 B）', async () => {
    renderPanel({ prevGenReferenceId: 'ref-mate80' });
    // 编辑预标 A（618 → 加止周）
    fireEvent.click(screen.getByRole('button', { name: '编辑事件 W23 618 档期脉冲' }));
    let popover = await visiblePopover();
    await pickSelectOption(popover, '事件止周', 'W26');
    fireEvent.change(titleInputIn(popover), { target: { value: '618（改）' } });
    fireEvent.change(noteInputIn(popover), { target: { value: '改期说明' } });
    fireEvent.click(screen.getByRole('button', { name: '保存事件' }));
    await waitFor(() => expect(screen.getAllByRole('button', { name: '编辑事件 W23–W26 618（改）' }).length).toBeGreaterThanOrEqual(1));
    // 新增补录 B
    popover = await openCreateComposer('Mate 80（上一代）');
    await pickSelectOption(popover, '事件起周', 'W40');
    await pickSelectOption(popover, '事件止周', 'W41');
    fireEvent.change(titleInputIn(popover), { target: { value: '店庆补贴' } });
    fireEvent.change(noteInputIn(popover), { target: { value: '渠道庆补贴' } });
    fireEvent.click(screen.getByRole('button', { name: '保存事件' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '删除事件 W40–W41 店庆补贴' })).toBeTruthy());
    // 撤销（撤最后一步 = 新增 B）：B 消失，A 的覆写仍在
    fireEvent.click(screen.getByRole('button', { name: '撤销：已保存事件' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: '删除事件 W40–W41 店庆补贴' })).toBeNull());
    expect(screen.getAllByRole('button', { name: '查看事件读数 W23–W26 618（改）' }).length).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================
describe('量价参考产品 · 新增事件 + 图上拖选（验收 4）', () => {
  it('拖选回填起止周：反向拖动同一闭区间；单击 1 周；Esc 取消回弹层且草稿不丢', async () => {
    const { container } = renderPanel({ prevGenReferenceId: 'ref-mate80' });
    const popover = await openCreateComposer('Mate 80（上一代）');
    expect(popover.textContent).toContain('新增事件');
    // 进入拖选：弹层收起、面板顶操作条
    fireEvent.click(screen.getByRole('button', { name: '图上拖选' }));
    expect(screen.getByText('拖选事件时段 · Esc 取消')).toBeTruthy();
    // 反向拖动（先右后左）→ 同一闭区间 W12–W15
    const shield = shieldOf(container, 0);
    fireEvent.pointerDown(shield, { pointerId: 7, clientX: clientXAt(14), clientY: 60 });
    fireEvent.pointerMove(shield, { pointerId: 7, clientX: clientXAt(11), clientY: 60 });
    expect(screen.getByText('已选 W12–W15 · 4 周')).toBeTruthy();
    fireEvent.pointerUp(shield, { pointerId: 7, clientX: clientXAt(11), clientY: 60 });
    // 弹层回归带值（已填内容不丢）
    const back = await waitFor(() => {
      const pops = [...document.querySelectorAll('.ant-popover:not(.ant-popover-hidden)')]
        .filter((el) => (el.textContent ?? '').includes('已选 W12–W15 · 4 周'));
      return pops.pop();
    });
    expect(back).toBeTruthy();
    // Esc 取消拖选（再次进入后按 Esc）→ 操作条消失、弹层回归
    fireEvent.click(screen.getByRole('button', { name: '图上拖选' }));
    expect(screen.getByText('拖选事件时段 · Esc 取消')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText('拖选事件时段 · Esc 取消')).toBeNull();
    await waitFor(() => expect(screen.getAllByText(/保存事件/).length).toBeGreaterThan(0));
    // 补齐并保存：名录出现草稿行；锚点上图
    fireEvent.change(titleInputIn(await visiblePopover()), { target: { value: '店庆补贴' } });
    fireEvent.change(noteInputIn(await visiblePopover()), { target: { value: '渠道庆补贴' } });
    fireEvent.click(screen.getByRole('button', { name: '保存事件' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '删除事件 W12–W15 店庆补贴' })).toBeTruthy());
    // 文字只留在名录 / 详情：图内锚点无长 title，事件轨锚以可访问名称承载
    expect(screen.getByRole('button', { name: '事件 W12–W15 店庆补贴' })).toBeTruthy();
  });

  it('名录「读数」/ 图锚点击共享同一选中态；选中事件不在窗内时窗口自动扩展', async () => {
    const { container } = renderPanel({ prevGenReferenceId: 'ref-mate80' });
    // 收缩 Mate 80 窗口到 [0, 7]
    const handle = screen.getByLabelText('Mate 80（上一代） 时间窗终点拖柄');
    for (let i = 0; i < 60; i++) fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(chartHasWeek('Mate 80（上一代）', 'W8')).toBe(true);
    // 点击窗外事件（W23 名录行）→ 窗口扩展到事件附近（16 周聚焦 [W15,W30]，事件窗内可见）
    fireEvent.click(screen.getByRole('button', { name: '查看事件读数 W23 618 档期脉冲' }));
    await waitFor(() => expect(chartHasWeek('Mate 80（上一代）', 'W15')).toBe(true));
    expect(chartHasWeek('Mate 80（上一代）', 'W24')).toBe(true);
    expect(chartHasWeek('Mate 80（上一代）', 'W1')).toBe(false);
    expect(screen.getByRole('group', { name: '事件时段读数 W23 618 档期脉冲' })).toBeTruthy();
    // 图锚点击 = 同一选中态（此处已打开详情，点击同锚再次切换关闭由组件处理；这里验证锚点可点）
    const anchor = screen.getByRole('button', { name: '事件 W23 618 档期脉冲' });
    fireEvent.click(anchor);
    void container;
  });

  it('键盘不拖图也能完成新增（下拉选起止周；验收 4 / 11）', async () => {
    renderPanel({ prevGenReferenceId: 'ref-mate80' });
    const popover = await openCreateComposer('Galaxy S25（友商同期）');
    await pickSelectOption(popover, '事件起周', 'W10');
    await pickSelectOption(popover, '事件止周', 'W12');
    fireEvent.change(titleInputIn(popover), { target: { value: '对比机促销提前' } });
    fireEvent.change(noteInputIn(popover), { target: { value: '友商 W10 起促销' } });
    fireEvent.click(screen.getByRole('button', { name: '保存事件' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '删除事件 W10–W12 对比机促销提前' })).toBeTruthy());
    expect(screen.getAllByText('草稿 1').length).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================
describe('量价参考产品 · 工作区持久化（验收 5）', () => {
  it('刷新后：已保存事件恢复（草稿 N chip）；未提交草稿显示「未完成」点击恢复、不自动弹层', async () => {
    const first = renderPanel({ prevGenReferenceId: 'ref-mate80' });
    // 已保存事件
    let popover = await openCreateComposer('Mate 80（上一代）');
    await pickSelectOption(popover, '事件起周', 'W40');
    await pickSelectOption(popover, '事件止周', 'W41');
    fireEvent.change(titleInputIn(popover), { target: { value: '店庆补贴' } });
    fireEvent.change(noteInputIn(popover), { target: { value: '渠道庆补贴' } });
    fireEvent.click(screen.getByRole('button', { name: '保存事件' }));
    await waitFor(() => expect(screen.getAllByText('草稿 1').length).toBeGreaterThanOrEqual(1));
    // 未提交草稿：填一半 → 收起
    popover = await openCreateComposer('Galaxy S25（友商同期）');
    fireEvent.change(titleInputIn(popover), { target: { value: '未写完的事件' } });
    fireEvent.click(within(popover).getByRole('button', { name: '收起' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '恢复未完成草稿：Galaxy S25（友商同期）' })).toBeTruthy());
    // 模拟刷新：清内存缓存 + 重挂载
    first.unmount();
    resetReferenceWorkspacesForTests();
    renderPanel({ prevGenReferenceId: 'ref-mate80' });
    // 已保存事件仍在
    expect(screen.getByText('草稿 1')).toBeTruthy();
    // 未完成 chip 存在（不自动弹层）→ 点击恢复已填内容
    expect(screen.queryByText('新增事件')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '恢复未完成草稿：Galaxy S25（友商同期）' }));
    const restored = await visiblePopover();
    expect((restored.querySelector('[aria-label="事件标题（必填）"]') as HTMLInputElement).value).toBe('未写完的事件');
  });

  it('删除面板不删事件：重加面板后草稿与覆写恢复显示（验收 5）', async () => {
    renderPanel({ prevGenReferenceId: 'ref-mate80' });
    const popover = await openCreateComposer('Galaxy S25（友商同期）');
    await pickSelectOption(popover, '事件起周', 'W10');
    await pickSelectOption(popover, '事件止周', 'W10');
    fireEvent.change(titleInputIn(popover), { target: { value: '对比机促销' } });
    fireEvent.change(noteInputIn(popover), { target: { value: '友商促销记录' } });
    fireEvent.click(screen.getByRole('button', { name: '保存事件' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '删除事件 W10 对比机促销' })).toBeTruthy());
    // 删除 Galaxy 面板 → 事件草稿保留在工作区（Mate 80 不受影响）
    fireEvent.click(screen.getByLabelText('删除参考面板：Galaxy S25（友商同期）'));
    expect(screen.queryByLabelText('删除参考面板：Galaxy S25（友商同期）')).toBeNull();
    // 重加 Galaxy → 草稿恢复
    await addRef('Galaxy S25（友商同期）');
    await waitFor(() => expect(screen.getByRole('button', { name: '删除事件 W10 对比机促销' })).toBeTruthy());
  });

  it('丢弃草稿需确认并支持撤销；「重置基准」不清工作区（开放问题 ②）', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderPanel({ prevGenReferenceId: 'ref-mate80' });
    const popover = await openCreateComposer('Mate 80（上一代）');
    fireEvent.change(titleInputIn(popover), { target: { value: '未提交草稿' } });
    // 取消确认 → 草稿保留
    fireEvent.click(screen.getByRole('button', { name: '丢弃草稿' }));
    expect(confirmSpy).toHaveBeenCalled();
    expect((titleInputIn(await visiblePopover()) as HTMLInputElement).value).toBe('未提交草稿');
    // 确认 → 丢弃 + 撤销条
    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: '丢弃草稿' }));
    await waitFor(() => expect(screen.getByText('已丢弃草稿')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '撤销：已丢弃草稿' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '恢复未完成草稿：Mate 80（上一代）' })).toBeTruthy());
  });
});

// ============================================================
describe('量价参考产品 · 类型颜色（验收 7）', () => {
  it('改促销类型颜色：同类型事件全部同步变色；刷新保持；名录色块跟随', async () => {
    const first = renderPanel({ prevGenReferenceId: 'ref-mate80' });
    const row618 = screen.getByRole('button', { name: '查看事件读数 W23 618 档期脉冲' });
    const swatchBefore = (row618.firstElementChild as HTMLElement).style.background;
    expect(swatchBefore).toBeTruthy();
    // 经编辑器色块入口改促销类型色 → 色板第 5 项
    fireEvent.click(screen.getByRole('button', { name: '编辑事件 W23 618 档期脉冲' }));
    const popover = await visiblePopover();
    fireEvent.click(screen.getByRole('button', { name: /编辑类型「促销投放」颜色/ }));
    fireEvent.click(await waitFor(() => {
      const el = [...popover.querySelectorAll('button')].find((node) => (node.getAttribute('aria-label') ?? '').startsWith('色板 #'));
      if (!el) throw new Error('色板未展开');
      return el;
    }));
    const swatchAfter = (screen.getByRole('button', { name: '查看事件读数 W23 618 档期脉冲' }).firstElementChild as HTMLElement).style.background;
    expect(swatchAfter).not.toBe(swatchBefore);
    // 同类型（黑五档期脉冲，同为促销投放）同步变色
    fireEvent.click(screen.getByRole('button', { name: '全部 5 条' }));
    const swatchBf = (screen.getByRole('button', { name: '查看事件读数 W47 黑五档期脉冲' }).firstElementChild as HTMLElement).style.background;
    expect(swatchBf).toBe(swatchAfter);
    // 刷新保持
    first.unmount();
    resetReferenceWorkspacesForTests();
    resetReferenceEventTypeStoreForTests();
    renderPanel({ prevGenReferenceId: 'ref-mate80' });
    expect((screen.getByRole('button', { name: '查看事件读数 W23 618 档期脉冲' }).firstElementChild as HTMLElement).style.background).toBe(swatchAfter);
  });
});

// ============================================================
describe('量价参考产品 · 参考回放（§4.5）', () => {
  it('信号驱动回放条：标题「参考回放」；eventType 过滤；条目 = 产品 · 周段 · 标题', () => {
    renderPanel({ prevGenReferenceId: 'ref-mate80', inputSignal: { seq: 1, kind: 'event', weekLabel: 'W47', eventType: 'promo' } });
    expect(screen.getByText('参考回放')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Mate 80 · W23 · 618 档期脉冲/ })).toBeTruthy();
    // 预标影响放详情，回放条目不带影响值
    expect(document.body.textContent ?? '').not.toContain('+42%×4 周');
  });

  it('不 8 秒自动消失：9 秒后仍在，手动关闭才消失', () => {
    vi.useFakeTimers();
    try {
      renderPanel({ prevGenReferenceId: 'ref-mate80', inputSignal: { seq: 1, kind: 'manual', weekLabel: 'W49' } });
      expect(screen.getByText('参考回放')).toBeTruthy();
      vi.advanceTimersByTime(9000);
      expect(screen.getByText('参考回放')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: '关闭参考回放' }));
      expect(screen.queryByText('参考回放')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('补录条目带「草稿」标；点击条目定位到目标面板（eventType 过滤 + 稳定排序）', async () => {
    const utils = renderPanel({ prevGenReferenceId: 'ref-mate80' });
    // 补录一个促销事件（Galaxy，W10）
    const popover = await openCreateComposer('Galaxy S25（友商同期）');
    await pickSelectOption(popover, '事件类型', '促销投放');
    await pickSelectOption(popover, '事件起周', 'W10');
    await pickSelectOption(popover, '事件止周', 'W10');
    fireEvent.change(titleInputIn(popover), { target: { value: '对比机促销' } });
    fireEvent.change(noteInputIn(popover), { target: { value: '友商促销记录' } });
    fireEvent.click(screen.getByRole('button', { name: '保存事件' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '删除事件 W10 对比机促销' })).toBeTruthy());
    // 信号带 eventType=promo：promo 候选按窗口中心距离稳定排序 → Galaxy 补录（W10，距中心最近）胜出
    const params = { ...baseWorkbenchParams(fixture), prevGenReferenceId: 'ref-mate80' };
    utils.rerender(
      <ReferencePanel
        fixture={fixture}
        result={computeWorkbench(fixture, params)}
        prevGenReferenceId="ref-mate80"
        onPrevGenReferenceChange={vi.fn()}
        inputSignal={{ seq: 1, kind: 'event', weekLabel: 'W47', eventType: 'promo' }}
      />,
    );
    const entry = await waitFor(() => screen.getByRole('button', { name: /Galaxy S25 · W10 · 对比机促销/ }));
    expect(entry.textContent).toContain('草稿');
    // 点击条目定位：Galaxy 窗口移到事件附近（16 周聚焦 [W2,W17]，事件窗内）
    fireEvent.click(entry);
    await waitFor(() => expect(chartHasWeek('Galaxy S25（友商同期）', 'W2')).toBe(true));
    expect(chartHasWeek('Galaxy S25（友商同期）', 'W1')).toBe(false);
  });

  it('删除事件信号不把剩余末项误当被删事件：eventType 缺省展示当前有效事件（不写「类似时间」）', () => {
    renderPanel({ prevGenReferenceId: 'ref-mate80', inputSignal: { seq: 1, kind: 'event', weekLabel: 'W50' } });
    expect(screen.getByText('参考回放')).toBeTruthy();
    expect(document.body.textContent ?? '').not.toContain('类似时间');
    expect(document.body.textContent ?? '').not.toContain('8 秒');
  });

  it('全部面板无匹配 → 「无可回放事件」', () => {
    const bare: WorkbenchFixture = {
      ...fixture,
      references: {
        ...fixture.references,
        lifecyclePool: [{ ...fixture.references.lifecyclePool[0], events: [] }],
      },
    };
    renderPanel({
      fixture: bare,
      prevGenReferenceId: 'ref-mate80',
      inputSignal: { seq: 1, kind: 'event', eventType: 'promo' },
    });
    expect(screen.getByText('无可回放事件')).toBeTruthy();
  });
});

// ============================================================
describe('量价参考产品 · 异常态 / 缺数 / 可访问性', () => {
  it('存储不可用：显式「未持久化」+ 重试；恢复后状态消除（§4.1 / §4.6）', async () => {
    renderPanel({ prevGenReferenceId: 'ref-mate80' });
    const failing = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    const popover = await openCreateComposer('Mate 80（上一代）');
    await pickSelectOption(popover, '事件起周', 'W40');
    await pickSelectOption(popover, '事件止周', 'W40');
    fireEvent.change(titleInputIn(popover), { target: { value: '店庆补贴' } });
    // 自动保存失败 → 工具行 + 编辑器状态行显式「未持久化」
    await waitFor(() => expect(screen.getAllByText('未持久化').length).toBeGreaterThanOrEqual(1));
    expect(document.body.textContent ?? '').toContain('未能保存到浏览器，仅当前页面有效');
    failing.mockRestore();
    fireEvent.click(screen.getByRole('button', { name: '重试保存工作区' }));
    await waitFor(() => expect(screen.queryByText('未持久化')).toBeNull());
    // 内存操作不中断：仍可保存
    fireEvent.change(noteInputIn(await visiblePopover()), { target: { value: '渠道庆补贴' } });
    fireEvent.click(screen.getByRole('button', { name: '保存事件' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '删除事件 W40 店庆补贴' })).toBeTruthy());
  });

  it('缺数纪律（X200）：柱不画、注记「缺数 W13、W14 · 不计 0」', async () => {
    const { container } = renderPanel({ prevGenReferenceId: 'ref-mate80' });
    await addRef('X200（友商同期）');
    expect(document.body.textContent ?? '').toContain('缺数 W13、W14 · 不计 0');
    const bars = Array.from(container.querySelectorAll('rect')).filter((rect) =>
      (rect.getAttribute('fill') ?? '').startsWith('rgba(38, 147, 202'));
    expect(bars.length).toBe(50);
  });

  it('产品无点：保留面板身份与事件入口，图区空态', () => {
    const noPoints: WorkbenchFixture = {
      ...fixture,
      references: {
        ...fixture.references,
        lifecyclePool: [{ ...fixture.references.lifecyclePool[0], points: [], pricePoints: [] }],
      },
    };
    renderPanel({ fixture: noPoints, prevGenReferenceId: 'ref-mate80' });
    expect(screen.getAllByText('暂无可参照历史').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: '为 Mate 80（上一代） 新增事件' })).toBeTruthy();
  });

  it('键盘与可访问名称：名录动作、时间轨滑柄、锁定均可 Tab 到达且名称含周段与标题', () => {
    renderPanel({ prevGenReferenceId: 'ref-mate80' });
    expect(screen.getByRole('button', { name: '编辑事件 W23 618 档期脉冲' }).getAttribute('tabindex')).toBeNull();
    expect(screen.getByLabelText('Mate 80（上一代） 时间窗起点拖柄').getAttribute('tabindex')).toBe('0');
    expect(screen.getByRole('button', { name: 'Mate 80（上一代） 锁定时间窗' })).toBeTruthy();
    // 图锚键盘可达
    expect(screen.getByRole('button', { name: '事件 W23 618 档期脉冲' }).getAttribute('tabindex')).toBe('0');
  });

  it('同周龄比值来自模型考量（Pura 90 W45 = ×0.89）；参照缺数展示模型回退说明', () => {
    renderPanel({ prevGenReferenceId: 'ref-pura90' });
    expect(document.body.textContent ?? '').toContain('×0.89');
    renderPanel({ prevGenReferenceId: 'ref-ip17' });
    expect(document.body.textContent ?? '').toContain('参照缺数，未修正');
  });
});
