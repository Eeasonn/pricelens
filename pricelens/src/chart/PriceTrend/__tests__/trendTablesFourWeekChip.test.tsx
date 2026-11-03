// ============================================================
// 宽表「近4周环比」问号口径说明（2026-11-03 反馈）：label 后加问号小图标，
// antd Tooltip 悬停讲清「近 4 周均值 ÷ 上一段 4 周均值」，杜绝「最新一天 ÷
// 4 周均值」误读；原原生 title 并入说明、单一提示源（旧 title 不再出现在
// 本行任何元素上）。
// ============================================================
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import TrendTables from '../TrendTables';
import type { DetailBucket, TableGroup } from '../tableModel';
import type { CurrencyMode, Granularity, Series, SeriesPoint } from '../../../dataModel/types';

const OLD_TITLE = '最近4周折后价均价相比此前4周均价';
const EXPLAIN = '近 4 周折后价均值，对比上一段 4 周折后价均值的变化。按周取值，截至当前窗口末尾；月 / 季视图同样按周计算。';

const mkPoint = (n: number): SeriesPoint => ({
  bucketId: `20262${n}`,
  xLabel: `0${n}-15`,
  anchorDate: `2026-0${n}-15`,
  rrp: 1299,
  price: 999,
  missing: false,
  offer: null,
  url: '',
  shopName: '样例店铺',
});

const series: Series = {
  key: 's-acme',
  isOwn: true,
  brand: 'Acme',
  label: 'Acme Phone 12/256',
  skuIds: ['sku-acme'],
  color: '#0057e7',
  points: [mkPoint(1), mkPoint(2), mkPoint(3), mkPoint(4)],
};

const groups: TableGroup[] = [{ id: 'g1', mainKey: 's-acme', series: [series] }];
const buckets: DetailBucket[] = series.points.map((p) => ({ id: p.bucketId, xLabel: p.xLabel, anchorDate: p.anchorDate }));

const mount = (fourWeek: number | null) =>
  render(
    <TrendTables
      groups={groups}
      buckets={buckets}
      fourWeekChanges={new Map([['s-acme', fourWeek]])}
      currency={'usd' as CurrencyMode}
      granularity={'week' as Granularity}
    />,
  );

afterEach(cleanup);

describe('TrendTables · 近4周环比问号说明', () => {
  it('label 后渲染问号按钮（aria 口径说明），悬停出「均值 ÷ 上一段均值」说明', async () => {
    mount(0.024);
    expect(screen.getByText('近4周环比')).toBeTruthy();
    expect(screen.getByText('+2.4%')).toBeTruthy();
    const help = screen.getByRole('button', { name: '近4周环比口径说明' });
    // antd Tooltip 悬停异步渲染（raf）， findBy 等待
    fireEvent.mouseEnter(help);
    expect(await screen.findByText(EXPLAIN)).toBeTruthy();
  });

  it('环比无值（null）问号仍在，说明同文案；旧原生 title 从本行消失（并入说明防两处提示）', async () => {
    mount(null);
    const help = screen.getByRole('button', { name: '近4周环比口径说明' });
    fireEvent.mouseEnter(help);
    expect(await screen.findByText(EXPLAIN)).toBeTruthy();
    expect(document.querySelector(`[title="${OLD_TITLE}"]`)).toBeNull();
  });
});
