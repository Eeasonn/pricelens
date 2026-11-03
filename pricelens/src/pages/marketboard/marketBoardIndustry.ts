// ============================================================
// 大盘走势 · 当前产业（2026-11-03 顶部产业对齐）：大盘页与标签页标题共用的
// 唯一来源——页内产业切换、顶部产业对齐都写这里，口径行 / 三卡与
// document.title 同步刷新，不各持一份副本。
// · 会话级保留：sessionStorage 键与原页面视图态同键同格式
//   （LPL3.view.marketboard.industry），已有会话的选择照常读回；存储不可写
//   （隐私模式等）时退回内存，选择仍在本页签内生效。
// · 顶部产业 → 大盘样例（单向，不回写顶部筛选）：手机 / 平板 / 穿戴各有一份
//   样例；其余产业（音频等）无样例，由调用方保持当前选择（见 MarketBoardPage）。
// 订阅写法沿用 AnomalyQualityChip 的 useSyncExternalStore 模式。
// ============================================================
import { useSyncExternalStore } from 'react';
import type { Industry } from '../../dataModel/types';
import { readPageViewState, writePageViewState } from '../../state/usePageViewState';
import { MARKET_INDUSTRIES, type MarketIndustryData } from './marketBoardData';

const VIEW_KEY = 'marketboard.industry';

/** 顶部产业 → 大盘样例数据集 id（无样例的产业不登记） */
const DATASET_ID_OF_INDUSTRY: Partial<Record<Industry, string>> = {
  phone: 'phone',
  tablet: 'tablet',
  wearable: 'wearables',
};

/** 顶部产业对应的大盘样例；无样例（音频等）或样例已不在清单内时返回 null，
 *  调用方据此保持当前选择，不抛错。 */
export function marketDatasetOf(industry: Industry): MarketIndustryData | null {
  const id = DATASET_ID_OF_INDUSTRY[industry];
  return id ? MARKET_INDUSTRIES.find((d) => d.id === id) ?? null : null;
}

const listeners = new Set<() => void>();
/** 存储不可写时的内存兜底；正常情况下恒为 null，以 sessionStorage 为准 */
let memoryId: string | null = null;

function currentId(): string {
  return memoryId ?? readPageViewState(VIEW_KEY, () => MARKET_INDUSTRIES[0].id);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 写入大盘当前产业（数据集 id）；与当前值相同时不广播 */
export function setMarketIndustryId(id: string): void {
  if (id === currentId()) return;
  writePageViewState(VIEW_KEY, id);
  // 读回校验：写入失败（存储不可用 / 配额满）时退回内存
  memoryId = readPageViewState(VIEW_KEY, () => '') === id ? null : id;
  listeners.forEach((listener) => listener());
}

/** 大盘当前产业数据集（订阅写入）；未知 id（旧会话残留）回落首个样例 */
export function useMarketIndustry(): MarketIndustryData {
  const id = useSyncExternalStore(subscribe, currentId, currentId);
  return MARKET_INDUSTRIES.find((d) => d.id === id) ?? MARKET_INDUSTRIES[0];
}
