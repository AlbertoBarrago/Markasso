import { describe, expect, it } from 'vitest';
import {
  type LayoutEdge,
  type LayoutNode,
  layeredLayout,
} from '../src/core/layout';

const node = (id: string, width = 80, height = 40): LayoutNode => ({
  id,
  width,
  height,
});
const edge = (from: string, to: string): LayoutEdge => ({ from, to });

function expectNoOverlap(
  nodes: LayoutNode[],
  positions: ReturnType<typeof layeredLayout>,
) {
  expect(positions.size).toBe(nodes.length);
  for (const [index, a] of nodes.entries()) {
    const pa = positions.get(a.id)!;
    expect(Number.isFinite(pa.x) && Number.isFinite(pa.y)).toBe(true);
    for (const b of nodes.slice(index + 1)) {
      const pb = positions.get(b.id)!;
      expect(
        pa.x + a.width <= pb.x ||
          pb.x + b.width <= pa.x ||
          pa.y + a.height <= pb.y ||
          pb.y + b.height <= pa.y,
      ).toBe(true);
    }
  }
}

describe('layeredLayout', () => {
  it('returns an empty map for empty input', () => {
    expect(layeredLayout([], [edge('missing', 'also-missing')])).toEqual(
      new Map(),
    );
  });

  it('places a chain at longest-path ranks using default gaps', () => {
    const positions = layeredLayout(
      ['a', 'b', 'c'].map((id) => node(id)),
      [edge('a', 'b'), edge('b', 'c'), edge('a', 'c')],
    );
    expect([...positions.values()]).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 140 },
      { x: 0, y: 280 },
    ]);
  });

  it('centers a tree parent above its children', () => {
    const positions = layeredLayout(
      ['a', 'b', 'c'].map((id) => node(id)),
      [edge('a', 'b'), edge('a', 'c')],
    );
    expect(positions.get('a')).toEqual({ x: 70, y: 0 });
    expect(positions.get('b')).toEqual({ x: 0, y: 140 });
    expect(positions.get('c')).toEqual({ x: 140, y: 140 });
  });

  it('centers both ends of a diamond', () => {
    const positions = layeredLayout(
      ['a', 'b', 'c', 'd'].map((id) => node(id)),
      [edge('a', 'b'), edge('a', 'c'), edge('b', 'd'), edge('c', 'd')],
    );
    expect(positions.get('a')!.x).toBe(positions.get('d')!.x);
    expect(positions.get('d')!.y).toBe(280);
  });

  it('reduces crossings between adjacent ranks', () => {
    const positions = layeredLayout(
      ['r', 'a', 'b', 'c', 'd'].map((id) => node(id)),
      [edge('r', 'a'), edge('r', 'b'), edge('a', 'd'), edge('b', 'c')],
    );
    expect(Math.sign(positions.get('a')!.x - positions.get('b')!.x)).toBe(
      Math.sign(positions.get('d')!.x - positions.get('c')!.x),
    );
  });

  it('keeps cyclic nodes and ignores self-loops and missing endpoints', () => {
    const nodes = ['a', 'b', 'c'].map((id) => node(id));
    const edges = [edge('a', 'b'), edge('b', 'c'), edge('c', 'a')];
    const positions = layeredLayout(nodes, edges);
    expectNoOverlap(nodes, positions);
    expect(
      layeredLayout(nodes, [
        ...edges,
        edge('a', 'a'),
        edge('missing', 'a'),
        edge('a', 'missing'),
        edge('a', 'b'),
      ]),
    ).toEqual(positions);
  });

  it('packs disconnected components and isolated nodes beside each other', () => {
    const nodes = ['a', 'b', 'c', 'd', 'isolated'].map((id) => node(id));
    const positions = layeredLayout(nodes, [edge('a', 'b'), edge('c', 'd')]);
    expectNoOverlap(nodes, positions);
    expect(positions.get('c')!.x).toBeGreaterThan(positions.get('a')!.x + 80);
    expect(positions.get('isolated')!.x).toBeGreaterThan(
      positions.get('c')!.x + 80,
    );
  });

  it('places a single isolated node at the requested origin', () => {
    expect(
      layeredLayout([node('a')], [], { origin: { x: -30, y: 25 } }).get('a'),
    ).toEqual({ x: -30, y: 25 });
  });

  it.each([
    'TB',
    'LR',
  ] as const)('avoids overlaps with mixed dimensions in %s', (direction) => {
    const nodes = [
      node('a', 350, 25),
      node('b', 12, 260),
      node('c', 190, 45),
      node('d', 400, 90),
      node('e', 10, 500),
      node('f', 280, 200),
    ];
    expectNoOverlap(
      nodes,
      layeredLayout(
        nodes,
        [
          edge('a', 'b'),
          edge('a', 'c'),
          edge('b', 'd'),
          edge('c', 'd'),
          edge('e', 'f'),
        ],
        { direction, nodeGap: 15, rankGap: 30 },
      ),
    );
  });

  it('swaps axes and dimensions for LR', () => {
    const nodes = [node('a', 90, 20), node('b', 30, 150), node('c', 70, 40)];
    const edges = [edge('a', 'b'), edge('a', 'c')];
    const options = { nodeGap: 25, rankGap: 55, origin: { x: 10, y: -20 } };
    const lr = layeredLayout(nodes, edges, { ...options, direction: 'LR' });
    const tb = layeredLayout(
      nodes.map((n) => node(n.id, n.height, n.width)),
      edges,
      { ...options, origin: { x: -20, y: 10 } },
    );
    for (const n of nodes)
      expect(lr.get(n.id)).toEqual({ x: tb.get(n.id)!.y, y: tb.get(n.id)!.x });
  });

  it('is deterministic and does not mutate frozen inputs', () => {
    const nodes = Object.freeze(
      ['a', 'b', 'c'].map((id) => Object.freeze(node(id))),
    );
    const edges = Object.freeze([
      Object.freeze(edge('a', 'b')),
      Object.freeze(edge('b', 'c')),
      Object.freeze(edge('c', 'a')),
    ]);
    expect(layeredLayout(nodes, edges)).toEqual(layeredLayout(nodes, edges));
  });

  it('handles a long chain without recursive stack overflow', () => {
    const nodes = Array.from({ length: 10000 }, (_, index) =>
      node(String(index)),
    );
    const edges = nodes.slice(1).map((n, index) => edge(String(index), n.id));
    const positions = layeredLayout(nodes, edges);
    expect(positions.size).toBe(nodes.length);
    expect(positions.get('9999')!.y).toBe(9999 * 140);
  });
});
