// ============================================================
// 第112轮（2026-10-21）量价看板：三面板并排（价格折线 + 底部销量柱）。
// 面板结构照价格看板分离模式：共享 Y 轴列（SplitAxisColumn，三面板价格并集
// 算一次 computeYAxis 受控传入，含步长滞回与刷选冻结）、共享 X 刷选条（只调
// 查看时间段，粒度切换走 actions.setGranularity）、跨面板悬停参考线 + 面板头
// 销量读数随悬停列联动。时间窗口 / 自适应 / 桶换算与价格看板同口径（§6.5）。
// 销量柱：绘图区底部 34%，柱层画在价格线之下；上限口径 = 各图独立 / 三图一致 /
// 对数（标题行 Segmented），单图可用面板头「销量轴」药丸覆写（一致模式禁用）。
// 销量为估算口径（dataModel/volume），接入真实销量后替换。
// 默认三槽：槽1 = 我司首个勾选（无则竞品首个）；槽2/3 = 其对标竞品前两个，
// 不足用竞品勾选补，仍不足留空；我司首选或国家/产业变化时重置三槽。
// ============================================================
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ConfigProvider, Segmented } from 'antd';
import { useFilters } from '../state/FiltersContext';
import FilterBar from '../components/FilterBar';
import PageHeader from '../components/PageHeader';
import PlatformBox from '../components/FilterBar/PlatformBox';
import CurrencyBox from '../components/FilterBar/CurrencyBox';
import { filterBarTheme } from '../components/FilterBar';
import Chart from '../chart/PriceTrend/Chart';
import ChartToolbar from '../chart/PriceTrend/ChartToolbar';
import XBrush from '../chart/PriceTrend/XBrush';
import SplitAxisColumn from '../chart/PriceTrend/SplitAxisColumn';
import { collectTierValues, type LineShapeChoice } from '../chart/PriceTrend/chartModel';
import {
  NAME_ZONE_W,
  adaptiveRangeOf,
  computeYAxis,
  convertWindowIds,
  dataBucketRange,
  enumerateBuckets,
  estGridLeft,
  normalizeWindow,
  perUsdOf,
  seriesSpanRange,
  splitAxisWidth,
  type Bucket,
  type StripGeom,
  type YScale,
} from '../chart/PriceTrend/helpers';
import { buildSeries, lowestPriceColorSku } from '../dataModel/aggregate';
import { niceCeil, volumeByBuckets } from '../dataModel/volume';
import { groupsFromBenchmark } from '../state/configStore';
import { dimProduct } from '../data';
import type { AggMode, Series, SeriesPoint } from '../dataModel/types';
import type { ProductSelection } from '../state/filtersTypes';
import { brandColorOf, color, fontSize, radius, shadow, space } from '../theme/tokens';
import VolumeBars from './volume/VolumeBars';
import PanelHeader, { type VolumeOption } from './volume/PanelHeader';
import { vMaxOf, type VolumeAxisMode, type VolumeSlot } from './volume/volumeAxis';

const SLOTS = 3;
const PANEL_HEAD_H = 32; // 面板头定高：共享轴列的纵向对齐基准
const PANEL_GRID_TOP = 14; // 面板图顶窄空气带（同分离模式）

interface SlotInfo {
  isOwn: boolean;
  brand: string;
  skuIds: string[];
}

/** 槽位 → 取数信息：代表 SKU = 最低价颜色（无价数据回退该配置全部颜色 SKU） */
function resolveSlot(slot: VolumeSlot, cc: string): SlotInfo | null {
  const norm = slot.romram.replace(/\s+/g, '');
  const rows = dimProduct.filter((p) => p.model_id === slot.modelId && p.romram.replace(/\s+/g, '') === norm);
  if (rows.length === 0) return null;
  const pool = rows.filter((p) => p.countries.includes(cc));
  const skuPool = pool.length ? pool : rows;
  const low = lowestPriceColorSku(slot.modelId, slot.romram, cc);
  const skuIds = low != null && skuPool.some((p) => p.sku_id === low) ? [low] : skuPool.map((p) => p.sku_id);
  return { isOwn: rows[0].is_own === true, brand: rows[0].brand, skuIds };
}

/** 默认三槽：槽1 = 我司首选（无则竞品首选）；槽2/3 = 其对标前两个，竞品勾选补位 */
function defaultSlots(own: ProductSelection[], competitors: ProductSelection[]): (VolumeSlot | null)[] {
  const first = own[0] ?? competitors[0] ?? null;
  const picks: VolumeSlot[] = [];
  const push = (s: VolumeSlot | null): void => {
    if (!s || picks.length >= SLOTS) return;
    if (picks.some((p) => p.modelId === s.modelId && p.romram.replace(/\s+/g, '') === s.romram.replace(/\s+/g, ''))) return;
    picks.push(s);
  };
  if (first) {
    push({ modelId: first.modelId, romram: first.romram });
    // 槽1 为我司时按配置矩阵带出对标（主竞品在前）；竞品视角不带
    if (own.length > 0) {
      for (const b of groupsFromBenchmark([{ modelId: first.modelId, romram: first.romram, skuIds: first.skuIds }])) {
        push(b);
      }
    }
  }
  for (const c of competitors) push({ modelId: c.modelId, romram: c.romram });
  return [0, 1, 2].map((i) => picks[i] ?? null);
}

export default function VolumePrice() {
  const { state, actions } = useFilters();
  const cc = state.countryCode;

  // ---- 视图状态（同价格看板口径；三面板共用） ----
  const [slots, setSlots] = useState<(VolumeSlot | null)[]>(() => defaultSlots(state.own, state.competitors));
  const [sliderScale, setSliderScale] = useState(1);
  const [yCompress, setYCompress] = useState(false);
  const [showYTicks, setShowYTicks] = useState(true);
  const [lineShape, setLineShape] = useState<LineShapeChoice>('auto');
  const [adjusting, setAdjusting] = useState(false); // 刷选拖动中冻结价格 Y 轴
  const [windowIds, setWindowIds] = useState<[string, string] | null>(null);
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set());
  const [axisMode, setAxisMode] = useState<VolumeAxisMode>('independent');
  const [caps, setCaps] = useState<(number | null)[]>([null, null, null]); // 单图销量轴上限覆写
  const [hoverIdx, setHoverIdx] = useState<number | null>(null); // 跨面板共享悬停时间列
  const [geoms, setGeoms] = useState<(StripGeom | null)[]>([null, null, null]); // 各面板绘图区横向几何

  // 我司首选 / 国家 / 产业变化 → 三槽重置为默认（手选槽位此时被重置）
  const slotResetKey = JSON.stringify([state.own[0]?.modelId ?? null, state.own[0]?.romram ?? null, cc, state.industry]);
  const slotResetRef = useRef(slotResetKey);
  useEffect(() => {
    if (slotResetRef.current === slotResetKey) return;
    slotResetRef.current = slotResetKey;
    setSlots(defaultSlots(state.own, state.competitors));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotResetKey]);

  // 换产品/价格类型/币种 → 高度倍率、图例屏蔽与销量轴覆写复位（同看板 §5.6）
  const yAxisResetKey = JSON.stringify([slots, state.priceTypes, state.currency]);
  useEffect(() => {
    setSliderScale(1);
    setHiddenKeys(new Set());
    setCaps([null, null, null]);
  }, [yAxisResetKey]);

  // 粒度切换 → 窗口端点对齐新粒度桶边界（保持同一时间跨度）
  const granRef = useRef(state.granularity);
  useLayoutEffect(() => {
    if (granRef.current === state.granularity) return;
    const prev = granRef.current;
    granRef.current = state.granularity;
    setWindowIds((ids) => (ids ? convertWindowIds(ids, prev, state.granularity) : null));
  }, [state.granularity]);

  // ---- 取数：每面板独立 buildSeries（数据全集，窗口切片照分离模式） ----
  const [dataStart, dataEnd] = useMemo(() => dataBucketRange(state.granularity), [state.granularity]);
  const buckets: Bucket[] = useMemo(
    () => enumerateBuckets(state.granularity, dataStart, dataEnd),
    [state.granularity, dataStart, dataEnd],
  );

  const panelData = useMemo(
    () =>
      slots.map((slot, i) => {
        if (!slot) return { idx: i, key: `empty-${i}`, slot: null, isOwn: false, brand: '', series: [] as Series[] };
        const info = resolveSlot(slot, cc);
        let series: Series[] = [];
        if (info && info.skuIds.length > 0) {
          try {
            series = buildSeries({
              groups: [{ modelId: slot.modelId, romram: slot.romram, skuIds: info.skuIds, isOwn: info.isOwn }],
              granularity: state.granularity,
              startBucket: dataStart,
              endBucket: dataEnd,
              currency: state.currency,
              agg: state.agg,
              platform: state.platform,
              scope: { countryCode: cc, industry: state.industry },
            });
          } catch {
            series = []; // 空态不崩
          }
        }
        return {
          idx: i,
          key: `${slot.modelId}__${slot.romram.replace(/\s+/g, '')}`,
          slot,
          isOwn: info?.isOwn ?? false,
          brand: info?.brand ?? '',
          series,
        };
      }),
    [slots, cc, state.industry, state.granularity, dataStart, dataEnd, state.currency, state.agg, state.platform],
  );

  // 时间自适应：三面板数据跨度并集 → 上方极值筛选器（同 index.tsx 写法；
  // 本 effect 声明在粒度换算之后：切粒度先换桶，自适应范围随后覆盖）
  const span = useMemo(() => seriesSpanRange(panelData.flatMap((p) => p.series)), [panelData]);
  const adaptiveBounds = useMemo(
    () => (state.adaptive ? adaptiveRangeOf(buckets, span, 0) : null),
    [state.adaptive, buckets, span],
  );
  const adaptiveKey = adaptiveBounds ? `${state.granularity}|${adaptiveBounds[0]}|${adaptiveBounds[1]}` : '';
  const adaptiveAppliedRef = useRef('');
  useLayoutEffect(() => {
    if (!adaptiveBounds) {
      adaptiveAppliedRef.current = '';
      return;
    }
    if (adaptiveAppliedRef.current === adaptiveKey) return;
    adaptiveAppliedRef.current = adaptiveKey;
    actions.set({ rangeStart: adaptiveBounds[0], rangeEnd: adaptiveBounds[1] });
    setWindowIds(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adaptiveKey]);

  const win = useMemo(
    () => normalizeWindow(buckets, windowIds, [state.rangeStart, state.rangeEnd]),
    [buckets, windowIds, state.rangeStart, state.rangeEnd],
  );
  const filterBounds = useMemo<[number, number]>(() => {
    const indexOf = (id: string, fallback: number): number => {
      const i = buckets.findIndex((b) => b.id === id);
      return i >= 0 ? i : fallback;
    };
    const start = indexOf(state.rangeStart, 0);
    const end = indexOf(state.rangeEnd, Math.max(0, buckets.length - 1));
    return start <= end ? [start, end] : [end, start];
  }, [buckets, state.rangeStart, state.rangeEnd]);

  // 窗口切片（同分离模式 sliceVis：含边缘续接标记）
  const sliceVis = (list: Series[]): Series[] => {
    if (win.s > win.e) return [];
    const listed = (p?: SeriesPoint) => !!p && (p.price != null || p.rrp != null);
    return list
      .map((s) => {
        const points = s.points.slice(win.s, win.e + 1);
        const edgeStart = listed(points[0]) && (listed(s.points[win.s - 1]) || listed(s.points[win.s - 2]));
        const edgeEnd =
          listed(points[points.length - 1]) && (listed(s.points[win.e + 1]) || listed(s.points[win.e + 2]));
        return { ...s, points, edgeStart, edgeEnd };
      })
      .filter((s) => s.points.length > 0);
  };
  const panelViews = useMemo(
    () =>
      panelData.map((p) => ({
        ...p,
        all: sliceVis(p.series), // 名称药丸全集（含被屏蔽系列）
        vis: sliceVis(p.series).filter((s) => !hiddenKeys.has(s.key)),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [panelData, win, hiddenKeys],
  );
  const toggleLegend = (key: string): void => {
    setHiddenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // ---- 共享价格 Y 轴：三面板可见系列并集算一次（步长滞回 + 刷选冻结） ----
  const visUnion = useMemo(() => panelViews.flatMap((p) => p.vis), [panelViews]);
  const scaleRef = useRef<YScale | null>(null);
  const yCfg = useMemo(() => {
    if (adjusting && scaleRef.current) return scaleRef.current;
    const next = computeYAxis({
      series: visUnion,
      priceTypes: state.priceTypes,
      sliderScale,
      allowBreak: yCompress,
      perUsd: perUsdOf(state.currency),
      prev: scaleRef.current,
    });
    scaleRef.current = next;
    return next;
  }, [visUnion, state.priceTypes, sliderScale, adjusting, yCompress, state.currency]);
  const tierValues = useMemo(() => collectTierValues(visUnion, state.priceTypes), [visUnion, state.priceTypes]);

  // ---- 销量：可见窗口桶口径（不随平台/币种变化） ----
  const winBuckets = useMemo(() => buckets.slice(win.s, win.e + 1), [buckets, win]);
  const winBucketIds = useMemo(() => winBuckets.map((b) => b.id), [winBuckets]);
  const volumes = useMemo(
    () =>
      panelData.map((p) =>
        p.slot ? volumeByBuckets(p.slot.modelId, p.slot.romram, cc, state.granularity, winBucketIds) : [],
      ),
    [panelData, cc, state.granularity, winBucketIds],
  );
  // 三图一致 = 三面板最大值取整；独立/对数 = 各面板自算（单图覆写优先）
  const unifiedMax = useMemo(() => {
    let m = 0;
    for (const vs of volumes) for (const v of vs) if (v != null && v > m) m = v;
    return niceCeil(m);
  }, [volumes]);
  const panelVMax = volumes.map((vs, i) => (axisMode === 'unified' ? unifiedMax : vMaxOf(vs, caps[i])));

  // 面板头下拉选项：当前国家 × 产业去重到（型号, 配置），分组 [我司][竞品]
  const productOptions = useMemo<{ label: string; options: VolumeOption[] }[]>(() => {
    const seen = new Set<string>();
    const collect = (own: boolean): VolumeOption[] => {
      const out: VolumeOption[] = [];
      for (const p of dimProduct) {
        if (p.industry !== state.industry || !p.countries.includes(cc) || p.is_own !== own) continue;
        const key = `${p.model_id}|${p.romram}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ value: key, label: `${p.brand} ${p.model_name} ${p.romram}` });
      }
      out.sort((a, b) => a.label.localeCompare(b.label));
      return out;
    };
    const ownOpts = collect(true);
    const compOpts = collect(false);
    return ownOpts.length > 0
      ? [{ label: '我司', options: ownOpts }, { label: '竞品', options: compOpts }]
      : [{ label: '竞品', options: compOpts }];
  }, [cc, state.industry]);

  // 槽位选择 / 几何上报
  const onSlotSelect = (i: number, key: string | null): void => {
    setSlots((prev) =>
      prev.map((s, k) => {
        if (k !== i) return s;
        if (key == null) return null;
        const sep = key.indexOf('|');
        return { modelId: key.slice(0, sep), romram: key.slice(sep + 1) };
      }),
    );
  };
  const onGeomOf = (i: number) => (g: StripGeom | null): void => {
    setGeoms((prev) => {
      const cur = prev[i];
      if (cur === g) return prev;
      if (cur && g && cur.plotLeft === g.plotLeft && cur.plotWidth === g.plotWidth && cur.n === g.n) return prev;
      const next = [...prev];
      next[i] = g;
      return next;
    });
  };

  // 面板头销量读数：悬停列优先，无悬停取最新有值期
  const volumeReading = (vs: (number | null)[]): number | null => {
    if (hoverIdx != null) return vs[hoverIdx] ?? null;
    for (let i = vs.length - 1; i >= 0; i--) if (vs[i] != null) return vs[i];
    return null;
  };

  const setPriceType = (key: 'discounted' | 'rrp', val: boolean): void => {
    const next = { ...state.priceTypes, [key]: val };
    if (!next.discounted && !next.rrp) return; // 至少保留一种价格
    actions.set({ priceTypes: next });
  };

  /** 刷选只调整查看窗口；粒度切换走 actions.setGranularity（保持时间跨度） */
  const onWindowChange = (s: number, e: number): void => {
    if (!buckets[s] || !buckets[e]) return;
    setWindowIds([buckets[s].id, buckets[e].id]);
  };
  const onRangeFilterChange = (startId: string, endId: string): void => {
    const start = buckets.findIndex((b) => b.id === startId);
    const end = buckets.findIndex((b) => b.id === endId);
    if (start < 0 || end < 0) return;
    const lo = Math.min(start, end);
    const hi = Math.max(start, end);
    actions.set({ adaptive: false, rangeStart: buckets[lo].id, rangeEnd: buckets[hi].id });
    setWindowIds(null);
  };

  return (
    <div data-lpl-scroll style={{ height: '100%', overflowX: 'auto', background: color.canvasSoft }}>
      <div style={{ minWidth: 1280, minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
        <PageHeader title="量价看板" />
        <FilterBar />
        <main style={{ flex: 1, padding: space.lg }}>
          <section
            style={{
              background: color.canvas,
              boxShadow: shadow.l1,
              borderRadius: radius.card,
              padding: space.lg,
            }}
          >
            {/* 标题行：平台/币种/销量轴口径（右侧）+ 月季汇总 */}
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: space.md, marginBottom: space.sm }}>
              <h2 style={{ margin: 0, fontSize: fontSize.displaySm, fontWeight: 600, color: color.ink }}>量价走势</h2>
              <ConfigProvider theme={filterBarTheme}>
                <div
                  style={{
                    marginLeft: 'auto',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    color: color.mute,
                    fontSize: 12,
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    平台 <span style={{ width: 160 }}><PlatformBox /></span>
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>币种 <CurrencyBox /></span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    销量轴
                    <Segmented
                      size="small"
                      value={axisMode}
                      onChange={(v) => setAxisMode(v as VolumeAxisMode)}
                      options={[
                        { label: '各图独立', value: 'independent' },
                        { label: '三图一致', value: 'unified' },
                        { label: '对数', value: 'log' },
                      ]}
                    />
                  </span>
                </div>
              </ConfigProvider>
              {state.granularity !== 'week' && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: space.sm,
                    fontSize: fontSize.bodySm,
                    color: color.body,
                  }}
                >
                  <span>汇总：</span>
                  <Segmented
                    size="small"
                    value={state.agg}
                    onChange={(v) => actions.set({ agg: v as AggMode })}
                    options={[
                      { label: '平均值', value: 'avg' },
                      { label: '最小值', value: 'min' },
                    ]}
                  />
                </div>
              )}
            </div>

            {/* 常驻工具行：齿轮（每格高度/Y 刻度线/自动压缩/折线样式）+ 折后价/RRP 胶囊 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 32, padding: '0 6px', marginBottom: 2 }}>
              <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                <ChartToolbar
                  currency={state.currency}
                  sliderScale={sliderScale}
                  onSliderScale={setSliderScale}
                  showYTicks={showYTicks}
                  onShowYTicks={setShowYTicks}
                  yCompress={yCompress}
                  onYCompress={setYCompress}
                  lineShape={lineShape}
                  onLineShape={setLineShape}
                  priceTypes={state.priceTypes}
                  onPriceTypeToggle={setPriceType}
                />
              </div>
            </div>

            {/* 面板区：[共享 Y 轴列][三面板网格]；柱层在价格线之下（zIndex 0 < 1） */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: space.md, marginBottom: space.sm }}>
              <div style={{ flex: `0 0 ${splitAxisWidth(state.currency)}px`, paddingTop: PANEL_HEAD_H }}>
                <SplitAxisColumn
                  yScale={yCfg}
                  currency={state.currency}
                  gridLeft={estGridLeft(state.currency)}
                  panelGridTop={PANEL_GRID_TOP}
                  showYTicks={showYTicks}
                  tierValues={tierValues}
                />
              </div>
              <div style={{ flex: '1 1 0', minWidth: 0 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: space.md }}>
                  {panelViews.map((p) => (
                    <div
                      key={p.key}
                      style={{
                        border: `1px solid ${color.hairline}`,
                        borderRadius: radius.card,
                        background: color.canvas,
                        padding: '0 8px 0',
                        position: 'relative',
                        isolation: 'isolate',
                      }}
                    >
                      <PanelHeader
                        slot={p.slot}
                        options={productOptions}
                        isOwn={p.isOwn}
                        brand={p.brand}
                        volume={volumeReading(volumes[p.idx])}
                        axisMode={axisMode}
                        cap={caps[p.idx]}
                        onCap={(v) => setCaps((prev) => prev.map((c, k) => (k === p.idx ? v : c)))}
                        onSelect={(key) => onSlotSelect(p.idx, key)}
                      />
                      <div style={{ position: 'relative' }}>
                        <VolumeBars
                          geom={geoms[p.idx]}
                          plotTop={PANEL_GRID_TOP}
                          plotHeight={yCfg.plotHeight}
                          values={volumes[p.idx]}
                          vMax={panelVMax[p.idx]}
                          mode={axisMode === 'log' ? 'log' : 'linear'}
                          color={p.vis[0]?.color ?? brandColorOf(p.brand)}
                          hoverIdx={hoverIdx}
                        />
                        <Chart
                          series={p.vis}
                          granularity={state.granularity}
                          currency={state.currency}
                          priceTypes={state.priceTypes}
                          gridLeft={NAME_ZONE_W}
                          gridTop={PANEL_GRID_TOP}
                          chrome={false}
                          axisChrome={false}
                          showYTicks={showYTicks}
                          enableDrill={false}
                          enableJump={state.granularity === 'week'}
                          windowKey={`${win.s}:${win.e}:${p.key}`}
                          yScale={yCfg}
                          namesInZone
                          nameSeries={p.all}
                          hiddenKeys={hiddenKeys}
                          onToggleHidden={toggleLegend}
                          lineShape={lineShape}
                          showXLabels
                          crosshairIdx={hoverIdx}
                          onCrosshairMove={setHoverIdx}
                          onGeom={onGeomOf(p.idx)}
                          emptyHint={p.slot ? '该产品在所选时间范围内无数据' : '请选择产品'}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 共享刷选条：一个窗口联动三面板；粒度切换走时间设置面板 */}
            {buckets.length > 0 && visUnion.length > 0 && (
              <XBrush
                buckets={buckets}
                s={win.s}
                e={win.e}
                lo={filterBounds[0]}
                hi={filterBounds[1]}
                plotLeft={estGridLeft(state.currency)}
                adaptive={state.adaptive}
                granularity={state.granularity}
                onChange={onWindowChange}
                onRangeChange={onRangeFilterChange}
                onGranularityChange={actions.setGranularity}
                onToggleAdaptive={() => actions.set({ adaptive: !state.adaptive })}
                onAdjusting={setAdjusting}
              />
            )}

            <div style={{ marginTop: space.xs, fontSize: 11, color: color.mute }}>
              销量为估算口径：按折扣深度、促销档期与上市周期推算，接入销量数据后自动替换。
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
