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

  it('does not assign a REAL evidence image to a missing URL, another product, or a different variant query; falls back to explicitly-flagged demo placeholder instead (2026-11-17 Eason 恢复模拟占位)', () => {
    // 合法 http 深链但无真实匹配 → 模拟占位（demo:true 显式标注）
    for (const url of ['https://www.dns-shop.ru/product/another/', `${capture.url}?sku=512`]) {
      const r = snapshotFor(url, '202645');
      expect(r.historical).toBeNull();
      expect(r.current).toBeNull();
      expect(r.demo?.demo).toBe(true);
    }
    // 非法/空 URL（无合法商品深链）= 无轮转上下文，真实证据与占位都不给
    for (const url of ['', 'DNS', 'javascript:alert(1)']) {
      const r = snapshotFor(url, '202645');
      expect(r.historical).toBeNull();
      expect(r.current).toBeNull();
      expect(r.demo).toBeNull();
    }
    expect(snapshotFor(`${capture.url}#details`, '202645').current).not.toBeNull();
    expect(snapshotFor(`${capture.url}#details`, '202645').demo).toBeNull(); // 有真实证据则不给占位
  });

  it('demo placeholder rotates stably per (url, week) — same input, same image', () => {
    const a = snapshotFor('https://www.dns-shop.ru/product/another/', '202645');
    const b = snapshotFor('https://www.dns-shop.ru/product/another/', '202645');
    expect(a.demo).toBe(b.demo);
    const c = snapshotFor('https://www.dns-shop.ru/product/another/', '202644');
    expect(a.demo).not.toBeNull();
    expect(c.demo).not.toBeNull();
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
