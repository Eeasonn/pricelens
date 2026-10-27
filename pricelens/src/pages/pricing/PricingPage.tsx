// ============================================================
// 定价推演页（第一百六十五轮）：上市定价 what-if 玻璃盒——上一代同期参照 +
// 四项显式假设 + 三套定价方案（拟定价可改）联动测算 SO / 单台销毛 / 首年
// 销毛贡献，全部测算数字可展开依据抽屉（计算链逐行复述 + 响应系数的
// 历史事件来源）。数据全模拟（mockData），不接真实维表；假设与拟定价为
// 会话态（切页保留）。界面克制：无解释性文案段落，出处进抽屉。
// ============================================================
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Button, Drawer, InputNumber, Select, Tooltip } from 'antd';
import PageHeader from '../../components/PageHeader';
import usePageViewState from '../../state/usePageViewState';
import { color, fontSize, radius, shadow, space } from '../../theme/tokens';
import {
  COMPETITORS,
  COMP_SCENARIOS,
  CUR_PRODUCT,
  ELASTICITY,
  INCENTIVE_RATE,
  PREV_GEN,
  PRICING_EVENTS,
  UNCERTAINTY_BAND,
  type CompScenario,
} from './mockData';
import { PrevRefChart, SchemeCompareChart } from './SchemeCharts';
import {
  DEFAULT_ASSUMPTIONS,
  DEFAULT_SCHEMES,
  computeAll,
  type Assumptions,
  type Scheme,
  type SchemeResult,
} from './pricingModel';

const CARD: CSSProperties = { background: color.canvas, borderRadius: radius.card, boxShadow: shadow.l1 };

const fmtWan = (v: number): string => `${v.toFixed(1)} 万台`;
const fmtYi = (v: number): string => `$${v.toFixed(2)} 亿`;
const fmtPct = (v: number): string => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
const fmtFactor = (v: number): string => `× ${v.toFixed(3)}`;

/** 页头右侧情景 chips（只读，交代推演对象） */
function ContextChip({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', height: 24, padding: '0 10px',
        borderRadius: radius.pill, fontSize: fontSize.caption, color: color.body,
        background: color.canvas, border: `1px solid ${color.hairline}`, whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

/** 假设来源徽标（四种来源固定文案） */
function SourceTag({ label, hint }: { label: string; hint?: string }) {
  const tag = (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 8px',
        borderRadius: radius.pill, fontSize: fontSize.caption, color: color.body,
        background: color.canvasSoft2,
      }}
    >
      {label}
    </span>
  );
  return hint ? <Tooltip title={hint}>{tag}</Tooltip> : tag;
}

/** 假设行：名称 + 控件 + 来源 */
function AssumptionItem({ label, source, hint, children }: { label: string; source: string; hint?: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space.xs, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: space.sm }}>
        <span style={{ fontSize: fontSize.bodySm, color: color.ink, fontWeight: 500 }}>{label}</span>
        <SourceTag label={source} hint={hint} />
      </div>
      {children}
    </div>
  );
}

const numStyle: CSSProperties = { width: 128 };

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
function ChainRow({ name, value }: { name: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: space.md, padding: '5px 0' }}>
      <span style={{ fontSize: fontSize.bodySm, color: color.body }}>{name}</span>
      <span style={{ fontSize: fontSize.bodySm, color: color.ink, fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
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

function EvidenceDrawer({ result, assumptions, onClose }: { result: SchemeResult | null; assumptions: Assumptions; onClose: () => void }) {
  const r = result;
  return (
    <Drawer open={r != null} onClose={onClose} width={480} title={r ? `${r.scheme.name} · 测算依据` : ''}>
      {r && (
        <div style={{ paddingBottom: space.lg }}>
          <DrawerSection title="首年预期 SO">
            <ChainRow name={`上一代首年 SO（${PREV_GEN.name} · 52 周实际）`} value={fmtWan(r.chain.prevTotalWan)} />
            <ChainRow name={`大盘系数（同比 ${fmtPct(assumptions.marketYoYPct)}）`} value={fmtFactor(r.chain.marketFactor)} />
            <ChainRow name={`价格响应（较上一代开盘 ${fmtPct(r.chain.priceDeltaPct)} · 系数 ${assumptions.elasticity}）`} value={fmtFactor(r.chain.priceFactor)} />
            <ChainRow name={`竞品情景（${COMP_SCENARIOS.find((s) => s.key === assumptions.comp)?.label ?? ''}${r.chain.compChangePct !== 0 ? ` ${fmtPct(r.chain.compChangePct)}` : ''}）`} value={fmtFactor(r.chain.compFactor)} />
            <ChainRow name="首年预期 SO" value={`${fmtWan(r.firstYearSoWan)}（区间 ${r.p10Wan.toFixed(1)}–${r.p90Wan.toFixed(1)} · ±${Math.round(UNCERTAINTY_BAND * 100)}%）`} />
          </DrawerSection>
          <DrawerSection title="销毛">
            <ChainRow name={`单台销毛（上市月）= 拟定价 ×（1−激励 ${Math.round(INCENTIVE_RATE * 100)}%）− 上市成本 $${r.chain.launchCost}`} value={`$${r.launchUnitMargin}`} />
            <ChainRow name={`首年销毛贡献（逐周按成本曲线 $${r.chain.launchCost} → $${r.chain.yearEndCost} 加总）`} value={fmtYi(r.marginTotalYi)} />
          </DrawerSection>
          <DrawerSection title="价格响应系数来源（上一代 3 次调价复盘）">
            {PRICING_EVENTS.map((e) => (
              <ChainRow
                key={e.week}
                name={`${e.anchor} W${e.week} ${fmtPct(e.changePct)} → 后 4 周 ${fmtPct(e.so4wPct)}（${e.context} · 归因 ${fmtPct(e.attributedPct)}）`}
                value={(Math.abs(e.attributedPct / e.changePct)).toFixed(2)}
              />
            ))}
            <div style={{ fontSize: fontSize.caption, color: color.mute, paddingTop: space.xs }}>
              参照区间 {ELASTICITY.min}–{ELASTICITY.max} · 当前取 {assumptions.elasticity}
            </div>
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
  const [assumptions, setAssumptions] = usePageViewState<Assumptions>('pricing.assumptions', () => DEFAULT_ASSUMPTIONS);
  const [schemes, setSchemes] = usePageViewState<Scheme[]>('pricing.schemes', () => DEFAULT_SCHEMES);
  const [drawerKey, setDrawerKey] = useState<string | null>(null);

  const results = useMemo(() => computeAll(schemes, assumptions), [schemes, assumptions]);
  const drawerResult = results.find((r) => r.scheme.key === drawerKey) ?? null;

  const setPrice = (key: Scheme['key'], price: number): void => {
    setSchemes(schemes.map((s) => (s.key === key ? { ...s, price } : s)));
  };

  return (
    <div style={{ minWidth: 1280, minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <PageHeader />
      <main style={{ flex: 1, padding: space.lg, display: 'flex', flexDirection: 'column', gap: space.base, minWidth: 0 }}>
        {/* 页头：标题 + 模拟徽章 + 情景 chips */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space.base }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: space.md }}>
            <span style={{ fontSize: fontSize.displaySm, fontWeight: 600, color: color.ink }}>上市定价推演</span>
            <span
              style={{
                display: 'inline-flex', alignItems: 'center', height: 22, padding: '0 10px', borderRadius: radius.pill,
                fontSize: fontSize.caption, fontWeight: 600, color: color.ink,
                background: '#ffefcf', border: '1px solid #f5a623',
              }}
            >
              模拟数据
            </span>
          </div>
          <div style={{ display: 'flex', gap: space.sm, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <ContextChip>示例市场 · USD</ContextChip>
            <ContextChip>当前品 {CUR_PRODUCT.name}（{CUR_PRODUCT.status}）</ContextChip>
            <ContextChip>上一代 {PREV_GEN.name}</ContextChip>
            <ContextChip>竞品参照 {COMPETITORS.map((c) => c.name).join(' · ')}</ContextChip>
          </div>
        </div>

        {/* 推演假设 */}
        <div style={{ ...CARD, padding: `${space.base}px ${space.lg}px` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: space.sm }}>
            <span style={{ fontSize: fontSize.bodySm, fontWeight: 600, color: color.ink }}>推演假设</span>
            <Button size="small" onClick={() => { setAssumptions(DEFAULT_ASSUMPTIONS); setSchemes(DEFAULT_SCHEMES); }}>
              重置
            </Button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: space.lg }}>
            <AssumptionItem label="大盘同比" source="外部预估">
              <InputNumber
                style={numStyle} value={assumptions.marketYoYPct} min={-40} max={40} step={1}
                formatter={(v) => `${v}%`} parser={(t) => Number(String(t).replace(/%|,/g, '')) }
                onChange={(v) => setAssumptions({ ...assumptions, marketYoYPct: v ?? 0 })}
              />
            </AssumptionItem>
            <AssumptionItem label="成本涨幅" source="产品线">
              <InputNumber
                style={numStyle} value={assumptions.costUpPct} min={-20} max={40} step={1}
                formatter={(v) => `${v}%`} parser={(t) => Number(String(t).replace(/%|,/g, '')) }
                onChange={(v) => setAssumptions({ ...assumptions, costUpPct: v ?? 0 })}
              />
            </AssumptionItem>
            <AssumptionItem label="价格响应系数" source="历史复盘" hint={`上一代 3 次调价归因区间 ${ELASTICITY.min}–${ELASTICITY.max}（依据抽屉可查每次事件）`}>
              <InputNumber
                style={numStyle} value={assumptions.elasticity} min={0} max={3} step={0.1}
                onChange={(v) => setAssumptions({ ...assumptions, elasticity: v ?? 0 })}
              />
            </AssumptionItem>
            <AssumptionItem label="竞品价格" source="情景">
              <Select
                style={{ width: 128 }} value={assumptions.comp}
                options={COMP_SCENARIOS.map((s) => ({ value: s.key as CompScenario, label: `${s.label}${s.changePct !== 0 ? ` ${fmtPct(s.changePct)}` : ''}` }))}
                onChange={(v) => setAssumptions({ ...assumptions, comp: v })}
              />
            </AssumptionItem>
          </div>
        </div>

        {/* 主体：左图表两卡 / 右方案三卡 */}
        <div style={{ display: 'flex', gap: space.base, flex: 1, minHeight: 480 }}>
          <div style={{ flex: 11, minWidth: 0, display: 'flex', flexDirection: 'column', gap: space.base }}>
            <div style={{ ...CARD, flex: 3, minHeight: 0, padding: `${space.md}px ${space.lg}px ${space.sm}px`, display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: fontSize.bodySm, fontWeight: 600, color: color.ink, paddingBottom: space.xs }}>上一代同期参照（52 周）</div>
              <div style={{ flex: 1, minHeight: 0 }}>
                <PrevRefChart />
              </div>
            </div>
            <div style={{ ...CARD, flex: 2, minHeight: 0, padding: `${space.md}px ${space.lg}px ${space.sm}px`, display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: fontSize.bodySm, fontWeight: 600, color: color.ink, paddingBottom: space.xs }}>三方案测算对比</div>
              <div style={{ flex: 1, minHeight: 0 }}>
                <SchemeCompareChart results={results} />
              </div>
            </div>
          </div>
          <div style={{ flex: 9, minWidth: 0, display: 'flex', flexDirection: 'column', gap: space.base }}>
            {results.map((r) => (
              <div key={r.scheme.key} style={{ ...CARD, flex: 1, minHeight: 0, padding: `${space.md}px ${space.lg}px`, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: space.sm }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: space.md }}>
                  <span style={{ fontSize: fontSize.bodySm, fontWeight: 600, color: color.ink }}>{r.scheme.name}</span>
                  <span style={{ fontSize: fontSize.caption, color: color.mute, whiteSpace: 'nowrap' }}>{r.scheme.tagline}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: space.xl, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: fontSize.caption, color: color.mute, paddingBottom: 2 }}>拟定价</div>
                    <InputNumber
                      style={{ width: 112 }} value={r.scheme.price} min={799} max={1499} step={10}
                      prefix="$" onChange={(v) => setPrice(r.scheme.key, v ?? r.scheme.price)}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: `${space.sm}px ${space.lg}px`, flex: 1, minWidth: 280 }}>
                    <Metric label="首年预期 SO" value={fmtWan(r.firstYearSoWan)} sub={`区间 ${r.p10Wan.toFixed(1)}–${r.p90Wan.toFixed(1)} 万台`} onOpen={() => setDrawerKey(r.scheme.key)} />
                    <Metric label="单台销毛 · 上市月" value={`$${r.launchUnitMargin}`} onOpen={() => setDrawerKey(r.scheme.key)} />
                    <Metric label="首年销毛贡献" value={fmtYi(r.marginTotalYi)} onOpen={() => setDrawerKey(r.scheme.key)} />
                    <Metric label="较上一代同期 SO" value={fmtPct(r.vsPrevSoPct)} onOpen={() => setDrawerKey(r.scheme.key)} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
      <EvidenceDrawer result={drawerResult} assumptions={assumptions} onClose={() => setDrawerKey(null)} />
    </div>
  );
}
