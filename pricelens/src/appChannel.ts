// ============================================================
// 应用版本通道唯一判定源（Eason 2026-11-05 指令：稳定版 / 迭代版双通道；
// 2026-11-06 扩展：演进版独立在线网址 eeasonn.github.io/pricelens/iterate/）
// ----------------------------------------------------------------
// 通道只由**构建形态**决定，共三种（同一产物内恒定，与登录态、用户角色无关）：
// - 本地 dev server（npm run dev，import.meta.env.DEV === true）= 迭代版
//   （iterate）：三页照常显示，功能照旧，持续迭代。
// - 默认生产构建（npm run build → 离线单文件 PriceLens.html / GitHub Pages
//   根路径）= 稳定版（stable）：三处入口**完全不存在**（入口不渲染 + 页 id
//   直达一律落回价格走势），稳定用户不可达。
// - 演进版生产构建（npm run build:iterate，脚本内烤定
//   VITE_APP_CHANNEL=iterate）= 迭代版：同一 Pages 部署多产出一份挂在
//   /iterate/ 子路径的完整版，供内部看全部功能；标签页标题带「演进版」。
//
// 判定纪律（所有改动必须遵守）：
// 1. 本文件是 APP_CHANNEL / STABLE 的**唯一**判定源。任何组件、页面、状态模块
//    不得自行读取 import.meta.env 判通道，也不得新增任何运行期开关——产物内
//    通道恒定，不存在 URL 参数、localStorage、feature flag 等任何运行期逃逸口。
//    VITE_APP_CHANNEL 只在构建期烙定（见 vite.config.ts define），默认生产
//    构建**严禁**设置该变量（npm run build:iterate 是唯一入口，值已烤死）。
// 2. 稳定版收敛语义 = 「入口不存在」（条件渲染，DOM 中无该元素），禁止
//    display:none / visibility 等渲染后视觉隐藏；页 id 直达（?p= 与一切 go()
//    调用）在 PageContext 统一落回 dashboard，见 STABLE_HIDDEN_PAGES。
// ============================================================

/** 版本通道：stable = 生产稳定版；iterate = 迭代版（本地 dev / 在线演进版） */
export type AppChannel = 'stable' | 'iterate';

/** 通道判定纯函数：dev 形态恒 iterate；生产形态由构建期烙定的 VITE_APP_CHANNEL 决定（'' = stable） */
export function resolveAppChannel(dev: boolean, envChannel?: string): AppChannel {
  return dev || envChannel === 'iterate' ? 'iterate' : 'stable';
}

/** 唯一判定：dev server = 迭代版；默认生产构建 = 稳定版；build:iterate = 迭代版（在线演进版） */
export const APP_CHANNEL: AppChannel = resolveAppChannel(
  import.meta.env.DEV === true,
  import.meta.env.VITE_APP_CHANNEL,
);

/** 稳定版快捷判定（入口与路由收敛处统一使用，勿再自行判 env） */
export const STABLE: boolean = APP_CHANNEL === 'stable';

/** 在线演进版（build:iterate 产物 = 生产形态的迭代版）：标签页标题「演进版」标记的唯一依据。
 *  本地 dev 虽同为 iterate 通道但不带标记，日常开发标题不受影响。 */
export const ONLINE_ITERATE: boolean = APP_CHANNEL === 'iterate' && import.meta.env.DEV !== true;

/** 稳定版不上架的页 id（大盘走势 / 量价预测 / 情报中心）——入口与路由的唯一收敛清单。
 *  三页组件代码保留（迭代版继续使用），稳定版只收敛入口与页路由。 */
export const STABLE_HIDDEN_PAGES: readonly string[] = ['marketboard', 'forecast', 'intelligence'];

/** 页 id 是否在当前通道不可达（stable 且属于收敛清单 → 入口不渲染、go() 落回默认页） */
export function hiddenInStable(page: string): boolean {
  return STABLE && STABLE_HIDDEN_PAGES.includes(page);
}
