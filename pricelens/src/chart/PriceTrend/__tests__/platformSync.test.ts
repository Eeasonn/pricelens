// 店铺同步纯函数单测（本轮语义重定，Eason：同步只让对比品跟随主品，主品自身
// 永不改写）：快照 / 钉定解析 / syncComparesWithMain / 取消还原
import { describe, expect, it } from 'vitest';
import {
  pinnedSelectionFromBadge,
  restorePlatformSync,
  snapshotPlatformSync,
  syncComparesWithMain,
} from '../platformSync';
import type { MainProduct, PlatformSelection, ProductSelection } from '../../../state/filtersTypes';

const dns: PlatformSelection = { platforms: ['DNS'], shopIds: ['RU:DNS:STORE'] };
const ozon: PlatformSelection = { platforms: ['OZON'], shopIds: ['RU:OZON:3P'], seller: 'GOODSTORE' };
const mvideo: PlatformSelection = { platforms: ['Mvideo'], shopIds: [] };

const sel = (modelId: string, platform?: PlatformSelection | null): ProductSelection => ({
  modelId,
  romram: '12GB+512GB',
  skuIds: [`${modelId}-sku`],
  platform,
});

const card = (id: string, main: ProductSelection | null, compares: ProductSelection[]): MainProduct => ({ id, main, compares });

const mains: MainProduct[] = [
  card('c1', sel('P80-Pro', dns), [sel('S26U', ozon), sel('M6', null)]),
  card('c2', sel('Pura-80', null), [sel('iPhone17', dns)]),
];

describe('snapshotPlatformSync', () => {
  it('按卡收录主品+对比的平台现状（含 null 自动口径）', () => {
    const snap = snapshotPlatformSync(mains);
    expect(snap).toHaveLength(2);
    expect(snap[0]).toEqual({
      cardId: 'c1',
      entries: [
        { key: 'P80-Pro|12GB+512GB', platform: dns },
        { key: 'S26U|12GB+512GB', platform: ozon },
        { key: 'M6|12GB+512GB', platform: null },
      ],
    });
    expect(snap[1].entries).toEqual([
      { key: 'Pura-80|12GB+512GB', platform: null },
      { key: 'iPhone17|12GB+512GB', platform: dns },
    ]);
  });
});

describe('syncComparesWithMain（本轮重定口径：只写对比品，主品永不改写）', () => {
  it('主品显式选择 = 原样写给全部对比品；主品对象与 platform 引用原样保留', () => {
    const c = card('c1', sel('P80-Pro', dns), [sel('S26U', ozon), sel('M6', null)]);
    const out = syncComparesWithMain(c);
    expect(out).not.toBeNull();
    expect(out!.main).toBe(c.main); // 主品引用不动（口径、SKU 全原样）
    expect(out!.compares[0].platform).toBe(dns); // 同一引用透传
    expect(out!.compares[1].platform).toBe(dns);
    expect(out!.compares[0].modelId).toBe('S26U'); // 其余字段不动
    expect(out!.compares[0].skuIds).toEqual(c.compares[0].skuIds);
  });

  it('主品显式选择不受 badge 影响（badge 只在自动口径时用）', () => {
    const c = card('c1', sel('P80-Pro', dns), [sel('S26U', ozon)]);
    const out = syncComparesWithMain(c, { label: 'Mvideo', auto: true });
    expect(out!.compares.every((s) => s.platform === dns)).toBe(true);
  });

  it('主品自动 = 按最新有价周 badge 钉平台（{platforms:[名], shopIds:[]}）写给全部对比品；主品保持自动', () => {
    const c = card('c1', sel('P80-Pro', null), [sel('S26U', ozon), sel('M6', null)]);
    const out = syncComparesWithMain(c, { label: 'Mvideo', auto: true });
    expect(out).not.toBeNull();
    expect(out!.main!.platform).toBeNull(); // 主品永不改写
    expect(out!.compares[0].platform).toEqual(mvideo);
    expect(out!.compares[1].platform).toEqual(mvideo);
  });

  it('解析不出（主品自动 + badge 占位「自动」/ 无 badge）= 返回 null，不写任何人', () => {
    const c = card('c1', sel('P80-Pro', null), [sel('S26U', ozon)]);
    expect(syncComparesWithMain(c, { label: '自动', auto: true })).toBeNull();
    expect(syncComparesWithMain(c, null)).toBeNull();
    expect(syncComparesWithMain(c)).toBeNull();
    // 入参卡未被改动（纯函数）
    expect(c.compares[0].platform).toBe(ozon);
    expect(c.main!.platform).toBeNull();
  });

  it('未选主品（空对）= 返回 null', () => {
    expect(syncComparesWithMain(card('c0', null, [sel('S26U', ozon)]), { label: 'DNS', auto: false })).toBeNull();
  });

  it('无对比区 = 卡原样返回（无写点；主品不动）', () => {
    const c = card('c1', sel('P80-Pro', dns), []);
    const out = syncComparesWithMain(c, { label: 'Mvideo', auto: true });
    expect(out).not.toBeNull();
    expect(out!.compares).toHaveLength(0);
    expect(out!.main).toBe(c.main);
  });
});

describe('触发 → 取消往返（快照整组还原，含主品）', () => {
  it('同步后取消：主品与对比品逐项还原到快照（真原始）', () => {
    const snap = snapshotPlatformSync(mains);
    const synced = mains.map((c) => syncComparesWithMain(c, { label: 'Mvideo', auto: true }) ?? c);
    const back = restorePlatformSync(synced, snap);
    expect(back[0].main!.platform).toBe(dns); // 主品显式还原
    expect(back[1].main!.platform).toBeNull(); // 主品自动还原（同步从未写过它）
    expect(back[0].compares[0].platform).toBe(ozon);
    expect(back[0].compares[1].platform).toBeNull();
    expect(back[1].compares[0].platform).toBe(dns);
  });

  it('同步期间被换掉的选择项（selKey 匹配不上）保持现状', () => {
    const snap = snapshotPlatformSync(mains);
    const mutated: MainProduct[] = [
      card('c1', sel('P80-Pro', dns), [sel('Mate-70', ozon), sel('M6', dns)]),
    ];
    const back = restorePlatformSync(mutated, snap);
    expect(back[0].main!.platform).toBe(dns); // 主品 key 匹配 → 还原（同为 dns）
    expect(back[0].compares[0].modelId).toBe('Mate-70');
    expect(back[0].compares[0].platform).toBe(ozon); // 新对比项不在快照 → 不动
    expect(back[0].compares[1].platform).toBeNull(); // M6 在快照中本是 null 自动 → 还原
  });

  it('卡整体更换（cardId 匹配不上）整卡对象不动', () => {
    const snap = snapshotPlatformSync(mains);
    const fresh: MainProduct[] = [card('c9', sel('Pura-80', ozon), [])];
    const out = restorePlatformSync(fresh, snap);
    expect(out).not.toBe(fresh); // 外层新数组
    expect(out[0]).toBe(fresh[0]); // 卡对象原样
  });

  it('空快照 = 原样返回内容（每卡映射不到即原卡）', () => {
    expect(restorePlatformSync(mains, [])).toEqual(mains);
  });
});

describe('pinnedSelectionFromBadge（第一百七十四轮：主品自动口径的钉定解析）', () => {
  it('主品显式选择 = 原样透传（badge 不看）', () => {
    expect(pinnedSelectionFromBadge({ label: 'DNS', auto: false }, ozon)).toBe(ozon);
    expect(pinnedSelectionFromBadge(null, dns)).toBe(dns);
  });

  it('主品自动 + 有实际取价平台 = 钉成平台级显式选择（与平台小药丸同名）', () => {
    expect(pinnedSelectionFromBadge({ label: 'DNS', auto: true }, null)).toEqual({ platforms: ['DNS'], shopIds: [] });
    expect(pinnedSelectionFromBadge({ label: 'Mvideo', auto: true }, null)).toEqual({ platforms: ['Mvideo'], shopIds: [] });
  });

  it('主品自动但无数据（label 仍为占位「自动」/badge 缺）= 返回 null（不可同步）', () => {
    expect(pinnedSelectionFromBadge({ label: '自动', auto: true }, null)).toBeNull();
    expect(pinnedSelectionFromBadge(null, null)).toBeNull();
    expect(pinnedSelectionFromBadge(undefined, null)).toBeNull();
  });
});
