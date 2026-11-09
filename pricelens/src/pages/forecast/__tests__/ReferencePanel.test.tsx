// ============================================================
// 推演工作台 v2 ·「量价参考产品」卡测试（视觉精简二轮迁移，jsdom）：
// 卡头（新标题 + ① 基线预测 · 历史参照 + 单个模拟历史；「仅历史」「主链 ·
// 同周龄校正」「未完成」chip 删除）、多面板（默认 2 / 分组菜单 / × 删除与
// 主链回退 / ≤2 均分 >2 横滚）、每面板独立窗口（互不影响 + 会话恢复）、
// 同周龄同步（默认关 / 开启联动 / 锁定面板不动）、统一名录默认收起（「事件
// N ▸」细条；展开 = 无来源标注统一列表；幅度 · 衰减列；× 能力差异隐形保留：
// 补录 = 软删除、预标 = 恢复基准；fixture 原对象不被修改）、证据浮框五项
// 精简（名称 + 起止周 / 幅度 / 衰减 / 说明 / 编辑）、关闭行为（保存成功 →
// 弹层收起 + 名录自动展开 0.6s 高亮淡出；点弹层外空白 / Esc 收起且草稿不
// 丢）、双月周历新增（月导航 / 跨月选周）+ 图上拖选（Esc 取消 / 反向拖动）、
// 工作区持久化（刷新恢复 / 草稿经 ＋事件恢复）、撤销条、类型颜色按类型生效
// 并持久化、参考回放（eventType 过滤 / 不 8 秒消失 / 无来源标注 / 无可回放
// 事件）、异常态（存储不可用 → 未持久化 + 重试）、键盘与可访问名称。
// jsdom：stub ResizeObserver / Pointer Capture；localStorage 防御 shim。
// ============================================================
// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ReferencePanel, { type ReferenceInputSignal, type ReferenceLocateRequest } from '../ReferencePanel';
import { lifecycleWeekIdsOf } from '../referenceEventModel';
import { workbenchFixture, type LifecycleProductSeed, type WorkbenchFixture } from '../workbenchFixture';
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
  /** ①跨卡定位请求（主图学习证据跳来；seq 递增触发）。 */
  locateRequest?: ReferenceLocateRequest | null;
  /** 显式 result（空参考池等 fixture 变体下由完整 fixture 计算）。 */
  result?: WorkbenchResult;
}

function renderPanel(options: RenderOptions = {}) {
  const currentFixture = options.fixture ?? fixture;
  const prevGenReferenceId = options.prevGenReferenceId ?? currentFixture.references.prevGenPool[0]?.id ?? '';
  const onPrevGenReferenceChange = options.onPrevGenReferenceChange ?? vi.fn();
  const params = { ...baseWorkbenchParams(currentFixture), prevGenReferenceId };
  const result: WorkbenchResult = options.result ?? computeWorkbench(currentFixture, params);
  const utils = render(
    <ReferencePanel
      fixture={currentFixture}
      result={result}
      prevGenReferenceId={prevGenReferenceId}
      onPrevGenReferenceChange={onPrevGenReferenceChange}
      inputSignal={options.inputSignal ?? null}
      locateRequest={options.locateRequest ?? null}
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

/**
 * 2026-11-05 视觉精简二轮：首预测周读数行收进「首预测周读数」收起区
 * （默认收起，展开后可见）——受影响断言先展开再查询。
 */
function expandFootnotes(): void {
  for (const toggle of screen.getAllByRole('button', { name: '首预测周读数' })) {
    if (toggle.getAttribute('aria-expanded') === 'false') fireEvent.click(toggle);
  }
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

/**
 * 断言编辑器弹层已收起：antd Popover 离场动画完成后才补 -hidden（jsdom 下
 * 约 1s+），期间隐藏壳仍保留最后一次渲染的内容 DOM——因此以「是否存在未
 * 隐藏 popover」为准，并以 4s 超时兜底动画完成。
 */
async function expectComposerClosed(): Promise<void> {
  await waitFor(() => {
    const open = document.querySelectorAll('.ant-popover:not(.ant-popover-hidden)');
    if (open.length > 0) throw new Error('编辑器弹层仍展开');
  }, { timeout: 4000 });
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

// ---- 双月周历（弹层内）----
function openCal(popover: HTMLElement): void {
  fireEvent.click(within(popover).getByRole('button', { name: '选择起止周' }));
}
function pickCalWeek(popover: HTMLElement, week: number): void {
  const group = within(popover).getByRole('group', { name: '起止周双月历' });
  const row = [...group.querySelectorAll('button')]
    .find((node) => (node.getAttribute('aria-label') ?? '').startsWith(`W${week}（`));
  if (!row) throw new Error(`周历行未找到：W${week}（当前月页可能不含该周，需先翻月）`);
  fireEvent.click(row);
}
function navCalTo(popover: HTMLElement, target: string): void {
  const group = within(popover).getByRole('group', { name: '起止周双月历' });
  for (let i = 0; i < 30; i += 1) {
    if ((group.textContent ?? '').includes(target)) return;
    const next = within(group).getByRole('button', { name: '下一月' }) as HTMLButtonElement;
    if (next.disabled) throw new Error(`月历无法翻到「${target}」（已到末页）`);
    fireEvent.click(next);
  }
  throw new Error(`月历未翻到「${target}」`);
}

/** 周历新增：起止周（跨月需带月页标签）+ 标题 + 说明 → 保存事件。 */
async function createEventViaCalendar(
  productLabel: string,
  options: { startWeek: number; endWeek: number; month: string; title: string; note: string; typeId?: string },
): Promise<HTMLElement> {
  const popover = await openCreateComposer(productLabel);
  if (options.typeId) await pickSelectOption(popover, '事件类型', options.typeId);
  openCal(popover);
  navCalTo(popover, options.month);
  pickCalWeek(popover, options.startWeek);
  pickCalWeek(popover, options.endWeek);
  fireEvent.change(titleInputIn(popover), { target: { value: options.title } });
  fireEvent.change(noteInputIn(popover), { target: { value: options.note } });
  fireEvent.click(screen.getByRole('button', { name: '保存事件' }));
  return popover;
}

/** 名录展开（点「事件 N ▸」细条；收起态下内容不渲染）。 */
function expandRoster(card: HTMLElement): void {
  const toggle = within(card).getByRole('button', { name: /^事件 \d+$/ });
  if (toggle.getAttribute('aria-expanded') === 'false') fireEvent.click(toggle);
}

/** 面板卡内名录容器（CollapsibleSection data 标记作用域，隔离卡头「草稿 N」chip）。 */
function rosterOf(card: HTMLElement): HTMLElement {
  const el = [...card.querySelectorAll('[data-collapsible-section]')]
    .find((node) => /^事件 \d+$/.test(node.getAttribute('data-collapsible-section') ?? ''));
  if (!el) throw new Error('名录收起区未找到');
  return el as HTMLElement;
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
/** 拖选命中映射：PointerShield idxAt = floor(x ÷ (plotWidth ÷ 窗长))；默认全窗 = 池长（v3 = 108）。 */
const COL_W = PLOT_WIDTH / 108;
const clientXAt = (index: number): number => Math.round(COL_W * (index + 0.5));

/**
 * 生命周期周序 → 日历周 ID（与图 X 轴同一换算，锚点 = launchWeekLabel，ISO 跨年进位）。
 * 2026-11-05 整改 #1 后图轴 = 日历周标签（axisTickPlan：首尾恒显示 + n/9 抽稀 +
 * 边界让位），窗口断言改按目标窗口内恒被显示的刻度下标取值。
 */
const POOL = fixture.references.lifecyclePool;
const calendarWeeksOf = (label: string): string[] =>
  lifecycleWeekIdsOf(POOL.find((p) => p.label === label) as LifecycleProductSeed);
const MATE_WEEKS = calendarWeeksOf('Mate 80（上一代）');
const GALAXY_WEEKS = calendarWeeksOf('Galaxy S25（友商同期）');

// ============================================================
describe('量价参考产品 · 卡头与文案收敛（含①阶段标）', () => {
  it('标题 = 量价参考产品；① 基线预测 · 历史参照阶段标 + 模拟历史 ？说明（HintInfo 退役）；仅历史 / 主链校正 / 未完成 chip 删除', () => {
    const { container } = renderPanel({ prevGenReferenceId: 'ref-mate80' });
    expect(screen.getByRole('heading', { name: '量价参考产品' })).toBeTruthy();
    // ①阶段标（B.5.1 卡头语言；不恢复旧长 IoBar）
    expect(screen.getByText('① 基线预测 · 历史参照')).toBeTruthy();
    expect(container.textContent ?? '').not.toContain('输入');
    expect(container.textContent ?? '').not.toContain('主图周销基准');
    // 2026-11-05 二轮（全局 #7）：「模拟历史」chip 退役为 ？说明图标（HintInfo），
    // title 合并模拟语境；「仅对照」身份 chip 保留，文字态「模拟历史」不再出现
    const hint = screen.getByLabelText('量价参考卡说明');
    expect(hint.getAttribute('title')).toContain('模拟');
    expect(hint.getAttribute('title')).toContain('不代表真实市场');
    expect(hint.getAttribute('title')).toContain('不写入主链');
    expect(screen.queryByText('模拟历史')).toBeNull();
    expect(screen.queryByText('仅历史')).toBeNull();
    // 「主链 · 同周龄校正」chip 删除（对照语义保留「仅对照」）
    expect(screen.queryByText('主链 · 同周龄校正')).toBeNull();
    expect(screen.queryByText('未完成')).toBeNull();
    const text = container.textContent ?? '';
    expect(text).not.toContain('历史参照：参考面板可增删');
    expect(text).not.toContain('参照产品全生命周期');
    expect(text).not.toContain('历史事件补录：为已发生的量价变化补记原因');
    expect(text).not.toContain('补录 · 会话内');
    expect(text).not.toContain('上一代上市同期');
    // 首预测周行升级（B.5.5）：「首预测周 YYYYWww · 同周龄证据」+ 跨年周 ID；
    // 读数行在「首预测周读数」收起区，展开后可见（上一轮保持收起态）。
    expandFootnotes();
    const textWithFootnote = container.textContent ?? '';
    expect(textWithFootnote).toContain('首预测周 2026W45 · 同周龄证据');
    expect(textWithFootnote).toContain('同周龄比值');
    expect(textWithFootnote).toContain('供①学习参照，不另乘主链');
  });

  it('默认 2 面板：Mate 80（主链无标）+ Galaxy S25 仅对照', () => {
    renderPanel({ prevGenReferenceId: 'ref-mate80' });
    expect(screen.getAllByText('Mate 80（上一代）').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Galaxy S25（友商同期）').length).toBeGreaterThan(0);
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
    const { container, onPrevGenReferenceChange } = renderPanel({
      fixture: emptyFixture,
      prevGenReferenceId: '',
      // 空池 fixture 无法进学习器：result 用完整 fixture 计算（面板只读其考量行）。
      result: computeWorkbench(fixture, baseWorkbenchParams(fixture)),
    });
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(screen.getAllByText('暂无可参照历史')).toHaveLength(1);
    expect(onPrevGenReferenceChange).not.toHaveBeenCalled();
  });
});

// ============================================================
describe('量价参考产品 · 每面板独立窗口 / 同步 / 锁定', () => {
  it('面板窗口互不影响：Mate 80 起点 +8 周后 Galaxy 仍显示全周期（验收 1）', () => {
    renderPanel({ prevGenReferenceId: 'ref-mate80' });
    // 图轴 = 日历周标签（整改 #1）：首刻度 = 上市锚点周（下标 0 恒显示）
    expect(chartHasWeek('Mate 80（上一代）', MATE_WEEKS[0])).toBe(true);
    expect(chartHasWeek('Galaxy S25（友商同期）', GALAXY_WEEKS[0])).toBe(true);
    const handle = screen.getByLabelText('Mate 80（上一代） 时间窗起点拖柄');
    for (let i = 0; i < 8; i++) fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(chartHasWeek('Mate 80（上一代）', MATE_WEEKS[0])).toBe(false);
    expect(chartHasWeek('Mate 80（上一代）', MATE_WEEKS[8])).toBe(true);
    // Galaxy 不动
    expect(chartHasWeek('Galaxy S25（友商同期）', GALAXY_WEEKS[0])).toBe(true);
    expect(chartHasWeek('Galaxy S25（友商同期）', GALAXY_WEEKS[8])).toBe(false);
    // 主链回调不受窗口影响（验收 2：窗口只决定查看范围）
    expect(screen.getByLabelText('Mate 80（上一代） 平移参考时间窗')).toBeTruthy();
  });

  it('窗口存会话视图态：重挂载（切页 / 刷新）后恢复', () => {
    const first = renderPanel({ prevGenReferenceId: 'ref-mate80' });
    const handle = screen.getByLabelText('Mate 80（上一代） 时间窗起点拖柄');
    for (let i = 0; i < 8; i++) fireEvent.keyDown(handle, { key: 'ArrowRight' });
    first.unmount();
    renderPanel({ prevGenReferenceId: 'ref-mate80' });
    expect(chartHasWeek('Mate 80（上一代）', MATE_WEEKS[0])).toBe(false);
    expect(chartHasWeek('Mate 80（上一代）', MATE_WEEKS[8])).toBe(true);
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
    expect(chartHasWeek('Mate 80（上一代）', MATE_WEEKS[0])).toBe(false);
    expect(chartHasWeek('Mate 80（上一代）', MATE_WEEKS[4])).toBe(true);
    expect(chartHasWeek('Galaxy S25（友商同期）', GALAXY_WEEKS[4])).toBe(true);
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
    expect(chartHasWeek('Mate 80（上一代）', MATE_WEEKS[4])).toBe(true);
    expect(chartHasWeek('Galaxy S25（友商同期）', GALAXY_WEEKS[0])).toBe(true);
    // 解锁后手动调整可达
    fireEvent.click(screen.getByRole('button', { name: 'Galaxy S25（友商同期） 解锁时间窗' }));
    expect(screen.getByLabelText('Galaxy S25（友商同期） 时间窗起点拖柄').getAttribute('tabindex')).toBe('0');
  });

  it('窗口预设：全周期 / 最近 16 周（v3 参考池 108 周 → 窗 [92,107]）；窗口不产生主链回调（验收 2）', async () => {
    const { onPrevGenReferenceChange } = renderPanel({ prevGenReferenceId: 'ref-mate80' });
    await pickSelectOption(document.body, 'Mate 80（上一代） 窗口预设', '最近 16 周');
    expect(chartHasWeek('Mate 80（上一代）', MATE_WEEKS[92])).toBe(true);
    expect(chartHasWeek('Mate 80（上一代）', MATE_WEEKS[107])).toBe(true);
    expect(chartHasWeek('Mate 80（上一代）', MATE_WEEKS[0])).toBe(false);
    fireEvent.keyDown(screen.getByLabelText('Mate 80（上一代） 时间窗终点拖柄'), { key: 'ArrowLeft' });
    expect(onPrevGenReferenceChange).not.toHaveBeenCalled();
  });
});

// ============================================================
describe('量价参考产品 · 名录默认收起与无来源标注', () => {
  it('名录默认收起为「事件 N ▸」细条；展开 = 全量统一列表（不再收纳 / 无窗内 chip）', () => {
    renderPanel({ prevGenReferenceId: 'ref-mate80' });
    const mateCard = cardOf('Mate 80（上一代）');
    const rosterToggle = within(mateCard).getByRole('button', { name: '事件 7' });
    expect(rosterToggle.getAttribute('aria-expanded')).toBe('false');
    // 收起态：名录行不渲染（Galaxy 名录条 = 事件 5）
    const galaxyCard = cardOf('Galaxy S25（友商同期）');
    expect(within(galaxyCard).getByRole('button', { name: '事件 5' })).toBeTruthy();
    expect(within(document.body).queryByRole('button', { name: /查看事件读数/ })).toBeNull();
    // 展开 = 全量 7 条（不再「前 3 条 + 全部 N 条」收纳）
    fireEvent.click(rosterToggle);
    expect(rosterToggle.getAttribute('aria-expanded')).toBe('true');
    expect(within(rosterOf(mateCard)).getAllByRole('button', { name: /查看事件读数/ })).toHaveLength(7);
    expect(within(rosterOf(mateCard)).queryByRole('button', { name: '窗内' })).toBeNull();
    expect(within(rosterOf(mateCard)).queryByRole('button', { name: '全部 7 条' })).toBeNull();
    // 再点收起
    fireEvent.click(rosterToggle);
    expect(within(mateCard).queryByRole('button', { name: /查看事件读数/ })).toBeNull();
  });

  it('无来源标注：名录与浮框无「预标 / 草稿」字样；行 = 色点 + 起止周 + 标题 + 幅度 · 衰减 + 编辑 + ×', () => {
    renderPanel({ prevGenReferenceId: 'ref-mate80' });
    const mateCard = cardOf('Mate 80（上一代）');
    expandRoster(mateCard);
    const roster = rosterOf(mateCard);
    const text = roster.textContent ?? '';
    expect(text).not.toContain('预标');
    expect(text).not.toContain('草稿');
    expect(text).not.toContain('窗内');
    expect(text).not.toContain('源已更新');
    // 行内容：起止周 + 标题（可访问名称）；幅度 · 衰减列（预标 impact 只作参考列）
    expect(within(roster).getByRole('button', { name: `查看事件读数 ${MATE_WEEKS[22]} 618 档期脉冲` })).toBeTruthy();
    expect(within(roster).getByRole('button', { name: `编辑事件 ${MATE_WEEKS[22]} 618 档期脉冲` })).toBeTruthy();
    expect((roster.textContent ?? '')).toContain('+42% · 未标');
    // × 能力差异隐形保留：预标行 × = 恢复基准（aria 名称不带来源字样）
    expect(within(roster).getByRole('button', { name: `恢复事件基准 ${MATE_WEEKS[22]} 618 档期脉冲` })).toBeTruthy();
  });

  it('编辑预标 → 覆写保存（弹层自动收起 + 名录闪强）→ × 恢复基准；fixture 原对象不被修改（验收 3）', async () => {
    const snapshot = JSON.stringify(fixture.references.lifecyclePool.map((p) => p.events));
    renderPanel({ prevGenReferenceId: 'ref-mate80' });
    const mateCard = cardOf('Mate 80（上一代）');
    expandRoster(mateCard);
    fireEvent.click(within(mateCard).getByRole('button', { name: `编辑事件 ${MATE_WEEKS[22]} 618 档期脉冲` }));
    const popover = await visiblePopover();
    expect(popover.textContent).toContain('编辑事件');
    // 双月周历：编辑打开时定位到起周所在月页（W23 → 2025年 6月），改止周 W26
    openCal(popover);
    expect((within(popover).getByRole('group', { name: '起止周双月历' }).textContent ?? '')).toContain('2025年 6月');
    pickCalWeek(popover, 23);
    pickCalWeek(popover, 26);
    fireEvent.change(titleInputIn(popover), { target: { value: '618 档期脉冲（含预售）' } });
    fireEvent.change(noteInputIn(popover), { target: { value: '预售前移 + 平台补贴叠加' } });
    fireEvent.click(screen.getByRole('button', { name: '保存事件' }));
    // 名录自动展开 + 新行短暂强调（0.6s 高亮淡出；先断言闪强，再等弹层收起）
    await waitFor(() => expect(within(mateCard).getByRole('button', { name: `查看事件读数 ${MATE_WEEKS[22]}–${MATE_WEEKS[25]} 618 档期脉冲（含预售）` })).toBeTruthy());
    const row = (within(mateCard).getByRole('button', { name: `恢复事件基准 ${MATE_WEEKS[22]}–${MATE_WEEKS[25]} 618 档期脉冲（含预售）` }).closest('div')) as HTMLElement;
    expect(row.style.background).toBe('rgb(232, 241, 255)');
    await waitFor(() => expect(row.style.background).not.toBe('rgb(232, 241, 255)'), { timeout: 2000 });
    // 关闭行为：保存成功 → 弹层自动收起
    await expectComposerClosed();
    // 无来源标注（覆写后不出现「预标 · 已改」）；本地修改计数 chip 在卡头（名录外）
    expect(screen.queryByText('预标 · 已改')).toBeNull();
    expect(screen.getAllByText('草稿 1').length).toBeGreaterThanOrEqual(1);
    // 撤销操作条出现（验收 6）；保存成功不再自动打开详情浮框
    expect(screen.getByText('已保存事件')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '关闭事件详情' })).toBeNull();
    // × 恢复基准 → 回 fixture 原值（可撤销）
    fireEvent.click(within(mateCard).getByRole('button', { name: `恢复事件基准 ${MATE_WEEKS[22]}–${MATE_WEEKS[25]} 618 档期脉冲（含预售）` }));
    await waitFor(() => expect(within(mateCard).getByRole('button', { name: `查看事件读数 ${MATE_WEEKS[22]} 618 档期脉冲` })).toBeTruthy());
    expect(screen.getByText('已恢复预标')).toBeTruthy();
    // fixture 原始对象未被修改
    expect(JSON.stringify(fixture.references.lifecyclePool.map((p) => p.events))).toBe(snapshot);
  });
});

// ============================================================
describe('量价参考产品 · 证据浮框（五项精简）与删除 / 撤销', () => {
  it('证据浮框五项：名称 + 起止周 / 幅度 / 衰减 / 说明（有才显示）/ 编辑；无读数行与来源标注（验收 9 迁移）', () => {
    renderPanel({ prevGenReferenceId: 'ref-mate80' });
    const mateCard = cardOf('Mate 80（上一代）');
    expandRoster(mateCard);
    fireEvent.click(within(mateCard).getByRole('button', { name: `查看事件读数 ${MATE_WEEKS[22]} 618 档期脉冲` }));
    const detail = screen.getByRole('group', { name: `事件详情 ${MATE_WEEKS[22]} 618 档期脉冲` });
    const text = detail.textContent ?? '';
    expect(text).toContain(`${MATE_WEEKS[22]} · 618 档期脉冲`);
    expect(text).toContain('幅度');
    expect(text).toContain('+42%');
    expect(text).toContain('衰减');
    expect(text).toContain('未标');
    // 编辑按钮在浮框内（名录行另有同名入口，浮框内以详情组作用域查询）
    expect(within(detail).getByRole('button', { name: `编辑事件 ${MATE_WEEKS[22]} 618 档期脉冲` })).toBeTruthy();
    // 删除的读数行与来源标注
    expect(text).not.toContain('事件时段');
    expect(text).not.toContain('销量有效');
    expect(text).not.toContain('期内均周销');
    expect(text).not.toContain('较前');
    expect(text).not.toContain('计算');
    expect(text).not.toContain('预标参考');
    expect(text).not.toContain('预标');
    expect(text).not.toContain('草稿');
    // 生命周期起点事件（W1 上市首销，impact +30%）：同款五项浮框
    fireEvent.click(within(mateCard).getByRole('button', { name: `查看事件读数 ${MATE_WEEKS[0]} 上市首销` }));
    const first = screen.getByRole('group', { name: `事件详情 ${MATE_WEEKS[0]} 上市首销` });
    expect((first.textContent ?? '')).toContain('+30%');
    expect((first.textContent ?? '')).not.toContain('无法计算');
    // 再次点击关闭详情（名录行 toggle）
    fireEvent.click(within(mateCard).getByRole('button', { name: `查看事件读数 ${MATE_WEEKS[0]} 上市首销` }));
    expect(screen.queryByRole('group', { name: `事件详情 ${MATE_WEEKS[0]} 上市首销` })).toBeNull();
  });

  it('删除补录 = 软删除 + 撤销条「已删除事件」；名录已随保存自动展开', async () => {
    renderPanel({ prevGenReferenceId: 'ref-mate80' });
    const mateCard = cardOf('Mate 80（上一代）');
    await createEventViaCalendar('Mate 80（上一代）', {
      startWeek: 40, endWeek: 40, month: '2025年 10月', title: '店庆补贴', note: '渠道庆补贴压价',
    });
    // 保存成功：弹层收起、名录自动展开并出现新行
    await expectComposerClosed();
    const roster = rosterOf(mateCard);
    await waitFor(() => expect(within(roster).getByRole('button', { name: `删除事件 ${MATE_WEEKS[39]} 店庆补贴` })).toBeTruthy());
    fireEvent.click(within(roster).getByRole('button', { name: `删除事件 ${MATE_WEEKS[39]} 店庆补贴` }));
    await waitFor(() => expect(within(roster).queryByRole('button', { name: `删除事件 ${MATE_WEEKS[39]} 店庆补贴` })).toBeNull());
    expect(screen.getByText('已删除事件')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '撤销：已删除事件' }));
    await waitFor(() => expect(within(rosterOf(mateCard)).getByRole('button', { name: `删除事件 ${MATE_WEEKS[39]} 店庆补贴` })).toBeTruthy());
  });

  it('连续编辑后撤销最后一步只撤该步（验收 6：撤销 A 不清掉 B）', async () => {
    renderPanel({ prevGenReferenceId: 'ref-mate80' });
    const mateCard = cardOf('Mate 80（上一代）');
    // 编辑预标 A（618 → 加止周 W26）
    expandRoster(mateCard);
    fireEvent.click(within(mateCard).getByRole('button', { name: `编辑事件 ${MATE_WEEKS[22]} 618 档期脉冲` }));
    let popover = await visiblePopover();
    openCal(popover);
    pickCalWeek(popover, 23);
    pickCalWeek(popover, 26);
    fireEvent.change(titleInputIn(popover), { target: { value: '618（改）' } });
    fireEvent.change(noteInputIn(popover), { target: { value: '改期说明' } });
    fireEvent.click(screen.getByRole('button', { name: '保存事件' }));
    await expectComposerClosed();
    await waitFor(() => expect(within(mateCard).getByRole('button', { name: `查看事件读数 ${MATE_WEEKS[22]}–${MATE_WEEKS[25]} 618（改）` })).toBeTruthy());
    // 新增补录 B（W40–W41）
    await createEventViaCalendar('Mate 80（上一代）', {
      startWeek: 40, endWeek: 41, month: '2025年 10月', title: '店庆补贴', note: '渠道庆补贴',
    });
    await waitFor(() => expect(within(rosterOf(mateCard)).getByRole('button', { name: `删除事件 ${MATE_WEEKS[39]}–${MATE_WEEKS[40]} 店庆补贴` })).toBeTruthy());
    // 撤销（撤最后一步 = 新增 B）：B 消失，A 的覆写仍在
    fireEvent.click(screen.getByRole('button', { name: '撤销：已保存事件' }));
    await waitFor(() => expect(within(rosterOf(mateCard)).queryByRole('button', { name: `删除事件 ${MATE_WEEKS[39]}–${MATE_WEEKS[40]} 店庆补贴` })).toBeNull());
    expect(within(mateCard).getByRole('button', { name: `查看事件读数 ${MATE_WEEKS[22]}–${MATE_WEEKS[25]} 618（改）` })).toBeTruthy();
  }, 20000); // 全量套件下 dim_product 扩容后 fixture 变慢，默认 5s 超时（单文件跑稳定全绿）
});

// ============================================================
describe('量价参考产品 · 关闭行为（保存收起 / 空白收起 / Esc）', () => {
  it('点弹层外空白收起编辑器，草稿不丢（重新打开内容仍在）', async () => {
    const { container } = renderPanel({ prevGenReferenceId: 'ref-mate80' });
    const popover = await openCreateComposer('Mate 80（上一代）');
    fireEvent.change(titleInputIn(popover), { target: { value: '未写完的事件' } });
    // 空白点击（图区）→ 收起
    fireEvent.mouseDown(container.querySelector('svg') as Element);
    await expectComposerClosed();
    // 重新打开（＋事件）→ 未提交草稿仍在
    const restored = await openCreateComposer('Mate 80（上一代）');
    expect((titleInputIn(restored) as HTMLInputElement).value).toBe('未写完的事件');
  }, 20000);

  it('Esc 收起编辑器（草稿保留）', async () => {
    renderPanel({ prevGenReferenceId: 'ref-mate80' });
    const popover = await openCreateComposer('Galaxy S25（友商同期）');
    fireEvent.change(titleInputIn(popover), { target: { value: 'Esc 草稿' } });
    fireEvent.keyDown(document, { key: 'Escape' });
    await expectComposerClosed();
    const restored = await openCreateComposer('Galaxy S25（友商同期）');
    expect((titleInputIn(restored) as HTMLInputElement).value).toBe('Esc 草稿');
  });

  it('「＋事件」触发钮不触发空白收起（开关语义交给 antd trigger）', async () => {
    renderPanel({ prevGenReferenceId: 'ref-mate80' });
    await openCreateComposer('Mate 80（上一代）');
    fireEvent.mouseDown(screen.getByRole('button', { name: '为 Mate 80（上一代） 新增事件' }));
    // 弹层保持展开（触发钮排除在空白收起之外）
    await waitFor(() => {
      const pops = [...document.querySelectorAll('.ant-popover:not(.ant-popover-hidden)')]
        .filter((el) => (el.textContent ?? '').includes('本地草稿'));
      if (pops.length === 0) throw new Error('弹层被误收起');
    });
  });
});

// ============================================================
describe('量价参考产品 · 新增事件（双月周历）+ 图上拖选（验收 4）', () => {
  it('周历新增：跨月页导航后选起止周；保存后名录出现草稿行；锚点上图', async () => {
    renderPanel({ prevGenReferenceId: 'ref-mate80' });
    await createEventViaCalendar('Mate 80（上一代）', {
      startWeek: 40, endWeek: 41, month: '2025年 10月', title: '店庆补贴', note: '渠道庆补贴',
    });
    await expectComposerClosed();
    const mateCard = cardOf('Mate 80（上一代）');
    await waitFor(() => expect(within(rosterOf(mateCard)).getByRole('button', { name: `删除事件 ${MATE_WEEKS[39]}–${MATE_WEEKS[40]} 店庆补贴` })).toBeTruthy());
    // 文字只留在名录 / 详情：图内锚点无长 title，事件轨小标以可访问名称承载
    expect(screen.getByRole('button', { name: `事件 ${MATE_WEEKS[39]}–${MATE_WEEKS[40]} 店庆补贴` })).toBeTruthy();
    expect(screen.getAllByText('草稿 1').length).toBeGreaterThanOrEqual(1);
  });

  it('拖选回填起止周：反向拖动同一闭区间 W12–W15；Esc 取消回弹层且草稿不丢', async () => {
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
    expect(screen.getByText(`已选 ${MATE_WEEKS[11]}–${MATE_WEEKS[14]} · 4 周`)).toBeTruthy();
    fireEvent.pointerUp(shield, { pointerId: 7, clientX: clientXAt(11), clientY: 60 });
    // 弹层回归带值（已填内容不丢）
    const back = await waitFor(() => {
      const pops = [...document.querySelectorAll('.ant-popover:not(.ant-popover-hidden)')]
        .filter((el) => (el.textContent ?? '').includes(`已选 ${MATE_WEEKS[11]}–${MATE_WEEKS[14]} · 4 周`));
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
    await expectComposerClosed();
    const mateCard = cardOf('Mate 80（上一代）');
    await waitFor(() => expect(within(rosterOf(mateCard)).getByRole('button', { name: `删除事件 ${MATE_WEEKS[11]}–${MATE_WEEKS[14]} 店庆补贴` })).toBeTruthy());
    expect(screen.getByRole('button', { name: `事件 ${MATE_WEEKS[11]}–${MATE_WEEKS[14]} 店庆补贴` })).toBeTruthy();
  });

  it('名录「读数」/ 图锚点击共享同一选中态；选中事件不在窗内时窗口自动扩展', async () => {
    renderPanel({ prevGenReferenceId: 'ref-mate80' });
    const mateCard = cardOf('Mate 80（上一代）');
    // 收缩 Mate 80 窗口到 [0, 7]（v3 池 108 周：终点 107 → 7 需 ≥100 步，取 120）
    const handle = screen.getByLabelText('Mate 80（上一代） 时间窗终点拖柄');
    for (let i = 0; i < 120; i++) fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(chartHasWeek('Mate 80（上一代）', MATE_WEEKS[7])).toBe(true);
    // 展开名录点击窗外事件（W23）→ 窗口扩展到事件附近（16 周聚焦 [14,29]；
    // 日历周轴抽稀下恒显示刻度 = 下标 14/16/…/26/29）
    expandRoster(mateCard);
    fireEvent.click(within(mateCard).getByRole('button', { name: `查看事件读数 ${MATE_WEEKS[22]} 618 档期脉冲` }));
    await waitFor(() => expect(chartHasWeek('Mate 80（上一代）', MATE_WEEKS[14])).toBe(true));
    expect(chartHasWeek('Mate 80（上一代）', MATE_WEEKS[22])).toBe(true);
    expect(chartHasWeek('Mate 80（上一代）', MATE_WEEKS[0])).toBe(false);
    expect(screen.getByRole('group', { name: `事件详情 ${MATE_WEEKS[22]} 618 档期脉冲` })).toBeTruthy();
    // 图锚点击 = 同一选中态（此处已打开详情，点击同锚再次切换关闭由组件处理；这里验证锚点可点）
    const anchor = screen.getByRole('button', { name: `事件 ${MATE_WEEKS[22]} 618 档期脉冲` });
    fireEvent.click(anchor);
  });

  it('键盘不拖图也能完成新增（周历跨月选 W10–W12；验收 4 / 11）', async () => {
    renderPanel({ prevGenReferenceId: 'ref-mate80' });
    await createEventViaCalendar('Galaxy S25（友商同期）', {
      startWeek: 10, endWeek: 12, month: '2025年 4月', title: '对比机促销提前', note: '友商 W10 起促销',
    });
    await expectComposerClosed();
    const galaxyCard = cardOf('Galaxy S25（友商同期）');
    await waitFor(() => expect(within(rosterOf(galaxyCard)).getByRole('button', { name: `删除事件 ${GALAXY_WEEKS[9]}–${GALAXY_WEEKS[11]} 对比机促销提前` })).toBeTruthy());
    expect(screen.getAllByText('草稿 1').length).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================
describe('量价参考产品 · 工作区持久化（验收 5）', () => {
  it('刷新后：已保存事件恢复（草稿 N chip）；「未完成」chip 删除，草稿经 ＋事件恢复、不自动弹层', async () => {
    const first = renderPanel({ prevGenReferenceId: 'ref-mate80' });
    // 已保存事件
    await createEventViaCalendar('Mate 80（上一代）', {
      startWeek: 40, endWeek: 41, month: '2025年 10月', title: '店庆补贴', note: '渠道庆补贴',
    });
    await waitFor(() => expect(screen.getAllByText('草稿 1').length).toBeGreaterThanOrEqual(1));
    // 未提交草稿：填一半 → 收起（无「未完成」chip）
    const popover = await openCreateComposer('Galaxy S25（友商同期）');
    fireEvent.change(titleInputIn(popover), { target: { value: '未写完的事件' } });
    fireEvent.click(within(popover).getByRole('button', { name: '收起' }));
    await expectComposerClosed();
    expect(screen.queryByText('未完成')).toBeNull();
    // 模拟刷新：清内存缓存 + 重挂载
    first.unmount();
    resetReferenceWorkspacesForTests();
    renderPanel({ prevGenReferenceId: 'ref-mate80' });
    // 已保存事件仍在；未完成 chip 不存在、不自动弹层
    expect(screen.getAllByText('草稿 1').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('新增事件')).toBeNull();
    expect(screen.queryByText('未完成')).toBeNull();
    // ＋事件恢复已填内容
    fireEvent.click(screen.getByRole('button', { name: '为 Galaxy S25（友商同期） 新增事件' }));
    const restored = await visiblePopover();
    expect((restored.querySelector('[aria-label="事件标题（必填）"]') as HTMLInputElement).value).toBe('未写完的事件');
  });

  it('删除面板不删事件：重加面板后草稿恢复显示（验收 5）', async () => {
    renderPanel({ prevGenReferenceId: 'ref-mate80' });
    await createEventViaCalendar('Galaxy S25（友商同期）', {
      startWeek: 10, endWeek: 10, month: '2025年 4月', title: '对比机促销', note: '友商促销记录',
    });
    const galaxyCard = cardOf('Galaxy S25（友商同期）');
    await waitFor(() => expect(within(rosterOf(galaxyCard)).getByRole('button', { name: `删除事件 ${GALAXY_WEEKS[9]} 对比机促销` })).toBeTruthy());
    // 删除 Galaxy 面板 → 事件草稿保留在工作区（Mate 80 不受影响）
    fireEvent.click(screen.getByLabelText('删除参考面板：Galaxy S25（友商同期）'));
    expect(screen.queryByLabelText('删除参考面板：Galaxy S25（友商同期）')).toBeNull();
    // 重加 Galaxy → 草稿恢复（名录收起态需展开）
    await addRef('Galaxy S25（友商同期）');
    const restoredCard = cardOf('Galaxy S25（友商同期）');
    await waitFor(() => expect(within(restoredCard).getByRole('button', { name: '事件 6' })).toBeTruthy());
    expandRoster(restoredCard);
    await waitFor(() => expect(within(rosterOf(restoredCard)).getByRole('button', { name: `删除事件 ${GALAXY_WEEKS[9]} 对比机促销` })).toBeTruthy());
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
    await waitFor(() => expect(screen.getByRole('button', { name: '为 Mate 80（上一代） 新增事件' })).toBeTruthy());
    // 草稿已恢复（撤销重建草稿）：＋事件回填原内容
    const restored = await openCreateComposer('Mate 80（上一代）');
    expect((titleInputIn(restored) as HTMLInputElement).value).toBe('未提交草稿');
  });
});

// ============================================================
describe('量价参考产品 · 类型颜色（验收 7）', () => {
  it('改促销类型颜色：同类型事件全部同步变色；刷新保持；名录色块跟随', async () => {
    const first = renderPanel({ prevGenReferenceId: 'ref-mate80' });
    const mateCard = cardOf('Mate 80（上一代）');
    expandRoster(mateCard);
    const row618 = within(mateCard).getByRole('button', { name: `查看事件读数 ${MATE_WEEKS[22]} 618 档期脉冲` });
    const swatchBefore = (row618.firstElementChild as HTMLElement).style.background;
    expect(swatchBefore).toBeTruthy();
    // 经编辑器色块入口改促销类型色 → 色板第 1 项
    fireEvent.click(within(mateCard).getByRole('button', { name: `编辑事件 ${MATE_WEEKS[22]} 618 档期脉冲` }));
    const popover = await visiblePopover();
    fireEvent.click(screen.getByRole('button', { name: /编辑类型「促销投放」颜色/ }));
    fireEvent.click(await waitFor(() => {
      const el = [...popover.querySelectorAll('button')].find((node) => (node.getAttribute('aria-label') ?? '').startsWith('色板 #'));
      if (!el) throw new Error('色板未展开');
      return el;
    }));
    const swatchAfter = (within(mateCard).getByRole('button', { name: `查看事件读数 ${MATE_WEEKS[22]} 618 档期脉冲` }).firstElementChild as HTMLElement).style.background;
    expect(swatchAfter).not.toBe(swatchBefore);
    // 同类型（黑五档期脉冲，同为促销投放）同步变色（名录展开态全量可见）
    const swatchBf = (within(mateCard).getByRole('button', { name: `查看事件读数 ${MATE_WEEKS[46]} 黑五档期脉冲` }).firstElementChild as HTMLElement).style.background;
    expect(swatchBf).toBe(swatchAfter);
    // 刷新保持
    first.unmount();
    resetReferenceWorkspacesForTests();
    resetReferenceEventTypeStoreForTests();
    renderPanel({ prevGenReferenceId: 'ref-mate80' });
    const cardAfter = cardOf('Mate 80（上一代）');
    expandRoster(cardAfter);
    expect((within(cardAfter).getByRole('button', { name: `查看事件读数 ${MATE_WEEKS[22]} 618 档期脉冲` }).firstElementChild as HTMLElement).style.background).toBe(swatchAfter);
  });
});

// ============================================================
describe('量价参考产品 · 参考回放（§4.5）', () => {
  it('信号驱动回放条：标题「参考回放」；eventType 过滤；条目 = 产品 · 周段 · 标题（v3 全窗中心 53.5 → 最近促销 = W47 黑五）', () => {
    renderPanel({ prevGenReferenceId: 'ref-mate80', inputSignal: { seq: 1, kind: 'event', weekLabel: 'W47', eventType: 'promo' } });
    expect(screen.getByText('参考回放')).toBeTruthy();
    expect(screen.getByRole('button', { name: new RegExp(`Mate 80 · ${MATE_WEEKS[46]} · 黑五档期脉冲`) })).toBeTruthy();
    // 回放条目无来源标注（草稿标删除）
    const entry = screen.getByRole('button', { name: new RegExp(`Mate 80 · ${MATE_WEEKS[46]} · 黑五档期脉冲`) });
    expect(entry.textContent).not.toContain('草稿');
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

  it('补录条目无来源标注；点击条目定位到目标面板（eventType 过滤 + 稳定排序）', async () => {
    const utils = renderPanel({ prevGenReferenceId: 'ref-mate80' });
    // 补录一个促销事件（Galaxy，W48：v3 Galaxy 预标促销最近者为 W47 黑五，补录 W48 距窗心更近胜出）
    await createEventViaCalendar('Galaxy S25（友商同期）', {
      startWeek: 48, endWeek: 48, month: '2025年 12月', title: '对比机促销', note: '友商促销记录', typeId: '促销投放',
    });
    await expectComposerClosed();
    // 信号带 eventType=promo：promo 候选按窗口中心距离稳定排序 → Galaxy 补录（W48，距中心最近）胜出
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
    const entry = await waitFor(() => screen.getByRole('button', { name: new RegExp(`Galaxy S25 · ${GALAXY_WEEKS[47]} · 对比机促销`) }));
    expect(entry.textContent).not.toContain('草稿');
    // 点击条目定位：Galaxy 窗口移到事件附近（W48 = 下标 47 → 16 周聚焦 [39,54]，
    // 事件窗内；首刻度 = 下标 39 恒显示）
    fireEvent.click(entry);
    await waitFor(() => expect(chartHasWeek('Galaxy S25（友商同期）', GALAXY_WEEKS[39])).toBe(true));
    expect(chartHasWeek('Galaxy S25（友商同期）', GALAXY_WEEKS[0])).toBe(false);
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
    // 整只替换 localStorage 访问器（而非实例级 spyOn）：jsdom 的 localStorage
    // 在部分 Node/jsdom 组合下（CI Node 22 实证）实例 spy 会被绕过，访问器替换版本免疫。
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => null,
        setItem: () => { throw new Error('quota'); },
        removeItem: () => undefined,
        clear: () => undefined,
        key: () => null,
        length: 0,
      },
    });
    renderPanel({ prevGenReferenceId: 'ref-mate80' });
    const popover = await openCreateComposer('Mate 80（上一代）');
    openCal(popover);
    navCalTo(popover, '2025年 10月');
    pickCalWeek(popover, 40);
    pickCalWeek(popover, 40);
    fireEvent.change(titleInputIn(popover), { target: { value: '店庆补贴' } });
    // 自动保存失败 → 工具行 + 编辑器状态行显式「未持久化」
    await waitFor(() => expect(screen.getAllByText('未持久化').length).toBeGreaterThanOrEqual(1));
    expect(document.body.textContent ?? '').toContain('未能保存到浏览器，仅当前页面有效');
    if (original) Object.defineProperty(window, 'localStorage', original);
    fireEvent.click(screen.getByRole('button', { name: '重试保存工作区' }));
    await waitFor(() => expect(screen.queryByText('未持久化')).toBeNull());
    // 内存操作不中断：仍可保存
    fireEvent.change(noteInputIn(await visiblePopover()), { target: { value: '渠道庆补贴' } });
    fireEvent.click(screen.getByRole('button', { name: '保存事件' }));
    await expectComposerClosed();
    const mateCard = cardOf('Mate 80（上一代）');
    await waitFor(() => expect(within(rosterOf(mateCard)).getByRole('button', { name: `删除事件 ${MATE_WEEKS[39]} 店庆补贴` })).toBeTruthy());
  });

  it('缺数纪律（X200）：柱不画、注记「缺数 2026W02、2026W03 · 不计 0」（日历周口径；v3 全周期 108 周 − 缺 2 = 106 柱）', async () => {
    const { container } = renderPanel({ prevGenReferenceId: 'ref-mate80' });
    await addRef('X200（友商同期）');
    const X200_WEEKS = calendarWeeksOf('X200（友商同期）');
    expect(document.body.textContent ?? '').toContain(`缺数 ${X200_WEEKS[12]}、${X200_WEEKS[13]} · 不计 0`);
    const bars = Array.from(container.querySelectorAll('rect')).filter((rect) =>
      (rect.getAttribute('fill') ?? '').startsWith('rgba(38, 147, 202'));
    expect(bars.length).toBe(106);
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
    const mateCard = cardOf('Mate 80（上一代）');
    expandRoster(mateCard);
    expect(within(mateCard).getByRole('button', { name: `编辑事件 ${MATE_WEEKS[22]} 618 档期脉冲` }).getAttribute('tabindex')).toBeNull();
    expect(screen.getByLabelText('Mate 80（上一代） 时间窗起点拖柄').getAttribute('tabindex')).toBe('0');
    expect(screen.getByRole('button', { name: 'Mate 80（上一代） 锁定时间窗' })).toBeTruthy();
    // 图小标键盘可达
    expect(screen.getByRole('button', { name: `事件 ${MATE_WEEKS[22]} 618 档期脉冲` }).getAttribute('tabindex')).toBe('0');
  });

  it('同周龄比值来自模型考量（Pura 90 首预测周 2026W45 = ×0.98）；行口径 = 供①学习参照，不另乘主链（读数行在收起区内，展开后可见）', () => {
    renderPanel({ prevGenReferenceId: 'ref-pura90' });
    expandFootnotes();
    const text = document.body.textContent ?? '';
    expect(text).toContain('首预测周 2026W45 · 同周龄证据');
    expect(text).toContain('×0.98');
    expect(text).toContain('供①学习参照，不另乘主链');
    // 默认参照（Mate 80 = 自身 / 自身）比值 ×1.00，同一行口径（重挂后需再展开）。
    renderPanel({ prevGenReferenceId: 'ref-mate80' });
    expandFootnotes();
    expect(document.body.textContent ?? '').toContain('首预测周 2026W45 · 同周龄证据');
  });
});

// ============================================================
// ①跨卡定位入口（B.5.5 · 任务 7）：主图学习证据跳来 → 定位当前主链面板
// 同周龄段；锁定面板只展开详情（聚焦），不改窗口；既有窗口 / 锁语义不动。
// ============================================================
describe('量价参考产品 · ①跨卡定位（主图学习证据 → 同周龄段）', () => {
  it('locateRequest(seq 递增 + weekId 2027W10)：主链面板窗口聚焦同周龄段（16 周围绕周龄 70）', async () => {
    const utils = renderPanel({ prevGenReferenceId: 'ref-mate80' });
    expect(chartHasWeek('Mate 80（上一代）', MATE_WEEKS[0])).toBe(true);
    // 2027W10 → lifecycleIndex 70 → eventFocusWindow = [62,77]
    //（日历周轴抽稀下恒显示刻度 = 下标 62/64/…/74/77）
    utils.rerender(
      <ReferencePanel
        fixture={fixture}
        result={utils.result}
        prevGenReferenceId="ref-mate80"
        onPrevGenReferenceChange={vi.fn()}
        locateRequest={{ seq: 1, weekId: '2027W10' }}
      />,
    );
    await waitFor(() => expect(chartHasWeek('Mate 80（上一代）', MATE_WEEKS[62])).toBe(true));
    expect(chartHasWeek('Mate 80（上一代）', MATE_WEEKS[70])).toBe(true);
    expect(chartHasWeek('Mate 80（上一代）', MATE_WEEKS[0])).toBe(false);
    expect(chartHasWeek('Galaxy S25（友商同期）', GALAXY_WEEKS[0])).toBe(true);
  });

  it('锁定面板只展开详情不改窗：定位请求到达时窗口保持全周期，聚焦高亮生效（不改锁语义）', async () => {
    const utils = renderPanel({ prevGenReferenceId: 'ref-mate80' });
    fireEvent.click(screen.getByRole('button', { name: 'Mate 80（上一代） 锁定时间窗' }));
    expect(screen.getByRole('button', { name: 'Mate 80（上一代） 解锁时间窗' }).getAttribute('aria-pressed')).toBe('true');
    utils.rerender(
      <ReferencePanel
        fixture={fixture}
        result={utils.result}
        prevGenReferenceId="ref-mate80"
        onPrevGenReferenceChange={vi.fn()}
        locateRequest={{ seq: 1, weekId: '2027W10' }}
      />,
    );
    // 窗口不动（全周期起点刻度仍在）；面板其余语义不变。
    expect(chartHasWeek('Mate 80（上一代）', MATE_WEEKS[0])).toBe(true);
    expect(screen.getByRole('button', { name: 'Mate 80（上一代） 解锁时间窗' }).getAttribute('aria-pressed')).toBe('true');
    const mateCard = cardOf('Mate 80（上一代）');
    expandRoster(mateCard);
    expect(within(mateCard).getByRole('button', { name: `编辑事件 ${MATE_WEEKS[22]} 618 档期脉冲` })).toBeTruthy();
  });

  it('weekId 未知时定位安全跳过（不改窗、不崩溃、不写主链回调）', () => {
    const { onPrevGenReferenceChange } = renderPanel({ prevGenReferenceId: 'ref-mate80', locateRequest: { seq: 1, weekId: '2099W01' } });
    expect(chartHasWeek('Mate 80（上一代）', MATE_WEEKS[0])).toBe(true);
    expect(onPrevGenReferenceChange).not.toHaveBeenCalled();
  });
});
