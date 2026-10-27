// ============================================================
// 定价推演页（第一百六十五轮波2，Eason「有理有据」）：每个测算数字都有
// 证据出处——大盘卡（12 季实际 + 环比幅度 + 未来 4 季预估带，同比与区间
// 可调）→ 方案的大盘系数；成本卡（24 个月实际 + 环比幅度 + 未来 12 个月
// 预估带，可调）→ 方案的成本曲线；量价证据卡 + 响应推导卡（两款产品 ×
// 两场景：上市前按上一代 3 次调价推导系数，上市后按本品 2 次 + 上一代
// 3 次，系数可改）→ 方案的价格响应；方案区三卡消费以上全部证据，任何
// 数字点开依据抽屉逐行复述计算链。数据全模拟（mockData），界面克制：
// 无解释性文案段落，出处进抽屉与卡片控件行。
// ============================================================
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Button, Drawer, InputNumber, Segmented, Select, Tooltip } from 'antd';
import PageHeader from '../../components/PageHeader';
import usePageViewState from '../../state/usePageViewState';
import { color, fontSize, radius, shadow, space } from '../../theme/tokens';
import {
  COMPETITORS,
  COMP_SCENARIOS,
  COST_DEFAULTS,
  CUR_PRODUCT_STATUS,
  INCENTIVE_RATE,
  MARKET_DEFAULTS,
  UNCERTAINTY_BAND,
  type CompScenario,
} from './mockData';
import { CostChart, EvidenceChart, MarketChart, SchemeCompareChart } from './SchemeCharts';
import {
  computeAll,
  COST_BASE,
  costForecast,
  elasticityRange,
  evidenceRows,
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
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: space.xs, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: space.sm, minWidth: 0 }}>
        <span style={{ fontSize: fontSize.bodySm, fontWeight: 600, color: color.ink, whiteSpace: 'nowrap' }}>{title}</span>
        {source && <SourceTag label={source} hint={hint} />}
      </div>
      {extra}
    </div>
  );
}

/** 卡片底部控件行：标签 + 数字输入（% 口径） */
function PctInput({ value, min, max, onChange, width = 92 }: { value: number; min: number; max: number; onChange: (v: number) => void; width?: number }) {
  return (
    <InputNumber
      style={{ width }} size="small" value={value} min={min} max={max} step={1}
      formatter={(v) => `${v}%`} parser={(t) => Number(String(t).replace(/%|,/g, ''))}
      onChange={(v) => onChange(v ?? 0)}
    />
  );
}

function ControlLabel({ children }: { children: ReactNode }) {
  return <span style={{ fontSize: fontSize.caption, color: color.mute, whiteSpace: 'nowrap' }}>{children}</span>;
}

/** 方案卡指标（点击展开依据抽屉） */
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

/** 响应推导卡：事件表（列宽 48/44/58/66/1fr/44） */
const RESP_GRID = '52px 44px 58px 66px minmax(0,1fr) 44px';

function ResponseTable({ productKey, scenario }: { productKey: string; scenario: Scenario }) {
  const product = productOf(productKey);
  const rows = evidenceRows(product, scenario);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
      <div style={{ display: 'grid', gridTemplateColumns: RESP_GRID, gap: `0 ${space.sm}px`, padding: `2px 0`, borderBottom: `1px solid ${color.hairline}` }}>
        {['来源', '时间', '调价', '量变化', '背景 · 归因', '系数'].map((h) => (
          <span key={h} style={{ fontSize: fontSize.caption, color: color.mute, whiteSpace: 'nowrap' }}>{h}</span>
        ))}
      </div>
      {rows.map(({ group, event }) => (
        <div
          key={group + event.week}
          style={{
            display: 'grid', gridTemplateColumns: RESP_GRID, gap: `0 ${space.sm}px`, alignItems: 'baseline',
            padding: `4px 0`, borderBottom: `1px solid ${color.hairline}`,
            background: group === 'cur' ? '#f4f8ff' : undefined,
            fontSize: fontSize.caption, color: color.body, fontVariantNumeric: 'tabular-nums',
          }}
        >
          <span style={{ color: group === 'cur' ? '#0053c2' : color.mute, whiteSpace: 'nowrap' }}>{group === 'cur' ? '本品' : '上一代'}</span>
          <span>W{event.week}</span>
          <span>{fmtPct(event.changePct)}</span>
          <span>{fmtPct(event.soPct)}</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {event.context} · 归因 {fmtPct(event.attributedPct)}
          </span>
          <span style={{ fontWeight: 600, color: color.ink }}>{(Math.abs(event.attributedPct / event.changePct)).toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}

function EvidenceDrawer({
  result, marketYoYPct, costYoyPct, elasticity, productKey, onClose,
}: {
  result: SchemeResult | null; marketYoYPct: number; costYoyPct: number; elasticity: number; productKey: string; onClose: () => void;
}) {
  const r = result;
  const product = productOf(productKey);
  const range = r ? elasticityRange(product, r.chain.scenario) : null;
  return (
    <Drawer open={r != null} onClose={onClose} width={480} title={r ? `${r.scheme.name} · 测算依据` : ''}>
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

// 抽屉竞品行需要当前 comp；SchemeResult 未携带，经 chain.compChangePct 反查标签
const compKeyOf = (r: SchemeResult): CompScenario =>
  COMP_SCENARIOS.find((s) => s.changePct === r.chain.compChangePct)?.key ?? 'hold';

export default function PricingPage() {
  const [productKey, setProductKey] = usePageViewState<string>('pricing.product', () => 'std');
  const [scenario, setScenario] = usePageViewState<Scenario>('pricing.scenario', () => 'pre');
  const [comp, setComp] = usePageViewState<CompScenario>('pricing.comp', () => 'hold');
  const [marketYoy, setMarketYoy] = usePageViewState<number>('pricing.marketYoy', () => MARKET_DEFAULTS.yoyPct);
  const [marketBand, setMarketBand] = usePageViewState<number>('pricing.marketBand', () => MARKET_DEFAULTS.bandPct);
  const [costYoy, setCostYoy] = usePageViewState<number>('pricing.costYoy', () => COST_DEFAULTS.yoyPct);
  const [costBand, setCostBand] = usePageViewState<number>('pricing.costBand', () => COST_DEFAULTS.bandPct);
  const [elasticityOverride, setElasticityOverride] = usePageViewState<number | null>('pricing.elasticity', () => null);
  const [priceEdits, setPriceEdits] = usePageViewState<Record<string, number>>('pricing.prices', () => ({}));
  const [drawerKey, setDrawerKey] = useState<string | null>(null);

  const product = productOf(productKey);
  const suggested = suggestedElasticity(product, scenario);
  const elasticity = elasticityOverride ?? suggested;
  // 换产品/换场景后，系数回到该证据集的建议值
  useEffect(() => {
    setElasticityOverride(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productKey, scenario]);

  const fcMarket = useMemo(() => marketForecast(marketYoy, marketBand), [marketYoy, marketBand]);
  const fcCost = useMemo(() => costForecast(costYoy, costBand), [costYoy, costBand]);

  const schemes = useMemo(
    () =>
      product.schemes[scenario].map((s) => {
        const edit = priceEdits[`${productKey}.${scenario}.${s.key}`];
        return edit != null ? { ...s, price: edit } : s;
      }),
    [product, scenario, priceEdits, productKey],
  );
  const ctx: PlanContext = useMemo(
    () => ({ scenario, marketYoYPct: marketYoy, costYoyPct: costYoy, elasticity, comp }),
    [scenario, marketYoy, costYoy, elasticity, comp],
  );
  const results = useMemo(() => computeAll(schemes, ctx, product), [schemes, ctx, product]);
  const drawerResult = results.find((r) => r.scheme.key === drawerKey) ?? null;

  const setPrice = (key: string, price: number): void => {
    setPriceEdits({ ...priceEdits, [`${productKey}.${scenario}.${key}`]: price });
  };
  const resetAll = (): void => {
    setMarketYoy(MARKET_DEFAULTS.yoyPct);
    setMarketBand(MARKET_DEFAULTS.bandPct);
    setCostYoy(COST_DEFAULTS.yoyPct);
    setCostBand(COST_DEFAULTS.bandPct);
    setComp('hold');
    setElasticityOverride(null);
    setPriceEdits({});
  };

  const marketSum = fcMarket.reduce((s, f) => s + f.mid, 0);
  const range = elasticityRange(product, scenario);

  return (
    <div style={{ minWidth: 1280, minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <PageHeader />
      <main style={{ flex: 1, padding: space.lg, display: 'flex', flexDirection: 'column', gap: space.base, minWidth: 0 }}>
        {/* 页头：标题 + 模拟徽章 ｜ 情景 chips ｜ 产品 / 场景 / 竞品 / 重置 */}
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

        {/* 证据行 1：大盘 + 成本 */}
        <div style={{ display: 'flex', gap: space.base, height: 252 }}>
          <div style={{ ...CARD, flex: 1, minWidth: 0, padding: `${space.md}px ${space.lg}px ${space.sm}px`, display: 'flex', flexDirection: 'column' }}>
            <CardHead
              title="大盘 · 分价格档容量" source="外部预估"
              hint="季度容量为示例市场分价格档口径；预估带随下方假设调整，方案测算的大盘系数即取此同比"
            />
            <div style={{ flex: 1, minHeight: 0 }}><MarketChart forecast={fcMarket} /></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: space.md, paddingTop: space.xs }}>
              <ControlLabel>未来四季同比</ControlLabel>
              <PctInput value={marketYoy} min={-40} max={40} onChange={setMarketYoy} />
              <ControlLabel>预估区间</ControlLabel>
              <PctInput value={marketBand} min={0} max={30} onChange={setMarketBand} />
              <span style={{ fontSize: fontSize.caption, color: color.mute, marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                预估四季合计 {fmtInt(marketSum)} 万部（{fmtPct(marketYoy)}）
              </span>
            </div>
          </div>
          <div style={{ ...CARD, flex: 1, minWidth: 0, padding: `${space.md}px ${space.lg}px ${space.sm}px`, display: 'flex', flexDirection: 'column' }}>
            <CardHead title="成本 · 单台全成本" source="产品线" hint="月度成本为产品线口径；预估带随下方假设调整，方案测算按此曲线逐周计销毛" />
            <div style={{ flex: 1, minHeight: 0 }}><CostChart forecast={fcCost} /></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: space.md, paddingTop: space.xs }}>
              <ControlLabel>未来 12 月同比</ControlLabel>
              <PctInput value={costYoy} min={-20} max={30} onChange={setCostYoy} />
              <ControlLabel>预估区间</ControlLabel>
              <PctInput value={costBand} min={0} max={30} onChange={setCostBand} />
              <span style={{ fontSize: fontSize.caption, color: color.mute, marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                上市月 ${COST_BASE} → 12 月后 ${fmtInt(fcCost[fcCost.length - 1].mid)}
              </span>
            </div>
          </div>
        </div>

        {/* 证据行 2：量价证据图 + 响应推导 */}
        <div style={{ display: 'flex', gap: space.base, height: 268 }}>
          <div style={{ ...CARD, flex: 3, minWidth: 0, padding: `${space.md}px ${space.lg}px ${space.sm}px`, display: 'flex', flexDirection: 'column' }}>
            <CardHead
              title={scenario === 'pre' ? `上一代同期参照（${product.prev.name} · 52 周）` : `本品上市以来（${product.cur.name} · ${product.cur.weeks.length} 周）`}
              source={scenario === 'pre' ? '上一代' : '本品实际'}
            />
            <div style={{ flex: 1, minHeight: 0 }}><EvidenceChart product={product} scenario={scenario} /></div>
          </div>
          <div style={{ ...CARD, flex: 2, minWidth: 0, padding: `${space.md}px ${space.lg}px ${space.sm}px`, display: 'flex', flexDirection: 'column' }}>
            <CardHead
              title="价格响应系数推导" source="历史复盘"
              hint="每次调价取归因量变化（扣除同期档期）÷ 调价幅度为系数；上市后本品事件优先给建议值"
              extra={
                <div style={{ display: 'flex', alignItems: 'center', gap: space.sm }}>
                  <ControlLabel>当前取</ControlLabel>
                  <InputNumber
                    style={{ width: 76 }} size="small" value={elasticity} min={0} max={3} step={0.1}
                    onChange={(v) => setElasticityOverride(v ?? suggested)}
                  />
                </div>
              }
            />
            <ResponseTable productKey={productKey} scenario={scenario} />
            <div style={{ fontSize: fontSize.caption, color: color.mute, paddingTop: space.xs, whiteSpace: 'nowrap' }}>
              参照区间 {range.min}–{range.max} · 建议 {suggested}（{scenario === 'pre' ? '上一代均值' : '本品均值'}）
            </div>
          </div>
        </div>

        {/* 方案行：三方案卡 + 对比图 */}
        <div style={{ display: 'flex', gap: space.base, flex: 1, minHeight: 218 }}>
          {results.map((r) => (
            <div key={r.scheme.key} style={{ ...CARD, flex: 1, minWidth: 0, padding: `${space.md}px ${space.lg}px`, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: space.sm }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: space.md }}>
                <span style={{ fontSize: fontSize.bodySm, fontWeight: 600, color: color.ink, whiteSpace: 'nowrap' }}>{r.scheme.name}</span>
                <span style={{ fontSize: fontSize.caption, color: color.mute, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.scheme.tagline}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: space.lg, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: fontSize.caption, color: color.mute, paddingBottom: 2 }}>拟定价</div>
                  <InputNumber
                    style={{ width: 108 }} size="small" value={r.scheme.price} min={799} max={1499} step={10}
                    prefix="$" onChange={(v) => setPrice(r.scheme.key, v ?? r.scheme.price)}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: `${space.xs}px ${space.base}px`, flex: 1, minWidth: 240 }}>
                  <Metric label="首年预期 SO" value={fmtWan(r.firstYearSoWan)} sub={`区间 ${r.p10Wan.toFixed(1)}–${r.p90Wan.toFixed(1)} 万台`} onOpen={() => setDrawerKey(r.scheme.key)} />
                  <Metric label="单台销毛 · 上市月" value={`$${r.launchUnitMargin}`} onOpen={() => setDrawerKey(r.scheme.key)} />
                  <Metric label="首年销毛贡献" value={fmtYi(r.marginTotalYi)} onOpen={() => setDrawerKey(r.scheme.key)} />
                  <Metric label="较上一代同期 SO" value={fmtPct(r.vsPrevSoPct)} onOpen={() => setDrawerKey(r.scheme.key)} />
                </div>
              </div>
            </div>
          ))}
          <div style={{ ...CARD, flex: 1.35, minWidth: 0, padding: `${space.md}px ${space.lg}px ${space.sm}px`, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: fontSize.bodySm, fontWeight: 600, color: color.ink, paddingBottom: space.xs }}>三方案测算对比</div>
            <div style={{ flex: 1, minHeight: 0 }}><SchemeCompareChart results={results} /></div>
          </div>
        </div>
      </main>
      <EvidenceDrawer
        result={drawerResult} marketYoYPct={marketYoy} costYoyPct={costYoy}
        elasticity={elasticity} productKey={productKey} onClose={() => setDrawerKey(null)}
      />
    </div>
  );
}
