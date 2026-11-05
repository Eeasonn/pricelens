// ============================================================
// 筛选条（第一百一十七轮重构：统一产品选择入口）：
// 国家/产业 · 选择产品（浮窗：主分析卡 + 每卡对比区）· 平台 · 币种。
// 原「我司产品级联 vs 竞品级联 + 自动按钮」两个并列筛选器已于第一百一十七轮退役
// ——「我司比竞品」的主观预设退场，主分析/对比是用户指定的角色，
// 品牌列里华为与其他品牌并列。
// 第一百二十三轮：「按产品 | 按档位」Segmented 退役（档位融入选择产品浮窗的
// 树筛选与批量动作）；入口摘要改产品对语言——未选 / 单组（主品 vs 对比数）/
// 多组（前 2 组 chip + ＋N 组），一眼读出「选了什么、比了什么」。
// 第一百三十一轮波2：showTime 时在币种右侧渲染时间筛选簇（TimeBox 包装
// TimeRangeCluster），两看板的时间筛选器统一上移到顶部筛选条——入口列弹性
// 收窄让位，整行 1280 视口仍单行。
// 第一百九十轮（外部 UX 审计落地）：多平台对比子视图下主图已按店铺画多条线，
// 单组摘要 chip 第二行不再写「无对比」，改示「平台对比」（悬停全量摘要保持
// 产品对语义不动——细节仍真实）；产品对比子视图行为与现状完全一致。
// 2026-11-05（Eason 指令）：全局平台筛选器回归并改版——紧随「选择产品」入口
// 渲染一枚平台 Select（PlatformSelectBox：选项 = 该国 dim_channel 平台集合，
// 默认 = 现默认平台，写入 state.platform），筛选结果作用于看板下方所有产品；
// 每产品单独选店铺的入口（量价页 DNS chip / 店铺同步）同日退役。原「平台 /
// 店铺」三级级联（PlatformBox）从筛选条撤下（总览页矩阵仍在用该组件，文件
// 保留）；showPlatform prop 退役为 no-op，仅为 App.AnalysisShell 既有传参保留。
// ============================================================
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ConfigProvider, Tooltip } from 'antd';
import type { ThemeConfig } from 'antd';
import { DownOutlined } from '@ant-design/icons';
import { color, radius, selectAccent, selectSoft, selectSoftInk, shadow, space } from '../../theme/tokens';
import PlatformSelectBox from './PlatformSelectBox';
import CurrencyBox from './CurrencyBox';
import ScopeFields from './ScopeFields';
import TimeBox from './TimeBox';
import GranularityBox from './GranularityBox';
import ProductPickerFlyout from '../ProductPicker/ProductPickerModal';
import { useFilters } from '../../state/FiltersContext';
import { usePage } from '../../state/PageContext';
import { STABLE } from '../../appChannel';
import { useNarrowViewport } from '../../state/useNarrowViewport';
import { useChartContent } from '../../state/chartContent';
import { brandOfModel, configTextOf, modelNameOf } from '../ProductCascader/tree';
import BrandDot, { brandLabelOf } from '../BrandMark';
import { EMPTY_MAIN_LABEL } from '../../state/mainSelection';
import type { MainProduct } from '../../state/filtersTypes';

/** Also used by the overview's product controls. */
export const filterBarTheme: ThemeConfig = {
  token: { colorPrimary: selectAccent, controlHeight: 30, controlHeightSM: 24, fontSize: 13, fontSizeSM: 12 },
  components: {
    Button: { colorPrimary: color.ink },
    Segmented: { itemSelectedBg: selectSoft, itemSelectedColor: selectSoftInk },
    Select: { optionSelectedBg: selectSoft, optionSelectedColor: selectSoftInk },
    Cascader: { optionSelectedBg: selectSoft, optionSelectedColor: selectSoftInk },
  },
};

const labelStyle: React.CSSProperties = { fontSize: 12, color: color.mute, whiteSpace: 'nowrap', flexShrink: 0 };

function Field({ label, width, children }: { label: string; width?: number; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, width, minWidth: 0 }}>
      <span style={labelStyle}>{label}</span>
      <div style={{ minWidth: 0, flex: 1 }}>{children}</div>
    </div>
  );
}

// ---------------- 统一产品选择入口（产品对摘要） ----------------

/** 悬停全量摘要：每组一行「第 N 组：主品（配置） vs 对比 a（配置）、b（配置）」 */
const groupSummaryLine = (m: MainProduct, i: number): string => {
  // 无配置层级的产品（romram '—'，第一百五十三轮）不带「（—）」段
  const withConfig = (modelId: string, romram: string): string => {
    const cfg = configTextOf(romram);
    return cfg ? `${modelNameOf(modelId)}（${cfg}）` : modelNameOf(modelId);
  };
  const mainPart = m.main
    ? withConfig(m.main.modelId, m.main.romram)
    : EMPTY_MAIN_LABEL;
  const compPart = m.compares.length
    ? `对比 ${m.compares.map((c) => withConfig(c.modelId, c.romram)).join('、')}`
    : '无对比';
  return `第 ${i + 1} 组：${mainPart} vs ${compPart}`;
};

/** 多组摘要：品牌在上、产品与型号在下；对比数量独立在右侧，默认无灰底。
 *  芯片可被压窄，但文字必须停在芯片内：型号先省略，配置随后省略，不能盖住「＋N 组」。 */
function GroupChip({ card }: { card: MainProduct }) {
  const compareText = card.compares.length ? `对比 ${card.compares.length} 款` : '无对比';
  const config = card.main ? configTextOf(card.main.romram) : '';
  return (
    <span
      className="lpl-group-chip"
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: 1,
        padding: '2px 2px',
        borderRadius: 8,
        background: 'transparent',
        flex: '1 1 120px',
        minWidth: 0,
        maxWidth: 240,
        overflow: 'hidden',
      }}
    >
      {card.main ? (
        <>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, overflow: 'hidden' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 0, flex: '1 1 auto', overflow: 'hidden' }}>
              <BrandDot brand={brandOfModel(card.main.modelId)} />
              <span
                style={{
                  fontSize: 10, lineHeight: '12px', fontWeight: 400, color: color.mute,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0,
                }}
              >
                {brandLabelOf(brandOfModel(card.main.modelId))}
              </span>
            </span>
            <span className="lpl-compare-count" style={{ flexShrink: 0, fontSize: 10, lineHeight: '12px', color: color.mute }}>
              {compareText}
            </span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, paddingLeft: 12, overflow: 'hidden' }}>
            <span
              style={{
                flex: '1 100 auto',
                fontSize: 12, lineHeight: '15px', fontWeight: 600, color: color.ink,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0,
              }}
            >
              {modelNameOf(card.main.modelId)}
            </span>
            {config && (
              <span
                className="tnum"
                style={{
                  flex: '0 1 auto',
                  minWidth: 0,
                  maxWidth: '100%',
                  fontSize: 11, lineHeight: '15px', color: color.mute,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}
              >
                · {config}
              </span>
            )}
          </span>
        </>
      ) : (
        <span style={{ fontSize: 11, color: color.mute, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{EMPTY_MAIN_LABEL}</span>
      )}
    </span>
  );
}

/** 统一产品选择入口：摘要 chip → 点击弹「选择产品」浮窗。
 *  摘要 = 产品对语言三态：未选择（灰字引导）/ 单组（品牌行 + 型号行，与图例
 *  药丸同构）/ 多组（前 2 组紧凑 chip + ＋N 组），放不下整体省略号，悬停列全量。
 *  第一百四十八轮：单组摘要与 chip 均改两行带品牌（拉齐看板图例药丸设计），
 *  入口盒高度 30→40 容纳两行。 */
function ProductPickerEntry() {
  const { state } = useFilters();
  // 多平台对比子视图（第一百九十轮）：主图按店铺画多条线，摘要不再写「无对比」。
  // 本组件在 ChartContentProvider 内（App 全局包裹），直接取呈现切换上下文
  const { priceSubview } = useChartContent();
  const platformCompare = priceSubview === 'platforms';
  const narrow = useNarrowViewport();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // 入口自己的宽度，不是视口。时间簇把产品列挤窄时，两张芯片会把配置挤到「＋N 组」上。
  const [fitsTwo, setFitsTwo] = useState(true);
  useEffect(() => {
    const el = buttonRef.current;
    if (!el) return;
    const measure = () => setFitsTwo(el.clientWidth >= 440);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const mains = state.mains;
  const single = mains.length === 1 ? mains[0] : null;
  const visibleGroups = narrow || !fitsTwo ? 1 : 2;

  return (
    <ProductPickerFlyout open={open} onOpenChange={setOpen}>
      <button
        type="button"
        aria-label="选择产品"
        aria-haspopup="dialog"
        aria-expanded={open}
        title={mains.length ? mains.map(groupSummaryLine).join('\n') : '点击选择主分析产品与对比产品'}
        ref={buttonRef}
        onClick={() => setOpen((v) => !v)}
        style={{
            minHeight: 40,
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            padding: '0 10px',
            border: `1px solid ${open ? selectAccent : color.hairline}`,
            borderRadius: radius.control,
            background: color.canvas,
            cursor: 'pointer',
            minWidth: 0,
            flex: '1 1 auto',
            overflow: 'hidden',
            textAlign: 'left',
            boxShadow: open ? `0 0 0 1px ${selectAccent}` : undefined,
          }}
        >
          {mains.length === 0 ? (
            <span style={{ fontSize: 13, color: color.mute, whiteSpace: 'nowrap' }}>选择主分析产品与对比产品</span>
          ) : (
            <span style={{ display: 'flex', alignItems: 'center', flex: '1 1 auto', minWidth: 0, overflow: 'hidden' }}>
              {single ? (
                single.main ? (
                  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1, minWidth: 0, width: '100%', overflow: 'hidden' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: '100%' }}>
                      <BrandDot brand={brandOfModel(single.main.modelId)} />
                      <span
                        style={{
                          fontSize: 10, lineHeight: '12px', color: color.mute,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}
                      >
                        {brandLabelOf(brandOfModel(single.main.modelId))}
                      </span>
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: '100%', minWidth: 0, overflow: 'hidden' }}>
                      <span
                        style={{
                          flex: '1 100 auto',
                          minWidth: 0,
                          fontSize: 12, lineHeight: '15px', fontWeight: 600, color: color.ink,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}
                      >
                        {modelNameOf(single.main.modelId)}
                      </span>
                      {configTextOf(single.main.romram) && (
                        <span className="tnum" style={{ fontSize: 11, lineHeight: '15px', color: color.mute, flexShrink: 0 }}>
                          {configTextOf(single.main.romram)}
                        </span>
                      )}
                      <span style={{ fontSize: 11, lineHeight: '15px', color: color.mute, flexShrink: 0 }}>vs</span>
                      {/* 第一百九十轮（外部 UX 审计）：多平台子视图下无对比产品时示
                          「平台对比」（主图已按店铺画线）；产品对比子视图维持「无对比」 */}
                      <span
                        className="tnum"
                        style={{
                          fontSize: 11, lineHeight: '15px', fontWeight: 600,
                          color: single.compares.length || platformCompare ? color.body : color.mute, flexShrink: 0,
                        }}
                      >
                        {single.compares.length ? `${single.compares.length} 款对比` : platformCompare ? '平台对比' : '无对比'}
                      </span>
                    </span>
                  </span>
                ) : single.compares.length ? (
                  <span style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                    <span className="tnum" style={{ fontWeight: 600, color: color.body }}>
                      对比 {single.compares.length} 款
                    </span>
                    <span style={{ color: color.mute }}> · {EMPTY_MAIN_LABEL}</span>
                  </span>
                ) : (
                  <span style={{ fontSize: 12, color: color.mute, whiteSpace: 'nowrap' }}>{EMPTY_MAIN_LABEL}</span>
                )
              ) : (
                <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, width: '100%', overflow: 'hidden' }}>
                  {mains.slice(0, visibleGroups).map((m, i) => (
                    <span key={m.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 12, minWidth: 0, flex: '1 1 120px', maxWidth: 240, overflow: 'hidden' }}>
                      {i > 0 && <span aria-hidden style={{ width: 1, alignSelf: 'stretch', background: color.hairline, flexShrink: 0 }} />}
                      <GroupChip card={m} />
                    </span>
                  ))}
                  {mains.length > visibleGroups && (
                    <span style={{ fontSize: 12, lineHeight: '16px', color: color.mute, flexShrink: 0, whiteSpace: 'nowrap' }}>
                      ＋{mains.length - visibleGroups} 组
                    </span>
                  )}
                </span>
              )}
            </span>
          )}
          <DownOutlined style={{ marginLeft: 'auto', fontSize: 10, color: color.mute, flexShrink: 0 }} />
      </button>
    </ProductPickerFlyout>
  );
}

/** One global row: country and industry scope, then the unified product picker,
 *  then the global platform filter and currency. 第一百一十五轮：平台与币种收进
 *  顶部筛选条（各看板标题行不再重复），整行不换行——选择产品列弹性收缩，
 *  平台/币种定宽保底。
 *  第一百三十一轮波2：showTime = 时间筛选簇（仅价格看板与量价看板传入），
 *  币种右侧短分隔线后渲染；卡片根为 RangePicker 弹层挂载容器（向下展开）。
 *  2026-11-04（Eason 看图反馈）：周/月/季粒度切换从时间筛选簇弹层里移出，
 *  常驻筛选条币种右侧（GranularityBox Segmented 同款语言）；时间簇收窄让位
 *  （时间筛选器原日期范围区过宽），整行仍单行不换行。
 *  2026-11-05（Eason 指令）：全局平台 Select 常驻量价走势页（产品入口后第一位），
 *  写 state.platform 作用于看板下方所有产品；价格走势页不渲染——该页各线自带
 *  平台口径（自动=每周全网最低价 / 图例渠道 chip / 多平台对比视图），全局 Select
 *  在该页不消费（主线收口补丁：按当前页门控）。showPlatform 退役为 no-op
 *  （App 传参兼容）。 */
export default function FilterBar({
  showTime = false,
}: {
  showTime?: boolean;
  /** @deprecated 2026-11-05（Eason 指令）：全局平台筛选器改按当前页门控
   *  （仅量价走势页渲染），本 prop 不再控制任何渲染；仅为 App.AnalysisShell
   *  既有 `showPlatform={false}` 传参保留类型兼容 */
  showPlatform?: boolean;
} = {}) {
  const { page } = usePage();
  return (
    <div style={{ padding: `${space.md}px ${space.lg}px 0` }}>
      <ConfigProvider theme={filterBarTheme}>
        {/* 时间范围弹层锚定在其筛选簇自身（第一百四十二轮对齐修复），卡片根不再是定位容器 */}
        <section className="lpl-fb" style={{ background: color.canvas, boxShadow: shadow.l1, borderRadius: radius.card, padding: `8px ${space.lg}px` }}>
          {/* 第一百八十二轮：行允许换行（rowGap 8）——≥1280 视口仍单行不变；
              窄视口筛选簇折行而非把整页撑出横向裁切 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, rowGap: 8, minHeight: 30, flexWrap: 'wrap' }}>
            <ScopeFields />
            {/* 入口列弹性让位（第一百三十一轮波2收窄：basis 320→260、minWidth 240→200，
                时间簇定宽 310 入列后 1280 视口仍单行；chip 内部省略号兜底） */}
            <div style={{ flex: '1 1 260px', minWidth: 200, display: 'flex', alignItems: 'center' }}>
              <ProductPickerEntry />
            </div>
            {/* 全局平台筛选器（2026-11-05 Eason）：产品入口后第一位；选平台即作用
                于看板下方所有产品（每产品不可再单独选平台店铺）。定宽与原「平台 /
                店铺」槽同宽，选择产品列弹性收缩，1280 视口仍单行。
                渲染条件：量价走势页恒渲染；稳定版价格走势页也渲染（价格页全局
                平台化由 PriceTrend 侧 STABLE 门控实现，Eason 2026-11-05 复检
                拍板「先只针对稳定版」）；迭代版价格页保留每线平台模型不渲染 */}
            {(page === 'volume' || STABLE) && (
              <>
                <span aria-hidden style={{ width: 1, height: 20, background: color.hairline, flexShrink: 0 }} />
                <div style={{ flexShrink: 0, width: 188 }}><Field label="平台"><PlatformSelectBox /></Field></div>
              </>
            )}
            <span aria-hidden style={{ width: 1, height: 20, background: color.hairline, flexShrink: 0 }} />
            <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={labelStyle}>币种</span>
              <CurrencyBox />
            </div>
            {showTime && (
              <>
                <span aria-hidden style={{ width: 1, height: 20, background: color.hairline, flexShrink: 0 }} />
                {/* 粒度常驻（2026-11-04 Eason）：币种右侧直接可切，时间簇收窄让位 */}
                <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={labelStyle}>粒度</span>
                  <GranularityBox />
                </div>
                <span aria-hidden style={{ width: 1, height: 20, background: color.hairline, flexShrink: 0 }} />
                <TimeBox />
              </>
            )}
          </div>
        </section>
      </ConfigProvider>
    </div>
  );
}
