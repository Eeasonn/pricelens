// ============================================================
// 稳定版通道（stable）回归（Eason 2026-11-05 双通道指令）：
// 稳定版 = 生产构建（npm run build → 离线单文件 / GitHub Pages），
// 「大盘走势」（marketboard）「量价预测」（forecast）「情报中心」
// （intelligence）三页完全不可达——
//   ①入口不存在：PageHeader 无「情报中心」页签，ChartContentBar 无
//     「大盘走势」「量价预测」页签（DOM 中不存在，非 display:none）；
//   ②页 id 直达落回：?p= 三页（URL 直达 / 分享链接）与一切 go() 调用
//     （Agent 面板跳转等）在 PageContext 唯一写入口统一落回价格走势
//     （dashboard），URL 残留的 ?p= 随之清除；
//   ③?urlSync 页参数白名单按通道收敛，readUrlOverrides 不再解析三页页 id。
// 本文件用 vi.mock 将 appChannel 钉在 stable（vitest 本体运行于 dev 形态
// = 迭代版，迭代版行为由 appShell.test.tsx / appChannel.test.ts 锁定）。
// echarts 在 jsdom 无 canvas：mock 同 appShell.test.tsx（只验证 React 组装）。
// ============================================================
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

vi.mock('../../appChannel', () => ({
  APP_CHANNEL: 'stable' as const,
  STABLE: true,
  ONLINE_ITERATE: false,
  STABLE_HIDDEN_PAGES: ['marketboard', 'forecast', 'intelligence'],
  hiddenInStable: (page: string): boolean => ['marketboard', 'forecast', 'intelligence'].includes(page),
}));

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

function resetTo(path: string): void {
  window.history.replaceState(null, '', path);
  sessionStorage.clear();
  try {
    localStorage.clear();
  } catch {
    /* 受限环境 localStorage 不可用（FiltersProvider 自带 try/catch 兜底） */
  }
}

/** 稳定版 DOM 断言：三页入口在文档中不存在（入口不存在 ≠ 视觉隐藏） */
function expectEntriesAbsent(): void {
  const buttons = Array.from(document.querySelectorAll('button')).map((b) => (b.textContent ?? '').trim());
  expect(buttons.some((label) => label === '情报中心')).toBe(false);
  expect(buttons.some((label) => label === '大盘走势')).toBe(false);
  expect(buttons.some((label) => label === '量价预测')).toBe(false);
}

describe('稳定版：三页入口不存在', () => {
  beforeEach(() => resetTo('/'));

  it('默认页：页头只剩 配置/预警，图表页签只剩 价格走势/量价走势', () => {
    resetTo('/');
    render(<App />);
    const buttons = Array.from(document.querySelectorAll('button')).map((b) => (b.textContent ?? '').trim());
    // 收敛入口不存在
    expectEntriesAbsent();
    // 其余导航语义不回归：管理页签与基础图表页签仍在
    expect(buttons).toContain('配置');
    expect(buttons).toContain('预警');
    expect(buttons).toContain('价格走势');
    expect(buttons).toContain('量价走势');
  });
});

describe('稳定版：三页页 id 直达一律落回价格走势（dashboard）', () => {
  beforeEach(() => resetTo('/'));

  it.each(['forecast', 'marketboard', 'intelligence'] as const)(
    '?p=%s 直达 → 渲染价格走势（标题 + URL 清理 + 筛选条在位）',
    (page) => {
      resetTo(`/?p=${page}`);
      render(<App />);
      // 标题落回价格走势（页状态已收敛为 dashboard）
      expect(document.title).toContain('价格走势');
      expect(document.title).not.toContain('量价预测');
      expect(document.title).not.toContain('大盘走势');
      expect(document.title).not.toContain('情报中心');
      // URL 残留 ?p= 被清除（dashboard 为默认页不写参数）
      expect(window.location.search.includes('p=')).toBe(false);
      // dashboard 语义：筛选条在位（forecast 直达时本页不渲染 FilterBar，可作区分）
      expect(document.querySelectorAll('.lpl-fb')).toHaveLength(1);
      // 当前页标识唯一落在「价格走势」
      const currents = Array.from(document.querySelectorAll('[aria-current="page"]')).map((el) => (el.textContent ?? '').trim());
      expect(currents).toContain('价格走势');
      expectEntriesAbsent();
    },
  );

  it('稳定版其余页直达不回归：?p=volume 仍可达量价走势', () => {
    resetTo('/?p=volume');
    render(<App />);
    expect(document.title).toContain('量价走势');
    const currents = Array.from(document.querySelectorAll('[aria-current="page"]')).map((el) => (el.textContent ?? '').trim());
    expect(currents).toContain('量价走势');
  });
});

describe('稳定版：go() 运行时跳转同样落回（PageContext 唯一写入口收敛）', () => {
  beforeEach(() => resetTo('/'));

  it.each(['forecast', 'marketboard', 'intelligence'] as const)('go("%s") → 落回 dashboard 且 URL 不写 p=', (target) => {
    let probe: (() => void) | null = null;
    function Probe({ page }: { page: Page }) {
      const { go } = usePage();
      probe = () => go(page);
      return null;
    }
    render(
      <PageProvider>
        <Probe page={target} />
      </PageProvider>,
    );
    expect(probe).not.toBeNull();
    probe!();
    expect(window.location.search.includes('p=')).toBe(false);
  });
});

describe('稳定版：urlSync 页参数白名单收敛', () => {
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
