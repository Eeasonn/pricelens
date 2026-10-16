import { useEffect, useRef, useState } from 'react';
import { ArrowUpOutlined } from '@ant-design/icons';
import { usePage } from '../state/PageContext';
import { useFilters } from '../state/FiltersContext';
import { navBus } from '../state/navBus';
import { modelNameOf } from '../components/ProductCascader/tree';
import FilterBar from '../components/FilterBar';
import PriceTrend from '../chart/PriceTrend';
import PageHeader from '../components/PageHeader';
import { color, fontSize, radius, shadow, space } from '../theme/tokens';

const FOOTER_TEXT =
  '口径：RRP=官方建议零售价 · 折后价=可抓取平台最低在架价 · offer 为文本权益不计价 · 月/季=桶内均值取整 · 促销力度=折后价相对上市价的降幅（+为高于上市价） · 参考汇率 80₽/$（配置页可改）';

/** 页面骨架 —— 图表负责人（Agent C）在此基础上完善（§4.1 信息架构）。
 *  第五十四轮追补：滚过筛选器后顶部居中浮现圆形 ↑ 按钮，点击回滚到筛选器。
 *  「竞品对比进入默认滚到价格走势区」由 Overview.openCompare 在切页后延时驱动
 *  （滚动容器 = 根 div：html/body/#root 锁 100% 高，overflowX:auto → overflowY 计算 auto） */
export default function Dashboard() {
  const { go } = usePage();
  const { state } = useFilters();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [showTop, setShowTop] = useState(false);

  // 追补⑧（总览↔看板闭环①）：上下文条数据——入口型号 + 勾选 ROM + 对标竞品数
  const entryModelId = state.own[0]?.modelId ?? null;
  const analysisLabel = entryModelId
    ? `${modelNameOf(entryModelId)} · ${state.own.map((s) => s.romram).join('、')}`
    : '—';
  const backToOverview = (): void => {
    if (entryModelId) navBus.overviewScrollTo = entryModelId;
    go('overview');
  };

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

        {/* 追补⑧（总览↔看板闭环①）：上下文条——正在分析什么 + 回程入口
            （点击「← 返回总览」= 回总览页并滚动定位到该产品的行组） */}
        <div style={{ display: 'flex', alignItems: 'center', gap: space.md, padding: `10px ${space.lg}px 0` }}>
          <span style={{ fontSize: 12.5, color: color.mute }}>
            正在分析：<span style={{ color: color.ink, fontWeight: 600 }}>{analysisLabel}</span>
            <span style={{ marginLeft: 8 }}>我司 {state.own.length} 个配置 · 对标竞品 {state.competitors.length} 款</span>
          </span>
          <span style={{ flex: 1 }} />
          <span
            role="button"
            title="返回总览页并定位到该产品行组"
            onClick={backToOverview}
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              color: '#0070f3',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            ← 返回总览
          </span>
        </div>

        {/* 筛选条五框（占位 → Agent B 替换） */}
        <FilterBar />

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
              <PriceTrend />
            </section>
          </div>
        </main>

        {/* 页脚：全页唯一允许的说明文本 */}
        <footer
          style={{
            flexShrink: 0,
            padding: `${space.md}px ${space.lg}px`,
            fontSize: fontSize.caption,
            color: color.mute,
          }}
        >
          {FOOTER_TEXT}
        </footer>
      </div>
    </div>
  );
}
