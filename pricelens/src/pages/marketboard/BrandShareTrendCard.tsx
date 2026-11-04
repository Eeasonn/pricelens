// ============================================================
// 大盘图表② · 品牌份额趋势（GFK IMG_9368 复刻）
// 双带布局：上方条带为大盘销量线（蓝，万台）与大盘均价线（琥珀墨，美元，
// 均逐点标值）；下方为月度 100% 堆叠柱（≥12% 标注）。两带共享月份轴。
// 卡头档位控件（2026-11-04 第二波升级，Eason 拍板）：「全档位（默认，=
// 大盘总量）+ 自定义价带」——不再提供固定单档位组。自定义 = 用户输入
// [最低价, 最高价]，50 美元粒度（数据层 tierCellsOf 参数化格子，粗于 50
// 的档位按档内均匀分摊的模拟插值口径聚合），输入吸附边界、钳在产业价域
// 内、逆序自动换序、退化保留上一自选带；应用后上方销量线与下方堆叠柱按
// 自定义带重算。带内无均价口径（档位格无价格锚点），诚实留空均价线；
// 点「全档位」一键恢复大盘总量。
// ============================================================
import { useState } from 'react';
import { InputNumber, Segmented } from 'antd';
import { color, fontSize, space } from '../../theme/tokens';
import { OTHERS, type MarketIndustryData } from './marketBoardData';
import {
  brandColorFor,
  clampBand,
  customBandSeries,
  customBandSummary,
  defaultBand,
  fmtWan,
  labelInkFor,
  monthLabel,
  round1,
  trendSeries,
  trendSummary,
  type PriceBand,
} from './marketBoardModel';
import { MB_CARD, MBCardHead, MBScroll, MBSummaryLine, MB_AXIS, MB_TOOLTIP, useEChart } from './marketBoardUI';

const ASP_INK = '#b45309'; // 琥珀墨：白底对比达标，线与标注同色（与全站跌琥珀同源）

/** 把数据序列映射到条带的指定纵向区间（比例带），返回隐藏轴的 min/max */
function bandAxis(values: number[], from: number, to: number): { min: number; max: number } {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = Math.max(1e-6, hi - lo);
  const S = span / (to - from);
  const min = lo - from * S;
  return { min, max: min + S };
}

export default function BrandShareTrendCard({ data }: { data: MarketIndustryData }) {
  const [mode, setMode] = useState<'all' | 'custom'>('all');
  const [band, setBand] = useState<PriceBand>(() => defaultBand(data));
  const [draftLo, setDraftLo] = useState<number | null>(band.lo);
  const [draftHi, setDraftHi] = useState<number | null>(band.hi);
  const [invalid, setInvalid] = useState(false);
  const custom = mode === 'custom';

  /** 应用自选带：吸附/钳制/换序后生效；退化输入（min===max）保留上一自选带并提示 */
  const applyDraft = () => {
    const next = clampBand(data, draftLo ?? NaN, draftHi ?? NaN);
    if (!next) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setBand(next);
    setDraftLo(next.lo);
    setDraftHi(next.hi);
  };

  const overall = trendSeries(data);
  const bandTrend = custom ? customBandSeries(data, band.lo, band.hi) : null;
  const t = bandTrend ?? overall;

  const legendItems = [...data.brands, OTHERS];
  const legendNames = legendItems.map((b) => (b === OTHERS ? '<OTHERS>' : b));
  const lineNames = custom ? ['价带容量（万台）'] : ['大盘销量（万台）', '大盘均价（美元）'];
  const legendRows = legendNames.length + lineNames.length > 8 ? 2 : 1;

  const chart = useEChart(
    () => {
      const volValues = t.volumes;
      // 全档位：销量/均价两条线分占条带上下半区；自定义带：仅容量线占满条带（与原单档位同款）
      const volBand = custom ? bandAxis(volValues, 0.15, 0.85) : bandAxis(volValues, 0.1, 0.46);
      const aspBand = custom ? { min: 0, max: 1 } : bandAxis(overall.asps, 0.54, 0.92);

      const series: Record<string, unknown>[] = [];

      legendItems.forEach((brand) => {
        const fill = brandColorFor(brand);
        series.push({
          name: brand === OTHERS ? '<OTHERS>' : brand,
          type: 'bar',
          stack: 'share',
          xAxisIndex: 1,
          yAxisIndex: 2,
          barWidth: '58%',
          data: t.shares[brand],
          itemStyle: { color: fill },
          label: {
            show: true,
            position: 'inside',
            fontSize: 10,
            color: labelInkFor(fill),
            formatter: (p: { value: number }) => (p.value >= 12 ? `${Math.round(p.value)}%` : ''),
          },
        });
      });

      series.push({
        name: custom ? '价带容量（万台）' : '大盘销量（万台）',
        type: 'line',
        xAxisIndex: 0,
        yAxisIndex: 0,
        data: volValues,
        symbol: 'circle',
        symbolSize: 4.5,
        lineStyle: { width: 2, color: color.link },
        itemStyle: { color: color.link, borderColor: '#ffffff', borderWidth: 1 },
        label: {
          show: true,
          position: 'bottom',
          distance: 5,
          fontSize: 10,
          color: color.link,
          formatter: (p: { value: number }) => round1(p.value).toFixed(1),
        },
        z: 5,
      });
      if (!custom) {
        series.push({
          name: '大盘均价（美元）',
          type: 'line',
          xAxisIndex: 0,
          yAxisIndex: 1,
          data: overall.asps,
          symbol: 'diamond',
          symbolSize: 5,
          lineStyle: { width: 2, color: ASP_INK },
          itemStyle: { color: ASP_INK, borderColor: '#ffffff', borderWidth: 1 },
          label: {
            show: true,
            position: 'top',
            distance: 5,
            fontSize: 10,
            color: ASP_INK,
            formatter: (p: { value: number }) => `${Math.round(p.value)}`,
          },
          z: 5,
        });
      }

      return {
        grid: [
          { left: 56, right: 24, top: 14, height: 96 },
          { left: 56, right: 24, top: 138, bottom: legendRows * 18 + 26 },
        ],
        axisPointer: { link: [{ xAxisIndex: 'all' }] },
        legend: {
          bottom: 0,
          left: 'center',
          itemWidth: 14,
          itemHeight: 8,
          icon: 'roundRect',
          itemGap: 12,
          textStyle: { fontSize: 11, color: color.body },
          data: [...legendNames, ...lineNames],
        },
        tooltip: {
          ...MB_TOOLTIP,
          trigger: 'axis',
          formatter: (ps: { dataIndex: number }[]) => {
            const idx = ps[0]?.dataIndex ?? 0;
            const m = t.months[idx] ?? '';
            const shareRows = legendItems
              .map((b) => ({ b, v: t.shares[b]?.[idx] ?? 0 }))
              .sort((a, z) => z.v - a.v)
              .filter(({ v }) => v >= 1)
              .map(({ b, v }) => {
                const c = brandColorFor(b);
                return `<div style="display:flex;align-items:center;gap:6px;line-height:1.8">` +
                  `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${c}"></span>` +
                  `<span style="min-width:64px">${b === OTHERS ? '&lt;OTHERS&gt;' : b}</span>` +
                  `<span style="font-weight:600;color:${color.ink}">${Math.round(v)}%</span></div>`;
              })
              .join('');
            const scope = custom ? `$${band.lo}–${band.hi} 价带容量` : '大盘容量';
            const aspTail = custom ? '' : ` · 大盘均价 $${overall.asps[idx] ?? 0}`;
            return (
              `<div style="font-weight:600;color:${color.ink};margin-bottom:4px">${monthLabel(m)}${custom ? ` · $${band.lo}–${band.hi}` : ''}</div>` +
              shareRows +
              `<div style="margin-top:4px;padding-top:4px;border-top:1px solid ${color.hairline};color:${color.body}">` +
              `${scope} ${fmtWan(volValues[idx] ?? 0)}${aspTail}</div>`
            );
          },
        },
        xAxis: [
          {
            type: 'category',
            gridIndex: 0,
            data: t.months,
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: { show: false },
          },
          {
            type: 'category',
            gridIndex: 1,
            data: t.months,
            axisTick: { show: false },
            axisLine: { lineStyle: { color: color.hairline } },
            axisLabel: { ...MB_AXIS, interval: 0, fontSize: 10, formatter: (v: string) => monthLabel(v) },
          },
        ],
        yAxis: [
          { type: 'value', gridIndex: 0, min: volBand.min, max: volBand.max, show: false },
          { type: 'value', gridIndex: 0, min: aspBand.min, max: aspBand.max, show: false },
          {
            type: 'value',
            gridIndex: 1,
            min: 0,
            max: 100,
            interval: 25,
            axisLabel: { ...MB_AXIS, formatter: (v: number) => `${v}%` },
            splitLine: { lineStyle: { color: color.hairline } },
          },
        ],
        series,
      };
    },
    [data, mode, band],
    { width: '100%', height: 470 },
  );

  const hint = custom
    ? `${data.intro}；自定义价带按 50 美元格子聚合（粗于 50 的档位按档内均匀分摊，模拟插值口径）；带内无均价口径`
    : data.intro;

  const tierControl = (
    <div style={{ display: 'flex', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
      <Segmented
        size="small"
        options={[
          { label: '全档位', value: 'all' },
          { label: '自定义', value: 'custom' },
        ]}
        value={mode}
        onChange={(v) => setMode(String(v) === 'custom' ? 'custom' : 'all')}
      />
      {custom && (
        <>
          {/* 不设 antd min/max：rc-input-number 对越界输入不触发 onChange（钳制延迟到
              blur 且晚于 onBlur），越界/空值统一交给 applyDraft 的 clampBand 钳制 */}
          <InputNumber
            size="small"
            style={{ width: 76 }}
            step={50}
            value={draftLo}
            aria-label="自定义价带最低价"
            onChange={(v) => setDraftLo(v)}
            onBlur={applyDraft}
            onPressEnter={applyDraft}
          />
          <span style={{ color: color.mute }}>{'–'}</span>
          <InputNumber
            size="small"
            style={{ width: 76 }}
            step={50}
            value={draftHi}
            aria-label="自定义价带最高价"
            onChange={(v) => setDraftHi(v)}
            onBlur={applyDraft}
            onPressEnter={applyDraft}
          />
          <span
            style={{
              fontSize: fontSize.caption,
              color: invalid ? color.warningInk : color.mute,
              whiteSpace: 'nowrap',
              fontWeight: invalid ? 600 : 400,
            }}
          >
            {invalid ? `最低价需低于最高价，已保留 $${band.lo}–${band.hi}` : `自定义 $${band.lo}–${band.hi}`}
          </span>
        </>
      )}
    </div>
  );

  return (
    <section style={MB_CARD}>
      <MBCardHead title="品牌份额趋势" source="模拟数据" hint={hint} extra={tierControl} />
      <MBSummaryLine>
        {custom
          ? `自定义 $${band.lo}–${band.hi}（50 美元粒度价带，覆盖档位格子聚合、模拟插值口径）：蓝线为价带容量（万台，逐点标值）；带内无均价口径，点「全档位」恢复大盘总量。`
          : '上方条带：蓝线为大盘容量（万台）、琥珀线为大盘均价（美元），均逐点标值；下方为月度品牌份额。'}
      </MBSummaryLine>
      <MBScroll minWidth={1160}>{chart}</MBScroll>
      <MBSummaryLine>{custom ? customBandSummary(data, band.lo, band.hi) : trendSummary(data)}</MBSummaryLine>
    </section>
  );
}
