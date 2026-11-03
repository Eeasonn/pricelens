// ============================================================
// 量价走势 · 补充图②「库存 · DOS」演示数据（2026-11-03，第三轮产品讨论）：
// SI 补货节奏与全流程系数为演示假设（确定性 hash），渠道库存按
// 「上期库存 + 本期 SI − 本期销量」逐桶推演，DOS 按近 4 桶平均销量滚动
// ——销量取自真实周销数据，因此 DOS/库存走势与所选产品实际销量自洽。
// 全模块数据 simulated：卡头必须带「演示」标识（PRODUCT.md 数据边界）。
// ============================================================
import { hash01 } from '../../dataModel/volume';
import type { Granularity } from '../../dataModel/types';

export interface InventoryDemoPoint {
  bucketId: string;
  /** 本桶 sell-in 补货量（台）；无补货周为 null（图上不画 ▼） */
  siUnits: number | null;
  /** 渠道库存（台，推演值） */
  channelInv: number | null;
  /** 渠道 DOS（天）= 渠道库存 ÷ 近 4 桶平均销量 × 每桶天数 */
  channelDos: number | null;
  /** 全流程 DOS（天）= 渠道 DOS × 演示系数（含机关已产出未发货） */
  fullDos: number | null;
}

/** 演示数据统一标识（UI 卡头据此显示「演示」chip） */
export const INVENTORY_DEMO_SIMULATED = true;

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function inventoryDemoOf(input: {
  modelId: string;
  romram: string;
  countryCode: string;
  granularity: Granularity;
  bucketIds: readonly string[];
  volumes: readonly (number | null)[];
}): InventoryDemoPoint[] {
  const seed = `${input.countryCode}|${input.modelId}|${input.romram}|inventory-demo`;
  const daysPerBucket = input.granularity === 'week' ? 7 : 30;
  const vols = input.bucketIds.map((_, i) => {
    const v = input.volumes[i];
    return v != null && Number.isFinite(v) && v > 0 ? v : null;
  });
  const firstIdx = vols.findIndex((v) => v != null);
  if (firstIdx < 0) return input.bucketIds.map((bucketId) => ({ bucketId, siUnits: null, channelInv: null, channelDos: null, fullDos: null }));

  const initFactor = 5 + 4 * hash01(`${seed}|init`); // 初始库存 ≈ 5–9 周
  let inv = (vols[firstIdx] as number) * initFactor;
  const recent: number[] = [];
  const out: InventoryDemoPoint[] = [];
  for (let i = 0; i < vols.length; i++) {
    const bucketId = input.bucketIds[i];
    const vol = vols[i];
    if (vol == null) {
      out.push({ bucketId, siUnits: null, channelInv: null, channelDos: null, fullDos: null });
      continue;
    }
    // SI 补货节奏（演示假设）：上市爬坡期持续铺货；之后低频补货，库存超过 12 周销时停补
    const sinceLaunch = i - firstIdx;
    let si = 0;
    if (inv < vol * 12) {
      if (sinceLaunch < 3) {
        si = vol * (0.7 + 0.5 * hash01(`${seed}|si|${bucketId}`));
      } else if (hash01(`${seed}|si|${bucketId}`) > 0.72) {
        si = vol * (0.9 + 0.6 * hash01(`${seed}|siamt|${bucketId}`));
      }
    }
    inv = Math.max(inv + si - vol, vol * 0.8); // 库存下限：不低于 0.8 桶销（防 DOS 负/清零）
    recent.push(vol);
    if (recent.length > 4) recent.shift();
    const avg = mean(recent);
    const channelDos = avg > 0 ? (inv / avg) * daysPerBucket : null;
    const fullDos = channelDos != null ? channelDos * (1.35 + 0.45 * hash01(`${seed}|full|${bucketId}`)) : null;
    out.push({
      bucketId,
      siUnits: si > 0 ? Math.round(si) : null,
      channelInv: Math.round(inv),
      channelDos,
      fullDos,
    });
  }
  return out;
}
