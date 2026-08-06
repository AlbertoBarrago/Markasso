export interface GesturePoint {
  readonly x: number;
  readonly y: number;
  readonly z?: number;
}

export type HandLandmarks = ReadonlyArray<GesturePoint>;

export type GestureState = 'absent' | 'ready' | 'pinching' | 'drawing';

export type GestureEvent =
  | { type: 'pinch-start'; point: GesturePoint }
  | { type: 'pinch-move'; point: GesturePoint }
  | { type: 'pinch-end'; point: GesturePoint }
  | { type: 'stroke-start'; point: GesturePoint }
  | { type: 'stroke-move'; point: GesturePoint }
  | { type: 'stroke-end'; points: ReadonlyArray<GesturePoint> };

export interface GestureFrame {
  readonly state: GestureState;
  readonly cursor: GesturePoint | null;
  readonly landmarks: HandLandmarks | null;
  readonly trace: ReadonlyArray<GesturePoint>;
  readonly events: ReadonlyArray<GestureEvent>;
}

export type WorkerRequest =
  | { type: 'initialize' }
  | { type: 'detect'; frame: ImageBitmap; timestamp: number }
  | { type: 'dispose' };

export type WorkerResponse =
  | { type: 'ready' }
  | { type: 'result'; landmarks: HandLandmarks | null; timestamp: number }
  | { type: 'error'; message: string };
