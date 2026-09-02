import type { ActiveTool, GridType } from '../core/app_state';
import type { Viewport } from '../core/viewport';
import type { Element } from '../elements/element';

export type Command =
  | { type: 'CREATE_ELEMENT'; element: Element; select?: boolean }
  | { type: 'CREATE_ELEMENTS'; elements: Element[] }
  | { type: 'UPDATE_ELEMENT'; id: string; props: Partial<Element> }
  | { type: 'MOVE_ELEMENT'; id: string; dx: number; dy: number }
  | { type: 'MOVE_ELEMENTS'; ids: string[]; dx: number; dy: number }
  | {
      type: 'RESIZE_ELEMENT';
      id: string;
      x?: number;
      y?: number;
      width?: number;
      height?: number;
      x2?: number;
      y2?: number;
      cx?: number;
      cy?: number;
      fontSize?: number;
      points?: ReadonlyArray<readonly [number, number]>;
      startElementId?: string | null;
      endElementId?: string | null;
    }
  | { type: 'DELETE_ELEMENTS'; ids: string[] }
  | { type: 'EDIT_TEXT'; id: string; content: string }
  | {
      type: 'SET_SHAPE_LABEL';
      id: string;
      label: string;
      labelFontSize: number;
      labelFontFamily: string;
    }
  | { type: 'SELECT_ELEMENTS'; ids: string[] }
  | { type: 'CLEAR_SELECTION' }
  | { type: 'PAN_VIEWPORT'; dx: number; dy: number }
  | { type: 'ZOOM_VIEWPORT'; factor: number; originX: number; originY: number }
  | { type: 'SET_VIEWPORT'; offsetX: number; offsetY: number; zoom: number }
  | { type: 'SET_TOOL'; tool: ActiveTool; keepSelection?: boolean }
  | { type: 'SET_STROKE_COLOR'; color: string } // appState only (default for next shape)
  | { type: 'SET_FILL_COLOR'; color: string } // appState only
  | { type: 'SET_STROKE_WIDTH'; width: number } // appState only
  | { type: 'SET_FONT_FAMILY'; family: string } // appState + selected text
  | { type: 'SET_FONT_SIZE'; size: number; width?: number; height?: number } // appState + selected text
  | { type: 'TOGGLE_GRID' }
  | { type: 'SET_GRID_TYPE'; gridType: GridType }
  | { type: 'SET_ROTATION'; id: string; rotation: number }
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
  | { type: 'SET_TEXT_MODE'; mode: 'text' | 'code' }
  /** Aligns selected elements spatially. Positions are pre-computed by the caller. Undoable. */
  | {
      type: 'ALIGN_ELEMENTS';
      moves: Array<{ id: string; x: number; y: number }>;
    }
  /** Applies style to the given elements (or the local selection when `ids` is
   *  omitted) AND updates appState defaults. Undoable. `ids` is required for
   *  shared sessions so the command is deterministic on every client. */
  | {
      type: 'APPLY_STYLE';
      /** Target element ids. Omit to use the local selection (single-player). */
      ids?: string[];
      strokeColor?: string;
      fillColor?: string;
      labelColor?: string;
      strokeWidth?: number;
      opacity?: number;
      roughness?: number;
      strokeStyle?: 'solid' | 'dashed' | 'dotted';
      lineCap?: 'round' | 'butt' | 'square';
      lineJoin?: 'round' | 'miter' | 'bevel';
      shadowBlur?: number;
      shadowColor?: string;
      shadowOffsetX?: number;
      shadowOffsetY?: number;
      cornerRadius?: number;
      textAlign?: 'left' | 'center' | 'right';
      bold?: boolean;
      italic?: boolean;
      underline?: boolean;
      strikethrough?: boolean;
      arrowHead?: 'none' | 'start' | 'end' | 'both';
    };
