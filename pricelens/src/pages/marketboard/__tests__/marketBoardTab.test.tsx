// ============================================================
// 「大盘走势」页签接入冒烟（2026-11-03）：
// ① ChartContentBar 四页签顺序（价格→量价→大盘→预测）与切换导航；
// ② ?p=marketboard 链接恢复（urlSync 读侧 + PageProvider 初始页）；
// ③ MarketBoardPage 组装：口径行（模拟数据徽标 + 产业 Segmented）+ 三张
//    大盘卡 + 图表页签行；产业切换后口径/数据说明随产业更新。
// ④ 顶部产业 → 大盘产业单向对齐（2026-11-03 方案 A）：手机/平板/穿戴对齐对应
//    样例；音频等无样例保持当前选择并在口径行注明样例覆盖；页内切换在下次切换
//    顶部产业前有效、不回写顶部；样例缺失 / 会话残留未知产业不报错。
// ⑤ 应用整壳：大盘页置灰国家/币种/时间（产业可用），切回价格走势即恢复；
//    标签页标题在大盘页按自身口径（样例国家 · 当前产业）。
// echarts 在 jsdom 无 canvas：mock 'echarts/core' 等模块，只验证 React 组装
// 与导航行为，不验证图表渲染（图内逻辑由 marketBoardModel.test.ts 覆盖）。
// 整壳用例会挂价格走势页，mock 与 appShell.test.tsx 同口径（含 clear 与其组件）。
// ============================================================
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';

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

// jsdom 无 ResizeObserver（marketBoardUI 的 useEChart 装载时用到）
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;

import App from '../../../App';
import { PageProvider, usePage } from '../../../state/PageContext';
import { FiltersProvider, useFilters } from '../../../state/FiltersContext';
import { ChartContentProvider } from '../../../state/chartContent';
import { readUrlOverrides } from '../../../state/urlSync';
import { writePageViewState } from '../../../state/usePageViewState';
import type { Industry } from '../../../dataModel/types';
import ChartContentBar from '../../../components/ChartContentBar';
import MarketBoardPage from '../../MarketBoardPage';
import { MARKET_INDUSTRIES, type MarketIndustryData } from '../marketBoardData';
import { marketDatasetOf } from '../marketBoardIndustry';
import { tierShareSummary, tierYoySummary, trendSummary } from '../marketBoardModel';

/** 当前页探针：把 PageProvider 的 page 暴露成可断言文本 */
function Probe() {
  const { page } = usePage();
  return <span data-testid="page-probe">{page}</span>;
}

/** 顶部产业探针：显示全局产业并可切换（等价于在顶部「产业」下拉中选择） */
function GlobalIndustry() {
  const { state, actions } = useFilters();
  return (
    <div>
      <span data-testid="global-industry">{state.industry}</span>
      {(['phone', 'tablet', 'wearable', 'audio'] as const).map((i) => (
        <button key={i} type="button" onClick={() => actions.set({ industry: i })}>
          {`顶部产业 ${i}`}
        </button>
      ))}
    </div>
  );
}

function mountShell(ui: ReactNode) {
  return render(
    <PageProvider>
      <ChartContentProvider>{ui}</ChartContentProvider>
    </PageProvider>,
  );
}

/** 大盘页 + 顶部筛选状态（全局产业由链接 i= 指定，与真实入口一致） */
function mountBoard(ui: ReactNode = <MarketBoardPage />) {
  return render(
    <PageProvider>
      <FiltersProvider>
        <ChartContentProvider>{ui}</ChartContentProvider>
      </FiltersProvider>
    </PageProvider>,
  );
}

/** 链接 + 会话/持久化存储复位（筛选状态会写 localStorage，受限环境不可用时跳过） */
function resetEnv(url: string): void {
  window.history.replaceState(null, '', url);
  sessionStorage.clear();
  try {
    localStorage.clear();
  } catch {
    /* 受限环境 localStorage 不可用（FiltersProvider 自带 try/catch 兜底） */
  }
}

function datasetById(id: string): MarketIndustryData {
  const d = MARKET_INDUSTRIES.find((x) => x.id === id);
  if (!d) throw new Error(`大盘样例缺失：${id}`);
  return d;
}
const WEARABLES = datasetById('wearables');
const PHONES = datasetById('phone');
const TABLETS = datasetById('tablet');

/** 页内产业 Segmented 的选项文字（限定 Segmented，避开口径行里的同名文字） */
const segmentLabel = (label: string): HTMLElement =>
  screen.getByText(label, { selector: '.ant-segmented-item-label' });

const scopeLineOf = (d: MarketIndustryData): string =>
  `${d.region} · ${d.label} · 销量单位万台 · 均价为美元 · 口径参考 GFK 看板`;

/** 三张大盘卡均按指定样例呈现（各卡要点摘要 = 该样例的模型计算结果，其他样例的
 *  摘要不出现）；页内产业 Segmented 选中该样例（antd 选中态看 item-selected class） */
function expectBoardShows(d: MarketIndustryData): void {
  const card = (title: string): HTMLElement => {
    const el = screen.getByText(title).closest('section');
    if (!el) throw new Error(`未找到大盘卡：${title}`);
    return el;
  };
  const checks: [string, (x: MarketIndustryData) => string][] = [
    ['核心档位品牌份额趋势', (x) => tierShareSummary(x, null)],
    ['品牌份额趋势', trendSummary],
    ['各品牌核心档位结构同比变化', tierYoySummary],
  ];
  for (const [title, summaryOf] of checks) {
    const scope = within(card(title));
    const mine = summaryOf(d);
    expect(scope.getByText(mine)).toBeTruthy();
    for (const other of MARKET_INDUSTRIES) {
      const text = summaryOf(other);
      if (other.id !== d.id && text !== mine) expect(scope.queryByText(text)).toBeNull();
    }
  }
  expect(segmentLabel(d.label).closest('.ant-segmented-item')?.classList.contains('ant-segmented-item-selected')).toBe(true);
}

afterEach(cleanup);

describe('ChartContentBar 大盘走势页签', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    sessionStorage.clear();
  });

  it('页签顺序：价格走势 → 量价走势 → 大盘走势 → 量价预测', () => {
    mountShell(<ChartContentBar />);
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      '价格走势',
      '量价走势',
      '大盘走势',
      '量价预测',
    ]);
  });

  it('点「大盘走势」切到 marketboard 并标 aria-current，链接写入 p=marketboard', () => {
    mountShell(
      <>
        <Probe />
        <ChartContentBar />
      </>,
    );
    const market = screen.getByRole('button', { name: '大盘走势' });
    expect(market.getAttribute('aria-current')).toBeNull();
    fireEvent.click(market);
    expect(screen.getByTestId('page-probe').textContent).toBe('marketboard');
    expect(market.getAttribute('aria-current')).toBe('page');
    expect(window.location.search).toContain('p=marketboard');
  });

  it('页签往返切换（价格↔量价↔大盘↔预测）页面状态全部正确', () => {
    mountShell(
      <>
        <Probe />
        <ChartContentBar />
      </>,
    );
    const tab = (name: string) => screen.getByRole('button', { name });
    fireEvent.click(tab('量价走势'));
    expect(screen.getByTestId('page-probe').textContent).toBe('volume');
    fireEvent.click(tab('大盘走势'));
    expect(screen.getByTestId('page-probe').textContent).toBe('marketboard');
    fireEvent.click(tab('量价预测'));
    expect(screen.getByTestId('page-probe').textContent).toBe('forecast');
    fireEvent.click(tab('价格走势'));
    expect(screen.getByTestId('page-probe').textContent).toBe('dashboard');
    fireEvent.click(tab('大盘走势'));
    expect(screen.getByTestId('page-probe').textContent).toBe('marketboard');
  });
});

describe('marketboard 链接入口', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('?p=marketboard 可被 readUrlOverrides 恢复，并作为 PageProvider 初始页', () => {
    window.history.replaceState(null, '', '/?p=marketboard');
    expect(readUrlOverrides().page).toBe('marketboard');
    mountShell(
      <>
        <Probe />
        <ChartContentBar />
      </>,
    );
    expect(screen.getByTestId('page-probe').textContent).toBe('marketboard');
    expect(screen.getByRole('button', { name: '大盘走势' }).getAttribute('aria-current')).toBe('page');
    window.history.replaceState(null, '', '/');
  });
});

describe('MarketBoardPage 组装', () => {
  beforeEach(() => {
    // 页面在应用内仅于 page=marketboard 时挂载，按真实入口初始化
    resetEnv('/?p=marketboard');
  });

  it('口径行（模拟数据徽标 + 产业切换）与三张大盘卡纵排呈现，图表页签行嵌在首卡', () => {
    mountBoard();
    // 模拟数据徽标：口径行 1 枚 + 三卡卡头各 1 枚（文字承载状态，不靠颜色）
    expect(screen.getAllByText('模拟数据')).toHaveLength(4);
    expect(screen.getByText('核心档位品牌份额趋势')).toBeTruthy();
    expect(screen.getByText('品牌份额趋势')).toBeTruthy();
    expect(screen.getByText('各品牌核心档位结构同比变化')).toBeTruthy();
    // 页嵌在分析壳内：图表页签行同卡呈现，当前页大盘走势选中
    expect(screen.getByRole('button', { name: '大盘走势' }).getAttribute('aria-current')).toBe('page');
  });

  it('顶部产业无样例（音频）时默认智能穿戴（GFK 口径）；切智能手机后口径行/数据说明随产业更新，会话内保留', () => {
    window.history.replaceState(null, '', '/?p=marketboard&i=audio');
    mountBoard();
    expect(screen.getAllByText(/口径参考 GFK 阿联酋穿戴大盘看板/).length).toBeGreaterThan(0);
    fireEvent.click(segmentLabel('智能手机'));
    expect(screen.getAllByText(/IDC \/ Counterpoint 2025 GCC 公开口径/).length).toBeGreaterThan(0);
    expect(screen.getByText(new RegExp(`^${scopeLineOf(PHONES)}`))).toBeTruthy();
    // 产业选择会话级保留：重挂后仍是智能手机（链接仍是 i=audio，无样例不触发对齐）
    cleanup();
    mountBoard();
    expect(screen.getAllByText(/IDC \/ Counterpoint 2025 GCC 公开口径/).length).toBeGreaterThan(0);
  });
});

describe('顶部产业 → 大盘产业（单向对齐）', () => {
  beforeEach(() => {
    resetEnv('/?p=marketboard');
  });

  it('顶部产业=手机：进入大盘即显示智能手机样例（三卡、口径行、页内选中态）', () => {
    window.history.replaceState(null, '', '/?p=marketboard&i=phone');
    mountBoard();
    expectBoardShows(PHONES);
    expect(screen.getByText(scopeLineOf(PHONES))).toBeTruthy();
    expect(screen.queryByText(/样例覆盖/)).toBeNull();
  });

  it('停留在大盘时切换顶部产业：穿戴 → 手机 → 平板，三卡随之切换；页内切换不回写顶部产业', () => {
    window.history.replaceState(null, '', '/?p=marketboard&i=wearable');
    mountBoard(
      <>
        <GlobalIndustry />
        <MarketBoardPage />
      </>,
    );
    expectBoardShows(WEARABLES);
    fireEvent.click(screen.getByRole('button', { name: '顶部产业 phone' }));
    expectBoardShows(PHONES);
    expect(screen.getByText(scopeLineOf(PHONES))).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '顶部产业 tablet' }));
    expectBoardShows(TABLETS);
    // 单向：页内切换只改大盘，不回写顶部产业
    fireEvent.click(segmentLabel('智能穿戴'));
    expectBoardShows(WEARABLES);
    expect(screen.getByTestId('global-industry').textContent).toBe('tablet');
  });

  it('顶部产业=音频（无大盘样例）：保持当前样例不报错，口径行注明样例覆盖范围', () => {
    // 会话内此前选过平板电脑
    writePageViewState('marketboard.industry', 'tablet');
    window.history.replaceState(null, '', '/?p=marketboard&i=audio');
    mountBoard(
      <>
        <GlobalIndustry />
        <MarketBoardPage />
      </>,
    );
    expect(screen.getByTestId('global-industry').textContent).toBe('audio');
    expectBoardShows(TABLETS);
    const coverage = '样例覆盖：智能穿戴、智能手机、平板电脑，暂无音频';
    expect(screen.getByText(`${scopeLineOf(TABLETS)} · ${coverage}`)).toBeTruthy();
    // 停留中：手机对齐后覆盖说明消失；再切到音频，保持智能手机不动、覆盖说明回来
    fireEvent.click(screen.getByRole('button', { name: '顶部产业 phone' }));
    expectBoardShows(PHONES);
    expect(screen.queryByText(/样例覆盖/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '顶部产业 audio' }));
    expectBoardShows(PHONES);
    expect(screen.getByText(`${scopeLineOf(PHONES)} · ${coverage}`)).toBeTruthy();
  });

  it('页内产业切换仍生效，直到下次切换顶部产业', () => {
    window.history.replaceState(null, '', '/?p=marketboard&i=phone');
    mountBoard(
      <>
        <GlobalIndustry />
        <MarketBoardPage />
      </>,
    );
    expectBoardShows(PHONES);
    fireEvent.click(segmentLabel('平板电脑'));
    expectBoardShows(TABLETS);
    expect(screen.getByTestId('global-industry').textContent).toBe('phone');
    // 下次切换顶部产业：按新产业对齐，覆盖页内选择
    fireEvent.click(screen.getByRole('button', { name: '顶部产业 wearable' }));
    expectBoardShows(WEARABLES);
  });

  it('映射表：手机/平板/穿戴各对应一份样例，音频/IoT/PC 无样例；样例缺失或会话残留未知产业时不报错', () => {
    expect(marketDatasetOf('phone')?.id).toBe('phone');
    expect(marketDatasetOf('tablet')?.id).toBe('tablet');
    expect(marketDatasetOf('wearable')?.id).toBe('wearables');
    for (const industry of ['audio', 'iot', 'pc'] as Industry[]) expect(marketDatasetOf(industry)).toBeNull();

    // 会话残留未知产业（旧版本 id）：回落首个样例
    writePageViewState('marketboard.industry', 'retired-sample');
    window.history.replaceState(null, '', '/?p=marketboard&i=audio');
    mountBoard();
    expectBoardShows(WEARABLES);
    cleanup();

    // 样例清单里暂缺平板：顶部产业=平板时映射为空，页面保持当前样例并注明覆盖范围
    const at = MARKET_INDUSTRIES.findIndex((d) => d.id === 'tablet');
    const [tablet] = MARKET_INDUSTRIES.splice(at, 1);
    try {
      expect(marketDatasetOf('tablet')).toBeNull();
      window.history.replaceState(null, '', '/?p=marketboard&i=tablet');
      mountBoard();
      expectBoardShows(WEARABLES);
      expect(screen.getByText(/样例覆盖：智能穿戴、智能手机，暂无平板$/)).toBeTruthy();
    } finally {
      MARKET_INDUSTRIES.splice(at, 0, tablet);
    }
  });
});

describe('大盘走势 × 顶部筛选（应用整壳）', () => {
  beforeEach(() => {
    resetEnv('/');
  });

  /** 顶部筛选控件：国家（页头）、产业 / 币种 / 时间簇（筛选条） */
  function filterControls() {
    const bar = document.querySelector<HTMLElement>('.lpl-fb');
    const currency = bar?.querySelector<HTMLElement>('.ant-segmented');
    const timePicker = bar?.querySelector<HTMLElement>('.xbrush-range-picker');
    const country = document.getElementById('scope-country');
    const industry = document.getElementById('scope-industry');
    if (!bar || !currency || !timePicker || !(country instanceof HTMLInputElement) || !(industry instanceof HTMLInputElement)) {
      throw new Error('顶部筛选控件未渲染');
    }
    return { country, industry, currency, timePicker, autoTime: within(bar).getByRole('button', { name: '自动时间' }) };
  }

  /** 国家 / 币种 / 时间簇三项的停用态一致；产业恒可用 */
  function expectScopeFiltersDisabled(disabled: boolean): void {
    const c = filterControls();
    expect(c.country.disabled).toBe(disabled);
    expect(c.currency.classList.contains('ant-segmented-disabled')).toBe(disabled);
    expect(c.currency.querySelectorAll('input:disabled')).toHaveLength(disabled ? 2 : 0);
    expect(c.timePicker.classList.contains('ant-picker-disabled')).toBe(disabled);
    expect(c.autoTime.matches(':disabled')).toBe(disabled);
    expect(c.industry.disabled).toBe(false);
  }

  it('大盘页：国家、币种、时间簇置灰，产业保持可用', () => {
    window.history.replaceState(null, '', '/?p=marketboard');
    render(<App />);
    expectScopeFiltersDisabled(true);
  });

  it('价格走势 ↔ 大盘走势往返：置灰随页切换，回到价格走势全部恢复（筛选条不重挂、无残留）', () => {
    render(<App />);
    expectScopeFiltersDisabled(false);
    const { currency, timePicker } = filterControls();
    fireEvent.click(screen.getByRole('button', { name: '大盘走势' }));
    expectScopeFiltersDisabled(true);
    fireEvent.click(screen.getByRole('button', { name: '价格走势' }));
    expectScopeFiltersDisabled(false);
    // 同一批控件节点：筛选条与时间簇未重挂
    expect(filterControls().currency).toBe(currency);
    expect(filterControls().timePicker).toBe(timePicker);
  });

  it('标签页标题：大盘页按自身口径（阿联酋 · 当前产业），不借用顶部国家；回到价格走势沿用顶部国家', () => {
    window.history.replaceState(null, '', '/?p=marketboard&i=tablet');
    render(<App />);
    expect(document.title).toBe('PriceLens · 大盘走势 · 阿联酋 · 平板电脑');
    fireEvent.click(segmentLabel('智能穿戴'));
    expect(document.title).toBe('PriceLens · 大盘走势 · 阿联酋 · 智能穿戴');
    fireEvent.click(screen.getByRole('button', { name: '价格走势' }));
    expect(document.title).toBe('PriceLens · 价格走势 · 欧亚 / R国');
  });
});
