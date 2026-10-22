// ============================================================
// 模板「＋ 加入当前选择」增量计划金测（planAppend，第一百三十一轮第二次修订）：
// 逐模板卡处理——主品不在 = 整卡追加（auto 随模板带入、卡数封顶）；
// 主品已在 = 缺失对比按 selKey 去重合并进现有卡（与主品同组跳过、卡配额封顶）。
// ============================================================
import { describe, expect, it } from 'vitest';
import { dimProduct } from '../../../data';
import type { MainProduct, ProductSelection } from '../../../state/filtersTypes';
import { MAINS_CAP, cardQuota, selKey } from '../../../state/mainSelection';
import { planAppend, type StoredCombo } from '../combos';

/** n 个互不同组的该国竞品勾选（按 selKey 去重收集，保 dimProduct 序） */
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

const ownRow = dimProduct.find((p) => p.is_own && p.countries.includes('RU'))!;
const ownSel: ProductSelection = { modelId: ownRow.sku_id.split('__')[0], romram: ownRow.romram, skuIds: [ownRow.sku_id] };

let seq = 0;
const card = (main: ProductSelection | null, compares: ProductSelection[] = [], auto?: boolean): MainProduct => ({
  id: `t${(seq += 1)}`,
  main,
  compares,
  ...(auto ? { auto: true } : {}),
});

describe('planAppend（＋ 加入当前选择：逐模板卡增量）', () => {
  it('主品不在当前选择 → 整卡追加（对比区与 auto 原样带入、换新 id）', () => {
    const comps = distinctComps(2);
    const mains = [card(ownSel, [comps[0]])];
    const combo: StoredCombo = { label: 'T', cards: [card(comps[1], [comps[0], comps[1]], true)] };
    const plan = planAppend(mains, combo);
    expect(plan.fresh).toHaveLength(1);
    expect(plan.merges).toHaveLength(0);
    expect(selKey(plan.fresh[0].main!)).toBe(selKey(comps[1]));
    expect(plan.fresh[0].auto).toBe(true); // auto 随模板带入
    expect(plan.fresh[0].compares.map(selKey)).toEqual([comps[0], comps[1]].map(selKey));
    expect(plan.fresh[0].id).not.toBe(combo.cards[0].id); // 换新卡 id
    expect(plan.overflowCards).toBe(0);
  });

  it('主品已在但缺对比 → 只把缺失对比合并进现有卡（已有不重复、与主品同组跳过、auto 卡交由调用方退出）', () => {
    const comps = distinctComps(3);
    const mains = [card(ownSel, [comps[0]], true)];
    const combo: StoredCombo = { label: 'T', cards: [card(ownSel, [comps[0], comps[1], comps[2], ownSel])] };
    const plan = planAppend(mains, combo);
    expect(plan.fresh).toHaveLength(0);
    expect(plan.merges).toHaveLength(1);
    expect(plan.merges[0].cardId).toBe(mains[0].id);
    // 缺失的 comp1/comp2 补入；已有的 comp0 不重复；与主品同组的 ownSel 不进对比区
    expect(plan.merges[0].compares.map(selKey)).toEqual([comps[1], comps[2]].map(selKey));
    expect(plan.overflowCompares).toBe(0);
  });

  it('全部内容均已在当前选择 → 空 plan（tooltip 走「均已在当前选择中」）', () => {
    const comps = distinctComps(2);
    const mains = [card(ownSel, [comps[0], comps[1]])];
    const combo: StoredCombo = { label: 'T', cards: [card(ownSel, [comps[0]])] };
    const plan = planAppend(mains, combo);
    expect(plan.fresh).toHaveLength(0);
    expect(plan.merges).toHaveLength(0);
    expect(plan.overflowCards).toBe(0);
    expect(plan.overflowCompares).toBe(0);
  });

  it('卡数封顶：当前已满 MAINS_CAP 时主品不在的模板卡计入 overflowCards 不追加', () => {
    const comps = distinctComps(MAINS_CAP + 2);
    const mains = comps.slice(0, MAINS_CAP).map((sel) => card(sel));
    const combo: StoredCombo = { label: 'T', cards: [card(comps[MAINS_CAP]), card(comps[0])] };
    const plan = planAppend(mains, combo);
    expect(mains).toHaveLength(MAINS_CAP);
    // comps[MAINS_CAP] 放不下；comps[0] 主品已在且模板卡无缺失对比 → 无合并
    expect(plan.fresh).toHaveLength(0);
    expect(plan.overflowCards).toBe(1);
  });

  it('对比配额封顶：现有卡对比区已满时缺失对比计入 overflowCompares 不合并', () => {
    const comps = distinctComps(9);
    const full = comps.slice(0, 7); // 有主品卡配额 = 7
    const mains = [card(ownSel, full)];
    expect(mains[0].compares).toHaveLength(cardQuota(mains[0]));
    const combo: StoredCombo = { label: 'T', cards: [card(ownSel, [comps[7], comps[8]])] };
    const plan = planAppend(mains, combo);
    expect(plan.fresh).toHaveLength(0);
    expect(plan.merges).toHaveLength(0);
    expect(plan.overflowCompares).toBe(2);
  });

  it('同一张现有卡被多个模板对命中 → 合并累计且配额合并计算', () => {
    const comps = distinctComps(8);
    const mains = [card(ownSel, [comps[0]])]; // 配额 7，还能再放 6 条
    const combo: StoredCombo = {
      label: 'T',
      cards: [card(ownSel, comps.slice(1, 6)), card(ownSel, comps.slice(6, 8))],
    };
    const plan = planAppend(mains, combo);
    expect(plan.merges).toHaveLength(1);
    // 两个模板对命中同卡：先补 5 条、再补 2 条中放得下的 1 条（配额 7 = 1 已有 + 6 合并）
    expect(plan.merges[0].compares.map(selKey)).toEqual(comps.slice(1, 7).map(selKey));
    expect(plan.overflowCompares).toBe(1);
  });
});
