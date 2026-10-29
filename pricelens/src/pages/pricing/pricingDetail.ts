import { INCENTIVE_RATE, UNCERTAINTY_BAND, type ProductCase } from './mockData';
import {
  buildWeekly,
  compFactorOf,
  costAtWeekWithNodes,
  marketFactorAtWeek,
  priceFactorOf,
  type PlanContext,
} from './pricingModel';

/**
 * One row in the weekly what-if ledger. Values keep the model's native units:
 * SO is in 万台, prices/cost/margin are USD per unit, and percentages are
 * percentage points. The row deliberately carries both the current-series
 * value and the previous-generation same-week reference so the relationship
 * can be inspected without reverse engineering the chart.
 */
export interface PricingDetailRow {
  week: number;
  month: string;
  quarter: string;
  phase: 'actual' | 'forecast';
  price: number;
  previousPrice: number;
  soWan: number;
  previousSoWan: number;
  vsPreviousPct: number;
  p10Wan: number | null;
  p90Wan: number | null;
  cumulativeSoWan: number;
  marketFactor: number;
  priceFactor: number;
  competitorFactor: number;
  cost: number;
  unitMargin: number;
  event: string | null;
}

const round1 = (value: number): number => Math.round(value * 10) / 10;
const round2 = (value: number): number => Math.round(value * 100) / 100;
const priceAtWeek = (basePrice: number, week: number, weeklyPrices?: number[]): number => weeklyPrices?.[week] ?? basePrice;

/**
 * Build the same 52-week sequence consumed by the forecast chart and expose
 * its calculation chain as a tabular ledger. In the post-launch scenario,
 * actual weeks use the observed current-product ASP/SO; only future weeks
 * respond to weekly simulated prices.
 */
export function pricingDetailRows(ctx: PlanContext, product: ProductCase, basePrice: number): PricingDetailRow[] {
  const { weekly, actualCount } = buildWeekly(ctx, product, basePrice);
  const competitorFactor = compFactorOf(ctx.comp);
  const anchorPrice = ctx.scenario === 'pre' ? product.prev.launchPrice : product.cur.currentPrice;
  const events = ctx.scenario === 'pre' ? product.prev.events : product.cur.events;
  let cumulativeSoWan = 0;

  return weekly.map((soThousand, week) => {
    const isActual = week < actualCount;
    const previous = product.prev.weeks[week];
    const observed = product.cur.weeks[week];
    const price = ctx.scenario === 'post' && isActual
      ? observed.asp
      : priceAtWeek(basePrice, week, ctx.weeklyPrices);
    const soWan = round2(soThousand / 10);
    const previousSoWan = round2(previous.so / 10);
    const vsPreviousPct = previousSoWan === 0 ? 0 : round1((soWan / previousSoWan - 1) * 100);
    cumulativeSoWan = round1(cumulativeSoWan + soWan);
    const event = events.find((entry) => entry.week === week);
    const monthIndex = Math.floor(week / (52 / 12)) + 1;
    const quarterIndex = Math.floor(week / 13) + 1;

    return {
      week,
      month: `M${monthIndex}`,
      quarter: `Q${quarterIndex}`,
      phase: isActual ? 'actual' : 'forecast',
      price: round2(price),
      previousPrice: round2(previous.asp),
      soWan,
      previousSoWan,
      vsPreviousPct,
      p10Wan: isActual ? null : round1(soWan * (1 - UNCERTAINTY_BAND)),
      p90Wan: isActual ? null : round1(soWan * (1 + UNCERTAINTY_BAND)),
      cumulativeSoWan,
      marketFactor: round2(marketFactorAtWeek(ctx, week, ctx.scenario === 'post' ? product.cur.weeks.length : 0)),
      priceFactor: round2(priceFactorOf(price, ctx.elasticity, anchorPrice)),
      competitorFactor: round2(competitorFactor),
      cost: round2(costAtWeekWithNodes(week, ctx.costYoyPct, ctx.costMonthValues)),
      unitMargin: round2((price * (1 - INCENTIVE_RATE)) - costAtWeekWithNodes(week, ctx.costYoyPct, ctx.costMonthValues)),
      event: event ? `${event.anchor} W${event.week} ${event.changePct}% · ${event.context}` : null,
    };
  });
}

