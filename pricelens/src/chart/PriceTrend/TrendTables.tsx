// ============================================================
// 「价差与明细」宽表：产品价差与核心信息明细共享「产品 / 配置 / 类型 / 时间列」，
// 两个区块的时间轴始终对齐。核心明细每产品 6 行（RRP / 折后价 / 折扣率 /
// 平台-店铺 / 取证 / offer）；近 4 周环比收进产品单元格，随产品跨行只显示一次。
// 环比固定由上游周序列计算，月/季展示粒度不会把它变成 4 个月或 4 个季度。
// 时间列与图上同一可见时间段（每桶一列，周号＋日期双行列头），倒序排列。
// 取证行 = 电商页面快照入口 + 最新时点商城现页链接；复制成功/失败均有短暂反馈。
// 窄视口只冻结产品首列，其余列随表滚动，保证时间列始终可见。
// ============================================================
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Button } from 'antd';
import { CopyOutlined, ExportOutlined, PictureOutlined } from '@ant-design/icons';
import BrandDot from '../../components/BrandMark';
import { configTextOf } from '../../components/ProductCascader/tree';
import { dimProduct } from '../../data';
import type { CurrencyMode, Granularity, Series } from '../../dataModel/types';
import { color, fontSize, formatPrice, motion, radius } from '../../theme/tokens';
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

/** 周桶 id（202631）→「2026W31」：明细表头第一行与图上轴标签同语言（第一百八十二轮：
 *  图上 2026W19、表内只写 05-06 的口径割裂改为「周号＋日期」双行） */
function weekIdText(id: string): string {
  const m = /^(\d{4})(\d{1,2})$/.exec(id);
  return m ? `${m[1]}W${Number(m[2])}` : id;
}

// ---- 列宽（左缘冻结三列：产品/配置/类型 + 时间列） ----
const W_PROD = 236;
const W_CONF = 96;
const W_TYPE = 76;
const W_TIME = 100;
/** 主分析产品行底色（浅蓝；第一百二十三轮按角色着色——主品行衬浅蓝、对比行白底，
 *  与图例带主品药丸同语言，不再按品牌归属着色） */
const MAIN_TINT = '#f3f8ff';
/** 明细每产品行数（RRP / 折后价 / 折扣率 / 平台-店铺 / 取证 / offer） */
const DETAIL_SPAN = 6;

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

/** 复制表头里的组名（TSV 首列带组号时随行输出）：主品 品牌+型号+配置；空对用「对比产品」 */
function blockTitle(b: Block): string {
  if (b.base) {
    const sp = b.specByKey.get(b.base.key);
    return sp ? [b.base.brand, sp.modelName, configTextOf(sp.romram)].filter(Boolean).join(' ') : dedupeSpecText(b.base.label);
  }
  return b.g.mainKey == null ? '对比产品' : '主分析产品无数据';
}

export default function TrendTables(props: {
  groups: TableGroup[]; // 按选择浮窗卡序上报的组（主品在前 + 本卡对比区）
  buckets: DetailBucket[]; // 与图上同源的可见时间段（升序，与 points 下标一一对应）
  fourWeekChanges: ReadonlyMap<string, number | null>; // 周序列独立计算，锚定当前窗口末周
  currency: CurrencyMode;
  granularity: Granularity;
}) {
  const { groups, buckets, fourWeekChanges, currency, granularity } = props;
  // 组别页签选中态（本轮）：值 = 组 id；组集变化后找不到时回落第一组
  const [activeGid, setActiveGid] = useState<string | null>(null);
  // 复制反馈（第一百八十五轮，外部 UX 审计）：成功「已复制」、失败「复制失败」
  // ——同为短暂态（1.6s 自动复位），失败不再静默
  const [copied, setCopied] = useState<'diff' | 'detail' | 'diff-fail' | 'detail-fail' | null>(null);
  const copiedTimer = useRef<number | null>(null);
  const [snapInfo, setSnapInfo] = useState<SnapshotInfo | null>(null);
  // 窄视口只冻结产品首列，配置/类型随表横向滚动，避免冻区遮死时间列
  const [narrowViewport, setNarrowViewport] = useState(
    () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 639.98px)').matches,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(max-width: 639.98px)');
    const onChange = (): void => setNarrowViewport(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
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
  // 第一百三十一轮：组筛选删除，有数据的组全量展示
  const viewBlocks = useMemo(() => blocks.filter((b) => b.g.series.length > 0), [blocks]);
  // 页签当前组：activeGid 失配（换品/删组）时回落第一组
  const active = viewBlocks.find((b) => b.g.id === activeGid) ?? viewBlocks[0] ?? null;
  const dates = useMemo(() => buckets.map((b) => bucketDateText(granularity, b.xLabel)), [buckets, granularity]);
  // 时间列倒序（本轮，Eason）：最新一列在最左。ci.i = 升序内容下标（points 对位）
  const cols = useMemo(() => buckets.map((b, i) => ({ bk: b, i })).slice().reverse(), [buckets]);

  const markCopied = (which: 'diff' | 'detail', ok: boolean): void => {
    // 第一百八十五轮（外部 UX 审计）：失败同样给短暂反馈（「复制失败」），不再静默
    setCopied(ok ? which : `${which}-fail`);
    if (copiedTimer.current != null) window.clearTimeout(copiedTimer.current);
    copiedTimer.current = window.setTimeout(() => setCopied(null), 1600);
  };

  const fourWeekTextOf = (s: Series): string => {
    const change = fourWeekChanges.get(s.key);
    if (change == null) return '—';
    return `${change > 0 ? '+' : change < 0 ? '−' : '±'}${Math.abs(Math.round(change * 1000) / 10)}%`;
  };

  // ---- 复制为表格（TSV；列序与表头一致 = 时间倒序；多组时首列带组号） ----
  const onCopyDiff = async (): Promise<void> => {
    const lines = [[...(multi ? ['组'] : []), '主分析产品', '产品', '配置', ...dates.slice().reverse()].join('\t')];
    for (const b of viewBlocks) {
      if (!b.base) continue;
      const base = b.base;
      for (const s of b.diffRows) {
        const cells = cols.map(({ i }) => {
          const pa = s.points[i]?.price ?? null;
          const pb = base.points[i]?.price ?? null;
          return pa != null && pb != null ? diffPct(pa, pb)?.text ?? '—' : '—';
        });
        lines.push(
          [...(multi ? [groupOrdinal(b.ordinal)] : []), blockTitle(b), dedupeSpecText(s.label), configTextOf(b.specByKey.get(s.key)?.romram), ...cells].join('\t'),
        );
      }
    }
    markCopied('diff', await copyText(lines.join('\n')));
  };
  const onCopyDetail = async (): Promise<void> => {
    const TYPES = ['RRP', '折后价', '折扣率', '平台-店铺', '取证', 'offer'] as const;
    const lines = [[...(multi ? ['组'] : []), '产品', '配置', '类型', ...dates.slice().reverse()].join('\t')];
    for (const b of viewBlocks) {
      for (const s of b.g.series) {
        const product = dedupeSpecText(s.label);
        const change = fourWeekTextOf(s);
        for (const ty of TYPES) {
          const cells = cols.map(({ i }) => {
            const pt = s.points[i];
            if (!pt) return '—';
            if (ty === 'RRP') return formatPrice(pt.rrp, currency);
            if (ty === '折后价') return formatPrice(pt.price, currency);
            if (ty === '折扣率') {
              const disc = discountOf(pt);
              return disc != null ? fmtPct(disc) : '—';
            }
            if (ty === '平台-店铺') return pt.channelName ?? '—';
            if (ty === '取证') return pt.url || '—';
            return offerText(pt) || '—';
          });
          const productCell = ty === 'RRP' ? `${product}｜近4周环比 ${change}` : product;
          lines.push([...(multi ? [groupOrdinal(b.ordinal)] : []), productCell, configTextOf(b.specByKey.get(s.key)?.romram), ty, ...cells].join('\t'));
        }
      }
    }
    markCopied('detail', await copyText(lines.join('\n')));
  };

  if (groups.length === 0 || buckets.length === 0) return null;

  const n = buckets.length;
  const gridCols = `${W_PROD}px ${W_CONF}px ${W_TYPE}px repeat(${n}, ${W_TIME}px)`;
  const frozenW = W_PROD + W_CONF + W_TYPE;

  /** 单元格通用样式；c = 网格列号（0 起）：首列外每列左缘 1px hairline
   *  竖向分界线（第一百三十一轮改全列——产品/配置/类型与每个时间列之间都有线） */
  const cell = (c: number, extra?: CSSProperties): CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    padding: '5px 8px',
    borderBottom: `1px solid ${color.hairline}`,
    borderLeft: c >= 1 ? `1px solid ${color.hairline}` : undefined,
    ...extra,
  });
  /** 左缘冻结列定位（sticky left 随列累计）。
   *  gridColumn 显式指定——否则自动排布会把下一行的单元格补进整行区块的空位。
   *  窄视口只冻结产品首列，配置/类型取消 sticky 随表滚动，时间列始终可见 */
  const frozen = (c: 0 | 1 | 2, bg?: string): CSSProperties => ({
    ...(narrowViewport && c > 0
      ? {}
      : {
          position: 'sticky',
          left: [0, W_PROD, W_PROD + W_CONF][c],
          zIndex: 2,
        }),
    gridColumn: String(c + 1),
    background: bg ?? color.canvas,
  });

  const emptyCell = (
    <span className="tnum" style={{ fontSize: 12, color: color.hairlineStrong }}>
      —
    </span>
  );

  /** 产品身份单元格（产品块首行渲染，gridRow span 合并视觉）；span = 块内行数；
   *  main = 是否本组主分析产品（浅蓝衬底）。核心明细传入环比值，价差区不传则不显示。
   *  ARIA：产品 = 行头（rowheader）+ aria-rowspan，配置 = 跨行 cell */
  const identityCells = (
    s: Series,
    specByKey: Map<string, Spec>,
    span: number,
    keyPrefix: string,
    main: boolean,
    fourWeekChange?: number | null,
  ): JSX.Element[] => {
    const bg = main ? MAIN_TINT : color.canvas;
    const sp = specByKey.get(s.key);
    const name = sp ? `${s.brand} ${sp.modelName}` : dedupeSpecText(s.label);
    return [
      <div key={`${keyPrefix}-prod`} role="rowheader" aria-rowspan={span} style={{ ...cell(0), ...frozen(0, bg), gridRow: `span ${span}`, gap: 6 }}>
        <BrandDot brand={s.brand} />
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span
            title={name}
            style={{ fontSize: 12, fontWeight: 600, color: color.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {name}
          </span>
          {fourWeekChange !== undefined && (
            <span
              title="最近4周折后价均价相比此前4周均价"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, whiteSpace: 'nowrap' }}
            >
              <span style={{ color: color.mute }}>近4周环比</span>
              <span
                className="tnum"
                style={{
                  fontWeight: 600,
                  color: fourWeekChange == null
                    ? color.hairlineStrong
                    : fourWeekChange > 0.005
                      ? color.link
                      : fourWeekChange < -0.005
                        ? '#b45309'
                        : color.body,
                }}
              >
                {fourWeekChange == null
                  ? '—'
                  : `${fourWeekChange > 0 ? '+' : fourWeekChange < 0 ? '−' : '±'}${Math.abs(Math.round(fourWeekChange * 1000) / 10)}%`}
              </span>
            </span>
          )}
        </div>
      </div>,
      <div
        key={`${keyPrefix}-conf`}
        role="cell"
        aria-rowspan={span}
        className="tnum"
        style={{ ...cell(1), ...frozen(1, bg), gridRow: `span ${span}`, fontSize: 11, color: color.body, whiteSpace: 'nowrap' }}
      >
        {configTextOf(sp?.romram)}
      </div>,
    ];
  };

  /** 类型列小字（冻结区第三列）；main = 是否本组主分析产品行（浅蓝衬底随角色）。
   *  ARIA：行头（RRP / 折后价 / … 描述本行） */
  const typeCell = (text: string, main: boolean, rowKey: string) => (
    <div
      key={rowKey}
      role="rowheader"
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
   *  内层内容盒钉在左缘、横向滚动始终可见。ARIA：外层 = row、内层 = 跨全列的列头 */
  const fullRow = (key: string, outer: CSSProperties, inner: JSX.Element) => (
    <div key={key} role="row" style={{ gridColumn: '1 / -1', ...outer }}>
      <div role="columnheader" aria-colspan={3 + n} style={{ position: 'sticky', left: 0, width: 'max-content', maxWidth: '100%', zIndex: 3 }}>{inner}</div>
    </div>
  );

  /** 区块标题行（产品价差 / 核心信息明细） */
  const captionRow = (title: string, key: string) =>
    fullRow(
      key,
      { background: color.canvas, borderBottom: `1px solid ${color.hairlineStrong}` },
      <div style={{ padding: '6px 10px', fontSize: 13, fontWeight: 600, color: color.ink, whiteSpace: 'nowrap' }}>{title}</div>,
    );

  /** 两个区块共用「产品 / 配置 / 类型 / 时间列」，保证时间轴逐列对齐。
   *  周粒度列头 = 周号＋日期双行；月/季沿用原桶文案。 */
  const headerRow = (gid: string, part: string): JSX.Element[] => [
    ...(['产品', '配置', '类型'] as const).map((t, c) => (
      <div
        key={`${gid}-h-${part}-${t}`}
        role="columnheader"
        style={{
          ...cell(c),
          ...frozen(c as 0 | 1 | 2, color.canvas),
          borderBottom: `1px solid ${color.hairlineStrong}`,
          justifyContent: c >= 2 ? 'flex-end' : 'flex-start',
          fontSize: 11,
          color: color.mute,
        }}
      >
        {t}
      </div>
    )),
    ...cols.map(({ bk, i }, ri) => {
      const d = dates[i];
      const wk = granularity === 'week' ? weekIdText(bk.id) : null;
      return (
        <div
          key={`${gid}-h-${part}-${bk.id}`}
          role="columnheader"
          className="tnum"
          title={wk ? `${wk} · ${d}` : undefined}
          style={{
            ...cell(3 + ri), gridColumn: String(4 + ri),
            background: color.canvas,
            borderBottom: `1px solid ${color.hairlineStrong}`,
            justifyContent: 'center',
            fontSize: 11,
            color: color.body,
            whiteSpace: 'nowrap',
          }}
        >
          {wk ? (
            <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', lineHeight: '13px' }}>
              <span style={{ fontSize: 11, color: color.mute }}>{wk}</span>
              <span style={{ fontSize: 11, color: color.body }}>{d}</span>
            </span>
          ) : (
            d
          )}
        </div>
      );
    }),
  ];

  /** 组表体：产品价差（标题 + 列头 + 主品基准行 + 对比行）+ 核心信息明细
   *  （标题 + 列头 + 每产品 6 行）；本轮起一次只渲染页签选中的一组 */
  const groupBody = (b: Block): JSX.Element => {
    const hasDiff = b.base != null && b.diffRows.length > 0;
    return (
      <>
        {/* —— 产品价差：本组相对主分析产品。列头随区块标题走；主品行补进本节
            首行作基准锚——自己比自己无价差、时间列整行置空，浅蓝衬底 —— */}
        {hasDiff && (
          <>
            {captionRow('产品价差', `cap-diff-${b.g.id}`)}
            {headerRow(b.g.id, 'diff')}
            {b.base != null && (
              <div key={`d-${b.g.id}-base`} role="row" style={{ display: 'contents' }}>
                {identityCells(b.base, b.specByKey, 1, `d-${b.g.id}-base`, true)}
                {typeCell('基准', true, `d-${b.g.id}-base-t`)}
                {cols.map(({ bk }, ri) => (
                  <div key={`d-${b.g.id}-base-${bk.id}`} role="cell" style={{ ...cell(3 + ri), gridColumn: String(4 + ri), background: MAIN_TINT }} />
                ))}
              </div>
            )}
            {b.diffRows.map((s) => (
              <div key={`d-${b.g.id}-${s.key}`} role="row" style={{ display: 'contents' }}>
                {identityCells(s, b.specByKey, 1, `d-${b.g.id}-${s.key}`, false)}
                {typeCell('价差', false, `d-${b.g.id}-${s.key}-t`)}
                {cols.map(({ bk, i }, ri) => {
                  const pa = s.points[i]?.price ?? null;
                  const pb = b.base?.points[i]?.price ?? null;
                  const d = pa != null && pb != null ? diffPct(pa, pb) : null;
                  const tone = !d || d.text.startsWith('±') ? color.body : d.tone === 'rich' ? color.error : color.link;
                  return (
                    <div
                      key={`d-${b.g.id}-${s.key}-${bk.id}`}
                      role="cell"
                      className="tnum"
                      style={{
                        ...cell(3 + ri), gridColumn: String(4 + ri),
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
            <div aria-hidden style={{ gridColumn: '1 / -1', height: 14, background: color.canvas }} />
          </>
        )}
        {/* 核心信息明细：每产品 6 行；近 4 周环比随产品单元格跨行展示一次 */}
        {captionRow('核心信息明细', `cap-detail-${b.g.id}`)}
        {headerRow(b.g.id, 'detail')}
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
          const rows: JSX.Element[] = [
            ...identityCells(s, b.specByKey, DETAIL_SPAN, p, main, fourWeekChanges.get(s.key) ?? null),
          ];
          // RRP 行
          rows.push(typeCell('RRP', main, `${p}-rrp`));
          rows.push(
            ...cols.map(({ bk, i }, ri) => {
              const pt = s.points[i];
              return (
                <div key={`${p}-rrp-${bk.id}`} role="cell" style={{ ...cell(3 + ri), gridColumn: String(4 + ri), justifyContent: 'flex-end', background: bg }}>
                  {pt?.rrp != null ? (
                    <span className="tnum" title="RRP（官方建议零售价）" style={{ fontSize: 12, color: color.body, whiteSpace: 'nowrap' }}>
                      {formatPrice(pt.rrp, currency)}
                    </span>
                  ) : (
                    emptyCell
                  )}
                </div>
              );
            }),
          )
          // 折后价行
          rows.push(typeCell('折后价', main, `${p}-price`));
          rows.push(
            ...cols.map(({ bk, i }, ri) => {
              const pt = s.points[i];
              return (
                <div key={`${p}-price-${bk.id}`} role="cell" style={{ ...cell(3 + ri), gridColumn: String(4 + ri), justifyContent: 'flex-end', background: bg }}>
                  {pt?.price != null ? (
                    <span className="tnum" style={{ fontSize: 12, fontWeight: 600, color: color.ink, whiteSpace: 'nowrap' }}>
                      {formatPrice(pt.price, currency)}
                    </span>
                  ) : (
                    emptyCell
                  )}
                </div>
              );
            }),
          )
          // 折扣率行
          rows.push(typeCell('折扣率', main, `${p}-disc`));
          rows.push(
            ...cols.map(({ bk, i }, ri) => {
              const disc = discountOf(s.points[i]);
              return (
                <div key={`${p}-disc-${bk.id}`} role="cell" style={{ ...cell(3 + ri), gridColumn: String(4 + ri), justifyContent: 'flex-end', background: bg }}>
                  {disc != null ? (
                    <span className="tnum" style={{ fontSize: 12, color: disc <= -0.15 ? '#b45309' : color.body, whiteSpace: 'nowrap' }}>
                      {fmtPct(disc)}
                    </span>
                  ) : (
                    emptyCell
                  )}
                </div>
              );
            }),
          )
          // 平台-店铺行（第一百六十二轮，Eason）：该时点取数来源；自动口径每周可随
          // 最低价来源变化，逐列说明
          rows.push(typeCell('平台-店铺', main, `${p}-chan`));
          rows.push(
            ...cols.map(({ bk, i }, ri) => {
              const chan = s.points[i]?.channelName ?? null;
              return (
                <div key={`${p}-chan-${bk.id}`} role="cell" style={{ ...cell(3 + ri), gridColumn: String(4 + ri), background: bg }}>
                  {chan ? (
                    <span title={`该时点取数渠道：${chan}`} style={{ fontSize: 11, color: color.body, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {chan}
                    </span>
                  ) : (
                    emptyCell
                  )}
                </div>
              );
            }),
          )
          // 取证行：该时点页面快照入口 + 最新时点商城现页
          rows.push(typeCell('取证', main, `${p}-evid`));
          rows.push(
            ...cols.map(({ bk, i }, ri) => {
              const url = s.points[i]?.url || '';
              return (
                <div key={`${p}-evid-${bk.id}`} role="cell" style={{ ...cell(3 + ri), gridColumn: String(4 + ri), justifyContent: 'flex-end', gap: 8, background: bg }}>
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
                </div>
              );
            }),
          )
          // offer 行（第一百六十二轮更名，原「权益」）：高度随内容自适应，全文完整显示
          rows.push(typeCell('offer', main, `${p}-offer`));
          rows.push(
            ...cols.map(({ bk, i }, ri) => {
              const text = offerText(s.points[i]);
              return (
                <div key={`${p}-offer-${bk.id}`} role="cell" style={{ ...cell(3 + ri), gridColumn: String(4 + ri), alignItems: 'flex-start', background: bg }}>
                  {text ? (
                    <span style={{ fontSize: 10, lineHeight: '13px', color: color.body, wordBreak: 'break-word', whiteSpace: 'normal' }}>
                      {text}
                    </span>
                  ) : (
                    emptyCell
                  )}
                </div>
              );
            }),
          )
          return (
            <div key={p} role="row" style={{ display: 'contents' }}>
              {rows}
            </div>
          );
        })}
      </>
    );
  };

  return (
    <div>
      {/* 标题行：卡标题 + 两表复制（复制含全部组；页签只管看哪一组） */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: fontSize.displaySm, fontWeight: 600, color: color.ink }}>价差与明细</h2>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {viewBlocks.some((b) => b.diffRows.length > 0) && (
            <Button size="small" icon={<CopyOutlined />} onClick={onCopyDiff}>
              {/* 第一百八十五轮（外部 UX 审计）：复制失败短暂显「复制失败」（红色），
                  与「已复制」同一短暂态节奏，不再静默 */}
              {copied === 'diff' ? (
                '已复制'
              ) : copied === 'diff-fail' ? (
                <span style={{ color: color.error }}>复制失败</span>
              ) : (
                '复制价差'
              )}
            </Button>
          )}
          <Button size="small" icon={<CopyOutlined />} onClick={onCopyDetail}>
            {copied === 'detail' ? (
              '已复制'
            ) : copied === 'detail-fail' ? (
              <span style={{ color: color.error }}>复制失败</span>
            ) : (
              '复制明细'
            )}
          </Button>
        </span>
      </div>

      {/* 组别页签（本轮，Eason）：一次看一组，替代原纵向堆叠；风格 = 图表卡页签
          （文字 + 当前组墨色下划线）。单组不渲染页签 */}
      {viewBlocks.length >= 2 && active != null && (
        <div role="tablist" aria-label="产品组" style={{ display: 'flex', alignItems: 'flex-end', gap: 18, marginBottom: 12, borderBottom: `1px solid ${color.hairline}` }}>
          {viewBlocks.map((b) => {
            const on = b.g.id === active.g.id;
            return (
              <button
                key={b.g.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setActiveGid(b.g.id)}
                className="lpl-chart-tab"
                style={{
                  height: 32,
                  marginBottom: -1,
                  padding: '0 2px',
                  border: 'none',
                  borderBottom: `2px solid ${on ? color.ink : 'transparent'}`,
                  background: 'transparent',
                  font: 'inherit',
                  fontSize: 13,
                  fontWeight: on ? 600 : 400,
                  color: on ? color.ink : color.body,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'color 160ms ease, border-color 160ms ease, background-color 160ms ease',
                }}
              >
                {blockTitle(b)}
              </button>
            );
          })}
        </div>
      )}

      {/* 横向滚动区：只渲染页签选中组的表体；整张网格只横向滚动（无纵向滚动条）。
          ARIA（第一百八十二轮）：div 网格补全 table 语义——row/cell/列头/行头，
          读屏按行列关系朗读，冻结列与合并单元格经 aria-rowspan 表达 */}
      <div style={{ overflowX: 'auto', overflowY: 'hidden', paddingBottom: 2 }}>
        {active != null && (
          <div role="table" aria-label="价差与明细" style={{ display: 'grid', gridTemplateColumns: gridCols, gridAutoFlow: 'row dense', minWidth: frozenW + n * W_TIME, alignItems: 'stretch' }}>
            {groupBody(active)}
          </div>
        )}
        {viewBlocks.length === 0 && (
          <div style={{ padding: '14px 10px', fontSize: 12, color: color.mute }}>暂无可展示的数据</div>
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
