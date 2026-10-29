// 多平台对比的产品切换范围：只允许在顶部筛选器已经选中的产品之间换，
// 不再另开一套全量产品树。顺序 = 选择浮窗卡序，卡内主品在前、对比在后；
// 同型号 + 同配置（忽略空格）只出现一次。
import type { MainProduct, ProductSelection } from '../../state/filtersTypes';

export interface SelectedProductPick {
  modelId: string;
  romram: string;
}

const pickKey = (s: { modelId: string; romram: string }): string => `${s.modelId}|${s.romram.replace(/\s+/g, '')}`;

export function selectedProductsOf(mains: MainProduct[]): SelectedProductPick[] {
  const seen = new Set<string>();
  const out: SelectedProductPick[] = [];
  const push = (s: ProductSelection | null | undefined): void => {
    if (!s) return;
    const key = pickKey(s);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ modelId: s.modelId, romram: s.romram });
  };
  for (const card of mains) {
    push(card.main);
    for (const c of card.compares) push(c);
  }
  return out;
}

/** 进入多平台对比时的默认产品：第一张有主品的卡的主品；否则清单第一项。 */
export function preferredSelectedProduct(mains: MainProduct[], options: SelectedProductPick[]): SelectedProductPick | null {
  const main = mains.find((c) => c.main)?.main;
  if (main) {
    const key = pickKey(main);
    const hit = options.find((o) => pickKey(o) === key);
    if (hit) return hit;
  }
  return options[0] ?? null;
}
