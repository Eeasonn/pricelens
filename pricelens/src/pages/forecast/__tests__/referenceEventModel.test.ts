// ============================================================
// referenceEventModel 纯函数单测（node）：
// 预标迁移（week → 闭区间、note 空、decay 未标；不得把 impactWeeks 变 endWeek）、
// 预标指纹与源更新、统一有效事件合并（覆写 / 软删除补录 / 排序 / fixture 不被
// 修改）、窗口钳制（最小 8 周 / 短序列全长）、事件定位窗、事件时段读数确定性
// 公式（期均周销 / 紧邻等长前段 / 变化率 / 价格首末有效点带实际周 / 覆盖率 /
// 无法计算不补 0）、工作区 sanitize + 迁移（坏记录隔离 / 备份）、撤销 patch
// 重放（撤销 A 不清 B / 20 条上限）、颜色对比度提示、草稿校验。
// ============================================================
import { describe, expect, it } from 'vitest';
import type { LifecycleEventSeed, LifecycleProductSeed } from '../workbenchFixture';
import {
  REFERENCE_EVENT_HISTORY_LIMIT,
  clampReferenceWindow,
  computeEventRangeReading,
  contrastHintOf,
  durationOfEvent,
  eventFocusWindow,
  eventRangeLabel,
  fullWindowOf,
  mergeEffectiveEvents,
  migratePresetEvent,
  migrateReferenceWorkspace,
  newComposedEventId,
  overrideKeyOf,
  presetFingerprint,
  pushReferenceHistory,
  rangeOfEvent,
  undoLastReferenceAction,
  validateReferenceDraftValue,
  type ComposedReferenceEvent,
  type EffectiveReferenceEvent,
} from '../referenceEventModel';

const productOf = (points: Array<number | null>, pricePoints: Array<number | null>): LifecycleProductSeed => ({
  id: 'lc-test',
  label: 'Test（上一代）',
  brand: 'HUAWEI',
  launchWeekLabel: '2025-W02',
  points,
  pricePoints,
  promoBands: [],
  events: [],
});

const seed = (overrides: Partial<LifecycleEventSeed> & { id: string; week: number }): LifecycleEventSeed => ({
  type: 'promo',
  label: '测试事件',
  ...overrides,
});

describe('migratePresetEvent（旧预标 → 统一字段）', () => {
  const product = productOf(new Array(52).fill(1000), new Array(52).fill(899));

  it('week → [week, week] 闭区间；note 初始空；impact 转入 impact 且 decay = 未标', () => {
    const event = migratePresetEvent(product, seed({ id: 'ev-1', week: 22, type: 'promo', label: '618 档期脉冲', impactPct: 42, impactWeeks: 4 }));
    expect(event.id).toBe('ev-1');
    expect(event.productId).toBe('lc-test');
    expect(event.source).toBe('fixture');
    expect(event.sourceEventId).toBe('ev-1');
    expect(event.startWeek).toBe(22);
    expect(event.endWeek).toBe(22);
    expect(event.note).toBe('');
    expect(event.impact).toEqual({ magnitudePct: 42, durationWeeks: 4, decay: 'unspecified' });
    expect(event.overridden).toBe(false);
    expect(event.revision).toBe(0);
    expect(event.createdAt).toBeNull();
  });

  it('不得把 impactWeeks 自动变成 endWeek（旧字段描述对同类主品的参考影响）', () => {
    const event = migratePresetEvent(product, seed({ id: 'ev-2', week: 18, impactPct: -6, impactWeeks: 4 }));
    expect(event.endWeek).toBe(18);
    expect(event.impact?.durationWeeks).toBe(4);
  });

  it('无影响字段的预标 impact = null', () => {
    const event = migratePresetEvent(product, seed({ id: 'ev-3', week: 5 }));
    expect(event.impact).toBeNull();
  });
});

describe('mergeEffectiveEvents（统一有效事件）', () => {
  const points = Array.from({ length: 52 }, (_, i) => 1000 + i * 10);
  const prices = Array.from({ length: 52 }, (_, i) => 899 - (i >= 20 ? 50 : 0));
  const product = productOf(points, prices);
  (product as { events: LifecycleEventSeed[] }).events = [
    seed({ id: 'ev-a', week: 22, type: 'promo', label: '618 档期脉冲', impactPct: 42, impactWeeks: 4 }),
    seed({ id: 'ev-b', week: 34, type: 'cannibalization', label: '挤兑' }),
  ];

  const composedOf = (overrides: Partial<ComposedReferenceEvent> = {}): ComposedReferenceEvent => ({
    id: 'ce-1',
    productId: 'lc-test',
    typeId: 'competitor-launch',
    startWeek: 10,
    endWeek: 12,
    label: '店庆补贴',
    note: '渠道补贴压价',
    impact: null,
    revision: 1,
    createdAt: '2026-11-04T00:00:02.000Z',
    updatedAt: '2026-11-04T00:00:02.000Z',
    deletedAt: null,
    ...overrides,
  });

  it('无覆写 / 无补录时 = 迁移后的预标（revision 0）', () => {
    const events = mergeEffectiveEvents(product, {}, {});
    expect(events.map((ev) => ev.id)).toEqual(['ev-a', 'ev-b']);
    expect(events[0]?.overridden).toBe(false);
    expect(events[0]?.revision).toBe(0);
  });

  it('覆写生效：patch 合入、overridden / revision / updatedAt 生效；fixture 原对象不被修改', () => {
    const fingerprint = presetFingerprint((product.events as LifecycleEventSeed[])[0]);
    const events = mergeEffectiveEvents(product, {}, {
      [overrideKeyOf('lc-test', 'ev-a')]: {
        id: overrideKeyOf('lc-test', 'ev-a'),
        scopeKey: 's',
        productId: 'lc-test',
        sourceEventId: 'ev-a',
        baseFingerprint: fingerprint,
        patch: { startWeek: 22, endWeek: 25, label: '618 档期脉冲（改）', typeId: 'promo' },
        revision: 1,
        createdAt: '2026-11-04T00:00:01.000Z',
        updatedAt: '2026-11-04T00:00:01.000Z',
      },
    });
    const a = events.find((ev) => ev.id === 'ev-a') as EffectiveReferenceEvent;
    expect(a.overridden).toBe(true);
    expect(a.endWeek).toBe(25);
    expect(a.label).toBe('618 档期脉冲（改）');
    expect(a.revision).toBe(1);
    expect(a.sourceChanged).toBe(false);
    // fixture 原始对象保持原值（覆写只改变有效视图）
    expect((product.events as LifecycleEventSeed[])[0]?.label).toBe('618 档期脉冲');
    expect((product.events as LifecycleEventSeed[])[0]?.week).toBe(22);
  });

  it('baseFingerprint 与当前预标不符 → sourceChanged（源已更新，不静默覆盖）', () => {
    const events = mergeEffectiveEvents(product, {}, {
      [overrideKeyOf('lc-test', 'ev-b')]: {
        id: overrideKeyOf('lc-test', 'ev-b'),
        scopeKey: 's',
        productId: 'lc-test',
        sourceEventId: 'ev-b',
        baseFingerprint: 'stale',
        patch: { label: '挤兑（改）' },
        revision: 2,
        createdAt: '2026-11-04T00:00:00.000Z',
        updatedAt: '2026-11-04T00:00:00.000Z',
      },
    });
    expect(events.find((ev) => ev.id === 'ev-b')?.sourceChanged).toBe(true);
  });

  it('补录合入统一列表并按起周排序；软删除补录不出现；产品不匹配的记录被忽略', () => {
    const events = mergeEffectiveEvents(product, {
      'ce-1': composedOf(),
      'ce-2': composedOf({ id: 'ce-2', startWeek: 2, endWeek: 2, label: '早补录', createdAt: '2026-11-04T00:00:03.000Z' }),
      'ce-3': composedOf({ id: 'ce-3', deletedAt: '2026-11-04T00:00:04.000Z', label: '已删' }),
      'ce-4': composedOf({ id: 'ce-4', productId: 'lc-other', label: '别家' }),
    }, {});
    expect(events.map((ev) => ev.id)).toEqual(['ce-2', 'ce-1', 'ev-a', 'ev-b']);
    expect(events.find((ev) => ev.id === 'ce-1')?.source).toBe('composed');
  });
});

describe('clampReferenceWindow / fullWindowOf / 事件定位窗', () => {
  const product = productOf(new Array(52).fill(1), new Array(52).fill(1));
  const short = productOf(new Array(5).fill(1), new Array(5).fill(1));

  it('钳入 [0, n-1] 且最短 8 周；反向输入排序', () => {
    expect(clampReferenceWindow(product, [10, 40])).toEqual([10, 40]);
    expect(clampReferenceWindow(product, [40, 10])).toEqual([10, 40]);
    expect(clampReferenceWindow(product, [45, 51])).toEqual([44, 51]);
    expect(clampReferenceWindow(product, [0, 3])).toEqual([0, 7]);
    expect(clampReferenceWindow(product, [49, 51])).toEqual([44, 51]);
  });

  it('短序列（< 8 周）显示全长', () => {
    expect(clampReferenceWindow(short, [1, 2])).toEqual([0, 4]);
    expect(fullWindowOf(short)).toEqual([0, 4]);
  });

  it('事件定位窗：16 周聚焦、事件居中、完整起止可见、钳边界', () => {
    expect(eventFocusWindow(product, { startWeek: 22, endWeek: 25 })).toEqual([16, 31]);
    expect(eventFocusWindow(product, { startWeek: 0, endWeek: 3 })).toEqual([0, 15]);
    expect(eventFocusWindow(product, { startWeek: 48, endWeek: 51 })).toEqual([36, 51]);
    // 超长事件：至少覆盖完整起止
    expect(eventFocusWindow(product, { startWeek: 10, endWeek: 40 })).toEqual([10, 40]);
  });

  it('rangeOfEvent / durationOfEvent / eventRangeLabel', () => {
    expect(rangeOfEvent({ startWeek: 22, endWeek: 25 })).toEqual([22, 25]);
    expect(durationOfEvent({ startWeek: 22, endWeek: 25 })).toBe(4);
    expect(durationOfEvent({ startWeek: 9, endWeek: 9 })).toBe(1);
    expect(eventRangeLabel({ startWeek: 22, endWeek: 25 })).toBe('W23–W26');
    expect(eventRangeLabel({ startWeek: 9, endWeek: 9 })).toBe('W10');
  });
});

describe('computeEventRangeReading（事件时段读数确定性公式）', () => {
  it('期均周销 / 紧邻等长前段 / 变化率按公式；价格首末有效点带实际周', () => {
    // 事件 W23–W26（22..25）销量 = [100, 200, 300, 400] → 均 250
    // 前段 W19–W22（18..21）销量 = [800, 100, 100, 100] → 均 275 → 变化率 = 250/275 − 1
    const points = new Array<number | null>(52).fill(100);
    points[18] = 800;
    points[22] = 200;
    points[23] = 300;
    points[24] = 400;
    const prices = new Array<number | null>(52).fill(899);
    prices[22] = 849;
    prices[23] = null; // 缺采
    prices[25] = 799;
    const reading = computeEventRangeReading(productOf(points, prices), { startWeek: 22, endWeek: 25 });
    expect(reading.n).toBe(4);
    expect(reading.salesValidWeeks).toEqual([22, 23, 24, 25]);
    expect(reading.salesAvg).toBeCloseTo(250, 5);
    expect(reading.prevRange).toEqual([18, 21]);
    expect(reading.prevAvg).toBeCloseTo(275, 5);
    expect(reading.salesChangePct).toBeCloseTo((250 / 275 - 1) * 100, 5);
    expect(reading.salesCoverage).toBe('4/4');
    expect(reading.priceFirst).toEqual({ week: 22, value: 849 });
    expect(reading.priceLast).toEqual({ week: 25, value: 799 });
    expect(reading.priceCoverage).toBe('3/4');
    expect(reading.priceChangePct).toBeCloseTo((799 / 849 - 1) * 100, 5);
    expect(reading.formulaNote).toContain('前段 W19–W22');
  });

  it('缺采保持缺失：销量 / 价格有效率按实际；全缺显示无法计算且不补 0', () => {
    const points = new Array<number | null>(52).fill(null);
    const prices = new Array<number | null>(52).fill(null);
    const reading = computeEventRangeReading(productOf(points, prices), { startWeek: 22, endWeek: 25 });
    expect(reading.salesAvg).toBeNull();
    expect(reading.salesChangePct).toBeNull();
    expect(reading.salesCoverage).toBe('0/4');
    expect(reading.priceFirst).toBeNull();
    expect(reading.priceLast).toBeNull();
    expect(reading.priceChangePct).toBeNull();
    expect(reading.salesCoverage.startsWith('0/')).toBe(true);
  });

  it('前段有效周不足 2 周 / 前段均值为 0 → 无法计算', () => {
    const points = new Array<number | null>(52).fill(100);
    points[18] = null;
    points[19] = null;
    points[20] = null;
    points[21] = null; // 前段 W19–W22 全缺
    const reading = computeEventRangeReading(productOf(points, new Array<number | null>(52).fill(899)), { startWeek: 22, endWeek: 25 });
    expect(reading.salesChangePct).toBeNull();
    expect(reading.salesChangeReason).toContain('有效周不足 2 周');

    const zeros = new Array<number | null>(52).fill(100);
    zeros[18] = 0;
    zeros[19] = 0;
    zeros[20] = 0;
    zeros[21] = 0;
    const reading2 = computeEventRangeReading(productOf(zeros, new Array<number | null>(52).fill(899)), { startWeek: 22, endWeek: 25 });
    expect(reading2.salesChangePct).toBeNull();
    expect(reading2.salesChangeReason).toContain('前段均值为 0');
  });

  it('事件在生命周期起点 → 无更早周段可比', () => {
    const points = new Array<number | null>(52).fill(100);
    const reading = computeEventRangeReading(productOf(points, new Array<number | null>(52).fill(899)), { startWeek: 0, endWeek: 3 });
    expect(reading.prevRange).toBeNull();
    expect(reading.salesChangePct).toBeNull();
    expect(reading.salesChangeReason).toContain('无更早周段');
  });

  it('价格首值为 0 → 只显示绝对差，不显示百分比', () => {
    const prices = new Array<number | null>(52).fill(899);
    prices[22] = 0;
    prices[25] = 500;
    const reading = computeEventRangeReading(productOf(new Array<number | null>(52).fill(100), prices), { startWeek: 22, endWeek: 25 });
    expect(reading.priceFirst).toEqual({ week: 22, value: 0 });
    expect(reading.priceLast).toEqual({ week: 25, value: 500 });
    expect(reading.priceChangePct).toBeNull();
    expect(reading.priceAbsDiff).toBe(500);
  });
});

describe('migrateReferenceWorkspace / sanitize（坏数据防御）', () => {
  it('非对象 / schemaVersion 不符 → 空工作区 + 原始值保留到 backup（不销毁）', () => {
    const r1 = migrateReferenceWorkspace('junk', 's1');
    expect(r1.workspace.composed).toEqual({});
    expect(r1.backup).toBe('junk');
    const r2 = migrateReferenceWorkspace({ schemaVersion: 2, composed: { x: { id: 'x' } } }, 's1');
    expect(r2.workspace.revision).toBe(0);
    expect(r2.backup).toEqual({ schemaVersion: 2, composed: { x: { id: 'x' } } });
  });

  it('坏记录逐条隔离：合法记录保留、坏记录计入 badCount 不拖垮整卡', () => {
    const raw = {
      schemaVersion: 1,
      revision: 7,
      composed: {
        good: { id: 'good', productId: 'p', typeId: 'promo', startWeek: 2, endWeek: 4, label: 'ok', note: 'n', impact: null, revision: 1, createdAt: 't', updatedAt: 't', deletedAt: null },
        badWeek: { id: 'badWeek', productId: 'p', typeId: 'promo', startWeek: 'x', endWeek: 4 },
        badType: 42,
      },
      overrides: { bad: { productId: null } },
      editorDrafts: {
        good: { id: 'p::new', mode: 'create', productId: 'p', eventId: null, value: { typeId: 'promo', startWeek: null, endWeek: null, label: '', note: '', impact: null }, baseRevision: null, updatedAt: 't' },
        bad: { id: 9 },
      },
      history: 'nope',
    };
    const r = migrateReferenceWorkspace(raw, 's1');
    expect(Object.keys(r.workspace.composed)).toEqual(['good']);
    // 草稿按其记录 id 收纳（应用内 id = `${productId}::${eventId ?? 'new'}`）
    expect(Object.keys(r.workspace.editorDrafts)).toEqual(['p::new']);
    expect(r.workspace.revision).toBe(7);
    expect(r.badCount).toBe(4);
    expect(r.backup).toBeNull();
  });

  it('止周 < 起周的覆写 patch 被钳回起周', () => {
    const r = migrateReferenceWorkspace({
      schemaVersion: 1,
      overrides: { k: { productId: 'p', sourceEventId: 'e', baseFingerprint: 'f', patch: { startWeek: 22, endWeek: 20 } } },
    }, 's1');
    const ovr = Object.values(r.workspace.overrides)[0];
    expect(ovr?.patch.startWeek).toBe(22);
    expect(ovr?.patch.endWeek).toBe(22);
  });
});

describe('撤销（before/after patch 重放）与历史上限', () => {
  const base = {
    id: 'ce-1',
    productId: 'p',
    typeId: 'promo',
    startWeek: 2,
    endWeek: 2,
    label: 'A',
    note: 'n',
    impact: null,
    revision: 1,
    createdAt: 't1',
    updatedAt: 't1',
    deletedAt: null,
  };
  const other = { ...base, id: 'ce-2', label: 'B', startWeek: 5 };

  const workspaceWith = (composed: Record<string, ComposedReferenceEvent>, history: Parameters<typeof pushReferenceHistory>[1][]) => {
    let ws = migrateReferenceWorkspace({ schemaVersion: 1, composed }, 's1').workspace;
    for (const entry of history) ws = pushReferenceHistory(ws, entry);
    return ws;
  };

  it('连续编辑 A、B 后撤销 A 的编辑步骤：A 回退、B 的记录不清掉', () => {
    const editedA = { ...base, label: 'A2' };
    const ws = workspaceWith({ 'ce-1': base, 'ce-2': other }, [
      { action: 'edit', targetId: 'ce-1', before: { composed: { 'ce-1': base } }, after: { composed: { 'ce-1': editedA } } },
      { action: 'create', targetId: 'ce-2', before: { composed: { 'ce-2': null } }, after: { composed: { 'ce-2': other } } },
    ]);
    const undone = undoLastReferenceAction(ws);
    // 撤销的是最后一步（create B）：B 消失，A 的编辑仍在 —— patch 重放不回滚整快照
    expect(undone.composed['ce-1']?.label).toBe('A2');
    expect(undone.composed['ce-2']).toBeUndefined();
    expect(undone.revision).toBe(ws.revision + 1);
    const undone2 = undoLastReferenceAction(undone);
    // 再撤销 edit A：A 回原值，B 的记录（base）不因撤销 A 而被误删逻辑波及
    expect(undone2.composed['ce-1']?.label).toBe('A');
    expect(undone2.history).toHaveLength(0);
  });

  it('history 上限 20：超出淘汰最旧', () => {
    let ws = migrateReferenceWorkspace({ schemaVersion: 1 }, 's1').workspace;
    for (let i = 0; i < REFERENCE_EVENT_HISTORY_LIMIT + 5; i++) {
      ws = pushReferenceHistory(ws, {
        action: 'edit',
        targetId: `t-${i}`,
        before: {},
        after: {},
      });
    }
    expect(ws.history).toHaveLength(REFERENCE_EVENT_HISTORY_LIMIT);
    expect(ws.history[0]?.targetId).toBe(`t-5`);
    expect(ws.history[ws.history.length - 1]?.targetId).toBe(`t-${REFERENCE_EVENT_HISTORY_LIMIT + 4}`);
  });
});

describe('颜色提示 / 草稿校验 / id 生成', () => {
  it('contrastHintOf：白底对比不足提醒；正常色返回 null；与量价系列色过近提醒', () => {
    expect(contrastHintOf('#f5f5f5')).toContain('对比不足');
    expect(contrastHintOf('#171717')).toBeNull();
    expect(contrastHintOf('#0070f3', '#0070f3')).toContain('过近');
    expect(contrastHintOf('#0070f3', '#c7000b')).toBeNull();
    expect(contrastHintOf('not-a-color')).toBeNull();
  });

  it('validateReferenceDraftValue：起止周 / 标题 / 说明必填与上限', () => {
    const ok = { typeId: 'promo', startWeek: 22, endWeek: 25, label: '标题', note: '说明', impact: null };
    expect(validateReferenceDraftValue(ok).ok).toBe(true);
    expect(validateReferenceDraftValue({ ...ok, startWeek: null }).ok).toBe(false);
    expect(validateReferenceDraftValue({ ...ok, label: '' }).labelMissing).toBe(true);
    expect(validateReferenceDraftValue({ ...ok, label: 'a'.repeat(41) }).labelTooLong).toBe(true);
    expect(validateReferenceDraftValue({ ...ok, note: ' ' }).noteMissing).toBe(true);
    expect(validateReferenceDraftValue({ ...ok, note: 'a'.repeat(201) }).noteTooLong).toBe(true);
  });

  it('newComposedEventId 生成唯一 id（ce- 前缀）', () => {
    const a = newComposedEventId();
    const b = newComposedEventId();
    expect(a).toMatch(/^ce-/);
    expect(b).toMatch(/^ce-/);
    expect(a).not.toBe(b);
  });
});
