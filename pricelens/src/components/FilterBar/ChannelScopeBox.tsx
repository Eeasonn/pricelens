// ============================================================
// §5.2 平台 / 渠道 / 卖家 三级级联筛选器（2026-11-17，Eason 三轮定版）：
//   左列 平台（单击 = 只切换平台选择，永不展开；行尾 › 按钮 = 打开/收起该平台的
//        渠道层手动选择——选中与展开彻底分离，三轮指令）
//   中列 渠道（平台×店铺类型，如「OZON 3P」；点击 = 切换卖家列指向，纯导航）
//   右列 卖家（渠道内具体卖家店铺，行尾「· N 周」覆盖数；点击 = 钉该卖家取价）
// 展开规则（三轮指令）：
//   · 自动取价生效（未钉店铺）→ 打开面板只显示平台列，用户选到平台即可；
//   · 自动取价未生效（已钉店铺，按钮=「未选中」）→ 打开面板自动下钻到第二层，
//     且第三层一并带出（渠道列+卖家列同屏），暗示用户改选具体店铺；
//   · 手动点行尾 › 展开渠道层时同样把卖家列带出（见第二层必带第三层）。
// 顶部全局搜索框（平台 / 渠道 / 卖家 三列同时过滤）+ 左上「自动取价/未选中」按钮。
// 取价语义：自动（null）= 默认平台池每周最低价店铺；选平台 = 该平台池；
//   钉卖家 = 严格单渠道单卖家（shopIds + seller，与旧链接 shop=/seller= 同键）。
// 触发器占位「默认 · {平台锚}」；已选店铺显示「渠道 · 卖家」。
// ============================================================
import { useEffect, useMemo, useState } from 'react';
import { Button, Input, Popover } from 'antd';
import { RightOutlined, SearchOutlined } from '@ant-design/icons';
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
  // 视口宽（浮层钳视口计算用；resize 跟随重算，2026-11-17 全量审视补）
  const [vw, setVw] = useState(typeof window === 'undefined' ? 1280 : window.innerWidth);
  useEffect(() => {
    const onResize = (): void => setVw(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
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

  /** 平台行点击（三轮指令）：只切换平台选择，永不展开下级。已在浏览渠道层时
   *  展开目标跟随切换到新选平台（卖家列回落新平台首渠道）；未展开保持平台列 */
  const onPlatformRow = (p: string): void => {
    commit({ platforms: [p], shopIds: [], seller: null });
    if (expanded != null) {
      setExpanded(p);
      setPaneChannel(rows.find((r) => r.platform === p)?.shops[0]?.channel_id ?? null);
    }
  };

  /** 展开/收起某平台的渠道层（行尾 › 按钮）：展开时第三层一并带出（三轮指令：
   *  第二层弹出必带第三层），卖家列回落该平台首渠道 */
  const toggleExpand = (p: string): void => {
    if (expanded === p) {
      setExpanded(null);
      setPaneChannel(null);
    } else {
      setExpanded(p);
      setPaneChannel(rows.find((r) => r.platform === p)?.shops[0]?.channel_id ?? null);
    }
  };

  /** 平台行尾 › 按钮（下钻入口）：只管展开/收起，不改选择。lpl-hit 外扩命中区
   *  要求按钮自身 position:relative（否则 ::after 锚页级祖先劫持点击，两次撞坑） */
  const expandBtnOf = (p: string) => (
    <button
      type="button"
      className="lpl-hit"
      aria-label={expanded === p ? `收起 ${p} 渠道层` : `展开 ${p} 渠道层`}
      aria-expanded={expanded === p}
      title={expanded === p ? '收起渠道层' : '展开渠道层，手动选渠道/店铺'}
      onClick={(e) => {
        e.stopPropagation();
        toggleExpand(p);
      }}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 18,
        height: 18,
        borderRadius: radius.pill,
        border: `1px solid ${expanded === p ? 'rgba(0, 112, 243, 0.35)' : color.hairline}`,
        background: expanded === p ? selectSoft : 'transparent',
        color: expanded === p ? selectSoftInk : color.mute,
        cursor: 'pointer',
        flexShrink: 0,
      }}
    >
      <RightOutlined style={{ fontSize: 9 }} />
    </button>
  );

  const q = query.trim().toLowerCase();

  // 左列平台行：点击名字 = 只切换平台（永不展开）；行尾 = 「默认」徽标（如适用）
  // + › 下钻按钮（打开渠道层手动选择）
  const platformRows = rows.filter((r) => !q || r.platform.toLowerCase().includes(q));
  const platformItems: CascadeRowItem[] = platformRows.map((r) => ({
    key: r.platform,
    label: r.platform,
    active: expanded === r.platform || (expanded == null && selectedPlatform === r.platform),
    onActivate: () => onPlatformRow(r.platform),
    trailing: (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        {defaultPlatform === r.platform ? <DefaultPill /> : null}
        {expandBtnOf(r.platform)}
      </span>
    ),
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

  // 平台/渠道列同样按内容测定宽（2026-11-17 Eason 二次反馈「还是有空白」：
  // 浮层硬定宽时短名单列右缘留白——三列全部内容测定，浮层宽=可见列宽和）
  const badgeW = measureText('默认') * (fontSize.caption / 13) + 10 + space.xs;
  const platformColWidth = useMemo(
    () => autoColumnWidth(platformItems, { extraW: badgeW + space.xs + 16, min: 150, max: 280 }),
    [platformItems, badgeW],
  );
  // 渠道列宽按「未过滤全量清单」测定（与 sellerColWidth 同口径——搜索时列宽不跳）
  const channelColWidth = useMemo(
    () =>
      expanded
        ? autoColumnWidth(
            (rows.find((r) => r.platform === expanded)?.shops ?? []).map((s2) => ({ key: s2.channel_id, label: s2.display_name })),
            { extraW: space.xs + 16, min: 150, max: 280 },
          )
        : 0,
    [expanded, rows],
  );

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
      getPopupContainer={(t) => (t.parentElement as HTMLElement) ?? document.body}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setQuery('');
          // 三轮指令：自动取价未生效（已钉店铺，按钮=「未选中」）→ 打开面板自动
          // 下钻到钉过的渠道层并把卖家列一并带出，暗示改选具体店铺；
          // 自动取价生效 → 只显示平台列（选到平台即可，下钻走行尾 › 按钮）
          if (selShop) {
            setExpanded(selShop.platform);
            setPaneChannel(selShop.channel_id);
          } else {
            setExpanded(null);
            setPaneChannel(null);
          }
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
            // 宽度 = 可见列内容测定宽之和（2026-11-17 Eason 二次反馈：短名单列
            // 硬定宽右缘留白——三列全走内容测定）；触发器居筛选条中部、浮层向左
            // 展开，三列全开时总宽须留出视口余量（Math.min 钳视口）
            width: narrow
              ? 'min(420px, calc(100vw - 48px))'
              : Math.min(
                  platformColWidth + channelColWidth + (paneChannel != null && sellerColWidth > 0 ? sellerColWidth : 0),
                  vw - 24,
                ),
            overflowX: 'auto', // 钳视口时列横滚兜底（2026-11-17 全量审视：不再静默裁卖家列）
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
              { items: platformItems, width: platformColWidth },
              ...(expanded && channelColWidth > 0
                ? [{ items: channelItems, width: channelColWidth }]
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
