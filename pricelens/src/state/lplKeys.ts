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
  /** 异常价格守卫规则（2026-11-01 数据质量口径：{ enabled, thresholdPct }，配置页维护） */
  cfgAnomalyRule: 'LPL3.config.anomalyRule',
  /** 异常价格人工裁定清单（图上逐点「确认真实价格 / 标记异常」的留痕，可撤销） */
  cfgAnomalyMarks: 'LPL3.config.anomalyMarks',
  /** 国家采集口径（来源、粒度、平台、分期期数与买断规则） */
  cfgMarketRules: 'LPL3.config.marketRules',
  /** 系列归组规则（2026-11-18 配置表化：原表没有、后加的派生规则走配置导入；
   *  行 = { brand, pattern, series }，pattern 前缀匹配、re: 开头为正则；
   *  空表 = 用内置默认（offerSeries.ts port 自 scripts 管线），同键覆盖内置 */
  cfgSeriesRules: 'LPL3.config.seriesRules',
  /** 型号别名（品牌|原始型号 → 目标型号；价格侧型号解析与 PSI 销量解析共用） */
  cfgModelAliases: 'LPL3.config.modelAliases',
  /** 对标矩阵层（有行 = 整体替换数据层 dimBenchmark 矩阵；人工层覆盖语义不变） */
  cfgBenchmarkMatrix: 'LPL3.config.benchmarkMatrix',
  /** 产业价格分档阶梯（产业 → 价格点数组；空表 = 内置 TIER_LADDERS） */
  cfgTierLadders: 'LPL3.config.tierLadders',
  /** 大促档期（国家 × 促销 × 起止 × 深浅 × 平台；空表 = 无大促带） */
  cfgPromoRows: 'LPL3.config.promoRows',
  /** 最近使用的主分析组合（第一百一十七轮，选择产品浮窗快捷 chips；上限 5 组） */
  uiMainCombos: 'LPL3.ui.mainCombos',
  /** 量价参考卡事件类型库（浏览器级长期配置：内置类型颜色覆写 + 自定义类型）。
   *  完整键 = `${referenceEventTypes}`（单键存整库，schemaVersion 内嵌）。 */
  referenceEventTypes: 'LPL3.config.referenceEventTypes',
  /** 量价参考卡工作区（已保存补录 / 预标覆写 / 软删除 / 撤销历史 / 编辑器草稿）。
   *  完整键 = `${referenceWorkspace}.${scopeHash}`，scopeHash 由模型版本 +
   *  国家 + 产业 + 渠道 + 产品稳定序列化生成，避免未来接入真实筛选后串草稿。 */
  referenceWorkspace: 'LPL3.forecast.referenceWorkspace',
  /** 情报候选审核工作区（任务 8：候选状态机 / 编辑草稿 / 已应用事件链接 /
   *  批次号 / 20 步撤销；来源映射不进 WorkbenchParams）。
   *  完整键 = `${intelligenceReview}.${scopeHash}`，scopeHash 口径同
   *  referenceWorkspace（模型版本 + 国家 + 产业 + 渠道 + 产品）。 */
  intelligenceReview: 'LPL3.forecast.intelligenceReview',
} as const;

/** 配置变更广播：配置页保存后主页立即生效（§13） */
export const CONFIG_CHANGED_EVENT = 'lpl3-config-changed';
