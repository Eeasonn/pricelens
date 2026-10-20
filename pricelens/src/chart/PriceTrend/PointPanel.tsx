// ============================================================
// 时点面板（第112轮）：仅由标题行「时点摘要」按钮手动打开/收起——图右侧原地
// 展开 336px 内嵌面板（非视口抽屉：抽屉会盖住图右缘最新数据），图表自动收窄
// （Chart ResizeObserver 跟随），纵向一行一产品框（复用 PriceSummary stack
// 条目：折扣徽章/现价/划线RRP/来源/订阅铃铛）。收起 = 不渲染，不占宽度。
// 展开态不持久化——每次进页面默认收起；开促销明细抽屉时上层自动收起
// （右侧空间冲突）。
// ============================================================
import { LeftOutlined } from '@ant-design/icons';
import type { CurrencyMode, Granularity } from '../../dataModel/types';
import { color, fontSize, radius } from '../../theme/tokens';
import PriceSummary, { fmtPointDate } from './PriceSummary';
import type { PriceSummaryItem } from './chartModel';

interface PointPanelProps {
  open: boolean;
  /** 头部「收起」= 收起面板 */
  onCollapse: () => void;
  items: PriceSummaryItem[];
  currency: CurrencyMode;
  granularity: Granularity;
  pointDate?: string | null;
  alertCounts?: Record<string, number>;
  subscribedKeys?: Set<string>;
  onToggleSubscribe?: (key: string) => void;
}

export default function PointPanel(props: PointPanelProps) {
  if (!props.open) return null; // 收起 = 不占宽度、不留空隙（外层 flex 行无 gap 残留）
  const asOf = props.items.find((it) => it.asOf != null)?.asOf ?? null;
  return (
    <div
      style={{
        width: 336,
        flexShrink: 0,
        alignSelf: 'stretch',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        boxSizing: 'border-box',
        padding: '10px 12px',
        border: `1px solid ${color.hairline}`,
        borderRadius: radius.card,
        background: color.canvas,
      }}
    >
      {/* 头部：收起按钮 + 时点日期（与摘要条同口径：窗口末桶最新周三锚日） */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span
          role="button"
          title="收起时点摘要"
          onClick={props.onCollapse}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 12,
            color: color.mute,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            padding: '2px 4px',
          }}
        >
          <LeftOutlined style={{ fontSize: 10 }} />
          收起
        </span>
        <span className="tnum" style={{ fontSize: 13, fontWeight: 700, color: color.ink, whiteSpace: 'nowrap' }}>
          时点 {props.pointDate ?? fmtPointDate(props.granularity, asOf)}
        </span>
      </div>
      {/* 产品清单：纵向一行一框；多产品时纵向滚动 */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {props.items.length === 0 ? (
          <div style={{ padding: '32px 0', textAlign: 'center', fontSize: fontSize.bodySm, color: color.mute }}>
            当前时间段无数据
          </div>
        ) : (
          <PriceSummary
            items={props.items}
            currency={props.currency}
            granularity={props.granularity}
            pointDate={props.pointDate}
            alertCounts={props.alertCounts}
            subscribedKeys={props.subscribedKeys}
            onToggleSubscribe={props.onToggleSubscribe}
            stack
            chrome={false}
            showHeader={false}
          />
        )}
      </div>
    </div>
  );
}
