// ============================================================
// 分离模式共享轴列（第五十四轮追补⑤）：面板卡片外侧的一根 Y 轴——档位区块（仅 USD）、
// Y 刻度标签（随「显示 Y 刻度线」开关）、刻度短横线、断轴省略号。全面板共享同一 yScale
// （并集算一次受控传入），每行画一份 = 「只显示靠左的那一个」；面板卡片（axisChrome=false）
// 不再各自包轴，宽度全部让给绘图区。
// 第九十一轮与主图完全同构：[档位区块贴左 0 = 档位文字三行竖排居中][刻度文字
// Y_TICK_FONT（185 轮 8→10，与主图同源）右对齐叠画在区块上][短横线]，Y 刻度随「Y 刻度线」开关显隐（关 = 仅档位、文字居中
// 整块）、总宽恒定——主图与分离轴列逐像素同款。
// 纯渲染：几何 = 用与面板相同的 gridTop/plotHeight 构造的伪 Geom（plotWidth=0 即可
// ——轴元素全部只依赖纵向几何）。
// ============================================================
import { buildTierBoxes, buildTickRows, thinTickRows, Y_TICK_FONT } from './chartModel';
import {
  GRID,
  TICK_DASH_W,
  TIER_LABEL_W,
  axisChrome,
  tierLabelShort,
  type Geom,
  type YScale,
} from './helpers';
import type { CurrencyMode, Industry } from '../../dataModel/types';
import { color } from '../../theme/tokens';
import YLimitHandles, { type YLimitState } from './YLimitHandles';

export default function SplitAxisColumn(props: {
  yScale: YScale;
  currency: CurrencyMode;
  /** 档位阶梯按产业（tierBandsOf） */
  industry: Industry;
  /** 旧契约保留（第八十六轮起不再参与宽度计算——轴宽恒定） */
  gridLeft: number;
  /** 面板 Chart 的 gridTop（面板内绘图区顶），保证纵向逐像素对齐 */
  panelGridTop: number;
  /** Y 刻度线（第九十一轮）：缺省开 = 刻度值+短横线；关 = 仅价格档位（文字居中整块） */
  showYTicks?: boolean;
  /** 价格档位带开关（第一百九十三轮，Eason）：与 Y 刻度线独立，关 = 不画档位区块 */
  showTiers?: boolean;
  tierValues: number[];
  /** Y 轴上下限受控值与提交——共享轴列是分离模式唯一画轴处，编辑器挂这里
   *  （面板卡 chrome=false 不再各挂）。 */
  yLimit?: YLimitState;
  onYLimit?: (kind: 'min' | 'max', v: number | null) => void;
}) {
  const { yScale: scale, currency, panelGridTop } = props;
  const showYTicks = props.showYTicks ?? true;
  const showTiers = props.showTiers !== false;
  void props.gridLeft; // 旧契约字段，宽度由显隐决定
  const chrome = axisChrome(currency, showYTicks, showTiers);
  const axisW = chrome.width;
  const geom: Geom = {
    gridLeft: axisW,
    plotLeft: axisW,
    plotTop: panelGridTop,
    plotWidth: 0,
    plotHeight: scale.plotHeight,
    scale,
    n: 1,
  };
  // 刻度抽稀（第一百四十七轮）：压缩轴最矮段处刻度互相叠压/越出绘图区下缘的守卫
  const rows = thinTickRows(buildTickRows(geom));
  const tierBoxes = buildTierBoxes({ enabled: chrome.tierWidth > 0, geom, tierValues: props.tierValues, industry: props.industry });
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
            width: chrome.tierWidth,
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
              width: showYTicks ? TIER_LABEL_W : chrome.tierWidth,
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
            {(() => {
              // 恒三行竖排（第九十三轮：矮档不再退化单行）
              const parts = tierLabelShort(tb.label).split('~');
              const lines = parts.length === 2 ? [parts[0], '~', parts[1]] : [tierLabelShort(tb.label)];
              return lines.map((ln, k) => <span key={`${ln}-${k}`}>{ln}</span>);
            })()}
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
              left: chrome.tickLeft,
              top: Math.round(t.y) - 8,
              width: chrome.tickWidth,
              paddingRight: 3,
              boxSizing: 'border-box',
              textAlign: 'right',
              fontSize: Y_TICK_FONT,
              lineHeight: '16px',
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
              left: chrome.dashLeft,
              top: Math.round(t.y) - 0.5,
              width: TICK_DASH_W,
              height: 1,
              background: color.hairlineStrong,
              pointerEvents: 'none',
            }}
          />
        ))}
      {/* 断轴省略号（⋮）：短横线列居中（「Y 轴自动压缩」关闭 = 不产生断轴，自然无符号）。
          第一百八十二轮：悬停提示 + role=img 明示「刻度非连续」 */}
      {scale.breaks.map((b, i) => (
        <svg
          key={`brk-${i}`}
          width="14"
          height="16"
          viewBox="0 0 14 16"
          role="img"
          aria-label="刻度非连续：段与段之间的值域已压缩"
          style={{
            position: 'absolute',
            left: (showYTicks ? chrome.dashLeft + TICK_DASH_W / 2 : chrome.tierWidth / 2) - 7,
            top: panelGridTop + b - 8,
            pointerEvents: 'auto',
            cursor: 'help',
          }}
        >
          <title>刻度非连续：段与段之间的值域已压缩</title>
          {[3, 8, 13].map((cy) => (
            <circle key={cy} cx="7" cy={cy} r="1.5" fill={color.hairlineStrong} />
          ))}
        </svg>
      ))}
      {/* Y 轴上下限输入（替代旧拖拽拉伸）：上限/下限固定在轴上方，清空输入恢复自动；
          未传 onYLimit 不渲染（下钻弹窗等自管场景）。 */}
      {props.onYLimit && chrome.visible && (
        <YLimitHandles
          scale={scale}
          plotTop={panelGridTop}
          plotHeight={scale.plotHeight}
          trackWidth={chrome.editorWidth}
          limit={props.yLimit ?? { min: null, max: null }}
          onLimit={props.onYLimit}
        />
      )}
    </div>
  );
}
