// ============================================================
// 时点明细抽屉（第五十六轮）：原「时点页签 / 价格摘要条」（主视觉里的
// 折扣率+现价+划线 RRP+来源店铺横排页签）撤出主视觉——领导页面清洁要求，
// 收进二级抽屉纵向排布（一行一个产品框，复用 PriceSummary 条目渲染）。
// 入口 = 图顶工具行「⋯ 更多」二级菜单；数据同源（buildPriceSummary 最新有值点，
// 随图表窗口联动），订阅铃铛与触发黄点保留在每行行尾。
// ============================================================
import { Drawer } from 'antd';
import PriceSummary from './PriceSummary';
import type { PriceSummaryItem } from './chartModel';
import type { CurrencyMode, Granularity } from '../../dataModel/types';
import { color, fontSize } from '../../theme/tokens';

export default function PointDrawer(props: {
  open: boolean;
  onClose: () => void;
  items: PriceSummaryItem[];
  currency: CurrencyMode;
  granularity: Granularity;
  pointDate?: string | null;
  alertCounts?: Record<string, number>;
  subscribedKeys?: Set<string>;
  onToggleSubscribe?: (key: string) => void;
}) {
  return (
    <Drawer
      open={props.open}
      onClose={props.onClose}
      width={Math.min(560, window.innerWidth - 48)}
      title={<span style={{ fontSize: 15, fontWeight: 600 }}>时点明细</span>}
      styles={{ body: { padding: '12px 20px 20px' } }}
    >
      <div style={{ fontSize: fontSize.caption, color: color.mute, lineHeight: '18px', marginBottom: 4 }}>
        窗口末桶最新时点的各产品折后价 · 随图表窗口联动 · 时点明细悬停图上可看
      </div>
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
        />
      )}
    </Drawer>
  );
}
