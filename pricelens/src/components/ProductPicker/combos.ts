// ============================================================
// 模板（产品对组合）存储与纯计算 —— 「选择产品」浮窗与模板编辑浮窗共用。
// 持久化 = localStorage LPL3.ui.mainCombos（第一百三十轮起显式保存：
// 不再随浮窗收起自动记录；单模板 = 一个产品对，多对 = 模板组，上限 8 淘汰最旧）。
// 无副作用（读写在 try 内兜底）；不持有 React 状态。
// ============================================================
import type { MainProduct, ProductSelection } from '../../state/filtersTypes';
import { LPL } from '../../state/lplKeys';
import { cardQuota, MAINS_CAP, newCardId, selKey } from '../../state/mainSelection';
import { modelNameOf } from '../ProductCascader/tree';

export interface StoredCombo {
  label: string;
  cards: MainProduct[];
}

function isSelection(v: unknown): v is ProductSelection {
  return typeof v === 'object' && v !== null
    && typeof (v as ProductSelection).modelId === 'string'
    && typeof (v as ProductSelection).romram === 'string'
    && Array.isArray((v as ProductSelection).skuIds);
}

function isStoredCard(v: unknown): v is MainProduct {
  if (typeof v !== 'object' || v === null) return false;
  const c = v as MainProduct;
  return typeof c.id === 'string'
    && (c.main === null || isSelection(c.main))
    && Array.isArray(c.compares)
    && c.compares.every(isSelection);
}

export function readCombos(): StoredCombo[] {
  try {
    const raw = localStorage.getItem(LPL.uiMainCombos);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (c): c is StoredCombo =>
        typeof c === 'object' && c !== null && typeof (c as StoredCombo).label === 'string'
        && Array.isArray((c as StoredCombo).cards) && (c as StoredCombo).cards.every(isStoredCard),
    );
  } catch {
    return [];
  }
}

/** 模板持久化（写入失败静默忽略，仅内存生效） */
export function writeCombos(combos: StoredCombo[]): void {
  try {
    localStorage.setItem(LPL.uiMainCombos, JSON.stringify(combos));
  } catch {
    /* 存储不可用忽略 */
  }
}

/** 模板数上限（放不下的收进「更多」下拉；超限淘汰最旧） */
export const TEMPLATE_CAP = 8;

/** 主品集合签名（去重口径：只看主品，不看对比区/颜色） */
export function comboSignature(cards: MainProduct[]): string {
  return cards.map((c) => (c.main ? selKey(c.main) : `~${c.compares.map(selKey).join('+')}`)).join('|');
}

/** 完整内容签名（主品 + 对比区 + 颜色）：恢复是否会覆盖当前已选的判定依据
 *  （comboSignature 只看主品集合，是模板列表去重口径，不够严） */
export function contentSignature(cards: MainProduct[]): string {
  const sel = (s: ProductSelection): string => `${selKey(s)}#${[...s.skuIds].sort().join(',')}`;
  return cards.map((c) => `${c.main ? sel(c.main) : '~'}:${c.compares.map(sel).join('+')}`).join('|');
}

/** 模板默认名 = 主分析产品名；同型号多组「X · N 组」，多型号「A、B」/「A 等 N 款」 */
export function defaultTemplateName(cards: MainProduct[]): string {
  const names = [...new Set(cards.map((c) => (c.main ? modelNameOf(c.main.modelId) : '对比产品')))];
  if (names.length === 1) return cards.length === 1 ? names[0] : `${names[0]} · ${cards.length} 组`;
  if (names.length === 2) return names.join('、');
  return `${names[0]} 等 ${names.length} 款`;
}

/** 「＋ 加入当前选择」增量计划（逐模板卡，纯函数；第一百三十一轮第二次修订）：
 *  ①模板卡主品不在当前选择 → 整卡追加（内容含对比区/auto 原样带入，新 id；
 *    卡数受 cap 封顶，放不下的计入 overflowCards）；
 *  ②模板卡主品已在当前选择 → 只把缺失的对比合并进现有卡（selKey 去重、与目标
 *    卡主品同组的跳过、卡配额封顶，放不下的计入 overflowCompares）；确有新增
 *    对比的卡由调用方经 setCardCompares 落地（该动作自带「手动改对比即关自动」
 *    的既有铁律）。同一张现有卡被多个模板对命中时合并累计、配额合并计算。 */
export function planAppend(
  mains: MainProduct[],
  combo: StoredCombo,
  cap: number = MAINS_CAP,
): {
  fresh: MainProduct[];
  merges: { cardId: string; compares: ProductSelection[] }[];
  overflowCards: number;
  overflowCompares: number;
} {
  const fresh: MainProduct[] = [];
  const freshKeys = new Set<string>();
  const mergeMap = new Map<string, { adds: ProductSelection[]; have: Set<string> }>();
  let overflowCards = 0;
  let overflowCompares = 0;
  for (const t of combo.cards) {
    if (!t.main) continue;
    const k = selKey(t.main);
    const existing = mains.find((x) => x.main != null && selKey(x.main) === k);
    if (!existing) {
      if (mains.length + fresh.length >= cap) {
        overflowCards += 1;
        continue;
      }
      if (!freshKeys.has(k)) {
        freshKeys.add(k);
        fresh.push({ ...t, id: newCardId() });
      }
      continue;
    }
    let entry = mergeMap.get(existing.id);
    if (!entry) {
      entry = { adds: [], have: new Set([k, ...existing.compares.map(selKey)]) };
      mergeMap.set(existing.id, entry);
    }
    for (const cmp of t.compares) {
      const ck = selKey(cmp);
      if (entry.have.has(ck)) continue;
      if (existing.compares.length + entry.adds.length >= cardQuota(existing)) {
        overflowCompares += 1;
        continue;
      }
      entry.have.add(ck);
      entry.adds.push(cmp);
    }
  }
  return {
    fresh,
    // 只产出确有新增对比的合并项（零新增的卡不进计划 → 不触发「退出自动」、tooltip 如实）
    merges: [...mergeMap.entries()].flatMap(([cardId, m]) => (m.adds.length ? [{ cardId, compares: m.adds }] : [])),
    overflowCards,
    overflowCompares,
  };
}
