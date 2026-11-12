import { describe, expect, it } from 'vitest';
import { parsePriceTrendSearch } from '../PriceTrendSearch';

describe('header search country boundaries', () => {
  it.each(['Pura 90s Pro', 'pura90spro', 'Samsung Galaxy S26 Ultra', 'Mate X7', 'Mate X7 12+512 GB'])(
    'keeps the current country for product name %s', (query) => {
      expect(parsePriceTrendSearch(query, 'RU')).toEqual({ countryCode: 'RU', productQuery: query });
    },
  );

  it.each([
    ['RU Pura 90s Pro', 'RU', 'Pura 90s Pro'],
    ['R 国 pura90spro', 'RU', 'pura90spro'],
    ['RO Pura 90s Pro', 'RO', 'Pura 90s Pro'],
    ['SA Samsung Galaxy S26 Ultra', 'SA', 'Samsung Galaxy S26 Ultra'],
    ['GB Mate X7 12+512 GB', 'GB', 'Mate X7 12+512 GB'],
    ['RU: Pura 90s Pro', 'RU', 'Pura 90s Pro'],
  ])('honors the explicit country in %s', (query, countryCode, productQuery) => {
    expect(parsePriceTrendSearch(query, 'AE')).toEqual({ countryCode, productQuery });
  });
});
