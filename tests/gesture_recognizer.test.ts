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
    recognizer.update(hand('point'), 16);
    expect(recognizer.update(hand('point'), 32).state).toBe('arming');
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

  it('cancels drawing after a sustained ambiguous pose', () => {
    const recognizer = beginDrawing();
    for (const timestamp of [470, 503, 536, 569]) {
      recognizer.update(hand('none'), timestamp);
    }
    expect(recognizer.update(hand('none'), 704).state).toBe('absent');
  });
});

function beginDrawing(): GestureRecognizer {
  const recognizer = new GestureRecognizer();
  recognizer.update(hand('point'), 0);
  recognizer.update(hand('point'), 16);
  recognizer.update(hand('point'), 32);
  recognizer.update(hand('point'), 450);
  return recognizer;
}
