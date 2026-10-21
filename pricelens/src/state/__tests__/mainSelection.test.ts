// ============================================================
// 主分析卡纯函数金测（第一百二十轮）：配额、自动匹配填充、v10/v11 迁移、
// 逐配置成卡、换层颜色映射。卡形 = { id, main: ProductSelection | null, compares }。
// ============================================================
import { describe, expect, it } from 'vitest';
import { dimProduct, dimBenchmark } from '../../data';
import type { MainProduct, ProductSelection } from '../filtersTypes';
import {
  autoComparesFor,
  buildCards,
  cardQuota,
  cardsFromSelections,
  clampMains,
  expandV11Cards,
  flatSelections,
  isHuaweiModel,
  MAINS_CAP,
  MAX_LINES_PER_CHART,
  migrateV10,
  reapplyAuto,
  remapSelection,
  selKey,
  withMain,
} from '../mainSelection';
import { buildProductTree, type RomramNode } from '../../components/ProductCascader/tree';

const ruOwn = dimProduct.find((p) => p.is_own && p.countries.includes('RU'))!;
const ruOwnModel = ruOwn.sku_id.split('__')[0];
const ruOwnRom = ruOwn.romram;
const ownSel: ProductSelection = {
  modelId: ruOwnModel,
  romram: ruOwnRom,
  skuIds: [ruOwn.sku_id],
};

let seq = 0;
const card = (main: ProductSelection | null, compares: ProductSelection[] = []): MainProduct => ({
  id: `t${(seq += 1)}`,
  main,
  compares,
});

/** n 个互不同组的该国竞品勾选（按 selKey 去重收集） */
const distinctComps = (n: number): ProductSelection[] => {
  const out: ProductSelection[] = [];
  const seen = new Set<string>();
  for (const p of dimProduct) {
    if (p.is_own || !p.countries.includes('RU')) continue;
    const key = `${p.sku_id.split('__')[0]}|${p.romram.replace(/\s+/g, '')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ modelId: p.sku_id.split('__')[0], romram: p.romram, skuIds: [p.sku_id] });
    if (out.length >= n) break;
  }
  return out;
};

describe('cardQuota（一张图 ≤8 条产品线，选择时收口）', () => {
  it('有主品 = 7（主品占 1 线）；空对 = 8', () => {
    expect(cardQuota({ main: ownSel })).toBe(MAX_LINES_PER_CHART - 1);
    expect(cardQuota({ main: null })).toBe(MAX_LINES_PER_CHART);
  });
});

describe('withMain（空对补选 / 换主品：对比区随新配额收口）', () => {
  it('空对挂满 8 条对比后补主品 → 对比区截到 7 条，前 7 条原样保留', () => {
    const comps8 = distinctComps(8);
    expect(comps8).toHaveLength(8);
    const out = withMain(card(null, comps8), ownSel);
    expect(out.main).toEqual(ownSel);
    expect(out.compares).toHaveLength(7);
    expect(out.compares).toEqual(comps8.slice(0, 7));
  });

  it('对比区含与新主品同型号同配置的项 → 剔除后再截配额', () => {
    const comps = distinctComps(7);
    const out = withMain(card(null, [ownSel, ...comps]), ownSel);
    expect(out.compares.some((c) => selKey(c) === selKey(ownSel))).toBe(false);
    expect(out.compares).toEqual(comps);
  });

  it('换主品：与新主品同配置的旧对比项不再重复占线', () => {
    const comps = distinctComps(2);
    const out = withMain(card(ownSel, comps), comps[0]);
    expect(out.main).toEqual(comps[0]);
    expect(out.compares.some((c) => selKey(c) === selKey(comps[0]))).toBe(false);
  });
});

describe('buildCards（跨页建卡正源：去重 / 封顶 / 首卡对比继承）', () => {
  const synth = (i: number): ProductSelection => ({ modelId: `bm${i}`, romram: '8+128 GB', skuIds: [`bm${i}__8+128`] });

  it('按 selKey 去重、保序', () => {
    const cards = buildCards([synth(1), synth(2), synth(1)]);
    expect(cards).toHaveLength(2);
    expect(cards.map((c) => c.main?.modelId)).toEqual(['bm1', 'bm2']);
  });

  it('超过 MAINS_CAP 的 selection → 封顶 MAINS_CAP 张卡', () => {
    expect(buildCards(Array.from({ length: MAINS_CAP + 4 }, (_, i) => synth(i)))).toHaveLength(MAINS_CAP);
  });

  it('首卡继承 firstCompares：9+1 条 → 截到卡配额，与主品同组者剔除；其余卡落空', () => {
    const comps9 = distinctComps(9);
    const cards = buildCards([ownSel, synth(1)], { firstCompares: [...comps9, ownSel] });
    expect(cards).toHaveLength(2);
    expect(cards[0].compares).toHaveLength(cardQuota(cards[0]));
    expect(cards[0].compares.some((c) => selKey(c) === selKey(ownSel))).toBe(false);
    expect(cards[1].compares).toEqual([]);
  });

  it('autoMatch：卡对比区按矩阵带出（矩阵未覆盖的型号为空）', () => {
    const cards = buildCards([ownSel, synth(1)], { autoMatch: true });
    expect(cards[0].compares).toEqual(autoComparesFor(cards[0]));
    expect(cards[1].compares).toEqual([]);
  });
});

describe('autoComparesFor（矩阵 → 剔除自身 → 配额截断）', () => {
  it('华为主品卡产出矩阵对比且 ≤ 配额、不含主品自身配置', () => {
    const c = card(ownSel);
    const comps = autoComparesFor(c);
    expect(comps.length).toBeGreaterThan(0);
    expect(comps.length).toBeLessThanOrEqual(cardQuota(c));
    expect(comps.every((x) => selKey(x) !== selKey(ownSel))).toBe(true);
    // 首个对比 = 该国矩阵 sort 序的主对标（country_code 过滤，与 benchmarkSkuIdsFor 同口径）
    const rows = dimBenchmark
      .filter((b) => b.own_model_id === ruOwnModel && b.own_romram === ruOwnRom && (b.country_code == null || b.country_code === 'RU'))
      .sort((a, b) => a.sort - b.sort);
    if (rows.length) {
      expect(comps[0].modelId).toBe(rows[0].competitor_sku_id.split('__')[0]);
    }
  });

  it('空对（main = null）产出空对比区', () => {
    expect(autoComparesFor(card(null))).toEqual([]);
  });
});

describe('reapplyAuto（自动跟随：华为主品卡重算、非华为主品卡与空对不动）', () => {
  it('华为卡对比区被矩阵产出替换；竞品卡与空对的手动对比区保留', () => {
    const comp = dimProduct.find((p) => !p.is_own && p.countries.includes('RU'))!;
    const compModel = comp.sku_id.split('__')[0];
    const manualCompare: ProductSelection = { modelId: compModel, romram: comp.romram, skuIds: [comp.sku_id] };
    const compSel: ProductSelection = { modelId: compModel, romram: comp.romram, skuIds: [comp.sku_id] };
    const out = reapplyAuto([
      card(ownSel, [manualCompare]),
      card(compSel, [ownSel]),
      card(null, [ownSel]),
    ]);
    expect(out[0].compares.every((c) => c.modelId !== compModel)).toBe(true); // 矩阵产出替换手动挑选
    expect(out[1].compares).toEqual([ownSel]); // 非华为主品卡不动
    expect(out[2].compares).toEqual([ownSel]); // 空对不动
    expect(isHuaweiModel(ruOwnModel)).toBe(true);
    expect(isHuaweiModel(compModel)).toBe(false);
  });
});

describe('migrateV10（own/competitors → 逐配置卡）', () => {
  it('自动模式：逐卡按矩阵重算', () => {
    const cards = migrateV10([ownSel], [], true);
    expect(cards).toHaveLength(1);
    expect(cards[0].main).toEqual(ownSel);
    expect(cards[0].compares.length).toBeGreaterThan(0);
  });

  it('手动模式：矩阵命中优先、同容量 fallback、卡配额截断', () => {
    const comps = autoComparesFor(card(ownSel));
    const foreign = dimProduct.find(
      (p) => !p.is_own && p.countries.includes('RU') && p.romram.replace(/\s+/g, '') === comps[0]?.romram.replace(/\s+/g, '') && !comps.some((c) => c.modelId === p.sku_id.split('__')[0]),
    );
    const globalComps = foreign ? [comps[0], { modelId: foreign.sku_id.split('__')[0], romram: foreign.romram, skuIds: [foreign.sku_id] }] : comps;
    const cards = migrateV10([ownSel], globalComps, false);
    expect(cards[0].compares[0].modelId).toBe(comps[0].modelId); // 矩阵命中在前
    expect(cards[0].compares.some((c) => c.modelId === globalComps[globalComps.length - 1].modelId)).toBe(true); // 同容量 fallback 补位
    expect(cards[0].compares.length).toBeLessThanOrEqual(cardQuota(cards[0]));
  });

  it('纯竞品视角（own 空）：竞品逐组成卡、无对比、卡数封顶', () => {
    const compSels: ProductSelection[] = dimProduct
      .filter((p) => !p.is_own && p.countries.includes('RU'))
      .slice(0, 12)
      .map((p) => ({ modelId: p.sku_id.split('__')[0], romram: p.romram, skuIds: [p.sku_id] }));
    const cards = migrateV10([], compSels, true);
    expect(cards.length).toBeLessThanOrEqual(MAINS_CAP);
    expect(cards.every((c) => c.compares.length === 0)).toBe(true);
    expect(cards.every((c) => c.main != null)).toBe(true);
  });
});

describe('expandV11Cards（v11 卡 configs[] → 逐配置卡）', () => {
  // 取 RU 手机里首个有 ≥2 配置的华为型号（单配置型号展不开，验证不了「其余配置卡」）
  const multiModel = (() => {
    const byModel = new Map<string, Set<string>>();
    for (const p of dimProduct) {
      if (!p.is_own || !p.countries.includes('RU') || p.industry !== 'phone') continue;
      const m = p.sku_id.split('__')[0];
      const s = byModel.get(m) ?? new Set<string>();
      s.add(p.romram);
      byModel.set(m, s);
    }
    return [...byModel.entries()].find(([, s]) => s.size >= 2)?.[0] ?? ruOwnModel;
  })();
  const modelRows = dimProduct.filter((p) => p.sku_id.startsWith(multiModel + '__') && p.countries.includes('RU'));
  const roms = [...new Set(modelRows.map((p) => p.romram))].slice(0, 3);
  const configs = roms.map((r) => {
    const row = modelRows.find((p) => p.romram === r)!;
    return { modelId: multiModel, romram: r, skuIds: [row.sku_id] };
  });
  const keep: ProductSelection = { modelId: 'keep-x', romram: '8+128 GB', skuIds: ['keep-x__8+128'] };

  it('手动模式：首配置卡继承对比区，其余配置卡落空', () => {
    const cards = expandV11Cards([{ modelId: multiModel, configs, compares: [keep] }], false);
    expect(cards).toHaveLength(configs.length);
    expect(cards[0].compares).toEqual([keep]);
    expect(cards.slice(1).every((c) => c.compares.length === 0)).toBe(true);
    expect(cards.every((c) => c.main != null)).toBe(true);
  });

  it('首配置卡继承对比区时剔除与主品同型号同配置项并截配额（与 withMain / buildCards 同口径）', () => {
    // 旧 v11 对比区里混进与首配置同组的项（空格变体也算同组）
    const sameAsMain: ProductSelection = { ...configs[0], romram: configs[0].romram.replace(/\s+/g, ' ') + ' ' };
    const extras = Array.from({ length: MAX_LINES_PER_CHART + 2 }, (_, i) => ({ modelId: `x${i}`, romram: '8+128 GB', skuIds: [`x${i}__8+128`] }));
    const cards = expandV11Cards([{ modelId: multiModel, configs, compares: [sameAsMain, keep, ...extras] }], false);
    expect(cards[0].compares.some((c) => selKey(c) === selKey(configs[0]))).toBe(false);
    expect(cards[0].compares[0]).toEqual(keep);
    expect(cards[0].compares).toHaveLength(cardQuota(cards[0]));
  });

  it('自动模式：其余配置卡按矩阵补齐；同配置去重', () => {
    const dup = [...configs, configs[0]];
    const cards = expandV11Cards([{ modelId: multiModel, configs: dup, compares: [] }], true);
    expect(cards).toHaveLength(configs.length);
    expect(configs.length).toBeGreaterThan(1);
    expect(cards[1].compares).toEqual(autoComparesFor(cards[1]));
  });

  it('卡数封顶 MAINS_CAP', () => {
    const many = Array.from({ length: MAINS_CAP + 4 }, (_, i) => ({ modelId: `m${i}`, romram: '8+128 GB', skuIds: [`m${i}__8+128`] }));
    expect(expandV11Cards(many.map((sel) => ({ modelId: sel.modelId, configs: [sel], compares: [] })), false)).toHaveLength(MAINS_CAP);
  });
});

describe('cardsFromSelections / flatSelections / clampMains', () => {
  it('勾选组逐组成卡（同组去重、保序）', () => {
    const comp2 = dimProduct.find((p) => !p.is_own && p.countries.includes('RU') && p.sku_id !== dimProduct.find((q) => !q.is_own)!.sku_id)!;
    const cards = cardsFromSelections([ownSel, { modelId: comp2.sku_id.split('__')[0], romram: comp2.romram, skuIds: [comp2.sku_id] }, ownSel]);
    expect(cards).toHaveLength(2);
    expect(cards[0].main).toEqual(ownSel);
  });

  it('合并图并集按卡序去重，主品优先于对比区', () => {
    const comp = dimProduct.find((p) => !p.is_own && p.countries.includes('RU'))!;
    const compSel: ProductSelection = { modelId: comp.sku_id.split('__')[0], romram: comp.romram, skuIds: [comp.sku_id] };
    const { mainSels, compareSels } = flatSelections([
      card(ownSel, [compSel]),
      card(compSel, [ownSel]),
    ]);
    expect(mainSels).toHaveLength(2);
    expect(compareSels).toHaveLength(0); // 都已作为主品出现
  });

  it('clampMains 截对比区到卡配额、卡数到 MAINS_CAP', () => {
    const comps = autoComparesFor(card(ownSel));
    const over = card(ownSel, [...comps, ...comps, ...comps]);
    const clamped = clampMains([over]);
    expect(clamped[0].main).toEqual(ownSel);
    expect(clamped[0].compares.length).toBeLessThanOrEqual(cardQuota(clamped[0]));
    const many = Array.from({ length: MAINS_CAP + 3 }, () => card(ownSel));
    expect(clampMains(many)).toHaveLength(MAINS_CAP);
  });
});

describe('remapSelection（换配置/换产品的颜色映射）', () => {
  const treeModels = buildProductTree('phone', 'RU').flatMap((b) => b.series).flatMap((s) => s.models);
  const nodeOf = (modelId: string, romram: string): RomramNode | undefined =>
    treeModels.find((m) => m.modelId === modelId)?.romrams.find((r) => r.romram === romram);

  it('同色名优先映射同色 SKU；无同色回默认最低价色', () => {
    const proMax = dimProduct.find((p) => p.is_own && p.industry === 'phone' && p.model_name === 'Pura 90s Pro Max')!;
    const fromId = proMax.sku_id.split('__')[0];
    const oldNode = nodeOf(fromId, proMax.romram)!;
    const oldSel: ProductSelection = { modelId: fromId, romram: proMax.romram, skuIds: [oldNode.colors[0].skuId] };
    // 同产品换配置：颜色名在新配置存在 → 同色
    const modelNode = treeModels.find((m) => m.modelId === fromId)!;
    const target = modelNode.romrams.find((r) => r.romram !== oldNode.romram);
    if (target) {
      const out = remapSelection(oldSel, oldNode, target);
      expect(out.modelId).toBe(fromId);
      expect(out.romram).toBe(target.romram);
      const oldColor = oldNode.colors[0].color.toLowerCase();
      const newNode = nodeOf(fromId, target.romram)!;
      if (newNode.colors.some((c) => c.color.toLowerCase() === oldColor)) {
        expect(newNode.colors.find((c) => c.skuId === out.skuIds[0])!.color.toLowerCase()).toBe(oldColor);
      } else {
        expect(target.selectableColors.length ? target.selectableColors : target.colors).toContainEqual(
          expect.objectContaining({ skuId: out.skuIds[0] }),
        );
      }
    }
  });

  it('换产品落地：型号+颜色均来自目标配置节点', () => {
    const a = dimProduct.find((p) => p.is_own && p.industry === 'phone' && p.model_name === 'Pura 80 Ultra')!;
    const b = dimProduct.find((p) => p.is_own && p.industry === 'phone' && p.model_name === 'Pura 80')!;
    const fromId = a.sku_id.split('__')[0];
    const toId = b.sku_id.split('__')[0];
    const bRow = dimProduct.find((p) => p.sku_id.startsWith(toId + '__'))!;
    const oldNode = nodeOf(fromId, a.romram)!;
    const target = nodeOf(toId, bRow.romram)!;
    const out = remapSelection({ modelId: fromId, romram: a.romram, skuIds: [a.sku_id] }, oldNode, target);
    expect(out.modelId).toBe(toId);
    expect(out.romram).toBe(bRow.romram);
    expect(target.colors.some((c) => c.skuId === out.skuIds[0])).toBe(true);
  });
});
