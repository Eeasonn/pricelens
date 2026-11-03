// ============================================================
// 量价面板 · 区间极值点标识（2026-11-03 Eason「K 线式极值点」）：选中区间内
// 标出价格最高/最低、销量最高/最低的位置——视觉语言沿用价格走势页定稿的
// 极值点双形状（价格 = 同心双环：外空心环 + 内实心点；销量 = 白芯菱形），
// 颜色随面板系列色，形状区分量纲。
// 极差读数仍由 SpreadRangeCard 承担，本组件只做位置标注；区间未选中、区间
// 无可信极值（全隔离）或最高 = 最低（flat）时不画。
// 悬停 title 报「锚日 + 极值类别 + 数值」：点位 g 自带可命中（pointerEvents
// auto），宿主 svg 保持 pointerEvents none 不挡 PointerShield，但需置于承接层
// 之上（zIndex 5）title 才可悬停。
// 经典与成本柱两种呈现共用本组件（宿主按当前呈现换算 Y 坐标）。
// ============================================================
import { color } from '../../theme/tokens';
import type { RangeBand } from './periodSummary';

export default function PanelExtremeMarks(props: {
  /** 价格极值带（rangeBandInView：视图下标 + 极值点清单；flat = 最高＝最低） */
  priceBand: RangeBand | null;
  volumeBand: RangeBand | null;
  /** 区间可信极差值（null = 无可信点，不画） */
  priceSpreadValue: number | null;
  volumeSpreadValue: number | null;
  /** 桶中心横坐标（视图下标 → px） */
  xAt: (index: number) => number;
  priceYOf: (value: number) => number;
  volumeYOf: (value: number) => number;
  seriesColor: string;
  formatPriceText: (value: number) => string;
  formatVolumeText: (value: number) => string;
  /** 锚日文案（视图下标 → 「MM-DD」等，随粒度） */
  labelOf: (index: number) => string;
}) {
  const showPrice = !!props.priceBand && !props.priceBand.flat && props.priceSpreadValue != null;
  const showVolume = !!props.volumeBand && !props.volumeBand.flat && props.volumeSpreadValue != null;
  if (!showPrice && !showVolume) return null;
  return (
    <>
      {showPrice && props.priceBand!.dots.map((dot) => {
        const cx = props.xAt(dot.index);
        const cy = props.priceYOf(dot.value);
        return (
          <g key={`price-${dot.index}`} style={{ pointerEvents: 'auto' }}>
            <title>{`${props.labelOf(dot.index)} 价格极值 ${props.formatPriceText(dot.value)}`}</title>
            <circle cx={cx} cy={cy} r={5.5} fill="none" stroke={props.seriesColor} strokeWidth={1.6} />
            <circle cx={cx} cy={cy} r={2.1} fill={props.seriesColor} />
          </g>
        );
      })}
      {showVolume && props.volumeBand!.dots.map((dot) => {
        const cx = props.xAt(dot.index);
        const cy = props.volumeYOf(dot.value);
        return (
          <g key={`volume-${dot.index}`} style={{ pointerEvents: 'auto' }}>
            <title>{`${props.labelOf(dot.index)} 销量极值 ${props.formatVolumeText(dot.value)}`}</title>
            <rect
              x={cx - 4.4} y={cy - 4.4} width={8.8} height={8.8} rx={1.6}
              transform={`rotate(45 ${cx} ${cy})`}
              fill={color.canvas} stroke={props.seriesColor} strokeWidth={1.6}
            />
          </g>
        );
      })}
    </>
  );
}
