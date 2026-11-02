/**
 * `tools` family: tool state machines driven by an event script, for the M2
 * tools (select, hand, rectangle, ellipse, rombo, text, pen). Each case runs
 * the real tool class against a real History; the History calls the tool
 * makes (dispatch, beginDrag, endDrag, cancelDrag) are recorded per event,
 * together with the tool state the renderer reads (previews, marquee,
 * guides, hover, cursor). The encodings are in the family header.
 *
 * The text tool's DOM overlay is stubbed with a minimal fake document (see
 * `textareaStub` in the header). Behaviour that only a real browser layout
 * can produce (soft wrapping inside a textarea, real font measurement of the
 * mirror span, code mode with scrollWidth) is not covered.
 */
import { vi } from 'vitest';
import type { Command } from '../../src/commands/commands';
import type { AppState } from '../../src/core/app_state';
import { screenToWorld, type Viewport } from '../../src/core/viewport';
import type { Element } from '../../src/elements/element';
import { History } from '../../src/engine/history';
import { EllipseTool } from '../../src/tools/ellipse_tool';
import { HandTool } from '../../src/tools/hand_tool';
import { PenTool } from '../../src/tools/pen_tool';
import { RectangleTool } from '../../src/tools/rectangle_tool';
import { RomboTool } from '../../src/tools/rombo_tool';
import { SelectTool } from '../../src/tools/select_tool';
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
  | 'pen';

/** Tools whose world coordinates canvas_view.ts snaps to the grid. */
const SNAP_TOOLS = new Set<ToolName>(['rectangle', 'ellipse', 'rombo', 'text']);

const ACTIVE_TOOL: Record<ToolName, AppState['activeTool']> = {
  select: 'select',
  hand: 'hand',
  rectangle: 'rectangle',
  ellipse: 'ellipse',
  rombo: 'rombo',
  text: 'text',
  pen: 'freehand',
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
  | { type: 'editExisting'; id: string };

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
  }
}

function toolState(name: ToolName, tool: Tool, doc: FakeDocument): Json {
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
      const ta = doc.openTextarea();
      return {
        preview: t.getPreview(),
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
    case 'hand':
      return {};
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
    const events: Json[] = [];
    const steps: Json[] = [];
    for (const ev of spec.events) {
      calls = [];
      let recorded: Json = { ...ev };
      let cursor: string | undefined;
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
          (tool as TextTool).editExisting(target, ctx);
          break;
        }
      }
      vi.runAllTimers();
      events.push(recorded);
      steps.push({
        calls,
        ...(cursor !== undefined && { cursor }),
        ...toolState(spec.tool, tool, doc),
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
