// ============================================================
// 配置快照导入/导出单测（2026-11-06 稳定版）：
// - export shape：schemaVersion / exportedAt / appChannel / keys 六键齐
// - validate：坏 JSON、schema 不符、缺配置项、类型错、未知键一律拒绝（友好错误）
// - apply round-trip：导出 → 清配置 → 导入 → 恢复；派发 CONFIG_CHANGED_EVENT；
//   defaultShop 读缓存随广播失效
// - null 键 = 恢复系统默认（键被移除）
// - viewer 角色导入被拒（纵深防御）
// ============================================================
// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_CHANNEL } from '../../appChannel';
import { setRole } from '../../access/role';
import { addAnomalyMark, listAnomalyMarks, readAnomalyRule, saveAnomalyRule } from '../../dataModel/anomaly';
import { getEffectiveBenchmark, getPrevGenOverrides, saveBenchmark, savePrevGenOverrides } from '../configStore';
import { defaultShopOverrideOf, saveDefaultShopOverrides } from '../defaultShopStore';
import { LPL } from '../lplKeys';
import {
  applyImportPayload,
  exportConfigSnapshot,
  parseConfigSnapshotText,
  summarizeImportPayload,
  validateImportPayload,
  type ConfigSnapshotV1,
} from '../configImportExport';

// 本仓库 vitest jsdom 不带 localStorage：装内存桩（同 DataQualityBlock.test 手法）
beforeAll(() => {
  const w = window as unknown as { localStorage?: Storage };
  if (w.localStorage) return;
  const mem = new Map<string, string>();
  const shim: Storage = {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => void mem.set(k, String(v)),
    removeItem: (k) => void mem.delete(k),
    clear: () => void mem.clear(),
    key: (i) => [...mem.keys()][i] ?? null,
    get length() {
      return mem.size;
    },
  };
  Object.defineProperty(w, 'localStorage', { configurable: true, value: shim });
});

beforeEach(() => {
  window.localStorage.clear();
  setRole('gtm');
});

afterEach(() => {
  window.localStorage.clear();
  setRole('gtm');
});

afterAll(() => {
  window.localStorage.clear();
});

const benchRow = {
  country_code: 'RU',
  own_model_id: 'own-huawei-pura-90s-pro',
  own_romram: '12+256 GB',
  competitor_sku_id: 'cmp-apple-iphone-17__8-256gb__black',
  sort: 1,
  source: 'manual' as const,
};

function seedConfig(): void {
  saveBenchmark([benchRow]);
  savePrevGenOverrides({ 'own-huawei-pura-90s-pro': 'own-huawei-pura-80-ultra' });
  saveDefaultShopOverrides({ RU: 'ozon-flagship' });
  saveAnomalyRule({ enabled: true, thresholdPct: 30 });
  addAnomalyMark({
    countryCode: 'RU', seriesKey: 'own-x__12+256', bucketId: '202639', action: 'isolate',
    label: 'Pura 90s Pro', price: 100, wow: -0.6, ts: 1730000000000,
  });
}

function clearAllConfig(): void {
  for (const key of [LPL.cfgBenchmark, LPL.cfgPrevGen, LPL.cfgDefaultShop, LPL.cfgAnomalyRule, LPL.cfgAnomalyMarks, LPL.cfgMarketRules, LPL.cfgFx]) {
    window.localStorage.removeItem(key);
  }
}

describe('exportConfigSnapshot · shape', () => {
  it('schemaVersion=1、exportedAt ISO、appChannel 对齐通道判定、keys 配置齐全', () => {
    seedConfig();
    const snap = exportConfigSnapshot();
    expect(snap.schemaVersion).toBe(1);
    expect(snap.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(snap.appChannel).toBe(APP_CHANNEL);
    expect(Object.keys(snap.keys).sort()).toEqual(
      ['anomalyMarks', 'anomalyRule', 'benchmark', 'defaultShop', 'fx', 'marketRules', 'prevGen'],
    );
    // 导出 = 原始持久化值（种子即落盘内容）
    expect(snap.keys.benchmark).toEqual([benchRow]);
    expect(snap.keys.prevGen).toEqual({ 'own-huawei-pura-90s-pro': 'own-huawei-pura-80-ultra' });
    expect(snap.keys.defaultShop).toEqual({ RU: 'ozon-flagship' });
    expect(snap.keys.anomalyRule).toEqual({ enabled: true, thresholdPct: 30 });
    expect(snap.keys.anomalyMarks).toHaveLength(1);
  });

  it('空浏览器导出：配置键全为 null（fx 只读历史键无值亦为 null）', () => {
    const snap = exportConfigSnapshot();
    expect(snap.keys.benchmark).toBeNull();
    expect(snap.keys.prevGen).toBeNull();
    expect(snap.keys.defaultShop).toBeNull();
    expect(snap.keys.anomalyRule).toBeNull();
    expect(snap.keys.anomalyMarks).toBeNull();
    expect(snap.keys.marketRules).toBeNull();
    expect(snap.keys.fx).toBeNull();
  });
});

describe('validateImportPayload · 坏文件一律拒绝（不半写入）', () => {
  const base = () => ({
    schemaVersion: 1,
    exportedAt: '2026-11-06T10:00:00.000Z',
    appChannel: 'stable',
    keys: {
      benchmark: null, prevGen: null, defaultShop: null, anomalyRule: null, anomalyMarks: null, fx: null,
    },
  });

  it('坏 JSON：友好报错', () => {
    const res = parseConfigSnapshotText('{not json');
    expect(res.ok).toBe(false);
    expect(res.error).toContain('JSON');
  });

  it('非对象 / schemaVersion 不支持 / 缺 keys / appChannel 非法', () => {
    expect(validateImportPayload('x').error).toContain('JSON 对象');
    expect(validateImportPayload({ ...base(), schemaVersion: 2 }).error).toContain('schemaVersion');
    expect(validateImportPayload({ ...base(), keys: undefined }).error).toContain('keys');
    expect(validateImportPayload({ ...base(), appChannel: 'beta' }).error).toContain('appChannel');
  });

  it('缺必含配置项 benchmark → 拒绝', () => {
    const payload = base();
    delete (payload.keys as Record<string, unknown>).benchmark;
    const res = validateImportPayload(payload);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('benchmark');
  });

  it('未知配置项（如迭代 forecast 键混入）→ 拒绝整份导入', () => {
    const res = validateImportPayload({ ...base(), keys: { ...base().keys, referenceWorkspace: {} } });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('referenceWorkspace');
  });

  it('类型/结构错：benchmark 非数组、prevGen 值非字符串、defaultShop 值空、anomalyRule 阈值越界、anomalyMarks action 非法、fx 负数', () => {
    expect(validateImportPayload({ ...base(), keys: { ...base().keys, benchmark: {} } }).error).toContain('benchmark');
    expect(validateImportPayload({ ...base(), keys: { ...base().keys, prevGen: { m: 3 } } }).error).toContain('prevGen');
    expect(validateImportPayload({ ...base(), keys: { ...base().keys, defaultShop: { RU: '' } } }).error).toContain('defaultShop');
    expect(validateImportPayload({ ...base(), keys: { ...base().keys, anomalyRule: { enabled: true, thresholdPct: 5 } } }).error).toContain('anomalyRule');
    expect(validateImportPayload({
      ...base(),
      keys: { ...base().keys, anomalyMarks: [{ countryCode: 'RU', seriesKey: 'k', bucketId: '202639', action: 'delete', ts: 1 }] },
    }).error).toContain('anomalyMarks');
    expect(validateImportPayload({ ...base(), keys: { ...base().keys, fx: { RUB: -1 } } }).error).toContain('fx');
    expect(validateImportPayload({
      ...base(),
      keys: { ...base().keys, marketRules: [{ countryCode: 'ZA', sourceKind: 'operator-booklet-monthly', granularity: 'month', fixedPlatform: 'VODACOM SHOP', financingTerms: [18], includePrepaid: false, includeNoPrice: false, enabled: true, note: null }] },
    }).error).toContain('financingTerms');
  });

  it('市场采集规则可导入并保持月度/期数语义', () => {
    const res = validateImportPayload({
      ...base(),
      keys: { ...base().keys, marketRules: [{ countryCode: 'ZA', sourceKind: 'operator-booklet-monthly', granularity: 'month', fixedPlatform: 'VODACOM SHOP', financingTerms: [24, 36], includePrepaid: false, includeNoPrice: false, enabled: true, note: '待复核' }] },
    });
    expect(res.ok).toBe(true);
    expect(res.payload?.keys.marketRules?.[0]).toMatchObject({ countryCode: 'ZA', financingTerms: [24, 36] });
  });

  it('好文件（含全部键）通过校验', () => {
    seedConfig();
    const res = validateImportPayload(JSON.parse(JSON.stringify(exportConfigSnapshot())));
    expect(res.ok).toBe(true);
    expect(res.payload?.keys.benchmark).toEqual([benchRow]);
  });
});

describe('applyImportPayload · round-trip 与权限', () => {
  it('导出 → 清配置 → 导入 → 恢复，并派发 CONFIG_CHANGED_EVENT（defaultShop 读缓存随之失效）', () => {
    // matrix-only 口径（2026-11-10）：基准 = 空配置时的纯维表生效视图
    const benchmarkBaseline = getEffectiveBenchmark();
    seedConfig();
    const snap: ConfigSnapshotV1 = JSON.parse(JSON.stringify(exportConfigSnapshot()));
    clearAllConfig();
    expect(getPrevGenOverrides()).toEqual({});
    expect(defaultShopOverrideOf('RU')).toBeNull();

    const fired = vi.fn();
    window.addEventListener('lpl3-config-changed', fired);
    const result = applyImportPayload(snap);
    window.removeEventListener('lpl3-config-changed', fired);

    expect(result.applied).toBe(true);
    expect(fired).toHaveBeenCalledTimes(1);
    // matrix-only 临时口径：导入仍把 benchmark 快照写入 localStorage（saveBenchmark 语义不变），
    // 但生效读取只认维表 dimBenchmark，人工快照不改变 getEffectiveBenchmark 返回
    expect(window.localStorage.getItem(LPL.cfgBenchmark)).toEqual(JSON.stringify([benchRow]));
    expect(getEffectiveBenchmark()).toEqual(benchmarkBaseline);
    expect(getPrevGenOverrides()).toEqual({ 'own-huawei-pura-90s-pro': 'own-huawei-pura-80-ultra' });
    expect(defaultShopOverrideOf('RU')).toBe('ozon-flagship');
    expect(readAnomalyRule()).toEqual({ enabled: true, thresholdPct: 30 });
    expect(listAnomalyMarks()).toHaveLength(1);
  });

  it('null 键 = 恢复系统默认（对应 localStorage 键被移除）', () => {
    seedConfig();
    const res = applyImportPayload(JSON.parse(JSON.stringify(exportConfigSnapshot())) as ConfigSnapshotV1);
    expect(res.applied).toBe(true);
    // 全 null 快照（清空种子后再导出的口径）
    clearAllConfig();
    const emptySnap = exportConfigSnapshot();
    const applied = applyImportPayload(emptySnap);
    expect(applied.applied).toBe(true);
    seedConfig(); // 重新落盘一些人工配置，再用全 null 快照导入 → 键应被移除
    const wiped = applyImportPayload(emptySnap);
    expect(wiped.applied).toBe(true);
    expect(window.localStorage.getItem(LPL.cfgBenchmark)).toBeNull();
    expect(window.localStorage.getItem(LPL.cfgPrevGen)).toBeNull();
    expect(window.localStorage.getItem(LPL.cfgDefaultShop)).toBeNull();
    expect(window.localStorage.getItem(LPL.cfgAnomalyRule)).toBeNull();
    expect(window.localStorage.getItem(LPL.cfgAnomalyMarks)).toBeNull();
  });

  it('viewer 角色：导入被拒且不写任何键（纵深防御）', () => {
    seedConfig();
    const snap: ConfigSnapshotV1 = JSON.parse(JSON.stringify(exportConfigSnapshot()));
    clearAllConfig();
    setRole('viewer');
    const result = applyImportPayload(snap);
    expect(result.applied).toBe(false);
    expect(result.reason).toContain('查阅者');
    for (const key of [LPL.cfgBenchmark, LPL.cfgPrevGen, LPL.cfgDefaultShop, LPL.cfgAnomalyRule, LPL.cfgAnomalyMarks]) {
      expect(window.localStorage.getItem(key)).toBeNull();
    }
  });

  it('viewer 下 store 写 API 同为 no-op（saveBenchmark 不落盘）', () => {
    setRole('viewer');
    saveBenchmark([benchRow]);
    expect(window.localStorage.getItem(LPL.cfgBenchmark)).toBeNull();
  });
});

describe('summarizeImportPayload · 预览摘要', () => {
  it('各国竞品条数、覆盖数、规则口径齐备', () => {
    seedConfig();
    const summary = summarizeImportPayload(JSON.parse(JSON.stringify(exportConfigSnapshot())) as ConfigSnapshotV1);
    expect(summary.benchmarkTotal).toBe(1);
    expect(summary.benchmarkByCountry).toEqual([{ countryCode: 'RU', count: 1 }]);
    expect(summary.prevGenCount).toBe(1);
    expect(summary.defaultShopCount).toBe(1);
    expect(summary.anomalyRule).toEqual({ enabled: true, thresholdPct: 30 });
    expect(summary.anomalyMarkCount).toBe(1);
    expect(summary.fxIncluded).toBe(false);
  });
});
