// ============================================================
// 量价预测 · 推演工作台 v2（forecast-workbench-v2）— WP6 集成版。
// 正典：pricelens/.impeccable/surfaces/forecast-workbench-v2.md。
// 页面入共享分析壳（App.AnalysisShell showFilters=false）：本组件不再自挂
// PageHeader / 独立滚动壳，只负责首卡（图表页签 + 压缩范围行）与五层卡序。
// 五层自上而下：①主图+摘要 ②量价参考（纯历史） ③大盘·总量总线 ④库存验证
// ⑤成本销毛。共享一份 WorkbenchParams / WorkbenchResult（会话草稿经
// useWorkbenchParams 持久化），五卡同源不出现第二套数字。
// 模拟标识分级：页首 DataStatusBadge 一处 + 各卡轻量 SimChip；范围行写
// 「固定样本 · 不随全局筛选联动」；「复制关键假设」= 纪要层的替代物。
// 措辞不出现 因子/约束/置信区间/无约束需求/我司；话术统一
// 「库存上限修正 / 按可售量修正 / 修正周」。数据全部演示（2026 真实周历）。
// ============================================================
import { useEffect, useMemo, useRef, useState } from 'react';
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
  setManualAdjustment,
  withMarketMonthOverride,
} from './forecast/workbenchModel';
import useWorkbenchParams, { nextProductEventId } from './forecast/useWorkbenchParams';
import { buildWorkbenchAssumptionText } from './forecast/workbenchExport';
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
import MainForecastChart, { DEFAULT_MAIN_FORECAST_VIEW, type MainForecastView } from './forecast/MainForecastChart';
import ReferencePanel, { type ReferenceInputSignal } from './forecast/ReferencePanel';
import MarketBusPanel from './forecast/MarketBusPanel';
import InventoryValidationCard from './forecast/InventoryValidationCard';
import ForecastMarginCostCard from './forecast/ForecastMarginCostCard';
import EventReplayModal from './forecast/EventReplayModal';

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

export default function ForecastPage() {
  const { state } = useFilters();
  const { openAgent, send } = useAgent();
  const labels = scopeLabels(state);
  const fixture = workbenchFixture;

  // 会话草稿（WP6 8.2）：切页往返保留，重置基准只清当前模型版本草稿
  const { params, setParams, resetParams } = useWorkbenchParams(fixture);
  const [tuneWeek, setTuneWeek] = useState<number | null>(null);
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'fail'>('idle');
  const result = useMemo(() => computeWorkbench(fixture, params), [fixture, params]);
  const active = isParamsActive(params, fixture);
  const hasWeeks = fixture.weeks.length > 0;

  const tuneWeekResult = tuneWeek != null ? result.weeks.find((week) => week.weekNumber === tuneWeek) ?? null : null;
  const forecastWeekOptions = result.weeks.filter((week) => week.status === 'forecast')
    .map((week) => ({ week: week.week, weekNumber: week.weekNumber }));

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
        weekLabel = `W${added.week}`;
        eventType = added.type === 'own-promo' ? 'promo' : added.type;
      } else {
        const removed = prevEvents.find((event) => !params.productEvents.some((next) => next.id === event.id));
        weekLabel = removed ? `W${removed.week}` : undefined;
        eventType = undefined;
      }
    } else {
      const manualWeeks = Object.keys(params.manual).map(Number).filter((week) => Number.isFinite(week));
      weekLabel = manualWeeks.length ? `W${Math.max(...manualWeeks)}` : undefined;
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

  /** 复制关键假设（8.4）：纯文本进剪贴板；成功「已复制」/ 失败「复制失败」，不新增纪要层。 */
  const copyAssumptions = async (): Promise<void> => {
    const text = buildWorkbenchAssumptionText(fixture, params, result);
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

      {/* ① 主图（视觉重心，只露最终结果）+ 摘要行 */}
      <section style={workbenchCardStyle}>
        <SectionHead
          title={`量价预测主图 · ${fixture.context.product}`}
          hint={`历史 ${fixture.context.historyRange} 实柱（实际）· 预测 ${fixture.context.forecastRange} 虚柱；促销档期为轴下日期标注；悬停预测周看「本周考量」构成，点击柱体微调（原因选填，填了则内联标注在主图手调处）。`}
          extra={
            <>
              <SimChip title="主图数值为演示假设：历史段为模拟实际，预测段为模型推演" />
              <AiJudgeBadge source={params.overrideSource} />
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
              <Button icon={<PlusOutlined />} onClick={() => setEventModalOpen(true)}>录入事件</Button>
              <Button disabled={!active} onClick={resetParams}>重置基准</Button>
            </>
          }
        />
        <IoBar
          input="大盘时间序列（经事件修正）· 量价参考（上一代同期形态）· 主图小事件考量"
          output="主品周销预测（最终口径含库存上限修正，修正周琥珀描边）"
        />
        <MainForecastChart
          fixture={fixture}
          params={params}
          result={result}
          view={mainView}
          controls={mainControls}
          onTuneWeek={(weekNumber) => setTuneWeek(weekNumber)}
          onRemoveProductEvent={(id) => setParams((prev) => ({ ...prev, productEvents: prev.productEvents.filter((event) => event.id !== id) }))}
        />
        {/* 摘要行：预测期总销量 / 大促峰 / 库存上限修正缺口 / 预测期销毛（话术与库存卡统一） */}
        <div role="group" aria-label="预测摘要" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: space.md, marginTop: space.md }}>
          {([
            {
              label: `预测期总销量（${fixture.context.forecastRange}）`,
              value: fmtWan(result.summary.totalSales),
              foot: `${result.summary.vsHistoryPct > 0 ? '+' : ''}${result.summary.vsHistoryPct}% vs ${fixture.context.historyRange}`,
            },
            {
              label: `大促峰 · W${result.summary.peak.weekNumber}`,
              value: fmtWan(result.summary.peak.value),
              foot: result.summary.peak.note,
            },
            {
              label: result.firstAdjustedWeek != null ? `库存上限修正（W${result.firstAdjustedWeek} 起）` : '库存上限修正',
              value: result.summary.gap > 0 ? `−${fmtWan(result.summary.gap)}` : '未触发',
              foot: result.summary.gap > 0
                ? 'min(基线 SO, 可售) 回写主图，修正周琥珀描边'
                : '当前可售口径覆盖预测需求',
              tone: result.summary.gap > 0 ? color.warningInk : undefined,
            },
            {
              label: '预测期销毛（末端独立推测）',
              value: fmtMillionUsd(result.summary.forecastMargin),
              foot: `历史 ${fixture.context.historyRange} ${fmtMillionUsd(result.summary.historyMargin)} · 按月版本成本 · 不回写主图`,
            },
          ] as Array<{ label: string; value: string; foot: string; tone?: string }>).map((cell) => (
            <div key={cell.label} style={{ background: color.canvasSoft, borderRadius: radius.control, padding: `${space.md - 2}px ${space.md}px` }}>
              <div style={{ fontSize: 11, color: color.mute }}>{cell.label}</div>
              <strong className="tnum" style={{ display: 'block', marginTop: 4, fontSize: 18, fontWeight: 700, color: cell.tone ?? color.ink }}>{cell.value}</strong>
              <div style={{ marginTop: 3, fontSize: 11, color: color.mute }}>{cell.foot}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ② 量价参考（历史参照，纯历史无预测段，参考品居首；上一代选择受控进主链；
          智能弹框 = 主图输入变化时在参考卡内弹参照表现提示条） */}
      <ReferencePanel
        fixture={fixture}
        result={result}
        prevGenReferenceId={params.prevGenReferenceId}
        onPrevGenReferenceChange={(id) => setParams((prev) => ({ ...prev, prevGenReferenceId: id }))}
        inputSignal={referenceSignal}
      />

      {/* ③ 大盘 · 总量总线（月粒度主序列：历史月 + 未来 4 季度逐月预测；
          点击预测月就地调整（原因选填，季内均值同步主链改格）；
          右 1/3 事件区 = AI 候选 Top5 占位 + 人工月度事件三字段录入） */}
      <MarketBusPanel
        fixture={fixture}
        params={params}
        result={result}
        onMonthOverride={(monthKey, value, reason) => setParams((prev) => withMarketMonthOverride(prev, fixture, monthKey, value, reason))}
        onMonthEventAdd={(event) => setParams((prev) => ({
          ...prev,
          marketMonthEvents: [...prev.marketMonthEvents, { ...event, id: nextMarketMonthEventId(prev.marketMonthEvents) }],
        }))}
        onMonthEventRemove={(id) => setParams((prev) => ({ ...prev, marketMonthEvents: prev.marketMonthEvents.filter((item) => item.id !== id) }))}
        onRationaleChange={(text) => setParams((prev) => ({ ...prev, rationale: text }))}
      />

      {/* ④ 库存验证（SI 月计划唯一人工输入 → 反算 → min 修正回写主图；
          本地草稿即时更新，不设假提交口、不宣称写真实数据） */}
      <InventoryValidationCard
        fixture={fixture}
        params={params}
        result={result}
        onSiMonthLive={(monthKey, units) => setParams((prev) => ({ ...prev, siPlanMonthly: { ...prev.siPlanMonthly, [monthKey]: units } }))}
      />

      {/* ⑤ 成本销毛（链路末端独立推测，不回写主图） */}
      <ForecastMarginCostCard fixture={fixture} result={result} />

      {/* 单周微调弹窗：调整原因选填（不填即可应用；填了则内联标注主图手调处） */}
      {tuneWeekResult && (
        <TuneDialog
          key={tuneWeekResult.week}
          weekLabel={tuneWeekResult.week}
          dateLabel={tuneWeekResult.dateLabel}
          currentValue={tuneWeekResult.final ?? 0}
          manual={tuneWeekResult.manual}
          onCancel={() => setTuneWeek(null)}
          onSave={(value, reason) => {
            const next = setManualAdjustment(params, tuneWeekResult.weekNumber, value, reason);
            if (!next) return;
            setParams(next);
            setTuneWeek(null);
          }}
          onClear={() => {
            setParams((prev) => clearManualAdjustment(prev, tuneWeekResult.weekNumber));
            setTuneWeek(null);
          }}
        />
      )}

      {/* 主图小事件录入：弹参考品事实回放（四类解释场景）；ID 循环查重（8.3 Step 6） */}
      {eventModalOpen && (
        <EventReplayModal
          fixture={fixture}
          forecastWeeks={forecastWeekOptions}
          onCancel={() => setEventModalOpen(false)}
          onSubmit={(event: Omit<ProductEventSeed, 'id'>) => {
            setParams((prev) => ({
              ...prev,
              productEvents: [...prev.productEvents, { ...event, id: nextProductEventId(prev.productEvents, event.week) }],
            }));
            setEventModalOpen(false);
          }}
        />
      )}
    </div>
  );
}
