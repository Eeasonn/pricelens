// ============================================================
// 「产业与产品」统一入口交互回归（2026-11-27，PriceAgent 改造）：真实 <App /> 组装 +
// 真实数据 + localStorage 持久化断言（echarts 在 jsdom 无 canvas：mock core 等模块，
// 只验证状态流转与 DOM 语义，不验证像素）。聚焦五件事：
// ① 新名称与国家位置：页头 PriceAgent + P 标、无「单国家分析」、国家选择器进筛选条、
//    产业不再作为独立筛选控件；
// ② 双模式：面板顶栏「产品对标 | 品牌全景」；品牌全景空态；
// ③ 模式往返不丢草稿：品牌全景里勾的产品来回切换仍在，产品对标主品卡不受影响；
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

type Persisted = { mains: MainProduct[]; industry?: string; analysisMode?: string; panorama?: { brands: { brand: string; sels: unknown[] }[]; baselineKey: string | null; sharedY?: boolean } };
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

describe('统一入口双模式', () => {
  itApp('面板顶栏 = 产业选择 +「产品对标 | 品牌全景」；切到品牌全景出空态（无默认品牌 / 主品 / 基准）', async () => {
    render(<App />);
    const panel = await openEntry();
    expect(within(panel).getByText('产业')).toBeTruthy();
    expect(within(panel).getByText('分析结构')).toBeTruthy();
    expect(within(panel).getByText('产品对标')).toBeTruthy();
    expect(within(panel).getByText('主分析产品')).toBeTruthy(); // 产品对标编辑区
    expect(screen.queryByTestId('panorama-picker')).toBeNull();

    clickSegmented(panel, '品牌全景');
    await screen.findByTestId('panorama-picker');
    expect(screen.getByTestId('panorama-empty').textContent).toContain('品牌全景尚未选择产品');
    expect(persisted().analysisMode).toBe('panorama');
    expect(persisted().panorama?.brands ?? []).toEqual([]);
    expect(persisted().panorama?.baselineKey ?? null).toBeNull();
    // 顶栏的产业开关只列该国可选产业，当前产业选中
    const industryItems = within(panel).getAllByText(/^(手机|平板|穿戴|音频)$/).map((el) => el.textContent);
    expect(industryItems).toContain('手机');
  });
});

describe('模式往返不丢草稿', () => {
  itApp('品牌全景里勾的产品来回切换仍在；产品对标主品卡原样保留；入口摘要随模式变', async () => {
    render(<App />);
    const mainBefore = persisted().mains.map((c) => c.main?.modelId);
    expect(mainBefore.length).toBeGreaterThan(0);

    const panel = await openEntry();
    clickSegmented(panel, '品牌全景');
    const picker = await screen.findByTestId('panorama-picker');
    const first = within(picker).getAllByRole('checkbox', { name: /^选择 / })[0];
    const pickedName = first.getAttribute('aria-label')!.replace(/^选择 /, '');
    fireEvent.click(first);
    await waitFor(() => expect(persisted().panorama?.brands.length).toBe(1));
    expect(persisted().panorama?.brands[0].sels.length).toBe(1);

    // 回产品对标：主品卡不变、图主体回到产品对标
    clickSegmented(panel, '产品对标');
    await waitFor(() => expect(screen.queryByTestId('brand-panorama')).toBeNull());
    expect(within(panel).getByText('主分析产品')).toBeTruthy();
    expect(persisted().mains.map((c) => c.main?.modelId)).toEqual(mainBefore);

    // 再去品牌全景：先前勾选仍在（已勾选的复选框以「取消选择 …」命名）
    clickSegmented(panel, '品牌全景');
    const again = await screen.findByTestId('panorama-picker');
    const still = within(again).getByRole('checkbox', { name: `取消选择 ${pickedName}` });
    expect((still as HTMLInputElement).checked).toBe(true);
    expect(persisted().panorama?.brands[0].sels.length).toBe(1);
    expect(persisted().mains.map((c) => c.main?.modelId)).toEqual(mainBefore);

    // 关闭面板后入口摘要显示品牌全景
    fireEvent.click(screen.getByRole('button', { name: '产业与产品' }));
    await waitFor(() => expect(document.querySelector('[data-lpl-picker-panel]')).toBeNull());
    const entry = screen.getByRole('button', { name: '产业与产品' });
    expect(entry.textContent).toContain('品牌全景');
  });
});

describe('同档推荐：勾选加入', () => {
  itApp('每品牌选 1 款 → 加入对比：对比区按来源 tier 并入、自动匹配保持开启、弹窗关闭', async () => {
    render(<App />);
    const comparesBefore = persisted().mains[0].compares.length;
    const panel = await openEntry();
    fireEvent.click(screen.getByTestId('tier-recommend-entry'));
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

describe('品牌全景分图（三品牌各一张图）', () => {
  itApp('勾三个品牌 → 三张品牌图三列、Y 轴默认共享、无默认基准；第四个品牌加入后仍三列（换行不限制）', async () => {
    render(<App />);
    const panel = await openEntry();
    clickSegmented(panel, '品牌全景');
    const picker = await screen.findByTestId('panorama-picker');
    const pickAll = (brand: string): void => {
      fireEvent.click(within(picker).getByRole('checkbox', { name: new RegExp(`^全选 ${brand} 当前结果`) }));
    };
    pickAll('Huawei');
    pickAll('Apple');
    pickAll('Samsung');
    await waitFor(() => expect(screen.getAllByTestId('panorama-card')).toHaveLength(3));
    const titles = (): string[] => screen.getAllByTestId('panorama-card').map((el) => el.getAttribute('aria-label') ?? '');
    expect(titles().sort()).toEqual(['Apple 价格走势', 'Huawei 价格走势', 'Samsung 价格走势']);
    expect(screen.getAllByTestId('panorama-card')[0].parentElement!.style.gridTemplateColumns).toContain('repeat(3');
    // 默认共享 Y 轴；没有默认价差基准（基准只能由用户显式选）
    const yCtl = within(screen.getByTestId('brand-panorama')).getByText('Y 轴').parentElement!;
    expect(within(yCtl).getByText('共享').closest('.ant-segmented-item')!.className).toContain('ant-segmented-item-selected');
    expect(persisted().panorama?.baselineKey ?? null).toBeNull();
    expect(persisted().panorama?.brands.map((b) => b.brand).sort()).toEqual(['APPLE', 'HUAWEI', 'SAMSUNG']);

    pickAll('Honor');
    await waitFor(() => expect(screen.getAllByTestId('panorama-card')).toHaveLength(4));
    expect(titles()).toContain('Honor 价格走势');
    expect(screen.getAllByTestId('panorama-card')[3].parentElement!.style.gridTemplateColumns).toContain('repeat(3');

    // Y 轴切「独立」：各图各自带轴、仍每品牌一张图，不崩；切回「共享」
    clickSegmented(yCtl, '独立');
    await waitFor(() => expect(within(yCtl).getByText('独立').closest('.ant-segmented-item')!.className).toContain('ant-segmented-item-selected'));
    expect(screen.getAllByTestId('panorama-card')).toHaveLength(4);
    expect(persisted().panorama?.sharedY).toBe(false);
    expect(screen.queryByRole('button', { name: '刷新页面' })).toBeNull(); // 未落入错误边界
    clickSegmented(yCtl, '共享');
    await waitFor(() => expect(persisted().panorama?.sharedY).toBe(true));
    expect(screen.getAllByTestId('panorama-card')).toHaveLength(4);
  });
});
