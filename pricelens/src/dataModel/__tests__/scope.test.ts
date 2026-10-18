import { describe, expect, it } from 'vitest';
import { DEFAULT_DATA_SCOPE, isDataScopeSupported, normalizeDataScope, scopeLabels } from '../scope';

describe('DataScope', () => {
  it('接受 RU/phone，拒绝未开放范围并回退', () => {
    expect(isDataScopeSupported(DEFAULT_DATA_SCOPE)).toBe(true);
    expect(normalizeDataScope({ countryCode: 'XX', industry: 'phone' })).toEqual(DEFAULT_DATA_SCOPE);
  });

  it('从维表生成页头和内容标题标签', () => {
    expect(scopeLabels(DEFAULT_DATA_SCOPE)).toEqual({ region: '欧亚', country: 'R国', industry: '手机' });
  });
});
