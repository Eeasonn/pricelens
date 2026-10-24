// ============================================================
// 国家总览（第三十七轮施工 / 第三十八轮反馈修订）：国家层面主界面 = 竞品矩阵大表。
// 档位带（tier_code 从高到低）× 行配对——型号与它的映射竞品同处一个包裹格子
// （本品牌行在上 / 映射竞品在下，竞品行浅灰底），一体性一眼可读。
// 第六十六轮改版（用户反馈）：①产品名不再双层重复——型号头行表达品牌+产品，
// 本品牌行主列只放配置 ROMRAM；②价格拆三列右对齐（折扣率｜折后价｜RRP，RRP 无划线）；
// ③迷你图删除（总览无意义）。
// 第六十七轮（用户反馈）：①「周期最低」列删除，全表六列（产品｜折扣率｜折后价｜
// RRP｜价差｜预警）；②竞品区折叠由 Provider 保存——全景默认收起、单产品默认展开，
// 收起保留 ROM 竞品摘要，产品头与顶栏全局动作共享状态。
// 第六十八轮（用户反馈）：筛选条与看板拉齐——独立白卡（.lpl-fb）+ 同宽度同序
// （国家 210｜产业 155｜本品牌产品 flex｜平台 160｜价格档位 flex），标签统一「本品牌产品」。
// 第七十轮（用户反馈：收起竞品后仍不够整洁）：①产品级折叠——默认每产品一条产品条
// （箭头+品牌+名称+生命周期+N 个配置+竞品 N ⋯⋯ 价区间｜预警｜竞品对比｜⋯），
// 一屏看清「这个国家这个产业有哪些产品」；点击产品条才展开配置（ROM）明细，
// 单产品可见时自动展开（视图态存 Provider，切页保留）。
// ②竞品对比入口分两层：产品条主按钮进入全部型号，ROM 行按钮进入单型号；
// 添加竞品/多平台对比等次要动作收进产品条右侧「⋯」菜单；未配置对标的虚线占位删除。
// 纯展示层：结构全部来自 buildOverviewMatrix（金测锚定），本文件不取数。
// ============================================================
import { usePage } from '../state/PageContext';
import { useFilters } from '../state/FiltersContext';
import { useOverviewView } from '../state/OverviewViewContext';
import { navBus } from '../state/navBus';
import { buildOverviewMatrix, TIER_LABELS } from '../dataModel/aggregate';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ConfigProvider, Segmented, Select } from 'antd';
import type { OverviewCompRow, OverviewModel, OverviewRow } from '../dataModel/aggregate';
import { scopeLabels } from '../dataModel/scope';
import type { DimBenchmark } from '../dataModel/types';
import { filterBarTheme } from '../components/FilterBar';
import ScopeFields from '../components/FilterBar/ScopeFields';
import PlatformBox from '../components/FilterBar/PlatformBox';
import CurrencyBox from '../components/FilterBar/CurrencyBox';
import { OwnProductControl } from '../components/FilterBar/ProductBox';
import { getEffectiveBenchmark } from '../state/configStore';
import { CONFIG_CHANGED_EVENT } from '../state/lplKeys';
import PageHeader from '../components/PageHeader';
import MarketMap from './overview/MarketMap';
import { color, fontSize, formatPrice, radius, selectSoft, selectSoftInk, shadow, space } from '../theme/tokens';


/** 总览筛选行单元格（第六十八轮与看板拉齐）：外置 12px 标签 + gap 6 + 30px 控件
 *  （高度/字号走 filterBarTheme），width 固定 / flex 弹性两种，同 FilterBar 的 Field */
function FilterCell(props: { label?: string; width?: number; flex?: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: props.width, flex: props.flex, minWidth: 0, flexShrink: props.width ? 0 : undefined }}>
      {props.label != null && <span style={{ fontSize: 12, color: color.mute, flexShrink: 0, whiteSpace: 'nowrap' }}>{props.label}</span>}
      <div style={{ flex: 1, minWidth: 0 }}>{props.children}</div>
    </div>
  );
}

// 第五十四轮：型号头行的动作收进产品条；产品条主按钮打开全部型号对比，
// ROM 行固定保留单型号对比入口，多平台对比由产品条右侧菜单打开。

/** 颜色次级菜单（第四十四轮建；第五十二轮追补三随「颜色列」删除而下线——用户定版
 *  总览行 = 看板页签式「品牌+产品名+RAMROM」一段式，颜色下钻留在看板/级联侧） */

/** 盒内统一行栅格（第六十七轮定版）：产品｜折扣率｜折后价｜RRP｜价差｜预警
 *  ——六列，数值列右对齐成表格读数；竖线全程连续（分隔线画在 Td 上、行内边距收进
 *  单元格里，行与行的线首尾相接不断开）。 */

export default function Overview() {
  const { go } = usePage();
  const { state, actions } = useFilters();
  const {
    prodSel,
    setProdSel,
    selTiers,
    setSelTiers,
    scrollTop,
  } = useOverviewView();
  // 本页视图态：产品 = 级联多选（空 = 全部本品牌产品）；价格档位 = 档位多选（空 = 全部档位）。
  // 两种筛选互斥（产品∈档位双选无信息量），切换时清空另一侧。
  // 模式本身是页内瞬态，但 selTiers/prodSel 在 Provider 持久化——档位模式勾选后切页
  // 往返若恒回「产品」，档位筛选会隐式生效且无处可关；故挂载时按持久化的选择反推
  // 初始模式（切回「产品」时清 selTiers 的既有逻辑保持两侧互斥）
  const [ovSubjectMode, setOvSubjectMode] = useState<'product' | 'tier'>(() => (selTiers.length > 0 ? 'tier' : 'product'));
  const currency = state.currency;
  const rootRef = useRef<HTMLDivElement>(null);
  // 第四十四轮：竞品映射吃「生效矩阵」（配置页/配置对标弹窗的手动快照优先，回退 auto），
  // CONFIG_CHANGED_EVENT → 重建（看板开启「自动匹配竞品」的组同事件随矩阵重算）
  const [bench, setBench] = useState<DimBenchmark[]>(() => getEffectiveBenchmark());

  useLayoutEffect(() => {
    const scroller = rootRef.current;
    if (!scroller) return;
    const target = navBus.overviewScrollTo;
    if (!target) {
      scroller.scrollTop = scrollTop.current;
      return;
    }
    const timer = window.setTimeout(() => {
      if (navBus.overviewScrollTo === target) navBus.overviewScrollTo = null;
      const el = scroller.querySelector<HTMLElement>(`[data-model-id="${target}"]`);
      if (!el) return;
      scroller.scrollTop =
        el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 12;
    }, 160);
    return () => window.clearTimeout(timer);
  }, [scrollTop]);
  useEffect(() => {
    const h = () => setBench(getEffectiveBenchmark());
    window.addEventListener(CONFIG_CHANGED_EVENT, h);
    return () => window.removeEventListener(CONFIG_CHANGED_EVENT, h);
  }, []);
  // 第五十一轮：平台筛选进入矩阵口径（applyPlatform 因子与看板同源；OZON 基准不变）
  const bands = useMemo(
    () => buildOverviewMatrix(currency, bench, state.platform, state),
    [currency, bench, state.platform, state.countryCode, state.industry],
  );
  const tierOptions = useMemo(
    () => bands.map((b) => ({ value: b.tierCode, label: TIER_LABELS[b.tierCode] })),
    [bands],
  );

  const { industry } = scopeLabels(state);

  // 国家/产业切换 → 本页产品/档位视图态失效（型号集随口径重建，旧选择无对应对象）。
  // 用上次口径键比对而非直接依赖 [countryCode, industry]：后者挂载首跑必清，
  // 会把视图态 Provider 承诺的「切页保留」击穿
  const scopeSeenRef = useRef(`${state.countryCode}|${state.industry}`);
  useEffect(() => {
    const cur = `${state.countryCode}|${state.industry}`;
    if (scopeSeenRef.current === cur) return;
    scopeSeenRef.current = cur;
    setProdSel([]);
    setSelTiers([]);
  }, [state.countryCode, state.industry]);

  /** 档位/产品筛选后的摆位图型号集（本品牌+竞品；市场摆位沿用同口径）。
   *  筛选本品牌产品时，其生效对标竞品一并保留（竞品对比模式仍可对读） */
  const mapModels = useMemo(() => {
    const list = bands
      .filter((b) => selTiers.length === 0 || selTiers.includes(b.tierCode))
      .flatMap((b) => b.models);
    if (prodSel.length === 0) return list;
    const ownIds = new Set(prodSel.map((sel) => sel.modelId));
    const compIds = new Set<string>();
    for (const m of list) {
      if (ownIds.has(m.modelId)) for (const c of m.comps) compIds.add(c.skuId.split('__')[0]);
    }
    return list.filter((m) => (m.isOwn ? ownIds.has(m.modelId) : compIds.has(m.modelId)));
  }, [bands, prodSel, selTiers]);

  return (
    <div
      ref={rootRef}
      data-lpl-scroll
      onScroll={(event) => {
        scrollTop.current = event.currentTarget.scrollTop;
      }}
      style={{ height: '100%', overflowX: 'auto', overflowY: 'auto', background: color.canvasSoft }}
    >
      <div style={{ minWidth: 1280, minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* 顶栏 64px（共享 PageHeader，预警中心重构统一四页铬架） */}
        <PageHeader title="国家总览" />

        {/* 筛选条（第六十八轮与看板拉齐）：独立白卡 + .lpl-fb 同类名 + 同宽度同序——
            国家｜产业｜本品牌产品｜平台｜价格档位；控件 30px/字号 13 走 filterBarTheme。
            国家/产业为共享口径态；本品牌产品/价格档位为本页视图态（空 = 全部） */}
        <div style={{ padding: `${space.md}px ${space.lg}px 0` }}>
          <ConfigProvider theme={filterBarTheme}>
            <section className="lpl-fb" style={{ background: color.canvas, boxShadow: shadow.l1, borderRadius: radius.card, padding: `8px ${space.lg}px` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 30, flexWrap: 'wrap' }}>
                <ScopeFields />
                {/* 分析对象：产品 = 级联多选，价格档位 = 档位多选（本页视图态） */}
                <Segmented
                  size="small"
                  value={ovSubjectMode}
                  onChange={(v) => {
                    const mode = v as 'product' | 'tier';
                    setOvSubjectMode(mode);
                    if (mode === 'product') setSelTiers([]);
                    else setProdSel([]);
                  }}
                  options={[{ label: '产品', value: 'product' }, { label: '价格档位', value: 'tier' }]}
                />
                <FilterCell flex="1 1 285px">
                  {ovSubjectMode === 'product' ? (
                    <OwnProductControl
                      selection={prodSel}
                      onSelectionChange={setProdSel}
                      emptyPlaceholder="全部产品"
                    />
                  ) : (
                    <Select
                      mode="multiple"
                      allowClear
                      maxTagCount="responsive"
                      placeholder="全部档位"
                      style={{ width: '100%' }}
                      value={selTiers}
                      onChange={setSelTiers}
                      options={tierOptions}
                    />
                  )}
                </FilterCell>
                {/* 平台（第五十一轮）：看板同款级联（平台→店铺），共享 state.platform 双页联动 */}
                <FilterCell label="平台 / 店铺" width={200}>
                  <PlatformBox />
                </FilterCell>
                <FilterCell label="币种" width={150}>
                  <CurrencyBox />
                </FilterCell>
              </div>
            </section>
          </ConfigProvider>
        </div>

        <main style={{ flex: 1, padding: `${space.md}px ${space.lg}px ${space.lg}px` }}>
          <section style={{ background: color.canvas, boxShadow: shadow.l1, borderRadius: radius.card, padding: space.md }}>
            <MarketMap
              models={mapModels}
              currency={currency}
              industryLabel={industry}
              industry={state.industry}
            />


          </section>
        </main>

      </div>

    </div>
  );
}
