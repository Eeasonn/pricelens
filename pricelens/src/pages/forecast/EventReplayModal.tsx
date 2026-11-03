// ============================================================
// 推演工作台 v2 · 主图小事件录入弹窗（WP3 生产化版）：
// 主图可录入三类产品级小事件（竞品上市 / 营销价促 / 自家品挤兑）；
// 录入时弹出参考品历史事实回放——四类解释场景（友商促销 / 自家营销 /
// 自家品挤兑 / 大促降价，全部为历史事实段）；同类型多场景经
// 「选择历史回放场景」下拉切换，切类型 / 场景时幅度重取该场景预填值。
// 窄屏安全：弹窗宽度受视口约束、回放区 auto-fit 可单列、
// 图表 maxWidth 100%、footer 不横向出屏。
// ============================================================
import { useMemo, useState } from 'react';
import { Button, InputNumber, Modal, Segmented, Select } from 'antd';
import { color, radius, space } from '../../theme/tokens';
import type { ProductEventSeed, WorkbenchFixture } from './workbenchFixture';

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
  const [scenarioId, setScenarioId] = useState<string | null>(null);
  const [weekNumber, setWeekNumber] = useState(forecastWeeks[0]?.weekNumber ?? 45);
  const [magnitude, setMagnitude] = useState<number | null>(null);

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
  // 教学说明收进 title（不占正文密度）。
  const guideTitle = `生效后主图该周画锚点（${typeMeta?.label ?? ''}），按幅度局部修正预测；可在主图图下名录删除。幅度按回放段预填，可改。`;

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
            应用事件
          </Button>
        </div>
      }
    >
      <div style={{ display: 'grid', gap: space.md, paddingTop: space.sm, minWidth: 0 }}>
        <Segmented
          aria-label="选择事件类型"
          value={type}
          onChange={(value) => { setType(value as ProductEventSeed['type']); setScenarioId(null); setMagnitude(null); }}
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

        <div title={guideTitle} style={{ display: 'flex', flexWrap: 'wrap', gap: space.md, alignItems: 'center', minWidth: 0 }}>
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
          <label title={guideTitle} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: color.body }}>
            影响幅度
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
        </div>
      </div>
    </Modal>
  );
}
