import type { OverviewCompRow, OverviewTierBand } from './aggregate';
import type { AlertItem } from './alerts';

export interface OverviewSummary {
  ownModels: number;
  ownRoms: number;
  mappedRoms: number;
  mappingPct: number;
  deepDiscountRoms: number;
  latestAlertWeek: string | null;
  latestAlertCount: number;
  alertTitle: string;
}

export function buildOverviewSummary(
  bands: readonly OverviewTierBand[],
  alerts: readonly AlertItem[],
): OverviewSummary {
  const ownModels = bands.flatMap((band) => band.models).filter((model) => model.isOwn);
  const ownRows = ownModels.flatMap((model) => model.rows.map((row) => ({ model, row })));
  const ownRoms = ownRows.length;
  const mappedRoms = ownRows.filter(({ model, row }) =>
    model.comps.some((comp) => comp.ownRomrams.includes(row.romram)),
  ).length;
  const deepDiscountRoms = ownRows.filter(
    ({ row }) => row.discountPct != null && row.discountPct <= -0.15,
  ).length;

  let latestAlertWeek: string | null = null;
  let latestAlertCount = 0;
  for (const alert of alerts) {
    if (latestAlertWeek === null || alert.weekId > latestAlertWeek) {
      latestAlertWeek = alert.weekId;
      latestAlertCount = 1;
    } else if (alert.weekId === latestAlertWeek) {
      latestAlertCount += 1;
    }
  }

  return {
    ownModels: ownModels.length,
    ownRoms,
    mappedRoms,
    mappingPct: ownRoms === 0 ? 0 : mappedRoms / ownRoms,
    deepDiscountRoms,
    latestAlertWeek,
    latestAlertCount,
    alertTitle: '最新预警（已订阅产品）',
  };
}

export type DiffDir = 'comp' | 'own';
export type CompetitorPrice = Pick<OverviewCompRow, 'price'>;

export interface CompetitorSummary {
  count: number;
  minPrice: number | null;
  maxPrice: number | null;
  minDiff: number | null;
  maxDiff: number | null;
}

export function summarizeCompetitors(
  ownPrice: number | null,
  comps: readonly CompetitorPrice[],
  diffDir: DiffDir,
): CompetitorSummary {
  const prices = comps.map((comp) => comp.price).filter((price): price is number => price != null);
  const diffs = ownPrice === null
    ? []
    : prices.map((price) => diffDir === 'comp'
      ? (price - ownPrice) / ownPrice
      : (ownPrice - price) / price);

  return {
    count: comps.length,
    minPrice: prices.length === 0 ? null : Math.min(...prices),
    maxPrice: prices.length === 0 ? null : Math.max(...prices),
    minDiff: diffs.length === 0 ? null : Math.min(...diffs),
    maxDiff: diffs.length === 0 ? null : Math.max(...diffs),
  };
}
