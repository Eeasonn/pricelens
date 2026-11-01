// ============================================================
// 量价预测页（Lifecycle OS 简单版，forecast-simple-v1）
// 交接：docs/lifecycle-os-mvp/03-量价预测界面替换交接文档.md
// 页面自挂一套 PageHeader + data-lpl-scroll 滚动容器（不进 AnalysisShell）；
// 四个需求因子（基线 / 感知价格 / 促销 / 竞品压力），供给为 SO 上限，
// 成本只进销毛链；数据为 24 周模拟（W1–W10 实际 + W11–W24 预测）。
// What-if 只作本地草稿；保留 useFilters 范围显示与 useAgent 解释入口。
// 局部决策见 pricelens/.impeccable/surfaces/forecast-simple-v1.md。
// ============================================================
import { useMemo, useState, type ReactNode } from 'react';
import { RobotOutlined } from '@ant-design/icons';
import { Button, Drawer } from 'antd';
import PageHeader from '../components/PageHeader';
import ChartContentBar from '../components/ChartContentBar';
import { useAgent } from '../state/AgentContext';
import { useFilters } from '../state/FiltersContext';
import { scopeLabels } from '../dataModel/scope';
import { color, fontSize, radius, space } from '../theme/tokens';
import {
  BASELINE_DRAFT,
  computeForecast,
  type ScenarioDraft,
} from './forecast/forecastModel';
import { forecastFixture } from './forecast/forecastFixture';
import { DataStatusBadge, forecastCardStyle } from './forecast/ForecastBits';
import ForecastKpiStrip from './forecast/ForecastKpiStrip';
import ForecastChart from './forecast/ForecastChart';
import EventTimeline from './forecast/EventTimeline';
import DriverWaterfall from './forecast/DriverWaterfall';
import WeeklyLedger from './forecast/WeeklyLedger';
import WhatIfDraft from './forecast/WhatIfDraft';
import FactorEvidence from './forecast/FactorEvidence';
import CalculationPath from './forecast/CalculationPath';

/** 卡片头：标题 + 说明 + 右侧插槽（与正式页卡语言一致）。 */
function SectionHead({ title, hint, extra }: { title: string; hint?: string; extra?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: space.md, marginBottom: space.md, flexWrap: 'wrap' }}>
      <div style={{ minWidth: 0 }}>
        <h2 style={{ margin: 0, fontSize: fontSize.bodyMd, color: color.ink }}>{title}</h2>
        {hint && <div style={{ marginTop: 4, fontSize: 12, lineHeight: 1.5, color: color.mute }}>{hint}</div>}
      </div>
      {extra && <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: space.sm }}>{extra}</div>}
    </div>
  );
}

export default function ForecastPage() {
  const { state } = useFilters();
  const { openAgent } = useAgent();
  const labels = scopeLabels(state);
  const [draft, setDraft] = useState<ScenarioDraft>(BASELINE_DRAFT);
  const [pathOpen, setPathOpen] = useState(false);

  const computation = useMemo(() => computeForecast(forecastFixture, draft), [draft]);
  const { context, meta } = forecastFixture;
  const firstForecastWeek = computation.weeks[forecastFixture.params.currentWeekIndex + 1];
  const lastWeek = computation.weeks[computation.weeks.length - 1];
  const forecastRangeLabel = `${firstForecastWeek.week}–${lastWeek.week}`;

  return (
    <div style={{ height: '100%', overflowX: 'auto', overflowY: 'auto', background: color.canvasSoft }} data-lpl-scroll>
      <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
        <PageHeader />
        {/* 图表三页签（与价格走势/量价走势同款）：预测页也能一键切回另两个图表页。
            币种不跟全局筛选：本页数据固定 USD（下方范围行显式标注），全局币种不再展示。 */}
        <div style={{ background: color.canvas, flexShrink: 0 }}>
          <ChartContentBar />
        </div>
        <main style={{ flex: 1, padding: `${space.lg}px`, maxWidth: 1280, width: '100%', margin: '0 auto', boxSizing: 'border-box', display: 'grid', gap: space.md }}>
          {/* ① 范围与状态 */}
          <section style={forecastCardStyle}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: space.md, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0 }}>
                <h1 style={{ margin: 0, fontSize: fontSize.displaySm, color: color.ink }}>量价预测</h1>
                <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.6, color: color.body }}>
                  生命周期量价经营 · 简单版：需求 = 基线 × 感知价格 × 促销 × 竞品压力；供给为成交上限，成本只进销毛链。
                </div>
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
                <DataStatusBadge status={meta.status} />
                <span className="mono" style={{ fontSize: 11, color: color.body, padding: '2px 8px', border: `1px solid ${color.hairline}`, borderRadius: radius.control }}>{meta.modelVersion}</span>
                <Button icon={<RobotOutlined />} onClick={() => openAgent('full', '解释当前简单版预测的关键假设、证据和风险')}>让 Agent 解释</Button>
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', marginTop: space.md, padding: `${space.md - 2}px ${space.md}px`, border: `1px solid ${color.hairline}`, borderRadius: radius.control, background: color.canvasSoft, fontSize: 12, color: color.body }}>
              {[
                ['全局筛选范围', `${labels.country} · ${labels.industry}`],
                ['演示口径', `${context.country} · ${context.channel} · ${context.product}`],
                ['币种', `${meta.currency}（固定）`],
                ['价格档', context.priceBand],
                ['当前周', `${context.currentWeek}（实际）· 预测 ${forecastRangeLabel}`],
                ['对照竞品', context.competitors.join(' / ')],
              ].map(([label, value]) => (
                // 第一百九十轮窄屏审计 P1-1：去掉 nowrap，长值（演示口径 / 对照竞品）在窄容器换行，不推宽整页。
                <span key={label} style={{ display: 'inline-flex', gap: 6, maxWidth: '100%' }}>
                  <span style={{ color: color.mute, whiteSpace: 'nowrap' }}>{label}</span>
                  <strong style={{ fontWeight: 600, color: color.ink }}>{value}</strong>
                </span>
              ))}
            </div>
            <div style={{ marginTop: space.sm, fontSize: 11, lineHeight: 1.6, color: color.mute }}>
              本页为模拟演示（来源 {meta.source}，生成 {meta.generatedAt}）：范围固定为演示口径，不随全局国家 / 币种筛选变化；真实价格事实截止 2026-W42，预测窗口以模拟状态呈现。缺数周不插值。
            </div>
          </section>

          {/* ② 经营摘要 */}
          <ForecastKpiStrip computation={computation} />

          {/* ③④ 逐周需求与成交图 + 事件时间轴 */}
          <section style={forecastCardStyle}>
            <SectionHead
              title="逐周需求与成交"
              hint="实际周实线、预测周虚线；无约束需求 / SO / 可供量三条主线，缺货只表现为 SO 被可供量截断。"
              extra={<Button onClick={() => setPathOpen(true)}>查看计算路径</Button>}
            />
            <ForecastChart weeks={computation.weeks} currentWeekIndex={forecastFixture.params.currentWeekIndex} />
            <div style={{ marginTop: space.md }}>
              <EventTimeline events={forecastFixture.events} />
            </div>
          </section>

          {/* ⑤⑥ 本周预测变化 + 周度经营主账 */}
          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: space.md, alignItems: 'start' }}>
            <div style={{ ...forecastCardStyle }}>
              <SectionHead title={`本周预测变化（${context.currentWeek}）`} hint="相对需求基线的贡献拆解，供业务核对；方向性条目不代表因果证明。" />
              <DriverWaterfall computation={computation} />
            </div>
            <div style={{ ...forecastCardStyle }}>
              <SectionHead title="周度经营主账" hint="输入事实 → 简单版确定性计算 → 结果与证据状态。" extra={<DataStatusBadge status={meta.status} />} />
              <WeeklyLedger weeks={computation.weeks} currentWeekIndex={forecastFixture.params.currentWeekIndex} />
            </div>
          </section>

          {/* ⑦⑧ What-if 草稿 + 因子与证据 */}
          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: space.md, alignItems: 'start' }}>
            <div style={forecastCardStyle}>
              <SectionHead title="What-if 草稿" hint="价格 / 促销 / 供给三个独立变量，本地重算，不写入真实数据。" />
              <WhatIfDraft
                draft={draft}
                scenario={computation.scenario}
                forecastRangeLabel={forecastRangeLabel}
                onChange={(patch) => setDraft((prev) => ({ ...prev, ...patch }))}
                onReset={() => setDraft(BASELINE_DRAFT)}
              />
            </div>
            <div style={forecastCardStyle}>
              <SectionHead title="因子与证据" hint="模型学习、业务假设与确定性计算分开呈现；每个因子保留窗口、形状与来源。" extra={<span className="mono" style={{ fontSize: 11, color: color.mute }}>factor-set: simple-v1</span>} />
              <FactorEvidence factorProfiles={forecastFixture.factorProfiles} />
            </div>
          </section>
        </main>
      </div>

      {/* ⑨ 计算路径抽屉（窄屏宽度不超视口，避免打开时横向溢出） */}
      <Drawer
        title="计算路径"
        placement="right"
        width="min(440px, 100vw)"
        open={pathOpen}
        onClose={() => setPathOpen(false)}
        styles={{ body: { padding: space.lg } }}
      >
        <CalculationPath dataset={forecastFixture} computation={computation} />
      </Drawer>
    </div>
  );
}
