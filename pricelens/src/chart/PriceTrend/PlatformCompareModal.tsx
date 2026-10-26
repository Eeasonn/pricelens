// ============================================================
// 多平台比价（第一百四十九轮重设计对齐全站视觉；第一百五十轮入口与店铺口径字段化；
// 取数口径第142/143轮立）：单产品在各平台的价格趋势对比——入口 = 看板图例药丸
// 悬停「店铺」小按钮（每个产品直进自己的多平台比价，弹窗预选该产品）。
// 口径不变：各平台 = 该平台全部店铺内最低在架价（platformPriceSpread 同源，
// 与左上平台筛选无关——比价的意义就是并列看全部平台）；SKU = 该配置的最低价
// 代表色（lowestPriceColorSku，缺省回退首个颜色）；时间 = 看板筛选范围按周
// 展开（比价恒按周）；币种随看板。「比当前」= 与看板当前生效取数点（默认店铺
// 覆盖 → 未配置 = 国家默认平台内最低价，priceForSelection platform=null 链）
// 的差价率：chip 第二行 + 悬停明细每行附，当前取数点所在平台挂「当前」徽标。
// 第一百四十九轮：①弹窗 chrome 换系统令牌（radius.modal + shadow.l5 + 自绘标题
// 行，同 SnapshotModal 惯例，关闭走自绘 ✕）；②平台摘要 chip = 唯一图例（echarts
// 内置图例行退役），点击 chip 屏蔽/恢复该平台折线（虚线置灰同看板图例药丸）；
// ③趋势图补大促档期底色（buildPromoBands 同源，深浅红晕与主图同参）+ 悬停表头
// 档期行 + axisPointer 竖线；④线色/chip 色点按「有价平台序」稳定取色。
// 第一百五十轮（Eason 两点）：⑤工具行「多平台比价」胶囊按钮退役——原「多组
// 产品里再选一款」的二次选择路径删除，入口落在每颗药丸本位；弹窗内产品 Select
// 保留（开着时切换对比对象）。⑥卖家指定从 chip 内藏入口改为独立「店铺口径」
// 字段（复刻顶部筛选条「平台 / 店铺」语言：CascadeTrigger + 平台→卖家两级
// CascadePanel + 搜索 + 恢复默认），可逐平台指定卖家，chip 只承载图例/统计/屏蔽。
// ============================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, ConfigProvider, Input, Modal, Popover, Select } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { useFilters } from '../../state/FiltersContext';
import { dimChannel, dimProduct, dimPromo } from '../../data';
import type { DimPromo } from '../../dataModel/types';
import { filterBarTheme } from '../../components/FilterBar';
import { bucketIdOfDate, dateOfBucket } from '../../components/FilterBar/timeUtils';
import { brandOfModel, modelNameOf } from '../../components/ProductCascader/tree';
import {
  defaultChannelOf,
  defaultPlatformOf,
  lowestPriceColorSku,
  platformPriceSpread,
  priceForSelection,
  sellersOfPlatform,
  priceForPlatformSeller,
} from '../../dataModel/aggregate';
import { bucketAnchorDate, bucketSpans, dataBucketRange, enumerateBuckets, type Bucket } from './helpers';
import { buildPromoBands, type PromoBand } from './chartModel';
import { color, fontSize, font, localCurrencySymbol, radius, selectAccent, selectSoft, selectSoftInk, shadow, space } from '../../theme/tokens';
import { CascadePanel, CascadeTrigger, autoColumnWidth, measureText } from '../../components/ProductCascader';
import type { CascadeRowItem } from '../../components/ProductCascader';

echarts.use([LineChart, GridComponent, TooltipComponent, CanvasRenderer]);

/** 平台色板（低饱和六色，与系统黑白灰+浅蓝强调的气质协调；仅本弹窗使用，
 *  不进全局 tokens——平台数超过色板长度时循环取色） */
const PLATFORM_PALETTE = ['#4c78a8', '#c78a4b', '#6f9e6a', '#a878a8', '#9d755d', '#4fa3a5'];

/** 大促档期底色（与主图 Chart 同参：红晕按深/中/浅三档） */
const PROMO_FILL: Record<string, string> = {
  深: 'rgba(235, 87, 87, 0.055)',
  中: 'rgba(235, 87, 87, 0.035)',
  浅: 'rgba(235, 87, 87, 0.018)',
};
const promoFillOf = (depth: DimPromo['depth_hint']): string => PROMO_FILL[depth] ?? PROMO_FILL.浅;

/** 趋势图容器高（宽随弹窗，ResizeObserver 自适应） */
const TREND_H = 316;

interface ProductOption {
  key: string; // `${modelId}|${romram}`
  modelId: string;
  romram: string;
  label: string;
}

interface PlatformRow {
  platform: string;
  shops: number;
  /** 指定的具体卖家（第一百四十二轮追补三）：null = 平台全部店铺最低价（默认） */
  seller?: string | null;
  prices: (number | null)[]; // 与 weeks 对齐；null = 该周该平台无在架价
  latest: number | null; // 窗口内最后一个有价周
  vsLowest: number | null; // 最新价相对全场最低 +x.x
  vsCurrent: number | null; // 最新价相对看板当前取数点 ±x.x（任一缺失 = null）
  lowest: boolean;
  current: boolean; // 当前取数点所在平台（摘要挂「当前」徽标）
}

const fmtPrice = (v: number, usd: boolean): string =>
  `${usd ? '$' : ''}${Math.round(v).toLocaleString('en-US')}`;

/** 带符号差价率：+12.3% / −4.5%（U+2212，与宽表折扣率同语言） */
const fmtSignedPct = (v: number): string => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1)}%`;

/** 「比当前」展示口径：无从比（任一侧无价）= —；±0.05% 内视同持平 = — */
const vsCurrentText = (v: number | null): string =>
  v != null && Math.abs(v) > 0.0005 ? fmtSignedPct(v) : '—';

/** 多平台价格阶梯趋势图：各平台一条线放同一张图（主图的多平台版，无断轴/档位带
 *  那套）。echarts 引入与 init/dispose/ResizeObserver 模式同 src/chart/PriceTrend/
 *  Chart.tsx。第一百四十九轮：图例退役（平台 chip 即图例，hidden 屏蔽线）、补大促
 *  档期底色（markArea，与主图红晕同参）+ 悬停表头档期行 + axisPointer 竖线；
 *  线色按「有价平台序」稳定取色（与 chip 色点同源）。tooltip 每行附「比当前」
 *  同周差价率，当前取数点所在平台挂「当前」徽标。 */
function PlatformTrendChart(props: {
  rows: PlatformRow[];
  hidden: Set<string>;
  weeks: Bucket[];
  curPrices: (number | null)[];
  curPlatform: string | null;
  bands: PromoBand[];
}) {
  const { rows, hidden, weeks, curPrices, curPlatform, bands } = props;
  const { state } = useFilters();
  const usd = state.currency === 'usd';
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const chartDivRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const [width, setWidth] = useState(0);

  // 数据引用透传给 tooltip 闭包（formatter 里按下标取数，而非依赖 params 携带值
  // ——无价周在 params 里可能被省略，按周下标直查 rows 才能列出「无价 = —」）
  const dataRef = useRef({ rows, weeks, usd, curPrices, curPlatform, hidden, bands });
  dataRef.current = { rows, weeks, usd, curPrices, curPlatform, hidden, bands };

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

  // 有价平台才出线（全程无价的平台不占图例位）；色板按有价序稳定取色
  const priced = useMemo(() => rows.filter((r) => r.prices.some((v) => v != null)), [rows]);
  const colorOf = useMemo(() => {
    const m = new Map<string, string>();
    priced.forEach((r, i) => m.set(r.platform, PLATFORM_PALETTE[i % PLATFORM_PALETTE.length]));
    return (pf: string): string => m.get(pf) ?? PLATFORM_PALETTE[0];
  }, [priced]);
  const visible = useMemo(() => priced.filter((r) => !hidden.has(r.platform)), [priced, hidden]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (weeks.length === 0 || visible.length === 0) {
      chart.clear();
      return;
    }
    // 隔周抽稀：标签约每 1/12 个刻度出一个，防叠字
    const labelEvery = Math.max(1, Math.ceil(weeks.length / 12));
    const sym = usd ? '$' : localCurrencySymbol();
    const series = visible.map((r, i) => ({
      name: r.platform,
      type: 'line' as const,
      step: 'end' as const, // 周度阶梯，与主图折线形态一致
      connectNulls: false as const, // 无价周断开，不臆造价格
      showSymbol: false, // 圆点仅悬停显示
      symbol: 'circle' as const,
      symbolSize: 5,
      lineStyle: { width: 1.8, color: colorOf(r.platform) },
      itemStyle: { color: colorOf(r.platform) },
      emphasis: { focus: 'series' },
      data: r.prices,
      // 大促档期底色挂在首条可见线上（markArea 需宿主 series；Fractional index 在
      // 类目轴上按线性插值落位，与主图 DOM 叠层的 (idx+frac) 口径一致）
      ...(i === 0 && bands.length
        ? {
            markArea: {
              silent: true,
              data: bands.map((b) => [
                { xAxis: b.startIdx + b.startFrac, itemStyle: { color: promoFillOf(b.depth) } },
                { xAxis: b.endIdx + b.endFrac },
              ]),
            },
          }
        : {}),
    }));
    const option: echarts.EChartsCoreOption = {
      animationDuration: 160,
      grid: { left: 8, right: 16, top: 14, bottom: 4, containLabel: true },
      tooltip: {
        trigger: 'axis',
        confine: true,
        backgroundColor: '#ffffff',
        borderColor: color.hairline,
        borderRadius: radius.card,
        padding: [8, 12],
        textStyle: { fontSize: 12, color: color.body, fontFamily: font.family },
        extraCssText: 'box-shadow: 0 1px 1px rgba(0,0,0,.02), 0 8px 16px -4px rgba(0,0,0,.08);',
        axisPointer: { type: 'line', lineStyle: { color: color.hairlineStrong, width: 1 } },
        formatter: (params: unknown) => {
          const arr = Array.isArray(params) ? params : [params];
          const first = arr[0] as { dataIndex?: number } | undefined;
          const idx = first?.dataIndex ?? 0;
          const wk = dataRef.current.weeks[idx];
          if (!wk) return '';
          const { rows: rs, usd: isUsd, curPrices: cps, curPlatform: cp, hidden: hd, bands: bs } = dataRef.current;
          const cur = cps[idx] ?? null;
          const full = bucketAnchorDate('week', wk.id) ?? wk.xLabel;
          const band = bs.find((b) => idx >= b.startIdx && idx <= b.endIdx);
          const bandLine = band
            ? `<div style="display:flex;align-items:center;gap:5px;font-size:11px;color:${color.mute};margin:-2px 0 4px;">` +
              `<span style="width:8px;height:8px;border-radius:2px;background:${promoFillOf(band.depth)};` +
              `border:1px solid rgba(235, 87, 87, 0.25);flex-shrink:0;"></span>` +
              `<span>档期 ${band.name} · ${band.dateText}</span></div>`
            : '';
          const curBadge =
            ` <span style="display:inline-block;margin-left:2px;padding:0 4px;border-radius:9999;` +
            `border:1px solid ${selectAccent};background:${selectSoft};color:${selectSoftInk};` +
            `font-size:10px;line-height:14px;font-weight:600;vertical-align:1px;">当前</span>`;
          const lines = rs
            .filter((r) => !hd.has(r.platform))
            .map((r) => {
              const v = r.prices[idx];
              const c = colorOf(r.platform);
              const ratio = v != null && cur != null ? v / cur - 1 : null;
              return (
                `<div style="display:flex;align-items:center;gap:7px;line-height:20px;min-width:236px;">` +
                `<span style="width:8px;height:3px;border-radius:2px;background:${c};flex-shrink:0;"></span>` +
                `<span>${r.platform}${r.platform === cp ? curBadge : ''}</span>` +
                `<span style="margin-left:auto;font-weight:600;color:#171717;font-variant-numeric:tabular-nums;">` +
                `${v != null ? fmtPrice(v, isUsd) : '—'}</span>` +
                `<span style="width:86px;text-align:right;color:${color.mute};font-size:11px;` +
                `font-variant-numeric:tabular-nums;flex-shrink:0;">比当前 ${vsCurrentText(ratio)}</span></div>`
              );
            })
            .join('');
          return `<div style="font-weight:600;color:#171717;margin-bottom:4px;">${full}</div>${bandLine}${lines}`;
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
      series,
    };
    chart.resize();
    chart.setOption(option, { notMerge: true });
  }, [visible, priced, weeks, usd, bands, colorOf]);

  const emptyData = weeks.length === 0 || priced.length === 0;
  const allHidden = !emptyData && visible.length === 0;
  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: TREND_H }}>
      <div ref={chartDivRef} style={{ position: 'absolute', inset: 0 }} />
      {emptyData && (
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
      {allHidden && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            fontSize: 13,
            color: color.mute,
          }}
        >
          平台折线均已隐藏，点上方平台 chip 恢复
        </div>
      )}
    </div>
  );
}

/** 店铺口径字段（第一百五十轮，Eason：卖家下钻藏在 chip 里不合平台规范）：
 *  复刻顶部筛选条「平台 / 店铺」字段语言——CascadeTrigger 触发器 + Popover +
 *  两级 CascadePanel：左列 = 平台（首行「全部平台 · 各自最低价」= 清空全部指定，
 *  平台行 = 纯导航下钻右列）；右列 = 该平台卖家清单（首行「全部店铺 · 最低价」=
 *  清空该平台指定、恢复平台最低价口径，下方按覆盖周数降序，可搜索——OZON 3P
 *  数百家搜索必备）。多平台可各自指定，触发器汇总展示。 */
function SellerScopeField({
  cc,
  pins,
  onChange,
}: {
  cc: string;
  pins: Record<string, string>; // platform → seller（缺省/空串 = 未指定 = 平台最低价）
  onChange: (next: Record<string, string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string | null>(null); // 左列展开的平台
  const [query, setQuery] = useState('');
  const platforms = useMemo(() => {
    const set = new Set<string>();
    for (const c of dimChannel) {
      if (c.country_code === cc) set.add(c.platform);
    }
    return [...set];
  }, [cc]);
  const shopsOf = (pf: string): number =>
    dimChannel.filter((c) => c.country_code === cc && c.platform === pf).reduce((a, c) => a + c.shops, 0);
  const pinnedOf = (pf: string): string => pins[pf] || '';
  const pinnedList = platforms.filter((pf) => pinnedOf(pf));

  const commit = (pf: string | null, seller: string | null): void => {
    if (pf == null) {
      onChange({});
      setOpen(false);
      return;
    }
    const next = { ...pins };
    if (seller == null) delete next[pf];
    else next[pf] = seller;
    onChange(next);
    setOpen(false);
  };

  const platformItems: CascadeRowItem[] = [
    {
      key: '__all__',
      label: '全部平台 · 各自最低价',
      active: pinnedList.length === 0,
      onLabelClick: () => commit(null, null),
    },
    ...platforms.map((pf) => ({
      key: pf,
      label: pf,
      active: active === pf,
      onActivate: () => {
        setActive(pf);
        setQuery('');
      },
      trailing: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {pinnedOf(pf) && (
            <span
              style={{
                fontSize: 10,
                lineHeight: '14px',
                padding: '0 5px',
                borderRadius: radius.pill,
                border: `1px solid ${selectAccent}`,
                background: selectSoft,
                color: selectSoftInk,
                maxWidth: 120,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {pinnedOf(pf)}
            </span>
          )}
          <span style={{ fontSize: fontSize.caption, color: color.mute, flexShrink: 0 }}>· {shopsOf(pf)} 店铺</span>
        </span>
      ),
    })),
  ];

  const sellers = useMemo(() => (active ? sellersOfPlatform(cc, active) : []), [cc, active]);
  const q = query.trim().toLowerCase();
  const visibleSellers = q ? sellers.filter((x) => x.seller.toLowerCase().includes(q)) : sellers;
  const sellerItems: CascadeRowItem[] = active
    ? [
        {
          key: '__pf_all__',
          label: '全部店铺 · 最低价',
          active: !pinnedOf(active),
          onLabelClick: () => commit(active, null),
          trailing: <span style={{ fontSize: fontSize.caption, color: color.mute, flexShrink: 0 }}>· {shopsOf(active)} 店铺</span>,
        },
        ...visibleSellers.map((x) => ({
          key: x.seller,
          label: x.seller,
          active: pinnedOf(active) === x.seller,
          onLabelClick: () => commit(active, x.seller),
          trailing: <span style={{ fontSize: fontSize.caption, color: color.mute, flexShrink: 0 }}>· {x.weeks} 周</span>,
        })),
      ]
    : [];
  // 列宽按未过滤全量清单测定并显式固定：搜索过滤时宽度恒定（同 PlatformBox 口径）
  const sellerColW = useMemo(() => {
    if (!active) return 0;
    const full: CascadeRowItem[] = [
      { key: 'a', label: '全部店铺 · 最低价' },
      ...sellers.map((x) => ({ key: x.seller, label: x.seller })),
    ];
    const noteBudget = Math.max(measureText(`· ${shopsOf(active)} 店铺`), measureText('· 24 周'));
    return autoColumnWidth(full, { extraW: noteBudget * (fontSize.caption / 13) + 6, min: 200, max: 360 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, sellers, cc]);

  // 触发器文案：未指定 = 占位；单平台指定 = 「平台 · 卖家」；多平台 = 「A 等 N 个平台」
  const label =
    pinnedList.length === 0
      ? ''
      : pinnedList.length === 1
        ? `${pinnedList[0]} · ${pinnedOf(pinnedList[0])}`
        : `${pinnedList[0]} 等 ${pinnedList.length} 个平台`;

  return (
    <Popover
      trigger="click"
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setActive(null);
          setQuery('');
        }
      }}
      arrow={false}
      placement="bottomRight"
      styles={{ body: { padding: 0 } as const }}
      content={
        <div>
          {active != null && (
            <div style={{ padding: `8px ${space.md}px 6px`, borderBottom: `1px solid ${color.hairline}` }}>
              <Input
                size="small"
                allowClear
                placeholder={`搜索 ${active} 的卖家店铺`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{ height: 24, fontSize: fontSize.caption }}
              />
            </div>
          )}
          <CascadePanel
            open={open}
            columns={[
              { items: platformItems },
              ...(active != null && sellerColW > 0 ? [{ items: sellerItems, width: sellerColW }] : []),
            ]}
          />
          <div style={{ padding: `6px ${space.md}px`, borderTop: `1px solid ${color.hairline}` }}>
            <Button
              type="link"
              size="small"
              style={{ padding: 0, height: 20, fontSize: fontSize.caption }}
              disabled={pinnedList.length === 0}
              onClick={() => commit(null, null)}
            >
              恢复全部平台最低价
            </Button>
          </div>
        </div>
      }
    >
      <div style={{ width: 232, minWidth: 0 }}>
        <CascadeTrigger labels={label ? [label] : []} placeholder="各平台全部店铺 · 最低价" open={open} />
      </div>
    </Popover>
  );
}

export default function PlatformCompareModal({
  open,
  onClose,
  initialProduct,
}: {
  open: boolean;
  onClose: () => void;
  /** 图例药丸发起比价的产品（第一百五十轮）：弹窗默认选中该产品；null/不匹配 = 首个 */
  initialProduct?: { modelId: string; romram: string } | null;
}) {
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
          label: [brandOfModel(sel.modelId), modelNameOf(sel.modelId), sel.romram === '—' ? '' : sel.romram].filter(Boolean).join(' '),
        });
      }
    }
    return out;
  }, [state.mains]);
  const [picked, setPicked] = useState<string | null>(null);
  // 药丸入口每次发起都落到该产品：清手选残留，回落 initialProduct 匹配
  useEffect(() => setPicked(null), [initialProduct]);
  const initKey = useMemo(() => {
    if (!initialProduct) return null;
    const norm = (s: string): string => s.replace(/\s+/g, '');
    return (
      products.find((p) => p.modelId === initialProduct.modelId && norm(p.romram) === norm(initialProduct.romram))?.key ?? null
    );
  }, [initialProduct, products]);
  const activeKey =
    picked != null && products.some((p) => p.key === picked) ? picked : initKey ?? products[0]?.key ?? null;
  const active = products.find((p) => p.key === activeKey) ?? null;
  // 各平台指定的具体卖家（第一百四十二轮追补三）：null/缺省 = 平台全部店铺最低价；
  // 切产品/切国家重置——卖家名按国家各有一套，产品 key（型号|配置）跨国可复用，
  // 只随产品重置会把旧国家的卖家继续套到新国家数据上，平台线全断（本轮体检修）
  const [sellerPicks, setSellerPicks] = useState<Record<string, string>>({});
  // 被屏蔽的平台（第一百四十九轮：chip 即图例，点击切换）；同随产品/国家重置
  const [hiddenPfs, setHiddenPfs] = useState<Set<string>>(new Set());
  useEffect(() => {
    setSellerPicks({});
    setHiddenPfs(new Set());
  }, [activeKey, cc]);

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

  // 大促档期底色（第一百四十九轮）：促销日历按当前口径的平台集过滤（同主图
  // scopedPromos 归一），与看板窗口按周展开后的桶跨度求交
  const promoBands = useMemo<PromoBand[]>(() => {
    if (weeks.length === 0) return [];
    const defaultPlatform = defaultPlatformOf(cc);
    const selected = state.platform && (state.platform.platforms.length || state.platform.shopIds.length)
      ? new Set([...state.platform.platforms, ...state.platform.shopIds.map((id) => id.split(':')[1] ?? '')])
      : new Set(defaultPlatform ? [defaultPlatform] : []);
    const selectedLower = new Set([...selected].map((p) => p.toLowerCase().replace(/[^a-z0-9]/g, '')));
    const promos = dimPromo.filter(
      (p) => p.country_code === cc
        && (p.platforms == null || p.platforms.some((pl) => selectedLower.has(pl.toLowerCase().replace(/[^a-z0-9]/g, '')))),
    );
    return buildPromoBands({ promos, spans: bucketSpans('week', weeks) });
  }, [weeks, cc, state.platform]);

  // 代表色 = 最低价颜色 SKU；无价数据回退该配置首个颜色
  const skuId = useMemo<string | null>(() => {
    if (!active || !open) return null;
    return (
      lowestPriceColorSku(active.modelId, active.romram, cc)
      ?? dimProduct.find((p) => p.model_id === active.modelId && p.romram.replace(/\s+/g, '') === active.romram.replace(/\s+/g, '') && p.countries.includes(cc))?.sku_id
      ?? null
    );
  }, [active, open, cc]);

  // 「比当前」基准 = 看板当前取数点价（与 weeks 周序对齐）：随筛选条所选平台/店铺
  // （priceForSelection 传 state.platform，与看板折线同源）；未选时走默认店铺链
  // （人工覆盖 → 预填 → 默认平台内最低价）；与比价本身的全平台口径互不干扰
  const curPrices = useMemo<(number | null)[]>(
    () => (skuId ? weeks.map((wk) => priceForSelection(skuId, wk.id, cc, state.platform, state.currency)?.price ?? null) : []),
    [skuId, weeks, cc, state.platform, state.currency],
  );
  // 当前取数点所在平台（「当前」徽标）：所选店铺/平台归属平台；未选 = 默认店铺归属平台，再兜底国家默认平台
  const curPlatform = useMemo<string | null>(() => {
    const sel = state.platform;
    if (sel) {
      if (sel.shopIds.length) return dimChannel.find((c) => c.channel_id === sel.shopIds[0])?.platform ?? null;
      if (sel.platforms.length) return sel.platforms[0];
      return null;
    }
    const dc = defaultChannelOf(cc);
    return (dc ? dimChannel.find((c) => c.channel_id === dc)?.platform ?? null : null) ?? defaultPlatformOf(cc);
  }, [cc, state.platform]);

  const rows = useMemo<PlatformRow[]>(() => {
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
    // 指定了具体卖家的平台：线切到该卖家价（覆盖平台最低价；无货周断开）
    for (const [pf, seller] of Object.entries(sellerPicks)) {
      if (!seller) continue;
      const arr = pricesByPlatform.get(pf);
      if (!arr) continue;
      for (let i = 0; i < weeks.length; i++) {
        arr[i] = priceForPlatformSeller(cc, skuId, weeks[i].id, pf, seller, state.currency)?.price ?? null;
      }
    }
    const out: PlatformRow[] = [...shopsByPlatform.entries()].map(([platform, shops]) => {
      const prices = pricesByPlatform.get(platform) ?? new Array<number | null>(weeks.length).fill(null);
      let latest: number | null = null;
      for (let i = prices.length - 1; i >= 0; i--) {
        if (prices[i] != null) {
          latest = prices[i];
          break;
        }
      }
      return { platform, shops, seller: sellerPicks[platform] || null, prices, latest, vsLowest: null, vsCurrent: null, lowest: false, current: false };
    });
    const priced = out.filter((r) => r.latest != null);
    const min = priced.length ? Math.min(...priced.map((r) => r.latest!)) : null;
    // 「比当前」最新价口径（与「比最低」同语言）：各平台窗口内最新价 vs 当前取数点窗口内最新价
    let curLatest: number | null = null;
    for (let i = curPrices.length - 1; i >= 0; i--) {
      if (curPrices[i] != null) {
        curLatest = curPrices[i];
        break;
      }
    }
    for (const r of out) {
      if (r.latest != null && min != null) r.vsLowest = r.latest / min - 1;
      r.lowest = r.latest != null && r.latest === min;
      r.vsCurrent = r.latest != null && curLatest != null ? r.latest / curLatest - 1 : null;
      r.current = curPlatform != null && r.platform === curPlatform;
    }
    // 最低价平台置顶，其余按最新价升序，无价殿后（按名称）
    return out.sort((a, b) => {
      if (a.latest != null && b.latest != null) return a.latest - b.latest || a.platform.localeCompare(b.platform);
      if (a.latest != null) return -1;
      if (b.latest != null) return 1;
      return a.platform.localeCompare(b.platform);
    });
  }, [skuId, weeks, cc, state.currency, curPrices, curPlatform, sellerPicks]);

  // chip 色点 = 有价平台序稳定取色（与趋势图线色同源；无价平台灰点）
  const colorByPlatform = useMemo(() => {
    const m = new Map<string, string>();
    let k = 0;
    for (const r of rows) {
      if (r.latest == null) continue;
      m.set(r.platform, PLATFORM_PALETTE[k % PLATFORM_PALETTE.length]);
      k += 1;
    }
    return m;
  }, [rows]);
  const swatchOf = (r: PlatformRow): string => colorByPlatform.get(r.platform) ?? color.hairlineStrong;

  // 关闭即整体卸载（同 DrillModal/SnapshotModal 惯例）：antd Modal 常驻挂载、
  // 仅切 open=false 的关法在 StrictMode 开发态会留下 display:block 的透明遮罩
  // 挡住整页点击——这里渲染期直接不输出 Modal，关闭路径无残留。
  if (!open) return null;

  const toggleHidden = (pf: string): void => {
    setHiddenPfs((prev) => {
      const next = new Set(prev);
      if (next.has(pf)) next.delete(pf);
      else next.add(pf);
      return next;
    });
  };

  return (
    <Modal
      open
      centered
      footer={null}
      width={880}
      onCancel={onClose}
      title={null}
      closable={false}
      styles={{
        content: { borderRadius: radius.modal, boxShadow: shadow.l5, padding: space.lg },
        header: { display: 'none' },
      }}
    >
      <ConfigProvider theme={filterBarTheme}>
        {/* 标题行（系统标题行语言：左标题 + 右角注/关闭） */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span style={{ fontSize: fontSize.displaySm, fontWeight: 600, color: color.ink, whiteSpace: 'nowrap' }}>多平台比价</span>
          <span style={{ fontSize: 12, color: color.mute, marginLeft: 'auto', whiteSpace: 'nowrap' }}>按周 · {usd ? 'USD' : '本币'}</span>
          <button
            type="button"
            aria-label="关闭多平台比价"
            title="关闭"
            onClick={onClose}
            style={{
              width: 26,
              height: 26,
              flexShrink: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: 'none',
              borderRadius: radius.control,
              background: 'none',
              color: color.mute,
              cursor: 'pointer',
            }}
          >
            <CloseOutlined style={{ fontSize: 13 }} />
          </button>
        </div>
        {/* 筛选行（系统字段语言，第一百五十轮）：产品 + 店铺口径（平台→卖家两级
            级联，同顶部筛选条「平台 / 店铺」字段；卖家指定不再藏在 chip 里） */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: color.mute, flexShrink: 0 }}>产品</span>
          <Select
            style={{ width: 300 }}
            value={activeKey ?? undefined}
            placeholder={products.length ? '选择产品' : '当前看板没有可选产品'}
            notFoundContent="当前看板没有可选产品"
            showSearch
            optionFilterProp="label"
            disabled={!products.length}
            onChange={(k) => setPicked(k)}
            options={products.map((p) => ({ value: p.key, label: p.label }))}
          />
          <span aria-hidden style={{ width: 1, height: 20, background: color.hairline, flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: color.mute, flexShrink: 0 }}>店铺口径</span>
          <SellerScopeField cc={cc} pins={sellerPicks} onChange={setSellerPicks} />
        </div>
        {active ? (
          <>
            {/* 平台 chip = 唯一图例（两行，同看板图例药丸语言）：首行 = 色点 + 平台名
                （点平台名下钻卖家）· 店铺/卖家 · 最新价 · 比最低 +x.x%（最低者浅蓝标亮
                挂「最低」）；第二行 = 比当前 ±x.x% / 「当前」徽标；点击 chip 整体 =
                屏蔽/恢复该平台折线（虚线置灰态），色点与折线同源按有价序取色 */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {rows.map((r) => {
                const off = hiddenPfs.has(r.platform);
                return (
                  <span
                    key={r.platform}
                    role="button"
                    aria-pressed={off}
                    title={off ? '点击恢复显示该平台折线' : '点击隐藏该平台折线'}
                    onClick={() => toggleHidden(r.platform)}
                    className="tnum"
                    style={{
                      display: 'inline-flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      gap: 2,
                      padding: '4px 9px 5px',
                      borderRadius: radius.pill,
                      fontSize: 12,
                      whiteSpace: 'nowrap',
                      cursor: 'pointer',
                      opacity: off ? 0.45 : undefined,
                      background: off ? color.canvas : r.lowest ? selectSoft : color.canvas,
                      border: `1px ${off ? 'dashed' : 'solid'} ${off ? color.hairlineStrong : r.lowest ? selectAccent : color.hairline}`,
                      color: off ? color.mute : r.lowest ? selectSoftInk : color.body,
                    }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, lineHeight: '18px' }}>
                      <i aria-hidden style={{ width: 8, height: 3, borderRadius: 2, background: swatchOf(r), flexShrink: 0 }} />
                      <span
                        title={r.seller ? `${r.platform} · 已指定卖家：${r.seller}` : r.platform}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 2,
                          fontWeight: r.lowest ? 600 : 500,
                          color: 'inherit',
                        }}
                      >
                        {r.platform}
                      </span>
                      <span style={{ color: 'inherit', opacity: 0.75, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        · {r.seller ? `卖家：${r.seller}` : `${r.shops} 店铺`}
                      </span>
                      <span style={{ fontWeight: 600, color: off ? color.mute : r.lowest ? selectSoftInk : color.ink }}>
                        · {r.latest != null ? fmtPrice(r.latest, usd) : '—'}
                      </span>
                      <span style={{ color: 'inherit', opacity: 0.75 }}>
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
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, lineHeight: '13px', color: 'inherit', opacity: 0.75 }}>
                      {r.current ? (
                        <span
                          style={{
                            padding: '0 5px',
                            borderRadius: radius.pill,
                            border: `1px solid ${selectAccent}`,
                            background: color.canvas,
                            color: selectSoftInk,
                            fontWeight: 600,
                            lineHeight: '15px',
                            opacity: 1,
                          }}
                        >
                          当前
                        </span>
                      ) : (
                        <>比当前 {vsCurrentText(r.vsCurrent)}</>
                      )}
                    </span>
                  </span>
                );
              })}
            </div>
            <PlatformTrendChart rows={rows} hidden={hiddenPfs} weeks={weeks} curPrices={curPrices} curPlatform={curPlatform} bands={promoBands} />
            <div style={{ fontSize: 11, color: color.mute, marginTop: 10, lineHeight: '17px' }}>
              各平台价格 = 该平台全部店铺内最低在架价（「店铺口径」可按平台指定具体卖家，点 chip 隐藏/恢复折线）；折后价口径，取所选配置的最低价颜色 SKU；「比当前」= 与看板当前取数点（所选店铺/平台，未选时为默认店铺）的差价率；时间范围随看板筛选，图内底色 = 大促档期。
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
