import { useEffect, useRef, useState } from 'react';
import { ArrowUpOutlined } from '@ant-design/icons';
import { useFilters } from '../state/FiltersContext';
import FilterBar from '../components/FilterBar';
import PriceTrend from '../chart/PriceTrend';
import TrendTables, { type DetailBucket, type TableGroup } from '../chart/PriceTrend/TrendTables';
import PageHeader from '../components/PageHeader';
import { color, radius, shadow, space } from '../theme/tokens';

/** 页面骨架 —— 图表负责人（Agent C）在此基础上完善（§4.1 信息架构）。
 *  第五十四轮追补：滚过筛选器后顶部居中浮现圆形 ↑ 按钮，点击回滚到筛选器。
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
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [showTop, setShowTop] = useState(false);
  // 图上可见窗口的同源快照（PriceTrend 每次组/时间段变化上报一次）
  const [trendWindow, setTrendWindow] = useState<{ groups: TableGroup[]; buckets: DetailBucket[] }>({ groups: [], buckets: [] });

  const onScroll = (): void => setShowTop((rootRef.current?.scrollTop ?? 0) > 140);
  useEffect(() => {
    const root = rootRef.current;
    root?.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => root?.removeEventListener('scroll', onScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={rootRef} data-lpl-scroll style={{ height: '100%', overflowX: 'auto', background: color.canvasSoft }}>
      {/* 顶部居中圆形 ↑（第五十四轮追补）：滚过筛选器后浮现，点击平滑回滚筛选器 */}
      {showTop && (
        <button
          title="回到筛选器"
          onClick={() => {
            if (rootRef.current) rootRef.current.scrollTop = 0; // IAB 环境 scrollTo() 无效，直接赋值
          }}
          style={{
            position: 'fixed',
            top: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 60,
            width: 34,
            height: 34,
            borderRadius: '50%',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: color.canvas,
            border: `1px solid ${color.hairlineStrong}`,
            boxShadow: shadow.l2,
            color: color.body,
            cursor: 'pointer',
          }}
        >
          <ArrowUpOutlined style={{ fontSize: 14 }} />
        </button>
      )}
      {/* 第二十八轮：1440 → 1280，筛选条重排后 1280 视口零溢出（1280 笔记本无横向滚动） */}
      <div style={{ minWidth: 1280, minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* 顶栏 64px（共享 PageHeader，预警中心重构统一四页铬架） */}
        <PageHeader title="价格看板" />

        {/* 分析对象与当前对比口径；showTime = 时间筛选簇（第一百三十一轮波2上移） */}
        <FilterBar showTime showPlatform={false} />

        {/* 价格走势（第十二轮：标题并入 PriceTrend 首行，消除三段式纵向空白） */}
        <main style={{ flex: 1, padding: space.lg }}>
          <div data-lpl-trend>
            <section
              style={{
                background: color.canvas,
                boxShadow: shadow.l1,
                borderRadius: radius.card,
                padding: space.lg,
                scrollMarginTop: 12,
              }}
            >
              {/* 图表全家桶（§6：标题+价格类型/汇总 + 图主体 + 刷选 + 下钻） */}
              <PriceTrend
                onSeriesWindow={(groups, buckets) => setTrendWindow({ groups, buckets })}
              />
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
                  currency={state.currency}
                  granularity={state.granularity}
                />
              </section>
            )}
          </div>
        </main>

      </div>
    </div>
  );
}
