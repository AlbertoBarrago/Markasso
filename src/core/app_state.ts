import type { ElementType } from '../elements/element';

export type ActiveTool = 'select' | ElementType;
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
}

export function createAppState(): AppState {
  return {
    activeTool:  'select',
    strokeColor: '#e2e2ef',   // light stroke for dark canvas
    fillColor:   'transparent',
    strokeWidth: 2,
    fontSize:    20,
    fontFamily:  'Virgil, cursive',
    opacity:     1,
    roughness:   1,
    gridVisible: true,
    gridSize:    20,
    gridType:    'dot',
  };
}
