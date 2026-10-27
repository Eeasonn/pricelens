import { useEffect } from 'react';
import { Button, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
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
import { color, font } from './theme/tokens';

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
          <OverviewViewProvider>
            <AppBody />
          </OverviewViewProvider>
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
  // 三页切换轻淡入：key 换页重挂载，播放 lplPageIn（动效令牌 fast 档）
  return (
    <div key={page} className="lpl-page-fade">
      {page === 'overview' ? (
        <Overview />
      ) : page === 'volume' ? (
        <VolumePrice />
      ) : page === 'pricing' ? (
        <PricingPage />
      ) : page === 'config' ? (
        <Config />
      ) : page === 'alerts' ? (
        <AlertsPage />
      ) : (
        <Dashboard />
      )}
    </div>
  );
}
