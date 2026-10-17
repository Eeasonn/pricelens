// ============================================================
// §5.3 框三：平台 —— 平台 → 店铺 两层级联（dimChannel）。
// 标题「平台」+感叹号说明在 FilterBar 框标题上；默认不选 = 最低价口径（§3.1 决策②）。
// 勾平台 = 勾其下全部店铺；可下钻只勾具体店铺；多选均值由图表侧按该状态计算。
// 状态形状（SeriesQuery.platform 同构）：{ platforms: 全选平台, shopIds: 部分勾选店铺 } | null
// ============================================================
import { useMemo, useState } from 'react';
import { Button, Popover, Tooltip } from 'antd';
import { useFilters } from '../../state/FiltersContext';
import { dimChannel } from '../../data';
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
  const rows = useMemo<PlatformRow[]>(() => {
    const byPlatform = new Map<string, DimChannel[]>();
    for (const c of dimChannel) {
      const arr = byPlatform.get(c.platform) ?? [];
      arr.push(c);
      byPlatform.set(c.platform, arr);
    }
    return [...byPlatform.entries()].map(([platform, shops]) => ({ platform, shops }));
  }, []);
  const shopNameById = useMemo(() => new Map(dimChannel.map((c) => [c.shop_id, c.shop_name])), []);

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string | null>(null);

  const sel = state.platform;
  const platforms = sel?.platforms ?? [];
  const shopIds = sel?.shopIds ?? [];

  const isPlatformFull = (platform: string): boolean => platforms.includes(platform);
  const isShopChecked = (platform: string, shopId: string): boolean =>
    isPlatformFull(platform) || shopIds.includes(shopId);

  /** 勾/取消平台 = 勾/取消其下全部店铺（店铺明细清空，保持状态最简） */
  const writePlatform = (platform: string, next: boolean): void => {
    const nextPlatforms = new Set(platforms);
    const nextShops = new Set(shopIds);
    const row = rows.find((r) => r.platform === platform);
    row?.shops.forEach((s) => nextShops.delete(s.shop_id));
    if (next) nextPlatforms.add(platform);
    else nextPlatforms.delete(platform);
    emit(nextPlatforms, nextShops);
  };

  /** 店铺级勾选：整平台已勾时再操作 → 降级为部分勾选；补齐全部店铺 → 升级为整平台 */
  const writeShop = (platform: string, shopId: string, next: boolean): void => {
    const shops = rows.find((r) => r.platform === platform)?.shops ?? [];
    const nextPlatforms = new Set(platforms);
    const nextShops = new Set(shopIds);
    if (next) {
      shops.forEach((s) => nextShops.delete(s.shop_id));
      nextPlatforms.delete(platform);
      nextShops.add(shopId);
      if (shops.every((s) => nextShops.has(s.shop_id))) {
        shops.forEach((s) => nextShops.delete(s.shop_id));
        nextPlatforms.add(platform);
      }
    } else if (nextPlatforms.has(platform)) {
      nextPlatforms.delete(platform);
      shops.forEach((s) => {
        if (s.shop_id !== shopId) nextShops.add(s.shop_id);
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

  const selectedPlatform = rows.find((r) => platforms.includes(r.platform) || r.shops.some((s) => shopIds.includes(s.shop_id)))?.platform;
  const activePlatform = active ?? selectedPlatform ?? rows[0]?.platform ?? null;
  const activeRow = rows.find((r) => r.platform === activePlatform) ?? null;

  const platformItems: CascadeRowItem[] = rows.map((r) => {
    const full = isPlatformFull(r.platform);
    const some = r.shops.some((s) => shopIds.includes(s.shop_id));
    return {
      key: r.platform,
      label: r.platform,
      checkState: full ? 'checked' : some ? 'indeterminate' : 'none',
      onCheckChange: (next) => writePlatform(r.platform, next),
      onActivate: () => setActive(r.platform),
      onLabelClick: () => writePlatform(r.platform, !full),
      active: activePlatform === r.platform,
    };
  });

  const shopItems: CascadeRowItem[] = (activeRow?.shops ?? []).map((s) => ({
    key: s.shop_id,
    label: s.shop_name,
    active: shopIds.includes(s.shop_id),
    checkState: activePlatform && isShopChecked(activePlatform, s.shop_id) ? 'checked' : 'none',
    onCheckChange: (next) => activePlatform && writeShop(activePlatform, s.shop_id, next),
    onLabelClick: () =>
      activePlatform && writeShop(activePlatform, s.shop_id, !isShopChecked(activePlatform, s.shop_id)),
  }));

  // 触发器展示：全选平台名 + 部分勾选店铺名
  const labels = [...platforms, ...shopIds.map((id) => shopNameById.get(id) ?? id)];

  return (
    <Popover
      trigger="click"
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setActive(selectedPlatform ?? rows[0]?.platform ?? null);
      }}
      arrow={false}
      placement="bottomLeft"
      styles={{ body: { padding: 0 } as const }}
      content={
        <div>
          <CascadePanel open={open} columns={[{ width: 150, items: platformItems }, { width: 208, items: shopItems }]} />
          <div style={{ padding: `6px ${space.md}px`, borderTop: `1px solid ${color.hairline}` }}>
            <Button
              type="link"
              size="small"
              style={{ padding: 0, height: 20, fontSize: fontSize.caption }}
              onClick={() => actions.set({ platform: null })}
            >
              清除
            </Button>
          </div>
        </div>
      }
    >
      {/* 平台口径独立于竞品匹配方式。 */}
        <Tooltip title={labels.join('、') || undefined}>
          <div
            style={{
              width: '100%',
              minWidth: 0,
            }}
          >
            <CascadeTrigger labels={labels} placeholder="未筛选" open={open} />
          </div>
        </Tooltip>
    </Popover>
  );
}
