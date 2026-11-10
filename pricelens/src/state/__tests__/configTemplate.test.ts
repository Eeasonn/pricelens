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
  });

  it('空快照：各分区仅表头 → 与模板解析语义一致（恢复默认）', () => {
    const bytes = exportConfigWorkbookXlsx({ ...snapshot, keys: { benchmark: [], prevGen: {}, defaultShop: {}, anomalyRule: null, anomalyMarks: [], marketRules: null, fx: null } });
    const parsed = parseConfigWorkbook(bytes);
    expect(validateImportPayload(parsed).ok).toBe(true);
    expect(parsed.keys).toMatchObject({ benchmark: [], prevGen: {}, defaultShop: {}, anomalyRule: null, anomalyMarks: [], marketRules: [], fx: null });
  });
});
