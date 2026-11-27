import { describe, expect, it } from 'vitest';
import { dimProduct } from '../../data';
import { tierBandsOf } from '../../dataModel/aggregate';
import { currentPricesByGroup, groupKeyOf } from '../../dataModel/tierPrice';
import { defaultFilters } from '../../state/FiltersContext';
import { selKey, userCompareSourcesOf } from '../../state/mainSelection';
import { groupsFromPrevGeneration } from '../../state/configStore';
import { buildFilterChanges, buildFilterPatch } from '../core';
import { parseFilterIntent } from '../intentFilter';

const state = { ...defaultFilters, countryCode: 'RU', industry: 'phone' as const };
const brandOf = (modelId: string): string => dimProduct.find((row) => row.model_id === modelId)?.brand ?? '';
const prices = () => currentPricesByGroup('phone', 'RU');

describe('parseFilterIntent · 同档', () => {
  it('Mate X7 同档 苹果 三星：每品牌一款、只含点名品牌、来源 tier、自动匹配关', () => {
    const result = parseFilterIntent('Mate X7 同档 苹果 三星', state);
    const mains = result.patch.mains ?? [];
    expect(mains.length).toBeGreaterThan(0);
    const byGroup = prices();
    for (const card of mains) {
      expect(card.auto).toBe(false);
      expect(card.main?.modelId).toBe('own-huawei-mate-x7');
      const own = byGroup.get(`${card.main!.modelId}|${card.main!.romram}`);
      const brands = card.compares.map((sel) => brandOf(sel.modelId));
      expect(new Set(brands).size).toBe(brands.length);
      expect(brands.every((brand) => brand === 'APPLE' || brand === 'SAMSUNG')).toBe(true);
      const sources = userCompareSourcesOf(card);
      for (const sel of card.compares) {
        expect(sources[selKey(sel)]).toBe('tier');
        expect(byGroup.get(`${sel.modelId}|${sel.romram}`)?.tier).toBe(own?.tier);
      }
      // 每品牌取 USD 最接近的一款
      for (const sel of card.compares) {
        const brand = brandOf(sel.modelId);
        const diff = Math.abs((byGroup.get(`${sel.modelId}|${sel.romram}`)?.price.usd ?? 0) - (own?.price.usd ?? 0));
        for (const entry of byGroup.values()) {
          if (entry.tier !== own?.tier || brandOf(entry.sel.modelId) !== brand || entry.price.usd == null) continue;
          expect(diff).toBeLessThanOrEqual(Math.abs(entry.price.usd - (own?.price.usd ?? 0)) + 1e-9);
        }
      }
    }
    expect(mains.some((card) => card.compares.length > 0)).toBe(true);
    expect(result.structured).toBe(true);
    expect(buildFilterChanges(state, result.patch).length).toBeGreaterThan(0);
  });

  it('不点名品牌 = 不限定品牌，仍每品牌最多一款', () => {
    const result = parseFilterIntent('Mate X7 同档', state);
    const card = result.patch.mains?.[0];
    const brands = (card?.compares ?? []).map((sel) => brandOf(sel.modelId));
    expect(brands.length).toBeGreaterThan(2);
    expect(new Set(brands).size).toBe(brands.length);
    expect(brands).not.toContain('HUAWEI');
  });
});

describe('parseFilterIntent · 上一代', () => {
  it('数据包没有 prevGen 映射时给出缺口说明', () => {
    const own = dimProduct.find((row) => row.model_id === 'own-huawei-mate-x7' && row.countries.includes('RU'));
    expect(own).toBeDefined();
    const prev = groupsFromPrevGeneration([{ modelId: own!.model_id, romram: own!.romram, skuIds: [own!.sku_id] }]);
    const result = parseFilterIntent('Mate X7 vs 上一代', state);
    if (prev.added.length) {
      const compares = result.patch.mains?.[0]?.compares.map(selKey) ?? [];
      prev.added.forEach((sel) => expect(compares).toContain(selKey(sel)));
    } else {
      expect(result.notes.some((note) => note.includes('数据包未登记') && note.includes('Mate X7'))).toBe(true);
    }
  });
});

describe('parseFilterIntent · 档位词', () => {
  it('$600-800 → 该档全部我司组逐组成卡，竞品按最近价分配', () => {
    const band = tierBandsOf('phone').find((item) => item.min === 600 && item.max === 800);
    expect(band).toBeDefined();
    const byGroup = prices();
    const ownInBand = [...byGroup.values()].filter((entry) => entry.tier === band!.code && brandOf(entry.sel.modelId) === 'HUAWEI');
    const result = parseFilterIntent('$600-800 手机 苹果 三星', state);
    const mains = result.patch.mains ?? [];
    expect(mains).toHaveLength(ownInBand.length);
    expect(new Set(mains.map((card) => selKey(card.main!)))).toEqual(new Set(ownInBand.map((entry) => selKey(entry.sel))));
    const compareBrands = mains.flatMap((card) => card.compares.map((sel) => brandOf(sel.modelId)));
    expect(compareBrands.every((brand) => brand === 'APPLE' || brand === 'SAMSUNG')).toBe(true);
    // 同档点名品牌全部带上（不是每品牌一款）
    const expected = [...byGroup.values()].filter((entry) => entry.tier === band!.code && ['APPLE', 'SAMSUNG'].includes(brandOf(entry.sel.modelId)));
    expect(compareBrands).toHaveLength(expected.length);
    expect(result.notes.some((note) => note.includes('档位按现价落档'))).toBe(true);
  });

  it('旗舰 = 顶档；华为旗舰只取我司', () => {
    const bands = tierBandsOf('phone');
    const top = bands[bands.length - 1].code;
    const result = parseFilterIntent('华为旗舰', state);
    const mains = result.patch.mains ?? [];
    expect(mains.length).toBeGreaterThan(0);
    const byGroup = prices();
    mains.forEach((card) => {
      expect(byGroup.get(groupKeyOf(card.main!.modelId, card.main!.romram))?.tier).toBe(top);
      expect(card.compares).toEqual([]);
    });
  });

  it('不在阶梯上的区间给出未识别说明', () => {
    const result = parseFilterIntent('$650-900 手机', state);
    expect(result.notes).toContain('未识别的价格档位');
    expect(result.patch.mains).toBeUndefined();
  });
});

describe('parseFilterIntent · 视图与问题', () => {
  it('视图词', () => {
    expect(parseFilterIntent('按品牌分列', state).patch).toMatchObject({ viewMode: 'columns', columns: { groupBy: 'brand' } });
    expect(parseFilterIntent('按系列看', state).patch).toMatchObject({ viewMode: 'columns', columns: { groupBy: 'series' } });
    expect(parseFilterIntent('按档位分列', state).patch).toMatchObject({ viewMode: 'columns', columns: { groupBy: 'tier' } });
    expect(parseFilterIntent('看生命周期', state).patch.viewMode).toBe('lineage');
    const changes = buildFilterChanges(state, parseFilterIntent('按系列分列', state).patch);
    expect(changes).toEqual(expect.arrayContaining([
      { label: '视图', before: '对标', after: '分列' },
      { label: '分列依据', before: '品牌', after: '系列' },
    ]));
  });

  it('isQuestion', () => {
    expect(parseFilterIntent('为什么 Mate X7 比 iPhone 贵', state).isQuestion).toBe(true);
    expect(parseFilterIntent('Mate X7 该怎么办？', state).isQuestion).toBe(true);
    expect(parseFilterIntent('why is it high?', state).isQuestion).toBe(true);
    expect(parseFilterIntent('Mate X7 同档 苹果', state).isQuestion).toBe(false);
  });

  it('普通币种短语与 buildFilterPatch 一致、不算结构化', () => {
    const text = '切换到本币，最近 8 周';
    const result = parseFilterIntent(text, state);
    expect(result.patch).toEqual(buildFilterPatch(text, state));
    expect(result.structured).toBe(false);
  });

  it('单个型号命中不算结构化', () => {
    expect(parseFilterIntent('Mate X7', state).structured).toBe(false);
  });
});
