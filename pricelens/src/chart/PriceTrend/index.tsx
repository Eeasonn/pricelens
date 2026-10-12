// ============================================================
// §4.1 图卡内容 + §6 价格走势全家桶编排：
// 第一行 = 左 [折后价|RRP 复选]；右 [汇总]（仅月/季，写回 state.agg）
// ——每格高度伸缩滑杆（第十轮）收进图内币种符号旁的齿轮弹层（Popover），不占版面；
//   倍率状态仍在本层（与刷选冻结共用 yCfg），经 yScale/sliderScale 受控传入 Chart
// 下方 = Chart（ECharts+覆盖层）> XBrush（重采样窗口）> PromoTable（促销力度矩阵）
// Y 轴口径（第七/九轮）：纯自适应分段压缩刻度，无手动覆盖；刷选拖动中冻结 Y 轴
// （onAdjusting），松手统一重算一次——调节过程只有横向重采样，体验稳定。
// 容器高由 Y 模型派生：格数×TICK_PX + 断裂条 + 图顶卡片区 + 底边距（跨度大 → 自动变高）。
// 数据流 = useFilters().state → SeriesQuery → buildSeries → 窗口切片 → PriceTrend
// 窗口状态为图表内部状态（初值=筛选器范围；范围变化收缩、粒度切换对齐桶边界，§6.5）
// 第三轮口径：XBrush 轨道 = 数据全集时间轴；取数也按全集（数据量小、内存计算），
// 显示仍只切窗口；窗口（箭头/拖柄/平移）越出筛选范围时把 rangeStart/End 极值扩展到窗口端点。
// ============================================================
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Checkbox, Segmented } from 'antd';
import { useFilters } from '../../state/FiltersContext';
import { buildSeries } from '../../dataModel/aggregate';
import type {
  AggMode,
  Granularity,
  Series,
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
  computeYAxis,
  convertWindowIds,
  dataBucketRange,
  enumerateBuckets,
  estGridLeft,
  gridTopFor,
  normalizeWindow,
  type Bucket,
  type YScale,
} from './helpers';
import PromoTable from './PromoTable';

export default function PriceTrend() {
  const { state, actions } = useFilters();

  // ---- 图表内部状态 ----
  const [sliderScale, setSliderScale] = useState<number>(1); // 每格高度倍率（不改刻度值；松手才提交）
  const [adjusting, setAdjusting] = useState(false); // 刷选拖动中（冻结 Y 轴自适应）
  const [windowIds, setWindowIds] = useState<[string, string] | null>(null); // null=整个筛选范围
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set()); // 图例卡取消选中的系列（折线隐藏）
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
  // 第三轮起按数据全集取数（内存小数据集，成本可忽略）：窗口可在全时间轴上自由平移/拉伸，
  // 越出筛选范围时无需等待重取数；筛选范围只决定窗口的默认值与收缩边界。
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

  // 轨道桶 = 数据全集时间轴（第三轮口径，不再随筛选范围缩小）
  const buckets: Bucket[] = useMemo(
    () => enumerateBuckets(state.granularity, dataStart, dataEnd),
    [state.granularity, dataStart, dataEnd],
  );

  // 窗口渲染期钳入筛选范围：范围缩小时窗口收缩；ids=null = 整个筛选范围
  const win = useMemo(
    () => normalizeWindow(buckets, windowIds, [state.rangeStart, state.rangeEnd]),
    [buckets, windowIds, state.rangeStart, state.rangeEnd],
  );

  // §6.5 窗口内所有桶压满绘图宽度（重采样重绘，无横向滚动条）
  const visSeries: Series[] = useMemo(() => {
    if (win.s > win.e) return [];
    return allSeries
      .map((s) => ({ ...s, points: s.points.slice(win.s, win.e + 1) }))
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
    const next = computeYAxis({ series: chartSeries, priceTypes: state.priceTypes, sliderScale, prev: scaleRef.current });
    scaleRef.current = next;
    return next;
  }, [chartSeries, state.priceTypes, sliderScale, adjusting]);
  // 图顶预留 = 常驻卡片排数（ceil(N/6)）——只随产品选择变化，悬停不变高
  const gridTop = gridTopFor(visSeries.length);
  // 容器高由 Y 模型派生：格数×TICK_PX×倍率 + 断裂条 + 图顶卡片区 + 底边距（跨度大 → 自动变高）
  const chartHeight = yCfg.plotHeight + gridTop + GRID.bottom;
  const gridLeft = estGridLeft(yCfg.max, state.currency);

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
   * §6.5（第三轮）：窗口的一切改动（箭头步进/双端拖柄/整体平移）统一走这里。
   * 窗口越出筛选范围时，把筛选范围左/右极值扩展到窗口端点（grow-only，从不收缩）——
   * 例：筛选 2026Q2–Q4 按 ‹ → 窗口 2026Q1–Q3，RangePicker 左极值随之变 2026Q1。
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
      {/* 图内筛选器行（§6.1/§4.1）：价格类型复选（左）+ 汇总（右，仅月/季）。
          每格高度伸缩滑杆已收进图内币种符号旁的齿轮弹层（第十轮） */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: space.md,
          marginBottom: space.md,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: space.md }}>
          <Checkbox checked={state.priceTypes.discounted} onChange={(e) => setPriceType('discounted', e.target.checked)}>
            折后价
          </Checkbox>
          <Checkbox checked={state.priceTypes.rrp} onChange={(e) => setPriceType('rrp', e.target.checked)}>
            RRP
          </Checkbox>
        </div>
        {/* 数据汇总：仅月/季粒度出现（§6.1），写回 state.agg */}
        {state.granularity !== 'week' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: space.sm, fontSize: fontSize.bodySm, color: color.body }}>
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
        yScale={yCfg}
        sliderScale={sliderScale}
        onSliderScale={setSliderScale}
        emptyHint={
          visSeries.length > 0 && chartSeries.length === 0
            ? '所有系列已在图例中隐藏，点击顶部图例卡恢复显示'
            : undefined
        }
      />
      {/* X 刷选条（窗口状态为图表内部状态；轨道 = 全时间轴；拖动中冻结 Y 轴自适应） */}
      {buckets.length > 0 && visSeries.length > 0 && (
        <XBrush buckets={buckets} s={win.s} e={win.e} granularity={state.granularity} onChange={onWindowChange} onAdjusting={setAdjusting} />
      )}

      {/* 促销力度矩阵表（行=产品，列=窗口内每个时间节点，格=相对上市价降幅%） */}
      {visSeries.length > 0 && win.s <= win.e && (
        <PromoTable series={visSeries} currency={state.currency} />
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
