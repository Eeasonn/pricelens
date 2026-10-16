// ============================================================
// 图顶工具行（第五十二轮单行三区 → 第五十四轮追补抽为独立组件）：
// 左 = 币种符号 + Y 轴设置齿轮（每格高度/刻度线/自动压缩/折线样式弹层）
//     + 折后价/RRP 粗细线胶囊；
// 右 = 大促档期 / offer 权益 / 最高最低价 / 价格变化提醒 圆框组。
// 第五十四轮追补（用户反馈）：
// ① 圆框组居右（原 margin auto 居中）——右侧空间留白可读性更好；
// ② 阈值数值占位定宽（≥ 5% / ≥ 12.5% 同宽）——拖滑杆时组宽不再逐帧抖动；
// ③ 分离模式下本行在面板网格上方常驻一条（index 层渲染），统一控制全部面板，
//    面板内不再渲染各自的设置行（Chart chrome=false）。
// ============================================================
import { Checkbox, Popover, Segmented, Slider } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
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

export default function ChartToolbar(props: ChartToolbarProps) {
  const toolbarOn =
    props.onPromoBandsOn != null &&
    props.onOffersOn != null &&
    props.onMaxMinOn != null &&
    props.onChangeThreshold != null;
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
        <button
          type="button"
          title="Y 轴显示设置（每格高度伸缩 / 刻度线显隐 / Y 轴自动压缩 / 折线样式）"
          aria-label="Y 轴显示设置"
          onClick={(e) => e.stopPropagation()}
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
          }}
        >
          <SettingOutlined style={{ fontSize: 12 }} />
        </button>
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
      {/* 右区：视图开关圆框组（第五十四轮追补居右；阈值数值定宽防抖动） */}
      {toolbarOn && (
        <div
          style={{
            marginLeft: 'auto',
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
          <Checkbox checked={props.maxMinOn} onChange={(e) => props.onMaxMinOn!(e.target.checked)}>
            <span style={{ fontSize: 12 }}>最高/最低价</span>
          </Checkbox>
          <Checkbox
            checked={props.changeThreshold != null}
            onChange={(e) => props.onChangeThreshold!(e.target.checked ? 0.05 : null)}
          >
            <span style={{ fontSize: 12 }}>价格变化提醒</span>
          </Checkbox>
          {props.changeThreshold != null && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Slider
                style={{ width: 72, margin: '0 2px' }}
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
      )}
    </div>
  );
}
