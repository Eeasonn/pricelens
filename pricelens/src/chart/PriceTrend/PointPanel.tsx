// ============================================================
// 时点面板（第五十六轮再版，用户拍板）：时点摘要的常驻入口 = 价格走势图右缘
// 「书签带」（竖排「时点摘要」小字，默认收起——领导页面清洁要求下只是一条窄灰带）；
// 点击 = 图右侧**原地**展开 ~336px 内嵌面板（非视口抽屉：抽屉会盖住图右缘
// 最新数据），图表自动收窄（Chart ResizeObserver 跟随），纵向一行一产品框
// （复用 PriceSummary stack 条目：折扣徽章/现价/划线RRP/来源/订阅铃铛）。
// 展开态不持久化——每次进页面默认收起，保证演示/领导视角永远是干净版。
// 开促销明细抽屉时上层自动收起本面板（右侧空间冲突）。
// ============================================================
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import type { CurrencyMode, Granularity } from '../../dataModel/types';
import { color, fontSize, radius } from '../../theme/tokens';
import PriceSummary, { fmtPointDate } from './PriceSummary';
import type { PriceSummaryItem } from './chartModel';

interface PointPanelProps {
  open: boolean;
  onToggle: () => void;
  items: PriceSummaryItem[];
  currency: CurrencyMode;
  granularity: Granularity;
  pointDate?: string | null;
  alertCounts?: Record<string, number>;
  subscribedKeys?: Set<string>;
  onToggleSubscribe?: (key: string) => void;
}

/** 收起态：图右缘书签带（竖排文字 + 展开箭头），alignSelf stretch 与图同高 */
function BookmarkTab(props: { onToggle: () => void }) {
  return (
    <div
      role="button"
      title="展开时点摘要（各产品最新折扣 / 现价 / RRP / 来源）"
      onClick={props.onToggle}
      style={{
        width: 24,
        flexShrink: 0,
        alignSelf: 'stretch',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        cursor: 'pointer',
        border: `1px solid ${color.hairline}`,
        borderRadius: `0 ${radius.card}px ${radius.card}px 0`,
        background: color.canvas,
        userSelect: 'none',
      }}
    >
      <RightOutlined style={{ fontSize: 10, color: color.mute }} />
      <span
        style={{
          writingMode: 'vertical-rl',
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: 3,
          color: color.mute,
        }}
      >
        时点摘要
      </span>
    </div>
  );
}

export default function PointPanel(props: PointPanelProps) {
  if (!props.open) return <BookmarkTab onToggle={props.onToggle} />;

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
        border: `1px solid ${color.hairline}`,
        borderRadius: radius.card,
        background: color.canvas,
        padding: '10px 12px',
      }}
    >
      {/* 头部：收起按钮 + 时点日期（与摘要条同口径：窗口末桶最新周三锚日） */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span
          role="button"
          title="收起时点摘要"
          onClick={props.onToggle}
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
      <div style={{ fontSize: fontSize.caption, color: color.mute, lineHeight: '16px', marginBottom: 8 }}>
        窗口末桶最新时点 · 随图表窗口联动
      </div>
      {/* 产品清单：纵向一行一框；多产品时纵向滚动 */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {props.items.length === 0 ? (
          <div style={{ padding: '32px 0', textAlign: 'center', fontSize: fontSize.bodySm, color: color.mute }}>
            当前窗口无数据
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
