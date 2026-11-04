/** Layered layout parity. Maps are encoded as ordered [id, {x,y}] entries. */
import {
  type LayoutEdge,
  type LayoutNode,
  type LayoutOptions,
  layeredLayout,
} from '../../src/core/layout';
import { Family, prng } from './common';

export function buildLayout(): Family[] {
  const fam = new Family('layout', {
    inputs:
      'layeredLayout(nodes, edges, options); output [...positions] in Map insertion order, with original string keys. No sorting or rounding.',
    seed: 0xa110,
  });
  const node = (id: string, width = 80, height = 40): LayoutNode => ({
    id,
    width,
    height,
  });
  const edge = (from: string, to: string): LayoutEdge => ({ from, to });
  const add = (
    name: string,
    nodes: readonly LayoutNode[],
    edges: readonly LayoutEdge[],
    options: LayoutOptions = {},
  ) =>
    fam.add(name, 'layeredLayout', { nodes, edges, options }, [
      ...layeredLayout(nodes, edges, options),
    ]);
  const ids = (s: string) => s.split(' ').map((id) => node(id));
  const links = (s: string) =>
    s
      ? s.split(' ').map((pair) => {
          const [a, b] = pair.split('>');
          return edge(a!, b!);
        })
      : [];
  add('test empty', [], [edge('missing', 'also-missing')]);
  for (const [name, ns, es] of [
    ['chain long edge', 'a b c', 'a>b b>c a>c'],
    ['tree', 'a b c', 'a>b a>c'],
    ['diamond', 'a b c d', 'a>b a>c b>d c>d'],
    ['crossings', 'r a b c d', 'r>a r>b a>d b>c'],
    ['cycle', 'a b c', 'a>b b>c c>a'],
    ['cycle ignored edges', 'a b c', 'a>b b>c c>a a>a missing>a a>missing a>b'],
    ['disconnected', 'a b c d isolated', 'a>b c>d'],
    ['two cycle', 'a b', 'a>b b>a'],
    ['isolated', 'a b c', ''],
  ])
    add(`test ${name}`, ids(ns!), links(es!));
  add('test origin', [node('a')], [], { origin: { x: -30, y: 25 } });
  for (const direction of ['TB', 'LR'] as const) {
    add(
      `test mixed ${direction}`,
      [
        node('a', 350, 25),
        node('b', 12, 260),
        node('c', 190, 45),
        node('d', 400, 90),
        node('e', 10, 500),
        node('f', 280, 200),
      ],
      links('a>b a>c b>d c>d e>f'),
      { direction, nodeGap: 15, rankGap: 30 },
    );
    add(
      `test axes ${direction}`,
      [node('a', 90, 20), node('b', 30, 150), node('c', 70, 40)],
      links('a>b a>c'),
      { direction, nodeGap: 25, rankGap: 55, origin: { x: 10, y: -20 } },
    );
  }
  add(
    'test transposed axes',
    [node('a', 20, 90), node('b', 150, 30), node('c', 40, 70)],
    links('a>b a>c'),
    { nodeGap: 25, rankGap: 55, origin: { x: -20, y: 10 } },
  );
  const long = Array.from({ length: 10000 }, (_, i) => node(String(i)));
  for (const direction of ['TB', 'LR'] as const)
    add(`negative gaps probe ${direction}`, ids('a b c'), links('a>b a>c'), {
      direction,
      nodeGap: -12.5,
      rankGap: -20.25,
      origin: { x: -10.5, y: -0.125 },
    });
  // Keep the existing stack-safety test separate so each JSON stays compact.
  const stress = new Family('layout', fam.header, 'stress');
  const longEdges = long.slice(1).map((n, i) => edge(String(i), n.id));
  stress.add(
    'test 10000 chain',
    'layeredLayout',
    { nodes: long, edges: longEdges, options: {} },
    [...layeredLayout(long, longEdges, {})],
  );
  const random = prng(0xa110);
  for (let i = 0; i < 260; i++) {
    const count = i < 6 ? 200 : 1 + Math.floor(random() * 24);
    const nodes = Array.from({ length: count }, (_, j) =>
      node(
        `n${j}`,
        j % 7 === 0 ? 0 : Math.floor(random() * 800) / 4,
        j % 9 === 0 ? 0 : Math.floor(random() * 600) / 4,
      ),
    );
    const edges: LayoutEdge[] = [];
    const mode = i % 7;
    for (let j = 1; j < count; j++) {
      if (mode === 0 || mode === 2 || mode === 3)
        edges.push(edge(`n${j - 1}`, `n${j}`));
      if (mode === 1) edges.push(edge(`n${Math.floor((j - 1) / 2)}`, `n${j}`));
      if (mode === 2 && j > 2)
        edges.push(edge(`n${Math.floor(random() * (j - 1))}`, `n${j}`));
      if (mode === 4 && j % 4 !== 0) edges.push(edge(`n${j - 1}`, `n${j}`));
      if (mode === 5)
        edges.push(edge(`n${Math.floor(random() * count)}`, `n${j}`));
    }
    if (mode === 3) edges.push(edge(`n${count - 1}`, 'n0'));
    edges.push(edge('n0', 'n0'), edge('unknown', 'n0'), edge('n0', 'unknown'));
    if (edges[0]) edges.push({ ...edges[0] });
    add(`seeded ${i} mode ${mode}`, nodes, edges, {
      direction: i % 2 ? 'LR' : 'TB',
      nodeGap: i % 5 === 0 ? 0 : 12.25,
      rankGap: i % 3 === 0 ? 0 : 39.5,
      origin: { x: -100.125 + i / 4, y: 20.75 - i / 2 },
    });
  }
  return [fam, stress];
}
