// ============================================================
// 演进版三页下线回归（2026-11-27 负责人决策：只对稳定版持续迭代，演进版退场）：
// 「大盘走势」（marketboard）「量价预测」（forecast）「情报中心」（intelligence）
// 三页的组件与路由已从代码中删除——
//   ①入口不存在：PageHeader 无「情报中心」页签，ChartContentBar 无
//     「大盘走势」「量价预测」页签（DOM 中不存在，非 display:none）；
//   ②老分享链接兜底：?p= 三页（URL 直达 / 分享链接）静默落回价格走势
//     （dashboard）——不白屏、不报错，URL 残留的 ?p= 随之清除；
//   ③go() 残留页 id 同样落回（PageContext 唯一写入口收敛：Agent 动作目标的
//     page 是字符串，仍可能携带下线前的页 id）；
//   ④urlSync 页参数白名单已收敛，readUrlOverrides 不再解析三页页 id。
// echarts 在 jsdom 无 canvas：mock 同 appShell.test.tsx（只验证 React 组装）。
// ============================================================
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';

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

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;

import App from '../../App';
import { PageProvider, usePage, type Page } from '../../state/PageContext';
import { readUrlOverrides } from '../../state/urlSync';

afterEach(cleanup);

/** 2026-11-27 下线的三页页 id：老分享链接与残留的运行期跳转都可能携带 */
const RETIRED_PAGES = ['forecast', 'marketboard', 'intelligence'] as const;

function resetTo(path: string): void {
  window.history.replaceState(null, '', path);
  sessionStorage.clear();
  try {
    localStorage.clear();
  } catch {
    /* 受限环境 localStorage 不可用（FiltersProvider 自带 try/catch 兜底） */
  }
}

/** 下线页入口在文档中不存在（入口不存在 ≠ 视觉隐藏） */
function expectEntriesAbsent(): void {
  const buttons = Array.from(document.querySelectorAll('button')).map((b) => (b.textContent ?? '').trim());
  expect(buttons.some((label) => label === '情报中心')).toBe(false);
  expect(buttons.some((label) => label === '大盘走势')).toBe(false);
  expect(buttons.some((label) => label === '量价预测')).toBe(false);
}

/** 没有落进错误边界：页面正常渲染，不是白屏 / 报错兜底页 */
function expectNoErrorBoundary(): void {
  expect(document.querySelector('[role="alert"]')).toBeNull();
  expect(document.body.textContent ?? '').not.toContain('页面暂时无法显示');
}

describe('下线三页：入口不存在', () => {
  beforeEach(() => resetTo('/'));

  it('默认页：页头只剩 配置/预警，图表页签只剩 价格走势/量价走势', () => {
    resetTo('/');
    render(<App />);
    const buttons = Array.from(document.querySelectorAll('button')).map((b) => (b.textContent ?? '').trim());
    // 下线入口不存在
    expectEntriesAbsent();
    // 其余导航语义不回归：管理页签与基础图表页签仍在
    expect(buttons).toContain('配置');
    expect(buttons).toContain('预警');
    expect(buttons).toContain('价格走势');
    expect(buttons).toContain('量价走势');
  });
});

describe('下线三页：老分享链接 ?p= 静默落回价格走势（dashboard）', () => {
  beforeEach(() => resetTo('/'));

  it.each(RETIRED_PAGES)(
    '?p=%s 直达 → 渲染价格走势，不白屏不报错（标题 + URL 清理 + 筛选条在位）',
    (page) => {
      resetTo(`/?p=${page}`);
      render(<App />);
      expectNoErrorBoundary();
      // 标题落回价格走势（页状态已收敛为 dashboard）
      expect(document.title).toContain('价格走势');
      expect(document.title).not.toContain('量价预测');
      expect(document.title).not.toContain('大盘走势');
      expect(document.title).not.toContain('情报中心');
      // URL 残留 ?p= 被清除（dashboard 为默认页不写参数）
      expect(window.location.search.includes('p=')).toBe(false);
      // dashboard 语义：筛选条在位
      expect(document.querySelectorAll('.lpl-fb')).toHaveLength(1);
      // 当前页标识唯一落在「价格走势」
      const currents = Array.from(document.querySelectorAll('[aria-current="page"]')).map((el) => (el.textContent ?? '').trim());
      expect(currents).toContain('价格走势');
      expectEntriesAbsent();
    },
  );

  it('白名单其余页不受影响：?p=volume 仍可达量价走势', () => {
    resetTo('/?p=volume');
    render(<App />);
    expectNoErrorBoundary();
    expect(document.title).toContain('量价走势');
    const currents = Array.from(document.querySelectorAll('[aria-current="page"]')).map((el) => (el.textContent ?? '').trim());
    expect(currents).toContain('量价走势');
  });
});

describe('下线三页：go() 残留页 id 同样落回（PageContext 唯一写入口收敛）', () => {
  beforeEach(() => resetTo('/'));

  it.each(RETIRED_PAGES)('go("%s") → 落回 dashboard 且 URL 不写 p=', (target) => {
    let goLive: (() => void) | null = null;
    let goRetired: (() => void) | null = null;
    function Probe({ page }: { page: string }) {
      const { page: current, go } = usePage();
      goLive = () => go('volume');
      // Agent 动作目标的 page 是字符串：模拟 JS 调用方绕过 Page 类型传入下线前的页 id
      goRetired = () => go(page as Page);
      return <output data-testid="current-page">{current}</output>;
    }
    render(
      <PageProvider>
        <Probe page={target} />
      </PageProvider>,
    );
    // 先离开默认页，证明落回是真的回到了 dashboard 而不是原地不动
    act(() => goLive!());
    expect(screen.getByTestId('current-page').textContent).toBe('volume');
    expect(window.location.search).toContain('p=volume');
    act(() => goRetired!());
    expect(screen.getByTestId('current-page').textContent).toBe('dashboard');
    expect(window.location.search.includes('p=')).toBe(false);
  });
});

describe('下线三页：urlSync 页参数白名单收敛', () => {
  it('readUrlOverrides 不解析三页页 id（?p= 静默忽略 → 默认页）', () => {
    expect(readUrlOverridesVia('?p=forecast').page).toBeUndefined();
    expect(readUrlOverridesVia('?p=marketboard').page).toBeUndefined();
    expect(readUrlOverridesVia('?p=intelligence').page).toBeUndefined();
  });

  it('白名单其余页不受影响（?p=volume / ?p=alerts 照常解析）', () => {
    expect(readUrlOverridesVia('?p=volume').page).toBe('volume');
    expect(readUrlOverridesVia('?p=alerts').page).toBe('alerts');
  });
});

/** readUrlOverrides 只读 window.location.search；用最小伪 window 注入（同 urlSync.test.ts 手法） */
function readUrlOverridesVia(search: string): ReturnType<typeof readUrlOverrides> {
  const g = globalThis as { window?: unknown };
  const prev = g.window;
  g.window = { location: { search } };
  try {
    return readUrlOverrides();
  } finally {
    if (prev === undefined) delete g.window;
    else g.window = prev;
  }
}
