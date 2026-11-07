// ============================================================
// t428u R5（五审增量 · 2026-11-07）跨国目标国不可用平台统一归一化回归：
//  - 复现（评审真实报告）：AE nova 14 Pro + plat=NOON 问「RU 价格优势」/
//    「RU 价格趋势」，计算仍带着 RU 不存在的 NOON 过滤 → 0 行；点回看切 RU 时
//    FiltersContext 才把平台清成 null，再问有 18 行——计算与落地平台不一致。
//  - 契约（R5-M1，与稳定线五审同源）：目标国不存在该平台则计算前经共享规则
//    platformSelectionForCountry 归一化到目标合法范围并透明说明（卡片明确平台
//    回退事实，不冒称 NOON 在 RU 有价）；同国 RU+OZON 等有效平台与 shopIds
//    必须原样保留；queryCards chart/summary/table 的 open 动作携带完整 queryState
//    （含归一化后的平台）落地，点回看前后同产品/同范围/平台一致。
// ============================================================
import { describe, expect, it } from 'vitest';
import { dimProduct } from '../../data';
import { defaultFilters } from '../../state/FiltersContext';
import type { FiltersState, PlatformSelection } from '../../state/filtersTypes';
import { buildCards } from '../../state/mainSelection';
import { platformSelectionForCountry } from '../../dataModel/aggregate';
import { runAgent, buildAgentContext } from '../core';
import { advantageScopePatch, platformCountryFallbackNote, stateForPriceAdvantageCountry } from '../priceAdvantage';
import type { ChartResultCard, PriceAdvantageResultCard, TableResultCard } from '../contracts';

// ---- 数据事实（dim_channel）：AE 平台 = CARREFOUR/JUMBO/NOON/SHARAFDG；
// RU 平台 = DNS/Mvideo/OZON（NOON 不在 RU）；nova 14 Pro 12+512GB 在 AE 与 RU
// 均在售（跨国同配置合法保留）。----
const NOON_AE: PlatformSelection = { platforms: ['NOON'], shopIds: [], seller: null };
const OZON_RU: PlatformSelection = { platforms: ['OZON'], shopIds: [], seller: null };
const OZON_RU_SHOP: PlatformSelection = { platforms: [], shopIds: ['RU:ozon:3P'], seller: null };
const novaRow = dimProduct.find((row) => row.model_id === 'own-huawei-nova-14-pro')!;
const NOVA = { modelId: 'own-huawei-nova-14-pro', romram: novaRow.romram, skuIds: [novaRow.sku_id] };

/** AE 页 · nova 14 Pro 主品 · 平台勾选 NOON（评审复现口径） */
function aeNoonNovaState(): FiltersState {
  return {
    ...defaultFilters,
    countryCode: 'AE',
    platform: NOON_AE,
    mains: buildCards([NOVA], { auto: true, countryCode: 'AE' }),
    adaptive: false,
    rangeStart: '202619',
    rangeEnd: '202642',
  };
}

/** RU 页 · nova 14 Pro 主品 · OZON 平台级勾选（同国有效平台） */
function ruOzonNovaState(): FiltersState {
  return {
    ...defaultFilters,
    countryCode: 'RU',
    platform: OZON_RU,
    mains: buildCards([NOVA], { auto: true, countryCode: 'RU' }),
  };
}

/** RU 页 · nova 14 Pro 主品 · OZON 3P 店铺级勾选（同国有效渠道，shopIds 保留） */
function ruOzonShopNovaState(): FiltersState {
  return {
    ...defaultFilters,
    countryCode: 'RU',
    platform: OZON_RU_SHOP,
    mains: buildCards([NOVA], { auto: true, countryCode: 'RU' }),
  };
}

async function advantageCardOf(state: FiltersState, text = 'RU 价格优势'): Promise<PriceAdvantageResultCard> {
  const response = await runAgent(text, buildAgentContext('dashboard', state, []));
  expect(response.intent).toBe('price_advantage');
  const card = response.cards.find((item): item is PriceAdvantageResultCard => item.kind === 'price_advantage');
  expect(card).toBeTruthy();
  return card!;
}

describe('R5-M1 · platformSelectionForCountry 共享归一化规则', () => {
  it('null / 空勾选 → null（默认电渠）', () => {
    expect(platformSelectionForCountry(null, 'RU')).toBeNull();
    expect(platformSelectionForCountry(undefined, 'RU')).toBeNull();
    expect(platformSelectionForCountry({ platforms: [], shopIds: [], seller: null }, 'RU')).toBeNull();
  });

  it('同国有效平台与 shopIds 原样保留（引用不变，不一律清空）', () => {
    expect(platformSelectionForCountry(OZON_RU_SHOP, 'RU')).toBe(OZON_RU_SHOP);
    expect(platformSelectionForCountry(NOON_AE, 'AE')).toBe(NOON_AE);
  });

  it('目标国不存在该平台（AE·NOON → RU）→ null（回落目标国默认电渠）', () => {
    expect(platformSelectionForCountry(NOON_AE, 'RU')).toBeNull();
    expect(platformSelectionForCountry(OZON_RU_SHOP, 'AE')).toBeNull();
  });

  it('部分可落地（旧多选载荷 OZON+NOON → AE）：只保留 NOON 子集', () => {
    expect(platformSelectionForCountry({ platforms: ['OZON', 'NOON'], shopIds: [], seller: null }, 'AE'))
      .toEqual({ platforms: ['NOON'], shopIds: [], seller: null });
  });

  it('seller 仅在其所属渠道保留时随行，否则剥离', () => {
    const withSeller: PlatformSelection = { platforms: [], shopIds: ['AE:noon:1P'], seller: 'Huawei AE' };
    expect(platformSelectionForCountry(withSeller, 'AE')).toBe(withSeller);
    // 双渠道里 RU 渠道被剔除、AE 渠道存活 = 仍是单渠道且 seller 属于该渠道 → 随行
    expect(platformSelectionForCountry({ ...withSeller, shopIds: ['AE:noon:1P', 'RU:ozon:1P'] }, 'AE'))
      .toEqual({ platforms: [], shopIds: ['AE:noon:1P'], seller: 'Huawei AE' });
    // 唯一渠道整体不可落地 → null（seller 随选消失）
    expect(platformSelectionForCountry(withSeller, 'RU')).toBeNull();
  });
});

describe('R5-M1 · platformCountryFallbackNote 透明说明（不冒称源国平台在目标国有价）', () => {
  it('AE·NOON → RU：说明 NOON 在 R国没有在架渠道、按默认电渠计算，且声明不代表其在 R国有价格', () => {
    const note = platformCountryFallbackNote(NOON_AE, 'RU');
    expect(note).toContain('NOON');
    expect(note).toContain('R国');
    expect(note).toContain('默认电渠');
    expect(note).toContain('没有在架渠道');
    expect(note).toContain('不代表');
  });

  it('同国 / null / 空勾选 = null（无回退事实不产生说明）', () => {
    expect(platformCountryFallbackNote(NOON_AE, 'AE')).toBeNull();
    expect(platformCountryFallbackNote(null, 'RU')).toBeNull();
    expect(platformCountryFallbackNote({ platforms: [], shopIds: [], seller: null }, 'RU')).toBeNull();
  });

  it('部分回退：说明剔除部分与保留口径', () => {
    const note = platformCountryFallbackNote({ platforms: ['OZON', 'NOON'], shopIds: [], seller: null }, 'AE');
    expect(note).toContain('OZON');
    expect(note).toContain('NOON');
    expect(note).toContain('仅按');
  });
});

describe('R5-M1 · 价格优势跨国计算（无 forcedIntent 自然语言链）', () => {
  it('stateForPriceAdvantageCountry：AE·NOON + nova → RU 平台归一 null、主品 nova 合法保留', () => {
    const next = stateForPriceAdvantageCountry(aeNoonNovaState(), 'RU');
    expect(next.countryCode).toBe('RU');
    expect(next.platform).toBeNull();
    expect(next.mains.length).toBeGreaterThan(0);
    expect(next.mains.every((card) => card.main?.modelId === 'own-huawei-nova-14-pro')).toBe(true);
  });

  it('AE·NOON 问「RU 价格优势」：计算前归一化 → 有实际行（非 0 行）、行全部 R国、卡片透明说明回退', async () => {
    const state = aeNoonNovaState();
    const card = await advantageCardOf(state);
    // 旧缺陷：带着 NOON 过滤 RU 渠道 → 0 行；归一化后按 RU 默认电渠有实际行
    expect(card.rows.length).toBeGreaterThan(0);
    expect(card.rows.every((row) => row.countryCode === 'RU')).toBe(true);
    expect(card.note).toContain('NOON');
    expect(card.note).toContain('默认电渠');
    expect(card.note).toContain('不代表');
    const response = await runAgent('RU 价格优势', buildAgentContext('dashboard', state, []));
    expect(response.summary).toContain('NOON');
  });

  it('回看口径（advantageScopePatch）：落地 RU + nova + 平台 null + 真实周范围，与计算一致', async () => {
    const state = aeNoonNovaState();
    const card = await advantageCardOf(state);
    const patch = advantageScopePatch(state, card.rows);
    expect(patch.countryCode).toBe('RU');
    // 计算已按归一化平台（null）算，落地同样 null——不再出现「计算 0 行、落地
    // 默认电渠 18 行」的口径分裂
    expect(patch.platform).toBeNull();
    expect(patch.granularity).toBe('week');
    const weekIds = [...new Set(card.rows.map((row) => row.weekId))].sort();
    expect(patch.rangeStart).toBe(weekIds[0]);
    expect(patch.rangeEnd).toBe(weekIds[weekIds.length - 1]);
    expect(patch.mains?.some((mainCard) => mainCard.main?.modelId === 'own-huawei-nova-14-pro')).toBe(true);
  });
});

describe('R5-M1 · 价格趋势跨国计算（无 forcedIntent 自然语言链）', () => {
  it('AE·NOON 问「RU nova 14 Pro 价格趋势」：chart 有真实价格点、说明回退、open 动作平台归一落地', async () => {
    const state = aeNoonNovaState();
    const response = await runAgent('RU nova 14 Pro 价格趋势', buildAgentContext('dashboard', state, []));
    expect(response.intent).toBe('query');
    const chart = response.cards.find((item): item is ChartResultCard => item.kind === 'chart');
    const table = response.cards.find((item): item is TableResultCard => item.kind === 'table');
    expect(chart).toBeTruthy();
    // 归一化后按 RU 默认电渠取到真实价格点（旧缺陷：NOON 过滤 → 无可用价格数据）
    expect(chart!.series.some((s) => s.values.some((v) => v.value != null))).toBe(true);
    expect(chart!.note).toContain('NOON');
    expect(chart!.note).toContain('默认电渠');
    expect(table!.note).toContain('NOON');
    // chart / summary table 的 open 动作都携带完整 queryState：RU + nova + 平台 null
    for (const card of [chart!, table!]) {
      const open = (card.actions ?? []).filter((action) => action.kind === 'open');
      expect(open.length).toBeGreaterThan(0);
      for (const action of open) {
        expect(action.filterPatch?.countryCode).toBe('RU');
        expect(action.filterPatch?.platform).toBeNull();
        expect(action.filterPatch?.mains?.every((mainCard) => mainCard.main?.modelId === 'own-huawei-nova-14-pro')).toBe(true);
      }
    }
    expect(response.summary).toContain('NOON');
  });

  it('AE·NOON 未点名产品问「RU 价格趋势」：同型号重映射 + 平台归一，openPatch 同口径', async () => {
    const state = aeNoonNovaState();
    const response = await runAgent('RU 价格趋势', buildAgentContext('dashboard', state, []));
    expect(response.intent).toBe('query');
    const chart = response.cards.find((item): item is ChartResultCard => item.kind === 'chart');
    expect(chart).toBeTruthy();
    expect(chart!.series.some((s) => s.values.some((v) => v.value != null))).toBe(true);
    expect(chart!.note).toContain('NOON');
    const open = (chart!.actions ?? []).find((action) => action.kind === 'open');
    expect(open?.filterPatch?.countryCode).toBe('RU');
    expect(open?.filterPatch?.platform).toBeNull();
    expect(open?.filterPatch?.mains?.some((mainCard) => mainCard.main?.modelId === 'own-huawei-nova-14-pro')).toBe(true);
  });
});

describe('R5-M1 · 同国有效平台与 shopIds 保留（不可一律清空平台）', () => {
  it('RU·OZON 平台级勾选问「价格优势」：行按 OZON 口径计算，回看 scopePatch 原样保留', async () => {
    const state = ruOzonNovaState();
    const card = await advantageCardOf(state, '价格优势');
    expect(card.rows.length).toBeGreaterThan(0);
    expect(card.rows.every((row) => row.countryCode === 'RU')).toBe(true);
    const patch = advantageScopePatch(state, card.rows);
    // 同国有效平台必须原样保留——引用一致，不整体清空
    expect(patch.platform).toBe(OZON_RU);
    // 无回退事实：不产生平台回退说明
    expect(platformCountryFallbackNote(state.platform, 'RU')).toBeNull();
  });

  it('RU·OZON 3P 店铺级勾选（shopIds）：价格优势有实际行，回看 scopePatch 原样保留 shopIds', async () => {
    const state = ruOzonShopNovaState();
    const card = await advantageCardOf(state, '价格优势');
    expect(card.rows.length).toBeGreaterThan(0);
    expect(card.rows.every((row) => row.countryCode === 'RU')).toBe(true);
    const patch = advantageScopePatch(state, card.rows);
    expect(patch.platform).toBe(OZON_RU_SHOP);
    expect(patch.platform?.shopIds).toEqual(['RU:ozon:3P']);
    expect(platformCountryFallbackNote(state.platform, 'RU')).toBeNull();
  });

  it('RU·OZON 3P 问「查我司产品价格」：query open 动作携带 OZON 店铺级口径落地', async () => {
    const state = ruOzonShopNovaState();
    const response = await runAgent('查我司产品价格', buildAgentContext('dashboard', state, []));
    expect(response.intent).toBe('query');
    const chart = response.cards.find((item): item is ChartResultCard => item.kind === 'chart');
    expect(chart).toBeTruthy();
    expect(chart!.series.some((s) => s.values.some((v) => v.value != null))).toBe(true);
    const open = (chart!.actions ?? []).filter((action) => action.kind === 'open');
    expect(open.length).toBeGreaterThan(0);
    for (const action of open) {
      expect(action.filterPatch?.platform).toEqual(OZON_RU_SHOP);
      expect(action.filterPatch?.countryCode).toBe('RU');
    }
    // 同国查询不产生平台回退说明
    expect(chart!.note).not.toContain('默认电渠口径计算');
  });
});
