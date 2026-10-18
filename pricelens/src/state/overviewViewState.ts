export type CompExpansionOverrides = Readonly<Record<string, boolean>>;

export interface CompExpansionStatus {
  expandedCount: number;
  allExpanded: boolean;
  allCollapsed: boolean;
  isExpanded(id: string): boolean;
}

export function resolveCompExpansion(
  visibleIds: readonly string[],
  overrides: CompExpansionOverrides,
): CompExpansionStatus {
  const isExpanded = (id: string) => overrides[id] ?? visibleIds.length === 1;
  const expandedCount = visibleIds.filter(isExpanded).length;
  return {
    expandedCount,
    allExpanded: visibleIds.length > 0 && expandedCount === visibleIds.length,
    allCollapsed: visibleIds.length > 0 && expandedCount === 0,
    isExpanded,
  };
}

export function withAllCompExpansion(
  visibleIds: readonly string[],
  expanded: boolean,
  overrides: CompExpansionOverrides,
): Record<string, boolean> {
  const next = { ...overrides };
  for (const id of visibleIds) next[id] = expanded;
  return next;
}
