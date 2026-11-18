// ============================================================
// 原表模式（v3）样例数据包生成（2026-11-18 配置表化轮）：
// 从内置维表 + 事实包**逆推** offer 原样行（中文双语表头形态），产出只装
// 原样数据的 v3 数据包——用于端到端验证「应用内归一引擎」能把原表行重建
// 出与内置一致的维表/事实（金标对比）。
//
// 逆推是保守重建：spec 由 (romram, color) 按产业拼回（phone='ROMRAM COLOR'、
// tablet='ROMRAM/COLOR'、wearable/audio='颜色变体'），再-parse 会命中引擎
// 同一分支，sku 键与展示字段 round-trip 稳定。iot 同 audio 形态；**pc 排除**
// （CPU|RAM:..|STO:.. 规格无法从展示字段无损逆推，样例包不含 pc）。
//
// 用法：
//   node scripts/build_sample_raw_datapack.mjs                # 全量（约 9.6 万行）
//   node scripts/build_sample_raw_datapack.mjs --countries RU,PL --max-rows 20000
// 产物（不入库，docs/ 已 ignore）：docs/底表样例/pricelens-sample-raw-datapack-<日期>.json
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA = path.join(ROOT, 'src', 'data');
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(DATA, name), 'utf8'));

const args = process.argv.slice(2);
const argOf = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const onlyCountries = argOf('--countries') ? new Set(argOf('--countries').split(',').map((c) => c.trim().toUpperCase())) : null;
const maxRows = Number(argOf('--max-rows') ?? 0) || 0;

const dimRegion = readJson('dim_region.json');
const dimProduct = readJson('dim_product.json');
const dimTime = readJson('dim_time.json');
const dimChannel = readJson('dim_channel.json');
const factB64 = fs.readFileSync(path.join(DATA, 'fact_pack_gzip.b64.txt'), 'utf8').trim();

// ---- 解事实包 → 行 ----
const pack = JSON.parse(zlib.gunzipSync(Buffer.from(factB64, 'base64')).toString('utf8'));
const { weeks, skus, channels, dict, cols } = pack;
const channelBy = new Map(channels.map((c, i) => [i, c]));
const skuBy = new Map(skus.map((s, i) => [i, s]));
const weekBy = new Map(weeks.map((w, i) => [i, w]));
const wedBy = new Map(dimTime.map((t) => [t.week_id, t.week_wed_date]));
const prodBy = new Map(dimProduct.map((p) => [p.sku_id, p]));
const chanBy = new Map(dimChannel.map((c) => [c.channel_id, c]));
const currencyBy = new Map(dimRegion.map((r) => [r.country_code, r.currency]));
const industryCn = { phone: '手机', tablet: '平板', wearable: '穿戴', audio: '音频' };

/** spec 逆推（round-trip 等价形态；pc/iot 不产样例）。
 *  平板原始 spec 是分段形态（屏幕/联网/存储/特殊屏 各自独立段），romram 展示是
 *  塌缩拼接（'11.5" 8+256 GB'）——逆推必须把首段屏幕拆回独立段，否则 parse 的
 *  size=整段、键错位。phone 兜底形态（romram===color=原文）只给单份。 */
const specOf = (p) => {
  if (p.industry === 'phone') return p.romram === '—' ? p.color : (p.romram === p.color ? p.romram : `${p.romram} ${p.color}`);
  if (p.industry === 'tablet') {
    const m = p.romram.match(/^((?:\d{1,2}(?:\.\d+)?)(?:″|"|in))\s*(.*)$/i);
    const head = m ? m[1] : p.romram;
    const rest0 = m ? m[2].trim() : '';
    // 特殊屏是独立段（原始 spec 分段），从余量尾部拆回
    const VARIANTS = ['PaperMatte', 'Nano-Texture Glass'];
    const variant = VARIANTS.find((v) => rest0.toLowerCase().endsWith(v.toLowerCase())) ?? '';
    const mem = variant ? rest0.slice(0, rest0.length - variant.length).trim() : rest0;
    const segments = [head, p.color !== '—' && p.color !== '' ? p.color : '', mem, variant].filter(Boolean);
    return segments.join('/');
  }
  if (p.industry === 'wearable') {
    // 升维形态 romram=尺寸：尺寸段与颜色段拼回（颜色 '—' 不拼）；未升维形态尺寸在
    // color 里；唯一尺寸剥词形态尺寸只活在 sku 键（romKey 段）——从键段提回
    const size = /^\d{2}(?:\.\d+)?mm$/.test(p.romram) ? p.romram
      : (/^\d{2}(?:\.\d+)?mm/.test(p.sku_id.split('__')[1] ?? '') ? p.sku_id.split('__')[1].match(/^\d{2}(?:\.\d+)?mm/)[0] : '');
    const color = p.color === '—' ? '' : p.color;
    if (size && color) return `${size} ${color}`;
    if (size) return size;
    return color;
  }
  return p.color === '—' ? '' : p.color; // audio：颜色变体（std 键）
};

const offers = [];
const n = cols.w.length;
for (let i = 0; i < n; i++) {
  const skuId = skuBy.get(cols.s[i]);
  const p = prodBy.get(skuId);
  if (!p) continue;
  if (p.industry === 'pc' || p.industry === 'iot') continue; // 规格（CPU|RAM/路由器型号形态）无法无损逆推，样例不含
  const ch = chanBy.get(channelBy.get(cols.h[i]));
  if (!ch) continue;
  if (onlyCountries && !onlyCountries.has(ch.country_code)) continue;
  const weekId = weekBy.get(cols.w[i]);
  offers.push({
    时间周期: wedBy.get(weekId) ?? weekId,
    品类: industryCn[p.industry] ?? p.industry,
    品牌: p.brand,
    型号: p.model_name,
    型号规格: specOf(p),
    平台: ch.platform,
    '国家/地区': (dimRegion.find((r) => r.country_code === ch.country_code) ?? {}).country_name ?? ch.country_code,
    店铺类型: ch.store_type,
    店铺名称: dict.seller[cols.seller[i]] ?? '—',
    显示店铺名称: ch.display_name,
    '平台建议零售价-本币': cols.rrp[i],
    '平台成交价-本币': cols.p[i],
    货币: currencyBy.get(ch.country_code) ?? 'USD',
    汇率: cols.fx[i],
    是否组合销售: cols.b[i] === 1 ? 'Y' : 'N',
    分期付款: dict.inst[cols.inst[i]] ?? '',
    促销政策: dict.promo[cols.promo[i]] ?? '',
    网址链接: dict.url[cols.url[i]] ?? '',
    截图命名: dict.shot[cols.shot[i]] ?? '',
    采集时间: cols.t[i] ?? '',
  });
  if (maxRows && offers.length >= maxRows) break;
}

const outPack = {
  kind: 'pricelens-data-pack',
  v: 3,
  generatedAt: new Date().toISOString(),
  offers,
  sales: [],
  monthly: [],
};

const outDir = path.join(ROOT, '..', 'docs', '底表样例');
fs.mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().slice(0, 10).replaceAll('-', '');
const suffix = onlyCountries ? `-countries-${[...onlyCountries].join('').toLowerCase()}` : '';
const outPath = path.join(outDir, `pricelens-sample-raw-datapack-${stamp}${suffix}.json`);
fs.writeFileSync(outPath, JSON.stringify(outPack));
console.log(`原表模式样例包 → ${outPath}`);
console.log(`offer 原样行 ${offers.length}（国家 ${onlyCountries ? [...onlyCountries].join(',') : '全部'}；pc/iot 规格不可逆推不含）`);
console.log(`包大小 ${(fs.statSync(outPath).size / 1024 / 1024).toFixed(1)} MB`);
