// ============================================================
// 主分析卡纯函数金测（第一百二十轮）：自动匹配填充、v10/v11 迁移、逐配置成卡、
// 换层颜色映射。卡形 = { id, main: ProductSelection | null, compares }。
// 2026-11-27（取消上限 + 来源并集）：原「卡配额 7/8 条、卡数封顶 8、clampMains
// 截断、开关开启即整体替换对比区」等断言与确认目标正面冲突——按新契约改写为
// 「不截断 / 并集保留」（用例保留、断言换向），并新增来源并集专项用例。
// ============================================================
import { describe, expect, it } from 'vitest';
import { dimProduct, dimBenchmark, dimChannel } from '../../data';
import type { MainProduct, ProductSelection } from '../filtersTypes';
import { groupsFromBenchmark } from '../configStore';
import {
  autoComparesFor,
  buildCards,
  cardsFromSelections,
  compareSourcesOf,
  expandV11Cards,
  flatSelections,
  isHuaweiModel,
  migrateV10,
  remapMainsForScope,
  remapSelection,
  remapSelectionForCountry,
  restoreAutoOn,
  selKey,
  selectionValidFor,
  tidyMains,
  toggleAllAuto,
  toggleCardAuto,
  userCompareSourcesOf,
  withAutoOn,
  withCompares,
  withComparesAdded,
  withMain,
} from '../mainSelection';
import { buildProductTree, type RomramNode } from '../../components/ProductCascader/tree';

// matrix-only 口径（2026-11-10）：矩阵没覆盖的 own 组不再产出对比行，own 锚不能取
// dimProduct 首个 RU own 行（FreeArc，矩阵无覆盖）——锚定 RU Pura 90s Pro 12+256 GB
// （矩阵 2 行：iPhone 17 / S26，见 dim_benchmark RU 手机组）。
const ruOwn = dimProduct.find(
  (p) => p.is_own && p.model_id === 'own-huawei-pura-90s-pro' && p.countries.includes('RU') && p.romram === '12+256 GB',
)!;
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

describe('对比区无条数上限（2026-11-27：单图 8 线上限退役）', () => {
  it('空对挂满 8 条以上对比后补主品 → 全部保留，不再截到 7 条', () => {
    const comps12 = distinctComps(12);
    expect(comps12).toHaveLength(12);
    const out = withMain(card(null, comps12), ownSel);
    expect(out.main).toEqual(ownSel);
    expect(out.compares).toHaveLength(12);
    expect(out.compares).toEqual(comps12);
  });
});

describe('withMain（空对补选 / 换主品：剔除与新主品同组项，条数不截断）', () => {
  it('空对选满 8 条对比后补主品 → 8 条全部保留（原截到 7 条）', () => {
    const comps8 = distinctComps(8);
    expect(comps8).toHaveLength(8);
    const out = withMain(card(null, comps8), ownSel);
    expect(out.main).toEqual(ownSel);
    expect(out.compares).toHaveLength(8);
    expect(out.compares).toEqual(comps8);
  });

  it('对比区含与新主品同型号同配置的项 → 剔除后其余 8 条全部保留', () => {
    const comps = distinctComps(8);
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

describe('buildCards（跨页建卡正源：去重 / 不封顶 / 首卡对比继承）', () => {
  const synth = (i: number): ProductSelection => ({ modelId: `bm${i}`, romram: '8+128 GB', skuIds: [`bm${i}__8+128`] });

  it('按 selKey 去重、保序', () => {
    const cards = buildCards([synth(1), synth(2), synth(1)]);
    expect(cards).toHaveLength(2);
    expect(cards.map((c) => c.main?.modelId)).toEqual(['bm1', 'bm2']);
  });

  it('任意数量的 selection → 全部成卡（2026-11-27 不封顶，原截到 8 张）', () => {
    expect(buildCards(Array.from({ length: 12 }, (_, i) => synth(i)))).toHaveLength(12);
  });

  it('首卡继承 firstCompares：全部并入不截断、与主品同组者剔除并登记为手动补充；其余卡落空（无自动跟随，autoMatch 选项已退役）', () => {
    const comps9 = distinctComps(9);
    const cards = buildCards([ownSel, synth(1)], { firstCompares: [...comps9, ownSel] });
    expect(cards).toHaveLength(2);
    expect(cards[0].compares).toHaveLength(9);
    expect(cards[0].compares).toEqual(comps9);
    expect(cards[0].compares.some((c) => selKey(c) === selKey(ownSel))).toBe(false);
    expect(userCompareSourcesOf(cards[0])[selKey(comps9[0])]).toBe('manual');
    expect(cards[1].compares).toEqual([]);
    expect(buildCards([ownSel, synth(1)])[1].compares).toEqual([]);
  });
});

describe('autoComparesFor（矩阵 → 剔除自身 → 全量不截断）', () => {
  it('华为主品卡产出矩阵对比全量（不按卡配额截断）、不含主品自身配置', () => {
    const c = card(ownSel);
    const comps = autoComparesFor(c);
    expect(comps.length).toBeGreaterThan(0);
    expect(comps).toEqual(groupsFromBenchmark([ownSel], 'RU').filter((g) => selKey(g) !== selKey(ownSel)));
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

  it('开：矩阵产出并入且原手动对比保留为并集（2026-11-27 起不再整体替换）；再点关：对比区保留转手动', () => {
    expect(isHuaweiModel(ruOwnModel)).toBe(true);
    expect(isHuaweiModel(compModel)).toBe(false);
    const on = toggleCardAuto(card(ownSel, [compSel]));
    expect(on.auto).toBe(true);
    expect(on.compares.map(selKey)).toEqual(expect.arrayContaining([...autoComparesFor(on).map(selKey), selKey(compSel)]));
    expect(new Set(on.compares.map(selKey)).size).toBe(on.compares.length); // 重复项去重
    expect(userCompareSourcesOf(on)[selKey(compSel)]).toBe('manual'); // 原手动项来源保留
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
    // 新主品的矩阵产出全部并入；换主品前卡上的手动补充不因换主品丢失（2026-11-27 并集）
    expect(switched.compares.map(selKey)).toEqual(expect.arrayContaining(autoComparesFor(switched).map(selKey)));
    expect(switched.compares.map(selKey)).toContain(selKey(compSel));
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

  it('纯竞品视角（own 空）：竞品逐组成卡、无对比、卡数不封顶（2026-11-27）', () => {
    const compSels: ProductSelection[] = distinctComps(12);
    const cards = migrateV10([], compSels);
    expect(cards).toHaveLength(12);
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

  it('首配置卡继承对比区时剔除与主品同型号同配置项、条数不截断（与 withMain / buildCards 同口径；2026-11-27）', () => {
    // 旧 v11 对比区里混进与首配置同组的项（空格变体也算同组）
    const sameAsMain: ProductSelection = { ...configs[0], romram: configs[0].romram.replace(/\s+/g, ' ') + ' ' };
    const extras = Array.from({ length: 12 }, (_, i) => ({ modelId: `x${i}`, romram: '8+128 GB', skuIds: [`x${i}__8+128`] }));
    const cards = expandV11Cards([{ modelId: multiModel, configs, compares: [sameAsMain, keep, ...extras] }]);
    expect(cards[0].compares.some((c) => selKey(c) === selKey(configs[0]))).toBe(false);
    expect(cards[0].compares[0]).toEqual(keep);
    expect(cards[0].compares).toHaveLength(13); // keep + 12 条全部保留（原截到 7）
  });

  it('同配置去重；其余配置卡一律落空', () => {
    const dup = [...configs, configs[0]];
    const cards = expandV11Cards([{ modelId: multiModel, configs: dup, compares: [] }]);
    expect(cards).toHaveLength(configs.length);
    expect(configs.length).toBeGreaterThan(1);
    expect(cards[1].compares).toEqual([]);
  });

  it('卡数不封顶（2026-11-27，原截到 8 张）', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ modelId: `m${i}`, romram: '8+128 GB', skuIds: [`m${i}__8+128`] }));
    expect(expandV11Cards(many.map((sel) => ({ modelId: sel.modelId, configs: [sel], compares: [] })))).toHaveLength(12);
  });
});

describe('cardsFromSelections / flatSelections / tidyMains', () => {
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

  it('tidyMains 不截断（2026-11-27，原 clampMains 截到 7 条对比 / 8 张卡）：12 条对比全保留、11 张卡全保留', () => {
    const comps = distinctComps(12);
    const tidied = tidyMains([card(ownSel, comps)]);
    expect(tidied[0].main).toEqual(ownSel);
    expect(tidied[0].compares).toEqual(comps);
    const many = distinctComps(11).map((sel, i) => ({ ...card(sel), id: `m${i}` }));
    expect(tidyMains(many)).toHaveLength(11);
  });

  it('tidyMains 结构收口：对比区内同型号同配置去重、剔除与主品同组项、同主品的重复卡合并', () => {
    const comps = distinctComps(2);
    const dup: MainProduct = { id: 'd', main: comps[0], compares: [comps[1], comps[1], { ...comps[0] }] };
    const out = tidyMains([dup, { id: 'd2', main: comps[0], compares: [] }]);
    expect(out).toHaveLength(1); // 同主品重复卡合并
    expect(out[0].compares.map(selKey)).toEqual([selKey(comps[1])]); // 去重 + 剔除与主品同组
  });
});

/** n 个互不同组的该国手机产业竞品勾选（口径合法化用例要求同产业） */
const distinctPhoneComps = (n: number): ProductSelection[] => {
  const out: ProductSelection[] = [];
  const seen = new Set<string>();
  for (const p of dimProduct) {
    if (p.is_own || p.industry !== 'phone' || !p.countries.includes('RU')) continue;
    const key = `${p.sku_id.split('__')[0]}|${p.romram.replace(/\s+/g, '')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ modelId: p.sku_id.split('__')[0], romram: p.romram, skuIds: [p.sku_id] });
    if (out.length >= n) break;
  }
  return out;
};

describe('对比区来源并集（2026-11-27：矩阵匹配与手动 / 同档推荐并存）', () => {
  const comps = distinctPhoneComps(12);
  const autoCard = (): MainProduct => withAutoOn(card(ownSel));
  const matrixKeys = (c: MainProduct): string[] => autoComparesFor(c).map(selKey);

  it('自动匹配开时加入同档推荐：不改开关、去重、剔除与主品同组者，并登记来源 tier', () => {
    const base = autoCard();
    const [t1, t2] = comps.filter((c) => !matrixKeys(base).includes(selKey(c))).slice(0, 2);
    const next = withComparesAdded(base, [t1, t2, t1, ownSel], 'tier');
    expect(next.auto).toBe(true);
    expect(next.compares.map(selKey)).toEqual([...base.compares.map(selKey), selKey(t1), selKey(t2)]);
    expect(userCompareSourcesOf(next)[selKey(t1)]).toBe('tier');
    expect(userCompareSourcesOf(next)[selKey(t2)]).toBe('tier');
    // 矩阵产出项无登记（来源由矩阵动态判定）
    expect(userCompareSourcesOf(next)[matrixKeys(base)[0]]).toBeUndefined();
    expect(compareSourcesOf(next, matrixKeys(base)[0])).toEqual(['matrix']);
    expect(compareSourcesOf(next, selKey(t1))).toEqual(['tier']);
  });

  it('矩阵重算不删用户补充；已不在矩阵的旧矩阵项退出；excluded 的矩阵项不带回', () => {
    const base = autoCard();
    const [t1] = comps.filter((c) => !matrixKeys(base).includes(selKey(c)));
    const withTier = withComparesAdded(base, [t1], 'tier');
    // 用户移除一条矩阵产出 → 记入 excluded
    const removedKey = matrixKeys(withTier)[0];
    const afterRemove = withCompares(withTier, withTier.compares.filter((c) => selKey(c) !== removedKey));
    expect(afterRemove.auto).toBe(true); // 手动增删不再整体退出自动匹配
    expect(afterRemove.excluded).toEqual([removedKey]);
    // 模拟矩阵更新 / 刷新恢复：重算后 tier 补充仍在、被移除的矩阵项不复活
    const recomputed = withAutoOn(restoreAutoOn([afterRemove])[0]);
    expect(recomputed.compares.map(selKey)).toContain(selKey(t1));
    expect(recomputed.compares.map(selKey)).not.toContain(removedKey);
    // 用户把该矩阵项手动加回 → 解除排除、登记为手动
    const back = withComparesAdded(recomputed, [withTier.compares.find((c) => selKey(c) === removedKey)!], 'manual');
    expect(back.excluded).toBeUndefined();
    expect(userCompareSourcesOf(back)[removedKey]).toBe('manual');
    expect(compareSourcesOf(back, removedKey)).toEqual(['matrix', 'manual']);
  });

  it('withCompares（手动改对比区）：新增登记 manual、调色 / 换序保留来源、顺序以传入为准', () => {
    const base = autoCard();
    const [m1] = comps.filter((c) => !matrixKeys(base).includes(selKey(c)));
    const added = withCompares(base, [...base.compares, m1]);
    expect(added.auto).toBe(true);
    expect(userCompareSourcesOf(added)[selKey(m1)]).toBe('manual');
    const [tier1] = comps.filter((c) => !matrixKeys(base).includes(selKey(c)) && selKey(c) !== selKey(m1));
    const withTier = withComparesAdded(added, [tier1], 'tier');
    // 换序：手动项挪到最前，来源不变
    const reordered = withCompares(withTier, [withTier.compares.find((c) => selKey(c) === selKey(tier1))!, ...withTier.compares.filter((c) => selKey(c) !== selKey(tier1))]);
    expect(reordered.compares[0]).toEqual(withTier.compares.find((c) => selKey(c) === selKey(tier1)));
    expect(userCompareSourcesOf(reordered)[selKey(tier1)]).toBe('tier');
    // 调色：同键不同 skuIds → 来源不变
    const recolored = withCompares(reordered, reordered.compares.map((c) => (selKey(c) === selKey(m1) ? { ...c, skuIds: ['another-color-sku'] } : c)));
    expect(userCompareSourcesOf(recolored)[selKey(m1)]).toBe('manual');
  });

  it('刷新恢复（restoreAutoOn + withAutoOn）：自动匹配被关的卡重新开启时，手动 / 同档推荐补充保留并并回矩阵', () => {
    const base = autoCard();
    const [t1] = comps.filter((c) => !matrixKeys(base).includes(selKey(c)));
    const withTier = withComparesAdded(base, [t1], 'tier');
    const off = withAutoOn(withTier); // 仍开
    expect(off.auto).toBe(true);
    const closed = toggleCardAuto(withTier); // 用户关闭：对比区整体转手动持有
    expect(closed.auto).toBe(false);
    // 持久化读回后强制回 auto=true（默认开逻辑）并重算
    const reloaded = withAutoOn(restoreAutoOn([closed])[0]);
    expect(reloaded.auto).toBe(true);
    expect(reloaded.compares.map(selKey)).toContain(selKey(t1));
    expect(userCompareSourcesOf(reloaded)[selKey(t1)]).toBe('tier'); // 同档推荐不因刷新丢失
    expect(reloaded.compares.map(selKey)).toEqual(expect.arrayContaining(matrixKeys(reloaded)));
  });

  it('换主品：旧主品的排除清单失效；非华为主品无矩阵可依 → 只剩用户补充', () => {
    const base = autoCard();
    const removedKey = matrixKeys(base)[0];
    const afterRemove = withCompares(base, base.compares.filter((c) => selKey(c) !== removedKey));
    expect(afterRemove.excluded).toEqual([removedKey]);
    const compSel = comps[0];
    const toComp = withMain(afterRemove, compSel);
    expect(toComp.auto).toBe(false);
    expect(toComp.excluded).toBeUndefined();
    expect(toComp.compares.map(selKey)).not.toContain(selKey(compSel));
  });

  it('口径合法化（remapMainsForScope）：用户补充登记与排除清单随映射保留', () => {
    const base = autoCard();
    const [t1] = comps.filter((c) => !matrixKeys(base).includes(selKey(c)));
    const withTier = withComparesAdded(base, [t1], 'tier');
    const removedKey = matrixKeys(withTier).find((k) => k !== selKey(t1))!;
    const edited = withCompares(withTier, withTier.compares.filter((c) => selKey(c) !== removedKey));
    const out = remapMainsForScope([edited], 'RU', 'phone')!;
    expect(out).toHaveLength(1);
    expect(out[0].auto).toBe(true);
    expect(userCompareSourcesOf(out[0])[selKey(t1)]).toBe('tier');
    expect(out[0].excluded).toContain(removedKey);
  });

  it('移除一条不在矩阵里的手动补充：只注销该项，不进排除清单、自动匹配保持开启、矩阵产出不动', () => {
    const base = autoCard();
    const [m1] = comps.filter((c) => !matrixKeys(base).includes(selKey(c)));
    const withManual = withComparesAdded(base, [m1], 'manual');
    const after = withCompares(withManual, withManual.compares.filter((c) => selKey(c) !== selKey(m1)));
    expect(after.auto).toBe(true);
    expect(after.compares.map(selKey)).toEqual(base.compares.map(selKey)); // 回到纯矩阵产出
    expect(userCompareSourcesOf(after)[selKey(m1)]).toBeUndefined();
    expect(after.excluded).toBeUndefined(); // 非矩阵项被移除不产生排除记录
  });

  it('withComparesAdded 重复项去重但保留来源：已在对比区的未登记项补登来源（不重复占线）；已登记 / 与主品同组 / 空入参 = 原引用返回', () => {
    const base = autoCard();
    const existing = base.compares[0]; // 未登记的矩阵产出
    const registered = withComparesAdded(base, [existing], 'tier');
    expect(registered.compares.map(selKey)).toEqual(base.compares.map(selKey)); // 不重复占线
    expect(userCompareSourcesOf(registered)[selKey(existing)]).toBe('tier');
    // 此后矩阵重算把它移出矩阵，它作为用户补充仍在
    expect(withAutoOn(registered).compares.map(selKey)).toContain(selKey(existing));
    expect(withComparesAdded(registered, [existing], 'manual')).toBe(registered); // 已登记 = 不改写来源
    expect(withComparesAdded(base, [ownSel], 'tier')).toBe(base);
    expect(withComparesAdded(base, [], 'tier')).toBe(base);
  });

  it('全局开关（toggleAllAuto）遇用户补充：关 = 全部保留并转手动（同档推荐标签不丢）；再开 = 并回矩阵', () => {
    const base = autoCard();
    const [t1] = comps.filter((c) => !matrixKeys(base).includes(selKey(c)));
    const withTier = withComparesAdded(base, [t1], 'tier');
    const [off] = toggleAllAuto([withTier]);
    expect(off.auto).toBe(false);
    expect(off.compares.map(selKey)).toEqual(withTier.compares.map(selKey));
    expect(userCompareSourcesOf(off)[selKey(t1)]).toBe('tier');
    const [onAgain] = toggleAllAuto([off]);
    expect(onAgain.auto).toBe(true);
    expect(onAgain.compares.map(selKey)).toEqual(expect.arrayContaining([...matrixKeys(onAgain), selKey(t1)]));
    expect(new Set(onAgain.compares.map(selKey)).size).toBe(onAgain.compares.length);
  });

  it('矩阵重算保持用户换过的顺序：既有条目相对顺序不变，新出现的矩阵项按矩阵序追加在后', () => {
    const base = autoCard();
    expect(base.compares.length).toBeGreaterThanOrEqual(2); // 该主品矩阵至少两条对标
    const reordered = withCompares(base, [...base.compares].reverse());
    // 模拟矩阵更新 / 刷新后的重算：顺序沿用用户现状，不被矩阵序覆盖
    const recomputed = withAutoOn(restoreAutoOn([reordered])[0]);
    expect(recomputed.compares.map(selKey)).toEqual(reordered.compares.map(selKey));
    // 新增的补充排在既有条目之后
    const [t1] = comps.filter((c) => !matrixKeys(base).includes(selKey(c)));
    expect(withComparesAdded(recomputed, [t1], 'tier').compares.slice(-1)[0]).toEqual(t1);
  });

  it('来源展示（compareSourcesOf）：矩阵 + 手动并存项同时标出两种来源；自动匹配关后矩阵项不再标「矩阵」', () => {
    const base = autoCard();
    const matrixKey = matrixKeys(base)[0];
    const both = withComparesAdded(base, [base.compares.find((c) => selKey(c) === matrixKey)!], 'manual');
    expect(both.compares.map(selKey).filter((k) => k === matrixKey)).toHaveLength(1); // 不重复占线
    expect(compareSourcesOf(both, matrixKey)).toEqual(['matrix', 'manual']);
    expect(compareSourcesOf(toggleCardAuto(both), matrixKey)).toEqual(['manual']);
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

// ============================================================
// t428u R4-m1（四审增量）：跨口径映射的多 SKU 过滤与 selKey 去重。
// 数据事实：Mate X6 12+512GB 仅 ES/FR/IT/RU/TR；ID 只有 16+512GB（black）；
// nova 14 Pro 12+512GB 的 black/white 中 white 仅 MX/RU/SA。
// ============================================================
describe('remapSelectionForCountry（R4-m1：多 SKU 过滤所有无效 SKU / 整配置口径 / platform 保留）', () => {
  const mateX6 = 'own-huawei-mate-x6';
  const ru12 = dimProduct.find((p) => p.model_id === mateX6 && p.romram === '12+512 GB')!;
  const id16 = dimProduct.find((p) => p.model_id === mateX6 && p.romram === '16+512 GB' && p.countries.includes('ID'))!;

  it('精确配置在目标国：多 SKU 只保留有效子集，不能任一命中就整组保留', () => {
    const sel: ProductSelection = { modelId: mateX6, romram: '16+512 GB', skuIds: [id16.sku_id, ru12.sku_id] };
    const out = remapSelectionForCountry(sel, 'ID', 'phone');
    expect(out).not.toBeNull();
    expect(out!.romram).toBe('16+512 GB');
    expect(out!.skuIds).toEqual([id16.sku_id]);
  });

  it('精确配置 SKU 全无效：回落同色（缺失回落最低价色）单 SKU，配置不漂移', () => {
    const sel: ProductSelection = { modelId: mateX6, romram: '16+512 GB', skuIds: [ru12.sku_id] };
    const out = remapSelectionForCountry(sel, 'ID', 'phone');
    expect(out).not.toBeNull();
    expect(out!.romram).toBe('16+512 GB');
    expect(out!.skuIds).toEqual([id16.sku_id]);
  });

  it('整配置口径（skuIds 空）在目标国有效：原样返回（引用不变）', () => {
    const sel: ProductSelection = { modelId: mateX6, romram: '16+512 GB', skuIds: [] };
    expect(remapSelectionForCountry(sel, 'ID', 'phone')).toBe(sel);
  });

  it('配置在目标国不存在：同型号映射首个合法配置（RU 12+512 → ID 16+512）', () => {
    const sel: ProductSelection = { modelId: mateX6, romram: '12+512 GB', skuIds: [ru12.sku_id] };
    const out = remapSelectionForCountry(sel, 'ID', 'phone');
    expect(out).not.toBeNull();
    expect(out!.romram).toBe('16+512 GB');
    expect(out!.skuIds).toEqual([id16.sku_id]);
  });

  it('型号整体缺席目标国 = null（调用方安全回落默认）', () => {
    const sel: ProductSelection = { modelId: mateX6, romram: '12+512 GB', skuIds: [ru12.sku_id] };
    expect(remapSelectionForCountry(sel, 'DE', 'phone')).toBeNull();
  });

  it('取价口径 platform 随映射保留但按目标国逐线归一（R3-M3：跨国不再 spread 残留源国渠道）', () => {
    // 源国渠道口径（JD 不在 RU/ID 渠道表）→ 目标国不可落地，该线回自动（null）
    const foreign = { platforms: ['JD'], shopIds: [], seller: null };
    const selForeign: ProductSelection = { modelId: mateX6, romram: '12+512 GB', skuIds: [ru12.sku_id], platform: foreign };
    expect(remapSelectionForCountry(selForeign, 'ID', 'phone')?.platform).toBeNull();
    // 目标国可落地口径原样保留（引用不变）；同国映射同样原样保留
    const idChannel = dimChannel.find((c) => c.country_code === 'ID');
    const valid = { platforms: [], shopIds: [idChannel!.channel_id], seller: null };
    const selValid: ProductSelection = { modelId: mateX6, romram: '16+512 GB', skuIds: [], platform: valid };
    expect(remapSelectionForCountry(selValid, 'ID', 'phone')?.platform).toBe(valid);
    expect(remapSelectionForCountry(selValid, 'ID', 'phone')).toBe(selValid);
  });
});

describe('remapMainsForScope（R4-m1：映射合并按 selKey 去重 / 对比区清理 / 空对保留）', () => {
  const mateX6 = 'own-huawei-mate-x6';
  const ru12 = dimProduct.find((p) => p.model_id === mateX6 && p.romram === '12+512 GB')!;
  const id16 = dimProduct.find((p) => p.model_id === mateX6 && p.romram === '16+512 GB' && p.countries.includes('ID'))!;
  const ruSel: ProductSelection = { modelId: mateX6, romram: '12+512 GB', skuIds: [ru12.sku_id] };
  const idSel: ProductSelection = { modelId: mateX6, romram: '16+512 GB', skuIds: [id16.sku_id] };

  it('两张卡重映射到同型号同配置（RU 12+512 ×2 → ID 16+512）合并为一卡', () => {
    const mains: MainProduct[] = [
      { id: 'card-a', main: ruSel, compares: [] },
      { id: 'card-b', main: { ...ruSel, skuIds: [ru12.sku_id] }, compares: [] },
    ];
    const out = remapMainsForScope(mains, 'ID', 'phone');
    expect(out).not.toBeNull();
    expect(out!.length).toBe(1);
    expect(selKey(out![0].main!)).toBe(selKey(idSel));
  });

  it('映射后对比区逐条合法化、去重并排除与主品同组（R4-S1：compare 不重复占线）；空对卡原样保留', () => {
    // compare#1 = 与主品同组的 RU 12+512（映射后与主品同 selKey）、compare#2 = ID 16+512
    // （主品映射后也是 16+512 → 同组剔除）、compare#3 = 主品缺席国仍合法的第三方型号
    const legalThird = dimProduct.find((p) => p.model_id !== mateX6 && p.industry === 'phone' && p.countries.includes('ID'))!;
    const thirdSel: ProductSelection = { modelId: legalThird.model_id, romram: legalThird.romram, skuIds: [legalThird.sku_id] };
    const mains: MainProduct[] = [
      { id: 'card-a', main: ruSel, compares: [ruSel, idSel, thirdSel] },
      { id: 'card-empty', main: null, compares: [idSel] },
    ];
    const out = remapMainsForScope(mains, 'ID', 'phone')!;
    expect(out.length).toBe(2);
    // 与重映射后主品同组的 compare（含显式传入的 16+512）一律剔除，不留重复占线
    expect(out[0].compares.map((c) => selKey(c))).toEqual([selKey(thirdSel)]);
    expect(out[0].main).not.toBeNull();
    expect(selKey(out[0].main!)).toBe(selKey(idSel));
    expect(out[1].main).toBeNull();
    expect(out[1].compares.length).toBe(1);
    expect(selectionValidFor(out[1].compares[0], 'ID', 'phone')).toBe(true);
  });

  it('全部型号整体缺席目标国 = null', () => {
    const mains: MainProduct[] = [{ id: 'card-a', main: ruSel, compares: [] }];
    expect(remapMainsForScope(mains, 'DE', 'phone')).toBeNull();
  });
});
