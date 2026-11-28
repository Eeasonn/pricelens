// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { FiltersProvider, useFilters } from '../../../state/FiltersContext';
import type { FiltersActions, FiltersState } from '../../../state/filtersTypes';
import { currentPricesByGroup, type GroupPriceEntry } from '../../../dataModel/tierPrice';
import { selKey } from '../../../state/mainSelection';
import { dimProduct } from '../../../data';
import { brandOfModel, productHasDataInCountry } from '../../ProductCascader/tree';
import { PickerPanel } from '../ProductPickerModal';

beforeEach(() => {
  const w = window as unknown as { localStorage?: Storage };
  if (!w.localStorage) {
    const mem = new Map<string, string>();
    const shim: Storage = {
      getItem: (k) => mem.get(k) ?? null,
      setItem: (k, v) => void mem.set(k, String(v)),
      removeItem: (k) => void mem.delete(k),
      clear: () => void mem.clear(),
      key: (i) => [...mem.keys()][i] ?? null,
      get length() { return mem.size; },
    };
    Object.defineProperty(w, 'localStorage', { configurable: true, value: shim });
  }
  window.history.replaceState(null, '', '/?p=dashboard');
  sessionStorage.clear();
  try { localStorage.clear(); } catch { /* ignore */ }
});

afterEach(cleanup);

let currentState: FiltersState | null = null;
let currentActions: FiltersActions | null = null;

function Probe(): ReactNode {
  const { state, actions } = useFilters();
  currentState = state;
  currentActions = actions;
  return null;
}

function renderBoard(): void {
  currentState = null;
  currentActions = null;
  render(<FiltersProvider><Probe /><PickerPanel /></FiltersProvider>);
  fireEvent.click(screen.getByText('按档位'));
}

function boardEntries(): GroupPriceEntry[] {
  const state = currentState!;
  const dataKeys = new Set<string>();
  for (const product of dimProduct) {
    if (product.industry !== state.industry) continue;
    if (productHasDataInCountry(product, state.countryCode, state.financingType, state.financingTerms)) {
      dataKeys.add(selKey({ modelId: product.model_id, romram: product.romram, skuIds: [] }));
    }
  }
  return [...currentPricesByGroup(state.industry, state.countryCode).values()].filter((entry) => dataKeys.has(selKey(entry.sel)));
}

const rowsOf = (element: HTMLElement): HTMLElement[] => within(element).queryAllByTestId('tier-board-row');

function expandNoPrice(board: HTMLElement): void {
  for (const button of within(board).queryAllByRole('button', { expanded: false })) {
    if (/暂无数据/.test(button.textContent ?? '')) fireEvent.click(button);
  }
}

function anchorCandidate(board: HTMLElement, entries: GroupPriceEntry[]): HTMLElement {
  const anchorBrand = within(board).getAllByTestId('tier-board-column')[0].getAttribute('data-brand')!;
  const otherBands = new Set(entries.filter((entry) => brandOfModel(entry.sel.modelId) !== anchorBrand && entry.tier).map((entry) => entry.tier));
  const row = rowsOf(within(board).getAllByTestId('tier-board-column')[0]).find((item) => {
    const band = item.getAttribute('data-band');
    return band != null && otherBands.has(band);
  });
  expect(row).toBeTruthy();
  return row!;
}

describe('按档位看板（单主产品与清爽选择）', () => {
  it('默认我司在最左，行数只按型号计算，不显示数量、价格或营销化说明', () => {
    renderBoard();
    const board = screen.getByTestId('tier-board');
    const columns = within(board).getAllByTestId('tier-board-column');
    expect(columns.length).toBeGreaterThan(1);
    expect(columns[0].getAttribute('data-anchor')).toBe('true');
    expect(within(columns[0]).getByRole('combobox', { name: '主产品品牌' })).toBeTruthy();
    expect(within(board).queryByTestId('tier-board-count')).toBeNull();
    expect(within(board).queryByTestId('tier-board-price')).toBeNull();
    expect(board.textContent).not.toContain('实线蓝框');
    expect(board.textContent).not.toContain('虚线框');
    const bands = within(board).getAllByTestId('tier-board-band').map((node) => node.textContent ?? '');
    expect(bands.every((text) => !/起售|旗舰|入门/.test(text))).toBe(true);
    expandNoPrice(board);
    const entries = boardEntries();
    for (const column of columns) {
      const brand = column.getAttribute('data-brand')!;
      const models = new Set(entries.filter((entry) => brandOfModel(entry.sel.modelId) === brand).map((entry) => entry.sel.modelId));
      expect(rowsOf(column)).toHaveLength(models.size);
    }
    fireEvent.click(screen.getByRole('button', { name: '清空当前档位草稿' }));
    expect((screen.getByRole('button', { name: '应用本组' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('配置下拉只显示配置名，切换后更新当前配置而不显示价格', async () => {
    renderBoard();
    const board = screen.getByTestId('tier-board');
    const entries = boardEntries();
    const byModel = new Map<string, GroupPriceEntry[]>();
    for (const entry of entries) byModel.set(entry.sel.modelId, [...(byModel.get(entry.sel.modelId) ?? []), entry]);
    const [modelId, list] = [...byModel.entries()].find(([, items]) => new Set(items.filter((entry) => entry.price.usd != null).map((entry) => Math.round(entry.price.usd!))).size >= 2)!;
    const row = board.querySelector(`[data-testid="tier-board-row"][data-model="${modelId}"]`) as HTMLElement;
    const chip = within(row).getByTestId('tier-board-config-chip');
    const before = chip.getAttribute('aria-label');
    fireEvent.click(chip);
    const options = await waitFor(() => {
      const found = screen.getAllByTestId('tier-board-config-option');
      expect(found).toHaveLength(list.length);
      return found;
    });
    expect(options.every((option) => !option.textContent?.includes('$'))).toBe(true);
    const target = options.find((option) => option.getAttribute('aria-selected') === 'false' && !(option as HTMLButtonElement).disabled)!;
    fireEvent.click(target);
    const moved = board.querySelector(`[data-model="${modelId}"]`) as HTMLElement;
    expect(within(moved).getByTestId('tier-board-config-chip').getAttribute('aria-label')).not.toBe(before);
    expect(within(row).queryByTestId('tier-board-price')).toBeNull();
  });

  it('推荐框只提示其他品牌候选，主产品所在列不绘制候选外框', async () => {
    renderBoard();
    const board = screen.getByTestId('tier-board');
    fireEvent.click(screen.getByRole('button', { name: '清空当前档位草稿' }));
    const anchorRow = anchorCandidate(board, boardEntries());
    fireEvent.click(within(anchorRow).getByRole('radio'));
    await waitFor(() => expect(board.querySelectorAll('[data-recommendation="nearest"]').length).toBeGreaterThan(0));
    const columns = within(board).getAllByTestId('tier-board-column');
    expect(columns[0].querySelector('[data-testid^="tier-outline-"]')).toBeNull();
    expect(columns.slice(1).some((column) => column.querySelector('[data-testid^="tier-outline-"]'))).toBe(true);
  });

  it('单主产品推荐集合按连续区域出现，应用只更新当前组并可撤销', async () => {
    renderBoard();
    const board = screen.getByTestId('tier-board');
    const before = currentState!.mains;
    fireEvent.click(screen.getByRole('button', { name: '清空当前档位草稿' }));
    const anchorRow = anchorCandidate(board, boardEntries());
    fireEvent.click(within(anchorRow).getByRole('radio'));
    await waitFor(() => expect(board.querySelectorAll('[data-recommendation="nearest"]').length).toBeGreaterThan(0));
    expect(board.querySelectorAll('[data-testid^="tier-outline-"]').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: '应用本组' }));
    expect(screen.getByTestId('tier-undo')).toBeTruthy();
    expect(currentState!.mains).toHaveLength(before.length);
    expect(currentState!.mains[0].id).toBe(before[0]?.id);
    expect(currentState!.mains[0].main?.modelId).toBe(anchorRow.getAttribute('data-model'));
    expect(currentState!.mains[0].auto).toBe(false);
    const undo = await screen.findByRole('button', { name: '撤销' });
    expect(undo.closest('[data-testid="tier-undo"]')).not.toBeNull();
    fireEvent.click(undo);
    expect(currentState!.mains).toEqual(before);
    void currentActions;
  });

  it('新建对比组只追加一组，不覆盖已有组；初始主品使用单选态', () => {
    renderBoard();
    const before = currentState!.mains;
    const firstMain = before.find((card) => card.main != null)?.main;
    expect(firstMain).toBeTruthy();
    const existingRow = screen.getByTestId('tier-board').querySelector(`[data-testid="tier-board-row"][data-model="${firstMain!.modelId}"]`);
    if (existingRow) expect((within(existingRow as HTMLElement).getByRole('radio') as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '新建对比组' }));
    const anchorRow = anchorCandidate(screen.getByTestId('tier-board'), boardEntries());
    fireEvent.click(within(anchorRow).getByRole('radio'));
    fireEvent.click(screen.getByRole('button', { name: '创建对比组' }));
    expect(screen.getByTestId('tier-undo')).toBeTruthy();
    expect(currentState!.mains).toHaveLength(before.length + 1);
    expect(currentState!.mains.slice(0, before.length).map((card) => card.id)).toEqual(before.map((card) => card.id));
    expect(currentState!.mains[currentState!.mains.length - 1]?.main?.modelId).toBe(anchorRow.getAttribute('data-model'));
    expect(currentState!.mains[currentState!.mains.length - 1]?.auto).toBe(false);
  });

  it('默认按当前对比配置的价格降序，名称切换为自然倒序', () => {
    renderBoard();
    const board = screen.getByTestId('tier-board');
    const column = within(board).getAllByTestId('tier-board-column')[1];
    const priceOf = (row: HTMLElement): number | null => boardEntries().find((entry) => selKey(entry.sel) === row.getAttribute('data-config'))?.price.usd ?? null;
    for (const section of within(column).getAllByTestId('tier-board-band')) {
      const sectionRoot = section.parentElement!;
      const prices = rowsOf(sectionRoot).map(priceOf).filter((value): value is number => value != null);
      expect(prices).toEqual([...prices].sort((a, b) => b - a));
    }
    fireEvent.click(screen.getByText('名称'));
    for (const section of within(column).getAllByTestId('tier-board-band')) {
      const names = rowsOf(section.parentElement!).map((row) => row.querySelector('[title]')?.textContent ?? '');
      expect(names).toEqual([...names].sort((a, b) => b.localeCompare(a, undefined, { numeric: true })));
    }
  });

  it('展示配置与所在档位按主品比较价重排，不再使用错位的起售配置', async () => {
    renderBoard();
    const board = screen.getByTestId('tier-board');
    fireEvent.click(screen.getByRole('button', { name: '清空当前档位草稿' }));
    const mainId = dimProduct.find((product) => product.model_name === 'Pura 90s Pro Max')!.model_id;
    const mainRow = board.querySelector(`[data-model="${mainId}"]`) as HTMLElement;
    fireEvent.click(within(mainRow).getByRole('radio'));
    const modelId = dimProduct.find((product) => product.model_name === 'S26')!.model_id;
    const row = await waitFor(() => {
      const found = board.querySelector(`[data-model="${modelId}"]`) as HTMLElement;
      expect(found.getAttribute('data-band')).toBe('1000+');
      return found;
    });
    expect(within(row).getByTestId('tier-board-config-chip').getAttribute('aria-label')).toContain('12+512 GB');
  });

  it('有合适候选的品牌列均有最近项；最近框嵌在同档整体框内且不再绝对定位', async () => {
    renderBoard();
    const board = screen.getByTestId('tier-board');
    fireEvent.click(screen.getByRole('button', { name: '清空当前档位草稿' }));
    const mainId = dimProduct.find((product) => product.model_name === 'Pura 90s Pro Max')!.model_id;
    const mainRow = board.querySelector(`[data-model="${mainId}"]`) as HTMLElement;
    fireEvent.click(within(mainRow).getByRole('radio'));
    await waitFor(() => expect(board.querySelectorAll('[data-recommendation="nearest"]').length).toBeGreaterThan(0));
    const columns = within(board).getAllByTestId('tier-board-column').filter((column) => column.getAttribute('data-anchor') !== 'true');
    for (const column of columns) {
      if (rowsOf(column).some((row) => row.getAttribute('data-recommendation'))) {
        expect(rowsOf(column).some((row) => row.getAttribute('data-recommendation') === 'nearest')).toBe(true);
      }
    }
    const nearest = board.querySelector<HTMLElement>('[data-testid="tier-outline-nearest"]')!;
    expect(nearest.style.position).not.toBe('absolute');
    expect(nearest.parentElement?.getAttribute('data-testid')).toBe('tier-outline-same');
    const samsung = columns.find((column) => column.getAttribute('data-brand') === 'SAMSUNG')!;
    const same = samsung.querySelector<HTMLElement>('[data-testid="tier-outline-same"]')!;
    const adjacent = samsung.querySelector<HTMLElement>('[data-testid="tier-outline-adjacent"]')!;
    expect(same.style.borderColor).not.toBe(adjacent.style.borderColor);
    const nearestModels = within(samsung).getAllByTestId('tier-outline-nearest').flatMap((frame) => within(frame).queryAllByTestId('tier-board-row').map((row) => row.getAttribute('data-model')));
    expect(nearestModels).toEqual([
      dimProduct.find((product) => product.model_name === 'S25+')!.model_id,
      dimProduct.find((product) => product.model_name === 'Galaxy Z Flip8')!.model_id,
    ]);
  });
});
