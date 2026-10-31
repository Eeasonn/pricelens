// ============================================================
// ChannelSelectPopover（第一百六十一轮立三层级联；第一百六十二轮改自动语义；
// 第一百六十四轮搜索改全局、加平台域模式；第一百八十五轮统一自动口径文案；
// 第一百九十一轮（Eason 五点）每颗「自动」胶囊右侧显示语境小注——渠道名 /
// 解析到的平台名，多颗「自动」并排时分得清谁是谁）
// ——「平台→渠道→卖家」三级级联
// （与全局 PlatformBox 同构，复用 CascadePanel），单选：
//   点平台行 = 只切换右列渠道列表；点渠道行 = 展开该渠道卖家列；提交在第三列。
// 两颗「自动」胶囊（Eason：类似匹配竞品的开关胶囊 + 问号说明）：
//   底部「自动」= 产品级每周最低在架价：优先取默认店铺；未设置时取预填主店；
//   仍无则取默认平台（第一百八十五轮与数据口径说明弹窗统一同句，问号同文）；
//   第三列顶部「自动」= 该渠道内不锁卖家，显示每周最低价店铺（替代原
//   「全部店铺 · 最低价」选项行）。
// 顶部固定搜索行（第一百六十四轮，Eason：像产品筛选一样固定一行，且能搜到
// 任何平台下的任何店铺，不再只能在某个渠道内搜）——输入即跨全部平台匹配渠道
// 显示名 / 平台名 / 卖家店铺名，点结果行直接落为该渠道（或渠道内该卖家）口径。
// scope='platform'（第一百六十四轮，多平台对比页签的店铺 chip 修改入口）：
//   底部「自动」改指「该平台内每周最低价店铺」（scopePlatform），产品级自动
//   不出现。入口 = 图例每款产品药丸上方的平台小药丸（BrandLegendStrip）。
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
import { useNarrowViewport } from '../state/useNarrowViewport';
import { searchShopCatalog, SHOP_SEARCH_CAP } from './shopSearch';

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
  context,
  label,
  tall,
}: {
  pressed: boolean;
  hint: string;
  onClick: () => void;
  disabled?: boolean;
  /** 胶囊右侧语境小注（第一百九十一轮，Eason 五点）：这颗「自动」当前对应的
   *  渠道名 / 解析到的平台名；不传不渲染 */
  context?: string;
  /** 作用域名称：自动取价 / 平台自动 / 渠道自动 */
  label: string;
  tall?: boolean;
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <button
        type="button"
        aria-pressed={pressed}
        aria-label={`${label}：${hint}`}
        onClick={() => !disabled && onClick()}
        className="lpl-hit"
        style={{
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: tall ? 44 : 20,
          padding: tall ? '0 14px' : '0 10px',
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
        {label}
      </button>
      {/* 语境小注（第一百九十一轮，Eason 五点）：自动按钮旁显示对应的平台-分类-
          店铺语境，否则多颗「自动」分不清谁是谁 */}
      {context ? (
        <span style={{ fontSize: 11, color: color.mute, whiteSpace: 'nowrap', flexShrink: 0 }}>· {context}</span>
      ) : null}
      <Tooltip title={hint} trigger="click">
        <button
          type="button"
          aria-label="口径说明"
          className="lpl-hit"
          style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: 'pointer', flexShrink: 0, color: color.mute }}
        >
          <QuestionCircleOutlined style={{ fontSize: 11 }} />
        </button>
      </Tooltip>
    </span>
  );
}

export default function ChannelSelectPopover({
  cc,
  skuIds,
  current,
  onPick,
  scope = 'product',
  scopePlatform,
  syncCtl,
  autoLabel,
}: {
  cc: string;
  skuIds: string[];
  /** 当前口径：null = 自动 */
  current: PlatformSelection | null;
  onPick: (sel: PlatformSelection | null) => void;
  /** product（缺省）= 底部「自动」= 产品级每周最低在架价（默认店铺 → 预填主店
   *  → 默认平台，见底部胶囊说明）；platform = 底部「自动」= scopePlatform 平台内
   *  每周最低价店铺（店铺 chip 修改入口） */
  scope?: 'product' | 'platform';
  scopePlatform?: string;
  /** 同步平台筛选（第一百七十八轮立，第一百八十四轮改组内语义）：传入 =
   *  本组主品的浮层出开关——同步只作用于本组（本组对比品跟随本组主产品） */
  syncCtl?: { active: boolean; onToggle: () => void };
  /** 产品级自动当前解析到的平台名（第一百九十一轮，Eason 五点：自动态才传；
   *  调用方见 BrandLegendStrip channelCtl.autoLabel）——底部「自动」胶囊旁的语境 */
  autoLabel?: string;
}) {
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

  const isAuto = current == null || ((current.platforms?.length ?? 0) === 0 && (current.shopIds?.length ?? 0) === 0);
  // platform 域：底部「自动」= 该平台内每周最低价店铺（chip 已是平台自动时置灰）
  const isPlatformAuto =
    scope === 'platform'
      ? (current?.platforms?.length ?? 0) === 1
        && (current?.shopIds?.length ?? 0) === 0
        && current?.platforms[0] === scopePlatform
      : false;

  // 左列展开的平台（null = 跟随解析：已选渠道 → 首个）；切国家/产品重置
  const [active, setActive] = useState<string | null>(null);
  // 第三列展开的渠道（null = 不显示卖家列）。第一百七十轮（Eason）：浮层打开即
  // 展开全部层级——默认回落首个渠道，不再需要点一次渠道才出卖家列；手动点选
  // 其它渠道后跟随手选；切平台时手选渠道若不属于新平台则回落新平台首渠道
  const [sellerPanePicked, setSellerPane] = useState<string | null>(null);
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
  // 第三列展开的渠道：手选优先（且须属于当前展开平台），否则默认当前平台首渠道
  // ——打开浮层即三列全展开（第一百七十轮）
  const sellerPane =
    sellerPanePicked != null && activeRow?.shops.some((s) => s.channel_id === sellerPanePicked)
      ? sellerPanePicked
      : activeRow?.shops[0]?.channel_id ?? null;
  // 右列高亮：仅显式选中（自动 = 不锁渠道/卖家，无高亮行）

  const commitSeller = (channelId: string, seller: string | null): void => {
    onPick({ platforms: [], shopIds: [channelId], seller });
  };

  const shopTotalOf = (r: { shops: DimChannel[] }): number => r.shops.reduce((a, c) => a + c.shops, 0);
  const noteW = (n: number): number => measureText(`· ${n} 店铺`) * (fontSize.caption / 13);

  // 跨平台搜索：渠道显示名 / 平台名 / 卖家名。修改店铺单选，点结果即替换。
  const q = query.trim();
  const found = useMemo(() => searchShopCatalog(cc, q), [cc, q]);
  const hits = found.hits;
  const hitTotal = found.total;

  const hitItems: CascadeRowItem[] = hits.map((h) => ({
    key: h.key,
    label: h.label,
    active: selectedShopId === h.channelId && selectedSeller === h.seller,
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

  const panelWidth = narrow ? 'min(420px, calc(100vw - 48px))' : undefined;
  return (
    <div style={{ width: panelWidth, maxWidth: '100%', minWidth: 0 }}>
      <div style={{ display: 'flex', flexDirection: narrow ? 'column' : 'row', alignItems: narrow ? 'stretch' : 'center', gap: 8, padding: `8px ${space.md}px 6px`, borderBottom: `1px solid ${color.hairline}` }}>
        <Input
          size={narrow ? 'middle' : 'small'}
          allowClear
          prefix={<SearchOutlined style={{ color: color.mute }} />}
          placeholder="搜索平台 / 渠道 / 卖家"
          aria-label="搜索平台、渠道或卖家"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ height: narrow ? 44 : 24, fontSize: narrow ? fontSize.bodySm : fontSize.caption, width: narrow ? '100%' : 232 }}
        />
        {syncCtl && (
          <button
            type="button"
            aria-pressed={!!syncCtl.active}
            title={syncCtl.active
              ? '已同步：本组产品取价平台与主产品一致，点击取消并恢复同步前状态'
              : '本组产品的取价平台改成与主产品一致（只影响本组）'}
            onClick={(e) => {
              e.stopPropagation();
              syncCtl.onToggle();
            }}
            style={{
              flexShrink: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: narrow ? 44 : 20,
              padding: narrow ? '0 12px' : '0 8px',
              borderRadius: radius.pill,
              border: `1px solid ${syncCtl.active ? '#0070f3' : color.hairlineStrong}`,
              background: syncCtl.active ? selectSoft : color.canvas,
              color: syncCtl.active ? selectSoftInk : color.mute,
              font: 'inherit',
              fontSize: narrow ? 13 : 11,
              fontWeight: 600,
              lineHeight: '18px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            同步平台筛选
          </button>
        )}
      </div>
      {q ? (
        <>
          <CascadePanel open fill={narrow} rowHeight={narrow ? 44 : undefined} columns={[{ items: hitItems, width: narrow ? undefined : hitColWidth }]} />
          {hitTotal > hits.length && (
            <div style={{ padding: `5px ${space.md}px 2px`, fontSize: fontSize.caption, color: color.mute }}>
              共 {hitTotal} 个匹配，仅显示前 {SHOP_SEARCH_CAP} 个，可继续输入缩小范围
            </div>
          )}
        </>
      ) : null}
      <div style={{ display: q ? 'none' : undefined }}>
        <CascadePanel
          open
          stepped={narrow}
          levelLabels={['平台', '渠道', '卖家']}
          columns={[
            { items: platformItems, extraW: platformExtraW },
            { items: shopItems, extraW: shopExtraW },
            ...(sellerPane != null && sellerColWidth > 0
              ? [{
                  items: sellerItems,
                  width: sellerColWidth,
                  header: (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space.xs, width: '100%' }}>
                      <AutoTogglePill
                        label="渠道自动"
                        tall={narrow}
                        pressed={selectedShopId === sellerPane && selectedSeller == null}
                        hint="显示该渠道内每周最低价卖家"
                        context={paneChannel?.display_name ?? undefined}
                        onClick={() => commitSeller(sellerPane, null)}
                      />
                    </div>
                  ),
                }]
              : []),
          ]}
        />
      </div>
      <div style={{ padding: `6px ${space.md}px`, borderTop: `1px solid ${color.hairline}` }}>
        {scope === 'platform' ? (
          <AutoTogglePill
            label="平台自动"
            tall={narrow}
            pressed={isPlatformAuto}
            hint="该平台内每周最低价店铺"
            disabled={isPlatformAuto}
            context={scopePlatform}
            onClick={() => onPick({ platforms: [scopePlatform ?? ''], shopIds: [] })}
          />
        ) : (
          <AutoTogglePill
            label="自动取价"
            tall={narrow}
            pressed={isAuto}
            hint="每周最低在架价：优先取默认店铺；未设置时取预填主店；仍无则取默认平台。"
            disabled={isAuto}
            context={autoLabel}
            onClick={() => onPick(null)}
          />
        )}
      </div>
    </div>
  );
}
