// ============================================================
// §4.1/§4.2 筛选条（反馈 2.1–2.6 重构；第二十八轮定版）：两行自然布局——
// 筛选器名称统一为「行外前缀标签」（12px 静音灰，左缘随卡片 padding 对齐），
// 控件吃掉单元格剩余宽度；不再使用框内绝对定位标签与 padding-left 让位。
// 匹配按钮归位：自动匹配开关紧跟竞品框（同格行内，
// 统一 92px 定宽保证双列对称）。筛选器之间不用分隔线，列间距 10px、
// 行距 12px（≥列距，两行有呼吸）。
// 宽度预算（宽度跟随内容，第二十八轮；第五十三轮平台 118→164 容「Ozon Россия」14px 全名不截断）：
//   第一行 min 合计 148+104+327+327+164 + 4×10 = 1110，加卡片 padding 48
//   ≤ 1232（1280 视口 − 页面 padding 48），1280 起零溢出；
//   弹性只归产品/竞品两格（高频主筛选），国家/产业/平台低基数定宽。
//   第二行 时间 min 544 + 币种 160 + 10 ≤ 1232；RangePicker 弹性但上限
//   560（内容 ~320，不再跑 1400px 空白跑道）。
// 反馈 2.4：嵌套 ConfigProvider 只包筛选条（浅蓝选中态），components.Button 回写
// colorPrimary=ink，主按钮保持 ink 黑。
// 默认导出与路径不得变更（Dashboard 引用）。
// ============================================================
import type { CSSProperties, ReactNode } from 'react';
import { ConfigProvider } from 'antd';
import type { ThemeConfig } from 'antd';
import { color, radius, selectAccent, selectSoft, selectSoftInk, shadow, space } from '../../theme/tokens';
import CountryBox from './CountryBox';
import PlatformBox from './PlatformBox';
import TimeBox from './TimeBox';
import CurrencyBox from './CurrencyBox';
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

/** 筛选条（§5）；图表侧（Agent C）消费 useFilters().state。
 *  第二十八轮定版：两行布局——第一行 国家｜产业｜产品｜竞品+自动匹配｜平台（第三十九轮删「匹配上一代」），
 *  时间/币种在第二行（时间弹性、币种靠右）。标签统一行外前缀，控件左缘全行对齐。
 *  第五十三轮：自动匹配开关挪到竞品级联之前；自动匹配开启时平台一并锁定置灰
 *  （竞品与平台都视为「已匹配」——平台跟随我司官方店铺 Ozon Россия）。 */
export default function FilterBar() {
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
            rowGap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', columnGap: 10, minWidth: 0 }}>
            <Cell flex="0 0 148px" min={148} label="国家">
              <CountryBox />
            </Cell>
            <Cell flex="0 0 104px" min={104} label="产业">
              <IndustryControl />
            </Cell>
            <ProductCell flex="1 1 327px" min={327} label="产品" info={INFO_OWN}>
              <OwnProductControl />
            </ProductCell>
            <ProductCell flex="1 1 327px" min={327} label="竞品" button={<AutoMatchControl />}>
              <CompetitorControl />
            </ProductCell>
            <Cell flex="0 0 164px" min={164} label="平台" info={INFO_PLATFORM}>
              <PlatformBox />
            </Cell>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', columnGap: 10, minWidth: 0 }}>
            <Cell flex="1 1 544px" min={544} label="时间">
              <TimeBox />
            </Cell>
            <Cell flex="0 0 160px" min={160} label="币种">
              <CurrencyBox />
            </Cell>
          </div>
        </section>
      </ConfigProvider>
    </div>
  );
}
