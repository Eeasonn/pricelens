// ============================================================
// 价格档位带公共组件（2026-11-01 审计 P3 抽取）：档位梯子 + 顶部「价格档位」
// 常驻小标。此前 Chart.tsx 主图轴区与 SplitAxisColumn 分离轴列各画一份、靠人工
// 保持逐像素同款；抽出后档位几何（TierBox 列表由 buildTierBoxes 按各自 geom 算
// 出、绝对定位坐标随调用方坐标系）仍由调用方传入，本组件只负责渲染，两处天然
// 同款。视觉契约（与抽取前逐像素一致）：
// - 档位区块：贴轴区左缘整块竖向色带；实心 = 档内有数据、虚线 = 空档占位
//   （第三十二轮，梯子连续可读）；档位文字恒三行竖排（第九十三轮），关「Y 刻度
//   线」时居中整块（第九十一轮）。
// - 小标（2026-11-01 审计 P2-3）：贴绘图区顶上方，与右侧 Y 刻度数字区分。
// ============================================================
import {
  TIER_LABEL_W,
  tierLabelShort,
} from './helpers';
import type { TierBox } from './chartModel';
import { color } from '../../theme/tokens';

export default function TierBand(props: {
  /** buildTierBoxes 按调用方 geom 算出的档位区块（空数组 = 整带不渲染） */
  tierBoxes: TierBox[];
  /** 轴区档位列宽（axisChrome().tierWidth） */
  tierWidth: number;
  /** 「Y 刻度线」开关：关 = 档位文字居中整个轴区宽度 */
  showYTicks: boolean;
  /** 绘图区顶（小标贴其上方，不小于 0） */
  plotTop: number;
  /** 主图轴区给档位区块 zIndex 1（刻度文字 zIndex 2 叠其上）；分离轴列不设 */
  boxZIndex?: number;
}) {
  if (props.tierBoxes.length === 0) return null;
  return (
    <>
      {/* 价格档位常驻小标（2026-11-01 审计 P2-3）：贴绘图区顶上方，把档位梯子与
          右侧 Y 刻度数字区分开（此前只有悬停 title 可知这是档位带）。 */}
      <span
        title="价格档位（USD）"
        style={{
          position: 'absolute',
          left: 0,
          top: Math.max(0, props.plotTop - 13),
          height: 13,
          lineHeight: '13px',
          fontSize: 8,
          color: color.mute,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}
      >
        价格档位
      </span>
      {/* 档位区块（仅 USD）：贴容器左缘的整块竖向色带 = [档位文字区 | 刻度文字区]，
          刻度（zIndex 2）与短横线叠画在区块上；无数据的档 = 虚线占位（第三十二轮，
          梯子连续可读）；本币不渲染；图隐藏（空态）时整块消失。 */}
      {props.tierBoxes.map((tb, i) => (
        <div
          key={`tier-${tb.label}-${i}`}
          title={`价格档位 ${tb.label}（USD）${tb.empty ? '· 当前无产品' : ''}`}
          style={{
            position: 'absolute',
            left: 0,
            top: tb.top,
            width: props.tierWidth,
            height: tb.h,
            boxSizing: 'border-box',
            border: tb.empty ? `1px dashed ${color.hairline}` : `1px solid ${color.hairline}`,
            background: tb.empty ? 'transparent' : i % 2 === 0 ? color.canvasSoft2 : color.canvasSoft,
            display: 'flex',
            alignItems: 'center',
            overflow: 'hidden',
            pointerEvents: 'none',
            zIndex: props.boxZIndex,
          }}
        >
          <span
            style={{
              // 关「Y 刻度线」时档位文字居中整个轴区宽度（第九十一轮）
              width: props.showYTicks ? TIER_LABEL_W : props.tierWidth,
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
    </>
  );
}
