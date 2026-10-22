// ============================================================
// §5.3 框三：平台 —— 单选下拉（平台筛选器从多选级联改回单选：平台口径只能单选）。
// 选项 = 当前国家的平台列表（dimChannel 按平台去重，附「· N 店铺」小注）；
// 未选 / 清除 = 该国默认电渠（dim_region.default_platform，R国=DNS），
// 触发器以「默认 · DNS」业务语言占位；选中平台后直接显示平台名。
// 状态形状（SeriesQuery.platform 同构，单选 = platforms:[一个] 的特例）：
// { platforms: [p], shopIds: [] } | null（null = 默认电渠，数据层 effectiveChannelIds 解析）。
// 旧的「平台→店铺」两层级联与店铺级下钻 UI 整体退役（数据层渠道级能力保留）；
// 旧多选形态的链接 / 持久化读入时按 normalizePlatformSelection 归一为单选。
// ============================================================
import { useMemo } from 'react';
import { Select } from 'antd';
import { useFilters } from '../../state/FiltersContext';
import { dimChannel, dimRegion } from '../../data';
import { color, fontSize, radius, selectSoft, selectSoftInk } from '../../theme/tokens';
import { normalizePlatformSelection } from '../../state/urlSync';

interface PlatformRow {
  platform: string;
  shops: number; // 平台下全部渠道的店铺数合计（与旧渠道级「· N 店」同一口径）
}

export default function PlatformBox() {
  const { state, actions } = useFilters();
  const cc = state.countryCode;
  const rows = useMemo<PlatformRow[]>(() => {
    const shopsByPlatform = new Map<string, number>();
    for (const c of dimChannel) {
      if (c.country_code !== cc) continue;
      shopsByPlatform.set(c.platform, (shopsByPlatform.get(c.platform) ?? 0) + c.shops);
    }
    return [...shopsByPlatform.entries()].map(([platform, shops]) => ({ platform, shops }));
  }, [cc]);
  const defaultPlatform = useMemo(
    () => dimRegion.find((r) => r.country_code === cc)?.default_platform ?? rows[0]?.platform ?? '',
    [cc, rows],
  );

  // 单选归一读取：旧多选持久化 / 旧多值链接进来也只呈现第一个平台
  const selectedPlatform = normalizePlatformSelection(state.platform)?.platforms[0];

  const options = rows.map((r) => ({ value: r.platform, label: r.platform }));

  return (
    <Select
      aria-label="平台"
      style={{ width: '100%' }}
      popupMatchSelectWidth={false}
      value={selectedPlatform}
      placeholder={defaultPlatform ? `默认 · ${defaultPlatform}` : '未筛选'}
      allowClear
      // 选平台 = 整平台口径（勾其下全部渠道）；清除 = 回该国默认电渠
      onChange={(p) =>
        actions.set({ platform: p != null ? { platforms: [p], shopIds: [] } : null }) // §5.6 切换平台：仅改聚合入参，不动图窗与粒度
      }
      options={options}
      optionRender={(opt) => {
        const row = rows.find((r) => r.platform === opt.value);
        const isDefault = opt.value === defaultPlatform;
        return (
          <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
            <span>{opt.label}</span>
            {row != null && (
              <span style={{ fontSize: fontSize.caption, color: color.mute }}>· {row.shops} 店铺</span>
            )}
            {isDefault && (
              <span
                style={{
                  fontSize: fontSize.caption,
                  lineHeight: '16px',
                  padding: '0 5px',
                  borderRadius: radius.pill,
                  background: selectSoft,
                  color: selectSoftInk,
                  alignSelf: 'center',
                }}
              >
                默认
              </span>
            )}
          </span>
        );
      }}
    />
  );
}
