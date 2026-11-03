// ============================================================
// 补充图可点击图例（2026-11-03 Eason：量价走势图表与价格走势/大盘走势对齐——
// 点击图例控制图表元素显隐）。样式基准 = 大盘走势 ECharts legend：
// 图外底部居中行、roundRect 色块 14×8 / 线 / 虚线 / ▼、11px body 色、
// itemGap 12、隐藏态 opacity .45（价格走势图例隐藏态同语言）。
// 图例放绘图区之外，从根上避免与数据线重叠。
// ============================================================
import type { ReactNode } from 'react';
import { color } from '../../theme/tokens';

export type SuppLegendShape = 'bar' | 'line' | 'dash' | 'tri';

export interface SuppLegendItem {
  key: string;
  label: string;
  shape: SuppLegendShape;
  /** 线色 / 描边色 / ▼ 色 */
  color: string;
  /** bar 形态的填充色（可半透明，默认 = color） */
  fill?: string;
}

export default function SuppLegend(props: {
  items: readonly SuppLegendItem[];
  hidden: ReadonlySet<string>;
  onToggle: (key: string) => void;
}) {
  return (
    <div
      role="group"
      aria-label="图表元素显隐"
      style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '2px 12px', paddingTop: 6 }}
    >
      {props.items.map((item) => {
        const off = props.hidden.has(item.key);
        let glyph: ReactNode;
        if (item.shape === 'bar') {
          glyph = (
            <span
              style={{
                width: 14,
                height: 8,
                borderRadius: 2,
                background: item.fill ?? item.color,
                border: `1px solid ${item.color}`,
                flex: '0 0 auto',
              }}
            />
          );
        } else if (item.shape === 'tri') {
          glyph = (
            <span
              style={{
                width: 0,
                height: 0,
                borderLeft: '4.5px solid transparent',
                borderRight: '4.5px solid transparent',
                borderTop: `7px solid ${item.color}`,
                flex: '0 0 auto',
              }}
            />
          );
        } else {
          glyph = (
            <span
              style={{
                width: 14,
                height: 0,
                borderTop: `2px ${item.shape === 'dash' ? 'dashed' : 'solid'} ${item.color}`,
                flex: '0 0 auto',
              }}
            />
          );
        }
        return (
          <button
            key={item.key}
            type="button"
            aria-pressed={!off}
            title={off ? `显示${item.label}` : `隐藏${item.label}`}
            onClick={() => props.onToggle(item.key)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 11,
              lineHeight: '16px',
              color: color.body,
              opacity: off ? 0.45 : 1,
              border: 'none',
              background: 'none',
              padding: 0,
              cursor: 'pointer',
            }}
          >
            {glyph}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
