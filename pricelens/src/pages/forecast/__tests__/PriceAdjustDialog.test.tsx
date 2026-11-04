// ============================================================
// 任务 9 · 价格调整弹窗测试（forecast-global-ia-review 任务 9 Step 2 给定
// 测试 + B.4.7 / B.5.8 契约补充）：
// - 固定提示「价格→销量关系未纳入 · 暂不联动销量」恒在；
// - 「预览销毛变化」只读临时计算（价格/单台销毛/周销毛/预测期销毛前后值），
//   「应用价格调整」仅确认时回调一次；
// - 默认显示当前主图价（不自动加成本差额，无定价依据不预填数值建议）；
// - 参考说明自动带入「参考④ N 月成本版本」可清空；
// - 已有价格手调冲突逐项「保留/覆盖」，默认保留；
// - 月展开 = 该月全部预测周共享同一 batchId 的周价格记录。
// 注：workbenchV3TestFactory 共享工厂由任务 10 统一扩展（B.6.2），本文件按
// 任务边界以本地 makePriceDialogProps 定义 props（接口与 B.6.2 工厂一致）。
// ============================================================
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import PriceAdjustDialog from '../PriceAdjustDialog';
import { workbenchFixture } from '../workbenchFixture';
import { buildForecastCalendar } from '../workbenchCalendar';
import { baseWorkbenchParams, computeWorkbench } from '../workbenchModel';
import { emptyMarginScenario } from '../marginScenarioModel';

afterEach(cleanup);

const fixture = workbenchFixture;
const calendar = buildForecastCalendar(fixture.calendar);
const params = baseWorkbenchParams(fixture);
const result = computeWorkbench(fixture, params);

/** 本地 props 工厂（= B.6.2 makePriceDialogProps 契约；共享工厂文件归任务 10）。 */
function makePriceDialogProps(
  onApply: ComponentProps<typeof PriceAdjustDialog>['onApply'],
): ComponentProps<typeof PriceAdjustDialog> {
  return {
    fixture,
    calendar,
    result,
    scenario: emptyMarginScenario(),
    initialWeekId: calendar.forecastWeeks[0]!.id,
    sourceCostMonth: '2026-11',
    onCancel: vi.fn(),
    onApply,
  };
}

describe('PriceAdjustDialog', () => {
  it('previews margin without claiming a demand effect', () => {
    const onApply = vi.fn<ComponentProps< typeof PriceAdjustDialog>['onApply']>();
    render(<PriceAdjustDialog {...makePriceDialogProps(onApply)} />);
    expect(screen.getByText('价格→销量关系未纳入 · 暂不联动销量')).toBeTruthy();
    expect(onApply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '预览销毛变化' }));
    expect(screen.getByText('预测期销毛变化')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '应用价格调整' }));
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it('默认显示当前主图价：不自动加成本差额（无定价依据只预填当前价）', () => {
    const onApply = vi.fn<ComponentProps< typeof PriceAdjustDialog>['onApply']>();
    render(<PriceAdjustDialog {...makePriceDialogProps(onApply)} />);
    const week = calendar.forecastWeeks[0]!;
    const resultWeek = result.weeks.find((item) => item.weekId === week.id)!;
    const priceInput = screen.getByLabelText('调整后价格（USD/台）') as HTMLInputElement;
    expect(Number(priceInput.value)).toBe(resultWeek.price);
    // 不自动加成本差额：默认值 ≠ 价格 +（价格 − 成本）。
    expect(Number(priceInput.value)).not.toBe(resultWeek.price + (resultWeek.price - resultWeek.unitCost));
  });

  it('参考说明自动带入「参考④ 11 月成本版本」，可清空后应用（reason = 空串）', () => {
    const onApply = vi.fn<ComponentProps< typeof PriceAdjustDialog>['onApply']>();
    render(<PriceAdjustDialog {...makePriceDialogProps(onApply)} />);
    const reasonInput = screen.getByLabelText('参考说明（选填）') as HTMLInputElement;
    expect(reasonInput.value).toBe('参考④ 2026-11 月成本版本');
    fireEvent.change(reasonInput, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '应用价格调整' }));
    expect(onApply).toHaveBeenCalledTimes(1);
    const [entries, meta] = onApply.mock.calls[0]!;
    expect(Object.values(entries)[0]!.reason).toBe('');
    expect(meta.sourceCostMonth).toBe('2026-11');
  });

  it('增减额式：按当前价 + 增减额计算新价后应用（不改销量语义）', () => {
    const onApply = vi.fn<ComponentProps< typeof PriceAdjustDialog>['onApply']>();
    render(<PriceAdjustDialog {...makePriceDialogProps(onApply)} />);
    fireEvent.click(screen.getByRole('radio', { name: '增减额/增减幅' }));
    fireEvent.change(screen.getByLabelText('增减额（USD/台）'), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: '应用价格调整' }));
    const [entries] = onApply.mock.calls[0]!;
    const week = calendar.forecastWeeks[0]!;
    const resultWeek = result.weeks.find((item) => item.weekId === week.id)!;
    expect(entries[week.id]!.price).toBe(resultWeek.price + 50);
    expect(entries[week.id]!.batchId).toBe('price-batch-1');
  });

  it('已有价格手调冲突默认保留：不入新批次；明确选「覆盖」才写入新 batchId', () => {
    const week = calendar.forecastWeeks[0]!;
    const onApply = vi.fn<ComponentProps< typeof PriceAdjustDialog>['onApply']>();
    const props = makePriceDialogProps(onApply);
    render(
      <PriceAdjustDialog
        {...props}
        scenario={{
          costOverrides: {},
          priceOverrides: { [week.id]: { price: 999, reason: '早前手调', batchId: 'price-batch-2' } },
        }}
      />,
    );
    // 冲突行可见：显示既有手调来源批次。
    expect(screen.getByText(/早前手调/)).toBeTruthy();
    // 默认保留 → 新批次不含该周。
    fireEvent.click(screen.getByRole('button', { name: '应用价格调整' }));
    {
      const [entries, meta] = onApply.mock.calls[0]!;
      expect(entries[week.id]).toBeUndefined();
      expect(meta.keptWeekIds).toContain(week.id);
      expect(meta.batchId).toBe('price-batch-3');
    }
    // 明确选「覆盖」→ 该周写入新 batchId（基于既有最大序号 +1）。
    fireEvent.click(screen.getByRole('radio', { name: '覆盖' }));
    fireEvent.click(screen.getByRole('button', { name: '应用价格调整' }));
    {
      const [entries] = onApply.mock.calls[1]!;
      expect(entries[week.id]!.batchId).toBe('price-batch-3');
      expect(entries[week.id]!.price).toBeGreaterThan(0);
    }
    expect(onApply).toHaveBeenCalledTimes(2);
  });

  it('月展开：受影响周清单 = 该月全部预测周，应用后共享同一 batchId', () => {
    const onApply = vi.fn<ComponentProps< typeof PriceAdjustDialog>['onApply']>();
    render(<PriceAdjustDialog {...makePriceDialogProps(onApply)} />);
    fireEvent.click(screen.getByRole('radio', { name: '按月' }));
    const monthWeekIds = calendar.monthByKey.get('2026-11')!.forecastWeekIds;
    expect(monthWeekIds.length).toBeGreaterThan(1);
    for (const weekId of monthWeekIds) {
      expect(screen.getByText(weekId, { exact: false })).toBeTruthy();
    }
    fireEvent.click(screen.getByRole('button', { name: '应用价格调整' }));
    const [entries, meta] = onApply.mock.calls[0]!;
    const batchIds = new Set(Object.values(entries).map((entry) => entry.batchId));
    expect(batchIds.size).toBe(1);
    expect(Object.keys(entries)).toEqual(monthWeekIds);
    expect(meta.targetWeekIds).toEqual(monthWeekIds);
  });

  it('取消回调：onCancel 触发且不应用', () => {
    const onApply = vi.fn<ComponentProps< typeof PriceAdjustDialog>['onApply']>();
    const props = makePriceDialogProps(onApply);
    render(<PriceAdjustDialog {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /取\s*消/ }));
    expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(onApply).not.toHaveBeenCalled();
  });
});
