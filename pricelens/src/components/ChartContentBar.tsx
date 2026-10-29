// 图表卡片上沿的页签行（第一百八十三轮立；第一百八十四轮改版，Eason）：
// 「价格走势」与其子视图切换（多产品对比 / 多平台对比）包进同一组、共用一条
// 墨色下划线表达从属；子视图切换常驻——停在量价走势时仍显示价格走势当前的
// 子视图，点按即带子视图跳回。量价走势、定价推演为同级独立页签。
// 多产品对比、多平台对比是价格走势内部的两种看法；定价推演暂缓（并行改造中）。
import type { ReactNode } from 'react';
import { usePage } from '../state/PageContext';
import { useChartContent, type PriceSubview } from '../state/chartContent';
import { color, radius, space } from '../theme/tokens';

/** 页签文字（bare = 自带下划线让位给外层组，由组容器画线） */
function Tab({
  active,
  disabled,
  bare,
  onClick,
  children,
  title,
}: {
  active?: boolean;
  disabled?: boolean;
  bare?: boolean;
  onClick?: () => void;
  children: ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={disabled ? undefined : !!active}
      aria-disabled={disabled || undefined}
      title={title}
      onClick={disabled ? undefined : onClick}
      className="lpl-chart-tab"
      style={{
        height: 32,
        marginBottom: bare ? 0 : -1,
        padding: '0 2px',
        border: 'none',
        borderBottom: bare ? '2px solid transparent' : `2px solid ${active && !disabled ? color.ink : 'transparent'}`,
        background: 'transparent',
        color: disabled ? color.hairlineStrong : active ? color.ink : color.body,
        font: 'inherit',
        fontSize: 13,
        fontWeight: active && !disabled ? 600 : 400,
        cursor: disabled ? 'not-allowed' : 'pointer',
        whiteSpace: 'nowrap',
        transition: 'color 160ms ease, border-color 160ms ease, background-color 160ms ease',
      }}
    >
      {children}
    </button>
  );
}

/** 价格走势子视图切换（多产品对比 / 多平台对比）：轻量分段控件 */
function PriceViewSwitch({
  value,
  onChange,
}: {
  value: PriceSubview;
  onChange: (v: PriceSubview) => void;
}) {
  const options: { value: PriceSubview; label: string }[] = [
    { value: 'products', label: '多产品对比' },
    { value: 'platforms', label: '多平台对比' },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="价格走势"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: 2,
        borderRadius: radius.control,
        background: color.canvasSoft2,
      }}
    >
      {options.map((opt) => {
        const on = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(opt.value)}
            className="lpl-view-switch-option"
            style={{
              height: 22,
              padding: '0 10px',
              border: 'none',
              borderRadius: 4,
              background: on ? color.canvas : 'transparent',
              boxShadow: on ? '0 0 0 1px rgba(0,0,0,.06), 0 1px 1px rgba(0,0,0,.04)' : 'none',
              color: on ? color.ink : color.body,
              font: 'inherit',
              fontSize: 12,
              fontWeight: on ? 500 : 400,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'color 160ms ease, background-color 160ms ease, box-shadow 160ms ease',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export default function ChartContentBar() {
  const { page, go } = usePage();
  const { priceSubview, setPriceSubview } = useChartContent();
  const onPrice = page === 'dashboard';
  const volumeOn = page === 'volume';

  const openPrice = (): void => {
    if (page !== 'dashboard') go('dashboard');
  };
  const openVolume = (): void => {
    if (page !== 'volume') go('volume');
  };
  const pickPriceView = (v: PriceSubview): void => {
    setPriceSubview(v);
    if (page !== 'dashboard') go('dashboard');
  };

  return (
    <div>
      <div
        role="tablist"
        aria-label="图表内容"
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 22,
          padding: `10px ${space.lg}px 0`,
          borderBottom: `1px solid ${color.hairline}`,
        }}
      >
        {/* 价格走势 + 子视图切换同组（第一百八十四轮）：组容器画墨色下划线表达
            「多产品/多平台对比属于价格走势」；子视图常驻，停在量价时点按即带回 */}
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: -1,
            borderBottom: `2px solid ${onPrice ? color.ink : 'transparent'}`,
            transition: 'border-color 160ms ease',
          }}
        >
          <Tab bare active={onPrice} onClick={openPrice}>价格走势</Tab>
          <span style={{ display: 'inline-flex', alignItems: 'center', paddingBottom: 3 }}>
            <PriceViewSwitch value={priceSubview} onChange={pickPriceView} />
          </span>
        </span>
        <Tab active={volumeOn} onClick={openVolume}>量价走势</Tab>
        <Tab disabled title="即将开放">定价推演</Tab>
      </div>
    </div>
  );
}
