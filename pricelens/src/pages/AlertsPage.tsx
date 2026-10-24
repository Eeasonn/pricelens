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
// ============================================================
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, Empty, message, Popover, Segmented, Select, Slider, Switch } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { usePage } from '../state/PageContext';
import { useFilters } from '../state/FiltersContext';
import { navBus } from '../state/navBus';
import { dimChannel, dimProduct, dimRegion } from '../data';
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
import { productSelectionOfSeriesKey } from '../state/urlSync';
import { getEffectiveBenchmark } from '../state/configStore';
import { defaultPlatformAnchorOf } from '../dataModel/aggregate';
import { autoComparesFor, buildCards } from '../state/mainSelection';
import usePageViewState from '../state/usePageViewState';
import { ownBrand } from '../components/ProductCascader/tree';
import PageHeader from '../components/PageHeader';
import BrandDot from '../components/BrandMark';
import { AlertBell, alertDigest, TypePill, TYPE_STYLE, pctText, useAlerts } from '../components/AlertCenter';
import { color, fontSize, formatPrice, radius, shadow, space } from '../theme/tokens';
import { scopeLabels } from '../dataModel/scope';

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
  onCommit,
}: {
  min: number;
  max: number;
  step: number;
  value: number;
  disabled?: boolean;
  below?: boolean;
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

/** 矩阵列栅格：产品 ｜ 四类 ｜ 铃铛列（第五十五轮 150 → 172：格内放最新预警凝练详情） */
const MATRIX_COLS = 'minmax(0,1fr) repeat(4, 172px) 44px';

/** 方向箭头（与看板 buildChangeMarks 同色：跌/折扣加深 = 琥珀 ↓、涨/收窄 = 蓝 ↑） */
function dirArrowOf(a: AlertItem): ReactNode {
  const mk = (down: boolean, title: string): ReactNode => (
    <span title={title} style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, color: down ? '#b45309' : '#0070f3', width: 10, textAlign: 'center' }}>
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

/** 周 id（YYYYWW）→ 带年份周号（2026-W43，与刷选条同口径） */
const weekTag = (weekId: string): string => `${weekId.slice(0, 4)}-W${weekId.slice(4)}`;

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
  return (
    <div
      data-alert-key={a.key}
      data-alert-series-key={a.seriesKey}
      data-alert-type={a.type}
      data-alert-week-id={a.weekId}
      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 2px', borderBottom: `1px solid ${color.hairline}` }}
    >
      <TypePill type={a.type} />
      {dirArrowOf(a)}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: color.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {a.type === 'own-gap' ? `${a.modelName}（${a.romram} × ${romOfLabel(a.pairHighLabel, a.modelName)}）` : `${a.brand} ${a.modelName} ${a.romram}`}
        </div>
        <div className="tnum" style={{ fontSize: 11, color: color.body }}>
          {detail}
        </div>
      </div>
      <span className="tnum" style={{ fontSize: 11, color: color.mute, flexShrink: 0 }}>
        {a.weekLabel} · {weekTag(a.weekId)}
      </span>
      <Button size="small" style={{ height: 22, fontSize: 11 }} onClick={onOpen}>
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

export default function AlertsPage() {
  const { state, actions } = useFilters();
  const alerts = useAlerts();
  const openInDash = useOpenInDashboard();
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

  useEffect(() => {
    const focus = navBus.alertsFocus;
    if (!focus) return;
    setModelFilter({ id: focus.modelId, name: focus.modelName ?? focus.modelId });
    if (focus.seriesKey && focus.type && focus.weekId) {
      setTypeFilter(focus.type);
      setStatusFilter('all');
      setFocusAlert({ seriesKey: focus.seriesKey, type: focus.type, weekId: focus.weekId });
      setExpanded(new Set([`${focus.seriesKey}|${focus.type}`]));
    }
    navBus.alertsFocus = null;
  }, []);

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

  const bySeries = useMemo(() => groupAlertsBySeries(alerts), [alerts]);
  // 最新态（第五十五轮，用户口径：主视觉只报最新、历史进次级）：计数与单元格都按「每系列×类型最新一条」
  const latestList = useMemo(() => latestAlerts(alerts), [alerts]);
  const latestBySeries = useMemo(() => groupAlertsBySeries(latestList), [latestList]);
  const latestModelCount = useMemo(() => new Set(latestList.map((a) => a.seriesKey.split('__')[0])).size, [latestList]);
  const typeCounts = useMemo(() => {
    const c: Record<AlertType, number> = { 'price-change': 0, promo: 0, 'platform-gap': 0, 'own-gap': 0 };
    for (const a of latestList) c[a.type]++;
    return c;
  }, [latestList]);
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
  const visibleGroups = brandGroups
    .map((g) => ({
      ...g,
      rows: [...g.rows]
        .filter((r) => matchModel(r.key) && matchStatus(r.key))
        .sort((a, b) => {
          if (rowSort === 'alerts-first') return activeCountFor(b.key) - activeCountFor(a.key) || a.meta.label.localeCompare(b.meta.label);
          if (rowSort === 'latest') {
            const aw = latestBySeries.get(a.key)?.[0]?.weekId ?? '';
            const bw = latestBySeries.get(b.key)?.[0]?.weekId ?? '';
            return bw.localeCompare(aw) || a.meta.label.localeCompare(b.meta.label);
          }
          return a.meta.label.localeCompare(b.meta.label);
        }),
    }))
    .filter((g) => matchBrand(g.brand) && g.rows.length > 0);

  // 事件流 = 全量触发 → 类型+品牌筛选 → 截断 150 → 按周分组
  const filtered = useMemo(
    () => alerts.filter((a) => (typeFilter === 'all' || a.type === typeFilter) && matchBrand(a.brand) && matchModel(a.seriesKey)),
    [alerts, typeFilter, brandFilter, modelFilter],
  );
  const shown = useMemo(() => filtered.slice(0, 150), [filtered]);
  const weekGroups = useMemo(() => groupAlertsByWeek(shown), [shown]);
  const latestFiltered = useMemo(
    () => latestList.filter((a) => (typeFilter === 'all' || a.type === typeFilter) && matchBrand(a.brand) && matchModel(a.seriesKey)),
    [latestList, typeFilter, brandFilter, modelFilter],
  );
  const gapItems = useMemo(() => latestFiltered.filter((a) => a.type === 'own-gap'), [latestFiltered]);
  const matrixEmptyText = modelFilter
    ? '该产品尚未启用预警监控，或当前筛选下没有匹配系列'
    : statusFilter === 'alerts'
      ? '当前没有触发最新预警的产品'
      : statusFilter === 'normal'
        ? '当前没有符合条件的正常产品'
        : '尚未添加监控产品 — 在上方搜索添加，或在看板点产品旁的铃铛';

  // 添加监控候选：当前国家/产业可分析的系列（华为在前，按 label 字典序）——
  // 其他口径的产品在本页不产预警，不进候选
  const allSeries = useMemo(() => {
    const seen = new Set<string>();
    const list: { key: string; label: string; isOwn: boolean }[] = [];
    for (const p of dimProduct) {
      if (p.industry !== state.industry || !p.countries.includes(state.countryCode)) continue;
      const key = `${p.sku_id.split('__')[0]}__${p.romram.replace(/\s+/g, '')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      list.push({ key, label: `${p.brand} ${p.model_name} ${p.romram}`, isOwn: p.is_own === true });
    }
    return list.sort((a, b) => (a.isOwn === b.isOwn ? a.label.localeCompare(b.label) : a.isOwn ? -1 : 1));
  }, [state.countryCode, state.industry]);

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
          <Switch size="small" checked={on} onChange={(v) => actions.setAlertTypes({ [t]: v })} />
          <span style={{ fontSize: 12, fontWeight: 700, color: on ? color.mute : color.hairlineStrong, whiteSpace: 'nowrap' }}>
            {rule.name.replace('预警', '')}
            {rule.below && (
              <span style={{ fontSize: 10, color: '#be123c', marginLeft: 3, fontWeight: 600 }}>低于触发</span>
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
                  onCommit={(pct) => actions.setAlertThresholds({ [t]: pct })}
                />
              </div>
            </div>
          }
        >
          <span
            role="button"
            className="tnum"
            title={`${rule.name}全局阈值（点击调整）`}
            style={{
              fontSize: 10,
              color: on ? color.link : color.hairlineStrong,
              cursor: on ? 'pointer' : 'default',
              borderBottom: `1px dashed ${on ? 'rgba(0,112,243,0.5)' : 'transparent'}`,
              whiteSpace: 'nowrap',
            }}
          >
            {rule.below ? '<' : '≥'}
            {val}% ⌄
          </span>
        </Popover>
      </div>
    );
  };

  // ---- 单元格阈值覆写触发器（蓝虚线 = 已覆写；Popover 内 开关+滑杆+清除覆写）----
  const renderOverride = (rowKey: string, rule: AlertProductRule | undefined, t: AlertType): ReactNode => {
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
                onCommit={(pct) =>
                  actions.setAlertProductRule(rowKey, {
                    ...(rule ?? {}),
                    thresholds: { ...(rule?.thresholds ?? {}), [t]: pct },
                  })
                }
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
        <span
          role="button"
          title={thrOverridden ? '已单独设置阈值' : '跟随全局，点击单独设置'}
          className="tnum"
          style={{
            fontSize: 10,
            fontWeight: thrOverridden ? 700 : 400,
            color: thrOverridden ? '#0070f3' : color.hairlineStrong,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            borderBottom: thrOverridden ? '1px dashed #0070f3' : 'none',
          }}
        >
          {r.below ? '<' : '≥'}
          {thrVal}%{thrOverridden ? ' *' : ''}
        </span>
      </Popover>
    );
  };

  // ---- 矩阵单元格（三态：— / 正常 / 触发徽标；own-gap = 型号级）----
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
    // 档位间距：型号级、不参与产品覆写——华为行显「型号级 + 触发数」，竞品行「—」
    if (t === 'own-gap') {
      if (!meta.isOwn) {
        return wrap(<span style={{ fontSize: 11, color: color.hairlineStrong }}>—</span>);
      }
      const n = (gapByModel.get(rowKey.split('__')[0]) ?? []).length;
      return wrap(
        <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          {n > 0 ? (
            <span
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
              型号级{n > 1 ? ` ×${n}` : ''}
            </span>
          ) : (
            <span style={{ fontSize: 10, color: color.mute }}>型号级</span>
          )}
          {n > 0 && <span style={{ fontSize: 10, color: color.hairlineStrong }}>成对明细见下</span>}
        </span>,
      );
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
          <span style={{ fontSize: 10, color: !on ? color.hairlineStrong : '#0a7d38' }}>{!on ? '—' : '正常'}</span>
        ) : (
          <span
            role="button"
            title={`${TYPE_STYLE[t].label}最新触发 · ${weekTag(latest.weekId)}（${latest.weekLabel}）· 点击${open ? '收起' : '展开历史'}`}
            onClick={() => toggleExp(expKey)}
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
        {renderOverride(rowKey, rule, t)}
      </span>,
    );
  };

  // ---- 矩阵行：产品 ｜ 四类 ｜ 铃铛；展开明细条随行渲染 ----
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
              title={meta.label}
              style={{ fontSize: 12, fontWeight: 600, color: color.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {meta.label}
            </span>
          </div>
          {ORDER.map((t) => (
            <CellSlot key={t}>{renderCell(key, meta, t)}</CellSlot>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingBlock: 8 }}>
            <AlertBell
              subscribed={state.alertSubs.includes(key)}
              count={latestBySeries.get(key)?.length ?? 0}
              onToggle={() => actions.toggleAlertSub(key)}
            />
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

  return (
    <div style={{ height: '100%', overflowX: 'auto', background: color.canvasSoft }} data-lpl-scroll>
      <div style={{ minWidth: 1280, minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* 顶栏 64px（共享 PageHeader，预警中心重构统一四页铬架） */}
        <PageHeader title="预警中心" />

        <main style={{ flex: 1, padding: space.lg }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: space.sm, color: color.mute, fontSize: 11 }}>
            <span>{country} · {industry}</span>
            <span aria-hidden>·</span>
            <span>平台 {platformLabel}</span>
            <span aria-hidden>·</span>
            <span>{state.currency === 'usd' ? 'USD' : '本币'}</span>
          </div>
          {modelFilter && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: space.md, padding: '8px 12px', border: `1px solid ${color.link}33`, borderRadius: radius.control, background: '#f0f6ff', color: color.body, fontSize: 12 }}>
              <span>已定位产品：<strong style={{ color: color.ink }}>{modelFilter.name}</strong></span>
              <Button size="small" style={{ marginLeft: 'auto', height: 22, fontSize: 11 }} onClick={() => setModelFilter(null)}>查看全部产品</Button>
            </div>
          )}
          {/* ① 概览条（类看板摘要三件套） */}
          <section
            style={{
              background: color.canvas,
              boxShadow: shadow.l1,
              borderRadius: radius.card,
              padding: space.base,
              marginBottom: space.md,
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0,1fr))',
              gap: 10,
            }}
          >
            <div style={{ background: color.canvasSoft, borderRadius: radius.card, padding: '10px 14px', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span className="tnum" style={{ fontSize: 24, lineHeight: '30px', fontWeight: 700, color: latestList.length > 0 ? color.ink : color.hairlineStrong }}>
                  {latestList.length}
                </span>
                <span style={{ fontSize: 12, color: color.mute }}>条最新预警</span>
              </div>
              <div className="tnum" style={{ fontSize: 11, color: color.mute, marginTop: 2 }}>
                最新触发 {latestList.length > 0 ? `${weekTag(latestList[0].weekId)}（${latestList[0].weekLabel} 采集周）` : '—'}
                {latestList.length > 0 ? ` · 涉及 ${latestModelCount} 个产品` : ''}
                {alerts.length !== latestList.length ? ` · 历史 ${alerts.length} 条` : ''}
              </div>
            </div>
            <div style={{ background: color.canvasSoft, borderRadius: radius.card, padding: '10px 14px', minWidth: 0 }}>
              <div style={{ fontSize: 11, color: color.mute, marginBottom: 6 }}>类型分布（点击筛选）</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {ORDER.map((t) => {
                  const active = typeFilter === t;
                  return (
                    <span
                      key={t}
                      role="button"
                      onClick={() => applyTypeFilter(active ? 'all' : t)}
                      style={{
                        padding: '1px 8px',
                        fontSize: 11,
                        fontWeight: 700,
                        lineHeight: '18px',
                        borderRadius: radius.pill,
                        color: TYPE_STYLE[t].fg,
                        background: TYPE_STYLE[t].bg,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        opacity: typeFilter !== 'all' && !active ? 0.4 : 1,
                        boxShadow: active ? `0 0 0 1.5px ${TYPE_STYLE[t].fg}` : undefined,
                      }}
                    >
                      {TYPE_STYLE[t].label} {typeCounts[t]}
                    </span>
                  );
                })}
              </div>
            </div>
            <div style={{ background: color.canvasSoft, borderRadius: radius.card, padding: '10px 14px', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span className="tnum" style={{ fontSize: 24, lineHeight: '30px', fontWeight: 700, color: color.ink }}>
                  {subCount}
                </span>
                <span style={{ fontSize: 12, color: color.mute }}>个系列监控中</span>
              </div>
              <div className="tnum" style={{ fontSize: 11, color: color.mute, marginTop: 2 }}>
                {ownBrand()} {ownCount} · 其他品牌 {subCount - ownCount} · 单独设置 {Object.keys(state.alertProducts).length} 项
              </div>
            </div>
          </section>

          {/* ②③ 监控矩阵（工具行 + 列头规则 + 品牌分组行 + own-gap 成对条） */}
          <section style={{ background: color.canvas, boxShadow: shadow.l1, borderRadius: radius.card, padding: space.lg, marginBottom: space.md }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0, fontSize: fontSize.bodyMd, fontWeight: 600, color: color.ink }}>监控看板</h3>
              <Segmented
                size="small"
                value={typeFilter}
                onChange={(v) => applyTypeFilter(v as 'all' | AlertType)}
                options={[
                  { label: `全部 ${latestList.length}`, value: 'all' },
                  ...ORDER.map((t) => ({ label: `${TYPE_STYLE[t].label} ${typeCounts[t]}`, value: t })),
                ]}
              />
              <Segmented
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
                style={{ minWidth: 160, maxWidth: 240 }}
                value={brandFilter}
                onChange={setBrandFilter}
                options={brandOptions}
              />
              <Select
                size="small"
                value={rowSort}
                onChange={(v) => setRowSort(v as 'alerts-first' | 'latest' | 'name')}
                style={{ width: 118 }}
                options={[
                  { value: 'alerts-first', label: '异常优先' },
                  { value: 'latest', label: '最新触发' },
                  { value: 'name', label: '产品名称' },
                ]}
              />
              <span style={{ flex: 1 }} />
              <Select
                showSearch
                size="small"
                placeholder="＋ 添加监控（搜索品牌 / 型号 / 产品）"
                style={{ width: 320 }}
                value={null}
                filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                onChange={(key) => {
                  if (!key) return;
                  actions.setAlertSubs([key as string], true);
                  // 反馈 + 定位到新行（多品牌时新行位置不可预期，避免「加没加上」的疑惑）
                  const label = allSeries.find((s) => s.key === key)?.label ?? '';
                  message.success(`已添加监控：${label}`);
                  setBrandFilter([]);
                  setStatusFilter('all');
                  setFocusAlert({ seriesKey: key as string, type: 'price-change', weekId: '' });
                }}
                options={allSeries
                  .filter((s) => !state.alertSubs.includes(s.key))
                  .map((s) => ({ value: s.key, label: s.label }))}
                suffixIcon={<PlusOutlined />}
              />
            </div>

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
                              border: '1px dashed rgba(190, 18, 60, 0.4)',
                              borderRadius: radius.card,
                              background: '#fff1f2',
                            }}
                          >
                            <TypePill type="own-gap" />
                            <span style={{ fontSize: 12, fontWeight: 600, color: color.ink, whiteSpace: 'nowrap' }}>
                              {a.modelName} 两档太近
                            </span>
                            <span className="tnum" style={{ fontSize: 11, color: color.body, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {a.romram} {formatPrice(a.pairLowPrice, state.currency)} ↔{' '}
                              {romOfLabel(a.pairHighLabel, a.modelName)} {formatPrice(a.pairHighPrice, state.currency)}
                            </span>
                            <span className="tnum" style={{ fontSize: 11, fontWeight: 700, color: '#be123c', whiteSpace: 'nowrap' }}>
                              间距 {pctText(a.ownGapPct)} &lt; {+(state.alertThresholds['own-gap'] * 100).toFixed(1)}%
                            </span>
                            <span style={{ flex: 1 }} />
                            <Button size="small" style={{ height: 22, fontSize: 11 }} onClick={() => openInDash(a)}>
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
          </section>

          {/* ④ 历史事件（次级视图，默认折叠——第五十五轮用户口径：主视觉只报最新态） */}
          <section style={{ background: color.canvas, boxShadow: shadow.l1, borderRadius: radius.card, padding: space.lg }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h3 style={{ margin: 0, fontSize: fontSize.bodyMd, fontWeight: 600, color: color.ink }}>历史事件</h3>
              <span style={{ fontSize: 11, color: color.mute }}>
                {filtered.length} 条 · 按周分组，最新在前
              </span>
              <span style={{ flex: 1 }} />
              {(typeFilter !== 'all' || brandFilter.length > 0) && showHistory && (
                <Button
                  size="small"
                  style={{ height: 22, fontSize: 11 }}
                  onClick={() => {
                    setTypeFilter('all');
                    setBrandFilter([]);
                  }}
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
        </main>

      </div>
    </div>
  );
}

/** 单元格 key 包装（renderCell 返回的 div 需要稳定的列表 key） */
function CellSlot({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
