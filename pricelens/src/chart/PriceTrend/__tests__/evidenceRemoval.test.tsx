// ============================================================
// 明细记录行退役 + 商品现页链接默认可发现。
// ============================================================
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import TrendTables from '../TrendTables';
import type { DetailBucket, TableGroup } from '../tableModel';
import type { CurrencyMode, Granularity, Series, SeriesPoint } from '../../../dataModel/types';

const point = (n: number): SeriesPoint => ({
  bucketId: `20262${n}`,
  xLabel: `0${n}-15`,
  anchorDate: `2026-0${n}-15`,
  rrp: 1299,
  price: 999,
  missing: false,
  offer: null,
  url: 'https://example.com/product/acme',
  shopName: '样例店铺',
});
const series: Series = {
  key: 's-acme', isOwn: true, brand: 'Acme', label: 'Acme Phone 12/256', skuIds: ['sku-acme'], color: '#0057e7', points: [point(1), point(2)],
};
const groups: TableGroup[] = [{ id: 'g1', mainKey: 's-acme', series: [series] }];
const buckets: DetailBucket[] = series.points.map((p) => ({ id: p.bucketId, xLabel: p.xLabel, anchorDate: p.anchorDate }));

afterEach(cleanup);

describe('明细记录行退役与现页链接', () => {
  it('不再渲染记录行或页面快照；现页链接默认蓝色下划线并带外链图标', () => {
    render(<TrendTables groups={groups} buckets={buckets} fourWeekChanges={new Map()} currency={'usd' as CurrencyMode} granularity={'week' as Granularity} />);
    expect(screen.queryByText('记录')).toBeNull();
    expect(screen.queryByText('页面快照')).toBeNull();
    const link = screen.getByRole('link', { name: /商城现页/ });
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.getAttribute('rel')).toContain('noreferrer');
    expect(link.style.color).toBe('rgb(0, 112, 243)');
    expect(link.style.textDecoration).toContain('underline');
    expect(link.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });
});
