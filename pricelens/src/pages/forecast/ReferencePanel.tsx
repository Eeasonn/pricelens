// ============================================================
// 推演工作台 v2 · 层②量价参考（A5 参考卡二轮重构：多面板 + 历史事件补录）：
// 与量价走势页（&p=volume）面板体系完全同构——参考面板数动态（默认 2：
// 上一代 Mate 80 + 当前友商对照），「＋ 添加参考」下拉（池内未添加产品，
// 分组「上一代 · 进主链 / 友商 · 对照」）追加面板，面板头 × 删除（至少保留
// 1 个；删除上一代面板 = 主链参照回退默认 prevGenPool[0]，徽标随实际指向
// 切换）；≤2 面板均分一行，>2 不折行横向滚动（单一横滚容器，量价页同款
// 轨道宽度策略，minWidth 880 保可读下限）。
// 每面板 = 量柱（复用 volume/VolumeBars）+ 价格线（右轴 $）+ 大促档期琥珀带
// + 事件锚（预标 + 补录）+ PointerShield（悬停列 + 拖选区间读数；拖选各面板
// 独立，同量价页非同步语义）。Y 轴双轴刻度常显。
// 时间轴 = 面板区底部共享时间轨（对齐 volume/PanelTimeTrack 视觉：trackColors
// 轨道 + 选中窗 + 两端拖柄缩放 + 整段平移 + 键盘微调），控制全部面板窗口
// （52 周全池内滑动，最小 8 周）——替换 A1 的每图独立滑条；窗口联动天然成立。
// 唯一差异 = 历史事件补录（「作业草稿」语义）：面板头「＋ 补录事件」弹
// ReferenceEventComposer 弹层（类型 / 周两式选择含图上点选 / 说明必填 /
// 仅本次会话标识）；提交后锚点上图（与预标锚同语言）+ 图下名录（分组
// 「预标 / 补录」，补录可删）。补录存卡内会话 state（key 含面板产品 id），
// 刷新即清；不写主链、不参与模型推演。
// prevGenReferenceId 受控语义保留：上一代面板存在时主链指向它（添加上一代
// 产品面板即写主链；页面侧重置基准 → 首个链内面板跟随主链参照）。
// 智能弹框（A1 保留）：主图输入（手调应用 / 产品事件录入）时经 inputSignal
// 触发卡头顶部 transient 条（非 Modal，8 秒自动收起，可手动关），按面板列出
// 参照产品在类似时间的表现；点击条目定位到对应事件周（共享窗口平移 + 悬停）。
// ============================================================
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { Dropdown, Popover } from 'antd';
import { panWindow } from '../../chart/PriceTrend/helpers';
import { brandColorOf, color, font, radius, selectAccent, space, trackColors } from '../../theme/tokens';
import type { LifecycleProductSeed, WorkbenchFixture } from './workbenchFixture';
import type { WorkbenchResult } from './workbenchModel';
import { IoBar, SectionHead, SimChip, fmtSignedPct, workbenchCardStyle } from './WorkbenchBits';
import ReferenceVolumeChart from './ReferenceVolumeChart';
import ReferenceEventComposer, {
  REFERENCE_EVENT_TONES,
  type ReferenceComposedDraft,
  type ReferenceComposedEvent,
  type ReferenceComposerValue,
} from './ReferenceEventComposer';

/** 主图输入信号（页面接线）：手调 / 产品事件变化时 seq 递增，驱动智能弹框。 */
export interface ReferenceInputSignal {
  seq: number;
  kind: 'manual' | 'event';
  /** 变化涉及的周标签（如 W47），可缺省。 */
  weekLabel?: string;
}

/** 共享时间轨最小窗口（周），与量价页面板时间轴同钳法。 */
const TRACK_MIN_WINDOW = 8;
/** 聚焦定位窗口跨度（周），与 A1 口径一致。 */
const FOCUS_SPAN = 16;
/** 横滚轨道可读下限（量价页同款策略）。 */
const TRACK_MIN_WIDTH = 880;

const clampInt = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, Math.round(v)));

const shortLabelOf = (product: LifecycleProductSeed): string => product.label.replace(/（[^）]*）/g, '').trim();

interface HintEntry {
  panelId: string;
  productId: string;
  text: string;
  week: number;
}

interface HintState {
  kind: 'manual' | 'event';
  weekLabel?: string;
  entries: HintEntry[];
}

/** 智能弹框组稿：取参照产品带影响读数的事件（档期事件优先），每面板最多一条。 */
function hintEntriesOf(product: LifecycleProductSeed | null, panelId: string): HintEntry[] {
  if (!product) return [];
  const events = product.events.filter((ev) => ev.impactPct != null && ev.impactWeeks != null);
  const ranked = [...events].sort((a, b) => Number(b.type === 'promo') - Number(a.type === 'promo'));
  return ranked.slice(0, 1).map((ev) => ({
    panelId,
    productId: product.id,
    week: ev.week,
    text: `${shortLabelOf(product)} ${ev.label} ${fmtSignedPct(ev.impactPct as number)}×${ev.impactWeeks} 周`,
  }));
}

const smallChipStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  height: 20,
  padding: '0 8px',
  borderRadius: radius.pill,
  fontSize: 11,
  fontWeight: 600,
  whiteSpace: 'nowrap' as const,
};

/** 面板头小按钮（＋ 补录事件 / × 删除共用语言）。 */
function headButtonStyle(danger: boolean): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 3,
    height: 24,
    padding: '0 8px',
    borderRadius: radius.control,
    border: `1px solid ${danger ? color.hairlineStrong : color.hairline}`,
    background: color.canvas,
    color: danger ? color.error : color.body,
    font: 'inherit',
    fontSize: 11.5,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  };
}

// ------------------------------------------------------------
// 共享时间轨（对齐 volume/PanelTimeTrack 视觉）：轨道 + 选中窗 + 两端拖柄
// （拖柄缩放 / 键盘微调）+ 整段平移；一个轨道控制全部参考面板窗口。
// 生命周期周为相对周龄刻度（W1 = 上市首周），不走日历 axisTickPlan。
// ------------------------------------------------------------
function SharedTimeTrack(props: {
  total: number;
  win: [number, number];
  onChange: (s: number, e: number) => void;
}) {
  const { total, win, onChange } = props;
  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ kind: 'start' | 'end' | 'pan'; startX: number; startS: number; startE: number } | null>(null);
  const [panning, setPanning] = useState(false);
  const [activeDrag, setActiveDrag] = useState<'start' | 'end' | 'pan' | null>(null);
  const n = total;
  if (n <= 0) return null;

  const pct = (i: number): number => (i / Math.max(1, n)) * 100;
  const s = clampInt(win[0], 0, n - 1);
  const e = clampInt(win[1], s, n - 1);

  const onDragDown = (kind: 'start' | 'end' | 'pan') => (ev: ReactPointerEvent<HTMLElement>): void => {
    ev.preventDefault();
    ev.stopPropagation();
    dragRef.current = { kind, startX: ev.clientX, startS: s, startE: e };
    setActiveDrag(kind);
    if (kind === 'pan') setPanning(true);
    if (typeof ev.currentTarget.setPointerCapture === 'function') ev.currentTarget.setPointerCapture(ev.pointerId);
  };
  const onDragMove = (ev: ReactPointerEvent<HTMLElement>): void => {
    const d = dragRef.current;
    const rect = trackRef.current?.getBoundingClientRect();
    if (!d || !rect || rect.width <= 0) return;
    if (d.kind === 'pan') {
      const delta = Math.round(((ev.clientX - d.startX) / rect.width) * n);
      const w = panWindow(d.startS, d.startE, 0, n - 1, delta);
      if (w.s !== s || w.e !== e) onChange(w.s, w.e);
      return;
    }
    const i = clampInt(((ev.clientX - rect.left) / rect.width) * n, 0, n - 1);
    // 与键盘微调同钳法：起点 ≤ 终点 −(MIN−1)、终点 ≥ 起点+MIN−1
    if (d.kind === 'start') onChange(clampInt(i, 0, Math.max(0, d.startE - (TRACK_MIN_WINDOW - 1))), d.startE);
    else onChange(d.startS, clampInt(i, Math.min(n - 1, d.startS + TRACK_MIN_WINDOW - 1), n - 1));
  };
  const onDragUp = (ev: ReactPointerEvent<HTMLElement>): void => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setPanning(false);
    setActiveDrag(null);
    const el = ev.currentTarget;
    if (typeof el.hasPointerCapture === 'function' && el.hasPointerCapture(ev.pointerId)) {
      el.releasePointerCapture(ev.pointerId);
    }
  };
  const nudge = (kind: 'start' | 'end', delta: number): void => {
    if (kind === 'start') onChange(clampInt(s + delta, 0, Math.max(0, e - (TRACK_MIN_WINDOW - 1))), e);
    else onChange(s, clampInt(e + delta, Math.min(n - 1, s + TRACK_MIN_WINDOW - 1), n - 1));
  };

  // 中间刻度（密度 n/4，PanelTimeTrack 同档）：与窗口端点相邻 ±1 的让位（端点标签恒标）
  const step = Math.max(1, Math.ceil(n / 4));
  const midIdx = Array.from({ length: n }, (_, i) => i)
    .filter((i) => i % step === 0 && Math.abs(i - s) > 1 && Math.abs(i - e) > 1);

  const gripStyle = (kind: 'start' | 'end'): CSSProperties => ({
    width: activeDrag === kind ? 5 : 3,
    height: 20,
    borderRadius: radius.pill,
    background: activeDrag === kind ? selectAccent : trackColors.handle,
  });
  const handleStyle = (kind: 'start' | 'end'): CSSProperties => ({
    position: 'absolute',
    left: `${pct(kind === 'start' ? s : e + 1)}%`,
    top: 0,
    width: 18,
    height: 20,
    border: 0,
    background: 'transparent',
    transform: 'translateX(-50%)',
    cursor: 'ew-resize',
    touchAction: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    zIndex: 3,
  });

  return (
    <div ref={trackRef} style={{ position: 'relative', height: 52, marginTop: space.sm, minWidth: 0 }}>
      <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 20, borderRadius: 5, background: trackColors.rail, boxShadow: `inset 0 0 0 1px ${color.hairline}` }} />
      <div
        title="拖动调整全部面板的查看窗口，不改变参照数据范围"
        aria-label="平移参考时间窗"
        style={{
          position: 'absolute',
          left: `${pct(s)}%`,
          width: `${pct(e + 1) - pct(s)}%`,
          top: 0,
          height: 20,
          borderRadius: 5,
          background: panning ? trackColors.fillStrong : trackColors.fill,
          boxShadow: `inset 0 0 0 1px ${trackColors.handleSoft}`,
          cursor: panning ? 'grabbing' : 'grab',
          touchAction: 'none',
          zIndex: 1,
        }}
        onPointerDown={onDragDown('pan')}
        onPointerMove={onDragMove}
        onPointerUp={onDragUp}
        onPointerCancel={onDragUp}
      />
      {[s, e].map((m) => (
        <span key={`edge-tick-${m}`} aria-hidden="true" style={{ position: 'absolute', left: `${pct(m) + 0.5 / n}%`, top: 4, width: 1, height: 12, transform: 'translateX(-50%)', background: color.hairlineStrong, pointerEvents: 'none' }} />
      ))}
      {midIdx.map((i) => (
        <span key={`mid-tick-${i}`} aria-hidden="true" style={{ position: 'absolute', left: `${pct(i) + 0.5 / n}%`, top: 7, width: 1, height: 6, transform: 'translateX(-50%)', background: trackColors.tick, pointerEvents: 'none' }} />
      ))}
      {/* 两端拖柄标签（恒标，白底兜底遮盖；中间刻度只画线 + 少量灰标签） */}
      <span aria-hidden="true" className="tnum" style={{ position: 'absolute', left: `${pct(s)}%`, top: 26, transform: 'translateX(-12%)', fontSize: 12, lineHeight: '14px', fontFamily: font.family, fontVariantNumeric: 'tabular-nums', color: color.body, fontWeight: 600, whiteSpace: 'nowrap', pointerEvents: 'none', background: color.canvas, padding: '0 3px' }}>
        {`W${s + 1}`}
      </span>
      <span aria-hidden="true" className="tnum" style={{ position: 'absolute', left: `${pct(e + 1)}%`, top: 26, transform: 'translateX(-88%)', fontSize: 12, lineHeight: '14px', fontFamily: font.family, fontVariantNumeric: 'tabular-nums', color: color.body, fontWeight: 600, whiteSpace: 'nowrap', pointerEvents: 'none', background: color.canvas, padding: '0 3px' }}>
        {`W${e + 1}`}
      </span>
      {midIdx.map((i) => (
        <span
          key={`mid-label-${i}`}
          aria-hidden="true"
          className="tnum"
          style={{ position: 'absolute', left: `${pct(i) + 0.5 / n}%`, top: 26, transform: 'translateX(-50%)', fontSize: 12, lineHeight: '14px', fontFamily: font.family, fontVariantNumeric: 'tabular-nums', color: color.mute, whiteSpace: 'nowrap', pointerEvents: 'none' }}
        >
          {`W${i + 1}`}
        </span>
      ))}
      {(['start', 'end'] as const).map((kind) => (
        <div
          key={kind}
          style={handleStyle(kind)}
          role="slider"
          tabIndex={0}
          aria-label={`参考时间窗${kind === 'start' ? '起点' : '终点'}拖柄`}
          aria-valuemin={kind === 'start' ? 0 : Math.min(n - 1, s + TRACK_MIN_WINDOW - 1)}
          aria-valuemax={kind === 'start' ? Math.max(0, e - TRACK_MIN_WINDOW + 1) : n - 1}
          aria-valuenow={kind === 'start' ? s : e}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            event.preventDefault();
            const delta = (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 4 : 1);
            nudge(kind, delta);
          }}
          onPointerDown={onDragDown(kind)}
          onPointerMove={onDragMove}
          onPointerUp={onDragUp}
          onPointerCancel={onDragUp}
        >
          <span style={gripStyle(kind)} />
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------
// 参考面板卡：面板头（身份区 + 链路徽标 + 补录 / 删除）+ 共享窗口量价图
// + 事件名录（预标 / 补录）。
// ------------------------------------------------------------
function ReferenceChartCard({
  product,
  isInChain,
  panelCount,
  onRemove,
  composer,
  picking,
  composerValue,
  onComposerChange,
  onOpenComposer,
  onPick,
  onPickWeek,
  onSubmitComposer,
  onCancelComposer,
  onCancelPick,
  composedEvents,
  onRemoveComposed,
  win,
  focusWeek,
  focusKey,
  footNote,
}: {
  product: LifecycleProductSeed;
  /** 该面板产品当前是否主链参照（进主链徽标）。 */
  isInChain: boolean;
  panelCount: number;
  onRemove: () => void;
  /** 补录弹层受控：composer = 本面板是否有打开的弹层草稿。 */
  composer: boolean;
  picking: boolean;
  composerValue: ReferenceComposerValue | null;
  onComposerChange: (patch: Partial<ReferenceComposerValue>) => void;
  onOpenComposer: () => void;
  onPick: () => void;
  onPickWeek: (week: number) => void;
  onSubmitComposer: (draft: ReferenceComposedDraft) => void;
  onCancelComposer: () => void;
  onCancelPick: () => void;
  composedEvents: ReferenceComposedEvent[];
  onRemoveComposed: (id: string) => void;
  win: [number, number];
  focusWeek: number | null;
  focusKey: number;
  footNote?: string;
}) {
  const tone = brandColorOf(product.brand);
  const pickMode = picking;
  return (
    <div style={{ border: `1px solid ${color.hairline}`, borderRadius: radius.card, padding: `${space.md}px ${space.base}px ${space.sm}px`, minWidth: 0 }}>
      {/* 面板头（量价页明细卡身份区语言）：品牌色点 + 产品名胶囊 + 徽标 + 补录 / 删除 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: space.sm, marginBottom: space.sm, flexWrap: 'wrap' }}>
        <span aria-hidden style={{ width: 8, height: 8, borderRadius: radius.pill, background: tone, flex: 'none' }} />
        <span
          title={product.label}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '2px 9px',
            borderRadius: radius.pill,
            border: `1px solid ${color.hairline}`,
            background: color.canvasSoft,
            color: color.ink,
            fontSize: 12,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            maxWidth: '100%',
            overflow: 'hidden',
          }}
        >
          {product.label}
        </span>
        <span
          title={isInChain
            ? '该参照为上一代产品：选择写入主链，经同周龄比值校正主图基线'
            : '对照查看：不写入主链、不影响主图基线，仅用于核对量价节奏'}
          style={{
            ...smallChipStyle,
            background: isInChain ? '#e8f1ff' : color.canvasSoft2,
            color: isInChain ? '#0053c2' : color.mute,
            border: `1px solid ${isInChain ? '#0070f3' : color.hairline}`,
          }}
        >
          {isInChain ? '进主链 · 基线校正' : '对照 · 不影响主图基线'}
        </span>
        <span title="历史补录为会话内草稿：刷新即清，不写入主链" style={{ ...smallChipStyle, background: color.canvasSoft2, color: color.body, border: `1px solid ${color.hairline}` }}>
          补录 · 会话内
        </span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Popover
            open={composer && !picking}
            onOpenChange={(open) => { if (open) onOpenComposer(); else onCancelComposer(); }}
            trigger="click"
            placement="bottomRight"
            content={composer && composerValue ? (
              <ReferenceEventComposer
                product={product}
                value={composerValue}
                onChange={onComposerChange}
                onPick={onPick}
                onSubmit={onSubmitComposer}
                onCancel={onCancelComposer}
              />
            ) : null}
          >
            <button type="button" aria-label={`为 ${product.label} 补录历史事件`} title="补录历史事件（会话内草稿）" onClick={onOpenComposer} style={headButtonStyle(false)}>
              ＋ 补录事件
            </button>
          </Popover>
          <button
            type="button"
            aria-label={`删除参考面板：${product.label}`}
            title={panelCount <= 1 ? '至少保留一个参考面板' : '删除该参考面板'}
            onClick={onRemove}
            disabled={panelCount <= 1}
            style={{ ...headButtonStyle(true), cursor: panelCount <= 1 ? 'not-allowed' : 'pointer', opacity: panelCount <= 1 ? 0.45 : 1 }}
          >
            × 删除
          </button>
        </span>
      </div>
      {/* 补录点选模式提示条：弹层收起，点图上某周完成补录 */}
      {pickMode && (
        <div
          role="status"
          aria-live="polite"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: space.sm,
            padding: '6px 10px',
            borderRadius: radius.control,
            background: '#e8f1ff',
            border: '1px solid #0070f3',
            marginBottom: space.sm,
            minWidth: 0,
          }}
        >
          <span style={{ fontSize: 11.5, fontWeight: 600, color: '#0053c2' }}>点击图上某周完成补录</span>
          <button
            type="button"
            aria-label="取消补录点选"
            onClick={onCancelPick}
            style={{ marginLeft: 'auto', border: 'none', background: 'transparent', color: '#0053c2', font: 'inherit', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', padding: 0 }}
          >
            取消补录
          </button>
        </div>
      )}
      {product.points.length > 0 ? (
        <ReferenceVolumeChart
          product={product}
          win={win}
          focusWeek={focusWeek}
          focusKey={focusKey}
          composedEvents={composedEvents}
          pickMode={pickMode}
          onPickWeek={onPickWeek}
        />
      ) : (
        <div role="status" style={{ padding: `${space.lg}px 0`, textAlign: 'center', fontSize: 12, color: color.mute }}>暂无可参照历史</div>
      )}
      {/* 事件名录（预标 / 补录分组；补录可删） */}
      {(product.events.length > 0 || composedEvents.length > 0) && (
        <div style={{ marginTop: space.sm, borderTop: `1px solid ${color.hairline}`, paddingTop: space.sm, display: 'grid', gap: 4 }}>
          {product.events.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '3px 10px', minWidth: 0 }}>
              <span style={{ ...smallChipStyle, background: color.canvasSoft2, color: color.mute, border: `1px solid ${color.hairline}`, flex: 'none' }}>预标</span>
              {product.events.map((ev) => (
                <span key={`preset-${ev.type}-${ev.week}`} className="tnum" style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4, fontSize: 11, color: color.body, minWidth: 0 }}>
                  <span aria-hidden style={{ width: 7, height: 7, borderRadius: 2, background: REFERENCE_EVENT_TONES[ev.type], flex: 'none', alignSelf: 'center' }} />
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>W{ev.week + 1}</span>
                  <span>{ev.label}</span>
                  {ev.impactPct != null && ev.impactWeeks != null && (
                    <span style={{ color: color.mute }}>{fmtSignedPct(ev.impactPct)}×{ev.impactWeeks} 周</span>
                  )}
                </span>
              ))}
            </div>
          )}
          {composedEvents.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '3px 10px', minWidth: 0 }}>
              <span style={{ ...smallChipStyle, background: color.canvasSoft2, color: color.body, border: `1px solid ${color.hairline}`, flex: 'none' }}>补录（会话内草稿）</span>
              {composedEvents.map((ev) => (
                <span key={`composed-${ev.id}`} className="tnum" style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4, fontSize: 11, color: color.body, minWidth: 0 }}>
                  <span aria-hidden style={{ width: 7, height: 7, borderRadius: 2, background: REFERENCE_EVENT_TONES[ev.type], flex: 'none', alignSelf: 'center' }} />
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>W{ev.week + 1}</span>
                  <span>{ev.note}</span>
                  <button
                    type="button"
                    aria-label={`删除补录事件：${ev.note}`}
                    title="删除该补录事件（会话内草稿）"
                    onClick={() => onRemoveComposed(ev.id)}
                    style={{ border: 'none', background: 'transparent', color: color.mute, font: 'inherit', fontSize: 12, lineHeight: 1, cursor: 'pointer', padding: '0 2px' }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
      {footNote && (
        <div className="tnum" style={{ marginTop: space.xs, fontSize: 11, color: color.mute, minWidth: 0 }}>{footNote}</div>
      )}
    </div>
  );
}

export interface ReferencePanelProps {
  fixture: WorkbenchFixture;
  result: WorkbenchResult;
  /** 受控：params.prevGenReferenceId（状态由页面持有）；基准 = prevGenPool[0]。 */
  prevGenReferenceId: string;
  /** 选择回调：写入 params.prevGenReferenceId，经模型同周龄比值校正主图基线。 */
  onPrevGenReferenceChange: (id: string) => void;
  /** 主图输入信号（手调应用 / 产品事件录入）：seq 递增触发智能弹框。 */
  inputSignal?: ReferenceInputSignal | null;
}

export default function ReferencePanel({
  fixture,
  result,
  // 受控值；页面（WP6 集成）接线前回退基准参照，保证渲染安全。
  prevGenReferenceId = fixture.references.prevGenPool[0]?.id ?? '',
  onPrevGenReferenceChange,
  inputSignal,
}: ReferencePanelProps) {
  const pool = useMemo(() => fixture.references.lifecyclePool ?? [], [fixture]);
  const defaultChainRef = fixture.references.prevGenPool[0]?.id ?? '';

  // ---- 面板构成（卡内会话态）：默认 2 面板 = 首个链内产品（随受控主链参照）
  //      + 首个对照产品；增删走「＋ 添加参考」下拉与面板头 × 删除。 ----
  const [panelIds, setPanelIds] = useState<string[]>(() => {
    const chain = pool.find((p) => p.chainRefId === prevGenReferenceId)?.id
      ?? pool.find((p) => p.chainRefId != null)?.id;
    const contrast = pool.find((p) => p.chainRefId == null)?.id;
    return [chain, contrast].filter((x): x is string => !!x);
  });
  const panelProducts = useMemo(
    () => panelIds
      .map((id) => pool.find((p) => p.id === id))
      .filter((p): p is LifecycleProductSeed => p != null),
    [pool, panelIds],
  );
  // 面板数变化（增删）→ 各面板态数组随动（补录草稿按产品 id 挂，不受影响）
  useEffect(() => {
    const valid = panelIds.filter((id) => pool.some((p) => p.id === id));
    if (valid.length !== panelIds.length) setPanelIds(valid);
  }, [panelIds, pool]);

  // ---- 页面侧受控 prevGenReferenceId 变化（如重置基准）→ 面板视图跟随主链：
  //      已有面板映射该参照则不动；否则把首个链内面板的产品换成主链产品。 ----
  const prevGenSeenRef = useRef(prevGenReferenceId);
  useEffect(() => {
    if (prevGenSeenRef.current === prevGenReferenceId) return;
    prevGenSeenRef.current = prevGenReferenceId;
    const showsTarget = panelIds.some((id) => pool.find((p) => p.id === id)?.chainRefId === prevGenReferenceId);
    if (showsTarget) return;
    const target = pool.find((p) => p.chainRefId === prevGenReferenceId);
    if (!target) return;
    const idx = panelIds.findIndex((id) => pool.find((p) => p.id === id)?.chainRefId != null);
    if (idx === -1) return;
    setPanelIds((prev) => prev.map((pid, i) => (i === idx ? target.id : pid)));
  }, [prevGenReferenceId, pool, panelIds]);

  const addPanel = (id: string): void => {
    if (panelIds.includes(id)) return;
    const product = pool.find((p) => p.id === id);
    if (!product) return;
    setPanelIds((prev) => [...prev, id]);
    // 上一代（有主链映射）面板加入 → 写 prevGenReferenceId 进主链；对照面板不改基线
    if (product.chainRefId) onPrevGenReferenceChange?.(product.chainRefId);
  };
  const removePanel = (id: string): void => {
    if (panelIds.length <= 1) return;
    const removed = pool.find((p) => p.id === id);
    const next = panelIds.filter((x) => x !== id);
    setPanelIds(next);
    if (composer?.productId === id) setComposer(null);
    if (pickingId === id) setPickingId(null);
    // 删除的是当前主链面板 → 主链回退：下一个链内面板优先，否则回默认参照
    const wasChain = removed?.chainRefId != null && removed.chainRefId === prevGenReferenceId;
    if (wasChain) {
      const nextChain = next
        .map((pid) => pool.find((p) => p.id === pid))
        .find((p) => p?.chainRefId != null);
      onPrevGenReferenceChange?.(nextChain?.chainRefId ?? defaultChainRef);
    }
  };

  // ---- 共享时间窗（52 周全池内滑动，最小 8 周）：控制全部面板 ----
  const trackTotal = useMemo(
    () => pool.reduce((max, p) => Math.max(max, p.points.length), 0),
    [pool],
  );
  const [sharedWin, setSharedWin] = useState<[number, number]>([0, Math.max(0, trackTotal - 1)]);
  const clampWin = (next: [number, number]): [number, number] => {
    let cs = clampInt(next[0], 0, trackTotal - 1);
    let ce = clampInt(next[1], 0, trackTotal - 1);
    if (cs > ce) [cs, ce] = [ce, cs];
    if (ce - cs < TRACK_MIN_WINDOW - 1) {
      ce = Math.min(trackTotal - 1, cs + TRACK_MIN_WINDOW - 1);
      cs = Math.max(0, ce - (TRACK_MIN_WINDOW - 1));
    }
    return [cs, ce];
  };
  const applySharedWin = (s: number, e: number): void => setSharedWin(clampWin([s, e]));
  // 窗口变化 / 池失义 → 窗口钳回可调全域（面板内选区失义由图内自清）
  useEffect(() => {
    setSharedWin((prev) => clampWin(prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackTotal]);

  // ---- 历史事件补录（「作业草稿」会话 state，key 含面板产品 id；刷新即清） ----
  const [composedByProduct, setComposedByProduct] = useState<Record<string, ReferenceComposedEvent[]>>({});
  const composedSeqRef = useRef(0);
  // 补录弹层（受控）：value 由卡持有——「在图上点选」回归后已填内容不丢
  const [composer, setComposer] = useState<{ productId: string; value: ReferenceComposerValue } | null>(null);
  const [pickingId, setPickingId] = useState<string | null>(null);
  const openComposer = (productId: string): void => {
    setPickingId(null);
    setComposer((prev) => (prev?.productId === productId
      ? prev
      : { productId, value: { type: 'competitor-launch', week: null, note: '' } }));
  };
  const changeComposer = (productId: string, patch: Partial<ReferenceComposerValue>): void => {
    setComposer((prev) => (prev?.productId === productId ? { ...prev, value: { ...prev.value, ...patch } } : prev));
  };
  const cancelComposer = (): void => {
    setComposer(null);
    setPickingId(null);
  };
  // 面板级取消：只清自己面板的弹层草稿 / 点选态——A 面板弹层离场动画中的
  // 外点关闭回调不得清掉刚打开的 B 面板草稿（先开 B 后收 A 的竞态）
  const cancelComposerFor = (productId: string): void => {
    setComposer((prev) => (prev?.productId === productId ? null : prev));
    setPickingId((prev) => (prev === productId ? null : prev));
  };
  const submitComposer = (productId: string, draft: ReferenceComposedDraft): void => {
    composedSeqRef.current += 1;
    const event: ReferenceComposedEvent = { id: `ce-${productId}-${composedSeqRef.current}`, ...draft };
    setComposedByProduct((prev) => ({ ...prev, [productId]: [...(prev[productId] ?? []), event] }));
    setComposer(null);
    setPickingId(null);
  };
  const removeComposed = (productId: string, eventId: string): void => {
    setComposedByProduct((prev) => ({
      ...prev,
      [productId]: (prev[productId] ?? []).filter((ev) => ev.id !== eventId),
    }));
  };

  // ---- 「＋ 添加参考」下拉：池内未添加产品，分组 上一代 · 进主链 / 友商 · 对照 ----
  const addMenuItems = useMemo(() => {
    const remaining = pool.filter((p) => !panelIds.includes(p.id));
    const groupOf = (label: string, items: LifecycleProductSeed[]) =>
      items.length > 0
        ? { key: `group-${label}`, type: 'group' as const, label, children: items.map((p) => ({ key: p.id, label: p.label })) }
        : null;
    const groups = [
      groupOf('上一代 · 进主链', remaining.filter((p) => p.chainRefId != null)),
      groupOf('友商 / 其他 · 对照', remaining.filter((p) => p.chainRefId == null)),
    ].filter((group) => group != null);
    if (groups.length === 0) {
      return [{ key: 'add-empty', label: pool.length === 0 ? '参考池为空' : '参考池产品已全部添加', disabled: true }];
    }
    return groups;
  }, [pool, panelIds]);

  // ---- 智能弹框（transient 顶部条，非 Modal）：inputSignal.seq 递增触发，
  //      8 秒自动收起；条目点击定位到对应事件周（共享窗口平移 + 悬停）。 ----
  const [hint, setHint] = useState<HintState | null>(null);
  const [focus, setFocus] = useState<{ panelId: string; week: number; key: number } | null>(null);
  const seenSeqRef = useRef(0);
  useEffect(() => {
    if (!inputSignal || inputSignal.seq <= seenSeqRef.current) return;
    seenSeqRef.current = inputSignal.seq;
    setHint({
      kind: inputSignal.kind,
      weekLabel: inputSignal.weekLabel,
      entries: panelProducts.flatMap((product) => hintEntriesOf(product, product.id)),
    });
  }, [inputSignal, panelProducts]);
  useEffect(() => {
    if (!hint) return;
    const timer = window.setTimeout(() => setHint(null), 8000);
    return () => window.clearTimeout(timer);
  }, [hint]);
  const focusEntry = (entry: HintEntry): void => {
    const total = trackTotal;
    if (total <= 0) return;
    const w = clampInt(entry.week, 0, total - 1);
    const span = Math.min(FOCUS_SPAN, total);
    let s = Math.max(0, w - 6);
    let e = Math.min(total - 1, s + span - 1);
    s = Math.max(0, e - span + 1);
    setSharedWin(clampWin([s, e]));
    setFocus((prev) => ({ panelId: entry.panelId, week: w, key: (prev?.key ?? 0) + 1 }));
  };

  // 模型比值行（主图基线校正）：只消费推演模型考量，卡内不另算比值。
  const firstForecastWeek = result.weeks.find((week) => week.status === 'forecast');
  const referenceConsider = firstForecastWeek?.consider.find((item) => item.kind === 'reference');
  const prevGenFootnote = firstForecastWeek && referenceConsider
    ? `主图基线校正 · 首预测周 ${firstForecastWeek.week}：${referenceConsider.note}`
    : undefined;

  const emptyPool = pool.length === 0;
  const panelCount = panelProducts.length;
  // 并排上限 2（量价页同款轨道宽度策略）：≤2 均分一行；>2 不折行横滚——
  // 轨道总宽 = (N/2) × 可视宽 + (N/2 − 1) × 列距，使每格恒为可视宽 1/2（减列距）
  const trackWidth = panelCount > 2
    ? `calc(${panelCount / 2} * 100% + ${(panelCount / 2 - 1) * space.md}px)`
    : '100%';

  return (
    <section style={workbenchCardStyle}>
      <SectionHead
        title="上一代上市同期 / 友商同期量价"
        hint="历史参照：参考面板可增删（＋ 添加参考 / 面板头删除，至少保留一个），每张图为参照产品上市起的全生命周期量价（量柱 + 价格线 + 档期带 + 事件锚），底部共享时间轨控制全部面板窗口，图上拖选区间读价量变化；上一代面板经同周龄比值进入主图基线校正，对照面板仅查看。唯一差异 = 历史事件补录：为已发生的量价变化补记原因（会话内草稿，刷新即清）。"
        extra={(
          <>
            <span
              title="参照序列为历史演示样本 · 纯历史数据，无预测段"
              style={{ ...smallChipStyle, background: color.canvasSoft2, color: color.body }}
            >
              仅历史
            </span>
            <SimChip variant="simHistory" title="参照序列为模拟样本回放，不代表真实市场" />
          </>
        )}
      />
      <IoBar
        input="参照产品全生命周期量价、档期与事件锚（参考面板可增删：上一代 / 友商同期）"
        output="上一代面板经同周龄比值校正主图基线；对照面板仅查看；历史事件补录只作解释性标注（会话内）；主图输入（手调 / 产品事件）时弹出参照表现提示"
      />
      {/* 智能弹框（卡头顶部条，非 Modal）：主图输入后按面板列出参照产品在类似时间的表现 */}
      {hint && (
        <div
          role="status"
          aria-live="polite"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '4px 10px',
            padding: '8px 12px',
            borderRadius: radius.control,
            background: color.canvasSoft2,
            border: `1px solid ${color.hairline}`,
            marginBottom: space.md,
            minWidth: 0,
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 600, color: color.ink }}>我参考了这些产品</span>
          <span style={{ fontSize: 11.5, color: color.mute, minWidth: 0 }}>
            主图{hint.kind === 'event' ? '录入产品事件' : '手动微调'}{hint.weekLabel ? `（${hint.weekLabel}）` : ''}后，它们在类似时间的表现：
          </span>
          {hint.entries.map((entry) => (
            <button
              key={`${entry.panelId}-${entry.productId}`}
              type="button"
              className="tnum"
              title="点击定位到对应事件周"
              onClick={() => focusEntry(entry)}
              style={{
                fontSize: 11.5,
                lineHeight: '16px',
                padding: '3px 9px',
                borderRadius: radius.pill,
                border: `1px solid ${color.hairlineStrong}`,
                background: color.canvas,
                color: color.body,
                cursor: 'pointer',
                font: 'inherit',
                fontVariantNumeric: 'tabular-nums',
                whiteSpace: 'nowrap',
              }}
            >
              {entry.text}
            </button>
          ))}
          {hint.entries.length === 0 && (
            <span style={{ fontSize: 11.5, color: color.mute }}>当前参照产品无可回放的事件锚</span>
          )}
          <button
            type="button"
            aria-label="关闭参照提示"
            onClick={() => setHint(null)}
            style={{
              marginLeft: 'auto',
              display: 'inline-grid',
              placeItems: 'center',
              width: 20,
              height: 20,
              padding: 0,
              border: 'none',
              borderRadius: radius.pill,
              background: 'transparent',
              color: color.mute,
              fontSize: 13,
              lineHeight: 1,
              cursor: 'pointer',
            }}
          >
            ×
          </button>
        </div>
      )}
      {emptyPool ? (
        <div style={{ border: `1px solid ${color.hairline}`, borderRadius: radius.card, padding: `${space.md}px ${space.base}px ${space.sm}px`, minWidth: 0 }}>
          <div role="status" style={{ padding: `${space.lg}px 0`, textAlign: 'center', fontSize: 12, color: color.mute }}>暂无可参照历史</div>
        </div>
      ) : (
        <>
          {/* 面板区工具行：补录叙述 + 添加参考下拉 */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 12px', marginBottom: space.sm, minWidth: 0 }}>
            <span style={{ fontSize: 11, color: color.mute, minWidth: 0 }}>
              历史事件补录：为已发生的量价变化补记原因（会话内草稿，刷新即清）
            </span>
            <span style={{ marginLeft: 'auto', flex: 'none' }}>
              <Dropdown
                trigger={['click']}
                menu={{ items: addMenuItems, onClick: ({ key }) => addPanel(key) }}
                placement="bottomRight"
              >
                <button
                  type="button"
                  aria-label="添加参考面板"
                  title="从参考池添加参照产品面板（上一代进主链 / 友商对照）"
                  style={{
                    height: 26,
                    padding: '0 10px',
                    borderRadius: radius.control,
                    border: `1px solid ${color.hairlineStrong}`,
                    background: color.canvas,
                    color: color.ink,
                    font: 'inherit',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  ＋ 添加参考
                </button>
              </Dropdown>
            </span>
          </div>
          {/* 单一横滚容器：面板网格 + 共享时间轨同轨（>2 面板不折行，一起横滚） */}
          <div className="lpl-card-scroll" style={{ overflowX: 'auto', marginBottom: space.sm }}>
            <div style={{ minWidth: TRACK_MIN_WIDTH, width: trackWidth }}>
              {panelCount === 0 ? (
                <div role="status" style={{ padding: `${space.lg}px 0`, textAlign: 'center', fontSize: 12, color: color.mute, border: `1px dashed ${color.hairline}`, borderRadius: radius.card }}>
                  暂无可参照历史
                </div>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${panelCount}, minmax(0, 1fr))`, gap: space.md, alignItems: 'start' }}>
                    {panelProducts.map((product) => {
                      const composed = composedByProduct[product.id] ?? [];
                      const isChainPanel = product.chainRefId != null && product.chainRefId === prevGenReferenceId;
                      return (
                        <ReferenceChartCard
                          key={product.id}
                          product={product}
                          isInChain={isChainPanel}
                          panelCount={panelCount}
                          onRemove={() => removePanel(product.id)}
                          composer={composer?.productId === product.id}
                          picking={pickingId === product.id}
                          composerValue={composer?.productId === product.id ? composer.value : null}
                          onComposerChange={(patch) => changeComposer(product.id, patch)}
                          onOpenComposer={() => openComposer(product.id)}
                          onPick={() => setPickingId(product.id)}
                          onPickWeek={(week) => {
                            changeComposer(product.id, { week });
                            setPickingId(null);
                          }}
                          onSubmitComposer={(value) => submitComposer(product.id, value)}
                          onCancelComposer={() => cancelComposerFor(product.id)}
                          onCancelPick={() => cancelComposerFor(product.id)}
                          composedEvents={composed}
                          onRemoveComposed={(eventId) => removeComposed(product.id, eventId)}
                          win={sharedWin}
                          focusWeek={focus?.panelId === product.id ? focus.week : null}
                          focusKey={focus?.panelId === product.id ? focus.key : 0}
                          footNote={isChainPanel ? prevGenFootnote : undefined}
                        />
                      );
                    })}
                  </div>
                  {/* 面板区底部共享时间轨：控制全部面板窗口（52 周全池内滑动，最小 8 周） */}
                  <SharedTimeTrack total={trackTotal} win={sharedWin} onChange={applySharedWin} />
                </>
              )}
            </div>
          </div>
          {/* 模型比值行（主图基线校正）：上一代面板存在时面板内同文显示，此处兜底 */}
          {prevGenFootnote && !panelProducts.some((p) => p.chainRefId != null && p.chainRefId === prevGenReferenceId) && (
            <div className="tnum" style={{ fontSize: 11, color: color.mute, minWidth: 0 }}>{prevGenFootnote}</div>
          )}
        </>
      )}
    </section>
  );
}
