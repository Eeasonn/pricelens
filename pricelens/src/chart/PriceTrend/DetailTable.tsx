// ============================================================
// 图下「核心信息明细」（第110轮，2026-10-20 评审最重要项）：
// 价格走势图卡下方的独立明细卡——与图上完全同源（同一可见时间段 × 同一批产品
// 系列，币种/取数平台/粒度随图联动；分离模式 = 各面板系列并集去重）。
// 按产品分块（2026-10-20 评审后用户定版）：每个产品一个区块，区块标题 = 品牌点+
// 品牌+型号+配置，块内一行 = 一个时间点的取价快照。
// 第一百一十四轮（评审）列序定版：平台｜日期｜RRP｜折后价｜折扣率｜Offering｜取证；
// 取证列 = 页面快照图片按钮（历史时点唯一取证方式）+ 最新时点附商城现页链接。
// 默认只列有采数的行（「含缺采周」开关展开全部）；块内日期降序；区块顺序 = 图上系列序；
// 每个区块自带表头（第一百一十三轮，评审）。
// 工具行（第一百一十三轮，评审）= 标题 +「产品」多选下拉 +「时间」RangePicker
// （默认跟随上方图查看的时间段，可自选；「对齐图表」一键回跟）+「含缺采周」开关
// +「复制为表格」。快照查看（页面截图取证）唯一入口在本表取证列（第一百一十四轮：
// 图上悬停快照图标已撤）。
// ============================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import { Button, ConfigProvider, DatePicker, Select, Switch, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import zhCN from 'antd/locale/zh_CN';
import { CalendarOutlined, CloseOutlined, CopyOutlined, ExportOutlined, PictureOutlined } from '@ant-design/icons';
import BrandDot from '../../components/BrandMark';
import { filterBarTheme } from '../../components/FilterBar';
import { bucketIdOfDate, dateOfBucket } from '../../components/FilterBar/timeUtils';
import type { CurrencyMode, Granularity, Series, SeriesPoint } from '../../dataModel/types';
import { color, formatPrice, motion, radius } from '../../theme/tokens';
import { curveNameOf, dedupeSpecText, offerList } from './chartModel';
import SnapshotModal, { type SnapshotInfo } from './SnapshotModal';

export interface DetailBucket {
  id: string;
  xLabel: string; // 周=周三 MM-DD / 月=YYYYMM / 季=YYYYQn
  anchorDate: string; // ISO 日期（周=该周周三；月/季=桶内最后周三）
}

interface DetailRow {
  key: string;
  bucketId: string;
  dateText: string;
  product: string;
  brand: string;
  seriesKey: string;
  platform: string | null;
  shop: string | null; // 快照浮窗口径行用（列已并入平台，不再单列）
  price: number | null;
  rrp: number | null;
  discount: number | null; // = price/rrp − 1；RRP 缺失 = null
  offerText: string;
  url: string;
  isLatest: boolean; // 该产品块内最新有值时点（取证列附商城现页链接；历史时点只有快照图）
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
  /** 完整范围（上方极值筛选范围）数据 + 当前查看窗口在其中下标（第一百一十三轮，
   *  评审）：表内时间筛选默认跟图（s/e），自选时在完整范围内切片 */
  full: { series: Series[]; buckets: DetailBucket[]; s: number; e: number };
  currency: CurrencyMode;
  granularity: Granularity;
}) {
  const { series, buckets, currency, granularity } = props;
  // 完整范围兜底：full 尚未就绪（空桶）时退回窗口数据，行为与旧版一致
  const full =
    props.full != null && props.full.buckets.length > 0
      ? props.full
      : { series, buckets, s: 0, e: Math.max(0, buckets.length - 1) };
  const [offKeys, setOffKeys] = useState<Set<string>>(new Set()); // 产品筛选：默认全开（隐藏的 key 集）
  const [showMissing, setShowMissing] = useState(false); // 「含缺采周」：默认只列有采数的行
  const [expanded, setExpanded] = useState<Set<string>>(new Set()); // Offering 点击展开的行
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<number | null>(null);
  // 页面快照浮窗（第一百一十四轮：图上悬停快照图标已撤，取证列图片按钮为唯一入口）
  const [snapInfo, setSnapInfo] = useState<SnapshotInfo | null>(null);
  // 表内自选时间段（第一百一十三轮，评审）：s/e = 完整范围桶下标；null = 跟随上方图
  const [custom, setCustom] = useState<{ s: number; e: number } | null>(null);
  useEffect(() => {
    setCustom(null); // 粒度切换换了桶体系，自选区间随之失效回到跟随
  }, [granularity]);

  // 生效时间段 = 自选 ?? 图上窗口（下标都相对完整范围，钳进合法区间）
  const fbLen = full.buckets.length;
  const range = useMemo(() => {
    const last = fbLen - 1;
    if (last < 0) return { s: 0, e: -1 };
    const r = custom ?? { s: full.s, e: full.e };
    const e = Math.min(Math.max(r.e, 0), last);
    const s = Math.min(Math.max(r.s, 0), e);
    return { s, e };
  }, [custom, full.s, full.e, fbLen]);
  const viewBuckets = useMemo(() => full.buckets.slice(range.s, range.e + 1), [full.buckets, range]);
  const viewSeries = useMemo(
    () =>
      full.series
        .map((s) => ({ ...s, points: s.points.slice(range.s, range.e + 1) }))
        .filter((s) => s.points.length > 0),
    [full.series, range],
  );
  const brandByKey = new Map(viewSeries.map((s) => [s.key, s.brand])); // 下拉选项/药丸用品牌点

  /** 按产品分块：区块顺序 = 系列序；块内日期降序。isLatest = 块内最新有值时点
   *  （第一百一十四轮：取证列在最新时点附商城现页链接，历史时点只有快照图） */
  const groups = useMemo(() => {
    if (viewSeries.length === 0 || viewBuckets.length === 0) return [] as { series: Series; rows: DetailRow[] }[];
    const out: { series: Series; rows: DetailRow[] }[] = [];
    for (const s of viewSeries) {
      if (offKeys.has(s.key)) continue;
      let latestId: string | null = null; // 自新至旧首个有值桶
      for (let bi = viewBuckets.length - 1; bi >= 0; bi--) {
        const pt = s.points[bi];
        if (pt && (pt.price != null || pt.rrp != null)) {
          latestId = viewBuckets[bi].id;
          break;
        }
      }
      const rows: DetailRow[] = [];
      for (let bi = viewBuckets.length - 1; bi >= 0; bi--) {
        const bucket = viewBuckets[bi];
        const pt: SeriesPoint | undefined = s.points[bi];
        if (!pt) continue;
        if (!showMissing && pt.price == null && pt.rrp == null) continue; // 缺采行默认不列
        rows.push({
          key: `${bucket.id}__${s.key}`,
          bucketId: bucket.id,
          dateText: bucketDateText(granularity, pt.xLabel || bucket.xLabel),
          product: dedupeSpecText(s.label),
          brand: s.brand,
          seriesKey: s.key,
          platform: pt.platform ?? (pt.shopName ? pt.shopName.split(' · ')[0] : null),
          shop: pt.shopName,
          price: pt.price,
          rrp: pt.rrp,
          discount: pt.price != null && pt.rrp != null && pt.rrp > 0 ? pt.price / pt.rrp - 1 : null,
          // Offering 完整原文：促销 / 分期 / 组合 三段按序拼接，不截断
          offerText: offerList(pt.offer)
            .map((d) => d.detail)
            .filter((t) => !!t)
            .join('；'),
          url: pt.url ?? '',
          isLatest: bucket.id === latestId,
        });
      }
      out.push({ series: s, rows });
    }
    return out;
  }, [viewSeries, viewBuckets, offKeys, showMissing, granularity]);
  const rows: DetailRow[] = useMemo(() => groups.flatMap((g) => g.rows), [groups]);

  // ---- 时间 RangePicker（与图上下方刷选条同款写法）：日期 ↔ 桶 id ↔ 完整范围下标 ----
  const granularityLabel: Record<Granularity, string> = { week: '周', month: '月', quarter: '季' };
  const pickerMode: 'week' | 'month' | 'quarter' = granularity;
  const formatBucketId = (id: string): string => {
    if (granularity === 'week' && /^\d{6}$/.test(id)) return `${id.slice(0, 4)}-W${id.slice(4)}`;
    if (granularity === 'month' && /^\d{6}$/.test(id)) return `${id.slice(0, 4)}-${id.slice(4)}`;
    return id;
  };
  const pickerFormat = (value: Dayjs): string => formatBucketId(bucketIdOfDate(value.toDate(), granularity));
  const pickerValue: [Dayjs, Dayjs] | null =
    fbLen > 0 && range.e >= range.s
      ? [
          dayjs(dateOfBucket(full.buckets[range.s].id, granularity) ?? new Date()),
          dayjs(dateOfBucket(full.buckets[range.e].id, granularity) ?? new Date()),
        ]
      : null;
  const disabledDate = (value: Dayjs): boolean => {
    const id = bucketIdOfDate(value.toDate(), granularity);
    return !full.buckets.some((b) => b.id === id); // 完整范围之外的日期不可选
  };
  /** 日期 → 桶 id → 完整范围下标；id 不在其中时取最近存在的桶（首/尾钳制） */
  const nearestBucketIdx = (id: string): number => {
    const exact = full.buckets.findIndex((b) => b.id === id);
    if (exact >= 0) return exact;
    if (fbLen === 0) return 0;
    if (id < full.buckets[0].id) return 0;
    if (id > full.buckets[fbLen - 1].id) return fbLen - 1;
    return 0;
  };
  const onRangePick = (values: [Dayjs | null, Dayjs | null] | null): void => {
    const start = values?.[0];
    const end = values?.[1];
    if (!start || !end) return;
    const a = nearestBucketIdx(bucketIdOfDate(start.toDate(), granularity));
    const b = nearestBucketIdx(bucketIdOfDate(end.toDate(), granularity));
    setCustom(a <= b ? { s: a, e: b } : { s: b, e: a });
  };
  // 自选生效（与图上窗口不一致）时提供「对齐图表」一键回跟随
  const customActive = custom != null && (custom.s !== full.s || custom.e !== full.e);

  const toggleExpand = (key: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const onCopy = async (): Promise<void> => {
    // TSV 含「产品」列（分块语义在 Excel 里靠它还原）；列序与表头一致（第一百一十四轮）
    const head = ['产品', '平台', '日期', 'RRP', '折后价', '折扣率', 'Offering', '取证链接'];
    const lines = [head.join('\t')];
    for (const r of rows) {
      lines.push(
        [
          r.product,
          r.platform ?? '—',
          r.dateText,
          formatPrice(r.rrp, currency),
          formatPrice(r.price, currency),
          r.discount != null ? fmtPct(r.discount) : '—',
          r.offerText || '—',
          r.url || (r.isLatest ? '—' : ''),
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
      title: '平台',
      dataIndex: 'platform',
      key: 'platform',
      width: 108,
      render: (v: string | null) => (
        <span title={v ?? undefined} style={{ color: color.body, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
          {v ?? '—'}
        </span>
      ),
    },
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
      // 取证（第一百一十四轮，评审）：页面快照图片按钮（历史时点唯一取证方式——
      // 现页价格早已变化，活页不作历史取证）+ 最新时点附商城现页链接
      title: '取证链接',
      dataIndex: 'url',
      key: 'url',
      width: 96,
      render: (v: string, r) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            title="查看该时点的电商页面快照"
            onClick={() =>
              setSnapInfo({
                seriesLabel: r.product,
                shopName: r.shop,
                bucketId: r.bucketId,
                dateText: r.dateText,
                priceText: formatPrice(r.price, currency),
                url: r.url,
              })
            }
            style={{
              border: 0,
              background: 'transparent',
              padding: 0,
              cursor: 'pointer',
              color: color.link,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              font: 'inherit',
              fontSize: 12,
            }}
          >
            <PictureOutlined style={{ fontSize: 13 }} />
            快照
          </button>
          {r.isLatest &&
            (v ? (
              <a
                href={v}
                target="_blank"
                rel="noreferrer"
                title="打开商城现页（新窗口）"
                style={{ color: color.link, display: 'inline-flex', alignItems: 'center', gap: 3 }}
              >
                <ExportOutlined style={{ fontSize: 12 }} />↗
              </a>
            ) : (
              <span style={{ color: color.hairlineStrong }}>—</span>
            ))}
        </span>
      ),
    },
  ];

  return (
    <div>
      {/* 工具行：标题 + 产品筛选下拉 + 时间筛选 + 含缺采周 + 复制为表格
          （第一百一十三轮，评审：chips/行数撤出，改为与顶部筛选器同语言的下拉控件） */}
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
        {/* 产品筛选：多选下拉（默认全开；取消勾选 = 隐藏该产品，清空 = 全隐藏） */}
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
              value={viewSeries.filter((s) => !offKeys.has(s.key)).map((s) => s.key)}
              options={viewSeries.map((s) => ({ value: s.key, label: dedupeSpecText(curveNameOf(s)) }))}
              optionRender={(option) => (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <BrandDot brand={brandByKey.get(String(option.value)) ?? ''} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{option.label}</span>
                </span>
              )}
              tagRender={(tag) => (
                <span
                  title={typeof tag.label === 'string' ? tag.label : undefined}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    height: 18,
                    padding: '0 4px 0 7px',
                    fontSize: 11,
                    lineHeight: '16px',
                    color: color.body,
                    background: color.canvas,
                    border: `1px solid ${color.hairlineStrong}`,
                    borderRadius: radius.pill,
                    whiteSpace: 'nowrap',
                  }}
                >
                  <BrandDot brand={brandByKey.get(String(tag.value)) ?? ''} />
                  {tag.label}
                  {tag.closable && (
                    <CloseOutlined
                      aria-label="取消选择该产品"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        tag.onClose();
                      }}
                      style={{ fontSize: 9, color: color.mute, padding: '0 2px', cursor: 'pointer' }}
                    />
                  )}
                </span>
              )}
              onChange={(vals: string[]) =>
                setOffKeys(new Set(viewSeries.filter((s) => !vals.includes(s.key)).map((s) => s.key)))
              }
              style={{ minWidth: 170, maxWidth: 340 }}
            />
          </ConfigProvider>
        </span>
        {/* 时间筛选：默认跟随上方图查看的时间段；可在完整范围内自选（粒度切换后回到跟随） */}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: color.mute, whiteSpace: 'nowrap' }}>时间</span>
          <ConfigProvider locale={zhCN} theme={filterBarTheme}>
            <DatePicker.RangePicker
              key={granularity}
              size="small"
              aria-label="时间筛选"
              picker={pickerMode}
              format={pickerFormat}
              separator={<span style={{ color: color.mute }}>→</span>}
              prefix={
                <span style={{ color: color.mute, fontSize: 11 }}>{granularityLabel[granularity]}</span>
              }
              suffixIcon={<CalendarOutlined style={{ color: color.mute }} />}
              allowClear={false}
              inputReadOnly
              disabledDate={disabledDate}
              value={pickerValue}
              onChange={onRangePick}
              style={{ width: 216 }}
            />
          </ConfigProvider>
          {customActive && (
            <Button
              type="link"
              size="small"
              onClick={() => setCustom(null)}
              style={{ padding: 0, fontSize: 12, height: 20, whiteSpace: 'nowrap' }}
            >
              对齐图表
            </Button>
          )}
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
      {/* 分块明细：每个产品一个区块（标题 = 品牌点+品牌+型号+配置；第一百一十四轮
          铁律：不标注「我司」——品牌点+品牌名已表达归属），块内小号表格、每块自带
          表头（第一百一十三轮，评审）；整卡 560px 内滚动 */}
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
                borderRadius: radius.control,
                marginBottom: 4,
              }}
            >
              <BrandDot brand={g.series.brand} />
              <span style={{ fontSize: 15, fontWeight: 700, color: color.ink }}>{dedupeSpecText(g.series.label)}</span>
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
                style={{ background: color.canvas }}
              />
            )}
          </section>
        ))}
      </div>
      {/* 页面快照浮窗（第一百一十四轮：取证列图片按钮弹出；居中小弹框） */}
      <SnapshotModal info={snapInfo} onClose={() => setSnapInfo(null)} />
    </div>
  );
}
