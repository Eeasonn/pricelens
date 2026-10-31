# PriceLens 主产品经营视图与量价销毛成本 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将量价走势改为默认主产品经营视图，并在每个主产品面板内集成可共享时间轴的量、价、销毛、成本双段图及确定性模拟数据。

**Architecture:** 用纯函数 `volumeProductRefs` 从现有分析卡选择默认主产品或某一组的主品与竞品，以局部 `VolumeViewMode` 驱动同一量价卡内的主视图/组内对比视图。成本销毛由独立纯计算模型和 SVG 窄幅组件承担，复用现有价格、销量、窗口、悬停与时间轨道，不改全局筛选状态。

**Tech Stack:** React 18、TypeScript、Ant Design 5、ECharts 5（现有主图）、SVG（新增窄幅图）、Vitest、Vite 单文件构建。

**Spec:** `docs/PriceLens-主产品经营视图与量价销毛成本设计定稿.md`

## Global Constraints

- 默认只渲染各分析卡的 `card.main`；竞品只允许在组内对比次级视图出现。
- 1–3 个主产品按数量并排，超过 3 个沿用现有横向浏览，不新增默认组切换。
- 组内对比只在同一量价卡内展开，不新增路由、独立页面或全局筛选字段。
- 销毛与成本只进入量价走势，不修改价格走势页。
- 成本与销毛使用确定性模拟数据，标题固定为“成本与销毛（模拟）”；不得写成 OBS 或财务事实。
- 友商成本不填假数据，无数据区域显示“可显示，当前无数据”。
- 成本与销毛使用月度值，周/月/季视图均按实际月份形成阶梯，不拆渠道、不设置独立时间轴。
- 单台成本与单台销毛额共享“金额/台”纵轴；销毛率只在当前点读数中出现。
- 销量 Y 轴使用顶部/中间/底部三档轻量刻度；上限值默认无框、点击后编辑，Enter/失焦提交、Escape 取消、清空恢复自动；不得做成拖杆，手动截断必须提示“超出当前上限”。
- 必须满足 `单台销毛额 = 单台收入 − 单台成本`、`销毛率 = 单台销毛额 ÷ 单台收入`。
- 保留现有 `PeriodVolumePriceSummary`、`periodSummary`、渠道同步、面板拖序、销量轴设置及同步/非同步窗口行为。
- 不新增第三方依赖，不引入新的状态管理库或图表库。
- 当前工作区有并行修改；实施时只改任务文件，不回滚或覆盖无关改动。

---

### Task 1: 用纯函数定义主视图与组内视图的产品集合

**Files:**
- Create: `pricelens/src/pages/volume/volumeView.ts`
- Create: `pricelens/src/pages/volume/__tests__/volumeView.test.ts`

**Interfaces:**
- Consumes: `MainProduct`、`ProductSelection`（`pricelens/src/state/filtersTypes.ts`）。
- Produces:
  - `VolumeViewMode = { kind: 'mains' } | { kind: 'group'; cardId: string }`
  - `VolumeProductRef`
  - `volumeProductRefs(cards, mode)`
  - `validVolumeViewMode(cards, mode)`

- [x] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'vitest';
import type { MainProduct } from '../../../state/filtersTypes';
import { validVolumeViewMode, volumeProductRefs } from '../volumeView';

const sel = (modelId: string, romram = '12+256 GB') => ({ modelId, romram, skuIds: [`${modelId}__${romram}`] });
const cards: MainProduct[] = [
  { id: 'a', main: sel('own-a'), compares: [sel('comp-a1'), sel('comp-a2')] },
  { id: 'b', main: sel('own-b'), compares: [sel('comp-b1')] },
  { id: 'empty', main: null, compares: [sel('comp-empty')] },
];

describe('volumeProductRefs', () => {
  it('主视图只保留各卡主品并跳过空主品卡', () => {
    const rows = volumeProductRefs(cards, { kind: 'mains' });
    expect(rows.map((r) => [r.cardId, r.selection.modelId, r.isMain])).toEqual([
      ['a', 'own-a', true],
      ['b', 'own-b', true],
    ]);
  });

  it('组内视图按 cardId 返回主品与全部竞品', () => {
    const rows = volumeProductRefs(cards, { kind: 'group', cardId: 'a' });
    expect(rows.map((r) => [r.selection.modelId, r.isMain])).toEqual([
      ['own-a', true],
      ['comp-a1', false],
      ['comp-a2', false],
    ]);
  });

  it('组不存在或主品被删除时回主视图', () => {
    expect(validVolumeViewMode(cards, { kind: 'group', cardId: 'missing' })).toEqual({ kind: 'mains' });
    expect(validVolumeViewMode(cards, { kind: 'group', cardId: 'empty' })).toEqual({ kind: 'mains' });
  });

  it('同型号同配置跨卡去重且保留先出现者', () => {
    const duplicated: MainProduct[] = [
      { id: 'a', main: sel('same'), compares: [] },
      { id: 'b', main: sel('same'), compares: [] },
    ];
    expect(volumeProductRefs(duplicated, { kind: 'mains' }).map((r) => r.cardId)).toEqual(['a']);
  });
});
```

- [x] **Step 2: 运行测试确认失败**

Run: `cd pricelens && npx vitest run src/pages/volume/__tests__/volumeView.test.ts`
Expected: FAIL，原因是 `volumeView.ts` 尚不存在。

- [x] **Step 3: 实现纯选择函数**

```ts
import type { MainProduct, ProductSelection } from '../../state/filtersTypes';

export type VolumeViewMode = { kind: 'mains' } | { kind: 'group'; cardId: string };

export interface VolumeProductRef {
  selection: ProductSelection;
  cardId: string;
  isMain: boolean;
}

export function validVolumeViewMode(cards: MainProduct[], mode: VolumeViewMode): VolumeViewMode {
  if (mode.kind === 'mains') return mode;
  return cards.some((card) => card.id === mode.cardId && card.main != null) ? mode : { kind: 'mains' };
}

export function volumeProductRefs(cards: MainProduct[], mode: VolumeViewMode): VolumeProductRef[] {
  const source = mode.kind === 'group'
    ? cards.filter((card) => card.id === mode.cardId && card.main != null)
    : cards;
  const out: VolumeProductRef[] = [];
  const seen = new Set<string>();
  for (const card of source) {
    const items: { selection: ProductSelection; isMain: boolean }[] = [];
    if (card.main) items.push({ selection: card.main, isMain: true });
    if (mode.kind === 'group') {
      for (const selection of card.compares) items.push({ selection, isMain: false });
    }
    for (const item of items) {
      const key = `${item.selection.modelId}__${item.selection.romram.replace(/\s+/g, '')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ...item, cardId: card.id });
    }
  }
  return out;
}
```

- [x] **Step 4: 运行测试确认通过**

Run: `cd pricelens && npx vitest run src/pages/volume/__tests__/volumeView.test.ts`
Expected: 4 个测试全部通过。

- [ ] **Step 5: 提交**

```bash
git add pricelens/src/pages/volume/volumeView.ts pricelens/src/pages/volume/__tests__/volumeView.test.ts
git commit -m "feat: add volume view product selection model"
```

---

### Task 2: 将默认主产品视图与组内对比次级视图接入量价页

**Files:**
- Modify: `pricelens/src/pages/VolumePrice.tsx`（当前 `panelSpecs` 与面板渲染区域）
- Modify: `pricelens/src/pages/volume/volumeView.ts`
- Modify: `pricelens/src/pages/volume/__tests__/volumeView.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `VolumeViewMode`、`VolumeProductRef`、`volumeProductRefs`、`validVolumeViewMode`。
- Produces: 量价页局部 `viewMode` 状态；后续成本销毛集成继续使用同一个 `panelSpecs` 清单。

- [x] **Step 1: 增加失效组回退测试**

在 `volumeView.test.ts` 追加：

```ts
it('组内模式不读取其他组产品', () => {
  const rows = volumeProductRefs(cards, { kind: 'group', cardId: 'b' });
  expect(rows.map((r) => r.selection.modelId)).toEqual(['own-b', 'comp-b1']);
  expect(rows.some((r) => r.selection.modelId === 'comp-a1')).toBe(false);
});
```

- [x] **Step 2: 运行新增测试**

Run: `cd pricelens && npx vitest run src/pages/volume/__tests__/volumeView.test.ts`
Expected: 现有实现应通过；若去重或组过滤被后续修改破坏，必须先修纯函数再继续。

- [x] **Step 3: 用局部视图状态替换全量铺开**

在 `VolumePrice.tsx` 中：

```ts
const [viewMode, setViewMode] = useState<VolumeViewMode>({ kind: 'mains' });
const safeViewMode = validVolumeViewMode(state.mains, viewMode);

useEffect(() => {
  if (safeViewMode !== viewMode) setViewMode(safeViewMode);
}, [safeViewMode, viewMode]);
```

将现有 `panelSpecs` 的输入改为：

```ts
const refs = volumeProductRefs(state.mains, safeViewMode);
// 对每个 ref 继续调用现有 resolveSlot(ref.selection, cc)
// PanelSpec 保留 key/cardId/modelId/romram/isOwn/isMain/brand/name/skuIds/platform 原字段。
```

`resolveSlot`、SKU 去重、`buildSeries`、渠道回写和 `PanelSpec` 字段保持原样。`viewMode` 不进入 `FiltersState`，不写入 URL。

- [x] **Step 4: 添加组内入口、组切换和返回**

主视图中，仅当 `state.mains` 中对应卡存在对比产品时，在该主产品标题区显示：

```tsx
<button
  type="button"
  aria-label={`查看 ${p.name} 所在组的 ${compareCount} 款对比产品`}
  onClick={() => setViewMode({ kind: 'group', cardId: p.spec.cardId })}
>
  本组对比（{compareCount}）
</button>
```

组内视图顶部增加：

```tsx
<nav aria-label="组内对比切换">
  <button type="button" onClick={() => setViewMode({ kind: 'mains' })}>← 返回主产品视图</button>
  {state.mains.filter((card) => card.main).map((card, index) => (
    <button
      key={card.id}
      type="button"
      aria-pressed={safeViewMode.kind === 'group' && safeViewMode.cardId === card.id}
      onClick={() => setViewMode({ kind: 'group', cardId: card.id })}
    >
      第 {index + 1} 组
    </button>
  ))}
</nav>
```

- [x] **Step 5: 运行纯测试与类型检查**

Run: `cd pricelens && npx vitest run src/pages/volume/__tests__/volumeView.test.ts && npm run typecheck`
Expected: 测试通过，TypeScript 无新增错误。

- [x] **Step 6: 浏览器验证默认与次级视图**

验证：

1. 默认只见主产品，对比产品不出现。
2. 2、3 个主产品分别呈两栏、三栏。
3. 点击“本组对比（N）”只见该组主品与竞品。
4. 多组切换不会读到其他组产品。
5. 返回主产品视图后筛选器中的主品/对比选择未变化。
6. 切到价格走势再回量价，仍回主产品默认视图。

- [ ] **Step 7: 提交**

```bash
git add pricelens/src/pages/VolumePrice.tsx pricelens/src/pages/volume/volumeView.ts pricelens/src/pages/volume/__tests__/volumeView.test.ts
git commit -m "feat: make main products the default volume view"
```

---

### Task 3: 修正销量模拟的大促阶段与噪声约束

**Files:**
- Modify: `pricelens/src/dataModel/volume.ts`
- Modify: `pricelens/src/dataModel/__tests__/volume.golden.test.ts`

**Interfaces:**
- Consumes: 现有 `dimPromo`、`dimTime`、`hash01`、`promoFactor`、`volumeOfConfig`。
- Produces:
  - `PromoPhase = 'preheat' | 'peak' | 'aftermath'`
  - `promoPhaseOf(weekWed, promos)`
  - `promoPhaseFactor(phase)`
  - `volumeNoiseOf(key)`

- [x] **Step 1: 写大促阶段与噪声失败测试**

在 `volume.golden.test.ts` 追加：

```ts
import { promoPhaseFactor, promoPhaseOf, volumeNoiseOf } from '../volume';

describe('销量模拟 · 大促阶段与微扰', () => {
  const promo = { start_date: '2026-11-11', end_date: '2026-11-18' };

  it('预热、正式、结束后一周与无事件阶段明确', () => {
    expect(promoPhaseOf('2026-11-05', [promo])).toBe('preheat');
    expect(promoPhaseOf('2026-11-11', [promo])).toBe('peak');
    expect(promoPhaseOf('2026-11-20', [promo])).toBe('aftermath');
    expect(promoPhaseOf('2026-12-01', [promo])).toBeNull();
  });

  it('正式期不重复叠加阶段系数，结束后允许需求透支', () => {
    expect(promoPhaseFactor('preheat')).toBe(1.05);
    expect(promoPhaseFactor('peak')).toBe(1);
    expect(promoPhaseFactor('aftermath')).toBe(0.9);
    expect(promoPhaseFactor(null)).toBe(1);
  });

  it('噪声确定且限制在 ±3%', () => {
    const v = volumeNoiseOf('RU|model|rom|202631');
    expect(v).toBe(volumeNoiseOf('RU|model|rom|202631'));
    expect(v).toBeGreaterThanOrEqual(0.97);
    expect(v).toBeLessThanOrEqual(1.03);
  });

  it('可比条件下 Apple 与 Samsung 品牌基线均大于 Huawei', () => {
    expect(brandFactor('APPLE')).toBeGreaterThan(brandFactor('HUAWEI'));
    expect(brandFactor('SAMSUNG')).toBeGreaterThan(brandFactor('HUAWEI'));
  });
});
```

- [x] **Step 2: 运行测试确认失败**

Run: `cd pricelens && npx vitest run src/dataModel/__tests__/volume.golden.test.ts`
Expected: FAIL，新导出函数不存在。

- [x] **Step 3: 实现阶段函数并接入现有周销量**

新增：

```ts
export type PromoPhase = 'preheat' | 'peak' | 'aftermath';
export interface PromoWindow { start_date: string; end_date: string }

export function promoPhaseOf(weekWed: string, promos: readonly PromoWindow[]): PromoPhase | null {
  const t = Date.parse(`${weekWed}T00:00:00Z`);
  for (const promo of promos) {
    const start = Date.parse(`${promo.start_date}T00:00:00Z`);
    const end = Date.parse(`${promo.end_date}T00:00:00Z`);
    const day = 86_400_000;
    if (t >= start - 6 * day && t < start) return 'preheat';
    if (t >= start && t <= end) return 'peak';
    if (t > end && t <= end + 7 * day) return 'aftermath';
  }
  return null;
}

export function promoPhaseFactor(phase: PromoPhase | null): number {
  if (phase === 'preheat') return 1.05;
  if (phase === 'peak') return 1;
  if (phase === 'aftermath') return 0.9;
  return 1;
}

export function volumeNoiseOf(key: string): number {
  return 0.97 + 0.06 * hash01(key);
}
```

在 `volumeOfConfig` 中：

- 保留现有按国家、默认平台过滤促销和 `promoFactor(depth_hint)`。
- 对过滤后的促销调用 `promoPhaseOf(w.wed, applicablePromos)`，再乘 `promoPhaseFactor(phase)`。
- 将原 `0.92 + 0.16 * hash01(...)` 替换为 `volumeNoiseOf(...)`。
- 不修改事实在架约束、生命周期、折扣因子和月/季求和逻辑。

- [x] **Step 4: 运行销量测试并审查快照差异**

Run: `cd pricelens && npx vitest run src/dataModel/__tests__/volume.golden.test.ts`
Expected: 新测试通过；既有 24 周快照可能因新口径变化而失败，必须先打印并审查差异，不得直接全量更新。

Only after review:

Run: `cd pricelens && npx vitest run src/dataModel/__tests__/volume.golden.test.ts -u`
Expected: 快照仅包含已审查的大促阶段和噪声变化，确定性、非负整数、事实周约束与月求和测试继续通过。

- [ ] **Step 5: 提交**

```bash
git add pricelens/src/dataModel/volume.ts pricelens/src/dataModel/__tests__/volume.golden.test.ts pricelens/src/dataModel/__tests__/__snapshots__
git commit -m "feat: make volume simulation promotion-aware"
```

---

### Task 4: 新增确定性成本与销毛纯计算模型

**Files:**
- Create: `pricelens/src/pages/volume/marginCost.ts`
- Create: `pricelens/src/pages/volume/__tests__/marginCost.test.ts`

**Interfaces:**
- Consumes: `SeriesPoint`、`bucketIdOfDate`、`hash01`。
- Produces:
  - `MarginCostPoint`
  - `marginCostOf(input)`

- [x] **Step 1: 写恒等式、窗口稳定性与异常测试**

```ts
import { describe, expect, it } from 'vitest';
import type { SeriesPoint } from '../../../dataModel/types';
import { marginCostOf } from '../marginCost';

const point = (bucketId: string, anchorDate: string, price: number | null): SeriesPoint => ({
  bucketId, anchorDate, xLabel: bucketId, price, rrp: null,
  missing: price == null, offer: null, url: '', shopName: null,
});
const full = [
  point('202609', '2026-09-02', 1000),
  point('202610', '2026-09-09', 900),
  point('202611', '2026-09-16', 800),
  point('202612', '2026-09-23', null),
  point('202613', '2026-09-30', 1000),
  point('202614', '2026-10-07', 1100),
];
const input = { modelId: 'own-a', romram: '12+256 GB', countryCode: 'RU', points: full };

describe('marginCostOf', () => {
  it('满足销毛恒等式且所有点带模拟标识', () => {
    const rows = marginCostOf({ ...input, bucketIds: full.map((p) => p.bucketId) });
    for (const row of rows) {
      if (!row) continue;
      expect(row.unitMargin).toBeCloseTo(row.unitRevenue - row.unitCost, 8);
      expect(row.marginRate).toBeCloseTo(row.unitMargin / row.unitRevenue, 8);
      expect(row.simulated).toBe(true);
    }
  });

  it('同月形成平台且改变查看窗口不改变该月成本', () => {
    const all = marginCostOf({ ...input, bucketIds: full.map((p) => p.bucketId) });
    const sliced = marginCostOf({ ...input, bucketIds: ['202611', '202612', '202613'] });
    expect(all[2]?.unitCost).toBe(sliced[0]?.unitCost);
    expect(all[2]?.unitCost).toBe(all[3]?.unitCost);
    expect(all[2]?.unitCost).toBe(all[4]?.unitCost);
  });

  it('无有效价格的月份返回 null', () => {
    const rows = marginCostOf({ ...input, points: [point('202612', '2026-09-23', null)], bucketIds: ['202612'] });
    expect(rows).toEqual([null]);
  });

  it('收入低于成本时允许负销毛并保留零基线所需数值', () => {
    const crash = full.map((p, i) => i === full.length - 1 ? point(p.bucketId, p.anchorDate, 1) : p);
    const rows = marginCostOf({ ...input, points: crash, bucketIds: ['202614'] });
    expect(rows[0]?.unitMargin).toBeLessThan(0);
  });
});
```

- [x] **Step 2: 运行测试确认失败**

Run: `cd pricelens && npx vitest run src/pages/volume/__tests__/marginCost.test.ts`
Expected: FAIL，`marginCost.ts` 不存在。

- [x] **Step 3: 实现模型**

接口：

```ts
import { bucketIdOfDate } from '../../components/FilterBar/timeUtils';
import type { SeriesPoint } from '../../dataModel/types';
import { hash01 } from '../../dataModel/volume';

export interface MarginCostPoint {
  bucketId: string;
  monthId: string;
  unitRevenue: number;
  unitCost: number;
  unitMargin: number;
  marginRate: number;
  simulated: true;
}

export function marginCostOf(input: {
  modelId: string;
  romram: string;
  countryCode: string;
  points: readonly SeriesPoint[];
  bucketIds: readonly string[];
}): (MarginCostPoint | null)[]
```

实现要求：

1. 按 `bucketIdOfDate(new Date(point.anchorDate), 'month')` 归月。
2. 每月 `unitRevenue` 为该月有效 `point.price` 的算术平均值；无有效价格则该月为 null。若所有月份均无有效收入，直接返回 `bucketIds.map(() => null)`。
3. 用所有月份收入的**中位数**作为参考收入，避免窗口切片改变成本。
4. 产品参考成本比例：

```ts
const reference = median(monthlyRevenueValues);
const ratio = 0.68 + 0.08 * hash01(`${countryCode}|${modelId}|${romram}`);
const baseCost = reference * ratio;
```

5. 对排序后的月份下标 `i`：

```ts
const cost = baseCost
  * (1 - Math.min(0.12, i * 0.006))
  * (0.98 + 0.04 * hash01(`${countryCode}|${modelId}|${romram}|${monthId}`));
const unitMargin = unitRevenue - cost;
const marginRate = unitMargin / unitRevenue;
```

6. 对输入 `bucketIds`，返回对应桶所在月份的点；同月重复引用同一对象，天然形成月度阶梯。
7. 不根据当前窗口重新计算参考收入，不把 null 当 0，不限制负销毛。

- [x] **Step 4: 运行测试确认通过**

Run: `cd pricelens && npx vitest run src/pages/volume/__tests__/marginCost.test.ts`
Expected: 4 个测试全部通过。

- [ ] **Step 5: 提交**

```bash
git add pricelens/src/pages/volume/marginCost.ts pricelens/src/pages/volume/__tests__/marginCost.test.ts
git commit -m "feat: add deterministic margin and cost model"
```

---

### Task 5: 实现共享横向几何的成本销毛窄幅组件

**Files:**
- Create: `pricelens/src/pages/volume/marginCostGeometry.ts`
- Create: `pricelens/src/pages/volume/__tests__/marginCostGeometry.test.ts`
- Create: `pricelens/src/pages/volume/MarginCostBand.tsx`

**Interfaces:**
- Consumes: Task 4 的 `MarginCostPoint`、现有 `StripGeom`。
- Produces:
  - `marginCostDomainOf(points)`
  - `MarginCostBand` 组件及 `MARGIN_COST_BAND_HEIGHT = 144`。

- [x] **Step 1: 写纵轴域与阶梯几何测试**

```ts
import { describe, expect, it } from 'vitest';
import { marginCostDomainOf, monthStepSegmentsOf } from '../marginCostGeometry';

describe('margin cost geometry', () => {
  it('负销毛包含零基线且不把负值截掉', () => {
    const domain = marginCostDomainOf([
      { unitCost: 100, unitMargin: -20 },
      { unitCost: 120, unitMargin: 40 },
    ]);
    expect(domain.min).toBeLessThanOrEqual(-20);
    expect(domain.max).toBeGreaterThanOrEqual(120);
    expect(domain.zeroRatio).toBeGreaterThan(0);
    expect(domain.zeroRatio).toBeLessThan(1);
  });

  it('同月只画平台，跨月才产生垂直跳变', () => {
    const segments = monthStepSegmentsOf([
      { monthId: '202609', unitCost: 100, unitMargin: 20 },
      { monthId: '202609', unitCost: 100, unitMargin: 20 },
      { monthId: '202610', unitCost: 90, unitMargin: 30 },
    ]);
    expect(segments).toHaveLength(2);
    expect(segments[0].count).toBe(2);
    expect(segments[1].count).toBe(1);
  });
});
```

- [x] **Step 2: 运行测试确认失败**

Run: `cd pricelens && npx vitest run src/pages/volume/__tests__/marginCostGeometry.test.ts`
Expected: FAIL，几何函数不存在。

- [x] **Step 3: 实现纯几何函数**

接口：

```ts
export interface MarginCostDomain { min: number; max: number; zeroRatio: number }
export function marginCostDomainOf(
  points: readonly Pick<MarginCostPoint, 'unitCost' | 'unitMargin'>[],
): MarginCostDomain

export interface MonthStepSegment {
  monthId: string;
  startIndex: number;
  count: number;
  unitCost: number;
  unitMargin: number;
}
export function monthStepSegmentsOf(
  points: readonly Pick<MarginCostPoint, 'monthId' | 'unitCost' | 'unitMargin'>[],
): MonthStepSegment[]
```

`marginCostDomainOf` 同时收集成本与销毛，显式包含 0；空数组返回 `{ min: 0, max: 1, zeroRatio: 0 }`。`monthStepSegmentsOf` 只在 `monthId` 变化时开新段，不重采样、不平滑。

- [x] **Step 4: 实现 `MarginCostBand`**

组件接口：

```tsx
export const MARGIN_COST_BAND_HEIGHT = 144;

export default function MarginCostBand(props: {
  geom: StripGeom | null;
  points: readonly (MarginCostPoint | null)[];
  currency: 'local' | 'usd';
  hoverIdx: number | null;
  onHover: (index: number | null) => void;
  empty?: boolean;
}): JSX.Element
```

实现要求：

- 顶部标题为“成本与销毛（模拟）”。
- `empty` 或 `geom == null` 时，以相同 144px 高度显示“可显示，当前无数据”。
- 使用 `geom.plotLeft`、`geom.plotWidth`、`geom.n` 计算与主图一致的点中心。
- 成本画浅灰阶梯柱，销毛画深色阶梯线；仅跨月产生垂直跳变。
- 使用 `marginCostDomainOf` 绘制零基线。
- 当前 `hoverIdx` 点显示 `当月成本 / 当月单台销毛 / 销毛率`；无悬停时显示“移入查看当月成本与销毛”。
- `onHover` 只复用现有面板悬停链，不新增窗口或筛选状态。
- 不新增独立时间轴，不修改现有 `yCfg.plotHeight`。

- [x] **Step 5: 运行几何测试与类型检查**

Run: `cd pricelens && npx vitest run src/pages/volume/__tests__/marginCostGeometry.test.ts && npm run typecheck`
Expected: 测试通过，TypeScript 无新增错误。

- [ ] **Step 6: 提交**

```bash
git add pricelens/src/pages/volume/marginCostGeometry.ts pricelens/src/pages/volume/__tests__/marginCostGeometry.test.ts pricelens/src/pages/volume/MarginCostBand.tsx
git commit -m "feat: add aligned margin and cost band"
```

---

### Task 6: 将销量 Y 轴改为轻量刻度与按需编辑

**Files:**
- Modify: `pricelens/src/pages/volume/VolumeBars.tsx`
- Modify: `pricelens/src/pages/volume/volumeAxis.ts`
- Modify: `pricelens/src/pages/volume/__tests__/volumeAxis.test.ts`

**Interfaces:**
- Consumes: 现有 `AxisLimitInput`、`volumeRangeOf`、`commitVolumeAxisLimit`、`vMaxOf`。
- Produces: `volumeAxisClipOf(values, limits, autoMax)`；默认无框、点击后编辑的销量上限控件。

- [x] **Step 1: 写手动截断识别测试**

在 `volumeAxis.test.ts` 追加：

```ts
import { volumeAxisClipOf } from '../volumeAxis';

describe('volumeAxisClipOf', () => {
  it('手动上限低于数据最大值时必须提示截断', () => {
    expect(volumeAxisClipOf([500, 1200, null], { max: 1000 }, 2000)).toEqual({
      clipped: true,
      dataMax: 1200,
      effectiveMax: 1000,
    });
  });

  it('自动上限或手动上限覆盖数据时不提示截断', () => {
    expect(volumeAxisClipOf([500, 1200], { max: null }, 2000).clipped).toBe(false);
    expect(volumeAxisClipOf([500, 1200], { max: 1500 }, 2000).clipped).toBe(false);
  });

  it('空数据不提示截断', () => {
    expect(volumeAxisClipOf([null], { max: 1000 }, 2000).clipped).toBe(false);
  });
});
```

- [x] **Step 2: 运行测试确认失败**

Run: `cd pricelens && npx vitest run src/pages/volume/__tests__/volumeAxis.test.ts`
Expected: FAIL，`volumeAxisClipOf` 尚未导出。

- [x] **Step 3: 实现截断判断纯函数**

在 `volumeAxis.ts` 增加：

```ts
export interface VolumeAxisClip {
  clipped: boolean;
  dataMax: number;
  effectiveMax: number;
}

export function volumeAxisClipOf(
  values: readonly (number | null)[],
  limits: VolumeAxisLimits | null | undefined,
  autoMax: number,
): VolumeAxisClip {
  const dataMax = values.reduce((max, value) => value != null && Number.isFinite(value) ? Math.max(max, value) : max, 0);
  const effectiveMax = limits?.max ?? autoMax;
  return { clipped: dataMax > 0 && effectiveMax < dataMax, dataMax, effectiveMax };
}
```

保留 `volumeRangeOf` 和 `commitVolumeAxisLimit` 原行为，不改变零基线、柱高映射或图表高度。

- [x] **Step 4: 将轴线与刻度改为正常读轴**

在 `VolumeBars.tsx` 中：

- 将 3px 深灰竖线改为 1px 浅灰轴线。
- 顶部显示轴标题“销量（台）”。
- 按 `effectiveMax / 2 / 0` 显示顶部、中间、底部三个刻度与短刻度线。
- 删除常驻“最高值”文字与顶部输入框边框。
- 非编辑状态的上限值下方以 9–10px 灰字显示 `自动` 或 `手动`。
- `volumeAxisClipOf(...).clipped === true` 时显示“超出当前上限”，并给被截断柱子使用平直截断顶边和对应 `title`。

- [x] **Step 5: 将上限输入改为点击后编辑**

保留 `AxisLimitInput` 的数字提交逻辑，但外层增加编辑态：

```tsx
const [editing, setEditing] = useState(false);
const [snapshot, setSnapshot] = useState('');

if (!editing) {
  return (
    <button
      type="button"
      aria-label={`销量 Y 轴上限 ${Math.round(displayed)}，点击编辑`}
      title="点击编辑销量上限；清空恢复自动"
      onClick={() => {
        setSnapshot(String(Math.round(displayed)));
        setEditing(true);
      }}
    >
      {Math.round(displayed).toLocaleString('en-US')}
    </button>
  );
}
```

编辑时继续使用 `type="number"`：

- Enter/失焦提交并退出编辑态。
- Escape 恢复 `snapshot` 并退出，不提交。
- 清空后提交 `null`，恢复自动。
- 编辑与键盘聚焦时才显示细边框和全站焦点环，非编辑状态只显示普通等宽文字。
- 不增加拖杆或竖向滑块。

- [x] **Step 6: 运行测试与浏览器复核**

Run: `cd pricelens && npx vitest run src/pages/volume/__tests__/volumeAxis.test.ts && npm run typecheck`
Expected: 测试通过，TypeScript 无新增错误。

浏览器验证：

1. 默认显示 `2,000 / 1,000 / 0` 三档轻量刻度，无“最高值”边框。
2. 自动与手动状态可辨。
3. 点击上限后可编辑，Enter/失焦生效，Escape 不生效，清空恢复自动。
4. 手动上限低于数据峰值时出现“超出当前上限”及截断柱形。
5. 柱区高度、零基线和面板对齐不变。

- [ ] **Step 7: 提交**

```bash
git add pricelens/src/pages/volume/VolumeBars.tsx pricelens/src/pages/volume/volumeAxis.ts pricelens/src/pages/volume/__tests__/volumeAxis.test.ts
git commit -m "feat: simplify volume axis limit editing"
```

---

### Task 7: 将成本销毛带集成到主视图与组内对比视图

**Files:**
- Modify: `pricelens/src/pages/VolumePrice.tsx`（销量计算与面板渲染区域）
- Modify: `pricelens/src/pages/volume/marginCost.ts`
- Modify: `pricelens/src/pages/volume/__tests__/marginCost.test.ts`

**Interfaces:**
- Consumes: `marginCostOf`、`MarginCostBand`、`effWins`、`panelData`、`hoverIdxs`、`onHoverOf`。
- Produces: 每个面板与主图同源的成本销毛点及空态。

- [x] **Step 1: 增加数据可用性测试**

在 `marginCost.ts` 增加：

```ts
export function marginCostAvailabilityOf(
  isOwn: boolean,
  points: readonly (MarginCostPoint | null)[],
): 'ready' | 'empty' {
  return isOwn && points.some((point) => point != null) ? 'ready' : 'empty';
}
```

在 `marginCost.test.ts` 增加：

```ts
it('友商或全空序列显示空态，我方有效点为可展示', () => {
  expect(marginCostAvailabilityOf(false, [])).toBe('empty');
  expect(marginCostAvailabilityOf(true, [null])).toBe('empty');
  const rows = marginCostOf({ ...input, bucketIds: ['202614'] });
  expect(marginCostAvailabilityOf(true, rows)).toBe('ready');
});
```

- [x] **Step 2: 运行测试**

Run: `cd pricelens && npx vitest run src/pages/volume/__tests__/marginCost.test.ts`
Expected: 全部通过。

- [x] **Step 3: 生成各面板成本销毛序列**

在 `VolumePrice.tsx` 的 `panelData` 与 `effWins` 之后计算：

```ts
const marginCosts = panelData.map((panel, i) => {
  const ids = domainIds.slice(effWins[i][0], effWins[i][1] + 1);
  return marginCostOf({
    modelId: panel.spec.modelId,
    romram: panel.spec.romram,
    countryCode: cc,
    points: panel.series.flatMap((series) => series.points),
    bucketIds: ids,
  });
});
```

`points` 必须使用窗口切片前的完整 `panel.series`，保证改变窗口不会改变同一月参考成本。

- [x] **Step 4: 在主图之后、时间轨道之前插入窄幅组件**

```tsx
<MarginCostBand
  geom={geoms[p.idx] ?? null}
  points={marginCosts[p.idx]}
  currency={state.currency}
  hoverIdx={hoverIdxs[p.idx] ?? null}
  onHover={onHoverOf(p.idx)}
  empty={marginCostAvailabilityOf(p.spec.isOwn, marginCosts[p.idx]) === 'empty'}
/>
```

插入位置：现有 `Chart` 之后、现有 `PanelTimeTrack` 之前。不得移动或删除 `PeriodVolumePriceSummary`、`VolumeBars`、`Chart` 和 `PanelTimeTrack`。

- [x] **Step 5: 验证主视图与组内对比**

验证：

1. 每个主产品都能看到价格、销量、成本和销毛。
2. 上下图点中心、月份跳变和窗口起止一致。
3. 非同步面板各自窗口正确，不出现“上图 3 月、下图 6 月”。
4. 竞品区域显示“可显示，当前无数据”，无模拟成本。
5. 我方产品出现在对比区时按同一 `isOwn` 规则处理。
6. 负销毛有零基线；空月不产生伪造平台。
7. 2–3 个主产品没有共用成本系列或新增页面级横向溢出。
8. 区间摘要、渠道同步、面板拖序和销量轴设置无回归。

- [x] **Step 6: 运行相关测试与类型检查**

Run: `cd pricelens && npx vitest run src/pages/volume/__tests__ src/dataModel/__tests__/volume.golden.test.ts && npm run typecheck`
Expected: 全部通过。

- [ ] **Step 7: 提交**

```bash
git add pricelens/src/pages/VolumePrice.tsx pricelens/src/pages/volume/marginCost.ts pricelens/src/pages/volume/__tests__/marginCost.test.ts
git commit -m "feat: integrate margin and cost into volume panels"
```

---

### Task 8: 补齐口径说明、全量验证与单文件交付

**Files:**
- Modify: `pricelens/src/components/DataHelpModal.tsx`
- Modify: `PriceLens.html`（仅由现有构建流程生成）

**Interfaces:**
- Consumes: 前七项全部接口与现有 `npm run check` / `sync-single` 流程。
- Produces: 可交付的本地单文件版本。

- [x] **Step 1: 更新数据口径说明**

在现有时间与销量说明中补充：

- 主产品默认视图与组内对比次级视图的区别。
- “成本与销毛（模拟）”不是 OBS 或财务事实。
- `单台销毛额 = 单台收入 − 单台成本`。
- `销毛率 = 单台销毛额 ÷ 单台收入`。
- 月度成本销毛在周/月/季下的阶梯规则。
- 友商无成本数据时显示“可显示，当前无数据”，不填模拟值。
- 大促模拟使用实际促销日期区间与确定性微扰，销量仍为估算口径。
- 销量 Y 轴使用三档刻度；点击上限可编辑，Enter/失焦提交、Escape 取消、清空恢复自动；手动截断必须显示“超出当前上限”。

- [x] **Step 2: 运行聚焦测试**

Run: `cd pricelens && npx vitest run src/pages/volume/__tests__ src/dataModel/__tests__/volume.golden.test.ts`
Expected: 全部通过。

- [x] **Step 3: 运行项目标准检查**

Run: `cd pricelens && npm run check`
Expected: typecheck、verify、全部单测和 build 全通过；构建流程同步生成 `PriceLens.html`。

若并行会话仍在修改 `PriceLens.html` 或相关源码，先完成不冲突的任务并协调收口，不得用备份还原覆盖在途修改。

- [x] **Step 4: 执行真实浏览器验收**

桌面与 390px 分别验证：

1. 默认主产品视图、组内对比、组切换和返回。
2. 1、2、3 个主产品的面板布局。
3. 价格、销量、成本、销毛同屏可读，无四轴混排。
4. 周/月/季与平均价/最低价切换。
5. 顶部范围、图下窗口、同步/非同步与十字线联动。
6. 渠道切换、渠道同步恢复、币种切换。
7. 大促区间、负销毛、空月与竞品空态。
8. 键盘打开组内对比和平台筛选；读屏名称含产品上下文。
9. reduced-motion 下无高度或位移动画。
10. 现有区间量价摘要仍与当前选择区间一致。
11. 销量轴三档刻度、点击编辑、Escape 取消、清空回自动及手动截断提示。

- [x] **Step 5: 检查交付物与工作区**

Run: `git status --short`
Expected: 只有本迭代源代码、测试、文档及生成的 `PriceLens.html`；没有临时截图、日志或测试产物。

- [ ] **Step 6: 提交**

```bash
git add pricelens/src/components/DataHelpModal.tsx PriceLens.html docs/PriceLens-主产品经营视图与量价销毛成本设计定稿.md docs/superpowers/plans/2026-10-31-pricelens-main-product-margin-cost.md
git commit -m "feat: deliver main product margin and cost analysis"
```

## Final Acceptance Checklist

- [x] 默认只显示主产品；竞品仅在组内对比次级视图出现。
- [x] 多组切换与返回不改写全局筛选状态。
- [x] 每个面板同时呈现量、价、销毛、成本，且主图与成本销毛带层次清晰。
- [x] 成本销毛恒等式、月度阶梯、负销毛和空值处理全部通过测试。
- [x] Apple、Samsung 可比基线大于 Huawei；大促阶段确定、可解释、非随机。
- [x] 竞品成本不填假数据，空态为“可显示，当前无数据”。
- [x] 既有区间摘要、渠道、窗口、拖序和销量轴功能无回归。
- [x] 销量轴三档刻度清晰，点击编辑、Escape 取消、清空回自动与手动截断提示均通过验证。
- [x] `npm run check` 与真实浏览器验收通过，本地单文件版本已同步。
