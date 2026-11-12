// ============================================================
// t428u R4（四审增量 · 2026-11-07）Agent 跨国口径三件套回归：
//  - R4-M1：queryCards 的 chart / platform table / summary table 全部 open 动作
//    携带生成卡时的完整 filterPatch（countryCode、mains、platform、granularity、
//    rangeStart/End）——AE 页问「RU nova 14 Pro 价格趋势」，点「回看板定位」
//    先落地 RU + nova 再导航，不留 AE 旧口径（无 forcedIntent 的真实分类链）。
//  - R4-M2：跨国构建 queryState 必须统一走保型号重映射（remapSelectionForCountry），
//    不能精确 romram 过滤后丢 Mate X6 而落目标国默认主品（Mate 80 Pro）；RU
//    Mate X6 12+512 问 ID 价格优势 = 直接算 Mate X6 16+512；仅目标国整体缺型号
//    才安全回落默认且结果明确说明。
// ============================================================
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { dimProduct } from '../../data';
import { defaultFilters, FiltersProvider, useFilters } from '../../state/FiltersContext';
import { PageProvider } from '../../state/PageContext';
import { AgentProvider, useAgent } from '../../state/AgentContext';
import AgentPanel from '../../components/Copilot/AgentPanel';
import { runAgent, buildAgentContext } from '../core';
import { buildCards, selKey } from '../../state/mainSelection';
import { lowestPriceColorSku } from '../../dataModel/aggregate';
import { priceAdvantageCountryFallbackNote, stateForPriceAdvantageCountry } from '../priceAdvantage';
import type { ChartResultCard, TableResultCard, AgentCardAction } from '../contracts';

Object.defineProperty(window, 'matchMedia', { writable: true, value: (query: string) => ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }) });
afterEach(() => cleanup());

// ---- 数据事实（dim_product）：Mate X6 12+512GB 仅 ES/FR/IT/RU/TR，ID 只有
// 16+512GB（black）；nova 14 Pro 12+512GB 在 AE/DE/RU 均在售；Pura 90s Pro Max
// 不在 ID/DE（整体缺席 → 安全默认 + 说明）；ID 默认 own = Mate 80 Pro。----
const mateX6RuRow = dimProduct.find((row) => row.model_id === 'own-huawei-mate-x6' && row.romram === '12+512 GB')!;
const MATE_X6_RU = { modelId: 'own-huawei-mate-x6', romram: '12+512 GB', skuIds: [mateX6RuRow.sku_id] };
const MATE_X6_ID_SKU = dimProduct.find((row) => row.model_id === 'own-huawei-mate-x6' && row.romram === '16+512 GB' && row.countries.includes('ID'))!;
const MATE_X6_ID = { modelId: 'own-huawei-mate-x6', romram: '16+512 GB', skuIds: [MATE_X6_ID_SKU.sku_id] };
// matrix-only（2026-11-10）：需要真实优势行的跨国用例改用 RU/ID 矩阵双覆盖的
// Mate X7 16+512（旧锚 Mate X6 在 ID 无矩阵对比位，优势恒 0 行）。
const mateX7RuRow = dimProduct.find((row) => row.model_id === 'own-huawei-mate-x7' && row.romram === '16+512 GB' && row.countries.includes('RU'))!;
const MATE_X7_RU = { modelId: 'own-huawei-mate-x7', romram: mateX7RuRow.romram, skuIds: [mateX7RuRow.sku_id] };
const novaRow = dimProduct.find((row) => row.model_id === 'own-huawei-nova-14-pro')!;
const NOVA_RU = { modelId: 'own-huawei-nova-14-pro', romram: novaRow.romram, skuIds: [lowestPriceColorSku(novaRow.model_id, novaRow.romram, 'RU') ?? novaRow.sku_id] };
const puraRow = dimProduct.find((row) => row.model_id === 'own-huawei-pura-90s-pro-max')!;
const PURA_RU = { modelId: 'own-huawei-pura-90s-pro-max', romram: puraRow.romram, skuIds: [lowestPriceColorSku(puraRow.model_id, puraRow.romram, 'RU') ?? puraRow.sku_id] };

const openActionsOf = (actions: AgentCardAction[] | undefined): AgentCardAction[] => (actions ?? []).filter((action) => action.kind === 'open');

describe('R4-M1 · queryCards 全部 open 动作携带完整 filterPatch（无 forcedIntent）', () => {
  it('AE 页问「RU nova 14 Pro 价格趋势」：chart 与 table 的 open 动作带 RU + nova 完整口径', async () => {
    const state = { ...defaultFilters, countryCode: 'AE' as const, mains: buildCards([NOVA_RU], { auto: true, countryCode: 'AE' }), adaptive: false, rangeStart: '202619', rangeEnd: '202642' };
    // 不传 forcedIntent：真实分类链（classifyIntent → query → queryCards）
    const response = await runAgent('RU nova 14 Pro 价格趋势', buildAgentContext('dashboard', state, []));
    expect(response.intent).toBe('query');
    const chart = response.cards.find((card): card is ChartResultCard => card.kind === 'chart');
    const table = response.cards.find((card): card is TableResultCard => card.kind === 'table');
    expect(chart).toBeTruthy();
    expect(table).toBeTruthy();
    for (const action of [...openActionsOf(chart?.actions), ...openActionsOf(table?.actions)]) {
      const patch = action.filterPatch;
      expect(patch, `${action.label} 必须携带 filterPatch`).toBeTruthy();
      expect(patch!.countryCode).toBe('RU');
      expect(patch!.mains?.every((card) => card.main?.modelId === 'own-huawei-nova-14-pro')).toBe(true);
      expect(patch!.mains?.length).toBeGreaterThan(0);
      expect(patch!.granularity).toBe(state.granularity);
      expect(patch!.rangeStart).toBe(state.rangeStart);
      expect(patch!.rangeEnd).toBe(state.rangeEnd);
      expect('platform' in patch!).toBe(true);
    }
    // 结果本身按 RU 计算（scope 标签为请求国），不留在 AE
    expect(chart?.title).toContain('R国');
    expect(chart?.title).toContain('nova 14 Pro');
  });

  it('平台比较（最便宜平台）卡的「定位到看板」同样携带完整 patch', async () => {
    const state = { ...defaultFilters, countryCode: 'RU' as const, mains: buildCards([MATE_X6_RU], { auto: true }) };
    const response = await runAgent('ID 的 Mate X6 最新有价周哪个平台最便宜？', buildAgentContext('dashboard', state, []));
    expect(response.intent).toBe('query');
    const table = response.cards.find((card): card is TableResultCard => card.kind === 'table');
    expect(table?.title).toBe('最新有价周平台比较');
    const openActions = openActionsOf(table?.actions);
    expect(openActions.length).toBeGreaterThan(0);
    const patch = openActions[0].filterPatch;
    expect(patch).toBeTruthy();
    expect(patch!.countryCode).toBe('ID');
    // 平台问题在 ID 上重映射到 16+512（R4-M2），不回落 Mate 80 Pro
    expect(patch!.mains?.some((card) => card.main?.modelId === 'own-huawei-mate-x6' && card.main?.romram === '16+512 GB')).toBe(true);
    expect(patch!.mains?.every((card) => card.main?.modelId !== 'own-huawei-mate-80-pro')).toBe(true);
  });
});

describe('R4-M1 · 组件方向：点「回看板定位」先落地 RU + nova 再导航', () => {
  function Harness() {
    const { openAgent } = useAgent();
    const { state, actions } = useFilters();
    const prepareAeNova = () => actions.set({ countryCode: 'AE', mains: buildCards([NOVA_RU], { auto: true, countryCode: 'AE' }), adaptive: false, rangeStart: '202619', rangeEnd: '202642' });
    return <><button type="button" onClick={prepareAeNova}>准备 AE Nova</button><button type="button" onClick={() => openAgent('dock')}>打开 Agent</button><AgentPanel /><output data-filter-state>{JSON.stringify(state)}</output></>;
  }
  const mounted = () => render(<PageProvider><FiltersProvider><AgentProvider><Harness /></AgentProvider></FiltersProvider></PageProvider>);

  it('AE → 问 RU nova 趋势 → 点回看：筛选落 RU + nova，URL 带 c=RU 与 nova 主品', async () => {
    window.sessionStorage.clear();
    window.history.replaceState(null, '', '/?p=dashboard');
    const view = mounted();
    fireEvent.click(screen.getByRole('button', { name: '准备 AE Nova' }));
    fireEvent.click(screen.getByRole('button', { name: '打开 Agent' }));
    fireEvent.change(screen.getByRole('textbox', { name: '向 PriceLens Agent 提问' }), { target: { value: 'RU nova 14 Pro 价格趋势' } });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));
    const chartCard = await waitFor(() => {
      const found = [...view.baseElement.querySelectorAll('[data-agent-result-card]')].filter((element) => element.textContent?.includes('价格走势')).pop();
      expect(found).toBeTruthy();
      return found as HTMLElement;
    }, { timeout: 5000 });
    void chartCard;
    // 点击按钮必须查活 DOM（消息从 partial 转正式渲染会替换节点，持有旧引用
    // 的 fireEvent 会落在 detached 节点上不触发 handler）；chart 卡的回看按钮
    // 与 table 卡的「回看板下钻」名称互异，按名直查无歧义
    fireEvent.click(screen.getByRole('button', { name: '回看板定位' }));
    await waitFor(() => {
      const next = JSON.parse(view.container.querySelector('[data-filter-state]')?.textContent ?? '{}') as { countryCode?: string; mains?: Array<{ main?: { modelId: string } | null }> };
      expect(next.countryCode).toBe('RU');
      expect((next.mains ?? []).map((card) => card.main?.modelId)).toEqual(['own-huawei-nova-14-pro']);
      expect(window.location.search).toContain('c=RU');
      expect(window.location.search).toContain('main=own-huawei-nova-14-pro');
    });
    view.unmount();
  });
});

describe('R4-M2 · 跨国 queryState 统一保型号重映射', () => {
  it('stateForPriceAdvantageCountry：RU Mate X6 12+512 → ID 直接落 Mate X6 16+512，不落 Mate 80 Pro', () => {
    const state = { ...defaultFilters, countryCode: 'RU' as const, mains: buildCards([MATE_X6_RU], { auto: true }) };
    const next = stateForPriceAdvantageCountry(state, 'ID');
    expect(next.countryCode).toBe('ID');
    expect(next.mains.length).toBe(1);
    expect(selKey(next.mains[0].main!)).toBe(selKey(MATE_X6_ID));
    expect(next.mains[0].main?.modelId).not.toBe('own-huawei-mate-80-pro');
  });

  it('runAgent（无 forcedIntent）：RU Mate X7 问「ID 价格优势」→ 行全部 Mate X7 · ID · 16+512，非 Mate 80', async () => {
    // matrix-only（2026-11-10）：旧锚 Mate X6 在 ID 无矩阵对比位（优势恒 0 行），
    // 改用 RU/ID 矩阵双覆盖的 Mate X7 16+512；「保型号重映射、不落目标国默认
    // 主品（Mate 80 Pro）」的语义不变。
    const state = { ...defaultFilters, countryCode: 'RU' as const, mains: buildCards([MATE_X7_RU], { auto: true }) };
    const response = await runAgent('ID 价格优势', buildAgentContext('dashboard', state, []));
    expect(response.intent).toBe('price_advantage');
    const card = response.cards.find((entry) => entry.kind === 'price_advantage');
    expect(card).toBeTruthy();
    if (card?.kind !== 'price_advantage') return;
    expect(card.rows.length).toBeGreaterThan(0);
    for (const row of card.rows) {
      expect(row.countryCode).toBe('ID');
      expect(row.own.modelId).toBe('own-huawei-mate-x7');
      expect(row.own.romram).toBe('16+512 GB');
      expect(row.own.modelId).not.toBe('own-huawei-mate-80-pro');
    }
    expect(card.rows.some((row) => row.own.price > 0)).toBe(true);
    // 正常重映射不触发回落说明
    expect(card.note).not.toContain('均无在架型号');
  });

  it('queryCards 未点名产品跨国：RU Mate X6 看板问「ID 价格趋势」→ ID + Mate X6（16+512），不换 Mate 80 Pro', async () => {
    const state = { ...defaultFilters, countryCode: 'RU' as const, mains: buildCards([MATE_X6_RU], { auto: true }) };
    const response = await runAgent('ID 价格趋势', buildAgentContext('dashboard', state, []));
    expect(response.intent).toBe('query');
    const chart = response.cards.find((card): card is ChartResultCard => card.kind === 'chart');
    expect(chart).toBeTruthy();
    expect(chart!.title).toContain('印尼');
    // 系列 = Mate X6 的 ID 合法配置（remap 16+512），绝不是目标国默认主品
    expect(chart!.series.some((series) => series.label.includes('Mate X6'))).toBe(true);
    expect(chart!.series.every((series) => !series.label.includes('Mate 80'))).toBe(true);
    expect(response.citations.some((citation) => citation.detail.includes('ID'))).toBe(true);
  });

  it('目标国整体缺型号 → 安全回落默认主品，且结果卡与摘要明确说明', async () => {
    const state = { ...defaultFilters, countryCode: 'RU' as const, mains: buildCards([MATE_X6_RU], { auto: true }) };
    // Mate X6 在 DE 整体缺席 → DE 默认 nova 14 Pro + 显式说明
    const response = await runAgent('DE 价格优势', buildAgentContext('dashboard', state, []));
    const card = response.cards.find((entry) => entry.kind === 'price_advantage');
    expect(card).toBeTruthy();
    if (card?.kind === 'price_advantage') {
      expect(card.note).toContain('均无在架型号');
      expect(card.note).toContain('德国');
      for (const row of card.rows) {
        expect(row.countryCode).toBe('DE');
        expect(row.own.modelId).not.toBe('own-huawei-mate-x6');
      }
    }
    expect(response.summary).toContain('均无在架型号');
  });

  it('priceAdvantageCountryFallbackNote：同国/可重映射 = null；整体缺席 = 带国名说明', () => {
    const ruMateX6 = { ...defaultFilters, countryCode: 'RU' as const, mains: buildCards([MATE_X6_RU], { auto: true }) };
    expect(priceAdvantageCountryFallbackNote(ruMateX6, 'RU')).toBeNull();
    expect(priceAdvantageCountryFallbackNote(ruMateX6, 'ID')).toBeNull();
    expect(priceAdvantageCountryFallbackNote(ruMateX6, 'DE')).toContain('德国');
    // 无我司主品的空看板不触发说明（本来就走默认）
    const empty = { ...defaultFilters, countryCode: 'RU' as const, mains: [] };
    expect(priceAdvantageCountryFallbackNote(empty, 'ID')).toBeNull();
    // Pura 90s Pro Max（RU 在售、ID 整体缺席）
    const ruPura = { ...defaultFilters, countryCode: 'RU' as const, mains: buildCards([PURA_RU], { auto: true }) };
    expect(priceAdvantageCountryFallbackNote(ruPura, 'ID')).toContain('Pura 90s Pro Max');
  });
});
