// ============================================================
// §4.1/§4.2 筛选条（反馈 2.1–2.6 重构；第二十八轮两行定版 → 第五十七轮单行定版）：
// 领导反馈「筛选器太多」——主行只留高频四格：产品 ｜ 竞品（+自动匹配）｜ 季/月/周 ｜ 筛选。
// 次级筛选项（国家/产业/平台/币种/时间范围/自适应）收进「筛选」Popover；
// 有任一项偏离默认时按钮出数字角标（不改状态也能看出当前口径被调过）。
// 筛选器名称统一为「行外前缀标签」（12px 静音灰）；列间距 10px。
// 宽度预算：327+327+约150(粒度)+约92(筛选钮) + 标签/间距 ≈ 990 ≤ 1232（1280 视口）。
// 反馈 2.4：嵌套 ConfigProvider 只包筛选条（浅蓝选中态），components.Button 回写
// colorPrimary=ink，主按钮保持 ink 黑。
// 默认导出与路径不得变更（Dashboard 引用）。
// ============================================================
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { ConfigProvider, Popover } from 'antd';
import type { ThemeConfig } from 'antd';
import { color, radius, selectAccent, selectSoft, selectSoftInk, shadow, space } from '../../theme/tokens';
import { DEFAULT_PLATFORM_SELECTION, useFilters } from '../../state/FiltersContext';
import CountryBox from './CountryBox';
import PlatformBox from './PlatformBox';
import CurrencyBox from './CurrencyBox';
import { GranularityControl, RangeControl } from './TimeBox';
import { AutoMatchControl, CompetitorControl, IndustryControl, OwnProductControl } from './ProductBox';

/** §5.3 平台框说明（原感叹号文案，降级为悬停提示） */
const INFO_PLATFORM = '当未筛选平台时，显示该国家下最低价格的平台结果';
/** §5.2 框二华为产品说明（原感叹号文案，降级为悬停提示） */
const INFO_OWN = '默认筛选价格最低的产品颜色';

/**
 * 仅筛选条作用域的浅蓝选中态（反馈 2.4）：
 * - token.colorPrimary → 聚焦边框 / Checkbox·Radio 勾选 / RangePicker 选中范围与面板选中格
 * - Select/Cascader 组件级 optionSelectedBg/Color → 下拉选项选中底/字
 * - Segmented 组件级 itemSelectedBg/Color → 选中块浅蓝底深蓝字
 * - components.Button.colorPrimary 回写 ink：主按钮（SKU 弹框「完成」）保持黑
 */
/** 总览筛选行复用同一浅蓝选中态（第三十八轮导出） */
export const filterBarTheme: ThemeConfig = {
  token: {
    colorPrimary: selectAccent,
  },
  components: {
    Button: { colorPrimary: color.ink },
    Segmented: { itemSelectedBg: selectSoft, itemSelectedColor: selectSoftInk },
    Select: { optionSelectedBg: selectSoft, optionSelectedColor: selectSoftInk },
    Cascader: { optionSelectedBg: selectSoft, optionSelectedColor: selectSoftInk },
  },
};

/** 筛选器名称：12px 静音灰前缀标签（所有筛选器统一外置于控件左侧） */
const filterLabel: CSSProperties = { fontSize: 12, color: color.mute, flexShrink: 0, whiteSpace: 'nowrap' };

/** 单元格：外置前缀标签 + 单行 32px 控件；info 降级为原生 title 悬停提示 */
function Cell({ flex, min, label, info, children }: { flex: string; min?: number; label: string; info?: string; children: ReactNode }) {
  return (
    <div title={info} style={{ flex, minWidth: min ?? 0, boxSizing: 'border-box', height: 32, display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={filterLabel}>{label}</span>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}

/** 产品格：外置前缀标签 + 级联；button 给出时排在控件**之前**
 *  （第五十三轮：自动匹配开关挪到竞品级联前面——先表态「跟不跟随」，再选竞品） */
function ProductCell({
  flex,
  min,
  label,
  info,
  button,
  children,
}: {
  flex: string;
  min: number;
  label: string;
  info?: string;
  button?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div title={info} style={{ flex, minWidth: min ?? 0, height: 32, display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={filterLabel}>{label}</span>
      {button}
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}

/** 次级筛选有偏离默认项的数量（第五十七轮）：币种≠USD / 自适应关 / 国家≠RU / 平台≠默认官方店 */
function useSecondaryCount(): number {
  const { state } = useFilters();
  return useMemo(() => {
    let n = 0;
    if (state.currency !== 'usd') n += 1;
    if (!state.adaptive) n += 1;
    if (state.countryCode !== 'RU') n += 1;
    if (JSON.stringify(state.platform) !== JSON.stringify(DEFAULT_PLATFORM_SELECTION)) n += 1;
    return n;
  }, [state.currency, state.adaptive, state.countryCode, state.platform]);
}

/** 次级筛选弹层（第五十七轮）：国家/产业/平台/币种/时间范围+自适应——低频项统一收纳 */
function SecondaryFilters() {
  return (
    <div style={{ width: 424, display: 'flex', flexDirection: 'column', gap: 10, padding: '2px 2px 4px' }}>
      <div style={{ display: 'flex', alignItems: 'center', columnGap: 10 }}>
        <Cell flex="0 0 148px" min={148} label="国家">
          <CountryBox />
        </Cell>
        <Cell flex="0 0 104px" min={104} label="产业">
          <IndustryControl />
        </Cell>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', columnGap: 10 }}>
        <Cell flex="0 0 164px" min={164} label="平台" info={INFO_PLATFORM}>
          <PlatformBox />
        </Cell>
        <Cell flex="0 0 160px" min={160} label="币种">
          <CurrencyBox />
        </Cell>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', columnGap: 10 }}>
        <span style={filterLabel}>范围</span>
        <div style={{ flex: 1, minWidth: 0, display: 'flex' }}>
          <RangeControl />
        </div>
      </div>
    </div>
  );
}

/** 筛选条（§5）；图表侧（Agent C）消费 useFilters().state。
 *  第五十七轮定版（领导反馈筛选器太多）：单行布局——产品 ｜ 竞品（+自动匹配）｜ 季/月/周 ｜ 筛选。
 *  国家/产业/平台/币种/时间范围/自适应收进「筛选」Popover；有偏离默认项时按钮带数字角标。
 *  第五十三轮：自动匹配开关在竞品级联之前；自动匹配开启时平台一并锁定置灰。 */
export default function FilterBar() {
  const secondaryCount = useSecondaryCount();
  const [open, setOpen] = useState(false);
  return (
    <div style={{ padding: `${space.base}px ${space.lg}px 0` }}>
      <ConfigProvider theme={filterBarTheme}>
        <section
          className="lpl-fb"
          style={{
            background: color.canvas,
            boxShadow: shadow.l1,
            borderRadius: radius.card,
            padding: `${space.sm}px ${space.lg}px`,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', columnGap: 10, minWidth: 0 }}>
            <ProductCell flex="1 1 327px" min={327} label="产品" info={INFO_OWN}>
              <OwnProductControl />
            </ProductCell>
            <ProductCell flex="1 1 327px" min={327} label="竞品" button={<AutoMatchControl />}>
              <CompetitorControl />
            </ProductCell>
            <Cell flex="0 0 auto" min={0} label="时间">
              <GranularityControl />
            </Cell>
            <Popover
              trigger="click"
              placement="bottomRight"
              open={open}
              onOpenChange={setOpen}
              content={<SecondaryFilters />}
              arrow={false}
            >
              <button
                type="button"
                title="国家 / 产业 / 平台 / 币种 / 时间范围"
                aria-label={`更多筛选${secondaryCount > 0 ? `（${secondaryCount} 项已调整）` : ''}`}
                style={{
                  flexShrink: 0,
                  height: 32,
                  padding: '0 12px',
                  borderRadius: radius.control,
                  border: `1px solid ${secondaryCount > 0 ? selectAccent : color.hairline}`,
                  background: secondaryCount > 0 ? selectSoft : color.canvas,
                  color: secondaryCount > 0 ? selectSoftInk : color.body,
                  fontSize: 12.5,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                筛选
                {secondaryCount > 0 && (
                  <span
                    className="tnum"
                    style={{
                      minWidth: 16,
                      height: 16,
                      padding: '0 4px',
                      borderRadius: 8,
                      background: selectAccent,
                      color: '#fff',
                      fontSize: 10.5,
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {secondaryCount}
                  </span>
                )}
              </button>
            </Popover>
          </div>
        </section>
      </ConfigProvider>
    </div>
  );
}
