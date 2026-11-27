export interface SmoothPricePathPoint {
  x: number;
  y: number | null;
  missing: boolean;
}

interface Point {
  x: number;
  y: number;
}

interface Anchor extends Point {
  sourceIndex: number;
}

export interface SmoothPricePathSegment {
  from: number;
  to: number;
  bridge: boolean;
  p0: Point;
  c1: Point;
  c2: Point;
  p1: Point;
  d: string;
}

const coordinate = (value: number): string => value.toFixed(3);

function chainSegments(anchors: Anchor[]): SmoothPricePathSegment[] {
  if (anchors.length < 2) return [];
  const dxs: number[] = [];
  const slopes: number[] = [];
  for (let i = 0; i < anchors.length - 1; i++) {
    const dx = anchors[i + 1].x - anchors[i].x;
    dxs.push(dx);
    slopes.push((anchors[i + 1].y - anchors[i].y) / dx);
  }
  const tangents = new Array<number>(anchors.length);
  tangents[0] = slopes[0];
  tangents[anchors.length - 1] = slopes[slopes.length - 1];
  for (let i = 1; i < anchors.length - 1; i++) {
    const before = slopes[i - 1];
    const after = slopes[i];
    if (before * after <= 0) {
      tangents[i] = 0;
    } else {
      const weight = dxs[i - 1] + dxs[i];
      tangents[i] = (3 * weight) / ((weight + dxs[i]) / before + (weight + dxs[i - 1]) / after);
    }
  }

  const segments: SmoothPricePathSegment[] = [];
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    const dx = b.x - a.x;
    if (!(dx > 0)) continue;
    const c1 = { x: a.x + dx / 3, y: a.y + tangents[i] * dx / 3 };
    const c2 = { x: b.x - dx / 3, y: b.y - tangents[i + 1] * dx / 3 };
    const d = `M ${coordinate(a.x)} ${coordinate(a.y)} C ${coordinate(c1.x)} ${coordinate(c1.y)} ${coordinate(c2.x)} ${coordinate(c2.y)} ${coordinate(b.x)} ${coordinate(b.y)}`;
    segments.push({
      from: a.sourceIndex,
      to: b.sourceIndex,
      bridge: b.sourceIndex > a.sourceIndex + 1,
      p0: { x: a.x, y: a.y },
      c1,
      c2,
      p1: { x: b.x, y: b.y },
      d,
    });
  }
  return segments;
}

export function buildSmoothPriceSegments(points: readonly SmoothPricePathPoint[]): SmoothPricePathSegment[] {
  const chains: Anchor[][] = [];
  let anchors: Anchor[] = [];
  const flush = (): void => {
    if (anchors.length > 1) chains.push(anchors);
    anchors = [];
  };
  points.forEach((point, sourceIndex) => {
    if (point.y != null && Number.isFinite(point.y)) {
      anchors.push({ sourceIndex, x: point.x, y: point.y });
      return;
    }
    if (!point.missing) flush();
  });
  flush();
  return chains.flatMap(chainSegments);
}
