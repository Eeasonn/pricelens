// ============================================================
// 量价 · 组内对比合并单图（2026-11-04 Eason 拍板）：纯量价模式（销毛开关关）
// + 本组对比视图的第二面板呈现——组内全部产品（主品 + 对比品，≤ COMPARES_PER_CARD_CAP + 1）
// 合并进同一张图，只改呈现不改数值（销量/价格由页面传入，与分离面板同源同窗口）。
// - 销量 = 面积图（海平面）：每周销量点直连，线下方半透明品牌色面积（fill
//   透明度 0.18，上缘 1.5px 同色加深细线）；多产品叠层非堆叠（互相透出）
// - 价格 = 平滑折线：Catmull-Rom → 三次贝塞尔（与 CostBarChart 私有 smoothPath
//   同款算法——该文件不在本组件改动域，故本地实现同款），品牌色 2.2px
// - 双轴：左 = 销量（页面级 nice 上限 + 上/中/0 三刻度，与经典模式同语言）；
//   右 = 价格（查看窗口内自适应上下限 + 10% 余量，上/中/下三刻度）
// - X 轴 = 全站日历周格式（axisTickPlan / shortBucketLabel 口径，周 = 2026W33，
//   边界刻度加粗，年份独立第二行——与主图同一套刻度计划）
// - 缺采纪律：null 不造 0——面积按非空连续段绘制（缺采周断开，不落 0）；
//   价格线跳过缺采/已隔离点连续（跳点连续，不伪造数据点）
// - hover：列高亮（canvasSoft2 列底衬，成本柱 focus 同语言）+ 列读值浮层
//   （每产品 价格 · 销量，白卡 hairline 同语言，右缘左翻）；键盘 ←/→/Home/End
//   切换观察列。focusIdx/onHover 传入 = 受控（页面联动明细卡），否则组件内部自持。
// - 图例：常驻图例行 = 组内产品名列表（品牌色点 + 名称）+ 右侧「销量面积 /
//   折后价线」编码提示（面板元信息行同语言）
// ============================================================
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import type { Granularity, SeriesPoint } from '../../dataModel/types';
import { axisTickPlan, shortBucketLabel } from '../../chart/PriceTrend/helpers';
import BrandDot from '../../components/BrandMark';
import { color, font, formatPrice, radius, shadow } from '../../theme/tokens';

/** 合并单图的一条产品系列：points/volumes = 查看窗口切片（与分离面板同源同窗口） */
export interface MergedCompareProduct {
  /** 面板 key（PanelSpec.key，React key / 图例项 key） */
  key: string;
  /** 展示名（型号 + 配置，与面板头同源） */
  name: string;
  brand: string;
  /** 品牌图表色（brandColorOf / series color，页面传入） */
  color: string;
  /** 查看窗口切片的价格序列（含 suspect 打标） */
  points: SeriesPoint[];
  /** 同窗口销量（null = 缺采，不造 0） */
  volumes: readonly (number | null)[];
}

/** 面积 fill 透明度（0.16–0.20 区间取 0.18：2–3 层叠置仍能互相透出） */
const AREA_ALPHA = 0.18;
/** 面积上缘细线：1.5px 同色加深（向黑混 25%） */
const AREA_EDGE_W = 1.5;
/** 价格平滑线宽（品牌色） */
const PRICE_W = 2.2;

const PLOT_TOP = 16;
/** X 轴标签带：主行（2026W33）+ 年份第二行 */
const AXIS_ZONE_H = 38;
const GRID_L = 56; // 左销量轴标签列
const GRID_R = 78; // 右价格轴标签列（$1,234 同宽语言）

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return `rgba(23, 23, 23, ${alpha})`;
  return `rgba(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}, ${alpha})`;
}

/** 同色加深（面积上缘细线）：向黑线性混合 f（0–1） */
function darken(hex: string, f: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  const ch = (i: number): number => Math.round(parseInt(h.slice(i * 2, i * 2 + 2), 16) * (1 - f));
  return `rgb(${ch(0)}, ${ch(1)}, ${ch(2)})`;
}

/** Catmull-Rom → 三次贝塞尔平滑（CostBarChart smoothPath 同款实现） */
function smoothPath(pts: Array<[number, number]>): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

export default function MergedCompareChart(props: {
  products: MergedCompareProduct[];
  /** 查看窗口的桶 id（X 轴日历周刻度口径）；n = 列数，各产品切片与之对位 */
  bucketIds: string[];
  granularity: Granularity;
  currency: 'local' | 'usd';
  /** 销量左轴 nice 上限（页面级，合并窗口全产品并集 niceCeil） */
  volumeAxisMax: number;
  /** 销量轴/读值文案（万档判定在页面，与明细卡同一份 formatVolumeAmount） */
  formatVolume: (v: number) => string;
  /** 绘图区高度（页面传共享轴 plotHeight，「每格高度」齿轮在合并图同样生效） */
  plotHeight?: number;
  /** 受控观察列（页面联动明细卡）；与 onHover 同时传入 = 受控，否则内部自持 */
  focusIdx?: number | null;
  onHover?: (i: number | null) => void;
  emptyHint?: ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const [innerHover, setInnerHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const en of entries) setWidth(en.contentRect.width);
    });
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const controlled = props.onHover != null && props.focusIdx !== undefined;
  const rawHover = controlled ? props.focusIdx ?? null : innerHover;
  const setHover = (i: number | null): void => {
    if (controlled) props.onHover?.(i);
    else setInnerHover(i);
  };

  const plotHeight = props.plotHeight ?? 300;
  const n = props.bucketIds.length;
  // 观察列钳入当前窗口（窗口切换/粒度换桶后外部值可能越界）
  const hover = rawHover != null && n > 0 ? Math.min(n - 1, Math.max(0, rawHover)) : null;
  const baseline = PLOT_TOP + plotHeight;
  const totalH = baseline + AXIS_ZONE_H;
  const geom: { plotLeft: number; plotWidth: number; n: number } | null =
    width >= 160 && n > 0 ? { plotLeft: GRID_L, plotWidth: width - GRID_L - GRID_R, n } : null;
  const empty = geom == null || props.products.length === 0;
  const ariaLabel = `${props.products.map((p) => p.name).join('、')} 合并量价对比图：面积 = 周销量（左轴），折线 = 折后价（右轴）。左右方向键切换观察周。`;

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
      {/* 常驻图例行：组内产品名列表（品牌色点 + 名称）+ 编码提示（面板元信息行同语言） */}
      <div
        role="group"
        aria-label="图例"
        style={{
          display: 'flex', alignItems: 'center', gap: 14, height: 30, overflow: 'hidden',
          fontSize: 11, lineHeight: '14px', color: color.mute, padding: '0 2px', marginBottom: 4, whiteSpace: 'nowrap',
        }}
      >
        {props.products.map((pr) => (
          <span key={pr.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <BrandDot brand={pr.brand} size={8} />
            <span style={{ color: color.body, fontWeight: 600 }}>{pr.name}</span>
          </span>
        ))}
        {props.products.length > 0 && (
          <>
            <span aria-hidden style={{ flexShrink: 0, width: 1, height: 12, background: color.hairline }} />
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <span aria-hidden style={{ width: 12, height: 9, borderRadius: 1, background: 'rgba(23, 23, 23, 0.18)' }} />
              销量 · 左轴
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <span aria-hidden style={{ width: 14, height: 2, background: color.body }} />
              折后价 · 右轴
            </span>
          </>
        )}
      </div>
      {/* 图区（键盘 ←/→/Home/End 切换观察列；可访问读数经页面明细卡 aria-describedby 关联） */}
      <div
        tabIndex={0}
        role="group"
        aria-label={ariaLabel}
        onKeyDown={(event: ReactKeyboardEvent<HTMLDivElement>) => {
          if (n <= 0) return;
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const cur = hover ?? n - 1;
          const next = event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? n - 1
              : event.key === 'ArrowLeft'
                ? Math.max(0, cur - 1)
                : Math.min(n - 1, cur + 1);
          setHover(next);
        }}
        style={{ position: 'relative', outline: 'none' }}
      >
        {empty && (
          <div style={{ height: Math.max(120, totalH), display: 'grid', placeItems: 'center', color: color.mute, fontSize: 14 }}>
            {props.emptyHint ?? '该产品在所选时间范围内无数据'}
          </div>
        )}
        {!empty && geom && (() => {
          const slot = geom.plotWidth / geom.n;
          const volMax = Math.max(1, props.volumeAxisMax);
          const volY = (v: number): number => {
            const ratio = Math.min(1, Math.max(0, v / volMax));
            return baseline - ratio * plotHeight;
          };
          // 价格轴：窗口内自适应上下限 + 10% 余量（近单值退化至少撑 2% 量级，不除零）
          const priceVals: number[] = [];
          for (const pr of props.products) {
            for (const pt of pr.points) {
              if (pt.price != null && pt.suspect !== 'quarantined') priceVals.push(pt.price);
            }
          }
          const pRawMin = priceVals.length > 0 ? Math.min(...priceVals) : 0;
          const pRawMax = priceVals.length > 0 ? Math.max(...priceVals) : 1;
          const pSpan = pRawMax - pRawMin;
          const pPad = pSpan > 1e-9 ? pSpan * 0.1 : Math.max(1, pRawMax * 0.05);
          const pLo = pRawMin - pPad;
          const pHi = pRawMax + pPad;
          const priceY = (v: number): number => PLOT_TOP + ((pHi - v) / (pHi - pLo)) * plotHeight;
          const cx = (i: number): number => geom.plotLeft + slot * (i + 0.5);
          // X 轴刻度计划：与主图同一套 axisTickPlan（step 抽稀 + 两端恒显示 + 年份第二行）
          const plan = axisTickPlan(props.granularity, props.bucketIds, Math.max(1, Math.ceil(n / 9)), n > 1 ? [0, n - 1] : [0]);

          // 销量面积：每产品按非空连续段绘制（缺采周断开，不造 0）；叠层非堆叠
          const areaNodes: ReactNode[] = [];
          props.products.forEach((pr, pi) => {
            const runs: Array<Array<[number, number]>> = [];
            let cur: Array<[number, number]> = [];
            pr.volumes.forEach((v, i) => {
              if (v != null && Number.isFinite(v)) cur.push([cx(i), volY(v)]);
              else if (cur.length > 0) {
                runs.push(cur);
                cur = [];
              }
            });
            if (cur.length > 0) runs.push(cur);
            runs.forEach((run, ri) => {
              if (run.length === 1) {
                // 单点段：只画上缘短线（不造面积、不落 0）
                areaNodes.push(
                  <line
                    key={`seam-${pi}-${ri}`}
                    x1={run[0][0] - 3} x2={run[0][0] + 3} y1={run[0][1]} y2={run[0][1]}
                    stroke={darken(pr.color, 0.25)} strokeWidth={AREA_EDGE_W} strokeLinecap="round"
                  />,
                );
                return;
              }
              const pts = run.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L');
              const last = run[run.length - 1];
              const d = `M${pts} L${last[0].toFixed(1)} ${baseline.toFixed(1)} L${run[0][0].toFixed(1)} ${baseline.toFixed(1)} Z`;
              areaNodes.push(<path key={`area-${pi}-${ri}`} d={d} fill={hexToRgba(pr.color, AREA_ALPHA)} stroke="none" />);
              areaNodes.push(
                <path key={`edge-${pi}-${ri}`} d={`M${pts}`} fill="none" stroke={darken(pr.color, 0.25)} strokeWidth={AREA_EDGE_W} strokeLinejoin="round" strokeLinecap="round" />,
              );
            });
          });
          // 价格平滑线：跳过缺采/已隔离点连续（跳点连续，不伪造数据点）
          const priceNodes: ReactNode[] = props.products.map((pr, pi) => {
            const pts: Array<[number, number]> = [];
            pr.points.forEach((pt, i) => {
              if (pt.price != null && pt.suspect !== 'quarantined') pts.push([cx(i), priceY(pt.price)]);
            });
            if (pts.length === 0) return null;
            if (pts.length === 1) {
              return <circle key={`price-${pi}`} cx={pts[0][0]} cy={pts[0][1]} r={2.5} fill={pr.color} />;
            }
            return (
              <path
                key={`price-${pi}`}
                d={smoothPath(pts)}
                fill="none"
                stroke={pr.color}
                strokeWidth={PRICE_W}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          });

          const volTicks = [
            { v: volMax, y: PLOT_TOP },
            { v: volMax / 2, y: PLOT_TOP + plotHeight / 2 },
            { v: 0, y: baseline },
          ];
          const priceTicks = priceVals.length > 0
            ? [
              { v: pHi, y: PLOT_TOP },
              { v: (pHi + pLo) / 2, y: PLOT_TOP + plotHeight / 2 },
              { v: pLo, y: baseline },
            ]
            : [];
          const hoverCx = hover != null ? cx(hover) : null;

          const onMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
            const el = event.currentTarget;
            const rect = el.getBoundingClientRect();
            const x = event.clientX - rect.left;
            if (x < 0 || x > geom.plotWidth) return;
            setHover(Math.min(geom.n - 1, Math.max(0, Math.floor(x / slot))));
          };

          return (
            <>
              <svg
                role="img"
                aria-label={ariaLabel}
                width="100%"
                height={totalH}
                style={{ display: 'block' }}
              >
                {/* 悬停列底衬（canvasSoft2，成本柱 focus 同语言）：压在面积层之下 */}
                {hover != null && (
                  <rect
                    x={geom.plotLeft + slot * hover}
                    y={PLOT_TOP}
                    width={slot}
                    height={plotHeight}
                    fill={color.canvasSoft2}
                    opacity={0.55}
                  />
                )}
                <g aria-hidden>
                  {/* 基线（销量 0 = X 轴基线）与左右轴列 */}
                  <line x1={geom.plotLeft} x2={geom.plotLeft + geom.plotWidth} y1={baseline} y2={baseline} stroke={color.hairlineStrong} strokeWidth={1} />
                  <line x1={geom.plotLeft} x2={geom.plotLeft} y1={PLOT_TOP} y2={baseline} stroke={color.hairline} strokeWidth={1} />
                  {volTicks.map((tk) => (
                    <g key={`vt-${tk.v}`}>
                      <line x1={geom.plotLeft - 4} x2={geom.plotLeft} y1={tk.y} y2={tk.y} stroke={color.hairlineStrong} strokeWidth={1} />
                      <text
                        x={geom.plotLeft - 6} y={tk.y + 3.5} textAnchor="end"
                        fill={color.mute} fontSize={10} fontFamily={font.family}
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                      >
                        {props.formatVolume(tk.v)}
                      </text>
                    </g>
                  ))}
                  <line x1={geom.plotLeft + geom.plotWidth} x2={geom.plotLeft + geom.plotWidth} y1={PLOT_TOP} y2={baseline} stroke={color.hairline} strokeWidth={1} />
                  {priceTicks.map((tk) => (
                    <g key={`pt-${tk.y}`}>
                      <line x1={geom.plotLeft + geom.plotWidth} x2={geom.plotLeft + geom.plotWidth + 4} y1={tk.y} y2={tk.y} stroke={color.hairlineStrong} strokeWidth={1} />
                      <text
                        x={geom.plotLeft + geom.plotWidth + 6} y={tk.y + 3.5}
                        fill={color.mute} fontSize={10} fontFamily={font.family}
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                      >
                        {formatPrice(Math.round(tk.v), props.currency)}
                      </text>
                    </g>
                  ))}
                  {/* X 轴日历周标签（主行恒短格式 2026W33，边界加粗；年份独立第二行） */}
                  {plan.indexes.map((i) => {
                    const edge = plan.isEdge(i);
                    const year = plan.yearText(i);
                    return (
                      <g key={`xt-${i}`}>
                        <text
                          x={cx(i)} y={baseline + 15} textAnchor="middle"
                          fill={edge ? color.body : color.mute}
                          fontWeight={edge ? 600 : 400}
                          fontSize={10}
                          fontFamily={font.family}
                          style={{ fontVariantNumeric: 'tabular-nums' }}
                        >
                          {plan.dateText(i)}
                        </text>
                        {year && (
                          <text
                            x={cx(i)} y={baseline + 27} textAnchor="middle"
                            fill={color.mute} fontSize={9.5} fontFamily={font.family}
                            style={{ fontVariantNumeric: 'tabular-nums' }}
                          >
                            {year}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </g>
                {areaNodes}
                {priceNodes}
              </svg>
              {/* 指针承接层：只接管悬停列（合并图为呈现视图，不做拖选区间） */}
              <div
                aria-hidden
                data-testid="merged-compare-pointer"
                onPointerMove={onMove}
                onPointerLeave={() => setHover(null)}
                style={{
                  position: 'absolute',
                  left: geom.plotLeft,
                  top: PLOT_TOP,
                  width: geom.plotWidth,
                  height: plotHeight,
                  zIndex: 3,
                  cursor: 'crosshair',
                }}
              />
              {/* 列读值浮层（视觉层，aria-hidden——可访问读数走页面明细卡）：每产品 价格 · 销量 */}
              {hover != null && hoverCx != null && (() => {
                const W = 208;
                const GAP = 12;
                const rightEdge = geom.plotLeft + geom.plotWidth;
                const flip = hoverCx + GAP + W > rightEdge;
                const left = flip ? Math.max(geom.plotLeft, hoverCx - GAP - W) : Math.min(rightEdge - W, hoverCx + GAP);
                return (
                  <div
                    aria-hidden
                    style={{
                      position: 'absolute',
                      left,
                      top: PLOT_TOP + 2,
                      width: W,
                      boxSizing: 'border-box',
                      zIndex: 20,
                      pointerEvents: 'none',
                      background: color.canvas,
                      border: `1px solid ${color.hairline}`,
                      borderRadius: radius.card,
                      boxShadow: shadow.l2,
                      padding: '5px 9px 6px',
                      fontFamily: font.family,
                    }}
                  >
                    <div
                      className="tnum"
                      style={{ fontSize: 12, lineHeight: '16px', fontWeight: 600, color: color.ink, marginBottom: 2, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}
                    >
                      {shortBucketLabel(props.granularity, props.bucketIds[hover])}
                    </div>
                    {props.products.map((pr) => {
                      const pt = pr.points[hover];
                      const quarantined = pt?.suspect === 'quarantined';
                      const price = pt?.price != null && !quarantined ? formatPrice(Math.round(pt.price), props.currency) : '—';
                      const vol = pr.volumes[hover];
                      return (
                        <div
                          key={pr.key}
                          style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, lineHeight: '18px', color: color.body, whiteSpace: 'nowrap', minWidth: 0 }}
                        >
                          <BrandDot brand={pr.brand} size={7} />
                          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{pr.name}</span>
                          <span className="tnum" style={{ marginLeft: 'auto', fontWeight: 600, color: color.ink, fontVariantNumeric: 'tabular-nums' }}>{price}</span>
                          <span aria-hidden style={{ width: 1, height: 10, background: color.hairline, flexShrink: 0 }} />
                          <span className="tnum" style={{ fontWeight: 600, color: color.ink, fontVariantNumeric: 'tabular-nums' }}>
                            {vol != null && Number.isFinite(vol) ? props.formatVolume(vol) : '—'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </>
          );
        })()}
      </div>
    </div>
  );
}
