import { type CSSProperties, type ReactNode } from 'react';
import { ConfigProvider } from 'antd';
import type { ThemeConfig } from 'antd';
import { color, radius, selectAccent, selectSoft, selectSoftInk, shadow, space } from '../../theme/tokens';
import { AutoMatchControl, CompetitorControl, OwnProductControl } from './ProductBox';
import ScopeFields from './ScopeFields';
import { useFilters } from '../../state/FiltersContext';

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
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
      {ownSelected && <AutoMatchControl />}
      <div style={{ flex: 1, minWidth: 0 }}><CompetitorControl /></div>
    </div>
  );
}

/** One global row: country and industry scope, then own product and editable comparison. */
export default function FilterBar({ onBack }: { onBack: () => void }) {
  return (
    <div style={{ padding: `${space.md}px ${space.lg}px 0` }}>
      <ConfigProvider theme={filterBarTheme}>
        <section className="lpl-fb" style={{ background: color.canvas, boxShadow: shadow.l1, borderRadius: radius.card, padding: `8px ${space.lg}px` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 30 }}>
            <ScopeFields />
            <div style={{ flex: '1 1 285px', minWidth: 0 }}><Field label="我司产品"><OwnProductControl productLevel /></Field></div>
            <div style={{ flex: '1 1 290px', minWidth: 0 }}><Field label="竞品"><ComparisonControl /></Field></div>
            <button
              type="button" onClick={onBack} title="返回总览页并定位到该产品行组"
              style={{ flexShrink: 0, border: 0, background: 'transparent', color: color.link, font: 'inherit', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
            >
              ← 返回总览
            </button>
          </div>
        </section>
      </ConfigProvider>
    </div>
  );
}
