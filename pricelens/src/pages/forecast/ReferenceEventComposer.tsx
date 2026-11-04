// ============================================================
// 量价参考卡 · 事件编辑器（新增 / 编辑共用，规格 §3.4）：
// ①类型行：类型下拉（类型库，色点辅助）+ 当前色块入口——色板 8 色
//   （referenceEventPalette）+ 原生取色器 + hex 输入 + 恢复默认；颜色按
//   类型生效（写 referenceEventTypeStore，不反写主图）；对比度提示非阻断。
// ②起止周：闭区间两下拉（起周变化后止周自动跟随；止周不得早于起周），
//   时长由区间派生（end − start + 1）；「图上拖选」与下拉等价。
// ③标题（必填 ≤40）+ 说明（必填 ≤200，记录发生了什么、为什么）。
// ④「参考读数（选填）」默认收起：幅度 % / 影响时长（周）/ 衰减——仅历史
//   参考标注，绝不进模型。
// ⑤状态行：本地草稿（已自动保存到本浏览器）/ 未持久化 + 重试；
//   主按钮「保存事件」；「收起」保留草稿，「丢弃草稿」由父层确认并撤销；
//   编辑预标时另提供「恢复预标」。
// 类型库经 useSyncExternalStore 自持（antd Popover portal 不随父 props 更新）。
// ============================================================
import { useState, type CSSProperties } from 'react';
import { Button, Select } from 'antd';
import { brandColorOf, color, font, radius, space, referenceEventPalette } from '../../theme/tokens';
import type { LifecycleProductSeed } from './workbenchFixture';
import {
  LABEL_MAX,
  NOTE_MAX,
  REFERENCE_DECAY_LABEL,
  contrastHintOf,
  validateReferenceDraftValue,
  type ReferenceDecay,
  type ReferenceEventDraftValue,
} from './referenceEventModel';
import {
  referenceEventDefaultColorOf,
  setReferenceEventTypeColor,
  resetReferenceEventType,
  resolveReferenceEventType,
  useReferenceEventTypes,
} from './referenceEventTypeStore';

const HEX_RE = /^#[0-9a-f]{6}$/i;

export default function ReferenceEventComposer(props: {
  /** 补录对象产品（周下拉取其全生命周期长度；色提示对比量价系列色）。 */
  product: LifecycleProductSeed;
  /** 新增 / 编辑事件（标题与恢复预标入口随模式变化）。 */
  mode: 'create' | 'edit';
  /** 受控草稿值（起止周可空；父层自动保存到工作区 editorDrafts）。 */
  value: ReferenceEventDraftValue;
  onChange: (patch: Partial<ReferenceEventDraftValue>) => void;
  /** 图上拖选：弹层收起、面板顶操作条「拖选事件时段 · Esc 取消」。 */
  onPickRange: () => void;
  /** 校验通过后提交（父层按 create/edit + 预标/补录分流落工作区）。 */
  onSubmit: () => void;
  /** 收起（保留未提交草稿，名录区出现「未完成」入口）。 */
  onCollapse: () => void;
  /** 丢弃草稿（父层二次确认 + 可撤销）。 */
  onDiscard: () => void;
  /** 仅编辑预标（有覆写）时提供。 */
  onRestorePreset?: () => void;
  /** 草稿持久化状态：'saved' 已自动保存到本浏览器；'unpersisted' 未持久化。 */
  saveState: 'saved' | 'unpersisted';
  onRetryPersist?: () => void;
}) {
  const { product, mode, value, onChange, onPickRange, onSubmit, onCollapse, onDiscard, onRestorePreset, saveState, onRetryPersist } = props;
  const lib = useReferenceEventTypes();
  const resolved = resolveReferenceEventType(lib, value.typeId);
  const typeUnavailable = resolved.unavailable;
  const seriesColor = brandColorOf(product.brand);
  const [attempted, setAttempted] = useState(false);
  const [showColor, setShowColor] = useState(false);
  const [showImpact, setShowImpact] = useState(value.impact != null);
  const [hexDraft, setHexDraft] = useState<string>(resolved.type.color);

  const validation = validateReferenceDraftValue(value);
  const show = (bad: boolean): boolean => attempted && bad;
  const duration = value.startWeek != null && value.endWeek != null ? value.endWeek - value.startWeek + 1 : null;
  const rangeText = value.startWeek != null && value.endWeek != null
    ? `已选 W${value.startWeek + 1}–W${value.endWeek + 1} · ${duration} 周`
    : value.startWeek != null
      ? `已选 W${value.startWeek + 1} · 请选择止周`
      : '尚未选择起止周';
  const contrastHint = contrastHintOf(resolved.type.color, seriesColor);

  const setStart = (week: number): void => {
    // 起周变化后若大于止周，止周自动跟到起周（闭区间，止周不得早于起周）
    const end = value.endWeek != null && value.endWeek < week ? week : value.endWeek;
    onChange({ startWeek: week, endWeek: end });
  };
  const setEnd = (week: number): void => {
    const start = value.startWeek ?? 0;
    onChange({ endWeek: Math.max(start, week), startWeek: start });
  };

  const toggleImpact = (next: boolean): void => {
    setShowImpact(next);
    if (next && value.impact == null) {
      onChange({ impact: { magnitudePct: null, durationWeeks: null, decay: 'unspecified' } });
    }
  };

  const patchImpact = (patch: Partial<NonNullable<ReferenceEventDraftValue['impact']>>): void => {
    const base = value.impact ?? { magnitudePct: null, durationWeeks: null, decay: 'unspecified' as ReferenceDecay };
    onChange({ impact: { ...base, ...patch } });
  };

  const submit = (): void => {
    if (!validation.ok) {
      setAttempted(true);
      return;
    }
    onSubmit();
  };

  const labelStyle = (bad: boolean): CSSProperties => ({
    fontSize: 11,
    color: bad ? color.error : color.mute,
    marginBottom: 4,
  });
  const inputStyle = (bad: boolean): CSSProperties => ({
    width: '100%',
    boxSizing: 'border-box',
    height: 28,
    padding: '0 8px',
    border: `1px solid ${bad ? color.error : color.hairlineStrong}`,
    borderRadius: radius.control,
    background: color.canvas,
    color: color.ink,
    font: 'inherit',
    fontSize: 12,
  });

  const weekOptions = product.points.map((_, week) => ({ value: week, label: `W${week + 1}` }));

  return (
    <div style={{ width: 296, padding: `${space.xs}px 2px 0`, maxWidth: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: space.sm, marginBottom: space.sm }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: color.ink }}>{mode === 'create' ? '新增事件' : '编辑事件'}</span>
        <span
          title="事件只存本浏览器工作区：刷新 / 重开页签后可恢复，未提交草稿也可恢复；不写入主链、不影响模型推演"
          style={smallChipStyle}
        >
          本地草稿
        </span>
      </div>

      {/* ① 类型 + 色块入口（颜色按类型生效；文字始终承载语义） */}
      <div style={{ marginBottom: space.sm }}>
        <div style={labelStyle(false)}>类型</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Select
            size="small"
            aria-label="事件类型"
            value={value.typeId}
            virtual={false}
            onChange={(typeId) => {
              onChange({ typeId });
              setHexDraft(referenceEventDefaultColorOf(typeId));
            }}
            options={lib.types.map((t) => ({
              value: t.id,
              label: (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span aria-hidden style={{ width: 8, height: 8, borderRadius: 2, background: t.color, flex: 'none' }} />
                  {t.label}
                </span>
              ),
            }))}
            style={{ flex: '1 1 auto', minWidth: 0 }}
          />
          <button
            type="button"
            aria-label={`编辑类型「${resolved.type.label}」颜色`}
            aria-expanded={showColor}
            title="编辑该类型的显示颜色：色板 / 原生取色器 / hex；颜色按类型生效，可恢复默认"
            onClick={() => setShowColor((prev) => !prev)}
            style={{
              flex: 'none',
              width: 26,
              height: 24,
              display: 'inline-grid',
              placeItems: 'center',
              padding: 0,
              border: `1px solid ${showColor ? color.ink : color.hairlineStrong}`,
              borderRadius: radius.control,
              background: color.canvas,
              cursor: 'pointer',
            }}
          >
            <span aria-hidden style={{ width: 12, height: 12, borderRadius: 3, background: resolved.type.color, boxShadow: `inset 0 0 0 1px ${color.hairlineStrong}` }} />
          </button>
        </div>
        {typeUnavailable && (
          <div style={{ marginTop: 4, fontSize: 11, color: color.warningInk }}>
            类型不可用 · 暂按「其他」显示，请另选类型（原类型 id 已保留）
          </div>
        )}
        {showColor && (
          <div style={{ marginTop: 6, padding: 8, border: `1px solid ${color.hairline}`, borderRadius: radius.control, background: color.canvasSoft }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
              {referenceEventPalette.map((paletteColor) => {
                const active = paletteColor.toLowerCase() === resolved.type.color.toLowerCase();
                return (
                  <button
                    key={paletteColor}
                    type="button"
                    aria-label={`色板 ${paletteColor}`}
                    aria-pressed={active}
                    title={paletteColor}
                    onClick={() => {
                      setReferenceEventTypeColor(value.typeId, paletteColor);
                      setHexDraft(paletteColor);
                    }}
                    style={{
                      width: 20,
                      height: 20,
                      padding: 0,
                      borderRadius: radius.control,
                      border: `1px solid ${active ? color.ink : color.hairlineStrong}`,
                      background: paletteColor,
                      cursor: 'pointer',
                      boxShadow: active ? `0 0 0 2px ${color.canvas}, 0 0 0 3px ${color.ink}` : 'none',
                    }}
                  />
                );
              })}
              <label
                title="打开浏览器原生取色器"
                aria-label="原生取色器选色"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: color.body, cursor: 'pointer' }}
              >
                取色器
                <input
                  type="color"
                  value={resolved.type.color}
                  onChange={(event) => {
                    setReferenceEventTypeColor(value.typeId, event.target.value);
                    setHexDraft(event.target.value);
                  }}
                  style={{ width: 26, height: 22, padding: 0, border: `1px solid ${color.hairlineStrong}`, borderRadius: radius.control, background: color.canvas, cursor: 'pointer' }}
                />
              </label>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                aria-label="hex 颜色值"
                value={hexDraft}
                onChange={(event) => setHexDraft(event.target.value)}
                onBlur={() => {
                  const v = hexDraft.trim();
                  if (HEX_RE.test(v)) {
                    setReferenceEventTypeColor(value.typeId, v);
                  } else {
                    setHexDraft(resolved.type.color);
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return;
                  event.preventDefault();
                  const v = hexDraft.trim();
                  if (HEX_RE.test(v)) setReferenceEventTypeColor(value.typeId, v);
                  else setHexDraft(resolved.type.color);
                }}
                placeholder="#F5A623"
                style={{ width: 86, height: 22, boxSizing: 'border-box', padding: '0 6px', border: `1px solid ${HEX_RE.test(hexDraft.trim()) || hexDraft.trim() === '' ? color.hairlineStrong : color.error}`, borderRadius: radius.control, font: 'inherit', fontFamily: font.mono, fontSize: 11, background: color.canvas, color: color.ink }}
              />
              <button
                type="button"
                onClick={() => {
                  resetReferenceEventType(value.typeId);
                  setHexDraft(referenceEventDefaultColorOf(value.typeId));
                }}
                title="恢复该类型默认色与默认名（其他类型不受影响）"
                style={{ height: 22, padding: '0 8px', border: `1px solid ${color.hairlineStrong}`, borderRadius: radius.control, background: color.canvas, color: color.body, font: 'inherit', fontSize: 11, cursor: 'pointer' }}
              >
                恢复默认
              </button>
            </div>
            {contrastHint && (
              <div style={{ marginTop: 5, fontSize: 10.5, color: color.warningInk }}>{contrastHint}（非阻断提醒；类型文字始终显示）</div>
            )}
          </div>
        )}
      </div>

      {/* ② 起止周（闭区间；时长派生）+ 图上拖选入口 */}
      <div style={{ marginBottom: space.sm }}>
        <div style={labelStyle(show(validation.weekMissing))}>
          {show(validation.weekMissing) ? '请选择起止周' : '起周 / 止周'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Select
            size="small"
            aria-label="事件起周"
            aria-invalid={show(validation.weekMissing)}
            value={value.startWeek ?? undefined}
            placeholder="起周"
            virtual={false}
            onChange={setStart}
            options={weekOptions}
            style={{ flex: '1 1 auto', minWidth: 0 }}
          />
          <Select
            size="small"
            aria-label="事件止周"
            aria-invalid={show(validation.weekMissing)}
            value={value.endWeek ?? undefined}
            placeholder="止周"
            virtual={false}
            onChange={setEnd}
            options={weekOptions.filter((option) => value.startWeek == null || option.value >= value.startWeek)}
            style={{ flex: '1 1 auto', minWidth: 0 }}
          />
          <span className="tnum" style={{ flex: 'none', fontSize: 11, color: color.mute, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
            {duration != null ? `${duration} 周` : '—'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
          <Button size="small" type="default" onClick={onPickRange} title="收起本弹层，在面板图上按下—拖动—松手选择事件时段（Esc 取消）">
            图上拖选
          </Button>
          <span className="tnum" style={{ fontSize: 11, color: color.mute, fontVariantNumeric: 'tabular-nums' }}>{rangeText}</span>
        </div>
      </div>

      {/* ③ 标题（必填 ≤40） */}
      <div style={{ marginBottom: space.sm }}>
        <div style={labelStyle(show(validation.labelMissing) || show(validation.labelTooLong))}>标题 *</div>
        <input
          aria-label="事件标题（必填）"
          aria-invalid={show(validation.labelMissing) || show(validation.labelTooLong)}
          value={value.label}
          maxLength={LABEL_MAX + 20}
          onChange={(event) => onChange({ label: event.target.value })}
          placeholder="如：618 档期脉冲"
          style={inputStyle(show(validation.labelMissing) || show(validation.labelTooLong))}
        />
        {(show(validation.labelMissing) || show(validation.labelTooLong)) && (
          <div style={{ marginTop: 3, fontSize: 11, color: color.error }}>
            {validation.labelMissing ? '请填写标题' : `标题不超过 ${LABEL_MAX} 字`}
          </div>
        )}
      </div>

      {/* ④ 说明（必填 ≤200；记录发生了什么、为什么） */}
      <div style={{ marginBottom: space.sm }}>
        <div style={labelStyle(show(validation.noteMissing) || show(validation.noteTooLong))}>说明 *</div>
        <input
          aria-label="事件说明（必填）"
          aria-invalid={show(validation.noteMissing) || show(validation.noteTooLong)}
          value={value.note}
          maxLength={NOTE_MAX + 40}
          onChange={(event) => onChange({ note: event.target.value })}
          placeholder="如：对手首销促销压价"
          style={inputStyle(show(validation.noteMissing) || show(validation.noteTooLong))}
        />
        {(show(validation.noteMissing) || show(validation.noteTooLong)) && (
          <div style={{ marginTop: 3, fontSize: 11, color: color.error }}>
            {validation.noteMissing ? '请填写说明' : `说明不超过 ${NOTE_MAX} 字`}
          </div>
        )}
      </div>

      {/* ⑤ 参考读数（选填，默认收起）：仅历史标注，不进模型 */}
      <div style={{ marginBottom: space.sm }}>
        <button
          type="button"
          aria-expanded={showImpact}
          onClick={() => toggleImpact(!showImpact)}
          style={{ border: 'none', background: 'transparent', padding: 0, font: 'inherit', fontSize: 11, color: color.mute, cursor: 'pointer' }}
        >
          参考读数（选填）{showImpact ? '▾' : '▸'}
        </button>
        {showImpact && (
          <div style={{ marginTop: 6, padding: 8, border: `1px solid ${color.hairline}`, borderRadius: radius.control, background: color.canvasSoft, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: color.body }}>
              幅度
              <input
                aria-label="参考幅度（%）"
                type="number"
                step="1"
                value={value.impact?.magnitudePct ?? ''}
                onChange={(event) => patchImpact({ magnitudePct: event.target.value === '' ? null : Number(event.target.value) })}
                style={{ width: 64, height: 22, boxSizing: 'border-box', padding: '0 6px', border: `1px solid ${color.hairlineStrong}`, borderRadius: radius.control, font: 'inherit', fontSize: 11, background: color.canvas, color: color.ink }}
              />
              %
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: color.body }}>
              影响时长
              <input
                aria-label="参考影响时长（周）"
                type="number"
                min={1}
                step="1"
                value={value.impact?.durationWeeks ?? ''}
                onChange={(event) => patchImpact({ durationWeeks: event.target.value === '' ? null : Math.max(1, Math.round(Number(event.target.value))) })}
                style={{ width: 52, height: 22, boxSizing: 'border-box', padding: '0 6px', border: `1px solid ${color.hairlineStrong}`, borderRadius: radius.control, font: 'inherit', fontSize: 11, background: color.canvas, color: color.ink }}
              />
              周
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: color.body }}>
              衰减
              <Select
                size="small"
                aria-label="参考衰减"
                value={value.impact?.decay ?? 'unspecified'}
                onChange={(decay) => patchImpact({ decay })}
                options={(['decreasing', 'flat', 'unspecified'] as const).map((decay) => ({ value: decay, label: REFERENCE_DECAY_LABEL[decay] }))}
                style={{ width: 78 }}
              />
            </label>
            <div style={{ flexBasis: '100%', fontSize: 10.5, color: color.mute }}>仅历史参考标注，不参与任何模型计算</div>
          </div>
        )}
      </div>

      {/* ⑥ 状态行：本地草稿 / 未持久化 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: space.sm, minHeight: 16 }}>
        {saveState === 'unpersisted' ? (
          <>
            <span style={{ fontSize: 11, fontWeight: 600, color: color.warningInk }}>未持久化</span>
            <span style={{ fontSize: 10.5, color: color.mute }}>未能保存到浏览器，仅当前页面有效</span>
            {onRetryPersist && (
              <button
                type="button"
                onClick={onRetryPersist}
                style={{ border: `1px solid ${color.hairlineStrong}`, borderRadius: radius.control, background: color.canvas, color: color.body, font: 'inherit', fontSize: 10.5, padding: '1px 8px', cursor: 'pointer' }}
              >
                重试
              </button>
            )}
          </>
        ) : (
          <span style={{ fontSize: 11, color: color.mute }}>已自动保存到本浏览器</span>
        )}
      </div>

      {/* ⑦ 动作行 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: space.sm }}>
        <button
          type="button"
          onClick={submit}
          style={{
            padding: '4px 12px',
            borderRadius: radius.control,
            border: 'none',
            background: color.ink,
            color: color.onPrimary,
            font: 'inherit',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          保存事件
        </button>
        <button
          type="button"
          onClick={onCollapse}
          title="收起编辑器，保留未提交草稿；名录区出现「未完成」入口可恢复"
          style={{
            padding: '4px 10px',
            borderRadius: radius.control,
            border: `1px solid ${color.hairline}`,
            background: color.canvas,
            color: color.body,
            font: 'inherit',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          收起
        </button>
        <button
          type="button"
          onClick={onDiscard}
          style={{
            padding: '4px 10px',
            borderRadius: radius.control,
            border: `1px solid ${color.hairline}`,
            background: color.canvas,
            color: color.error,
            font: 'inherit',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          丢弃草稿
        </button>
        {mode === 'edit' && onRestorePreset && (
          <button
            type="button"
            onClick={onRestorePreset}
            title="删除本地覆写，回到当前 fixture 预标原值（可撤销）"
            style={{ marginLeft: 'auto', padding: '4px 10px', borderRadius: radius.control, border: `1px solid ${color.hairline}`, background: color.canvas, color: color.body, font: 'inherit', fontSize: 12, cursor: 'pointer' }}
          >
            恢复预标
          </button>
        )}
      </div>
    </div>
  );
}

const smallChipStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  height: 18,
  padding: '0 8px',
  borderRadius: radius.pill,
  fontSize: 10.5,
  fontWeight: 600,
  whiteSpace: 'nowrap',
  background: color.canvasSoft2,
  color: color.body,
  border: `1px solid ${color.hairline}`,
};
