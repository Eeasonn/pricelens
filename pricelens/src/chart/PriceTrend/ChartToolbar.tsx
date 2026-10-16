// ============================================================
// 图顶工具行（第五十二轮单行三区 → 第五十四轮追补抽为独立组件）：
// 左 = 币种符号 + Y 轴设置齿轮（每格高度/刻度线/自动压缩/折线样式弹层）
//     + 折后价/RRP 粗细线胶囊；
// 右 = 大促档期 / offer 权益 圆框组 + 「⋯ 更多」二级菜单按钮。
// 第五十六轮（领导页面清洁要求）：最高/最低价、价格变化提醒不是主要功能——
// 从常驻圆框组撤出，收进「⋯ 更多」Popover（默认关闭；启用时 ⋯ 按钮带蓝点
// 提示有隐藏的激活功能）；促销力度明细（原图下横向热力带）也收到该菜单，
// 点「打开促销力度明细」弹出二级抽屉（纵向表格）。
// 第五十四轮追补（用户反馈）：
// ① 圆框组居右（原 margin auto 居中）——右侧空间留白可读性更好；
// ② 阈值数值占位定宽（≥ 5% / ≥ 12.5% 同宽）——拖滑杆时组宽不再逐帧抖动；
// ③ 分离模式下本行在面板网格上方常驻一条（index 层渲染），统一控制全部面板，
//    面板内不再渲染各自的设置行（Chart chrome=false）。
// ============================================================
import { Checkbox, Popover, Segmented, Slider } from 'antd';
import { MoreOutlined, SettingOutlined } from '@ant-design/icons';
import { forwardRef, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import type { CurrencyMode } from '../../dataModel/types';
import { color, fontSize, radius } from '../../theme/tokens';
import type { LineShapeChoice } from './chartModel';
import ScaleSlider from './ScaleSlider';

export interface ChartToolbarProps {
  currency: CurrencyMode;
  sliderScale: number;
  onSliderScale: (v: number) => void;
  showYTicks: boolean;
  onShowYTicks: (v: boolean) => void;
  yCompress: boolean;
  onYCompress: (v: boolean) => void;
  lineShape: LineShapeChoice;
  onLineShape: (v: LineShapeChoice) => void;
  /** 折后价/RRP 显隐切换（传 onPriceTypeToggle 才渲染左区粗/细线胶囊） */
  priceTypes: { discounted: boolean; rrp: boolean };
  onPriceTypeToggle?: (key: 'discounted' | 'rrp', next: boolean) => void;
  /** 中区圆框组：四个回调全传才渲染（下钻弹窗等不传 = 不渲染） */
  promoBandsOn?: boolean;
  onPromoBandsOn?: (v: boolean) => void;
  offersOn?: boolean;
  onOffersOn?: (v: boolean) => void;
  maxMinOn?: boolean;
  onMaxMinOn?: (v: boolean) => void;
  changeThreshold?: number | null;
  onChangeThreshold?: (v: number | null) => void;
  /** 第五十六轮：打开促销力度明细抽屉（二级）；传了才渲染「⋯ 更多」菜单 */
  onOpenPromoDetail?: () => void;
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
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
      <span style={{ fontSize: fontSize.caption, lineHeight: '16px', color: color.mute, pointerEvents: 'none' }}>
        {props.currency === 'usd' ? '$' : '₽'}
      </span>
      <Popover
        trigger="click"
        placement="bottomLeft"
        content={
          <div style={{ width: 236 }}>
            <div style={{ fontSize: 12, color: color.mute, marginBottom: 8 }}>每格高度（不改 Y 轴刻度值）</div>
            <ScaleSlider scale={props.sliderScale} onCommit={props.onSliderScale} />
            <div style={{ fontSize: 11, color: color.mute, marginTop: 8 }}>拖动后松手生效；双击滑杆复位 ×1.00</div>
            <div style={{ borderTop: `1px solid ${color.hairline}`, margin: '10px 0' }} />
            <Checkbox checked={props.showYTicks} onChange={(e) => props.onShowYTicks(e.target.checked)}>
              <span style={{ fontSize: 12 }}>显示 Y 刻度线</span>
            </Checkbox>
            <div style={{ marginTop: 6 }}>
              <Checkbox checked={props.yCompress} onChange={(e) => props.onYCompress(e.target.checked)}>
                <span style={{ fontSize: 12 }}>Y 轴自动压缩</span>
              </Checkbox>
              <div style={{ fontSize: 11, color: color.mute, marginTop: 4, lineHeight: '16px' }}>
                值簇间空白压成断轴；默认关 = Y 轴完全连续展示
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
        <RoundIconButton title="Y 轴显示设置（每格高度伸缩 / 刻度线显隐 / Y 轴自动压缩 / 折线样式）" aria-label="Y 轴显示设置">
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
      {/* 右区：高频视图开关圆框组（第五十六轮收窄：只留大促档期/offer 权益）+
          「⋯ 更多」二级菜单（极值标注/价格变化提醒/促销力度明细抽屉入口） */}
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
              <span style={{ fontSize: 12 }}>offer 权益</span>
            </Checkbox>
          </div>
          {props.onOpenPromoDetail && (
            <Popover
              trigger="click"
              placement="bottomRight"
              content={
                <div style={{ width: 252 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: color.ink, marginBottom: 8 }}>更多功能（默认关闭）</div>
                  <Checkbox checked={props.maxMinOn === true} onChange={(e) => props.onMaxMinOn!(e.target.checked)}>
                    <span style={{ fontSize: 12 }}>最高/最低价标注</span>
                  </Checkbox>
                  <div style={{ fontSize: 11, color: color.mute, marginTop: 3, lineHeight: '16px' }}>
                    Keepa 式极值点旁胶囊（窗口内最高/最低）
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <Checkbox
                      checked={props.changeThreshold != null}
                      onChange={(e) => props.onChangeThreshold!(e.target.checked ? 0.05 : null)}
                    >
                      <span style={{ fontSize: 12 }}>价格变化提醒</span>
                    </Checkbox>
                    <div style={{ fontSize: 11, color: color.mute, marginTop: 3, lineHeight: '16px' }}>
                      相邻有值点 |Δ|≥阈值出 ↓/↑ 徽标
                    </div>
                    {props.changeThreshold != null && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                        <Slider
                          style={{ width: 150, margin: '0 2px' }}
                          min={0}
                          max={15}
                          step={0.5}
                          value={+(props.changeThreshold * 100).toFixed(1)}
                          onChange={(v) => props.onChangeThreshold!(+(v as number) / 100)}
                          tooltip={{ formatter: (v) => `≥ ${v ?? 0}%` }}
                        />
                        <span
                          className="tnum"
                          style={{ fontSize: 11, color: color.mute, whiteSpace: 'nowrap', display: 'inline-block', width: THRESHOLD_TEXT_W }}
                        >
                          ≥ {+(props.changeThreshold * 100).toFixed(1)}%
                        </span>
                      </span>
                    )}
                  </div>
                  <div style={{ borderTop: `1px solid ${color.hairline}`, margin: '10px 0' }} />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: 12, color: color.body }}>促销力度明细</span>
                    <span
                      role="button"
                      title="打开促销力度明细抽屉（行=时间最新在上，列=产品）"
                      onClick={props.onOpenPromoDetail}
                      style={{ fontSize: 12, fontWeight: 600, color: '#0070f3', cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      打开 ›
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: color.mute, marginTop: 3, lineHeight: '16px' }}>
                    各产品逐周促销深度（原热力带已收起）
                  </div>
                </div>
              }
            >
              <RoundIconButton
                title="更多功能（最高/最低价标注 · 价格变化提醒 · 促销力度明细）"
                aria-label="更多功能"
                active={secondaryActive}
              >
                <MoreOutlined style={{ fontSize: 12 }} />
              </RoundIconButton>
            </Popover>
          )}
        </div>
      )}
    </div>
  );
}
