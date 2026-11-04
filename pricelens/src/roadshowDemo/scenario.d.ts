export interface ForecastScenario {
  productId: string;
  currentWeek: string;
  baseDemand: number;
  basePrice: number;
  priceAssumption: number;
  elasticity: number;
  marketFactor: number;
  competitionFactor: number;
  tierCompositionFactor: number;
  lifecycleFactor: number;
  inventoryAvailable: readonly number[];
  fulfillmentRate: number;
}

export interface ForecastWeek {
  week: string;
  priceAssumption: number;
  unconstrainedDemand: number;
  soForecastLow: number;
  soForecastBase: number;
  soForecastHigh: number;
  inventoryAvailableForecast: number;
  fulfillmentRate: number;
  assumptions: string[];
}

export interface ActualWeek {
  week: string;
  price: number;
  so: number;
}

export declare const DEFAULT_SCENARIO: ForecastScenario;
export declare function availableSupply(input: { beginningInventory: number; inbound: number; locked: number }): number;
export declare function forecastScenario(scenario: ForecastScenario): ForecastWeek[];
export declare function buildContinuousSeries(actual: readonly ActualWeek[], forecast: ForecastWeek[]): Array<ActualWeek & { kind: 'actual' } | {
  week: string;
  price: number;
  so: number;
  kind: 'forecast';
  low: number;
  high: number;
  unconstrainedDemand: number;
  inventoryAvailableForecast: number;
  fulfillmentRate: number;
}>;
