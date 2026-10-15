// ============================================================
// 矩阵迷你价格史（第三十七轮）：Keepa「历史」列范式 —— 方形阶梯线 + 最高/最低
// 点标记。第四十轮改小多元（small multiples）范式：可选共享值域
// （domainMin/Max，同盒我司+竞品共用 → 线的相对高低=价位差，直接可比）；
// 共享值域时不再画 Y 刻度（每行重复同两个数=噪音），极值交由点标记+悬停 title。
// 全周期 93 周一次画完，纯 SVG 无 ECharts。缺采周水平直连跨接。
// ============================================================
import type { OverviewSparkPoint } from '../../dataModel/aggregate';
import { color } from '../../theme/tokens';

const PAD = { l: 10, r: 7, t: 8, b: 13 };

/** 紧凑价签（悬停 title 用）：$2,500 / ₽66.8K */
function fmtShort(v: number, currency: 'usd' | 'local'): string {
  const sym = currency === 'usd' ? '$' : '₽';
  if (Math.abs(v) >= 10000) {
    const k = v / 1000;
    return `${sym}${k.toFixed(k >= 100 ? 0 : 1).replace(/\.0$/, '')}K`;
  }
  return `${sym}${Math.round(v).toLocaleString('en-US')}`;
}
const fmtMonth = (monthId: string): string => `${monthId.slice(2, 4)}-${monthId.slice(4, 6)}`;

export default function MatrixSpark(props: {
  points: OverviewSparkPoint[];
  lineColor: string;
  currency: 'usd' | 'local';
  width?: number;
  height?: number;
  /** 共享值域（第四十轮）：同盒各行统一 min/max → 纵向位置可比 */
  domainMin?: number;
  domainMax?: number;
}) {
  const { points, lineColor, currency, width = 150, height = 46, domainMin, domainMax } = props;
  const n = points.length;
  const valued = points.map((p, i) => ({ i, v: p.price })).filter((p): p is { i: number; v: number } => p.v != null);
  const x = (i: number): number => PAD.l + (i / Math.max(1, n - 1)) * (width - PAD.l - PAD.r);
  const ownMin = valued.length ? Math.min(...valued.map((p) => p.v)) : 0;
  const ownMax = valued.length ? Math.max(...valued.map((p) => p.v)) : 1;
  const minV = domainMin ?? ownMin;
  const maxV = domainMax ?? ownMax;
  const span = maxV - minV || 1;
  const y = (v: number): number => PAD.t + (1 - (v - minV) / span) * (height - PAD.t - PAD.b);

  // 方形阶梯：持有前值到下一个有值点的 x，再垂直跳变（step 'end' 缩微版）
  let d = '';
  for (const { i, v } of valued) {
    d += d === '' ? `M${x(i).toFixed(1)} ${y(v).toFixed(1)}` : `H${x(i).toFixed(1)}V${y(v).toFixed(1)}`;
  }

  const maxPt = valued.reduce<{ i: number; v: number } | null>((acc, cur) => (acc == null || cur.v > acc.v ? cur : acc), null);
  const minPt = valued.reduce<{ i: number; v: number } | null>((acc, cur) => (acc == null || cur.v < acc.v ? cur : acc), null);

  // X 刻度（第四十五轮自适应定版）：标签宽 ≈26px（"26-10" @8.5px），按占位互斥挑选——
  // 末刻度恒显示且右对齐（锚定端点，不再向右溢出被裁）；首刻度仅在与末刻度净距
  // ≥2×标签宽+6px 时显示；中位刻度需与两侧已占位区各留 ≥6px 净空且月份不与已有重复。
  // （旧版两处病：首被丢时 splice(1) 实际追加 → 顺序颠倒、末刻度错拿 start 锚被右缘
  //  裁切；46px 阈值 < 两倍标签宽 → 首末标签视觉相撞 "26-0226-10"。）
  const TICK_W = 26;
  type Tick = { i: number; anchor: 'start' | 'middle' | 'end' };
  const xTicks: Tick[] = [];
  if (valued.length) {
    const first = valued[0].i;
    const last = valued[valued.length - 1].i;
    xTicks.push({ i: last, anchor: 'end' });
    if (x(last) - x(first) >= TICK_W * 2 + 6) xTicks.unshift({ i: first, anchor: 'start' });
    const mid = valued[Math.floor((valued.length - 1) / 2)].i;
    const midMonth = fmtMonth(points[mid].monthId);
    const midL = x(mid) - TICK_W / 2;
    const midR = x(mid) + TICK_W / 2;
    const leftEdge = xTicks.length === 2 ? x(first) + TICK_W + 6 : PAD.l + 2;
    const rightEdge = x(last) - TICK_W - 6;
    if (
      mid !== first &&
      mid !== last &&
      xTicks.every((t) => fmtMonth(points[t.i].monthId) !== midMonth) &&
      midL >= leftEdge &&
      midR <= rightEdge
    ) {
      xTicks.splice(xTicks.length - 1, 0, { i: mid, anchor: 'middle' });
    }
  }

  return (
    <svg width={width} height={height} role="img" style={{ display: 'block' }}>
      <title>
        {maxPt && minPt
          ? `最高 ${fmtShort(maxPt.v, currency)} · 最低 ${fmtShort(minPt.v, currency)}`
          : '暂无价格数据'}
      </title>
      {/* 顶/底轴 hairline（与共享值域上下沿同高，盒子内各行天然对齐） */}
      <line x1={PAD.l} x2={width - PAD.r} y1={PAD.t} y2={PAD.t} stroke={color.hairline} strokeWidth={1} />
      <line x1={PAD.l} x2={width - PAD.r} y1={height - PAD.b} y2={height - PAD.b} stroke={color.hairline} strokeWidth={1} />
      {/* X 刻度：首/中/末有值月（占位互斥自适应，锚定端点不溢出） */}
      {xTicks.map((t, k) => (
        <text
          key={k}
          x={x(t.i)}
          y={height - 3}
          fontSize={8.5}
          fill={color.mute}
          textAnchor={t.anchor}
          style={{ fontFamily: 'inherit' }}
        >
          {fmtMonth(points[t.i].monthId)}
        </text>
      ))}
      {d !== '' && <path d={d} fill="none" stroke={lineColor} strokeWidth={1.4} strokeLinejoin="round" />}
      {/* 最高=实心点 / 最低=空心环（与主图极值标注同语言） */}
      {maxPt && (
        <circle cx={x(maxPt.i)} cy={y(maxPt.v)} r={2} fill={lineColor}>
          <title>{`最高 ${fmtShort(maxPt.v, currency)}`}</title>
        </circle>
      )}
      {minPt && (
        <circle cx={x(minPt.i)} cy={y(minPt.v)} r={2.2} fill={color.canvas} stroke={lineColor} strokeWidth={1.2}>
          <title>{`最低 ${fmtShort(minPt.v, currency)}`}</title>
        </circle>
      )}
    </svg>
  );
}
