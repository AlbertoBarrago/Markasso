import type { Command } from '../../src/commands/commands';
import { type LayoutDirection, layeredLayout } from '../../src/core/layout';
import type {
  ArrowHeadStyle,
  ConnectorRouting,
  Element,
  LineElement,
  ShapeKind,
  StencilElement,
} from '../../src/elements/element';
import { SHAPE_KINDS } from '../../src/elements/element';
import { DEFAULT_LABEL_FONT_FAMILY } from '../../src/elements/label_defaults';
import {
  getBundledIcon,
  isBundledPack,
  loadBundledPack,
} from '../../src/elements/stencils/packs';
import {
  createStencil,
  genericIconIdOf,
  isValidStencilRef,
} from '../../src/elements/stencils/registry';
import { History } from '../../src/engine/history';
import { validateElements } from '../../src/io/element_validation';
import {
  getConnectorBox,
  getElementBounds,
} from '../../src/rendering/draw_selection';

import { type Size, sizeForLabel, sizeForText } from './sizing';

/**
 * Agent-facing model of one Markasso diagram. Agents address nodes by short
 * readable keys ("api", "orders-db") instead of ids and coordinates; every
 * change goes through the app's own History and reducer, so the result is
 * exactly what the app would produce, undo works, and a live session can
 * forward the same commands to the room (see live.ts).
 */

/** Node kinds an agent can create. Flowchart symbols use their own names. */
export const BASIC_NODE_KINDS = [
  'rectangle',
  'ellipse',
  'rhombus',
  'text',
  'icon',
] as const;

export type NodeKind = (typeof BASIC_NODE_KINDS)[number] | ShapeKind;

export const NODE_KINDS: ReadonlyArray<NodeKind> = [
  ...BASIC_NODE_KINDS,
  ...SHAPE_KINDS,
];

/** Named colors, so models don't have to invent hex values. */
export const NODE_COLORS = {
  default: { stroke: '#e2e2ef', fill: 'transparent' },
  blue: { stroke: '#4d96ff', fill: 'rgba(77,150,255,0.18)' },
  green: { stroke: '#6bcb77', fill: 'rgba(107,203,119,0.18)' },
  red: { stroke: '#ff6b6b', fill: 'rgba(255,107,107,0.18)' },
  purple: { stroke: '#c77dff', fill: 'rgba(199,125,255,0.18)' },
  yellow: { stroke: '#ffd43b', fill: 'rgba(255,212,59,0.18)' },
  gray: { stroke: '#9a9aa8', fill: 'rgba(154,154,168,0.15)' },
} as const;

export type NodeColor = keyof typeof NODE_COLORS;

export interface NodeSpec {
  readonly key: string;
  readonly label?: string;
  readonly kind?: NodeKind;
  /** Icon reference for kind "icon": "generic/database", "k8s/pod" or "database". */
  readonly icon?: string;
  readonly color?: NodeColor;
  /** Text size in px: the content of a text node, the label of a shape or icon. */
  readonly fontSize?: number;
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
}

export interface EdgeSpec {
  readonly from: string;
  readonly to: string;
  readonly label?: string;
  readonly routing?: ConnectorRouting;
  /** Which ends get a head. Default "end". */
  readonly arrow?: 'none' | 'start' | 'end' | 'both';
  readonly startHead?: ArrowHeadStyle;
  readonly endHead?: ArrowHeadStyle;
  readonly dashed?: boolean;
  readonly color?: NodeColor;
  /** Label text size in px. */
  readonly fontSize?: number;
}

/**
 * A connection, by the short id diagram_read shows, or by its two node keys
 * (plus its label when several connections join the same nodes).
 */
export interface EdgeRef {
  readonly id?: string;
  readonly from?: string;
  readonly to?: string;
  readonly label?: string;
}

export interface EdgePatch {
  /** Empty string removes the label. */
  readonly label?: string;
  readonly routing?: ConnectorRouting;
  readonly arrow?: 'none' | 'start' | 'end' | 'both';
  readonly startHead?: ArrowHeadStyle;
  readonly endHead?: ArrowHeadStyle;
  readonly dashed?: boolean;
  readonly color?: NodeColor;
  /** Label text size in px. */
  readonly fontSize?: number;
}

/** Short id of a connection, as shown by diagram_read. */
export function edgeShortId(el: Element): string {
  return el.id.slice(0, 8);
}

export interface NodePatch {
  readonly label?: string;
  readonly color?: NodeColor;
  /** Text size in px: the content of a text node, the label of a shape or icon. */
  readonly fontSize?: number;
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
}

export class DiagramError extends Error {
  override name = 'DiagramError';
}

const DEFAULT_SIZES: Readonly<Record<string, { w: number; h: number }>> = {
  rectangle: { w: 160, h: 70 },
  ellipse: { w: 160, h: 70 },
  rhombus: { w: 160, h: 100 },
  icon: { w: 64, h: 64 },
  shape: { w: 160, h: 80 },
};

/** Gap used when placing new nodes before an explicit layout. */
const PLACEMENT_GAP = 60;
/** Size of a text node created without one. */
export const TEXT_FONT_SIZE = 20;

const BASE_STYLE = { strokeWidth: 2, opacity: 1, roughness: 0 } as const;

/** Lowercase, dash-separated, trimmed: "Orders DB" becomes "orders-db". */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function isConnector(
  el: Element,
): el is LineElement | Extract<Element, { type: 'arrow' }> {
  return el.type === 'line' || el.type === 'arrow';
}

/** Elements an agent treats as nodes (everything that is not a connector). */
function isNode(el: Element): boolean {
  return !isConnector(el) && el.type !== 'freehand' && el.type !== 'curve';
}

export function elementLabel(el: Element): string {
  if (el.type === 'text') return el.content;
  return 'label' in el && el.label ? el.label : '';
}

export class Diagram {
  readonly history: History;
  /** Keys given by the agent; other elements get derived keys on read. */
  private readonly keys = new Map<string, string>();
  /** Nodes created without width/height: they follow their label's size. */
  private readonly autoSized = new Set<string>();

  constructor(elements: ReadonlyArray<Element> = []) {
    this.history = new History();
    if (elements.length > 0) {
      this.history.dispatch({
        type: 'LOAD_SCENE',
        elements: [...elements],
        viewport: this.history.present.viewport,
      });
    }
  }

  get elements(): ReadonlyArray<Element> {
    return this.history.present.elements;
  }

  /**
   * Key of every node: the agent's own key when it created the node, else
   * a slug of its label (or "<type>-<id prefix>"), deduplicated. Stable for
   * a given scene, so a model can re-read and keep addressing nodes.
   */
  nodeKeys(): Map<string, string> {
    const byId = new Map<string, string>();
    const taken = new Set<string>();
    for (const [key, id] of this.keys) {
      if (this.elements.some((el) => el.id === id)) {
        byId.set(id, key);
        taken.add(key);
      }
    }
    for (const el of this.elements) {
      if (!isNode(el) || byId.has(el.id)) continue;
      const base =
        slugify(elementLabel(el)) || `${el.type}-${el.id.slice(0, 4)}`;
      let key = base;
      for (let i = 2; taken.has(key); i++) key = `${base}-${i}`;
      taken.add(key);
      byId.set(el.id, key);
    }
    return byId;
  }

  private idOf(key: string): string {
    const known = this.keys.get(key);
    if (known && this.elements.some((el) => el.id === known)) return known;
    for (const [id, k] of this.nodeKeys()) if (k === key) return id;
    throw new DiagramError(
      `Unknown node "${key}". Call diagram_read to see the keys.`,
    );
  }

  private dispatch(command: Command): void {
    this.history.dispatch(command);
  }

  /** Bottom-left of the current content, where new nodes start a row. */
  private nextRowOrigin(): { x: number; y: number } {
    const nodes = this.elements.filter(isNode);
    if (nodes.length === 0) return { x: 0, y: 0 };
    let minX = Infinity;
    let maxY = -Infinity;
    for (const el of nodes) {
      const b = getConnectorBox(el);
      minX = Math.min(minX, b.x);
      maxY = Math.max(maxY, b.y + b.h);
    }
    return { x: minX, y: maxY + PLACEMENT_GAP * 2 };
  }

  /** Creates nodes in one undoable step. Returns their keys. */
  async addNodes(specs: ReadonlyArray<NodeSpec>): Promise<string[]> {
    const existing = new Set(this.nodeKeys().values());
    const seen = new Set<string>();
    for (const spec of specs) {
      const key = slugify(spec.key) || spec.key;
      if (existing.has(key) || seen.has(key)) {
        throw new DiagramError(`Node key "${key}" is already used.`);
      }
      seen.add(key);
    }

    const origin = this.nextRowOrigin();
    let cursorX = origin.x;
    const created: Element[] = [];
    const keys: string[] = [];
    for (const spec of specs) {
      const key = slugify(spec.key) || spec.key;
      const el = await this.buildNode(spec, cursorX, origin.y);
      const b = getConnectorBox(el);
      cursorX = b.x + b.w + PLACEMENT_GAP;
      created.push(el);
      keys.push(key);
    }
    const valid = validateElements(created);
    if (!valid || valid.length !== created.length) {
      throw new DiagramError(
        'Some nodes are invalid (check sizes and icon references).',
      );
    }
    this.dispatch({ type: 'CREATE_ELEMENTS', elements: created });
    created.forEach((el, i) => {
      this.keys.set(keys[i]!, el.id);
      const spec = specs[i]!;
      if (spec.width === undefined && spec.height === undefined)
        this.autoSized.add(el.id);
    });
    return keys;
  }

  private async buildNode(
    spec: NodeSpec,
    fallbackX: number,
    fallbackY: number,
  ): Promise<Element> {
    const kind: NodeKind = spec.kind ?? (spec.icon ? 'icon' : 'rectangle');
    const palette = NODE_COLORS[spec.color ?? 'default'];
    const label = spec.label ?? spec.key;
    const id = crypto.randomUUID();
    const x = spec.x ?? fallbackX;
    const y = spec.y ?? fallbackY;
    const style = {
      ...BASE_STYLE,
      strokeColor: palette.stroke,
      fillColor: palette.fill,
    };

    if (kind === 'icon') {
      const ref = await resolveIconRef(spec.icon ?? label);
      const size = DEFAULT_SIZES.icon!;
      const w = spec.width ?? size.w;
      const h = spec.height ?? size.h;
      const stencil: StencilElement = createStencil(
        id,
        { kind: 'builtin', ref },
        x + w / 2,
        y + h / 2,
        style,
        label,
      );
      return {
        ...stencil,
        width: w,
        height: h,
        x,
        y,
        ...(spec.fontSize !== undefined && { labelFontSize: spec.fontSize }),
      };
    }

    if (kind === 'text') {
      const fontSize = spec.fontSize ?? TEXT_FONT_SIZE;
      const size = sizeForText(label, fontSize);
      return {
        ...style,
        id,
        type: 'text',
        x,
        y,
        content: label,
        fontSize,
        fontFamily: DEFAULT_LABEL_FONT_FAMILY,
        width: spec.width ?? size.w,
        height: spec.height ?? size.h,
      };
    }

    const sizeKey = (SHAPE_KINDS as readonly string[]).includes(kind)
      ? 'shape'
      : kind;
    const defaults = DEFAULT_SIZES[sizeKey] ?? DEFAULT_SIZES.rectangle!;
    const size = labelSize(kind, label, defaults, spec.fontSize);
    const box = {
      x,
      y,
      width: spec.width ?? size.w,
      height: spec.height ?? size.h,
      ...(spec.fontSize !== undefined && { labelFontSize: spec.fontSize }),
    };
    if (kind === 'rectangle' || kind === 'ellipse' || kind === 'rhombus') {
      return {
        ...style,
        ...box,
        id,
        type: kind,
        label,
        ...(kind === 'rectangle' && { cornerRadius: 8 }),
      };
    }
    return { ...style, ...box, id, type: 'shape', kind, label };
  }

  /** Connects nodes in one undoable step. */
  connect(specs: ReadonlyArray<EdgeSpec>): number {
    const created: Element[] = specs.map((spec) => {
      const fromId = this.idOf(spec.from);
      const toId = this.idOf(spec.to);
      const from = this.elements.find((el) => el.id === fromId)!;
      const to = this.elements.find((el) => el.id === toId)!;
      const a = getElementBounds(from);
      const b = getElementBounds(to);
      const palette = NODE_COLORS[spec.color ?? 'default'];
      const line: LineElement = {
        ...BASE_STYLE,
        id: crypto.randomUUID(),
        type: 'line',
        // Ends float on both shapes; the renderer resolves the border points.
        x: a.x + a.w / 2,
        y: a.y + a.h / 2,
        x2: b.x + b.w / 2,
        y2: b.y + b.h / 2,
        strokeColor: palette.stroke,
        fillColor: 'transparent',
        startElementId: fromId,
        endElementId: toId,
        arrowHead: spec.arrow ?? 'end',
        routing: spec.routing ?? 'straight',
        ...(spec.dashed && { strokeStyle: 'dashed' as const }),
        ...(spec.startHead && { startHeadStyle: spec.startHead }),
        ...(spec.endHead && { endHeadStyle: spec.endHead }),
        ...(spec.label && { label: spec.label }),
        ...(spec.fontSize !== undefined && { labelFontSize: spec.fontSize }),
      };
      return line;
    });
    if (created.length === 0) return 0;
    this.dispatch({ type: 'CREATE_ELEMENTS', elements: created });
    return created.length;
  }

  update(key: string, patch: NodePatch): void {
    const id = this.idOf(key);
    const el = this.elements.find((e) => e.id === id)!;
    if (patch.label !== undefined) {
      this.dispatch(
        el.type === 'text'
          ? { type: 'EDIT_TEXT', id, content: patch.label }
          : { type: 'UPDATE_ELEMENT', id, props: { label: patch.label } },
      );
    }
    if (patch.fontSize !== undefined) {
      this.dispatch({
        type: 'UPDATE_ELEMENT',
        id,
        props:
          el.type === 'text'
            ? { fontSize: patch.fontSize }
            : { labelFontSize: patch.fontSize },
      });
    }
    // Auto-sized nodes follow their new label and font unless a size is given.
    if (
      (patch.label !== undefined || patch.fontSize !== undefined) &&
      this.autoSized.has(id) &&
      patch.width === undefined &&
      patch.height === undefined
    ) {
      const current = this.elements.find((e) => e.id === id)!;
      const size = autoSizeOf(current);
      if (size)
        this.dispatch({
          type: 'RESIZE_ELEMENT',
          id,
          width: size.w,
          height: size.h,
        });
    }
    if (patch.color !== undefined) {
      const palette = NODE_COLORS[patch.color];
      this.dispatch({
        type: 'APPLY_STYLE',
        ids: [id],
        strokeColor: palette.stroke,
        fillColor: palette.fill,
      });
    }
    if (patch.x !== undefined || patch.y !== undefined) {
      const b = getElementBounds(el);
      this.dispatch({
        type: 'MOVE_ELEMENT',
        id,
        dx: (patch.x ?? b.x) - b.x,
        dy: (patch.y ?? b.y) - b.y,
      });
    }
    if (patch.width !== undefined || patch.height !== undefined) {
      this.autoSized.delete(id);
      this.dispatch({
        type: 'RESIZE_ELEMENT',
        id,
        ...(patch.width !== undefined && { width: patch.width }),
        ...(patch.height !== undefined && { height: patch.height }),
      });
    }
  }

  /** Connector matching the reference; throws when none or several match. */
  private edgeOf(
    ref: EdgeRef,
  ): LineElement | Extract<Element, { type: 'arrow' }> {
    const connectors = this.elements.filter(isConnector);
    let matches: typeof connectors;
    if (ref.id) {
      matches = connectors.filter((el) => el.id.startsWith(ref.id!));
    } else if (ref.from && ref.to) {
      const fromId = this.idOf(ref.from);
      const toId = this.idOf(ref.to);
      matches = connectors.filter(
        (el) =>
          el.startElementId === fromId &&
          el.endElementId === toId &&
          (ref.label === undefined || (el.label ?? '') === ref.label),
      );
    } else {
      throw new DiagramError('Give a connection id, or both from and to.');
    }
    const what = ref.id ?? `${ref.from} -> ${ref.to}`;
    if (matches.length === 0)
      throw new DiagramError(
        `No connection ${what}. Call diagram_read to see them.`,
      );
    if (matches.length > 1)
      throw new DiagramError(
        `Several connections match ${what}: use their ids (${matches.map(edgeShortId).join(', ')}).`,
      );
    return matches[0]!;
  }

  /** Removes connections in one undoable step. */
  disconnect(refs: ReadonlyArray<EdgeRef>): number {
    const ids = [...new Set(refs.map((ref) => this.edgeOf(ref).id))];
    if (ids.length > 0) this.dispatch({ type: 'DELETE_ELEMENTS', ids });
    return ids.length;
  }

  /** Changes a connection's label, routing, heads, dash or color in one step. */
  updateEdge(ref: EdgeRef, patch: EdgePatch): void {
    const el = this.edgeOf(ref);
    const set: Record<string, unknown> = {};
    const unset: string[] = [];
    if (patch.label !== undefined) {
      if (patch.label) set.label = patch.label;
      else unset.push('label');
    }
    if (patch.routing !== undefined) set.routing = patch.routing;
    if (patch.dashed !== undefined) {
      if (patch.dashed) set.strokeStyle = 'dashed';
      else unset.push('strokeStyle');
    }
    if (patch.color !== undefined)
      set.strokeColor = NODE_COLORS[patch.color].stroke;
    if (patch.startHead !== undefined) set.startHeadStyle = patch.startHead;
    if (patch.endHead !== undefined) set.endHeadStyle = patch.endHead;
    if (patch.fontSize !== undefined) set.labelFontSize = patch.fontSize;
    if (patch.arrow !== undefined) {
      if (el.type !== 'line')
        throw new DiagramError(
          'This connection is a plain arrow: its heads are fixed.',
        );
      set.arrowHead = patch.arrow;
    }
    if (Object.keys(set).length === 0 && unset.length === 0) return;
    this.dispatch({
      type: 'PATCH_ELEMENTS',
      update: [
        {
          id: el.id,
          set: set as Partial<Element>,
          ...(unset.length > 0 && { unset }),
        },
      ],
    });
  }

  /** Removes nodes; their connectors go with them. */
  remove(keys: ReadonlyArray<string>): number {
    const ids = keys.map((k) => this.idOf(k));
    this.dispatch({ type: 'DELETE_ELEMENTS', ids });
    for (const [key, id] of this.keys)
      if (ids.includes(id)) this.keys.delete(key);
    return ids.length;
  }

  /** Moves nodes to new top-left positions in one undoable step. */
  moveNodes(positions: ReadonlyMap<string, { x: number; y: number }>): void {
    const moves = [...positions].map(([id, p]) => {
      const el = this.elements.find((e) => e.id === id)!;
      const b = getConnectorBox(el);
      // ALIGN_ELEMENTS sets el.x/el.y; convert from the box layout used
      // (icon labels included).
      return { id, x: el.x + (p.x - b.x), y: el.y + (p.y - b.y) };
    });
    if (moves.length > 0) this.dispatch({ type: 'ALIGN_ELEMENTS', moves });
  }

  /**
   * Arranges nodes in layers following their connections (all nodes, or
   * only `keys`) in one undoable step. Returns how many nodes moved.
   */
  layout(direction: LayoutDirection, keys?: ReadonlyArray<string>): number {
    const nodeKeys = this.nodeKeys();
    const wanted = keys ? new Set(keys) : null;
    const nodes = this.elements.filter((el) => {
      const key = nodeKeys.get(el.id);
      return key !== undefined && (!wanted || wanted.has(key));
    });
    if (nodes.length === 0) return 0;
    const ids = new Set(nodes.map((el) => el.id));
    const boxes = new Map(nodes.map((el) => [el.id, getConnectorBox(el)]));
    const edges = this.elements.flatMap((el) =>
      isConnector(el) &&
      el.startElementId &&
      el.endElementId &&
      ids.has(el.startElementId) &&
      ids.has(el.endElementId)
        ? [{ from: el.startElementId, to: el.endElementId }]
        : [],
    );
    const origin = {
      x: Math.min(...[...boxes.values()].map((b) => b.x)),
      y: Math.min(...[...boxes.values()].map((b) => b.y)),
    };
    const positions = layeredLayout(
      nodes.map((el) => {
        const b = boxes.get(el.id)!;
        return { id: el.id, width: b.w, height: b.h };
      }),
      edges,
      { direction, origin },
    );
    this.moveNodes(positions);
    return positions.size;
  }

  /** Bundled icon packs used by the scene, loaded so export can embed them. */
  async loadUsedIconPacks(): Promise<void> {
    const packs = new Set<string>();
    for (const el of this.elements) {
      if (el.type === 'stencil' && el.source.kind === 'builtin') {
        const pack = el.source.ref.split('/')[0] ?? '';
        if (isBundledPack(pack)) packs.add(pack);
      }
    }
    await Promise.all([...packs].map((p) => loadBundledPack(p)));
  }
}

/** Size a labeled node of this kind takes when created without one. */
function labelSize(
  kind: NodeKind,
  label: string,
  defaults: Size,
  fontSize?: number,
): Size {
  if (kind === 'text' || kind === 'icon') return defaults;
  return label ? sizeForLabel(kind, label, defaults, fontSize) : defaults;
}

/** New auto size of an existing node after its label or font changes. */
function autoSizeOf(el: Element): Size | null {
  switch (el.type) {
    case 'text':
      return sizeForText(el.content, el.fontSize);
    case 'rectangle':
    case 'ellipse':
    case 'rhombus':
      return labelSize(
        el.type,
        el.label ?? '',
        DEFAULT_SIZES[el.type]!,
        el.labelFontSize,
      );
    case 'shape':
      return labelSize(
        el.kind,
        el.label ?? '',
        DEFAULT_SIZES.shape!,
        el.labelFontSize,
      );
    default:
      return null;
  }
}

/**
 * Accepts "generic/database", "k8s/pod" or a bare name ("database", "pod"):
 * bare names are looked up in the generic set first, then in bundled packs.
 */
export async function resolveIconRef(input: string): Promise<string> {
  const raw = input.trim();
  if (raw.includes('/')) {
    if (!isValidStencilRef(raw))
      throw new DiagramError(`Invalid icon reference "${raw}".`);
    const [pack] = raw.split('/');
    if (pack === 'generic' && !genericIconIdOf(raw)) {
      throw new DiagramError(`Unknown icon "${raw}". Use icons_search.`);
    }
    if (pack && isBundledPack(pack)) {
      await loadBundledPack(pack);
      if (!getBundledIcon(raw))
        throw new DiagramError(`Unknown icon "${raw}". Use icons_search.`);
    }
    return raw;
  }
  const generic = `generic/${raw}`;
  if (genericIconIdOf(generic)) return generic;
  const k8s = await loadBundledPack('k8s');
  const match = k8s.find(
    (icon) =>
      icon.id === raw.toLowerCase() ||
      icon.label.toLowerCase() === raw.toLowerCase(),
  );
  if (match) return `k8s/${match.id}`;
  throw new DiagramError(`Unknown icon "${raw}". Use icons_search.`);
}
