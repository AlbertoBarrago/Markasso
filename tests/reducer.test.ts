import { describe, expect, it } from 'vitest';
import type { Scene } from '../src/core/scene';
import { createScene } from '../src/core/scene';
import type {
  ArrowElement,
  CurveElement,
  FreehandElement,
  LineElement,
  PolygonElement,
  RectangleElement,
  TextElement,
} from '../src/elements/element';
import { reducer } from '../src/engine/reducer';

function makeRect(overrides: Partial<RectangleElement> = {}): RectangleElement {
  return {
    id: 'rect-1',
    type: 'rectangle',
    x: 10,
    y: 20,
    width: 100,
    height: 50,
    strokeColor: '#000',
    fillColor: 'transparent',
    strokeWidth: 2,
    opacity: 1,
    roughness: 0,
    ...overrides,
  };
}

describe('reducer', () => {
  it('CREATE_ELEMENT adds element and selects it', () => {
    const scene = createScene();
    const el = makeRect();
    const next = reducer(scene, { type: 'CREATE_ELEMENT', element: el });
    expect(next.elements).toHaveLength(1);
    expect(next.elements[0]).toEqual(el);
    expect(next.selectedIds.has('rect-1')).toBe(true);
  });

  it('CREATE_ELEMENTS adds all elements and selects them', () => {
    const scene = createScene();
    const elements: LineElement[] = [
      {
        id: 'l1',
        type: 'line',
        x: 0,
        y: 0,
        x2: 10,
        y2: 10,
        strokeColor: '#000',
        fillColor: 'transparent',
        strokeWidth: 2,
        opacity: 1,
        roughness: 0,
      },
      {
        id: 'l2',
        type: 'line',
        x: 10,
        y: 10,
        x2: 20,
        y2: 0,
        strokeColor: '#000',
        fillColor: 'transparent',
        strokeWidth: 2,
        opacity: 1,
        roughness: 0,
      },
    ];
    const next = reducer(scene, { type: 'CREATE_ELEMENTS', elements });
    expect(next.elements).toHaveLength(2);
    expect(next.selectedIds.has('l1')).toBe(true);
    expect(next.selectedIds.has('l2')).toBe(true);
  });

  it('DELETE_ELEMENTS removes elements', () => {
    const scene: Scene = {
      ...createScene(),
      elements: [makeRect()],
      selectedIds: new Set(['rect-1']),
    };
    const next = reducer(scene, { type: 'DELETE_ELEMENTS', ids: ['rect-1'] });
    expect(next.elements).toHaveLength(0);
    expect(next.selectedIds.size).toBe(0);
  });

  it('MOVE_ELEMENT shifts position', () => {
    const scene: Scene = {
      ...createScene(),
      elements: [makeRect({ x: 10, y: 20 })],
      selectedIds: new Set(['rect-1']),
    };
    const next = reducer(scene, {
      type: 'MOVE_ELEMENT',
      id: 'rect-1',
      dx: 5,
      dy: -3,
    });
    const el = next.elements[0] as RectangleElement;
    expect(el.x).toBe(15);
    expect(el.y).toBe(17);
  });

  it('SELECT_ELEMENTS and CLEAR_SELECTION', () => {
    const scene: Scene = {
      ...createScene(),
      elements: [makeRect()],
      selectedIds: new Set(),
    };
    const selected = reducer(scene, {
      type: 'SELECT_ELEMENTS',
      ids: ['rect-1'],
    });
    expect(selected.selectedIds.has('rect-1')).toBe(true);

    const cleared = reducer(selected, { type: 'CLEAR_SELECTION' });
    expect(cleared.selectedIds.size).toBe(0);
  });

  it('EDIT_TEXT updates text content', () => {
    const textEl = {
      id: 'txt-1',
      type: 'text' as const,
      x: 0,
      y: 0,
      content: 'hello',
      width: 100,
      height: 30,
      fontSize: 16,
      fontFamily: 'sans-serif',
      strokeColor: '#000',
      fillColor: 'transparent',
      strokeWidth: 0,
      opacity: 1,
      roughness: 0,
    };
    const scene: Scene = {
      ...createScene(),
      elements: [textEl],
      selectedIds: new Set(),
    };
    const next = reducer(scene, {
      type: 'EDIT_TEXT',
      id: 'txt-1',
      content: 'world',
    });
    const el = next.elements[0]!;
    expect(el.type).toBe('text');
    if (el.type === 'text') expect(el.content).toBe('world');
  });

  it('SET_TOOL changes activeTool and clears selection', () => {
    const scene: Scene = {
      ...createScene(),
      elements: [makeRect()],
      selectedIds: new Set(['rect-1']),
    };
    const next = reducer(scene, { type: 'SET_TOOL', tool: 'rectangle' });
    expect(next.appState.activeTool).toBe('rectangle');
    expect(next.selectedIds.size).toBe(0);
  });

  it('TOGGLE_GRID flips gridVisible', () => {
    const scene = createScene();
    expect(scene.appState.gridVisible).toBe(false);
    const on = reducer(scene, { type: 'TOGGLE_GRID' });
    expect(on.appState.gridVisible).toBe(true);
    const off = reducer(on, { type: 'TOGGLE_GRID' });
    expect(off.appState.gridVisible).toBe(false);
  });

  it('PAN_VIEWPORT adjusts offset', () => {
    const scene = createScene();
    const next = reducer(scene, { type: 'PAN_VIEWPORT', dx: 50, dy: -30 });
    expect(next.viewport.offsetX).toBe(50);
    expect(next.viewport.offsetY).toBe(-30);
  });

  // ── Lock ────────────────────────────────────────────────────────────────────

  it('LOCK_ELEMENTS sets locked flag', () => {
    const scene: Scene = {
      ...createScene(),
      elements: [makeRect()],
      selectedIds: new Set(),
    };
    const next = reducer(scene, { type: 'LOCK_ELEMENTS', ids: ['rect-1'] });
    expect(next.elements[0]!.locked).toBe(true);
  });

  it('UNLOCK_ELEMENTS clears locked flag', () => {
    const scene: Scene = {
      ...createScene(),
      elements: [makeRect({ locked: true })],
      selectedIds: new Set(),
    };
    const next = reducer(scene, { type: 'UNLOCK_ELEMENTS', ids: ['rect-1'] });
    expect(next.elements[0]!.locked).toBe(false);
  });

  it('LOCK_ELEMENTS does not affect other elements', () => {
    const r1 = makeRect({ id: 'r1' });
    const r2 = makeRect({ id: 'r2', x: 200 });
    const scene: Scene = {
      ...createScene(),
      elements: [r1, r2],
      selectedIds: new Set(),
    };
    const next = reducer(scene, { type: 'LOCK_ELEMENTS', ids: ['r1'] });
    expect(next.elements.find((e) => e.id === 'r1')!.locked).toBe(true);
    expect(next.elements.find((e) => e.id === 'r2')!.locked).toBeUndefined();
  });

  // ── Groups ───────────────────────────────────────────────────────────────────

  it('GROUP_ELEMENTS assigns shared groupId', () => {
    const r1 = makeRect({ id: 'r1' });
    const r2 = makeRect({ id: 'r2', x: 200 });
    const scene: Scene = {
      ...createScene(),
      elements: [r1, r2],
      selectedIds: new Set(),
    };
    const next = reducer(scene, {
      type: 'GROUP_ELEMENTS',
      ids: ['r1', 'r2'],
      groupId: 'g1',
    });
    expect(next.elements.find((e) => e.id === 'r1')!.groupId).toBe('g1');
    expect(next.elements.find((e) => e.id === 'r2')!.groupId).toBe('g1');
  });

  it('GROUP_ELEMENTS does not affect elements outside the list', () => {
    const r1 = makeRect({ id: 'r1' });
    const r2 = makeRect({ id: 'r2', x: 200 });
    const scene: Scene = {
      ...createScene(),
      elements: [r1, r2],
      selectedIds: new Set(),
    };
    const next = reducer(scene, {
      type: 'GROUP_ELEMENTS',
      ids: ['r1'],
      groupId: 'g1',
    });
    expect(next.elements.find((e) => e.id === 'r2')!.groupId).toBeUndefined();
  });

  it('UNGROUP_ELEMENTS removes groupId from all members', () => {
    const r1 = makeRect({
      id: 'r1',
      groupId: 'g1',
    } as Partial<RectangleElement>);
    const r2 = makeRect({
      id: 'r2',
      x: 200,
      groupId: 'g1',
    } as Partial<RectangleElement>);
    const scene: Scene = {
      ...createScene(),
      elements: [r1, r2],
      selectedIds: new Set(),
    };
    const next = reducer(scene, { type: 'UNGROUP_ELEMENTS', groupId: 'g1' });
    expect(next.elements.find((e) => e.id === 'r1')!.groupId).toBeUndefined();
    expect(next.elements.find((e) => e.id === 'r2')!.groupId).toBeUndefined();
  });

  it('UNGROUP_ELEMENTS does not affect other groups', () => {
    const r1 = makeRect({
      id: 'r1',
      groupId: 'g1',
    } as Partial<RectangleElement>);
    const r2 = makeRect({
      id: 'r2',
      x: 200,
      groupId: 'g2',
    } as Partial<RectangleElement>);
    const scene: Scene = {
      ...createScene(),
      elements: [r1, r2],
      selectedIds: new Set(),
    };
    const next = reducer(scene, { type: 'UNGROUP_ELEMENTS', groupId: 'g1' });
    expect(next.elements.find((e) => e.id === 'r2')!.groupId).toBe('g2');
  });

  // ── Smart arrows / links ─────────────────────────────────────────────────────

  it('RESIZE_ELEMENT sets startElementId on arrow', () => {
    const arrow: ArrowElement = {
      id: 'a1',
      type: 'arrow',
      x: 0,
      y: 0,
      x2: 100,
      y2: 100,
      strokeColor: '#000',
      fillColor: 'transparent',
      strokeWidth: 2,
      opacity: 1,
      roughness: 0,
    };
    const scene: Scene = {
      ...createScene(),
      elements: [arrow],
      selectedIds: new Set(),
    };
    const next = reducer(scene, {
      type: 'RESIZE_ELEMENT',
      id: 'a1',
      startElementId: 'rect-1',
    });
    const el = next.elements[0]! as ArrowElement;
    expect(el.startElementId).toBe('rect-1');
  });

  it('RESIZE_ELEMENT sets endElementId on arrow', () => {
    const arrow: ArrowElement = {
      id: 'a1',
      type: 'arrow',
      x: 0,
      y: 0,
      x2: 100,
      y2: 100,
      strokeColor: '#000',
      fillColor: 'transparent',
      strokeWidth: 2,
      opacity: 1,
      roughness: 0,
    };
    const scene: Scene = {
      ...createScene(),
      elements: [arrow],
      selectedIds: new Set(),
    };
    const next = reducer(scene, {
      type: 'RESIZE_ELEMENT',
      id: 'a1',
      endElementId: 'rect-2',
    });
    const el = next.elements[0]! as ArrowElement;
    expect(el.endElementId).toBe('rect-2');
  });

  it('RESIZE_ELEMENT with null disconnects startElementId', () => {
    const arrow: ArrowElement = {
      id: 'a1',
      type: 'arrow',
      x: 0,
      y: 0,
      x2: 100,
      y2: 100,
      startElementId: 'rect-1',
      strokeColor: '#000',
      fillColor: 'transparent',
      strokeWidth: 2,
      opacity: 1,
      roughness: 0,
    };
    const scene: Scene = {
      ...createScene(),
      elements: [arrow],
      selectedIds: new Set(),
    };
    const next = reducer(scene, {
      type: 'RESIZE_ELEMENT',
      id: 'a1',
      startElementId: null,
    });
    const el = next.elements[0]! as ArrowElement;
    expect(el.startElementId).toBeUndefined();
  });

  it('RESIZE_ELEMENT with null disconnects endElementId', () => {
    const arrow: ArrowElement = {
      id: 'a1',
      type: 'arrow',
      x: 0,
      y: 0,
      x2: 100,
      y2: 100,
      endElementId: 'rect-2',
      strokeColor: '#000',
      fillColor: 'transparent',
      strokeWidth: 2,
      opacity: 1,
      roughness: 0,
    };
    const scene: Scene = {
      ...createScene(),
      elements: [arrow],
      selectedIds: new Set(),
    };
    const next = reducer(scene, {
      type: 'RESIZE_ELEMENT',
      id: 'a1',
      endElementId: null,
    });
    const el = next.elements[0]! as ArrowElement;
    expect(el.endElementId).toBeUndefined();
  });

  describe('ALIGN_ELEMENTS', () => {
    function makeScene(): Scene {
      const scene = createScene();
      const r1 = makeRect({ id: 'r1', x: 0, y: 0, width: 40, height: 20 });
      const r2 = makeRect({ id: 'r2', x: 60, y: 30, width: 20, height: 40 });
      const r3 = makeRect({ id: 'r3', x: 10, y: 80, width: 30, height: 30 });
      return { ...scene, elements: [r1, r2, r3] };
    }

    it('aligns left edges to minimum x', () => {
      const scene = makeScene();
      // r1 bounds x=0, r2 bounds x=60 → both align to x=0
      const next = reducer(scene, {
        type: 'ALIGN_ELEMENTS',
        moves: [
          { id: 'r1', x: 0, y: 0 }, // already at left
          { id: 'r2', x: 0, y: 30 }, // moved left
        ],
      });
      const r1 = next.elements.find((e) => e.id === 'r1')!;
      const r2 = next.elements.find((e) => e.id === 'r2')!;
      expect(r1.x).toBe(0);
      expect(r2.x).toBe(0);
    });

    it('aligns right edges', () => {
      const scene = makeScene();
      // r1 right=40, r2 right=80 → align both to right=80 → r1.x=40, r2.x=60
      const next = reducer(scene, {
        type: 'ALIGN_ELEMENTS',
        moves: [
          { id: 'r1', x: 40, y: 0 },
          { id: 'r2', x: 60, y: 30 },
        ],
      });
      const r1 = next.elements.find((e) => e.id === 'r1')!;
      const r2 = next.elements.find((e) => e.id === 'r2')!;
      expect(r1.x).toBe(40);
      expect(r2.x).toBe(60);
    });

    it('aligns top edges', () => {
      const scene = makeScene();
      const next = reducer(scene, {
        type: 'ALIGN_ELEMENTS',
        moves: [
          { id: 'r1', x: 0, y: 0 },
          { id: 'r2', x: 60, y: 0 },
        ],
      });
      const r2 = next.elements.find((e) => e.id === 'r2')!;
      expect(r2.y).toBe(0);
    });

    it('aligns bottom edges', () => {
      const scene = makeScene();
      // r1 bottom=20, r2 bottom=70 → align r1 to y=50 so r1.y+20=70
      const next = reducer(scene, {
        type: 'ALIGN_ELEMENTS',
        moves: [
          { id: 'r1', x: 0, y: 50 },
          { id: 'r2', x: 60, y: 30 },
        ],
      });
      const r1 = next.elements.find((e) => e.id === 'r1')!;
      const r2 = next.elements.find((e) => e.id === 'r2')!;
      expect(r1.y).toBe(50);
      expect(r2.y).toBe(30);
    });

    it('does not touch untargeted elements', () => {
      const scene = makeScene();
      const next = reducer(scene, {
        type: 'ALIGN_ELEMENTS',
        moves: [{ id: 'r1', x: 5, y: 5 }],
      });
      const r3 = next.elements.find((e) => e.id === 'r3')!;
      expect(r3.x).toBe(10);
      expect(r3.y).toBe(80);
    });

    it('updates line endpoints proportionally', () => {
      const scene = createScene();
      const line: LineElement = {
        id: 'l1',
        type: 'line',
        x: 10,
        y: 10,
        x2: 50,
        y2: 40,
        strokeColor: '#000',
        fillColor: 'transparent',
        strokeWidth: 1,
        opacity: 1,
        roughness: 0,
      };
      const next = reducer(
        { ...scene, elements: [line] },
        { type: 'ALIGN_ELEMENTS', moves: [{ id: 'l1', x: 0, y: 0 }] },
      );
      const el = next.elements[0]! as LineElement;
      expect(el.x).toBe(0);
      expect(el.y).toBe(0);
      expect(el.x2).toBe(40); // 50 + (0 - 10)
      expect(el.y2).toBe(30); // 40 + (0 - 10)
    });

    it('shifts freehand points by the move delta', () => {
      const scene = makeScene();
      const fh: FreehandElement = {
        id: 'fh1',
        type: 'freehand',
        x: 0,
        y: 0,
        points: [
          [0, 0],
          [50, 80],
        ],
        strokeColor: '#000',
        fillColor: 'transparent',
        strokeWidth: 2,
        opacity: 1,
        roughness: 0,
      };
      const next = reducer(
        { ...scene, elements: [fh] },
        { type: 'ALIGN_ELEMENTS', moves: [{ id: 'fh1', x: 10, y: 10 }] },
      );
      const el = next.elements[0]! as FreehandElement;
      expect(el.x).toBe(10);
      expect(el.y).toBe(10);
      expect(el.points[0]).toEqual([10, 10]);
      expect(el.points[1]).toEqual([60, 90]);
    });

    it('skips elements with zero-delta move', () => {
      const scene = makeScene();
      const r = makeRect({ id: 'r1', x: 0, y: 0 });
      const s: Scene = { ...scene, elements: [r] };
      const next = reducer(s, {
        type: 'ALIGN_ELEMENTS',
        moves: [{ id: 'r1', x: 0, y: 0 }],
      });
      expect(next.elements[0]).toBe(s.elements[0]);
    });
  });

  it('ZOOM_VIEWPORT zooms to cursor', () => {
    const scene = createScene();
    const next = reducer(scene, {
      type: 'ZOOM_VIEWPORT',
      factor: 2,
      originX: 400,
      originY: 300,
    });
    expect(next.viewport.zoom).toBe(2);
    // Origin should remain fixed: origin = origin - (origin - offset) * factor
    // With offset=0, zoom=1: newOffset = origin - origin * 2 = -origin
    expect(next.viewport.offsetX).toBeCloseTo(-400);
    expect(next.viewport.offsetY).toBeCloseTo(-300);
  });

  // ── UPDATE_ELEMENT ────────────────────────────────────────────────────────

  it('UPDATE_ELEMENT merges props onto the target', () => {
    const scene: Scene = {
      ...createScene(),
      elements: [makeRect()],
      selectedIds: new Set(),
    };
    const next = reducer(scene, {
      type: 'UPDATE_ELEMENT',
      id: 'rect-1',
      props: { strokeColor: '#ff0000' },
    });
    expect((next.elements[0] as RectangleElement).strokeColor).toBe('#ff0000');
    expect((next.elements[0] as RectangleElement).x).toBe(10);
  });

  it('UPDATE_ELEMENT ignores unknown id', () => {
    const scene: Scene = {
      ...createScene(),
      elements: [makeRect()],
      selectedIds: new Set(),
    };
    const next = reducer(scene, {
      type: 'UPDATE_ELEMENT',
      id: 'nope',
      props: { strokeColor: '#ff0000' },
    });
    expect(next.elements).toStrictEqual(scene.elements);
  });

  // ── MOVE_ELEMENT variants ─────────────────────────────────────────────────

  it('MOVE_ELEMENT shifts curve and control point', () => {
    const curve: CurveElement = {
      id: 'c1',
      type: 'curve',
      x: 0,
      y: 0,
      x2: 100,
      y2: 0,
      cx: 50,
      cy: -40,
      strokeColor: '#000',
      fillColor: 'transparent',
      strokeWidth: 2,
      opacity: 1,
      roughness: 0,
    };
    const scene: Scene = {
      ...createScene(),
      elements: [curve],
      selectedIds: new Set(),
    };
    const next = reducer(scene, {
      type: 'MOVE_ELEMENT',
      id: 'c1',
      dx: 10,
      dy: 5,
    });
    const el = next.elements[0] as CurveElement;
    expect(el.x).toBe(10);
    expect(el.y).toBe(5);
    expect(el.x2).toBe(110);
    expect(el.y2).toBe(5);
    expect(el.cx).toBe(60);
    expect(el.cy).toBe(-35);
  });

  it('MOVE_ELEMENT shifts freehand points', () => {
    const fh: FreehandElement = {
      id: 'fh1',
      type: 'freehand',
      x: 0,
      y: 0,
      points: [
        [0, 0],
        [10, 5],
        [20, 0],
      ],
      strokeColor: '#000',
      fillColor: 'transparent',
      strokeWidth: 2,
      opacity: 1,
      roughness: 0,
    };
    const scene: Scene = {
      ...createScene(),
      elements: [fh],
      selectedIds: new Set(),
    };
    const next = reducer(scene, {
      type: 'MOVE_ELEMENT',
      id: 'fh1',
      dx: 3,
      dy: -1,
    });
    const el = next.elements[0] as FreehandElement;
    expect(el.points[0]).toEqual([3, -1]);
    expect(el.points[1]).toEqual([13, 4]);
    expect(el.points[2]).toEqual([23, -1]);
  });

  it('MOVE_ELEMENT shifts polygon points', () => {
    const poly: PolygonElement = {
      id: 'p1',
      type: 'polygon',
      x: 0,
      y: 0,
      closed: true,
      points: [
        [0, 0],
        [50, 0],
        [25, 40],
      ],
      strokeColor: '#000',
      fillColor: 'transparent',
      strokeWidth: 2,
      opacity: 1,
      roughness: 0,
    };
    const scene: Scene = {
      ...createScene(),
      elements: [poly],
      selectedIds: new Set(),
    };
    const next = reducer(scene, {
      type: 'MOVE_ELEMENT',
      id: 'p1',
      dx: 5,
      dy: 5,
    });
    const el = next.elements[0] as PolygonElement;
    expect(el.points[0]).toEqual([5, 5]);
    expect(el.points[2]).toEqual([30, 45]);
  });

  it('MOVE_ELEMENT shifts line x2/y2 and cx/cy when present', () => {
    const line: LineElement = {
      id: 'l1',
      type: 'line',
      x: 0,
      y: 0,
      x2: 100,
      y2: 0,
      cx: 50,
      cy: 30,
      strokeColor: '#000',
      fillColor: 'transparent',
      strokeWidth: 2,
      opacity: 1,
      roughness: 0,
    };
    const scene: Scene = {
      ...createScene(),
      elements: [line],
      selectedIds: new Set(),
    };
    const next = reducer(scene, {
      type: 'MOVE_ELEMENT',
      id: 'l1',
      dx: 10,
      dy: 0,
    });
    const el = next.elements[0] as LineElement;
    expect(el.x2).toBe(110);
    expect(el.cx).toBe(60);
  });

  // ── SET_SHAPE_LABEL ───────────────────────────────────────────────────────

  it('SET_SHAPE_LABEL sets label on rectangle', () => {
    const scene: Scene = {
      ...createScene(),
      elements: [makeRect()],
      selectedIds: new Set(),
    };
    const next = reducer(scene, {
      type: 'SET_SHAPE_LABEL',
      id: 'rect-1',
      label: 'Hello',
      labelFontSize: 14,
      labelFontFamily: 'sans-serif',
    });
    const el = next.elements[0] as RectangleElement & { label?: string };
    expect(el.label).toBe('Hello');
  });

  it('SET_SHAPE_LABEL ignores text elements', () => {
    const text: TextElement = {
      id: 'txt1',
      type: 'text',
      x: 0,
      y: 0,
      content: 'hi',
      width: 100,
      height: 30,
      fontSize: 16,
      fontFamily: 'sans-serif',
      strokeColor: '#000',
      fillColor: 'transparent',
      strokeWidth: 0,
      opacity: 1,
      roughness: 0,
    };
    const scene: Scene = {
      ...createScene(),
      elements: [text],
      selectedIds: new Set(),
    };
    const next = reducer(scene, {
      type: 'SET_SHAPE_LABEL',
      id: 'txt1',
      label: 'nope',
      labelFontSize: 14,
      labelFontFamily: 'sans-serif',
    });
    expect((next.elements[0] as TextElement).content).toBe('hi');
  });

  // ── SET_VIEWPORT ──────────────────────────────────────────────────────────

  it('SET_VIEWPORT sets all three viewport fields', () => {
    const scene = createScene();
    const next = reducer(scene, {
      type: 'SET_VIEWPORT',
      offsetX: 100,
      offsetY: 200,
      zoom: 1.5,
    });
    expect(next.viewport).toEqual({ offsetX: 100, offsetY: 200, zoom: 1.5 });
  });

  // ── appState style setters ────────────────────────────────────────────────

  it('SET_STROKE_COLOR updates appState.strokeColor', () => {
    const next = reducer(createScene(), {
      type: 'SET_STROKE_COLOR',
      color: '#aabbcc',
    });
    expect(next.appState.strokeColor).toBe('#aabbcc');
  });

  it('SET_FILL_COLOR updates appState.fillColor', () => {
    const next = reducer(createScene(), {
      type: 'SET_FILL_COLOR',
      color: '#112233',
    });
    expect(next.appState.fillColor).toBe('#112233');
  });

  it('SET_STROKE_WIDTH updates appState.strokeWidth', () => {
    const next = reducer(createScene(), { type: 'SET_STROKE_WIDTH', width: 5 });
    expect(next.appState.strokeWidth).toBe(5);
  });

  it('SET_GRID_TYPE sets gridType', () => {
    const next = reducer(createScene(), {
      type: 'SET_GRID_TYPE',
      gridType: 'line',
    });
    expect(next.appState.gridType).toBe('line');
  });

  it('SET_STROKE_STYLE updates strokeStyle', () => {
    const next = reducer(createScene(), {
      type: 'SET_STROKE_STYLE',
      style: 'dashed',
    });
    expect(next.appState.strokeStyle).toBe('dashed');
  });

  it('SET_TOOL_LOCK sets toolLocked', () => {
    const next = reducer(createScene(), {
      type: 'SET_TOOL_LOCK',
      locked: true,
    });
    expect(next.appState.toolLocked).toBe(true);
  });

  it('SET_JUST_CREATED_TEXT sets justCreatedText', () => {
    const next = reducer(createScene(), { type: 'SET_JUST_CREATED_TEXT' });
    expect(next.appState.justCreatedText).toBe(true);
  });

  it('CLEAR_JUST_CREATED_TEXT clears justCreatedText', () => {
    const scene = reducer(createScene(), { type: 'SET_JUST_CREATED_TEXT' });
    const next = reducer(scene, { type: 'CLEAR_JUST_CREATED_TEXT' });
    expect(next.appState.justCreatedText).toBe(false);
  });

  it('SET_FONT_FAMILY updates appState and selected text elements', () => {
    const text: TextElement = {
      id: 'txt1',
      type: 'text',
      x: 0,
      y: 0,
      content: 'hi',
      width: 100,
      height: 30,
      fontSize: 16,
      fontFamily: 'sans-serif',
      strokeColor: '#000',
      fillColor: 'transparent',
      strokeWidth: 0,
      opacity: 1,
      roughness: 0,
    };
    const scene: Scene = {
      ...createScene(),
      elements: [text],
      selectedIds: new Set(['txt1']),
    };
    const next = reducer(scene, {
      type: 'SET_FONT_FAMILY',
      family: 'monospace',
    });
    expect(next.appState.fontFamily).toBe('monospace');
    expect((next.elements[0] as TextElement).fontFamily).toBe('monospace');
  });

  it('SET_FONT_SIZE updates appState and selected text elements', () => {
    const text: TextElement = {
      id: 'txt1',
      type: 'text',
      x: 0,
      y: 0,
      content: 'hi',
      width: 100,
      height: 30,
      fontSize: 16,
      fontFamily: 'sans-serif',
      strokeColor: '#000',
      fillColor: 'transparent',
      strokeWidth: 0,
      opacity: 1,
      roughness: 0,
    };
    const scene: Scene = {
      ...createScene(),
      elements: [text],
      selectedIds: new Set(['txt1']),
    };
    const next = reducer(scene, { type: 'SET_FONT_SIZE', size: 24 });
    expect(next.appState.fontSize).toBe(24);
    expect((next.elements[0] as TextElement).fontSize).toBe(24);
  });

  it('SET_TEXT_MODE sets isCode on selected text elements', () => {
    const text: TextElement = {
      id: 'txt1',
      type: 'text',
      x: 0,
      y: 0,
      content: 'hi',
      width: 100,
      height: 30,
      fontSize: 16,
      fontFamily: 'sans-serif',
      strokeColor: '#000',
      fillColor: 'transparent',
      strokeWidth: 0,
      opacity: 1,
      roughness: 0,
    };
    const scene: Scene = {
      ...createScene(),
      elements: [text],
      selectedIds: new Set(['txt1']),
    };
    const next = reducer(scene, { type: 'SET_TEXT_MODE', mode: 'code' });
    expect((next.elements[0] as TextElement).isCode).toBe(true);
  });

  // ── SET_ROTATION ──────────────────────────────────────────────────────────

  it('SET_ROTATION updates rotation on target element', () => {
    const scene: Scene = {
      ...createScene(),
      elements: [makeRect()],
      selectedIds: new Set(),
    };
    const next = reducer(scene, {
      type: 'SET_ROTATION',
      id: 'rect-1',
      rotation: 45,
    });
    expect(
      (next.elements[0] as RectangleElement & { rotation?: number }).rotation,
    ).toBe(45);
  });

  // ── REORDER_ELEMENTS ──────────────────────────────────────────────────────

  it('REORDER_ELEMENTS moves elements to target index', () => {
    const r1 = makeRect({ id: 'r1' });
    const r2 = makeRect({ id: 'r2' });
    const r3 = makeRect({ id: 'r3' });
    const scene: Scene = {
      ...createScene(),
      elements: [r1, r2, r3],
      selectedIds: new Set(),
    };
    // Move r1 to index 2 (end)
    const next = reducer(scene, {
      type: 'REORDER_ELEMENTS',
      ids: ['r1'],
      targetIndex: 2,
    });
    expect(next.elements.map((e) => e.id)).toEqual(['r2', 'r3', 'r1']);
  });

  it('REORDER_ELEMENTS clamps out-of-range targetIndex', () => {
    const r1 = makeRect({ id: 'r1' });
    const r2 = makeRect({ id: 'r2' });
    const scene: Scene = {
      ...createScene(),
      elements: [r1, r2],
      selectedIds: new Set(),
    };
    const next = reducer(scene, {
      type: 'REORDER_ELEMENTS',
      ids: ['r2'],
      targetIndex: 999,
    });
    expect(next.elements.map((e) => e.id)).toEqual(['r1', 'r2']);
  });

  // ── TOGGLE_ELEMENT_VISIBILITY ─────────────────────────────────────────────

  it('TOGGLE_ELEMENT_VISIBILITY hides a visible element', () => {
    const scene: Scene = {
      ...createScene(),
      elements: [makeRect()],
      selectedIds: new Set(),
    };
    const next = reducer(scene, {
      type: 'TOGGLE_ELEMENT_VISIBILITY',
      id: 'rect-1',
    });
    expect(
      (next.elements[0] as RectangleElement & { visible?: boolean }).visible,
    ).toBe(false);
  });

  it('TOGGLE_ELEMENT_VISIBILITY shows a hidden element', () => {
    const hidden = { ...makeRect(), visible: false } as RectangleElement & {
      visible: boolean;
    };
    const scene: Scene = {
      ...createScene(),
      elements: [hidden],
      selectedIds: new Set(),
    };
    const next = reducer(scene, {
      type: 'TOGGLE_ELEMENT_VISIBILITY',
      id: 'rect-1',
    });
    expect((next.elements[0] as typeof hidden).visible).toBe(true);
  });

  // ── LOAD_SCENE ────────────────────────────────────────────────────────────

  it('LOAD_SCENE replaces elements and clears selection', () => {
    const r1 = makeRect({ id: 'r1' });
    const r2 = makeRect({ id: 'r2' });
    const scene: Scene = {
      ...createScene(),
      elements: [r1],
      selectedIds: new Set(['r1']),
    };
    const next = reducer(scene, {
      type: 'LOAD_SCENE',
      elements: [r2],
      viewport: { offsetX: 10, offsetY: 20, zoom: 2 },
    });
    expect(next.elements).toHaveLength(1);
    expect(next.elements[0]!.id).toBe('r2');
    expect(next.selectedIds.size).toBe(0);
    expect(next.viewport.zoom).toBe(2);
  });

  // ── APPLY_STYLE ───────────────────────────────────────────────────────────

  it('APPLY_STYLE patches selected elements and appState', () => {
    const scene: Scene = {
      ...createScene(),
      elements: [makeRect()],
      selectedIds: new Set(['rect-1']),
    };
    const next = reducer(scene, {
      type: 'APPLY_STYLE',
      strokeColor: '#ff0000',
      strokeWidth: 4,
      opacity: 0.5,
    });
    const el = next.elements[0] as RectangleElement;
    expect(el.strokeColor).toBe('#ff0000');
    expect(el.strokeWidth).toBe(4);
    expect(el.opacity).toBe(0.5);
    expect(next.appState.strokeColor).toBe('#ff0000');
    expect(next.appState.strokeWidth).toBe(4);
  });

  it('APPLY_STYLE with no selection uses lastCreatedId', () => {
    const scene: Scene = {
      ...createScene(),
      elements: [makeRect()],
      selectedIds: new Set(),
      appState: { ...createScene().appState, lastCreatedId: 'rect-1' },
    };
    const next = reducer(scene, {
      type: 'APPLY_STYLE',
      strokeColor: '#00ff00',
    });
    expect((next.elements[0] as RectangleElement).strokeColor).toBe('#00ff00');
  });

  it('APPLY_STYLE does not touch unselected elements', () => {
    const r1 = makeRect({ id: 'r1' });
    const r2 = makeRect({ id: 'r2', strokeColor: '#ffffff' });
    const scene: Scene = {
      ...createScene(),
      elements: [r1, r2],
      selectedIds: new Set(['r1']),
    };
    const next = reducer(scene, {
      type: 'APPLY_STYLE',
      strokeColor: '#ff0000',
    });
    expect(
      (next.elements.find((e) => e.id === 'r2') as RectangleElement)
        .strokeColor,
    ).toBe('#ffffff');
  });

  // ── DELETE_ELEMENTS cascade ───────────────────────────────────────────────

  it('DELETE_ELEMENTS cascades to connected arrows', () => {
    const rect = makeRect({ id: 'r1' });
    const arrow: ArrowElement = {
      id: 'a1',
      type: 'arrow',
      x: 0,
      y: 0,
      x2: 100,
      y2: 100,
      startElementId: 'r1',
      strokeColor: '#000',
      fillColor: 'transparent',
      strokeWidth: 2,
      opacity: 1,
      roughness: 0,
    };
    const scene: Scene = {
      ...createScene(),
      elements: [rect, arrow],
      selectedIds: new Set(),
    };
    const next = reducer(scene, { type: 'DELETE_ELEMENTS', ids: ['r1'] });
    expect(next.elements).toHaveLength(0);
  });

  it('DELETE_ELEMENTS does not cascade when arrow target is not deleted', () => {
    const r1 = makeRect({ id: 'r1' });
    const r2 = makeRect({ id: 'r2' });
    const arrow: ArrowElement = {
      id: 'a1',
      type: 'arrow',
      x: 0,
      y: 0,
      x2: 100,
      y2: 100,
      startElementId: 'r2',
      strokeColor: '#000',
      fillColor: 'transparent',
      strokeWidth: 2,
      opacity: 1,
      roughness: 0,
    };
    const scene: Scene = {
      ...createScene(),
      elements: [r1, r2, arrow],
      selectedIds: new Set(),
    };
    const next = reducer(scene, { type: 'DELETE_ELEMENTS', ids: ['r1'] });
    expect(next.elements.map((e) => e.id)).toEqual(['r2', 'a1']);
  });

  // ── SET_TOOL inherits style ───────────────────────────────────────────────

  it('SET_TOOL inherits style from selected element when switching to drawing tool', () => {
    const colored = makeRect({
      id: 'r1',
      strokeColor: '#abcdef',
      strokeWidth: 6,
    });
    const scene: Scene = {
      ...createScene(),
      elements: [colored],
      selectedIds: new Set(['r1']),
    };
    const next = reducer(scene, { type: 'SET_TOOL', tool: 'rectangle' });
    expect(next.appState.strokeColor).toBe('#abcdef');
    expect(next.appState.strokeWidth).toBe(6);
    expect(next.selectedIds.size).toBe(0);
  });

  it('SET_TOOL resets fontSize to 20 when leaving text tool', () => {
    const scene: Scene = {
      ...createScene(),
      appState: {
        ...createScene().appState,
        activeTool: 'text',
        fontSize: 120,
      },
    };
    const next = reducer(scene, { type: 'SET_TOOL', tool: 'rectangle' });
    expect(next.appState.fontSize).toBe(20);
  });

  it('SET_TOOL does not reset fontSize when staying on text tool', () => {
    const scene: Scene = {
      ...createScene(),
      appState: {
        ...createScene().appState,
        activeTool: 'text',
        fontSize: 120,
      },
    };
    const next = reducer(scene, { type: 'SET_TOOL', tool: 'text' });
    expect(next.appState.fontSize).toBe(120);
  });

  it('SET_TOOL with keepSelection preserves selection', () => {
    const scene: Scene = {
      ...createScene(),
      elements: [makeRect()],
      selectedIds: new Set(['rect-1']),
    };
    const next = reducer(scene, {
      type: 'SET_TOOL',
      tool: 'select',
      keepSelection: true,
    });
    expect(next.selectedIds.has('rect-1')).toBe(true);
  });
});
