// ============================================================
// 配置页「竞品对标配置」区块（2026-10-20 评审后补回：总览页置灰后对标维护入口丢失）。
// 当前国家（页头）× 产业（本块切换）下，列出全部我司型号 × 配置 → 对标竞品，
// 来源标签：矩阵（产品竞品矩阵直配）/ 自动（矩阵未覆盖时按同款/同档就近自动匹配）/
// 替代（矩阵竞品无数据用近似品）/ 人工（本页编辑）。「编辑」复用 BenchConfigModal
// （候选区同档优先 + 品牌筛选 + ↑↓排序 + 恢复默认），保存走 manual 快照 + 事件广播。
// ============================================================
import { useEffect, useMemo, useState } from 'react';
import { Button, Empty, Popover, Segmented, Tooltip } from 'antd';
import { EditOutlined, InfoCircleOutlined } from '@ant-design/icons';
import BrandDot from '../../components/BrandMark';
import { dimProduct } from '../../data';
import { buildOverviewMatrix, TIER_LABELS, type OverviewModel } from '../../dataModel/aggregate';
import { INDUSTRY_LABELS, industriesOfCountry } from '../../dataModel/scope';
import type { DimBenchmark, Industry } from '../../dataModel/types';
import { getEffectiveBenchmark } from '../../state/configStore';
import { useFilters } from '../../state/FiltersContext';
import { CONFIG_CHANGED_EVENT } from '../../state/lplKeys';
import { color, fontSize, radius, space } from '../../theme/tokens';
import { tierLabelShort } from '../../chart/PriceTrend/helpers';
import BenchConfigModal from '../overview/BenchConfigModal';

const norm = (s: string): string => s.replace(/\s+/g, '');

const SOURCE_TAG: Record<DimBenchmark['source'], { text: string; fg: string; bg: string; hint: string }> = {
  matrix: { text: '矩阵', fg: '#0053c2', bg: '#e8f1ff', hint: '产品竞品矩阵直接配置' },
  auto: { text: '自动', fg: color.body, bg: color.canvasSoft, hint: '矩阵未覆盖：沿用矩阵他国同款，或同产业价差 ±35% 内就近匹配' },
  substitute: { text: '替代', fg: '#b45309', bg: '#fff7e6', hint: '矩阵竞品在数据中不存在，用近似替代品' },
  manual: { text: '人工', fg: '#15803d', bg: '#ecfdf3', hint: '本页人工配置' },
};

export default function BenchmarkConfigBlock() {
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
  const bands = useMemo(
    () => buildOverviewMatrix(state.currency, bench, null, { countryCode: cc, industry }),
    [bench, state.currency, cc, industry],
  );
  const ownModels = useMemo(() => bands.flatMap((b) => b.models).filter((m) => m.isOwn), [bands]);
  const productById = useMemo(() => new Map(dimProduct.map((p) => [p.sku_id, p])), []);

  const [editing, setEditing] = useState<{ model: OverviewModel; rom: string | null } | null>(null);

  const compsOf = (modelId: string, romram: string): DimBenchmark[] =>
    bench
      .filter((b) => (b.country_code ?? cc) === cc && b.own_model_id === modelId && norm(b.own_romram) === norm(romram))
      .sort((a, b) => a.sort - b.sort);

  const totalPairs = ownModels.reduce((n, m) => n + m.rows.reduce((k, r) => k + compsOf(m.modelId, r.romram).length, 0), 0);

  // 第一百一十五轮（评审）：把匹配逻辑讲清在界面上——数据从哪来、优先级、上限。
  // 业务语义表述，不含工程细节（UI 禁解释性工程文案铁律）。
  const matchLogic = (
    <div style={{ maxWidth: 380, fontSize: 12, lineHeight: '20px', color: color.body }}>
      <div style={{ fontWeight: 600, color: color.ink, marginBottom: 4 }}>竞品怎么匹配</div>
      <div>① 以《产品竞品矩阵》为准：每个国家、每款产品按矩阵列出的竞品直配，列序即优先级。</div>
      <div>② 矩阵未覆盖的国家和型号：优先沿用矩阵其他国家为同款产品配过的竞品；仍有空缺时，在同档位（价差 ±35% 以内）就近补齐，每个品牌先取一款。</div>
      <div>③ 矩阵指名的竞品在该国没有在售数据时，以近似款替代。</div>
      <div>④ 本页可人工增删与调序，人工配置优先于以上规则。</div>
      <div style={{ marginTop: 4, fontWeight: 600, color: color.ink }}>每款产品每个配置最多 4 个竞品；超出时按 人工 → 矩阵列序 → 就近补齐 的顺序保留前 4 个，同型号多配置只占富余名额。</div>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: space.md, flexWrap: 'wrap', marginBottom: space.base }}>
        <Segmented
          size="small"
          value={industry}
          onChange={(v) => setIndustry(v as Industry)}
          options={industries.map((i) => ({ label: INDUSTRY_LABELS[i], value: i }))}
        />
        <span className="tnum" style={{ fontSize: fontSize.caption, color: color.mute }}>
          {ownModels.length} 个型号 · {totalPairs} 条对标 · 每配置最多 4 款
        </span>
        <Popover trigger="click" placement="bottomLeft" content={matchLogic} arrow={false}>
          <Button size="small" icon={<InfoCircleOutlined />} style={{ height: 24 }}>
            匹配逻辑
          </Button>
        </Popover>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          {(Object.keys(SOURCE_TAG) as DimBenchmark['source'][]).map((k) => (
            <Tooltip key={k} title={SOURCE_TAG[k].hint}>
              <span style={{ fontSize: 10, fontWeight: 600, color: SOURCE_TAG[k].fg, background: SOURCE_TAG[k].bg, borderRadius: radius.pill, padding: '0 7px', lineHeight: '16px' }}>
                {SOURCE_TAG[k].text}
              </span>
            </Tooltip>
          ))}
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
                return (
                  <div
                    key={r.romram}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', borderTop: `1px solid ${color.hairline}` }}
                  >
                    <span className="tnum" style={{ width: 150, flexShrink: 0, fontSize: 12, fontWeight: 600, color: color.ink }}>
                      {r.romram}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {comps.length === 0 ? (
                        <span style={{ fontSize: 12, color: color.mute }}>暂无对标竞品</span>
                      ) : (
                        comps.map((b) => {
                          const p = productById.get(b.competitor_sku_id);
                          const tag = SOURCE_TAG[b.source] ?? SOURCE_TAG.manual;
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
                              {p ? `${p.model_name} · ${p.romram}` : b.competitor_sku_id}
                              <span style={{ fontSize: 10, fontWeight: 600, color: tag.fg, background: tag.bg, borderRadius: radius.pill, padding: '0 5px', lineHeight: '14px' }}>
                                {tag.text}
                              </span>
                            </span>
                          );
                        })
                      )}
                    </span>
                    <Button size="small" icon={<EditOutlined />} onClick={() => setEditing({ model: m, rom: r.romram })}>
                      编辑
                    </Button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      <BenchConfigModal
        open={editing != null}
        model={editing?.model ?? null}
        bands={bands}
        initialRomram={editing?.rom ?? null}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}
