import { useEffect, useMemo, useState } from 'react';
import { ConfigProvider, Segmented, Select, Tooltip } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { useFilters } from '../state/FiltersContext';
import ChartContentBar from '../components/ChartContentBar';
import PriceTrend from '../chart/PriceTrend';
import ColumnsView from '../chart/PriceTrend/ColumnsView';
import { columnsOf } from '../chart/PriceTrend/columnsModel';
import { lineageCardsOf, lineageChainsOf } from '../chart/PriceTrend/lineageModel';
import { selectionsOfMains } from '../chart/PriceTrend/columnsModel';
import { prevGenTargetsFor } from '../data';
import { buildProductTree } from '../components/ProductCascader/tree';
import TrendTables, { type DetailBucket, type TableGroup } from '../chart/PriceTrend/TrendTables';
import { filterBarTheme } from '../components/FilterBar';
import { color, radius, shadow, space } from '../theme/tokens';
import type { ColumnsGroupBy, ViewMode } from '../state/filtersTypes';

/** 视图切换行（2026-11-27 二轮「视图：对标 / 分列」）：图表卡内 ChartContentBar 正
 *  下方、两视图同一位置常驻——视图只决定怎么摆，选择草稿（mains）不动。
 *  放在卡头行而非 ChartToolbar：对标视图工具行在 PriceTrend 内、分列视图工具行在
 *  ColumnsView 内，只有卡头行是两视图共享的同一容器，切换不位移。 */
function ViewSwitchRow() {
  const { state, actions } = useFilters();
  const lineageAvailable = state.granularity === 'quarter';
  useEffect(() => {
    if (state.viewMode === 'lineage' && !lineageAvailable) actions.setViewMode('columns');
  }, [state.viewMode, lineageAvailable, actions]);
  return (
    <div
      data-testid="view-switch-row"
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        columnGap: space.md,
        rowGap: 6,
        minHeight: 32,
        padding: '6px 6px 0',
      }}
    >
      <ConfigProvider theme={filterBarTheme}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} title={lineageAvailable ? '按季度查看产品族生命周期' : '代际仅支持季度'}>
          <span id="lpl-view-mode-label" style={{ fontSize: 12, color: color.mute }}>视图</span>
          <Segmented
            size="small"
            aria-labelledby="lpl-view-mode-label"
            value={state.viewMode}
            onChange={(v) => {
              if (v === 'lineage' && !lineageAvailable) return;
              actions.setViewMode(v as ViewMode);
            }}
            options={[
              { label: '对标', value: 'compare' },
              { label: '分列', value: 'columns' },
              { label: '代际', value: 'lineage', disabled: !lineageAvailable },
            ]}
          />
        </span>
        {(state.viewMode === 'columns' || state.viewMode === 'lineage') && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span id="lpl-columns-groupby-label" style={{ fontSize: 12, color: color.mute }}>分列依据</span>
            <Select
              size="small"
              aria-labelledby="lpl-columns-groupby-label"
              value={state.columns.groupBy}
              onChange={(v) => actions.setColumns({ groupBy: v as ColumnsGroupBy })}
              options={[
                { value: 'brand', label: '品牌' },
                { value: 'series', label: '系列' },
                { value: 'tier', label: '档位' },
              ]}
              popupMatchSelectWidth={false}
              style={{ width: 88 }}
            />
            {state.columns.groupBy === 'tier' && (
              <Tooltip title="档位 = 现价落档：该配置全部颜色在最新有价期的全部渠道价格点，剔除低于同期均值 30% 的异常低价后取最低（USD 口径）落入的产业价格阶梯；无现价归末组「暂无现价」">
                <span style={{ display: 'inline-flex', alignItems: 'center', color: color.mute, cursor: 'help' }} aria-label="按现价落档口径说明">
                  <QuestionCircleOutlined style={{ fontSize: 11 }} />
                  <span style={{ fontSize: 11, marginLeft: 3 }}>按现价落档</span>
                </span>
              </Tooltip>
            )}
          </span>
        )}
      </ConfigProvider>
    </div>
  );
}

/** 价格走势页主体（§4.1 信息架构）。页面壳（页头/筛选条/滚动容器/回滚按钮）
 *  第一百八十四轮上移 App.AnalysisShell 共享——本组件只负责图表卡与其下宽表卡，
 *  价格走势↔量价走势切页不再整页重挂（筛选器不刷新）。
 *  第五十四轮追补：滚过筛选器后顶部居中浮现圆形 ↑ 按钮（随壳上移）。
 *  「竞品对比进入默认滚到价格走势区」由 Overview.openCompare 在切页后延时驱动
 *  （滚动容器 = 根 div：html/body/#root 锁 100% 高，overflowX:auto → overflowY 计算 auto）
 *  第110轮（2026-10-20 评审）：图卡下方新增「核心信息明细」独立卡——取数由
 *  PriceTrend 经 onSeriesWindow 上报（与图上同一可见时间段 × 同一批产品系列，
 *  币种/平台/粒度/分离模式随图联动），本层只负责卡片壳与渲染
 *  第112~113轮：图卡与明细卡之间插入「竞品价差」卡（矩阵 + 成对走势）。
 *  第118轮（2026-10-21 评审）：价差与明细两卡合并为一张「时间作列」的横向拖动
 *  宽表卡（共享表头 = 图上同一时间轴，见 TrendTables），表内时间恒与图对齐
 *  第一百二十三轮：宽表按主分析组分块上报（组 = 选择浮窗卡，保持卡序）
 *  2026-11-27 二轮（视图：对标 / 分列，品牌全景结构退场）：viewMode = 'columns' 时
 *  图主体换成分列视图（ColumnsView：列组 = columnsOf 按品牌/系列/档位分组 mains
 *  在册选择，逐组一张图、三列网格换行），图下宽表改「分列价格明细」（按列组分组；
 *  用户显式选了临时基准才出价差区）；对标视图（PriceTrend +「价差与明细」）原样。
 *  选择草稿恒为 mains——视图只是摆法，切换不丢选择。 */
export default function Dashboard() {
  const { state } = useFilters();
  const columnsMode = state.viewMode === 'columns';
  const lineageMode = state.viewMode === 'lineage';
  // 分列视图的列组（columnsOf：选择 = mains 在册选择全集，分组 = 品牌/系列/档位；
  // 品牌序 = 产品树序）
  const brandOrder = useMemo(
    () => buildProductTree(state.industry, state.countryCode, state.financingType, state.financingTerms).map((b) => b.key),
    [state.industry, state.countryCode, state.financingType, state.financingTerms],
  );
  const columnGroups = useMemo(
    () => (columnsMode ? columnsOf(state.mains, state.columns.groupBy, { industry: state.industry, countryCode: state.countryCode, brandOrder }) : []),
    [columnsMode, state.mains, state.columns.groupBy, state.industry, state.countryCode, brandOrder],
  );
  // 代际视图（2026-11-28 三轮返修：走共享 Chart）：链 = mains 在册选择沿 prevGen 拼接；
  // 卡片 = 分列依据分组（按链尖归组，复用 columnsOf 分组口径）+ 组键 → 链集映射
  const lineageCards = useMemo(() => {
    if (!lineageMode) return [];
    const chains = lineageChainsOf(selectionsOfMains(state.mains), prevGenTargetsFor);
    return lineageCardsOf(chains, state.columns.groupBy, { industry: state.industry, countryCode: state.countryCode, brandOrder });
  }, [lineageMode, state.mains, state.columns.groupBy, state.industry, state.countryCode, brandOrder]);
  const lineageGroups = useMemo(
    () => lineageCards.map((c) => ({ key: c.key, label: c.label, brand: c.brand, sels: c.chains.flatMap((ch) => ch.gens.filter((g) => g.selected).map((g) => g.sel)) })),
    [lineageCards],
  );
  const lineageMap = useMemo(() => new Map(lineageCards.map((c) => [c.key, c.chains])), [lineageCards]);
  // 空态注记：有选择但全部链单代（数据包未登记上一代）——2026-11-28 定版保留
  const lineageNoPrevGen = useMemo(
    () => lineageMode && lineageCards.length > 0 && !lineageCards.some((c) => c.chains.some((ch) => ch.gens.length > 1)),
    [lineageMode, lineageCards],
  );
  // 图上可见窗口的同源快照 + 独立于展示粒度的近 4 周价格变化
  const [trendWindow, setTrendWindow] = useState<{
    groups: TableGroup[];
    buckets: DetailBucket[];
    fourWeekChanges: ReadonlyMap<string, number | null>;
  }>({ groups: [], buckets: [], fourWeekChanges: new Map() });

  return (
    <>
      {/* 第二十八轮：1440 → 1280 单行；第一百八十二轮：整页 minWidth 撤除——
          筛选条/页头允许换行，图表卡内横向滚动（内层 minWidth 880 保图可用下限），
          窄视口不再把整页撑出横向裁切 */}
      <div data-lpl-trend>
        <section
          style={{
            background: color.canvas,
            boxShadow: shadow.l1,
            borderRadius: radius.card,
            padding: 0,
            scrollMarginTop: 12,
            overflow: 'hidden',
          }}
        >
          <ChartContentBar />
          <div style={{ padding: `0 ${space.lg}px` }}>
            <ViewSwitchRow />
          </div>
          {/* 图表全家桶（§6：标题+价格类型/汇总 + 图主体 + 刷选 + 下钻）；
              内层 minWidth 保住图表可读下限，窄视口卡内横向拖动
              （lpl-card-scroll = 189 轮：恒显横向滚动条，窄屏不误以为内容被裁） */}
          <div className="lpl-card-scroll" style={{ padding: space.lg, overflowX: 'auto' }}>
            <div style={{ minWidth: 880 }}>
              {lineageMode ? (
                <>
                  {lineageNoPrevGen && (
                    <div role="note" data-testid="lineage-no-prevgen-note" style={{ marginBottom: space.sm, fontSize: 12, color: color.mute }}>
                      当前数据包未登记所选产品的上一代配置（服务器配置表「上一代配置」页签维护），代际拼接暂只显示本代。
                    </div>
                  )}
                  <ColumnsView
                    groups={lineageGroups}
                    groupBy={state.columns.groupBy}
                    lineage={lineageMap}
                    onSeriesWindow={(groups, buckets, fourWeekChanges) => setTrendWindow({ groups, buckets, fourWeekChanges })}
                  />
                </>
              ) : columnsMode ? (
                <ColumnsView
                  groups={columnGroups}
                  groupBy={state.columns.groupBy}
                  onSeriesWindow={(groups, buckets, fourWeekChanges) => setTrendWindow({ groups, buckets, fourWeekChanges })}
                />
              ) : (
                <PriceTrend
                  onSeriesWindow={(groups, buckets, fourWeekChanges) => setTrendWindow({ groups, buckets, fourWeekChanges })}
                />
              )}
            </div>
          </div>
        </section>
        {/* 价差与明细（第118轮合并宽表；第一百二十三轮按主分析组分块）：
            与图上同一可见时间段同源取数 */}
        {trendWindow.groups.some((g) => g.series.length > 0) && (
          <section
            style={{
              marginTop: space.md,
              background: color.canvas,
              boxShadow: shadow.l1,
              borderRadius: radius.card,
              padding: space.lg,
            }}
          >
            <TrendTables
              groups={trendWindow.groups}
              buckets={trendWindow.buckets}
              fourWeekChanges={trendWindow.fourWeekChanges}
              currency={state.currency}
              granularity={state.granularity}
              // 分列视图：图下是「分列价格明细」——按列组分组；价差区只在用户显式选了
              // 临时基准后出现，基准列头如实写「价差基准」（无默认主品）
              {...(columnsMode ? { title: '分列价格明细', detailCaption: '分列价格明细', baseCaption: '价差基准' } : lineageMode ? { title: '代际价格明细', detailCaption: '代际价格明细', baseCaption: '价差基准' } : {})}
            />
          </section>
        )}
      </div>
    </>
  );
}
