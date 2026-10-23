import { describe, expect, it } from 'vitest';
import type { Element } from '../../src/elements/element';
import { getElementBounds } from '../../src/rendering/draw_selection';
import { sceneToSVG } from '../../src/rendering/export';
import { describeDiagram } from '../src/describe';
import { Diagram, DiagramError, resolveIconRef, slugify } from '../src/diagram';

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
