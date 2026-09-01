import { describe, expect, it } from 'vitest';
import { GestureRecognizer } from '../src/gesture/gesture_recognizer';
import { hand } from './gesture_fixtures';

describe('GestureRecognizer', () => {
  it('confirms an open hand before entering ready', () => {
    const recognizer = new GestureRecognizer();
    expect(recognizer.update(hand('open'), 0).state).toBe('absent');
    expect(recognizer.update(hand('open'), 16).state).toBe('absent');
    expect(recognizer.update(hand('open'), 32).state).toBe('ready');
  });

  it('emits a stable pinch lifecycle', () => {
    const recognizer = new GestureRecognizer();
    expect(recognizer.update(hand('pinch'), 0).events).toHaveLength(0);
    expect(recognizer.update(hand('pinch'), 16).events[0]?.type).toBe(
      'pinch-start',
    );
    expect(recognizer.update(hand('pinch', 0.04), 32).events[0]?.type).toBe(
      'pinch-move',
    );
    recognizer.update(hand('open'), 48);
    recognizer.update(hand('open'), 64);
    expect(recognizer.update(hand('open'), 80).events[0]?.type).toBe(
      'pinch-end',
    );
  });

  it('starts drawing as soon as the pointing pose is confirmed', () => {
    const recognizer = new GestureRecognizer();
    const frame = recognizer.update(hand('point'), 0);
    expect(frame.state).toBe('drawing');
    expect(frame.events.some((event) => event.type === 'stroke-start')).toBe(
      true,
    );
  });

  it('starts drawing without requiring the pointing hand to stay still', () => {
    const recognizer = new GestureRecognizer();
    const frame = recognizer.update(hand('point', 0.2), 0);
    expect(frame.state).toBe('drawing');
    expect(frame.events[0]?.type).toBe('stroke-start');
  });

  it('records direct fingertip samples without cursor-filter lag', () => {
    const recognizer = new GestureRecognizer();
    recognizer.update(hand('point'), 0, { width: 1_000, height: 1_000 });

    const frame = recognizer.update(hand('point', 0.2), 16, {
      width: 1_000,
      height: 1_000,
    });

    expect(frame.trace.at(-1)?.x).toBeCloseTo(0.4);
    expect(frame.cursor!.x).toBeGreaterThan(frame.trace.at(-1)!.x);
    expect(frame.events.at(-1)).toEqual({
      type: 'stroke-move',
      point: frame.trace.at(-1),
    });
  });

  it.each([
    1_000 / 30,
    1_000 / 60,
  ])('finishes as soon as the open-hand pose is confirmed at %d ms frames', (frameDuration) => {
    const recognizer = beginValidDrawing();
    let timestamp = 650;
    let finishedOnFrame: number | null = null;

    for (let frameIndex = 1; frameIndex <= 5; frameIndex++) {
      const frame = recognizer.update(hand('open', 0.11), timestamp);
      if (frame.events.some((event) => event.type === 'stroke-end')) {
        finishedOnFrame = frameIndex;
        break;
      }
      timestamp += frameDuration;
    }

    // Confirmation is frame-count based (POSE_CONFIRMATION_FRAMES.open), not
    // a separate time-based hold, so it fires on the same frame regardless
    // of frame duration.
    expect(finishedOnFrame).toBe(3);
  });

  it.each([
    1_000 / 30,
    1_000 / 60,
  ])('finishes a valid drawing after a stationary point hold at %d ms frames', (frameDuration) => {
    const recognizer = beginValidDrawing();
    const holdStartedAt = 650;
    const lastMovementAt = 610;
    let finishedAt: number | null = null;

    for (
      let timestamp = holdStartedAt;
      timestamp <= holdStartedAt + 700;
      timestamp += frameDuration
    ) {
      const frame = recognizer.update(hand('point', 0.1), timestamp, {
        width: 1_000,
        height: 1_000,
      });
      if (frame.events.some((event) => event.type === 'stroke-end')) {
        finishedAt = timestamp;
        break;
      }
    }

    const elapsed = finishedAt! - lastMovementAt;
    expect(elapsed).toBeGreaterThanOrEqual(550);
    expect(elapsed).toBeLessThan(550 + frameDuration + 0.001);
  });

  it('resets stationary confirmation when drawing resumes', () => {
    const recognizer = beginValidDrawing();
    for (const timestamp of [650, 750, 850, 950]) {
      recognizer.update(hand('point', 0.1), timestamp, {
        width: 1_000,
        height: 1_000,
      });
    }

    const moving = recognizer.update(hand('point', 0.2), 1_000, {
      width: 1_000,
      height: 1_000,
    });
    expect(moving.state).toBe('drawing');
    expect(moving.armProgress).toBe(0);
    expect(moving.events.some((event) => event.type === 'stroke-end')).toBe(
      false,
    );
  });

  it('does not count tracking loss toward stationary confirmation', () => {
    const recognizer = beginValidDrawing();
    recognizer.update(hand('point', 0.1), 650, {
      width: 1_000,
      height: 1_000,
    });
    recognizer.update(hand('point', 0.1), 800, {
      width: 1_000,
      height: 1_000,
    });
    recognizer.update(null, 1_200);
    recognizer.update(hand('point', 0.1), 1_216, {
      width: 1_000,
      height: 1_000,
    });

    const resumed = recognizer.update(hand('point', 0.1), 1_232, {
      width: 1_000,
      height: 1_000,
    });
    expect(resumed.state).toBe('drawing');
    expect(resumed.armProgress).toBeLessThan(0.1);
    expect(resumed.events.some((event) => event.type === 'stroke-end')).toBe(
      false,
    );
  });

  it('rearms immediately after stationary confirmation without requiring movement', () => {
    const recognizer = beginValidDrawing();
    let timestamp = 650;
    let finished = recognizer.update(hand('point', 0.1), timestamp, {
      width: 1_000,
      height: 1_000,
    });
    while (!finished.events.some((event) => event.type === 'stroke-end')) {
      timestamp += 50;
      finished = recognizer.update(hand('point', 0.1), timestamp, {
        width: 1_000,
        height: 1_000,
      });
    }

    const rearmed = recognizer.update(hand('point', 0.1), timestamp + 16, {
      width: 1_000,
      height: 1_000,
    });
    expect(rearmed.state).toBe('drawing');
    expect(rearmed.events.some((event) => event.type === 'stroke-start')).toBe(
      true,
    );
  });

  it('keeps drawing when a brief open-hand misclassification clears', () => {
    const recognizer = beginValidDrawing();

    expect(recognizer.update(hand('open', 0.11), 650).state).toBe('drawing');
    expect(recognizer.update(hand('open', 0.11), 666).state).toBe('drawing');
    const resumed = recognizer.update(hand('point', 0.12), 682);

    expect(resumed.state).toBe('drawing');
    expect(resumed.events.some((event) => event.type === 'stroke-end')).toBe(
      false,
    );
  });

  it('resumes open-hand pose confirmation after a brief tracking dropout', () => {
    const recognizer = beginValidDrawing();
    recognizer.update(hand('open', 0.11), 650);
    recognizer.update(hand('open', 0.11), 666);

    // A dropout short enough to bridge (within DRAWING_TRACKING_GRACE_MS)
    // leaves the in-progress pose confirmation count intact.
    expect(recognizer.update(null, 682).state).toBe('drawing');

    const frame = recognizer.update(hand('open', 0.11), 698);
    expect(frame.events.some((event) => event.type === 'stroke-end')).toBe(
      true,
    );
  });

  it('bridges a brief tracking dropout and then resets', () => {
    const recognizer = new GestureRecognizer();
    recognizer.update(hand('open'), 0);
    recognizer.update(hand('open'), 16);
    expect(recognizer.update(hand('open'), 32).state).toBe('ready');
    expect(recognizer.update(null, 180).state).toBe('ready');
    expect(recognizer.update(null, 240).state).toBe('absent');
  });

  it('treats invalid landmarks as tracking loss without poisoning motion state', () => {
    const recognizer = new GestureRecognizer();
    recognizer.update(hand('open'), 0);
    recognizer.update(hand('open'), 16);
    expect(recognizer.update(hand('open'), 32).state).toBe('ready');
    const invalidHand = hand('open').map((point, index) =>
      index === 8 ? { ...point, x: Number.NaN } : point,
    );

    expect(recognizer.update(invalidHand, 180).state).toBe('ready');
    expect(recognizer.update(invalidHand, 240).state).toBe('absent');
    expect(
      Number.isFinite(recognizer.update(hand('point'), 256).cursor?.x),
    ).toBe(true);
  });

  it('ignores a brief ambiguous pose while drawing', () => {
    const recognizer = beginDrawing();
    expect(recognizer.update(hand('none'), 470).state).toBe('drawing');
    expect(recognizer.update(hand('point', 0.02), 486).state).toBe('drawing');
  });

  it('keeps drawing through a prolonged ambiguous pose', () => {
    const recognizer = beginDrawing();
    for (const timestamp of [470, 503, 536, 569]) {
      recognizer.update(hand('none'), timestamp);
    }
    expect(recognizer.update(hand('none'), 704).state).toBe('drawing');
    recognizer.update(hand('point', 0.02), 720);
    expect(recognizer.update(hand('point', 0.02), 736).state).toBe('drawing');
  });

  it('keeps drawing pending when the pointing pose is lost for a long time', () => {
    const recognizer = beginDrawing();
    for (const timestamp of [470, 503, 536, 569, 602, 635]) {
      recognizer.update(hand('none'), timestamp);
    }
    const pending = recognizer.update(hand('none'), 1_771);

    expect(pending.state).toBe('drawing');
    expect(pending.events.some((event) => event.type === 'stroke-end')).toBe(
      false,
    );
  });

  it('keeps drawing through a temporary full tracking loss', () => {
    const recognizer = beginDrawing();
    expect(recognizer.update(null, 700).state).toBe('drawing');
    expect(recognizer.update(hand('point', 0.02), 716).state).toBe('drawing');
  });

  it('keeps drawing pending after a prolonged full tracking loss', () => {
    const recognizer = beginDrawing();
    const pending = recognizer.update(null, 1_451);

    expect(pending.state).toBe('drawing');
    expect(pending.events.some((event) => event.type === 'stroke-end')).toBe(
      false,
    );
  });

  it('does not commit a valid partial stroke after prolonged tracking loss', () => {
    const recognizer = beginDrawing();
    for (let index = 1; index <= 10; index++) {
      recognizer.update(hand('point', index * 0.01), 450 + index * 34, {
        width: 1_000,
        height: 1_000,
      });
    }

    const frame = recognizer.update(null, 1_200);

    expect(frame.state).toBe('drawing');
    expect(frame.trace.length).toBeGreaterThanOrEqual(8);
    expect(frame.events.some((event) => event.type === 'stroke-end')).toBe(
      false,
    );
  });

  it('suspends the current action instead of bridging a stalled inference gap', () => {
    const recognizer = beginDrawing();
    for (let index = 1; index <= 10; index++) {
      recognizer.update(hand('point', index * 0.01), 450 + index * 16, {
        width: 1_000,
        height: 1_000,
      });
    }

    const recovered = recognizer.update(hand('point', 0.5), 1_200, {
      width: 1_000,
      height: 1_000,
    });

    const traceLength = recovered.trace.length;
    expect(recovered.state).toBe('drawing');
    expect(traceLength).toBeGreaterThanOrEqual(8);
    expect(recovered.events.some((event) => event.type === 'stroke-end')).toBe(
      false,
    );
    expect(recognizer.update(hand('point', 0.5), 1_216).trace).toHaveLength(
      traceLength,
    );

    const resumed = recognizer.update(hand('point', 0.11), 1_232, {
      width: 1_000,
      height: 1_000,
    });
    expect(resumed.trace.length).toBeGreaterThan(traceLength);
  });

  it('finishes a suspended stroke as soon as the open-hand pose reconfirms', () => {
    const recognizer = beginValidDrawing();
    // A dropout longer than DRAWING_TRACKING_GRACE_MS is a full tracking
    // loss: pose confirmation restarts from zero on recovery.
    recognizer.update(null, 1_200);

    const timestamps = [1_216, 1_248, 1_280];
    let finishedAt: number | null = null;
    for (const timestamp of timestamps) {
      const frame = recognizer.update(hand('open', 0.11), timestamp);
      if (frame.events.some((event) => event.type === 'stroke-end')) {
        finishedAt = timestamp;
        break;
      }
    }

    expect(finishedAt).toBe(1_280);
  });

  it('uses CSS pixels when deciding whether to record a trace point', () => {
    const smallViewport = beginDrawing();
    const largeViewport = beginDrawing();

    const smallFrame = smallViewport.update(hand('point', 0.003), 484, {
      width: 500,
      height: 500,
    });
    const largeFrame = largeViewport.update(hand('point', 0.003), 484, {
      width: 1_000,
      height: 1_000,
    });

    expect(smallFrame.trace).toHaveLength(1);
    expect(largeFrame.trace).toHaveLength(2);
  });

  it('fires a single instant delete event when a fist is confirmed, not a repeated hold', () => {
    const recognizer = new GestureRecognizer();
    const deleteFrames: boolean[] = [];
    for (let t = 0; t <= 96; t += 16) {
      const frame = recognizer.update(hand('none'), t);
      deleteFrames.push(frame.events.some((event) => event.type === 'delete'));
    }
    expect(deleteFrames.filter(Boolean)).toHaveLength(1);
    expect(recognizer.update(hand('none'), 112).state).toBe('ready');
  });

  it('cancels an in-progress pinch when the hand closes into a fist', () => {
    const recognizer = new GestureRecognizer();
    recognizer.update(hand('pinch'), 0);
    recognizer.update(hand('pinch'), 16);
    let frame = recognizer.update(hand('none'), 32);
    for (let t = 48; t <= 96; t += 16) {
      frame = recognizer.update(hand('none'), t);
      if (frame.events.some((event) => event.type === 'pinch-end')) break;
    }
    expect(frame.events.some((event) => event.type === 'pinch-end')).toBe(true);
    expect(frame.state).toBe('absent');
  });
});

function beginDrawing(): GestureRecognizer {
  const recognizer = new GestureRecognizer();
  recognizer.update(hand('point'), 0);
  for (const timestamp of [16, 100, 200, 300, 400, 450]) {
    recognizer.update(hand('point'), timestamp);
  }
  return recognizer;
}

function beginValidDrawing(): GestureRecognizer {
  const recognizer = beginDrawing();
  for (let index = 1; index <= 10; index++) {
    recognizer.update(hand('point', index * 0.01), 450 + index * 16, {
      width: 1_000,
      height: 1_000,
    });
  }
  return recognizer;
}
