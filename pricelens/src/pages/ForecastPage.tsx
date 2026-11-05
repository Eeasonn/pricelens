// ============================================================
// 量价预测 · 推演工作台 v3（forecast-workbench-v3 · 任务 10 全页收敛）：
// 正典：pricelens/.impeccable/surfaces/forecast-workbench-v2.md（v3 同步版）。
// 页面入共享分析壳（App.AnalysisShell showFilters=false）：本组件不自挂
// PageHeader / 独立滚动壳，只负责首卡（图表页签 + 压缩范围行）、PipelineNav
// 与五卡卡序：①主图+摘要（结果总览）→②量价参考（①基线预测 · 历史参照）→
// ③大盘·总量总线（②大盘修正）→④库存修正 + ⑤成本销毛（④成本及销毛，
// 左右两列）。五卡同源一份 WorkbenchParams / WorkbenchResult / MarginView，
// 不出现第二套数字。
// 任务 10 收敛接线（T6–T9 移交点）：
// - PipelineNav（T6）：页级 onNavigate = 跨卡滚动 + 目标卡聚焦 + 「来自…」
//   返回条（React 内存瞬态，不写 params、不重算、不提交编辑）；
// - useSiConfirmations（T6）：③卡确认工作区 + siSaveState/onRetrySiPersist +
//   重置基准只清 v3 params 与 SI 确认（确认文案列出清理范围）；
// - useMarginScenario + computeMarginView（T9）：页级唯一 MarginView——主图
//   价格系列 / 数据表 / 页面摘要 / PipelineNav / ④卡统一消费（主数字与④同源）；
// - useIntelligenceReview（T8）：真实候选注入仍为空（MarketBusPanel 容器位
//   availability="pending"），工作区只进导出审核状态，不造假数据；
// - 主图证据定位（T7）：onFocusCard → 参考卡 locateRequest / 大盘 / 库存跨卡
//   定位；onEditProductEvent → EventReplayModal initialRange（同范围编辑替换）；
//   MarketBusPanel onViewMainChart / onCheckInventory / onMonthEventUpdate 接线。
// 模拟标识分级：页首 DataStatusBadge 一处 + 各卡轻量 SimChip；范围行写
// 「固定样本 · 不随全局筛选联动」；SI 未全部确认时页首显式提示（B.5.7）。
// 「复制关键假设」= 纪要层的替代物（workbenchExport v3 管线顺序 + 上下文）。
// 措辞不出现 因子/约束/置信区间/无约束需求/我司；话术统一「库存上限修正 /
// 按可售量修正 / 修正周」。数据全部演示（统一日历 2026-11—2027-10）。
// 2026-11-05 视觉精简二轮（Eason 看图反馈）：主图卡的 IoBar 行与摘要四格
// 下沉为 MainForecastChart extras（「数据与操作」共享收起区，默认收起）——
// 默认视图 = 卡头 + PipelineNav + 图表本身（图 + 图例 + 时间轨）。
// ============================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CopyOutlined, PlusOutlined, RobotOutlined } from '@ant-design/icons';
import { Button, Checkbox, Input, InputNumber, Modal } from 'antd';
import ChartContentBar from '../components/ChartContentBar';
import ChartToolbar from '../chart/PriceTrend/ChartToolbar';
import { useAgent } from '../state/AgentContext';
import { useFilters } from '../state/FiltersContext';
import { scopeLabels } from '../dataModel/scope';
import { color, fontSize, radius, shadow, space } from '../theme/tokens';
import usePageViewState from '../state/usePageViewState';
import { workbenchFixture } from './forecast/workbenchFixture';
import type { ProductEventSeed } from './forecast/workbenchFixture';
import {
  clearManualAdjustment,
  computeWorkbench,
  isParamsActive,
  nextMarketMonthEventId,
  overrideSourceOf,
  setManualAdjustment,
  withMarketMonthOverride,
} from './forecast/workbenchModel';
import useWorkbenchParams, { nextProductEventId } from './forecast/useWorkbenchParams';
import { buildWorkbenchAssumptionText } from './forecast/workbenchExport';
import { buildForecastCalendar } from './forecast/workbenchCalendar';
import useSiConfirmations, { siMonthStatusOf } from './forecast/useSiConfirmations';
import useMarginScenario from './forecast/useMarginScenario';
import { computeMarginView } from './forecast/marginScenarioModel';
import { useIntelligenceReview } from './forecast/useIntelligenceReview';
import { referenceScopeHash } from './forecast/useReferenceWorkspace';
import { DataStatusBadge } from './forecast/ForecastBits';
import {
  AiJudgeBadge,
  IoBar,
  SectionHead,
  SimChip,
  fmtMillionUsd,
  fmtWan,
  workbenchCardStyle,
} from './forecast/WorkbenchBits';
import PipelineNav, { type ForecastStage } from './forecast/PipelineNav';
import MainForecastChart, { DEFAULT_MAIN_FORECAST_VIEW, type MainForecastView } from './forecast/MainForecastChart';
import type { MainForecastMarginView } from './forecast/MainForecastDataTable';
import ReferencePanel, { type ReferenceInputSignal, type ReferenceLocateRequest } from './forecast/ReferencePanel';
import MarketBusPanel from './forecast/MarketBusPanel';
import InventoryValidationCard from './forecast/InventoryValidationCard';
import ForecastMarginCostCard from './forecast/ForecastMarginCostCard';
import EventReplayModal from './forecast/EventReplayModal';

/** 跨卡定位目标（B.5.2 CrossCardFocus target 子集：页内五卡容器）。 */
type CrossCardTarget = 'main' | 'reference' | 'market' | 'inventory' | 'margin';

/** 跨卡焦点（B.5.2）：React 内存瞬态——离场即清，不持久化。 */
interface CrossCardFocus {
  target: CrossCardTarget;
  weekId: string | null;
  /** 来源卡读数（返回条「来自…」）。 */
  sourceLabel: string;
  /** 返回只恢复滚动和焦点。 */
  returnScrollY: number;
}

/** 跨卡返回条（B.5.2）：目标卡顶「来自{来源} · {周}　返回」；返回只恢复滚动与焦点。 */
function CrossCardReturnBar({ sourceLabel, weekId, onReturn }: {
  sourceLabel: string;
  weekId: string | null;
  onReturn: () => void;
}) {
  return (
    <div
      role="status"
      data-cross-card-bar=""
      style={{
        display: 'flex', alignItems: 'center', gap: space.sm, flexWrap: 'wrap',
        padding: `4px ${space.md}px`, marginBottom: space.sm,
        border: `1px solid ${color.hairline}`, borderRadius: radius.control,
        background: color.canvasSoft2, fontSize: 12, color: color.body,
      }}
    >
      <span>来自 {sourceLabel}{weekId != null ? ` · ${weekId}` : ''}（只定位，不改变任何假设）</span>
      <button
        type="button"
        aria-label={`返回${sourceLabel}`}
        onClick={onReturn}
        style={{ border: 'none', background: 'transparent', color: color.link, fontSize: 12, cursor: 'pointer', padding: 0, font: 'inherit' }}
      >
        返回
      </button>
    </div>
  );
}

/** 单周微调弹窗：调整原因选填（2026-11-04 评审拍板：不填即可应用，不以必填拦截；
 *  placeholder 引导追溯依据；后台字段结构保留）。已有手调可一键清除；填了原因则内联标注主图手调处。 */
function TuneDialog({ weekLabel, dateLabel, currentValue, manual, onCancel, onSave, onClear }: {
  weekLabel: string;
  dateLabel: string;
  currentValue: number;
  manual: { value: number; reason: string } | null;
  onCancel: () => void;
  onSave: (value: number, reason: string) => void;
  onClear: () => void;
}) {
  const [wan, setWan] = useState<number | null>(Math.round((currentValue / 1000)) / 10);
  const [reason, setReason] = useState('');
  const valueOk = wan != null && Number.isFinite(wan) && wan >= 0;
  return (
    <Modal
      title={`微调 · ${weekLabel}（${dateLabel}）`}
      open
      onCancel={onCancel}
      footer={
        <div style={{ display: 'flex', gap: space.sm, justifyContent: 'flex-end', alignItems: 'center' }}>
          {manual && <Button danger type="text" onClick={onClear}>清除手调</Button>}
          <Button onClick={onCancel}>取消</Button>
          <Button type="primary" disabled={!valueOk} onClick={() => valueOk && wan != null && onSave(Math.round(wan * 10000), reason)}>
            应用
          </Button>
        </div>
      }
    >
      <div style={{ display: 'grid', gap: space.md, paddingTop: space.sm }}>
        <div style={{ fontSize: 12, color: color.mute }}>
          {`当前预测 ${fmtWan(currentValue)}${manual ? '（已手调过，再次覆盖）' : ''} · 调整只落在本周，不影响其他周`}
        </div>
        <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 600, color: color.body }}>
          调整后周销（万台）
          <InputNumber
            aria-label="调整后周销（万台）"
            min={0}
            max={30}
            step={0.1}
            precision={1}
            value={wan}
            onChange={(value) => setWan(value == null ? null : Number(value))}
            style={{ width: 160 }}
          />
        </label>
        <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 600, color: color.body }}>
          调整原因（选填）
          <Input.TextArea
            aria-label="调整原因（选填）"
            aria-describedby="tune-reason-hint"
            placeholder="选填：帮助追溯调整依据"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            autoSize={{ minRows: 2, maxRows: 4 }}
          />
        </label>
        <div id="tune-reason-hint" style={{ fontSize: 11, color: color.mute, minHeight: 16 }}>
          {`选填：帮助追溯调整依据；填写后原因将内联标注在主图该周手调处，不填也可应用`}
        </div>
      </div>
    </Modal>
  );
}

/** PipelineNav 节点 → 跨卡定位目标（①参照 / ②大盘 / ③库存 / ④销毛）。 */
function stageCardOf(stage: ForecastStage): CrossCardTarget {
  if (stage === 1) return 'reference';
  if (stage === 2) return 'market';
  if (stage === 3) return 'inventory';
  return 'margin';
}

export default function ForecastPage() {
  const { state } = useFilters();
  const { openAgent, send } = useAgent();
  const labels = scopeLabels(state);
  const fixture = workbenchFixture;

  // 会话草稿（B.5.10）：切页往返保留；「重置基准」只清当前模型版本 v3 主链
  // params 与 SI 确认（确认文案列出清理范围；成本价格 / 参考事件 / 情报审核
  // 工作区不清）。v3 键 = forecast.workbench.workbench-demo-v3。
  const { params, setParams, resetParams } = useWorkbenchParams(fixture);
  const [tuneWeek, setTuneWeek] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'fail'>('idle');
  const result = useMemo(() => computeWorkbench(fixture, params), [fixture, params]);
  const active = isParamsActive(params, fixture);
  const hasWeeks = fixture.weeks.length > 0;

  // 统一日历（任务 1）：PipelineNav / ③卡 / SI 待确认数 / 导出唯一时间来源。
  const calendar = useMemo(() => buildForecastCalendar(fixture.calendar), [fixture.calendar]);

  // SI 逐月确认工作区（T6）：数值以 params.siPlanMonthly 为准，本工作区只存确认事实。
  const si = useSiConfirmations(fixture.meta.modelVersion, params.siPlanMonthly);
  const siPendingCount = useMemo(
    () => calendar.forecastMonths.filter((month) =>
      siMonthStatusOf(si.byMonth[month.key], params.siPlanMonthly[month.key] ?? 0) !== 'confirmed').length,
    [calendar, si.byMonth, params.siPlanMonthly],
  );

  // ④成本/价格情景与统一销毛视图（T9）：页级唯一 MarginView——主图价格系列 /
  // 数据表 / 页面摘要 / PipelineNav / ④卡统一消费（hook 与④卡共享同一会话 store）。
  const margin = useMarginScenario(fixture.meta.modelVersion);
  const marginView = useMemo(
    () => computeMarginView(fixture, result, margin.scenario),
    [fixture, result, margin.scenario],
  );

  // 情报候选审核工作区（T8）：真实候选注入仍为空 = MarketBusPanel 容器位保持
  // 「候选生成能力待接入」空态；工作区状态只进导出审核状态，不造假数据。
  const intelligenceScopeKey = useMemo(
    () => referenceScopeHash([fixture.meta.modelVersion, fixture.context.country, fixture.context.industry, fixture.context.channel, fixture.context.product]),
    [fixture],
  );
  const intelligence = useIntelligenceReview(intelligenceScopeKey);

  const tuneWeekResult = tuneWeek != null ? result.weeks.find((week) => week.weekId === tuneWeek) ?? null : null;
  // v3 预测周选项：id/label = 跨年周 ID（YYYYWww，跨年标签用 weekId 本身）。
  const forecastWeekOptions = result.weeks.filter((week) => week.status === 'forecast')
    .map((week) => ({ id: week.weekId, label: week.weekId }));

  // 跨卡导航（B.5.2）：滚动 + 目标卡聚焦 + 「来自…」返回条；内存瞬态，不写 params。
  const cardRefs = {
    main: useRef<HTMLDivElement | null>(null),
    reference: useRef<HTMLDivElement | null>(null),
    market: useRef<HTMLDivElement | null>(null),
    inventory: useRef<HTMLDivElement | null>(null),
    margin: useRef<HTMLDivElement | null>(null),
  } as const;
  const [crossFocus, setCrossFocus] = useState<CrossCardFocus | null>(null);
  const navigateCard = useCallback((target: CrossCardTarget, weekId: string | null, sourceLabel: string) => {
    const el = cardRefs[target].current;
    const returnScrollY = window.scrollY;
    if (el != null) {
      el.scrollIntoView({ block: 'start', inline: 'nearest' });
      el.focus({ preventScroll: true });
    }
    setCrossFocus({ target, weekId, sourceLabel, returnScrollY });
    // cardRefs 为稳定对象引用（useRef 聚合），不随渲染变化。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const returnToSource = useCallback(() => {
    setCrossFocus((current) => {
      if (current != null) window.scrollTo({ top: current.returnScrollY, behavior: 'auto' });
      return null;
    });
  }, []);

  // ①参考卡定位请求（T7 / B.5.5）：主图学习证据「定位」跳来；seq 递增触发。
  const [locateRequest, setLocateRequest] = useState<ReferenceLocateRequest | null>(null);
  const locateSeqRef = useRef(0);
  const handleFocusCard = useCallback((card: 'reference' | 'market' | 'inventory', weekId: string) => {
    navigateCard(card, weekId, '结果总览');
    if (card === 'reference') {
      locateSeqRef.current += 1;
      setLocateRequest({ seq: locateSeqRef.current, weekId });
    }
  }, [navigateCard]);

  // 主图范围事件编辑器（T7）：名录「编辑」打开同一录入器并预填原范围
  // （initialRange）；提交 = 同 id 原位替换（一个事件一个范围，不自动拆条）。
  const [eventEditor, setEventEditor] = useState<{
    range: { startWeekId: string; endWeekId: string } | null;
    replaceId: string | null;
  } | null>(null);

  // 参考回放触发信号（§4.5）：主图输入（手调应用 / 产品事件变化）时向参考卡发
  // transient 信号（seq 递增）；产品事件按明确映射带 eventType：
  // competitor-launch → competitor-launch / own-promo → promo / cannibalization →
  // cannibalization。新增事件传新增项类型；删除事件不把剩余数组末项误当被删
  // 事件 → eventType 回退 undefined（参考卡展示当前有效事件，不声称「类似时间」）。
  const [referenceSignal, setReferenceSignal] = useState<ReferenceInputSignal | null>(null);
  const inputSigRef = useRef('');
  useEffect(() => {
    const manualSig = JSON.stringify(params.manual);
    const eventSig = JSON.stringify(params.productEvents);
    const current = JSON.stringify([manualSig, eventSig]);
    const prev = inputSigRef.current;
    inputSigRef.current = current;
    if (prev === '' || prev === current) return;
    const [prevManual, prevEvent] = JSON.parse(prev) as [string, string];
    if (prevManual === manualSig && prevEvent === eventSig) return;
    let weekLabel: string | undefined;
    let eventType: ReferenceInputSignal['eventType'] | undefined;
    if (prevEvent !== eventSig) {
      const prevEvents = JSON.parse(prevEvent) as ProductEventSeed[];
      const prevIds = new Set(prevEvents.map((event) => event.id));
      const added = params.productEvents.find((event) => !prevIds.has(event.id));
      if (added) {
        weekLabel = added.startWeekId;
        eventType = added.type === 'own-promo' ? 'promo' : added.type;
      } else {
        const removed = prevEvents.find((event) => !params.productEvents.some((next) => next.id === event.id));
        weekLabel = removed ? removed.startWeekId : undefined;
        eventType = undefined;
      }
    } else {
      // v3 manual 键 = 预测周 WeekId（YYYYWww 字典序 = 日历序）。
      const manualWeeks = Object.keys(params.manual).sort();
      weekLabel = manualWeeks.length ? manualWeeks[manualWeeks.length - 1] : undefined;
    }
    setReferenceSignal((prevSignal) => ({
      seq: (prevSignal?.seq ?? 0) + 1,
      kind: prevEvent !== eventSig ? 'event' : 'manual',
      weekLabel,
      eventType,
    }));
  }, [params.manual, params.productEvents]);

  // 主图受控视图（WP5 view/controls 接口，WP6 8.3 Step 10）：会话级跨页保留，
  // 由共享工具行 ChartToolbar 写入；预测页只启用 scale / yTicks。
  const [mainView, setMainView] = usePageViewState<MainForecastView>('forecast.mainView', () => DEFAULT_MAIN_FORECAST_VIEW);
  const patchMainView = (patch: Partial<MainForecastView>): void =>
    setMainView((prev) => ({ ...DEFAULT_MAIN_FORECAST_VIEW, ...prev, ...patch }));

  const mainControls = (
    <ChartToolbar
      mode="all"
      featureVisibility={{ tiers: false, yCompress: false, lineShape: false }}
      sliderScale={mainView.heightScale}
      onSliderScale={(value) => patchMainView({ heightScale: value })}
      showYTicks={mainView.showYTicks}
      onShowYTicks={(value) => patchMainView({ showYTicks: value })}
      labelMode={mainView.labelMode}
      labelModeLabel="周标签密度"
      onLabelMode={(value) => patchMainView({ labelMode: value })}
      presentationSlot={(
        <Checkbox
          checked={mainView.promoBandOn}
          onChange={(event) => patchMainView({ promoBandOn: event.target.checked })}
        >
          <span style={{ fontSize: 12 }}>促销日期标注</span>
        </Checkbox>
      )}
    />
  );

  // 主图 MarginView 过渡切片（T9 价格接线，最小）：显示价 / 单台与周销毛，键 = WeekId。
  const mainMarginView = useMemo<MainForecastMarginView>(() => ({
    weeks: Object.fromEntries(marginView.weeks.map((week) => [week.weekId, {
      effectivePrice: week.effectivePrice,
      unitMargin: week.unitMargin,
      weeklyMargin: week.weeklyMargin,
    }])),
  }), [marginView]);

  /** 重置基准（B.5.10）：只清 v3 主链 params 与 SI 确认；确认文案明确
   *  「成本价格、参考事件与情报审核工作区不清」。④另有独立「还原成本与价格基准」。 */
  const confirmReset = (): void => {
    Modal.confirm({
      title: '重置基准？',
      content: '将清除：本页主链假设草稿（上一代参照 / 大盘调整与事件 / SI 月计划 / 产品范围事件 / 周销手调）与 SI 逐月确认记录。不清：④成本价格假设与价格手调、参考卡事件工作区、情报审核工作区。',
      okText: '重置基准',
      cancelText: '取消',
      onOk: () => {
        resetParams();
        si.resetAll();
      },
    });
  };

  /** 复制关键假设（8.4 / 任务 10）：纯文本进剪贴板（v3 上下文同源）；
   *  成功「已复制」/ 失败「复制失败」，不新增纪要层。 */
  const copyAssumptions = async (): Promise<void> => {
    const text = buildWorkbenchAssumptionText(fixture, params, result, {
      calendar,
      learning: result.learning,
      siConfirmation: { byMonth: si.byMonth },
      marginView,
      intelligenceReview: intelligence.reviewState,
    });
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(textarea);
        if (!ok) throw new Error('execCommand copy failed');
      }
      setCopyState('ok');
    } catch {
      setCopyState('fail');
    }
    window.setTimeout(() => setCopyState('idle'), 2000);
  };

  // 页面空态（8.3 Step 11）：fixture 无周数据不渲染 NaN 摘要/图表（图表卡内部另有同款空态）
  if (!hasWeeks) {
    return (
      <div data-lpl-forecast>
        <section style={{ ...workbenchCardStyle, boxShadow: shadow.l1 }}>
          <ChartContentBar />
          <div style={{ padding: `${space.lg}px 0`, textAlign: 'center' }}>
            <div role="status" style={{ fontSize: 13, color: color.mute }}>当前范围无可推演数据</div>
            <div style={{ marginTop: 6, fontSize: 11, color: color.mute }}>检查 fixture 周数据后重试；加载异常时会提示具体错误，无数据时仅显示本状态。</div>
          </div>
        </section>
      </div>
    );
  }

  const referenceLabel = fixture.references.prevGenPool.find((series) => series.id === result.learning.referenceId)?.label;
  const siTotalMonths = calendar.forecastMonths.length;

  return (
    <div data-lpl-forecast style={{ display: 'flex', flexDirection: 'column', gap: space.md, minWidth: 0 }}>
      {/* 首卡：图表页签行 + 压缩范围行（与价格/量价/大盘首卡同构的白卡壳）。
          全局筛选仅作上下文展示，计算不随其变化——口径写在一行范围行内 */}
      <section style={{ background: color.canvas, boxShadow: shadow.l1, borderRadius: radius.card, padding: `0 0 ${space.md}px`, overflow: 'hidden' }}>
        <ChartContentBar />
        <div style={{ padding: `${space.sm}px ${space.lg}px 0` }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: space.md, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ margin: 0, fontSize: fontSize.displaySm, color: color.ink }}>量价预测 · 推演工作台</h1>
              {/* 一行范围口径（8.3 Step 1 压缩：教学段与演示声明删除） */}
              <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.7, color: color.body, display: 'flex', flexWrap: 'wrap', gap: '2px 16px' }}>
                <span style={{ fontWeight: 600, color: color.ink }}>固定样本 · 不随全局筛选联动</span>
                <span>{fixture.context.country} · {fixture.context.industry} · {fixture.context.channel} · {fixture.context.product}</span>
                <span>币种 {fixture.meta.currency}（固定）</span>
                <span>{fixture.context.currentWeek} · 今天 {fixture.context.todayLabel}</span>
                <span>历史 {fixture.context.historyRange}（模拟实际）· 预测 {fixture.context.forecastRange}</span>
                <span>主参考 {fixture.context.prevGenProduct} 同周龄</span>
                <span>参照竞品 {fixture.context.competitor}</span>
                {/* SI 未全部确认页首提示（B.5.7）：主图可看参考结果，但确认事实显式可见 */}
                {siPendingCount > 0 && (
                  <span
                    style={{ fontWeight: 600, color: color.warningInk }}
                    title="SI 逐月确认未完成：主图当前为 SI 计划参考结果，不视作人工确认完成"
                  >
                    SI 未全部确认（待确认 {siPendingCount} / {siTotalMonths}）
                  </span>
                )}
              </div>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
              {/* 页首模拟标识只保留 DataStatusBadge 一处（页级 DemoChip 已移除） */}
              <DataStatusBadge status={fixture.meta.status} />
              <span className="mono" style={{ fontSize: 11, color: color.body, padding: '2px 8px', border: `1px solid ${color.hairline}`, borderRadius: radius.control }}>{fixture.meta.modelVersion}</span>
              <Button icon={<RobotOutlined />} onClick={() => {
                const prompt = '解释当前量价预测推演的关键考量、库存修正与风险';
                openAgent('full', { text: prompt });
                void send(prompt);
              }}>让 Agent 解释</Button>
              <Button
                icon={<CopyOutlined />}
                onClick={() => { void copyAssumptions(); }}
                aria-live="polite"
              >
                {copyState === 'ok' ? '已复制' : copyState === 'fail' ? '复制失败' : '复制关键假设'}
              </Button>
            </div>
          </div>
          {labels.country !== fixture.context.country && (
            <div style={{ marginTop: 4, fontSize: 11, color: color.mute }}>
              {`全局筛选（${labels.country} · ${labels.industry}）仅作上下文展示，不改变本页计算口径`}
            </div>
          )}
        </div>
      </section>

      {/* PipelineNav（T6 / B.5.1-B.5.2）：首卡范围行之下、结果主图之上的一条全局
          管线（①自动学习基线 → ②大盘修正 → ③库存修正 → ④成本及销毛）；
          点击只定位（滚动 + 聚焦 + 返回条），不写 params、不重算。 */}
      <PipelineNav
        calendar={calendar}
        result={result}
        params={params}
        confirmationState={{ byMonth: si.byMonth }}
        marginView={marginView}
        onNavigate={(stage) => navigateCard(stageCardOf(stage), null, '结果总览')}
        referenceLabel={referenceLabel}
      />

      {/* ① 结果总览（主图视觉重心，只露最终结果）+ 摘要行（销毛读 MarginView，与④同源） */}
      <div ref={cardRefs.main} tabIndex={-1} style={{ display: 'grid', minWidth: 0, gap: space.sm }}>
        {crossFocus?.target === 'main' && (
          <CrossCardReturnBar sourceLabel={crossFocus.sourceLabel} weekId={crossFocus.weekId} onReturn={returnToSource} />
        )}
        <section style={workbenchCardStyle}>
          <SectionHead
            title={`量价预测主图 · ${fixture.context.product}`}
            hint={`历史 ${fixture.context.historyRange} 实柱（实际）· 预测 ${fixture.context.forecastRange} 虚柱；促销档期为轴下日期标注；悬停预测周看「本周考量」构成，点击柱体微调（原因选填，填了则内联标注在主图手调处）。`}
            extra={
              <>
                <SimChip title="主图数值为演示假设：历史段为模拟实际，预测段为模型推演" />
                <AiJudgeBadge source={overrideSourceOf(params)} />
                <span style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: radius.pill,
                  background: active ? color.ink : color.canvasSoft2,
                  color: active ? color.onPrimary : color.mute,
                  whiteSpace: 'nowrap',
                }}>
                  {active ? '本地考量已修改' : '基准考量'}
                </span>
                <Button icon={<PlusOutlined />} onClick={() => setEventEditor({ range: null, replaceId: null })}>录入事件</Button>
                <Button
                  disabled={!active && Object.keys(si.byMonth).length === 0}
                  onClick={confirmReset}
                >重置基准</Button>
              </>
            }
          />
          {/* 2026-11-05 视觉精简二轮：IoBar 与摘要四格下沉为主图「数据与操作」收起区
              的 extras（MainForecastChart 内共享 CollapsibleSection，默认收起）——
              默认视图 = 卡头 + 图表本身（图 + 图例 + 时间轨）。 */}
          <MainForecastChart
            fixture={fixture}
            params={params}
            result={result}
            view={mainView}
            controls={mainControls}
            marginView={mainMarginView}
            onViewChange={patchMainView}
            onTuneWeek={(weekId) => setTuneWeek(weekId)}
            onFocusCard={handleFocusCard}
            onEditProductEvent={(event) => setEventEditor({
              range: { startWeekId: event.startWeekId, endWeekId: event.endWeekId },
              replaceId: event.id,
            })}
            onRemoveProductEvent={(id) => setParams((prev) => ({ ...prev, productEvents: prev.productEvents.filter((event) => event.id !== id) }))}
            extras={(
              <>
                <IoBar
                  input="大盘时间序列（经事件修正）· 量价参考（上一代同期形态）· 主图小事件考量"
                  output="主品周销预测（最终口径含库存上限修正，修正周琥珀描边）"
                />
                {/* 摘要行：预测期总销量 / 大促峰 / 库存上限修正缺口 / 预测期销毛（MarginView，与④同源） */}
                <div role="group" aria-label="预测摘要" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: space.md, marginTop: space.md }}>
                  {([
                    {
                      label: `预测期总销量（${fixture.context.forecastRange}）`,
                      value: fmtWan(result.summary.totalSales),
                      foot: `${result.summary.vsHistoryPct > 0 ? '+' : ''}${result.summary.vsHistoryPct}% vs ${fixture.context.historyRange}`,
                    },
                    {
                      label: `大促峰 · ${result.summary.peak.weekId}`,
                      value: fmtWan(result.summary.peak.value),
                      foot: result.summary.peak.note,
                    },
                    {
                      label: result.firstAdjustedWeek != null ? `库存上限修正（${result.firstAdjustedWeek} 起）` : '库存上限修正',
                      value: result.summary.gap > 0 ? `−${fmtWan(result.summary.gap)}` : '未触发',
                      foot: result.summary.gap > 0
                        ? 'min(基线 SO, 可售) 回写主图，修正周琥珀描边'
                        : '当前可售口径覆盖预测需求',
                      tone: result.summary.gap > 0 ? color.warningInk : undefined,
                    },
                    {
                      label: '预测期销毛（末端独立推测）',
                      value: fmtMillionUsd(marginView.forecastMargin),
                      foot: `历史 ${fixture.context.historyRange} ${fmtMillionUsd(marginView.historyMargin)} · 按月版本成本 · 与④成本销毛同源`,
                      tone: marginView.appliedPriceCount + marginView.appliedCostCount > 0 ? color.warningInk : undefined,
                    },
                  ] as Array<{ label: string; value: string; foot: string; tone?: string }>).map((cell) => (
                    <div key={cell.label} style={{ background: color.canvasSoft, borderRadius: radius.control, padding: `${space.md - 2}px ${space.md}px` }}>
                      <div style={{ fontSize: 11, color: color.mute }}>{cell.label}</div>
                      <strong className="tnum" style={{ display: 'block', marginTop: 4, fontSize: 18, fontWeight: 700, color: cell.tone ?? color.ink }}>{cell.value}</strong>
                      <div style={{ marginTop: 3, fontSize: 11, color: color.mute }}>{cell.foot}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          />
        </section>
      </div>

      {/* ② 量价参考（①基线预测 · 历史参照，纯历史无预测段，参考品居首；上一代选择受控进主链；
          智能弹框 = 主图输入变化时在参考卡内弹参照表现提示条；locateRequest = 主图学习证据定位） */}
      <div ref={cardRefs.reference} tabIndex={-1} style={{ display: 'grid', minWidth: 0, gap: space.sm }}>
        {crossFocus?.target === 'reference' && (
          <CrossCardReturnBar sourceLabel={crossFocus.sourceLabel} weekId={crossFocus.weekId} onReturn={returnToSource} />
        )}
        <ReferencePanel
          fixture={fixture}
          result={result}
          prevGenReferenceId={params.prevGenReferenceId}
          onPrevGenReferenceChange={(id) => setParams((prev) => ({ ...prev, prevGenReferenceId: id }))}
          inputSignal={referenceSignal}
          locateRequest={locateRequest}
        />
      </div>

      {/* ③ 大盘 · 总量总线（②大盘修正：月粒度主序列 = 历史月 + 统一 12 个预测月；
          点击预测月就地调整（原因选填）；右 1/3 事件区 = 情报候选审核容器（当前
          availability="pending" 空态）+ 人工月度事件三字段录入） */}
      <div ref={cardRefs.market} tabIndex={-1} style={{ display: 'grid', minWidth: 0, gap: space.sm }}>
        {crossFocus?.target === 'market' && (
          <CrossCardReturnBar sourceLabel={crossFocus.sourceLabel} weekId={crossFocus.weekId} onReturn={returnToSource} />
        )}
        <MarketBusPanel
          fixture={fixture}
          params={params}
          result={result}
          onMonthOverride={(monthKey, value, reason) => setParams((prev) => withMarketMonthOverride(prev, monthKey, value, reason))}
          onMonthEventAdd={(event) => setParams((prev) => ({
            ...prev,
            marketMonthEvents: [...prev.marketMonthEvents, { ...event, id: nextMarketMonthEventId(prev.marketMonthEvents) }],
          }))}
          onMonthEventRemove={(id) => setParams((prev) => ({ ...prev, marketMonthEvents: prev.marketMonthEvents.filter((item) => item.id !== id) }))}
          onMonthEventUpdate={(id, event) => setParams((prev) => ({
            ...prev,
            marketMonthEvents: prev.marketMonthEvents.map((item) => (item.id === id ? { ...event, id } : item)),
          }))}
          onViewMainChart={() => navigateCard('main', null, '② 大盘修正')}
          onCheckInventory={() => navigateCard('inventory', null, '② 大盘修正')}
          onRationaleChange={(text) => setParams((prev) => ({ ...prev, rationale: text }))}
        />
      </div>

      {/* ④⑤ 库存修正 + 成本销毛：左右两列（卡序 ④→⑤ 不变）。
          左列 1fr（库存卡内容多：SI 逐月确认格子行 + 链路条 + 图 + 输出框），右列
          0.8fr（成本销毛为窄卡）；窄屏退化 = 复用仓库既有
          [data-lpl-forecast-grid] @media 断点（index.css，≤760px 单列堆叠）。 */}
      <div
        data-lpl-forecast-grid
        style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 0.8fr)', gap: space.md, alignItems: 'stretch' }}
      >
        <div ref={cardRefs.inventory} tabIndex={-1} style={{ display: 'grid', minWidth: 0, gap: space.sm }}>
          {crossFocus?.target === 'inventory' && (
            <CrossCardReturnBar sourceLabel={crossFocus.sourceLabel} weekId={crossFocus.weekId} onReturn={returnToSource} />
          )}
          <InventoryValidationCard
            fixture={fixture}
            calendar={calendar}
            params={params}
            result={result}
            confirmationState={{ byMonth: si.byMonth }}
            onSiMonthLive={(monthKey, units) => setParams((prev) => ({ ...prev, siPlanMonthly: { ...prev.siPlanMonthly, [monthKey]: units } }))}
            onConfirmMonth={si.confirmMonth}
            onResetMonth={si.resetMonth}
            onNavigate={(weekId) => navigateCard('main', weekId, '③ 库存修正')}
            siSaveState={si.saveState}
            onRetrySiPersist={si.retryPersist}
          />
        </div>
        <div ref={cardRefs.margin} tabIndex={-1} style={{ display: 'grid', minWidth: 0, gap: space.sm }}>
          {crossFocus?.target === 'margin' && (
            <CrossCardReturnBar sourceLabel={crossFocus.sourceLabel} weekId={crossFocus.weekId} onReturn={returnToSource} />
          )}
          {/* ④卡内部工作区与本页 useMarginScenario 共享同一会话 store（键 =
              forecast.marginScenario.workbench-demo-v3）；传入页级 MarginView 保证
              主数字与页面摘要 / PipelineNav 同源；价格手调回跳 = 主图定位。 */}
          <ForecastMarginCostCard
            fixture={fixture}
            result={result}
            marginView={marginView}
            onJumpToPriceOverride={(weekId) => navigateCard('main', weekId, '④ 成本销毛')}
          />
        </div>
      </div>

      {/* 单周微调弹窗：调整原因选填（不填即可应用；填了则内联标注主图手调处） */}
      {tuneWeekResult && (
        <TuneDialog
          key={tuneWeekResult.weekId}
          weekLabel={tuneWeekResult.weekId}
          dateLabel={tuneWeekResult.dateLabel}
          currentValue={tuneWeekResult.final ?? 0}
          manual={tuneWeekResult.manual}
          onCancel={() => setTuneWeek(null)}
          onSave={(value, reason) => {
            const next = setManualAdjustment(params, tuneWeekResult.weekId, value, reason);
            if (!next) return;
            setParams(next);
            setTuneWeek(null);
          }}
          onClear={() => {
            setParams((prev) => clearManualAdjustment(prev, tuneWeekResult.weekId));
            setTuneWeek(null);
          }}
        />
      )}

      {/* 主图范围事件录入 / 编辑（名录「编辑」同范围原位替换）：弹参考品事实回放
          （四类解释场景）；新增 ID 循环查重（8.3 Step 6）；initialRange = T7 预留 prop */}
      {eventEditor && (
        <EventReplayModal
          key={eventEditor.replaceId ?? 'new'}
          fixture={fixture}
          forecastWeeks={forecastWeekOptions}
          initialRange={eventEditor.range}
          onCancel={() => setEventEditor(null)}
          onSubmit={(event: Omit<ProductEventSeed, 'id'>) => {
            setParams((prev) => {
              if (eventEditor.replaceId != null) {
                return {
                  ...prev,
                  productEvents: prev.productEvents.map((item) => (item.id === eventEditor.replaceId ? { ...event, id: eventEditor.replaceId } : item)),
                };
              }
              return {
                ...prev,
                productEvents: [...prev.productEvents, { ...event, id: nextProductEventId(prev.productEvents, event.startWeekId) }],
              };
            });
            setEventEditor(null);
          }}
        />
      )}
    </div>
  );
}
