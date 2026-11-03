// ============================================================
// 推演工作台 v2 · 主图小事件录入弹窗（2026-11-03 晚纲领硬要求）：
// 主图可录入三类小事件（竞品上市 / 营销价促 / 自家品挤兑）；录入时以自然
// 方式弹出参考品当时的事实回放——四类解释场景（友商促销 / 自家营销 /
// 自家品挤兑 / 大促降价，全部为历史事实段），回放段幅度预填事件影响。
// ============================================================
import { useMemo, useState } from 'react';
import { Button, InputNumber, Modal, Segmented } from 'antd';
import { color, radius, space } from '../../theme/tokens';
import type { ProductEventSeed, WorkbenchFixture } from './workbenchFixture';
import { fmtSignedPct } from './WorkbenchBits';

const REPLAY_W = 300;
const REPLAY_H = 120;

/** 三类主图小事件（色系与参考卡事实锚/主图锚点一致）。 */
const EVENT_TYPES: Array<{ key: ProductEventSeed['type']; label: string; tone: string; hint: string }> = [
  { key: 'competitor-launch', label: '竞品上市', tone: color.link, hint: '竞品新机 / 促销放量，分流我司同期销量' },
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
    <svg viewBox={`0 0 ${REPLAY_W} ${REPLAY_H}`} width="100%" role="img" aria-label="参考品当时事实回放段" style={{ display: 'block', height: 'auto' }}>
      <line x1={left} y1={y(baseline)} x2={REPLAY_W - right} y2={y(baseline)} stroke={color.hairlineStrong} strokeDasharray="3 4" opacity={0.8} />
      <text x={left} y={y(baseline) - 3} fontSize={9} fill={color.mute}>事件前水平</text>
      <path d={path} fill="none" stroke={color.link} strokeWidth={2} />
      <line x1={left} y1={top + plotH} x2={REPLAY_W - right} y2={top + plotH} stroke={color.hairline} />
      <text x={left} y={REPLAY_H - 6} fontSize={9} fill={color.mute}>事件首周</text>
      <text x={REPLAY_W - right} y={REPLAY_H - 6} fontSize={9} fill={color.mute} textAnchor="end">+8 周</text>
    </svg>
  );
}

export default function EventReplayModal({
  fixture,
  forecastWeeks,
  onSubmit,
  onCancel,
}: {
  fixture: WorkbenchFixture;
  forecastWeeks: Array<{ week: string; weekNumber: number }>;
  onSubmit: (event: Omit<ProductEventSeed, 'id'>) => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState<ProductEventSeed['type']>('competitor-launch');
  const [weekNumber, setWeekNumber] = useState(forecastWeeks[0]?.weekNumber ?? 45);
  const [magnitude, setMagnitude] = useState<number | null>(null);

  // 该类型匹配的事实回放场景（四类解释场景按类型映射，可多条取第一条为默认）。
  const scenarios = useMemo(
    () => fixture.replayScenarios.filter((scenario) => scenario.match === type),
    [fixture.replayScenarios, type],
  );
  const scenario = scenarios[0] ?? null;
  const effectiveMagnitude = magnitude ?? scenario?.impactPct ?? -5;

  const typeMeta = EVENT_TYPES.find((item) => item.key === type);
  const defaultLabel = type === 'competitor-launch'
    ? 'Galaxy S26 Ultra 上市'
    : type === 'own-promo'
      ? '官方电商节价促'
      : '自家新品档位重叠';

  return (
    <Modal
      title="录入主图小事件 · 参考品事实回放"
      open
      onCancel={onCancel}
      width={720}
      footer={
        <div style={{ display: 'flex', gap: space.sm, justifyContent: 'flex-end' }}>
          <Button onClick={onCancel}>取消</Button>
          <Button
            type="primary"
            disabled={!scenario}
            onClick={() => {
              if (!scenario) return;
              onSubmit({
                type,
                label: defaultLabel,
                week: weekNumber,
                magnitudePct: effectiveMagnitude,
                replayId: scenario.id,
              });
            }}
          >
            录入主图（按回放段幅度修正该周）
          </Button>
        </div>
      }
    >
      <div style={{ display: 'grid', gap: space.md, paddingTop: space.sm }}>
        <Segmented
          aria-label="选择事件类型"
          value={type}
          onChange={(value) => { setType(value as ProductEventSeed['type']); setMagnitude(null); }}
          options={EVENT_TYPES.map((item) => ({ value: item.key, label: item.label }))}
        />
        <div style={{ fontSize: 11.5, color: color.mute }}>
          {typeMeta?.hint} · 大盘行业级事件在大盘卡录入；此处只收产品级小事件。
        </div>

        {/* 事实回放（自然弹出）：四类解释场景按类型匹配，全部为历史事实段 */}
        {scenario && (
          <div style={{ border: `1px solid ${color.hairline}`, borderRadius: radius.card, padding: space.md, background: color.canvasSoft, display: 'grid', gap: space.sm }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: space.sm, flexWrap: 'wrap' }}>
              <b style={{ fontSize: 13, color: color.ink }}>{`事实回放 · ${scenario.title}`}</b>
              <span style={{ fontSize: 11, color: color.mute }}>{scenario.refLabel}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: space.md, alignItems: 'start' }}>
              <ReplayChart points={scenario.points} baseline={scenario.points[0]} />
              <div style={{ fontSize: 12, lineHeight: 1.7, color: color.body }}>
                {scenario.desc}
                <div style={{ marginTop: 6, padding: '5px 8px', borderRadius: 6, background: color.warningSoft, color: color.warningInk, fontSize: 11.5 }}>
                  {scenario.impactText}
                </div>
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.md, alignItems: 'center' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: color.body }}>
            生效周
            <InputNumber
              aria-label="事件生效周（W45–W52）"
              min={45}
              max={52}
              step={1}
              precision={0}
              value={weekNumber}
              onChange={(value) => { if (value != null) setWeekNumber(Math.max(45, Math.min(52, Number(value)))); }}
              style={{ width: 84 }}
            />
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: color.body }}>
            影响幅度（按回放段预填，可改）
            <InputNumber
              aria-label="事件影响幅度（%）"
              min={-30}
              max={60}
              step={1}
              precision={0}
              value={effectiveMagnitude}
              formatter={(value) => (value == null ? '' : `${value}%`)}
              parser={(text) => Number((text ?? '').replace('%', ''))}
              onChange={(value) => setMagnitude(value == null ? null : Math.max(-30, Math.min(60, Number(value))))}
              style={{ width: 92 }}
            />
          </label>
          <span style={{ fontSize: 11, color: color.mute }}>
            录入后主图该周画锚点（{EVENT_TYPES.find((item) => item.key === type)?.label}），按幅度局部修正预测；可在图下名录删除。
          </span>
        </div>
      </div>
    </Modal>
  );
}
