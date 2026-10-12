import { createContext, useContext, useState, type ReactNode } from 'react';

export type Page = 'dashboard' | 'config';

interface PageCtx {
  page: Page;
  go: (p: Page) => void;
}

const Ctx = createContext<PageCtx>({ page: 'dashboard', go: () => {} });

export function PageProvider({ children }: { children: ReactNode }) {
  const [page, setPage] = useState<Page>('dashboard');
  return <Ctx.Provider value={{ page, go: setPage }}>{children}</Ctx.Provider>;
}

export function usePage() {
  return useContext(Ctx);
}
