// ============================================================
// §5.2 平台 / 类型 / 店铺 三级级联筛选器（2026-11-17，Eason「还是要提供一个和
// 产品筛选风格一样的平台、类型、店铺的筛选器，只不过我平台默认一个，然后又
// 进一步每一周都默认该平台下价格最低的店铺价格」）：替换价格/量价两页筛选条的
// PlatformSelectBox（单 Select 两级），视觉/交互 = PlatformBox 级联同语言
// （总览矩阵仍在用；本组件为看板条专用）。
// 三列语义（与 PlatformBox 的「平台→渠道→卖家」不同）：
//   左列 平台行 = 导航（激活中/右列）；中列 类型行 = 提交（首行「全部类型 ·
//   最低价」= 平台级口径，各类型行 = 平台+类型口径）；右列 店铺行 = 提交
//   （钉具体渠道）。取价语义（数据层 effectiveChannelIds）：
//     平台级 = 该平台全部渠道、每周取池内最低在架价（店铺每周动态、平台恒定）；
//     类型级 = 平台 ∩ 类型（types 维度，PlatformSelection.types 2026-11-17 新增）；
//     店铺级 = 严格单渠道每周恒取。
//   自动口径（null）= 产品级人工指定渠道（配置页覆盖）→ 默认平台全部渠道池
//   （2026-11-17 起 = 平台内每周最低价店铺；主店单渠道锚退役）。
// 触发器占位 = 「默认 · {平台锚}」——「平台默认一个」在未交互时即所见。
// URL：plat=/shop= 键不变；types 序列化 `ctype=1P,3P`（urlSync 对称读写，旧
// 链接无此键 = 全部类型，逐字节兼容）。
// ============================================================
import { useEffect, useMemo, useState } from 'react';
import { Button, Popover } from 'antd';
import { useFilters } from '../../state/FiltersContext';
import { defaultPlatformAnchorOf } from '../../dataModel/aggregate';
import { dimChannel } from '../../data';
import type { DimChannel, StoreType } from '../../dataModel/types';
import { color, fontSize, radius, selectSoft, selectSoftInk, space } from '../../theme/tokens';
import { useNarrowViewport } from '../../state/useNarrowViewport';
import { CascadePanel, CascadeTrigger } from '../ProductCascader';
import type { CascadeRowItem } from '../ProductCascader';

/** 「默认」小徽标（PlatformBox 同款视觉语言） */
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
        flexShrink: 0,
      }}
    >
      默认
    </span>
  );
}

/** 行尾小注（「· N 店铺」）+ 可选徽标 */
function RowTrailing({ note, badge }: { note: string; badge?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: space.xs, flexShrink: 0 }}>
      <span style={{ fontSize: fontSize.caption, color: color.mute }}>{note}</span>
      {badge && <DefaultPill />}
    </span>
  );
}

/** 类型列固定序（1P / 3P / 独立站），只显示该平台实际存在的 */
const TYPE_ORDER: StoreType[] = ['1P', '3P', '独立站'];

export default function ChannelScopeBox() {
  const { state, actions } = useFilters();
  const cc = state.countryCode;
  const narrow = useNarrowViewport();

  // 平台 → 渠道（仅当前国家）：组内渠道保持维表序，组序 = 平台首次出现序
  const rows = useMemo<{ platform: string; shops: DimChannel[] }[]>(() => {
    const byPlatform = new Map<string, DimChannel[]>();
    for (const c of dimChannel) {
      if (c.country_code !== cc) continue;
      const arr = byPlatform.get(c.platform) ?? [];
      arr.push(c);
      byPlatform.set(c.platform, arr);
    }
    return [...byPlatform.entries()].map(([platform, shops]) => ({ platform, shops }));
  }, [cc]);

  // 默认平台锚（触发器占位 + 默认徽标）：配置默认店铺归属平台 → 国家默认平台
  const defaultPlatform = useMemo(() => defaultPlatformAnchorOf(cc), [cc]);

  const [open, setOpen] = useState(false);
  // 左列展开的平台（null = 跟随解析）；每次打开/切国家重置
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    setActive(null);
  }, [cc]);

  // 当前选择读取（state 全量，不做单选归一——多平台并集如实显示）：
  const selShop = state.platform?.shopIds[0]
    ? dimChannel.find((c) => c.channel_id === state.platform!.shopIds[0]) ?? null
    : null;
  const selTypes = state.platform?.types ?? [];
  const selPlatforms = state.platform && state.platform.shopIds.length === 0 ? state.platform.platforms : [];
  const multiPlatformLabel = selPlatforms.length > 1 ? selPlatforms.join('、') : null;

  // 左列激活平台：手动点选 > 已选平台/店铺归属 > 默认锚 > 首个
  const activePlatform =
    active ?? selShop?.platform ?? selPlatforms[0] ?? defaultPlatform ?? rows[0]?.platform ?? null;
  const activeRow = rows.find((r) => r.platform === activePlatform) ?? null;

  const commit = (next: typeof state.platform): void => {
    actions.set({ platform: next });
    setOpen(false);
  };

  // 左列平台行（导航）：行尾 = 渠道店铺数求和；默认锚徽标（未显式选平台时）
  const shopTotalOf = (r: { shops: DimChannel[] }): number => r.shops.reduce((a, c) => a + c.shops, 0);
  const platformItems: CascadeRowItem[] = rows.map((r) => ({
    key: r.platform,
    label: r.platform,
    active: activePlatform === r.platform,
    onActivate: () => setActive(r.platform),
    trailing: (
      <RowTrailing note={`· ${shopTotalOf(r)} 店铺`} badge={defaultPlatform === r.platform} />
    ),
  }));

  // 中列类型行（提交）：首行「全部类型 · 最低价」= 平台级口径；类型行 = 平台∩类型。
  // 行尾店铺数 = 该平台该类型下渠道的店铺数合计
  const activeTypes = TYPE_ORDER.filter((t) => (activeRow?.shops ?? []).some((s) => s.store_type === t));
  const typeShopTotal = (t: StoreType): number =>
    (activeRow?.shops ?? []).filter((s) => s.store_type === t).reduce((a, c) => a + c.shops, 0);
  const platformSelected = selShop == null && selPlatforms.includes(activePlatform ?? '');
  const typeItems: CascadeRowItem[] = activeRow
    ? [
        {
          key: '__all__',
          label: '全部类型 · 最低价',
          active: platformSelected && selTypes.length === 0,
          onLabelClick: () => commit({ platforms: [activeRow.platform], shopIds: [] }),
          trailing: <RowTrailing note={`· ${shopTotalOf(activeRow)} 店铺`} />,
        },
        ...activeTypes.map((t) => ({
          key: t,
          label: t,
          active: platformSelected && selTypes.length === 1 && selTypes[0] === t,
          onLabelClick: () => commit({ platforms: [activeRow.platform], shopIds: [], types: [t] }),
          trailing: <RowTrailing note={`· ${typeShopTotal(t)} 店铺`} />,
        })),
      ]
    : [];

  // 右列店铺行（提交 = 钉具体渠道，每周恒取该店价）：行尾 = 渠道内店铺数；
  // 「独立站」等直销渠道 shops=1 照实显示
  const shopItems: CascadeRowItem[] = (activeRow?.shops ?? []).map((s) => ({
    key: s.channel_id,
    label: s.display_name,
    active: selShop?.channel_id === s.channel_id,
    onLabelClick: () => commit({ platforms: [], shopIds: [s.channel_id] }),
    trailing: <RowTrailing note={`· ${s.shops} 店铺`} badge={false} />,
  }));

  // 触发器文案：店铺级 = 渠道名；平台级 = 「平台 · 全部类型 / 平台 · 类型」；
  // 多平台并集如实全量；未选（自动口径）= 占位「默认 · 平台锚」
  const selTypeText = selTypes.length === 1 ? selTypes[0] : selTypes.length > 1 ? selTypes.join('/') : '全部类型';
  const labels = selShop
    ? [selShop.display_name]
    : multiPlatformLabel
      ? [multiPlatformLabel]
      : selPlatforms.length === 1
        ? [`${selPlatforms[0]} · ${selTypeText}`]
        : [];
  const placeholder = defaultPlatform ? `默认 · ${defaultPlatform}` : '未筛选';

  return (
    <Popover
      trigger="click"
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setActive(null); // 每次打开回解析态，不残留上次点选
      }}
      arrow={false}
      placement="bottomRight"
      destroyOnHidden
      classNames={{ root: 'lpl-cascade-popover' }}
      styles={{ body: { padding: 0 } as const }}
      content={
        <div style={{ width: narrow ? 'min(420px, calc(100vw - 48px))' : undefined, maxWidth: '100%' }}>
          <CascadePanel
            open={open}
            stepped={narrow}
            levelLabels={['平台', '类型', '店铺']}
            columns={[
              { items: platformItems },
              { items: typeItems },
              { items: shopItems },
            ]}
          />
          <div style={{ padding: `6px ${space.md}px`, borderTop: `1px solid ${color.hairline}` }}>
            <Button
              type="link"
              size={narrow ? 'middle' : 'small'}
              style={{ padding: 0, height: narrow ? 44 : 20, fontSize: narrow ? fontSize.bodySm : fontSize.caption }}
              disabled={state.platform == null}
              aria-label="回到自动"
              title="回到默认平台自动取价（平台内每周最低价店铺）"
              onClick={() => commit(null)}
            >
              回到自动
            </Button>
          </div>
        </div>
      }
    >
      <div data-testid="channel-scope-trigger" style={{ width: '100%', minWidth: 0 }}>
        <CascadeTrigger labels={labels} placeholder={placeholder} open={open} />
      </div>
    </Popover>
  );
}
