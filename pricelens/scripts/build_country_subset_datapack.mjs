// ============================================================
// 国家子集数据包生成（2026-11-18 内部部署教程配套工具）：
// 以当前内置维表 + 事实包为基座，仅保留指定国家的渠道与事实行，产出 v2 数据包。
// 用途：内部系统部署时收窄到 9 国（或任意国集合）——配置页「数据包 → 导入」后，
// 国家选择器仍显示全量启用国，未包含国家显示无数据（空态引导，缺采周不插值哲学
// 一致）；数据信息卡 counts 与所选国家一致即为导入成功。
// 可复跑：
//   node scripts/build_country_subset_datapack.mjs --countries RU,PL,DE,FR,GB,IT,ES,SA,AE
//   node scripts/build_country_subset_datapack.mjs --countries RU,PL --regions-only
// 产物：docs/底表样例/pricelens-datapack-<国家集合>.json（docs/ 已 ignore 不入库）
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA = path.join(ROOT, 'src', 'data');
const DOCS = path.join(ROOT, '..', 'docs', '底表样例');

// ---- 参数 ----
const argv = process.argv.slice(2);
const argOf = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : null;
};
const countries = (argOf('--countries') || 'RU,PL,DE,FR,GB,IT,ES,SA,AE')
  .split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
const regionsOnly = argv.includes('--regions-only'); // 维表也收窄（国家选择器只显示所选国；需全链回归，默认不建议）
const tag = countries.join('-').toLowerCase();
const OUT = argOf('--out') || path.join(DOCS, `pricelens-datapack-${tag}.json`);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(DATA, name), 'utf8'));
const keep = (cc) => countries.includes(String(cc).toUpperCase());

// ---- 维表 ----
const dimRegion = readJson('dim_region.json');
const dimProduct = readJson('dim_product.json');
const dimTime = readJson('dim_time.json');
const dimChannelAll = readJson('dim_channel.json');
const dimFx = readJson('dim_fx.json');
const dimPromoAll = readJson('dim_promo.json');
const dimBenchmarkAll = readJson('dim_benchmark.json');
const dimTier = readJson('dim_tier.json');
const monthlyAll = readJson('fact_price_monthly.json');
const factPackB64 = fs.readFileSync(path.join(DATA, 'fact_pack_gzip.b64.txt'), 'utf8').trim();

// ---- 事实包过滤（列式：channels 索引 ∈ 保留国渠道） ----
const raw = Buffer.from(factPackB64, 'base64');
const pack = JSON.parse(zlib.gunzipSync(raw));
// 渠道过滤 + 索引重映射（channels 数组收窄后，行的 h 必须指向新索引——
// 直接沿用旧索引会触发 applyDataPack 的「渠道索引越界」结构校验）
const channelOldToNew = new Map();
const channelsKept = [];
pack.channels.forEach((ch, i) => {
  if (keep(ch.split(':')[0])) { channelOldToNew.set(i, channelsKept.length); channelsKept.push(ch); }
});
const w = [], s = [], h = [];
const colsKept = {};
for (const k of ['rrp', 'p', 'fx', 'dd', 'da', 'b', 'inst', 'promo', 'url', 'shot', 'seller', 't']) colsKept[k] = [];
let keptRows = 0;
for (let i = 0; i < pack.cols.w.length; i++) {
  const oldH = pack.cols.h[i];
  const newH = channelOldToNew.get(oldH);
  if (newH === undefined) continue;
  keptRows++;
  w.push(pack.cols.w[i]); s.push(pack.cols.s[i]); h.push(newH);
  for (const k of Object.keys(colsKept)) colsKept[k].push(pack.cols[k][i]);
}
const subset = {
  v: pack.v,
  weeks: pack.weeks,
  skus: pack.skus,
  channels: channelsKept,
  dict: pack.dict,
  cols: { w, s, h, ...colsKept },
};
const factB64Out = zlib.gzipSync(Buffer.from(JSON.stringify(subset)), { level: 9 }).toString('base64');

// ---- 维表与周边事实（按策略收窄/保留） ----
const dimChannel = regionsOnly ? dimChannelAll.filter((c) => keep(c.country_code)) : dimChannelAll;
const dimPromo = regionsOnly ? dimPromoAll.filter((p) => keep(p.country_code)) : dimPromoAll;
const dimBenchmark = regionsOnly ? dimBenchmarkAll.filter((b) => keep(b.country_code)) : dimBenchmarkAll;
const monthly = monthlyAll.filter((m) => keep(m.country_code)); // 月度事实总是按国家过滤（不残留包外国数据）
const regionKept = regionsOnly ? dimRegion.filter((r) => keep(r.country_code)) : dimRegion;

const out = {
  kind: 'pricelens-data-pack',
  v: 2,
  generatedAt: new Date().toISOString(),
  dims: {
    region: regionKept,
    product: dimProduct,
    channel: dimChannel,
    time: dimTime,
    fx: dimFx,
    promo: dimPromo,
    benchmark: dimBenchmark,
    tier: dimTier,
  },
  factPackB64: factB64Out,
  monthly,
};
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`国家子集数据包 → ${OUT}`);
console.log(`  国家: ${countries.join(', ')}${regionsOnly ? '（维表收窄模式）' : '（维表全量，事实级过滤）'}`);
console.log(`  事实行: ${keptRows} / ${pack.cols.w.length}；渠道: ${channelsKept.length} / ${pack.channels.length}`);
console.log(`  monthly: ${monthly.length} / ${monthlyAll.length}；promo: ${dimPromo.length}；benchmark: ${dimBenchmark.length}`);
console.log(`  包体积: ${(fs.statSync(OUT).size / 1024 / 1024).toFixed(1)} MB`);
