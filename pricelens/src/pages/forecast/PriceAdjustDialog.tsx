// ============================================================
// 量价预测 · 价格微调弹窗（任务 9 · IA 文档 4.3 步骤 2/3 · B.4.7 / B.5.8）：
// 从④成本参考「带到主图调价」打开。人工设参，系统不做成本→价格映射：
// - 目标周（默认成本版本首个未来生效周，可改）或整月（展开该月全部预测周，
//   共享同一 batchId）；确认前展示每个受影响周，不静默覆盖；
// - 调价方式两式：调整后价格（默认显示当前主图价，不自动加成本差额）
//   / 增减额·增减幅；无定价依据时不预填数值建议；
// - 参考说明选填：自动带入「参考④ N 月成本版本」可清空；
// - 已有价格手调冲突逐项「保留 / 覆盖」，默认保留；
// - 过渡态预览只重算单台销毛 / 周销毛 / 预测期销毛（只读临时计算），
//   固定提示「价格→销量关系未纳入 · 暂不联动销量」，不出现销量变化文案；
// - 「应用价格调整」→ onApply(priceOverrides, reviewMeta)，由调用方写入
//   MarginScenario 工作区（本组件不直接改状态）。
// ============================================================
import { useMemo, useState } from 'react';
import { Button, Input, InputNumber, Modal, Segmented, Select } from 'antd';
import { color, radius, space } from '../../theme/tokens';
import type { ForecastCalendar, MonthKey, WeekId } from './workbenchCalendar';
import type { WorkbenchFixture } from './workbenchFixture';
import type { WorkbenchResult } from './workbenchModel';
import { computeMarginView, forecastMarginRateOf, nextPriceBatchId } from './marginScenarioModel';
import type { MarginPriceOverride, MarginScenario } from './marginScenarioModel';
import { fmtMillionUsd } from './WorkbenchBits';

/** 应用回调元数据（回读/撤销/回跳用）。 */
export interface PriceAdjustReviewMeta {
  /** 来源成本月（④成本版本行；无来源 = null）。 */
  sourceCostMonth: MonthKey | null;
  /** 参考说明（选填，空串合法）。 */
  reason: string;
  /** 本批次 id（月展开共享）。 */
  batchId: string;
  scope: 'week' | 'month';
  /** 目标周清单（展开后的全部预测周）。 */
  targetWeekIds: WeekId[];
  /** 冲突中被用户保留的周（不写入新批次）。 */
  keptWeekIds: WeekId[];
}

const roundPrice = (value: number): number => Math.max(0, Math.round(value * 10) / 10);

const fmtUsd = (value: number): string => `$${Math.round(value * 10) / 10}`;

/** 预测期销毛率展示（销毛率 = 单台销毛额 ÷ 单台收入；无有效收入周 = — 不造数）。 */
const fmtRate = (view: ReturnType<typeof computeMarginView>): string => {
  const rate = forecastMarginRateOf(view);
  return rate != null ? `${(rate * 100).toFixed(1)}%` : '—';
};

/** 固定过渡提示（B.4.7）：价格→销量关系未拍板前恒显，不得出现销量变化文案。 */
function DemandLinkNotice() {
  return (
    <div
      data-demand-notice=""
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '5px 10px', borderRadius: radius.control,
        background: color.canvasSoft2, border: `1px solid ${color.hairline}`,
        fontSize: 11.5, color: color.body,
      }}
    >
      <span aria-hidden style={{ width: 6, height: 6, borderRadius: 6, background: color.warningInk }} />
      价格→销量关系未纳入 · 暂不联动销量
    </div>
  );
}

export default function PriceAdjustDialog({
  fixture,
  calendar,
  result,
  scenario,
  initialWeekId,
  sourceCostMonth,
  onCancel,
  onApply,
}: {
  fixture: WorkbenchFixture;
  /** 统一日历（目标周/月选项与月展开的唯一来源）。 */
  calendar: ForecastCalendar;
  result: WorkbenchResult;
  /** 当前情景（冲突检测与预览基线；应用由调用方合并）。 */
  scenario: MarginScenario;
  /** 默认目标周（成本版本首个未来生效周）。 */
  initialWeekId?: WeekId | null;
  /** 来源成本月（默认目标月与参考说明带入）。 */
  sourceCostMonth?: MonthKey | null;
  onCancel: () => void;
  onApply: (priceOverrides: Record<WeekId, MarginPriceOverride>, reviewMeta: PriceAdjustReviewMeta) => void;
}) {
  // 目标（周 / 月两式；月 = 该月全部预测周展开为共享 batchId 的周价格记录）。
  const defaultWeekId = initialWeekId != null && calendar.weekById.get(initialWeekId)?.status === 'forecast'
    ? initialWeekId
    : (calendar.forecastWeeks[0]?.id ?? '');
  const defaultMonthKey = sourceCostMonth != null && calendar.monthByKey.has(sourceCostMonth)
    ? sourceCostMonth
    : (calendar.weekById.get(defaultWeekId)?.monthKey ?? calendar.horizonStart);
  const [scope, setScope] = useState<'week' | 'month'>('week');
  const [weekId, setWeekId] = useState(defaultWeekId);
  const [monthKey, setMonthKey] = useState(defaultMonthKey);
  // 调价方式两式：调整后价格（默认当前主图价）/ 增减额·增减幅。
  const [mode, setMode] = useState<'price' | 'delta'>('price');
  const [priceValue, setPriceValue] = useState<number | null>(null);
  const [deltaAmount, setDeltaAmount] = useState<number | null>(null);
  const [deltaPct, setDeltaPct] = useState<number | null>(null);
  // 参考说明必填（Batch 2：价格手调须有原因并进审计轨迹）：自动带入来源成本月，可改不可清空。
  const [reason, setReason] = useState(sourceCostMonth ? `参考④ ${sourceCostMonth} 月成本版本` : '');
  const reasonOk = reason.trim() !== '';
  // 冲突逐项处理：默认保留既有手调（只有明确选择才覆盖）。
  const [conflictChoices, setConflictChoices] = useState<Record<WeekId, 'keep' | 'overwrite'>>({});
  const [previewed, setPreviewed] = useState(false);

  const weekById = useMemo(() => new Map(result.weeks.map((week) => [week.weekId, week])), [result.weeks]);
  const affectedWeekIds = useMemo(() => (
    scope === 'week'
      ? (weekId !== '' ? [weekId] : [])
      : (calendar.monthByKey.get(monthKey)?.forecastWeekIds ?? [])
  ), [scope, weekId, monthKey, calendar]);
  const anchorWeekId = affectedWeekIds[0] ?? '';

  const currentPriceOf = (id: WeekId): number => weekById.get(id)?.price ?? 0;
  const anchorPrice = anchorWeekId !== '' ? currentPriceOf(anchorWeekId) : 0;

  const resetDraft = () => {
    setPriceValue(null);
    setDeltaAmount(null);
    setDeltaPct(null);
    setPreviewed(false);
  };

  const batchId = useMemo(() => nextPriceBatchId(scenario), [scenario]);
  const conflictWeekIds = useMemo(
    () => affectedWeekIds.filter((id) => scenario.priceOverrides[id] != null),
    [affectedWeekIds, scenario],
  );

  /** 新价（两式）：价格式 = 输入值（缺省当前价）；增减式 = 当前价 ± 额/幅。 */
  const effectivePriceOf = (id: WeekId): number => {
    const current = currentPriceOf(id);
    if (mode === 'price') return roundPrice(priceValue ?? current);
    if (deltaAmount != null && deltaAmount !== 0) return roundPrice(current + deltaAmount);
    if (deltaPct != null && deltaPct !== 0) return roundPrice(current * (1 + deltaPct / 100));
    return roundPrice(current);
  };

  const draftEntries = useMemo(() => {
    const entries: Record<WeekId, MarginPriceOverride> = {};
    for (const id of affectedWeekIds) {
      const existing = scenario.priceOverrides[id];
      if (existing != null && (conflictChoices[id] ?? 'keep') === 'keep') continue;
      entries[id] = { price: effectivePriceOf(id), reason: reason.trim(), batchId };
    }
    return entries;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [affectedWeekIds, scenario, conflictChoices, mode, priceValue, deltaAmount, deltaPct, reason, batchId]);

  // 预览 = 只读临时计算（构造临时情景调 computeMarginView，不改任何状态）。
  const preview = useMemo(() => {
    if (!previewed) return null;
    const beforeView = computeMarginView(fixture, result, scenario);
    const afterView = computeMarginView(fixture, result, {
      ...scenario,
      priceOverrides: { ...scenario.priceOverrides, ...draftEntries },
    });
    return { beforeView, afterView };
  }, [previewed, fixture, result, scenario, draftEntries]);

  const handleApply = (): void => {
    onApply(draftEntries, {
      sourceCostMonth: sourceCostMonth ?? null,
      reason: reason.trim(),
      batchId,
      scope,
      targetWeekIds: affectedWeekIds,
      keptWeekIds: conflictWeekIds.filter((id) => (conflictChoices[id] ?? 'keep') === 'keep'),
    });
  };

  return (
    <Modal
      title="价格微调 · 来自④成本参考"
      open
      onCancel={onCancel}
      width={640}
      style={{ maxWidth: 'calc(100vw - 24px)' }}
      footer={
        <div style={{ display: 'flex', gap: space.sm, justifyContent: 'flex-end', flexWrap: 'wrap', alignItems: 'center' }}>
          {!reasonOk && <span style={{ fontSize: 11, color: color.warningInk, marginRight: 'auto' }}>请填写参考说明（必填）后应用</span>}
          <Button onClick={onCancel}>取消</Button>
          <Button onClick={() => setPreviewed(true)}>预览销毛变化</Button>
          <Button type="primary" disabled={!reasonOk} title={reasonOk ? undefined : '价格手调必须填写参考说明（原因）'} onClick={handleApply}>应用价格调整</Button>
        </div>
      }
    >
      <div style={{ display: 'grid', gap: space.md, paddingTop: space.sm, minWidth: 0 }}>
        <DemandLinkNotice />

        {/* 目标周 / 月（默认成本版本首个未来生效周；不批量静默覆盖全预测期） */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.md, alignItems: 'center', minWidth: 0 }}>
          <Segmented
            aria-label="目标范围"
            value={scope}
            onChange={(value) => { setScope(value as 'week' | 'month'); resetDraft(); }}
            options={[
              { value: 'week', label: '按周' },
              { value: 'month', label: '按月' },
            ]}
          />
          {scope === 'week' ? (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: color.body }}>
              目标周
              <Select
                aria-label="目标周（预测周）"
                size="small"
                value={weekId || calendar.forecastWeeks[0]?.id}
                onChange={(value: string) => { setWeekId(value); resetDraft(); }}
                options={calendar.forecastWeeks.map((week) => ({ value: week.id, label: week.id }))}
                style={{ width: 120 }}
              />
            </label>
          ) : (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: color.body }}>
              目标月（展开该月全部预测周）
              <Select
                aria-label="目标月（预测月）"
                size="small"
                value={monthKey}
                onChange={(value: string) => { setMonthKey(value); resetDraft(); }}
                options={calendar.forecastMonths.map((month) => ({ value: month.key, label: `${month.key} 月` }))}
                style={{ width: 140 }}
              />
            </label>
          )}
        </div>

        {/* 调价方式两式：默认显示当前主图价，不自动加成本差额 */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.md, alignItems: 'center', minWidth: 0 }}>
          <Segmented
            aria-label="调价方式"
            value={mode}
            onChange={(value) => { setMode(value as 'price' | 'delta'); resetDraft(); }}
            options={[
              { value: 'price', label: '调整后价格' },
              { value: 'delta', label: '增减额/增减幅' },
            ]}
          />
          {mode === 'price' ? (
            <InputNumber
              aria-label="调整后价格（USD/台）"
              min={0}
              step={10}
              value={priceValue ?? anchorPrice}
              onChange={(value) => setPriceValue(value == null ? null : Math.max(0, Number(value)))}
              style={{ width: 120 }}
            />
          ) : (
            <>
              <InputNumber
                aria-label="增减额（USD/台）"
                step={10}
                value={deltaAmount}
                placeholder="±USD"
                onChange={(value) => { setDeltaAmount(value == null ? null : Number(value)); setDeltaPct(null); }}
                style={{ width: 110 }}
              />
              <InputNumber
                aria-label="增减幅（%）"
                step={1}
                value={deltaPct}
                placeholder="±%"
                formatter={(value) => (value == null ? '' : `${value}%`)}
                parser={(text) => Number((text ?? '').replace('%', ''))}
                onChange={(value) => { setDeltaPct(value == null || Number.isNaN(Number(value)) ? null : Number(value)); setDeltaAmount(null); }}
                style={{ width: 100 }}
              />
              <span style={{ fontSize: 11, color: color.mute }}>按各周当前主图价计算</span>
            </>
          )}
        </div>

        {/* 参考说明（必填 · Batch 2：价格手调须有原因并进审计轨迹；自动带入可改不可清空） */}
        <Input
          aria-label="参考说明（必填）"
          value={reason}
          placeholder="必填：为什么调价（如参考④成本版本上升）"
          onChange={(event) => setReason(event.target.value)}
          status={reasonOk ? undefined : 'error'}
        />

        {/* 受影响周清单：确认前展示每个受影响周（月展开 = 全部预测周） */}
        <div style={{ border: `1px solid ${color.hairline}`, borderRadius: radius.control, padding: space.sm, background: color.canvasSoft, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: color.mute, marginBottom: 6 }}>
            受影响周清单（{affectedWeekIds.length} 周 · 新批次 {batchId}）
          </div>
          {affectedWeekIds.length === 0 && (
            <div style={{ fontSize: 11.5, color: color.mute }}>该范围无预测周</div>
          )}
          <div style={{ display: 'grid', gap: 4, fontSize: 12, color: color.body }}>
            {affectedWeekIds.map((id) => {
              const current = currentPriceOf(id);
              const next = draftEntries[id]?.price ?? scenario.priceOverrides[id]?.price ?? current;
              return (
                <div key={id} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
                  <span className="tnum" style={{ fontWeight: 600, color: color.ink }}>{id}</span>
                  <span className="tnum">{`${fmtUsd(current)} → ${fmtUsd(next)}`}</span>
                  {scenario.priceOverrides[id] != null && (
                    <span style={{ fontSize: 11, color: color.mute }}>已有手调</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 已有价格手调冲突：逐项「保留 / 覆盖」，默认保留 */}
        {conflictWeekIds.length > 0 && (
          <div style={{ border: `1px solid ${color.warning}`, borderRadius: radius.control, padding: space.sm, background: color.warningSoft, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: color.warningInk, marginBottom: 6 }}>
              与已有价格手调冲突（逐项确认 · 默认保留）
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              {conflictWeekIds.map((id) => {
                const existing = scenario.priceOverrides[id]!;
                return (
                  <div key={id} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', fontSize: 12, color: color.body }}>
                    <span className="tnum" style={{ fontWeight: 600, color: color.ink }}>{id}</span>
                    <span className="tnum">{`已有 ${fmtUsd(existing.price)}`}</span>
                    <span style={{ fontSize: 11, color: color.mute }}>{`${existing.reason || '（无说明）'} · ${existing.batchId}`}</span>
                    <Segmented
                      value={conflictChoices[id] ?? 'keep'}
                      onChange={(value) => setConflictChoices((prev) => ({ ...prev, [id]: value as 'keep' | 'overwrite' }))}
                      options={[
                        { value: 'keep', label: '保留' },
                        { value: 'overwrite', label: '覆盖' },
                      ]}
                      style={{ marginLeft: 'auto' }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 过渡态预览：只读临时计算；按钮在 footer（唯一「预览销毛变化」入口） */}
        {preview && (
          <div
            data-preview=""
            style={{ border: `1px solid ${color.hairline}`, borderRadius: radius.card, padding: space.md, background: color.canvas, boxShadow: 'none', display: 'grid', gap: 6, minWidth: 0 }}
          >
            <div style={{ fontSize: 11, fontWeight: 600, color: color.mute }}>
              预览销毛变化（只读临时计算 · 价格→销量关系未纳入）
            </div>
            <div style={{ display: 'grid', gap: 4, fontSize: 12, color: color.body }}>
              {affectedWeekIds.map((id) => {
                const before = preview.beforeView.weeks.find((week) => week.weekId === id);
                const after = preview.afterView.weeks.find((week) => week.weekId === id);
                if (before == null || after == null) return null;
                const marginText = (value: number | null): string => (value == null ? '—' : fmtUsd(value));
                return (
                  <div key={id} className="tnum" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, color: color.ink }}>{id}</span>
                    <span>{`价格 ${fmtUsd(before.effectivePrice)} → ${fmtUsd(after.effectivePrice)}`}</span>
                    <span>{`单台销毛 ${marginText(before.unitMargin)} → ${marginText(after.unitMargin)}`}</span>
                    <span>{`周销毛 ${before.weeklyMargin == null ? '—' : fmtMillionUsd(before.weeklyMargin)} → ${after.weeklyMargin == null ? '—' : fmtMillionUsd(after.weeklyMargin)}`}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline', borderTop: `1px solid ${color.hairline}`, paddingTop: 6 }}>
              <b style={{ fontSize: 12, color: color.ink }}>预测期销毛变化</b>
              <span className="tnum" style={{ fontSize: 12, color: color.body }}>
                {`${fmtMillionUsd(preview.beforeView.forecastMargin)} → ${fmtMillionUsd(preview.afterView.forecastMargin)}`}
              </span>
              <span className="tnum" style={{ fontSize: 12, color: color.mute }}>
                {`Δ ${(preview.afterView.forecastMargin - preview.beforeView.forecastMargin >= 0 ? '+' : '')}${fmtMillionUsd(preview.afterView.forecastMargin - preview.beforeView.forecastMargin)}`}
              </span>
            </div>
            <div className="tnum" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }} title="销毛率 = 单台销毛额 ÷ 单台收入（预测周有效口径；无有效收入周显示 —）">
              <b style={{ fontSize: 12, color: color.ink }}>预测期销毛率</b>
              <span style={{ fontSize: 12, color: color.body }}>
                {`${fmtRate(preview.beforeView)} → ${fmtRate(preview.afterView)}`}
              </span>
            </div>
          </div>
        )}
        <div style={{ fontSize: 11, lineHeight: 1.6, color: color.mute }}>
          应用后写入④销毛工作区（会话内可撤销 / 清除）；主图价格点以手调小标显示「价格手调 · 来自成本参考」。
          无定价依据时本弹窗只预填当前价，不自动给出涨价金额。
        </div>
      </div>
    </Modal>
  );
}
