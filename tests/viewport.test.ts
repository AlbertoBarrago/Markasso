import { describe, expect, it } from 'vitest';
import {
  createViewport,
  fitToElements,
  pan,
  screenToWorld,
  worldToScreen,
  zoom,
} from '../src/core/viewport';
import type {
  CurveElement,
  FreehandElement,
  LineElement,
  PolygonElement,
  RectangleElement,
} from '../src/elements/element';

function baseEl() {
  return {
    strokeColor: '#000',
    fillColor: 'transparent',
    strokeWidth: 1,
    opacity: 1,
    roughness: 0,
  };
}

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

  it('screenToWorld with offset and zoom', () => {
    const vp = { offsetX: 50, offsetY: 25, zoom: 2 };
    const [wx, wy] = screenToWorld(vp, 150, 75);
    expect(wx).toBe(50);
    expect(wy).toBe(25);
  });

  it('worldToScreen with offset and zoom', () => {
    const vp = { offsetX: 50, offsetY: 25, zoom: 2 };
    const [sx, sy] = worldToScreen(vp, 50, 25);
    expect(sx).toBe(150);
    expect(sy).toBe(75);
  });

  it('pan accumulates on existing offset', () => {
    const vp = { offsetX: 10, offsetY: -5, zoom: 1 };
    const result = pan(vp, 20, 10);
    expect(result.offsetX).toBe(30);
    expect(result.offsetY).toBe(5);
  });
});

describe('fitToElements', () => {
  it('returns default viewport for empty array', () => {
    const vp = fitToElements([], 1000, 800);
    expect(vp).toEqual(createViewport());
  });

  it('centers a single rectangle on the canvas', () => {
    const rect: RectangleElement = {
      id: 'r1',
      type: 'rectangle',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      ...baseEl(),
    };
    const vp = fitToElements([rect], 1000, 800);
    expect(vp.zoom).toBeGreaterThan(0);
    // The rect center in screen space should be near canvas center
    const screenCX = rect.x * vp.zoom + vp.offsetX + (rect.width * vp.zoom) / 2;
    const screenCY =
      rect.y * vp.zoom + vp.offsetY + (rect.height * vp.zoom) / 2;
    expect(screenCX).toBeCloseTo(500, 0);
    expect(screenCY).toBeCloseTo(400, 0);
  });

  it('handles line/arrow elements', () => {
    const line: LineElement = {
      id: 'l1',
      type: 'line',
      x: 0,
      y: 0,
      x2: 200,
      y2: 100,
      ...baseEl(),
    };
    const vp = fitToElements([line], 1000, 800);
    expect(vp.zoom).toBeGreaterThan(0);
    expect(vp.offsetX).toBeDefined();
  });

  it('handles freehand elements', () => {
    const fh: FreehandElement = {
      id: 'fh1',
      type: 'freehand',
      x: 0,
      y: 0,
      points: [
        [0, 0],
        [50, 80],
        [100, 0],
      ],
      ...baseEl(),
    };
    const vp = fitToElements([fh], 1000, 800);
    expect(vp.zoom).toBeGreaterThan(0);
  });

  it('handles polygon elements', () => {
    const poly: PolygonElement = {
      id: 'p1',
      type: 'polygon',
      x: 0,
      y: 0,
      closed: true,
      points: [
        [0, 0],
        [100, 0],
        [50, 80],
      ],
      ...baseEl(),
    };
    const vp = fitToElements([poly], 1000, 800);
    expect(vp.zoom).toBeGreaterThan(0);
  });

  it('handles curve elements', () => {
    const curve: CurveElement = {
      id: 'c1',
      type: 'curve',
      x: 0,
      y: 0,
      x2: 200,
      y2: 0,
      cx: 100,
      cy: -100,
      ...baseEl(),
    };
    const vp = fitToElements([curve], 1000, 800);
    expect(vp.zoom).toBeGreaterThan(0);
  });

  it('respects maxZoom inset', () => {
    const rect: RectangleElement = {
      id: 'r1',
      type: 'rectangle',
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      ...baseEl(),
    };
    const vp = fitToElements([rect], 1000, 800, { maxZoom: 2 });
    expect(vp.zoom).toBeLessThanOrEqual(2);
  });
});
