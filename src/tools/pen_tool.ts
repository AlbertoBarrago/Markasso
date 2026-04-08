import type { Tool, ToolContext } from './tool';
import type { FreehandElement } from '../elements/element';

const MIN_DIST_SQ = 4; // minimum 2px between points (squared) — reduces noise
const RDP_EPSILON = 0.5; // Ramer-Douglas-Peucker tolerance in world units (lower = smoother)
const SMOOTHING_FACTOR = 0.5; // Higher = smoother but less responsive (0-1)

export class PenTool implements Tool {
  private drawing = false;
  private points: [number, number][] = [];
  private smoothedPoints: [number, number][] = [];
  preview: FreehandElement | null = null;

  onMouseDown(_e: MouseEvent, worldX: number, worldY: number, ctx: ToolContext): void {
    this.drawing = true;
    this.points = [[worldX, worldY]];
    this.smoothedPoints = [[worldX, worldY]];
    this.preview = null;
    const { selectedIds, appState } = ctx.history.present;
    if (selectedIds.size > 0 || appState.lastCreatedId != null) {
      ctx.history.dispatch({ type: 'CLEAR_SELECTION' });
    }
  }

  onMouseMove(_e: MouseEvent, worldX: number, worldY: number, ctx: ToolContext): void {
    if (!this.drawing) return;

    // Only record a point if it's far enough from the last one
    const last = this.points[this.points.length - 1]!;
    const dx = worldX - last[0];
    const dy = worldY - last[1];
    if (dx * dx + dy * dy < MIN_DIST_SQ) return;

    this.points.push([worldX, worldY]);

    // Apply exponential moving average smoothing
    const prevSmoothed = this.smoothedPoints[this.smoothedPoints.length - 1]!;
    const smoothedX = prevSmoothed[0] + (worldX - prevSmoothed[0]) * SMOOTHING_FACTOR;
    const smoothedY = prevSmoothed[1] + (worldY - prevSmoothed[1]) * SMOOTHING_FACTOR;
    this.smoothedPoints.push([smoothedX, smoothedY]);

    // Create preview as soon as we have at least 2 points
    if (this.smoothedPoints.length < 2) return;

    const { appState } = ctx.history.present;
    const origin = this.smoothedPoints[0] ?? [0, 0];
    this.preview = {
      id: '__preview__',
      type: 'freehand',
      x: origin[0],
      y: origin[1],
      points: this.smoothedPoints.map((p) => p as [number, number]),
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
    this.smoothedPoints = [];
    this.preview = null;
  }

  onDeactivate(_ctx: ToolContext): void {
    this.drawing = false;
    this.points = [];
    this.smoothedPoints = [];
    this.preview = null;
  }

  onMouseUp(_e: MouseEvent, _worldX: number, _worldY: number, ctx: ToolContext): void {
    if (!this.drawing) return;
    this.drawing = false;
    this.preview = null;

    if (this.smoothedPoints.length < 2) return;

    const { appState } = ctx.history.present;
    const simplified = simplifyRDP(this.smoothedPoints, RDP_EPSILON);
    const origin = simplified[0] ?? [0, 0];
    ctx.history.dispatch({
      type: 'CREATE_ELEMENT',
      select: false,
      element: {
        id: crypto.randomUUID(),
        type: 'freehand',
        x: origin[0],
        y: origin[1],
        points: simplified.map((p) => p as [number, number]),
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

/** Ramer-Douglas-Peucker stroke simplification */
function simplifyRDP(points: [number, number][], epsilon: number): [number, number][] {
  if (points.length <= 2) return points;

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
    const left = simplifyRDP(points.slice(0, maxIdx + 1), epsilon);
    const right = simplifyRDP(points.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }

  return [first, last];
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
  return Math.hypot(p[0] - (lineStart[0] + t * dx), p[1] - (lineStart[1] + t * dy));
}
