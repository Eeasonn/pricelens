// ============================================================
// §5.3 框三：平台 / 店铺 —— 「平台→渠道→卖家」三级级联浮层，单选语义（第一百三十六轮：
// Eason——「和之前一样是平台+店铺两层；只不过默认选到某个平台的某个店铺」；
// 第一百四十一轮加第三级：渠道行整行点击展开该渠道的卖家（seller）清单（第一百四十
// 二轮追补，Eason：不用精确点箭头，整条可点即可；中列=导航、右列=提交）——
// 首行「全部店铺 · 最低价」= 渠道内取最低（默认口径，第一百四十一轮 Eason 拍板：
// 默认取最小、想要可指定某一家），下方按覆盖周数降序列卖家，可搜索，点选提交。
// 浮层锚定触发器右下（placement bottomRight）：第三列开合时右缘不动、整板不跳。
// 布局/交互骨架沿用旧版两栏级联（CascadeTrigger + Popover + CascadePanel），
// 语义从 checkbox 多选改为单选）：
//   点平台行 = 只切换右列店铺列表（不提交不关闭，平台行高亮）；
//   点店铺行 = 提交单渠道口径并关闭浮层；无 checkbox。
// 状态写入（数据层 effectiveChannelIds 的并集规则：shopIds 命中即入池，店铺级
// 选择绝不能同时写 platforms，否则整平台渠道全部入池）：
//   选店铺 = { platforms: [], shopIds: [channel_id] }；底部「恢复默认」= null。
// 默认选中（state.platform 为 null 时，浮层与触发器都呈现解析后的默认）：
//   默认店铺 = defaultChannelOf(cc)（第一百三十七轮回退链：配置页人工覆盖 → 维表预填
//   dim_default_channel.json（事实数据主店）→ null）；
//   仅当无具体默认店铺时 = 默认平台（defaultPlatformOf）但不预选具体店铺（右列无高亮行，
//   取价口径 = 该平台全部店铺最低价）。默认平台/店铺行带浅蓝「默认」小徽标。
// 触发器文案：已选店铺 = 「平台 · 店铺 display_name」（宽度放不下只显示店铺名）；
//   旧平台级状态（plat= 链接 / 旧持久化 platforms:[p]）= 平台名；未选（默认口径）
//   = 有具体默认店铺（预填或人工）时「默认 · 店铺 display_name」，仅预填缺失时
//   才「默认 · 平台名」占位。
// 国家切换：默认解析按 cc 自动跟随（选中态为 null 时无需额外处理）；当前选中
//   店铺不属于新国家时由 applyScopeDefaults / platformSelectionValidFor 重置。
// ============================================================
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button, Input, Popover } from 'antd';
import { useFilters } from '../../state/FiltersContext';
import { defaultChannelOf, defaultPlatformOf, sellersOfChannel } from '../../dataModel/aggregate';
import { dimChannel } from '../../data';
import type { DimChannel } from '../../dataModel/types';
import { color, fontSize, radius, selectSoft, selectSoftInk, space } from '../../theme/tokens';
import { useNarrowViewport } from '../../state/useNarrowViewport';
import { normalizePlatformSelection } from '../../state/urlSync';
import { autoColumnWidth, CascadePanel, CascadeTrigger, measureText } from '../ProductCascader';
import type { CascadeRowItem } from '../ProductCascader';

/** 「默认」小徽标：平台行 / 店铺行复用（selectSoft 浅蓝底，与 134 轮同一视觉语言） */
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

/** 行尾小注（「· N 店铺」）+ 可选徽标；列宽自适应经 extraW 预留，不截断 */
function RowTrailing({ note, badge }: { note: string; badge?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: space.xs, flexShrink: 0 }}>
      <span style={{ fontSize: fontSize.caption, color: color.mute }}>{note}</span>
      {badge && <DefaultPill />}
    </span>
  );
}

/** 「平台 · 店铺」完整触发器文案需要的行内 chrome 预算：CascadeTrigger 左右
 *  padding（space.sm+4 各一份）+ 文本前 gap + 下拉箭头 + 余量 */
const TRIGGER_CHROME = 2 * (space.sm + 4) + space.sm + 10 + 4;

export default function PlatformBox() {
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

  // 默认口径（与数据层 effectiveChannelIds 未选分支同构）：配置的默认店铺 → 默认平台
  const defaultChannelId = useMemo(() => defaultChannelOf(cc), [cc]);
  const defaultPlatform = useMemo(() => defaultPlatformOf(cc), [cc]);
  const defaultChannel = useMemo(
    () => dimChannel.find((c) => c.channel_id === defaultChannelId) ?? null,
    [defaultChannelId],
  );

  const [open, setOpen] = useState(false);
  // 左列展开的平台（null = 跟随解析：已选店铺 → 默认 → 首个）；每次打开重置
  const [active, setActive] = useState<string | null>(null);
  // 第三列展开的渠道（null = 不显示卖家列）；每次打开/切国家重置
  const [sellerPane, setSellerPane] = useState<string | null>(null);
  // 卖家列搜索词
  const [sellerQuery, setSellerQuery] = useState('');
  useEffect(() => {
    setActive(null);
    setSellerPane(null);
  }, [cc]); // 国家切换后左右列回解析态

  // 单选归一读取：店铺级（shopIds[0]）优先；仅平台级 = 旧 plat= 链接兼容
  const sel = normalizePlatformSelection(state.platform);
  const selectedShopId = sel?.shopIds[0] ?? null;
  const selectedSeller = selectedShopId != null ? sel?.seller ?? null : null;
  const selectedShop = selectedShopId
    ? dimChannel.find((c) => c.channel_id === selectedShopId) ?? null
    : null;
  const selectedPlatformOnly = selectedShop ? null : (sel?.platforms[0] ?? null);

  // 左列激活平台：手动点选 > 已选店铺所属平台 > 默认解析 > 首个平台
  const activePlatform =
    active ?? selectedShop?.platform ?? selectedPlatformOnly ?? defaultChannel?.platform ?? defaultPlatform ?? rows[0]?.platform ?? null;
  const activeRow = rows.find((r) => r.platform === activePlatform) ?? null;

  // 右列高亮店铺：显式选中 > （未动过筛选时的）配置默认店铺；平台级兼容态不预选
  const highlightedShopId = selectedShopId ?? (selectedPlatformOnly == null ? defaultChannelId : null);

  /** 选卖家/渠道 = 渠道内口径提交并关闭（seller null = 全部店铺取最低；
   *  渠道提交只发生在第三列首行，中列行为纯导航） */
  const commitSeller = (channelId: string, seller: string | null): void => {
    actions.set({ platform: { platforms: [], shopIds: [channelId], seller } });
    setOpen(false);
  };

  // 左列行：无 checkbox；点击仅切换右列（onLabelClick 不传 = 点击仅激活）
  // 平台行小注 = 组内各渠道店铺数求和（与配置页平台下拉、多平台比价弹窗同口径）；
  // r.shops.length 是渠道数，不是店铺数
  const shopTotalOf = (r: { shops: DimChannel[] }): number => r.shops.reduce((a, c) => a + c.shops, 0);
  const noteW = (n: number): number => measureText(`· ${n} 店铺`) * (fontSize.caption / 13);
  const badgeW = measureText('默认') * (fontSize.caption / 13) + 10 + space.xs; // 0 5px 左右 padding + gap
  const platformItems: CascadeRowItem[] = rows.map((r) => ({
    key: r.platform,
    label: r.platform,
    active: activePlatform === r.platform,
    onActivate: () => setActive(r.platform),
    trailing: (
      <RowTrailing
        note={`· ${shopTotalOf(r)} 店铺`}
        badge={defaultChannelId == null && r.platform === defaultPlatform}
      />
    ),
  }));
  const platformExtraW =
    Math.max(0, ...rows.map((r) => noteW(shopTotalOf(r)))) +
    (defaultChannelId == null && rows.some((r) => r.platform === defaultPlatform) ? badgeW : 0) +
    space.xs;

  // 第三列 = 展开渠道的卖家清单：首行「全部店铺 · 最低价」（渠道内取最低 = 默认口径），
  // 下方按覆盖周数降序；搜索词过滤（OZON 3P 数百家，搜索必备）
  const paneSellers = useMemo(
    () => (sellerPane ? sellersOfChannel(cc, sellerPane) : []),
    [cc, sellerPane],
  );
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
  // 列宽按「未过滤的全量清单」测定并显式固定：搜索过滤时宽度恒定，第三列不跳
  const sellerColWidth = useMemo(() => {
    if (!paneChannel) return 0;
    const full: CascadeRowItem[] = [
      { key: '__all__', label: '全部店铺 · 最低价' },
      ...paneSellers.map((x) => ({ key: x.seller, label: x.seller })),
    ];
    const noteBudget = Math.max(measureText(`· ${paneChannel.shops} 店铺`), measureText('· 24 周'));
    return autoColumnWidth(full, {
      extraW: noteBudget * (fontSize.caption / 13) + space.xs,
      min: 200,
      max: 380,
    });
  }, [paneChannel, paneSellers]);

  // 右列行：整行点击 = 下钻该渠道卖家列（中列=导航，第一百四十二轮追补 Eason：
  // 不必精确点行尾箭头）；提交只发生在第三列（「全部店铺 · 最低价」或具体卖家）。
  // 行激活态 = 正在展开的渠道；未展开任何列时回落当前选中/默认渠道高亮
  const shopItems: CascadeRowItem[] = (activeRow?.shops ?? []).map((s) => {
    const paneOpenHere = sellerPane === s.channel_id;
    const fallbackActive =
      sellerPane == null && (highlightedShopId === s.channel_id || (highlightedShopId == null && s.channel_id === defaultChannelId));
    return {
      key: s.channel_id,
      label: s.display_name,
      active: paneOpenHere || fallbackActive,
      onActivate: () => {
        setSellerPane(s.channel_id);
        setSellerQuery('');
      },
      trailing: (
        <RowTrailing note={`· ${s.shops} 店铺`} badge={s.channel_id === defaultChannelId} />
      ),
    };
  });
  const shopExtraW =
    Math.max(0, ...(activeRow?.shops ?? []).map((s) => noteW(s.shops))) +
    (defaultChannelId != null && (activeRow?.shops ?? []).some((s) => s.channel_id === defaultChannelId) ? badgeW : 0) +
    space.xs;

  // 触发器文案：已选店铺 = 「平台 · 店铺名」，实际宽度放不下只显示店铺名；
  // 旧平台级兼容态 = 平台名；默认口径 = 占位「默认 · …」
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [wrapW, setWrapW] = useState(0);
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = (): void => setWrapW(el.clientWidth);
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const fullShopLabel = selectedShop ? `${selectedShop.platform} · ${selectedShop.display_name}` : '';
  const fullSellerLabel = selectedShop && selectedSeller ? `${selectedShop.display_name} · ${selectedSeller}` : '';
  const fits = (t: string): boolean => wrapW > 0 && measureText(t) * (fontSize.bodySm / 13) <= wrapW - TRIGGER_CHROME;
  const shopLabelFits = fits(fullShopLabel);
  const labels = selectedShop
    ? selectedSeller
      ? [fits(fullSellerLabel) ? fullSellerLabel : selectedSeller]
      : [shopLabelFits ? fullShopLabel : selectedShop.display_name]
    : selectedPlatformOnly
      ? [selectedPlatformOnly]
      : [];
  const placeholder = defaultChannel
    ? `默认 · ${defaultChannel.display_name}`
    : defaultPlatform
      ? `默认 · ${defaultPlatform}`
      : '未筛选';

  return (
    <Popover
      trigger="click"
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setActive(null); // 每次打开回解析态（已选/默认），不残留上次点选
          setSellerPane(null);
          setSellerQuery('');
        }
      }}
      arrow={false}
      placement="bottomRight"
      destroyTooltipOnHide
      classNames={{ root: 'lpl-cascade-popover' }}
      styles={{ body: { padding: 0 } as const }}
      content={
        <div style={{ width: narrow ? 'min(420px, calc(100vw - 48px))' : undefined, maxWidth: '100%' }}>
          {!narrow && sellerPane != null && (
            <div style={{ padding: `8px ${space.md}px 6px`, borderBottom: `1px solid ${color.hairline}` }}>
              <Input
                size="small"
                allowClear
                placeholder="搜索卖家店铺"
                aria-label="搜索当前渠道的卖家"
                value={sellerQuery}
                onChange={(e) => setSellerQuery(e.target.value)}
                style={{ height: 24, fontSize: fontSize.caption }}
              />
            </div>
          )}
          <CascadePanel
            open={open}
            stepped={narrow}
            levelLabels={['平台', '渠道', '卖家']}
            columns={[
              { items: platformItems, extraW: platformExtraW },
              { items: shopItems, extraW: shopExtraW },
              ...(sellerPane != null && sellerColWidth > 0
                ? [{
                    items: sellerItems,
                    width: sellerColWidth,
                    header: narrow ? (
                      <Input
                        size="middle"
                        allowClear
                        placeholder="搜索卖家店铺"
                        aria-label="搜索当前渠道的卖家"
                        value={sellerQuery}
                        onChange={(e) => setSellerQuery(e.target.value)}
                        style={{ width: '100%', height: 44, fontSize: fontSize.bodySm }}
                      />
                    ) : undefined,
                  }]
                : []),
            ]}
          />
          <div style={{ padding: `6px ${space.md}px`, borderTop: `1px solid ${color.hairline}` }}>
            <Button
              type="link"
              size={narrow ? 'middle' : 'small'}
              style={{ padding: 0, height: narrow ? 44 : 20, fontSize: narrow ? fontSize.bodySm : fontSize.caption }}
              disabled={sel == null}
              aria-label="回到自动"
              title="回到默认店铺或默认平台的自动取价"
              onClick={() => actions.set({ platform: null })}
            >
              回到自动
            </Button>
          </div>
        </div>
      }
    >
      <div ref={wrapRef} style={{ width: '100%', minWidth: 0 }}>
        <CascadeTrigger labels={labels} placeholder={placeholder} open={open} />
      </div>
    </Popover>
  );
}
