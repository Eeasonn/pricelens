// ============================================================
// Y 轴上下限控件：在轴上方直接输入价格范围。
// 所有值仍由父层 yLimit 受控；空值表示该侧恢复自动跟随数据。
// 顶部「自适应」选中 = 两侧都是自动；任一侧被改成自定义后取消选中，
// 再点一次把两侧都交回自动。
// 数值 ≥1000 用 K/M，和轴刻度同一套缩写。两侧箭头按 100 调整。
// ============================================================
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react';
import { color, font, radius, selectSoft, selectSoftInk } from '../../theme/tokens';
import { fmtAxisTick } from './helpers';
import type { YScale } from './helpers';

export interface YLimitState {
  min: number | null;
  max: number | null;
}

type LimitKind = 'min' | 'max';

const BUTTON_H = 20;
const LABEL_H = 12;
const INPUT_H = 22;
const ROW_GAP = 2;
const PAD_X = 2;
const PAD_Y = 3;
const BORDER = 2;
const TOP_INSET = 2;
/** 控件底边到绘图区顶的空隙。顶格刻度字向上伸出约 8px，空隙大于它，盒底和刻度之间才留得出空白。 */
export const Y_LIMIT_AXIS_GAP = 20;
/** 上下限箭头的步长：每次 100。 */
export const Y_LIMIT_STEP = 100;

const CONTROL_H =
  BORDER +
  PAD_Y * 2 +
  BUTTON_H +
  LABEL_H * 2 +
  INPUT_H * 2 +
  ROW_GAP * 4;

/** 绘图区顶需要预留的高度：顶边留白 + 控件 + 与 Y 轴的空隙。 */
export const Y_LIMIT_EDITOR_H = CONTROL_H + Y_LIMIT_AXIS_GAP + TOP_INSET;

const formatLimit = (value: number, interval: number): string => {
  if (!Number.isFinite(value)) return '';
  if (Math.abs(value) >= 1000) return fmtAxisTick(value, interval);
  return String(Math.round(value));
};

/** 接受 2000、2K、2.5k、1.2M。空串表示恢复自动。无法解析返回 NaN。 */
export function parseLimitText(text: string): number | null {
  const trimmed = text.trim().replace(/,/g, '').replace(/\s/g, '');
  if (!trimmed) return null;
  const matched = trimmed.match(/^(\d+(?:\.\d+)?)([kKmM])?$/);
  if (!matched) return Number.NaN;
  let value = Number(matched[1]);
  const unit = matched[2]?.toLowerCase();
  if (unit === 'k') value *= 1e3;
  if (unit === 'm') value *= 1e6;
  return value;
}

function LimitInput(props: {
  kind: LimitKind;
  value: number | null;
  autoValue: number;
  interval: number;
  onCommit: (value: number | null) => void;
}) {
  const { kind, value, autoValue, interval, onCommit } = props;
  const effective = value ?? autoValue;
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(() => formatLimit(effective, interval));
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (!focused) setDraft(formatLimit(effective, interval));
  }, [effective, focused, interval]);

  const commitText = (text: string): void => {
    const parsed = parseLimitText(text);
    if (parsed == null) {
      onCommit(null);
      setDraft(formatLimit(autoValue, interval));
      return;
    }
    if (!Number.isFinite(parsed)) {
      setDraft(formatLimit(effective, interval));
      return;
    }
    onCommit(Math.max(0, parsed));
  };

  const commit = (): void => {
    if (!dirtyRef.current) {
      setDraft(formatLimit(effective, interval));
      return;
    }
    dirtyRef.current = false;
    commitText(draft);
  };

  const nudge = (delta: number): void => {
    const parsed = parseLimitText(draft);
    const base = dirtyRef.current && parsed != null && Number.isFinite(parsed) ? parsed : effective;
    const raw = Math.max(0, base + delta);
    const next = kind === 'max' ? Math.ceil(raw / Y_LIMIT_STEP) * Y_LIMIT_STEP : Math.floor(raw / Y_LIMIT_STEP) * Y_LIMIT_STEP;
    dirtyRef.current = false;
    onCommit(next);
    setDraft(focused ? String(next) : formatLimit(next, interval));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
      event.currentTarget.blur();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      dirtyRef.current = false;
      setDraft(formatLimit(effective, interval));
      event.currentTarget.blur();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      nudge(Y_LIMIT_STEP);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      nudge(-Y_LIMIT_STEP);
    }
  };

  const label = kind === 'max' ? '上限' : '下限';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        minWidth: 0,
        height: INPUT_H,
        boxSizing: 'border-box',
        border: `1px solid ${color.hairlineStrong}`,
        borderRadius: radius.control,
        background: color.canvas,
        overflow: 'hidden',
      }}
      title={`价格${label}：输入后按 Enter 或离开输入框生效；清空恢复自动。箭头每次调整 ${Y_LIMIT_STEP}`}
    >
      <input
        className="tnum"
        type="text"
        inputMode="decimal"
        value={draft}
        aria-label={kind === 'max' ? 'Y 轴上限' : 'Y 轴下限'}
        aria-valuetext={`${formatLimit(effective, interval)}${value == null ? '（自动）' : '（自定义）'}`}
        onChange={(event) => {
          dirtyRef.current = true;
          setDraft(event.target.value);
        }}
        onFocus={() => {
          setFocused(true);
          dirtyRef.current = false;
          setDraft(String(Math.round(effective)));
        }}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        onKeyDown={onKeyDown}
        onPointerDown={(event) => event.stopPropagation()}
        style={{
          flex: '1 1 auto',
          minWidth: 0,
          width: 0,
          height: '100%',
          border: 'none',
          background: 'transparent',
          color: color.body,
          fontFamily: font.family,
          fontVariantNumeric: 'tabular-nums',
          fontSize: 12,
          fontWeight: 400,
          lineHeight: '20px',
          textAlign: 'left',
          padding: '0 0 0 4px',
          outline: 'none',
        }}
      />
      <span style={{ display: 'flex', flexDirection: 'column', flex: '0 0 12px', height: '100%' }}>
        <button
          type="button"
          aria-label={`${label}增加 ${Y_LIMIT_STEP}`}
          tabIndex={-1}
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.stopPropagation();
            nudge(Y_LIMIT_STEP);
          }}
          style={stepButtonStyle}
        >
          ▴
        </button>
        <button
          type="button"
          aria-label={`${label}减少 ${Y_LIMIT_STEP}`}
          tabIndex={-1}
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.stopPropagation();
            nudge(-Y_LIMIT_STEP);
          }}
          style={stepButtonStyle}
        >
          ▾
        </button>
      </span>
    </div>
  );
}

const stepButtonStyle: CSSProperties = {
  flex: '1 1 0',
  width: '100%',
  margin: 0,
  padding: 0,
  border: 'none',
  borderLeft: `1px solid ${color.hairline}`,
  background: color.canvas,
  color: color.mute,
  fontSize: 8,
  lineHeight: '10px',
  cursor: 'pointer',
};

export default function YLimitHandles(props: {
  scale: YScale;
  /** 绘图区顶（容器坐标） */
  plotTop: number;
  plotHeight: number;
  /** 与下方档位色块（仅刻度时为刻度列）同宽 */
  trackWidth: number;
  /** 当前受控限位（null = 该侧自动） */
  limit: YLimitState;
  /** 限位提交（输入值通过同一回调进入父层） */
  onLimit: (kind: LimitKind, v: number | null) => void;
}) {
  const { scale, plotTop, trackWidth, limit, onLimit } = props;
  if (scale.segs.length === 0 || trackWidth <= 0) return null;

  const interval = Math.max(1, scale.interval);
  const adaptive = limit.min == null && limit.max == null;

  const stopMouse = (event: MouseEvent<HTMLDivElement>): void => {
    event.stopPropagation();
  };

  const restoreAdaptive = (): void => {
    // 始终两侧都交回自动。输入框失焦会先提交自定义值，这里不能靠当前渲染里的
    // limit 判断，否则同一次点击读到的还是旧的自动态，复位会被跳过。
    onLimit('max', null);
    onLimit('min', null);
  };

  const shellStyle: CSSProperties = {
    position: 'absolute',
    left: 0,
    top: Math.max(0, plotTop - CONTROL_H - Y_LIMIT_AXIS_GAP),
    width: trackWidth,
    height: CONTROL_H,
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    gridTemplateRows: `${BUTTON_H}px ${LABEL_H}px ${INPUT_H}px ${LABEL_H}px ${INPUT_H}px`,
    rowGap: ROW_GAP,
    alignItems: 'center',
    padding: `${PAD_Y}px ${PAD_X}px`,
    boxSizing: 'border-box',
    border: `1px solid ${color.hairline}`,
    borderRadius: radius.control,
    background: color.canvas,
    zIndex: 8,
    pointerEvents: 'auto',
  };

  return (
    <div role="group" aria-label="Y 轴范围设置" style={shellStyle} onMouseDown={stopMouse} onClick={stopMouse}>
      <button
        type="button"
        aria-pressed={adaptive}
        aria-label={adaptive ? 'Y 轴已自适应' : '恢复 Y 轴自适应'}
        title={adaptive ? 'Y 轴范围跟随数据。改动上下限后会取消' : '恢复上下限为自动，重新跟随数据'}
        onClick={(event) => {
          event.stopPropagation();
          restoreAdaptive();
        }}
        style={{
          width: '100%',
          height: BUTTON_H,
          minWidth: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxSizing: 'border-box',
          border: `1px solid ${adaptive ? color.link : color.hairline}`,
          borderRadius: radius.control,
          background: adaptive ? selectSoft : color.canvas,
          color: adaptive ? selectSoftInk : color.body,
          fontFamily: font.family,
          fontSize: 10,
          fontWeight: 600,
          lineHeight: '12px',
          padding: 0,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        自适应
      </button>
      <span style={{ color: color.mute, fontSize: 8, lineHeight: '12px', minWidth: 0 }}>上限</span>
      <LimitInput kind="max" value={limit.max} autoValue={scale.max} interval={interval} onCommit={(value) => onLimit('max', value)} />
      <span style={{ color: color.mute, fontSize: 8, lineHeight: '12px', minWidth: 0 }}>下限</span>
      <LimitInput kind="min" value={limit.min} autoValue={scale.min} interval={interval} onCommit={(value) => onLimit('min', value)} />
    </div>
  );
}
