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
        selectedIds: command.select === false ? new Set() : new Set([command.element.id]),
        appState: {
          ...scene.appState,
          lastCreatedId: command.select === false ? command.element.id : null,
        },
      };

    case 'CREATE_ELEMENTS':
      return {
        ...scene,
        elements: [...scene.elements, ...command.elements],
        selectedIds: new Set(command.elements.map((el) => el.id)),
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
          if (el.type === 'rectangle' || el.type === 'ellipse' || el.type === 'rhombus' || el.type === 'text' || el.type === 'image') {
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
      // Also delete arrows/lines connected to deleted elements
      for (const el of scene.elements) {
        if (el.type !== 'arrow' && el.type !== 'line') continue;
        if (
          (el.startElementId && del.has(el.startElementId)) ||
          (el.endElementId   && del.has(el.endElementId))
        ) {
          del.add(el.id);
        }
      }
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
          el.id === command.id && (el.type === 'rectangle' || el.type === 'ellipse' || el.type === 'rhombus' || el.type === 'arrow')
            ? { ...el, label: command.label, labelFontSize: command.labelFontSize, labelFontFamily: command.labelFontFamily }
            : el
        ),
      };

    case 'SELECT_ELEMENTS':
      return { ...scene, selectedIds: new Set(command.ids), appState: { ...scene.appState, lastCreatedId: null } };

    case 'CLEAR_SELECTION':
      return { ...scene, selectedIds: new Set(), appState: { ...scene.appState, lastCreatedId: null } };

    case 'PAN_VIEWPORT':
      return { ...scene, viewport: pan(scene.viewport, command.dx, command.dy) };

    case 'ZOOM_VIEWPORT':
      return { ...scene, viewport: zoom(scene.viewport, command.factor, command.originX, command.originY) };

    case 'SET_VIEWPORT':
      return { ...scene, viewport: { offsetX: command.offsetX, offsetY: command.offsetY, zoom: command.zoom } };

    case 'SET_TOOL': {
      const NON_DRAWING = new Set(['select', 'hand', 'eraser']);
      const isDrawingTool = !NON_DRAWING.has(command.tool);
      let newAppState = { ...scene.appState, activeTool: command.tool, lastCreatedId: null };

      // When switching to a drawing tool while an element is selected,
      // inherit that element's style so the sidebar reflects the current shape.
      if (!command.keepSelection && isDrawingTool && scene.selectedIds.size > 0) {
        const firstId = [...scene.selectedIds][0]!;
        const el = scene.elements.find((e) => e.id === firstId);
        if (el) {
          newAppState = {
            ...newAppState,
            strokeColor: el.strokeColor,
            fillColor:   el.fillColor,
            strokeWidth: el.strokeWidth,
            opacity:     el.opacity,
            roughness:   el.roughness ?? 0,
            strokeStyle: el.strokeStyle ?? 'solid',
          };
        }
      }

      return {
        ...scene,
        appState:    newAppState,
        selectedIds: command.keepSelection ? scene.selectedIds : new Set(),
      };
    }

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

    case 'CLEAR_JUST_CREATED_TEXT':
      return { ...scene, appState: { ...scene.appState, justCreatedText: false } };

    case 'SET_JUST_CREATED_TEXT':
      return { ...scene, appState: { ...scene.appState, justCreatedText: true } };

    case 'SET_TOOL_LOCK':
      return { ...scene, appState: { ...scene.appState, toolLocked: command.locked } };

    case 'SET_TEXT_MODE':
      return {
        ...scene,
        appState: { ...scene.appState, textMode: command.mode },
        elements: scene.elements.map((el) =>
          scene.selectedIds.has(el.id) && el.type === 'text'
            ? { ...el, isCode: command.mode === 'code' }
            : el
        ),
      };

    case 'APPLY_STYLE': {
      const { strokeColor, fillColor, strokeWidth, opacity, roughness, strokeStyle, cornerRadius, textAlign } = command;
      const patch: Record<string, unknown> = {};
      if (strokeColor   !== undefined) patch['strokeColor']   = strokeColor;
      if (fillColor     !== undefined) patch['fillColor']     = fillColor;
      if (strokeWidth   !== undefined) patch['strokeWidth']   = strokeWidth;
      if (opacity       !== undefined) patch['opacity']       = opacity;
      if (roughness     !== undefined) patch['roughness']     = roughness;
      if (strokeStyle   !== undefined) patch['strokeStyle']   = strokeStyle;
      if (cornerRadius  !== undefined) patch['cornerRadius']  = cornerRadius;
      if (textAlign     !== undefined) patch['textAlign']     = textAlign;

      // appState patch (only properties that belong to appState)
      const statePatch: Record<string, unknown> = {};
      if (strokeColor   !== undefined) statePatch['strokeColor']   = strokeColor;
      if (fillColor     !== undefined) statePatch['fillColor']     = fillColor;
      if (strokeWidth   !== undefined) statePatch['strokeWidth']   = strokeWidth;
      if (opacity       !== undefined) statePatch['opacity']       = opacity;
      if (roughness     !== undefined) statePatch['roughness']     = roughness;
      if (strokeStyle   !== undefined) statePatch['strokeStyle']   = strokeStyle;
      if (textAlign     !== undefined) statePatch['textAlign']     = textAlign;

      const fallbackId = scene.selectedIds.size === 0 ? scene.appState.lastCreatedId : null;
      return {
        ...scene,
        appState: { ...scene.appState, ...statePatch },
        elements: scene.elements.map((el) =>
          scene.selectedIds.has(el.id) || el.id === fallbackId
            ? ({ ...el, ...patch } as Element)
            : el
        ),
      };
    }

    case 'ALIGN_ELEMENTS': {
      const movesMap = new Map(command.moves.map((m) => [m.id, m]));
      return {
        ...scene,
        elements: scene.elements.map((el) => {
          const move = movesMap.get(el.id);
          if (!move) return el;
          const dx = move.x - el.x;
          const dy = move.y - el.y;
          if (dx === 0 && dy === 0) return el;
          if (el.type === 'line' || el.type === 'arrow') {
            return { ...el, x: move.x, y: move.y, x2: el.x2 + dx, y2: el.y2 + dy };
          }
          if (el.type === 'freehand') {
            return {
              ...el,
              x: move.x,
              y: move.y,
              points: el.points.map(([px, py]) => [px + dx, py + dy] as const),
            };
          }
          return { ...el, x: move.x, y: move.y };
        }),
      };
    }

    default:
      return assertNever(command);
  }
}
