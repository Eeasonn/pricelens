// ============================================================
// 品牌全景选品区（2026-11-27，「产业与产品」面板 · 品牌全景模式）：
// 在统一入口里选多个品牌——每个品牌可按系列、档位、搜索筛选，并一键「全选当前
// 结果」；顶部可一键「全选所有品牌当前结果」。勾选单位 = 型号 × 配置（颜色取默认
// 最低价色，与产品对标的树勾选同口径）；勾选框沿用产品树「勾选框通用范式」
// （品牌行复选框 = 该品牌当前结果全选 / 部分选中半选）。
// 草稿写 state.panorama（与「产品对标」mains 分别保存，来回切换模式不丢）；
// 无默认品牌 / 主品 / 基准，无条数上限（品牌数、每品牌产品数均不截断）。
// 结果区定高内滚：筛选、勾选只换内容，面板高度不随结果多少跳动。
// ============================================================
import { useMemo, useState, type CSSProperties } from 'react';
import { Checkbox, Input, Popconfirm, Select } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { dimProduct } from '../../data';
import { useFilters } from '../../state/FiltersContext';
import type { ProductSelection } from '../../state/filtersTypes';
import { selKey } from '../../state/mainSelection';
import {
  addBrandSels,
  EMPTY_PANORAMA,
  panoramaSelCount,
  setBrandSels,
  togglePanoramaSel,
} from '../../state/panorama';
import BrandDot, { brandLabelOf } from '../BrandMark';
import {
  configTextOf,
  defaultColorSkuIds,
  filterProductTreeByTier,
  searchProductTree,
  tiersOfScope,
  type BrandNode,
  type RomramNode,
} from '../ProductCascader';
import { tierOf, TIER_LABELS } from '../../dataModel/aggregate';
import { tierLabelShort } from '../../chart/PriceTrend/helpers';
import { color, formatPrice, radius, selectSoft, selectSoftInk, space } from '../../theme/tokens';
import { useTreeData } from './pickerBits';

const usableRomrams = (nodes: RomramNode[]): RomramNode[] => nodes.filter((r) => r.romram !== '—' || nodes.length === 1);
const selOf = (r: RomramNode): ProductSelection => ({ modelId: r.modelId, romram: r.romram, skuIds: defaultColorSkuIds(r) });

const LABEL: CSSProperties = { fontSize: 12, color: color.mute, whiteSpace: 'nowrap', flexShrink: 0 };
const SECTION_HEAD: CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: 1,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  minHeight: 32,
  padding: '4px 10px',
  background: color.canvas,
  borderBottom: `1px solid ${color.hairline}`,
};

export default function PanoramaPicker() {
  const { state, actions } = useFilters();
  const { fullTree } = useTreeData();
  const panorama = state.panorama ?? EMPTY_PANORAMA;
  // 筛选（只影响「当前结果」，不改动已选）
  const [seriesKey, setSeriesKey] = useState<string | null>(null);
  const [tier, setTier] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const tree = useMemo<BrandNode[]>(() => {
    const scoped = tier
      ? filterProductTreeByTier(fullTree, tier, state.countryCode, state.financingType, state.financingTerms)
      : fullTree;
    const searched = searchProductTree(scoped, query);
    if (!seriesKey) return searched;
    return searched
      .map((b) => ({ ...b, series: b.series.filter((s) => s.key === seriesKey) }))
      .filter((b) => b.series.length > 0);
  }, [fullTree, tier, seriesKey, query, state.countryCode, state.financingType, state.financingTerms]);

  const seriesOptions = useMemo(
    () => fullTree.map((b) => ({
      label: brandLabelOf(b.key),
      options: b.series.map((s) => ({ label: s.title, value: s.key })),
    })),
    [fullTree],
  );
  const tierOptions = useMemo(
    () => tiersOfScope(state.industry, state.countryCode, state.financingType, state.financingTerms).map((t) => ({
      value: t,
      label: tierLabelShort(TIER_LABELS[t] ?? t),
    })),
    [state.industry, state.countryCode, state.financingType, state.financingTerms],
  );

  // 配置 → 当前国家分国档位（行尾「档位」标注；维表只读，按国家缓存）
  const tierByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of dimProduct) {
      const k = `${p.model_id}|${p.romram}`;
      if (!m.has(k)) {
        const t = tierOf(p, state.countryCode);
        if (t) m.set(k, t);
      }
    }
    return m;
  }, [state.countryCode]);
  const selectedKeys = useMemo(() => new Set(panorama.brands.flatMap((b) => b.sels.map(selKey))), [panorama]);
  const selectedCountByBrand = useMemo(() => new Map(panorama.brands.map((b) => [b.brand, b.sels.length])), [panorama]);

  /** 每个品牌的当前结果（型号 → 可用配置）；品牌序 = 选择产品树的品牌序 */
  const sections = useMemo(
    () =>
      tree.map((b) => ({
        brand: b.key,
        models: b.series.flatMap((s) => s.models.map((m) => ({ series: s.title, model: m, romrams: usableRomrams(m.romrams) }))),
      })),
    [tree],
  );
  const resultKeysOf = (brand: string): string[] => {
    const sec = sections.find((x) => x.brand === brand);
    return sec ? sec.models.flatMap((m) => m.romrams.map((r) => selKey(selOf(r)))) : [];
  };
  const visibleTotal = sections.reduce((n, sec) => n + resultKeysOf(sec.brand).length, 0);
  const visibleSelected = sections.reduce(
    (n, sec) => n + resultKeysOf(sec.brand).filter((k) => selectedKeys.has(k)).length,
    0,
  );

  const total = panoramaSelCount(panorama);

  const toggleBrand = (brand: string, on: boolean): void => {
    const keys = new Set(resultKeysOf(brand));
    const cur = panorama.brands.find((b) => b.brand === brand)?.sels ?? [];
    // 勾 = 并入当前结果；取消 = 只移出当前结果（筛选外的已选保留）
    const next = on ? [...cur] : cur.filter((s) => !keys.has(selKey(s)));
    if (on) {
      const have = new Set(next.map(selKey));
      const sec = sections.find((x) => x.brand === brand);
      for (const m of sec?.models ?? []) for (const r of m.romrams) {
        const s = selOf(r);
        if (!have.has(selKey(s))) {
          have.add(selKey(s));
          next.push(s);
        }
      }
    }
    actions.setPanorama(setBrandSels(panorama, brand, next));
  };
  const selectAllBrands = (): void => {
    let next = panorama;
    for (const sec of sections) {
      const sels = sec.models.flatMap((m) => m.romrams.map(selOf));
      next = addBrandSels(next, sec.brand, sels);
    }
    actions.setPanorama(next);
  };
  const allVisibleSelected = visibleTotal > 0 && visibleSelected === visibleTotal;

  return (
    <div data-testid="panorama-picker" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* 筛选行：系列（按品牌分组）/ 档位 / 搜索——只收窄「当前结果」，不动已选 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <span style={LABEL}>系列</span>
        <Select
          allowClear
          size="small"
          aria-label="按系列筛选"
          placeholder="全部系列"
          value={seriesKey ?? undefined}
          onChange={(v) => setSeriesKey(v ?? null)}
          options={seriesOptions}
          showSearch
          optionFilterProp="label"
          style={{ flex: '1 1 180px', minWidth: 160 }}
          popupMatchSelectWidth={false}
          getPopupContainer={(node) => node.closest('[data-lpl-picker-panel]') ?? document.body}
        />
        <span style={LABEL}>档位</span>
        <Select
          allowClear
          size="small"
          aria-label="按档位筛选"
          placeholder="全部档位"
          value={tier ?? undefined}
          onChange={(v) => setTier(v ?? null)}
          options={tierOptions}
          style={{ width: 124, flexShrink: 0 }}
          popupMatchSelectWidth={false}
          getPopupContainer={(node) => node.closest('[data-lpl-picker-panel]') ?? document.body}
        />
        <Input
          allowClear
          size="small"
          prefix={<SearchOutlined style={{ color: color.mute }} />}
          placeholder="搜索品牌 / 系列 / 型号 / 容量"
          aria-label="搜索品牌、系列、型号或容量"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ flex: '1 1 180px', minWidth: 160 }}
        />
      </div>

      {/* 汇总 + 全部品牌一键全选 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, minHeight: 26 }}>
        <Checkbox
          checked={allVisibleSelected}
          indeterminate={visibleSelected > 0 && !allVisibleSelected}
          disabled={visibleTotal === 0}
          onChange={(e) => {
            if (e.target.checked) {
              selectAllBrands();
              return;
            }
            // 取消 = 只移出各品牌的「当前结果」（与品牌行复选框同语义；筛选外的已选保留）
            let next = panorama;
            for (const sec of sections) {
              const keys = new Set(resultKeysOf(sec.brand));
              const cur = next.brands.find((b) => b.brand === sec.brand)?.sels ?? [];
              next = setBrandSels(next, sec.brand, cur.filter((s) => !keys.has(selKey(s))));
            }
            actions.setPanorama(next);
          }}
          aria-label={`全选所有品牌当前结果（${visibleTotal} 款）`}
        >
          <span style={{ fontSize: 12, color: color.body }}>
            全选所有品牌当前结果<span className="tnum" style={{ color: color.mute }}>（{visibleTotal}）</span>
          </span>
        </Checkbox>
        <span className="tnum" style={{ marginLeft: 'auto', fontSize: 12, color: color.mute }} data-testid="panorama-summary">
          {panorama.brands.length
            ? `已选 ${panorama.brands.length} 个品牌 · ${total} 款产品`
            : '尚未选择品牌与产品'}
        </span>
        {total > 0 && (
          <Popconfirm
            zIndex={1500}
            title="清空品牌全景选择？"
            description="只清空品牌全景草稿，产品对标选择不受影响"
            okText="清空"
            cancelText="取消"
            okButtonProps={{ danger: true, size: 'small' }}
            cancelButtonProps={{ size: 'small' }}
            onConfirm={() => actions.setPanorama(EMPTY_PANORAMA)}
          >
            <button
              type="button"
              className="lpl-pk-del"
              style={{ height: 22, padding: '0 9px', borderRadius: radius.pill, border: `1px solid ${color.hairline}`, background: color.canvas, font: 'inherit', fontSize: 12, color: color.mute, cursor: 'pointer' }}
            >
              清空
            </button>
          </Popconfirm>
        )}
      </div>

      {/* 结果区：定高内滚（筛选 / 勾选只换内容，面板高度不跳） */}
      <div
        className="lpl-card-scroll"
        role="region"
        aria-label="品牌全景可选产品"
        tabIndex={0}
        style={{ height: 300, overflowY: 'auto', border: `1px solid ${color.hairline}`, borderRadius: radius.control, background: color.canvas }}
      >
        {fullTree.length === 0 && (
          <div role="status" style={{ padding: space.md, fontSize: 12, color: color.mute, textAlign: 'center' }}>
            当前国家 · 产业暂无可选品牌与产品
          </div>
        )}
        {fullTree.length > 0 && sections.length === 0 && (
          <div role="status" style={{ padding: space.md, fontSize: 12, color: color.mute, textAlign: 'center' }}>
            没有匹配当前系列 / 档位 / 搜索的产品，请放宽筛选
          </div>
        )}
        {sections.map((sec) => {
          const keys = resultKeysOf(sec.brand);
          const pickedInResults = keys.filter((k) => selectedKeys.has(k)).length;
          const pickedTotal = selectedCountByBrand.get(sec.brand) ?? 0;
          return (
            <section key={sec.brand} aria-label={`${brandLabelOf(sec.brand)} 当前结果`}>
              <div style={SECTION_HEAD}>
                <Checkbox
                  checked={keys.length > 0 && pickedInResults === keys.length}
                  indeterminate={pickedInResults > 0 && pickedInResults < keys.length}
                  disabled={keys.length === 0}
                  onChange={(e) => toggleBrand(sec.brand, e.target.checked)}
                  aria-label={`全选 ${brandLabelOf(sec.brand)} 当前结果（${keys.length} 款）`}
                />
                <BrandDot brand={sec.brand} />
                <span style={{ fontSize: 12, fontWeight: 600, color: color.ink }}>{brandLabelOf(sec.brand)}</span>
                <span className="tnum" style={{ fontSize: 11, color: color.mute }}>
                  当前结果 {keys.length} 款 · 已选 {pickedTotal}
                  {pickedTotal > pickedInResults ? `（筛选外 ${pickedTotal - pickedInResults}）` : ''}
                </span>
              </div>
              {sec.models.map(({ series, model, romrams }) => (
                <div
                  key={model.modelId}
                  style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 8px', padding: '4px 10px 4px 30px' }}
                >
                  <span style={{ fontSize: 12, fontWeight: 500, color: color.ink, minWidth: 0 }} title={`${series} · ${model.label}`}>
                    {model.label}
                  </span>
                  <span style={{ fontSize: 10, color: color.mute }}>{series}</span>
                  <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '2px 10px', marginLeft: 'auto' }}>
                    {romrams.map((r) => {
                      const s = selOf(r);
                      const k = selKey(s);
                      const on = selectedKeys.has(k);
                      const cfg = configTextOf(r.romram);
                      return (
                        <Checkbox
                          key={r.key}
                          checked={on}
                          onChange={(e) => actions.setPanorama(togglePanoramaSel(panorama, s, e.target.checked))}
                          aria-label={`${on ? '取消选择' : '选择'} ${brandLabelOf(sec.brand)} ${model.label}${cfg ? ` ${cfg}` : ''}`}
                        >
                          <span className="tnum" style={{ fontSize: 12, color: color.body }}>
                            {cfg || '默认版本'}
                            <span style={{ marginLeft: 6, color: color.mute }}>{configTagOf(r, tierByKey, state.currency)}</span>
                          </span>
                        </Checkbox>
                      );
                    })}
                  </span>
                </div>
              ))}
            </section>
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: color.mute, lineHeight: '16px' }}>
        品牌全景没有默认主品或价差基准：图上每品牌一张图、只画该品牌已选产品；价差基准可在图表工具行显式选择。本选择与「产品对标」分别保存，来回切换不丢。
      </div>
    </div>
  );
}

/** 配置行尾「档位 · 现价」：档位 = 该配置在当前国家的分国档位（同选择产品树行尾）；
 *  现价 = 默认最低价色的最新价（币种随筛选）。无档位 / 无价则省略对应段。 */
function configTagOf(r: RomramNode, tierByKey: ReadonlyMap<string, string>, currency: 'usd' | 'local'): string {
  const tier = tierByKey.get(r.key) ?? '';
  const tierText = tier ? tierLabelShort((TIER_LABELS[tier] ?? tier).replace(/^(入门|旗舰) · /, '')) : '';
  const def = defaultColorSkuIds(r)[0];
  const info = r.colors.find((c) => c.skuId === def);
  const price = info ? (currency === 'usd' ? info.latestUsd : info.latestLocal) : null;
  return [tierText, price != null ? formatPrice(Math.round(price), currency) : ''].filter(Boolean).join(' · ');
}
