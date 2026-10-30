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
// ============================================================
import { useRef, useState, type ReactNode } from 'react';
import { ConfigProvider, Tooltip } from 'antd';
import type { ThemeConfig } from 'antd';
import { DownOutlined } from '@ant-design/icons';
import { color, radius, selectAccent, selectSoft, selectSoftInk, shadow, space } from '../../theme/tokens';
import PlatformBox from './PlatformBox';
import CurrencyBox from './CurrencyBox';
import ScopeFields from './ScopeFields';
import TimeBox from './TimeBox';
import ProductPickerFlyout from '../ProductPicker/ProductPickerModal';
import { useFilters } from '../../state/FiltersContext';
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

/** 多组紧凑 chip（第一百四十八轮拉齐图例药丸设计）：固定两行带品牌——
 *  第一行 = 品牌点 + 品牌名，第二行 = 型号 配置 vs 对比数（只读底色不变） */
function GroupChip({ card }: { card: MainProduct }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 1,
        padding: '3px 8px',
        borderRadius: radius.pill,
        background: 'rgba(0, 0, 0, 0.06)',
        flexShrink: 0,
        maxWidth: 260,
      }}
    >
      {card.main ? (
        <>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: '100%' }}>
            <BrandDot brand={brandOfModel(card.main.modelId)} />
            <span
              style={{
                fontSize: 10, lineHeight: '12px', color: color.mute,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}
            >
              {brandLabelOf(brandOfModel(card.main.modelId))}
            </span>
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: '100%', overflow: 'hidden' }}>
            <span
              style={{
                fontSize: 11, lineHeight: '14px', fontWeight: 600, color: color.ink,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}
            >
              {modelNameOf(card.main.modelId)}
            </span>
            {configTextOf(card.main.romram) && (
              <span className="tnum" style={{ fontSize: 10, lineHeight: '14px', color: color.mute, flexShrink: 0 }}>
                {configTextOf(card.main.romram)}
              </span>
            )}
            <span style={{ fontSize: 10, lineHeight: '14px', color: color.mute, flexShrink: 0 }}>vs</span>
            <span
              className="tnum"
              style={{ fontSize: 10, lineHeight: '14px', fontWeight: 600, color: card.compares.length ? color.body : color.mute, flexShrink: 0 }}
            >
              {card.compares.length ? card.compares.length : '无'}
            </span>
          </span>
        </>
      ) : (
        <span style={{ fontSize: 11, color: color.mute }}>{EMPTY_MAIN_LABEL}</span>
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
  const [open, setOpen] = useState(false);
  const mains = state.mains;
  const single = mains.length === 1 ? mains[0] : null;

  return (
    <ProductPickerFlyout open={open} onOpenChange={setOpen}>
      <button
        type="button"
        aria-label="选择产品"
        aria-haspopup="dialog"
        aria-expanded={open}
        title={mains.length ? mains.map(groupSummaryLine).join('\n') : '点击选择主分析产品与对比产品'}
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
            <span style={{ display: 'block', minWidth: 0, overflow: 'hidden' }}>
              {single ? (
                single.main ? (
                  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1, minWidth: 0 }}>
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
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: '100%', overflow: 'hidden' }}>
                      <span
                        style={{
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
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  {mains.slice(0, 2).map((m) => (
                    <GroupChip key={m.id} card={m} />
                  ))}
                  {mains.length > 2 && (
                    <span className="tnum" style={{ fontSize: 12, color: color.mute, flexShrink: 0, whiteSpace: 'nowrap' }}>
                      ＋{mains.length - 2} 组
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
 *  then platform and currency. 第一百一十五轮：平台与币种收进顶部筛选条（各看板
 *  标题行不再重复），整行不换行——选择产品列弹性收缩，平台/币种定宽保底。
 *  第一百三十一轮波2：showTime = 时间筛选簇（仅价格看板与量价看板传入），
 *  币种右侧短分隔线后渲染；卡片根为 RangePicker 弹层挂载容器（向下展开）。 */
export default function FilterBar({
  showTime = false,
  showPlatform = true,
}: {
  showTime?: boolean;
  /** 第一百六十轮：平台口径下沉到每条产品线（图例渠道 chip）后，价格看板与量价页
   *  不再渲染全局「平台 / 店铺」（false）；总览页矩阵筛选保留 */
  showPlatform?: boolean;
} = {}) {
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
            {showPlatform && (
              <>
                <span aria-hidden style={{ width: 1, height: 20, background: color.hairline, flexShrink: 0 }} />
                <div style={{ flexShrink: 0, width: 188 }}><Field label="平台 / 店铺"><PlatformBox /></Field></div>
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
                <TimeBox />
              </>
            )}
          </div>
        </section>
      </ConfigProvider>
    </div>
  );
}
