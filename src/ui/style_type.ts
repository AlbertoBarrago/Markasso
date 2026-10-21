import type { Element } from '../elements/element';
import { isRestylableStencil } from '../elements/stencils/registry';

/**
 * Type key the style panels use to decide which sections apply. Vendor
 * icons may not be recolored, so they get the same (stroke-less, fill-less)
 * treatment as images; Markasso's own icons style like shapes.
 */
export function styleTypeOf(el: Element): string {
  if (el.type === 'stencil')
    return isRestylableStencil(el) ? 'stencil' : 'image';
  return el.type;
}

/** Types that show the fill section. */
const FILL_TYPES: ReadonlySet<string> = new Set([
  'rectangle',
  'ellipse',
  'rhombus',
  'shape',
  'stencil',
  'text',
]);

/** Types that show the stroke style and roughness sections. */
const STROKE_STYLE_TYPES: ReadonlySet<string> = new Set([
  'rectangle',
  'ellipse',
  'rhombus',
  'shape',
  'stencil',
  'line',
  'arrow',
]);

/** Shared by the desktop context panel and the mobile style sheet. */
export function hasFillStyle(el: Element): boolean {
  return FILL_TYPES.has(styleTypeOf(el));
}

export function hasStrokeStyle(el: Element): boolean {
  return STROKE_STYLE_TYPES.has(styleTypeOf(el));
}
