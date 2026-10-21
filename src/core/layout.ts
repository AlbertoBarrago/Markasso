export type LayoutDirection = 'TB' | 'LR';
export interface LayoutNode {
  readonly id: string;
  readonly width: number;
  readonly height: number;
}
export interface LayoutEdge {
  readonly from: string;
  readonly to: string;
}
export interface LayoutOptions {
  readonly direction?: LayoutDirection;
  readonly nodeGap?: number;
  readonly rankGap?: number;
  readonly origin?: { readonly x: number; readonly y: number };
}

type Vertex = {
  node: LayoutNode;
  outgoing: Vertex[];
  incoming: Vertex[];
  neighbors: Set<Vertex>;
  rank: number;
};

/** Orders vertices without recursion, preserving input order when unconstrained. */
function topologicalOrder(vertices: Vertex[]): Vertex[] {
  const visited = new Set<Vertex>();
  const finished: Vertex[] = [];
  for (const vertex of vertices) {
    if (visited.has(vertex)) continue;
    visited.add(vertex);
    const stack = [{ vertex, next: 0 }];
    while (stack.length) {
      const frame = stack[stack.length - 1]!;
      const next = frame.vertex.outgoing[frame.next++];
      if (next) {
        if (!visited.has(next)) {
          visited.add(next);
          stack.push({ vertex: next, next: 0 });
        }
      } else {
        finished.push(frame.vertex);
        stack.pop();
      }
    }
  }
  return finished.reverse();
}

/** Reorders ranks using neighbor barycenters, with stable ties. */
function reduceCrossings(ranks: Vertex[][]): void {
  const positions = new Map<Vertex, number>();
  const reorder = (rank: Vertex[], downward: boolean) => {
    const scores = new Map<Vertex, number>();
    for (const [index, vertex] of rank.entries()) {
      const neighbors = downward ? vertex.incoming : vertex.outgoing;
      const values = neighbors.map((neighbor) => positions.get(neighbor)!);
      scores.set(
        vertex,
        values.length
          ? values.reduce((a, b) => a + b, 0) / values.length
          : index,
      );
    }
    rank.sort((a, b) => scores.get(a)! - scores.get(b)!);
    rank.forEach((vertex, index) => {
      positions.set(vertex, index);
    });
  };
  for (const rank of ranks) {
    rank.forEach((vertex, index) => {
      positions.set(vertex, index);
    });
  }
  for (let pass = 0; pass < 4; pass++) {
    for (let index = 1; index < ranks.length; index++)
      reorder(ranks[index]!, true);
    for (let index = ranks.length - 2; index >= 0; index--)
      reorder(ranks[index]!, false);
  }
}

/**
 * Produces top-left positions in CSS pixels without mutating the input.
 * Cyclic edges are oriented along DFS reverse postorder before longest-path ranking.
 * Disconnected components occupy separate columns (rows for LR).
 * Nodes must have unique IDs and finite, nonnegative dimensions and gaps.
 */
export function layeredLayout(
  nodes: ReadonlyArray<LayoutNode>,
  edges: ReadonlyArray<LayoutEdge>,
  options: LayoutOptions = {},
): Map<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>();
  const vertices = nodes.map(
    (node): Vertex => ({
      node,
      outgoing: [],
      incoming: [],
      neighbors: new Set(),
      rank: 0,
    }),
  );
  const byId = new Map(vertices.map((vertex) => [vertex.node.id, vertex]));
  for (const edge of edges) {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to || from === to || from.outgoing.includes(to)) continue;
    from.outgoing.push(to);
    from.neighbors.add(to);
    to.neighbors.add(from);
  }
  const order = topologicalOrder(vertices);
  const indices = new Map(order.map((vertex, index) => [vertex, index]));
  const oriented = vertices.flatMap((from) =>
    from.outgoing.map((to) =>
      indices.get(from)! < indices.get(to)!
        ? ([from, to] as const)
        : ([to, from] as const),
    ),
  );
  for (const vertex of vertices) vertex.outgoing = [];
  for (const [from, to] of oriented) {
    from.outgoing.push(to);
    to.incoming.push(from);
  }
  for (const vertex of order) {
    for (const next of vertex.outgoing)
      next.rank = Math.max(next.rank, vertex.rank + 1);
  }

  const horizontal = options.direction === 'LR';
  const breadth = (vertex: Vertex) =>
    horizontal ? vertex.node.height : vertex.node.width;
  const depth = (vertex: Vertex) =>
    horizontal ? vertex.node.width : vertex.node.height;
  const nodeGap = options.nodeGap ?? 60;
  const rankGap = options.rankGap ?? 100;
  const origin = options.origin ?? { x: 0, y: 0 };
  const assigned = new Set<Vertex>();
  let componentOffset = 0;
  for (const root of vertices) {
    if (assigned.has(root)) continue;
    const component: Vertex[] = [root];
    assigned.add(root);
    for (const vertex of component) {
      for (const neighbor of vertex.neighbors) {
        if (assigned.has(neighbor)) continue;
        assigned.add(neighbor);
        component.push(neighbor);
      }
    }
    const ranks: Vertex[][] = [];
    // Original node order is the deterministic starting order within each rank.
    const members = new Set(component);
    for (const vertex of vertices) {
      if (!members.has(vertex)) continue;
      ranks[vertex.rank] ??= [];
      ranks[vertex.rank]!.push(vertex);
    }
    reduceCrossings(ranks);
    const widths = ranks.map(
      (rank) =>
        rank.reduce((sum, vertex) => sum + breadth(vertex), 0) +
        nodeGap * (rank.length - 1),
    );
    const componentWidth = Math.max(...widths);
    let rankOffset = 0;
    for (const [index, rank] of ranks.entries()) {
      const rankDepth = Math.max(...rank.map(depth));
      let offset = componentOffset + (componentWidth - widths[index]!) / 2;
      for (const vertex of rank) {
        const along = rankOffset + (rankDepth - depth(vertex)) / 2;
        result.set(vertex.node.id, {
          x: origin.x + (horizontal ? along : offset),
          y: origin.y + (horizontal ? offset : along),
        });
        offset += breadth(vertex) + nodeGap;
      }
      rankOffset += rankDepth + rankGap;
    }
    componentOffset += componentWidth + nodeGap;
  }
  return result;
}
