import { describe, expect, it } from 'vitest';
import { History } from '../src/engine/history';
import { insertShape, insertStencil } from '../src/ui/library_insert';

describe('library insertion', () => {
  it('inserts a flowchart shape centered on the drop point', () => {
    const history = new History();
    insertShape(history, 'database', { x: 500, y: 300 });
    const [el] = history.present.elements;
    expect(el).toMatchObject({
      type: 'shape',
      kind: 'database',
      x: 420,
      y: 260,
      width: 160,
      height: 80,
    });
    expect(history.present.selectedIds.has(el!.id)).toBe(true);
  });

  it('inserts a labeled stencil with the current default style', () => {
    const history = new History();
    history.dispatch({ type: 'SET_STROKE_COLOR', color: '#ff6b6b' });
    insertStencil(
      history,
      { kind: 'builtin', ref: 'generic/server' },
      'API server',
      { x: 100, y: 100 },
    );
    const [el] = history.present.elements;
    expect(el).toMatchObject({
      type: 'stencil',
      source: { kind: 'builtin', ref: 'generic/server' },
      label: 'API server',
      strokeColor: '#ff6b6b',
      x: 68,
      y: 68,
    });
  });

  it('applies the default stroke style to inserted shapes', () => {
    const history = new History();
    history.dispatch({ type: 'SET_STROKE_STYLE', style: 'dashed' });
    insertShape(history, 'document', { x: 0, y: 0 });
    expect(history.present.elements[0]).toMatchObject({
      strokeStyle: 'dashed',
    });
  });

  it('is a single undo step', () => {
    const history = new History();
    insertShape(history, 'terminator', { x: 0, y: 0 });
    history.undo();
    expect(history.present.elements).toHaveLength(0);
  });
});
