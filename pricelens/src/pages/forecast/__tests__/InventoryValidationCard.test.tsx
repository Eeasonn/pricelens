// ============================================================
// 量价预测 · 推演工作台 v3 · ③库存修正卡组件测试（jsdom · 任务 6）：
// 正典：design-proposals/forecast-global-ia-review.md B.5.7 / B.4.3 / B.6 任务 6。
// 覆盖：
// 1. 文档 Step 1 给定用例（SI 逐月确认：12 个「确认本月」、无「全部确认」、
//    空白不提交、0 正常提交=本月不补货、确认后「2026-11 · 已确认」）；
// 2. 状态机：基准·待确认 / 已修改·待确认 / 已确认 / 修改已确认月重新待确认 /
//    单月恢复基准重新待确认 / Esc 恢复最后合法值 / 非法值 aria-invalid 就地错误；
// 3. 12 格四个连续三月组（组头+待确认状态不隐藏）+ 拆周（月总量→周整数守恒）；
// 4. SI 联动反馈（aria-live=polite，写实际前后变化：修正已解除 / 新增修正 /
//    手调周「截断事实仍在」）；
// 5. 迁移自 v2 的回归（v3 周身份 = 跨年 WeekId）：截断事实 supplyCapped、
//    判定列表、手调覆盖截断周、无修正状态、规则文案收敛、图面精简、
//    链路条（去编号）、图例显隐、全流程 DOS 收进悬停；
// 6. useSiConfirmations 持久化（forecast.siConfirmation.workbench-demo-v3、
//    失败显式「未持久化」+ 重试）。
// makeInventoryHarnessProps 为 B.6.2 工厂的任务 6 本地版（任务 10 统一收敛）。
// ============================================================
// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useState } from 'react';
import type { ComponentProps } from 'react';
import InventoryValidationCard from '../InventoryValidationCard';
import useSiConfirmations, { siConfirmationKey } from '../useSiConfirmations';
import { workbenchFixture } from '../workbenchFixture';
import {
  baseWorkbenchParams,
  computeWorkbench,
  setManualAdjustment,
  type WorkbenchParams,
} from '../workbenchModel';
import { buildForecastCalendar } from '../workbenchCalendar';
import { fmtWan } from '../WorkbenchBits';
import { niceCeil } from '../../../dataModel/volume';
import { color } from '../../../theme/tokens';

const fixture = workbenchFixture;
const calendar = buildForecastCalendar(fixture.calendar);
const base = baseWorkbenchParams(fixture);

/** 全月高 SI（400000 台/月）：库存不触发修正的「充足」场景（v3 实测 firstAdjustedWeek = null）。 */
const fatParams = (): WorkbenchParams => ({
  ...base,
  siPlanMonthly: Object.fromEntries(Object.keys(base.siPlanMonthly).map((key) => [key, 400000])),
});

// ------------------------------------------------------------
// 本地测试工厂（B.6.2 makeInventoryHarnessProps 契约 · 任务 6 本地版）：
// confirmationState 空表 + 回调 spy（静态 props，验证卡片自身的乐观呈现）；
// 任务 10 收敛进共享工厂。
// ------------------------------------------------------------
const makeInventoryHarnessProps = (
  onSiMonthLive: (monthKey: string, units: number) => void,
): ComponentProps<typeof InventoryValidationCard> => ({
  fixture,
  calendar,
  params: base,
  result: computeWorkbench(fixture, base),
  confirmationState: { byMonth: {} },
  onSiMonthLive,
  onConfirmMonth: vi.fn(),
  onResetMonth: vi.fn(),
  onNavigate: vi.fn(),
});

/**
 * 有状态渲染（与页面同链路）：onSiMonthLive 真实写回 params.siPlanMonthly，
 * 确认工作区走 useSiConfirmations（持久化 = forecast.siConfirmation.workbench-demo-v3），
 * 恢复基准 = 回写基准值 + 清确认记录（重新待确认）。
 */
const renderCard = (initial: WorkbenchParams = base) => {
  const onSiMonthLive = vi.fn();
  const onConfirmMonth = vi.fn();
  const onResetMonth = vi.fn();
  const onNavigate = vi.fn();
  function Harness() {
    const [params, setParams] = useState(initial);
    const si = useSiConfirmations('workbench-demo-v3', params.siPlanMonthly);
    return (
      <InventoryValidationCard
        fixture={fixture}
        calendar={calendar}
        params={params}
        result={computeWorkbench(fixture, params)}
        confirmationState={{ byMonth: si.byMonth }}
        onSiMonthLive={(monthKey, units) => {
          onSiMonthLive(monthKey, units);
          setParams((prev) => ({ ...prev, siPlanMonthly: { ...prev.siPlanMonthly, [monthKey]: units } }));
        }}
        onConfirmMonth={(monthKey, value) => {
          onConfirmMonth(monthKey, value);
          si.confirmMonth(monthKey, value);
        }}
        onResetMonth={(monthKey) => {
          onResetMonth(monthKey);
          setParams((prev) => ({
            ...prev,
            siPlanMonthly: { ...prev.siPlanMonthly, [monthKey]: fixture.inventory.siPlanMonthly[monthKey] ?? 0 },
          }));
          si.resetMonth(monthKey);
        }}
        onNavigate={onNavigate}
      />
    );
  }
  const utils = render(<Harness />);
  return { ...utils, onSiMonthLive, onConfirmMonth, onResetMonth, onNavigate };
};

/** 输出框「判定」行：每个修正周一条（tnum 行，含「修正至」或人工手调读数）。 */
const verdictRowsOf = (container: HTMLElement): string[] =>
  Array.from(container.querySelectorAll('span.tnum'))
    .map((el) => el.textContent ?? '')
    .filter((text) => text.includes('→') && (text.includes('按可售量修正至') || text.includes('人工手调')));

const siInputOf = (container: HTMLElement, monthKey: string): HTMLInputElement =>
  container.querySelector(`input[aria-label="${monthKey} SI 计划（千台/月）"]`) as HTMLInputElement;

const statusChipOf = (container: HTMLElement, monthKey: string): HTMLElement =>
  container.querySelector(`[data-si-status="${monthKey}"]`) as HTMLElement;

const splitLineOf = (container: HTMLElement, monthKey: string): string =>
  (container.querySelector(`[data-si-split="${monthKey}"]`)?.textContent ?? '');

const feedbackTextOf = (container: HTMLElement): string =>
  (container.querySelector('[data-si-feedback]')?.textContent ?? '');

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(cleanup);

// ============================================================
// 任务 6 Step 1 文档给定用例（照抄；工厂 props 本地定义）
// ============================================================
describe('SI monthly confirmation', () => {
  it('requires each month, separates blank from zero, and reopens edited months', () => {
    const onSiMonthLive = vi.fn();
    render(<InventoryValidationCard {...makeInventoryHarnessProps(onSiMonthLive)} />);
    expect(screen.getAllByRole('button', { name: /确认本月/ })).toHaveLength(12);
    expect(screen.queryByRole('button', { name: '全部确认' })).toBeNull();
    const november = screen.getByLabelText('2026-11 SI 计划（千台/月）');
    fireEvent.change(november, { target: { value: '' } });
    fireEvent.blur(november);
    expect(onSiMonthLive).not.toHaveBeenCalled();
    expect(screen.getByText('请输入 0 或恢复基准')).toBeTruthy();
    fireEvent.change(november, { target: { value: '0' } });
    fireEvent.blur(november);
    expect(onSiMonthLive).toHaveBeenCalledWith('2026-11', 0);
    expect(screen.getByText('本月不补货')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '确认 2026-11 SI' }));
    expect(screen.getByText('2026-11 · 已确认')).toBeTruthy();
  });
});

// ============================================================
// SI 逐月确认状态机（B.5.7 / B.4.3）
// ============================================================
describe('SI 逐月确认状态机', () => {
  it('初始全部「基准·待确认」；修改已确认月后自动回到待确认（已修改·待确认）', () => {
    const { container, onSiMonthLive, onConfirmMonth } = renderCard();
    expect((statusChipOf(container, '2026-11').textContent ?? '')).toBe('基准·待确认');
    // 修改并提交 2026-12（180 千台 ≠ 基准 161）→ 按钮名指明确认对象 → 确认
    const december = siInputOf(container, '2026-12');
    fireEvent.change(december, { target: { value: '180' } });
    fireEvent.blur(december);
    expect(onSiMonthLive).toHaveBeenCalledWith('2026-12', 180000);
    fireEvent.click(screen.getByRole('button', { name: '确认 2026-12 SI' }));
    expect(statusChipOf(container, '2026-12').textContent).toBe('2026-12 · 已确认');
    expect(onConfirmMonth).toHaveBeenCalledWith('2026-12', 180000);
    // 修改已确认月 → 自动重新待确认
    fireEvent.change(december, { target: { value: '200' } });
    fireEvent.blur(december);
    expect(onSiMonthLive).toHaveBeenCalledWith('2026-12', 200000);
    expect(statusChipOf(container, '2026-12').textContent).toBe('已修改·待确认');
  });

  it('非法值：不调 setter、aria-invalid 就地错误；改回合法值后错误清除', () => {
    const { container, onSiMonthLive } = renderCard();
    const november = siInputOf(container, '2026-11');
    fireEvent.change(november, { target: { value: '2500' } });
    fireEvent.blur(november);
    expect(onSiMonthLive).not.toHaveBeenCalled();
    expect(november.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('SI 需为 0–2000 的整数（千台）')).toBeTruthy();
    fireEvent.change(november, { target: { value: 'abc' } });
    fireEvent.blur(november);
    expect(onSiMonthLive).not.toHaveBeenCalled();
    expect(november.getAttribute('aria-invalid')).toBe('true');
    fireEvent.change(november, { target: { value: '30' } });
    fireEvent.blur(november);
    expect(onSiMonthLive).toHaveBeenCalledWith('2026-11', 30000);
    expect(november.getAttribute('aria-invalid')).toBe('false');
    expect(screen.queryByText('SI 需为 0–2000 的整数（千台）')).toBeNull();
  });

  it('Esc 恢复最后合法值：草稿丢弃、不提交、错误态清除', () => {
    const { container, onSiMonthLive } = renderCard();
    const november = siInputOf(container, '2026-11');
    november.focus();
    fireEvent.change(november, { target: { value: '999' } });
    fireEvent.keyDown(november, { key: 'Escape' });
    expect(november.value).toBe('221');
    expect(onSiMonthLive).not.toHaveBeenCalled();
    expect(november.getAttribute('aria-invalid')).toBe('false');
    // Enter = blur 提交（真机键入即聚焦；jsdom 需真实 focus）
    fireEvent.change(november, { target: { value: '230' } });
    fireEvent.keyDown(november, { key: 'Enter' });
    expect(onSiMonthLive).toHaveBeenCalledWith('2026-11', 230000);
  });

  it('单月「恢复基准」：回写基准值并重新待确认（基准·待确认）', () => {
    const { container, onSiMonthLive, onResetMonth } = renderCard();
    const january = siInputOf(container, '2027-01');
    fireEvent.change(january, { target: { value: '300' } });
    fireEvent.blur(january);
    expect(statusChipOf(container, '2027-01').textContent).toBe('已修改·待确认');
    fireEvent.click(screen.getByRole('button', { name: '恢复 2027-01 基准 SI' }));
    expect(onSiMonthLive).toHaveBeenCalledWith('2027-01', 165000);
    expect(onResetMonth).toHaveBeenCalledWith('2027-01');
    expect((january.value)).toBe('165');
    expect(statusChipOf(container, '2027-01').textContent).toBe('基准·待确认');
  });
});

// ============================================================
// 12 格分组与拆周（B.5.7：四个连续三月组、组头+待确认状态不隐藏）
// ============================================================
describe('SI 格子分组与拆周', () => {
  it('12 格分四个连续三月组，组头写月份区间与「待确认 n / 3」且不隐藏', () => {
    const { container } = renderCard();
    const groups = Array.from(container.querySelectorAll('[data-si-group]'));
    expect(groups.map((group) => group.getAttribute('data-si-group'))).toEqual([
      '2026-11—2027-01',
      '2027-02—2027-04',
      '2027-05—2027-07',
      '2027-08—2027-10',
    ]);
    for (const group of groups) {
      expect((group.textContent ?? '')).toContain('待确认 3 / 3');
      expect(group.querySelectorAll('input').length).toBe(3);
    }
  });

  it('拆周 = 月总量→周整数守恒（siWeeklyPlan 同源）：2026-11=221 千台 → 五周各 44.2', () => {
    const { container } = renderCard();
    expect(splitLineOf(container, '2026-11')).toBe(
      '2026W45 44.2 · 2026W46 44.2 · 2026W47 44.2 · 2026W48 44.2 · 2026W49 44.2 千台',
    );
    expect(splitLineOf(container, '2026-12')).toBe(
      '2026W50 40.25 · 2026W51 40.25 · 2026W52 40.25 · 2026W53 40.25 千台',
    );
  });

  it('合法提交后拆周随 SI 更新（乐观呈现，不等页面回写）', () => {
    const { container } = renderCard();
    const december = siInputOf(container, '2026-12');
    fireEvent.change(december, { target: { value: '101' } });
    fireEvent.blur(december);
    expect(splitLineOf(container, '2026-12')).toBe(
      '2026W50 25.25 · 2026W51 25.25 · 2026W52 25.25 · 2026W53 25.25 千台',
    );
  });

  it('卡头状态：SI 待确认 N / 12（未全部确认）+ 首修正周 / 未触发', () => {
    const { container } = renderCard();
    expect((container.textContent ?? '')).toContain('SI 待确认 12 / 12');
    expect((container.textContent ?? '')).toContain('未全部确认');
    expect((container.textContent ?? '')).toContain('2026W46 起');
    // 全部确认后 → 0 / 12 + 已全部确认；全月高 SI → 未触发
    const confirmed = Object.fromEntries(
      calendar.forecastMonths.map((month) => [month.key, { confirmedValue: 400000, confirmedAt: '2026-11-05T00:00:00.000Z' }]),
    );
    const view = render(
      <InventoryValidationCard
        fixture={fixture}
        calendar={calendar}
        params={fatParams()}
        result={computeWorkbench(fixture, fatParams())}
        confirmationState={{ byMonth: confirmed }}
      />,
    );
    expect((view.container.textContent ?? '')).toContain('SI 待确认 0 / 12');
    expect((view.container.textContent ?? '')).toContain('已全部确认');
    expect((view.container.textContent ?? '')).toContain('未触发');
  });

  it('SI 格子行在卡头区（SVG 之前），月格子 aria 用 v3 月键，无旧「人工 SI 计划（按月）」', () => {
    const { container } = renderCard();
    const row = container.querySelector('[data-si-cell-row]') as HTMLElement | null;
    const svg = container.querySelector('svg');
    expect(row).not.toBeNull();
    expect(svg).not.toBeNull();
    expect(row!.compareDocumentPosition(svg!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(row!.querySelector('input[aria-label="2026-11 SI 计划（千台/月）"]')).not.toBeNull();
    expect(row!.textContent).toContain('千台/月');
    expect(container.textContent).not.toContain('人工 SI 计划（按月）');
  });
});

// ============================================================
// SI 联动反馈（aria-live=polite，写实际前后变化）
// ============================================================
describe('SI 联动反馈', () => {
  it('SI 提高解除修正：「2026-11 SI +179 千台 → 2026W46 修正已解除」（aria-live=polite）', () => {
    const { container } = renderCard();
    const region = container.querySelector('[data-si-feedback]') as HTMLElement;
    expect(region.getAttribute('aria-live')).toBe('polite');
    const november = siInputOf(container, '2026-11');
    fireEvent.change(november, { target: { value: '400' } });
    fireEvent.blur(november);
    expect(feedbackTextOf(container)).toBe('2026-11 SI +179 千台 → 2026W46 修正已解除');
  });

  it('SI 降为小值新增修正：「2026-11 SI −370 千台 → 2026W45 起新增修正」', () => {
    const { container } = renderCard(fatParams());
    expect((container.textContent ?? '')).toContain('未触发');
    const november = siInputOf(container, '2026-11');
    fireEvent.change(november, { target: { value: '30' } });
    fireEvent.blur(november);
    expect(feedbackTextOf(container)).toBe('2026-11 SI −370 千台 → 2026W45 起新增修正');
  });

  it('手调周截断事实仍在：「… → 2026W46 起修正仍在；截断事实仍在，主图该周显示手调值」', () => {
    const tuned = setManualAdjustment(base, '2026W46', 45000, '会议口径上调') as WorkbenchParams;
    const { container } = renderCard(tuned);
    const november = siInputOf(container, '2026-11');
    fireEvent.change(november, { target: { value: '230' } });
    fireEvent.blur(november);
    expect(feedbackTextOf(container)).toBe(
      '2026-11 SI +9 千台 → 2026W46 起修正仍在；截断事实仍在，主图该周显示手调值',
    );
  });
});

// ============================================================
// 迁移自 v2 的回归（v3 周身份 = 跨年 WeekId）
// ============================================================
describe('库存修正卡 · 基准截断（输出只讲结果 + 万台单位）', () => {
  it('基准截断：输出只讲结果，无「刚性砍 / 中间过程 / 主图只显最终」话术', () => {
    const { container } = renderCard();
    const result = computeWorkbench(fixture, base);
    const cappedWeeks = result.weeks.filter((week) => week.status === 'forecast' && week.supplyCapped);
    expect(cappedWeeks.map((week) => week.weekId)).toEqual([
      '2026W46', '2026W47', '2026W48', '2026W49', '2026W50', '2026W51', '2026W52', '2026W53',
      '2027W01', '2027W02', '2027W03', '2027W04', '2027W13', '2027W14', '2027W15', '2027W16', '2027W17',
    ]);
    const text = container.textContent ?? '';
    expect(text).toContain('2026W46 起');
    expect(text).toContain('按可售量修正');
    expect(text).toContain('修正周');
    for (const banned of ['刚性', '中间计算过程', '主图只显最终', '砍']) {
      expect(text).not.toContain(banned);
    }
  });

  it('判定列表：每个修正周一条、各带自己的跨年周 ID 与修正读数（不共用第一周原因）', () => {
    const { container } = renderCard();
    const result = computeWorkbench(fixture, base);
    const rows = verdictRowsOf(container);
    const cappedWeeks = result.weeks.filter((week) => week.status === 'forecast' && week.supplyCapped);
    expect(rows.length).toBe(cappedWeeks.length);
    cappedWeeks.forEach((week, index) => {
      const row = rows[index];
      expect(row.startsWith(week.weekId)).toBe(true);
      expect(row).toContain(`修正至 ${fmtWan(week.final ?? 0)}`);
    });
    const w46Row = rows.find((row) => row.startsWith('2026W46')) ?? '';
    expect(w46Row).toContain(`修正至 ${fmtWan(45042)}`);
    expect(w46Row).not.toContain('2026W47');
    expect(w46Row).not.toContain('2026W48');
  });

  it('修正段波动参考中性化：chip「修正段 · 波动参考 ±2%」，无「把握」话术', () => {
    const { container } = renderCard();
    const text = container.textContent ?? '';
    expect(text).toContain('修正段 · 波动参考 ±2%');
    expect(text).not.toContain('把握');
    const chip = Array.from(container.querySelectorAll('span[title]')).find((el) => (el.textContent ?? '') === '修正段 · 波动参考 ±2%');
    expect(chip?.getAttribute('title')).toContain('非统计置信区间');
  });

  it('单位统一：右轴与输出为万台，图形 tooltip 不再出现 K 台 / 千分位「台」', () => {
    const { container } = renderCard();
    const text = container.textContent ?? '';
    expect(text).toContain('万台');
    expect(text).not.toMatch(/\d(\.\d+)?K\s*台/);
    expect(text).not.toMatch(/\d{1,3}(,\d{3})+\s*台/);
    const svgTexts = Array.from(container.querySelectorAll('svg text')).map((node) => node.textContent ?? '');
    expect(svgTexts.some((label) => label === '万台')).toBe(true);
    expect(svgTexts.some((label) => /K/.test(label))).toBe(false);
    const titles = Array.from(container.querySelectorAll('svg title')).map((node) => node.textContent ?? '');
    for (const title of titles.filter((t) => t.includes('渠道库存') || t.includes('SI'))) {
      expect(title).toContain('万台');
      expect(title).not.toMatch(/K/);
    }
  });
});

describe('库存修正卡 · 手调覆盖截断周（supplyCapped 仍在）与回主图导航', () => {
  it('手调 2026W50：截断事实保留（微痕与判定仍标修正段起点），该周判定写人工手调', () => {
    const tuned = setManualAdjustment(base, '2026W50', 50000, '会议结论上调') as WorkbenchParams;
    const { container, onNavigate } = renderCard(tuned);
    const result = computeWorkbench(fixture, tuned);
    const w50 = result.weeks.find((week) => week.weekId === '2026W50');
    expect(w50?.supplyCapped).toBe(true);
    expect(w50?.capped).toBe(false);
    const svg = container.querySelector('svg[role="img"]') as SVGSVGElement;
    // v3 基准截断自 2026W46 起（早于手调周 W50）：微痕仍标注修正段起点
    expect(svg.getAttribute('aria-label')).toContain('2026W46 起');
    expect((container.textContent ?? '')).toContain('2026W46 起修正');
    expect((container.textContent ?? '')).toContain('修正段 · 波动参考 ±2%');
    const manualRows = verdictRowsOf(container).filter((row) => row.startsWith('2026W50'));
    expect(manualRows.length).toBe(1);
    expect(manualRows[0]).toContain('人工手调');
    expect(manualRows[0]).toContain(fmtWan(50000));
    // 输出框修正周提供「回主图查看该周」（跨卡焦点回调；任务 10 接线页级）
    const navButton = (Array.from(container.querySelectorAll('button')) as HTMLButtonElement[])
      .find((button) => (button.textContent ?? '').trim() === '回主图查看该周');
    expect(navButton).toBeTruthy();
    fireEvent.click(navButton!);
    expect(onNavigate).toHaveBeenCalledWith(result.firstAdjustedWeek);
    expect(onNavigate).toHaveBeenCalledWith('2026W46');
  });
});

describe('库存修正卡 · 无修正状态', () => {
  it('SI 充足：显示「库存可支撑 / 未触发」，不挂 ±2% 徽标，无判定行', () => {
    const { container } = renderCard(fatParams());
    expect(computeWorkbench(fixture, fatParams()).firstAdjustedWeek).toBeNull();
    const text = container.textContent ?? '';
    expect(text).toContain('库存可支撑');
    expect(text).toContain('当前未触发');
    expect(text).not.toContain('把握');
    expect(text).not.toContain('波动参考 ±2%');
    expect(verdictRowsOf(container).length).toBe(0);
    const svg = container.querySelector('svg[role="img"]') as SVGSVGElement;
    expect(svg.getAttribute('aria-label')).toContain('库存可支撑');
  });
});

describe('库存修正卡 · 规则文案收敛', () => {
  it('规则一行展示 + 「阈值未核定」chip；无「待拍板」；min 公式只在 title', () => {
    const { container } = renderCard();
    const text = container.textContent ?? '';
    expect(text).toContain('DOS 70–90 天 · 降幅预警 20%／30%');
    expect(text).toContain('阈值未核定');
    expect(text).not.toContain('待拍板');
    expect(text).not.toContain('min(');
    const titled = container.querySelectorAll('[title*="min(基线 SO"]');
    expect(titled.length).toBeGreaterThan(0);
  });
});

describe('库存修正卡 · 图面精简（只留库存柱 + 渠道 DOS）', () => {
  it('删全流程 DOS 线与 SI ▼ 三角：图上 path 只剩渠道 DOS 双段（蓝实 / 蓝虚）', () => {
    const { container } = renderCard();
    const chart = container.querySelector('svg[role="img"]') as SVGSVGElement;
    const paths = Array.from(chart.querySelectorAll('path'));
    expect(paths.length).toBe(2);
    for (const path of paths) {
      expect(path.getAttribute('stroke')).toBe(color.link);
    }
  });

  it('SI 不上图：图例只剩「渠道库存（右轴）+ 渠道 DOS」两项，无「SI ▼」', () => {
    const { container } = renderCard();
    const legendLabels = Array.from(container.querySelectorAll('button[aria-pressed]'))
      .map((button) => button.textContent ?? '');
    expect(legendLabels).toEqual(['渠道库存（右轴）', '渠道 DOS']);
    expect(container.textContent).not.toContain('SI ▼');
  });

  it('删 DOS 50 参考格线与健康带：左轴只标 0 与数据派生上限', () => {
    const { container } = renderCard();
    const chart = container.querySelector('svg[role="img"]') as SVGSVGElement;
    const leftLabels = Array.from(chart.querySelectorAll('text[text-anchor="end"]'))
      .map((node) => node.textContent ?? '')
      .filter((label) => /^\d+$/.test(label));
    const result = computeWorkbench(fixture, base);
    const dosMax = Math.max(1, niceCeil(Math.max(...result.weeks.map((week) => week.channelDos ?? 0))));
    expect(leftLabels).toEqual(['0', String(Math.round(dosMax))]);
    expect(leftLabels).not.toContain('50');
    const svgTexts = Array.from(chart.querySelectorAll('text')).map((node) => node.textContent ?? '');
    expect(svgTexts.some((label) => label === '70 天' || label === '90 天')).toBe(false);
    const bandBackings = Array.from(chart.querySelectorAll('rect')).filter((rect) => rect.getAttribute('opacity') === '0.6');
    expect(bandBackings).toHaveLength(0);
    const bandLines = Array.from(chart.querySelectorAll('line')).filter(
      (line) => line.getAttribute('stroke') === color.mute && line.getAttribute('stroke-dasharray') === '3 4',
    );
    expect(bandLines).toHaveLength(0);
    expect(chart.getAttribute('aria-label')).not.toContain('合理带');
    expect(container.textContent ?? '').toContain('DOS 70–90 天');
  });

  it('选中点弹全流程 DOS 数值提示：库存柱悬停 title 含全流程 DOS 与 SI（线不上图）', () => {
    const { container } = renderCard();
    const titles = Array.from(container.querySelectorAll('svg title')).map((node) => node.textContent ?? '');
    expect(titles.some((title) => title.includes('全流程 DOS'))).toBe(true);
    expect(titles.some((title) => title.includes('SI ') && title.includes('万台'))).toBe(true);
    const svg = container.querySelector('svg[role="img"]') as SVGSVGElement;
    expect(svg.getAttribute('aria-label')).toContain('全流程 DOS 不上图');
  });
});

describe('库存修正卡 · 链路指示条（去编号 · 与页级管线①–④不重号）', () => {
  const stepLabelsOf = (container: HTMLElement): string[] =>
    Array.from(container.querySelectorAll('[data-flow-step]')).map((el) => el.getAttribute('data-flow-step') ?? '');

  it('五节点定序完整且无编号：主图基线 SO → 反算 DOS/库存 → 健康判定 → 上限修正 → 回写主图', () => {
    const { container } = renderCard();
    const steps = Array.from(container.querySelectorAll('[data-flow-step]')) as HTMLElement[];
    expect(stepLabelsOf(container)).toEqual(['主图基线 SO', '反算 DOS/库存', '健康判定', '上限修正', '回写主图']);
    for (const step of steps) {
      expect((step.textContent ?? '').trim()).not.toMatch(/^\d/);
    }
    const bar = container.querySelector('[data-flow-bar]') as HTMLElement;
    expect(bar.getAttribute('aria-label')).toContain('主图基线 SO → 反算 DOS/库存 → 健康判定 → 上限修正 → 回写主图');
  });

  it('基准（2026W46 起截断）：「上限修正」琥珀点亮注 2026W46 起，「回写主图」激活', () => {
    const { container } = renderCard();
    const cap = container.querySelector('[data-flow-step="上限修正"]') as HTMLElement;
    expect(cap.getAttribute('data-state')).toBe('amber');
    expect(cap.textContent).toContain('2026W46 起');
    expect(cap.getAttribute('title')).toContain('min(基线 SO, 可售)');
    const write = container.querySelector('[data-flow-step="回写主图"]') as HTMLElement;
    expect(write.getAttribute('data-state')).toBe('active');
    expect(write.textContent).not.toContain('未触发');
  });

  it('2026-11 SI=0：点亮注 2026W45 起', () => {
    const { container } = renderCard();
    const november = siInputOf(container, '2026-11');
    fireEvent.change(november, { target: { value: '0' } });
    fireEvent.blur(november);
    const cap = container.querySelector('[data-flow-step="上限修正"]') as HTMLElement;
    expect(cap.getAttribute('data-state')).toBe('amber');
    expect(cap.textContent).toContain('2026W45 起');
  });

  it('SI 充足（无修正）：「上限修正」不点亮，「回写主图 · 未触发」灰化', () => {
    const { container } = renderCard(fatParams());
    const cap = container.querySelector('[data-flow-step="上限修正"]') as HTMLElement;
    expect(cap.getAttribute('data-state')).toBe('base');
    expect(cap.textContent).not.toContain('起');
    const write = container.querySelector('[data-flow-step="回写主图"]') as HTMLElement;
    expect(write.getAttribute('data-state')).toBe('muted');
    expect(write.textContent).toContain('未触发');
  });
});

describe('库存修正卡 · 图例显隐保留', () => {
  it('图例点击切换显隐（aria-pressed），隐藏渠道 DOS 后双线移除', () => {
    const { container } = renderCard();
    const dosButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === '渠道 DOS');
    expect(dosButton).toBeDefined();
    expect(dosButton!.getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelectorAll('path[stroke="#0070f3"]').length).toBeGreaterThan(0);
    fireEvent.click(dosButton!);
    expect(dosButton!.getAttribute('aria-pressed')).toBe('false');
    expect(container.querySelectorAll('path[stroke="#0070f3"]').length).toBe(0);
  });
});

// ============================================================
// useSiConfirmations（B.4.3 / B.5.10：持久化键 + 未持久化重试）
// ============================================================
describe('useSiConfirmations', () => {
  const siPlan = base.siPlanMonthly;

  it('状态机：pending → confirmed →（值变化）modified；confirmMonth 持久化到 sessionStorage', () => {
    const { result } = renderHook(() => useSiConfirmations('workbench-demo-v3', siPlan));
    expect(result.current.statusOf('2026-11')).toBe('pending');
    act(() => result.current.confirmMonth('2026-11', 221000));
    expect(result.current.statusOf('2026-11')).toBe('confirmed');
    expect(result.current.statusOf('2026-11', 30000)).toBe('modified');
    const raw = sessionStorage.getItem(siConfirmationKey('workbench-demo-v3'));
    expect(raw).not.toBeNull();
    expect(raw ?? '').toContain('"confirmedValue":221000');
    // 重挂读回（页签会话）
    const revived = renderHook(() => useSiConfirmations('workbench-demo-v3', siPlan));
    expect(revived.result.current.byMonth['2026-11']?.confirmedValue).toBe(221000);
    act(() => revived.result.current.resetMonth('2026-11'));
    expect(revived.result.current.statusOf('2026-11')).toBe('pending');
    act(() => {
      revived.result.current.confirmMonth('2026-12', 161000);
      revived.result.current.resetAll();
    });
    expect(revived.result.current.byMonth['2026-12']).toBeUndefined();
  });

  it('持久化失败显式「未持久化」，retryPersist 恢复 ready（不静默丢数据）', () => {
    const { result } = renderHook(() => useSiConfirmations('workbench-demo-v3', siPlan));
    // jsdom 的 sessionStorage 实例方法不经全局 Storage.prototype（实例原型为
    // 独立类且 get 陷阱绕过自有属性），须对实例原型打 spy 才能拦到写入。
    const storageProto = Object.getPrototypeOf(sessionStorage) as Storage;
    const setItemSpy = vi.spyOn(storageProto, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    act(() => result.current.confirmMonth('2026-11', 221000));
    expect(result.current.saveState).toBe('unpersisted');
    // 内存态仍在（不丢数据）
    expect(result.current.byMonth['2026-11']?.confirmedValue).toBe(221000);
    setItemSpy.mockRestore();
    act(() => result.current.retryPersist());
    expect(result.current.saveState).toBe('ready');
    expect(sessionStorage.getItem(siConfirmationKey('workbench-demo-v3'))).toContain('"confirmedValue":221000');
  });

  it('坏 JSON / 错型条目逐项剔除，不崩溃', () => {
    sessionStorage.setItem(siConfirmationKey('workbench-demo-v3'), '{"byMonth":{"2026-11":{"confirmedValue":"x"},"2026-12":{"confirmedValue":161000,"confirmedAt":"2026-11-05T00:00:00.000Z"}}}');
    const { result } = renderHook(() => useSiConfirmations('workbench-demo-v3', siPlan));
    expect(result.current.byMonth['2026-11']).toBeUndefined();
    expect(result.current.byMonth['2026-12']?.confirmedValue).toBe(161000);
  });
});
