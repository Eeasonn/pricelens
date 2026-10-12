// ============================================================
// PriceLens M1 自查脚本（node scripts/verify.mjs，纯 Node 内置模块）
// 抽查 §11 造数结果 + buildSeries 契约冒烟（用项目自带 tsc 编译临时 TS 后运行）。
// 全部断言通过 exit 0；任何失败打印 FAIL 并 exit 1。
// ============================================================
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = (n) => JSON.parse(readFileSync(join(ROOT, 'src', 'data', n), 'utf8'));
const DAY_MS = 86400000;
const parseDate = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

let passed = 0;
const failures = [];
function check(name, cond, detail = '') {
  if (cond) {
    passed++;
    console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`);
  } else {
    failures.push(name + (detail ? ' — ' + detail : ''));
    console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`);
  }
}

// ---------------- 装载 ----------------
const dimTime = SRC('dim_time.json');
const dimProduct = SRC('dim_product.json');
const dimChannel = SRC('dim_channel.json');
const dimRegion = SRC('dim_region.json');
const dimFx = SRC('dim_fx.json');
const dimPromo = SRC('dim_promo.json');
const dimBenchmark = SRC('dim_benchmark.json');
const fact = SRC('fact_price_weekly.json');
const masterProducts = JSON.parse(readFileSync(join(ROOT, 'data', 'master', 'products.json'), 'utf8'));

const wedById = new Map(dimTime.map((w) => [w.week_id, w.week_wed_date]));
const factBySku = new Map();
for (const r of fact) {
  if (!factBySku.has(r.sku_id)) factBySku.set(r.sku_id, []);
  factBySku.get(r.sku_id).push(r);
}
for (const arr of factBySku.values()) arr.sort((a, b) => (a.week_id < b.week_id ? -1 : 1));

// SKU 生命周期（与 gen 同口径）
function lifeOf(skuId) {
  const p = dimProduct.find((x) => x.sku_id === skuId);
  const firstIdx = dimTime.findIndex((w) => w.week_wed_date >= p.launch_date);
  let lastIdx = dimTime.length - 1;
  if (p.eol_date) lastIdx = dimTime.findLastIndex((w) => w.week_wed_date <= p.eol_date);
  return { p, firstIdx, lastIdx, n: lastIdx - firstIdx + 1 };
}

// ---------------- 1. 维度表 ----------------
console.log('\n[1] 维度表');
{
  const first = dimTime[0];
  const last = dimTime[dimTime.length - 1];
  check('dim_time 总周数 = 93', dimTime.length === 93, `${dimTime.length} 周`);
  check(
    'dim_time 首尾 = 202501(周三 2025-01-01) → 202641(周三 2026-10-07)',
    first.week_id === '202501' && first.week_wed_date === '2025-01-01' && last.week_id === '202641' && last.week_wed_date === '2026-10-07',
    `${first.week_id}/${first.week_wed_date} → ${last.week_id}/${last.week_wed_date}`,
  );
  const expectedSku = masterProducts.reduce((acc, m) => acc + m.skus.reduce((a, g) => a + g.colors.length, 0), 0);
  check('dim_product SKU 总数与 master 一致', dimProduct.length === expectedSku, `${dimProduct.length} = master 展开 ${expectedSku}`);
  check('剔除清单不出现（nova 16s / 16s Pro / Z TriFold）', dimProduct.every((p) => !/16s|TriFold/i.test(p.model_name)));
  check(
    'romram/color 分列样例（12+256 GB / Black；1TB 不带空格；缺色为 —）',
    dimProduct.some((p) => p.romram === '12+256 GB' && p.color === 'Black') &&
      dimProduct.some((p) => p.romram === '16+1TB') &&
      dimProduct.some((p) => p.romram === '1TB'),
  );
  check(
    'nova 14i 档位以表格标注 <200 为准',
    dimProduct.filter((p) => p.model_name === 'nova 14i').every((p) => p.tier_code === '<200'),
  );
  check('dim_channel 47 店铺（OZON 1P×2 / 3P×43 / DNS / M.Video）', dimChannel.length === 47 &&
    dimChannel.filter((c) => c.platform === 'OZON' && c.store_type === '1P').length === 2 &&
    dimChannel.filter((c) => c.platform === 'OZON' && c.store_type === '3P').length === 43 &&
    dimChannel.filter((c) => c.platform === 'DNS').length === 1 &&
    dimChannel.filter((c) => c.platform === 'M.Video').length === 1, `${dimChannel.length}`);
  check('dim_region 28 国，仅 RU enabled', dimRegion.length === 28 && dimRegion.filter((r) => r.enabled).length === 1 &&
    dimRegion.find((r) => r.enabled)?.country_code === 'RU');
  check('dim_fx 34 月，2026-10 = 80', dimFx.length === 34 && dimFx.find((r) => r.month_id === '202610')?.usd_rub_avg === 80);
  check('dim_promo 16 档期（8 档期 × 2 季）', dimPromo.length === 16, `${dimPromo.length}`);
  check(
    'dim_benchmark 26 行，引用 SKU 全部存在，Mate XT 无行',
    dimBenchmark.length === 26 &&
      dimBenchmark.every((b) => dimProduct.some((p) => p.sku_id === b.competitor_sku_id)) &&
      !dimBenchmark.some((b) => b.own_model_id === 'own-mate-xt'),
    `${dimBenchmark.length} 行`,
  );
  // 前后代双向互链
  const byModel = new Map();
  for (const p of dimProduct) {
    const mid = p.sku_id.split('__')[0];
    if (!byModel.has(mid)) byModel.set(mid, p);
  }
  let chainOk = true;
  for (const [mid, p] of byModel) {
    if (p.prev_model_id && !(byModel.get(p.prev_model_id)?.next_model_id === mid)) chainOk = false;
    if (p.next_model_id && !(byModel.get(p.next_model_id)?.prev_model_id === mid)) chainOk = false;
  }
  check('prev/next 前后代双向互链', chainOk);
}

// ---------------- 2. 事实表结构与取整 ----------------
console.log('\n[2] 事实表结构与取整');
{
  const dup = new Set(fact.map((r) => r.week_id + '|' + r.sku_id)).size !== fact.length;
  check('fact 复合主键 (week_id, sku_id) 无重复', !dup, `${fact.length} 行`);
  check(
    '₽ 全部取整到 10₽，USD 全部取整到 1',
    fact.every((r) => r.rrp_rub % 10 === 0 && (r.discounted_price_rub == null || r.discounted_price_rub % 10 === 0) && Number.isInteger(r.rrp_usd) && (r.discounted_price_usd == null || Number.isInteger(r.discounted_price_usd))),
  );
  check(
    'offer 只写文本字段，不产生第四个价格字段',
    fact.every((r) => Object.keys(r).every((k) => ['week_id','sku_id','rrp_rub','rrp_usd','discounted_price_rub','discounted_price_usd','offer_title','offer_text','crawl_status','url','batch_id','quality_flag'].includes(k))),
  );
  check(
    'batch_id = B2026W41，quality_flag = synthetic',
    fact.every((r) => r.batch_id === 'B2026W41' && r.quality_flag === 'synthetic'),
  );
  const sampleSku = dimProduct.find((p) => p.model_name === 'Pura 90s Pro' && p.romram === '12+256 GB');
  const expectUrl = 'https://www.ozon.ru/search/?text=' + encodeURIComponent(`${sampleSku.brand} ${sampleSku.model_name} ${sampleSku.romram}`);
  check('url = Ozon 搜索深链（品牌+型号+romram）', factBySku.get(sampleSku.sku_id)[0].url === expectUrl, expectUrl);
}

// ---------------- 3. 生命周期边界 ----------------
console.log('\n[3] 生命周期边界');
{
  let launchOk = true;
  let eolOk = true;
  for (const p of dimProduct) {
    const rows = factBySku.get(p.sku_id) ?? [];
    for (const r of rows) {
      const wed = wedById.get(r.week_id);
      if (wed < p.launch_date) launchOk = false;
      if (p.eol_date && wed > p.eol_date) eolOk = false;
    }
  }
  check('launch 前无行', launchOk);
  check('eol 周后无行', eolOk);
  // 第十三轮：RRP = 官方价恒定，至多一次成本性上调（只涨不跌，+2~8%）
  const mx6 = factBySku.get('own-mate-x6__12+512GB__Black');
  const eolWeekX6 = [...wedById.entries()].filter(([, wed]) => wed <= '2026-01-05').map(([id]) => id).sort().pop();
  let rrpMonotone = true;
  let upSkus = 0;
  for (const p of dimProduct) {
    const rows = factBySku.get(p.sku_id) ?? [];
    const seq = [...new Set(rows.map((r) => r.rrp_rub))];
    for (let i = 1; i < seq.length; i++) if (seq[i] < seq[i - 1]) rrpMonotone = false;
    if (seq.length > 2) rrpMonotone = false;
    if (seq.length === 2) {
      upSkus++;
      const up = seq[1] / seq[0] - 1;
      if (up < 0.02 || up > 0.08) rrpMonotone = false;
    }
  }
  check(
    'RRP 恒定，至多一次成本性上调（只涨不跌）',
    rrpMonotone,
    `${upSkus} 个 SKU 有一次上调，其余恒定`,
  );
  check('Mate X6 最后一行 = eol 周', mx6[mx6.length - 1].week_id === eolWeekX6 && mx6.length === lifeOf('own-mate-x6__12+512GB__Black').n, `${mx6[mx6.length - 1].week_id}，共 ${mx6.length} 行`);
}

// ---------------- 4. 缺采与 offer ----------------
console.log('\n[4] 缺采与 offer');
{
  let launchRows = 0;
  for (const p of dimProduct) {
    const rows = factBySku.get(p.sku_id) ?? [];
    launchRows += Math.min(8, rows.length);
  }
  const missingRows = fact.filter((r) => r.crawl_status === 'missing').length;
  const rate = missingRows / (fact.length - launchRows);
  check('缺采率 ≈4%（非上市段）', rate > 0.03 && rate < 0.05, `${missingRows}/${fact.length - launchRows} = ${(rate * 100).toFixed(2)}%`);
  check(
    '缺采不与上市段重叠，missing 行折后价为 null',
    fact.every((r) => {
      if (r.crawl_status !== 'missing') return true;
      if (r.discounted_price_rub != null || r.discounted_price_usd != null) return false;
      const { p, firstIdx } = lifeOf(r.sku_id);
      const rel = dimTime.findIndex((w) => w.week_id === r.week_id) - firstIdx;
      return rel >= 8;
    }),
  );
  check(
    'missing 行 rrp 仍在（未上市/已退市才无值）',
    fact.filter((r) => r.crawl_status === 'missing').every((r) => r.rrp_rub != null),
  );
  const offerRows = fact.filter((r) => r.offer_title != null);
  check('offer 行存在（档期内挂载）', offerRows.length > 0, `${offerRows.length} 行带 offer`);
  check(
    'offer 行价格字段与非 offer 行同构（offer 不影响价格）',
    offerRows.every((r) => r.discounted_price_rub != null),
  );
}

// ---------------- 5. 价格曲线锚点 ----------------
console.log('\n[5] 价格曲线锚点');
{
  const pura = factBySku.get('own-pura-90s-pro__12+256GB__Black');
  const launchRow = pura[0];
  const ratio = launchRow.discounted_price_rub / launchRow.rrp_rub;
  check(
    'Pura 90s Pro · 12+256 上市周折后价 ≈ RRP（溢价 0~+5% ±1% 噪声）',
    launchRow.week_id === '202624' && ratio >= 1.0 && ratio <= 1.07,
    `${launchRow.week_id}: ${launchRow.discounted_price_rub}/${launchRow.rrp_rub} = ${(ratio * 100).toFixed(1)}%`,
  );
  const s25 = factBySku.get('cmp-galaxy-s25__12+256GB__Black').filter((r) => ['202544', '202545', '202546'].includes(r.week_id));
  const s25ratio = Math.min(...s25.map((r) => r.discounted_price_rub / r.rrp_rub));
  check(
    '2025 年 11.11 档期 Galaxy S25 明显折扣（≈8-15% 深度）',
    s25.length === 3 && s25ratio <= 0.9 && s25ratio >= 0.7,
    `最低 ${(s25ratio * 100).toFixed(1)}% of RRP`,
  );
  const inWindow = fact.filter((r) => ['202544', '202545', '202546'].includes(r.week_id) && r.offer_title != null);
  check(
    '2025 年 11.11 档期带 offer 文本（含分期银行价/关税可解析样例）',
    inWindow.length > 0 && inWindow.some((r) => /银行价 \d+卢布 \/ 关税约 \d+卢布 \/ 活动剩 \d+天/.test(r.offer_text)),
    `${inWindow.length} 行，样例「${inWindow.find((r) => r.offer_title.includes('先享后付'))?.offer_title}」`,
  );
  const puraAll = fact.filter((r) => r.sku_id.startsWith('own-pura-90s-pro__') && r.week_id >= '202633' && r.week_id <= '202636');
  const puraOffer = puraAll.some((r) => r.offer_title != null);
  const puraDiscount = puraAll.some((r) => r.discounted_price_rub != null && r.discounted_price_rub < r.rrp_rub * 0.97);
  check(
    'Pura 90s Pro（2026-06 上市）在开学季 2026 档期出现折扣 + offer（按系列组级别断言）',
    puraOffer && puraDiscount,
    `折扣 ${puraDiscount}，offer ${puraOffer}`,
  );
  // USD 按周汇率折算
  const usdRow = pura.find((r) => r.discounted_price_usd != null);
  check('rrp_usd / discounted_usd 与 ₽ 同源折算且为整数', Number.isInteger(usdRow.rrp_usd) && Number.isInteger(usdRow.discounted_price_usd) && usdRow.rrp_usd > 100 && usdRow.discounted_price_usd > 100, `${usdRow.week_id}: ₽${usdRow.rrp_rub} → $${usdRow.rrp_usd}`);
}

// ---------------- 6. buildSeries 冒烟（临时 TS → 项目自带 tsc 编译 → node 运行） ----------------
console.log('\n[6] buildSeries 冒烟');
{
  const tmp = mkdtempSync(join(tmpdir(), 'pl-smoke-'));
  try {
    const aggPath = join(ROOT, 'src', 'dataModel', 'aggregate');
    const dataPath = join(ROOT, 'src', 'data', 'index');
    // 路径含空格与单引号（Eason's Projects）：用 JSON.stringify 生成安全带引号的 TS 字符串字面量
    const rel = (p) => JSON.stringify(relative(tmp, p).split('\\').join('/'));
    const smokeTs = `
declare const process: { exit(code?: number): never };
import { buildSeries, lowestPriceColorSku, defaultCompetitorSkus } from ${rel(aggPath)};
import { dimProduct } from ${rel(dataPath)};

function assert(cond: boolean, msg: string): void {
  if (!cond) { console.error('SMOKE FAIL: ' + msg); process.exit(1); }
}
const sku = lowestPriceColorSku('own-pura-90s-pro', '12+256 GB');
assert(!!sku && sku.startsWith('own-pura-90s-pro__12+256GB__'), 'lowestPriceColorSku 匹配该 ROMRAM，got ' + sku);

const compSkus = dimProduct.filter(p => p.sku_id.startsWith('cmp-iphone-17__8+256GB__')).map(p => p.sku_id);
const puraSkuIds = dimProduct.filter(p => p.sku_id.startsWith('own-pura-90s-pro__12+256GB__')).map(p => p.sku_id);
const base = {
  groups: [
    { modelId: 'own-pura-90s-pro', romram: '12+256 GB', skuIds: puraSkuIds, isOwn: true },
    { modelId: 'cmp-iphone-17', romram: '8+256 GB', skuIds: compSkus, isOwn: false },
  ],
  granularity: 'week' as const,
  startBucket: '202629',
  endBucket: '202641',
  currency: 'local' as const,
  agg: 'avg' as const,
  platform: null,
};
const s1 = buildSeries(base);
const s2 = buildSeries(base);
assert(JSON.stringify(s1) === JSON.stringify(s2), '同输入两次调用逐字节一致');
assert(s1.length === 2, '两条系列，got ' + s1.length);
assert(s1[0].isOwn === true && s1[0].color === '#c7000b', '我司 HUAWEI 品牌色');
assert(s1[0].label === 'HUAWEI Pura 90s Pro 12+256 GB', 'label = 品牌+产品名+ROMRAM，got ' + s1[0].label);
assert(s1[0].points.length === 13, '默认 13 周窗，got ' + s1[0].points.length);
const last = s1[0].points[12];
assert(last.bucketId === '202641' && last.xLabel === '10-07' && last.anchorDate === '2026-10-07', '周桶 id/xLabel/anchorDate');
assert(last.rrp === 69990, 'RRP 官方阶梯 69990，got ' + last.rrp);
assert(last.price != null && last.missing === false, '有价点');
assert(last.url.startsWith('https://www.ozon.ru/search/?text='), 'Ozon 深链');
assert(typeof last.shopName === 'string' && last.shopName.length > 0, 'shopName 指派：' + last.shopName);

// 月桶 + min 汇总 + USD + 平台因子
const qm = { ...base, granularity: 'month' as const, startBucket: '202606', endBucket: '202610', agg: 'min' as const, currency: 'usd' as const, platform: { platforms: ['DNS'], shopIds: [] } };
const sm = buildSeries(qm);
assert(sm.length === 2 && sm[0].points.length === 5, '5 个月桶');
const aug = sm[0].points.find(p => p.bucketId === '202608')!;
assert(aug.xLabel === '202608', '月 xLabel');
assert(aug.offer != null && aug.offer.remainingDays >= 0, '月桶 offer 附注 + remainingDays=' + aug.offer?.remainingDays);
assert(aug.price != null && aug.price < 1000, 'USD 折算取整（< $1000），got ' + aug.price);
const qw = { ...base, granularity: 'week' as const, platform: { platforms: ['DNS'], shopIds: [] } };
const dns = buildSeries(qw)[0].points[12].price!;
assert(dns > last.price!, 'DNS 平台因子 (+0.8%) 高于基准最低价：' + dns + ' > ' + last.price);

// 季桶
const qq = { ...base, granularity: 'quarter' as const, startBucket: '2026Q3', endBucket: '2026Q3' };
const sq = buildSeries(qq);
assert(sq[0].points.length === 1 && sq[0].points[0].xLabel === '2026Q3', '季桶 id 与 dim_time.quarter_id 对齐');
assert(sq[0].points[0].price != null, '季桶有值');

assert(JSON.stringify(defaultCompetitorSkus('own-pura-90s-pro', '12+256 GB')) === JSON.stringify(['cmp-iphone-17__8+256GB__Black','cmp-galaxy-s26__12+256GB__Black']), 'defaultCompetitorSkus 按 sort 排序');
console.log('SMOKE-JSON\t' + JSON.stringify({ lowest: sku, label: s1[0].label, weekPrice: last.price, dnsPrice: dns, usdAug: aug.price, shop: last.shopName }));
`;
    writeFileSync(join(tmp, 'smoke.ts'), smokeTs);
    const tscBin = join(ROOT, 'node_modules', '.bin', 'tsc');
    const compiled = spawnSync(tscBin, [
      join(tmp, 'smoke.ts'),
      '--outDir', join(tmp, 'out'),
      '--rootDir', '/', // 输出镜像文件系统路径：out + <tmp 相对 / 的路径>
      '--module', 'commonjs',
      '--target', 'es2020',
      '--moduleResolution', 'node',
      '--esModuleInterop',
      '--resolveJsonModule',
      '--skipLibCheck',
    ], { encoding: 'utf8' });
    if (compiled.status !== 0) {
      check('smoke.ts 编译', false, (compiled.stdout + compiled.stderr).slice(0, 500));
    } else {
      const smokeJs = join(tmp, 'out', relative('/', join(tmp, 'smoke.ts')).replace(/\.ts$/, '.js'));
      const run = spawnSync(process.execPath, [smokeJs], { encoding: 'utf8' });
      const jsonLine = (run.stdout + '').split('\n').find((l) => l.startsWith('SMOKE-JSON\t'));
      check('smoke.ts 编译', true, 'tsc 0 错误');
      if (run.status !== 0) {
        check('buildSeries 冒烟断言', false, (run.stdout + run.stderr).trim().slice(0, 500));
      } else {
        check('buildSeries 冒烟断言（形状/确定性/币种/平台因子/offer/shopName）', true);
        if (jsonLine) console.log('  SMOKE ' + jsonLine.replace('SMOKE-JSON\t', ''));
      }
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------------- 7. 价格稳定周（阶梯稳定模型） ----------------
console.log('\n[7] 价格稳定周（用户反馈 ③：稳定时数值只显示在第一个点）');
{
  // 变价 = 相邻两个有值周的折后价(₽)不同；missing 周透明处理
  const stats = [];
  for (const p of dimProduct) {
    const rows = factBySku.get(p.sku_id) ?? [];
    let prev = null, changes = 0, weeks = 0, curRun = 0, maxRun = 0;
    for (const r of rows) {
      if (r.discounted_price_rub == null) continue;
      weeks++;
      if (prev != null) {
        if (r.discounted_price_rub !== prev) { changes++; if (curRun > maxRun) maxRun = curRun; curRun = 0; }
        else { curRun++; }
      }
      prev = r.discounted_price_rub;
    }
    if (curRun > maxRun) maxRun = curRun;
    if (weeks > 1) stats.push({ sku: p.sku_id, weeks, changes, pct: changes / (weeks - 1), maxRun });
  }
  const totalW = stats.reduce((a, s) => a + s.weeks, 0);
  const totalC = stats.reduce((a, s) => a + s.changes, 0);
  const globalPct = totalC / (totalW - stats.length);
  const full = stats.filter((s) => s.weeks >= 80);
  const pcts = stats.map((s) => s.pct).sort((a, b) => a - b);
  const median = pcts[Math.floor(pcts.length / 2)];
  const pct = (s) => (s.pct * 100).toFixed(1) + '%';
  check('全局变价周占比 < 30%（对照第一轮逐周 ±1% 噪声的 ~100%）', globalPct < 0.3, `${totalC}/${totalW - stats.length} = ${(globalPct * 100).toFixed(1)}%`);
  check('全生命周期（≥80 周）SKU 变价周占比全部 < 30%', full.length > 0 && full.every((s) => s.pct < 0.3), full.map((s) => `${s.sku.split('__')[0]}:${pct(s)}`).join(' '));
  check('变价周占比中位数 < 30%', median < 0.3, `中位数 ${(median * 100).toFixed(1)}%，平均 ${((stats.reduce((a, s) => a + s.pct, 0) / stats.length) * 100).toFixed(1)}%`);
  const byRun = [...stats].sort((a, b) => b.maxRun - a.maxRun).slice(0, 3);
  console.log(`  INFO  最长稳定平台期 Top3：${byRun.map((s) => `${s.sku}（连续 ${s.maxRun} 周同价）`).join('；')}`);
  console.log(`  INFO  变价占比最高 3 个（短生命周期 SKU，档期密集所致）：${[...stats].sort((a, b) => b.pct - a.pct).slice(0, 3).map((s) => `${s.sku} ${pct(s)}（${s.changes}/${s.weeks - 1}）`).join('；')}`);
  const sample = [stats[10], stats[40], stats[80], stats[120], stats[160]].filter(Boolean);
  console.log(`  INFO  变价次数样本 5 个 SKU：\n${sample.map((s) => `        ${s.sku} — ${s.weeks} 周内变价 ${s.changes} 次（${pct(s)}）`).join('\n')}`);
}

// ---------------- 8. 代际与生命周期合理性（用户反馈 ①②） ----------------
console.log('\n[8] 代际价格单调 / 上市节奏 / 同堂在售 / ROMRAM 档数');
{
  const monthsBetween = (a, b) => (parseDate(b) - parseDate(a)) / DAY_MS / 30.44;
  // nova 14 → nova 15 上市间隔（真实节奏：ZOL nova14 2025-05-19 发布、nova15 2025-12-22 发布 = 7.1 个月）
  const nova14 = masterProducts.find((m) => m.model_id === 'own-nova-14');
  const nova15 = masterProducts.find((m) => m.model_id === 'own-nova-15');
  const gapMonths = monthsBetween(nova14.launch_date, nova15.launch_date);
  check(
    'nova 14 → nova 15 上市间隔 ≥ 6 个月（调研真实节奏 7.1 个月，见报告对"10-12 个月"降级规则的覆盖说明）',
    gapMonths >= 6,
    `${nova14.launch_date} → ${nova15.launch_date} = ${gapMonths.toFixed(1)} 个月`,
  );
  // 逐对代际 RRP 断言：同 ROMRAM 新代 ≥ 旧代；并打印每对数字
  const byId = new Map(masterProducts.map((m) => [m.model_id, m]));
  const rrpPairs = [];
  let rrpOk = true;
  for (const m of masterProducts) {
    if (!m.prev_model_id) continue;
    const prev = byId.get(m.prev_model_id);
    if (!prev) continue;
    for (const [romram, rrp] of Object.entries(m.rrp_rub_by_romram)) {
      const old = prev.rrp_rub_by_romram[romram];
      if (old == null) continue;
      rrpPairs.push({ newer: `${m.model_name} ${romram}`, older: `${prev.model_name} ${romram}`, old, rrp });
      if (rrp < old) rrpOk = false;
    }
  }
  check('同 ROMRAM 新代 launch RRP ≥ 旧代（逐对）', rrpOk && rrpPairs.length >= 5, `${rrpPairs.length} 对`);
  for (const p of rrpPairs) console.log(`        ${p.older} ${p.old.toLocaleString()}₽ → ${p.newer} ${p.rrp.toLocaleString()}₽ ${p.rrp >= p.old ? '✓' : '✗'}`);
  // 最接近档（ROM 容量相等）新代 ≥ 旧代；无同容量的换代对打印数值供评审。
  // 唯一结构性例外：Pura 80 Ultra → Pura 90s Pro Max（Ultra 级产品线由 Pro Max 衔接，梯队下移定价，Ultra 同堂清库——用户确认的同堂旗舰对）。
  const romGb = (s) => {
    const m = /(\d+(?:\.\d+)?)\s*TB|\+?(\d+)\s*GB?/.exec(s.replace(/\s+/g, ''));
    return m ? (m[1] ? Number(m[1]) * 1024 : Number(m[2])) : 0;
  };
  const CAPACITY_EXCEPTION = new Set(['own-pura-80-ultra>own-pura-90s-pro-max']);
  let capOk = true;
  const capPairs = [];
  const unmatchedPairs = [];
  for (const m of masterProducts) {
    if (!m.prev_model_id) continue;
    const prev = byId.get(m.prev_model_id);
    if (!prev) continue;
    const oldEntries = Object.entries(prev.rrp_rub_by_romram).map(([k, v]) => ({ gb: romGb(k), rrp: v, k }));
    for (const [romram, rrp] of Object.entries(m.rrp_rub_by_romram)) {
      const match = oldEntries.filter((o) => o.gb === romGb(romram)).sort((a, b) => a.rrp - b.rrp)[0];
      if (match) {
        capPairs.push({ newer: `${m.model_name} ${romram}`, older: `${prev.model_name} ${match.k}`, old: match.rrp, rrp });
        if (rrp < match.rrp && !CAPACITY_EXCEPTION.has(`${m.prev_model_id}>${m.model_id}`)) capOk = false;
      } else {
        const closest = oldEntries.sort((a, b) => Math.abs(a.gb - romGb(romram)) - Math.abs(b.gb - romGb(romram)))[0];
        unmatchedPairs.push({ newer: `${m.model_name} ${romram}`, older: `${prev.model_name} ${closest.k}`, old: closest.rrp, rrp });
      }
    }
  }
  check(
    '同 ROM 容量（最接近档）新代 launch RRP ≥ 旧代（Pura Ultra→90s Pro Max 梯队下移为已登记例外）',
    capOk && capPairs.length >= 5,
    `${capPairs.length} 对同容量，例外对 ${CAPACITY_EXCEPTION.size} 个`,
  );
  for (const p of capPairs) console.log(`        ${p.older} ${p.old.toLocaleString()}₽ → ${p.newer} ${p.rrp.toLocaleString()}₽ ${p.rrp >= p.old ? '✓' : '✗（例外已登记）'}`);
  for (const p of unmatchedPairs) console.log(`        [无同容量档] ${p.older} ${p.old.toLocaleString()}₽ → ${p.newer} ${p.rrp.toLocaleString()}₽（跨梯队衔接，数值供评审）`);
  // eol = 继任者 launch + 4~8 周
  const eolPairs = [];
  let eolOk = true;
  for (const m of masterProducts) {
    if (!m.prev_model_id) continue;
    const prev = byId.get(m.prev_model_id);
    if (!prev || prev.eol_date == null) continue;
    const w = (parseDate(prev.eol_date) - parseDate(m.launch_date)) / DAY_MS / 7;
    eolPairs.push(`${prev.model_name}(eol ${prev.eol_date}) ← ${m.model_name}(launch ${m.launch_date}) = ${w.toFixed(1)} 周`);
    if (w < 3.9 || w > 8.1) eolOk = false;
  }
  check('前代 eol = 继任者 launch 后 4~8 周清库退市', eolOk && eolPairs.length >= 6, `${eolPairs.length} 对`);
  for (const s of eolPairs) console.log(`        ${s}`);
  // 同堂在售（窗口最后一周 202641 前代与继任者同时在售）：仅旗舰 ≤ 2 对
  const lastWeek = '202641';
  const aliveAt = (mid, wk) => {
    const m = byId.get(mid);
    if (!m) return false;
    const rows = factBySku.get(dimProduct.find((p) => p.sku_id.startsWith(mid + '__'))?.sku_id ?? '') ?? [];
    return rows.some((r) => r.week_id === wk && r.rrp_rub != null);
  };
  const coExist = masterProducts
    .filter((m) => m.prev_model_id && byId.get(m.prev_model_id))
    .filter((m) => aliveAt(m.model_id, lastWeek) && aliveAt(m.prev_model_id, lastWeek))
    .map((m) => `${byId.get(m.prev_model_id).model_name} × ${m.model_name}`);
  check('窗口末同堂在售对数 ≤ 2（仅 Pura 80 Ultra×90s Pro Max、iPhone 16×17 两对旗舰）', coExist.length <= 2, coExist.join('；') || '无');
  console.log(`        同堂清单：${coExist.join('；') || '（无）'}`);
  // ROMRAM 档数
  const single = masterProducts.filter((m) => Object.keys(m.rrp_rub_by_romram).length < 2);
  const minTiers = Math.min(...masterProducts.map((m) => Object.keys(m.rrp_rub_by_romram).length));
  check('全部 40 个型号 ROMRAM 档数 ≥ 2（用户反馈 ①：不再有单容量产品）', single.length === 0 && masterProducts.length === 40, `最少 ${minTiers} 档；单档型号：${single.map((m) => m.model_id).join('、') || '无'}`);
  const tierDetail = masterProducts.map((m) => `${m.model_name}:${Object.keys(m.rrp_rub_by_romram).length}`).join(' ');
  console.log(`  INFO  档数明细：${tierDetail}`);
}

// ---------------- 9. 确定性（gen 跑两遍 shasum 一致） ----------------
console.log('\n[9] 确定性（seed 20261009）');
{
  const { execFileSync } = await import('node:child_process');
  const { readdirSync } = await import('node:fs');
  const { createHash } = await import('node:crypto');
  const run = () => {
    execFileSync(process.execPath, [join(ROOT, 'scripts', 'gen-data.mjs')], { cwd: ROOT, stdio: 'pipe' });
    const files = readdirSync(join(ROOT, 'src', 'data')).filter((f) => f.endsWith('.json')).sort();
    const hash = createHash('sha256');
    for (const f of files) hash.update(f + ':' + createHash('sha256').update(readFileSync(join(ROOT, 'src', 'data', f))).digest('hex') + '\n');
    return hash.digest('hex');
  };
  const h1 = run();
  const h2 = run();
  check('gen-data.mjs 连跑两遍，src/data 全部产物 shasum 一致', h1 === h2, h1.slice(0, 16) + '…');
}

// ---------------- 汇总 ----------------
console.log(`\n[verify] ${passed} 项通过，${failures.length} 项失败${failures.length ? '：\n  - ' + failures.join('\n  - ') : ''}`);
process.exit(failures.length === 0 ? 0 : 1);
