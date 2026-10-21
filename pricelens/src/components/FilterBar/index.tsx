import { type CSSProperties, type ReactNode } from 'react';
import { ConfigProvider, Segmented, Tooltip } from 'antd';
import type { ThemeConfig } from 'antd';
import { color, radius, selectAccent, selectSoft, selectSoftInk, shadow, space } from '../../theme/tokens';
import { AutoMatchControl, CompetitorControl, OwnProductControl, TierControl } from './ProductBox';
import PlatformBox from './PlatformBox';
import CurrencyBox from './CurrencyBox';
import ScopeFields from './ScopeFields';
import { useFilters } from '../../state/FiltersContext';
import { tierSubjectSelections } from '../../state/tierSelection';
import { modelNameOf, shortRomram } from '../ProductCascader/tree';

/** Also used by the overview's product controls. */
export const filterBarTheme: ThemeConfig = {
  token: { colorPrimary: selectAccent, controlHeight: 30, controlHeightSM: 24, fontSize: 13, fontSizeSM: 12 },
  components: {
    Button: { colorPrimary: color.ink },
    Segmented: { itemSelectedBg: selectSoft, itemSelectedColor: selectSoftInk },
    Select: { optionSelectedBg: selectSoft, optionSelectedColor: selectSoftInk },
    Cascader: { optionSelectedBg: selectSoft, optionSelectedColor: selectSoftInk },
  },
};

const labelStyle: CSSProperties = { fontSize: 12, color: color.mute, whiteSpace: 'nowrap', flexShrink: 0 };

function Field({ label, width, children }: { label: string; width?: number; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, width, minWidth: 0 }}>
      <span style={labelStyle}>{label}</span>
      <div style={{ minWidth: 0, flex: 1 }}>{children}</div>
    </div>
  );
}

function ComparisonControl() {
  const { state } = useFilters();
  // 第八十五轮：未选我司产品时自动匹配无锚点（空转）→ 整体隐藏，竞品池自由勾选
  const ownSelected = state.own.length > 0;
  // 按档位模式：竞品随档位自动集结，选择器退化为只读摘要（微调请切回按产品）
  if (state.subjectMode === 'tier') {
    const resolved = state.tier ? tierSubjectSelections(state.industry, state.tier) : null;
    const comps = resolved?.competitors ?? [];
    const names = comps.map((c) => `${modelNameOf(c.modelId)} ${shortRomram(c.romram)}`);
    return (
      <Tooltip title={names.length > 0 ? names.join('、') : '该档位暂无对标竞品'}>
        <div
          style={{
            height: 30,
            display: 'flex',
            alignItems: 'center',
            padding: '0 10px',
            border: `1px dashed ${color.hairlineStrong}`,
            borderRadius: radius.control,
            fontSize: 12.5,
            color: color.body,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            minWidth: 0,
            flex: 1,
          }}
        >
          {names.length > 0 ? `随档位带出 · ${comps.length} 款竞品` : '该档位暂无对标竞品'}
        </div>
      </Tooltip>
    );
  }
  // 第一百一十五轮（评审）：选中「自动」= 竞品随我司产品自动带出，竞品筛选器
  // 直接隐藏（退出自动才显示）；未选我司产品时维持第八十五轮的自由勾选池
  const autoOn = ownSelected && state.autoMatch;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
      {ownSelected && <AutoMatchControl />}
      {!autoOn && <div style={{ flex: 1, minWidth: 0 }}><CompetitorControl /></div>}
    </div>
  );
}

/** One global row: country and industry scope, then own product and editable comparison.
 *  第一百一十五轮（评审）：平台与币种收进顶部筛选条（各看板标题行不再重复），
 *  整行不换行——我司/竞品列弹性收缩，平台/币种定宽保底。 */
export default function FilterBar({ onBack: _onBack }: { onBack?: () => void }) {
  const { state, actions } = useFilters();
  return (
    <div style={{ padding: `${space.md}px ${space.lg}px 0` }}>
      <ConfigProvider theme={filterBarTheme}>
        <section className="lpl-fb" style={{ background: color.canvas, boxShadow: shadow.l1, borderRadius: radius.card, padding: `8px ${space.lg}px` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 30, flexWrap: 'nowrap' }}>
            <ScopeFields />
            <div style={{ flex: '1 1 280px', minWidth: 220, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Segmented
                size="small"
                value={state.subjectMode}
                onChange={(v) => actions.set({ subjectMode: v as 'product' | 'tier' })}
                options={[{ label: '按产品', value: 'product' }, { label: '按档位', value: 'tier' }]}
              />
              <div style={{ minWidth: 0, flex: 1 }}>
                {state.subjectMode === 'product' ? <OwnProductControl /> : <TierControl />}
              </div>
            </div>
            {state.subjectMode === 'product' && (
              <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 600, color: color.mute }}>vs</span>
            )}
            <div style={{ flex: '1 1 230px', minWidth: 200 }}><Field label="竞品"><ComparisonControl /></Field></div>
            <span aria-hidden style={{ width: 1, height: 20, background: color.hairline, flexShrink: 0 }} />
            <div style={{ flexShrink: 0, width: 168 }}><Field label="平台"><PlatformBox /></Field></div>
            <span aria-hidden style={{ width: 1, height: 20, background: color.hairline, flexShrink: 0 }} />
            <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={labelStyle}>币种</span>
              <CurrencyBox />
            </div>
          </div>
        </section>
      </ConfigProvider>
    </div>
  );
}
