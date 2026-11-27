// ============================================================
// 按档位看板组件回归（2026-11-28 二版「一行一款」）：真实 FiltersProvider + 真实数据。
// 覆盖：锚列最左；每列行数 = 该品牌型号数（配置不逐条铺开）、列头「N 款」；
// 配置 chip 打开 Popover 换配置 → 行价随之变；勾锚定行 → 非锚列出现同档提示
// （data-hint + sr-only「同档（配置）」）；按提示全选同档 + 应用整表替换 mains
// （每勾选锚一组、来源 tier、auto:false）+ 撤销恢复；初始勾选来自 mains。
// 行按计算数据选取，不写死型号；不依赖 currentPricesByGroup 的键格式。
// ============================================================
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
import TierBoardPicker from '../TierBoardPicker';

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
      get length() {
        return mem.size;
      },
    };
    Object.defineProperty(w, 'localStorage', { configurable: true, value: shim });
  }
  window.history.replaceState(null, '', '/?p=dashboard');
  sessionStorage.clear();
  try { localStorage.clear(); } catch { /* 内存桩缺失时忽略 */ }
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

function renderBoard(onApplied = vi.fn()): { onApplied: ReturnType<typeof vi.fn> } {
  currentState = null;
  currentActions = null;
  render(
    <FiltersProvider>
      <Probe />
      <TierBoardPicker onApplied={onApplied} />
    </FiltersProvider>,
  );
  return { onApplied };
}

/** 计算数据（与组件同口径）：板上配置 = 批量裁定 ∩ 该国有数据（selKey 比较） */
function boardEntries(): GroupPriceEntry[] {
  const s = currentState!;
  const dataKeys = new Set<string>();
  for (const p of dimProduct) {
    if (p.industry !== s.industry) continue;
    if (productHasDataInCountry(p, s.countryCode, s.financingType, s.financingTerms)) {
      dataKeys.add(selKey({ modelId: p.model_id, romram: p.romram, skuIds: [] }));
    }
  }
  return [...currentPricesByGroup(s.industry, s.countryCode).values()].filter((e) => dataKeys.has(selKey(e.sel)));
}

const rowsOf = (el: HTMLElement): HTMLElement[] => within(el).queryAllByTestId('tier-board-row');

/** 展开全部「暂无现价」段（默认折叠） */
function expandNoPrice(board: HTMLElement): void {
  for (const btn of within(board).queryAllByRole('button', { expanded: false })) {
    if (/暂无现价/.test(btn.textContent ?? '')) fireEvent.click(btn);
  }
}

describe('按档位看板（真实数据 · 一行一款）', () => {
  it('锚列最左且默认我司；每列行数 = 型号数、列头「N 款」；清空后应用禁用', () => {
    renderBoard();
    const board = screen.getByTestId('tier-board');
    const cols = within(board).getAllByTestId('tier-board-column');
    expect(cols.length).toBeGreaterThan(1);
    expect(cols[0].getAttribute('data-anchor')).toBe('true');
    expect(cols[0].querySelector('[aria-label="锚定品牌"]')).not.toBeNull();
    expect(board.textContent).toContain('实线蓝框 = 与已选');
    expect(board.textContent).toContain('虚线框 = 相邻档（±1）');
    // 价格分段标签带「起售 · 」前缀（无现价段除外）
    const bands = within(board).getAllByTestId('tier-board-band').map((b) => b.textContent ?? '');
    expect(bands.filter((t) => !/暂无现价/.test(t)).every((t) => t.startsWith('起售 · '))).toBe(true);
    expandNoPrice(board);
    const entries = boardEntries();
    for (const col of cols) {
      const brand = col.getAttribute('data-brand')!;
      const models = new Set(entries.filter((e) => brandOfModel(e.sel.modelId) === brand).map((e) => e.sel.modelId));
      expect(rowsOf(col)).toHaveLength(models.size);
      expect(within(col).getByTestId('tier-board-count').textContent).toBe(`${models.size} 款`);
    }
    // 数据里确有多配置型号（即确实被收成了一行）
    const anyMulti = entries.length > new Set(entries.map((e) => e.sel.modelId)).size;
    expect(anyMulti).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '清空按档位勾选' }));
    const applyBtn = screen.getByRole('button', { name: /^应用（0）$/ }) as HTMLButtonElement;
    expect(applyBtn.disabled).toBe(true);
  });

  it('配置 chip → Popover 列出全部配置；换配置后行价 / chip 随之变化', async () => {
    renderBoard();
    const board = screen.getByTestId('tier-board');
    fireEvent.click(screen.getByRole('button', { name: '清空按档位勾选' }));
    // 找一款「至少两个配置有不同现价」的型号
    const entries = boardEntries();
    const byModel = new Map<string, GroupPriceEntry[]>();
    for (const e of entries) byModel.set(e.sel.modelId, [...(byModel.get(e.sel.modelId) ?? []), e]);
    const [modelId, list] = [...byModel.entries()].find(([, l]) => new Set(l.filter((e) => e.price.usd != null).map((e) => Math.round(e.price.usd!))).size >= 2)!;
    expect(modelId).toBeTruthy();
    const row = board.querySelector(`[data-testid="tier-board-row"][data-model="${modelId}"]`) as HTMLElement;
    expect(row).not.toBeNull();
    const priceBefore = within(row).getByTestId('tier-board-price').textContent;
    const chip = within(row).getByTestId('tier-board-config-chip');
    const labelBefore = chip.getAttribute('aria-label');
    expect(labelBefore).toMatch(/^更换配置：.+ 当前 /);
    fireEvent.click(chip);
    const options = await waitFor(() => {
      const opts = screen.getAllByTestId('tier-board-config-option');
      expect(opts).toHaveLength(list.length);
      return opts;
    });
    const target = options.find((o) => o.getAttribute('aria-selected') === 'false' && !/暂无现价/.test(o.textContent ?? '') && !(o.textContent ?? '').includes(priceBefore ?? '###'))!;
    expect(target).toBeTruthy();
    fireEvent.click(target);
    const priceAfter = within(row).getByTestId('tier-board-price').textContent;
    expect(priceAfter).not.toBe(priceBefore);
    expect(within(row).getByTestId('tier-board-config-chip').getAttribute('aria-label')).not.toBe(labelBefore);
  });

  it('勾锚定行 → 非锚列出现同档提示（含配置文本）；全选同档 + 应用替换 mains 并可撤销', async () => {
    const { onApplied } = renderBoard();
    const board = screen.getByTestId('tier-board');
    const cols = within(board).getAllByTestId('tier-board-column');
    const anchorColEl = cols[0];
    const anchorBrand = anchorColEl.getAttribute('data-brand')!;
    const entries = boardEntries();
    // 锚行候选：起售配置落档后，非锚品牌有任一配置同档
    const otherBands = new Set(entries.filter((e) => brandOfModel(e.sel.modelId) !== anchorBrand && e.tier).map((e) => e.tier));
    const mainsBefore = currentState!.mains;
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: '清空按档位勾选' }));
    });
    const anchorRow = rowsOf(anchorColEl).find((r) => {
      const b = r.getAttribute('data-band');
      return b && otherBands.has(b);
    })!;
    expect(anchorRow).toBeTruthy();
    const band = anchorRow.getAttribute('data-band')!;
    fireEvent.click(within(anchorRow).getByRole('checkbox'));
    const hinted = board.querySelectorAll('[data-testid="tier-board-row"][data-hint="same"]');
    expect(hinted.length).toBeGreaterThan(0);
    expect(hinted[0].getAttribute('data-band')).toBe(band);
    expect(hinted[0].textContent).toMatch(/同档/);
    // 提示由某配置驱动：sr-only 文案带配置（有配置层级的产业）
    expect([...hinted].some((h) => /同档（.+）/.test(h.textContent ?? ''))).toBe(true);
    // chip 提示样式只出现在「显示配置 ≠ 起售」的行，且 tooltip 带起售配置说明
    for (const r of board.querySelectorAll<HTMLElement>('[data-testid="tier-board-row"][data-chip-hint="same"],[data-testid="tier-board-row"][data-chip-hint="adjacent"]')) {
      const c = r.querySelector('[data-testid="tier-board-config-chip"],[data-testid="tier-board-config-text"]');
      expect(c?.getAttribute('title') ?? '').toMatch(/与已选 .+ (同档|相邻档)；起售配置 /);
    }
    fireEvent.click(screen.getByRole('button', { name: '按提示全选同档' }));
    const applyBtn = screen.getByRole('button', { name: /应用（/ }) as HTMLButtonElement;
    expect(applyBtn.disabled).toBe(false);
    const n = Number(applyBtn.textContent!.replace(/\D/g, ''));
    expect(n).toBe(1 + hinted.length);
    act(() => {
      fireEvent.click(applyBtn);
    });
    expect(onApplied).toHaveBeenCalledTimes(1);
    expect(currentState!.mains).toHaveLength(1);
    const card = currentState!.mains[0];
    expect(card.auto).toBe(false);
    expect(card.main?.modelId).toBe(anchorRow.getAttribute('data-model'));
    expect(card.compares.length).toBe(hinted.length);
    expect(Object.values(card.compareSources ?? {}).every((s) => s === 'tier')).toBe(true);
    await waitFor(() => expect(document.body.textContent).toContain('已按档位生成'));
    const undo = await waitFor(() => {
      const btn = document.querySelector('.ant-message button');
      expect(btn).toBeTruthy();
      return btn as HTMLElement;
    });
    act(() => {
      fireEvent.click(undo);
    });
    expect(currentState!.mains).toEqual(mainsBefore);
    void currentActions;
  });

  it('初始勾选来自当前 mains：主品所在型号勾上、chip 显示该配置', () => {
    renderBoard();
    const firstMain = currentState!.mains.find((c) => c.main != null)?.main;
    expect(firstMain).toBeTruthy();
    const onBoard = boardEntries().some((e) => selKey(e.sel) === selKey(firstMain!));
    if (!onBoard) return;
    const board = screen.getByTestId('tier-board');
    expandNoPrice(board);
    const row = board.querySelector(`[data-testid="tier-board-row"][data-model="${firstMain!.modelId}"]`) as HTMLElement;
    expect(row).not.toBeNull();
    expect((within(row).getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
    const chip = within(row).queryByTestId('tier-board-config-chip');
    if (chip) expect(chip.getAttribute('aria-label')).toContain(firstMain!.romram);
  });
});
