import { describe, expect, it } from 'vitest';
import {
  type DockRect,
  nearestDock,
  toolbarDocks,
} from '../src/ui/toolbar_docking';

const viewport = { width: 1280, height: 800 };
const toolbar = { width: 560, height: 46 };
function expectClear(obstacles: DockRect[], width = 1280) {
  const docks = toolbarDocks({ width, height: 800 }, toolbar, obstacles);
  expect(docks.length).toBe(6);
  for (const dock of docks) {
    expect(dock.x).toBeGreaterThanOrEqual(16);
    expect(dock.x + toolbar.width).toBeLessThanOrEqual(width - 16);
    expect(dock.y).toBeGreaterThanOrEqual(16);
    expect(dock.y + toolbar.height).toBeLessThanOrEqual(784);
    for (const r of obstacles) {
      expect(
        dock.x + toolbar.width + 8 <= r.x ||
          dock.x >= r.x + r.width + 8 ||
          dock.y + toolbar.height + 8 <= r.y ||
          dock.y >= r.y + r.height + 8,
      ).toBe(true);
    }
  }
  return docks;
}

describe('toolbar docking', () => {
  it('offers the six edge positions and chooses the nearest one', () => {
    const docks = toolbarDocks(viewport, toolbar, []);
    expect(docks).toEqual([
      { id: 'top-left', x: 16, y: 16 },
      { id: 'top-center', x: 360, y: 16 },
      { id: 'top-right', x: 704, y: 16 },
      { id: 'bottom-left', x: 16, y: 738 },
      { id: 'bottom-center', x: 360, y: 738 },
      { id: 'bottom-right', x: 704, y: 738 },
    ]);
    expect(nearestDock(docks, { x: 380, y: 200 })?.id).toBe('top-center');
    expect(nearestDock(docks, { x: 700, y: 600 })?.id).toBe('bottom-right');
  });
  it('clears the menu and live controls at the top', () => {
    expectClear([
      { x: 16, y: 12, width: 46, height: 46 },
      { x: 1050, y: 12, width: 214, height: 46 },
    ]);
  });
  it('avoids the minimap and optional zoom/history panels together', () => {
    expectClear([
      { x: 1094, y: 626, width: 170, height: 102 },
      { x: 16, y: 738, width: 164, height: 46 },
      { x: 1180, y: 738, width: 84, height: 46 },
    ]);
  });
  it('moves the bottom band above the minimap when a narrow window has no horizontal room', () => {
    const docks = expectClear(
      [{ x: 564, y: 682, width: 170, height: 102 }],
      750,
    );
    expect(docks.find((d) => d.id === 'bottom-center')?.y).toBe(628);
  });
  it('clears an open library and context panel', () => {
    expectClear([
      { x: 824, y: 16, width: 440, height: 690 },
      { x: 16, y: 72, width: 230, height: 620 },
    ]);
  });
  it('returns to the edge when a panel is hidden', () => {
    const obstacle = { x: 16, y: 738, width: 164, height: 46 };
    const before = toolbarDocks(viewport, toolbar, [obstacle]).find(
      (d) => d.id === 'bottom-left',
    )!;
    const after = toolbarDocks(viewport, toolbar, []).find(
      (d) => d.id === 'bottom-left',
    )!;
    expect(before.x).toBe(188);
    expect(after.x).toBe(16);
  });
  it('reserves a toolbar and hint envelope beside full-height side panels', () => {
    const envelope = { width: 500, height: 84 };
    const panels = [
      { x: 344, y: 16, width: 440, height: 676 },
      { x: 16, y: 72, width: 230, height: 620 },
    ];
    const docks = toolbarDocks({ width: 800, height: 800 }, envelope, panels);
    expect(docks.some((d) => d.id === 'bottom-center')).toBe(true);
    for (const dock of docks) {
      for (const panel of panels) {
        expect(
          dock.x + envelope.width + 8 <= panel.x ||
            dock.x >= panel.x + panel.width + 8 ||
            dock.y + envelope.height + 8 <= panel.y ||
            dock.y >= panel.y + panel.height + 8,
        ).toBe(true);
      }
      expect(dock.y + envelope.height).toBeLessThanOrEqual(784);
    }
  });
  it('does not invent an overlapping dock when no space is available', () => {
    expect(
      toolbarDocks(viewport, toolbar, [
        { x: 0, y: 0, width: 1280, height: 800 },
      ]),
    ).toEqual([]);
    expect(toolbarDocks({ width: 400, height: 200 }, toolbar, [])).toEqual([]);
    expect(nearestDock([], { x: 0, y: 0 })).toBeUndefined();
  });
});
