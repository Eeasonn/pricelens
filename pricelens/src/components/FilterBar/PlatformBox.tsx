// ============================================================
// §5.3 框三：平台 / 店铺 —— 「平台→店铺」两级单选（Eason：只能单选到一个
// 平台一个店铺）。交互 = antd Select 分组选项，单次点击即选定「平台+店铺」：
//   组标题 = 平台名（带「· N 店铺」小注）；
//   组内 option = 该平台的渠道（label = 渠道 display_name，如「OZON 3P」「DNS 独立站」）；
//   showSearch 按店铺名（含平台名）过滤。
// 状态写入（数据层 effectiveChannelIds 的并集规则：shopIds 命中即入池，店铺级
// 选择绝不能同时写 platforms，否则整平台渠道全部入池）：
//   选店铺 = { platforms: [], shopIds: [channel_id] }；清除（allowClear）= null。
// 未选占位 = 默认口径：配置页「默认平台店铺」（defaultChannelOf，channel 级）
//   有值显示「默认 · {店铺名}」，无值显示「默认 · {defaultPlatformOf}」；
//   数据层未选时按同一优先级解析（defaultChannelOf → defaultPlatformOf），两侧同构。
// 旧平台级形态（plat= 链接 / 旧持久化 platforms:[p]）读入照常兼容：触发器
//   直接显示平台名（值不命中任何渠道 option，Select 按原值呈现）。
// ============================================================
import { useMemo } from 'react';
import { Select } from 'antd';
import type { DefaultOptionType } from 'antd/es/select';
import { useFilters } from '../../state/FiltersContext';
import { defaultChannelOf, defaultPlatformOf } from '../../dataModel/aggregate';
import { dimChannel } from '../../data';
import { color, fontSize, radius, selectSoft, selectSoftInk } from '../../theme/tokens';
import { normalizePlatformSelection } from '../../state/urlSync';

interface ChannelRow {
  channel_id: string;
  platform: string;
  display_name: string;
  shops: number;
}

/** 「默认」小徽标：组标题 / 选项内复用（与旧平台级徽标同一视觉语言） */
function DefaultPill() {
  return (
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
  );
}

export default function PlatformBox() {
  const { state, actions } = useFilters();
  const cc = state.countryCode;

  // 平台 → 渠道分组（仅当前国家）：组内渠道保持维表序，组序 = 平台首次出现序
  const groups = useMemo(() => {
    const byPlatform = new Map<string, { shops: number; channels: ChannelRow[] }>();
    for (const c of dimChannel) {
      if (c.country_code !== cc) continue;
      let g = byPlatform.get(c.platform);
      if (!g) byPlatform.set(c.platform, (g = { shops: 0, channels: [] }));
      g.shops += c.shops;
      g.channels.push({ channel_id: c.channel_id, platform: c.platform, display_name: c.display_name, shops: c.shops });
    }
    return [...byPlatform.entries()].map(([platform, g]) => ({ platform, shops: g.shops, channels: g.channels }));
  }, [cc]);

  // 默认口径（与数据层 effectiveChannelIds 未选分支同构）：配置的默认店铺 → 默认平台
  const defaultChannelId = useMemo(() => defaultChannelOf(cc), [cc]);
  const defaultPlatform = useMemo(() => defaultPlatformOf(cc), [cc]);
  const defaultChannelName = useMemo(
    () => dimChannel.find((c) => c.channel_id === defaultChannelId)?.display_name ?? null,
    [defaultChannelId],
  );

  // 单选归一读取：店铺级命中渠道 option → 触发器显示店铺 display_name；
  // 仅平台级（旧兼容）→ 值不命中渠道 id，Select 按原值显示平台名
  const sel = normalizePlatformSelection(state.platform);
  const value = sel?.shopIds[0] ?? sel?.platforms[0];

  const placeholder = defaultChannelName
    ? `默认 · ${defaultChannelName}`
    : defaultPlatform
      ? `默认 · ${defaultPlatform}`
      : '未筛选';

  // 选项树：组 = 平台（title 供原生 tooltip），叶子 = 渠道（label = display_name，
  // search 供 showSearch 过滤，channel 供 optionRender 取店铺数小注）
  const options = useMemo<DefaultOptionType[]>(
    () =>
      groups.map((g) => ({
        label: (
          <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontWeight: 600 }}>{g.platform}</span>
            <span style={{ fontSize: fontSize.caption, color: color.mute }}>· {g.shops} 店铺</span>
            {defaultChannelId == null && g.platform === defaultPlatform && <DefaultPill />}
          </span>
        ),
        title: g.platform,
        options: g.channels.map((c) => ({
          value: c.channel_id,
          label: c.display_name,
          search: `${c.display_name} ${c.platform}`.toLowerCase(),
          channel: c,
        })),
      })),
    [groups, defaultChannelId, defaultPlatform],
  );

  return (
    <Select
      aria-label="平台 / 店铺"
      style={{ width: '100%' }}
      popupMatchSelectWidth={false}
      value={value}
      placeholder={placeholder}
      allowClear
      showSearch
      // 按店铺名（含平台名）过滤；分组标题不参与，命中叶子选项即可
      filterOption={(input, option) => String(option?.search ?? '').includes(input.trim().toLowerCase())}
      // 选店铺 = 单渠道口径（绝不同时带 platforms，见文件头）；清除 = 回默认口径
      onChange={(v) =>
        actions.set({ platform: typeof v === 'string' ? { platforms: [], shopIds: [v] } : null }) // §5.6 切换口径：仅改聚合入参，不动图窗与粒度
      }
      options={options}
      optionRender={(opt) => {
        const channel = (opt as { channel?: ChannelRow }).channel;
        return (
          <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
            <span>{opt.label}</span>
            {channel != null && (
              <span style={{ fontSize: fontSize.caption, color: color.mute }}>· {channel.shops} 店铺</span>
            )}
            {channel?.channel_id === defaultChannelId && <DefaultPill />}
          </span>
        );
      }}
      // 触发器内所选店铺名过长时省略号（下拉弹层 popupMatchSelectWidth=false 不受限）
      optionLabelProp="label"
    />
  );
}
