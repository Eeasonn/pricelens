// ============================================================
// 单产品多平台对比金测（第五十三轮）：钉住 platformCompare 的口径与确定性。
// 锚点随数据重生成需同步复核。
// ============================================================
import { describe, expect, it } from 'vitest';
import { dimProduct, dimTime, factPriceWeekly } from '../../data';
import { PLATFORM_ORDER, buildPlatformCompare } from '../platformCompare';

const ownSku = dimProduct.find((p) => p.is_own && p.model_name === 'Pura 90s Pro')!;
const modelId = ownSku.sku_id.split('__')[0];
const romram = ownSku.romram;

describe('buildPlatformCompare', () => {
  it('平台稳定序 = dimChannel 插入序（OZON → DNS → M.Video）', () => {
    expect(PLATFORM_ORDER).toEqual(['OZON', 'DNS', 'M.Video']);
  });

  it('确定性：同入参两次调用逐字节一致', () => {
    const a = buildPlatformCompare(modelId, romram, [ownSku.sku_id], 'usd');
    const b = buildPlatformCompare(modelId, romram, [ownSku.sku_id], 'usd');
    expect(a).toEqual(b);
  });

  it('OZON 线 = fact 基准组均值（组内多色、周度取整）', () => {
    const res = buildPlatformCompare(modelId, romram, [ownSku.sku_id], 'usd');
    const group = dimProduct
      .filter((p) => p.sku_id.startsWith(modelId + '__') && p.romram.replace(/\s+/g, '') === romram.replace(/\s+/g, ''))
      .sort((x, y) => x.sku_id.localeCompare(y.sku_id));
    const weeks = res.weeks.map((w) => w.weekId);
    expect(weeks.length).toBeGreaterThan(10); // 首个 Pura ROM 行 = 晚上市档（horizon 短但仍应有几十个可比周）
    // 抽 3 个周锚（首/中/末）对齐 fact 直算
    for (const idx of [0, Math.floor(weeks.length / 2), weeks.length - 1]) {
      const wk = weeks[idx];
      const vals = group
        .map((p) => factPriceWeekly.find((r) => r.sku_id === p.sku_id && r.week_id === wk)?.discounted_price_usd ?? null)
        .filter((v): v is number => v != null);
      const expectV = Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
      expect(res.series[0].platform).toBe('OZON');
      expect(res.series[0].points[idx]).toBe(expectV);
    }
  });

  it('平台序不变量：OZON ≤ DNS ≤ M.Video 逐周成立（因子 +0.8%/+1.5%、抖动 ±0.3% 不改序）', () => {
    const res = buildPlatformCompare(modelId, romram, [ownSku.sku_id], 'usd');
    const ozon = res.series[0].points;
    const dns = res.series[1].points;
    const mv = res.series[2].points;
    for (let i = 0; i < ozon.length; i++) {
      expect(ozon[i]).toBeLessThanOrEqual(dns[i]!);
      expect(dns[i]!).toBeLessThanOrEqual(mv[i]!);
    }
  });

  it('最新周读数：high = M.Video / low = OZON，价差 ∈ [1.2%, 1.8%]（demo 因子口径上限）', () => {
    const res = buildPlatformCompare(modelId, romram, [ownSku.sku_id], 'usd');
    expect(res.latest).not.toBeNull();
    expect(res.latest!.high.platform).toBe('M.Video');
    expect(res.latest!.low.platform).toBe('OZON');
    expect(res.latest!.gapPct).toBeGreaterThanOrEqual(0.012 - 1e-9);
    expect(res.latest!.gapPct).toBeLessThanOrEqual(0.018 + 1e-9);
    // 最新有值周 = dimTime 中该系列有值的最大周（label = 采集锚周三 MM-DD）
    expect(res.latest!.label).toMatch(/^\d{2}-\d{2}$/);
  });

  it('币种折算：RUB ≈ 80 × USD（fact 逐周汇率 ≈ 参考汇率，偏差 <0.1%），平台序不变', () => {
    const usd = buildPlatformCompare(modelId, romram, [ownSku.sku_id], 'usd');
    const rub = buildPlatformCompare(modelId, romram, [ownSku.sku_id], 'local');
    expect(rub.weeks.map((w) => w.weekId)).toEqual(usd.weeks.map((w) => w.weekId));
    for (let i = 0; i < usd.series.length; i++) {
      for (let j = 0; j < usd.weeks.length; j++) {
        const u = usd.series[i].points[j]!;
        const r = rub.series[i].points[j]!;
        expect(Math.abs(r - u * 80) / (u * 80)).toBeLessThan(0.001);
      }
    }
  });

  it('缺采周整周跳过：weeks 均为 dimTime 真实周且 label 与 dimTime 锚日期一致', () => {
    const res = buildPlatformCompare(modelId, romram, [ownSku.sku_id], 'usd');
    const wedById = new Map(dimTime.map((w) => [w.week_id, w.week_wed_date.slice(5)]));
    for (let i = 0; i < res.weeks.length; i++) {
      expect(res.weeks[i].label).toBe(wedById.get(res.weeks[i].weekId));
    }
  });
});
