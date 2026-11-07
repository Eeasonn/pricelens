import { afterEach, describe, expect, it, vi } from 'vitest';
// 2026-11-07 整合：稳定栈只在稳定构建启用，其测试按出货通道（STABLE）运行
vi.mock('../../appChannel', () => ({
  APP_CHANNEL: 'stable' as const,
  STABLE: true,
  ONLINE_ITERATE: false,
  STABLE_HIDDEN_PAGES: ['marketboard', 'forecast', 'intelligence'],
  hiddenInStable: (page: string): boolean => ['marketboard', 'forecast', 'intelligence'].includes(page),
  resolveAppChannel: (): 'stable' => 'stable',
}));
import { AGENT_REMOTE_BASE_URL_KEY, describeAgentEngine, resolveAgentEngine } from '../remoteConfig';

const env = (value?: string): Record<string, string | undefined> => ({ VITE_AGENT_API_BASE_URL: value });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resolveAgentEngine', () => {
  it('prefers the localStorage key over the build-time env', () => {
    vi.stubGlobal('localStorage', { getItem: (key: string) => (key === AGENT_REMOTE_BASE_URL_KEY ? 'http://127.0.0.1:8787' : null) });
    expect(resolveAgentEngine(env('/api/agent'))).toEqual({ baseUrl: 'http://127.0.0.1:8787', source: 'local-storage' });
  });

  it('uses the env value when nothing is self-configured', () => {
    vi.stubGlobal('localStorage', { getItem: () => null });
    expect(resolveAgentEngine(env('/api/agent'))).toEqual({ baseUrl: '/api/agent', source: 'env' });
  });

  it('treats a blank or whitespace-only stored value as unconfigured', () => {
    vi.stubGlobal('localStorage', { getItem: (key: string) => (key === AGENT_REMOTE_BASE_URL_KEY ? '   ' : null) });
    expect(resolveAgentEngine(env('/api/agent'))).toEqual({ baseUrl: '/api/agent', source: 'env' });
  });

  it('reports a pure-local engine when neither source is configured', () => {
    vi.stubGlobal('localStorage', { getItem: () => null });
    expect(resolveAgentEngine(env(undefined))).toEqual({ source: 'none' });
  });

  it('falls back to env when localStorage access throws (restricted environment)', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('SecurityError'); } });
    expect(resolveAgentEngine(env('/api/agent'))).toEqual({ baseUrl: '/api/agent', source: 'env' });
  });

  it('resolves without an explicit env map by reading import.meta.env at call time', () => {
    vi.stubGlobal('localStorage', { getItem: () => null });
    const config = resolveAgentEngine();
    expect(['local-storage', 'env', 'none']).toContain(config.source);
    if (config.source === 'none') expect(config.baseUrl).toBeUndefined();
  });
});

describe('describeAgentEngine', () => {
  it('labels the offline local engine', () => {
    expect(describeAgentEngine({ source: 'none' }).label).toBe('本地确定性引擎 · 离线可用');
    expect(describeAgentEngine({ source: 'none' }).engine).toBe('local');
  });

  it('distinguishes the platform-preset gateway (env) from self-configured (local-storage)', () => {
    const preset = describeAgentEngine({ baseUrl: 'https://gateway.example.com', source: 'env' });
    expect(preset.engine).toBe('remote-with-fallback');
    expect(preset.label).toBe('平台预设网关 · GLM 叙述 · 本地兜底');
    expect(preset.hint).toContain('平台预设 GLM 网关');
    expect(preset.hint).toContain('https://gateway.example.com');
    expect(preset.hint).toContain('不含密钥');

    const selfConfigured = describeAgentEngine({ baseUrl: 'http://127.0.0.1:8787', source: 'local-storage' });
    expect(selfConfigured.engine).toBe('remote-with-fallback');
    expect(selfConfigured.label).toBe('远端 Agent 叙述 · 本地引擎兜底');
    expect(selfConfigured.hint).toContain('自配远端服务');
    expect(selfConfigured.hint).toContain(AGENT_REMOTE_BASE_URL_KEY);
  });

  it('keeps the two remote labels distinct', () => {
    const preset = describeAgentEngine({ baseUrl: 'https://gateway.example.com', source: 'env' });
    const selfConfigured = describeAgentEngine({ baseUrl: 'https://gateway.example.com', source: 'local-storage' });
    expect(preset.label).not.toBe(selfConfigured.label);
    expect(preset.hint).not.toBe(selfConfigured.hint);
  });
});
