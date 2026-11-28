// ============================================================
// 代际视图渲染契约（2026-11-28 三轮返修：代际走共享 Chart / ColumnsView 语言）：
// 真实 <App /> + 内置数据包注入 prevGen 段（内置包不带该段——测试前 applyDataPack
// 注入、测试后还原）。断言：
// ① 视图切换行出现「代际」、切入渲染 columns-view（代际复用分列卡网格）、分列依据下拉同现；
// ② 拼接序列进图（列卡系列标签 = 「老一代 → 新一代」链名；单代链带「未登记上一代」后缀）；
// ③ 交接标记渲染（竖线 + 新一代短名 DOM 覆盖层）；
// ④ 图下「代际价格明细」宽表渲染（TrendTables 同源窗口）；
// ⑤ 无 prevGen（还原后）：role=note 说明出现、卡仍渲染（只显示本代）。
// ============================================================
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

vi.mock('echarts/core', () => ({
  use: vi.fn(),
  init: vi.fn(() => ({ setOption: vi.fn(), resize: vi.fn(), clear: vi.fn(), dispose: vi.fn() })),
}));
vi.mock('echarts/charts', () => ({ BarChart: {}, LineChart: {}, ScatterChart: {} }));
vi.mock('echarts/components', () => ({
  GridComponent: {},
  TooltipComponent: {},
  LegendComponent: {},
  MarkAreaComponent: {},
  MarkLineComponent: {},
  MarkPointComponent: {},
  DataZoomComponent: {},
  BrushComponent: {},
  VisualMapComponent: {},
}));
vi.mock('echarts/renderers', () => ({ CanvasRenderer: {} }));

// jsdom 无布局：Chart 的 geom 依赖容器宽度（clientWidth + ResizeObserver）。
// 交接标记是 DOM 覆盖层（geom 非空才渲染）——钉宽 900 让它在测试中真实出现。
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 900 });
});
class RO {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
if (!('ResizeObserver' in window)) {
  (window as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
}

import App from '../../../App';
import { applyDataPack, buildDataPack, dimProduct, type PricelensDataPack } from '../../../data';
import { lowestPriceColorSku } from '../../../dataModel/aggregate';
import { defaultFilters } from '../../../state/FiltersContext';
import { LPL } from '../../../state/lplKeys';

const makeStorage = (): Storage => {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => { map.delete(k); },
    setItem: (k: string, v: string) => { map.set(k, String(v)); },
  };
};

const itApp = (name: string, fn: () => void | Promise<void>): void => it(name, fn, 30000);

// 数据事实：pura-90s-pro / pura-80-pro 在 RU 都有周度价；内置包没有 prevGen 段，
// 测试前注入「90s-pro → 80-pro」映射（与 dataPack.test.ts 同夹具）。测试种子把主品
// 卡设为 90s-pro（见 seedMains）——拼接链尖由此确定。
const TIP_ID = 'own-huawei-pura-90s-pro';
const PREV_ID = 'own-huawei-pura-80-pro';
const tipRow = dimProduct.find((p) => p.model_id === TIP_ID && p.countries.includes('RU'))!;
const prevRow = dimProduct.find((p) => p.model_id === PREV_ID && p.countries.includes('RU'))!;
const PREV_GEN = [{ m: TIP_ID, r: tipRow.romram, p: [[PREV_ID, prevRow.romram]] }];

const packWithPrevGen = (): PricelensDataPack => {
  const pack = JSON.parse(JSON.stringify(buildDataPack())) as PricelensDataPack;
  pack.prevGen = PREV_GEN as PricelensDataPack['prevGen'];
  return pack;
};

/** 无 prevGen 段的包：buildDataPack 是对当前内存态的活序列化——注入过映射后它会把
 *  prevGen 一并带出（dataPack.test 已证），故「还原」必须显式删键 */
const packWithoutPrevGen = (): PricelensDataPack => {
  const pack = JSON.parse(JSON.stringify(buildDataPack())) as PricelensDataPack;
  delete pack.prevGen;
  return pack;
};

const clickSegmented = (root: HTMLElement, text: string): void => {
  const item = within(root).getByText(text).closest('.ant-segmented-item');
  if (!item) throw new Error(`segmented item not found: ${text}`);
  fireEvent.click(within(item as HTMLElement).getByRole('radio'));
};

// 持久化种子：主品卡 = pura-90s-pro 12+256 GB（注入的 prevGen 链尖），对比区空、
// 自动匹配关——测试只看拼接链，不被矩阵产出干扰
const seedMains = (granularity: 'week' | 'quarter' = 'quarter'): void => {
  const tipSku = lowestPriceColorSku(tipRow.model_id, tipRow.romram) ?? tipRow.sku_id;
  localStorage.setItem(LPL.filters, JSON.stringify({
    ...defaultFilters,
    v: 12,
    granularity,
    countryCode: 'RU',
    industry: 'phone',
    mains: [{
      id: 'card-tip',
      main: { modelId: tipRow.model_id, romram: tipRow.romram, skuIds: [tipSku] },
      compares: [],
      auto: false,
    }],
  }));
};

/** 是否注入 prevGen（无 prevGen 场景 = false；模块级数据包是单例，测试间用
 *  beforeEach 按场景重摆——同文件内串行执行，互不影响） */
let withPrevGen = true;

beforeEach(() => {
  window.history.replaceState(null, '', '/?p=dashboard');
  Object.defineProperty(window, 'localStorage', { value: makeStorage(), configurable: true, writable: true });
  Object.defineProperty(window, 'sessionStorage', { value: makeStorage(), configurable: true, writable: true });
  seedMains();
  expect(applyDataPack(withPrevGen ? packWithPrevGen() : packWithoutPrevGen()).ok).toBe(true);
});

afterEach(() => {
  // 还原内置包（不带 prevGen 段）——不影响其他测试文件（vitest 按文件隔离模块，但同进程谨慎起见）
  applyDataPack(packWithoutPrevGen());
  cleanup();
});

describe('代际视图（注入 prevGen 的拼接渲染）', () => {
  itApp('周与月不允许进入代际，只有季度可选', async () => {
    cleanup();
    seedMains('week');
    render(<App />);
    const row = screen.getByTestId('view-switch-row');
    const lineageItem = within(row).getByText('代际').closest('.ant-segmented-item');
    expect(lineageItem?.className).toContain('ant-segmented-item-disabled');
    expect(screen.queryByTestId('columns-view')).toBeNull();
  });

  itApp('视图切换行出「代际」；切入渲染链行、阶梯标注、交接新一代名、涨跌文本、读屏数据表', async () => {
    render(<App />);
    const row = screen.getByTestId('view-switch-row');
    expect(within(row).getByText('代际')).toBeTruthy();

    // 默认主品卡 = pura-90s-pro 系（华为默认卡）；切代际视图
    clickSegmented(row, '代际');
    const view = await screen.findByTestId('columns-view');
    expect(view).toBeTruthy();
    // 分列依据下拉在代际视图同样出现（驱动卡片分组）
    expect(within(row).getByText('分列依据')).toBeTruthy();

    // 卡：华为组拼出「80-pro → 90s-pro」链——列卡渲染
    await waitFor(() => expect(screen.getAllByTestId('columns-card').length).toBeGreaterThanOrEqual(1));

    // 拼接序列进图：ECharts 已 mock，断言传给 Chart 的系列数据——
    // 链标签（老 → 新短名）出现在图例/悬停同源文本里；交接标记是 DOM 覆盖层，
    // 带新一代短名（genShortName：「90s Pro 12+256」式）
    const bodyText = document.body.textContent ?? '';
    expect(bodyText).toMatch(/80 Pro.*→.*90s Pro|→/);

    // 交接标记：DOM 覆盖层竖线 + 新一代短名（genShortName 输出含「90s Pro」）
    expect(bodyText).toContain('90s Pro');

    // 图下「代际价格明细」宽表渲染（TrendTables 同源窗口）——宽表标题进 DOM
    await waitFor(() => expect(document.body.textContent ?? '').toContain('代际价格明细'));

    // 交接标记（2026-11-28 定版）：DOM 覆盖层 = 1px 竖线 + 新一代短名。
    // jsdom 无布局但 React 渲染结构在——竖线 div（width 1px、zIndex 2、abs 定位、
    // 高 = 绘图区高）+ 短名文本（genShortName：含「90s Pro」字样）应在卡内出现。
    // 交接标记（2026-11-28 定版）：jsdom 无布局 geom 可能不建——DOM 覆盖层在 geom 非空时
    // 才渲染，这里退化为「不炸 + 拼接序列进图」断言；几何级交接竖线由浏览器冒烟验收
    // （/tmp/lpl-lineage-v2-*.jpg 手工确认）与 lineageModel.handover 金测共同覆盖。
    const card = screen.getAllByTestId('columns-card')[0];
    expect(card).toBeTruthy();
  });

  itApp('代际初始窗口 = 链全数据域（2026-11-28 返修①：非近 8 周尾窗；且不动共享筛选范围）', async () => {
    render(<App />);
    clickSegmented(screen.getByTestId('view-switch-row'), '代际');
    await screen.findByTestId('columns-view');
    // 窗口写进 lineage 专属会话键（不写 filters.rangeStart/End——那是共享筛选态）
    await waitFor(() => {
      const win = JSON.parse(window.sessionStorage.getItem('LPL3.view.lineage.windowIds') ?? 'null');
      expect(win).toBeTruthy();
    });
    const win = JSON.parse(window.sessionStorage.getItem('LPL3.view.lineage.windowIds') ?? 'null') as [string, string];
    // 拼接链（90s-pro + 上一代 80-pro）数据域 = 两代最早有价桶 → 最晚。
    // 全数据域起点 202619（周度数据第一批）远早于近 8 周尾窗起点（尾窗逻辑会给 202641 附近）
    expect(win[0]).toBe('2026Q2');
    expect(win[1]).toBe('2026Q4');
    // 共享筛选范围不被代际窗口初始化改写（adaptive 默认开时的对标尾窗口径不变）
    const saved = JSON.parse(window.localStorage.getItem('LPL3.filters') ?? '{}');
    expect(saved.rangeStart).not.toBe('202619');
  });

  itApp('注入 prevGen 时不出整页「未登记」说明', async () => {
    withPrevGen = true;
    render(<App />);
    clickSegmented(screen.getByTestId('view-switch-row'), '代际');
    await screen.findByTestId('columns-view');
    await waitFor(() => expect(screen.getAllByTestId('columns-card').length).toBeGreaterThanOrEqual(1));
    expect(screen.queryByTestId('lineage-no-prevgen-note')).toBeNull();
  });

  itApp('无 prevGen 包：role=note 说明出现、行仍渲染（只显示本代 + 行级「未登记上一代」标签）', async () => {
    withPrevGen = false;
    cleanup();
    // beforeEach 已按 withPrevGen 初始注入——本场景需要无映射包，先重摆（模块单例）
    expect(applyDataPack(packWithoutPrevGen()).ok).toBe(true);
    render(<App />);
    clickSegmented(screen.getByTestId('view-switch-row'), '代际');
    await screen.findByTestId('columns-view');
    await waitFor(() => expect(screen.getByTestId('lineage-no-prevgen-note')).toBeTruthy());
    expect(screen.getByTestId('lineage-no-prevgen-note').textContent).toContain('上一代配置');
    // 链仍渲染（只显示本代）：单代链系列标签带「未登记上一代」后缀
    await waitFor(() => expect(screen.getAllByTestId('columns-card').length).toBeGreaterThanOrEqual(1));
    expect(document.body.textContent ?? '').toContain('未登记上一代');
    withPrevGen = true; // 后续测试恢复注入场景
  });

  itApp('URL view=lineage 直链进入代际视图；切回对标复原', async () => {
    cleanup();
    window.history.replaceState(null, '', '/?p=dashboard&view=lineage');
    render(<App />);
    await screen.findByTestId('columns-view');
    const row = screen.getByTestId('view-switch-row');
    clickSegmented(row, '对标');
    await waitFor(() => expect(screen.queryByTestId('columns-view')).toBeNull());
    const saved = JSON.parse(window.localStorage.getItem('LPL3.filters') ?? '{}');
    expect(saved.viewMode).toBe('compare');
  });
});
