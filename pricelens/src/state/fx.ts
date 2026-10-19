// 参考汇率读取层。保持无 UI/数据聚合依赖，供图表、总览、预警和配置页共享。
import { LPL } from './lplKeys';

export const DEFAULT_FX_RATE = 80;

function storage(): Storage | null {
  try {
    // The app runs in a browser; avoiding Node's experimental global localStorage
    // keeps pure data-model tests side-effect free and warning-free.
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function readFx(): unknown {
  try {
    const store = storage();
    if (!store) return null;
    const raw = store.getItem(LPL.cfgFx);
    return raw == null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

/** 当前用户参考汇率（本币 / USD），非法或未配置时回到 demo 默认值。 */
export function getFxRate(): number {
  const value = readFx();
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : DEFAULT_FX_RATE;
}

export function saveFx(rate: number): void {
  try {
    storage()?.setItem(LPL.cfgFx, JSON.stringify(rate));
  } catch {
    // 存储不可用时仅保持当前会话的默认口径。
  }
}
