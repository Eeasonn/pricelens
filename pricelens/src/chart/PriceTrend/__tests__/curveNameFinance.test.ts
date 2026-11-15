// ============================================================
// curveNameOf · 药丸分期标注（2026-11-11 Eason：南非看板线侧名称小药丸
// 在产品名后标注分期情况——36 期 / 24 期 / 48 期 / 先付）。
// financeTag 仅 ZA 运营商小册子系列携带（buildMonthlySeries 月度分支生成）；
// 普通周度电商系列无此字段 → 药丸名恒等（既有金标不变）。
// 2026-11-16 追加 seriesPillMetaOf（两行药丸单一拆行来源）分期回归：
// 盲按长度砍尾曾把「36期」切掉、配置重复进行1、行尾悬空「·」。
// ============================================================
import { describe, expect, it } from 'vitest';
import { curveNameOf, seriesPillMetaOf } from '../chartModel';
import { dimProduct } from '../../../data';
import type { Series } from '../../../dataModel/types';

const mk = (over: Partial<Series> = {}): Series => ({
  key: 'k', isOwn: true, brand: 'Huawei', label: 'Huawei Watch GT 6 规格未标明',
  skuIds: [], color: '#000', points: [], ...over,
});

/** 有「 GB」尾缀 romram 的真实主数据行（两行药丸的配置行取自清洗层 dim_product） */
const romRow = dimProduct.find((p) => {
  const r = (p.romram ?? '').trim();
  return r && r !== '—' && r !== '规格未标明' && /gb$/i.test(r);
})!;

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

describe('seriesPillMetaOf · 两行药丸拆行（2026-11-16 分期回归）', () => {
  const rom = (romRow.romram ?? '').trim();
  const romBase = rom.replace(/\s*GB$/i, '').trim();
  const row1Base = `${romRow.model_name} ${romBase}`;

  it('融资系列：分期标注留在行1、配置进行2（不再盲砍「36期」）', () => {
    const s = mk({
      brand: 'Huawei',
      label: `Huawei ${row1Base}`,
      skuIds: [romRow.sku_id],
      financeTag: '36期',
    });
    const meta = seriesPillMetaOf(s);
    expect(curveNameOf(s)).toBe(`${row1Base} · 36期`);
    expect(meta.name).toBe(`${romRow.model_name} · 36期`);
    expect(meta.cfg).toBe(romBase);
  });

  it('融资系列但名称不含配置（规则外形态）：保留全名不出行2，不做尾部砍切', () => {
    const s = mk({
      brand: 'Huawei',
      label: `Huawei ${romRow.model_name}`,
      skuIds: [romRow.sku_id],
      financeTag: '24期',
    });
    const meta = seriesPillMetaOf(s);
    expect(meta.name).toBe(`${romRow.model_name} · 24期`);
    expect(meta.cfg).toBe('');
  });

  it('普通周度系列（无 financeTag）：配置仍正常剥进行2', () => {
    const s = mk({
      brand: 'Huawei',
      label: `Huawei ${row1Base}`,
      skuIds: [romRow.sku_id],
    });
    const meta = seriesPillMetaOf(s);
    expect(meta.name).toBe(romRow.model_name);
    expect(meta.cfg).toBe(romBase);
  });
});
