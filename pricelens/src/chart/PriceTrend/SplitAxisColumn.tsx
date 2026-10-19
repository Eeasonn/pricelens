// ============================================================
// 分离模式共享轴列（第五十四轮追补⑤）：面板卡片外侧的一根 Y 轴——档位区块（仅 USD）、
// Y 刻度标签（随「显示 Y 刻度线」开关）、刻度短横线、断轴省略号。全面板共享同一 yScale
// （并集算一次受控传入），每行画一份 = 「只显示靠左的那一个」；面板卡片（axisChrome=false）
// 不再各自包轴，宽度全部让给绘图区。
// 第九十一轮与主图完全同构：[档位区块贴左 0 = 档位文字三行竖排居中][刻度文字 8px
// 右对齐叠画在区块上][短横线]，Y 刻度随「Y 刻度线」开关显隐（关 = 仅档位、文字居中
// 整块）、总宽恒定——主图与分离轴列逐像素同款。
// 纯渲染：几何 = 用与面板相同的 gridTop/plotHeight 构造的伪 Geom（plotWidth=0 即可
// ——轴元素全部只依赖纵向几何）。
// ============================================================
import { buildTierBoxes, buildTickRows } from './chartModel';
import {
  AXIS_BAND_W,
  GRID,
  TICK_DASH_W,
  TICK_ZONE_W,
  TIER_LABEL_W,
  axisFixedWidth,
  tierLabelShort,
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
  /** Y 刻度线（第九十一轮）：缺省开 = 刻度值+短横线；关 = 仅价格档位（文字居中整块） */
  showYTicks?: boolean;
  tierValues: number[];
}) {
  const { yScale: scale, currency, panelGridTop } = props;
  const showYTicks = props.showYTicks ?? true;
  void props.gridLeft; // 旧契约字段，宽度已恒定化
  const axisW = axisFixedWidth(currency);
  const tickLeft = axisW - TICK_DASH_W - TICK_ZONE_W; // 刻度文字区左缘（USD 时位于档位区块右段）
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
  return (
    <div style={{ position: 'relative', width: axisW, height: panelGridTop + scale.plotHeight + GRID.bottom }}>
      {/* 档位区块（仅 USD）：贴轴列左缘的整块竖向色带，档位文字单行居左
          （实心 = 档内有数据，虚线 = 空档占位）——与主图同款 */}
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
            display: 'flex',
            alignItems: 'center',
            overflow: 'hidden',
            pointerEvents: 'none',
          }}
        >
          <span
            style={{
              // 关「Y 刻度线」时档位文字居中整个轴区宽度（第九十一轮）
              width: showYTicks ? TIER_LABEL_W : AXIS_BAND_W,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 9,
              lineHeight: '11px',
              color: tb.empty ? color.mute : color.body,
              whiteSpace: 'nowrap',
            }}
          >
            {tb.h < 38 ? (
              tb.h >= 14 ? (
                <span style={{ fontSize: 8, lineHeight: '10px' }}>{tierLabelShort(tb.label)}</span>
              ) : null
            ) : (
              (() => {
                const parts = tierLabelShort(tb.label).split('~');
                const lines = parts.length === 2 ? [parts[0], '~', parts[1]] : [tierLabelShort(tb.label)];
                return lines.map((ln, k) => <span key={`${ln}-${k}`}>{ln}</span>);
              })()
            )}
          </span>
        </div>
      ))}
      {/* Y 刻度标签（随「Y 刻度线」开关）：USD 时叠画在档位区块右段（zIndex 2） */}
      {showYTicks && rows.map((t) => (
          <div
            key={`tk-${t.v}`}
            className="tnum"
            style={{
              position: 'absolute',
              left: tickLeft,
              top: Math.round(t.y) - 7,
              width: TICK_ZONE_W,
              paddingRight: 3,
              boxSizing: 'border-box',
              textAlign: 'right',
              fontSize: 8,
              lineHeight: '14px',
              color: color.mute,
              whiteSpace: 'nowrap',
              zIndex: 2,
            }}
          >
            {t.text}
          </div>
        ))}
      {showYTicks && rows.map((t) => (
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
