// ============================================================
// 供应商徽标：首字母 + 稳定色点（身份标识，同品牌色点的性质）
//  - 不引入 SVG 资源；单字符取 providerInitialOf，色值取 providerBadgeColorOf
//    （品牌扩展色板稳定哈希，同一服务商永远同一色），底色是该身份色的浅色
//    （brandTintBg，与品牌卡片同款算法），字母用墨色保证对比度。
//  - 徽标只标识身份、不承载任何状态：状态另由 ProviderStatusDot + 文字表达；
//    因此整体 aria-hidden，服务商名称由相邻文字（或调用方的 aria-label）提供。
// ============================================================
import type { CSSProperties } from 'react';
import { brandTintBg } from '../components/BrandMark';
import { color, fontSize, radius, shadow } from '../theme/tokens';
import { providerBadgeColorOf, providerInitialOf, statusDotColorOf, type ProviderConfigStatus, type ProviderPreset } from './providers';

export default function ProviderBadge({ preset, size = 20, style }: {
  preset: ProviderPreset;
  /** 高度（px）；宽度 = 高度 + 4，容纳色点与单字符 */
  size?: number;
  style?: CSSProperties;
}) {
  const dot = Math.max(4, Math.round(size * 0.3));
  return (
    <span
      aria-hidden
      data-provider-badge={preset.id}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Math.max(2, Math.round(size * 0.15)),
        width: size + 4,
        height: size,
        flexShrink: 0,
        borderRadius: radius.control,
        background: brandTintBg(preset.id, true),
        boxShadow: shadow.l1,
        color: color.ink,
        fontSize: fontSize.caption,
        fontWeight: 600,
        lineHeight: 1,
        ...style,
      }}
    >
      <i style={{ width: dot, height: dot, borderRadius: radius.pill, background: providerBadgeColorOf(preset.id), flexShrink: 0 }} />
      {providerInitialOf(preset)}
    </span>
  );
}

/** 配置状态点（6px）：颜色来自 statusDotColorOf，含义由旁边的文字标签给出 */
export function ProviderStatusDot({ status, style }: { status: ProviderConfigStatus; style?: CSSProperties }) {
  return (
    <i
      aria-hidden
      data-provider-status={status}
      style={{ width: 6, height: 6, borderRadius: radius.pill, background: statusDotColorOf(status), flexShrink: 0, ...style }}
    />
  );
}
