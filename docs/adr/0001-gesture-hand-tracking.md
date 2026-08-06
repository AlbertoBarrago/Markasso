# ADR 0001: MediaPipe Tasks Vision for Gesture Mode

Status: Accepted

## Decision

Use MediaPipe Tasks Vision Hand Landmarker in a classic Web Worker, loaded on demand from version-pinned CDN assets. Keep gesture recognition deterministic and local rather than using MediaPipe's pre-trained gesture labels.

## Rationale

MediaPipe Hands is a legacy solution whose support ended in 2023. Hand Landmarker is the maintained API, provides the 21 landmarks needed for custom spatial gestures, and tracks between video frames to reduce repeated palm detection. Its web video inference is synchronous, so worker isolation is required to protect Canvas rendering. The worker must remain classic because the MediaPipe 0.10.35 WASM loader initializes `ModuleFactory` through `importScripts`; a module worker fails initialization with `ModuleFactory not set`.

The CDN preserves Markasso's zero-package runtime baseline and creates no disabled-mode bundle cost. Pinning avoids silent upgrades.

## Trade-offs

- First activation requires network access and depends on CDN availability.
- MediaPipe Tasks Vision remains marked as preview and must be retested before version upgrades.
- `ImageBitmap` transfer has a per-frame cost, bounded by 640×480, 30 FPS and backpressure.
- Heuristic shape recognition prioritizes predictable demo gestures over broad handwriting recognition.

Self-hosting the pinned JS, WASM and model is the preferred migration if offline Gesture Mode or supply-chain independence becomes a requirement. A fresh MediaPipe major release should not be adopted until worker behavior and model compatibility are validated.
