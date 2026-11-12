import { useEffect, useMemo, useRef, useState } from 'react';
import { dimProduct } from '../data';
import { buildFilterPatch } from '../agent-stable/core';
import type { AgentSuggestion } from '../agent-stable';
import { useAgent } from '../state/AgentContextStable';
import { useFilters } from '../state/FiltersContext';
import { usePage } from '../state/PageContext';
import { newCardId, withAutoOn } from '../state/mainSelection';
import type { MainProduct, ProductSelection } from '../state/filtersTypes';
import { brandLabelOf } from './BrandMark';
import { AGENT_STATUS_LABELS, platformShortcutLabel, PRICE_TREND_AI_SUGGESTIONS } from './CopilotStable/agentCopy';
import { PriceSearchSurface } from './Search/PriceSearchSurface';

type SearchMode = 'products' | 'ai';

interface ProductHit {
  modelId: string;
  brand: string;
  modelName: string;
  series: string;
  romram: string;
  skuId: string;
  isOwn: boolean;
  /** All country-valid configurations for this model, kept together so a
   * search result never silently chooses the first SKU. */
  configOptions: Array<{ romram: string; skuId: string; color: string }>;
}

const normalize = (value: string): string => value.trim().toLocaleLowerCase();
const compactSearch = (value: string): string => normalize(value).replace(/[\s_\-]+/g, '');

const COUNTRY_QUERY_WORDS = ['r国', '俄罗斯', '俄国', '中国', '巴西', '法国', '德国', '英国', '美国', '日本'];

export function productHits(query: string, countryCode: string, industry: string): ProductHit[] {
  const q = compactSearch(query);
  const queryTokens = normalize(query).split(/[^a-z0-9\u4e00-\u9fff]+/i).map(compactSearch).filter((token) => token.length > 1 && !COUNTRY_QUERY_WORDS.includes(token));
  const grouped = new Map<string, ProductHit>();
  const hits: ProductHit[] = [];
  for (const product of dimProduct) {
    if (product.industry !== industry || !product.countries.includes(countryCode)) continue;
    const haystack = compactSearch(`${product.brand} ${brandLabelOf(product.brand)} ${product.model_name} ${product.series} ${product.romram}`);
    if (q && !haystack.includes(q) && !queryTokens.every((token) => haystack.includes(token))) continue;
    const existing = grouped.get(product.model_id);
    if (existing) {
      if (!existing.configOptions.some((option) => option.romram === product.romram && option.skuId === product.sku_id)) {
        existing.configOptions.push({ romram: product.romram, skuId: product.sku_id, color: product.color });
      }
      continue;
    }
    grouped.set(product.model_id, {
      modelId: product.model_id,
      brand: product.brand,
      modelName: product.model_name,
      series: product.series,
      romram: product.romram,
      skuId: product.sku_id,
      isOwn: product.is_own,
      configOptions: [{ romram: product.romram, skuId: product.sku_id, color: product.color }],
    });
  }
  hits.push(...grouped.values());
  hits.forEach((hit) => {
    hit.configOptions.sort((a, b) => a.romram.localeCompare(b.romram) || a.skuId.localeCompare(b.skuId));
    // The first option is deterministic and visible in the result row; the
    // user can choose another config before applying it to the dashboard.
    const defaultOption = hit.configOptions[0];
    if (defaultOption) {
      hit.romram = defaultOption.romram;
      hit.skuId = defaultOption.skuId;
    }
  });
  return hits
    .sort((a, b) => Number(b.isOwn) - Number(a.isOwn) || Number(compactSearch(b.modelName) === q) - Number(compactSearch(a.modelName) === q) || a.modelName.localeCompare(b.modelName));
}

export function selectionOf(hit: ProductHit, skuId = hit.skuId): ProductSelection {
  const config = hit.configOptions.find((option) => option.skuId === skuId) ?? hit.configOptions[0];
  return { modelId: hit.modelId, romram: config?.romram ?? hit.romram, skuIds: [config?.skuId ?? skuId] };
}

export function cardOf(hit: ProductHit, skuId = hit.skuId): MainProduct {
  const card: MainProduct = { id: newCardId(), main: selectionOf(hit, skuId), compares: [] };
  return hit.isOwn ? withAutoOn(card) : card;
}

export default function PriceTrendSearch() {
  const { page } = usePage();
  const { state, actions } = useFilters();
  const { open: agentOpen, openAgent, send, running, runStatus, activeRun, voiceAvailable, voiceListening, startVoice } = useAgent();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [renderedOpen, setRenderedOpen] = useState(false);
  const [mode, setMode] = useState<SearchMode>('products');
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const submittedPromptRef = useRef('');

  const hits = useMemo(() => productHits(query, state.countryCode, state.industry).slice(0, query.trim() ? 6 : 4), [query, state.countryCode, state.industry]);
  const trimmed = query.trim();
  const isDashboard = page === 'dashboard';
  const shortcutLabel = platformShortcutLabel();

  useEffect(() => {
    setActiveIndex(0);
  }, [mode, query, state.countryCode, state.industry]);

  useEffect(() => {
    if (!isDashboard) return undefined;
    const onShortcut = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        if (agentOpen) return;
        event.preventDefault();
        openSearch();
        window.setTimeout(() => inputRef.current?.focus(), 0);
      }
      if (event.key === 'Escape' && open) {
        setOpen(false);
        closeSearch();
      }
    };
    // Capture this shortcut before the Agent provider's global handler so the
    // visible header search is the first entry point on the dashboard. The
    // provider still owns the same shortcut everywhere else.
    window.addEventListener('keydown', onShortcut, true);
    return () => window.removeEventListener('keydown', onShortcut, true);
  }, [agentOpen, isDashboard, open]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) closeSearch();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  if (!isDashboard) return null;

  const closeSearch = () => {
    setOpen(false);
    setRenderedOpen(false);
    inputRef.current?.blur();
  };

  const openSearch = () => {
    setRenderedOpen(true);
    setOpen(true);
  };

  const handoffToFilters = () => {
    // Stable line keeps the handoff static; the filters state itself is the
    // visible confirmation and remains accessible without motion.
  };

  const close = (preserveQuery = false) => {
    closeSearch();
    setOpen(false);
    if (!preserveQuery) {
      setQuery('');
      setMode('products');
    }
    setActiveIndex(0);
  };

  const useSuggestion = (suggestion: AgentSuggestion) => {
    setMode('ai');
    setQuery(suggestion.prompt);
    setActiveIndex(0);
    openSearch();
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  const searchWithAgent = () => {
    if (!trimmed || running) return;
    submittedPromptRef.current = trimmed;
    const patch = buildFilterPatch(trimmed, state);
    if (Object.keys(patch).length) {
      actions.set(patch);
      handoffToFilters();
    }
    close(true);
    openAgent('dock', trimmed);
    // Let the filter context commit the NL country/product handoff before the
    // Agent snapshots its context. The response still comes from the local
    // deterministic engine or configured remote-with-fallback client.
    window.setTimeout(() => void send(trimmed), 0);
  };

  const selectProduct = (hit: ProductHit, skuId = hit.skuId) => {
    const patch = buildFilterPatch(trimmed, state);
    const selectedCard = cardOf(hit, skuId);
    if (patch.countryCode) {
      actions.set({ ...patch, mains: [selectedCard] });
      handoffToFilters();
    } else {
      actions.setMains([selectedCard]);
    }
    close();
  };

  const sameAsSubmitted = trimmed.length > 0 && submittedPromptRef.current === trimmed;
  const aiFailureMessage = sameAsSubmitted && runStatus === 'failed'
    ? activeRun?.error?.message ?? '这次分析没有完成，请重试。'
    : null;
  const aiStatusMessage = sameAsSubmitted && runStatus === 'completed'
    ? '结果已在 Agent 面板生成'
    : sameAsSubmitted
      ? (AGENT_STATUS_LABELS[runStatus] ?? AGENT_STATUS_LABELS.idle)
      : AGENT_STATUS_LABELS.idle;

  return <PriceSearchSurface rootRef={rootRef} inputRef={inputRef} panelRef={panelRef}
    open={open} renderedOpen={renderedOpen} mode={mode} query={query} countryCode={state.countryCode}
    products={hits.map((hit) => ({ ...hit, brand: brandLabelOf(hit.brand), configurations: hit.configOptions }))}
    activeIndex={activeIndex} shortcut={shortcutLabel} running={running} voiceAvailable={voiceAvailable}
    voiceListening={voiceListening} failure={aiFailureMessage} status={aiStatusMessage}
    completed={sameAsSubmitted && runStatus === 'completed'} suggestions={PRICE_TREND_AI_SUGGESTIONS.map((suggestion) => suggestion.label)}
    onOpen={() => openSearch()} onQuery={(value) => { setQuery(value); openSearch(); }}
    onMode={setMode} onActive={setActiveIndex} onVoice={() => void startVoice((transcript) => {
      setQuery((previous) => `${previous}${previous ? ' ' : ''}${transcript}`); openSearch();
    })}
    onSelect={(index, skuId) => selectProduct(hits[index], skuId)}
    onSuggestion={(index) => useSuggestion(PRICE_TREND_AI_SUGGESTIONS[index])} onSubmit={searchWithAgent}
    onOpenAgent={() => openAgent('dock', submittedPromptRef.current)}
    onKeyDown={(event) => {
      if (event.key === 'Escape' && open) {
        event.preventDefault(); close();
      } else if (event.key === 'ArrowDown' && mode === 'products' && hits.length) {
        event.preventDefault(); setActiveIndex((index) => (index + 1) % hits.length);
      } else if (event.key === 'ArrowUp' && mode === 'products' && hits.length) {
        event.preventDefault(); setActiveIndex((index) => (index - 1 + hits.length) % hits.length);
      } else if (event.key === 'Enter' && mode === 'ai') {
        event.preventDefault(); searchWithAgent();
      } else if (event.key === 'Enter' && mode === 'products' && hits.length) {
        event.preventDefault(); selectProduct(hits[activeIndex] ?? hits[0]);
      } else if (event.key === 'Enter' && mode === 'products' && trimmed) {
        event.preventDefault();
        const patch = buildFilterPatch(trimmed, state);
        if (Object.keys(patch).length) {
          actions.set(patch); handoffToFilters(); close();
        } else {
          setMode('ai');
        }
      }
    }}
  />;
}
