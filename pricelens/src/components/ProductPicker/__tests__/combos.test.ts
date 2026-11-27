// ============================================================
// 模板「＋ 加入当前选择」增量计划金测（planAppend，第一百三十一轮第二次修订）：
// 逐模板卡处理——主品不在 = 整卡追加（auto 随模板带入）；主品已在 = 缺失对比按
// selKey 去重合并进现有卡（与主品同组跳过）。
// 2026-11-27（取消 8 卡 / 单图 8 线上限）：原「卡数封顶 → overflowCards」「对比
// 配额封顶 → overflowCompares」两条断言与确认目标正面冲突，改写为「不截断、
// 全量追加 / 全量合并」；overflow 计数随上限退役删除。
// ============================================================
import { describe, expect, it } from 'vitest';
import { dimProduct } from '../../../data';
import type { MainProduct, ProductSelection } from '../../../state/filtersTypes';
import { selKey } from '../../../state/mainSelection';
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
  });

  it('全部内容均已在当前选择 → 空 plan（tooltip 走「均已在当前选择中」）', () => {
    const comps = distinctComps(2);
    const mains = [card(ownSel, [comps[0], comps[1]])];
    const combo: StoredCombo = { label: 'T', cards: [card(ownSel, [comps[0]])] };
    const plan = planAppend(mains, combo);
    expect(plan.fresh).toHaveLength(0);
    expect(plan.merges).toHaveLength(0);
  });

  it('卡数不封顶（2026-11-27）：当前已有 10 张卡时，主品不在的模板卡仍整卡追加', () => {
    const comps = distinctComps(12);
    const mains = comps.slice(0, 10).map((sel) => card(sel));
    const combo: StoredCombo = { label: 'T', cards: [card(comps[10]), card(comps[0])] };
    const plan = planAppend(mains, combo);
    expect(mains).toHaveLength(10);
    // comps[10] 整卡追加（不再计入 overflowCards）；comps[0] 主品已在且模板卡无缺失对比 → 无合并
    expect(plan.fresh).toHaveLength(1);
    expect(selKey(plan.fresh[0].main!)).toBe(selKey(comps[10]));
    expect(plan.merges).toHaveLength(0);
  });

  it('对比合并不截断（2026-11-27）：缺失的 5 个对比全部合并，不再截到单图 8 条折线', () => {
    const comps = distinctComps(9);
    const mains = [card(ownSel, comps.slice(0, 4))];
    const combo: StoredCombo = { label: 'T', cards: [card(ownSel, comps.slice(4, 9))] };
    const plan = planAppend(mains, combo);
    expect(plan.fresh).toHaveLength(0);
    expect(plan.merges[0].compares.map(selKey)).toEqual(comps.slice(4, 9).map(selKey));
  });

  it('同一张现有卡被多个模板对命中 → 合并累计、不截断', () => {
    const comps = distinctComps(9);
    const mains = [card(ownSel, [comps[0]])];
    const combo: StoredCombo = {
      label: 'T',
      cards: [card(ownSel, comps.slice(1, 7)), card(ownSel, comps.slice(7, 9))],
    };
    const plan = planAppend(mains, combo);
    expect(plan.merges).toHaveLength(1);
    expect(plan.merges[0].compares.map(selKey)).toEqual(comps.slice(1, 9).map(selKey));
  });
});
