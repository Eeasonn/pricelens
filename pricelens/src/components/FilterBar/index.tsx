// ============================================================
// §4.1/§4.2 筛选条（反馈 2.1–2.6 重构）：五组筛选器收进单张白底卡片，
// 从左往右 国家｜产业｜华为产品｜竞品产品｜平台｜时间｜币种，右侧自然留白；
// 筛选器之间仅用 1px hairline 竖线分隔（FilterDivider，不顶满卡高）；
// 每格「标题 20 + 间距 8 + 控件 32」统一行高 → 控件行底部对齐（FilterCell）。
// 反馈 2.1：产业收起为下拉单选（IndustryControl，~102px）。
// 反馈 2.4：嵌套 ConfigProvider 只包筛选条，把选中/悬停/聚焦态改为浅蓝
// （selectSoft 系 token）；components.Button 回写 colorPrimary=ink，
// 主按钮（SKU 弹框「完成」）保持 ink 黑，不影响图表 chips 与全局。
// 宽度预算（100% 缩放、Dashboard minWidth 1440 容器内不溢出）：
// 卡内 120+102+226+226+132+324+104 = 1234 + 6 条分隔线（17×6=102）= 1336
// ≤ 1344（卡片内容区）；+ 卡片 padding 48 + 外层 padding 48 = 1432 ≤ 1440。
// 超长文字统一省略号 + Tooltip（CascadeTrigger/Select 原生）。
// 默认导出与路径不得变更（Dashboard 引用）。
// ============================================================
import { ConfigProvider } from 'antd';
import type { ThemeConfig } from 'antd';
import { color, radius, selectAccent, selectSoft, selectSoftInk, shadow, space } from '../../theme/tokens';
import { FilterCell, FilterDivider } from './FilterCell';
import CountryBox from './CountryBox';
import PlatformBox from './PlatformBox';
import TimeBox from './TimeBox';
import CurrencyBox from './CurrencyBox';
import { CompetitorControl, IndustryControl, MatchCompetitorButton, MatchPrevGenButton, OwnProductControl } from './ProductBox';

/** §5.3 平台框标题感叹号说明（文案逐字照抄 spec） */
const INFO_PLATFORM = '当未筛选平台时，显示该国家下最低价格的平台结果';
/** §5.2 框二华为产品标题感叹号说明（文案逐字照抄 spec） */
const INFO_OWN = '默认筛选价格最低的产品颜色';

/**
 * 仅筛选条作用域的浅蓝选中态（反馈 2.4）：
 * - token.colorPrimary → 聚焦边框 / Checkbox·Radio 勾选 / RangePicker 选中范围与面板选中格
 * - Select/Cascader 组件级 optionSelectedBg/Color → 下拉选项选中底/字
 * - Segmented 组件级 itemSelectedBg/Color → 选中块浅蓝底深蓝字
 * - components.Button.colorPrimary 回写 ink：主按钮（SKU 弹框「完成」）保持黑
 */
const filterBarTheme: ThemeConfig = {
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

/** 筛选条（§5）；图表侧（Agent C）消费 useFilters().state */
export default function FilterBar() {
  return (
    <div style={{ padding: `${space.base}px ${space.lg}px 0` }}>
      <ConfigProvider theme={filterBarTheme}>
        <section
          style={{
            background: color.canvas,
            boxShadow: shadow.l1,
            borderRadius: radius.card,
            padding: `${space.base}px ${space.lg}px`,
            display: 'flex',
            alignItems: 'flex-end',
            overflow: 'hidden',
          }}
        >
          <FilterCell title="国家" width={112}>
            <CountryBox />
          </FilterCell>
          <FilterDivider />
          <FilterCell title="产业" width={96}>
            <IndustryControl />
          </FilterCell>
          <FilterDivider />
          <FilterCell title="华为产品" info={INFO_OWN} width={226} extra={<MatchPrevGenButton />}>
            <OwnProductControl />
          </FilterCell>
          <FilterDivider />
          <FilterCell title="竞品产品" width={226} extra={<MatchCompetitorButton />}>
            <CompetitorControl />
          </FilterCell>
          <FilterDivider />
          <FilterCell title="平台" info={INFO_PLATFORM} width={124}>
            <PlatformBox />
          </FilterCell>
          <FilterDivider />
          <FilterCell title="时间" width={352}>
            <TimeBox />
          </FilterCell>
          <FilterDivider />
          <FilterCell title="币种" width={96}>
            <CurrencyBox />
          </FilterCell>
        </section>
      </ConfigProvider>
    </div>
  );
}
