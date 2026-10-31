import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { ArrowUpOutlined } from '@ant-design/icons';
import { usePage, PageProvider } from './state/PageContext';
import { FiltersProvider, useFilters } from './state/FiltersContext';
import { OverviewViewProvider } from './state/OverviewViewContext';
import { scopeLabels } from './dataModel/scope';
import Overview from './pages/Overview';
import Dashboard from './pages/Dashboard';
import VolumePrice from './pages/VolumePrice';
import PricingPage from './pages/pricing/PricingPage';
import Config from './pages/Config';
import AlertsPage from './pages/AlertsPage';
import IntelligenceCenter from './pages/IntelligenceCenter';
import ForecastPage from './pages/ForecastPage';
import PageHeader from './components/PageHeader';
import FilterBar from './components/FilterBar';
import { ChartContentProvider } from './state/chartContent';
import { AgentProvider } from './state/AgentContext';
import AgentPanel from './components/Copilot/AgentPanel';
import { color, font, shadow, space } from './theme/tokens';

export default function App() {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: color.ink,
          colorLink: color.link,
          colorError: color.error,
          colorWarning: color.warning,
          borderRadius: 6,
          fontFamily: font.family,
          colorBgLayout: color.canvasSoft,
          colorBgContainer: color.canvas,
          colorText: color.ink,
          colorTextSecondary: color.body,
          colorBorder: color.hairline,
          colorBorderSecondary: color.hairline,
        },
      }}
    >
      <PageProvider>
        <FiltersProvider>
          <AgentProvider>
            <OverviewViewProvider>
              <ChartContentProvider>
                <AppBody />
                <AgentPanel />
              </ChartContentProvider>
            </OverviewViewProvider>
          </AgentProvider>
        </FiltersProvider>
      </PageProvider>
    </ConfigProvider>
  );
}

function AppBody() {
  const { page } = usePage();
  const { state } = useFilters();
  // 标签页标题随当前国家（index.html 的静态标题只是首帧占位；多国接入后不再是单一 R国）
  const { region, country } = scopeLabels(state);
  useEffect(() => {
    document.title = `PriceLens · ${region} / ${country}`;
  }, [region, country]);
  // 第一百八十四轮（Eason）：分析三页（价格走势/量价走势/定价推演）共享同一页面
  // 壳（页头+筛选条+滚动容器）——页内切换只换图表主体，不再整页重挂载（顶部
  // 筛选器不刷新）；非分析页仍按页 key 重挂载播淡入
  const analysis = page === 'dashboard' || page === 'volume' || page === 'pricing';
  return (
    <div key={analysis ? 'analysis' : page} className="lpl-page-fade">
      {page === 'overview' ? (
        <Overview />
      ) : analysis ? (
        <AnalysisShell>
          {page === 'volume' ? <VolumePrice /> : page === 'pricing' ? <PricingPage /> : <Dashboard />}
        </AnalysisShell>
      ) : page === 'config' ? (
        <Config />
      ) : page === 'intelligence' ? (
        <IntelligenceCenter />
      ) : page === 'forecast' ? (
        <ForecastPage />
      ) : (
        <AlertsPage />
      )}
    </div>
  );
}

/** 分析页共享壳（第一百八十四轮）：页头、顶部筛选条、滚动容器与回滚按钮只挂载
 *  一次，价格走势/量价走势（定价推演就绪后同）在壳内换主体——切页签不再触发
 *  筛选器刷新（原各页自带壳，切换即整页重挂）。滚动容器原属价格看板页（第五十
 *  四轮的顶部居中 ↑ 回滚按钮随迁，量价页同样生效）。 */
function AnalysisShell({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [showTop, setShowTop] = useState(false);
  const onScroll = (): void => setShowTop((rootRef.current?.scrollTop ?? 0) > 140);
  useEffect(() => {
    const root = rootRef.current;
    root?.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => root?.removeEventListener('scroll', onScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div ref={rootRef} data-lpl-scroll style={{ height: '100%', overflowX: 'auto', overflowY: 'auto', background: color.canvasSoft }}>
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
      <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* 顶栏 64px（共享 PageHeader，预警中心重构统一四页铬架） */}
        <PageHeader />
        {/* 分析对象与当前对比口径；showTime = 时间筛选簇（第一百三十一轮波2上移） */}
        <FilterBar showTime showPlatform={false} />
        <main style={{ flex: 1, padding: `${space.md}px ${space.lg}px ${space.lg}px`, minWidth: 0 }}>{children}</main>
      </div>
    </div>
  );
}
