// ============================================================
// 大盘图表预览 · 独立入口（dev-only，不进 vite build 单文件产物）
// ============================================================
import { createRoot } from 'react-dom/client';
import { ConfigProvider } from 'antd';
import { color, font, radius } from '../../theme/tokens';
import MarketBoardPreview from './MarketBoardPreview';

createRoot(document.getElementById('root')!).render(
  <ConfigProvider
    theme={{
      token: {
        colorPrimary: color.ink,
        borderRadius: radius.control,
        fontFamily: font.family,
      },
    }}
  >
    <MarketBoardPreview />
  </ConfigProvider>,
);
