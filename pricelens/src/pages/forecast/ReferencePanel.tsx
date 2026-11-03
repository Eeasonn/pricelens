// ============================================================
// 推演工作台 v2 · 层②量价参考（A1 参考卡重构）：
// 标题「上一代上市同期 / 友商同期量价」不绑定具体产品名；参考池
// （references.lifecyclePool）整池开放进两卡下拉，支持自由选择任何产品的
// 全生命周期量价做参考——选上一代（chainRefId 映射 prevGenPool）仍写
// params.prevGenReferenceId 进主链（同周龄比值校正，卡内只消费模型读数）；
// 选友商 / 其他产品 = 纯对照，卡内标注「对照 · 不影响主图基线」。
// 图 = ReferenceVolumeChart（量柱 + 价格线 + 档期带 + 事件锚 + 拖选区间
// 读数 + 时间窗滑条，样式对齐量价走势页）；主品线不再出现在本卡（主品
// 只在上方主图）。保留 SimChip「模拟历史」与 IoBar；保留模型比值行。
// 智能弹框：主图输入（手调应用 / 产品事件录入）时经 inputSignal 触发卡头
// 顶部 transient 条（非 Modal，8 秒自动收起，可手动关），列出当前参照
// 产品在类似时间的表现；点击条目定位到对应事件周。
// ============================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import { Select } from 'antd';
import { color, radius, space } from '../../theme/tokens';
import type { LifecycleProductSeed, WorkbenchFixture } from './workbenchFixture';
import type { WorkbenchResult } from './workbenchModel';
import { IoBar, SectionHead, SimChip, fmtSignedPct, workbenchCardStyle } from './WorkbenchBits';
import ReferenceVolumeChart from './ReferenceVolumeChart';

/** 主图输入信号（页面接线）：手调 / 产品事件变化时 seq 递增，驱动智能弹框。 */
export interface ReferenceInputSignal {
  seq: number;
  kind: 'manual' | 'event';
  /** 变化涉及的周标签（如 W47），可缺省。 */
  weekLabel?: string;
}

/** 参考池下拉选项（支持分组：进主链 / 对照）。 */
type PoolOption = { value: string; label: string } | { label: string; options: Array<{ value: string; label: string }> };

interface HintEntry {
  chart: 'own' | 'comp';
  productId: string;
  text: string;
  week: number;
}

interface HintState {
  kind: 'manual' | 'event';
  weekLabel?: string;
  entries: HintEntry[];
}

const shortLabelOf = (product: LifecycleProductSeed): string => product.label.replace(/（[^）]*）/g, '').trim();

/** 智能弹框组稿：取参照产品带影响读数的事件（档期事件优先），最多一条。 */
function hintEntriesOf(product: LifecycleProductSeed | null, chart: 'own' | 'comp'): HintEntry[] {
  if (!product) return [];
  const events = product.events.filter((ev) => ev.impactPct != null && ev.impactWeeks != null);
  const ranked = [...events].sort((a, b) => Number(b.type === 'promo') - Number(a.type === 'promo'));
  return ranked.slice(0, 1).map((ev) => ({
    chart,
    productId: product.id,
    week: ev.week,
    text: `${shortLabelOf(product)} ${ev.label} ${fmtSignedPct(ev.impactPct as number)}×${ev.impactWeeks} 周`,
  }));
}

/** 参考卡子卡：标题 + 池下拉 + 链路徽标 + 全生命周期量价图 + 模型比值行。 */
function ReferenceChartCard({
  title,
  subtitle,
  selectLabel,
  product,
  options,
  value,
  onSelect,
  chainBadge,
  footNote,
  focusWeek,
  focusKey,
}: {
  title: string;
  subtitle: string;
  selectLabel: string;
  product: LifecycleProductSeed | null;
  options: PoolOption[];
  value: string;
  onSelect: (id: string) => void;
  /** 链路徽标：chain = 进主链；contrast = 对照（不影响主图基线）。 */
  chainBadge: 'chain' | 'contrast';
  /** 来自推演模型的说明行（同周龄比值校正读数）；缺省不渲染。 */
  footNote?: string;
  focusWeek?: number | null;
  focusKey?: number;
}) {
  const badge = chainBadge === 'chain';
  return (
    <div style={{ border: `1px solid ${color.hairline}`, borderRadius: radius.card, padding: `${space.md}px ${space.base}px ${space.sm}px`, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: space.sm, marginBottom: space.sm, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: color.ink }}>{title}</h3>
        <span
          title={badge
            ? '该参照为上一代产品：选择写入主链，经同周龄比值校正主图基线'
            : '对照查看：不写入主链、不影响主图基线，仅用于核对量价节奏'}
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: '2px 8px',
            borderRadius: radius.pill,
            whiteSpace: 'nowrap',
            background: badge ? color.canvasSoft2 : color.canvasSoft,
            color: badge ? color.body : color.mute,
            border: `1px solid ${color.hairline}`,
          }}
        >
          {badge ? '进主链 · 基线校正' : '对照 · 不影响主图基线'}
        </span>
        <Select
          size="small"
          aria-label={selectLabel}
          value={value}
          onChange={onSelect}
          options={options}
          style={{ minWidth: 172, marginLeft: 'auto' }}
        />
      </div>
      <div style={{ fontSize: 11, color: color.mute, marginBottom: space.sm, minWidth: 0 }}>{subtitle}</div>
      {product ? (
        <ReferenceVolumeChart product={product} focusWeek={focusWeek} focusKey={focusKey} />
      ) : (
        <div role="status" style={{ padding: `${space.lg}px 0`, textAlign: 'center', fontSize: 12, color: color.mute }}>暂无可参照历史</div>
      )}
      {footNote && (
        <div className="tnum" style={{ marginTop: space.xs, fontSize: 11, color: color.mute, minWidth: 0 }}>{footNote}</div>
      )}
    </div>
  );
}

export interface ReferencePanelProps {
  fixture: WorkbenchFixture;
  result: WorkbenchResult;
  /** 受控：params.prevGenReferenceId（状态由页面持有）；基准 = prevGenPool[0]。 */
  prevGenReferenceId: string;
  /** 选择回调：写入 params.prevGenReferenceId，经模型同周龄比值校正主图基线。 */
  onPrevGenReferenceChange: (id: string) => void;
  /** 主图输入信号（手调应用 / 产品事件录入）：seq 递增触发智能弹框。 */
  inputSignal?: ReferenceInputSignal | null;
}

export default function ReferencePanel({
  fixture,
  result,
  // 受控值；页面（WP6 集成）接线前回退基准参照，保证渲染安全。
  prevGenReferenceId = fixture.references.prevGenPool[0]?.id ?? '',
  onPrevGenReferenceChange,
  inputSignal,
}: ReferencePanelProps) {
  const pool = useMemo(() => fixture.references.lifecyclePool ?? [], [fixture]);
  // 上一代槽初始 = 主链参照对应的池内产品（无映射回退首个可进主链产品）。
  const initialOwn = pool.find((p) => p.chainRefId === prevGenReferenceId)?.id
    ?? pool.find((p) => p.chainRefId != null)?.id
    ?? pool[0]?.id
    ?? '';
  const [ownId, setOwnId] = useState(initialOwn);
  const ownIdRef = useRef(initialOwn);
  // 页面侧受控 prevGenReferenceId 变化（如重置基准）→ 槽位视图跟随主链
  //（当前槽位视图已是对照产品时不跟随，保留用户的对照视角）。
  useEffect(() => {
    const viewed = pool.find((p) => p.id === ownIdRef.current);
    if (viewed?.chainRefId && viewed.chainRefId !== prevGenReferenceId) {
      const chainProduct = pool.find((p) => p.chainRefId === prevGenReferenceId);
      if (chainProduct) {
        ownIdRef.current = chainProduct.id;
        setOwnId(chainProduct.id);
      }
    }
  }, [prevGenReferenceId, pool]);
  // 友商槽 = 卡内查看状态（仅对照与回放），不写入主链。
  const [compId, setCompId] = useState(() => pool.find((p) => p.chainRefId == null)?.id ?? pool[0]?.id ?? '');

  const ownProduct = pool.find((p) => p.id === ownId) ?? null;
  const compProduct = pool.find((p) => p.id === compId) ?? null;
  const ownInChain = ownProduct?.chainRefId != null && ownProduct.chainRefId === prevGenReferenceId;

  const selectOwn = (id: string): void => {
    ownIdRef.current = id;
    setOwnId(id);
    const product = pool.find((p) => p.id === id);
    // 选上一代（有主链映射）→ 写 prevGenReferenceId 进主链；其他产品 = 纯对照，不改主图基线。
    if (product?.chainRefId) onPrevGenReferenceChange?.(product.chainRefId);
  };

  // 池下拉（与前页拉齐：整池开放，分组 = 进主链 / 对照）。
  const poolOptions = useMemo(() => [
    { label: '上一代 · 进主链', options: pool.filter((p) => p.chainRefId != null).map((p) => ({ value: p.id, label: p.label })) },
    { label: '友商 / 其他 · 对照', options: pool.filter((p) => p.chainRefId == null).map((p) => ({ value: p.id, label: p.label })) },
  ].filter((group) => group.options.length > 0), [pool]);

  // ---- 智能弹框（transient 顶部条，非 Modal）：inputSignal.seq 递增触发，
  //      8 秒自动收起；条目点击定位到对应事件周（图内窗口平移 + 悬停）。 ----
  const [hint, setHint] = useState<HintState | null>(null);
  const [focus, setFocus] = useState<{ ownWeek: number | null; ownKey: number; compWeek: number | null; compKey: number }>({
    ownWeek: null, ownKey: 0, compWeek: null, compKey: 0,
  });
  const seenSeqRef = useRef(0);
  useEffect(() => {
    if (!inputSignal || inputSignal.seq <= seenSeqRef.current) return;
    seenSeqRef.current = inputSignal.seq;
    setHint({
      kind: inputSignal.kind,
      weekLabel: inputSignal.weekLabel,
      entries: [...hintEntriesOf(ownProduct, 'own'), ...hintEntriesOf(compProduct, 'comp')],
    });
  }, [inputSignal, ownProduct, compProduct]);
  useEffect(() => {
    if (!hint) return;
    const timer = window.setTimeout(() => setHint(null), 8000);
    return () => window.clearTimeout(timer);
  }, [hint]);
  const focusEntry = (entry: HintEntry): void => {
    setFocus((prev) => (entry.chart === 'own'
      ? { ...prev, ownWeek: entry.week, ownKey: prev.ownKey + 1 }
      : { ...prev, compWeek: entry.week, compKey: prev.compKey + 1 }));
  };

  // 模型比值行（主图基线校正）：只消费推演模型考量，卡内不另算比值。
  const firstForecastWeek = result.weeks.find((week) => week.status === 'forecast');
  const referenceConsider = firstForecastWeek?.consider.find((item) => item.kind === 'reference');
  const prevGenFootnote = firstForecastWeek && referenceConsider
    ? `主图基线校正 · 首预测周 ${firstForecastWeek.week}：${referenceConsider.note}`
    : undefined;

  const emptyPool = pool.length === 0;

  return (
    <section style={workbenchCardStyle}>
      <SectionHead
        title="上一代上市同期 / 友商同期量价"
        hint="历史参照：上一代上市同期与友商同期量价。每张图为参照产品上市起的全生命周期量价（量柱 + 价格线 + 档期带 + 事件锚），图上拖选区间读价量变化，底部时间窗可平移缩放；参考池整池开放，选上一代经同周龄比值进入主图基线校正，其他产品仅对照。"
        extra={(
          <>
            <span
              title="参照序列为历史演示样本 · 纯历史数据，无预测段"
              style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: radius.pill, background: color.canvasSoft2, color: color.body }}
            >
              仅历史
            </span>
            <SimChip variant="simHistory" title="参照序列为模拟样本回放，不代表真实市场" />
          </>
        )}
      />
      <IoBar
        input="参照产品全生命周期量价、档期与事件锚（参考池整池可选：上一代 / 友商同期）"
        output="上一代参照经同周龄比值校正主图基线；对照产品仅查看；主图输入（手调 / 产品事件）时弹出参照表现提示"
      />
      {/* 智能弹框（卡头顶部条，非 Modal）：主图输入后列出参照产品在类似时间的表现 */}
      {hint && (
        <div
          role="status"
          aria-live="polite"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '4px 10px',
            padding: '8px 12px',
            borderRadius: radius.control,
            background: color.canvasSoft2,
            border: `1px solid ${color.hairline}`,
            marginBottom: space.md,
            minWidth: 0,
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 600, color: color.ink }}>我参考了这些产品</span>
          <span style={{ fontSize: 11.5, color: color.mute, minWidth: 0 }}>
            主图{hint.kind === 'event' ? '录入产品事件' : '手动微调'}{hint.weekLabel ? `（${hint.weekLabel}）` : ''}后，它们在类似时间的表现：
          </span>
          {hint.entries.map((entry) => (
            <button
              key={`${entry.chart}-${entry.productId}`}
              type="button"
              className="tnum"
              title="点击定位到对应事件周"
              onClick={() => focusEntry(entry)}
              style={{
                fontSize: 11.5,
                lineHeight: '16px',
                padding: '3px 9px',
                borderRadius: radius.pill,
                border: `1px solid ${color.hairlineStrong}`,
                background: color.canvas,
                color: color.body,
                cursor: 'pointer',
                font: 'inherit',
                fontVariantNumeric: 'tabular-nums',
                whiteSpace: 'nowrap',
              }}
            >
              {entry.text}
            </button>
          ))}
          {hint.entries.length === 0 && (
            <span style={{ fontSize: 11.5, color: color.mute }}>当前参照产品无可回放的事件锚</span>
          )}
          <button
            type="button"
            aria-label="关闭参照提示"
            onClick={() => setHint(null)}
            style={{
              marginLeft: 'auto',
              display: 'inline-grid',
              placeItems: 'center',
              width: 20,
              height: 20,
              padding: 0,
              border: 'none',
              borderRadius: radius.pill,
              background: 'transparent',
              color: color.mute,
              fontSize: 13,
              lineHeight: 1,
              cursor: 'pointer',
            }}
          >
            ×
          </button>
        </div>
      )}
      {emptyPool ? (
        <div style={{ border: `1px solid ${color.hairline}`, borderRadius: radius.card, padding: `${space.md}px ${space.base}px ${space.sm}px`, minWidth: 0 }}>
          <div role="status" style={{ padding: `${space.lg}px 0`, textAlign: 'center', fontSize: 12, color: color.mute }}>暂无可参照历史</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: space.md }}>
          <ReferenceChartCard
            title="上一代上市同期"
            subtitle="参照产品上市起全生命周期量价（同周龄对齐可调窗）；选择上一代经同周龄比值校正主图基线，选择友商 / 其他产品仅对照"
            selectLabel="选择上一代参照对象"
            product={ownProduct}
            options={poolOptions}
            value={ownId}
            onSelect={selectOwn}
            chainBadge={ownInChain ? 'chain' : 'contrast'}
            footNote={prevGenFootnote}
            focusWeek={focus.ownWeek}
            focusKey={focus.ownKey}
          />
          <ReferenceChartCard
            title="友商同期量价"
            subtitle="同构对照：友商上市起全生命周期量价与档期应对节奏——不修改主图基线，不对竞品动作做因果归因"
            selectLabel="选择友商参照对象"
            product={compProduct}
            options={poolOptions}
            value={compId}
            onSelect={setCompId}
            chainBadge="contrast"
            focusWeek={focus.compWeek}
            focusKey={focus.compKey}
          />
        </div>
      )}
    </section>
  );
}
