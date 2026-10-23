import { describe, expect, it } from 'vitest';
import type { Element, LineElement } from '../src/elements/element';
import {
  createStencil,
  getStencilLabelBox,
  getStencilLabelLines,
} from '../src/elements/stencils/registry';
import type { RoutePoint } from '../src/rendering/connector_geometry';
import {
  getConnectorBox,
  resolveConnectorRoute,
} from '../src/rendering/draw_selection';

const base = {
  strokeColor: '#e2e2ef',
  fillColor: 'transparent',
  strokeWidth: 2,
  opacity: 1,
  roughness: 0,
} as const;

const LABEL =
  'Modello linguistico\nlocale: gemma3:12b (Ollama)\nproduzione: GPT 4.1, AI Factory Azure';

type Box = { x: number; y: number; w: number; h: number };

/** True when the axis-aligned segment enters the box interior. */
function crossesBox(a: RoutePoint, b: RoutePoint, box: Box): boolean {
  const e = 0.5;
  const minX = Math.min(a[0], b[0]);
  const maxX = Math.max(a[0], b[0]);
  const minY = Math.min(a[1], b[1]);
  const maxY = Math.max(a[1], b[1]);
  return (
    maxX > box.x + e &&
    minX < box.x + box.w - e &&
    maxY > box.y + e &&
    minY < box.y + box.h - e
  );
}

function routeCrosses(route: ReadonlyArray<RoutePoint>, box: Box): boolean {
  return route.slice(1).some((p, i) => crossesBox(route[i]!, p, box));
}

function scene(
  target: { x: number; y: number },
  routing: 'elbow' | 'straight',
): { elements: Element[]; line: LineElement } {
  const icon = createStencil(
    'llm',
    { kind: 'builtin', ref: 'generic/server' },
    32,
    32,
    base,
    LABEL,
  );
  const rect: Element = {
    ...base,
    id: 'rect',
    type: 'rectangle',
    x: target.x,
    y: target.y,
    width: 160,
    height: 70,
  };
  const line: LineElement = {
    ...base,
    id: 'line',
    type: 'line',
    x: 32,
    y: 32,
    x2: target.x + 80,
    y2: target.y + 35,
    arrowHead: 'end',
    routing,
    startElementId: 'llm',
    endElementId: 'rect',
  };
  return { elements: [icon, rect, line], line };
}

describe('icon labels and connectors', () => {
  it('wraps the label and counts the wrapped lines in its box', () => {
    const { elements } = scene({ x: -48, y: 400 }, 'elbow');
    const icon = elements[0]!;
    if (icon.type !== 'stencil') throw new Error('expected a stencil');
    const lines = getStencilLabelLines(icon);
    expect(lines.length).toBeGreaterThan(3);
    const label = getStencilLabelBox(icon)!;
    expect(label.y).toBe(64);
    expect(label.h).toBeGreaterThan(lines.length * 14);
    const box = getConnectorBox(icon);
    expect(box.y + box.h).toBe(label.y + label.h);
    expect(box.w).toBeGreaterThan(64);
  });

  it('starts an elbow going down below the label', () => {
    const { elements, line } = scene({ x: -48, y: 400 }, 'elbow');
    const icon = elements[0]!;
    if (icon.type !== 'stencil') throw new Error('expected a stencil');
    const label = getStencilLabelBox(icon)!;
    const route = resolveConnectorRoute(line, elements);
    expect(route[0]![1]).toBeGreaterThanOrEqual(label.y + label.h - 0.01);
    expect(routeCrosses(route, label)).toBe(false);
  });

  it('turns past the label when leaving sideways', () => {
    // Far to the right and a little lower: the route leaves by the side.
    const { elements, line } = scene({ x: 500, y: 120 }, 'elbow');
    const icon = elements[0]!;
    if (icon.type !== 'stencil') throw new Error('expected a stencil');
    const route = resolveConnectorRoute(line, elements);
    expect(routeCrosses(route, getStencilLabelBox(icon)!)).toBe(false);
  });

  it('keeps a diagonal straight connector off the label', () => {
    const { elements, line } = scene({ x: 260, y: 260 }, 'straight');
    const icon = elements[0]!;
    if (icon.type !== 'stencil') throw new Error('expected a stencil');
    const route = resolveConnectorRoute(line, elements);
    const label = getStencilLabelBox(icon)!;
    // The visible segment starts on the label's edge, not inside it.
    const [sx, sy] = route[0]!;
    const inside =
      sx > label.x + 0.5 &&
      sx < label.x + label.w - 0.5 &&
      sy > label.y + 0.5 &&
      sy < label.y + label.h - 0.5;
    expect(inside).toBe(false);
  });
});
