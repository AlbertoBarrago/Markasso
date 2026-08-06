/// <reference lib="webworker" />

import type { HandLandmarks, WorkerRequest, WorkerResponse } from './types';

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
      landmarker = await vision.HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
        runningMode: 'VIDEO',
        numHands: 1,
        minHandDetectionConfidence: 0.6,
        minHandPresenceConfidence: 0.6,
        minTrackingConfidence: 0.55,
      });
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
      const landmarks: HandLandmarks | null = hand
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
