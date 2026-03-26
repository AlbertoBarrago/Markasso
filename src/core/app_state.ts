import type { ElementType } from '../elements/element';

export type DrawableTool = Exclude<ElementType, 'image' | 'rhombus'>;
export type ActiveTool = 'select' | 'hand' | 'eraser' | DrawableTool | 'rombo';
export type GridType   = 'dot' | 'line' | 'mm';

export interface AppState {
  readonly activeTool:  ActiveTool;
  readonly strokeColor: string;
  readonly fillColor:   string;
  readonly strokeWidth: number;
  readonly fontSize:    number;
  readonly fontFamily:  string;
  readonly textAlign:   'left' | 'center' | 'right';
  readonly textMode:    'text' | 'code';
  readonly opacity:     number;
  readonly roughness:   number;
  readonly gridVisible: boolean;
  readonly gridSize:    number;
  readonly gridType:    GridType;
  readonly strokeStyle: 'solid' | 'dashed' | 'dotted';
  readonly justCreatedText: boolean;
  readonly toolLocked: boolean;
}

export function createAppState(): AppState {
  const resolvedTheme = typeof document !== 'undefined'
    ? document.documentElement.getAttribute('data-theme')
    : null;
  const defaultStrokeColor = resolvedTheme === 'light' ? '#000000' : '#e2e2ef';

  const isMobile = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

  return {
    activeTool:  'select',
    strokeColor: defaultStrokeColor,
    fillColor:   'transparent',
    strokeWidth: isMobile ? 4 : 1,
    fontSize:    20,
    fontFamily:  'Arial, sans-serif',
    textAlign:   'left',
    textMode:    'text',
    opacity:     1,
    roughness:   0,
    gridVisible: false,
    gridSize:    20,
    gridType:    'dot',
    strokeStyle: 'solid',
    justCreatedText: false,
    toolLocked: false,
  };
}
