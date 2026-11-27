// ============================================================
// 按档位看板纯模型金测（2026-11-28 二版「一行一款」）：一款一行（多配置收成一行）、
// 起售配置（最低现价）决定分段与行序、无现价段殿后、锚列恒最左；单配置提示
// hintOf（重叠同档优先、顶底档边界）；型号最优提示 bestConfigHint（同档胜相邻档、
// 同级取最近锚价）；显示配置优先级（显式 > 提示 > 起售）；初始草稿来自 mains；
// 勾选锁定配置；全选同档锁定匹配配置；应用组装（就近分配、并列取前、无价回退）。
// 合成 byGroup 驱动——Map 键故意用与 selKey 不同的格式，证明不依赖键格式；
// 加一条真实数据冒烟（phone/RU）。
// ============================================================
import { describe, expect, it } from 'vitest';
import type { GroupPriceEntry } from '../../../dataModel/tierPrice';
import { tierBandsOf } from '../../../dataModel/aggregate';
import { currentPricesByGroup } from '../../../dataModel/tierPrice';
import type { MainProduct, ProductSelection } from '../../../state/filtersTypes';
import { selKey } from '../../../state/mainSelection';
import { dimProduct } from '../../../data';
import {
  anchorContextOf,
  bestConfigHint,
  boardPicks,
  BOARD_COL_MIN_W,
  BOARD_COL_W,
  buildBoardColumns,
  cardsFromBoard,
  chipHintOf,
  checkAllSameDraft,
  displayedConfig,
  hintOf,
  initialDraft,
  rowViewOf,
  toggleModel,
  type BoardColumn,
  type BoardDraft,
  type BoardModel,
} from '../tierBoard';

const INDUSTRY = 'phone';
const BANDS = tierBandsOf(INDUSTRY).map((b) => b.code); // 手机阶梯实序（<200 … 1000+）
const LOW = BANDS[0];
const SECOND = BANDS[1];
const THIRD = BANDS[2];
const FOURTH = BANDS[3];
const TOP = BANDS[BANDS.length - 1];
const BELOW_TOP = BANDS[BANDS.length - 2];

const sel = (modelId: string, romram: string): ProductSelection => ({ modelId, romram, skuIds: [`${modelId}__x__black`] });

/** 真实型号 id（brandOfModel / modelNameOf 依赖 dimProduct） */
const realModelIds = [...new Set(dimProduct.filter((p) => p.industry === INDUSTRY).map((p) => p.model_id))];
const brandOf = (mid: string): string => dimProduct.find((p) => p.model_id === mid)!.brand;

/** 合成 byGroup 行：键故意用 `K::modelId::romram`（≠ selKey），看板不得依赖键格式 */
const entry = (modelId: string, romram: string, usd: number | null, band: string | null): [string, GroupPriceEntry] => [
  `K::${modelId}::${romram}`,
  {
    tier: band,
    price: { usd, local: usd, period: usd != null ? '202648' : null, points: usd != null ? 3 : 0, dropped: [] },
    sel: sel(modelId, romram),
  },
];

const build = (entries: Array<[string, GroupPriceEntry]>, brandOrder: readonly string[], anchorBrand: string): BoardColumn[] => {
  const byGroup = new Map(entries);
  const dataKeys = new Set(entries.map(([, e]) => selKey(e.sel)));
  return buildBoardColumns(byGroup, dataKeys, brandOrder, anchorBrand, INDUSTRY);
};

/** 前 n 个互异品牌，各取若干型号 id */
function brandsWithModels(nBrands: number, perBrand: number): Array<{ brand: string; models: string[] }> {
  const map = new Map<string, string[]>();
  for (const mid of realModelIds) {
    const b = brandOf(mid);
    const list = map.get(b) ?? [];
    if (list.length < perBrand) list.push(mid);
    map.set(b, list);
  }
  const out = [...map.entries()].filter(([, l]) => l.length >= perBrand).slice(0, nBrands).map(([brand, models]) => ({ brand, models }));
  if (out.length < nBrands) throw new Error('测试数据品牌/型号不足');
  return out;
}

const modelsOf = (col: BoardColumn): BoardModel[] => col.sections.flatMap((s) => s.models);

describe('buildBoardColumns（一款一行 / 起售分段 / 列序）', () => {
  const [A, B, C] = brandsWithModels(3, 3);

  it('锚列恒最左：锚品牌在 brandOrder 中间也提前，其余保持树序；列头计数 = 款数', () => {
    const entries = [A, B, C].map((x, i) => entry(x.models[0], '8+256 GB', 500 - i * 100, SECOND));
    const cols = build(entries, [A.brand, B.brand, C.brand], B.brand);
    expect(cols.map((c) => c.brand)).toEqual([B.brand, A.brand, C.brand]);
    expect(cols[0].anchor).toBe(true);
    expect(cols[1].anchor).toBe(false);
  });

  it('同型号 3 个配置 → 1 行；配置按 compareRomram 排序；不依赖 Map 键格式', () => {
    const m = A.models[0];
    const entries = [entry(m, '12+512 GB', 700, FOURTH), entry(m, '8+128 GB', 450, THIRD), entry(m, '12+256 GB', 600, FOURTH)];
    const cols = build(entries, [A.brand], A.brand);
    expect(cols[0].count).toBe(1);
    const row = modelsOf(cols[0])[0];
    expect(row.configs.map((c) => c.sel.romram)).toEqual(['8+128 GB', '12+256 GB', '12+512 GB']);
    expect(row.configs[0].selKey).toBe(selKey(sel(m, '8+128 GB')));
  });

  it('起售配置 = 有价配置最低 USD；分段 / 行序按起售价（高档在前），全无价型号进末尾无现价段', () => {
    const [m1, m2, m3] = A.models;
    const entries = [
      // m1：起售 450（THIRD），高配 1200（TOP）——分段应在 THIRD，不在 TOP
      entry(m1, '8+128 GB', 450, THIRD),
      entry(m1, '16+1 TB', 1200, TOP),
      entry(m1, '12+256 GB', null, null), // 无价配置不参与起售
      // m2：起售 550（THIRD，高于 m1 → 段内在前）
      entry(m2, '8+256 GB', 550, THIRD),
      // m3：全无价
      entry(m3, '8+256 GB', null, null),
    ];
    const col = build(entries, [A.brand], A.brand)[0];
    expect(col.count).toBe(3);
    expect(col.sections.map((s) => s.band)).toEqual([THIRD, null]);
    expect(col.sections[0].models.map((m) => m.modelId)).toEqual([m2, m1]);
    const r1 = col.sections[0].models[1];
    expect(r1.startUsd).toBe(450);
    expect(r1.startBand).toBe(THIRD);
    expect(r1.entryKey).toBe(selKey(sel(m1, '8+128 GB')));
    expect(col.sections[1].models.map((m) => m.modelId)).toEqual([m3]);
    expect(col.sections[1].models[0].startBand).toBeNull();
  });

  it('多段按档位从高到低', () => {
    const [m1, m2, m3] = A.models;
    const col = build([entry(m1, 'a', 150, LOW), entry(m2, 'a', 1200, TOP), entry(m3, 'a', 450, THIRD)], [A.brand], A.brand)[0];
    expect(col.sections.map((s) => s.band)).toEqual([TOP, THIRD, LOW]);
  });

  it('dataKeys 之外的配置不进看板（型号全部配置都被滤掉 → 无该行）', () => {
    const [m1, m2] = A.models;
    const entries = [entry(m1, 'a', 300, SECOND), entry(m1, 'b', 400, THIRD), entry(m2, 'a', 300, SECOND)];
    const byGroup = new Map(entries);
    const dataKeys = new Set([selKey(sel(m1, 'a'))]);
    const cols = buildBoardColumns(byGroup, dataKeys, [A.brand], A.brand, INDUSTRY);
    expect(cols[0].count).toBe(1);
    expect(modelsOf(cols[0])[0].configs.map((c) => c.sel.romram)).toEqual(['a']);
  });
});

describe('hintOf（单配置同档 / 相邻档）', () => {
  it('同档优先：既是 A 锚的同档又是 B 锚的相邻档 → same', () => {
    expect(hintOf(SECOND, new Set([SECOND, THIRD]), INDUSTRY)).toBe('same');
  });
  it('相邻档：±1 档且不在锚档位集 → adjacent；隔两档 → null', () => {
    const anchors = new Set([SECOND]);
    expect(hintOf(LOW, anchors, INDUSTRY)).toBe('adjacent');
    expect(hintOf(THIRD, anchors, INDUSTRY)).toBe('adjacent');
    expect(hintOf(FOURTH, anchors, INDUSTRY)).toBeNull();
  });
  it('顶 / 底档边界', () => {
    expect(hintOf(BELOW_TOP, new Set([TOP]), INDUSTRY)).toBe('adjacent');
    expect(hintOf(SECOND, new Set([LOW]), INDUSTRY)).toBe('adjacent');
    expect(hintOf(TOP, new Set([LOW]), INDUSTRY)).toBeNull();
  });
  it('无现价或锚未选 → null', () => {
    expect(hintOf(null, new Set([SECOND]), INDUSTRY)).toBeNull();
    expect(hintOf(SECOND, new Set(), INDUSTRY)).toBeNull();
  });
});

describe('bestConfigHint / displayedConfig / rowViewOf', () => {
  const [A, B] = brandsWithModels(2, 2);
  const anchorM = A.models[0];
  const other = B.models[0];
  // other：起售 450（THIRD）· 650（FOURTH）· 750（FOURTH）
  const entries = [
    entry(anchorM, '12+512 GB', 700, FOURTH),
    entry(other, '8+128 GB', 450, THIRD),
    entry(other, '12+256 GB', 650, FOURTH),
    entry(other, '12+512 GB', 750, FOURTH),
  ];
  const cols = build(entries, [A.brand, B.brand], A.brand);
  const row = modelsOf(cols[1])[0];

  it('同档胜相邻档：起售落 THIRD（相邻档），但 FOURTH 配置同档 → same + 非起售配置', () => {
    const best = bestConfigHint(row, new Set([FOURTH]), [700], INDUSTRY);
    expect(best.hint).toBe('same');
    expect(best.config.sel.romram).not.toBe('8+128 GB');
  });

  it('同级 → |USD − 最近锚价| 最小者；价差再并列 → 配置序靠前', () => {
    // 锚价 720：650 距 70、750 距 30 → 750
    expect(bestConfigHint(row, new Set([FOURTH]), [720], INDUSTRY).config.sel.romram).toBe('12+512 GB');
    // 锚价 660：650 距 10 → 650
    expect(bestConfigHint(row, new Set([FOURTH]), [660], INDUSTRY).config.sel.romram).toBe('12+256 GB');
    // 锚价 700：两者都距 50 → 配置序靠前（12+256）
    expect(bestConfigHint(row, new Set([FOURTH]), [700], INDUSTRY).config.sel.romram).toBe('12+256 GB');
  });

  it('无锚 / 无提示 → 起售配置', () => {
    expect(bestConfigHint(row, new Set(), [], INDUSTRY)).toEqual({ hint: null, config: row.configs[0] });
    expect(bestConfigHint(row, new Set([BANDS[0]]), [100], INDUSTRY).hint).toBeNull();
    expect(displayedConfig(row, undefined, null).sel.romram).toBe('8+128 GB');
  });

  it('显示配置优先级：显式选择 > 提示配置 > 起售', () => {
    const anchors = { bands: new Set([FOURTH]), prices: [720], industry: INDUSTRY } as const;
    expect(displayedConfig(row, undefined, anchors).sel.romram).toBe('12+512 GB');
    const explicit = selKey(sel(other, '8+128 GB'));
    expect(displayedConfig(row, explicit, anchors).sel.romram).toBe('8+128 GB');
    // 显式选择后提示按所选配置判（THIRD 与 FOURTH 相邻）
    expect(rowViewOf(row, explicit, anchors, false)).toMatchObject({ hint: 'adjacent' });
    // 锚列行恒无提示
    expect(rowViewOf(row, undefined, anchors, true).hint).toBeNull();
  });

  it('chipHintOf：提示把显示配置带离起售 → chip 挂提示；显式选择 / 显示 = 起售 / 无锚 → null', () => {
    const same = { bands: new Set([FOURTH]), prices: [720], industry: INDUSTRY } as const;
    const shown = displayedConfig(row, undefined, same);
    expect(shown.selKey).not.toBe(row.entryKey);
    expect(chipHintOf(row, shown, undefined, same)).toBe('same');
    // 显式选择（含勾选锁定）同一配置 → 用户自己选的，不挂
    expect(chipHintOf(row, shown, shown.selKey, same)).toBeNull();
    // 显示 = 起售（起售 THIRD 自身就相邻）→ 行框已表达，chip 不挂
    const adjOnly = { bands: new Set([SECOND]), prices: [300], industry: INDUSTRY } as const;
    const shownAdj = displayedConfig(row, undefined, adjOnly);
    expect(shownAdj.selKey).toBe(row.entryKey);
    expect(chipHintOf(row, shownAdj, undefined, adjOnly)).toBeNull();
    // 无锚上下文
    expect(chipHintOf(row, shown, undefined, null)).toBeNull();
    expect(chipHintOf(row, shown, undefined, { bands: new Set(), prices: [], industry: INDUSTRY })).toBeNull();
  });

  it('chipHintOf：偏离起售的显示配置只落相邻档 → adjacent', () => {
    // 锚档 = FOURTH 上一档：起售 THIRD 无关，FOURTH 配置相邻 → 显示 FOURTH 配置且 chip 相邻
    expect(BANDS.length).toBeGreaterThan(4);
    const up = BANDS[4];
    const anchors = { bands: new Set([up]), prices: [900], industry: INDUSTRY } as const;
    const shown = displayedConfig(row, undefined, anchors);
    expect(shown.band).toBe(FOURTH);
    expect(chipHintOf(row, shown, undefined, anchors)).toBe('adjacent');
  });

  it('列宽常量：288 / min 272', () => {
    expect(BOARD_COL_W).toBe(288);
    expect(BOARD_COL_MIN_W).toBe(272);
  });
});

describe('草稿：初始 / 勾选锁定 / 全选同档 / 应用', () => {
  const [A, B, C] = brandsWithModels(3, 2);
  const anchorM = A.models[0];
  const anchorM2 = A.models[1];
  const bSame = B.models[0]; // 有 FOURTH 配置（非起售）
  const bFar = B.models[1]; // 只有 LOW
  const cAdj = C.models[0]; // 只有 THIRD（相邻）
  const entries = [
    entry(anchorM, '8+256 GB', 500, THIRD),
    entry(anchorM, '12+512 GB', 700, FOURTH),
    entry(anchorM2, '8+256 GB', 1300, TOP),
    entry(bSame, '8+128 GB', 450, THIRD),
    entry(bSame, '12+512 GB', 710, FOURTH),
    entry(bFar, '8+128 GB', 150, LOW),
    entry(cAdj, '8+256 GB', 550, THIRD),
  ];
  const cols = build(entries, [A.brand, B.brand, C.brand], A.brand);
  const find = (mid: string): BoardModel => cols.flatMap(modelsOf).find((m) => m.modelId === mid)!;

  it('初始草稿来自 mains：任一配置在册 → 勾选并锁定该配置；板外配置忽略', () => {
    const mains: MainProduct[] = [
      { id: 'c1', main: sel(anchorM, '12+512GB'), compares: [sel(bSame, '12+512 GB'), sel('nope', 'x')] },
    ];
    const d = initialDraft(cols, mains);
    expect([...d.checked].sort()).toEqual([anchorM, bSame].sort());
    expect(d.chosen.get(anchorM)).toBe(selKey(sel(anchorM, '12+512 GB')));
    expect(d.chosen.get(bSame)).toBe(selKey(sel(bSame, '12+512 GB')));
  });

  it('勾选锁定当下显示配置：锚变化后已勾行不漂移', () => {
    let d: BoardDraft = { checked: new Set<string>(), chosen: new Map<string, string>() };
    // 先勾锚 12+512（FOURTH，700）
    d = { ...d, chosen: new Map([[anchorM, selKey(sel(anchorM, '12+512 GB'))]]) };
    d = toggleModel(d, find(anchorM), true, find(anchorM).configs.find((c) => c.sel.romram === '12+512 GB')!);
    const ctx = anchorContextOf(cols, d, INDUSTRY);
    expect([...ctx.bands]).toEqual([FOURTH]);
    const view = rowViewOf(find(bSame), d.chosen.get(bSame), ctx, false);
    expect(view).toMatchObject({ hint: 'same' });
    expect(view.config.sel.romram).toBe('12+512 GB');
    d = toggleModel(d, find(bSame), true, view.config);
    // 锚换成 8+256（THIRD）：bSame 仍锁 12+512
    d = { ...d, chosen: new Map(d.chosen).set(anchorM, selKey(sel(anchorM, '8+256 GB'))) };
    const ctx2 = anchorContextOf(cols, d, INDUSTRY);
    expect([...ctx2.bands]).toEqual([THIRD]);
    expect(rowViewOf(find(bSame), d.chosen.get(bSame), ctx2, false).config.sel.romram).toBe('12+512 GB');
  });

  it('按提示全选同档：只勾同档行并锁匹配配置；相邻档 / 无关行不勾', () => {
    const d0 = toggleModel(
      { checked: new Set(), chosen: new Map() },
      find(anchorM),
      true,
      find(anchorM).configs.find((c) => c.sel.romram === '12+512 GB')!,
    );
    const d = checkAllSameDraft(cols, d0, anchorContextOf(cols, d0, INDUSTRY));
    expect(d.checked.has(bSame)).toBe(true);
    expect(d.chosen.get(bSame)).toBe(selKey(sel(bSame, '12+512 GB')));
    expect(d.checked.has(cAdj)).toBe(false); // THIRD 与 FOURTH 相邻
    expect(d.checked.has(bFar)).toBe(false);
    expect(d.checked.has(anchorM2)).toBe(false); // 锚列不动
  });

  it('应用：锚按板上行序成组，非锚按所选配置就近分配，sel 取所选配置', () => {
    let d = toggleModel({ checked: new Set(), chosen: new Map() }, find(anchorM), true, find(anchorM).configs.find((c) => c.sel.romram === '12+512 GB')!);
    d = toggleModel(d, find(anchorM2), true, find(anchorM2).configs[0]);
    d = checkAllSameDraft(cols, d, anchorContextOf(cols, d, INDUSTRY)); // bSame@712 → 锚 700
    d = toggleModel(d, find(cAdj), true, find(cAdj).configs[0]); // 550 → 锚 700（vs 1300）
    const picks = boardPicks(cols, d, anchorContextOf(cols, d, INDUSTRY));
    // 锚列行序：TOP 段（anchorM2）在 THIRD 段（anchorM 起售 500）前
    expect(picks.anchors.map((c) => c.sel.modelId)).toEqual([anchorM2, anchorM]);
    const groups = cardsFromBoard(picks.anchors, picks.others);
    expect(groups[0].main).toEqual(sel(anchorM2, '8+256 GB'));
    expect(groups[0].compares).toEqual([]);
    expect(groups[1].main).toEqual(sel(anchorM, '12+512 GB'));
    expect(groups[1].compares.map((s) => `${s.modelId}|${s.romram}`).sort()).toEqual(
      [`${bSame}|12+512 GB`, `${cAdj}|8+256 GB`].sort(),
    );
  });
});

describe('cardsFromBoard（方案 A 分配规则）', () => {
  const it2 = (modelId: string, usd: number | null) => ({ sel: sel(modelId, 'a'), usd });

  it('非锚分配给 |USD 价差| 最小的锚；组序 = 锚序', () => {
    const a1 = it2('m1', 400);
    const a2 = it2('m2', 800);
    const groups = cardsFromBoard([a1, a2], [it2('m3', 450), it2('m4', 750)]);
    expect(groups.map((g) => g.compares.map((s) => s.modelId))).toEqual([['m3'], ['m4']]);
  });
  it('并列价差 → 靠前的锚', () => {
    const groups = cardsFromBoard([it2('m1', 400), it2('m2', 600)], [it2('m3', 500)]);
    expect(groups[0].compares).toHaveLength(1);
    expect(groups[1].compares).toHaveLength(0);
  });
  it('项无现价或全部锚无现价 → 第一个锚；无锚 → 空数组', () => {
    expect(cardsFromBoard([it2('m1', 400), it2('m2', 800)], [it2('m3', null)])[0].compares).toHaveLength(1);
    const g2 = cardsFromBoard([it2('m1', null), it2('m2', null)], [it2('m4', 500)]);
    expect(g2[0].compares).toHaveLength(1);
    expect(g2[1].compares).toHaveLength(0);
    expect(cardsFromBoard([], [it2('m9', 100)])).toEqual([]);
  });
});

describe('真实数据冒烟（phone/RU）', () => {
  it('看板行数 = 型号数；配置总数 = 批量裁定组数；锚列最左', () => {
    const byGroup = currentPricesByGroup(INDUSTRY, 'RU');
    const dataKeys = new Set([...byGroup.values()].map((e) => selKey(e.sel)));
    const brandOrder = [...new Set(dimProduct.filter((p) => p.industry === INDUSTRY && p.countries.includes('RU')).map((p) => p.brand))];
    expect(brandOrder.length).toBeGreaterThan(1);
    const cols = buildBoardColumns(byGroup, dataKeys, brandOrder, brandOrder[0], INDUSTRY);
    const rows = cols.flatMap(modelsOf);
    expect(rows.length).toBe(new Set([...byGroup.values()].map((e) => e.sel.modelId)).size);
    expect(rows.reduce((n, m) => n + m.configs.length, 0)).toBe(dataKeys.size);
    expect(rows.some((m) => m.configs.length > 1)).toBe(true);
    expect(cols[0].brand).toBe(brandOrder[0]);
    expect(cols[0].anchor).toBe(true);
    const mid = brandOrder[1];
    const moved = buildBoardColumns(byGroup, dataKeys, brandOrder, mid, INDUSTRY);
    expect(moved.map((c) => c.brand)).toEqual([mid, ...brandOrder.filter((b) => b !== mid)]);
  });
});
