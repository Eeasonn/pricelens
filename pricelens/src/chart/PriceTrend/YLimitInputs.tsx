// ============================================================
// Y 轴范围控件（A1 收口，2026-11-02 Eason 拍板）：横排在工具行内直接输入
// Y 轴上限/下限，替代原轴列顶部的竖排卡片（YLimitHandles 退役）。
// 原因：图顶带 126px 里只有左侧 63px 宽的卡片有内容，其余整条空白；
// 编辑器移驻常驻工具行后图顶带收到 16px（合并/分图一并归零）。
// 行为与原卡片逐项同源：值仍由父层 yLimit 受控；空值 = 该侧恢复自动跟随；
// 「自适应」选中 = 两侧都自动，任一侧自定义后取消选中，再点交回两侧自动。
// 数值 ≥1000 用 K/M 缩写（与轴刻度同一套）；箭头/方向键每次 100；
// 输入后 Enter 或失焦生效，清空恢复自动。
// ============================================================
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { color, font, radius, selectSoft, selectSoftInk } from '../../theme/tokens';
import { fmtAxisTick } from './helpers';

export interface YLimitState {
  min: number | null;
  max: number | null;
}

type LimitKind = 'min' | 'max';

/** 上下限箭头的步长：每次 100。 */
export const Y_LIMIT_STEP = 100;

const INPUT_H = 24;
const STEPPER_W = 12;

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

const formatLimit = (value: number, interval: number): string => {
  if (!Number.isFinite(value)) return '';
  if (Math.abs(value) >= 1000) return fmtAxisTick(value, interval);
  return String(Math.round(value));
};

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
    <label
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        minWidth: 0,
        flexShrink: 0,
      }}
    >
      <span style={{ color: color.mute, fontSize: 11, lineHeight: '16px', whiteSpace: 'nowrap' }}>{label}</span>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'stretch',
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
          style={{
            width: 46,
            border: 'none',
            background: 'transparent',
            color: color.body,
            fontFamily: font.family,
            fontVariantNumeric: 'tabular-nums',
            fontSize: 12,
            fontWeight: 400,
            lineHeight: `${INPUT_H - 2}px`,
            textAlign: 'left',
            padding: '0 0 0 5px',
            outline: 'none',
          }}
        />
        <span style={{ display: 'flex', flexDirection: 'column', flex: `0 0 ${STEPPER_W}px`, height: '100%' }}>
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
      </span>
    </label>
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

/** Y 轴范围控件组（工具行内联）：[自适应][上限][下限]。onLimit/limit 由父层
 *  （页面 yLimit 会话态）受控；scale 只取 min/max/interval 作自动值与缩写格式。 */
export default function YLimitInputs(props: {
  /** 当前生效轴（合并图或分图共享轴）：自动值与刻度缩写来源 */
  scale: { min: number; max: number; interval: number };
  limit: YLimitState;
  onLimit: (kind: LimitKind, v: number | null) => void;
}) {
  const { scale, limit, onLimit } = props;
  const interval = Math.max(1, scale.interval);
  const adaptive = limit.min == null && limit.max == null;
  return (
    <span role="group" aria-label="Y 轴范围" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
      <button
        type="button"
        aria-pressed={adaptive}
        aria-label={adaptive ? 'Y 轴已自适应' : '恢复 Y 轴自适应'}
        title={adaptive ? 'Y 轴范围跟随数据。改动上下限后会取消' : '恢复上下限为自动，重新跟随数据'}
        onClick={(event) => {
          event.stopPropagation();
          // 始终两侧都交回自动（输入框失焦会先提交自定义值，不能靠当前渲染的
          // limit 判断，否则同一次点击读到的还是旧的自动态，复位会被跳过）。
          onLimit('max', null);
          onLimit('min', null);
        }}
        style={{
          height: INPUT_H,
          padding: '0 10px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxSizing: 'border-box',
          border: `1px solid ${adaptive ? color.link : color.hairline}`,
          borderRadius: radius.control,
          background: adaptive ? selectSoft : color.canvas,
          color: adaptive ? selectSoftInk : color.body,
          fontFamily: font.family,
          fontSize: 12,
          fontWeight: 600,
          lineHeight: `${INPUT_H - 2}px`,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        自适应
      </button>
      <LimitInput kind="max" value={limit.max} autoValue={scale.max} interval={interval} onCommit={(value) => onLimit('max', value)} />
      <LimitInput kind="min" value={limit.min} autoValue={scale.min} interval={interval} onCommit={(value) => onLimit('min', value)} />
    </span>
  );
}
