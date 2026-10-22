// ============================================================
// 页面本地视图态跨页保留（P1-5「打开即上次分析状态」）：页面切换会重挂载
// （App 按 page key 重挂），全局筛选之外的本页视图态（槽位/同步/查看窗口/
// 分图合并等）此前切页即丢——本 hook 以 sessionStorage 按键存取（键前缀
// LPL3.view.*，JSON 序列化），语义与 useState 完全一致（函数式更新同款）。
// 会话口径：sessionStorage = 页签级，会话内跨页保留；页签关闭即弃，不引入
// 新的 localStorage 键。读写失败（隐私模式/受限环境/坏 JSON）静默兜底。
// ============================================================
import { useCallback, useRef, useState } from 'react';

/** 会话视图态键前缀（与 localStorage 登记表 LPL3.* 同族、独立命名空间） */
export const VIEW_STATE_PREFIX = 'LPL3.view.';

/** 基本形状校验：读到的值须与 initializer 产出的默认值结构同类——
 *  数组对数组、普通对象对普通对象、基本类型对同类型；默认值为 null 的可空
 *  状态（如查看窗口）按对象口径放行（数组/对象），杜绝换版后的错型值进图 */
function shapeMatches(defaultValue: unknown, value: unknown): boolean {
  if (value == null) return false;
  if (Array.isArray(defaultValue)) return Array.isArray(value);
  if (defaultValue === null) return typeof value === 'object';
  if (typeof defaultValue === 'object') return typeof value === 'object' && !Array.isArray(value);
  return typeof value === typeof defaultValue;
}

/** 读：无值/坏 JSON/结构不符 → initializer 兜底（全部静默，不抛错） */
export function readPageViewState<T>(key: string, initializer: () => T): T {
  const fallback = initializer();
  try {
    if (typeof sessionStorage === 'undefined') return fallback;
    const raw = sessionStorage.getItem(VIEW_STATE_PREFIX + key);
    if (raw == null) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return shapeMatches(fallback, parsed) ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

/** 写：JSON 序列化落 sessionStorage；失败静默（受限环境不影响内存态） */
export function writePageViewState<T>(key: string, value: T): void {
  try {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.setItem(VIEW_STATE_PREFIX + key, JSON.stringify(value));
  } catch {
    /* 静默兜底 */
  }
}

/** setState 取值语义：函数式更新传当前值，否则直接取值 */
export function nextState<T>(prev: T, v: T | ((p: T) => T)): T {
  return typeof v === 'function' ? (v as (p: T) => T)(prev) : v;
}

/** 页面视图态（会话内跨页保留）：签名与 useState 完全一致；每次写入同步落
 *  sessionStorage，切页重挂载时读回。瞬态（悬停/拖动中）不要用本 hook。 */
export default function usePageViewState<T>(
  key: string,
  initializer: () => T,
): [T, (v: T | ((p: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => readPageViewState(key, initializer));
  const valueRef = useRef(value);
  valueRef.current = value;
  const set = useCallback(
    (v: T | ((p: T) => T)) => {
      const next = nextState(valueRef.current, v);
      valueRef.current = next;
      writePageViewState(key, next);
      setValue(next);
    },
    [key],
  );
  return [value, set];
}
