// ============================================================
// §4.1/§4.2 筛选条（第二十八轮两行 → 第五十七轮单行 → 第五十九轮上下文条）：
// 领导反馈「筛选器不直观、国家/产业是重要信息」——筛选框整体降格为一行
// 可点击的上下文声明（token 式）：
//   欧亚 / R国 · 手机 ｜ [产品 ▾] vs [竞品 ▾] ｜ [周 ▾] [USD ▾]  ⋯
// · 国家/产业 = 常显文字上下文（当前各仅一个可选值，实为范围声明；仍在 ⋯ 内可改）
// · 产品/竞品 = 词块点击弹原有级联；自动匹配开关在竞品弹层内
// · 粒度/币种 = 词块点击弹 Segmented
// · 低频（平台/时间范围+自适应）收进行尾 ⋯（偏离默认出数字角标）
// 反馈 2.4：嵌套 ConfigProvider 浅蓝选中态；filterBarTheme 导出给总览复用。
// 默认导出与路径不得变更（Dashboard 引用）。
// ============================================================
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { ConfigProvider, Popover } from 'antd';
import { DownOutlined, MoreOutlined } from '@ant-design/icons';
import type { ThemeConfig } from 'antd';
import { color, radius, selectAccent, selectSoft, selectSoftInk, shadow, space } from '../../theme/tokens';
import { DEFAULT_PLATFORM_SELECTION, useFilters } from '../../state/FiltersContext';
import { modelNameOf } from '../ProductCascader/tree';
import CountryBox from './CountryBox';
import PlatformBox from './PlatformBox';
import CurrencyBox from './CurrencyBox';
import { GranularityControl, RangeControl } from './TimeBox';
import { AutoMatchControl, CompetitorControl, IndustryControl, OwnProductControl } from './ProductBox';
import type { Granularity } from '../../dataModel/types';

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

/** ⋯ 弹层内有偏离默认项的数量（第五十九轮）：国家≠RU / 产业≠phone / 平台≠默认官方店 / 自适应关。
 *  粒度/币种已升格为常显词块（值直接可见），不再计数。 */
function useSecondaryCount(): number {
  const { state } = useFilters();
  return useMemo(() => {
    let n = 0;
    if (!state.adaptive) n += 1;
    if (state.countryCode !== 'RU') n += 1;
    if (state.industry !== 'phone') n += 1;
    if (JSON.stringify(state.platform) !== JSON.stringify(DEFAULT_PLATFORM_SELECTION)) n += 1;
    return n;
  }, [state.adaptive, state.countryCode, state.industry, state.platform]);
}

/** ⋯ 口径弹层（第五十九轮）：国家/产业（低频改）/平台/时间范围+自适应 */
function MoreFilters() {
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

/** 词块（第五十九轮）：文字 + 下拉箭头的轻量按钮——点击弹选择面板。
 *  视觉 = 行内文字的延伸（无粗框），hover 提亮描边示意可点。 */
function Token({
  label,
  title,
  muted,
  children,
}: {
  label: ReactNode;
  title: string;
  muted?: boolean;
  children: ReactNode;
}) {
  const [hover, setHover] = useState(false);
  return (
    <Popover trigger="click" placement="bottomLeft" content={children} arrow={false}>
      <button
        type="button"
        title={title}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          height: 26,
          padding: '0 8px',
          borderRadius: radius.control,
          border: `1px solid ${hover ? selectAccent : 'transparent'}`,
          background: hover ? color.canvasSoft : 'transparent',
          color: muted ? color.mute : color.ink,
          fontSize: 13,
          fontWeight: 600,
          fontFamily: 'inherit',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          maxWidth: 340,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <DownOutlined style={{ fontSize: 8, color: color.mute, flexShrink: 0 }} />
      </button>
    </Popover>
  );
}

/** 组间竖隔线（时点页签同语言：1×14 灰） */
const Sep = <span aria-hidden style={{ width: 1, height: 14, background: color.hairlineStrong, flexShrink: 0 }} />;

/** 筛选上下文条（§5）；图表侧消费 useFilters().state。
 *  第五十九轮定版：一行可点击的上下文声明——国家/产业常显文字，产品/竞品/粒度/币种
 *  为词块（点击弹原选择面板），低频项收行尾 ⋯（偏离默认出数字角标）。 */
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
  const granLabel = (g: Granularity) => (g === 'week' ? '周' : g === 'month' ? '月' : '季');

  return (
    <div style={{ padding: `${space.base}px ${space.lg}px 0` }}>
      <ConfigProvider theme={filterBarTheme}>
        <section
          className="lpl-fb"
          style={{
            background: color.canvas,
            boxShadow: shadow.l1,
            borderRadius: radius.card,
            padding: `8px ${space.lg}px`,
            display: 'flex',
            alignItems: 'center',
            columnGap: 12,
            minWidth: 0,
            overflowX: 'auto',
          }}
        >
          {/* 范围上下文（国家 · 产业）：常显文字，值在 ⋯ 内可改 */}
          <span
            title="分析范围：国家 · 产业（在行尾 ⋯ 内可调整）"
            style={{ fontSize: 13, fontWeight: 600, color: color.ink, whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            {scope}
          </span>
          {Sep}
          {/* 产品 ｜ 竞品（对比关系用 vs 文字直陈） */}
          <Token label={productLabel} title="选择我司产品与配置">
            <div style={{ width: 384 }}>
              <OwnProductControl />
            </div>
          </Token>
          <span style={{ fontSize: 12, color: color.mute, flexShrink: 0 }}>vs</span>
          <Token label={compLabel} title="选择对标竞品（自动匹配开启时随我司配置带出）" muted={state.competitors.length === 0}>
            <div style={{ width: 384, display: 'flex', flexDirection: 'column', gap: 10, padding: '2px 2px 4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: color.mute, flexShrink: 0 }}>自动匹配</span>
                <AutoMatchControl />
              </div>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <CompetitorControl />
              </div>
            </div>
          </Token>
          {Sep}
          {/* 粒度 ｜ 币种 */}
          <Token label={granLabel(state.granularity)} title="时间粒度">
            <div style={{ padding: '2px 2px 4px' }}>
              <GranularityControl />
            </div>
          </Token>
          <Token label={state.currency === 'usd' ? 'USD' : '本币 ₽'} title="显示币种">
            <div style={{ padding: '2px 2px 4px' }}>
              <CurrencyBox />
            </div>
          </Token>
          {/* 行尾 ⋯：低频口径（国家/产业/平台/时间范围+自适应）+ 偏离默认角标 */}
          <span style={{ flex: 1 }} />
          <Popover trigger="click" placement="bottomRight" content={<MoreFilters />} arrow={false}>
            <button
              type="button"
              title="国家 / 产业 / 平台 / 时间范围"
              aria-label={`更多筛选${secondaryCount > 0 ? `（${secondaryCount} 项已调整）` : ''}`}
              style={{
                flexShrink: 0,
                width: 28,
                height: 26,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                borderRadius: radius.control,
                border: `1px solid ${secondaryCount > 0 ? selectAccent : 'transparent'}`,
                background: secondaryCount > 0 ? selectSoft : 'transparent',
                color: secondaryCount > 0 ? selectSoftInk : color.mute,
                cursor: 'pointer',
                position: 'relative',
              }}
            >
              <MoreOutlined style={{ fontSize: 13 }} />
              {secondaryCount > 0 && (
                <i
                  aria-hidden
                  style={{
                    position: 'absolute',
                    top: -3,
                    right: -3,
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
        </section>
      </ConfigProvider>
    </div>
  );
}
