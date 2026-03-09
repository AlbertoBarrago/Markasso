import type { Scene } from '../core/scene';
import type { Command } from '../commands/commands';
import { pan, zoom } from '../core/viewport';
import type { Element } from '../elements/element';

export function assertNever(x: never): never {
  throw new Error(`Unhandled command: ${(x as { type: string }).type}`);
}

export function reducer(scene: Scene, command: Command): Scene {
  switch (command.type) {

    case 'CREATE_ELEMENT':
      return {
        ...scene,
        elements: [...scene.elements, command.element],
        selectedIds: new Set([command.element.id]),
      };

    case 'UPDATE_ELEMENT':
      return {
        ...scene,
        elements: scene.elements.map((el) =>
          el.id === command.id ? ({ ...el, ...command.props } as Element) : el
        ),
      };

    case 'MOVE_ELEMENT':
      return {
        ...scene,
        elements: scene.elements.map((el) => {
          if (el.id !== command.id) return el;
          if (el.type === 'line' || el.type === 'arrow') {
            return { ...el, x: el.x + command.dx, y: el.y + command.dy,
                           x2: el.x2 + command.dx, y2: el.y2 + command.dy };
          }
          if (el.type === 'freehand') {
            return {
              ...el,
              x: el.x + command.dx,
              y: el.y + command.dy,
              points: el.points.map(([px, py]) => [px + command.dx, py + command.dy] as const),
            };
          }
          return { ...el, x: el.x + command.dx, y: el.y + command.dy };
        }),
      };

    case 'RESIZE_ELEMENT':
      return {
        ...scene,
        elements: scene.elements.map((el) => {
          if (el.id !== command.id) return el;
          const { x, y, width, height, x2, y2, points } = command;
          if (el.type === 'rectangle' || el.type === 'ellipse' || el.type === 'text') {
            return {
              ...el,
              ...(x       !== undefined && { x }),
              ...(y       !== undefined && { y }),
              ...(width   !== undefined && { width }),
              ...(height  !== undefined && { height }),
            };
          }
          if (el.type === 'line' || el.type === 'arrow') {
            return {
              ...el,
              ...(x  !== undefined && { x }),
              ...(y  !== undefined && { y }),
              ...(x2 !== undefined && { x2 }),
              ...(y2 !== undefined && { y2 }),
            };
          }
          if (el.type === 'freehand') {
            return {
              ...el,
              ...(x      !== undefined && { x }),
              ...(y      !== undefined && { y }),
              ...(points !== undefined && { points }),
            };
          }
          return el;
        }),
      };

    case 'DELETE_ELEMENTS': {
      const del = new Set(command.ids);
      return {
        ...scene,
        elements:    scene.elements.filter((el) => !del.has(el.id)),
        selectedIds: new Set([...scene.selectedIds].filter((id) => !del.has(id))),
      };
    }

    case 'EDIT_TEXT':
      return {
        ...scene,
        elements: scene.elements.map((el) =>
          el.id === command.id && el.type === 'text'
            ? { ...el, content: command.content }
            : el
        ),
      };

    case 'SELECT_ELEMENTS':
      return { ...scene, selectedIds: new Set(command.ids) };

    case 'CLEAR_SELECTION':
      return { ...scene, selectedIds: new Set() };

    case 'PAN_VIEWPORT':
      return { ...scene, viewport: pan(scene.viewport, command.dx, command.dy) };

    case 'ZOOM_VIEWPORT':
      return { ...scene, viewport: zoom(scene.viewport, command.factor, command.originX, command.originY) };

    case 'SET_TOOL':
      return { ...scene, appState: { ...scene.appState, activeTool: command.tool }, selectedIds: new Set() };

    case 'SET_STROKE_COLOR':
      return { ...scene, appState: { ...scene.appState, strokeColor: command.color } };

    case 'SET_FILL_COLOR':
      return { ...scene, appState: { ...scene.appState, fillColor: command.color } };

    case 'SET_STROKE_WIDTH':
      return { ...scene, appState: { ...scene.appState, strokeWidth: command.width } };

    case 'SET_FONT_FAMILY':
      return {
        ...scene,
        appState: { ...scene.appState, fontFamily: command.family },
        elements: scene.elements.map((el) =>
          scene.selectedIds.has(el.id) && el.type === 'text'
            ? { ...el, fontFamily: command.family } : el
        ),
      };

    case 'SET_FONT_SIZE':
      return {
        ...scene,
        appState: { ...scene.appState, fontSize: command.size },
        elements: scene.elements.map((el) =>
          scene.selectedIds.has(el.id) && el.type === 'text'
            ? { ...el, fontSize: command.size } : el
        ),
      };

    case 'TOGGLE_GRID':
      return { ...scene, appState: { ...scene.appState, gridVisible: !scene.appState.gridVisible } };

    case 'SET_GRID_TYPE':
      return { ...scene, appState: { ...scene.appState, gridType: command.gridType } };

    case 'APPLY_STYLE': {
      const { strokeColor, fillColor, strokeWidth, opacity } = command;
      const patch: Record<string, unknown> = {};
      if (strokeColor !== undefined) patch['strokeColor'] = strokeColor;
      if (fillColor   !== undefined) patch['fillColor']   = fillColor;
      if (strokeWidth !== undefined) patch['strokeWidth'] = strokeWidth;
      if (opacity     !== undefined) patch['opacity']     = opacity;
      return {
        ...scene,
        appState: { ...scene.appState, ...patch },
        elements: scene.elements.map((el) =>
          scene.selectedIds.has(el.id)
            ? ({ ...el, ...patch } as Element)
            : el
        ),
      };
    }

    default:
      return assertNever(command);
  }
}
