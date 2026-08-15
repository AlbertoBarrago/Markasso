import { describe, expect, it, vi } from 'vitest';
import { createScene } from '../src/core/scene';
import { History } from '../src/engine/history';

describe('History', () => {
  it('dispatch adds to past', () => {
    const h = new History(createScene());
    expect(h.canUndo()).toBe(false);
    h.dispatch({
      type: 'CREATE_ELEMENT',
      element: {
        id: '1',
        type: 'rectangle',
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        strokeColor: '#000',
        fillColor: 'transparent',
        strokeWidth: 1,
        opacity: 1,
        roughness: 0,
      },
    });
    expect(h.present.elements).toHaveLength(1);
    expect(h.canUndo()).toBe(true);
  });

  it('undo and redo work correctly', () => {
    const h = new History(createScene());
    h.dispatch({
      type: 'CREATE_ELEMENT',
      element: {
        id: '1',
        type: 'rectangle',
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        strokeColor: '#000',
        fillColor: 'transparent',
        strokeWidth: 1,
        opacity: 1,
        roughness: 0,
      },
    });
    expect(h.present.elements).toHaveLength(1);

    h.undo();
    expect(h.present.elements).toHaveLength(0);
    expect(h.canRedo()).toBe(true);

    h.redo();
    expect(h.present.elements).toHaveLength(1);
    expect(h.canRedo()).toBe(false);
  });

  it('ephemeral commands do not push undo stack', () => {
    const h = new History(createScene());
    h.dispatch({ type: 'PAN_VIEWPORT', dx: 100, dy: 0 });
    expect(h.canUndo()).toBe(false);
  });

  it('does not keep an undo entry for a no-op drag', () => {
    const h = new History(createScene());
    h.dispatch({
      type: 'CREATE_ELEMENT',
      element: {
        id: '1',
        type: 'rectangle',
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        strokeColor: '#000',
        fillColor: 'transparent',
        strokeWidth: 1,
        opacity: 1,
        roughness: 0,
      },
    });
    h.undo();
    h.redo();

    h.beginDrag();
    h.dispatch({ type: 'MOVE_ELEMENT', id: '1', dx: 0, dy: 0 });
    h.endDrag();

    h.undo();
    expect(h.present.elements).toHaveLength(0);
  });

  it('new dispatch clears redo stack', () => {
    const h = new History(createScene());
    h.dispatch({
      type: 'CREATE_ELEMENT',
      element: {
        id: '1',
        type: 'rectangle',
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        strokeColor: '#000',
        fillColor: 'transparent',
        strokeWidth: 1,
        opacity: 1,
        roughness: 0,
      },
    });
    h.undo();
    expect(h.canRedo()).toBe(true);
    h.dispatch({
      type: 'CREATE_ELEMENT',
      element: {
        id: '2',
        type: 'ellipse',
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        strokeColor: '#000',
        fillColor: 'transparent',
        strokeWidth: 1,
        opacity: 1,
        roughness: 0,
      },
    });
    expect(h.canRedo()).toBe(false);
  });

  it('preserves viewport and tool state across undo and redo', () => {
    const h = new History(createScene());
    h.dispatch({
      type: 'CREATE_ELEMENT',
      element: {
        id: '1',
        type: 'rectangle',
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        strokeColor: '#000',
        fillColor: 'transparent',
        strokeWidth: 1,
        opacity: 1,
        roughness: 0,
      },
    });
    h.dispatch({ type: 'SET_TOOL', tool: 'hand' });
    h.dispatch({ type: 'SET_VIEWPORT', offsetX: 50, offsetY: 25, zoom: 2 });

    h.undo();
    expect(h.present.elements).toHaveLength(0);
    expect(h.present.appState.activeTool).toBe('hand');
    expect(h.present.viewport).toEqual({ offsetX: 50, offsetY: 25, zoom: 2 });

    h.redo();
    expect(h.present.elements).toHaveLength(1);
    expect(h.present.appState.activeTool).toBe('hand');
    expect(h.present.viewport).toEqual({ offsetX: 50, offsetY: 25, zoom: 2 });
  });

  it('rolls back a cancelled drag and preserves the redo stack', () => {
    const h = new History(createScene());
    h.dispatch({
      type: 'CREATE_ELEMENT',
      element: {
        id: '1',
        type: 'rectangle',
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        strokeColor: '#000',
        fillColor: 'transparent',
        strokeWidth: 1,
        opacity: 1,
        roughness: 0,
      },
    });
    h.undo();
    h.redo();
    h.dispatch({
      type: 'CREATE_ELEMENT',
      element: {
        id: 'temporary',
        type: 'rectangle',
        x: 0,
        y: 0,
        width: 5,
        height: 5,
        strokeColor: '#000',
        fillColor: 'transparent',
        strokeWidth: 1,
        opacity: 1,
        roughness: 0,
      },
    });
    h.undo();
    h.dispatch({ type: 'SELECT_ELEMENTS', ids: ['1'] });
    expect(h.canRedo()).toBe(true);

    h.beginDrag();
    h.dispatch({ type: 'MOVE_ELEMENT', id: '1', dx: 25, dy: 10 });
    h.cancelDrag();

    expect(h.present.elements).toHaveLength(1);
    expect(h.present.elements[0]).toMatchObject({ id: '1', x: 0, y: 0 });
    expect(h.present.selectedIds).toEqual(new Set(['1']));
    expect(h.canRedo()).toBe(true);
    h.redo();
    expect(h.present.elements.map((element) => element.id)).toEqual([
      '1',
      'temporary',
    ]);
  });

  it('subscribe listener is called on change', () => {
    const h = new History(createScene());
    const listener = vi.fn();
    h.subscribe(listener);
    h.dispatch({ type: 'TOGGLE_GRID' });
    expect(listener).toHaveBeenCalledOnce();
  });

  it('unsubscribe stops notifications', () => {
    const h = new History(createScene());
    const listener = vi.fn();
    const unsub = h.subscribe(listener);
    unsub();
    h.dispatch({ type: 'TOGGLE_GRID' });
    expect(listener).not.toHaveBeenCalled();
  });
});
