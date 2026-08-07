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

  it('finishes an air stroke only after a confirmed open hand', () => {
    const recognizer = new GestureRecognizer();
    recognizer.update(hand('point'), 0);
    expect(recognizer.update(hand('point'), 16).state).toBe('arming');
    expect(recognizer.update(hand('point'), 450).state).toBe('drawing');
    for (let index = 1; index < 12; index++) {
      recognizer.update(hand('point', index * 0.01), 450 + index * 34);
    }
    recognizer.update(hand('open', 0.11), 850);
    recognizer.update(hand('open', 0.11), 866);
    expect(
      recognizer
        .update(hand('open', 0.11), 882)
        .events.some((event) => event.type === 'stroke-end'),
    ).toBe(true);
  });

  it('bridges a brief tracking dropout and then resets', () => {
    const recognizer = new GestureRecognizer();
    recognizer.update(hand('open'), 0);
    recognizer.update(hand('open'), 16);
    expect(recognizer.update(hand('open'), 32).state).toBe('ready');
    expect(recognizer.update(null, 180).state).toBe('ready');
    expect(recognizer.update(null, 240).state).toBe('absent');
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

  it('cancels drawing when the pointing pose is lost for too long', () => {
    const recognizer = beginDrawing();
    for (const timestamp of [470, 503, 536, 569, 602, 635]) {
      recognizer.update(hand('none'), timestamp);
    }
    expect(recognizer.update(hand('none'), 1_771).state).toBe('absent');
  });

  it('keeps drawing through a temporary full tracking loss', () => {
    const recognizer = beginDrawing();
    expect(recognizer.update(null, 1_200).state).toBe('drawing');
    expect(recognizer.update(hand('point', 0.02), 1_216).state).toBe('drawing');
  });

  it('cancels drawing after a prolonged full tracking loss', () => {
    const recognizer = beginDrawing();
    expect(recognizer.update(null, 1_451).state).toBe('absent');
  });

  it('fires a delete event after holding a fist over the same spot', () => {
    const recognizer = new GestureRecognizer();
    let frame = recognizer.update(hand('none'), 0);
    for (let t = 16; t <= 900; t += 16) {
      frame = recognizer.update(hand('none'), t);
      if (frame.events.some((event) => event.type === 'delete')) break;
    }
    expect(frame.events.some((event) => event.type === 'delete')).toBe(true);
  });

  it('cancels the delete hold if the fist drifts away before firing', () => {
    const recognizer = new GestureRecognizer();
    for (let t = 0; t <= 160; t += 16) {
      recognizer.update(hand('none'), t);
    }
    // Drift far enough to exceed the movement radius before the hold completes.
    const frame = recognizer.update(hand('none', 0.2), 176);
    expect(frame.events.some((event) => event.type === 'delete')).toBe(false);
    expect(frame.state).toBe('deleting');
  });
});

function beginDrawing(): GestureRecognizer {
  const recognizer = new GestureRecognizer();
  recognizer.update(hand('point'), 0);
  recognizer.update(hand('point'), 16);
  recognizer.update(hand('point'), 450);
  return recognizer;
}
