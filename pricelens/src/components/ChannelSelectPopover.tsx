// ============================================================
// 产品级取价渠道级联浮层（第一百六十一轮立三层级联；第一百六十二轮改自动语义；
// 第一百六十四轮搜索改全局）——「平台→渠道→卖家」三级级联（与全局 PlatformBox
// 同构，复用 CascadePanel），单选：
//   点平台行 = 只切换右列渠道列表；点渠道行 = 展开该渠道卖家列；提交在第三列。
// 两颗「自动」胶囊（Eason：类似匹配竞品的开关胶囊 + 问号说明）：
//   底部「自动」= 整个产品不锁渠道，显示每周最低价平台-店铺（问号同文）；
//   第三列顶部「自动」= 该渠道内不锁卖家，显示每周最低价店铺（替代原
//   「全部店铺 · 最低价」选项行）。
// 顶部固定搜索行（第一百六十四轮，Eason：像产品筛选一样固定一行，且能搜到
// 任何平台下的任何店铺，不再只能在某个渠道内搜）——输入即跨全部平台匹配渠道
// 显示名 / 平台名 / 卖家店铺名，点结果行直接落为该渠道（或渠道内该卖家）口径。
// 入口 = 图例每款产品药丸上方的平台小药丸（BrandLegendStrip）。
// ============================================================
import { useEffect, useMemo, useState } from 'react';
import { Input, Tooltip } from 'antd';
import { QuestionCircleOutlined, SearchOutlined } from '@ant-design/icons';
import { sellersOfChannel } from '../dataModel/aggregate';
import { dimChannel } from '../data';
import type { DimChannel } from '../dataModel/types';
import { color, fontSize, radius, selectSoft, selectSoftInk, space } from '../theme/tokens';
import { autoColumnWidth, CascadePanel, measureText } from './ProductCascader';
import type { CascadeRowItem } from './ProductCascader';
import type { PlatformSelection } from '../state/filtersTypes';

/** 行尾小注（「· N 店铺」/「· N 周」） */
function RowTrailing({ note }: { note: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: space.xs, flexShrink: 0 }}>
      <span style={{ fontSize: fontSize.caption, color: color.mute }}>{note}</span>
    </span>
  );
}

/** 「自动」开关胶囊（第一百六十二轮，Eason：类似匹配竞品的胶囊 + 问号说明） */
function AutoTogglePill({
  pressed,
  hint,
  onClick,
  disabled,
}: {
  pressed: boolean;
  hint: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span
        role="button"
        aria-pressed={pressed}
        aria-label={`自动：${hint}`}
        onClick={() => !disabled && onClick()}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          height: 20,
          padding: '0 10px',
          borderRadius: radius.pill,
          fontSize: 11,
          fontWeight: 600,
          color: pressed ? selectSoftInk : color.body,
          background: pressed ? selectSoft : color.canvas,
          border: `1px solid ${pressed ? 'rgba(0, 112, 243, 0.35)' : color.hairline}`,
          cursor: disabled ? 'default' : 'pointer',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        自动
      </span>
      <Tooltip title={hint} trigger="click">
        <QuestionCircleOutlined
          role="button"
          aria-label="口径说明"
          style={{ fontSize: 11, color: color.mute, cursor: 'pointer', flexShrink: 0 }}
        />
      </Tooltip>
    </span>
  );
}

/** 搜索结果行（第一百六十四轮）：渠道命中 / 卖家命中统一为一条可点结果 */
interface SearchHit {
  key: string;
  channelId: string;
  seller: string | null; // null = 渠道口径（渠道内全部店铺每周最低价）
  label: string;
  note: string; // 行尾语境小注（渠道命中 = 平台 + 店铺数；卖家命中 = 渠道 + 平台 + 覆盖周数）
  active: boolean;
}

const SEARCH_CAP = 50;

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

  const isAuto = current == null || ((current.platforms?.length ?? 0) === 0 && (current.shopIds?.length ?? 0) === 0);

  // 左列展开的平台（null = 跟随解析：已选渠道 → 首个）；切国家/产品重置
  const [active, setActive] = useState<string | null>(null);
  // 第三列展开的渠道（null = 不显示卖家列）
  const [sellerPane, setSellerPane] = useState<string | null>(null);
  // 全局搜索词（第一百六十四轮：固定首行，跨平台搜渠道/店铺）
  const [query, setQuery] = useState('');
  useEffect(() => {
    setActive(null);
    setSellerPane(null);
    setQuery('');
  }, [cc, skuIds]);

  const selectedShopId = current?.shopIds[0] ?? null;
  const selectedSeller = selectedShopId != null ? current?.seller ?? null : null;
  const selectedShop = selectedShopId ? dimChannel.find((c) => c.channel_id === selectedShopId) ?? null : null;
  const selectedPlatformOnly = selectedShop ? null : (current?.platforms[0] ?? null);

  const activePlatform = active ?? selectedShop?.platform ?? selectedPlatformOnly ?? rows[0]?.platform ?? null;
  const activeRow = rows.find((r) => r.platform === activePlatform) ?? null;
  // 右列高亮：仅显式选中（自动 = 不锁渠道/卖家，无高亮行）

  const commitSeller = (channelId: string, seller: string | null): void => {
    onPick({ platforms: [], shopIds: [channelId], seller });
  };

  const shopTotalOf = (r: { shops: DimChannel[] }): number => r.shops.reduce((a, c) => a + c.shops, 0);
  const noteW = (n: number): number => measureText(`· ${n} 店铺`) * (fontSize.caption / 13);

  // ---- 全局搜索（第一百六十四轮）：渠道显示名 / 平台名 / 卖家店铺名 跨平台匹配 ----
  const q = query.trim().toLowerCase();
  const hits = useMemo<SearchHit[]>(() => {
    if (!q) return [];
    const out: SearchHit[] = [];
    for (const r of rows) {
      for (const c of r.shops) {
        if (c.display_name.toLowerCase().includes(q) || r.platform.toLowerCase().includes(q)) {
          out.push({
            key: `ch:${c.channel_id}`,
            channelId: c.channel_id,
            seller: null,
            label: c.display_name,
            note: `· ${r.platform} · ${c.shops} 店铺`,
            active: selectedShopId === c.channel_id && selectedSeller == null,
          });
        }
        for (const s of sellersOfChannel(cc, c.channel_id)) {
          if (!s.seller.toLowerCase().includes(q)) continue;
          out.push({
            key: `sl:${c.channel_id}:${s.seller}`,
            channelId: c.channel_id,
            seller: s.seller,
            label: s.seller,
            note: `· ${c.display_name} · ${r.platform} · ${s.weeks} 周`,
            active: selectedShopId === c.channel_id && selectedSeller === s.seller,
          });
        }
        if (out.length >= SEARCH_CAP) return out.slice(0, SEARCH_CAP);
      }
    }
    return out;
  }, [q, rows, cc, selectedShopId, selectedSeller]);
  const hitTotal = useMemo(() => {
    if (!q) return 0;
    let n = 0;
    for (const r of rows) {
      for (const c of r.shops) {
        if (c.display_name.toLowerCase().includes(q) || r.platform.toLowerCase().includes(q)) n += 1;
        for (const s of sellersOfChannel(cc, c.channel_id)) {
          if (s.seller.toLowerCase().includes(q)) n += 1;
        }
      }
    }
    return n;
  }, [q, rows, cc]);

  const hitItems: CascadeRowItem[] = hits.map((h) => ({
    key: h.key,
    label: h.label,
    active: h.active,
    onLabelClick: () => commitSeller(h.channelId, h.seller),
    trailing: <RowTrailing note={h.note} />,
  }));
  const hitColWidth = useMemo(
    () =>
      autoColumnWidth(
        hits.map((h) => ({ key: h.key, label: h.label })),
        {
          extraW:
            Math.max(0, ...hits.map((h) => measureText(h.note) * (fontSize.caption / 13))) +
            space.xs,
          min: 240,
          max: 460,
        },
      ),
    [hits],
  );

  const platformItems: CascadeRowItem[] = rows.map((r) => ({
    key: r.platform,
    label: r.platform,
    active: activePlatform === r.platform,
    onActivate: () => setActive(r.platform),
    trailing: <RowTrailing note={`· ${shopTotalOf(r)} 店铺`} />,
  }));
  const platformExtraW = Math.max(0, ...rows.map((r) => noteW(shopTotalOf(r)))) + space.xs;

  // 第三列 = 展开渠道的卖家清单（按覆盖周数降序）；渠道内口径由列顶「自动」胶囊
  // 承担（第一百六十二轮：替代原「全部店铺 · 最低价」选项行）；渠道内搜索随
  // 第一百六十四轮收进顶部全局搜索行
  const paneSellers = useMemo(() => (sellerPane ? sellersOfChannel(cc, sellerPane) : []), [cc, sellerPane]);
  const paneChannel = sellerPane ? dimChannel.find((c) => c.channel_id === sellerPane) ?? null : null;
  const sellerItems: CascadeRowItem[] = paneChannel
    ? paneSellers.map((x) => ({
        key: x.seller,
        label: x.seller,
        active: selectedShopId === paneChannel.channel_id && selectedSeller === x.seller,
        onLabelClick: () => commitSeller(paneChannel.channel_id, x.seller),
        trailing: <RowTrailing note={`· ${x.weeks} 周`} />,
      }))
    : [];
  const sellerColWidth = useMemo(() => {
    if (!paneChannel) return 0;
    const full: CascadeRowItem[] = paneSellers.map((x) => ({ key: x.seller, label: x.seller }));
    return autoColumnWidth(full, { extraW: measureText('· 24 周') * (fontSize.caption / 13) + space.xs, min: 200, max: 380 });
  }, [paneChannel, paneSellers]);

  // 右列渠道行：整行点击 = 下钻卖家列；未展开时回落选中/自动渠道高亮
  const shopItems: CascadeRowItem[] = (activeRow?.shops ?? []).map((s) => {
    const paneOpenHere = sellerPane === s.channel_id;
    const fallbackActive = sellerPane == null && selectedShopId === s.channel_id;
    return {
      key: s.channel_id,
      label: s.display_name,
      active: paneOpenHere || fallbackActive,
      onActivate: () => setSellerPane(s.channel_id),
      trailing: <RowTrailing note={`· ${s.shops} 店铺`} />,
    };
  });
  const shopExtraW = Math.max(0, ...(activeRow?.shops ?? []).map((s) => noteW(s.shops))) + space.xs;

  return (
    <div>
      {/* 顶部固定搜索行（第一百六十四轮，Eason：像产品筛选一样固定一行，跨平台可搜） */}
      <div style={{ padding: `8px ${space.md}px 6px`, borderBottom: `1px solid ${color.hairline}` }}>
        <Input
          size="small"
          allowClear
          prefix={<SearchOutlined style={{ color: color.mute }} />}
          placeholder="搜索平台 / 店铺"
          aria-label="搜索平台 / 店铺"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ height: 24, fontSize: fontSize.caption, width: 232 }}
        />
      </div>
      {q ? (
        <>
          <CascadePanel open columns={[{ items: hitItems, width: hitColWidth }]} />
          {hitTotal > hits.length && (
            <div style={{ padding: `5px ${space.md}px 2px`, fontSize: fontSize.caption, color: color.mute }}>
              共 {hitTotal} 个匹配，仅显示前 {SEARCH_CAP} 个，可继续输入缩小范围
            </div>
          )}
        </>
      ) : (
        <CascadePanel
          open
          columns={[
            { items: platformItems, extraW: platformExtraW },
            { items: shopItems, extraW: shopExtraW },
            ...(sellerPane != null && sellerColWidth > 0
              ? [{
                  items: sellerItems,
                  width: sellerColWidth,
                  // 第一百六十二轮（Eason）：渠道内「自动」放店铺列顶部（不放整卡左上角）
                  header: (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space.xs }}>
                      <AutoTogglePill
                        pressed={selectedShopId === sellerPane && selectedSeller == null}
                        hint="显示每周最低价店铺"
                        onClick={() => commitSeller(sellerPane, null)}
                      />
                    </div>
                  ),
                }]
              : []),
          ]}
        />
      )}
      {/* 底部「自动」= 整个产品不锁渠道，每周取最低价平台-店铺 */}
      <div style={{ padding: `6px ${space.md}px`, borderTop: `1px solid ${color.hairline}` }}>
        <AutoTogglePill
          pressed={isAuto}
          hint="显示每周最低价平台-店铺"
          disabled={isAuto}
          onClick={() => onPick(null)}
        />
      </div>
    </div>
  );
}
