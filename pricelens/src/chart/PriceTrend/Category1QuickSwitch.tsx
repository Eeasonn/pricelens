import { useEffect, useMemo, useRef, useState } from 'react';
import { Popover } from 'antd';
import { CheckOutlined, DownOutlined } from '@ant-design/icons';
import type { Series } from '../../dataModel/types';
import type { FiltersState, ProductSelection } from '../../state/filtersTypes';
import { useFilters } from '../../state/FiltersContext';
import { remapSelection, selKey, withCompares, withMain } from '../../state/mainSelection';
import { seriesKeyMatches, seriesKeyOf } from './tableModel';
import { compareRomram, defaultColorSkuIds, modelNameOf, type RomramNode } from '../../components/ProductCascader/tree';
import { color, fontSize, formatPrice, radius, selectAccent, selectSoft, selectSoftInk } from '../../theme/tokens';
import { referencePriceOf } from '../../components/ProductPicker/tierRecommend';

export interface Category1Option {
  selection: ProductSelection;
  current: boolean;
  disabled: boolean;
  priceText: string;
}

export function category1OptionsOf(
  target: ProductSelection,
  nodes: ReadonlyMap<string, RomramNode>,
  currency: 'usd' | 'local',
): Category1Option[] {
  const currentKey = selKey(target);
  return [...nodes.values()]
    .filter((node) => node.modelId === target.modelId)
    .sort((a, b) => compareRomram(a.romram, b.romram))
    .map((node) => {
      const price = referencePriceOf(node, currency);
      return {
        selection: { modelId: node.modelId, romram: node.romram, skuIds: defaultColorSkuIds(node) },
        current: selKey({ modelId: node.modelId, romram: node.romram, skuIds: [] }) === currentKey,
        disabled: price == null,
        priceText: price != null ? formatPrice(Math.round(price), currency) : '近期无价',
      };
    });
}

export function applyCategory1Selection(
  state: FiltersState,
  target: ProductSelection,
  next: ProductSelection,
): FiltersState {
  const nextSel = next.platform === undefined && target.platform !== undefined ? { ...next, platform: target.platform } : next;
  if ((state.analysisMode ?? 'compare') === 'panorama') {
    const oldKey = selKey(target);
    return {
      ...state,
      panorama: {
        ...state.panorama,
        brands: state.panorama.brands.map((brand) => ({
          ...brand,
          sels: brand.sels.map((sel) => (selKey(sel) === oldKey ? nextSel : sel)),
        })),
        baselineKey: state.panorama.baselineKey === oldKey ? selKey(nextSel) : state.panorama.baselineKey,
      },
    };
  }
  let changed = false;
  const mains = state.mains.map((card) => {
    if (card.main && selKey(card.main) === selKey(target)) {
      changed = true;
      return withMain(card, nextSel);
    }
    if (!card.compares.some((sel) => selKey(sel) === selKey(target))) return card;
    changed = true;
    return withCompares(card, card.compares.map((sel) => (selKey(sel) === selKey(target) ? nextSel : sel)));
  });
  return changed ? { ...state, mains } : state;
}

function selectionForSeries(state: FiltersState, series: Series): ProductSelection | null {
  for (const card of state.mains) {
    if (card.main && seriesKeyMatches(series.key, seriesKeyOf(card.main))) return card.main;
    const compare = card.compares.find((sel) => seriesKeyMatches(series.key, seriesKeyOf(sel)));
    if (compare) return compare;
  }
  for (const brand of state.panorama.brands) {
    const sel = brand.sels.find((item) => seriesKeyMatches(series.key, seriesKeyOf(item)));
    if (sel) return sel;
  }
  return null;
}

export default function Category1QuickSwitch({ series, nodes }: { series: Series; nodes: ReadonlyMap<string, RomramNode> }) {
  const { state, actions } = useFilters();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const target = selectionForSeries(state, series);
  const options = useMemo(
    () => (target ? category1OptionsOf(target, nodes, state.currency) : []),
    [target, nodes, state.currency],
  );

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const current = menuRef.current?.querySelector<HTMLButtonElement>('button[aria-checked="true"]:not(:disabled)')
        ?? menuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)');
      current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  if (!target || options.length <= 1) {
    return <span className="tnum" style={{ fontSize: 10, lineHeight: '11px', color: color.mute, whiteSpace: 'nowrap' }}>{target?.romram ?? ''}</span>;
  }

  const oldNode = nodes.get(`${target.modelId}|${target.romram}`);
  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
    if (!items.length) return;
    const active = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
      : event.key === 'ArrowDown' ? Math.min(items.length - 1, Math.max(0, active + 1))
        : Math.max(0, active <= 0 ? items.length - 1 : active - 1);
    items[next]?.focus();
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) triggerRef.current?.focus();
      }}
      trigger="click"
      placement="bottomLeft"
      zIndex={1500}
      styles={{ body: { padding: 6, width: 248 } }}
      content={
        <div ref={menuRef} role="menu" aria-label={`切换 ${modelNameOf(target.modelId)} 的 category1`} onKeyDown={onKeyDown}>
          {options.map((option) => (
            <button
              key={selKey(option.selection)}
              type="button"
              role="menuitemradio"
              aria-checked={option.current}
              disabled={option.disabled}
              onClick={(event) => {
                event.stopPropagation();
                const node = nodes.get(`${option.selection.modelId}|${option.selection.romram}`);
                if (!node) return;
                const next = remapSelection(target, oldNode, node);
                const nextState = applyCategory1Selection(state, target, next);
                if ((state.analysisMode ?? 'compare') === 'panorama') actions.setPanorama(nextState.panorama);
                else actions.setMains(nextState.mains);
                setOpen(false);
                triggerRef.current?.focus();
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%', minHeight: 30,
                padding: '4px 8px', border: 'none', borderRadius: radius.control,
                background: option.current ? selectSoft : color.canvas,
                color: option.disabled ? color.mute : option.current ? selectSoftInk : color.body,
                font: 'inherit', fontSize: 12, textAlign: 'left', cursor: option.disabled ? 'not-allowed' : 'pointer',
              }}
            >
              <span style={{ width: 14, flexShrink: 0, color: selectAccent }}>{option.current ? <CheckOutlined aria-hidden /> : null}</span>
              <span className="tnum" style={{ flex: 1 }}>{option.selection.romram}</span>
              <span className="tnum" style={{ color: option.disabled ? color.mute : color.body }}>{option.priceText}</span>
            </button>
          ))}
        </div>
      }
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={`切换 ${modelNameOf(target.modelId)} 的 category1，当前 ${target.romram}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 3, padding: 0,
          border: 'none', background: 'transparent', color: open ? selectSoftInk : color.mute,
          font: 'inherit', fontSize: fontSize.caption, lineHeight: '11px', cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >
        {target.romram}
        <DownOutlined aria-hidden style={{ fontSize: 7 }} />
      </button>
    </Popover>
  );
}
