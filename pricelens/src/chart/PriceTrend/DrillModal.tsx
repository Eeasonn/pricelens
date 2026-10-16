// ============================================================
// §6.3 月/季视图圈点点击下钻弹窗：
// - 季视图点某季 → 该季内月度趋势（同数据汇总口径）→ 点某月 → 该月周度趋势（套娃一层为止）
// - 月视图点某月 → 直接该月周度趋势
// - 居中 Modal（L5 阴影、12px 圆角），标题=产品名 · 期间，面包屑逐级返回（2026Q3 → 202608 → 周）
// - 迷你图同编码（平滑+圈点+价格标签+悬停附框）；周视图层不再响应点击下钻
// 数据口径：用 buildSeries 以对应粒度重查单组（agg/currency/platform 与主页一致），保证口径一致。
// ============================================================
import { useMemo, useState } from 'react';
import { Modal } from 'antd';
import { RightOutlined } from '@ant-design/icons';
import type { AggMode, CurrencyMode, Granularity, Series, SeriesQuery, SkuGroupQuery } from '../../dataModel/types';
import { color, font, fontSize, radius, shadow, space } from '../../theme/tokens';
import Chart from './Chart';
import { monthWeeks, quarterMonths } from './helpers';

export interface DrillInfo {
  group: SkuGroupQuery; // 被点击系列的取数组（单产品）
  label: string; // 品牌 + 产品名 + ROMRAM
  originGran: 'quarter' | 'month'; // 发起下钻的主图粒度
  originBucket: string; // 被点击的季/月桶 id
}

interface StackEntry {
  gran: 'month' | 'week'; // month=显示某季的月度趋势（bucketId=季）；week=显示某月的周度趋势（bucketId=月）
  bucketId: string;
}

export interface DrillModalProps {
  info: DrillInfo | null;
  currency: CurrencyMode;
  agg: AggMode;
  priceTypes: { discounted: boolean; rrp: boolean };
  platform: SeriesQuery['platform'];
  /** 以对应粒度重查单组（同 agg/币种/平台口径） */
  buildRange: (group: SkuGroupQuery, gran: Granularity, startBucket: string, endBucket: string) => Series[];
  onClose: () => void;
}

export default function DrillModal(props: DrillModalProps) {
  const { info } = props;
  if (!info) return null;
  return (
    <Modal
      open
      centered
      footer={null}
      width={780}
      onCancel={props.onClose}
      title={null}
      styles={{
        content: { borderRadius: radius.modal, boxShadow: shadow.l5, padding: space.lg },
        header: { display: 'none' },
      }}
    >
      <DrillInner key={`${info.label}|${info.originBucket}`} {...props} info={info} />
    </Modal>
  );
}

function DrillInner(props: DrillModalProps & { info: DrillInfo }) {
  const { info, currency, agg, priceTypes, platform, buildRange } = props;
  const [stack, setStack] = useState<StackEntry[]>(() =>
    info.originGran === 'quarter'
      ? [{ gran: 'month', bucketId: info.originBucket }]
      : [{ gran: 'week', bucketId: info.originBucket }],
  );
  const cur = stack[stack.length - 1];

  const series = useMemo(() => {
    if (cur.gran === 'month') {
      const [s, e] = quarterMonths(cur.bucketId);
      return buildRange(info.group, 'month', s, e);
    }
    const weeks = monthWeeks(cur.bucketId);
    return weeks ? buildRange(info.group, 'week', weeks[0], weeks[1]) : [];
  }, [cur, info.group, buildRange]);
  const s0 = series[0] ?? null;

  // 面包屑：已点桶 id 逐级 + 当前层类型（2026Q3 → 202608 → 周）
  const crumbs: { label: string; mono: boolean; stackIdx: number | null }[] = [
    ...stack.map((en, i) => ({ label: en.bucketId, mono: true, stackIdx: i })),
    { label: cur.gran === 'month' ? '月' : '周', mono: false, stackIdx: null },
  ];

  const onMiniDrill = (_seriesKey: string, bucketId: string): void => {
    // 仅月度层可继续下钻（周度层 enableDrill=false 不进入）
    setStack((st) => [...st, { gran: 'week', bucketId }]);
  };

  return (
    <div>
      {/* 标题 = 产品名 · 期间 + 面包屑 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: space.xs, marginBottom: space.md }}>
        <div style={{ fontSize: fontSize.bodyMd, fontWeight: 600, color: color.ink }}>
          {info.label} · <span className="tnum">{cur.bucketId}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: space.xs, fontSize: fontSize.caption }}>
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            // 只有严格高于当前层的桶可点（末两位 = 当前视图的桶与类型）
            const clickable = c.stackIdx != null && i < stack.length - 1;
            return (
              <span key={`${c.label}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: space.xs }}>
                {i > 0 && <RightOutlined style={{ fontSize: 9, color: color.hairlineStrong }} />}
                {clickable ? (
                  <button
                    type="button"
                    className={c.mono ? 'mono' : undefined}
                    onClick={() => setStack((st) => st.slice(0, c.stackIdx! + 1))}
                    style={{
                      border: 'none',
                      background: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      fontSize: fontSize.caption,
                      color: color.link,
                    }}
                  >
                    {c.label}
                  </button>
                ) : (
                  <span className={c.mono ? 'mono' : undefined} style={{ color: last ? color.ink : color.mute }}>
                    {c.label}
                  </span>
                )}
              </span>
            );
          })}
        </div>
      </div>
      {/* 迷你走势图（同编码；月度层可点继续下钻，周度层不再响应）。
          第七轮：容器高由 Y 模型自适应派生（Chart 内部），不再固定 320。
          gridTop 收窄到 36 只保留 ₽/$+齿轮行（图例页签第五十四轮起在主图时间轴下方，
          下钻弹窗本就不渲染） */}
      {s0 ? (
        <Chart
          series={[s0]}
          granularity={cur.gran}
          currency={currency}
          priceTypes={priceTypes}
          gridTop={36}
          enableDrill={cur.gran === 'month'}
          enableJump={false}
          enableOffer={false}
          onDrill={onMiniDrill}
          emptyHint="该期间无数据"
        />
      ) : (
        <div
          style={{
            height: 200,
            display: 'grid',
            placeItems: 'center',
            color: color.mute,
            fontSize: fontSize.bodySm,
          }}
        >
          该期间无数据
        </div>
      )}
    </div>
  );
}
