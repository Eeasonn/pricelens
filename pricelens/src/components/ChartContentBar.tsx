// 图表卡片上沿的导航行：价格走势 / 量价走势 / 量价预测 三个平级页签。
// 第一百八十九轮定版（Eason，收敛此前双层页签讨论）：价格走势默认承载多产品
// 对比，常驻「多产品对比」子页签退役；多平台对比降为图表工具行右端的轻量文字
// 入口（ChartToolbar.compareEntry），进入后原位变「← 返回多产品对比」——主导航
// 任意时刻只有一处选中（墨色 + 600 字重 + 墨色下划线），不再有父子双高亮。
// 点「价格走势」永远落回多产品对比；在多平台对比中主导航仍只有「价格走势」选中。
// 量价预测沿用独立页面承载，保留在图表导航中作为快捷入口。
import { usePage } from '../state/PageContext';
import { useChartContent } from '../state/chartContent';
import { color, space } from '../theme/tokens';

/** 导航页签：文字 + 墨色下划线表达当前项（aria-current，不依赖颜色单一表达） */
function Tab({
  active,
  disabled,
  onClick,
  children,
  title,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      aria-current={active && !disabled ? 'page' : undefined}
      aria-disabled={disabled || undefined}
      title={title}
      onClick={disabled ? undefined : onClick}
      className="lpl-chart-tab"
      style={{
        height: 32,
        marginBottom: -1,
        padding: '0 2px',
        border: 'none',
        borderBottom: `2px solid ${active && !disabled ? color.ink : 'transparent'}`,
        background: 'transparent',
        color: disabled ? color.hairlineStrong : active ? color.ink : color.body,
        font: 'inherit',
        fontSize: 13,
        fontWeight: active && !disabled ? 600 : 400,
        cursor: disabled ? 'not-allowed' : 'pointer',
        whiteSpace: 'nowrap',
        transition: 'color 160ms ease, border-color 160ms ease',
      }}
    >
      {children}
    </button>
  );
}

export default function ChartContentBar() {
  const { page, go } = usePage();
  const { setPriceSubview } = useChartContent();
  const priceOn = page === 'dashboard';
  const volumeOn = page === 'volume';
  const forecastOn = page === 'forecast';

  const openPrice = (): void => {
    // 恒落回多产品对比（189 定版状态规则）：从量价走势返回、在多平台对比中点
    // 主导航，都回到多产品视图；多平台自身的筛选由入口/返回钮管理
    setPriceSubview('products');
    if (page !== 'dashboard') go('dashboard');
  };
  const openVolume = (): void => {
    if (page !== 'volume') go('volume');
  };

  const openForecast = (): void => {
    if (page !== 'forecast') go('forecast');
  };

  return (
    <nav
      aria-label="图表内容"
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: 22,
        padding: `10px ${space.lg}px 0`,
        borderBottom: `1px solid ${color.hairline}`,
      }}
    >
      <Tab active={priceOn} onClick={openPrice}>价格走势</Tab>
      <Tab active={volumeOn} onClick={openVolume}>量价走势</Tab>
      <Tab active={forecastOn} onClick={openForecast}>量价预测</Tab>
    </nav>
  );
}
