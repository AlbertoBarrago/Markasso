import { describe, expect, it } from 'vitest';
import type { Element, LineElement } from '../src/elements/element';
import type { RoutePoint } from '../src/rendering/connector_geometry';
import {
  getConnectorLabelBoxes,
  type LabelBox,
} from '../src/rendering/connector_labels';
import { resolveConnectorRoute } from '../src/rendering/draw_selection';

const base = {
  strokeColor: '#e2e2ef',
  fillColor: 'transparent',
  strokeWidth: 2,
  opacity: 1,
  roughness: 0,
} as const;

function rect(id: string, x: number, y: number): Element {
  return { ...base, id, type: 'rectangle', x, y, width: 160, height: 70 };
}

function edge(
  id: string,
  from: string,
  to: string,
  label: string,
): LineElement {
  return {
    ...base,
    id,
    type: 'line',
    x: 0,
    y: -1000,
    x2: 0,
    y2: -1000,
    arrowHead: 'end',
    routing: 'elbow',
    startElementId: from,
    endElementId: to,
    label,
  };
}

/** Three elbows fanning out of one node share their first stretch. */
function fanOut(): Element[] {
  return [
    rect('src', 220, 0),
    rect('a', 0, 260),
    rect('b', 220, 260),
    rect('c', 440, 260),
    edge('e1', 'src', 'a', 'indicizza'),
    edge('e2', 'src', 'b', 'confronto'),
    edge('e3', 'src', 'c', 'archivia'),
  ];
}

/** True when the axis-aligned segment enters the box interior. */
function crosses(a: RoutePoint, b: RoutePoint, box: LabelBox): boolean {
  const e = 1;
  return (
    Math.max(a[0], b[0]) > box.x - box.w / 2 + e &&
    Math.min(a[0], b[0]) < box.x + box.w / 2 - e &&
    Math.max(a[1], b[1]) > box.y - box.h / 2 + e &&
    Math.min(a[1], b[1]) < box.y + box.h / 2 - e
  );
}

describe('connector label placement', () => {
  const elements = fanOut();
  const boxes = getConnectorLabelBoxes(elements);
  const edges = elements.filter((el): el is LineElement => el.type === 'line');

  it('places every label', () => {
    expect([...boxes.keys()].sort()).toEqual(['e1', 'e2', 'e3']);
  });

  it('keeps each label off the strokes of the other connectors', () => {
    for (const el of edges) {
      const box = boxes.get(el.id)!;
      for (const other of edges) {
        if (other.id === el.id) continue;
        const route = resolveConnectorRoute(other, elements);
        const hit = route.slice(1).some((p, i) => crosses(route[i]!, p, box));
        expect(hit, `${el.label} crosses ${other.label}`).toBe(false);
      }
    }
  });

  it('keeps labels apart and off the nodes', () => {
    const list = [...boxes.values()];
    for (const a of list)
      for (const b of list) {
        if (a === b) continue;
        const apart =
          Math.abs(a.x - b.x) >= (a.w + b.w) / 2 ||
          Math.abs(a.y - b.y) >= (a.h + b.h) / 2;
        expect(apart).toBe(true);
      }
    for (const box of list)
      for (const node of elements.filter((el) => el.type === 'rectangle')) {
        if (node.type !== 'rectangle') continue;
        const apart =
          box.x + box.w / 2 <= node.x ||
          box.x - box.w / 2 >= node.x + node.width ||
          box.y + box.h / 2 <= node.y ||
          box.y - box.h / 2 >= node.y + node.height;
        expect(apart).toBe(true);
      }
  });

  it('keeps a lone label in the middle of its route', () => {
    const lone = [rect('p', 0, 0), rect('q', 0, 300), edge('e', 'p', 'q', 'x')];
    const box = getConnectorLabelBoxes(lone).get('e')!;
    expect(box.x).toBeCloseTo(80, 5);
    expect(box.y).toBeCloseTo(185, 0);
  });

  it('is computed once per elements array', () => {
    expect(getConnectorLabelBoxes(elements)).toBe(boxes);
  });
});
