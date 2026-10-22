// ============================================================
// 多平台比价（本轮改版）：单产品在各平台的价格趋势对比——入口 = 价格看板
// 工具行「多平台比价」胶囊按钮（显性入口，不再收在「⋯ 更多」菜单）。
// 口径：各平台 = 该平台全部渠道/店铺内最低在架价（platformPriceSpread 同源，
// **与左上平台筛选无关**——比价的意义就是并列看全部平台）；SKU = 该配置的
// 最低价代表色（lowestPriceColorSku，缺省回退该配置首个颜色 SKU）；
// 时间 = 看板筛选范围按周展开（比价恒按周，粒度/查看窗口无关）；币种随看板。
// 布局：顶部 = 产品 Select + 「按周 · 币种」角注；其下 = 平台摘要 chips 行
// （平台名 · 店铺数 · 最新价 · 比最低 +x.x%，最低者浅蓝标亮）；主体 =
// 多平台价格阶梯趋势图（各平台一条线放同一张图，即主图的多平台版）——
// 周度阶梯（step:'end'）与主图一致、无价周断线（connectNulls:false）、
// 圆点仅悬停显示；图例=平台名（可点击显隐）；悬停出该周各平台价格。
// ============================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import { ConfigProvider, Modal, Select } from 'antd';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { useFilters } from '../../state/FiltersContext';
import { dimChannel, dimProduct } from '../../data';
import { filterBarTheme } from '../../components/FilterBar';
import { bucketIdOfDate, dateOfBucket } from '../../components/FilterBar/timeUtils';
import { brandOfModel, modelNameOf } from '../../components/ProductCascader/tree';
import { lowestPriceColorSku, platformPriceSpread } from '../../dataModel/aggregate';
import { bucketAnchorDate, dataBucketRange, enumerateBuckets, type Bucket } from './helpers';
import { color, font, localCurrencySymbol, radius, selectAccent, selectSoft, selectSoftInk } from '../../theme/tokens';

echarts.use([LineChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

/** 平台色板（低饱和六色，与系统黑白灰+浅蓝强调的气质协调；仅本弹窗使用，
 *  不进全局 tokens——平台数超过色板长度时循环取色） */
const PLATFORM_PALETTE = ['#4c78a8', '#c78a4b', '#6f9e6a', '#a878a8', '#9d755d', '#4fa3a5'];

/** 趋势图容器高（宽随弹窗，ResizeObserver 自适应） */
const TREND_H = 312;

interface ProductOption {
  key: string; // `${modelId}|${romram}`
  modelId: string;
  romram: string;
  label: string;
}

interface PlatformRow {
  platform: string;
  shops: number;
  prices: (number | null)[]; // 与 weeks 对齐；null = 该周该平台无在架价
  latest: number | null; // 窗口内最后一个有价周
  vsLowest: number | null; // 最新价相对全场最低 +x.x
  lowest: boolean;
}

const fmtPrice = (v: number, usd: boolean): string =>
  `${usd ? '$' : ''}${Math.round(v).toLocaleString('en-US')}`;

/** 多平台价格阶梯趋势图：各平台一条线放同一张图（主图的多平台版，比主图简单
 *  得多——无断轴/档位带/覆盖层那套）。echarts 引入与 init/dispose/ResizeObserver
 *  模式同 src/chart/PriceTrend/Chart.tsx。 */
function PlatformTrendChart(props: { rows: PlatformRow[]; weeks: Bucket[] }) {
  const { rows, weeks } = props;
  const { state } = useFilters();
  const usd = state.currency === 'usd';
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const chartDivRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const [width, setWidth] = useState(0);

  // 数据引用透传给 tooltip 闭包（formatter 里按下标取数，而非依赖 params 携带值
  // ——无价周在 params 里可能被省略，按周下标直查 rows 才能列出「无价 = —」）
  const dataRef = useRef({ rows, weeks, usd });
  dataRef.current = { rows, weeks, usd };

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const en of entries) setWidth(en.contentRect.width);
    });
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = chartDivRef.current;
    if (!el) return;
    const chart = echarts.init(el, null, { renderer: 'canvas' });
    chartRef.current = chart;
    return () => {
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.resize();
  }, [width]);

  // 有价平台才出线（全程无价的平台不占图例位）
  const priced = useMemo(() => rows.filter((r) => r.prices.some((v) => v != null)), [rows]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (weeks.length === 0 || priced.length === 0) {
      chart.clear();
      return;
    }
    // 隔周抽稀：标签约每 1/12 个刻度出一个，防叠字
    const labelEvery = Math.max(1, Math.ceil(weeks.length / 12));
    const sym = usd ? '$' : localCurrencySymbol();
    const option: echarts.EChartsCoreOption = {
      animationDuration: 160,
      color: priced.map((_, i) => PLATFORM_PALETTE[i % PLATFORM_PALETTE.length]),
      grid: { left: 8, right: 16, top: 30, bottom: 4, containLabel: true },
      legend: {
        top: 0,
        left: 4,
        icon: 'rect',
        itemWidth: 12,
        itemHeight: 3,
        itemGap: 16,
        textStyle: { fontSize: 11, color: color.body, fontFamily: font.family },
      },
      tooltip: {
        trigger: 'axis',
        confine: true,
        backgroundColor: '#ffffff',
        borderColor: color.hairline,
        borderRadius: radius.card,
        padding: [8, 12],
        textStyle: { fontSize: 12, color: color.body, fontFamily: font.family },
        extraCssText: 'box-shadow: 0 1px 1px rgba(0,0,0,.02), 0 8px 16px -4px rgba(0,0,0,.08);',
        formatter: (params: unknown) => {
          const arr = Array.isArray(params) ? params : [params];
          const first = arr[0] as { dataIndex?: number } | undefined;
          const idx = first?.dataIndex ?? 0;
          const wk = dataRef.current.weeks[idx];
          if (!wk) return '';
          const { rows: rs, usd: isUsd } = dataRef.current;
          const full = bucketAnchorDate('week', wk.id) ?? wk.xLabel;
          const lines = rs
            .map((r, i) => {
              const v = r.prices[idx];
              const c = PLATFORM_PALETTE[i % PLATFORM_PALETTE.length];
              return (
                `<div style="display:flex;align-items:center;gap:7px;line-height:20px;min-width:180px;">` +
                `<span style="width:8px;height:3px;border-radius:2px;background:${c};flex-shrink:0;"></span>` +
                `<span>${r.platform}</span>` +
                `<span style="margin-left:auto;font-weight:600;color:#171717;font-variant-numeric:tabular-nums;">` +
                `${v != null ? fmtPrice(v, isUsd) : '—'}</span></div>`
              );
            })
            .join('');
          return `<div style="font-weight:600;color:#171717;margin-bottom:4px;">${full}</div>${lines}`;
        },
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: weeks.map((b) => b.xLabel),
        axisLine: { lineStyle: { color: color.hairlineStrong } },
        axisTick: { show: false },
        axisLabel: {
          color: color.mute,
          fontSize: 10,
          fontFamily: font.family,
          interval: labelEvery - 1,
        },
      },
      yAxis: {
        type: 'value',
        scale: true,
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: color.hairline } },
        axisLabel: {
          color: color.mute,
          fontSize: 10,
          fontFamily: font.family,
          formatter: (v: number) => `${sym}${Math.round(v).toLocaleString('en-US')}`,
        },
      },
      series: priced.map((r) => ({
        name: r.platform,
        type: 'line',
        step: 'end', // 周度阶梯，与主图折线形态一致
        connectNulls: false, // 无价周断开，不臆造价格
        showSymbol: false, // 圆点仅悬停显示
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { width: 1.8 },
        emphasis: { focus: 'series' },
        data: r.prices,
      })),
    };
    chart.resize();
    chart.setOption(option, { notMerge: true });
  }, [priced, weeks, usd]);

  const empty = weeks.length === 0 || priced.length === 0;
  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: TREND_H }}>
      <div ref={chartDivRef} style={{ position: 'absolute', inset: 0 }} />
      {empty && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            fontSize: 14,
            color: color.mute,
          }}
        >
          所选时间范围内无价格数据
        </div>
      )}
    </div>
  );
}

export default function PlatformCompareModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state } = useFilters();
  const cc = state.countryCode;
  const usd = state.currency === 'usd';

  // 产品选项 = 当前看板全部产品对（主品在前、对比随卡序；selKey 去重）
  const products = useMemo<ProductOption[]>(() => {
    const out: ProductOption[] = [];
    const seen = new Set<string>();
    for (const card of state.mains) {
      for (const sel of [card.main, ...card.compares]) {
        if (!sel) continue;
        const key = `${sel.modelId}|${sel.romram}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          key,
          modelId: sel.modelId,
          romram: sel.romram,
          label: `${brandOfModel(sel.modelId)} ${modelNameOf(sel.modelId)} ${sel.romram}`,
        });
      }
    }
    return out;
  }, [state.mains]);
  const [picked, setPicked] = useState<string | null>(null);
  const activeKey = picked != null && products.some((p) => p.key === picked) ? picked : products[0]?.key ?? null;
  const active = products.find((p) => p.key === activeKey) ?? null;

  // 周桶 = 看板筛选范围（rangeStart/End 为当前粒度桶 id，换算成周 id）∩ 数据全量周域
  const weeks = useMemo<Bucket[]>(() => {
    const [ds, de] = dataBucketRange('week');
    let lo = ds;
    let hi = de;
    const sD = state.rangeStart ? dateOfBucket(state.rangeStart, state.granularity) : null;
    const eD = state.rangeEnd ? dateOfBucket(state.rangeEnd, state.granularity) : null;
    if (sD) lo = lo > bucketIdOfDate(sD, 'week') ? lo : bucketIdOfDate(sD, 'week');
    if (eD) hi = hi < bucketIdOfDate(eD, 'week') ? hi : bucketIdOfDate(eD, 'week');
    if (lo > hi) return [];
    return enumerateBuckets('week', ds, de).filter((b) => b.id >= lo && b.id <= hi);
  }, [state.rangeStart, state.rangeEnd, state.granularity]);

  const rows = useMemo<PlatformRow[]>(() => {
    if (!active || !open) return [];
    // 代表色 = 最低价颜色 SKU；无价数据回退该配置首个颜色
    const skuId = lowestPriceColorSku(active.modelId, active.romram, cc)
      ?? dimProduct.find((p) => p.model_id === active.modelId && p.romram.replace(/\s+/g, '') === active.romram.replace(/\s+/g, '') && p.countries.includes(cc))?.sku_id
      ?? null;
    if (!skuId) return [];
    const shopsByPlatform = new Map<string, number>();
    for (const c of dimChannel) {
      if (c.country_code !== cc) continue;
      shopsByPlatform.set(c.platform, (shopsByPlatform.get(c.platform) ?? 0) + c.shops);
    }
    const pricesByPlatform = new Map<string, (number | null)[]>();
    weeks.forEach((wk, i) => {
      for (const { platform, price } of platformPriceSpread(skuId, wk.id, cc, state.currency)) {
        let arr = pricesByPlatform.get(platform);
        if (!arr) {
          arr = new Array<number | null>(weeks.length).fill(null);
          pricesByPlatform.set(platform, arr);
        }
        arr[i] = price;
      }
    });
    const out: PlatformRow[] = [...shopsByPlatform.entries()].map(([platform, shops]) => {
      const prices = pricesByPlatform.get(platform) ?? new Array<number | null>(weeks.length).fill(null);
      let latest: number | null = null;
      for (let i = prices.length - 1; i >= 0; i--) {
        if (prices[i] != null) {
          latest = prices[i];
          break;
        }
      }
      return { platform, shops, prices, latest, vsLowest: null, lowest: false };
    });
    const priced = out.filter((r) => r.latest != null);
    const min = priced.length ? Math.min(...priced.map((r) => r.latest!)) : null;
    for (const r of out) {
      if (r.latest != null && min != null) r.vsLowest = r.latest / min - 1;
      r.lowest = r.latest != null && r.latest === min;
    }
    // 最低价平台置顶，其余按最新价升序，无价殿后（按名称）
    return out.sort((a, b) => {
      if (a.latest != null && b.latest != null) return a.latest - b.latest || a.platform.localeCompare(b.platform);
      if (a.latest != null) return -1;
      if (b.latest != null) return 1;
      return a.platform.localeCompare(b.platform);
    });
  }, [active, open, weeks, cc, state.currency]);

  // 关闭即整体卸载（同 DrillModal/SnapshotModal 惯例）：antd Modal 常驻挂载、
  // 仅切 open=false 的关法在 StrictMode 开发态会留下 display:block 的透明遮罩
  // 挡住整页点击——这里渲染期直接不输出 Modal，关闭路径无残留。
  if (!open) return null;

  return (
    <Modal open onCancel={onClose} footer={null} centered width={800} title="多平台比价">
      <ConfigProvider theme={filterBarTheme}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '2px 0 10px' }}>
          <span style={{ fontSize: 12, color: color.mute, flexShrink: 0 }}>产品</span>
          <Select
            style={{ width: 420 }}
            value={activeKey ?? undefined}
            placeholder={products.length ? '选择产品' : '当前看板没有可选产品'}
            notFoundContent="当前看板没有可选产品"
            showSearch
            optionFilterProp="label"
            disabled={!products.length}
            onChange={(k) => setPicked(k)}
            options={products.map((p) => ({ value: p.key, label: p.label }))}
          />
          <span style={{ fontSize: 12, color: color.mute, marginLeft: 'auto', whiteSpace: 'nowrap' }}>
            按周 · {usd ? 'USD' : '本币'}
          </span>
        </div>
        {active ? (
          <>
            {/* 平台摘要 chips：平台名 · 店铺数 · 最新价 · 比最低 +x.x%（最低者浅蓝标亮；
                色点与趋势图线色一一对应） */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {rows.map((r, i) => (
                <span
                  key={r.platform}
                  className="tnum"
                  title={`${r.platform}：${r.shops} 家店铺 · 最新价 ${r.latest != null ? fmtPrice(r.latest, usd) : '范围内无价'}${
                    r.lowest ? '（全场最低）' : r.vsLowest != null && r.vsLowest > 0.0005 ? `（比最低 +${(r.vsLowest * 100).toFixed(1)}%）` : ''
                  }`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    height: 24,
                    padding: '0 9px',
                    borderRadius: radius.pill,
                    fontSize: 12,
                    lineHeight: '22px',
                    whiteSpace: 'nowrap',
                    background: r.lowest ? selectSoft : color.canvas,
                    border: `1px solid ${r.lowest ? selectAccent : color.hairline}`,
                    color: r.lowest ? selectSoftInk : color.body,
                  }}
                >
                  <i
                    aria-hidden
                    style={{
                      width: 8,
                      height: 3,
                      borderRadius: 2,
                      background: PLATFORM_PALETTE[i % PLATFORM_PALETTE.length],
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontWeight: r.lowest ? 600 : 500 }}>{r.platform}</span>
                  <span style={{ color: r.lowest ? selectSoftInk : color.mute }}>· {r.shops} 店铺</span>
                  <span style={{ fontWeight: 600, color: r.lowest ? selectSoftInk : color.ink }}>
                    · {r.latest != null ? fmtPrice(r.latest, usd) : '—'}
                  </span>
                  <span style={{ color: r.lowest ? selectSoftInk : color.mute }}>
                    ·{' '}
                    {r.lowest ? (
                      <span style={{ fontWeight: 700 }}>最低</span>
                    ) : r.vsLowest != null && r.vsLowest > 0.0005 ? (
                      `+${(r.vsLowest * 100).toFixed(1)}%`
                    ) : (
                      '—'
                    )}
                  </span>
                </span>
              ))}
            </div>
            <PlatformTrendChart rows={rows} weeks={weeks} />
            <div style={{ fontSize: 12, color: color.mute, marginTop: 8, lineHeight: '18px' }}>
              各平台价格 = 该平台全部店铺内最低在架价（折后价口径，取所选配置的最低价颜色 SKU）；时间范围随看板筛选。
            </div>
          </>
        ) : (
          <div style={{ padding: '28px 0', textAlign: 'center', fontSize: 14, color: color.mute }}>
            请先在价格看板选择产品，再做多平台比价
          </div>
        )}
      </ConfigProvider>
    </Modal>
  );
}
