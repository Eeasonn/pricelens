// ============================================================
// chartModel 金测（第十八轮）：把 17 轮迭代沉淀的纯计算行为钉住。
// 两类断言：
// 1) 不变量/语义测试——手造最小 fixture，逐条断言边界行为（端点 S/E/in/out、
//    避让 P0 必放、断轴分段、档位裁剪、option 形状、几何退化）；
// 2) 快照金测——真实造数（buildSeries 固定查询，确定性 PRNG）喂出的
//    labelPlan/option/刻度，toMatchSnapshot 钉死，任何行为漂移即红。
// ============================================================
import { describe, expect, it } from 'vitest';
import type { CurrencyMode, OfferInfo, Series, SeriesPoint } from '../../../dataModel/types';
import { GRID, NAME_ZONE_W, adaptiveRangeOf, computeYAxis, fmtAxisTick, gapAbsorbedIdx, gapRuns, panWindow, segTicks, seriesSpanRange, yPxOf, type Bucket, type YScale } from '../helpers';
import {
  buildEndpointBadges,
  buildEndpointMarks,
  buildGeom,
  buildLabelPlan,
  buildOfferMarkers,
  buildOption,
  buildTierBoxes,
  buildTickRows,
  curveNameOf,
  primaryPriceOf,
  scaleToDisplay,
} from '../chartModel';

const PT = (over: Partial<SeriesPoint> & { price: number | null }): SeriesPoint => ({
  bucketId: '202601',
  xLabel: '01-01',
  anchorDate: '2026-01-01',
  rrp: null,
  missing: false,
  offer: null,
  url: 'https://example.test',
  shopName: null,
  ...over,
});

const mkSeries = (over: Partial<Series> & { points: SeriesPoint[] }): Series => ({
  key: 's1',
  isOwn: true,
  brand: 'Acme',
  label: 'Acme Ultra 256GB',
  skuIds: ['a'],
  color: '#3b82f6',
  ...over,
});

const BOTH: { discounted: boolean; rrp: boolean } = { discounted: true, rrp: true };
const DISC_ONLY: { discounted: boolean; rrp: boolean } = { discounted: true, rrp: false };

const mkGeom = (scale: YScale, width = 1200, n = 12, totalH = 800, gridTop = 96): NonNullable<ReturnType<typeof buildGeom>> =>
  buildGeom({ width, totalH, gridTop, series: [mkSeries({ points: Array.from({ length: n }, (_, i) => PT({ price: 100 + i, bucketId: String(i) })) })], scale, currency: 'usd' })!;

// ---------------- buildGeom ----------------

describe('buildGeom', () => {
  it('窄容器/空数据/矮容器 → null（空态退化）', () => {
    const scale = computeYAxis({ series: [], priceTypes: DISC_ONLY, sliderScale: 1 });
    expect(buildGeom({ width: 100, totalH: 800, gridTop: 96, series: [mkSeries({ points: [PT({ price: 1 })] })], scale, currency: 'usd' })).toBeNull();
    expect(buildGeom({ width: 1200, totalH: 800, gridTop: 96, series: [], scale, currency: 'usd' })).toBeNull();
    expect(buildGeom({ width: 1200, totalH: 100, gridTop: 96, series: [mkSeries({ points: [PT({ price: 1 })] })], scale, currency: 'usd' })).toBeNull();
  });

  it('左缘放不下（gridLeft+right > width-48）→ null（图例卡回退几何接管）', () => {
    const scale = computeYAxis({ series: [], priceTypes: DISC_ONLY, sliderScale: 1 });
    // width=170：estGridLeft(USD) = 64+8+tickW+148 > 170-48
    expect(buildGeom({ width: 170, totalH: 800, gridTop: 96, series: [mkSeries({ points: [PT({ price: 1 })] })], scale, currency: 'usd' })).toBeNull();
  });

  it('几何自洽：plotWidth = width - gridLeft - right；plotTop = gridTop', () => {
    const scale = computeYAxis({ series: [], priceTypes: DISC_ONLY, sliderScale: 1 });
    const g = mkGeom(scale, 1200, 12, 800, 96);
    expect(g.plotTop).toBe(96);
    expect(g.plotWidth).toBe(1200 - g.gridLeft - GRID.right);
  });
});

// ---------------- buildEndpointMarks（第十三~十五轮语义） ----------------

describe('buildEndpointMarks', () => {
  it('S = 连续有值区间的首点（前 2 周无值；1 周断采视为连续）', () => {
    // 前 2 周无值 → i=2 是 S；i=1 有值 → i=0 无标记（除 edgeStart）
    const s = mkSeries({
      points: [PT({ price: null }), PT({ price: null }), PT({ price: 10 }), PT({ price: 11 })],
      edgeStart: false,
      edgeEnd: false,
    });
    const m = buildEndpointMarks([s]);
    expect(m.get('s1|2')).toBe('S');
    expect(m.has('s1|0')).toBe(false);
    expect(m.has('s1|1')).toBe(false);
  });

  it('1 周断采不打断起点判定（i=1 前仅 1 周无值）', () => {
    const s = mkSeries({
      points: [PT({ price: null }), PT({ price: 10 }), PT({ price: 11 })],
      edgeStart: false,
      edgeEnd: false,
    });
    expect(buildEndpointMarks([s]).get('s1|1')).toBe('S');
  });

  it('E = 段尾且其后连续 3 个区间无值；观察不足 3 区间（数据末端）不标 E（第十五轮）', () => {
    // i=3 之后 i4/i5/i6 无值 → E
    const long = mkSeries({
      points: [PT({ price: 10 }), PT({ price: 11 }), PT({ price: 12 }), PT({ price: 13 }), PT({ price: null }), PT({ price: null }), PT({ price: null })],
      edgeStart: false,
      edgeEnd: false,
    });
    expect(buildEndpointMarks([long]).get('s1|3')).toBe('E');
    // i=2 之后只剩 2 个无值区间 → 不标 E
    const short = mkSeries({
      points: [PT({ price: 10 }), PT({ price: 11 }), PT({ price: 12 }), PT({ price: null }), PT({ price: null })],
      edgeStart: false,
      edgeEnd: false,
    });
    expect(buildEndpointMarks([short]).has('s1|2')).toBe(false);
  });

  it('in/out = 窗口边缘续接点：edgeStart 优先于 S；edgeEnd 只作用于末点且优先于 E', () => {
    const s = mkSeries({
      points: [PT({ price: 10 }), PT({ price: 11 }), PT({ price: null }), PT({ price: 50 }), PT({ price: 60 })],
      edgeStart: true,
      edgeEnd: true,
    });
    const m = buildEndpointMarks([s]);
    expect(m.get('s1|0')).toBe('in'); // edgeStart 优先于 S
    expect(m.get('s1|4')).toBe('out'); // 末点有值 + edgeEnd → out（i===n-1 分支优先于 en）
    expect(m.has('s1|3')).toBe(false); // 段中间点无标记
  });
});

// ---------------- buildLabelPlan（P0 必放 + 避让语义） ----------------

describe('buildLabelPlan', () => {
  const scale = computeYAxis({
    series: [mkSeries({ points: Array.from({ length: 12 }, (_, i) => PT({ price: 100 + i * 10 })) })],
    priceTypes: DISC_ONLY,
    sliderScale: 1,
  });
  const geom = mkGeom(scale, 1200, 12, computeYAxis({ series: [mkSeries({ points: Array.from({ length: 12 }, (_, i) => PT({ price: 100 + i * 10 })) })], priceTypes: DISC_ONLY, sliderScale: 1 }).plotHeight + 96 + GRID.bottom);

  it('首/末/最大/最小四个 P0 锚点必放（dy 表中可见）', () => {
    const pts = Array.from({ length: 12 }, (_, i) => PT({ price: 100 + i * 10 }));
    const plan = buildLabelPlan({ geom, series: [mkSeries({ points: pts })], granularity: 'month', priceTypes: DISC_ONLY, endpointMarks: new Map() });
    const dy = plan.dy['s1'] ?? {};
    expect(Object.keys(dy).length).toBeGreaterThanOrEqual(2);
    expect(dy[0]).toBeDefined(); // 首
    expect(dy[11]).toBeDefined(); // 末（同时是最大）
  });

  it('S/E 标记点必放数值标签（E 未必是首末/极值，第二十轮）', () => {
    // 两段：10,10,10 在 i=2 截止（其后 3 区间无值）→ E；同价连续周 → i=2 不在变价集，
    // 且非首(0)/末(7)/最大(6)/最小(0)——无标记时不产生标签
    const pts = [
      PT({ price: 10 }),
      PT({ price: 10 }),
      PT({ price: 10 }),
      PT({ price: null }),
      PT({ price: null }),
      PT({ price: null }),
      PT({ price: 50 }),
      PT({ price: 40 }),
    ];
    const s = mkSeries({ points: pts, edgeStart: false, edgeEnd: false });
    const marks = buildEndpointMarks([s]);
    expect(marks.get('s1|2')).toBe('E');
    const planBare = buildLabelPlan({ geom, series: [s], granularity: 'week', priceTypes: DISC_ONLY, endpointMarks: new Map() });
    expect((planBare.dy['s1'] ?? {})[2]).toBeUndefined();
    const plan = buildLabelPlan({ geom, series: [s], granularity: 'week', priceTypes: DISC_ONLY, endpointMarks: marks });
    expect((plan.dy['s1'] ?? {})[2]).toBeDefined();
  });

  it('确定性：同输入两次调用输出一致（deep equal）', () => {
    const pts = Array.from({ length: 30 }, (_, i) => PT({ price: 500 + ((i * 37) % 400), bucketId: `2026W${i}` }));
    const a = buildLabelPlan({ geom, series: [mkSeries({ points: pts })], granularity: 'week', priceTypes: BOTH, endpointMarks: new Map() });
    const b = buildLabelPlan({ geom, series: [mkSeries({ points: pts })], granularity: 'week', priceTypes: BOTH, endpointMarks: new Map() });
    expect(a).toEqual(b);
  });

  it('geom 为 null → 空计划（不抛错）', () => {
    expect(buildLabelPlan({ geom: null, series: [], granularity: 'week', priceTypes: BOTH, endpointMarks: new Map() })).toEqual({ dy: {}, names: [] });
  });

  it('系列名：起点旁有空间 → beside（右缘锚在起点左侧）；名宽溢出 → 停驻名称预留带', () => {
    const pts = [PT({ price: 500 }), PT({ price: 505 })];
    const s = mkSeries({ points: pts });
    const plan = buildLabelPlan({ geom, series: [s], granularity: 'month', priceTypes: DISC_ONLY, endpointMarks: new Map() });
    expect(plan.names).toHaveLength(1);
    // 短名 + 起点靠内：besideLeft = px - 8 - nw ≥ zoneLeft → 停在起点旁
    const px = geom.plotLeft + (geom.plotWidth / geom.n) * 0.5;
    const nw = 12 + plan.names[0].text.length * (13 * 0.62) + 6;
    expect(plan.names[0].x).toBeCloseTo(px - 8 - nw, 6);
    // 长名（20+ 字符）：besideLeft < zoneLeft → 收进预留带，x = zoneLeft
    const long = mkSeries({ points: pts, label: 'Acme Galaxy Ultra Pro Max Plus 256GB' });
    const planLong = buildLabelPlan({ geom, series: [long], granularity: 'month', priceTypes: DISC_ONLY, endpointMarks: new Map() });
    expect(planLong.names[0].x).toBe(geom.plotLeft - NAME_ZONE_W + 4);
    expect(planLong.names[0].maxW).toBeDefined(); // 两行换行态
  });
});

// ---------------- buildOption（option 形状金测） ----------------

describe('buildOption', () => {
  it('geom/series 为空 → null', () => {
    expect(buildOption({ geom: null, series: [], priceTypes: BOTH, granularity: 'week', labelPlan: { dy: {}, names: [] }, gridTop: 96, endpointMarks: new Map() })).toBeNull();
  });

  it('折后价+缺采跨接：主线 + 虚线桥（第二十四轮撤销空心点系列）；端点标记点 symbolSize=0（隐符号不吞标签）', () => {
    const pts = [
      PT({ price: 100 }),
      PT({ price: null, missing: true }),
      PT({ price: 120 }),
      PT({ price: 130 }),
      PT({ price: null }),
      PT({ price: null }),
      PT({ price: null }),
    ];
    const s = mkSeries({ points: pts, edgeStart: false, edgeEnd: false });
    const scale = computeYAxis({ series: [s], priceTypes: DISC_ONLY, sliderScale: 1 });
    const geom = mkGeom(scale, 1200, 7, scale.plotHeight + 96 + GRID.bottom, 96);
    const marks = buildEndpointMarks([s]);
    const option = buildOption({ geom, series: [s], priceTypes: DISC_ONLY, granularity: 'week', labelPlan: buildLabelPlan({ geom, series: [s], granularity: 'week', priceTypes: DISC_ONLY, endpointMarks: marks }), gridTop: 96, endpointMarks: marks })!;
    const seriesArr = option.series as Record<string, unknown>[];
    // 1 主线 + 1 桥（缺采段 i1..i1 两侧有值）；空心插值点系列已撤销（第二十四轮）
    expect(seriesArr).toHaveLength(2);
    expect(seriesArr[0].type).toBe('line');
    expect(seriesArr[1].type).toBe('line');
    // 端点标记点（i=0 是 S）：symbolSize 0 隐符号（第二十轮修复：symbol 'none' 会连
    // 数值标签一起被 ECharts 吞掉），标签照常输出
    const mainData = seriesArr[0].data as { symbolSize?: number; label?: { show: boolean } }[];
    expect(mainData[0].symbolSize).toBe(0);
    expect(mainData[1].symbolSize).toBeUndefined();
    expect(mainData[0].label?.show).toBe(true);
  });

  it('值轴隐藏 + category 轴 + grid 固定边距（DOM 层同源几何的根基）', () => {
    const s = mkSeries({ points: [PT({ price: 100 }), PT({ price: 110 })] });
    const scale = computeYAxis({ series: [s], priceTypes: DISC_ONLY, sliderScale: 1 });
    const geom = mkGeom(scale, 1200, 2, scale.plotHeight + 96 + GRID.bottom, 96);
    const option = buildOption({ geom, series: [s], priceTypes: DISC_ONLY, granularity: 'week', labelPlan: { dy: {}, names: [] }, gridTop: 96, endpointMarks: new Map() })!;
    expect((option.yAxis as { show: boolean }).show).toBe(false);
    expect((option.xAxis as { type: string }).type).toBe('category');
    expect((option.grid as { top: number }).top).toBe(96);
  });
});

// ---------------- DOM 覆盖层数据（刻度/档位/徽标/offer） ----------------

describe('buildTickRows / buildTierBoxes / badges / offer', () => {
  const own = mkSeries({
    key: 'own',
    points: Array.from({ length: 10 }, (_, i) => PT({ price: 250 + i * 5, rrp: 300 })),
  });
  const comp = mkSeries({
    key: 'comp',
    isOwn: false,
    points: Array.from({ length: 10 }, (_, i) => PT({ price: 650 + i * 5, rrp: 700 })),
  });
  const scale = computeYAxis({ series: [own, comp], priceTypes: BOTH, sliderScale: 1 });
  const geom = mkGeom(scale, 1400, 10, scale.plotHeight + 96 + GRID.bottom, 96);

  it('刻度行：v 为段内 interval 整数倍，且 y 与 yPxOf 同源（分段映射一致性）', () => {
    const rows = buildTickRows(geom);
    expect(rows.length).toBeGreaterThan(3);
    for (const r of rows) {
      expect(Math.abs(r.v / scale.interval - Math.round(r.v / scale.interval))).toBeLessThan(1e-6);
      expect(r.y).toBeCloseTo(yPxOf(geom, r.v), 6);
      expect(r.y).toBeGreaterThanOrEqual(geom.plotTop - 1e-6);
      expect(r.y).toBeLessThanOrEqual(geom.plotTop + geom.plotHeight + 1e-6);
    }
  });

  it('档位带：有数据的档才画，框绝对坐标完整落在某一段的绝对区间内', () => {
    const tierValues = [...own.points.map((p) => p.price!), ...comp.points.map((p) => p.price!)];
    const boxes = buildTierBoxes({ enabled: true, geom, tierValues });
    const labels = new Set(boxes.map((b) => b.label));
    expect(labels.has('200~400')).toBe(true);
    expect(labels.has('600~800')).toBe(true);
    expect(labels.has('<200')).toBe(false);
    expect(labels.has('1000+')).toBe(false);
    // yPxOf 是绝对坐标（含 plotTop），seg.pTop/pH 是相对绘图区顶的相对坐标
    for (const b of boxes) {
      const inSeg = scale.segs.some(
        (s) =>
          b.top >= geom.plotTop + s.pTop - 1e-6 && b.top + b.h <= geom.plotTop + s.pTop + s.pH + 1e-6,
      );
      expect(inSeg).toBe(true);
    }
  });

  it('端点徽标几何与标记表一致；offer 图标按 title 去重取首周', () => {
    const marks = buildEndpointMarks([own]);
    const badges = buildEndpointBadges({ geom, series: [own], marks, priceTypes: BOTH });
    expect(badges).toHaveLength(marks.size);
    const offer: OfferInfo = { title: '双11', text: 'x', endDate: '2026-11-11', remainingDays: 30, platforms: ['Ozon'] };
    const pts = own.points.map((p, i) => (i === 3 || i === 7 ? { ...p, offer } : p));
    const markers = buildOfferMarkers({ enabled: true, geom, series: [mkSeries({ points: pts })] });
    expect(markers).toHaveLength(1); // 同 title 只取首周
    expect(buildOfferMarkers({ enabled: false, geom, series: [mkSeries({ points: pts })] })).toHaveLength(0);
  });
});

// ---------------- Y 轴稳定性（第十/十一轮用户反馈的根因回归） ----------------

describe('computeYAxis 稳定性', () => {
  const base = Array.from({ length: 20 }, (_, i) => PT({ price: 5000 + i * 100 }));
  const s1 = mkSeries({ points: base });
  const it1 = computeYAxis({ series: [s1], priceTypes: DISC_ONLY, sliderScale: 1 }).interval;

  it('小漂移（±2%）不换步长（步长滞回）', () => {
    const drifted = base.map((p) => ({ ...p, price: p.price != null ? Math.round(p.price * 1.02) : null }));
    const s2 = mkSeries({ points: drifted });
    const next = computeYAxis({ series: [s2], priceTypes: DISC_ONLY, sliderScale: 1, prev: computeYAxis({ series: [s1], priceTypes: DISC_ONLY, sliderScale: 1 }) });
    expect(next.interval).toBe(it1);
  });

  it('同输入两次调用逐字节一致（确定性契约）', () => {
    const a = computeYAxis({ series: [s1], priceTypes: BOTH, sliderScale: 1.5 });
    const b = computeYAxis({ series: [s1], priceTypes: BOTH, sliderScale: 1.5 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('值簇中段大空白（跨系列）→ 压断轴（分段映射）', () => {
    // 两个系列各占一段值域（低簇 100..140 / 高簇 5000..5040）：簇间无人区才可断轴
    const low = mkSeries({ key: 'low', points: Array.from({ length: 5 }, (_, i) => PT({ price: 100 + i * 10 })) });
    const high = mkSeries({ key: 'high', points: Array.from({ length: 5 }, (_, i) => PT({ price: 5000 + i * 10 })) });
    const scale = computeYAxis({ series: [low, high], priceTypes: DISC_ONLY, sliderScale: 1 });
    expect(scale.segs.length).toBe(2);
    expect(scale.breaks.length).toBe(1);
  });

  it('单系列自身轨迹内不产生断轴（第二十一轮：曲线连续经过中间值）', () => {
    // 同一条曲线先低后高（100..140 → 5000..5040）：旧口径按值点空隙会断轴，新口径
    // 每系列占自身 [min,max]——自身高低差不属于"无人区"，永不断
    const dive = mkSeries({
      points: [
        ...Array.from({ length: 5 }, (_, i) => PT({ price: 100 + i * 10 })),
        ...Array.from({ length: 5 }, (_, i) => PT({ price: 5000 + i * 10 })),
      ],
    });
    const scale = computeYAxis({ series: [dive], priceTypes: DISC_ONLY, sliderScale: 1 });
    expect(scale.segs.length).toBe(1);
    expect(scale.breaks).toHaveLength(0);
  });

  it('allowBreak=false → 单段连续轴（Y 轴自动压缩关，无断点）', () => {
    const low = mkSeries({ key: 'low', points: Array.from({ length: 5 }, (_, i) => PT({ price: 100 + i * 10 })) });
    const high = mkSeries({ key: 'high', points: Array.from({ length: 5 }, (_, i) => PT({ price: 5000 + i * 10 })) });
    const on = computeYAxis({ series: [low, high], priceTypes: DISC_ONLY, sliderScale: 1 });
    const off = computeYAxis({ series: [low, high], priceTypes: DISC_ONLY, sliderScale: 1, allowBreak: false });
    expect(on.segs.length).toBe(2);
    expect(off.segs.length).toBe(1);
    expect(off.breaks).toHaveLength(0);
    // 连续轴仍是分段映射的退化形态：yPxOf 单调、全域覆盖
    expect(off.plotHeight).toBeGreaterThan(0);
    expect(off.segs[0].min).toBeLessThanOrEqual(100);
    expect(off.segs[0].max).toBeGreaterThanOrEqual(5040);
  });

  it('单值退化（恒定价一条线，如稳定 RRP）：轴撑开最小跨度，刻度不再同名', () => {
    const flat = mkSeries({ points: Array.from({ length: 6 }, () => PT({ price: 875 })) });
    const scale = computeYAxis({ series: [flat], priceTypes: DISC_ONLY, sliderScale: 1 });
    const ticks = scale.segs.flatMap((s) => segTicks(s, scale.interval));
    expect(new Set(ticks).size).toBeGreaterThan(1);
    expect(scale.segs.length).toBe(1);
  });
});

// ---------------- 断轴压缩不自反（第二十二轮用户反馈的根因回归） ----------------
// 旧根因：压缩让伪跨度变小 → 就近档随之 100→50 → 格数 4.65→7.33、图高反增 208px，
// 且 fmtAxisShort 固定 1 位小数把 1050/1100/1150 三个刻度全部显示成 1.1K。

describe('断轴压缩（第二十二轮回归）', () => {
  // 截图场景：iPhone 1195..1250 / Galaxy 1078..1125 / Pura 835..875（USD）
  const iphone = mkSeries({ key: 'ip', points: [1195, 1226, 1201, 1200, 1195, 1200].map((price) => PT({ price })) });
  const galaxy = mkSeries({ key: 'gx', isOwn: false, points: [1125, 1094, 1078, 1085].map((price) => PT({ price })) });
  const pura = mkSeries({ key: 'pp', isOwn: false, points: [875, 844, 835].map((price) => PT({ price })) });
  const both3 = [iphone, galaxy, pura];

  it('压缩后的图高不高于连续轴（压缩只回收空白像素，步长不细于连续档）', () => {
    const on = computeYAxis({ series: both3, priceTypes: DISC_ONLY, sliderScale: 1, allowBreak: true });
    const off = computeYAxis({ series: both3, priceTypes: DISC_ONLY, sliderScale: 1, allowBreak: false });
    expect(on.segs.length).toBeGreaterThan(1);
    expect(on.plotHeight).toBeLessThanOrEqual(off.plotHeight);
    expect(on.interval).toBeGreaterThanOrEqual(off.interval); // 不细于连续轴档位
  });

  it('刻度文案不塌缩：压缩/连续两态下任意两刻度的缩写文案互不相同', () => {
    for (const allowBreak of [true, false]) {
      const scale = computeYAxis({ series: both3, priceTypes: DISC_ONLY, sliderScale: 1, allowBreak });
      const ticks = scale.segs.flatMap((s) => segTicks(s, scale.interval));
      const texts = ticks.map((v) => fmtAxisTick(v, scale.interval));
      expect(new Set(texts).size).toBe(texts.length);
    }
  });

  it('fmtAxisTick 步长感知：50 步长在 K 级用两位小数（1.05K/1.1K/1.15K/1.25K），RUB 常规步长输出不变', () => {
    expect(fmtAxisTick(1250, 50)).toBe('1.25K');
    expect(fmtAxisTick(1150, 50)).toBe('1.15K');
    expect(fmtAxisTick(1100, 50)).toBe('1.1K');
    expect(fmtAxisTick(1050, 50)).toBe('1.05K');
    expect(fmtAxisTick(1000, 50)).toBe('1K');
    expect(fmtAxisTick(800, 100)).toBe('800');
    expect(fmtAxisTick(62000, 10000)).toBe('62K');
    expect(fmtAxisTick(62500, 2500)).toBe('62.5K');
    expect(fmtAxisTick(1250000, 250000)).toBe('1.25M');
    expect(fmtAxisTick(1250, 0)).toBe('1.3K'); // interval 缺省退化为旧版 1 位小数
  });
});

// ---------------- 币种档位锚定（第二十三轮用户反馈的根因回归） ----------------
// 旧根因：niceStep 档位量化对不同币种不成比例——同一数据 USD 直接取档 100，
// RUB 值×80 后直接取档却得 5K（=62.5 USD/格），格数 5→8、图高 460→736 显"拉伸"。

describe('币种档位锚定（perUsd）', () => {
  const iphone = mkSeries({ key: 'ip', points: [1195, 1226, 1201, 1200, 1195, 1200].map((price) => PT({ price })) });
  const galaxy = mkSeries({ key: 'gx', isOwn: false, points: [1125, 1094, 1078, 1085].map((price) => PT({ price })) });
  const pura = mkSeries({ key: 'pp', isOwn: false, points: [875, 844, 835].map((price) => PT({ price })) });
  const usd3 = [iphone, galaxy, pura];
  const RUB = 80;
  const rub3 = usd3.map((s) => ({
    ...s,
    points: s.points.map((p) => ({ ...p, price: p.price == null ? null : p.price * RUB })),
  }));
  const base = { sliderScale: 1 } as const;

  it('RUB（×80）与 USD 同数据：档位 = USD 档×80 吸附本币档（100→10K），格数/图高一致', () => {
    const usd = computeYAxis({ series: usd3, priceTypes: DISC_ONLY, ...base, allowBreak: false });
    const rub = computeYAxis({ series: rub3, priceTypes: DISC_ONLY, ...base, allowBreak: false, perUsd: RUB });
    expect(usd.interval).toBe(100);
    expect(rub.interval).toBe(10000); // 100×80=8000 → 吸附本币 nice 档 10K（旧版直接取档 5K）
    expect(rub.cells).toBe(usd.cells);
    expect(rub.plotHeight).toBe(usd.plotHeight);
    // 刻度文案互异且量级正确
    const texts = rub.segs.flatMap((s) => segTicks(s, rub.interval)).map((v) => fmtAxisTick(v, rub.interval));
    expect(new Set(texts).size).toBe(texts.length);
    expect(texts).toContain('70K');
  });

  it('断轴态同样锚定：压缩后格数/图高与 USD 压缩态一致', () => {
    const usdOn = computeYAxis({ series: usd3, priceTypes: DISC_ONLY, ...base, allowBreak: true });
    const rubOn = computeYAxis({ series: rub3, priceTypes: DISC_ONLY, ...base, allowBreak: true, perUsd: RUB });
    expect(usdOn.segs.length).toBe(2);
    expect(rubOn.segs.length).toBe(usdOn.segs.length); // 断轴判定在 USD 空间，币种无关
    expect(rubOn.interval).toBe(10000); // niceStep(100×80)=10K，非精确 ×80
    expect(rubOn.cells).toBe(usdOn.cells);
    expect(rubOn.plotHeight).toBe(usdOn.plotHeight);
  });

  it('perUsd 缺省（=1）与旧行为逐字节一致；非正值同缺省', () => {
    const plain = computeYAxis({ series: usd3, priceTypes: DISC_ONLY, ...base });
    const explicit = computeYAxis({ series: usd3, priceTypes: DISC_ONLY, ...base, perUsd: 1 });
    const guarded = computeYAxis({ series: usd3, priceTypes: DISC_ONLY, ...base, perUsd: 0 });
    expect(JSON.stringify(plain)).toBe(JSON.stringify(explicit));
    expect(JSON.stringify(plain)).toBe(JSON.stringify(guarded));
  });
});

// ---------------- 缺采跨接·孤立有值周吸收（第二十四轮用户口径回归） ----------------
// 用户口径：虚线跨接段中间不应残留任何数据点——两侧缺采夹一个有价周（如 iPhone 17
// 8+256 @202620）时，该周并入缺采段：不画点、不放数值标签、两段短桥合并为一条整桥。

describe('缺采跨接·孤立点吸收', () => {
  const ok = (price: number): SeriesPoint => PT({ price });
  const miss = (): SeriesPoint => PT({ price: null, missing: true });

  it('gapAbsorbedIdx：两侧缺采的有值周被吸收；首末有值点与 ≤2 有值点系列不吸收', () => {
    expect([...gapAbsorbedIdx([ok(100), miss(), ok(110), miss(), ok(120)])]).toEqual([2]);
    // 链式 M-o-M-o-M：迭代吸收到不动点
    expect([...gapAbsorbedIdx([ok(100), miss(), ok(110), miss(), ok(120), miss(), ok(130)])]).toEqual([2, 4]);
    // 首个/末个有值点不吸收（M-o-M-o-M 两端只有 2 个有值点）
    expect(gapAbsorbedIdx([miss(), ok(100), miss(), ok(110), miss()]).size).toBe(0);
    // 两侧有值 → 不吸收；缺采不夹孤立点 → 空集
    expect(gapAbsorbedIdx([ok(100), miss(), ok(110), ok(120), miss(), ok(130)]).size).toBe(0);
  });

  it('gapRuns：吸收后两段短桥合并为一条整桥（[ok M ok M ok] → 单一 run [1,3]）', () => {
    expect(gapRuns([ok(100), miss(), ok(110), miss(), ok(120)])).toEqual([[1, 3]]);
    expect(gapRuns([ok(100), miss(), ok(110), ok(120), miss(), ok(130)])).toEqual([[1, 1], [4, 4]]);
  });

  it('buildOption/labelPlan：孤立周 symbolSize=0、无数值标签，跨接桥只此一条', () => {
    const pts = [ok(100), miss(), ok(110), miss(), ok(120)];
    const s = mkSeries({ points: pts, edgeStart: false, edgeEnd: false });
    const scale = computeYAxis({ series: [s], priceTypes: DISC_ONLY, sliderScale: 1 });
    const geom = mkGeom(scale, 1200, 5, scale.plotHeight + 96 + GRID.bottom, 96);
    const marks = buildEndpointMarks([s]);
    const plan = buildLabelPlan({ geom, series: [s], granularity: 'week', priceTypes: DISC_ONLY, endpointMarks: marks });
    const option = buildOption({ geom, series: [s], priceTypes: DISC_ONLY, granularity: 'week', labelPlan: plan, gridTop: 96, endpointMarks: marks })!;
    const seriesArr = option.series as Record<string, unknown>[];
    // 1 主线 + 1 条合并整桥（i0→i4），不再有别的系列
    expect(seriesArr).toHaveLength(2);
    const mainData = seriesArr[0].data as { symbolSize?: number; label?: { show: boolean } }[];
    expect(mainData[2].symbolSize).toBe(0); // 孤立周不画点
    expect((plan.dy['s1'] ?? {})[2]).toBeUndefined(); // 也不放数值标签
  });
});

// ---------------- 小件 ----------------

describe('小件', () => {
  it('curveNameOf 去品牌前缀 + 去 GB/TB 后缀（容量数字保留，如 12+256）', () => {
    expect(curveNameOf(mkSeries({ label: 'Acme Ultra 256GB', points: [] }))).toBe('Ultra 256');
    expect(curveNameOf(mkSeries({ label: 'Acme Pro Max 1TB', points: [] }))).toBe('Pro Max 1');
    expect(curveNameOf(mkSeries({ label: 'Acme Ultra 12+256 GB', points: [] }))).toBe('Ultra 12+256');
    expect(curveNameOf(mkSeries({ label: '无品牌前缀', points: [] }))).toBe('无品牌前缀');
  });

  it('primaryPriceOf：折后价优先；仅 RRP 时为主价', () => {
    const p = PT({ price: 100, rrp: 200 });
    expect(primaryPriceOf(p, BOTH)).toBe(100);
    expect(primaryPriceOf(p, { discounted: false, rrp: true })).toBe(200);
  });

  it('scaleToDisplay：k=1 原样返回；k<1 等比缩放段几何与断轴中心', () => {
    // 双系列跨值域（低簇/高簇）才有断轴；单系列自身轨迹内不断轴（第二十一轮口径）
    const low = mkSeries({ key: 'low', points: Array.from({ length: 5 }, (_, i) => PT({ price: 100 + i * 10 })) });
    const high = mkSeries({ key: 'high', points: Array.from({ length: 5 }, (_, i) => PT({ price: 5000 + i * 10 })) });
    const scale = computeYAxis({ series: [low, high], priceTypes: DISC_ONLY, sliderScale: 1 });
    expect(scale.breaks.length).toBe(1);
    expect(scaleToDisplay(scale, 1)).toBe(scale);
    const half = scaleToDisplay(scale, 0.5);
    expect(half.plotHeight).toBeCloseTo(scale.plotHeight * 0.5, 6);
    expect(half.breaks[0]).toBeCloseTo(scale.breaks[0] * 0.5, 6);
    expect(half.segs[0].pTop).toBeCloseTo(scale.segs[0].pTop * 0.5, 6);
  });
});

// ---------------- 时间自适应（第十九轮：可选范围 = 所选产品跨度 ±2，钳数据全集） ----------------

const mkBuckets = (n: number): Bucket[] =>
  Array.from({ length: n }, (_, i) => ({ id: `2026${String(i + 1).padStart(2, '0')}`, xLabel: '' }));

describe('时间自适应（seriesSpanRange / adaptiveRangeOf）', () => {
  const B12 = mkBuckets(12); // 202601..202612

  it('跨度 = 任一系列有值（price 或 rrp）的最小/最大下标', () => {
    const s1 = mkSeries({
      points: Array.from({ length: 12 }, (_, i) => PT({ price: i >= 2 && i <= 7 ? 100 + i : null })),
    });
    expect(seriesSpanRange([s1])).toEqual([2, 7]);
    const s2 = mkSeries({
      points: Array.from({ length: 12 }, (_, i) => PT({ price: null, rrp: i === 9 ? 500 : null })),
    });
    expect(seriesSpanRange([s1, s2])).toEqual([2, 9]);
  });

  it('无任何有值点 → null（调用方保持现范围不动）', () => {
    const s = mkSeries({ points: Array.from({ length: 12 }, () => PT({ price: null })) });
    expect(seriesSpanRange([s])).toBeNull();
  });

  it('自适应范围 = 跨度 ±2 个桶（spec 例：202603-202608 → 可选 202601-202610）', () => {
    expect(adaptiveRangeOf(B12, [2, 7])).toEqual(['202601', '202610']);
  });

  it('钳在数据全集内：右缘不超末端（= 当前时间）、左缘不早于起点', () => {
    expect(adaptiveRangeOf(B12, [4, 11])).toEqual(['202603', '202612']); // 末端 +2 被钳
    expect(adaptiveRangeOf(B12, [0, 3])).toEqual(['202601', '202606']); // 起点 −2 被钳
  });

  it('span null / 空桶 → null', () => {
    expect(adaptiveRangeOf(B12, null)).toBeNull();
    expect(adaptiveRangeOf([], [0, 1])).toBeNull();
  });
});

describe('panWindow（第十九轮轨道边界版）', () => {
  it('平移钳在轨道 [lo, hi]，窗口宽度不变', () => {
    expect(panWindow(4, 7, 2, 9, 1)).toEqual({ s: 5, e: 8 });
    expect(panWindow(4, 7, 2, 9, 100)).toEqual({ s: 6, e: 9 }); // 右缘顶死 hi
    expect(panWindow(4, 7, 2, 9, -100)).toEqual({ s: 2, e: 5 }); // 左缘顶死 lo
  });

  it('窄轨道（桶数 < 窗宽）锁定不动', () => {
    expect(panWindow(0, 3, 0, 2, 1)).toEqual({ s: 0, e: 3 });
  });
});

// ---------------- 真实造数金测（快照） ----------------
// buildSeries 固定查询（确定性 PRNG）→ 全链路纯计算输出钉快照；
// 任何图表行为漂移（有意或回归）都会改快照 → diff 可审。

describe('真实造数快照（seed 20261009）', () => {
  // 延迟 import：让上面的单测不依赖数据层也能跑（数据层装载含解压）
  it('labelPlan + option + 刻度 + 端点 全链路快照（USD/月/两价）', async () => {
    const { buildSeries } = await import('../../../dataModel/aggregate');
    const { dimProduct } = await import('../../../data');
    // modelId = sku_id 前缀（`own-xxx__12+256GB__Black` 的第一段）；romram 形如 "12+256 GB"
    const modelIdOf = (skuId: string): string => skuId.split('__')[0];
    const normRom = (s: string): string => s.replace(/\s+/g, '');
    const ownSku = dimProduct.find((p) => p.is_own && normRom(p.romram) === '12+256GB')!;
    const compSku = dimProduct.find((p) => !p.is_own && normRom(p.romram) === '12+256GB')!;
    const series = buildSeries({
      groups: [
        { modelId: modelIdOf(ownSku.sku_id), romram: ownSku.romram, skuIds: [ownSku.sku_id], isOwn: true },
        { modelId: modelIdOf(compSku.sku_id), romram: compSku.romram, skuIds: [compSku.sku_id], isOwn: false },
      ],
      granularity: 'month',
      startBucket: '202601',
      endBucket: '202609',
      currency: 'usd',
      agg: 'avg',
      platform: null,
    });
    expect(series.length).toBeGreaterThan(0);
    const scale = computeYAxis({ series, priceTypes: BOTH, sliderScale: 1 });
    const totalH = 96 + scale.plotHeight + GRID.bottom;
    const geom = buildGeom({ width: 1280, totalH, gridTop: 96, series, scale, currency: 'usd' })!;
    const marks = buildEndpointMarks(series);
    const labelPlan = buildLabelPlan({ geom, series, granularity: 'month', priceTypes: BOTH, endpointMarks: marks });
    const option = buildOption({ geom, series, priceTypes: BOTH, granularity: 'month', labelPlan, gridTop: 96, endpointMarks: marks });
    expect(buildTickRows(geom)).toMatchSnapshot('tickRows');
    expect(labelPlan).toMatchSnapshot('labelPlan');
    expect({ marks: [...marks.entries()], seriesTypes: (option!.series as Record<string, unknown>[]).map((s) => s.type) }).toMatchSnapshot('marks+types');
  });
});
