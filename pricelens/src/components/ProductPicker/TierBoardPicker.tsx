// ============================================================
// 按档位选择看板（2026-11-27 二轮改版 · 2026-11-28 二版「一行一款」）：当前国家+
// 产业全部型号按品牌分列，行 = 一款型号（勾选 · 型号名 · 配置 chip · 现价），
// 配置不逐条铺开——chip 点开 Popover 换配置。行位置 / 分段 = 起售配置（有价配置
// USD 最低）的落档，勾选与换配置都不挪行；全无价型号进底部可折叠「暂无现价」段。
// 最左 = 锚定品牌列（默认我司，列头可换）。
// 蓝框提示（只是提示，永不自动勾选）：在型号全部配置里取最优——同档（selectAccent
// 描边）> 相邻档（selectAccentFaint 描边）；提示由非起售配置驱动时 chip 显示该配置，
// 让用户看到为什么。非颜色表达 = 行内 visually-hidden「同档（12+512 GB）」+ 图例行。
// 勾选 = 锁定当下显示配置（此后锚变化不漂移）。初始勾选 = 当前 state.mains 推导。
// 2026-11-28 四轮打磨：列宽 288（min 272，「iPhone 18 Pro Max」级型号名完整）；chip 限宽 76 省略、价格列定宽
// 64 右对齐；分段标签「起售 · {档}」；显示配置因提示偏离起售时 chip 自带同档 / 相邻档样式
// （chipHintOf）+ tooltip 说明；相邻档改 1px 虚线（同档实线）；Popover 挂面板根内。
// 「应用（N）」→ cardsFromBoard（方案 A：每个勾选锚一组，非锚按所选配置 |USD 价差|
// 就近分配）→ newCardId 建卡、对比登记来源 'tier'、auto:false → actions.setMains
// 整表替换 → message.success 带「撤销」恢复替换前数组 → 通知外层切回按产品。
// 固定骨架：面板外框不随选择方式改变——看板与分析对列表共用同一高度预算
// （PAIR_LIST_MAX_H）与底栏占位，列内纵向滚动、整板横向滚动。
// ============================================================
import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Button, Checkbox, message, Popover, Select, Tooltip } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { dimProduct } from '../../data';
import { useFilters } from '../../state/FiltersContext';
import { newCardId, selKey, withComparesAdded, withMain } from '../../state/mainSelection';
import type { MainProduct } from '../../state/filtersTypes';
import { TIER_LABELS } from '../../dataModel/aggregate';
import { tierLabelShort } from '../../chart/PriceTrend/helpers';
import { currentPricesByGroup } from '../../dataModel/tierPrice';
import { color, font, formatPrice, radius, selectAccent, selectAccentFaint, selectSoft, selectSoftInk } from '../../theme/tokens';
import BrandDot, { brandLabelOf } from '../BrandMark';
import { configTextOf, ownBrand, productHasDataInCountry, shortRomram } from '../ProductCascader/tree';
import { EDITABLE_BORDER, PAIR_LIST_MAX_H, POPOVER_Z, TIP_Z, useTopEscClose, useTreeData } from './pickerBits';
import {
  anchorContextOf,
  boardPicks,
  BOARD_COL_MIN_W,
  BOARD_COL_W,
  buildBoardColumns,
  cardsFromBoard,
  chipHintOf,
  startConfig,
  checkAllSameDraft,
  hintOf,
  initialDraft,
  rowViewOf,
  toggleModel,
  type AnchorContext,
  type BoardColumn,
  type BoardConfig,
  type BoardDraft,
  type BoardHint,
  type BoardModel,
} from './tierBoard';
import { periodText } from './tierRecommend';

/** visually-hidden（同档/相邻档的非颜色表达：屏幕阅读器可读，视觉不占位） */
const SR_ONLY: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

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

const NUM: CSSProperties = { fontFamily: font.family, fontVariantNumeric: 'tabular-nums' };

const HINT_TEXT: Record<'same' | 'adjacent', string> = { same: '同档', adjacent: '相邻档' };

/** 配置 chip 短文（`12+256 GB` → `12+256`）；无配置层级 → 空串 */
const chipTextOf = (romram: string): string => {
  const t = configTextOf(romram);
  return t ? shortRomram(t) : '';
};

const bandText = (band: string | null): string => (band ? tierLabelShort(TIER_LABELS[band] ?? band) : '');

/** 提示描边（行 / chip / 图例样本共用）：同档 = 实线 selectAccent；相邻档 = 虚线 selectAccentFaint */
const hintBorder = (hint: BoardHint): string =>
  hint === 'same' ? `1px solid ${selectAccent}` : hint === 'adjacent' ? `1px dashed ${selectAccentFaint}` : '1px solid transparent';

/** 价格列定宽（右对齐，行间数字对齐） */
const PRICE_W = 64;

const priceTip = (c: BoardConfig): string =>
  c.period == null
    ? '暂无现价：当前国家该配置没有可用的最新价格'
    : `${periodText(c.period)} · ${c.points} 个价格点${c.dropped.length ? ` · 已剔除 ${c.dropped.length} 个异常低价 ${c.dropped.map((d) => `$${Math.round(d)}`).join('、')}` : ''}`;

/** 配置 chip + 换配置 Popover（一行一个；多配置才可点） */
function ConfigChip({
  model,
  shown,
  anchors,
  isAnchorColumn,
  priceOf,
  currency,
  chipHint,
  anchorLabel,
  onChoose,
}: {
  model: BoardModel;
  shown: BoardConfig;
  anchors: AnchorContext | null;
  isAnchorColumn: boolean;
  priceOf: (c: BoardConfig) => number | null;
  currency: 'usd' | 'local';
  /** chip 提示样式（chipHintOf）：显示配置因提示偏离起售时挂同档 / 相邻档 */
  chipHint: BoardHint;
  anchorLabel: string;
  onChoose: (c: BoardConfig) => void;
}): ReactNode {
  const [open, setOpen] = useState(false);
  // 落位：默认 bottomRight；chip 距面板底不足 Popover 高度时翻到 topRight（挂面板根内，
  // 面板自身 overflow 会裁切，故按面板而非视口判断）
  const [placement, setPlacement] = useState<'bottomRight' | 'topRight'>('bottomRight');
  const chipRef = useRef<HTMLButtonElement>(null);
  useTopEscClose(open, () => setOpen(false));
  const text = chipTextOf(shown.sel.romram);
  const label = configTextOf(shown.sel.romram) || '默认配置';
  const start = startConfig(model);
  const chipTitle = chipHint
    ? `${label} 现价 ${formatPrice(priceOf(shown), currency)} 落 ${bandText(shown.band)}，与已选 ${anchorLabel} ${HINT_TEXT[chipHint]}；` +
      `起售配置 ${configTextOf(start.sel.romram) || '默认配置'} ${start.usd != null ? formatPrice(priceOf(start), currency) : '暂无现价'}`
    : null;
  const chipBase: CSSProperties = {
    ...NUM,
    display: 'inline-block',
    maxWidth: 76,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flexShrink: 0,
    fontSize: 11,
    lineHeight: '16px',
  };
  if (model.configs.length <= 1) {
    return text ? (
      <span
        className="tnum"
        data-testid="tier-board-config-text"
        data-chip-hint={chipHint ?? ''}
        title={chipTitle ?? label}
        style={{ ...chipBase, color: chipHint === 'same' ? selectAccent : chipHint === 'adjacent' ? selectSoftInk : color.mute }}
      >
        {text}
      </span>
    ) : null;
  }
  // 列表：有价配置在前（配置序），无价配置殿后灰显
  const list = [...model.configs.filter((c) => c.usd != null), ...model.configs.filter((c) => c.usd == null)];
  const content = (
    <div
      role="listbox"
      aria-label={`${model.name} 的配置`}
      data-tier-config-list={model.modelId}
      onKeyDown={(e) => {
        // ↑↓ 在配置项间移动焦点
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="option"]')];
        const i = items.indexOf(document.activeElement as HTMLElement);
        const next = items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length];
        next?.focus();
        e.preventDefault();
      }}
      style={{ display: 'flex', flexDirection: 'column', gap: 1, padding: 4, width: 240, boxSizing: 'border-box' }}>
      {list.map((c) => {
        const active = c.selKey === shown.selKey;
        const hint: BoardHint = !isAnchorColumn && anchors ? hintOf(c.band, anchors.bands, anchors.industry) : null;
        const noPrice = c.usd == null;
        const cfgText = configTextOf(c.sel.romram) || '默认配置';
        return (
          <button
            key={c.selKey}
            type="button"
            role="option"
            aria-selected={active}
            className="lpl-pk-ghost"
            data-testid="tier-board-config-option"
            title={priceTip(c)}
            onClick={() => {
              onChoose(c);
              setOpen(false);
              chipRef.current?.focus();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              height: 28,
              padding: '0 8px',
              borderRadius: radius.control,
              border: 'none',
              background: active ? selectSoft : 'transparent',
              color: noPrice ? color.mute : color.ink,
              font: 'inherit',
              fontSize: 12,
              cursor: 'pointer',
              textAlign: 'left',
              whiteSpace: 'nowrap',
            }}
          >
            <span className="tnum" style={{ ...NUM, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: active ? 600 : 400, color: active ? selectSoftInk : undefined }}>{cfgText}</span>
            {hint && (
              <span style={{ fontSize: 10, color: selectSoftInk, border: hintBorder(hint), borderRadius: radius.pill, padding: '0 5px', lineHeight: '14px', flexShrink: 0 }}>
                {HINT_TEXT[hint]}
              </span>
            )}
            <span className="tnum" style={{ ...NUM, fontSize: 10, color: color.mute, width: 68, flexShrink: 0, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis' }}>{noPrice ? '' : bandText(c.band)}</span>
            <span className="tnum" style={{ ...NUM, fontSize: 11, color: noPrice ? color.mute : color.body, width: 52, flexShrink: 0, textAlign: 'right' }}>
              {noPrice ? '暂无现价' : formatPrice(priceOf(c), currency)}
            </span>
          </button>
        );
      })}
    </div>
  );
  return (
    <Popover
      trigger="click"
      open={open}
      onOpenChange={(v) => {
        if (v) {
          const chip = chipRef.current;
          const panel = chip?.closest('[data-lpl-picker-panel]');
          if (chip && panel) {
            const room = panel.getBoundingClientRect().bottom - chip.getBoundingClientRect().bottom;
            setPlacement(room < 40 + model.configs.length * 29 ? 'topRight' : 'bottomRight');
          }
        }
        setOpen(v);
      }}
      placement={placement}
      autoAdjustOverflow
      // 挂面板根：留在 dialog 的叠放上下文内，不溢出到面板外的图表上
      getPopupContainer={(node) => node.closest<HTMLElement>('[data-lpl-picker-panel]') ?? document.body}
      zIndex={POPOVER_Z}
      arrow={false}
      destroyOnHidden
      // 键盘可达：打开后焦点落到当前配置项（Popover 挂 body，Tab 序到不了），Esc / 选择后还焦 chip
      afterOpenChange={(visible) => {
        if (!visible) return;
        const list = document.querySelector<HTMLElement>(`[data-tier-config-list="${model.modelId}"]`);
        (list?.querySelector<HTMLElement>('[aria-selected="true"]') ?? list?.querySelector<HTMLElement>('button'))?.focus();
      }}
      styles={{ body: { padding: 0 } }}
      content={content}
    >
      <button
        ref={chipRef}
        type="button"
        className="lpl-pk-ghost tnum"
        data-testid="tier-board-config-chip"
        data-chip-hint={chipHint ?? ''}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`更换配置：${model.name} 当前 ${label}`}
        title={chipTitle ? `${chipTitle} · 共 ${model.configs.length} 个配置，点击更换` : `${label} · 共 ${model.configs.length} 个配置，点击更换`}
        style={{
          ...NUM,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 2,
          height: 18,
          maxWidth: 76,
          padding: '0 6px',
          borderRadius: radius.pill,
          border: chipHint ? hintBorder(chipHint) : `1px solid ${EDITABLE_BORDER}`,
          background: color.canvas,
          fontSize: 11,
          color: chipHint === 'same' ? selectAccent : chipHint === 'adjacent' ? selectSoftInk : color.body,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{text || '配置'}</span>
        <span aria-hidden style={{ fontSize: 8, color: color.mute, flexShrink: 0 }}>▾</span>
      </button>
    </Popover>
  );
}

export default function TierBoardPicker({ onApplied }: { onApplied: () => void }) {
  const { state, actions } = useFilters();
  const { fullTree } = useTreeData();
  const industry = state.industry;
  const countryCode = state.countryCode;
  const currency = state.currency;

  // 锚定品牌（组件态；默认我司。换锚 = 该品牌提到最左列，其余保持树序）
  const [anchorBrand, setAnchorBrand] = useState<string>(() => ownBrand());

  // 批量现价裁定（事实表一遍扫描）+ 该国有数据的组 selKey 集（financing-aware，与树同口径）
  const byGroup = useMemo(() => currentPricesByGroup(industry, countryCode), [industry, countryCode]);
  const dataKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const p of dimProduct) {
      if (p.industry !== industry) continue;
      if (productHasDataInCountry(p, countryCode, state.financingType, state.financingTerms)) {
        keys.add(selKey({ modelId: p.model_id, romram: p.romram, skuIds: [] }));
      }
    }
    return keys;
  }, [industry, countryCode, state.financingType, state.financingTerms]);
  const brandOrder = useMemo(() => fullTree.map((b) => b.key), [fullTree]);
  const columns = useMemo(
    () => buildBoardColumns(byGroup, dataKeys, brandOrder, anchorBrand, industry),
    [byGroup, dataKeys, brandOrder, anchorBrand, industry],
  );
  const brandOptions = useMemo(
    () => brandOrder.filter((b) => columns.some((c) => c.brand === b)).map((b) => ({ value: b, label: brandLabelOf(b) })),
    [brandOrder, columns],
  );

  // 勾选草稿（进入看板时由当前 mains 推导一次，此后与 mains 脱钩）
  const [draft, setDraft] = useState<BoardDraft>(() => initialDraft(columns, state.mains));
  // 「暂无现价」段折叠态（品牌 → 展开）
  const [openNoPrice, setOpenNoPrice] = useState<Set<string>>(() => new Set());

  const anchors = useMemo(() => anchorContextOf(columns, draft, industry), [columns, draft, industry]);
  const anchorCheckedCount = useMemo(() => {
    const col = columns.find((c) => c.anchor);
    return col ? col.sections.reduce((n, s) => n + s.models.filter((m) => draft.checked.has(m.modelId)).length, 0) : 0;
  }, [columns, draft]);
  const boardModelIds = useMemo(() => new Set(columns.flatMap((c) => c.sections.flatMap((s) => s.models.map((m) => m.modelId)))), [columns]);
  const checkedCount = useMemo(() => [...draft.checked].filter((id) => boardModelIds.has(id)).length, [draft, boardModelIds]);

  /** 应用（方案 A）：勾选锚逐个成组、非锚按所选配置现价就近分配；整表替换 mains */
  const apply = (): void => {
    const picks = boardPicks(columns, draft, anchors);
    if (!picks.anchors.length) return;
    const groups = cardsFromBoard(picks.anchors, picks.others);
    const prev = state.mains;
    const cards: MainProduct[] = groups.map((g) => {
      // 建卡走 mainSelection helper 链：withMain 落主品（剔除同组对比、收口登记）、
      // withComparesAdded 把分配到的对比登记为来源 'tier'。withMain 对「空对比区的
      // 华为主品卡」会自动开启矩阵驱动并填入矩阵产出——按档位组装不用矩阵，落主品后
      // 显式清空对比区并关闭 auto，矩阵填充随之剔除（矩阵项无用户来源登记，不残留）。
      let card: MainProduct = { id: newCardId(), main: null, compares: [] };
      card = withMain(card, g.main);
      card = { ...card, auto: false, compares: [] };
      delete card.compareSources;
      delete card.excluded;
      if (g.compares.length) card = withComparesAdded(card, g.compares, 'tier');
      return card;
    });
    actions.setMains(cards);
    message.success({
      content: (
        <span>
          已按档位生成 {cards.length} 组{' '}
          <Button
            type="link"
            size="small"
            style={{ padding: 0, height: 'auto' }}
            onClick={() => {
              actions.setMains(prev);
              message.destroy();
            }}
          >
            撤销
          </Button>
        </span>
      ),
      duration: 6,
    });
    onApplied();
  };

  const priceOf = (c: BoardConfig): number | null => {
    const v = currency === 'usd' ? c.usd : c.local;
    return v != null ? Math.round(v) : null;
  };

  const renderRow = (col: BoardColumn, model: BoardModel): ReactNode => {
    const on = draft.checked.has(model.modelId);
    const explicit = draft.chosen.get(model.modelId);
    const { config: shown, hint } = rowViewOf(model, explicit, anchors, col.anchor);
    const chipHint = chipHintOf(model, shown, explicit, col.anchor ? null : anchors);
    const noPrice = shown.usd == null;
    const cfgText = configTextOf(shown.sel.romram);
    const fullName = [model.name, cfgText].filter(Boolean).join(' ');
    return (
      <div
        key={model.modelId}
        data-testid="tier-board-row"
        data-model={model.modelId}
        data-band={shown.band ?? ''}
        data-start-band={model.startBand ?? ''}
        data-hint={hint ?? ''}
        data-chip-hint={chipHint ?? ''}
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          height: 28,
          padding: '0 6px',
          borderRadius: radius.control,
          border: hintBorder(hint),
          minWidth: 0,
        }}
      >
        {hint && <span style={SR_ONLY}>{`${HINT_TEXT[hint]}${cfgText ? `（${cfgText}）` : ''}`}</span>}
        <Checkbox
          checked={on}
          onChange={(e) => setDraft((d) => toggleModel(d, model, e.target.checked, shown))}
          aria-label={`${on ? '取消选择' : '选择'} ${brandLabelOf(model.brand)} ${fullName}`}
        />
        <span
          style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, color: noPrice ? color.mute : color.ink }}
          title={model.name}
        >
          {model.name}
        </span>
        <ConfigChip
          model={model}
          shown={shown}
          anchors={anchors}
          isAnchorColumn={col.anchor}
          priceOf={priceOf}
          currency={currency}
          chipHint={chipHint}
          anchorLabel={brandLabelOf(anchorBrand)}
          onChoose={(c) => setDraft((d) => {
            const chosen = new Map(d.chosen);
            chosen.set(model.modelId, c.selKey);
            return { checked: d.checked, chosen };
          })}
        />
        <span
          className="tnum"
          data-testid="tier-board-price"
          title={priceTip(shown)}
          style={{ ...NUM, fontSize: 11, color: noPrice ? color.mute : color.body, flexShrink: 0, width: PRICE_W, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {noPrice ? '暂无现价' : formatPrice(priceOf(shown), currency)}
        </span>
      </div>
    );
  };

  return (
    <div data-testid="tier-board" style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      {/* 图例行：蓝框语义 + 现价口径（非颜色表达的另一半在行内 sr-only 文案） */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: 11, color: color.mute, flexWrap: 'wrap' }}>
        <span data-testid="tier-board-legend" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span aria-hidden style={{ display: 'inline-block', width: 14, height: 9, borderRadius: 2, border: hintBorder('same') }} />
          <span aria-hidden style={{ display: 'inline-block', width: 14, height: 9, borderRadius: 2, border: hintBorder('adjacent') }} />
          <span>实线蓝框 = 与已选 {brandLabelOf(anchorBrand)} 同档 · 虚线框 = 相邻档（±1）</span>
        </span>
        <Tooltip
          zIndex={TIP_Z}
          title={
            '现价 = 该配置全部颜色在最新有价期的全部渠道价格点，剔除低于同期均值 30% 的异常低价后取最低（USD 口径）；' +
            '档位 = 现价落入的产业价格阶梯。每款按起售配置（最低现价配置）分段、段内按起售价从高到低，一款一行，点配置可换；' +
            '显示的配置若因提示不是起售配置，配置标签会带同档 / 相邻档框。蓝框只是提示，不会替你勾选。'
          }
        >
          <button
            type="button"
            aria-label="现价落档口径说明"
            style={{ display: 'inline-flex', alignItems: 'center', padding: 0, border: 'none', background: 'none', cursor: 'help', color: color.mute }}
          >
            <QuestionCircleOutlined style={{ fontSize: 11 }} />
          </button>
        </Tooltip>
      </div>

      {/* 看板：每品牌一列（锚列最左），行按起售档分段；列内纵向滚动、整板横向滚动 */}
      <div
        style={{
          display: 'flex',
          gap: 10,
          overflowX: 'auto',
          height: PAIR_LIST_MAX_H,
          paddingBottom: 4,
          alignItems: 'stretch',
        }}
      >
        {columns.length === 0 && (
          <div role="status" style={{ padding: '24px 12px', fontSize: 12, color: color.mute }}>
            当前产业在该国暂无可按档位选择的产品
          </div>
        )}
        {columns.map((col) => (
          <div
            key={col.brand}
            data-testid="tier-board-column"
            data-brand={col.brand}
            data-anchor={col.anchor ? 'true' : 'false'}
            style={{
              flex: '0 0 auto',
              width: BOARD_COL_W,
              minWidth: BOARD_COL_MIN_W,
              display: 'flex',
              flexDirection: 'column',
              border: `1px solid ${col.anchor ? selectAccent : color.hairline}`,
              borderRadius: radius.card,
              background: col.anchor ? selectSoft : color.canvas,
              overflow: 'hidden',
            }}
          >
            {/* 列头（sticky）：品牌点 + 名称 + 款数；锚列头带锚品牌切换 */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 10px',
                borderBottom: `1px solid ${color.hairline}`,
                flexShrink: 0,
                background: col.anchor ? selectSoft : color.canvas,
              }}
            >
              <BrandDot brand={col.brand} />
              {col.anchor ? (
                <Select
                  size="small"
                  aria-label="锚定品牌"
                  value={col.brand}
                  onChange={(v) => setAnchorBrand(v)}
                  options={brandOptions}
                  popupMatchSelectWidth={false}
                  getPopupContainer={(node) => node.closest('[data-lpl-picker-panel]') ?? document.body}
                  style={{ minWidth: 92, flexShrink: 0 }}
                  variant="borderless"
                />
              ) : (
                <span style={{ fontSize: 12, fontWeight: 600, color: color.ink }}>{brandLabelOf(col.brand)}</span>
              )}
              <span className="tnum" data-testid="tier-board-count" style={{ ...NUM, marginLeft: 'auto', fontSize: 10, color: color.mute, flexShrink: 0 }}>{col.count} 款</span>
            </div>
            <div className="lpl-card-scroll" style={{ flex: 1, overflowY: 'auto', padding: '4px 4px 8px', display: 'flex', flexDirection: 'column', gap: 1 }}>
              {col.sections.map((sec) => {
                const isNoPrice = sec.band == null;
                const expanded = !isNoPrice || openNoPrice.has(col.brand);
                const headStyle: CSSProperties = {
                  padding: '6px 8px 2px',
                  fontSize: 10,
                  fontWeight: 600,
                  color: color.mute,
                  letterSpacing: 0.2,
                  borderTop: `1px solid ${color.hairline}`,
                  marginTop: 4,
                };
                return (
                  <div key={sec.band ?? 'none'}>
                    {isNoPrice ? (
                      <button
                        type="button"
                        data-testid="tier-board-band"
                        aria-expanded={expanded}
                        onClick={() => setOpenNoPrice((prev) => {
                          const next = new Set(prev);
                          if (next.has(col.brand)) next.delete(col.brand);
                          else next.add(col.brand);
                          return next;
                        })}
                        style={{ ...headStyle, display: 'flex', width: '100%', alignItems: 'center', gap: 4, border: 'none', borderTop: headStyle.borderTop, background: 'none', cursor: 'pointer', font: 'inherit', fontSize: 10, fontWeight: 600, textAlign: 'left' }}
                      >
                        <span aria-hidden style={{ fontSize: 8 }}>{expanded ? '▾' : '▸'}</span>
                        <span className="tnum" style={NUM}>暂无现价（{sec.models.length}）</span>
                      </button>
                    ) : (
                      <div data-testid="tier-board-band" className="tnum" style={{ ...headStyle, ...NUM }}>起售 · {bandText(sec.band)}</div>
                    )}
                    {expanded && sec.models.map((m) => renderRow(col, m))}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* 底栏（固定）：左提示 + 按提示全选同档 / 清空 / 应用（N） */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: color.mute }}>
          {anchorCheckedCount === 0
            ? `先在 ${brandLabelOf(anchorBrand)} 列选择至少一款`
            : `已选 ${anchorCheckedCount} 款锚定产品 · 应用后每个锚定产品各成一组`}
        </span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <button
            type="button"
            className="lpl-pk-ghost"
            aria-label="按提示全选同档"
            disabled={anchorCheckedCount === 0}
            onClick={() => setDraft((d) => checkAllSameDraft(columns, d, anchorContextOf(columns, d, industry)))}
            style={{ ...GHOST_BTN, color: anchorCheckedCount === 0 ? color.mute : color.body, cursor: anchorCheckedCount === 0 ? 'not-allowed' : 'pointer' }}
          >
            按提示全选同档
          </button>
          <button
            type="button"
            className="lpl-pk-ghost"
            aria-label="清空按档位勾选"
            disabled={checkedCount === 0}
            onClick={() => setDraft({ checked: new Set(), chosen: new Map() })}
            style={{ ...GHOST_BTN, color: checkedCount === 0 ? color.mute : color.body, cursor: checkedCount === 0 ? 'not-allowed' : 'pointer' }}
          >
            清空
          </button>
          <Button
            type="primary"
            size="small"
            disabled={anchorCheckedCount === 0}
            title={anchorCheckedCount === 0 ? `先在 ${brandLabelOf(anchorBrand)} 列选择至少一款` : undefined}
            onClick={apply}
          >
            应用（{checkedCount}）
          </Button>
        </span>
      </div>
    </div>
  );
}
