// ============================================================
// curveNameOf · 药丸分期标注（2026-11-11 Eason：南非看板线侧名称小药丸
// 在产品名后标注分期情况——36 期 / 24 期 / 48 期 / 先付）。
// financeTag 仅 ZA 运营商小册子系列携带（buildMonthlySeries 月度分支生成）；
// 普通周度电商系列无此字段 → 药丸名恒等（既有金标不变）。
// ============================================================
import { describe, expect, it } from 'vitest';
import { curveNameOf } from '../chartModel';
import type { Series } from '../../../dataModel/types';

const mk = (over: Partial<Series> = {}): Series => ({
  key: 'k', isOwn: true, brand: 'Huawei', label: 'Huawei Watch GT 6 规格未标明',
  skuIds: [], color: '#000', points: [], ...over,
});

describe('curveNameOf · 药丸分期标注（2026-11-11）', () => {
  it('financeTag 存在时药丸名追加「· N期 / · 先付」', () => {
    expect(curveNameOf(mk({ financeTag: '36期' }))).toBe('Watch GT 6 规格未标明 · 36期');
    expect(curveNameOf(mk({ financeTag: '24期' }))).toBe('Watch GT 6 规格未标明 · 24期');
    expect(curveNameOf(mk({ financeTag: '先付' }))).toBe('Watch GT 6 规格未标明 · 先付');
  });

  it('无 financeTag（普通电商系列）药丸名不变', () => {
    expect(curveNameOf(mk())).toBe('Watch GT 6 规格未标明');
    expect(curveNameOf(mk({ label: 'Acme Ultra 256GB', brand: 'Acme' }))).toBe('Ultra 256');
  });
});
