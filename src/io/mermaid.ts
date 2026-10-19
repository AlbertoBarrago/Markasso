import { fitToElements } from '../core/viewport';
import type {
  ArrowElement,
  Element,
  EllipseElement,
  ImageElement,
  LineElement,
  RectangleElement,
  RhombusElement,
  TextElement,
} from '../elements/element';
import type { History } from '../engine/history';
import { getCachedImage } from '../rendering/image_cache';

/*
 * Mermaid import is delegated to `@excalidraw/mermaid-to-excalidraw`, which
 * drives the official `mermaid` package for parsing and layout and returns
 * positioned "element skeletons". We tried a hand-rolled parser + layout
 * engine first; matching Mermaid's grammar and dagre layout is a project of
 * its own, so this module only maps skeletons onto native Markasso elements.
 *
 * The library (and mermaid with it, ~1-2 MB) is loaded lazily on the first
 * import so it never weighs on the initial bundle.
 */

// ── Skeleton types ─────────────────────────────────────────────────────────────

/*
 * Local mirror of the subset of Excalidraw's `ExcalidrawElementSkeleton` the
 * converter emits. The library's own typings point at `@excalidraw/excalidraw`,
 * which is not installed (and resolves to `any`), so we declare what we read.
 */

interface SkeletonLabel {
  readonly text?: string | null;
  readonly fontSize?: number;
  readonly verticalAlign?: string;
}

interface SkeletonBase {
  readonly id?: string;
  readonly x: number;
  readonly y: number;
  readonly width?: number;
  readonly height?: number;
  readonly strokeStyle?: string | null;
}

interface SkeletonContainer extends SkeletonBase {
  readonly type: 'rectangle' | 'ellipse' | 'diamond';
  readonly label?: SkeletonLabel;
  readonly roundness?: { readonly type: number } | null;
}

interface SkeletonLinear extends SkeletonBase {
  readonly type: 'arrow' | 'line';
  readonly points?: ReadonlyArray<readonly [number, number]>;
  readonly label?: SkeletonLabel;
  /** `undefined` on an arrow means Excalidraw's default end arrowhead; `null` means none. */
  readonly startArrowhead?: string | null;
  readonly endArrowhead?: string | null;
  readonly start?: { readonly id?: string };
  readonly end?: { readonly id?: string };
}

interface SkeletonText extends SkeletonBase {
  readonly type: 'text';
  readonly text: string;
  readonly fontSize?: number;
}

interface SkeletonImage extends SkeletonBase {
  readonly type: 'image';
  readonly fileId: string;
}

interface SkeletonFrame extends SkeletonBase {
  readonly type: 'frame';
  readonly name?: string | null;
}

export type MermaidSkeleton =
  | SkeletonContainer
  | SkeletonLinear
  | SkeletonText
  | SkeletonImage
  | SkeletonFrame;

/** Binary files referenced by image skeletons (the SVG fallback), keyed by fileId. */
export type MermaidFiles = Readonly<
  Record<string, { readonly dataURL: string } | undefined>
>;

// ── Constants ──────────────────────────────────────────────────────────────────

/** Font size handed to mermaid; node sizes in its layout are derived from it. */
const FONT_SIZE = 16;
const FONT_FAMILY = 'Arial, sans-serif';
const STROKE_WIDTH = 1.5;
const LINE_HEIGHT = 1.25;
/** Rough average glyph width relative to font size, for text without measured bounds. */
const GLYPH_WIDTH_RATIO = 0.6;
/** Minimum deviation (px) from the chord before an edge is rendered as a curve. */
const CURVE_MIN_DEVIATION = 8;
/** Max distance (px) between a connector endpoint and its bound node's box. */
const BINDING_TOLERANCE = 6;

// Reuse colors already present in the app's POPUP_COLORS palette for consistency
const MERMAID_COLORS = {
  dark: {
    rectangle: { fill: 'rgba(77,150,255,0.18)', stroke: '#4d96ff' },
    rhombus: { fill: 'rgba(255,107,107,0.18)', stroke: '#ff6b6b' },
    ellipse: { fill: 'rgba(107,203,119,0.18)', stroke: '#6bcb77' },
  },
  light: {
    rectangle: { fill: 'rgba(77,150,255,0.14)', stroke: '#1a6fd4' },
    rhombus: { fill: 'rgba(220,50,50,0.10)', stroke: '#c0392b' },
    ellipse: { fill: 'rgba(40,160,70,0.10)', stroke: '#27ae60' },
  },
} as const;

export interface MermaidTheme {
  readonly isDark: boolean;
  /** Color for text and connectors. */
  readonly strokeColor: string;
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function importMermaid(file: File, history: History): void {
  const reader = new FileReader();
  reader.onload = (ev) => {
    const raw = ev.target?.result as string;
    if (!raw) return;
    void importMermaidText(raw, history);
  };
  reader.readAsText(file);
}

/**
 * Parses Mermaid source with the real Mermaid engine and inserts the result as
 * a single group of native elements. Diagram types the converter cannot map
 * to shapes (gantt, pie, gitGraph, ...) arrive as one SVG image element.
 *
 * Resolves `true` when something was inserted; failures are reported to the
 * user via `alert` and resolve `false`.
 */
export async function importMermaidText(
  text: string,
  history: History,
): Promise<boolean> {
  const isDark =
    document.documentElement.getAttribute('data-theme') !== 'light';
  const theme: MermaidTheme = {
    isDark,
    strokeColor: isDark ? '#e2e2ef' : '#000000',
  };

  let result: { elements: unknown; files?: unknown };
  try {
    const { parseMermaidToExcalidraw } = await import(
      '@excalidraw/mermaid-to-excalidraw'
    );
    // The library spreads this into `mermaid.initialize`, so `theme` reaches
    // mermaid even though the library's narrower config type omits it.
    const config: Parameters<typeof parseMermaidToExcalidraw>[1] & {
      theme: string;
    } = {
      theme: isDark ? 'dark' : 'default',
      themeVariables: { fontSize: `${FONT_SIZE}px` },
    };
    result = await parseMermaidToExcalidraw(text, config);
  } catch (err) {
    console.error('[Markasso] Mermaid import error:', err);
    const reason = err instanceof Error ? `\n\n${err.message}` : '';
    alert(`Failed to parse the Mermaid diagram.${reason}`);
    return false;
  }

  const elements = skeletonsToElements(
    result.elements as ReadonlyArray<MermaidSkeleton>,
    (result.files ?? {}) as MermaidFiles,
    theme,
  );
  if (elements.length === 0) {
    alert('No elements could be created from this diagram.');
    return false;
  }
  await preloadImages(elements);
  dispatchElements(elements, history);
  return true;
}

/**
 * The renderer does not repaint when an image finishes loading, so the SVG
 * fallback is decoded into the shared cache before it is dispatched;
 * otherwise it would show the loading placeholder until the next repaint.
 */
async function preloadImages(elements: ReadonlyArray<Element>): Promise<void> {
  await Promise.all(
    elements.map(async (el) => {
      if (el.type !== 'image') return;
      try {
        await getCachedImage(el.src)?.decode();
      } catch (err) {
        // The renderer shows its own error placeholder for broken sources
        console.warn('[Markasso] Mermaid SVG fallback failed to decode:', err);
      }
    }),
  );
}

function dispatchElements(elements: Element[], history: History): void {
  history.dispatch({ type: 'CREATE_ELEMENTS', elements });
  if (elements.length > 1) {
    history.dispatch({
      type: 'GROUP_ELEMENTS',
      ids: elements.map((e) => e.id),
      groupId: crypto.randomUUID(),
    });
  }
  const vp = fitToElements(elements, window.innerWidth, window.innerHeight);
  history.dispatch({
    type: 'SET_VIEWPORT',
    offsetX: vp.offsetX,
    offsetY: vp.offsetY,
    zoom: vp.zoom,
  });
}

// ── Skeleton → Element mapping ─────────────────────────────────────────────────

/**
 * Exported for testing. Maps converter skeletons onto Markasso elements.
 *
 * Source colors are deliberately dropped in favor of the Markasso palette:
 * the converter hardcodes light-theme defaults (e.g. black labels) that would
 * be unreadable on the dark canvas. Skeleton ids (Mermaid node ids such as
 * `A`) are replaced with UUIDs so repeated imports never collide; connector
 * bindings are remapped accordingly. Shapes come first so connectors and
 * free text render on top.
 */
export function skeletonsToElements(
  skeletons: ReadonlyArray<MermaidSkeleton>,
  files: MermaidFiles,
  theme: MermaidTheme,
): Element[] {
  const idMap = new Map<string, string>();
  const newId = (sourceId?: string): string => {
    const id = crypto.randomUUID();
    if (sourceId) idMap.set(sourceId, id);
    return id;
  };

  const shapes: Element[] = [];
  const overlays: Element[] = [];

  // Pass 1: everything that can be a binding target, so pass 2 can resolve ids
  for (const sk of skeletons) {
    switch (sk.type) {
      case 'rectangle':
      case 'ellipse':
      case 'diamond': {
        const { shape, title } = mapContainer(sk, newId(sk.id), theme);
        shapes.push(shape);
        if (title) overlays.push(title);
        break;
      }
      case 'frame': {
        const { shape, title } = mapFrame(sk, newId(sk.id), theme);
        shapes.push(shape);
        if (title) overlays.push(title);
        break;
      }
      case 'image': {
        const image = mapImage(sk, files, newId(sk.id));
        if (image) shapes.push(image);
        break;
      }
      case 'text':
        overlays.push(
          makeText(sk.text, sk.x, sk.y, sk.fontSize ?? FONT_SIZE, theme, sk),
        );
        break;
      case 'arrow':
      case 'line':
        break;
    }
  }

  // Pass 2: connectors
  const boxes = new Map<string, Box>();
  for (const [sourceId, id] of idMap) {
    const el = shapes.find((e) => e.id === id);
    if (el && 'width' in el) {
      boxes.set(sourceId, { id, x: el.x, y: el.y, w: el.width, h: el.height });
    }
  }
  const connectors: Element[] = [];
  for (const sk of skeletons) {
    if (sk.type === 'arrow' || sk.type === 'line') {
      const connector = mapLinear(sk, boxes, theme);
      if (connector) connectors.push(connector);
    }
  }

  return [...shapes, ...connectors, ...overlays];
}

function hasSize(sk: SkeletonBase): sk is SkeletonBase & {
  width: number;
  height: number;
} {
  return (
    typeof sk.width === 'number' &&
    typeof sk.height === 'number' &&
    sk.width > 0 &&
    sk.height > 0
  );
}

function dashStyle(
  sk: SkeletonBase,
): { strokeStyle: 'dashed' | 'dotted' } | Record<string, never> {
  return sk.strokeStyle === 'dashed' || sk.strokeStyle === 'dotted'
    ? { strokeStyle: sk.strokeStyle }
    : {};
}

const BASE_STYLE = {
  strokeWidth: STROKE_WIDTH,
  opacity: 1,
  roughness: 0,
} as const;

/**
 * Containers labelled with `verticalAlign: 'top'` are flowchart subgraphs:
 * Markasso centers shape labels, which would land on top of the child nodes,
 * so the title becomes a separate text element pinned to the top edge and the
 * container itself stays unfilled.
 */
function mapContainer(
  sk: SkeletonContainer,
  id: string,
  theme: MermaidTheme,
): { shape: Element; title: TextElement | null } {
  const width = sk.width ?? 0;
  const height = sk.height ?? 0;
  const labelText = sk.label?.text?.trim() ?? '';
  const labelFontSize = sk.label?.fontSize ?? FONT_SIZE;
  const isGroup = sk.label?.verticalAlign === 'top';
  const palette = theme.isDark ? MERMAID_COLORS.dark : MERMAID_COLORS.light;

  const label =
    labelText && !isGroup
      ? { label: labelText, labelFontSize, labelColor: theme.strokeColor }
      : {};
  const title =
    labelText && isGroup
      ? makeText(labelText, sk.x + 8, sk.y + 6, labelFontSize, theme)
      : null;

  const common = {
    ...BASE_STYLE,
    ...dashStyle(sk),
    id,
    x: sk.x,
    y: sk.y,
    width,
    height,
    ...label,
  };

  switch (sk.type) {
    case 'ellipse': {
      const c = palette.ellipse;
      const shape: EllipseElement = {
        ...common,
        type: 'ellipse',
        strokeColor: c.stroke,
        fillColor: c.fill,
      };
      return { shape, title };
    }
    case 'diamond': {
      const c = palette.rhombus;
      const shape: RhombusElement = {
        ...common,
        type: 'rhombus',
        strokeColor: c.stroke,
        fillColor: c.fill,
      };
      return { shape, title };
    }
    case 'rectangle': {
      const c = palette.rectangle;
      const shape: RectangleElement = {
        ...common,
        type: 'rectangle',
        strokeColor: c.stroke,
        fillColor: isGroup ? 'transparent' : c.fill,
        ...(sk.roundness ? { cornerRadius: Math.min(16, height / 2) } : {}),
      };
      return { shape, title };
    }
  }
}

/** Class diagram namespaces arrive as frames: a dashed outline plus its name. */
function mapFrame(
  sk: SkeletonFrame,
  id: string,
  theme: MermaidTheme,
): { shape: RectangleElement; title: TextElement | null } {
  const palette = theme.isDark ? MERMAID_COLORS.dark : MERMAID_COLORS.light;
  const name = sk.name?.trim() ?? '';
  return {
    shape: {
      ...BASE_STYLE,
      id,
      type: 'rectangle',
      x: sk.x,
      y: sk.y,
      width: sk.width ?? 0,
      height: sk.height ?? 0,
      strokeColor: palette.rectangle.stroke,
      fillColor: 'transparent',
      strokeStyle: 'dashed',
    },
    title: name ? makeText(name, sk.x + 8, sk.y + 6, FONT_SIZE, theme) : null,
  };
}

function mapImage(
  sk: SkeletonImage,
  files: MermaidFiles,
  id: string,
): ImageElement | null {
  const file = files[sk.fileId];
  if (!file || !hasSize(sk)) return null;
  return {
    ...BASE_STYLE,
    id,
    type: 'image',
    x: sk.x,
    y: sk.y,
    width: sk.width,
    height: sk.height,
    naturalWidth: sk.width,
    naturalHeight: sk.height,
    src: file.dataURL,
    strokeColor: 'transparent',
    fillColor: 'transparent',
  };
}

function makeText(
  content: string,
  x: number,
  y: number,
  fontSize: number,
  theme: MermaidTheme,
  measured?: SkeletonBase,
): TextElement {
  const lines = content.split('\n');
  const longest = Math.max(...lines.map((l) => l.length));
  const size =
    measured && hasSize(measured)
      ? { width: measured.width, height: measured.height }
      : {
          width: Math.ceil(longest * fontSize * GLYPH_WIDTH_RATIO),
          height: Math.ceil(lines.length * fontSize * LINE_HEIGHT),
        };
  return {
    ...BASE_STYLE,
    id: crypto.randomUUID(),
    type: 'text',
    x,
    y,
    ...size,
    content,
    fontSize,
    fontFamily: FONT_FAMILY,
    strokeColor: theme.strokeColor,
    fillColor: 'transparent',
  };
}

interface Box {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * Resolves a skeleton binding to the remapped element id, but only when the
 * endpoint actually touches that node. Sequence messages are bound to the
 * actor box at the top while starting mid-lifeline: Excalidraw leaves such
 * arrows in place, whereas Markasso snaps bound endpoints onto the node's
 * border, which would collapse every message onto the actor header.
 */
function bindingFor(
  sourceId: string | undefined,
  px: number,
  py: number,
  boxes: ReadonlyMap<string, Box>,
): string | undefined {
  const box = sourceId ? boxes.get(sourceId) : undefined;
  if (!box) return undefined;
  const dx = Math.max(box.x - px, 0, px - (box.x + box.w));
  const dy = Math.max(box.y - py, 0, py - (box.y + box.h));
  return Math.hypot(dx, dy) <= BINDING_TOLERANCE ? box.id : undefined;
}

/**
 * Markasso connectors are straight or a single quadratic curve, while Mermaid
 * routes edges as polylines. Straight-ish paths keep a straight connector;
 * bent ones become a quadratic bezier passing through the path's midpoint
 * (control = 2·mid − chordMid, since B(0.5) = (P0 + 2C + P2) / 4).
 * Endpoints sit on node borders, which `resolveArrowEndpoints` preserves for
 * bound connectors, so the routing survives until a node is moved.
 */
function mapLinear(
  sk: SkeletonLinear,
  boxes: ReadonlyMap<string, Box>,
  theme: MermaidTheme,
): ArrowElement | LineElement | null {
  const pts = (
    sk.points && sk.points.length >= 2 ? sk.points : [[0, 0] as const]
  ).map(([px, py]) => [sk.x + px, sk.y + py] as const);
  if (pts.length < 2) {
    if (!hasSize(sk)) return null;
    pts.push([sk.x + sk.width, sk.y + sk.height]);
  }
  const [x1, y1] = pts[0]!;
  const [x2, y2] = pts[pts.length - 1]!;
  const control = curveControlPoint(pts);

  const startId = bindingFor(sk.start?.id, x1, y1, boxes);
  const endId = bindingFor(sk.end?.id, x2, y2, boxes);
  const labelText = sk.label?.text?.trim() ?? '';

  const common = {
    ...BASE_STYLE,
    ...dashStyle(sk),
    id: crypto.randomUUID(),
    x: x1,
    y: y1,
    x2,
    y2,
    strokeColor: theme.strokeColor,
    fillColor: 'transparent',
    ...(startId ? { startElementId: startId } : {}),
    ...(endId ? { endElementId: endId } : {}),
    ...(labelText
      ? {
          label: labelText,
          labelFontSize: Math.min(sk.label?.fontSize ?? FONT_SIZE, 14),
          labelColor: theme.strokeColor,
        }
      : {}),
  };

  const isArrow = sk.type === 'arrow';
  const headEnd = isArrow && sk.endArrowhead !== null;
  const headStart =
    isArrow && sk.startArrowhead !== null && sk.startArrowhead !== undefined;

  if (headEnd && !headStart && !control) {
    return { ...common, type: 'arrow' };
  }
  const arrowHead =
    headStart && headEnd
      ? 'both'
      : headStart
        ? 'start'
        : headEnd
          ? 'end'
          : undefined;
  return {
    ...common,
    type: 'line',
    ...(arrowHead ? { arrowHead } : {}),
    ...(control ? { cx: control[0], cy: control[1] } : {}),
  };
}

/**
 * Exported for testing. Returns the quadratic control point approximating a
 * polyline, or `null` when the path is close enough to its chord.
 */
export function curveControlPoint(
  pts: ReadonlyArray<readonly [number, number]>,
): readonly [number, number] | null {
  if (pts.length < 3) return null;
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;

  const segLengths: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const len = Math.hypot(
      pts[i]![0] - pts[i - 1]![0],
      pts[i]![1] - pts[i - 1]![1],
    );
    segLengths.push(len);
    total += len;
  }
  if (total === 0) return null;

  // Point at half the arc length
  let remaining = total / 2;
  let mid: readonly [number, number] = first;
  for (let i = 0; i < segLengths.length; i++) {
    const len = segLengths[i]!;
    if (remaining <= len) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      const t = len === 0 ? 0 : remaining / len;
      mid = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      break;
    }
    remaining -= len;
  }

  const chordMid = [
    (first[0] + last[0]) / 2,
    (first[1] + last[1]) / 2,
  ] as const;
  const chordLen = Math.hypot(last[0] - first[0], last[1] - first[1]);
  const deviation = Math.hypot(mid[0] - chordMid[0], mid[1] - chordMid[1]);
  if (deviation < Math.max(CURVE_MIN_DEVIATION, chordLen * 0.05)) return null;

  return [2 * mid[0] - chordMid[0], 2 * mid[1] - chordMid[1]];
}
