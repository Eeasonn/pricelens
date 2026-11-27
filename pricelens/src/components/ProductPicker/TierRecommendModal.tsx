// ============================================================
// 「同档位推荐」弹窗（2026-11-27 二轮改版 · 现价落档口径）：主品卡「匹配竞品 ▾」
// 下「同档位…」菜单项打开的弹窗。候选与口径见 ./tierRecommend——
// 同档 = 与主品配置按现价落入同一档位（dataModel/tierPrice：最新有价期全渠道
// 价格点剔除低于均值 30% 的异常低价后取最低，USD 口径落 tierBandsOf 阶梯），
// 不再是 tier_by_country 声明档；同国家、同产业、型号 × 配置为单位、按品牌分组。
// 主品无现价 = 空态「主品暂无现价，无法按档位推荐」。
// 默认只看竞品品牌，勾「含我司品牌」可包含我司。
// 交互：每品牌选 1 款 / 全选当前结果 / 清空本次勾选 + 固定底部「加入对比」；
// 加入 = actions.addCardCompares(…, 'tier')——与矩阵匹配并存为并集、去重，不改
// 「自动匹配竞品」开关（见 state/mainSelection）。勾选态只在本次弹窗内有效。
// 不虚构数据、不做不透明打分：现价 / 价差 / 覆盖 / 来源全部来自事实表与维表，
// 组内排序规则（与主品现价最接近在前）在弹窗里明示。
// ============================================================
import { useMemo, useState, type CSSProperties } from 'react';
import { Checkbox, Modal, Tooltip, message } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { dimProduct, dimRegion } from '../../data';
import { useFilters } from '../../state/FiltersContext';
import type { MainProduct, ProductSelection } from '../../state/filtersTypes';
import { selKey } from '../../state/mainSelection';
import { TIER_LABELS } from '../../dataModel/aggregate';
import { INDUSTRY_LABELS } from '../../dataModel/scope';
import { tierLabelShort } from '../../chart/PriceTrend/helpers';
import { currentPricesByGroup, currentTierOfSelection } from '../../dataModel/tierPrice';
import { color, fontSize, formatPrice, radius, selectSoft, selectSoftInk } from '../../theme/tokens';
import BrandDot, { brandLabelOf } from '../BrandMark';
import { configTextOf, modelNameOf, ownBrand, productHasDataInCountry } from '../ProductCascader';
import {
  buildTierCandidates,
  coverageText,
  diffPctText,
  latestText,
  periodText,
  pickOnePerBrand,
  type TierCandidateGroup,
} from './tierRecommend';
import { POPOVER_Z, useTreeData } from './pickerBits';

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

const TH: CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: 1,
  background: color.canvas,
  borderBottom: `1px solid ${color.hairlineStrong}`,
  padding: '4px 8px',
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 600,
  color: color.mute,
  whiteSpace: 'nowrap',
};

const TD: CSSProperties = {
  padding: '5px 8px',
  borderBottom: `1px solid ${color.hairline}`,
  fontSize: 12,
  color: color.body,
  whiteSpace: 'nowrap',
};

/** 「来源状态」文字徽标：真实（周度平台实抓 / ZA 运营商小册子）或 暂无价格——
 *  状态由文字表达，颜色只作辅助 */
function SourceBadge({ real, title, children }: { real: boolean; title: string; children: string }) {
  return (
    <span
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 18,
        padding: '0 6px',
        borderRadius: radius.pill,
        fontSize: 10,
        fontWeight: 600,
        color: real ? selectSoftInk : color.mute,
        background: real ? selectSoft : color.canvasSoft2,
        border: `1px solid ${real ? 'rgba(0, 112, 243, 0.35)' : color.hairline}`,
      }}
    >
      {children}
    </span>
  );
}

export default function TierRecommendModal({ card, onClose }: { card: MainProduct; onClose: () => void }) {
  const { state, actions } = useFilters();
  const { fullTree } = useTreeData();
  const [includeOwn, setIncludeOwn] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(() => new Set<string>());

  const main = card.main;
  const countryCode = state.countryCode;
  const currency = state.currency;
  // 主品现价落档（tierPrice 口径，2026-11-27 二轮改版）：无现价 → tier null → 空态
  const mainTier = useMemo(() => (main ? currentTierOfSelection(main, countryCode) : null), [main, countryCode]);
  const band = mainTier?.tier ?? null;
  const mainUsd = mainTier?.price.usd ?? null;
  // 批量裁定（事实表一遍扫描，纯函数）：本产业本国的全部组现价/落档
  const byGroup = useMemo(() => currentPricesByGroup(state.industry, countryCode), [state.industry, countryCode]);
  // 该国有数据的组键集（productHasDataInCountry 口径，financing-aware）与覆盖 SKU 集
  const { dataKeys, groupSkus } = useMemo(() => {
    const keys = new Set<string>();
    const skus = new Map<string, readonly string[]>();
    for (const p of dimProduct) {
      if (p.industry !== state.industry || !p.countries.includes(countryCode)) continue;
      const key = `${p.model_id}|${p.romram}`;
      const list = skus.get(key);
      if (list) (list as string[]).push(p.sku_id);
      else skus.set(key, [p.sku_id]);
      if (productHasDataInCountry(p, countryCode, state.financingType, state.financingTerms)) keys.add(key);
    }
    return { dataKeys: keys, groupSkus: skus };
  }, [state.industry, countryCode, state.financingType, state.financingTerms]);
  // 候选：主品自身组 + 已在对比区的组不进候选（已加入的不重复列出）
  const groups = useMemo<TierCandidateGroup[]>(() => {
    if (!main || !band) return [];
    return buildTierCandidates({
      industry: state.industry,
      band,
      countryCode,
      financingType: state.financingType,
      financingTerms: state.financingTerms,
      mainUsd,
      excludeKeys: new Set([selKey(main), ...card.compares.map(selKey)]),
      byGroup,
      dataKeys,
      groupSkus,
      brandOrder: fullTree.map((b) => b.key),
    });
  }, [main, band, state.industry, countryCode, state.financingType, state.financingTerms, mainUsd, card.compares, byGroup, dataKeys, groupSkus, fullTree]);
  const visibleGroups = useMemo(
    () => (includeOwn ? groups : groups.filter((g) => g.brand !== ownBrand())),
    [groups, includeOwn],
  );
  // 勾选只在当前可见候选内有效（勾掉「含我司」时我司组连同其勾选一并移出本次结果）
  const visibleKeys = useMemo(() => new Set(visibleGroups.flatMap((g) => g.items.map((c) => c.key))), [visibleGroups]);
  const effectivePicked = useMemo(() => new Set([...picked].filter((k) => visibleKeys.has(k))), [picked, visibleKeys]);
  const byKey = useMemo(() => new Map(groups.flatMap((g) => g.items.map((c) => [c.key, c] as const))), [groups]);

  const toggle = (key: string, on: boolean): void =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  const countryName = dimRegion.find((r) => r.country_code === countryCode)?.country_name ?? countryCode;
  const bandLabel = band ? (TIER_LABELS[band] ?? band) : '';
  const own = ownBrand();
  const mainPriceText = (usd: number | null, local: number | null): number | null => {
    const v = currency === 'usd' ? usd : local;
    return v != null ? Math.round(v) : null;
  };

  const addSelected = (): void => {
    const sels: ProductSelection[] = [];
    for (const k of effectivePicked) {
      const c = byKey.get(k);
      if (c) sels.push(c.sel);
    }
    if (!sels.length) return;
    actions.addCardCompares(card.id, sels, 'tier');
    message.success(`已把 ${sels.length} 款同档推荐加入对比区（自动匹配保持开启）`);
    onClose();
  };

  const emptyHint = !main
    ? '先选择主分析产品，再按档位推荐对比产品'
    : band == null
      ? '主品暂无现价，无法按档位推荐'
      : groups.length === 0
        ? `同档位（${bandLabel}）在${countryName}暂无其他可推荐的产品配置`
        : visibleGroups.length === 0
          ? `同档位（${bandLabel}）下只有我司产品，勾选「含我司品牌」后显示`
          : null;

  return (
    <Modal
      open
      title={main ? `同档位推荐 · ${modelNameOf(main.modelId)}${configTextOf(main.romram) ? ` ${configTextOf(main.romram)}` : ''}` : '同档位推荐'}
      okText={effectivePicked.size ? `加入对比（${effectivePicked.size}）` : '加入对比'}
      cancelText="取消"
      okButtonProps={{ disabled: effectivePicked.size === 0 }}
      onOk={addSelected}
      onCancel={onClose}
      width={860}
      zIndex={POPOVER_Z}
      destroyOnHidden
    >
      {/* 口径行：现价落档 + 范围 + 排序规则（明示，不打黑箱分） */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 10px', marginBottom: 10, fontSize: 12, color: color.mute }}>
        {main && band && (
          <span data-testid="tier-recommend-scope">
            同档位 <strong style={{ color: color.ink }}>{tierLabelShort(bandLabel)}</strong> · 按现价落档 · {countryName} · {INDUSTRY_LABELS[state.industry]}
          </span>
        )}
        <Tooltip
          title={
            '按现价落档：现价 = 该配置全部颜色在最新有价期的全部渠道价格点，剔除低于同期均值 30% 的异常低价后取最低（USD 口径）；' +
            '档位 = 现价落入的产业价格阶梯（如 200-400 美元）。候选 = 现价落档与主品同档、同国家、同产业且有数据的产品配置（型号 × 配置）。' +
            '数据覆盖 = 当前国家有价的周数（南非 = 月数）；来源 = 周度平台实抓（南非 = 运营商小册子），均为真实数据。' +
            '组内按与主品现价最接近排序，「每品牌选 1 款」取组内第一款。'
          }
        >
          <button
            type="button"
            aria-label="同档位推荐口径说明"
            style={{ display: 'inline-flex', alignItems: 'center', padding: 0, border: 'none', background: 'none', cursor: 'help', color: color.mute }}
          >
            <QuestionCircleOutlined style={{ fontSize: 12 }} />
          </button>
        </Tooltip>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          主品现价 <span className="tnum" style={{ color: color.ink, fontWeight: 600 }}>{formatPrice(mainPriceText(mainTier?.price.usd ?? null, mainTier?.price.local ?? null), currency)}</span>
        </span>
      </div>

      {/* 工具行：含我司 + 批量动作 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Checkbox
          checked={includeOwn}
          onChange={(e) => setIncludeOwn(e.target.checked)}
          aria-label="含我司品牌"
        >
          含我司品牌
        </Checkbox>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <button
            type="button"
            className="lpl-pk-ghost"
            onClick={() => setPicked(new Set(pickOnePerBrand(visibleGroups)))}
            disabled={visibleGroups.length === 0}
            style={GHOST_BTN}
          >
            每品牌选 1 款
          </button>
          <button
            type="button"
            className="lpl-pk-ghost"
            onClick={() => setPicked(new Set([...visibleKeys]))}
            disabled={visibleKeys.size === 0}
            style={GHOST_BTN}
          >
            全选当前结果
          </button>
          <button
            type="button"
            className="lpl-pk-ghost"
            onClick={() => setPicked(new Set())}
            disabled={picked.size === 0}
            style={GHOST_BTN}
          >
            清空本次勾选
          </button>
        </span>
      </div>

      {/* 候选表：按品牌分组；列 = 产品 / 配置 / 当前参考价 / 相对主品 / 数据覆盖 / 来源状态 */}
      <div className="lpl-card-scroll" style={{ maxHeight: 380, overflow: 'auto' }}>
        {emptyHint ? (
          <div role="status" style={{ padding: '18px 12px', fontSize: 12, color: color.mute, textAlign: 'center' }}>
            {emptyHint}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...TH, width: 32 }} aria-label="选择" />
                <th style={TH}>产品</th>
                <th style={TH}>配置</th>
                <th style={{ ...TH, textAlign: 'right' }}>当前参考价</th>
                <th style={{ ...TH, textAlign: 'right' }}>相对主品</th>
                <th style={TH}>数据覆盖</th>
                <th style={TH}>来源状态</th>
              </tr>
            </thead>
            {visibleGroups.map((g) => (
              <tbody key={g.brand}>
                <tr>
                  <th
                    scope="rowgroup"
                    colSpan={7}
                    style={{ padding: '6px 8px 4px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: color.ink }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <BrandDot brand={g.brand} />
                      {brandLabelOf(g.brand)}
                      <span style={{ fontSize: 11, fontWeight: 400, color: color.mute }}>· {g.items.length} 款</span>
                      {g.brand === own && (
                        <span style={{ fontSize: 10, fontWeight: 600, color: selectSoftInk, background: selectSoft, borderRadius: radius.pill, padding: '0 6px', lineHeight: '16px' }}>我司</span>
                      )}
                      <button
                        type="button"
                        className="lpl-pk-ghost"
                        onClick={() =>
                          setPicked((prev) => {
                            const next = new Set(prev);
                            for (const c of g.items) next.delete(c.key);
                            next.add(g.items[0].key); // 组内第一款 = 与主品现价最接近
                            return next;
                          })
                        }
                        style={{ ...GHOST_BTN, height: 20, padding: '0 8px', fontSize: 11, marginLeft: 4 }}
                      >
                        选 1 款
                      </button>
                    </span>
                  </th>
                </tr>
                {g.items.map((c) => {
                  const on = effectivePicked.has(c.key);
                  const noPrice = c.usd == null;
                  const priceTip = c.period == null
                    ? '当前国家该配置没有可用的最新价格'
                    : `${periodText(c.period)} · 现价 = 最新有价期全渠道价格点剔除异常低价后取最低${c.droppedCount > 0 ? ` · 已剔除 ${c.droppedCount} 个异常低价` : ''}`;
                  return (
                    <tr key={c.key} data-testid="tier-candidate-row">
                      <td style={{ ...TD, width: 32 }}>
                        <Checkbox
                          checked={on}
                          onChange={(e) => toggle(c.key, e.target.checked)}
                          aria-label={`选择 ${brandLabelOf(c.brand)} ${c.modelName} ${configTextOf(c.romram)}`.trim()}
                        />
                      </td>
                      <td style={{ ...TD, color: color.ink, fontWeight: 600, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }} title={c.modelName}>
                        {c.modelName}
                      </td>
                      <td className="tnum" style={{ ...TD, color: color.body }}>{configTextOf(c.romram) || '—'}</td>
                      <td className="tnum" style={{ ...TD, textAlign: 'right', color: noPrice ? color.mute : color.ink }} title={priceTip}>
                        {formatPrice(mainPriceText(c.usd, c.local), currency)}
                      </td>
                      <td
                        className="tnum"
                        style={{ ...TD, textAlign: 'right', fontWeight: 600, color: c.diffPct == null ? color.mute : color.body }}
                        title={c.diffPct == null ? '候选或主品暂无现价，无法计算价差' : '（候选现价 − 主品现价）÷ 主品现价'}
                      >
                        {diffPctText(c.diffPct)}
                      </td>
                      <td className="tnum" style={TD} title="当前国家该配置有价的周数 / 全量周数（南非为月数）；任意渠道有价即计入">
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          {coverageText(c.coverage, countryCode)}
                          <span
                            aria-hidden
                            style={{
                              width: 44,
                              height: 5,
                              borderRadius: radius.pill,
                              background: color.canvasSoft2,
                              overflow: 'hidden',
                              flexShrink: 0,
                            }}
                          >
                            <span
                              style={{
                                display: 'block',
                                height: '100%',
                                width: `${c.coverage.total ? Math.round((c.coverage.covered / c.coverage.total) * 100) : 0}%`,
                                background: color.hairlineStrong,
                              }}
                            />
                          </span>
                        </span>
                      </td>
                      <td style={TD}>
                        <SourceBadge
                          real={!noPrice}
                          title={
                            noPrice
                              ? '当前国家该配置没有可用的最新价格'
                              : countryCode === 'ZA'
                                ? `南非运营商小册子月度事实（已复核发布），最新 ${latestText(c.coverage)}`
                                : `周度平台实抓价格，最新 ${latestText(c.coverage)}`
                          }
                        >
                          {noPrice ? '暂无价格' : `真实 · ${latestText(c.coverage)}`}
                        </SourceBadge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        )}
      </div>

      {/* 底部固定动作由 Modal footer 承载（加入对比 / 取消）；此处只补一句来源并存说明 */}
      <div style={{ marginTop: 10, fontSize: fontSize.caption, color: color.mute }}>
        已在对比区的产品不再列出；加入后与矩阵匹配并存为并集、同型号同配置去重，可随时手动移除。
      </div>
    </Modal>
  );
}
