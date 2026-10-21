// ============================================================
// 筛选条（第一百一十七轮重构：统一产品选择入口）：
// 国家/产业 · [按产品|按档位] + 选择产品（浮窗：主分析卡 + 每卡对比区）
// · 平台 · 币种。原「我司产品级联 vs 竞品级联 + 自动按钮」两个并列筛选器退役
// ——「我司比竞品」的主观预设退场，主分析/对比是用户指定的角色，
// 品牌列里华为与其他品牌并列。
// ============================================================
import { type CSSProperties, type ReactNode, useMemo, useState } from 'react';
import { ConfigProvider, Segmented, Tooltip } from 'antd';
import type { ThemeConfig } from 'antd';
import { DownOutlined } from '@ant-design/icons';
import { color, radius, selectAccent, selectSoft, selectSoftInk, shadow, space } from '../../theme/tokens';
import { TierControl } from './ProductBox';
import PlatformBox from './PlatformBox';
import CurrencyBox from './CurrencyBox';
import ScopeFields from './ScopeFields';
import ProductPickerModal from '../ProductPicker/ProductPickerModal';
import { useFilters } from '../../state/FiltersContext';
import { tierSubjectSelections } from '../../state/tierSelection';
import { brandOfModel, modelNameOf, shortRomram } from '../ProductCascader/tree';
import BrandDot from '../BrandMark';
import { selKey } from '../../state/mainSelection';

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

/** 统一产品选择入口（按产品模式）：摘要 chip → 点击弹「选择产品」浮窗。
 *  摘要 = 首个主分析（品牌点 + 名 · 配置）＋ 主分析数 ＋ 对比款数。 */
function ProductPickerEntry() {
  const { state } = useFilters();
  const [open, setOpen] = useState(false);
  const mains = state.mains;
  const first = mains[0]?.main ?? null;
  const compareCount = useMemo(() => new Set(mains.flatMap((m) => m.compares.map(selKey))).size, [mains]);

  return (
    <>
      <Tooltip
        title={
          mains.length
            ? [
                ...mains.map((m) =>
                  m.main
                    ? `主分析：${modelNameOf(m.main.modelId)}（${shortRomram(m.main.romram)}）`
                    : '主分析：未选择（仅有对比产品）',
                ),
                compareCount ? `对比：共 ${compareCount} 款` : null,
              ]
                .filter(Boolean)
                .join('\n')
            : '点击选择主分析产品与对比产品'
        }
        styles={{ root: { whiteSpace: 'pre-line' } }}
      >
        <div
          role="button"
          aria-label="选择产品"
          onClick={() => setOpen(true)}
          style={{
            height: 30,
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            padding: '0 10px',
            border: `1px solid ${open ? selectAccent : color.hairline}`,
            borderRadius: radius.control,
            background: color.canvas,
            cursor: 'pointer',
            minWidth: 0,
            overflow: 'hidden',
            boxShadow: open ? `0 0 0 1px ${selectAccent}` : undefined,
          }}
        >
          {first ? (
            <>
              <BrandDot brand={brandOfModel(first.modelId)} />
              <span
                style={{
                  fontSize: 13,
                  color: color.ink,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {modelNameOf(first.modelId)}
                <span style={{ color: color.mute }}> · {shortRomram(first.romram)}</span>
                {mains.length > 1 && (
                  <span className="tnum" style={{ color: color.mute }}> ＋{mains.length - 1} 主分析</span>
                )}
                {compareCount > 0 && (
                  <span className="tnum" style={{ color: color.mute }}> · 对比 {compareCount}</span>
                )}
              </span>
            </>
          ) : (
            <span style={{ fontSize: 13, color: color.mute, whiteSpace: 'nowrap' }}>选择产品…</span>
          )}
          <DownOutlined style={{ marginLeft: 'auto', fontSize: 10, color: color.mute, flexShrink: 0 }} />
        </div>
      </Tooltip>
      <ProductPickerModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** 按档位模式：入口位退化为只读摘要（微调请切回按产品）。 */
function TierSummary() {
  const { state } = useFilters();
  const resolved = state.tier ? tierSubjectSelections(state.industry, state.tier) : null;
  const cards = resolved ?? state.mains;
  const compareCount = new Set(cards.flatMap((m) => m.compares.map(selKey))).size;
  return (
    <Tooltip title={compareCount > 0 ? `该档位自动集结，对比 ${compareCount} 款` : '该档位暂无对标产品'}>
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
        {compareCount > 0 ? `随档位带出 · 对比 ${compareCount} 款` : '该档位暂无对标产品'}
      </div>
    </Tooltip>
  );
}

/** One global row: country and industry scope, then the unified product picker,
 *  then platform and currency. 第一百一十五轮：平台与币种收进顶部筛选条（各看板
 *  标题行不再重复），整行不换行——选择产品列弹性收缩，平台/币种定宽保底。 */
export default function FilterBar({ onBack: _onBack }: { onBack?: () => void }) {
  const { state, actions } = useFilters();
  return (
    <div style={{ padding: `${space.md}px ${space.lg}px 0` }}>
      <ConfigProvider theme={filterBarTheme}>
        <section className="lpl-fb" style={{ background: color.canvas, boxShadow: shadow.l1, borderRadius: radius.card, padding: `8px ${space.lg}px` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 30, flexWrap: 'nowrap' }}>
            <ScopeFields />
            <div style={{ flex: '1 1 320px', minWidth: 240, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Segmented
                size="small"
                value={state.subjectMode}
                onChange={(v) => actions.set({ subjectMode: v as 'product' | 'tier' })}
                options={[{ label: '按产品', value: 'product' }, { label: '按档位', value: 'tier' }]}
              />
              <div style={{ minWidth: 0, flex: 1 }}>
                {state.subjectMode === 'product' ? <ProductPickerEntry /> : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ minWidth: 0, flex: 1 }}><TierControl /></div>
                    <div style={{ minWidth: 0, flex: 1 }}><TierSummary /></div>
                  </div>
                )}
              </div>
            </div>
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
