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
  remapSelection,
  selKey,
  toggleAllAuto,
  toggleCardAuto,
  withAutoOn,
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

  it('匹配竞品默认开（第一百三十一轮）：空对（无对比）补选华为主品 = 自动开（对比区 = 矩阵产出）', () => {
    const out = withMain(card(null), ownSel);
    expect(out.auto).toBe(true);
    expect(out.compares).toEqual(autoComparesFor(out));
    expect(out.compares.length).toBeGreaterThan(0);
  });

  it('匹配竞品默认开：已有手动对比内容的卡落主品不翻案（保持手动、对比区原样）', () => {
    const comps = distinctComps(3);
    const out = withMain(card(null, comps), ownSel);
    expect(out.auto).toBeUndefined();
    expect(out.compares).toEqual(comps);
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

  it('首卡继承 firstCompares：9+1 条 → 截到卡配额，与主品同组者剔除；其余卡落空（无自动跟随，autoMatch 选项已退役）', () => {
    const comps9 = distinctComps(9);
    const cards = buildCards([ownSel, synth(1)], { firstCompares: [...comps9, ownSel] });
    expect(cards).toHaveLength(2);
    expect(cards[0].compares).toHaveLength(cardQuota(cards[0]));
    expect(cards[0].compares.some((c) => selKey(c) === selKey(ownSel))).toBe(false);
    expect(cards[1].compares).toEqual([]);
    expect(buildCards([ownSel, synth(1)])[1].compares).toEqual([]);
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

describe('自动匹配开关（withAutoOn/Off + toggleCardAuto/toggleAllAuto，第一百二十八轮）', () => {
  const comp = dimProduct.find((p) => !p.is_own && p.countries.includes('RU'))!;
  const compModel = comp.sku_id.split('__')[0];
  const compSel: ProductSelection = { modelId: compModel, romram: comp.romram, skuIds: [comp.sku_id] };

  it('开：对比区按矩阵重算并置 auto；再点关：对比区保留转手动', () => {
    expect(isHuaweiModel(ruOwnModel)).toBe(true);
    expect(isHuaweiModel(compModel)).toBe(false);
    const on = toggleCardAuto(card(ownSel, [compSel]));
    expect(on.auto).toBe(true);
    expect(on.compares).toEqual(autoComparesFor(on));
    const off = toggleCardAuto(on);
    expect(off.auto).toBe(false);
    expect(off.compares).toEqual(on.compares);
  });

  it('非华为主品卡与空对无法开启（无矩阵可依，原样返回）', () => {
    const compCard = card(compSel, [ownSel]);
    expect(withAutoOn(compCard)).toEqual(compCard);
    expect(withAutoOn(card(null, [ownSel])).auto).toBeUndefined();
  });

  it('toggleAllAuto：全部华为卡都在开 → 全部关；否则全部开；非华为/空对不动', () => {
    const compCard = card(compSel, [ownSel]);
    const nullCard = card(null, [ownSel]);
    const on = toggleAllAuto([card(ownSel, [compSel]), card(ownSel, []), compCard, nullCard]);
    expect(on[0].auto).toBe(true);
    expect(on[1].auto).toBe(true);
    expect(on[1].compares).toEqual(autoComparesFor(on[1]));
    expect(on[2]).toEqual(compCard); // 非华为主品卡不动
    expect(on[3]).toEqual(nullCard); // 空对不动
    const off = toggleAllAuto(on);
    expect(off[0].auto).toBe(false);
    expect(off[0].compares).toEqual(on[0].compares); // 关 = 保留转手动
    expect(off[1].auto).toBe(false);
    expect(off[2]).toEqual(compCard);
  });

  it('withMain：自动卡换主品按新主品矩阵重算；换非华为主品退回手动', () => {
    const autoCard = withAutoOn(card(ownSel, [compSel]));
    const own2Row =
      dimProduct.find((p) => p.is_own && p.countries.includes('RU') && p.sku_id.split('__')[0] !== ruOwnModel) ?? ruOwn;
    const own2Sel: ProductSelection = {
      modelId: own2Row.sku_id.split('__')[0],
      romram: own2Row.romram,
      skuIds: [own2Row.sku_id],
    };
    const switched = withMain(autoCard, own2Sel);
    expect(switched.auto).toBe(true);
    expect(switched.compares).toEqual(autoComparesFor(switched));
    const toComp = withMain(autoCard, compSel);
    expect(toComp.auto).toBe(false);
  });

  it('buildCards auto:true：华为主品卡建卡即开（对比区 = 矩阵产出）；非华为卡不开', () => {
    const cards = buildCards([ownSel], { auto: true, firstCompares: [compSel] });
    expect(cards[0].auto).toBe(true);
    expect(cards[0].compares).toEqual(autoComparesFor(cards[0])); // auto 优先于 firstCompares
    const compCards = buildCards([compSel], { auto: true });
    expect(compCards[0].auto).toBeUndefined();
    expect(compCards[0].compares).toEqual([]);
  });
});

describe('migrateV10（own/competitors → 逐配置卡，对比区按现行矩阵重算）', () => {
  it('逐卡按矩阵重算', () => {
    const cards = migrateV10([ownSel], []);
    expect(cards).toHaveLength(1);
    expect(cards[0].main).toEqual(ownSel);
    expect(cards[0].compares).toEqual(autoComparesFor(cards[0]));
    expect(cards[0].compares.length).toBeGreaterThan(0);
  });

  it('纯竞品视角（own 空）：竞品逐组成卡、无对比、卡数封顶', () => {
    const compSels: ProductSelection[] = dimProduct
      .filter((p) => !p.is_own && p.countries.includes('RU'))
      .slice(0, 12)
      .map((p) => ({ modelId: p.sku_id.split('__')[0], romram: p.romram, skuIds: [p.sku_id] }));
    const cards = migrateV10([], compSels);
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

  it('首配置卡继承对比区，其余配置卡落空（无自动跟随）', () => {
    const cards = expandV11Cards([{ modelId: multiModel, configs, compares: [keep] }]);
    expect(cards).toHaveLength(configs.length);
    expect(cards[0].compares).toEqual([keep]);
    expect(cards.slice(1).every((c) => c.compares.length === 0)).toBe(true);
    expect(cards.every((c) => c.main != null)).toBe(true);
  });

  it('首配置卡继承对比区时剔除与主品同型号同配置项并截配额（与 withMain / buildCards 同口径）', () => {
    // 旧 v11 对比区里混进与首配置同组的项（空格变体也算同组）
    const sameAsMain: ProductSelection = { ...configs[0], romram: configs[0].romram.replace(/\s+/g, ' ') + ' ' };
    const extras = Array.from({ length: MAX_LINES_PER_CHART + 2 }, (_, i) => ({ modelId: `x${i}`, romram: '8+128 GB', skuIds: [`x${i}__8+128`] }));
    const cards = expandV11Cards([{ modelId: multiModel, configs, compares: [sameAsMain, keep, ...extras] }]);
    expect(cards[0].compares.some((c) => selKey(c) === selKey(configs[0]))).toBe(false);
    expect(cards[0].compares[0]).toEqual(keep);
    expect(cards[0].compares).toHaveLength(cardQuota(cards[0]));
  });

  it('同配置去重；其余配置卡一律落空', () => {
    const dup = [...configs, configs[0]];
    const cards = expandV11Cards([{ modelId: multiModel, configs: dup, compares: [] }]);
    expect(cards).toHaveLength(configs.length);
    expect(configs.length).toBeGreaterThan(1);
    expect(cards[1].compares).toEqual([]);
  });

  it('卡数封顶 MAINS_CAP', () => {
    const many = Array.from({ length: MAINS_CAP + 4 }, (_, i) => ({ modelId: `m${i}`, romram: '8+128 GB', skuIds: [`m${i}__8+128`] }));
    expect(expandV11Cards(many.map((sel) => ({ modelId: sel.modelId, configs: [sel], compares: [] })))).toHaveLength(MAINS_CAP);
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
