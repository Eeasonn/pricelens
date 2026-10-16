// ============================================================
// §4.1/§4.2 筛选条（两行 → 单行 → 上下文条 → 第六十三轮标题融合版）：
// 「分析谁」升格为页面标题级——第一行 = 价格走势 · [产品] vs [竞品]（17px/700，
// 虚线底线词块，点击弹原级联面板）；第二行 = 口径行（12px 灰）：
// 范围（国家·产业）｜ 粒度 · 币种（虚线词块弹 Segmented）｜ 平台 · 范围自适应
// （弹各自面板）｜ ⋯ 口径（国家/产业低频项 + 偏离默认角标）。
// 筛选器从「一排框」变成「页面的自我陈述」；国家/产业作为范围声明常显。
// 反馈 2.4：嵌套 ConfigProvider 浅蓝选中态；filterBarTheme 导出给总览复用。
// 默认导出与路径不得变更（Dashboard 引用）。
// ============================================================
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { ConfigProvider, Popover } from 'antd';
import { MoreOutlined } from '@ant-design/icons';
import type { ThemeConfig } from 'antd';
import { color, radius, selectAccent, selectSoft, selectSoftInk, shadow, space } from '../../theme/tokens';
import { useFilters } from '../../state/FiltersContext';
import { modelNameOf } from '../ProductCascader/tree';
import { dimChannel } from '../../data';
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

/** 筛选器名称：12px 静音灰前缀标签（弹层内控件统一外置于控件左侧） */
const filterLabel: CSSProperties = { fontSize: 12, color: color.mute, flexShrink: 0, whiteSpace: 'nowrap' };

/** 弹层内单元格：外置前缀标签 + 单行 32px 控件；info 降级为原生 title 悬停提示 */
function Cell({ flex, min, label, info, children }: { flex: string; min?: number; label: string; info?: string; children: ReactNode }) {
  return (
    <div title={info} style={{ flex, minWidth: min ?? 0, boxSizing: 'border-box', height: 32, display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={filterLabel}>{label}</span>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}

/** 组间竖隔线（1×14 灰，时点页签同语言） */
function Sep({ h = 14 }: { h?: number }) {
  return <span aria-hidden style={{ width: 1, height: h, background: color.hairlineStrong, flexShrink: 0 }} />;
}

/** 虚线底线词块（第六十三轮）：网页链接语言的可点文字——静置灰色虚线底线，
 *  悬停变品牌蓝实线；点击弹选择面板。big = 标题级（17px/700）。 */
function LinkToken(props: {
  label: ReactNode;
  title: string;
  big?: boolean;
  muted?: boolean;
  content: ReactNode;
}) {
  const [hover, setHover] = useState(false);
  return (
    <Popover trigger="click" placement="bottomLeft" content={props.content} arrow={false}>
      <span
        role="button"
        title={props.title}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          fontSize: props.big ? 17 : props.muted ? 12.5 : 13,
          fontWeight: props.big ? 700 : props.muted ? 500 : 600,
          color: hover ? '#0070f3' : props.muted ? color.body : color.ink,
          borderBottom: `1px ${hover ? 'solid' : 'dashed'} ${hover ? '#0070f3' : '#bfbfbf'}`,
          paddingBottom: 1,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
        }}
      >
        {props.label}
      </span>
    </Popover>
  );
}

/** ⋯ 口径弹层内有偏离默认项的数量（第六十三轮起只数隐藏项：国家/产业；
 *  粒度/币种/平台/自适应的值已常显在口径行，无需角标） */
function useSecondaryCount(): number {
  const { state } = useFilters();
  return useMemo(
    () => (state.countryCode !== 'RU' ? 1 : 0) + (state.industry !== 'phone' ? 1 : 0),
    [state.countryCode, state.industry],
  );
}

/** ⋯ 口径弹层：国家/产业（低频改） */
function MoreFilters() {
  return (
    <div style={{ width: 300, display: 'flex', flexDirection: 'column', gap: 10, padding: '2px 2px 4px' }}>
      <div style={{ display: 'flex', alignItems: 'center', columnGap: 10 }}>
        <Cell flex="0 0 148px" min={148} label="国家">
          <CountryBox />
        </Cell>
        <Cell flex="0 0 104px" min={104} label="产业">
          <IndustryControl />
        </Cell>
      </div>
    </div>
  );
}

/** 口径行静默段（不可点纯文字） */
function Plain({ children }: { children: ReactNode }) {
  return <span style={{ color: color.body, whiteSpace: 'nowrap' }}>{children}</span>;
}

/** 筛选上下文条（§5）；图表侧消费 useFilters().state。
 *  第六十三轮定版（方案三 · 标题融合）：第一行 = 价格走势 · 产品 vs 竞品（标题级词块），
 *  第二行 = 口径行（范围｜粒度·币种｜平台·自适应｜⋯ 口径）。 */
export default function FilterBar() {
  const { state } = useFilters();
  const secondaryCount = useSecondaryCount();

  const scope = `${state.countryCode === 'RU' ? '欧亚 / R国' : state.countryCode} · ${state.industry === 'phone' ? '手机' : state.industry}`;
  const productLabel = state.own.length
    ? state.own.map((s0) => `${modelNameOf(s0.modelId)} ${s0.romram}`).join('、')
    : '选择产品';
  const compModels = [...new Set(state.competitors.map((c) => modelNameOf(c.modelId)))];
  const compLabel = compModels.length
    ? compModels.slice(0, 3).join(' · ') + (compModels.length > 3 ? ` +${compModels.length - 3}` : '')
    : '匹配竞品';
  const granLabel = state.granularity === 'week' ? '周' : state.granularity === 'month' ? '月' : '季';

  // 平台口径文案：勾店铺显店铺名、勾平台显平台名、全空 = 可抓取平台最低价
  const shopNameById = useMemo(() => new Map(dimChannel.map((c) => [c.shop_id, c.shop_name])), []);
  const sel = state.platform;
  const platformText = !sel || (sel.platforms.length === 0 && sel.shopIds.length === 0)
    ? '平台最低价'
    : sel.shopIds.length
      ? sel.shopIds.map((id) => shopNameById.get(id) ?? id).join('、')
      : `${sel.platforms.join('、')} 平台`;
  const adaptiveText = state.adaptive ? '范围自适应' : '范围手动';

  return (
    <div style={{ padding: `${space.base}px ${space.lg}px 0` }}>
      <ConfigProvider theme={filterBarTheme}>
        <section
          className="lpl-fb"
          style={{
            background: color.canvas,
            boxShadow: shadow.l1,
            borderRadius: radius.card,
            padding: `10px ${space.lg}px 9px`,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            minWidth: 0,
          }}
        >
          {/* 第一行（标题级）：分析谁 */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, minWidth: 0 }}>
            <span style={{ fontSize: 17, fontWeight: 700, color: color.ink, whiteSpace: 'nowrap' }}>价格走势</span>
            <span style={{ color: color.hairlineStrong }}>·</span>
            <LinkToken
              big
              label={productLabel}
              title="选择我司产品与配置"
              content={
                <div style={{ width: 384 }}>
                  <OwnProductControl />
                </div>
              }
            />
            <span style={{ fontSize: 12, color: color.mute }}>vs</span>
            <LinkToken
              label={compLabel}
              muted={state.competitors.length === 0}
              title="选择对标竞品（自动匹配开启时随我司配置带出）"
              content={
                <div style={{ width: 384, display: 'flex', flexDirection: 'column', gap: 10, padding: '2px 2px 4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: color.mute, flexShrink: 0 }}>自动匹配</span>
                    <AutoMatchControl />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <CompetitorControl />
                  </div>
                </div>
              }
            />
          </div>
          {/* 第二行（口径行）：怎么看的数据，全部常显 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5, color: color.mute, minWidth: 0 }}>
            <Plain>{scope}</Plain>
            <Sep h={11} />
            <LinkToken muted label={granLabel} title="时间粒度" content={<div style={{ padding: '2px 2px 4px' }}><GranularityControl /></div>} />
            <span>·</span>
            <LinkToken muted label={state.currency === 'usd' ? 'USD' : '本币 ₽'} title="显示币种" content={<div style={{ padding: '2px 2px 4px' }}><CurrencyBox /></div>} />
            <Sep h={11} />
            <LinkToken
              muted
              label={
                <>
                  平台 <Plain>{platformText}</Plain>
                </>
              }
              title={INFO_PLATFORM}
              content={
                <div style={{ width: 348 }}>
                  <Cell flex="1 1 auto" label="平台" info={INFO_PLATFORM}>
                    <PlatformBox />
                  </Cell>
                </div>
              }
            />
            <Sep h={11} />
            <LinkToken
              muted
              label={<Plain>{adaptiveText}</Plain>}
              title="开：时间范围自动适配所选产品跨度；关：手动选择时间范围"
              content={
                <div style={{ width: 400, display: 'flex', flexDirection: 'column', gap: 10, padding: '2px 2px 4px' }}>
                  <span style={filterLabel}>时间范围</span>
                  <RangeControl />
                </div>
              }
            />
            <span style={{ flex: 1 }} />
            <Popover trigger="click" placement="bottomRight" content={<MoreFilters />} arrow={false}>
              <button
                type="button"
                title="国家 / 产业"
                aria-label={`更多口径${secondaryCount > 0 ? `（${secondaryCount} 项已调整）` : ''}`}
                style={{
                  flexShrink: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  height: 24,
                  padding: '0 8px',
                  borderRadius: radius.control,
                  border: `1px solid ${secondaryCount > 0 ? selectAccent : 'transparent'}`,
                  background: secondaryCount > 0 ? selectSoft : 'transparent',
                  color: secondaryCount > 0 ? selectSoftInk : color.mute,
                  fontSize: 12,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  position: 'relative',
                }}
              >
                <MoreOutlined style={{ fontSize: 12 }} />
                口径
                {secondaryCount > 0 && (
                  <i
                    aria-hidden
                    style={{
                      position: 'absolute',
                      top: -4,
                      right: -4,
                      minWidth: 14,
                      height: 14,
                      padding: '0 3px',
                      borderRadius: 7,
                      background: selectAccent,
                      color: '#fff',
                      fontSize: 9.5,
                      fontWeight: 700,
                      fontStyle: 'normal',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {secondaryCount}
                  </i>
                )}
              </button>
            </Popover>
          </div>
        </section>
      </ConfigProvider>
    </div>
  );
}
