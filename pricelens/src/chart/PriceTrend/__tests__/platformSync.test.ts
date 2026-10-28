// 同步平台筛选开关语义（第一百七十三轮）：快照/收敛/还原纯函数单测
import { describe, expect, it } from 'vitest';
import { applySyncedPlatforms, pinnedSelectionFromBadge, restorePlatformSync, snapshotPlatformSync } from '../platformSync';
import type { MainProduct, PlatformSelection, ProductSelection } from '../../../state/filtersTypes';

const dns: PlatformSelection = { platforms: ['DNS'], shopIds: ['RU:DNS:STORE'] };
const ozon: PlatformSelection = { platforms: ['OZON'], shopIds: ['RU:OZON:3P'], seller: 'GOODSTORE' };

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

describe('applySyncedPlatforms', () => {
  it('全部产品（各卡主品+对比）收敛到源平台', () => {
    const out = applySyncedPlatforms(mains, dns);
    expect(out.every((c) => c.main!.platform === dns && c.compares.every((s) => s.platform === dns))).toBe(true);
  });

  it('源为 null（主品自动口径）= 全员自动；其余字段不动', () => {
    const out = applySyncedPlatforms(mains, null);
    expect(out.every((c) => c.main!.platform === null && c.compares.every((s) => s.platform === null))).toBe(true);
    expect(out[0].main!.skuIds).toEqual(mains[0].main!.skuIds);
    expect(out[0].id).toBe('c1');
  });
});

describe('restorePlatformSync', () => {
  it('触发→取消往返：平台逐项还原到快照', () => {
    const snap = snapshotPlatformSync(mains);
    const synced = applySyncedPlatforms(mains, dns);
    const back = restorePlatformSync(synced, snap);
    expect(back[0].main!.platform).toBe(dns);
    expect(back[0].compares[0].platform).toBe(ozon);
    expect(back[0].compares[1].platform).toBeNull();
    expect(back[1].main!.platform).toBeNull();
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

  it('主品自动但无数据（label 仍为占位「自动」/badge 缺）= 回落 null 全员自动', () => {
    expect(pinnedSelectionFromBadge({ label: '自动', auto: true }, null)).toBeNull();
    expect(pinnedSelectionFromBadge(null, null)).toBeNull();
    expect(pinnedSelectionFromBadge(undefined, null)).toBeNull();
  });
});
