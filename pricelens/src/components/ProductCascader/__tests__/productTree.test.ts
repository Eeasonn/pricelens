// ============================================================
// 统一产品树金测（第一百一十七轮）：品牌序（华为置顶+矩阵列序）、竞品系列层
// （维表 series 已按「代际+产品线」规则重写）、型号排序（在售在前、上市新→旧）、
// 配置容量数值排序（TB=1024）、搜索剪枝。
// 第一百二十三轮：+档位筛选（配置级 tier_by_country，同型号不同配置可跨档）
// 与档位选项（该国该产业实际存在的档位，阶梯序高→低）。
// ============================================================
import { describe, expect, it } from 'vitest';
import { dimProduct } from '../../../data';
import { tierOrderOf, tierOf } from '../../../dataModel/aggregate';
import {
  buildProductTree,
  compareRomram,
  filterProductTreeByTier,
  ownBrand,
  parseCapacity,
  searchProductTree,
  tiersOfScope,
} from '../tree';

describe('parseCapacity / compareRomram（配置容量数值排序）', () => {
  it('GB/TB 解析：1TB = 1024、单数字按 ROM、无数字落 [0,0]', () => {
    expect(parseCapacity('12+256 GB')).toEqual([12, 256]);
    expect(parseCapacity('16+1 TB')).toEqual([16, 1024]);
    expect(parseCapacity('256 GB')).toEqual([0, 256]);
    expect(parseCapacity('46mm GPS')).toEqual([0, 0]);
  });

  it('容量升序：ROM 主序、RAM 次序、TB 跨单位可比', () => {
    const list = ['1TB', '12+512 GB', '12+256 GB', '16+512 GB', '16+1 TB', '256 GB'];
    const sorted = [...list].sort(compareRomram);
    expect(sorted).toEqual(['256 GB', '12+256 GB', '12+512 GB', '16+512 GB', '1TB', '16+1 TB']);
  });
});

describe('buildProductTree（统一产品树）', () => {
  const tree = buildProductTree('phone', 'RU');

  it('华为品牌置顶，其后按矩阵列序（APPLE、SAMSUNG…）', () => {
    expect(tree[0].key).toBe(ownBrand());
    const brands = tree.slice(1, 3).map((b) => b.key);
    expect(brands).toContain('APPLE');
    expect(brands).toContain('SAMSUNG');
  });

  it('竞品有系列层：Galaxy S25 全家（+/Ultra/FE）同系列、iPhone 16 全家同系列', () => {
    const samsung = tree.find((b) => b.key === 'SAMSUNG')!;
    expect(samsung).toBeTruthy();
    const s25 = samsung.series.find((s) => s.title === 'Galaxy S25');
    expect(s25).toBeTruthy();
    expect(s25!.models.map((m) => m.label).sort()).toEqual(
      expect.arrayContaining(['S25', 'S25 Ultra', 'S25 FE'].filter((n) => samsung.series.some((s) => s.models.some((m) => m.label === n)))),
    );
    const apple = tree.find((b) => b.key === 'APPLE')!;
    expect(apple.series.some((s) => s.title === 'iPhone 16')).toBe(true);
  });

  it('系列与型号按上市新→旧排序；型号列配置容量升序', () => {
    for (const brand of tree) {
      for (const s of brand.series) {
        for (let i = 1; i < s.models.length; i++) {
          if (!s.models[i - 1].eol && !s.models[i].eol) {
            expect(s.models[i - 1].launchDate >= s.models[i].launchDate).toBe(true);
          }
        }
        for (const m of s.models) {
          const roms = m.romrams.map((r) => r.romram);
          const sorted = [...roms].sort(compareRomram);
          expect(roms).toEqual(sorted);
        }
      }
    }
  });

  it('系列标题回退：无规则的型号自成一组（型号名 = 系列名）', () => {
    const lone = tree.flatMap((b) => b.series).filter((s) => s.models.length === 1 && s.title === s.models[0].label);
    expect(lone.length).toBeGreaterThan(0);
  });
});

describe('searchProductTree（搜索剪枝）', () => {
  const tree = buildProductTree('phone', 'RU');

  it('型号名命中：保留品牌→系列祖先链，只留命中型号', () => {
    const hit = searchProductTree(tree, 'S25 Ultra');
    expect(hit.length).toBe(1);
    expect(hit[0].key).toBe('SAMSUNG');
    expect(hit[0].series.every((s) => s.title === 'Galaxy S25')).toBe(true);
  });

  it('系列名命中：整系列型号保留', () => {
    const hit = searchProductTree(tree, 'iPhone 17');
    expect(hit[0].key).toBe('APPLE');
    expect(hit[0].series.some((s) => s.models.length > 1)).toBe(true);
  });

  it('无命中返回空数组；空 query 返回原树', () => {
    expect(searchProductTree(tree, '不存在的产品')).toEqual([]);
    expect(searchProductTree(tree, '  ')).toBe(tree);
  });
});

describe('档位筛选（第一百二十三轮：tier_by_country 配置级档位）', () => {
  const tree = buildProductTree('phone', 'RU');
  // 取该国手机产业有产品的首个档位（数据驱动，不写死档位代码）
  const tiers = tiersOfScope('phone', 'RU');
  const tier = tiers[0];

  it('tiersOfScope：该国该产业实际存在的档位、去重、阶梯序高→低', () => {
    expect(tiers.length).toBeGreaterThan(0);
    expect(new Set(tiers).size).toBe(tiers.length);
    const present = new Set(
      dimProduct
        .filter((p) => p.industry === 'phone' && p.countries.includes('RU'))
        .map((p) => tierOf(p, 'RU')),
    );
    expect([...tiers].sort()).toEqual([...present].sort()); // 不多列（无空档）不少列
    const ladderHighToLow = [...tierOrderOf('phone')].reverse().filter((t) => present.has(t));
    expect(tiers.slice(0, ladderHighToLow.length)).toEqual(ladderHighToLow); // 阶梯内严格高→低
  });

  it('filterProductTreeByTier：四列只剩该档配置，空层整链剪除', () => {
    const filtered = filterProductTreeByTier(tree, tier, 'RU');
    expect(filtered.length).toBeGreaterThan(0);
    const hitKeys = new Set(
      dimProduct
        .filter((p) => p.industry === 'phone' && p.countries.includes('RU') && tierOf(p, 'RU') === tier)
        .map((p) => `${p.sku_id.split('__')[0]}|${p.romram}`),
    );
    for (const b of filtered) {
      expect(b.series.length).toBeGreaterThan(0);
      for (const s of b.series) {
        expect(s.models.length).toBeGreaterThan(0);
        for (const m of s.models) {
          expect(m.romrams.length).toBeGreaterThan(0);
          for (const r of m.romrams) expect(hitKeys.has(r.key)).toBe(true);
        }
      }
    }
  });

  it('同型号不同配置可跨档：过滤树里该型号的配置 ≤ 全量树（只裁配置列，不重分组）', () => {
    const filtered = filterProductTreeByTier(tree, tier, 'RU');
    const keptById = new Map(filtered.flatMap((b) => b.series).flatMap((s) => s.models).map((m) => [m.modelId, m]));
    for (const [modelId, kept] of keptById) {
      const full = tree.flatMap((b) => b.series).flatMap((s) => s.models).find((m) => m.modelId === modelId)!;
      expect(kept.romrams.length).toBeLessThanOrEqual(full.romrams.length);
      expect(kept.romrams.map((r) => r.romram)).toEqual(
        expect.arrayContaining(kept.romrams.map((r) => r.romram).filter((rom) => full.romrams.some((f) => f.romram === rom))),
      );
    }
  });

  it('档位筛选与树内搜索叠加（先档位后搜索）', () => {
    const filtered = filterProductTreeByTier(tree, tier, 'RU');
    const searched = searchProductTree(filtered, ownBrand());
    expect(searched.some((b) => b.key === ownBrand())).toBe(true);
  });
});
