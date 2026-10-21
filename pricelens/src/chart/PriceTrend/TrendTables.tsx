// ============================================================
// 「产品价差 + 核心信息明细」合并宽表（第118轮，2026-10-21 评审）：
// 两张表都改为「时间作列」的横向拖动宽表——表头 = 图上同一可见时间轴
// （每桶一列，不写周号），横向滚动两表同步变化，故共享一条表头；
// 两表之间保留一段间隔。左缘 产品/配置/类型 三列冻结（Excel 冻结窗格语义）。
// 取数与图同源（onSeriesWindow 上报的 series × buckets）：
//   产品价差 = 各产品折后价相对基准产品（图上首个自有系列，无自有则首个系列）
//     逐桶金额 + 百分比；红 = 该品更贵、蓝 = 更便宜（与图上价差徽章同语言）。
//   核心信息明细 = 每产品 4 行（RRP / 折后价 / 折扣率 / Offering）× 时间列；
//     折后价单元格悬停出快照入口（SnapshotModal，历史时点取证），最新时点附现页链接。
// ============================================================
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Button, ConfigProvider, Select } from 'antd';
import { CopyOutlined, ExportOutlined, PictureOutlined } from '@ant-design/icons';
import BrandDot from '../../components/BrandMark';
import { filterBarTheme } from '../../components/FilterBar';
import { dimProduct } from '../../data';
import type { CurrencyMode, Granularity, Series, SeriesPoint } from '../../dataModel/types';
import { color, formatPrice } from '../../theme/tokens';
import { diffPct } from './helpers';
import { dedupeSpecText, offerList } from './chartModel';
import SnapshotModal, { type SnapshotInfo } from './SnapshotModal';

export interface DetailBucket {
  id: string;
  xLabel: string; // 周=周三 MM-DD / 月=YYYYMM / 季=YYYYQn
  anchorDate: string; // ISO 日期
}

// ---- 列宽（左缘冻结三列 + 时间列） ----
const W_PROD = 236;
const W_CONF = 96;
const W_TYPE = 76;
const W_TIME = 96;
/** 自有行底色（与旧价差矩阵同语言） */
const OWN_TINT = '#f3f8ff';

/** 日期列文案：周 = MM-DD（桶 xLabel 原样，不带周号）；月 = YYYY-MM；季 = 原样 */
function bucketDateText(g: Granularity, xLabel: string): string {
  if (g === 'month' && /^\d{6}$/.test(xLabel)) return `${xLabel.slice(0, 4)}-${xLabel.slice(4)}`;
  return xLabel;
}

/** 带符号金额：+$120 / −12 345 ₽ / 0（零不带符号） */
function fmtAmount(v: number, currency: CurrencyMode): string {
  const sign = v > 0 ? '+' : v < 0 ? '−' : '';
  return sign + formatPrice(Math.abs(v), currency);
}

/** 折扣率：−12.3% / +0.5% / 0.0%（U+2212 负号，与图上折扣徽章同语言） */
function fmtPct(v: number): string {
  const pct = v * 100;
  if (Math.abs(pct) < 0.05) return '0.0%';
  return (pct < 0 ? '−' : '+') + Math.abs(pct).toFixed(1) + '%';
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

/** 从系列 key（`${modelId}__${配置去空格}`）反查型号名与展示配置 */
function specOf(s: Series): { modelName: string; romram: string } {
  const sep = s.key.indexOf('__');
  const modelId = sep >= 0 ? s.key.slice(0, sep) : s.key;
  const rom = sep >= 0 ? s.key.slice(sep + 2) : '';
  const hit = dimProduct.find((p) => p.model_id === modelId && p.romram.replace(/\s+/g, '') === rom);
  return hit ? { modelName: hit.model_name, romram: hit.romram } : { modelName: dedupeSpecText(s.label), romram: '' };
}

export default function TrendTables(props: {
  series: Series[]; // 与图上同源的系列（自有在前）
  buckets: DetailBucket[]; // 与图上同源的可见时间段（升序，与 points 下标一一对应）
  currency: CurrencyMode;
  granularity: Granularity;
}) {
  const { series, buckets, currency, granularity } = props;
  const [offKeys, setOffKeys] = useState<Set<string>>(new Set()); // 产品筛选：隐藏的 key 集
  const [copied, setCopied] = useState<'diff' | 'detail' | null>(null);
  const copiedTimer = useRef<number | null>(null);
  const [snapInfo, setSnapInfo] = useState<SnapshotInfo | null>(null);
  useEffect(() => () => { if (copiedTimer.current != null) window.clearTimeout(copiedTimer.current); }, []);

  const viewSeries = useMemo(() => series.filter((s) => !offKeys.has(s.key)), [series, offKeys]);
  // 产品名/配置拆解（series.label = 品牌 + 型号 + 配置；配置列单独展示）
  const specByKey = useMemo(() => new Map(viewSeries.map((s) => [s.key, specOf(s)])), [viewSeries]);

  // 基准产品 = 首个自有系列，无自有则首个系列；价差行 = 其余系列逐桶相对基准
  const refKey = useMemo(() => viewSeries.find((s) => s.isOwn)?.key ?? viewSeries[0]?.key ?? null, [viewSeries]);
  const diffRows = useMemo(
    () => (refKey == null ? [] : viewSeries.filter((s) => s.key !== refKey)),
    [viewSeries, refKey],
  );
  const refName = refKey != null ? dedupeSpecText(viewSeries.find((s) => s.key === refKey)!.label) : '';

  // 各系列「最新有值时点」下标（现页链接只挂该列的折后价单元格）
  const latestIdxByKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of viewSeries) {
      for (let i = buckets.length - 1; i >= 0; i--) {
        const pt = s.points[i];
        if (pt && (pt.price != null || pt.rrp != null)) {
          m.set(s.key, i);
          break;
        }
      }
    }
    return m;
  }, [viewSeries, buckets]);

  if (series.length === 0 || buckets.length === 0) return null;

  const n = buckets.length;
  const dates = buckets.map((b) => bucketDateText(granularity, b.xLabel));
  const gridCols = `${W_PROD}px ${W_CONF}px ${W_TYPE}px repeat(${n}, ${W_TIME}px)`;
  const frozenW = W_PROD + W_CONF + W_TYPE;

  /** 单元格通用样式；c = 网格列号（0 起）：时间列之间加极浅竖分隔 */
  const cell = (c: number, extra?: CSSProperties): CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    padding: '5px 8px',
    borderBottom: `1px solid ${color.hairline}`,
    borderLeft: c >= 4 ? '1px solid rgba(235, 235, 235, 0.6)' : undefined,
    ...extra,
  });
  /** 左缘冻结列定位（sticky left 随列累计；top = 表头行加纵向冻结）。
   *  gridColumn 显式指定——否则自动排布会把下一行的单元格补进区块标题行的空位 */
  const frozen = (c: 0 | 1 | 2, bg?: string, top = false): CSSProperties => ({
    position: 'sticky',
    gridColumn: String(c + 1),
    left: [0, W_PROD, W_PROD + W_CONF][c],
    ...(top ? { top: 0 } : {}),
    background: bg ?? color.canvas,
    zIndex: top ? 5 : 2,
  });

  const emptyCell = (
    <span className="tnum" style={{ fontSize: 12, color: color.hairlineStrong }}>
      —
    </span>
  );

  // ---- 复制为表格（TSV；列序与表头一致） ----
  const onCopyDiff = async (): Promise<void> => {
    const ref = viewSeries.find((s) => s.key === refKey);
    const lines = [['产品', '配置', ...dates].join('\t')];
    for (const s of diffRows) {
      const cells = buckets.map((_, i) => {
        const pa = s.points[i]?.price ?? null;
        const pb = ref?.points[i]?.price ?? null;
        if (pa == null || pb == null) return '—';
        const d = diffPct(pa, pb);
        return `${fmtAmount(pa - pb, currency)} / ${d?.text ?? '—'}`;
      });
      lines.push([dedupeSpecText(s.label), specByKey.get(s.key)?.romram ?? '', ...cells].join('\t'));
    }
    const ok = await copyText(lines.join('\n'));
    setCopied(ok ? 'diff' : null);
    if (copiedTimer.current != null) window.clearTimeout(copiedTimer.current);
    copiedTimer.current = window.setTimeout(() => setCopied(null), 1600);
  };
  const onCopyDetail = async (): Promise<void> => {
    const TYPES = ['RRP', '折后价', '折扣率', 'Offering'] as const;
    const lines = [['产品', '配置', '类型', ...dates].join('\t')];
    for (const s of viewSeries) {
      for (const ty of TYPES) {
        const cells = buckets.map((_, i) => {
          const pt: SeriesPoint | undefined = s.points[i];
          if (!pt) return '—';
          if (ty === 'RRP') return formatPrice(pt.rrp, currency);
          if (ty === '折后价') return formatPrice(pt.price, currency);
          if (ty === '折扣率') {
            return pt.price != null && pt.rrp != null && pt.rrp > 0 ? fmtPct(pt.price / pt.rrp - 1) : '—';
          }
          return (
            offerList(pt.offer)
              .map((d) => d.detail)
              .filter((t) => !!t)
              .join('；') || '—'
          );
        });
        lines.push([dedupeSpecText(s.label), specByKey.get(s.key)?.romram ?? '', ty, ...cells].join('\t'));
      }
    }
    const ok = await copyText(lines.join('\n'));
    setCopied(ok ? 'detail' : null);
    if (copiedTimer.current != null) window.clearTimeout(copiedTimer.current);
    copiedTimer.current = window.setTimeout(() => setCopied(null), 1600);
  };

  /** 产品身份单元格（产品块首行渲染，gridRow span 合并视觉）；span = 块内行数 */
  const identityCells = (s: Series, span: number, keyPrefix: string): JSX.Element[] => {
    const bg = s.isOwn ? OWN_TINT : color.canvas;
    const sp = specByKey.get(s.key);
    const name = sp ? `${s.brand} ${sp.modelName}` : dedupeSpecText(s.label);
    return [
      <div
        key={`${keyPrefix}-prod`}
        style={{
          ...cell(0),
          ...frozen(0, bg),
          gridRow: `span ${span}`,
          gap: 6,
        }}
      >
        <BrandDot brand={s.brand} />
        <span
          title={name}
          style={{ fontSize: 12, fontWeight: 600, color: color.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {name}
        </span>
      </div>,
      <div
        key={`${keyPrefix}-conf`}
        className="tnum"
        style={{
          ...cell(1),
          ...frozen(1, bg),
          gridRow: `span ${span}`,
          fontSize: 11.5,
          color: color.body,
          whiteSpace: 'nowrap',
        }}
      >
        {specByKey.get(s.key)?.romram ?? '—'}
      </div>,
    ];
  };

  /** 类型列小字（冻结区第三列） */
  const typeCell = (text: string, own: boolean, rowKey: string) => (
    <div
      key={rowKey}
      style={{
        ...cell(2),
        ...frozen(2, own ? OWN_TINT : color.canvas),
        justifyContent: 'flex-end',
        fontSize: 11,
        color: color.mute,
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </div>
  );

  /** 区块标题行：整行占位（阻断自动排布补位），内容盒钉在左缘、横向滚动始终可见 */
  const captionRow = (title: string, hint: string, key: string) => (
    <div
      key={key}
      style={{
        gridColumn: '1 / -1',
        width: 'max-content',
        position: 'sticky',
        left: 0,
        zIndex: 3,
        display: 'flex',
        alignItems: 'baseline',
        gap: 10,
        padding: '6px 8px',
        background: color.canvas,
        borderBottom: `1px solid ${color.hairlineStrong}`,
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 600, color: color.ink, whiteSpace: 'nowrap' }}>{title}</span>
      <span style={{ fontSize: 11, color: color.mute, whiteSpace: 'nowrap' }}>{hint}</span>
    </div>
  );

  return (
    <div>
      {/* 工具行：产品筛选（默认全开）+ 两表复制 + 口径说明 */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{ fontSize: 12, color: color.mute, whiteSpace: 'nowrap' }}>产品</span>
          <ConfigProvider theme={filterBarTheme}>
            <Select
              mode="multiple"
              size="small"
              maxTagCount="responsive"
              showSearch
              optionFilterProp="label"
              aria-label="产品筛选"
              placeholder="未选择产品"
              value={viewSeries.map((s) => s.key)}
              options={series.map((s) => ({ value: s.key, label: dedupeSpecText(s.label) }))}
              optionRender={(option) => (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <BrandDot brand={series.find((s) => s.key === String(option.value))?.brand ?? ''} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{option.label}</span>
                </span>
              )}
              onChange={(vals: string[]) => setOffKeys(new Set(series.filter((s) => !vals.includes(s.key)).map((s) => s.key)))}
              style={{ minWidth: 200, maxWidth: 420 }}
            />
          </ConfigProvider>
        </span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: color.mute, whiteSpace: 'nowrap' }}>时间范围与上方图表一致</span>
          {diffRows.length > 0 && (
            <Button size="small" icon={<CopyOutlined />} onClick={onCopyDiff}>
              {copied === 'diff' ? '已复制' : '复制价差'}
            </Button>
          )}
          <Button size="small" icon={<CopyOutlined />} onClick={onCopyDetail}>
            {copied === 'detail' ? '已复制' : '复制明细'}
          </Button>
        </span>
      </div>

      {/* 共享表头的横向滚动区：表头（时间列）+ 产品价差 + 间隔 + 核心信息明细 */}
      <div style={{ maxHeight: 560, overflow: 'auto', paddingRight: 2 }}>
        <div style={{ display: 'grid', gridTemplateColumns: gridCols, minWidth: frozenW + n * W_TIME, alignItems: 'stretch' }}>
          {/* 表头：左三列行列双向冻结，时间列随横向滚动 */}
          {(['产品', '配置', '类型'] as const).map((t, c) => (
            <div
              key={`h-${t}`}
              style={{
                ...cell(c),
                ...frozen(c as 0 | 1 | 2, color.canvas, true),
                borderTop: `1px solid ${color.hairline}`,
                borderBottom: `1px solid ${color.hairlineStrong}`,
                justifyContent: c === 2 ? 'flex-end' : 'flex-start',
                fontSize: 11,
                color: color.mute,
              }}
            >
              {t}
            </div>
          ))}
          {dates.map((d, i) => (
            <div
              key={buckets[i].id}
              className="tnum"
              style={{
                ...cell(3 + i),
                position: 'sticky',
                top: 0,
                zIndex: 4,
                background: color.canvas,
                borderTop: `1px solid ${color.hairline}`,
                borderBottom: `1px solid ${color.hairlineStrong}`,
                justifyContent: 'center',
                fontSize: 11,
                color: color.body,
                whiteSpace: 'nowrap',
              }}
            >
              {d}
            </div>
          ))}

          {/* —— 产品价差（≥2 个系列才有意义；基准产品行不列）—— */}
          {diffRows.length > 0 && refKey != null && (
            <>
              {captionRow(
                '产品价差',
                `各产品折后价相对基准「${refName}」；红 = 该品更贵，蓝 = 更便宜`,
                'cap-diff',
              )}
              {diffRows.map((s) => {
                const ref = viewSeries.find((v) => v.key === refKey)!;
                return (
                  <div key={`d-${s.key}`} style={{ display: 'contents' }}>
                    {identityCells(s, 1, `d-${s.key}`)}
                    {typeCell('价差', s.isOwn, `d-${s.key}-t`)}
                    {buckets.map((b, i) => {
                      const pa = s.points[i]?.price ?? null;
                      const pb = ref.points[i]?.price ?? null;
                      const d = pa != null && pb != null ? diffPct(pa, pb) : null;
                      const tone = !d || d.text.startsWith('±') ? color.body : d.tone === 'rich' ? color.error : color.link;
                      return (
                        <div
                          key={`d-${s.key}-${b.id}`}
                          style={{
                            ...cell(3 + i),
                            flexDirection: 'column',
                            alignItems: 'flex-end',
                            justifyContent: 'center',
                            gap: 0,
                            background: s.isOwn ? OWN_TINT : undefined,
                          }}
                        >
                          {d == null || pa == null || pb == null ? (
                            emptyCell
                          ) : (
                            <>
                              <span className="tnum" style={{ fontSize: 12.5, fontWeight: 600, color: tone, whiteSpace: 'nowrap' }}>
                                {fmtAmount(pa - pb, currency)}
                              </span>
                              <span className="tnum" style={{ fontSize: 10.5, color: tone, whiteSpace: 'nowrap' }}>
                                {d.text}
                              </span>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </>
          )}

          {/* 两表之间的间隔 */}
          <div style={{ gridColumn: '1 / -1', height: 18, background: color.canvas }} />

          {/* —— 核心信息明细：每产品 4 行（RRP / 折后价 / 折扣率 / Offering）× 时间列 —— */}
          {captionRow('核心信息明细', '每产品四行取价快照；折后价列悬停可查页面快照', 'cap-detail')}
          {viewSeries.map((s) => {
            const latestIdx = latestIdxByKey.get(s.key) ?? -1;
            const rows: JSX.Element[] = [];
            const identity = identityCells(s, 4, `t-${s.key}`);
            rows.push(identity[0], identity[1]);
            const openSnap = (i: number): void => {
              const pt = s.points[i];
              setSnapInfo({
                seriesLabel: dedupeSpecText(s.label),
                shopName: pt?.shopName ?? null,
                bucketId: pt?.bucketId ?? buckets[i].id,
                dateText: bucketDateText(granularity, pt?.xLabel || buckets[i].xLabel),
                priceText: formatPrice(pt?.price ?? null, currency),
                url: pt?.url ?? '',
              });
            };
            // RRP 行
            rows.push(typeCell('RRP', s.isOwn, `t-${s.key}-rrp`));
            for (let i = 0; i < n; i++) {
              const pt = s.points[i];
              rows.push(
                <div key={`t-${s.key}-rrp-${i}`} style={{ ...cell(3 + i), justifyContent: 'flex-end', background: s.isOwn ? OWN_TINT : undefined }}>
                  {pt?.rrp != null ? (
                    <span className="tnum" title="RRP（官方建议零售价）" style={{ fontSize: 12, color: color.body, whiteSpace: 'nowrap' }}>
                      {formatPrice(pt.rrp, currency)}
                    </span>
                  ) : (
                    emptyCell
                  )}
                </div>,
              );
            }
            // 折后价行（单元格悬停出快照入口；最新时点附现页链接）
            rows.push(typeCell('折后价', s.isOwn, `t-${s.key}-price`));
            for (let i = 0; i < n; i++) {
              const pt = s.points[i];
              const hasSnap = !!pt?.url;
              rows.push(
                <div
                  key={`t-${s.key}-price-${i}`}
                  className={hasSnap ? 'tt-snap has-snap' : 'tt-snap'}
                  title={hasSnap ? '点击查看该时点的电商页面快照' : undefined}
                  role={hasSnap ? 'button' : undefined}
                  tabIndex={hasSnap ? 0 : undefined}
                  onClick={hasSnap ? () => openSnap(i) : undefined}
                  onKeyDown={
                    hasSnap
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            openSnap(i);
                          }
                        }
                      : undefined
                  }
                  style={{
                    ...cell(3 + i),
                    justifyContent: 'flex-end',
                    gap: 4,
                    background: s.isOwn ? OWN_TINT : undefined,
                    cursor: hasSnap ? 'pointer' : 'default',
                  }}
                >
                  {pt?.price != null ? (
                    <>
                      <span className="tnum" style={{ fontSize: 12.5, fontWeight: 600, color: color.ink, whiteSpace: 'nowrap' }}>
                        {formatPrice(pt.price, currency)}
                      </span>
                      {hasSnap && (
                        <span className="tt-snap-ico" style={{ display: 'inline-flex', color: color.link }}>
                          <PictureOutlined style={{ fontSize: 11 }} />
                        </span>
                      )}
                      {i === latestIdx && pt.url && (
                        <a
                          href={pt.url}
                          target="_blank"
                          rel="noreferrer"
                          title="打开商城现页（新窗口）"
                          onClick={(e) => e.stopPropagation()}
                          style={{ display: 'inline-flex', color: color.link }}
                        >
                          <ExportOutlined style={{ fontSize: 11 }} />
                        </a>
                      )}
                    </>
                  ) : (
                    emptyCell
                  )}
                </div>,
              );
            }
            // 折扣率行
            rows.push(typeCell('折扣率', s.isOwn, `t-${s.key}-disc`));
            for (let i = 0; i < n; i++) {
              const pt = s.points[i];
              const disc = pt?.price != null && pt?.rrp != null && pt.rrp > 0 ? pt.price / pt.rrp - 1 : null;
              rows.push(
                <div key={`t-${s.key}-disc-${i}`} style={{ ...cell(3 + i), justifyContent: 'flex-end', background: s.isOwn ? OWN_TINT : undefined }}>
                  {disc != null ? (
                    <span className="tnum" style={{ fontSize: 12, color: disc <= -0.15 ? '#b45309' : color.body, whiteSpace: 'nowrap' }}>
                      {fmtPct(disc)}
                    </span>
                  ) : (
                    emptyCell
                  )}
                </div>,
              );
            }
            // Offering 行（三行截断 + 悬停全文）
            rows.push(typeCell('Offering', s.isOwn, `t-${s.key}-offer`));
            for (let i = 0; i < n; i++) {
              const pt = s.points[i];
              const text = pt
                ? offerList(pt.offer)
                    .map((d) => d.detail)
                    .filter((t) => !!t)
                    .join('；')
                : '';
              rows.push(
                <div key={`t-${s.key}-offer-${i}`} style={{ ...cell(3 + i), background: s.isOwn ? OWN_TINT : undefined }}>
                  {text ? (
                    <span
                      title={text}
                      style={{
                        display: '-webkit-box',
                        WebkitBoxOrient: 'vertical' as const,
                        WebkitLineClamp: 3,
                        overflow: 'hidden',
                        wordBreak: 'break-word',
                        fontSize: 10.5,
                        lineHeight: '13px',
                        color: color.body,
                      }}
                    >
                      {text}
                    </span>
                  ) : (
                    emptyCell
                  )}
                </div>,
              );
            }
            return (
              <div key={`t-${s.key}`} style={{ display: 'contents' }}>
                {rows}
              </div>
            );
          })}
        </div>
      </div>
      {/* 页面快照浮窗（居中小弹框） */}
      <SnapshotModal info={snapInfo} onClose={() => setSnapInfo(null)} />
      {/* 快照入口悬停显隐（内联样式无 :hover，工具类集中在此） */}
      <style>{`
        .tt-snap .tt-snap-ico { opacity: 0; }
        .tt-snap.has-snap:hover .tt-snap-ico { opacity: 1; }
      `}</style>
    </div>
  );
}
