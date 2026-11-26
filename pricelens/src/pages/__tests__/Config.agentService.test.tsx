// ============================================================
// 配置页 · 「Agent 模型服务」分块集成测试（App 壳整体渲染，mock fetch）：
//  - 服务器模式：子导航多一项「Agent 模型服务」且排在最后、分块渲染、默认选中态仍在第一个分区；
//    点击该分区后 aria-current 跟随；查阅者态按钮禁用并写出原因；
//    「管理模型服务…」的滚动锚点与分块 id 对得上。
//  - 非服务器模式：子导航与分块都不出现，也不请求服务器（离线 / 在线 Pages 现状不变）。
// echarts mock 同 Config.rbac.test（只验证 React 组装）。
// ============================================================
// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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

const env = vi.hoisted(() => ({ service: true }));
vi.mock('../../data/serviceMode', () => ({ isServiceMode: () => env.service }));

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;

import App from '../../App';
import { ACCESS_ROLE_KEY } from '../../access/role';
import { resetAgentServiceStoreForTests } from '../../agentService/store';
import { scrollToAgentServiceBlock } from '../../components/Assistant/ModelPicker';
import { createFakeAgentService, installAgentServer, installMemoryStorage } from '../../agentService/__tests__/fakeAgentServer';

beforeAll(() => {
  installMemoryStorage();
});
afterAll(() => {
  try {
    window.localStorage.clear();
  } catch {
    /* 受限环境 */
  }
});
beforeEach(() => {
  env.service = true;
  resetAgentServiceStoreForTests();
  const fake = createFakeAgentService();
  installAgentServer(fake.routes);
  window.history.replaceState(null, '', '/?p=config');
  try {
    localStorage.clear();
  } catch {
    /* 受限环境 */
  }
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const nav = (): HTMLElement => document.querySelector('nav[aria-label="配置分区"]') as HTMLElement;
const navLabels = (): string[] => [...nav().querySelectorAll('a')].map((anchor) => anchor.textContent!);
const currentAnchors = (): HTMLElement[] => [...nav().querySelectorAll('a[aria-current="page"]')] as HTMLElement[];
const block = (): HTMLElement | null => document.getElementById('agent-service');

describe('配置页 · Agent 模型服务（服务器模式）', () => {
  it('子导航最后一项是「Agent 模型服务」，分块渲染且左列表 11 家；默认选中态仍是第一个分区', async () => {
    render(<App />);
    await screen.findAllByRole('tab');
    expect(navLabels()).toEqual([
      '竞品对标', '默认店铺', '异常守卫', '上一代关系', '汇率', '大促日历', '规则与字典', '数据包', 'Agent 模型服务',
    ]);
    expect(block()).not.toBeNull();
    expect(within(block()!).getByRole('heading', { name: 'Agent 模型服务' })).toBeTruthy();
    expect(within(block()!).getAllByRole('tab')).toHaveLength(11);
    expect(within(block()!).getByText('仅本机服务器模式 · 密钥只存本机服务器')).toBeTruthy();
    // 既有分区的选中态断言不受影响：恰好一处，且在「竞品对标」
    expect(currentAnchors()).toHaveLength(1);
    expect(currentAnchors()[0]!.textContent).toBe('竞品对标');
  });

  it('点击「Agent 模型服务」分区 → aria-current 跟随；点回「数据包」再跟随回去', async () => {
    render(<App />);
    await screen.findAllByRole('tab');
    const agent = nav().querySelector('a[href="#agent-service"]') as HTMLElement;
    expect(agent.getAttribute('aria-current')).toBeNull();
    fireEvent.click(agent);
    expect(currentAnchors()).toHaveLength(1);
    expect(currentAnchors()[0]!.textContent).toBe('Agent 模型服务');
    fireEvent.click(nav().querySelector('a[href="#data-pack"]') as HTMLElement);
    expect(currentAnchors()[0]!.textContent).toBe('数据包');
  });

  it('「管理模型服务…」的滚动目标就是本分块', async () => {
    render(<App />);
    await screen.findAllByRole('tab');
    let scrolled: Element | null = null;
    const calls: unknown[][] = [];
    const proto = Element.prototype as { scrollIntoView?: unknown };
    const original = proto.scrollIntoView;
    proto.scrollIntoView = function (this: Element, options: unknown) { scrolled = this; calls.push([options]); };
    try {
      scrollToAgentServiceBlock();
      await waitFor(() => expect(calls).toHaveLength(1));
      expect(scrolled).toBe(block());
      expect(calls[0]![0]).toMatchObject({ block: 'start' });
    } finally {
      proto.scrollIntoView = original;
    }
  });

  it('查阅者：分块可看，保存 / 测试按钮禁用并写出原因', async () => {
    render(<App />);
    await screen.findAllByRole('tab');
    localStorage.setItem(ACCESS_ROLE_KEY, 'viewer');
    window.dispatchEvent(new CustomEvent('lpl3-access-role-changed', { detail: 'viewer' }));
    // 原因按字段顺序并列写出（查阅者 + 该家尚未填写的必填项）
    expect(await within(block()!).findByText(/查阅者不可修改配置，请联系 GTM/)).toBeTruthy();
    const save = within(block()!).getByRole('button', { name: /保\s*存/ }) as HTMLButtonElement;
    const test = within(block()!).getByRole('button', { name: /测\s*试\s*连\s*接/ }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(test.disabled).toBe(true);
  });
});

describe('配置页 · 非服务器模式（离线 / 在线 Pages）', () => {
  it('子导航没有「Agent 模型服务」、分块不渲染、不请求服务器', async () => {
    env.service = false;
    const server = installAgentServer(createFakeAgentService().routes);
    render(<App />);
    await waitFor(() => expect(nav()).not.toBeNull());
    await waitFor(() => expect(document.getElementById('data-pack')).not.toBeNull());
    expect(navLabels()).toEqual(['竞品对标', '默认店铺', '异常守卫', '上一代关系', '汇率', '大促日历', '规则与字典', '数据包']);
    expect(block()).toBeNull();
    expect(nav().querySelector('a[href="#agent-service"]')).toBeNull();
    expect(document.querySelector('.aui-model-picker')).toBeNull();
    expect(server.calls).toHaveLength(0);
  });
});
