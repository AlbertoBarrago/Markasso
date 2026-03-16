import type { ElementType } from '../elements/element';

export type DrawableTool = Exclude<ElementType, 'image'>;
export type ActiveTool = 'select' | 'hand' | DrawableTool;
export type GridType   = 'dot' | 'line' | 'mm';

export interface AppState {
  readonly activeTool:  ActiveTool;
  readonly strokeColor: string;
  readonly fillColor:   string;
  readonly strokeWidth: number;
  readonly fontSize:    number;
  readonly fontFamily:  string;
  readonly opacity:     number;
  readonly roughness:   number;
  readonly gridVisible: boolean;
  readonly gridSize:    number;
  readonly gridType:    GridType;
  readonly strokeStyle: 'solid' | 'dashed' | 'dotted';
  /** Flag: text was just created, next drag should create marquee */
  readonly justCreatedText: boolean;
}

export function createAppState(): AppState {
  return {
    activeTool:  'select',
    strokeColor: '#e2e2ef',   // light stroke for dark canvas
    fillColor:   'transparent',
    strokeWidth: 1,
    fontSize:    20,
    fontFamily:  'Arial, sans-serif',
    opacity:     1,
    roughness:   0,
    gridVisible: false,
    gridSize:    20,
    gridType:    'dot',
    strokeStyle: 'solid',
    justCreatedText: false,
  };
}
