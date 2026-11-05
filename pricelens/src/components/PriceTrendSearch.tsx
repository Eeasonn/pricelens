import { useEffect, useMemo, useRef, useState } from 'react';
import { AudioOutlined, ArrowRightOutlined, LoadingOutlined, RobotOutlined, SearchOutlined } from '@ant-design/icons';
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
import { brandColorOf, color, font, motion, radius, selectAccent, selectSoft, selectSoftInk, shadow } from '../theme/tokens';

type SearchMode = 'products' | 'ai';

interface ProductHit {
  modelId: string;
  brand: string;
  modelName: string;
  series: string;
  romram: string;
  skuId: string;
  isOwn: boolean;
  variants: Array<{ romram: string; skuId: string }>;
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
  const normalized = compact(raw);
  const region = dimRegion.find((candidate) => {
    const aliases = [candidate.country_code, candidate.country_name];
    return aliases.some((alias) => {
      const key = compact(alias);
      return key.length > 1 && normalized.includes(key);
    });
  });
  if (!region) return { countryCode: fallbackCountry, productQuery: raw };
  const aliases = [region.country_name, region.country_code]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  let productQuery = raw;
  for (const alias of aliases) {
    const pattern = alias === region.country_code ? `\\b${escapeRegExp(alias)}\\b` : countryPattern(alias);
    productQuery = productQuery.replace(new RegExp(pattern, 'ig'), ' ');
  }
  return { countryCode: region.country_code, productQuery: productQuery.replace(/\s+/g, ' ').trim() };
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
      if (!existing.variants.some((variant) => variant.romram === product.romram && variant.skuId === product.sku_id)) existing.variants.push({ romram: product.romram, skuId: product.sku_id });
      continue;
    }
    grouped.set(product.model_id, { modelId: product.model_id, brand: product.brand, modelName: product.model_name, series: product.series, romram: product.romram, skuId: product.sku_id, isOwn: product.is_own, variants: [{ romram: product.romram, skuId: product.sku_id }] });
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
  const hits = useMemo(() => productHits(parsed.productQuery, parsed.countryCode, state.industry), [parsed.countryCode, parsed.productQuery, state.industry]);
  const ownSuggestions = useMemo(() => productHits('', parsed.countryCode, state.industry).filter((hit) => hit.isOwn).slice(0, 3), [parsed.countryCode, state.industry]);
  const trimmed = query.trim();
  const hasProductQuery = parsed.productQuery.trim().length > 0;
  const isDashboard = page === 'dashboard';
  const shortcutLabel = platformShortcutLabel();

  useEffect(() => {
    setActiveIndex(0);
  }, [mode, query, state.countryCode, state.industry]);

  useEffect(() => {
    if (!isDashboard) return undefined;
    const onShortcut = (event: KeyboardEvent) => {
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
    if (!trimmed) return;
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

  return (
    <div ref={rootRef} style={{ position: 'relative', width: 'min(330px, 30vw)', minWidth: 220, flexShrink: 1 }}>
      <div
        className="lpl-price-search-shell"
        style={{
          height: 32,
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          padding: '0 9px',
          border: `1px solid ${open ? selectAccent : color.hairline}`,
          borderRadius: radius.control,
          background: color.canvas,
          boxShadow: open ? `0 0 0 1px ${selectAccent}` : undefined,
          transition: `border-color ${motion.fast}ms ease, box-shadow ${motion.fast}ms ease`,
        }}
      >
        <span aria-hidden title={running ? '正在读取价格数据' : runStatus === 'failed' ? 'Agent 分析失败' : undefined} style={{ display: 'inline-flex', color: running ? color.link : runStatus === 'failed' ? color.error : open ? selectSoftInk : color.link, fontSize: 15 }}><RobotOutlined /></span>
        <input
          ref={inputRef}
          aria-label="AI 快速搜索"
          aria-controls="pricelens-price-search-results"
          aria-expanded={open}
          aria-activedescendant={mode === 'products' && hits[activeIndex] ? `price-search-option-${hits[activeIndex].modelId}` : undefined}
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && open) {
              event.preventDefault();
              close();
            } else if (event.key === 'ArrowDown' && mode === 'products' && hits.length) {
              event.preventDefault();
              setActiveIndex((index) => (index + 1) % hits.length);
            } else if (event.key === 'ArrowUp' && mode === 'products' && hits.length) {
              event.preventDefault();
              setActiveIndex((index) => (index - 1 + hits.length) % hits.length);
            } else if (event.key === 'Enter' && mode === 'ai') {
              event.preventDefault();
              searchWithAgent();
            } else if (event.key === 'Enter' && mode === 'products' && hits[0]) {
              event.preventDefault();
              selectProduct(hits[activeIndex] ?? hits[0]);
            }
          }}
          placeholder="搜索产品或价格问题"
          style={{ minWidth: 0, flex: 1, border: 0, outline: 0, background: 'transparent', color: color.ink, fontFamily: font.family, fontSize: 12 }}
        />
        <button
          type="button"
          aria-label="搜索语音输入"
          title={voice.available ? '语音输入' : '当前浏览器不支持语音输入'}
          disabled={!voice.available || voiceListening || running}
          onClick={() => void startSearchVoice()}
          style={{ width: 22, height: 24, display: 'grid', placeItems: 'center', padding: 0, border: 0, background: 'transparent', color: voiceListening ? color.link : color.mute, cursor: voice.available && !voiceListening && !running ? 'pointer' : 'not-allowed', opacity: voice.available ? 1 : 0.45 }}
        >
          {voiceListening ? <LoadingOutlined spin /> : <AudioOutlined />}
        </button>
        <kbd aria-label={`快捷键 ${shortcutLabel}`} style={{ flexShrink: 0, padding: '1px 4px', border: `1px solid ${color.hairline}`, borderRadius: 4, color: color.mute, fontFamily: font.mono, fontSize: 10, lineHeight: '14px' }}>{shortcutLabel}</kbd>
      </div>
      {renderedOpen && (
        <div
          ref={panelRef}
          id="pricelens-price-search-results"
          role="dialog"
          aria-label="价格走势快速搜索结果"
          aria-hidden={!open || undefined}
          style={{ position: 'absolute', top: 38, left: 0, right: 0, zIndex: 90, overflow: 'hidden', border: `1px solid ${color.hairline}`, borderRadius: radius.card, background: color.canvas, boxShadow: shadow.l5, pointerEvents: open ? 'auto' : 'none' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '8px 10px 6px', borderBottom: `1px solid ${color.hairline}` }}>
            <button type="button" aria-pressed={mode === 'products'} onClick={() => setMode('products')} style={modeButtonStyle(mode === 'products')}>产品</button>
            <button type="button" aria-pressed={mode === 'ai'} onClick={() => setMode('ai')} style={modeButtonStyle(mode === 'ai')}><span style={{ display: 'inline-flex', color: mode === 'ai' ? selectSoftInk : color.body }}><RobotOutlined /></span> AI 分析</button>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: color.mute }}>当前国家 · {parsed.countryCode}</span>
          </div>

          <div ref={resultsRef} data-search-results>
          {mode === 'products' ? (
            <div role="listbox" aria-label="产品命中结果" aria-activedescendant={hits[activeIndex] ? `price-search-option-${hits[activeIndex].modelId}` : undefined} tabIndex={-1} style={{ maxHeight: 300, overflowY: 'auto', padding: 4 }}>
              {!hasProductQuery && <div style={{ padding: '4px 5px 8px' }}><div style={emptyStyle}><SearchOutlined style={{ color: color.link }} /><span>输入型号、品牌或系列，快速切换看板主产品</span></div><div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>{ownSuggestions.length ? ownSuggestions.map((hit) => <button key={hit.modelId} type="button" onClick={() => selectProduct(hit)} style={suggestionStyle}>{brandLabelOf(hit.brand)} {hit.modelName}</button>) : <span style={{ color: color.mute, fontSize: 11 }}>当前国家暂无我司产品</span>}</div></div>}
              {hasProductQuery && hits.length === 0 && (
                <div style={emptyStyle}><span>暂无本地产品命中</span><button type="button" onClick={() => setMode('ai')} style={inlineLinkStyle}>让 AI 分析「{trimmed}」</button></div>
              )}
              {hasProductQuery && hits.map((hit) => {
                const active = activeIndex === indexOfHit(hits, hit.modelId);
                return <div id={`price-search-option-${hit.modelId}`} key={hit.modelId} role="option" data-search-item aria-selected={active} onMouseEnter={() => setActiveIndex(indexOfHit(hits, hit.modelId))} style={{ padding: 4, borderRadius: radius.control, background: active ? color.canvasSoft2 : color.canvas }}>
                  <button type="button" onClick={() => selectProduct(hit)} style={{ ...resultButtonStyle, padding: '4px 3px', background: 'transparent' }}>
                    <span style={{ width: 24, height: 24, display: 'grid', placeItems: 'center', borderRadius: radius.control, background: color.canvasSoft2, color: brandColorOf(hit.brand), fontSize: 11, fontWeight: 700 }}>{hit.isOwn ? '我' : brandLabelOf(hit.brand).slice(0, 1)}</span>
                    <span style={{ minWidth: 0, flex: 1, textAlign: 'left' }}><span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: color.ink, fontSize: 12, fontWeight: 600 }}>{hit.modelName}</span><span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: color.mute, fontSize: 11 }}>{brandLabelOf(hit.brand)} · 默认 {hit.romram}</span></span>
                    <ArrowRightOutlined style={{ color: color.mute, fontSize: 11 }} />
                  </button>
                  {hit.variants.length > 1 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '2px 3px 3px 35px' }}><span style={{ color: color.mute, fontSize: 10 }}>规格</span>{hit.variants.map((variant) => <button key={`${variant.romram}-${variant.skuId}`} type="button" aria-label={`选择 ${hit.modelName} ${variant.romram} ${variant.skuId}`} onClick={(event) => { event.stopPropagation(); selectProduct(hit, variant); }} style={suggestionStyle}>{variant.romram} · {variant.skuId}</button>)}</div>}
                </div>;
              })}
            </div>
          ) : (
            <div style={{ padding: 12 }}>
              <div data-search-item style={{ display: 'flex', alignItems: 'flex-start', gap: 8, color: color.body, fontSize: 12, lineHeight: 1.5 }}><RobotOutlined style={{ color: aiFailureMessage ? color.error : color.link, marginTop: 2 }} /><span>{trimmed ? 'AI 会基于当前国家、产业、产品和时间范围读取价格证据。' : '输入一个价格问题，AI 会基于当前看板范围分析。'}</span></div>
              {!trimmed && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 10 }}>{PRICE_TREND_AI_SUGGESTIONS.map((suggestion) => <button key={suggestion} type="button" onClick={() => useSuggestion(suggestion)} style={suggestionStyle}>{suggestion}</button>)}</div>}
              <button data-search-item type="button" aria-label={aiFailureMessage ? '重试 AI 分析' : running ? '正在读取价格数据' : '开始 AI 分析'} disabled={!trimmed || running} onClick={searchWithAgent} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginTop: 10, padding: '8px 9px', border: `1px solid ${trimmed ? selectAccent : color.hairline}`, borderRadius: radius.control, background: trimmed ? selectSoft : color.canvasSoft2, color: trimmed ? selectSoftInk : color.mute, cursor: trimmed && !running ? 'pointer' : 'not-allowed', fontSize: 12, textAlign: 'left' }}><span>{running ? '正在读取价格数据…' : aiFailureMessage ? '重试' : trimmed ? `分析「${trimmed}」` : '例如：最近有价周哪个平台最便宜？'}</span>{running ? <span aria-hidden style={{ fontSize: 12 }}>…</span> : <ArrowRightOutlined />}</button>
              <div role="status" aria-live="polite" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 8, color: aiFailureMessage ? color.error : running ? color.link : color.mute, fontSize: 10 }}><span>{aiStatusMessage}</span>{voiceError && <span role="alert" style={{ color: color.error }}>{voiceError}</span>}{sameAsSubmitted && runStatus === 'completed' && <button type="button" onClick={() => openAgent('dock', submittedPromptRef.current)} style={statusLinkStyle}>打开 Agent</button>}</div>
              {aiFailureMessage && <div data-search-item role="alert" aria-live="assertive" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, padding: '6px 8px', borderRadius: radius.control, background: color.canvasSoft2, color: color.body, fontSize: 11, lineHeight: 1.4 }}><span style={{ flex: 1 }}>{aiFailureMessage}</span><button type="button" aria-label="重试 AI 分析" onClick={searchWithAgent} style={retryLinkStyle}>重试</button></div>}
            </div>
          )}
          </div>
        </div>
      )}
    </div>
  );
}

const modeButtonStyle = (selected: boolean): React.CSSProperties => ({ display: 'inline-flex', alignItems: 'center', gap: 4, height: 24, padding: '0 7px', border: `1px solid ${selected ? selectAccent : 'transparent'}`, borderRadius: radius.control, background: selected ? selectSoft : 'transparent', color: selected ? selectSoftInk : color.body, cursor: 'pointer', fontSize: 11 });

const resultButtonStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 7px', border: 0, borderRadius: radius.control, background: color.canvas, color: color.ink, cursor: 'pointer' };

const emptyStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 7, minHeight: 60, padding: '8px 9px', color: color.mute, fontSize: 11 };

const inlineLinkStyle: React.CSSProperties = { padding: 0, border: 0, background: 'transparent', color: color.link, cursor: 'pointer', fontSize: 11 };

const suggestionStyle: React.CSSProperties = { padding: '4px 7px', border: `1px solid ${color.hairline}`, borderRadius: radius.pill, background: color.canvas, color: color.body, cursor: 'pointer', fontSize: 11, textAlign: 'left' };

const statusLinkStyle: React.CSSProperties = { padding: 0, border: 0, background: 'transparent', color: color.link, cursor: 'pointer', fontSize: 10, textDecoration: 'underline', textUnderlineOffset: 2 };

const retryLinkStyle: React.CSSProperties = { flexShrink: 0, padding: '3px 7px', border: `1px solid ${color.hairlineStrong}`, borderRadius: radius.control, background: color.canvas, color: color.ink, cursor: 'pointer', fontSize: 11 };

function indexOfHit(hits: ProductHit[], modelId: string): number {
  return hits.findIndex((hit) => hit.modelId === modelId);
}
