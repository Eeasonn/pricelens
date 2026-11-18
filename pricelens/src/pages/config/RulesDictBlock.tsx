// ============================================================
// 配置页「规则与字典」区块（2026-11-18 Eason「所有配置表在前端配置界面呈现」）：
// 九张规则/字典表的当前生效内容只读呈现——系列规则/型号别名/对标矩阵/分档阶梯/
// 大促档期（C1 五页签）+ 国家别名/平台别名/店铺类型别名/品类映射（C3 四页签）。
// 每表标注来源（已导入 N 条 / 未配置·出厂默认）与空表语义；大表分页 + 搜索。
// 编辑主通道仍是 Excel →「导入配置」（批量维护友好、带全量校验）；本块为
// 呈现层（查阅者也可看——只读），行级编辑留作后续迭代。
// ============================================================
import { useMemo, useState } from 'react';
import { Empty, Input, Table, Tabs, Tag } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  readBenchmarkMatrix, readModelAliasRows, readPromoRows, readSeriesRules, readTierLadders,
} from '../../state/deriveConfig';
import {
  readCountryAliases, readIndustryOfCat, readPlatformAliases, readStoreAliases,
} from '../../state/deriveDictionaries';
import { DEFAULT_DICTIONARIES } from '../../dataModel/ingestText';
import { useConfigVersion } from '../../state/configStore';
import { color, fontSize } from '../../theme/tokens';

/** 来源徽章：已导入 N 条（配置态）vs 未配置（出厂默认 / 显性降级语义） */
function SourceTag({ configured, count, fallback }: { configured: boolean; count: number; fallback: string }) {
  return configured ? (
    <Tag color="blue" style={{ margin: 0 }}>已导入 {count.toLocaleString()} 条</Tag>
  ) : (
    <Tag style={{ margin: 0, color: color.mute }}>未配置 · {fallback}</Tag>
  );
}

const hintStyle = { fontSize: fontSize.caption, color: color.mute, marginBottom: 8 } as const;

/** 通用小表（两列映射字典）：columns 由调用方给出，数据全量展示。
 *  2026-11-18 审计：rowKey 首列值（品牌列）大面积重复 → React 重复 key；改
 *  渲染前注入索引键（dataSource 每渲染静态重建，索引稳定且唯一）。 */
function DictTable<T extends Record<string, unknown>>({ rows, columns }: { rows: T[]; columns: ColumnsType<T> }) {
  const keyed = rows.map((r, i) => ({ ...r, __k: i }));
  return (
    <Table
      size="small"
      rowKey="__k"
      columns={columns}
      dataSource={rows}
      pagination={rows.length > 20 ? { pageSize: 20, showSizeChanger: false, hideOnSinglePage: true } : false}
      locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无数据" /> }}
    />
  );
}

/** 大表（对标矩阵）：前端搜索 + 分页 */
function MatrixTable({ rows }: { rows: NonNullable<ReturnType<typeof readBenchmarkMatrix>> }) {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      `${r.country_code ?? ''} ${r.own_model_id} ${r.own_romram} ${r.competitor_sku_id}`.toLowerCase().includes(needle));
  }, [rows, q]);
  const columns: ColumnsType<(typeof rows)[number]> = [
    { title: '国家', dataIndex: 'country_code', width: 70, render: (v: string | null) => v ?? '全部' },
    { title: '我司型号', dataIndex: 'own_model_id', ellipsis: true },
    { title: '配置', dataIndex: 'own_romram', width: 130, ellipsis: true },
    { title: '竞品 SKU', dataIndex: 'competitor_sku_id', ellipsis: true },
    { title: '排序', dataIndex: 'sort', width: 64, align: 'right' },
  ];
  return (
    <>
      <Input
        allowClear
        prefix={<SearchOutlined style={{ color: color.mute }} />}
        placeholder="搜索国家 / 型号 / 竞品 SKU"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ width: 300, marginBottom: 8 }}
      />
      <Table
        size="small"
        rowKey={(r) => `${r.country_code ?? '*'}|${r.own_model_id}|${r.own_romram}|${r.competitor_sku_id}|${rows.indexOf(r)}`}
        columns={columns}
        dataSource={filtered}
        pagination={{ pageSize: 20, showSizeChanger: false }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无匹配行" /> }}
      />
    </>
  );
}

export default function RulesDictBlock() {
  useConfigVersion(); // 配置导入/变更后随广播刷新

  const seriesRules = readSeriesRules();
  const modelAliases = readModelAliasRows();
  const benchmarkMatrix = readBenchmarkMatrix();
  const tierLadders = readTierLadders();
  const promoRows = readPromoRows();
  const countryAliases = readCountryAliases();
  const platformAliases = readPlatformAliases();
  const storeAliases = readStoreAliases();
  const industryOfCat = readIndustryOfCat();

  const items = [
    {
      key: 'series',
      label: `系列规则${seriesRules ? `（${seriesRules.length}）` : ''}`,
      children: (
        <div>
          <div style={hintStyle}>型号 → 系列归组（前缀或 re: 正则；系列名支持 {'{n}'}/{'{w}'} 模板）。未配置 = 型号即系列（我司取型号名首词、竞品用型号名本身）——零内置，配置表是唯一规则源。改后即时生效（产品树）。</div>
          <SourceTag configured={seriesRules != null} count={seriesRules?.length ?? 0} fallback="型号即系列" />
          {seriesRules ? (
            <DictTable rows={seriesRules as unknown as Record<string, unknown>[]} columns={[
              { title: '品牌', dataIndex: 'brand', width: 120 },
              { title: '规则', dataIndex: 'pattern' },
              { title: '系列名', dataIndex: 'series' },
            ]} />
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="未配置系列规则——型号即系列" style={{ marginTop: 12 }} />
          )}
        </div>
      ),
    },
    {
      key: 'alias',
      label: `型号别名${modelAliases ? `（${modelAliases.length}）` : ''}`,
      children: (
        <div>
          <div style={hintStyle}>品牌 × 原始型号 → 目标型号（归一键匹配；价格侧与 PSI 销量侧共用）。未配置 = 无别名。改后点数据包区「用当前配置表重新派生」。</div>
          <SourceTag configured={modelAliases != null} count={modelAliases?.length ?? 0} fallback="无别名" />
          <DictTable rows={(modelAliases ?? []) as unknown as Record<string, unknown>[]} columns={[
            { title: '品牌', dataIndex: 'brand', width: 120 },
            { title: '原始型号', dataIndex: 'from' },
            { title: '目标型号', dataIndex: 'to' },
          ]} />
        </div>
      ),
    },
    {
      key: 'matrix',
      label: `对标矩阵${benchmarkMatrix ? `（${benchmarkMatrix.length}）` : ''}`,
      children: (
        <div>
          <div style={hintStyle}>国家 × 我司型号 × 配置 × 竞品 SKU。有行 = 整体替换数据层矩阵（竞品对标区的人工编辑按组覆盖其上）。改后点「用当前配置表重新派生」。</div>
          <SourceTag configured={benchmarkMatrix != null} count={benchmarkMatrix?.length ?? 0} fallback="无矩阵层" />
          {benchmarkMatrix ? <MatrixTable rows={benchmarkMatrix} /> : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="未配置对标矩阵——v3 原表模式包无矩阵层（竞品对标区为空）" style={{ marginTop: 12 }} />
          )}
        </div>
      ),
    },
    {
      key: 'tier',
      label: `分档阶梯${tierLadders ? `（${Object.keys(tierLadders).length}）` : ''}`,
      children: (
        <div>
          <div style={hintStyle}>产业 → 逗号分隔 USD 价格点（低到高）。未配置的产业无档位（—）——零内置。改后点「用当前配置表重新派生」。</div>
          <SourceTag configured={tierLadders != null} count={tierLadders ? Object.keys(tierLadders).length : 0} fallback="全部产业无档位" />
          <DictTable
            rows={(tierLadders ? Object.entries(tierLadders).map(([industry, points]) => ({ industry, points: points.join(', ') })) : []) as unknown as Record<string, unknown>[]}
            columns={[
              { title: '产业', dataIndex: 'industry', width: 120 },
              { title: '阶梯（USD 价格点）', dataIndex: 'points' },
            ]}
          />
        </div>
      ),
    },
    {
      key: 'promo',
      label: `大促档期${promoRows ? `（${promoRows.length}）` : ''}`,
      children: (
        <div>
          <div style={hintStyle}>国家 × 促销 × 起止 × 深浅 × 平台。未配置 = 无大促带（图上档期带消失）。改后点「用当前配置表重新派生」。</div>
          <SourceTag configured={promoRows != null} count={promoRows?.length ?? 0} fallback="无大促带" />
          <DictTable rows={(promoRows ?? []) as unknown as Record<string, unknown>[]} columns={[
            { title: '国家', dataIndex: 'country_code', width: 64 },
            { title: '促销名', dataIndex: 'promo_name' },
            { title: '开始', dataIndex: 'start_date', width: 108 },
            { title: '结束', dataIndex: 'end_date', width: 108 },
            { title: '深浅', dataIndex: 'depth_hint', width: 64 },
            { title: '平台', dataIndex: 'platforms', render: (v: string[] | null) => (v ? v.join('、') : '全部') },
          ]} />
        </div>
      ),
    },
    {
      key: 'country',
      label: `国家别名（${(countryAliases ?? DEFAULT_DICTIONARIES.countryCodes) ? Object.keys(countryAliases ?? DEFAULT_DICTIONARIES.countryCodes).length : 0}）`,
      children: (
        <div>
          <div style={hintStyle}>原文（中英文/简称）→ 两位国家码；offer 侧与 PSI 销量侧共用。字典是解析器出厂词汇：空表 = 出厂默认，有行 = 全量替换。改后点「用当前配置表重新派生」。</div>
          <SourceTag configured={countryAliases != null} count={countryAliases ? Object.keys(countryAliases).length : Object.keys(DEFAULT_DICTIONARIES.countryCodes).length} fallback={`出厂默认 ${Object.keys(DEFAULT_DICTIONARIES.countryCodes).length} 条`} />
          <DictTable
            rows={Object.entries(countryAliases ?? DEFAULT_DICTIONARIES.countryCodes).map(([alias, cc]) => ({ alias, cc })) as unknown as Record<string, unknown>[]}
            columns={[
              { title: '别名', dataIndex: 'alias' },
              { title: '国家码', dataIndex: 'cc', width: 90 },
            ]}
          />
        </div>
      ),
    },
    {
      key: 'platform',
      label: `平台别名（${Object.keys(platformAliases ?? DEFAULT_DICTIONARIES.platformAliases).length}）`,
      children: (
        <div>
          <div style={hintStyle}>别名 → 平台名（如 mvm → Mvideo）。空表 = 出厂默认，有行 = 全量替换。</div>
          <SourceTag configured={platformAliases != null} count={platformAliases ? Object.keys(platformAliases).length : Object.keys(DEFAULT_DICTIONARIES.platformAliases).length} fallback={`出厂默认 ${Object.keys(DEFAULT_DICTIONARIES.platformAliases).length} 条`} />
          <DictTable
            rows={Object.entries(platformAliases ?? DEFAULT_DICTIONARIES.platformAliases).map(([alias, pf]) => ({ alias, pf })) as unknown as Record<string, unknown>[]}
            columns={[
              { title: '别名', dataIndex: 'alias' },
              { title: '平台名', dataIndex: 'pf' },
            ]}
          />
        </div>
      ),
    },
    {
      key: 'store',
      label: `店铺类型别名（${Object.keys(storeAliases ?? DEFAULT_DICTIONARIES.storeAliases).length}）`,
      children: (
        <div>
          <div style={hintStyle}>原文 → 1P / 3P / 独立站。未识别的店铺类型一律按 3P。空表 = 出厂默认，有行 = 全量替换。</div>
          <SourceTag configured={storeAliases != null} count={storeAliases ? Object.keys(storeAliases).length : Object.keys(DEFAULT_DICTIONARIES.storeAliases).length} fallback={`出厂默认 ${Object.keys(DEFAULT_DICTIONARIES.storeAliases).length} 条`} />
          <DictTable
            rows={Object.entries(storeAliases ?? DEFAULT_DICTIONARIES.storeAliases).map(([alias, st]) => ({ alias, st })) as unknown as Record<string, unknown>[]}
            columns={[
              { title: '别名', dataIndex: 'alias' },
              { title: '店铺类型', dataIndex: 'st', width: 110 },
            ]}
          />
        </div>
      ),
    },
    {
      key: 'industry',
      label: `品类映射（${Object.keys(industryOfCat ?? DEFAULT_DICTIONARIES.industryOfCat).length}）`,
      children: (
        <div>
          <div style={hintStyle}>品类原文 → 产业（phone/tablet/wearable/audio/iot/pc）。未识别品类的行会被剔除并计数。空表 = 出厂默认，有行 = 全量替换。</div>
          <SourceTag configured={industryOfCat != null} count={industryOfCat ? Object.keys(industryOfCat).length : Object.keys(DEFAULT_DICTIONARIES.industryOfCat).length} fallback={`出厂默认 ${Object.keys(DEFAULT_DICTIONARIES.industryOfCat).length} 条`} />
          <DictTable
            rows={Object.entries(industryOfCat ?? DEFAULT_DICTIONARIES.industryOfCat).map(([raw, ind]) => ({ raw, ind })) as unknown as Record<string, unknown>[]}
            columns={[
              { title: '品类原文', dataIndex: 'raw' },
              { title: '产业', dataIndex: 'ind', width: 110 },
            ]}
          />
        </div>
      ),
    },
  ];

  return (
    <div>
      <div style={{ ...hintStyle, marginBottom: 12 }}>
        九张规则/字典表的当前生效内容（只读呈现）。编辑主通道：Excel 维护 →「导入配置」（批量友好、整份校验）；
        行级在线编辑留作后续迭代。各表「生效时机」见说明——系列规则读时即时，其余派生类改后点数据包区「用当前配置表重新派生」。
      </div>
      <Tabs items={items} size="small" destroyOnHidden={false} />
    </div>
  );
}
