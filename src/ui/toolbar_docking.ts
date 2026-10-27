export interface DockRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type DockId = `${'top' | 'bottom'}-${'left' | 'center' | 'right'}`;
export interface ToolbarDock {
  id: DockId;
  x: number;
  y: number;
}

const EDGE = 16;
const GAP = 8;

/** Six anchors within the free horizontal space of the top/bottom bands. */
export function toolbarDocks(
  viewport: { width: number; height: number },
  toolbar: { width: number; height: number },
  obstacles: readonly DockRect[],
): ToolbarDock[] {
  const maxX = viewport.width - EDGE - toolbar.width;
  const bottom = viewport.height - EDGE - toolbar.height;
  if (maxX < EDGE || bottom < EDGE) return [];
  const docks: ToolbarDock[] = [];
  for (const row of ['top', 'bottom'] as const) {
    // If a band is full (e.g. menu + live controls on a narrow viewport),
    // try immediately below/above its obstacles, never in the middle.
    const ys = [
      row === 'top' ? EDGE : bottom,
      ...obstacles.map((r) =>
        row === 'top' ? r.y + r.height + GAP : r.y - toolbar.height - GAP,
      ),
    ]
      .filter((y) =>
        row === 'top'
          ? y >= EDGE &&
            y <= Math.min(bottom, viewport.height / 2 - toolbar.height)
          : y <= bottom && y >= Math.max(EDGE, viewport.height / 2),
      )
      .sort((a, b) => (row === 'top' ? a - b : b - a));
    for (const y of ys) {
      let ranges: [number, number][] = [[EDGE, maxX]];
      for (const r of obstacles) {
        if (y + toolbar.height + GAP <= r.y || y >= r.y + r.height + GAP)
          continue;
        const start = r.x - toolbar.width - GAP;
        const end = r.x + r.width + GAP;
        ranges = ranges.flatMap(([lo, hi]): [number, number][] => {
          if (end <= lo || start >= hi) return [[lo, hi]];
          const remaining: [number, number][] = [];
          if (start >= lo) remaining.push([lo, start]);
          if (end <= hi) remaining.push([end, hi]);
          return remaining;
        });
      }
      if (!ranges.length) continue;
      for (const [align, wanted] of [
        ['left', EDGE],
        ['center', (viewport.width - toolbar.width) / 2],
        ['right', maxX],
      ] as const) {
        const xs = ranges.map(([lo, hi]) => Math.max(lo, Math.min(wanted, hi)));
        const x = xs.reduce((a, b) =>
          Math.abs(a - wanted) <= Math.abs(b - wanted) ? a : b,
        );
        docks.push({ id: `${row}-${align}`, x, y });
      }
      break;
    }
  }
  return docks;
}

export function nearestDock(
  docks: readonly ToolbarDock[],
  point: { x: number; y: number },
): ToolbarDock | undefined {
  return docks.reduce<ToolbarDock | undefined>(
    (best, dock) =>
      !best ||
      Math.hypot(dock.x - point.x, dock.y - point.y) <
        Math.hypot(best.x - point.x, best.y - point.y)
        ? dock
        : best,
    undefined,
  );
}
