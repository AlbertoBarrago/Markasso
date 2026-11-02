/**
 * `tools` family: tool state machines driven by an event script, for the M2
 * tools (select, hand, rectangle, ellipse, rombo, text, pen) in tools.json,
 * and for the M3 tools in their own files: line.json (the line tool and
 * connector editing with the select tool) and text.json (text tool parity:
 * code mode, decorations, alignment, sticky notes, resize). Each case runs
 * the real tool class against a real History; the History calls the tool
 * makes (dispatch, beginDrag, endDrag, cancelDrag) are recorded per event,
 * together with the tool state the renderer reads (previews, marquee,
 * guides, hover, cursor). The encodings are in the family header.
 *
 * The text tool's DOM overlay is stubbed with a minimal fake document (see
 * `textareaStub` in the header). Behaviour that only a real browser layout
 * can produce (soft wrapping inside a textarea, real font measurement of the
 * mirror span) is not covered; code mode uses a fake scrollWidth (see
 * `TEXTAREA_STUB_M3`).
 */
import { vi } from 'vitest';
import type { Command } from '../../src/commands/commands';
import type { AppState } from '../../src/core/app_state';
import { measureTextWidth } from '../../src/core/text_metrics';
import { screenToWorld, type Viewport } from '../../src/core/viewport';
import type { Element } from '../../src/elements/element';
import { History } from '../../src/engine/history';
import { EllipseTool } from '../../src/tools/ellipse_tool';
import { EraserTool } from '../../src/tools/eraser_tool';
import { HandTool } from '../../src/tools/hand_tool';
import { LineTool } from '../../src/tools/line_tool';
import { PenTool } from '../../src/tools/pen_tool';
import { RectangleTool } from '../../src/tools/rectangle_tool';
import { RomboTool } from '../../src/tools/rombo_tool';
import { SelectTool } from '../../src/tools/select_tool';
import { StickyTool } from '../../src/tools/sticky_tool';
import { TextTool } from '../../src/tools/text_tool';
import type { Tool, ToolContext } from '../../src/tools/tool';
import { Family, type Json, prng } from './common';
import { makeScene, sample } from './samples';
import { encodeScene, SCENE_ENCODING, snapshot } from './scene_codec';

type ToolName =
  | 'select'
  | 'hand'
  | 'rectangle'
  | 'ellipse'
  | 'rombo'
  | 'text'
  | 'pen'
  | 'line'
  | 'sticky'
  | 'eraser';

/** Tools whose world coordinates canvas_view.ts snaps to the grid. */
const SNAP_TOOLS = new Set<ToolName>([
  'rectangle',
  'ellipse',
  'rombo',
  'text',
  'line',
]);

const ACTIVE_TOOL: Record<ToolName, AppState['activeTool']> = {
  select: 'select',
  hand: 'hand',
  rectangle: 'rectangle',
  ellipse: 'ellipse',
  rombo: 'rombo',
  text: 'text',
  pen: 'freehand',
  line: 'line',
  sticky: 'sticky',
  eraser: 'eraser',
};

export type ToolEvent =
  | {
      type: 'down' | 'move' | 'up';
      sx: number;
      sy: number;
      shift?: boolean;
      alt?: boolean;
      t?: number;
      pointerType?: string;
      pressure?: number;
    }
  | { type: 'key'; key: string; shift?: boolean }
  | { type: 'cancel' | 'deactivate' | 'blur' }
  | { type: 'textInput'; value: string }
  | { type: 'textKey'; key: string; shift?: boolean }
  | { type: 'textSelect'; start: number; end: number }
  | { type: 'editExisting'; id: string }
  | { type: 'leave' }
  | { type: 'prune'; t: number };

const TOOL_EVENT_ENCODING =
  'input {tool, scene, events}: tool is select | hand | rectangle | ellipse | rombo | text | pen; scene is the ' +
  'initial History scene (sceneEncoding; the grid is off unless a case turns it on). events are applied in order to one tool instance: ' +
  'down/move/up {sx, sy, wx, wy, shift?, alt?, t?, pointerType?, pressure?} call onMouseDown/Move/Up with a ' +
  'MouseEvent whose clientX/clientY are sx/sy (canvas at client origin 0,0, size 800x600), shiftKey/altKey ' +
  'from shift/alt (default false), timeStamp t (default 0), pointerType/pressure only when given; wx/wy are ' +
  'the world coordinates passed to the tool, computed as canvas_view.ts does: screenToWorld with the ' +
  'viewport of the History present at that moment, then rounded to the grid (Math.round(w / gridSize) * ' +
  'gridSize) when appState.gridVisible and the tool is rectangle, ellipse, rombo or text. key {key, shift?} ' +
  'calls onKeyDown. cancel / deactivate call onCancel / onDeactivate. Text overlay events: textInput {value} ' +
  'sets the open textarea value and fires its input listeners; textKey {key, shift?} fires its keydown ' +
  'listeners; blur fires its blur listeners; editExisting {id} calls TextTool.editExisting on that element ' +
  '(what a double click does). After every event pending timers run (setTimeout 0 in editExisting).';

const TOOL_OUTPUT_ENCODING =
  'output {steps, scene, canUndo, canRedo}: steps[i] belongs to events[i] and has calls (History calls made ' +
  'by the tool during the event, in order: {op: "dispatch", command} or {op: "beginDrag" | "endDrag" | ' +
  '"cancelDrag"}) and the tool state after the event: cursor (getCursor(wx, wy) for pointer events); ' +
  'select: marquee ([x1, y1, x2, y2] screen while marqueeActive, else null), alignGuides, hoveredId, ' +
  'activeGroupId, endpointSnapIndicator, endpointSnapElementId, endpointSnapAnchor; rectangle, ellipse, ' +
  'rombo, pen: preview (element or null); text: preview (getPreview()), editingId, textarea (null or ' +
  '{value, left, top, width, height, font, textAlign, padding} from the open overlay style). scene, canUndo, ' +
  'canRedo: the History after the last event. Element ids from crypto.randomUUID are stubbed per case as ' +
  '00000000-0000-4000-8000-000000000001, ...002, ... in call order.';

const TEXTAREA_STUB =
  'Fake document: createElement returns a plain element with a style object, value, listeners and no-op ' +
  'focus/select/remove. Layout of the fake, in CSS px (px(v) = parseFloat(v) or 0): a span (the width ' +
  'mirror) has offsetWidth 0, so widths come from the ported text metrics; a textarea has p = px(padding), ' +
  'offsetWidth = max(px(width), px(minWidth)) and offsetHeight = max(px(height), px(minHeight)), plus 2p each ' +
  'unless boxSizing is "border-box"; scrollHeight = lines * parseFloat(lineHeight) * px(font) + 2p, with ' +
  'lines = value.split("\\n").length (no soft wrapping) and px(font) the leading size of the font shorthand.';

const TOOL_EVENT_ENCODING_M3 =
  TOOL_EVENT_ENCODING.replace(
    'tool is select | hand | rectangle | ellipse | rombo | text | pen',
    'tool is select | line | text | sticky',
  ).replace(
    'when appState.gridVisible and the tool is rectangle, ellipse, rombo or text.',
    'when appState.gridVisible and the tool is rectangle, ellipse, rombo, text or line.',
  ) +
  ' textSelect {start, end} sets selectionStart / selectionEnd of the open textarea (where Tab inserts its ' +
  'two spaces in code mode). sticky: the StickyTool with onPlaced wired as canvas_view.ts does, to ' +
  'editExisting of a TextTool owned by the case; the text overlay events and editExisting then act on that ' +
  'TextTool.';

const TOOL_OUTPUT_ENCODING_M3 =
  TOOL_OUTPUT_ENCODING +
  ' line: preview (element or null), snapIndicator ({worldX, worldY} or null), snapElementId, snapAnchor ' +
  '({x, y} or null). sticky: editingId and textarea of its TextTool, in the text encoding (no preview).';

const TEXTAREA_STUB_M3 =
  TEXTAREA_STUB +
  ' scrollWidth = ceil(max over value.split("\\n") of measureTextWidth(line, px(font), family)) + 2p, with ' +
  'family the font shorthand after its leading "<size>px " (src/core/text_metrics, the ported tables).';

// ── Fake DOM for the text tool ────────────────────────────────────────────────

const px = (v: string | undefined): number => {
  const n = Number.parseFloat(v ?? '');
  return Number.isFinite(n) ? n : 0;
};

class FakeElement {
  readonly style: Record<string, string> = {};
  value = '';
  textContent = '';
  spellcheck = false;
  selectionStart = 0;
  selectionEnd = 0;
  removed = false;
  private readonly listeners = new Map<
    string,
    Array<{ fn: (e: unknown) => void; once: boolean }>
  >();

  constructor(readonly tagName: string) {}

  addEventListener(
    type: string,
    fn: (e: unknown) => void,
    opts?: { once?: boolean },
  ): void {
    const list = this.listeners.get(type) ?? [];
    list.push({ fn, once: opts?.once === true });
    this.listeners.set(type, list);
  }

  removeEventListener(type: string, fn: (e: unknown) => void): void {
    const list = this.listeners.get(type) ?? [];
    this.listeners.set(
      type,
      list.filter((l) => l.fn !== fn),
    );
  }

  fire(type: string, event: unknown): void {
    const list = [...(this.listeners.get(type) ?? [])];
    for (const l of list) {
      if (l.once) this.removeEventListener(type, l.fn);
      l.fn(event);
    }
  }

  focus(): void {}
  select(): void {}
  remove(): void {
    this.removed = true;
  }

  private get pad(): number {
    return this.style.boxSizing === 'border-box'
      ? 0
      : 2 * px(this.style.padding);
  }

  get offsetWidth(): number {
    if (this.tagName !== 'TEXTAREA') return 0;
    return Math.max(px(this.style.width), px(this.style.minWidth)) + this.pad;
  }

  get offsetHeight(): number {
    if (this.tagName !== 'TEXTAREA') return 0;
    return Math.max(px(this.style.height), px(this.style.minHeight)) + this.pad;
  }

  get scrollWidth(): number {
    const font = this.style.font ?? '';
    const family = font.slice(font.indexOf('px ') + 3);
    let width = 0;
    for (const line of this.value.split('\n')) {
      width = Math.max(width, measureTextWidth(line, px(font), family));
    }
    return Math.ceil(width) + 2 * px(this.style.padding);
  }

  get scrollHeight(): number {
    const lines = this.value.split('\n').length;
    return (
      lines * px(this.style.lineHeight) * px(this.style.font) +
      2 * px(this.style.padding)
    );
  }
}

class FakeDocument {
  readonly created: FakeElement[] = [];
  readonly body = { appendChild: () => {} };
  readonly documentElement = { getAttribute: () => null };

  createElement(tag: string): FakeElement {
    const el = new FakeElement(tag.toUpperCase());
    this.created.push(el);
    return el;
  }

  /** The most recent textarea still in the document. */
  openTextarea(): FakeElement | null {
    for (let i = this.created.length - 1; i >= 0; i--) {
      const el = this.created[i]!;
      if (el.tagName === 'TEXTAREA' && !el.removed) return el;
    }
    return null;
  }
}

// ── Driver ────────────────────────────────────────────────────────────────────

interface CaseSpec {
  readonly tool: ToolName;
  readonly elements?: ReadonlyArray<Element>;
  readonly selected?: ReadonlyArray<string>;
  readonly appState?: Partial<AppState>;
  readonly viewport?: Viewport;
  readonly events: ReadonlyArray<ToolEvent>;
}

function makeTool(name: ToolName): Tool {
  switch (name) {
    case 'select':
      return new SelectTool();
    case 'hand':
      return new HandTool();
    case 'rectangle':
      return new RectangleTool();
    case 'ellipse':
      return new EllipseTool();
    case 'rombo':
      return new RomboTool();
    case 'text':
      return new TextTool();
    case 'pen':
      return new PenTool();
    case 'line':
      return new LineTool();
    case 'sticky':
      return new StickyTool();
    case 'eraser':
      return new EraserTool();
  }
}

function textState(
  t: TextTool,
  doc: FakeDocument,
): { editingId: string | null; textarea: Json | null } {
  const ta = doc.openTextarea();
  return {
    editingId: t.editingId,
    textarea: ta
      ? {
          value: ta.value,
          left: ta.style.left,
          top: ta.style.top,
          width: ta.style.width,
          height: ta.style.height,
          font: ta.style.font,
          textAlign: ta.style.textAlign,
          padding: ta.style.padding,
        }
      : null,
  };
}

function toolState(
  name: ToolName,
  tool: Tool,
  doc: FakeDocument,
  companion: TextTool | null,
): Json {
  switch (name) {
    case 'select': {
      const t = tool as SelectTool;
      return {
        marquee: t.marqueeActive ? t.getMarquee() : null,
        alignGuides: snapshot(t.alignGuides),
        hoveredId: t.hoveredId,
        activeGroupId: t.activeGroupId,
        endpointSnapIndicator: snapshot(t.endpointSnapIndicator),
        endpointSnapElementId: t.endpointSnapElementId,
        endpointSnapAnchor: snapshot(t.endpointSnapAnchor),
      };
    }
    case 'rectangle':
    case 'ellipse':
    case 'rombo':
    case 'pen':
      return {
        preview: snapshot(
          (tool as RectangleTool | EllipseTool | RomboTool | PenTool).preview,
        ),
      };
    case 'text': {
      const t = tool as TextTool;
      return { preview: t.getPreview(), ...textState(t, doc) };
    }
    case 'hand':
      return {};
    case 'line': {
      const t = tool as LineTool;
      return {
        preview: snapshot(t.preview),
        snapIndicator: snapshot(t.snapIndicator),
        snapElementId: t.snapElementId,
        snapAnchor: snapshot(t.snapAnchor),
      };
    }
    case 'sticky':
      return textState(companion!, doc);
    case 'eraser': {
      const t = tool as EraserTool;
      return { hoveredId: t.hoveredId, slashTrail: snapshot(t.slashTrail) };
    }
  }
}

function runCase(spec: CaseSpec): { input: Json; output: Json } {
  const doc = new FakeDocument();
  const g = globalThis as unknown as Record<string, unknown>;
  const savedDocument = Object.getOwnPropertyDescriptor(g, 'document');
  let uuid = 0;
  const uuidSpy = vi
    .spyOn(globalThis.crypto, 'randomUUID')
    .mockImplementation(
      () =>
        `00000000-0000-4000-8000-${(++uuid).toString(16).padStart(12, '0')}` as `${string}-${string}-${string}-${string}-${string}`,
    );
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  // The eraser stamps its slash trail with Date.now(): the clock reads the
  // current event's t (default 0). Other tools keep the real clock.
  let now = 0;
  const nowSpy =
    spec.tool === 'eraser'
      ? vi.spyOn(Date, 'now').mockImplementation(() => now)
      : null;
  Object.defineProperty(g, 'document', {
    value: doc,
    configurable: true,
    writable: true,
  });
  try {
    const scene = makeScene(
      spec.elements ?? [],
      spec.selected ?? [],
      {
        activeTool: ACTIVE_TOOL[spec.tool],
        gridVisible: false,
        ...spec.appState,
      },
      spec.viewport,
    );
    const initial = encodeScene(scene);
    const history = new History(scene);
    let calls: Json[] = [];
    const dispatch = history.dispatch.bind(history);
    const beginDrag = history.beginDrag.bind(history);
    const endDrag = history.endDrag.bind(history);
    const cancelDrag = history.cancelDrag.bind(history);
    history.dispatch = (command: Command) => {
      calls.push({ op: 'dispatch', command: snapshot(command) });
      dispatch(command);
    };
    history.beginDrag = () => {
      calls.push({ op: 'beginDrag' });
      beginDrag();
    };
    history.endDrag = () => {
      calls.push({ op: 'endDrag' });
      endDrag();
    };
    history.cancelDrag = () => {
      calls.push({ op: 'cancelDrag' });
      cancelDrag();
    };
    const ctx: ToolContext = {
      history,
      canvas: {
        getBoundingClientRect: () =>
          ({
            left: 0,
            top: 0,
            width: 800,
            height: 600,
            right: 800,
            bottom: 600,
          }) as DOMRect,
      } as HTMLCanvasElement,
      onPreviewUpdate: () => {},
    };
    const tool = makeTool(spec.tool);
    // canvas_view.ts opens the text editor on a freshly placed sticky note.
    const companion = spec.tool === 'sticky' ? new TextTool() : null;
    if (companion) {
      (tool as StickyTool).onPlaced = (el, c) => companion.editExisting(el, c);
    }
    const textTool = companion ?? (tool as TextTool);
    const events: Json[] = [];
    const steps: Json[] = [];
    for (const ev of spec.events) {
      calls = [];
      let recorded: Json = { ...ev };
      let cursor: string | undefined;
      let pruned: boolean | undefined;
      now = 't' in ev && ev.t !== undefined ? ev.t : 0;
      switch (ev.type) {
        case 'down':
        case 'move':
        case 'up': {
          const { viewport, appState } = history.present;
          let [wx, wy] = screenToWorld(viewport, ev.sx, ev.sy);
          if (appState.gridVisible && SNAP_TOOLS.has(spec.tool)) {
            const size = appState.gridSize;
            wx = Math.round(wx / size) * size;
            wy = Math.round(wy / size) * size;
          }
          recorded = { ...ev, wx, wy };
          const mouse = {
            clientX: ev.sx,
            clientY: ev.sy,
            shiftKey: ev.shift ?? false,
            altKey: ev.alt ?? false,
            ctrlKey: false,
            metaKey: false,
            button: 0,
            timeStamp: ev.t ?? 0,
            ...(ev.pointerType !== undefined && {
              pointerType: ev.pointerType,
            }),
            ...(ev.pressure !== undefined && { pressure: ev.pressure }),
            preventDefault: () => {},
          } as unknown as MouseEvent;
          if (ev.type === 'down') tool.onMouseDown(mouse, wx, wy, ctx);
          else if (ev.type === 'move') tool.onMouseMove(mouse, wx, wy, ctx);
          else tool.onMouseUp(mouse, wx, wy, ctx);
          cursor = tool.getCursor(wx, wy, ctx);
          break;
        }
        case 'key':
          tool.onKeyDown?.(
            {
              key: ev.key,
              shiftKey: ev.shift ?? false,
              altKey: false,
              ctrlKey: false,
              metaKey: false,
              preventDefault: () => {},
              stopPropagation: () => {},
            } as unknown as KeyboardEvent,
            ctx,
          );
          break;
        case 'cancel':
          tool.onCancel?.(ctx);
          break;
        case 'deactivate':
          tool.onDeactivate?.(ctx);
          break;
        case 'textInput': {
          const ta = doc.openTextarea();
          if (!ta) throw new Error('textInput without an open textarea');
          ta.value = ev.value;
          ta.fire('input', {});
          break;
        }
        case 'textKey': {
          const ta = doc.openTextarea();
          if (!ta) throw new Error('textKey without an open textarea');
          ta.fire('keydown', {
            key: ev.key,
            shiftKey: ev.shift ?? false,
            preventDefault: () => {},
            stopPropagation: () => {},
          });
          break;
        }
        case 'blur': {
          const ta = doc.openTextarea();
          if (!ta) throw new Error('blur without an open textarea');
          ta.fire('blur', {});
          break;
        }
        case 'editExisting': {
          const target = history.present.elements.find((e) => e.id === ev.id);
          if (target?.type !== 'text') throw new Error('editExisting: no text');
          textTool.editExisting(target, ctx);
          break;
        }
        case 'textSelect': {
          const ta = doc.openTextarea();
          if (!ta) throw new Error('textSelect without an open textarea');
          ta.selectionStart = ev.start;
          ta.selectionEnd = ev.end;
          break;
        }
        case 'leave':
          // canvas_view.ts: mouseleave calls onMouseLeave when the tool has one.
          if ('onMouseLeave' in tool) (tool as EraserTool).onMouseLeave();
          break;
        case 'prune':
          pruned = (tool as EraserTool).pruneTrail();
          break;
      }
      vi.runAllTimers();
      events.push(recorded);
      steps.push({
        calls,
        ...(cursor !== undefined && { cursor }),
        ...(pruned !== undefined && { pruned }),
        ...toolState(spec.tool, tool, doc, companion),
      });
    }
    return {
      input: { tool: spec.tool, scene: initial, events },
      output: {
        steps,
        scene: encodeScene(history.present),
        canUndo: history.canUndo(),
        canRedo: history.canRedo(),
      },
    };
  } finally {
    vi.useRealTimers();
    uuidSpy.mockRestore();
    nowSpy?.mockRestore();
    if (savedDocument) Object.defineProperty(g, 'document', savedDocument);
    else delete g.document;
  }
}

// ── Event helpers ─────────────────────────────────────────────────────────────

const down = (
  sx: number,
  sy: number,
  mods: Partial<ToolEvent> = {},
): ToolEvent => ({ type: 'down', sx, sy, ...mods }) as ToolEvent;
const move = (
  sx: number,
  sy: number,
  mods: Partial<ToolEvent> = {},
): ToolEvent => ({ type: 'move', sx, sy, ...mods }) as ToolEvent;
const up = (sx: number, sy: number, mods: Partial<ToolEvent> = {}): ToolEvent =>
  ({ type: 'up', sx, sy, ...mods }) as ToolEvent;
const key = (k: string, shift?: boolean): ToolEvent =>
  ({ type: 'key', key: k, ...(shift && { shift }) }) as ToolEvent;

/** Press, intermediate moves along a straight line, release. */
function drag(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  steps = 4,
  mods: Partial<ToolEvent> = {},
): ToolEvent[] {
  const out: ToolEvent[] = [down(x1, y1, mods)];
  for (let i = 1; i <= steps; i++) {
    out.push(
      move(x1 + ((x2 - x1) * i) / steps, y1 + ((y2 - y1) * i) / steps, mods),
    );
  }
  out.push(up(x2, y2, mods));
  return out;
}

const RECT = sample('rect', {
  x: 100,
  y: 100,
  width: 120,
  height: 60,
  label: undefined,
});
const zoom2: Viewport = { offsetX: 50, offsetY: -20, zoom: 2 };

function clean<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// ── Cases ─────────────────────────────────────────────────────────────────────

function selectCases(): Array<[string, CaseSpec]> {
  const rect = clean(RECT);
  const ellipse = clean(
    sample('ellipse', { x: 400, y: 100, width: 100, height: 80 }),
  );
  const text = clean(sample('text', { x: 100, y: 300 }));
  const line = clean(
    sample('line', {
      x: 100,
      y: 400,
      x2: 300,
      y2: 450,
      cx: undefined,
      cy: undefined,
      startElementId: undefined,
      endElementId: undefined,
      startAnchor: undefined,
    }),
  );
  const scene = [rect, ellipse, text];
  const out: Array<[string, CaseSpec]> = [];
  const sel = (name: string, spec: Omit<CaseSpec, 'tool'>) =>
    out.push([name, { tool: 'select', ...spec }]);

  sel('test: selects an element tapped at its center', {
    elements: [
      clean(
        sample('rect', {
          id: 'el-1',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          label: undefined,
        }),
      ),
    ],
    events: [down(50, 50), up(50, 50)],
  });
  sel('test: clears selection when tapping empty space', {
    elements: [
      clean(
        sample('rect', {
          id: 'el-1',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          label: undefined,
        }),
      ),
    ],
    selected: ['el-1'],
    events: [down(300, 300), up(300, 300)],
  });
  sel('click selects topmost', {
    elements: scene,
    events: [down(150, 130), up(150, 130)],
  });
  sel('hover without drag', {
    elements: scene,
    events: [move(150, 130), move(600, 500), move(450, 140)],
  });
  sel('move drag', {
    elements: scene,
    events: drag(150, 130, 230, 175, 5),
  });
  sel('move drag zoomed', {
    elements: scene,
    viewport: zoom2,
    events: drag(350, 240, 420, 300, 3),
  });
  sel('move drag shows align guides', {
    elements: scene,
    events: [
      down(450, 140),
      move(440, 200),
      move(209, 300),
      move(160, 300),
      up(160, 300),
    ],
  });
  sel('move multi selection', {
    elements: scene,
    selected: ['r', 'e'],
    events: drag(150, 130, 100, 80, 2),
  });
  sel('move locked element', {
    elements: [clean({ ...rect, locked: true }), ellipse],
    events: drag(150, 130, 230, 175, 2),
  });
  // Resize from every handle of a selected rectangle (100,100 120x60).
  const handles: ReadonlyArray<[string, number, number]> = [
    ['nw', 100, 100],
    ['n', 160, 100],
    ['ne', 220, 100],
    ['w', 100, 130],
    ['e', 220, 130],
    ['sw', 100, 160],
    ['s', 160, 160],
    ['se', 220, 160],
  ];
  for (const [h, hx, hy] of handles) {
    sel(`resize ${h}`, {
      elements: scene,
      selected: ['r'],
      events: [
        down(hx, hy),
        move(hx + 1, hy + 1),
        move(hx + 30, hy + 20),
        move(hx - 25, hy + 40),
        up(hx - 25, hy + 40),
      ],
    });
  }
  sel('resize se shift keeps aspect', {
    elements: scene,
    selected: ['r'],
    events: drag(220, 160, 300, 260, 3, { shift: true }),
  });
  sel('resize nw past anchor flips', {
    elements: scene,
    selected: ['r'],
    events: drag(100, 100, 300, 250, 3),
  });
  sel('resize below minimum size', {
    elements: scene,
    selected: ['r'],
    events: drag(220, 160, 104, 104, 2),
  });
  sel('resize under threshold does nothing', {
    elements: scene,
    selected: ['r'],
    events: [down(220, 160), move(222, 161), up(222, 161)],
  });
  sel('resize text corner scales font', {
    elements: scene,
    selected: ['t'],
    events: drag(260, 324, 340, 340, 2),
  });
  sel('resize text from just below the se corner', {
    elements: scene,
    selected: ['t'],
    events: drag(262, 334, 340, 360, 2),
  });
  sel('resize multi selection', {
    elements: scene,
    selected: ['r', 'e'],
    events: drag(500, 180, 560, 240, 3),
  });
  sel('resize zoomed', {
    elements: scene,
    selected: ['r'],
    viewport: zoom2,
    events: drag(490, 300, 560, 360, 2),
  });
  // Rotation handle: 34 px above the top-center of the selection.
  sel('rotate', {
    elements: scene,
    selected: ['r'],
    events: [down(160, 66), move(200, 70), move(260, 130), up(260, 130)],
  });
  sel('rotate shift snaps to 15 degrees', {
    elements: scene,
    selected: ['r'],
    events: [
      down(160, 66),
      move(203, 71, { shift: true }),
      move(250, 120, { shift: true }),
      up(250, 120, { shift: true }),
    ],
  });
  sel('rotate multi selection does nothing', {
    elements: scene,
    selected: ['r', 'e'],
    events: [down(300, 66), move(350, 90), up(350, 90)],
  });
  sel('marquee selects enclosed', {
    elements: scene,
    events: drag(80, 80, 520, 200, 3),
  });
  sel('marquee reversed', {
    elements: scene,
    events: drag(520, 360, 90, 90, 2),
  });
  sel('marquee zoomed', {
    elements: scene,
    viewport: zoom2,
    events: drag(200, 150, 520, 320, 2),
  });
  sel('marquee empty', {
    elements: scene,
    events: drag(600, 400, 700, 500, 2),
  });
  sel('shift click adds', {
    elements: scene,
    selected: ['r'],
    events: [down(450, 140, { shift: true }), up(450, 140, { shift: true })],
  });
  sel('shift click toggles off', {
    elements: scene,
    selected: ['r', 'e'],
    events: [down(450, 140, { shift: true }), up(450, 140, { shift: true })],
  });
  sel('shift click toggles last off', {
    elements: scene,
    selected: ['r'],
    events: [down(150, 130, { shift: true }), up(150, 130, { shift: true })],
  });
  sel('shift drag clones', {
    elements: scene,
    selected: ['r'],
    events: drag(150, 130, 250, 200, 3, { shift: true }),
  });
  sel('shift small move stays a click', {
    elements: scene,
    events: [
      down(450, 140, { shift: true }),
      move(451, 140.5, { shift: true }),
      up(451, 140.5, { shift: true }),
    ],
  });
  sel('alt drag duplicates', {
    elements: scene,
    events: drag(150, 130, 250, 200, 3, { alt: true }),
  });
  sel('alt drag duplicates selection', {
    elements: scene,
    selected: ['r', 'e'],
    events: drag(450, 140, 470, 300, 2, { alt: true }),
  });
  sel('alt click selects only', {
    elements: scene,
    events: [down(150, 130, { alt: true }), up(150, 130, { alt: true })],
  });
  for (const [k, label] of [
    ['ArrowLeft', 'left'],
    ['ArrowRight', 'right'],
    ['ArrowUp', 'up'],
    ['ArrowDown', 'down'],
  ] as const) {
    sel(`nudge ${label}`, {
      elements: scene,
      selected: ['r', 't'],
      events: [key(k)],
    });
    sel(`nudge ${label} shift`, {
      elements: scene,
      selected: ['r', 't'],
      events: [key(k, true)],
    });
  }
  sel('nudge with nothing selected', {
    elements: scene,
    events: [key('ArrowLeft')],
  });
  sel('escape clears selection', {
    elements: scene,
    selected: ['r'],
    events: [key('Escape')],
  });
  const grouped = [
    clean({ ...rect, groupId: 'g1' }),
    clean({ ...ellipse, groupId: 'g1' }),
    text,
  ];
  sel('group click selects group then member', {
    elements: grouped,
    events: [
      down(150, 130),
      up(150, 130),
      down(450, 140),
      up(450, 140),
      key('Escape'),
    ],
  });
  sel('drag line endpoint onto rectangle', {
    elements: [rect, line],
    selected: ['l'],
    events: [down(300, 450), move(260, 300), move(222, 140), up(222, 140)],
  });
  sel('drag line endpoint onto port', {
    elements: [rect, line],
    selected: ['l'],
    events: [down(100, 400), move(160, 200), move(161, 162), up(161, 162)],
  });
  sel('drag line control point', {
    elements: [rect, line],
    selected: ['l'],
    events: drag(200, 425, 230, 380, 2),
  });
  sel('cancel during move', {
    elements: scene,
    events: [down(150, 130), move(180, 150), { type: 'cancel' }],
  });
  sel('deactivate during resize', {
    elements: scene,
    selected: ['r'],
    events: [down(220, 160), move(260, 200), { type: 'deactivate' }],
  });
  return out;
}

function handCases(): Array<[string, CaseSpec]> {
  return [
    [
      'test: pans the viewport on single-finger drag',
      { tool: 'hand', events: [down(100, 100), move(150, 120), up(150, 120)] },
    ],
    [
      'test: does not pan after touchend',
      { tool: 'hand', events: [down(100, 100), up(100, 100), move(200, 200)] },
    ],
    [
      'pan zoomed several moves',
      {
        tool: 'hand',
        viewport: zoom2,
        events: drag(300, 300, 120, 410, 4),
      },
    ],
  ];
}

function shapeCases(): Array<[string, CaseSpec]> {
  const out: Array<[string, CaseSpec]> = [];
  for (const tool of ['rectangle', 'ellipse', 'rombo'] as const) {
    const add = (name: string, spec: Omit<CaseSpec, 'tool'>) =>
      out.push([`${tool} ${name}`, { tool, ...spec }]);
    add('test: creates from a drag gesture', {
      events: drag(10, 10, 110, 80, 3),
    });
    add('test: does not create for a tiny tap', {
      events: [down(50, 50), move(51, 51), up(51, 51)],
    });
    add('drag up-left gives negative size', {
      events: drag(300, 300, 180, 220, 2),
    });
    add('shift constrains to a square', {
      events: drag(100, 100, 260, 160, 2, { shift: true }),
    });
    add('shift with zero height', {
      events: drag(100, 100, 200, 100, 1, { shift: true }),
    });
    add('zoomed viewport', {
      viewport: zoom2,
      events: drag(100, 100, 300, 260, 2),
    });
    add('grid snapping', {
      appState: { gridVisible: true, gridSize: 20 },
      events: drag(13, 27, 147, 91, 2),
    });
    add('tool locked keeps tool', {
      appState: {
        toolLocked: true,
        strokeColor: '#ff0000',
        fillColor: '#00ff00',
        strokeWidth: 4,
        strokeStyle: 'dashed',
      },
      events: drag(10, 10, 90, 70, 2),
    });
    add('cancel discards', {
      events: [down(10, 10), move(80, 80), { type: 'cancel' }, up(80, 80)],
    });
    add('deactivate discards', {
      events: [down(10, 10), move(80, 80), { type: 'deactivate' }, up(80, 80)],
    });
  }
  return out;
}

function textCases(): Array<[string, CaseSpec]> {
  const existing = clean(sample('text', { x: 100, y: 100 }));
  const note = clean(sample('note'));
  const out: Array<[string, CaseSpec]> = [];
  const add = (name: string, spec: Omit<CaseSpec, 'tool'>) =>
    out.push([`text ${name}`, { tool: 'text', ...spec }]);
  add('click creates auto width', {
    events: [
      down(200, 200),
      up(200, 200),
      { type: 'textInput', value: 'Hello' },
      { type: 'blur' },
    ],
  });
  add('click creates two lines', {
    events: [
      down(200, 200),
      up(200, 200),
      { type: 'textInput', value: 'Line one\nsecond line is longer' },
      { type: 'textKey', key: 'Escape' },
    ],
  });
  add('drag creates fixed width', {
    events: [
      down(100, 100),
      move(160, 104),
      move(260, 110),
      up(260, 110),
      { type: 'textInput', value: 'Fixed width\ntext' },
      { type: 'blur' },
    ],
  });
  add('drag to the left', {
    events: [
      down(300, 100),
      move(150, 100),
      up(150, 100),
      { type: 'textInput', value: 'Left' },
      { type: 'blur' },
    ],
  });
  add('empty text creates nothing', {
    events: [
      down(200, 200),
      up(200, 200),
      { type: 'textInput', value: '   ' },
      { type: 'blur' },
    ],
  });
  add('click elsewhere commits without tool switch', {
    events: [
      down(200, 200),
      up(200, 200),
      { type: 'textInput', value: 'First' },
      down(400, 400),
      up(400, 400),
    ],
  });
  add('zoomed and styled', {
    viewport: zoom2,
    appState: {
      fontSize: 28,
      fontFamily: 'Georgia, serif',
      textAlign: 'center',
      strokeColor: '#ff8800',
    },
    events: [
      down(200, 200),
      up(200, 200),
      { type: 'textInput', value: 'Zoomed' },
      { type: 'blur' },
    ],
  });
  add('grid snapping', {
    appState: { gridVisible: true, gridSize: 20 },
    events: [
      down(213, 207),
      up(213, 207),
      { type: 'textInput', value: 'Snap' },
      { type: 'blur' },
    ],
  });
  add('tool locked', {
    appState: { toolLocked: true },
    events: [
      down(200, 200),
      up(200, 200),
      { type: 'textInput', value: 'Locked' },
      { type: 'blur' },
    ],
  });
  add('click on text edits it', {
    elements: [existing],
    events: [
      down(150, 110),
      { type: 'textInput', value: 'Hello there world' },
      { type: 'blur' },
    ],
  });
  add('edit to empty deletes', {
    elements: [existing],
    events: [
      down(150, 110),
      { type: 'textInput', value: '' },
      { type: 'textKey', key: 'Escape' },
    ],
  });
  add('edit unchanged', {
    elements: [existing],
    events: [{ type: 'editExisting', id: 't' }, { type: 'blur' }],
  });
  add('edit sticky note keeps box', {
    elements: [note],
    events: [
      { type: 'editExisting', id: 'n' },
      { type: 'textInput', value: 'Sticky\nnote\nlines' },
      { type: 'blur' },
    ],
  });
  add('cancel removes overlay', {
    events: [
      down(200, 200),
      up(200, 200),
      { type: 'textInput', value: 'Gone' },
      { type: 'cancel' },
    ],
  });
  add('deactivate commits', {
    events: [
      down(200, 200),
      up(200, 200),
      { type: 'textInput', value: 'Kept' },
      { type: 'deactivate' },
    ],
  });
  return out;
}

function penCases(): Array<[string, CaseSpec]> {
  const out: Array<[string, CaseSpec]> = [];
  const add = (name: string, spec: Omit<CaseSpec, 'tool'>) =>
    out.push([`pen ${name}`, { tool: 'pen', ...spec }]);
  add('test: creates a freehand element after touch moves', {
    events: [
      down(0, 0),
      move(10, 0),
      move(20, 0),
      move(30, 0),
      move(40, 0),
      up(40, 0),
    ],
  });
  add('test: does not create an element on a simple tap', {
    events: [down(50, 50), up(50, 50)],
  });
  add('test: discards the stroke when a second finger cancels', {
    events: [
      down(0, 0),
      move(10, 0),
      move(20, 0),
      { type: 'cancel' },
      up(20, 0),
    ],
  });
  add('test: respects the minimum-distance filter', {
    events: [down(0, 0), move(1, 0), move(1.5, 0), move(5, 0), up(5, 0)],
  });
  add('test: carries appState stroke properties', {
    appState: {
      strokeColor: '#ff0000',
      strokeWidth: 6,
      opacity: 0.5,
      roughness: 2,
      strokeStyle: 'dotted',
    },
    events: [down(0, 0), move(20, 10), move(40, 0), up(40, 0)],
  });
  add('test: does not spike pressure after a pause', {
    events: [
      down(0, 0, { t: 0 }),
      move(10, 0, { t: 16 }),
      move(20, 0, { t: 32 }),
      move(25, 0, { t: 532 }),
      move(35, 0, { t: 548 }),
      up(35, 0, { t: 548 }),
    ],
  });
  add('test: draws a second stroke after the first', {
    events: [
      down(0, 0),
      move(20, 0),
      up(20, 0),
      down(0, 50),
      move(30, 60),
      up(30, 60),
    ],
  });
  const rand = prng(0x746f6f6c);
  const timed: ToolEvent[] = [down(100, 100, { t: 1000 })];
  let t = 1000;
  let x = 100;
  let y = 100;
  for (let i = 0; i < 40; i++) {
    t += 4 + Math.floor(rand() * 24);
    x += Math.cos(i * 0.4) * (2 + rand() * 9);
    y += Math.sin(i * 0.4) * (2 + rand() * 9);
    timed.push(move(x, y, { t }));
  }
  timed.push(up(x, y, { t }));
  add('mouse stroke with synthesized pressure', { events: timed });
  add('stylus stroke with pressure', {
    events: timed.map((e, i) =>
      e.type === 'move'
        ? ({
            ...e,
            pointerType: 'pen',
            pressure: 0.3 + 0.5 * Math.abs(Math.sin(i / 5)),
          } as ToolEvent)
        : e,
    ),
  });
  add('zoomed min distance', {
    viewport: zoom2,
    events: [
      down(100, 100, { t: 0 }),
      move(101.5, 100, { t: 10 }),
      move(103, 100, { t: 20 }),
      move(110, 104, { t: 30 }),
      up(110, 104, { t: 30 }),
    ],
  });
  add('clears selection on press', {
    elements: [clean(RECT)],
    selected: ['r'],
    events: [down(400, 400), move(420, 410), up(420, 410)],
  });
  add('deactivate discards', {
    events: [down(0, 0), move(30, 0), { type: 'deactivate' }, up(30, 0)],
  });
  return out;
}

export function buildTools(): Family {
  const fam = new Family('tools', {
    sceneEncoding: SCENE_ENCODING,
    eventEncoding: TOOL_EVENT_ENCODING,
    outputEncoding: TOOL_OUTPUT_ENCODING,
    textareaStub: TEXTAREA_STUB,
    skipped:
      'Not covered: text code mode (textMode "code", Shift+Enter, Tab), real textarea soft wrapping and font ' +
      'measurement, canvas_view.ts routing (Alt+press pans before reaching the select tool, keydown ignored ' +
      'while an input has focus), touch gestures.',
  });
  const all = [
    ...selectCases(),
    ...handCases(),
    ...shapeCases(),
    ...textCases(),
    ...penCases(),
  ];
  for (const [name, spec] of all) {
    const { input, output } = runCase(spec);
    fam.add(name, spec.tool, input, output);
  }
  return fam;
}

// ── M3 cases: line tool and connector editing (tools/line.json) ─────────────

const M3_BASE = {
  strokeColor: '#1e1e1e',
  fillColor: 'transparent',
  strokeWidth: 2,
  opacity: 1,
  roughness: 0,
} as const;

/** Nodes shared by the connector cases. Rectangle ports: (160,100), (220,130), (160,160), (100,130). */
function connectorNodes(): Element[] {
  return [
    clean(RECT),
    clean(sample('ellipse', { x: 400, y: 100, width: 100, height: 80 })),
    clean(sample('icon', { x: 100, y: 300 })),
    clean(sample('shape', { x: 400, y: 300, width: 100, height: 120 })),
  ];
}

function connector(
  id: string,
  extra: Partial<Record<string, unknown>>,
): Element {
  return clean({
    ...M3_BASE,
    id,
    type: 'line',
    x: 100,
    y: 500,
    x2: 300,
    y2: 550,
    ...extra,
  }) as Element;
}

function lineCases(): Array<[string, CaseSpec]> {
  const out: Array<[string, CaseSpec]> = [];
  const add = (name: string, spec: Omit<CaseSpec, 'tool'>) =>
    out.push([`line ${name}`, { tool: 'line', ...spec }]);
  const nodes = connectorNodes();
  add('test: creates lines with an end arrowhead by default', {
    events: [down(0, 0), up(100, 0)],
  });
  add('tiny drag creates nothing', {
    events: [down(50, 50), move(51, 51), up(51, 51)],
  });
  add('exactly 2 px is a line', {
    events: [down(50, 50), move(52, 50), up(52, 50)],
  });
  add('free drag', { elements: nodes, events: drag(20, 520, 300, 560, 3) });
  add('shift snaps to 45 degrees', {
    events: drag(20, 500, 200, 540, 2, { shift: true }),
  });
  add('shift snaps to vertical', {
    events: drag(20, 500, 30, 300, 2, { shift: true }),
  });
  add('shift snaps diagonal up left', {
    events: drag(300, 500, 150, 330, 2, { shift: true }),
  });
  add('starts on rectangle border', {
    elements: nodes,
    events: drag(223, 145, 330, 260, 3),
  });
  add('starts on rectangle port', {
    elements: nodes,
    events: drag(161, 98, 300, 30, 2),
  });
  add('ends on ellipse border', {
    elements: nodes,
    events: drag(300, 260, 470, 175, 3),
  });
  add('ends on ellipse port', {
    elements: nodes,
    events: drag(300, 260, 401, 141, 3),
  });
  add('rectangle to ellipse both bound', {
    elements: nodes,
    events: drag(221, 131, 399, 139, 4),
  });
  add('to stencil bottom port below its label', {
    elements: nodes,
    events: [down(300, 520), move(200, 450), move(133, 392), up(133, 392)],
  });
  add('to stencil border', {
    elements: nodes,
    events: drag(300, 330, 166, 340, 2),
  });
  add('to flowchart shape', {
    elements: nodes,
    events: drag(300, 520, 452, 421, 3),
  });
  add('start and end on the same element', {
    elements: nodes,
    events: drag(161, 99, 219, 131, 2),
  });
  add('elbow routing', {
    elements: nodes,
    appState: { lineRouting: 'elbow' },
    events: drag(221, 131, 399, 139, 3),
  });
  add('tool locked keeps tool', {
    elements: nodes,
    appState: { toolLocked: true },
    events: drag(20, 520, 200, 560, 2),
  });
  add('styled from app state', {
    appState: {
      strokeColor: '#ff0000',
      strokeWidth: 4,
      opacity: 0.5,
      roughness: 2,
      strokeStyle: 'dashed',
    },
    events: drag(20, 520, 200, 560, 2),
  });
  add('zoomed snap radius', {
    elements: nodes,
    viewport: zoom2,
    events: drag(510, 270, 700, 400, 2),
  });
  add('grid snapping', {
    elements: nodes,
    appState: { gridVisible: true, gridSize: 20 },
    events: drag(13, 507, 191, 553, 2),
  });
  add('hover shows snap indicator', {
    elements: nodes,
    events: [move(600, 600), move(223, 140), move(161, 101), move(452, 182)],
  });
  add('cancel during drag', {
    elements: nodes,
    events: [down(20, 520), move(200, 540), { type: 'cancel' }, up(200, 540)],
  });
  add('deactivate during drag', {
    elements: nodes,
    events: [
      down(20, 520),
      move(200, 540),
      { type: 'deactivate' },
      up(200, 540),
    ],
  });
  add('up without down', { events: [up(100, 100), move(150, 150)] });
  add('locked target still snaps', {
    elements: [clean({ ...RECT, locked: true })],
    events: drag(300, 300, 222, 140, 2),
  });
  add('hidden target is ignored', {
    elements: [clean({ ...RECT, visible: false })],
    events: drag(300, 300, 222, 140, 2),
  });
  add('rotated target', {
    elements: [clean({ ...RECT, rotation: 0.6 })],
    events: drag(400, 300, 230, 160, 3),
  });
  add('onto another connector', {
    elements: [connector('u', { x: 100, y: 300, x2: 300, y2: 300 })],
    events: drag(200, 400, 200, 302, 2),
  });
  add('shift snap then end snaps to element', {
    elements: nodes,
    events: drag(300, 130, 225, 128, 2, { shift: true }),
  });
  return out;
}

function connectorEditCases(): Array<[string, CaseSpec]> {
  const out: Array<[string, CaseSpec]> = [];
  const sel = (name: string, spec: Omit<CaseSpec, 'tool'>) =>
    out.push([`connector ${name}`, { tool: 'select', ...spec }]);
  const nodes = connectorNodes();
  const free = connector('u', {});
  const bound = connector('b', {
    x: 220,
    y: 130,
    x2: 400,
    y2: 140,
    startElementId: 'r',
    endElementId: 'e',
    startAnchor: { x: 1, y: 0.5 },
    arrowHead: 'end',
  });
  const elbow = connector('w', {
    x: 160,
    y: 160,
    x2: 450,
    y2: 300,
    routing: 'elbow',
    startElementId: 'r',
    endElementId: 's',
    startAnchor: { x: 0.5, y: 1 },
    endHeadStyle: 'triangleFilled',
    arrowHead: 'end',
  });
  const curved = connector('q', {
    x: 100,
    y: 600,
    x2: 300,
    y2: 600,
    cx: 200,
    cy: 540,
    startHeadStyle: 'circle',
    arrowHead: 'both',
  });
  const arrow = clean({
    ...M3_BASE,
    id: 'a',
    type: 'arrow',
    x: 600,
    y: 400,
    x2: 700,
    y2: 500,
    endHeadStyle: 'diamond',
  }) as Element;
  const legacyCurve = clean(
    sample('curve', {
      id: 'c',
      x: 600,
      y: 600,
      x2: 760,
      y2: 600,
      cx: 680,
      cy: 540,
    }),
  );
  const scene = [...nodes, free, bound, elbow, curved, arrow, legacyCurve];

  sel('drag free end onto rectangle border', {
    elements: scene,
    selected: ['u'],
    events: [down(300, 550), move(260, 300), move(223, 150), up(223, 150)],
  });
  sel('drag free start onto rectangle port', {
    elements: scene,
    selected: ['u'],
    events: [down(100, 500), move(160, 200), move(161, 162), up(161, 162)],
  });
  sel('drag free end onto ellipse', {
    elements: scene,
    selected: ['u'],
    events: drag(300, 550, 470, 176, 3),
  });
  sel('drag free end onto stencil bottom port', {
    elements: scene,
    selected: ['u'],
    events: drag(300, 550, 133, 393, 3),
  });
  sel('drag free end onto flowchart shape', {
    elements: scene,
    selected: ['u'],
    events: drag(300, 550, 452, 421, 2),
  });
  sel('drag bound start off into empty space unbinds', {
    elements: scene,
    selected: ['b'],
    events: drag(220, 130, 300, 230, 3),
  });
  sel('drag bound end to another element', {
    elements: scene,
    selected: ['b'],
    events: drag(400, 140, 449, 299, 3),
  });
  sel('drag bound start from port to border', {
    elements: scene,
    selected: ['b'],
    events: drag(220, 130, 222, 150, 2),
  });
  sel('drag end onto its own start element', {
    elements: scene,
    selected: ['b'],
    events: drag(400, 140, 219, 155, 2),
  });
  sel('drag elbow end', {
    elements: scene,
    selected: ['w'],
    events: drag(450, 300, 401, 141, 3),
  });
  sel('drag elbow start unbinds', {
    elements: scene,
    selected: ['w'],
    events: drag(160, 160, 250, 260, 2),
  });
  sel('drag arrow element end onto rectangle', {
    elements: scene,
    selected: ['a'],
    events: drag(700, 500, 221, 129, 3),
  });
  sel('drag end zoomed', {
    elements: scene,
    selected: ['u'],
    viewport: zoom2,
    events: drag(650, 1080, 494, 280, 3),
  });
  sel('drag end then cancel', {
    elements: scene,
    selected: ['u'],
    events: [down(300, 550), move(223, 150), { type: 'cancel' }],
  });
  sel('drag line control point', {
    elements: scene,
    selected: ['u'],
    events: drag(200, 525, 230, 470, 2),
  });
  sel('drag curved line control point', {
    elements: scene,
    selected: ['q'],
    events: drag(200, 540, 180, 640, 3),
  });
  sel('elbow line has no control point', {
    elements: scene,
    selected: ['w'],
    events: drag(305, 230, 330, 260, 2),
  });
  sel('drag legacy curve control point', {
    elements: scene,
    selected: ['c'],
    events: drag(680, 540, 700, 500, 2),
  });
  sel('hover cursors over endpoints and control point', {
    elements: scene,
    selected: ['u'],
    events: [move(300, 550), move(100, 500), move(200, 525), move(250, 525)],
  });
  sel('move a bound connector', {
    elements: scene,
    events: drag(310, 136, 330, 176, 2),
  });
  sel('move a node with attached connectors', {
    elements: scene,
    events: drag(130, 120, 190, 60, 3),
  });
  sel('alt drag duplicates node and connector', {
    elements: scene,
    selected: ['r', 'b', 'e'],
    events: drag(130, 120, 130, 700, 2, { alt: true }),
  });
  sel('shift drag clones a connector', {
    elements: scene,
    selected: ['u'],
    events: drag(150, 512, 150, 650, 2, { shift: true }),
  });
  sel('resize a selection with connectors', {
    elements: [clean(RECT), free],
    selected: ['r', 'u'],
    events: drag(300, 550, 400, 650, 2),
  });
  sel('nudge a bound connector', {
    elements: scene,
    selected: ['b'],
    events: [key('ArrowRight'), key('ArrowDown', true)],
  });
  sel('marquee selects connectors', {
    elements: scene,
    events: drag(50, 480, 340, 680, 2),
  });
  // The handles are drawn at the resolved ends (drawSelection) but the press
  // is tested against the stored coordinates (select_tool.ts).
  const stale = connector('s2', {
    x: 0,
    y: 0,
    x2: 10,
    y2: 10,
    startElementId: 'r',
    endElementId: 'e',
  });
  sel('stale stored ends: press on the drawn end', {
    elements: [...nodes, stale],
    selected: ['s2'],
    events: drag(400, 140, 300, 300, 2),
  });
  sel('stale stored ends: press on the stored end', {
    elements: [...nodes, stale],
    selected: ['s2'],
    events: drag(10, 10, 300, 300, 2),
  });
  return out;
}

// ── M3 cases: text tool parity (tools/text.json) ────────────────────────────

function textParityCases(): Array<[string, CaseSpec]> {
  const out: Array<[string, CaseSpec]> = [];
  const add = (name: string, spec: Omit<CaseSpec, 'tool'>) =>
    out.push([`text ${name}`, { tool: 'text', ...spec }]);
  const ti = (value: string): ToolEvent => ({ type: 'textInput', value });
  const tk = (k: string, shift?: boolean): ToolEvent =>
    ({ type: 'textKey', key: k, ...(shift && { shift }) }) as ToolEvent;
  const code = { textMode: 'code' as const };

  add('code click creates code box', {
    appState: code,
    events: [
      down(200, 200),
      up(200, 200),
      ti('const a = 1;\nreturn a;'),
      { type: 'blur' },
    ],
  });
  add('code shift enter commits', {
    appState: code,
    events: [down(200, 200), up(200, 200), ti('x = 1'), tk('Enter', true)],
  });
  add('code plain enter does not commit', {
    appState: code,
    events: [
      down(200, 200),
      up(200, 200),
      ti('x = 1'),
      tk('Enter'),
      ti('x = 1\ny = 2'),
      tk('Escape'),
    ],
  });
  add('code tab inserts two spaces', {
    appState: code,
    events: [
      down(200, 200),
      up(200, 200),
      ti('if (a) {\nb\n}'),
      { type: 'textSelect', start: 9, end: 9 },
      tk('Tab'),
      { type: 'blur' },
    ],
  });
  add('code tab replaces selection', {
    appState: code,
    events: [
      down(200, 200),
      up(200, 200),
      ti('abcdef'),
      { type: 'textSelect', start: 1, end: 4 },
      tk('Tab'),
      tk('Escape'),
    ],
  });
  add('code whitespace only creates nothing', {
    appState: code,
    events: [down(200, 200), up(200, 200), ti('  \n  '), { type: 'blur' }],
  });
  add('code keeps leading whitespace', {
    appState: code,
    events: [
      down(200, 200),
      up(200, 200),
      ti('\n  indented\n'),
      { type: 'blur' },
    ],
  });
  add('code long line widens the box', {
    appState: code,
    events: [
      down(100, 100),
      up(100, 100),
      ti(
        'const aVeryLongIdentifierName = someFunctionCall(argumentOne, argumentTwo);',
      ),
      { type: 'blur' },
    ],
  });
  add('code zoomed and tool locked', {
    appState: { ...code, toolLocked: true, fontSize: 14 },
    viewport: zoom2,
    events: [down(200, 200), up(200, 200), ti('zoomed()'), { type: 'blur' }],
  });
  add('code drag is still a code box', {
    appState: code,
    events: [
      down(100, 100),
      move(300, 100),
      up(300, 100),
      ti('dragged'),
      { type: 'blur' },
    ],
  });

  for (const align of ['left', 'center', 'right'] as const) {
    add(`create aligned ${align}`, {
      appState: { textAlign: align },
      events: [
        down(200, 200),
        up(200, 200),
        ti('Aligned\nlonger second line'),
        { type: 'blur' },
      ],
    });
    add(`create fixed width aligned ${align}`, {
      appState: { textAlign: align },
      events: [
        down(100, 100),
        move(260, 100),
        up(260, 100),
        ti('Fixed\nwidth'),
        { type: 'blur' },
      ],
    });
  }
  add('create with serif font and size', {
    appState: { fontFamily: 'Georgia, serif', fontSize: 32 },
    events: [down(200, 200), up(200, 200), ti('Serif title'), { type: 'blur' }],
  });

  const base = clean(
    sample('text', { x: 100, y: 100, width: 160, height: 24 }),
  );
  const decorated = (extra: Record<string, unknown>) =>
    clean({ ...base, ...extra }) as Element;
  add('edit bold text measures bold', {
    elements: [decorated({ bold: true })],
    events: [
      { type: 'editExisting', id: 't' },
      ti('Hello bold world wider'),
      { type: 'blur' },
    ],
  });
  add('edit italic underline strikethrough', {
    elements: [
      decorated({ italic: true, underline: true, strikethrough: true }),
    ],
    events: [
      { type: 'editExisting', id: 't' },
      ti('Decorated'),
      { type: 'blur' },
    ],
  });
  for (const align of ['center', 'right'] as const) {
    add(`edit aligned ${align}`, {
      elements: [decorated({ textAlign: align })],
      events: [
        { type: 'editExisting', id: 't' },
        ti('Aligned edit\nline'),
        { type: 'blur' },
      ],
    });
  }
  add('edit grows width and height', {
    elements: [base],
    events: [
      { type: 'editExisting', id: 't' },
      ti('Hello world\nwith a much longer second line'),
      { type: 'blur' },
    ],
  });
  add('edit shrinks', {
    elements: [base],
    events: [{ type: 'editExisting', id: 't' }, ti('Hi'), tk('Escape')],
  });
  add('edit refits the width to the content', {
    elements: [decorated({ width: 112.5, height: 24 })],
    events: [
      { type: 'editExisting', id: 't' },
      ti('Hello world'),
      { type: 'blur' },
    ],
  });
  add('edit change under one pixel keeps size', {
    elements: [decorated({ width: 103.5, height: 24 })],
    events: [
      { type: 'editExisting', id: 't' },
      ti('Hello world'),
      { type: 'blur' },
    ],
  });
  add('edit text with background grows', {
    elements: [
      decorated({
        fillColor: '#333333',
        shadowBlur: 4,
        shadowColor: '#000',
        shadowOffsetX: 2,
        shadowOffsetY: 1,
        opacity: 0.8,
      }),
    ],
    events: [
      { type: 'editExisting', id: 't' },
      ti('Background text grows'),
      { type: 'blur' },
    ],
  });
  add('edit zoomed', {
    elements: [base],
    viewport: zoom2,
    events: [
      { type: 'editExisting', id: 't' },
      ti('Zoomed edit'),
      { type: 'blur' },
    ],
  });
  const codeEl = clean({
    ...base,
    content: 'let x = 1;',
    fontFamily: '"Courier New", monospace',
    isCode: true,
    width: 180,
    height: 40,
  }) as Element;
  add('edit code element shift enter', {
    elements: [codeEl],
    events: [
      { type: 'editExisting', id: 't' },
      ti('let x = 1;\nlet y = 2;'),
      tk('Enter', true),
    ],
  });
  add('edit code element tab', {
    elements: [codeEl],
    events: [
      { type: 'editExisting', id: 't' },
      { type: 'textSelect', start: 0, end: 0 },
      tk('Tab'),
      { type: 'blur' },
    ],
  });
  add('edit code element plain enter keeps editing', {
    elements: [codeEl],
    events: [
      { type: 'editExisting', id: 't' },
      tk('Enter'),
      ti('changed'),
      tk('Escape'),
    ],
  });
  const note = clean(sample('note'));
  add('edit sticky note wraps in its box', {
    elements: [note],
    events: [
      { type: 'editExisting', id: 'n' },
      ti(
        'A sticky note line that is long\nsecond\nthird\nfourth\nfifth\nsixth\nseventh\neighth\nninth',
      ),
      { type: 'blur' },
    ],
  });
  add('edit sticky note to empty deletes it', {
    elements: [note],
    events: [{ type: 'editExisting', id: 'n' }, ti('  '), { type: 'blur' }],
  });
  add('click on sticky note edits it', {
    elements: [note],
    events: [down(300, 480), ti('Clicked'), { type: 'blur' }],
  });
  add('edit while another edit is open commits the first', {
    elements: [base, note],
    events: [
      { type: 'editExisting', id: 't' },
      ti('First edit'),
      { type: 'editExisting', id: 'n' },
      ti('Second edit'),
      { type: 'blur' },
    ],
  });
  return out;
}

function stickyCases(): Array<[string, CaseSpec]> {
  const out: Array<[string, CaseSpec]> = [];
  const add = (name: string, spec: Omit<CaseSpec, 'tool'>) =>
    out.push([`sticky ${name}`, { tool: 'sticky', ...spec }]);
  add('place and type', {
    events: [
      down(300, 300),
      up(300, 300),
      { type: 'textInput', value: 'Remember\nthe milk' },
      { type: 'blur' },
    ],
  });
  add('place and leave empty deletes it', {
    events: [down(300, 300), up(300, 300), { type: 'blur' }],
  });
  add('place with escape', {
    events: [
      down(300, 300),
      up(300, 300),
      { type: 'textInput', value: 'Escaped' },
      { type: 'textKey', key: 'Escape' },
    ],
  });
  add('place tool locked and styled', {
    appState: {
      toolLocked: true,
      fontFamily: 'Georgia, serif',
      strokeWidth: 3,
    },
    events: [
      down(120, 80),
      up(120, 80),
      { type: 'textInput', value: 'Locked' },
      { type: 'blur' },
    ],
  });
  add('place zoomed', {
    viewport: zoom2,
    events: [
      down(400, 400),
      up(400, 400),
      { type: 'textInput', value: 'Zoomed' },
      { type: 'blur' },
    ],
  });
  add('long text wraps and grows', {
    events: [
      down(300, 300),
      up(300, 300),
      { type: 'textInput', value: 'word '.repeat(60).trim() },
      { type: 'blur' },
    ],
  });
  add('grid does not snap sticky notes', {
    appState: { gridVisible: true, gridSize: 20 },
    events: [
      down(313, 307),
      up(313, 307),
      { type: 'textInput', value: 'Grid' },
      { type: 'blur' },
    ],
  });
  return out;
}

const M3_SKIPPED =
  'Not covered: shape, connector and stencil label editing (openShapeLabelEditor and openArrowLabelEditor ' +
  'are private functions of src/ui/canvas_view.ts, not tool classes; their geometry is in the labels ' +
  'family and SET_SHAPE_LABEL in reducer and stencils), the canvas_view.ts double click routing, real ' +
  'textarea soft wrapping and font measurement, touch gestures.';

/** The M3 tool cases, written next to tools.json as tools/line.json and tools/text.json. */
export function buildToolsM3(): Family[] {
  const header = {
    sceneEncoding: SCENE_ENCODING,
    eventEncoding: TOOL_EVENT_ENCODING_M3,
    outputEncoding: TOOL_OUTPUT_ENCODING_M3,
    textareaStub: TEXTAREA_STUB_M3,
    skipped: M3_SKIPPED,
  };
  const files: Array<[string, Array<[string, CaseSpec]>]> = [
    ['line', [...lineCases(), ...connectorEditCases()]],
    ['text', [...textParityCases(), ...stickyCases()]],
  ];
  return files.map(([file, cases]) => {
    const fam = new Family('tools', header, file);
    for (const [name, spec] of cases) {
      const { input, output } = runCase(spec);
      fam.add(name, spec.tool, input, output);
    }
    return fam;
  });
}

// ── M4 cases: the eraser (tools/eraser.json) ─────────────────────────────────

function eraserCases(): Array<[string, CaseSpec]> {
  const out: Array<[string, CaseSpec]> = [];
  const add = (name: string, spec: Omit<CaseSpec, 'tool'>) =>
    out.push([name, { tool: 'eraser', ...spec }]);
  const box = (
    id: string,
    x: number,
    y: number,
    width = 100,
    height = 60,
    extra: Partial<Record<string, unknown>> = {},
  ): Element =>
    clean(
      sample('rect', { id, x, y, width, height, label: undefined, ...extra }),
    );
  const click = (sx: number, sy: number): ToolEvent[] => [
    down(sx, sy),
    up(sx, sy),
  ];

  // Basic erasing
  add('click deletes the element under the pointer', {
    elements: [box('A', 100, 100)],
    events: click(150, 130),
  });
  add('click on empty canvas opens and closes a drag', {
    elements: [box('A', 100, 100)],
    events: click(500, 400),
  });
  add('empty scene', { events: drag(10, 10, 200, 200) });
  add('overlap deletes only the topmost', {
    elements: [box('A', 100, 100), box('B', 150, 130)],
    events: click(175, 145),
  });
  add('pointer that stays deletes one element per event', {
    elements: [box('A', 100, 100), box('B', 150, 130), box('C', 120, 110)],
    events: [down(175, 145), move(175, 145), move(175, 145), up(175, 145)],
  });
  add('drag across several elements deletes each in one drag', {
    elements: [box('A', 100, 100), box('B', 300, 100), box('C', 500, 100)],
    events: drag(90, 130, 610, 130, 13),
  });
  add('drag that skips over an element between moves misses it', {
    elements: [box('A', 100, 100, 20, 20), box('B', 300, 100, 20, 20)],
    events: [down(50, 110), move(200, 110), move(400, 110), up(400, 110)],
  });

  // The 4 px pad around the bounds
  for (const [label, sx, sy] of [
    ['right pad edge', 204, 130],
    ['just past the right pad', 204.25, 130],
    ['left pad edge', 96, 130],
    ['just past the left pad', 95.75, 130],
    ['top pad edge', 150, 96],
    ['bottom pad edge', 150, 164],
    ['just past the bottom pad', 150, 164.5],
    ['pad corner', 204, 164],
  ] as const) {
    add(`pad: ${label}`, {
      elements: [box('A', 100, 100)],
      events: click(sx, sy),
    });
  }

  // Locked elements
  add('locked element on top is skipped, the one below goes', {
    elements: [
      box('A', 100, 100),
      box('B', 150, 130, 100, 60, { locked: true }),
    ],
    events: click(175, 145),
  });
  add('only locked elements: nothing deleted', {
    elements: [box('A', 100, 100, 100, 60, { locked: true })],
    events: click(150, 130),
  });

  // Hover
  add('hover without press tracks the topmost element', {
    elements: [box('A', 100, 100), box('B', 150, 130)],
    events: [move(120, 110), move(175, 145), move(500, 500)],
  });
  add('hover skips locked elements', {
    elements: [
      box('A', 100, 100),
      box('B', 150, 130, 100, 60, { locked: true }),
    ],
    events: [move(175, 145), move(240, 180)],
  });
  add('mouse leave clears the hover', {
    elements: [box('A', 100, 100)],
    events: [move(150, 130), { type: 'leave' }],
  });
  add('hover reads the scene before the deletion of the same move', {
    elements: [box('A', 100, 100), box('B', 150, 130)],
    events: [down(20, 20), move(175, 145), move(175, 145), up(175, 145)],
  });
  add('moves after release only hover', {
    elements: [box('A', 100, 100), box('B', 300, 100)],
    events: [...click(150, 130), move(350, 130), move(360, 130)],
  });

  // Gesture lifecycle
  add('release without press does nothing', {
    elements: [box('A', 100, 100)],
    events: [up(150, 130)],
  });
  add('cancel mid drag restores the erased elements', {
    elements: [box('A', 100, 100), box('B', 300, 100)],
    events: [down(150, 130), move(350, 130), { type: 'cancel' }, up(350, 130)],
  });
  add('deactivate mid drag cancels', {
    elements: [box('A', 100, 100)],
    events: [down(150, 130), { type: 'deactivate' }, move(160, 130)],
  });
  add('cancel without a gesture does nothing', {
    elements: [box('A', 100, 100)],
    events: [{ type: 'cancel' }, { type: 'deactivate' }],
  });
  add('two gestures are two undo steps', {
    elements: [box('A', 100, 100), box('B', 300, 100)],
    events: [...click(150, 130), ...click(350, 130)],
  });

  // Slash trail and pruning (TRAIL_DURATION 350 ms, points with time >= now - 350 stay)
  add('trail grows while erasing and is pruned by age', {
    elements: [box('A', 100, 100)],
    events: [
      down(50, 50, { t: 1000 }),
      move(80, 60, { t: 1100 }),
      move(150, 130, { t: 1200 }),
      up(160, 130, { t: 1300 }),
      { type: 'prune', t: 1449 },
      { type: 'prune', t: 1450 },
      { type: 'prune', t: 1451 },
      { type: 'prune', t: 1550 },
      { type: 'prune', t: 1551 },
    ],
  });
  add('hover moves do not extend the trail', {
    elements: [box('A', 100, 100)],
    events: [
      down(50, 50, { t: 10 }),
      up(50, 50, { t: 20 }),
      move(150, 130, { t: 30 }),
      { type: 'prune', t: 40 },
    ],
  });
  add('a new press restarts the trail', {
    events: [
      ...drag(10, 10, 50, 50, 2, { t: 5 }),
      down(300, 300, { t: 100 }),
      up(300, 300, { t: 100 }),
    ],
  });
  add('cancel clears the trail', {
    events: [
      down(10, 10),
      move(20, 20),
      { type: 'cancel' },
      { type: 'prune', t: 0 },
    ],
  });
  add('prune on an empty trail', { events: [{ type: 'prune', t: 0 }] });

  // Viewport and grid
  add('zoomed and panned viewport', {
    elements: [box('A', 100, 100), box('B', 300, 100)],
    viewport: zoom2,
    events: drag(200, 200, 700, 200, 5),
  });
  add('grid does not snap the eraser', {
    elements: [box('A', 100, 100)],
    appState: { gridVisible: true, gridSize: 20 },
    events: click(207, 130),
  });

  // Element types (bounds from getElementBounds)
  const types: ReadonlyArray<[string, Element[], number, number]> = [
    ['ellipse', [clean(sample('ellipse'))], 350, 40],
    ['rhombus corner box', [clean(sample('rhombus'))], 2, 202],
    ['shape', [clean(sample('shape'))], 350, 260],
    ['stencil', [clean(sample('icon'))], 532, 32],
    ['nothing under a stencil label', [clean(sample('icon'))], 532, 70],
    ['embedded stencil', [clean(sample('vendorIcon'))], 632, 32],
    ['text', [clean(sample('text'))], 80, 412],
    ['sticky note', [clean(sample('note'))], 300, 490],
    ['image', [clean(sample('image'))], 580, 260],
    ['free arrow', [clean(sample('freeArrow'))], -60, -80],
    ['curve control point side', [clean(sample('curve'))], 100, 565],
    ['polygon', [clean(sample('polygon'))], 340, 620],
    ['freehand', [clean(sample('freehand'))], 510, 610],
    [
      'bound line over its start shape',
      [clean(sample('rect')), clean(sample('ellipse')), clean(sample('line'))],
      120,
      30,
    ],
    [
      'bound shape with its connector',
      [clean(sample('rect')), clean(sample('ellipse')), clean(sample('line'))],
      20,
      50,
    ],
    [
      'elbow arrow',
      [clean(sample('rect')), clean(sample('rhombus')), clean(sample('arrow'))],
      60,
      130,
    ],
    [
      'nothing outside the unrotated bounds of a rotated rectangle',
      [box('A', 100, 100, 200, 20, { rotation: Math.PI / 4 })],
      200,
      190,
    ],
    [
      'rotated rectangle by its unrotated bounds',
      [box('A', 100, 100, 200, 20, { rotation: Math.PI / 4 })],
      110,
      110,
    ],
    [
      'hidden element',
      [box('A', 100, 100, 100, 60, { visible: false })],
      150,
      130,
    ],
    ['zero size element', [box('A', 100, 100, 0, 0)], 103, 97],
    ['negative size element', [box('A', 200, 200, -100, -60)], 150, 170],
    [
      'grouped element goes alone',
      [
        box('A', 100, 100, 100, 60, { groupIds: ['g'] }),
        box('B', 300, 100, 100, 60, { groupIds: ['g'] }),
      ],
      150,
      130,
    ],
  ];
  for (const [label, elements, sx, sy] of types) {
    add(`erases ${label}`, { elements, events: click(sx, sy) });
  }
  add('selected element leaves the selection', {
    elements: [box('A', 100, 100), box('B', 300, 100)],
    selected: ['A', 'B'],
    events: click(150, 130),
  });
  return out;
}

/** The eraser cases, written next to tools.json as tools/eraser.json. */
export function buildToolsEraser(): Family {
  const fam = new Family(
    'tools',
    {
      sceneEncoding: SCENE_ENCODING,
      eventEncoding:
        TOOL_EVENT_ENCODING.replace(
          'tool is select | hand | rectangle | ellipse | rombo | text | pen',
          'tool is eraser',
        ).replace(
          'when appState.gridVisible and the tool is rectangle, ellipse, rombo or text.',
          'when appState.gridVisible and the tool is rectangle, ellipse, rombo or text (never for the eraser).',
        ) +
        ' leave calls onMouseLeave (canvas_view.ts on mouseleave). prune {t} calls pruneTrail. Date.now() ' +
        "returns the current event's t (default 0; prune uses its own t) for the whole event.",
      outputEncoding: TOOL_OUTPUT_ENCODING.replace(
        /; select: .*?scene, canUndo,/,
        '; eraser: hoveredId and slashTrail ([{worldX, worldY, time}]), plus pruned (the pruneTrail result) on ' +
          'prune steps. scene, canUndo,',
      ),
    },
    'eraser',
  );
  for (const [name, spec] of eraserCases()) {
    const { input, output } = runCase(spec);
    fam.add(name, spec.tool, input, output);
  }
  return fam;
}
