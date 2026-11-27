// ============================================================
// 品牌标记（2026-11-27 更名 PriceAgent）：极简墨色圆角方块 + 白色 P。
// - 墨色 = color.ink（全站唯一主色，不引入渐变 / AI 紫色）；白 P 用描边路径而非
//   <text>，不依赖系统字体，各平台渲染一致；
// - 与 index.html 内联 favicon 同一造型（favicon 是 data URI，无法复用本组件，
//   两处共用本文件导出的 P_MARK_PATH 字面量，改形只改这一处）。
// - 图标恒与「PriceAgent」文字相邻出现，缺省 aria-hidden，避免读屏重复朗读。
// ============================================================
import type { CSSProperties } from 'react';
import { color } from '../theme/tokens';

/** 用户可见品牌名（页头 / 标题 / Agent 入口统一取值；内部仓库名、变量不改名） */
export const BRAND_NAME = 'PriceAgent';

/** P 字描边路径（32×32 viewBox：竖笔 + 半圆碗，圆头圆角） */
export const P_MARK_PATH = 'M12 24.5V7.5h6a5.25 5.25 0 0 1 0 10.5h-6';

/** 圆角方块圆角（32 viewBox 基准；favicon 同值） */
export const P_MARK_RADIUS = 7;

export default function PriceAgentMark({
  size = 22,
  style,
}: {
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      style={{ display: 'inline-block', flexShrink: 0, ...style }}
    >
      <rect width="32" height="32" rx={P_MARK_RADIUS} fill={color.ink} />
      <path
        d={P_MARK_PATH}
        fill="none"
        stroke={color.onPrimary}
        strokeWidth={3.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
