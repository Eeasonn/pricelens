// ============================================================
// 量价参考卡 · 统一事件名录（预标 / 预标 · 已改 / 草稿 不再分两大段，
// 按起周 → 止周 → 创建次序统一排序；每行行标区分来源）：
// - 行内动作：读数（= 选中 + 事件时段读数）/ 编辑 / 恢复（仅覆写预标）/
//   ×（仅补录软删除）；预标影响值不进名录行，详情中作「预标参考」；
// - 双向联动：hover 行 → 图锚加粗（onHoverEvent）；点击行 → 选中（再次点击
//   关闭详情）；focusReq 让图锚点击后名录滚动到该行并短暂强调；
// - 收纳：默认前 3 条 + 「全部 N 条 / 收起」；选中事件不在前 3 条时自动纳入；
//   「窗内」筛选 chip（默认关闭）；onlyIds（图上 +N 聚合点击）筛选可清。
// 所有动作可 Tab 到达；可访问名称含周段与标题（「编辑事件 W23–W26 618 档期脉冲」）。
// ============================================================
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { color, radius, space } from '../../theme/tokens';
import { eventRangeLabel, type EffectiveReferenceEvent } from './referenceEventModel';

const rangeIntersects = (win: [number, number], start: number, end: number): boolean =>
  end >= win[0] && start <= win[1];

export default function ReferenceEventList(props: {
  productLabel: string;
  /** 统一有效事件（已按起周排序）。 */
  events: EffectiveReferenceEvent[];
  /** 当前查看窗口（「窗内」筛选与窗外可定位判断用）。 */
  win: [number, number];
  selectedEventId: string | null;
  hoverEventId: string | null;
  onHoverEvent: (id: string | null) => void;
  onSelectEvent: (id: string | null) => void;
  onEditEvent: (id: string) => void;
  onRestorePreset: (sourceEventId: string) => void;
  onDeleteComposed: (id: string) => void;
  labelOf: (typeId: string) => string;
  colorOf: (typeId: string) => string;
  /** 图上 +N 聚合点击后的只看集合（null = 无此筛选）。 */
  onlyIds: string[] | null;
  onClearOnly: () => void;
  /** 图锚 / 时段轨点击后的滚动定位（key 递增触发）。 */
  focusReq: { id: string; key: number } | null;
}) {
  const {
    productLabel, events, win, selectedEventId, hoverEventId,
    onHoverEvent, onSelectEvent, onEditEvent, onRestorePreset, onDeleteComposed,
    labelOf, colorOf, onlyIds, onClearOnly, focusReq,
  } = props;
  const [expanded, setExpanded] = useState(false);
  const [windowOnly, setWindowOnly] = useState(false);
  const rowRefs = useRef(new Map<string, HTMLElement>());
  const [emphasizedId, setEmphasizedId] = useState<string | null>(null);

  // 图锚点击 → 名录滚动到该行并短暂强调（无位移动画，立即呈现）
  useEffect(() => {
    if (!focusReq) return;
    setEmphasizedId(focusReq.id);
    const el = rowRefs.current.get(focusReq.id);
    el?.scrollIntoView({ block: 'nearest' });
    const timer = window.setTimeout(() => setEmphasizedId((prev) => (prev === focusReq.id ? null : prev)), 1600);
    return () => window.clearTimeout(timer);
  }, [focusReq?.key, focusReq?.id]);

  const filtered = useMemo(() => {
    let list = events;
    if (onlyIds) list = list.filter((ev) => onlyIds.includes(ev.id));
    if (windowOnly) list = list.filter((ev) => rangeIntersects(win, ev.startWeek, ev.endWeek));
    return list;
  }, [events, onlyIds, windowOnly, win]);

  // 默认前 3 条；选中 / 强调事件不在前 3 条时自动纳入可见集合
  const visible = useMemo(() => {
    if (expanded || filtered.length <= 3) return filtered;
    const keepIds = new Set<string>();
    filtered.slice(0, 3).forEach((ev) => keepIds.add(ev.id));
    if (selectedEventId) {
      const sel = filtered.find((ev) => ev.id === selectedEventId);
      if (sel) keepIds.add(sel.id);
    }
    if (emphasizedId) {
      const em = filtered.find((ev) => ev.id === emphasizedId);
      if (em) keepIds.add(em.id);
    }
    return filtered.filter((ev) => keepIds.has(ev.id));
  }, [filtered, expanded, selectedEventId, emphasizedId]);

  if (events.length === 0 && onlyIds == null) return null;

  const markerOf = (ev: EffectiveReferenceEvent): { text: string; tone: 'preset' | 'presetChanged' | 'composed' } =>
    ev.source === 'composed'
      ? { text: '草稿', tone: 'composed' }
      : ev.overridden
        ? { text: '预标 · 已改', tone: 'presetChanged' }
        : { text: '预标', tone: 'preset' };

  const markerStyle = (tone: 'preset' | 'presetChanged' | 'composed'): CSSProperties => ({
    ...smallChipStyle,
    background: tone === 'composed' ? '#e8f1ff' : color.canvasSoft2,
    color: tone === 'composed' ? '#0053c2' : color.mute,
    border: `1px solid ${tone === 'composed' ? '#0070f3' : color.hairline}`,
    flex: 'none',
  });

  return (
    <div style={{ marginTop: space.sm, borderTop: `1px solid ${color.hairline}`, paddingTop: space.sm, minWidth: 0 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 10px', marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: color.ink }}>事件 {events.length}</span>
        <button
          type="button"
          aria-pressed={windowOnly}
          title={windowOnly ? '仅显示与当前查看窗口相交的事件' : '显示全部事件（窗外事件可一键定位）'}
          onClick={() => setWindowOnly((prev) => !prev)}
          style={{
            height: 20,
            padding: '0 8px',
            borderRadius: radius.pill,
            fontSize: 11,
            fontWeight: 600,
            font: 'inherit',
            cursor: 'pointer',
            border: `1px solid ${windowOnly ? '#0070f3' : color.hairline}`,
            background: windowOnly ? '#e8f1ff' : color.canvas,
            color: windowOnly ? '#0053c2' : color.body,
            whiteSpace: 'nowrap',
          }}
        >
          窗内
        </button>
        {onlyIds != null && (
          <button
            type="button"
            onClick={onClearOnly}
            title="清除图上事件聚合筛选，恢复完整名录"
            style={{
              height: 20,
              padding: '0 8px',
              borderRadius: radius.pill,
              fontSize: 11,
              fontWeight: 600,
              font: 'inherit',
              cursor: 'pointer',
              border: '1px solid #0070f3',
              background: '#e8f1ff',
              color: '#0053c2',
              whiteSpace: 'nowrap',
            }}
          >
            {`图上聚合 ${onlyIds.length} 条 ×`}
          </button>
        )}
        <span style={{ marginLeft: 'auto' }}>
          {filtered.length > 3 && (
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded((prev) => !prev)}
              style={{ border: 'none', background: 'transparent', color: color.link, font: 'inherit', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', padding: 0, whiteSpace: 'nowrap' }}
            >
              {expanded ? '收起' : `全部 ${filtered.length} 条`}
            </button>
          )}
        </span>
      </div>
      <div style={{ display: 'grid', gap: 4, maxHeight: filtered.length > 8 ? 176 : undefined, overflowY: filtered.length > 8 ? 'auto' : undefined }}>
        {visible.map((ev) => {
          const marker = markerOf(ev);
          const selected = selectedEventId === ev.id;
          const rowLabel = `${eventRangeLabel(ev)} ${ev.label}`;
          return (
            <div
              key={ev.id}
              ref={(el) => { if (el) rowRefs.current.set(ev.id, el); else rowRefs.current.delete(ev.id); }}
              onMouseEnter={() => onHoverEvent(ev.id)}
              onMouseLeave={() => onHoverEvent(null)}
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: '3px 8px',
                padding: '3px 6px',
                borderRadius: radius.control,
                background: emphasizedId === ev.id ? '#e8f1ff' : selected ? color.canvasSoft2 : 'transparent',
                outline: selected ? `1px solid ${color.hairlineStrong}` : 'none',
                minWidth: 0,
              }}
            >
              <button
                type="button"
                className="tnum"
                aria-pressed={selected}
                aria-label={`查看事件读数 ${rowLabel}`}
                title="点击查看事件时段读数；再次点击关闭详情"
                onClick={() => onSelectEvent(selected ? null : ev.id)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', background: 'transparent', padding: 0, font: 'inherit', fontSize: 11.5, color: color.body, cursor: 'pointer', minWidth: 0, textAlign: 'left' }}
              >
                <span aria-hidden style={{ width: 8, height: 8, borderRadius: 2, background: colorOf(ev.typeId), flex: 'none' }} />
                <span style={{ fontVariantNumeric: 'tabular-nums', color: color.ink, fontWeight: 600, whiteSpace: 'nowrap' }}>{eventRangeLabel(ev)}</span>
                <span style={{ color: color.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.label}</span>
              </button>
              <span title={ev.source === 'composed'
                ? '本地补录草稿：保存在本浏览器，刷新 / 重开页签后仍可恢复'
                : ev.overridden
                  ? '预标事件已被本地覆写；「恢复」可回到当前 fixture 原值'
                  : '来自 fixture 的预标事件'}
              style={markerStyle(marker.tone)}>
                {marker.text}
              </span>
              {ev.sourceChanged && (
                <span title="fixture 预标已更新，与本地覆写基线不一致；可「编辑」后采用新预标或继续保留覆写" style={{ ...smallChipStyle, background: color.warningSoft, color: color.warningInk, border: `1px solid ${color.warning}`, flex: 'none' }}>
                  源已更新
                </span>
              )}
              <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, flex: 'none' }}>
                {ev.overridden && ev.sourceEventId && (
                  <button
                    type="button"
                    aria-label={`恢复预标 ${rowLabel}`}
                    title="删除本地覆写，回到当前 fixture 预标原值（可撤销）"
                    onClick={() => onRestorePreset(ev.sourceEventId as string)}
                    style={listActionButtonStyle(false)}
                  >
                    恢复
                  </button>
                )}
                <button
                  type="button"
                  aria-label={`编辑事件 ${rowLabel}`}
                  title={`编辑事件（类型 ${labelOf(ev.typeId)}）`}
                  onClick={() => onEditEvent(ev.id)}
                  style={listActionButtonStyle(false)}
                >
                  编辑
                </button>
                {ev.source === 'composed' && (
                  <button
                    type="button"
                    aria-label={`删除事件 ${rowLabel}`}
                    title="删除该本地事件（可撤销）"
                    onClick={() => onDeleteComposed(ev.id)}
                    style={listActionButtonStyle(true)}
                  >
                    ×
                  </button>
                )}
              </span>
            </div>
          );
        })}
        {visible.length === 0 && (
          <div role="status" style={{ fontSize: 11.5, color: color.mute, padding: '4px 0' }}>无匹配事件</div>
        )}
      </div>
    </div>
  );
}

const smallChipStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  height: 18,
  padding: '0 7px',
  borderRadius: radius.pill,
  fontSize: 10.5,
  fontWeight: 600,
  whiteSpace: 'nowrap',
};

function listActionButtonStyle(danger: boolean): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    height: 20,
    padding: '0 7px',
    borderRadius: radius.control,
    border: `1px solid ${danger ? color.hairlineStrong : color.hairline}`,
    background: color.canvas,
    color: danger ? color.error : color.body,
    font: 'inherit',
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  };
}
