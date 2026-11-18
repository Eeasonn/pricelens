// ============================================================
// 双引擎金标（2026-11-18 前后端分离）：服务器 Python 引擎（server/ingest_pack.py）
// 与前端引擎（dataModel/offerIngest.ts）对同一 v3 原表包的派生结果必须一致。
//
// fixture = fixtures/py-engine-v2-pack.json（Python 引擎产物）。
// 再生成：cd pricelens && python3 -X utf8 -c "
//   import json,sys; sys.path.insert(0,'server'); import ingest_pack
//   pack=json.load(open('public/raw-sample.json'))
//   v2,_,_=ingest_pack.ingest_v3_pack(pack,{},'src/data/dim_region.json','server/data/pricelens.db')
//   json.dump(v2,open('src/data/__tests__/fixtures/py-engine-v2-pack.json','w'),ensure_ascii=False)"
// 派生输入 = 无配置（零内置语义），与下方前端引擎 ctx 一致。
//
// 允许的双端差异：factPackB64 字节级（gzip level 与 JSON 序列化差异）——一律
// 对比解码后的语义；行序不比（对比 = 周|SKU|本币价|汇率 键的多重集）。
// ============================================================
// @ts-ignore 测试运行时读资产（仓库未装 @types/node）
import { readFileSync } from 'node:fs';
import { gunzipSync, strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { buildFromOffers, type OfferIngestCtx, type OfferSourceRow } from '../../dataModel/offerIngest';
import regionJson from '../dim_region.json';

const REGION_BASE = regionJson as unknown as OfferIngestCtx['regionBase'];

/** Python 产物解码：b64 → gzip → 列式 → 逐行键（week|sku|rrp_local|price_local|fx）多重集 */
function pyFactKeys(b64: string): Map<string, number> {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const pack = JSON.parse(strFromU8(gunzipSync(bytes))) as {
    weeks: string[]; skus: string[]; cols: { w: number[]; s: number[]; rrp: (number | null)[]; p: (number | null)[]; fx: number[] };
  };
  const keys = new Map<string, number>();
  const fmt = (v: number | null): string => (v == null ? '—' : String(v));
  for (let i = 0; i < pack.cols.w.length; i++) {
    const k = `${pack.weeks[pack.cols.w[i]]}|${pack.skus[pack.cols.s[i]]}|${fmt(pack.cols.rrp[i])}|${fmt(pack.cols.p[i])}|${pack.cols.fx[i]}`;
    keys.set(k, (keys.get(k) ?? 0) + 1);
  }
  return keys;
}

describe('双引擎金标：Python ingest_pack ≡ 前端 offerIngest（raw-sample 22,225 行）', () => {
  const pyPack = JSON.parse(
    readFileSync(new URL('./fixtures/py-engine-v2-pack.json', import.meta.url), 'utf8'),
  ) as {
    v: number;
    dims: { product: { sku_id: string; model_id: string; industry: string; series: string; romram: string; color: string }[]; channel: { channel_id: string }[]; time: unknown[]; fx: unknown[] };
    factPackB64: string;
  };
  const raw = JSON.parse(readFileSync(new URL('../../../public/raw-sample.json', import.meta.url), 'utf8')) as { offers: OfferSourceRow[] };
  const ctx: OfferIngestCtx = {
    seriesRules: null, modelAliasRows: null, tierLadders: null, promoRows: null,
    benchmarkRows: null, regionBase: REGION_BASE,
  };
  const built = buildFromOffers(raw.offers, ctx);

  it('SKU 集合完全一致（658，双向无差）', () => {
    const pySkus = new Set(pyPack.dims.product.map((p) => p.sku_id));
    const jsSkus = new Set(built.dims.product.map((p) => p.sku_id));
    expect(jsSkus.size).toBe(658);
    expect(pySkus.size).toBe(658);
    expect([...jsSkus].filter((s) => !pySkus.has(s))).toEqual([]);
    expect([...pySkus].filter((s) => !jsSkus.has(s))).toEqual([]);
  });

  it('事实行逐行语义一致（22,225 行全量：周|SKU|本币价|汇率 多重集相等）', () => {
    expect(built.factRows.length).toBe(22225);
    const pyKeys = pyFactKeys(pyPack.factPackB64);
    expect(pyKeys.size).toBeGreaterThan(0);
    const fmt = (v: number | null): string => (v == null ? '—' : String(v));
    const mismatches: string[] = [];
    for (const r of built.factRows) {
      const k = `${r.week_id}|${r.sku_id}|${fmt(r.rrp_local)}|${fmt(r.price_local)}|${r.fx}`;
      const n = pyKeys.get(k);
      if (n == null || n <= 0) mismatches.push(k);
      else pyKeys.set(k, n - 1);
    }
    expect(mismatches.slice(0, 5)).toEqual([]);
    expect(mismatches.length).toBe(0);
    // Python 侧也没有多余行
    const leftover = [...pyKeys.values()].reduce((a, b) => a + b, 0);
    expect(leftover).toBe(0);
  });

  it('产品维派生字段抽样一致（型号/系列/拆列展示）', () => {
    const bySku = new Map(built.dims.product.map((p) => [p.sku_id, p]));
    const drift: string[] = [];
    for (const p of pyPack.dims.product) {
      const js = bySku.get(p.sku_id);
      if (!js) continue;
      if (js.model_id !== p.model_id || js.series !== p.series || js.romram !== p.romram || js.color !== p.color) {
        drift.push(`${p.sku_id}: ${p.series}/${p.romram} vs ${js.series}/${js.romram}`);
      }
    }
    expect(drift.slice(0, 5)).toEqual([]);
    expect(drift.length).toBe(0);
  });

  it('维度计数一致（渠道/时间/汇率）+ 前端诊断口径锚', () => {
    expect(pyPack.dims.channel.length).toBe(built.dims.channel.length);
    expect(pyPack.dims.time.length).toBe(built.dims.time.length);
    expect(pyPack.dims.fx.length).toBe(built.dims.fx.length);
    expect(built.diag.rowsIn).toBe(22225);
    expect(built.diag.rowsOut).toBe(22225);
    expect(built.diag.fixed['汇率倒挂(取倒数)']).toBe(188);
    expect(built.diag.fixed['穿戴表盘升配置维']).toBe(1899);
  });
});
