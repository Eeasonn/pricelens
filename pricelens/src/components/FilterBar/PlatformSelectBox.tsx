// ============================================================
// §5.2 全局平台筛选器（2026-11-05，Eason 指令）：「删除店铺同步 + 删除每产品
// 选店铺，改为在顶部产品后面加一个平台筛选器，它筛选的结果作用于底下所有的
// 产品。不允许每个产品单独选择平台店铺。」
// 2026-11-14（Eason「平台应该还是能选到店铺的，只不过我们的逻辑是，每周默认
// 取折扣率最大的店铺」）：店铺级选择回归本筛选器——两级选项 = 平台（可选）+
// 其下店铺/渠道（缩进可选）；「默认」顶部按钮口径不变。取价语义（数据层不变）：
//   选店铺 = { platforms: [], shopIds: [渠道id] }（effectiveChannelIds 严格单渠道，
//   每周恒取该店铺价）；选平台 = { platforms: [平台], shopIds: [] }（该平台全部
//   渠道，取价 = 平台内每周最低价店铺 = 每周折扣率最大的店铺）；「默认」= null
//   （配置默认店铺 → 默认平台自动口径，同「每周折扣率最大」逻辑）。
// 视觉 = FilterBar 既有筛选器同语言（国家/币种同款 antd Select，店铺行缩进不新增
// 形态）；写入 state.platform（价格走势 / 量价两页共用同一筛选状态，URL shop= 链接
// 与总览矩阵同键；2026-11-14 起稳定版同样承载店铺级——platformLevelForChannel
// 降级闸退役为透传）。读侧归一：normalizePlatformSelection 单渠道/单平台取一。
// 国家切换：默认解析随 cc 自动跟随；不属于新国家的选择由 applyScopeDefaults
// / platformSelectionValidFor 重置（FiltersContext 既有逻辑，此处不重复处理）。
// ============================================================
import { useMemo } from 'react';
import { Select } from 'antd';
import { useFilters } from '../../state/FiltersContext';
import { dimChannel } from '../../data';
import { defaultPlatformAnchorOf } from '../../dataModel/aggregate';
import { normalizePlatformSelection } from '../../state/urlSync';

/** 选项值前缀：平台级 plat:<平台名> / 店铺级 chan:<渠道id>（防平台名与渠道 id 撞值） */
const PLAT_PREFIX = 'plat:';
const CHAN_PREFIX = 'chan:';
/** 店铺行缩进（输入框展示时由 labelRender 剥掉，仅下拉内可见层级） */
const SHOP_INDENT = '\u2003';

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

  // 两级选项：平台行（可选 = 平台内每周折扣率最大店铺口径）+ 其下店铺行（缩进，
  // 可选 = 钉该店铺每周取价）。value 带前缀防撞；店铺行 label 缩进仅在下拉内呈现。
  const options = useMemo(() => {
    const out: { value: string; label: string }[] = [];
    for (const p of platforms) {
      out.push({ value: `${PLAT_PREFIX}${p}`, label: p });
      for (const c of dimChannel) {
        if (c.country_code === cc && c.platform === p) {
          out.push({ value: `${CHAN_PREFIX}${c.channel_id}`, label: `${SHOP_INDENT}${c.display_name}` });
        }
      }
    }
    return out;
  }, [cc, platforms]);

  // 显式选择归一读取：平台级取第一个；店铺级（本筛选器/总览级联/旧链接 shop=）原样。
  // 多平台并集（总览级联/Agent 补丁写入）单选表达不了 → 如实显示全量到占位
  // （value 置空不落高亮），state/URL/计算口径不受显示层影响，用户再选即替换为单选。
  const sel = normalizePlatformSelection(state.platform);
  const shopId = sel?.shopIds[0] ?? null;
  const shopName = shopId ? dimChannel.find((c) => c.channel_id === shopId)?.display_name ?? null : null;
  const multiPlatformLabel = state.platform && state.platform.shopIds.length === 0 && state.platform.platforms.length > 1
    ? state.platform.platforms.join('、')
    : null;
  const selectedValue = shopId
    ? `${CHAN_PREFIX}${shopId}`
    : sel?.platforms[0]
      ? `${PLAT_PREFIX}${sel.platforms[0]}`
      : undefined;
  const autoLabel = defaultPlatform ? `默认 · ${defaultPlatform}` : '默认 · 全部';
  const isAuto = selectedValue === undefined && multiPlatformLabel == null;

  // 2026-11-11 Eason：「默认」不再是与平台平齐的选项（会出现 Jarir 重复两项），
  // 提出为下拉顶部按钮——选中态高亮，点击回自动口径
  const defaultButton = (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={isAuto}
      onClick={() => actions.set({ platform: null })}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          actions.set({ platform: null });
        }
      }}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        margin: 4, padding: '5px 8px', borderRadius: 6, cursor: 'pointer',
        background: isAuto ? 'rgba(0, 112, 243, 0.10)' : 'transparent',
        color: isAuto ? '#0062d9' : 'rgba(0, 0, 0, 0.88)',
        fontWeight: isAuto ? 600 : 400, fontSize: 14,
      }}
    >
      <span>{autoLabel}</span>
      {isAuto ? <span style={{ fontSize: 12 }}>✓</span> : null}
    </div>
  );

  return (
    <Select
      key={selectedValue ?? multiPlatformLabel ?? '__auto__'}
      id="scope-platform"
      aria-label="平台"
      value={selectedValue}
      // 未选（自动口径）= 无值 + 占位「默认 · …」；key 随状态重挂载，
      // 防 rc-select 半受控下按钮回到自动后残留上一次平台文案
      placeholder={multiPlatformLabel ?? autoLabel}
      allowClear={false}
      // 选中项展示：店铺剥掉缩进只出店铺名（平台归属由下拉层级表达）
      labelRender={({ label }) => <span>{String(label ?? '').replace(/^\u2003+/, '')}</span>}
      onChange={(v) => {
        const s = String(v);
        if (s.startsWith(PLAT_PREFIX)) {
          actions.set({ platform: { platforms: [s.slice(PLAT_PREFIX.length)], shopIds: [] } });
        } else if (s.startsWith(CHAN_PREFIX)) {
          actions.set({ platform: { platforms: [], shopIds: [s.slice(CHAN_PREFIX.length)] } });
        }
      }}
      options={options}
      dropdownRender={(menu) => (
        <>
          {defaultButton}
          <div style={{ height: 1, background: 'rgba(5, 5, 5, 0.06)', margin: '4px 0' }} />
          {menu}
        </>
      )}
      style={{ width: '100%' }}
    />
  );
}
