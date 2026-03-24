/**
 * Mobile touch sequence tests for all drawing tools.
 *
 * These tests verify the touch-event path used by canvas_view.ts on mobile:
 *   touchstart → onMouseDown(syntheticMouse, wx, wy, ctx)
 *   touchmove  → onMouseMove(syntheticMouse, wx, wy, ctx)  (repeated)
 *   touchend   → onMouseUp(syntheticMouse,   wx, wy, ctx)
 *
 * Regression context — accessibility commit aec0186 added `canvas.focus()` inside
 * the touchstart handler. On iOS Safari this caused the browser to cancel subsequent
 * touchmove events, so the PenTool never accumulated enough points to create a stroke.
 * The fix (4583c3c) removed that call and the `tabindex="0"` attribute from the canvas.
 * These tests guard against that regression being reintroduced.
 */

import { describe, it, expect } from 'vitest';
import { History } from '../src/engine/history';
import { createScene } from '../src/core/scene';
import { PenTool } from '../src/tools/pen_tool';
import { RectangleTool } from '../src/tools/rectangle_tool';
import { EllipseTool } from '../src/tools/ellipse_tool';
import { LineTool } from '../src/tools/line_tool';
import { ArrowTool } from '../src/tools/arrow_tool';
import { RomboTool } from '../src/tools/rombo_tool';
import { EraserTool } from '../src/tools/eraser_tool';
import { HandTool } from '../src/tools/hand_tool';
import { SelectTool } from '../src/tools/select_tool';
import type { ToolContext } from '../src/tools/tool';
import type { RectangleElement } from '../src/elements/element';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Minimal MouseEvent-like object mirroring what canvas_view.ts produces:
 *   new MouseEvent(type, { clientX, clientY, bubbles: false })
 * Tools that do not use the event (pen, eraser) prefix the param with `_`.
 * Tools that do (hand, select, rect shiftKey) only read the listed props.
 */
function me(clientX = 0, clientY = 0, shiftKey = false): MouseEvent {
  return { clientX, clientY, shiftKey, preventDefault: () => {} } as unknown as MouseEvent;
}

/**
 * ToolContext with a real History and a minimal canvas mock.
 * The canvas mock returns a zero-origin bounding rect so that, with the
 * default viewport (offsetX=0, offsetY=0, zoom=1), clientX/Y == worldX/Y.
 */
function makeCtx(history: History): ToolContext {
  return {
    history,
    canvas: {
      getBoundingClientRect: () =>
        ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 }) as DOMRect,
    } as HTMLCanvasElement,
    onPreviewUpdate: () => {},
  };
}

function makeRect(overrides: Partial<RectangleElement> = {}): RectangleElement {
  return {
    id: 'el-1',
    type: 'rectangle',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    strokeColor: '#fff',
    fillColor: 'transparent',
    strokeWidth: 1,
    opacity: 1,
    roughness: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// PenTool
// ---------------------------------------------------------------------------

describe('PenTool — mobile touch sequence', () => {
  it('creates a freehand element after touchstart → touchmove × N → touchend', () => {
    const history = new History(createScene());
    const tool = new PenTool();
    const ctx = makeCtx(history);

    // touchstart
    tool.onMouseDown(me(0, 0), 0, 0, ctx);
    // touchmove — each step is > 2px away so points accumulate
    tool.onMouseMove(me(10, 0), 10, 0, ctx);
    tool.onMouseMove(me(20, 0), 20, 0, ctx);
    tool.onMouseMove(me(30, 0), 30, 0, ctx);
    tool.onMouseMove(me(40, 0), 40, 0, ctx);
    // touchend
    tool.onMouseUp(me(40, 0), 40, 0, ctx);

    expect(history.present.elements).toHaveLength(1);
    expect(history.present.elements[0]?.type).toBe('freehand');
  });

  it('does not create an element on a simple tap (no touchmove)', () => {
    // Regression: if canvas.focus() in touchstart caused touchmoves to be
    // swallowed, only a touchstart + touchend would fire — which is identical
    // to this scenario. The tool must silently discard it.
    const history = new History(createScene());
    const tool = new PenTool();
    const ctx = makeCtx(history);

    tool.onMouseDown(me(50, 50), 50, 50, ctx);
    tool.onMouseUp(me(50, 50), 50, 50, ctx);

    expect(history.present.elements).toHaveLength(0);
  });

  it('discards the stroke when a second finger cancels (onCancel)', () => {
    // canvas_view.ts now calls onCancel() — not onMouseUp() — when a second
    // finger is detected, so partial strokes are not committed as unwanted shapes.
    const history = new History(createScene());
    const tool = new PenTool();
    const ctx = makeCtx(history);

    tool.onMouseDown(me(0, 0), 0, 0, ctx);
    tool.onMouseMove(me(10, 0), 10, 0, ctx);
    tool.onMouseMove(me(20, 0), 20, 0, ctx);

    // canvas_view detects second finger and calls onCancel()
    tool.onCancel(ctx);

    // Subsequent moves after cancellation must be ignored
    tool.onMouseMove(me(30, 0), 30, 0, ctx);
    tool.onMouseMove(me(40, 0), 40, 0, ctx);

    expect(history.present.elements).toHaveLength(0);
    expect(tool.preview).toBeNull();
  });

  it('shows a preview while drawing and clears it on touchend', () => {
    const history = new History(createScene());
    const tool = new PenTool();
    const ctx = makeCtx(history);

    tool.onMouseDown(me(0, 0), 0, 0, ctx);
    expect(tool.preview).toBeNull();

    tool.onMouseMove(me(10, 0), 10, 0, ctx);
    tool.onMouseMove(me(20, 0), 20, 0, ctx);
    expect(tool.preview).not.toBeNull();
    expect(tool.preview?.type).toBe('freehand');

    tool.onMouseUp(me(20, 0), 20, 0, ctx);
    expect(tool.preview).toBeNull();
  });

  it('respects the minimum-distance filter (< 2 px moves are skipped)', () => {
    const history = new History(createScene());
    const tool = new PenTool();
    const ctx = makeCtx(history);

    tool.onMouseDown(me(0, 0), 0, 0, ctx);
    // Sub-threshold moves — none of these should add points
    tool.onMouseMove(me(0.5, 0), 0.5, 0, ctx);
    tool.onMouseMove(me(1, 0), 1, 0, ctx);
    tool.onMouseMove(me(1.3, 0), 1.3, 0, ctx);
    tool.onMouseUp(me(1.3, 0), 1.3, 0, ctx);

    // Only 1 smoothed point (the start) → nothing created
    expect(history.present.elements).toHaveLength(0);
  });

  it('carries appState stroke properties onto the created element', () => {
    const history = new History(createScene());
    history.dispatch({ type: 'SET_STROKE_COLOR', color: '#ff0000' });
    history.dispatch({ type: 'SET_STROKE_WIDTH', width: 4 });

    const tool = new PenTool();
    const ctx = makeCtx(history);

    tool.onMouseDown(me(0, 0), 0, 0, ctx);
    tool.onMouseMove(me(50, 0), 50, 0, ctx);
    tool.onMouseUp(me(50, 0), 50, 0, ctx);

    const el = history.present.elements[0];
    expect(el?.strokeColor).toBe('#ff0000');
    expect(el?.strokeWidth).toBe(4);
  });

  it('can draw normally after onCancel resets state', () => {
    const history = new History(createScene());
    const tool = new PenTool();
    const ctx = makeCtx(history);

    // Cancelled stroke
    tool.onMouseDown(me(0, 0), 0, 0, ctx);
    tool.onMouseMove(me(20, 0), 20, 0, ctx);
    tool.onCancel(ctx);

    // Normal stroke after the cancel
    tool.onMouseDown(me(0, 0), 0, 0, ctx);
    tool.onMouseMove(me(50, 0), 50, 0, ctx);
    tool.onMouseUp(me(50, 0), 50, 0, ctx);

    expect(history.present.elements).toHaveLength(1);
    expect(history.present.elements[0]?.type).toBe('freehand');
  });

  it('can draw a second stroke after the first is committed', () => {
    const history = new History(createScene());
    const tool = new PenTool();
    const ctx = makeCtx(history);

    // First stroke
    tool.onMouseDown(me(0, 0), 0, 0, ctx);
    tool.onMouseMove(me(30, 0), 30, 0, ctx);
    tool.onMouseUp(me(30, 0), 30, 0, ctx);

    // Second stroke
    tool.onMouseDown(me(100, 100), 100, 100, ctx);
    tool.onMouseMove(me(130, 100), 130, 100, ctx);
    tool.onMouseUp(me(130, 100), 130, 100, ctx);

    expect(history.present.elements).toHaveLength(2);
    expect(history.present.elements[1]?.type).toBe('freehand');
  });
});

// ---------------------------------------------------------------------------
// RectangleTool
// ---------------------------------------------------------------------------

describe('RectangleTool — mobile touch sequence', () => {
  it('creates a rectangle from a drag gesture', () => {
    const history = new History(createScene());
    const tool = new RectangleTool();
    const ctx = makeCtx(history);

    tool.onMouseDown(me(0, 0), 0, 0, ctx);
    tool.onMouseMove(me(100, 60), 100, 60, ctx);
    tool.onMouseUp(me(100, 60), 100, 60, ctx);

    expect(history.present.elements).toHaveLength(1);
    expect(history.present.elements[0]?.type).toBe('rectangle');
  });

  it('does not create a rectangle for a tiny tap (< 2px)', () => {
    const history = new History(createScene());
    const tool = new RectangleTool();
    const ctx = makeCtx(history);

    tool.onMouseDown(me(0, 0), 0, 0, ctx);
    tool.onMouseUp(me(1, 1), 1, 1, ctx);

    expect(history.present.elements).toHaveLength(0);
  });

  it('shows a preview element while dragging', () => {
    const history = new History(createScene());
    const tool = new RectangleTool();
    const ctx = makeCtx(history);

    tool.onMouseDown(me(0, 0), 0, 0, ctx);
    tool.onMouseMove(me(50, 40), 50, 40, ctx);
    expect(tool.preview).not.toBeNull();
    expect(tool.preview?.type).toBe('rectangle');

    tool.onMouseUp(me(50, 40), 50, 40, ctx);
    expect(tool.preview).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// EllipseTool
// ---------------------------------------------------------------------------

describe('EllipseTool — mobile touch sequence', () => {
  it('creates an ellipse from a drag gesture', () => {
    const history = new History(createScene());
    const tool = new EllipseTool();
    const ctx = makeCtx(history);

    tool.onMouseDown(me(0, 0), 0, 0, ctx);
    tool.onMouseMove(me(80, 60), 80, 60, ctx);
    tool.onMouseUp(me(80, 60), 80, 60, ctx);

    expect(history.present.elements).toHaveLength(1);
    expect(history.present.elements[0]?.type).toBe('ellipse');
  });

  it('does not create an ellipse for a tiny tap (< 2px)', () => {
    const history = new History(createScene());
    const tool = new EllipseTool();
    const ctx = makeCtx(history);

    tool.onMouseDown(me(0, 0), 0, 0, ctx);
    tool.onMouseUp(me(1, 1), 1, 1, ctx);

    expect(history.present.elements).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// LineTool
// ---------------------------------------------------------------------------

describe('LineTool — mobile touch sequence', () => {
  it('creates a line from a drag gesture', () => {
    const history = new History(createScene());
    const tool = new LineTool();
    const ctx = makeCtx(history);

    tool.onMouseDown(me(0, 0), 0, 0, ctx);
    tool.onMouseMove(me(100, 0), 100, 0, ctx);
    tool.onMouseUp(me(100, 0), 100, 0, ctx);

    expect(history.present.elements).toHaveLength(1);
    expect(history.present.elements[0]?.type).toBe('line');
  });

  it('does not create a line for a tiny tap (< 2px)', () => {
    const history = new History(createScene());
    const tool = new LineTool();
    const ctx = makeCtx(history);

    tool.onMouseDown(me(0, 0), 0, 0, ctx);
    tool.onMouseUp(me(1, 1), 1, 1, ctx);

    expect(history.present.elements).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// RomboTool
// ---------------------------------------------------------------------------

describe('RomboTool — mobile touch sequence', () => {
  it('creates a single rhombus element', () => {
    const history = new History(createScene());
    const tool = new RomboTool();
    const ctx = makeCtx(history);

    tool.onMouseDown(me(0, 0), 0, 0, ctx);
    tool.onMouseMove(me(100, 60), 100, 60, ctx);
    tool.onMouseUp(me(100, 60), 100, 60, ctx);

    expect(history.present.elements).toHaveLength(1);
    const el = history.present.elements[0]!;
    expect(el.type).toBe('rhombus');
    if (el.type !== 'rhombus') throw new Error('expected rhombus');
    expect(el.width).toBe(100);
    expect(el.height).toBe(60);
  });

  it('does not create elements for tiny taps (< 2px)', () => {
    const history = new History(createScene());
    const tool = new RomboTool();
    const ctx = makeCtx(history);

    tool.onMouseDown(me(10, 10), 10, 10, ctx);
    tool.onMouseUp(me(11, 11), 11, 11, ctx);

    expect(history.present.elements).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// ArrowTool
// ---------------------------------------------------------------------------

describe('ArrowTool — mobile touch sequence', () => {
  it('creates an arrow from a drag gesture', () => {
    const history = new History(createScene());
    const tool = new ArrowTool();
    const ctx = makeCtx(history);

    tool.onMouseDown(me(0, 0), 0, 0, ctx);
    tool.onMouseMove(me(100, 0), 100, 0, ctx);
    tool.onMouseUp(me(100, 0), 100, 0, ctx);

    expect(history.present.elements).toHaveLength(1);
    expect(history.present.elements[0]?.type).toBe('arrow');
  });

  it('does not create an arrow for a tiny tap (< 2px)', () => {
    const history = new History(createScene());
    const tool = new ArrowTool();
    const ctx = makeCtx(history);

    tool.onMouseDown(me(0, 0), 0, 0, ctx);
    tool.onMouseUp(me(1, 0), 1, 0, ctx);

    expect(history.present.elements).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// EraserTool
// ---------------------------------------------------------------------------

describe('EraserTool — mobile touch sequence', () => {
  it('deletes an element at the touch position', () => {
    const history = new History(createScene());
    history.dispatch({ type: 'CREATE_ELEMENT', element: makeRect() });
    expect(history.present.elements).toHaveLength(1);

    const tool = new EraserTool();
    const ctx = makeCtx(history);

    // Touch center of the rectangle (0,0,100,100)
    tool.onMouseDown(me(50, 50), 50, 50, ctx);

    expect(history.present.elements).toHaveLength(0);
  });

  it('does not delete anything when touching empty space', () => {
    const history = new History(createScene());
    history.dispatch({ type: 'CREATE_ELEMENT', element: makeRect() });

    const tool = new EraserTool();
    const ctx = makeCtx(history);

    // Touch well outside the element (and beyond the 4px pad)
    tool.onMouseDown(me(200, 200), 200, 200, ctx);

    expect(history.present.elements).toHaveLength(1);
  });

  it('highlights hovered element on touchmove without erasing', () => {
    const history = new History(createScene());
    history.dispatch({ type: 'CREATE_ELEMENT', element: makeRect() });

    const tool = new EraserTool();
    const ctx = makeCtx(history);

    tool.onMouseMove(me(50, 50), 50, 50, ctx);
    expect(tool.hoveredId).toBe('el-1');

    // Moving away clears hover
    tool.onMouseMove(me(200, 200), 200, 200, ctx);
    expect(tool.hoveredId).toBeNull();
  });

  it('stops erasing after touchend', () => {
    const history = new History(createScene());
    history.dispatch({ type: 'CREATE_ELEMENT', element: makeRect() });
    history.dispatch({
      type: 'CREATE_ELEMENT',
      element: makeRect({ id: 'el-2', x: 200, y: 200 }),
    });

    const tool = new EraserTool();
    const ctx = makeCtx(history);

    tool.onMouseDown(me(50, 50), 50, 50, ctx);   // erases el-1
    tool.onMouseUp();                             // stops erasing

    // Moving over el-2 after touchend must not erase it
    tool.onMouseMove(me(250, 250), 250, 250, ctx);

    expect(history.present.elements).toHaveLength(1);
    expect(history.present.elements[0]?.id).toBe('el-2');
  });
});

// ---------------------------------------------------------------------------
// HandTool
// ---------------------------------------------------------------------------

describe('HandTool — mobile touch sequence', () => {
  it('pans the viewport on single-finger drag', () => {
    const history = new History(createScene());
    const initialOffsetX = history.present.viewport.offsetX;
    const initialOffsetY = history.present.viewport.offsetY;

    const tool = new HandTool();
    const ctx = makeCtx(history);

    // touchstart at (100, 100)
    tool.onMouseDown(me(100, 100), 0, 0, ctx);
    // touchmove to (150, 120) → dx=50, dy=20
    tool.onMouseMove(me(150, 120), 0, 0, ctx);
    tool.onMouseUp();

    expect(history.present.viewport.offsetX).toBe(initialOffsetX + 50);
    expect(history.present.viewport.offsetY).toBe(initialOffsetY + 20);
  });

  it('does not pan after touchend', () => {
    const history = new History(createScene());
    const tool = new HandTool();
    const ctx = makeCtx(history);

    tool.onMouseDown(me(0, 0), 0, 0, ctx);
    tool.onMouseUp();

    // Move after finger lifted — must not change viewport
    const offsetBefore = history.present.viewport.offsetX;
    tool.onMouseMove(me(100, 0), 0, 0, ctx);
    expect(history.present.viewport.offsetX).toBe(offsetBefore);
  });
});

// ---------------------------------------------------------------------------
// SelectTool
// ---------------------------------------------------------------------------

describe('SelectTool — mobile touch sequence', () => {
  it('selects an element tapped at its center', () => {
    const history = new History(createScene());
    history.dispatch({ type: 'CREATE_ELEMENT', element: makeRect() });
    history.dispatch({ type: 'CLEAR_SELECTION' });

    const tool = new SelectTool();
    const ctx = makeCtx(history);

    // Tap the center of the (0,0,100,100) rectangle
    tool.onMouseDown(me(50, 50), 50, 50, ctx);
    tool.onMouseUp(me(50, 50), 50, 50, ctx);

    expect(history.present.selectedIds.has('el-1')).toBe(true);
  });

  it('clears selection when tapping empty space', () => {
    const history = new History(createScene());
    history.dispatch({ type: 'CREATE_ELEMENT', element: makeRect() });
    // element is auto-selected after CREATE_ELEMENT

    const tool = new SelectTool();
    const ctx = makeCtx(history);

    // Tap far outside the element
    tool.onMouseDown(me(300, 300), 300, 300, ctx);
    tool.onMouseUp(me(300, 300), 300, 300, ctx);

    expect(history.present.selectedIds.size).toBe(0);
  });
});
