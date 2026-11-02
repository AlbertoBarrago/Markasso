/**
 * `shapes` family: flowchart path definitions (src/elements/shapes.ts) and
 * their geometry (src/rendering/shape_geometry.ts): outline, details and
 * text box per `ShapeKind` at several aspect ratios, cubic flattening,
 * outline polygon, border points (ray exit and nearest), distance to the
 * boundary, label wrap width and SVG path data.
 *
 * `shapeOutline`, `shapeDetails` and `shapeTextBox` are
 * `SHAPE_DEFINITIONS[kind].outline / details / textBox(w, h)`; `details` is
 * null for kinds without inner strokes. Commands are arrays like
 * ["M", x, y], ["L", x, y], ["C", x1, y1, x2, y2, x, y], ["Z"].
 * Cases named `test: ...` are calls recorded from tests/shape_geometry.test.ts.
 */
import { SHAPE_KINDS, type ShapeKind } from '../../src/elements/element';
import {
  CUBIC_CIRCLE_K,
  SHAPE_DEFINITIONS,
  type ShapeCommand,
  shapeCommandsToPathData,
} from '../../src/elements/shapes';
import {
  flattenShapeCommands,
  getLabelWrapWidth,
  getShapeBorderPointToward,
  getShapeDistToBoundary,
  getShapeNearestBorderPoint,
  getShapeOutlinePolygon,
  getShapeTextBox,
  LABEL_INSET,
  type LabeledShape,
  ROUND_LABEL_AREA,
} from '../../src/rendering/shape_geometry';
import { Family } from './common';
import type { LiftedCall } from './lift';

const SIZES: ReadonlyArray<[number, number]> = [
  [200, 100],
  [100, 200],
  [120, 120],
  [300, 40],
  [40, 300],
  [37.5, 81.25],
  [1, 1],
  [0, 0],
  [0, 50],
];

export function buildShapes(lifted: ReadonlyArray<[string, LiftedCall[]]>) {
  const fam = new Family('shapes', {
    inputs: 'TS parameter names; points and commands are arrays.',
    constants: {
      CUBIC_CIRCLE_K,
      LABEL_INSET,
      ROUND_LABEL_AREA,
      CUBIC_STEPS: 16,
    },
  });

  const seen = new Set<string>();
  for (const [testName, calls] of lifted) {
    calls.forEach((call, i) => {
      const key = JSON.stringify([call.fn, call.input]);
      if (seen.has(key)) return;
      seen.add(key);
      fam.add(`test: ${testName} #${i}`, call.fn, call.input, call.output);
    });
  }

  for (const kind of SHAPE_KINDS) {
    const def = SHAPE_DEFINITIONS[kind];
    for (const [w, h] of SIZES) {
      const tag = `${kind} ${w}x${h}`;
      const outline = def.outline(w, h);
      const details = def.details?.(w, h) ?? null;
      fam.add(`outline ${tag}`, 'shapeOutline', { kind, w, h }, outline);
      fam.add(`details ${tag}`, 'shapeDetails', { kind, w, h }, details);
      fam.add(
        `text box ${tag}`,
        'shapeTextBox',
        { kind, w, h },
        def.textBox(w, h),
      );
      fam.add(
        `get text box ${tag}`,
        'getShapeTextBox',
        { kind, w, h },
        getShapeTextBox(kind, w, h),
      );
      fam.add(
        `flatten outline ${tag}`,
        'flattenShapeCommands',
        { commands: outline },
        flattenShapeCommands(outline),
      );
      if (details) {
        fam.add(
          `flatten details ${tag}`,
          'flattenShapeCommands',
          { commands: details },
          flattenShapeCommands(details),
        );
      }
      fam.add(
        `outline polygon ${tag}`,
        'getShapeOutlinePolygon',
        { kind, w, h },
        getShapeOutlinePolygon(kind, w, h),
      );
      fam.add(
        `path data ${tag}`,
        'shapeCommandsToPathData',
        { commands: outline, ox: 10.005, oy: -3.333 },
        shapeCommandsToPathData(outline, 10.005, -3.333),
      );

      for (let k = 0; k < 24; k++) {
        const angle = (k / 24) * Math.PI * 2;
        const dx = Math.cos(angle) * 7;
        const dy = Math.sin(angle) * 7;
        fam.add(
          `border toward ${tag} dir ${k}`,
          'getShapeBorderPointToward',
          { kind, w, h, dx, dy },
          getShapeBorderPointToward(kind, w, h, dx, dy),
        );
      }
      for (const [dx, dy] of [
        [0, 0],
        [0.0005, -0.0005],
        [1, 0],
        [0, -1],
        [-3, 0],
        [0, 2],
      ] as const) {
        fam.add(
          `border toward ${tag} axis ${dx},${dy}`,
          'getShapeBorderPointToward',
          { kind, w, h, dx, dy },
          getShapeBorderPointToward(kind, w, h, dx, dy),
        );
      }

      for (const fx of [-0.3, 0, 0.12, 0.5, 0.88, 1, 1.3]) {
        for (const fy of [-0.3, 0, 0.5, 0.95, 1.3]) {
          const px = w * fx + (fx === 0.5 ? 0.25 : 0);
          const py = h * fy - (fy === 0.5 ? 0.5 : 0);
          fam.add(
            `nearest ${tag} ${fx},${fy}`,
            'getShapeNearestBorderPoint',
            { kind, w, h, px, py },
            getShapeNearestBorderPoint(kind, w, h, px, py),
          );
          fam.add(
            `distance ${tag} ${fx},${fy}`,
            'getShapeDistToBoundary',
            { kind, w, h, px, py },
            getShapeDistToBoundary(kind, w, h, px, py),
          );
        }
      }
    }
  }

  // Hand-written command lists for the flattener's edge cases.
  const commandCases: ReadonlyArray<[string, ShapeCommand[]]> = [
    ['empty', []],
    ['move only', [['M', 1, 2]]],
    [
      'two moves',
      [
        ['M', 0, 0],
        ['M', 5, 5],
        ['L', 6, 6],
      ],
    ],
    ['cubic without move', [['C', 0, 10, 10, 10, 10, 0]]],
    ['close without move', [['Z']]],
    ['close then line', [['M', 0, 0], ['L', 10, 0], ['Z'], ['L', 5, 5]]],
    [
      'two closed subpaths',
      [
        ['M', 0, 0],
        ['L', 4, 0],
        ['L', 4, 4],
        ['Z'],
        ['M', 10, 10],
        ['C', 12, 8, 14, 8, 16, 10],
        ['Z'],
      ],
    ],
  ];
  for (const [label, commands] of commandCases) {
    fam.add(
      `flatten ${label}`,
      'flattenShapeCommands',
      { commands },
      flattenShapeCommands(commands),
    );
  }

  // Label wrap width for every labeled shape kind and font size.
  const labeled: Array<[string, LabeledShape]> = [
    ['rectangle', { type: 'rectangle' }],
    ['ellipse', { type: 'ellipse' }],
    ['rhombus', { type: 'rhombus' }],
    ...SHAPE_KINDS.map((kind: ShapeKind): [string, LabeledShape] => [
      `shape ${kind}`,
      { type: 'shape', kind },
    ]),
  ];
  for (const [label, el] of labeled) {
    for (const [w, h] of [
      [200, 100],
      [30, 100],
      [10, 10],
      [400, 60],
    ] as const) {
      for (const labelFontSize of [undefined, 12, 48]) {
        const input = { ...el, ...(labelFontSize && { labelFontSize }) };
        fam.add(
          `wrap width ${label} ${w}x${h} font ${labelFontSize ?? 'default'}`,
          'getLabelWrapWidth',
          { el: input, w, h },
          getLabelWrapWidth(input, w, h),
        );
      }
    }
  }
  return fam;
}
