// ============================================================
// Agent 模型服务 · 轻量共享状态（配置页分块与 Agent 面板选择器共用）
//  - 真源在本机服务器；这里只缓存最近一次成功读到的完整状态，不落任何浏览器
//    存储（不新增 localStorage 键：密钥与模型配置都只在服务器）。
//  - useSyncExternalStore 订阅：快照是模块级稳定引用，只有真的变化才替换并广播。
//  - 读（loadAgentService）不抛错：失败原因写进 snapshot.error，调用方按需展示；
//    写（saveAgentProvider / setActiveModel）抛 AgentServiceApiError（带人话原因），
//    成功后用服务器返回的完整状态整体替换缓存。
// ============================================================
import { useSyncExternalStore } from 'react';
import { agentServiceApi, type SaveProviderPayload } from './api';
import type { ActiveModel, AgentServiceState } from './providers';

export interface AgentServiceSnapshot {
  /** 最近一次成功读到的服务器状态；从未成功前为 null */
  data: AgentServiceState | null;
  /** 首次加载或后台刷新进行中 */
  loading: boolean;
  /** 最近一次失败的人话原因；成功后清空。刷新失败时 data 保留旧值 */
  error: string | null;
  /** data 的取回时刻（毫秒时间戳） */
  updatedAt: number | null;
}

type Listener = () => void;

const IDLE: AgentServiceSnapshot = { data: null, loading: false, error: null, updatedAt: null };
/** 这段时间内的重复读取直接用缓存（面板反复开合、下拉反复打开不再打服务器） */
const FRESH_MS = 5_000;

let snapshot: AgentServiceSnapshot = IDLE;
let inflight: Promise<AgentServiceState | null> | null = null;
const listeners = new Set<Listener>();

function publish(patch: Partial<AgentServiceSnapshot>): void {
  snapshot = { ...snapshot, ...patch };
  for (const listener of [...listeners]) listener();
}

function messageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : '模型服务操作失败，请重试';
}

export function subscribeAgentService(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getAgentServiceSnapshot(): AgentServiceSnapshot {
  return snapshot;
}

export function useAgentService(): AgentServiceSnapshot {
  return useSyncExternalStore(subscribeAgentService, getAgentServiceSnapshot, getAgentServiceSnapshot);
}

/**
 * 读取服务器状态。已有新鲜数据且未要求强制时直接返回；并发调用合并为一次请求。
 * 失败不抛：返回 null，原因在 getAgentServiceSnapshot().error。
 */
export function loadAgentService(options: { force?: boolean } = {}): Promise<AgentServiceState | null> {
  if (inflight) return inflight;
  const fresh = snapshot.data != null && snapshot.updatedAt != null && Date.now() - snapshot.updatedAt < FRESH_MS;
  if (!options.force && fresh) return Promise.resolve(snapshot.data);
  inflight = (async () => {
    publish({ loading: true, error: null });
    try {
      const data = await agentServiceApi.getState();
      publish({ data, loading: false, error: null, updatedAt: Date.now() });
      return data;
    } catch (error) {
      publish({ loading: false, error: messageOf(error) });
      return null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

function accept(data: AgentServiceState): AgentServiceState {
  publish({ data, loading: false, error: null, updatedAt: Date.now() });
  return data;
}

/** 保存某家配置；成功后缓存整体换成服务器返回的最新状态 */
export async function saveAgentProvider(payload: SaveProviderPayload): Promise<AgentServiceState> {
  return accept(await agentServiceApi.saveProvider(payload));
}

/** 切换当前模型（下一次运行生效）；不影响进行中的运行与会话 */
export async function setActiveModel(active: ActiveModel | null): Promise<AgentServiceState> {
  return accept(await agentServiceApi.setActive(active));
}

/** 测试 / 拉模型不经过本模块改状态；之后调一次它把服务器记录的测试结果同步进来 */
export function refreshAgentService(): Promise<AgentServiceState | null> {
  return loadAgentService({ force: true });
}

/** 仅供测试：把模块级缓存清回初始态 */
export function resetAgentServiceStoreForTests(): void {
  snapshot = IDLE;
  inflight = null;
  listeners.clear();
}
