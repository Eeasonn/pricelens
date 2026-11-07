// ============================================================
// §5.2 全局平台筛选器（2026-11-05，Eason 指令）：「删除店铺同步 + 删除每产品
// 选店铺，改为在顶部产品后面加一个平台筛选器，它筛选的结果作用于底下所有的
// 产品。不允许每个产品单独选择平台店铺。」
// 视觉 = FilterBar 既有筛选器同语言（国家/币种同款 antd 控件，不新增形态）；
// 选项 = 当前国家 dim_channel 的平台集合（首次出现序）；首位「默认」项 =
// 现默认平台（defaultPlatformAnchorOf：配置默认店铺归属平台 → 国家默认平台）。
// 写入 state.platform（价格走势 / 量价两页共用同一筛选状态，URL plat= 链接
// 与总览矩阵同键）：
//   选平台 = { platforms: [平台], shopIds: [] }（平台级单选，数据层
//   effectiveChannelIds 并集解析 = 该平台全部渠道，取价沿用「平台内每周最低价
//   店铺」口径——用户不可再选具体店铺）；
//   「默认」= null（未选 = 默认店铺 / 默认平台自动口径）。
// 读侧归一：店铺级选择（总览级联 / 旧链接 shop= 残留）按渠道反查显示其平台。
// 国家切换：默认解析随 cc 自动跟随；不属于新国家的选择由 applyScopeDefaults
// / platformSelectionValidFor 重置（FiltersContext 既有逻辑，此处不重复处理）。
// ============================================================
import { useMemo } from 'react';
import { Select } from 'antd';
import { useFilters } from '../../state/FiltersContext';
import { dimChannel } from '../../data';
import { defaultPlatformAnchorOf } from '../../dataModel/aggregate';
import { normalizePlatformSelection } from '../../state/urlSync';

/** 「默认」项哨兵值（不与平台名冲突）：写回 state.platform = null */
const AUTO_VALUE = '__default__';

export default function PlatformSelectBox() {
  const { state, actions } = useFilters();
  const cc = state.countryCode;

  // 平台选项 = 该国 dim_channel 平台集合（组序 = 平台首次出现序，与 PlatformBox 左列同源）
  const platforms = useMemo(() => {
    const out: string[] = [];
    for (const c of dimChannel) {
      if (c.country_code !== cc) continue;
      if (!out.includes(c.platform)) out.push(c.platform);
    }
    return out;
  }, [cc]);

  // 未选时呈现的默认平台（配置默认店铺归属平台 → 国家默认平台）
  const defaultPlatform = useMemo(() => defaultPlatformAnchorOf(cc), [cc]);

  // 显式选择归一读取：平台级取第一个；店铺级（旧链接/总览级联写入）反查所属平台。
  // R7-M1：稳定版归一可产出多平台并集（店铺展开 + 显式平台去重）——单选 Select
  // 无法表达多选态时如实显示全量（无对应 option 不落高亮），用户再选任一平台
  // 即替换为单选；state/URL/计算口径不受显示层影响。
  const sel = normalizePlatformSelection(state.platform);
  const shopPlatform = sel != null && sel.shopIds.length > 0
    ? dimChannel.find((c) => c.channel_id === sel.shopIds[0])?.platform ?? null
    : null;
  const multiPlatformLabel = state.platform && state.platform.shopIds.length === 0 && state.platform.platforms.length > 1
    ? state.platform.platforms.join('、')
    : null;
  const explicitPlatform = multiPlatformLabel ?? sel?.platforms[0] ?? shopPlatform ?? null;

  return (
    <Select
      id="scope-platform"
      aria-label="平台"
      value={explicitPlatform ?? AUTO_VALUE}
      onChange={(v) => {
        if (v === AUTO_VALUE) actions.set({ platform: null });
        else actions.set({ platform: { platforms: [v], shopIds: [] } });
      }}
      options={[
        { value: AUTO_VALUE, label: defaultPlatform ? `默认 · ${defaultPlatform}` : '默认 · 全部' },
        ...platforms.map((p) => ({ value: p, label: p })),
      ]}
      style={{ width: '100%' }}
    />
  );
}
