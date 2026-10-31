// ============================================================
// 产业档位阶梯值域带金测（tierBandsOf）：Y 轴档位带的
// 阶梯数据源 —— 与 tierOrderOf 同读 dim_tier.ladders，code → 值域解析。
// ============================================================
import { describe, expect, it } from 'vitest';
import { tierBandsOf, tierOrderOf } from '../aggregate';
import type { Industry } from '../types';

describe('tierBandsOf（产业档位值域带）', () => {
  it('phone：恰 6 段，首段 <200 → {0, 200}，末段 1000+ → {1000, null}', () => {
    const bands = tierBandsOf('phone');
    expect(bands).toHaveLength(6);
    expect(bands[0]).toEqual({ code: '<200', label: '<200', min: 0, max: 200 });
    expect(bands[5]).toEqual({ code: '1000+', label: '1000+', min: 1000, max: null });
  });

  it('tablet：首段 <150 → {0, 150}，末段 800+ → {800, null}', () => {
    const bands = tierBandsOf('tablet');
    expect(bands[0]).toEqual({ code: '<150', label: '<150', min: 0, max: 150 });
    expect(bands[bands.length - 1]).toEqual({ code: '800+', label: '800+', min: 800, max: null });
  });

  it('audio：恰 4 段（<50 / 50-100 / 100-200 / 200+）', () => {
    const bands = tierBandsOf('audio');
    expect(bands.map((b) => b.code)).toEqual(['<50', '50-100', '100-200', '200+']);
    expect(bands[bands.length - 1]).toEqual({ code: '200+', label: '200+', min: 200, max: null });
  });

  it("label 格式：区间档 - → ~（200-400 → 200~400），开区间档原样", () => {
    const phone = tierBandsOf('phone');
    expect(phone[1]).toEqual({ code: '200-400', label: '200~400', min: 200, max: 400 });
    expect(phone[0].label).toBe('<200');
    expect(phone[5].label).toBe('1000+');
  });

  it('全产业阶梯相邻档位值域衔接（前档 max = 后档 min；开下界档 min=0、开上界档 max=null）', () => {
    for (const industry of ['phone', 'tablet', 'wearable', 'audio', 'iot', 'pc'] as Industry[]) {
      const bands = tierBandsOf(industry);
      expect(bands.map((b) => b.code)).toEqual(tierOrderOf(industry));
      expect(bands[0].min).toBe(0);
      expect(bands[bands.length - 1].max).toBeNull();
      for (let i = 1; i < bands.length; i++) {
        expect(bands[i - 1].max).toBe(bands[i].min);
      }
    }
  });
});
