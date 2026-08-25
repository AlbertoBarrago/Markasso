import type { FreehandElement } from '../elements/element';
import { finishFreehandStroke } from './freehand_stroke';
import type { Tool, ToolContext } from './tool';

const MIN_DIST_SCREEN_PX = 2; // minimum on-screen distance between recorded points

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
    const simplified = finishFreehandStroke(this.points, this.pressures);
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
        pressures: simplified.pressures!,
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
