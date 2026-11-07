// ============================================================
// 主分析卡纯函数金测（第一百二十轮）：配额、自动匹配填充、v10/v11 迁移、
// 逐配置成卡、换层颜色映射。卡形 = { id, main: ProductSelection | null, compares }。
// ============================================================
import { describe, expect, it } from 'vitest';
import { dimProduct, dimBenchmark, dimChannel } from '../../data';
import type { MainProduct, ProductSelection } from '../filtersTypes';
import {
  autoComparesFor,
  buildCards,
  cardQuota,
  cardsFromSelections,
  clampMains,
  COMPARES_PER_CARD_CAP,
  expandV11Cards,
  flatSelections,
  isHuaweiModel,
  MAINS_CAP,
  MAX_LINES_PER_CHART,
  migrateV10,
  remapMainsForScope,
  remapSelection,
  remapSelectionForCountry,
  selKey,
  selectionValidFor,
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

describe('cardQuota（每组对比 ≤3 款，选择时收口；2026-11-02 Eason 硬性限制）', () => {
  it('有主品 / 空对均 = 3（对比硬上限比折线上限更紧，主品占线不再决定配额）', () => {
    expect(COMPARES_PER_CARD_CAP).toBe(3);
    expect(cardQuota({ main: ownSel })).toBe(COMPARES_PER_CARD_CAP);
    expect(cardQuota({ main: null })).toBe(COMPARES_PER_CARD_CAP);
    // 1 主品 + 3 对比 仍在单图折线上限内（MAX_LINES_PER_CHART 语义不变）
    expect(1 + cardQuota({ main: ownSel })).toBeLessThanOrEqual(MAX_LINES_PER_CHART);
  });
});

describe('withMain（空对补选 / 换主品：对比区随新配额收口）', () => {
  it('空对挂满 8 条对比后补主品 → 对比区截到 3 条，前 3 条原样保留', () => {
    const comps8 = distinctComps(8);
    expect(comps8).toHaveLength(8);
    const out = withMain(card(null, comps8), ownSel);
    expect(out.main).toEqual(ownSel);
    expect(out.compares).toHaveLength(3);
    expect(out.compares).toEqual(comps8.slice(0, 3));
  });

  it('对比区含与新主品同型号同配置的项 → 剔除后再截配额', () => {
    const comps = distinctComps(7);
    const out = withMain(card(null, [ownSel, ...comps]), ownSel);
    expect(out.compares.some((c) => selKey(c) === selKey(ownSel))).toBe(false);
    // 先剔除主品同组项（不占名额），再截到每组 3 款
    expect(out.compares).toEqual(comps.slice(0, COMPARES_PER_CARD_CAP));
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
