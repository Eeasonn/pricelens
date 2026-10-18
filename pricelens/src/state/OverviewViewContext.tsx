import {
  createContext,
  useContext,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type ReactNode,
  type SetStateAction,
} from 'react';
import type { ProductSelection } from './filtersTypes';
import { withAllCompExpansion } from './overviewViewState';

export interface OverviewViewContextValue {
  prodSel: ProductSelection[];
  setProdSel: Dispatch<SetStateAction<ProductSelection[]>>;
  selTiers: string[];
  setSelTiers: Dispatch<SetStateAction<string[]>>;
  compExpansion: Record<string, boolean>;
  setCompExpanded(id: string, expanded: boolean): void;
  setAllCompExpanded(visibleIds: string[], expanded: boolean): void;
  scrollTop: MutableRefObject<number>;
}

export const OverviewViewContext = createContext<OverviewViewContextValue>({
  prodSel: [],
  setProdSel: () => {},
  selTiers: [],
  setSelTiers: () => {},
  compExpansion: {},
  setCompExpanded: () => {},
  setAllCompExpanded: () => {},
  scrollTop: { current: 0 },
});

export function OverviewViewProvider({ children }: { children: ReactNode }) {
  const [prodSel, setProdSel] = useState<ProductSelection[]>([]);
  const [selTiers, setSelTiers] = useState<string[]>([]);
  const [compExpansion, setCompExpansion] = useState<Record<string, boolean>>({});
  const scrollTop = useRef(0);

  const actions = useMemo(
    () => ({
      setCompExpanded: (id: string, expanded: boolean) =>
        setCompExpansion((current) => ({ ...current, [id]: expanded })),
      setAllCompExpanded: (visibleIds: string[], expanded: boolean) =>
        setCompExpansion((current) => withAllCompExpansion(visibleIds, expanded, current)),
    }),
    [],
  );

  const value = useMemo<OverviewViewContextValue>(
    () => ({ prodSel, setProdSel, selTiers, setSelTiers, compExpansion, ...actions, scrollTop }),
    [prodSel, selTiers, compExpansion, actions, scrollTop],
  );

  return <OverviewViewContext.Provider value={value}>{children}</OverviewViewContext.Provider>;
}

export function useOverviewView() {
  return useContext(OverviewViewContext);
}
