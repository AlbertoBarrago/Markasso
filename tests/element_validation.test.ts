import { describe, expect, it } from 'vitest';
import {
  validateElements,
  validateViewport,
} from '../src/io/element_validation';

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

  it('rejects duplicate IDs and unsafe colors', () => {
    const element = {
      id: 'duplicate',
      type: 'rectangle',
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      strokeColor: `red' onmouseover='alert(1)`,
      fillColor: 'transparent',
      strokeWidth: 1,
      opacity: 1,
      roughness: 0,
    };
    expect(validateElements([element])).toBeNull();
    expect(
      validateElements([
        { ...element, strokeColor: '#000' },
        { ...element, strokeColor: '#fff' },
      ]),
    ).toBeNull();
  });

  it('rejects malformed optional fields and empty point lists', () => {
    const base = {
      id: 'shape',
      x: 0,
      y: 0,
      strokeColor: '#000',
      fillColor: 'transparent',
      strokeWidth: 1,
      opacity: 1,
      roughness: 0,
    };
    expect(
      validateElements([
        { ...base, type: 'rectangle', width: 10, height: 10, locked: 'yes' },
      ]),
    ).toBeNull();
    expect(
      validateElements([{ ...base, type: 'freehand', points: [] }]),
    ).toBeNull();
  });

  it('accepts only bounded, positive viewports', () => {
    expect(validateViewport({ offsetX: 1, offsetY: 2, zoom: 1 })).toEqual({
      offsetX: 1,
      offsetY: 2,
      zoom: 1,
    });
    expect(validateViewport({ offsetX: 0, offsetY: 0, zoom: 0 })).toBeNull();
    expect(
      validateViewport({
        offsetX: Number.POSITIVE_INFINITY,
        offsetY: 0,
        zoom: 1,
      }),
    ).toBeNull();
  });
});
