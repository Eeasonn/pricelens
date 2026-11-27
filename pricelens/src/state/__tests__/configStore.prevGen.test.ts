// ============================================================
// 「匹配上一代」单测（2026-11-27 Eason 拍板：上一代关系要到 cat（配置）层级）：
// groupsFromPrevGeneration 只查数据包 prevGen 段（服务器端配置表 config_tables.xlsx
// 「上一代配置」页签解析进包），不再读本机 localStorage 覆盖表、不再回退
// dim_product.prev_model_id、不再按存储规则猜同配置。
// - 包内映射驱动：一对多、上一代配置 ≠ 当前配置、上一代为竞品，均按映射原样带出
// - 幂等：已在 own 里 / 多个当前组指向同一上一代 / 反复点击，都不重复带出
// - missing：包内查不到可用上一代配置的型号（型号名、型号级去重）
// - 空配置：包内配置组为 —、主数据 romram 为空串，两侧归一后命中，带出用主数据原值
// - 数据包没有 prevGen 段（内置静态包 / 老包）= 全部 missing
// 手法：applyDataPack 换入一套最小的 dims.product + prevGen 段（模块单例，例后重放
// 内置快照恢复）；lowestPriceColorSku 用桩（只验证「最低价色 → 无价回退首个产品行」
// 的取法衔接，取价本身由 aggregate 自己的单测覆盖）。
// ============================================================
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const priceStub = vi.hoisted(() => ({ lowest: {} as Record<string, string | null> }));

vi.mock('../../dataModel/aggregate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../dataModel/aggregate')>();
  return {
    ...actual,
    lowestPriceColorSku: (modelId: string, romram: string): string | null => priceStub.lowest[`${modelId}|${romram}`] ?? null,
  };
});

import { applyDataPack, buildDataPack, type PricelensDataPack } from '../../data';
import { groupsFromPrevGeneration } from '../configStore';
import type { DimProduct, PrevGenGroup } from '../../dataModel/types';
import type { ProductSelection } from '../filtersTypes';

/** node 环境无 localStorage：装内存桩（applyDataPack 的 v2 路径会读配置表键） */
beforeAll(() => {
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  };
});

// 内置态深快照（dims 是活引用，必须 JSON 断开再留底）
const ORIGINAL: PricelensDataPack = JSON.parse(JSON.stringify(buildDataPack()));

// ---------------- 最小产品主数据 ----------------

const product = (modelId: string, modelName: string, romram: string, color: string, isOwn = true): DimProduct =>
  ({
    sku_id: `${modelId}__${romram === '' ? 'default' : romram.toLowerCase().replace(/[^a-z0-9.]+/g, '-')}__${color.toLowerCase()}`,
    model_id: modelId,
    industry: 'phone',
    brand: isOwn ? 'HUAWEI' : 'XIAOMI',
    is_own: isOwn,
    series: '',
    model_name: modelName,
    romram,
    color,
    tier_code: '',
    tier_by_country: {},
    ref_price_usd: null,
    launch_date: '',
    eol_date: null,
    first_week: '',
    last_week: '',
    countries: [],
  }) as unknown as DimProduct;

/** 主数据里的无配置型号：romram 是空串（包内配置组记作 —） */
const band = (modelId: string, modelName: string, romram: string): DimProduct => ({
  ...product(modelId, modelName, romram, '—'),
  sku_id: `${modelId}__default__default`,
  industry: 'wearable',
});

const PRODUCTS: DimProduct[] = [
  // 首行故意带 prev_model_id（旧 auto 口径的数据形态）：若仍被读取，Pura 90s Pro 12+256 GB 会按
  // 「同配置」带出 Pura 80 Pro 12+256 GB——新口径只认包内映射，见「数据包没有 prevGen 段」用例
  { ...product('own-huawei-pura-90s-pro', 'Pura 90s Pro', '12+256 GB', 'Black'), prev_model_id: 'own-huawei-pura-80-pro' } as DimProduct,
  product('own-huawei-pura-90s-pro', 'Pura 90s Pro', '12+256 GB', 'White'),
  product('own-huawei-pura-90s-pro', 'Pura 90s Pro', '12+512 GB', 'Black'),
  product('own-huawei-pura-80-pro', 'Pura 80 Pro', '12+512 GB', 'Black'),
  product('own-huawei-pura-80-pro', 'Pura 80 Pro', '12+512 GB', 'Green'),
  product('own-huawei-pura-80-pro', 'Pura 80 Pro', '12+256 GB', 'Black'),
  product('cmp-xiaomi-15', 'Xiaomi 15', '12+256 GB', 'Green', false),
  product('own-huawei-nova-16s', 'nova 16s', '12+256 GB', 'Black'),
  product('own-huawei-nova-16s', 'nova 16s', '12+512 GB', 'Black'),
  band('own-huawei-band-11', 'Band 11', ''),
  band('own-huawei-band-10', 'Band 10', '—'),
  band('own-huawei-ghost', 'Ghost', '—'),
];

/** 包内 prevGen 段：与 server/prev_gen.py prev_gen_pack_groups 的产出同形 */
const PREV_GEN: PrevGenGroup[] = [
  // 一对多 + 上一代配置不同于当前配置 + 上一代含竞品
  { m: 'own-huawei-pura-90s-pro', r: '12+256 GB', p: [['own-huawei-pura-80-pro', '12+512 GB'], ['cmp-xiaomi-15', '12+256 GB']] },
  // 多对一：另一个当前配置组指向同一上一代组
  { m: 'own-huawei-pura-90s-pro', r: '12+512 GB', p: [['own-huawei-pura-80-pro', '12+512 GB']] },
  // 指向自己（配置相同）：服务端不会产出；消费端应按「已在选」处理而不是带出
  { m: 'own-huawei-pura-80-pro', r: '12+256 GB', p: [['own-huawei-pura-80-pro', '12+256 GB'], ['own-huawei-pura-80-pro', '12+512 GB']] },
  // 无配置维度：两个型号的配置组都是 —
  { m: 'own-huawei-band-11', r: '—', p: [['own-huawei-band-10', '—']] },
  // 映射指向主数据里不存在的型号 / 配置组（包与维表错位，防御）
  { m: 'own-huawei-ghost', r: '—', p: [['own-huawei-ghost-prev', '—']] },
];

const applyFixture = (prevGen?: PrevGenGroup[]): void => {
  const pack = JSON.parse(JSON.stringify(ORIGINAL)) as PricelensDataPack & { prevGen?: PrevGenGroup[] };
  pack.dims.product = PRODUCTS;
  if (prevGen) pack.prevGen = prevGen;
  else delete pack.prevGen;
  const applied = applyDataPack(pack);
  expect(applied.ok).toBe(true);
};

const sel = (modelId: string, romram: string, skuIds: string[] = []): ProductSelection => ({ modelId, romram, skuIds });

beforeEach(() => {
  priceStub.lowest = {};
});
afterEach(() => {
  priceStub.lowest = {};
  expect(applyDataPack(ORIGINAL).ok).toBe(true);
});
afterAll(() => {
  applyDataPack(ORIGINAL);
});

describe('groupsFromPrevGeneration · 包内映射驱动', () => {
  it('一对多：一个当前组带出多个上一代配置组（上一代配置可不同于当前配置，上一代可为竞品）', () => {
    applyFixture(PREV_GEN);
    priceStub.lowest['own-huawei-pura-80-pro|12+512 GB'] = 'own-huawei-pura-80-pro__12-512gb__green';
    const result = groupsFromPrevGeneration([sel('own-huawei-pura-90s-pro', '12+256 GB', ['x'])]);
    // 最低价色有价 → 取该色；无价（竞品 12+256 没有桩价）→ 回退该配置组首个产品行
    expect(result.added).toEqual([
      { modelId: 'own-huawei-pura-80-pro', romram: '12+512 GB', skuIds: ['own-huawei-pura-80-pro__12-512gb__green'] },
      { modelId: 'cmp-xiaomi-15', romram: '12+256 GB', skuIds: ['cmp-xiaomi-15__12-256-gb__green'] },
    ]);
    expect(result.missing).toEqual([]);
  });

  it('不再猜测：同型号 / 同存储不会自行带出，包内没有的映射一律不产生结果', () => {
    applyFixture(PREV_GEN);
    // 主数据里 Pura 90s Pro 与 Pura 80 Pro 都有 12+512 GB，但 nova 16s 在包内没有任何映射
    const result = groupsFromPrevGeneration([sel('own-huawei-nova-16s', '12+512 GB', ['x'])]);
    expect(result.added).toEqual([]);
    expect(result.missing).toEqual(['nova 16s']);
  });

  it('上一代型号在主数据里查不到对应配置组（包与维表错位）→ 视为没有可用的上一代配置', () => {
    applyFixture(PREV_GEN);
    const result = groupsFromPrevGeneration([sel('own-huawei-ghost', '—', ['x'])]);
    expect(result.added).toEqual([]);
    expect(result.missing).toEqual(['Ghost']);
  });
});

describe('groupsFromPrevGeneration · 幂等与去重', () => {
  it('多个当前组指向同一上一代组：只带出一次', () => {
    applyFixture(PREV_GEN);
    const result = groupsFromPrevGeneration([
      sel('own-huawei-pura-90s-pro', '12+256 GB', ['x']),
      sel('own-huawei-pura-90s-pro', '12+512 GB', ['x']),
    ]);
    expect(result.added.map((s) => `${s.modelId}|${s.romram}`)).toEqual([
      'own-huawei-pura-80-pro|12+512 GB',
      'cmp-xiaomi-15|12+256 GB',
    ]);
    expect(result.missing).toEqual([]);
  });

  it('已在 own 里的上一代组不重复带出；反复点击结果稳定、不重复', () => {
    // 夹具补全：Pura 80 Pro 12+512 自己也有映射（上一代可以是同型号的另一个配置）
    applyFixture([...PREV_GEN, { m: 'own-huawei-pura-80-pro', r: '12+512 GB', p: [['own-huawei-pura-80-pro', '12+256 GB']] }]);
    const own = [
      sel('own-huawei-pura-90s-pro', '12+256 GB', ['x']),
      sel('own-huawei-pura-80-pro', '12+512 GB', ['x']),
    ];
    // Pura 80 Pro 12+512 已选：Pura 90s Pro 这边只剩竞品 12+256 待带出
    const first = groupsFromPrevGeneration(own);
    expect(first.added.map((s) => `${s.modelId}|${s.romram}`)).toEqual([
      'cmp-xiaomi-15|12+256 GB',
      'own-huawei-pura-80-pro|12+256 GB',
    ]);
    expect(first.missing).toEqual([]);
    // 同一 own 再算一次：结果逐项相同（幂等，可反复点击）
    expect(groupsFromPrevGeneration(own)).toEqual(first);
    // own ∪ 上次带出 再进同一函数：上次带出的组不会被再带出一次
    const second = groupsFromPrevGeneration([...own, ...first.added]);
    const keysOf = (list: ProductSelection[]): string[] => list.map((s) => `${s.modelId}|${s.romram}`);
    expect(second.added.filter((s) => keysOf(first.added).includes(`${s.modelId}|${s.romram}`))).toEqual([]);
    expect(second.added).toEqual([]);
    // 带出来的竞品 12+256 在包内没有自己的上一代配置：作为已选组照常进 missing（如实报告）
    expect(second.missing).toEqual(['Xiaomi 15']);
  });

  it('映射指向自己（同型号同配置）= 已在 own 里，不重复带出；同组其余上一代照常带出', () => {
    applyFixture(PREV_GEN);
    const result = groupsFromPrevGeneration([sel('own-huawei-pura-80-pro', '12+256 GB', ['x'])]);
    expect(result.added.map((s) => `${s.modelId}|${s.romram}`)).toEqual(['own-huawei-pura-80-pro|12+512 GB']);
    expect(result.missing).toEqual([]);
  });

  it('已选判断按归一后的配置组比较（同一型号内空串与 — 不被当成两个组）', () => {
    applyFixture([{ m: 'own-huawei-band-11', r: '—', p: [['own-huawei-band-10', '—']] }]);
    // 选品里 Band 10 的 romram 写成空串，而 Band 10 在主数据里是 —：对 Band 11 而言仍是「已在选」。
    // （Band 10 自己在包内没有映射，照常进 missing——与其它已选组同一口径。）
    const result = groupsFromPrevGeneration([
      sel('own-huawei-band-11', '', ['x']),
      sel('own-huawei-band-10', '', ['x']),
    ]);
    expect(result.added).toEqual([]);
    expect(result.missing).toEqual(['Band 10']);
  });
});

describe('groupsFromPrevGeneration · missing', () => {
  it('包内没有该配置组的映射 → 型号名进 missing（型号级去重：同型号两个配置都缺只报一次）', () => {
    applyFixture(PREV_GEN);
    const result = groupsFromPrevGeneration([
      sel('own-huawei-nova-16s', '12+256 GB', ['x']),
      sel('own-huawei-nova-16s', '12+512 GB', ['x']),
      sel('own-huawei-pura-90s-pro', '12+256 GB', ['x']),
    ]);
    expect(result.missing).toEqual(['nova 16s']);
    expect(result.added).toHaveLength(2);
  });

  it('一个型号部分配置有映射：有映射的带出，缺映射的配置不拖累整型号', () => {
    // 包里只登记了 Pura 90s Pro 的 12+256；同型号的 12+512 没有映射
    applyFixture([PREV_GEN[0]!]);
    const result = groupsFromPrevGeneration([
      sel('own-huawei-pura-90s-pro', '12+256 GB', ['x']),
      sel('own-huawei-pura-90s-pro', '12+512 GB', ['x']),
    ]);
    expect(result.missing).toEqual(['Pura 90s Pro']);
    expect(result.added.map((s) => `${s.modelId}|${s.romram}`)).toEqual([
      'own-huawei-pura-80-pro|12+512 GB',
      'cmp-xiaomi-15|12+256 GB',
    ]);
  });
});

describe('groupsFromPrevGeneration · 无配置维度与空输入', () => {
  it('无配置型号：包内配置组 — 与主数据空串归一后命中；带出的 romram 用上一代在主数据里的原值', () => {
    applyFixture(PREV_GEN);
    const result = groupsFromPrevGeneration([sel('own-huawei-band-11', '', ['x'])]);
    expect(result.added).toEqual([
      { modelId: 'own-huawei-band-10', romram: '—', skuIds: ['own-huawei-band-10__default__default'] },
    ]);
    expect(result.missing).toEqual([]);
  });

  it('空输入：own 为空 → added / missing 都为空', () => {
    applyFixture(PREV_GEN);
    expect(groupsFromPrevGeneration([])).toEqual({ added: [], missing: [] });
  });
});

describe('groupsFromPrevGeneration · 数据包没有 prevGen 段', () => {
  it('内置静态包 / 老包（无该段）：全部进 missing；主数据行上的 prev_model_id 不再被读取', () => {
    applyFixture();
    // 夹具里 Pura 90s Pro 首行带 prev_model_id = Pura 80 Pro（且两者都有 12+256 GB）：
    // 旧口径会据此带出 Pura 80 Pro 12+256 GB，新口径不做任何推断
    const result = groupsFromPrevGeneration([
      sel('own-huawei-pura-90s-pro', '12+256 GB', ['x']),
      sel('own-huawei-band-11', '', ['x']),
    ]);
    expect(result).toEqual({ added: [], missing: ['Pura 90s Pro', 'Band 11'] });
  });
});
