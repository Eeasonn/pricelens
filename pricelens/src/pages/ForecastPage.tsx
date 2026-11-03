// ============================================================
// 量价预测 · 推演工作台 v2（forecast-workbench-v2）
// 正典：pricelens/.impeccable/surfaces/forecast-workbench-v2.md（2026-11-03
// 三轮产品讨论定稿 + 同日晚 Eason 反馈：大盘卡单线连贯/只预测下一季/事件
// 三参数[生效季+持续+幅度]/仅行业级事件；推演纪要层删除——手调原因必填保留，
// 原因标注在主图手调处）。
// 两条铁律：展示与推演分离（推演层只要总量总线）；顺序执行解决循环论证
// （大盘/成本/参考 → 不含库存限制预测 → 库存验证判定 → 打折修正回写主图；
// 主图只露最终结果）。
// 页面自挂 PageHeader + data-lpl-scroll 滚动容器（不进 AnalysisShell）；
// 五层自上而下：①主图+摘要 ②大盘·总量总线 ③量价参考 ④成本销毛 ⑤库存验证。
// 数据全部演示（2026 真实周历 W37–W52），恒带 simulated 徽标 + 「演示」琥珀
// chip；措辞不出现 因子/约束/置信区间/无约束需求 等术语。
// ============================================================
import { useMemo, useState, type ReactNode } from 'react';
import { RobotOutlined } from '@ant-design/icons';
import { Button, Input, InputNumber, Modal } from 'antd';
import PageHeader from '../components/PageHeader';
import ChartContentBar from '../components/ChartContentBar';
import { useAgent } from '../state/AgentContext';
import { useFilters } from '../state/FiltersContext';
import { scopeLabels } from '../dataModel/scope';
import { color, fontSize, radius, space } from '../theme/tokens';
import { workbenchFixture } from './forecast/workbenchFixture';
import {
  baseWorkbenchParams,
  clearManualAdjustment,
  computeWorkbench,
  isParamsActive,
  setManualAdjustment,
  type WorkbenchParams,
} from './forecast/workbenchModel';
import { DataStatusBadge } from './forecast/ForecastBits';
import {
  AiJudgeBadge,
  DemoChip,
  SectionHead,
  fmtMillionUsd,
  fmtWan,
  workbenchCardStyle,
} from './forecast/WorkbenchBits';
import MainForecastChart from './forecast/MainForecastChart';
import MarketBusPanel from './forecast/MarketBusPanel';
import ReferencePanel from './forecast/ReferencePanel';
import ForecastMarginCostCard from './forecast/ForecastMarginCostCard';
import InventoryValidationCard from './forecast/InventoryValidationCard';

/** TODO 待拍板（brief 开放问题 3/4 关联）：新增事件名称来自预设池占位（仅行业级事件）。 */
const ADD_EVENT_POOL = ['三折叠上市', '地缘冲突扰动', '汇率跳变', '平台补贴退坡'];
const MAGNITUDE_MIN = -30;
const MAGNITUDE_MAX = 30;

/** 单周微调弹窗：调整原因必填（不填禁用保存），已有手调可一键清除。 */
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
  const reasonOk = reason.trim().length > 0;
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
          <Button type="primary" disabled={!reasonOk || !valueOk} onClick={() => valueOk && wan != null && onSave(Math.round(wan * 10000), reason)}>
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
          调整原因（必填）
          <Input.TextArea
            aria-label="调整原因（必填）"
            aria-invalid={!reasonOk}
            aria-describedby="tune-reason-warn"
            placeholder="如：黑五主峰周，电商资源加投"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            autoSize={{ minRows: 2, maxRows: 4 }}
          />
        </label>
        <div id="tune-reason-warn" role="alert" style={{ fontSize: 11, color: reasonOk ? color.mute : color.error, minHeight: 16 }}>
          {reasonOk ? '原因将标注在主图该周手调处' : '必须填写调整原因，否则无法应用'}
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

  const [params, setParams] = useState<WorkbenchParams>(() => baseWorkbenchParams(fixture));
  const [tuneWeek, setTuneWeek] = useState<number | null>(null);
  const result = useMemo(() => computeWorkbench(fixture, params), [fixture, params]);
  const active = isParamsActive(params, fixture);

  const tuneWeekResult = tuneWeek != null ? result.weeks.find((week) => week.weekNumber === tuneWeek) ?? null : null;

  return (
    <div style={{ height: '100%', overflowX: 'auto', overflowY: 'auto', background: color.canvasSoft }} data-lpl-scroll>
      <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
        <PageHeader />
        {/* 图表三页签（与价格走势/量价走势同款）：一键切回另两个图表页。
            币种不跟全局筛选：本页数据固定 USD（范围行显式标注）。 */}
        <div style={{ background: color.canvas, flexShrink: 0 }}>
          <ChartContentBar />
        </div>
        <main style={{ flex: 1, padding: `${space.lg}px`, maxWidth: 1280, width: '100%', margin: '0 auto', boxSizing: 'border-box', display: 'grid', gap: space.md }}>
          {/* ⓪ 范围与状态 */}
          <section style={workbenchCardStyle}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: space.md, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0 }}>
                <h1 style={{ margin: 0, fontSize: fontSize.displaySm, color: color.ink }}>量价预测 · 推演工作台</h1>
                <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.6, color: color.body }}>
                  展示层结论 → 推演假设 → 验证修正 → 会议结论一页闭环：大盘 / 成本销毛 / 量价参考得出预测销量，经库存验证打折修正后回写主图；主图只呈现最终结果。
                </div>
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
                <DataStatusBadge status={fixture.meta.status} />
                <DemoChip title="本页全部数值为演示假设：大盘、参照、库存与 SI 计划均为演示口径，不代表真实市场" />
                <span className="mono" style={{ fontSize: 11, color: color.body, padding: '2px 8px', border: `1px solid ${color.hairline}`, borderRadius: radius.control }}>{fixture.meta.modelVersion}</span>
                <Button icon={<RobotOutlined />} onClick={() => {
                  const prompt = '解释当前量价预测推演的关键考量、库存修正与风险';
                  openAgent('full', { text: prompt });
                  void send(prompt);
                }}>让 Agent 解释</Button>
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', marginTop: space.md, padding: `${space.md - 2}px ${space.md}px`, border: `1px solid ${color.hairline}`, borderRadius: radius.control, background: color.canvasSoft, fontSize: 12, color: color.body }}>
              {[
                ['全局筛选范围', `${labels.country} · ${labels.industry}`],
                ['演示口径', `${fixture.context.country} · ${fixture.context.industry} · ${fixture.context.channel} · ${fixture.context.product}`],
                ['币种', `${fixture.meta.currency}（固定）`],
                ['价格档', fixture.context.priceBand],
                ['当前周', `${fixture.context.currentWeek} · 今天 ${fixture.context.todayLabel}（数据截至 ${fixture.context.currentWeek}）`],
                ['主参考', `${fixture.context.prevGenProduct} 同周龄`],
                ['参照竞品', fixture.context.competitor],
              ].map(([label, value]) => (
                <span key={label} style={{ display: 'inline-flex', gap: 6, maxWidth: '100%' }}>
                  <span style={{ color: color.mute, whiteSpace: 'nowrap' }}>{label}</span>
                  <strong style={{ fontWeight: 600, color: color.ink }}>{value}</strong>
                </span>
              ))}
            </div>
            <div style={{ marginTop: space.sm, fontSize: 11, lineHeight: 1.6, color: color.mute }}>
              本页为固定演示范围（来源 {fixture.meta.source}，生成 {fixture.meta.generatedAt}）：计算不随全局国家 / 币种筛选变化，全局筛选仅作上下文展示。历史段（W37–W44）为演示实际，预测窗口（W45–W52）为模型推演；把握区间是演示假设，不是统计结论；缺数周不插值。所有调整只进本地推演，不写入真实数据。
            </div>
          </section>

          {/* ① 主图（视觉重心）+ 摘要行 */}
          <section style={workbenchCardStyle}>
            <SectionHead
              title={`量价预测主图 · ${fixture.context.product}`}
              hint={`历史 ${fixture.context.historyRange} 实柱实线（演示实际）· 预测 ${fixture.context.forecastRange} 虚柱虚线；悬停预测周看「本周考量」构成，点击柱体微调（需填原因）。`}
              extra={
                <>
                  <AiJudgeBadge source={params.qoqSource} />
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: radius.pill, background: active ? color.warningSoft : color.canvasSoft2, color: active ? color.warningInk : color.mute, whiteSpace: 'nowrap' }}>
                    {active ? '本地考量已修改' : '基准考量'}
                  </span>
                  <Button disabled={!active} onClick={() => setParams(baseWorkbenchParams(fixture))}>重置基准</Button>
                </>
              }
            />
            <MainForecastChart fixture={fixture} result={result} onTuneWeek={(weekNumber) => setTuneWeek(weekNumber)} />
            {/* 摘要行：预测期总销量 / 大促峰 / 库存修正缺口 / 预测期销毛 */}
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
                  label: result.firstAdjustedWeek != null ? `库存修正缺口（W${result.firstAdjustedWeek} 起）` : '库存修正缺口',
                  value: result.summary.gap > 0 ? `−${fmtWan(result.summary.gap)}` : '未触发',
                  foot: result.summary.gap > 0
                    ? [...new Set(result.weeks.filter((week) => week.inventoryAdjusted).map((week) => week.discount))].map((discount) => (discount === 0.8 ? '8 折' : '9 折')).join(' / ') + ' 回写主图'
                    : '当前可售口径覆盖预测需求',
                  tone: result.summary.gap > 0 ? color.warningInk : undefined,
                },
                {
                  label: '预测期销毛',
                  value: fmtMillionUsd(result.summary.forecastMargin),
                  foot: `历史 ${fixture.context.historyRange} ${fmtMillionUsd(result.summary.historyMargin)} · 按月版本成本`,
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

          {/* ② 大盘 · 总量总线（产品全景：单线连贯，只预测到下一季） */}
          <MarketBusPanel
            fixture={fixture}
            params={params}
            result={result}
            onQoqLive={(value) => setParams((prev) => ({ ...prev, qoqDeclinePct: value, qoqSource: 'human' }))}
            onQoqCommit={() => {}}
            onEventStep={(id, field, delta) => {
              setParams((prev) => ({
                ...prev,
                qoqSource: 'human',
                marketEvents: prev.marketEvents.map((item) => {
                  if (item.id !== id) return item;
                  if (field === 'magnitudePct') {
                    return { ...item, magnitudePct: Math.max(MAGNITUDE_MIN, Math.min(MAGNITUDE_MAX, item.magnitudePct + delta)) };
                  }
                  if (field === 'durationStep') {
                    return { ...item, durationQuarters: Math.max(1, Math.min(2, item.durationQuarters + delta)) };
                  }
                  // 生效季在 2026Q4 ⇄ 2027Q1 间步进
                  const shift = item.startQuarter === '2026Q4' ? 0 : 1;
                  const nextShift = Math.max(0, Math.min(1, shift + delta));
                  return { ...item, startQuarter: nextShift === 0 ? '2026Q4' : '2027Q1' };
                }),
              }));
            }}
            onEventRemove={(id) => {
              setParams((prev) => ({ ...prev, marketEvents: prev.marketEvents.filter((item) => item.id !== id) }));
            }}
            onEventAdd={() => {
              const count = params.marketEvents.filter((item) => item.id.startsWith('ev-custom')).length;
              const label = ADD_EVENT_POOL[count % ADD_EVENT_POOL.length];
              setParams((prev) => ({
                ...prev,
                marketEvents: [...prev.marketEvents, { id: `ev-custom-${count + 1}`, label, magnitudePct: -6, startQuarter: '2026Q4', durationQuarters: 1 }],
              }));
            }}
            onRationaleChange={(text) => setParams((prev) => ({ ...prev, rationale: text }))}
          />

          {/* ③ 量价参考（可多个） */}
          <ReferencePanel fixture={fixture} result={result} />

          {/* ④ 成本销毛 */}
          <ForecastMarginCostCard fixture={fixture} result={result} />

          {/* ⑤ 库存验证（最后一步） */}
          <InventoryValidationCard
            fixture={fixture}
            params={params}
            result={result}
            onSiLive={(weekNumber, units) => setParams((prev) => ({ ...prev, siPlan: { ...prev.siPlan, [weekNumber]: units } }))}
            onSiCommit={() => {}}
          />
        </main>
      </div>

      {/* 单周微调弹窗：调整原因必填，不填禁用保存（原因标注在主图手调处） */}
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
    </div>
  );
}
