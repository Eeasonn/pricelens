// ============================================================
// 图例页签整排：由看板层注入图顶工具行中央，底部时间区域只承担时间轴和窗口调整。
// 点击页签 = 屏蔽/恢复该系列折线。隐藏态 = 虚线边 + 降透明（原视觉不变）。
// ============================================================
import BrandDot from '../../components/BrandMark';
import type { Series } from '../../dataModel/types';
import { curveNameOf } from './chartModel';
import { color, radius } from '../../theme/tokens';

export default function LegendPills(props: {
  series: Series[];
  hiddenKeys: Set<string>;
  onToggle: (key: string) => void;
}) {
  if (props.series.length === 0) return null;
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'nowrap',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        overflowX: 'auto',
        padding: '6px 0 2px',
      }}
    >
      {props.series.map((s) => {
        const hidden = props.hiddenKeys.has(s.key);
        return (
          <span
            key={s.key}
            role="button"
            title={hidden ? '点击恢复显示该产品' : '点击屏蔽该产品'}
            onClick={() => props.onToggle(s.key)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              height: 20,
              padding: '0 8px',
              fontSize: 11,
              lineHeight: '18px',
              borderRadius: radius.pill,
              flexShrink: 0,
              maxWidth: 170,
              background: color.canvas,
              border: `1px ${hidden ? 'dashed' : 'solid'} ${hidden ? color.hairlineStrong : color.hairline}`,
              opacity: hidden ? 0.45 : 1,
              cursor: 'pointer',
            }}
          >
            <BrandDot brand={s.brand} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: color.body }}>
              {curveNameOf(s)}
            </span>
          </span>
        );
      })}
    </div>
  );
}
