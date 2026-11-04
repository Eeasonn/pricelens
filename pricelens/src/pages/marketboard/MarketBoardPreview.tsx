// ============================================================
// 大盘图表 · 独立预览页（仅 dev 可达：pricelens/marketboard-preview.html）
// 产业切换（智能穿戴 / 智能手机 / 平板电脑）+ 三张 GFK 复刻图纵排。
// 不接入主导航与路由，等审阅后决定合并落点。
// ============================================================
import { useState } from 'react';
import { Segmented } from 'antd';
import { color, fontSize, space } from '../../theme/tokens';
import { MARKET_INDUSTRIES } from './marketBoardData';
import TierBrandShareCard from './TierBrandShareCard';
import BrandShareTrendCard from './BrandShareTrendCard';
import BrandShareLinesCard from './BrandShareLinesCard';
import BrandTierYoYCard from './BrandTierYoYCard';
import { MBSourceTag } from './marketBoardUI';

export default function MarketBoardPreview() {
  const [industryId, setIndustryId] = useState(MARKET_INDUSTRIES[0].id);
  const ind = MARKET_INDUSTRIES.find((i) => i.id === industryId) ?? MARKET_INDUSTRIES[0];

  return (
    <div style={{ minHeight: '100vh', background: color.canvasSoft, padding: `${space.lg}px ${space.lg}px ${space.xxl}px` }}>
      <div style={{ maxWidth: 1480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: space.lg }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space.md, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: space.md, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, fontSize: fontSize.displaySm, fontWeight: 600, color: color.ink }}>大盘图表</h1>
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
        </header>

        {/* key 随产业重挂：各卡内部视图状态（档位筛选）回到默认全档位 */}
        <TierBrandShareCard key={`t1-${ind.id}`} data={ind} />
        <BrandShareTrendCard key={`t2-${ind.id}`} data={ind} />
        <BrandShareLinesCard key={`tl-${ind.id}`} data={ind} />
        <BrandTierYoYCard key={`t3-${ind.id}`} data={ind} />

        <footer style={{ fontSize: fontSize.caption, color: color.mute, lineHeight: 1.8 }}>
          {`数据说明：${ind.intro}。锚点月数值手工核定，其余月份按锚点确定性插值；仅用于界面审阅，不代表真实市场表现。`}
        </footer>
      </div>
    </div>
  );
}
