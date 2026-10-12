import React from 'react';
import ReactDOM from 'react-dom/client';
import 'dayjs/locale/zh-cn'; // antd DatePicker 周/月/季面板的 weekStart(周一)与 ISO 周号依赖 dayjs 语言包
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
