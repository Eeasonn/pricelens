import React from 'react';
import ReactDOM from 'react-dom/client';
import 'dayjs/locale/zh-cn'; // antd DatePicker 周/月/季面板的 weekStart(周一)与 ISO 周号依赖 dayjs 语言包
import './index.css';
import { applyPersistedDataPack } from './data/bootstrap';

// 两段式启动（2026-11-14 数据包机制）：先把持久化的导入数据置换进数据层，
// 再动态 import App——App 树全部模块（含各模块级数据缓存 Map）都在数据就位后
// 才初始化。单文件构建由 vite-plugin-singlefile 的 inlineDynamicImports 保序。
async function bootstrap(): Promise<void> {
  try {
    await applyPersistedDataPack();
    const { default: App } = await import('./App');
    ReactDOM.createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  } catch (error) {
    // 动态 import 失败（chunk 加载失败/旧缓存 hash 失配）此前 = unhandled
    // rejection + 永久白屏。给一张最小错误卡（不依赖 App/antd 已加载），
    // 刷新即可重试。（2026-11-16 审视修复）
    console.error('[PriceLens] 启动失败：', error);
    const root = document.getElementById('root');
    if (root) {
      root.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:system-ui,sans-serif;color:#333">
          <div style="max-width:420px;text-align:center;padding:32px;border:1px solid #e5e5e5;border-radius:8px">
            <div style="font-size:15px;font-weight:600;margin-bottom:8px">应用启动失败</div>
            <div style="font-size:13px;color:#666;line-height:1.6">资源加载出现异常（可能是网络中断或浏览器缓存过期）。请刷新页面重试；若反复出现，请重新获取最新的应用文件。</div>
          </div>
        </div>`;
    }
  }
}

void bootstrap();
