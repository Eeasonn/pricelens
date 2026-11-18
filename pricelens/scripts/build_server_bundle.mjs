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

// 服务器本体 + region 基座 + 前端
copyFileSync(join(pricelensRoot, 'server', 'server.py'), join(outDir, 'server.py'));
copyFileSync(join(pricelensRoot, 'server', 'ingest_pack.py'), join(outDir, 'ingest_pack.py'));
copyFileSync(join(pricelensRoot, 'src', 'data', 'dim_region.json'), join(outDir, 'dim_region.json'));
cpSync(distDir, join(outDir, 'web'), { recursive: true });

// 预填配置表（导入服务器前的规则/字典全量预填——分发放 docs 同一份）
mkdirSync(join(outDir, '配置表'), { recursive: true });
copyFileSync(join(pricelensRoot, 'public', 'handoff-config.xlsx'), join(outDir, '配置表', `pricelens-config-预填-${ymd}.xlsx`));

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

1. **导入配置表**：选 \`配置表/pricelens-config-预填-${ymd}.xlsx\`（系列规则 133 /
   矩阵 950 / 档期 66 / 阶梯 6 / 别名 1 + C3 字典四页签全量——规则唯一源，必导）。
2. **导入数据包**：选内部 Agent 产出的 v3 JSON（原表模式）。117MB 级全量包直接
   可导（服务器 Python 引擎派生，约 10-60 秒）；浏览器只收 gzip 编码包。

数据承载在 \`data/pricelens.db\`（SQLite：ODS 原样层 + 匹配小表 map_* + 维表/事实，
「原表有的」与「我们加的」一眼可分）。备份/迁移 = 拷贝整个文件夹。

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
