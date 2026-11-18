import { describe, expect, it } from 'vitest';
import { buildConfigTemplateXlsx, exportConfigWorkbookXlsx, parseConfigWorkbook } from '../configTemplate';
import { validateImportPayload } from '../configImportExport';

describe('config workbook template', () => {
  it('builds a workbook with all configuration sheets', () => {
    const bytes = buildConfigTemplateXlsx();
    expect(bytes.byteLength).toBeGreaterThan(500);
    const snapshot = parseConfigWorkbook(bytes);
    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.keys).toMatchObject({ benchmark: [], prevGen: {}, defaultShop: {}, anomalyRule: { enabled: false, thresholdPct: 50 }, anomalyMarks: [], marketRules: [], fx: null });
  });
});


describe('exportConfigWorkbookXlsx（2026-11-10 导出配置 = xlsx）', () => {
  const snapshot = {
    schemaVersion: 1 as const,
    exportedAt: '2026-11-10T00:00:00.000Z',
    appChannel: 'stable' as const,
    keys: {
      benchmark: [
        { country_code: 'RU', own_model_id: 'own-huawei-watch-ultimate-2', own_romram: '46mm', competitor_sku_id: 'cmp-apple-watch-ultra-4__46mm__ti', sort: 1, source: 'matrix' as const, note: '含逗号, 备注' },
        { country_code: 'RU', own_model_id: 'own-huawei-watch-ultimate-2', own_romram: '46mm', competitor_sku_id: 'cmp-garmin-fenix-8-pro__47mm__black', sort: 2, source: 'matrix' as const, note: undefined },
      ],
      prevGen: { 'own-huawei-nova-16s': 'own-huawei-nova-15', 'own-huawei-mate-80-pro': null },
      defaultShop: { RU: 'RU:dns:独立站', 'RU::own-huawei-mate-x7': 'RU:ozon:3P' },
      anomalyRule: { enabled: true, thresholdPct: 12 },
      anomalyMarks: [
        { countryCode: 'RU', seriesKey: 'own-huawei-pura-90s-pro-max__12+256GB', bucketId: '202645', action: 'exempt' as const, granularity: 'week' as const, label: 'Pura 90s Pro Max 12+256 GB', price: 1098.49, wow: -0.031, ts: 1731129600000 },
      ],
      marketRules: [
        { countryCode: 'ZA', sourceKind: 'operator-booklet-monthly' as const, granularity: 'month' as const, fixedPlatform: 'VODACOM SHOP', financingTerms: [24, 36] as Array<24 | 36>, includePrepaid: true, includeNoPrice: true, enabled: true, note: null },
        { countryCode: 'RU', sourceKind: 'ecommerce-weekly' as const, granularity: 'week' as const, fixedPlatform: null, financingTerms: [], includePrepaid: true, includeNoPrice: false, enabled: true, note: '含,逗号 备注' },
      ],
      fx: null,
      seriesRules: [
        { brand: 'XIAOMI', pattern: '15', series: 'Xiaomi 数字系列' },
        { brand: 'HUAWEI', pattern: 're:^Mate 80', series: 'Mate80 测试线' },
      ],
      modelAliases: [{ brand: 'HUAWEI', from: 'MatePad SE 11', to: 'MatePad SE' }],
      benchmarkMatrix: [
        { country_code: 'RU', own_model_id: 'own-huawei-mate-80-pro', own_romram: '12+512 GB', competitor_sku_id: 'cmp-xiaomi-15__12-256gb__green', sort: 0, source: 'matrix' as const },
      ],
      tierLadders: { phone: [200, 400, 800], tablet: [150, 500] },
      promoRows: [
        { promo_id: 'RU-双11-RU-2026-11-01', country_code: 'RU', promo_name: '双11', start_date: '2026-11-01', end_date: '2026-11-11', depth_hint: '深' as const, platforms: ['OZON', 'DNS'], channel_raw: 'OZON,DNS' },
        { promo_id: 'SA-白五-SA-2026-11-26', country_code: 'SA', promo_name: '白五', start_date: '2026-11-26', end_date: '2026-11-29', depth_hint: '中' as const, platforms: null, channel_raw: '' },
      ],
    },
  };

  it('导出 → 解析 → 严格校验通过，且各分区字段逐一还原', () => {
    const bytes = exportConfigWorkbookXlsx(snapshot);
    const parsed = parseConfigWorkbook(bytes);
    const result = validateImportPayload(parsed);
    expect(result.ok).toBe(true);
    expect(parsed.keys.benchmark).toEqual([
      { country_code: 'RU', own_model_id: 'own-huawei-watch-ultimate-2', own_romram: '46mm', competitor_sku_id: 'cmp-apple-watch-ultra-4__46mm__ti', sort: 1, source: 'matrix' as const, note: '含逗号, 备注' },
      { country_code: 'RU', own_model_id: 'own-huawei-watch-ultimate-2', own_romram: '46mm', competitor_sku_id: 'cmp-garmin-fenix-8-pro__47mm__black', sort: 2, source: 'matrix' as const, note: undefined },
    ]);
    expect(parsed.keys.prevGen).toEqual({ 'own-huawei-nova-16s': 'own-huawei-nova-15', 'own-huawei-mate-80-pro': null });
    expect(parsed.keys.defaultShop).toEqual({ RU: 'RU:dns:独立站', 'RU::own-huawei-mate-x7': 'RU:ozon:3P' });
    expect(parsed.keys.anomalyRule).toEqual({ enabled: true, thresholdPct: 12 });
    expect(parsed.keys.anomalyMarks).toHaveLength(1);
    expect(parsed.keys.anomalyMarks?.[0]).toMatchObject({ countryCode: 'RU', action: 'exempt', granularity: 'week', price: 1098.49, ts: 1731129600000 });
    expect(parsed.keys.marketRules).toEqual(snapshot.keys.marketRules);
    // —— 2026-11-18 配置表化五页签 round-trip ——
    expect(parsed.keys.seriesRules).toEqual(snapshot.keys.seriesRules);
    expect(parsed.keys.modelAliases).toEqual(snapshot.keys.modelAliases);
    expect(parsed.keys.benchmarkMatrix).toEqual(snapshot.keys.benchmarkMatrix);
    expect(parsed.keys.tierLadders).toEqual({ phone: [200, 400, 800], tablet: [150, 500] });
    expect(parsed.keys.promoRows).toEqual([
      expect.objectContaining({ country_code: 'RU', promo_name: '双11', depth_hint: '深', platforms: ['OZON', 'DNS'] }),
      expect.objectContaining({ country_code: 'SA', promo_name: '白五', depth_hint: '中', platforms: null }),
    ]);
  });

  it('校验拒绝坏行：正则无效 / 阶梯非正数 / 日期倒挂（整份拒绝）', () => {
    const base = parseConfigWorkbook(exportConfigWorkbookXlsx(snapshot));
    const withKeys = (keys: Record<string, unknown>): unknown => ({ ...base, keys: { ...base.keys, ...keys } });
    expect(validateImportPayload(withKeys({ seriesRules: [{ brand: 'X', pattern: 're:[', series: 'Y' }] })).ok).toBe(false);
    expect(validateImportPayload(withKeys({ tierLadders: { phone: [200, -1] } })).ok).toBe(false);
    expect(validateImportPayload(withKeys({ promoRows: [{ country_code: 'RU', promo_name: 'X', start_date: '2026-12-01', end_date: '2026-11-01', depth_hint: '深', platforms: null, channel_raw: '' }] })).ok).toBe(false);
  });

  it('空快照：各分区仅表头 → 与模板解析语义一致（恢复默认）', () => {
    const bytes = exportConfigWorkbookXlsx({ ...snapshot, keys: { benchmark: [], prevGen: {}, defaultShop: {}, anomalyRule: null, anomalyMarks: [], marketRules: null, fx: null } });
    const parsed = parseConfigWorkbook(bytes);
    expect(validateImportPayload(parsed).ok).toBe(true);
    expect(parsed.keys).toMatchObject({ benchmark: [], prevGen: {}, defaultShop: {}, anomalyRule: null, anomalyMarks: [], marketRules: [], fx: null });
  });
});
