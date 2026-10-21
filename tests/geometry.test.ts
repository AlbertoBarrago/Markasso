import { expect, it } from 'vitest';
import { normalizeRect } from '../src/core/geometry';

it.each([
  [30, 40],
  [-30, 40],
  [30, -40],
  [-30, -40],
  [0, 0],
])('normalizes a rectangle with dimensions %s × %s without mutating it', (width, height) => {
  const rect = Object.freeze({ x: 10, y: 20, width, height });
  expect(normalizeRect(rect)).toEqual({
    x: Math.min(10, 10 + width),
    y: Math.min(20, 20 + height),
    w: Math.abs(width),
    h: Math.abs(height),
  });
});
