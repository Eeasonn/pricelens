// ============================================================
// inventoryDemo 纯函数金测（2026-11-03）：确定性 / 空输入 / 库存演化自洽
// （上期 + SI − 销量，clamp 下限）/ DOS 近 4 桶滚动口径 / 全流程 ≥ 渠道。
// ============================================================
import { describe, expect, it } from 'vitest';
import { inventoryDemoOf, INVENTORY_DEMO_SIMULATED } from '../inventoryDemo';

const IDS = ['202635', '202636', '202637', '202638', '202639', '202640', '202641', '202642'];
const VOLS: (number | null)[] = [1200, 1500, 1800, 2100, 1900, 1700, 1600, 1650];

const build = () =>
  inventoryDemoOf({
    modelId: 'mate-90',
    romram: '12+512',
    countryCode: 'RU',
    granularity: 'week',
    bucketIds: IDS,
    volumes: VOLS,
  });

describe('inventoryDemo · 基础契约', () => {
  it('演示标识恒真（UI 据此显示「演示数据」chip）', () => {
    expect(INVENTORY_DEMO_SIMULATED).toBe(true);
  });

  it('确定性：同输入两次调用输出一致', () => {
    expect(build()).toEqual(build());
  });

  it('不同产品（seed 不同）输出不同', () => {
    const a = build();
    const b = inventoryDemoOf({ modelId: 'pura-90s', romram: '12+256', countryCode: 'RU', granularity: 'week', bucketIds: IDS, volumes: VOLS });
    expect(a).not.toEqual(b);
  });

  it('无销量输入 → 全 null（不造数据）', () => {
    const out = inventoryDemoOf({ modelId: 'x', romram: 'y', countryCode: 'RU', granularity: 'week', bucketIds: IDS, volumes: IDS.map(() => null) });
    expect(out.every((p) => p.siUnits == null && p.channelInv == null && p.channelDos == null && p.fullDos == null)).toBe(true);
  });

  it('缺采桶（null 销量）输出 null，不中断后续推演', () => {
    const vols: (number | null)[] = [1000, null, 1200, 1300, 1250, 1280, 1300, 1320];
    const out = inventoryDemoOf({ modelId: 'm', romram: 'r', countryCode: 'RU', granularity: 'week', bucketIds: IDS, volumes: vols });
    expect(out[1].channelInv).toBeNull();
    expect(out[2].channelInv).not.toBeNull();
  });
});

describe('inventoryDemo · 库存与 DOS 口径', () => {
  it('库存演化自洽：inv[i] = inv[i-1] + si[i] − vol[i]（或触底 0.8 周销下限）', () => {
    const out = build();
    const vols = VOLS as number[];
    for (let i = 1; i < out.length; i++) {
      const prev = out[i - 1].channelInv;
      const cur = out[i].channelInv;
      const si = out[i].siUnits ?? 0;
      if (prev == null || cur == null) continue;
      const raw = prev + si - vols[i];
      const clamped = Math.max(raw, vols[i] * 0.8);
      expect(Math.abs(cur - Math.round(clamped))).toBeLessThanOrEqual(1); // 四舍五入容差
    }
  });

  it('渠道 DOS = 渠道库存 ÷ 近 4 桶平均销量 × 7（含上市首 4 桶滚动窗口）', () => {
    const out = build();
    const vols = VOLS as number[];
    for (let i = 0; i < out.length; i++) {
      const dos = out[i].channelDos;
      const inv = out[i].channelInv;
      if (dos == null || inv == null) continue;
      const recent = vols.slice(Math.max(0, i - 3), i + 1);
      const avg = recent.reduce((s, v) => s + v, 0) / recent.length;
      // 输出库存已四舍五入（±0.5 台），DOS 反算容差 ±0.05 天
      expect(dos).toBeCloseTo((inv / avg) * 7, 1);
    }
  });

  it('全流程 DOS 恒 ≥ 渠道 DOS（演示系数 1.35–1.80）', () => {
    const out = build();
    for (const p of out) {
      if (p.channelDos == null || p.fullDos == null) continue;
      expect(p.fullDos).toBeGreaterThanOrEqual(p.channelDos * 1.34);
      expect(p.fullDos).toBeLessThanOrEqual(p.channelDos * 1.81);
    }
  });

  it('库存下限不破 0.8 周销（DOS 不为负、不清零）', () => {
    // 构造持续放量销量，验证 clamp 生效
    const vols: (number | null)[] = [500, 2000, 4000, 6000, 8000, 9000, 9500, 9600];
    const out = inventoryDemoOf({ modelId: 'm2', romram: 'r', countryCode: 'RU', granularity: 'week', bucketIds: IDS, volumes: vols });
    for (let i = 0; i < out.length; i++) {
      const inv = out[i].channelInv;
      if (inv == null) continue;
      expect(inv).toBeGreaterThanOrEqual((vols[i] as number) * 0.8 - 1);
    }
  });
});
