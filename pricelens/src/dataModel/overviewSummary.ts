import type { OverviewCompRow, OverviewTierBand } from './aggregate';
import type { AlertItem } from './alerts';

/** 与 aggregate 同规则的配置名归一（去空白）——对标 own_romram 与产品 romram
 *  空格变体（"12+256 GB" vs "12+256GB"）不应静默漏配 */
const normRom = (s: string): string => s.replace(/\s+/g, '');

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
    model.comps.some((comp) => comp.ownRomrams.some((r) => normRom(r) === normRom(row.romram))),
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
  // 0 价行（爬虫脏数据）不参与价差，避免 ±Infinity 拉飞区间（与 alerts/platformCompare 的 >0 守卫对齐）
  const diffs = ownPrice == null || ownPrice <= 0
    ? []
    : prices
      .map((price) => (price > 0
        ? diffDir === 'comp'
          ? (price - ownPrice) / ownPrice
          : (ownPrice - price) / price
        : null))
      .filter((d): d is number => d != null);

  return {
    count: comps.length,
    minPrice: prices.length === 0 ? null : Math.min(...prices),
    maxPrice: prices.length === 0 ? null : Math.max(...prices),
    minDiff: diffs.length === 0 ? null : Math.min(...diffs),
    maxDiff: diffs.length === 0 ? null : Math.max(...diffs),
  };
}
