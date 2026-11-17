// ============================================================
// 样例数据包生成（2026-11-17 Eason 真实数据接入预演）：
// 以当前内置维表 + 事实包为基座，按 PSI 契约（SalesSourceRow：country/product/
// category1/category2/periodId(YYYY0WW)/qty）生成全量模拟销量，产出 v2 数据包。
// 用途：今晚迁移内部系统前，用配置页「导入数据包」走一遍真实结构端到端——
// 导入后量价销量切 PSI 口径（量带悬停标「PSI 真实销量」、配置页显示销量行数），
// 真实 PSI 周表到位后按同结构替换 sales 数组即可。可复跑：
//    node scripts/build_sample_datapack.mjs
// 产物（不入库，docs/ 已 ignore）：docs/底表样例/pricelens-sample-datapack-<日期>.json
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA = path.join(ROOT, 'src', 'data');
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(DATA, name), 'utf8'));

const dimRegion = readJson('dim_region.json');
const dimProduct = readJson('dim_product.json');
const dimTime = readJson('dim_time.json');
const dimChannel = readJson('dim_channel.json');
const dimFx = readJson('dim_fx.json');
const dimPromo = readJson('dim_promo.json');
const dimBenchmark = readJson('dim_benchmark.json');
const dimTier = readJson('dim_tier.json');
const monthly = readJson('fact_price_monthly.json');
const factPackB64 = fs.readFileSync(path.join(DATA, 'fact_pack_gzip.b64.txt'), 'utf8').trim();

// ---- 确定性微扰（与页内估算同源思路：FNV-1a，同键恒同值） ----
function hash01(key) {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h >>> 0) / 4294967296;
}

const INDUSTRY_BASE = { phone: 6000, tablet: 1800, wearable: 2600, audio: 3800, iot: 900, pc: 700 };
const COUNTRY_W = { RU: 1.0, BR: 1.2, MX: 0.9, ID: 1.1, JP: 1.0, DE: 0.8, GB: 0.75, FR: 0.7, IT: 0.6, ES: 0.55, TR: 0.7, PL: 0.4, RO: 0.2, CO: 0.35, AR: 0.3, PE: 0.2, ZA: 0.3, SA: 0.4, AE: 0.25, MY: 0.3, SG: 0.12, TH: 0.45, PH: 0.5, VN: 0.5 };
const countryW = (cc) => COUNTRY_W[cc] ?? 0.3;

const normModelKey = (name) => String(name).normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');

// ---- 型号名可解析性守卫：样例行必须能被 resolveModelId 唯一解析回自己 ----
// 同归一键多型号（如我司/Honor 各有 Watch 6）只从我司侧发样例（resolve 我司优先）。
const nameKeyOwners = new Map(); // nameKey → own model_id（若有）
const nameKeyAll = new Map(); // nameKey → Set<model_id>
for (const p of dimProduct) {
  const key = normModelKey(p.model_name);
  if (p.is_own) nameKeyOwners.set(key, p.model_id);
  if (!nameKeyAll.has(key)) nameKeyAll.set(key, new Set());
  nameKeyAll.get(key).add(p.model_id);
}
const resolvableModelIds = new Set();
for (const [key, ids] of nameKeyAll) {
  if (ids.size === 1) resolvableModelIds.add([...ids][0]);
  else if (nameKeyOwners.has(key)) resolvableModelIds.add(nameKeyOwners.get(key));
}

// ---- 生成 PSI 源行：enabled 国家 × 可解析型号 × 维度组合 × 周 ----
const weeks = [...new Set(dimTime.map((t) => t.week_id))].sort();
const enabledCc = new Set(dimRegion.filter((r) => r.enabled).map((r) => r.country_code));
const modelRows = new Map(); // model_id → DimProduct[]
for (const p of dimProduct) {
  if (!resolvableModelIds.has(p.model_id)) continue;
  if (!p.countries.some((cc) => enabledCc.has(cc))) continue;
  if (!modelRows.has(p.model_id)) modelRows.set(p.model_id, []);
  modelRows.get(p.model_id).push(p);
}

const sales = [];
for (const [modelId, rows] of modelRows) {
  const name = rows[0].model_name;
  const industry = rows[0].industry;
  const base = INDUSTRY_BASE[industry] ?? 800;
  // 维度组合 = 该型号各行 (cat1, cat2) 去重（cat 字段由 patch_dim_categories 回填）
  const combos = [...new Set(rows.map((r) => `${r.cat1 ?? ''}|${r.cat2 ?? ''}`))];
  for (const cc of rows[0].countries.filter((c) => enabledCc.has(c))) {
    for (const combo of combos) {
      const [cat1, cat2] = combo === '|null' ? [null, null] : combo.split('|');
      const c1 = cat1 === 'null' ? null : cat1 || null;
      const c2 = cat2 === 'null' ? null : cat2 || null;
      for (const week of weeks) {
        const noise = 0.75 + 0.5 * hash01(`${cc}|${modelId}|${combo}|${week}`);
        if (noise < 0.85) continue; // 少量缺货/缺采周，锻炼空周路径
        const qty = Math.max(1, Math.round(base * countryW(cc) * noise));
        // 周期间走 YYYY0WW 七位（202643 → 2026043）， exercised 归一层
        const periodId = `${week.slice(0, 4)}0${week.slice(4)}`;
        sales.push({ country: cc, product: name, category1: c1, category2: c2, periodId, qty });
      }
    }
  }
}

const pack = {
  kind: 'pricelens-data-pack',
  v: 2,
  generatedAt: new Date().toISOString(),
  dims: { region: dimRegion, product: dimProduct, channel: dimChannel, time: dimTime, fx: dimFx, promo: dimPromo, benchmark: dimBenchmark, tier: dimTier },
  factPackB64,
  monthly,
  sales,
  salesProductAliases: {},
};

const outDir = path.join(ROOT, '..', 'docs', '底表样例');
fs.mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().slice(0, 10).replaceAll('-', '');
const outPath = path.join(outDir, `pricelens-sample-datapack-${stamp}.json`);
fs.writeFileSync(outPath, JSON.stringify(pack));
const models = new Set(sales.map((s) => normModelKey(s.product))).size;
console.log(`样例数据包 → ${outPath}`);
console.log(`销量源行 ${sales.length}（型号 ${models} × 国家 ${enabledCc.size} × 周 ${weeks.length}，YYYY0WW 七位期间）`);
console.log(`包大小 ${(fs.statSync(outPath).size / 1024 / 1024).toFixed(1)} MB`);
