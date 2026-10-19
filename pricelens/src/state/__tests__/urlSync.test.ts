import { describe, expect, it } from 'vitest';
import { dimProduct } from '../../data';
import { productSelectionOfAnySeriesKey, productSelectionOfSeriesKey } from '../urlSync';

describe('series key selection guards', () => {
  it('does not allow a competitor series to become an own URL selection', () => {
    const competitor = dimProduct.find((p) => !p.is_own)!;
    const key = `${competitor.sku_id.split('__')[0]}__${competitor.romram.replace(/\s+/g, '')}`;

    expect(productSelectionOfSeriesKey(key)).toBeNull();
    expect(productSelectionOfAnySeriesKey(key)?.modelId).toBe(competitor.sku_id.split('__')[0]);
  });
});
