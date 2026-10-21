// ============================================================
// 「竞品价差」卡（第112轮，2026-10-21）：价格看板图卡与核心信息明细之间。
// 取数与图同源（onSeriesWindow 上报的 series × buckets）：时点 = 可见时间段内
// 最后一个有折后价的桶；矩阵 = 行产品相对列产品（红 = 行更贵 / 蓝 = 行更便宜），
// 点格切换下方「价差走势」（方形阶梯，缺采桶断开不连）。
// 第一百一十三轮（2026-10-21 评审）：价差走势的对改为走势标题行两个下拉直接选
// 行/列产品（互相排除对方当前项，防止选到自己），与矩阵点格双向同步。
// ============================================================
import { useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { Button, ConfigProvider, Select } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import BrandDot from '../../components/BrandMark';
import { filterBarTheme } from '../../components/FilterBar';
import type { CurrencyMode, Granularity, Series } from '../../dataModel/types';
import { color, formatPrice, motion, radius, selectAccent, selectSoft } from '../../theme/tokens';
import { curveNameOf, dedupeSpecText } from './chartModel';
import { buildDiffMatrix, buildPairTrend, latestIdxWithPrice, type PairTrend } from './diffModel';

export interface DiffBucket {
  id: string;
  xLabel: string; // 周=周三 MM-DD / 月=YYYYMM / 季=YYYYQn
  anchorDate: string; // ISO 日期
}

/** 日期文案：周 = MM-DD（桶 xLabel 原样）；月 = YYYY-MM；季 = 原样 */
function bucketDateText(g: Granularity, xLabel: string): string {
  if (g === 'month' && /^\d{6}$/.test(xLabel)) return `${xLabel.slice(0, 4)}-${xLabel.slice(4)}`;
  return xLabel;
}

/** TSV 进剪贴板：clipboard API 优先，失败回退隐藏 textarea + execCommand */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

/** 容器实宽（价差走势随卡片宽度自适应） */
function useContainerWidth(): [MutableRefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setW(e.contentRect.width);
    });
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** 带符号金额：+$120 / −12 345 ₽ / 0（零不带符号） */
function fmtAmount(v: number, currency: CurrencyMode): string {
  const sign = v > 0 ? '+' : v < 0 ? '−' : '';
  return sign + formatPrice(Math.abs(v), currency);
}

/** 走势百分比：+12.3% / −5.0% / 0.0%（U+2212 负号，与图上价差徽章同语言） */
function fmtTrendPct(v: number): string {
  const sign = v > 0 ? '+' : v < 0 ? '−' : '';
  return sign + Math.abs(v).toFixed(1) + '%';
}

/** 正 = 行更贵（红）/ 负 = 行更便宜（蓝）/ 平 = 中性 */
const toneColor = (tone: 'rich' | 'cheap' | 'flat'): string =>
  tone === 'rich' ? color.error : tone === 'cheap' ? color.link : color.body;

const OWN_TINT = '#f3f8ff'; // 我司行/列底色（与明细卡区块头同语言）

/** 价差走势图：方形阶梯线（step end），缺采桶断开；正段红、负段蓝、0 线虚线 */
function PairTrendChart(props: {
  trend: PairTrend;
  granularity: Granularity;
  xLabels: string[]; // 与 trend.pct 同长同序的桶日期文案原料
}) {
  const { trend, granularity, xLabels } = props;
  const [boxRef, w] = useContainerWidth();
  const H = 72;
  const padL = 2;
  const padR = 2;
  const padT = 4;
  const plotH = 42;
  const n = trend.pct.length;
  if (w < 40 || n === 0) return <div ref={boxRef} style={{ width: '100%', height: H }} />;
  const vals = trend.pct.filter((v): v is number => v != null);
  let lo = Math.min(0, ...vals);
  let hi = Math.max(0, ...vals);
  if (hi - lo < 1e-9) {
    hi += 0.5;
    lo -= 0.5;
  }
  const x = (i: number): number => padL + (n > 1 ? (i / (n - 1)) * (w - padL - padR) : 0);
  const y = (v: number): number => padT + plotH - ((v - lo) / (hi - lo)) * plotH;
  const segColor = (v: number): string => (v > 0 ? color.error : v < 0 ? color.link : color.body);
  const segs: { x1: number; y1: number; x2: number; y2: number; c: string }[] = [];
  for (let i = 0; i + 1 < n; i++) {
    const v0 = trend.pct[i];
    const v1 = trend.pct[i + 1];
    if (v0 == null || v1 == null) continue; // 缺采桶断开不连
    segs.push({ x1: x(i), y1: y(v0), x2: x(i + 1), y2: y(v0), c: segColor(v0) }); // 桶内水平
    segs.push({ x1: x(i + 1), y1: y(v0), x2: x(i + 1), y2: y(v1), c: segColor(v1) }); // 跳变竖线
  }
  // 孤立有值桶（左右都断）画点，避免单桶无形状
  const dots = trend.pct
    .map((v, i) => {
      const lone = v != null && (i === 0 || trend.pct[i - 1] == null) && (i === n - 1 || trend.pct[i + 1] == null);
      return lone ? { cx: x(i), cy: y(v), c: segColor(v) } : null;
    })
    .filter((d): d is { cx: number; cy: number; c: string } => d != null);
  return (
    <div ref={boxRef} style={{ width: '100%', height: H }}>
      <svg width={w} height={H} role="img">
        <line x1={padL} y1={y(0)} x2={w - padR} y2={y(0)} stroke={color.hairlineStrong} strokeDasharray="3 3" />
        {segs.map((s, i) => (
          <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={s.c} strokeWidth={1.5} strokeLinecap="round" />
        ))}
        {dots.map((d, i) => (
          <circle key={i} cx={d.cx} cy={d.cy} r={2.2} fill={d.c} />
        ))}
        {xLabels.length > 0 && (
          <text x={x(0)} y={H - 2} fontSize={9} fill={color.mute} textAnchor="start" className="tnum">
            {bucketDateText(granularity, xLabels[0])}
          </text>
        )}
        {xLabels.length > 1 && (
          <text x={x(xLabels.length - 1)} y={H - 2} fontSize={9} fill={color.mute} textAnchor="end" className="tnum">
            {bucketDateText(granularity, xLabels[xLabels.length - 1])}
          </text>
        )}
      </svg>
    </div>
  );
}

export default function DiffPanel(props: {
  series: Series[]; // 与图上同源的系列（我司在前）
  buckets: DiffBucket[]; // 与图上同源的可见时间段（升序，与 points 下标一一对应）
  currency: CurrencyMode;
  granularity: Granularity;
}) {
  const { series, buckets, currency, granularity } = props;
  const [selKeys, setSelKeys] = useState<[string, string] | null>(null); // 点格选中的行/列系列 key
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<number | null>(null);
  useEffect(() => () => { if (copiedTimer.current != null) window.clearTimeout(copiedTimer.current); }, []);

  const idx = useMemo(() => latestIdxWithPrice(series, buckets.length), [series, buckets.length]);
  const matrix = useMemo(() => (idx == null ? [] : buildDiffMatrix(series, idx)), [series, idx]);
  const names = useMemo(() => series.map((s) => dedupeSpecText(curveNameOf(s))), [series]);

  if (series.length < 2 || buckets.length === 0 || idx == null) return null;

  // 默认选中：前两个竞品；不足两个竞品 → 首竞品 对 首我司；再不足 → 前两个系列
  const compIdx = series.map((s, i) => (s.isOwn ? -1 : i)).filter((i) => i >= 0);
  const ownIdx = series.map((s, i) => (s.isOwn ? i : -1)).filter((i) => i >= 0);
  let defRow = 0;
  let defCol = 1;
  if (compIdx.length >= 2) {
    defRow = compIdx[0];
    defCol = compIdx[1];
  } else if (compIdx.length === 1 && ownIdx.length >= 1) {
    defRow = compIdx[0];
    defCol = ownIdx[0];
  }
  const selRow = selKeys ? series.findIndex((s) => s.key === selKeys[0]) : -1;
  const selCol = selKeys ? series.findIndex((s) => s.key === selKeys[1]) : -1;
  const pair: [number, number] =
    selRow >= 0 && selCol >= 0 && selRow !== selCol ? [selRow, selCol] : [defRow, defCol];
  const trend = buildPairTrend(series[pair[0]], series[pair[1]]);

  const asOfText = bucketDateText(granularity, buckets[idx].xLabel);

  // ---- 走势对下拉（第一百一十三轮，评审）：行/列产品直接选，与矩阵点格双向同步 ----
  const brandByKey = new Map(series.map((s) => [s.key, s.brand]));
  /** 下拉选项 = 全部系列；disabledKey = 对方当前选中项（防止选到自己） */
  const pairOptionsOf = (disabledKey: string) =>
    series.map((s, i) => ({ value: s.key, label: names[i], disabled: s.key === disabledKey }));
  const renderPairOption = (option: { value?: string | number | null; label?: ReactNode }): JSX.Element => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
      <BrandDot brand={brandByKey.get(String(option.value)) ?? ''} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{option.label}</span>
    </span>
  );

  const onCopy = async (): Promise<void> => {
    const lines = [['产品', ...names].join('\t')];
    for (let r = 0; r < series.length; r++) {
      const cells = series.map((_, c) => {
        const cell = matrix[r][c];
        return cell.amount != null && cell.pct != null ? `${fmtAmount(cell.amount, currency)} / ${cell.pct.text}` : '—';
      });
      lines.push([names[r], ...cells].join('\t'));
    }
    const ok = await copyText(lines.join('\n'));
    setCopied(ok);
    if (copiedTimer.current != null) window.clearTimeout(copiedTimer.current);
    copiedTimer.current = window.setTimeout(() => setCopied(false), 1600);
  };

  const stat = (label: string, v: number | null): JSX.Element => (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5, whiteSpace: 'nowrap' }}>
      <span style={{ fontSize: 11, color: color.mute }}>{label}</span>
      <span className="tnum" style={{ fontSize: 13, fontWeight: 600, color: v != null ? (v > 0 ? color.error : v < 0 ? color.link : color.body) : color.hairlineStrong }}>
        {v != null ? fmtTrendPct(v) : '—'}
      </span>
    </span>
  );

  const n = series.length;
  return (
    <div>
      {/* 工具行：标题 + 时点 + 口径说明 + 复制为表格 */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: color.ink }}>竞品价差</span>
        <span className="tnum" style={{ fontSize: 12, color: color.body, whiteSpace: 'nowrap' }}>
          时点 {asOfText}
        </span>
        <span style={{ fontSize: 11, color: color.mute }}>行产品相对列产品；红 = 行更贵，蓝 = 行更便宜</span>
        <span style={{ marginLeft: 'auto' }}>
          <Button size="small" icon={<CopyOutlined />} onClick={onCopy}>
            {copied ? '已复制' : '复制为表格'}
          </Button>
        </span>
      </div>
      {/* 价差矩阵：行/列 = 图上系列序（我司在前）；我司行/列浅蓝底；点格切换走势对 */}
      <div style={{ overflowX: 'auto' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `minmax(150px, 1.1fr) repeat(${n}, minmax(112px, 1fr))`,
            minWidth: 150 + n * 112,
          }}
        >
          {/* 列头 */}
          <div style={{ borderBottom: `1px solid ${color.hairlineStrong}`, borderRight: `1px solid ${color.hairline}` }} />
          {series.map((s, c) => (
            <div
              key={s.key}
              title={names[c]}
              style={{
                padding: '6px 8px',
                borderBottom: `1px solid ${color.hairlineStrong}`,
                background: s.isOwn ? OWN_TINT : undefined,
                fontSize: 11,
                lineHeight: '15px',
                color: color.body,
                textAlign: 'center',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {names[c]}
            </div>
          ))}
          {/* 数据行 */}
          {series.map((s, r) => (
            <div key={s.key} style={{ display: 'contents' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 8px',
                  background: s.isOwn ? OWN_TINT : undefined,
                  borderRight: `1px solid ${color.hairline}`,
                  borderBottom: r < n - 1 ? `1px solid ${color.hairline}` : undefined,
                }}
              >
                <BrandDot brand={s.brand} />
                <span
                  title={names[r]}
                  style={{ fontSize: 12, color: color.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                >
                  {names[r]}
                </span>
                {s.isOwn && (
                  <span style={{ fontSize: 10.5, fontWeight: 600, color: '#0053c2', background: '#e8f1ff', borderRadius: radius.pill, padding: '0 7px', lineHeight: '16px', flexShrink: 0 }}>
                    我司
                  </span>
                )}
              </div>
              {series.map((sc, c) => {
                const cell = matrix[r][c];
                const selected = pair[0] === r && pair[1] === c;
                const ownAxis = s.isOwn || sc.isOwn;
                const empty = cell.amount == null || cell.pct == null;
                return (
                  <div
                    key={sc.key}
                    role={empty ? undefined : 'button'}
                    aria-pressed={empty ? undefined : selected}
                    title={empty ? undefined : `${names[r]} 对 ${names[c]}`}
                    onClick={empty ? undefined : () => setSelKeys([s.key, sc.key])}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 1,
                      padding: '5px 8px',
                      borderBottom: r < n - 1 ? `1px solid ${color.hairline}` : undefined,
                      background: selected ? selectSoft : ownAxis ? OWN_TINT : undefined,
                      border: `1px solid ${selected ? selectAccent : 'transparent'}`,
                      borderRadius: radius.control,
                      cursor: empty ? 'default' : 'pointer',
                      userSelect: 'none',
                      transition: `background ${motion.fast}ms ease, border-color ${motion.fast}ms ease`,
                    }}
                  >
                    {empty ? (
                      <span style={{ fontSize: 12, color: color.hairlineStrong }}>—</span>
                    ) : (
                      <>
                        <span className="tnum" style={{ fontSize: 13, fontWeight: 600, color: toneColor(cell.pct!.tone), whiteSpace: 'nowrap' }}>
                          {fmtAmount(cell.amount!, currency)}
                        </span>
                        <span className="tnum" style={{ fontSize: 11, color: toneColor(cell.pct!.tone), whiteSpace: 'nowrap' }}>
                          {cell.pct!.text}
                        </span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      {/* 价差走势：选中对逐桶百分比（方形阶梯，缺采断开）+ 最新/最低/最高；
          对切换 = 行/列两个下拉（与上方矩阵点格双向同步，第一百一十三轮，评审） */}
      <div style={{ marginTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 4 }}>
          <ConfigProvider theme={filterBarTheme}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Select
                size="small"
                showSearch
                optionFilterProp="label"
                aria-label="行产品"
                value={series[pair[0]].key}
                options={pairOptionsOf(series[pair[1]].key)}
                optionRender={(option) => renderPairOption(option)}
                onChange={(key: string) => setSelKeys([key, series[pair[1]].key])}
                popupMatchSelectWidth={false}
                style={{ minWidth: 150, maxWidth: 240 }}
              />
              <span style={{ fontSize: 12, color: color.mute, whiteSpace: 'nowrap' }}>对</span>
              <Select
                size="small"
                showSearch
                optionFilterProp="label"
                aria-label="列产品"
                value={series[pair[1]].key}
                options={pairOptionsOf(series[pair[0]].key)}
                optionRender={(option) => renderPairOption(option)}
                onChange={(key: string) => setSelKeys([series[pair[0]].key, key])}
                popupMatchSelectWidth={false}
                style={{ minWidth: 150, maxWidth: 240 }}
              />
            </span>
          </ConfigProvider>
          <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 18 }}>
            {stat('最新', trend.latest)}
            {stat('最低', trend.min)}
            {stat('最高', trend.max)}
          </span>
        </div>
        <PairTrendChart trend={trend} granularity={granularity} xLabels={buckets.map((b) => b.xLabel)} />
      </div>
    </div>
  );
}
