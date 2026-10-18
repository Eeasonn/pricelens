import { describe, expect, it } from 'vitest';
import { resolveCompExpansion, withAllCompExpansion } from '../overviewViewState';

describe('总览竞品折叠状态', () => {
  it('全景默认收起、单产品默认展开、手动覆盖优先', () => {
    const multi = resolveCompExpansion(['a', 'b'], {});
    expect(multi.isExpanded('a')).toBe(false);
    expect(resolveCompExpansion(['a'], {}).isExpanded('a')).toBe(true);
    expect(resolveCompExpansion(['a'], { a: false }).isExpanded('a')).toBe(false);
  });

  it('混合状态计数正确，批量操作只影响可见产品', () => {
    const overrides = { b: false };
    const next = withAllCompExpansion(['a'], true, overrides);
    expect(next).toEqual({ a: true, b: false });
    expect(overrides).toEqual({ b: false });
    const status = resolveCompExpansion(['a', 'b'], next);
    expect(status.expandedCount).toBe(1);
    expect(status.allExpanded).toBe(false);
    expect(status.allCollapsed).toBe(false);
  });

  it('无可见产品时不构成全展开或全收起', () => {
    const status = resolveCompExpansion([], {});
    expect(status.expandedCount).toBe(0);
    expect(status.allExpanded).toBe(false);
    expect(status.allCollapsed).toBe(false);
  });
});
