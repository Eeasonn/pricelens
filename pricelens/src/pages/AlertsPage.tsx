// ============================================================
// 预警中心页面（追补⑨升独立页 / 预警中心重构定版 / 第五十五轮「只报最新态」修订）：
// 用户口径——主视觉与总览提醒只看最新预警，历史进次级视图；详情要凝练。
// 四区结构：
// ① 概览条（类看板摘要三件套）：最新预警数+最新周 ｜ 类型分布（最新态计数，pill 可点 = 切筛选）｜ 监控范围；
// ② 工具行：类型 Segmented（最新态计数）+ 品牌筛选 + 「＋添加监控」搜索；
// ③ 监控矩阵（主区，类总览行组表格语言）：行 = 订阅系列按品牌分组（华为品牌置顶），
//    列 = 四类预警——列头即规则（全局开关 + 阈值 Popover，原「全局规则」整卡收编于此）；
//    单元格 = 该系列该类型**最新一条**的凝练读数（调价 ↓x% → $价 / 促销加深 xpp /
//    平台差 / 间距，alertDigest），点击行下展开该类型全部历史（次级）；小阈值 = 按产品覆写；
//    行尾 = 统一 AlertBell；档位间距 = 型号级，在华为品牌组下方以成对细条呈现；
// ④ 历史事件（次级，默认折叠）：周分组时间序 + 方向箭头（跌/加深琥珀↓、涨/收窄蓝↑）+ 看板跳转。
// 数据 = alerts.ts 纯引擎（useAlerts 与页头徽标/总览列/看板共用一份结果）+
//   groupAlertsBySeries / groupAlertsByWeek / latestAlerts 分组纯函数（金测锚定）。
// 第一百八十五轮（外部 UX 审计落地）：
// ① 键盘可达——表头全局阈值、单品阈值触发器 span → 原生 button（Enter/Space 原生支持）；
//    最新触发单元格保留 span 外壳（表格布局敏感），补 tabIndex + Enter/Space 键盘等价；
// ② 对比度——阈值等可点文字 10px/#a1a1a1(2.58:1) → 11px/color.mute(4.7:1)，
//    页内 10px 可读文字统一升 11px（pill 徽标与禁用态「—」占位除外）。
// 第一百九十轮（外部 UX 审计落地）：
// ① 可访问名称——全部可操作控件补 aria-label（矩阵行/间距条「看板」、列头总开关、
//    单品开关、全局/单品阈值触发器、阈值滑杆、品牌筛选/排序/添加监控下拉）；
// ② 窄屏信息层级——概览条、预警行、产品名挂 lpl-alert-* 类（窄屏单列/换行/不截断，桌面观感不变）；
// ③ 零监控空态——添加监控入口 prominent 化（中号 + 白底），不再像禁用输入框。
// 第一百九十一轮（桌面 1440×900 实拍审计落地）：
// ① 首屏密度——概览两卡 + 四块统计砖（6 砖约 320px、计数四处重复）合并为一排紧凑状态带：
//    计数与标签同行小间距、零值项弱化（hairlineStrong 数字 + mute 标签），两卡副行细节
//    移入 title 兜底——删的是版式冗余不是信息；总行高 ~40px，处理收件箱在 900px 视口上移；
// ② 「让 Agent 解释最新预警」从悬置画布移入处理收件箱卡头右侧（与副标同行右对齐）；
// ③ 空态——添加监控主操作描边加强一档（ConfigProvider 作用域主题，见 prominentSelectTheme）、
//    占位文案去「＋」前缀（右端已有 PlusOutlined 图标，双加号冗余）、空态卡视口内垂直居中。
// 第一百九十二轮（2026-11-17 Eason 三指令，预警中心真实使用化）：
// ① 处理收件箱整卡剔除（含批量处理/全选/生命周期筛选芯片）——处理生命周期仅保留
//    Agent 深链详情抽屉通道（recordOverrides 持久化与 pricelens:alert-records-updated 不动）；
// ② 每产品独立四类开关：行尾新增「规则设置」齿轮（调价/折扣/平台价差/档位间距 四 Switch，
//    覆写语义与单元格一致 = 与全局同值即清键回落；own-gap 引擎同步改为按产品参与成对计算，
//    关档位 = 该系列退出型号内成对；竞品行 平台价差/档位间距 禁用标注仅华为）；
// ③ 添加监控从 Select 搜索换产品级联（antd Cascader + CascadePanel 三列：品牌→型号→配置，
//    与筛选条产品筛选器同构同语言；勾选即订阅、取消勾选即移除）；行尾铃铛退役改 ✕
//    （Popconfirm 二次确认——铃铛语义是订阅开关不是删除，误点即整行消失是本轮反馈原话）。
// 拍板轮（同日「V1a 其他全部按推荐」）：B2 Agent 深链即时生效（生产者派发
// pricelens:alerts-focus，页内不失效）/ B3 竞品 平台价差·档位间距「—（仅华为）」/
// B4 own-gap 只在涉事两档行亮徽标（低档/高档角色）/ B6 脏订阅整行「无价格数据」N-A/
// B7 跨口径订阅提示条 / V4 概览带可点化（点计数切只看异常再点回全部·监控中=清全部筛选）/
// V5a 「＋ 添加监控」主按钮化（级联本体不动）/ V5b 齿轮弹层补阈值滑杆快捷覆写（own-gap
// 阈值仍型号级只给开关）；V1 移除交互拍板 A = Popconfirm 维持现行。
// ============================================================
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { App as AntdApp, Badge, Button, Empty, Input, Popconfirm, Popover, Segmented, Select, Slider, Switch } from 'antd';
import { BellOutlined, CloseOutlined, PlusOutlined, SearchOutlined, SettingOutlined } from '@ant-design/icons';
import { usePage } from '../state/PageContext';
import { useAgent } from '../state/AgentContext';
import { useFilters } from '../state/FiltersContext';
import { navBus } from '../state/navBus';
import { dimChannel, dimProduct, dimTime } from '../data';
import {
  alertSeriesMeta,
  groupAlertsBySeries,
  groupAlertsByWeek,
  latestAlerts,
  type AlertItem,
  type AlertProductRule,
  type AlertSeriesMeta,
  type AlertType,
} from '../dataModel/alerts';
import {
  ALERT_LIFECYCLE_LABEL,
  ALERT_PRIORITY_LABEL,
  alertAgentContextOf,
  materializeAlertRecords,
  transitionAlertRecord,
  type AlertAction,
  type AlertRecord,
} from '../dataModel/alertLifecycle';
import { productSelectionOfSeriesKey } from '../state/urlSync';
import { getEffectiveBenchmark } from '../state/configStore';
import { defaultPlatformAnchorOf, priceForSelection, TIER_LABELS } from '../dataModel/aggregate';
import { tierLabelShort } from '../chart/PriceTrend/helpers';
import { autoComparesFor, buildCards } from '../state/mainSelection';
import usePageViewState from '../state/usePageViewState';
import { useNarrowViewport } from '../state/useNarrowViewport';
import {
  buildProductTree,
  filterProductTreeByTier,
  modelEntryInfo,
  ownBrand,
  searchProductTree,
  sortModelNodes,
  tiersOfScope,
  type ModelNode,
  type ModelSortMode,
  type RomramNode,
} from '../components/ProductCascader/tree';
import { CascadePanel, type CascadeColumnSpec, type CascadeRowItem } from '../components/ProductCascader';
import { POPOVER_H, pillW, ROW_GAP, StateTag, textW, useTopEscClose } from '../components/ProductPicker/pickerBits';
import PageHeader from '../components/PageHeader';
import BrandDot, { brandLabelOf } from '../components/BrandMark';
import { AlertDetailDrawer, alertDigest, TypePill, TYPE_STYLE, pctText, useAlerts } from '../components/AlertCenter';
import { color, fontSize, formatPrice, radius, shadow, space, selectSoft, selectSoftInk } from '../theme/tokens';
import { scopeLabels } from '../dataModel/scope';
import { provenanceSummary } from '../dataModel/provenance';
import { weeklyPriceProvenanceOf } from '../dataModel/priceProvenance';

/** 四类规则的文案与滑杆量程（追补⑨定稿沿用） */
const TYPE_RULES: Record<
  AlertType,
  { name: string; desc: string; min: number; max: number; step: number; below?: boolean }
> = {
  'price-change': {
    name: '调价预警',
    desc: '折后价较上一个有价周涨跌 ≥ 阈值（各品牌都通知；取代表色现价，随所选店铺，未选时为默认店铺）',
    min: 1,
    max: 15,
    step: 0.5,
  },
  promo: {
    name: '折扣预警',
    desc: '促销力度较上一个有价周变化 ≥ 阈值（取价口径与调价一致）',
    min: 1,
    max: 15,
    step: 0.5,
  },
  'platform-gap': {
    name: '平台价差预警',
    desc: `同一周各平台折后价的最高与最低差 ≥ 阈值（仅限 ${ownBrand()}；按该国全部平台计算，不受默认店铺与平台筛选影响）`,
    min: 0.5,
    max: 3,
    step: 0.1,
  },
  'own-gap': {
    name: '档位间距预警',
    desc: '同型号相邻 ROM 档现价间距 低于 阈值 → 两档太近、价位没有合理分开（型号级，全局阈值）',
    min: 5,
    max: 30,
    step: 1,
    below: true,
  },
};
const ORDER: AlertType[] = ['price-change', 'promo', 'platform-gap', 'own-gap'];

/** 阈值滑杆（松手生效）：拖动中数值只在本地预览，松手才写入配置——与看板
 *  「每格高度 / 价格变化提醒」滑杆同语言；预警为订阅集全量扫描，逐帧提交会卡顿 */
function ThresholdSlider({
  min,
  max,
  step,
  value,
  disabled,
  below,
  label,
  onCommit,
}: {
  min: number;
  max: number;
  step: number;
  value: number;
  disabled?: boolean;
  below?: boolean;
  label?: string;
  onCommit: (pct: number) => void;
}) {
  const [drag, setDrag] = useState<number | null>(null);
  const shown = drag ?? value;
  return (
    <>
      <Slider
        style={{ flex: 1, margin: '0 2px' }}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        ariaLabelForHandle={label}
        value={shown}
        onChange={(v) => setDrag(+(v as number))}
        onAfterChange={(v) => {
          setDrag(null);
          onCommit(+(v as number) / 100);
        }}
        tooltip={{ formatter: (v) => (below ? `< ${v}%` : `≥ ${v}%`) }}
      />
      <span className="tnum" style={{ fontSize: 12, fontWeight: 600, width: 58, whiteSpace: 'nowrap' }}>
        {below ? '< ' : '≥ '}
        {shown}%
      </span>
    </>
  );
}

/** 矩阵列栅格：产品 ｜ 四类 ｜ 行尾操作列（第一百九十二轮 44 → 68：齿轮+✕ 两钮；
 *  第五十五轮类型列 150 → 172：格内放最新预警凝练详情） */
const MATRIX_COLS = 'minmax(0,1fr) repeat(4, 172px) 68px';

/** 方向箭头（与看板 buildChangeMarks 同色：跌/折扣加深 = 琥珀 ↓、涨/收窄 = 蓝 ↑） */
function dirArrowOf(a: AlertItem): ReactNode {
  const mk = (down: boolean, title: string): ReactNode => (
    <span title={title} style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, color: down ? color.alert.promo.fg : color.link, width: 10, textAlign: 'center' }}>
      {down ? '↓' : '↑'}
    </span>
  );
  if (a.type === 'price-change' && a.wowPct != null && Math.abs(a.wowPct) > 1e-9) {
    return mk(a.wowPct < 0, `折后价较前周${a.wowPct < 0 ? '下降' : '上涨'} ${pctText(a.wowPct)}`);
  }
  if (a.type === 'promo' && a.promoDeltaPp != null && Math.abs(a.promoDeltaPp) > 1e-9) {
    return mk(a.promoDeltaPp > 0, `促销力度${a.promoDeltaPp > 0 ? '加深' : '收窄'} ${Math.abs(a.promoDeltaPp).toFixed(1)}pp`);
  }
  return null;
}

/** 从系列 label（品牌 型号 ROMRAM）截取 ROMRAM 段：romram 自带空格（12+512 GB），
 *  不能按空格取尾段（会取到「GB」），以 modelName 定位截取 */
const romOfLabel = (label: string | null, modelName: string): string =>
  label ? label.slice(label.indexOf(modelName) + modelName.length).trim() : '';

/** 周 id（YYYYWW）→ 带年份周号（2026W43，第一百五十二轮起与时间轴刻度同口径） */
const weekTag = (weekId: string): string => `${weekId.slice(0, 4)}W${weekId.slice(4)}`;

/** 单条触发（预警中心重构：加方向箭头；矩阵展开明细与事件流共用） */
function AlertRow({ a, currency, onOpen }: { a: AlertItem; currency: 'usd' | 'local'; onOpen: () => void }) {
  const detail =
    a.type === 'promo' ? (
      <>
        现价 {formatPrice(a.price, currency)} · 较 RRP {pctText(a.vsRrpPct)} · 促销力度
        {a.promoDeltaPp != null ? (a.promoDeltaPp > 0 ? '加深 ' : '收窄 ') : ''}
        {a.promoDeltaPp != null ? `${Math.abs(a.promoDeltaPp).toFixed(1)}pp` : '—'}
      </>
    ) : a.type === 'platform-gap' ? (
      <>
        {a.gapHighPlatform} {formatPrice(a.gapHighPrice, currency)} ／ {a.gapLowPlatform}{' '}
        {formatPrice(a.gapLowPrice, currency)}（价差 {pctText(a.gapPct)}）
      </>
    ) : a.type === 'own-gap' ? (
      <>
        {a.pairLowLabel} {formatPrice(a.pairLowPrice, currency)} ／ {a.pairHighLabel}{' '}
        {formatPrice(a.pairHighPrice, currency)}（间距 {pctText(a.ownGapPct)}，低于阈值）
      </>
    ) : (
      <>折后价较前周 {pctText(a.wowPct)} → 现价 {formatPrice(a.price, currency)}</>
    );
  // 第一百九十轮（外部 UX 审计落地）：挂 lpl-alert-row（窄屏换行，桌面样式不变）
  return (
    <div
      className="lpl-alert-row"
      data-alert-key={a.key}
      data-alert-series-key={a.seriesKey}
      data-alert-type={a.type}
      data-alert-week-id={a.weekId}
      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 2px', borderBottom: `1px solid ${color.hairline}` }}
    >
      <TypePill type={a.type} />
      {dirArrowOf(a)}
      <div style={{ minWidth: 0, flex: 1 }}>
        {/* 第一百九十轮（外部 UX 审计落地）：挂 lpl-alert-name（窄屏不截断换行，桌面 ellipsis 不变） */}
        <div className="lpl-alert-name" style={{ fontSize: 12, fontWeight: 600, color: color.ink, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {a.type === 'own-gap'
            ? `${a.modelName}（${[a.romram === '—' ? '' : a.romram, romOfLabel(a.pairHighLabel, a.modelName) === '—' ? '' : romOfLabel(a.pairHighLabel, a.modelName)].filter(Boolean).join(' × ')}）`
            : [a.brand, a.modelName, a.romram === '—' ? '' : a.romram].filter(Boolean).join(' ')}
        </div>
        <div className="tnum" style={{ fontSize: 11, color: color.body }}>
          {detail}
        </div>
      </div>
      <span className="tnum" style={{ fontSize: 11, color: color.mute, flexShrink: 0 }}>
        {a.weekLabel} · {weekTag(a.weekId)}
      </span>
      <Button
        size="small"
        style={{ height: 22, fontSize: 11 }}
        aria-label={`在看板查看 ${[a.brand, a.modelName, a.romram === '—' ? '' : a.romram].filter(Boolean).join(' ')} 的 ${weekTag(a.weekId)} 事件`}
        onClick={onOpen}
      >
        看板
      </Button>
    </div>
  );
}

/** 单条触发的「看板」跳转：带周焦点下钻，同时把主分析卡切到该产品
 *  （华为产品 = 主分析卡；竞品告警优先从对标矩阵反查映射的华为配置建卡，
 *  带矩阵对比区并开启「匹配竞品」（确保被告警的竞品在图中），
 *  矩阵未覆盖或无映射时该竞品自身成主分析卡） */
function useOpenInDashboard() {
  const { go } = usePage();
  const { state, actions } = useFilters();
  return (a: AlertItem): void => {
    navBus.dashboardFocusWeekId = a.weekId;
    const sel = productSelectionOfSeriesKey(a.seriesKey);
    if (sel && state.alertSubs.includes(a.seriesKey)) {
      if (a.isOwn) {
        actions.setMains(buildCards([sel]));
      } else {
        const normalize = (value: string): string => value.replace(/\s+/g, '');
        const competitorRom = normalize(sel.romram);
        const mapping = getEffectiveBenchmark().find((row) => {
          if (row.country_code !== state.countryCode) return false; // 多国矩阵：只认当前国家的映射
          if (!row.competitor_sku_id.startsWith(`${sel.modelId}__`)) return false;
          const product = dimProduct.find((p) => p.sku_id === row.competitor_sku_id);
          return product != null && normalize(product.romram) === competitorRom;
        });
        const mappedOwn = mapping
          ? productSelectionOfSeriesKey(`${mapping.own_model_id}__${normalize(mapping.own_romram)}`)
          : null;
        if (mappedOwn) {
          const auto = autoComparesFor({ id: 'probe', main: mappedOwn, compares: [] });
          const hasTarget = auto.some(
            (group) => group.modelId === sel.modelId && normalize(group.romram) === competitorRom,
          );
          // 映射命中：矩阵对比区带出目标竞品，建卡即开「匹配竞品」；
          // 矩阵异常缺失时显式补入该竞品（手动态）
          actions.setMains(
            hasTarget
              ? buildCards([mappedOwn], { auto: true })
              : buildCards([mappedOwn], { firstCompares: [sel] }),
          );
        } else {
          // 无映射：竞品自身即分析对象
          actions.setMains(buildCards([sel]));
        }
      }
    }
    go('dashboard');
  };
}

const ALERT_RECORDS_STORAGE = 'LPL.alert.records.v1';

function readAlertRecordOverrides(): Record<string, Partial<AlertRecord>> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(ALERT_RECORDS_STORAGE);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as Record<string, Partial<AlertRecord>>;
  } catch {
    return {};
  }
}

export default function AlertsPage() {
  const { state, actions } = useFilters();
  const { openAgent } = useAgent();
  const alerts = useAlerts();
  const openInDash = useOpenInDashboard();
  // R4（双 0 收口）：本页消息全部走 antd App.useApp() 的 context hook 消息 API
  //（App.tsx 已包 <AntdApp component={false}>）。静态 message.success 每次调用
  // 打「Static function can not consume context」console.error，Chrome 全场景
  // 双 0 不允许——添加监控/批量处理/阈值保存的反馈同口径收口。
  const { message } = AntdApp.useApp();
  const { country, industry } = scopeLabels(state);
  const platformLabel = useMemo(() => {
    const selection = state.platform;
    if (!selection || (selection.platforms.length === 0 && selection.shopIds.length === 0)) {
      // 未选 = 默认店铺链生效：默认店铺归属平台 → 兜底国家默认平台（defaultPlatformAnchorOf 统一出口）
      return defaultPlatformAnchorOf(state.countryCode) ?? '默认平台';
    }
    const shopNames = new Map(dimChannel.map((c) => [c.channel_id, c.display_name]));
    const base = [...selection.platforms, ...selection.shopIds.map((id) => shopNames.get(id) ?? id)].join('、');
    return selection.seller ? `${base} · ${selection.seller}` : base;
  }, [state.platform, state.countryCode]);

  // ---- 本页视图态：类型/品牌/状态筛选 + 排序 + 历史视图 = 会话态跨页保留
  //（usePageViewState，与两看板同约定）；modelFilter/focusAlert/expanded 属瞬态 ----
  const [typeFilter, setTypeFilter] = usePageViewState<'all' | AlertType>('alerts.typeFilter', () => 'all');
  const [brandFilter, setBrandFilter] = usePageViewState<string[]>('alerts.brandFilter', () => []);
  const [statusFilter, setStatusFilter] = usePageViewState<'all' | 'alerts' | 'normal'>('alerts.statusFilter', () => 'all');
  const [rowSort, setRowSort] = usePageViewState<'alerts-first' | 'latest' | 'name'>('alerts.rowSort', () => 'alerts-first');
  const [modelFilter, setModelFilter] = useState<{ id: string; name: string } | null>(null);
  const [focusAlert, setFocusAlert] = useState<{ seriesKey: string; type: AlertType; weekId: string } | null>(null);
  // 矩阵单元格展开（`${seriesKey}|${type}` → 行下展开该产品该类事件明细）；切筛选时收起
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // 历史事件 = 次级视图（第五十五轮，用户：主视觉只报最新，历史收进次级），默认折叠
  const [showHistory, setShowHistory] = usePageViewState<boolean>('alerts.showHistory', () => false);
  // P0/P1 处理状态先落本地，结构与后端 AlertRecord 保持一致；服务端接入时只替换持久化 adapter。
  // （第一百九十二轮收件箱剔除后仅剩 Agent 深链详情抽屉这一条消费通道）
  const [recordOverrides, setRecordOverrides] = useState<Record<string, Partial<AlertRecord>>>(readAlertRecordOverrides);
  const [detailRecordId, setDetailRecordId] = useState<string | null>(null);
  const toggleExp = (k: string): void =>
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const applyTypeFilter = (v: 'all' | AlertType): void => {
    setTypeFilter(v);
    setExpanded(new Set());
  };
  const clearAlertFilters = (): void => {
    setTypeFilter('all');
    setBrandFilter([]);
    setModelFilter(null);
    setStatusFilter('all');
    setExpanded(new Set());
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try { window.localStorage.setItem(ALERT_RECORDS_STORAGE, JSON.stringify(recordOverrides)); } catch { /* 本地存储不可用时继续使用内存态 */ }
  }, [recordOverrides]);

  useEffect(() => {
    const onAgentAlertUpdate = () => setRecordOverrides(readAlertRecordOverrides());
    window.addEventListener('pricelens:alert-records-updated', onAgentAlertUpdate);
    return () => window.removeEventListener('pricelens:alert-records-updated', onAgentAlertUpdate);
  }, []);

  // Agent 深链消费（B2 修复）：挂载消费走跨页深链；已在预警页时生产者派发
  // pricelens:alerts-focus 自定义事件驱动即时消费（原 [] effect 在页内深链永不触发）
  const consumeAlertsFocus = useCallback(() => {
    const focus = navBus.alertsFocus;
    if (!focus) return;
    if (focus.modelId) setModelFilter({ id: focus.modelId, name: focus.modelName ?? focus.modelId });
    if (focus.alertId) setDetailRecordId(focus.alertId);
    if (focus.seriesKey && focus.type && focus.weekId) {
      setTypeFilter(focus.type);
      setStatusFilter('all');
      setFocusAlert({ seriesKey: focus.seriesKey, type: focus.type, weekId: focus.weekId });
      setExpanded(new Set([`${focus.seriesKey}|${focus.type}`]));
    }
    navBus.alertsFocus = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    consumeAlertsFocus();
  }, [consumeAlertsFocus]);
  useEffect(() => {
    const onAlertsFocus = (): void => consumeAlertsFocus();
    window.addEventListener('pricelens:alerts-focus', onAlertsFocus);
    return () => window.removeEventListener('pricelens:alerts-focus', onAlertsFocus);
  }, [consumeAlertsFocus]);

  // 国家/产业切换 → 品牌筛选失效（brandFilter 会话态跨页保留，但品牌组随口径重建；
  // 旧口径品牌残留会让矩阵全不命中、误落「尚未添加监控产品」空态）。与总览页同款
  // 「上次口径键比对」写法：挂载首跑不清，避免击穿「切页保留」承诺
  const scopeSeenRef = useRef(`${state.countryCode}|${state.industry}`);
  useEffect(() => {
    const cur = `${state.countryCode}|${state.industry}`;
    if (scopeSeenRef.current === cur) return;
    scopeSeenRef.current = cur;
    setBrandFilter([]);
  }, [state.countryCode, state.industry, setBrandFilter]);

  useEffect(() => {
    if (!focusAlert) return;
    const timer = window.setTimeout(() => {
      const target = [...document.querySelectorAll<HTMLElement>('[data-alert-series-key]')].find(
        (el) => el.dataset.alertSeriesKey === focusAlert.seriesKey && el.dataset.alertType === focusAlert.type && el.dataset.alertWeekId === focusAlert.weekId,
      );
      const row = target ?? [...document.querySelectorAll<HTMLElement>('[data-alert-series-key]')].find((el) => el.dataset.alertSeriesKey === focusAlert.seriesKey);
      row?.scrollIntoView({ block: 'center', inline: 'nearest' });
      setFocusAlert(null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [focusAlert, expanded]);

  // ---- 订阅系列元数据，按品牌分组（华为品牌置顶，其余品牌字典序；组内按 label）----
  // 按当前国家/产业解析（与 useAlerts 同口径）——跨国订阅在他国口径下不显示、不计入概览
  const brandGroups = useMemo(() => {
    const scope = { countryCode: state.countryCode, industry: state.industry };
    const groups = new Map<string, { brand: string; isOwn: boolean; rows: { key: string; meta: AlertSeriesMeta }[] }>();
    for (const key of state.alertSubs) {
      const meta = alertSeriesMeta(key, scope);
      if (!meta) continue;
      let g = groups.get(meta.brand);
      if (!g) {
        g = { brand: meta.brand, isOwn: meta.isOwn, rows: [] };
        groups.set(meta.brand, g);
      }
      if (meta.isOwn) g.isOwn = true;
      g.rows.push({ key, meta });
    }
    return [...groups.values()]
      .map((g) => ({ ...g, rows: [...g.rows].sort((a, b) => a.meta.label.localeCompare(b.meta.label)) }))
      .sort((a, b) => (a.isOwn === b.isOwn ? a.brand.localeCompare(b.brand) : a.isOwn ? -1 : 1));
  }, [state.alertSubs, state.countryCode, state.industry]);

  // ---- B6/B7（2026-11-17 拍板轮）：脏订阅与跨口径订阅识别 ----
  // 脏订阅 = 系列在当前口径全周无价格事实（旧搜索下拉的历史遗留）：矩阵行整行 N/A，
  // 不再恒「正常」假阴性。口径 = 代表 SKU 任一周有价（与引擎代表色单 SKU 同近似）。
  const noDataRowKeys = useMemo(() => {
    const set = new Set<string>();
    for (const key of state.alertSubs) {
      const meta = alertSeriesMeta(key, { countryCode: state.countryCode, industry: state.industry });
      if (!meta) continue; // 跨口径订阅归 B7 提示，不在此列
      let hasPrice = false;
      for (let i = dimTime.length - 1; i >= 0; i--) {
        if (priceForSelection(meta.skuId, dimTime[i].week_id, state.countryCode, null, 'usd')) {
          hasPrice = true;
          break;
        }
      }
      if (!hasPrice) set.add(key);
    }
    return set;
  }, [state.alertSubs, state.countryCode, state.industry]);
  // 跨口径订阅数（他国/他产业下 meta = null）：空态误读「没订阅过」的提示条数据源
  const foreignSubCount = useMemo(
    () =>
      state.alertSubs.filter(
        (key) => alertSeriesMeta(key, { countryCode: state.countryCode, industry: state.industry }) == null,
      ).length,
    [state.alertSubs, state.countryCode, state.industry],
  );

  const bySeries = useMemo(() => groupAlertsBySeries(alerts), [alerts]);
  // 最新态（第五十五轮，用户口径：主视觉只报最新、历史进次级）：计数与单元格都按「每系列×类型最新一条」
  const latestList = useMemo(() => latestAlerts(alerts), [alerts]);
  const alertCfg = useMemo(() => ({
    subs: state.alertSubs,
    enabled: state.alertTypes,
    thresholds: state.alertThresholds,
    products: state.alertProducts,
    currency: state.currency,
    scope: { countryCode: state.countryCode, industry: state.industry },
    platform: state.platform,
  }), [state.alertSubs, state.alertTypes, state.alertThresholds, state.alertProducts, state.currency, state.countryCode, state.industry, state.platform]);
  const sourceProvenance = weeklyPriceProvenanceOf(alertCfg.scope);
  const records = useMemo(
    () => materializeAlertRecords(latestList, alertCfg, recordOverrides),
    [latestList, alertCfg, recordOverrides],
  );
  const recordsById = useMemo(() => new Map(records.map((record) => [record.alertId, record])), [records]);
  const detailRecord = detailRecordId ? recordsById.get(detailRecordId) ?? null : null;
  const updateRecord = (record: AlertRecord, action: AlertAction): void => {
    const next = transitionAlertRecord(record, action);
    if (!next) {
      message.warning('当前状态已变化，请刷新后重试');
      return;
    }
    setRecordOverrides((prev) => ({ ...prev, [record.alertId]: next }));
    message.success(`${ALERT_LIFECYCLE_LABEL[next.lifecycle]} · ${record.modelName}`);
  };
  const latestBySeries = useMemo(() => groupAlertsBySeries(latestList), [latestList]);
  const scopedLatest = useMemo(() => {
    const matchBrand = (brand: string): boolean => brandFilter.length === 0 || brandFilter.includes(brand);
    const matchModel = (key: string): boolean => !modelFilter || key.startsWith(`${modelFilter.id}__`);
    // 与矩阵 activeCountFor 同一口径：是否「有预警」按当前类型判断。
    // 旧实现看系列是否在 latestList 里出现过，入选条目恒为真，「只看正常」把概览清成 0。
    const activeFor = (key: string, type: 'all' | AlertType): boolean => {
      const items = latestBySeries.get(key) ?? [];
      return type === 'all' ? items.length > 0 : items.some((a) => a.type === type);
    };
    return latestList.filter((a) => {
      if (!matchBrand(a.brand) || !matchModel(a.seriesKey)) return false;
      if (typeFilter !== 'all' && a.type !== typeFilter) return false;
      if (statusFilter === 'all') return true;
      const active = activeFor(a.seriesKey, typeFilter);
      return statusFilter === 'alerts' ? active : !active;
    });
  }, [latestList, latestBySeries, brandFilter, modelFilter, statusFilter, typeFilter]);
  const latestModelCount = useMemo(() => new Set(scopedLatest.map((a) => a.seriesKey.split('__')[0])).size, [scopedLatest]);
  // 类型芯片各自计数，不因「当前选中的类型」把其余芯片清零。
  // 「只看正常」数的是没有该类型最新预警的系列，与矩阵行一致，不再是恒 0 的预警条数。
  const typeCounts = useMemo(() => {
    const c: Record<AlertType, number> = { 'price-change': 0, promo: 0, 'platform-gap': 0, 'own-gap': 0 };
    const matchBrand = (brand: string): boolean => brandFilter.length === 0 || brandFilter.includes(brand);
    const matchModel = (key: string): boolean => !modelFilter || key.startsWith(`${modelFilter.id}__`);
    const activeFor = (key: string, type: AlertType): boolean =>
      (latestBySeries.get(key) ?? []).some((a) => a.type === type);
    if (statusFilter === 'normal') {
      for (const g of brandGroups) {
        if (!matchBrand(g.brand)) continue;
        for (const row of g.rows) {
          if (!matchModel(row.key)) continue;
          for (const t of ORDER) if (!activeFor(row.key, t)) c[t] += 1;
        }
      }
      return c;
    }
    for (const a of latestList) {
      if (!matchBrand(a.brand) || !matchModel(a.seriesKey)) continue;
      c[a.type] += 1;
    }
    return c;
  }, [latestList, latestBySeries, brandGroups, brandFilter, modelFilter, statusFilter]);
  const allChipCount = useMemo(() => {
    const matchBrand = (brand: string): boolean => brandFilter.length === 0 || brandFilter.includes(brand);
    const matchModel = (key: string): boolean => !modelFilter || key.startsWith(`${modelFilter.id}__`);
    if (statusFilter === 'normal') {
      let n = 0;
      for (const g of brandGroups) {
        if (!matchBrand(g.brand)) continue;
        for (const row of g.rows) {
          if (!matchModel(row.key)) continue;
          if ((latestBySeries.get(row.key)?.length ?? 0) === 0) n += 1;
        }
      }
      return n;
    }
    let n = 0;
    for (const a of latestList) if (matchBrand(a.brand) && matchModel(a.seriesKey)) n += 1;
    return n;
  }, [latestList, latestBySeries, brandGroups, brandFilter, modelFilter, statusFilter]);
  const scopedLatestCount = scopedLatest.length;
  // own-gap 按型号归档（矩阵「型号级」单元格计数用；不受本页筛选影响）
  const gapByModel = useMemo(() => {
    const m = new Map<string, AlertItem[]>();
    for (const a of latestList) {
      if (a.type !== 'own-gap') continue;
      const modelId = a.seriesKey.split('__')[0];
      const arr = m.get(modelId);
      if (arr) arr.push(a);
      else m.set(modelId, [a]);
    }
    return m;
  }, [latestList]);

  // 概览计数 = 当前口径有效订阅数（跨国订阅在他国口径下不计入，与矩阵行一致）
  const subCount = brandGroups.reduce((n, g) => n + g.rows.length, 0);
  const ownCount = brandGroups.filter((g) => g.isOwn).reduce((n, g) => n + g.rows.length, 0);
  const brandOptions = brandGroups.map((g) => ({ value: g.brand, label: g.brand }));
  const matchBrand = (brand: string): boolean => brandFilter.length === 0 || brandFilter.includes(brand);
  const matchModel = (key: string): boolean => !modelFilter || key.startsWith(`${modelFilter.id}__`);
  const activeCountFor = (key: string): number => {
    const items = latestBySeries.get(key) ?? [];
    return typeFilter === 'all' ? items.length : items.filter((a) => a.type === typeFilter).length;
  };
  const matchStatus = (key: string): boolean => {
    const active = activeCountFor(key) > 0;
    return statusFilter === 'alerts' ? active : statusFilter === 'normal' ? !active : true;
  };
  const latestWeekFor = (key: string): string => {
    const item = (latestBySeries.get(key) ?? []).find((x) => typeFilter === 'all' || x.type === typeFilter);
    return item?.weekId ?? '';
  };
  const visibleGroups = brandGroups
    .map((g) => ({
      ...g,
      rows: [...g.rows]
        .filter((r) => matchModel(r.key) && matchStatus(r.key))
        .sort((a, b) => {
          if (rowSort === 'alerts-first') return activeCountFor(b.key) - activeCountFor(a.key) || a.meta.label.localeCompare(b.meta.label);
          if (rowSort === 'latest') {
            // 类型筛选时按所选类型的最新周排序，避免「折扣」筛选却被较新的调价事件抢到前面。
            const aw = latestWeekFor(a.key);
            const bw = latestWeekFor(b.key);
            return bw.localeCompare(aw) || a.meta.label.localeCompare(b.meta.label);
          }
          return a.meta.label.localeCompare(b.meta.label);
        }),
    }))
    .filter((g) => matchBrand(g.brand) && g.rows.length > 0);
  const overviewCount = statusFilter === 'normal'
    ? visibleGroups.reduce((n, g) => n + g.rows.length, 0)
    : scopedLatestCount;
  const overviewUnit = statusFilter === 'normal' ? '个正常系列' : '条最新预警';

  // 事件流 = 全量触发 → 类型+品牌筛选 → 截断 150 → 按周分组
  const filtered = useMemo(
    () => {
      // 历史事件只承载已触发的异常；「只看正常」时不应继续展示异常历史，
      // 否则历史区与矩阵状态筛选口径相反。
      if (statusFilter === 'normal') return [];
      return alerts.filter(
        (a) =>
          (typeFilter === 'all' || a.type === typeFilter) &&
          matchBrand(a.brand) &&
          matchModel(a.seriesKey),
      );
    },
    [alerts, typeFilter, brandFilter, modelFilter, statusFilter],
  );
  const shown = useMemo(() => filtered.slice(0, 150), [filtered]);
  const weekGroups = useMemo(() => groupAlertsByWeek(shown), [shown]);
  const latestFiltered = useMemo(
    () => {
      // 正常状态没有「最新事件」；避免 own-gap 条带在「只看正常」时仍显示。
      if (statusFilter === 'normal') return [];
      return latestList.filter((a) => (typeFilter === 'all' || a.type === typeFilter) && matchBrand(a.brand) && matchModel(a.seriesKey));
    },
    [latestList, typeFilter, brandFilter, modelFilter, statusFilter],
  );
  const gapItems = useMemo(() => latestFiltered.filter((a) => a.type === 'own-gap'), [latestFiltered]);
  // 第一百九十一轮（桌面实拍审计）：概览两卡副行细节收进 title 兜底——状态带只留「数字+标签」，
  // 原文案逐字保留在悬停提示里，删版式不删信息（非交互统计沿用页内 title 惯例，不占用 aria 名）。
  // 「只看正常」时历史被口径刻意隐藏（filtered 早退为 []），尾注「历史 0 条」会误读为
  // 无历史记录——该分支维持原状不拼历史尾注
  const overviewDetail = statusFilter === 'normal'
    ? '这些系列在当前类型下没有最新预警'
    : `最新触发 ${scopedLatestCount > 0 ? `${weekTag(scopedLatest[0].weekId)}（${scopedLatest[0].weekLabel} 采集周）` : '—'}${scopedLatestCount > 0 ? ` · 涉及 ${latestModelCount} 个产品` : ''}${filtered.length !== latestFiltered.length ? ` · 历史 ${filtered.length} 条` : ''}`;
  const monitorDetail = `${ownBrand()} ${ownCount} · 其他品牌 ${subCount - ownCount} · 单独设置 ${Object.keys(state.alertProducts).length} 项`;
  const matrixEmptyText = modelFilter
    ? '该产品尚未启用预警监控，或当前筛选下没有匹配系列'
    : statusFilter === 'alerts'
      ? '当前没有触发最新预警的产品'
      : statusFilter === 'normal'
        ? '当前没有符合条件的正常产品'
        : '尚未添加监控产品 — 在上方搜索添加，或在看板点产品旁的铃铛';
  const alertStatusLabel = statusFilter === 'alerts' ? '只看异常' : statusFilter === 'normal' ? '只看正常' : '全部状态';
  const alertTypeLabel = typeFilter === 'all' ? '全部类型' : TYPE_STYLE[typeFilter].label;
  const agentAlertPrompt = `解释预警中心当前筛选下的最新预警：${alertTypeLabel}、${alertStatusLabel}${brandFilter.length ? `、品牌 ${brandFilter.join('、')}` : ''}${modelFilter ? `、产品 ${modelFilter.name}` : ''}。请列出触发事实、证据关联和下一步核查动作。`;
  const hasAlertFilters = typeFilter !== 'all' || brandFilter.length > 0 || modelFilter != null || statusFilter !== 'all';

  // 添加监控（第一百九十二轮 Eason ③）：级联勾选后清品牌/状态筛选并滚动定位到新行
  //（多品牌时新行位置不可预期，避免「加没加上」的疑惑——原 Select onChange 同款承诺）
  const onMonitorAdded = (addedKeys: string[]): void => {
    if (addedKeys.length === 0) return;
    setBrandFilter([]);
    setStatusFilter('all');
    setFocusAlert({ seriesKey: addedKeys[0], type: 'price-change', weekId: '' });
  };

  // ---- 矩阵列头：类型名 + 全局开关 + 阈值 Popover（「全局规则」收编于此）----
  const renderTypeHead = (t: AlertType): ReactNode => {
    const rule = TYPE_RULES[t];
    const on = state.alertTypes[t];
    const val = +(state.alertThresholds[t] * 100).toFixed(1);
    const dim = typeFilter !== 'all' && typeFilter !== t;
    return (
      <div
        key={t}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2,
          padding: '8px 6px',
          borderRight: `1px solid ${color.hairline}`,
          opacity: dim ? 0.35 : 1,
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <Switch size="small" checked={on} aria-label={`${rule.name}总开关`} onChange={(v) => actions.setAlertTypes({ [t]: v })} />
          <span style={{ fontSize: 12, fontWeight: 700, color: on ? color.mute : color.hairlineStrong, whiteSpace: 'nowrap' }}>
            {rule.name.replace('预警', '')}
            {rule.below && (
              <span style={{ fontSize: 11, color: color.alert.ownGap.fg, marginLeft: 3, fontWeight: 600 }}>低于触发</span>
            )}
          </span>
        </span>
        <Popover
          trigger="click"
          placement="bottom"
          content={
            <div style={{ width: 260 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: color.ink, marginBottom: 2 }}>{rule.name}</div>
              <div style={{ fontSize: 11, color: color.mute, marginBottom: 8, lineHeight: '15px' }}>{rule.desc}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <ThresholdSlider
                  min={rule.min}
                  max={rule.max}
                  step={rule.step}
                  disabled={!on}
                  value={val}
                  below={rule.below}
                  label={`${rule.name}阈值滑杆`}
                  onCommit={(pct) => {
                    actions.setAlertThresholds({ [t]: pct });
                    message.success(`${rule.name}阈值已保存`, 1.2);
                  }}
                />
              </div>
            </div>
          }
        >
          {/* 第一百八十五轮：span → 原生 button（键盘 Enter/Space 原生可达）；
              关断态文字 hairlineStrong → color.mute（可点文字不用 hairlineStrong，2.58:1 → 4.7:1） */}
          <button
            type="button"
            className="tnum"
            title={`${rule.name}全局阈值（点击调整）`}
            aria-label={`${rule.name}全局阈值（当前 ${val}%，点击调整）`}
            style={{
              fontSize: 11,
              color: on ? color.link : color.mute,
              cursor: on ? 'pointer' : 'default',
              borderBottom: `1px dashed ${on ? `${color.link}80` : 'transparent'}`,
              whiteSpace: 'nowrap',
            }}
          >
            {rule.below ? '<' : '≥'}
            {val}% ⌄
          </button>
        </Popover>
      </div>
    );
  };

  // ---- 单元格阈值覆写触发器（蓝虚线 = 已覆写；Popover 内 开关+滑杆+清除覆写）----
  const renderOverride = (rowKey: string, rule: AlertProductRule | undefined, t: AlertType, seriesLabel: string): ReactNode => {
    const r = TYPE_RULES[t];
    const on = rule?.types?.[t] ?? state.alertTypes[t];
    const thrVal = +((rule?.thresholds?.[t] ?? state.alertThresholds[t]) * 100).toFixed(1);
    const thrOverridden = rule?.thresholds?.[t] != null;
    const typeOverridden = rule?.types?.[t] != null;
    return (
      <Popover
        trigger="click"
        placement="bottom"
        content={
          <div style={{ width: 240 }}>
            <div style={{ fontSize: 12, color: color.mute, marginBottom: 8 }}>
              为该产品单独设置（留空跟随全局）
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Switch
                size="small"
                checked={on}
                aria-label={`${seriesLabel} ${r.name}开关`}
                onChange={(v) => {
                  const next = { ...(rule?.types ?? {}), [t]: v };
                  // 回落全局时清掉覆写（勾选态 = 全局态则删除键）
                  if (next[t] === state.alertTypes[t]) delete next[t];
                  actions.setAlertProductRule(rowKey, { ...(rule ?? {}), types: next });
                }}
              />
              <ThresholdSlider
                min={r.min}
                max={r.max}
                step={r.step}
                value={thrVal}
                below={r.below}
                label={`${seriesLabel} ${r.name}阈值滑杆`}
                  onCommit={(pct) => {
                    actions.setAlertProductRule(rowKey, {
                      ...(rule ?? {}),
                      thresholds: { ...(rule?.thresholds ?? {}), [t]: pct },
                    });
                    message.success(`${seriesLabel}的${r.name}阈值已保存`, 1.2);
                  }}
              />
            </div>
            {(thrOverridden || typeOverridden) && (
              <div style={{ marginTop: 8, textAlign: 'right' }}>
                <Button
                  size="small"
                  onClick={() => {
                    const th = { ...(rule?.thresholds ?? {}) };
                    delete th[t];
                    const ty = { ...(rule?.types ?? {}) };
                    delete ty[t];
                    actions.setAlertProductRule(rowKey, { ...(rule ?? {}), thresholds: th, types: ty });
                  }}
                >
                  恢复全局设置（{r.below ? '<' : '≥'}
                  {+(state.alertThresholds[t] * 100).toFixed(1)}%）
                </Button>
              </div>
            )}
          </div>
        }
      >
        {/* 第一百八十五轮：span → 原生 button（键盘 Enter/Space 原生可达）；
            未覆写态 hairlineStrong → color.mute、10px → 11px（2.58:1 → 4.7:1，可读性达标） */}
        <button
          type="button"
          title={thrOverridden ? '已单独设置阈值' : '跟随全局，点击单独设置'}
          aria-label={`${seriesLabel} ${r.name}阈值（当前 ${thrVal}%${thrOverridden ? '，已单独设置' : ''}，点击调整）`}
          className="tnum"
          style={{
            fontSize: 11,
            fontWeight: thrOverridden ? 700 : 400,
            color: thrOverridden ? color.link : color.mute,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            borderBottom: thrOverridden ? `1px dashed ${color.link}` : 'none',
          }}
        >
          {r.below ? '<' : '≥'}
          {thrVal}%{thrOverridden ? ' *' : ''}
        </button>
      </Popover>
    );
  };

  // ---- 矩阵单元格（三态：— / 正常 / 触发徽标；own-gap = 型号级涉事行亮）----
  const renderCell = (rowKey: string, meta: AlertSeriesMeta, t: AlertType): ReactNode => {
    const dim = typeFilter !== 'all' && typeFilter !== t;
    const wrap = (children: ReactNode): ReactNode => (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          paddingBlock: 8,
          paddingInline: 6,
          borderRight: `1px solid ${color.hairline}`,
          opacity: dim ? 0.35 : 1,
          minWidth: 0,
        }}
      >
        {children}
      </div>
    );
    // N/A 语言（2026-11-17 拍板 V2）：引擎不可能触发的格子诚实标注原因，不再假「正常」
    const naCell = (why: string): ReactNode => (
      <span style={{ fontSize: 11, color: color.hairlineStrong, textAlign: 'center', lineHeight: '13px' }}>
        —
        <span style={{ fontSize: 10, display: 'block' }}>{why}</span>
      </span>
    );
    // B6：脏订阅（当前口径全周无价格事实）——整行 N/A，不再恒「正常」假阴性
    if (noDataRowKeys.has(rowKey)) {
      return wrap(
        <span title="该产品在当前口径无价格数据，暂不产生预警；可点行尾 ✕ 移除监控" style={{ fontSize: 11, color: color.hairlineStrong, textAlign: 'center', lineHeight: '13px', cursor: 'help' }}>
          —
          <span style={{ fontSize: 10, display: 'block' }}>无价格数据</span>
        </span>,
      );
    }
    // 档位间距：型号级阈值（列头全局调）——竞品行「—（仅华为）」；产品级开关可关掉
    // 本档参与（引擎同口径 = 该档退出成对计算）；B4：只在涉事两档行亮徽标（低价档/
    // 高档角色），同型号其余档位行弱化为灰字「型号级」，不再每行重复亮 ×N
    if (t === 'own-gap') {
      if (!meta.isOwn) {
        return wrap(naCell('仅华为'));
      }
      const gapOn = state.alertProducts[rowKey]?.types?.['own-gap'] ?? state.alertTypes['own-gap'];
      if (!gapOn) {
        return wrap(<span style={{ fontSize: 11, color: color.hairlineStrong }}>—</span>);
      }
      const myPairs = (gapByModel.get(rowKey.split('__')[0]) ?? []).filter(
        (a) => a.seriesKey === rowKey || a.pairHighSeriesKey === rowKey,
      );
      if (myPairs.length === 0) {
        return wrap(<span style={{ fontSize: 11, color: color.mute }}>型号级</span>);
      }
      const asLow = myPairs.filter((a) => a.seriesKey === rowKey).length;
      const asHigh = myPairs.length - asLow;
      const role = asLow > 0 && asHigh > 0 ? '成对' : asLow > 0 ? '低档' : '高档';
      return wrap(
        <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <span
            title={`本档参与 ${myPairs.length} 对档位间距（${asLow} 对作为低价档、${asHigh} 对作为高价档），成对明细见型号组下方`}
            style={{
              padding: '0 6px',
              fontSize: 10,
              fontWeight: 700,
              lineHeight: '16px',
              borderRadius: radius.pill,
              color: TYPE_STYLE['own-gap'].fg,
              background: TYPE_STYLE['own-gap'].bg,
              whiteSpace: 'nowrap',
            }}
          >
            型号级 · {role}{myPairs.length > 1 ? ` ×${myPairs.length}` : ''}
          </span>
          <span style={{ fontSize: 11, color: color.mute }}>成对明细见下</span>
        </span>,
      );
    }
    // B3：平台价差引擎仅对华为系列触发——竞品行诚实 N/A，不再渲染覆写触发器
    if (t === 'platform-gap' && !meta.isOwn) {
      return wrap(naCell('仅华为'));
    }
    const rule = state.alertProducts[rowKey];
    const on = rule?.types?.[t] ?? state.alertTypes[t];
    const all = (bySeries.get(rowKey) ?? []).filter((a) => a.type === t);
    const latest = all[0]; // 周降序 → 首条即最新
    const expKey = `${rowKey}|${t}`;
    const open = expanded.has(expKey);
    return wrap(
      <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, maxWidth: '100%' }}>
        {!on || latest == null ? (
          <span style={{ fontSize: 11, color: !on ? color.hairlineStrong : color.alert.evidence.verified }}>{!on ? '—' : '正常'}</span>
        ) : (
          <span
            role="button"
            tabIndex={0}
            title={`${TYPE_STYLE[t].label}最新触发 · ${weekTag(latest.weekId)}（${latest.weekLabel}）· 点击${open ? '收起' : '展开历史'}`}
            onClick={() => toggleExp(expKey)}
            onKeyDown={(e) => {
              // 第一百八十五轮（键盘可达）：表格单元格内布局敏感保留 span 外壳，
              // Enter / Space 触发与点击等价（Space 阻止默认滚动）
              if (e.key !== 'Enter' && e.key !== ' ') return;
              e.preventDefault();
              toggleExp(expKey);
            }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', maxWidth: '100%' }}
          >
            <span
              style={{
                flexShrink: 0,
                padding: '0 6px',
                fontSize: 10,
                fontWeight: 700,
                lineHeight: '16px',
                borderRadius: radius.pill,
                color: TYPE_STYLE[t].fg,
                background: TYPE_STYLE[t].bg,
                whiteSpace: 'nowrap',
              }}
            >
              {TYPE_STYLE[t].short}
            </span>
            <span
              className="tnum"
              style={{ fontSize: 11, fontWeight: 600, color: color.body, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: open ? 'underline' : undefined }}
            >
              {alertDigest(latest, state.currency)}
            </span>
          </span>
        )}
        {renderOverride(rowKey, rule, t, meta.label)}
      </span>,
    );
  };

  // ---- 单产品规则设置（行尾齿轮）：四类开关 + 阈值滑杆一处设置（第一百九十二轮 ② +
  //      拍板轮 V5b 增强）。覆写语义与单元格一致：与全局同值即清键回落；竞品行
  //      平台价差/档位间距 引擎本就仅华为触发 → 禁用标注「仅华为」；own-gap 阈值仍为
  //      型号级全局（只给开关），关档 = 退出型号内成对计算。 ----
  const renderRowSettings = (key: string, meta: AlertSeriesMeta): ReactNode => {
    const rule = state.alertProducts[key];
    const overridden = rule != null && (Object.keys(rule.types ?? {}).length > 0 || Object.keys(rule.thresholds ?? {}).length > 0);
    const rows: { t: AlertType; ownOnly?: boolean }[] = [
      { t: 'price-change' },
      { t: 'promo' },
      { t: 'platform-gap', ownOnly: true },
      { t: 'own-gap', ownOnly: true },
    ];
    const setRuleType = (t: AlertType, v: boolean): void => {
      const next = { ...(rule?.types ?? {}), [t]: v };
      if (next[t] === state.alertTypes[t]) delete next[t]; // 与全局同值 = 清键回落
      actions.setAlertProductRule(key, { ...(rule ?? {}), types: next });
    };
    const setRuleThreshold = (t: AlertType, pct: number): void => {
      const r = TYPE_RULES[t];
      const next = { ...(rule?.thresholds ?? {}), [t]: pct };
      const nextVal = next[t];
      if (nextVal != null && Math.abs(nextVal - state.alertThresholds[t]) < 1e-9) delete next[t]; // 与全局同值 = 清键回落
      actions.setAlertProductRule(key, { ...(rule ?? {}), thresholds: next });
      message.success(`${meta.label}的${r.name}阈值已保存`, 1.2);
    };
    return (
      <Popover
        trigger="click"
        placement="bottomRight"
        content={
          <div style={{ width: 344 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: color.ink, marginBottom: 2 }}>该产品的预警规则</div>
            <div style={{ fontSize: 11, color: color.mute, marginBottom: 10, lineHeight: '15px' }}>
              每类独立开关与阈值；未单独设置时跟随列头全局；与全局同值自动回落
            </div>
            <div style={{ display: 'grid', gap: 11 }}>
              {rows.map(({ t, ownOnly }) => {
                const r = TYPE_RULES[t];
                const na = ownOnly === true && !meta.isOwn;
                const on = rule?.types?.[t] ?? state.alertTypes[t];
                const typeOverridden = rule?.types?.[t] != null;
                const thrOverridden = rule?.thresholds?.[t] != null;
                const thrVal = +((rule?.thresholds?.[t] ?? state.alertThresholds[t]) * 100).toFixed(1);
                return (
                  <div key={t}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Switch
                        size="small"
                        checked={on}
                        disabled={na}
                        aria-label={`${meta.label} ${r.name}开关`}
                        onChange={(v) => setRuleType(t, v)}
                      />
                      <span style={{ fontSize: 12, color: na ? color.mute : color.ink, flex: 1, minWidth: 0 }}>
                        {r.name.replace('预警', '')}
                      </span>
                      <span style={{ fontSize: 11, flexShrink: 0, color: na ? color.hairlineStrong : typeOverridden || thrOverridden ? color.link : color.mute }}>
                        {na ? '仅华为' : typeOverridden || thrOverridden ? '已单独设置' : '跟随全局'}
                      </span>
                    </div>
                    {/* V5b：阈值滑杆快捷覆写（own-gap 阈值型号级全局——只给开关不给滑杆；
                        竞品不可用行（na）不渲染滑杆；开关关闭时滑杆一并禁用） */}
                    {!r.below && !na && (
                      <div style={{ display: 'flex', alignItems: 'center', marginTop: 3 }}>
                        <ThresholdSlider
                          min={r.min}
                          max={r.max}
                          step={r.step}
                          disabled={na || !on}
                          value={thrVal}
                          below={r.below}
                          label={`${meta.label} ${r.name}阈值滑杆`}
                          onCommit={(pct) => setRuleThreshold(t, pct)}
                        />
                        {thrOverridden && <span style={{ fontSize: 10, color: color.link, marginLeft: 2 }}>＊</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 10, fontSize: 11, color: color.mute, lineHeight: '15px' }}>
              带 ＊ 为已单独设置，拖动松手生效；档位间距为型号级阈值（列头调整），关闭某档位 = 该档位退出型号内成对计算
            </div>
            {overridden && (
              <div style={{ marginTop: 9, textAlign: 'right' }}>
                <Button
                  size="small"
                  onClick={() => {
                    actions.setAlertProductRule(key, null);
                    message.success(`已恢复全局设置：${meta.label}`, 1.2);
                  }}
                >
                  全部恢复跟随全局
                </Button>
              </div>
            )}
          </div>
        }
      >
        {/* 有任意覆写（开关/阈值）时齿轮挂蓝点提示「该产品已脱离全局默认」 */}
        <Badge dot={overridden} color={color.link}>
          <button
            type="button"
            className="lpl-hit"
            aria-label={`${meta.label} 预警规则设置`}
            title="该产品的预警类型设置"
            style={{
              position: 'relative', // .lpl-hit::after 挂在本体上（命中区外扩不落页级祖先）
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 24,
              height: 24,
              borderRadius: radius.control,
              color: overridden ? color.link : color.mute,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <SettingOutlined style={{ fontSize: 12 }} />
          </button>
        </Badge>
      </Popover>
    );
  };

  // ---- 矩阵行：产品 ｜ 四类 ｜ 行尾操作（齿轮设置 + ✕ 移除）；展开明细条随行渲染 ----
  const renderSeriesRow = (key: string, meta: AlertSeriesMeta, idx: number): ReactNode => {
    const items = bySeries.get(key) ?? [];
    const openTs = ORDER.filter((t) => t !== 'own-gap' && expanded.has(`${key}|${t}`));
    return (
      <div key={key} data-alert-series-key={key} style={{ borderTop: idx > 0 ? `1px solid ${color.hairline}` : undefined }}>
        <div style={{ display: 'grid', gridTemplateColumns: MATRIX_COLS, alignItems: 'stretch' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              paddingLeft: 16,
              paddingRight: 10,
              paddingBlock: 8,
              borderRight: `1px solid ${color.hairline}`,
              minWidth: 0,
            }}
          >
            <BrandDot brand={meta.brand} />
            <span
              title={noDataRowKeys.has(key) ? `${meta.label}（当前口径无价格数据，暂不产生预警）` : meta.label}
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: noDataRowKeys.has(key) ? color.mute : color.ink,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {meta.label}
            </span>
            {noDataRowKeys.has(key) && (
              <span style={{ fontSize: 10, color: color.hairlineStrong, flexShrink: 0, border: `1px solid ${color.hairline}`, borderRadius: radius.pill, padding: '0 6px', lineHeight: '15px' }}>
                无价格数据
              </span>
            )}
          </div>
          {ORDER.map((t) => (
            <CellSlot key={t}>{renderCell(key, meta, t)}</CellSlot>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, paddingBlock: 8 }}>
            {renderRowSettings(key, meta)}
            {/* 第一百九十二轮 Eason ③：铃铛退役改 ✕——铃铛语义是订阅开关不是删除，
                误点即整行消失（反馈原话「点了之后就直接没掉了」）；✕ 走 Popconfirm 二次确认 */}
            <Popconfirm
              title="移除该监控？"
              description={`移除后「${meta.label}」不再产生预警，可随时重新添加`}
              okText="移除"
              cancelText="取消"
              okButtonProps={{ danger: true }}
              onConfirm={() => {
                actions.toggleAlertSub(key);
                message.success(`已移除监控：${meta.label}`);
              }}
            >
              <button
                type="button"
                className="lpl-hit"
                aria-label={`移除监控 ${meta.label}`}
                title="移除监控"
                style={{
                  position: 'relative', // .lpl-hit::after 挂在本体上（命中区外扩不落页级祖先）
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 24,
                  height: 24,
                  borderRadius: radius.control,
                  color: color.mute,
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                <CloseOutlined style={{ fontSize: 12 }} />
              </button>
            </Popconfirm>
          </div>
        </div>
        {openTs.length > 0 && (
          <div style={{ background: color.canvasSoft, padding: '2px 16px 4px' }}>
            {openTs
              .flatMap((t) => items.filter((a) => a.type === t))
              .map((a) => (
                <AlertRow key={a.key} a={a} currency={state.currency} onOpen={() => openInDash(a)} />
              ))}
          </div>
        )}
      </div>
    );
  };

  // 零监控首启态（第一百八十二轮评审）：概览条零统计、无效筛选、阈值表头、历史事件
  // 全部退场，空看板正中一句说明 + 添加入口；加上第一个监控后恢复完整界面
  const emptyMode = subCount === 0;

  return (
    <div style={{ height: '100%', overflowX: 'auto', overflowY: 'auto', background: color.canvasSoft }} data-lpl-scroll>
      <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* 顶栏 64px（共享 PageHeader，预警中心重构统一四页铬架） */}
        <PageHeader title="预警中心" />

        {/* 空态时主区转纵向 flex（第一百九十一轮）：矩阵卡 flex:1 撑满剩余视口并垂直居中，
            不再停在页面上部、下方留 ~480px 纯空；非空态保持常规文档流不变 */}
        <main style={{ flex: 1, padding: space.lg, ...(emptyMode ? { display: 'flex', flexDirection: 'column' } : null) }}>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: space.sm, color: color.mute, fontSize: 11 }}>
            <span>{country} · {industry}</span>
            <span aria-hidden>·</span>
            <span>平台 {platformLabel}</span>
            <span aria-hidden>·</span>
            <span>{state.currency === 'usd' ? 'USD' : '本币'}</span>
            <span aria-hidden>·</span>
            <span title="当前监控范围内最新触发预警的周，不代表最新采集周">最新触发 {latestList[0] ? weekTag(latestList[0].weekId) : '—'}</span>
            <span aria-hidden>·</span>
            <span title={`${sourceProvenance.source.version}；${sourceProvenance.notes?.join(' ')}`} style={{ color: color.body }}>{provenanceSummary(sourceProvenance)}</span>
          </div>
          {modelFilter && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: space.md, padding: '8px 12px', border: `1px solid ${color.link}33`, borderRadius: radius.control, background: selectSoft, color: color.body, fontSize: 12 }}>
              <span>已定位产品：<strong style={{ color: color.ink }}>{modelFilter.name}</strong></span>
              <Button size="small" style={{ marginLeft: 'auto', height: 22, fontSize: 11 }} onClick={() => setModelFilter(null)}>查看全部产品</Button>
            </div>
          )}
          {/* ① 概览状态带（第一百九十一轮紧凑带；第一百九十二轮收件箱剔除后
              生命周期四芯片随卡退役，只留 最新预警数 ｜ 监控范围 两段计数） */}
          {!emptyMode && (
            <section
              aria-label="预警概览"
              style={{
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: `4px ${space.sm}px`,
                background: color.canvas,
                boxShadow: shadow.l1,
                borderRadius: radius.card,
                padding: '8px 16px',
                marginBottom: space.md,
              }}
            >
              {/* V4（2026-11-17 拍板）：概览带可点化——「N 条最新预警」点击切只看异常
                  （再点回全部），「N 个系列监控中」点击清全部筛选（补退役芯片缺的回路） */}
              {statusFilter === 'normal' ? (
                <span title={overviewDetail} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5, minWidth: 0 }}>
                  <span className="tnum" style={{ fontSize: 16, lineHeight: '20px', fontWeight: 700, color: overviewCount > 0 ? color.ink : color.hairlineStrong }}>
                    {overviewCount}
                  </span>
                  <span style={{ fontSize: 12, color: color.mute }}>{overviewUnit}</span>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setStatusFilter(statusFilter === 'alerts' ? 'all' : 'alerts')}
                  aria-pressed={statusFilter === 'alerts'}
                  aria-label={`最新预警 ${overviewCount} 条，点击${statusFilter === 'alerts' ? '回到全部状态' : '只看异常'}`}
                  title={statusFilter === 'alerts' ? '再点一次回到全部状态' : overviewDetail}
                  style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5, minWidth: 0, border: 0, background: 'transparent', padding: '2px 6px', borderRadius: radius.control, cursor: 'pointer', outline: statusFilter === 'alerts' ? `2px solid ${color.link}` : undefined }}
                >
                  <span className="tnum" style={{ fontSize: 16, lineHeight: '20px', fontWeight: 700, color: statusFilter === 'alerts' ? color.link : overviewCount > 0 ? color.ink : color.hairlineStrong }}>
                    {overviewCount}
                  </span>
                  <span style={{ fontSize: 12, color: statusFilter === 'alerts' ? color.link : color.mute }}>
                    {overviewUnit}{statusFilter === 'alerts' ? ' · 只看异常（再点回全部）' : ''}
                  </span>
                </button>
              )}
              <span aria-hidden style={{ width: 1, height: 16, background: color.hairline, flexShrink: 0 }} />
              <button
                type="button"
                onClick={clearAlertFilters}
                aria-label={`监控 ${subCount} 个系列，点击清除全部筛选（类型 / 品牌 / 状态 / 产品定位）`}
                title={`${monitorDetail} · 点击清除全部筛选`}
                style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5, minWidth: 0, border: 0, background: 'transparent', padding: '2px 6px', borderRadius: radius.control, cursor: 'pointer' }}
              >
                <span className="tnum" style={{ fontSize: 16, lineHeight: '20px', fontWeight: 700, color: color.ink }}>
                  {subCount}
                </span>
                <span style={{ fontSize: 12, color: color.mute }}>个系列监控中</span>
              </button>
              <span aria-hidden style={{ width: 1, height: 16, background: color.hairline, flexShrink: 0 }} />
              {/* B7（2026-11-17 拍板）：跨口径订阅显式提示，不再静默隐没 */}
              {foreignSubCount > 0 && (
                <span
                  title="这些监控属于其他国家 / 产业口径，在本页不产生预警"
                  style={{ fontSize: 12, color: color.body }}
                >
                  另有 <span className="tnum" style={{ fontWeight: 700 }}>{foreignSubCount}</span> 个监控属于其他口径
                </span>
              )}
            </section>
          )}

          {/* ②③ 监控矩阵（工具行 + 列头规则 + 品牌分组行 + own-gap 成对条）。
              零监控首启态：正中说明 + 添加入口，工具行/阈值表头/矩阵全部退场；
              卡身 flex:1 撑满剩余视口、内容垂直居中（第一百九十一轮，桌面实拍审计），
              minHeight 兜底矮视口防裁切；非空态维持常规文档流与下边距 */}
          <section
            style={{
              background: color.canvas,
              boxShadow: shadow.l1,
              borderRadius: radius.card,
              padding: space.lg,
              ...(emptyMode
                ? { flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', marginBottom: 0 }
                : { marginBottom: space.md }),
            }}
          >
            {emptyMode ? (
              <div style={{ minHeight: 360, padding: '32px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                <BellOutlined style={{ fontSize: 30, color: color.hairlineStrong }} />
                <div style={{ fontSize: 15, fontWeight: 600, color: color.ink }}>尚未监控任何产品</div>
                <div style={{ fontSize: 12, color: color.mute }}>添加监控后，这里按周汇总调价、折扣、平台价差与档位间距预警</div>
                {/* B7（2026-11-17 拍板）：跨口径订阅不静默隐没——空态时显式提示 */}
                {foreignSubCount > 0 && (
                  <div style={{ fontSize: 12, color: color.body, background: color.canvasSoft, borderRadius: radius.control, padding: '6px 14px' }}>
                    另有 {foreignSubCount} 个监控属于其他口径（他国 / 他产业），切回对应口径可见
                  </div>
                )}
                <AddMonitorControl prominent onAdded={onMonitorAdded} />
                <Button size="small" onClick={() => openAgent('dock', `帮我设置预警监控（${country} · ${industry}），建议先监控哪些产品并说明原因`)}>让 Agent 帮我设置</Button>
              </div>
            ) : (
              <>
            <div className="lpl-alert-toolbar" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0, fontSize: fontSize.bodyMd, fontWeight: 600, color: color.ink }}>监控看板</h3>
              <Segmented
                aria-label="按预警类型筛选"
                size="small"
                value={typeFilter}
                onChange={(v) => applyTypeFilter(v as 'all' | AlertType)}
                options={[
                  { label: `全部 ${allChipCount}`, value: 'all' },
                  ...ORDER.map((t) => ({ label: `${TYPE_STYLE[t].label} ${typeCounts[t]}`, value: t })),
                ]}
              />
              <Segmented
                aria-label="按预警状态筛选"
                size="small"
                value={statusFilter}
                onChange={(v) => setStatusFilter(v as 'all' | 'alerts' | 'normal')}
                options={[
                  { label: '全部状态', value: 'all' },
                  { label: '只看异常', value: 'alerts' },
                  { label: '只看正常', value: 'normal' },
                ]}
              />
              <Select
                mode="multiple"
                size="small"
                allowClear
                maxTagCount="responsive"
                placeholder="全部品牌"
                aria-label="按品牌筛选"
                style={{ minWidth: 160, maxWidth: 240 }}
                value={brandFilter}
                onChange={setBrandFilter}
                options={brandOptions}
              />
              <Select
                size="small"
                value={rowSort}
                onChange={(v) => setRowSort(v as 'alerts-first' | 'latest' | 'name')}
                aria-label="排序方式"
                style={{ width: 118 }}
                options={[
                  { value: 'alerts-first', label: '异常优先' },
                  { value: 'latest', label: '最新触发' },
                  { value: 'name', label: '产品名称' },
                ]}
              />
              {hasAlertFilters && (
                <Button
                  size="small"
                  onClick={clearAlertFilters}
                  aria-label="清除预警筛选"
                  style={{ height: 24, fontSize: 11 }}
                >
                  清除筛选
                </Button>
              )}
              <span style={{ flex: 1 }} />
              {/* 「让 Agent 解释」从收件箱卡头移入工具行（第一百九十二轮收件箱剔除） */}
              <Button size="small" onClick={() => openAgent('dock', agentAlertPrompt)}>
                让 Agent 解释最新预警
              </Button>
              <span aria-hidden style={{ width: 1, height: 22, background: color.hairline, flexShrink: 0 }} />
              <AddMonitorControl onAdded={onMonitorAdded} />
            </div>

            {/* 列头与矩阵共用横向滚动容器（第一百八十二轮：窄视口只在卡内拖动，
                页面不再整幅横向裁切） */}
            <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 880 }}>
            {/* 列头 = 规则行（全局开关 + 阈值） */}
            <div style={{ display: 'grid', gridTemplateColumns: MATRIX_COLS, alignItems: 'center', borderBottom: `1px solid ${color.hairline}` }}>
              <span style={{ fontSize: 11, color: color.mute, paddingLeft: 16, paddingBlock: 8 }}>
                监控产品（{subCount}）
              </span>
              {ORDER.map((t) => renderTypeHead(t))}
              <span />
            </div>

            {visibleGroups.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                style={{ padding: '28px 0' }}
                description={<span style={{ fontSize: 12, color: color.mute }}>{matrixEmptyText}</span>}
              />
            ) : (
                visibleGroups.map((g) => {
                const showGap = g.isOwn && (typeFilter === 'all' || typeFilter === 'own-gap');
                  const groupGapItems = gapItems.filter((a) => g.rows.some((r) => r.key === a.seriesKey || r.key === a.pairHighSeriesKey));
                return (
                  <div key={g.brand} style={{ marginTop: space.md }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 2px 6px' }}>
                      <BrandDot brand={g.brand} size={9} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: color.ink }}>{g.brand}</span>
                      <span style={{ fontSize: 11, color: color.mute }}>{g.rows.length} 个系列</span>
                    </div>
                    <div style={{ border: `1px solid ${color.hairline}`, borderRadius: radius.card, background: color.canvas, overflow: 'hidden' }}>
                      {g.rows.map((r, i) => renderSeriesRow(r.key, r.meta, i))}
                    </div>
                    {/* 档位间距 = 型号级预警：成对细条（高档 ↔ 低档 · 间距 < 阈值） */}
                    {showGap && groupGapItems.length > 0 && (
                      <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {groupGapItems.map((a) => (
                          <div
                            key={a.key}
                            data-alert-series-key={a.seriesKey}
                            data-alert-type={a.type}
                            data-alert-week-id={a.weekId}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              padding: '5px 10px',
                              border: `1px dashed ${color.alert.ownGap.fg}66`,
                              borderRadius: radius.card,
                              background: color.alert.ownGap.bg,
                            }}
                          >
                            <TypePill type="own-gap" />
                            <span style={{ fontSize: 12, fontWeight: 600, color: color.ink, whiteSpace: 'nowrap' }}>
                              {a.modelName} 两档太近
                            </span>
                            <span className="tnum" style={{ fontSize: 11, color: color.body, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {[a.romram === '—' ? '' : a.romram, formatPrice(a.pairLowPrice, state.currency)].filter(Boolean).join(' ')} ↔{' '}
                              {((): string => { const r = romOfLabel(a.pairHighLabel, a.modelName); return r === '—' ? '' : r; })()} {formatPrice(a.pairHighPrice, state.currency)}
                            </span>
                            <span className="tnum" style={{ fontSize: 11, fontWeight: 700, color: color.alert.ownGap.fg, whiteSpace: 'nowrap' }}>
                              间距 {pctText(a.ownGapPct)} &lt; {+(state.alertThresholds['own-gap'] * 100).toFixed(1)}%
                            </span>
                            <span style={{ flex: 1 }} />
                            <Button
                              size="small"
                              style={{ height: 22, fontSize: 11 }}
                              aria-label={`在看板查看 ${a.modelName} 档位间距事件`}
                              onClick={() => openInDash(a)}
                            >
                              看板
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
            </div>
            </div>
              </>
            )}
          </section>

          {/* ④ 历史事件（次级视图，默认折叠——第五十五轮用户口径：主视觉只报最新态；
              第一百八十二轮：零监控时整体退场，不占首屏） */}
          {!emptyMode && (
          <section style={{ background: color.canvas, boxShadow: shadow.l1, borderRadius: radius.card, padding: space.lg }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h3 style={{ margin: 0, fontSize: fontSize.bodyMd, fontWeight: 600, color: color.ink }}>历史事件</h3>
              <span style={{ fontSize: 11, color: color.mute }}>
                {filtered.length} 条 · 按周分组，最新在前
              </span>
              <span style={{ flex: 1 }} />
              {hasAlertFilters && showHistory && (
                <Button
                  size="small"
                  style={{ height: 22, fontSize: 11 }}
                  onClick={clearAlertFilters}
                >
                  清除筛选
                </Button>
              )}
              <Button size="small" style={{ height: 22, fontSize: 11 }} onClick={() => setShowHistory((v: boolean) => !v)}>
                {showHistory ? '收起' : `展开（${filtered.length}）`}
              </Button>
            </div>
            {showHistory &&
              (weekGroups.length === 0 ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  style={{ padding: '20px 0' }}
                  description={<span style={{ fontSize: 12, color: color.mute }}>当前规则下暂无历史触发</span>}
                />
              ) : (
                weekGroups.map((w) => (
                  <div key={w.weekId}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '8px 2px 3px', borderBottom: `1px solid ${color.hairline}` }}>
                      <span className="tnum" style={{ fontSize: 12, fontWeight: 700, color: color.ink }}>
                        {weekTag(w.weekId)}
                      </span>
                      <span className="tnum" style={{ fontSize: 11, color: color.mute }}>
                        {w.weekLabel} 采集周 · {w.items.length} 条
                      </span>
                    </div>
                    {w.items.map((a) => (
                      <AlertRow key={a.key} a={a} currency={state.currency} onOpen={() => openInDash(a)} />
                    ))}
                  </div>
                ))
              ))}
            {showHistory && filtered.length > 150 && (
              <div style={{ paddingTop: 8, fontSize: 11, color: color.mute }}>
                仅展示最近 150 条，共 {filtered.length} 条 — 可用类型 / 品牌筛选收窄
              </div>
            )}
          </section>
          )}
          <AlertDetailDrawer
            open={detailRecord != null}
            record={detailRecord}
            onClose={() => setDetailRecordId(null)}
            onAction={(action) => { if (detailRecord) updateRecord(detailRecord, action); }}
            onOpenDashboard={(record) => openInDash(record)}
            onOpenAgent={(record) => openAgent('dock', `请解释这条预警并列出核查证据与下一步动作。结构化上下文：${JSON.stringify(alertAgentContextOf(record))}`)}
          />
        </main>

      </div>
    </div>
  );
}

/** 单元格 key 包装（renderCell 返回的 div 需要稳定的列表 key） */
function CellSlot({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

// ============================================================
// 添加监控选择树（2026-11-17 Eason「要跟产品筛选器完全一样」定版）：形态复刻看板
// 「选择产品」浮窗（ProductPickerModal 同款）——顶部 搜索（品牌/系列/型号/容量）+
// 档位下拉 + 排序（默认/价格/名称）Segmented；四列 品牌（色点 + N 型号）→系列→
// 型号（＋全部型号胶囊 + 档位 · 现价灰字）→配置（「监控中」尾注）。纯函数链
// （searchProductTree / filterProductTreeByTier / sortModelNodes / modelEntryInfo）
// 全部复用 ProductCascader/tree，视觉同源。语义 = 订阅：点配置行 toggle 监控，
// 「＋ 全部型号」= 该型号（档位收窄内）全部配置加入监控；动作只写 alertSubs，
// 不触看板建卡语义。候选 = buildProductTree 当前国家/产业有数据的产品（华为置顶）。
// ============================================================
function AddMonitorControl({ prominent, onAdded }: {
  /** 零监控空态主操作（中号主按钮，与工具行小号区分） */
  prominent?: boolean;
  /** 新增订阅时回调（页面清筛选 + 滚动定位新行） */
  onAdded?: (addedKeys: string[]) => void;
}) {
  const { state, actions } = useFilters();
  const { message } = AntdApp.useApp();
  const narrow = useNarrowViewport();
  const [menuOpen, setMenuOpen] = useState(false);
  // P2-16：capture 直关的时刻戳——触发器按钮在弹层外，按下即被直关；随后
  // rc-trigger 的 click 看到 open=false 会请求 onOpenChange(true)。350ms 窗内
  // 该开窗请求视为同一次点击的关窗意图，忽略——否则「点了关不掉还立即重开」。
  const monitorClosedAtRef = useRef(0);
  // 关闭接管（同 ProductPickerModal 的直 setState 关闭兜底思路；2026-11-18 Eason 报
  // 「点型号层整窗关闭、＋全部型号无反应」终修）：点型号行展开第四列时 CascadePanel
  // 内容全量重建，click 冒泡到 document 时原 target 已 detach，rc-trigger 的外部
  // 点击判定 closest 失败 → 误发关闭，时间窗守卫拦不住（close 晚于任何窗口）。
  // 治本 = rc-trigger 的 close 请求在 onOpenChange 一律忽略，外部按下/Esc 由本监听
  // 直关（pointerdown 先于 click，语义为「按下时在哪」——detach 不影响判定）。
  useEffect(() => {
    if (!menuOpen) return undefined;
    const closeAll = (): void => {
      monitorClosedAtRef.current = Date.now();
      setMenuOpen(false);
      setSearch('');
      setTier(null);
    };
    const onDocPointerDown = (e: PointerEvent): void => {
      const path = (e.composedPath?.() ?? []) as Node[];
      const inPopup = path.some((n) => n instanceof Element && n.closest('.lpl-monitor-pop') != null);
      if (!inPopup) closeAll();
    };
    document.addEventListener('pointerdown', onDocPointerDown, true);
    return () => {
      document.removeEventListener('pointerdown', onDocPointerDown, true);
    };
  }, [menuOpen]);
  // P2-17：Esc 走栈顶判定正典（useTopEscClose）——内层 antd 弹层（档位 Select 下拉）
  // 在场时让位，一次 Esc 只收下拉不连整窗全关；自己是栈顶才关
  useTopEscClose(menuOpen, () => {
    monitorClosedAtRef.current = Date.now();
    setMenuOpen(false);
    setSearch('');
    setTier(null);
  });
  const [search, setSearch] = useState('');
  const [tier, setTier] = useState<string | null>(null); // null = 全部档位；关窗即回默认
  const [modelSort, setModelSort] = useState<ModelSortMode>('default');
  const [path, setPath] = useState<[string, string, string] | null>(null);
  const seriesKeyOf = (modelId: string, romram: string): string => `${modelId}__${romram.replace(/\s+/g, '')}`;
  const isSub = (modelId: string, romram: string): boolean => state.alertSubs.includes(seriesKeyOf(modelId, romram));
  // 树链（与 ProductPickerModal 同构）：build → 档位过滤（仅选中档位时）→ 搜索过滤
  const baseTree = useMemo(() => buildProductTree(state.industry, state.countryCode), [state.industry, state.countryCode]);
  const scopedTree = useMemo(
    () => (tier ? filterProductTreeByTier(baseTree, tier, state.countryCode) : baseTree),
    [baseTree, tier, state.countryCode],
  );
  const tree = useMemo(() => searchProductTree(scopedTree, search), [scopedTree, search]);
  const brand = tree.find((b) => b.key === path?.[0]) ?? tree[0];
  const series = brand?.series.find((s) => s.key === path?.[1]) ?? brand?.series[0];
  const model = series?.models.find((m) => m.modelId === path?.[2]) ?? series?.models[0];
  const tierOptions = useMemo(
    () => tiersOfScope(state.industry, state.countryCode).map((t) => ({ value: t, label: tierLabelShort(TIER_LABELS[t] ?? t) })),
    [state.industry, state.countryCode],
  );
  /** 型号行尾「档位缩写 · 现价」灰字（与看板选择产品浮窗同拼接） */
  const modelTagText = (m: ModelNode): string => {
    const { tierCode, price } = modelEntryInfo(m, state.currency);
    const tierText = tierCode ? tierLabelShort((TIER_LABELS[tierCode] ?? tierCode).replace(/^(入门|旗舰) · /, '')) : '';
    const priceText = price != null ? formatPrice(Math.round(price), state.currency) : '';
    return [tierText, priceText].filter(Boolean).join(' · ');
  };
  const toggleSub = (r: RomramNode): void => {
    const k = seriesKeyOf(r.modelId, r.romram);
    if (isSub(r.modelId, r.romram)) {
      actions.setAlertSubs([k], false);
      message.success(`已移除监控：${r.label}`);
    } else {
      actions.setAlertSubs([k], true);
      onAdded?.([k]);
      message.success(`已添加监控：${r.label}`);
    }
  };
  const addAllConfigs = (m: ModelNode): void => {
    const targets = m.romrams.filter((r) => !isSub(r.modelId, r.romram));
    if (targets.length === 0) {
      message.info(`${m.label} 全部配置已在监控中`);
      return;
    }
    const keys = targets.map((r) => seriesKeyOf(r.modelId, r.romram));
    actions.setAlertSubs(keys, true);
    onAdded?.(keys);
    message.success(`已添加监控 ${targets.length} 个系列（${m.label}）`);
  };
  const brandItems: CascadeRowItem[] = tree.map((b) => ({
    key: b.key,
    label: brandLabelOf(b.key),
    leading: <BrandDot brand={b.key} />,
    active: brand?.key === b.key,
    onActivate: () => setPath([b.key, b.series[0]?.key ?? '', b.series[0]?.models[0]?.modelId ?? '']),
    trailing: <span style={{ fontSize: 10, color: color.mute, flexShrink: 0 }}>{b.modelCount} 型号</span>,
  }));
  const seriesItems: CascadeRowItem[] = (brand?.series ?? []).map((s) => ({
    key: s.key,
    label: s.title,
    active: series?.key === s.key,
    onActivate: () => setPath([brand.key, s.key, s.models[0]?.modelId ?? '']),
    trailing: s.eol ? (
      <span style={{ fontSize: 10, color: color.mute, border: `1px solid ${color.hairline}`, borderRadius: radius.pill, padding: '0 6px', lineHeight: '16px', flexShrink: 0 }}>退市</span>
    ) : undefined,
  }));
  const sortedModels = sortModelNodes(series?.models ?? [], modelSort, state.currency);
  const modelItems: CascadeRowItem[] = sortedModels.map((m) => {
    const tag = modelTagText(m);
    return {
      key: m.modelId,
      label: m.label,
      leading: <BrandDot brand={m.brand} />,
      active: model?.modelId === m.modelId,
      onActivate: () => setPath([brand.key, series.key, m.modelId]),
      trailing: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {m.eol && (
            <span style={{ fontSize: 10, color: color.mute, border: `1px solid ${color.hairline}`, borderRadius: radius.pill, padding: '0 6px', lineHeight: '16px' }}>退市</span>
          )}
          <span
            role="button"
            tabIndex={0}
            aria-label={`将 ${m.label} 全部配置加入监控`}
            title={`该产品全部配置加入监控（${m.romrams.length} 个配置）`}
            onClick={(e) => {
              e.stopPropagation();
              addAllConfigs(m);
            }}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' && e.key !== ' ') return;
              e.preventDefault();
              e.stopPropagation();
              addAllConfigs(m);
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              height: 20,
              padding: '0 8px',
              borderRadius: radius.pill,
              fontSize: 11,
              color: selectSoftInk,
              background: color.canvas,
              border: '1px solid rgba(0, 112, 243, 0.35)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            <PlusOutlined style={{ fontSize: 9 }} /> 全部型号
          </span>
          {tag && <span className="tnum" style={{ fontSize: 10, color: color.mute, flexShrink: 0, whiteSpace: 'nowrap' }}>{tag}</span>}
        </span>
      ),
    } satisfies CascadeRowItem;
  });
  const romramItems: CascadeRowItem[] = (model?.romrams ?? []).map((r) => {
    const subbed = isSub(r.modelId, r.romram);
    return {
      key: r.key,
      label: r.romram,
      onLabelClick: () => toggleSub(r),
      trailing: subbed ? <StateTag text="监控中" /> : undefined,
    } satisfies CascadeRowItem;
  });
  // 列宽预留（同看板浮窗口径：label + 行尾完整可见，不省略号）
  const brandExtra = tree.reduce((w, b) => Math.max(w, textW(`${b.modelCount} 型号`, 10)), 0) + ROW_GAP + 26;
  const eolPillW = textW('退市', 10) + 8;
  const seriesExtra = ((brand?.series ?? []).some((s) => s.eol) ? eolPillW + ROW_GAP : 0) + 20;
  const allCfgPillW = pillW('全部型号', 11) + 12; // ＋ 图标 9 + 内间隙 3
  const modelTagW = sortedModels.reduce((w, m) => Math.max(w, textW(modelTagText(m), 10)), 0);
  const modelExtra = ((sortedModels.some((m) => m.eol) ? eolPillW + 6 : 0) + allCfgPillW + 6 + modelTagW + ROW_GAP) + 12;
  const romramExtra = textW('监控中', 10) + ROW_GAP + 12;
  const columns: CascadeColumnSpec[] = [
    { items: brandItems, extraW: brandExtra },
    { items: seriesItems, extraW: seriesExtra },
    { items: modelItems, extraW: modelExtra },
    { items: romramItems, extraW: romramExtra },
  ];
  return (
    <Popover
      trigger="click"
      open={menuOpen}
      arrow={false}
      placement="bottomRight"
      destroyOnHidden
      rootClassName="lpl-monitor-pop"
      getPopupContainer={(t) => (t.parentElement as HTMLElement) ?? document.body}
      onOpenChange={(open) => {
        if (!open) return; // 关闭统一由上方 capture 监听接管（外点/Esc 直关；detach 误判请求忽略）
        // P2-16：capture 刚直关（点触发器按钮）后 rc-trigger 又请求开窗——同一次
        // 点击的关窗意图，忽略（350ms 窗）
        if (Date.now() - monitorClosedAtRef.current < 350) return;
        setMenuOpen(open);
        setSearch('');
        setTier(null); // 开窗回全部档位（与看板浮窗同约定）
        const b0 = tree[0];
        setPath([b0?.key ?? '', b0?.series[0]?.key ?? '', b0?.series[0]?.models[0]?.modelId ?? '']);
      }}
      styles={{ body: { padding: 10 } as const }}
      content={
        <div>
          <div style={{ display: 'flex', flexDirection: narrow ? 'column' : 'row', alignItems: narrow ? 'stretch' : 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <Input
              allowClear
              size={narrow ? 'middle' : 'small'}
              prefix={<SearchOutlined style={{ color: color.mute }} />}
              placeholder="搜索品牌 / 系列 / 型号 / 容量"
              aria-label="搜索品牌、系列、型号或容量"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ flex: narrow ? undefined : '1 1 200px', width: narrow ? '100%' : undefined, minWidth: 0 }}
            />
            <Select
              size={narrow ? 'middle' : 'small'}
              aria-label="价格档位"
              value={tier ?? ''}
              onChange={(v) => setTier(v === '' ? null : v)}
              style={{ width: narrow ? '100%' : 138, flexShrink: 0 }}
              popupMatchSelectWidth={false}
              getPopupContainer={(node) => node.closest('.ant-popover') ?? document.body}
              options={[{ value: '', label: '全部档位' }, ...tierOptions]}
            />
            <Segmented
              size={narrow ? 'middle' : 'small'}
              aria-label="型号排序"
              value={modelSort}
              onChange={(v) => setModelSort(v as ModelSortMode)}
              options={[
                { label: '默认', value: 'default' },
                { label: '价格', value: 'price' },
                { label: '名称', value: 'name' },
              ]}
            />
          </div>
          <div style={{ display: 'flex', minWidth: 0, overflowX: 'auto' }}>
            <CascadePanel columns={columns} fill={!narrow} height={POPOVER_H} stepped={narrow} />
          </div>
        </div>
      }
    >
      <Button type="primary" size={prominent ? 'middle' : 'small'} icon={<PlusOutlined />} aria-label="添加监控产品">
        添加监控
      </Button>
    </Popover>
  );
}
