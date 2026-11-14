import React from 'react';
import ReactDOM from 'react-dom/client';
import 'dayjs/locale/zh-cn'; // antd DatePicker 周/月/季面板的 weekStart(周一)与 ISO 周号依赖 dayjs 语言包
import './index.css';
import { applyPersistedDataPack } from './data/bootstrap';

// 两段式启动（2026-11-14 数据包机制）：先把持久化的导入数据置换进数据层，
// 再动态 import App——App 树全部模块（含各模块级数据缓存 Map）都在数据就位后
// 才初始化。单文件构建由 vite-plugin-singlefile 的 inlineDynamicImports 保序。
async function bootstrap(): Promise<void> {
  await applyPersistedDataPack();
  const { default: App } = await import('./App');
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void bootstrap();
