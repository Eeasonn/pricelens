// ============================================================
// 便携版装配（2026-11-14 Eason「本地可运行、可快速迁移到其他电脑；下周迁移
// 到内部电脑」）：npm run portable —— 产出一个自足文件夹：
//   portable/PriceLens-便携版-<日期>/
//     ├─ PriceLens.html            应用（稳定版单文件，双击即用，内置数据兜底）
//     ├─ pricelens-数据包-<日期>.json  当前数据包（配置页「导入数据包」的承载件）
//     └─ 使用说明.md               迁移与数据更新步骤
// 迁移 = 拷贝整个文件夹到 U 盘/内部电脑。应用先读内置数据兜底；拿到新数据包
// 后在配置页导入（IndexedDB 持久化，之后每次打开自动载入）。
// 前置：先跑 npm run build 生成最新单文件（脚本默认自动执行，--no-build 跳过）。
// ============================================================
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)); // pricelens/scripts
const pricelensRoot = resolve(here, '..'); // pricelens/
const repoRoot = resolve(pricelensRoot, '..'); // 仓库根（PriceLens.html 所在）
const noBuild = process.argv.includes('--no-build');

const dataDir = join(pricelensRoot, 'src', 'data');
const readJson = (name) => JSON.parse(readFileSync(join(dataDir, name), 'utf8'));

const dim = (name) => readJson(`${name}.json`);
const today = new Date();
const ymd = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
const outDir = join(repoRoot, 'portable', `PriceLens-便携版-${ymd}`);
const htmlSrc = join(repoRoot, 'PriceLens.html');

if (!noBuild) {
  console.log('[portable] 重建稳定版单文件（npm run build）…');
  const run = spawnSync('npm', ['run', 'build'], { cwd: pricelensRoot, stdio: 'inherit' });
  if (run.status !== 0) {
    console.error('[portable] build 失败，中止装配');
    process.exit(1);
  }
} else {
  console.log('[portable] --no-build：直接使用现有 PriceLens.html');
}

if (!readFileSync(htmlSrc, 'utf8').includes('<meta name="pricelens-channel" content="stable">')) {
  console.error('[portable] PriceLens.html 不是稳定版单文件产物（缺 stable 通道标记），中止装配');
  process.exit(1);
}

// 数据包 = 维表 + gzip 事实包 b64（与内置同格式）+ 月度原文 —— 与应用内
// buildDataPack() 的产物同构（node 侧直接从 src/data 原文装配，不经 TS）。
const dims = {
  region: dim('dim_region'),
  product: dim('dim_product'),
  channel: dim('dim_channel'),
  time: dim('dim_time'),
  fx: dim('dim_fx'),
  promo: dim('dim_promo'),
  benchmark: dim('dim_benchmark'),
  tier: dim('dim_tier'),
};
const factPackB64 = readFileSync(join(dataDir, 'fact_pack_gzip.b64.txt'), 'utf8').trim();
const monthly = readJson('fact_price_monthly.json');
const pack = {
  kind: 'pricelens-data-pack',
  v: 1,
  generatedAt: new Date().toISOString(),
  dims,
  factPackB64,
  monthly,
};

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
copyFileSync(htmlSrc, join(outDir, 'PriceLens.html'));
const packPath = join(outDir, `pricelens-数据包-${ymd}.json`);
writeFileSync(packPath, JSON.stringify(pack));

const usage = `# PriceLens 便携版（${ymd}）

## 迁移到新电脑（3 步）

1. 把本文件夹整个拷到目标电脑（U 盘 / 内网共享均可）。
2. 双击 \`PriceLens.html\` 用浏览器打开（Chrome / Edge 均可，无需联网、无需安装）。
   —— 此时应用使用**内置数据**（与打包时一致）作为兜底。
3. （可选，推荐）在应用里：配置 → 数据包 → 「导入数据包」→ 选择本文件夹内的
   \`pricelens-数据包-${ymd}.json\`。导入后本机浏览器会持久化该数据包，
   之后每次打开自动载入，价格数据即完全以导入方式承载。

## 数据更新（拿到新一轮价格数据时）

1. 在开发机上更新数据并重建（\`npm run ingest && npm run build && npm run portable\`）。
2. 把新生成的数据包 json 拷到目标电脑，重复上面的「导入数据包」即可——
   无需重新拷贝应用（应用不变时只换数据包）。

## 说明

- 导入的数据保存在**本机浏览器** IndexedDB，不影响其他人；「还原内置数据」
  可随时回到出厂口径。
- 选品、模板、阈值等个人配置用配置页的「导出配置 / 导入配置」另行搬运。
- 浏览器拒绝持久化（隐私模式等）时导入仅本次会话生效，界面会明确提示。
- 数据包生成时间：${pack.generatedAt}；事实包（gzip base64）大小 ≈ ${Math.round(factPackB64.length / 1024)} KB。
`;

writeFileSync(join(outDir, '使用说明.md'), usage);

const mbOf = (path) => Math.round((readFileSync(path).length / 1024 / 1024) * 10) / 10;
console.log(`[portable] 装配完成 → ${outDir}`);
console.log(`[portable]   PriceLens.html            (${mbOf(join(outDir, 'PriceLens.html'))} MB)`);
console.log(`[portable]   pricelens-数据包-${ymd}.json (${mbOf(packPath)} MB)`);
console.log('[portable]   使用说明.md');
console.log('[portable] 把整个文件夹拷到目标电脑即可运行。');
