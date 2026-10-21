// ============================================================
// 筛选条（第一百一十七轮重构：统一产品选择入口）：
// 国家/产业 · 选择产品（浮窗：主分析卡 + 每卡对比区）· 平台 · 币种。
// 原「我司产品级联 vs 竞品级联 + 自动按钮」两个并列筛选器已于第一百一十七轮退役
// ——「我司比竞品」的主观预设退场，主分析/对比是用户指定的角色，
// 品牌列里华为与其他品牌并列。
// 第一百二十三轮：「按产品 | 按档位」Segmented 退役（档位融入选择产品浮窗的
// 树筛选与批量动作）；入口摘要改产品对语言——未选 / 单组（主品 vs 对比数）/
// 多组（前 2 组 chip + ＋N 组），一眼读出「选了什么、比了什么」。
// ============================================================
import { useState, type ReactNode } from 'react';
import { ConfigProvider, Tooltip } from 'antd';
import type { ThemeConfig } from 'antd';
import { DownOutlined } from '@ant-design/icons';
import { color, radius, selectAccent, selectSoft, selectSoftInk, shadow, space } from '../../theme/tokens';
import PlatformBox from './PlatformBox';
import CurrencyBox from './CurrencyBox';
import ScopeFields from './ScopeFields';
import ProductPickerModal from '../ProductPicker/ProductPickerModal';
import { useFilters } from '../../state/FiltersContext';
import { brandOfModel, modelNameOf, shortRomram } from '../ProductCascader/tree';
import BrandDot from '../BrandMark';
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
  const mainPart = m.main
    ? `${modelNameOf(m.main.modelId)}（${shortRomram(m.main.romram)}）`
    : EMPTY_MAIN_LABEL;
  const compPart = m.compares.length
    ? `对比 ${m.compares.map((c) => `${modelNameOf(c.modelId)}（${shortRomram(c.romram)}）`).join('、')}`
    : '无对比';
  return `第 ${i + 1} 组：${mainPart} vs ${compPart}`;
};

/** 多组紧凑 chip：品牌点 + 型号 配置 + vs + 对比数（只读底色，与只读配置 chip 同语言） */
function GroupChip({ card }: { card: MainProduct }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        height: 20,
        padding: '0 8px',
        borderRadius: radius.pill,
        background: 'rgba(0, 0, 0, 0.06)',
        whiteSpace: 'nowrap',
        flexShrink: 0,
        maxWidth: 260,
        overflow: 'hidden',
      }}
    >
      {card.main ? (
        <>
          <BrandDot brand={brandOfModel(card.main.modelId)} />
          <span style={{ fontSize: 12, fontWeight: 600, color: color.ink }}>{modelNameOf(card.main.modelId)}</span>
          <span className="tnum" style={{ fontSize: 11, color: color.mute }}>{shortRomram(card.main.romram)}</span>
        </>
      ) : (
        <span style={{ fontSize: 11, color: color.mute }}>{EMPTY_MAIN_LABEL}</span>
      )}
      <span style={{ fontSize: 11, color: color.mute }}>vs</span>
      <span className="tnum" style={{ fontSize: 11, fontWeight: 600, color: card.compares.length ? color.body : color.mute }}>
        {card.compares.length ? card.compares.length : '无'}
      </span>
    </span>
  );
}

/** 统一产品选择入口：摘要 chip → 点击弹「选择产品」浮窗。
 *  摘要 = 产品对语言三态：未选择（灰字引导）/ 单组（主品 + vs + 对比数）/
 *  多组（前 2 组紧凑 chip + ＋N 组），放不下整体省略号，悬停列全量。 */
function ProductPickerEntry() {
  const { state } = useFilters();
  const [open, setOpen] = useState(false);
  const mains = state.mains;
  const single = mains.length === 1 ? mains[0] : null;

  return (
    <>
      <Tooltip
        title={mains.length ? mains.map(groupSummaryLine).join('\n') : '点击选择主分析产品与对比产品'}
        styles={{ root: { whiteSpace: 'pre-line' } }}
      >
        <div
          role="button"
          aria-label="选择产品"
          onClick={() => setOpen(true)}
          style={{
            height: 30,
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
            boxShadow: open ? `0 0 0 1px ${selectAccent}` : undefined,
          }}
        >
          {mains.length === 0 ? (
            <span style={{ fontSize: 13, color: color.mute, whiteSpace: 'nowrap' }}>选择主分析产品与对比产品</span>
          ) : (
            <span
              style={{
                display: 'block',
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                lineHeight: '20px',
              }}
            >
              {single ? (
                single.main ? (
                  <>
                    <BrandDot brand={brandOfModel(single.main.modelId)} style={{ verticalAlign: 'middle', marginRight: 5 }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: color.ink }}>
                      {modelNameOf(single.main.modelId)}
                    </span>
                    <span className="tnum" style={{ fontSize: 12, color: color.mute }}> · {shortRomram(single.main.romram)}</span>
                    <span style={{ fontSize: 11, color: color.mute }}> vs </span>
                    <span
                      className="tnum"
                      style={{ fontSize: 12, fontWeight: 600, color: single.compares.length ? color.body : color.mute }}
                    >
                      {single.compares.length ? `${single.compares.length} 款对比` : '无对比'}
                    </span>
                  </>
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
                <>
                  {mains.slice(0, 2).map((m) => (
                    <GroupChip key={m.id} card={m} />
                  ))}
                  {mains.length > 2 && (
                    <span className="tnum" style={{ fontSize: 12, color: color.mute, marginLeft: 6, whiteSpace: 'nowrap' }}>
                      ＋{mains.length - 2} 组
                    </span>
                  )}
                </>
              )}
            </span>
          )}
          <DownOutlined style={{ marginLeft: 'auto', fontSize: 10, color: color.mute, flexShrink: 0 }} />
        </div>
      </Tooltip>
      <ProductPickerModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** One global row: country and industry scope, then the unified product picker,
 *  then platform and currency. 第一百一十五轮：平台与币种收进顶部筛选条（各看板
 *  标题行不再重复），整行不换行——选择产品列弹性收缩，平台/币种定宽保底。 */
export default function FilterBar() {
  return (
    <div style={{ padding: `${space.md}px ${space.lg}px 0` }}>
      <ConfigProvider theme={filterBarTheme}>
        <section className="lpl-fb" style={{ background: color.canvas, boxShadow: shadow.l1, borderRadius: radius.card, padding: `8px ${space.lg}px` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 30, flexWrap: 'nowrap' }}>
            <ScopeFields />
            <div style={{ flex: '1 1 320px', minWidth: 240, display: 'flex', alignItems: 'center' }}>
              <ProductPickerEntry />
            </div>
            <span aria-hidden style={{ width: 1, height: 20, background: color.hairline, flexShrink: 0 }} />
            <div style={{ flexShrink: 0, width: 168 }}><Field label="平台"><PlatformBox /></Field></div>
            <span aria-hidden style={{ width: 1, height: 20, background: color.hairline, flexShrink: 0 }} />
            <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={labelStyle}>币种</span>
              <CurrencyBox />
            </div>
          </div>
        </section>
      </ConfigProvider>
    </div>
  );
}
