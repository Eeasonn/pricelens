import type { OverviewCompRow, OverviewModel } from '../../dataModel/aggregate';
import { fullModelName } from '../../components/BrandMark';

/** ROM labels are display data, so comparison must ignore incidental whitespace. */
export const normRom = (value: string): string => value.replace(/\s+/g, '');

/** Stable product label used by every overview surface. */
export function canonicalProductName(model: Pick<OverviewModel, 'brand' | 'modelName'>): string {
  return fullModelName(model.brand, model.modelName);
}

/** Latest weekly snapshot represented by a model's visible rows. */
export function latestAsOfWeek(model: OverviewModel): string | null {
  let latest: string | null = null;
  for (const row of model.rows) {
    if (latest == null || row.asOfWeek > latest) latest = row.asOfWeek;
  }
  return latest;
}

export function formatAsOfWeek(weekId: string | null): string {
  return weekId == null || weekId === '' ? '—' : `${weekId.slice(0, 4)}-W${weekId.slice(4)}`;
}

/**
 * Competitors visible for a model's current ROM rows.
 *
 * The overview has two consumers of benchmark rows (MarketMap and the detail
 * matrix). Keeping this selector here prevents the two views from drifting
 * when a product/ROM filter is active.
 */
export function visibleCompetitors(model: OverviewModel): OverviewCompRow[] {
  const visibleRoms = new Set(model.rows.map((row) => normRom(row.romram)));
  return model.comps.filter((comp) => comp.ownRomrams.some((romram) => visibleRoms.has(normRom(romram))));
}

/** Canonical primary/secondary competitor grouping shared by both overview views. */
export function groupedVisibleCompetitors(model: OverviewModel): OverviewCompRow[][] {
  const groups = new Map<string, OverviewCompRow[]>();
  for (const comp of visibleCompetitors(model)) {
    const modelId = comp.skuId.split('__')[0];
    const rows = groups.get(modelId);
    if (rows) rows.push(comp);
    else groups.set(modelId, [comp]);
  }
  return [...groups.values()]
    .map((rows) => [...rows].sort((a, b) => Number(b.primary) - Number(a.primary) || (b.price ?? -1) - (a.price ?? -1)))
    .sort((a, b) => Number(b[0]?.primary) - Number(a[0]?.primary) || (b[0]?.price ?? -1) - (a[0]?.price ?? -1) || canonicalProductName(a[0]).localeCompare(canonicalProductName(b[0])));
}

/**
 * Apply a ROM selection to an overview model and carry the same selection into
 * its benchmark rows. A null selection means all ROMs, but still derives the
 * competitor set from the model rows so both overview consumers share one
 * source of truth.
 */
export function selectVisibleModel(model: OverviewModel, selectedRoms: ReadonlySet<string> | null): OverviewModel | null {
  const rows = selectedRoms == null
    ? model.rows
    : model.rows.filter((row) => selectedRoms.has(normRom(row.romram)));
  if (rows.length === 0) return null;

  const visibleRoms = new Set(rows.map((row) => normRom(row.romram)));
  const comps = model.comps.filter((comp) => comp.ownRomrams.some((romram) => visibleRoms.has(normRom(romram))));
  return { ...model, rows, comps };
}
