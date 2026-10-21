import type { ShapeKind } from '../elements/element';
import { SHAPE_DEFINITIONS, shapeCommandsToPathData } from '../elements/shapes';

/** i18n key of each flowchart kind's display name. */
export const SHAPE_KIND_LABEL_KEYS: Readonly<Record<ShapeKind, string>> = {
  terminator: 'shapeTerminator',
  data: 'shapeData',
  document: 'shapeDocument',
  database: 'shapeDatabase',
  predefinedProcess: 'shapePredefinedProcess',
  preparation: 'shapePreparation',
  manualInput: 'shapeManualInput',
  delay: 'shapeDelay',
};

/**
 * Toolbar/menu icon for a flowchart kind, generated from the same geometry
 * the canvas renders so icons can never drift from the actual shapes.
 */
export function shapeKindIcon(kind: ShapeKind, size = 18): string {
  const def = SHAPE_DEFINITIONS[kind];
  // Shape box inside the 20x20 viewBox; database reads better taller.
  const [w, h] = kind === 'database' ? [12, 15] : [16, 11];
  const ox = (20 - w) / 2;
  const oy = (20 - h) / 2;
  const outline = shapeCommandsToPathData(def.outline(w, h), ox, oy);
  const details = def.details
    ? `<path d="${shapeCommandsToPathData(def.details(w, h), ox, oy)}"/>`
    : '';
  return `<svg width="${size}" height="${size}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${outline}"/>${details}</svg>`;
}
