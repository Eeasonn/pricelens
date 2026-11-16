// ============================================================
// §5.2 平台 / 渠道 / 卖家 三级级联筛选器（2026-11-17，Eason 二轮定版：截图对齐
// 旧三级级联形态，替上午版「平台→类型→店铺」）：
//   左列 平台（单击 = 只选平台；已选中行再点一次 = 展开渠道层）
//   中列 渠道（平台×店铺类型，如「OZON 3P」；点击 = 展开该渠道卖家列，纯导航）
//   右列 卖家（渠道内具体卖家店铺，行尾「· N 周」覆盖数；点击 = 钉该卖家取价）
// 顶部全局搜索框（平台 / 渠道 / 卖家 三列同时过滤）。
// 相对旧 PlatformBox 的四点收敛（Eason 本轮指令）：
//   ① 行尾「· N 店铺」小注全部去掉（卖家行「· N 周」保留）；
//   ② 第三列顶部「渠道自动」行退役——渠道内自动取价不再提供；
//   ③ 只保留底部一枚「自动取价」按钮 = 平台内每周最低价店铺（自动口径）；
//     选中具体店铺后按钮文案变「未选中」，点击回自动；
//   ④ 平台行「单击只选平台、再点才展开下一层」（选中与展开分离）。
// 取价语义：自动（null）= 默认平台池每周最低价店铺；选平台 = 该平台池；
//   钉卖家 = 严格单渠道单卖家（shopIds + seller，与旧链接 shop=/seller= 同键）。
// 触发器占位「默认 · {平台锚}」；已选店铺显示「渠道 · 卖家」。
// ============================================================
import { useEffect, useMemo, useState } from 'react';
import { Button, Input, Popover } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { useFilters } from '../../state/FiltersContext';
import { defaultPlatformAnchorOf, sellersOfChannel } from '../../dataModel/aggregate';
import { dimChannel } from '../../data';
import type { DimChannel } from '../../dataModel/types';
import { color, fontSize, radius, selectSoft, selectSoftInk, space } from '../../theme/tokens';
import { useNarrowViewport } from '../../state/useNarrowViewport';
import { autoColumnWidth, CascadePanel, CascadeTrigger, measureText } from '../ProductCascader';
import type { CascadeRowItem } from '../ProductCascader';

/** 「默认」小徽标：默认平台行标识（自动取价锚） */
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

  // 默认平台锚（触发器占位 + 「默认」徽标 + 自动取价口径）
  const defaultPlatform = useMemo(() => defaultPlatformAnchorOf(cc), [cc]);

  const [open, setOpen] = useState(false);
  // 已展开渠道层的平台（null = 只显示平台列——「单击只选平台，再点展开下一层」）
  const [expanded, setExpanded] = useState<string | null>(null);
  // 卖家列展开的渠道（null = 不显示卖家列）
  const [paneChannel, setPaneChannel] = useState<string | null>(null);
  // 全局搜索词（平台 / 渠道 / 卖家 三列同时过滤）
  const [query, setQuery] = useState('');
  useEffect(() => {
    setExpanded(null);
    setPaneChannel(null);
  }, [cc]); // 国家切换后回平台列

  const commit = (next: Parameters<typeof actions.set>[0]['platform']): void => {
    actions.set({ platform: next });
  };

  // 当前选择读取（state 全量，不做单选归一——多平台并集如实显示）
  const selShop = state.platform?.shopIds[0]
    ? dimChannel.find((c) => c.channel_id === state.platform!.shopIds[0]) ?? null
    : null;
  const selSeller = selShop ? state.platform?.seller ?? null : null;
  const selPlatforms = state.platform && state.platform.shopIds.length === 0 ? state.platform.platforms : [];
  const multiPlatformLabel = selPlatforms.length > 1 ? selPlatforms.join('、') : null;
  // 底部按钮三态（2026-11-17 二轮）：默认自动（platform null）=「自动取价」禁用；
  // 平台级（未钉店铺）=「自动取价」可点（点击回默认平台自动）；钉店铺 =「未选中」可点
  const isAuto = state.platform == null || (state.platform.platforms.length === 0 && state.platform.shopIds.length === 0);
  const pinnedShop = selShop != null;
  const selectedPlatform = selShop?.platform ?? selPlatforms[0] ?? null;

  /** 平台行点击（选中与展开分离）：未选中 → 只选平台（不展开）；已选中 → 展开渠道层 */
  const onPlatformRow = (p: string): void => {
    if (selectedPlatform === p) {
      setExpanded(p);
      setPaneChannel(null);
      setQuery('');
    } else {
      commit({ platforms: [p], shopIds: [], seller: null });
      setExpanded(null);
      setPaneChannel(null);
    }
  };

  const q = query.trim().toLowerCase();

  // 左列平台行：点击 = 选中/展开（见上）；行尾只有「默认」徽标（·N 店铺 已按本轮指令去掉）
  const platformRows = rows.filter((r) => !q || r.platform.toLowerCase().includes(q));
  const platformItems: CascadeRowItem[] = platformRows.map((r) => ({
    key: r.platform,
    label: r.platform,
    active: expanded === r.platform || (expanded == null && selectedPlatform === r.platform),
    onActivate: () => onPlatformRow(r.platform),
    trailing: defaultPlatform === r.platform ? <DefaultPill /> : undefined,
  }));

  // 中列渠道行（纯导航 = 展开卖家列）：行尾无小注
  const expandedRow = rows.find((r) => r.platform === expanded) ?? null;
  const channelRows = (expandedRow?.shops ?? []).filter((s) => !q || s.display_name.toLowerCase().includes(q));
  const channelItems: CascadeRowItem[] = channelRows.map((s) => ({
    key: s.channel_id,
    label: s.display_name,
    active: paneChannel === s.channel_id,
    onActivate: () => {
      setPaneChannel(s.channel_id);
      setQuery('');
    },
  }));

  // 右列卖家行（点击 = 钉该卖家，提交并关闭）：行尾「· N 周」覆盖数保留
  const paneSellers = useMemo(() => (paneChannel ? sellersOfChannel(cc, paneChannel) : []), [cc, paneChannel]);
  const sellerRows = paneSellers.filter((x) => !q || x.seller.toLowerCase().includes(q));
  const paneChannelRow = paneChannel ? dimChannel.find((c) => c.channel_id === paneChannel) ?? null : null;
  const sellerItems: CascadeRowItem[] = sellerRows.map((x) => ({
    key: x.seller,
    label: x.seller,
    active: selShop?.channel_id === paneChannel && selSeller === x.seller,
    onLabelClick: () => {
      if (paneChannel == null) return;
      commit({ platforms: [], shopIds: [paneChannel], seller: x.seller });
      setOpen(false);
    },
    trailing: <span style={{ fontSize: fontSize.caption, color: color.mute, flexShrink: 0 }}>· {x.weeks} 周</span>,
  }));
  // 卖家列宽按「未过滤的全量清单」测定并显式固定（搜索过滤时第三列不跳）
  const sellerColWidth = useMemo(() => {
    if (!paneChannel) return 0;
    const full: CascadeRowItem[] = paneSellers.map((x) => ({ key: x.seller, label: x.seller }));
    const noteBudget = Math.max(measureText('· 24 周'), 0) * (fontSize.caption / 13) + space.xs;
    return autoColumnWidth(full, { extraW: noteBudget, min: 200, max: 340 });
  }, [paneChannel, paneSellers]);

  // 触发器文案：钉卖家 = 「渠道 · 卖家」；钉渠道（旧链接）= 渠道名；平台级 = 平台名；
  // 多平台并集如实全量；自动 = 占位「默认 · 平台锚」
  const fullShopLabel = selShop ? (selSeller ? `${selShop.display_name} · ${selSeller}` : selShop.display_name) : '';
  const labels = selShop
    ? [fullShopLabel]
    : multiPlatformLabel
      ? [multiPlatformLabel]
      : selPlatforms.length === 1
        ? [selPlatforms[0]]
        : [];
  const placeholder = defaultPlatform ? `默认 · ${defaultPlatform}` : '未筛选';

  return (
    <Popover
      trigger="click"
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setExpanded(null); // 每次打开回平台列（单击选平台 / 再点展开）
          setPaneChannel(null);
          setQuery('');
        }
      }}
      arrow={false}
      placement="bottomRight"
      destroyOnHidden
      classNames={{ root: 'lpl-cascade-popover' }}
      styles={{ body: { padding: 0 } as const }}
      content={
        <div
          style={{
            // 宽度随已展开列数自适应（2026-11-17 Eason：未展开不留空白区域）——
            // 平台列 208 + 渠道列 208 + 卖家列（内容测定宽）；触发器居筛选条中部、
            // 浮层向左展开，三列全开时总宽须留出视口余量（maxWidth 钳视口）
            width: narrow
              ? 'min(420px, calc(100vw - 48px))'
              : Math.min(
                  208 + (expanded ? 208 : 0) + (paneChannel != null && sellerColWidth > 0 ? sellerColWidth : 0),
                  typeof window !== 'undefined' ? window.innerWidth - 24 : 720,
                ),
            transition: 'width 160ms ease',
          }}
        >
          {/* 顶部一行：左「自动取价」胶囊（2026-11-17 Eason：从底部挪左上角）+
              右全局搜索（平台 / 渠道 / 卖家 三列同时过滤；OZON 3P 卖家数百家，搜索必备） */}
          <div style={{ padding: `8px ${space.md}px`, borderBottom: `1px solid ${color.hairline}`, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Button
              type="link"
              size="small"
              style={{
                padding: '0 8px',
                height: 22,
                fontSize: fontSize.caption,
                borderRadius: radius.pill,
                background: pinnedShop ? 'transparent' : selectSoft,
                color: pinnedShop ? color.mute : selectSoftInk,
                fontWeight: pinnedShop ? 400 : 600,
                flexShrink: 0,
              }}
              aria-label="自动取价"
              title={pinnedShop
                ? '当前已钉具体店铺，自动取价未生效——点击回到所选平台的每周最低价店铺口径'
                : '自动取价：每周默认取所选平台下最低价店铺的价格'}
              onClick={() => commit(null)}
            >
              {pinnedShop ? '未选中' : '自动取价'}
            </Button>
            <Input
              size="small"
              allowClear
              prefix={<SearchOutlined style={{ color: color.mute, fontSize: 12 }} />}
              placeholder="搜索平台 / 渠道 / 卖家"
              aria-label="搜索平台、渠道或卖家"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ height: 26, fontSize: fontSize.caption, flex: '1 1 auto', minWidth: 0 }}
            />
          </div>
          <CascadePanel
            open={open}
            stepped={narrow}
            levelLabels={['平台', '渠道', '卖家']}
            columns={[
              { items: platformItems },
              ...(expanded
                ? [{ items: channelItems, width: 208 }]
                : []),
              ...(paneChannel != null && sellerColWidth > 0
                ? [{ items: sellerItems, width: sellerColWidth }]
                : []),
            ]}
          />
        </div>
      }
    >
      <div data-testid="channel-scope-trigger" style={{ width: '100%', minWidth: 0 }}>
        <CascadeTrigger labels={labels} placeholder={placeholder} open={open} />
      </div>
    </Popover>
  );
}
