// ============================================================
// 窄屏默认可见段（第一百九十轮，外部 UX 审计落地）：<640px 视口 + 周粒度 +
// 未手动设过窗口时，主图默认可见段取范围末端 NARROW_DEFAULT_BUCKETS 个桶——
// tailWindowIds 纯函数的边界行为（段长超出范围取全量、空序回落 null）。
// ============================================================
import { describe, expect, it } from 'vitest';
import { NARROW_DEFAULT_BUCKETS, tailWindowIds } from '../helpers';

describe('tailWindowIds', () => {
  it('取范围末端 N 个桶的首尾 id', () => {
    const ids = ['202601', '202602', '202603', '202604', '202605', '202606'];
    expect(tailWindowIds(ids, 3)).toEqual(['202604', '202606']);
    expect(tailWindowIds(ids, 1)).toEqual(['202606', '202606']);
  });

  it('段长超过范围时起点钳到首桶（= 全量）', () => {
    expect(tailWindowIds(['202601', '202602'], 12)).toEqual(['202601', '202602']);
    expect(tailWindowIds(['202601', '202602'], NARROW_DEFAULT_BUCKETS)).toEqual(['202601', '202602']);
  });

  it('空序 / 非法段长 → null（调用方回落整个范围现状行为）', () => {
    expect(tailWindowIds([], 12)).toBeNull();
    expect(tailWindowIds(['202601'], 0)).toBeNull();
    expect(tailWindowIds(['202601'], -3)).toBeNull();
  });
});
