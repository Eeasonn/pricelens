// ============================================================
// t428u R6（六审增量 · 2026-11-07）真实 3P 计算口径 golden：
//  - 评审反例（真实事实行，非 mock）：RU nova 14（非 Pro）12+256GB 黑色
//    week202619 USD——RU:ozon:1P = 24 551 ÷ 73.81 = 332.62；
//    RU:ozon:3P = 29 522 ÷ 74.8161 = 394.59。严格店铺级 3P 取数必须 =
//    394.59；若把渠道枚举扩大成平台池（1P+3P 并集按周最低价）会得到
//    332.62（≈333，1P 最低）——「留 3P 口径却算 1P+3P」即六审缺陷。
//  - 契约：effectiveChannelIds 店铺级 = 严格单渠道；buildSeries 店铺级 /
//    平台级 / 自动三口径各自真实成价（平台级=平台内每周最低价店铺、自动=
//    该国全部渠道每周最低价，两者得 332.62 属文档化口径而非缺陷；店铺级
//    必须严格 394.59）。差异说明见文件尾「稳定线 vs 迭代线」注释。
// ============================================================
import { describe, expect, it } from 'vitest';
import { buildSeries, effectiveChannelIds } from '../aggregate';
import type { PlatformQuery } from '../types';

const SKU = 'own-huawei-nova-14__12-256gb__black';
const MODEL = 'own-huawei-nova-14';
const ROMRAM = '12+256 GB';
/** 店铺级单渠道勾选（PlatformBox 店铺行提交形态：绝不同时写 platforms） */
const OZON_3P: PlatformQuery = { platforms: [], shopIds: ['RU:ozon:3P'], seller: null };
const OZON_1P: PlatformQuery = { platforms: [], shopIds: ['RU:ozon:1P'], seller: null };
const OZON_PLATFORM: PlatformQuery = { platforms: ['OZON'], shopIds: [], seller: null };

function seriesOf(platform: PlatformQuery | null) {
  const series = buildSeries({
    scope: { countryCode: 'RU', industry: 'phone' },
    groups: [{ modelId: MODEL, romram: ROMRAM, skuIds: [SKU], isOwn: true, platform }],
    granularity: 'week',
    startBucket: '202619',
    endBucket: '202619',
    currency: 'usd',
    agg: 'avg',
  });
  expect(series).toHaveLength(1);
  return series[0];
}

describe('R6 · effectiveChannelIds 真实渠道集合（不能只看 scope 字段）', () => {
  it('店铺级 3P = 严格单渠道 [' + 'RU:ozon:3P' + ']，不扩大成 OZON 整平台', () => {
    expect(effectiveChannelIds('RU', OZON_3P)).toEqual(['RU:ozon:3P']);
  });

  it('店铺级 1P 同样严格单渠道；平台级 = 该平台全部渠道（1P+3P 并集，文档化口径）', () => {
    expect(effectiveChannelIds('RU', OZON_1P)).toEqual(['RU:ozon:1P']);
    expect(effectiveChannelIds('RU', OZON_PLATFORM).sort()).toEqual(['RU:ozon:1P', 'RU:ozon:3P']);
  });
});

describe('R6 · buildSeries 真实事实价格（nova 14 12+256GB 黑色 · RU · week202619 · USD）', () => {
  // 事实行 USD（price_usd，round2）：1P = 332.62、3P = 394.59；序列点价统一
  // Math.round 展示（aggregate 点构造）→ 严格 3P = 395、平台池/自动 = 333，
  // 与六审口径一致（395 vs 333 一眼可辨，不会混池后仍显 3P）。
  it('店铺级 OZON 3P：202619 点价 = 395（394.59 取整），绝非 1P+3P 混池的 333', () => {
    const point = seriesOf(OZON_3P).points[0];
    expect(point?.bucketId).toBe('202619');
    expect(point?.price).toBe(395);
    // 取数来源必须点名 3P 渠道（OZON 3P），不能只挂平台名冒充店铺口径
    expect(point?.channelName).toBe('OZON 3P');
    expect(point?.platform).toBe('OZON');
  });

  it('店铺级 OZON 1P：202619 点价 = 333（332.62 取整）——两店铺级互不串池', () => {
    expect(seriesOf(OZON_1P).points[0]?.price).toBe(333);
    expect(seriesOf(OZON_1P).points[0]?.channelName).toBe('OZON 1P');
  });

  it('平台级 OZON 与自动口径 = 333（平台内/全国每周最低价落 1P，文档化差异非缺陷）', () => {
    expect(seriesOf(OZON_PLATFORM).points[0]?.price).toBe(333);
    expect(seriesOf(null).points[0]?.price).toBe(333);
  });
});

// ============================================================
// 稳定线 vs 迭代线差异（R6 如实记录，不盲改迭代实现）：
//  - 稳定线（zcode/pricelens-stable-t428u · urlSync.platformLevelForChannel，
//    STABLE 分支）：店铺级勾选一律降级为平台级（shopIds:[RU:ozon:3P] →
//    platforms:['OZON']），FiltersContext restore/URL 写侧同款（读侧忽略
//    shop=、写侧恒删 shop 键）；价格页每组 platform 被全局降级版覆写
//    （PriceTrend：STABLE ? stablePlatform : 每线）。效果 = 留 3P 的
//    queryState/patch 算出来是 1P+3P 平台池最低价 332.62——六审反例。
//  - 迭代线（本线）：URL shop= 真实读入 state.platform；价格页每线
//    sel.platform（店铺同步/平台小药丸）真严格按渠道取数；Agent 趋势
//    queryCards 走每线 platform、价格优势走全局 state.platform，两者经
//    effectiveChannelIds 严格交集 = 真按选中店铺计算（本文件上方断言）。
// ============================================================
