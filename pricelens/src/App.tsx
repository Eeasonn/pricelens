import { Button, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { usePage, PageProvider } from './state/PageContext';
import { FiltersProvider } from './state/FiltersContext';
import Dashboard from './pages/Dashboard';
import Config from './pages/Config';
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
          <AppBody />
        </FiltersProvider>
      </PageProvider>
    </ConfigProvider>
  );
}

function AppBody() {
  const { page } = usePage();
  return page === 'config' ? <Config /> : <Dashboard />;
}
