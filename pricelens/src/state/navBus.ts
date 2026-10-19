// ============================================================
// 页面跳转携带的一次性上下文（第五十四轮追补⑧，总览↔看板闭环）：
// App 内页切换走 go()（无路由、无 URL），跨页意图此前只能靠共享 state。
// navBus = 一次性信封：消费方读后必须清空对应字段，保证只生效一次。
// - overviewScrollTo：看板「← 返回总览」携带的 modelId，总览挂载后滚动定位到该型号行
// - dashboardFocusWeekId：总览下钻（竞品对比/迷你图点周）携带的周桶 id，
//   看板挂载后窗口对准该周 ±8 周（回答「这个低价是怎么发生的」）
// ============================================================
export const navBus: {
  overviewScrollTo: string | null;
  dashboardFocusWeekId: string | null;
  /** 总览对比浮窗「查看价格走势」携带：看板挂载后展开并保持显示时点摘要（消费后清空）。 */
  dashboardPointPanel?: boolean;
  /** 总览进入预警中心时携带的产品/系列/事件焦点；预警页消费后清空。 */
  alertsFocus: {
    modelId: string;
    modelName?: string;
    seriesKey?: string;
    type?: 'price-change' | 'promo' | 'platform-gap' | 'own-gap';
    weekId?: string;
  } | null;
} = {
  overviewScrollTo: null,
  dashboardFocusWeekId: null,
  dashboardPointPanel: false,
  alertsFocus: null,
};
