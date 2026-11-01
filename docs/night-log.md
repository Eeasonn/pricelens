# Night Log

> 各任务会话的进度流水（Asia/Shanghai 时间）。新条目追加在上方。

## 2026-11-01 23:26 · 控制台卫生 + 无障碍小修（feature/console-hygiene-2026-11-01）

**任务**：QA 报告（docs/reviews/2026-11-01-quality-pill-qa.md §4 第 6 条）点名的存量控制台警告——
`border`/`borderLeft` 混用 + antd RangePicker `dropdownClassName` 弃用 ×3；顺手核对量价/配置新控件的
`prefers-reduced-motion` 与焦点环。独立 worktree `~/lpl-console-hygiene`（基线 5fc3dd1），不碰
quality-pill 会话与其他 WIP；未实现极差 6 版方案（等用户挑选）。

### 复现结论（先实测、后动手）

- **border/borderLeft 混用 ×2：复现**。唯一混用点 = `VolumePrice.tsx` 面板根 `.lpl-volume-panel`：
  阅读分支 `borderLeft`（长属性）↔ 组内/编辑分支 `border`（简写），同一 DOM 元素跨态切换触发
  React「混用简写与长属性」警告（复现脚本：QA 留档 s1 场景，本 worktree 5222 端口重跑）。
- **dropdownClassName 弃用 ×3：本基线不可复现**。全源码（当前与 QA 各历史树）`git grep` 零命中；
  应用侧唯一 RangePicker（XBrush）已用 5.29 语义 API `classNames.popup.root`；全仓审计
  dropdownClassName/popupClassName/popupStyle/dropdownStyle/overlayClassName/dropdownRender/
  destroyOnClose/bodyStyle/bordered 均未使用；8 页面加载 + 全部 8 个 QA 场景（含 RangePicker、
  产品选择器、级联、模板编辑弹层）console 无任何 antd 弃用告警。两 worktree（quality-pill 与本仓）
  antd 同为 5.29.3。推断 ×3 来自 QA 报告自述的「误连 价格管理-v109 旧目录残留 vite」那次旧构建，
  非本基线存量——故此项无需改码，以审计 + 实测收口。
- 浏览器仍可见 `findDOMNode` 告警（antd 内部 rc-resize-observer，StrictMode 下）——QA 未点名、
  应用侧不可修，不属本任务。

### 改动（5 文件）

1. `pricelens/src/pages/VolumePrice.tsx`：面板根非阅读分支 `border` 简写 → 四边长属性
   （`panelEdge` 提取公共色），阅读分支不动。渲染结果逐边等值，视觉零变化；消除 React 混用警告。
2. `pricelens/src/index.css`：新增 `input.lpl-raw-input:focus-visible`（2px #0070f3，与全站
   button/a 焦点环同款同值）。
3. 三处裸 input 补统一焦点环（原两处 `outline:'none'` 无任何键盘焦点指示、一处浏览器默认环不统一）：
   - `pricelens/src/pages/config/DataQualityBlock.tsx`（配置页「异常价格守卫」自定义阈值输入框）
   - `pricelens/src/chart/PriceTrend/YLimitHandles.tsx`（Y 轴上/下限手柄输入框）
   - `pricelens/src/pages/volume/VolumeBars.tsx`（销量 Y 轴上限输入框）
   不用全局 `input:focus-visible`：antd 内部 input（Switch/Select 搜索框等）抑制状态不一，避免双环；
   专用类只挂裸 input，antd 输入框自带焦点样式不受影响。

### reduced-motion 核对（无需改码）

全局 `@media (prefers-reduced-motion: reduce)` 块（index.css）已将全站 animation/transition 降级为
瞬时，量价新控件（隐显药丸 / 暂存条 / 异常 chip / 阈值 Segmented·Switch）状态反馈不依赖动画；
Playwright `reducedMotion:'reduce'` 实测：页面动画 0s、组内切换与面板显隐正常、console 干净。

### 验证

- 实测（Playwright + 本机 Chrome headless，端口 5222）：8 个 QA 场景脚本全跑，console error/warning
  全部为 0；通过率 s1 27/27、s2 24/24、s3 19/19、s4 19/19、s6 10/10、s7 15/15、r4 6/6；s5 10/11
  （「多平台产品选项含 GW8C option not found」在未改动基线上同样失败——存量，疑与 5fc3dd1
  「异常价格族改名」后脚本期望未更新有关，与本任务无关，未动 anomaly 行为）。
- 焦点环实测：配置页自定义阈值、dashboard Y 轴手柄、量价销量上限三处 input `:focus-visible`
  均为 `solid 2px rgb(0,112,243)`。
- 契约：`design:check` 通过；`design:lint` 0 err / 0 warn；`typecheck` 通过；`npm run check` 全绿
  （verify 46/46，vitest 52 文件 553 测试，build + PriceLens.html 同步 5,793,781 字节）。

### 遗留 / 未做

- 不实现 volume-spread 6 版方案（等用户挑选）；不碰 anomaly/显隐行为。
- findDOMNode（antd 内部）与 s5 存量失败项如上，均未处理。
- 结束后关闭本任务 dev server（5222）；不 push、不部署、不合并。
