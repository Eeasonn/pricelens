// ============================================================
// 共享页头（预警中心重构）：四页统一 64px 铬架——左 = PriceLens · 单国家分析
// 徽标 + 国家选择器（从各页筛选条收除，全站唯一入口在页签组）；右 = 分析页签
// （价格看板/量价看板/定价推演）+ 管理页签（配置/预警）+ 🔔预警入口由各页自担
// + 页签当前页墨色下划线指示。配置页的「保存配置」走 extra 插槽。
// 第一百三十七轮：右上角新增问号入口 → 数据口径说明弹窗（取价/默认店铺/
// 比价/销量估算/数据质量等全部处理规则的业务语言说明）。
// 第一百八十二轮（评审落地）：①置灰的「总览」「区域分析」撤出页头（不可用的
// 入口不再长期占据主导航，功能随迭代回归时再上架）②描边按钮页签改安静的文字
// 页签 + 当前页唯一下划线指示，降低控制面板感 ③分析页签与管理页签之间加短
// 竖线轻微分组 ④当前页 aria-current="page" ⑤页头允许换行（窄视口不再横向裁切）。
// ============================================================
import { useState, type ReactNode } from 'react';
import { ConfigProvider, Tooltip } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { usePage, type Page } from '../state/PageContext';
import { filterBarTheme } from './FilterBar';
import CountryBox from './FilterBar/CountryBox';
import DataHelpModal from './DataHelpModal';
import { color, fontSize, radius, selectAccent, selectSoft, selectSoftInk, shadow, space } from '../theme/tokens';

/** 页签两组：分析（看板/推演）与管理（配置/预警），组间短竖线分隔 */
const TABS: { page: Page; label: string; group: 'analysis' | 'manage' }[] = [
  { page: 'dashboard', label: '价格看板', group: 'analysis' },
  { page: 'volume', label: '量价看板', group: 'analysis' },
  { page: 'pricing', label: '定价推演', group: 'analysis' },
  { page: 'config', label: '配置', group: 'manage' },
  { page: 'alerts', label: '预警', group: 'manage' },
];

export default function PageHeader({ extra }: { title?: string; extra?: ReactNode }) {
  const { go, page } = usePage();
  const [helpOpen, setHelpOpen] = useState(false);
  return (
    <header
      style={{
        minHeight: 64,
        flexShrink: 0,
        background: color.canvas,
        boxShadow: shadow.l1,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: `4px ${space.md}px`,
        padding: `4px ${space.lg}px`,
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: space.md, minWidth: 0 }}>
        <span style={{ fontSize: fontSize.bodyMd, fontWeight: 600, color: color.ink }}>PriceLens</span>
        {/* 分析范围徽标：国家口径并入此处，各页筛选条不再重复国家框 */}
        <span
          style={{
            display: 'inline-flex', alignItems: 'center', height: 28, padding: '0 12px',
            borderRadius: radius.pill, fontSize: fontSize.caption, fontWeight: 600,
            color: selectSoftInk, background: selectSoft, border: `1px solid ${selectAccent}`,
          }}
        >
          单国家分析
        </span>
        <span aria-hidden style={{ width: 1, height: 22, background: color.hairline }} />
        <ConfigProvider theme={filterBarTheme}>
          <div style={{ width: 190, maxWidth: '100%' }}>
            <CountryBox />
          </div>
        </ConfigProvider>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
        <nav aria-label="页面" style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          {TABS.map((t, i) => (
            <span key={t.page} style={{ display: 'inline-flex', alignItems: 'center', gap: 14 }}>
              {/* 分析页签与管理页签之间短竖线轻微分组 */}
              {i > 0 && TABS[i - 1].group !== t.group && (
                <span aria-hidden style={{ width: 1, height: 16, background: color.hairline, marginRight: -4 }} />
              )}
              <button
                type="button"
                aria-current={page === t.page ? 'page' : undefined}
                onClick={page === t.page ? undefined : () => go(t.page)}
                style={{
                  height: 30,
                  padding: '0 2px',
                  borderBottom: `2px solid ${page === t.page ? color.ink : 'transparent'}`,
                  fontSize: 13,
                  fontWeight: page === t.page ? 600 : 400,
                  color: page === t.page ? color.ink : color.body,
                  cursor: page === t.page ? 'default' : 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {t.label}
              </button>
            </span>
          ))}
        </nav>
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
