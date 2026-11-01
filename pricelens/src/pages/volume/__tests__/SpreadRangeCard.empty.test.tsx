// ============================================================
// 极差卡空态组件级测试（2026-11-01 异常守卫 QA 修复回归）：
// spreadCardEmptyModel 产出可见空卡（QA Bug#4：调用侧以对象真值判定导致空卡
// 分支不可达——空卡模型的可见性与文案在此钉住，VolumePrice 调用侧以
// min/spread 字段判定后本路径可达）。
// ============================================================
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import SpreadRangeCard from '../SpreadRangeCard';
import { spreadCardEmptyModel, spreadCardModel } from '../spreadCards';
import { pricePointValid, rangeSpreadOf } from '../periodSummary';

afterEach(cleanup);

describe('spreadCardEmptyModel · 区间内无可信价格', () => {
  it('空卡模型可见且带业务文案与 aria 描述', () => {
    const m = spreadCardEmptyModel('价格');
    expect(m.visible).toBe(true);
    expect(m.emptyText).toBe('区间内无可信价格');
    expect(m.ariaLabel).toBe('价格区间内无可信价格');
  });

  it('SpreadRangeCard 渲染空态：只出标题与说明，不出极差数值行', () => {
    const { container } = render(<SpreadRangeCard title="价格极差" model={spreadCardEmptyModel('价格')} />);
    const text = container.textContent ?? '';
    expect(text).toContain('价格极差');
    expect(text).toContain('区间内无可信价格');
    expect(text).not.toContain('↕');
  });

  it('QA Bug#4 场景：区间内价格全被隔离 → rangeSpreadOf 无可信极值（调用侧据 min/spread 判空）', () => {
    const trusted = [null, null, null]; // 隔离周被置 null
    const spread = rangeSpreadOf(trusted, pricePointValid);
    expect(spread.min).toBeNull();
    expect(spread.spread).toBeNull();
    expect(spread.validCount).toBe(0);
    // 调用侧判定口径：min/spread 字段而非对象真值（对象恒真值——曾经的坑）
    expect(spread).toBeTruthy();
    expect(spread.min != null && spread.spread != null).toBe(false);
    // 对照：可信极差正常出卡
    const ok = spreadCardModel(
      rangeSpreadOf([300, 547], pricePointValid),
      (v) => `$${Math.round(v)}`,
      '价格',
    );
    expect(ok.visible).toBe(true);
    expect(ok.primary).toBe('82.3%');
  });
});
