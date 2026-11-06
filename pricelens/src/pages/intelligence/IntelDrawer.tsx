// ============================================================
// GTM 情报工作台 · 详情抽屉（t428u Batch3）
// ----------------------------------------------------------------
// 点卡片 / Tab+Enter 打开，Esc 或遮罩点击关闭；240ms 滑入
// （prefers-reduced-motion 时保留状态、去掉位移——与全局 CSS 降级双保险）。
// 内容 = 完整可追溯字段（是什么 / 哪里 / 什么时候（事件+采集）/ 关键变化 /
// GTM 意义及其依据 / 来源状态与原始链接 / 图片授权），并提供真实捷径
// 「进入量价预测」（go('forecast)）与「让 Agent 评估」。
// ============================================================
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowRightOutlined, CloseOutlined, RobotOutlined } from '@ant-design/icons';
import BrandDot, { brandLabelOf } from '../../components/BrandMark';
import { prefersReducedMotion } from '../../theme/motion';
import { color, fontSize, motion, radius, shadow, space } from '../../theme/tokens';
import { INTEL_MODULE_LABEL, type IntelItem } from './gtmIntel';
import { DataModeBadge, IntelImage, productImageModule } from './IntelCard';

interface IntelDrawerProps {
  item: IntelItem;
  onClose: () => void;
  onGoForecast: () => void;
  onAskAgent: (item: IntelItem) => void;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: space.sm, fontSize: 12.5, lineHeight: 1.6, alignItems: 'flex-start' }}>
      <span style={{ width: 64, flexShrink: 0, color: color.mute }}>{label}</span>
      <span style={{ color: color.body, minWidth: 0, flex: 1 }}>{children}</span>
    </div>
  );
}

export default function IntelDrawer({ item, onClose, onGoForecast, onAskAgent }: IntelDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  // 入场两阶段渲染：先挂载在屏外，下一帧滑入（reduced-motion 直接落位）
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const reduced = prefersReducedMotion();
    const raf = requestAnimationFrame(() => setEntered(true));
    panelRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey);
      restoreFocusRef.current?.focus?.({ preventScroll: true });
    };
  }, [onClose]);

  const reduced = prefersReducedMotion();
  const slideIn = reduced || entered;

  return (
    <div data-lpl-intel-drawer-wrap style={{ position: 'fixed', inset: 0, zIndex: 900 }} role="presentation">
      <div
        aria-hidden="true"
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'rgba(23,23,23,.28)', opacity: slideIn ? 1 : 0, transition: reduced ? 'none' : `opacity ${motion.base}ms ${motion.enter}` }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${item.title} · 情报详情`}
        tabIndex={-1}
        data-lpl-intel-drawer
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          width: 'min(420px, 100vw)',
          boxSizing: 'border-box',
          background: color.canvas,
          boxShadow: shadow.l5,
          borderLeft: `1px solid ${color.hairline}`,
          display: 'flex',
          flexDirection: 'column',
          outline: 'none',
          transform: slideIn ? 'translateX(0)' : 'translateX(100%)',
          transition: reduced ? 'none' : `transform ${motion.base}ms ${motion.enter}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: space.sm, padding: `${space.md}px ${space.base}px`, borderBottom: `1px solid ${color.hairline}`, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: color.mute }}>{INTEL_MODULE_LABEL[item.module]}情报</span>
          <DataModeBadge mode={item.dataMode} />
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭详情（Esc）"
            style={{ marginLeft: 'auto', border: `1px solid ${color.hairline}`, background: color.canvas, borderRadius: radius.control, width: 26, height: 26, display: 'grid', placeItems: 'center', color: color.body, cursor: 'pointer' }}
          >
            <CloseOutlined style={{ fontSize: 11 }} />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: space.base, display: 'flex', flexDirection: 'column', gap: space.md }}>
          {item.image || (item.brand && productImageModule(item.module)) ? (
            <div style={{ display: 'flex', gap: space.md, alignItems: 'flex-start' }}>
              <IntelImage image={item.image} brand={item.brand} model={item.model} width={132} height={100} />
              <div style={{ minWidth: 0 }}>
                <h2 style={{ margin: 0, fontSize: fontSize.bodyMd, lineHeight: '22px', fontWeight: 600, color: color.ink }}>{item.title}</h2>
                {item.brand ? (
                  <div style={{ marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: color.mute }}>
                    <BrandDot brand={item.brand} size={7} />
                    {brandLabelOf(item.brand)}{item.model ? ` · ${item.model}` : ''}
                  </div>
                ) : null}
                <p style={{ margin: '6px 0 0', fontSize: 12.5, lineHeight: 1.6, color: color.body }}>{item.summary}</p>
              </div>
            </div>
          ) : (
            <div>
              <h2 style={{ margin: 0, fontSize: fontSize.bodyMd, lineHeight: '22px', fontWeight: 600, color: color.ink }}>{item.title}</h2>
              <p style={{ margin: '6px 0 0', fontSize: 12.5, lineHeight: 1.6, color: color.body }}>{item.summary}</p>
            </div>
          )}

          <div style={{ display: 'grid', gap: space.sm, paddingTop: space.md, borderTop: `1px solid ${color.hairline}` }}>
            <Field label="是什么">{item.title}——{item.summary}</Field>
            <Field label="哪里">{item.region}</Field>
            <Field label="什么时候">
              {item.eventDate}
              {item.evidence.capturedAt ? <span style={{ color: color.mute }}>（采集 {item.evidence.capturedAt}）</span> : null}
            </Field>
            <Field label="关键变化">{item.change ?? <span style={{ color: color.mute }}>暂无</span>}</Field>
            <Field label="GTM 意义">
              {item.gtmMeaning}
              <span style={{ display: 'block', marginTop: 2, fontSize: 11, color: item.gtmBasis === 'sample' ? color.warningInk : color.alert.evidence.verified }}>
                {item.gtmBasis === 'sample' ? '示例判断——不构成实时结论' : `依据：${item.evidenceNote ?? '仓内数据'}`}
              </span>
            </Field>
          </div>

          <div style={{ padding: space.md, borderRadius: radius.card, background: color.canvasSoft, display: 'grid', gap: space.sm, fontSize: 12, color: color.body }}>
            <div style={{ display: 'flex', gap: space.sm }}><span style={{ width: 64, flexShrink: 0, color: color.mute }}>来源状态</span><span style={{ minWidth: 0 }}>{item.evidence.label}{item.dataMode === 'pending' ? '（真实采集源待接入，不展示伪实时数据）' : ''}</span></div>
            {item.evidence.url ? (
              <div style={{ display: 'flex', gap: space.sm }}>
                <span style={{ width: 64, flexShrink: 0, color: color.mute }}>原始链接</span>
                <a href={item.evidence.url} target="_blank" rel="noreferrer" style={{ color: color.link, minWidth: 0, overflowWrap: 'anywhere' }}>
                  {item.evidence.url}
                </a>
              </div>
            ) : null}
            {item.image ? (
              <div style={{ display: 'flex', gap: space.sm }}>
                <span style={{ width: 64, flexShrink: 0, color: color.mute }}>图片授权</span>
                <span style={{ minWidth: 0 }}>
                  <a href={item.image.sourceUrl} target="_blank" rel="noreferrer" style={{ color: color.link }}>
                    {item.image.credit} · {item.image.license}
                  </a>
                  <span style={{ color: color.mute }}>（Wikimedia Commons）</span>
                </span>
              </div>
            ) : null}
          </div>
        </div>
        <div style={{ display: 'flex', gap: space.sm, padding: `${space.md}px ${space.base}px`, borderTop: `1px solid ${color.hairline}`, flexShrink: 0 }}>
          <button
            type="button"
            data-lpl-intel-go-forecast
            onClick={onGoForecast}
            style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, border: 'none', background: color.ink, color: color.onPrimary, borderRadius: radius.control, padding: '9px 12px', fontSize: fontSize.bodySm, fontWeight: 500, cursor: 'pointer' }}
          >
            进入量价预测 <ArrowRightOutlined style={{ fontSize: 11 }} />
          </button>
          <button
            type="button"
            onClick={() => onAskAgent(item)}
            style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, border: `1px solid ${color.hairline}`, background: color.canvas, color: color.ink, borderRadius: radius.control, padding: '9px 12px', fontSize: fontSize.bodySm, cursor: 'pointer' }}
          >
            <RobotOutlined /> 让 Agent 评估
          </button>
        </div>
      </div>
    </div>
  );
}
