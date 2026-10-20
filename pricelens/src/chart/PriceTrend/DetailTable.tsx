// ============================================================
// 图下「核心信息明细」（第110轮，2026-10-20 评审最重要项）：
// 价格走势图卡下方的独立明细卡——与图上完全同源（同一可见时间段 × 同一批产品
// 系列，币种/取数平台/粒度随图联动；分离模式 = 各面板系列并集去重）。
// 按产品分块（2026-10-20 评审后用户定版）：每个产品一个区块，区块标题 = 品牌色点+品牌+型号+配置，
// 块内一行 = 一个时间点的取价快照：
//   日期（周=周三 MM-DD / 月=YYYY-MM / 季=YYYYQn）｜折后价｜RRP（不划线）｜折扣率（= 折后价/RRP − 1）｜
//   取价店铺｜Offering（促销/分期/组合权益完整原文，默认两行省略、点击展开）｜取证链接（新窗口）。
// 默认只列有采数的行（「含缺采周」开关展开全部）；块内日期降序；区块顺序 = 图上系列序（我司在前）。
// 工具行 = 标题 + 行数 + 产品筛选 chips（默认全开）+「复制为表格」（TSV 进剪贴板，
// 可直接粘进 Excel/PPT）。零系列时不渲染（页面只有图卡）。
// ============================================================
import { useMemo, useRef, useState } from 'react';
import { Button, Switch, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CopyOutlined, ExportOutlined } from '@ant-design/icons';
import BrandDot from '../../components/BrandMark';
import type { CurrencyMode, Granularity, Series, SeriesPoint } from '../../dataModel/types';
import { color, fontSize, formatPrice, motion, radius } from '../../theme/tokens';
import { curveNameOf, dedupeSpecText, offerList } from './chartModel';

export interface DetailBucket {
  id: string;
  xLabel: string; // 周=周三 MM-DD / 月=YYYYMM / 季=YYYYQn
  anchorDate: string; // ISO 日期（周=该周周三；月/季=桶内最后周三）
}

interface DetailRow {
  key: string;
  dateText: string;
  product: string;
  brand: string;
  seriesKey: string;
  price: number | null;
  rrp: number | null;
  discount: number | null; // = price/rrp − 1；RRP 缺失 = null
  shop: string | null;
  offerText: string;
  url: string;
}

/** 日期列：周 = MM-DD（桶 xLabel 原样）；月 = YYYY-MM；季 = 2026Q1 原样 */
function bucketDateText(g: Granularity, xLabel: string): string {
  if (g === 'month' && /^\d{6}$/.test(xLabel)) return `${xLabel.slice(0, 4)}-${xLabel.slice(4)}`;
  return xLabel;
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

export default function DetailTable(props: {
  series: Series[]; // 与图上同源的系列（index 层上报）
  buckets: DetailBucket[]; // 与图上同源的可见时间段
  currency: CurrencyMode;
  granularity: Granularity;
}) {
  const { series, buckets, currency, granularity } = props;
  const [offKeys, setOffKeys] = useState<Set<string>>(new Set()); // 产品筛选 chips：默认全开
  const [showMissing, setShowMissing] = useState(false); // 「含缺采周」：默认只列有采数的行
  const [expanded, setExpanded] = useState<Set<string>>(new Set()); // Offering 点击展开的行
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<number | null>(null);

  /** 按产品分块：区块顺序 = 系列序（我司在前）；块内日期降序 */
  const groups = useMemo(() => {
    if (series.length === 0 || buckets.length === 0) return [] as { series: Series; rows: DetailRow[] }[];
    const out: { series: Series; rows: DetailRow[] }[] = [];
    for (const s of series) {
      if (offKeys.has(s.key)) continue;
      const rows: DetailRow[] = [];
      for (let bi = buckets.length - 1; bi >= 0; bi--) {
        const bucket = buckets[bi];
        const pt: SeriesPoint | undefined = s.points[bi];
        if (!pt) continue;
        if (!showMissing && pt.price == null && pt.rrp == null) continue; // 缺采行默认不列
        rows.push({
          key: `${bucket.id}__${s.key}`,
          dateText: bucketDateText(granularity, pt.xLabel || bucket.xLabel),
          product: dedupeSpecText(s.label),
          brand: s.brand,
          seriesKey: s.key,
          price: pt.price,
          rrp: pt.rrp,
          discount: pt.price != null && pt.rrp != null && pt.rrp > 0 ? pt.price / pt.rrp - 1 : null,
          shop: pt.shopName,
          // Offering 完整原文：促销 / 分期 / 组合 三段按序拼接，不截断
          offerText: offerList(pt.offer)
            .map((d) => d.detail)
            .filter((t) => !!t)
            .join('；'),
          url: pt.url ?? '',
        });
      }
      out.push({ series: s, rows });
    }
    return out;
  }, [series, buckets, offKeys, showMissing, granularity]);
  const rows: DetailRow[] = useMemo(() => groups.flatMap((g) => g.rows), [groups]);

  const toggleChip = (key: string): void => {
    setOffKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const toggleExpand = (key: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const onCopy = async (): Promise<void> => {
    const head = ['日期', '产品', '折后价', 'RRP', '折扣率', '取价店铺', 'Offering', '取证链接'];
    const lines = [head.join('\t')];
    for (const r of rows) {
      lines.push(
        [
          r.dateText,
          r.product,
          formatPrice(r.price, currency),
          formatPrice(r.rrp, currency),
          r.discount != null ? fmtPct(r.discount) : '—',
          r.shop ?? '—',
          r.offerText || '—',
          r.url || '—',
        ].join('\t'),
      );
    }
    const ok = await copyText(lines.join('\n'));
    setCopied(ok);
    if (copiedTimer.current != null) window.clearTimeout(copiedTimer.current);
    copiedTimer.current = window.setTimeout(() => setCopied(false), 1600);
  };

  if (series.length === 0) return null; // 零系列：不渲染明细卡

  const columns: ColumnsType<DetailRow> = [
    {
      title: '日期',
      dataIndex: 'dateText',
      key: 'date',
      width: 92,
      render: (v: string) => (
        <span className="tnum" style={{ color: color.body, whiteSpace: 'nowrap' }}>
          {v}
        </span>
      ),
    },
    {
      title: '折后价',
      dataIndex: 'price',
      key: 'price',
      width: 112,
      align: 'right',
      render: (v: number | null) => (
        <span
          className="tnum"
          style={{ color: v != null ? color.ink : color.hairlineStrong, fontWeight: v != null ? 600 : 400, whiteSpace: 'nowrap' }}
        >
          {formatPrice(v, currency)}
        </span>
      ),
    },
    {
      title: 'RRP',
      dataIndex: 'rrp',
      key: 'rrp',
      width: 112,
      align: 'right',
      render: (v: number | null) => (
        <span
          className="tnum"
          title={v != null ? 'RRP（官方建议零售价）' : undefined}
          style={{ color: v != null ? color.body : color.hairlineStrong, whiteSpace: 'nowrap' }}
        >
          {formatPrice(v, currency)}
        </span>
      ),
    },
    {
      title: '折扣率',
      dataIndex: 'discount',
      key: 'discount',
      width: 92,
      align: 'right',
      render: (v: number | null) => (
        <span
          className="tnum"
          style={{ color: v != null ? (v <= -0.15 ? '#b45309' : color.body) : color.hairlineStrong, whiteSpace: 'nowrap' }}
        >
          {v != null ? fmtPct(v) : '—'}
        </span>
      ),
    },
    {
      title: '取价店铺',
      dataIndex: 'shop',
      key: 'shop',
      width: 128,
      render: (v: string | null) => (
        <span title={v ?? undefined} style={{ color: color.body, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
          {v ?? '—'}
        </span>
      ),
    },
    {
      title: 'Offering',
      dataIndex: 'offerText',
      key: 'offer',
      render: (v: string, r) => {
        const open = expanded.has(r.key);
        if (!v) {
          return <span style={{ color: color.hairlineStrong }}>—</span>;
        }
        return (
          <span
            role="button"
            tabIndex={0}
            title={open ? '点击收起' : '点击展开全文'}
            onClick={() => toggleExpand(r.key)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleExpand(r.key);
              }
            }}
            style={{
              cursor: 'pointer',
              color: color.body,
              lineHeight: '18px',
              display: open ? 'block' : '-webkit-box',
              WebkitBoxOrient: 'vertical' as const,
              WebkitLineClamp: open ? undefined : 2,
              overflow: 'hidden',
              transition: `color ${motion.fast}ms ease`,
            }}
          >
            {v}
          </span>
        );
      },
    },
    {
      title: '取证链接',
      dataIndex: 'url',
      key: 'url',
      width: 88,
      render: (v: string) =>
        v ? (
          <a
            href={v}
            target="_blank"
            rel="noreferrer"
            title="打开取证页面（新窗口）"
            style={{ color: color.link, display: 'inline-flex', alignItems: 'center', gap: 3 }}
          >
            <ExportOutlined style={{ fontSize: 12 }} />↗
          </a>
        ) : (
          <span style={{ color: color.hairlineStrong }}>—</span>
        ),
    },
  ];

  return (
    <div>
      {/* 工具行：标题 + 行数 + 产品筛选 chips + 含缺采周 + 复制为表格 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 10,
          marginBottom: 10,
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 600, color: color.ink }}>核心信息明细</span>
        <span className="tnum" style={{ fontSize: fontSize.caption, color: color.mute }}>
          {rows.length} 行
        </span>
        <span aria-hidden style={{ width: 1, height: 14, background: color.hairline, margin: '0 2px' }} />
        {/* 产品筛选 chips（默认全开；点击切换该系列行显隐，样式与图上名称药丸同语言） */}
        <span style={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
          {series.map((s) => {
            const off = offKeys.has(s.key);
            return (
              <span
                key={s.key}
                role="button"
                aria-pressed={!off}
                title={off ? '点击显示该产品' : '点击隐藏该产品'}
                onClick={() => toggleChip(s.key)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '2px 9px',
                  fontSize: 11,
                  lineHeight: '16px',
                  color: off ? color.mute : color.body,
                  background: off ? 'transparent' : color.canvas,
                  border: `1px ${off ? 'dashed' : 'solid'} ${off ? color.hairline : color.hairlineStrong}`,
                  borderRadius: radius.pill,
                  cursor: 'pointer',
                  userSelect: 'none',
                  whiteSpace: 'nowrap',
                  transition: `border-color ${motion.fast}ms ease, color ${motion.fast}ms ease`,
                }}
              >
                <BrandDot brand={s.brand} />
                {dedupeSpecText(curveNameOf(s))}
              </span>
            );
          })}
        </span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 14 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Switch size="small" checked={showMissing} onChange={setShowMissing} />
            <span style={{ fontSize: 12, color: color.body, whiteSpace: 'nowrap' }}>含缺采周</span>
          </span>
          <Button size="small" icon={<CopyOutlined />} onClick={onCopy}>
            {copied ? '已复制' : '复制为表格'}
          </Button>
        </span>
      </div>
      {/* 分块明细：每个产品一个区块（标题 = 品牌色点+品牌+型号+配置 + 行数），块内小号表格；整卡 560px 内滚动 */}
      <div style={{ maxHeight: 560, overflowY: 'auto', paddingRight: 2 }}>
        {groups.map((g, gi) => (
          <section key={g.series.key} style={{ marginTop: gi === 0 ? 0 : 14 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 10px',
                background: g.series.isOwn ? '#f3f8ff' : color.canvasSoft,
                borderLeft: `3px solid ${g.series.color}`,
                borderRadius: radius.control,
                marginBottom: 4,
              }}
            >
              <BrandDot brand={g.series.brand} />
              <span style={{ fontSize: 13, fontWeight: 650, color: color.ink }}>{dedupeSpecText(g.series.label)}</span>
              {g.series.isOwn && (
                <span style={{ fontSize: 10.5, fontWeight: 600, color: '#0053c2', background: '#e8f1ff', borderRadius: radius.pill, padding: '0 7px', lineHeight: '16px' }}>
                  我司
                </span>
              )}
              <span className="tnum" style={{ marginLeft: 'auto', fontSize: fontSize.caption, color: color.mute }}>
                {g.rows.length} 行
              </span>
            </div>
            {g.rows.length === 0 ? (
              <div style={{ padding: '6px 10px', fontSize: 12, color: color.mute }}>该时间段内无采集到的价格</div>
            ) : (
              <Table<DetailRow>
                size="small"
                rowKey="key"
                columns={columns}
                dataSource={g.rows}
                pagination={false}
                showHeader={gi === 0}
                style={{ background: color.canvas }}
              />
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
