// ============================================================
// 推演工作台 v2 · 量价参考卡 · 历史事件补录弹层（A5 参考卡二轮重构）：
// 「作业草稿」语义的补录输入层——为参照产品已发生的量价变化补记原因。
// ①事件类型五选（竞品上市 / 我司上市 / 促销投放 / 挤兑 / 其他），色系与
//   既有锚点同源（REFERENCE_EVENT_TONES 单一来源，量柱图的预标 / 补录锚
//   都从这取色）；②周选择两式 = 下拉选周 +「在图上点选」（点选态由父层
//   接管：弹层收起、面板顶提示条出现，点完周回调带值回归）；③说明必填；
//   ④「仅本次会话 · 历史补录」标识——提交只进卡内会话 state，刷新即清，
//   不写主链、不参与模型推演。
// 值受控（type / week / note 由父层持有，点选回归不丢已填内容）；本组件
// 只负责校验展示与提交回调。
// ============================================================
import { useState } from 'react';
import { Button, Select } from 'antd';
import { color, radius, space } from '../../theme/tokens';
import type { LifecycleProductSeed } from './workbenchFixture';

/** 补录事件类型（含「其他」；色与既有锚点同源）。 */
export type ReferenceComposedType = 'competitor-launch' | 'own-launch' | 'promo' | 'cannibalization' | 'other';

/** 补录事件（卡内会话草稿；week = 生命周期周序 0 基）。 */
export interface ReferenceComposedEvent {
  id: string;
  type: ReferenceComposedType;
  week: number;
  /** 说明（必填，如「对手首销促销压价」）。 */
  note: string;
}

/** 提交载荷（校验通过后：week 已选、note 已填）。 */
export type ReferenceComposedDraft = Omit<ReferenceComposedEvent, 'id'>;

/** 补录弹层受控值。 */
export interface ReferenceComposerValue {
  type: ReferenceComposedType;
  /** 生命周期周序（0 基）；null = 未选周。 */
  week: number | null;
  note: string;
}

/** 类型 → 锚点色（与主图小事件 / 预标锚同源：上市蓝 / 促销琥珀 / 挤兑墨；其他 = 中性灰）。 */
export const REFERENCE_EVENT_TONES: Record<ReferenceComposedType, string> = {
  'competitor-launch': color.link,
  'own-launch': color.link,
  promo: color.warning,
  cannibalization: color.ink,
  other: color.mute,
};

/** 类型选项（label 文字承载语义，色点只作辅助）。 */
export const REFERENCE_EVENT_TYPES: Array<{ type: ReferenceComposedType; label: string }> = [
  { type: 'competitor-launch', label: '竞品上市' },
  { type: 'own-launch', label: '我司上市' },
  { type: 'promo', label: '促销投放' },
  { type: 'cannibalization', label: '挤兑' },
  { type: 'other', label: '其他' },
];

export const referenceEventTypeLabel = (type: ReferenceComposedType): string =>
  REFERENCE_EVENT_TYPES.find((item) => item.type === type)?.label ?? type;

const smallChipStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  height: 20,
  padding: '0 8px',
  borderRadius: radius.pill,
  fontSize: 11,
  fontWeight: 600,
  whiteSpace: 'nowrap' as const,
  background: color.canvasSoft2,
  color: color.body,
  border: `1px solid ${color.hairline}`,
};

export default function ReferenceEventComposer(props: {
  /** 补录对象产品（周下拉取其全生命周期长度与周标签）。 */
  product: LifecycleProductSeed;
  value: ReferenceComposerValue;
  onChange: (patch: Partial<ReferenceComposerValue>) => void;
  /** 进入「在图上点选」模式：父层收起弹层、面板顶提示条，点击周后带值回归。 */
  onPick: () => void;
  /** 校验通过后提交（week 与 note 均已填）。 */
  onSubmit: (draft: ReferenceComposedDraft) => void;
  onCancel: () => void;
}) {
  const { product, value, onChange, onPick, onSubmit, onCancel } = props;
  // 首次提交尝试后才显示校验错误（不抢跑报错）
  const [attempted, setAttempted] = useState(false);
  const weekMissing = value.week == null;
  const noteMissing = value.note.trim() === '';
  const showWeekError = attempted && weekMissing;
  const showNoteError = attempted && noteMissing;

  const submit = (): void => {
    if (weekMissing || noteMissing) {
      setAttempted(true);
      return;
    }
    onSubmit({ type: value.type, week: value.week as number, note: value.note.trim() });
  };

  return (
    <div style={{ width: 264, padding: `${space.xs}px 2px 0` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: space.sm, marginBottom: space.sm }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: color.ink }}>补录历史事件</span>
        <span title="历史补录只存本卡会话内（刷新即清）：为已发生的量价变化补记原因，不写入主链、不影响模型推演" style={smallChipStyle}>
          仅本次会话 · 历史补录
        </span>
      </div>
      {/* ① 事件类型（色点与锚点同源） */}
      <div style={{ marginBottom: space.sm }}>
        <div style={{ fontSize: 11, color: color.mute, marginBottom: 4 }}>事件类型</div>
        <div role="radiogroup" aria-label="补录事件类型" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {REFERENCE_EVENT_TYPES.map((item) => {
            const active = value.type === item.type;
            return (
              <button
                key={item.type}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onChange({ type: item.type })}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '3px 9px',
                  borderRadius: radius.pill,
                  font: 'inherit',
                  fontSize: 11.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: `1px solid ${active ? color.ink : color.hairlineStrong}`,
                  background: active ? color.canvasSoft2 : color.canvas,
                  color: active ? color.ink : color.body,
                }}
              >
                <span aria-hidden style={{ width: 7, height: 7, borderRadius: 2, background: REFERENCE_EVENT_TONES[item.type], flex: 'none' }} />
                {item.label}
              </button>
            );
          })}
        </div>
      </div>
      {/* ② 周选择：下拉 + 在图上点选（点选态由父层接管，本弹层收起） */}
      <div style={{ marginBottom: space.sm }}>
        <div style={{ fontSize: 11, color: showWeekError ? color.error : color.mute, marginBottom: 4 }}>
          {showWeekError ? '必须选择事件周：下拉选周或点击「在图上点选」' : '事件周（生命周期周序）'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Select
            size="small"
            aria-label="选择补录事件周"
            aria-invalid={showWeekError}
            value={value.week == null ? undefined : value.week}
            placeholder="选择周"
            // 52 周全量渲染（关闭虚拟滚动）：周选择是补录主路径，选项少、可一次性展开
            virtual={false}
            onChange={(week) => onChange({ week })}
            options={product.points.map((_, week) => ({ value: week, label: `W${week + 1}` }))}
            style={{ flex: '1 1 auto', minWidth: 0 }}
          />
          <Button size="small" type="default" onClick={onPick} title="收起本弹层，在面板图上点击某一周作为事件周">
            在图上点选
          </Button>
        </div>
        {value.week != null && (
          <div className="tnum" style={{ marginTop: 4, fontSize: 11, color: color.mute, fontVariantNumeric: 'tabular-nums' }}>
            已选 W{value.week + 1}（上市起第 {value.week + 1} 周）
          </div>
        )}
      </div>
      {/* ③ 说明（必填） */}
      <div style={{ marginBottom: space.sm }}>
        <div style={{ fontSize: 11, color: showNoteError ? color.error : color.mute, marginBottom: 4 }}>
          {showNoteError ? '必须填写说明（发生了什么、为什么）' : '说明（必填）'}
        </div>
        <input
          aria-label="补录事件说明（必填）"
          aria-invalid={showNoteError}
          value={value.note}
          onChange={(event) => onChange({ note: event.target.value })}
          placeholder="如：对手首销促销压价"
          style={{
            width: '100%',
            boxSizing: 'border-box',
            height: 28,
            padding: '0 8px',
            border: `1px solid ${showNoteError ? color.error : color.hairlineStrong}`,
            borderRadius: radius.control,
            background: color.canvas,
            color: color.ink,
            font: 'inherit',
            fontSize: 12,
          }}
        />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: space.sm }}>
        <button
          type="button"
          onClick={submit}
          style={{
            padding: '4px 12px',
            borderRadius: radius.control,
            border: 'none',
            background: color.ink,
            color: color.onPrimary,
            font: 'inherit',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          补录到图上
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: '4px 10px',
            borderRadius: radius.control,
            border: `1px solid ${color.hairline}`,
            background: color.canvas,
            color: color.body,
            font: 'inherit',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          取消
        </button>
      </div>
    </div>
  );
}
