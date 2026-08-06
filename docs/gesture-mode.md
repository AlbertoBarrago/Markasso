# Gesture Mode

Gesture Mode is an optional webcam-driven presentation feature. It is disabled by default and leaves the existing mouse, keyboard, touch, canvas, and command paths unchanged.

## Interaction

- Open hand: ready; after a drag or air stroke, release.
- Pinch: select the topmost unlocked element under the cursor.
- Pinch and move: move that element as one undoable history operation.
- Point with the index finger and hold still for 400 ms: arm air drawing. A progress ring makes the transition explicit and prevents accidental strokes.
- Move the index finger: record an air stroke and show the currently recognized shape.
- Open the hand: classify the stroke as a rectangle, ellipse, or connector and dispatch `CREATE_ELEMENT`.
- Successful commits morph the trace into a green final-shape pulse and show a localized “added” confirmation. Rejected strokes show an explicit error without changing the scene.

The preview is mirrored to match the user's expectation. Gesture coordinates are normalized, then converted through the current viewport before commands are dispatched.

Pose detection uses palm-relative distances and finger joint angles, so it is independent of hand rotation and camera distance. Pose changes require multiple consecutive frames, pinch detection has hysteresis, and a 200 ms grace window bridges short tracking dropouts. Cursor coordinates pass through a One Euro filter: stationary jitter is suppressed while faster movements remain responsive.

## Runtime architecture

The controller module itself is imported only after the toolbar action. `GestureController` owns camera permission, `MediaStream`, frame scheduling and disposal. It transfers at most one `ImageBitmap` at a time to a classic worker. The worker dynamically imports MediaPipe Tasks Vision 0.10.35, whose WASM bootstrap requires classic-worker `importScripts`, and performs synchronous inference away from the UI thread. `GestureRecognizer` converts landmarks into semantic events; `GestureCommandAdapter` is the only layer that knows Markasso commands.

Video pixels are processed locally by MediaPipe and are never stored or sent by Markasso. The MediaPipe code, WASM, and model are fetched only on first activation, so an internet connection is currently required. Google's MediaPipe privacy notice states that the Tasks API may send product usage metrics; camera frames remain on-device.

## Performance and failure handling

- Inference is capped at 30 FPS with one-frame backpressure.
- Only one hand is tracked and the 640×480 camera constraint limits transfer cost.
- Hidden tabs stop producing frames.
- Disabling, navigation, permission errors, or worker errors stop every media track, terminate the worker and remove overlays.
- Denied permission and unsupported browsers leave normal Markasso interaction untouched.
- Air strokes are resampled to a fixed point count before geometric fitting. Rectangle, ellipse, and line candidates are confidence-scored; ambiguous strokes are rejected instead of creating a surprising element.

## Manual verification

Use HTTPS or localhost. Verify permission granted and denied, selection/drag with undo, all three air shapes, toolbar state, tab backgrounding, reactivation, and that the browser camera indicator disappears immediately after disabling. Use browser performance tooling to confirm 30 FPS on target laptops; automated tests cannot benchmark a physical camera.

Append `?gestureDebug=1` to the URL to show the recognizer state, current shape prediction, and confidence. The diagnostic UI is not created or updated during the normal experience.

## Extension points

Add landmark poses to `GestureRecognizer`, semantic events to `types.ts`, and their command mapping to `GestureCommandAdapter`. Two-hand zoom should be a new event and dispatch the existing ephemeral `ZOOM_VIEWPORT` command.
