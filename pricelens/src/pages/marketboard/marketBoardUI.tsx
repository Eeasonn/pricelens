// ============================================================
// 大盘图表 · 本目录共享 UI 管线：echarts 装载、轴/浮层样式、卡片壳。
// 说明：useEChart 模式与 pricing/SchemeCharts 相同，此处内置一份，
// 避免为导出而改动现有文件；合并落点确定后可统一收口。
// ============================================================
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, ScatterChart } from 'echarts/charts';
import {
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  TooltipComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { Tooltip } from 'antd';
import { color, font, fontSize, radius, shadow, space } from '../../theme/tokens';

echarts.use([BarChart, LineChart, ScatterChart, GridComponent, TooltipComponent, LegendComponent, MarkAreaComponent, CanvasRenderer]);

export const MB_AXIS = { fontSize: fontSize.caption, color: color.mute, fontFamily: font.family };
export const MB_TOOLTIP = {
  backgroundColor: color.canvas,
  borderColor: color.hairline,
  textStyle: { color: color.body, fontSize: 12, fontFamily: font.family },
  extraCssText: 'box-shadow: 0 8px 24px rgba(0,0,0,.08); border-radius: 8px;',
};

/** init 一次 + option 受控 + 容器尺寸自适应 */
export function useEChart(build: () => echarts.EChartsCoreOption, deps: unknown[], style: CSSProperties) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    chartRef.current = chart;
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    chartRef.current?.setOption(build(), true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return <div ref={ref} style={style} />;
}

/** 卡片表面（全站同款：白底 8px 圆角 L1 阴影） */
export const MB_CARD: CSSProperties = {
  background: color.canvas,
  borderRadius: radius.card,
  boxShadow: shadow.l1,
  padding: space.lg,
  display: 'flex',
  flexDirection: 'column',
  gap: space.sm,
  minWidth: 0,
};

/** 来源徽标：模拟数据状态说明（文字承载，不靠颜色） */
export function MBSourceTag({ label, hint }: { label: string; hint?: string }) {
  const tag = (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 20,
        padding: '0 8px',
        borderRadius: radius.pill,
        fontSize: fontSize.caption,
        color: color.body,
        background: color.canvasSoft2,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
  return hint ? <Tooltip title={hint}>{tag}</Tooltip> : tag;
}

/** 卡片头：标题 + 来源徽标 + 右侧视图控件插槽 */
export function MBCardHead({ title, source, hint, extra }: { title: string; source?: string; hint?: string; extra?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space.md, paddingBottom: space.xs, minWidth: 0, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: space.sm, minWidth: 0 }}>
        <span style={{ fontSize: fontSize.bodySm, fontWeight: 600, color: color.ink, whiteSpace: 'nowrap' }}>{title}</span>
        {source && <MBSourceTag label={source} hint={hint} />}
      </div>
      {extra && (
        <div style={{ overflowX: 'auto', maxWidth: '100%' }} data-lpl-mb-head-extra>
          {extra}
        </div>
      )}
    </div>
  );
}

/** 要点摘要行（由模型计算生成的业务结论行） */
export function MBSummaryLine({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontSize: fontSize.caption, color: color.mute, lineHeight: 1.6, minWidth: 0 }}>{children}</div>
  );
}

/** 图表横滚容器：窄屏卡内横滚不裁切（全站图表卡同款做法） */
export function MBScroll({ children, minWidth }: { children: ReactNode; minWidth: number }) {
  return (
    <div style={{ overflowX: 'auto', minWidth: 0 }}>
      <div style={{ minWidth }}>{children}</div>
    </div>
  );
}
