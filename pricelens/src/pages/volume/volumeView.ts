import type { MainProduct, ProductSelection } from '../../state/filtersTypes';

export type VolumeViewMode = { kind: 'mains' } | { kind: 'group'; cardId: string };

export interface VolumeProductRef {
  selection: ProductSelection;
  cardId: string;
  isMain: boolean;
}

export function validVolumeViewMode(cards: MainProduct[], mode: VolumeViewMode): VolumeViewMode {
  if (mode.kind === 'mains') return mode;
  return cards.some((card) => card.id === mode.cardId && card.main != null) ? mode : { kind: 'mains' };
}

export function volumeProductRefs(cards: MainProduct[], mode: VolumeViewMode): VolumeProductRef[] {
  const source = mode.kind === 'group'
    ? cards.filter((card) => card.id === mode.cardId && card.main != null)
    : cards;
  const out: VolumeProductRef[] = [];
  const seen = new Set<string>();
  for (const card of source) {
    const items: { selection: ProductSelection; isMain: boolean }[] = [];
    if (card.main) items.push({ selection: card.main, isMain: true });
    if (mode.kind === 'group') {
      for (const selection of card.compares) items.push({ selection, isMain: false });
    }
    for (const item of items) {
      const key = `${item.selection.modelId}__${item.selection.romram.replace(/\s+/g, '')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ...item, cardId: card.id });
    }
  }
  return out;
}
