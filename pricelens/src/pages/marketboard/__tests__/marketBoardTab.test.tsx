// ============================================================
// 「大盘走势」页签接入冒烟（2026-11-03）：
// ① ChartContentBar 四页签顺序（价格→量价→大盘→预测）与切换导航；
// ② ?p=marketboard 链接恢复（urlSync 读侧 + PageProvider 初始页）；
// ③ MarketBoardPage 组装：口径行（模拟数据徽标 + 产业 Segmented）+ 三张
//    大盘卡 + 图表页签行；产业切换后口径/数据说明随产业更新。
// echarts 在 jsdom 无 canvas：mock 'echarts/core' 等模块，只验证 React 组装
// 与导航行为，不验证图表渲染（图内逻辑由 marketBoardModel.test.ts 覆盖）。
// ============================================================
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

vi.mock('echarts/core', () => ({
  use: vi.fn(),
  init: vi.fn(() => ({ setOption: vi.fn(), resize: vi.fn(), dispose: vi.fn() })),
}));
vi.mock('echarts/charts', () => ({ BarChart: {}, LineChart: {}, ScatterChart: {} }));
vi.mock('echarts/components', () => ({
  GridComponent: {},
  TooltipComponent: {},
  LegendComponent: {},
  MarkAreaComponent: {},
}));
vi.mock('echarts/renderers', () => ({ CanvasRenderer: {} }));

// jsdom 无 ResizeObserver（marketBoardUI 的 useEChart 装载时用到）
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;

import { PageProvider, usePage } from '../../../state/PageContext';
import { ChartContentProvider } from '../../../state/chartContent';
import { readUrlOverrides } from '../../../state/urlSync';
import ChartContentBar from '../../../components/ChartContentBar';
import MarketBoardPage from '../../MarketBoardPage';

/** 当前页探针：把 PageProvider 的 page 暴露成可断言文本 */
function Probe() {
  const { page } = usePage();
  return <span data-testid="page-probe">{page}</span>;
}

function mountShell(ui: ReactNode) {
  return render(
    <PageProvider>
      <ChartContentProvider>{ui}</ChartContentProvider>
    </PageProvider>,
  );
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
    window.history.replaceState(null, '', '/?p=marketboard');
    sessionStorage.clear();
  });

  it('口径行（模拟数据徽标 + 产业切换）与三张大盘卡纵排呈现，图表页签行嵌在首卡', () => {
    mountShell(<MarketBoardPage />);
    // 模拟数据徽标：口径行 1 枚 + 三卡卡头各 1 枚（文字承载状态，不靠颜色）
    expect(screen.getAllByText('模拟数据')).toHaveLength(4);
    expect(screen.getByText('核心档位品牌份额趋势')).toBeTruthy();
    expect(screen.getByText('品牌份额趋势')).toBeTruthy();
    expect(screen.getByText('各品牌核心档位结构同比变化')).toBeTruthy();
    // 页嵌在分析壳内：图表页签行同卡呈现，当前页大盘走势选中
    expect(screen.getByRole('button', { name: '大盘走势' }).getAttribute('aria-current')).toBe('page');
  });

  it('产业切换：默认智能穿戴（GFK 口径），切智能手机后口径行/数据说明随产业更新', () => {
    mountShell(<MarketBoardPage />);
    expect(screen.getAllByText(/口径参考 GFK 阿联酋穿戴大盘看板/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText('智能手机'));
    expect(screen.getAllByText(/IDC \/ Counterpoint 2025 GCC 公开口径/).length).toBeGreaterThan(0);
    // 产业选择会话级保留：重挂后仍是智能手机
    cleanup();
    mountShell(<MarketBoardPage />);
    expect(screen.getAllByText(/IDC \/ Counterpoint 2025 GCC 公开口径/).length).toBeGreaterThan(0);
  });
});
