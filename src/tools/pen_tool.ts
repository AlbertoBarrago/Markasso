import type { FreehandElement } from '../elements/element';
import type { Tool, ToolContext } from './tool';

const MIN_DIST_SCREEN_PX = 2; // minimum on-screen distance between recorded points
const RDP_EPSILON = 0.5; // Ramer-Douglas-Peucker tolerance in world units (lower = smoother)
const SMOOTH_PASSES = 2; // centered-average smoothing passes applied once, at commit time

// Gesture-speed → synthetic pressure mapping, used when there's no real
// stylus pressure (mouse/trackpad/finger): slower movement reads as more
// pressure, mimicking how a real pen behaves.
const SPEED_MIN = 0.05; // world px/ms — at or below this, pressure is maxed out
const SPEED_MAX = 1.2; // world px/ms — at or above this, pressure is minimized
const PRESSURE_MIN = 0.25;
const PRESSURE_MAX = 1;
const DEFAULT_START_PRESSURE = 0.6;

// A real pause has no pointermove events at all, so `lastTimestamp` stays
// frozen at the last recorded point. If a gap this large elapses before the
// next point, the implied distance/time speed is meaninglessly low (it
// includes the idle time, not just the resumed motion) — treating it as
// "slow" would spike the synthetic pressure to max right at the resume
// point. Above this threshold we keep the previous pressure instead.
const PAUSE_GAP_MS = 150;

function velocityToPressure(speed: number): number {
  const ratio = Math.min(
    1,
    Math.max(0, (speed - SPEED_MIN) / (SPEED_MAX - SPEED_MIN)),
  );
  return PRESSURE_MAX - ratio * (PRESSURE_MAX - PRESSURE_MIN);
}

export class PenTool implements Tool {
  private drawing = false;
  private points: [number, number][] = [];
  private pressures: number[] = [];
  private lastTimestamp = 0;
  preview: FreehandElement | null = null;

  onMouseDown(
    e: MouseEvent,
    worldX: number,
    worldY: number,
    ctx: ToolContext,
  ): void {
    this.drawing = true;
    this.points = [[worldX, worldY]];
    this.pressures = [DEFAULT_START_PRESSURE];
    this.lastTimestamp = e.timeStamp;
    this.preview = null;
    const { selectedIds, appState } = ctx.history.present;
    if (selectedIds.size > 0 || appState.lastCreatedId != null) {
      ctx.history.dispatch({ type: 'CLEAR_SELECTION' });
    }
  }

  onMouseMove(
    e: MouseEvent,
    worldX: number,
    worldY: number,
    ctx: ToolContext,
  ): void {
    if (!this.drawing) return;

    const last = this.points[this.points.length - 1]!;
    const dx = worldX - last[0];
    const dy = worldY - last[1];
    const zoom = ctx.history.present.viewport.zoom;
    const minDistWorld = MIN_DIST_SCREEN_PX / zoom;
    if (dx * dx + dy * dy < minDistWorld * minDistWorld) return;

    const dist = Math.hypot(dx, dy);
    const dt = e.timeStamp - this.lastTimestamp;
    this.lastTimestamp = e.timeStamp;

    const pe = e as PointerEvent;
    const lastPressure = this.pressures[this.pressures.length - 1]!;
    const pressure =
      pe.pointerType === 'pen' && pe.pressure > 0
        ? pe.pressure
        : dt > PAUSE_GAP_MS
          ? lastPressure
          : velocityToPressure(dt > 0 ? dist / dt : 0);

    this.points.push([worldX, worldY]);
    this.pressures.push(pressure);

    // Live preview uses the raw points directly — no incremental smoothing —
    // so the stroke tracks the cursor with no perceived lag while drawing.
    if (this.points.length < 2) return;

    const { appState } = ctx.history.present;
    const origin = this.points[0]!;
    this.preview = {
      id: '__preview__',
      type: 'freehand',
      x: origin[0],
      y: origin[1],
      points: this.points.map((p) => p as [number, number]),
      pressures: [...this.pressures],
      strokeColor: appState.strokeColor,
      fillColor: 'transparent',
      strokeWidth: appState.strokeWidth,
      opacity: appState.opacity,
      roughness: appState.roughness,
      strokeStyle: appState.strokeStyle,
    };
    ctx.onPreviewUpdate?.();
  }

  onCancel(_ctx: ToolContext): void {
    // Discard the in-progress stroke without committing (e.g. second finger added,
    // or a touchcancel event fired). This prevents unwanted partial strokes on mobile.
    this.drawing = false;
    this.points = [];
    this.pressures = [];
    this.preview = null;
  }

  onDeactivate(_ctx: ToolContext): void {
    this.drawing = false;
    this.points = [];
    this.pressures = [];
    this.preview = null;
  }

  onMouseUp(
    _e: MouseEvent,
    _worldX: number,
    _worldY: number,
    ctx: ToolContext,
  ): void {
    if (!this.drawing) return;
    this.drawing = false;
    this.preview = null;

    if (this.points.length < 2) return;

    const { appState } = ctx.history.present;
    const smoothed = smoothCentered(this.points, this.pressures, SMOOTH_PASSES);
    const simplified = simplifyRDP(
      smoothed.points,
      smoothed.pressures,
      RDP_EPSILON,
    );
    const origin = simplified.points[0] ?? [0, 0];
    ctx.history.dispatch({
      type: 'CREATE_ELEMENT',
      select: false,
      element: {
        id: crypto.randomUUID(),
        type: 'freehand',
        x: origin[0],
        y: origin[1],
        points: simplified.points.map((p) => p as [number, number]),
        pressures: simplified.pressures,
        strokeColor: appState.strokeColor,
        fillColor: 'transparent',
        strokeWidth: appState.strokeWidth,
        opacity: appState.opacity,
        roughness: appState.roughness,
        strokeStyle: appState.strokeStyle,
      },
    });
  }

  getCursor(): string {
    return 'crosshair';
  }
}

/**
 * Non-causal centered-average smoothing, applied once at commit time (not
 * per-frame while drawing) — removes hand jitter without the lag a real-time
 * causal filter (e.g. EMA) would introduce into the live preview.
 */
function smoothCentered(
  points: [number, number][],
  pressures: number[],
  passes: number,
): { points: [number, number][]; pressures: number[] } {
  if (points.length < 3)
    return { points: [...points], pressures: [...pressures] };

  let pts = points;
  let prs = pressures;
  for (let pass = 0; pass < passes; pass++) {
    const nextPts: [number, number][] = [pts[0]!];
    const nextPrs: number[] = [prs[0]!];
    for (let i = 1; i < pts.length - 1; i++) {
      const prev = pts[i - 1]!;
      const curr = pts[i]!;
      const next = pts[i + 1]!;
      nextPts.push([
        (prev[0] + 2 * curr[0] + next[0]) / 4,
        (prev[1] + 2 * curr[1] + next[1]) / 4,
      ]);
      nextPrs.push((prs[i - 1]! + 2 * prs[i]! + prs[i + 1]!) / 4);
    }
    nextPts.push(pts[pts.length - 1]!);
    nextPrs.push(prs[prs.length - 1]!);
    pts = nextPts;
    prs = nextPrs;
  }
  return { points: pts, pressures: prs };
}

/** Ramer-Douglas-Peucker stroke simplification (preserves corresponding pressure values) */
function simplifyRDP(
  points: [number, number][],
  pressures: number[],
  epsilon: number,
): { points: [number, number][]; pressures: number[] } {
  if (points.length <= 2) return { points, pressures };

  let maxDist = 0;
  let maxIdx = 0;
  const first = points[0]!;
  const last = points[points.length - 1]!;

  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDist(points[i]!, first, last);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }

  if (maxDist > epsilon) {
    const left = simplifyRDP(
      points.slice(0, maxIdx + 1),
      pressures.slice(0, maxIdx + 1),
      epsilon,
    );
    const right = simplifyRDP(
      points.slice(maxIdx),
      pressures.slice(maxIdx),
      epsilon,
    );
    return {
      points: [...left.points.slice(0, -1), ...right.points],
      pressures: [...left.pressures.slice(0, -1), ...right.pressures],
    };
  }

  return {
    points: [first, last],
    pressures: [pressures[0]!, pressures[pressures.length - 1]!],
  };
}

function perpendicularDist(
  p: [number, number],
  lineStart: [number, number],
  lineEnd: [number, number],
): number {
  const dx = lineEnd[0] - lineStart[0];
  const dy = lineEnd[1] - lineStart[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p[0] - lineStart[0], p[1] - lineStart[1]);
  const t = ((p[0] - lineStart[0]) * dx + (p[1] - lineStart[1]) * dy) / lenSq;
  return Math.hypot(
    p[0] - (lineStart[0] + t * dx),
    p[1] - (lineStart[1] + t * dy),
  );
}
