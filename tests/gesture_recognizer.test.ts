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

  it('finishes an air stroke only after a confirmed open hand', () => {
    const recognizer = new GestureRecognizer();
    recognizer.update(hand('point'), 0);
    recognizer.update(hand('point'), 16);
    recognizer.update(hand('point'), 250);
    for (let index = 1; index < 12; index++) {
      recognizer.update(hand('point', index * 0.01), 250 + index * 34);
    }
    recognizer.update(hand('open', 0.11), 650);
    recognizer.update(hand('open', 0.11), 666);
    expect(
      recognizer
        .update(hand('open', 0.11), 682)
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
    expect(recognizer.update(null, 700).state).toBe('drawing');
    expect(recognizer.update(hand('point', 0.02), 716).state).toBe('drawing');
  });

  it('cancels drawing after a prolonged full tracking loss', () => {
    const recognizer = beginDrawing();
    expect(recognizer.update(null, 1_451).state).toBe('absent');
  });

  it('commits a valid partial stroke after a prolonged tracking loss', () => {
    const recognizer = beginDrawing();
    for (let index = 1; index <= 10; index++) {
      recognizer.update(hand('point', index * 0.01), 450 + index * 34, {
        width: 1_000,
        height: 1_000,
      });
    }

    const frame = recognizer.update(null, 1_200);

    expect(frame.state).toBe('absent');
    expect(frame.events.some((event) => event.type === 'stroke-end')).toBe(
      true,
    );
  });

  it('uses CSS pixels when deciding whether to record a trace point', () => {
    const smallViewport = beginDrawing();
    const largeViewport = beginDrawing();

    const smallFrame = smallViewport.update(hand('point', 0.01), 484, {
      width: 500,
      height: 500,
    });
    const largeFrame = largeViewport.update(hand('point', 0.01), 484, {
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
  recognizer.update(hand('point'), 16);
  recognizer.update(hand('point'), 450);
  return recognizer;
}
