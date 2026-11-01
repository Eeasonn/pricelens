import { describe, expect, it } from 'vitest';
import type { MarginCostPoint } from '../marginCost';
import {
  detailDateOf,
  detailPeriodOf,
  detailVolumeLabelOf,
  detailWowLabelOf,
  weekDetailModel,
} from '../weekDetail';

const money = (value: number) => `$${Math.round(value)}`;
const count = (value: number) => value.toLocaleString('en-US');

const marginPoint = (over: Partial<MarginCostPoint> = {}): MarginCostPoint => ({
  bucketId: '202626',
  monthId: '202606',
  unitRevenue: 545,
  unitCost: 431,
  unitMargin: 114,
  marginRate: 0.209,
  simulated: true,
  ...over,
});

describe('图下单周明细卡取数', () => {
  it('周粒度：日期/桶号/指标名与涨跌读数', () => {
    const model = weekDetailModel({
      granularity: 'week',
      bucketId: '202626',
      xLabel: '06-24',
      price: 545,
      rrp: 599,
      prevPrice: 552,
      volume: 4089,
      marginPoint: marginPoint(),
      marginUnavailable: false,
      formatMoney: money,
      formatVolume: count,
    });
    expect(model.visible).toBe(true);
    expect(model.date).toBe('06-24');
    expect(model.period).toBe('2026W26');
    expect(model.wowLabel).toBe('周环比');
    expect(model.volumeLabel).toBe('周销量');
    expect(model.rrp).toBe('$599');
    expect(model.price).toBe('$545');
    expect(model.wow).toEqual({ text: '−1.3%', dir: 'down' });
    expect(model.volume).toBe('4,089');
    expect(model.margin).toEqual({ kind: 'ready', cost: '$431', margin: '$114', rate: '20.9%' });
  });

  it('上涨为涨蓝方向，正好持平用 ±0.0%', () => {
    const up = weekDetailModel({
      granularity: 'week', bucketId: '202626', xLabel: '06-24',
      price: 600, rrp: 599, prevPrice: 500, volume: 1,
      marginPoint: null, marginUnavailable: true,
      formatMoney: money, formatVolume: count,
    });
    expect(up.wow).toEqual({ text: '+20.0%', dir: 'up' });
    const flat = weekDetailModel({
      granularity: 'week', bucketId: '202626', xLabel: '06-24',
      price: 500, rrp: null, prevPrice: 500, volume: 1,
      marginPoint: null, marginUnavailable: true,
      formatMoney: money, formatVolume: count,
    });
    expect(flat.wow).toEqual({ text: '±0.0%', dir: 'flat' });
  });

  it('缺采不借用相邻周：价格/RRP/销量缺省为 —，上一桶缺采环比也为 —', () => {
    const model = weekDetailModel({
      granularity: 'week',
      bucketId: '202627',
      xLabel: '07-01',
      price: null,
      rrp: null,
      prevPrice: 500,
      volume: null,
      marginPoint: null,
      marginUnavailable: false,
      formatMoney: money,
      formatVolume: count,
    });
    expect(model.price).toBeNull();
    expect(model.rrp).toBeNull();
    expect(model.volume).toBeNull();
    expect(model.wow).toBeNull();
    expect(model.margin.kind).toBe('gap');
  });

  it('竞品整段无模拟成本时三格为 empty，不显示别的月份顶上', () => {
    const model = weekDetailModel({
      granularity: 'week',
      bucketId: '202626',
      xLabel: '06-24',
      price: 545,
      rrp: 599,
      prevPrice: 552,
      volume: 10,
      marginPoint: marginPoint(),
      marginUnavailable: true,
      formatMoney: money,
      formatVolume: count,
    });
    expect(model.margin.kind).toBe('empty');
    expect(model.margin.cost).toBe('');
  });

  it('月/季粒度换字：月环比/月销量，桶号与日期换月格式', () => {
    expect(detailWowLabelOf('month')).toBe('月环比');
    expect(detailWowLabelOf('quarter')).toBe('季环比');
    expect(detailVolumeLabelOf('month')).toBe('月销量');
    expect(detailDateOf('month', '202607')).toBe('2026-07');
    expect(detailPeriodOf('month', '202607', '202607')).toBe('2026-07');
    expect(detailPeriodOf('quarter', '2026Q3', '2026Q3')).toBe('2026Q3');
  });

  it('周桶号缺省时回退锚日文案，空观察点不出卡', () => {
    expect(detailPeriodOf('week', '', '06-24')).toBe('06-24');
    const empty = weekDetailModel({
      granularity: 'week', bucketId: '', xLabel: '',
      price: null, rrp: null, prevPrice: null, volume: null,
      marginPoint: null, marginUnavailable: true,
      formatMoney: money, formatVolume: count,
    });
    expect(empty.visible).toBe(false);
  });
});
