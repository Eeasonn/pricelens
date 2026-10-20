// ============================================================
// 「竞品价差」纯计算层（第112轮，2026-10-21）：价格看板图卡下方的
// 价差矩阵与成对走势——取数与图上同源（series.points 下标 = 可见时间段桶序，
// price = 折后价，null = 缺采）。口径：行产品相对列产品（(行−列)/列），
// 红 = 行更贵、蓝 = 行更便宜，与图上附框 diffPct 同语言。
// ============================================================
import type { Series } from '../../dataModel/types';
import { diffPct } from './helpers';

/** 矩阵一格：行产品相对列产品；任一缺价 / 对角线 → 两值皆 null */
export interface DiffCell {
  amount: number | null; // 行价 − 列价（本币原值）
  pct: { text: string; tone: 'rich' | 'cheap' | 'flat' } | null;
}

/** 成对价差走势：按桶逐期的 (a−b)/b 百分比与金额，缺价桶为 null */
export interface PairTrend {
  pct: (number | null)[]; // 保留 1 位小数
  amount: (number | null)[]; // a − b
  latest: number | null; // 最后一个有值桶
  min: number | null;
  max: number | null;
}

/** 可见时间段内最后一个「至少一个系列有折后价」的桶下标；全缺 → null */
export function latestIdxWithPrice(series: Series[], n: number): number | null {
  for (let i = n - 1; i >= 0; i--) {
    for (const s of series) {
      if (s.points[i]?.price != null) return i;
    }
  }
  return null;
}

/** 价差矩阵：行/列 = series 顺序；行相对列。diffPct 平价（±0.0%）或无值 → flat */
export function buildDiffMatrix(series: Series[], idx: number): DiffCell[][] {
  return series.map((row, ri) =>
    series.map((col, ci): DiffCell => {
      if (ri === ci) return { amount: null, pct: null }; // 对角线 = 自比，无信息
      const rp = row.points[idx]?.price ?? null;
      const cp = col.points[idx]?.price ?? null;
      if (rp == null || cp == null) return { amount: null, pct: null };
      const d = diffPct(rp, cp);
      return {
        amount: rp - cp,
        pct: d == null
          ? { text: '—', tone: 'flat' }
          : { text: d.text, tone: d.text.startsWith('±') ? 'flat' : d.tone },
      };
    }),
  );
}

/** 成对走势：a 相对 b 逐桶百分比与金额；min/max 取有值桶 */
export function buildPairTrend(a: Series, b: Series): PairTrend {
  const n = Math.min(a.points.length, b.points.length);
  const pct: (number | null)[] = [];
  const amount: (number | null)[] = [];
  for (let i = 0; i < n; i++) {
    const pa = a.points[i]?.price ?? null;
    const pb = b.points[i]?.price ?? null;
    if (pa == null || pb == null || !(pb > 0)) {
      pct.push(null);
      amount.push(null);
      continue;
    }
    pct.push(Math.round(((pa - pb) / pb) * 1000) / 10);
    amount.push(pa - pb);
  }
  const vals = pct.filter((v): v is number => v != null);
  return {
    pct,
    amount,
    latest: vals.length ? vals[vals.length - 1] : null,
    min: vals.length ? Math.min(...vals) : null,
    max: vals.length ? Math.max(...vals) : null,
  };
}
