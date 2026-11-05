// ============================================================
// Chart 渲染测试的 ECharts 桩（第196轮）：jsdom 无 canvas 2d 上下文，
// 真实 echarts.init 会失败。Chart.tsx 只消费 echarts/core 的 use + init
//（实例仅调 setOption/resize/clear/dispose），本桩以无操作实现替换，
// 让 DOM 覆盖层（悬停浮层/量层/名称带）可被 @testing-library 断言。
// 用法：vi.mock('echarts/core', async () => await import('./echartsStub'))
// 并 vi.mock('echarts/charts' | 'echarts/components' | 'echarts/renderers', () => ({}))
// ============================================================
const instance = {
  setOption: (): void => {},
  resize: (): void => {},
  clear: (): void => {},
  dispose: (): void => {},
};

export const use = (): void => {};

export const init = (): typeof instance => instance;

export const ECharts = class {};
