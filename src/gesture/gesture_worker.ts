/// <reference lib="webworker" />

interface WorkerLandmark {
  readonly x: number;
  readonly y: number;
  readonly z?: number;
}

type WorkerRequest =
  | { type: 'initialize' }
  | { type: 'detect'; frame: ImageBitmap; timestamp: number }
  | { type: 'dispose' };

type WorkerResponse =
  | { type: 'ready' }
  | {
      type: 'result';
      landmarks: ReadonlyArray<WorkerLandmark> | null;
      timestamp: number;
    }
  | { type: 'error'; message: string };

const VERSION = '0.10.35';
const MODULE_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/+esm`;
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/wasm`;
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

interface HandLandmarkerResult {
  landmarks: Array<Array<{ x: number; y: number; z?: number }>>;
}

interface HandLandmarkerInstance {
  detectForVideo(frame: ImageBitmap, timestamp: number): HandLandmarkerResult;
  close(): void;
}

interface VisionModule {
  FilesetResolver: { forVisionTasks(path: string): Promise<unknown> };
  HandLandmarker: {
    createFromOptions(
      fileset: unknown,
      options: unknown,
    ): Promise<HandLandmarkerInstance>;
  };
}

let landmarker: HandLandmarkerInstance | null = null;

self.onmessage = async (message: MessageEvent<WorkerRequest>) => {
  try {
    if (message.data.type === 'initialize') {
      const vision = (await import(
        /* @vite-ignore */ MODULE_URL
      )) as VisionModule;
      const fileset = await vision.FilesetResolver.forVisionTasks(WASM_URL);
      const options = (delegate: 'GPU' | 'CPU') => ({
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: 'VIDEO' as const,
        numHands: 1,
        minHandDetectionConfidence: 0.6,
        minHandPresenceConfidence: 0.6,
        minTrackingConfidence: 0.55,
      });
      // GPU delegate gives noticeably more stable landmarks than CPU, but
      // isn't guaranteed to be available in every worker/browser context
      // (needs WebGL support inside the worker) — fall back to CPU if it
      // fails to initialize rather than breaking Gesture Mode outright.
      try {
        landmarker = await vision.HandLandmarker.createFromOptions(
          fileset,
          options('GPU'),
        );
      } catch {
        landmarker = await vision.HandLandmarker.createFromOptions(
          fileset,
          options('CPU'),
        );
      }
      respond({ type: 'ready' });
      return;
    }
    if (message.data.type === 'detect') {
      const { frame, timestamp } = message.data;
      let result: HandLandmarkerResult;
      try {
        if (!landmarker) throw new Error('Hand tracker is not initialized');
        result = landmarker.detectForVideo(frame, timestamp);
      } finally {
        frame.close();
      }
      const hand = result.landmarks[0];
      const landmarks: ReadonlyArray<WorkerLandmark> | null = hand
        ? hand.map((point) => ({
            x: point.x,
            y: point.y,
            ...(point.z !== undefined && { z: point.z }),
          }))
        : null;
      respond({ type: 'result', landmarks, timestamp });
      return;
    }
    landmarker?.close();
    landmarker = null;
    self.close();
  } catch (error) {
    respond({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

function respond(message: WorkerResponse): void {
  self.postMessage(message);
}
