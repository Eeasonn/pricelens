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
import { color, fontSize, motion, radius } from '../../theme/tokens';
import PriceSummary, { fmtPointDate } from './PriceSummary';
import type { PriceSummaryItem } from './chartModel';

interface PointPanelProps {
  open: boolean;
  /** 书签带点击 = 展开并保持显示（第九十四轮语义） */
  onToggle: () => void;
  /** 头部「收起」= 显式收起（含保持显示） */
  onCollapse: () => void;
  /** 保持显示（第九十四轮）：开启后悬停划走也不收起；头部按钮切换 */
  pinned: boolean;
  onPinToggle: () => void;
  items: PriceSummaryItem[];
  currency: CurrencyMode;
  granularity: Granularity;
  pointDate?: string | null;
  alertCounts?: Record<string, number>;
  subscribedKeys?: Set<string>;
  onToggleSubscribe?: (key: string) => void;
}

export default function PointPanel(props: PointPanelProps) {
  const open = props.open;
  const asOf = props.items.find((it) => it.asOf != null)?.asOf ?? null;
  // 书签带 ↔ 面板：容器宽度 24↔336 过渡 + 两层内容交叉淡入淡出（第九十三轮，
  // 悬停自动开合频繁触发，硬切换太生硬）。容器恒渲染，收起态 overflow hidden 裁掉面板层。
  return (
    <div
      style={{
        width: open ? 336 : 24,
        flexShrink: 0,
        alignSelf: 'stretch',
        position: 'relative',
        overflow: 'hidden',
        minHeight: 0,
        boxSizing: 'border-box',
        border: `1px solid ${color.hairline}`,
        borderRadius: open ? radius.card : `0 ${radius.card}px ${radius.card}px 0`,
        background: color.canvas,
        transition: `width ${motion.base}ms ${motion.enter}, border-radius ${motion.base}ms ease`,
      }}
    >
      {/* 书签带层（收起态）：竖排文字 + 展开箭头 */}
      <div
        role="button"
        aria-hidden={open}
        title="展开时点摘要（各产品最新折扣 / 现价 / RRP / 来源）"
        onClick={() => {
          if (!open) props.onToggle();
        }}
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          cursor: 'pointer',
          userSelect: 'none',
          opacity: open ? 0 : 1,
          pointerEvents: open ? 'none' : 'auto',
          transition: `opacity ${motion.fast}ms ease`,
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
      {/* 面板层（展开态）：内容淡入略滞后于容器展开，避免窄容器里内容挤压闪烁 */}
      <div
        aria-hidden={!open}
        style={{
          position: 'absolute',
          inset: 0,
          width: 334,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          padding: '10px 12px',
          boxSizing: 'border-box',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: open ? `opacity ${motion.base}ms ease 90ms` : `opacity ${motion.fast}ms ease`,
        }}
      >
      {/* 头部：收起按钮 + 时点日期 + 保持显示开关（与摘要条同口径：窗口末桶最新周三锚日） */}
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
        <span
          role="button"
          aria-pressed={props.pinned}
          title={props.pinned ? '已保持显示：取消后恢复悬停最新列自动展开' : '保持显示：悬停移开后面板不再自动收起'}
          onClick={props.onPinToggle}
          style={{
            marginLeft: 'auto',
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            fontSize: 11,
            lineHeight: '18px',
            padding: '0 8px',
            borderRadius: radius.pill,
            border: `1px ${props.pinned ? 'solid' : 'dashed'} ${props.pinned ? color.link : color.hairline}`,
            color: props.pinned ? color.link : color.mute,
            background: props.pinned ? '#edf5ff' : color.canvas,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          保持显示
        </span>
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
    </div>
  );
}
