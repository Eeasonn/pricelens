// ============================================================
// 大盘图表① · 核心档位品牌份额趋势（GFK IMG_9476 复刻）
// 两种形态：全档位（6 档 × 锚点月并列）与单档位筛选（卡头 Segmented）。
// 顶部档位带 = 大盘容量（万台，与 GFK 同构）；主区 100% 堆叠柱，
// 段内 ≥4% 标百分比（深底白字/浅底墨字自动反色）；全档位形态下档位分组
// 以极浅底色交替区分。类目键用「档位·月份」组合串，避免跨组重名。
// ============================================================
import { useState, type ReactNode } from 'react';
import { Segmented } from 'antd';
import { color, font } from '../../theme/tokens';
import { OTHERS, type MarketIndustryData } from './marketBoardData';
import {
  brandColorFor,
  fmtWan,
  labelInkFor,
  monthLabel,
  tierShareAt,
  tierShareSummary,
} from './marketBoardModel';
import { MB_CARD, MBCardHead, MBScroll, MBSummaryLine, MB_AXIS, MB_TOOLTIP, useEChart } from './marketBoardUI';

const LABEL_MIN_PCT = 4; // 段内标注阈值（GFK 同款：过小段不标）

export default function TierBrandShareCard({ data }: { data: MarketIndustryData }) {
  const [tierId, setTierId] = useState<string>('all');
  const tier = data.tiers.find((t) => t.id === tierId) ?? null;
  const months = data.anchorMonths;

  // 类目元数据：{ key, tier, month }；key = 档位id·月份，保证唯一
  const cats = (tier ? data.tiers.filter((t) => t.id === tier.id) : data.tiers).flatMap((t) =>
    months.map((m) => ({ key: `${t.id}·${m}`, tier: t, month: m })),
  );
  const monthOfKey = (key: string) => key.slice(key.indexOf('·') + 1);

  const chartHeight = tier ? 340 : 400;
  const legendItems = [...data.brands, OTHERS];
  const legendRows = legendItems.length > 8 ? 2 : 1;

  const chart = useEChart(
    () => {
      const series: Record<string, unknown>[] = [
        {
          name: '大盘容量',
          type: 'scatter',
          xAxisIndex: 0,
          yAxisIndex: 0,
          symbolSize: 0,
          silent: true,
          tooltip: { show: false },
          data: cats.map((_, i) => [i, 0.5]),
          label: {
            show: true,
            position: 'top',
            fontSize: 11,
            color: color.body,
            fontFamily: font.family,
            formatter: (p: { dataIndex: number }) => {
              const meta = cats[p.dataIndex];
              const cap = meta ? (data.tierVolume[meta.tier.id]?.[meta.month] ?? 0) : 0;
              return cap > 0 ? cap.toFixed(1) : '';
            },
          },
        },
      ];

      legendItems.forEach((brand, bi) => {
        const fill = brandColorFor(brand);
        series.push({
          name: brand === OTHERS ? '<OTHERS>' : brand,
          type: 'bar',
          stack: 'share',
          xAxisIndex: 1,
          yAxisIndex: 1,
          barWidth: tier ? '48%' : '62%',
          data: cats.map(({ tier: t, month }) => tierShareAt(data, t.id, month)[brand]),
          itemStyle: { color: fill },
          label: {
            show: true,
            position: 'inside',
            fontSize: 10,
            color: labelInkFor(fill),
            formatter: (p: { value: number }) => (p.value >= LABEL_MIN_PCT ? `${Math.round(p.value)}%` : ''),
          },
          // 全档位形态：奇数档位组衬极浅底色（GFK 分组框的轻量替身）
          ...(!tier && bi === 0
            ? {
                markArea: {
                  silent: true,
                  label: { show: false },
                  itemStyle: { color: 'rgba(23,23,23,.03)' },
                  data: data.tiers
                    .map((_, gi) => gi)
                    .filter((gi) => gi % 2 === 1)
                    .map((gi) => [{ xAxis: gi * months.length }, { xAxis: gi * months.length + months.length - 1 }]),
                },
              }
            : {}),
        });
      });

      return {
        grid: [
          { left: 56, right: 16, top: 18, height: 12 },
          { left: 56, right: 16, top: 44, bottom: legendRows * 18 + 26 },
        ],
        legend: {
          bottom: 0,
          left: 'center',
          itemWidth: 14,
          itemHeight: 8,
          icon: 'roundRect',
          itemGap: 12,
          textStyle: { fontSize: 11, color: color.body, fontFamily: font.family },
          data: legendItems.map((b) => (b === OTHERS ? '<OTHERS>' : b)),
        },
        tooltip: {
          ...MB_TOOLTIP,
          trigger: 'axis',
          formatter: (ps: { dataIndex: number }[]) => {
            const meta = cats[ps[0]?.dataIndex ?? 0];
            if (!meta) return '';
            const cap = data.tierVolume[meta.tier.id]?.[meta.month] ?? 0;
            const shares = tierShareAt(data, meta.tier.id, meta.month);
            const rows = legendItems
              .map((b) => ({ b, v: shares[b] ?? 0 }))
              .sort((a, z) => z.v - a.v)
              .map(({ b, v }) => {
                const c = brandColorFor(b);
                return `<div style="display:flex;align-items:center;gap:6px;line-height:1.9">` +
                  `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${c}"></span>` +
                  `<span style="min-width:64px">${b === OTHERS ? '&lt;OTHERS&gt;' : b}</span>` +
                  `<span style="font-weight:600;color:${color.ink}">${Math.round(v)}%</span>` +
                  `<span style="color:${color.mute}">${((cap * v) / 100).toFixed(2)} 万台</span></div>`;
              })
              .join('');
            return `<div style="font-weight:600;color:${color.ink};margin-bottom:4px">${meta.tier.label} 美元档 · ${monthLabel(meta.month)} · 大盘容量 ${fmtWan(cap)}</div>${rows}`;
          },
        },
        xAxis: [
          {
            type: 'category',
            gridIndex: 0,
            data: cats.map((c) => c.key),
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: {
              interval: 0,
              margin: 4,
              fontSize: 12,
              fontWeight: 600,
              color: color.ink,
              fontFamily: font.family,
              formatter: (_v: string, i: number) => {
                if (tier) return '';
                const len = months.length;
                return i % len === Math.floor((len - 1) / 2) ? cats[i]?.tier.label ?? '' : '';
              },
            },
          },
          {
            type: 'category',
            gridIndex: 1,
            data: cats.map((c) => c.key),
            axisTick: { show: false },
            axisLine: { lineStyle: { color: color.hairline } },
            axisLabel: { ...MB_AXIS, interval: 0, fontSize: 10, formatter: (v: string) => monthLabel(monthOfKey(v)) },
          },
        ],
        yAxis: [
          { type: 'value', gridIndex: 0, min: 0, max: 1, show: false },
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
    [data, tier],
    { width: '100%', height: chartHeight },
  );

  const segOptions: { label: ReactNode; value: string }[] = [
    { label: '全档位', value: 'all' },
    ...data.tiers.map((t) => ({ label: t.label, value: t.id })),
  ];

  return (
    <section style={MB_CARD}>
      <MBCardHead
        title="核心档位品牌份额趋势"
        source="模拟数据"
        hint={data.intro}
        extra={<Segmented size="small" options={segOptions} value={tierId} onChange={(v) => setTierId(String(v))} />}
      />
      <MBSummaryLine>{`单位：万台 · ${data.region} · 档位为美元价带；柱内百分比为品牌份额。`}</MBSummaryLine>
      <MBScroll minWidth={tier ? 520 : 1160}>{chart}</MBScroll>
      <MBSummaryLine>{tierShareSummary(data, tier ? tier.id : null)}</MBSummaryLine>
    </section>
  );
}
