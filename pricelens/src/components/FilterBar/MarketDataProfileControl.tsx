import { useEffect } from 'react';
import { Checkbox, Segmented, Tag, Tooltip } from 'antd';
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

  // 2026-11-11 Eason：进页默认「后付 · 36 期」——册子里行数最多的口径，不再默认空白。
  // 只在「从未选过」(financingType==null) 时兜底：不能拿 financingTerms.length===0 当
  // 未选信号——切到先付后 applyMarketDataProfile 会把 terms 清空（先付无期数，正确
  // 行为），此 effect 若据此回弹后付·36，先付就永远切不过去（2026-11-11 实机回弹 BUG）。
  useEffect(() => {
    if (profile.granularityLocked && state.financingType == null) {
      actions.set({ financingType: 'installment', financingTerms: [36] });
    }
  }, [actions, profile.granularityLocked, state.financingType]);

  if (!profile.granularityLocked) return null;

  const payType = state.financingType === 'prepaid' ? 'prepaid' : 'installment';
  const terms = Array.isArray(state.financingTerms) ? state.financingTerms : [];

  return (
    <div role="group" aria-label="市场采集口径" style={{ display: 'flex', alignItems: 'center', gap: space.sm, flexWrap: 'wrap', minWidth: 0 }}>
      <span aria-hidden style={{ width: 1, height: 20, background: color.hairline, flexShrink: 0 }} />
      <Tag color="gold" style={{ marginInlineEnd: 0, fontSize: fontSize.caption, lineHeight: '18px' }}>运营商小册子</Tag>
      {profile.evidenceStatus === 'pending-review' ? <Tag color="orange" style={{ marginInlineEnd: 0, fontSize: fontSize.caption, lineHeight: '18px' }}>待复核</Tag> : null}
      {profile.evidenceStatus === 'ready' ? <Tag color="blue" style={{ marginInlineEnd: 0, fontSize: fontSize.caption, lineHeight: '18px' }}>已导入</Tag> : null}
      <span style={{ fontSize: fontSize.caption, color: color.body, whiteSpace: 'nowrap' }}>月度</span>
      <span style={{ fontSize: fontSize.caption, color: color.mute, whiteSpace: 'nowrap' }}>{profile.fixedPlatform ?? 'VODACOM SHOP'}</span>
      <span style={{ fontSize: fontSize.caption, color: color.body, whiteSpace: 'nowrap' }}>付费方式</span>
      <Segmented
        size="small"
        aria-label="南非付费方式"
        value={payType}
        options={[
          { label: '先付', value: 'prepaid' },
          { label: '后付', value: 'installment' },
        ]}
        onChange={(value) => actions.set(value === 'prepaid'
          ? { financingType: 'prepaid' }
          : { financingType: 'installment', financingTerms: terms.length > 0 ? terms : [36] })}
      />
      {payType === 'installment' ? (
        <>
          <span style={{ fontSize: fontSize.caption, color: color.mute, whiteSpace: 'nowrap' }}>期数</span>
          {/* 2026-11-11 Eason：期数多选——勾几期看几期，每期各出一条月供线 */}
          {profile.financingTerms.map((term) => {
            const on = terms.includes(term);
            return (
              <Checkbox
                key={term}
                checked={on}
                onChange={() => {
                  const next = on ? terms.filter((t) => t !== term) : [...terms, term].sort((a, b) => a - b);
                  actions.set({ financingTerms: next });
                }}
                style={{ fontSize: fontSize.caption, lineHeight: '18px' }}
              >
                {term} 期
              </Checkbox>
            );
          })}
        </>
      ) : null}
      {profile.evidenceStatus === 'pending-review' ? <span role="status" style={{ fontSize: fontSize.caption, color: color.warningInk, whiteSpace: 'nowrap' }}>待复核，暂不参与计算</span> : null}
      {profile.evidenceStatus === 'ready' ? <span role="status" style={{ fontSize: fontSize.caption, color: color.warningInk, whiteSpace: 'nowrap' }}>按型号汇总</span> : null}
      <Tooltip title={profile.evidenceStatus === 'ready'
        ? '南非价格来自 VODACOM SHOP 运营商小册子，按月记录。先付 = 一次性买断价；后付 = 合约月供，期数可多选（勾几期看几期，每期各一条线）。源表未提供容量或版本信息时按型号级汇总。'
        : '南非价格来自运营商小册子，按月记录。先付 = 一次性买断价；后付 = 合约月供，期数可多选。'}>
        <InfoCircleOutlined aria-label="南非数据口径说明" style={{ color: color.mute, fontSize: 12 }} />
      </Tooltip>
    </div>
  );
}
