import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from 'antd';
import { color, fontSize, radius, shadow, space } from '../theme/tokens';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * 页面级兜底，避免图表或第三方控件的渲染异常把整个单文件应用变成白屏。
 * 恢复按钮只重置边界状态，不刷新页面，因此用户已经填写的筛选仍会保留。
 */
export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // 只记录摘要和组件栈，避免把状态里的价格数据写入日志。
    console.error('[PriceLens] render failed', error.message, info.componentStack);
  }

  private retry = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <main
        role="alert"
        style={{
          minHeight: '100%',
          display: 'grid',
          placeItems: 'center',
          padding: space.xl,
          boxSizing: 'border-box',
          background: color.canvasSoft,
        }}
      >
        <section
          style={{
            width: 'min(520px, 100%)',
            padding: space.xl,
            background: color.canvas,
            border: `1px solid ${color.hairline}`,
            borderRadius: radius.card,
            boxShadow: shadow.l2,
          }}
        >
          <h1 style={{ margin: 0, fontSize: fontSize.displaySm, color: color.ink }}>页面暂时无法显示</h1>
          <p style={{ margin: `${space.md}px 0`, color: color.body, lineHeight: 1.6 }}>
            当前视图遇到异常。可以先重试；如果问题持续，请把下方错误摘要提供给维护人员。
          </p>
          <code
            style={{
              display: 'block',
              maxHeight: 96,
              overflow: 'auto',
              padding: space.sm,
              background: color.canvasSoft2,
              borderRadius: radius.control,
              color: color.body,
              fontSize: fontSize.caption,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {error.message || 'Unknown render error'}
          </code>
          <div style={{ display: 'flex', gap: space.sm, marginTop: space.lg }}>
            <Button type="primary" onClick={this.retry}>重试</Button>
            <Button onClick={() => window.location.reload()}>刷新页面</Button>
          </div>
        </section>
      </main>
    );
  }
}
