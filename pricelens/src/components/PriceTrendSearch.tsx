import { useEffect, useMemo, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { dimProduct, dimRegion } from '../data';
import { defaultVoiceAdapter, type VoiceInputAdapter } from '../agent/voice';
import { useAgent } from '../state/AgentContext';
import { useFilters } from '../state/FiltersContext';
import { usePage } from '../state/PageContext';
import { newCardId, withAutoOn } from '../state/mainSelection';
import type { MainProduct, ProductSelection } from '../state/filtersTypes';
import { brandLabelOf } from './BrandMark';
import { AGENT_STATUS_LABELS, platformShortcutLabel, PRICE_TREND_AI_SUGGESTIONS } from './Copilot/agentCopy';
import { PriceSearchSurface } from './Search/PriceSearchSurface';
import { motion } from '../theme/tokens';

type SearchMode = 'products' | 'ai';

interface ProductHit {
  modelId: string;
  brand: string;
  modelName: string;
  series: string;
  romram: string;
  skuId: string;
  isOwn: boolean;
  variants: Array<{ romram: string; skuId: string; color: string }>;
}

const normalize = (value: string): string => value.trim().toLocaleLowerCase();
const compact = (value: string): string => normalize(value).replace(/[\s\-_./]+/g, '');

interface ParsedSearch {
  countryCode: string;
  productQuery: string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countryPattern(value: string): string {
  return [...value.trim()].map((char) => escapeRegExp(char)).join('\\s*');
}

/** Parse the compact country prefix people use in the header search (for example `R 国 pura90spro`). */
export function parsePriceTrendSearch(value: string, fallbackCountry: string): ParsedSearch {
  const raw = value.trim();
  if (!raw) return { countryCode: fallbackCountry, productQuery: '' };
  // Codes must be explicit prefixes: Pro/RO, Samsung/SA and the GB capacity
  // unit are product text. Remove only the same match that resolved the country.
  const country = dimRegion.flatMap((region) => [region.country_code, region.country_name].filter(Boolean).flatMap((alias) => {
    const pattern = alias === region.country_code ? `^${escapeRegExp(alias)}\\b` : countryPattern(alias);
    const match = new RegExp(pattern, 'i').exec(raw);
    return match ? [{ region, index: match.index, length: match[0].length }] : [];
  })).sort((a, b) => a.index - b.index)[0];
  if (!country) return { countryCode: fallbackCountry, productQuery: raw };
  const productQuery = `${raw.slice(0, country.index)} ${raw.slice(country.index + country.length)}`
    .replace(/\s+/g, ' ').replace(/^[\s:：,，、/]+|[\s:：,，、/]+$/g, '');
  return { countryCode: country.region.country_code, productQuery };
}

export function productHits(query: string, countryCode: string, industry: string): ProductHit[] {
  const q = compact(query);
  const grouped = new Map<string, ProductHit>();
  for (const product of dimProduct) {
    if (product.industry !== industry || !product.countries.includes(countryCode)) continue;
    const haystack = compact(`${product.brand} ${brandLabelOf(product.brand)} ${product.model_name} ${product.series} ${product.romram}`);
    if (q && !haystack.includes(q)) continue;
    const existing = grouped.get(product.model_id);
    if (existing) {
      if (!existing.variants.some((variant) => variant.romram === product.romram && variant.skuId === product.sku_id)) existing.variants.push({ romram: product.romram, skuId: product.sku_id, color: product.color });
      continue;
    }
    grouped.set(product.model_id, { modelId: product.model_id, brand: product.brand, modelName: product.model_name, series: product.series, romram: product.romram, skuId: product.sku_id, isOwn: product.is_own, variants: [{ romram: product.romram, skuId: product.sku_id, color: product.color }] });
  }
  // Huawei is the decision subject. Keep own products at the top without
  // changing the stable order within either group.
  return [...grouped.values()].sort((a, b) => Number(b.isOwn) - Number(a.isOwn)).slice(0, 6);
}

function selectionOf(hit: ProductHit): ProductSelection {
  return { modelId: hit.modelId, romram: hit.romram, skuIds: [hit.skuId] };
}

function selectionOfVariant(hit: ProductHit, variant: { romram: string; skuId: string }): ProductSelection {
  return { modelId: hit.modelId, romram: variant.romram, skuIds: [variant.skuId] };
}

function cardOf(hit: ProductHit, variant?: { romram: string; skuId: string }): MainProduct {
  const card: MainProduct = { id: newCardId(), main: variant ? selectionOfVariant(hit, variant) : selectionOf(hit), compares: [] };
  return hit.isOwn ? withAutoOn(card) : card;
}

export default function PriceTrendSearch() {
  const { page } = usePage();
  const { state, actions } = useFilters();
  const { open: agentOpen, openAgent, send, running, runStatus, activeRun } = useAgent();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [renderedOpen, setRenderedOpen] = useState(false);
  const [mode, setMode] = useState<SearchMode>('products');
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const submittedPromptRef = useRef('');
  const voiceAbortRef = useRef<AbortController | null>(null);
  const voice = useMemo<VoiceInputAdapter>(() => defaultVoiceAdapter(), []);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const parsed = useMemo(() => parsePriceTrendSearch(query, state.countryCode), [query, state.countryCode]);
  const hits = useMemo(() => productHits(parsed.productQuery, parsed.countryCode, state.industry).slice(0, parsed.productQuery.trim() ? 6 : 4), [parsed.countryCode, parsed.productQuery, state.industry]);
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
        setOpen(true);
        window.setTimeout(() => inputRef.current?.focus(), 0);
      }
      if (event.key === 'Escape' && open) {
        closeSearch();
        inputRef.current?.blur();
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

  useEffect(() => {
    if (open) {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
      setRenderedOpen(true);
    }
  }, [open]);
  useEffect(() => () => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    voiceAbortRef.current?.abort();
  }, []);

  // The panel lifecycle is separate from its result content. This keeps a
  // keystroke from replaying the entrance scene and leaves a real 140ms exit
  // window for pointer/keyboard dismissal.
  useEffect(() => {
    const panel = panelRef.current;
    if (!isDashboard || !renderedOpen || !panel) return undefined;
    const mm = gsap.matchMedia();
    let cancelled = false;
    mm.add({ reduceMotion: '(prefers-reduced-motion: reduce)' }, (context) => {
      const reduceMotion = Boolean(context.conditions?.reduceMotion);
      gsap.killTweensOf(panel);
      if (open) {
        gsap.fromTo(panel, { autoAlpha: 0, y: reduceMotion ? 0 : -6 }, { autoAlpha: 1, y: 0, duration: reduceMotion ? 0 : motion.searchEntrance / 1000, ease: motion.enter });
      } else {
        gsap.to(panel, {
          autoAlpha: 0,
          y: reduceMotion ? 0 : -4,
          duration: reduceMotion ? 0 : motion.searchExit / 1000,
          ease: motion.exit,
          onComplete: () => { if (!cancelled) setRenderedOpen(false); },
        });
      }
    });
    return () => { cancelled = true; mm.revert(); };
  }, [isDashboard, open, renderedOpen]);

  const resultSignature = `${mode}|${parsed.countryCode}|${parsed.productQuery}|${hits.map((hit) => hit.modelId).join(',')}|${runStatus}`;
  useEffect(() => {
    const results = resultsRef.current;
    if (!isDashboard || !open || !renderedOpen || !results) return undefined;
    const mm = gsap.matchMedia();
    mm.add({ reduceMotion: '(prefers-reduced-motion: reduce)' }, (context) => {
      const reduceMotion = Boolean(context.conditions?.reduceMotion);
      gsap.fromTo(results, { autoAlpha: 0.45 }, { autoAlpha: 1, duration: reduceMotion ? 0 : motion.searchResult / 1000, ease: 'power1.out' });
    });
    return () => mm.revert();
  }, [isDashboard, open, renderedOpen, resultSignature]);

  if (!isDashboard) return null;

  function closeSearch() {
    setOpen(false);
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => setRenderedOpen(false), motion.searchExit);
  }

  const close = (preserveQuery = false) => {
    closeSearch();
    if (!preserveQuery) {
      setQuery('');
      setMode('products');
    }
    setActiveIndex(0);
    inputRef.current?.blur();
  };

  const startSearchVoice = async () => {
    if (!voice.available || voiceListening || running) return;
    const controller = new AbortController();
    voiceAbortRef.current = controller;
    setVoiceError(null);
    setVoiceListening(true);
    try {
      const result = await voice.listen(controller.signal);
      setQuery(result.transcript.trim());
      setMode('products');
      setOpen(true);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError')) {
        setVoiceError(error instanceof Error ? error.message : '语音输入失败，请重试。');
      }
    } finally {
      if (voiceAbortRef.current === controller) voiceAbortRef.current = null;
      setVoiceListening(false);
    }
  };

  const animateFilterHandoff = () => {
    const filter = document.querySelector<HTMLElement>('.lpl-fb');
    if (!filter) return;
    const mm = gsap.matchMedia();
    mm.add({ reduceMotion: '(prefers-reduced-motion: reduce)' }, (context) => {
      if (context.conditions?.reduceMotion) return;
      gsap.fromTo(filter, { y: 2, opacity: 0.76 }, { y: 0, opacity: 1, duration: 0.32, ease: 'power2.out' });
    });
    window.setTimeout(() => mm.revert(), 380);
  };

  const useSuggestion = (suggestion: string) => {
    setMode('ai');
    setQuery(suggestion);
    setActiveIndex(0);
    setOpen(true);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  const searchWithAgent = () => {
    if (!trimmed || running) return;
    submittedPromptRef.current = trimmed;
    close(true);
    openAgent('dock', trimmed);
    void send(trimmed);
  };

  const selectProduct = (hit: ProductHit, variant?: { romram: string; skuId: string }) => {
    if (parsed.countryCode !== state.countryCode) actions.set({ countryCode: parsed.countryCode });
    actions.setMains([cardOf(hit, variant)]);
    animateFilterHandoff();
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

  return <PriceSearchSurface rootRef={rootRef} inputRef={inputRef} panelRef={panelRef} resultsRef={resultsRef}
    open={open} renderedOpen={renderedOpen} mode={mode} query={query} countryCode={parsed.countryCode}
    products={hits.map((hit) => ({ ...hit, brand: brandLabelOf(hit.brand), configurations: hit.variants }))}
    activeIndex={activeIndex} shortcut={shortcutLabel} running={running} voiceAvailable={voice.available}
    voiceListening={voiceListening} voiceError={voiceError} failure={aiFailureMessage} status={aiStatusMessage}
    completed={sameAsSubmitted && runStatus === 'completed'} suggestions={[...PRICE_TREND_AI_SUGGESTIONS]}
    onOpen={() => setOpen(true)} onQuery={(value) => { setQuery(value); setOpen(true); }}
    onMode={setMode} onActive={setActiveIndex} onVoice={() => void startSearchVoice()}
    onSelect={(index, skuId) => selectProduct(hits[index], skuId ? hits[index].variants.find((variant) => variant.skuId === skuId) : undefined)}
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
      }
    }}
  />;
}
