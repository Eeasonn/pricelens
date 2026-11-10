// ============================================================
// §13 配置页：四块配置 + 保存语义 localStorage（键前缀 LPL3.*）
// （预警中心重构：原「① 默认竞品矩阵」整块删除——与总览行尾「＋添加竞品」
//   浮窗（BenchConfigModal）完全同一份数据、两套入口重复；浮窗已补齐
//   品牌/搜索筛选、↑↓ 排序与「恢复 auto」，本页不再保留竞品矩阵编辑）
// ⓪ 竞品对标配置（2026-10-20 补回）：当前国家×产业全部我司型号×配置的对标竞品（矩阵/自动/替代/人工）可查可改
// ① 上一代关系（原②）：行 = 当前国家有数据的我司型号（型号级，与 dim_product.prev_model_id
//    同口径），下拉选上一代型号（候选 = 上市更早的我司型号）；默认读生效关系
//    （manual 优先 / dim_product auto 兜底），改后差异存 LPL3.config.prevGen
// ② 汇率：只读——真实数据每行自带采集时汇率，USD 值按行折算；此处展示当前国家本币的月度中位汇率
// ③ 大促日历：只读展示当前国家 dim_promo 的起始时间与促销深度——看板大促带/事件卡的口径来源
// 默认店铺支持国家级与产品级两层覆盖，产品级使用 `${countryCode}::${modelId}` 键并优先生效。
// 保存后 dispatchEvent(CONFIG_CHANGED_EVENT) → 主页立即生效
// 第一百八十五轮（外部 UX 审计落地）：上一代关系「恢复默认」收窄为只清当前国家
// 型号的人工维护（clearPrevGenOverridesForModels，其他国家原样保留）；默认平台
// 店铺的取价说明与实际回退链对齐（自动 = 每周最低在架价：默认店铺→预填主店→默认平台）。
// 2026-11-06（稳定版 RBAC + 导入导出）：页头工具行收敛 = 分区锚点 + 搜索 +
// 角色切换（演示，正式环境将由账号权限下发）+ 导入（仅 GTM）+ 导出（GTM/查阅者）；
// 查阅者全部写入控件 disabled 并显示横幅；长说明收进 Tooltip（对齐价格走势密度）。
// ============================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, CSSProperties, ReactNode } from 'react';
import { Button, Empty, Input, message, Modal, Popconfirm, Segmented, Select, Tag, Tooltip } from 'antd';
import { DownloadOutlined, FileExcelOutlined, InfoCircleOutlined, UploadOutlined } from '@ant-design/icons';
import PageHeader from '../components/PageHeader';
import { setRole, useRole, type AccessRole } from '../access/role';
import {
  autoPrevModelId,
  clearPrevGenOverridesForModels,
  effectivePrevModelId,
  getPrevGenOverrides,
  notifyConfigChanged,
  savePrevGenOverrides,
} from '../state/configStore';
import {
  applyImportPayload,
  exportConfigSnapshot,
  parseConfigSnapshotText,
  summarizeImportPayload,
  validateImportPayload,
  type ConfigSnapshotV1,
  type ImportPreviewSummary,
} from '../state/configImportExport';
import {
  defaultShopOverrideOf,
  getDefaultShopOverrides,
  productDefaultShopKey,
  productDefaultShopOverrideOf,
  saveDefaultShopOverrides,
  saveProductDefaultShop,
} from '../state/defaultShopStore';
import { buildConfigTemplateXlsx, configTemplateFileName, configExportFileName as configWorkbookFileName, exportConfigWorkbookXlsx, parseConfigWorkbook } from '../state/configTemplate';
import { currencyOfCountry, dimChannel, dimFx, dimProduct, dimPromo } from '../data';
import { defaultPlatformOf, prefillDefaultChannelOf } from '../dataModel/aggregate';
import { modelIdOf } from '../components/ProductCascader/tree';
import { useFilters } from '../state/FiltersContext';
import BenchmarkConfigBlock from './config/BenchmarkConfigBlock';
import DataQualityBlock from './config/DataQualityBlock';
import { CONFIG_CHANGED_EVENT } from '../state/lplKeys';
import { scopeLabels } from '../dataModel/scope';
import { color, fontSize, radius, shadow, space } from '../theme/tokens';

// ---------------- ② 上一代关系（型号级，与 dim_product.prev_model_id 同口径） ----------------

interface PrevGenRow {
  modelId: string;
  label: string;
  launch: string;
  industry: string;
}

/** 当前国家有数据的我司型号行（型号级去重，按首采日排序）——上一代关系维护用 */
function ownModelRows(countryCode: string): PrevGenRow[] {
  const seen = new Set<string>();
  const rows: PrevGenRow[] = [];
  for (const p of dimProduct) {
    if (!p.is_own || !p.countries.includes(countryCode)) continue;
    const modelId = modelIdOf(p);
    if (seen.has(modelId)) continue;
    seen.add(modelId);
    rows.push({ modelId, label: p.model_name, launch: p.launch_date, industry: p.industry });
  }
  return rows.sort((a, b) => a.launch.localeCompare(b.launch) || a.label.localeCompare(b.label));
}

function Block({ id, title, extra, children }: { id?: string; title: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <section
      id={id}
      style={{
        background: color.canvas,
        boxShadow: shadow.l1,
        borderRadius: radius.card,
        padding: space.lg,
        marginBottom: space.base,
        scrollMarginTop: 76,
      }}
    >
      <div className="lpl-config-block-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.base }}>
        <h3 style={{ margin: 0, fontSize: fontSize.bodyMd, fontWeight: 600, color: color.ink }}>{title}</h3>
        {extra}
      </div>
      {children}
    </section>
  );
}

const cellPadding: CSSProperties = { padding: `${space.sm}px ${space.sm}px` };

// 子导航分区表（id 与下方各 Block 锚点一致，抽成常量供滚动跟随与渲染共用）
const CONFIG_SECTIONS: ReadonlyArray<readonly [string, string]> = [
  ['benchmark', '竞品对标'],
  ['default-shop', '默认店铺'],
  ['anomaly', '异常守卫'],
  ['prev-gen', '上一代关系'],
  ['fx', '汇率'],
  ['promo', '大促日历'],
];

export default function Config() {
  const { state } = useFilters();
  // 2026-11-06 RBAC：角色切换（演示）即时刷新全页控件态；查阅者只读 + 可导出
  const role = useRole();
  const canEdit = role === 'gtm';
  // UI 审计修复（2026-11-10）：子导航此前六个分区全是同款蓝链接，当前分区无选中态。
  // 选中态与页头「配置」当前页标记同语法：墨色文字 + 2px 墨色短下划线 + aria-current="page"；
  // 点击即时标记，滚动时按分区顶边位置跟随（jsdom 无滚动事件，测试走点击路径断言）。
  const scrollRootRef = useRef<HTMLDivElement | null>(null);
  const [activeSection, setActiveSection] = useState<string>(CONFIG_SECTIONS[0]![0]);
  useEffect(() => {
    const root = scrollRootRef.current;
    if (!root) return undefined;
    // 标记线 = 容器顶 + 96px（与锚点 scrollMarginTop 76 同量级，留出粘性工具行高度）；
    // 取顶边已越过标记线的最后一个分区；滚到底兜底取最后一个分区（末段分区够不到标记线）
    const onScroll = (): void => {
      const marker = root.getBoundingClientRect().top + 96;
      let current = CONFIG_SECTIONS[0]![0];
      for (const [id] of CONFIG_SECTIONS) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= marker) current = id;
      }
      if (root.scrollHeight > 0 && root.scrollTop + root.clientHeight >= root.scrollHeight - 1) {
        current = CONFIG_SECTIONS[CONFIG_SECTIONS.length - 1]![0];
      }
      setActiveSection(current);
    };
    root.addEventListener('scroll', onScroll, { passive: true });
    return () => root.removeEventListener('scroll', onScroll);
  }, []);
  const prevRows = useMemo(() => ownModelRows(state.countryCode), [state.countryCode]);
  const [searchTerm, setSearchTerm] = useState('');
  const [prevMap, setPrevMap] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(prevRows.map((r) => [r.modelId, effectivePrevModelId(r.modelId)])),
  );
  // 国家切换 → prevRows 换一套型号，生效关系随口径重建（第一百二十五轮：
  // 否则下拉仍按首渲染国家的型号解释，保存会写错行）
  useEffect(() => {
    setPrevMap(Object.fromEntries(prevRows.map((r) => [r.modelId, effectivePrevModelId(r.modelId)])));
  }, [prevRows]);
  const labels = scopeLabels({ countryCode: state.countryCode, industry: state.industry });
  const localCurrency = currencyOfCountry(state.countryCode);
  const fxRows = useMemo(
    () => dimFx.filter((f) => f.currency === localCurrency).sort((a, b) => a.month_id.localeCompare(b.month_id)),
    [localCurrency],
  );
  const promos = useMemo(
    () => dimPromo.filter((p) => p.country_code === state.countryCode).sort((a, b) => a.start_date.localeCompare(b.start_date)),
    [state.countryCode],
  );

  // 导入落盘（applyImportPayload）派发 CONFIG_CHANGED_EVENT 后重读本页局部状态；
  // 本页各块即改即存的自身广播重读是幂等的（第一百一十五轮：无批量「保存配置」）
  useEffect(() => {
    const reread = (): void => {
      setPrevMap(Object.fromEntries(prevRows.map((r) => [r.modelId, effectivePrevModelId(r.modelId)])));
      setDefaultShopId(defaultShopOverrideOf(state.countryCode));
      setDefaultShopVersion((v) => v + 1);
    };
    window.addEventListener(CONFIG_CHANGED_EVENT, reread);
    return () => window.removeEventListener(CONFIG_CHANGED_EVENT, reread);
  }, [prevRows, state.countryCode]);

  // 第一百一十五轮（评审）：右上「保存配置」按钮删除——本页各明细编辑即改即存
  //（对标配置 = BenchConfigModal 保存；上一代关系 = 下拉变更即存），
  // 不再攒一次批量提交。

  /** 上一代关系单行变更即存：只写与 auto 的差异（无差异 = 清除手动维护），主页即时生效。
   *  覆盖表是全局单表（跨国共享）——以现存表为基底只重写当前国家各行，其他国家型号
   *  的手动维护原样保留（第一百二十五轮） */
  const savePrevRow = (modelId: string, value: string | null): void => {
    setPrevMap((m) => ({ ...m, [modelId]: value }));
    const overrides: Record<string, string | null> = { ...getPrevGenOverrides() };
    for (const r of prevRows) {
      const cur = (r.modelId === modelId ? value : prevMap[r.modelId]) ?? null;
      if (cur !== autoPrevModelId(r.modelId)) overrides[r.modelId] = cur;
      else delete overrides[r.modelId];
    }
    savePrevGenOverrides(overrides);
    notifyConfigChanged();
    message.success('上一代关系已保存，主页已生效');
  };

  // 第一百八十五轮（外部 UX 审计落地）：当前国家人工维护的型号数——「恢复默认」
  // 的确认范围与按钮空态都以此为据（覆盖表全局单表，此页只动当前国家的型号）
  const manualPrevCount = prevRows.filter(
    (r) => (prevMap[r.modelId] ?? null) !== autoPrevModelId(r.modelId),
  ).length;
  const normalizedSearch = searchTerm.trim().toLocaleLowerCase();
  const visiblePrevRows = normalizedSearch
    ? prevRows.filter((row) => `${row.label} ${row.modelId}`.toLocaleLowerCase().includes(normalizedSearch))
    : prevRows;

  /** 「恢复默认」收窄（第一百八十五轮）：只清除当前国家型号的人工维护，
   *  其他国家型号原样保留（原实现清整份跨国覆盖表，不可撤销） */
  const restorePrevGenDefault = () => {
    const removed = clearPrevGenOverridesForModels(prevRows.map((r) => r.modelId));
    setPrevMap(Object.fromEntries(prevRows.map((r) => [r.modelId, autoPrevModelId(r.modelId)])));
    notifyConfigChanged();
    message.success(`已恢复${labels.country} ${removed} 个型号的默认上一代关系`);
  };

  // ---------------- 默认平台店铺（第一百三十七轮）：预填 + 人工覆盖，即改即存，主页取价即时生效 ----------------
  // defaultShopId = 人工覆盖（LPL3.config.defaultShop）；prefillShopId = 维表预填（dim_default_channel.json，
  // 事实包统计的数据主店）。下拉显示「生效默认」= 覆盖 ?? 预填（与 aggregate.defaultChannelOf 回退链一致），
  // Tag 区分三态：人工覆盖 / 预填 / 维表默认（预填缺失兜底）。
  const [defaultShopId, setDefaultShopId] = useState<string | null>(() => defaultShopOverrideOf(state.countryCode));
  const [defaultShopVersion, setDefaultShopVersion] = useState(0);
  useEffect(() => {
    setDefaultShopId(defaultShopOverrideOf(state.countryCode));
    setDefaultShopVersion((v) => v + 1);
  }, [state.countryCode]);
  const prefillShopId = useMemo(() => prefillDefaultChannelOf(state.countryCode), [state.countryCode]);
  const prefillShop = useMemo(
    () => dimChannel.find((c) => c.channel_id === prefillShopId) ?? null,
    [prefillShopId],
  );
  const effectiveShopId = defaultShopId ?? prefillShopId;

  const platformRowsOfCc = useMemo(() => {
    const shopsByPlatform = new Map<string, number>();
    for (const c of dimChannel) {
      if (c.country_code !== state.countryCode) continue;
      shopsByPlatform.set(c.platform, (shopsByPlatform.get(c.platform) ?? 0) + c.shops);
    }
    return [...shopsByPlatform.entries()].map(([platform, shops]) => ({ platform, shops }));
  }, [state.countryCode]);

  const defaultShopChannel = useMemo(
    () => dimChannel.find((c) => c.channel_id === effectiveShopId) ?? null,
    [effectiveShopId],
  );
  const defaultShopPlatform = defaultShopChannel?.platform ?? null;
  const shopRowsOfPlatform = useMemo(
    () =>
      defaultShopPlatform
        ? dimChannel
            .filter((c) => c.country_code === state.countryCode && c.platform === defaultShopPlatform)
            .map((c) => ({ id: c.channel_id, name: c.display_name }))
        : [],
    [state.countryCode, defaultShopPlatform],
  );

  const saveDefaultShop = (channelId: string | null): void => {
    setDefaultShopId(channelId);
    const map = { ...getDefaultShopOverrides() };
    if (channelId) map[state.countryCode] = channelId;
    else delete map[state.countryCode];
    saveDefaultShopOverrides(map);
    setDefaultShopVersion((v) => v + 1);
    notifyConfigChanged();
    message.success('默认平台店铺已保存，看板取价即时生效');
  };

  /** 平台下拉变更 = 连带选该平台首个渠道（一次操作完成配置）；店铺下拉再微调。
   *  重选当前生效店铺所在平台 = 无操作（不换店、不把预填态固化成人工配置） */
  const onDefaultPlatformChange = (platform: string): void => {
    if (platform === defaultShopPlatform) return;
    const first = dimChannel.find((c) => c.country_code === state.countryCode && c.platform === platform);
    saveDefaultShop(first?.channel_id ?? null);
  };

  const countryShopOptions = useMemo(
    () => dimChannel
      .filter((c) => c.country_code === state.countryCode)
      .sort((a, b) => a.platform.localeCompare(b.platform) || a.display_name.localeCompare(b.display_name))
      .map((c) => ({ value: c.channel_id, label: `${c.platform} · ${c.display_name}` })),
    [state.countryCode],
  );
  const productShopOverrideCount = useMemo(
    () => prevRows.filter((row) => productDefaultShopOverrideOf(state.countryCode, row.modelId) != null).length,
    [defaultShopVersion, prevRows, state.countryCode],
  );

  const saveProductShop = (modelId: string, channelId: string | null): void => {
    if (!canEdit) return;
    saveProductDefaultShop(state.countryCode, modelId, channelId);
    setDefaultShopVersion((v) => v + 1);
    notifyConfigChanged();
    message.success('产品默认店铺已保存，看板取价即时生效');
  };

  const clearProductShops = (): void => {
    const map = { ...getDefaultShopOverrides() };
    for (const row of prevRows) delete map[productDefaultShopKey(state.countryCode, row.modelId)];
    saveDefaultShopOverrides(map);
    setDefaultShopVersion((v) => v + 1);
    notifyConfigChanged();
    message.success(`已清除${labels.country} ${productShopOverrideCount} 个产品默认店铺配置`);
  };

  // ---------------- 2026-11-06 导入/导出（快照 = LPL3.config.* 原始持久化值） ----------------

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingImport, setPendingImport] = useState<{ payload: ConfigSnapshotV1; summary: ImportPreviewSummary } | null>(null);

  // 2026-11-10（Eason：导入导出应为表格而非 json）：导出 = 与模板同构的 xlsx
  // （Excel 可直接编辑后从「导入配置表」导回）；导入沿用 parseConfigWorkbook，
  // 旧 .pricelens-config.json 快照仍可导入（parseConfigSnapshotText 兼容）。
  const onExport = (): void => {
    const bytes = exportConfigWorkbookXlsx(exportConfigSnapshot());
    const blob = new Blob([bytes.slice().buffer as ArrayBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = configWorkbookFileName();
    link.click();
    URL.revokeObjectURL(url);
    message.success(`已导出配置表（${link.download}）`);
  };

  const onDownloadTemplate = (): void => {
    const templateBytes = buildConfigTemplateXlsx();
    const blob = new Blob([templateBytes.slice().buffer as ArrayBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = configTemplateFileName();
    link.click();
    URL.revokeObjectURL(url);
    message.success(`已下载配置表模板（${link.download}）`);
  };

  const onImportFilePicked = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = ''; // 允许重复选择同一文件
    if (!file) return;
    try {
      const isWorkbook = /\.xlsx?$/i.test(file.name) || file.type.includes('spreadsheet');
      const result = isWorkbook
        ? validateImportPayload(parseConfigWorkbook(new Uint8Array(await file.arrayBuffer())))
        : parseConfigSnapshotText(await file.text());
      if (!result.ok || !result.payload) {
        message.error(`导入失败：${result.error ?? '文件不合法'}`);
        return;
      }
      setPendingImport({ payload: result.payload, summary: summarizeImportPayload(result.payload) });
    } catch {
      message.error('读取文件失败，请重试');
    }
  };

  const confirmImport = (): void => {
    if (!pendingImport) return;
    const result = applyImportPayload(pendingImport.payload);
    setPendingImport(null);
    if (!result.applied) {
      message.error(result.reason ?? '导入未生效');
      return;
    }
    message.success('配置已导入，全部页面即时生效');
  };

  const viewerHint = '查阅者不可修改配置，请联系 GTM';

  const previewRow = (label: string, value: ReactNode): ReactNode => (
    <div key={label} style={{ display: 'grid', gridTemplateColumns: '88px minmax(0, 1fr)', gap: space.sm, fontSize: fontSize.bodySm, alignItems: 'baseline' }}>
      <span style={{ color: color.mute }}>{label}</span>
      <span style={{ color: color.ink, overflowWrap: 'anywhere' }}>{value}</span>
    </div>
  );

  const benchmarkPreviewText = (summary: ImportPreviewSummary): string => {
    if (summary.benchmarkTotal === 0) return '无人工配置 → 恢复系统默认';
    const countries = summary.benchmarkByCountry;
    const head = countries.slice(0, 6).map((c) => `${c.countryCode} ×${c.count}`).join(' · ');
    const tail = countries.length > 6 ? ` 等 ${countries.length} 国` : '';
    return `共 ${summary.benchmarkTotal} 条（${head}${tail}）`;
  };

  const defaultShopPreviewText = (summary: ImportPreviewSummary): string => {
    const parts = [
      summary.defaultShopCount > 0 ? `${summary.defaultShopCount} 国` : '',
      summary.defaultShopProductCount > 0 ? `${summary.defaultShopProductCount} 个产品` : '',
    ].filter(Boolean);
    return parts.length ? `${parts.join('、')}人工配置` : '无人工配置 → 恢复系统默认';
  };

  return (
    <div ref={scrollRootRef} style={{ height: '100%', overflowX: 'auto', overflowY: 'auto', background: color.canvasSoft }} data-lpl-scroll>
      {/* 第二十八轮：1440 → 1280，与看板同最低宽度 */}
      <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* 顶栏 64px（共享 PageHeader；第一百一十五轮：右上「保存配置」删除——
            各明细编辑即改即存，批量保存无实义） */}
        <PageHeader title="配置" />

        <main style={{ flex: 1, padding: space.lg }}>
          {/* 2026-11-06：页头工具行 = 分区锚点 + 搜索 + 角色切换（演示）+ 导入 + 导出。
              密度对齐价格走势工具行：一条横排、小控件、长说明进 Tooltip */}
          <div style={{ position: 'sticky', top: 0, zIndex: 5, display: 'flex', alignItems: 'center', gap: space.sm, flexWrap: 'wrap', marginBottom: space.md, padding: `${space.sm}px ${space.md}px`, background: color.canvas, border: `1px solid ${color.hairline}`, borderRadius: radius.control, boxShadow: shadow.l1 }}>
            <nav aria-label="配置分区" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {/* 当前分区选中态与 PageHeader 当前页标记同语法（墨色 + 2px 墨色下划线 +
                  aria-current="page"；2026-11-10 UI 审计：六个分区同为蓝链接，
                  分不清当前所在分区）。非当前项保持蓝链接；
                  透明 2px 底边占位，选中切换不跳动 */}
              {CONFIG_SECTIONS.map(([id, label]) => {
                const active = activeSection === id;
                return (
                  <a
                    key={id}
                    href={`#${id}`}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => setActiveSection(id)}
                    style={{
                      color: active ? color.ink : color.link,
                      fontWeight: active ? 600 : 400,
                      fontSize: 11,
                      textDecoration: 'none',
                      padding: '3px 7px',
                      borderBottom: `2px solid ${active ? color.ink : 'transparent'}`,
                    }}
                  >
                    {label}
                  </a>
                );
              })}
            </nav>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
              <Input
                allowClear
                size="small"
                aria-label="配置搜索"
                placeholder="搜索型号或产品"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                style={{ width: 190 }}
              />
              <span aria-hidden style={{ width: 1, height: 18, background: color.hairline }} />
              {/* 角色切换（开发/演示用）：正式环境将由账号权限下发；详见
                  docs/design/2026-11-06-access-roles.md */}
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: color.mute }}>角色</span>
                <Segmented
                  size="small"
                  aria-label="当前角色（演示）"
                  value={role}
                  onChange={(v) => setRole(v as AccessRole)}
                  options={[
                    { label: 'GTM', value: 'gtm' },
                    { label: '查阅者', value: 'viewer' },
                  ]}
                />
                <Tooltip title="开发/演示用角色切换：GTM 可编辑并导入导出；查阅者只读、仍可导出备份">
                  <span style={{ fontSize: 11, color: color.mute }}>正式环境将由账号权限下发</span>
                </Tooltip>
              </span>
              {/* 导入仅 GTM（applyImportPayload 内另有角色校验）；导出 GTM/查阅者皆可 */}
              <Button size="small" icon={<FileExcelOutlined />} onClick={onDownloadTemplate}>
                下载配置表模板
              </Button>
              {canEdit && (
                <Button size="small" icon={<UploadOutlined />} onClick={() => fileInputRef.current?.click()}>
                  导入配置
                </Button>
              )}
              <Button size="small" icon={<DownloadOutlined />} onClick={onExport}>
                导出配置
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.json,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                hidden
                aria-label="选择配置快照文件"
                onChange={onImportFilePicked}
              />
            </div>
          </div>

          {/* 查阅者横幅：角色态即时显隐（useRole 监听角色变更广播） */}
          {!canEdit && (
            <div
              role="status"
              style={{
                display: 'flex', alignItems: 'center', gap: space.sm,
                marginBottom: space.md, padding: `${space.sm}px ${space.md}px`,
                background: color.warningSoft, color: color.warningInk,
                border: `1px solid ${color.warning}`, borderRadius: radius.control,
                fontSize: fontSize.bodySm,
              }}
            >
              <InfoCircleOutlined style={{ flexShrink: 0 }} />
              <span>{viewerHint}。可查看全部配置并「导出配置」备份。</span>
            </div>
          )}

          {/* ⓪ 竞品对标配置：全部已识别的对标关系（矩阵/自动/替代/人工）在此可查可改 */}
          <Block
            id="benchmark"
            title="竞品对标配置"
            extra={
              <span style={{ fontSize: fontSize.caption, color: color.mute }}>
                {labels.country} · 国家随页头切换；看板「匹配竞品」即取此处配置
              </span>
            }
          >
            <BenchmarkConfigBlock canEdit={canEdit} />
          </Block>

          {/* ⓪' 默认平台店铺（第一百三十七轮）：未在筛选中选择平台时，看板按生效默认店铺取价 */}
          <Block
            id="default-shop"
            title="默认平台店铺"
            extra={
              <div style={{ display: 'flex', alignItems: 'center', gap: space.sm, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <Popconfirm
                  title="清除国家级店铺后回到预填/平台默认，确定？"
                  okText="确定"
                  cancelText="取消"
                  okButtonProps={{ size: 'small' }}
                  cancelButtonProps={{ size: 'small' }}
                  disabled={!canEdit}
                  onConfirm={() => saveDefaultShop(null)}
                >
                  <Button
                    size="small"
                    disabled={!canEdit || !defaultShopId}
                    title={!canEdit ? viewerHint : defaultShopId ? undefined : '当前无国家级人工配置'}
                  >
                    清除国家级配置
                  </Button>
                </Popconfirm>
                <Popconfirm
                  title={`清除${labels.country} ${productShopOverrideCount} 个产品的人工店铺配置？`}
                  description="清除后所有产品回到国家级默认店铺"
                  okText="确定"
                  cancelText="取消"
                  okButtonProps={{ size: 'small' }}
                  cancelButtonProps={{ size: 'small' }}
                  disabled={!canEdit || productShopOverrideCount === 0}
                  onConfirm={clearProductShops}
                >
                  <Button
                    size="small"
                    disabled={!canEdit || productShopOverrideCount === 0}
                    title={!canEdit ? viewerHint : productShopOverrideCount ? undefined : '当前没有产品级人工配置'}
                  >
                    清除产品级配置
                  </Button>
                </Popconfirm>
              </div>
            }
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
              <span style={{ fontSize: fontSize.bodySm, color: color.mute, flexShrink: 0 }}>
                {labels.country}（国家随页头切换）
              </span>
              <Select
                size="small"
                style={{ width: 170, flexShrink: 0 }}
                aria-label="默认平台"
                placeholder="选择平台"
                disabled={!canEdit}
                value={defaultShopPlatform ?? undefined}
                options={platformRowsOfCc.map((r) => ({ value: r.platform, label: `${r.platform} · ${r.shops} 店铺` }))}
                onChange={onDefaultPlatformChange}
              />
              <Select
                size="small"
                style={{ width: 200, flexShrink: 0 }}
                aria-label="默认店铺"
                placeholder={defaultShopPlatform ? '选择店铺' : '先选平台'}
                disabled={!canEdit || !defaultShopPlatform}
                value={effectiveShopId ?? undefined}
                options={shopRowsOfPlatform.map((s) => ({ value: s.id, label: s.name }))}
                onChange={(v) => saveDefaultShop(v ?? null)}
              />
              {defaultShopId ? (
                <Tag color="blue" style={{ marginInlineEnd: 0, fontSize: fontSize.caption, lineHeight: '18px' }}>
                  已配置
                </Tag>
              ) : prefillShop ? (
                <Tag color="cyan" style={{ marginInlineEnd: 0, fontSize: fontSize.caption, lineHeight: '18px' }}>
                  预填 · {prefillShop.display_name}（数据主店，可改）
                </Tag>
              ) : (
                <Tag style={{ marginInlineEnd: 0, fontSize: fontSize.caption, lineHeight: '18px' }}>
                  平台默认：{defaultPlatformOf(state.countryCode) ?? '—'} 平台内最低在架价
                </Tag>
              )}
            </div>
            {/* 长说明收进 Tooltip（2026-11-06 密度整理）：正文只留一句回退链 */}
            <div style={{ fontSize: fontSize.caption, color: color.mute, marginTop: space.sm, lineHeight: '18px', display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
              <span>国家级默认店铺适用于该国未单独配置的我司产品；产品级配置优先于国家级，未配置时回到国家级 → 预填主店 → 默认平台。</span>
              <Tooltip
                title={
                  <div style={{ maxWidth: 360 }}>
                    <div>· 国家级店铺按国家统一生效；</div>
                    <div>· 产品级店铺按当前国家逐产品覆盖，适合不同产品分属不同平台的场景；</div>
                    <div>· 清除产品级配置后回到国家级配置；清除国家级配置后回到预填主店；</div>
                    <div>· 「平台价差」预警按该国全部平台计算，不受默认店铺影响。</div>
                  </div>
                }
              >
                <InfoCircleOutlined aria-label="默认店铺取价完整说明" style={{ fontSize: 11, color: color.mute, cursor: 'help' }} />
              </Tooltip>
            </div>
            <div style={{ marginTop: space.lg, borderTop: `1px solid ${color.hairline}`, paddingTop: space.md }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: space.sm, flexWrap: 'wrap', marginBottom: space.sm }}>
                <div>
                  <div style={{ fontSize: fontSize.bodySm, fontWeight: 600, color: color.ink }}>按我司产品配置默认店铺</div>
                  <div style={{ fontSize: fontSize.caption, color: color.mute, marginTop: 2 }}>当前国家共 {prevRows.length} 个我司产品。留空表示跟随国家级默认店铺。</div>
                </div>
                <Tag color={productShopOverrideCount ? 'blue' : undefined} style={{ marginInlineEnd: 0, fontSize: fontSize.caption, lineHeight: '18px' }}>
                  {productShopOverrideCount ? `${productShopOverrideCount} 个产品已覆盖` : '全部跟随国家级'}
                </Tag>
              </div>
              <div style={{ maxHeight: 460, overflow: 'auto', border: `1px solid ${color.hairline}`, borderRadius: radius.control }}>
                <div style={{ minWidth: 640 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1.4fr) 90px minmax(250px, 1fr) 110px', alignItems: 'center', gap: space.sm, padding: `${space.sm}px ${space.md}px`, background: color.canvasSoft2, borderBottom: `1px solid ${color.hairline}`, fontSize: fontSize.caption, color: color.mute, position: 'sticky', top: 0, zIndex: 1 }}>
                    <span>我司产品</span><span>产业</span><span>生效默认店铺</span><span>配置状态</span>
                  </div>
                  {visiblePrevRows.map((row) => {
                    const override = productDefaultShopOverrideOf(state.countryCode, row.modelId);
                    const fallbackId = defaultShopOverrideOf(state.countryCode);
                    const effectiveId = override ?? fallbackId ?? prefillShopId;
                    const effective = dimChannel.find((c) => c.channel_id === effectiveId);
                    return (
                      <div key={`default-shop-${row.modelId}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1.4fr) 90px minmax(250px, 1fr) 110px', alignItems: 'center', gap: space.sm, padding: `${space.sm}px ${space.md}px`, borderBottom: `1px solid ${color.hairline}`, minHeight: 48 }}>
                        <Tooltip title={`${row.label}（${row.modelId}）`}>
                          <span style={{ color: color.ink, fontSize: fontSize.bodySm, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.label}</span>
                        </Tooltip>
                        <span style={{ color: color.mute, fontSize: fontSize.caption }}>{row.industry}</span>
                        <Select
                          size="small"
                          allowClear
                          showSearch
                          optionFilterProp="label"
                          aria-label={`默认店铺：${row.label}`}
                          disabled={!canEdit}
                          placeholder={effective ? `${effective.platform} · ${effective.display_name}` : '跟随国家级默认'}
                          value={override ?? undefined}
                          options={countryShopOptions}
                          onChange={(value) => saveProductShop(row.modelId, value ?? null)}
                          style={{ width: '100%' }}
                        />
                        {override ? (
                          <Tag color="blue" style={{ marginInlineEnd: 0, fontSize: fontSize.caption, lineHeight: '18px', width: 'fit-content' }}>产品覆盖</Tag>
                        ) : (
                          <Tag style={{ marginInlineEnd: 0, fontSize: fontSize.caption, lineHeight: '18px', width: 'fit-content' }}>跟随国家级</Tag>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              {normalizedSearch && <div style={{ marginTop: space.sm, fontSize: fontSize.caption, color: color.mute }}>搜索同时筛选上一代关系和产品默认店铺；清空搜索可恢复全部产品。</div>}
            </div>
          </Block>

          {/* ⓪'' 异常价格守卫（2026-11-01 异常价格守卫；晚前反馈「数据质量」难懂改此名）：
              全局口径唯一写入口——阈值 + 人工裁定清单 */}
          <Block
            id="anomaly"
            title="异常价格守卫"
            extra={
              <span style={{ fontSize: fontSize.caption, color: color.mute }}>
                全站统一口径；不随分享链接携带
              </span>
            }
          >
            <DataQualityBlock canEdit={canEdit} />
          </Block>

          {/* ① 上一代关系 */}
          <Block
            id="prev-gen"
            title="上一代关系"
            extra={
              <Popconfirm
                title={`仅清除${labels.country} ${manualPrevCount} 个型号的人工关系？`}
                description="其他国家的型号不受影响，清除后回到产品主数据的默认关系"
                okText="确定"
                cancelText="取消"
                okButtonProps={{ size: 'small' }}
                cancelButtonProps={{ size: 'small' }}
                disabled={!canEdit}
                onConfirm={restorePrevGenDefault}
              >
                <Button
                  size="small"
                  disabled={!canEdit || manualPrevCount === 0}
                  title={!canEdit
                    ? viewerHint
                    : manualPrevCount === 0
                      ? '当前国家没有人工维护的上一代关系'
                      : undefined}
                >
                  恢复默认
                </Button>
              </Popconfirm>
            }
          >
            {visiblePrevRows.length ? (
              <div className="lpl-config-prev-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: space.sm }}>
                {visiblePrevRows.map((r) => {
                  const auto = autoPrevModelId(r.modelId);
                  const manual = (prevMap[r.modelId] ?? null) !== auto;
                  return (
                    <div key={r.modelId} style={{ display: 'flex', alignItems: 'center', gap: space.sm, minWidth: 0 }}>
                      <Tooltip title={`${r.label}（${r.launch} 上市）`}>
                        <span
                          style={{
                            fontSize: fontSize.bodySm,
                            color: color.ink,
                            width: 140,
                            flexShrink: 0,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {r.label}
                        </span>
                      </Tooltip>
                      <Select
                        size="small"
                        allowClear
                        disabled={!canEdit}
                        placeholder="未维护"
                        aria-label={`上一代关系：${r.label}`}
                        style={{ width: 170, flexShrink: 0 }}
                        value={prevMap[r.modelId] ?? undefined}
                        options={prevRows
                          .filter((c) => c.launch < r.launch)
                          .map((c) => ({ label: c.label, value: c.modelId }))}
                        onChange={(v) => savePrevRow(r.modelId, v ?? null)}
                      />
                      <Tooltip title={manual ? '手动维护' : '来自产品主数据'}>
                        <Tag
                          color={manual ? 'blue' : 'default'}
                          style={{ marginInlineEnd: 0, fontSize: fontSize.caption, lineHeight: '18px', flexShrink: 0 }}
                        >
                          {manual ? '手动' : '自动来源'}
                        </Tag>
                      </Tooltip>
                    </div>
                  );
                })}
              </div>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={normalizedSearch ? '没有匹配的型号' : '暂无产品数据'} />
            )}
            {normalizedSearch && <div style={{ marginTop: space.sm, fontSize: fontSize.caption, color: color.mute }}>搜索仅筛选上一代关系型号；清空搜索可恢复当前国家全部型号。</div>}
          </Block>

          {/* ② 汇率（只读）：真实数据按行折算，这里展示本币月度中位汇率 */}
          <Block
            id="fx"
            title="汇率"
            extra={
              <span style={{ fontSize: fontSize.caption, color: color.mute }}>
                USD 价格 = 本币价格 ÷ 采集时汇率（逐行）；下表为 {localCurrency} 各月中位数
              </span>
            }
          >
            {fxRows.length ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.sm, fontSize: fontSize.bodySm }}>
                {fxRows.map((f) => (
                  <span key={f.month_id} className="tnum" style={{ color: color.body, padding: '2px 10px', background: color.canvasSoft, borderRadius: radius.pill }}>
                    {f.month_id.slice(0, 4)}-{f.month_id.slice(4)} · 1 USD = {f.per_usd} {f.currency}
                  </span>
                ))}
              </div>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="该国暂无汇率记录" />
            )}
          </Block>

          {/* ③ 大促日历：当前国家的起始时间 + 促销深度（dim_promo 只读） */}
          <Block
            id="promo"
            title="大促日历"
            extra={
              <span style={{ fontSize: fontSize.caption, color: color.mute }}>
                当前国家促销日历 · 看板「大促档期」带与事件卡的来源
              </span>
            }
          >
            {promos.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="该国暂无大促日历" />
            ) : null}
            <div className="lpl-config-promo-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: space.sm }}>
              {promos
                .map((p) => {
                  const tone =
                    p.depth_hint === '深'
                      ? { dot: color.alert.ownGap.fg, fg: color.alert.ownGap.fg, bg: color.alert.ownGap.bg }
                      : p.depth_hint === '中'
                        ? { dot: color.alert.promo.fg, fg: color.alert.promo.fg, bg: color.alert.promo.bg }
                        : { dot: color.mute, fg: color.mute, bg: color.canvasSoft };
                  return (
                    <div key={p.promo_id} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, fontSize: fontSize.bodySm }}>
                      <i
                        aria-hidden
                        style={{ display: 'inline-block', width: 8, height: 8, borderRadius: radius.pill, background: tone.dot, flexShrink: 0, boxShadow: shadow.l1 }}
                      />
                      <span title={p.promo_name} style={{ color: color.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
                        {p.promo_name}
                      </span>
                      <span className="tnum" style={{ color: color.body, flexShrink: 0 }}>
                        {p.start_date} ~ {p.end_date}
                      </span>
                      <span
                        style={{
                          flexShrink: 0,
                          padding: '1px 8px',
                          fontSize: fontSize.caption,
                          fontWeight: 600,
                          lineHeight: '18px',
                          borderRadius: radius.pill,
                          color: tone.fg,
                          background: tone.bg,
                        }}
                      >
                        {p.depth_hint}
                      </span>
                    </div>
                  );
                })}
            </div>
          </Block>

          {/* 导入预览确认（仅 GTM 能走到）：applyImportPayload 落盘前已全量校验，
              确认后一次性写回并广播；null 键 = 恢复系统默认 */}
          <Modal
            open={pendingImport != null}
            onCancel={() => setPendingImport(null)}
            title="导入配置预览"
            width={560}
            centered
            footer={
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ flex: 1, fontSize: fontSize.caption, color: color.mute }}>
                  确认后一次性覆盖当前浏览器内上述配置，全部页面即时生效；筛选与页面状态不受影响。
                </span>
                <Button size="small" onClick={() => setPendingImport(null)}>
                  取消
                </Button>
                <Button type="primary" size="small" onClick={confirmImport}>
                  确认导入
                </Button>
              </div>
            }
          >
            {pendingImport && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: space.sm }}>
                {previewRow('导出时间', `${pendingImport.summary.exportedAt.slice(0, 16).replace('T', ' ')} UTC`)}
                {previewRow('来源通道', pendingImport.summary.appChannel === 'stable' ? '稳定版' : '迭代版')}
                {previewRow('竞品对标', benchmarkPreviewText(pendingImport.summary))}
                {previewRow('上一代关系', pendingImport.summary.prevGenCount > 0
                  ? `${pendingImport.summary.prevGenCount} 个型号人工维护`
                  : '无人工维护 → 恢复系统默认')}
                {previewRow('默认店铺', defaultShopPreviewText(pendingImport.summary))}
                {previewRow('市场采集规则', pendingImport.summary.marketRuleCount > 0
                  ? `${pendingImport.summary.marketRuleCount} 个国家`
                  : '无配置 → 使用系统默认口径')}
                {previewRow('异常守卫', pendingImport.summary.anomalyRule
                  ? pendingImport.summary.anomalyRule.enabled
                    ? `开启（阈值 ≥${pendingImport.summary.anomalyRule.thresholdPct}%）`
                    : `关闭（阈值 ${pendingImport.summary.anomalyRule.thresholdPct}%）`
                  : '未配置 → 恢复默认（关闭）')}
                {previewRow('人工裁定', pendingImport.summary.anomalyMarkCount > 0
                  ? `${pendingImport.summary.anomalyMarkCount} 条`
                  : '无 → 清空')}
                {previewRow('参考汇率', pendingImport.summary.fxIncluded ? '随快照写回（只读展示，无编辑入口）' : '快照不含汇率')}
              </div>
            )}
          </Modal>
        </main>
      </div>
    </div>
  );
}
