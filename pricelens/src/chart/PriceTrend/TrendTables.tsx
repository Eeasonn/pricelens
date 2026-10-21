// ============================================================
// 「价差与明细」宽表（第118轮立，第一百二十三轮按主分析组重排）：
// 按主分析组（= 选择产品浮窗里的一张卡，从上到下保持其排列）分块，每块 =
// 组头（主分析产品显性标出）→ 列头（产品/配置/类型 + 图上同一可见时间轴，
// 每桶一列，不带周号）→ 产品价差（本组各对比产品折后价相对主分析产品的
// 百分比；红 = 更贵、蓝 = 更便宜，与图上价差徽章同语言）→ 核心信息明细
//（每产品 5 行：RRP / 折后价 / 折扣率 / 取证 / Offering × 时间列）。
// 行底色按角色着色（第一百二十三轮）：主分析产品行衬浅蓝、对比产品行白底。
// 整体一张网格：各组横向滚动同步、左缘 产品/配置/类型 三列冻结（Excel
// 冻结窗格语义）；高度随内容伸展，只横向滚动、不出纵向滚动条。
// 取证行 = 该时点电商页面快照入口（SnapshotModal）+ 最新时点商城现页链接。
// 取数与图同源（onSeriesWindow 按卡上报的组 × 桶）；纯计算在 tableModel。
// ============================================================
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Button, ConfigProvider, Select } from 'antd';
import { CopyOutlined, ExportOutlined, PictureOutlined } from '@ant-design/icons';
import BrandDot from '../../components/BrandMark';
import { filterBarTheme } from '../../components/FilterBar';
import { dimProduct } from '../../data';
import type { CurrencyMode, Granularity, Series } from '../../dataModel/types';
import { color, fontSize, formatPrice, radius } from '../../theme/tokens';
import { EMPTY_MAIN_LABEL } from '../../state/mainSelection';
import { diffPct } from './helpers';
import { dedupeSpecText } from './chartModel';
import {
  baseKeyOf,
  bucketDateText,
  discountOf,
  fmtPct,
  groupOrdinal,
  latestIdxOf,
  offerText,
  type DetailBucket,
  type TableGroup,
} from './tableModel';
import SnapshotModal, { type SnapshotInfo } from './SnapshotModal';

export type { DetailBucket, TableGroup } from './tableModel';

// ---- 列宽（左缘冻结三列 + 时间列） ----
const W_PROD = 236;
const W_CONF = 96;
const W_TYPE = 76;
const W_TIME = 100;
/** 主分析产品行底色（浅蓝；第一百二十三轮按角色着色——主品行衬浅蓝、对比行白底，
 *  与图例带主品药丸同语言，不再按品牌归属着色） */
const MAIN_TINT = '#f3f8ff';
/** 明细每产品行数（RRP / 折后价 / 折扣率 / 取证 / Offering） */
const DETAIL_SPAN = 5;

/** 取证行小件样式：图标 + 文字，链接色（button / a 共用） */
const EVID_STYLE: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 3,
  fontSize: 11,
  color: color.link,
  background: 'none',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  fontFamily: 'inherit',
  lineHeight: '16px',
  textDecoration: 'none',
};

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

interface Spec {
  modelName: string;
  romram: string;
}

/** 从系列 key（`${modelId}__${配置去空格}`）反查型号名与展示配置 */
function specOfKey(key: string, label: string): Spec {
  const sep = key.indexOf('__');
  const modelId = sep >= 0 ? key.slice(0, sep) : key;
  const rom = sep >= 0 ? key.slice(sep + 2) : '';
  const hit = dimProduct.find((p) => p.model_id === modelId && p.romram.replace(/\s+/g, '') === rom);
  return hit ? { modelName: hit.model_name, romram: hit.romram } : { modelName: dedupeSpecText(label), romram: '' };
}

/** 一个分块的派生数据：基准（主分析产品）、价差行、名称拆解 */
interface Block {
  g: TableGroup;
  ordinal: number; // 组序号 = 选择浮窗卡序（筛掉其他组不改编号）
  base: Series | null; // 价差基准 = 本组主分析产品；无主品/主品无数据为 null
  diffRows: Series[]; // 对比产品（主品行不列）
  specByKey: Map<string, Spec>;
}

/** 组的展示名（组筛选下拉 / 复制表头）：主品 品牌+型号+配置；空对用「对比产品」 */
function blockTitle(b: Block): string {
  if (b.base) {
    const sp = b.specByKey.get(b.base.key);
    return sp ? `${b.base.brand} ${sp.modelName} ${sp.romram}`.trim() : dedupeSpecText(b.base.label);
  }
  return b.g.mainKey == null ? '对比产品' : '主分析产品无数据';
}

export default function TrendTables(props: {
  groups: TableGroup[]; // 按选择浮窗卡序上报的组（主品在前 + 本卡对比区）
  buckets: DetailBucket[]; // 与图上同源的可见时间段（升序，与 points 下标一一对应）
  currency: CurrencyMode;
  granularity: Granularity;
}) {
  const { groups, buckets, currency, granularity } = props;
  const [offGroups, setOffGroups] = useState<Set<string>>(new Set()); // 组筛选：隐藏的卡 id 集
  const [copied, setCopied] = useState<'diff' | 'detail' | null>(null);
  const copiedTimer = useRef<number | null>(null);
  const [snapInfo, setSnapInfo] = useState<SnapshotInfo | null>(null);
  useEffect(() => () => { if (copiedTimer.current != null) window.clearTimeout(copiedTimer.current); }, []);

  const blocks = useMemo<Block[]>(
    () =>
      groups.map((g, i) => {
        const baseKey = baseKeyOf(g);
        const base = baseKey != null ? g.series.find((s) => s.key === baseKey) ?? null : null;
        return {
          g,
          ordinal: i + 1,
          base,
          diffRows: base ? g.series.filter((s) => s.key !== base.key) : [],
          specByKey: new Map(g.series.map((s) => [s.key, specOfKey(s.key, s.label)])),
        };
      }),
    [groups],
  );
  const multi = groups.length >= 2;
  const viewBlocks = useMemo(
    () => blocks.filter((b) => !offGroups.has(b.g.id) && b.g.series.length > 0),
    [blocks, offGroups],
  );
  const dates = useMemo(() => buckets.map((b) => bucketDateText(granularity, b.xLabel)), [buckets, granularity]);

  const markCopied = (which: 'diff' | 'detail' | null): void => {
    setCopied(which);
    if (copiedTimer.current != null) window.clearTimeout(copiedTimer.current);
    if (which != null) copiedTimer.current = window.setTimeout(() => setCopied(null), 1600);
  };

  // ---- 复制为表格（TSV；列序与表头一致；多组时首列带组号） ----
  const onCopyDiff = async (): Promise<void> => {
    const lines = [[...(multi ? ['组'] : []), '主分析产品', '产品', '配置', ...dates].join('\t')];
    for (const b of viewBlocks) {
      if (!b.base) continue;
      const base = b.base;
      for (const s of b.diffRows) {
        const cells = buckets.map((_, i) => {
          const pa = s.points[i]?.price ?? null;
          const pb = base.points[i]?.price ?? null;
          return pa != null && pb != null ? diffPct(pa, pb)?.text ?? '—' : '—';
        });
        lines.push(
          [...(multi ? [groupOrdinal(b.ordinal)] : []), blockTitle(b), dedupeSpecText(s.label), b.specByKey.get(s.key)?.romram ?? '', ...cells].join('\t'),
        );
      }
    }
    markCopied((await copyText(lines.join('\n'))) ? 'diff' : null);
  };
  const onCopyDetail = async (): Promise<void> => {
    const TYPES = ['RRP', '折后价', '折扣率', '取证', '权益'] as const;
    const lines = [[...(multi ? ['组'] : []), '产品', '配置', '类型', ...dates].join('\t')];
    for (const b of viewBlocks) {
      for (const s of b.g.series) {
        for (const ty of TYPES) {
          const cells = buckets.map((_, i) => {
            const pt = s.points[i];
            if (!pt) return '—';
            if (ty === 'RRP') return formatPrice(pt.rrp, currency);
            if (ty === '折后价') return formatPrice(pt.price, currency);
            if (ty === '折扣率') {
              const disc = discountOf(pt);
              return disc != null ? fmtPct(disc) : '—';
            }
            if (ty === '取证') return pt.url || '—';
            return offerText(pt) || '—';
          });
          lines.push([...(multi ? [groupOrdinal(b.ordinal)] : []), dedupeSpecText(s.label), b.specByKey.get(s.key)?.romram ?? '', ty, ...cells].join('\t'));
        }
      }
    }
    markCopied((await copyText(lines.join('\n'))) ? 'detail' : null);
  };

  if (groups.length === 0 || buckets.length === 0) return null;

  const n = buckets.length;
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
  /** 左缘冻结列定位（sticky left 随列累计）。
   *  gridColumn 显式指定——否则自动排布会把下一行的单元格补进整行区块的空位 */
  const frozen = (c: 0 | 1 | 2, bg?: string): CSSProperties => ({
    position: 'sticky',
    gridColumn: String(c + 1),
    left: [0, W_PROD, W_PROD + W_CONF][c],
    background: bg ?? color.canvas,
    zIndex: 2,
  });

  const emptyCell = (
    <span className="tnum" style={{ fontSize: 12, color: color.hairlineStrong }}>
      —
    </span>
  );

  /** 产品身份单元格（产品块首行渲染，gridRow span 合并视觉）；span = 块内行数；
   *  main = 是否本组主分析产品（浅蓝衬底，第一百二十三轮角色着色） */
  const identityCells = (s: Series, specByKey: Map<string, Spec>, span: number, keyPrefix: string, main: boolean): JSX.Element[] => {
    const bg = main ? MAIN_TINT : color.canvas;
    const sp = specByKey.get(s.key);
    const name = sp ? `${s.brand} ${sp.modelName}` : dedupeSpecText(s.label);
    return [
      <div key={`${keyPrefix}-prod`} style={{ ...cell(0), ...frozen(0, bg), gridRow: `span ${span}`, gap: 6 }}>
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
        style={{ ...cell(1), ...frozen(1, bg), gridRow: `span ${span}`, fontSize: 11, color: color.body, whiteSpace: 'nowrap' }}
      >
        {sp?.romram || '—'}
      </div>,
    ];
  };

  /** 类型列小字（冻结区第三列）；main = 是否本组主分析产品行（浅蓝衬底随角色） */
  const typeCell = (text: string, main: boolean, rowKey: string) => (
    <div
      key={rowKey}
      style={{
        ...cell(2),
        ...frozen(2, main ? MAIN_TINT : color.canvas),
        justifyContent: 'flex-end',
        fontSize: 11,
        color: color.mute,
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </div>
  );

  /** 整行区块（组头 / 区块标题）：外层整行占位（阻断自动排布补位，底色/分隔线满行），
   *  内层内容盒钉在左缘、横向滚动始终可见 */
  const fullRow = (key: string, outer: CSSProperties, inner: JSX.Element) => (
    <div key={key} style={{ gridColumn: '1 / -1', ...outer }}>
      <div style={{ position: 'sticky', left: 0, width: 'max-content', maxWidth: '100%', zIndex: 3 }}>{inner}</div>
    </div>
  );

  /** 组头：主分析产品显性标出（本组价差即相对它）；多组时带组号 */
  const groupHeader = (b: Block): JSX.Element =>
    fullRow(
      `g-${b.g.id}`,
      { background: color.canvasSoft, borderBottom: `1px solid ${color.hairlineStrong}` },
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px' }}>
        {multi && (
          <span
            style={{
              fontSize: 11,
              color: color.body,
              border: `1px solid ${color.hairlineStrong}`,
              borderRadius: radius.pill,
              padding: '1px 8px',
              whiteSpace: 'nowrap',
            }}
          >
            {groupOrdinal(b.ordinal)}
          </span>
        )}
        <span style={{ fontSize: 11, color: color.mute, whiteSpace: 'nowrap' }}>主分析产品</span>
        {b.base ? (
          <>
            <BrandDot brand={b.base.brand} />
            <span style={{ fontSize: 14, fontWeight: 700, color: color.ink, whiteSpace: 'nowrap' }}>
              {b.base.brand} {b.specByKey.get(b.base.key)?.modelName ?? dedupeSpecText(b.base.label)}
            </span>
            <span
              className="tnum"
              style={{ fontSize: 11, color: color.body, background: 'rgba(0, 0, 0, 0.06)', borderRadius: 4, padding: '1px 6px', whiteSpace: 'nowrap' }}
            >
              {b.specByKey.get(b.base.key)?.romram || '—'}
            </span>
          </>
        ) : (
          <span style={{ fontSize: 14, fontWeight: 700, color: color.mute, whiteSpace: 'nowrap' }}>
            {b.g.mainKey == null ? EMPTY_MAIN_LABEL : '所选时间范围内无数据'}
          </span>
        )}
        <span className="tnum" style={{ fontSize: 11, color: color.mute, whiteSpace: 'nowrap' }}>
          对比产品 {b.base ? b.diffRows.length : b.g.series.length} 款
        </span>
      </div>,
    );

  /** 区块标题行（产品价差 / 核心信息明细） */
  const captionRow = (title: string, key: string) =>
    fullRow(
      key,
      { background: color.canvas, borderBottom: `1px solid ${color.hairlineStrong}` },
      <div style={{ padding: '6px 10px', fontSize: 13, fontWeight: 600, color: color.ink, whiteSpace: 'nowrap' }}>{title}</div>,
    );

  /** 列头行：产品/配置/类型（冻结）+ 时间列（每桶一列，图上同一时间轴） */
  const headerRow = (gid: string): JSX.Element[] => [
    ...(['产品', '配置', '类型'] as const).map((t, c) => (
      <div
        key={`${gid}-h-${t}`}
        style={{
          ...cell(c),
          ...frozen(c as 0 | 1 | 2, color.canvas),
          borderBottom: `1px solid ${color.hairlineStrong}`,
          justifyContent: c === 2 ? 'flex-end' : 'flex-start',
          fontSize: 11,
          color: color.mute,
        }}
      >
        {t}
      </div>
    )),
    ...dates.map((d, i) => (
      <div
        key={`${gid}-h-${buckets[i].id}`}
        className="tnum"
        style={{
          ...cell(3 + i),
          background: color.canvas,
          borderBottom: `1px solid ${color.hairlineStrong}`,
          justifyContent: 'center',
          fontSize: 11,
          color: color.body,
          whiteSpace: 'nowrap',
        }}
      >
        {d}
      </div>
    )),
  ];

  const brandOfBlock = (gid: string): string => {
    const b = blocks.find((x) => x.g.id === gid);
    return b?.base?.brand ?? b?.g.series[0]?.brand ?? '';
  };

  return (
    <div>
      {/* 标题行：卡标题 + 口径 + 组筛选（≥2 组才有筛选意义）+ 两表复制 */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: fontSize.displaySm, fontWeight: 600, color: color.ink }}>价差与明细</h2>
        {multi && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0, marginLeft: 6 }}>
            <span style={{ fontSize: 12, color: color.mute, whiteSpace: 'nowrap' }}>组</span>
            <ConfigProvider theme={filterBarTheme}>
              <Select
                mode="multiple"
                size="small"
                maxTagCount="responsive"
                aria-label="组筛选"
                placeholder="未选择组"
                value={viewBlocks.map((b) => b.g.id)}
                options={blocks.map((b) => ({ value: b.g.id, label: `${groupOrdinal(b.ordinal)} · ${blockTitle(b)}` }))}
                optionRender={(option) => (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <BrandDot brand={brandOfBlock(String(option.value))} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{option.label}</span>
                  </span>
                )}
                onChange={(vals: string[]) => setOffGroups(new Set(blocks.map((b) => b.g.id).filter((id) => !vals.includes(id))))}
                style={{ minWidth: 220, maxWidth: 460 }}
              />
            </ConfigProvider>
          </span>
        )}
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {viewBlocks.some((b) => b.diffRows.length > 0) && (
            <Button size="small" icon={<CopyOutlined />} onClick={onCopyDiff}>
              {copied === 'diff' ? '已复制' : '复制价差'}
            </Button>
          )}
          <Button size="small" icon={<CopyOutlined />} onClick={onCopyDetail}>
            {copied === 'detail' ? '已复制' : '复制明细'}
          </Button>
        </span>
      </div>

      {/* 横向滚动区：整张网格只横向滚动、高度随内容伸展（无纵向滚动条） */}
      <div style={{ overflowX: 'auto', overflowY: 'hidden', paddingBottom: 2 }}>
        <div style={{ display: 'grid', gridTemplateColumns: gridCols, minWidth: frozenW + n * W_TIME, alignItems: 'stretch' }}>
          {viewBlocks.map((b, bi) => {
            const hasDiff = b.base != null && b.diffRows.length > 0;
            return (
              <div key={b.g.id} style={{ display: 'contents' }}>
                {/* 组间隔（首组不加） */}
                {bi > 0 && <div style={{ gridColumn: '1 / -1', height: 26, background: color.canvas }} />}
                {groupHeader(b)}
                {headerRow(b.g.id)}
                {/* —— 产品价差：本组各对比产品相对主分析产品（主品行不列，行白底）—— */}
                {hasDiff && (
                  <>
                    {captionRow('产品价差', `cap-diff-${b.g.id}`)}
                    {b.diffRows.map((s) => (
                      <div key={`d-${b.g.id}-${s.key}`} style={{ display: 'contents' }}>
                        {identityCells(s, b.specByKey, 1, `d-${b.g.id}-${s.key}`, false)}
                        {typeCell('价差', false, `d-${b.g.id}-${s.key}-t`)}
                        {buckets.map((bk, i) => {
                          const pa = s.points[i]?.price ?? null;
                          const pb = b.base?.points[i]?.price ?? null;
                          const d = pa != null && pb != null ? diffPct(pa, pb) : null;
                          const tone = !d || d.text.startsWith('±') ? color.body : d.tone === 'rich' ? color.error : color.link;
                          return (
                            <div
                              key={`d-${b.g.id}-${s.key}-${bk.id}`}
                              className="tnum"
                              style={{
                                ...cell(3 + i),
                                justifyContent: 'flex-end',
                                fontSize: 12,
                                fontWeight: 600,
                                color: tone,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {d == null ? emptyCell : d.text}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                    {/* 价差区与明细区之间的间隔 */}
                    <div style={{ gridColumn: '1 / -1', height: 14, background: color.canvas }} />
                  </>
                )}
                {/* —— 核心信息明细：每产品 5 行（RRP / 折后价 / 折扣率 / 取证 / Offering）× 时间列 —— */}
                {captionRow('核心信息明细', `cap-detail-${b.g.id}`)}
                {b.g.series.map((s) => {
                  const p = `t-${b.g.id}-${s.key}`;
                  // 角色着色（第一百二十三轮）：主分析产品行衬浅蓝，对比产品行白底
                  const main = b.base != null && s.key === b.base.key;
                  const bg = main ? MAIN_TINT : undefined;
                  const latestIdx = latestIdxOf(s, n);
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
                  const rows: JSX.Element[] = [...identityCells(s, b.specByKey, DETAIL_SPAN, p, main)];
                  // RRP 行
                  rows.push(typeCell('RRP', main, `${p}-rrp`));
                  for (let i = 0; i < n; i++) {
                    const pt = s.points[i];
                    rows.push(
                      <div key={`${p}-rrp-${i}`} style={{ ...cell(3 + i), justifyContent: 'flex-end', background: bg }}>
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
                  // 折后价行
                  rows.push(typeCell('折后价', main, `${p}-price`));
                  for (let i = 0; i < n; i++) {
                    const pt = s.points[i];
                    rows.push(
                      <div key={`${p}-price-${i}`} style={{ ...cell(3 + i), justifyContent: 'flex-end', background: bg }}>
                        {pt?.price != null ? (
                          <span className="tnum" style={{ fontSize: 12, fontWeight: 600, color: color.ink, whiteSpace: 'nowrap' }}>
                            {formatPrice(pt.price, currency)}
                          </span>
                        ) : (
                          emptyCell
                        )}
                      </div>,
                    );
                  }
                  // 折扣率行
                  rows.push(typeCell('折扣率', main, `${p}-disc`));
                  for (let i = 0; i < n; i++) {
                    const disc = discountOf(s.points[i]);
                    rows.push(
                      <div key={`${p}-disc-${i}`} style={{ ...cell(3 + i), justifyContent: 'flex-end', background: bg }}>
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
                  // 取证行：该时点页面快照入口 + 最新时点商城现页
                  rows.push(typeCell('取证', main, `${p}-evid`));
                  for (let i = 0; i < n; i++) {
                    const url = s.points[i]?.url || '';
                    rows.push(
                      <div key={`${p}-evid-${i}`} style={{ ...cell(3 + i), justifyContent: 'flex-end', gap: 8, background: bg }}>
                        {url ? (
                          <>
                            <button type="button" className="tt-evi" title="查看该时点的电商页面快照" onClick={() => openSnap(i)} style={EVID_STYLE}>
                              <PictureOutlined style={{ fontSize: 11 }} />
                              快照
                            </button>
                            {i === latestIdx && (
                              <a className="tt-evi" href={url} target="_blank" rel="noreferrer" title="打开商城现页" style={EVID_STYLE}>
                                <ExportOutlined style={{ fontSize: 11 }} />
                                现页
                              </a>
                            )}
                          </>
                        ) : (
                          emptyCell
                        )}
                      </div>,
                    );
                  }
                  // 权益行：高度随内容自适应，全文完整显示
                  rows.push(typeCell('权益', main, `${p}-offer`));
                  for (let i = 0; i < n; i++) {
                    const text = offerText(s.points[i]);
                    rows.push(
                      <div key={`${p}-offer-${i}`} style={{ ...cell(3 + i), alignItems: 'flex-start', background: bg }}>
                        {text ? (
                          <span style={{ fontSize: 10, lineHeight: '13px', color: color.body, wordBreak: 'break-word', whiteSpace: 'normal' }}>
                            {text}
                          </span>
                        ) : (
                          emptyCell
                        )}
                      </div>,
                    );
                  }
                  return (
                    <div key={p} style={{ display: 'contents' }}>
                      {rows}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
        {viewBlocks.length === 0 && (
          <div style={{ padding: '14px 10px', fontSize: 12, color: color.mute }}>选择至少一组以显示价差与明细</div>
        )}
      </div>
      {/* 页面快照浮窗（居中小弹框） */}
      <SnapshotModal info={snapInfo} onClose={() => setSnapInfo(null)} />
      {/* 取证小件悬停态（内联样式无 :hover，工具类集中在此） */}
      <style>{`
        .tt-evi:hover { text-decoration: underline; }
      `}</style>
    </div>
  );
}
