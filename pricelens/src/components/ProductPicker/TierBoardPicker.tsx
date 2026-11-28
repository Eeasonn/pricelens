import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Button, Checkbox, Popover, Radio, Segmented, Select, Tooltip } from 'antd';
import { CheckOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { dimProduct } from '../../data';
import { useFilters } from '../../state/FiltersContext';
import { newCardId } from '../../state/mainSelection';
import type { MainProduct } from '../../state/filtersTypes';
import { TIER_LABELS } from '../../dataModel/aggregate';
import { tierLabelShort } from '../../chart/PriceTrend/helpers';
import { currentPricesByGroup } from '../../dataModel/tierPrice';
import { color, font, radius, selectAccent, selectAccentFaint, selectSoft, selectSoftInk } from '../../theme/tokens';
import BrandDot, { brandLabelOf } from '../BrandMark';
import { configTextOf, ownBrand, productHasDataInCountry, shortRomram } from '../ProductCascader/tree';
import { EDITABLE_BORDER, PAIR_LIST_MAX_H, POPOVER_Z, TIP_Z, useTopEscClose, useTreeData } from './pickerBits';
import {
  applyTierDraftToMains,
  BOARD_COL_MIN_W,
  BOARD_COL_W,
  buildBoardColumns,
  comparisonConfigOf,
  hintOf,
  initialTierDraft,
  outlineRunsOf,
  recommendationLevelsOf,
  recommendationLevelOfModel,
  tierSelectionsOf,
  type BoardColumn,
  type BoardConfig,
  type BoardModel,
  type RecommendationLevel,
  type TierDraft,
  type TierSortMode,
} from './tierBoard';
import { selKey } from '../../state/mainSelection';

const NUM: CSSProperties = { fontFamily: font.family, fontVariantNumeric: 'tabular-nums' };
const GHOST_BTN: CSSProperties = {
  height: 24,
  padding: '0 10px',
  borderRadius: radius.control,
  border: `1px solid ${color.hairline}`,
  background: color.canvas,
  font: 'inherit',
  fontSize: 12,
  color: color.body,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const bandText = (band: string | null): string => band
  ? tierLabelShort(TIER_LABELS[band] ?? band).replace(/^(入门|旗舰)\s*·\s*/, '')
  : '';

const chipTextOf = (romram: string): string => {
  const text = configTextOf(romram);
  return text ? shortRomram(text) : '';
};

function ConfigChip({ model, shown, onChoose }: { model: BoardModel; shown: BoardConfig; onChoose: (config: BoardConfig) => void }): ReactNode {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<'bottomRight' | 'topRight'>('bottomRight');
  const chipRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useTopEscClose(open, () => setOpen(false));
  const text = chipTextOf(shown.sel.romram);
  const label = configTextOf(shown.sel.romram) || '默认配置';
  if (model.configs.length <= 1) {
    return text ? <span className="tnum" style={{ ...NUM, maxWidth: 76, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, color: color.mute }}>{text}</span> : null;
  }
  const options = [...model.configs.filter((c) => c.usd != null), ...model.configs.filter((c) => c.usd == null)];
  return (
    <Popover
      trigger="click"
      open={open}
      onOpenChange={(next) => {
        if (next) {
          const chip = chipRef.current;
          const panel = chip?.closest('[data-lpl-picker-panel]');
          if (chip && panel) {
            const room = panel.getBoundingClientRect().bottom - chip.getBoundingClientRect().bottom;
            setPlacement(room < 40 + options.length * 29 ? 'topRight' : 'bottomRight');
          }
        }
        setOpen(next);
      }}
      placement={placement}
      autoAdjustOverflow
      getPopupContainer={(node) => node.closest<HTMLElement>('[data-lpl-picker-panel]') ?? document.body}
      zIndex={POPOVER_Z}
      arrow={false}
      destroyOnHidden
      afterOpenChange={(visible) => {
        if (!visible) return;
        const current = menuRef.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')
          ?? menuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)');
        current?.focus();
      }}
      styles={{ body: { padding: 4, width: 208 } }}
      content={
        <div
          ref={menuRef}
          role="listbox"
          aria-label={`${model.name} 的配置`}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
            const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
            const index = items.indexOf(document.activeElement as HTMLButtonElement);
            const next = items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length];
            next?.focus();
            event.preventDefault();
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: 1 }}
        >
          {options.map((config) => {
            const active = config.selKey === shown.selKey;
            const configLabel = configTextOf(config.sel.romram) || '默认配置';
            return (
              <button
                key={config.selKey}
                type="button"
                role="option"
                aria-selected={active}
                disabled={config.usd == null}
                className="lpl-pk-ghost"
                data-testid="tier-board-config-option"
                onClick={() => {
                  onChoose(config);
                  setOpen(false);
                  chipRef.current?.focus();
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, height: 28, padding: '0 8px',
                  border: 'none', borderRadius: radius.control, background: active ? selectSoft : 'transparent',
                  color: config.usd == null ? color.mute : active ? selectSoftInk : color.ink,
                  font: 'inherit', fontSize: 12, textAlign: 'left', cursor: config.usd == null ? 'not-allowed' : 'pointer',
                }}
              >
                <span style={{ width: 14, flexShrink: 0, color: selectAccent }}>{active ? <CheckOutlined aria-hidden /> : null}</span>
                <span className="tnum" style={{ ...NUM, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{configLabel}</span>
              </button>
            );
          })}
        </div>
      }
    >
      <button
        ref={chipRef}
        type="button"
        className="lpl-pk-ghost tnum"
        data-testid="tier-board-config-chip"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`更换配置：${model.name} 当前 ${label}`}
        style={{
          ...NUM, display: 'inline-flex', alignItems: 'center', gap: 2, height: 18, maxWidth: 76,
          padding: '0 6px', borderRadius: radius.pill, border: `1px solid ${EDITABLE_BORDER}`,
          background: color.canvas, fontSize: 11, color: color.body, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
        }}
      >
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{text || '配置'}</span>
        <span aria-hidden style={{ fontSize: 8, color: color.mute, flexShrink: 0 }}>▾</span>
      </button>
    </Popover>
  );
}

export default function TierBoardPicker({ onApplied }: { onApplied: (previous: MainProduct[]) => void }) {
  const { state, actions } = useFilters();
  const { fullTree } = useTreeData();
  const industry = state.industry;
  const countryCode = state.countryCode;
  const [anchorBrand, setAnchorBrand] = useState<string>(() => ownBrand());
  const [mode, setMode] = useState<'edit' | 'new'>(() => state.mains[0]?.main ? 'edit' : 'new');
  const [draft, setDraft] = useState<TierDraft>(() => initialTierDraft(buildBoardColumns(
    currentPricesByGroup(state.industry, state.countryCode),
    new Set(dimProduct.filter((p) => p.industry === state.industry && productHasDataInCountry(p, state.countryCode, state.financingType, state.financingTerms))
      .map((p) => selKey({ modelId: p.model_id, romram: p.romram, skuIds: [] }))),
    fullTree.map((brand) => brand.key),
    ownBrand(),
    state.industry,
  ), state.mains));
  const [openNoPrice, setOpenNoPrice] = useState<Set<string>>(new Set());
  const [sortMode, setSortMode] = useState<TierSortMode>('price');

  const byGroup = useMemo(() => currentPricesByGroup(industry, countryCode), [industry, countryCode]);
  const dataKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const product of dimProduct) {
      if (product.industry !== industry) continue;
      if (productHasDataInCountry(product, countryCode, state.financingType, state.financingTerms)) {
        keys.add(selKey({ modelId: product.model_id, romram: product.romram, skuIds: [] }));
      }
    }
    return keys;
  }, [industry, countryCode, state.financingType, state.financingTerms]);
  const brandOrder = useMemo(() => fullTree.map((brand) => brand.key), [fullTree]);
  const columns = useMemo(
    () => buildBoardColumns(byGroup, dataKeys, brandOrder, anchorBrand, industry, { draft, sortMode }),
    [byGroup, dataKeys, brandOrder, anchorBrand, industry, draft, sortMode],
  );
  const brandOptions = useMemo(
    () => brandOrder.filter((brand) => columns.some((column) => column.brand === brand)).map((brand) => ({ value: brand, label: brandLabelOf(brand) })),
    [brandOrder, columns],
  );
  const levels = useMemo(() => recommendationLevelsOf(columns, draft, industry), [columns, draft, industry]);
  const picked = useMemo(() => tierSelectionsOf(columns, draft), [columns, draft]);

  const apply = (): void => {
    if (!picked) return;
    const previous = state.mains;
    const next = applyTierDraftToMains(previous, columns, draft, {
      existingId: mode === 'edit' ? previous[0]?.id : undefined,
      newId: newCardId(),
    });
    actions.setMains(next);
    onApplied(previous);
  };

  const newGroup = (): void => {
    setMode('new');
    setDraft(initialTierDraft(columns, []));
  };

  const renderRow = (col: BoardColumn, model: BoardModel): ReactNode => {
    const shown = comparisonConfigOf(model, draft, picked?.anchor.usd ?? null);
    const on = col.anchor ? draft.anchorKey === shown.selKey : draft.checked.has(model.modelId);
    const fullName = `${model.name} ${configTextOf(shown.sel.romram)}`.trim();
    return (
      <div
        key={model.modelId}
        data-testid="tier-board-row"
        data-model={model.modelId}
        data-band={shown.band ?? ''}
        data-config={shown.selKey}
        data-recommendation={col.anchor ? '' : recommendationLevelOfModel(model, levels) ?? ''}
        style={{
          position: 'relative', display: 'flex', alignItems: 'center', gap: 4, height: 28,
          padding: '0 6px', borderRadius: radius.control, background: on ? selectSoft : 'transparent', minWidth: 0,
        }}
      >
        {col.anchor ? (
          <Radio
            checked={on}
            onChange={() => setDraft((current) => ({
              ...current,
              anchorKey: shown.selKey,
              chosen: new Map(current.chosen).set(model.modelId, shown.selKey),
              checked: new Set([...current.checked].filter((id) => id !== model.modelId)),
            }))}
            aria-label={`设为主产品：${fullName}`}
          />
        ) : (
          <Checkbox
            checked={on}
            disabled={picked?.anchor.sel.modelId === model.modelId}
            onChange={() => setDraft((current) => {
              const checked = new Set(current.checked);
              if (checked.has(model.modelId)) checked.delete(model.modelId);
              else checked.add(model.modelId);
              return { ...current, checked };
            })}
            aria-label={`${on ? '取消对比' : '加入对比'}：${fullName}`}
          />
        )}
        <span
          title={model.name}
          style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, color: shown.usd == null ? color.mute : color.ink }}
        >
          {model.name}
        </span>
        <ConfigChip
          model={model}
          shown={shown}
          onChoose={(config) => setDraft((current) => ({
            ...current,
            chosen: new Map(current.chosen).set(model.modelId, config.selKey),
            ...(col.anchor ? { anchorKey: config.selKey } : {}),
          }))}
        />
      </div>
    );
  };

  const outlineStyle = (level: RecommendationLevel): CSSProperties => ({
    border: level === 'nearest' ? `2px solid ${selectAccent}` : level === 'same' ? `1px solid ${selectAccent}` : `1px solid ${selectAccentFaint}`,
    borderRadius: radius.control,
    padding: level === 'nearest' ? '1px 2px' : '2px 3px',
    margin: level === 'nearest' ? '1px -2px' : '1px -3px',
    boxSizing: 'border-box',
  });

  const renderOutlineGroup = (col: BoardColumn, models: BoardModel[], group: ReturnType<typeof outlineRunsOf>[number]): ReactNode => {
    const rows: ReactNode[] = [];
    for (let index = group.start; index < group.end;) {
      const nearest = group.nearest.find((range) => range.start === index);
      if (nearest) {
        rows.push(<div key={`nearest-${nearest.start}`} data-testid="tier-outline-nearest" style={outlineStyle('nearest')}>
          {models.slice(nearest.start, nearest.end).map((model) => renderRow(col, model))}
        </div>);
        index = nearest.end;
      } else {
        rows.push(renderRow(col, models[index]));
        index += 1;
      }
    }
    return <div key={`${group.level ?? 'plain'}-${group.start}`} data-testid={group.level ? `tier-outline-${group.level}` : undefined}
      style={{ display: 'grid', gap: 1, ...(group.level ? outlineStyle(group.level) : {}) }}>{rows}</div>;
  };
  const anchorBands = new Set<string>(picked?.anchor.band ? [picked.anchor.band] : []);

  return (
    <div data-testid="tier-board" style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: color.ink }}>主产品</span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <Segmented
            size="small"
            aria-label="档位排序"
            value={sortMode}
            onChange={(value) => setSortMode(value as TierSortMode)}
            options={[{ label: '价格', value: 'price' }, { label: '名称', value: 'name' }]}
          />
          <Tooltip
            zIndex={TIP_Z}
            title="按当前主产品的具体配置计算：每个品牌至多两个价格最近项、同档位、相邻档位。价格只用于后台计算，不自动勾选产品。"
          >
            <button type="button" aria-label="档位推荐规则说明" style={{ padding: 0, border: 'none', background: 'none', color: color.mute, cursor: 'help' }}>
              <QuestionCircleOutlined style={{ fontSize: 12 }} />
            </button>
          </Tooltip>
        </span>
      </div>
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', height: PAIR_LIST_MAX_H, paddingBottom: 4, alignItems: 'stretch' }}>
        {columns.length === 0 && <div role="status" style={{ padding: '24px 12px', fontSize: 12, color: color.mute }}>当前产业在该国暂无可按档位选择的产品</div>}
        {columns.map((col) => (
          <div
            key={col.brand}
            data-testid="tier-board-column"
            data-brand={col.brand}
            data-anchor={col.anchor ? 'true' : 'false'}
            style={{
              flex: '0 0 auto', width: BOARD_COL_W, minWidth: BOARD_COL_MIN_W, display: 'flex', flexDirection: 'column',
              border: `1px solid ${col.anchor ? selectAccent : color.hairline}`, borderRadius: radius.card,
              background: col.anchor ? selectSoft : color.canvas, overflow: 'hidden',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', borderBottom: `1px solid ${color.hairline}`, flexShrink: 0, background: col.anchor ? selectSoft : color.canvas }}>
              <BrandDot brand={col.brand} />
              {col.anchor ? (
                <Select
                  size="small"
                  aria-label="主产品品牌"
                  value={col.brand}
                  onChange={(value) => {
                    setAnchorBrand(value);
                    setDraft((current) => ({ ...current, anchorKey: null }));
                  }}
                  options={brandOptions}
                  popupMatchSelectWidth={false}
                  getPopupContainer={(node: HTMLElement) => node.closest<HTMLElement>('[data-lpl-picker-panel]') ?? document.body}
                  style={{ minWidth: 92, flexShrink: 0 }}
                  variant="borderless"
                />
              ) : (
                <span style={{ fontSize: 12, fontWeight: 600, color: color.ink }}>{brandLabelOf(col.brand)}</span>
              )}
            </div>
            <div className="lpl-card-scroll" style={{ flex: 1, overflowY: 'auto', padding: '4px 4px 8px', display: 'flex', flexDirection: 'column', gap: 1 }}>
              {col.sections.map((section) => {
                const isNoPrice = section.band == null;
                const expanded = !isNoPrice || openNoPrice.has(col.brand);
                const sectionLevels = section.models.map((model) => {
                  const shown = comparisonConfigOf(model, draft, picked?.anchor.usd ?? null);
                  return { base: col.anchor ? null : hintOf(shown.band, anchorBands, industry), nearest: !col.anchor && recommendationLevelOfModel(model, levels) === 'nearest' };
                });
                const runs = expanded ? outlineRunsOf(sectionLevels) : [];
                return (
                  <div key={section.band ?? 'none'}>
                    {isNoPrice ? (
                      <button
                        type="button"
                        data-testid="tier-board-band"
                        aria-expanded={expanded}
                        onClick={() => setOpenNoPrice((previous) => {
                          const next = new Set(previous);
                          if (next.has(col.brand)) next.delete(col.brand);
                          else next.add(col.brand);
                          return next;
                        })}
                        style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 4, marginTop: 4, padding: '6px 8px 2px', border: 'none', borderTop: `1px solid ${color.hairline}`, background: 'none', color: color.mute, font: 'inherit', fontSize: 10, fontWeight: 600, textAlign: 'left', cursor: 'pointer' }}
                      >
                        <span aria-hidden style={{ fontSize: 8 }}>{expanded ? '▾' : '▸'}</span>
                        <span>暂无数据</span>
                      </button>
                    ) : (
                      <div data-testid="tier-board-band" className="tnum" style={{ ...NUM, padding: '6px 8px 2px', marginTop: 4, borderTop: `1px solid ${color.hairline}`, fontSize: 10, fontWeight: 600, color: color.mute }}>
                        {bandText(section.band)}
                      </div>
                    )}
                    {expanded && (
                      <div style={{ display: 'grid', gap: 1 }}>
                        {runs.map((group) => renderOutlineGroup(col, section.models, group))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <button type="button" className="lpl-pk-ghost" onClick={newGroup} style={GHOST_BTN}>新建对比组</button>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <button
            type="button"
            className="lpl-pk-ghost"
            aria-label="清空当前档位草稿"
            onClick={() => setDraft(initialTierDraft(columns, []))}
            style={GHOST_BTN}
          >
            清空
          </button>
          <Button type="primary" size="small" disabled={!picked} onClick={apply}>
            {mode === 'edit' ? '应用本组' : '创建对比组'}
          </Button>
        </span>
      </div>
    </div>
  );
}
