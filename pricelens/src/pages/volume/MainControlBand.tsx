// ============================================================
// 量价页 · 主品视图顶部控制区（2026-11-03 Eason 改版）：明细卡行退役后，上方
// 工具行中区承载①产品显示/隐藏切换 + ②店铺切换——
// ①产品药丸：常驻同位切换（显示态实线描边、隐藏态虚线降透明），点击切换显隐；
//   语义与原明细卡身份胶囊（点击隐藏 → 暂存条恢复）一致，只是恢复不再跳暂存条、
//   原地再点即回；全隐藏仍走面板区空态「全部恢复」。className 保留 lpl-lg-pill
//   ——隐藏/恢复的焦点承接（panelPillHostRefs → button.lpl-lg-pill）按它定位。
// ②DNS 店铺 chip：明细卡身份区的同款原件迁入（ChannelSelectPopover 同源浮层），
//   onPick 仍回写 setSelectionPlatform → 面板取数随所选平台重算，数据流零改动。
// ③「进入本组对比」入口（GroupCompareEntry）：价格走势「多平台对比」同款轻量
//   文字钮（lpl-text-entry，悬停变墨）。
// 2026-11-04（Eason 看图反馈）：③入口改随胶囊组——entries 按 key 挂到对应
//   胶囊组之后（不再堆工具行最右端，多卡时逐格就位）；新增 gridColumns 网格
//   模式——列数 = 面板数、列距 = 面板网格同款 space.md，宿主把整条带放进与
//   面板网格同宽同偏移的行里，每个胶囊组即居中于其面板上方。两 prop 均可选，
//   不传 = 既有单行 flex 行为（组件级测试契约不变）。
// 本组件只改布局位置，不改任何取数/筛选数据流。
// ============================================================
import { Popover } from 'antd';
import { DownOutlined } from '@ant-design/icons';
import type { ReactNode } from 'react';
import BrandDot from '../../components/BrandMark';
import ChannelSelectPopover from '../../components/ChannelSelectPopover';
import type { PlatformSelection } from '../../state/filtersTypes';
import { color, radius, selectSoft, selectSoftInk, space } from '../../theme/tokens';

export interface MainControlBandItem {
  /** 面板 key（PanelSpec.key = modelId__配置去空格） */
  key: string;
  brand: string;
  /** 展示名（型号 + 配置，与面板头同源） */
  name: string;
  /** 产品名（去配置后缀） */
  nameText: string;
  /** 配置原文；'' 不出 chip */
  romText: string;
  /** 当前是否被隐藏（隐藏 = 虚线降透明，点击恢复） */
  hidden: boolean;
  /** DNS 店铺徽标（buildSeries 回显；null = 不出 chip） */
  channel: { label: string; auto: boolean } | null;
  channelCtl: {
    cc: string;
    skuIds: string[];
    current: PlatformSelection | null;
    onPick: (sel: PlatformSelection | null) => void;
    autoLabel?: string;
  } | null;
}

export default function MainControlBand(props: {
  items: MainControlBandItem[];
  /** 点击药丸 = 切换该产品显隐（宿主 setHiddenPanels） */
  onToggle: (key: string) => void;
  /** 药丸宿主节点上报（焦点承接契约：restoreAll 后焦点落回 button.lpl-lg-pill） */
  registerHost?: (key: string, el: HTMLSpanElement | null) => void;
  /** 「本组对比」入口随格（2026-11-04 Eason）：面板 key → 入口节点，渲染在该
   *  胶囊组之后；不传 = 不出入口 */
  entries?: ReadonlyMap<string, ReactNode>;
  /** 面板对齐网格模式（2026-11-04 Eason）：列数 = 面板数，列距 = 面板网格同款
   *  space.md——每格胶囊组居中于其面板上方；不传 = 既有单行 flex 居中排布 */
  gridColumns?: number;
  /** 网格列距（与面板网格 gap 同值：量价阅读视图面板间隙为 0，须同值对齐） */
  gridGap?: number;
}) {
  if (props.items.length === 0) return null;
  const grid = props.gridColumns != null && props.gridColumns > 0;
  return (
    <div
      role="group"
      aria-label="产品显示与隐藏"
      style={grid
        ? {
          display: 'grid',
          gridTemplateColumns: `repeat(${props.gridColumns}, minmax(0, 1fr))`,
          columnGap: props.gridGap ?? space.md,
          alignItems: 'center',
          minWidth: 0,
        }
        : { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'nowrap', minWidth: 0, maxWidth: '100%', overflow: 'hidden' }}
    >
      {props.items.map((item) => (
        <span
          key={item.key}
          ref={(el) => props.registerHost?.(item.key, el)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 1, minWidth: 0, justifySelf: grid ? 'center' : undefined, maxWidth: '100%' }}
        >
          {/* 单行身份胶囊（同明细卡原款）：品牌点 + 产品名 + 配置 chip；点击切换显隐 */}
          <button
            type="button"
            className="lpl-lg-pill"
            aria-pressed={!item.hidden}
            aria-label={item.hidden ? `恢复显示 ${item.name}` : `隐藏 ${item.name}`}
            title={item.hidden ? '点击恢复显示该产品' : '点击隐藏该产品'}
            onClick={() => props.onToggle(item.key)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              maxWidth: 180,
              padding: '3px 9px 3px 8px',
              border: `1px ${item.hidden ? 'dashed' : 'solid'} ${item.hidden ? color.hairlineStrong : color.hairline}`,
              borderRadius: radius.pill,
              background: color.canvas,
              font: 'inherit',
              minWidth: 0,
              cursor: 'pointer',
              opacity: item.hidden ? 0.55 : 1,
            }}
          >
            <BrandDot brand={item.brand} />
            <span
              title={item.name}
              style={{
                fontSize: 12,
                lineHeight: '16px',
                fontWeight: 600,
                color: color.ink,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {item.nameText}
            </span>
            {item.romText && (
              <span
                style={{
                  flexShrink: 0,
                  fontSize: 10,
                  lineHeight: '14px',
                  fontWeight: 600,
                  padding: '0 6px',
                  borderRadius: radius.pill,
                  color: selectSoftInk,
                  background: selectSoft,
                  whiteSpace: 'nowrap',
                }}
              >
                {item.romText}
              </span>
            )}
          </button>
          {/* DNS 店铺筛选 chip（明细卡拍板⑤原款迁入）：点开同款 ChannelSelectPopover */}
          {item.channel && item.channelCtl && (
            <Popover
              trigger="click"
              placement="bottomLeft"
              arrow={false}
              destroyOnHidden
              classNames={{ root: 'lpl-cascade-popover' }}
              styles={{ body: { padding: 0 } }}
              content={
                <ChannelSelectPopover
                  cc={item.channelCtl.cc}
                  skuIds={item.channelCtl.skuIds}
                  current={item.channelCtl.current}
                  onPick={item.channelCtl.onPick}
                  autoLabel={item.channelCtl.autoLabel}
                />
              }
            >
              <button
                type="button"
                aria-pressed={!item.channel.auto}
                aria-label={`取价平台：${item.channel.label}，点击筛选平台-店铺`}
                title={
                  item.channel.auto
                    ? `自动取价。当前主要来源平台：${item.channel.label}。点击修改平台、店铺或卖家`
                    : `取价平台：${item.channel.label}。点击修改平台、店铺或卖家`
                }
                onClick={(e) => e.stopPropagation()}
                style={{
                  flex: '0 0 auto',
                  height: 22,
                  maxWidth: 150,
                  padding: '0 8px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  border: `1px solid ${color.hairline}`,
                  borderRadius: radius.control,
                  background: color.canvas,
                  font: 'inherit',
                  fontSize: 11,
                  lineHeight: '16px',
                  fontWeight: 600,
                  color: color.body,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  cursor: 'pointer',
                }}
              >
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.channel.label}</span>
                <DownOutlined aria-hidden style={{ fontSize: 8, color: color.mute, flexShrink: 0 }} />
              </button>
            </Popover>
          )}
          {/* 「本组对比」入口随格（2026-11-04 Eason）：紧跟该胶囊组之后 */}
          {props.entries?.get(item.key)}
        </span>
      ))}
    </div>
  );
}

/** 「进入本组对比」入口：价格走势「多平台对比」同款轻量文字钮（lpl-text-entry，
 *  悬停变墨、不用胶囊选中形态——两边一体性）。aria-label 沿用原明细卡入口文案。 */
export function GroupCompareEntry(props: {
  /** 主品展示名（无障碍名里指明是哪张卡的组） */
  name: string;
  count: number;
  onEnter: () => void;
}) {
  return (
    <button
      type="button"
      className="lpl-text-entry"
      aria-label={`查看 ${props.name} 所在组的 ${props.count} 款对比产品`}
      title="切到本组对比：同一张量价卡内查看该主品与组内对比产品"
      onClick={props.onEnter}
      style={{
        border: 'none',
        background: 'transparent',
        font: 'inherit',
        fontSize: 12,
        color: color.body,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        padding: '4px 2px',
      }}
    >
      本组对比（{props.count}）→
    </button>
  );
}
