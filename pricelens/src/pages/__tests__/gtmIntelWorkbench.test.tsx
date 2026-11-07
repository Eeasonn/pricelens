// ============================================================
// GTM 情报工作台回归（t428u Batch3）：契约纯函数 + 页面装配 + 抽屉交互。
// 锁定四件诚实性纪律：①五模块分区可见，渠道=待接入占位不装实时；
// ②示例条目必带「示例」徽章且不伪造外链；③图卡 5 要素齐全，未配图 /
// 加载失败走中性灰底缩写；④详情抽屉可键盘打开、Esc 关闭、能真实进入
// 量价预测。稳定版隐藏行为由 stableChannel.test / appChannel.test 覆盖。
// ============================================================
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

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
import {
  GTM_INTEL_ITEMS,
  buildFxIntelItem,
  buildLocalPromoItems,
  filterIntelItems,
  intelItemsForScope,
  type IntelScope,
} from '../intelligence/gtmIntel';

/** 默认视图口径：R国 · 手机 · 周 2026W19–W42（与 FiltersProvider 缺省一致） */
const RU_SCOPE: IntelScope = { countryCode: 'RU', industry: 'phone', granularity: 'week', rangeStart: '202619', rangeEnd: '202642' };

afterEach(cleanup);

describe('GTM 情报 fixture 契约', () => {
  it('每条示例条目 5 要素齐全：是什么 / 哪里 / 什么时候 / 关键变化（可为 null）/ GTM 意义', () => {
    for (const item of GTM_INTEL_ITEMS) {
      expect(item.title.trim(), `${item.id} title`).not.toBe('');
      expect(item.summary.trim(), `${item.id} summary`).not.toBe('');
      expect(item.region.trim(), `${item.id} region`).not.toBe('');
      expect(item.eventDate.trim(), `${item.id} eventDate`).not.toBe('');
      expect(item.gtmMeaning.trim(), `${item.id} gtmMeaning`).not.toBe('');
      expect(['evidence', 'sample'], `${item.id} gtmBasis`).toContain(item.gtmBasis);
      if (item.gtmBasis === 'evidence') {
        expect(item.evidenceNote, `${item.id} evidenceNote`).toBeTruthy();
      }
    }
  });

  it('示例条目不伪造外链 / 不冒充实时：evidence.url 仅允许出现在真实来源上', () => {
    for (const item of GTM_INTEL_ITEMS) {
      if (item.dataMode === 'sample' || item.dataMode === 'pending') {
        expect(item.evidence.url, `${item.id} 不应伪造原始链接`).toBeUndefined();
      }
    }
  });

  it('配图条目全部指向本地 gtm-samples 且授权字段齐全（作者 / 许可 / Commons 源页）', () => {
    const withImages = GTM_INTEL_ITEMS.filter((item) => item.image);
    expect(withImages.length).toBeGreaterThanOrEqual(4);
    for (const item of withImages) {
      expect(item.image?.src.startsWith('/gtm-samples/'), `${item.id} 本地图片`).toBe(true);
      expect(item.image?.credit.trim()).not.toBe('');
      expect(item.image?.license).toMatch(/^CC/);
      expect(item.image?.sourceUrl.startsWith('https://commons.wikimedia.org/wiki/File:')).toBe(true);
    }
  });

  it('渠道模块只有待接入结构占位，不带任何伪数值', () => {
    const channel = GTM_INTEL_ITEMS.filter((item) => item.module === 'channel');
    expect(channel).toHaveLength(1);
    expect(channel[0].dataMode).toBe('pending');
    expect(channel[0].change).toBeNull();
    expect(channel[0].countries).toEqual([]);
  });

  it('刻意保留一条未配图新品条目（演示灰底缩写 fallback）', () => {
    const noImage = GTM_INTEL_ITEMS.filter((item) => item.module === 'new-product' && !item.image);
    expect(noImage.map((item) => item.id)).toContain('np-mate80-ru');
  });
});

describe('scope 过滤联动（国家 / 产业 / 时间窗）', () => {
  it('R国默认视图：包含 R国新品，不含德国专属条目', () => {
    const ids = filterIntelItems(GTM_INTEL_ITEMS, RU_SCOPE).map((item) => item.id);
    expect(ids).toContain('np-iphone17-ru');
    expect(ids).not.toContain('np-pura80-de');
  });

  it('切到德国：德国条目出现、R国专属条目退场（国家联动演示）', () => {
    const deScope: IntelScope = { ...RU_SCOPE, countryCode: 'DE' };
    const ids = filterIntelItems(GTM_INTEL_ITEMS, deScope).map((item) => item.id);
    expect(ids).toContain('np-pura80-de');
    expect(ids).not.toContain('np-iphone17-ru');
    expect(ids).not.toContain('cp-s25u-ru');
  });

  it('窄时间窗（W19–W20）收起尾部周条目：W40+ 事件不再显示', () => {
    const narrow: IntelScope = { ...RU_SCOPE, rangeStart: '202619', rangeEnd: '202620' };
    const ids = filterIntelItems(GTM_INTEL_ITEMS, narrow).map((item) => item.id);
    expect(ids).not.toContain('cp-mi15u-ru'); // weekIds 202640–202642
    expect(ids).not.toContain('me-dram-4q26');
    expect(ids).toContain('ch-visibility-pending'); // 结构占位常驻
  });

  it('产业切换到平板：手机专属条目收起，市场级事件保留', () => {
    const tablet: IntelScope = { ...RU_SCOPE, industry: 'tablet' };
    const ids = filterIntelItems(GTM_INTEL_ITEMS, tablet).map((item) => item.id);
    expect(ids).not.toContain('np-iphone17-ru');
    expect(ids).toContain('me-dram-4q26'); // industries 空 = 市场级
  });
});

describe('本地促销日历（dim_promo 真实数据）与汇率事件', () => {
  it('R国默认窗口映射 BTS 两档促销，窗口外（2 月 / 12 月）不出现', () => {
    const promos = buildLocalPromoItems(RU_SCOPE);
    expect(promos.map((p) => p.title)).toEqual(expect.arrayContaining(['BTS返校季-预热', 'BTS返校季']));
    expect(promos.some((p) => p.title.includes('新年季'))).toBe(false);
    expect(promos.some((p) => p.title.includes('情人节'))).toBe(false);
    expect(promos.every((p) => p.dataMode === 'local' && p.gtmBasis === 'evidence')).toBe(true);
  });

  it('德国窗口含 5 月起的促销（复活节 / Prime Day / 返校季），2 月免税日在窗外', () => {
    const promos = buildLocalPromoItems({ ...RU_SCOPE, countryCode: 'DE' });
    expect(promos.length).toBeGreaterThanOrEqual(3);
    expect(promos.some((p) => p.title === '免税日')).toBe(false);
  });

  it('汇率事件只在 R国显示，数值随区间变化且仍标示例', () => {
    const fx = buildFxIntelItem(RU_SCOPE);
    expect(fx).not.toBeNull();
    expect(fx?.dataMode).toBe('sample');
    expect(fx?.change).toMatch(/^[+−]\d+\.\d%$/);
    const narrow = buildFxIntelItem({ ...RU_SCOPE, rangeStart: '202619', rangeEnd: '202624' });
    expect(narrow?.change).toBe('−8.0%'); // 78.4 → 72.1（演示序列切片）
    expect(buildFxIntelItem({ ...RU_SCOPE, countryCode: 'DE' })).toBeNull();
  });

  it('装配入口 intelItemsForScope：静态示例 + 本地日历 + 汇率，全部通过 scope 过滤', () => {
    const items = intelItemsForScope(RU_SCOPE);
    expect(items.some((item) => item.id === 'promo-cal-RU-bts-2026-08-01')).toBe(true);
    expect(items.some((item) => item.id === 'me-fx-rub')).toBe(true);
    expect(items.every((item) => item.countries.length === 0 || item.countries.includes('RU'))).toBe(true);
  });
});

describe('GTM 工作台页面装配（?p=intelligence）', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/?p=intelligence');
    sessionStorage.clear();
    try {
      localStorage.clear();
    } catch {
      /* 受限环境 localStorage 不可用 */
    }
  });

  const sections = () => Array.from(document.querySelectorAll('[data-lpl-intel-section]'));

  it('五模块分区齐备：渠道为待接入占位，其余分区有卡', () => {
    render(<App />);
    expect(sections().map((s) => s.getAttribute('data-lpl-intel-section'))).toEqual([
      'new-product', 'competitor', 'channel', 'promo', 'market-event',
    ]);
    // 示例条目带「示例」徽章；渠道占位带「待接入」徽章
    expect(document.querySelectorAll('[data-lpl-intel-mode="sample"]').length).toBeGreaterThanOrEqual(6);
    expect(document.querySelectorAll('[data-lpl-intel-mode="pending"]')).toHaveLength(1);
    // 新品/竞品真实产品图 + 未配图条目的灰底缩写并存
    const imgs = Array.from(document.querySelectorAll('img[data-lpl-intel-img]')) as HTMLImageElement[];
    expect(imgs.length).toBeGreaterThanOrEqual(4);
    for (const img of imgs) expect(img.getAttribute('src')).toMatch(/^\/gtm-samples\//);
    expect(document.querySelectorAll('[data-lpl-intel-img-fallback]')).toHaveLength(1);
  });

  it('模块 chips 过滤：点击「新品」收起新品分区，再点恢复', () => {
    render(<App />);
    const chip = document.querySelector('[data-lpl-intel-chip="new-product"]') as HTMLButtonElement;
    expect(document.querySelectorAll('[data-lpl-intel-section="new-product"]')).toHaveLength(1);
    fireEvent.click(chip);
    expect(document.querySelectorAll('[data-lpl-intel-section="new-product"]')).toHaveLength(0);
    fireEvent.click(chip);
    expect(document.querySelectorAll('[data-lpl-intel-section="new-product"]')).toHaveLength(1);
  });

  it('点击卡片展开详情抽屉：5 要素溯源字段 + 图片授权 + 进入量价预测捷径；Esc 关闭', () => {
    render(<App />);
    const card = document.querySelector('[data-lpl-intel-card="np-iphone17-ru"]') as HTMLElement;
    fireEvent.click(card);
    const drawer = document.querySelector('[data-lpl-intel-drawer]');
    expect(drawer).not.toBeNull();
    const text = drawer?.textContent ?? '';
    for (const field of ['是什么', '哪里', '什么时候', '关键变化', 'GTM 意义', '来源状态', '图片授权', 'Olgierd Rudak · CC0']) {
      expect(text).toContain(field);
    }
    expect(text).toContain('示例判断——不构成实时结论');
    expect(document.querySelector('[data-lpl-intel-go-forecast]')).not.toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.querySelector('[data-lpl-intel-drawer]')).toBeNull();
  });

  it('键盘可达：卡片聚焦后 Enter 打开抽屉', () => {
    render(<App />);
    const card = document.querySelector('[data-lpl-intel-card="np-mate80-ru"]') as HTMLElement;
    card.focus();
    expect(document.activeElement).toBe(card);
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(document.querySelector('[data-lpl-intel-drawer]')).not.toBeNull();
  });

  it('抽屉内「进入量价预测」真实跳转到预测页', () => {
    render(<App />);
    fireEvent.click(document.querySelector('[data-lpl-intel-card="cp-s25u-ru"]') as HTMLElement);
    fireEvent.click(document.querySelector('[data-lpl-intel-go-forecast]') as HTMLButtonElement);
    expect(document.title).toContain('量价预测');
    expect(window.location.search).toContain('p=forecast');
  });

  it('图片加载失败（离线单文件场景）退回中性灰底缩写', () => {
    render(<App />);
    const img = document.querySelector('img[data-lpl-intel-img]') as HTMLImageElement;
    fireEvent.error(img);
    // 失败的那张图变成 fallback；页面其余真实图不受影响
    expect(document.querySelectorAll('[data-lpl-intel-img-fallback]')).toHaveLength(2);
    expect(document.querySelectorAll('img[data-lpl-intel-img]')).toHaveLength(3);
  });

  it('未配图新品卡显示「暂无」关键变化与灰底缩写（诚实空态演示）', () => {
    render(<App />);
    const card = document.querySelector('[data-lpl-intel-card="np-mate80-ru"]') as HTMLElement;
    expect(card.textContent).toContain('暂无');
    expect(card.querySelector('[data-lpl-intel-img-fallback]')).not.toBeNull();
    expect(card.textContent).toContain('Huawei Mate 80…');
  });
});
