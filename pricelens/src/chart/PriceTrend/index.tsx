// ============================================================
// §4.1 图卡内容 + §6 价格走势全家桶编排：
// 第一行 = 左 [档位 chips][+自定义] + 价格类型复选；右 [汇总:平均值|最小值]（仅月/季，写回 state.agg）
// 下方 = YAxisResizer（上下拖柄调 Y 轴 min/max + 齿轮滑杆控步长）> Chart（ECharts+覆盖层）> XBrush（重采样窗口）> PromoTable（促销力度矩阵）
// Y 轴优先级（第二轮口径）：拖柄 manual（冻结 min/max/step）> 档位 chips（应用时清 manual）> 自动；
// 滑杆只控 step（步长变大 → 同高格数下数据占格变少）；切换产品/价格类型/币种 → 回自动。
// 容器高由 Y 模型派生：manual 下 = 格数×TICK_PX + GRID 上下边距，随拖柄增减。
// 数据流 = useFilters().state → SeriesQuery → buildSeries → 窗口切片 → PriceTrend
// 窗口状态为图表内部状态（初值=筛选器范围；范围变化收缩、粒度切换对齐桶边界，§6.5）
// 第三轮口径：XBrush 轨道 = 数据全集时间轴；取数也按全集（数据量小、内存计算），
// 显示仍只切窗口；窗口（箭头/拖柄/平移）越出筛选范围时把 rangeStart/End 极值扩展到窗口端点。
// ============================================================
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { Checkbox, Input, InputNumber, Modal, Segmented, Select } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useFilters } from '../../state/FiltersContext';
import { getCustomTiers, getFxRate, saveCustomTiers, type CustomTierPreset } from '../../state/configStore';
import { CONFIG_CHANGED_EVENT } from '../../state/lplKeys';
import { buildSeries } from '../../dataModel/aggregate';
import type {
  AggMode,
  CurrencyMode,
  Granularity,
  Series,
  SeriesQuery,
  SkuGroupQuery,
} from '../../dataModel/types';
import type { ProductSelection } from '../../state/filtersTypes';
import { color, fontSize, radius, space } from '../../theme/tokens';
import Chart from './Chart';
import XBrush from './XBrush';
import YAxisResizer, { type YManualRange } from './YAxisResizer';
import DrillModal, { type DrillInfo } from './DrillModal';
import {
  GRID,
  computeYAxis,
  convertWindowIds,
  dataBucketRange,
  enumerateBuckets,
  estGridLeft,
  fmtInt,
  gridTopFor,
  normalizeWindow,
  type Bucket,
} from './helpers';
import PromoTable from './PromoTable';

/** §6.1 档位 chips（USD 口径） */
const PRESET_TIERS = ['200-400', '400-600', '600-800', '800-1000', '1000+'] as const;

export default function PriceTrend() {
  const { state, actions } = useFilters();

  // ---- 图表内部状态 ----
  const [tierId, setTierId] = useState<string>('auto'); // 'auto' | 预设区间 | `custom:${name}`
  const [tiers, setTiers] = useState<CustomTierPreset[]>(() => getCustomTiers());
  const [fxTick, setFxTick] = useState(0); // 配置变更后重读参考汇率
  const [yManual, setYManual] = useState<YManualRange | null>(null); // 拖柄手动态（冻结 min/max/step）
  const [sliderScale, setSliderScale] = useState<number>(1);
  const [windowIds, setWindowIds] = useState<[string, string] | null>(null); // null=整个筛选范围
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set()); // 图例卡取消选中的系列（折线隐藏）
  const [drill, setDrill] = useState<DrillInfo | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [customDraft, setCustomDraft] = useState<{ name: string; min: number | null; max: number | null; currency: CurrencyMode }>({
    name: '',
    min: null,
    max: null,
    currency: 'usd',
  });

  const fx = useMemo(() => {
    void fxTick;
    return getFxRate();
  }, [fxTick]);

  // §13 配置变更（参考汇率/自定义档位删除）→ 立即生效
  useEffect(() => {
    const h = (): void => {
      setFxTick((t) => t + 1);
      setTiers(getCustomTiers());
    };
    window.addEventListener(CONFIG_CHANGED_EVENT, h);
    return () => window.removeEventListener(CONFIG_CHANGED_EVENT, h);
  }, []);

  // §5.6/§6.6：切换产品/价格类型/币种后 Y 轴回落自动档（档位回「自动」、滑杆/拖柄复位；
  // manual 值为显示币种口径，币种切换不换算、直接回自动）；图例显隐一并复位
  const yAxisResetKey = JSON.stringify([state.own, state.competitors, state.priceTypes, state.currency]);
  useEffect(() => {
    setTierId('auto');
    setSliderScale(1);
    setYManual(null);
    setHiddenKeys(new Set());
  }, [yAxisResetKey]);

  /** 档位 chips 应用 = 快设 min/max 并清掉拖柄覆盖（§6.6：拖柄再动即覆盖 chips） */
  const applyTier = (id: string): void => {
    setTierId(id);
    setYManual(null);
  };

  // §6.5 联动：粒度切换 → 窗口端点对齐新粒度桶边界（保持同一时间跨度）
  const granRef = useRef(state.granularity);
  useLayoutEffect(() => {
    if (granRef.current === state.granularity) return;
    const prev = granRef.current;
    granRef.current = state.granularity;
    setWindowIds((ids) => (ids ? convertWindowIds(ids, prev, state.granularity) : null));
  }, [state.granularity]);

  // ---- 取数：useFilters().state → SeriesQuery → buildSeries（§7.3 唯一口径） ----
  // 第三轮起按数据全集取数（内存小数据集，成本可忽略）：窗口可在全时间轴上自由平移/拉伸，
  // 越出筛选范围时无需等待重取数；筛选范围只决定窗口的默认值与收缩边界。
  const [dataStart, dataEnd] = useMemo(() => dataBucketRange(state.granularity), [state.granularity]);

  const query: SeriesQuery = useMemo(
    () => ({
      groups: [
        ...state.own.map((g) => ({ ...g, isOwn: true })),
        ...state.competitors.map((g) => ({ ...g, isOwn: false })),
      ],
      granularity: state.granularity,
      startBucket: dataStart,
      endBucket: dataEnd,
      currency: state.currency,
      agg: state.agg,
      platform: state.platform,
    }),
    [state.own, state.competitors, state.granularity, dataStart, dataEnd, state.currency, state.agg, state.platform],
  );

  const allSeries: Series[] = useMemo(() => {
    if (query.groups.length === 0) return [];
    try {
      return buildSeries(query);
    } catch {
      return []; // 空态不崩
    }
  }, [query]);

  // 轨道桶 = 数据全集时间轴（第三轮口径，不再随筛选范围缩小）
  const buckets: Bucket[] = useMemo(
    () => enumerateBuckets(state.granularity, dataStart, dataEnd),
    [state.granularity, dataStart, dataEnd],
  );

  // 窗口渲染期钳入筛选范围：范围缩小时窗口收缩；ids=null = 整个筛选范围
  const win = useMemo(
    () => normalizeWindow(buckets, windowIds, [state.rangeStart, state.rangeEnd]),
    [buckets, windowIds, state.rangeStart, state.rangeEnd],
  );

  // §6.5 窗口内所有桶压满绘图宽度（重采样重绘，无横向滚动条）
  const visSeries: Series[] = useMemo(() => {
    if (win.s > win.e) return [];
    return allSeries
      .map((s) => ({ ...s, points: s.points.slice(win.s, win.e + 1) }))
      .filter((s) => s.points.length > 0);
  }, [allSeries, win]);

  // 图例可见系列（卡片取消选中的不画线；Y 轴自适应随之收缩；卡片/促销表仍显示全部）
  const chartSeries: Series[] = useMemo(
    () => visSeries.filter((s) => !hiddenKeys.has(s.key)),
    [visSeries, hiddenKeys],
  );
  const toggleLegend = (key: string): void => {
    setHiddenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // ---- §6.1 档位 → Y 轴 min/max（显示币种口径换算） ----
  const tierRange = useMemo<{ min: number; max: number | null } | null>(() => {
    if (tierId === 'auto') return null;
    const kUsd = state.currency === 'usd' ? 1 : fx;
    if (tierId.startsWith('custom:')) {
      const t = tiers.find((x) => `custom:${x.name}` === tierId);
      if (!t) return null;
      // 自定义本币档位在 USD 显示态按汇率换算；自定义 USD 档位在本币态按汇率换算
      const k = t.currency === 'usd' ? kUsd : state.currency === 'usd' ? 1 / fx : 1;
      return { min: Math.round(t.min * k), max: Math.round(t.max * k) };
    }
    if (tierId === '1000+') return { min: Math.round(1000 * kUsd), max: null };
    const [a, b] = tierId.split('-').map(Number);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return { min: Math.round(a * kUsd), max: Math.round(b * kUsd) };
  }, [tierId, tiers, state.currency, fx]);

  // 容器高由 Y 模型派生：manual（拖柄）下 = 格数×TICK_PX + 图顶卡片区 + GRID 底边距
  const yCfg = useMemo(
    () => computeYAxis({ series: chartSeries, priceTypes: state.priceTypes, tierRange, manual: yManual, sliderScale }),
    [chartSeries, state.priceTypes, tierRange, yManual, sliderScale],
  );
  // 图顶预留 = 常驻卡片排数（ceil(N/6)）——只随产品选择变化，悬停不变高
  const gridTop = gridTopFor(visSeries.length);
  const chartHeight = yCfg.plotHeight + gridTop + GRID.bottom;
  const gridLeft = estGridLeft(yCfg.max);

  // ---- 下钻（§6.3）：seriesKey → 取数组，单组重查 ----
  const selByKey = useMemo(() => {
    const m = new Map<string, ProductSelection>();
    for (const s of [...state.own, ...state.competitors]) {
      m.set(`${s.modelId}__${s.romram.replace(/\s+/g, '')}`, s);
    }
    return m;
  }, [state.own, state.competitors]);

  const onDrill = (seriesKey: string, bucketId: string): void => {
    const s = allSeries.find((x) => x.key === seriesKey);
    const sel = selByKey.get(seriesKey);
    if (!s || !sel || state.granularity === 'week') return;
    const group: SkuGroupQuery = { modelId: sel.modelId, romram: sel.romram, skuIds: s.skuIds, isOwn: s.isOwn };
    setDrill({
      group,
      label: s.label,
      originGran: state.granularity === 'quarter' ? 'quarter' : 'month',
      originBucket: bucketId,
    });
  };

  const buildRange = (group: SkuGroupQuery, gran: Granularity, startBucket: string, endBucket: string): Series[] => {
    try {
      return buildSeries({
        groups: [group],
        granularity: gran,
        startBucket,
        endBucket,
        currency: state.currency,
        agg: state.agg,
        platform: state.platform,
      });
    } catch {
      return [];
    }
  };

  // ---- 交互 handlers ----
  const setPriceType = (key: 'discounted' | 'rrp', val: boolean): void => {
    const next = { ...state.priceTypes, [key]: val };
    if (!next.discounted && !next.rrp) return; // 至少保留一种价格
    actions.set({ priceTypes: next });
  };

  /**
   * §6.5（第三轮）：窗口的一切改动（箭头步进/双端拖柄/整体平移）统一走这里。
   * 窗口越出筛选范围时，把筛选范围左/右极值扩展到窗口端点（grow-only，从不收缩）——
   * 例：筛选 2026Q2–Q4 按 ‹ → 窗口 2026Q1–Q3，RangePicker 左极值随之变 2026Q1。
   */
  const onWindowChange = (s: number, e: number): void => {
    const bs = buckets[s];
    const be = buckets[e];
    if (!bs || !be) return;
    if (bs.id < state.rangeStart || be.id > state.rangeEnd) {
      actions.set({
        rangeStart: bs.id < state.rangeStart ? bs.id : state.rangeStart,
        rangeEnd: be.id > state.rangeEnd ? be.id : state.rangeEnd,
      });
    }
    setWindowIds([bs.id, be.id]);
  };

  const saveCustomTier = (): void => {
    const { name, min, max, currency } = customDraft;
    if (min == null || max == null || !(min > 0) || !(max > min)) return;
    const t: CustomTierPreset = { name: name.trim() || `我的档位 ${tiers.length + 1}`, min, max, currency };
    const next = [...tiers.filter((x) => x.name !== t.name), t];
    saveCustomTiers(next);
    setTiers(next);
    applyTier(`custom:${t.name}`);
    setCustomOpen(false);
    setCustomDraft({ name: '', min: null, max: null, currency: 'usd' });
  };

  const customValid = customDraft.min != null && customDraft.max != null && customDraft.min > 0 && customDraft.max > customDraft.min;

  // ---- 渲染 ----
  return (
    <div>
      {/* 图内筛选器行（§6.1/§4.1） */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: space.md,
          marginBottom: space.md,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: space.base, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Chip active={tierId === 'auto'} onClick={() => applyTier('auto')} title="随所选线值域自适应（±8%）">
              自动
            </Chip>
            {PRESET_TIERS.map((t) => (
              <Chip
                key={t}
                active={tierId === t}
                onClick={() => applyTier(tierId === t ? 'auto' : t)}
                title={tierTitle(t, state.currency, fx)}
              >
                {t}
              </Chip>
            ))}
            {tiers.length > 0 && <span style={{ color: color.hairline }}>|</span>}
            {tiers.map((t) => (
              <Chip
                key={t.name}
                active={tierId === `custom:${t.name}`}
                onClick={() => applyTier(tierId === `custom:${t.name}` ? 'auto' : `custom:${t.name}`)}
                title={tierTitle(`custom:${t.name}`, state.currency, fx, tiers)}
              >
                {t.name}
              </Chip>
            ))}
            <Chip active={false} onClick={() => setCustomOpen(true)} title="新建自定义档位">
              <PlusOutlined style={{ fontSize: 11, marginRight: 4 }} />
              自定义
            </Chip>
          </div>
          <span style={{ width: 1, height: 18, background: color.hairline }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: space.md }}>
            <Checkbox checked={state.priceTypes.discounted} onChange={(e) => setPriceType('discounted', e.target.checked)}>
              折后价
            </Checkbox>
            <Checkbox checked={state.priceTypes.rrp} onChange={(e) => setPriceType('rrp', e.target.checked)}>
              RRP
            </Checkbox>
          </div>
        </div>
        {/* 数据汇总：仅月/季粒度出现（§6.1），写回 state.agg */}
        {state.granularity !== 'week' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: space.sm, fontSize: fontSize.bodySm, color: color.body }}>
            <span>汇总：</span>
            <Segmented
              size="small"
              value={state.agg}
              onChange={(v) => actions.set({ agg: v as AggMode })}
              options={[
                { label: '平均值', value: 'avg' },
                { label: '最小值', value: 'min' },
              ]}
            />
          </div>
        )}
      </div>

      {/* 图主体（Y 轴上下拖柄调 min/max + 齿轮滑杆控步长；X 刷选条在图表块之下） */}
      <YAxisResizer
        height={chartHeight}
        axisWidth={gridLeft}
        axis={{ min: yCfg.min, max: yCfg.max, interval: yCfg.interval, plotTop: gridTop, plotHeight: yCfg.plotHeight }}
        onManualEnter={(freeze) => setYManual(freeze)}
        onHandle={(next) => setYManual(next)}
        sliderScale={sliderScale}
        onSliderScale={setSliderScale}
      >
        <Chart
          series={chartSeries}
          legendSeries={visSeries}
          hiddenKeys={hiddenKeys}
          onToggleLegend={toggleLegend}
          granularity={state.granularity}
          currency={state.currency}
          priceTypes={state.priceTypes}
          height={chartHeight}
          y={yCfg}
          gridLeft={gridLeft}
          gridTop={gridTop}
          enableDrill={state.granularity !== 'week'}
          enableJump={state.granularity === 'week'}
          enableOffer={state.granularity === 'week'}
          onDrill={onDrill}
          windowKey={`${win.s}:${win.e}`}
          emptyHint={
            visSeries.length > 0 && chartSeries.length === 0
              ? '所有系列已在图例中隐藏，点击顶部图例卡恢复显示'
              : undefined
          }
        />
      </YAxisResizer>
      {/* X 刷选条（窗口状态为图表内部状态；轨道 = 全时间轴） */}
      {buckets.length > 0 && visSeries.length > 0 && (
        <XBrush buckets={buckets} s={win.s} e={win.e} granularity={state.granularity} onChange={onWindowChange} />
      )}

      {/* 促销力度矩阵表（行=产品，列=窗口内每个时间节点，格=相对上市价降幅%） */}
      {visSeries.length > 0 && win.s <= win.e && (
        <PromoTable series={visSeries} currency={state.currency} />
      )}

      {/* 月/季下钻弹窗 */}
      <DrillModal
        info={drill}
        currency={state.currency}
        agg={state.agg}
        priceTypes={state.priceTypes}
        platform={state.platform}
        buildRange={buildRange}
        onClose={() => setDrill(null)}
      />

      {/* 自定义档位弹窗（§6.1）：min/max + 币种下拉 + 名称 → saveCustomTiers */}
      <Modal
        title="自定义价格档位"
        open={customOpen}
        onOk={saveCustomTier}
        onCancel={() => setCustomOpen(false)}
        okText="保存"
        cancelText="取消"
        okButtonProps={{ disabled: !customValid }}
        width={400}
        styles={{ content: { borderRadius: radius.modal } }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: space.md, paddingTop: space.sm }}>
          <Field label="名称">
            <Input
              value={customDraft.name}
              placeholder={`我的档位 ${tiers.length + 1}`}
              onChange={(e) => setCustomDraft((d) => ({ ...d, name: e.target.value }))}
              allowClear
            />
          </Field>
          <div style={{ display: 'flex', gap: space.md }}>
            <Field label="下限" flex>
              <InputNumber
                value={customDraft.min}
                min={0}
                style={{ width: '100%' }}
                onChange={(v) => setCustomDraft((d) => ({ ...d, min: v }))}
              />
            </Field>
            <Field label="上限" flex>
              <InputNumber
                value={customDraft.max}
                min={0}
                style={{ width: '100%' }}
                onChange={(v) => setCustomDraft((d) => ({ ...d, max: v }))}
              />
            </Field>
            <Field label="币种" flex>
              <Select
                value={customDraft.currency}
                onChange={(v) => setCustomDraft((d) => ({ ...d, currency: v }))}
                options={[
                  { value: 'usd', label: 'USD' },
                  { value: 'local', label: '本币' },
                ]}
              />
            </Field>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ---------------- 局部小组件 ----------------

function Chip({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title?: string;
  children: ReactNode;
}) {
  const style: CSSProperties = {
    height: 26,
    padding: '0 12px',
    borderRadius: radius.control,
    border: `1px solid ${active ? color.ink : color.hairline}`,
    background: active ? color.ink : color.canvas,
    color: active ? color.onPrimary : color.body,
    fontSize: fontSize.bodySm,
    lineHeight: '24px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    boxShadow: 'none',
  };
  return (
    <button type="button" title={title} style={style} onClick={onClick}>
      {children}
    </button>
  );
}

function Field({ label, flex, children }: { label: string; flex?: boolean; children: ReactNode }) {
  return (
    <label style={{ flex: flex ? 1 : undefined, display: 'flex', flexDirection: 'column', gap: 4, fontSize: fontSize.caption, color: color.body }}>
      {label}
      {children}
    </label>
  );
}

/** chip 悬浮提示：显示按当前显示币种/参考汇率换算后的锁定范围 */
function tierTitle(id: string, currency: CurrencyMode, fx: number, tiers?: CustomTierPreset[]): string {
  const kUsd = currency === 'usd' ? 1 : fx;
  let r: { min: number; max: number | null } | null = null;
  if (id.startsWith('custom:')) {
    const t = tiers?.find((x) => `custom:${x.name}` === id);
    if (!t) return '锁定 Y 轴 min/max';
    const k = t.currency === 'usd' ? kUsd : currency === 'usd' ? 1 / fx : 1;
    r = { min: Math.round(t.min * k), max: Math.round(t.max * k) };
  } else if (id === '1000+') {
    r = { min: Math.round(1000 * kUsd), max: null };
  } else {
    const [a, b] = id.split('-').map(Number);
    if (Number.isFinite(a) && Number.isFinite(b)) r = { min: Math.round(a * kUsd), max: Math.round(b * kUsd) };
  }
  if (!r) return '随所选线值域自适应（±8%）';
  return r.max == null ? `锁定 Y 轴下限 ${fmtInt(r.min)} 起（按当前显示币种）` : `锁定 Y 轴 ${fmtInt(r.min)} – ${fmtInt(r.max)}（按当前显示币种）`;
}
