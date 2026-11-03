// ============================================================
// 顶部筛选在当前页是否停用（2026-11-03 大盘走势 × 顶部筛选，方案 A）：
// 大盘走势展示固定样例国家的月度大盘（销量万台、均价美元），国家、币种、时间
// 三项筛选对它不生效——该页置灰这三项；产业仍可用（驱动大盘产业）。
// 只读当前页（PageContext 不改）：停用条件随页面派生、不落任何状态，切回其他
// 页即恢复，无残留。
// 调用方：FilterBar（币种、时间簇）与 CountryBox（由 PageHeader 挂载，不经
// FilterBar，自行读同一判定）。
// ============================================================
import { usePage } from '../../state/PageContext';

export function useScopeFiltersDisabled(): boolean {
  return usePage().page === 'marketboard';
}
