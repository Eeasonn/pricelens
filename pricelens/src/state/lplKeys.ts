// ============================================================
// localStorage 键名登记（§13：键前缀 LPL3.*，与任何旧系统不共享）
// 冻结文件：子 Agent 只许引用
// ============================================================
export const LPL = {
  /** 筛选状态持久化（Agent B） */
  filters: 'LPL3.filters',
  /** 默认竞品矩阵（Agent B，总览行尾「＋添加竞品」浮窗维护、主页级联默认勾选来源） */
  cfgBenchmark: 'LPL3.config.benchmark',
  /** 上一代关系手动维护（配置页维护；未维护的型号回退 dim_product.prev_model_id） */
  cfgPrevGen: 'LPL3.config.prevGen',
  /** 参考汇率 USD/RUB（Agent B，默认 80） */
  cfgFx: 'LPL3.config.fx',
  /** 各国默认平台店铺（第一百三十五轮，配置页维护；cc → channel_id） */
  cfgDefaultShop: 'LPL3.config.defaultShop',
  /** 最近使用的主分析组合（第一百一十七轮，选择产品浮窗快捷 chips；上限 5 组） */
  uiMainCombos: 'LPL3.ui.mainCombos',
} as const;

/** 配置变更广播：配置页保存后主页立即生效（§13） */
export const CONFIG_CHANGED_EVENT = 'lpl3-config-changed';
