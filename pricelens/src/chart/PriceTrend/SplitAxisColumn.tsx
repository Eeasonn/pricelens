// ============================================================
// 分离模式共享轴列（第五十四轮追补⑤）：面板卡片外侧的一根 Y 轴——档位带（仅 USD）、
// Y 刻度标签（随「显示 Y 刻度线」开关）、刻度短横线、断轴省略号。全面板共享同一 yScale
// （并集算一次受控传入），每行画一份 = 「只显示靠左的那一个」；面板卡片（axisChrome=false）
// 不再各自包轴，宽度全部让给绘图区。
// 第八十六轮定宽：[档位带 40][刻度文字 44][短横线 6] 总宽恒定，不随刻度线开关伸缩
// （开关只控标签/短横线显隐）——与主图 estGridLeft 同口径，右侧绘图区空间恒定。
// 纯渲染：几何 = 用与面板相同的 gridTop/plotHeight 构造的伪 Geom（plotWidth=0 即可
// ——轴元素全部只依赖纵向几何）。
// ============================================================
import { buildTierBoxes, buildTickRows } from './chartModel';
import {
  AXIS_BAND_W,
  AXIS_GAP,
  GRID,
  TICK_DASH_W,
  TICK_ZONE_W,
  axisFixedWidth,
  type Geom,
  type YScale,
} from './helpers';
import type { CurrencyMode } from '../../dataModel/types';
import { color } from '../../theme/tokens';

export default function SplitAxisColumn(props: {
  yScale: YScale;
  currency: CurrencyMode;
  /** 旧契约保留（第八十六轮起不再参与宽度计算——轴宽恒定） */
  gridLeft: number;
  /** 面板 Chart 的 gridTop（面板内绘图区顶），保证纵向逐像素对齐 */
  panelGridTop: number;
  showYTicks: boolean;
  tierValues: number[];
}) {
  const { yScale: scale, currency, panelGridTop } = props;
  void props.gridLeft; // 旧契约字段，宽度已恒定化
  const axisW = axisFixedWidth(currency);
  const bandRight = currency === 'usd' ? AXIS_BAND_W + AXIS_GAP : 0; // 刻度文字区左缘
  const geom: Geom = {
    gridLeft: axisW,
    plotLeft: axisW,
    plotTop: panelGridTop,
    plotWidth: 0,
    plotHeight: scale.plotHeight,
    scale,
    n: 1,
  };
  const rows = buildTickRows(geom);
  const tierBoxes = buildTierBoxes({ enabled: currency === 'usd', geom, tierValues: props.tierValues });
  const tierLabelLines = (label: string): string[] => {
    const parts = label.split('~');
    return parts.length === 2 ? [parts[0], '~', parts[1]] : [label];
  };
  return (
    <div style={{ position: 'relative', width: axisW, height: panelGridTop + scale.plotHeight + GRID.bottom }}>
      {/* 档位带（仅 USD）：贴轴列左缘（实心 = 档内有数据，虚线 = 空档占位）；
          「A~B」标签换行竖排居中，矮档退化为单行小字 */}
      {tierBoxes.map((tb, i) => (
        <div
          key={`tier-${tb.label}-${i}`}
          title={`价格档位 ${tb.label}（USD）${tb.empty ? '· 当前无产品' : ''}`}
          style={{
            position: 'absolute',
            left: 0,
            top: tb.top,
            width: AXIS_BAND_W,
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
          {(() => {
            const labelColor = tb.empty ? color.mute : color.body;
            if (tb.h < 38) {
              return tb.h >= 14 ? (
                <span style={{ fontSize: 8, lineHeight: '10px', color: labelColor, whiteSpace: 'nowrap' }}>
                  {tb.label}
                </span>
              ) : null;
            }
            return (
              <span
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  fontSize: 9,
                  lineHeight: '12px',
                  color: labelColor,
                  whiteSpace: 'nowrap',
                }}
              >
                {tierLabelLines(tb.label).map((ln, k) => (
                  <span key={`${ln}-${k}`}>{ln}</span>
                ))}
              </span>
            );
          })()}
        </div>
      ))}
      {/* Y 刻度标签（随「显示 Y 刻度线」开关；横线仍画在各面板绘图区内）：
          右对齐贴绘图区一侧，短横线在轴区右外缘与刻度对齐 */}
      {props.showYTicks &&
        rows.map((t) => (
          <div
            key={`tk-${t.v}`}
            className="tnum"
            style={{
              position: 'absolute',
              left: bandRight,
              top: Math.round(t.y) - 7,
              width: TICK_ZONE_W,
              textAlign: 'right',
              fontSize: 9,
              lineHeight: '14px',
              color: color.mute,
              whiteSpace: 'nowrap',
            }}
          >
            {t.text}
          </div>
        ))}
      {props.showYTicks &&
        rows.map((t) => (
          <div
            key={`dash-${t.v}`}
            style={{
              position: 'absolute',
              left: axisW - TICK_DASH_W,
              top: Math.round(t.y) - 0.5,
              width: TICK_DASH_W,
              height: 1,
              background: color.hairlineStrong,
              pointerEvents: 'none',
            }}
          />
        ))}
      {/* 断轴省略号（⋮）：短横线列居中（「Y 轴自动压缩」关闭 = 不产生断轴，自然无符号） */}
      {scale.breaks.map((b, i) => (
        <svg
          key={`brk-${i}`}
          width="14"
          height="16"
          viewBox="0 0 14 16"
          style={{
            position: 'absolute',
            left: axisW - TICK_DASH_W / 2 - 7,
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
