export type ElementType =
  | 'rectangle'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'freehand'
  | 'text'
  | 'image';

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
  readonly strokeStyle?: 'solid' | 'dashed' | 'dotted';
  readonly visible?: boolean;
  readonly layerName?: string;
  readonly locked?: boolean;
  readonly groupId?: string;
}

export interface RectangleElement extends BaseElement {
  readonly type: 'rectangle';
  readonly width: number;
  readonly height: number;
  readonly cornerRadius?: number;
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
  readonly startElementId?: string;
  readonly endElementId?: string;
}

export interface ArrowElement extends BaseElement {
  readonly type: 'arrow';
  readonly x2: number;
  readonly y2: number;
  readonly startElementId?: string;
  readonly endElementId?: string;
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
  readonly textAlign?: 'left' | 'center' | 'right';
  readonly isCode?: boolean;
}

export interface ImageElement extends BaseElement {
  readonly type: 'image';
  readonly src: string;
  readonly width: number;
  readonly height: number;
  readonly naturalWidth: number;
  readonly naturalHeight: number;
}

export type Element =
  | RectangleElement
  | EllipseElement
  | LineElement
  | ArrowElement
  | FreehandElement
  | TextElement
  | ImageElement;
