// ============================================================
// 分离模式共享轴列（第五十四轮追补⑤）：面板卡片外侧的一根 Y 轴——档位带（仅 USD）、
// Y 刻度标签（随「显示 Y 刻度线」开关）、断轴省略号。全面板共享同一 yScale（并集
// 算一次受控传入），每行画一份 = 「只显示靠左的那一个」；面板卡片（axisChrome=false）
// 不再各自包轴，宽度全部让给绘图区。
// 纯渲染：几何 = 用与面板相同的 gridTop/plotHeight/gridLeft 构造的伪 Geom
//（plotWidth=0 即可——轴元素全部只依赖纵向几何与 gridLeft）。
// ============================================================
import { buildTierBoxes, buildTickRows } from './chartModel';
import {
  GRID,
  NAME_ZONE_W,
  TIER_BAND_GAP,
  TIER_BAND_W,
  splitAxisWidth,
  type Geom,
  type YScale,
} from './helpers';
import type { CurrencyMode } from '../../dataModel/types';
import { color } from '../../theme/tokens';

export default function SplitAxisColumn(props: {
  yScale: YScale;
  currency: CurrencyMode;
  /** 主图口径 gridLeft（estGridLeft 产物）——仅作刻度列估宽基准；列宽本体 = splitAxisWidth */
  gridLeft: number;
  /** 面板 Chart 的 gridTop（面板内绘图区顶），保证纵向逐像素对齐 */
  panelGridTop: number;
  showYTicks: boolean;
  tierValues: number[];
}) {
  const { yScale: scale, currency, gridLeft, panelGridTop } = props;
  const axisW = splitAxisWidth(currency, gridLeft, props.showYTicks);
  const tierPart = currency === 'usd' ? TIER_BAND_W + TIER_BAND_GAP : 0;
  const tickW = Math.max(34, gridLeft - tierPart - NAME_ZONE_W);
  const geom: Geom = {
    gridLeft,
    plotLeft: gridLeft,
    plotTop: panelGridTop,
    plotWidth: 0,
    plotHeight: scale.plotHeight,
    scale,
    n: 1,
  };
  const rows = buildTickRows(geom);
  const tierBoxes = buildTierBoxes({ enabled: currency === 'usd', geom, tierValues: props.tierValues });
  return (
    <div style={{ position: 'relative', width: axisW, height: panelGridTop + scale.plotHeight + GRID.bottom }}>
      {/* 档位带（仅 USD）：贴列左缘（实心 = 档内有数据，虚线 = 空档占位） */}
      {tierBoxes.map((tb, i) => (
        <div
          key={`tier-${tb.label}-${i}`}
          title={`价格档位 ${tb.label}（USD）${tb.empty ? '· 当前无产品' : ''}`}
          style={{
            position: 'absolute',
            left: 0,
            top: tb.top,
            width: TIER_BAND_W,
            height: tb.h,
            boxSizing: 'border-box',
            border: tb.empty ? `1px dashed ${color.hairline}` : `1px solid ${color.hairline}`,
            background: tb.empty ? 'transparent' : i % 2 === 0 ? color.canvasSoft2 : color.canvasSoft,
            display: 'grid',
            placeItems: 'center',
            overflow: 'hidden',
            pointerEvents: 'none',
          }}
        >
          {tb.h >= 16 && (
            <span style={{ fontSize: 10, lineHeight: '12px', color: tb.empty ? color.mute : color.body, whiteSpace: 'nowrap' }}>
              {tb.label}
            </span>
          )}
        </div>
      ))}
      {/* Y 刻度标签（随「显示 Y 刻度线」开关；横线仍画在各面板绘图区内） */}
      {props.showYTicks &&
        rows.map((t) => (
          <div
            key={`tk-${t.v}`}
            className="tnum"
            style={{
              position: 'absolute',
              left: tierPart,
              top: Math.round(t.y) - 8,
              width: tickW,
              textAlign: 'right',
              fontSize: 12,
              lineHeight: '16px',
              color: color.body,
              whiteSpace: 'nowrap',
            }}
          >
            {t.text}
          </div>
        ))}
      {/* 断轴省略号（⋮）：与面板内的断轴浅带同高对齐 */}
      {scale.breaks.map((b, i) => (
        <svg
          key={`brk-${i}`}
          width="14"
          height="16"
          viewBox="0 0 14 16"
          style={{
            position: 'absolute',
            left: tierPart + (props.showYTicks ? tickW / 2 - 7 : 0),
            top: panelGridTop + b - 8,
            pointerEvents: 'none',
          }}
          aria-hidden
        >
          {[3, 8, 13].map((cy) => (
            <circle key={cy} cx="7" cy={cy} r="1.5" fill={color.hairlineStrong} />
          ))}
        </svg>
      ))}
    </div>
  );
}
