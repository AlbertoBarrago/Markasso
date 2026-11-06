import { describe, expect, it } from 'vitest';
import type { Viewport } from '../src/core/viewport';
import {
  followViewport,
  placeEditor,
  TEXT_EDITOR_Z_INDEX,
  type ViewportSource,
} from '../src/tools/editor_overlay';

/** History stand-in: holds a viewport and notifies subscribers on change. */
function makeSource(initial: Viewport) {
  let listeners: Array<(scene: { viewport: Viewport }) => void> = [];
  const source = {
    present: { viewport: initial },
    subscribe(listener: (scene: { viewport: Viewport }) => void) {
      listeners.push(listener);
      return () => {
        listeners = listeners.filter((l) => l !== listener);
      };
    },
    set(viewport: Viewport) {
      source.present = { viewport };
      for (const l of listeners) l(source.present);
    },
    count: () => listeners.length,
  };
  return source satisfies ViewportSource;
}

function makeEditor(left: number, top: number) {
  const style = {
    left: `${left}px`,
    top: `${top}px`,
    transform: '',
    transformOrigin: '',
  } as unknown as CSSStyleDeclaration;
  return { style };
}

const canvas = { getBoundingClientRect: () => ({ left: 10, top: 20 }) };

describe('placeEditor', () => {
  it('maps the world anchor to screen and scales by the zoom ratio', () => {
    const p = placeEditor(
      { offsetX: 5, offsetY: 7, zoom: 2 },
      100,
      50,
      1,
      10,
      20,
    );
    expect(p).toEqual({ left: 215, top: 127, scale: 2 });
  });
});

describe('followViewport', () => {
  it('moves the editor with a pan instead of staying in place', () => {
    const source = makeSource({ offsetX: 0, offsetY: 0, zoom: 1 });
    // Opened over world (100, 50): screen (100, 50) + canvas offset (10, 20).
    const editor = makeEditor(110, 70);
    followViewport(editor, source, canvas);

    source.set({ offsetX: -40, offsetY: 30, zoom: 1 });

    expect(editor.style.left).toBe('70px');
    expect(editor.style.top).toBe('100px');
    expect(editor.style.transform).toBe('');
  });

  it('scales from the top-left corner on zoom, relative to the opening zoom', () => {
    const source = makeSource({ offsetX: 0, offsetY: 0, zoom: 2 });
    // World (50, 25) at zoom 2 is screen (100, 50).
    const editor = makeEditor(110, 70);
    followViewport(editor, source, canvas);
    expect(editor.style.transformOrigin).toBe('0 0');

    source.set({ offsetX: 0, offsetY: 0, zoom: 4 });

    expect(editor.style.left).toBe('210px');
    expect(editor.style.top).toBe('120px');
    expect(editor.style.transform).toBe('scale(2)');
  });

  it('ignores scene changes that keep the same viewport', () => {
    const viewport = { offsetX: 0, offsetY: 0, zoom: 1 };
    const source = makeSource(viewport);
    const editor = makeEditor(110, 70);
    followViewport(editor, source, canvas);
    editor.style.left = '999px';

    source.set(viewport);

    expect(editor.style.left).toBe('999px');
  });

  it('stops following once unsubscribed', () => {
    const source = makeSource({ offsetX: 0, offsetY: 0, zoom: 1 });
    const editor = makeEditor(110, 70);
    const unfollow = followViewport(editor, source, canvas);
    unfollow();

    source.set({ offsetX: 500, offsetY: 500, zoom: 1 });

    expect(source.count()).toBe(0);
    expect(editor.style.left).toBe('110px');
  });
});

describe('TEXT_EDITOR_Z_INDEX', () => {
  it('sits above the canvas and below the toolbar and context panel', () => {
    const z = Number(TEXT_EDITOR_Z_INDEX);
    expect(z).toBeGreaterThan(1); // #workspace
    expect(z).toBeLessThan(10); // toolbar islands
  });
});
