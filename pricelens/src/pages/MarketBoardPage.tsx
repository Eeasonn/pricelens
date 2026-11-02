// ============================================================
// 大盘走势页（2026-11-03 主导航接入）：GFK 看板复刻三图（marketboard/ 目录，
// 组件与数据不另起炉灶）从独立预览面迁入正式分析壳。
// 页面壳（页头/筛选条/滚动容器/回滚按钮）由 App.AnalysisShell 共享——与价格
// 走势/量价走势互切不整页重挂（筛选器不刷新）；本页只负责图表页签行 + 口径行
// （模拟数据徽标 + 单位说明 + 产业 Segmented）与三卡纵排。
// 产业选择走 usePageViewState（会话级跨页保留，与量价页视图态同口径）；
// 产业切换时三卡按 key 重挂（卡内档位筛选回默认全档位，与预览面同款行为）。
// 数据恒为 simulated（marketBoardData.ts 模拟，切换真实数据源仅替换该文件）。
// ============================================================
import { Segmented } from 'antd';
import ChartContentBar from '../components/ChartContentBar';
import usePageViewState from '../state/usePageViewState';
import { color, fontSize, radius, shadow, space } from '../theme/tokens';
import { MARKET_INDUSTRIES } from './marketboard/marketBoardData';
import TierBrandShareCard from './marketboard/TierBrandShareCard';
import BrandShareTrendCard from './marketboard/BrandShareTrendCard';
import BrandTierYoYCard from './marketboard/BrandTierYoYCard';
import { MBSourceTag } from './marketboard/marketBoardUI';

export default function MarketBoardPage() {
  const [industryId, setIndustryId] = usePageViewState<string>('marketboard.industry', () => MARKET_INDUSTRIES[0].id);
  const ind = MARKET_INDUSTRIES.find((i) => i.id === industryId) ?? MARKET_INDUSTRIES[0];

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
            <MBSourceTag label="模拟数据" hint={`${ind.intro}；切换真实数据源仅需替换 marketBoardData.ts`} />
            <span style={{ fontSize: fontSize.caption, color: color.mute }}>
              {`${ind.region} · 销量单位万台 · 均价为美元 · 口径参考 GFK 看板`}
            </span>
          </div>
          <Segmented
            options={MARKET_INDUSTRIES.map((i) => ({ label: i.label, value: i.id }))}
            value={ind.id}
            onChange={(v) => setIndustryId(String(v))}
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
