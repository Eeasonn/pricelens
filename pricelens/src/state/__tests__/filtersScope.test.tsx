// t428u Batch4 二审（2026-11-07）R5：口径切换（switchScope）主品口径保持——
// Agent 跨国结果卡「回看价格走势」的 filterPatch 显式携带 mains 且整组在目标国
// 有效时必须保留，不得被 applyScopeDefaults(force=true) 重算成默认主品；
// 无显式 mains 的普通国家切换仍走快照恢复 / 默认重算。
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { dimProduct } from '../../data';
import { defaultFilters, FiltersProvider, useFilters } from '../FiltersContext';
import { buildCards } from '../mainSelection';
import { lowestPriceColorSku } from '../../dataModel/aggregate';

/** 本 vitest jsdom 环境不带 localStorage（探针实测 sessionStorage 有、localStorage 无）：
 *  装内存桩让 FiltersProvider 的持久化读写与用例间隔离可测（同 configStore.bench.test.ts 桩法）。 */
if (typeof window.localStorage !== 'object') {
  const map = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => { map.set(key, String(value)); },
      removeItem: (key: string) => { map.delete(key); },
      clear: () => { map.clear(); },
      key: (index: number) => [...map.keys()][index] ?? null,
      get length() { return map.size; },
    },
  });
}

afterEach(() => cleanup());

const novaRow = dimProduct.find((row) => row.model_id === 'own-huawei-nova-14-pro')!;
const novaRuSku = lowestPriceColorSku(novaRow.model_id, novaRow.romram, 'RU');
const novaSelection = { modelId: novaRow.model_id, romram: novaRow.romram, skuIds: [novaRuSku ?? novaRow.sku_id] };
/** RU 默认主品（非 Nova）——用于断言「显式 mains 保留」与「默认重算」的差别 */
const ruDefaultModel = 'own-huawei-pura-90s-pro-max';

interface ScopeSnapshot {
  countryCode: string;
  mains: Array<string | null>;
}

function ScopeProbe() {
  const { state, actions } = useFilters();
  const snapshot = (): ScopeSnapshot => ({ countryCode: state.countryCode, mains: state.mains.map((card) => card.main?.modelId ?? null) });
  return (
    <>
      <button type="button" onClick={() => { window.localStorage.clear(); window.sessionStorage.clear(); actions.reset(); }}>重置</button>
      <button type="button" onClick={() => actions.set({ countryCode: 'AE', mains: buildCards([novaSelection], { auto: true, countryCode: 'AE' }) })}>AE 显式 Nova</button>
      <button type="button" onClick={() => actions.set({ countryCode: 'RU', mains: buildCards([novaSelection], { auto: true, countryCode: 'RU' }) })}>RU 显式 Nova</button>
      <button type="button" onClick={() => actions.set({ countryCode: 'GB', mains: buildCards([novaSelection], { auto: true, countryCode: 'GB' }) })}>GB 显式 Nova</button>
      <button type="button" onClick={() => actions.set({ countryCode: 'RU' })}>RU 无显式 mains</button>
      <button type="button" onClick={() => actions.set({ countryCode: 'AE' })}>AE 无显式 mains</button>
      <output data-scope>{JSON.stringify(snapshot())}</output>
    </>
  );
}

function mountedProbe() {
  return render(<FiltersProvider><ScopeProbe /></FiltersProvider>);
}

const scopeOf = (view: ReturnType<typeof mountedProbe>): ScopeSnapshot =>
  JSON.parse(view.container.querySelector('[data-scope]')?.textContent ?? '{}') as ScopeSnapshot;

async function clickAndRead(view: ReturnType<typeof mountedProbe>, name: string): Promise<ScopeSnapshot> {
  fireEvent.click(screen.getByRole('button', { name }));
  await waitFor(() => expect(JSON.parse(view.container.querySelector('[data-scope]')?.textContent ?? '{}')).toBeTruthy());
  return scopeOf(view);
}

describe('R5 switchScope：显式 mains 跨国保留 vs 普通切换原样', () => {
  it('AE(Nova) → 应用带 countryCode:RU + 显式 Nova mains 的 patch：主品仍是 Nova，不是默认 Pura', async () => {
    const view = mountedProbe();
    await clickAndRead(view, '重置');
    await clickAndRead(view, 'AE 显式 Nova');
    // 回看价格走势动作的 patch 形态：countryCode 切换 + 计算卡时的主品口径
    const next = await clickAndRead(view, 'RU 显式 Nova');
    expect(next.countryCode).toBe('RU');
    expect(next.mains).toEqual(['own-huawei-nova-14-pro']);
    expect(next.mains).not.toContain(ruDefaultModel);
    view.unmount();
  });

  it('无显式 mains 的普通国家切换保持原样：不落快照时按新口径重算默认主品', async () => {
    const view = mountedProbe();
    await clickAndRead(view, '重置');
    await clickAndRead(view, 'AE 显式 Nova');
    const next = await clickAndRead(view, 'RU 无显式 mains');
    expect(next.countryCode).toBe('RU');
    // 切走时已把 RU 旧口径写入会话快照（默认 Pura），恢复快照 / 重算默认都不该是 Nova
    expect(next.mains).not.toContain('own-huawei-nova-14-pro');
    expect(next.mains).toContain(ruDefaultModel);
    view.unmount();
  });

  it('普通国家来回切换仍按会话快照还原（R5 不破坏既有快照语义）', async () => {
    const view = mountedProbe();
    await clickAndRead(view, '重置');
    await clickAndRead(view, 'AE 显式 Nova');
    await clickAndRead(view, 'RU 无显式 mains');
    const backAe = await clickAndRead(view, 'AE 无显式 mains');
    expect(backAe.countryCode).toBe('AE');
    expect(backAe.mains).toEqual(['own-huawei-nova-14-pro']);
    view.unmount();
  });

  it('显式 mains 在目标国无效时不硬保留：回落默认重算（不拿缺数据产品冒充）', async () => {
    const view = mountedProbe();
    await clickAndRead(view, '重置');
    await clickAndRead(view, 'AE 显式 Nova');
    // GB 无 Nova 在架：mainsValidFor 为 false → switchScope 走默认重算通道
    const next = await clickAndRead(view, 'GB 显式 Nova');
    expect(next.countryCode).toBe('GB');
    expect(next.mains).not.toContain('own-huawei-nova-14-pro');
    view.unmount();
  });
});
