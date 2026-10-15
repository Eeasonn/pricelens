// ============================================================
// §13 配置页：四块配置 + 保存语义 localStorage（键前缀 LPL3.*）
// ① 默认竞品矩阵：行 = 8 款我司在售型号（ROMRAM 粒度，is_own && next_model_id==null，
//    前代同堂如 Pura 80 系不进行），列 = 品牌（APPLE/SAMSUNG/HONOR/XIAOMI），
//    每行按品牌选竞品 SKU 并可排序（第 1 = 主竞品）；默认读 dimBenchmark（auto），
//    用户改后存 LPL3.config.benchmark（source=manual）
// ② 上一代关系（第四轮新增）：行 = 全部我司型号（型号级，与 dim_product.prev_model_id
//    同口径），下拉选上一代型号（候选 = 上市更早的我司型号）；默认读生效关系
//    （manual 优先 / dim_product auto 兜底），改后差异存 LPL3.config.prevGen；
//    主页筛选条「匹配上一代」按此带出上代同配置组
// ③ 参考汇率：USD/RUB InputNumber，默认 80，存 LPL3.config.fx
// ④ 自定义档位管理：列出 LPL3.config.customTiers（图表侧写入），支持删除
// ⑤ 大促日历（第四十七轮）：只读展示 dim_promo 的起始时间与促销深度——看板大促
//    带/事件卡的口径来源在此可见
// 保存后 dispatchEvent(CONFIG_CHANGED_EVENT) → 主页立即生效
// （反馈第 8 条修订：不自动改主页当前竞品选择；用户点「匹配竞品」才按最新矩阵带出）
// ============================================================
import { useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Button, Empty, InputNumber, message, Select, Tag, Tooltip } from 'antd';
import { DownOutlined, UpOutlined } from '@ant-design/icons';
import { usePage } from '../state/PageContext';
import {
  autoPrevModelId,
  benchmarkSkuIdsFor,
  effectivePrevModelId,
  getCustomTiers,
  getEffectiveBenchmark,
  getFxRate,
  notifyConfigChanged,
  saveBenchmark,
  saveCustomTiers,
  saveFx,
  savePrevGenOverrides,
  type CustomTierPreset,
} from '../state/configStore';
import { dimProduct, dimPromo } from '../data';
import type { DimBenchmark, DimProduct } from '../dataModel/types';
import { COMPETITOR_BRANDS, modelIdOf, shortRomram, skuOptionLabel } from '../components/ProductCascader/tree';
import { color, fontSize, radius, shadow, space } from '../theme/tokens';

interface MatrixRowDraft {
  modelId: string;
  romram: string;
  label: string;
  selected: string[]; // 竞品 SKU id，按优先级排序（index+1 = sort，第 1 = 主竞品）
}

const COLUMNS = `minmax(210px, 1.1fr) repeat(4, minmax(170px, 1fr)) minmax(260px, 1.3fr)`;

/** 我司在售型号 × ROMRAM 行（modelId = sku_id 前缀型号 id，与 dim_benchmark.own_model_id 同空间） */
function ownMatrixRows(): { modelId: string; romram: string; label: string }[] {
  const seen = new Set<string>();
  const rows: { modelId: string; romram: string; label: string }[] = [];
  for (const p of dimProduct) {
    if (!p.is_own || p.next_model_id != null) continue;
    const modelId = modelIdOf(p);
    const key = `${modelId}|${p.romram}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ modelId, romram: p.romram, label: `${p.model_name} · ${shortRomram(p.romram)}` });
  }
  return rows;
}

function initMatrixDraft(): MatrixRowDraft[] {
  const bySku = new Map(dimProduct.map((p) => [p.sku_id, p]));
  return ownMatrixRows().map((row) => ({
    ...row,
    // 默认读 dimBenchmark（getEffectiveBenchmark：manual 优先，auto 兜底）；失效 SKU 丢弃
    selected: benchmarkSkuIdsFor(row.modelId, row.romram).filter((id) => bySku.has(id)),
  }));
}

function brandSelectOptions(brand: string): { label: string; options: { label: string; value: string }[] }[] {
  const models = new Map<string, DimProduct[]>();
  for (const p of dimProduct) {
    if (p.is_own || p.brand !== brand) continue;
    const arr = models.get(p.model_name) ?? [];
    arr.push(p);
    models.set(p.model_name, arr);
  }
  return [...models.entries()].map(([model, skus]) => ({
    label: model,
    options: skus.map((s) => ({ label: skuOptionLabel(s), value: s.sku_id })),
  }));
}

// ---------------- ② 上一代关系（型号级，与 dim_product.prev_model_id 同口径） ----------------

interface PrevGenRow {
  modelId: string;
  label: string;
  launch: string;
}

/** 全部我司型号行（型号级去重，按上市日排序）——上一代关系维护用 */
function ownModelRows(): PrevGenRow[] {
  const seen = new Set<string>();
  const rows: PrevGenRow[] = [];
  for (const p of dimProduct) {
    if (!p.is_own) continue;
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
  const { go } = usePage();
  const skuById = useMemo(() => new Map(dimProduct.map((p) => [p.sku_id, p])), []);

  const [matrix, setMatrix] = useState<MatrixRowDraft[]>(initMatrixDraft);
  const prevRows = useMemo(ownModelRows, []);
  const [prevMap, setPrevMap] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(prevRows.map((r) => [r.modelId, effectivePrevModelId(r.modelId)])),
  );
  const [fx, setFx] = useState<number>(getFxRate);
  const [tiers, setTiers] = useState<CustomTierPreset[]>(getCustomTiers);

  const patchRow = (key: string, patch: Partial<MatrixRowDraft>) =>
    setMatrix((rows) => rows.map((r) => (`${r.modelId}|${r.romram}` === key ? { ...r, ...patch } : r)));

  /** 品牌单元格：换选该品牌竞品（其他品牌选择保持，新增追加到排序尾部） */
  const patchRowBrand = (row: MatrixRowDraft, brand: string, values: string[]) => {
    const others = row.selected.filter((id) => skuById.get(id)?.brand !== brand);
    patchRow(`${row.modelId}|${row.romram}`, { selected: [...others, ...values] });
  };

  const moveSelected = (row: MatrixRowDraft, index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= row.selected.length) return;
    const next = [...row.selected];
    [next[index], next[target]] = [next[target], next[index]];
    patchRow(`${row.modelId}|${row.romram}`, { selected: next });
  };

  const removeSelected = (row: MatrixRowDraft, skuId: string) =>
    patchRow(`${row.modelId}|${row.romram}`, {
      selected: row.selected.filter((id) => id !== skuId),
    });

  const saveAll = () => {
    // ① 竞品矩阵 → LPL3.config.benchmark（source=manual）；无在售型号行时不动矩阵（避免空快照覆盖 auto）
    if (matrix.length) {
      const rows: DimBenchmark[] = [];
      for (const row of matrix) {
        row.selected.forEach((skuId, i) =>
          rows.push({
            own_model_id: row.modelId,
            own_romram: row.romram,
            competitor_sku_id: skuId,
            sort: i + 1, // 第 1 = 主竞品
            source: 'manual',
          }),
        );
      }
      saveBenchmark(rows);
    }
    // ② 上一代关系 → LPL3.config.prevGen（只存与 auto 的差异；无差异 = 清除手动维护）
    {
      const overrides: Record<string, string | null> = {};
      for (const r of prevRows) {
        if ((prevMap[r.modelId] ?? null) !== autoPrevModelId(r.modelId)) {
          overrides[r.modelId] = prevMap[r.modelId] ?? null;
        }
      }
      savePrevGenOverrides(overrides);
    }
    // ③ 参考汇率 → LPL3.config.fx；④ 自定义档位 → LPL3.config.customTiers
    saveFx(fx);
    saveCustomTiers(tiers);
    notifyConfigChanged();
    message.success('配置已保存，主页已生效');
  };

  const restoreBenchmarkDefault = () => {
    saveBenchmark(null); // 清除 manual，回到 dimBenchmark（auto）
    setMatrix(initMatrixDraft());
    notifyConfigChanged();
    message.success('已恢复默认竞品组（auto）');
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
        {/* 顶栏 64px：与看板同铬架 */}
        <header
          style={{
            height: 64,
            flexShrink: 0,
            background: color.canvas,
            boxShadow: shadow.l1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: `0 ${space.lg}px`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: space.md }}>
            <Button size="small" style={{ height: 28 }} onClick={() => go('overview')}>
              总览
            </Button>
            <Button size="small" style={{ height: 28 }} onClick={() => go('dashboard')}>
              价格看板
            </Button>
            <span style={{ fontSize: fontSize.bodyMd, fontWeight: 600, color: color.ink }}>配置</span>
          </div>
          <Button size="small" type="primary" style={{ height: 28 }} onClick={saveAll}>
            保存配置
          </Button>
        </header>

        <main style={{ flex: 1, padding: space.lg }}>
          {/* ① 默认竞品矩阵 */}
          <Block
            title="默认竞品矩阵"
            extra={
              <Button size="small" onClick={restoreBenchmarkDefault}>
                恢复默认（auto）
              </Button>
            }
          >
            {matrix.length ? (
              <div style={{ overflowX: 'auto' }}>
                <div style={{ minWidth: 1180 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: COLUMNS, fontWeight: 500 }}>
                    <div style={cellPadding}>我司型号（ROMRAM）</div>
                    {COMPETITOR_BRANDS.map((b) => (
                      <div key={b} style={cellPadding}>
                        {b}
                      </div>
                    ))}
                    <div style={cellPadding}>优先级排序（第 1 = 主竞品）</div>
                  </div>
                  {matrix.map((row) => (
                    <div
                      key={`${row.modelId}|${row.romram}`}
                      style={{ display: 'grid', gridTemplateColumns: COLUMNS, borderTop: `1px solid ${color.hairline}` }}
                    >
                      <div style={{ ...cellPadding, fontSize: fontSize.bodySm, color: color.ink }}>{row.label}</div>
                      {COMPETITOR_BRANDS.map((brand) => (
                        <div key={brand} style={cellPadding}>
                          <Select
                            mode="multiple"
                            allowClear
                            size="small"
                            style={{ width: '100%' }}
                            maxTagCount="responsive"
                            placeholder="—"
                            value={row.selected.filter((id) => skuById.get(id)?.brand === brand)}
                            options={brandSelectOptions(brand)}
                            onChange={(values) => patchRowBrand(row, brand, values)}
                          />
                        </div>
                      ))}
                      <div style={{ ...cellPadding, display: 'flex', flexWrap: 'wrap', gap: space.xs }}>
                        {row.selected.map((skuId, i) => {
                          const sku = skuById.get(skuId);
                          return (
                            <Tag
                              key={skuId}
                              style={{ marginInlineEnd: 0, fontSize: fontSize.caption, lineHeight: '18px' }}
                              closable
                              onClose={() => removeSelected(row, skuId)}
                            >
                              <Button
                                type="text"
                                size="small"
                                disabled={i === 0}
                                icon={<UpOutlined style={{ fontSize: 10 }} />}
                                style={{ height: 16, width: 18, padding: 0, marginInlineEnd: 2 }}
                                onClick={() => moveSelected(row, i, -1)}
                              />
                              <Button
                                type="text"
                                size="small"
                                disabled={i === row.selected.length - 1}
                                icon={<DownOutlined style={{ fontSize: 10 }} />}
                                style={{ height: 16, width: 18, padding: 0, marginInlineEnd: 4 }}
                                onClick={() => moveSelected(row, i, 1)}
                              />
                              <span className="tnum">
                                {sku ? skuOptionLabel(sku) : skuId}
                                {i === 0 ? ' ·主竞品' : ''}
                              </span>
                            </Tag>
                          );
                        })}
                        {!row.selected.length && (
                          <span style={{ fontSize: fontSize.caption, color: color.mute }}>未选择</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无我司在售产品数据" />
            )}
          </Block>

          {/* ② 上一代关系（主页筛选条「匹配上一代」按此带出上代同配置组） */}
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

          {/* ③ 参考汇率 */}
          <Block title="参考汇率">
            <div style={{ display: 'flex', alignItems: 'center', gap: space.sm }}>
              <InputNumber
                min={1}
                max={10000}
                step={0.5}
                value={fx}
                onChange={(v) => setFx(typeof v === 'number' && Number.isFinite(v) ? v : 80)}
                style={{ width: 160 }}
              />
              <span className="tnum" style={{ fontSize: fontSize.bodySm, color: color.body }}>
                USD/RUB
              </span>
            </div>
          </Block>

          {/* ④ 自定义档位管理（图表侧写入的档位预设） */}
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
                      {t.min} – {t.max} · {t.currency === 'usd' ? 'USD' : '本币（RUB）'}
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

          {/* ⑤ 大促日历（第四十七轮）：起始时间 + 促销深度在配置界面可见（dim_promo 只读） */}
          <Block
            title="大促日历"
            extra={
              <span style={{ fontSize: fontSize.caption, color: color.mute }}>
                促销日历口径 · 看板「大促档期」带与事件卡的来源
              </span>
            }
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: space.sm }}>
              {[...dimPromo]
                .sort((a, b) => a.start_date.localeCompare(b.start_date))
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
