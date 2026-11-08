import { describe, expect, it } from 'vitest';
import { buildConfigTemplateXlsx, parseConfigWorkbook } from '../configTemplate';

describe('config workbook template', () => {
  it('builds a workbook with all configuration sheets', () => {
    const bytes = buildConfigTemplateXlsx();
    expect(bytes.byteLength).toBeGreaterThan(500);
    const snapshot = parseConfigWorkbook(bytes);
    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.keys).toMatchObject({ benchmark: [], prevGen: {}, defaultShop: {}, anomalyRule: { enabled: false, thresholdPct: 50 }, anomalyMarks: [], marketRules: [], fx: null });
  });
});
