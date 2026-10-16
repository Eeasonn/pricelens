// ============================================================
// 预警中心金测（第五十二轮建 / 第五十三轮扩三类）：钉住 alerts.ts 的规则边界与确定性。
// 数据 = src/data 造数产物（固定批次），锚点随数据重生成需同步复核。
// ============================================================
import { describe, expect, it } from 'vitest';
import { dimProduct } from '../../data';
import { alertSeriesMeta, buildAlerts, seriesKeyOfSku, type AlertItem } from '../alerts';

/** 任取一个我司系列 key（Pura 90s Pro 首个 ROM）与一个竞品系列 key */
const ownSku = dimProduct.find((p) => p.is_own && p.model_name === 'Pura 90s Pro')!;
const compSku = dimProduct.find((p) => !p.is_own && p.brand === 'APPLE')!;
const ownKey = seriesKeyOfSku(ownSku.sku_id);
const compKey = seriesKeyOfSku(compSku.sku_id);
const EPS = 1e-9;

describe('alertSeriesMeta / seriesKeyOfSku', () => {
  it('seriesKeyOfSku → modelId__romram去空格；meta 回查同组且 isOwn 正确', () => {
    expect(ownKey).toBe(`${ownSku.sku_id.split('__')[0]}__${ownSku.romram.replace(/\s+/g, '')}`);
    const meta = alertSeriesMeta(ownKey)!;
    expect(meta).not.toBeNull();
    expect(meta.isOwn).toBe(true);
    expect(meta.brand).toBe(ownSku.brand);
    expect(meta.label).toContain(ownSku.model_name);
    expect(alertSeriesMeta(compKey)!.isOwn).toBe(false);
  });

  it('未知 key / 非法 key = null（不抛错）', () => {
    expect(alertSeriesMeta('no-such-model__12+256')).toBeNull();
    expect(alertSeriesMeta('without-separator')).toBeNull();
  });
});

describe('buildAlerts 规则边界', () => {
  it('空订阅 / 阈值 0 → 恒空（阈值必须为正）', () => {
    expect(buildAlerts([], 0.05)).toEqual([]);
    expect(buildAlerts([ownKey, compKey], 0)).toEqual([]);
    expect(buildAlerts([ownKey, compKey], -0.1)).toEqual([]);
  });

  it('确定性：同入参两次调用逐字节一致', () => {
    const a = buildAlerts([ownKey, compKey], 0.05, 'usd');
    const b = buildAlerts([ownKey, compKey], 0.05, 'usd');
    expect(a).toEqual(b);
  });

  it('结构不变量：promo 必带力度差/VsRRP；price-change 必带 WoW（第五十三轮起我司也出）；platform-gap 仅我司', () => {
    const alerts = buildAlerts([ownKey, compKey], 0.02, 'usd');
    expect(alerts.length).toBeGreaterThan(0);
    for (const a of alerts) {
      expect(a.key).toBe(`${a.seriesKey}|${a.weekId}|${a.type}`);
      expect(a.weekLabel).toMatch(/^\d{2}-\d{2}$/);
      if (a.type === 'promo') {
        expect(a.promoDeltaPp).not.toBeNull();
        expect(Math.abs(a.promoDeltaPp!)).toBeGreaterThanOrEqual(2 - 1e-6); // 阈值 2% = 2pp
        if (a.vsRrpPct != null && a.price != null && a.rrp) {
          expect(a.vsRrpPct).toBeCloseTo(a.price / a.rrp - 1, 6);
        }
      } else if (a.type === 'price-change') {
        expect(a.wowPct).not.toBeNull();
        expect(Math.abs(a.wowPct!)).toBeGreaterThanOrEqual(0.02 - 1e-6);
      } else {
        // 平台价差：仅我司品牌系列；价差 ≥ 阈值；高低平台齐全且价差自洽
        expect(alertSeriesMeta(a.seriesKey)!.isOwn).toBe(true);
        expect(a.gapPct).not.toBeNull();
        expect(a.gapPct!).toBeGreaterThanOrEqual(0.02 - 1e-6);
        expect(a.gapHighPlatform).not.toBeNull();
        expect(a.gapLowPlatform).not.toBeNull();
        expect(a.gapHighPrice!).toBeGreaterThan(a.gapLowPrice!);
        expect(a.gapHighPrice! / a.gapLowPrice! - 1).toBeCloseTo(a.gapPct!, 3);
      }
    }
  });

  it('平台价差 demo 口径：demo 因子价差上限 ~1.8% → 2% 阈值恒不触发、1.5% 有触发（M.Video 高 / OZON 低）', () => {
    const at2 = buildAlerts([ownKey], 0.02, 'usd').filter((a) => a.type === 'platform-gap');
    expect(at2.length).toBe(0);
    const at15 = buildAlerts([ownKey], 0.015, 'usd').filter((a) => a.type === 'platform-gap');
    expect(at15.length).toBeGreaterThan(0);
    for (const a of at15) {
      expect(a.gapLowPlatform).toBe('OZON'); // OZON = 基准恒最低（因子均 ≥ 0）
      expect(a.gapHighPlatform).toBe('M.Video'); // +1.5% > DNS +0.8%（抖动 ±0.3% 不改序）
    }
  });

  it('阈值单调：严阈值(15%)预警集 ⊆ 宽阈值(5%)预警集（全集订阅，两侧均非空）', () => {
    const keys = [...new Set(dimProduct.map((p) => seriesKeyOfSku(p.sku_id)))];
    const wide = new Set(buildAlerts(keys, 0.05).map((a: AlertItem) => a.key));
    const strict = buildAlerts(keys, 0.15).map((a) => a.key);
    expect(strict.length).toBeGreaterThan(0);
    for (const k of strict) expect(wide.has(k)).toBe(true);
  });

  it('币种只改展示价：触发集一致、价格按币种折算', () => {
    const usd = buildAlerts([compKey], 0.05, 'usd');
    const rub = buildAlerts([compKey], 0.05, 'local');
    expect(usd.map((a) => a.key)).toEqual(rub.map((a) => a.key));
    if (usd.length > 0) {
      expect(rub[0].price!).toBeGreaterThan(usd[0].price!); // ₽ ≈ 80×$
    }
  });

  it('排序：最新周在前（周 id 降序）', () => {
    const alerts = buildAlerts([ownKey, compKey], 0.02);
    for (let i = 1; i < alerts.length; i++) {
      expect(alerts[i - 1].weekId >= alerts[i].weekId).toBe(true);
    }
  });

  it('demo 数据在 5% 阈值下有真实预警可看（批次 2026-W41 锚：全 36 系列 910 条 = 降促 441 + 调价 469；调价含我司扩围 +64）', () => {
    const keys = [...new Set(dimProduct.map((p) => seriesKeyOfSku(p.sku_id)))];
    const alerts = buildAlerts(keys, 0.05);
    expect(alerts.length).toBe(910);
    expect(alerts.filter((a) => a.type === 'promo').length).toBe(441);
    expect(alerts.filter((a) => a.type === 'price-change').length).toBe(469);
    expect(alerts.filter((a) => a.type === 'platform-gap').length).toBe(0); // 5% 下平台价差不触发（上限 ~1.8%）
  });

  it('demo 数据在 1.5% 默认阈值下三类齐发（第五十三轮默认档锚：全 36 系列 2898 条 = 降促 1059 + 调价 1086 + 平台价差 753）', () => {
    const keys = [...new Set(dimProduct.map((p) => seriesKeyOfSku(p.sku_id)))];
    const alerts = buildAlerts(keys, 0.015);
    expect(alerts.length).toBe(2898);
    expect(alerts.filter((a) => a.type === 'promo').length).toBe(1059);
    expect(alerts.filter((a) => a.type === 'price-change').length).toBe(1086);
    expect(alerts.filter((a) => a.type === 'platform-gap').length).toBe(753);
  });
});
