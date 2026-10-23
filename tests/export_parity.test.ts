import { describe, expect, it } from 'vitest';
import type { Element } from '../src/elements/element';
import { createStencil } from '../src/elements/stencils/registry';
import {
  drawConnectorLabels,
  drawElement,
} from '../src/rendering/draw_element';
import { resolveArrowEndpoints } from '../src/rendering/draw_selection';
import { sceneToSVG } from '../src/rendering/export';

/**
 * Parity between the canvas renderer and the SVG export: the same document
 * must put the same text lines at the same places in both. The canvas side
 * runs `drawElement` on a recording context; the SVG side is parsed back.
 */

const base = {
  strokeColor: '#e2e2ef',
  fillColor: 'transparent',
  strokeWidth: 2,
  opacity: 1,
  roughness: 0,
} as const;

interface TextLine {
  readonly text: string;
  readonly x: number;
  /** Vertical center of the line's em box, whatever the baseline. */
  readonly cy: number;
}

/** Context that records `fillText` calls and ignores everything else. */
function recordingContext(): {
  ctx: CanvasRenderingContext2D;
  lines: TextLine[];
} {
  const lines: TextLine[] = [];
  const state: Record<string, unknown> = {
    font: '10px Arial',
    textBaseline: 'alphabetic',
    textAlign: 'start',
  };
  const ctx = new Proxy(state, {
    get(target, prop: string) {
      if (prop === 'fillText') {
        return (text: string, x: number, y: number) => {
          const size = Number.parseFloat(
            String(target.font).match(/(\d+(?:\.\d+)?)px/)![1]!,
          );
          const cy = target.textBaseline === 'top' ? y + size / 2 : y;
          lines.push({ text, x, cy });
        };
      }
      if (prop === 'measureText') return () => ({ width: 0 });
      if (prop in target) return target[prop];
      return () => undefined;
    },
    set(target, prop: string, value) {
      target[prop] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, lines };
}

/** Text lines of an exported SVG, in document coordinates. */
function svgLines(svg: string, ox: number, oy: number): TextLine[] {
  const lines: TextLine[] = [];
  for (const [, attrs, body] of svg.matchAll(/<text([^>]*)>(.*?)<\/text>/g)) {
    const size = Number(attrs!.match(/font-size="([\d.]+)"/)![1]);
    const hanging = attrs!.includes('text-before-edge');
    for (const [, x, y, text] of body!.matchAll(
      /<tspan x="([-\d.]+)" y="([-\d.]+)">(.*?)<\/tspan>/g,
    )) {
      lines.push({
        text: text!
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&'),
        x: Number(x) - ox,
        cy: Number(y) - oy + (hanging ? size / 2 : 0),
      });
    }
  }
  return lines;
}

const byText = (a: TextLine, b: TextLine) =>
  a.text.localeCompare(b.text) || a.cy - b.cy;

/** Connectors store the node centers, as diagram_connect does. */
function document(): Element[] {
  return [
    {
      ...base,
      id: 'api',
      type: 'rectangle',
      x: 0,
      y: 0,
      width: 160,
      height: 90,
      label: 'API gateway with a label long enough to wrap twice',
    },
    {
      ...base,
      id: 'check',
      type: 'rhombus',
      x: 400,
      y: 0,
      width: 180,
      height: 110,
      label: 'Authorized?',
    },
    {
      ...base,
      id: 'cache',
      type: 'ellipse',
      x: 0,
      y: 300,
      width: 160,
      height: 80,
      label: 'Cache layer',
    },
    {
      ...base,
      id: 'db',
      type: 'shape',
      kind: 'database',
      x: 400,
      y: 300,
      width: 140,
      height: 90,
      label: 'Orders database',
    },
    createStencil(
      'llm',
      { kind: 'builtin', ref: 'generic/server' },
      232,
      532,
      base,
      'Modello linguistico\nlocale: gemma3:12b (Ollama)\nproduzione: GPT 4.1, AI Factory Azure',
    ),
    {
      ...base,
      id: 'title',
      type: 'text',
      x: 0,
      y: -120,
      width: 260,
      height: 60,
      content: 'Architecture\nof the system',
      fontSize: 20,
      fontFamily: 'Arial, sans-serif',
      textAlign: 'center',
      bold: true,
    },
    {
      ...base,
      id: 'straight',
      type: 'line',
      x: 80,
      y: 45,
      x2: 490,
      y2: 55,
      arrowHead: 'end',
      routing: 'straight',
      startElementId: 'api',
      endElementId: 'check',
      label: 'auth',
    },
    {
      ...base,
      id: 'elbow',
      type: 'line',
      x: 80,
      y: 340,
      x2: 470,
      y2: 345,
      arrowHead: 'end',
      routing: 'elbow',
      startElementId: 'cache',
      endElementId: 'db',
      label: 'miss',
    },
    {
      ...base,
      id: 'arrow',
      type: 'arrow',
      x: 490,
      y: 55,
      x2: 470,
      y2: 345,
      startElementId: 'check',
      endElementId: 'db',
      label: 'yes',
    },
  ];
}

describe('canvas and SVG parity', () => {
  const elements = document();
  const svg = sceneToSVG(elements, {
    canvasColor: '#080808',
    withBackground: true,
  })!;
  // The rectangle at (0, 0) gives the export offset.
  const [, rx, ry] = svg.match(
    /<rect x="([-\d.]+)" y="([-\d.]+)" width="160"/,
  )!;
  const ox = Number(rx);
  const oy = Number(ry);

  it('draws the same text lines at the same positions', () => {
    const { ctx, lines } = recordingContext();
    for (const el of elements) drawElement(ctx, el, elements);
    drawConnectorLabels(ctx, elements, '#080808');
    const canvas = [...lines].sort(byText);
    const exported = svgLines(svg, ox, oy).sort(byText);

    expect(exported.map((l) => l.text)).toEqual(canvas.map((l) => l.text));
    exported.forEach((line, i) => {
      expect(line.x).toBeCloseTo(canvas[i]!.x, 1);
      expect(line.cy).toBeCloseTo(canvas[i]!.cy, 1);
    });
  });

  it('wraps icon labels and keeps every label (rhombus, straight, arrow)', () => {
    const texts = svgLines(svg, ox, oy).map((l) => l.text);
    expect(texts).toContain('Authorized?');
    expect(texts).toContain('auth');
    expect(texts).toContain('yes');
    expect(texts).toContain('miss');
    // "produzione: GPT 4.1, AI Factory Azure" does not fit the label column.
    expect(texts).not.toContain('produzione: GPT 4.1, AI Factory Azure');
  });

  it('ends straight connectors on the node borders', () => {
    const straight = elements.find((el) => el.id === 'straight')!;
    if (straight.type !== 'line') throw new Error('expected a line');
    const pts = resolveArrowEndpoints(straight, elements);
    // Right edge of the rectangle, slanted edge next to the rhombus corner.
    expect(pts.x).toBeCloseTo(160, 0);
    expect(pts.x2).toBeGreaterThan(400);
    expect(pts.x2).toBeLessThan(410);
    const line = svg.match(
      /<line x1="([-\d.]+)" y1="([-\d.]+)" x2="([-\d.]+)" y2="([-\d.]+)"/,
    )!;
    expect(Number(line[1]) - ox).toBeCloseTo(pts.x, 1);
    expect(Number(line[3]) - ox).toBeCloseTo(pts.x2, 1);
  });
});
