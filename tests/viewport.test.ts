import { describe, it, expect } from 'vitest';
import {
  createViewport,
  screenToWorld,
  worldToScreen,
  pan,
  zoom,
} from '../src/core/viewport';

describe('viewport math', () => {
  it('round-trips screenToWorld / worldToScreen', () => {
    const vp = { offsetX: 100, offsetY: 50, zoom: 2 };
    const [wx, wy] = screenToWorld(vp, 300, 200);
    const [sx, sy] = worldToScreen(vp, wx, wy);
    expect(sx).toBeCloseTo(300);
    expect(sy).toBeCloseTo(200);
  });

  it('pan shifts offset', () => {
    const vp = createViewport();
    const panned = pan(vp, 30, -10);
    expect(panned.offsetX).toBe(30);
    expect(panned.offsetY).toBe(-10);
  });

  it('zoom keeps origin fixed in screen space', () => {
    const vp = createViewport(); // zoom=1, offset=(0,0)
    const originX = 200;
    const originY = 150;
    const zoomed = zoom(vp, 2, originX, originY);

    // The world point under cursor before zoom should map to same screen point after zoom
    const [wx, wy] = screenToWorld(vp, originX, originY);
    const [sx, sy] = worldToScreen(zoomed, wx, wy);
    expect(sx).toBeCloseTo(originX);
    expect(sy).toBeCloseTo(originY);
  });

  it('zoom clamps to min/max', () => {
    const vp = createViewport();
    const tooSmall = zoom(vp, 0.0001, 0, 0);
    expect(tooSmall.zoom).toBe(0.05);

    const tooBig = zoom(vp, 99999, 0, 0);
    expect(tooBig.zoom).toBe(30);
  });
});
