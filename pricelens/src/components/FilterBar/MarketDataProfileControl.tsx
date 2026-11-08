import { useEffect } from 'react';
import { Segmented, Tag, Tooltip } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import { marketDataProfileOf } from '../../dataModel/marketProfile';
import { useFilters } from '../../state/FiltersContext';
import { color, fontSize, space } from '../../theme/tokens';

/** Shared stable/iterate control for non-ecommerce collection markets. */
export default function MarketDataProfileControl() {
  const { state, actions } = useFilters();
  const profile = marketDataProfileOf(state.countryCode);

  useEffect(() => {
    if (profile.granularityLocked && state.granularity !== profile.granularity) {
      actions.set({ granularity: profile.granularity });
    }
  }, [actions, profile.granularity, profile.granularityLocked, state.granularity]);

  if (!profile.granularityLocked) return null;

  return (
    <div role="group" aria-label="市场采集口径" style={{ display: 'flex', alignItems: 'center', gap: space.sm, flexWrap: 'wrap', minWidth: 0 }}>
      <span aria-hidden style={{ width: 1, height: 20, background: color.hairline, flexShrink: 0 }} />
      <Tag color="gold" style={{ marginInlineEnd: 0, fontSize: fontSize.caption, lineHeight: '18px' }}>运营商小册子</Tag>
      {profile.evidenceStatus === 'pending-review' ? <Tag color="orange" style={{ marginInlineEnd: 0, fontSize: fontSize.caption, lineHeight: '18px' }}>待复核</Tag> : null}
      {profile.evidenceStatus === 'ready' ? <Tag color="blue" style={{ marginInlineEnd: 0, fontSize: fontSize.caption, lineHeight: '18px' }}>已导入</Tag> : null}
      <span style={{ fontSize: fontSize.caption, color: color.body, whiteSpace: 'nowrap' }}>月度</span>
      <span style={{ fontSize: fontSize.caption, color: color.mute, whiteSpace: 'nowrap' }}>{profile.fixedPlatform ?? 'VODACOM SHOP'}</span>
      <span style={{ fontSize: fontSize.caption, color: color.mute, whiteSpace: 'nowrap' }}>分期期数</span>
      <Segmented
        size="small"
        aria-label="南非分期期数"
        value={state.financingTerm ?? undefined}
        options={profile.financingTerms.map((term) => ({ label: `${term} 期`, value: term }))}
        onChange={(value) => actions.set({ financingTerm: value as 24 | 36 })}
      />
      {state.financingTerm == null ? <span role="status" style={{ fontSize: fontSize.caption, color: color.warningInk, whiteSpace: 'nowrap' }}>请选择 24 或 36 期</span> : null}
      {profile.evidenceStatus === 'pending-review' ? <span role="status" style={{ fontSize: fontSize.caption, color: color.warningInk, whiteSpace: 'nowrap' }}>待复核，暂不参与计算</span> : null}
      {profile.evidenceStatus === 'ready' ? <span role="status" style={{ fontSize: fontSize.caption, color: color.warningInk, whiteSpace: 'nowrap' }}>规格未标明，按型号汇总</span> : null}
      <Tooltip title={profile.evidenceStatus === 'ready'
        ? '南非价格来自 VODACOM SHOP 运营商小册子，按月记录。当前已导入真实采集价格，源表未提供容量或颜色时按型号级汇总，并保留原始来源与门禁状态。'
        : '南非价格来自运营商小册子，按月记录。复核通过并接入月度事实后，选择分期期数才显示对应价格。'}>
        <InfoCircleOutlined aria-label="南非数据口径说明" style={{ color: color.mute, fontSize: 12 }} />
      </Tooltip>
    </div>
  );
}
