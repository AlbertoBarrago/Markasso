import { describe, expect, it } from 'vitest';
import type {
  ArrowElement,
  ImageElement,
  LineElement,
  RectangleElement,
  RhombusElement,
  TextElement,
} from '../src/elements/element';
import {
  curveControlPoint,
  type MermaidSkeleton,
  type MermaidTheme,
  skeletonsToElements,
} from '../src/io/mermaid';

/*
 * Parsing and layout belong to Mermaid (via @excalidraw/mermaid-to-excalidraw)
 * and need a real DOM, so these tests cover the skeleton → element mapping
 * with fixtures shaped like the converter's output.
 */

const DARK: MermaidTheme = { isDark: true, strokeColor: '#e2e2ef' };
const LIGHT: MermaidTheme = { isDark: false, strokeColor: '#000000' };

/** `graph TD; A[Start] --> B{Ok?}; B -- yes --> C((Done))` as the converter emits it. */
const FLOWCHART: MermaidSkeleton[] = [
  {
    id: 'A',
    type: 'rectangle',
    x: 40,
    y: 0,
    width: 100,
    height: 50,
    label: { text: 'Start', fontSize: 16 },
  },
  {
    id: 'B',
    type: 'diamond',
    x: 30,
    y: 100,
    width: 120,
    height: 80,
    label: { text: 'Ok?', fontSize: 16 },
  },
  {
    id: 'C',
    type: 'ellipse',
    x: 50,
    y: 240,
    width: 80,
    height: 80,
    label: { text: 'Done', fontSize: 16 },
  },
  {
    id: 'A_B',
    type: 'arrow',
    x: 90,
    y: 50,
    points: [
      [0, 0],
      [0, 50],
    ],
    start: { id: 'A' },
    end: { id: 'B' },
  },
  {
    id: 'B_C',
    type: 'arrow',
    x: 90,
    y: 180,
    points: [
      [0, 0],
      [0, 60],
    ],
    strokeStyle: 'dashed',
    label: { text: 'yes', fontSize: 16 },
    start: { id: 'B' },
    end: { id: 'C' },
  },
];

describe('skeletonsToElements: containers', () => {
  it('maps rectangle, diamond and ellipse to native shapes', () => {
    const els = skeletonsToElements(FLOWCHART, {}, DARK);
    expect(els.map((e) => e.type)).toEqual([
      'rectangle',
      'rhombus',
      'ellipse',
      'arrow',
      'arrow',
    ]);
  });

  it('keeps geometry and labels', () => {
    const [rect, rhombus] = skeletonsToElements(FLOWCHART, {}, DARK) as [
      RectangleElement,
      RhombusElement,
    ];
    expect(rect).toMatchObject({ x: 40, y: 0, width: 100, height: 50 });
    expect(rect.label).toBe('Start');
    expect(rect.labelFontSize).toBe(16);
    expect(rhombus.label).toBe('Ok?');
  });

  it('applies the Markasso palette for the active theme', () => {
    const [dark] = skeletonsToElements(FLOWCHART, {}, DARK);
    const [light] = skeletonsToElements(FLOWCHART, {}, LIGHT);
    expect(dark!.strokeColor).toBe('#4d96ff');
    expect(light!.strokeColor).toBe('#1a6fd4');
    expect((dark as RectangleElement).labelColor).toBe('#e2e2ef');
  });

  it('replaces Mermaid ids with fresh unique ids', () => {
    const a = skeletonsToElements(FLOWCHART, {}, DARK);
    const b = skeletonsToElements(FLOWCHART, {}, DARK);
    const ids = [...a, ...b].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain('A');
  });

  it('rounds rectangles that carry roundness', () => {
    const [el] = skeletonsToElements(
      [
        {
          type: 'rectangle',
          x: 0,
          y: 0,
          width: 100,
          height: 40,
          roundness: { type: 3 },
        },
      ],
      {},
      DARK,
    ) as [RectangleElement];
    expect(el.cornerRadius).toBe(16);
  });

  it('splits subgraph titles into a top-pinned text and leaves the box unfilled', () => {
    const els = skeletonsToElements(
      [
        {
          id: 'sub',
          type: 'rectangle',
          x: 0,
          y: 0,
          width: 300,
          height: 200,
          label: { text: 'Backend', fontSize: 16, verticalAlign: 'top' },
        },
      ],
      {},
      DARK,
    );
    const [box, title] = els as [RectangleElement, TextElement];
    expect(box.label).toBeUndefined();
    expect(box.fillColor).toBe('transparent');
    expect(title.type).toBe('text');
    expect(title.content).toBe('Backend');
    expect(title.y).toBeLessThan(box.y + 20);
  });
});

describe('skeletonsToElements: connectors', () => {
  it('binds arrows to the remapped shape ids', () => {
    const els = skeletonsToElements(FLOWCHART, {}, DARK);
    const [rect, rhombus] = els;
    const arrow = els[3] as ArrowElement;
    expect(arrow.startElementId).toBe(rect!.id);
    expect(arrow.endElementId).toBe(rhombus!.id);
  });

  it('drops bindings whose endpoint is far from the bound node', () => {
    // Sequence messages are bound to the actor header but start mid-lifeline
    const [, , arrow] = skeletonsToElements(
      [
        { id: 'U', type: 'rectangle', x: 0, y: 0, width: 100, height: 40 },
        { id: 'M', type: 'rectangle', x: 300, y: 0, width: 100, height: 40 },
        {
          type: 'arrow',
          x: 50,
          y: 200,
          points: [
            [0, 0],
            [300, 0],
          ],
          start: { id: 'U' },
          end: { id: 'M' },
        },
      ],
      {},
      DARK,
    ) as [RectangleElement, RectangleElement, ArrowElement];
    expect(arrow.startElementId).toBeUndefined();
    expect(arrow.endElementId).toBeUndefined();
    expect(arrow).toMatchObject({ x: 50, y: 200, x2: 350, y2: 200 });
  });

  it('converts relative points to absolute endpoints', () => {
    const arrow = skeletonsToElements(FLOWCHART, {}, DARK)[3] as ArrowElement;
    expect(arrow).toMatchObject({ x: 90, y: 50, x2: 90, y2: 100 });
  });

  it('keeps dashed style and edge labels', () => {
    const arrow = skeletonsToElements(FLOWCHART, {}, DARK)[4] as ArrowElement;
    expect(arrow.strokeStyle).toBe('dashed');
    expect(arrow.label).toBe('yes');
    expect(arrow.labelFontSize).toBe(14);
  });

  it('turns arrows without arrowheads into plain lines', () => {
    const [el] = skeletonsToElements(
      [
        {
          type: 'arrow',
          x: 0,
          y: 0,
          points: [
            [0, 0],
            [100, 0],
          ],
          startArrowhead: null,
          endArrowhead: null,
        },
      ],
      {},
      DARK,
    ) as [LineElement];
    expect(el.type).toBe('line');
    expect(el.arrowHead).toBeUndefined();
  });

  it('maps double-headed arrows to a line with both heads', () => {
    const [el] = skeletonsToElements(
      [
        {
          type: 'arrow',
          x: 0,
          y: 0,
          points: [
            [0, 0],
            [100, 0],
          ],
          startArrowhead: 'arrow',
          endArrowhead: 'arrow',
        },
      ],
      {},
      DARK,
    ) as [LineElement];
    expect(el.type).toBe('line');
    expect(el.arrowHead).toBe('both');
  });

  it('turns bent routes into a curved line that keeps its arrowhead', () => {
    const [el] = skeletonsToElements(
      [
        {
          type: 'arrow',
          x: 0,
          y: 0,
          points: [
            [0, 0],
            [100, 100],
            [200, 0],
          ],
        },
      ],
      {},
      DARK,
    ) as [LineElement];
    expect(el.type).toBe('line');
    expect(el.arrowHead).toBe('end');
    expect(el).toMatchObject({ x: 0, y: 0, x2: 200, y2: 0, cx: 100, cy: 200 });
  });

  it('maps sequence lifelines (line skeletons) to lines', () => {
    const [el] = skeletonsToElements(
      [
        {
          type: 'line',
          x: 50,
          y: 40,
          points: [
            [0, 0],
            [0, 300],
          ],
          strokeStyle: 'solid',
        },
      ],
      {},
      DARK,
    ) as [LineElement];
    expect(el).toMatchObject({ type: 'line', x: 50, y: 40, x2: 50, y2: 340 });
    expect(el.strokeStyle).toBeUndefined();
  });

  it('draws connectors above shapes and text above connectors', () => {
    const els = skeletonsToElements(
      [
        { type: 'text', x: 0, y: 0, text: 'note', fontSize: 16 },
        FLOWCHART[3]!,
        FLOWCHART[0]!,
      ],
      {},
      DARK,
    );
    expect(els.map((e) => e.type)).toEqual(['rectangle', 'arrow', 'text']);
  });
});

describe('skeletonsToElements: text, frames, images', () => {
  it('maps free text with theme color and estimated bounds', () => {
    const [el] = skeletonsToElements(
      [{ type: 'text', x: 10, y: 20, text: 'two\nlines', fontSize: 20 }],
      {},
      LIGHT,
    ) as [TextElement];
    expect(el).toMatchObject({
      type: 'text',
      x: 10,
      y: 20,
      content: 'two\nlines',
    });
    expect(el.strokeColor).toBe('#000000');
    expect(el.width).toBeGreaterThan(0);
    expect(el.height).toBe(50);
  });

  it('prefers measured text bounds when present', () => {
    const [el] = skeletonsToElements(
      [
        {
          type: 'text',
          x: 0,
          y: 0,
          width: 77,
          height: 22,
          text: 'hi',
          fontSize: 16,
        },
      ],
      {},
      DARK,
    ) as [TextElement];
    expect(el).toMatchObject({ width: 77, height: 22 });
  });

  it('maps frames to a dashed outline plus their name', () => {
    const [frame, title] = skeletonsToElements(
      [{ type: 'frame', x: 0, y: 0, width: 400, height: 300, name: 'core' }],
      {},
      DARK,
    ) as [RectangleElement, TextElement];
    expect(frame.strokeStyle).toBe('dashed');
    expect(frame.fillColor).toBe('transparent');
    expect(title.content).toBe('core');
  });

  it('uses the SVG fallback file for image skeletons', () => {
    const [el] = skeletonsToElements(
      [{ type: 'image', x: 0, y: 0, width: 320, height: 180, fileId: 'f1' }],
      { f1: { dataURL: 'data:image/svg+xml;base64,AAAA' } },
      DARK,
    ) as [ImageElement];
    expect(el).toMatchObject({
      type: 'image',
      src: 'data:image/svg+xml;base64,AAAA',
      width: 320,
      height: 180,
      naturalWidth: 320,
      naturalHeight: 180,
    });
  });

  it('skips images whose file is missing or that have no size', () => {
    const els = skeletonsToElements(
      [
        {
          type: 'image',
          x: 0,
          y: 0,
          width: 320,
          height: 180,
          fileId: 'missing',
        },
        { type: 'image', x: 0, y: 0, width: 0, height: 0, fileId: 'f1' },
      ],
      { f1: { dataURL: 'data:image/svg+xml;base64,AAAA' } },
      DARK,
    );
    expect(els).toEqual([]);
  });
});

describe('curveControlPoint', () => {
  it('returns null for two-point paths', () => {
    expect(
      curveControlPoint([
        [0, 0],
        [100, 0],
      ]),
    ).toBeNull();
  });

  it('returns null for nearly straight polylines', () => {
    expect(
      curveControlPoint([
        [0, 0],
        [50, 2],
        [100, 0],
      ]),
    ).toBeNull();
  });

  it('makes the quadratic pass through the path midpoint', () => {
    const pts = [
      [0, 0],
      [100, 100],
      [200, 0],
    ] as const;
    const c = curveControlPoint(pts)!;
    // B(0.5) = (P0 + 2C + P2) / 4 must equal the arc midpoint (100, 100)
    expect((pts[0][0] + 2 * c[0] + pts[2][0]) / 4).toBeCloseTo(100);
    expect((pts[0][1] + 2 * c[1] + pts[2][1]) / 4).toBeCloseTo(100);
  });
});
