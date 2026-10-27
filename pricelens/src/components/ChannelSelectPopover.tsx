// ============================================================
// 产品级取价渠道级联浮层（第一百六十一轮，Eason：平台-店铺筛选和上午改之前
// 一样分多层）——「平台→渠道→卖家」三级级联，与全局 PlatformBox 同构
// （复用 CascadePanel 骨架），单选语义：
//   点平台行 = 只切换右列渠道列表（不提交不关闭）；点渠道行 = 展开该渠道
//   卖家列；提交发生在第三列（「全部店铺 · 最低价」= 渠道内取最低，或指定
//   卖家）。底部「恢复自动」= null（该产品日常价最低渠道口径）。
// 「自动」解析（autoChannelOf）替代全局版的「默认」锚位：自动渠道行带浅蓝
// 「自动」小徽标；未显式选择时自动渠道即高亮。
// 入口 = 产品筛选器里每款产品的渠道 chip（pickerBits.ChannelChip）。
// ============================================================
import { useEffect, useMemo, useState } from 'react';
import { Button, Input } from 'antd';
import { autoChannelOf, sellersOfChannel } from '../dataModel/aggregate';
import { dimChannel } from '../data';
import type { DimChannel } from '../dataModel/types';
import { color, fontSize, radius, selectSoft, selectSoftInk, space } from '../theme/tokens';
import { autoColumnWidth, CascadePanel, measureText } from './ProductCascader';
import type { CascadeRowItem } from './ProductCascader';
import type { PlatformSelection } from '../state/filtersTypes';

/** 「自动」小徽标（全局版「默认」同款视觉语言，selectSoft 浅蓝底） */
function AutoPill() {
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
      自动
    </span>
  );
}

function RowTrailing({ note, badge }: { note: string; badge?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: space.xs, flexShrink: 0 }}>
      <span style={{ fontSize: fontSize.caption, color: color.mute }}>{note}</span>
      {badge && <AutoPill />}
    </span>
  );
}

export default function ChannelSelectPopover({
  cc,
  skuIds,
  current,
  onPick,
}: {
  cc: string;
  skuIds: string[];
  /** 当前口径：null = 自动 */
  current: PlatformSelection | null;
  onPick: (sel: PlatformSelection | null) => void;
}) {
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

  // 自动渠道（覆盖阈值内中位价最低者）：替代全局版的「默认店铺」锚位
  const autoChannelId = useMemo(() => autoChannelOf(cc, skuIds), [cc, skuIds]);
  const autoChannel = useMemo(
    () => dimChannel.find((c) => c.channel_id === autoChannelId) ?? null,
    [autoChannelId],
  );

  // 左列展开的平台（null = 跟随解析：已选渠道 → 自动 → 首个）；切国家/产品重置
  const [active, setActive] = useState<string | null>(null);
  // 第三列展开的渠道（null = 不显示卖家列）
  const [sellerPane, setSellerPane] = useState<string | null>(null);
  const [sellerQuery, setSellerQuery] = useState('');
  useEffect(() => {
    setActive(null);
    setSellerPane(null);
    setSellerQuery('');
  }, [cc, skuIds]);

  const selectedShopId = current?.shopIds[0] ?? null;
  const selectedSeller = selectedShopId != null ? current?.seller ?? null : null;
  const selectedShop = selectedShopId ? dimChannel.find((c) => c.channel_id === selectedShopId) ?? null : null;
  const selectedPlatformOnly = selectedShop ? null : (current?.platforms[0] ?? null);

  const activePlatform =
    active ?? selectedShop?.platform ?? selectedPlatformOnly ?? autoChannel?.platform ?? rows[0]?.platform ?? null;
  const activeRow = rows.find((r) => r.platform === activePlatform) ?? null;
  // 右列高亮：显式选中 > 自动画渠道（未显式时）
  const highlightedShopId = selectedShopId ?? autoChannelId;

  const commitSeller = (channelId: string, seller: string | null): void => {
    onPick({ platforms: [], shopIds: [channelId], seller });
  };

  const shopTotalOf = (r: { shops: DimChannel[] }): number => r.shops.reduce((a, c) => a + c.shops, 0);
  const noteW = (n: number): number => measureText(`· ${n} 店铺`) * (fontSize.caption / 13);
  const badgeW = measureText('自动') * (fontSize.caption / 13) + 10 + space.xs;

  const autoOnPlatform = (platform: string): boolean =>
    selectedShop == null && selectedPlatformOnly == null && platform === (autoChannel?.platform ?? '__none__');

  const platformItems: CascadeRowItem[] = rows.map((r) => ({
    key: r.platform,
    label: r.platform,
    active: activePlatform === r.platform,
    onActivate: () => setActive(r.platform),
    trailing: <RowTrailing note={`· ${shopTotalOf(r)} 店铺`} badge={autoOnPlatform(r.platform)} />,
  }));
  const platformExtraW =
    Math.max(0, ...rows.map((r) => noteW(shopTotalOf(r)))) +
    (rows.some((r) => r.platform === autoChannel?.platform) ? badgeW : 0) +
    space.xs;

  // 第三列 = 展开渠道的卖家清单：首行「全部店铺 · 最低价」（渠道内取最低），下方按覆盖周数降序
  const paneSellers = useMemo(() => (sellerPane ? sellersOfChannel(cc, sellerPane) : []), [cc, sellerPane]);
  const paneChannel = sellerPane ? dimChannel.find((c) => c.channel_id === sellerPane) ?? null : null;
  const visibleSellers = useMemo(() => {
    const q = sellerQuery.trim().toLowerCase();
    return q ? paneSellers.filter((x) => x.seller.toLowerCase().includes(q)) : paneSellers;
  }, [paneSellers, sellerQuery]);
  const sellerItems: CascadeRowItem[] = paneChannel
    ? [
        {
          key: '__all__',
          label: '全部店铺 · 最低价',
          active: selectedShopId === paneChannel.channel_id && selectedSeller == null,
          onLabelClick: () => commitSeller(paneChannel.channel_id, null),
          trailing: <RowTrailing note={`· ${paneChannel.shops} 店铺`} />,
        },
        ...visibleSellers.map((x) => ({
          key: x.seller,
          label: x.seller,
          active: selectedShopId === paneChannel.channel_id && selectedSeller === x.seller,
          onLabelClick: () => commitSeller(paneChannel.channel_id, x.seller),
          trailing: <RowTrailing note={`· ${x.weeks} 周`} />,
        })),
      ]
    : [];
  const sellerColWidth = useMemo(() => {
    if (!paneChannel) return 0;
    const full: CascadeRowItem[] = [
      { key: '__all__', label: '全部店铺 · 最低价' },
      ...paneSellers.map((x) => ({ key: x.seller, label: x.seller })),
    ];
    const noteBudget = Math.max(measureText(`· ${paneChannel.shops} 店铺`), measureText('· 24 周'));
    return autoColumnWidth(full, { extraW: noteBudget * (fontSize.caption / 13) + space.xs, min: 200, max: 380 });
  }, [paneChannel, paneSellers]);

  // 右列渠道行：整行点击 = 下钻卖家列；未展开时回落选中/自动渠道高亮
  const shopItems: CascadeRowItem[] = (activeRow?.shops ?? []).map((s) => {
    const paneOpenHere = sellerPane === s.channel_id;
    const fallbackActive = sellerPane == null && highlightedShopId === s.channel_id;
    return {
      key: s.channel_id,
      label: s.display_name,
      active: paneOpenHere || fallbackActive,
      onActivate: () => {
        setSellerPane(s.channel_id);
        setSellerQuery('');
      },
      trailing: <RowTrailing note={`· ${s.shops} 店铺`} badge={s.channel_id === autoChannelId} />,
    };
  });
  const shopExtraW =
    Math.max(0, ...(activeRow?.shops ?? []).map((s) => noteW(s.shops))) +
    (autoChannelId != null && (activeRow?.shops ?? []).some((s) => s.channel_id === autoChannelId) ? badgeW : 0) +
    space.xs;

  return (
    <div>
      {sellerPane != null && (
        <div style={{ padding: `8px ${space.md}px 6px`, borderBottom: `1px solid ${color.hairline}` }}>
          <Input
            size="small"
            allowClear
            placeholder="搜索卖家店铺"
            value={sellerQuery}
            onChange={(e) => setSellerQuery(e.target.value)}
            style={{ height: 24, fontSize: fontSize.caption }}
          />
        </div>
      )}
      <CascadePanel
        open
        columns={[
          { items: platformItems, extraW: platformExtraW },
          { items: shopItems, extraW: shopExtraW },
          ...(sellerPane != null && sellerColWidth > 0 ? [{ items: sellerItems, width: sellerColWidth }] : []),
        ]}
      />
      <div style={{ padding: `6px ${space.md}px`, borderTop: `1px solid ${color.hairline}` }}>
        <Button
          type="link"
          size="small"
          style={{ padding: 0, height: 20, fontSize: fontSize.caption }}
          disabled={selectedShopId == null && (current?.platforms?.length ?? 0) === 0}
          onClick={() => onPick(null)} // 回自动口径（该产品日常价最低渠道）
        >
          恢复自动
        </Button>
      </div>
    </div>
  );
}
