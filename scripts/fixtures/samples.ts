/**
 * Sample elements (one or more of every type) and small scenes shared by the
 * reducer, history, live and viewport families.
 */
import type { AppState } from '../../src/core/app_state';
import { createScene, type Scene } from '../../src/core/scene';
import type { Viewport } from '../../src/core/viewport';
import type { Element } from '../../src/elements/element';

const STYLE = {
  strokeColor: '#1e1e1e',
  fillColor: 'transparent',
  strokeWidth: 2,
  opacity: 1,
  roughness: 0,
} as const;

/** Every element type, with the optional fields commands interact with. */
export const SAMPLE = {
  rect: {
    id: 'r',
    type: 'rectangle',
    x: 0,
    y: 0,
    width: 120,
    height: 60,
    ...STYLE,
    cornerRadius: 8,
    label: 'Start',
    labelFontSize: 16,
    labelFontFamily: 'Arial, sans-serif',
  },
  ellipse: {
    id: 'e',
    type: 'ellipse',
    x: 300,
    y: 0,
    width: 100,
    height: 80,
    ...STYLE,
    fillColor: '#a5d8ff',
    strokeStyle: 'dashed',
  },
  rhombus: {
    id: 'd',
    type: 'rhombus',
    x: 0,
    y: 200,
    width: 120,
    height: 90,
    ...STYLE,
    roughness: 1,
  },
  shape: {
    id: 's',
    type: 'shape',
    kind: 'database',
    x: 300,
    y: 200,
    width: 100,
    height: 120,
    ...STYLE,
    label: 'Users',
  },
  icon: {
    id: 'gi',
    type: 'stencil',
    source: { kind: 'builtin', ref: 'generic/server' },
    x: 500,
    y: 0,
    width: 64,
    height: 64,
    ...STYLE,
    label: 'API',
  },
  vendorIcon: {
    id: 'vi',
    type: 'stencil',
    source: {
      kind: 'embedded',
      src: 'data:image/svg+xml;base64,PHN2Zy8+',
      pack: 'azure',
      name: 'AKS',
    },
    x: 600,
    y: 0,
    width: 64,
    height: 64,
    ...STYLE,
  },
  text: {
    id: 't',
    type: 'text',
    x: 0,
    y: 400,
    width: 160,
    height: 24,
    content: 'Hello world',
    fontSize: 20,
    fontFamily: 'Arial, sans-serif',
    ...STYLE,
  },
  note: {
    id: 'n',
    type: 'text',
    x: 200,
    y: 400,
    width: 200,
    height: 180,
    content: 'Sticky',
    fontSize: 16,
    fontFamily: 'Arial, sans-serif',
    padding: 12,
    ...STYLE,
    strokeColor: '#5c4a00',
    fillColor: '#FFD966',
    textAlign: 'center',
  },
  image: {
    id: 'im',
    type: 'image',
    src: 'data:image/png;base64,iVBORw0KGgo=',
    naturalWidth: 640,
    naturalHeight: 480,
    x: 500,
    y: 200,
    width: 160,
    height: 120,
    ...STYLE,
  },
  line: {
    id: 'l',
    type: 'line',
    x: 120,
    y: 30,
    x2: 300,
    y2: 40,
    cx: 210,
    cy: -20,
    ...STYLE,
    startElementId: 'r',
    endElementId: 'e',
    startAnchor: { x: 1, y: 0.5 },
    startHeadStyle: 'circle',
    arrowHead: 'none',
  },
  arrow: {
    id: 'a',
    type: 'arrow',
    x: 60,
    y: 60,
    x2: 60,
    y2: 200,
    ...STYLE,
    startElementId: 'r',
    endElementId: 'd',
    routing: 'elbow',
    endHeadStyle: 'triangle',
    label: 'yes',
  },
  freeArrow: {
    id: 'fa',
    type: 'arrow',
    x: -100,
    y: -100,
    x2: -20,
    y2: -60,
    ...STYLE,
  },
  curve: {
    id: 'c',
    type: 'curve',
    x: 0,
    y: 600,
    x2: 200,
    y2: 600,
    cx: 100,
    cy: 520,
    ...STYLE,
  },
  polygon: {
    id: 'p',
    type: 'polygon',
    x: 300,
    y: 600,
    points: [
      [300, 600],
      [380, 600],
      [340, 660],
    ],
    closed: true,
    ...STYLE,
  },
  freehand: {
    id: 'f',
    type: 'freehand',
    x: 500,
    y: 600,
    points: [
      [500, 600],
      [510, 612.5],
      [527.25, 618],
    ],
    pressures: [0.5, 0.75, 0.25],
    ...STYLE,
  },
} as const satisfies Record<string, Element>;

export type SampleName = keyof typeof SAMPLE;

export function sample(
  name: SampleName,
  overrides: Partial<Record<string, unknown>> = {},
): Element {
  return { ...structuredClone(SAMPLE[name]), ...overrides } as Element;
}

export const SAMPLE_NAMES = Object.keys(SAMPLE) as SampleName[];

export function makeScene(
  elements: ReadonlyArray<Element>,
  selected: ReadonlyArray<string> = [],
  appState: Partial<AppState> = {},
  viewport?: Viewport,
): Scene {
  const base = createScene();
  return {
    elements: elements.map((el) => structuredClone(el)),
    selectedIds: new Set(selected),
    viewport: viewport ?? base.viewport,
    appState: { ...base.appState, ...appState },
  };
}
