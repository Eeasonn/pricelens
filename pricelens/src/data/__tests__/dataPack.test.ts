// ============================================================
// 数据包（2026-11-14「价格数据完全以导入方式承载」）：
// ① buildDataPack → applyDataPack round-trip：内置数据打包→应用→内容/元信息一致；
// ② 校验失败整体放弃（内置数据不受污染）：kind 错、缺维表、事实包坏 b64；
// ③ 改动生效：改一包维表货币后应用，currencyOfCountry 反映新值（后恢复原快照）；
// ④ 重导出保真：应用过的包再 buildDataPack，事实包 b64 = 该包原文；
// ⑤ dataPackStore：jsdom 无 IndexedDB → 读侧优雅回 null / 写侧 persisted:false。
// 注意：applyDataPack 改的是模块单例——ORIGINAL 是内置态的深快照，每例结束
// 重放快照恢复，防止用例间串味。
// ============================================================
import { beforeEach, describe, expect, it } from 'vitest';
import { applyDataPack, buildDataPack, currencyOfCountry, dataMeta, factPriceWeekly, type PricelensDataPack } from '../index';
import { clearDataPack, loadDataPack, saveDataPack } from '../dataPackStore';

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
    expect(pack.v).toBe(1);
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
    const pack = buildDataPack();
    expect(applyDataPack(pack).ok).toBe(true);
    expect(buildDataPack().factPackB64).toBe(pack.factPackB64);
  });
});

describe('applyDataPack 校验失败整体放弃（内置数据不受污染）', () => {
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
});

describe('dataPackStore（jsdom 无 IndexedDB：优雅降级）', () => {
  it('loadDataPack 环境不可用回 null（不抛错）', async () => {
    await expect(loadDataPack()).resolves.toBeNull();
  });

  it('saveDataPack 环境不可用返回 persisted:false（导入仍在本会话生效）', async () => {
    const pack = buildDataPack();
    await expect(saveDataPack(pack)).resolves.toEqual({ persisted: false });
  });

  it('clearDataPack 环境不可用静默完成', async () => {
    await expect(clearDataPack()).resolves.toBeUndefined();
  });
});
