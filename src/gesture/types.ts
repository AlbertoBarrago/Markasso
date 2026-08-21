export interface GesturePoint {
  readonly x: number;
  readonly y: number;
  readonly z?: number;
}

export type HandLandmarks = ReadonlyArray<GesturePoint>;

export type GestureState =
  | 'absent'
  | 'ready'
  | 'pinching'
  | 'arming'
  | 'drawing'
  | 'selecting';

export type GestureShapeType = 'line' | 'rectangle' | 'ellipse' | 'freehand';

export type GestureEvent =
  | { type: 'pinch-start'; point: GesturePoint }
  | { type: 'pinch-move'; point: GesturePoint }
  | { type: 'pinch-end'; point: GesturePoint }
  | { type: 'stroke-start'; point: GesturePoint }
  | { type: 'stroke-move'; point: GesturePoint }
  | { type: 'stroke-end'; points: ReadonlyArray<GesturePoint> }
  | { type: 'select-all' }
  | { type: 'delete' };

export interface GestureFrame {
  /** Capture timestamp in the main-thread performance time origin. */
  readonly timestamp: number;
  readonly state: GestureState;
  readonly cursor: GesturePoint | null;
  readonly landmarks: HandLandmarks | null;
  /** Wrist-to-middle-MCP distance in normalized image space; null while tracking is lost. Smaller values mean a smaller or more distant hand, which needs looser hit tolerances to compensate for relatively larger tracking jitter. */
  readonly palmScale: number | null;
  readonly trace: ReadonlyArray<GesturePoint>;
  readonly armProgress: number;
  readonly prediction: GestureShapeType | null;
  readonly predictionConfidence: number;
  readonly events: ReadonlyArray<GestureEvent>;
}

export type WorkerRequest =
  | { type: 'initialize' }
  | { type: 'detect'; frame: ImageBitmap; timestamp: number }
  | { type: 'dispose' };

export type WorkerResponse =
  | { type: 'ready' }
  | {
      type: 'result';
      landmarks: HandLandmarks | null;
      timestamp: number;
      inferenceDurationMs: number;
    }
  | { type: 'error'; message: string };

export interface GestureDiagnostics {
  readonly cameraFps: number;
  readonly inferenceFps: number;
  readonly inferenceDurationMs: number;
  readonly latencyMs: number;
}
