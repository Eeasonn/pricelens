// ============================================================
// 量价预测 · v3 工作台 ①自动学习基线与证据（forecast-global-ia-review B.4.4 / 任务 3）
// 模型：y = β0 + β1·t + β2·r + β3·p（岭回归，λ=0.000001，只加非截距对角项）
//   t = lifecycleIndex / 52（本品周龄趋势）；r = log(参考同周龄销量)；
//   p = 促销窗口内 1 否则 0；y = log(sales)。
// 特征红线：不含价格、成本、大盘事件、未来情报（大盘在②另行修正，产品范围
//   事件在学习基线之后叠加）；结果不含价格字段、概率或区间字段。
// 训练行：只取 status='actual' 且 sales>0 且参考同周龄销量>0 的周，按日期升序；
//   有效样本 ≥32 周，最后 8 周作留出（holdout），其余作训练（≥24）。
// 求解：正规方程 + 部分主元高斯消元（手写确定性实现；不新增数学库，
//   不 import simple-v1 的 fitForecastFactors）。
// 证据：先用训练系数算留出预测（MAE 台数 / MAPE=%），再对全部有效样本拟合
//   最终系数；留出误差仅作证据，不用误差阈值自动否决模型。
// 预测：round(exp(β·x)) 最小 0。回退三则（样本/矩阵不可用 → 近 8 个有效实际
//   周中位数；仅未来参考缺失且有参考未来值 + 参考近 8 周均值 → 中位数×比例；
//   否则中位数）。回退周不叠加促销（防重复计入）。
// 确定性：纯函数，不读系统当前时间、不用随机；同输入重复调用逐字段一致。
// ============================================================
import type { ForecastCalendar, ISODate, WeekId } from './workbenchCalendar';
import type { PromoWindow, WorkbenchFixtureV3 } from './workbenchFixture';

/** 学习状态：全部预测周成功 / 部分周因参考缺口回退 / 无法拟合。 */
export type LearningStatus = 'completed' | 'partial' | 'fallback';

/** 学习证据（B.4.4）：同函数返回，UI 不得复算系数或误差。 */
export interface LearningEvidence {
  status: LearningStatus;
  algorithm: 'ridge-log-volume-v1';
  /** 首个/最后一个有效样本周的周一日期（无有效样本为 null）。 */
  sampleStart: ISODate | null;
  sampleEnd: ISODate | null;
  validSampleCount: number;
  trainCount: number;
  holdoutCount: number;
  featureNames: ['trend', 'referenceLogVolume', 'promo'];
  /** [截距, trend, referenceLogVolume, promo]；无法拟合为 null。 */
  coefficients: number[] | null;
  /** 留出平均绝对误差（台）。 */
  holdoutMae: number | null;
  /** 留出平均绝对百分比误差（%，不是概率）。 */
  holdoutMape: number | null;
  fallbackReasons: string[];
  fallbackWeekIds: WeekId[];
}

/** ①学习结果：预测周基线 + 证据。 */
export interface LearnedBaseline {
  baseByWeek: Map<WeekId, number | null>;
  evidence: LearningEvidence;
}

/** 岭正则强度（B.4.4 拍板）：只加在非截距对角项。 */
const RIDGE_LAMBDA = 0.000001;
/** 留出周数（最后 8 个有效周）。 */
const HOLDOUT_WEEKS = 8;
/** 有效样本下限（少于则走回退）。 */
const MIN_VALID_SAMPLES = 32;
/** 回退中位数窗口（本品最近 8 个有效实际周）。 */
const FALLBACK_MEDIAN_WEEKS = 8;
/** 趋势尺度：t = lifecycleIndex / 52。 */
const TREND_WEEKS = 52;
/** 特征维数：截距 + trend + referenceLogVolume + promo。 */
const FEATURE_DIMENSION = 4;
/** 高斯消元主元下限（正规方程加岭后对角 ≥ λ，实际奇异只在无样本时出现）。 */
const PIVOT_EPSILON = 1e-10;

/** 学习特征名（固定三元组；与系数序 [截距, trend, referenceLogVolume, promo] 对应）。 */
const FEATURE_NAMES: ['trend', 'referenceLogVolume', 'promo'] = ['trend', 'referenceLogVolume', 'promo'];

/** 一条训练/留出行（原始特征 + 目标，均为对数空间或原始量）。 */
interface LearningRow {
  weekId: WeekId;
  date: ISODate;
  /** 原始周销（台，>0；留出 MAE/MAPE 用）。 */
  actual: number;
  t: number;
  r: number;
  p: number;
  y: number;
}

/** 解引用：prevGenReferenceId → lifecyclePool.chainRefId 找完整生命周期序列。 */
function resolveReferencePoints(
  fixture: WorkbenchFixtureV3,
  prevGenReferenceId: string,
): Array<number | null> {
  const product = fixture.references.lifecyclePool.find(
    (candidate) => candidate.chainRefId === prevGenReferenceId,
  );
  if (!product) {
    throw new Error(`workbenchLearning: lifecyclePool 中不存在 chainRefId=「${prevGenReferenceId}」的参考产品`);
  }
  return product.points;
}

/** 参考点可用性：必须为有限正数（缺采 null、0 与负值都视为缺失，不造 0）。 */
function referenceValueAt(points: Array<number | null>, age: number): number | null {
  const value = points[age];
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * 促销窗口覆盖周集合（周 ID 集合）：p=1 当且仅当周 ID 落在任一已知窗口闭区间内。
 * 起/止不在日历或倒置的窗口按契约非法跳过（fixture 生成时已锚定真实周）。
 */
function collectPromoWeekIds(calendar: ForecastCalendar, windows: PromoWindow[]): Set<WeekId> {
  const covered = new Set<WeekId>();
  for (const window of windows) {
    const start = calendar.weekById.get(window.startWeekId);
    const end = calendar.weekById.get(window.endWeekId);
    if (!start || !end || start.index > end.index) continue;
    for (let index = start.index; index <= end.index; index += 1) {
      covered.add(calendar.weeks[index]!.id);
    }
  }
  return covered;
}

/**
 * 训练行（B.4.4）：只取 status='actual' 且 sales>0 且参考同周龄销量>0 的周；
 * 缺采与 0 不作为 0 销量训练；按日期升序。
 */
function collectValidRows(
  fixture: WorkbenchFixtureV3,
  referencePoints: Array<number | null>,
  promoWeekIds: Set<WeekId>,
): LearningRow[] {
  const rows: LearningRow[] = [];
  for (const week of fixture.weeks) {
    if (week.status !== 'actual' || week.sales === null || week.sales <= 0) continue;
    const reference = referenceValueAt(referencePoints, week.lifecycleIndex);
    if (reference === null) continue;
    const p = promoWeekIds.has(week.id) ? 1 : 0;
    rows.push({
      weekId: week.id,
      date: week.date,
      actual: week.sales,
      t: week.lifecycleIndex / TREND_WEEKS,
      r: Math.log(reference),
      p,
      y: Math.log(week.sales),
    });
  }
  // fixture 周序列本就按日期升序与日历同源；显式排序保证契约不依赖实现巧合。
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return rows;
}

/** 中位数（偶数个取中间两数均值；空集为 null）。 */
function medianOf(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * 正规方程 + 部分主元高斯消元（确定性手写）：解 A·x = b，
 * 主元绝对值过小判为不可解返回 null；解含非有限值同样返回 null。
 */
function solveLinearSystem(matrix: number[][], vector: number[]): number[] | null {
  const n = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]!]);
  for (let col = 0; col < n; col += 1) {
    let pivotRow = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(augmented[row]![col]!) > Math.abs(augmented[pivotRow]![col]!)) pivotRow = row;
    }
    if (Math.abs(augmented[pivotRow]![col]!) < PIVOT_EPSILON) return null;
    if (pivotRow !== col) {
      const swapped = augmented[col]!;
      augmented[col] = augmented[pivotRow]!;
      augmented[pivotRow] = swapped;
    }
    for (let row = col + 1; row < n; row += 1) {
      const factor = augmented[row]![col]! / augmented[col]![col]!;
      for (let k = col; k <= n; k += 1) {
        augmented[row]![k]! -= factor * augmented[col]![k]!;
      }
    }
  }
  const solution = new Array<number>(n).fill(0);
  for (let row = n - 1; row >= 0; row -= 1) {
    let sum = augmented[row]![n]!;
    for (let k = row + 1; k < n; k += 1) sum -= augmented[row]![k]! * solution[k]!;
    solution[row] = sum / augmented[row]![row]!;
  }
  if (solution.some((value) => !Number.isFinite(value))) return null;
  return solution;
}

/**
 * 岭回归拟合：最小化 Σ(y − Xβ)² + λ·Σ(β₁..β₃)² 的正规方程
 * (XᵀX + λ·diag(0,1,1,1))β = Xᵀy。λ 只加非截距对角项（B.4.4）。
 */
function fitRidge(rows: LearningRow[]): number[] | null {
  const xtx: number[][] = Array.from({ length: FEATURE_DIMENSION }, () => new Array<number>(FEATURE_DIMENSION).fill(0));
  const xty = new Array<number>(FEATURE_DIMENSION).fill(0);
  for (const row of rows) {
    const features = [1, row.t, row.r, row.p];
    for (let i = 0; i < FEATURE_DIMENSION; i += 1) {
      for (let j = 0; j < FEATURE_DIMENSION; j += 1) {
        xtx[i]![j]! += features[i]! * features[j]!;
      }
      xty[i]! += features[i]! * row.y;
    }
  }
  for (let i = 1; i < FEATURE_DIMENSION; i += 1) xtx[i]![i]! += RIDGE_LAMBDA;
  return solveLinearSystem(xtx, xty);
}

/** 学习周基线 = round(exp(β0 + β1·t + β2·r + β3·p))，最小 0（回退周不传 p，即不叠加促销）。 */
function predictUnits(coefficients: number[], t: number, r: number, p: number): number {
  const [b0, b1, b2, b3] = coefficients;
  return Math.max(0, Math.round(Math.exp(b0! + b1! * t + b2! * r + b3! * p)));
}

/** 留出评估（仅证据，不自动否决）：MAE 台数；MAPE = mean(|a−p|/a)×100%。 */
function evaluateHoldout(coefficients: number[], rows: LearningRow[]): { mae: number; mape: number } {
  let maeSum = 0;
  let mapeSum = 0;
  for (const row of rows) {
    const predicted = predictUnits(coefficients, row.t, row.r, row.p);
    const error = Math.abs(row.actual - predicted);
    maeSum += error;
    mapeSum += error / row.actual;
  }
  return { mae: maeSum / rows.length, mape: (mapeSum / rows.length) * 100 };
}

/** 参考最近 8 个非空点均值（「参考最近 8 周均值」；无可用品为 null）。 */
function referenceRecentMean(points: Array<number | null>): number | null {
  const values: number[] = [];
  for (let age = points.length - 1; age >= 0 && values.length < FALLBACK_MEDIAN_WEEKS; age -= 1) {
    const value = referenceValueAt(points, age);
    if (value !== null) values.push(value);
  }
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** 缺失周龄之后的第一个可用参考点（「参考未来值」；无则为 null，末值不平铺）。 */
function referenceNextFutureValue(points: Array<number | null>, age: number): number | null {
  for (let next = age + 1; next < points.length; next += 1) {
    const value = referenceValueAt(points, next);
    if (value !== null) return value;
  }
  return null;
}

/**
 * ①自动学习基线（B.4.4 唯一入口）：同 fixture + 同日历 + 同参考 → 逐字段一致。
 * 无任何有效实际周时返回空 baseByWeek + fallback 证据（任务 5 主链把对应周的
 * learnedBase/baselineSales/marketAdjusted/inventoryAdjusted/final 置 null）。
 */
export function learnWorkbenchBaseline(
  fixture: WorkbenchFixtureV3,
  calendar: ForecastCalendar,
  prevGenReferenceId: string,
): LearnedBaseline {
  const referencePoints = resolveReferencePoints(fixture, prevGenReferenceId);
  const promoWeekIds = collectPromoWeekIds(calendar, fixture.promoWindows);
  const rows = collectValidRows(fixture, referencePoints, promoWeekIds);

  const validSampleCount = rows.length;
  const sampleStart = rows.length > 0 ? rows[0]!.date : null;
  const sampleEnd = rows.length > 0 ? rows[rows.length - 1]!.date : null;
  // 回退中位数资源：本品最近 8 个有效实际周销量中位数（不足 8 周用全部可用）。
  const medianUnits = medianOf(rows.slice(-FALLBACK_MEDIAN_WEEKS).map((row) => row.actual));

  // 先用训练集算留出，再对全部有效样本拟合最终系数（B.4.4 顺序）。
  let coefficients: number[] | null = null;
  let holdoutMae: number | null = null;
  let holdoutMape: number | null = null;
  let trainCount = 0;
  let holdoutCount = 0;
  if (validSampleCount >= MIN_VALID_SAMPLES) {
    trainCount = validSampleCount - HOLDOUT_WEEKS;
    holdoutCount = HOLDOUT_WEEKS;
    const trainCoefficients = fitRidge(rows.slice(0, trainCount));
    if (trainCoefficients) {
      const metrics = evaluateHoldout(trainCoefficients, rows.slice(trainCount));
      holdoutMae = metrics.mae;
      holdoutMape = metrics.mape;
    }
    coefficients = fitRidge(rows);
    if (coefficients && !trainCoefficients) coefficients = null;
  }

  const fallbackReasons: string[] = [];
  const fallbackWeekIds: WeekId[] = [];
  const baseByWeek = new Map<WeekId, number | null>();

  if (!coefficients) {
    // 样本/矩阵不可用 → 全部预测周回退（回退周不叠加促销）。
    for (const week of calendar.forecastWeeks) fallbackWeekIds.push(week.id);
    if (medianUnits === null) {
      // 连一个有效实际周都不存在：中位数也不可算 → 空 baseByWeek，主链置 null。
      fallbackReasons.push(
        '有效样本不足：无 status=actual 且 sales>0 且参考同周龄销量>0 的周，无法拟合也无法计算回退中位数',
      );
    } else if (validSampleCount < MIN_VALID_SAMPLES) {
      fallbackReasons.push(
        `有效样本不足：有效样本 ${validSampleCount} 周，低于最低 ${MIN_VALID_SAMPLES} 周，`
        + `按本品最近 ${Math.min(FALLBACK_MEDIAN_WEEKS, validSampleCount)} 个有效实际周中位数回退`,
      );
    } else {
      fallbackReasons.push(
        '样本/矩阵不可用：正规方程无解或系数非有限，按本品最近 8 个有效实际周中位数回退',
      );
    }
    if (medianUnits !== null) {
      for (const week of calendar.forecastWeeks) baseByWeek.set(week.id, medianUnits);
    }
  } else {
    const recentMean = referenceRecentMean(referencePoints);
    const fixtureWeekById = new Map(fixture.weeks.map((week) => [week.id, week]));
    for (const week of calendar.forecastWeeks) {
      const fixtureWeek = fixtureWeekById.get(week.id);
      if (!fixtureWeek) {
        throw new Error(`workbenchLearning: fixture 周序列缺少预测周「${week.id}」（应与统一日历同源）`);
      }
      const age = fixtureWeek.lifecycleIndex;
      const reference = referenceValueAt(referencePoints, age);
      if (reference !== null) {
        baseByWeek.set(week.id, predictUnits(coefficients, age / TREND_WEEKS, Math.log(reference), promoWeekIds.has(week.id) ? 1 : 0));
        continue;
      }
      // 仅未来参考点缺失 → 比例回退或中位数回退（记录每个回退周，不叠加促销）。
      fallbackWeekIds.push(week.id);
      const futureValue = referenceNextFutureValue(referencePoints, age);
      if (futureValue !== null && recentMean !== null && recentMean > 0 && medianUnits !== null) {
        baseByWeek.set(week.id, Math.max(0, Math.round((medianUnits * futureValue) / recentMean)));
        fallbackReasons.push(
          `参考缺口回退 ${week.id}：参考同周龄销量缺失，按本品近 8 个有效实际周中位数 × 参考未来值 ÷ 参考近 8 周均值回退`,
        );
      } else if (medianUnits !== null) {
        baseByWeek.set(week.id, medianUnits);
        fallbackReasons.push(
          `参考缺口回退 ${week.id}：参考同周龄销量缺失且参考未来值不可用，按本品近 8 个有效实际周中位数回退`,
        );
      }
    }
  }

  const status: LearningStatus = coefficients === null
    ? 'fallback'
    : fallbackWeekIds.length > 0 ? 'partial' : 'completed';

  return {
    baseByWeek,
    evidence: {
      status,
      algorithm: 'ridge-log-volume-v1',
      sampleStart,
      sampleEnd,
      validSampleCount,
      trainCount,
      holdoutCount,
      featureNames: FEATURE_NAMES,
      coefficients,
      holdoutMae,
      holdoutMape,
      fallbackReasons,
      fallbackWeekIds,
    },
  };
}
