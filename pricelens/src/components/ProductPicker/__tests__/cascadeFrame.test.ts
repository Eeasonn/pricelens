// ============================================================
// 树浮窗固定骨架纯函数金测（2026-11-27，修「Huawei 切 Samsung 弹层整体收窄」）：
// ① frameColumnWidth 与自适应列宽 autoColumnWidth 同一公式（同样的行给出同样的宽）；
// ② cascadeFrameOf 给出四列定宽、确定可比、对比上下文预留对比胶囊；
// ③ 关键性质「切到任何品牌 / 系列都不需要更宽的列」：按全量树冻结的每一列宽 ≥
//    按其任一子树（单品牌 / 单系列，= 切换后各列实际看到的行）算出的宽——所以
//    外框与四列列宽在品牌 / 系列 / 型号切换中不会变。
// 真实产品树驱动，逐条断言，不做快照。
// ============================================================
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { autoColumnWidth, frameColumnWidth, type CascadeRowItem } from '../../ProductCascader/CascadePanel';
import { buildProductTree, type BrandNode } from '../../ProductCascader/tree';
import { cascadeFrameOf } from '../pickerBits';

const tree: BrandNode[] = buildProductTree('phone', 'RU');
const COLS = ['brand', 'series', 'model', 'romram'] as const;
type Frame = ReturnType<typeof cascadeFrameOf>;

const itemsOf = (labels: string[], opts: { checkbox?: boolean; leading?: boolean } = {}): CascadeRowItem[] =>
  labels.map((label, i) => ({
    key: `k${i}`,
    label,
    ...(opts.checkbox ? { checkState: 'none' as const } : {}),
    ...(opts.leading ? { leading: createElement('span') } : {}),
  }));

describe('frameColumnWidth（与自适应列宽同一公式）', () => {
  it('同样的行、同样的 chrome 预留 → 与 autoColumnWidth 逐像素相同', () => {
    const labels = ['Huawei', 'Samsung', 'Honor', 'Xiaomi', 'A-very-long-brand-name'];
    for (const checkbox of [false, true]) {
      for (const leading of [false, true]) {
        for (const extraW of [0, 18, 140]) {
          const auto = autoColumnWidth(itemsOf(labels, { checkbox, leading }), { extraW, noMaxClip: true });
          const frame = frameColumnWidth(labels, { checkbox, leading, extraW });
          expect(frame).toBe(auto);
        }
      }
    }
  });

  it('取最长标签；空集与短标签落到下限 148', () => {
    expect(frameColumnWidth([])).toBe(148);
    expect(frameColumnWidth(['A'])).toBe(148);
    expect(frameColumnWidth(['A', 'AB', 'ABC'.padEnd(60, 'x')])).toBe(frameColumnWidth(['ABC'.padEnd(60, 'x')]));
    expect(frameColumnWidth(['x'.padEnd(400, 'x')])).toBeLessThanOrEqual(1600); // 与自适应同样的失控上限
  });
});

describe('cascadeFrameOf（全量树四列定宽）', () => {
  const frame = cascadeFrameOf(tree, 'usd', { compareCtx: false });

  it('四列都有宽、各不低于列宽下限，total = 四列之和；两次调用结果相同', () => {
    expect(tree.length).toBeGreaterThan(1);
    for (const c of COLS) expect(frame[c]).toBeGreaterThanOrEqual(148);
    expect(frame.total).toBe(COLS.reduce((n, c) => n + frame[c], 0));
    expect(cascadeFrameOf(tree, 'usd', { compareCtx: false })).toEqual(frame);
  });

  it('对比上下文预留「对比」胶囊：配置列与型号列（无配置层级型号的对比胶囊在型号行）只宽不窄，品牌 / 系列列不变', () => {
    const cmp = cascadeFrameOf(tree, 'usd', { compareCtx: true });
    expect(cmp.romram).toBeGreaterThanOrEqual(frame.romram);
    expect(cmp.model).toBeGreaterThanOrEqual(frame.model);
    expect(cmp.brand).toBe(frame.brand);
    expect(cmp.series).toBe(frame.series);
    // 骨架只在打开时刻按上下文定一次：同一上下文内不随当前路径变化
    expect(cascadeFrameOf([tree[0]], 'usd', { compareCtx: true }).romram).toBeLessThanOrEqual(cmp.romram);
  });

  it('型号行尾不带「档位 · 现价」时型号列只窄不宽（模板编辑浮窗），其余列不变', () => {
    const noTag = cascadeFrameOf(tree, 'usd', { compareCtx: false, modelTag: false });
    expect(noTag.model).toBeLessThanOrEqual(frame.model);
    expect(noTag.brand).toBe(frame.brand);
    expect(noTag.series).toBe(frame.series);
    expect(noTag.romram).toBe(frame.romram);
  });

  it('空树 → 四列均为下限宽', () => {
    expect(cascadeFrameOf([], 'usd', { compareCtx: false })).toEqual({ brand: 148, series: 148, model: 148, romram: 148, total: 592 });
  });

  it('切到任何品牌 / 任何系列都不需要更宽的列：全量树冻结宽 ≥ 任一子树的宽（外框与列宽不会随切换收窄）', () => {
    const subTrees: BrandNode[][] = [];
    for (const b of tree) {
      subTrees.push([b]); // 切到某品牌后品牌 / 系列 / 型号列看到的行
      for (const s of b.series) subTrees.push([{ ...b, series: [s], modelCount: s.models.length }]); // 再切到某系列
    }
    expect(subTrees.length).toBeGreaterThan(3);
    for (const sub of subTrees) {
      const f = cascadeFrameOf(sub, 'usd', { compareCtx: false });
      for (const c of COLS) expect(f[c], `sub-tree ${sub[0].key} col ${c}`).toBeLessThanOrEqual(frame[c]);
    }
  });
});
