import { describe, expect, it } from 'vitest';
import { createScene } from '../src/core/scene';
import type { TextElement } from '../src/elements/element';
import { History } from '../src/engine/history';
import { getSelectionHandles } from '../src/rendering/draw_selection';
import {
  anchorX,
  anchorY,
  computeResize,
  SelectTool,
} from '../src/tools/select_tool';
import type { ToolContext } from '../src/tools/tool';

function text(id = 'text', x = 0): TextElement {
  return {
    id,
    type: 'text',
    x,
    y: 0,
    width: 100,
    height: 40,
    fontSize: 20,
    fontFamily: 'Arial',
    content: 'Hello',
    strokeColor: '#fff',
    fillColor: 'transparent',
    strokeWidth: 1,
    opacity: 1,
    roughness: 0,
  };
}
const bounds = { x: 0, y: 0, w: 100, h: 40 };

describe('text resize', () => {
  it.each([
    'nw',
    'ne',
    'sw',
    'se',
  ] as const)('scales font and preserves aspect ratio from %s', (handle) => {
    const ax = anchorX(handle, bounds);
    const ay = anchorY(handle, bounds);
    const sx = handle.includes('w') ? -1 : 1;
    const sy = handle.includes('n') ? -1 : 1;
    const resized = computeResize(
      text(),
      handle,
      ax,
      ay,
      ax + sx * 250,
      ay + sy * 80,
      bounds,
      false,
      sx,
      sy,
    )!;
    expect(resized.width).toBe(200);
    expect(resized.height).toBe(80);
    expect(resized.fontSize).toBe(40);
    expect(resized.x! + (sx < 0 ? resized.width! : 0)).toBe(ax);
    expect(resized.y! + (sy < 0 ? resized.height! : 0)).toBe(ay);
  });

  it.each([
    'n',
    's',
    'w',
    'e',
  ] as const)('keeps the font unchanged for side %s', (handle) => {
    const resized = computeResize(
      text(),
      handle,
      anchorX(handle, bounds),
      anchorY(handle, bounds),
      handle === 'w' ? -100 : 200,
      handle === 'n' ? -40 : 80,
      bounds,
    )!;
    expect(resized.fontSize).toBeUndefined();
  });

  it.each([
    0.5, 1, 2, 4,
  ])('scales from original values at viewport zoom %s', (zoom) => {
    const original = Object.freeze(text());
    expect(
      computeResize(original, 'se', 0, 0, 200, 80, bounds, false, 1, 1, zoom)!
        .fontSize,
    ).toBe(40);
    expect(
      computeResize(original, 'se', 0, 0, 150, 60, bounds, false, 1, 1, zoom)!
        .fontSize,
    ).toBe(30);
    expect(
      computeResize(original, 'se', 0, 0, 50, 20, bounds, false, 1, 1, zoom)!
        .fontSize,
    ).toBe(10);
    expect(original.fontSize).toBe(20);
  });

  it('retains the minimum visible resize size', () => {
    expect(computeResize(text(), 'se', 0, 0, 1, 0.4, bounds)).toBeNull();
  });

  it('does not compound font scaling during group drag and undoes in one step', () => {
    const elements = [text('a'), text('b', 200)];
    const scene = {
      ...createScene(),
      elements,
      selectedIds: new Set(['a', 'b']),
    };
    const history = new History(scene);
    const ctx: ToolContext = {
      history,
      canvas: {
        getBoundingClientRect: () => ({ left: 0, top: 0 }),
      } as HTMLCanvasElement,
    };
    const tool = new SelectTool();
    const event = (x: number, y: number) =>
      ({ clientX: x, clientY: y, preventDefault() {} }) as MouseEvent;
    const handle = getSelectionHandles(elements, scene.viewport).find(
      (h) => h.position === 'se',
    )!;
    tool.onMouseDown(event(handle.screenX, handle.screenY), 300, 40, ctx);
    tool.onMouseMove(event(600, 80), 600, 80, ctx);
    tool.onMouseMove(event(900, 120), 900, 120, ctx);
    tool.onMouseUp(event(900, 120), 900, 120, ctx);
    for (const el of history.present.elements) {
      expect(el.type).toBe('text');
      if (el.type !== 'text') continue;
      expect(el.fontSize).toBe(60);
      expect(el.width).toBe(300);
      expect(el.height).toBe(120);
    }
    history.undo();
    expect(history.present.elements).toEqual(elements);
    history.redo();
    expect((history.present.elements[0] as TextElement).fontSize).toBe(60);
  });
});
