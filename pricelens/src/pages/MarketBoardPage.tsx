// ============================================================
// 大盘走势页（2026-11-03 主导航接入）：GFK 看板复刻三图（marketboard/ 目录，
// 组件与数据不另起炉灶）从独立预览面迁入正式分析壳。
// 页面壳（页头/筛选条/滚动容器/回滚按钮）由 App.AnalysisShell 共享——与价格
// 走势/量价走势互切不整页重挂（筛选器不刷新）；本页只负责图表页签行 + 口径行
// （模拟数据徽标 + 口径说明 + 产业 Segmented）与三卡纵排。
// 产业选择走 marketBoardIndustry（会话级保留，与标签页标题共用一份）；
// 产业切换时三卡按 key 重挂（卡内档位筛选回默认全档位，与预览面同款行为）。
// 2026-11-03 顶部产业对齐（方案 A）：进入本页及每次切换顶部产业时，手机/平板/
// 穿戴对齐到对应样例（单向，不回写顶部筛选）；音频等无样例的产业保持当前选择，
// 口径行注明样例覆盖范围。页内产业切换在下次切换顶部产业前一直有效。国家/币种/
// 时间三项筛选不作用于本页样例，由筛选条在本页置灰（FilterBar/scopeFiltersDisabled）。
// 数据恒为 simulated（marketBoardData.ts 模拟，切换真实数据源仅替换该文件）。
// ============================================================
import { useEffect } from 'react';
import { Segmented } from 'antd';
import ChartContentBar from '../components/ChartContentBar';
import { useFilters } from '../state/FiltersContext';
import { INDUSTRY_LABELS } from '../dataModel/scope';
import { color, fontSize, radius, shadow, space } from '../theme/tokens';
import { MARKET_INDUSTRIES } from './marketboard/marketBoardData';
import { marketDatasetOf, setMarketIndustryId, useMarketIndustry } from './marketboard/marketBoardIndustry';
import TierBrandShareCard from './marketboard/TierBrandShareCard';
import BrandShareTrendCard from './marketboard/BrandShareTrendCard';
import BrandTierYoYCard from './marketboard/BrandTierYoYCard';
import { MBSourceTag } from './marketboard/marketBoardUI';

export default function MarketBoardPage() {
  const { industry } = useFilters().state;
  const ind = useMarketIndustry();

  // 顶部产业 → 大盘样例（单向）：进入本页即对齐一次，其后每次切换顶部产业再对齐；
  // 无样例的产业（音频等）不动当前选择
  useEffect(() => {
    const target = marketDatasetOf(industry);
    if (target) setMarketIndustryId(target.id);
  }, [industry]);

  // 口径行：样例国家 · 当前产业 · 单位；顶部产业无样例时注明样例覆盖范围
  const scopeLine = [ind.region, ind.label, '销量单位万台', '均价为美元', '口径参考 GFK 看板'];
  if (!marketDatasetOf(industry)) {
    scopeLine.push(
      `样例覆盖：${MARKET_INDUSTRIES.map((i) => i.label).join('、')}，暂无${INDUSTRY_LABELS[industry] ?? industry}`,
    );
  }

  return (
    <>
      {/* 首卡：图表页签行 + 大盘口径行（与价格/量价首卡同构的白卡壳） */}
      <section
        style={{
          background: color.canvas,
          boxShadow: shadow.l1,
          borderRadius: radius.card,
          padding: 0,
          overflow: 'hidden',
        }}
      >
        <ChartContentBar />
        <div
          style={{
            padding: `${space.sm}px ${space.lg}px ${space.md}px`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: space.md,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: space.sm, flexWrap: 'wrap', minWidth: 0 }}>
            <MBSourceTag label="模拟数据" hint={ind.intro} />
            <span style={{ fontSize: fontSize.caption, color: color.mute }}>{scopeLine.join(' · ')}</span>
          </div>
          <Segmented
            options={MARKET_INDUSTRIES.map((i) => ({ label: i.label, value: i.id }))}
            value={ind.id}
            onChange={(v) => setMarketIndustryId(String(v))}
          />
        </div>
      </section>
      <div style={{ marginTop: space.md, display: 'flex', flexDirection: 'column', gap: space.lg, minWidth: 0 }}>
        {/* key 随产业重挂：各卡内部视图状态（档位筛选）回到默认全档位 */}
        <TierBrandShareCard key={`t1-${ind.id}`} data={ind} />
        <BrandShareTrendCard key={`t2-${ind.id}`} data={ind} />
        <BrandTierYoYCard key={`t3-${ind.id}`} data={ind} />
        <div style={{ fontSize: fontSize.caption, color: color.mute, lineHeight: 1.8 }}>
          {`数据说明：${ind.intro}。锚点月数值手工核定，其余月份按锚点确定性插值；模拟数据仅用于界面演示，不代表真实市场表现。`}
        </div>
      </div>
    </>
  );
}
