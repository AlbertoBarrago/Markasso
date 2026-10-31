/**
 * `viewport` family: every export of src/core/viewport.ts. Zoom grids cross
 * the 0.05 and 30 clamps; fitToElements runs on every element type, with
 * default and custom insets.
 */
import {
  createViewport,
  type FitInsets,
  fitToElements,
  pan,
  screenToWorld,
  type Viewport,
  worldToScreen,
  zoom,
} from '../../src/core/viewport';
import type { Element } from '../../src/elements/element';
import { Family, nextDown, nextUp } from './common';
import { SAMPLE_NAMES, sample } from './samples';

const VIEWPORTS: ReadonlyArray<[string, Viewport]> = [
  ['default', { offsetX: 0, offsetY: 0, zoom: 1 }],
  ['offset zoom 2', { offsetX: 50, offsetY: 25, zoom: 2 }],
  ['negative offset zoom 0.5', { offsetX: -320.5, offsetY: -1200, zoom: 0.5 }],
  ['min zoom', { offsetX: 10, offsetY: 10, zoom: 0.05 }],
  ['max zoom', { offsetX: -9000, offsetY: 4000, zoom: 30 }],
  ['inexact zoom', { offsetX: 0.1, offsetY: 0.2, zoom: 1.1 }],
  ['below min zoom', { offsetX: 0, offsetY: 0, zoom: 0.01 }],
  ['above max zoom', { offsetX: 0, offsetY: 0, zoom: 100 }],
];

const ZOOMS = [
  0.01,
  0.05,
  nextDown(0.05),
  nextUp(0.05),
  0.1,
  0.25,
  0.5,
  1,
  1.1,
  2,
  4,
  10,
  29.999,
  30,
  nextDown(30),
  nextUp(30),
  31,
  1000,
];

const FACTORS = [0.0001, 0.5, 1 / 1.1, 1, 1.1, 2, 99999];

const POINTS: ReadonlyArray<[number, number]> = [
  [0, 0],
  [150, 75],
  [-37.5, 1e4],
  [0.1, 0.3],
];

export function buildViewport(): Family {
  const fam = new Family('viewport');

  fam.add('createViewport', 'createViewport', {}, createViewport());

  // Cases lifted from tests/viewport.test.ts.
  fam.add(
    'test: zoom 2 at 200,150',
    'zoom',
    { viewport: createViewport(), factor: 2, originX: 200, originY: 150 },
    zoom(createViewport(), 2, 200, 150),
  );
  fam.add(
    'test: zoom clamps to min',
    'zoom',
    { viewport: createViewport(), factor: 0.0001, originX: 0, originY: 0 },
    zoom(createViewport(), 0.0001, 0, 0),
  );
  fam.add(
    'test: zoom clamps to max',
    'zoom',
    { viewport: createViewport(), factor: 99999, originX: 0, originY: 0 },
    zoom(createViewport(), 99999, 0, 0),
  );
  fam.add(
    'test: pan default',
    'pan',
    { viewport: createViewport(), dx: 30, dy: -10 },
    pan(createViewport(), 30, -10),
  );
  fam.add(
    'test: pan accumulates',
    'pan',
    { viewport: { offsetX: 10, offsetY: -5, zoom: 1 }, dx: 20, dy: 10 },
    pan({ offsetX: 10, offsetY: -5, zoom: 1 }, 20, 10),
  );

  for (const [vl, viewport] of VIEWPORTS) {
    for (const [x, y] of POINTS) {
      fam.add(
        `screenToWorld ${vl} at ${x},${y}`,
        'screenToWorld',
        { viewport, screenX: x, screenY: y },
        screenToWorld(viewport, x, y),
      );
      fam.add(
        `worldToScreen ${vl} at ${x},${y}`,
        'worldToScreen',
        { viewport, worldX: x, worldY: y },
        worldToScreen(viewport, x, y),
      );
    }
    for (const [dx, dy] of [
      [0, 0],
      [30, -10],
      [-0.1, 0.2],
      [1e7, -1e7],
    ] as const) {
      fam.add(
        `pan ${vl} by ${dx},${dy}`,
        'pan',
        { viewport, dx, dy },
        pan(viewport, dx, dy),
      );
    }
    for (const factor of FACTORS) {
      for (const [ox, oy] of [
        [0, 0],
        [400, 300],
        [-50.5, 1000],
      ] as const) {
        fam.add(
          `zoom ${vl} x${factor} at ${ox},${oy}`,
          'zoom',
          { viewport, factor, originX: ox, originY: oy },
          zoom(viewport, factor, ox, oy),
        );
      }
    }
  }
  // A grid of starting zoom levels, through the clamps.
  for (const z of ZOOMS) {
    const viewport = { offsetX: 12, offsetY: -8, zoom: z };
    for (const factor of [0.5, 1, 1.1, 2]) {
      fam.add(
        `zoom grid ${z} x${factor}`,
        'zoom',
        { viewport, factor, originX: 640, originY: 400 },
        zoom(viewport, factor, 640, 400),
      );
    }
    fam.add(
      `screenToWorld grid ${z}`,
      'screenToWorld',
      { viewport, screenX: 640, screenY: 400 },
      screenToWorld(viewport, 640, 400),
    );
  }
  // Repeated wheel zoom accumulates rounding: 40 steps in, then 40 out.
  {
    let viewport: Viewport = createViewport();
    const steps: Viewport[] = [];
    for (let i = 0; i < 80; i++) {
      viewport = zoom(viewport, i < 40 ? 1.1 : 1 / 1.1, 333, 222);
      steps.push(viewport);
    }
    fam.add(
      'zoom 40 wheel steps in then out',
      'zoomSequence',
      {
        viewport: createViewport(),
        factors: [...Array(40).fill(1.1), ...Array(40).fill(1 / 1.1)],
        originX: 333,
        originY: 222,
      },
      steps,
    );
  }

  // fitToElements.
  const fit = (
    name: string,
    elements: Element[],
    canvasWidth: number,
    canvasHeight: number,
    insets?: FitInsets,
  ) =>
    fam.add(
      name,
      'fitToElements',
      { elements, canvasWidth, canvasHeight, ...(insets && { insets }) },
      fitToElements(elements, canvasWidth, canvasHeight, insets),
    );
  fit('test: empty', [], 1000, 800);
  for (const name of SAMPLE_NAMES) {
    const el = sample(name);
    fit(`fit ${name}`, [el], 1280, 800);
    fit(`fit ${name} custom insets`, [el], 1280, 800, {
      top: 10,
      bottom: 0,
      left: 300,
      right: 5,
    });
  }
  const all = SAMPLE_NAMES.map((n) => sample(n));
  fit('fit every type', all, 1280, 800);
  fit('fit every type small canvas', all, 320, 240);
  fit('fit every type maxZoom 0.5', all, 1280, 800, { maxZoom: 0.5 });
  fit('fit every type zero insets', all, 1280, 800, {
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  });
  const tiny: Element = sample('rect', { width: 0.5, height: 0.5 });
  fit('fit tiny rect clamps to 30', [tiny], 1280, 800);
  fit('fit tiny rect maxZoom 2', [tiny], 1280, 800, { maxZoom: 2 });
  fit('fit tiny rect maxZoom 100', [tiny], 1280, 800, { maxZoom: 100 });
  fit(
    'fit zero-size rect',
    [sample('rect', { width: 0, height: 0 })],
    1280,
    800,
  );
  fit(
    'fit huge rect clamps to 0.05',
    [sample('rect', { x: -5e6, width: 1e7, height: 10 })],
    1280,
    800,
  );
  fit(
    'fit negative size rect',
    [sample('rect', { x: 100, y: 100, width: -200, height: -50 })],
    1280,
    800,
  );
  fit(
    'fit horizontal line',
    [sample('line', { x: 0, y: 5, x2: 300, y2: 5 })],
    1280,
    800,
  );
  fit(
    'fit vertical arrow',
    [sample('arrow', { x: 5, y: -300, x2: 5, y2: 300 })],
    1280,
    800,
  );
  fit(
    'fit line ignores cx',
    [sample('line', { cx: 5000, cy: 5000 })],
    1280,
    800,
  );
  fit('fit canvas smaller than insets', all, 30, 100);
  fit('fit zero canvas', all, 0, 0);
  fit(
    'fit single point freehand',
    [sample('freehand', { points: [[7, 9]] })],
    1280,
    800,
  );
  fit(
    'fit rotated rect ignores rotation',
    [sample('rect', { rotation: Math.PI / 4 })],
    1280,
    800,
  );
  fit(
    'fit two far apart',
    [sample('rect', { x: -1e5 }), sample('ellipse', { x: 1e5, y: 1e5 })],
    1920,
    1080,
  );
  return fam;
}
