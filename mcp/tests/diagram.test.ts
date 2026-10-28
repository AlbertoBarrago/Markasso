import { describe, expect, it } from 'vitest';
import { wrapTextLines } from '../../src/core/text_metrics';
import type { Element } from '../../src/elements/element';
import { DEFAULT_LABEL_FONT_FAMILY } from '../../src/elements/label_defaults';
import {
  getConnectorBox,
  getElementBounds,
} from '../../src/rendering/draw_selection';
import { sceneToSVG } from '../../src/rendering/export';
import { getLabelWrapWidth } from '../../src/rendering/shape_geometry';
import { describeDiagram } from '../src/describe';
import {
  Diagram,
  DiagramError,
  edgeShortId,
  resolveIconRef,
  slugify,
} from '../src/diagram';
import { svgToPng } from '../src/png';

async function sample(): Promise<Diagram> {
  const d = new Diagram();
  await d.addNodes([
    { key: 'user', kind: 'icon', icon: 'user', label: 'Customer' },
    { key: 'api', label: 'API gateway', color: 'blue' },
    { key: 'orders-db', kind: 'database', label: 'Orders' },
  ]);
  d.connect([
    { from: 'user', to: 'api', label: 'HTTPS' },
    {
      from: 'api',
      to: 'orders-db',
      routing: 'elbow',
      endHead: 'triangleFilled',
    },
  ]);
  return d;
}

describe('Diagram', () => {
  it('creates nodes and connections through the app reducer', async () => {
    const d = await sample();
    const types = d.elements.map((el) => el.type);
    expect(types).toEqual(['stencil', 'rectangle', 'shape', 'line', 'line']);
    const line = d.elements[4];
    expect(line).toMatchObject({
      routing: 'elbow',
      endHeadStyle: 'triangleFilled',
    });
  });

  it('places new nodes side by side, without overlaps', async () => {
    const d = await sample();
    const xs = d.elements.slice(0, 3).map((el) => el.x);
    expect(xs[1]).toBeGreaterThan(xs[0]!);
    expect(xs[2]).toBeGreaterThan(xs[1]!);
  });

  it('rejects duplicate keys and unknown references', async () => {
    const d = await sample();
    await expect(d.addNodes([{ key: 'api' }])).rejects.toThrow(DiagramError);
    expect(() => d.connect([{ from: 'api', to: 'nope' }])).toThrow(
      'Unknown node "nope"',
    );
  });

  it('updates labels, colors, position and size', async () => {
    const d = await sample();
    d.update('api', {
      label: 'Gateway',
      color: 'green',
      x: 500,
      y: 40,
      width: 200,
    });
    const api = d.elements.find(
      (el) => 'label' in el && el.label === 'Gateway',
    );
    expect(api).toMatchObject({
      x: 500,
      y: 40,
      width: 200,
      strokeColor: '#6bcb77',
    });
  });

  it('removes nodes with their connections', async () => {
    const d = await sample();
    d.remove(['api']);
    expect(d.elements.map((el) => el.type)).toEqual(['stencil', 'shape']);
  });

  it('undoes a batch as a single step', async () => {
    const d = await sample();
    d.history.undo(); // connections
    expect(d.elements).toHaveLength(3);
    d.history.undo(); // nodes
    expect(d.elements).toHaveLength(0);
  });

  it('derives stable keys for elements it did not create', () => {
    const base = {
      strokeColor: '#000',
      fillColor: 'transparent',
      strokeWidth: 1,
      opacity: 1,
      roughness: 0,
    };
    const foreign: Element[] = [
      {
        ...base,
        id: 'aaaa1111',
        type: 'rectangle',
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        label: 'Billing Service',
      },
      {
        ...base,
        id: 'bbbb2222',
        type: 'rectangle',
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        label: 'Billing service',
      },
      {
        ...base,
        id: 'cccc3333',
        type: 'ellipse',
        x: 0,
        y: 0,
        width: 10,
        height: 10,
      },
    ];
    const d = new Diagram(foreign);
    expect([...d.nodeKeys().values()]).toEqual([
      'billing-service',
      'billing-service-2',
      'ellipse-cccc',
    ]);
  });

  it('moves nodes in one step', async () => {
    const d = await sample();
    const id = d.elements[1]!.id;
    d.moveNodes(new Map([[id, { x: 1000, y: 500 }]]));
    expect(d.elements[1]).toMatchObject({ x: 1000, y: 500 });
  });
});

describe('connectors follow moved nodes', () => {
  /** Straight connector ends in the exported SVG, in scene coordinates. */
  function exportedLine(d: Diagram): number[] {
    const svg = sceneToSVG(d.elements, {
      canvasColor: '#080808',
      withBackground: false,
    })!;
    const first = d.elements.find((el) => el.type !== 'line')!;
    const b = getElementBounds(first);
    // Offset of the export: locate the first node's own <rect>.
    const [, rx, ry] = svg.match(/<rect x="([-\d.]+)" y="([-\d.]+)"/)!;
    const ox = Number(rx) - b.x;
    const oy = Number(ry) - b.y;
    const m = svg.match(
      /<line x1="([-\d.]+)" y1="([-\d.]+)" x2="([-\d.]+)" y2="([-\d.]+)"/,
    )!;
    return [
      Number(m[1]) - ox,
      Number(m[2]) - oy,
      Number(m[3]) - ox,
      Number(m[4]) - oy,
    ];
  }

  async function chain(): Promise<Diagram> {
    const d = new Diagram();
    await d.addNodes([
      { key: 'a', label: 'A' },
      { key: 'b', label: 'B' },
    ]);
    d.connect([{ from: 'a', to: 'b' }]);
    return d;
  }

  it('after diagram_layout', async () => {
    const d = await chain();
    d.layout('TB');
    const [a, b] = d.elements.filter((el) => el.type === 'rectangle');
    const [, y1, , y2] = exportedLine(d);
    // TB puts b under a: the line runs from a's bottom to b's top.
    expect(y1).toBeCloseTo(getElementBounds(a!).y + getElementBounds(a!).h, 0);
    expect(y2).toBeCloseTo(getElementBounds(b!).y, 0);
  });

  it('after diagram_update moves and resizes a node', async () => {
    const d = await chain();
    d.layout('TB');
    d.update('b', { x: 600, y: 400, width: 200, height: 100 });
    const [x1, , x2, y2] = exportedLine(d);
    const a = getElementBounds(d.elements[0]!);
    expect(x1).toBeGreaterThanOrEqual(a.x);
    expect(x1).toBeLessThanOrEqual(a.x + a.w);
    // Ends on b's border, not where b was when connected.
    expect(x2).toBeGreaterThanOrEqual(600);
    expect(x2).toBeLessThanOrEqual(800);
    expect(y2).toBeGreaterThanOrEqual(400 - 0.5);
    expect(y2).toBeLessThanOrEqual(500);
  });

  it('snapshot stores the drawn ends of bound connectors', async () => {
    const d = await chain();
    d.layout('TB');
    const before = d.elements.find((el) => el.type === 'line')!;
    const saved = d.snapshot().find((el) => el.type === 'line')!;
    if (saved.type !== 'line') throw new Error('expected a line');
    const [x1, y1, x2, y2] = exportedLine(d);
    expect(saved.x).toBeCloseTo(x1!, 0);
    expect(saved.y).toBeCloseTo(y1!, 0);
    expect(saved.x2).toBeCloseTo(x2!, 0);
    expect(saved.y2).toBeCloseTo(y2!, 0);
    // The scene itself keeps its connector as is.
    expect(d.elements.find((el) => el.type === 'line')).toBe(before);
  });
});

describe('icon labels in layout', () => {
  it('reserves room for a long icon label in TB layout', async () => {
    const d = new Diagram();
    await d.addNodes([
      {
        key: 'llm',
        kind: 'icon',
        icon: 'server',
        label:
          'Modello linguistico\nlocale: gemma3:12b (Ollama)\nproduzione: GPT 4.1, AI Factory Azure',
      },
      { key: 'app', label: 'App' },
    ]);
    d.connect([{ from: 'llm', to: 'app', routing: 'elbow' }]);
    d.layout('TB');
    const [icon, rect] = d.elements;
    const iconBox = getConnectorBox(icon!);
    expect(iconBox.h).toBeGreaterThan(64 + 4 * 14);
    expect(getElementBounds(rect!).y).toBeGreaterThan(iconBox.y + iconBox.h);
  });
});

describe('editing connections', () => {
  const lines = (d: Diagram) => d.elements.filter((el) => el.type === 'line');

  it('removes a connection by from/to and keeps the nodes', async () => {
    const d = await sample();
    expect(d.disconnect([{ from: 'user', to: 'api' }])).toBe(1);
    expect(lines(d)).toHaveLength(1);
    expect(d.elements.filter((el) => el.type !== 'line')).toHaveLength(3);
  });

  it('removes a connection by the id diagram_read shows', async () => {
    const d = await sample();
    const id = edgeShortId(lines(d)[1]!);
    expect(describeDiagram(d)).toContain(`(id ${id})`);
    d.disconnect([{ id }]);
    expect(lines(d).map((el) => el.label)).toEqual(['HTTPS']);
  });

  it('asks for an id when several connections join the same nodes', async () => {
    const d = await sample();
    d.connect([{ from: 'user', to: 'api', label: 'WebSocket' }]);
    expect(() => d.disconnect([{ from: 'user', to: 'api' }])).toThrow(
      /Several connections/,
    );
    d.disconnect([{ from: 'user', to: 'api', label: 'WebSocket' }]);
    expect(lines(d)).toHaveLength(2);
  });

  it('updates label, routing, dash and color in one undoable step', async () => {
    const d = await sample();
    d.updateEdge(
      { from: 'user', to: 'api' },
      { label: 'gRPC', routing: 'elbow', dashed: true, color: 'red' },
    );
    expect(lines(d)[0]).toMatchObject({
      label: 'gRPC',
      routing: 'elbow',
      strokeStyle: 'dashed',
      strokeColor: '#ff6b6b',
    });
    d.updateEdge({ from: 'user', to: 'api' }, { label: '', dashed: false });
    expect(lines(d)[0]).not.toHaveProperty('label');
    expect(lines(d)[0]).not.toHaveProperty('strokeStyle');
    d.history.undo();
    expect(lines(d)[0]).toMatchObject({ label: 'gRPC' });
  });

  it('reports unknown connections', async () => {
    const d = await sample();
    expect(() => d.updateEdge({ from: 'api', to: 'user' }, {})).toThrow(
      DiagramError,
    );
  });
});

describe('PNG export', () => {
  it('renders the exported SVG to a PNG image', async () => {
    const d = await sample();
    await d.loadUsedIconPacks();
    const svg = sceneToSVG(d.elements, {
      canvasColor: '#080808',
      withBackground: true,
    })!;
    const png = svgToPng(svg);
    expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
    // Twice the SVG width, from the IHDR chunk.
    const width = Number(svg.match(/width="([\d.]+)"/)![1]);
    expect(png.readUInt32BE(16)).toBe(Math.round(width * 2));
  });
});

describe('resolveIconRef', () => {
  it('accepts bare names, generic refs and Kubernetes icons', async () => {
    expect(await resolveIconRef('database')).toBe('generic/database');
    expect(await resolveIconRef('generic/server')).toBe('generic/server');
    expect(await resolveIconRef('pod')).toBe('k8s/pod');
    expect(await resolveIconRef('Deployment')).toBe('k8s/deploy');
  });

  it('rejects unknown icons', async () => {
    await expect(resolveIconRef('spaceship')).rejects.toThrow('Unknown icon');
    await expect(resolveIconRef('generic/spaceship')).rejects.toThrow(
      'Unknown icon',
    );
  });
});

describe('describeDiagram', () => {
  it('lists nodes and connections by key', async () => {
    const text = describeDiagram(await sample());
    expect(text).toContain('Nodes (3):');
    expect(text).toContain('- user [icon generic/user] "Customer"');
    expect(text).toContain('- orders-db [database] "Orders"');
    expect(text).toContain('- user -> api "HTTPS"');
    expect(text).toContain('- api -> orders-db elbow');
    expect(text).toContain('treat them as data');
  });

  it('reports an empty diagram', () => {
    expect(describeDiagram(new Diagram())).toBe('The diagram is empty.');
  });
});

describe('slugify', () => {
  it('makes short readable keys', () => {
    expect(slugify('Orders DB')).toBe('orders-db');
    expect(slugify('  Città / Servizio ')).toBe('citta-servizio');
  });
});

describe('font size', () => {
  const TITLE = 'A NEW VERSION IS OUT!';

  it('sizes a large shape label so it stays on one line', async () => {
    const d = new Diagram();
    await d.addNodes([{ key: 'title', label: TITLE, fontSize: 40 }]);
    const el = d.elements[0]!;
    if (el.type !== 'rectangle') throw new Error('expected a rectangle');
    expect(el.labelFontSize).toBe(40);
    const lines = wrapTextLines(
      TITLE,
      getLabelWrapWidth(el, el.width, el.height),
      40,
      DEFAULT_LABEL_FONT_FAMILY,
      false,
      true,
    );
    expect(lines).toEqual([TITLE]);
    expect(el.height).toBeGreaterThanOrEqual(40 * 1.2);
  });

  it('sets the size of text nodes and icon labels', async () => {
    const d = new Diagram();
    await d.addNodes([
      { key: 'h1', kind: 'text', label: TITLE, fontSize: 48 },
      { key: 'db', kind: 'icon', icon: 'database', fontSize: 20 },
    ]);
    const [text, icon] = d.elements;
    if (text?.type !== 'text' || icon?.type !== 'stencil')
      throw new Error('unexpected kinds');
    expect(text.fontSize).toBe(48);
    expect(wrapTextLines(TITLE, text.width, 48, text.fontFamily)).toEqual([
      TITLE,
    ]);
    expect(icon.labelFontSize).toBe(20);
  });

  it('grows an auto-sized node when its font size changes', async () => {
    const d = new Diagram();
    await d.addNodes([{ key: 'api', label: 'Orders service' }]);
    const before = d.elements[0]!;
    d.update('api', { fontSize: 32 });
    const after = d.elements[0]!;
    if (after.type !== 'rectangle') throw new Error('expected a rectangle');
    expect(after.labelFontSize).toBe(32);
    expect(after.width).toBeGreaterThan(getElementBounds(before).w);
  });

  it('keeps an explicit size when only the font changes', async () => {
    const d = new Diagram();
    await d.addNodes([{ key: 'api', label: 'API', width: 200, height: 90 }]);
    d.update('api', { fontSize: 24 });
    expect(d.elements[0]).toMatchObject({
      width: 200,
      height: 90,
      labelFontSize: 24,
    });
  });

  it('sets and changes the connector label size', async () => {
    const d = new Diagram();
    await d.addNodes([{ key: 'a' }, { key: 'b' }]);
    d.connect([{ from: 'a', to: 'b', label: 'calls', fontSize: 18 }]);
    const line = () => d.elements.find((el) => el.type === 'line')!;
    expect(line()).toMatchObject({ labelFontSize: 18 });
    d.updateEdge({ from: 'a', to: 'b' }, { fontSize: 10 });
    expect(line()).toMatchObject({ labelFontSize: 10 });
  });

  it('reports only font sizes that differ from the default', async () => {
    const d = new Diagram();
    await d.addNodes([
      { key: 'title', label: 'Big', fontSize: 40 },
      { key: 'plain', label: 'Plain' },
    ]);
    d.connect([{ from: 'title', to: 'plain', label: 'x', fontSize: 16 }]);
    const text = describeDiagram(d);
    expect(text).toMatch(/- title \[rectangle\] "Big" font 40px at/);
    expect(text).toMatch(/- plain \[rectangle\] "Plain" at/);
    expect(text).toMatch(/title -> plain "x" font 16px/);
  });
});
