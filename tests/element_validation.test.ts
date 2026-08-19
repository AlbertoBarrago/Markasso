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

  it('rejects unsafe colors', () => {
    const element = {
      id: 'unsafe',
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
  });

  it('drops the later element when two IDs collide, keeping the first', () => {
    const element = {
      id: 'duplicate',
      type: 'rectangle',
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      strokeColor: '#000',
      fillColor: 'transparent',
      strokeWidth: 1,
      opacity: 1,
      roughness: 0,
    };
    const result = validateElements([
      { ...element, strokeColor: '#000' },
      { ...element, strokeColor: '#fff' },
    ]);
    expect(result).toHaveLength(1);
    expect(result?.[0]?.strokeColor).toBe('#000');
  });

  it('keeps the valid elements when only some are malformed, instead of wiping the whole scene', () => {
    const good1 = {
      id: 'good-1',
      type: 'rectangle',
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      strokeColor: '#000',
      fillColor: 'transparent',
      strokeWidth: 1,
      opacity: 1,
      roughness: 0,
    };
    const good2 = { ...good1, id: 'good-2', x: 50 };
    const badText = {
      id: 'bad-text',
      type: 'text',
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      strokeColor: '#000',
      fillColor: 'transparent',
      strokeWidth: 1,
      opacity: 1,
      roughness: 0,
      content: 'hello',
      fontSize: Number.NaN, // malformed — must not take the whole array down
      fontFamily: 'Arial',
    };

    const result = validateElements([good1, badText, good2]);
    expect(result).toHaveLength(2);
    expect(result?.map((el) => el.id)).toEqual(['good-1', 'good-2']);
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
