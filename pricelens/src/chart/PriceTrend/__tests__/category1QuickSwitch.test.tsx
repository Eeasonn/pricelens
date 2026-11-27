// ============================================================
// category1 快切状态契约：主品 / 对比品 / 品牌全景分别更新。
// ============================================================
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Category1QuickSwitch, { applyCategory1Selection, category1OptionsOf } from '../Category1QuickSwitch';
import { FiltersProvider } from '../../../state/FiltersContext';
import { seriesKeyOf } from '../tableModel';
import { buildProductTree, defaultColorSkuIds, ownBrand, type RomramNode } from '../../../components/ProductCascader/tree';
import { defaultFilters } from '../../../state/FiltersContext';
import { selKey } from '../../../state/mainSelection';
import type { MainProduct, ProductSelection } from '../../../state/filtersTypes';

const tree = buildProductTree('phone', 'RU');
const nodes = new Map<string, RomramNode>(tree.flatMap((b) => b.series).flatMap((s) => s.models).flatMap((m) => m.romrams).map((r) => [r.key, r]));
const ownModel = tree.find((b) => b.key === ownBrand())!.series.flatMap((s) => s.models).find((m) => m.label === 'Pura 90s Pro Max')!;
const ownNode = ownModel.romrams.find((r) => r.romram === '12+256 GB')!;
const mainSel: ProductSelection = { modelId: ownModel.modelId, romram: ownNode.romram, skuIds: defaultColorSkuIds(ownNode) };
const appleModel = tree.find((b) => b.key === 'APPLE')!.series.flatMap((s) => s.models).find((m) => m.label === 'iPhone 17 Pro')!;
const appleNode = appleModel.romrams.find((r) => r.romram === '12+256 GB')!;
const compareSel: ProductSelection = { modelId: appleModel.modelId, romram: appleNode.romram, skuIds: defaultColorSkuIds(appleNode) };
const card: MainProduct = { id: 'card-1', main: mainSel, compares: [compareSel], auto: true };

describe('applyCategory1Selection（category1 快切状态）', () => {
  it('主品：只换主品配置，保留卡片与自动匹配语义', () => {
    const next = applyCategory1Selection({ ...defaultFilters, mains: [card] }, mainSel, { ...mainSel, romram: '12+512 GB' });
    expect(next.mains[0].id).toBe('card-1');
    expect(next.mains[0].main?.romram).toBe('12+512 GB');
    expect(next.mains[0].auto).toBe(true);
    expect(next.mains[0].compares[0].romram).toBe('12+512 GB'); // 自动竞品随新主品配置重算
  });

  it('对比品：只换目标项，其他项不动；新配置登记手动来源，旧矩阵项进入排除', () => {
    const next = applyCategory1Selection({ ...defaultFilters, mains: [card] }, compareSel, { ...compareSel, romram: '12+512 GB' });
    const compares = next.mains[0].compares;
    expect(compares).toHaveLength(1);
    expect(compares[0].romram).toBe('12+512 GB');
    expect(next.mains[0].compareSources?.[selKey(compares[0])]).toBe('manual');
    expect(next.mains[0].excluded).toContain(selKey(compareSel));
  });

  it('品牌全景：只换所属品牌目标项，临时基准同步到新配置键', () => {
    const next = applyCategory1Selection({
      ...defaultFilters,
      analysisMode: 'panorama',
      panorama: { brands: [{ brand: 'APPLE', sels: [compareSel] }], sharedY: true, baselineKey: selKey(compareSel) },
    }, compareSel, { ...compareSel, romram: '12+512 GB' });
    expect(next.panorama.brands[0].sels[0].romram).toBe('12+512 GB');
    expect(next.panorama.baselineKey).toBe(selKey(next.panorama.brands[0].sels[0]));
    expect(next.panorama.sharedY).toBe(true);
  });
});

describe('category1OptionsOf（药丸配置候选）', () => {
  it('同型号配置按容量升序，标出当前配置与参考价', () => {
    const options = category1OptionsOf(mainSel, nodes, 'usd');
    expect(options.map((o) => o.selection.romram)).toEqual(['12+256 GB', '12+512 GB']);
    expect(options[0].current).toBe(true);
    expect(options[1].current).toBe(false);
    expect(options.every((o) => !o.disabled)).toBe(true);
    expect(options.every((o) => o.priceText.startsWith('$'))).toBe(true);
  });
});

describe('Category1QuickSwitch（药丸交互）', () => {
  const makeStorage = (): Storage => {
    const map = new Map<string, string>();
    return {
      get length() { return map.size; },
      clear: () => map.clear(),
      getItem: (k: string) => map.get(k) ?? null,
      key: (i: number) => [...map.keys()][i] ?? null,
      removeItem: (k: string) => { map.delete(k); },
      setItem: (k: string, v: string) => { map.set(k, String(v)); },
    };
  };

  it('第二行打开候选并切换主品配置', async () => {
    Object.defineProperty(window, 'localStorage', { value: makeStorage(), configurable: true, writable: true });
    Object.defineProperty(window, 'sessionStorage', { value: makeStorage(), configurable: true, writable: true });
    const series = { key: seriesKeyOf(mainSel), isOwn: true, brand: 'HUAWEI', label: 'HUAWEI Pura 90s Pro Max', skuIds: mainSel.skuIds, color: '#c7000b', points: [] };
    render(<FiltersProvider><Category1QuickSwitch series={series} nodes={nodes} /></FiltersProvider>);
    fireEvent.click(screen.getByRole('button', { name: /切换 Pura 90s Pro Max 的 category1/ }));
    fireEvent.click(await screen.findByRole('menuitemradio', { name: /12\+512 GB/ }));
    await waitFor(() => {
      const saved = JSON.parse(window.localStorage.getItem('LPL3.filters') ?? '{}');
      expect(saved.mains[0].main.romram).toBe('12+512 GB');
      expect(saved.mains[0].auto).toBe(true);
    });
    expect(screen.queryByRole('menu')).toBeNull();
    cleanup();
  });
});
