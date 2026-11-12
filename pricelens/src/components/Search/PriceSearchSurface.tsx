import { useEffect, useLayoutEffect, useState, type CSSProperties, type KeyboardEvent, type RefObject } from 'react';
import { ArrowRightOutlined, AudioOutlined, LoadingOutlined, RobotOutlined, SearchOutlined } from '@ant-design/icons';
import { color, font, fontSize, motion, radius, selectAccent, selectSoft, selectSoftInk, shadow, space } from '../../theme/tokens';
import './price-search.css';

export interface SearchProduct {
  modelId: string;
  modelName: string;
  brand: string;
  romram: string;
  skuId: string;
  configurations: Array<{ skuId: string; romram: string; color?: string }>;
}

interface Props {
  rootRef: RefObject<HTMLDivElement>;
  inputRef: RefObject<HTMLInputElement>;
  panelRef: RefObject<HTMLDivElement>;
  resultsRef?: RefObject<HTMLDivElement>;
  open: boolean;
  renderedOpen: boolean;
  mode: 'products' | 'ai';
  query: string;
  countryCode: string;
  products: SearchProduct[];
  activeIndex: number;
  shortcut: string;
  running: boolean;
  voiceAvailable: boolean;
  voiceListening: boolean;
  voiceError?: string | null;
  failure: string | null;
  status: string;
  completed: boolean;
  suggestions: string[];
  onOpen: () => void;
  onQuery: (query: string) => void;
  onMode: (mode: 'products' | 'ai') => void;
  onActive: (index: number) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onSelect: (index: number, skuId?: string) => void;
  onSuggestion: (index: number) => void;
  onSubmit: () => void;
  onVoice: () => void;
  onOpenAgent: () => void;
}

const tokens = {
  '--qs-canvas': color.canvas, '--qs-soft': color.canvasSoft, '--qs-hover': color.canvasSoft2,
  '--qs-line': color.hairline, '--qs-line-strong': color.hairlineStrong,
  '--qs-ink': color.ink, '--qs-body': color.body, '--qs-mute': color.mute,
  '--qs-link': color.link, '--qs-focus': selectAccent, '--qs-selected': selectSoft,
  '--qs-selected-ink': selectSoftInk, '--qs-on-primary': color.onPrimary, '--qs-error': color.error,
  '--qs-font': font.family, '--qs-mono': font.mono,
  '--qs-body-size': `${fontSize.bodySm}px`, '--qs-caption': `${fontSize.caption}px`,
  '--qs-xs': `${space.xs}px`, '--qs-sm': `${space.sm}px`, '--qs-md': `${space.md}px`,
  '--qs-base': `${space.base}px`, '--qs-lg': `${space.lg}px`, '--qs-xl': `${space.xl}px`,
  '--qs-control-radius': `${radius.control}px`, '--qs-card-radius': `${radius.card}px`,
  '--qs-shadow': shadow.l2, '--qs-motion': `${motion.fast}ms`,
} as CSSProperties;

/** Shared presentation only; each release channel still owns query and selection semantics. */
export function PriceSearchSurface(props: Props) {
  const { rootRef, inputRef, panelRef, resultsRef, open, renderedOpen, mode, query, products, activeIndex } = props;
  const [placement, setPlacement] = useState<CSSProperties>({ visibility: 'hidden' });
  const trimmed = query.trim();

  useEffect(() => {
    if (panelRef.current) panelRef.current.inert = !open;
  }, [open, renderedOpen, panelRef]);

  useLayoutEffect(() => {
    if (!renderedOpen) return;
    const place = () => {
      const anchor = rootRef.current?.getBoundingClientRect();
      if (!anchor) return;
      const width = Math.min(420, window.innerWidth - space.base * 2);
      const top = anchor.bottom + space.sm;
      const left = Math.max(space.base, Math.min(anchor.left, window.innerWidth - width - space.base));
      const maxHeight = Math.max(0, window.innerHeight - top - space.base);
      setPlacement((current) => current.left === left && current.top === top && current.width === width && current.maxHeight === maxHeight
        ? current : { left, top, width, maxHeight });
    };
    place();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(place) : null;
    if (rootRef.current) observer?.observe(rootRef.current);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [renderedOpen, rootRef]);

  useEffect(() => {
    if (!open || mode !== 'products') return;
    const row = panelRef.current?.querySelector<HTMLElement>('[data-active="true"] .lpl-quick-search-product');
    row?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [activeIndex, open, renderedOpen, mode, query, panelRef]);

  const activeId = open && mode === 'products' && products[activeIndex] ? `price-search-option-${products[activeIndex].modelId}` : undefined;
  return <div ref={rootRef} className="lpl-quick-search" role="search" aria-label="看板快速搜索" style={tokens}>
    <div className="lpl-quick-search-shell" data-open={open || undefined}>
      {props.running ? <LoadingOutlined className="lpl-quick-search-leading" aria-hidden /> : <SearchOutlined className="lpl-quick-search-leading" aria-hidden />}
      <input ref={inputRef} aria-label="AI 快速搜索" aria-haspopup="dialog" aria-controls={open ? 'pricelens-price-search-results' : undefined}
        aria-expanded={open} aria-describedby={activeId} value={query} placeholder="搜索产品或价格问题"
        onFocus={props.onOpen} onChange={(event) => props.onQuery(event.target.value)}
        onKeyDown={(event) => { if (!event.nativeEvent.isComposing && event.keyCode !== 229) props.onKeyDown(event); }} />
      <button type="button" className="lpl-quick-search-voice" aria-label="搜索语音输入"
        title={props.voiceAvailable ? '语音输入' : '当前浏览器不支持语音输入'}
        disabled={!props.voiceAvailable || props.voiceListening || props.running} onClick={props.onVoice}>
        {props.voiceListening ? <LoadingOutlined spin /> : <AudioOutlined />}
      </button>
      <kbd aria-label={`快捷键 ${props.shortcut}`}>{props.shortcut}</kbd>
    </div>
    {renderedOpen && <div ref={panelRef} id="pricelens-price-search-results" className="lpl-quick-search-panel"
      role="dialog" aria-label="价格走势快速搜索结果" aria-hidden={!open || undefined}
      style={{ ...placement, pointerEvents: open ? 'auto' : 'none' }}>
      <div className="lpl-quick-search-tabs">
        <div role="group" aria-label="搜索方式">
          <button type="button" aria-pressed={mode === 'products'} onClick={() => { props.onMode('products'); inputRef.current?.focus(); }}>产品</button>
          <button type="button" aria-pressed={mode === 'ai'} onClick={() => { props.onMode('ai'); inputRef.current?.focus(); }}><RobotOutlined aria-hidden /> AI 分析</button>
        </div>
        <span>当前国家 · {props.countryCode}</span>
      </div>
      <div ref={resultsRef} data-search-results className="lpl-quick-search-scroll">
        {mode === 'products' ? <>
          <p className="lpl-quick-search-help">{products.length ? (trimmed ? '选择产品，切换看板主产品' : '输入型号、品牌或系列，快速定位产品') : (trimmed ? '暂无本地产品命中' : '当前国家与产业暂无可选产品')}</p>
          {products.length > 0 && <ul className="lpl-quick-search-products" aria-label="产品命中结果">
            {products.map((product, index) => {
              const defaultColor = product.configurations.find((option) => option.skuId === product.skuId)?.color;
              return <li key={product.modelId} data-search-item data-active={activeIndex === index || undefined}
                className="lpl-quick-search-result" onMouseEnter={() => props.onActive(index)}>
                <button id={`price-search-option-${product.modelId}`} data-search-model-id={product.modelId}
                  type="button" className="lpl-quick-search-product" onClick={() => props.onSelect(index)}>
                  <span className="lpl-quick-search-product-copy"><strong>{product.modelName}</strong>
                    <span>{product.brand} · 默认 {product.romram}{defaultColor && defaultColor !== '—' ? ` · ${defaultColor}` : ''}</span>
                  </span><ArrowRightOutlined aria-hidden />
                </button>
                {product.configurations.length > 1 && <details className="lpl-quick-search-configurations">
                  <summary aria-label={`${product.modelName} 可选规格`}>可选规格 <span>{product.configurations.length}</span></summary>
                  <div role="group" aria-label={`${product.modelName} 的规格`}>
                    {product.configurations.map((option) => <button type="button" key={option.skuId}
                      data-default={option.skuId === product.skuId || undefined} onClick={() => props.onSelect(index, option.skuId)}>
                      {option.romram}{option.color && option.color !== '—' ? ` · ${option.color}` : ''}
                    </button>)}
                  </div>
                </details>}
              </li>;
            })}
          </ul>}
          {!products.length && trimmed && <button type="button" className="lpl-quick-search-empty-action" title={trimmed} onClick={() => props.onMode('ai')}>
            <span>让 AI 分析这个问题</span><ArrowRightOutlined aria-hidden />
          </button>}
        </> : <section className="lpl-quick-search-ai" aria-label="AI 价格分析">
          <p>{trimmed ? 'AI 会基于当前国家、产业、产品和时间范围读取价格证据。' : '输入价格问题，或从当前看板的分析建议开始。'}</p>
          {!trimmed && <div className="lpl-quick-search-suggestions">{props.suggestions.map((suggestion, index) => <button
            type="button" key={suggestion} onClick={() => props.onSuggestion(index)}><span>{suggestion}</span><ArrowRightOutlined aria-hidden /></button>)}</div>}
          {trimmed && <p className="lpl-quick-search-query" title={trimmed}>{trimmed}</p>}
          {trimmed && <button data-search-item type="button" className="lpl-quick-search-submit"
            aria-label={props.failure ? '重试 AI 分析' : props.running ? '正在读取价格数据' : '开始 AI 分析'}
            disabled={props.running} onClick={props.onSubmit}>
            <span>{props.running ? '正在读取价格数据…' : props.failure ? '重试分析' : '开始分析'}</span>
            {props.running ? <LoadingOutlined aria-hidden /> : <ArrowRightOutlined aria-hidden />}
          </button>}
          <div className="lpl-quick-search-status" role="status" aria-live="polite">{props.status}
            {props.completed && <button type="button" onClick={props.onOpenAgent}>打开 Agent</button>}
          </div>
          {props.failure && <p role="alert" className="lpl-quick-search-error">{props.failure}</p>}
        </section>}
        {props.voiceError && <p role="alert" className="lpl-quick-search-error">{props.voiceError}</p>}
      </div>
      <div className="lpl-quick-search-footer">{mode === 'products' ? '↑ ↓ 选择 · Enter 切换产品' : 'Enter 开始分析'}<span>Esc 关闭</span></div>
    </div>}
  </div>;
}
