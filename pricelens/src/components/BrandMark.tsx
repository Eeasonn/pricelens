// ============================================================
// 品牌视觉标记（第三轮反馈修订）：品牌图标全线撤下，统一改为
// 品牌色小圆点（8px）放品牌名前；卡片选中/未选中底色逻辑保留在此。
// logo 资产仍保留在 src/assets/brands/（当前未引用、不参与打包）。
// ============================================================
import type { CSSProperties } from 'react';
import { brandColor } from '../theme/tokens';

/** 品牌枚举值 → 展示名（第四十五轮：总览矩阵产品名带品牌；未登记品牌原样返回） */
const BRAND_LABELS: Record<string, string> = {
  HUAWEI: 'Huawei',
  APPLE: 'Apple',
  SAMSUNG: 'Samsung',
  HONOR: 'Honor',
  XIAOMI: 'Xiaomi',
};
export function brandLabelOf(brand: string): string {
  return BRAND_LABELS[brand] ?? brand;
}
/** 品牌全名：型号名已含品牌词（如「Honor 600」）则不重复前缀 */
export function fullModelName(brand: string, modelName: string): string {
  const b = brandLabelOf(brand);
  return modelName.toLowerCase().startsWith(b.toLowerCase()) ? modelName : `${b} ${modelName}`;
}

/** 品牌色小圆点：所有品牌名前的前置标记（筛选器触发器/级联品牌列/图上系列名/钉顶卡片） */
export default function BrandDot({
  brand,
  size = 8,
  style,
}: {
  brand: string;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: 9999,
        background: brandColor[brand] ?? '#171717',
        flexShrink: 0,
        display: 'inline-block',
        ...style,
      }}
    />
  );
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
/** 线性混色：t=0 → a，t=1 → b */
function mixRgb(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}
const WHITE: [number, number, number] = [255, 255, 255];
const GRAY: [number, number, number] = [155, 155, 155]; // #9b9b9b 中性灰

/**
 * 卡片底色（第三轮反馈修订）：选中 = 浅品牌色（品牌色掺 18% 灰后大幅提亮，80% 透明度），
 * 未选中 = 所有品牌统一的更浅中性灰。视觉上选中卡暗示品牌调性、未选卡退为背景。
 */
export function brandTintBg(brand: string, selected: boolean): string {
  if (!selected) return 'rgba(241, 241, 241, 0.8)';
  const grayed = mixRgb(hexToRgb(brandColor[brand] ?? '#171717'), GRAY, 0.18);
  const [r, g, b] = mixRgb(grayed, WHITE, 0.91);
  return `rgba(${r}, ${g}, ${b}, 0.8)`;
}
