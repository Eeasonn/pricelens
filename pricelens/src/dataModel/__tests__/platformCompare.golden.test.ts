// ============================================================
// 单产品多平台对比金测（2026-10-20 真实数据版）：
// 平台线 = 该平台全部渠道/店铺内「真实最低在架价」（platformPriceSpread 同源），
// demo 的 +0.8%/+1.5% 因子与固定平台序已删——真实数据里平台高低随周波动、可缺采。
// 所有锚点从 factPriceWeekly / dimChannel / dimTime 独立直算，随数据重生成自动对齐。
// ============================================================
import { describe, expect, it } from 'vitest';
import { dimChannel, dimProduct, dimTime, factPriceWeekly } from '../../data';
import { buildPlatformCompare, platformOrderOf } from '../platformCompare';

// HUAWEI nova 14 12+256 GB：RU 有 DNS / OZON / M.Video / MVM 多平台真实行，覆盖 22 个采数周
const ownSku = dimProduct.find((p) => p.sku_id === 'own-huawei-nova-14__12-256gb__black')!;
const modelId = ownSku.model_id;
const romram = ownSku.romram;
const CC = 'RU';

/** fact 直算：某平台在某周对该组 SKU（型号+配置的全部颜色）的最低价（币种字段可选） */
function minPlatformPrice(weekId: string, platform: string, currency: 'usd' | 'local'): number | null {
  const channelIds = new Set(
    dimChannel.filter((c) => c.country_code === CC && c.platform === platform).map((c) => c.channel_id),
  );
  const members = dimProduct
    .filter((p) => p.sku_id.startsWith(modelId + '__') && p.romram.replace(/\s+/g, '') === romram.replace(/\s+/g, ''))
    .map((p) => p.sku_id);
  const field = currency === 'usd' ? 'price_usd' : 'price_local';
  const vals = factPriceWeekly
    .filter((r) => members.includes(r.sku_id) && r.week_id === weekId && channelIds.has(r.channel_id) && r[field] != null)
    .map((r) => r[field]!);
  return vals.length ? Math.min(...vals) : null;
}

describe('buildPlatformCompare', () => {
  it('平台稳定序 = dimChannel 插入序（RU：DNS → OZON → M.Video → MVM）', () => {
    expect(platformOrderOf(CC)).toEqual([...new Set(dimChannel.filter((c) => c.country_code === CC).map((c) => c.platform))]);
    expect(platformOrderOf(CC)).toEqual(['DNS', 'OZON', 'M.Video', 'MVM']);
  });

  it('确定性：同入参两次调用逐字节一致', () => {
    const a = buildPlatformCompare(modelId, romram, [ownSku.sku_id], 'usd', CC);
    const b = buildPlatformCompare(modelId, romram, [ownSku.sku_id], 'usd', CC);
    expect(a).toEqual(b);
  });

  it('每平台线 = fact 直算的该平台真实最低价（首/中/末三周抽核，USD）', () => {
    const res = buildPlatformCompare(modelId, romram, [ownSku.sku_id], 'usd', CC);
    expect(res.weeks.length).toBeGreaterThan(10); // nova 14 全程在采：22 个可比周
    expect(res.weeks.length).toBe(22);
    for (const idx of [0, Math.floor(res.weeks.length / 2), res.weeks.length - 1]) {
      const wk = res.weeks[idx].weekId;
      for (const s of res.series) {
        const expectV = minPlatformPrice(wk, s.platform, 'usd');
        expect(s.points[idx]).toBe(expectV == null ? null : Math.round(expectV));
      }
    }
  });

  it('真实口径：平台无该周数据 = null 点（不再有因子兜底价），且确有平台缺采', () => {
    const res = buildPlatformCompare(modelId, romram, [ownSku.sku_id], 'usd', CC);
    const nullCounts = res.series.map((s) => s.points.filter((p) => p == null).length);
    // 锚 SKU 实况：DNS 全程在采；OZON 缺 9 周；M.Video/MVM 仅早期零星有价
    expect(nullCounts).toEqual([0, 9, 19, 19]);
    // null 与 fact 对齐：点为 null ⇔ 该周该平台无价行
    res.series.forEach((s) => {
      s.points.forEach((p, i) => {
        expect(p == null).toBe(minPlatformPrice(res.weeks[i].weekId, s.platform, 'usd') == null);
      });
    });
  });

  it('缺采周整周跳过：weeks = 有任一平台价的 dimTime 真实周，label 与采集锚周三一致', () => {
    const res = buildPlatformCompare(modelId, romram, [ownSku.sku_id], 'usd', CC);
    const wedById = new Map(dimTime.map((w) => [w.week_id, w.week_wed_date.slice(5)]));
    for (let i = 0; i < res.weeks.length; i++) {
      expect(res.weeks[i].label).toBe(wedById.get(res.weeks[i].weekId));
      expect(res.series.some((s) => s.points[i] != null)).toBe(true);
    }
    // 周升序且全部是 dimTime 子集
    for (let i = 1; i < res.weeks.length; i++) expect(res.weeks[i - 1].weekId < res.weeks[i].weekId).toBe(true);
  });

  it('最新周读数：high/low = 该周真实平台最低价的最高/最低（锚周 DNS 独有价 → 价差 0）', () => {
    const res = buildPlatformCompare(modelId, romram, [ownSku.sku_id], 'usd', CC);
    expect(res.latest).not.toBeNull();
    const last = res.weeks[res.weeks.length - 1];
    expect(res.latest!.weekId).toBe(last.weekId);
    expect(res.latest!.label).toMatch(/^\d{2}-\d{2}$/);
    // 末周（202642）只有 DNS 有价 → 高低同平台、价差 0
    expect(res.latest!.high.platform).toBe('DNS');
    expect(res.latest!.low.platform).toBe('DNS');
    expect(res.latest!.gapPct).toBe(0);
    expect(res.latest!.high.price).toBe(Math.round(minPlatformPrice(last.weekId, 'DNS', 'usd')!));
    // 有多平台并存的历史周：高低价与手工 min/max 一致（202640：OZON 258.62 < DNS 339.37，无固定平台序）
    const dns = minPlatformPrice('202640', 'DNS', 'usd')!;
    const ozon = minPlatformPrice('202640', 'OZON', 'usd')!;
    expect(dns).toBeGreaterThan(ozon);
    const idx = res.weeks.findIndex((w) => w.weekId === '202640');
    expect(res.series.find((s) => s.platform === 'DNS')!.points[idx]).toBe(Math.round(dns));
    expect(res.series.find((s) => s.platform === 'OZON')!.points[idx]).toBe(Math.round(ozon));
  });

  it('币种折算：本币线 = fact price_local 直读、USD 线 = price_usd 直读（行内汇率，非固定 ×80）', () => {
    const usd = buildPlatformCompare(modelId, romram, [ownSku.sku_id], 'usd', CC);
    const rub = buildPlatformCompare(modelId, romram, [ownSku.sku_id], 'local', CC);
    expect(rub.weeks.map((w) => w.weekId)).toEqual(usd.weeks.map((w) => w.weekId));
    // 末周整列抽核：local = min price_local；usd = min price_usd；local/usd ≈ 该周行内汇率（84.04）
    const lastWk = usd.weeks[usd.weeks.length - 1].weekId;
    for (const s of usd.series) {
      const rubSeries = rub.series.find((x) => x.platform === s.platform)!;
      const l = minPlatformPrice(lastWk, s.platform, 'local');
      const u = minPlatformPrice(lastWk, s.platform, 'usd');
      expect(rubSeries.points[rubSeries.points.length - 1]).toBe(l == null ? null : Math.round(l));
      expect(s.points[s.points.length - 1]).toBe(u == null ? null : Math.round(u));
      if (u != null && l != null) {
        const ratio = l / u;
        expect(ratio).toBeGreaterThan(80); // 2026-10 行内汇率 84.04
        expect(ratio).toBeLessThan(88);
      }
    }
  });
});
