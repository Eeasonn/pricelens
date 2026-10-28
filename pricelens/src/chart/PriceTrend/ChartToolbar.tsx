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
// ============================================================
import { Checkbox, Popover, Segmented, Slider } from 'antd';
import { MoreOutlined, SettingOutlined } from '@ant-design/icons';
import { forwardRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import type { CurrencyMode } from '../../dataModel/types';
import { color, radius } from '../../theme/tokens';
import type { LineShapeChoice } from './chartModel';
import ScaleSlider from './ScaleSlider';

export interface ChartToolbarProps {
  /** 顶部居中的系列页签（由看板层注入，避免页签占用图表底部时间区域）。
   *  第一百七十八轮起 = 看板合并模式把产品药丸带注入工具行中区（行内居中、
   *  底部与折后价/RRP 对齐），不再是绝对定位浮层 */
  legend?: ReactNode;
  currency: CurrencyMode;
  sliderScale: number;
  onSliderScale: (v: number) => void;
  /** Y 刻度线（第九十一轮恢复）：开 = 刻度值+短横线；关 = 仅价格档位（居中整块） */
  showYTicks: boolean;
  onShowYTicks: (v: boolean) => void;
  yCompress: boolean;
  onYCompress: (v: boolean) => void;
  lineShape: LineShapeChoice;
  onLineShape: (v: LineShapeChoice) => void;
  /** 折后价/RRP 显隐切换（传 onPriceTypeToggle 才渲染左区粗/细线胶囊） */
  priceTypes: { discounted: boolean; rrp: boolean };
  onPriceTypeToggle?: (key: 'discounted' | 'rrp', next: boolean) => void;
  /** RRP 胶囊之后的插槽（第一百七十八轮，Eason）：短竖线 + 全局「仅查看主产品」
   *  由看板层传入（标题行不再承担） */
  priceTypesAfter?: ReactNode;
  /** 中区圆框组：四个回调全传才渲染（下钻弹窗等不传 = 不渲染） */
  promoBandsOn?: boolean;
  onPromoBandsOn?: (v: boolean) => void;
  offersOn?: boolean;
  onOffersOn?: (v: boolean) => void;
  maxMinOn?: boolean;
  onMaxMinOn?: (v: boolean) => void;
  changeThreshold?: number | null;
  onChangeThreshold?: (v: number | null) => void;
  /** ⋯ 更多菜单只保留两个次级开关（最高/最低价标注 + 价格变化提醒）。
   *  时点摘要（PointPanel）自第112轮起由标题行「时点摘要」按钮手动展开 */
}

/** 折后价/RRP 切换胶囊（第五十二轮）：图例页签同款外形，品牌色点的位置改「一条粗 /
 *  一条细」的线演示——粗线 = 折后价主价（图上 3px/2px）、细线 = RRP 参照（图上 1.5px/1px），
 *  与图上两级线宽一一对应；关闭态 = 虚线边 + 降透明（与图例隐藏态同语言） */
function PriceTypePill(props: { on: boolean; thick?: boolean; label: string; title: string; onToggle: (next: boolean) => void }) {
  return (
    <span
      role="button"
      title={props.title}
      onClick={(e) => {
        e.stopPropagation();
        props.onToggle(!props.on);
      }}
      style={{
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
      }}
    >
      <span
        aria-hidden
        style={{ width: 14, height: 0, borderTop: props.thick ? '3px solid #171717' : '1.5px solid #6b6b6b', borderRadius: 2 }}
      />
      <span style={{ color: color.body }}>{props.label}</span>
    </span>
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
      style={{
        width: 20,
        height: 20,
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
  const toolbarOn =
    props.onPromoBandsOn != null &&
    props.onOffersOn != null &&
    props.onMaxMinOn != null &&
    props.onChangeThreshold != null;
  // 二级功能有任一开启 = ⋯ 按钮出蓝点（默认全关，第五十六轮）
  const secondaryActive = (props.maxMinOn === true) || (props.changeThreshold != null);
  // 变化提醒阈值滑杆：拖动中仅本地跟随显示（滑杆/数值），松手才提交持久配置
  // ——与每格高度滑杆「松手生效」同一语言，避免拖动全程逐帧触发提醒重算
  const [dragThreshold, setDragThreshold] = useState<number | null>(null);
  return (
    // 底部对齐（第一百七十八轮，Eason）：中区产品药丸带比左右控件高，行内所有
    // 元素底缘对齐 = 药丸带底部与 RRP 胶囊底部同线
    <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', gap: 8, width: '100%' }}>
      {/* 币种符号随第一百七十八轮退役（Eason：金钱标志删除，齿轮左对齐 Y 轴） */}
      <Popover
        trigger="click"
        placement="bottomLeft"
        content={
          <div style={{ width: 236 }}>
            <div style={{ fontSize: 12, color: color.mute, marginBottom: 8 }}>每格高度</div>
            <ScaleSlider scale={props.sliderScale} onCommit={props.onSliderScale} />
            <div style={{ fontSize: 11, color: color.mute, marginTop: 8 }}>松手生效 · 双击复位</div>
            <div style={{ borderTop: `1px solid ${color.hairline}`, margin: '10px 0' }} />
            <Checkbox checked={props.showYTicks} onChange={(e) => props.onShowYTicks(e.target.checked)}>
              <span style={{ fontSize: 12 }}>Y 刻度线</span>
            </Checkbox>
            <div style={{ fontSize: 11, color: color.mute, marginTop: 3, lineHeight: '16px' }}>
              关闭后仅保留价格档位
            </div>
            <div style={{ marginTop: 6 }}>
              <Checkbox checked={props.yCompress} onChange={(e) => props.onYCompress(e.target.checked)}>
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
                value={props.lineShape}
                onChange={(v) => props.onLineShape(v as LineShapeChoice)}
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
        <RoundIconButton title="Y 轴显示设置" aria-label="Y 轴显示设置">
          <SettingOutlined style={{ fontSize: 12 }} />
        </RoundIconButton>
      </Popover>
      {/* 左区：折后价/RRP 粗细线胶囊（第五十二轮挪入图内，替代标题行复选框） */}
      {props.onPriceTypeToggle && (
        <>
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
        </>
      )}
      {/* RRP 之后的插槽（第一百七十八轮，Eason）：竖线 + 全局「仅查看主产品」 */}
      {props.onPriceTypeToggle && props.priceTypesAfter}
      {props.legend && (
        // 中区（第一百七十八轮改常驻流内）：产品药丸带由看板层注入，占左区与右区
        // 之间的剩余宽度居中放；底部与折后价/RRP 对齐（行 alignItems flex-end）
        <div
          style={{
            flex: '1 1 auto',
            minWidth: 0,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-end',
            overflow: 'hidden',
          }}
        >
          {props.legend}
        </div>
      )}
      {/* 右区：高频视图开关圆框组（第五十六轮收窄：只留大促档期/offer 权益）+
          「⋯ 更多」二级菜单（仅最高/最低价标注、价格变化提醒两个开关）。
          「多平台比价」胶囊按钮已随第一百五十轮退役——入口移到图例药丸悬停
          店铺图标（每个产品直进自己的多平台比价，不再二次选择） */}
      {toolbarOn && (
        <div
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}
        >
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
            }}
          >
            <Checkbox checked={props.promoBandsOn} onChange={(e) => props.onPromoBandsOn!(e.target.checked)}>
              <span style={{ fontSize: 12 }}>大促档期</span>
            </Checkbox>
            <Checkbox checked={props.offersOn} onChange={(e) => props.onOffersOn!(e.target.checked)}>
              <span style={{ fontSize: 12 }}>促销权益</span>
            </Checkbox>
          </div>
          <Popover
            trigger="click"
            placement="bottomRight"
            content={
              <div style={{ width: 252 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: color.ink, marginBottom: 8 }}>更多功能</div>
                <Checkbox checked={props.maxMinOn === true} onChange={(e) => props.onMaxMinOn!(e.target.checked)}>
                  <span style={{ fontSize: 12 }}>最高/最低价标注</span>
                </Checkbox>
                <div style={{ fontSize: 11, color: color.mute, marginTop: 3, lineHeight: '16px' }}>
                  在区间内最高 / 最低价点位旁标注胶囊
                </div>
                <div style={{ marginTop: 8 }}>
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
                          // 松手生效：拖动值只在本地预览，此刻才写入持久配置
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
            }
          >
            <RoundIconButton
              title="更多功能（最高/最低价标注 · 价格变化提醒）"
              aria-label="更多功能"
              active={secondaryActive}
            >
              <MoreOutlined style={{ fontSize: 12 }} />
            </RoundIconButton>
          </Popover>
        </div>
      )}
    </div>
  );
}
