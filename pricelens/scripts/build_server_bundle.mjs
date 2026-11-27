// ============================================================
// 服务器部署包装配
// 2026-11-18 前后端分离（Eason「Windows 上起本机服务器，Python + SQLite 简单路线、
//            方便部署」）；2026-11-26 内网部署改造（Eason「数据按最新结构完整代入；
//            到内部可替换价格、销量原始数据；其余开箱即用」）：数据随包预置并在包内
//            干净重建、出包后自动冒烟、版本戳与校验和。
// npm run server:bundle -- [--no-build] [--with-sales] [--no-smoke] [--with-wheels]
// 产出 PriceLens-Server-<日期>/
//   ├─ server.py / ingest_pack.py / xlsx_reader.py …   本机 Python 服务器（server/*.py 全量）
//   ├─ dim_region.json                                地区基座（配置基座，随部署物携带）
//   ├─ web/                                           前端静态文件（= dist）
//   ├─ data/                                          数据源（权威）+ 派生产物
//   │    ├─ offers.csv          街价原始数据（取本机 server/data 现货）
//   │    ├─ config.json         配置（本机现货优先；缺则由 build_server_config.py 生成）
//   │    ├─ config_tables.xlsx  配置表+补录表（本机权威匹配表现货优先；缺则退模板并告警）
//   │    ├─ last-import.json    月度数据载体（只带 monthly/别名段，不带上传原包）
//   │    ├─ sales.csv|.xlsx     销量原始数据（默认不带；--with-sales 才带）
//   │    ├─ latest-pack.json    派生包（包内 server.py --rebuild 生成）
//   │    └─ pricelens.db        SQLite v3 四节 12 表（同上）
//   ├─ 启动PriceLens.bat / 重建数据.bat / 安装依赖.bat
//   ├─ 使用说明.md / VERSION.txt / SHA256SUMS.txt
//   └─ 配置表/                 配置表预填参考件
// 拷整个文件夹到内部 Windows 机 → 双击 启动PriceLens.bat → 浏览器自动打开
// http://localhost:8321（服务模式：数据承载 SQLite）。
// 前置：npm run build（脚本默认自动执行，--no-build 跳过）。
// ============================================================
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)); // pricelens/scripts
const pricelensRoot = resolve(here, '..'); // pricelens/
const repoRoot = resolve(pricelensRoot, '..'); // 仓库根
const serverDir = join(pricelensRoot, 'server');
const liveData = join(serverDir, 'data'); // 本机数据文件夹（现货 = 当前运行的数据与配置）
const noBuild = process.argv.includes('--no-build');
const withSales = process.argv.includes('--with-sales');
const noSmoke = process.argv.includes('--no-smoke');
const withWheels = process.argv.includes('--with-wheels');

const die = (msg) => {
  console.error(`[server-bundle] ${msg}`);
  process.exit(1);
};
const live = (name) => {
  const p = join(liveData, name);
  return existsSync(p) ? p : null;
};
const mbOf = (path) => Math.round((statSync(path).size / 1024 / 1024) * 10) / 10;
const CRLF = (lines) => lines.join('\r\n');

if (!noBuild) {
  console.log('[server-bundle] 重建前端（npm run build）…');
  const run = spawnSync('npm', ['run', 'build'], { cwd: pricelensRoot, stdio: 'inherit' });
  if (run.status !== 0) die('build 失败，中止装配');
} else {
  console.log('[server-bundle] --no-build：直接使用现有 dist/');
}

const distDir = join(pricelensRoot, 'dist');
if (!existsSync(join(distDir, 'index.html'))) die('缺少 dist/index.html（先 npm run build）');

const today = new Date();
const ymd = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
const outDir = join(repoRoot, 'PriceLens-Server', `PriceLens-Server-${ymd}`);
const dataDir = join(outDir, 'data');

rmSync(outDir, { recursive: true, force: true });
mkdirSync(dataDir, { recursive: true });

// ---- 服务器本体 + 地区基座 + 前端 ----
// server/*.py 全量拷贝（xlsx_reader.py = stdlib xlsx 只读器；后续新增模块自动随包，
// 不再逐个点名——11-26 教训：逐个点名容易漏运行依赖）
const serverPy = readdirSync(serverDir).filter((n) => n.endsWith('.py'));
for (const f of serverPy) copyFileSync(join(serverDir, f), join(outDir, f));
copyFileSync(join(pricelensRoot, 'src', 'data', 'dim_region.json'), join(outDir, 'dim_region.json'));
// Agent 模型服务预置注册表（models.dev 生成，前端与服务器共用的单一数据源）
const providerPresets = join(pricelensRoot, 'src', 'agentService', 'providers.generated.json');
if (!existsSync(providerPresets)) die('缺 src/agentService/providers.generated.json（先运行 npm run providers:gen）');
copyFileSync(providerPresets, join(outDir, 'agent_providers.json'));
cpSync(distDir, join(outDir, 'web'), { recursive: true });

// ---- 配置表预填参考件（分发放 docs 同一份；运行时权威 = data/config_tables.xlsx）----
mkdirSync(join(outDir, '配置表'), { recursive: true });
copyFileSync(join(pricelensRoot, 'public', 'handoff-config.xlsx'), join(outDir, '配置表', `pricelens-config-预填-${ymd}.xlsx`));

// ---- 配置：本机现货优先（内网看到的 = 本机当前运行的）----
const inventory = { config: '', configTables: '', configTableRows: '', offers: '', monthlyRows: 0, sales: '' };
const liveConfig = live('config.json');
if (liveConfig) {
  copyFileSync(liveConfig, join(dataDir, 'config.json'));
  inventory.config = '本机现货 server/data/config.json';
  console.log('[server-bundle] data/config.json ← 本机现货（与当前运行配置一致）');
} else {
  const genCfg = spawnSync('python3', ['-X', 'utf8', 'scripts/build_server_config.py', join(dataDir, 'config.json')], { cwd: pricelensRoot, stdio: 'inherit' });
  if (genCfg.status !== 0) die('本机无 server/data/config.json 且预置生成失败——请先在本机运行一次服务器');
  inventory.config = 'build_server_config.py 生成';
  console.log('[server-bundle] data/config.json ← build_server_config.py 生成（本机无现货）');
}

// 匹配表/竞品/档位/档期四页签：**本机权威匹配表现货优先**。模板只是空壳结构——
// 预置模板会让内网看不到人工维护的全部修订（11-26 发现）
const liveTables = live('config_tables.xlsx');
if (liveTables) {
  copyFileSync(liveTables, join(dataDir, 'config_tables.xlsx'));
  inventory.configTables = '本机权威匹配表现货 server/data/config_tables.xlsx';
  const info = spawnSync(
    'python3',
    ['-X', 'utf8', '-c',
      'import sys\nsys.path.insert(0, sys.argv[1])\nimport xlsx_reader as x\nfor n in x.sheet_names(sys.argv[2]):\n    print("      %s: %d 行" % (n, len(x.read_sheet_dicts(sys.argv[2], n))))',
      serverDir, liveTables],
    { encoding: 'utf8' },
  );
  inventory.configTableRows = (info.stdout || '').trim().split('\n').map((l) => l.trim()).join('；');
  console.log(`[server-bundle] data/config_tables.xlsx ← 本机权威匹配表现货`);
  console.log(info.stdout.trimEnd());
} else {
  const tpl = join(serverDir, 'config_tables.template.xlsx');
  if (!existsSync(tpl)) die('本机无 server/data/config_tables.xlsx 且缺模板——内网包必须带权威匹配表');
  copyFileSync(tpl, join(dataDir, 'config_tables.xlsx'));
  inventory.configTables = '模板（本机无权威匹配表——内网将看不到人工修订）';
  console.warn('[server-bundle] 警告：本机无 server/data/config_tables.xlsx，已退模板（空壳结构）');
}

// ---- 价格原始数据（必带）----
const liveOffers = live('offers.csv') ?? live('offers.json');
if (!liveOffers) die('本机 server/data 下没有 offers.csv——内网包必须预置价格原始数据');
copyFileSync(liveOffers, join(dataDir, basename(liveOffers)));
inventory.offers = `${basename(liveOffers)}（${mbOf(liveOffers)} MB）`;
console.log(`[server-bundle] data/${inventory.offers} ← 街价原始数据`);

// ---- 月度数据载体：只带 monthly / 别名段（上传原包含全量 offers 重复 98MB，不入包）----
const packSrc = live('latest-pack.json') ?? live('last-import.json');
let monthly = [];
let aliases = {};
if (packSrc) {
  const p = JSON.parse(readFileSync(packSrc, 'utf8'));
  monthly = Array.isArray(p.monthly) ? p.monthly : [];
  const a = p.salesProductAliases;
  aliases = a && typeof a === 'object' && !Array.isArray(a) ? a : {};
}
if (monthly.length) {
  writeFileSync(
    join(dataDir, 'last-import.json'),
    JSON.stringify({
      kind: 'pricelens-data-pack', v: 3, generatedAt: today.toISOString(),
      note: '部署包月度数据载体：只含 monthly / salesProductAliases；价格与销量原始数据见 offers.csv、sales.csv',
      monthly, salesProductAliases: aliases,
    }),
    'utf8',
  );
  inventory.monthlyRows = monthly.length;
  console.log(`[server-bundle] data/last-import.json ← 月度数据载体（${monthly.length} 行）`);
}

// ---- 销量原始数据：默认不入包 ----
// 销量默认不入包：真实 PSI 到位后放 data/sales.csv 即生效（7 列格式见下方「数据编辑说明」）。
// 模拟数据行的 psi_type=simulated 在页面上标「模拟」，不会冒充真实 PSI；确需带模拟数据
// 用 --with-sales（2026-11-27 起 psi_type 带下划线的表头也能被识别，此前会被当成真实 PSI）。
if (withSales) {
  const s = live('sales.xlsx') ?? live('sales.csv') ?? live('sales.json');
  if (s) {
    copyFileSync(s, join(dataDir, basename(s)));
    inventory.sales = `${basename(s)}（--with-sales 指定）`;
    console.log(`[server-bundle] data/${basename(s)} ← 销量数据（--with-sales）`);
  } else {
    console.warn('[server-bundle] --with-sales 但本机无销量文件，跳过');
  }
} else {
  console.log('[server-bundle] 销量数据默认不入包（量价页销量 = 估算口径）');
}

// ---- 包内干净重建：派生包 + SQLite 只由包内文件生成（不依赖本机任何派生物）----
console.log('[server-bundle] 包内干净重建（server.py --rebuild）…');
const rb = spawnSync('python3', ['-X', 'utf8', 'server.py', '--rebuild'], { cwd: outDir, stdio: 'inherit' });
if (rb.status !== 0) die('包内重建失败');
for (const f of ['latest-pack.json', 'pricelens.db']) {
  if (!existsSync(join(dataDir, f))) die(`包内重建后缺 data/${f}`);
}

// ---- 数据编辑说明 ----
writeFileSync(
  join(dataDir, '数据编辑说明.txt'),
  CRLF([
    '本文件夹是服务器的数据源。原始数据与配置可直接编辑 / 整文件替换；保存后约 10-60 秒',
    '自动重派生，前端约 15 秒内自动刷新。也可双击上一级的「重建数据.bat」立即重建。',
    '',
    '【原始数据 · 可替换】',
    '  offers.csv            街价采集原始数据——新 29 列英文表头',
    '                        （tech_date, category, brand, model, color_size, platform, country,',
    '                         store_type, shop_name, shop_name_new, official_*（5 列预留）,',
    '                         platform_rrp_local, platform_selling_price_local, platform_discount_rate,',
    '                         platform_real_discount_rate, currency, exchange_rate,',
    '                         platform_rrp_usd, platform_selling_price_usd, is_bundle, installment,',
    '                         promotion_details, URL, screenshot, collection_time）；',
    '                        兼容旧 24 列中文表头（自动识别，无需转换）',
    '  sales.csv / sales.xlsx 销量原始数据（周粒度）——新 7 列',
    '                        （Management Region, Management Country/Region, Product, Product SKU,',
    '                         Period ID（周，如 2025008 = 2025 年第 8 周）, PSI Type（口径，如 Sell Out）, QTY）；',
    '                        兼容旧 6 列 country/product/…（可带 category1/2/3 配置列）',
    '                        本包默认未带销量文件：放入后自动生效',
    '                        销量怎么对到产品：Product（型号名）+ Product SKU 串里拆出的存储 / 尺寸 / 柔光 / 表盘',
    '                        = 匹配表该行的 psi_product + category1~3；同型号同配置的多个 SKU 串销量相加，',
    '                        颜色 / 插头 / 渠道版等信息不参与。PSI 型号名与匹配表型号名叫法不同的，',
    '                        在匹配表该行的 psi_product 列登记 PSI 叫法；某个 SKU 串规则拆不对的，可在',
    '                        config_tables.xlsx 加「PSI规格对照」页签（psi_product / product_sku / category1~4）手填。',
    '',
    '【配置 · 人工维护】',
    '  config_tables.xlsx    配置表 + 补录表（匹配表 / 竞品匹配 / 价格档位 / 大促档期）',
    '                        ——存在即权威，本文件是内网的唯一权威版本；改完保存即重派生',
    '  config.json           其余配置兜底（系列规则 / 对标矩阵 / 阶梯 / 档期 / 字典）',
    '  last-import.json      月度数据载体（运营商月度价格，非销量）——一般不用动',
    '',
    '【派生产物 · 不要手编】',
    '  latest-pack.json      派生数据包（服务器发给前端的那一份）',
    '  pricelens.db          SQLite 数据库（v3 四节 12 表，可用 DB Browser 打开查看）',
    '                        对不上的销量行在 fact_sales 里 model_id 为空、match_status 记原因（待处理清单）',
    '',
    '每周替换数据 = 换 offers.csv（价格）+ 放入 sales 文件（销量），其余不动。',
    '注意：CSV 用 Excel 编辑保存时请选「CSV UTF-8」（GBK 编码也能自动识别）。',
  ]),
  'utf8',
);

// ---- 启动 / 重建 / 依赖 脚本 ----
writeFileSync(
  join(outDir, '启动PriceLens.bat'),
  CRLF([
    '@echo off',
    'chcp 65001 >nul',
    'cd /d "%~dp0"',
    'where python >nul 2>nul',
    'if errorlevel 1 (',
    '  echo [!] 未找到 python——请先安装 Python 3.10+（安装时勾选 Add to PATH）。',
    '  pause',
    '  exit /b 1',
    ')',
    'start "" http://localhost:8321',
    'python -X utf8 server.py',
    'pause',
    '',
  ]),
  'utf8',
);
writeFileSync(
  join(outDir, '重建数据.bat'),
  CRLF([
    '@echo off',
    'chcp 65001 >nul',
    'cd /d "%~dp0"',
    'netstat -ano | findstr /R /C:":8321 .*LISTENING" >nul',
    'if not errorlevel 1 (',
    '  echo [!] PriceLens 服务器正在运行，不需要手动重建：改动 data/ 里的文件后约 1 分钟内自动生效，刷新浏览器即可。',
    '  pause',
    '  exit /b 0',
    ')',
    'echo 正在按 data/ 文件夹里的原始数据与配置重建（约 1-2 分钟，请勿关闭窗口）…',
    'python -X utf8 server.py --rebuild',
    'echo.',
    'echo 重建完成。若服务器正在运行，刷新浏览器即可看到新数据。',
    'pause',
    '',
  ]),
  'utf8',
);
writeFileSync(
  join(outDir, '安装依赖.bat'),
  CRLF([
    '@echo off',
    'chcp 65001 >nul',
    'echo PriceLens 服务器为零第三方依赖（Python 3.10+ 标准库即可运行），无需安装任何包。',
    'echo 若未来版本提示缺依赖：把 wheels 文件夹与本脚本放一起后重新运行本脚本即可离线安装。',
    'if exist "%~dp0wheels" (',
    '  pip install --no-index --find-links "%~dp0wheels" -r "%~dp0requirements.txt"',
    ')',
    'pause',
    '',
  ]),
  'utf8',
);

// ---- 冒烟：从包里起一次服务器（独立端口），验证接口、数据、前端 ----
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getJson(url, timeoutMs) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    return { status: res.status, json: res.ok ? await res.json() : null };
  } finally {
    clearTimeout(t);
  }
}
async function smokeTest() {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const port = 20000 + Math.floor(Math.random() * 20000);
    const child = spawn('python3', ['-X', 'utf8', 'server.py'], {
      cwd: outDir, env: { ...process.env, PRICLENS_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let log = '';
    child.stdout.on('data', (d) => { log += d; });
    child.stderr.on('data', (d) => { log += d; });
    const exited = new Promise((r) => child.on('exit', r));
    let ping = null;
    const t0 = Date.now();
    while (Date.now() - t0 < 30000 && child.exitCode === null && !ping) {
      await sleep(400);
      try {
        const r = await getJson(`http://127.0.0.1:${port}/api/ping`, 3000);
        if (r.status === 200 && r.json?.ok) ping = r.json;
      } catch { /* 未就绪，继续等 */ }
    }
    if (!ping) {
      if (child.exitCode === null) child.kill();
      await exited;
      if (/端口 .* 已被占用/.test(log)) {
        console.warn(`[server-bundle] 冒烟端口 ${port} 被占用，换端口重试`);
        continue;
      }
      die(`包内服务器起不来：\n${log.slice(-1500)}`);
    }
    // 无论成功、断言失败还是中途抛错，都必须关掉冒烟用的服务器（finally）
    try {
      const pack = await getJson(`http://127.0.0.1:${port}/api/pack`, 30000);
      const front = await fetch(`http://127.0.0.1:${port}/`).then(async (r) => ({ status: r.status, text: await r.text() })).catch(() => ({ status: 0, text: '' }));
      // Agent 模型服务：预置注册表随包、未配置时 /runs 回 fallback 信封（前端落本地引擎）
      const agent = await getJson(`http://127.0.0.1:${port}/api/agent/providers`, 8000);
      const runs = await fetch(`http://127.0.0.1:${port}/api/agent/runs`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        // 带合法 baseline：服务器先校验请求格式（无效请求 400），未配置模型才回 502 + fallback
        body: JSON.stringify({
          text: '冒烟', runId: 'bundle-smoke',
          baseline: { intent: 'query', summary: '冒烟基线', steps: [], cards: [], citations: [], suggestions: [], contextFingerprint: 'smoke' },
        }),
      }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) })).catch(() => ({ status: 0, json: null }));
      return { port, ping, pack: pack.json, front, agent, runs };
    } finally {
      child.kill();
      await exited;
    }
  }
  return null;
}

let smoke = null;
if (noSmoke) {
  console.log('[server-bundle] --no-smoke：跳过包内冒烟');
} else {
  console.log('[server-bundle] 包内冒烟：从包里起服务器验证…');
  smoke = await smokeTest();
  if (!smoke) die('冒烟失败（三次均未起来）');
  const dims = smoke.pack?.dims || {};
  const problems = [];
  if (!smoke.ping?.hasPack || !smoke.ping?.editableFolder || smoke.ping?.rebuilding) problems.push(`ping 异常：${JSON.stringify(smoke.ping)}`);
  if (smoke.pack?.kind !== 'pricelens-data-pack' || smoke.pack?.v !== 2) problems.push('派生包类型/版本不对');
  if (!(dims.product || []).length) problems.push('派生包无产品字典');
  if (!smoke.pack?.factPackB64) problems.push('派生包无事实包');
  if (smoke.front.status !== 200 || !smoke.front.text.includes('PriceLens')) problems.push(`前端首页异常（HTTP ${smoke.front.status}）`);
  const presets = smoke.agent?.json?.presets || [];
  if (presets.length < 11 || presets[0]?.id !== 'zhipu' || presets[presets.length - 1]?.id !== 'custom') problems.push('Agent 供应商预置不对');
  if (smoke.runs?.status !== 502 || !smoke.runs?.json?.fallback) problems.push(`Agent /runs 未配置时的回退信封不对（HTTP ${smoke.runs?.status}）`);
  const salesRows = (smoke.pack?.sales || []).length;
  if (withSales ? salesRows === 0 : salesRows !== 0) problems.push(`销量行数 ${salesRows} 与预期不符`);
  if (problems.length) die(`冒烟未通过：\n  - ${problems.join('\n  - ')}`);
  const salesDiag = (() => {
    return '';
  })();
  console.log(`[server-bundle] 冒烟通过（端口 ${smoke.port}）：周 ${(dims.time || []).length} · SKU ${(dims.product || []).length} · 对标 ${(dims.benchmark || []).length} · 月度 ${(smoke.pack?.monthly || []).length} 行 · 销量 ${salesRows} 行 · Agent 预置 ${presets.length} 家`);
}

// ---- 版本戳 ----
const git = (args) => {
  try { return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim(); } catch { return ''; }
};
const dirtyFiles = git(['status', '--porcelain']).split('\n').filter(Boolean);
const pyVer = spawnSync('python3', ['--version'], { encoding: 'utf8' }).stdout.trim();
// 提交钩子在门禁之后会再同步一次单文件，提交后恒留一处 M PriceLens.html（与 dist/index.html
// 同源，仅构建标记不同）——只有这一项时如实说明，不写成「未提交文件」吓到内部同事
const versionDirtyNote = (files) => {
  if (files.length === 0) return '构建时工作区干净';
  // git status --porcelain 每行是「XY 路径」，首行开头的空格会被外层 trim() 吃掉——逐行 trim 后再比
  if (files.length === 1 && files[0].trim() === 'M PriceLens.html') {
    return '构建时工作区干净（PriceLens.html 仅为提交钩子末尾重新同步单文件留下的构建标记差异，与 web/index.html 同源）';
  }
  return `构建时未提交的文件：\n${files.map((l) => `  ${l}`).join('\n')}`;
};
const dims = smoke?.pack?.dims || {};
const builtAt = today.toLocaleString('zh-CN', { hour12: false });
writeFileSync(
  join(outDir, 'VERSION.txt'),
  [
    `PriceLens 服务器版（内部部署）`,
    `构建时间：${builtAt}`,
    `代码版本：${git(['rev-parse', 'HEAD']) || '未知'}（分支 ${git(['rev-parse', '--abbrev-ref', 'HEAD']) || '未知'}）`,
    versionDirtyNote(dirtyFiles),
    ``,
    `数据：`,
    `  价格原始数据：data/${inventory.offers}`,
    `  配置：data/config.json ← ${inventory.config}`,
    `  配置表：data/config_tables.xlsx ← ${inventory.configTables}`,
    inventory.configTableRows ? `    ${inventory.configTableRows}` : '',
    `  月度数据：${inventory.monthlyRows} 行`,
    `  销量原始数据：${inventory.sales || '未带（量价页销量 = 估算口径）'}`,
    smoke ? `  派生结果：周 ${(dims.time || []).length} · SKU ${(dims.product || []).length} · 对标 ${(dims.benchmark || []).length} · 派生时间 ${(smoke.pack?.generatedAt || '').slice(0, 19)}` : '  派生结果：（未冒烟）',
    ``,
    `装配环境：${pyVer}（包内重建与冒烟均用此版本；内网要求 Python 3.10+）`,
    `完整性校验：见 SHA256SUMS.txt`,
    ``,
  ].filter((l) => l !== undefined).join('\n'),
  'utf8',
);

// 包内重建与冒烟会让 Python 在包根生成 __pycache__（macOS 上的字节码缓存，对内部机器无用
// 且不该出现在交付件里）——算校验和之前清掉
rmSync(join(outDir, '__pycache__'), { recursive: true, force: true });

// ---- 校验和 ----
const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
const sums = walk(outDir)
  .sort()
  .map((p) => `${sha256(p)}  ${relative(outDir, p).split('\\').join('/')}`);
writeFileSync(join(outDir, 'SHA256SUMS.txt'), `${sums.join('\n')}\n`, 'utf8');
const totalMb = walk(outDir).reduce((n, p) => n + statSync(p).size, 0) / 1024 / 1024;
const manifestHash = createHash('sha256').update(`${sums.join('\n')}\n`).digest('hex').slice(0, 16);

// ---- 使用说明 ----
const AGENT_USAGE = `Agent 的模型服务**到内网后配置**（包里不带任何密钥）：

1. 打开应用 → 顶部「配置」→「Agent 模型服务」。
2. 左侧选服务商。预置：智谱 BigModel、Kimi / Moonshot、DeepSeek、阿里百炼 Qwen、硅基流动、OpenAI、
   OpenRouter、Ollama（本机）、LM Studio（本机）；最后一项是「自定义 OpenAI 兼容」。Anthropic 为占位，暂不可用。
3. 填 API Key（本机服务不需要）→ 点「获取模型列表」（失败会显示预置清单并说明原因）→ 选模型。
4. 点「测试连接」：成功显示延迟；失败会说明原因（Key 无效 / 地址或模型不存在 / 连不上服务）。
5. 点「保存」并设为当前模型。Agent 面板输入框下方的模型选择器可随时切换。

- 密钥只保存在本机服务器的 \`data/agent-providers.json\`，浏览器不保存，不出现在日志和配置导出里。
  **该文件含密钥**，拷贝或备份 data/ 文件夹时请注意。
- 内网自建模型服务：选「自定义 OpenAI 兼容」，填内网地址与模型 ID（需要能从这台机器访问）。
- 未配置模型时 Agent 仍可用本地确定性引擎回答（数字与卡片照常），只是没有结合看板的叙述增强。
- 模型只负责改写叙述与建议，不改数字、卡片和引用——这些始终由本地数据引擎计算。`;

const usage = `# PriceLens 服务器版（内部部署）· ${ymd}

版本与数据清单见 \`VERSION.txt\`；文件校验见 \`SHA256SUMS.txt\`。

## 1. 启动（内部 Windows 机，1 步）

双击 \`启动PriceLens.bat\` —— 自动打开浏览器 \`http://localhost:8321\`。

要求：Python 3.10+（安装时勾选 **Add to PATH**）。服务器为纯标准库实现，**无需安装任何第三方依赖**。
服务器只在本机（127.0.0.1）提供服务、没有登录鉴权——每位同事在自己机器上各起一份，不要直接当局域网服务。

## 2. 包里带了什么（开箱即用）

- **前端 + 服务器**：同一套代码构建，与版本戳里的提交一致。
- **价格原始数据**：\`data/offers.csv\`（${inventory.offers}），已在包内重建完成，首次启动即可用。
- **配置与权威匹配表**：\`data/config.json\`、\`data/config_tables.xlsx\`（${inventory.configTables}）。
- **月度数据**：${inventory.monthlyRows} 行（运营商月度价格，随包携带）。
- **派生产物**：\`data/latest-pack.json\`（服务器发给前端的数据包）与 \`data/pricelens.db\`（SQLite，v3 四节 12 表）。
- **销量原始数据**：${inventory.sales || '**未带**——量价页的销量为「估算」口径（页面有标注）。真实销量到位后按第 3 节放入即可'}。

## 3. 替换数据（每周 SOP）

| 要换什么 | 怎么做 |
|---|---|
| 价格原始数据 | 用新文件替换 \`data/offers.csv\` |
| 销量原始数据 | 放入 \`data/sales.csv\` 或 \`data/sales.xlsx\`（格式见 \`data/数据编辑说明.txt\`） |
| 匹配表 / 竞品 / 档位 / 档期 | 编辑 \`data/config_tables.xlsx\` 对应页签后保存 |
| 其余配置 | 编辑 \`data/config.json\` |

保存后约 10-60 秒自动重新派生，浏览器约 15 秒内自动刷新。不想等就双击 \`重建数据.bat\` 立即重建。
也可以在应用「配置」页用「导入数据包」上传 v3 JSON 数据包，效果相同。

${'## 4. 数据结构（v3 · 四节 12 表）'}

派生结果落 \`data/pricelens.db\`，可用 DB Browser for SQLite 直接打开查看：

| 节 | 表 | 说明 |
|---|---|---|
| ODS 原始层 | ods_offer、ods_psi | 价格采集、销量原始数据，原样落库 |
| 补录 / 配置 | cfg_competitor、map_price_band、map_promo、map_region | 竞品配置、价格档位、大促档期、国家匹配 |
| MAP | map_product | 匹配表（只对应价格侧：原文 → 产品身份，含人工修订前的原值 orig_*；行上的 psi_product + category1~3 是销量取数键） |
| MAP | map_psi_sku | PSI 规格对照：一个不同的「Product + Product SKU」串一行，拆出 category1~3（规则每次刷新生成，可人工覆盖） |
| FACT | fact_price、fact_sales | 价格宽表（39 列）；销量 = 周 × 口径 × 国家 × 型号 × category 求和 |
| 系统 | cfg_kv、meta_import | 导入记录 |

数据质量问题直接改原始文件或配置表，派生层不做兜底清洗。

## 5. Agent 模型服务（到内网后配置）

${AGENT_USAGE}

## 6. 部署后验证清单

- [ ] 双击启动后浏览器打开，配置页显示「服务器模式」与数据周数 / SKU 数
- [ ] 价格走势页有图，最新周与 VERSION.txt 的派生结果一致
- [ ] 产品筛选器里能看到匹配表修订后的系列与配置
- [ ] 替换 \`data/offers.csv\` 后约 1 分钟内页面自动刷新为新数据
- [ ] Agent 模型服务按第 5 节配置后「测试连接」成功

## 7. 已知限制

- **南非运营商小册子专属机型缺失**（服务器模式下小册子里的独占机型暂未并入；已知待办）。
- 约 60 个型号在服务器里使用归一后的名称，与更早的离线版略有差别。
- Windows 上的启动脚本与 Python 环境需在目标机实测（装配机为 macOS）。

## 8. 常见问题

- 端口占用：改环境变量后启动（\`set PRICLENS_PORT=8322 && python -X utf8 server.py\`）。
- 服务器没起时页面自动回落单文件模式（内置兜底数据，不含本包的数据）。
- 替换数据后页面没变：看启动窗口有没有报错（常见是 CSV 列名或编码不对），改好后保存会自动重试。
- web/index.html 大小 ${mbOf(join(distDir, 'index.html'))} MB（前端 + 内置兜底数据）。
`;
writeFileSync(join(outDir, '使用说明.md'), usage);

if (withWheels) {
  console.log('[server-bundle] --with-wheels：下载 win_amd64 离线轮子（当前零依赖，仅备未来）…');
  const wheelsDir = join(outDir, 'wheels');
  mkdirSync(wheelsDir, { recursive: true });
  const dl = spawnSync(
    'python3',
    ['-m', 'pip', 'download', '--dest', wheelsDir, '--platform', 'win_amd64', '--python-version', '3.11', '--only-binary=:all:', 'openpyxl'],
    { stdio: 'inherit' },
  );
  if (dl.status !== 0) console.warn('[server-bundle] wheels 下载失败（不影响主装配）');
  writeFileSync(join(outDir, 'requirements.txt'), ['openpyxl  # 当前引擎纯标准库；此文件为未来扩展预留', ''].join('\n'), 'utf8');
}

console.log(`[server-bundle] 装配完成 → ${outDir}`);
console.log(`[server-bundle]   ${serverPy.join(' / ')}（纯 stdlib）`);
console.log(`[server-bundle]   web/（${mbOf(join(distDir, 'index.html'))} MB 单文件 + 静态资源）`);
console.log(`[server-bundle]   data/：${inventory.offers} · 配置表 ${inventory.configTables} · 派生包 ${mbOf(join(dataDir, 'latest-pack.json'))} MB · 数据库 ${mbOf(join(dataDir, 'pricelens.db'))} MB`);
console.log('[server-bundle]   启动PriceLens.bat / 重建数据.bat / 使用说明.md / VERSION.txt / SHA256SUMS.txt');
console.log(`[server-bundle]   整包 ${totalMb.toFixed(1)} MB · 清单指纹 ${manifestHash}`);
console.log('[server-bundle] 拷整个文件夹到内部 Windows 机，双击 启动PriceLens.bat 即用。');
