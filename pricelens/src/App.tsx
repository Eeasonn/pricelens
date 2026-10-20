import { Button, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { usePage, PageProvider } from './state/PageContext';
import { FiltersProvider } from './state/FiltersContext';
import { OverviewViewProvider } from './state/OverviewViewContext';
import Overview from './pages/Overview';
import Dashboard from './pages/Dashboard';
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
  // 三页切换轻淡入：key 换页重挂载，播放 lplPageIn（动效令牌 fast 档）
  return (
    <div key={page} className="lpl-page-fade">
      {page === 'overview' ? <Overview /> : page === 'config' ? <Config /> : page === 'alerts' ? <AlertsPage /> : <Dashboard />}
    </div>
  );
}
