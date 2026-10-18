// ============================================================
// 共享页头（预警中心重构）：四页统一 64px 铬架——左 = PriceLens · 页名；
// 右 = 🔔预警（Badge = 触发条数）+ 页签按钮组（当前页 primary 高亮）。
// 历史上四页各手写一份 header（预警页副本漏挂 AlertNavButton、按钮顺序还不同），
// 收编到本组件后一次修正；配置页的「保存配置」走 extra 插槽。
// ============================================================
import type { ReactNode } from 'react';
import { Button } from 'antd';
import { usePage, type Page } from '../state/PageContext';
import { useFilters } from '../state/FiltersContext';
import { scopeLabels } from '../dataModel/scope';
import { AlertNavButton } from './AlertCenter';
import { color, fontSize, shadow, space } from '../theme/tokens';

const TABS: { page: Page; label: string }[] = [
  { page: 'overview', label: '总览' },
  { page: 'dashboard', label: '价格看板' },
  { page: 'config', label: '配置' },
  { page: 'alerts', label: '预警' },
];

export default function PageHeader({ title, extra }: { title: string; extra?: ReactNode }) {
  const { go, page } = usePage();
  const { state } = useFilters();
  const { region, country } = scopeLabels(state);
  return (
    <header
      style={{
        height: 64,
        flexShrink: 0,
        background: color.canvas,
        boxShadow: shadow.l1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: `0 ${space.lg}px`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: space.md }}>
        <span style={{ fontSize: fontSize.bodyMd, fontWeight: 600, color: color.ink }}>PriceLens</span>
        <span style={{ fontSize: fontSize.caption, color: color.mute }}>{region} / {country} · {title}</span>
      </div>
      <div style={{ display: 'flex', gap: space.sm, alignItems: 'center' }}>
        <AlertNavButton />
        {TABS.map((t) => (
          <Button
            key={t.page}
            size="small"
            style={{ height: 28 }}
            type={page === t.page ? 'primary' : 'default'}
            onClick={page === t.page ? undefined : () => go(t.page)}
          >
            {t.label}
          </Button>
        ))}
        {extra}
      </div>
    </header>
  );
}
