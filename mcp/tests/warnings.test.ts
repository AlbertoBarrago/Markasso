import { describe, expect, it } from 'vitest';
import { Diagram, type NodeSpec } from '../src/diagram';
import { findWarnings, formatWarnings } from '../src/warnings';

/** Fixed-size rectangles at the given top-left corners. */
async function boxes(
  spec: Record<string, readonly [number, number]>,
  size: Partial<NodeSpec> = {},
): Promise<Diagram> {
  const d = new Diagram();
  await d.addNodes(
    Object.entries(spec).map(([key, [x, y]]) => ({
      key,
      x,
      y,
      width: 100,
      height: 60,
      ...size,
    })),
  );
  return d;
}

const NONE = {
  throughNodes: [],
  labelOverlaps: [],
  crossings: [],
  nodeOverlaps: [],
};

describe('findWarnings', () => {
  it('finds nothing in a clear diagram', async () => {
    const d = await boxes({ a: [0, 0], b: [300, 0] });
    d.connect([{ from: 'a', to: 'b', label: 'calls' }]);
    expect(findWarnings(d)).toEqual(NONE);
    expect(formatWarnings(findWarnings(d))).toBe('');
  });

  it('reports a connector drawn through a node that is not its end', async () => {
    const d = await boxes({ a: [0, 0], b: [200, 0], c: [400, 0] });
    d.connect([
      { from: 'a', to: 'b' },
      { from: 'a', to: 'c' },
    ]);
    const w = findWarnings(d);
    expect(w.throughNodes).toEqual([
      { edge: expect.objectContaining({ from: 'a', to: 'c' }), node: 'b' },
    ]);
    expect(formatWarnings(w)).toMatch(
      /^Warnings:\n- Connections through nodes: a -> c \(id [0-9a-f]{8}\) crosses b\. Hint: /,
    );
  });

  it('does not count a stroke that only grazes the corner of an ellipse', async () => {
    const d = await boxes({ a: [0, 0], c: [300, 100] });
    // Its bounding box covers the line, the ellipse itself does not.
    await d.addNodes([
      { key: 'e', kind: 'ellipse', x: 150, y: 10, width: 100, height: 60 },
    ]);
    d.connect([{ from: 'a', to: 'c' }]);
    expect(findWarnings(d).throughNodes).toEqual([]);
  });

  it('reports labels on nodes and on each other', async () => {
    const d = await boxes({ a: [0, 0], b: [120, 0] });
    d.connect([
      { from: 'a', to: 'b', label: 'a rather long label' },
      { from: 'b', to: 'a', label: 'another long label' },
    ]);
    const w = findWarnings(d);
    expect(w.labelOverlaps).toContainEqual({
      edge: expect.objectContaining({ from: 'a', to: 'b' }),
      node: 'a',
    });
    expect(w.labelOverlaps).toContainEqual({
      edge: expect.objectContaining({ from: 'a', to: 'b' }),
      label: expect.objectContaining({ from: 'b', to: 'a' }),
    });
    expect(formatWarnings(w)).toContain(
      '- Labels overlapping: label of a -> b',
    );
  });

  it('counts crossing connectors and names them', async () => {
    const d = await boxes({
      a: [0, 0],
      b: [400, 300],
      c: [400, 0],
      d: [0, 300],
    });
    d.connect([
      { from: 'a', to: 'b' },
      { from: 'c', to: 'd' },
      // Shares a node with both: meets them at a border, never crosses.
      { from: 'a', to: 'c' },
    ]);
    const w = findWarnings(d);
    expect(w.crossings).toEqual([
      {
        a: expect.objectContaining({ from: 'a', to: 'b' }),
        b: expect.objectContaining({ from: 'c', to: 'd' }),
        count: 1,
      },
    ]);
    expect(formatWarnings(w)).toMatch(
      /- Crossing connections \(1\): a -> b \(id \w+\) x c -> d \(id \w+\)\./,
    );
  });

  it('checks the drawn route, not the stored ends', async () => {
    const d = await boxes({
      a: [0, 0],
      b: [400, 300],
      c: [400, 0],
      d: [0, 300],
    });
    // The stored center-to-center ends cross; the elbow routes don't.
    d.connect([
      { from: 'a', to: 'b', routing: 'elbow' },
      { from: 'c', to: 'd', routing: 'elbow' },
    ]);
    expect(findWarnings(d)).toEqual(NONE);
  });

  it('reports overlapping nodes but not a frame around others', async () => {
    const d = await boxes({ a: [0, 0], b: [50, 20], c: [300, 0] });
    await d.addNodes([
      { key: 'frame', x: 280, y: -40, width: 300, height: 200, label: '' },
      { key: 'd', x: 450, y: 0, width: 100, height: 60 },
    ]);
    d.connect([{ from: 'c', to: 'd' }]);
    const w = findWarnings(d);
    expect(w.nodeOverlaps).toEqual([['a', 'b']]);
    // c -> d runs inside the frame: that is not "through a node".
    expect(w.throughNodes).toEqual([]);
    expect(formatWarnings(w)).toContain('- Overlapping nodes: a and b.');
  });

  it('finds the laid-out chain from the stale-endpoint bug clear', async () => {
    const d = new Diagram();
    await d.addNodes([
      { key: 'claude', kind: 'terminator', label: 'Claude Code' },
      { key: 'mcp', label: 'Markasso MCP' },
      { key: 'png', kind: 'document', label: 'canvas.png' },
      { key: 'viewer', label: 'rex-canvas view' },
      { key: 'pane', kind: 'terminator', label: 'Rex pane (kitty graphics)' },
    ]);
    d.connect([
      { from: 'claude', to: 'mcp' },
      { from: 'mcp', to: 'png' },
      { from: 'png', to: 'viewer' },
      { from: 'viewer', to: 'pane' },
    ]);
    d.layout('LR');
    expect(findWarnings(d)).toEqual(NONE);
  });

  it('lists a few items per kind and counts the rest', async () => {
    const spec: Record<string, readonly [number, number]> = {};
    for (let i = 0; i < 12; i++) spec[`n${i}`] = [i * 10, 0];
    const text = formatWarnings(findWarnings(await boxes(spec)));
    expect(text).toMatch(/; and \d+ more\. Hint:/);
  });
});
