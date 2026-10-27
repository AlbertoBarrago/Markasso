import { describe, expect, it } from 'vitest';
import { measureTextWidth, wrapTextLines } from '../../src/core/text_metrics';
import type { Element } from '../../src/elements/element';
import { getConnectorBox } from '../../src/rendering/draw_selection';
import {
  getLabelWrapWidth,
  getShapeTextBox,
} from '../../src/rendering/shape_geometry';
import { Diagram } from '../src/diagram';

const LONG =
  'Servizio di indicizzazione\nestrae testo dai PDF regionali\ne calcola gli embedding per Qdrant';

/** Wrapped label lines of a node, as the renderer draws them. */
function labelLines(el: Element, maxWidth: number): string[] {
  return 'label' in el && el.label
    ? wrapTextLines(el.label, maxWidth, 16, 'Arial, sans-serif')
    : [];
}

describe('node sizing', () => {
  it('grows rectangles to fit a long label', async () => {
    const d = new Diagram();
    await d.addNodes([{ key: 'idx', label: LONG }]);
    const el = d.elements[0]!;
    if (el.type !== 'rectangle') throw new Error('expected a rectangle');
    const lines = labelLines(el, el.width - 16);
    expect(lines.length * 16 * 1.2).toBeLessThanOrEqual(el.height - 8);
    for (const line of lines)
      expect(measureTextWidth(line, 16, 'Arial')).toBeLessThanOrEqual(
        el.width - 16,
      );
  });

  it('fits an overlong word broken like the canvas draws it', async () => {
    const d = new Diagram();
    const word = 'Supercalifragilisticexpialidocious'.repeat(3);
    await d.addNodes([{ key: 'w', label: word }]);
    const el = d.elements[0]!;
    if (el.type !== 'rectangle') throw new Error('expected a rectangle');
    const wrap = getLabelWrapWidth(el, el.width, el.height);
    const lines = wrapTextLines(
      word,
      wrap,
      16,
      'Arial, sans-serif',
      false,
      true,
    );
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.length * 16 * 1.2).toBeLessThanOrEqual(el.height - 8);
    for (const line of lines)
      expect(measureTextWidth(line, 16, 'Arial')).toBeLessThanOrEqual(wrap);
  });

  it('keeps the default size for short labels', async () => {
    const d = new Diagram();
    await d.addNodes([{ key: 'api', label: 'API' }]);
    expect(d.elements[0]).toMatchObject({ width: 160, height: 70 });
  });

  it('fits flowchart symbols and rhombi', async () => {
    const d = new Diagram();
    await d.addNodes([
      { key: 'db', kind: 'database', label: LONG },
      {
        key: 'ok',
        kind: 'rhombus',
        label: 'Il documento è già stato indicizzato in precedenza?',
      },
    ]);
    const [db, ok] = d.elements;
    if (db?.type !== 'shape' || ok?.type !== 'rhombus')
      throw new Error('unexpected kinds');
    const box = getShapeTextBox(db.kind, db.width, db.height);
    expect(labelLines(db, box.w - 16).length * 16 * 1.2).toBeLessThanOrEqual(
      box.h,
    );
    // The text block's corners stay inside the diamond.
    const lines = labelLines(ok, ok.width * 0.7 - 16);
    const tw = Math.max(...lines.map((l) => measureTextWidth(l, 16, 'Arial')));
    const th = lines.length * 16 * 1.2;
    expect(tw / ok.width + th / ok.height).toBeLessThan(1);
  });

  it('sizes text nodes to their content', async () => {
    const d = new Diagram();
    await d.addNodes([
      { key: 'title', kind: 'text', label: 'Architettura RAG leggi regionali' },
    ]);
    const el = d.elements[0]!;
    if (el.type !== 'text') throw new Error('expected text');
    expect(wrapTextLines(el.content, el.width, 20, el.fontFamily)).toHaveLength(
      1,
    );
  });

  it('resizes an auto-sized node when its label changes', async () => {
    const d = new Diagram();
    await d.addNodes([{ key: 'api', label: 'API' }]);
    d.update('api', { label: LONG });
    expect(d.elements[0]).toMatchObject({ height: expect.any(Number) });
    expect(getConnectorBox(d.elements[0]!).h).toBeGreaterThan(70);
  });

  it('keeps an explicit size', async () => {
    const d = new Diagram();
    await d.addNodes([{ key: 'api', label: 'API', width: 100, height: 40 }]);
    d.update('api', { label: LONG });
    expect(d.elements[0]).toMatchObject({ width: 100, height: 40 });
  });
});

describe('layout with disconnected flows', () => {
  it('places components side by side without overlaps', async () => {
    const d = new Diagram();
    await d.addNodes([
      { key: 'title', kind: 'text', label: 'Architettura RAG leggi regionali' },
      { key: 'q1', label: 'Domanda utente' },
      { key: 'i1', label: 'Crawler PDF' },
      { key: 'q2', label: 'Retriever' },
      { key: 'i2', label: LONG },
      { key: 'q3', label: 'Risposta' },
      { key: 'i3', kind: 'database', label: 'Qdrant' },
    ]);
    d.connect([
      { from: 'q1', to: 'q2' },
      { from: 'q2', to: 'q3' },
      { from: 'i1', to: 'i2' },
      { from: 'i2', to: 'i3' },
    ]);
    d.layout('TB');
    const keys = d.nodeKeys();
    const boxes = d.elements
      .filter((el) => keys.has(el.id))
      .map((el) => ({ key: keys.get(el.id)!, ...getConnectorBox(el) }));
    for (const a of boxes)
      for (const b of boxes) {
        if (a === b) continue;
        const overlap =
          a.x < b.x + b.w &&
          b.x < a.x + a.w &&
          a.y < b.y + b.h &&
          b.y < a.y + a.h;
        expect(overlap, `${a.key} overlaps ${b.key}`).toBe(false);
      }
    const span = (prefix: string) => {
      const group = boxes.filter((b) => b.key.startsWith(prefix));
      return [
        Math.min(...group.map((b) => b.x)),
        Math.max(...group.map((b) => b.x + b.w)),
      ] as const;
    };
    const [qMin, qMax] = span('q');
    const [iMin, iMax] = span('i');
    expect(qMax <= iMin || iMax <= qMin).toBe(true);
  });
});
