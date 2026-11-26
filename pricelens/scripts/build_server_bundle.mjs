// ============================================================
// 服务器部署包装配（2026-11-18 前后端分离，Eason「Windows 上起本机服务器，
// Python + SQLite 简单路线、方便部署」）：npm run server:bundle —— 产出
//   PriceLens-Server-<日期>/
//     ├─ server.py / ingest_pack.py / dim_region.json   本机 Python 服务器
//     ├─ web/                                            前端静态文件（= dist）
//     ├─ 启动PriceLens.bat                               双击启动 + 自动开浏览器
//     ├─ 安装依赖.bat                                     零依赖占位（未来扩展位）
//     ├─ 使用说明.md
//     └─ wheels/（--with-wheels 时：win_amd64 离线轮子，当前引擎纯 stdlib 可不装）
// 拷整个文件夹到内部 Windows 机 → 双击 启动PriceLens.bat → 浏览器自动打开
// http://localhost:8321（服务模式：数据承载 SQLite，117MB 级全量包可直导）。
// 前置：npm run build（脚本默认自动执行，--no-build 跳过）。
// ============================================================
import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)); // pricelens/scripts
const pricelensRoot = resolve(here, '..'); // pricelens/
const repoRoot = resolve(pricelensRoot, '..'); // 仓库根
const noBuild = process.argv.includes('--no-build');
const withWheels = process.argv.includes('--with-wheels');

if (!noBuild) {
  console.log('[server-bundle] 重建前端（npm run build）…');
  const run = spawnSync('npm', ['run', 'build'], { cwd: pricelensRoot, stdio: 'inherit' });
  if (run.status !== 0) {
    console.error('[server-bundle] build 失败，中止装配');
    process.exit(1);
  }
} else {
  console.log('[server-bundle] --no-build：直接使用现有 dist/');
}

const distDir = join(pricelensRoot, 'dist');
if (!existsSync(join(distDir, 'index.html'))) {
  console.error('[server-bundle] 缺少 dist/index.html（先 npm run build）');
  process.exit(1);
}

const today = new Date();
const ymd = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
const outDir = join(repoRoot, 'PriceLens-Server', `PriceLens-Server-${ymd}`);

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

// 服务器本体 + region 基座 + 前端（xlsx_reader.py = stdlib xlsx 只读器，配置表/PSI xlsx 用）
copyFileSync(join(pricelensRoot, 'server', 'server.py'), join(outDir, 'server.py'));
copyFileSync(join(pricelensRoot, 'server', 'ingest_pack.py'), join(outDir, 'ingest_pack.py'));
copyFileSync(join(pricelensRoot, 'server', 'xlsx_reader.py'), join(outDir, 'xlsx_reader.py'));
copyFileSync(join(pricelensRoot, 'src', 'data', 'dim_region.json'), join(outDir, 'dim_region.json'));
cpSync(distDir, join(outDir, 'web'), { recursive: true });

// 预填配置表（导入服务器前的规则/字典全量预填——分发放 docs 同一份）
mkdirSync(join(outDir, '配置表'), { recursive: true });
copyFileSync(join(pricelensRoot, 'public', 'handoff-config.xlsx'), join(outDir, '配置表', `pricelens-config-预填-${ymd}.xlsx`));

// 预置 data/config.json（2026-11-19 开箱即用：与预填 xlsx 同源——起服务器即带
// 全量规则，无需先手动导配置表；后续业务变更仍走「导入配置」或直接编辑此文件）
mkdirSync(join(outDir, 'data'), { recursive: true });
const genCfg = spawnSync('python3', ['-X', 'utf8', 'scripts/build_server_config.py', join(outDir, 'data', 'config.json')], { cwd: pricelensRoot, stdio: 'inherit' });
if (genCfg.status !== 0) console.warn('[server-bundle] 预置 config.json 生成失败（不影响装配，首启后手动导配置表即可）');
// 预置 data/config_tables.xlsx（2026-11-23 数据建模方案 v2：匹配表/竞品匹配/价格档位/
// 大促档期四页签——存在即权威（缺页签回退 config.json 对应段）；人工回填后原位替换即生效）
const configTablesTemplate = join(pricelensRoot, 'server', 'config_tables.template.xlsx');
if (existsSync(configTablesTemplate)) {
  copyFileSync(configTablesTemplate, join(outDir, 'data', 'config_tables.xlsx'));
} else {
  console.warn('[server-bundle] 缺 server/config_tables.template.xlsx（配置表预填不入包，首启后手动放置 data/config_tables.xlsx）');
}
writeFileSync(
  join(outDir, 'data', '数据编辑说明.txt'),
  [
    '本文件夹是服务器的数据源（可直接编辑/整文件替换，保存后约 10-60 秒自动重派生，前端 ~15 秒自动刷新）：',
    '',
    '  offers.csv          街价采集底表——权威格式 = 新 29 列英文表头',
    '                      （tech_date,category,brand,model,color_size,platform,country,store_type,',
    '                       shop_name,shop_name_new,official_*(5列预留可不填),platform_rrp_local,',
    '                       platform_selling_price_local,platform_discount_rate,',
    '                       platform_real_discount_rate,currency,exchange_rate,',
    '                       platform_rrp_usd,platform_selling_price_usd,is_bundle,installment,',
    '                       promotion_details,URL,screenshot,collection_time）',
    '                      兼容旧 24 列中文表头（自动识别，无需转换）',
    '  sales.csv 或 sales.xlsx  PSI 周销量（周粒度）——权威格式 = 新 7 列',
    '                      （Management Region, Management Country/Region, Product, Product SKU,',
    '                       Period ID[周 YYYY0WW], PSI Type[周度], QTY）；兼容旧 6 列 country/product/…',
    '  config_tables.xlsx  配置表+补录表四页签（匹配表[补录]/竞品匹配表/价格档位表/大促档期表）',
    '                      ——存在即权威：人工回填后整文件替换即可；缺页签回退 config.json 对应段',
    '  config.json         配置兜底（系列规则/矩阵/阶梯/档期/字典；已预置全量）',
    '',
    '每周替换真实数据 = 换 offers.csv + sales.csv（或 sales.xlsx）两个文件，其余不动。',
    '注意：CSV 用 Excel 编辑保存时请选「CSV UTF-8」（GBK 编码也能自动识别）；',
    'pricelens.db / latest-pack.json 是派生产物，会被自动重建覆盖，不要手编。',
  ].join('\r\n'),
  'utf8',
);

writeFileSync(
  join(outDir, '启动PriceLens.bat'),
  [
    '@echo off',
    'chcp 65001 >nul',
    'cd /d "%~dp0"',
    'where python >nul 2>nul',
    'if errorlevel 1 (',
    '  echo [!] 未找到 python——请先安装 Python 3.10+（勾选 Add to PATH），或运行 安装依赖.bat 查看说明。',
    '  pause',
    '  exit /b 1',
    ')',
    'start "" http://localhost:8321',
    'python -X utf8 server.py',
    'pause',
    '',
  ].join('\r\n'),
  'utf8',
);

writeFileSync(
  join(outDir, '安装依赖.bat'),
  [
    '@echo off',
    'chcp 65001 >nul',
    'echo PriceLens 服务器当前为零第三方依赖（Python 3.10+ 标准库即可运行）。',
    'echo 若未来版本提示缺依赖：把 wheels 文件夹与本脚本放一起后重新运行本脚本即可离线安装。',
    'if exist "%~dp0wheels" (',
    '  pip install --no-index --find-links "%~dp0wheels" -r "%~dp0requirements.txt"',
    ')',
    'pause',
    '',
  ].join('\r\n'),
  'utf8',
);

const mbOf = (path) => Math.round((readFileSync(path).length / 1024 / 1024) * 10) / 10;

const usage = `# PriceLens 服务器版（${ymd}）

## 启动（内部 Windows 机，1 步）

双击 \`启动PriceLens.bat\` —— 自动打开浏览器 \`http://localhost:8321\`。

要求：Python 3.10+（安装时勾选 **Add to PATH**）。当前服务器为纯标准库实现，
**无需安装任何第三方依赖**；\`安装依赖.bat\` 与 wheels/ 为未来扩展预留。

## 数据导入（配置页完成）

配置已**预置**在 data/config.json（与预填 xlsx 同源：系列规则 133 / 矩阵 950 /
档期 66 / 阶梯 6 / 别名 1 + C3 字典 57）——起服务器即带全量规则，无需先导配置；
后续业务变更走「导入配置」或直接编辑该文件。

数据替换（内部真实数据到位时，**每周 SOP = 换两个文件**）：
- 替换 \`data/offers.csv\`（街价 29 列英文新格式或旧 24 列中文，自动识别）+
  \`data/sales.csv\` 或 \`data/sales.xlsx\`（PSI 新 7 列周销量）——保存后约 10-60 秒
  自动重新派生，前端 ~15 秒内自动刷新生效，无需任何手动操作；
- 配置变更（匹配表回填/竞品/档位/档期）：回填 \`data/config_tables.xlsx\`（四页签
  存在即权威，缺页签回退 config.json）；
- 方式 C：配置页「导入数据包」上传 v3 JSON（117MB 级直导，自动拆写进 data/）。

## 数据文件夹（可直接编辑，改完自动生效）

导入后所有数据以**可编辑文件**形式落在本文件夹的 \`data/\` 下：

    data/
      offers.csv          街价采集底表（29 列英文新格式 / 24 列中文旧格式自动识别）
      sales.csv|.xlsx     PSI 周销量（7 列新格式：Management…/Product/Product SKU/
                          Period ID/PSI Type/QTY；旧 6 列兼容）
      config_tables.xlsx  配置表+补录表四页签（匹配表/竞品匹配/价格档位/大促档期；
                          已预填，人工回填后原位替换即生效）
      config.json         配置兜底（config_tables.xlsx 缺页签时对应段生效）

**直接用编辑器改这些文件并保存**（约 10-60 秒内服务器自动重新派生），浏览器端
会在 ~15 秒内检测到新包并自动刷新——无需任何手动操作。
v3 数据包上传时自动拆写为上述 CSV（上传与 Excel 手编殊途同归）；备份/迁移 =
拷贝整个文件夹。

## 数据承载细节

派生结果同时落 \`data/pricelens.db\`（SQLite v2 数据模型：ODS 原样层 ods_offer/
ods_psi + 匹配配置层 map_product/map_competitor/map_price_band/map_promo + 维表
dim_* + 事实 fact_price[双价族]/fact_sales[周粒度物理化]，详见《PriceLens-数据方案-
表结构与链接关系-稳定版-2026-11-22.xlsx》）；编辑只改源文件，不要手编 db 与
latest-pack.json（它们是派生产物，会被重建覆盖）。

## 双模式说明

- **服务器模式（主力）**：bat 启动后浏览器访问 localhost:8321——数据在服务器，
  大包导入不受浏览器内存限制。
- **单文件兜底**：关闭服务器后，直接双击 \`web/index.html\`（即单文件 PriceLens），
  走离线模式（IndexedDB / 内置数据）。两种方式同一套前端。

## 常见问题

- 端口占用：改环境变量后启动（\`set PRICLENS_PORT=8322 && python server.py\`）。
- 服务器没起时页面自动回落单文件模式，不影响使用。
- web/index.html 大小 ${mbOf(join(distDir, 'index.html'))} MB（前端+内置兜底数据）。
`;

writeFileSync(join(outDir, '使用说明.md'), usage);

if (withWheels) {
  console.log('[server-bundle] --with-wheels：下载 win_amd64 离线轮子（当前零依赖，仅备未来）…');
  const wheelsDir = join(outDir, 'wheels');
  mkdirSync(wheelsDir, { recursive: true });
  const dl = spawnSync(
    'python3',
    ['-m', 'pip', 'download', '--dest', wheelsDir, '--platform', 'win_amd64',
      '--python-version', '3.11', '--only-binary=:all:', 'openpyxl'],
    { stdio: 'inherit' },
  );
  if (dl.status !== 0) console.warn('[server-bundle] wheels 下载失败（不影响主装配）');
  writeFileSync(
    join(outDir, 'requirements.txt'),
    ['openpyxl  # 当前引擎纯标准库；此文件为未来扩展预留', ''].join('\n'),
    'utf8',
  );
}

console.log(`[server-bundle] 装配完成 → ${outDir}`);
console.log(`[server-bundle]   server.py + ingest_pack.py（纯 stdlib）`);
console.log(`[server-bundle]   web/（${mbOf(join(distDir, 'index.html'))} MB 单文件 + 静态资源）`);
console.log('[server-bundle]   启动PriceLens.bat / 使用说明.md / 配置表/');
console.log('[server-bundle] 拷整个文件夹到内部 Windows 机，双击 bat 即用。');
