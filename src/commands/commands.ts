import type { Element } from '../elements/element';
import type { ActiveTool, GridType } from '../core/app_state';
import type { Viewport } from '../core/viewport';

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
      startElementId?: string | null;
      endElementId?: string | null;
    }
  | { type: 'DELETE_ELEMENTS'; ids: string[] }
  | { type: 'EDIT_TEXT';       id: string; content: string }
  | { type: 'SET_SHAPE_LABEL'; id: string; label: string; labelFontSize: number; labelFontFamily: string }
  | { type: 'SELECT_ELEMENTS'; ids: string[] }
  | { type: 'CLEAR_SELECTION' }
  | { type: 'PAN_VIEWPORT';   dx: number; dy: number }
  | { type: 'ZOOM_VIEWPORT';  factor: number; originX: number; originY: number }
  | { type: 'SET_VIEWPORT';   offsetX: number; offsetY: number; zoom: number }
  | { type: 'SET_TOOL'; tool: ActiveTool; keepSelection?: boolean }
  | { type: 'SET_STROKE_COLOR'; color: string }   // appState only (default for next shape)
  | { type: 'SET_FILL_COLOR';   color: string }   // appState only
  | { type: 'SET_STROKE_WIDTH'; width: number }   // appState only
  | { type: 'SET_FONT_FAMILY';  family: string }  // appState + selected text
  | { type: 'SET_FONT_SIZE';    size: number }    // appState + selected text
  | { type: 'TOGGLE_GRID' }
  | { type: 'SET_GRID_TYPE';   gridType: GridType }
  | { type: 'SET_ROTATION';    id: string; rotation: number }
  | { type: 'SET_STROKE_STYLE'; style: 'solid' | 'dashed' | 'dotted' }
  | { type: 'REORDER_ELEMENTS'; ids: string[]; targetIndex: number }
  | { type: 'TOGGLE_ELEMENT_VISIBILITY'; id: string }
  | { type: 'RENAME_LAYER'; id: string; name: string }
  | { type: 'LOAD_SCENE'; elements: Element[]; viewport: Viewport }
  | { type: 'GROUP_ELEMENTS'; ids: string[]; groupId: string }
  | { type: 'UNGROUP_ELEMENTS'; groupId: string }
  | { type: 'LOCK_ELEMENTS'; ids: string[] }
  | { type: 'UNLOCK_ELEMENTS'; ids: string[] }
  | { type: 'CLEAR_JUST_CREATED_TEXT' }
  | { type: 'SET_JUST_CREATED_TEXT' }
  | { type: 'SET_TOOL_LOCK'; locked: boolean }
  /** Applies style to ALL selected elements AND updates appState defaults. Undoable. */
  | {
      type: 'APPLY_STYLE';
      strokeColor?:   string;
      fillColor?:     string;
      strokeWidth?:   number;
      opacity?:       number;
      roughness?:     number;
      strokeStyle?:   'solid' | 'dashed' | 'dotted';
      cornerRadius?:  number;
    };
