export type ElementType =
  | 'rectangle'
  | 'ellipse'
  | 'rhombus'
  | 'shape'
  | 'line'
  | 'arrow'
  | 'curve'
  | 'polygon'
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
  readonly lineCap?: 'round' | 'butt' | 'square';
  readonly lineJoin?: 'round' | 'miter' | 'bevel';
  readonly shadowBlur?: number;
  readonly shadowColor?: string;
  readonly shadowOffsetX?: number;
  readonly shadowOffsetY?: number;
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
  readonly labelColor?: string;
}

export interface EllipseElement extends BaseElement {
  readonly type: 'ellipse';
  readonly width: number;
  readonly height: number;
  readonly label?: string;
  readonly labelFontSize?: number;
  readonly labelFontFamily?: string;
  readonly labelColor?: string;
}

export interface RhombusElement extends BaseElement {
  readonly type: 'rhombus';
  readonly width: number;
  readonly height: number;
  readonly cornerRadius?: number;
  readonly label?: string;
  readonly labelFontSize?: number;
  readonly labelFontFamily?: string;
  readonly labelColor?: string;
}

/**
 * Flowchart symbols rendered by the `shape` element. Kept as a runtime list
 * (not just a type) so validation can check incoming data against it.
 */
export const SHAPE_KINDS = [
  'terminator',
  'data',
  'document',
  'database',
  'predefinedProcess',
  'preparation',
  'manualInput',
  'delay',
] as const;

export type ShapeKind = (typeof SHAPE_KINDS)[number];

/**
 * Parametric flowchart shape. Its outline is defined by the geometry
 * registry in `elements/shapes.ts`, so every kind shares bounds, connector
 * snapping, rendering and export code.
 */
export interface ShapeElement extends BaseElement {
  readonly type: 'shape';
  readonly kind: ShapeKind;
  readonly width: number;
  readonly height: number;
  readonly label?: string;
  readonly labelFontSize?: number;
  readonly labelFontFamily?: string;
  readonly labelColor?: string;
}

/**
 * Fixed attachment point of a connector end on its bound element, as a
 * fraction (0-1) of the element's un-rotated bounding box. When present the
 * end stays pinned to that point through moves, resizes and rotations;
 * when absent the end floats along the border to face the other end.
 */
export interface ConnectorAnchor {
  readonly x: number;
  readonly y: number;
}

/**
 * Arrowhead shapes. `open` is the classic two-stroke head; the others are
 * closed outlines, either hollow or filled with the stroke color (UML-style
 * inheritance, aggregation and composition heads, plus a hollow circle).
 */
export const ARROW_HEAD_STYLES = [
  'open',
  'triangle',
  'triangleFilled',
  'diamond',
  'diamondFilled',
  'circle',
] as const;

export type ArrowHeadStyle = (typeof ARROW_HEAD_STYLES)[number];

/** `elbow` draws an orthogonal route, recomputed from the two ends. */
export type ConnectorRouting = 'straight' | 'elbow';

export interface LineElement extends BaseElement {
  readonly type: 'line';
  readonly x2: number;
  readonly y2: number;
  readonly startElementId?: string;
  readonly endElementId?: string;
  readonly startAnchor?: ConnectorAnchor;
  readonly endAnchor?: ConnectorAnchor;
  readonly routing?: ConnectorRouting;
  /** Head drawn at each end; `open` when omitted. */
  readonly startHeadStyle?: ArrowHeadStyle;
  readonly endHeadStyle?: ArrowHeadStyle;
  /** Optional quadratic bezier control point — when set the line renders as a curve */
  readonly cx?: number;
  readonly cy?: number;
  /** Arrowhead placement — undefined / 'none' means plain line */
  readonly arrowHead?: 'none' | 'start' | 'end' | 'both';
  readonly label?: string;
  readonly labelFontSize?: number;
  readonly labelFontFamily?: string;
  readonly labelColor?: string;
}

export interface ArrowElement extends BaseElement {
  readonly type: 'arrow';
  readonly x2: number;
  readonly y2: number;
  readonly startElementId?: string;
  readonly endElementId?: string;
  readonly startAnchor?: ConnectorAnchor;
  readonly endAnchor?: ConnectorAnchor;
  readonly routing?: ConnectorRouting;
  /** Head drawn at each end; `open` when omitted. */
  readonly startHeadStyle?: ArrowHeadStyle;
  readonly endHeadStyle?: ArrowHeadStyle;
  readonly label?: string;
  readonly labelFontSize?: number;
  readonly labelFontFamily?: string;
  readonly labelColor?: string;
}

export interface CurveElement extends BaseElement {
  readonly type: 'curve';
  readonly x2: number;
  readonly y2: number;
  /** Quadratic bezier control point */
  readonly cx: number;
  readonly cy: number;
}

export interface PolygonElement extends BaseElement {
  readonly type: 'polygon';
  readonly points: ReadonlyArray<readonly [number, number]>;
  readonly closed: boolean;
}

export interface FreehandElement extends BaseElement {
  readonly type: 'freehand';
  readonly points: ReadonlyArray<readonly [number, number]>;
  /**
   * Per-point pressure values (0-1), driving the stroke's variable width.
   * From real hardware pressure for stylus input, or synthesized from
   * gesture speed otherwise (slower → thicker).
   */
  readonly pressures?: ReadonlyArray<number>;
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
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly underline?: boolean;
  readonly strikethrough?: boolean;
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
  | RhombusElement
  | ShapeElement
  | LineElement
  | ArrowElement
  | CurveElement
  | PolygonElement
  | FreehandElement
  | TextElement
  | ImageElement;
