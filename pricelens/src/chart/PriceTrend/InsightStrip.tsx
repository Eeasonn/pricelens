import { useState } from 'react';
import { Popover, Tooltip } from 'antd';
import { CloseOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { useAgent } from '../../state/AgentContext';
import { color, font, fontSize, radius, shadow, space } from '../../theme/tokens';
import type { Insight } from './insights';

export const INSIGHT_DISMISS_KEY = 'LPL3.ui.insightDismissed';
const MAX_VISIBLE = 1;
export const INSIGHT_FOOTNOTE = '规则提示：由当前图表同源数据按固定阈值计算，不调用模型；解释与建议请用「追问」';

function readDismissed(): string[] {
  try {
    const raw = window.sessionStorage.getItem(INSIGHT_DISMISS_KEY);
    const v: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeDismissed(ids: string[]): void {
  try {
    window.sessionStorage.setItem(INSIGHT_DISMISS_KEY, JSON.stringify(ids));
  } catch {
    /* 隐私模式等写入失败：本次渲染内仍隐藏 */
  }
}

/** 追问 prompt（与预警页「结构化上下文」同一写法） */
export function insightPrompt(it: Insight): string {
  const ctx = {
    kind: it.kind,
    bucketId: it.bucketId,
    series: it.seriesLabel,
    ...(it.otherLabel ? { base: it.otherLabel } : {}),
    figures: it.figures,
    evidence: it.evidence,
  };
  return `请解释这条分析提示并给出核查建议：${it.title}。结构化上下文：${JSON.stringify(ctx)}`;
}

const actionBtn = {
  padding: 0,
  border: 'none',
  background: 'none',
  font: 'inherit',
  fontSize: fontSize.caption,
  color: color.link,
  cursor: 'pointer',
} as const;

function EvidencePopover({ insight, open, onOpenChange }: {
  insight: Insight;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Popover
      trigger="click"
      placement="topLeft"
      arrow={false}
      open={open}
      onOpenChange={onOpenChange}
      destroyOnHidden
      styles={{ body: { padding: 0, width: 440, maxWidth: 'calc(100vw - 32px)' } }}
      content={
        <section role="dialog" aria-label={`计算过程：${insight.title}`} style={{ padding: space.base }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space.md, paddingBottom: space.sm, marginBottom: space.sm, borderBottom: `1px solid ${color.hairline}` }}>
            <h3 style={{ margin: 0, fontSize: fontSize.bodySm, lineHeight: '20px', color: color.ink }}>计算过程</h3>
            <button type="button" aria-label="关闭计算过程" onClick={() => onOpenChange(false)} style={{ ...actionBtn, color: color.mute }}>
              <CloseOutlined aria-hidden />
            </button>
          </div>
          <div style={{ marginBottom: space.md, color: color.body, fontSize: fontSize.caption, lineHeight: '20px' }}>{insight.title}</div>
          <ol aria-label="计算步骤" style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: space.sm, maxHeight: 320, overflowY: 'auto' }}>
            {insight.evidence.map((e) => (
              <li key={e.step} style={{ display: 'grid', gridTemplateColumns: '40px minmax(0, 1fr)', gap: space.sm, fontSize: fontSize.caption, lineHeight: '20px', color: color.body }}>
                <span style={{ fontWeight: 600 }}>{e.step}</span>
                <span className="tnum" style={{ fontFamily: font.family, fontVariantNumeric: 'tabular-nums', minWidth: 0, overflowWrap: 'anywhere' }}>{e.text}</span>
              </li>
            ))}
          </ol>
        </section>
      }
    >
      <button type="button" aria-label={`计算过程：${insight.title}`} aria-haspopup="dialog" aria-expanded={open} style={actionBtn}>
        计算过程
      </button>
    </Popover>
  );
}

export default function InsightStrip(props: {
  groupTitle: string;
  insights: Insight[];
  onLocate: (bucketId: string) => void;
}) {
  const { groupTitle, insights, onLocate } = props;
  // 无 AgentProvider（孤立渲染宽表的单测/嵌入场景）时「追问」降级为不可用，不整表崩溃
  let openAgent: ReturnType<typeof useAgent>['openAgent'] | null = null;
  try {
    openAgent = useAgent().openAgent;
  } catch {
    openAgent = null;
  }
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);
  const [expanded, setExpanded] = useState(false);
  const [openEvidence, setOpenEvidence] = useState<string | null>(null);

  const visible = insights.filter((it) => !dismissed.includes(it.id));
  if (visible.length === 0) return null;
  const shown = expanded ? visible : visible.slice(0, MAX_VISIBLE);
  const hiddenCount = visible.length - MAX_VISIBLE;

  const dismiss = (id: string): void => {
    const next = Array.from(new Set([...readDismissed(), ...dismissed, id]));
    writeDismissed(next);
    setDismissed(next);
  };

  return (
    <div role="region" aria-label={`${groupTitle} 分析提示`} style={{ marginBottom: space.md }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: space.xs, marginBottom: space.xs, fontSize: fontSize.caption, color: color.body }}>
        <span style={{ fontWeight: 600, color: color.ink }}>分析提示</span>
        <Tooltip title={INSIGHT_FOOTNOTE}>
          <button
            type="button"
            aria-label="分析提示规则说明"
            style={{ display: 'inline-flex', alignItems: 'center', padding: 0, border: 'none', background: 'none', cursor: 'help', color: color.mute }}
          >
            <QuestionCircleOutlined style={{ fontSize: fontSize.caption }} />
          </button>
        </Tooltip>
        {hiddenCount > 0 && (
          <button type="button" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)} style={{ ...actionBtn, marginLeft: 'auto' }}>
            {expanded ? '收起' : `另有 ${hiddenCount} 条`}
          </button>
        )}
      </div>
      <div style={{ display: 'grid', gap: space.sm }}>
        {shown.map((it) => (
          <div
            key={it.id}
            data-insight-kind={it.kind}
            style={{
              padding: `${space.sm}px ${space.md}px`,
              background: color.canvas,
              borderRadius: radius.card,
              boxShadow: shadow.l1,
              display: 'grid',
              gap: space.xs,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: space.sm }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: fontSize.bodySm, fontWeight: 600, lineHeight: '20px', color: color.ink }}>{it.title}</span>
              <button
                type="button"
                aria-label={`忽略：${it.title}`}
                title="本次会话内不再显示"
                onClick={() => dismiss(it.id)}
                style={{ display: 'inline-flex', alignItems: 'center', padding: space.xs, border: 'none', background: 'none', cursor: 'pointer', color: color.mute, flexShrink: 0 }}
              >
                <CloseOutlined aria-hidden style={{ fontSize: fontSize.caption }} />
              </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: `${space.xs}px ${space.base}px` }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: space.md, rowGap: space.xs, fontSize: fontSize.caption, color: color.mute }}>
                {it.figures.map((f) => (
                  <span key={f.label} style={{ whiteSpace: 'nowrap' }}>
                    {f.label}{' '}
                    <span className="tnum" style={{ fontFamily: font.family, fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: color.body }}>
                      {f.value}
                    </span>
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: space.md }}>
                <button type="button" aria-label={`定位：${it.title}`} onClick={() => onLocate(it.bucketId)} style={actionBtn}>
                  定位
                </button>
                <EvidencePopover insight={it} open={openEvidence === it.id} onOpenChange={(open) => setOpenEvidence(open ? it.id : null)} />
                {openAgent && (
                  <button type="button" aria-label={`追问：${it.title}`} onClick={() => openAgent?.('dock', insightPrompt(it))} style={actionBtn}>
                    追问
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
