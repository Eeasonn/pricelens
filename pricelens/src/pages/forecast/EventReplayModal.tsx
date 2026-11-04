// ============================================================
// 推演工作台 v3 · 主图产品范围事件编辑器（forecast-global-ia-review 任务 7 /
// 附录 C「主图自由范围规则」）：
// 产品事件 = 任意起止周闭区间（单周为特例）——起周 / 止周选择（键盘可达、
// 等价于图上拖选的回填结果；反向选择自动排序，起 ≤ 止提交）、始终显示实际
// 起止日期 + 派生周数（durationOfWeekRange，跨年按日历绝对 index 不串值）；
// 范围可与任意月交叉，不按季度 / 档期截断；一个范围只生成一个事件不拆条。
// 幅度 = 起始峰值（magnitudePct）；形状 decreasing（默认，线性递减
// 1 + m×(1−offset/duration)/100，公式唯一来源 workbenchModel.rangeEventFactorAt）
// / flat（范围内恒定）可改；名称选填（空串合法）。
// 「预览事件 → 确认应用事件」两步：预览显示逐周影响（不写主链），确认才
// onSubmit（页面侧写入 params 并可撤销）。录入时弹参考品历史事实回放
// （四类解释场景），replayId 随提交携带。
// 窄屏安全：弹窗宽度受视口约束、回放区 auto-fit 可单列、图表 maxWidth 100%、
// footer 不横向出屏。
// ============================================================
import { useMemo, useRef, useState } from 'react';
import { Button, Input, InputNumber, Modal, Radio, Segmented, Select } from 'antd';
import { color, radius, space } from '../../theme/tokens';
import type { ProductEventSeed, WorkbenchFixture } from './workbenchFixture';
import type { CalendarWeek } from './workbenchCalendar';
import { buildForecastCalendar, durationOfWeekRange } from './workbenchCalendar';
import { fmtSignedPct } from './WorkbenchBits';

const REPLAY_W = 300;
const REPLAY_H = 120;

/** 三类主图小事件（色系与参考卡事实锚/主图锚点一致）。 */
const EVENT_TYPES: Array<{ key: ProductEventSeed['type']; label: string; tone: string; hint: string }> = [
  { key: 'competitor-launch', label: '竞品上市', tone: color.link, hint: '竞品新机 / 促销放量，分流本品同期销量' },
  { key: 'own-promo', label: '营销价促', tone: color.warning, hint: '自家官方价促或档期脉冲，抬升当期销量' },
  { key: 'cannibalization', label: '自家品挤兑', tone: color.ink, hint: '自家档位重叠品上市，挤兑本品销量' },
];

/** 回放迷你图：历史事实段 + 参照基线。 */
function ReplayChart({ points, baseline }: { points: number[]; baseline: number }) {
  const left = 30;
  const right = 8;
  const top = 10;
  const bottom = 20;
  const plotW = REPLAY_W - left - right;
  const plotH = REPLAY_H - top - bottom;
  const max = Math.max(...points, baseline) * 1.15;
  const x = (index: number): number => left + (index + 0.5) * (plotW / points.length);
  const y = (value: number): number => top + plotH * (1 - value / max);
  const path = points.map((value, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)} ${y(value).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${REPLAY_W} ${REPLAY_H}`} width="100%" role="img" aria-label="参考品当时事实回放段" style={{ display: 'block', height: 'auto', maxWidth: '100%' }}>
      <line x1={left} y1={y(baseline)} x2={REPLAY_W - right} y2={y(baseline)} stroke={color.hairlineStrong} strokeDasharray="3 4" opacity={0.8} />
      <text x={left} y={y(baseline) - 3} fontSize={9} fill={color.mute}>事件前水平</text>
      <path d={path} fill="none" stroke={color.link} strokeWidth={2} />
      <line x1={left} y1={top + plotH} x2={REPLAY_W - right} y2={top + plotH} stroke={color.hairline} />
      <text x={left} y={REPLAY_H - 6} fontSize={9} fill={color.mute}>事件首周</text>
      <text x={REPLAY_W - right} y={REPLAY_H - 6} fontSize={9} fill={color.mute} textAnchor="end">+8 周</text>
    </svg>
  );
}

/**
 * 周选择器（起周 / 止周）：按钮 + 展开式单选列表（role=listbox / option）。
 * mouseDown 开合（与图上拖选回填等价的键盘 / 指针双路径），选项文本 = 周 ID
 * （YYYYWww），点击回填并收起；不支持周二以下的粒度（预测周 = 唯一时间键）。
 */
function WeekPicker({
  label,
  placeholder,
  value,
  options,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string | null;
  options: Array<{ id: string; label: string }>;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  return (
    <span
      ref={rootRef}
      style={{ position: 'relative', display: 'inline-flex' }}
      onBlur={(event) => {
        if (!rootRef.current?.contains(event.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onMouseDown={(event) => {
          event.preventDefault();
          setOpen((prev) => !prev);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setOpen((prev) => !prev);
          }
          if (event.key === 'Escape') setOpen(false);
        }}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, height: 26, padding: '0 8px',
          border: `1px solid ${color.hairlineStrong}`, borderRadius: radius.control, background: color.canvas,
          font: 'inherit', fontSize: 12, color: value ? color.ink : color.mute, cursor: 'pointer', minWidth: 92,
        }}
      >
        <span className="mono">{value ?? placeholder}</span>
        <span aria-hidden style={{ fontSize: 9, color: color.mute }}>▾</span>
      </button>
      {open && (
        <div
          role="listbox"
          aria-label={`${label}选项`}
          style={{
            position: 'absolute', top: 30, left: 0, zIndex: 20, maxHeight: 208, overflowY: 'auto',
            background: color.canvas, border: `1px solid ${color.hairline}`, borderRadius: radius.card,
            boxShadow: '0 4px 12px rgba(0,0,0,.08)', padding: 4, display: 'grid', gap: 1, minWidth: 96,
          }}
        >
          {options.map((option) => (
            <div
              key={option.id}
              role="option"
              aria-selected={value === option.id}
              tabIndex={0}
              onClick={() => { onChange(option.id); setOpen(false); }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onChange(option.id);
                  setOpen(false);
                }
              }}
              style={{
                padding: '3px 8px', borderRadius: radius.control, fontSize: 12, cursor: 'pointer',
                background: value === option.id ? color.canvasSoft2 : 'transparent',
                color: value === option.id ? color.ink : color.body, fontWeight: value === option.id ? 600 : 400,
              }}
            >
              {option.label}
            </div>
          ))}
        </div>
      )}
    </span>
  );
}

export default function EventReplayModal({
  fixture,
  forecastWeeks,
  onSubmit,
  onCancel,
  initialRange,
}: {
  fixture: WorkbenchFixture;
  /** v3 预测周选项（id = 跨年周 ID YYYYWww，label = 同值；跨年标签用 weekId 本身）。 */
  forecastWeeks: Array<{ id: string; label: string }>;
  onSubmit: (event: Omit<ProductEventSeed, 'id'>) => void;
  onCancel: () => void;
  /** 图上拖选回填的初始范围（与下拉等价；起止可任意序，内部自动排序）。 */
  initialRange?: { startWeekId: string; endWeekId: string } | null;
}) {
  const [type, setType] = useState<ProductEventSeed['type']>('competitor-launch');
  const [scenarioId, setScenarioId] = useState<string | null>(null);
  const initialLo = initialRange
    ? (forecastWeeks.some((week) => week.id === initialRange.startWeekId) ? initialRange.startWeekId : null)
    : null;
  const initialHi = initialRange
    ? (forecastWeeks.some((week) => week.id === initialRange.endWeekId) ? initialRange.endWeekId : null)
    : null;
  // 起止周自由闭区间；null = 未选（预览按钮禁用，不阻塞名称）。反向选择在派生处自动排序。
  const [startWeekId, setStartWeekId] = useState<string | null>(initialLo);
  const [endWeekId, setEndWeekId] = useState<string | null>(initialHi);
  const [magnitude, setMagnitude] = useState<number | null>(null);
  const [decay, setDecay] = useState<ProductEventSeed['decay']>('decreasing');
  const [label, setLabel] = useState('');
  const [step, setStep] = useState<'edit' | 'preview'>('edit');

  // 该类型匹配的事实回放场景（四类解释场景按类型映射，可多条）。
  const scenarios = useMemo(
    () => fixture.replayScenarios.filter((scenario) => scenario.match === type),
    [fixture.replayScenarios, type],
  );
  // 同类型多场景可切换；切类型后回到该类型第一条场景。
  const scenario = scenarios.find((item) => item.id === scenarioId) ?? scenarios[0] ?? null;
  // 幅度为空 = 取当前场景预填值（切类型 / 切场景都会把 magnitude 置 null）。
  const effectiveMagnitude = magnitude ?? scenario?.impactPct ?? -5;

  const typeMeta = EVENT_TYPES.find((item) => item.key === type);
  const defaultLabel = type === 'competitor-launch'
    ? 'Galaxy S26 Ultra 上市'
    : type === 'own-promo'
      ? '官方电商节价促'
      : '自家新品档位重叠';

  // 统一日历：派生周数与实际起止日期（durationOfWeekRange 按绝对 index，跨年不串值）。
  const calendar = useMemo(() => buildForecastCalendar(fixture.calendar), [fixture.calendar]);
  const calendarWeekOf = (weekId: string | null): CalendarWeek | null => (weekId ? calendar.weekById.get(weekId) ?? null : null);
  const startWeek = calendarWeekOf(startWeekId);
  const endWeek = calendarWeekOf(endWeekId);
  // 反向自动排序：显示与提交恒为 起 ≤ 止（同一天文序）。
  const ordered = startWeek != null && endWeek != null
    ? (startWeek.index <= endWeek.index
      ? { start: startWeek, end: endWeek }
      : { start: endWeek, end: startWeek })
    : null;
  const rangeValid = ordered != null;
  const duration = rangeValid && startWeekId != null && endWeekId != null
    ? durationOfWeekRange(calendar, { startWeekId: ordered.start.id, endWeekId: ordered.end.id })
    : null;

  // 逐周影响预览（B.4.6 唯一公式口径；decreasing = 1 + m×(1−offset/duration)/100，flat = 恒定）。
  const previewRows = useMemo(() => {
    if (ordered == null || duration == null) return [];
    const rows: Array<{ weekId: string; dateLabel: string; pct: number }> = [];
    for (let index = ordered.start.index; index <= ordered.end.index; index += 1) {
      const week = calendar.weeks[index];
      if (!week) continue;
      const offset = index - ordered.start.index;
      const factor = decay === 'flat'
        ? 1 + effectiveMagnitude / 100
        : 1 + (effectiveMagnitude * (1 - offset / duration)) / 100;
      const pct = Math.round((factor - 1) * 1000) / 10;
      rows.push({ weekId: week.id, dateLabel: week.date, pct });
    }
    return rows;
  }, [ordered, duration, decay, effectiveMagnitude, calendar]);

  const submit = (): void => {
    if (ordered == null || duration == null || !scenario) return;
    onSubmit({
      type,
      // 名称选填：类型默认名可保留，允许选填覆盖（附录 C 字段映射）。
      label: label.trim() !== '' ? label.trim() : defaultLabel,
      startWeekId: ordered.start.id,
      endWeekId: ordered.end.id,
      magnitudePct: effectiveMagnitude,
      decay,
      replayId: scenario.id,
    });
  };

  // 教学说明收进 title（不占正文密度）。
  const guideTitle = `生效后主图该范围画锚点（A 编号 + 起止端点 + 范围线，不铺全高色带），按幅度局部修正预测；可在主图图下名录编辑或删除。幅度按回放段预填，可改；范围为任意起止周闭区间，可与任意月交叉，不按档期截断。`;

  return (
    <Modal
      title="新增产品事件 · 历史参照"
      open
      onCancel={onCancel}
      width={720}
      style={{ maxWidth: 'calc(100vw - 24px)' }}
      footer={
        <div style={{ display: 'flex', gap: space.sm, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <Button onClick={onCancel}>取消</Button>
          {step === 'edit' ? (
            <Button type="primary" disabled={!rangeValid} onClick={() => setStep('preview')}>
              预览事件
            </Button>
          ) : (
            <>
              <Button onClick={() => setStep('edit')}>重新编辑</Button>
              <Button type="primary" disabled={!rangeValid || !scenario} onClick={submit}>
                确认应用事件
              </Button>
            </>
          )}
        </div>
      }
    >
      <div style={{ display: 'grid', gap: space.md, paddingTop: space.sm, minWidth: 0 }}>
        <Segmented
          aria-label="选择事件类型"
          value={type}
          onChange={(value) => { setType(value as ProductEventSeed['type']); setScenarioId(null); setMagnitude(null); setStep('edit'); }}
          options={EVENT_TYPES.map((item) => ({ value: item.key, label: item.label }))}
        />
        <div style={{ fontSize: 11.5, color: color.mute, minWidth: 0 }}>
          {typeMeta?.hint} · 大盘行业级事件在大盘卡录入；此处只收产品级小事件。
        </div>

        {/* 事实回放（自然弹出）：四类解释场景按类型匹配，全部为历史事实段 */}
        {scenario && (
          <div style={{ border: `1px solid ${color.hairline}`, borderRadius: radius.card, padding: space.md, background: color.canvasSoft, display: 'grid', gap: space.sm, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: space.sm, flexWrap: 'wrap', minWidth: 0 }}>
              <b style={{ fontSize: 13, color: color.ink }}>{`事实回放 · ${scenario.title}`}</b>
              <span style={{ fontSize: 11, color: color.mute, minWidth: 0 }}>{scenario.refLabel}</span>
              {/* 同类型多场景：全部回放场景可达 */}
              {scenarios.length > 1 && (
                <Select
                  size="small"
                  aria-label="选择历史回放场景"
                  value={scenario.id}
                  onChange={(id: string) => { setScenarioId(id); setMagnitude(null); }}
                  options={scenarios.map((item) => ({ value: item.id, label: item.title }))}
                  style={{ minWidth: 180, marginLeft: 'auto' }}
                />
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: space.md, alignItems: 'start' }}>
              <ReplayChart points={scenario.points} baseline={scenario.points[0]} />
              <div style={{ fontSize: 12, lineHeight: 1.7, color: color.body, minWidth: 0 }}>
                {scenario.desc}
                <div style={{ marginTop: 6, padding: '5px 8px', borderRadius: 6, background: color.warningSoft, color: color.warningInk, fontSize: 11.5 }}>
                  {scenario.impactText}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 自由范围（B.4.2 WeekRange 口径）：起周 / 止周 + 反向排序 + 实际起止日期 + 派生周数 */}
        <div title={guideTitle} style={{ display: 'grid', gap: space.sm, minWidth: 0 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.md, alignItems: 'center', minWidth: 0 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: color.body }}>
              事件范围
              <WeekPicker
                label="事件起周"
                placeholder="选择起周"
                value={startWeekId}
                options={forecastWeeks}
                onChange={(id) => { setStartWeekId(id); setStep('edit'); }}
              />
              <span aria-hidden style={{ color: color.mute }}>–</span>
              <WeekPicker
                label="事件止周"
                placeholder="选择止周"
                value={endWeekId}
                options={forecastWeeks}
                onChange={(id) => { setEndWeekId(id); setStep('edit'); }}
              />
            </span>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: color.body }}>
              影响幅度（起始峰值）
              <InputNumber
                aria-label="事件影响幅度（%）"
                min={-30}
                max={60}
                step={1}
                precision={0}
                value={effectiveMagnitude}
                formatter={(value) => (value == null ? '' : `${value}%`)}
                parser={(text) => Number((text ?? '').replace('%', ''))}
                onChange={(value) => { setMagnitude(value == null ? null : Math.max(-30, Math.min(60, Number(value)))); setStep('edit'); }}
                style={{ width: 92 }}
              />
            </label>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', alignItems: 'center', fontSize: 12, color: color.body }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontWeight: 600 }}>
              形状
              <Radio.Group
                aria-label="事件形状"
                value={decay}
                onChange={(event) => { setDecay(event.target.value as ProductEventSeed['decay']); setStep('edit'); }}
                options={[
                  { value: 'decreasing', label: '递减（线性衰减到末周）' },
                  { value: 'flat', label: '恒定' },
                ]}
                optionType="default"
              />
            </span>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              事件名称（选填）
              <Input
                aria-label="事件名称（选填）"
                placeholder="选填：如 黑五竞品促销"
                value={label}
                onChange={(input) => setLabel(input.target.value)}
                style={{ width: 200 }}
              />
            </label>
          </div>
          {/* 实际起止日期 + 派生周数（跨年范围照常派生；倒置显示自动排序后的区间） */}
          <div className="tnum" role="status" style={{ fontSize: 11.5, color: rangeValid ? color.mute : color.warningInk }}>
            {rangeValid && ordered && startWeekId != null && endWeekId != null
              ? `实际起止 ${ordered.start.date}（周一）– ${ordered.end.endDate}（周日）· 派生 ${duration} 周${ordered.start.index > ordered.end.index ? ' · 已按起 ≤ 止自动排序' : ''}`
              : '请选择起周与止周（预测周闭区间）'}
          </div>
          {/* 预览（两步之二）：逐周影响，确认前不写主链 */}
          {step === 'preview' && rangeValid && duration != null && (
            <div
              role="group"
              aria-label="事件影响预览"
              style={{ border: `1px solid ${color.hairline}`, borderRadius: radius.card, padding: `${space.sm}px ${space.md}px`, background: color.canvasSoft, display: 'grid', gap: 4, minWidth: 0 }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: color.ink }}>
                {`逐周影响 · ${ordered!.start.id}–${ordered!.end.id} · ${duration} 周 · ${decay === 'flat' ? '恒定' : '递减'} · 幅度（起始峰值）${fmtSignedPct(effectiveMagnitude)}`}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 12px', fontSize: 11.5, color: color.body }}>
                {previewRows.map((row) => (
                  <span key={row.weekId} className="tnum" style={{ whiteSpace: 'nowrap' }}>
                    {`${row.weekId}（${row.dateLabel}）${fmtSignedPct(row.pct)}`}
                  </span>
                ))}
              </div>
              <div style={{ fontSize: 11, color: color.mute }}>
                一个范围只生成一个事件，不自动拆条；确认应用后可在主图图下名录编辑 / 删除。
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
