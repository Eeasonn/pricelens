import { describe, expect, it } from 'vitest';
import { snapshotFor, type PageSnapshot } from '../../data/snapshots';
import capture from '../../assets/snapshots/dns-pura90s-20261111-source.json';

describe('page evidence matching', () => {
  it('keeps a newly captured matching product separate from W45 historical proof', () => {
    const result = snapshotFor(capture.url, '202645');
    expect(result.historical).toBeNull();
    expect(result.current).toMatchObject({ kind: 'current-page', capturedAt: capture.capturedAt, priceText: '86 499 ₽' });
    expect(snapshotFor(capture.url, '202646').historical).toBeNull();
  });

  it('does not assign an unrelated image to a missing URL, another product, or a different variant query', () => {
    for (const url of ['', 'DNS', 'javascript:alert(1)', 'https://www.dns-shop.ru/product/another/', `${capture.url}?sku=512`]) {
      expect(snapshotFor(url, '202645')).toEqual({ historical: null, current: null });
    }
    expect(snapshotFor(`${capture.url}#details`, '202645').current).not.toBeNull();
  });

  it('requires both product URL and explicit historical week before attributing a historical capture', () => {
    const record: PageSnapshot = {
      src: 'fixture.jpg', sourceUrl: capture.url, capturedAt: '2026-11-02T10:00:00Z',
      sourceLabel: 'DNS', pageLabel: 'test', kind: 'historical', weekId: '202645', priceText: '89 999 ₽',
    };
    expect(snapshotFor(capture.url, '202645', [record]).historical).toBe(record);
    expect(snapshotFor(capture.url, '202644', [record]).historical).toBeNull();
    expect(snapshotFor('https://example.com/other', '202645', [record]).historical).toBeNull();
  });

});
