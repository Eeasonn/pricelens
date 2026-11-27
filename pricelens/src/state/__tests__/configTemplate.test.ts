import { describe, expect, it } from 'vitest';
// @ts-ignore 测试运行时读二进制资产（仓库未装 @types/node；仅 vitest 使用）
import { readFileSync } from 'node:fs';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { CONFIG_TEMPLATE_SHEETS, buildConfigTemplateXlsx, exportConfigWorkbookXlsx, parseConfigWorkbook } from '../configTemplate';
import { validateImportPayload } from '../configImportExport';

/** 工作簿页签名（按 workbook.xml 顺序） */
const sheetNamesOf = (bytes: Uint8Array): string[] =>
  Array.from(strFromU8(unzipSync(bytes)['xl/workbook.xml'] ?? new Uint8Array()).matchAll(/<sheet\s+([^>]+?)\s*\/?>/g))
    .map((match) => match[1]!.match(/(?:^|\s)name="([^"]*)"/)?.[1] ?? '');

/** 模拟退场前导出的旧工作簿：在现有导出产物上补一页「上一代关系」（含数据行）。
 *  sheetId / rId / 部件名都排在现有页签与 styles 关系之后，不与任何既有部件冲突。 */
function withLegacyPrevGenSheet(bytes: Uint8Array, rows: string[][]): Uint8Array {
  const files = unzipSync(bytes) as Record<string, Uint8Array>;
  const sheetCount = sheetNamesOf(bytes).length;
  const sheetId = sheetCount + 1; // styles 占 rId{sheetCount+1}
  const rid = `rId${sheetCount + 2}`;
  const part = `xl/worksheets/sheet${sheetId}.xml`;
  const cell = (ref: string, text: string): string => `<c r="${ref}" t="inlineStr"><is><t>${text}</t></is></c>`;
  const col = (index: number): string => String.fromCharCode(65 + index);
  files[part] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${
      rows.map((row, r) => `<row r="${r + 1}">${row.map((value, c) => cell(`${col(c)}${r + 1}`, value)).join('')}</row>`).join('')
    }</sheetData></worksheet>`,
  );
  const patch = (path: string, closing: string, addition: string): void => {
    const xml = strFromU8(files[path]!);
    if (!xml.includes(closing)) throw new Error(`${path} 结构不符，无法注入旧页签`);
    files[path] = strToU8(xml.replace(closing, `${addition}${closing}`));
  };
  patch('xl/workbook.xml', '</sheets>', `<sheet name="上一代关系" sheetId="${sheetId}" r:id="${rid}"/>`);
  patch('xl/_rels/workbook.xml.rels', '</Relationships>',
    `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${sheetId}.xml"/>`);
  patch('[Content_Types].xml', '</Types>',
    `<Override PartName="/${part}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`);
  return zipSync(files);
}

describe('config workbook template', () => {
  it('builds a workbook with all configuration sheets', () => {
    const bytes = buildConfigTemplateXlsx();
    expect(bytes.byteLength).toBeGreaterThan(500);
    const snapshot = parseConfigWorkbook(bytes);
    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.keys).toMatchObject({ benchmark: [], defaultShop: {}, anomalyRule: { enabled: false, thresholdPct: 50 }, anomalyMarks: [], marketRules: [], fx: null });
  });

  it('页签清单（2026-11-27「上一代关系」退役）：模板不再带该页签，解析结果也不再产出 prevGen', () => {
    const bytes = buildConfigTemplateXlsx();
    const names = sheetNamesOf(bytes);
    expect(names).toEqual([...CONFIG_TEMPLATE_SHEETS]);
    expect(names).toHaveLength(16);
    expect(names).not.toContain('上一代关系');
    expect(parseConfigWorkbook(bytes).keys).not.toHaveProperty('prevGen');
  });
});


const snapshotBase = () => ({
    schemaVersion: 1 as const,
    exportedAt: '2026-11-10T00:00:00.000Z',
    appChannel: 'stable' as const,
    keys: {
      benchmark: [
        { country_code: 'RU', own_model_id: 'own-huawei-watch-ultimate-2', own_romram: '46mm', competitor_sku_id: 'cmp-apple-watch-ultra-4__46mm__ti', sort: 1, source: 'matrix' as const, note: '含逗号, 备注' },
        { country_code: 'RU', own_model_id: 'own-huawei-watch-ultimate-2', own_romram: '46mm', competitor_sku_id: 'cmp-garmin-fenix-8-pro__47mm__black', sort: 2, source: 'matrix' as const, note: undefined },
      ],
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
  });

describe('exportConfigWorkbookXlsx（2026-11-10 导出配置 = xlsx）', () => {
  it('导出 → 解析 → 严格校验通过，且各分区字段逐一还原', () => {
    const bytes = exportConfigWorkbookXlsx(snapshotBase());
    const parsed = parseConfigWorkbook(bytes);
    const result = validateImportPayload(parsed);
    expect(result.ok).toBe(true);
    expect(parsed.keys.benchmark).toEqual([
      { country_code: 'RU', own_model_id: 'own-huawei-watch-ultimate-2', own_romram: '46mm', competitor_sku_id: 'cmp-apple-watch-ultra-4__46mm__ti', sort: 1, source: 'matrix' as const, note: '含逗号, 备注' },
      { country_code: 'RU', own_model_id: 'own-huawei-watch-ultimate-2', own_romram: '46mm', competitor_sku_id: 'cmp-garmin-fenix-8-pro__47mm__black', sort: 2, source: 'matrix' as const, note: undefined },
    ]);
    // 「上一代关系」页签已退役（2026-11-27）：导出不再带这一页，解析结果也没有 prevGen
    expect(sheetNamesOf(bytes)).not.toContain('上一代关系');
    expect(parsed.keys).not.toHaveProperty('prevGen');
    expect(parsed.keys.defaultShop).toEqual({ RU: 'RU:dns:独立站', 'RU::own-huawei-mate-x7': 'RU:ozon:3P' });
    expect(parsed.keys.anomalyRule).toEqual({ enabled: true, thresholdPct: 12 });
    expect(parsed.keys.anomalyMarks).toHaveLength(1);
    expect(parsed.keys.anomalyMarks?.[0]).toMatchObject({ countryCode: 'RU', action: 'exempt', granularity: 'week', price: 1098.49, ts: 1731129600000 });
    expect(parsed.keys.marketRules).toEqual(snapshotBase().keys.marketRules);
    // —— 2026-11-18 配置表化五页签 round-trip ——
    expect(parsed.keys.seriesRules).toEqual(snapshotBase().keys.seriesRules);
    expect(parsed.keys.modelAliases).toEqual(snapshotBase().keys.modelAliases);
    expect(parsed.keys.benchmarkMatrix).toEqual(snapshotBase().keys.benchmarkMatrix);
    expect(parsed.keys.tierLadders).toEqual({ phone: [200, 400, 800], tablet: [150, 500] });
    expect(parsed.keys.promoRows).toEqual([
      expect.objectContaining({ country_code: 'RU', promo_name: '双11', depth_hint: '深', platforms: ['OZON', 'DNS'] }),
      expect.objectContaining({ country_code: 'SA', promo_name: '白五', depth_hint: '中', platforms: null }),
    ]);
  });

  it('校验拒绝坏行：正则无效 / 阶梯非正数 / 日期倒挂（整份拒绝）', () => {
    const base = parseConfigWorkbook(exportConfigWorkbookXlsx(snapshotBase()));
    const withKeys = (keys: Record<string, unknown>): unknown => ({ ...base, keys: { ...base.keys, ...keys } });
    expect(validateImportPayload(withKeys({ seriesRules: [{ brand: 'X', pattern: 're:[', series: 'Y' }] })).ok).toBe(false);
    expect(validateImportPayload(withKeys({ tierLadders: { phone: [200, -1] } })).ok).toBe(false);
    expect(validateImportPayload(withKeys({ promoRows: [{ country_code: 'RU', promo_name: 'X', start_date: '2026-12-01', end_date: '2026-11-01', depth_hint: '深', platforms: null, channel_raw: '' }] })).ok).toBe(false);
  });

  it('空快照：各分区仅表头 → 与模板解析语义一致（恢复默认）', () => {
    const bytes = exportConfigWorkbookXlsx({ ...snapshotBase(), keys: { benchmark: [], defaultShop: {}, anomalyRule: null, anomalyMarks: [], marketRules: null, fx: null } });
    const parsed = parseConfigWorkbook(bytes);
    expect(validateImportPayload(parsed).ok).toBe(true);
    expect(parsed.keys).toMatchObject({ benchmark: [], defaultShop: {}, anomalyRule: null, anomalyMarks: [], marketRules: [], fx: null });
  });

  it('导入旧工作簿（退场前导出、带「上一代关系」页签与数据行）不报错：该页签被忽略，其余页签照常还原', () => {
    // 上一代关系的权威来源已迁到服务器端配置表 config_tables.xlsx「上一代配置」页签；
    // 旧工作簿里的这一页不读、不校验、不报错，也不让其余配置跟着失败
    const legacy = withLegacyPrevGenSheet(exportConfigWorkbookXlsx(snapshotBase()), [
      ['model_id', 'previous_model_id', 'note'],
      ['own-huawei-nova-16s', 'own-huawei-nova-15', ''],
      ['own-huawei-mate-80-pro', '', '置空'],
    ]);
    expect(sheetNamesOf(legacy)).toContain('上一代关系');
    const parsed = parseConfigWorkbook(legacy);
    expect(parsed.keys).not.toHaveProperty('prevGen');
    expect(parsed.keys.benchmark).toHaveLength(2);
    expect(parsed.keys.defaultShop).toEqual({ RU: 'RU:dns:独立站', 'RU::own-huawei-mate-x7': 'RU:ozon:3P' });
    expect(parsed.keys.anomalyRule).toEqual({ enabled: true, thresholdPct: 12 });
    expect(parsed.keys.seriesRules).toEqual(snapshotBase().keys.seriesRules);
    expect(validateImportPayload(parsed).ok).toBe(true);
  });

  it('2026-11-18 审计 P1-3/P2-5：带空格平台名不被切碎；矩阵空国家码解析为 null 通配', () => {
    const bytes = exportConfigWorkbookXlsx({
      ...snapshotBase(),
      keys: {
        ...snapshotBase().keys,
        promoRows: [
          { promo_id: 'MX-BuenFin-MX-2026-11-20', country_code: 'MX', promo_name: 'Buen Fin', start_date: '2026-11-20', end_date: '2026-11-23', depth_hint: '深' as const, platforms: ['Mercado Libre', 'Amazon'], channel_raw: 'Mercado Libre,Amazon' },
        ],
        benchmarkMatrix: [
          { country_code: null, own_model_id: 'own-huawei-mate-80-pro', own_romram: '12+512 GB', competitor_sku_id: 'cmp-x', sort: 0, source: 'matrix' as const },
        ],
      },
    });
    const parsed = parseConfigWorkbook(bytes);
    const result = validateImportPayload(parsed);
    expect(result.ok).toBe(true);
    // 只按逗号切分：'Mercado Libre' 保持整名（旧实现按空格切碎 → 档期带静默消失）
    expect(parsed.keys.promoRows?.[0]).toMatchObject({ platforms: ['Mercado Libre', 'Amazon'] });
    // 空国家码单元格 → null 通配（旧实现空串 = 永不匹配任何国家的死行）
    expect(parsed.keys.benchmarkMatrix?.[0]).toMatchObject({ country_code: null });
  });
});

describe('C3 字典四页签 + openpyxl 预填表 round-trip（2026-11-18 显性化）', () => {
  it('字典四页签导出 → 解析 → 校验全链（空 = null 出厂默认语义）', () => {
    const bytes = exportConfigWorkbookXlsx({
      ...snapshotBase(),
      keys: {
        ...snapshotBase().keys,
        countryAliases: { 土耳朵: 'TR', turkiye: 'TR' },
        platformAliases: { 某平台: 'Mvideo' },
        storeAliases: { 平台型零售商: '1P' },
        industryOfCat: { 手环: 'wearable' },
      },
    } as Parameters<typeof exportConfigWorkbookXlsx>[0]);
    const parsed = parseConfigWorkbook(bytes);
    expect(parsed.keys.countryAliases).toEqual({ 土耳朵: 'TR', turkiye: 'TR' });
    expect(parsed.keys.platformAliases).toEqual({ 某平台: 'Mvideo' });
    expect(parsed.keys.storeAliases).toEqual({ 平台型零售商: '1P' });
    expect(parsed.keys.industryOfCat).toEqual({ 手环: 'wearable' });
    const result = validateImportPayload(parsed);
    expect(result.ok).toBe(true);
  });

  it('值域校验：坏国家码 / 坏店铺类型 / 坏产业 → 整份拒绝并给出行级错误', () => {
    const bad1 = parseConfigWorkbook(exportConfigWorkbookXlsx({
      ...snapshotBase(),
      keys: { ...snapshotBase().keys, countryAliases: { 某国: 'sa' } },
    } as Parameters<typeof exportConfigWorkbookXlsx>[0]));
    expect(validateImportPayload(bad1).ok).toBe(false);
    const bad2 = parseConfigWorkbook(exportConfigWorkbookXlsx({
      ...snapshotBase(),
      keys: { ...snapshotBase().keys, storeAliases: { 官网: '官网' } },
    } as Parameters<typeof exportConfigWorkbookXlsx>[0]));
    expect(validateImportPayload(bad2).ok).toBe(false);
    const bad3 = parseConfigWorkbook(exportConfigWorkbookXlsx({
      ...snapshotBase(),
      keys: { ...snapshotBase().keys, industryOfCat: { 手机: 'phones' } },
    } as Parameters<typeof exportConfigWorkbookXlsx>[0]));
    expect(validateImportPayload(bad3).ok).toBe(false);
  });

  it('openpyxl 预填表（scripts/build_handoff_config.py 产物）可被 fflate 读器解析且计数对齐', () => {
    // 生成的 public/handoff-config.xlsx = 内部交接「必导」文件——此处钉住
    // openpyxl 产物 ↔ 前端最小 OOXML 读器的兼容性与九页签计数
    const bytes = new Uint8Array(readFileSync(new URL('../../../public/handoff-config.xlsx', import.meta.url)));
    const parsed = parseConfigWorkbook(bytes);
    expect(parsed.keys.seriesRules?.length).toBe(133);
    expect(parsed.keys.modelAliases?.length).toBe(1);
    // 对标矩阵行数 = src/data/dim_benchmark.json 行数（2026-11-25 配对规则重述后 950 → 919：
    // 手机/平板每竞品只配 1 个版本，去掉一对多的富余/错位行）
    expect(parsed.keys.benchmarkMatrix?.length).toBe(919);
    expect(parsed.keys.tierLadders && Object.keys(parsed.keys.tierLadders).length).toBe(6);
    expect(parsed.keys.promoRows?.length).toBe(66);
    expect(parsed.keys.countryAliases && Object.keys(parsed.keys.countryAliases).length).toBe(57);
    expect(parsed.keys.platformAliases && Object.keys(parsed.keys.platformAliases).length).toBe(13);
    expect(parsed.keys.storeAliases && Object.keys(parsed.keys.storeAliases).length).toBe(6);
    expect(parsed.keys.industryOfCat && Object.keys(parsed.keys.industryOfCat).length).toBe(16);
    expect(validateImportPayload(parsed).ok).toBe(true);
  });
});
