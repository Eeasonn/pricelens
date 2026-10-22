// ============================================================
// PriceLens 自查脚本（node scripts/verify.mjs，纯 Node 内置模块）—— 真实数据版（2026-10-20）
// [1] 维表完整性（ingest_real.py 产物）→ [2] 事实列式包外键/唯一性/汇率一致性/覆盖锚
// → [3] buildSeries 契约冒烟（用项目自带 tsc 编译临时 TS 后运行）→ [4] 单文件版一致性
// 全部断言通过 exit 0；任何失败打印 FAIL 并 exit 1。
// ============================================================
import { readFileSync, mkdtempSync, writeFileSync, rmSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = (n) => JSON.parse(readFileSync(join(ROOT, 'src', 'data', n), 'utf8'));

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
const dimTier = SRC('dim_tier.json');
const dimDefaultChannel = SRC('dim_default_channel.json');
const packB64 = readFileSync(join(ROOT, 'src', 'data', 'fact_pack_gzip.b64.txt'), 'utf8').trim();
const pack = JSON.parse(gunzipSync(Buffer.from(packB64, 'base64')).toString('utf8'));

const INDUSTRIES = ['phone', 'tablet', 'wearable', 'audio', 'iot', 'pc'];
const productById = new Map(dimProduct.map((p) => [p.sku_id, p]));
const channelById = new Map(dimChannel.map((c) => [c.channel_id, c]));
const regionByCc = new Map(dimRegion.map((r) => [r.country_code, r]));
const weekIds = new Set(dimTime.map((w) => w.week_id));

// ---------------- 1. 维表 ----------------
console.log('\n[1] 维表完整性');
{
  const first = dimTime[0];
  const last = dimTime[dimTime.length - 1];
  let continuous = true;
  for (let i = 1; i < dimTime.length; i++) {
    const a = Date.parse(dimTime[i - 1].week_wed_date);
    const b = Date.parse(dimTime[i].week_wed_date);
    if (b - a !== 7 * 86400000) continuous = false;
  }
  const allWed = dimTime.every((w) => new Date(w.week_wed_date + 'T00:00:00Z').getUTCDay() === 3);
  check('dim_time 连续周（相邻周三间隔 7 天）且全部为周三', continuous && allWed, `${dimTime.length} 周 ${first.week_id}(${first.week_wed_date}) → ${last.week_id}(${last.week_wed_date})`);
  check('dim_time 周数 = 24（2026-05-06 → 2026-10-14）', dimTime.length === 24 && first.week_id === '202619' && last.week_id === '202642');

  const enabled = dimRegion.filter((r) => r.enabled);
  check('dim_region 启用国家 ≥ 20 且均带本币与默认电渠', enabled.length >= 20 && enabled.every((r) => r.currency && r.default_platform), `${enabled.length} 国`);
  const badDefault = enabled.filter((r) => !dimChannel.some((c) => c.country_code === r.country_code && c.platform === r.default_platform));
  check('每个启用国家的默认电渠在 dim_channel 中存在', badDefault.length === 0, badDefault.map((r) => r.country_code).join(',') || '全部命中');
  const ru = regionByCc.get('RU');
  check('R国默认电渠 = DNS（国家主要电渠）、本币 RUB', ru && ru.default_platform === 'DNS' && ru.currency === 'RUB');
  const badOwnDefault = [];
  for (const r of enabled) {
    for (const [ind, mid] of Object.entries(r.default_own_models)) {
      if (!dimProduct.some((p) => p.model_id === mid && p.industry === ind && p.countries.includes(r.country_code))) badOwnDefault.push(`${r.country_code}:${ind}`);
    }
  }
  check('dim_region.default_own_models 均指向该国该产业有数据的我司型号', badOwnDefault.length === 0, badOwnDefault.join(',') || `${enabled.reduce((a, r) => a + Object.keys(r.default_own_models).length, 0)} 项`);

  const ids = new Set(dimProduct.map((p) => p.sku_id));
  check('dim_product sku_id 唯一', ids.size === dimProduct.length, `${dimProduct.length} SKU`);
  const badModel = dimProduct.filter((p) => p.sku_id.split('__')[0] !== p.model_id);
  check('model_id = sku_id 的 `__` 前缀段', badModel.length === 0);
  const badOwn = dimProduct.filter((p) => p.is_own !== (p.brand === 'HUAWEI') || p.sku_id.startsWith(p.is_own ? 'cmp-' : 'own-'));
  check('is_own ⇔ 品牌 HUAWEI ⇔ sku 前缀 own-', badOwn.length === 0);
  const badInd = dimProduct.filter((p) => !INDUSTRIES.includes(p.industry));
  check('industry 取值合法', badInd.length === 0);
  const badTier = dimProduct.filter((p) => !(dimTier.ladders[p.industry] || []).includes(p.tier_code));
  check('tier_code 落在本产业阶梯内', badTier.length === 0, badTier.slice(0, 3).map((p) => `${p.sku_id}:${p.tier_code}`).join(' ') || '全部命中');
  const badTierCc = dimProduct.filter((p) => !p.tier_by_country || Object.values(p.tier_by_country).some((t) => !(dimTier.ladders[p.industry] || []).includes(t)) || !p.countries.every((cc) => p.tier_by_country[cc]));
  check('tier_by_country 覆盖该 SKU 全部国家且代码合法（型号级映射，键可多于本 SKU 国家）', badTierCc.length === 0, badTierCc.slice(0, 3).map((p) => p.sku_id).join(' ') || '全部命中');
  const ruPura = dimProduct.find((p) => p.model_id === 'own-huawei-pura-90s-pro-max');
  check('R国 Pura 90s Pro Max 分国档位 = 矩阵声明 800-1000', ruPura?.tier_by_country?.RU === '800-1000', ruPura?.tier_by_country?.RU);
  const unitDup = new Map();
  for (const p of dimProduct) { const k = p.model_id + '|' + p.romram; const set = unitDup.get(k) ?? new Set(); set.add(p.sku_id.split('__')[1]); unitDup.set(k, set); }
  check('同配置显示文案只对应一个配置键（1T/1TB 单位已归一）', [...unitDup.values()].every((s) => s.size === 1));
  check('颜色列不含单位词（GB/TB）', dimProduct.every((p) => !/^(gb|tb)$/i.test(p.color)));
  const autoBench = dimBenchmark.filter((b) => b.source === 'auto');
  check('自动匹配对标 ≥ 1000 条且全部竞品在该国有数据', autoBench.length >= 1000 && autoBench.every((b) => productById.get(b.competitor_sku_id)?.countries.includes(b.country_code)), `${autoBench.length} 条`);
  const modelTier = new Map();
  let tierMixed = 0;
  for (const p of dimProduct) {
    const t = modelTier.get(p.model_id);
    if (t == null) modelTier.set(p.model_id, p.tier_code);
    else if (t !== p.tier_code) tierMixed++;
  }
  check('同型号各 SKU 档位一致（型号级档位）', tierMixed === 0);
  const noCountry = dimProduct.filter((p) => !p.countries.length);
  check('每个 SKU 至少在一个国家有数据', noCountry.length === 0);
  const ownPhones = dimProduct.filter((p) => p.is_own && p.industry === 'phone');
  check('我司手机 SKU 含 Pura 90s Pro Max / Mate X7 / nova 16s', ['pura 90s pro max', 'mate x7', 'nova 16s'].every((n) => ownPhones.some((p) => p.model_name.toLowerCase() === n)), `${new Set(ownPhones.map((p) => p.model_name)).size} 个型号`);

  const chIds = new Set(dimChannel.map((c) => c.channel_id));
  check('dim_channel channel_id 唯一且前缀 = 国家码', chIds.size === dimChannel.length && dimChannel.every((c) => c.channel_id.startsWith(c.country_code + ':')), `${dimChannel.length} 渠道`);
  check('dim_channel 店铺类型 ∈ {1P,3P,独立站}', dimChannel.every((c) => ['1P', '3P', '独立站'].includes(c.store_type)));

  // 默认平台店铺预填（prefill_default_shops.py 产物；应用侧 defaultChannelOf 回退链第 2 级）
  const prefillEntries = Object.entries(dimDefaultChannel).filter(([cc]) => !cc.startsWith('_'));
  const prefillBad = prefillEntries.filter(([cc, cid]) => {
    const region = regionByCc.get(cc);
    return (
      !region
      || !region.enabled
      || typeof cid !== 'string'
      || !dimChannel.some((c) => c.country_code === cc && c.channel_id === cid && c.platform === region.default_platform)
    );
  });
  check('dim_default_channel 预填：每启用国 1 条，渠道属该国且平台 = 默认平台（事实包重接后漂移报警）', prefillBad.length === 0 && prefillEntries.length === enabled.length, `${prefillEntries.length}/${enabled.length} 国${prefillBad.length ? '；坏条目 ' + prefillBad.map(([cc]) => cc).join(',') : ''}`);
  check('dim_default_channel 预填 R国 = DNS 独立站（与应用侧默认取价锚一致）', dimDefaultChannel.RU === 'RU:dns:独立站', dimDefaultChannel.RU);

  check('dim_fx per_usd 全部 > 0', dimFx.every((f) => f.per_usd > 0), `${dimFx.length} 条`);
  const missFx = enabled.filter((r) => !dimFx.some((f) => f.currency === r.currency));
  check('每个启用国家的本币都有汇率记录', missFx.length === 0, missFx.map((r) => r.currency).join(',') || '全部命中');
  const rub = dimFx.filter((f) => f.currency === 'RUB');
  check('RUB 汇率在 70–90 区间（源表行内汇率中位数）', rub.length > 0 && rub.every((f) => f.per_usd > 70 && f.per_usd < 90), rub.map((f) => `${f.month_id}:${f.per_usd}`).join(' '));

  check('dim_promo 起止日期合法且国家在维表内', dimPromo.every((p) => p.start_date <= p.end_date && regionByCc.has(p.country_code) && ['浅', '中', '深'].includes(p.depth_hint)), `${dimPromo.length} 条 / ${new Set(dimPromo.map((p) => p.country_code)).size} 国`);
  const ruPromo = dimPromo.filter((p) => p.country_code === 'RU');
  check('R国大促 ≥ 4 条（情人节/返校季/新年季）', ruPromo.length >= 4, ruPromo.map((p) => p.promo_name).join('、'));

  const badBench = dimBenchmark.filter((b) => {
    const comp = productById.get(b.competitor_sku_id);
    return !comp || !comp.countries.includes(b.country_code) || !dimProduct.some((p) => p.model_id === b.own_model_id && p.countries.includes(b.country_code)) || b.sort < 1;
  });
  check('dim_benchmark 竞品 SKU 与我司型号均在该国有数据、sort ≥ 1', badBench.length === 0, `${dimBenchmark.length} 条 / ${new Set(dimBenchmark.map((b) => b.country_code)).size} 国`);
  check('dim_benchmark source ∈ {matrix,substitute,manual,auto}', dimBenchmark.every((b) => ['matrix', 'substitute', 'manual', 'auto'].includes(b.source)));
  const ruBench = dimBenchmark.filter((b) => b.country_code === 'RU' && b.own_model_id === 'own-huawei-pura-90s-pro-max');
  check('R国 Pura 90s Pro Max 对标 = iPhone 17 Pro + S26 Ultra 同 ROM 配对（共 4 条）', ruBench.length === 4 && ruBench.every((b) => productById.get(b.competitor_sku_id).romram === b.own_romram), ruBench.map((b) => `${b.own_romram}←${productById.get(b.competitor_sku_id).model_name}`).join('；'));
}

// ---------------- 2. 事实包 ----------------
console.log('\n[2] 事实列式包');
{
  const { weeks, skus, channels, dict, cols } = pack;
  const n = cols.w.length;
  check('事实行 ≥ 80,000', n >= 80000, `${n.toLocaleString()} 行`);
  const sameLen = Object.values(cols).every((arr) => arr.length === n);
  check('列式包各列等长', sameLen);
  check('周索引全部落在 dim_time', weeks.every((w) => weekIds.has(w)) && weeks.length === dimTime.length);
  // 「都在维表 + 长度相等」≠ 一一对应：包内重复索引会全部通过，
  // 而 prefill_default_shops 的 channels.index(cid) 等隐含依赖索引唯一
  check('SKU 索引唯一（与 dim_product 一一对应）', new Set(skus).size === skus.length && skus.every((s) => productById.has(s)) && skus.length === dimProduct.length);
  check('渠道索引唯一且全部存在于 dim_channel', new Set(channels).size === channels.length && channels.every((c) => channelById.has(c)));
  let fxBad = 0, priceBad = 0, usdDrift = 0, usdChecked = 0;
  const keys = new Set();
  let dup = 0;
  const weeksByCc = new Map();
  for (let i = 0; i < n; i++) {
    const fx = cols.fx[i];
    if (!(fx > 0)) fxBad++;
    const p = cols.p[i];
    if (p != null && !(p > 0)) priceBad++;
    const key = `${cols.w[i]}|${cols.s[i]}|${cols.h[i]}|${cols.seller[i]}`;
    if (keys.has(key)) dup++;
    keys.add(key);
    const cc = channels[cols.h[i]].split(':')[0];
    let set = weeksByCc.get(cc);
    if (!set) weeksByCc.set(cc, (set = new Set()));
    set.add(weeks[cols.w[i]]);
    if (p != null && fx > 0) {
      usdChecked++;
      const usd = p / fx;
      if (!(usd > 0 && usd < 20000)) usdDrift++;
    }
  }
  check('行内汇率全部 > 0', fxBad === 0);
  check('平台成交价非空时 > 0', priceBad === 0);
  check('唯一键 周×SKU×渠道×店铺 无重复', dup === 0, `${dup} 重复`);
  check('USD 折算（本币/汇率）全部落在 (0, 20000) 合理区间', usdDrift === 0, `${usdChecked.toLocaleString()} 行校验`);
  check('字典列：url 非空率 ≥ 99%', dict.url.filter(Boolean).length / dict.url.length >= 0.99, `${dict.url.length} 个唯一 URL`);
  check('R国 ≥ 20 周、沙特 ≥ 18 周、墨西哥 = 24 周有数', (weeksByCc.get('RU')?.size ?? 0) >= 20 && (weeksByCc.get('SA')?.size ?? 0) >= 18 && weeksByCc.get('MX')?.size === 24, `RU ${weeksByCc.get('RU')?.size} / SA ${weeksByCc.get('SA')?.size} / MX ${weeksByCc.get('MX')?.size}`);
  // 默认电渠口径：R国 DNS 渠道存在且有 Pura 90s Pro Max 行
  const dnsIdx = channels.indexOf('RU:dns:独立站');
  const puraSkus = new Set(skus.map((s, i) => [s, i]).filter(([s]) => s.startsWith('own-huawei-pura-90s-pro-max__')).map(([, i]) => i));
  let dnsPura = 0;
  for (let i = 0; i < n; i++) if (cols.h[i] === dnsIdx && puraSkus.has(cols.s[i]) && cols.p[i] != null) dnsPura++;
  check('R国 DNS 渠道有 Pura 90s Pro Max 有价行（默认视图有线可画）', dnsIdx >= 0 && dnsPura >= 10, `${dnsPura} 行`);
  check('接入报告存在（data/real/ingest_report.md）', existsSync(join(ROOT, 'data', 'real', 'ingest_report.md')));
}

// ---------------- 3. 契约冒烟（tsc 编译临时 TS） ----------------
console.log('\n[3] buildSeries 契约冒烟');
{
  const tmp = mkdtempSync(join(tmpdir(), 'pl-smoke-'));
  try {
    const aggPath = join(ROOT, 'src', 'dataModel', 'aggregate');
    const dataPath = join(ROOT, 'src', 'data', 'index');
    const rel = (p) => JSON.stringify(relative(tmp, p).split('\\').join('/'));
    const smokeTs = `
declare const process: { exit(code?: number): never };
import { buildSeries, lowestPriceColorSku, defaultCompetitorSkus, platformPriceSpread, effectiveChannelIds } from ${rel(aggPath)};
import { dimRegion, dimProduct, factPriceWeekly } from ${rel(dataPath)};

function assert(cond: boolean, msg: string): void {
  if (!cond) { console.error('SMOKE FAIL: ' + msg); process.exit(1); }
}
const ru = dimRegion.find(r => r.country_code === 'RU')!;
const ownModel = ru.default_own_models.phone!;
assert(ownModel === 'own-huawei-pura-90s-pro-max', '默认我司型号 = Pura 90s Pro Max，got ' + ownModel);
const sku = lowestPriceColorSku(ownModel, '12+256 GB', 'RU');
assert(!!sku && sku.startsWith(ownModel + '__12-256gb__'), 'lowestPriceColorSku 匹配该配置，got ' + sku);
const dns = effectiveChannelIds('RU', null);
assert(dns.length === 1 && dns[0] === 'RU:dns:独立站', '未选平台 = DNS 单渠道，got ' + dns.join(','));
const comps = defaultCompetitorSkus(ownModel, '12+256 GB', 'RU');
assert(comps.length === 2, '默认竞品 2 个（iPhone 17 Pro / S26 Ultra），got ' + comps.length);
const groups = [
  { modelId: ownModel, romram: '12+256 GB', skuIds: [sku!], isOwn: true },
  ...comps.map(c => { const p = dimProduct.find(x => x.sku_id === c)!; return { modelId: p.model_id, romram: p.romram, skuIds: [c], isOwn: false }; }),
];
const q = { scope: { countryCode: 'RU', industry: 'phone' as const }, groups, granularity: 'week' as const, startBucket: '202619', endBucket: '202642', currency: 'usd' as const, agg: 'avg' as const, platform: null };
const s1 = buildSeries(q);
const s2 = buildSeries(q);
assert(JSON.stringify(s1) === JSON.stringify(s2), '同输入两次调用逐字节一致');
assert(s1.length === 3, '三条系列，got ' + s1.length);
assert(s1[0].isOwn === true && s1[0].color === '#c7000b', '我司 HUAWEI 品牌色');
assert(s1[0].label === 'HUAWEI Pura 90s Pro Max 12+256 GB', 'label = 品牌+产品名+配置，got ' + s1[0].label);
assert(s1[0].points.length === 24, '24 周桶，got ' + s1[0].points.length);
const priced = s1[0].points.filter(p => p.price != null);
assert(priced.length >= 3, '我司默认系列 USD 有价点 ≥ 3（Pura 90s Pro Max 为 R国新品，DNS 仅 4 周有数），got ' + priced.length);
assert(priced.every(p => p.rrp != null), '有价必有 RRP');
assert(priced.every(p => (p.shopName ?? '').startsWith('DNS')), '取价店铺 = DNS 渠道，got ' + priced[0].shopName);
assert(priced.every(p => p.url.startsWith('http')), 'url 为取证链接');
// USD 点 = 本币点 / 行内汇率：同口径本币查询逐点自洽（允许 ±1 取整）
const sl = buildSeries({ ...q, currency: 'local' });
let drift = 0;
for (let i = 0; i < 24; i++) {
  const pu = s1[0].points[i].price, pl = sl[0].points[i].price;
  if (pu == null || pl == null) { if ((pu == null) !== (pl == null)) drift++; continue; }
  const row = factPriceWeekly.find(r => r.country_code === 'RU' && r.sku_id === sku && r.week_id === s1[0].points[i].bucketId && r.channel_id === 'RU:dns:独立站')!;
  if (Math.abs(pl / row.fx - pu) > 1) drift++;
}
assert(drift === 0, 'USD/本币逐点自洽，漂移点 ' + drift);
// 月桶
const sm = buildSeries({ ...q, granularity: 'month', startBucket: '202605', endBucket: '202610' });
assert(sm[0].points.length === 6 && sm[0].points[0].xLabel === '202605', '6 个月桶');
// 平台价差：R国 OZON 与 DNS 并存周应 ≥ 2 平台
const wk = priced[priced.length - 1].bucketId;
const spread = platformPriceSpread(sku!, wk, 'RU', 'usd');
assert(spread.length >= 1 && spread.every((s, i, a) => i === 0 || a[i - 1].price <= s.price), '平台价差升序，got ' + JSON.stringify(spread));
console.log('SMOKE-JSON\\t' + JSON.stringify({ sku, comps, lastPrice: priced[priced.length - 1].price, lastWeek: wk, shop: priced[0].shopName, spread }));
`;
    writeFileSync(join(tmp, 'smoke.ts'), smokeTs);
    writeFileSync(join(tmp, 'raw.d.ts'), "declare module '*?raw' { const content: string; export default content; }\n");
    symlinkSync(join(ROOT, 'node_modules'), join(tmp, 'node_modules'), 'dir');
    const tscBin = join(ROOT, 'node_modules', '.bin', 'tsc');
    const compiled = spawnSync(tscBin, [
      join(tmp, 'smoke.ts'),
      join(tmp, 'raw.d.ts'),
      '--outDir', join(tmp, 'out'),
      '--rootDir', '/',
      '--module', 'commonjs',
      '--target', 'es2020',
      '--moduleResolution', 'node',
      '--esModuleInterop',
      '--resolveJsonModule',
      '--skipLibCheck',
    ], { encoding: 'utf8' });
    if (compiled.status !== 0) {
      check('smoke.ts 编译', false, (compiled.stdout + compiled.stderr).slice(0, 800));
    } else {
      const outDataDir = join(tmp, 'out', relative('/', join(ROOT, 'src', 'data')));
      writeFileSync(join(outDataDir, 'fact_pack_gzip.b64.txt?raw.js'), `module.exports = ${JSON.stringify(packB64)};\n`);
      const smokeJs = join(tmp, 'out', relative('/', join(tmp, 'smoke.ts')).replace(/\.ts$/, '.js'));
      const run = spawnSync(process.execPath, [smokeJs], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      const jsonLine = (run.stdout + '').split('\n').find((l) => l.startsWith('SMOKE-JSON\t'));
      check('smoke.ts 编译', true, 'tsc 0 错误');
      if (run.status !== 0) {
        check('buildSeries 冒烟断言', false, (run.stdout + run.stderr).trim().slice(0, 800));
      } else {
        check('buildSeries 冒烟断言（默认视图/确定性/币种自洽/默认电渠/取证链接/平台价差）', true);
        if (jsonLine) console.log('  SMOKE ' + jsonLine.replace('SMOKE-JSON\t', ''));
      }
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------------- 4. 单文件版一致性（铁律：每次构建同步根目录 PriceLens.html） ----------------
console.log('\n[4] 单文件版一致性（PriceLens.html）');
{
  const singlePath = join(ROOT, '..', 'PriceLens.html');
  const distPath = join(ROOT, 'dist', 'index.html');
  let ok = false;
  let detail = '';
  try {
    const single = readFileSync(singlePath);
    const dist = readFileSync(distPath);
    ok = single.length > 0 && single.equals(dist);
    detail = `${(single.length / 1024 / 1024).toFixed(2)}MB`;
  } catch (e) {
    detail = `读取失败：${e.message.slice(0, 80)}`;
  }
  check('根目录 PriceLens.html 存在且与 pricelens/dist/index.html 逐字节一致', ok, detail);
}

// ---------------- 汇总 ----------------
console.log(`\n[verify] ${passed} 项通过，${failures.length} 项失败${failures.length ? '：\n  - ' + failures.join('\n  - ') : ''}`);
process.exit(failures.length === 0 ? 0 : 1);
