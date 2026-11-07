// 换国同步回归（2026-11-06）：Agent「价格优势」/ 自动匹配竞品必须按 FiltersState.countryCode
// 取竞品矩阵，不能沿用 currentScope 里尚未同步的旧国（探针：AE vs RU 的 Pura 90s Pro 12+256 GB）。
import { afterEach, describe, expect, it } from 'vitest';
import { dimProduct } from '../../data';
import { defaultFilters } from '../../state/FiltersContext';
import { groupsFromBenchmark } from '../../state/configStore';
import { getCurrentCountry, setCurrentCountry } from '../../state/currentScope';
import { buildCards, withAutoOn } from '../../state/mainSelection';
import { buildPriceAdvantageResult } from '../priceAdvantage';

const MODEL = 'own-huawei-pura-90s-pro';
const ROM = '12+256 GB';
const previous = getCurrentCountry();
afterEach(() => setCurrentCountry(previous));

const ownRu = dimProduct.find((r) => r.model_id === MODEL && r.romram === ROM && r.countries.includes('RU'));
const sel = { modelId: MODEL, romram: ROM, skuIds: [ownRu?.sku_id ?? ''] };
const modelsOf = (list: { modelId: string }[]): string[] => [...new Set(list.map((s) => s.modelId))].sort();

describe('Agent 换国同步：竞品矩阵跟随目标国', () => {
  it('前置：AE 与 RU 的竞品矩阵确实不同', () => {
    expect(ownRu).toBeDefined();
    expect(modelsOf(groupsFromBenchmark([sel], 'RU'))).not.toEqual(modelsOf(groupsFromBenchmark([sel], 'AE')));
  });

  it('currentScope 仍为 AE 时，buildCards / withAutoOn 显式传 RU → 对比区 = RU 矩阵', () => {
    setCurrentCountry('AE');
    const ru = modelsOf(groupsFromBenchmark([sel], 'RU'));
    const [card] = buildCards([sel], { auto: true, countryCode: 'RU' });
    expect(modelsOf(card.compares)).toEqual(ru);
    const manual = { ...card, compares: [], auto: false };
    expect(modelsOf(withAutoOn(manual, 'RU').compares)).toEqual(ru);
  });

  it('currentScope 仍为 AE 时，价格优势按 state.countryCode=RU 取竞品', () => {
    setCurrentCountry('AE');
    const ru = new Set(modelsOf(groupsFromBenchmark([sel], 'RU')));
    const aeOnly = modelsOf(groupsFromBenchmark([sel], 'AE')).filter((m) => !ru.has(m));
    const state = { ...defaultFilters, countryCode: 'RU', industry: 'phone' as const, mains: [{ id: 'probe', main: sel, compares: [], auto: false }] };
    const { card } = buildPriceAdvantageResult(state, 'probe');
    expect(card.rows.length).toBeGreaterThan(0);
    const used = modelsOf(card.rows.map((r) => r.compareSelection));
    for (const m of used) expect(ru.has(m)).toBe(true);
    for (const m of aeOnly) expect(used).not.toContain(m);
    expect(card.rows.every((r) => r.countryCode === 'RU')).toBe(true);
  });
});
