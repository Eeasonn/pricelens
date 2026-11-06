// ============================================================
// GTM 情报工作台 · 情报图卡（t428u Batch3）
// ----------------------------------------------------------------
// 每张卡默认 5 要素：是什么 / 哪里 / 什么时候 / 关键变化（缺则「暂无」）/
// GTM 意义（挂证据或标「示例判断」）。整卡可点 / Tab+Enter 展开右侧详情
// 抽屉；示例条目必带「示例」徽章；未配图或加载失败一律中性灰底缩写
// fallback（#f5f5f5 + 细框 + 品牌圆点与品名缩写，无渐变无热图）。
// ============================================================
import { useState, type KeyboardEvent } from 'react';
import { ArrowRightOutlined } from '@ant-design/icons';
import BrandDot, { brandLabelOf } from '../../components/BrandMark';
import { color, fontSize, radius, selectSoft, selectSoftInk, space } from '../../theme/tokens';
import {
  INTEL_DATA_MODE_LABEL,
  INTEL_MODULE_LABEL,
  type IntelDataMode,
  type IntelImage as IntelImageSpec,
  type IntelItem,
} from './gtmIntel';

/** dataMode 徽章色：示例=琥珀（注意力）；本地=绿（已核）；待接入=灰（不装） */
const DATA_MODE_TONE: Record<IntelDataMode, { fg: string; bg: string }> = {
  sample: { fg: color.warningInk, bg: color.warningSoft },
  local: { fg: color.alert.evidence.verified, bg: color.alert.lifecycle.resolved.bg },
  pending: { fg: color.mute, bg: color.canvasSoft2 },
};

export function DataModeBadge({ mode, title }: { mode: IntelDataMode; title?: string }) {
  const tone = DATA_MODE_TONE[mode];
  return (
    <span
      data-lpl-intel-mode={mode}
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 7px',
        borderRadius: radius.pill,
        color: tone.fg,
        background: tone.bg,
        fontSize: 10.5,
        lineHeight: 1.4,
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      {INTEL_DATA_MODE_LABEL[mode]}
    </span>
  );
}

/** 产品图：真实下载件正常渲染；未配图 / onError → 中性灰底缩写框（唯一 fallback 形态） */
export function IntelImage({
  image,
  brand,
  model,
  width = 88,
  height = 66,
}: {
  image?: IntelImageSpec;
  brand?: string;
  model?: string;
  width?: number;
  height?: number;
}) {
  const [failed, setFailed] = useState(false);
  const boxStyle = {
    width,
    height,
    borderRadius: radius.control,
    border: `1px solid ${color.hairline}`,
    background: color.canvasSoft2,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    flexShrink: 0,
    overflow: 'hidden',
  } as const;
  if (!image || failed) {
    const abbrev = model ? abbreviateModel(model) : '产品图';
    return (
      <div data-lpl-intel-img-fallback style={boxStyle} title="未配图或加载失败 · 中性占位">
        {brand ? <BrandDot brand={brand} size={7} /> : null}
        <span style={{ fontSize: 10.5, color: color.mute, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: width - 18 }}>
          {brand ? `${brandLabelOf(brand)} ${abbrev}` : abbrev}
        </span>
      </div>
    );
  }
  return (
    <img
      data-lpl-intel-img
      src={image.src}
      alt={image.alt}
      loading="lazy"
      onError={() => setFailed(true)}
      style={{ width, height, objectFit: 'cover', borderRadius: radius.control, border: `1px solid ${color.hairline}`, flexShrink: 0, background: color.canvasSoft2, display: 'block' }}
    />
  );
}

/** 品名缩写：取模型名前两个语素（如「Mate 80 Pro」→「Mate 80」），保证灰底框不溢出 */
function abbreviateModel(model: string): string {
  const tokens = model.split(/\s+/);
  return tokens.length <= 2 ? model : `${tokens.slice(0, 2).join(' ')}…`;
}

const labelStyle = { fontSize: 11, color: color.mute, flexShrink: 0 } as const;

/** 产品图区只用于新品 / 竞品模块（真实机型的图卡）；促销 / 事件 / 渠道卡走纯文字密度 */
export function productImageModule(module: IntelItem['module']): boolean {
  return module === 'new-product' || module === 'competitor';
}

export default function IntelCard({ item, onOpen }: { item: IntelItem; onOpen: (item: IntelItem) => void }) {
  const pending = item.dataMode === 'pending';
  const open = () => onOpen(item);
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      open();
    }
  };
  const showImageArea = Boolean(item.image || (item.brand && productImageModule(item.module)));
  return (
    <article
      data-lpl-intel-card={item.id}
      role="button"
      tabIndex={0}
      aria-haspopup="dialog"
      aria-label={`${item.title}，展开溯源详情`}
      onClick={open}
      onKeyDown={onKeyDown}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: space.sm,
        padding: space.md,
        borderRadius: radius.card,
        border: pending ? `1px dashed ${color.hairlineStrong}` : `1px solid ${color.hairline}`,
        background: color.canvas,
        cursor: 'pointer',
        minHeight: 168,
        transition: 'border-color 160ms ease, box-shadow 160ms ease',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = pending ? color.hairlineStrong : color.link; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = pending ? color.hairlineStrong : color.hairline; }}
      onFocus={(e) => { e.currentTarget.style.boxShadow = `0 0 0 2px ${color.link}33`; e.currentTarget.style.borderColor = color.link; }}
      onBlur={(e) => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = pending ? color.hairlineStrong : color.hairline; }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 11, color: selectSoftInk, background: selectSoft, padding: '2px 7px', borderRadius: radius.pill, whiteSpace: 'nowrap' }}>
          {INTEL_MODULE_LABEL[item.module]}
        </span>
        <DataModeBadge mode={item.dataMode} />
        {item.brand ? (
          <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: color.mute, whiteSpace: 'nowrap' }}>
            <BrandDot brand={item.brand} size={7} />
            {brandLabelOf(item.brand)}{item.model ? ` · ${item.model}` : ''}
          </span>
        ) : null}
      </div>
      {showImageArea ? (
        <div style={{ display: 'flex', gap: space.sm, alignItems: 'flex-start' }}>
          <IntelImage image={item.image} brand={item.brand} model={item.model} />
          <div style={{ minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: fontSize.bodySm, lineHeight: '19px', fontWeight: 600, color: color.ink }}>{item.title}</h3>
            <div style={{ marginTop: 3, fontSize: 11, color: color.mute }}>
              {item.region} · {item.eventDate}
            </div>
          </div>
        </div>
      ) : (
        <div>
          <h3 style={{ margin: 0, fontSize: fontSize.bodySm, lineHeight: '19px', fontWeight: 600, color: color.ink }}>{item.title}</h3>
          <div style={{ marginTop: 3, fontSize: 11, color: color.mute }}>
            {item.region} · {item.eventDate}
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, fontSize: 11.5, lineHeight: 1.5 }}>
        <span style={labelStyle}>关键变化</span>
        <span style={{ color: item.change ? color.body : color.mute }}>{item.change ?? '暂无'}</span>
      </div>
      <div style={{ display: 'flex', gap: 6, fontSize: 11.5, lineHeight: 1.5 }}>
        <span style={labelStyle}>GTM 意义</span>
        <span style={{ color: color.body, minWidth: 0 }}>
          {item.gtmMeaning}
          {item.gtmBasis === 'sample' ? <span style={{ color: color.warningInk }}>（示例判断）</span> : null}
        </span>
      </div>
      <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 8, paddingTop: 6, borderTop: `1px solid ${color.hairline}` }}>
        <span title={item.evidence.label} style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: color.mute, fontSize: 10.5 }}>
          来源：{item.evidence.label}
        </span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 3, color: color.link, fontSize: 11, whiteSpace: 'nowrap' }}>
          展开溯源 <ArrowRightOutlined style={{ fontSize: 9 }} />
        </span>
      </div>
    </article>
  );
}
