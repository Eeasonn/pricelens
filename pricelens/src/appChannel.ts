// ============================================================
// 应用版本通道唯一判定源（Eason 2026-11-05 指令：稳定版 / 迭代版双通道）
// ----------------------------------------------------------------
// - 迭代版（iterate）：本地 dev server（npm run dev，import.meta.env.DEV ===
//   true）——「大盘走势」「量价预测」「情报中心」照常显示，功能照旧，持续迭代。
// - 稳定版（stable）：生产构建（npm run build → 离线单文件 PriceLens.html /
//   GitHub Pages 部署）——三处入口**完全不存在**（入口不渲染 + 页 id 直达一律
//   落回价格走势），稳定用户不可达。
//
// 判定纪律（所有改动必须遵守）：
// 1. 本文件是 APP_CHANNEL / STABLE 的**唯一**判定源。任何组件、页面、状态模块
//    不得自行读取 import.meta.env 判通道，也不得新增任何运行期开关——不存在
//    URL 参数、localStorage、feature flag 或环境变量等任何逃逸口。
// 2. 通道只由构建形态决定（dev server = 迭代版；生产构建 = 稳定版），与登录态、
//    用户角色无关；同一构建产物内通道恒定，不做运行期切换。
// 3. 稳定版收敛语义 = 「入口不存在」（条件渲染，DOM 中无该元素），禁止
//    display:none / visibility 等渲染后视觉隐藏；页 id 直达（?p= 与一切 go()
//    调用）在 PageContext 统一落回 dashboard，见 STABLE_HIDDEN_PAGES。
// ============================================================

/** 版本通道：stable = 生产稳定版；iterate = 本地迭代版 */
export type AppChannel = 'stable' | 'iterate';

/** 唯一判定：dev server（Vite DEV）= 迭代版；生产构建 = 稳定版 */
export const APP_CHANNEL: AppChannel = import.meta.env.DEV === true ? 'iterate' : 'stable';

/** 稳定版快捷判定（入口与路由收敛处统一使用，勿再自行判 env） */
export const STABLE: boolean = APP_CHANNEL === 'stable';

/** 稳定版不上架的页 id（大盘走势 / 量价预测 / 情报中心）——入口与路由的唯一收敛清单。
 *  三页组件代码保留（迭代版继续使用），稳定版只收敛入口与页路由。 */
export const STABLE_HIDDEN_PAGES: readonly string[] = ['marketboard', 'forecast', 'intelligence'];

/** 页 id 是否在当前通道不可达（stable 且属于收敛清单 → 入口不渲染、go() 落回默认页） */
export function hiddenInStable(page: string): boolean {
  return STABLE && STABLE_HIDDEN_PAGES.includes(page);
}
