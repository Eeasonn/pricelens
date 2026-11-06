// ============================================================
// 量价预测 · 步间对比与因果记录审计卡组件测试（Batch 2 · 2026-11-07）：
// 失败横幅（role=alert + 重试回调 + 保留旧值文案）、上下文漂移提醒、
// 步行展开五要素、证据行「采集时间：待确认」缺省、定位回调。
// ============================================================
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import ForecastAuditTrail from '../ForecastAuditTrail';
import type { ForecastStepResult } from '../forecastSteps';
import { workbenchFixture } from '../workbenchFixture';
import { baseWorkbenchParams, computeWorkbench } from '../workbenchModel';
import { computeMarginView, emptyMarginScenario } from '../marginScenarioModel';
import buildForecastSteps from '../forecastSteps';

const fixture = workbenchFixture;
const stepsOf = (): ForecastStepResult[] => {
  const params = baseWorkbenchParams(fixture);
  const result = computeWorkbench(fixture, params);
  return buildForecastSteps(fixture, params, result, computeMarginView(fixture, result, emptyMarginScenario()), emptyMarginScenario(), { byMonth: {} });
};

afterEach(cleanup);

describe('ForecastAuditTrail · 步间对比与因果记录', () => {
  it('重算失败：role=alert 横幅 + 保留旧值文案 + 重试回调；恢复正常后横幅消失', () => {
    const onRetryCompute = vi.fn();
    const { rerender } = render(
      <ForecastAuditTrail
        steps={stepsOf()}
        contextFingerprint="fp-1"
        computeError="fixture 周序列与统一日历不同源（index 0）"
        onRetryCompute={onRetryCompute}
        onLocate={vi.fn()}
      />,
    );
    const banner = document.querySelector('[data-audit-compute-error]') as HTMLElement | null;
    expect(banner).not.toBeNull();
    expect(banner!.getAttribute('role')).toBe('alert');
    expect(banner!.textContent).toContain('重算失败');
    expect(banner!.textContent).toContain('已保留上次成功结果');
    fireEvent.click(banner!.querySelector('button')!);
    expect(onRetryCompute).toHaveBeenCalledTimes(1);
    // 正常态：无横幅
    rerender(
      <ForecastAuditTrail
        steps={stepsOf()}
        contextFingerprint="fp-1"
        computeError={null}
        onRetryCompute={onRetryCompute}
        onLocate={vi.fn()}
      />,
    );
    expect(document.querySelector('[data-audit-compute-error]')).toBeNull();
  });

  it('上下文漂移提醒（contextStaleNote 非空显示；null 不显示）', () => {
    render(
      <ForecastAuditTrail
        steps={stepsOf()}
        contextFingerprint="fp-1"
        contextStaleNote="全局筛选当前为 德国 · 手机，与固定样本（意大利 · 手机）不一致"
        computeError={null}
        onRetryCompute={vi.fn()}
        onLocate={vi.fn()}
      />,
    );
    const note = document.querySelector('[data-audit-context-stale]') as HTMLElement | null;
    expect(note).not.toBeNull();
    expect(note!.getAttribute('role')).toBe('status');
    expect(note!.textContent).toContain('不一致');
    expect(note!.textContent).toContain('指纹');
  });

  it('步行展开：修正原因与证据缺省采集时间可见；Esc 收起；定位回调带步骤号', () => {
    const onLocate = vi.fn();
    const params = {
      ...baseWorkbenchParams(fixture),
      marketMonthOverrides: { '2027-03': { value: 92, reason: '竞品降价跟随' } },
    };
    const result = computeWorkbench(fixture, params);
    const steps = buildForecastSteps(
      fixture,
      params,
      result,
      computeMarginView(fixture, result, emptyMarginScenario()),
      emptyMarginScenario(),
      { byMonth: {} },
    );
    render(
      <ForecastAuditTrail
        steps={steps}
        contextFingerprint="fp-2"
        computeError={null}
        onRetryCompute={vi.fn()}
        onLocate={onLocate}
      />,
    );
    // 展开②：人工月调整带原因；证据行缺采集时间 → 待确认
    fireEvent.click(document.querySelector('[data-audit-toggle="2"]') as HTMLButtonElement);
    const detail = document.querySelector('[data-audit-detail="2"]') as HTMLElement;
    expect(detail.textContent).toContain('原因：竞品降价跟随');
    expect(detail.textContent).toContain('采集时间：待确认');
    expect(detail.textContent).toContain('待接入');
    // Esc 收起（取消不写入语义的键盘通道）
    fireEvent.keyDown(detail, { key: 'Escape' });
    expect(document.querySelector('[data-audit-detail="2"]')).toBeNull();
    // 定位回调带步骤号（只滚动，不重算）
    fireEvent.click(document.querySelector('[data-audit-locate="2"]') as HTMLButtonElement);
    expect(onLocate).toHaveBeenCalledWith(2);
  });
});
