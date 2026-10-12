// ============================================================
// PriceLens 造数脚本（§11 造数规范）
// 输入：data/master/*.json（§8/§9/§10/§11.3/§11.4 转录）
// 输出：src/data/dim_*.json + fact_price_weekly.json
// 确定性：固定 seed 20261009，同 seed 输出逐字节一致。
// 随机数全部来自"字符串标签 → hash → mulberry32"，与遍历顺序无关。
// 仅用 Node 内置模块。
// ============================================================
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MASTER = join(ROOT, 'data', 'master');
const OUT = join(ROOT, 'src', 'data');
const SEED_LABEL = 'pricelens-20261009';
const BATCH_ID = 'B2026W41';
const QUALITY_FLAG = 'synthetic';
const DAY_MS = 86400000;

// ---------------- 确定性随机（xmur3 + mulberry32） ----------------
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}
function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** 每个标签独立、确定性地取一个 [0,1) 随机数（顺序无关） */
function rnd(label) {
  return mulberry32(xmur3(SEED_LABEL + '|' + label)())();
}
/** ±span 的对称噪声 */
function noise(label, span) {
  return 1 + (rnd(label) * 2 - 1) * span;
}

// ---------------- 日期工具（全部 UTC，无时区漂移） ----------------
function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}
function fmtDate(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}
function mondayOfIsoWeek1(y) {
  const jan4 = Date.UTC(y, 0, 4);
  const dow = (new Date(jan4).getUTCDay() + 6) % 7; // 周一=0
  return jan4 - dow * DAY_MS;
}
/** 周一 ms → { isoYear, weekNum }（以周四所在年为准） */
function isoWeekOf(mondayMs) {
  const thursday = mondayMs + 3 * DAY_MS;
  const isoYear = new Date(thursday).getUTCFullYear();
  const weekNum = Math.round((mondayMs - mondayOfIsoWeek1(isoYear)) / (7 * DAY_MS)) + 1;
  return { isoYear, weekNum };
}

// ---------------- 1. dim_time：93 个 ISO 周 ----------------
const WINDOW_START_MONDAY = parseDate('2024-12-30'); // 2025-W01 周一
const WINDOW_WEEKS = 93; // → 2026-W41（周三 2026-10-07）

function buildDimTime() {
  const rows = [];
  for (let i = 0; i < WINDOW_WEEKS; i++) {
    const monday = WINDOW_START_MONDAY + i * 7 * DAY_MS;
    const wed = monday + 2 * DAY_MS;
    const { isoYear, weekNum } = isoWeekOf(monday);
    const wd = new Date(wed);
    const month_id = `${wd.getUTCFullYear()}${String(wd.getUTCMonth() + 1).padStart(2, '0')}`;
    const quarter_id = `${wd.getUTCFullYear()}Q${Math.floor(wd.getUTCMonth() / 3) + 1}`;
    rows.push({
      week_id: `${isoYear}${String(weekNum).padStart(2, '0')}`,
      week_wed_date: fmtDate(wed),
      month_id,
      quarter_id,
      week_start_date: fmtDate(monday),
    });
  }
  return rows;
}

// ---------------- 2. 周汇率（§11.4 月均线性插值 ±1.5% seed 噪声） ----------------
function buildWeeklyFx(fxRows, dimTime) {
  const byMonth = new Map(fxRows.map((r) => [r.month_id, r.usd_rub_avg]));
  const months = [...byMonth.keys()].sort();
  function fxAtDate(ms) {
    const d = new Date(ms);
    const mid = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const idx = months.indexOf(mid);
    const cur = byMonth.get(mid);
    if (idx < 0 || idx >= months.length - 1) return cur;
    const next = byMonth.get(months[idx + 1]);
    const nm = months[idx + 1];
    const nextStart = Date.UTC(Number(nm.slice(0, 4)), Number(nm.slice(4)) - 1, 1);
    const curStart = Date.UTC(Number(mid.slice(0, 4)), Number(mid.slice(4)) - 1, 1);
    const t = (ms - curStart) / (nextStart - curStart);
    return cur + (next - cur) * t;
  }
  const weekly = new Map();
  for (const w of dimTime) {
    const base = fxAtDate(parseDate(w.week_wed_date));
    weekly.set(w.week_id, base * noise('fx|' + w.week_id, 0.015));
  }
  return weekly;
}

// ---------------- 3. 主数据装载与校验 ----------------
const products = JSON.parse(readFileSync(join(MASTER, 'products.json'), 'utf8'));
const shops = JSON.parse(readFileSync(join(MASTER, 'shops.json'), 'utf8'));
const regions = JSON.parse(readFileSync(join(MASTER, 'regions.json'), 'utf8'));
const fx = JSON.parse(readFileSync(join(MASTER, 'fx.json'), 'utf8'));
const promocal = JSON.parse(readFileSync(join(MASTER, 'promocal.json'), 'utf8'));
const benchmark = JSON.parse(readFileSync(join(MASTER, 'benchmark.json'), 'utf8'));

const RUB_ROUND = 10; // ₽ 取整到 10
const USD_ROUND = 1; // USD 取整到 1
const roundRub = (v) => Math.round(v / RUB_ROUND) * RUB_ROUND;
const roundUsd = (v) => Math.round(v / USD_ROUND) * USD_ROUND;

const TIER_BANDS = [
  [200, '<200'],
  [400, '200-400'],
  [600, '400-600'],
  [800, '600-800'],
  [1000, '800-1000'],
];
function tierOf(usd) {
  for (const [hi, code] of TIER_BANDS) if (usd < hi) return code;
  return '1000+';
}

function buildDimProduct() {
  const rows = [];
  for (const m of products) {
    for (const g of m.skus) {
      const rrp = m.rrp_rub_by_romram[g.romram];
      if (rrp == null) throw new Error(`缺少 ROMRAM RRP：${m.model_id} ${g.romram}`);
      for (const color of g.colors) {
        const usd = Math.floor(rrp / 80); // 参考汇率 A8
        const row = {
          sku_id: `${m.model_id}__${g.romram.replace(/ /g, '')}__${color}`,
          industry: 'phone',
          brand: m.brand,
          is_own: m.is_own,
          series: m.series,
          model_name: m.model_name,
          romram: g.romram,
          color,
          launch_date: m.launch_date,
          launch_price_rub: rrp,
          launch_price_usd: usd,
          tier_code: m.tier_code ?? tierOf(usd),
        };
        if (m.eol_date != null) row.eol_date = m.eol_date;
        if (m.prev_model_id != null) row.prev_model_id = m.prev_model_id;
        if (m.next_model_id != null) row.next_model_id = m.next_model_id;
        rows.push(row);
      }
    }
  }
  return rows;
}

// ---------------- 4. §11.1/§11.2/§11.3 生命周期造数参数 ----------------
const CONV_DEPTH = {
  '<200': [0.05, 0.1],
  '200-400': [0.05, 0.1],
  '400-600': [0.04, 0.08],
  '600-800': [0.04, 0.08],
  '800-1000': [0.02, 0.05],
  '1000+': [0.0, 0.04],
};
const PROMO_DEPTH = {
  '<200': [0.15, 0.25],
  '200-400': [0.15, 0.25],
  '400-600': [0.12, 0.2],
  '600-800': [0.12, 0.2],
  '800-1000': [0.08, 0.15],
  '1000+': [0.05, 0.12],
};
const HINT_POS = { 深: 0.75, 中: 0.5, 浅: 0.25 };
const FOLDABLE_MODELS = new Set(['own-mate-x7', 'own-mate-xt', 'own-mate-x6', 'cmp-galaxy-z-fold7', 'cmp-magic-v5']);
const MISSING_RATE = 0.04; // A9
const OFFER_RATE = 0.6; // A11
const LAUNCH_WEEKS = 8;
const GIFT_ITEMS = ['无线耳机', '保护壳', '原装表带'];
const OFFER_TYPE_NAME = { installment: '先享后付', gift: '赠品', coupon: '平台券' };

function brandModifier(model, tier) {
  let mod = 1;
  if (model.brand === 'APPLE') mod *= 0.7; // Apple 折扣最浅
  if (FOLDABLE_MODELS.has(model.model_id)) mod *= 0.8; // 折叠件
  if ((model.brand === 'XIAOMI' || model.brand === 'HONOR') && (tier === '<200' || tier === '200-400')) mod *= 1.1; // 入门
  return mod;
}

function buildFact(dimTime, dimProduct, weeklyFx) {
  const wedByWeek = new Map(dimTime.map((w) => [w.week_id, w.week_wed_date]));
  const urlOf = (p) =>
    `https://www.ozon.ru/search/?text=${encodeURIComponent(`${p.brand} ${p.model_name} ${p.romram}`)}`;

  // SKU 生命周期静态参数（一次性抽取，保证逐周稳定）
  const life = new Map();
  for (const p of dimProduct) {
    const firstIdx = dimTime.findIndex((w) => w.week_wed_date >= p.launch_date);
    if (firstIdx < 0) continue; // 窗口外上市（不存在于本数据集）
    let lastIdx = dimTime.length - 1;
    if (p.eol_date) {
      const li = dimTime.findLastIndex((w) => w.week_wed_date <= p.eol_date);
      if (li < firstIdx) continue;
      lastIdx = li;
    }
    const n = lastIdx - firstIdx + 1;
    const launchLen = Math.min(LAUNCH_WEEKS, n);
    const clearLen = p.eol_date ? Math.min(10 + Math.floor(rnd(`clear|${p.sku_id}`) * 5), n) : 0;
    const clearStart = n - clearLen;
    // RRP 官方调价：清库段内 1-2 次阶梯跳变（−3~−5%）
    const nCuts = clearLen > 0 ? (rnd(`cuts|${p.sku_id}`) < 0.5 ? 1 : 2) : 0;
    const cutAt = [];
    const cutPct = [];
    for (let c = 0; c < nCuts; c++) {
      cutAt.push(c === 0 ? clearStart : clearStart + Math.max(1, Math.floor(clearLen / 2)));
      cutPct.push(0.03 + rnd(`cut|${p.sku_id}|${c}`) * 0.02);
    }
    // 清库折后价：2-3 个台阶，每台阶 −2~−4%，台阶内恒定（§11.1 修订：阶梯稳定）
    const nSteps = clearLen > 0 ? (rnd(`clrsteps|${p.sku_id}`) < 0.5 ? 2 : 3) : 0;
    const stepAt = [];
    const stepPct = [];
    for (let s = 0; s < nSteps; s++) {
      stepAt.push(clearStart + s * Math.max(1, Math.floor(clearLen / nSteps)));
      stepPct.push(0.02 + rnd(`clrstep|${p.sku_id}|${s}`) * 0.02);
    }
    const [clo, chi] = CONV_DEPTH[p.tier_code];
    life.set(p.sku_id, {
      firstIdx,
      lastIdx,
      n,
      launchLen,
      clearStart,
      cutAt,
      cutPct,
      stepAt,
      stepPct,
      convDepth: clo + (chi - clo) * rnd(`conv|${p.sku_id}`),
      brandMod: brandModifier(p, p.tier_code),
      url: urlOf(p),
    });
  }

  // 档期 offer（每 SKU × 档期至多一种，≥60% 概率）
  function offerOf(skuId, promo) {
    if (rnd(`offer|${skuId}|${promo.promo_id}`) >= OFFER_RATE) return null;
    const roll = rnd(`offertype|${skuId}|${promo.promo_id}`);
    const type = roll < 1 / 3 ? 'installment' : roll < 2 / 3 ? 'gift' : 'coupon';
    const endMd = promo.end_date.slice(5).replace('-', '-');
    return { type, endMd, endDate: promo.end_date, promoName: promo.promo_name };
  }
  function offerText(skuId, promo, off, priceRub, wedDate) {
    const remain = Math.max(0, Math.round((parseDate(promo.end_date) - parseDate(wedDate)) / DAY_MS));
    if (off.type === 'installment') {
      const n = rnd(`inst|${skuId}|${promo.promo_id}`) < 0.5 ? 6 : 12;
      return `先享后付免息 ${n} 期，至 ${off.endMd} 银行价 ${priceRub}卢布 / 关税约 ${Math.round(priceRub * 0.13)}卢布 / 活动剩 ${remain}天`;
    }
    if (off.type === 'gift') {
      const item = GIFT_ITEMS[Math.floor(rnd(`gift|${skuId}|${promo.promo_id}`) * GIFT_ITEMS.length)];
      return `下单赠 ${item}，至 ${off.endMd} · 活动剩 ${remain}天`;
    }
    const pct = rnd(`coup|${skuId}|${promo.promo_id}`) < 0.5 ? 5 : 10;
    return `平台券 −${pct}%，至 ${off.endMd}`;
  }

  // 档期深度：分档大促深度 × 档位锚点(按 depth_hint) × 月龄系数 × 品牌修正，封顶 30%
  // 月龄系数按档期开始日计（同一档期内深度恒定 → 档期内每周同价）
  function promoDepth(p, lf, promo) {
    const [lo, hi] = PROMO_DEPTH[p.tier_code];
    const pos = Math.min(1, Math.max(0, HINT_POS[promo.depth_hint] + (rnd(`hint|${p.sku_id}|${promo.promo_id}`) - 0.5) * 0.2));
    const base = lo + (hi - lo) * pos;
    const ageMonths = (parseDate(promo.start_date) - parseDate(p.launch_date)) / DAY_MS / 30.44;
    const ageF = ageMonths < 6 ? 0.6 : ageMonths <= 12 ? 1.0 : 1.3;
    return Math.min(0.3, base * ageF * lf.brandMod);
  }

  // 档期参与：浅/中档期部分机型不跟价（旗舰新机常不参与 shallow 促销）；深档期全员参与。
  // 参与与否 seed 固定，同一 SKU × 档期恒定。
  function partakes(p, promo) {
    if (promo.depth_hint === '深') return true;
    const pKeep = promo.depth_hint === '中' ? 0.85 : 0.7;
    return rnd(`partake|${p.sku_id}|${promo.promo_id}`) < pKeep;
  }

  const rows = [];
  let launchSegRows = 0;
  for (const p of dimProduct) {
    const lf = life.get(p.sku_id);
    if (!lf) continue;
    const baseRrp = p.launch_price_rub;
    for (let rel = 0; rel < lf.n; rel++) {
      if (rel < lf.launchLen) launchSegRows++;
      const w = dimTime[lf.firstIdx + rel];
      const wed = w.week_wed_date;
      const fxw = weeklyFx.get(w.week_id);

      // RRP 官方阶梯：清库段 1-2 次 −3~−5% 阶梯跳变
      let rrp = baseRrp;
      for (let c = 0; c < lf.cutAt.length; c++) if (rel >= lf.cutAt[c]) rrp *= 1 - lf.cutPct[c];
      const rrpRub = roundRub(rrp);

      // 缺采：≈4%，不与上市段重叠
      const missing = rel >= lf.launchLen && rnd(`miss|${p.sku_id}|${w.week_id}`) < MISSING_RATE;

      let priceRub = null;
      let offer = null;
      if (!missing) {
        const promo = promocal.find((x) => x.start_date <= wed && wed <= x.end_date);
        if (rel < lf.launchLen) {
          // 上市段：供应紧张溢价，3 个台阶 +5% → +2% → 0（台阶内恒定，独占不与大促/清库叠价）
          const third = Math.max(1, Math.ceil(lf.launchLen / 3));
          const premium = rel < third ? 0.05 : rel < third * 2 ? 0.02 : 0;
          priceRub = baseRrp * (1 + premium);
        } else {
          // 坚挺 / 大促 / 清库三段全部为"台阶恒定"价：只有段边界才变价。
          // 大促与清库重叠时取最深折扣，档期结束回弹到当前台阶基准价。
          const candidates = [];
          if (rel >= lf.clearStart) {
            let cumStep = 0;
            for (let s = 0; s < lf.stepAt.length; s++) if (rel >= lf.stepAt[s]) cumStep += lf.stepPct[s];
            candidates.push(rrp * (1 - lf.convDepth) * (1 - cumStep));
          }
          if (promo && partakes(p, promo)) candidates.push(rrp * (1 - promoDepth(p, lf, promo)));
          if (candidates.length === 0) candidates.push(rrp * (1 - lf.convDepth)); // 坚挺段
          priceRub = Math.min(...candidates);
        }
        priceRub = roundRub(priceRub);
        if (promo) {
          const off = offerOf(p.sku_id, promo);
          if (off) {
            offer = {
              title: `${off.promoName} · ${OFFER_TYPE_NAME[off.type]}`,
              text: offerText(p.sku_id, promo, off, priceRub, wed),
            };
          }
        }
      }

      const row = {
        week_id: w.week_id,
        sku_id: p.sku_id,
        rrp_rub: rrpRub,
        rrp_usd: roundUsd(rrpRub / fxw),
      };
      if (priceRub != null) {
        row.discounted_price_rub = priceRub;
        row.discounted_price_usd = roundUsd(priceRub / fxw);
      }
      if (offer) {
        row.offer_title = offer.title;
        row.offer_text = offer.text;
      }
      row.crawl_status = missing ? 'missing' : 'ok';
      row.url = lf.url;
      row.batch_id = BATCH_ID;
      row.quality_flag = QUALITY_FLAG;
      rows.push(row);
    }
  }
  return { rows, launchSegRows };
}

// ---------------- 5. 输出（固定键序、紧凑序列化） ----------------
function writeOut(name, data) {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, name), JSON.stringify(data) + '\n');
}

const dimTime = buildDimTime();
const dimProduct = buildDimProduct();
const weeklyFx = buildWeeklyFx(fx, dimTime);

// 主数据一致性断言
const skuIds = new Set(dimProduct.map((r) => r.sku_id));
for (const b of benchmark) {
  if (!skuIds.has(b.competitor_sku_id)) throw new Error(`benchmark 引用了不存在的 SKU：${b.competitor_sku_id}`);
  const model = products.find((m) => m.model_id === b.own_model_id);
  if (!model || model.rrp_rub_by_romram[b.own_romram] == null)
    throw new Error(`benchmark 引用了不存在的我司 ROMRAM：${b.own_model_id} ${b.own_romram}`);
}
const benchSku = dimProduct.find((r) => r.sku_id === 'cmp-iphone-17__8+256GB__Black');
if (!benchSku) throw new Error('基准 SKU 缺失（id 方案检查失败）');

const { rows: fact, launchSegRows } = buildFact(dimTime, dimProduct, weeklyFx);

writeOut('dim_region.json', regions);
writeOut('dim_product.json', dimProduct);
writeOut('dim_channel.json', shops);
writeOut('dim_time.json', dimTime);
writeOut('dim_fx.json', fx);
writeOut('dim_promo.json', promocal);
writeOut('dim_benchmark.json', benchmark);
writeOut('fact_price_weekly.json', fact);

// ---------------- 摘要 ----------------
const missingRows = fact.filter((r) => r.crawl_status === 'missing').length;
const offerRows = fact.filter((r) => r.offer_title != null).length;
console.log(`[gen] dim_time        ${dimTime.length} 周（${dimTime[0].week_id} 周三 ${dimTime[0].week_wed_date} → ${dimTime[dimTime.length - 1].week_id} 周三 ${dimTime[dimTime.length - 1].week_wed_date}）`);
console.log(`[gen] dim_product     ${dimProduct.length} SKU`);
console.log(`[gen] dim_channel     ${shops.length} 店铺`);
console.log(`[gen] dim_region      ${regions.length} 国`);
console.log(`[gen] dim_fx          ${fx.length} 月`);
console.log(`[gen] dim_promo       ${promocal.length} 档期`);
console.log(`[gen] dim_benchmark   ${benchmark.length} 行`);
console.log(`[gen] fact            ${fact.length} 行，缺采 ${missingRows}/${fact.length - launchSegRows}（非上市段）= ${((missingRows / (fact.length - launchSegRows)) * 100).toFixed(2)}%，offer ${offerRows} 行`);
