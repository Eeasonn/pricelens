// ============================================================
// 代际视图纯模型（2026-11-27 三轮「代际视图」）：把 mains 在册选择按数据包
// prevGen 映射拼成「代际链」（上一代替役 → 新一代接棒），供 LineageView 逐链
// 画阶梯线。规则（决策记录见 .impeccable/surfaces/stable-optimization-20261127.md §5）：
// · 链尖 = 在册选择中「不是另一在册选择（maxBack 代以内传递闭包）上一代」的产品；
//   从链尖沿 prevOf 向前回溯最多 maxBack 代（按 key 防环）。未在册的上一代自动
//   拼接进链（selected:false）——这正是拼接的意义；解析方式与 groupsFromPrevGeneration
//   同源（最低价颜色 SKU、romram 取 dimProduct 原值、主数据没有的映射目标跳过）。
// · 一对多上一代 = 每条路径各成一链（去重相同路径）；链序 = 链尖出现在选择序列的次序。
// · 拼接序列：每个桶位的「活跃代」= 在该桶位有价、且已到自己首个有价桶位的最新一代；
//   交接点 = 最新一代的首个有价桶位，交接后主线跟随最新一代（即使上一代仍有价）。
//   交接后上一代的价格不丢——作为 overlap 返回（淡色呈现）。缺采桶位保持缺失
//   （不插值）；活跃线上连续缺失走标准 [4,4] 虚线桥（无标注）。
// · 阶梯 = 显示整数取整后等价的连续价格段；段首 = 一个 step。changePct = 段价对
//   上一段价的变化率；交接 step 对上一代最后价格同样算 changePct。
// · 标注抽稀：交接 step 与首个 step 恒标；其余仅 |changePct| ≥ 0.03 标；超过 6 个
//   保留 交接 + 首段 + |changePct| 最大者至 6 个。未标注 step 在悬停明细照样全量。
// 无副作用、无 React；prevOf 注入以便测试（生产 = data.prevGenTargetsFor）。
// ============================================================
import { dimProduct } from '../../data';
import { lowestPriceColorSku } from '../../dataModel/aggregate';
import type { Series, SeriesPoint } from '../../dataModel/types';
import type { ColumnsGroupBy, ProductSelection } from '../../state/filtersTypes';
import { selKey } from '../../state/mainSelection';
import { modelNameOf, configTextOf } from '../../components/ProductCascader/tree';
import { columnsOf } from './columnsModel';

export interface LineageGen {
  sel: ProductSelection;
  key: string; // selKey
  label: string; // 型号名 + configTextOf
  selected: boolean; // 在 mains 在册选择中
}

export interface LineageChain {
  key: string;
  gens: LineageGen[]; // 最老 → 最新
  registered: boolean; // 链上有 ≥1 条 prevGen 映射（拼接出来的代）；false = 只有本代
}

/** 型号+配置 → 展示名（型号名 + 配置文本；无配置 = 只型号名） */
export function genLabelOf(modelId: string, romram: string): string {
  const cfg = configTextOf(romram);
  return `${modelNameOf(modelId)}${cfg ? ` ${cfg}` : ''}`;
}

/** 映射目标 → ProductSelection（dimProduct 原值 romram + 最低价颜色 SKU；
 *  主数据不存在该配置组 = null 跳过——与 groupsFromPrevGeneration 同口径） */
function resolveTargetSel(modelId: string, romram: string): ProductSelection | null {
  const rows = dimProduct.filter((p) => p.model_id === modelId && p.romram.replace(/\s+/g, '') === romram.replace(/\s+/g, ''));
  if (!rows.length) return null;
  const canonical = rows[0].romram;
  return { modelId, romram: canonical, skuIds: [lowestPriceColorSku(modelId, canonical) ?? rows[0].sku_id] };
}

/**
 * 代际链拼接：sels（mains 在册序列）→ 链数组。
 * @param prevOf 「当前配置组 → 上一代配置组」查表（生产 = data.prevGenTargetsFor，测试注入）
 * @param maxBack 最多向前回溯的代数（缺省 3）
 */
export function lineageChainsOf(
  sels: readonly ProductSelection[],
  prevOf: (modelId: string, romram: string) => [string, string][],
  maxBack = 3,
): LineageChain[] {
  if (!sels.length) return [];
  const byKey = new Map<string, ProductSelection>();
  for (const sel of sels) if (!byKey.has(selKey(sel))) byKey.set(selKey(sel), sel);

  // 在册选择中「是别人上一代」的键集（maxBack 代传递闭包内）——链尖排除它们
  const predecessorKeys = new Set<string>();
  for (const sel of sels) {
    const seen = new Set<string>([selKey(sel)]);
    let frontier: ProductSelection[] = [sel];
    for (let depth = 0; depth < maxBack && frontier.length; depth++) {
      const next: ProductSelection[] = [];
      for (const cur of frontier) {
        for (const [pm, pr] of prevOf(cur.modelId, cur.romram)) {
          const prevSel = resolveTargetSel(pm, pr) ?? { modelId: pm, romram: pr, skuIds: [] };
          const pk = selKey(prevSel);
          if (seen.has(pk)) continue;
          seen.add(pk);
          if (byKey.has(pk)) predecessorKeys.add(pk);
          next.push(prevSel);
        }
      }
      frontier = next;
    }
  }

  const tips = sels.filter((sel) => !predecessorKeys.has(selKey(sel)));
  const chains: LineageChain[] = [];
  const chainSeen = new Set<string>();

  for (const tip of tips) {
    // 从链尖向前回溯：一对多上一代 = 每条路径各成一链（DFS，防环）
    type Path = ProductSelection[]; // 最老 → 最新（末尾 = 链尖）
    const paths: Path[] = [];
    const walk = (chainSoFar: ProductSelection[], depthLeft: number): void => {
      const head = chainSoFar[0]; // 当前最老端
      if (depthLeft <= 0) {
        paths.push(chainSoFar);
        return;
      }
      const prevs: ProductSelection[] = [];
      for (const [pm, pr] of prevOf(head.modelId, head.romram)) {
        // 已在册的上一代直接用册内选择（规格：解析/跳过规则只管「未在册」的拼接代）
        const inSels = sels.find((x) => x.modelId === pm && selKey(x) === `${pm}|${pr.replace(/\s+/g, '')}`)
          ?? sels.find((x) => x.modelId === pm && x.romram.replace(/\s+/g, '') === pr.replace(/\s+/g, ''));
        const prevSel = inSels ?? resolveTargetSel(pm, pr);
        if (!prevSel) continue;
        const pk = selKey(prevSel);
        if (chainSoFar.some((s) => selKey(s) === pk)) continue; // 防环
        prevs.push(prevSel);
      }
      if (!prevs.length) {
        paths.push(chainSoFar);
        return;
      }
      for (const prevSel of prevs) walk([prevSel, ...chainSoFar], depthLeft - 1);
    };
    walk([tip], maxBack);

    for (const path of paths) {
      const gens: LineageGen[] = path.map((sel) => ({
        sel,
        key: selKey(sel),
        label: genLabelOf(sel.modelId, sel.romram),
        selected: byKey.has(selKey(sel)),
      }));
      const key = gens.map((g) => g.key).join('>');
      if (chainSeen.has(key)) continue; // 相同路径去重
      chainSeen.add(key);
      chains.push({
        key,
        gens,
        registered: gens.length > 1,
      });
    }
  }
  return chains;
}

/** 链 → 卡片分组：按链尖（最新一代）的 品牌/系列/档位 归组——复用 columnsOf
 *  的分组口径（tip 的 sel 构造一卡一组的伪 mains 喂给它太重；这里直接按 tip
 *  逐个分，语义 = columnsOf 作用于「只含 tip」的选择序列） */
export function lineageCardsOf(
  chains: readonly LineageChain[],
  groupBy: ColumnsGroupBy,
  ctx: { industry: Parameters<typeof columnsOf>[2]['industry']; countryCode: string; brandOrder: readonly string[] },
): { key: string; label: string; brand?: string; chains: LineageChain[] }[] {
  if (!chains.length) return [];
  // tip 选择序列 → columnsOf 分组 → 组键/标签/顺序；再把链按 tip key 归位
  const tips = chains.map((c) => c.gens[c.gens.length - 1].sel);
  const groups = columnsOf(
    [{ id: 'lineage-tips', main: null, compares: [...tips] }],
    groupBy,
    ctx,
  );
  const chainByTip = new Map<string, LineageChain>();
  for (const c of chains) chainByTip.set(c.gens[c.gens.length - 1].key, c);
  return groups.map((g) => ({
    key: g.key,
    label: g.label,
    brand: g.brand,
    chains: g.sels.map((sel) => chainByTip.get(selKey(sel))!).filter(Boolean),
  }));
}

// ---------------- 拼接序列 ----------------

export interface LineagePoint {
  bucketId: string;
  price: number | null;
  genIndex: number | null; // 该桶位活跃代（gens 下标）；无活跃代 = null
}

export interface LineageStep {
  bucketId: string;
  price: number;
  genIndex: number;
  changePct: number | null; // 对上一段价（含跨交接：对上一代最后价）
  handover: boolean;
}

export interface SplicedSeries {
  points: LineagePoint[];
  steps: LineageStep[];
  /** 交接后上一代仍有价的点（淡色呈现，不进主线） */
  overlap: { genIndex: number; points: { bucketId: string; price: number }[] }[];
}

/**
 * 拼接序列：seriesByKey = selKey → buildSeries 产出的 Series（全部代在同一查询里取）。
 * 活跃代规则（规格原文）：每桶位活跃代 = 该桶位有价、且已到自己首个有价桶位的
 * 最新一代——交接发生在最新一代的首个有价桶位；两代同有价时最新一代赢（老一代
 * 进 overlap），最新一代缺采的桶位回落到仍有价的老一代（缺采不造点，不插值）。
 * 价格 = SeriesPoint.price（显示币种，buildSeries 已取整）。
 */
export function splicedSeriesOf(chain: LineageChain, seriesByKey: Map<string, Series>): SplicedSeries {
  const gensSeries = chain.gens.map((g) => seriesByKey.get(g.key) ?? null);
  // 桶位并集（id 有序）
  const bucketSet = new Set<string>();
  for (const s of gensSeries) {
    if (!s) continue;
    for (const p of s.points) bucketSet.add(p.bucketId);
  }
  const bucketIds = [...bucketSet].sort();

  const pointOf = (gi: number, bucketId: string): { price: number | null; missing: boolean } | null => {
    const s = gensSeries[gi];
    if (!s) return null;
    const p = s.points.find((x) => x.bucketId === bucketId);
    if (!p) return null;
    return { price: p.missing ? null : p.price, missing: p.missing };
  };
  // 各代首个有价桶位
  const firstPriced = gensSeries.map((s) => {
    if (!s) return null;
    const hit = s.points.find((p) => !p.missing && p.price != null);
    return hit ? hit.bucketId : null;
  });

  const points: LineagePoint[] = [];
  const overlapMap = new Map<number, { bucketId: string; price: number }[]>();
  for (const b of bucketIds) {
    // 活跃代 = 最新一代中「已到首个有价桶位且本桶位有价」者
    let active: number | null = null;
    for (let gi = gensSeries.length - 1; gi >= 0; gi--) {
      const fp = firstPriced[gi];
      if (fp == null || b < fp) continue;
      const pt = pointOf(gi, b);
      if (pt && pt.price != null) {
        active = gi;
        break;
      }
    }
    const activePt = active != null ? pointOf(active, b) : null;
    points.push({ bucketId: b, price: activePt?.price ?? null, genIndex: active });
    // overlap：同桶位非活跃代的价（老一代在交接后仍有价的呈现素材；不丢）
    if (active != null) {
      for (let gi = 0; gi < gensSeries.length; gi++) {
        if (gi === active) continue;
        const pt = pointOf(gi, b);
        if (pt && pt.price != null) {
          const arr = overlapMap.get(gi) ?? [];
          arr.push({ bucketId: b, price: pt.price });
          overlapMap.set(gi, arr);
        }
      }
    }
  }

  // 阶梯：活跃线上等价（已取整）连续价格段；跨缺失桶位同价视为同段延续
  //（缺失走虚线桥、不另起段）；换代 = 新段（交接 step，即使同价）。
  const steps: LineageStep[] = [];
  let lastPrice: number | null = null; // 活跃线上最近一个价（交接 step 的 changePct 基准 = 上一代最后价）
  let lastGen = -1;
  let lastStepPrice: number | null = null; // 上一段价（非交接 step 的 changePct 基准）
  for (const pt of points) {
    if (pt.price == null || pt.genIndex == null) continue;
    const handover = lastGen >= 0 && pt.genIndex !== lastGen;
    if (!handover && lastStepPrice != null && pt.price === lastStepPrice) {
      lastPrice = pt.price;
      continue; // 同段延续
    }
    const base = handover ? lastPrice : lastStepPrice;
    steps.push({
      bucketId: pt.bucketId,
      price: pt.price,
      genIndex: pt.genIndex,
      changePct: base != null && base !== 0 ? (pt.price - base) / base : null,
      handover,
    });
    lastStepPrice = pt.price;
    lastPrice = pt.price;
    lastGen = pt.genIndex;
  }

  return {
    points,
    steps,
    overlap: [...overlapMap.entries()].map(([genIndex, pts]) => ({ genIndex, points: pts })),
  };
}

/**
 * 拼接序列 → 共享 Chart 序列点（2026-11-28 代际视图改走 ECharts 共享图）：
 * 沿 buckets（分列视图同一份全集桶枚举）逐桶产出——活跃桶复制活跃代该桶的
 * SeriesPoint（price/rrp/offer/url/shopName/missing 全真，不造点）+ 附 genLabel
 * （当代名，悬停小卡「当代：」行）；非活跃桶出 missing 骨架点（沿用活跃代最近
 * 参考点的 xLabel/anchorDate/offer/url 形状，bucketId 用该桶自身）。
 * genAt = splicedSeriesOf 的逐桶结果（points[].bucketId → genIndex）。
 */
export function splicedSeriesPointsOf(
  genSeries: readonly (Series | null)[],
  genLabels: readonly string[],
  genAt: ReadonlyMap<string, number>,
  buckets: readonly { id: string; xLabel: string }[],
): SeriesPoint[] {
  const refPoint = (gi: number, bucketId: string): SeriesPoint | null => {
    const s = genSeries[gi];
    if (!s) return null;
    return s.points.find((p) => p.bucketId === bucketId) ?? null;
  };
  return buckets.map((b) => {
    const gi = genAt.get(b.id);
    if (gi == null) {
      return {
        bucketId: b.id,
        xLabel: b.xLabel,
        anchorDate: '',
        rrp: null,
        price: null,
        missing: true,
        offer: null,
        url: '',
        shopName: null,
        genLabel: null,
      };
    }
    const src = refPoint(gi, b.id);
    if (!src) {
      return {
        bucketId: b.id,
        xLabel: b.xLabel,
        anchorDate: '',
        rrp: null,
        price: null,
        missing: true,
        offer: null,
        url: '',
        shopName: null,
        genLabel: genLabels[gi] ?? null,
      };
    }
    return { ...src, genLabel: genLabels[gi] ?? null };
  });
}

/** 交接名签短名（2026-11-28 定版保留）：型号尾部 + 配置数字头——
 *  「HUAWEI Mate 80 Pro 16+512 GB」→「80 Pro 16+」；无配置回退全标签。 */
export function genShortName(label: string): string {
  const m = label.match(/^(\S*?(\d+\w*(?:\s\w+)?)\s(\d+\+\d+))/);
  if (m) return `${m[2]} ${m[3]}`;
  const cfg = label.match(/\s(\d+\+\d+)/);
  if (cfg) {
    const before = label.slice(0, cfg.index).split(/\s+/).filter(Boolean);
    const tail = before.slice(-2).join(' ');
    return `${tail} ${cfg[1]}`;
  }
  return label;
}

// ---------------- 标注抽稀 ----------------

/** 阶梯标注抽稀：返回应标注的 step 下标集。交接与首段恒标；其余 |changePct| ≥ 0.03
 *  才标；超过 maxLabels 个时保留 交接+首段+|changePct| 最大者。 */
export function thinnedStepLabels(steps: readonly LineageStep[], maxLabels = 6): Set<number> {
  const always = new Set<number>();
  const candidates: { i: number; mag: number }[] = [];
  steps.forEach((s, i) => {
    if (i === 0 || s.handover) {
      always.add(i);
    } else if (s.changePct != null && Math.abs(s.changePct) >= 0.03) {
      candidates.push({ i, mag: Math.abs(s.changePct) });
    }
  });
  const out = new Set<number>(always);
  if (always.size + candidates.length <= maxLabels) {
    for (const c of candidates) out.add(c.i);
    return out;
  }
  // 超额：按 |changePct| 从大到小补到 maxLabels（并列取靠前段）
  const room = Math.max(0, maxLabels - always.size);
  candidates.sort((a, b) => b.mag - a.mag || a.i - b.i);
  for (const c of candidates.slice(0, room)) out.add(c.i);
  return out;
}


