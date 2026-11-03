// ============================================================
// 量价预测 · 推演工作台 v2 会话草稿 hook（WP6 8.2）：
// 基于现有 usePageViewState（sessionStorage，页签级，切页重挂读回），
// 键 = `forecast.workbench.${fixture.meta.modelVersion}`——切到价格/量价/
// 大盘再返回，季度覆盖、事件、SI、手调原因与理由全部保留；关闭页签自然失效。
// 读写均经 WP1 的 normalizeWorkbenchParams 校验：坏 JSON / 错型字段 / 失效
// 参照逐项回退基准，会话数据永不使页面崩溃。
// 「重置基准」只清当前模型版本的本地草稿，不清全局筛选与其他页面视图态。
// 另承载行业级事件预填池（唯一来源）与新增事件 ID 循环查重（8.3 Step 6）。
// ============================================================
import { useCallback, useMemo } from 'react';
import usePageViewState from '../../state/usePageViewState';
import { baseWorkbenchParams, normalizeWorkbenchParams, type WorkbenchParams } from './workbenchModel';
import type { MarketEventSeed, ProductEventSeed, WorkbenchFixture } from './workbenchFixture';

/** 会话草稿键：按模型版本隔离——换版后旧草稿自然失效，不串版本。 */
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
// 行业级事件预填池（唯一来源，8.3 Step 6：删除其他重复常量）
// ------------------------------------------------------------

/** 新增行业事件的预填参数池（人工录入假设：起周/时长/幅度/衰减均可在卡上改）。 */
export const INDUSTRY_EVENT_PRESETS: readonly Omit<MarketEventSeed, 'id'>[] = [
  { label: '三折叠上市', startWeek: 46, durationWeeks: 4, magnitudePct: -6, decay: 'decreasing' },
  { label: '地缘冲突扰动', startWeek: 46, durationWeeks: 4, magnitudePct: -6, decay: 'decreasing' },
  { label: '汇率跳变', startWeek: 46, durationWeeks: 4, magnitudePct: -6, decay: 'decreasing' },
  { label: '平台补贴退坡', startWeek: 46, durationWeeks: 4, magnitudePct: -6, decay: 'decreasing' },
];

/** 新增行业事件：ID 循环查重（`ev-custom-N` 取第一个未使用值，删除任一事件不影响后续新增），
 *  预填参数按已添加的自定义事件数对池长轮换。 */
export function nextMarketEventSeed(existing: ReadonlyArray<MarketEventSeed>): MarketEventSeed {
  const used = new Set(existing.map((event) => event.id));
  let serial = 1;
  while (used.has(`ev-custom-${serial}`)) serial += 1;
  const customCount = existing.filter((event) => event.id.startsWith('ev-custom')).length;
  const preset = INDUSTRY_EVENT_PRESETS[customCount % INDUSTRY_EVENT_PRESETS.length];
  return { id: `ev-custom-${serial}`, ...preset };
}

/** 新增产品小事件：ID 循环查重（`pe-N-<week>` 取第一个未使用值）。 */
export function nextProductEventId(existing: ReadonlyArray<ProductEventSeed>, week: number): string {
  const used = new Set(existing.map((event) => event.id));
  let serial = 1;
  while (used.has(`pe-${serial}-${week}`)) serial += 1;
  return `pe-${serial}-${week}`;
}
