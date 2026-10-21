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
