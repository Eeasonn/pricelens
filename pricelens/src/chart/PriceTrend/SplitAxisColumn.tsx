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
  axisChrome,
  type Geom,
  type YScale,
} from './helpers';
import TierBand from './TierBand';
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
  /** 绘图区下方的附加刻度（2026-11-02 成本柱模式销毛率轴）：y = 相对绘图区底缘（X 轴
   *  基线）的向下像素偏移，与价格刻度同款文字/短横线；0 不重复出（与价格轴共用基线上的 0） */
  belowTicks?: { y: number; text: string }[];
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
  const plotBottom = panelGridTop + scale.plotHeight;
  const belowTicks = showYTicks && props.belowTicks && props.belowTicks.length > 0 ? props.belowTicks : [];
  const belowExtra = belowTicks.length > 0 ? Math.max(...belowTicks.map((t) => t.y)) + 10 : 0;
  return (
    <div style={{ position: 'relative', width: axisW, height: plotBottom + Math.max(GRID.bottom, belowExtra) }}>
      {/* 价格档位带（梯子 + 顶部小标）：与主图 Chart.tsx 共用 TierBand 公共组件
          （2026-11-01 审计 P3 抽取，两处逐像素同款由构造保证）。小标贴绘图区顶
          上方——不放轴列顶部空气带，分离模式那里被 Y 轴上下限输入盒（不透明底
          zIndex 8）盖住（2026-11-01 审查 P2）；与主图轴区同口径定位。 */}
      <TierBand
        tierBoxes={tierBoxes}
        tierWidth={chrome.tierWidth}
        showYTicks={showYTicks}
        plotTop={panelGridTop}
      />
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
      {/* 绘图区下方附加刻度（成本柱销毛率轴）：复用价格刻度的文字列/短横线几何 */}
      {belowTicks.map((t) => (
        <div
          key={`bt-${t.text}`}
          className="tnum"
          style={{
            position: 'absolute',
            left: chrome.tickLeft,
            top: Math.round(plotBottom + t.y) - 8,
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
      {belowTicks.map((t) => (
        <div
          key={`bd-${t.text}`}
          style={{
            position: 'absolute',
            left: chrome.dashLeft,
            top: Math.round(plotBottom + t.y) - 0.5,
            width: TICK_DASH_W,
            height: 1,
            background: color.hairlineStrong,
            pointerEvents: 'none',
          }}
        />
      ))}
      {/* 断轴省略号（⋮）：短横线列居中（「Y 轴自动压缩」关闭 = 不产生断轴，自然无符号）。
          第一百八十二轮：悬停提示 + role=img 明确「刻度非连续」。
          轴列宽 0（本币 + 关「Y 刻度线」）时不渲染——负偏移会压到右侧面板（2026-11-01 审查）。 */}
      {chrome.visible && scale.breaks.map((b, i) => (
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
