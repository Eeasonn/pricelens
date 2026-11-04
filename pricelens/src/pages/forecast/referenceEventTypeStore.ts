// ============================================================
// 量价参考卡 · 事件类型库（浏览器级 localStorage 配置）：
// 内置五类（竞品上市 / 我司上市 / 促销投放 / 挤兑 / 其他）+ 自定义类型
// 的统一注册表；默认色 = tokens.referenceEventPalette 语义对应；用户改色
// / 改名 / 恢复默认只写本库（LPL3.config.referenceEventTypes），不反写
// 主图 PRODUCT_EVENT_COLOR，不进模型。
// 组件经 useReferenceEventTypes()（useSyncExternalStore）订阅——antd Popover
// portal 不随父 props 更新，弹层内组件必须自持数据源（既有坑）。
// 写入失败显式暴露 status = 'unpersisted' + retryPersist()（不静默兜底，
// 规格书 §4.1 点名）；读取经 sanitize，坏记录逐条隔离。
// 被引用类型禁硬删（P1）：本层暂不提供删除 API。
// ============================================================
import { useSyncExternalStore } from 'react';
import { LPL } from '../../state/lplKeys';
import { referenceEventPalette } from '../../theme/tokens';
import type { ReferenceEventType } from './referenceEventModel';

export interface ReferenceEventTypeLibraryState {
  revision: number;
  /** 按 order → id 稳定排序的完整类型表（内置 + 自定义）。 */
  types: ReferenceEventType[];
  /** localStorage 写入状态：'idle' 正常；'unpersisted' 写失败（内存态仍有效）。 */
  status: 'idle' | 'unpersisted';
}

/** 内置类型（默认色与主图小事件同源色系：上市蓝 / 促销琥珀 / 挤兑墨 / 其他灰）。 */
export const BUILTIN_REFERENCE_EVENT_TYPES: ReadonlyArray<ReferenceEventType> = [
  { id: 'competitor-launch', label: '竞品上市', color: referenceEventPalette[0], origin: 'builtin', order: 0, updatedAt: '' },
  { id: 'own-launch', label: '我司上市', color: referenceEventPalette[0], origin: 'builtin', order: 1, updatedAt: '' },
  { id: 'promo', label: '促销投放', color: referenceEventPalette[1], origin: 'builtin', order: 2, updatedAt: '' },
  { id: 'cannibalization', label: '挤兑', color: referenceEventPalette[2], origin: 'builtin', order: 3, updatedAt: '' },
  { id: 'other', label: '其他', color: referenceEventPalette[3], origin: 'builtin', order: 4, updatedAt: '' },
];

const LIB_SCHEMA_VERSION = 1;
/** 类型显示名上限（§4.2：≤12 字，去空白，同库不区分大小写查重）。 */
export const TYPE_LABEL_MAX = 12;

// ---------------- 模块级 store（单库；订阅 + getSnapshot 稳定引用） ----------------

let state: ReferenceEventTypeLibraryState = {
  revision: 0,
  types: [...BUILTIN_REFERENCE_EVENT_TYPES],
  status: 'idle',
};
let loaded = false;
const listeners = new Set<() => void>();

const emit = (): void => {
  for (const listener of listeners) listener();
};

const sorted = (types: ReferenceEventType[]): ReferenceEventType[] =>
  [...types].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));

function sanitizeStoredTypes(raw: unknown): { types: ReferenceEventType[]; revision: number } | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (r.schemaVersion !== LIB_SCHEMA_VERSION || !Array.isArray(r.types)) return null;
  const byId = new Map<string, ReferenceEventType>();
  for (const item of r.types) {
    if (item == null || typeof item !== 'object' || Array.isArray(item)) continue;
    const t = item as Record<string, unknown>;
    if (typeof t.id !== 'string' || !t.id) continue;
    if (typeof t.label !== 'string' || !t.label) continue;
    if (typeof t.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(t.color)) continue;
    if (t.origin !== 'builtin' && t.origin !== 'custom') continue;
    byId.set(t.id, {
      id: t.id,
      label: t.label.slice(0, TYPE_LABEL_MAX),
      color: t.color.toLowerCase(),
      origin: t.origin,
      order: typeof t.order === 'number' && Number.isFinite(t.order) ? t.order : 0,
      updatedAt: typeof t.updatedAt === 'string' ? t.updatedAt : '',
    });
  }
  // 内置类型永不丢失：存量缺失 / 损坏的内置项按默认补齐（颜色回默认色板）
  for (const builtin of BUILTIN_REFERENCE_EVENT_TYPES) {
    if (!byId.has(builtin.id)) byId.set(builtin.id, { ...builtin });
  }
  return {
    types: sorted([...byId.values()]),
    revision: typeof r.revision === 'number' && Number.isFinite(r.revision) ? Math.round(r.revision) : 0,
  };
}

function readLibrary(): { types: ReferenceEventType[]; revision: number } {
  try {
    if (typeof localStorage === 'undefined') return { types: sorted([...BUILTIN_REFERENCE_EVENT_TYPES]), revision: 0 };
    const raw = localStorage.getItem(LPL.referenceEventTypes);
    if (raw == null) return { types: sorted([...BUILTIN_REFERENCE_EVENT_TYPES]), revision: 0 };
    return sanitizeStoredTypes(JSON.parse(raw)) ?? { types: sorted([...BUILTIN_REFERENCE_EVENT_TYPES]), revision: 0 };
  } catch {
    return { types: sorted([...BUILTIN_REFERENCE_EVENT_TYPES]), revision: 0 };
  }
}

function ensureLoaded(): void {
  if (loaded) return;
  loaded = true;
  const stored = readLibrary();
  state = { revision: stored.revision, types: stored.types, status: 'idle' };
}

function persist(next: ReferenceEventTypeLibraryState): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LPL.referenceEventTypes, JSON.stringify({
        schemaVersion: LIB_SCHEMA_VERSION,
        revision: next.revision,
        types: next.types,
        updatedAt: new Date().toISOString(),
      }));
    }
    state = { ...next, status: 'idle' };
  } catch {
    // 存储不可用（隐私模式 / 满）：显式「未持久化」状态，内存态保留，可重试
    state = { ...next, status: 'unpersisted' };
  }
  emit();
}

function mutate(fn: (prev: ReferenceEventTypeLibraryState) => ReferenceEventTypeLibraryState): void {
  ensureLoaded();
  const next = fn(state);
  persist({ ...next, revision: next.revision + 1 });
}

export function subscribeReferenceEventTypes(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getReferenceEventTypesSnapshot(): ReferenceEventTypeLibraryState {
  ensureLoaded();
  return state;
}

/** React 订阅入口（弹层内组件自持数据源，避免 Popover portal 不更新）。 */
export function useReferenceEventTypes(): ReferenceEventTypeLibraryState {
  return useSyncExternalStore(subscribeReferenceEventTypes, getReferenceEventTypesSnapshot, getReferenceEventTypesSnapshot);
}

// ---------------- 查询 ----------------

export const referenceEventTypeOf = (lib: ReferenceEventTypeLibraryState, typeId: string): ReferenceEventType | null =>
  lib.types.find((t) => t.id === typeId) ?? null;

/** 类型不可用兜底：显示用内置「其他」，标「类型不可用」；原 typeId 由调用方保留。 */
export interface ResolvedReferenceEventType {
  type: ReferenceEventType;
  /** true = typeId 不在类型库（配置损坏 / 被禁用），按「其他」兜底显示。 */
  unavailable: boolean;
}

export function resolveReferenceEventType(lib: ReferenceEventTypeLibraryState, typeId: string): ResolvedReferenceEventType {
  const found = referenceEventTypeOf(lib, typeId);
  if (found) return { type: found, unavailable: false };
  const fallback = referenceEventTypeOf(lib, 'other') ?? BUILTIN_REFERENCE_EVENT_TYPES[4];
  return { type: { ...fallback, id: typeId }, unavailable: true };
}

export const referenceEventLabelOf = (lib: ReferenceEventTypeLibraryState, typeId: string): string =>
  resolveReferenceEventType(lib, typeId).type.label;

export const referenceEventColorOf = (lib: ReferenceEventTypeLibraryState, typeId: string): string =>
  resolveReferenceEventType(lib, typeId).type.color;

/** 内置类型的默认色（「恢复默认」只恢复当前类型）。 */
export const referenceEventDefaultColorOf = (typeId: string): string =>
  BUILTIN_REFERENCE_EVENT_TYPES.find((t) => t.id === typeId)?.color ?? referenceEventPalette[3];

// ---------------- 变更（全部生成配置 revision；「恢复全部默认」= resetAll） ----------------

/** 改色（色板 / 原生取色器 / hex 输入统一入口；hex 合法性由调用方先校验）。 */
export function setReferenceEventTypeColor(typeId: string, colorHex: string): void {
  const normalized = colorHex.trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(normalized)) return;
  mutate((prev) => ({
    ...prev,
    types: prev.types.map((t) => (t.id === typeId
      ? { ...t, color: normalized, updatedAt: new Date().toISOString() }
      : t)),
  }));
}

/** 改显示名（去空白、≤12 字、同库不区分大小写查重；非法输入静默忽略）。 */
export function renameReferenceEventType(typeId: string, label: string): boolean {
  const trimmed = label.trim().slice(0, TYPE_LABEL_MAX);
  if (!trimmed) return false;
  let conflict = false;
  mutate((prev) => {
    const key = trimmed.toLowerCase();
    conflict = prev.types.some((t) => t.id !== typeId && t.label.trim().toLowerCase() === key);
    if (conflict) return prev;
    return {
      ...prev,
      types: prev.types.map((t) => (t.id === typeId
        ? { ...t, label: trimmed, updatedAt: new Date().toISOString() }
        : t)),
    };
  });
  return !conflict;
}

/** 恢复当前类型默认（内置类型回色板默认色与默认名；自定义类型回色板轮转色）。 */
export function resetReferenceEventType(typeId: string): void {
  mutate((prev) => ({
    ...prev,
    types: prev.types.map((t) => {
      if (t.id !== typeId) return t;
      if (t.origin === 'builtin') {
        const builtin = BUILTIN_REFERENCE_EVENT_TYPES.find((b) => b.id === typeId);
        return builtin ? { ...builtin, updatedAt: new Date().toISOString() } : t;
      }
      return { ...t, color: referenceEventPalette[(t.order + 4) % referenceEventPalette.length], updatedAt: new Date().toISOString() };
    }),
  }));
}

/** 恢复全部默认（管理器入口；需二次确认 + 撤销由调用层承担）。 */
export function resetAllReferenceEventTypes(): void {
  mutate((prev) => ({
    ...prev,
    types: sorted([...BUILTIN_REFERENCE_EVENT_TYPES.map((t) => ({ ...t }))]),
  }));
}

/** 新增自定义类型（typeId = custom-<随机>；名称查重由 rename 同规则）。 */
export function addCustomReferenceEventType(label: string): ReferenceEventType | null {
  const trimmed = label.trim().slice(0, TYPE_LABEL_MAX);
  if (!trimmed) return null;
  let created: ReferenceEventType | null = null;
  mutate((prev) => {
    const key = trimmed.toLowerCase();
    if (prev.types.some((t) => t.label.trim().toLowerCase() === key)) return prev;
    const maxOrder = prev.types.reduce((max, t) => Math.max(max, t.order), -1);
    created = {
      id: `custom-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`,
      label: trimmed,
      color: referenceEventPalette[(maxOrder + 5) % referenceEventPalette.length],
      origin: 'custom',
      order: maxOrder + 1,
      updatedAt: new Date().toISOString(),
    };
    return { ...prev, types: sorted([...prev.types, created]) };
  });
  return created;
}

/** 测试隔离：清空缓存 + 下次读取重载（不直接触碰 localStorage 数据）。 */
export function resetReferenceEventTypeStoreForTests(): void {
  loaded = false;
  state = { revision: 0, types: sorted([...BUILTIN_REFERENCE_EVENT_TYPES]), status: 'idle' };
  emit();
}
