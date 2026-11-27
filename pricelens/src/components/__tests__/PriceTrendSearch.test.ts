import { describe, expect, it } from 'vitest';
import { cardOf, productHits, selectionOf } from '../PriceTrendSearch';
import { autoComparesFor } from '../../state/mainSelection';

describe('agentux P1-5/P1-6 PriceTrendSearch', () => {
  it('agentux P1-5 header search keeps the own-product auto competitor matrix', () => {
    const hit = productHits('Pura 90s Pro', 'RU', 'phone').find((item) => item.isOwn);
    expect(hit).toBeDefined();
    if (!hit) return;
    const card = cardOf(hit);
    expect(card.auto).toBe(true);
    expect(card.compares).toEqual(autoComparesFor(card));
    expect(card.compares.length).toBeLessThanOrEqual(3);
  });

  it('agentux P1-6 exposes multiple SKU configurations and switches the applied selection', () => {
    const hit = productHits('Pura 90s Pro', 'RU', 'phone').find((item) => item.isOwn);
    expect(hit).toBeDefined();
    if (!hit) return;
    expect(new Set(hit.configOptions.map((option) => option.romram))).toEqual(new Set(['12+256 GB', '12+512 GB']));
    expect(new Set(hit.configOptions.map((option) => option.skuId)).size).toBeGreaterThan(2);
    const alternate = hit.configOptions.find((option) => option.romram === '12+512 GB');
    expect(alternate).toBeDefined();
    if (!alternate) return;
    expect(selectionOf(hit).romram).toBe('12+256 GB');
    expect(selectionOf(hit, alternate.skuId)).toEqual({ modelId: hit.modelId, romram: '12+512 GB', skuIds: [alternate.skuId] });
    expect(cardOf(hit, alternate.skuId).main).toEqual(selectionOf(hit, alternate.skuId));
  });
});
