// ============================================================
// 推演工作台 v2 · 层④库存验证卡组件测试（jsdom）：
// 覆盖 WP4：SI=0（单月 0 / 全 0）、库存截断周微痕读 supplyCapped、
// 手调覆盖截断周（截断事实仍在）、无修正状态、规则文案收敛（阈值未核定 chip +
// min 公式收 title）、判定列表按修正周各自 health 行、输出与右轴万台单位统一、
// 图例显隐与 SI 键盘输入保留。
// 2026-11-04 评审图面精简：图上只留「库存柱 + 渠道 DOS」——删全流程 DOS 线
//（数值收进库存柱悬停 title）、删 SI ▼ 三角、删 DOS 50 参考格线；SI 移至
// 卡头页签格子输入（aria 与 live/commit 口不变）。修正段「把握大 ±2%」徽标
// 随评审 1b（置信区间提示不必要）退役 → 中性「修正段 · 波动参考 ±2%」chip。
// ============================================================
// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import InventoryValidationCard from '../InventoryValidationCard';
import { workbenchFixture } from '../workbenchFixture';
import {
  DOS_BAND,
  baseWorkbenchParams,
  computeWorkbench,
  setManualAdjustment,
  type WorkbenchParams,
  type WorkbenchResult,
} from '../workbenchModel';
import { fmtWan } from '../WorkbenchBits';
import { niceCeil } from '../../../dataModel/volume';
import { color } from '../../../theme/tokens';

const fixture = workbenchFixture;
const base = baseWorkbenchParams(fixture);

/** 渲染库存卡：live 回调真实写回 params（与页面同链路），commit 用 spy 承接（WP6 接草稿）。 */
const renderCard = (initial: WorkbenchParams = base) => {
  const onSiMonthLive = vi.fn();
  const onSiMonthCommit = vi.fn();
  function Harness() {
    const [params, setParams] = useState(initial);
    return (
      <InventoryValidationCard
        fixture={fixture}
        params={params}
        result={computeWorkbench(fixture, params)}
        onSiMonthLive={(monthKey, units) => {
          onSiMonthLive(monthKey, units);
          setParams((prev) => ({ ...prev, siPlanMonthly: { ...prev.siPlanMonthly, [monthKey]: units } }));
        }}
        onSiMonthCommit={onSiMonthCommit}
      />
    );
  }
  const utils = render(<Harness />);
  const result: WorkbenchResult = computeWorkbench(fixture, initial);
  return { ...utils, result, onSiMonthLive, onSiMonthCommit };
};

/** 输出框「判定」行：每个修正周一条（tnum 行，含「修正至」或人工手调读数）。 */
const verdictRowsOf = (container: HTMLElement): string[] =>
  Array.from(container.querySelectorAll('span.tnum'))
    .map((el) => el.textContent ?? '')
    .filter((text) => text.includes('→') && (text.includes('按可售量修正至') || text.includes('人工手调')));

const siInputOf = (container: HTMLElement, monthLabel: string): HTMLInputElement =>
  container.querySelector(`input[aria-label="${monthLabel} SI 计划（千台/月）"]`) as HTMLInputElement;

afterEach(cleanup);

describe('库存验证卡 · 基准截断（输出只讲结果 + 万台单位）', () => {
  it('W50–W52 截断：输出只讲结果，无「刚性砍 / 中间过程 / 主图只显最终」话术', () => {
    const { container, result } = renderCard();
    const cappedWeeks = result.weeks.filter((week) => week.status === 'forecast' && week.supplyCapped);
    expect(cappedWeeks.map((week) => week.weekNumber)).toEqual([50, 51, 52]);
    const text = container.textContent ?? '';
    expect(text).toContain('W50 起');
    expect(text).toContain('按可售量修正');
    expect(text).toContain('修正周');
    for (const banned of ['刚性', '中间计算过程', '主图只显最终', '砍']) {
      expect(text).not.toContain(banned);
    }
  });

  it('判定列表：每个修正周一条、各带自己的周号与修正读数（不共用第一周原因）', () => {
    const { container, result } = renderCard();
    const rows = verdictRowsOf(container);
    const cappedWeeks = result.weeks.filter((week) => week.status === 'forecast' && week.supplyCapped);
    expect(rows.length).toBe(cappedWeeks.length);
    cappedWeeks.forEach((week, index) => {
      const row = rows[index];
      expect(row.startsWith(week.week)).toBe(true);
      expect(row).toContain(`修正至 ${fmtWan(week.final ?? 0)}`);
    });
    // 各行只讲自己：W50 行不夹带后续周的读数
    const w50Row = rows.find((row) => row.startsWith('W50')) ?? '';
    expect(w50Row).not.toContain('W51');
    expect(w50Row).not.toContain('W52');
  });

  it('修正段波动参考中性化：chip「修正段 · 波动参考 ±2%」，无「把握」话术（评审 1b：置信区间提示不必要）', () => {
    const { container } = renderCard();
    const text = container.textContent ?? '';
    expect(text).toContain('修正段 · 波动参考 ±2%');
    expect(text).not.toContain('把握');
    // 口径收 title：非统计置信区间
    const chip = Array.from(container.querySelectorAll('span[title]')).find((el) => (el.textContent ?? '') === '修正段 · 波动参考 ±2%');
    expect(chip?.getAttribute('title')).toContain('非统计置信区间');
  });

  it('单位统一：右轴与输出为万台，图形 tooltip 不再出现 K 台 / 千分位「台」', () => {
    const { container } = renderCard();
    const text = container.textContent ?? '';
    expect(text).toContain('万台');
    expect(text).not.toMatch(/\d(\.\d+)?K\s*台/);
    expect(text).not.toMatch(/\d{1,3}(,\d{3})+\s*台/);
    // 右轴刻度：数字不带 K，轴标注万台
    const svgTexts = Array.from(container.querySelectorAll('svg text')).map((node) => node.textContent ?? '');
    expect(svgTexts.some((label) => label === '万台')).toBe(true);
    expect(svgTexts.some((label) => /K/.test(label))).toBe(false);
    // 库存柱与 SI 的 tooltip 均为万台
    const titles = Array.from(container.querySelectorAll('svg title')).map((node) => node.textContent ?? '');
    for (const title of titles.filter((t) => t.includes('渠道库存') || t.includes('SI'))) {
      expect(title).toContain('万台');
      expect(title).not.toMatch(/K/);
    }
  });
});

describe('库存验证卡 · SI=0 极端输入', () => {
  it('单月 0（11 月 SI=0）：W46 起修正，输入框显示 0', () => {
    const params: WorkbenchParams = { ...base, siPlanMonthly: { '2026-11': 0, '2026-12': base.siPlanMonthly['2026-12'] } };
    const { container, result } = renderCard(params);
    expect(result.firstAdjustedWeek).toBe(46);
    expect(container.textContent).toContain('W46 起');
    expect((siInputOf(container, '11 月（W45–W48）').value)).toBe('0');
  });

  it('全 0：修正周逐条判定（各自读数），W52 修正至 0', () => {
    const params: WorkbenchParams = { ...base, siPlanMonthly: { '2026-11': 0, '2026-12': 0 } };
    const { container, result } = renderCard(params);
    const cappedWeeks = result.weeks.filter((week) => week.status === 'forecast' && week.supplyCapped);
    expect(result.firstAdjustedWeek).toBe(46);
    expect(cappedWeeks.length).toBe(7);
    const rows = verdictRowsOf(container);
    expect(rows.length).toBe(cappedWeeks.length);
    const w46Row = rows.find((row) => row.startsWith('W46')) ?? '';
    const w47Row = rows.find((row) => row.startsWith('W47')) ?? '';
    expect(w46Row).toContain(`修正至 ${fmtWan(result.weeks.find((week) => week.weekNumber === 46)?.final ?? 0)}`);
    expect(w47Row).toContain(`修正至 ${fmtWan(result.weeks.find((week) => week.weekNumber === 47)?.final ?? 0)}`);
    expect(w46Row).not.toContain('修正至 0.0 万台');
    expect(w47Row).toContain('修正至 0.0 万台');
  });
});

describe('库存验证卡 · 手调覆盖截断周（supplyCapped 仍在）', () => {
  it('手调 W50：截断事实保留（微痕与判定仍标 W50 起），该周判定写人工手调', () => {
    const tuned = setManualAdjustment(base, 50, 50000, '会议结论上调') as WorkbenchParams;
    const { container, result } = renderCard(tuned);
    const w50 = result.weeks.find((week) => week.weekNumber === 50);
    expect(w50?.supplyCapped).toBe(true);
    expect(w50?.capped).toBe(false);
    // 微痕读 supplyCapped：aria 与修正起点仍识别 W50
    const svg = container.querySelector('svg[role="img"]') as SVGSVGElement;
    expect(svg.getAttribute('aria-label')).toContain('W50 起');
    expect((container.textContent ?? '')).toContain('W50 起修正');
    // 修正段中性波动参考 chip 仍在（评审 1b：不用「把握」话术）
    expect((container.textContent ?? '')).toContain('修正段 · 波动参考 ±2%');
    // W50 判定行写人工手调，W51/W52 仍写按可售量修正
    const manualRows = verdictRowsOf(container).filter((row) => row.startsWith('W50'));
    expect(manualRows.length).toBe(1);
    expect(manualRows[0]).toContain('人工手调');
    expect(manualRows[0]).toContain(fmtWan(50000));
  });
});

describe('库存验证卡 · 无修正状态', () => {
  it('SI 充足：显示「库存可支撑」，不挂 ±2% 徽标，无判定行', () => {
    const params: WorkbenchParams = { ...base, siPlanMonthly: { ...base.siPlanMonthly, '2026-12': 400000 } };
    const { container, result } = renderCard(params);
    expect(result.firstAdjustedWeek).toBeNull();
    const text = container.textContent ?? '';
    expect(text).toContain('库存可支撑');
    expect(text).toContain('当前未触发');
    expect(text).not.toContain('把握');
    expect(text).not.toContain('波动参考 ±2%');
    expect(verdictRowsOf(container).length).toBe(0);
    const svg = container.querySelector('svg[role="img"]') as SVGSVGElement;
    expect(svg.getAttribute('aria-label')).toContain('库存可支撑');
  });
});

describe('库存验证卡 · 规则文案收敛', () => {
  it('规则一行展示 + 「阈值未核定」chip；无「待拍板」；min 公式只在 title', () => {
    const { container } = renderCard();
    const text = container.textContent ?? '';
    expect(text).toContain('DOS 70–90 天 · 降幅预警 20%／30%');
    expect(text).toContain('阈值未核定');
    expect(text).not.toContain('待拍板');
    // min 公式收进 title，不出现在正文
    expect(text).not.toContain('min(');
    const titled = container.querySelectorAll('[title*="min(基线 SO"]');
    expect(titled.length).toBeGreaterThan(0);
  });
});

describe('库存验证卡 · 图面精简（2026-11-04 评审：只留库存柱 + 渠道 DOS）', () => {
  it('删全流程 DOS 线与 SI ▼ 三角：图上 path 只剩渠道 DOS 双段（蓝实 / 蓝虚）', () => {
    const { container } = renderCard();
    const chart = container.querySelector('svg[role="img"]') as SVGSVGElement;
    const paths = Array.from(chart.querySelectorAll('path'));
    expect(paths.length).toBe(2);
    for (const path of paths) {
      expect(path.getAttribute('stroke')).toBe(color.link);
    }
  });

  it('SI 不上图：图例只剩「渠道库存（右轴）+ 渠道 DOS」两项，无「SI ▼」', () => {
    const { container } = renderCard();
    const legendLabels = Array.from(container.querySelectorAll('button[aria-pressed]'))
      .map((button) => button.textContent ?? '');
    expect(legendLabels).toEqual(['渠道库存（右轴）', '渠道 DOS']);
    expect(container.textContent).not.toContain('SI ▼');
  });

  it('删 DOS 50 参考格线：左轴只标 0 与上限；健康带 70–90 天保留', () => {
    const { container, result } = renderCard();
    const leftLabels = Array.from(container.querySelectorAll('svg text[text-anchor="end"]'))
      .map((node) => node.textContent ?? '')
      .filter((label) => /^\d+$/.test(label));
    const dosMax = Math.max(
      niceCeil(Math.max(...result.weeks.map((week) => week.channelDos))),
      DOS_BAND.max + 1,
    );
    expect(leftLabels).toEqual(['0', String(Math.round(dosMax))]);
    expect(leftLabels).not.toContain('50');
    const text = container.textContent ?? '';
    expect(text).toContain('70 天');
    expect(text).toContain('90 天');
  });

  it('SI 移至页签格子输入：输入行在卡头区（SVG 之前），月格子与 aria 语义保留', () => {
    const { container } = renderCard();
    const row = container.querySelector('[data-si-cell-row]') as HTMLElement | null;
    expect(row).not.toBeNull();
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    // 卡头区 = SI 格子行在 SVG 之前（旧「人工 SI 计划（按月）」图下块已删）
    expect(row!.compareDocumentPosition(svg!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(row!.querySelector('input[aria-label="11 月（W45–W48） SI 计划（千台/月）"]')).not.toBeNull();
    expect(row!.textContent).toContain('千台/月');
    expect(container.textContent).not.toContain('人工 SI 计划（按月）');
  });

  it('选中点弹全流程 DOS 数值提示：库存柱悬停 title 含全流程 DOS 与 SI（线不上图）', () => {
    const { container } = renderCard();
    const titles = Array.from(container.querySelectorAll('svg title')).map((node) => node.textContent ?? '');
    expect(titles.some((title) => title.includes('全流程 DOS'))).toBe(true);
    expect(titles.some((title) => title.includes('SI ') && title.includes('万台'))).toBe(true);
    // aria 同步声明「全流程 DOS 不上图，悬停读数值」
    const svg = container.querySelector('svg[role="img"]') as SVGSVGElement;
    expect(svg.getAttribute('aria-label')).toContain('全流程 DOS 不上图');
  });
});

describe('库存验证卡 · 链路指示条（A3）', () => {
  const stepLabelsOf = (container: HTMLElement): string[] =>
    Array.from(container.querySelectorAll('[data-flow-step]')).map((el) => el.getAttribute('data-flow-step') ?? '');

  it('五节点定序完整：主图基线 SO → 反算 DOS/库存 → 健康判定 → 上限修正 → 回写主图', () => {
    const { container } = renderCard();
    expect(stepLabelsOf(container)).toEqual(['主图基线 SO', '反算 DOS/库存', '健康判定', '上限修正', '回写主图']);
    const bar = container.querySelector('[data-flow-bar]') as HTMLElement;
    expect(bar).not.toBeNull();
    expect(bar.getAttribute('aria-label')).toContain('主图基线 SO → 反算 DOS/库存 → 健康判定 → 上限修正 → 回写主图');
  });

  it('基准（W50–W52 截断）：「上限修正」琥珀点亮注 W50 起，「回写主图」激活', () => {
    const { container } = renderCard();
    const cap = container.querySelector('[data-flow-step="上限修正"]') as HTMLElement;
    expect(cap.getAttribute('data-state')).toBe('amber');
    expect(cap.textContent).toContain('W50 起');
    // min 公式收节点 title
    expect(cap.getAttribute('title')).toContain('min(基线 SO, 可售)');
    const write = container.querySelector('[data-flow-step="回写主图"]') as HTMLElement;
    expect(write.getAttribute('data-state')).toBe('active');
    expect(write.textContent).not.toContain('未触发');
  });

  it('SI=0 单月（11 月）：点亮注 W46 起', () => {
    const params: WorkbenchParams = { ...base, siPlanMonthly: { '2026-11': 0, '2026-12': base.siPlanMonthly['2026-12'] } };
    const { container } = renderCard(params);
    const cap = container.querySelector('[data-flow-step="上限修正"]') as HTMLElement;
    expect(cap.getAttribute('data-state')).toBe('amber');
    expect(cap.textContent).toContain('W46 起');
  });

  it('SI 充足（无修正）：「上限修正」不点亮，「回写主图 · 未触发」灰化', () => {
    const params: WorkbenchParams = { ...base, siPlanMonthly: { ...base.siPlanMonthly, '2026-12': 400000 } };
    const { container } = renderCard(params);
    const cap = container.querySelector('[data-flow-step="上限修正"]') as HTMLElement;
    expect(cap.getAttribute('data-state')).toBe('base');
    expect(cap.textContent).not.toContain('起');
    const write = container.querySelector('[data-flow-step="回写主图"]') as HTMLElement;
    expect(write.getAttribute('data-state')).toBe('muted');
    expect(write.textContent).toContain('未触发');
  });
});

describe('库存验证卡 · 图例显隐与 SI 键盘输入保留', () => {
  it('图例点击切换显隐（aria-pressed），隐藏渠道 DOS 后双线移除', () => {
    const { container } = renderCard();
    const dosButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === '渠道 DOS');
    expect(dosButton).toBeDefined();
    expect(dosButton!.getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelectorAll('path[stroke="#0070f3"]').length).toBeGreaterThan(0);
    fireEvent.click(dosButton!);
    expect(dosButton!.getAttribute('aria-pressed')).toBe('false');
    expect(container.querySelectorAll('path[stroke="#0070f3"]').length).toBe(0);
  });

  it('SI 月输入：live 回调即时生效，blur / Enter 走 commit 口', () => {
    const { container, onSiMonthLive, onSiMonthCommit } = renderCard();
    const input = siInputOf(container, '11 月（W45–W48）');
    fireEvent.change(input, { target: { value: '30' } });
    expect(onSiMonthLive).toHaveBeenCalledWith('2026-11', 30000);
    fireEvent.blur(input);
    expect(onSiMonthCommit).toHaveBeenCalledWith('2026-11', 30000);
    const decInput = siInputOf(container, '12 月（W49–W52）');
    fireEvent.change(decInput, { target: { value: '5' } });
    expect(onSiMonthLive).toHaveBeenCalledWith('2026-12', 5000);
    // Enter = blur 提交（真机键入即聚焦；jsdom 需真实 focus，blur() 才会触发 blur 链）
    decInput.focus();
    fireEvent.keyDown(decInput, { key: 'Enter' });
    expect(onSiMonthCommit).toHaveBeenCalledWith('2026-12', 5000);
  });
});
