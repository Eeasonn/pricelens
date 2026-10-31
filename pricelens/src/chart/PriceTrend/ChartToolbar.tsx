// ============================================================
// 图顶工具行（第五十二轮单行三区 → 第五十四轮追补抽为独立组件）：
// 左 = 币种符号 + Y 轴设置齿轮（每格高度/刻度线/自动压缩/折线样式弹层）
//     + 折后价/RRP 粗细线胶囊；
// 右 = 大促档期 / offer 权益 圆框组 + 「多平台比价」胶囊按钮 + 「⋯ 更多」二级菜单。
// 第五十六轮（领导页面清洁要求）：最高/最低价、价格变化提醒不是主要功能——
// 从常驻圆框组撤出，收进「⋯ 更多」Popover（默认关闭；启用时 ⋯ 按钮带蓝点
// 提示有隐藏的激活功能）。
// 本轮：多平台比价从 ⋯ 菜单上浮为带文字的胶囊按钮（单一显性入口，避免分叉）；
// ⋯ 菜单只保留最高/最低价标注与价格变化提醒两个开关。
// 第五十四轮追补（用户反馈）：
// ① 圆框组居右（原 margin auto 居中）——右侧空间留白可读性更好；
// ② 阈值数值占位定宽（≥ 5% / ≥ 12.5% 同宽）——拖滑杆时组宽不再逐帧抖动；
// ③ 分离模式下本行在面板网格上方常驻一条（index 层渲染），统一控制全部面板，
//    面板内不再渲染各自的设置行（Chart chrome=false）。
// 第一百八十三轮（Eason，两行定版）：pills 模式 = 药丸行专属——药丸区居中。
// 本轮（Eason 拍板回退+上移）：①齿轮与「隐藏对比产品」上移到工具行（大促/权益
// 那一行）居左——新增 cluster 模式（只出左簇）；②分离模式药丸带回归各面板内
// （index 层），pills 模式只在合并模式渲染、仅承载药丸；③圆形图标钮 20 → 24，
// 与 small 按钮/Segmented 同高（隐藏对比产品此前 61px 过高，改 24）。
// 第一百九十轮（外部 UX 审计落地）：齿轮「Y 轴显示设置」与「⋯ 更多」两处弹层
// 改受控 + useTopEscClose——此前非受控 trigger="click" 自身不响应 Esc（外层
// 浮窗又已让位给它），Esc 成死区；现每次 Esc 只关最上层弹层、焦点归还触发按钮。
// ============================================================
import { Button, Checkbox, ConfigProvider, Popover, Segmented, Slider } from 'antd';
import { MoreOutlined, ProfileOutlined, SettingOutlined } from '@ant-design/icons';
import { forwardRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import type { CurrencyMode } from '../../dataModel/types';
import { filterBarTheme } from '../../components/FilterBar';
import { useTopEscClose } from '../../components/ProductPicker/pickerBits';
import { color, radius } from '../../theme/tokens';
import type { LineShapeChoice } from './chartModel';
import ScaleSlider from './ScaleSlider';

export interface ChartToolbarProps {
  /** 布局槽位：all = 单行全套（齿轮+插槽 左、大促/⋯ 右，量价/多平台图表内用）；
   *  actions = 只显示右侧功能；cluster = 只显示左簇（齿轮+隐藏对比产品）；
   *  pills = 药丸行（合并模式专用，仅居中图例）。 */
  mode?: 'all' | 'actions' | 'pills' | 'cluster';
  /** 顶部居中的系列页签（由看板层注入，避免页签占用图表底部时间区域）。
   *  第一百七十八轮起 = 看板合并模式把产品药丸带注入工具行中区（行内居中、
   *  底部与折后价/RRP 对齐），不再是绝对定位浮层 */
  legend?: ReactNode;
  /** 以下齿轮弹层所需项仅在渲染齿轮的模式（all/cluster）必传；pills 纯药丸行可省 */
  currency?: CurrencyMode;
  sliderScale?: number;
  onSliderScale?: (v: number) => void;
  /** Y 刻度线（第九十一轮恢复）：开 = 刻度值+短横线；关 = 仅价格档位（居中整块） */
  showYTicks?: boolean;
  onShowYTicks?: (v: boolean) => void;
  /** 价格档位带开关（第一百九十三轮，Eason）：与 Y 刻度线独立，两个轴各自显隐 */
  showTiers?: boolean;
  onShowTiers?: (v: boolean) => void;
  yCompress?: boolean;
  onYCompress?: (v: boolean) => void;
  lineShape?: LineShapeChoice;
  onLineShape?: (v: LineShapeChoice) => void;
  /** 折后价/RRP 显隐（收进 ⋯ 菜单，控件外形与原先工具行胶囊一致；默认只显示折后价） */
  priceTypes?: { discounted: boolean; rrp: boolean };
  onPriceTypeToggle?: (key: 'discounted' | 'rrp', next: boolean) => void;
  /** 齿轮之后的插槽：全局「隐藏对比产品」（cluster/all 模式下与齿轮同簇） */
  priceTypesAfter?: ReactNode;
  /** 行尾次级入口插槽（第一百八十九轮定版）：多平台对比入口/返回钮——分隔线 +
      轻量文字钮，与大促/权益显示设置同排但不混入 ⋯ 菜单，保证可发现性 */
  compareEntry?: ReactNode;
  /** 悬停页签比率（收进 ⋯；默认周环比） */
  tipMode?: 'discount' | 'wow';
  onTipMode?: (v: 'discount' | 'wow') => void;
  /** 图上价格标签密度（收进 ⋯；默认精简） */
  labelMode?: 'detail' | 'compact';
  onLabelMode?: (v: 'detail' | 'compact') => void;
  /** 时点摘要（收进 ⋯；默认隐藏）。不传 onPointPanelToggle = 菜单里不出现 */
  pointPanelOpen?: boolean;
  onPointPanelToggle?: () => void;
  /** 中区圆框组：三个回调全传才渲染（下钻弹窗等不传 = 不渲染）。
   *  最高/最低价标注删除（本轮，Eason） */
  promoBandsOn?: boolean;
  onPromoBandsOn?: (v: boolean) => void;
  offersOn?: boolean;
  onOffersOn?: (v: boolean) => void;
  changeThreshold?: number | null;
  onChangeThreshold?: (v: number | null) => void;
  /** ⋯ 更多菜单只保留价格变化提醒开关。
   *  时点摘要（PointPanel）自第112轮起由标题行「时点摘要」按钮手动展开 */
}

/** 折后价/RRP 切换胶囊（第五十二轮）：图例页签同款外形，品牌色点的位置改「一条粗 /
 *  一条细」的线演示——粗线 = 折后价主价（图上 3px/2px）、细线 = RRP 参照（图上 1.5px/1px），
 *  与图上两级线宽一一对应；关闭态 = 虚线边 + 降透明（与图例隐藏态同语言） */
function PriceTypePill(props: { on: boolean; thick?: boolean; label: string; title: string; onToggle: (next: boolean) => void }) {
  return (
    <button
      type="button"
      aria-pressed={props.on}
      title={props.title}
      onClick={(e) => {
        e.stopPropagation();
        props.onToggle(!props.on);
      }}
      className="lpl-hit"
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        height: 20,
        padding: '0 8px',
        fontSize: 11,
        lineHeight: '18px',
        borderRadius: radius.pill,
        cursor: 'pointer',
        flexShrink: 0,
        background: color.canvas,
        border: `1px ${props.on ? 'solid' : 'dashed'} ${props.on ? color.hairline : color.hairlineStrong}`,
        opacity: props.on ? 1 : 0.45,
        transition: 'border-color 160ms ease, background-color 160ms ease, opacity 160ms ease, box-shadow 160ms ease',
      }}
    >
      <span
        aria-hidden
        style={{ width: 14, height: 0, borderTop: props.thick ? '3px solid #171717' : '1.5px solid #6b6b6b', borderRadius: 2 }}
      />
      <span style={{ color: color.body }}>{props.label}</span>
    </button>
  );
}

/** 阈值数值占位宽：滑杆 0~15%、0.5 步进，最长文案「≥ 12.5%」；
 *  定宽后拖动滑杆组宽恒定（第五十四轮追补，用户反馈逐帧抖动） */
const THRESHOLD_TEXT_W = 48;

/** 与左区齿轮同款 20px 圆框图标按钮（第五十六轮「⋯ 更多」复用同一视觉语言）。
 *  必须转发 props.onClick——antd Popover 靠 cloneElement 往子元素注入 wrapper
 *  onClick 来开关弹层，组件内硬编码 onClick 会把 wrapper 丢弃 = 弹层点不开
 *  （wrapper 内部会链回本组件的 origin onClick，兜底 stopPropagation 仍生效）。
 *  同时必须 forwardRef——Popover 要挂 ref 定位锚点 */
const RoundIconButton = forwardRef<HTMLButtonElement, {
  title: string;
  'aria-label': string;
  active?: boolean; // true = 右上角蓝点（有收起的二级功能处于开启态）
  /** 外部注入的点击处理（Popover 的 wrapper）；缺省兜底阻断冒泡 */
  onClick?: (e: ReactMouseEvent) => void;
  children: ReactNode;
}>(function RoundIconButton(props, ref) {
  return (
    <button
      ref={ref}
      type="button"
      title={props.title}
      aria-label={props['aria-label']}
      onClick={props.onClick ?? ((e: ReactMouseEvent) => e.stopPropagation())}
      className="lpl-toolbar-icon"
      style={{
        width: 24,
        height: 24, // 本轮起与 small 按钮/Segmented 同高（原 20，与邻按钮不齐）
        display: 'grid',
        placeItems: 'center',
        padding: 0,
        border: `1px solid ${color.hairline}`,
        borderRadius: 4,
        background: color.canvas,
        color: color.mute,
        cursor: 'pointer',
        position: 'relative',
        flexShrink: 0,
        transition: 'border-color 160ms ease, background-color 160ms ease, color 160ms ease, box-shadow 160ms ease',
      }}
    >
      {props.children}
      {props.active && (
        <i
          aria-hidden
          style={{
            position: 'absolute',
            top: -2.5,
            right: -2.5,
            width: 6,
            height: 6,
            borderRadius: radius.pill,
            background: '#0070f3',
            boxShadow: `0 0 0 1.5px ${color.canvas}`,
          }}
        />
      )}
    </button>
  );
});

export default function ChartToolbar(props: ChartToolbarProps) {
  const mode = props.mode ?? 'all';
  const showLeft = mode === 'all' || mode === 'cluster';
  const showRight = mode === 'all' || mode === 'actions';
  const showPromo = props.onPromoBandsOn != null && props.onOffersOn != null;
  const showMarks = props.onChangeThreshold != null;
  const hasDisplay =
    props.onPriceTypeToggle != null ||
    props.onTipMode != null ||
    props.onLabelMode != null ||
    props.onPointPanelToggle != null;
  const showMore = hasDisplay || showMarks;
  // 收进 ⋯ 的项离开默认值，或标注开关打开 = 按钮右上角蓝点
  const secondaryActive =
    (props.onPriceTypeToggle != null && props.priceTypes != null && (!props.priceTypes.discounted || props.priceTypes.rrp)) ||
    (props.onTipMode != null && props.tipMode === 'discount') ||
    (props.onLabelMode != null && props.labelMode === 'detail') ||
    props.pointPanelOpen === true ||
    props.changeThreshold != null;
  const gearDirty =
    (props.sliderScale != null && Math.abs(props.sliderScale - 1) > 0.001) ||
    props.showYTicks === false ||
    (props.currency === 'usd' && props.showTiers === false) ||
    props.yCompress === true ||
    (props.lineShape != null && props.lineShape !== 'auto');
  // 变化提醒阈值滑杆：拖动中仅本地跟随显示（滑杆/数值），松手才提交持久配置
  // ——与每格高度滑杆「松手生效」同一语言，避免拖动全程逐帧触发提醒重算
  const [dragThreshold, setDragThreshold] = useState<number | null>(null);
  // 第一百九十轮（外部 UX 审计落地）：两处弹层改受控并接 Esc 分层关闭——
  // useTopEscClose 仅栈顶浮层响应 Esc（多浮层叠加时不连关），关闭时焦点
  // 归还触发按钮。状态提升到组件体顶层（gearCtl/moreCtl 只是内联 JSX 常量）
  const [gearOpen, setGearOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  useTopEscClose(gearOpen, () => setGearOpen(false));
  useTopEscClose(moreOpen, () => setMoreOpen(false));
  // 左区齿轮弹层（每格高度/刻度线/自动压缩/折线样式）；pills 模式下与「隐藏对比品」
  // 按钮同簇渲染（下方分支），其余模式原地渲染
  const gearCtl = (
    <Popover
      trigger="click"
      open={gearOpen}
      onOpenChange={setGearOpen}
      placement="bottomLeft"
      content={
        <div style={{ width: 236 }}>
          <div style={{ fontSize: 12, color: color.mute, marginBottom: 8 }}>每格高度</div>
          <ScaleSlider scale={props.sliderScale ?? 1} onCommit={props.onSliderScale ?? (() => {})} />
          <div style={{ fontSize: 11, color: color.mute, marginTop: 8 }}>松手生效 · 双击复位</div>
          <div style={{ borderTop: `1px solid ${color.hairline}`, margin: '10px 0' }} />
          <Checkbox checked={props.showYTicks ?? true} onChange={(e) => props.onShowYTicks?.(e.target.checked)}>
            <span style={{ fontSize: 12 }}>Y 刻度线</span>
          </Checkbox>
          {/* 价格档位只存在于 USD。本币没有这根轴，开关也不出现。 */}
          {props.currency === 'usd' && (
            <Checkbox checked={props.showTiers ?? true} onChange={(e) => props.onShowTiers?.(e.target.checked)}>
              <span style={{ fontSize: 12 }}>价格档位</span>
            </Checkbox>
          )}
          <div style={{ fontSize: 11, color: color.mute, marginTop: 3, lineHeight: '16px' }}>
            {props.currency === 'usd' ? '数值刻度与价格档位可分别显示' : '关闭后 Y 轴刻度与上下限一起收起'}
          </div>
          <div style={{ marginTop: 6 }}>
            <Checkbox checked={props.yCompress ?? false} onChange={(e) => props.onYCompress?.(e.target.checked)}>
              <span style={{ fontSize: 12 }}>Y 轴自动压缩</span>
            </Checkbox>
            <div style={{ fontSize: 11, color: color.mute, marginTop: 4, lineHeight: '16px' }}>
              差距悬殊的价格段之间自动压缩空白；默认关 = 完整连续展示
            </div>
          </div>
          <div style={{ borderTop: `1px solid ${color.hairline}`, margin: '10px 0' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 12, color: color.mute }}>折线样式</span>
            <Segmented
              size="small"
              value={props.lineShape ?? 'auto'}
              onChange={(v) => props.onLineShape?.(v as LineShapeChoice)}
              options={[
                { label: '自适应', value: 'auto' },
                { label: '阶梯', value: 'step' },
                { label: '平滑', value: 'smooth' },
              ]}
            />
          </div>
          <div style={{ fontSize: 11, color: color.mute, marginTop: 4, lineHeight: '16px' }}>
            自适应 = 周度阶梯、月/季平滑（默认）；阶梯 = 方形折角；平滑 = 圆滑曲线
          </div>
        </div>
      }
    >
      <RoundIconButton title={gearDirty ? 'Y 轴显示设置（已修改）' : 'Y 轴显示设置'} aria-label="Y 轴显示设置" active={gearDirty}>
        <SettingOutlined style={{ fontSize: 12 }} />
      </RoundIconButton>
    </Popover>
  );
  return (
    <div
      className="lpl-toolbar"
      style={{
        position: 'relative',
        display: 'flex',
        columnGap: 8,
        alignItems: 'center',
        width: '100%',
        minHeight: props.legend ? 54 : 32,
        justifyContent: mode === 'actions' ? 'flex-end' : undefined,
      }}
    >
      {/* 币种符号随第一百七十八轮退役（Eason：金钱标志删除，齿轮左对齐 Y 轴） */}
      {showLeft && (
        <>
          {gearCtl}
          {/* 齿轮之后：隐藏对比产品（折后价/RRP 已收进 ⋯） */}
          {props.priceTypesAfter}
        </>
      )}
      {props.legend && (
        // 中区：产品药丸带占余宽居中（左右各留边界）。pills 模式 = 合并模式的
        // 药丸行（本轮起不再带齿轮/按钮——已上移工具行左簇）
        <div
          style={{
            flex: '1 1 auto',
            minWidth: 0,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            overflow: 'hidden',
            padding: '0 16px',
          }}
        >
          {props.legend}
        </div>
      )}
      {/* 功能键同一排：大促档期、促销权益，然后 ⋯。折后价/页签/价格显示/时点摘要在 ⋯ 内，
          控件外形与原先露在外面时一致。 */}
      {showRight && showPromo && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '2px 10px',
            border: `1px solid ${color.hairline}`,
            borderRadius: radius.pill,
            background: color.canvas,
            flexShrink: 0,
            whiteSpace: 'nowrap',
            marginLeft: 'auto',
          }}
        >
          <Checkbox checked={props.promoBandsOn} onChange={(e) => props.onPromoBandsOn!(e.target.checked)}>
            <span style={{ fontSize: 12 }}>大促档期</span>
          </Checkbox>
          <Checkbox checked={props.offersOn} onChange={(e) => props.onOffersOn!(e.target.checked)}>
            <span style={{ fontSize: 12 }}>促销权益</span>
          </Checkbox>
        </div>
      )}
      {showRight && showMore && (
        // 无中区圆框组的页面（量价/部分内嵌图）⋯ 靠右收尾，与看板第一行同构；
        // 有圆框组时它已带 marginLeft auto，⋯ 自然跟在其后
        <span style={{ marginLeft: showPromo ? undefined : 'auto', display: 'inline-flex', flexShrink: 0 }}>
        <Popover
          trigger="click"
          open={moreOpen}
          onOpenChange={setMoreOpen}
          placement="bottomLeft"
          content={
            <ConfigProvider theme={filterBarTheme}>
              <div style={{ width: 280, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12 }}>
                {props.onPriceTypeToggle && props.priceTypes != null && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <PriceTypePill
                      on={props.priceTypes.discounted}
                      thick
                      label="折后价"
                      title="折后价 = 可抓取平台最低在架价（主价线，粗）"
                      onToggle={(next) => props.onPriceTypeToggle!('discounted', next)}
                    />
                    <PriceTypePill
                      on={props.priceTypes.rrp}
                      label="RRP"
                      title="RRP = 官方建议零售价（参照线，细实线）"
                      onToggle={(next) => props.onPriceTypeToggle!('rrp', next)}
                    />
                  </span>
                )}
                {props.onTipMode && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: color.mute, fontSize: 12 }}>
                    页签显示{' '}
                    <Segmented
                      size="small"
                      value={props.tipMode ?? 'wow'}
                      onChange={(v) => props.onTipMode!(v as 'discount' | 'wow')}
                      options={[
                        { label: '折扣率', value: 'discount' },
                        { label: '周环比', value: 'wow' },
                      ]}
                    />
                  </span>
                )}
                {props.onLabelMode && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: color.mute, fontSize: 12 }}>
                    价格显示{' '}
                    <Segmented
                      size="small"
                      value={props.labelMode ?? 'compact'}
                      onChange={(v) => props.onLabelMode!(v as 'detail' | 'compact')}
                      options={[
                        { label: '精简', value: 'compact' },
                        { label: '详细', value: 'detail' },
                      ]}
                    />
                  </span>
                )}
                {props.onPointPanelToggle && (
                  <Button
                    size="small"
                    icon={<ProfileOutlined />}
                    type={props.pointPanelOpen ? 'primary' : 'default'}
                    onClick={props.onPointPanelToggle}
                    title="各产品最新折扣、现价、RRP 与来源"
                  >
                    时点摘要
                  </Button>
                )}
                {showMarks && (
                  <div style={{ width: '100%', borderTop: hasDisplay ? `1px solid ${color.hairline}` : undefined, paddingTop: hasDisplay ? 10 : 0 }}>
                    <div>
                      <Checkbox
                        checked={props.changeThreshold != null}
                        onChange={(e) => props.onChangeThreshold!(e.target.checked ? 0.05 : null)}
                      >
                        <span style={{ fontSize: 12 }}>价格变化提醒</span>
                      </Checkbox>
                      <div style={{ fontSize: 11, color: color.mute, marginTop: 3, lineHeight: '16px' }}>
                        涨跌超过阈值时在点位标注 ↓/↑
                      </div>
                      {props.changeThreshold != null && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                          <Slider
                            style={{ width: 150, margin: '0 2px' }}
                            min={0}
                            max={15}
                            step={0.5}
                            value={dragThreshold ?? +(props.changeThreshold * 100).toFixed(1)}
                            onChange={(v) => setDragThreshold(+(v as number))}
                            onAfterChange={(v) => {
                              setDragThreshold(null);
                              props.onChangeThreshold!(+(v as number) / 100);
                            }}
                            tooltip={{ formatter: (v) => `≥ ${v ?? 0}%` }}
                          />
                          <span
                            className="tnum"
                            style={{ fontSize: 11, color: color.mute, whiteSpace: 'nowrap', display: 'inline-block', width: THRESHOLD_TEXT_W }}
                          >
                            ≥ {dragThreshold ?? +(props.changeThreshold * 100).toFixed(1)}%
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </ConfigProvider>
          }
        >
          <RoundIconButton
            title="折后价 / 页签显示 / 价格显示 / 时点摘要"
            aria-label="更多显示选项"
            active={secondaryActive}
          >
            <MoreOutlined style={{ fontSize: 12 }} />
          </RoundIconButton>
        </Popover>
        </span>
      )}
      {showRight && props.compareEntry && (
        // 第一百八十九轮（Eason 定版）：多平台对比入口收在工具行最右端——
        // 与显示设置之间一根 hairline 分隔线，保持次级功能的可发现性
        <>
          <span aria-hidden style={{ width: 1, height: 20, background: color.hairline, flexShrink: 0 }} />
          {props.compareEntry}
        </>
      )}
    </div>
  );
}
