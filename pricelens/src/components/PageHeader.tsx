// ============================================================
// 共享页头（预警中心重构）：四页统一 64px 铬架——左 = PriceLens · 分析模式页签
// （单国家 = 现行形态；区域分析 = 多国对比的扩展方向，置灰）+ 国家选择器
// （从各页筛选条收除，全站唯一入口在页签组）；右 = 🔔预警（Badge = 触发条数）
// + 页签按钮组（当前页 primary 高亮）。配置页的「保存配置」走 extra 插槽。
// 第一百三十七轮：右上角新增问号入口 → 数据口径说明弹窗（取价/默认店铺/
// 比价/销量估算/数据质量等全部处理规则的业务语言说明）。
// ============================================================
import { useState, type ReactNode } from 'react';
import { Button, ConfigProvider, Tooltip } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { usePage, type Page } from '../state/PageContext';
import { filterBarTheme } from './FilterBar';
import CountryBox from './FilterBar/CountryBox';
import DataHelpModal from './DataHelpModal';
import { color, fontSize, radius, selectAccent, selectSoft, selectSoftInk, shadow, space } from '../theme/tokens';

/** 2026-10-20 起聚焦价格看板：总览、预警两页置灰待后续迭代（页头仅保留一处预警入口） */
const TABS: { page: Page; label: string; disabled?: boolean; hint?: string }[] = [
  { page: 'overview', label: '总览', disabled: true, hint: '当前版本暂不提供' },
  { page: 'dashboard', label: '价格看板' },
  { page: 'volume', label: '量价看板' },
  { page: 'config', label: '配置' },
  { page: 'alerts', label: '预警', disabled: true, hint: '当前版本暂不提供' },
];

export default function PageHeader({ extra }: { title?: string; extra?: ReactNode }) {
  const { go, page } = usePage();
  const [helpOpen, setHelpOpen] = useState(false);
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
      <div style={{ display: 'flex', alignItems: 'center', gap: space.md }}>
        <span style={{ fontSize: fontSize.bodyMd, fontWeight: 600, color: color.ink }}>PriceLens</span>
        {/* 分析模式页签：国家口径并入此处，各页筛选条不再重复国家框 */}
        <span
          aria-current="true"
          style={{
            display: 'inline-flex', alignItems: 'center', height: 28, padding: '0 12px',
            borderRadius: radius.pill, fontSize: fontSize.caption, fontWeight: 600,
            color: selectSoftInk, background: selectSoft, border: `1px solid ${selectAccent}`,
          }}
        >
          单国家分析
        </span>
        <span
          aria-disabled="true"
          style={{
            display: 'inline-flex', alignItems: 'center', height: 28, padding: '0 12px',
            borderRadius: radius.pill, fontSize: fontSize.caption, fontWeight: 600,
            color: color.hairlineStrong, background: color.canvas, border: `1px solid ${color.hairline}`,
            cursor: 'not-allowed',
          }}
        >
          区域分析
        </span>
        <span aria-hidden style={{ width: 1, height: 22, background: color.hairline }} />
        <ConfigProvider theme={filterBarTheme}>
          <div style={{ width: 190 }}>
            <CountryBox />
          </div>
        </ConfigProvider>
      </div>
      <div style={{ display: 'flex', gap: space.sm, alignItems: 'center' }}>
        {TABS.map((t) =>
          t.disabled ? (
            <Tooltip key={t.page} title={t.hint}>
              <Button size="small" style={{ height: 28 }} disabled>
                {t.label}
              </Button>
            </Tooltip>
          ) : (
            <Button
              key={t.page}
              size="small"
              style={{ height: 28 }}
              type={page === t.page ? 'primary' : 'default'}
              onClick={page === t.page ? undefined : () => go(t.page)}
            >
              {t.label}
            </Button>
          ),
        )}
        {extra}
        <Tooltip title="数据口径说明">
          <button
            type="button"
            aria-label="数据口径说明"
            onClick={() => setHelpOpen(true)}
            style={{
              width: 24,
              height: 24,
              display: 'grid',
              placeItems: 'center',
              padding: 0,
              border: `1px solid ${color.hairline}`,
              borderRadius: radius.pill,
              background: color.canvas,
              color: color.mute,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <QuestionCircleOutlined style={{ fontSize: 13 }} />
          </button>
        </Tooltip>
      </div>
      <DataHelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </header>
  );
}
