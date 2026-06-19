import type { Element } from './element';

export function cloneElementWithOffset(
  el: Element,
  id: string,
  dx: number,
  dy: number,
): Element {
  if (el.type === 'line' || el.type === 'arrow') {
    return {
      ...el,
      id,
      x: el.x + dx,
      y: el.y + dy,
      x2: el.x2 + dx,
      y2: el.y2 + dy,
      ...(el.type === 'line' && el.cx !== undefined && { cx: el.cx + dx }),
      ...(el.type === 'line' && el.cy !== undefined && { cy: el.cy + dy }),
    };
  }

  if (el.type === 'curve') {
    return {
      ...el,
      id,
      x: el.x + dx,
      y: el.y + dy,
      x2: el.x2 + dx,
      y2: el.y2 + dy,
      cx: el.cx + dx,
      cy: el.cy + dy,
    };
  }

  if (el.type === 'freehand' || el.type === 'polygon') {
    return {
      ...el,
      id,
      x: el.x + dx,
      y: el.y + dy,
      points: el.points.map(([px, py]) => [px + dx, py + dy] as const),
    };
  }

  return { ...el, id, x: el.x + dx, y: el.y + dy };
}
