// ============================================================
// 明细表「分析提示」条（2026-11-28，Eason 拍板）：每组表体上方一条，展示
// insights.ts 按固定阈值算出的提示卡（最多 3 张，其余收进「另有 N 条」）。
// 卡内动作：定位（高亮并滚到对应时间列）/ 计算过程（就地展开 输入→筛选→
// 公式→舍入→输出）/ 追问（交给 Agent 对话，仅在用户点击时发起）/ 忽略（本会话
// 隐藏，sessionStorage 记账）。规则见 .impeccable/surfaces/detail-insight-strip.md
// ============================================================
import { useState } from 'react';
import { Tooltip } from 'antd';
import { CloseOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { useAgent } from '../../state/AgentContext';
import { color, font, radius, shadow, space } from '../../theme/tokens';
import type { Insight } from './insights';

export const INSIGHT_DISMISS_KEY = 'LPL3.ui.insightDismissed';
const MAX_VISIBLE = 3;
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
  fontSize: 12,
  color: color.link,
  cursor: 'pointer',
} as const;

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
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, fontSize: 12, color: color.body }}>
        <span style={{ fontWeight: 600, color: color.ink }}>分析提示</span>
        <span className="tnum" style={{ fontFamily: font.family, fontVariantNumeric: 'tabular-nums', color: color.mute }}>
          {visible.length}
        </span>
        <Tooltip title={INSIGHT_FOOTNOTE}>
          <button
            type="button"
            aria-label="分析提示规则说明"
            style={{ display: 'inline-flex', alignItems: 'center', padding: 0, border: 'none', background: 'none', cursor: 'help', color: color.mute }}
          >
            <QuestionCircleOutlined style={{ fontSize: 12 }} />
          </button>
        </Tooltip>
        {hiddenCount > 0 && (
          <button type="button" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)} style={{ ...actionBtn, marginLeft: 4 }}>
            {expanded ? '收起' : `另有 ${hiddenCount} 条`}
          </button>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.sm }}>
        {shown.map((it) => {
          const evOpen = openEvidence === it.id;
          return (
            <div
              key={it.id}
              data-insight-kind={it.kind}
              style={{
                flex: '1 1 240px',
                minWidth: 240,
                maxWidth: 420,
                padding: '8px 10px',
                background: color.canvas,
                borderRadius: radius.card,
                boxShadow: shadow.l1,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, lineHeight: '18px', color: color.ink }}>{it.title}</span>
                <button
                  type="button"
                  aria-label={`忽略：${it.title}`}
                  title="本次会话内不再显示"
                  onClick={() => dismiss(it.id)}
                  style={{ display: 'inline-flex', alignItems: 'center', padding: 2, border: 'none', background: 'none', cursor: 'pointer', color: color.mute, flexShrink: 0 }}
                >
                  <CloseOutlined style={{ fontSize: 10 }} />
                </button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 12, rowGap: 2, fontSize: 11, color: color.mute }}>
                {it.figures.map((f) => (
                  <span key={f.label} style={{ whiteSpace: 'nowrap' }}>
                    {f.label}{' '}
                    <span className="tnum" style={{ fontFamily: font.family, fontVariantNumeric: 'tabular-nums', fontSize: 12, fontWeight: 600, color: color.body }}>
                      {f.value}
                    </span>
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <button type="button" aria-label={`定位：${it.title}`} onClick={() => onLocate(it.bucketId)} style={actionBtn}>
                  定位
                </button>
                <button
                  type="button"
                  aria-label={`计算过程：${it.title}`}
                  aria-expanded={evOpen}
                  onClick={() => setOpenEvidence(evOpen ? null : it.id)}
                  style={actionBtn}
                >
                  计算过程
                </button>
                {openAgent && (
                  <button type="button" aria-label={`追问：${it.title}`} onClick={() => openAgent?.('dock', insightPrompt(it))} style={actionBtn}>
                    追问
                  </button>
                )}
              </div>
              {evOpen && (
                <ol aria-label={`计算过程：${it.title}`} style={{ margin: 0, padding: '6px 0 0', listStyle: 'none', borderTop: `1px solid ${color.hairline}`, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {it.evidence.map((e) => (
                    <li key={e.step} style={{ display: 'flex', gap: 6, fontSize: 11, lineHeight: '16px', color: color.body }}>
                      <span style={{ flexShrink: 0, fontWeight: 600, color: color.mute }}>{e.step}</span>
                      <span className="tnum" style={{ fontFamily: font.family, fontVariantNumeric: 'tabular-nums', minWidth: 0 }}>{e.text}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
