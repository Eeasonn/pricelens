// ============================================================
// 默认平台店铺回退链单测（第一百三十七轮冷启动预填）：
//   defaultChannelOf = ① 人工覆盖（LPL3.config.defaultShop，校验渠道属国）
//                    → ② 维表预填（dim_default_channel.json，事实数据主店，校验渠道属国）
//                    → ③ null（回默认平台全渠道口径的兜底）。
// 同时锚预填完整性：每启用国恰 1 条且 = 该国默认平台下的登记渠道——预填全量生效时
// ③ 不触发（effectiveChannelIds 未选分支恒单渠道）。与 verify.mjs [1] 的预填断言同口径。
// ============================================================
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { dimChannel, dimRegion } from '../../data';
import { defaultChannelOf, defaultPlatformOf, effectiveChannelIds, prefillDefaultChannelOf } from '../aggregate';
import { saveDefaultShopOverrides } from '../../state/defaultShopStore';

/** node 环境无 localStorage：装内存桩驱动 defaultShopStore 的覆盖读写 */
const mem = new Map<string, string>();
beforeAll(() => {
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  };
});
afterEach(() => {
  saveDefaultShopOverrides({}); // 清人工覆盖，用例间互不污染（回预填链）
});

const enabledRegions = dimRegion.filter((r) => r.enabled);

describe('预填完整性（dim_default_channel.json 全量覆盖启用国）', () => {
  it('每启用国都有预填，且渠道属该国、平台 = dim_region.default_platform', () => {
    expect(enabledRegions.length).toBeGreaterThanOrEqual(20);
    for (const r of enabledRegions) {
      const cc = r.country_code;
      const pre = prefillDefaultChannelOf(cc);
      const ch = dimChannel.find((c) => c.channel_id === pre);
      expect(pre, `${cc} 缺预填`).not.toBeNull();
      expect(ch?.country_code, `${cc} 预填渠道不在该国`).toBe(cc);
      expect(ch?.platform, `${cc} 预填渠道平台 ≠ 默认平台`).toBe(r.default_platform);
    }
  });

  it('_comment 说明字段不参与国家查询', () => {
    expect(prefillDefaultChannelOf('_comment')).toBeNull();
  });

  it('预填全量生效：无覆盖时每国默认口径 = 单渠道（null 兜底分支不触发）', () => {
    for (const r of enabledRegions) {
      const cc = r.country_code;
      expect(effectiveChannelIds(cc, null), cc).toEqual([prefillDefaultChannelOf(cc)]);
    }
  });
});

describe('defaultChannelOf 回退链：覆盖 → 预填 → null', () => {
  it('无覆盖 = 预填（RU → DNS 独立站，verify 冒烟同锚）', () => {
    expect(defaultChannelOf('RU')).toBe('RU:dns:独立站');
    expect(effectiveChannelIds('RU', null)).toEqual(['RU:dns:独立站']);
  });

  it('人工覆盖优先于预填：覆盖 RU → OZON 后单渠道口径随之切换', () => {
    saveDefaultShopOverrides({ RU: 'RU:ozon:3P' });
    expect(defaultChannelOf('RU')).toBe('RU:ozon:3P');
    expect(effectiveChannelIds('RU', null)).toEqual(['RU:ozon:3P']);
  });

  it('非法覆盖（渠道不属于该国 / 不存在的 channel_id）回退预填', () => {
    saveDefaultShopOverrides({ RU: 'SA:jarir:独立站' }); // 他国渠道
    expect(defaultChannelOf('RU')).toBe('RU:dns:独立站');
    saveDefaultShopOverrides({ RU: 'RU:not-a-channel' }); // 不存在的渠道
    expect(defaultChannelOf('RU')).toBe('RU:dns:独立站');
  });

  it('清除覆盖后回到预填（配置页「清除人工配置，回到预填」的数据层语义）', () => {
    saveDefaultShopOverrides({ RU: 'RU:ozon:3P' });
    expect(defaultChannelOf('RU')).toBe('RU:ozon:3P');
    saveDefaultShopOverrides({});
    expect(defaultChannelOf('RU')).toBe('RU:dns:独立站');
  });

  it('null 兜底分支：无预填且无覆盖的国家（维表外）= null，取价渠道集为空不炸', () => {
    expect(prefillDefaultChannelOf('XX')).toBeNull();
    expect(defaultChannelOf('XX')).toBeNull();
    expect(defaultPlatformOf('XX')).toBeNull();
    expect(effectiveChannelIds('XX', null)).toEqual([]);
  });
});
