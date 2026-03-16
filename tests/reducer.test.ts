import { describe, it, expect } from 'vitest';
import { reducer } from '../src/engine/reducer';
import { createScene } from '../src/core/scene';
import type { Scene } from '../src/core/scene';
import type { RectangleElement, ArrowElement } from '../src/elements/element';

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
    const next = reducer(scene, { type: 'MOVE_ELEMENT', id: 'rect-1', dx: 5, dy: -3 });
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
    const selected = reducer(scene, { type: 'SELECT_ELEMENTS', ids: ['rect-1'] });
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
    const scene: Scene = { ...createScene(), elements: [textEl], selectedIds: new Set() };
    const next = reducer(scene, { type: 'EDIT_TEXT', id: 'txt-1', content: 'world' });
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
    const scene: Scene = { ...createScene(), elements: [makeRect()], selectedIds: new Set() };
    const next = reducer(scene, { type: 'LOCK_ELEMENTS', ids: ['rect-1'] });
    expect(next.elements[0]!.locked).toBe(true);
  });

  it('UNLOCK_ELEMENTS clears locked flag', () => {
    const scene: Scene = { ...createScene(), elements: [makeRect({ locked: true })], selectedIds: new Set() };
    const next = reducer(scene, { type: 'UNLOCK_ELEMENTS', ids: ['rect-1'] });
    expect(next.elements[0]!.locked).toBe(false);
  });

  it('LOCK_ELEMENTS does not affect other elements', () => {
    const r1 = makeRect({ id: 'r1' });
    const r2 = makeRect({ id: 'r2', x: 200 });
    const scene: Scene = { ...createScene(), elements: [r1, r2], selectedIds: new Set() };
    const next = reducer(scene, { type: 'LOCK_ELEMENTS', ids: ['r1'] });
    expect(next.elements.find(e => e.id === 'r1')!.locked).toBe(true);
    expect(next.elements.find(e => e.id === 'r2')!.locked).toBeUndefined();
  });

  // ── Groups ───────────────────────────────────────────────────────────────────

  it('GROUP_ELEMENTS assigns shared groupId', () => {
    const r1 = makeRect({ id: 'r1' });
    const r2 = makeRect({ id: 'r2', x: 200 });
    const scene: Scene = { ...createScene(), elements: [r1, r2], selectedIds: new Set() };
    const next = reducer(scene, { type: 'GROUP_ELEMENTS', ids: ['r1', 'r2'], groupId: 'g1' });
    expect(next.elements.find(e => e.id === 'r1')!.groupId).toBe('g1');
    expect(next.elements.find(e => e.id === 'r2')!.groupId).toBe('g1');
  });

  it('GROUP_ELEMENTS does not affect elements outside the list', () => {
    const r1 = makeRect({ id: 'r1' });
    const r2 = makeRect({ id: 'r2', x: 200 });
    const scene: Scene = { ...createScene(), elements: [r1, r2], selectedIds: new Set() };
    const next = reducer(scene, { type: 'GROUP_ELEMENTS', ids: ['r1'], groupId: 'g1' });
    expect(next.elements.find(e => e.id === 'r2')!.groupId).toBeUndefined();
  });

  it('UNGROUP_ELEMENTS removes groupId from all members', () => {
    const r1 = makeRect({ id: 'r1', groupId: 'g1' } as Partial<RectangleElement>);
    const r2 = makeRect({ id: 'r2', x: 200, groupId: 'g1' } as Partial<RectangleElement>);
    const scene: Scene = { ...createScene(), elements: [r1, r2], selectedIds: new Set() };
    const next = reducer(scene, { type: 'UNGROUP_ELEMENTS', groupId: 'g1' });
    expect(next.elements.find(e => e.id === 'r1')!.groupId).toBeUndefined();
    expect(next.elements.find(e => e.id === 'r2')!.groupId).toBeUndefined();
  });

  it('UNGROUP_ELEMENTS does not affect other groups', () => {
    const r1 = makeRect({ id: 'r1', groupId: 'g1' } as Partial<RectangleElement>);
    const r2 = makeRect({ id: 'r2', x: 200, groupId: 'g2' } as Partial<RectangleElement>);
    const scene: Scene = { ...createScene(), elements: [r1, r2], selectedIds: new Set() };
    const next = reducer(scene, { type: 'UNGROUP_ELEMENTS', groupId: 'g1' });
    expect(next.elements.find(e => e.id === 'r2')!.groupId).toBe('g2');
  });

  // ── Smart arrows / links ─────────────────────────────────────────────────────

  it('RESIZE_ELEMENT sets startElementId on arrow', () => {
    const arrow: ArrowElement = {
      id: 'a1', type: 'arrow',
      x: 0, y: 0, x2: 100, y2: 100,
      strokeColor: '#000', fillColor: 'transparent',
      strokeWidth: 2, opacity: 1, roughness: 0,
    };
    const scene: Scene = { ...createScene(), elements: [arrow], selectedIds: new Set() };
    const next = reducer(scene, { type: 'RESIZE_ELEMENT', id: 'a1', startElementId: 'rect-1' });
    const el = next.elements[0]! as ArrowElement;
    expect(el.startElementId).toBe('rect-1');
  });

  it('RESIZE_ELEMENT sets endElementId on arrow', () => {
    const arrow: ArrowElement = {
      id: 'a1', type: 'arrow',
      x: 0, y: 0, x2: 100, y2: 100,
      strokeColor: '#000', fillColor: 'transparent',
      strokeWidth: 2, opacity: 1, roughness: 0,
    };
    const scene: Scene = { ...createScene(), elements: [arrow], selectedIds: new Set() };
    const next = reducer(scene, { type: 'RESIZE_ELEMENT', id: 'a1', endElementId: 'rect-2' });
    const el = next.elements[0]! as ArrowElement;
    expect(el.endElementId).toBe('rect-2');
  });

  it('RESIZE_ELEMENT with null disconnects startElementId', () => {
    const arrow: ArrowElement = {
      id: 'a1', type: 'arrow',
      x: 0, y: 0, x2: 100, y2: 100,
      startElementId: 'rect-1',
      strokeColor: '#000', fillColor: 'transparent',
      strokeWidth: 2, opacity: 1, roughness: 0,
    };
    const scene: Scene = { ...createScene(), elements: [arrow], selectedIds: new Set() };
    const next = reducer(scene, { type: 'RESIZE_ELEMENT', id: 'a1', startElementId: null });
    const el = next.elements[0]! as ArrowElement;
    expect(el.startElementId).toBeUndefined();
  });

  it('RESIZE_ELEMENT with null disconnects endElementId', () => {
    const arrow: ArrowElement = {
      id: 'a1', type: 'arrow',
      x: 0, y: 0, x2: 100, y2: 100,
      endElementId: 'rect-2',
      strokeColor: '#000', fillColor: 'transparent',
      strokeWidth: 2, opacity: 1, roughness: 0,
    };
    const scene: Scene = { ...createScene(), elements: [arrow], selectedIds: new Set() };
    const next = reducer(scene, { type: 'RESIZE_ELEMENT', id: 'a1', endElementId: null });
    const el = next.elements[0]! as ArrowElement;
    expect(el.endElementId).toBeUndefined();
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
});
