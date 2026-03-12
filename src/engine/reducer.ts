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
          const { x, y, width, height, x2, y2, fontSize, points } = command;
          if (el.type === 'rectangle' || el.type === 'ellipse' || el.type === 'text' || el.type === 'image') {
            return {
              ...el,
              ...(x        !== undefined && { x }),
              ...(y        !== undefined && { y }),
              ...(width    !== undefined && { width }),
              ...(height   !== undefined && { height }),
              ...(fontSize !== undefined && el.type === 'text' && { fontSize }),
            };
          }
          if (el.type === 'line' || el.type === 'arrow') {
            const { startElementId, endElementId } = command;
            // Build patch carefully to avoid exactOptionalPropertyTypes issues
            const patch: Record<string, unknown> = {};
            if (x  !== undefined) patch['x']  = x;
            if (y  !== undefined) patch['y']  = y;
            if (x2 !== undefined) patch['x2'] = x2;
            if (y2 !== undefined) patch['y2'] = y2;
            if (startElementId !== undefined) {
              if (startElementId === null) { delete (patch as { startElementId?: string })['startElementId']; }
              else { patch['startElementId'] = startElementId; }
            }
            if (endElementId !== undefined) {
              if (endElementId === null) { delete (patch as { endElementId?: string })['endElementId']; }
              else { patch['endElementId'] = endElementId; }
            }
            // When disconnecting (null), explicitly remove the property
            const base = { ...el, ...patch } as Element;
            if (startElementId === null) {
              const { startElementId: _s, ...rest } = base as typeof el;
              void _s;
              return rest as Element;
            }
            if (endElementId === null) {
              const { endElementId: _e, ...rest } = base as typeof el;
              void _e;
              return rest as Element;
            }
            return base;
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

    case 'SET_SHAPE_LABEL':
      return {
        ...scene,
        elements: scene.elements.map((el) =>
          el.id === command.id && (el.type === 'rectangle' || el.type === 'ellipse')
            ? { ...el, label: command.label, labelFontSize: command.labelFontSize, labelFontFamily: command.labelFontFamily }
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

    case 'SET_VIEWPORT':
      return { ...scene, viewport: { offsetX: command.offsetX, offsetY: command.offsetY, zoom: command.zoom } };

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

    case 'SET_ROTATION':
      return {
        ...scene,
        elements: scene.elements.map((el) =>
          el.id === command.id ? { ...el, rotation: command.rotation } : el
        ),
      };

    case 'SET_STROKE_STYLE':
      return { ...scene, appState: { ...scene.appState, strokeStyle: command.style } };

    case 'REORDER_ELEMENTS': {
      const idSet = new Set(command.ids);
      const moving = command.ids
        .map((id) => scene.elements.find((el) => el.id === id))
        .filter((el): el is Element => el !== undefined);
      const rest = scene.elements.filter((el) => !idSet.has(el.id));
      const clampedIdx = Math.max(0, Math.min(command.targetIndex, rest.length));
      const reordered = [
        ...rest.slice(0, clampedIdx),
        ...moving,
        ...rest.slice(clampedIdx),
      ];
      return { ...scene, elements: reordered };
    }

    case 'TOGGLE_ELEMENT_VISIBILITY':
      return {
        ...scene,
        elements: scene.elements.map((el) =>
          el.id === command.id ? { ...el, visible: el.visible === false ? true : false } : el
        ),
      };

    case 'RENAME_LAYER':
      return {
        ...scene,
        elements: scene.elements.map((el) =>
          el.id === command.id ? { ...el, layerName: command.name } : el
        ),
      };

    case 'LOAD_SCENE':
      return {
        ...scene,
        elements: command.elements,
        selectedIds: new Set(),
        viewport: command.viewport,
      };

    case 'GROUP_ELEMENTS': {
      const groupSet = new Set(command.ids);
      return {
        ...scene,
        elements: scene.elements.map((el) =>
          groupSet.has(el.id) ? ({ ...el, groupId: command.groupId } as Element) : el
        ),
      };
    }

    case 'UNGROUP_ELEMENTS':
      return {
        ...scene,
        elements: scene.elements.map((el) => {
          if (el.groupId !== command.groupId) return el;
          const { groupId: _g, ...rest } = el;
          void _g;
          return rest as Element;
        }),
      };

    case 'LOCK_ELEMENTS': {
      const lockSet = new Set(command.ids);
      return {
        ...scene,
        elements: scene.elements.map((el) =>
          lockSet.has(el.id) ? ({ ...el, locked: true } as Element) : el
        ),
      };
    }

    case 'UNLOCK_ELEMENTS': {
      const unlockSet = new Set(command.ids);
      return {
        ...scene,
        elements: scene.elements.map((el) =>
          unlockSet.has(el.id) ? ({ ...el, locked: false } as Element) : el
        ),
      };
    }

    case 'APPLY_STYLE': {
      const { strokeColor, fillColor, strokeWidth, opacity, roughness, strokeStyle } = command;
      const patch: Record<string, unknown> = {};
      if (strokeColor  !== undefined) patch['strokeColor']  = strokeColor;
      if (fillColor    !== undefined) patch['fillColor']    = fillColor;
      if (strokeWidth  !== undefined) patch['strokeWidth']  = strokeWidth;
      if (opacity      !== undefined) patch['opacity']      = opacity;
      if (roughness    !== undefined) patch['roughness']    = roughness;
      if (strokeStyle  !== undefined) patch['strokeStyle']  = strokeStyle;

      // appState patch (only properties that belong to appState)
      const statePatch: Record<string, unknown> = {};
      if (strokeColor  !== undefined) statePatch['strokeColor']  = strokeColor;
      if (fillColor    !== undefined) statePatch['fillColor']    = fillColor;
      if (strokeWidth  !== undefined) statePatch['strokeWidth']  = strokeWidth;
      if (opacity      !== undefined) statePatch['opacity']      = opacity;
      if (roughness    !== undefined) statePatch['roughness']    = roughness;
      if (strokeStyle  !== undefined) statePatch['strokeStyle']  = strokeStyle;

      return {
        ...scene,
        appState: { ...scene.appState, ...statePatch },
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
