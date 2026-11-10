// ============================================================
// 配置表模板（XLSX）
//
// 这里使用项目已有的 fflate 生成和读取最小 OOXML 工作簿，避免把配置导入
// 绑定到第三方表格组件。模板与现有 JSON 快照共用同一套字段语义，导入前仍
// 由 configImportExport.ts 做完整校验，因此表格不会绕过现有的配置边界。
// ============================================================
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { ConfigSnapshotV1, MarketDataRuleConfig } from './configImportExport';

export const CONFIG_TEMPLATE_SHEETS = [
  '说明',
  '市场采集规则',
  '默认店铺',
  '产品默认店铺',
  '竞品对标',
  '上一代关系',
  '异常规则',
  '人工裁定',
] as const;

type SheetName = (typeof CONFIG_TEMPLATE_SHEETS)[number];
type CellValue = string | number | boolean | null | undefined;

interface SheetData {
  name: SheetName;
  rows: CellValue[][];
  widths?: number[];
}

const SHEET_DEFINITIONS: SheetData[] = [
  {
    name: '说明',
    widths: [22, 76],
    rows: [
      ['PriceLens 配置表模板', '请在对应页签填写配置后保存为 .xlsx，再从“配置”页点击“导入配置表”。'],
      ['适用版本', 'schemaVersion 1。导入时会全量校验，任何一行字段不合法都会拒绝整份文件。'],
      ['填写原则', '列名不要修改。每个页签的第 1 行是字段名。空白行会被忽略。不要合并单元格。'],
      ['默认店铺', '每个国家最多保留一行。channel_id 必须来自当前数据中的渠道维表，例如 RU:dns:独立站。'],
      ['产品默认店铺', '可按国家 × 我司型号覆盖国家默认店铺。键由系统保存为 country_code::own_model_id，同一产品最多一行。'],
      ['竞品对标', '一行表示一个“国家 × 我司型号 × 配置 × 竞品”关系。source 只允许 matrix、substitute、manual、auto。'],
      ['上一代关系', 'model_id 和 previous_model_id 填产品主数据中的型号 id。previous_model_id 留空表示清除该型号的人工关系。'],
      ['异常规则', '只填写一行。enabled 使用 TRUE 或 FALSE，threshold_pct 使用 10–90 的整数。'],
      ['人工裁定', 'action 只允许 exempt 或 isolate。ts 使用毫秒时间戳，label、price、wow 可留空。'],
      ['市场采集规则', '按国家维护来源类型、时间粒度、固定平台、分期期数和买断/无价格是否参与。ZA 规则由系统门禁保护，未发布事实不会进入运行时。'],
      ['证据与口径', '配置表只维护规则和关系，不写入价格事实。真实、演示、混合数据状态仍由系统数据层展示。'],
      ['恢复默认', '要清除全部人工配置，请在对应页签删除数据行，再导入配置表。异常规则删除整行会恢复关闭和默认阈值。'],
    ],
  },
  {
    name: '市场采集规则',
    widths: [16, 30, 14, 22, 18, 18, 18, 12, 48],
    rows: [['country_code', 'source_kind', 'granularity', 'fixed_platform', 'financing_terms（24,36）', 'include_prepaid', 'include_no_price', 'enabled', 'note']],
  },
  {
    name: '默认店铺',
    widths: [18, 20, 28, 24, 14, 40],
    rows: [['country_code', 'platform', 'channel_id', 'channel_name（只读参考）', 'enabled', 'note']],
  },
  {
    name: '产品默认店铺',
    widths: [18, 26, 20, 28, 14, 40],
    rows: [['country_code', 'own_model_id', 'channel_id', 'channel_name（只读参考）', 'enabled', 'note']],
  },
  {
    name: '竞品对标',
    widths: [18, 24, 22, 24, 12, 14, 40],
    rows: [['country_code', 'own_model_id', 'own_romram', 'competitor_sku_id', 'sort', 'source', 'note']],
  },
  {
    name: '上一代关系',
    widths: [26, 30, 40],
    rows: [['model_id', 'previous_model_id', 'note']],
  },
  {
    name: '异常规则',
    widths: [18, 20, 60],
    rows: [['enabled', 'threshold_pct', 'note'], [false, 50, '默认关闭。开启后按相邻有效价格点变化幅度判定异常。']],
  },
  {
    name: '人工裁定',
    widths: [18, 34, 18, 14, 16, 34, 16, 16, 16, 24],
    rows: [['countryCode', 'seriesKey', 'bucketId', 'action', 'granularity', 'label', 'price', 'wow', 'ts', 'note']],
  },
];

const XML_ESCAPE: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };
const escapeXml = (value: string): string => value.replace(/[&<>"']/g, (char) => XML_ESCAPE[char]);

function columnName(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const remainder = (n - 1) % 26;
    out = String.fromCharCode(65 + remainder) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function cellXml(value: CellValue, rowIndex: number, columnIndex: number): string {
  if (value == null || value === '') return '';
  const ref = `${columnName(columnIndex)}${rowIndex + 1}`;
  if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}" s="1"><v>${value}</v></c>`;
  if (typeof value === 'boolean') return `<c r="${ref}" t="b" s="1"><v>${value ? 1 : 0}</v></c>`;
  return `<c r="${ref}" t="inlineStr" s="${rowIndex === 0 ? 2 : 0}"><is><t xml:space="preserve">${escapeXml(String(value))}</t></is></c>`;
}

function worksheetXml(sheet: SheetData): string {
  const rows = sheet.rows
    .map((row, rowIndex) => {
      const cells = row.map((value, columnIndex) => cellXml(value, rowIndex, columnIndex)).join('');
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join('');
  const cols = sheet.widths?.length
    ? `<cols>${sheet.widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('')}</cols>`
    : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${rows}</sheetData></worksheet>`;
}

function workbookXml(): string {
  const sheets = CONFIG_TEMPLATE_SHEETS.map((name, index) => `<sheet name="${escapeXml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${sheets}</sheets></workbook>`;
}

function workbookRelsXml(): string {
  const rels = CONFIG_TEMPLATE_SHEETS.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}<Relationship Id="rId${CONFIG_TEMPLATE_SHEETS.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
}

function contentTypesXml(): string {
  const overrides = CONFIG_TEMPLATE_SHEETS.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${overrides}</Types>`;
}

function stylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="0"/><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><name val="Arial"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="0" borderId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
}

/** 生成可下载的配置表模板。返回值可直接传给 Blob。 */
export function buildConfigTemplateXlsx(): Uint8Array {
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(contentTypesXml()),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    'xl/workbook.xml': strToU8(workbookXml()),
    'xl/_rels/workbook.xml.rels': strToU8(workbookRelsXml()),
    'xl/styles.xml': strToU8(stylesXml()),
  };
  for (const [index, sheet] of SHEET_DEFINITIONS.entries()) files[`xl/worksheets/sheet${index + 1}.xml`] = strToU8(worksheetXml(sheet));
  return zipSync(files, { level: 6 });
}



/**
 * 把当前配置快照填进与模板同构的工作簿（2026-11-10：导出配置 = xlsx，与导入
 * 同一份表结构，Excel 直接可编辑后再导回）。fx 为只读历史键，不进配置表
 * （与模板口径一致）。marketRules 为 null 时导出仅含表头（导入后 = 无自定义规则）。
 */
export function exportConfigWorkbookXlsx(snapshot: ConfigSnapshotV1): Uint8Array {
  const keys = snapshot.keys;
  const rowsFor: Record<SheetName, CellValue[][]> = {
    说明: SHEET_DEFINITIONS[0].rows,
    市场采集规则: [
      SHEET_DEFINITIONS[1].rows[0],
      ...(keys.marketRules ?? []).map((rule) => [
        rule.countryCode, rule.sourceKind, rule.granularity, rule.fixedPlatform ?? '',
        rule.financingTerms.join(','), rule.includePrepaid, rule.includeNoPrice, rule.enabled, rule.note ?? '',
      ] as CellValue[]),
    ],
    默认店铺: [
      SHEET_DEFINITIONS[2].rows[0],
      ...Object.entries(keys.defaultShop ?? {})
        .filter(([storeKey]) => !storeKey.includes('::'))
        .map(([country, channel]) => {
          const segments = channel.split(':');
          return [country, segments[1] ?? '', channel, '', true, ''] as CellValue[];
        }),
    ],
    产品默认店铺: [
      SHEET_DEFINITIONS[3].rows[0],
      ...Object.entries(keys.defaultShop ?? {})
        .filter(([storeKey]) => storeKey.includes('::'))
        .map(([storeKey, channel]) => {
          const [country, model] = storeKey.split('::');
          const segments = channel.split(':');
          return [country, model, channel, '', true, ''] as CellValue[];
        }),
    ],
    竞品对标: [
      SHEET_DEFINITIONS[4].rows[0],
      ...(keys.benchmark ?? []).map((row) => [
        row.country_code, row.own_model_id, row.own_romram, row.competitor_sku_id,
        row.sort, row.source, row.note ?? '',
      ] as CellValue[]),
    ],
    上一代关系: [
      SHEET_DEFINITIONS[5].rows[0],
      ...Object.entries(keys.prevGen ?? {}).map(([model, previous]) => [model, previous ?? '', ''] as CellValue[]),
    ],
    异常规则: [
      SHEET_DEFINITIONS[6].rows[0],
      ...(keys.anomalyRule ? [[keys.anomalyRule.enabled, keys.anomalyRule.thresholdPct, ''] as CellValue[]] : []),
    ],
    人工裁定: [
      SHEET_DEFINITIONS[7].rows[0],
      ...(keys.anomalyMarks ?? []).map((mark) => [
        mark.countryCode, mark.seriesKey, mark.bucketId, mark.action,
        mark.granularity ?? '', mark.label, mark.price ?? '', mark.wow ?? '', mark.ts, '',
      ] as CellValue[]),
    ],
  };
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(contentTypesXml()),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    'xl/workbook.xml': strToU8(workbookXml()),
    'xl/_rels/workbook.xml.rels': strToU8(workbookRelsXml()),
    'xl/styles.xml': strToU8(stylesXml()),
  };
  for (const sheet of SHEET_DEFINITIONS) {
    const rows = rowsFor[sheet.name];
    files[`xl/worksheets/sheet${SHEET_DEFINITIONS.indexOf(sheet) + 1}.xml`] = strToU8(worksheetXml({ name: sheet.name, rows, widths: sheet.widths }));
  }
  return zipSync(files, { level: 6 });
}

export function configExportFileName(now = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `pricelens-config-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}.xlsx`;
}

export function configTemplateFileName(now = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `pricelens-config-template-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}.xlsx`;
}

function unescapeXml(value: string): string {
  return value.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function attributeOf(attributes: string, name: string): string | null {
  const match = attributes.match(new RegExp(`${name}="([^"]*)"`));
  return match ? unescapeXml(match[1]) : null;
}

function textOf(xml: string): string {
  return Array.from(xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)).map((match) => unescapeXml(match[1])).join('');
}

function decodeCell(attributes: string, body: string, sharedStrings: string[]): CellValue {
  const type = attributeOf(attributes, 't');
  if (type === 'inlineStr') return textOf(body);
  const value = body.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/)?.[1] ?? '';
  if (type === 's') return sharedStrings[Number(value)] ?? '';
  if (type === 'b') return value === '1';
  if (value === '') return '';
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : value;
}

function columnIndexFromRef(reference: string): number {
  const letters = reference.match(/^[A-Z]+/i)?.[0].toUpperCase() ?? 'A';
  let result = 0;
  for (const letter of letters) result = result * 26 + letter.charCodeAt(0) - 64;
  return result - 1;
}

function parseSheet(xml: string, sharedStrings: string[]): CellValue[][] {
  const rows: CellValue[][] = [];
  for (const rowMatch of xml.matchAll(/<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g)) {
    const cells: CellValue[] = [];
    for (const cellMatch of rowMatch[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)) {
      const index = columnIndexFromRef(attributeOf(cellMatch[1], 'r') ?? 'A1');
      cells[index] = decodeCell(cellMatch[1], cellMatch[2], sharedStrings);
    }
    rows.push(cells.map((value) => value ?? ''));
  }
  return rows;
}

function rowsByHeader(rows: CellValue[][]): Array<Record<string, CellValue>> {
  const headerIndex = rows.findIndex((row) => row.some((cell) => String(cell ?? '').trim() !== ''));
  if (headerIndex < 0) return [];
  const headers = rows[headerIndex].map((cell) => String(cell ?? '').trim());
  return rows.slice(headerIndex + 1).flatMap((row) => {
    if (!row.some((cell) => String(cell ?? '').trim() !== '')) return [];
    const record: Record<string, CellValue> = {};
    headers.forEach((header, index) => { if (header) record[header] = row[index] ?? ''; });
    return [record];
  });
}

function get(record: Record<string, CellValue>, ...names: string[]): CellValue {
  for (const name of names) if (Object.prototype.hasOwnProperty.call(record, name)) return record[name];
  return '';
}

function textValue(value: CellValue): string {
  return String(value ?? '').trim();
}

function nullableText(value: CellValue): string | null {
  const text = textValue(value);
  return text ? text : null;
}

function numberValue(value: CellValue): number | null {
  if (value === '' || value == null) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sheetByName(files: Record<string, Uint8Array>, name: string, sharedStrings: string[]): CellValue[][] {
  const workbook = strFromU8(files['xl/workbook.xml'] ?? new Uint8Array());
  const rels = strFromU8(files['xl/_rels/workbook.xml.rels'] ?? new Uint8Array());
  const targetById = new Map<string, string>();
  for (const rel of rels.matchAll(/<Relationship\s+([^>]+?)\s*\/?>/g)) {
    const id = attributeOf(rel[1], 'Id');
    const target = attributeOf(rel[1], 'Target');
    if (id && target) targetById.set(id, target.startsWith('/') ? target.slice(1) : `xl/${target}`);
  }
  const sheet = Array.from(workbook.matchAll(/<sheet\s+([^>]+?)\s*\/?>/g)).find((match) => attributeOf(match[1], 'name') === name);
  const target = sheet ? targetById.get(attributeOf(sheet[1], 'r:id') ?? '') : undefined;
  return target && files[target] ? parseSheet(strFromU8(files[target]), sharedStrings) : [];
}

function sharedStringsOf(files: Record<string, Uint8Array>): string[] {
  const xml = files['xl/sharedStrings.xml'];
  if (!xml) return [];
  return Array.from(strFromU8(xml).matchAll(/<si>([\s\S]*?)<\/si>/g)).map((match) => textOf(match[1]));
}

/**
 * 把配置表转换成现有配置快照的原始结构。调用方应继续执行
 * validateImportPayload，保证导入与 JSON 快照拥有相同的严格校验。
 */
export function parseConfigWorkbook(buffer: ArrayBuffer | Uint8Array): ConfigSnapshotV1 {
  const files = unzipSync(buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer));
  if (!files['xl/workbook.xml'] || !files['xl/_rels/workbook.xml.rels']) {
    throw new Error('不是合法的 PriceLens 配置表（缺少工作簿结构）');
  }
  const sharedStrings = sharedStringsOf(files);
  const marketRuleRows = rowsByHeader(sheetByName(files, '市场采集规则', sharedStrings));
  const defaultShopRows = rowsByHeader(sheetByName(files, '默认店铺', sharedStrings));
  const productShopRows = rowsByHeader(sheetByName(files, '产品默认店铺', sharedStrings));
  const benchmarkRows = rowsByHeader(sheetByName(files, '竞品对标', sharedStrings));
  const prevGenRows = rowsByHeader(sheetByName(files, '上一代关系', sharedStrings));
  const anomalyRuleRows = rowsByHeader(sheetByName(files, '异常规则', sharedStrings));
  const markRows = rowsByHeader(sheetByName(files, '人工裁定', sharedStrings));

  const marketRules: MarketDataRuleConfig[] = marketRuleRows.map((row) => {
    const terms = textValue(get(row, 'financing_terms（24,36）', 'financing_terms', '分期期数'))
      .split(/[,，\s]+/)
      .filter(Boolean)
      .map(Number)
      .filter((term): term is 24 | 36 => term === 24 || term === 36);
    const bool = (value: CellValue): boolean => ['true', '1', 'yes', '是', '开启'].includes(textValue(value).toLowerCase());
    return {
      countryCode: textValue(get(row, 'country_code', '国家码')),
      sourceKind: textValue(get(row, 'source_kind', '来源类型')) as MarketDataRuleConfig['sourceKind'],
      granularity: textValue(get(row, 'granularity', '时间粒度')) as MarketDataRuleConfig['granularity'],
      fixedPlatform: nullableText(get(row, 'fixed_platform', '固定平台')),
      financingTerms: [...new Set(terms)],
      includePrepaid: bool(get(row, 'include_prepaid', '允许买断')),
      includeNoPrice: bool(get(row, 'include_no_price', '允许无价格')),
      enabled: bool(get(row, 'enabled', '启用')),
      note: nullableText(get(row, 'note', '备注')),
    };
  }).filter((rule) => rule.countryCode);

  const defaultShop: Record<string, string> = {};
  for (const row of defaultShopRows) {
    const country = textValue(get(row, 'country_code', '国家码'));
    const channel = textValue(get(row, 'channel_id', '渠道 id', '渠道ID'));
    if (country && channel && textValue(get(row, 'enabled', '启用')).toLowerCase() !== 'false') defaultShop[country] = channel;
  }
  for (const row of productShopRows) {
    const country = textValue(get(row, 'country_code', '国家码'));
    const model = textValue(get(row, 'own_model_id', '我司型号 id', '我司型号ID'));
    const channel = textValue(get(row, 'channel_id', '渠道 id', '渠道ID'));
    if (country && model && channel && textValue(get(row, 'enabled', '启用')).toLowerCase() !== 'false') {
      defaultShop[`${country}::${model}`] = channel;
    }
  }
  const benchmark = benchmarkRows.map((row) => ({
    country_code: textValue(get(row, 'country_code', '国家码')),
    own_model_id: textValue(get(row, 'own_model_id', '我司型号 id', '我司型号ID')),
    own_romram: textValue(get(row, 'own_romram', 'own_romram（配置）', '配置')),
    competitor_sku_id: textValue(get(row, 'competitor_sku_id', '竞品 sku id', '竞品SKU')),
    sort: numberValue(get(row, 'sort', '排序')) ?? 0,
    source: textValue(get(row, 'source', '来源')) as 'matrix' | 'substitute' | 'manual' | 'auto',
    note: nullableText(get(row, 'note', '备注')) ?? undefined,
  }));
  const prevGen: Record<string, string | null> = {};
  for (const row of prevGenRows) {
    const model = textValue(get(row, 'model_id', '型号 id', '型号ID'));
    if (model) prevGen[model] = nullableText(get(row, 'previous_model_id', '上一代型号 id', '上一代型号ID'));
  }
  const firstRule = anomalyRuleRows[0];
  const anomalyRule = firstRule
    ? { enabled: ['true', '1', 'yes', '是', '开启'].includes(textValue(get(firstRule, 'enabled', '启用')).toLowerCase()), thresholdPct: numberValue(get(firstRule, 'threshold_pct', '阈值', 'thresholdPct')) ?? 50 }
    : null;
  const anomalyMarks = markRows.map((row) => ({
    countryCode: textValue(get(row, 'countryCode', 'country_code', '国家码')),
    seriesKey: textValue(get(row, 'seriesKey', 'series_key', '系列 key')),
    bucketId: textValue(get(row, 'bucketId', 'bucket_id', '时间桶')),
    action: textValue(get(row, 'action', '动作')) as 'exempt' | 'isolate',
    granularity: (nullableText(get(row, 'granularity', '粒度')) as 'week' | 'month' | 'quarter' | null) ?? undefined,
    label: textValue(get(row, 'label', '产品名')),
    price: numberValue(get(row, 'price', '价格')),
    wow: numberValue(get(row, 'wow', '环比')),
    ts: numberValue(get(row, 'ts', '时间戳')) ?? Date.now(),
  }));
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    appChannel: 'stable',
    keys: {
      benchmark,
      prevGen,
      defaultShop,
      anomalyRule,
      anomalyMarks,
      marketRules,
      fx: null,
    },
  };
}
