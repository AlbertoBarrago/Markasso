import { describe, it, expect } from 'vitest';
import { reducer } from '../src/engine/reducer';
import { createScene } from '../src/core/scene';
import type { Scene } from '../src/core/scene';
import type { RectangleElement } from '../src/elements/element';

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
    expect(scene.appState.gridVisible).toBe(true);
    const off = reducer(scene, { type: 'TOGGLE_GRID' });
    expect(off.appState.gridVisible).toBe(false);
    const on = reducer(off, { type: 'TOGGLE_GRID' });
    expect(on.appState.gridVisible).toBe(true);
  });

  it('PAN_VIEWPORT adjusts offset', () => {
    const scene = createScene();
    const next = reducer(scene, { type: 'PAN_VIEWPORT', dx: 50, dy: -30 });
    expect(next.viewport.offsetX).toBe(50);
    expect(next.viewport.offsetY).toBe(-30);
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
