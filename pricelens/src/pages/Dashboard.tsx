import { useState } from 'react';
import { useFilters } from '../state/FiltersContext';
import ChartContentBar from '../components/ChartContentBar';
import PriceTrend from '../chart/PriceTrend';
import TrendTables, { type DetailBucket, type TableGroup } from '../chart/PriceTrend/TrendTables';
import { color, radius, shadow, space } from '../theme/tokens';

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
 *  第一百二十三轮：宽表按主分析组分块上报（组 = 选择浮窗卡，保持卡序） */
export default function Dashboard() {
  const { state } = useFilters();
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
          {/* 图表全家桶（§6：标题+价格类型/汇总 + 图主体 + 刷选 + 下钻）；
              内层 minWidth 保住图表可读下限，窄视口卡内横向拖动 */}
          <div style={{ padding: space.lg, overflowX: 'auto' }}>
            <div style={{ minWidth: 880 }}>
              <PriceTrend
                onSeriesWindow={(groups, buckets, fourWeekChanges) => setTrendWindow({ groups, buckets, fourWeekChanges })}
              />
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
            />
          </section>
        )}
      </div>
    </>
  );
}
