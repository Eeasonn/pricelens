import { afterEach, describe, expect, it, vi } from 'vitest';
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
  it('labels the offline local engine and the remote-with-fallback engine', () => {
    expect(describeAgentEngine({ source: 'none' }).label).toBe('本地确定性引擎 · 离线可用');
    const remote = describeAgentEngine({ baseUrl: 'http://127.0.0.1:8787', source: 'local-storage' });
    expect(remote.label).toBe('远端 Agent 叙述 · 本地引擎兜底');
    expect(remote.hint).toContain(AGENT_REMOTE_BASE_URL_KEY);
  });
});
