// ============================================================
// 服务模式探测单测（2026-11-18 前后端分离）：ping 命中/HTTP 错误/fetch 抛错
// （file:// 单文件直开形态）三态 + 缓存语义 + 服务器包拉取。
// ============================================================
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { detectServiceMode, fetchServerPack, isServiceMode } from '../serviceMode';

const stubFetch = (impl: (input: string | URL | Request, init?: RequestInit) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>) => {
  const fn = vi.fn(impl);
  vi.stubGlobal('fetch', fn);
  return fn;
};

describe('服务模式探测（detectServiceMode / isServiceMode）', () => {
  beforeEach(() => {
    // 模块级缓存按探测结果固化——重置模块每例独立
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('ping 返回 {ok:true} → 服务模式；isServiceMode 同步读缓存一致', async () => {
    stubFetch(async (input) => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, service: 'pricelens-server' }),
    }));
    const { detectServiceMode: detect, isServiceMode: is } = await import('../serviceMode');
    expect(await detect()).toBe(true);
    expect(is()).toBe(true);
  });

  it('ping HTTP 404（服务器在但非 PriceLens 服务）→ 离线模式', async () => {
    stubFetch(async () => ({ ok: false, status: 404, json: async () => ({}) }));
    const { detectServiceMode: detect, isServiceMode: is } = await import('../serviceMode');
    expect(await detect()).toBe(false);
    expect(is()).toBe(false);
  });

  it('fetch 抛错（file:// 单文件直开：相对路径拒载）→ 离线模式，静默不抛', async () => {
    stubFetch(async () => {
      throw new TypeError('Failed to fetch');
    });
    const { detectServiceMode: detect } = await import('../serviceMode');
    await expect(detect()).resolves.toBe(false);
  });

  it('探测结果缓存：第二次调用不再发 ping', async () => {
    const fn = stubFetch(async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) }));
    const { detectServiceMode: detect } = await import('../serviceMode');
    await detect();
    await detect();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('服务器包拉取（fetchServerPack）', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('200 → 返回包对象', async () => {
    const pack = { kind: 'pricelens-data-pack', v: 2 };
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => pack })));
    expect(await fetchServerPack()).toEqual(pack);
  });

  it('404（服务器尚无数据包）→ null；fetch 抛错 → null', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({ error: 'no pack' }) })));
    expect(await fetchServerPack()).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('network down');
    }));
    expect(await fetchServerPack()).toBeNull();
  });
});
