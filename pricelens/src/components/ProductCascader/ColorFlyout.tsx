// ============================================================
// 颜色浮层（第十五轮建，第一百一十七轮抽为独立组件）：
// 档位/配置行的「颜色」按钮点击后弹出；勾选/取消颜色直接改写该勾选组的
// skuIds（toggleSku：取消最后一个颜色 = 整组退场），下游聚合对 skuIds 取均值，
// 多色即均价。列显各颜色最新折后价，辅助挑选。
// 原挂在级联面板右侧（ProductBox）；统一产品选择浮窗的卡内配置 chips 复用。
// ============================================================
import { type CSSProperties } from 'react';
import { Checkbox } from 'antd';
import { color, formatPrice, radius, selectSoft, selectSoftInk } from '../../theme/tokens';
import type { CurrencyMode } from '../../dataModel/types';
import { findSelection, modelNameOf, shortRomram, type RomramNode } from './tree';
import type { ProductSelection } from '../../state/filtersTypes';

export const COLOR_CHIP: CSSProperties = {
  height: 18,
  padding: '0 7px',
  display: 'inline-flex',
  alignItems: 'center',
  fontSize: 11,
  fontWeight: 600,
  lineHeight: '16px',
  color: selectSoftInk,
  background: selectSoft,
  border: '1px solid rgba(0, 112, 243, 0.40)',
  borderRadius: radius.pill,
  cursor: 'pointer',
  flexShrink: 0,
};

export default function ColorFlyout({
  node,
  list,
  currency,
  onToggle,
  onReset,
}: {
  node: RomramNode;
  list: ProductSelection[];
  currency: CurrencyMode;
  onToggle: (skuId: string, next: boolean) => void;
  onReset: () => void;
}) {
  const pool = node.selectableColors.length ? node.selectableColors : node.colors;
  const sel = findSelection(list, node);
  return (
    <div
      style={{
        boxSizing: 'border-box',
        flexShrink: 0,
        background: color.canvas,
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: color.ink, whiteSpace: 'nowrap' }}>
        颜色
        <span style={{ fontWeight: 400, color: color.mute }}>
          {' '}· {modelNameOf(node.modelId)} {shortRomram(node.romram)}
        </span>
      </div>
      <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', overflowY: 'auto', maxHeight: 228 }}>
        {pool.map((c) => (
          <label
            key={c.skuId}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
              lineHeight: '26px',
              color: color.body,
              cursor: 'pointer',
            }}
          >
            <Checkbox
              checked={sel?.skuIds.includes(c.skuId) ?? false}
              onChange={(e) => onToggle(c.skuId, e.target.checked)}
              style={{ fontSize: 12 }}
            />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.color}</span>
            <span className="tnum" style={{ marginLeft: 'auto', fontSize: 11, color: color.mute }}>
              {formatPrice(currency === 'usd' ? c.latestUsd : c.latestLocal, currency)}
            </span>
          </label>
        ))}
      </div>
      <div
        style={{
          marginTop: 6,
          paddingTop: 6,
          borderTop: `1px solid ${color.hairline}`,
          fontSize: 11,
          lineHeight: '16px',
          color: color.mute,
        }}
      >
        多选颜色时，折后价取所选颜色的均价。
        <a onClick={onReset} style={{ fontSize: 11, marginLeft: 4 }}>
          恢复默认色
        </a>
      </div>
    </div>
  );
}
