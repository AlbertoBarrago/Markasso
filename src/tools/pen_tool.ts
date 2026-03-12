import type { Tool, ToolContext } from './tool';
import type { FreehandElement } from '../elements/element';

const MIN_DIST_SQ = 9; // minimum 3px between points (squared) — reduces noise
const RDP_EPSILON = 1.5; // Ramer-Douglas-Peucker tolerance in world units

export class PenTool implements Tool {
  private drawing = false;
  private points: [number, number][] = [];
  preview: FreehandElement | null = null;

  onMouseDown(_e: MouseEvent, worldX: number, worldY: number, _ctx: ToolContext): void {
    this.drawing = true;
    this.points = [[worldX, worldY]];
    this.preview = null;
  }

  onMouseMove(_e: MouseEvent, worldX: number, worldY: number, ctx: ToolContext): void {
    if (!this.drawing) return;

    // Only record a point if it's far enough from the last one
    const last = this.points[this.points.length - 1]!;
    const dx = worldX - last[0];
    const dy = worldY - last[1];
    if (dx * dx + dy * dy < MIN_DIST_SQ) return;

    this.points.push([worldX, worldY]);

    // Don't flash a preview until we have a real stroke
    if (this.points.length < 3) return;

    const { appState } = ctx.history.present;
    const origin = this.points[0] ?? [0, 0];
    this.preview = {
      id: '__preview__',
      type: 'freehand',
      x: origin[0],
      y: origin[1],
      points: this.points.map((p) => p as [number, number]),
      strokeColor: appState.strokeColor,
      fillColor: 'transparent',
      strokeWidth: appState.strokeWidth,
      opacity: appState.opacity,
      roughness: appState.roughness,
      strokeStyle: appState.strokeStyle,
    };
    ctx.onPreviewUpdate?.();
  }

  onMouseUp(_e: MouseEvent, _worldX: number, _worldY: number, ctx: ToolContext): void {
    if (!this.drawing) return;
    this.drawing = false;
    this.preview = null;

    if (this.points.length < 2) return;

    const { appState } = ctx.history.present;
    const simplified = simplifyRDP(this.points, RDP_EPSILON);
    const origin = simplified[0] ?? [0, 0];
    ctx.history.dispatch({
      type: 'CREATE_ELEMENT',
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
    // Stay in pen mode — don't auto-select the stroke
    ctx.history.dispatch({ type: 'CLEAR_SELECTION' });
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
