import type { Element } from '../elements/element';
import type { ActiveTool, GridType } from '../core/app_state';

export type Command =
  | { type: 'CREATE_ELEMENT';  element: Element }
  | { type: 'UPDATE_ELEMENT';  id: string; props: Partial<Element> }
  | { type: 'MOVE_ELEMENT';    id: string; dx: number; dy: number }
  | {
      type: 'RESIZE_ELEMENT';
      id: string;
      x?: number; y?: number;
      width?: number; height?: number;
      x2?: number; y2?: number;
      fontSize?: number;
      points?: ReadonlyArray<readonly [number, number]>;
    }
  | { type: 'DELETE_ELEMENTS'; ids: string[] }
  | { type: 'EDIT_TEXT';       id: string; content: string }
  | { type: 'SET_SHAPE_LABEL'; id: string; label: string; labelFontSize: number; labelFontFamily: string }
  | { type: 'SELECT_ELEMENTS'; ids: string[] }
  | { type: 'CLEAR_SELECTION' }
  | { type: 'PAN_VIEWPORT';   dx: number; dy: number }
  | { type: 'ZOOM_VIEWPORT';  factor: number; originX: number; originY: number }
  | { type: 'SET_TOOL';        tool: ActiveTool }
  | { type: 'SET_STROKE_COLOR'; color: string }   // appState only (default for next shape)
  | { type: 'SET_FILL_COLOR';   color: string }   // appState only
  | { type: 'SET_STROKE_WIDTH'; width: number }   // appState only
  | { type: 'SET_FONT_FAMILY';  family: string }  // appState + selected text
  | { type: 'SET_FONT_SIZE';    size: number }    // appState + selected text
  | { type: 'TOGGLE_GRID' }
  | { type: 'SET_GRID_TYPE';   gridType: GridType }
  | { type: 'SET_ROTATION';    id: string; rotation: number }
  /** Applies style to ALL selected elements AND updates appState defaults. Undoable. */
  | {
      type: 'APPLY_STYLE';
      strokeColor?: string;
      fillColor?:   string;
      strokeWidth?: number;
      opacity?:     number;
    };
