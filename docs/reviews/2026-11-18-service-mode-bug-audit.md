# PriceLens 服务模式总体 BUG 审计（2026-11-18 晚）

> 审计范围：2026-11-18 全天新代码——前后端分离（server.py / ingest_pack.py /
> serviceMode / bootstrap / DataPackBlock 服务分支）、C3 字典显性化（引擎注入 +
> 配置四页签 + 预填脚本）、配置页「规则与字典」区块、悬停卡 portal 化 + 视口钳
> 制、药丸降级单行、销量卡对齐、数据文件夹（CSV）。
> 方法：3 路并行深审（前端服务链 18 项 / 图表层 9 项 / Python 侧亲核）→ 逐条
> 亲核 → 修复 → 全链回归（verify 53/53 + vitest 2105）+ 真机 IAB 抽查。
> 状态标记：✅=已修复并验证 / 📌=挂账（记录不修）/ ✓=确认无误。

## P1（已修复）

1. ✅ **ping 被重建锁阻塞 → 前端探测超时静默降级离线模式**（server.py `_api`）。
   重建持 INGEST_LOCK 10-60s，ping 同步等锁 → detectServiceMode 2.5s 超时 →
   `serviceModeDetected=false` 永久缓存，整会话走单文件链（117MB 导入崩溃场景
   复活）且无提示。修复：ping/pack 改**非阻塞踢一脚**（`kick_rebuild_if_dirty`
   后台线程 + `rebuilding` 标志），重建期间 ping 0.36s 即回、pack 回 503；显式
   操作（datapack/rederive/config POST）保持阻塞等完成回执。实测：dirty 后首拍
   0.36s、rebuilding=true → 完成后 gen 更新。
2. ✅ **探测负结果永久缓存 × 服务器中途恢复不可达**（serviceMode.ts）。修复：
   detect 失败不再永久卡死——`watchServerPack` 双向自愈（离线模式持续重探，
   服务器出现即 reload 切入服务模式）。
3. ✅ **服务器空 config（{}）被当「显性清空」→ 静默移除本地 9 配置键**
   （bootstrap.ts mirrorServerConfig）。新装服务器没人导过配置 ≠ 清空。修复：
   `Object.keys(cfg).length === 0` 跳过镜像。
4. ✅ **syncConfigToServer 失败静默 × 启动镜像服务器权威 → 离线期间导入的配置
   被覆盖丢失**（configImportExport.ts）。修复：失败落 `LPL3.config.syncPending`
   待发队列，下次服务模式启动 mirrorServerConfig 先行重发（成功才清）。
5. ✅ **postServer 无超时 → 服务器挂死 = busy 永久卡死 + loading(0) 泄漏**
   （DataPackBlock.tsx）。修复：AbortController 5 分钟上限 + AbortError 专属
   文案；fetchServerPack/mirror 4s、探测/轮询 2.5s 全链超时纪律。
6. ✅ **onReset 缺 busy 门与 RBAC 双检**（DataPackBlock.tsx）——reset 在途可再
   点导入（两操作交错）；查阅者经 console 直呼可穿过 Popconfirm disabled。
   修复：与导入/重派生同款三道门（busy + canEditConfig + setBusy/finally）。
7. ✅ **服务模式 reset 忽略 clearDataPack 的 cleared 标志**——IndexedDB 占用
   删除失败后照常 reload → 旧包复活、界面谎报「回落内置」。修复：解构 cleared，
   false 时警告并阻止刷新（与单文件分支同一 2026-11-16 语义）。
8. ✅ **RulesDictBlock DictTable rowKey = 首列值（品牌列）→ 大面积重复 key**
   （React 重复 key、翻页/搜索行复用错乱）。修复：渲染前注入索引键；MatrixTable
   组合键追加索引防完全重复行。
9. ✅ **readAliasSheet 精确表头匹配：表头被改（半角括号等）→ 整页签静默 null**
   被当「恢复出厂默认」，导入「成功」数据白丢（与模板「整份校验」承诺相悖）。
   修复：有数据行但期望表头不存在 → 抛错拒绝整份（Config.tsx catch 透出具体
   文案）；`__proto__/constructor/prototype` 危险别名键显性拒绝。
10. ✅ **portal 悬停卡滚动后 hostRect 失效 → 卡钉死旧视口坐标飘移**（Chart.tsx）。
    滚动不触发状态变化、rect 只在重渲染时现读。修复：悬停存续期监听
    `window scroll(capture)` + rAF 合帧强制重渲染（rect 重读）；未悬停零开销。
11. ✅ **视口钳制激活时销量卡掉队**——主卡被钳回视口内而销量卡恒钉原始 edgeX，
    「成组一线」恰在钳制场景（分图窄面板）破功。修复：钳制位移量 `clampDelta`
    加到销量卡 align.x。
12. ✅ **uae 国家别名遗漏（双端同漏）**——PSI 源 "UAE" 行静默 skip 且无诊断。
    旧 PSI 表 `uae: 'AE'` 在并集收编时被漏（只收了 turkiye/uk/britain/saudi）。
    修复：JS DEFAULT_COUNTRY_ALIASES + Python COUNTRY_CODES 各补 `uae`，
    56→57（预填表重生成、xlsx、文档计数、测试断言同步）。
13. ✅ **降级单行后带宽不重算 → 药丸横向溢出名称带压进绘图区**（纵向修好了横
    向没修）。修复：index.tsx nameZoneW memo 移至 splitYFinal 之后，用与
    buildLabelPlan 同一条件（Σ两行盒高+间隙 vs plotHeight，多留 18px 保守余量
    对齐生命周期行近似）预判降级、按单行全文「名称 + 配置」重预留。
14. ✅ **load_v2_pack_to_sqlite fx=0/负数除零崩**（外部 v1/v2 包不经前端
    validateFactPack）。修复：fx 兜底 1（USD 列失真但落库与包透传不断），自检
    回归钉住。

## P2（已修复）

15. ✅ watchServerPack 无幂等护栏 → 加 `watcherStarted`（防未来二次挂载双
    interval）。
16. ✅ 轮询首拍基线取自 ping 而非已装载包 → 「装载与首拍之间重建被吞」。修复：
    bootstrap 传已装载包的 generatedAt 作基线。
17. ✅ generatedAt 秒级粒度 → 同秒两次重建同串、前端漏检。修复：毫秒级
    （`%f` 截 3 位，全 server 分支统一 `_now_tag()`）。
18. ✅ mirrorServerConfig 的 dictionaries 段整体缺失时四 C3 键「跳过」而非
    「移除」，违背「缺段=移除」自述不变量。修复：显式 removeItem 对齐。
19. ✅ resolveCollisions 底界钳制无上界 → 盒高>绘图区的退化输入把标签顶到图
    上方。修复：`Math.max(plotTop + 2, ...)` 一行。
20. ✅ GET /api/pack、/api/config 无中止纪律 → 重建期启动白屏整个重建时长。
    修复：pack 非阻塞化（rebuilding 回 503，前端 watcher 兜底）+ 4s 超时。

## 挂账 → 二轮全修（2026-11-18 深夜 Eason「全部修复」）

- ✅ **location.reload 无用户协商**：轮询发现新包时先探页面浮层（antd
  Modal/Drawer/Popover/Dropdown 可见性）——无浮层自动 reload（保持「编辑完自
  动生效」）；有浮层改顶栏横幅「服务器数据已更新 + 立即刷新」（幂等注入）。
- ✅ **mirror 先于包 apply 失败回落时配置与数据口径错位**：mirrorServerConfig
  写前留 9 键旧值快照；server 包 apply 失败/异常回落 IndexedDB 时整套恢复——
  配置回到本地旧值，与旧包派生口径一致。
- ✅ **syncConfigToServer 整体替换抹自定义段**：前端 null 显式化（?? null），
  server POST /api/config 改 merge 语义——已知段 null=删除、非 null=覆盖，
  existing 独有键（运维自定义）原样保留。
- ✅ **resolveCollisions guard 死路重叠盒毒化后续基准**：底界停住的盒标记
  `saturated`，不再作为后续 pinned 项的上推基准（障碍判定照常）。
- ✅ **tipOverlayLeft/tipGroupPlacement/tipGroupAnchor 死函数 + 过时断言**：
  三函数删除（TipGroupPlacement 接口保留——现行 group 形态）；tipOverlayLeft
  .test.ts 删除、volumeLayer 纯函数用例删除。
- ✅ **销量卡分图窄面板越界**：面板内水平钳制——卡宽按内容估算（名称
  measureText×0.85 截 132 + chrome ~118），右放/左翻/独立三路径锚点钳进
  [8, 容器宽−估宽−8]；容器宽未实测（jsdom/首帧）不钳保原生形态测试兼容。
- ✅ **渲染期同步 getBoundingClientRect reflow**：rect 缓存到 ref，
  ResizeObserver/scroll bump 事件驱动更新，渲染只读缓存（零同步 reflow）。
- ✅ **Excel 锁定 os.replace PermissionError**：_write_json/_write_rows_csv 统一
  _write_with_retry（3 次 × 0.4s 间隔），仍失败抛 500 兜底。
- ✅（注记）**Python 审计第三路代理网络失败**：已由本轮亲核覆盖并修复 #14；
  本条不再构成缺口。

## 确认无误（抽查过没问题）

- 字典注入完整性：ccOf/platformAliasOf/storeAliasOf/industryOfCat 四查表点全走
  ctx 注入、normalizeCountryCode 唯一消费点已注入；无漏网路径。
- 并集 29 个重叠键两侧值全同（无值冲突；问题只在 uae 遗漏）。
- `bottom!` 非空断言在 clampBottom 保护下；「dy 巨负」主路径不存在（zone 期望
  位已钳 ≤ bottom−h−2）；锚定名称塔金测契约不受底界影响。
- tipBox 模式未被 portal 误伤（分支提前 return，portal 代码不可达）。
- mirror 时序：App 渲染前完成 → 首帧即新值，无 stale 窗口；镜像值经 readXxx
  形状过滤，坏档退化为 null=出厂默认而非崩溃。
- null 段语义三端一致（快照 null → 丢键 → 镜像 removeItem = 恢复默认）。
- reset 保留 config.json（「还原数据不动配置」）。
- RulesDictBlock 性能（950 行过滤 + 分页渲染）与 destroyOnHidden 搜索态保持。
- server 资源：conn finally close、JSON 响应均带 Content-Length、客户端断连
  BrokenPipe 不崩线程。

## 回归

- check 全链：verify 53/53 + vitest 2105 全绿（新增/更新：configTemplate 57 计
  数、volumeLayer 贴线对齐、nameZonePlan 降级三用例、serviceMode 6 用例）。
- 真机 IAB：ping 非阻塞（dirty 首拍 0.36s + rebuilding:true → 完成后 gen 毫秒
  级稳定）；CSV 编辑 →11s 自动重派生；销量卡右缘与主卡右缘一线；悬停卡高处完
  整、分图右上锚定；fx=0 畸形包落库兜底自检过。
