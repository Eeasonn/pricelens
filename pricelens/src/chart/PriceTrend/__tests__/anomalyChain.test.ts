// ============================================================
// 异常守卫可信链下游测试（2026-11-01）：
// - recentFourWeekChange：隔离周不进均值（同缺价周），窗口无可信价 → null；
// - suspectBadgeText / suspectTitleText：胶囊与 title 全业务语；
// - weekDetailModel：观察周被隔离 → 环比显「已隔离」不计（wow=null）、销毛屏蔽；
//   跨隔离周环比对上一可信点并带 wowSkip 小注数据。
// ============================================================
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { recentFourWeekChange } from '../tableModel';
import { suspectBadgeText, suspectTitleText } from '../chartModel';
import { weekDetailModel } from '../../../pages/volume/weekDetail';

const pt = (price: number | null, suspect?: 'quarantined' | 'pending' | 'exempted') => ({ price, suspect });

describe('recentFourWeekChange · 隔离周不进均值', () => {
  it('近 4 周窗口含隔离周：隔离周被忽略，均价按可信周算', () => {
    // 近4周 = [100, 100(隔离), 100, 100] → 均价 100；此前4周 = 200 → −50%
    const points = [pt(200), pt(200), pt(200), pt(200), pt(100), pt(100, 'quarantined'), pt(100), pt(100)];
    expect(recentFourWeekChange(points)).toBeCloseTo(-0.5, 6);
  });

  it('任一窗口无可信价 → null（原值可见但派生计算退出）', () => {
    const points = [pt(200), pt(200), pt(200), pt(200), pt(100, 'quarantined'), pt(100, 'quarantined'), pt(100, 'quarantined'), pt(100, 'quarantined')];
    expect(recentFourWeekChange(points)).toBeNull();
  });

  it('待核对（pending）与已确认（exempted）周照常参与计算', () => {
    const points = [pt(200), pt(200), pt(200), pt(200), pt(100, 'pending'), pt(100, 'exempted'), pt(100), pt(100)];
    expect(recentFourWeekChange(points)).toBeCloseTo(-0.5, 6);
  });
});

describe('suspectBadgeText / suspectTitleText · 业务语文案', () => {
  it('隔离 = 疑 ±X%；人工隔离 = 已隔离；待核对/待确认带幅度；已确认', () => {
    expect(suspectBadgeText({ state: 'quarantined', reason: 'transient', wow: -0.61 })).toBe('疑 −61%');
    expect(suspectBadgeText({ state: 'quarantined', reason: 'manual', wow: 1.2 })).toBe('已隔离 +120%');
    expect(suspectBadgeText({ state: 'pending', reason: 'shift', wow: 0.6 })).toBe('待核对 +60%');
    expect(suspectBadgeText({ state: 'pending', reason: 'tail', wow: 0.83 })).toBe('待确认 +83%');
    expect(suspectBadgeText({ state: 'exempted', reason: 'manual', wow: null })).toBe('已确认');
  });

  it('title 说明规则与去向（不吞点、计算口径）', () => {
    expect(suspectTitleText({ state: 'quarantined', reason: 'transient', wow: -0.61 }, 50)).toContain('已隔离，保留原值但不参与计算');
    expect(suspectTitleText({ state: 'pending', reason: 'tail', wow: 0.83 }, 50)).toContain('最新观测点');
    expect(suspectTitleText({ state: 'exempted', reason: 'manual', wow: null }, 50)).toContain('真实价格');
  });
});

describe('weekDetailModel · 观察周隔离态', () => {
  const base = {
    granularity: 'week' as const,
    bucketId: '202639',
    xLabel: '09-23',
    price: 547,
    rrp: 999,
    prevPrice: 300,
    volume: 1200,
    marginPoint: null,
    marginUnavailable: false,
    formatMoney: (v: number) => `$${Math.round(v)}`,
    formatVolume: (v: number) => String(v),
  };

  it('被隔离周：原值保留 + 环比不计（wow=null）+ 销毛屏蔽 + 裁定小标', () => {
    const m = weekDetailModel({ ...base, priceSuspect: 'quarantined' });
    expect(m.price).toBe('$547');
    expect(m.wow).toBeNull();
    expect(m.priceSuspect).toBe('quarantined');
    expect(m.marginMasked).toBe(true);
  });

  it('跨隔离周环比：对上一可信点，wowSkip 记被跨桶号（小注数据）', () => {
    const m = weekDetailModel({ ...base, prevPrice: 340, wowSkip: 1, wowSkipBuckets: ['202638'] });
    expect(m.wow).not.toBeNull();
    expect(m.wow?.text).toBe('+60.9%'); // 547/340 − 1 = 60.9%
    expect(m.wowSkip).toBe(1);
    expect(m.wowSkipBuckets).toEqual(['202638']);
    expect(m.marginMasked).toBe(false);
  });
});
