// ============================================================
// 推演工作台 v2 · 层⑥推演纪要：每次调整自动留痕（时间 / 类型 / 操作人[演示名]/
// 内容 / 原因）；「生成纪要」输出独立 HTML 文档（Drawer 预览 + 下载，演示边界
// 显式标注）；「另存情景」占位（TODO 待拍板：正式实现需确认、版本与撤销）。
// ============================================================
import { useState } from 'react';
import { Button, Drawer } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { color, fontSize, radius, selectSoft, selectSoftInk, space } from '../../theme/tokens';
import type { WorkbenchFixture } from './workbenchFixture';
import { buildMemoHtml, type MemoEntry, type MemoType, type WorkbenchParams, type WorkbenchResult } from './workbenchModel';
import { fmtMillionUsd, fmtWan, SectionHead, workbenchCardStyle } from './WorkbenchBits';

const TYPE_STYLE: Record<MemoType, { bg: string; fg: string }> = {
  生成: { bg: color.canvasSoft2, fg: color.body },
  考量: { bg: selectSoft, fg: selectSoftInk },
  事件: { bg: color.warningSoft, fg: color.warningInk },
  'SI 计划': { bg: selectSoft, fg: selectSoftInk },
  手调: { bg: color.warningSoft, fg: color.warningInk },
  纪要: { bg: color.canvasSoft2, fg: color.body },
  情景: { bg: selectSoft, fg: selectSoftInk },
  重置: { bg: color.canvasSoft2, fg: color.body },
};

function TypeChip({ type }: { type: MemoType }) {
  const style = TYPE_STYLE[type];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', height: 18, padding: '0 7px', borderRadius: radius.pill, fontSize: 11, fontWeight: 600, background: style.bg, color: style.fg, whiteSpace: 'nowrap' }}>
      {type}
    </span>
  );
}

export default function MemoLedger({
  fixture,
  params,
  result,
  memo,
  onSaveScenario,
}: {
  fixture: WorkbenchFixture;
  params: WorkbenchParams;
  result: WorkbenchResult;
  memo: MemoEntry[];
  onSaveScenario: () => void;
}) {
  const [exportOpen, setExportOpen] = useState(false);

  const download = () => {
    // 浏览器环境导出独立 HTML；测试 / SSR 环境静默跳过。
    if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return;
    const html = buildMemoHtml({ fixture, params, result, memo });
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `PriceLens-量价预测推演纪要-${fixture.context.forecastRange.replace('–', '-')}.html`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const adjustedWeeks = result.weeks.filter((week) => week.inventoryAdjusted).map((week) => week.week);

  return (
    <section style={workbenchCardStyle}>
      <SectionHead
        title="推演纪要"
        hint="每次调整自动留痕（时间 / 类型 / 操作人[演示名] / 内容 / 原因）；手调必须填原因。图 + 当前考量 + 调整记录一张截图即会议结论。"
        extra={
          <>
            <Button onClick={onSaveScenario}>另存情景</Button>
            <Button type="primary" onClick={() => setExportOpen(true)}>生成纪要</Button>
          </>
        }
      />
      <div aria-live="polite" aria-relevant="additions" style={{ display: 'grid', maxHeight: 280, overflowY: 'auto' }}>
        {memo.map((entry) => (
          <div key={entry.id} style={{ display: 'flex', gap: space.md, padding: `${space.sm}px 2px`, borderBottom: `1px solid ${color.hairline}`, fontSize: 13, alignItems: 'flex-start' }}>
            <span className="mono tnum" style={{ width: 42, flex: 'none', color: color.mute, fontSize: 12, paddingTop: 1 }}>{entry.time}</span>
            <span style={{ flex: 'none', marginTop: 2 }}><TypeChip type={entry.type} /></span>
            <span style={{ color: color.body, minWidth: 0 }}>
              <b style={{ color: color.ink, fontWeight: 600 }}>{entry.operator}</b>
              {' · '}
              {entry.content}
              {entry.reason && <span style={{ display: 'block', fontSize: 12, color: color.mute, marginTop: 1 }}>{`原因：${entry.reason}`}</span>}
            </span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: space.sm, fontSize: fontSize.caption, lineHeight: 1.6, color: color.mute }}>
        纪要时间为演示时钟（不读系统时间）；操作人为演示名。另存情景为占位（待拍板：正式实现需确认、版本与撤销）。
      </div>

      <Drawer
        title="本期预测纪要（预览）"
        placement="right"
        width="min(480px, 100vw)"
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        styles={{ body: { padding: space.lg } }}
        footer={
          <div style={{ display: 'flex', gap: space.sm, justifyContent: 'flex-end' }}>
            <Button onClick={() => setExportOpen(false)}>关闭</Button>
            <Button type="primary" icon={<DownloadOutlined />} onClick={download}>下载独立 HTML</Button>
          </div>
        }
      >
        <div style={{ display: 'grid', gap: space.md, fontSize: 13, lineHeight: 1.7, color: color.body }}>
          <div style={{ padding: `${space.md - 2}px ${space.md}px`, borderRadius: radius.control, background: color.warningSoft, color: color.warningInk, fontSize: 12 }}>
            全部数值为演示模型输出（{fixture.meta.modelVersion}），不作为业务事实、统计结论或经营承诺。
          </div>
          <section>
            <h3 style={{ margin: '0 0 6px', fontSize: 13, color: color.ink }}>当前摘要</h3>
            <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 2 }}>
              <li className="tnum">{`预测期总销量（${fixture.context.forecastRange}）：${fmtWan(result.summary.totalSales)}（${result.summary.vsHistoryPct > 0 ? '+' : ''}${result.summary.vsHistoryPct}% vs ${fixture.context.historyRange}）`}</li>
              <li className="tnum">{`大促峰 W${result.summary.peak.weekNumber}：${fmtWan(result.summary.peak.value)}（${result.summary.peak.note}）`}</li>
              <li className="tnum">{`库存修正缺口：${result.summary.gap > 0 ? `−${fmtWan(result.summary.gap)}（${adjustedWeeks.join('、') || '未触发'}）` : '未触发'}`}</li>
              <li className="tnum">{`预测期销毛：${fmtMillionUsd(result.summary.forecastMargin)}（按月版本成本）`}</li>
            </ul>
          </section>
          <section>
            <h3 style={{ margin: '0 0 6px', fontSize: 13, color: color.ink }}>当前考量</h3>
            <div>{`大盘 Q4 环比 ${params.qoqDeclinePct}%（${params.qoqSource === 'ai' ? 'AI 判断' : '人工确认'}）；事件：${params.marketEvents.map((event) => `${event.label} ${event.magnitudePct > 0 ? '+' : ''}${event.magnitudePct}%（W${event.startWeek} 起）`).join('；') || '无'}。`}</div>
            <div style={{ marginTop: 4, color: color.mute, fontSize: 12 }}>{`理由：${params.rationale || '—'}`}</div>
          </section>
          <section>
            <h3 style={{ margin: '0 0 6px', fontSize: 13, color: color.ink }}>{`调整记录（${memo.length} 条）`}</h3>
            <div style={{ display: 'grid', gap: 6 }}>
              {memo.map((entry) => (
                <div key={entry.id} style={{ display: 'flex', gap: space.sm, fontSize: 12, alignItems: 'flex-start' }}>
                  <span className="mono tnum" style={{ flex: 'none', color: color.mute, width: 38 }}>{entry.time}</span>
                  <span style={{ flex: 'none' }}><TypeChip type={entry.type} /></span>
                  <span style={{ minWidth: 0 }}>
                    <b style={{ color: color.ink, fontWeight: 600 }}>{entry.operator}</b>
                    {' · '}
                    {entry.content}
                    {entry.reason && <span style={{ display: 'block', color: color.mute }}>{`原因：${entry.reason}`}</span>}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </Drawer>
    </section>
  );
}
