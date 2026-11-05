// ============================================================
// 版本通道唯一判定源（appChannel.ts）单元测试：
// vitest 运行于 dev 形态（import.meta.env.DEV === true）→ 本文件锁定
// 「测试 / 本地 dev = 迭代版」这一判定基线；稳定版通道行为由
// pages/__tests__/stableChannel.test.tsx（vi.mock stable）覆盖。
// ============================================================
import { describe, expect, it } from 'vitest';
import { APP_CHANNEL, STABLE, STABLE_HIDDEN_PAGES, hiddenInStable } from '../appChannel';

describe('appChannel 判定（vitest = dev 形态 → 迭代版）', () => {
  it('import.meta.env.DEV === true → iterate，STABLE 为 false', () => {
    expect(import.meta.env.DEV).toBe(true);
    expect(APP_CHANNEL).toBe('iterate');
    expect(STABLE).toBe(false);
  });

  it('收敛清单固定为大盘走势 / 量价预测 / 情报中心三页；迭代版下 hiddenInStable 恒 false', () => {
    expect([...STABLE_HIDDEN_PAGES]).toEqual(['marketboard', 'forecast', 'intelligence']);
    for (const page of STABLE_HIDDEN_PAGES) expect(hiddenInStable(page)).toBe(false);
    expect(hiddenInStable('dashboard')).toBe(false);
    expect(hiddenInStable('overview')).toBe(false);
  });
});
