// ============================================================
// 筛选条首槽「分析范围」（2026-11-27 PriceAgent 改造）：
// 原「产业」下拉退役——国家选择器（地区部 → 国家级联）从页头下移到这个槽位，
// 成为国家口径在全站筛选条上的唯一入口；产业不再作为独立筛选控件，并入
// 「产业与产品」选择面板作整个面板的全局范围开关（见 FilterBar / ProductPickerModal）。
// 外部不显示「国家」标题，控件自身 aria-label 保留。
// ============================================================
import { color } from '../../theme/tokens';
import CountryBox from './CountryBox';

/** 分析范围 = 国家（地区部 → 国家）。产业在「产业与产品」面板内切换，各页不再重复。
 *  槽宽 168：与原产业槽（155）同一量级，容纳最长的「中东非 / 阿联酋」路径文案。 */
export default function ScopeFields() {
  return (
    <div role="group" aria-label="分析范围" style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
      <div style={{ width: 168, minWidth: 0, flexShrink: 0 }}><CountryBox /></div>
      <span aria-hidden style={{ width: 1, height: 20, background: color.hairline }} />
    </div>
  );
}
