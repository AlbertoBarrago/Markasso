export type ElementType =
  | 'rectangle'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'freehand'
  | 'text';

export interface BaseElement {
  readonly id: string;
  readonly type: ElementType;
  readonly x: number;
  readonly y: number;
  readonly strokeColor: string;
  readonly fillColor: string;
  readonly strokeWidth: number;
  readonly opacity: number;
  readonly roughness: number;
  readonly rotation?: number;
}

export interface RectangleElement extends BaseElement {
  readonly type: 'rectangle';
  readonly width: number;
  readonly height: number;
  readonly label?: string;
  readonly labelFontSize?: number;
  readonly labelFontFamily?: string;
}

export interface EllipseElement extends BaseElement {
  readonly type: 'ellipse';
  readonly width: number;
  readonly height: number;
  readonly label?: string;
  readonly labelFontSize?: number;
  readonly labelFontFamily?: string;
}

export interface LineElement extends BaseElement {
  readonly type: 'line';
  readonly x2: number;
  readonly y2: number;
}

export interface ArrowElement extends BaseElement {
  readonly type: 'arrow';
  readonly x2: number;
  readonly y2: number;
}

export interface FreehandElement extends BaseElement {
  readonly type: 'freehand';
  readonly points: ReadonlyArray<readonly [number, number]>;
}

export interface TextElement extends BaseElement {
  readonly type: 'text';
  readonly content: string;
  readonly fontSize: number;
  readonly fontFamily: string;
  readonly width: number;
  readonly height: number;
}

export type Element =
  | RectangleElement
  | EllipseElement
  | LineElement
  | ArrowElement
  | FreehandElement
  | TextElement;

