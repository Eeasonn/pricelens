// ============================================================
// §5.3 框三：平台 —— 平台 → 渠道（店铺类型）两层级联（dimChannel，按当前国家过滤）。
// 默认不选 = 该国默认电渠（「国家主要电渠」首个）单平台口径；勾平台 = 勾其下全部渠道；
// 可下钻只勾具体渠道（如「OZON 1P」）；渠道内多店铺由数据层取最低在架价。
// 状态形状（SeriesQuery.platform 同构）：{ platforms: 全选平台, shopIds: 部分勾选渠道 id } | null
// ============================================================
import { useMemo, useState } from 'react';
import { Button, Popover, Tooltip } from 'antd';
import { useFilters } from '../../state/FiltersContext';
import { dimChannel, dimRegion } from '../../data';
import type { DimChannel } from '../../dataModel/types';
import { color, fontSize, space } from '../../theme/tokens';
import { CascadePanel, CascadeTrigger } from '../ProductCascader';
import type { CascadeRowItem } from '../ProductCascader';
import type { PlatformSelection } from '../../state/filtersTypes';

interface PlatformRow {
  platform: string;
  shops: DimChannel[];
}

export default function PlatformBox() {
  const { state, actions } = useFilters();
  const cc = state.countryCode;
  const rows = useMemo<PlatformRow[]>(() => {
    const byPlatform = new Map<string, DimChannel[]>();
    for (const c of dimChannel) {
      if (c.country_code !== cc) continue;
      const arr = byPlatform.get(c.platform) ?? [];
      arr.push(c);
      byPlatform.set(c.platform, arr);
    }
    return [...byPlatform.entries()].map(([platform, shops]) => ({ platform, shops }));
  }, [cc]);
  const shopNameById = useMemo(() => new Map(dimChannel.map((c) => [c.channel_id, c.display_name])), []);
  const defaultPlatform = useMemo(() => dimRegion.find((r) => r.country_code === cc)?.default_platform ?? rows[0]?.platform ?? '', [cc, rows]);

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string | null>(null);

  const sel = state.platform;
  const platforms = sel?.platforms ?? [];
  const shopIds = sel?.shopIds ?? [];

  const isPlatformFull = (platform: string): boolean => platforms.includes(platform);
  const isShopChecked = (platform: string, shopId: string): boolean =>
    isPlatformFull(platform) || shopIds.includes(shopId);

  /** 勾/取消平台 = 勾/取消其下全部渠道 */
  const writePlatform = (platform: string, next: boolean): void => {
    const nextPlatforms = new Set(platforms);
    const nextShops = new Set(shopIds);
    const row = rows.find((r) => r.platform === platform);
    row?.shops.forEach((s) => nextShops.delete(s.channel_id));
    if (next) nextPlatforms.add(platform);
    else nextPlatforms.delete(platform);
    emit(nextPlatforms, nextShops);
  };

  /** 渠道级勾选：整平台已勾时再操作 → 降级为部分勾选；补齐全部渠道 → 升级为整平台 */
  const writeShop = (platform: string, shopId: string, next: boolean): void => {
    const shops = rows.find((r) => r.platform === platform)?.shops ?? [];
    const nextPlatforms = new Set(platforms);
    const nextShops = new Set(shopIds);
    if (next) {
      shops.forEach((s) => nextShops.delete(s.channel_id));
      nextPlatforms.delete(platform);
      nextShops.add(shopId);
      if (shops.every((s) => nextShops.has(s.channel_id))) {
        shops.forEach((s) => nextShops.delete(s.channel_id));
        nextPlatforms.add(platform);
      }
    } else if (nextPlatforms.has(platform)) {
      nextPlatforms.delete(platform);
      shops.forEach((s) => {
        if (s.channel_id !== shopId) nextShops.add(s.channel_id);
      });
    } else {
      nextShops.delete(shopId);
    }
    emit(nextPlatforms, nextShops);
  };

  const emit = (nextPlatforms: Set<string>, nextShops: Set<string>): void => {
    const next: PlatformSelection | null =
      nextPlatforms.size || nextShops.size ? { platforms: [...nextPlatforms], shopIds: [...nextShops] } : null;
    actions.set({ platform: next }); // §5.6 切换平台：仅改聚合入参，不动图窗与粒度
  };

  const selectedPlatform = rows.find((r) => platforms.includes(r.platform) || r.shops.some((s) => shopIds.includes(s.channel_id)))?.platform;
  const activePlatform = active ?? selectedPlatform ?? defaultPlatform ?? rows[0]?.platform ?? null;
  const activeRow = rows.find((r) => r.platform === activePlatform) ?? null;

  const platformItems: CascadeRowItem[] = rows.map((r) => {
    const full = isPlatformFull(r.platform);
    const some = r.shops.some((s) => shopIds.includes(s.channel_id));
    return {
      key: r.platform,
      label: r.platform === defaultPlatform ? `${r.platform}（默认电渠）` : r.platform,
      checkState: full ? 'checked' : some ? 'indeterminate' : 'none',
      onCheckChange: (next) => writePlatform(r.platform, next),
      onActivate: () => setActive(r.platform),
      onLabelClick: () => writePlatform(r.platform, !full),
      active: activePlatform === r.platform,
    };
  });

  const shopItems: CascadeRowItem[] = (activeRow?.shops ?? []).map((s) => ({
    key: s.channel_id,
    label: s.shops > 1 ? `${s.display_name} · ${s.shops} 店` : s.display_name,
    active: shopIds.includes(s.channel_id),
    checkState: activePlatform && isShopChecked(activePlatform, s.channel_id) ? 'checked' : 'none',
    onCheckChange: (next) => activePlatform && writeShop(activePlatform, s.channel_id, next),
    onLabelClick: () =>
      activePlatform && writeShop(activePlatform, s.channel_id, !isShopChecked(activePlatform, s.channel_id)),
  }));

  // 触发器展示：全选平台名 + 部分勾选渠道名；未选 = 默认电渠
  const labels = [...platforms, ...shopIds.map((id) => shopNameById.get(id) ?? id)];

  return (
    <Popover
      trigger="click"
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setActive(selectedPlatform ?? defaultPlatform ?? rows[0]?.platform ?? null);
      }}
      arrow={false}
      placement="bottomLeft"
      styles={{ body: { padding: 0 } as const }}
      content={
        <div>
          <CascadePanel open={open} columns={[{ width: 190, items: platformItems }, { width: 208, items: shopItems }]} />
          <div style={{ padding: `6px ${space.md}px`, borderTop: `1px solid ${color.hairline}` }}>
            <Button
              type="link"
              size="small"
              style={{ padding: 0, height: 20, fontSize: fontSize.caption }}
              onClick={() => actions.set({ platform: null })}
            >
              恢复默认电渠
            </Button>
          </div>
        </div>
      }
    >
      <Tooltip title={labels.join('、') || (defaultPlatform ? `默认电渠：${defaultPlatform}` : undefined)}>
        <div style={{ width: '100%', minWidth: 0 }}>
          <CascadeTrigger labels={labels} placeholder={defaultPlatform || '未筛选'} open={open} />
        </div>
      </Tooltip>
    </Popover>
  );
}
