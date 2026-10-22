// ============================================================
// 选择产品浮窗（第一百三十一轮修订）：
// 入口 = 筛选条「选择产品」chip，点击自 chip 向下滑出浮窗（左侧与筛选器
//   对齐，不再是居中弹窗）；浮窗在页面全部内容之上，内部再弹层（树/颜色/
//   轻确认/气泡）依次更高；点浮窗外即收起，改动即存。
// 主体 = 若干「组」的整框——一张卡一个框，内部左右两格以分界线隔开：
//   左格 = 主分析产品（左上角标题，格底极浅蓝；品牌+产品一行、型号/颜色
//   换行居中，更换右下角），右格 = 对比产品（左上角标题；无对比时
//   「提示 + 添加对比产品」在格内正中居中，有对比时「添加对比产品」在
//   已选条目下方居中）。删除整组的 ✕ 在整框右上角（更明显，轻确认后连
//   对比区一并移除）。
// 匹配竞品 = 每卡开关（第一百三十一轮：「自动匹配竞品」/「全部自动匹配」
//   统一更名为「匹配竞品」，同名仅由位置区分层级——卡内 = 本产品对，
//   顶栏 = 全部产品对；闪电图标删除）：开 = 对比区由对标矩阵驱动（立即
//   重算，换主品 / 矩阵更新自动跟随）；关 = 对比区保留转手动；手动增删
//   对比即关。非华为主品卡无矩阵可依，按钮置灰。
// 匹配竞品默认开（第一百三十一轮修 BUG）：新建卡、空对补选主品、换主品
//   （对比区已空）时，华为主品卡自动进入开启并按矩阵填充对比区——用户
//   无需手动点开关；已有手动对比内容的卡不翻案；持久化旧卡保持原状。
// 产品树不再常驻：唯一更换入口 = 行尾「更换」→ 完整树浮窗（品牌→系列→
//   产品→型号，预定位当前路径，搜索保留）。颜色不进树浮窗：点型号行即按
//   默认最低价色落选，换色只在已选条目的色块（蓝描边 = 可编辑；只读配置
//   chip 无描边）。
// 第一百二十三轮：档位融入树浮窗——搜索行右侧「档位」Select 按配置级
//   档位（tier_by_country，同型号不同配置可跨档）过滤四列树，与搜索叠加；
//   选中档位后树上方提示带给批量动作（主品上下文 = 该档全部我司配置
//   「全部各成一组」；对比上下文 = 该档全部配置「全部加入对比」）。
//   浮窗宽度 = 四列自适应宽之和（trailing 计入列宽，信息不许截断），
//   上限 min(视口-48, 1100)，超限才横向滚动。
// 主品空缺 = 空组（仅历史数据可能出现；空态不提供先加对比入口）。
// 「全部型号」= 每配置一张卡 / 每配置一条对比（不再并卡）；配额每卡
// 1 主品 + ≤7 对比 = 8 条线在选择时收口，卡数 ≤ 8；即改即存。
// 添加主分析产品 = 最后一个组框向下延长的底边正中的显性大按钮。
// 破坏性动作轻确认：删整组、清空全部。
// 模板（第一百三十一轮增强、第一百三十三轮改纯插入）：顶栏与卡级「＋模板」
//   恒弹名称窗（同内容签名已存在时预填现有名称、确认后原位更新）；卡级把
//   该组、顶栏把当前选择分别存为模板；模板 chip 与「更多」下拉项带 ✎（编辑，
//   进模板编辑浮窗）与「＋」（加入当前选择——逐模板卡增量：主品不在 = 整卡
//   追加（auto 随模板带入、卡数封顶 8），主品已在 = 只把缺失对比合并进现有卡
//   （selKey 去重、卡配额封顶，确有新增即退出自动），气泡如实反映三态）；
//   **chip 本体与下拉项点击 = 同样的插入（第一百三十三轮：模板一律插入不替换
//   当前已选，恢复/替换语义与轻确认全部退役）**；✎ 打开的模板编辑
//   浮窗（TemplateEditorFlyout）支持改名、逐对换主品/增删对比、新增一对、
//   删除模板，改动即存。按钮簇（第一百三十一轮）：卡级组头右侧 =
//   匹配竞品 · ＋模板 · ✕；顶栏右侧 = 匹配竞品 · ＋模板 · 清空。
// ============================================================
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Dropdown, Input, message, Modal, Popconfirm, Popover, Segmented, Select, Tooltip } from 'antd';
import {
  CheckOutlined,
  DeleteOutlined,
  DownOutlined,
  EditOutlined,
  HolderOutlined,
  PlusOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { useFilters } from '../../state/FiltersContext';
import type { MainProduct, ProductSelection } from '../../state/filtersTypes';
import BrandDot, { brandLabelOf } from '../BrandMark';
import {
  brandOfModel,
  defaultColorSkuIds,
  filterProductTreeByTier,
  modelEntryInfo,
  modelNameOf,
  ownBrand,
  searchProductTree,
  sortModelNodes,
  tiersOfScope,
  type BrandNode,
  type ModelNode,
  type ModelSortMode,
  type RomramNode,
} from '../ProductCascader/tree';
import { autoColumnWidth, CascadePanel, type CascadeColumnSpec, type CascadeRowItem } from '../ProductCascader';
import {
  AddPill,
  CardTag,
  ColorChip,
  DeleteX,
  GroupDeleteX,
  innerLayerOpen,
  PAIR_LIST_MAX_H,
  POPOVER_H,
  POPOVER_Z,
  PANEL_Z,
  RomramChip,
  RowText,
  StateTag,
  SwapPill,
  TIP_Z,
  pillW,
  textW,
  useTreeData,
  ROW_GAP,
} from './pickerBits';
import {
  TEMPLATE_CAP,
  comboSignature,
  defaultTemplateName,
  planAppend,
  readCombos,
  writeCombos,
  type StoredCombo,
} from './combos';
import TemplateEditorFlyout from './TemplateEditorFlyout';
import {
  appendTierCards, configsInTier,
} from '../../state/tierSelection';
import { TIER_LABELS } from '../../dataModel/aggregate';
import { tierLabelShort } from '../../chart/PriceTrend/helpers';
import { color, formatPrice, radius, selectAccent, selectSoft, selectSoftInk } from '../../theme/tokens';
import {
  cardQuota,
  isHuaweiModel,
  MAINS_CAP,
  MAX_LINES_PER_CHART,
  newCardId,
  remapSelection,
  selKey,
  withAutoOn,
  withMain,
} from '../../state/mainSelection';

const norm = (s: string): string => s.replace(/\s+/g, '');
const nodeSelKey = (r: RomramNode): string => `${r.modelId}|${norm(r.romram)}`;

// ---------------- 浮窗落点上下文 ----------------

type PickerCtx =
  | { kind: 'add-main' } // 新建一张主分析卡（全局动作/空对左块）
  | { kind: 'set-main'; cardId: string } // 空对补选主品
  | { kind: 'replace-main'; cardId: string } // 换主品（对比区保留）
  | { kind: 'compares'; cardId: string } // 对比区增删（连点，不关浮窗）
  | { kind: 'replace-compare'; cardId: string; sel: ProductSelection }; // 整条替换

// （模板存储/纯计算见 ./combos：LPL3.ui.mainCombos 读写、签名、默认名、上限 8）

/** 「全部型号」成组/成卡的配置池：过滤无意义占位配置（仅剩一项时保留） */
const usableRomrams = (nodes: RomramNode[]): RomramNode[] =>
  nodes.filter((r) => r.romram !== '—' || nodes.length === 1);

// ---------------- 通用小件见 ./pickerBits（与模板编辑浮窗共用同一套视觉语言） ----------------

/** 「匹配竞品」开关 pill（第一百三十一轮更名并删除闪电图标）：选中态 =
 *  功能开（对比区由矩阵驱动），非选中 = 关（手动持有）；置灰 = 无矩阵可依
 *  （非华为主品/空主品） */
function MatchPill({
  label,
  text,
  can,
  tip,
  onClick,
  size = 'sm',
  selected,
}: {
  label: string;
  text: string;
  can: boolean;
  tip: string;
  onClick: () => void;
  size?: 'sm' | 'md';
  selected?: boolean;
}) {
  const md = size === 'md';
  return (
    <Tooltip title={tip} zIndex={TIP_Z}>
      <span
        role="button"
        aria-label={label}
        aria-disabled={!can || undefined}
        aria-pressed={can ? !!selected : undefined}
        className="lpl-pk-ghost"
        onClick={(e) => {
          e.stopPropagation();
          if (can) onClick();
        }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: md ? 5 : 3,
          height: md ? 26 : 20,
          padding: md ? '0 12px' : '0 8px',
          borderRadius: radius.pill,
          fontSize: md ? 12 : 11,
          fontWeight: 600,
          color: !can ? color.mute : selected ? selectSoftInk : color.body,
          background: selected ? selectSoft : color.canvas,
          border: `1px solid ${selected ? 'rgba(0, 112, 243, 0.35)' : color.hairline}`,
          cursor: can ? 'pointer' : 'not-allowed',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        {text}
      </span>
    </Tooltip>
  );
}

// ---------------- 更换树浮窗（完整树：唯一更换入口） ----------------

/** 档位批量动作 pill（浅蓝描边 ghost，与「＋ 全部型号」同语言） */
function TierBatchPill({ text, disabled, onClick }: { text: string; disabled?: boolean; onClick?: () => void }) {
  return (
    <span
      role="button"
      aria-label={text}
      aria-disabled={disabled || undefined}
      className="lpl-pk-ghost"
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onClick?.();
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        height: 20,
        padding: '0 8px',
        borderRadius: radius.pill,
        fontSize: 11,
        color: disabled ? color.mute : selectSoftInk,
        background: color.canvas,
        border: '1px solid rgba(0, 112, 243, 0.35)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      <PlusOutlined style={{ fontSize: 9 }} /> {text}
    </span>
  );
}

/** 完整树浮窗：品牌→系列→产品→型号四列，预定位当前条目路径；
 *  主品上下文选完型号落地关窗；对比上下文连点不关。
 *  第一百二十三轮：①搜索行右侧「档位」Select——按配置级档位
 *  （tier_by_country，同型号不同配置可跨档）过滤四列树，与搜索叠加，
 *  关窗回「全部档位」；②选中档位后树上方批量动作带（主品上下文 =
 *  该档全部我司配置「全部各成一组」；对比上下文 = 该档全部配置
 *  「全部加入对比」）；③浮窗宽 = 四列自适应宽之和（行尾计入列宽），
 *  上限 min(视口-48, 1100)，超限面板内横向滚动。 */
function LevelSwitchPopover({
  ctx,
  initialModelId,
  openSignal,
  children,
}: {
  ctx: PickerCtx;
  initialModelId?: string;
  openSignal?: boolean;
  children: ReactNode;
}) {
  const { state, actions } = useFilters();
  const mains = state.mains;
  const currency = state.currency;
  const { fullTree, romramByKey } = useTreeData();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [tier, setTier] = useState<string | null>(null); // null = 全部档位；关窗即回默认
  const [modelSort, setModelSort] = useState<ModelSortMode>('default'); // 型号列排序

  useEffect(() => {
    if (openSignal) setOpen(true);
  }, [openSignal]);

  // 档位过滤（配置级）与树内搜索叠加：先档位剪枝、再按关键词命中
  const scopedTree = useMemo(
    () => (tier ? filterProductTreeByTier(fullTree, tier, state.countryCode) : fullTree),
    [fullTree, tier, state.countryCode],
  );
  const tree = useMemo(() => searchProductTree(scopedTree, search), [scopedTree, search]);

  // 打开/搜索/换档位时定位：优先当前条目的型号路径，否则首个结果
  const [path, setPath] = useState<[string, string, string] | null>(null);
  useEffect(() => {
    if (!open) return;
    const locate = (t: BrandNode[]): [string, string, string] | null => {
      if (initialModelId) {
        for (const b of t) {
          for (const s of b.series) {
            if (s.models.some((m) => m.modelId === initialModelId)) return [b.key, s.key, initialModelId];
          }
        }
      }
      const b = t[0];
      const s = b?.series[0];
      const m = s?.models[0];
      return b && s && m ? [b.key, s.key, m.modelId] : null;
    };
    setPath(locate(tree));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, search, tier]);

  const brand = tree.find((b) => b.key === path?.[0]) ?? tree[0];
  const series = brand?.series.find((s) => s.key === path?.[1]) ?? brand?.series[0];
  const model = series?.models.find((m) => m.modelId === path?.[2]) ?? series?.models[0];
  const activeCard = 'cardId' in ctx ? mains.find((c) => c.id === ctx.cardId) ?? null : null;
  const comparesCtx = ctx.kind === 'compares';
  const replaceCompareCtx = ctx.kind === 'replace-compare';

  /** 主品落位：add-main 建卡；set-main 补选；replace-main 整卡替换（颜色同色优先） */
  const pickConfig = (r: RomramNode): void => {
    if (comparesCtx) return;
    const card = activeCard;
    if (replaceCompareCtx) {
      if (!card || card.main?.modelId === r.modelId) return;
      // 撞其他对比项：不再静默无效（窗关了/没反应），给出提示保持开窗
      if (card.compares.some((c) => c !== ctx.sel && selKey(c) === nodeSelKey(r))) {
        message.info('该配置已在对比区');
        return;
      }
      const oldNode = romramByKey.get(`${ctx.sel.modelId}|${ctx.sel.romram}`);
      actions.setCardCompares(
        card.id,
        card.compares.map((c) => (c === ctx.sel ? remapSelection(ctx.sel, oldNode, r) : c)),
      );
      setOpen(false);
      return;
    }
    let sel: ProductSelection;
    if (ctx.kind === 'replace-main' && card?.main) {
      sel = remapSelection(card.main, romramByKey.get(`${card.main.modelId}|${card.main.romram}`), r);
    } else {
      sel = { modelId: r.modelId, romram: r.romram, skuIds: defaultColorSkuIds(r) };
    }
    if (ctx.kind === 'add-main') {
      // 命中重复/上限不再静默：给出与底部按钮 tooltip 同口径的提示
      if (mains.some((c) => c.main && selKey(c.main) === selKey(sel))) {
        message.info('已在看板中');
        return;
      }
      if (mains.length >= MAINS_CAP) {
        message.info(`最多 ${MAINS_CAP} 组，请先删除组`);
        return;
      }
      // 第一百三十一轮：建卡即默认「匹配竞品」（华为主品 = 对比区按矩阵填充
      // 并保持驱动）；非华为主品无矩阵可依，保持手动
      actions.setMains([...mains, withAutoOn({ id: newCardId(), main: sel, compares: [] })]);
    } else if (card) {
      actions.setMains(mains.map((c) => (c.id === card.id ? withMain(c, sel) : c)));
    }
    setOpen(false);
  };

  /** 对比区加/移一条（连点） */
  const toggleCompare = (r: RomramNode): void => {
    if (ctx.kind !== 'compares' || !activeCard) return;
    const card = activeCard;
    const exists = card.compares.find((c) => selKey(c) === nodeSelKey(r));
    if (exists) {
      actions.setCardCompares(card.id, card.compares.filter((c) => c !== exists));
      return;
    }
    if (card.main?.modelId === r.modelId) return;
    if (card.compares.length >= cardQuota(card)) return;
    actions.setCardCompares(card.id, [...card.compares, { modelId: r.modelId, romram: r.romram, skuIds: defaultColorSkuIds(r) }]);
  };

  /** 「全部型号」：主品上下文 = 每配置一张卡；对比上下文 = 每配置一条对比。
   *  第一百二十三轮：入参改过滤后的型号节点——档位筛选下 = 该产品在该档位
   *  内的全部配置（「＋ 全部型号」语义随筛选收窄）。 */
  const pickAllConfigs = (m: ModelNode): void => {
    const sels = usableRomrams(m.romrams).map(
      (r): ProductSelection => ({ modelId: m.modelId, romram: r.romram, skuIds: defaultColorSkuIds(r) }),
    );
    if (!sels.length) return;
    if (comparesCtx || replaceCompareCtx) {
      const card = activeCard;
      if (!card) return;
      const base = replaceCompareCtx ? card.compares.filter((c) => c !== ctx.sel) : card.compares;
      const seen = new Set(base.map(selKey));
      const added = [...base];
      for (const sel of sels) {
        if (card.main?.modelId === sel.modelId) continue;
        const k = selKey(sel);
        if (seen.has(k)) continue;
        if (added.length >= cardQuota(card)) break;
        seen.add(k);
        added.push(sel);
      }
      actions.setCardCompares(card.id, added);
      if (replaceCompareCtx) setOpen(false);
      return;
    }
    let list = mains;
    if ((ctx.kind === 'replace-main' || ctx.kind === 'set-main') && activeCard) {
      list = mains.filter((c) => c.id !== activeCard.id);
    }
    const seen = new Set(list.flatMap((c) => (c.main ? [selKey(c.main)] : [])));
    const cards: MainProduct[] = [];
    let capped = false;
    for (const sel of sels) {
      const k = selKey(sel);
      if (seen.has(k)) continue;
      if (list.length + cards.length >= MAINS_CAP) {
        capped = true;
        break;
      }
      seen.add(k);
      // 第一百三十一轮：逐配置成卡同样默认「匹配竞品」（华为主品 = 矩阵填充）
      cards.push(withAutoOn({ id: newCardId(), main: sel, compares: [] }));
    }
    if (!cards.length) {
      // 批量命中上限 / 全部重复：不再静默，与单点路径同口径提示
      message.info(capped ? `最多 ${MAINS_CAP} 组，请先删除组` : '已在看板中');
      return;
    }
    if (capped) message.info(`已达 ${MAINS_CAP} 组上限，其余配置未加入`);
    // 第一百二十五轮（K2）：批量落卡不再静默丢弃当前卡对比区——对齐单点路径
    // pickConfig→withMain 的沿用口径：首张新卡继承（剔同 selKey、截配额），
    // 其余新卡保持空、由 setMains 的自动匹配按需补。
    // 第一百三十一轮：来源卡矩阵驱动时首卡保持默认开（对比区 = 新主品矩阵
    // 产出），不继承旧矩阵内容；来源手动且首卡已被默认填成矩阵时改回手动并
    // 继承（用户搭配不丢）。
    if ((ctx.kind === 'set-main' || ctx.kind === 'replace-main') && activeCard?.compares.length) {
      const first = cards[0];
      if (!activeCard.auto) {
        cards[0] = {
          ...first,
          auto: undefined,
          compares: activeCard.compares.filter((c) => selKey(c) !== selKey(first.main!)).slice(0, cardQuota(first)),
        };
      }
    }
    actions.setMains([...list, ...cards]);
    setOpen(false);
  };

  // ---- 档位批量动作（第一百二十三轮：替代原「按档位」模式的一键集结） ----

  const tierOptions = useMemo(
    () => tiersOfScope(state.industry, state.countryCode).map((t) => ({
      value: t,
      label: tierLabelShort(TIER_LABELS[t] ?? t),
    })),
    [state.industry, state.countryCode],
  );
  const tierOwnConfigs = useMemo(
    () => (tier ? configsInTier(state.industry, tier, state.countryCode, true) : []),
    [tier, state.industry, state.countryCode],
  );
  const tierAllConfigs = useMemo(
    () => (tier ? configsInTier(state.industry, tier, state.countryCode) : []),
    [tier, state.industry, state.countryCode],
  );
  // 更换主品（replace-main）同属主品语义：批量动作 = 该档逐配置建组（追加不动当前卡），
  // 不能落对比分支——那会把整档配置塞进本卡对比区（IAB 冒烟发现）
  const tierBatchCtx = ctx.kind === 'add-main' || ctx.kind === 'set-main' || ctx.kind === 'replace-main';

  /** 主品上下文：该档全部我司配置逐配置成组（矩阵补对比区；封顶/去重在纯函数收口） */
  const tierGroupAll = (): void => {
    if (!tier) return;
    const base = ctx.kind === 'set-main' && activeCard ? mains.filter((c) => c.id !== activeCard.id) : mains;
    let next = appendTierCards(state.industry, tier, state.countryCode, base);
    if (next === base) return;
    const baseIds = new Set(base.map((c) => c.id));
    // 第一百三十一轮：批量成组的新卡同样默认「匹配竞品」——appendTierCards 已按
    // 矩阵填好对比区，这里补 auto 标记进入矩阵驱动（华为主品恒真，守卫照写）
    next = next.map((c) => (!baseIds.has(c.id) && c.main && isHuaweiModel(c.main.modelId) ? withAutoOn(c) : c));
    // 第一百二十五轮（K2）：set-main 批量成组不再丢弃空对先挂的对比区——不改
    // appendTierCards（返回 base+新卡、对比区按矩阵填），在此对结果后处理：首张
    // 新卡若未带对比区则沿用被移除空对的（剔同 selKey、截配额）；已被矩阵填好
    // 则不覆盖。replace-main 分支本就追加不动当前卡，无需处理。
    if (ctx.kind === 'set-main' && activeCard?.compares.length) {
      const inherit = activeCard.compares;
      const firstNew = next.find((c) => !baseIds.has(c.id));
      if (firstNew && !firstNew.compares.length) {
        next = next.map((c) =>
          c === firstNew
            ? { ...c, auto: undefined, compares: inherit.filter((x) => selKey(x) !== selKey(c.main!)).slice(0, cardQuota(c)) }
            : c,
        );
      }
    }
    actions.setMains(next);
    setOpen(false);
  };

  /** 对比上下文：该档全部配置加入对比区（本卡配额封顶、与主品同型号跳过、连点不关） */
  const tierCompareAll = (): void => {
    const card = activeCard;
    if (!card || !tier) return;
    const base = replaceCompareCtx ? card.compares.filter((c) => c !== ctx.sel) : card.compares;
    const seen = new Set(base.map(selKey));
    const added = [...base];
    for (const sel of tierAllConfigs) {
      if (card.main?.modelId === sel.modelId) continue;
      const k = selKey(sel);
      if (seen.has(k)) continue;
      if (added.length >= cardQuota(card)) break;
      seen.add(k);
      added.push(sel);
    }
    actions.setCardCompares(card.id, added);
    if (replaceCompareCtx) setOpen(false);
  };

  /** 型号行尾「档位缩写 · 现价」灰字（现价 = 入门配置默认色最新价，币种随筛选）；
   *  首末档的「入门 · 」「旗舰 · 」前缀只在档位下拉里保留，行尾去掉以免与现价的 · 连成三段 */
  const modelTagText = (m: ModelNode): string => {
    const { tierCode, price } = modelEntryInfo(m, currency);
    const tier = tierCode ? tierLabelShort((TIER_LABELS[tierCode] ?? tierCode).replace(/^(入门|旗舰) · /, '')) : '';
    const priceText = price != null ? formatPrice(Math.round(price), currency) : '';
    return [tier, priceText].filter(Boolean).join(' · ');
  };

  const columns: CascadeColumnSpec[] = useMemo(() => {
    if (!brand || !series) return [];
    const brandItems: CascadeRowItem[] = tree.map((b) => ({
      key: b.key,
      label: brandLabelOf(b.key),
      leading: <BrandDot brand={b.key} />,
      active: brand.key === b.key,
      onActivate: () => {
        const s = b.series[0];
        setPath([b.key, s?.key ?? '', s?.models[0]?.modelId ?? '']);
      },
      trailing: <span style={{ fontSize: 10, color: color.mute, flexShrink: 0 }}>{b.modelCount} 型号</span>,
    }));
    const seriesItems: CascadeRowItem[] = (brand?.series ?? []).map((s) => ({
      key: s.key,
      label: s.title,
      active: series?.key === s.key,
      onActivate: () => setPath([brand.key, s.key, s.models[0]?.modelId ?? '']),
      trailing: s.eol ? (
        <span style={{ fontSize: 10, color: color.mute, border: `1px solid ${color.hairline}`, borderRadius: radius.pill, padding: '0 6px', lineHeight: '16px', flexShrink: 0 }}>退市</span>
      ) : undefined,
    }));
    const sortedModels = sortModelNodes(series?.models ?? [], modelSort, currency);
    const modelItems: CascadeRowItem[] = sortedModels.map((m) => {
      const tag = modelTagText(m);
      return {
        key: m.modelId,
        label: m.label,
        leading: <BrandDot brand={m.brand} />,
        active: model?.modelId === m.modelId,
        onActivate: () => setPath([brand.key, series.key, m.modelId]),
        trailing: (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {m.eol && (
              <span style={{ fontSize: 10, color: color.mute, border: `1px solid ${color.hairline}`, borderRadius: radius.pill, padding: '0 6px', lineHeight: '16px' }}>退市</span>
            )}
            <Tooltip title={comparesCtx || replaceCompareCtx ? '该产品全部配置加入对比区' : '该产品全部配置各成一张主分析卡'} zIndex={TIP_Z}>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  pickAllConfigs(m);
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  height: 20,
                  padding: '0 8px',
                  borderRadius: radius.pill,
                  fontSize: 11,
                  color: selectSoftInk,
                  background: color.canvas,
                  border: '1px solid rgba(0, 112, 243, 0.35)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                <PlusOutlined style={{ fontSize: 9 }} /> 全部型号
              </span>
            </Tooltip>
            {tag && <span className="tnum" style={{ fontSize: 10, color: color.mute, flexShrink: 0, whiteSpace: 'nowrap' }}>{tag}</span>}
          </span>
        ),
      };
    });
    const romramItems: CascadeRowItem[] = (model?.romrams ?? []).map((r) => {
      const key = nodeSelKey(r);
      if (comparesCtx && activeCard) {
        const card = activeCard;
        const inCompares = card.compares.some((c) => selKey(c) === key);
        const sameAsMain = card.main?.modelId === r.modelId;
        const quotaFull = card.compares.length >= cardQuota(card);
        const disabled = !inCompares && (sameAsMain || quotaFull);
        return {
          key: r.key,
          label: r.romram,
          // 第一百二十五轮（K3）：复选框补成真控件（此前缺 onCheckChange，点了没反应）——
          // 勾 = 已在对比区；disabled 只拦「未选中时加」，已选中仍可点掉。
          checkState: inCompares ? 'checked' : 'none',
          onCheckChange: () => {
            if (inCompares || !disabled) toggleCompare(r);
          },
          onLabelClick: () => toggleCompare(r),
          trailing: (
            <Tooltip
              zIndex={TIP_Z}
              title={
                sameAsMain && !inCompares
                  ? '主分析产品不对比自身配置'
                  : quotaFull && !inCompares
                    ? `每张图最多 ${MAX_LINES_PER_CHART} 条线（含主分析产品）`
                    : inCompares
                      ? '移除该对比'
                      : '加入对比区'
              }
            >
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  if (!disabled) toggleCompare(r);
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  height: 20,
                  padding: '0 8px',
                  borderRadius: radius.pill,
                  fontSize: 11,
                  fontWeight: 600,
                  color: disabled ? color.mute : selectSoftInk,
                  background: selectSoft,
                  border: `1px solid ${inCompares ? selectAccent : 'rgba(0, 112, 243, 0.35)'}`,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: disabled ? 0.5 : 1,
                  flexShrink: 0,
                }}
              >
                {inCompares ? <CheckOutlined style={{ fontSize: 11 }} /> : <PlusOutlined style={{ fontSize: 11 }} />} 对比
              </span>
            </Tooltip>
          ),
        } satisfies CascadeRowItem;
      }
      const isCurrent = replaceCompareCtx
        ? selKey(ctx.sel) === key
        : ctx.kind !== 'add-main' && activeCard?.main != null && selKey(activeCard.main) === key;
      // 更换对比上下文：本卡其他对比项也标「已选」（撞重复在选择前列明，不再是点了没反应）
      const taken = !replaceCompareCtx
        ? mains.some((c) => c.main != null && selKey(c.main) === key && !('cardId' in ctx && c.id === ctx.cardId))
        : !!activeCard && activeCard.compares.some((c) => c !== ctx.sel && selKey(c) === key);
      const blocked = isCurrent || taken;
      // 第一百二十五轮（K3）：主品选择为单选语义，不渲染复选框（此前是点了
      // 没反应的摆设）；列宽的 24px 复选框预留随 checkState 缺省自动收窄。
      return {
        key: r.key,
        label: r.romram,
        onLabelClick: () => {
          if (!blocked) pickConfig(r);
        },
        trailing: isCurrent ? <StateTag text="当前" /> : taken ? <StateTag text="已选" /> : undefined,
      } satisfies CascadeRowItem;
    });

    // 行尾内容宽度预留（第一百二十三轮：列宽必须容纳 label + 行尾，四列信息完整
    // 可见、无省略号）——按各列行尾实际文案折算，autoColumnWidth 计入 chrome
    const brandExtra = tree.reduce((w, b) => Math.max(w, textW(`${b.modelCount} 型号`, 10)), 0) + ROW_GAP;
    const eolPillW = textW('退市', 10) + 8; // 文本 + padding 0 6px + 边框 2px
    const seriesExtra = (brand?.series ?? []).some((s) => s.eol) ? eolPillW + ROW_GAP : 0;
    const allCfgPillW = pillW('全部型号', 11) + 12; // ＋ 图标 9 + 内间隙 3
    const modelTagW = (series?.models ?? []).reduce((w, m) => Math.max(w, textW(modelTagText(m), 10)), 0);
    const modelExtra = ((series?.models ?? []).some((m) => m.eol) ? eolPillW + 6 : 0)
      + allCfgPillW + 6 + modelTagW + ROW_GAP;
    // 对比 pill = 图标 + 文案（图标 11 + 间隙 3 计入预留）
    const romramExtra = (comparesCtx
      ? pillW('对比', 11) + 14
      : Math.max(textW('当前', 10), textW('已选', 10))) + ROW_GAP;

    return [
      { items: brandItems, width: autoColumnWidth(brandItems, { extraW: brandExtra, noMaxClip: true }) },
      { items: seriesItems, width: autoColumnWidth(seriesItems, { extraW: seriesExtra, noMaxClip: true }) },
      { items: modelItems, width: autoColumnWidth(modelItems, { extraW: modelExtra, noMaxClip: true }) },
      { items: romramItems, width: autoColumnWidth(romramItems, { extraW: romramExtra, noMaxClip: true }) },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, brand, series, model, ctx, mains, activeCard, modelSort, currency]);

  // 浮窗宽 = 四列自适应宽之和 + 内边距（搜索/档位筛选改变列内容时随之变化）；
  // 上限 = min(视口 - 48, 1100)，超限由面板内横向滚动兜底
  const panelW = columns.reduce((w, c) => w + (c.width ?? 0), 0);
  const widthCap = Math.min(typeof window === 'undefined' ? 1148 : window.innerWidth - 48, 1100);
  const bodyW = Math.max(360, Math.min(panelW + 20, widthCap));
  // set-main 的空组卡在批量动作中会被移除，封顶判定按移除后的基数算
  const tierBase = ctx.kind === 'set-main' && activeCard ? mains.filter((c) => c.id !== activeCard.id) : mains;
  const tierGroupDisabled = tierBase.length >= MAINS_CAP || tierOwnConfigs.length === 0;
  const tierCompareDisabled = !activeCard || (activeCard.compares.length >= cardQuota(activeCard) && !replaceCompareCtx);

  return (
    <Popover
      trigger="click"
      open={open}
      zIndex={POPOVER_Z}
      onOpenChange={(o) => {
        setOpen(o);
        setSearch('');
        if (!o) setTier(null); // 关窗档位筛选回「全部档位」
      }}
      placement="bottomLeft"
      styles={{ body: { padding: 10, width: bodyW } }}
      content={
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Input
              allowClear
              size="small"
              prefix={<SearchOutlined style={{ color: color.mute }} />}
              placeholder="搜索品牌 / 系列 / 产品"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ flex: 1, minWidth: 0 }}
            />
            <Select
              size="small"
              aria-label="价格档位"
              value={tier ?? ''}
              onChange={(v) => setTier(v === '' ? null : v)}
              style={{ width: 138, flexShrink: 0 }}
              popupMatchSelectWidth={false}
              // 下拉挂在树浮层内部：层级随浮层走（高于面板），不被外层浮窗压住
              getPopupContainer={(node) => node.closest('.ant-popover') ?? document.body}
              options={[{ value: '', label: '全部档位' }, ...tierOptions]}
            />
            <Segmented
              size="small"
              aria-label="型号排序"
              value={modelSort}
              onChange={(v) => setModelSort(v as ModelSortMode)}
              options={[
                { label: '默认', value: 'default' },
                { label: '价格', value: 'price' },
                { label: '名称', value: 'name' },
              ]}
            />
          </div>
          {tier && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 8,
                padding: '4px 10px',
                borderRadius: radius.control,
                background: selectSoft,
                fontSize: 12,
                color: selectSoftInk,
                whiteSpace: 'nowrap',
              }}
            >
              <span className="tnum">
                {tierBatchCtx
                  ? `该档位 ${brandLabelOf(ownBrand())} 共 ${tierOwnConfigs.length} 个配置`
                  : `该档位共 ${tierAllConfigs.length} 个配置`}
              </span>
              {tierBatchCtx ? (
                <Tooltip title={tierGroupDisabled ? `最多 ${MAINS_CAP} 组` : '该档位全部配置逐配置成组，各按对标矩阵带出对比区'} zIndex={TIP_Z}>
                  <TierBatchPill text="全部各成一组" disabled={tierGroupDisabled} onClick={tierGroupAll} />
                </Tooltip>
              ) : (
                <Tooltip title={tierCompareDisabled ? `每张图最多 ${MAX_LINES_PER_CHART} 条线（含主分析产品）` : '该档位全部配置加入本组对比区'} zIndex={TIP_Z}>
                  <TierBatchPill text="全部加入对比" disabled={tierCompareDisabled} onClick={tierCompareAll} />
                </Tooltip>
              )}
            </div>
          )}
          <div style={{ display: 'flex' }}>
            <CascadePanel columns={columns} fill height={POPOVER_H} />
          </div>
        </div>
      }
    >
      {children}
    </Popover>
  );
}

// ---------------- 条目行（主品 / 对比条目 同构：分段即入口） ----------------

function MainRow({ card }: { card: MainProduct }) {
  const { state, actions } = useFilters();
  const mains = state.mains;
  const { romramByKey } = useTreeData();
  const main = card.main;
  if (!main) return null;
  const brand = brandOfModel(main.modelId);
  const node = romramByKey.get(`${main.modelId}|${main.romram}`);
  return (
    /* 第一百二十七轮：品牌+产品 / 型号 / 颜色 三行居中；更换右下角（删除整组
     * 的 ✕ 第一百二十八轮上移到组框右上角，见 GroupDeleteX） */
    <div
      style={{
        position: 'relative',
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        minWidth: 0,
        padding: '4px 12px 30px',
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, maxWidth: '100%' }}>
        <BrandDot brand={brand} />
        <RowText title={brandLabelOf(brand)}>{brandLabelOf(brand)}</RowText>
        <RowText strong title={`${brandLabelOf(brand)} ${modelNameOf(main.modelId)} ${main.romram}`}>
          {modelNameOf(main.modelId)}
        </RowText>
      </span>
      <RomramChip>{main.romram}</RomramChip>
      <ColorChip
        node={node}
        skuIds={main.skuIds}
        tone="strong"
        currency={state.currency}
        onToggle={(skuId, next) => {
          const skuIds = next ? [...new Set([...main.skuIds, skuId])] : main.skuIds.filter((id) => id !== skuId);
          if (!skuIds.length) return;
          actions.setMains(mains.map((c) => (c.id === card.id ? { ...c, main: { ...main, skuIds } } : c)));
        }}
        onReset={() =>
          node && actions.setMains(mains.map((c) => (c.id === card.id ? { ...c, main: { ...main, skuIds: defaultColorSkuIds(node) } } : c)))
        }
      />
      <span style={{ position: 'absolute', bottom: 6, right: 8, display: 'inline-flex' }}>
        <LevelSwitchPopover ctx={{ kind: 'replace-main', cardId: card.id }} initialModelId={main.modelId}>
          <SwapPill label={`更换主分析产品 ${modelNameOf(main.modelId)}`} />
        </LevelSwitchPopover>
      </span>
    </div>
  );
}

function CompareRow({ card, sel }: { card: MainProduct; sel: ProductSelection }) {
  const { state, actions } = useFilters();
  const { romramByKey } = useTreeData();
  const node = romramByKey.get(`${sel.modelId}|${sel.romram}`);
  const brand = brandOfModel(sel.modelId);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 6px 2px 8px',
        background: color.canvasSoft,
        borderRadius: radius.control,
        minWidth: 0,
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0, minWidth: 0 }}>
        <BrandDot brand={brand} />
        <RowText title={brandLabelOf(brand)}>{brandLabelOf(brand)}</RowText>
      </span>
      <RowText title={`${brandLabelOf(brand)} ${modelNameOf(sel.modelId)} ${sel.romram}`}>
        {modelNameOf(sel.modelId)}
      </RowText>
      <RomramChip>{sel.romram}</RomramChip>
      <ColorChip
        node={node}
        skuIds={sel.skuIds}
        tone="soft"
        currency={state.currency}
        onToggle={(skuId, next) => {
          const skuIds = next ? [...new Set([...sel.skuIds, skuId])] : sel.skuIds.filter((id) => id !== skuId);
          if (!skuIds.length) return;
          actions.setCardCompares(card.id, card.compares.map((c) => (c === sel ? { ...sel, skuIds } : c)));
        }}
        onReset={() =>
          node && actions.setCardCompares(card.id, card.compares.map((c) => (c === sel ? { ...sel, skuIds: defaultColorSkuIds(node) } : c)))
        }
      />
      <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
        <LevelSwitchPopover ctx={{ kind: 'replace-compare', cardId: card.id, sel }} initialModelId={sel.modelId}>
          <SwapPill label={`更换对比产品 ${modelNameOf(sel.modelId)}`} />
        </LevelSwitchPopover>
        <DeleteX
          label={`移除对比 ${modelNameOf(sel.modelId)} ${sel.romram}`}
          size={10}
          onClick={() => actions.setCardCompares(card.id, card.compares.filter((c) => c !== sel))}
        />
      </span>
    </div>
  );
}

// ---------------- 分析对部件 ----------------

/** 「匹配竞品」开关（第一百三十一轮更名）：选中 = 本组对比区由对标矩阵驱动
 *  （换主品/矩阵更新自动跟随）；置灰 = 无矩阵可依（仅华为主品可开） */
function AutoMatchInline({ card }: { card: MainProduct }) {
  const { actions } = useFilters();
  const huawei = card.main != null && isHuaweiModel(card.main.modelId);
  const on = !!card.auto;
  const tip =
    card.main == null
      ? '先选择主分析产品'
      : !huawei
        ? '按对标矩阵带出对比区，仅支持华为产品；请手动添加'
        : on
          ? '已开启：换主品或对标矩阵更新时自动重算本组对比区；点击关闭'
          : '开启后按对标矩阵自动带出本组对比区';
  return (
    <MatchPill
      label={`匹配竞品${card.main ? ` ${modelNameOf(card.main.modelId)}` : ''}`}
      text="匹配竞品"
      can={huawei}
      selected={on}
      tip={tip}
      onClick={() => actions.autoMatchCard(card.id)}
    />
  );
}

/** 对比区「＋ 添加对比产品」（点开完整树浮窗连点加；位置由外层决定——
 *  无对比时在格内正中，有对比时在已选条目下方居中） */
function AddCompareTrigger({ card }: { card: MainProduct }) {
  const quota = cardQuota(card);
  const full = card.compares.length >= quota;
  return (
    <Tooltip title={full ? `每张图最多 ${MAX_LINES_PER_CHART} 条线（含主分析产品）` : '挑选对比产品（可连续添加）'} zIndex={TIP_Z}>
      <LevelSwitchPopover ctx={{ kind: 'compares', cardId: card.id }} initialModelId={card.main?.modelId}>
        <AddPill label="添加对比产品" disabled={full} />
      </LevelSwitchPopover>
    </Tooltip>
  );
}

// ---------------- 选择产品浮窗（锚定筛选条入口，向下滑出；自绘定位层，
//   不走 rc-trigger——受控锚定 Popover 存在开启即被同一次外点关闭的竞态） ----------------

export default function ProductPickerFlyout({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  children: ReactNode;
}) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // 打开时测量锚点位置（随窗口尺寸跟进）
  useEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const measure = (): void => {
      const r = anchorRef.current?.getBoundingClientRect();
      if (r) setPos({ left: r.left, top: r.bottom + 6 });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [open]);

  // 外点关闭：锚点与本浮层内的点击（含嵌套树浮窗/颜色浮层/轻确认/模板编辑
  // 浮窗）不关——编辑浮窗是挂在 body 上的独立定位层，须显式放行
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent): void => {
      const t = e.target instanceof Element ? e.target : null;
      if (!t) return;
      if (anchorRef.current?.contains(t)) return;
      if (t.closest('[data-lpl-picker-panel]')) return;
      if (t.closest('[data-lpl-template-editor]')) return;
      if (t.closest('.ant-popover')) return;
      if (t.closest('.ant-popconfirm')) return;
      if (t.closest('.ant-modal') || t.closest('.ant-modal-mask')) return;
      onOpenChange(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, onOpenChange]);

  // Esc 关闭：内层弹层（存为模板 Modal / 树·颜色浮层 / 轻确认 / 下拉）可见时
  // 先让内层处理；模板编辑浮窗在场同样让位（其自身监听 Esc 收起自己）
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      if (document.querySelector('[data-lpl-template-editor]')) return;
      if (innerLayerOpen()) return;
      onOpenChange(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  return (
    <>
      <span ref={anchorRef} style={{ display: 'inline-flex', flex: 1, minWidth: 0 }}>
        {children}
      </span>
      {open &&
        pos &&
        createPortal(
            <div
              data-lpl-picker-panel
              style={{
                position: 'fixed',
                left: pos.left,
                top: pos.top,
                zIndex: PANEL_Z,
                width: 860,
                maxHeight: 'calc(100vh - 132px)',
                overflowY: 'auto',
                background: color.canvas,
                borderRadius: radius.card,
                border: `1px solid ${color.hairline}`,
                boxShadow: '0 6px 24px rgba(0, 0, 0, 0.12)',
                padding: 12,
                boxSizing: 'border-box',
              }}
            >
            <PickerPanel />
          </div>,
          document.body,
        )}
    </>
  );
}

// ---------------- 「存为模板」名称弹窗（卸载式） ----------------

/** dialog 为空时整个 Modal 不挂载（防 antd5 + StrictMode 关闭后遮罩残留惯例） */
function SaveTemplateDialog({
  dialog,
  onChangeValue,
  onOk,
  onCancel,
}: {
  dialog: { value: string; cards: MainProduct[]; updating: boolean } | null;
  onChangeValue: (v: string) => void;
  onOk: () => void;
  onCancel: () => void;
}) {
  if (dialog == null) return null;
  return (
    <Modal
      open
      title={dialog.updating ? '更新模板' : '存为模板'}
      okText="保存"
      cancelText="取消"
      zIndex={POPOVER_Z}
      width={420}
      okButtonProps={{ disabled: !dialog.value.trim() }}
      onOk={onOk}
      onCancel={onCancel}
    >
      <Input
        value={dialog.value}
        placeholder="模板名称"
        maxLength={40}
        autoFocus
        onChange={(e) => onChangeValue(e.target.value)}
        onPressEnter={onOk}
      />
    </Modal>
  );
}

function PickerPanel() {
  const { state, actions } = useFilters();
  const mains = state.mains;

  // ---- 卡片拖拽换序（= 分离面板顺序） ----
  const [dragCard, setDragCard] = useState<string | null>(null);
  const [dropCard, setDropCard] = useState<string | null>(null);
  const moveCard = (from: string, to: string): void => {
    if (from === to) return;
    const ids = mains.map((c) => c.id);
    const i = ids.indexOf(from);
    const j = ids.indexOf(to);
    if (i < 0 || j < 0) return;
    ids.splice(j, 0, ids.splice(i, 1)[0]);
    actions.setMains(ids.map((id) => mains.find((c) => c.id === id)!));
  };

  // ---- 模板（显式保存的产品对/模板组；「＋模板」顶栏与卡级恒弹名称窗——
  //      同内容签名已存在时预填现有名称、确认后原位更新；chip 尾段「＋」 =
  //      加入当前选择：主品已在的组只补缺失对比） ----
  const [combos, setCombos] = useState<StoredCombo[]>(() => readCombos());
  // 「＋模板」名称弹窗（cards = 待保存的卡；updating = 同签名已存在、确认后原位更新）
  const [dialog, setDialog] = useState<{ value: string; cards: MainProduct[]; updating: boolean } | null>(null);
  // 模板编辑浮窗（持当前模板对象；编辑中每次改动替换该对象）
  const [editing, setEditing] = useState<StoredCombo | null>(null);

  const persistCombos = (next: StoredCombo[]): void => {
    setCombos(next);
    writeCombos(next);
  };

  /** 保存为模板：内容签名已存在 = 原位更新；否则插到最前，超限淘汰最旧 */
  const saveTemplate = (label: string, cards: MainProduct[] = mains): void => {
    const name = label.trim() || defaultTemplateName(cards);
    const sig = comboSignature(cards);
    const entry: StoredCombo = { label: name, cards: cards.map((c) => ({ ...c })) };
    const idx = combos.findIndex((c) => comboSignature(c.cards) === sig);
    persistCombos((idx >= 0 ? combos.map((c, i) => (i === idx ? entry : c)) : [entry, ...combos]).slice(0, TEMPLATE_CAP));
  };

  /** 「＋模板」恒弹名称窗：同内容签名已存在 = 预填其现有名称（原位更新），
   *  否则预填默认名（整份当前选择 / 卡级单组各自按主品名等规则取默认） */
  const openSaveDialog = (cards: MainProduct[]): void => {
    const sig = comboSignature(cards);
    const existing = combos.find((x) => comboSignature(x.cards) === sig);
    setDialog({ value: existing ? existing.label : defaultTemplateName(cards), cards, updating: existing != null });
  };

  /** 模板编辑浮窗「改动即存」：写回原位置（高频改动——改名逐键、增删对比——
   *  用函数式更新避免闭包里的 combos 过期丢补丁；写存储与状态同源） */
  const patchCombo = (prev: StoredCombo, next: StoredCombo): void => {
    setCombos((list) => {
      const idx = list.findIndex((c) => c === prev);
      if (idx < 0) return list;
      const nextList = list.map((c, i) => (i === idx ? next : c));
      writeCombos(nextList);
      return nextList;
    });
    setEditing((e) => (e === prev ? next : e));
  };

  const removeCombo = (target: StoredCombo): void => {
    setCombos((list) => {
      const nextList = list.filter((c) => c !== target);
      writeCombos(nextList);
      return nextList;
    });
    setEditing((e) => (e === target ? null : e));
  };

  const confirmDialog = (): void => {
    if (!dialog) return;
    // 与 OK 按钮同口径拦空名：Input 回车不感知按钮禁用，漏拦会以默认名静默保存
    if (!dialog.value.trim()) return;
    saveTemplate(dialog.value, dialog.cards);
    setDialog(null);
  };

  /** 「＋ 加入当前选择」执行：整卡追加（auto 随模板带入）+ 缺失对比合并进
   *  现有卡。合并经 setCardCompares 落地 = 确有新增的卡按既有铁律退出自动
   *  （手动改对比即关）。计划/文案见 combos.planAppend。 */
  const appendCombo = (c: StoredCombo): void => {
    const { fresh, merges } = planAppend(mains, c);
    if (fresh.length) actions.setMains([...mains, ...fresh]);
    for (const m of merges) {
      const existing = mains.find((x) => x.id === m.cardId);
      if (existing) actions.setCardCompares(m.cardId, [...existing.compares, ...m.compares]);
    }
  };

  /** 「＋ 加入当前选择」气泡文案：与计划逐项对应，如实反映将发生什么 */
  const appendTip = (c: StoredCombo): string => {
    const { fresh, merges, overflowCards, overflowCompares } = planAppend(mains, c);
    const totalAdds = merges.reduce((n, m) => n + m.compares.length, 0);
    if (!fresh.length && !merges.length) {
      if (overflowCards > 0) return `当前已选 ${MAINS_CAP} 组（上限），模板放不下`;
      if (overflowCompares > 0) return `各对比区已配满（每张图最多 ${MAX_LINES_PER_CHART} 条线），没有可补充的对比`;
      return '模板内产品对均已在当前选择中';
    }
    const parts: string[] = [];
    if (fresh.length) parts.push(`新增 ${fresh.length} 组`);
    if (totalAdds) parts.push(`补充 ${totalAdds} 个对比`);
    let tip = `加入当前选择：${parts.join('、')}`;
    if (overflowCards) tip += `；受 ${MAINS_CAP} 组上限所限，${overflowCards} 组放不下`;
    if (overflowCompares) tip += `；${overflowCompares} 个对比超出每图条线上限放不下`;
    return tip;
  };

  // 模板 chip 单行收纳：量出一行能放下几个 chip，放不下的收进行尾「更多」
  // 下拉。隐藏的 chip 用 visibility:hidden 保位，宽度恒可测。
  const recentRowRef = useRef<HTMLDivElement>(null);
  const [recentVisible, setRecentVisible] = useState(combos.length);
  useEffect(() => {
    const el = recentRowRef.current;
    if (!el) return;
    const recompute = (): void => {
      const avail = el.clientWidth;
      if (!avail) return;
      let acc = 0;
      let count = 0;
      for (const kid of el.children) {
        const w = (kid as HTMLElement).offsetWidth;
        const next = count === 0 ? w : acc + 6 + w;
        if (next > avail) break;
        acc = next;
        count += 1;
      }
      setRecentVisible((prev) => (prev === count ? prev : count));
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [combos]);

  const lastModelId = [...mains].reverse().find((c) => c.main)?.main?.modelId;
  const huaweiCards = mains.filter((c) => c.main != null && isHuaweiModel(c.main.modelId));

  return (
    <>
      {/* 顶栏：「模板」（显式保存的产品对/模板组，chip 可编辑）只占一行，
          放不下收进行尾「更多」下拉；右侧按钮簇 = 匹配竞品 · ＋模板 · 清空 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, minHeight: 26 }}>
        {combos.length > 0 && (
          <>
            <span style={{ fontSize: 12, color: color.mute, flexShrink: 0 }}>模板</span>
            <div
              ref={recentRowRef}
              style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap' }}
            >
              {combos.map((c, i) => {
                const summary = c.cards.map((x) => (x.main ? `${modelNameOf(x.main.modelId)} ${x.main.romram}` : '对比产品')).join('、');
                const chip = (
                  <span
                    role="button"
                    aria-label={`加入模板 ${c.label}`}
                    title={`把模板加入当前选择（新增不替换）：${summary}`}
                    className="lpl-pk-ghost"
                    onClick={() => appendCombo(c)}
                    style={{
                      height: 22,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      padding: '0 9px 0 10px',
                      borderRadius: radius.pill,
                      border: `1px solid ${color.hairline}`,
                      background: color.canvas,
                      fontSize: 12,
                      color: color.body,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {c.cards[0]?.main && <BrandDot brand={brandOfModel(c.cards[0].main.modelId)} />}
                    {c.label}
                    <span
                      role="button"
                      aria-label={`编辑模板 ${c.label}`}
                      title="编辑"
                      className="lpl-pk-ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditing(c);
                      }}
                      style={{ display: 'inline-flex', alignItems: 'center', padding: 2, color: color.mute, cursor: 'pointer' }}
                    >
                      <EditOutlined style={{ fontSize: 10 }} />
                    </span>
                    {/* 尾段「＋」= 加入当前选择（增量追加，不动已有内容）；chip 本体点击同义 */}
                    <Tooltip title={appendTip(c)} zIndex={TIP_Z}>
                      <span
                        role="button"
                        aria-label={`把模板 ${c.label} 加入当前选择`}
                        className="lpl-pk-ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          appendCombo(c);
                        }}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          marginLeft: 1,
                          paddingLeft: 6,
                          borderLeft: `1px solid ${color.hairline}`,
                          color: color.mute,
                          cursor: 'pointer',
                        }}
                      >
                        <PlusOutlined style={{ fontSize: 10 }} />
                      </span>
                    </Tooltip>
                  </span>
                );
                return (
                  <span
                    key={i}
                    style={{ display: 'inline-flex', flexShrink: 0, visibility: i < recentVisible ? 'visible' : 'hidden' }}
                  >
                    {chip}
                  </span>
                );
              })}
            </div>
            {recentVisible < combos.length && (
              <Dropdown
                trigger={['click']}
                placement="bottomRight"
                getPopupContainer={(node) => node.closest('[data-lpl-picker-panel]') ?? document.body}
                menu={{
                  style: { maxWidth: 420 },
                  items: combos.map((c, i) => ({
                    key: String(i),
                    label: (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                        {c.cards[0]?.main && <BrandDot brand={brandOfModel(c.cards[0].main.modelId)} />}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>
                          {c.label}
                        </span>
                        <span className="tnum" style={{ fontSize: 11, color: color.mute, flexShrink: 0 }}>
                          {c.cards.length} 组
                        </span>
                        <Tooltip title={appendTip(c)} zIndex={TIP_Z}>
                          <span
                            role="button"
                            aria-label={`把模板 ${c.label} 加入当前选择`}
                            title="加入当前选择"
                            className="lpl-pk-ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              appendCombo(c);
                            }}
                            style={{ display: 'inline-flex', alignItems: 'center', padding: 2, color: color.mute, cursor: 'pointer', flexShrink: 0 }}
                          >
                            <PlusOutlined style={{ fontSize: 10 }} />
                          </span>
                        </Tooltip>
                        <span
                          role="button"
                          aria-label={`编辑模板 ${c.label}`}
                          title="编辑"
                          className="lpl-pk-ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditing(c);
                          }}
                          style={{ display: 'inline-flex', alignItems: 'center', padding: 2, color: color.mute, cursor: 'pointer', flexShrink: 0 }}
                        >
                          <EditOutlined style={{ fontSize: 10 }} />
                        </span>
                      </span>
                    ),
                    title: c.cards.map((x) => (x.main ? `${modelNameOf(x.main.modelId)} ${x.main.romram}` : '对比产品')).join('、'),
                  })),
                  onClick: ({ key }) => {
                    const c = combos[Number(key)];
                    if (!c) return;
                    appendCombo(c);
                  },
                }}
              >
                <span
                  role="button"
                  aria-label="更多模板"
                  title="查看全部模板"
                  className="lpl-pk-ghost"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 3,
                    height: 22,
                    padding: '0 8px',
                    borderRadius: radius.pill,
                    border: `1px solid ${color.hairline}`,
                    background: color.canvas,
                    fontSize: 11,
                    color: color.mute,
                    cursor: 'pointer',
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
                  }}
                >
                  更多 {combos.length - recentVisible} <DownOutlined style={{ fontSize: 9 }} />
                </span>
              </Dropdown>
            )}
          </>
        )}
        {/* 顶栏右侧按钮簇（第一百三十一轮）：左→右 = 匹配竞品 · ＋模板 · 清空 */}
        <span style={{ marginLeft: 'auto', paddingLeft: 12, display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <MatchPill
            label="匹配竞品"
            text="匹配竞品"
            size="md"
            can={huaweiCards.length > 0}
            selected={huaweiCards.length > 0 && huaweiCards.every((c) => !!c.auto)}
            tip={
              huaweiCards.length === 0
                ? '按对标矩阵带出对比区，仅支持华为产品'
                : huaweiCards.every((c) => !!c.auto)
                  ? '已为全部华为主品组开启：对比区随对标矩阵自动保持；点击全部关闭'
                  : '为全部华为主品组开启匹配竞品（对比区按对标矩阵自动带出）'
            }
            onClick={() => actions.autoMatchAll()}
          />
          {mains.length > 0 && (
            <Tooltip title="把当前选择存为模板" zIndex={TIP_Z}>
              <span
                role="button"
                aria-label="存为模板"
                title="把当前选择存为模板"
                className="lpl-pk-ghost"
                onClick={() => openSaveDialog(mains)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  height: 24,
                  padding: '0 10px',
                  borderRadius: radius.pill,
                  border: `1px solid ${color.hairline}`,
                  background: color.canvas,
                  fontSize: 12,
                  color: color.body,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                <PlusOutlined style={{ fontSize: 10 }} /> 模板
              </span>
            </Tooltip>
          )}
          {mains.length > 0 && (
            <Popconfirm
              zIndex={POPOVER_Z}
              title="清空全部组？"
              description="将移除全部主分析产品与对比产品"
              okText="清空"
              cancelText="取消"
              okButtonProps={{ danger: true, size: 'small' }}
              cancelButtonProps={{ size: 'small' }}
              onConfirm={() => actions.setMains([])}
            >
              <span style={{ display: 'inline-flex' }}>
                <span
                  role="button"
                  aria-label="清空"
                  title="清空全部组"
                  className="lpl-pk-del"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    height: 24,
                    padding: '0 10px',
                    borderRadius: radius.pill,
                    border: `1px solid ${color.hairline}`,
                    background: color.canvas,
                    fontSize: 12,
                    color: color.mute,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <DeleteOutlined style={{ fontSize: 11 }} /> 清空
                </span>
              </span>
            </Popconfirm>
          )}
        </span>
      </div>

      {/* 分析对列表（左右排布） */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: PAIR_LIST_MAX_H, overflowY: 'auto', padding: 1 }}>
        {mains.length === 0 && (
          /* 默认新增状态：素框正中一个「选择主分析产品」（不提供先加对比入口、无蓝色底） */
          <div
            style={{
              position: 'relative',
              flexShrink: 0,
              borderRadius: radius.card,
              border: `1px dashed ${color.hairlineStrong}`,
              background: color.canvas,
              overflow: 'hidden',
            }}
          >
            <div style={{ position: 'relative', minHeight: 150, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <LevelSwitchPopover ctx={{ kind: 'add-main' }}>
                <AddPill label="选择主分析产品" big />
              </LevelSwitchPopover>
            </div>
          </div>
        )}
        {mains.map((card, idx) => {
          const huawei = card.main != null && isHuaweiModel(card.main.modelId);
          const isLast = idx === mains.length - 1;
          return (
            <div
              key={card.id}
              onDragOver={(e) => {
                if (!dragCard || dragCard === card.id) return;
                e.preventDefault();
                setDropCard(card.id);
              }}
              onDragLeave={() => setDropCard((t) => (t === card.id ? null : t))}
              onDrop={(e) => {
                e.preventDefault();
                if (dragCard) moveCard(dragCard, card.id);
                setDragCard(null);
                setDropCard(null);
              }}
              style={{
                position: 'relative',
                // 第一百二十八轮：一组 = 一个整框（左主品右对比，分界线隔开），
                // 主品格不再自带蓝框；overflow 裁齐两格底色
                overflow: 'hidden',
                // 第一百二十九轮：高度自适应——overflow 非 visible 的 flex 子项
                // 失去最小高度保护，列表放不下时会被压缩裁切，这里显式禁压缩
                flexShrink: 0,
                // 最后一个组向下延长放「添加主分析产品」：底边直角与延长带衔接
                borderRadius: isLast ? `${radius.card}px ${radius.card}px 0 0` : radius.card,
                border: `1px solid ${dropCard === card.id ? color.link : color.hairline}`,
                background: color.canvas,
                opacity: dragCard === card.id ? 0.45 : undefined,
                boxShadow: dropCard === card.id ? 'inset 0 0 0 2px rgba(0, 112, 243, 0.35)' : undefined,
              }}
            >
              {mains.length > 1 && <CardTag index={idx} />}
              {/* 组头一行：「主分析产品」「对比产品」标题在左，右侧按钮簇 =
                  匹配竞品 · ＋模板（存该组为模板）· 删组 ✕（从左到右） */}
              <div style={{ display: 'flex', alignItems: 'center', height: 34, paddingRight: 8, flexShrink: 0 }}>
                <span style={{ width: 16, flexShrink: 0 }} />
                <div style={{ flex: '0 0 300px', minWidth: 0, paddingLeft: 12, fontSize: 11, fontWeight: 600, color: color.mute, letterSpacing: 0.2 }}>主分析产品</div>
                <div aria-hidden style={{ width: 1, flexShrink: 0 }} />
                <div style={{ flex: '1 1 0', minWidth: 0, position: 'relative', display: 'flex', alignItems: 'center', height: '100%' }}>
                  <span style={{ paddingLeft: 10, fontSize: 11, fontWeight: 600, color: color.mute, letterSpacing: 0.2 }}>对比产品</span>
                  <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <AutoMatchInline card={card} />
                    {card.main && (
                      <Tooltip title={`把该组存为模板（默认名 = ${modelNameOf(card.main.modelId)}）`} zIndex={TIP_Z}>
                        <span
                          role="button"
                          aria-label={`把该组存为模板 ${modelNameOf(card.main.modelId)}`}
                          title={`把该组存为模板（默认名 = ${modelNameOf(card.main.modelId)}）`}
                          className="lpl-pk-ghost"
                          onClick={() => openSaveDialog([card])}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 3,
                            height: 20,
                            padding: '0 8px',
                            borderRadius: radius.pill,
                            border: `1px solid ${color.hairline}`,
                            background: color.canvas,
                            fontSize: 11,
                            color: color.body,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                          }}
                        >
                          <PlusOutlined style={{ fontSize: 9 }} /> 模板
                        </span>
                      </Tooltip>
                    )}
                    <Popconfirm
                      zIndex={POPOVER_Z}
                      title="删除该组？"
                      description="组内对比产品一并移除"
                      okText="删除"
                      cancelText="取消"
                      okButtonProps={{ danger: true, size: 'small' }}
                      cancelButtonProps={{ size: 'small' }}
                      onConfirm={() => actions.setMains(mains.filter((c) => c.id !== card.id))}
                    >
                      <span style={{ display: 'inline-flex' }}>
                        <GroupDeleteX label={card.main ? `删除该组 ${modelNameOf(card.main.modelId)}` : '删除该组'} />
                      </span>
                    </Popconfirm>
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'stretch' }}>
              {/* 拖拽把手（换序 = 分离面板顺序） */}
              <span
                draggable
                onDragStart={(e) => {
                  setDragCard(card.id);
                  e.dataTransfer.effectAllowed = 'move';
                  // Firefox 要求至少携带一项数据才会真正启动拖拽
                  try {
                    e.dataTransfer.setData('text/plain', card.id);
                  } catch {
                    /* 只读事件对象等受限环境忽略 */
                  }
                }}
                onDragEnd={() => {
                  setDragCard(null);
                  setDropCard(null);
                }}
                title="拖动调整顺序"
                style={{ display: 'inline-flex', alignItems: 'center', alignSelf: 'center', cursor: 'grab', color: color.mute, flexShrink: 0, width: 16 }}
              >
                <HolderOutlined style={{ fontSize: 12 }} />
              </span>

              {/* 左格：主分析产品（极浅蓝底；标题在组头行，与右格以分界线隔开） */}
              <div
                style={{
                  flex: '0 0 300px',
                  minWidth: 0,
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  background: 'rgba(0, 112, 243, 0.04)',
                  boxSizing: 'border-box',
                }}
              >
                {card.main ? (
                  <MainRow card={card} />
                ) : (
                  <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 12px 30px' }}>
                    <LevelSwitchPopover ctx={{ kind: 'set-main', cardId: card.id }}>
                      <AddPill label="选择主分析产品" big />
                    </LevelSwitchPopover>
                  </div>
                )}
              </div>

              {/* 分界线：主分析产品 | 对比产品 */}
              <div aria-hidden style={{ width: 1, background: color.hairline, flexShrink: 0 }} />

              {/* 右格：对比产品（标题在组头行；「匹配竞品」开关固定在组头右侧
                  按钮簇；无对比时格内正中 = 提示 + 添加入口，有对比时添加入口
                  在已选条目下方居中） */}
              <div
                style={{
                  flex: '1 1 0',
                  minWidth: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  padding: '8px 10px 10px',
                  boxSizing: 'border-box',
                }}
              >
                {card.compares.length === 0 ? (
                  <div style={{ flex: 1, minHeight: 92, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <div style={{ fontSize: 11, color: color.mute, lineHeight: '18px' }}>
                      {card.main == null
                        ? '可先挑选对比产品，补选主分析产品后即成一组'
                        : huawei
                          ? '点「匹配竞品」一键带出，或手动添加'
                          : '该品牌暂不支持匹配竞品，请手动添加'}
                    </div>
                    <AddCompareTrigger card={card} />
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto', maxHeight: 122 }}>
                      {card.compares.map((sel) => (
                        <CompareRow key={selKey(sel)} card={card} sel={sel} />
                      ))}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 6 }}>
                      <AddCompareTrigger card={card} />
                    </div>
                  </>
                )}
              </div>
              </div>
            </div>
          );
        })}
        {/* 第一百二十六轮：添加主分析产品 = 最后一个组框向下延长的底边正中（显性化） */}
        {mains.length > 0 && (
          <div
            style={{
              marginTop: -10,
              flexShrink: 0,
              border: `1px solid ${color.hairline}`,
              borderTop: 'none',
              borderRadius: `0 0 ${radius.card}px ${radius.card}px`,
              padding: '12px 0',
              display: 'flex',
              justifyContent: 'center',
              background: color.canvas,
            }}
          >
            <Tooltip title={mains.length >= MAINS_CAP ? `最多 ${MAINS_CAP} 组` : '再选一款主分析产品，多组自动分图'} zIndex={TIP_Z}>
              <span style={{ display: 'inline-flex' }}>
                <LevelSwitchPopover ctx={{ kind: 'add-main' }} initialModelId={lastModelId}>
                  <AddPill label="添加主分析产品" big disabled={mains.length >= MAINS_CAP} />
                </LevelSwitchPopover>
              </span>
            </Tooltip>
          </div>
        )}
      </div>

      {/* 名称弹窗：顶栏 / 卡级「＋模板」共用（恒弹；同签名预填现有名称=原位更新）。
          卸载式（dialog 为空整树不挂载）——防 antd5 + StrictMode 关闭后遮罩残留 */}
      <SaveTemplateDialog
        dialog={dialog}
        onChangeValue={(v) => setDialog((d) => (d ? { ...d, value: v } : d))}
        onOk={confirmDialog}
        onCancel={() => setDialog(null)}
      />

      {/* 模板编辑浮窗（二级层，改动即存；入口 = 模板 chip /「更多」下拉 ✎） */}
      {editing && (
        <TemplateEditorFlyout
          combo={editing}
          onPatch={(next) => patchCombo(editing, next)}
          onDelete={() => removeCombo(editing)}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
