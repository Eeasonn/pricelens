// ============================================================
// 共享窄视口钩子（第一百九十轮，外部 UX 审计落地）：窄屏检测单一来源——
// 价格看板主图「窄屏默认收窄可见段」与「价差与明细」宽表冻结列收窄共用同一
// 口径 matchMedia('(max-width: 639.98px)') + change 监听。SSR 安全：无
// window / 无 matchMedia 环境恒 false，不随渲染抖动。
// 由 TrendTables 的本地实现（第一百八十九轮）抽平共享，行为不变。
// ============================================================
import { useEffect, useState } from 'react';

/** 窄视口（<640px）检测：初始值同步读取（首帧即正确），跨阈值时随媒体查询更新 */
export function useNarrowViewport(): boolean {
  const [narrow, setNarrow] = useState(
    () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(max-width: 639.98px)').matches,
  );
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(max-width: 639.98px)');
    const onChange = (): void => setNarrow(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return narrow;
}
