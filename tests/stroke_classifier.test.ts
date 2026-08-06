import { describe, expect, it } from 'vitest';
import { classifyStroke } from '../src/gesture/stroke_classifier';

describe('classifyStroke', () => {
  it('recognizes a straight connector stroke', () => {
    const points = Array.from({ length: 12 }, (_, index) => ({
      x: 0.1 + index * 0.04,
      y: 0.2 + index * 0.002,
    }));
    expect(classifyStroke(points)?.type).toBe('line');
  });

  it('recognizes a circular stroke', () => {
    const points = Array.from({ length: 33 }, (_, index) => {
      const angle = (index / 32) * Math.PI * 2;
      return {
        x: 0.5 + Math.cos(angle) * 0.15,
        y: 0.5 + Math.sin(angle) * 0.15,
      };
    });
    expect(classifyStroke(points)?.type).toBe('ellipse');
  });

  it('recognizes a rectangular stroke', () => {
    const points = [
      ...edge(0.2, 0.2, 0.7, 0.2),
      ...edge(0.7, 0.2, 0.7, 0.5),
      ...edge(0.7, 0.5, 0.2, 0.5),
      ...edge(0.2, 0.5, 0.2, 0.2),
    ];
    expect(classifyStroke(points)?.type).toBe('rectangle');
  });
});

function edge(x1: number, y1: number, x2: number, y2: number) {
  return Array.from({ length: 8 }, (_, index) => ({
    x: x1 + ((x2 - x1) * index) / 7,
    y: y1 + ((y2 - y1) * index) / 7,
  }));
}
