export const DEFAULT_SCENARIO = Object.freeze({
  productId: 'pura-90s-pro',
  currentWeek: '202642',
  baseDemand: 4600,
  basePrice: 499,
  priceAssumption: 499,
  elasticity: -1.85,
  marketFactor: 1,
  competitionFactor: 1,
  tierCompositionFactor: 1,
  lifecycleFactor: 1,
  inventoryAvailable: Object.freeze(Array(8).fill(4000)),
  fulfillmentRate: 0.9,
});

export function availableSupply({ beginningInventory, inbound, locked }) {
  return Math.max(0, beginningInventory + inbound - locked);
}

function nextWeek(week, offset) {
  const year = Number(week.slice(0, 4));
  const weekNumber = Number(week.slice(4)) + offset;
  return `${year}${String(weekNumber).padStart(2, '0')}`;
}

export function forecastScenario(scenario) {
  const baseRatio = scenario.priceAssumption / scenario.basePrice;
  return Array.from({ length: 8 }, (_, index) => {
    const lifecycleDecay = 1 + index * 0.025;
    const unconstrainedDemand = Math.round(
      scenario.baseDemand
      * baseRatio ** scenario.elasticity
      * scenario.marketFactor
      * scenario.competitionFactor
      * scenario.tierCompositionFactor
      * scenario.lifecycleFactor
      * lifecycleDecay,
    );
    const available = scenario.inventoryAvailable[index] ?? scenario.inventoryAvailable[scenario.inventoryAvailable.length - 1] ?? 0;
    const realizable = available * scenario.fulfillmentRate;
    return {
      week: nextWeek(scenario.currentWeek, index + 1),
      priceAssumption: scenario.priceAssumption,
      unconstrainedDemand,
      soForecastLow: Math.round(Math.min(unconstrainedDemand * 0.88, realizable)),
      soForecastBase: Math.round(Math.min(unconstrainedDemand, realizable)),
      soForecastHigh: Math.round(Math.min(unconstrainedDemand * 1.12, realizable)),
      inventoryAvailableForecast: available,
      fulfillmentRate: scenario.fulfillmentRate,
      assumptions: [
        `价格 ${scenario.priceAssumption}`,
        `弹性 ${scenario.elasticity}`,
        `终端大盘 ${scenario.marketFactor}`,
        `竞品格局 ${scenario.competitionFactor}`,
        `档位构成 ${scenario.tierCompositionFactor}`,
        `可售库存 ${available}`,
        `履约率 ${scenario.fulfillmentRate}`,
      ],
    };
  });
}

export function buildContinuousSeries(actual, forecast) {
  return [
    ...actual.map((row) => ({ week: row.week, price: row.price, so: row.so, kind: 'actual' })),
    ...forecast.map((row) => ({
      week: row.week,
      price: row.priceAssumption,
      so: row.soForecastBase,
      kind: 'forecast',
      low: row.soForecastLow,
      high: row.soForecastHigh,
      unconstrainedDemand: row.unconstrainedDemand,
      inventoryAvailableForecast: row.inventoryAvailableForecast,
      fulfillmentRate: row.fulfillmentRate,
    })),
  ];
}
