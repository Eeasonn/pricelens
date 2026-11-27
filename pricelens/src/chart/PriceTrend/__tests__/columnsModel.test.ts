// ============================================================
// 分列视图分组纯模型金测（2026-11-27 二轮「视图：对标 / 分列」）：
// 在册选择序列（卡序 主品→对比、selKey 首次出现为准）、brand / series / tier 三种
// 分组的组序与标签、无现价归末组、空 mains → []。真实数据驱动（RU phone）。
// ============================================================
import { describe, expect, it } from 'vitest';
import { dimProduct } from '../../../data';
import { tierBandsOf } from '../../../dataModel/aggregate';
import { currentPricesByGroup } from '../../../dataModel/tierPrice';
import { brandOfModel } from '../../../components/ProductCascader/tree';
import { brandLabelOf } from '../../../components/BrandMark';
import { effectiveSeriesOf } from '../../../state/deriveConfig';
import type { MainProduct, ProductSelection } from '../../../state/filtersTypes';
import { selKey } from '../../../state/mainSelection';
import { columnsOf, selectionsOfMains } from '../columnsModel';

type Row = (typeof dimProduct)[number];
const rowsOf = (brand: string, cc = 'RU'): Row[] =>
  dimProduct.filter((p) => p.brand === brand && p.industry === 'phone' && p.countries.includes(cc));
const selOf = (row: Row): ProductSelection => ({ modelId: row.model_id, romram: row.romram, skuIds: [row.sku_id] });
const norm = (s: string): string => s.replace(/\s+/g, '');

const ownRow = rowsOf('HUAWEI')[0];
const samsungRows = rowsOf('SAMSUNG');
const appleRow = rowsOf('APPLE')[0];
const ownSel = selOf(ownRow);
const samSel = selOf(samsungRows[0]);
const sam2Row = samsungRows.find((r) => r.model_id !== samsungRows[0].model_id) ?? samsungRows[0];
const sam2Sel = selOf(sam2Row);
const appleSel = selOf(appleRow);

const card = (main: ProductSelection | null, compares: ProductSelection[] = []): MainProduct => ({
  id: `c-${Math.random().toString(36).slice(2, 8)}`,
  main,
  compares,
});

// 品牌序 = 产品树序（我司置顶）；ctx 品牌序用手工序模拟树序（HUAWEI 在前）
const BRAND_ORDER = ['HUAWEI', 'SAMSUNG', 'APPLE', 'HONOR', 'XIAOMI'];
const CTX = { industry: 'phone' as const, countryCode: 'RU', brandOrder: BRAND_ORDER };

describe('selectionsOfMains（在册选择序列）', () => {
  it('卡序保序、卡内主品在前对比随后、selKey 首次出现为准去重', () => {
    const dup = { ...appleSel };
    const mains = [card(ownSel, [samSel]), card(appleSel, [dup, ownSel])];
    const keys = selectionsOfMains(mains).map(selKey);
    expect(keys).toEqual([ownSel, samSel, appleSel].map(selKey)); // apple 第二张卡主品先于其对比 dup；ownSel 重复不再现
  });

  it('main 为 null 的空对只取对比；空 mains → []', () => {
    expect(selectionsOfMains([card(null, [samSel])]).map(selKey)).toEqual([selKey(samSel)]);
    expect(selectionsOfMains([])).toEqual([]);
    expect(columnsOf([], 'brand', CTX)).toEqual([]);
  });
});

describe('columnsOf · brand（按品牌分组）', () => {
  it('组序 = brandOrder（我司在前），label = 品牌显示名，组内保持输入顺序', () => {
    const groups = columnsOf([card(ownSel, [samSel]), card(appleSel, [sam2Sel])], 'brand', CTX);
    expect(groups.map((g) => g.brand)).toEqual(['HUAWEI', 'SAMSUNG', 'APPLE']);
    expect(groups[0].label).toBe(brandLabelOf('HUAWEI'));
    const sam = groups.find((g) => g.brand === 'SAMSUNG')!;
    expect(sam.sels.map(selKey)).toEqual([samSel, sam2Sel].map(selKey)); // 输入序：samSel 先出现于第一张卡
  });

  it('brandOrder 未登记的品牌殿后（字母序），不丢组', () => {
    const groups = columnsOf([card(ownSel, [samSel])], 'brand', { ...CTX, brandOrder: ['HUAWEI'] });
    expect(groups.map((g) => g.brand)).toEqual(['HUAWEI', 'SAMSUNG']);
  });
});

describe('columnsOf · series（按系列分组）', () => {
  it('组键 = 品牌|系列（effectiveSeriesOf 同口径），label = 品牌 系列，组序 = 品牌序×系列序', () => {
    const groups = columnsOf([card(ownSel, [samSel]), card(sam2Sel, [])], 'series', CTX);
    for (const g of groups) {
      const [brand, series] = g.key.replace('series|', '').split('|');
      expect(g.label).toBe(`${brandLabelOf(brand)} ${series}`);
      // 系列解析与产品树同一链路（effectiveSeriesOf）
      const row = dimProduct.find((p) => p.model_id === g.sels[0].modelId)!;
      expect(series).toBe(effectiveSeriesOf(row));
    }
    // 同品牌两个系列 = 两个组；华为组排最前
    expect(groups[0].key.startsWith('series|HUAWEI|')).toBe(true);
    const samGroups = groups.filter((g) => g.key.startsWith('series|SAMSUNG|'));
    expect(samGroups.length).toBeGreaterThanOrEqual(1);
  });
});

describe('columnsOf · tier（按现价落档分组）', () => {
  it('组 = 批量裁定的现价落档，组序 = 高档在前；label = 短标', () => {
    const groups = columnsOf([card(ownSel, [samSel]), card(appleSel, [sam2Sel])], 'tier', CTX);
    expect(groups.length).toBeGreaterThan(0);
    const bands = tierBandsOf('phone').map((b) => b.code);
    const rankOf = (code: string): number => bands.indexOf(code);
    const keys = groups.filter((g) => g.key !== 'tier|none').map((g) => g.key.replace('tier|', ''));
    // 组序 = 档位从高到低（ladder index 降序）
    for (let i = 1; i < keys.length; i++) {
      expect(rankOf(keys[i - 1])).toBeGreaterThan(rankOf(keys[i]));
    }
    // 每条选择的落档与批量裁定一致
    const byGroup = currentPricesByGroup('phone', 'RU');
    for (const g of groups) {
      for (const sel of g.sels) {
        const entry = byGroup.get(`${sel.modelId}|${norm(sel.romram)}`);
        const expectKey = entry?.tier ? `tier|${entry.tier}` : 'tier|none';
        expect(g.key).toBe(expectKey);
      }
    }
  });

  it('无现价选择归末组「暂无现价」；全部有现价时没有该组', () => {
    // 构造：合法选择 + 一条同型号但该国无价的配置（取一个 RU 不在售国家的型号配置）
    const ghostRow = dimProduct.find((p) => p.industry === 'phone' && !p.countries.includes('RU'));
    if (!ghostRow) return; // 数据全部覆盖 RU 时跳过（数据事实分支）
    const ghost: ProductSelection = { modelId: ghostRow.model_id, romram: ghostRow.romram, skuIds: [ghostRow.sku_id] };
    const groups = columnsOf([card(ownSel, [ghost])], 'tier', CTX);
    const last = groups[groups.length - 1];
    const ghostGroup = groups.find((g) => g.sels.some((s) => selKey(s) === selKey(ghost)));
    expect(ghostGroup?.key).toBe('tier|none');
    expect(ghostGroup?.label).toBe('暂无现价');
    expect(last.key).toBe('tier|none');
  });

  it('无条数上限语义不改：同档多选择同组保序；跨组按档位高 → 低', () => {
    const groups = columnsOf([card(ownSel, [samSel, sam2Sel, appleSel])], 'tier', CTX);
    // 组内保持输入顺序（2026-11-28 键归一修复后：选择按真实档位分进不同组，
    // 扁平序 = 组序 × 组内输入序，不再恒等于全局输入序——这是修复的目标行为）
    for (const g of groups) {
      const inputOrder = [ownSel, samSel, sam2Sel, appleSel].map(selKey);
      const idxs = g.sels.map((s) => inputOrder.indexOf(selKey(s)));
      expect([...idxs].sort((a, b) => a - b)).toEqual(idxs);
    }
    // 组序 = 档位从高到低（真实命中：apple 800-1000 > own 600-800 > samsung <200）
    expect(groups.map((g) => g.key)).toEqual(['tier|800-1000', 'tier|600-800', 'tier|<200']);
    // 同档多选择（两部三星同档）同组且保序
    const low = groups.find((g) => g.key === 'tier|<200')!;
    expect(low.sels.map(selKey)).toEqual([samSel, sam2Sel].map(selKey));
  });
});

// ---------------- 键归一回归（2026-11-28）：currentPricesByGroup 的 Map 键与查询侧
// 共用 groupKeyOf（romram 空白剥离）——带空格 romram（`8+256 GB` / `128 GB`）不再
// 全 miss 落「暂无现价」。用真实 dimProduct 中带空格 romram 的型号钉住。 ----------------
import { groupKeyOf } from '../../../dataModel/tierPrice';
import { lineageCardsOf, lineageChainsOf } from '../lineageModel';

describe('档位分组键归一回归（带空格 romram 不落「暂无现价」）', () => {
  const spaced = dimProduct.find((p) => p.industry === 'phone' && p.countries.includes('RU') && p.romram.includes(' ') && /\d+\+\d+ GB/.test(p.romram))!;
  const sel = { modelId: spaced.model_id, romram: spaced.romram, skuIds: [spaced.sku_id] };

  it('groupKeyOf 与批量 Map 键同归一：带空格 romram 命中、有档位', () => {
    const byGroup = currentPricesByGroup('phone', 'RU');
    const key = groupKeyOf(spaced.model_id, spaced.romram);
    expect(key).not.toContain(' '); // 空白剥离
    expect(byGroup.has(key)).toBe(true);
    expect(byGroup.get(key)!.tier).not.toBeNull();
  });

  it('分列·档位：带空格 romram 落在真实档位组而非「暂无现价」', () => {
    const groups = columnsOf(
      [{ id: 'c', main: null, compares: [sel] }],
      'tier',
      { industry: 'phone', countryCode: 'RU', brandOrder: ['HUAWEI'] },
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].key).not.toBe('tier|none');
    expect(groups[0].label).not.toBe('暂无现价');
  });

  it('代际·档位：链尖带空格 romram 同样落真实档位组', () => {
    const chains = lineageChainsOf([sel], () => []);
    const cards = lineageCardsOf(chains, 'tier', { industry: 'phone', countryCode: 'RU', brandOrder: ['HUAWEI'] });
    expect(cards).toHaveLength(1);
    expect(cards[0].key).not.toBe('tier|none');
  });
});
