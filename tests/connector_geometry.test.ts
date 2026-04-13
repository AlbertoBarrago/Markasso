import { describe, expect, it } from 'vitest';
import { distToQuadraticCurve, getArrowHeadVector, getQuadraticBounds, getQuadraticPoint, getQuadraticSegment, getQuadraticTangent } from '../src/rendering/connector_geometry';

describe('getArrowHeadVector', () => {
  it('uses the control point to orient the arrowhead at the end of a quadratic line', () => {
    const head = getArrowHeadVector(
      { x: 0, y: 0, x2: 100, y2: 0 },
      { cx: 80, cy: 40 },
      'end',
    );

    expect(head).toEqual({ fromX: 80, fromY: 40, tipX: 100, tipY: 0 });
  });

  it('uses the control point to orient the arrowhead at the start of a quadratic line', () => {
    const head = getArrowHeadVector(
      { x: 0, y: 0, x2: 100, y2: 0 },
      { cx: 20, cy: 40 },
      'start',
    );

    expect(head).toEqual({ fromX: 20, fromY: 40, tipX: 0, tipY: 0 });
  });

  it('falls back to the opposite endpoint when the control point collapses onto the tip', () => {
    const head = getArrowHeadVector(
      { x: 0, y: 0, x2: 100, y2: 0 },
      { cx: 100, cy: 0 },
      'end',
    );

    expect(head).toEqual({ fromX: 0, fromY: 0, tipX: 100, tipY: 0 });
  });

  it('computes the midpoint on a quadratic curve', () => {
    const point = getQuadraticPoint(0, 0, 50, 100, 100, 0, 0.5);
    expect(point.x).toBe(50);
    expect(point.y).toBe(50);
  });

  it('computes the tangent on a quadratic curve', () => {
    const tangent = getQuadraticTangent(0, 0, 50, 100, 100, 0, 0.5);
    expect(tangent.x).toBe(100);
    expect(tangent.y).toBe(0);
  });

  it('extracts a quadratic sub-segment without leaving the source curve', () => {
    const seg = getQuadraticSegment(0, 0, 50, 100, 100, 0, 0.25, 0.75);
    expect(seg).not.toBeNull();
    expect(seg?.x).toBe(25);
    expect(seg?.y).toBeCloseTo(37.5, 5);
    expect(seg?.x2).toBe(75);
    expect(seg?.y2).toBeCloseTo(37.5, 5);
  });

  it('computes tight quadratic bounds', () => {
    const bounds = getQuadraticBounds(0, 0, 50, 100, 100, 0);
    expect(bounds.minX).toBe(0);
    expect(bounds.maxX).toBe(100);
    expect(bounds.minY).toBe(0);
    expect(bounds.maxY).toBe(50);
  });

  it('measures distance to the actual quadratic curve', () => {
    const dist = distToQuadraticCurve(50, 50, 0, 0, 50, 100, 100, 0);
    expect(dist).toBeCloseTo(0, 4);
  });
});
