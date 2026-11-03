// ============================================================
// 量价页「店铺同步」（组内对比主品，2026-11-03 契约收口 + 会话持久化）：
// ① 开 = 本组对比品取价店铺写入主品当前口径（syncComparesWithMain）：
//    对比品全部钉到主品的同一平台口径（转为显式）、主品徽标（平台与自动态）
//    永不改写；② 取消 = 按触发前快照整组还原（对比品回原口径，主品不动）；
// ③ 开态与快照同存会话态 volume.storeSync（键 = 面板 key，跨刷新稳定）：
//    重挂载（刷新语义）后按钮态恢复、取消仍按快照正确还原——修「刷新后按钮
//    态与数据错位、二次同步快照失真」；④ 主产品视图不出现店铺同步入口。
// 不可同步（主品无数据/口径解析不出 → syncComparesWithMain 返回 null）的
// 单元口径由 src/chart/PriceTrend/__tests__/platformSync.test.ts 覆盖；页面层
// 该分支与「无主品卡」守卫在现数据批次不可达（所有 RU 产品均有事实），不另造
// 脏数据硬测。组装模式照 volumePromo.test.tsx；断言走面板头渠道徽标 aria 标签
// （本测试环境无 localStorage，筛选态在内存重算，卡片 id 会变——恰好覆盖
// 「快照 cardId 重定向到当前卡」的稳健性路径）。
// ============================================================
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

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

const RO_WIDTH = 1200;
class ResizeObserverStub {
  cb: ResizeObserverCallback;
  constructor(cb: ResizeObserverCallback) {
    this.cb = cb;
  }
  observe(el: Element): void {
    Object.defineProperty(el, 'clientWidth', { value: RO_WIDTH, configurable: true });
    this.cb([{ contentRect: { width: RO_WIDTH } } as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
  unobserve(): void {}
  disconnect(): void {}
}
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;

import App from '../../../App';

afterEach(cleanup);

/** 店铺同步按钮（aria-pressed 区分开/关；aria-label 随态切换：
 *  关 =「同步 X 的店铺」，开 =「取消 X 的店铺同步」） */
const SYNC_NAME = /^(同步 .+ 的店铺|取消 .+ 的店铺同步)$/;
const storeSyncButton = (): HTMLButtonElement => screen.getByRole('button', { name: SYNC_NAME }) as HTMLButtonElement;
const storeSyncAbsent = (): void => {
  expect(screen.queryByRole('button', { name: SYNC_NAME })).toBeNull();
};
const goGroupView = (): void => {
  fireEvent.click(screen.getByRole('button', { name: /^查看 .+ 所在组的 \d+ 款对比产品$/ }));
};

/** 各面板渠道徽标（面板头平台小药丸）：aria-label「取价平台：X，点击筛选平台-店铺」，
 *  aria-pressed = 显式选择（true）/ 自动口径（false）。顺序 = 面板序，首个 = 主品 */
interface Badge {
  platform: string | null;
  explicit: boolean;
}
const badges = (): Badge[] =>
  Array.from(document.querySelectorAll('button[aria-label^="取价平台："]')).map((el) => ({
    platform: (el.getAttribute('aria-label') ?? '').match(/^取价平台：(.+?)，/)?.[1] ?? null,
    explicit: el.getAttribute('aria-pressed') === 'true',
  }));

describe('量价页 · 店铺同步（组内对比主品）', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/?p=volume');
    sessionStorage.clear();
    try {
      localStorage.clear();
    } catch {
      /* 受限环境 localStorage 不可用（FiltersProvider 自带 try/catch 兜底） */
    }
  });

  it('开启同步：对比品全部钉到主品平台口径（转显式），主品徽标不改写', () => {
    render(<App />);
    storeSyncAbsent(); // 主产品视图无店铺同步入口
    goGroupView();
    const before = badges();
    expect(before.length).toBeGreaterThan(1); // 主品 + 至少一个对比品
    const main = before[0];
    expect(main.platform).not.toBeNull();
    // 触发前对比品并非全部显式（默认自动口径），否则「写入」无从证明
    expect(before.slice(1).some((b) => !b.explicit)).toBe(true);
    const btn = storeSyncButton();
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn);
    expect(storeSyncButton().getAttribute('aria-pressed')).toBe('true');
    const after = badges();
    expect(after.length).toBe(before.length);
    // 主品永不改写：平台与自动/显式态前后一致
    expect(after[0]).toEqual(main);
    // 对比品全部钉到主品平台口径，且转为显式选择
    for (const b of after.slice(1)) {
      expect(b.explicit).toBe(true);
      expect(b.platform).toBe(main.platform);
    }
  });

  it('取消同步：按快照还原对比品原口径，主品保持不变', () => {
    render(<App />);
    goGroupView();
    const before = badges();
    fireEvent.click(storeSyncButton());
    expect(storeSyncButton().getAttribute('aria-pressed')).toBe('true');
    expect(badges().slice(1).every((b) => b.explicit)).toBe(true);
    fireEvent.click(storeSyncButton());
    expect(storeSyncButton().getAttribute('aria-pressed')).toBe('false');
    expect(badges()).toEqual(before); // 主品不动、对比品整组还原（平台 + 自动态）
  });

  it('开态与快照同存会话态（键 = 面板 key）：重挂载后按钮态恢复，取消仍按快照还原', () => {
    render(<App />);
    goGroupView();
    const before = badges();
    fireEvent.click(storeSyncButton());
    // 会话态已落 volume.storeSync（on + snapshot）
    const raw = sessionStorage.getItem('LPL3.view.volume.storeSync');
    expect(raw).not.toBeNull();
    const stored = JSON.parse(raw as string) as Record<string, { on: boolean; snapshot: unknown }>;
    const entry = Object.values(stored).find((v) => v?.on === true);
    expect(entry).toBeTruthy();
    expect(entry?.snapshot).toBeTruthy();
    // 刷新语义：卸载重挂（无 localStorage 环境下卡片 id 会重生成）→ 按钮态恢复
    cleanup();
    render(<App />);
    goGroupView();
    expect(storeSyncButton().getAttribute('aria-pressed')).toBe('true');
    // 二次同步快照不失真：取消后对比品还原到「首次触发前」的原口径，主品不动
    fireEvent.click(storeSyncButton());
    expect(storeSyncButton().getAttribute('aria-pressed')).toBe('false');
    expect(badges()).toEqual(before);
  });
});
