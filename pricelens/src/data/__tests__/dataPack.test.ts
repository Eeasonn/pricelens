// ============================================================
// 数据包（2026-11-14「价格数据完全以导入方式承载」）：
// ① buildDataPack → applyDataPack round-trip：内置数据打包→应用→内容/元信息一致；
// ② 校验失败整体放弃（内置数据不受污染）：kind 错、缺维表、事实包坏 b64；
// ③ 改动生效：改一包维表货币后应用，currencyOfCountry 反映新值（后恢复原快照）；
// ④ 重导出保真：应用过的包再 buildDataPack，事实包 b64 = 该包原文；
// ⑤ dataPackStore：jsdom 无 IndexedDB → 读侧优雅回 null / 写侧 persisted:false。
// ⑥ 硬化（2026-11-16 审视修复）：活引用自换 tier 不清空；列结构错位/fx≤0
//    整体放弃；__proto__/constructor 键不落 dimTier。
// 注意：applyDataPack 改的是模块单例——ORIGINAL 是内置态的深快照，每例结束
// 重放快照恢复，防止用例间串味。
// ============================================================
import { beforeEach, describe, expect, it } from 'vitest';
import { gunzipSync, gzipSync, strFromU8, strToU8 } from 'fflate';
import { applyDataPack, buildDataPack, currencyOfCountry, dataMeta, dimBenchmark, dimProduct, dimTier, factPriceWeekly, factSalesWeekly, type PricelensDataPack } from '../index';
import { clearDataPack, loadDataPack, saveDataPack } from '../dataPackStore';
import { salesSourceOf, volumeOfConfig } from '../../dataModel/volume';
import { effectiveSeriesOf } from '../../state/deriveConfig';
import { LPL } from '../../state/lplKeys';
import { afterEach, beforeAll } from 'vitest';

/** node 环境无 localStorage：装内存桩（配置表五键用例走桩，例后清空防串味） */
const cfgMem = new Map<string, string>();
beforeAll(() => {
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => cfgMem.get(k) ?? null,
    setItem: (k: string, v: string) => void cfgMem.set(k, v),
    removeItem: (k: string) => void cfgMem.delete(k),
  };
});

// 内置态深快照（buildDataPack 的 dims 是活引用，必须 JSON 断开再留底）
const ORIGINAL: PricelensDataPack = JSON.parse(JSON.stringify(buildDataPack()));
const restore = (): void => {
  const applied = applyDataPack(ORIGINAL);
  expect(applied.ok).toBe(true);
};

beforeEach(() => {
  restore();
});

describe('buildDataPack / applyDataPack round-trip', () => {
  it('内置数据打包 → 应用：ok、元信息变 imported、事实行数与维表长度保持一致', () => {
    const pack = buildDataPack();
    expect(pack.kind).toBe('pricelens-data-pack');
    expect(pack.v).toBe(2);
    const before = dataMeta().counts;
    const applied = applyDataPack(pack);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.counts.factWeekly).toBe(before.factWeekly);
    expect(applied.counts.products).toBe(before.products);
    const meta = dataMeta();
    expect(meta.source).toBe('imported');
    expect(meta.appliedAt).toBeTruthy();
    expect(meta.generatedAt).toBe(pack.generatedAt);
    // 事实行仍在（同包重放内容一致）
    expect(factPriceWeekly.length).toBe(before.factWeekly);
  });

  it('活引用自换（buildDataPack 的 dims.tier === dimTier）不把 tier 清空（2026-11-16 tier 同引用守卫）', () => {
    const labelsBefore = Object.keys(dimTier.labels ?? {}).length;
    const laddersBefore = Object.keys(dimTier.ladders ?? {}).length;
    expect(labelsBefore).toBeGreaterThan(0);
    // 不经 JSON 断开，直接把 buildDataPack 产物（含活引用）喂回 applyDataPack
    const applied = applyDataPack(buildDataPack());
    expect(applied.ok).toBe(true);
    expect(Object.keys(dimTier.labels ?? {}).length).toBe(labelsBefore);
    expect(Object.keys(dimTier.ladders ?? {}).length).toBe(laddersBefore);
  });

  it('改一包维表（RU 货币）后应用：currencyOfCountry 反映新值；恢复快照后回落', () => {
    const pack = buildDataPack();
    const mutated = JSON.parse(JSON.stringify(pack)) as PricelensDataPack;
    const ru = mutated.dims.region.find((r) => r.country_code === 'RU');
    expect(ru).toBeDefined();
    ru!.currency = 'XYZ';
    expect(applyDataPack(mutated).ok).toBe(true);
    expect(currencyOfCountry('RU')).toBe('XYZ');
    expect(dataMeta().source).toBe('imported');
    restore();
    expect(currencyOfCountry('RU')).not.toBe('XYZ');
  });

  it('数据包重导出保真：应用某包后 buildDataPack 的事实包 b64 = 该包原文（导入数据不会被内置版顶掉）', () => {
    const pack = buildDataPack() as PricelensDataPack;
    expect(applyDataPack(pack).ok).toBe(true);
    expect((buildDataPack() as PricelensDataPack).factPackB64).toBe(pack.factPackB64);
  });
});

describe('applyDataPack 校验失败整体放弃（内置数据不受污染）', () => {
  /** 把内置包的事实包解开改列再压回去（构造「能解压但结构错位」的畸形包） */
  const mutateFactPack = (mutator: (raw: Record<string, unknown>) => void): PricelensDataPack => {
    const pack = JSON.parse(JSON.stringify(buildDataPack())) as PricelensDataPack;
    const bytes = Uint8Array.from(atob(pack.factPackB64), (ch) => ch.charCodeAt(0));
    const raw = JSON.parse(strFromU8(gunzipSync(bytes))) as Record<string, unknown>;
    mutator(raw);
    const reGzipped = gzipSync(strToU8(JSON.stringify(raw)));
    // 分块转二进制串（整包 ~2.8MB，一次性 spread 会爆栈）再 b64
    let bin = '';
    for (let i = 0; i < reGzipped.length; i += 0x8000) {
      bin += String.fromCharCode(...reGzipped.subarray(i, i + 0x8000));
    }
    pack.factPackB64 = btoa(bin);
    return pack;
  };

  it('kind 不匹配 → ok:false 且报类型错误', () => {
    const pack = { ...buildDataPack(), kind: 'other-pack' };
    const applied = applyDataPack(pack);
    expect(applied.ok).toBe(false);
    if (!applied.ok) expect(applied.error).toContain('pricelens-data-pack');
  });

  it('缺维表（region 丢失）→ ok:false 且报具体维表名', () => {
    const pack = buildDataPack();
    const broken = JSON.parse(JSON.stringify(pack)) as PricelensDataPack;
    delete (broken.dims as unknown as Record<string, unknown>).region;
    const applied = applyDataPack(broken);
    expect(applied.ok).toBe(false);
    if (!applied.ok) expect(applied.error).toContain('region');
  });

  it('事实包坏 b64 → ok:false（解码失败不提交半包，数据仍可用）', () => {
    const pack = buildDataPack();
    const broken = JSON.parse(JSON.stringify(pack)) as PricelensDataPack;
    broken.factPackB64 = 'not-a-valid-base64-gzip!!!';
    const applied = applyDataPack(broken);
    expect(applied.ok).toBe(false);
    expect(factPriceWeekly.length).toBeGreaterThan(0);
  });

  it('列长错位（price 列短一行）→ ok:false 报结构无效，数据不受污染（2026-11-16 校验硬化）', () => {
    const broken = mutateFactPack((raw) => {
      const cols = raw.cols as Record<string, unknown[]>;
      cols.p = (cols.p as unknown[]).slice(0, -1);
    });
    const applied = applyDataPack(broken);
    expect(applied.ok).toBe(false);
    if (!applied.ok) expect(applied.error).toContain('结构无效');
    expect(factPriceWeekly.length).toBeGreaterThan(0);
  });

  it('fx = 0（会产生 Infinity 价格）→ ok:false（2026-11-16 校验硬化）', () => {
    const broken = mutateFactPack((raw) => {
      const cols = raw.cols as Record<string, unknown[]>;
      (cols.fx as number[])[0] = 0;
    });
    const applied = applyDataPack(broken);
    expect(applied.ok).toBe(false);
    if (!applied.ok) expect(applied.error).toContain('汇率');
  });

  it('tier 带 __proto__ 键 → 不落 dimTier、原型不被改写（2026-11-16 原型污染防护）', () => {
    const pack = buildDataPack() as PricelensDataPack;
    // JSON.parse 会把 "__proto__" 生成自有属性（Object.assign 会命中 setter 改原型）
    const tier = JSON.parse('{"ladders":{"t1":{"lo":0,"hi":100}},"labels":{"t1":"入门"},"__proto__":{"polluted":true}}') as unknown as PricelensDataPack['dims']['tier'];
    const broken = { ...JSON.parse(JSON.stringify(pack)), dims: { ...JSON.parse(JSON.stringify(pack.dims)), tier } } as PricelensDataPack;
    const applied = applyDataPack(broken);
    expect(applied.ok).toBe(true);
    expect((dimTier as unknown as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.getPrototypeOf(dimTier)).toBe(Object.prototype);
    expect(Object.keys(dimTier.ladders).length).toBeGreaterThan(0);
  });
});

describe('数据包 v2 · PSI 销量（2026-11-17 接口预留）', () => {
  /** v1 旧包形态（无 sales 段） */
  const toV1 = (): Record<string, unknown> => {
    const pack = JSON.parse(JSON.stringify(buildDataPack())) as Record<string, unknown>;
    pack.v = 1;
    delete pack.sales;
    delete pack.salesProductAliases;
    return pack;
  };
  const watchSales = [
    { country: 'R国', product: 'Watch 6', category1: '42mm', periodId: '2026043', qty: 123 },
  ];

  it('内置态销量口径 = 估算（factSalesWeekly 空）', () => {
    expect(factSalesWeekly.length).toBe(0);
    expect(salesSourceOf()).toBe('estimated');
  });

  it('v2 包带 sales：归一解析（R国/Watch6/2026043 → RU/own/202643）进 factSalesWeekly，量价取数走真实', () => {
    const pack = buildDataPack() as PricelensDataPack & { sales: typeof watchSales };
    pack.sales = watchSales;
    const applied = applyDataPack(pack);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.counts.factSales).toBe(1);
    expect(dataMeta().salesUnmatched).toBe(0);
    expect(factSalesWeekly).toEqual([
      { week_id: '202643', country_code: 'RU', model_id: 'own-huawei-watch-6', cat1: '42mm', cat2: '', qty: 123 },
    ]);
    expect(salesSourceOf()).toBe('psi-weekly');
    // 真实优先：该型号该国存在销量行 → 整模型走 PSI（42mm 配置 = 表盘维度精确命中）
    const weekly = volumeOfConfig('own-huawei-watch-6', '42mm', 'RU');
    expect(weekly.get('202643')).toBe(123);
    expect(weekly.has('202619')).toBe(false); // 无销量周不产值（真实周独立于价格事实周）
    // restore 后回估算口径
    restore();
    expect(salesSourceOf()).toBe('estimated');
  });

  it('同键多行求和；解析失败行计入 salesUnmatched', () => {
    const pack = buildDataPack() as PricelensDataPack & { sales: unknown[] };
    pack.sales = [
      ...watchSales,
      { country: 'RU', product: 'watch6', category1: '42mm', periodId: '202643', qty: 7 },
      { country: 'RU', product: '不存在型号', periodId: '2026043', qty: 5 },
    ];
    const applied = applyDataPack(pack);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.counts.factSales).toBe(1);
    expect(factSalesWeekly[0].qty).toBe(130);
    expect(dataMeta().salesUnmatched).toBe(1);
    restore();
  });

  it('v1 旧包兼容：ok、sales 视为空（销量回落估算）', () => {
    const applied = applyDataPack(toV1());
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.counts.factSales).toBe(0);
    expect(salesSourceOf()).toBe('estimated');
    restore();
  });

  it('未知版本（v9）→ 拒绝', () => {
    const pack = { ...buildDataPack(), v: 9 } as unknown as PricelensDataPack;
    const applied = applyDataPack(pack);
    expect(applied.ok).toBe(false);
    if (!applied.ok) expect(applied.error).toContain('v1/v2/v3');
  });

  it('v3 原表模式：offers 为空 → 拒绝（内置数据不受污染）', () => {
    const pack = { kind: 'pricelens-data-pack', v: 3, generatedAt: '', offers: [] };
    const applied = applyDataPack(pack);
    expect(applied.ok).toBe(false);
    if (!applied.ok) expect(applied.error).toContain('offers');
  });
});

describe('dataPackStore（jsdom 无 IndexedDB：优雅降级）', () => {
  it('loadDataPack 环境不可用回 null（不抛错）', async () => {
    await expect(loadDataPack()).resolves.toBeNull();
  });

  it('saveDataPack 环境不可用返回 persisted:false（导入仍在本会话生效）', async () => {
    const pack = buildDataPack() as PricelensDataPack;
    await expect(saveDataPack(pack)).resolves.toEqual({ persisted: false });
  });

  it('clearDataPack 环境不可用 = 视为已清除（本就没有持久化包）', async () => {
    await expect(clearDataPack()).resolves.toEqual({ cleared: true });
  });
});


// ============================================================
// 数据包 v3 · 原表模式（2026-11-18 配置表化）：offers 原样行 → 应用内归一派生
// （拆列/穿戴升级/系列/分档/渠道/汇率），配置表五键参与派生。
// ============================================================
const RAW_OFFERS = [
  // 手机 ×2 存储（双语表头 + 真实换行形态）
  { '时间周期\nperiod': '2026-10-21', '品类\ncategory': '手机', '品牌\nbrand': 'HUAWEI', '型号\nmodel': 'Mate 80 Pro', '型号规格\nspec': '12+512 GB Black', '平台\nplatform': 'DNS', '国家/地区\ncountry': 'R国', '店铺类型\nstore': '官网', '店铺名称\nshop': 'DNS 数字', '显示店铺名称\nshop2': 'DNS 官网', '平台建议零售价-本币': 89999, '平台成交价-本币': 79999, '货币': 'RUB', '汇率': 80, '是否组合销售': 'N', '分期付款': '', '促销政策': '', '网址链接': 'https://dns.ru/a', '截图命名': 's1.png', '采集时间': '2026-10-21 10:00' },
  { '时间周期\nperiod': '2026-10-21', '品类\ncategory': '手机', '品牌\nbrand': 'HUAWEI', '型号\nmodel': 'Mate 80 Pro', '型号规格\nspec': '8+128 GB White', '平台\nplatform': 'DNS', '国家/地区\ncountry': 'R国', '店铺类型\nstore': '官网', '店铺名称\nshop': 'DNS 数字', '显示店铺名称\nshop2': 'DNS 官网', '平台建议零售价-本币': 69999, '平台成交价-本币': 64999, '货币': 'RUB', '汇率': 80, '是否组合销售': 'N', '分期付款': '', '促销政策': '', '网址链接': 'https://dns.ru/b', '截图命名': 's2.png', '采集时间': '2026-10-21 10:00' },
  // 平板：屏幕 + WiFi 塌缩进颜色（romram=屏幕+存储、color=WiFi）
  { '时间周期\nperiod': '2026-10-21', '品类\ncategory': '平板', '品牌\nbrand': 'HUAWEI', '型号\nmodel': 'MatePad Pro 12.2', '型号规格\nspec': '12.2"/WIFI/8+256 GB Black', '平台\nplatform': 'DNS', '国家/地区\ncountry': 'R国', '店铺类型\nstore': '官网', '店铺名称\nshop': 'DNS 数字', '显示店铺名称\nshop2': 'DNS 官网', '平台建议零售价-本币': 49999, '平台成交价-本币': 44999, '货币': 'RUB', '汇率': 80, '是否组合销售': 'N', '分期付款': '', '促销政策': '', '网址链接': 'https://dns.ru/c', '截图命名': 's3.png', '采集时间': '2026-10-21 10:00' },
  // 穿戴双尺寸 → 表盘升配置维（Watch GT 6 46mm/42mm）
  { '时间周期\nperiod': '2026-10-21', '品类\ncategory': '穿戴', '品牌\nbrand': 'HUAWEI', '型号\nmodel': 'Watch GT 6', '型号规格\nspec': '46mm GPS Black', '平台\nplatform': 'DNS', '国家/地区\ncountry': 'R国', '店铺类型\nstore': '官网', '店铺名称\nshop': 'DNS 数字', '显示店铺名称\nshop2': 'DNS 官网', '平台建议零售价-本币': 24999, '平台成交价-本币': 21999, '货币': 'RUB', '汇率': 80, '是否组合销售': 'N', '分期付款': '', '促销政策': '', '网址链接': 'https://dns.ru/d', '截图命名': 's4.png', '采集时间': '2026-10-21 10:00' },
  { '时间周期\nperiod': '2026-10-21', '品类\ncategory': '穿戴', '品牌\nbrand': 'HUAWEI', '型号\nmodel': 'Watch GT 6', '型号规格\nspec': '42mm GPS Black', '平台\nplatform': 'DNS', '国家/地区\ncountry': 'R国', '店铺类型\nstore': '官网', '店铺名称\nshop': 'DNS 数字', '显示店铺名称\nshop2': 'DNS 官网', '平台建议零售价-本币': 21999, '平台成交价-本币': 19999, '货币': 'RUB', '汇率': 80, '是否组合销售': 'N', '分期付款': '', '促销政策': '', '网址链接': 'https://dns.ru/e', '截图命名': 's5.png', '采集时间': '2026-10-21 10:00' },
  // 穿戴唯一尺寸 → 不作维度（GT 6 Pro 口径，romram 保持 '—'）
  { '时间周期\nperiod': '2026-10-21', '品类\ncategory': '穿戴', '品牌\nbrand': 'HUAWEI', '型号\nmodel': 'Watch GT 6 Pro', '型号规格\nspec': '46mm Black', '平台\nplatform': 'DNS', '国家/地区\ncountry': 'R国', '店铺类型\nstore': '官网', '店铺名称\nshop': 'DNS 数字', '显示店铺名称\nshop2': 'DNS 官网', '平台建议零售价-本币': 29999, '平台成交价-本币': 26999, '货币': 'RUB', '汇率': 80, '是否组合销售': 'N', '分期付款': '', '促销政策': '', '网址链接': 'https://dns.ru/f', '截图命名': 's6.png', '采集时间': '2026-10-21 10:00' },
  // 竞品：小米数字系列（model_name 剥品牌词后 = '15'，内置规则归「Xiaomi 数字系列」）
  { '时间周期\nperiod': '2026-10-21', '品类\ncategory': '手机', '品牌\nbrand': 'XIAOMI', '型号\nmodel': 'Xiaomi 15', '型号规格\nspec': '12+256 GB Green', '平台\nplatform': 'OZON', '国家/地区\ncountry': 'R国', '店铺类型\nstore': '平台第三方卖家', '店铺名称\nshop': 'XYZ Store', '显示店铺名称\nshop2': 'OZON 3P', '平台建议零售价-本币': 59999, '平台成交价-本币': 54999, '货币': 'RUB', '汇率': 80, '是否组合销售': 'N', '分期付款': '', '促销政策': '', '网址链接': 'https://ozon.ru/x', '截图命名': 's7.png', '采集时间': '2026-10-21 11:00' },
  // 与首行同键（周×SKU×国×渠道×店铺）不同价格 → 去重保留最低价（同刻）
  { '时间周期\nperiod': '2026-10-21', '品类\ncategory': '手机', '品牌\nbrand': 'HUAWEI', '型号\nmodel': 'Mate 80 Pro', '型号规格\nspec': '12+512 GB Black', '平台\nplatform': 'DNS', '国家/地区\ncountry': 'R国', '店铺类型\nstore': '官网', '店铺名称\nshop': 'DNS 数字', '显示店铺名称\nshop2': 'DNS 官网', '平台建议零售价-本币': 89999, '平台成交价-本币': 88999, '货币': 'RUB', '汇率': 80, '是否组合销售': 'N', '分期付款': '', '促销政策': '', '网址链接': 'https://dns.ru/z', '截图命名': 's8.png', '采集时间': '2026-10-21 10:00' },
];

/** 配置表桩清空（系列规则编译缓存的失效键 = localStorage 原文，清空即回内置） */
const clearCfg = (): void => cfgMem.clear();

const applyRaw = (overrides?: Record<string, unknown>): ReturnType<typeof applyDataPack> =>
  applyDataPack({ kind: 'pricelens-data-pack', v: 3, generatedAt: '2026-11-18T00:00:00Z', offers: RAW_OFFERS, ...overrides });

describe('数据包 v3 · 原表模式（应用内归一派生）', () => {
  afterEach(() => clearCfg());
  it('offers 原样行 → 维表/事实全量派生：拆列、穿戴升维、系列、渠道、去重', () => {
    const before = dataMeta().counts;
    const applied = applyRaw();
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    // 8 行 → 7 事实行（同键同刻保留最低价）
    expect(dataMeta().packVersion).toBe(3);
    expect(dataMeta().offersRows).toBe(RAW_OFFERS.length);
    expect(dataMeta().offersDiag?.rowsOut).toBe(7);
    expect(applied.counts.factWeekly).toBe(7);
    expect(applied.counts.products).toBe(7);
    expect(applied.counts.factWeekly).not.toBe(before.factWeekly);

    const bySku = new Map(dimProduct.map((p) => [p.sku_id, p]));
    // 手机拆列：romram 规范形 + cat1
    const phone = bySku.get('own-huawei-mate-80-pro__12-512gb__black');
    expect(phone).toBeDefined();
    expect(phone!.romram).toBe('12+512 GB');
    expect(phone!.cat1).toBe('12+512 GB');
    expect(phone!.series).toBe('Mate');
    expect(phone!.tier_code).toBeTruthy();
    // model 级参考价 = 两存储档 rrp 中位数 (1124.99+874.99)/2 = 999.99 → 1000.0
    expect(phone!.ref_price_usd).toBeCloseTo(1000, 0);
    // 平板：屏幕 + 存储双键、WiFi 塌缩进颜色
    const tablet = [...bySku.values()].find((p) => p.industry === 'tablet');
    expect(tablet!.romram).toBe('12.2" 8+256 GB');
    expect(tablet!.color).toBe('WiFi');
    expect(tablet!.cat2).toBe('12.2"');
    expect(tablet!.cat1).toBe('8+256 GB');
    // 穿戴双尺寸升配置维；唯一尺寸剥词不作维度
    const gt646 = bySku.get('own-huawei-watch-gt-6__46mmgps__black');
    const gt642 = bySku.get('own-huawei-watch-gt-6__42mmgps__black');
    const gt6pro = bySku.get('own-huawei-watch-gt-6-pro__46mm__black');
    expect(gt646!.romram).toBe('46mm');
    expect(gt642!.romram).toBe('42mm');
    expect(gt646!.cat1).toBe('46mm');
    expect(gt6pro!.romram).toBe('—');
    expect(gt6pro!.color).toBe('Black');
    expect(gt6pro!.cat1).toBeNull();
    // 竞品系列（内置规则 port）：小米数字线
    const xiaomi = [...bySku.values()].find((p) => p.brand === 'XIAOMI');
    expect(xiaomi!.series).toBe('Xiaomi 数字系列');
    expect(xiaomi!.is_own).toBe(false);
    // 渠道：官网→独立站、平台第三方卖家→3P，channel_id 形态
    expect(dimBenchmark).toBeDefined();
    const channels = new Set(factPriceWeekly.map((r) => r.channel_id));
    expect(channels.has('RU:dns:独立站')).toBe(true);
    expect(channels.has('RU:ozon:3P')).toBe(true);
    // 去重保留最低价（首行 79999 vs 末行 88999 同刻）
    const mateFacts = factPriceWeekly.filter((r) => r.sku_id === 'own-huawei-mate-80-pro__12-512gb__black');
    expect(mateFacts).toHaveLength(1);
    expect(mateFacts[0].price_local).toBe(79999);
    // 无 sales 段 → 销量空（估算口径）
    expect(factSalesWeekly).toHaveLength(0);
    expect(salesSourceOf()).toBe('estimated');
  });

  it('sales 段随 v3 归一（PSI 行 → 事实）+ 原表派生的维表可被销量解析消费', () => {
    const applied = applyRaw({ sales: [{ country: 'R国', product: 'Mate 80 Pro', category1: '12+512 GB', category2: null, periodId: '2026043', qty: 2577 }] });
    expect(applied.ok).toBe(true);
    expect(factSalesWeekly).toHaveLength(1);
    expect(factSalesWeekly[0].model_id).toBe('own-huawei-mate-80-pro');
    expect(factSalesWeekly[0].week_id).toBe('202643');
    expect(dataMeta().salesUnmatched).toBe(0);
  });

  it('配置表参与派生：对标矩阵页签有行 = 矩阵层替换；阶梯页签覆盖分档', () => {
    try {
      localStorage.setItem(LPL.cfgBenchmarkMatrix, JSON.stringify([
        { country_code: 'RU', own_model_id: 'own-huawei-mate-80-pro', own_romram: '12+512 GB', competitor_sku_id: 'cmp-xiaomi-15__12-256gb__green', sort: 0 },
      ]));
      localStorage.setItem(LPL.cfgTierLadders, JSON.stringify({ phone: [100] }));
      const applied = applyRaw();
      expect(applied.ok).toBe(true);
      expect(dimBenchmark).toHaveLength(1);
      expect(dimBenchmark[0].competitor_sku_id).toBe('cmp-xiaomi-15__12-256gb__green');
      const phone = dimProduct.find((p) => p.sku_id === 'own-huawei-mate-80-pro__12-512gb__black');
      expect(phone!.tier_code).toBe('100+');
    } finally {
      localStorage.removeItem(LPL.cfgBenchmarkMatrix);
      localStorage.removeItem(LPL.cfgTierLadders);
    }
  });

  it('系列规则读时生效：改配置立即反映在 effectiveSeriesOf（无需重导）', () => {
    const applied = applyRaw();
    expect(applied.ok).toBe(true);
    const p = dimProduct.find((x) => x.sku_id === 'own-huawei-mate-80-pro__12-512gb__black')!;
    expect(effectiveSeriesOf(p)).toBe('Mate');
    try {
      localStorage.setItem(LPL.cfgSeriesRules, JSON.stringify([{ brand: 'HUAWEI', pattern: 'Mate 80', series: 'Mate80 专属系列' }]));
      expect(effectiveSeriesOf(p)).toBe('Mate80 专属系列');
    } finally {
      localStorage.removeItem(LPL.cfgSeriesRules);
    }
    expect(effectiveSeriesOf(p)).toBe('Mate');
  });

  it('v3 重导出保真：buildDataPack 导出 v3 且 offers 原样带出', () => {
    const applied = applyRaw({ sales: [{ country: 'R国', product: 'Mate 80 Pro', periodId: '2026043', qty: 1 }] });
    expect(applied.ok).toBe(true);
    const pack = buildDataPack();
    expect(pack.kind).toBe('pricelens-data-pack');
    expect((pack as { v: number }).v).toBe(3);
    expect((pack as { offers: unknown[] }).offers).toHaveLength(RAW_OFFERS.length);
    // 再应用自己（重导出 → 导入闭环）仍成功且计数一致
    const again = applyDataPack(pack);
    expect(again.ok).toBe(true);
    expect(dataMeta().packVersion).toBe(3);
  });
});
