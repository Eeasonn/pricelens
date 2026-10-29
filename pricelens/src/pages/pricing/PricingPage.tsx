// ============================================================
// 定价推演页（第一百六十五轮波3，Eason 四点）：①量价证据图全宽、量价看板
// 同款语言（价格折线在上 + 周销柱贴底带 + 参照虚线 + 调价锚点）②调价事件
// 卡按锚点位置对齐到量价图正下方，系数推导（区间/建议/当前取拖柄）同卡收口
// ③全部参数可视化拖柄：大盘同比/区间、成本同比/区间、响应系数、拟定价
// ④撤三方案卡——专门的销量趋势预测图（实际线 + 预估中枢虚线 + P10–P90 带
// + 上一代同期参照），拟定价拖柄即调即算，参数组合「保存方案」成 chips
// 可回滚对比。数据全模拟（mockData），界面克制，出处进抽屉。
// ============================================================
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Button, Drawer, Segmented, Select, Slider, Tooltip } from 'antd';
import PageHeader from '../../components/PageHeader';
import usePageViewState from '../../state/usePageViewState';
import { color, fontSize, radius, shadow, space } from '../../theme/tokens';
import {
  COMP_SCENARIOS,
  COST_DEFAULTS,
  CUR_PRODUCT_STATUS,
  INCENTIVE_RATE,
  MARKET_DEFAULTS,
  MARKET_HISTORY,
  UNCERTAINTY_BAND,
  type CompScenario,
} from './mockData';
import { CostChart, EVIDENCE_GRID, EvidenceChart, ForecastChart, MarketChart } from './SchemeCharts';
import { pricingDetailRows } from './pricingDetail';
import {
  COST_BASE,
  computeScheme,
  costForecast,
  elasticityRange,
  evidenceRows,
  forecastSeries,
  marketForecast,
  productOf,
  suggestedElasticity,
  type PlanContext,
  type Scenario,
  type SchemeResult,
} from './pricingModel';

const CARD: CSSProperties = { background: color.canvas, borderRadius: radius.card, boxShadow: shadow.l1 };

const fmtWan = (v: number): string => `${v.toFixed(1)} 万台`;
const fmtYi = (v: number): string => `$${v.toFixed(2)} 亿`;
const fmtPct = (v: number): string => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
const fmtFactor = (v: number): string => `× ${v.toFixed(3)}`;
const fmtInt = (v: number): string => v.toLocaleString('en-US', { maximumFractionDigits: 0 });

/** 假设来源徽标（固定四种来源文案） */
function SourceTag({ label, hint }: { label: string; hint?: string }) {
  const tag = (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 8px',
        borderRadius: radius.pill, fontSize: fontSize.caption, color: color.body, background: color.canvasSoft2,
      }}
    >
      {label}
    </span>
  );
  return hint ? <Tooltip title={hint}>{tag}</Tooltip> : tag;
}

/** 卡片头：标题 + 来源徽标 + 右侧插槽 */
function CardHead({ title, source, hint, extra }: { title: string; source?: string; hint?: string; extra?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space.md, paddingBottom: space.xs, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: space.sm, minWidth: 0 }}>
        <span style={{ fontSize: fontSize.bodySm, fontWeight: 600, color: color.ink, whiteSpace: 'nowrap' }}>{title}</span>
        {source && <SourceTag label={source} hint={hint} />}
      </div>
      {extra}
    </div>
  );
}

/** 可视化拖柄参数行：名称 + Slider + 数值 */
function SliderRow({
  label, value, min, max, step, onChange, format, sliderWidth,
}: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format: (v: number) => string; sliderWidth?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: space.sm, minWidth: 0 }}>
      <span style={{ fontSize: fontSize.caption, color: color.mute, whiteSpace: 'nowrap', width: 78 }}>{label}</span>
      <Slider
        style={{ flex: 1, minWidth: 0, margin: '0 2px' }} value={value} min={min} max={max} step={step}
        onChange={(v) => onChange(v)} tooltip={{ formatter: (v) => format(v ?? value) }} styles={{ handle: { width: 12, height: 12 } }}
      />
      <span style={{ fontSize: fontSize.caption, color: color.ink, fontWeight: 600, fontVariantNumeric: 'tabular-nums', width: sliderWidth ?? 48, textAlign: 'right', whiteSpace: 'nowrap' }}>
        {format(value)}
      </span>
    </div>
  );
}

/** 单个季度/月节点的可视化拖柄。节点值是直接输入，避免把所有变化压成一个同比参数。 */
function NodeSlider({
  label, value, min, max, step, suffix, prefix, onChange,
}: { label: string; value: number; min: number; max: number; step: number; suffix: string; prefix?: boolean; onChange: (v: number) => void }) {
  return (
    <div style={{ minWidth: 0, padding: '7px 8px', border: `1px solid ${color.hairline}`, borderRadius: radius.control, background: color.canvasSoft }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'baseline', marginBottom: 2 }}>
        <span style={{ fontSize: fontSize.caption, color: color.mute, fontVariantNumeric: 'tabular-nums' }}>{label}</span>
        <span style={{ fontSize: fontSize.caption, color: color.ink, fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{prefix ? suffix : ''}{Math.round(value)}{prefix ? '' : suffix}</span>
      </div>
      <Slider
        value={value} min={min} max={max} step={step} onChange={(v) => onChange(Number(v))}
        tooltip={{ formatter: (v) => `${prefix ? suffix : ''}${Math.round(Number(v ?? value))}${prefix ? '' : suffix}` }}
        styles={{ handle: { width: 12, height: 12 }, rail: { background: '#dfe5ee' }, track: { background: color.link } }}
      />
    </div>
  );
}

/** 读数（点击展开依据抽屉） */
function Metric({ label, value, sub, onOpen }: { label: string; value: string; sub?: string; onOpen: () => void }) {
  return (
    <div style={{ minWidth: 0, cursor: 'pointer' }} onClick={onOpen} role="button" tabIndex={0} onKeyDown={onOpen}>
      <div style={{ fontSize: fontSize.caption, color: color.mute, whiteSpace: 'nowrap' }}>{label}</div>
      <div style={{ fontSize: fontSize.bodyMd, color: color.ink, fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
        {value}
      </div>
      {sub != null && <div style={{ fontSize: fontSize.caption, color: color.mute, whiteSpace: 'nowrap' }}>{sub}</div>}
    </div>
  );
}

/** 依据抽屉行：左名右值 */
function ChainRow({ name, value, strong }: { name: string; value: string; strong?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: space.md, padding: '5px 0' }}>
      <span style={{ fontSize: fontSize.bodySm, color: color.body }}>{name}</span>
      <span
        style={{
          fontSize: fontSize.bodySm, color: color.ink, fontWeight: strong ? 700 : 600,
          fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
        }}
      >
        {value}
      </span>
    </div>
  );
}

function DrawerSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ marginTop: space.lg }}>
      <div style={{ fontSize: fontSize.bodySm, fontWeight: 600, color: color.ink, paddingBottom: space.xs, borderBottom: `1px solid ${color.hairline}` }}>
        {title}
      </div>
      {children}
    </div>
  );
}

/** 保存的方案（参数快照 + 当时读数） */
interface SavedScheme {
  id: number;
  label: string;
  productKey: string;
  scenario: Scenario;
  price: number;
  marketYoy: number;
  marketBand: number;
  costYoy: number;
  costBand: number;
  elasticity: number;
  comp: CompScenario;
  soWan: number;
  p10Wan: number;
  p90Wan: number;
  marginYi: number;
  marketNodes?: Record<string, number>;
  costNodes?: Record<string, number>;
  weeklyPrices?: number[];
}

// 抽屉竞品行经 chain.compChangePct 反查标签
const compKeyOf = (r: SchemeResult): CompScenario =>
  COMP_SCENARIOS.find((s) => s.changePct === r.chain.compChangePct)?.key ?? 'hold';

function EvidenceDrawer({
  result, marketYoYPct, costYoyPct, elasticity, productKey, onClose,
}: {
  result: SchemeResult | null; marketYoYPct: number; costYoyPct: number; elasticity: number; productKey: string; onClose: () => void;
}) {
  const r = result;
  const product = productOf(productKey);
  const range = r ? elasticityRange(product, r.chain.scenario) : null;
  return (
    <Drawer open={r != null} onClose={onClose} width={480} title={r ? `当前测算 · 拟定价 $${fmtInt(r.scheme.price)} · 依据` : ''}>
      {r && (
        <div style={{ paddingBottom: space.lg }}>
          <DrawerSection title="首年预期 SO">
            {r.chain.scenario === 'post' && r.chain.curTotalWan != null && (
              <ChainRow name={`本品已销（${product.cur.weeks.length} 周实际）`} value={fmtWan(r.chain.curTotalWan)} />
            )}
            {r.chain.scenario === 'post' && r.chain.relFactor != null && r.chain.prevRemainWan != null && r.chain.remainBaseWan != null && (
              <ChainRow
                name={`上一代同期剩余 ${fmtWan(r.chain.prevRemainWan)} × 相对幅度 ${r.chain.relFactor.toFixed(2)}（本品较上一代同期）`}
                value={fmtWan(r.chain.remainBaseWan)}
              />
            )}
            {r.chain.scenario === 'post' && <ChainRow name="剩余周再乘以下三项系数" value="" />}
            {r.chain.scenario === 'pre' && (
              <ChainRow name={`上一代首年 SO（${product.prev.name} · 52 周实际）`} value={fmtWan(r.chain.prevTotalWan)} />
            )}
            <ChainRow name={`大盘系数（大盘预估卡 · 未来四季同比 ${fmtPct(marketYoYPct)}）`} value={fmtFactor(r.chain.marketFactor)} />
            <ChainRow
              name={`价格响应（较${r.chain.scenario === 'pre' ? '上一代开盘' : '本品现价'} ${fmtPct(r.chain.priceDeltaPct)} · 系数 ${elasticity}）`}
              value={fmtFactor(r.chain.priceFactor)}
            />
            <ChainRow
              name={`竞品情景（${COMP_SCENARIOS.find((s) => s.key === compKeyOf(r))?.label ?? ''}${r.chain.compChangePct !== 0 ? ` ${fmtPct(r.chain.compChangePct)}` : ''}）`}
              value={fmtFactor(r.chain.compFactor)}
            />
            <ChainRow
              strong
              name="首年预期 SO"
              value={`${fmtWan(r.firstYearSoWan)}（区间 ${r.p10Wan.toFixed(1)}–${r.p90Wan.toFixed(1)} · ±${Math.round(UNCERTAINTY_BAND * 100)}%）`}
            />
          </DrawerSection>
          <DrawerSection title="销毛">
            <ChainRow name={`单台销毛（上市月）= 拟定价 ×（1−激励 ${Math.round(INCENTIVE_RATE * 100)}%）− 上市成本 $${r.chain.launchCost}`} value={`$${r.launchUnitMargin}`} />
            <ChainRow name={`首年销毛贡献（按成本预估曲线 $${r.chain.launchCost} → $${r.chain.yearEndCost} 逐周加总）`} value={fmtYi(r.marginTotalYi)} />
          </DrawerSection>
          <DrawerSection title={`价格响应系数来源（${r.chain.scenario === 'pre' ? '上一代 3 次调价' : '本品 2 次 + 上一代 3 次'}）`}>
            {evidenceRows(product, r.chain.scenario).map(({ group, event }) => (
              <ChainRow
                key={group + event.week}
                name={`${group === 'cur' ? '本品' : '上一代'} ${event.anchor} W${event.week} ${fmtPct(event.changePct)} → 后 ${event.window} 周 ${fmtPct(event.soPct)}（${event.context} · 归因 ${fmtPct(event.attributedPct)}）`}
                value={(Math.abs(event.attributedPct / event.changePct)).toFixed(2)}
              />
            ))}
            {range && (
              <div style={{ fontSize: fontSize.caption, color: color.mute, paddingTop: space.xs }}>
                参照区间 {range.min}–{range.max} · 当前取 {elasticity} · 成本同比 {fmtPct(costYoyPct)}（成本预估卡）
              </div>
            )}
          </DrawerSection>
          <div style={{ marginTop: space.xl, fontSize: fontSize.caption, color: color.mute }}>
            模拟数据演示 · 公式与口径随真实数据接入替换
          </div>
        </div>
      )}
    </Drawer>
  );
}

export default function PricingPage() {
  const [productKey, setProductKey] = usePageViewState<string>('pricing.product', () => 'std');
  const [scenario, setScenario] = usePageViewState<Scenario>('pricing.scenario', () => 'pre');
  const [comp, setComp] = usePageViewState<CompScenario>('pricing.comp', () => 'hold');
  const [marketYoy, setMarketYoy] = usePageViewState<number>('pricing.marketYoy', () => MARKET_DEFAULTS.yoyPct);
  const [marketBand, setMarketBand] = usePageViewState<number>('pricing.marketBand', () => MARKET_DEFAULTS.bandPct);
  const [costYoy, setCostYoy] = usePageViewState<number>('pricing.costYoy', () => COST_DEFAULTS.yoyPct);
  const [costBand, setCostBand] = usePageViewState<number>('pricing.costBand', () => COST_DEFAULTS.bandPct);
  const [marketNodeEdits, setMarketNodeEdits] = usePageViewState<Record<string, number>>('pricing.marketNodes', () => ({}));
  const [costNodeEdits, setCostNodeEdits] = usePageViewState<Record<string, number>>('pricing.costNodes', () => ({}));
  const [elasticityOverride, setElasticityOverride] = usePageViewState<number | null>('pricing.elasticity', () => null);
  const [priceEdits, setPriceEdits] = usePageViewState<Record<string, number>>('pricing.prices', () => ({}));
  const [weeklyPriceEdits, setWeeklyPriceEdits] = usePageViewState<Record<string, number[]>>('pricing.weeklyPrices', () => ({}));
  const [saved, setSaved] = usePageViewState<SavedScheme[]>('pricing.saved', () => []);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const restoringRef = useRef(false);

  const product = productOf(productKey);
  const suggested = suggestedElasticity(product, scenario);
  const elasticity = elasticityOverride ?? suggested;
  const priceKey = `${productKey}.${scenario}`;
  const price = priceEdits[priceKey] ?? product.schemes[scenario][1].price;
  const weeklyPriceKey = priceKey;
  const weeklyPrices = useMemo(() => {
    const savedPath = weeklyPriceEdits[weeklyPriceKey];
    return Array.from({ length: 52 }, (_, week) => {
      if (savedPath?.[week] != null) return savedPath[week];
      if (scenario === 'post' && week < product.cur.weeks.length) return product.cur.weeks[week].asp;
      return price;
    });
  }, [weeklyPriceEdits, weeklyPriceKey, scenario, product, price]);

  // 换产品/换场景后，系数回到该证据集的建议值（恢复保存方案时跳过一次）
  useEffect(() => {
    if (restoringRef.current) {
      restoringRef.current = false;
      return;
    }
    setElasticityOverride(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productKey, scenario]);

  const fcMarketBase = useMemo(() => marketForecast(marketYoy, marketBand), [marketYoy, marketBand]);
  const fcMarket = useMemo(() => fcMarketBase.map((point) => {
    const mid = marketNodeEdits[point.label] ?? point.mid;
    return { ...point, mid, low: Math.round(mid * (1 - marketBand / 100) * 10) / 10, high: Math.round(mid * (1 + marketBand / 100) * 10) / 10 };
  }), [fcMarketBase, marketNodeEdits, marketBand]);
  const fcCostBase = useMemo(() => costForecast(costYoy, costBand), [costYoy, costBand]);
  const fcCost = useMemo(() => fcCostBase.map((point) => {
    const mid = costNodeEdits[point.label] ?? point.mid;
    return { ...point, mid, low: Math.round(mid * (1 - costBand / 100)), high: Math.round(mid * (1 + costBand / 100)) };
  }), [fcCostBase, costNodeEdits, costBand]);

  const ctx: PlanContext = useMemo(
    () => ({
      scenario, marketYoYPct: marketYoy, costYoyPct: costYoy, elasticity, comp, weeklyPrices,
      marketQuarterValues: fcMarket.map((point) => point.mid),
      costMonthValues: [COST_BASE, ...fcCost.map((point) => point.mid)],
    }),
    [scenario, marketYoy, costYoy, elasticity, comp, weeklyPrices, fcMarket, fcCost],
  );
  const result = useMemo(
    () => computeScheme({ key: 'W', name: '当前测算', tagline: '', price }, ctx, product),
    [price, ctx, product],
  );
  const fSeries = useMemo(() => forecastSeries(ctx, product, price), [ctx, product, price]);
  const detailRows = useMemo(() => pricingDetailRows(ctx, product, price), [ctx, product, price]);

  const setPrice = (v: number): void => {
    setPriceEdits({ ...priceEdits, [priceKey]: v });
    setWeeklyPriceEdits((prev) => ({
      ...prev,
      [weeklyPriceKey]: weeklyPrices.map((current, week) => scenario === 'post' && week < product.cur.weeks.length ? current : v),
    }));
  };
  const setWeekPrice = (week: number, value: number): void => {
    const next = [...weeklyPrices];
    next[week] = value;
    setWeeklyPriceEdits({ ...weeklyPriceEdits, [weeklyPriceKey]: next });
  };
  const resetWeeklyPrices = (): void => {
    const next = { ...weeklyPriceEdits };
    delete next[weeklyPriceKey];
    setWeeklyPriceEdits(next);
  };
  const resetAll = (): void => {
    setMarketYoy(MARKET_DEFAULTS.yoyPct);
    setMarketBand(MARKET_DEFAULTS.bandPct);
    setCostYoy(COST_DEFAULTS.yoyPct);
    setCostBand(COST_DEFAULTS.bandPct);
    setMarketNodeEdits({});
    setCostNodeEdits({});
    setComp('hold');
    setElasticityOverride(null);
    setPriceEdits({});
    setWeeklyPriceEdits({});
  };
  const saveScheme = (): void => {
    const id = Date.now();
    setSaved([
      ...saved.slice(-7),
      {
        id, label: `方案 ${saved.length + 1}`, productKey, scenario, price,
        marketYoy, marketBand, costYoy, costBand, elasticity, comp,
        soWan: result.firstYearSoWan, p10Wan: result.p10Wan, p90Wan: result.p90Wan, marginYi: result.marginTotalYi,
        marketNodes: { ...marketNodeEdits }, costNodes: { ...costNodeEdits }, weeklyPrices: [...weeklyPrices],
      },
    ]);
  };
  const restoreScheme = (s: SavedScheme): void => {
    if (s.productKey !== productKey || s.scenario !== scenario) restoringRef.current = true;
    setProductKey(s.productKey);
    setScenario(s.scenario);
    setMarketYoy(s.marketYoy);
    setMarketBand(s.marketBand);
    setCostYoy(s.costYoy);
    setCostBand(s.costBand);
    setMarketNodeEdits(s.marketNodes ?? {});
    setCostNodeEdits(s.costNodes ?? {});
    setComp(s.comp);
    setElasticityOverride(s.elasticity);
    setPriceEdits((prev) => ({ ...prev, [`${s.productKey}.${s.scenario}`]: s.price }));
    setWeeklyPriceEdits((prev) => {
      const key = `${s.productKey}.${s.scenario}`;
      const next = { ...prev };
      if (s.weeklyPrices) next[key] = [...s.weeklyPrices];
      else delete next[key];
      return next;
    });
  };

  const marketSum = fcMarket.reduce((s, f) => s + f.mid, 0);
  const marketNodeYoy = (marketSum / MARKET_HISTORY.slice(-4).reduce((s, point) => s + point.value, 0) - 1) * 100;
  const range = elasticityRange(product, scenario);
  const anchorLabel = scenario === 'pre' ? `较上一代开盘 ${fmtPct(result.chain.priceDeltaPct)}` : `较本品现价 ${fmtPct(result.chain.priceDeltaPct)}`;
  const nWeeks = scenario === 'pre' ? 52 : product.cur.weeks.length;
  const stripEvents = scenario === 'pre' ? product.prev.events : product.cur.events;
  const comparePoints = [0, 6, 13, 26, 39, 51].map((week) => {
    const current = fSeries.actual[week] ?? fSeries.center[week] ?? 0;
    const previous = fSeries.prevRef[week] ?? 0;
    return { week, current, previous, delta: previous ? (current / previous - 1) * 100 : 0 };
  });

  return (
    <div style={{ minWidth: 1280, minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <PageHeader />
      <main style={{ flex: 1, padding: space.lg, display: 'flex', flexDirection: 'column', gap: space.base, minWidth: 0 }}>
        {/* 页头：标题 + 模拟徽章 ｜ 产品 / 场景 / 竞品 / 重置 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space.base, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: space.md }}>
            <span style={{ fontSize: fontSize.displaySm, fontWeight: 600, color: color.ink }}>上市定价推演</span>
            <span
              style={{
                display: 'inline-flex', alignItems: 'center', height: 22, padding: '0 10px', borderRadius: radius.pill,
                fontSize: fontSize.caption, fontWeight: 600, color: color.ink, background: '#ffefcf', border: '1px solid #f5a623',
              }}
            >
              模拟数据
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
            <Select
              style={{ width: 150 }} size="small" value={productKey}
              options={[{ value: 'std', label: productOf('std').name }, { value: 'max', label: productOf('max').name }]}
              onChange={setProductKey}
            />
            <Segmented
              size="small" value={scenario}
              options={[
                { value: 'pre', label: `上市前推演 · ${CUR_PRODUCT_STATUS.pre}` },
                { value: 'post', label: `上市后滚动 · ${CUR_PRODUCT_STATUS.post}` },
              ]}
              onChange={(v) => setScenario(v as Scenario)}
            />
            <Select
              style={{ width: 128 }} size="small" value={comp}
              options={COMP_SCENARIOS.map((s) => ({ value: s.key as CompScenario, label: `竞品${s.label}${s.changePct !== 0 ? ` ${fmtPct(s.changePct)}` : ''}` }))}
              onChange={setComp}
            />
            <Button size="small" onClick={resetAll}>重置</Button>
          </div>
        </div>

        {/* 证据行 1：大盘 + 成本（拖柄可调） */}
        <div style={{ display: 'flex', gap: space.lg, minHeight: 390 }}>
          <div style={{ ...CARD, flex: 1, minWidth: 0, padding: `${space.lg}px`, display: 'flex', flexDirection: 'column', gap: space.sm }}>
            <CardHead
              title="大盘 · 分价格档容量" source="外部预估"
              hint="季度容量为示例市场分价格档口径；预估带随下方拖柄调整，方案测算的大盘系数即取此同比"
              extra={<span style={{ fontSize: fontSize.caption, color: color.mute, whiteSpace: 'nowrap' }}>预估四季合计 {fmtInt(marketSum)} 万部（节点综合 {fmtPct(marketNodeYoy)}）</span>}
            />
            <div style={{ flex: 1, minHeight: 190 }}><MarketChart forecast={fcMarket} /></div>
            <SliderRow label="未来四季同比" value={marketYoy} min={-40} max={20} step={1} onChange={setMarketYoy} format={(v) => `${fmtPct(v)}`} />
            <SliderRow label="预估区间" value={marketBand} min={0} max={30} step={1} onChange={setMarketBand} format={(v) => `±${v}%`} />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: space.xs, margin: `${space.sm}px 0 ${space.xs}px` }}>
                <span style={{ fontSize: fontSize.caption, color: color.body, fontWeight: 600 }}>季度节点</span>
                <span style={{ fontSize: fontSize.caption, color: color.mute }}>拖动任一 Q，单独改变该季容量</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: space.xs }}>
                {fcMarket.map((point) => (
                  <NodeSlider key={point.label} label={point.label} value={point.mid} min={Math.round(point.mid * 0.7)} max={Math.round(point.mid * 1.3)} step={1} suffix="万" onChange={(v) => setMarketNodeEdits({ ...marketNodeEdits, [point.label]: v })} />
                ))}
              </div>
            </div>
          </div>
          <div style={{ ...CARD, flex: 1, minWidth: 0, padding: `${space.lg}px`, display: 'flex', flexDirection: 'column', gap: space.sm }}>
            <CardHead
              title="成本 · 单台全成本" source="产品线"
              hint="月度成本为产品线口径；预估带随下方拖柄调整，方案按此曲线逐周计销毛"
              extra={<span style={{ fontSize: fontSize.caption, color: color.mute, whiteSpace: 'nowrap' }}>上市月 ${COST_BASE} → 12 月后 ${fmtInt(fcCost[fcCost.length - 1].mid)}</span>}
            />
            <div style={{ flex: 1, minHeight: 190 }}><CostChart forecast={fcCost} /></div>
            <SliderRow label="未来 12 月同比" value={costYoy} min={-20} max={30} step={1} onChange={setCostYoy} format={(v) => `${fmtPct(v)}`} />
            <SliderRow label="预估区间" value={costBand} min={0} max={30} step={1} onChange={setCostBand} format={(v) => `±${v}%`} />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: space.xs, margin: `${space.sm}px 0 ${space.xs}px` }}>
                <span style={{ fontSize: fontSize.caption, color: color.body, fontWeight: 600 }}>月度节点</span>
                <span style={{ fontSize: fontSize.caption, color: color.mute }}>拖动任一月份，销毛按周插值</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: space.xs }}>
                {fcCost.map((point) => (
                  <NodeSlider key={point.label} label={point.label.slice(3)} value={point.mid} min={Math.round(point.mid - 100)} max={Math.round(point.mid + 100)} step={1} suffix="$" prefix onChange={(v) => setCostNodeEdits({ ...costNodeEdits, [point.label]: v })} />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 证据行 2：量价证据图（全宽 · 量价看板语言）+ 调价事件卡对齐锚点 + 系数拖柄 */}
        <div style={{ ...CARD, padding: `${space.md}px ${space.lg}px ${space.sm}px`, display: 'flex', flexDirection: 'column' }}>
          <CardHead
            title={scenario === 'pre' ? `上一代同期参照（${product.prev.name} · 52 周）` : `本品上市以来（${product.cur.name} · ${product.cur.weeks.length} 周）`}
            source={scenario === 'pre' ? '上一代' : '本品实际'}
            hint="成交价折线 + 周销柱贴底带（量价看板同款）；虚线锚点①②③为调价事件，对应下方事件卡"
          />
          <div style={{ height: 250, minWidth: 0 }}><EvidenceChart product={product} scenario={scenario} /></div>
          {/* 事件卡按锚点周龄横向对齐（与图 grid 左右留白一致） */}
          <div style={{ position: 'relative', height: 66, margin: `0 ${EVIDENCE_GRID.right}px` }}>
            {stripEvents.map((e) => (
              <div
                key={e.week}
                style={{
                  position: 'absolute', left: `${(e.week / (nWeeks - 1)) * 100}%`, top: 4, transform: 'translateX(-50%)',
                  display: 'flex', flexDirection: 'column', gap: 1, padding: '3px 8px', whiteSpace: 'nowrap',
                  border: `1px solid ${color.hairline}`, borderRadius: radius.control, background: color.canvas,
                }}
              >
                <span style={{ fontSize: fontSize.caption, color: color.ink, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                  {e.anchor} W{e.week} {fmtPct(e.changePct)} → 后 {e.window} 周 {fmtPct(e.soPct)}
                </span>
                <span style={{ fontSize: fontSize.caption, color: color.mute, fontVariantNumeric: 'tabular-nums' }}>
                  {e.context} · 归因 {fmtPct(e.attributedPct)} · 系数 {(Math.abs(e.attributedPct / e.changePct)).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: space.md, paddingTop: 2 }}>
            <span style={{ fontSize: fontSize.caption, color: color.mute, whiteSpace: 'nowrap' }}>
              参照区间 {range.min}–{range.max} · 建议 {suggested}（{scenario === 'pre' ? '上一代均值' : '本品均值'}）
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: space.sm, flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: fontSize.caption, color: color.mute, whiteSpace: 'nowrap' }}>价格响应系数</span>
              <Slider
                style={{ flex: 1, minWidth: 0, margin: '0 2px', maxWidth: 320 }} value={elasticity} min={0.8} max={2.6} step={0.05}
                onChange={(v) => setElasticityOverride(v)} tooltip={{ formatter: (v) => String(v) }}
              />
              <span style={{ fontSize: fontSize.caption, color: color.ink, fontWeight: 600, fontVariantNumeric: 'tabular-nums', width: 32, textAlign: 'right' }}>
                {elasticity.toFixed(2)}
              </span>
            </div>
            <span style={{ fontSize: fontSize.caption, color: color.mute, whiteSpace: 'nowrap' }}>来源：历史复盘</span>
          </div>
        </div>

        {/* 决策行：销量趋势预测图（拟定价拖柄即调即算）+ 参数/保存方案 */}
        <div style={{ display: 'flex', gap: space.lg, flex: 1, minHeight: 360 }}>
          <div style={{ ...CARD, flex: 3, minWidth: 0, padding: `${space.md}px ${space.lg}px ${space.sm}px`, display: 'flex', flexDirection: 'column' }}>
            <CardHead
              title="销量趋势预测"
              source="测算"
              hint="实际周销（实线）+ 预估中枢（虚线）与 P10–P90 区间带；灰线为上一代同期参照；随右侧拟定价与各证据卡拖柄即时重画"
              extra={<span style={{ fontSize: fontSize.caption, color: color.mute, whiteSpace: 'nowrap' }}>区间 ±{Math.round(UNCERTAINTY_BAND * 100)}%</span>}
            />
            <div style={{ flex: 1, minHeight: 0 }}><ForecastChart series={fSeries} /></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: space.sm, flexWrap: 'wrap', padding: `${space.sm}px ${space.md}px`, borderRadius: radius.control, background: color.canvasSoft, border: `1px solid ${color.hairline}` }}>
              <span style={{ fontSize: fontSize.caption, color: color.body, fontWeight: 600, whiteSpace: 'nowrap' }}>同期关系</span>
              <span style={{ fontSize: fontSize.caption, color: color.mute }}>蓝线 = 本品实际/预测，灰线 = 上一代同期基线；差异只展示，不替你下结论</span>
              <div style={{ display: 'flex', gap: space.sm, flexWrap: 'wrap', marginLeft: 'auto' }}>
                {comparePoints.map((point) => (
                  <span key={point.week} style={{ fontSize: fontSize.caption, color: point.delta >= 0 ? color.link : color.error, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                    W{point.week} {fmtPct(point.delta)}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div style={{ ...CARD, flex: 1.2, minWidth: 300, padding: `${space.md}px ${space.lg}px`, display: 'flex', flexDirection: 'column', gap: space.sm }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: space.sm }}>
              <span style={{ fontSize: fontSize.caption, color: color.mute }}>拟定价</span>
              <span style={{ fontSize: fontSize.displaySm, fontWeight: 700, color: color.ink, fontVariantNumeric: 'tabular-nums' }}>${fmtInt(price)}</span>
              <span style={{ fontSize: fontSize.caption, color: color.mute }}>{anchorLabel}</span>
            </div>
            <Slider
              value={price} min={799} max={1499} step={10}
              onChange={setPrice} tooltip={{ formatter: (v) => '$' + fmtInt(Number(v)) }}
              marks={{ 999: '', 1099: { label: '$1,099', style: { fontSize: 10, color: color.mute } }, 1249: '' }}
            />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: `${space.xs}px ${space.base}px`, paddingTop: space.xs }}>
              <Metric label="首年预期 SO" value={fmtWan(result.firstYearSoWan)} sub={`区间 ${result.p10Wan.toFixed(1)}–${result.p90Wan.toFixed(1)} 万台`} onOpen={() => setDrawerOpen(true)} />
              <Metric label="单台销毛 · 上市月" value={`$${result.launchUnitMargin}`} onOpen={() => setDrawerOpen(true)} />
              <Metric label="首年销毛贡献" value={fmtYi(result.marginTotalYi)} onOpen={() => setDrawerOpen(true)} />
              <Metric label="较上一代同期 SO" value={fmtPct(result.vsPrevSoPct)} onOpen={() => setDrawerOpen(true)} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: space.xs }}>
              <span style={{ fontSize: fontSize.caption, color: color.mute }}>已保存 {saved.length} 个方案</span>
              <Button size="small" type="primary" onClick={saveScheme}>保存方案</Button>
            </div>
            {saved.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.xs, paddingTop: 2, maxHeight: 96, overflowY: 'auto' }}>
                {saved.map((s) => (
                  <span
                    key={s.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => restoreScheme(s)}
                    onKeyDown={() => restoreScheme(s)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6, height: 24, padding: '0 4px 0 10px',
                      borderRadius: radius.pill, fontSize: fontSize.caption, color: color.body,
                      background: color.canvas, border: `1px solid ${color.hairline}`, cursor: 'pointer',
                      fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
                    }}
                  >
                    {s.label} · ${fmtInt(s.price)} · {s.soWan.toFixed(1)}万 · {fmtYi(s.marginYi)}
                    <span
                      onClick={(ev) => { ev.stopPropagation(); setSaved(saved.filter((x) => x.id !== s.id)); }}
                      style={{ display: 'grid', placeItems: 'center', width: 16, height: 16, borderRadius: 999, color: color.mute, fontSize: 11 }}
                    >
                      ✕
                    </span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ ...CARD, padding: `${space.lg}px`, display: 'flex', flexDirection: 'column', gap: space.md }}>
          <CardHead
            title="周度明细 · 价格 × 销量 × 上一代同期"
            source="可编辑"
            hint="每一周独立拖柄都会重算销量、区间和销毛；已发生周保留实际价格，预测周可直接调整。"
            extra={(
              <div style={{ display: 'flex', alignItems: 'center', gap: space.md }}>
                <span style={{ fontSize: fontSize.caption, color: color.mute }}>共 52 周 · 灰色列为上一代同期基线 · 表内滚动查看</span>
                <Button size="small" onClick={resetWeeklyPrices}>恢复统一拟定价</Button>
              </div>
            )}
          />
          <div style={{ overflow: 'auto', maxHeight: 420, border: `1px solid ${color.hairline}`, borderRadius: radius.control }}>
            <table style={{ width: '100%', minWidth: 1120, borderCollapse: 'collapse', fontSize: fontSize.bodySm }}>
              <thead>
                <tr style={{ position: 'sticky', top: 0, zIndex: 1, background: color.canvasSoft2, color: color.mute, textAlign: 'left' }}>
                  {['周次', '季 / 月', '模拟价格（每周拖柄）', '销量（千台）', '上一代同期（千台）', '同期差异', '成本', '单台销毛', '累计 SO', '调价/口径'].map((h) => (
                    <th key={h} style={{ padding: `${space.sm}px ${space.md}px`, borderBottom: `1px solid ${color.hairline}`, fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {detailRows.map((row) => {
                  const week = row.week;
                  const weekLabel = `W${week}`;
                  const sales = row.soWan * 10;
                  const prev = row.previousSoWan * 10;
                  const delta = row.vsPreviousPct;
                  const historical = row.phase === 'actual';
                  const event = row.event;
                  return (
                    <tr key={weekLabel} style={{ borderBottom: `1px solid ${color.hairline}`, background: week % 2 ? color.canvasSoft : color.canvas }}>
                      <td style={{ padding: `${space.sm}px ${space.md}px`, color: color.ink, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{weekLabel}{historical ? ' · 已发生' : ' · 预测'}</td>
                      <td style={{ padding: `${space.sm}px ${space.md}px`, color: color.mute, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{row.quarter} · {row.month}</td>
                      <td style={{ padding: `${space.sm}px ${space.md}px` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: space.md, minWidth: 250 }}>
                          <Slider
                            style={{ width: 180, margin: 0 }} min={799} max={1499} step={1}
                            value={historical ? row.price : weeklyPrices[week]} disabled={historical} onChange={(v) => setWeekPrice(week, Number(v))}
                            tooltip={{ formatter: (v) => `$${fmtInt(Number(v ?? weeklyPrices[week]))}` }}
                          />
                          <span style={{ color: historical ? color.mute : color.ink, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>${fmtInt(historical ? row.price : weeklyPrices[week])}</span>
                          <span style={{ color: color.mute, fontSize: fontSize.caption }}>vs 上代 ${fmtInt(row.previousPrice)}</span>
                        </div>
                      </td>
                      <td style={{ padding: `${space.sm}px ${space.md}px`, color: color.ink, fontVariantNumeric: 'tabular-nums' }}>{sales.toFixed(1)}</td>
                      <td style={{ padding: `${space.sm}px ${space.md}px`, color: color.mute, fontVariantNumeric: 'tabular-nums' }}>{prev.toFixed(1)}</td>
                      <td style={{ padding: `${space.sm}px ${space.md}px`, color: delta >= 0 ? color.link : color.error, fontVariantNumeric: 'tabular-nums' }}>{fmtPct(delta)}</td>
                      <td style={{ padding: `${space.sm}px ${space.md}px`, color: color.mute, fontVariantNumeric: 'tabular-nums' }}>${Math.round(row.cost)}</td>
                      <td style={{ padding: `${space.sm}px ${space.md}px`, color: row.unitMargin >= 0 ? color.ink : color.error, fontVariantNumeric: 'tabular-nums' }}>${Math.round(row.unitMargin)}</td>
                      <td style={{ padding: `${space.sm}px ${space.md}px`, color: color.ink, fontVariantNumeric: 'tabular-nums' }}>{row.cumulativeSoWan.toFixed(1)} 万</td>
                      <td style={{ padding: `${space.sm}px ${space.md}px`, color: event ? color.ink : color.mute, fontWeight: event ? 600 : 400, whiteSpace: 'nowrap' }}>{event ?? (historical ? '实际' : '预测')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>
      <EvidenceDrawer
        result={drawerOpen ? result : null} marketYoYPct={marketYoy} costYoyPct={costYoy}
        elasticity={elasticity} productKey={productKey} onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
