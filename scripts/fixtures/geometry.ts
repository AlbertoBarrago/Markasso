/**
 * `geometry` family: src/core/geometry.ts (`normalizeRect` is its only
 * export) on sign, zero, fractional, extreme and fixed-seed random rects.
 */
import { normalizeRect } from '../../src/core/geometry';
import { Family, prng } from './common';

export function buildGeometry(): Family {
  const fam = new Family('geometry');
  const add = (
    name: string,
    rect: { x: number; y: number; width: number; height: number },
  ) => fam.add(name, 'normalizeRect', { rect }, normalizeRect(rect));

  // Cases lifted from tests/geometry.test.ts.
  for (const [width, height] of [
    [30, 40],
    [-30, 40],
    [30, -40],
    [-30, -40],
    [0, 0],
  ] as const) {
    add(`test: ${width} x ${height}`, { x: 10, y: 20, width, height });
  }

  const values: ReadonlyArray<[string, number]> = [
    ['0', 0],
    ['1', 1],
    ['-1', -1],
    ['0.1', 0.1],
    ['-0.1', -0.1],
    ['1e-300', 1e-300],
    ['-1e-300', -1e-300],
    ['1e7', 1e7],
    ['-1e7', -1e7],
    ['max', Number.MAX_VALUE],
    ['-max', -Number.MAX_VALUE],
  ];
  for (const [wl, width] of values) {
    for (const [hl, height] of values) {
      add(`grid w ${wl} h ${hl}`, { x: -12.5, y: 33.25, width, height });
    }
  }
  for (const [label, x, y, width, height] of [
    [
      'origin at -max',
      -Number.MAX_VALUE,
      -Number.MAX_VALUE,
      -Number.MAX_VALUE,
      -Number.MAX_VALUE,
    ],
    ['inexact sum', 0.1, 0.2, -0.3, -0.7],
    ['NaN width', 0, 0, Number.NaN, 5],
    ['NaN height', 0, 0, 5, Number.NaN],
    ['Infinity width', 0, 0, Number.POSITIVE_INFINITY, 5],
    ['-Infinity width', 3, 0, Number.NEGATIVE_INFINITY, 5],
    ['NaN origin', Number.NaN, Number.NaN, -4, -4],
  ] as const) {
    add(`edge ${label}`, { x, y, width, height });
  }

  const rand = prng(0x6e6f726d);
  for (let i = 0; i < 200; i++) {
    const coord = () => (rand() - 0.5) * 2000;
    add(`random ${i}`, {
      x: coord(),
      y: coord(),
      width: coord(),
      height: coord(),
    });
  }
  return fam;
}
