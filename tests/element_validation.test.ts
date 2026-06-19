import { describe, expect, it } from 'vitest';
import { validateElements } from '../src/io/element_validation';

describe('element validation', () => {
  it('rejects freehand elements without points', () => {
    expect(
      validateElements([
        {
          id: 'bad-freehand',
          type: 'freehand',
          x: 0,
          y: 0,
          strokeColor: '#000',
          fillColor: 'transparent',
          strokeWidth: 1,
          opacity: 1,
          roughness: 0,
        },
      ]),
    ).toBeNull();
  });

  it('rejects box elements without finite dimensions', () => {
    expect(
      validateElements([
        {
          id: 'bad-rect',
          type: 'rectangle',
          x: 0,
          y: 0,
          width: Number.NaN,
          height: 20,
          strokeColor: '#000',
          fillColor: 'transparent',
          strokeWidth: 1,
          opacity: 1,
          roughness: 0,
        },
      ]),
    ).toBeNull();
  });
});
