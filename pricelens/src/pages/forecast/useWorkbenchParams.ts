// ============================================================
// 量价预测 · 推演工作台 v3 会话草稿 hook（WP6 8.2 · 任务 5 会话隔离）：
// 基于现有 usePageViewState（sessionStorage，页签级，切页重挂读回），
// 键 = `forecast.workbench.${fixture.meta.modelVersion}`——v3 fixture 的
// modelVersion = workbench-demo-v3，旧 v2 数字键草稿
// （forecast.workbench.workbench-demo-v2：裸周号 manual / 单周事件）天然
// 不被读取；normalizeWorkbenchParams 再按 WeekId sanitize 范围、拒绝未知 /
// 倒置范围、归一 12 个月键，双保险不串版本。
// 读写均经 normalizeWorkbenchParams 校验：坏 JSON / 错型字段 / 失效参照
// 逐项回退基准，会话数据永不使页面崩溃。
// 「重置基准」只清当前模型版本的本地草稿，不清全局筛选与其他页面视图态。
// 另承载行业级事件预填池（唯一来源，范围锚定统一日历预测周）与新增事件
// ID 循环查重。
// ============================================================
import { useCallback, useMemo } from 'react';
import usePageViewState from '../../state/usePageViewState';
import { baseWorkbenchParams, normalizeWorkbenchParams, type WorkbenchParams } from './workbenchModel';
import { buildForecastCalendar } from './workbenchCalendar';
import type { MarketEventSeed, ProductEventSeed, WorkbenchFixture } from './workbenchFixture';

/** 会话草稿键：按模型版本隔离——v3 = forecast.workbench.workbench-demo-v3，旧 v2 数字键草稿不读。 */
export function workbenchParamsKey(fixture: WorkbenchFixture): string {
  return `forecast.workbench.${fixture.meta.modelVersion}`;
}

export interface UseWorkbenchParamsResult {
  /** 当前参数（读写都经 normalizeWorkbenchParams，永远可直接进 computeWorkbench）。 */
  params: WorkbenchParams;
  /** 与 useState 同签名的更新（函数式更新基于当前归一化值）。 */
  setParams: (update: WorkbenchParams | ((prev: WorkbenchParams) => WorkbenchParams)) => void;
  /** 重置基准：只清当前模型版本的本地草稿（不写真实数据）。 */
  resetParams: () => void;
}

export default function useWorkbenchParams(fixture: WorkbenchFixture): UseWorkbenchParamsResult {
  const key = workbenchParamsKey(fixture);
  const [draft, setDraft] = usePageViewState<WorkbenchParams>(key, () => baseWorkbenchParams(fixture));
  const params = useMemo(() => normalizeWorkbenchParams(fixture, draft), [fixture, draft]);
  const setParams = useCallback(
    (update: WorkbenchParams | ((prev: WorkbenchParams) => WorkbenchParams)) => {
      setDraft((prev) => {
        const current = normalizeWorkbenchParams(fixture, prev);
        const next = typeof update === 'function' ? update(current) : update;
        return normalizeWorkbenchParams(fixture, next);
      });
    },
    [fixture, setDraft],
  );
  const resetParams = useCallback(() => {
    setDraft(baseWorkbenchParams(fixture));
  }, [fixture, setDraft]);
  return { params, setParams, resetParams };
}

// ------------------------------------------------------------
// 行业级事件预填池（唯一来源；v3 范围事件锚定统一日历预测周）
// ------------------------------------------------------------

/** 新增行业事件的预填参数（人工录入假设：范围 / 幅度 / 衰减均可在卡上改）。 */
const INDUSTRY_EVENT_PRESETS: readonly { label: string; magnitudePct: number; durationWeeks: number; decay: MarketEventSeed['decay'] }[] = [
  { label: '三折叠上市', magnitudePct: -6, durationWeeks: 4, decay: 'decreasing' },
  { label: '地缘冲突扰动', magnitudePct: -6, durationWeeks: 4, decay: 'decreasing' },
  { label: '汇率跳变', magnitudePct: -6, durationWeeks: 4, decay: 'decreasing' },
  { label: '平台补贴退坡', magnitudePct: -6, durationWeeks: 4, decay: 'decreasing' },
];

/**
 * 行业事件预填（v3 范围口径）：范围从统一日历首个预测周起、按 preset 时长
 * 锚定真实预测周（越出预测段末周按末周收口，不造周）；起止周 WeekId 唯一。
 */
export function industryEventPreset(fixture: WorkbenchFixture, presetIndex: number): Omit<MarketEventSeed, 'id'> {
  const calendar = buildForecastCalendar(fixture.calendar);
  const first = calendar.forecastWeeks[0];
  const preset = INDUSTRY_EVENT_PRESETS[presetIndex % INDUSTRY_EVENT_PRESETS.length]!;
  if (!first) {
    throw new Error('useWorkbenchParams: 统一日历无预测周，无法锚定行业事件范围');
  }
  const endIndex = Math.min(first.index + preset.durationWeeks - 1, calendar.weeks.length - 1);
  const end = calendar.weeks[endIndex]!;
  return {
    label: preset.label,
    startWeekId: first.id,
    endWeekId: end.id,
    magnitudePct: preset.magnitudePct,
    decay: preset.decay,
  };
}

/** 新增行业事件：ID 循环查重（`ev-custom-N` 取第一个未使用值，删除任一事件不影响后续新增），
 *  预填参数按已添加的自定义事件数对池长轮换。 */
export function nextMarketEventSeed(existing: ReadonlyArray<MarketEventSeed>, fixture: WorkbenchFixture): MarketEventSeed {
  const used = new Set(existing.map((event) => event.id));
  let serial = 1;
  while (used.has(`ev-custom-${serial}`)) serial += 1;
  const customCount = existing.filter((event) => event.id.startsWith('ev-custom')).length;
  return { id: `ev-custom-${serial}`, ...industryEventPreset(fixture, customCount) };
}

/** 新增产品小事件：ID 循环查重（`pe-N-<startWeekId>` 取第一个未使用值）。 */
export function nextProductEventId(existing: ReadonlyArray<ProductEventSeed>, startWeekId: string): string {
  const used = new Set(existing.map((event) => event.id));
  let serial = 1;
  while (used.has(`pe-${serial}-${startWeekId}`)) serial += 1;
  return `pe-${serial}-${startWeekId}`;
}
