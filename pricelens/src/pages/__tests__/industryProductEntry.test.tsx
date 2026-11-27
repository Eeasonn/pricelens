// ============================================================
// 「产业与产品」统一入口交互回归（2026-11-27，PriceAgent 改造）：真实 <App /> 组装 +
// 真实数据 + localStorage 持久化断言（echarts 在 jsdom 无 canvas：mock core 等模块，
// 只验证状态流转与 DOM 语义，不验证像素）。聚焦五件事：
// ① 新名称与国家位置：页头 PriceAgent + P 标、无「单国家分析」、国家选择器进筛选条、
//    产业不再作为独立筛选控件；
// ② 面板顶栏 = 产业 + 选择方式（按产品 / 按档位）；「分析结构」开关已随品牌全景退场；
// ③ 视图切换（对标 ↔ 分列）不丢选择：分列视图按品牌分列渲染 mains 在册选择；
// ④ 同档推荐：每品牌选 1 款 → 加入对比 → 对比区按来源 'tier' 并入、自动匹配不关；
// ⑤ 超过旧 8 线上限：整品牌勾选加入对比后全部保留（不截断、不提示上限）。
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

import App from '../../App';
import type { MainProduct } from '../../state/filtersTypes';
import { brandOfModel, buildProductTree } from '../../components/ProductCascader/tree';
import { brandLabelOf } from '../../components/BrandMark';

type Persisted = { mains: MainProduct[]; industry?: string; viewMode?: string; columns?: { groupBy?: string; sharedY?: boolean; baselineKey?: string | null } };
const persisted = (): Persisted => JSON.parse(window.localStorage.getItem('LPL3.filters') ?? '{}') as Persisted;

/** 本项目 jsdom 环境不带可用的 localStorage（既有测试一律 try/catch 兜底）；本测试要读
 *  筛选持久化来断言状态，故装一份内存实现（只在渲染前装，应用侧读写照常走 try/catch） */
const makeStorage = (): Storage => {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => {
      map.delete(k);
    },
    setItem: (k: string, v: string) => {
      map.set(k, String(v));
    },
  };
};

/** 真实 <App /> + 真实数据 + 多张图的重组件测试：单测 2~3s，全量并行负载下会超过
 *  vitest 默认 5s（与 agentux-core.test.tsx 同款处理：整文件按 30s 上限计时） */
const itApp = (name: string, fn: () => void | Promise<void>): void => it(name, fn, 30000);

const openEntry = async (): Promise<HTMLElement> => {
  fireEvent.click(screen.getByRole('button', { name: '产业与产品' }));
  return await screen.findByRole('dialog', { name: '产业与产品' });
};
const clickSegmented = (root: HTMLElement, text: string): void => {
  const item = within(root).getByText(text).closest('.ant-segmented-item');
  if (!item) throw new Error(`segmented item not found: ${text}`);
  fireEvent.click(within(item as HTMLElement).getByRole('radio'));
};

beforeEach(() => {
  window.history.replaceState(null, '', '/?p=dashboard');
  Object.defineProperty(window, 'localStorage', { value: makeStorage(), configurable: true, writable: true });
  Object.defineProperty(window, 'sessionStorage', { value: makeStorage(), configurable: true, writable: true });
});
afterEach(cleanup);

describe('新名称与国家位置', () => {
  itApp('页头与标题是 PriceAgent（带 P 标），徽标已删，页面上不再出现 PriceLens', () => {
    render(<App />);
    const header = document.querySelector('header.lpl-page-header') as HTMLElement;
    expect(header.querySelector('svg')).not.toBeNull(); // 墨色圆角方块 + 白 P
    expect(header.textContent).toContain('PriceAgent');
    expect(screen.getByRole('button', { name: /打开 PriceAgent/ })).toBeTruthy();
    expect(document.title.startsWith('PriceAgent')).toBe(true);
    expect(document.body.textContent).not.toContain('单国家分析');
    expect(document.body.textContent).not.toContain('PriceLens');
  });

  itApp('国家选择器在筛选条首槽，产业不再作为独立筛选控件；入口 chip 显示产业 + 选择摘要', () => {
    render(<App />);
    const bar = document.querySelector('[data-lpl-filter-bar]') as HTMLElement;
    const scope = within(bar).getByRole('group', { name: '分析范围' });
    expect(within(scope).queryByText('国家', { exact: true })).toBeNull();
    expect(within(scope).getByRole('combobox', { name: '国家' })).toBeTruthy();
    expect(scope.querySelector('#scope-country')).not.toBeNull();
    expect(scope.textContent).toContain('R国');
    // 页头不再承载国家选择器；「产业」下拉不在任何地方渲染
    expect(document.querySelector('header.lpl-page-header #scope-country')).toBeNull();
    expect(document.querySelector('#scope-industry')).toBeNull();
    const entry = within(bar).getByRole('button', { name: '产业与产品' });
    expect(entry.textContent).toContain('手机'); // 产业在入口上可见
    expect(entry.textContent).toContain('款对比'); // 选择摘要
  });

  itApp('国家、平台、币种、粒度只保留控件，不再显示外部文字标题', () => {
    render(<App />);
    const bar = document.querySelector('[data-lpl-filter-bar]') as HTMLElement;
    for (const label of ['国家', '平台', '币种', '粒度']) {
      expect(within(bar).queryByText(label, { exact: true })).toBeNull();
    }
    expect(within(bar).getByRole('combobox', { name: '国家' })).toBeTruthy();
    const platform = within(bar).queryByTestId('channel-scope-trigger');
    if (platform) expect(platform.getAttribute('aria-label')).toBe('平台');
    expect(within(bar).getByLabelText('币种')).toBeTruthy();
    expect(within(bar).getByLabelText('时间粒度')).toBeTruthy();
  });

  itApp('国家二级菜单按实际内容展开，菜单高度完整且禁止滚动', async () => {
    render(<App />);
    fireEvent.mouseDown((document.querySelector('[data-lpl-filter-bar]') as HTMLElement).querySelector('#scope-country') as HTMLElement);
    const dropdown = await screen.findByTestId('country-cascader-dropdown');
    fireEvent.click(within(dropdown).getByText('欧洲', { exact: true }));
    await waitFor(() => expect(dropdown.querySelectorAll('.ant-cascader-menu').length).toBeGreaterThan(1));
    const expanded = await screen.findByTestId('country-cascader-dropdown');
    for (const menu of Array.from(expanded.querySelectorAll<HTMLElement>('.ant-cascader-menu'))) {
      await waitFor(() => {
        expect(menu.style.overflowY).toBe('visible');
        expect(Number.parseFloat(menu.style.height)).toBe(menu.scrollHeight);
      });
    }
  });
});

describe('产业切换：直接执行且按产业恢复', () => {
  itApp('切产业不弹确认条；切回原产业恢复原产品草稿', async () => {
    render(<App />);
    const before = persisted().mains;
    const panel = await openEntry();
    clickSegmented(panel, '平板');
    await waitFor(() => expect(persisted().industry).toBe('tablet'));
    expect(within(panel).queryByRole('alert', { name: '确认切换产业' })).toBeNull();
    expect(persisted().mains).not.toEqual(before);

    clickSegmented(panel, '手机');
    await waitFor(() => expect(persisted().industry).toBe('phone'));
    expect(within(panel).queryByRole('alert', { name: '确认切换产业' })).toBeNull();
    expect(persisted().mains).toEqual(before);
  });
});

describe('统一入口：选择方式（2026-11-27 二轮：「分析结构」开关随品牌全景退场）', () => {
  itApp('面板顶栏 = 产业选择 + 选择方式（按产品 | 按档位），无「分析结构」开关；默认按产品出主品卡编辑区', async () => {
    render(<App />);
    const panel = await openEntry();
    expect(within(panel).getByText('产业')).toBeTruthy();
    expect(within(panel).getByText('选择方式')).toBeTruthy();
    expect(within(panel).getByText('按产品')).toBeTruthy();
    expect(within(panel).getByText('按档位')).toBeTruthy();
    expect(within(panel).queryByText('分析结构')).toBeNull(); // 退场
    expect(within(panel).getByText('主分析产品')).toBeTruthy(); // 按产品编辑区
    // 顶栏的产业开关只列该国可选产业，当前产业选中
    const industryItems = within(panel).getAllByText(/^(手机|平板|穿戴|音频)$/).map((el) => el.textContent);
    expect(industryItems).toContain('手机');
  });

  itApp('图表卡常驻「视图：对标 | 分列」切换行；切到分列出分列图，切回对标复原——选择草稿不动', async () => {
    render(<App />);
    const row = screen.getByTestId('view-switch-row');
    expect(within(row).getByText('视图')).toBeTruthy();
    expect(within(row).queryByText('分列依据')).toBeNull(); // 对标视图不出分列依据
    const mainsBefore = persisted().mains.map((c) => c.main?.modelId);

    clickSegmented(row, '分列');
    await screen.findByTestId('columns-view');
    expect(persisted().viewMode).toBe('columns');
    expect(within(row).getByText('分列依据')).toBeTruthy(); // 分列视图出依据下拉
    expect(persisted().mains.map((c) => c.main?.modelId)).toEqual(mainsBefore); // 草稿不动

    clickSegmented(row, '对标');
    await waitFor(() => expect(screen.queryByTestId('columns-view')).toBeNull());
    expect(persisted().viewMode).toBe('compare');
    expect(persisted().mains.map((c) => c.main?.modelId)).toEqual(mainsBefore);
  });
});

describe('视图往返不丢选择', () => {
  itApp('对标 ↔ 分列往返：mains 原样保留；入口摘要不因视图变化（恒描述 mains）', async () => {
    render(<App />);
    const mainBefore = persisted().mains.map((c) => c.main?.modelId);
    expect(mainBefore.length).toBeGreaterThan(0);
    const entryText = (): string => screen.getByRole('button', { name: '产业与产品' }).textContent ?? '';
    const summaryBefore = entryText();

    const row = screen.getByTestId('view-switch-row');
    clickSegmented(row, '分列');
    await screen.findByTestId('columns-view');
    expect(persisted().mains.map((c) => c.main?.modelId)).toEqual(mainBefore);
    expect(entryText()).toBe(summaryBefore); // 视图不进摘要

    clickSegmented(row, '对标');
    await waitFor(() => expect(screen.queryByTestId('columns-view')).toBeNull());
    expect(persisted().mains.map((c) => c.main?.modelId)).toEqual(mainBefore);
    expect(entryText()).toBe(summaryBefore);
  });
});

describe('同档推荐：勾选加入', () => {
  itApp('每品牌选 1 款 → 加入对比：对比区按来源 tier 并入、自动匹配保持开启、弹窗关闭', async () => {
    render(<App />);
    const comparesBefore = persisted().mains[0].compares.length;
    const panel = await openEntry();
    // 2026-11-27 二轮改版：同档位入口收进「匹配竞品 ▾」下拉（原独立 pill 退役）
    fireEvent.click(screen.getAllByTestId('match-dropdown-entry')[0]);
    const menu = await screen.findByRole('menu');
    fireEvent.click(within(menu).getByText('同档位…'));
    const dialog = await screen.findByRole('dialog', { name: /同档位推荐/ }); // 面板本身也是 dialog，按名称区分
    expect(dialog.textContent).toContain('同档位推荐');
    const rows = await within(dialog).findAllByTestId('tier-candidate-row');
    expect(rows.length).toBeGreaterThan(0);
    // 表头五列口径齐全
    for (const head of ['产品', '配置', '当前参考价', '相对主品', '数据覆盖', '来源状态']) {
      expect(within(dialog).getByText(head)).toBeTruthy();
    }
    const ok = within(dialog).getByRole('button', { name: /^加入对比/ }) as HTMLButtonElement;
    expect(ok.disabled).toBe(true); // 未勾选不可加入

    fireEvent.click(within(dialog).getByRole('button', { name: '每品牌选 1 款' }));
    // 每品牌一个 <tbody>（thead 也是隐式 rowgroup，按「含候选行」过滤）
    const groups = within(dialog).getAllByRole('rowgroup').filter((g) => g.querySelectorAll('[data-testid="tier-candidate-row"]').length > 0).length;
    expect(groups).toBeGreaterThan(1); // 真实数据下该档位有多个竞品品牌
    // 默认只看竞品品牌：表内没有我司组；勾「含我司品牌」后才出现（带「我司」标记）
    expect(within(dialog).queryByText('我司')).toBeNull();
    fireEvent.click(within(dialog).getByRole('checkbox', { name: '含我司品牌' }));
    await waitFor(() => expect(within(dialog).getAllByText('我司').length).toBeGreaterThan(0));
    fireEvent.click(within(dialog).getByRole('checkbox', { name: '含我司品牌' })); // 恢复默认：只看竞品
    await waitFor(() => expect(within(dialog).queryByText('我司')).toBeNull());
    const okFilled = within(dialog).getByRole('button', { name: new RegExp(`^加入对比（${groups}）`) }) as HTMLButtonElement;
    expect(okFilled.disabled).toBe(false);

    fireEvent.click(okFilled);
    await waitFor(() => expect(document.querySelector('.ant-modal')).toBeNull());
    await waitFor(() => expect(persisted().mains[0].compares.length).toBe(comparesBefore + groups));
    const card = persisted().mains[0];
    expect(card.auto).toBe(true); // 不再「手动改对比即关自动」
    expect(card.main).not.toBeNull();
    // 新加入的条目来源 = 同档推荐；与主品同型号同配置的项不进对比区
    const mainKey = card.main ? `${card.main.modelId}|${card.main.romram.replace(/\s+/g, '')}` : '';
    expect(card.compares.some((c) => `${c.modelId}|${c.romram.replace(/\s+/g, '')}` === mainKey)).toBe(false);
    expect(Object.values(card.compareSources ?? {}).filter((s) => s === 'tier').length).toBe(groups);
    void panel;
  });
});

describe('超过旧 8 线上限仍保留', () => {
  itApp('对比上下文整品牌勾选：该品牌全部配置并入对比区，条数超过 8 不截断、无上限提示', async () => {
    render(<App />);
    const persistedFirst = persisted().mains[0];
    const before = persistedFirst.compares.length;
    await openEntry();
    fireEvent.click(screen.getByRole('button', { name: '添加对比产品' }));
    const tree = await screen.findByRole('tree', { hidden: true });
    expect(tree.querySelectorAll(':scope > [role=group]')).toHaveLength(4); // 固定四列骨架
    const brandRow = within(tree).getByRole('treeitem', { name: 'Samsung', hidden: true });
    const box = within(brandRow).getByRole('checkbox') as HTMLInputElement;
    expect(box.getAttribute('aria-checked')).not.toBe('true');
    fireEvent.click(box);
    await waitFor(() => expect(persisted().mains[0].compares.length).toBeGreaterThan(8));
    const after = persisted().mains[0].compares;
    expect(after.length).toBeGreaterThan(before);
    expect(new Set(after.map((c) => `${c.modelId}|${c.romram}`)).size).toBe(after.length); // 去重
    // 新增的均来自所勾品牌；原有对比原样保留在前（并集、不丢）
    const keyOf = (c: { modelId: string; romram: string }): string => `${c.modelId}|${c.romram}`;
    const existing = new Set(persistedFirst?.compares.map(keyOf) ?? []);
    const added = after.filter((c) => !existing.has(keyOf(c)));
    expect(added.length).toBeGreaterThan(0);
    expect(added.every((c) => c.modelId.startsWith('cmp-samsung'))).toBe(true);
    expect(document.body.textContent).not.toMatch(/最多 8|单图最多|已达 .* 上限/);
    // 图例工具把全部系列（含新增）纳入清单入口
    await waitFor(() => expect(screen.getByTestId('legend-tools').textContent).toMatch(/图例/));
    expect(Number(screen.getByTestId('legend-tools').textContent!.replace(/\D/g, ''))).toBeGreaterThanOrEqual(after.length);
  });
});

describe('分列视图分图（按品牌：在册选择涉及的品牌各一张图）', () => {
  itApp('默认对比区跨品牌 → 分列图按品牌逐组一列、三列网格、Y 轴默认共享、无默认基准；加进第四个品牌后仍三列（换行不限制）', async () => {
    render(<App />);
    const row = screen.getByTestId('view-switch-row');
    clickSegmented(row, '分列');
    const view = await screen.findByTestId('columns-view');
    // 默认主品卡 + 匹配竞品：在册选择已跨品牌 → 多张分列图，逐组一列
    await waitFor(() => expect(screen.getAllByTestId('columns-card').length).toBeGreaterThanOrEqual(2));
    const titles = (): string[] => screen.getAllByTestId('columns-card').map((el) => el.getAttribute('aria-label') ?? '');
    expect(titles()[0]).toMatch(/^Huawei 价格走势/); // 我司组在最前
    expect(screen.getAllByTestId('columns-card')[0].parentElement!.style.gridTemplateColumns).toContain('repeat(3');
    // 默认共享 Y 轴；没有默认价差基准（基准只能由用户显式选）
    const yCtl = within(view).getByText('Y 轴').parentElement!;
    expect(within(yCtl).getByText('共享').closest('.ant-segmented-item')!.className).toContain('ant-segmented-item-selected');
    expect(persisted().columns?.baselineKey ?? null).toBeNull();

    // 在对比上下文整品牌勾选 → 该品牌的选择进 mains → 分列多出一组。
    // 品牌 = 树内逐树的第一个 romram 事实品牌（与分列分组完全同口径），挑当前还
    // 没有分列图的品牌（默认对比区可能已含某些品牌，数据驱动不断言具体品牌）
    const brandsPresent = new Set(titles().map((t) => t.replace(' 价格走势', '')));
    const presentModelIds = new Set(persisted().mains.flatMap((c) => [c.main?.modelId, ...c.compares.map((x) => x.modelId)]));
    const treeData = buildProductTree('phone', 'RU');
    const targetRow = treeData.flatMap((b) => b.series.flatMap((sr) => sr.models.flatMap((m) => m.romrams)))
      .find((r) => !brandsPresent.has(brandLabelOf(brandOfModel(r.modelId))));
    expect(targetRow).toBeTruthy();
    expect(presentModelIds.has(targetRow!.modelId)).toBe(false); // 该品牌整牌未在册
    const brandLabel = brandLabelOf(brandOfModel(targetRow!.modelId));
    await openEntry();
    fireEvent.click(screen.getByRole('button', { name: '添加对比产品' }));
    const tree = await screen.findByRole('tree', { hidden: true });
    const brandRow = within(tree).queryByRole('treeitem', { name: brandLabel, hidden: true });
    expect(brandRow).toBeTruthy();
    const countBefore = screen.getAllByTestId('columns-card').length;
    fireEvent.click(within(brandRow!).getByRole('checkbox'));
    await waitFor(() => expect(screen.getAllByTestId('columns-card').length).toBeGreaterThan(countBefore));
    expect(titles()).toContain(`${brandLabel} 价格走势`);
    expect(screen.getAllByTestId('columns-card')[0].parentElement!.style.gridTemplateColumns).toContain('repeat(3');

    // Y 轴切「独立」：各图各自带轴、仍逐组一张图，不崩；切回「共享」
    clickSegmented(yCtl, '独立');
    await waitFor(() => expect(within(yCtl).getByText('独立').closest('.ant-segmented-item')!.className).toContain('ant-segmented-item-selected'));
    expect(persisted().columns?.sharedY).toBe(false);
    expect(screen.queryByRole('button', { name: '刷新页面' })).toBeNull(); // 未落入错误边界
    clickSegmented(yCtl, '共享');
    await waitFor(() => expect(persisted().columns?.sharedY).toBe(true));
  });
});
