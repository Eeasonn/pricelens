// ============================================================
// 配置页「竞品对标配置」区块（2026-10-20 评审后补回：总览页置灰后对标维护入口丢失）。
// 当前国家（页头）× 产业（本块切换）下，列出全部我司型号 × 配置 → 对标竞品。
// 2026-11-10 Eason（matrix-only 临时口径）：「矩阵 / 自动 / 替代 / 人工」四层逻辑
// 先取消——生效对标只有矩阵直配一种来源，矩阵没给的即为空；本页编辑暂不生效
// （按钮停用 + 说明），浏览器里的历史人工快照已停用并给清除入口。
// 竞品 chip 显示 型号 · 配置 · 变体（2026-11-10 塌缩后穿戴/平板的表盘、联网方式
// 并入变体文案，核对匹配关系时需要看到它）。
// 第一百九十轮（外部 UX 审计落地）：竞品行挂 .lpl-bm-row、配置名列挂 .lpl-bm-cfg
// （窄屏自动换行重排，修复 390px 下竞品 chips 被裁切、「编辑」覆盖内容）；
// 「编辑」补 aria-label（图标按钮无可见文字，读屏需要上下文名称）。
// ============================================================
import { useEffect, useMemo, useState } from 'react';
import { Button, Empty, Popover, Segmented, Tooltip } from 'antd';
import { EditOutlined, InfoCircleOutlined } from '@ant-design/icons';
import BrandDot from '../../components/BrandMark';
import { dimProduct } from '../../data';
import { buildOverviewMatrix, TIER_LABELS } from '../../dataModel/aggregate';
import { INDUSTRY_LABELS, industriesOfCountry } from '../../dataModel/scope';
import type { DimBenchmark, Industry } from '../../dataModel/types';
import { BENCHMARK_CAP_PER_CONFIG, getEffectiveBenchmark, manualBenchmarkCount, saveBenchmark } from '../../state/configStore';
import { useFilters } from '../../state/FiltersContext';
import { CONFIG_CHANGED_EVENT } from '../../state/lplKeys';
import { color, fontSize, radius, space } from '../../theme/tokens';
import { tierLabelShort } from '../../chart/PriceTrend/helpers';

const norm = (s: string): string => s.replace(/\s+/g, '');

/** matrix-only：维表只发 source=matrix 行，本页所有对标统一挂矩阵标签 */
const MATRIX_TAG = { text: '矩阵', fg: '#0053c2', bg: '#e8f1ff', hint: '产品竞品矩阵直接配置' };

/** 竞品显示名：型号 · 配置 · 变体（'—' 段整段隐藏，与全局配置文案约定一致） */
function competitorLabel(p: { model_name: string; romram: string; color: string }): string {
  const parts = [p.model_name];
  if (p.romram && p.romram !== '—') parts.push(p.romram);
  if (p.color && p.color !== '—') parts.push(p.color);
  return parts.join(' · ');
}

export default function BenchmarkConfigBlock({ canEdit = true }: { canEdit?: boolean }) {
  const { state } = useFilters();
  const cc = state.countryCode;
  const industries = useMemo(() => industriesOfCountry(cc), [cc]);
  const [industry, setIndustry] = useState<Industry>(state.industry);
  useEffect(() => {
    if (!industries.includes(industry)) setIndustry(industries[0] ?? 'phone');
  }, [industries, industry]);

  // 保存后（CONFIG_CHANGED_EVENT）重读生效对标
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const h = () => setTick((t) => t + 1);
    window.addEventListener(CONFIG_CHANGED_EVENT, h);
    return () => window.removeEventListener(CONFIG_CHANGED_EVENT, h);
  }, []);
  const bench = useMemo(() => getEffectiveBenchmark(), [tick]); // eslint-disable-line react-hooks/exhaustive-deps

  // matrix-only：人工快照已停用（getEffectiveBenchmark 不再读它）。浏览器里若还留着
  // 历史快照，挂横幅说明「已停用」并给清除入口——避免误以为旧的人工配置仍在生效。
  const [manualCount, setManualCount] = useState(() => manualBenchmarkCount());
  const clearManual = (): void => {
    saveBenchmark(null);
    setManualCount(0);
    window.dispatchEvent(new Event(CONFIG_CHANGED_EVENT));
    // tick 依赖只挂 CONFIG_CHANGED_EVENT，手动 set 保证本块立即回落维表默认
    setTick((t) => t + 1);
  };
  const bands = useMemo(
    () => buildOverviewMatrix(state.currency, bench, null, { countryCode: cc, industry }),
    [bench, state.currency, cc, industry],
  );
  const ownModels = useMemo(() => bands.flatMap((b) => b.models).filter((m) => m.isOwn), [bands]);
  const productById = useMemo(() => new Map(dimProduct.map((p) => [p.sku_id, p])), []);

  const compsOf = (modelId: string, romram: string): DimBenchmark[] =>
    bench
      .filter((b) => (b.country_code ?? cc) === cc && b.own_model_id === modelId && norm(b.own_romram) === norm(romram))
      .sort((a, b) => a.sort - b.sort);

  const totalPairs = ownModels.reduce((n, m) => n + m.rows.reduce((k, r) => k + compsOf(m.modelId, r.romram).length, 0), 0);

  // 第一百一十五轮（评审）：把匹配逻辑讲清在界面上——数据从哪来、优先级、上限。
  // 业务语义表述，不含工程细节（UI 禁解释性工程文案铁律）。2026-11-10 起 matrix-only。
  const matchLogic = (
    <div style={{ maxWidth: 380, fontSize: 12, lineHeight: '20px', color: color.body }}>
      <div style={{ fontWeight: 600, color: color.ink, marginBottom: 4 }}>竞品怎么匹配</div>
      <div>① 以《产品竞品矩阵》为准：每个国家、每款产品按矩阵列出的竞品直配，列序即优先级。</div>
      <div>② 矩阵里没给的国家和产品、以及矩阵指名但该国没有在售数据的竞品，一律留空——不自动补齐、不用近似款。</div>
      <div style={{ marginTop: 4, fontWeight: 600, color: color.ink }}>每款产品每个配置最多 {BENCHMARK_CAP_PER_CONFIG} 个竞品；超出时按矩阵列序保留前 {BENCHMARK_CAP_PER_CONFIG} 个，同型号多配置只占富余名额。</div>
    </div>
  );

  return (
    <>
      {manualCount > 0 ? (
      <div
        role="status"
        style={{
          display: 'flex', alignItems: 'center', gap: space.sm, marginBottom: space.sm,
          padding: `${space.sm}px ${space.sm}px`, background: '#fff7e6',
          border: `1px solid #ffd591`, borderRadius: radius.control,
          fontSize: fontSize.caption, color: '#874d00',
        }}
      >
        <span style={{ flex: 1, minWidth: 0 }}>
          检测到历史<b>人工维护快照</b>（{manualCount} 条）：当前口径下已停用，不再整表接管。
        </span>
        <Button size="small" onClick={clearManual}>清除旧快照（{manualCount} 条）</Button>
      </div>
    ) : null}
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: space.md, flexWrap: 'wrap', marginBottom: space.base }}>
        <Segmented
          size="small"
          value={industry}
          onChange={(v) => setIndustry(v as Industry)}
          options={industries.map((i) => ({ label: INDUSTRY_LABELS[i], value: i }))}
        />
        <span className="tnum" style={{ fontSize: fontSize.caption, color: color.mute }}>
          {ownModels.length} 个型号 · {totalPairs} 条对标 · 每配置最多 {BENCHMARK_CAP_PER_CONFIG} 款
        </span>
        <Popover trigger="click" placement="bottomLeft" content={matchLogic} arrow={false}>
          <Button size="small" icon={<InfoCircleOutlined />} style={{ height: 24 }}>
            匹配逻辑
          </Button>
        </Popover>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <Tooltip title={MATRIX_TAG.hint}>
            <span style={{ fontSize: 10, fontWeight: 600, color: MATRIX_TAG.fg, background: MATRIX_TAG.bg, borderRadius: radius.pill, padding: '0 7px', lineHeight: '16px' }}>
              {MATRIX_TAG.text}
            </span>
          </Tooltip>
        </span>
      </div>

      {ownModels.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="该国该产业暂无产品数据" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: space.sm }}>
          {ownModels.map((m) => (
            <div key={m.modelId} style={{ border: `1px solid ${color.hairline}`, borderRadius: radius.control, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: '#f3f8ff' }}>
                <BrandDot brand={m.brand} />
                <span style={{ fontSize: 13, fontWeight: 650, color: color.ink }}>{m.modelName}</span>
                <span style={{ fontSize: fontSize.caption, color: color.mute }}>{tierLabelShort(TIER_LABELS[m.tierCode] ?? m.tierCode)}</span>
              </div>
              {m.rows.map((r) => {
                const comps = compsOf(m.modelId, r.romram);
                // 第一百九十轮：挂 .lpl-bm-row——窄屏下整行自动换行，chips 不再被「编辑」挤压裁切
                return (
                  <div
                    className="lpl-bm-row"
                    key={r.romram}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', borderTop: `1px solid ${color.hairline}` }}
                  >
                    {/* 配置名列：宽度/不收缩交给 .lpl-bm-cfg（窄屏独占一行），仅保留字重与排版 */}
                    <span className="tnum lpl-bm-cfg" style={{ fontSize: 12, fontWeight: 600, color: color.ink }}>
                      {r.romram}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {comps.length === 0 ? (
                        <span style={{ fontSize: 12, color: color.mute }}>暂无对标竞品</span>
                      ) : (
                        comps.map((b) => {
                          const p = productById.get(b.competitor_sku_id);
                          return (
                            <span
                              key={b.competitor_sku_id}
                              title={b.note ? `矩阵原文：${b.note}` : undefined}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px',
                                fontSize: 12, lineHeight: '16px', color: color.body, background: color.canvas,
                                border: `1px solid ${color.hairlineStrong}`, borderRadius: radius.pill, whiteSpace: 'nowrap',
                              }}
                            >
                              {b.sort === 1 && <span style={{ color: color.link, background: '#e8f1ff', borderRadius: 8, padding: '0 6px', fontSize: 11 }}>主竞品</span>}
                              <BrandDot brand={p?.brand ?? ''} />
                              {p ? competitorLabel(p) : b.competitor_sku_id}
                              <span style={{ fontSize: 10, fontWeight: 600, color: MATRIX_TAG.fg, background: MATRIX_TAG.bg, borderRadius: radius.pill, padding: '0 5px', lineHeight: '14px' }}>
                                {MATRIX_TAG.text}
                              </span>
                            </span>
                          );
                        })
                      )}
                    </span>
                    {/* 图标按钮无可见文字：读屏念「编辑」需带型号 + 配置上下文（第一百九十轮）。
                        matrix-only 临时口径：编辑入口保留但不生效（人工层停用）；
                        2026-11-06 RBAC：查阅者本就禁编辑 */}
                    <Button
                      size="small"
                      icon={<EditOutlined />}
                      disabled
                      title={canEdit ? '当前按矩阵直配，人工配置暂不生效' : '查阅者不可修改配置，请联系 GTM'}
                      aria-label={`编辑 ${m.modelName} ${r.romram} 的竞品对标`}
                    >
                      编辑
                    </Button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
    </>
  );
}
