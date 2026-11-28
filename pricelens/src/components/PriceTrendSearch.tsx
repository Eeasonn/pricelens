import { useEffect, useMemo, useRef, useState } from 'react';
import { dimProduct } from '../data';
import { buildFilterChanges, buildFilterPatch } from '../agent-stable/core';
import { parseFilterIntent } from '../agent-stable/intentFilter';
import type { FilterPatch } from '../agent-stable';
import { currentPricesByGroup } from '../dataModel/tierPrice';
import { useAgent } from '../state/AgentContext';
import { useFilters } from '../state/FiltersContext';
import { usePage } from '../state/PageContext';
import { registerHeaderSearch } from '../state/headerSearchFocus';
import { newCardId, withAutoOn } from '../state/mainSelection';
import type { FiltersState, MainProduct, ProductSelection } from '../state/filtersTypes';
import { brandLabelOf } from './BrandMark';
import { AGENT_STATUS_LABELS, platformShortcutLabel, PRICE_TREND_AI_SUGGESTIONS } from './CopilotStable/agentCopy';
import { PriceSearchSurface, type SearchFilterPreview } from './Search/PriceSearchSurface';


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

/** 输入停顿多久后计算筛选预览（毫秒） */
const PREVIEW_DEBOUNCE_MS = 150;

/** AI 模式空态的筛选模板：用当前国家 / 产业的真实数据拼出可直接应用的句子。
 *  我司旗舰 = 该口径下现价 USD 最高的我司组；无现价我司组时回落静态建议。 */
export function filterTemplatesFor(countryCode: string, industry: FiltersState['industry']): string[] {
  const ownIds = new Set(dimProduct.filter((row) => row.is_own && row.industry === industry).map((row) => row.model_id));
  let flagship: { modelId: string; usd: number } | null = null;
  for (const entry of currentPricesByGroup(industry, countryCode).values()) {
    if (!ownIds.has(entry.sel.modelId) || entry.price.usd == null) continue;
    if (!flagship || entry.price.usd > flagship.usd) flagship = { modelId: entry.sel.modelId, usd: entry.price.usd };
  }
  const name = flagship ? dimProduct.find((row) => row.model_id === flagship!.modelId)?.model_name : undefined;
  if (!name) return PRICE_TREND_AI_SUGGESTIONS.map((item) => item.label);
  return [`${name} 同档 苹果 三星`, '华为旗舰 vs 上一代', '$600-800 手机 按品牌分列'];
}

/** 搜索文本 → 是否值得显示筛选预览（补丁有变化且超出单个型号命中） */
export function previewOfQuery(text: string, state: FiltersState): { patch: FilterPatch; preview: SearchFilterPreview } | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const intent = parseFilterIntent(trimmed, state);
  if (!intent.structured) return null;
  const changes = buildFilterChanges(state, intent.patch);
  if (!changes.length) return null;
  return { patch: intent.patch, preview: { changes, notes: intent.notes, isQuestion: intent.isQuestion } };
}

export default function PriceTrendSearch() {
  const { page } = usePage();
  const { state, actions } = useFilters();
  const { openAgent, send, running, runStatus, activeRun } = useAgent();
  // latest-ref：NL 补丁先经 actions.set 提交（国家/产品/时间词换算），Provider 随即
  // 重渲染出携带新 context 的 send。下方 setTimeout 闭包捕获的是点击那一刻的旧
  // send——用它会把答案按旧国家/旧主品计算，且结束时指纹比对整体判 stale_context
  // （回看/追问按钮全禁用）。走 ref 取提交后的新 send。
  const sendRef = useRef(send);
  sendRef.current = send;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [renderedOpen, setRenderedOpen] = useState(false);
  const [mode, setMode] = useState<SearchMode>('products');
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [previewQuery, setPreviewQuery] = useState('');
  /** 用户用 ↑↓ 显式选中了某条产品命中：此时 Enter 选产品而非应用预览 */
  const arrowedRef = useRef(false);
  const submittedPromptRef = useRef('');
  const [undoPatch, setUndoPatch] = useState<Partial<FiltersState> | null>(null);

  const hits = useMemo(() => productHits(query, state.countryCode, state.industry).slice(0, query.trim() ? 6 : 4), [query, state.countryCode, state.industry]);
  const trimmed = query.trim();
  const isDashboard = page === 'dashboard';
  const shortcutLabel = platformShortcutLabel();

  useEffect(() => {
    setActiveIndex(0);
    arrowedRef.current = false;
  }, [mode, query, state.countryCode, state.industry]);

  useEffect(() => {
    const timer = window.setTimeout(() => setPreviewQuery(query), PREVIEW_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query]);

  const previewed = useMemo(() => previewOfQuery(previewQuery, state), [previewQuery, state]);
  const templates = useMemo(
    () => (renderedOpen ? filterTemplatesFor(state.countryCode, state.industry) : []),
    [renderedOpen, state.countryCode, state.industry],
  );

  // ⌘/Ctrl+K：页头搜索挂载期间由 AgentContext 的全局快捷键先聚焦这里（见 headerSearchFocus）
  useEffect(() => {
    if (!isDashboard) return undefined;
    return registerHeaderSearch(() => {
      setRenderedOpen(true);
      setOpen(true);
      inputRef.current?.focus();
    });
  }, [isDashboard]);

  useEffect(() => {
    if (!isDashboard || !open) return undefined;
    const onEscape = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === 'Escape') closeSearch();
    };
    window.addEventListener('keydown', onEscape, true);
    return () => window.removeEventListener('keydown', onEscape, true);
  }, [isDashboard, open]);

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

  const useSuggestion = (text: string) => {
    setMode('ai');
    setQuery(PRICE_TREND_AI_SUGGESTIONS.find((item) => item.label === text)?.prompt ?? text);
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
    // （sendRef：见上方 latest-ref 注释——必须用提交后的新 send 快照新 context）
    window.setTimeout(() => void sendRef.current(trimmed), 0);
  };

  /** 当前输入的预览：Enter 可能在去抖前到达，此时按最新文本现算 */
  const currentPreview = () => (previewQuery === query ? previewed : previewOfQuery(query, state));

  const applyPreview = () => {
    const next = currentPreview();
    if (!next) return false;
    const keys = Object.keys(next.patch) as Array<keyof FilterPatch>;
    // 撤销只恢复本次补丁涉及的键（取应用前的值）
    const before = Object.fromEntries(keys.map((key) => [key, state[key]])) as Partial<FiltersState>;
    actions.set(next.patch);
    setUndoPatch(before);
    close();
    return true;
  };

  const previewToAgent = () => {
    if (!trimmed || running) return;
    submittedPromptRef.current = trimmed;
    close(true);
    // 只交接问题本身，不写筛选：筛选写入只发生在用户点「应用」时
    openAgent('dock', trimmed);
    window.setTimeout(() => void sendRef.current(trimmed), 0);
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
    activeIndex={activeIndex} shortcut={shortcutLabel} running={running} failure={aiFailureMessage} status={aiStatusMessage}
    completed={sameAsSubmitted && runStatus === 'completed'} suggestions={templates}
    preview={trimmed ? previewed?.preview ?? null : null} onApplyPreview={applyPreview} onPreviewToAgent={previewToAgent}
    onUndoApply={undoPatch ? () => { actions.set(undoPatch); setUndoPatch(null); } : undefined}
    onOpen={() => openSearch()} onQuery={(value) => { setUndoPatch(null); setQuery(value); openSearch(); }}
    onMode={setMode} onActive={setActiveIndex}
    onSelect={(index, skuId) => selectProduct(hits[index], skuId)}
    onSuggestion={(index) => useSuggestion(templates[index])} onSubmit={searchWithAgent}
    onOpenAgent={() => openAgent('dock', submittedPromptRef.current)}
    onKeyDown={(event) => {
      if (event.key === 'Escape' && open) {
        event.preventDefault(); close();
      } else if (event.key === 'ArrowDown' && mode === 'products' && hits.length) {
        event.preventDefault(); arrowedRef.current = true; setActiveIndex((index) => (index + 1) % hits.length);
      } else if (event.key === 'ArrowUp' && mode === 'products' && hits.length) {
        event.preventDefault(); arrowedRef.current = true; setActiveIndex((index) => (index - 1 + hits.length) % hits.length);
      } else if (event.key === 'Enter' && !(mode === 'products' && arrowedRef.current && hits.length) && currentPreview()) {
        event.preventDefault(); applyPreview();
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
