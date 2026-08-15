import type { Viewport } from '../core/viewport';
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

const STROKE_STYLES = new Set(['solid', 'dashed', 'dotted']);
const LINE_CAPS = new Set(['round', 'butt', 'square']);
const LINE_JOINS = new Set(['round', 'miter', 'bevel']);
const TEXT_ALIGNS = new Set(['left', 'center', 'right']);
const ARROW_HEADS = new Set(['none', 'start', 'end', 'both']);

export const MAX_ELEMENTS = 5_000;
export const MAX_POINTS_PER_ELEMENT = 100_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isFiniteNumberInRange(
  value: unknown,
  min: number,
  max: number,
): value is number {
  return isFiniteNumber(value) && value >= min && value <= max;
}

function isString(value: unknown, maxLength = 10_000): value is string {
  return typeof value === 'string' && value.length <= maxLength;
}

function isOptionalString(value: unknown, maxLength = 10_000): boolean {
  return value === undefined || isString(value, maxLength);
}

function isOptionalBoolean(value: unknown): boolean {
  return value === undefined || typeof value === 'boolean';
}

function isOptionalFiniteNumber(
  value: unknown,
  min = -10_000_000,
  max = 10_000_000,
): boolean {
  return value === undefined || isFiniteNumberInRange(value, min, max);
}

function isOptionalEnum(value: unknown, values: ReadonlySet<string>): boolean {
  return (
    value === undefined || (typeof value === 'string' && values.has(value))
  );
}

function isCssColor(value: unknown): value is string {
  if (!isString(value, 128)) return false;
  if (value === 'transparent' || value === 'none') return true;
  if (/^#[\da-f]{3,8}$/i.test(value)) return true;
  if (/^[a-z]+$/i.test(value)) return true;
  return /^(?:rgb|rgba|hsl|hsla)\([\d\s.,%+-]+\)$/i.test(value);
}

function isOptionalCssColor(value: unknown): boolean {
  return value === undefined || isCssColor(value);
}

function isPoint(value: unknown): value is readonly [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    isFiniteNumberInRange(value[0], -10_000_000, 10_000_000) &&
    isFiniteNumberInRange(value[1], -10_000_000, 10_000_000)
  );
}

function hasValidBaseFields(el: Record<string, unknown>): boolean {
  return (
    isString(el.id, 128) &&
    el.id.length > 0 &&
    typeof el.type === 'string' &&
    ELEMENT_TYPES.has(el.type as ElementType) &&
    isFiniteNumberInRange(el.x, -10_000_000, 10_000_000) &&
    isFiniteNumberInRange(el.y, -10_000_000, 10_000_000) &&
    isCssColor(el.strokeColor) &&
    isCssColor(el.fillColor) &&
    isFiniteNumberInRange(el.strokeWidth, 0, 1_000) &&
    isFiniteNumberInRange(el.opacity, 0, 1) &&
    isFiniteNumberInRange(el.roughness, 0, 10) &&
    isOptionalFiniteNumber(el.rotation, -Math.PI * 2, Math.PI * 2) &&
    isOptionalEnum(el.strokeStyle, STROKE_STYLES) &&
    isOptionalEnum(el.lineCap, LINE_CAPS) &&
    isOptionalEnum(el.lineJoin, LINE_JOINS) &&
    isOptionalFiniteNumber(el.shadowBlur, 0, 1_000) &&
    isOptionalCssColor(el.shadowColor) &&
    isOptionalFiniteNumber(el.shadowOffsetX) &&
    isOptionalFiniteNumber(el.shadowOffsetY) &&
    isOptionalBoolean(el.visible) &&
    isOptionalString(el.layerName, 1_000) &&
    isOptionalBoolean(el.locked) &&
    isOptionalString(el.groupId, 128)
  );
}

function hasBoxFields(el: Record<string, unknown>): boolean {
  return (
    isFiniteNumberInRange(el.width, -10_000_000, 10_000_000) &&
    isFiniteNumberInRange(el.height, -10_000_000, 10_000_000)
  );
}

function hasShapeLabelFields(el: Record<string, unknown>): boolean {
  return (
    isOptionalString(el.label) &&
    isOptionalFiniteNumber(el.labelFontSize, 1, 1_000) &&
    isOptionalString(el.labelFontFamily, 256) &&
    isOptionalCssColor(el.labelColor)
  );
}

function hasEndpointFields(el: Record<string, unknown>): boolean {
  return (
    isFiniteNumberInRange(el.x2, -10_000_000, 10_000_000) &&
    isFiniteNumberInRange(el.y2, -10_000_000, 10_000_000)
  );
}

function hasConnectorFields(el: Record<string, unknown>): boolean {
  return (
    isOptionalString(el.startElementId, 128) &&
    isOptionalString(el.endElementId, 128) &&
    hasShapeLabelFields(el)
  );
}

function hasPointFields(el: Record<string, unknown>): boolean {
  return (
    Array.isArray(el.points) &&
    el.points.length >= 2 &&
    el.points.length <= MAX_POINTS_PER_ELEMENT &&
    el.points.every(isPoint)
  );
}

function isImageSource(value: unknown): value is string {
  return (
    isString(value, 10_000_000) &&
    /^data:image\/(?:png|jpe?g|gif|webp|svg\+xml);base64,/i.test(value)
  );
}

export function isValidElement(value: unknown): value is Element {
  if (!isRecord(value) || !hasValidBaseFields(value)) return false;

  switch (value.type) {
    case 'rectangle':
    case 'ellipse':
    case 'rhombus':
      return (
        hasBoxFields(value) &&
        hasShapeLabelFields(value) &&
        isOptionalFiniteNumber(value.cornerRadius, 0, 1_000)
      );

    case 'line':
      return (
        hasEndpointFields(value) &&
        hasConnectorFields(value) &&
        isOptionalFiniteNumber(value.cx) &&
        isOptionalFiniteNumber(value.cy) &&
        isOptionalEnum(value.arrowHead, ARROW_HEADS)
      );

    case 'arrow':
      return hasEndpointFields(value) && hasConnectorFields(value);

    case 'curve':
      return (
        hasEndpointFields(value) &&
        isFiniteNumberInRange(value.cx, -10_000_000, 10_000_000) &&
        isFiniteNumberInRange(value.cy, -10_000_000, 10_000_000)
      );

    case 'polygon':
      return hasPointFields(value) && typeof value.closed === 'boolean';

    case 'freehand':
      return (
        hasPointFields(value) &&
        (value.pressures === undefined ||
          (Array.isArray(value.pressures) &&
            value.pressures.length === (value.points as unknown[]).length &&
            value.pressures.every((pressure) =>
              isFiniteNumberInRange(pressure, 0, 1),
            )))
      );

    case 'text':
      return (
        hasBoxFields(value) &&
        isString(value.content) &&
        isFiniteNumberInRange(value.fontSize, 1, 1_000) &&
        isString(value.fontFamily, 256) &&
        isOptionalEnum(value.textAlign, TEXT_ALIGNS) &&
        isOptionalBoolean(value.isCode) &&
        isOptionalBoolean(value.bold) &&
        isOptionalBoolean(value.italic) &&
        isOptionalBoolean(value.underline) &&
        isOptionalBoolean(value.strikethrough)
      );

    case 'image':
      return (
        hasBoxFields(value) &&
        isImageSource(value.src) &&
        isFiniteNumberInRange(value.naturalWidth, 1, 100_000) &&
        isFiniteNumberInRange(value.naturalHeight, 1, 100_000)
      );
  }
  return false;
}

export function validateElements(value: unknown): Element[] | null {
  if (!Array.isArray(value) || value.length > MAX_ELEMENTS) return null;
  if (!value.every(isValidElement)) return null;

  const ids = new Set<string>();
  for (const element of value) {
    if (ids.has(element.id)) return null;
    ids.add(element.id);
  }
  return value;
}

export function validateViewport(value: unknown): Viewport | null {
  if (!isRecord(value)) return null;
  if (
    !isFiniteNumberInRange(value.offsetX, -10_000_000, 10_000_000) ||
    !isFiniteNumberInRange(value.offsetY, -10_000_000, 10_000_000) ||
    !isFiniteNumberInRange(value.zoom, 0.05, 30)
  ) {
    return null;
  }
  return {
    offsetX: value.offsetX,
    offsetY: value.offsetY,
    zoom: value.zoom,
  };
}
