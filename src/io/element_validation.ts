import type { Element, ElementType } from '../elements/element';

const ELEMENT_TYPES: ReadonlySet<ElementType> = new Set([
  'rectangle',
  'ellipse',
  'rhombus',
  'line',
  'arrow',
  'curve',
  'polygon',
  'freehand',
  'text',
  'image',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isPoint(value: unknown): value is readonly [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    isFiniteNumber(value[0]) &&
    isFiniteNumber(value[1])
  );
}

function hasBaseElementFields(el: Record<string, unknown>): boolean {
  return (
    isString(el.id) &&
    el.id.length > 0 &&
    isString(el.type) &&
    ELEMENT_TYPES.has(el.type as ElementType) &&
    isFiniteNumber(el.x) &&
    isString(el.strokeColor) &&
    isString(el.fillColor) &&
    isFiniteNumber(el.strokeWidth) &&
    isFiniteNumber(el.opacity) &&
    isFiniteNumber(el.roughness)
  );
}

function hasBoxFields(el: Record<string, unknown>): boolean {
  return (
    isFiniteNumber(el.y) &&
    isFiniteNumber(el.width) &&
    isFiniteNumber(el.height)
  );
}

function hasEndpointFields(el: Record<string, unknown>): boolean {
  return isFiniteNumber(el.y) && isFiniteNumber(el.x2) && isFiniteNumber(el.y2);
}

function hasPointFields(el: Record<string, unknown>): boolean {
  return (
    isFiniteNumber(el.y) && Array.isArray(el.points) && el.points.every(isPoint)
  );
}

export function isValidElement(value: unknown): value is Element {
  if (!isRecord(value) || !hasBaseElementFields(value)) return false;

  switch (value.type) {
    case 'rectangle':
    case 'ellipse':
    case 'rhombus':
      return hasBoxFields(value);

    case 'line':
    case 'arrow':
      return hasEndpointFields(value);

    case 'curve':
      return (
        hasEndpointFields(value) &&
        isFiniteNumber(value.cx) &&
        isFiniteNumber(value.cy)
      );

    case 'polygon':
      return hasPointFields(value) && typeof value.closed === 'boolean';

    case 'freehand':
      return (
        hasPointFields(value) &&
        (value.pressures === undefined ||
          (Array.isArray(value.pressures) &&
            value.pressures.every(isFiniteNumber)))
      );

    case 'text':
      return (
        hasBoxFields(value) &&
        isString(value.content) &&
        isFiniteNumber(value.fontSize) &&
        isString(value.fontFamily)
      );

    case 'image':
      return (
        hasBoxFields(value) &&
        isString(value.src) &&
        isFiniteNumber(value.naturalWidth) &&
        isFiniteNumber(value.naturalHeight)
      );
  }
  return false;
}

export function validateElements(value: unknown): Element[] | null {
  if (!Array.isArray(value)) return null;
  return value.every(isValidElement) ? value : null;
}
