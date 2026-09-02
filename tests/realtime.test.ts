import { describe, expect, it, vi } from 'vitest';
import type { Command } from '../src/commands/commands';
import { createScene } from '../src/core/scene';
import { isEphemeralCommand, isSessionCommand } from '../src/engine/ephemeral';
import { History } from '../src/engine/history';

function rect(id: string) {
  return {
    id,
    type: 'rectangle' as const,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    strokeColor: '#000',
    fillColor: 'transparent',
    strokeWidth: 1,
    opacity: 1,
    roughness: 0,
  };
}

describe('isSessionCommand', () => {
  it('relays persistent commands', () => {
    const cmd: Command = { type: 'CREATE_ELEMENT', element: rect('1') };
    expect(isSessionCommand(cmd)).toBe(true);
  });

  it('filters ephemeral (view-only) commands', () => {
    expect(isEphemeralCommand('PAN_VIEWPORT')).toBe(true);
    expect(isSessionCommand({ type: 'PAN_VIEWPORT' })).toBe(false);
    expect(isSessionCommand({ type: 'SELECT_ELEMENTS' })).toBe(false);
    expect(isSessionCommand({ type: 'SET_TOOL' })).toBe(false);
  });

  it('shares UNDO/REDO (convergent undo, model B)', () => {
    expect(isSessionCommand({ type: 'UNDO' })).toBe(true);
    expect(isSessionCommand({ type: 'REDO' })).toBe(true);
  });
});

describe('History.applyRemote', () => {
  it('applies a remote command via the reducer', () => {
    const h = new History(createScene());
    h.applyRemote({ type: 'CREATE_ELEMENT', element: rect('a') });
    expect(h.present.elements).toHaveLength(1);
  });

  it('keeps per-user appState defaults when a remote style is applied', () => {
    const h = new History(createScene());
    h.dispatch({ type: 'CREATE_ELEMENT', element: rect('mine') });
    h.dispatch({ type: 'SELECT_ELEMENTS', ids: ['mine'] });
    h.dispatch({ type: 'SET_STROKE_COLOR', color: '#111111' });

    // A remote peer changes the selected element's color.
    h.applyRemote({ type: 'APPLY_STYLE', strokeColor: '#ff0000' });

    // The element color is shared...
    expect(h.present.elements[0]?.strokeColor).toBe('#ff0000');
    // ...but the local default color is untouched (per-user).
    expect(h.present.appState.strokeColor).toBe('#111111');
  });

  it('bakes the target element ids into a broadcast APPLY_STYLE', () => {
    const onCommand = vi.fn();
    const h = new History(createScene(), onCommand);
    h.dispatch({ type: 'CREATE_ELEMENT', element: rect('a') });
    h.dispatch({ type: 'CREATE_ELEMENT', element: rect('b') });
    h.dispatch({ type: 'SELECT_ELEMENTS', ids: ['a', 'b'] });

    h.dispatch({ type: 'APPLY_STYLE', strokeColor: '#00ff00' });

    const sent = onCommand.mock.calls.at(-1)?.[0] as
      | { type: string; ids?: string[] }
      | undefined;
    expect(sent?.type).toBe('APPLY_STYLE');
    expect(sent?.ids).toEqual(['a', 'b']);
  });

  it('does not touch the undo/redo stack of the reader', () => {
    const h = new History(createScene());
    h.applyRemote({ type: 'CREATE_ELEMENT', element: rect('remote') });
    // Remote ops only: nothing is undoable for the reader.
    expect(h.canUndo()).toBe(false);
    h.undo();
    const ids = h.present.elements.map((e) => e.id);
    expect(ids).toEqual(['remote']);
  });

  it('does not re-broadcast via onCommand (no echo loop)', () => {
    const onCommand = vi.fn();
    const h = new History(createScene(), onCommand);
    h.applyRemote({ type: 'CREATE_ELEMENT', element: rect('remote') });
    expect(onCommand).not.toHaveBeenCalled();
  });
});

describe('History.resetForLiveReplay', () => {
  it('replays a command log onto a fresh scene', () => {
    const h = new History(createScene());
    h.dispatch({ type: 'CREATE_ELEMENT', element: rect('mine') });
    h.resetForLiveReplay([
      { type: 'CREATE_ELEMENT', element: rect('r1') },
      { type: 'CREATE_ELEMENT', element: rect('r2') },
    ]);
    const ids = h.present.elements.map((e) => e.id).sort();
    expect(ids).toEqual(['r1', 'r2']);
    expect(h.canUndo()).toBe(false);
  });
});
