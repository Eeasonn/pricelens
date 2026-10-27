// ============================================================
// 产品级取价渠道选择浮层（第一百六十轮）：平台口径下沉到每条产品线后，
// 图例药丸上的渠道 chip 点击弹出本浮层——「自动」= 数据量足够的渠道里
// 日常价（中位价）最低的那家平台-店铺；也可勾选任意平台/渠道固定口径。
// 渠道行带中位价与覆盖周数（自动口径的依据透明可查）。
// ============================================================
import { useMemo, type CSSProperties } from 'react';
import { CheckOutlined } from '@ant-design/icons';
import { autoChannelOf, channelStatsOf, type ChannelPriceStat } from '../../dataModel/aggregate';
import type { CurrencyMode } from '../../dataModel/types';
import type { PlatformSelection } from '../../state/filtersTypes';
import { color, radius, selectSoft } from '../../theme/tokens';

const ACTIVE_BG = selectSoft;

function priceText(stat: ChannelPriceStat, currency: CurrencyMode): string {
  const v = currency === 'usd' ? stat.medianUsd : stat.medianLocal;
  const num = v >= 1000 ? v.toLocaleString('en-US') : String(Math.round(v * 10) / 10);
  return currency === 'usd' ? `$${num}` : num;
}

export default function ChannelSelectPopover({
  cc,
  skuIds,
  current,
  currency,
  onPick,
}: {
  cc: string;
  skuIds: string[];
  /** 当前口径：null = 自动 */
  current: PlatformSelection | null;
  currency: CurrencyMode;
  onPick: (sel: PlatformSelection | null) => void;
}) {
  const stats = useMemo(() => channelStatsOf(cc, skuIds), [cc, skuIds]);
  const autoChannel = useMemo(() => autoChannelOf(cc, skuIds), [cc, skuIds]);
  const currentChannel = current?.shopIds[0] ?? null;
  const currentPlatforms = current?.platforms ?? [];
  const isAuto = current == null || (currentChannel == null && currentPlatforms.length === 0);
  const active = (stat: ChannelPriceStat): boolean =>
    isAuto
      ? stat.channelId === autoChannel // 自动态高亮实际选中渠道（覆盖阈值过滤后的中位价最低者）
      : stat.channelId === currentChannel || currentPlatforms.includes(stat.platform);

  const rowStyle = (on: boolean): CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    width: '100%',
    padding: '5px 8px',
    borderRadius: radius.control,
    border: 'none',
    background: on ? ACTIVE_BG : 'transparent',
    cursor: 'pointer',
    textAlign: 'left',
    color: color.body,
  });

  return (
    <div style={{ width: 264, maxHeight: 340, overflowY: 'auto', padding: 2 }}>
      <button
        type="button"
        style={rowStyle(current == null || (currentChannel == null && currentPlatforms.length === 0))}
        onClick={() => onPick(null)}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: color.ink, flex: 1 }}>自动 · 日常价最低的店铺</span>
        {(current == null || (currentChannel == null && currentPlatforms.length === 0)) && (
          <CheckOutlined style={{ fontSize: 11, color: color.link }} />
        )}
      </button>
      {stats.map((stat) => (
        <button
          key={stat.channelId}
          type="button"
          style={rowStyle(active(stat))}
          title={`${stat.displayName} · 覆盖 ${stat.weeks} 周`}
          onClick={() => onPick({ platforms: [], shopIds: [stat.channelId] })}
        >
          <span style={{ fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {stat.displayName}
          </span>
          <span style={{ fontSize: 10, color: color.mute, flexShrink: 0 }}>
            {priceText(stat, currency)} · {stat.weeks} 周
          </span>
          {active(stat) && <CheckOutlined style={{ fontSize: 11, color: color.link, flexShrink: 0 }} />}
        </button>
      ))}
      {stats.length === 0 && (
        <div style={{ padding: '8px 10px', fontSize: 11, color: color.mute }}>该产品在本国暂无采集价</div>
      )}
    </div>
  );
}
