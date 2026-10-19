// ============================================================
// §4.1 图卡内容 + §6 价格走势全家桶编排：
// 第一行 = 左 [折后价|RRP 复选]；右 [汇总]（仅月/季，写回 state.agg）
// ——每格高度伸缩滑杆（第十轮）收进图内币种符号旁的齿轮弹层（Popover），不占版面；
//   倍率状态仍在本层（与刷选冻结共用 yCfg），经 yScale/sliderScale 受控传入 Chart
// 下方 = Chart（ECharts+覆盖层）> XBrush（重采样窗口）。
// 第五十六轮（领导页面清洁要求）：促销力度热力带（原横向色格带）撤出主视觉，
// 收进「⋯ 更多」二级菜单 → 右侧抽屉纵向表格（PromoDrawer）；最高/最低价与
// 价格变化提醒同收二级菜单且默认关闭。再版（用户拍板）：时点页签（价格摘要条
// ——折扣率/现价/划线RRP/来源横排）撤出主视觉后不埋抽屉，改图右缘书签带
// （PointPanel，默认收起 24px 窄带）→ 图右侧原地展开 336px 内嵌面板（纵向
// 一行一产品框，图表收窄不遮挡）；主视觉 = 标题行+工具行+图+（窄书签带）。
// Y 轴口径（第七/九轮）：纯自适应分段压缩刻度，无手动覆盖；刷选拖动中冻结 Y 轴
// （onAdjusting），松手统一重算一次——调节过程只有横向重采样，体验稳定。
// 容器高由 Y 模型派生：格数×TICK_PX + 断裂条 + 图顶卡片区 + 底边距（跨度大 → 自动变高）。
// 数据流 = useFilters().state → SeriesQuery → buildSeries → 窗口切片 → PriceTrend
// 时间自适应（默认开）按所选产品最早/最晚有效价格桶确定上方极值筛选器；
// 底部刷选轨道只在该筛选范围内提供查看窗口。
// 上方极值筛选器手动改值即转入自定义；底部拖柄/平移只调整筛选范围内的查看窗口。
// 取数仍按数据全集（数据量小、内存计算）：窗口边缘的续接线需要范围外的邻点。
// ============================================================
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Checkbox, ConfigProvider, Segmented, Switch } from 'antd';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { useFilters } from '../../state/FiltersContext';
import PlatformBox from '../../components/FilterBar/PlatformBox';
import CurrencyBox from '../../components/FilterBar/CurrencyBox';
import { filterBarTheme } from '../../components/FilterBar';
import { navBus } from '../../state/navBus';
import { modelNameOf } from '../../components/ProductCascader/tree';
import { useAlerts } from '../../components/AlertCenter';
import { groupAlertsBySeries, latestAlerts } from '../../dataModel/alerts';
import { buildSeries, lowestPriceColorSku } from '../../dataModel/aggregate';
import { getEffectiveBenchmark } from '../../state/configStore';
import { dimPromo, dimProduct } from '../../data';
import type {
  AggMode,
  Granularity,
  Series,
  SeriesPoint,
  SeriesQuery,
  SkuGroupQuery,
} from '../../dataModel/types';
import type { ProductSelection } from '../../state/filtersTypes';
import { color, fontSize, radius, space } from '../../theme/tokens';
import Chart from './Chart';
import ChartToolbar from './ChartToolbar';
import XBrush from './XBrush';
import LegendPills from './LegendPills';
import DrillModal, { type DrillInfo } from './DrillModal';
import {
  buildPriceSummary,
  buildPromoBands,
  collectTierValues,
  type LineShapeChoice,
} from './chartModel';
import SplitAxisColumn from './SplitAxisColumn';
import {
  GRID,
  adaptiveRangeOf,
  bucketLatestWeekLabel,
  bucketSpans,
  computeYAxis,
  convertWindowIds,
  dataBucketRange,
  enumerateBuckets,
  estGridLeft,
  normalizeWindow,
  perUsdOf,
  seriesSpanRange,
  splitAxisWidth,
  bucketIdOfWeek,
  NAME_ZONE_W,
  type Bucket,
  type YScale,
} from './helpers';
import PromoDrawer from './PromoDrawer';
import PointPanel from './PointPanel';

export default function PriceTrend() {
  const { state, actions } = useFilters();

  // ---- 图表内部状态 ----
  const [sliderScale, setSliderScale] = useState<number>(1); // 每格高度倍率（不改刻度值；松手才提交）
  const [yCompress, setYCompress] = useState<boolean>(false); // Y 轴自动压缩（第三十五轮起默认关 = 完全连续；迪总「不自动选择」）
  const [adjusting, setAdjusting] = useState(false); // 刷选拖动中（冻结 Y 轴自适应）
  const [windowIds, setWindowIds] = useState<[string, string] | null>(null); // null=整个筛选范围
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set()); // 图例取消选中的系列（折线隐藏）
  const [drill, setDrill] = useState<DrillInfo | null>(null);
  const [promoBandsOn, setPromoBandsOn] = useState(true); // 大促档期（第三十五轮：外部显式筛选器，默认选）
  const [offersOn, setOffersOn] = useState(true); // offer 权益显隐（第五十轮）：关 = 不画徽章、浮窗不出权益行
  // 最高/最低价 + 价格变化提醒（第五十六轮）：非主要功能——默认关，收进工具行
  // 「⋯ 更多」二级菜单（领导页面清洁要求）；启用时 ⋯ 按钮带蓝点提示
  const [maxMinOn, setMaxMinOn] = useState(false);
  // 价格变化提醒：null=关；阈值=小数（0.05=5%），滑杆 0~15% 连贯可调（0.5 步进）
  const [changeThreshold, setChangeThreshold] = useState<number | null>(null);
  // 促销力度明细抽屉（第五十六轮）：原图下横向热力带收进二级抽屉（纵向表格）
  const [promoDetailOpen, setPromoDetailOpen] = useState(false);
  // 时点面板（第五十六轮再版，用户拍板）：图右缘书签带（默认收起）→ 图右侧原地
  // 展开 336px 内嵌面板（非视口抽屉——抽屉会盖住图右缘最新数据），纵向一行一
  // 产品框；展开态不持久化（每次进页面默认收起=领导视角永远干净）；促销明细
  // 抽屉打开时自动收起（右侧空间冲突）
  const [pointPanelOpen, setPointPanelOpen] = useState(false);
  const openPromoDetail = (): void => {
    setPointPanelOpen(false);
    setPromoDetailOpen(true);
  };
  // 齿轮弹层里的两个视图开关（第五十四轮追补上提到本层）：分离模式下由常驻工具行
  // 统一写，主图与全部分离面板同值（此前是各 Chart 实例内部状态，互相不同步）
  const [showYTicks, setShowYTicks] = useState(false);
  // 折线形态（第五十四轮追补③）：auto=按粒度自适应（周=阶梯 / 月季=平滑），缺省
  const [lineShape, setLineShape] = useState<LineShapeChoice>('auto');

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
  // 都要看范围外的邻点；当前选区决定图上可见的数据段。
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
      scope: { countryCode: state.countryCode, industry: state.industry },
    }),
    [state.own, state.competitors, state.granularity, dataStart, dataEnd, state.currency, state.agg, state.platform, state.countryCode, state.industry],
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

  // ---- 时间自适应：上方极值筛选器 = 所选产品最早/最晚有效价格桶 ----
  // 范围变化时窗口复位为整个范围。即使新增产品落在原有跨度内，也要重新套用一次
  // 自动极值（例如从总览聚焦周进入后，清除局部窗口）。
  // 关闭时清 key；用户手动刷选后的自定义范围不受产品变化影响。
  // 注意本 effect 声明在 granRef 联动之后：粒度切换时先换桶、自适应范围随后覆盖。
  const span = useMemo(() => seriesSpanRange(allSeries), [allSeries]);
  const adaptiveBounds = useMemo(
    () => (state.adaptive ? adaptiveRangeOf(buckets, span, 0) : null),
    [state.adaptive, buckets, span],
  );
  const selectedProductKey = JSON.stringify([
    state.own.map(({ modelId, romram }) => `${modelId}|${romram}`).sort(),
    state.competitors.map(({ modelId, romram }) => `${modelId}|${romram}`).sort(),
  ]);
  const adaptiveKey = adaptiveBounds
    ? `${state.granularity}|${adaptiveBounds[0]}|${adaptiveBounds[1]}|${selectedProductKey}`
    : '';
  const adaptiveAppliedRef = useRef('');
  useLayoutEffect(() => {
    if (!adaptiveBounds) {
      adaptiveAppliedRef.current = '';
      return;
    }
    if (adaptiveAppliedRef.current === adaptiveKey) return;
    adaptiveAppliedRef.current = adaptiveKey;
    actions.set({ rangeStart: adaptiveBounds[0], rangeEnd: adaptiveBounds[1] });
    setWindowIds(null); // 窗口复位 = 整个自动极值范围
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adaptiveKey]);

  // 追补⑧（总览↔看板闭环②）：总览下钻（竞品对比/迷你图点周）携带「焦点周」——
  // 挂载后窗口对准该周 ±8 周（月 ±2 桶、季 ±1 桶，时间跨度近似），直接回答
  // 「这个低价是怎么发生的」。声明在自适应 effect 之后：挂载首帧自适应先落范围，
  // 这里再聚焦（最终窗口以焦点为准）；normalizeWindow 渲染期会把窗口钳入筛选范围。
  // 焦点周经 bucketIdOfWeek 跨粒度换算（总览给周 id，看板可能停在月/季）。navBus 一次性消费
  useEffect(() => {
    const wk = navBus.dashboardFocusWeekId;
    if (!wk) return;
    navBus.dashboardFocusWeekId = null;
    const id = bucketIdOfWeek(state.granularity, wk);
    const i = id != null ? buckets.findIndex((b) => b.id === id) : -1;
    if (i < 0) return;
    const half = state.granularity === 'week' ? 8 : state.granularity === 'month' ? 2 : 1;
    setWindowIds([buckets[Math.max(0, i - half)].id, buckets[Math.min(buckets.length - 1, i + half)].id]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 从总览带入焦点周时 windowIds 可暂时缩小可见段；刷选后回到完整选区。
  const win = useMemo(
    () => normalizeWindow(buckets, windowIds, [state.rangeStart, state.rangeEnd]),
    [buckets, windowIds, state.rangeStart, state.rangeEnd],
  );
  // 左侧时间筛选器的范围 = 底部窗口轨道的范围；窗口本身仍可在轨道内缩放查看。
  const filterBounds = useMemo<[number, number]>(() => {
    const indexOf = (id: string, fallback: number): number => {
      const i = buckets.findIndex((b) => b.id === id);
      return i >= 0 ? i : fallback;
    };
    const start = indexOf(state.rangeStart, 0);
    const end = indexOf(state.rangeEnd, Math.max(0, buckets.length - 1));
    return start <= end ? [start, end] : [end, start];
  }, [buckets, state.rangeStart, state.rangeEnd]);


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

  // 预警订阅（第五十二轮建；第五十三轮入口上移）：时点页签（PriceSummary）尾铃铛
  // = 按系列（modelId__romram）订阅预警中心，四类预警（追补⑨）
  const alerts = useAlerts();
  const subscribedKeys = useMemo(() => new Set(state.alertSubs), [state.alertSubs]);
  const toggleAlertSub = (key: string): void => actions.toggleAlertSub(key);

  // 追补⑨：看板预警显示——时点页签铃铛黄点 = 该系列触发条数（与预警中心页同一引擎）
  const alertCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const [key, items] of groupAlertsBySeries(latestAlerts(alerts))) m[key] = items.length;
    return m;
  }, [alerts]);

  // ---- ROM 多选 chips（第五十四轮追补，用户需求 5a/5b）：该我司产品的全部内存存储选项 ----
  // 默认选中 = 当前 own 里该型号的 ROM（总览「竞品对比」带入 = 点击的那个）；
  // 勾选/取消 → setOwnSelection 重设该型号勾选组（最低价色代表），autoMatch 开时竞品自动并集
  const entryModelId = state.own[0]?.modelId ?? null;
  const romOptions = useMemo(() => {
    if (!entryModelId) return [] as { romram: string }[];
    const seen: string[] = [];
    for (const p of dimProduct) {
      if (p.sku_id.startsWith(entryModelId + '__') && !seen.includes(p.romram)) seen.push(p.romram);
    }
    return seen.map((romram) => ({ romram }));
  }, [entryModelId]);
  const selectedRoms = useMemo(
    () => new Set(state.own.filter((s) => s.modelId === entryModelId).map((s) => s.romram)),
    [state.own, entryModelId],
  );
  const toggleRom = (romram: string): void => {
    if (!entryModelId) return;
    const next = new Set(selectedRoms);
    if (next.has(romram)) {
      if (next.size <= 1) return; // 至少保留一个 ROM 在图上
      next.delete(romram);
    } else {
      next.add(romram);
    }
    const others = state.own.filter((s) => s.modelId !== entryModelId);
    const mine = [...next]
      .map((r) => {
        const sku = lowestPriceColorSku(entryModelId, r);
        return sku ? { modelId: entryModelId, romram: r, skuIds: [sku] } : null;
      })
      .filter((x): x is ProductSelection => x != null);
    actions.setOwnSelection([...others, ...mine]);
  };

  // 切换入口产品或取消到单 ROM 后，清理不再可用的分离视图状态。
  useEffect(() => {
    if (selectedRoms.size < 2 || !state.own.every((s) => s.modelId === entryModelId)) {
      setSplitOn(false);
      setPanelOrder([]);
    }
  }, [entryModelId, selectedRoms.size, state.own]);

  // ---- 分离显示：多 ROM 勾选时主图变为同一横向滚动轨道，每面板 =
  // 一个 ROM + 其对标竞品（生效矩阵按 own_romram 取、主竞品 sort 序）；共享 Y 轴 =
  // 全面板 series 并集算一次 computeYAxis 受控传入；X 轴各面板独立绘制（同窗口桶）；
  // 面板头 ‹ › 调展示顺序；共享刷选条联动全部面板，系列页签统一放到共享工具行中央
  const [splitOn, setSplitOn] = useState(false);
  // 分离模式一行可见面板数：卡片始终横向排列，超出视口后由轨道滚动查看。
  // 默认 2 个兼顾图表可读性；3 个适合宽屏快速扫读。
  const [splitColumns, setSplitColumns] = useState<2 | 3>(2);
  const [panelOrder, setPanelOrder] = useState<string[]>([]); // romram 键序；空 = own 序
  const splitActive = splitOn && selectedRoms.size >= 2 && state.own.length >= 2 && state.own.every((s) => s.modelId === entryModelId);

  const panels = useMemo(() => {
    if (!splitActive) return [];
    const bench = getEffectiveBenchmark();
    // 分离面板必须遵循筛选条当前的竞品选择。此前这里直接读取生效对标矩阵，
    // 即使用户在筛选条删空竞品，面板仍会把默认对标重新画出来。
    const selectedByKey = new Map(
      state.competitors.map((group) => [`${group.modelId}|${group.romram.replace(/\s+/g, '')}`, group]),
    );
    return state.own.map((sel) => {
      const seen = new Set<string>();
      const mappedComps = bench
        .filter((b) => b.own_model_id === sel.modelId && b.own_romram === sel.romram)
        .sort((a, b) => a.sort - b.sort)
        .map((b) => {
          const p = dimProduct.find((r) => r.sku_id === b.competitor_sku_id);
          if (!p) return null;
          const group = selectedByKey.get(`${p.sku_id.split('__')[0]}|${p.romram.replace(/\s+/g, '')}`);
          if (!group || seen.has(group.modelId + '|' + group.romram)) return null;
          seen.add(group.modelId + '|' + group.romram);
          return group;
        })
        .filter((x): x is ProductSelection => x != null);
      // 手动模式没有 own-ROM 关联时，至少按同一容量匹配，避免把全局竞品
      // 重复画到每一张 ROM 卡片；有配置映射时优先遵循映射顺序。
      const fallbackComps = state.competitors.filter(
        (group) => group.romram.replace(/\s+/g, '') === sel.romram.replace(/\s+/g, '') && !seen.has(group.modelId + '|' + group.romram),
      );
      const comps = state.autoMatch ? mappedComps : [...mappedComps, ...fallbackComps];
      return { key: `${sel.modelId}__${sel.romram.replace(/\s+/g, '')}`, sel, comps };
    });
  }, [splitActive, state.own, state.competitors, state.autoMatch]);

  const panelData = useMemo(() => {
    if (panels.length === 0) return [];
    return panels.map(({ key, sel, comps }) => {
      let series: Series[] = [];
      try {
        series = buildSeries({
          groups: [
            { ...sel, isOwn: true },
            ...comps.map((c) => ({ ...c, isOwn: false })),
          ],
          granularity: state.granularity,
          startBucket: dataStart,
          endBucket: dataEnd,
          currency: state.currency,
          agg: state.agg,
          platform: state.platform,
          scope: { countryCode: state.countryCode, industry: state.industry },
        });
      } catch {
        series = []; // 空态不崩
      }
      return { key, sel, comps, series };
    });
  }, [panels, state.granularity, dataStart, dataEnd, state.currency, state.agg, state.platform, state.countryCode, state.industry]);

  // 面板窗口切片（与单图 visSeries 同逻辑：win 切片 + 边缘续接标记）
  const sliceVis = (list: Series[]): Series[] => {
    if (win.s > win.e) return [];
    const listed = (p?: SeriesPoint) => !!p && (p.price != null || p.rrp != null);
    return list
      .map((s) => {
        const points = s.points.slice(win.s, win.e + 1);
        const edgeStart = listed(points[0]) && (listed(s.points[win.s - 1]) || listed(s.points[win.s - 2]));
        const edgeEnd = listed(points[points.length - 1]) && (listed(s.points[win.e + 1]) || listed(s.points[win.e + 2]));
        return { ...s, points, edgeStart, edgeEnd };
      })
      .filter((s) => s.points.length > 0);
  };
  const panelViews = useMemo(
    () =>
      panelData.map((p) => ({
        ...p,
        all: sliceVis(p.series), // 全量（含被图例页签屏蔽的系列，页签要能恢复显示）
        vis: sliceVis(p.series).filter((s) => !hiddenKeys.has(s.key)),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [panelData, win, hiddenKeys],
  );

  // 共享 Y 轴：全面板 series 并集算一次（各面板受控传入同一 yScale，刻度逐像素一致）。
  // splitYCfg/splitGridLeft 声明在主图 gridLeft 之后（见下方）
  const orderedPanels = useMemo(() => {
    if (panelOrder.length === 0) return panelViews;
    const idx = (k: string) => {
      const i = panelOrder.indexOf(k);
      return i === -1 ? 999 : i;
    };
    return [...panelViews].sort((a, b) => idx(a.key) - idx(b.key));
  }, [panelViews, panelOrder]);

  const movePanel = (key: string, dir: -1 | 1): void => {
    const keys = orderedPanels.map((p) => p.key);
    const i = keys.indexOf(key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= keys.length) return;
    const next = [...keys];
    [next[i], next[j]] = [next[j], next[i]];
    setPanelOrder(next);
  };

  // 面板下钻：seriesKey 在面板内查找（主图 allSeries 不含面板 series）
  const makePanelDrill = (
    panel: (typeof panelViews)[number],
  ): ((seriesKey: string, bucketId: string) => void) => {
    const groups = [
      { ...panel.sel, isOwn: true },
      ...panel.comps.map((c) => ({ ...c, isOwn: false })),
    ];
    return (seriesKey: string, bucketId: string) => {
      if (state.granularity === 'week') return;
      const s = panel.series.find((x) => x.key === seriesKey);
      const grp = groups.find((g) => `${g.modelId}__${g.romram.replace(/\s+/g, '')}` === seriesKey);
      if (!s || !grp) return;
      setDrill({
        group: { modelId: grp.modelId, romram: grp.romram, skuIds: s.skuIds, isOwn: grp.isOwn },
        label: s.label,
        originGran: state.granularity === 'quarter' ? 'quarter' : 'month',
        originBucket: bucketId,
      });
    };
  };

  // ---- 价格摘要条（第三十六轮定版）：固定显示窗口内最新时点（不随悬停变换，
  //      时点明细看悬停浮窗）；竞品与我司同款样式、来源为取证超链接 ----
  const summary = useMemo(() => buildPriceSummary(chartSeries), [chartSeries]);

  // ---- 大促背景带（第三十四轮）：dim_promo ∩ 窗口桶覆盖区间；随窗口联动 ----
  const winBuckets = useMemo(() => buckets.slice(win.s, win.e + 1), [buckets, win]);

  // 时点页签日期（第五十四轮追补①）：窗口末桶内最新日历周的周三锚日（MM-DD）——
  // 月/季粒度不再显示 2026-10 / 2026Q4（用户：时点恒为最新那一周对应的那一天；
  // 窗口平移到过去时跟随窗口，与摘要条数值口径一致）
  const pointDate = useMemo(() => {
    const last = winBuckets[winBuckets.length - 1];
    return last ? bucketLatestWeekLabel(state.granularity, last.id) : null;
  }, [winBuckets, state.granularity]);

  const winSpans = useMemo(() => bucketSpans(state.granularity, winBuckets), [state.granularity, winBuckets]);
  const promoBands = useMemo(
    () => (promoBandsOn ? buildPromoBands({ promos: dimPromo, spans: winSpans }) : []),
    [promoBandsOn, winSpans],
  );

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
  // 图顶预留（第三十五轮）：钉顶卡片删除，36px 只保留 ₽/$+齿轮（左）与图例 chips（右）
  const gridTop = 36;
  // 分离面板图顶（第五十四轮追补）：面板 chrome=false 无工具行，只留窄空气带——
  // S/E 徽标上探 7.5px、名称避让钳 plotTop+2，14px 够用；极值胶囊已在 Chart 内钳回容器
  const panelGridTop = 14;
  // 容器高由 Y 模型派生：格数×TICK_PX×倍率 + 断裂条 + 图顶卡片区 + 底边距（跨度大 → 自动变高）
  const chartHeight = yCfg.plotHeight + gridTop + GRID.bottom;
  const gridLeft = estGridLeft(yCfg.max, state.currency, yCfg.interval);

  // 分离显示共享 Y 轴：全面板 series 并集算一次（各面板受控传入同一 yScale，刻度逐像素一致）。
  // 第五十四轮追补②：补上步长滞回 prev——此前缺 prev，季粒度把促销低谷平均掉后
  // rawSpan 收窄 706→662、跨过 niceStep 的 150 档界，步长 200→100、格数 5→9，
  // 图高 +68%（用户：切到季度 Y 轴高度显著拉高）。带 prev 后季沿用 200（5 格 ∈ 滞回区间），
  // 图高与周完全一致。splitScaleRef 与主图 scaleRef 各自独立（两模式互不串档）
  const splitScaleRef = useRef<YScale | null>(null);
  const splitYCfg = useMemo(() => {
    if (!splitActive || panelViews.length === 0) {
      splitScaleRef.current = null;
      return null;
    }
    const next = computeYAxis({
      series: panelViews.flatMap((p) => p.vis),
      priceTypes: state.priceTypes,
      sliderScale,
      allowBreak: yCompress,
      perUsd: perUsdOf(state.currency),
      prev: splitScaleRef.current,
    });
    splitScaleRef.current = next;
    return next;
  }, [splitActive, panelViews, state.priceTypes, sliderScale, yCompress, state.currency]);
  const splitGridLeft = useMemo(
    () => (splitYCfg ? estGridLeft(splitYCfg.max, state.currency, splitYCfg.interval) : gridLeft),
    [splitYCfg, state.currency, gridLeft],
  );
  // 共享轴列的档位带数据（第五十四轮追补⑤）：与面板同一份并集判定「档内有无数据」
  const splitTierValues = useMemo(
    () => collectTierValues(panelViews.flatMap((p) => p.vis), state.priceTypes),
    [panelViews, state.priceTypes],
  );
  // 面板头行高（追补⑤重排）：轴列用同一偏移对齐面板绘图区顶（卡片 paddingTop 4 + 头 24）
  const PANEL_HEAD_H = 24;

  // 分离卡片的横向轨道在面板数超过当前可见列数时才可滚动；
  // 记录两端状态，给没有明显系统滚动条的环境补一条可见提示。
  const splitScrollRef = useRef<HTMLDivElement | null>(null);
  const [splitOverflow, setSplitOverflow] = useState({ left: false, right: false });
  useLayoutEffect(() => {
    const el = splitScrollRef.current;
    if (!splitActive || !el) {
      setSplitOverflow((prev) => (prev.left || prev.right ? { left: false, right: false } : prev));
      return;
    }
    const sync = (): void => {
      const max = Math.max(0, el.scrollWidth - el.clientWidth);
      const left = el.scrollLeft > 2;
      const right = max - el.scrollLeft > 2;
      setSplitOverflow((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
    };
    sync();
    el.addEventListener('scroll', sync, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(sync);
    observer?.observe(el);
    if (el.firstElementChild) observer?.observe(el.firstElementChild);
    return () => {
      el.removeEventListener('scroll', sync);
      observer?.disconnect();
    };
  }, [splitActive, orderedPanels.length, splitColumns, splitGridLeft]);

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
        scope: { countryCode: state.countryCode, industry: state.industry },
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

  /** Bottom brush is the time filter: any move becomes a custom analysis range. */
  const onWindowChange = (s: number, e: number): void => {
    if (!buckets[s] || !buckets[e]) return;
    setWindowIds([buckets[s].id, buckets[e].id]);
  };

  /** 左侧时间筛选器：用户明确指定极值后退出自动，并重置底部窗口。 */
  const onRangeFilterChange = (startId: string, endId: string): void => {
    const start = buckets.findIndex((b) => b.id === startId);
    const end = buckets.findIndex((b) => b.id === endId);
    if (start < 0 || end < 0) return;
    const lo = Math.min(start, end);
    const hi = Math.max(start, end);
    actions.set({ adaptive: false, rangeStart: buckets[lo].id, rangeEnd: buckets[hi].id });
    setWindowIds(null);
  };

  // ---- 渲染 ----
  return (
    <div>
      {/* 标题行（第十二轮引入；第五十四轮追补）：标题带括号说明 + ROM 多选 chips
          （该产品全部内存存储选项，默认选中 = 进入来源 ROM；多选 = 竞品取并集同图对比）
          ——折后价/RRP 在图内 Y 轴齿轮旁，大促/offer/极值/变化提醒在图例行居中圆框组 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: space.md,
          marginBottom: space.sm,
        }}
      >
        <h2 style={{ margin: 0, fontSize: fontSize.displaySm, fontWeight: 600, color: color.ink }}>
          价格走势
          <span style={{ fontSize: 14, fontWeight: 600, color: color.mute, marginLeft: 2 }}>
            （{entryModelId ? modelNameOf(entryModelId) : '我司的这个产品'}）
          </span>
        </h2>
        {/* ROM 多选 chips（第五十四轮追补，用户需求 5a/5b）：checkbox 样式，至少保留一个选中；
            autoMatch 开时竞品随勾选 ROM 的配置矩阵并集自动跟随 */}
        {romOptions.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {romOptions.map(({ romram }) => {
              const on = selectedRoms.has(romram);
              return (
                <Checkbox key={romram} checked={on} onChange={() => toggleRom(romram)}>
                  <span style={{ fontSize: 12.5, fontWeight: on ? 700 : 400, color: on ? color.ink : color.body }}>
                    {romram}
                  </span>
                </Checkbox>
              );
            })}
          </div>
        )}
        {/* 分离显示（第五十四轮拍板）：多 ROM 时可切 N 宫格（2 列），每面板一个 ROM+其竞品 */}
        {selectedRoms.size >= 2 && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Switch size="small" checked={splitOn} onChange={setSplitOn} />
            <span style={{ fontSize: 12.5, color: color.body, whiteSpace: 'nowrap' }}>分离显示</span>
          </span>
        )}
        <ConfigProvider theme={filterBarTheme}>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12, color: color.mute, fontSize: 12 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              平台 <span style={{ width: 160 }}><PlatformBox /></span>
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>币种 <CurrencyBox /></span>
          </div>
        </ConfigProvider>
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

      {/* 图主体 + 图右缘时点面板（第五十六轮再版，用户拍板）：flex 行 =
          [图列 flex1][书签带 / 336px 内嵌面板]——时点摘要锚在图右侧（它就是图右缘
          最新数据的文字版），收起 = 24px 竖排书签带（默认，领导视角只是窄灰带），
          展开 = 原地面板纵向一行一产品（非视口抽屉，不遮图右缘），图自动收窄。
          （Y 轴纯自适应；系列页签由工具行统一居中承载）。
          分离显示：多 ROM 勾选时主图变为单行横向轨道——每面板一个
          ROM+其对标竞品，共享 Y 轴（并集算一次受控传入）、X 轴各面板独立绘制；
          共享刷选条联动全部面板；系列页签统一放在共享工具行中央。
          第五十四轮追补：工具行不再随面板重复——面板网格上方常驻一条（ChartToolbar），
          面板 chrome=false，全部视图开关由常驻行统一控制 */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
        <div style={{ flex: '1 1 0', minWidth: 0 }}>
          {splitActive ? (
        <>
          {/* 常驻工具行（第五十四轮追补，用户需求）：分离模式下这一行仍常驻在摘要页签
              与面板网格之间，统管底下全部分离面板——大促/offer/极值/变化提醒 + 齿轮
              （每格高度/刻度线/自动压缩/折线样式）+ 折后价/RRP；面板内不再各有设置行 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 32, padding: '0 6px', marginBottom: 2 }}>
            <div style={{ flex: '1 1 auto', minWidth: 0 }}>
              <ChartToolbar
                legend={<LegendPills series={panelViews.flatMap((p) => p.all)} hiddenKeys={hiddenKeys} onToggle={toggleLegend} />}
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
                promoBandsOn={promoBandsOn}
                onPromoBandsOn={setPromoBandsOn}
                offersOn={offersOn}
                onOffersOn={setOffersOn}
                maxMinOn={maxMinOn}
                onMaxMinOn={setMaxMinOn}
                changeThreshold={changeThreshold}
                onChangeThreshold={setChangeThreshold}
                onOpenPromoDetail={openPromoDetail}
              />
            </div>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0, whiteSpace: 'nowrap' }}>
              <span style={{ fontSize: 11, color: color.mute }}>每行</span>
              <Segmented
                size="small"
                value={splitColumns}
                onChange={(v) => setSplitColumns(v as 2 | 3)}
                options={[{ label: '2 个', value: 2 }, { label: '3 个', value: 3 }]}
              />
            </span>
          </div>
          {/* 分离面板：所有卡片固定在同一横向轨道；共享 Y 轴固定在左侧，轨道超出视口时横向滚动。
              每行可见 2/3 个由用户控制，卡片保持最小宽度以避免图表与系列名拥挤。 */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: space.md,
              marginBottom: space.sm,
            }}
          >
            <div style={{ flex: `0 0 ${splitAxisWidth(state.currency, splitGridLeft, showYTicks)}px`, paddingTop: 4 + PANEL_HEAD_H }}>
              {splitYCfg && (
                <SplitAxisColumn
                  yScale={splitYCfg}
                  currency={state.currency}
                  gridLeft={splitGridLeft}
                  panelGridTop={panelGridTop}
                  showYTicks={showYTicks}
                  tierValues={splitTierValues}
                />
              )}
            </div>
            <div style={{ flex: '1 1 0', minWidth: 0 }}>
              <div
                ref={splitScrollRef}
                className="price-trend-split-scroll"
                role="region"
                aria-label="分离走势面板，可横向滚动"
                tabIndex={0}
                style={{
                  overflowX: 'auto',
                  overflowY: 'hidden',
                  scrollbarGutter: 'stable',
                  paddingBottom: 6,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'stretch', gap: space.md, width: '100%', minWidth: 0 }}>
                  {orderedPanels.map((p) => {
                  const i = orderedPanels.findIndex((x) => x.key === p.key);
                  const first = i === 0;
                  const last = i === orderedPanels.length - 1;
                  return (
                    <div
                      key={p.key}
                      style={{
                        flex: `0 0 calc((100% - ${(splitColumns - 1) * Number(space.md)}px) / ${splitColumns})`,
                        // 宽度由「每行 2/3 个」控制，不设固定最小宽度；否则窄屏下
                        // 选择 2 个时仍只能看到一张完整卡片，失去切换该视图的意义。
                        minWidth: 0,
                        border: `1px solid ${color.hairline}`,
                        borderRadius: radius.card,
                        padding: '4px 8px 0',
                        background: color.canvas,
                        boxSizing: 'border-box',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          height: PANEL_HEAD_H, // 定高：轴列对齐基准（追补⑤）
                          padding: '0 4px',
                        }}
                      >
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: color.ink, whiteSpace: 'nowrap' }}>
                          {p.sel.romram}
                        </span>
                        <span style={{ fontSize: 10.5, color: color.mute, whiteSpace: 'nowrap' }}>我司 + 对标竞品</span>
                        <span style={{ flex: 1 }} />
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          <span
                            role="button"
                            title={first ? '已在最左' : '左移该面板'}
                            onClick={() => movePanel(p.key, -1)}
                            style={{ cursor: first ? 'default' : 'pointer', display: 'inline-flex', padding: '2px 4px' }}
                          >
                            <LeftOutlined style={{ fontSize: 10, color: first ? color.hairlineStrong : color.body }} />
                          </span>
                          <span
                            role="button"
                            title={last ? '已在最右' : '右移该面板'}
                            onClick={() => movePanel(p.key, 1)}
                            style={{ cursor: last ? 'default' : 'pointer', display: 'inline-flex', padding: '2px 4px' }}
                          >
                            <RightOutlined style={{ fontSize: 10, color: last ? color.hairlineStrong : color.body }} />
                          </span>
                        </span>
                      </div>
                      <Chart
                        series={p.vis}
                        granularity={state.granularity}
                        currency={state.currency}
                        priceTypes={state.priceTypes}
                        gridLeft={NAME_ZONE_W} // 追补⑤②：与合并模式同宽的名称预留带在面板内侧（此前 0 导致名称与折线重叠）
                        gridTop={panelGridTop}
                        chrome={false} // 面板不渲染设置行（第五十四轮追补）：统管权在上方常驻行
                        axisChrome={false} // 面板不画轴（追补⑤）：档位带/刻度/断轴号在共享轴列
                        enableDrill={state.granularity !== 'week'}
                        enableJump={state.granularity === 'week'}
                        enableOffer={state.granularity === 'week' && offersOn}
                        onDrill={makePanelDrill(p)}
                        windowKey={`${win.s}:${win.e}:${p.key}`}
                        yScale={splitYCfg ?? undefined}
                        showYTicks={showYTicks}
                        lineShape={lineShape}
                        promoBandsOn={promoBandsOn}
                        promoBands={promoBands}
                        maxMinOn={maxMinOn}
                        changeThreshold={changeThreshold}
                        emptyHint="该配置在所选时间范围内无数据"
                      />
                    </div>
                  );
                  })}
                </div>
              </div>
              {(splitOverflow.left || splitOverflow.right) && (
                <div className="price-trend-split-scroll-hint" aria-live="polite">
                  {splitOverflow.left && <span>← 返回左侧</span>}
                  {splitOverflow.right && <span>横向查看更多 →</span>}
                </div>
              )}
            </div>
          </div>
          {/* 共享刷选条：一个窗口联动全部面板 */}
          {buckets.length > 0 && visSeries.length > 0 && (
            <XBrush
              buckets={buckets}
              s={win.s}
              e={win.e}
              lo={filterBounds[0]}
              hi={filterBounds[1]}
              plotLeft={splitGridLeft}
              adaptive={state.adaptive}
              granularity={state.granularity}
              onChange={onWindowChange}
              onRangeChange={onRangeFilterChange}
              onGranularityChange={actions.setGranularity}
              onToggleAdaptive={() => actions.set({ adaptive: !state.adaptive })}
              onAdjusting={setAdjusting}
            />
          )}
        </>
      ) : (
        <>
          <Chart
            series={chartSeries}
            granularity={state.granularity}
            currency={state.currency}
            priceTypes={state.priceTypes}
            gridLeft={gridLeft}
            gridTop={gridTop}
            legend={<LegendPills series={visSeries} hiddenKeys={hiddenKeys} onToggle={toggleLegend} />}
            enableDrill={state.granularity !== 'week'}
            enableJump={state.granularity === 'week'}
            enableOffer={state.granularity === 'week' && offersOn}
            onDrill={onDrill}
            windowKey={`${win.s}:${win.e}`}
            onOpenPromoDetail={openPromoDetail}
            yScale={yCfg}
            sliderScale={sliderScale}
            onSliderScale={setSliderScale}
            yCompress={yCompress}
            onYCompress={setYCompress}
            showYTicks={showYTicks}
            onShowYTicks={setShowYTicks}
            lineShape={lineShape}
            onLineShape={setLineShape}
            promoBandsOn={promoBandsOn}
            onPromoBandsOn={setPromoBandsOn}
            promoBands={promoBands}
            maxMinOn={maxMinOn}
            changeThreshold={changeThreshold}
            onPriceTypeToggle={setPriceType}
            offersOn={offersOn}
            onOffersOn={setOffersOn}
            onMaxMinOn={setMaxMinOn}
            onChangeThreshold={setChangeThreshold}
            emptyHint={
              visSeries.length > 0 && chartSeries.length === 0
                ? '所有系列已在图例中隐藏，点击上方页签恢复显示'
                : undefined
            }
          />
        </>
      )}
      {/* X 刷选条只调整上方极值范围内的查看窗口。 */}
          {!splitActive && buckets.length > 0 && visSeries.length > 0 && (
            <XBrush
              buckets={buckets}
              s={win.s}
              e={win.e}
              lo={filterBounds[0]}
              hi={filterBounds[1]}
              plotLeft={gridLeft}
              adaptive={state.adaptive}
              granularity={state.granularity}
              onChange={onWindowChange}
              onRangeChange={onRangeFilterChange}
              onGranularityChange={actions.setGranularity}
              onToggleAdaptive={() => actions.set({ adaptive: !state.adaptive })}
              onAdjusting={setAdjusting}
            />
          )}
        </div>
        {/* 图右缘时点面板（第五十六轮再版）：书签带（收起）/ 336px 纵向产品清单（展开） */}
        <PointPanel
          open={pointPanelOpen}
          onToggle={() => setPointPanelOpen((v) => !v)}
          items={summary}
          currency={state.currency}
          granularity={state.granularity}
          pointDate={pointDate}
          alertCounts={alertCounts}
          subscribedKeys={subscribedKeys}
          onToggleSubscribe={toggleAlertSub}
        />
      </div>

      {/* 促销力度明细抽屉（第五十六轮）：原图下横向热力带收进二级抽屉——纵向表格
          （行=时间最新在上，列=产品），入口在工具行「⋯ 更多」菜单；分离模式传
          面板并集（与屏上所见一致），单图模式传 visSeries；随窗口联动 */}
      <PromoDrawer
        open={promoDetailOpen}
        onClose={() => setPromoDetailOpen(false)}
        series={splitActive ? panelViews.flatMap((p) => p.all) : visSeries}
        currency={state.currency}
        granularity={state.granularity}
      />

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
