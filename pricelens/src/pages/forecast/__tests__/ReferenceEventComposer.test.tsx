// ============================================================
// 推演工作台 v2 · 事件编辑器组件测试（视觉精简二轮迁移，jsdom）：
// 类型下拉（类型库 + 色点）、类型颜色入口（色板 8 色 / hex / 恢复默认，写
// referenceEventTypeStore）、双月周历选择器（两月并排、行 = 整周周一起、
// 行首 = 生命周期周号；第一次点击 = 起始周、第二次点击 = 止周并自动收起；
// 起 > 止自动对调；月导航 ‹ ›；周 ID 跨年不串值）、「图上拖选」入口、
// 标题 / 说明必填与上限校验（首次提交尝试后才报错）、「参考读数（选填）」
// 默认收起（幅度 / 影响时长 / 衰减；仅历史标注不进模型）、状态行（已自动
// 保存到本浏览器 / 未持久化 + 重试）、按钮组（保存事件 / 收起 / 丢弃草稿 /
// 恢复预标）、新增 / 编辑标题切换。
// 值受控（父层持有草稿并自动保存）；类型库经 useSyncExternalStore 自持。
// ============================================================
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import ReferenceEventComposer from '../ReferenceEventComposer';
import { lifecycleWeekIdsOf, type ReferenceEventDraftValue } from '../referenceEventModel';
import {
  BUILTIN_REFERENCE_EVENT_TYPES,
  getReferenceEventTypesSnapshot,
  referenceEventColorOf,
  resetReferenceEventTypeStoreForTests,
  setReferenceEventTypeColor,
} from '../referenceEventTypeStore';
import { workbenchFixture } from '../workbenchFixture';
import { referenceEventPalette } from '../../../theme/tokens';

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
  localStorage.clear();
  resetReferenceEventTypeStoreForTests();
});
afterEach(cleanup);

const MATE80 = workbenchFixture.references.lifecyclePool[0];
// Mate 80 上市周 = fixture launchWeekLabel 2025-W02 → 生命周期 W1 = 2025W02；
// 月历首页 = 2025年 1月 / 2月（W1–W8）。已选区间读法 = 日历周 ID（与图轴同口径）。
const MATE80_W1_WEEK_ID = '2025W02';
const MATE_WEEKS = lifecycleWeekIdsOf(MATE80);

const emptyDraft: ReferenceEventDraftValue = {
  typeId: 'competitor-launch',
  startWeek: null,
  endWeek: null,
  label: '',
  note: '',
  impact: null,
};

/** 受控宿主（与父层真实接线一致：草稿值随 onChange 更新并自动保存）。 */
function Host(props: {
  initial?: Partial<ReferenceEventDraftValue>;
  mode?: 'create' | 'edit';
  saveState?: 'saved' | 'unpersisted';
  onRestorePreset?: () => void;
  onPickRange?: () => void;
  onSubmit?: (value: ReferenceEventDraftValue) => void;
  onCollapse?: () => void;
  onDiscard?: () => void;
}) {
  const [value, setValue] = useState<ReferenceEventDraftValue>({ ...emptyDraft, ...props.initial });
  return (
    <ReferenceEventComposer
      product={MATE80}
      mode={props.mode ?? 'create'}
      value={value}
      onChange={(patch) => setValue((prev) => ({ ...prev, ...patch }))}
      onPickRange={props.onPickRange ?? vi.fn()}
      onSubmit={() => props.onSubmit?.(value)}
      onCollapse={props.onCollapse ?? vi.fn()}
      onDiscard={props.onDiscard ?? vi.fn()}
      onRestorePreset={props.onRestorePreset}
      saveState={props.saveState ?? 'saved'}
      onRetryPersist={vi.fn()}
    />
  );
}

async function openSelect(ariaLabel: string): Promise<HTMLElement> {
  // jsdom 无动画事件：此前关闭的下拉壳仍缺 -hidden 类，先补上再开新的（取最新展开的下拉）
  document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
    .forEach((el) => el.classList.add('ant-select-dropdown-hidden'));
  const trigger = screen.getAllByLabelText(ariaLabel)[0];
  fireEvent.mouseDown(trigger.querySelector('.ant-select-selector') ?? trigger);
  return await waitFor(() => {
    const el = [...document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')].pop();
    if (!el) throw new Error(`${ariaLabel} 下拉未展开`);
    return el as HTMLElement;
  });
}

async function pickOption(ariaLabel: string, text: string): Promise<void> {
  const dropdown = await openSelect(ariaLabel);
  const option = [...dropdown.querySelectorAll('.ant-select-item-option')]
    .find((item) => (item.textContent ?? '').includes(text));
  if (!option) throw new Error(`选项未找到：${text}`);
  fireEvent.click(option);
}

// ---- 双月周历助手 ----
function openCalendar(): void {
  fireEvent.click(screen.getByRole('button', { name: '选择起止周' }));
}
function calendarGroup(): HTMLElement {
  return screen.getByRole('group', { name: '起止周双月历' });
}
function pickWeek(week: number): void {
  const row = [...calendarGroup().querySelectorAll('button')]
    .find((node) => (node.getAttribute('aria-label') ?? '').startsWith(`W${week}（`));
  if (!row) throw new Error(`周历行未找到：W${week}（当前月页可能不含该周，需先翻月）`);
  fireEvent.click(row);
}
function navMonth(target: string): void {
  const group = calendarGroup();
  for (let i = 0; i < 30; i += 1) {
    if ((group.textContent ?? '').includes(target)) return;
    const next = within(group).getByRole('button', { name: '下一月' }) as HTMLButtonElement;
    if (next.disabled) throw new Error(`月历无法翻到「${target}」（已到末页）`);
    fireEvent.click(next);
  }
  throw new Error(`月历未翻到「${target}」`);
}

describe('ReferenceEventComposer · 类型与类型颜色入口（类型库）', () => {
  it('类型下拉含五个内置类型；切换经 onChange 带 typeId', async () => {
    const onSubmit = vi.fn();
    render(<Host onSubmit={onSubmit} />);
    await pickOption('事件类型', '促销投放');
    expect(screen.getAllByLabelText('事件类型')[0].textContent).toContain('促销投放');
    // 提交后父层收到 typeId 变更后的草稿值（typeId 走类型库 id）；起止周经周历选择
    fireEvent.change(screen.getByLabelText('事件标题（必填）'), { target: { value: '618 档期脉冲' } });
    fireEvent.change(screen.getByLabelText('事件说明（必填）'), { target: { value: '档期补贴' } });
    openCalendar();
    pickWeek(1);
    pickWeek(3);
    expect(screen.queryByRole('group', { name: '起止周双月历' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '保存事件' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ typeId: 'promo', startWeek: 0, endWeek: 2 }));
  });

  it('色块入口：色板 8 色点击写类型库（同类型事件全部同步变色）；hex 与恢复默认可用', async () => {
    render(<Host initial={{ typeId: 'promo' }} />);
    fireEvent.click(screen.getByRole('button', { name: '编辑类型「促销投放」颜色' }));
    // 默认色 = 色板第 2 项（促销琥珀）
    expect(referenceEventColorOf(getReferenceEventTypesSnapshot(), 'promo')).toBe(referenceEventPalette[1]);
    // 点击色板第 1 项 → 类型库 promo 颜色更新（事件只存 typeId，调色后引用同步）
    const swatch = screen.getByRole('button', { name: `色板 ${referenceEventPalette[0]}` });
    fireEvent.click(swatch);
    expect(referenceEventColorOf(getReferenceEventTypesSnapshot(), 'promo')).toBe(referenceEventPalette[0]);
    // 恢复默认：回色板默认位
    fireEvent.click(screen.getByRole('button', { name: '恢复默认' }));
    expect(referenceEventColorOf(getReferenceEventTypesSnapshot(), 'promo')).toBe(referenceEventPalette[1]);
    // hex 输入合法值提交（Enter / 失焦）→ 写库
    const hex = screen.getByLabelText('hex 颜色值');
    fireEvent.change(hex, { target: { value: '#123456' } });
    fireEvent.blur(hex);
    expect(referenceEventColorOf(getReferenceEventTypesSnapshot(), 'promo')).toBe('#123456');
    // 非法 hex 回退当前色，不写库
    fireEvent.change(hex, { target: { value: 'zzz' } });
    fireEvent.blur(hex);
    expect((hex as HTMLInputElement).value).toBe('#123456');
    // 内置类型默认色与主图语义同源（前四 = link / warning / ink / mute + 扩展）
    expect(referenceEventPalette).toHaveLength(8);
    expect(BUILTIN_REFERENCE_EVENT_TYPES.map((t) => t.id)).toEqual(['competitor-launch', 'own-launch', 'promo', 'cannibalization', 'other']);
    expect(getReferenceEventTypesSnapshot().types).toHaveLength(5);
    // 直接改库验证「颜色按类型生效」的单一来源
    setReferenceEventTypeColor('promo', '#0f766e');
    expect(referenceEventColorOf(getReferenceEventTypesSnapshot(), 'promo')).toBe('#0f766e');
  });

  it('对比度提示非阻断（浅色给提醒，文字标签仍在）', () => {
    render(<Host initial={{ typeId: 'other' }} />);
    fireEvent.click(screen.getByRole('button', { name: '编辑类型「其他」颜色' }));
    // 与量柱品牌色（HUAWEI #c7000b）几乎相同 → 非阻断提醒；文字标签仍在
    const hex = screen.getByLabelText('hex 颜色值');
    fireEvent.change(hex, { target: { value: '#c7000b' } });
    fireEvent.blur(hex);
    expect(screen.getByText('与量柱 / 价格线颜色过近，事件可能被误读为数据系列（非阻断提醒；类型文字始终显示）')).toBeTruthy();
    void referenceEventPalette;
  });
});

describe('ReferenceEventComposer · 双月周历选择器（起止周）', () => {
  it('两月并排首页 = 上市月（2025年 1月 / 2月）；行首 = 生命周期周号，行携带跨年周 ID', () => {
    render(<Host />);
    openCalendar();
    const group = calendarGroup();
    expect((group.textContent ?? '')).toContain('2025年 1月 / 2025年 2月');
    // 行首 = 生命周期周号；aria 名含跨年周 ID（W1 = 2025W02，不串值）
    const row1 = within(group).getByRole('button', { name: `W1（${MATE80_W1_WEEK_ID}）` });
    expect(row1.getAttribute('aria-pressed')).toBe('false');
    expect((row1.textContent ?? '').startsWith('1')).toBe(true);
  });

  it('第一次点击 = 起始周（区间收拢该周），第二次点击 = 止周并自动收起；时长派生', () => {
    const onSubmit = vi.fn();
    render(<Host onSubmit={onSubmit} />);
    openCalendar();
    pickWeek(1);
    // 第一次点击后区间收拢为该周（日历周口径），周历保持展开等待止周
    expect(screen.getByText(`已选 ${MATE_WEEKS[0]} · 1 周`)).toBeTruthy();
    expect(screen.queryByRole('group', { name: '起止周双月历' })).not.toBeNull();
    pickWeek(4);
    expect(screen.getByText(`已选 ${MATE_WEEKS[0]}–${MATE_WEEKS[3]} · 4 周`)).toBeTruthy();
    // 止周选完自动收起；区间内浅蓝 + 选中周实蓝由样式承载（此处验证 aria-pressed）
    expect(screen.queryByRole('group', { name: '起止周双月历' })).toBeNull();
    fireEvent.change(screen.getByLabelText('事件标题（必填）'), { target: { value: '标题' } });
    fireEvent.change(screen.getByLabelText('事件说明（必填）'), { target: { value: '说明' } });
    fireEvent.click(screen.getByRole('button', { name: '保存事件' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ startWeek: 0, endWeek: 3 }));
  });

  it('起 > 止自动对调（先点 W4 再点 W2 → W2–W4）', () => {
    render(<Host />);
    openCalendar();
    pickWeek(4);
    pickWeek(2);
    expect(screen.getByText(`已选 ${MATE_WEEKS[1]}–${MATE_WEEKS[3]} · 3 周`)).toBeTruthy();
  });

  it('月导航 ‹ ›：翻月后跨月连续选周；‹ 在首页禁用', () => {
    render(<Host />);
    openCalendar();
    expect((calendarGroup().querySelector('[aria-label="上一月"]') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(calendarGroup()).getByRole('button', { name: '下一月' }));
    expect((calendarGroup().textContent ?? '')).toContain('2025年 2月 / 2025年 3月');
    // 跨月连续：2 月的 W5 起始、3 月的 W7 止周（不同月页各一行）
    pickWeek(5);
    pickWeek(7);
    expect(screen.getByText(`已选 ${MATE_WEEKS[4]}–${MATE_WEEKS[6]} · 3 周`)).toBeTruthy();
  });

  it('「图上拖选」触发 onPickRange（父层收起弹层、面板顶操作条）', () => {
    const onPickRange = vi.fn();
    render(<Host onPickRange={onPickRange} />);
    fireEvent.click(screen.getByRole('button', { name: '图上拖选' }));
    expect(onPickRange).toHaveBeenCalledTimes(1);
  });

  it('未选择起止周提交 → 「请选择起止周」，不提交', () => {
    const onSubmit = vi.fn();
    render(<Host initial={{ label: '标题', note: '说明' }} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: '保存事件' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('请选择起止周')).toBeTruthy();
  });
});

describe('ReferenceEventComposer · 标题 / 说明校验与提交', () => {
  it('标题与说明必填：首次提交尝试后报错；填后提交（值去空白由父层处理，组件带原始值）', () => {
    const onSubmit = vi.fn();
    render(<Host initial={{ startWeek: 22, endWeek: 22 }} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: '保存事件' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('请填写标题')).toBeTruthy();
    expect(screen.getByText('请填写说明')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('事件标题（必填）'), { target: { value: '618 档期脉冲' } });
    fireEvent.change(screen.getByLabelText('事件说明（必填）'), { target: { value: '平台补贴与档期降价叠加' } });
    fireEvent.click(screen.getByRole('button', { name: '保存事件' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('上限校验：标题 > 40 字、说明 > 200 字提示且不提交', () => {
    const onSubmit = vi.fn();
    render(<Host initial={{ startWeek: 1, endWeek: 2, label: 'a'.repeat(41), note: 'b'.repeat(201) }} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: '保存事件' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('标题不超过 40 字')).toBeTruthy();
    expect(screen.getByText('说明不超过 200 字')).toBeTruthy();
  });
});

describe('ReferenceEventComposer · 参考读数（选填）与状态行', () => {
  it('默认收起；展开后幅度 / 影响时长 / 衰减可填（onChange impact patch）', async () => {
    const onSubmit = vi.fn();
    render(<Host initial={{ startWeek: 22, endWeek: 25, label: '618', note: '档期' }} onSubmit={onSubmit} />);
    expect(screen.queryByLabelText('参考幅度（%）')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /参考读数（选填）/ }));
    fireEvent.change(screen.getByLabelText('参考幅度（%）'), { target: { value: '42' } });
    fireEvent.change(screen.getByLabelText('参考影响时长（周）'), { target: { value: '4' } });
    await pickOption('参考衰减', '递减');
    expect(screen.getByText('仅历史参考标注，不参与任何模型计算')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '保存事件' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      impact: { magnitudePct: 42, durationWeeks: 4, decay: 'decreasing' },
    }));
  });

  it('状态行：saved = 已自动保存到本浏览器；unpersisted = 未持久化 + 重试按钮', () => {
    const onRetryPersist = vi.fn();
    render(<Host saveState="saved" />);
    expect(screen.getByText('已自动保存到本浏览器')).toBeTruthy();
    // Host 固定 saveState=saved；直接渲染 unpersisted 变体
    render(
      <ReferenceEventComposer
        product={MATE80}
        mode="create"
        value={emptyDraft}
        onChange={vi.fn()}
        onPickRange={vi.fn()}
        onSubmit={vi.fn()}
        onCollapse={vi.fn()}
        onDiscard={vi.fn()}
        saveState="unpersisted"
        onRetryPersist={onRetryPersist}
      />,
    );
    expect(screen.getByText('未持久化')).toBeTruthy();
    expect(screen.getByText('未能保存到浏览器，仅当前页面有效')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(onRetryPersist).toHaveBeenCalledTimes(1);
  });
});

describe('ReferenceEventComposer · 模式与按钮组', () => {
  it('新增 / 编辑标题切换；收起 / 丢弃草稿回调；恢复预标仅在提供时出现', () => {
    const onCollapse = vi.fn();
    const onDiscard = vi.fn();
    const { rerender } = render(
      <Host mode="create" onCollapse={onCollapse} onDiscard={onDiscard} />,
    );
    expect(screen.getByText('新增事件')).toBeTruthy();
    expect(screen.getByRole('button', { name: '收起' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '丢弃草稿' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '恢复预标' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '收起' }));
    expect(onCollapse).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '丢弃草稿' }));
    expect(onDiscard).toHaveBeenCalledTimes(1);
    rerender(
      <ReferenceEventComposer
        product={MATE80}
        mode="edit"
        value={{ ...emptyDraft, startWeek: 22, endWeek: 22, label: '618 档期脉冲', note: '档期' }}
        onChange={vi.fn()}
        onPickRange={vi.fn()}
        onSubmit={vi.fn()}
        onCollapse={vi.fn()}
        onDiscard={vi.fn()}
        onRestorePreset={vi.fn()}
        saveState="saved"
      />,
    );
    expect(screen.getByText('编辑事件')).toBeTruthy();
    expect(screen.getByRole('button', { name: '恢复预标' })).toBeTruthy();
    // 本地草稿标识（持久化语义，不再写「刷新即清 / 仅本次会话」）
    expect(screen.getByText('本地草稿')).toBeTruthy();
    expect(document.body.textContent ?? '').not.toContain('仅本次会话');
  });
});
