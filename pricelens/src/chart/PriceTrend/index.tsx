// ============================================================
// §4.1 图卡内容 + §6 价格走势全家桶编排：
// 第一行 = 左 [折后价|RRP 复选]；右 [汇总]（仅月/季，写回 state.agg）
// ——每格高度伸缩滑杆（第十轮）收进图内币种符号旁的齿轮弹层（Popover），不占版面；
//   倍率状态仍在本层（与刷选冻结共用 yCfg），经 yScale/sliderScale 受控传入 Chart
// 下方 = Chart（ECharts+覆盖层）> XBrush（重采样窗口）> PromoTable（促销力度热力带）
// Y 轴口径（第七/九轮）：纯自适应分段压缩刻度，无手动覆盖；刷选拖动中冻结 Y 轴
// （onAdjusting），松手统一重算一次——调节过程只有横向重采样，体验稳定。
// 容器高由 Y 模型派生：格数×TICK_PX + 断裂条 + 图顶卡片区 + 底边距（跨度大 → 自动变高）。
// 数据流 = useFilters().state → SeriesQuery → buildSeries → 窗口切片 → PriceTrend
// 窗口状态为图表内部状态（初值=筛选器范围；范围变化收缩、粒度切换对齐桶边界，§6.5）
// 第十九轮口径：时间自适应（默认开）= 范围自动 = 所选产品跨度 ±2 个间隔（钳当前时间），
// RangePicker 冻结；关闭后手动选范围，拖刷轨道 = 筛选范围，平移/拖柄恒钳在轨道内，
// 仅 ‹› 箭头可越界一步并把 rangeStart/End 极值扩展到窗口端点（grow-only，从不收缩）。
// 取数仍按数据全集（数据量小、内存计算）：窗口边缘的续接线需要范围外的邻点。
// ============================================================
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Checkbox, Segmented } from 'antd';
import { useFilters } from '../../state/FiltersContext';
import { buildSeries } from '../../dataModel/aggregate';
import type {
  AggMode,
  Granularity,
  Series,
  SeriesPoint,
  SeriesQuery,
  SkuGroupQuery,
} from '../../dataModel/types';
import type { ProductSelection } from '../../state/filtersTypes';
import { color, fontSize, space } from '../../theme/tokens';
import Chart from './Chart';
import XBrush from './XBrush';
import DrillModal, { type DrillInfo } from './DrillModal';
import {
  GRID,
  adaptiveRangeOf,
  computeYAxis,
  convertWindowIds,
  dataBucketRange,
  enumerateBuckets,
  estGridLeft,
  gridTopFor,
  normalizeWindow,
  perUsdOf,
  seriesSpanRange,
  type Bucket,
  type StripGeom,
  type YScale,
} from './helpers';
import PromoTable from './PromoTable';

export default function PriceTrend() {
  const { state, actions } = useFilters();

  // ---- 图表内部状态 ----
  const [sliderScale, setSliderScale] = useState<number>(1); // 每格高度倍率（不改刻度值；松手才提交）
  const [yCompress, setYCompress] = useState<boolean>(true); // Y 轴自动压缩（第二十轮；关 = Y 轴完全连续）
  const [adjusting, setAdjusting] = useState(false); // 刷选拖动中（冻结 Y 轴自适应）
  const [windowIds, setWindowIds] = useState<[string, string] | null>(null); // null=整个筛选范围
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set()); // 图例卡取消选中的系列（折线隐藏）
  const [stripGeom, setStripGeom] = useState<StripGeom | null>(null); // 图表上报的横向几何（促销热力带对齐用）
  const [drill, setDrill] = useState<DrillInfo | null>(null);

  // §5.6/§6.6：切换产品/价格类型/币种 → 滑杆倍率复位 ×1；图例显隐一并复位
  const yAxisResetKey = JSON.stringify([state.own, state.competitors, state.priceTypes, state.currency]);
  useEffect(() => {
    setSliderScale(1);
    setHiddenKeys(new Set());
  }, [yAxisResetKey]);

  // §6.5 联动：粒度切换 → 窗口端点对齐新粒度桶边界（保持同一时间跨度）
  const granRef = useRef(state.granularity);
  useLayoutEffect(() => {
    if (granRef.current === state.granularity) return;
    const prev = granRef.current;
    granRef.current = state.granularity;
    setWindowIds((ids) => (ids ? convertWindowIds(ids, prev, state.granularity) : null));
  }, [state.granularity]);

  // ---- 取数：useFilters().state → SeriesQuery → buildSeries（§7.3 唯一口径） ----
  // 按数据全集取数（内存小数据集，成本可忽略）：跨度/自适应范围、窗口边缘续接
  // 都要看范围外的邻点；筛选范围只决定轨道边界与窗口的默认值/收缩边界。
  const [dataStart, dataEnd] = useMemo(() => dataBucketRange(state.granularity), [state.granularity]);

  const query: SeriesQuery = useMemo(
    () => ({
      groups: [
        ...state.own.map((g) => ({ ...g, isOwn: true })),
        ...state.competitors.map((g) => ({ ...g, isOwn: false })),
      ],
      granularity: state.granularity,
      startBucket: dataStart,
      endBucket: dataEnd,
      currency: state.currency,
      agg: state.agg,
      platform: state.platform,
    }),
    [state.own, state.competitors, state.granularity, dataStart, dataEnd, state.currency, state.agg, state.platform],
  );

  const allSeries: Series[] = useMemo(() => {
    if (query.groups.length === 0) return [];
    try {
      return buildSeries(query);
    } catch {
      return []; // 空态不崩
    }
  }, [query]);

  // 全集桶 = 桶枚举基准（自适应跨度、窗口下标、边缘续接都基于全集下标空间）
  const buckets: Bucket[] = useMemo(
    () => enumerateBuckets(state.granularity, dataStart, dataEnd),
    [state.granularity, dataStart, dataEnd],
  );

  // ---- 时间自适应（第十九轮，默认开）：范围 = 所选产品数据跨度 ±2 个间隔 ----
  // 钳在数据全集内（右缘 = 数据末端 = 当前时间，不超）；范围变化时窗口复位为整个范围。
  // 关键 = 跨度桶下标（含产品/平台/汇总口径变化）；粒度也参与（±2 按当前粒度间隔计）。
  // adaptiveKey 相同即跳过；关闭时清 key —— 手动改过范围后再打开仍会重新套用自适应。
  // 注意本 effect 声明在 granRef 联动之后：粒度切换时先换桶、自适应范围随后覆盖。
  const span = useMemo(() => seriesSpanRange(allSeries), [allSeries]);
  const adaptiveBounds = useMemo(
    () => (state.adaptive ? adaptiveRangeOf(buckets, span) : null),
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
    setWindowIds(null); // 窗口复位 = 整个自适应范围（X 轴最小最大值即跨度±2）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adaptiveKey]);

  // 窗口渲染期钳入筛选范围：范围缩小时窗口收缩；ids=null = 整个筛选范围
  const win = useMemo(
    () => normalizeWindow(buckets, windowIds, [state.rangeStart, state.rangeEnd]),
    [buckets, windowIds, state.rangeStart, state.rangeEnd],
  );

  // 拖刷轨道 = 筛选范围（第十九轮口径：下面的时间范围必须按上面所选限制）。
  // 窗口（平移/拖柄）恒钳在轨道内；仅 ‹› 箭头可越界一步，越出时 onWindowChange 把
  // rangeStart/End 极值扩展到窗口端点（轨道随之长出）。
  const track = useMemo(
    () => normalizeWindow(buckets, null, [state.rangeStart, state.rangeEnd]),
    [buckets, state.rangeStart, state.rangeEnd],
  );

  // §6.5 窗口内所有桶压满绘图宽度（重采样重绘，无横向滚动条）
  // 第十三轮：edgeStart/edgeEnd = 边缘点在窗口外 2 周内仍有数据（该点非真实开头/截止，
  // 图上画灰色续接短线；右缘为最新时间时无续接 → 按真实截止处理）
  const visSeries: Series[] = useMemo(() => {
    if (win.s > win.e) return [];
    const listed = (p?: SeriesPoint) => !!p && (p.price != null || p.rrp != null);
    return allSeries
      .map((s) => {
        const points = s.points.slice(win.s, win.e + 1);
        const edgeStart = listed(points[0]) && (listed(s.points[win.s - 1]) || listed(s.points[win.s - 2]));
        const edgeEnd =
          listed(points[points.length - 1]) && (listed(s.points[win.e + 1]) || listed(s.points[win.e + 2]));
        return { ...s, points, edgeStart, edgeEnd };
      })
      .filter((s) => s.points.length > 0);
  }, [allSeries, win]);

  // 图例可见系列（卡片取消选中的不画线；Y 轴自适应随之收缩；卡片/促销表仍显示全部）
  const chartSeries: Series[] = useMemo(
    () => visSeries.filter((s) => !hiddenKeys.has(s.key)),
    [visSeries, hiddenKeys],
  );
  const toggleLegend = (key: string): void => {
    setHiddenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Y 轴 = 自适应分段刻度；刷选拖动中冻结（沿用上次 scale，只做横向重采样），
  // 松手统一重算一次 —— 调节过程不再实时改变纵轴（第九轮反馈）。
  // scaleRef 同时是步长滞回的 prev（第十一轮）：存的是"上一次未冻结"的模型，
  // 只要旧步长仍给得出 5~13 格就沿用，窗口平移/价格小漂移不再触发刻度换档+图高突跳
  const scaleRef = useRef<YScale | null>(null);
  const yCfg = useMemo(() => {
    if (adjusting && scaleRef.current) return scaleRef.current;
    const next = computeYAxis({
      series: chartSeries,
      priceTypes: state.priceTypes,
      sliderScale,
      allowBreak: yCompress,
      perUsd: perUsdOf(state.currency), // 档位锚定 USD（第二十三轮）：换币种格数/图高与 USD 相近
      prev: scaleRef.current,
    });
    scaleRef.current = next;
    return next;
  }, [chartSeries, state.priceTypes, sliderScale, adjusting, yCompress, state.currency]);
  // 图顶预留 = 常驻卡片排数（ceil(N/6)）——只随产品选择变化，悬停不变高
  const gridTop = gridTopFor(visSeries.length);
  // 容器高由 Y 模型派生：格数×TICK_PX×倍率 + 断裂条 + 图顶卡片区 + 底边距（跨度大 → 自动变高）
  const chartHeight = yCfg.plotHeight + gridTop + GRID.bottom;
  const gridLeft = estGridLeft(yCfg.max, state.currency, yCfg.interval);

  // ---- 下钻（§6.3）：seriesKey → 取数组，单组重查 ----
  const selByKey = useMemo(() => {
    const m = new Map<string, ProductSelection>();
    for (const s of [...state.own, ...state.competitors]) {
      m.set(`${s.modelId}__${s.romram.replace(/\s+/g, '')}`, s);
    }
    return m;
  }, [state.own, state.competitors]);

  const onDrill = (seriesKey: string, bucketId: string): void => {
    const s = allSeries.find((x) => x.key === seriesKey);
    const sel = selByKey.get(seriesKey);
    if (!s || !sel || state.granularity === 'week') return;
    const group: SkuGroupQuery = { modelId: sel.modelId, romram: sel.romram, skuIds: s.skuIds, isOwn: s.isOwn };
    setDrill({
      group,
      label: s.label,
      originGran: state.granularity === 'quarter' ? 'quarter' : 'month',
      originBucket: bucketId,
    });
  };

  const buildRange = (group: SkuGroupQuery, gran: Granularity, startBucket: string, endBucket: string): Series[] => {
    try {
      return buildSeries({
        groups: [group],
        granularity: gran,
        startBucket,
        endBucket,
        currency: state.currency,
        agg: state.agg,
        platform: state.platform,
      });
    } catch {
      return [];
    }
  };

  // ---- 交互 handlers ----
  const setPriceType = (key: 'discounted' | 'rrp', val: boolean): void => {
    const next = { ...state.priceTypes, [key]: val };
    if (!next.discounted && !next.rrp) return; // 至少保留一种价格
    actions.set({ priceTypes: next });
  };

  /**
   * §6.5（第十九轮修订）：窗口的一切改动统一走这里。平移/拖柄已被 XBrush 钳在轨道
   * （= 筛选范围）内，唯一能越界的是 ‹› 箭头——窗口越出范围时把 rangeStart/End
   * 左/右极值扩展到窗口端点（grow-only，从不收缩），即「点箭头改变时间筛选器的
   * 最小最大值」；例：筛选 2026Q2–Q4 按 ‹ → 窗口 2026Q1–Q3，RangePicker 左极值随之变 2026Q1。
   */
  const onWindowChange = (s: number, e: number): void => {
    const bs = buckets[s];
    const be = buckets[e];
    if (!bs || !be) return;
    if (bs.id < state.rangeStart || be.id > state.rangeEnd) {
      actions.set({
        rangeStart: bs.id < state.rangeStart ? bs.id : state.rangeStart,
        rangeEnd: be.id > state.rangeEnd ? be.id : state.rangeEnd,
      });
    }
    setWindowIds([bs.id, be.id]);
  };

  // ---- 渲染 ----
  return (
    <div>
      {/* 标题行（第十二轮）：价格走势 + 折后价/RRP + 汇总 同排（汇总仅月/季，右对齐），
          消除原「标题排 / 筛选排 / 页签排」三段式留下的纵向空白；
          每格高度伸缩滑杆与刻度线开关在图内币种符号旁的齿轮弹层里 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: space.md,
          marginBottom: space.sm,
        }}
      >
        <h2 style={{ margin: 0, fontSize: fontSize.displaySm, fontWeight: 600, color: color.ink }}>价格走势</h2>
        <Checkbox checked={state.priceTypes.discounted} onChange={(e) => setPriceType('discounted', e.target.checked)}>
          折后价
        </Checkbox>
        <Checkbox checked={state.priceTypes.rrp} onChange={(e) => setPriceType('rrp', e.target.checked)}>
          RRP
        </Checkbox>
        {/* 数据汇总：仅月/季粒度出现（§6.1），写回 state.agg */}
        {state.granularity !== 'week' && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: space.sm, fontSize: fontSize.bodySm, color: color.body }}>
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

      {/* 图主体（Y 轴纯自适应；X 刷选条在图表块之下） */}
      <Chart
        series={chartSeries}
        legendSeries={visSeries}
        hiddenKeys={hiddenKeys}
        onToggleLegend={toggleLegend}
        granularity={state.granularity}
        currency={state.currency}
        priceTypes={state.priceTypes}
        gridLeft={gridLeft}
        gridTop={gridTop}
        enableDrill={state.granularity !== 'week'}
        enableJump={state.granularity === 'week'}
        enableOffer={state.granularity === 'week'}
        onDrill={onDrill}
        windowKey={`${win.s}:${win.e}`}
        onGeom={setStripGeom}
        yScale={yCfg}
        sliderScale={sliderScale}
        onSliderScale={setSliderScale}
        yCompress={yCompress}
        onYCompress={setYCompress}
        emptyHint={
          visSeries.length > 0 && chartSeries.length === 0
            ? '所有系列已在图例中隐藏，点击顶部图例卡恢复显示'
            : undefined
        }
      />
      {/* X 刷选条（窗口状态为图表内部状态；轨道 = 筛选范围；自适应开 = 轨道冻结） */}
      {buckets.length > 0 && visSeries.length > 0 && (
        <XBrush
          buckets={buckets}
          s={win.s}
          e={win.e}
          lo={track.s}
          hi={track.e}
          frozen={state.adaptive}
          granularity={state.granularity}
          onChange={onWindowChange}
          onAdjusting={setAdjusting}
        />
      )}

      {/* 促销力度热力带（第十五轮：列几何复用图表 plotLeft/plotWidth，与时间轴逐像素对齐） */}
      {visSeries.length > 0 && win.s <= win.e && (
        <PromoTable series={visSeries} currency={state.currency} geom={stripGeom} />
      )}

      {/* 月/季下钻弹窗 */}
      <DrillModal
        info={drill}
        currency={state.currency}
        agg={state.agg}
        priceTypes={state.priceTypes}
        platform={state.platform}
        buildRange={buildRange}
        onClose={() => setDrill(null)}
      />
    </div>
  );
}
