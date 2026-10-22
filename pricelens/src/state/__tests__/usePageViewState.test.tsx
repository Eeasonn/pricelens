// usePageViewState 单测（P1-5「打开即上次分析状态」）：读写往返、函数式更新、
// 坏 JSON/结构不符兜底、受限环境静默。node 环境无 sessionStorage，装内存桩；
// hook 初始读取经 renderToStaticMarkup（服务端渲染跑 useState 初始化器）验证。
import { beforeAll, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import usePageViewState, {
  VIEW_STATE_PREFIX,
  nextState,
  readPageViewState,
  writePageViewState,
} from '../usePageViewState';

/** node 环境无 sessionStorage：内存桩（同 configStore.bench.test.ts 的 localStorage 桩法） */
const mem = new Map<string, string>();
const throwingStore = {
  getItem: () => {
    throw new Error('denied');
  },
  setItem: () => {
    throw new Error('denied');
  },
  removeItem: () => {},
};
type Storeish = { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void };
const setStore = (s: unknown): void => {
  (globalThis as { sessionStorage?: unknown }).sessionStorage = s;
};

beforeAll(() => {
  setStore({
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  });
});

describe('readPageViewState / writePageViewState（读写往返）', () => {
  it('写入后按 LPL3.view.{key} 原样读回（JSON 序列化保形）', () => {
    writePageViewState('demo.win', ['202619', '202630']);
    expect(mem.get(VIEW_STATE_PREFIX + 'demo.win')).toBe('["202619","202630"]');
    expect(readPageViewState('demo.win', () => null)).toEqual(['202619', '202630']);
  });

  it('无存值时回 initializer（且不误写存储）', () => {
    mem.clear();
    let calls = 0;
    const v = readPageViewState('demo.absent', () => {
      calls += 1;
      return { a: 1 };
    });
    expect(v).toEqual({ a: 1 });
    expect(calls).toBe(1);
    expect(mem.has(VIEW_STATE_PREFIX + 'demo.absent')).toBe(false);
  });

  it('布尔/数组/可空各形状：类型相符才放行（基本形状校验）', () => {
    writePageViewState('demo.bool', false);
    expect(readPageViewState('demo.bool', () => true)).toBe(false);
    writePageViewState('demo.list', [1, null, 2]);
    expect(readPageViewState('demo.list', () => [0, 0, 0])).toEqual([1, null, 2]);
    // 存了数组、默认值为对象 → 结构不符回默认
    mem.set(VIEW_STATE_PREFIX + 'demo.obj', '[1,2]');
    expect(readPageViewState('demo.obj', () => ({ a: 0 }))).toEqual({ a: 0 });
  });

  it('坏 JSON 兜底：手改存储为非法串 → 回 initializer 不抛错', () => {
    mem.set(VIEW_STATE_PREFIX + 'demo.bad', '{not-json');
    expect(readPageViewState('demo.bad', () => 'fallback')).toBe('fallback');
  });

  it('结构不符兜底：布尔位读到串/数组默认读到对象 → 回 initializer', () => {
    mem.set(VIEW_STATE_PREFIX + 'demo.str', '"compact"');
    expect(readPageViewState('demo.str', () => 'compact')).toBe('compact');
    mem.set(VIEW_STATE_PREFIX + 'demo.str2', '"detail"');
    expect(readPageViewState('demo.str2', () => 'compact')).toBe('detail');
    mem.set(VIEW_STATE_PREFIX + 'demo.arr', '{"0":1}');
    expect(readPageViewState('demo.arr', () => [1, 2])).toEqual([1, 2]);
    // 可空窗口态：默认 null，读到错型数字 → 回 null
    mem.set(VIEW_STATE_PREFIX + 'demo.nullable', '3');
    expect(readPageViewState('demo.nullable', () => null)).toBeNull();
  });
});

describe('nextState（函数式更新，与 useState 同语义）', () => {
  it('传函数 = 按当前值算下一个；传值 = 直接替换', () => {
    expect(nextState(10, (p) => p + 1)).toBe(11);
    expect(nextState(10, 5)).toBe(5);
    const prev = [1, 2];
    expect(nextState(prev, (p) => [...p, 3])).toEqual([1, 2, 3]);
    expect(nextState(prev, [9])).toEqual([9]);
  });
});

describe('usePageViewState（hook 装配）', () => {
  it('初始值 = 会话存值（SSR 初始化路径），受控写入经 nextState 落存储', () => {
    writePageViewState('demo.hook', true);
    const Comp = createElement(() => {
      const [v] = usePageViewState<boolean>('demo.hook', () => false);
      return createElement('span', null, v ? 'on' : 'off');
    });
    expect(renderToStaticMarkup(Comp)).toBe('<span>on</span>');
  });

  it('受限环境（读写抛错）静默兜底：读回默认、写不抛', () => {
    setStore(throwingStore);
    try {
      expect(readPageViewState('demo.denied', () => 'safe')).toBe('safe');
      expect(() => writePageViewState('demo.denied', 'x')).not.toThrow();
    } finally {
      setStore({
        getItem: (k: string) => mem.get(k) ?? null,
        setItem: (k: string, v: string) => void mem.set(k, v),
        removeItem: (k: string) => void mem.delete(k),
      });
    }
  });
});
