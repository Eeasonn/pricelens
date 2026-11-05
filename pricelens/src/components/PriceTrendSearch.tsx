import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRightOutlined, AudioOutlined, LoadingOutlined, RobotOutlined, SearchOutlined } from '@ant-design/icons';
import { dimProduct } from '../data';
import { buildFilterPatch } from '../agent/core';
import type { AgentSuggestion } from '../agent';
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

  const hits = useMemo(() => productHits(query, state.countryCode, state.industry).slice(0, 6), [query, state.countryCode, state.industry]);
  const ownChips = useMemo(() => productHits('', state.countryCode, state.industry).filter((hit) => hit.isOwn).slice(0, 4), [state.countryCode, state.industry]);
  const trimmed = query.trim();
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
    if (!trimmed) return;
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
          onFocus={openSearch}
          onChange={(event) => { setQuery(event.target.value); openSearch(); }}
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
            } else if (event.key === 'Enter' && mode === 'products' && trimmed) {
              event.preventDefault();
              const patch = buildFilterPatch(trimmed, state);
              if (Object.keys(patch).length) {
                actions.set(patch);
                handoffToFilters();
                close();
              } else {
                setMode('ai');
              }
            }
          }}
          placeholder="搜索产品或价格问题"
          style={{ minWidth: 0, flex: 1, border: 0, outline: 0, background: 'transparent', color: color.ink, fontFamily: font.family, fontSize: 12 }}
        />
        <button type="button" aria-label={voiceAvailable ? '搜索语音输入' : '浏览器不支持语音输入'} disabled={!voiceAvailable || voiceListening || running} onClick={() => void startVoice((transcript) => { setQuery((prev) => `${prev}${prev ? ' ' : ''}${transcript}`); openSearch(); })} style={{ display: 'inline-grid', placeItems: 'center', width: 24, height: 24, border: 0, background: 'transparent', color: voiceListening ? color.link : color.body, cursor: voiceAvailable && !running ? 'pointer' : 'not-allowed', opacity: voiceAvailable ? 1 : 0.45 }} title={voiceAvailable ? '语音输入' : '浏览器不支持语音输入'}>{voiceListening ? <LoadingOutlined spin /> : <AudioOutlined />}</button>
        <kbd aria-label={`快捷键 ${shortcutLabel}`} style={{ flexShrink: 0, padding: '1px 4px', border: `1px solid ${color.hairline}`, borderRadius: 4, color: color.mute, fontFamily: font.mono, fontSize: 10, lineHeight: '14px' }}>{shortcutLabel}</kbd>
      </div>
      {renderedOpen && (
        <div
          ref={panelRef}
          id="pricelens-price-search-results"
          role="dialog"
          aria-label="价格走势快速搜索结果"
          style={{ position: 'absolute', top: 38, left: 0, right: 0, zIndex: 90, overflow: 'hidden', border: `1px solid ${color.hairline}`, borderRadius: radius.card, background: color.canvas, boxShadow: shadow.l5 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '8px 10px 6px', borderBottom: `1px solid ${color.hairline}` }}>
            <button type="button" aria-pressed={mode === 'products'} onClick={() => setMode('products')} style={modeButtonStyle(mode === 'products')}>产品</button>
            <button type="button" aria-pressed={mode === 'ai'} onClick={() => setMode('ai')} style={modeButtonStyle(mode === 'ai')}><span style={{ display: 'inline-flex', color: mode === 'ai' ? selectSoftInk : color.body }}><RobotOutlined /></span> AI 分析</button>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: color.mute }}>当前国家 · {state.countryCode}</span>
          </div>

          {mode === 'products' ? (
            <div data-search-results role="listbox" aria-label="产品命中结果" aria-activedescendant={hits[activeIndex] ? `price-search-option-${hits[activeIndex].modelId}` : undefined} tabIndex={-1} style={{ maxHeight: 300, overflowY: 'auto', padding: 4 }}>
              {!trimmed && <div style={{ padding: '4px 5px 8px' }}><div style={emptyStyle}><SearchOutlined style={{ color: color.link }} /><span>输入型号、品牌或系列，快速切换看板主产品</span></div><div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>{ownChips.map((hit) => <button key={hit.modelId} type="button" onClick={() => selectProduct(hit)} style={suggestionStyle}>{brandLabelOf(hit.brand)} · {hit.modelName}</button>)}{PRICE_TREND_AI_SUGGESTIONS.map((suggestion) => <button key={suggestion.label} type="button" onClick={() => useSuggestion(suggestion)} style={suggestionStyle}>{suggestion.label}</button>)}</div></div>}
              {trimmed && hits.length === 0 && (
                <div style={emptyStyle}><span>暂无本地产品命中</span><button type="button" onClick={() => setMode('ai')} style={inlineLinkStyle}>让 AI 分析「{trimmed}」</button></div>
              )}
              {hits.map((hit) => {
                const hitIndex = indexOfHit(hits, hit.modelId);
                const active = activeIndex === hitIndex;
                return <div id={`price-search-option-${hit.modelId}`} key={hit.modelId} role="option" data-search-item aria-selected={active} onMouseEnter={() => setActiveIndex(hitIndex)} style={{ ...resultButtonStyle, display: 'grid', gridTemplateColumns: '24px minmax(0, 1fr) auto', rowGap: hit.configOptions.length > 1 ? 5 : 0, background: active ? color.canvasSoft2 : color.canvas }}>
                  <span style={{ width: 24, height: 24, display: 'grid', placeItems: 'center', borderRadius: radius.control, background: color.canvasSoft2, color: brandColorOf(hit.brand), fontSize: 11, fontWeight: 700 }}>{hit.isOwn ? '我' : brandLabelOf(hit.brand).slice(0, 1)}</span>
                  <button type="button" onClick={() => selectProduct(hit)} style={{ minWidth: 0, display: 'block', padding: 0, border: 0, background: 'transparent', textAlign: 'left', cursor: 'pointer' }}><span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: color.ink, fontSize: 12, fontWeight: 600 }}>{hit.modelName}</span><span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: color.mute, fontSize: 11 }}>{brandLabelOf(hit.brand)} · 默认 {hit.romram} · {hit.skuId}</span></button>
                  <ArrowRightOutlined onClick={() => selectProduct(hit)} style={{ color: color.mute, fontSize: 11, cursor: 'pointer' }} />
                  {hit.configOptions.length > 1 && <div style={{ gridColumn: '2 / -1', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}><span style={{ color: color.mute, fontSize: 10 }}>同系规格</span>{hit.configOptions.map((option) => <button key={option.skuId} type="button" onClick={() => selectProduct(hit, option.skuId)} aria-label={`切换 ${hit.modelName} ${option.romram} ${option.skuId}`} style={{ ...suggestionStyle, padding: '3px 6px', color: option.skuId === hit.skuId ? selectSoftInk : color.body, background: option.skuId === hit.skuId ? selectSoft : color.canvas }}>{option.romram}{option.color && option.color !== '—' ? ` · ${option.color}` : ''}</button>)}</div>}
                </div>;
              })}
            </div>
          ) : (
            <div data-search-results style={{ padding: 12 }}>
              <div data-search-item style={{ display: 'flex', alignItems: 'flex-start', gap: 8, color: color.body, fontSize: 12, lineHeight: 1.5 }}><RobotOutlined style={{ color: aiFailureMessage ? color.error : color.link, marginTop: 2 }} /><span>{trimmed ? 'AI 会基于当前国家、产业、产品和时间范围读取价格证据。' : '输入一个价格问题，AI 会基于当前看板范围分析。'}</span></div>
              {!trimmed && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 10 }}>{PRICE_TREND_AI_SUGGESTIONS.map((suggestion) => <button key={suggestion.label} type="button" onClick={() => useSuggestion(suggestion)} style={suggestionStyle}>{suggestion.label}</button>)}</div>}
              <button data-search-item type="button" aria-label={aiFailureMessage ? '重试 AI 分析' : running ? '正在读取价格数据' : '开始 AI 分析'} disabled={!trimmed || running} onClick={searchWithAgent} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginTop: 10, padding: '8px 9px', border: `1px solid ${trimmed ? selectAccent : color.hairline}`, borderRadius: radius.control, background: trimmed ? selectSoft : color.canvasSoft2, color: trimmed ? selectSoftInk : color.mute, cursor: trimmed && !running ? 'pointer' : 'not-allowed', fontSize: 12, textAlign: 'left' }}><span>{running ? '正在读取价格数据…' : aiFailureMessage ? '重试' : trimmed ? `分析「${trimmed}」` : '例如：最近有价周哪个平台最便宜？'}</span>{running ? <LoadingOutlined spin /> : <ArrowRightOutlined />}</button>
              <div role="status" aria-live="polite" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 8, color: aiFailureMessage ? color.error : running ? color.link : color.mute, fontSize: 10 }}><span>{aiStatusMessage}</span>{sameAsSubmitted && runStatus === 'completed' && <button type="button" onClick={() => openAgent('dock', submittedPromptRef.current)} style={statusLinkStyle}>打开 Agent</button>}</div>
              {aiFailureMessage && <div data-search-item role="alert" aria-live="assertive" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, padding: '6px 8px', borderRadius: radius.control, background: color.canvasSoft2, color: color.body, fontSize: 11, lineHeight: 1.4 }}><span style={{ flex: 1 }}>{aiFailureMessage}</span><button type="button" aria-label="重试 AI 分析" onClick={searchWithAgent} style={retryLinkStyle}>重试</button></div>}
            </div>
          )}
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
