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

export function cloneElementsWithOffset(
  elements: ReadonlyArray<Element>,
  dx: number,
  dy: number,
  createId: () => string = () => crypto.randomUUID(),
): Element[] {
  const idMap = new Map(elements.map((element) => [element.id, createId()]));
  const groupCounts = new Map<string, number>();

  for (const element of elements) {
    if (element.groupId) {
      groupCounts.set(
        element.groupId,
        (groupCounts.get(element.groupId) ?? 0) + 1,
      );
    }
  }

  const groupIdMap = new Map<string, string>();

  return elements.map((element) => {
    const cloned = cloneElementWithOffset(
      element,
      idMap.get(element.id)!,
      dx,
      dy,
    );
    const { groupId: _groupId, ...withoutGroup } = cloned;
    let groupId: string | undefined;

    if (element.groupId && (groupCounts.get(element.groupId) ?? 0) > 1) {
      groupId = groupIdMap.get(element.groupId);
      if (!groupId) {
        groupId = createId();
        groupIdMap.set(element.groupId, groupId);
      }
    }

    if (element.type === 'line' || element.type === 'arrow') {
      const connector = withoutGroup as typeof element;
      const {
        startElementId: _startElementId,
        endElementId: _endElementId,
        ...withoutConnections
      } = connector;
      const startElementId = element.startElementId
        ? idMap.get(element.startElementId)
        : undefined;
      const endElementId = element.endElementId
        ? idMap.get(element.endElementId)
        : undefined;

      return {
        ...withoutConnections,
        ...(groupId && { groupId }),
        ...(startElementId && { startElementId }),
        ...(endElementId && { endElementId }),
      };
    }

    return { ...withoutGroup, ...(groupId && { groupId }) } as Element;
  });
}
