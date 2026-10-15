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
import { GRID, MIN_PX_PER_SERIES, NAME_ZONE_W, adaptiveRangeOf, bucketSpans, computeYAxis, fmtAxisTick, gapAbsorbedIdx, gapRuns, panWindow, segTicks, seriesSpanRange, yPxOf, type Bucket, type YScale } from '../helpers';
import {
  buildChangeMarks,
  buildExtremeMarks,
  buildEndpointBadges,
  buildEndpointMarks,
  buildGeom,
  buildLabelPlan,
  buildOfferMarkers,
  offerList,
  offerSummary,
  buildOption,
  buildPriceSummary,
  buildPromoBands,
  buildTierBoxes,
  buildTickRows,
  bucketLabeledIdx,
  curveNameOf,
  LIFECYCLE_ROW_H,
  NAME_LEADER_PX,
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

  it('折线形态（第三十八轮）：默认=方形阶梯 step:end + 数据点圆点删除；smooth=曲线无 step', () => {
    const s = mkSeries({ points: [PT({ price: 100 }), PT({ price: 110 }), PT({ price: 105 })] });
    const scale = computeYAxis({ series: [s], priceTypes: DISC_ONLY, sliderScale: 1 });
    const geom = mkGeom(scale, 1200, 3, scale.plotHeight + 96 + GRID.bottom, 96);
    const base = { geom, series: [s], priceTypes: DISC_ONLY, granularity: 'week' as const, labelPlan: { dy: {}, names: [] }, gridTop: 96, endpointMarks: new Map() };
    const stepOpt = buildOption(base)!;
    const stepMain = (stepOpt.series as Record<string, unknown>[])[0];
    expect(stepMain.step).toBe('end');
    expect(stepMain.symbolSize).toBe(0); // 第三十八轮：数据点圆点删除（悬停浮窗承担点检视）

    const smoothOpt = buildOption({ ...base, lineShape: 'smooth' })!;
    const smoothMain = (smoothOpt.series as Record<string, unknown>[])[0];
    expect(smoothMain.step).toBeUndefined();
    expect(smoothMain.smooth).toBe(true);
    expect(smoothMain.smoothMonotone).toBe('x');
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

  it('档位带：有数据档 = 实底框；无数据档 = 虚线占位不消失（第三十二轮），框绝对坐标完整落在某一段内', () => {
    const tierValues = [...own.points.map((p) => p.price!), ...comp.points.map((p) => p.price!)];
    const boxes = buildTierBoxes({ enabled: true, geom, tierValues });
    const byLabel = (l: string) => boxes.filter((b) => b.label === l);
    // 有数据档：实底（empty=false）——own 250..295(+300) / comp 650..725(+700)
    expect(byLabel('200~400').length).toBeGreaterThan(0);
    expect(byLabel('200~400').every((b) => !b.empty)).toBe(true);
    expect(byLabel('600~800').every((b) => !b.empty)).toBe(true);
    // 无数据且轴域无像素的档（<200 低于轴底、1000+ 高于轴顶）不产生框（几何裁剪）
    expect(byLabel('<200')).toHaveLength(0);
    expect(byLabel('1000+')).toHaveLength(0);
    // yPxOf 是绝对坐标（含 plotTop），seg.pTop/pH 是相对绘图区顶的相对坐标
    for (const b of boxes) {
      const inSeg = scale.segs.some(
        (s) =>
          b.top >= geom.plotTop + s.pTop - 1e-6 && b.top + b.h <= geom.plotTop + s.pTop + s.pH + 1e-6,
      );
      expect(inSeg).toBe(true);
    }
    // 连续轴（不压缩）：400~600 空档落在轴域内 → 虚线占位框出现且不与实底框混淆
    const contScale = computeYAxis({ series: [own, comp], priceTypes: BOTH, sliderScale: 1, allowBreak: false });
    const contGeom = mkGeom(contScale, 1400, 10, contScale.plotHeight + 96 + GRID.bottom, 96);
    const contBoxes = buildTierBoxes({ enabled: true, geom: contGeom, tierValues });
    const gap400 = contBoxes.filter((b) => b.label === '400~600');
    expect(gap400.length).toBeGreaterThan(0);
    expect(gap400.every((b) => b.empty)).toBe(true);
    expect(contBoxes.filter((b) => b.label === '200~400').every((b) => !b.empty)).toBe(true);
  });

  it('端点徽标几何与标记表一致；offer 徽章按 档期+权益签名 去重取首周（第四十八轮结构化）', () => {
    const marks = buildEndpointMarks([own]);
    const badges = buildEndpointBadges({ geom, series: [own], marks, priceTypes: BOTH });
    expect(badges).toHaveLength(marks.size);
    const offer: OfferInfo = {
      discount: { kind: 'discount', promoName: '双11', headline: '券 −10%', detail: '平台券 −10%', endDate: '2026-11-11', remainingDays: 30 },
    };
    const pts = own.points.map((p, i) => (i === 3 || i === 7 ? { ...p, offer } : p));
    const markers = buildOfferMarkers({ enabled: true, geom, series: [mkSeries({ points: pts })] });
    expect(markers).toHaveLength(1); // 同 档期+权益 只取首周
    expect(offerSummary(markers[0].offer)).toBe('券 −10%');
    expect(buildOfferMarkers({ enabled: false, geom, series: [mkSeries({ points: pts })] })).toHaveLength(0);
  });

  it('第四十八轮：offerList 固定 折扣→分期→赠品 次序；offerSummary 合并 headline', () => {
    const offer: OfferInfo = {
      gift: { kind: 'gift', promoName: '双11', headline: '赠保护壳', detail: '下单赠 保护壳', endDate: '2026-11-11', remainingDays: 3 },
      installment: {
        kind: 'installment',
        promoName: '双11',
        headline: '6 期免息',
        detail: '先享后付免息 6 期',
        endDate: '2026-11-11',
        remainingDays: 3,
        bankPriceRub: 74630,
        tariffEstRub: 9702,
      },
      discount: { kind: 'discount', promoName: '双11', headline: '券 −10%', detail: '平台券 −10%', endDate: '2026-11-11', remainingDays: 3 },
    };
    expect(offerList(offer).map((d) => d.kind)).toEqual(['discount', 'installment', 'gift']);
    expect(offerSummary(offer)).toBe('券 −10% · 6 期免息 · 赠保护壳');
    expect(offerSummary(null)).toBe('');
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

// ---------------- 多系列防挤（第三十二轮：生命周期盒 / 标签减量 / 聚焦 / 需求下限） ----------------

describe('名称避让·生命周期行计入盒（第三十二轮）', () => {
  // 9 条首值挤在 2 USD 内的长名系列（×0.5 倍率再压像素）→ 名称塔必现（nova 案形态）
  const crowd = (n: number): Series[] =>
    Array.from({ length: n }, (_, k) =>
      mkSeries({
        key: `n${k}`,
        isOwn: k === 0,
        label: `Acme Nova Ultra ${k} 12+256GB`,
        points: Array.from({ length: 8 }, () => PT({ price: 300 + k * 0.5 })),
      }));
  const scale = computeYAxis({ series: crowd(9), priceTypes: DISC_ONLY, sliderScale: 0.5 });
  const geom = mkGeom(scale, 1400, 8, scale.plotHeight + 96 + GRID.bottom, 96);
  const planLC = buildLabelPlan({
    geom,
    series: crowd(9),
    granularity: 'quarter',
    priceTypes: DISC_ONLY,
    endpointMarks: new Map(),
    lifecycleRow: () => true,
  });

  it('相邻名称盒（含生命周期第二行）互不相交——用户底线：产品名称互不遮挡', () => {
    expect(planLC.names).toHaveLength(9);
    const GAP = 4; // 与 resolveCollisions 内部间距一致
    for (let i = 0; i < planLC.names.length; i++) {
      for (let j = i + 1; j < planLC.names.length; j++) {
        const a = planLC.names[i];
        const b = planLC.names[j];
        const xOverlap = a.x < b.x + b.w && b.x < a.x + a.w;
        if (!xOverlap) continue;
        const vDisjoint = a.y + a.h + GAP <= b.y + 1e-6 || b.y + b.h + GAP <= a.y + 1e-6;
        expect(vDisjoint).toBe(true);
      }
    }
  });

  it('盒高恰多多行（LIFECYCLE_ROW_H）；推离超阈值输出 dy 与锚点（引线渲染依据）', () => {
    const bare = buildLabelPlan({ geom, series: crowd(9), granularity: 'quarter', priceTypes: DISC_ONLY, endpointMarks: new Map() });
    const bareByKey = new Map(bare.names.map((n) => [n.seriesKey, n]));
    for (const n of planLC.names) {
      expect(n.h - bareByKey.get(n.seriesKey)!.h).toBe(LIFECYCLE_ROW_H);
      expect(Number.isFinite(n.anchorX)).toBe(true);
      expect(Number.isFinite(n.anchorY)).toBe(true);
    }
    expect(planLC.names.some((n) => Math.abs(n.dy) > NAME_LEADER_PX)).toBe(true);
  });
});

describe('多系列标签减量（第三十二轮）', () => {
  it('bucketLabeledIdx：月/季 P1 候选 = 显示值（fmtInt 口径）变化的首个点', () => {
    const pts = [100.2, 100.4, 100.9, 102, 102.3, null, 102.6].map((price) => PT({ price }));
    // 文案序列：100, 100, 101, 102, 102, (null 跳过), 103 → 变化点 0/2/3/6
    expect([...bucketLabeledIdx(pts, DISC_ONLY)]).toEqual([0, 2, 3, 6]);
  });

  it('最大/最小超阈值降 P1（冲突即隐），首/末恒必放；≤阈值时极值仍必放', () => {
    const spike = (n: number): Series[] =>
      Array.from({ length: n }, (_, k) =>
        mkSeries({
          key: `s${k}`,
          points: [300, 300, 302, 300, 300].map((v) => PT({ price: v + k * 0.5 })),
        }));
    const mk = (n: number) => {
      const sc = computeYAxis({ series: spike(n), priceTypes: DISC_ONLY, sliderScale: 0.5 });
      const g = mkGeom(sc, 1400, 5, sc.plotHeight + 96 + GRID.bottom, 96);
      return buildLabelPlan({ geom: g, series: spike(n), granularity: 'month', priceTypes: DISC_ONLY, endpointMarks: new Map() });
    };
    const plan3 = mk(3);
    for (let k = 0; k < 3; k++) expect((plan3.dy[`s${k}`] ?? {})[2]).toBeDefined(); // 最大值点必放
    const plan9 = mk(9);
    const definedMax = Array.from({ length: 9 }, (_, k) => (plan9.dy[`s${k}`] ?? {})[2] !== undefined).filter(Boolean).length;
    expect(definedMax).toBeLessThan(9); // 降 P1 后最大值点可被冲突隐藏
    for (let k = 0; k < 9; k++) {
      expect((plan9.dy[`s${k}`] ?? {})[0]).toBeDefined(); // 首
      expect((plan9.dy[`s${k}`] ?? {})[4]).toBeDefined(); // 末
    }
  });
});

describe('聚焦模式 option（第三十二轮）', () => {
  const trio = Array.from({ length: 3 }, (_, k) =>
    mkSeries({ key: `n${k}`, points: Array.from({ length: 8 }, () => PT({ price: 300 + k * 10 })) }));
  const scale = computeYAxis({ series: trio, priceTypes: DISC_ONLY, sliderScale: 1 });
  const geom = mkGeom(scale, 1400, 8, scale.plotHeight + 96 + GRID.bottom, 96);
  const plan = buildLabelPlan({ geom, series: trio, granularity: 'month', priceTypes: DISC_ONLY, endpointMarks: new Map() });
  const base = buildOption({ geom, series: trio, priceTypes: DISC_ONLY, granularity: 'month', labelPlan: plan, gridTop: 96, endpointMarks: new Map() })!;
  const focused = buildOption({ geom, series: trio, priceTypes: DISC_ONLY, granularity: 'month', labelPlan: plan, gridTop: 96, endpointMarks: new Map(), focusKey: 'n1' })!;
  const arr = (o: ReturnType<typeof buildOption>) => (o!.series as Record<string, unknown>[]);

  it('无聚焦 = 与旧口径一致（不出现 0.15 降透明字段）', () => {
    for (const s of arr(base)) {
      expect((s.lineStyle as { opacity?: number }).opacity).not.toBe(0.15);
      expect((s.itemStyle as { opacity?: number } | undefined)?.opacity).not.toBe(0.15);
    }
  });

  it('聚焦 n1：其余主线/圆点降透明 0.15 且数值标签全隐；聚焦线不透明、标签照常', () => {
    const f = arr(focused);
    expect(f).toHaveLength(3); // 无缺采桥、仅折后价 → 每系列 1 条主线
    const n0 = f[0];
    expect((n0.lineStyle as { opacity?: number }).opacity).toBe(0.15);
    expect(n0.itemStyle).toBeUndefined(); // 第三十八轮：数据点圆点删除，itemStyle 随之退场
    expect((n0.data as { label?: { show?: boolean } }[]).every((d) => !d.label?.show)).toBe(true);
    const n1 = f[1];
    expect((n1.lineStyle as { opacity?: number }).opacity).toBeUndefined();
    expect((n1.data as { label?: { show?: boolean } }[]).some((d) => d.label?.show)).toBe(true);
  });
});

describe('段像素需求下限（第三十二轮）', () => {
  it('窄簇多系列：段抬升至 min(n,12)×MIN_PX_PER_SERIES×倍率，plotHeight 随之生长；需求不触及时维持旧口径', () => {
    const low10 = Array.from({ length: 10 }, (_, k) =>
      mkSeries({ key: `L${k}`, points: Array.from({ length: 4 }, (_, i) => PT({ price: 100 + k * 70 + i })) }));
    const high1 = mkSeries({ key: 'H', points: Array.from({ length: 4 }, (_, i) => PT({ price: 5000 + i * 150 })) });
    const many = computeYAxis({ series: [...low10, high1], priceTypes: DISC_ONLY, sliderScale: 1 });
    const few = computeYAxis({ series: [low10[0], high1], priceTypes: DISC_ONLY, sliderScale: 1 });
    expect(many.segs.length).toBe(2);
    const bottomMany = many.segs[many.segs.length - 1];
    const bottomFew = few.segs[few.segs.length - 1];
    expect(bottomMany.pH).toBeGreaterThanOrEqual(10 * MIN_PX_PER_SERIES); // 需求下限抬升
    expect(bottomMany.pH).toBeGreaterThan(bottomFew.pH);
    expect(many.plotHeight).toBeGreaterThan(few.plotHeight);
    // 无一段触需 → plotHeight 仍是 旧公式 = 格数×92×倍率 + 断裂条
    expect(few.plotHeight).toBe(few.cells * 92 + (few.segs.length - 1) * 24);
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

// ---------------- 第三十四轮：价格摘要条 / 大促背景带 / 桶跨度 ----------------

describe('buildPriceSummary（摘要条：账面价 vs 成交价三件套）', () => {
  it('折扣率 = 窗口内最新有值点 price/rrp−1；尾部无值点被跳过', () => {
    const s = mkSeries({
      points: [
        PT({ price: 100, rrp: 120, xLabel: '01-01' }),
        PT({ price: null, rrp: 120, xLabel: '01-08' }),
        PT({ price: 90, rrp: 100, xLabel: '01-15' }),
        PT({ price: null, rrp: null, xLabel: '01-22' }),
      ],
    });
    const [it] = buildPriceSummary([s]);
    expect(it.price).toBe(90);
    expect(it.rrp).toBe(100);
    expect(it.discount).toBeCloseTo(-0.1, 10);
    expect(it.asOf).toBe('01-15');
    expect(it.diffVsOwn).toBeNull();
  });

  it('RRP 缺失 → discount null；仅 RRP 有值（price null）→ price null 照常输出', () => {
    const a = mkSeries({ points: [PT({ price: 80, rrp: null })] });
    const b = mkSeries({ points: [PT({ price: null, rrp: 100 })] });
    const [sa, sb] = buildPriceSummary([a, b]);
    expect(sa.discount).toBeNull();
    expect(sa.price).toBe(80);
    expect(sb.price).toBeNull();
    expect(sb.rrp).toBe(100);
    expect(sb.discount).toBeNull();
  });

  it('全空窗口 → 全 null 项；空数组 → 空输出', () => {
    const s = mkSeries({ points: [PT({ price: null }), PT({ price: null })] });
    const [it] = buildPriceSummary([s]);
    expect(it.price).toBeNull();
    expect(it.rrp).toBeNull();
    expect(it.asOf).toBeNull();
    expect(buildPriceSummary([])).toEqual([]);
  });

  it('竞品 diffVsOwn 相对首个我司系列；竞品更便宜为负', () => {
    const own = mkSeries({ key: 'own', isOwn: true, points: [PT({ price: 100, rrp: 100 })] });
    const c1 = mkSeries({ key: 'c1', isOwn: false, points: [PT({ price: 90 })] });
    const c2 = mkSeries({ key: 'c2', isOwn: false, points: [PT({ price: 120 })] });
    const [o, a, b] = buildPriceSummary([own, c1, c2]);
    expect(o.diffVsOwn).toBeNull();
    expect(a.diffVsOwn).toBeCloseTo(-0.1, 10);
    expect(b.diffVsOwn).toBeCloseTo(0.2, 10);
  });

  it('无我司系列 → 竞品 diffVsOwn 全 null（无水位基准）', () => {
    const c = mkSeries({ key: 'c', isOwn: false, points: [PT({ price: 90 })] });
    expect(buildPriceSummary([c])[0].diffVsOwn).toBeNull();
  });
});

describe('buildPromoBands（大促背景带）', () => {
  const SPANS = [
    { start: '2025-11-10', end: '2025-11-16' },
    { start: '2025-11-17', end: '2025-11-23' },
    { start: '2025-11-24', end: '2025-11-30' },
    { start: '2025-12-01', end: '2025-12-07' },
  ];
  const P = (over: Partial<{ promo_id: string; promo_name: string; start_date: string; end_date: string; depth_hint: '浅' | '中' | '深' }>) => ({
    promo_id: 'p',
    promo_name: '黑五 Чёрная пятница',
    start_date: '2025-11-20',
    end_date: '2025-12-01',
    depth_hint: '深' as const,
    ...over,
  });

  it('跨桶促销：startIdx/endIdx/边缘分数/weeks', () => {
    const [b] = buildPromoBands({ promos: [P({})], spans: SPANS });
    expect(b.startIdx).toBe(1);
    expect(b.endIdx).toBe(3);
    expect(b.weeks).toBe(3);
    // 11-20 落在 idx1（11-17..23）：分数 = 天差分/(be−bs) = 3/6（约定：分母为日期差非含头尾天数）
    expect(b.startFrac).toBeCloseTo(0.5, 6);
    // 12-01 是 idx3 覆盖区间的第 1 天 → 分数 0
    expect(b.endFrac).toBeCloseTo(0, 6);
  });

  it('整桶覆盖 → frac 0/1；窗口外促销被剔除', () => {
    const full = buildPromoBands({
      promos: [P({ promo_id: 'a', start_date: '2025-11-17', end_date: '2025-11-23' })],
      spans: SPANS,
    });
    expect(full[0].startFrac).toBe(0);
    expect(full[0].endFrac).toBe(1);
    expect(full[0].weeks).toBe(1);
    const outside = buildPromoBands({
      promos: [P({ promo_id: 'b', start_date: '2025-12-10', end_date: '2025-12-20' })],
      spans: SPANS,
    });
    expect(outside).toEqual([]);
  });

  it('输出按 startIdx 升序（编号锚点顺序）；shortName 取名称首段', () => {
    const bands = buildPromoBands({
      promos: [
        P({ promo_id: 'late', promo_name: '新年大促 Новый год', start_date: '2025-12-05', end_date: '2025-12-06' }),
        P({ promo_id: 'early', promo_name: '11.11 档期', start_date: '2025-11-11', end_date: '2025-11-11' }),
      ],
      spans: SPANS,
    });
    expect(bands.map((b) => b.key)).toEqual(['early', 'late']);
    expect(bands[0].shortName).toBe('11.11');
  });
});

describe('bucketSpans（helpers：桶覆盖区间）', () => {
  it('周桶 = 锚周三 ±3 天', () => {
    const spans = bucketSpans('week', [
      { id: '202546', xLabel: '11-12' },
      { id: '202547', xLabel: '11-19' },
    ]);
    expect(spans[0]).toEqual({ start: '2025-11-09', end: '2025-11-15' });
    expect(spans[1].start).toBe('2025-11-16');
  });

  it('月桶 = 首末周周三 ±3 天（结构断言，真实跨度由造数侧覆盖）', () => {
    const spans = bucketSpans('month', [
      { id: '202511', xLabel: '202511' },
      { id: '202512', xLabel: '202512' },
    ]);
    expect(spans).toHaveLength(2);
    for (const s of spans) {
      expect(s.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(s.start <= s.end).toBe(true);
    }
  });
});

// ---------------- 第三十五轮：悬停时点摘要 / 特殊降价点 / 最高最低参照线 ----------------

describe('buildPriceSummary · atIdx 悬停时点模式（第三十五轮）', () => {
  const s = mkSeries({
    points: [
      PT({ price: 100, rrp: 120, xLabel: '01-01' }),
      PT({ price: 90, rrp: 100, xLabel: '01-08' }),
      PT({ price: null, rrp: null, xLabel: '01-15' }),
    ],
  });

  it('atIdx 给定 → 固定取该下标（而非最新有值点）', () => {
    const [it] = buildPriceSummary([s], 0);
    expect(it.price).toBe(100);
    expect(it.rrp).toBe(120);
    expect(it.asOf).toBe('01-01');
  });

  it('悬停无值时点 → 全 null 项（asOf 保留，摘要条显示「—」）', () => {
    const [it] = buildPriceSummary([s], 2);
    expect(it.price).toBeNull();
    expect(it.rrp).toBeNull();
    expect(it.discount).toBeNull();
    expect(it.asOf).toBe('01-15');
  });

  it('atIdx 越界 → 全 null；缺省仍为最新有值点', () => {
    expect(buildPriceSummary([s], 9)[0].price).toBeNull();
    expect(buildPriceSummary([s])[0].price).toBe(90);
  });
});

describe('buildChangeMarks（价格变化点，第三十五轮起；第四十二轮阈值可调+含上涨）', () => {
  it('降幅 ≥5% 标记（带符号负值），<5% 不标；首点不标；缺采后仍与前一有值点比较', () => {
    const s = mkSeries({
      points: [
        PT({ price: 100 }),
        PT({ price: 98 }), // −2% 不标
        PT({ price: null }),
        PT({ price: 80 }), // 相对 98 = −18.4% 标记（跨缺采）
        PT({ price: 79 }), // −1.25% 不标
      ],
    });
    const m = buildChangeMarks([s]);
    expect(m.has('s1|0')).toBe(false);
    expect(m.has('s1|1')).toBe(false);
    expect(m.get('s1|3')).toBeCloseTo(80 / 98 - 1, 10);
    expect(m.has('s1|4')).toBe(false);
  });

  it('恰好在阈值（−5%）也标记', () => {
    const s = mkSeries({ points: [PT({ price: 100 }), PT({ price: 95 })] });
    expect(buildChangeMarks([s]).get('s1|1')).toBeCloseTo(-0.05, 10);
  });

  it('第四十二轮：上涨 ≥阈值同样标记（带符号正值）；阈值可调', () => {
    const up = mkSeries({ points: [PT({ price: 100 }), PT({ price: 110 })] });
    expect(buildChangeMarks([up]).get('s1|1')).toBeCloseTo(0.1, 10);

    const s = mkSeries({ points: [PT({ price: 100 }), PT({ price: 98 }), PT({ price: 96 })] });
    const tight = buildChangeMarks([s], 0.02);
    expect(tight.get('s1|1')).toBeCloseTo(-0.02, 10);
    expect(tight.get('s1|2')).toBeCloseTo(96 / 98 - 1, 10); // 98→96 = −2.04%
  });

  it('第四十六轮：threshold 0 = 标出全部真实变化；价格未动仍不标；负值 = 关闭', () => {
    const s = mkSeries({ points: [PT({ price: 100 }), PT({ price: 100 }), PT({ price: 99 }), PT({ price: 99 })] });
    const zero = buildChangeMarks([s], 0);
    expect(zero.size).toBe(1); // 只有 100→99 一处真实变化；首点与平盘不标
    expect(zero.get('s1|2')).toBeCloseTo(-0.01, 10);
    expect(buildChangeMarks([s], -1).size).toBe(0); // 负值 = 关闭
  });
});

describe('buildExtremeMarks（最高/最低点标记，第三十六轮）', () => {
  it('窗口极值 + 首个出现下标；全程一价不画', () => {
    const scale = computeYAxis({ series: [], priceTypes: DISC_ONLY, sliderScale: 1 });
    const pts = Array.from({ length: 6 }, (_, i) => PT({ price: [100, 120, 110, 90, 105, 100][i] }));
    const g = mkGeom(scale, 1200, 6, 800, 96);
    const marks = buildExtremeMarks({ geom: g, series: [mkSeries({ points: pts })], priceTypes: DISC_ONLY });
    expect(marks).toHaveLength(1);
    expect(marks[0].maxV).toBe(120);
    expect(marks[0].maxIdx).toBe(1);
    expect(marks[0].minV).toBe(90);
    expect(marks[0].minIdx).toBe(3);
    const flat = buildExtremeMarks({ geom: g, series: [mkSeries({ key: 'flat', points: [PT({ price: 100 }), PT({ price: 100 })] })], priceTypes: DISC_ONLY });
    expect(flat).toHaveLength(0);
  });
});
