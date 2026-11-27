// ============================================================
// 分列视图分组纯模型（2026-11-27 二轮「视图：对标 / 分列」）：把唯一选择草稿
// mains 的全部在册选择（逐卡 主品 → 对比，卡序保序、selKey 首次出现为准）按
// 分组依据切成若干列组，喂给 ColumnsView 逐组一张图。分组规则：
// · brand  = 型号事实品牌（brandOfModel），组序 = brandOrder（选择产品树序：我司
//   置顶 → 矩阵列序 → 型号数），label = 品牌显示名；
// · series = 选择产品树同一系列节点（effectiveSeriesOf 读时生效链，与树完全同
//   口径——不自造规则），组序 = 品牌序 × 树内系列序，label = `{品牌} {系列}`；
// · tier   = 现价落档（tierPrice 口径，currentPricesByGroup 批量裁定；组键
//   `${modelId}|${romram}` 空白归一匹配——选择里的配置原文与维表一致，归一仅防
//   手工编辑载荷），组序 = 档位从高到低，无现价归末组「暂无现价」，
//   label = tierLabelShort 式短标（UI 另附「按现价落档」提示）。
// 组内保持输入顺序；空 mains → []。无副作用、无 React；事实表索引按调用现算。
// ============================================================
import { dimProduct } from '../../data';
import { TIER_LABELS, tierBandsOf } from '../../dataModel/aggregate';
import { currentPricesByGroup, groupKeyOf } from '../../dataModel/tierPrice';
import type { Industry } from '../../dataModel/types';
import type { ColumnsGroupBy, MainProduct, ProductSelection } from '../../state/filtersTypes';
import { selKey } from '../../state/mainSelection';
import { brandOfModel } from '../../components/ProductCascader/tree';
import { brandLabelOf } from '../../components/BrandMark';
import { tierLabelShort } from './helpers';
import { effectiveSeriesOf } from '../../state/deriveConfig';

export interface ColumnGroup {
  key: string;
  label: string;
  /** 分组依据为品牌时的品牌键（BrandDot / brandColorOf 用）；series/tier 组跨品牌 = undefined */
  brand?: string;
  sels: ProductSelection[];
}

/** mains → 在册选择序列（卡序；卡内主品在前、对比随后；selKey 首次出现为准） */
export function selectionsOfMains(mains: readonly MainProduct[]): ProductSelection[] {
  const seen = new Set<string>();
  const out: ProductSelection[] = [];
  for (const card of mains) {
    for (const sel of [card.main, ...card.compares]) {
      if (!sel) continue;
      const k = selKey(sel);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(sel);
    }
  }
  return out;
}

const norm = (s: string): string => s.replace(/\s+/g, '');
const boardKeyOf = (sel: ProductSelection): string => groupKeyOf(sel.modelId, sel.romram);

/** 型号 → dimProduct 行（系列 / 档位解析用；同型号任意一行即可——系列按型号裁定） */
const rowByModel = new Map<string, (typeof dimProduct)[number]>();
function dimRowOfModel(modelId: string): (typeof dimProduct)[number] | undefined {
  if (!rowByModel.size) {
    for (const p of dimProduct) {
      if (!rowByModel.has(p.model_id)) rowByModel.set(p.model_id, p);
    }
  }
  return rowByModel.get(modelId);
}

/** 型号系列名（与产品树同一解析链：effectiveSeriesOf 读时生效） */
function seriesOfModelId(modelId: string): string {
  const row = dimRowOfModel(modelId);
  return row ? effectiveSeriesOf(row) : modelId;
}

/** 分列分组（纯函数）：mains 在册选择 → 按 groupBy 分柱，组序规则见文件头 */
export function columnsOf(
  mains: readonly MainProduct[],
  groupBy: ColumnsGroupBy,
  ctx: { industry: Industry; countryCode: string; brandOrder: readonly string[] },
): ColumnGroup[] {
  const sels = selectionsOfMains(mains);
  if (!sels.length) return [];
  const brandRank = new Map(ctx.brandOrder.map((b, i) => [b, i] as const));
  const rankOfBrand = (b: string): number => brandRank.get(b) ?? 999;

  if (groupBy === 'brand') {
    const groups = new Map<string, ProductSelection[]>();
    for (const sel of sels) {
      const b = brandOfModel(sel.modelId);
      const list = groups.get(b);
      if (list) list.push(sel);
      else groups.set(b, [sel]);
    }
    return [...groups.entries()]
      .sort((a, b) => rankOfBrand(a[0]) - rankOfBrand(b[0]) || a[0].localeCompare(b[0]))
      .map(([brand, list]) => ({ key: `brand|${brand}`, label: brandLabelOf(brand), brand, sels: list }));
  }

  if (groupBy === 'series') {
    // 组序 = 品牌序 × 树内系列序（localeCompare numeric，与 buildProductTree 内排序同口径）
    const groups = new Map<string, { brand: string; series: string; sels: ProductSelection[] }>();
    for (const sel of sels) {
      const brand = brandOfModel(sel.modelId);
      const series = seriesOfModelId(sel.modelId);
      const key = `${brand}|${series}`;
      const g = groups.get(key);
      if (g) g.sels.push(sel);
      else groups.set(key, { brand, series, sels: [sel] });
    }
    return [...groups.values()]
      .sort((a, b) =>
        rankOfBrand(a.brand) - rankOfBrand(b.brand)
        || a.series.localeCompare(b.series, undefined, { numeric: true })
        || a.brand.localeCompare(b.brand))
      .map((g) => ({
        key: `series|${g.brand}|${g.series}`,
        label: `${brandLabelOf(g.brand)} ${g.series}`,
        sels: g.sels,
      }));
  }

  // tier：现价落档（tierPrice 批量裁定）；无现价 → 末组「暂无现价」
  const byGroup = currentPricesByGroup(ctx.industry, ctx.countryCode);
  const tierRank = new Map(tierBandsOf(ctx.industry).map((b, i) => [b.code, i] as const));
  const groups = new Map<string, ProductSelection[]>();
  const noPrice: ProductSelection[] = [];
  for (const sel of sels) {
    const entry = byGroup.get(boardKeyOf(sel));
    const band = entry?.tier ?? null;
    if (band == null) {
      noPrice.push(sel);
      continue;
    }
    const list = groups.get(band);
    if (list) list.push(sel);
    else groups.set(band, [sel]);
  }
  const out: ColumnGroup[] = [...groups.entries()]
    .sort((a, b) => (tierRank.get(b[0]) ?? -1) - (tierRank.get(a[0]) ?? -1)) // 高档在前
    .map(([band, list]) => ({
      key: `tier|${band}`,
      label: tierLabelShort(TIER_LABELS[band] ?? band),
      sels: list,
    }));
  if (noPrice.length) out.push({ key: 'tier|none', label: '暂无现价', sels: noPrice });
  return out;
}
