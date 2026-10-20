// ============================================================
// §13 配置页：四块配置 + 保存语义 localStorage（键前缀 LPL3.*）
// （预警中心重构：原「① 默认竞品矩阵」整块删除——与总览行尾「＋添加竞品」
//   浮窗（BenchConfigModal）完全同一份数据、两套入口重复；浮窗已补齐
//   品牌/搜索筛选、↑↓ 排序与「恢复 auto」，本页不再保留竞品矩阵编辑）
// ⓪ 竞品对标配置（2026-10-20 补回）：当前国家×产业全部我司型号×配置的对标竞品（矩阵/自动/替代/人工）可查可改
// ① 上一代关系（原②）：行 = 当前国家有数据的我司型号（型号级，与 dim_product.prev_model_id
//    同口径），下拉选上一代型号（候选 = 上市更早的我司型号）；默认读生效关系
//    （manual 优先 / dim_product auto 兜底），改后差异存 LPL3.config.prevGen
// ② 汇率口径：只读——真实数据每行自带采集时汇率，USD 值按行折算；此处展示当前国家本币的月度中位汇率
// ③ 自定义档位管理（原④）：列出 LPL3.config.customTiers（图表侧写入），支持删除
// ④ 大促日历：只读展示当前国家 dim_promo 的起始时间与促销深度——看板大促带/事件卡的口径来源
// 保存后 dispatchEvent(CONFIG_CHANGED_EVENT) → 主页立即生效
// ============================================================
import { useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Button, Empty, message, Select, Tag, Tooltip } from 'antd';
import PageHeader from '../components/PageHeader';
import {
  autoPrevModelId,
  effectivePrevModelId,
  getCustomTiers,
  notifyConfigChanged,
  saveCustomTiers,
  savePrevGenOverrides,
  type CustomTierPreset,
} from '../state/configStore';
import { currencyOfCountry, dimFx, dimProduct, dimPromo } from '../data';
import { modelIdOf } from '../components/ProductCascader/tree';
import { useFilters } from '../state/FiltersContext';
import { getLocalCurrency } from '../state/fx';
import BenchmarkConfigBlock from './config/BenchmarkConfigBlock';
import { scopeLabels } from '../dataModel/scope';
import { color, fontSize, radius, shadow, space } from '../theme/tokens';

// ---------------- ② 上一代关系（型号级，与 dim_product.prev_model_id 同口径） ----------------

interface PrevGenRow {
  modelId: string;
  label: string;
  launch: string;
}

/** 当前国家有数据的我司型号行（型号级去重，按首采日排序）——上一代关系维护用 */
function ownModelRows(countryCode: string): PrevGenRow[] {
  const seen = new Set<string>();
  const rows: PrevGenRow[] = [];
  for (const p of dimProduct) {
    if (!p.is_own || !p.countries.includes(countryCode)) continue;
    const modelId = modelIdOf(p);
    if (seen.has(modelId)) continue;
    seen.add(modelId);
    rows.push({ modelId, label: p.model_name, launch: p.launch_date });
  }
  return rows.sort((a, b) => a.launch.localeCompare(b.launch) || a.label.localeCompare(b.label));
}

function Block({ title, extra, children }: { title: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <section
      style={{
        background: color.canvas,
        boxShadow: shadow.l1,
        borderRadius: radius.card,
        padding: space.lg,
        marginBottom: space.base,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.base }}>
        <h3 style={{ margin: 0, fontSize: fontSize.bodyMd, fontWeight: 600, color: color.ink }}>{title}</h3>
        {extra}
      </div>
      {children}
    </section>
  );
}

const cellPadding: CSSProperties = { padding: `${space.sm}px ${space.sm}px` };

export default function Config() {
  const { state } = useFilters();
  const prevRows = useMemo(() => ownModelRows(state.countryCode), [state.countryCode]);
  const [prevMap, setPrevMap] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(prevRows.map((r) => [r.modelId, effectivePrevModelId(r.modelId)])),
  );
  const [tiers, setTiers] = useState<CustomTierPreset[]>(getCustomTiers);
  const labels = scopeLabels({ countryCode: state.countryCode, industry: state.industry });
  const localCurrency = currencyOfCountry(state.countryCode);
  const fxRows = useMemo(
    () => dimFx.filter((f) => f.currency === localCurrency).sort((a, b) => a.month_id.localeCompare(b.month_id)),
    [localCurrency],
  );
  const promos = useMemo(
    () => dimPromo.filter((p) => p.country_code === state.countryCode).sort((a, b) => a.start_date.localeCompare(b.start_date)),
    [state.countryCode],
  );

  const saveAll = () => {
    // ① 上一代关系 → LPL3.config.prevGen（只存与 auto 的差异；无差异 = 清除手动维护）
    {
      const overrides: Record<string, string | null> = {};
      for (const r of prevRows) {
        if ((prevMap[r.modelId] ?? null) !== autoPrevModelId(r.modelId)) {
          overrides[r.modelId] = prevMap[r.modelId] ?? null;
        }
      }
      savePrevGenOverrides(overrides);
    }
    // ③ 自定义档位 → LPL3.config.customTiers
    saveCustomTiers(tiers);
    notifyConfigChanged();
    message.success('配置已保存，主页已生效');
  };

  const restorePrevGenDefault = () => {
    savePrevGenOverrides(null); // 清除手动维护，全部回退 dim_product auto
    setPrevMap(Object.fromEntries(prevRows.map((r) => [r.modelId, autoPrevModelId(r.modelId)])));
    notifyConfigChanged();
    message.success('已恢复默认上一代关系（auto）');
  };

  return (
    <div style={{ height: '100%', overflowX: 'auto', background: color.canvasSoft }}>
      {/* 第二十八轮：1440 → 1280，与看板同最低宽度 */}
      <div style={{ minWidth: 1280, minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* 顶栏 64px（共享 PageHeader；「保存配置」走 extra 插槽） */}
        <PageHeader
          title="配置"
          extra={
            <Button size="small" type="primary" style={{ height: 28 }} onClick={saveAll}>
              保存配置
            </Button>
          }
        />

        <main style={{ flex: 1, padding: space.lg }}>
          {/* ⓪ 竞品对标配置：全部已识别的对标关系（矩阵/自动/替代/人工）在此可查可改 */}
          <Block
            title="竞品对标配置"
            extra={
              <span style={{ fontSize: fontSize.caption, color: color.mute }}>
                {labels.country} · 国家随页头切换；看板「自动匹配」即取此处配置
              </span>
            }
          >
            <BenchmarkConfigBlock />
          </Block>

          {/* ① 上一代关系 */}
          <Block
            title="上一代关系"
            extra={
              <Button size="small" onClick={restorePrevGenDefault}>
                恢复默认（auto）
              </Button>
            }
          >
            {prevRows.length ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: space.sm }}>
                {prevRows.map((r) => {
                  const auto = autoPrevModelId(r.modelId);
                  const manual = (prevMap[r.modelId] ?? null) !== auto;
                  return (
                    <div key={r.modelId} style={{ display: 'flex', alignItems: 'center', gap: space.sm, minWidth: 0 }}>
                      <Tooltip title={`${r.label}（${r.launch} 上市）`}>
                        <span
                          style={{
                            fontSize: fontSize.bodySm,
                            color: color.ink,
                            width: 140,
                            flexShrink: 0,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {r.label}
                        </span>
                      </Tooltip>
                      <Select
                        size="small"
                        allowClear
                        placeholder="未维护"
                        style={{ width: 170, flexShrink: 0 }}
                        value={prevMap[r.modelId] ?? undefined}
                        options={prevRows
                          .filter((c) => c.launch < r.launch)
                          .map((c) => ({ label: c.label, value: c.modelId }))}
                        onChange={(v) => setPrevMap((m) => ({ ...m, [r.modelId]: v ?? null }))}
                      />
                      <Tooltip title={manual ? '手动维护（保存后生效）' : '来自产品主数据（auto）'}>
                        <Tag
                          color={manual ? 'blue' : 'default'}
                          style={{ marginInlineEnd: 0, fontSize: fontSize.caption, lineHeight: '18px', flexShrink: 0 }}
                        >
                          {manual ? 'manual' : 'auto'}
                        </Tag>
                      </Tooltip>
                    </div>
                  );
                })}
              </div>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无我司产品数据" />
            )}
          </Block>

          {/* ② 汇率口径（只读）：真实数据按行折算，这里展示本币月度中位汇率 */}
          <Block
            title="汇率口径"
            extra={
              <span style={{ fontSize: fontSize.caption, color: color.mute }}>
                USD 价格 = 本币价格 ÷ 采集时汇率（逐行）；下表为 {localCurrency} 各月中位数
              </span>
            }
          >
            {fxRows.length ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.sm, fontSize: fontSize.bodySm }}>
                {fxRows.map((f) => (
                  <span key={f.month_id} className="tnum" style={{ color: color.body, padding: '2px 10px', background: color.canvasSoft, borderRadius: radius.pill }}>
                    {f.month_id.slice(0, 4)}-{f.month_id.slice(4)} · 1 USD = {f.per_usd} {f.currency}
                  </span>
                ))}
              </div>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="该国暂无汇率记录" />
            )}
          </Block>

          {/* ③ 自定义档位管理（图表侧写入的档位预设） */}
          <Block title="自定义档位">
            {tiers.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: space.sm }}>
                {tiers.map((t, i) => (
                  <div
                    key={`${t.name}|${i}`}
                    style={{ display: 'flex', alignItems: 'center', gap: space.md, fontSize: fontSize.bodySm }}
                  >
                    <span style={{ color: color.ink, minWidth: 160 }}>{t.name}</span>
                    <span className="tnum" style={{ color: color.body }}>
                      {t.min} – {t.max} · {t.currency === 'usd' ? 'USD' : `本币（${getLocalCurrency()}）`}
                    </span>
                    <Button
                      size="small"
                      danger
                      style={{ marginLeft: 'auto' }}
                      onClick={() => setTiers((list) => list.filter((_, j) => j !== i))}
                    >
                      删除
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无自定义档位" />
            )}
          </Block>

          {/* ④ 大促日历：当前国家的起始时间 + 促销深度（dim_promo 只读） */}
          <Block
            title="大促日历"
            extra={
              <span style={{ fontSize: fontSize.caption, color: color.mute }}>
                当前国家促销日历 · 看板「大促档期」带与事件卡的来源
              </span>
            }
          >
            {promos.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="该国暂无大促日历" />
            ) : null}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: space.sm }}>
              {promos
                .map((p) => {
                  const tone =
                    p.depth_hint === '深'
                      ? { dot: 'rgba(235, 87, 87, 0.75)', fg: '#c0392b', bg: 'rgba(235, 87, 87, 0.10)' }
                      : p.depth_hint === '中'
                        ? { dot: 'rgba(235, 87, 87, 0.5)', fg: '#b45309', bg: '#fff7e6' }
                        : { dot: 'rgba(235, 87, 87, 0.3)', fg: color.mute, bg: color.canvasSoft };
                  return (
                    <div key={p.promo_id} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, fontSize: fontSize.bodySm }}>
                      <i
                        aria-hidden
                        style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 9999, background: tone.dot, flexShrink: 0, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)' }}
                      />
                      <span title={p.promo_name} style={{ color: color.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
                        {p.promo_name}
                      </span>
                      <span className="tnum" style={{ color: color.body, flexShrink: 0 }}>
                        {p.start_date} ~ {p.end_date}
                      </span>
                      <span
                        style={{
                          flexShrink: 0,
                          padding: '1px 8px',
                          fontSize: fontSize.caption,
                          fontWeight: 600,
                          lineHeight: '18px',
                          borderRadius: radius.pill,
                          color: tone.fg,
                          background: tone.bg,
                        }}
                      >
                        {p.depth_hint}
                      </span>
                    </div>
                  );
                })}
            </div>
          </Block>
        </main>
      </div>
    </div>
  );
}
