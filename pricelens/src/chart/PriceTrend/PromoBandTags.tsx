// ============================================================
// 大促档期标志行（价格页 Chart 第四十二/四十七轮窄条形态，2026-11-03 抽共享）：
// 绘图区下方的胶囊标志带——默认纯图标（名称悬停可见）；空间够（与相邻标志
// 互不重叠、不越绘图区左右缘）时显示「图标 + 档期名」胶囊，放不下自动回落
// 纯图标。点击弹 PromoEventCard（名称 / 起止 / 深度）。
// 价格走势图（Chart.tsx）与量价成本柱模式（VolumePrice 面板）共用同一组件，
// 视觉与交互零变化；定位所需几何由调用方传入（组件不感知 Chart 内部布局）。
// ============================================================
import { Popover } from 'antd';
import { TagOutlined } from '@ant-design/icons';
import { color, radius } from '../../theme/tokens';
import { measureText } from '../../components/ProductCascader';
import type { PromoBand } from './chartModel';
import { promoDepthDotColorOf } from './promoShared';

/** 大促档期事件卡（第三十六轮；第四十七轮精简：只留名称/起止/深度） */
export function PromoEventCard({ band }: { band: PromoBand }) {
  return (
    <div style={{ width: 208 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: color.ink, display: 'flex', alignItems: 'center', gap: 6 }}>
        <i
          style={{
            display: 'inline-block',
            width: 8,
            height: 8,
            borderRadius: radius.pill,
            background: promoDepthDotColorOf(band.depth),
            boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)',
          }}
        />
        {band.name}
      </div>
      <div className="tnum" style={{ marginTop: 6, fontSize: 12, color: color.body }}>
        起止 {band.dateText.replace('–', ' ~ ')}
      </div>
      <div style={{ marginTop: 4, fontSize: 12, color: color.body }}>
        促销深度
        <span style={{ fontWeight: 600, color: '#b45309', marginLeft: 6 }}>{band.depth}</span>
      </div>
    </div>
  );
}

/** 大促档期标志行：绝对定位的一组胶囊（挂在调用方 position:relative 容器内）。
 *  bands 为空或几何无效时不渲染。 */
export default function PromoBandTags(props: {
  bands: PromoBand[];
  plotLeft: number;
  plotWidth: number;
  n: number;
  /** 标志行基线 y（容器坐标）：Chart 传 plotTop+plotHeight+(showXLabels?24:4)；
   *  量价成本柱模式传同款偏移（绘图区底缘下 24px，与经典胶囊行同视觉位） */
  top: number;
}) {
  const { bands, plotLeft, plotWidth, n } = props;
  if (bands.length === 0 || n <= 0 || plotWidth <= 0) return null;
  const items = bands
    .map((b) => ({
      b,
      mid: plotLeft + (((b.startIdx + b.startFrac + b.endIdx + b.endFrac) / 2 / n) * plotWidth),
    }))
    .sort((x, y) => x.mid - y.mid);
  const ICON_W = 16;
  const labelW = (name: string): number => ICON_W + 4 + measureText(name) * (10 / 13) + 12;
  let lastRight = -Infinity;
  return (
    <>
      {items.map(({ b, mid }, i) => {
        const lo = i === 0 ? plotLeft - 16 : lastRight + 8;
        const hi = i + 1 < items.length ? items[i + 1].mid - 10 : plotLeft + plotWidth + 16;
        const w = labelW(b.name);
        const withLabel = mid - w / 2 >= lo && mid + w / 2 <= hi;
        lastRight = mid + (withLabel ? w / 2 : ICON_W / 2);
        return (
          <div
            key={`pm-${b.key}`}
            style={{
              position: 'absolute',
              left: mid,
              // 专用行（第四十七轮）：轴标签 margin 22 下推，图标带 +4~18 独占；
              // 第110轮：小图自带时间轴标签（占 +7~19）→ 档期标志下移让位（+24~38，
              // 仍在 GRID.bottom=40 留白内）
              top: props.top,
              transform: 'translateX(-50%)',
              zIndex: 9,
            }}
          >
            <Popover trigger="click" placement="top" content={<PromoEventCard band={b} />}>
              <button
                type="button"
                aria-label={`${b.name} ${b.dateText}，点击看档期详情`}
                title={`${b.name} ${b.dateText} · 点击看档期详情`}
                onClick={(e) => e.stopPropagation()}
                className="lpl-hit"
                style={{
                  position: 'relative',
                  pointerEvents: 'auto',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  height: 16,
                  padding: withLabel ? '0 7px 0 5px' : '0 2px',
                  borderRadius: radius.pill,
                  border: withLabel ? '1px solid rgba(180, 83, 9, 0.3)' : undefined,
                  background: withLabel ? color.canvas : undefined,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                <TagOutlined style={{ fontSize: withLabel ? 10 : 12, color: '#b45309' }} />
                {withLabel && (
                  <span style={{ fontSize: 10, lineHeight: '12px', color: '#b45309', fontWeight: 500 }}>{b.name}</span>
                )}
              </button>
            </Popover>
          </div>
        );
      })}
    </>
  );
}
