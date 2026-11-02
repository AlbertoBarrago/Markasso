/**
 * `stencils` family: the stencil registry (src/elements/stencils/registry.ts),
 * the generic icon set (generic.ts), the bundled Kubernetes pack (packs.ts)
 * and the rules other modules apply to stencils: validation, the reducer's
 * restyle and rotation rules, ports, border points and the rotation handle.
 *
 * Cases named `test: ...` reproduce tests/stencils.test.ts.
 */

import type { Command } from '../../src/commands/commands';
import { createScene, type Scene } from '../../src/core/scene';
import { createViewport } from '../../src/core/viewport';
import type { Element, StencilElement } from '../../src/elements/element';
import {
  GENERIC_ICON_IDS,
  ICON_GRID,
  isGenericIconId,
} from '../../src/elements/stencils/generic';
import {
  BUNDLED_PACKS,
  getBundledIcon,
  getLoadedPack,
  isBundledPack,
  loadBundledPack,
} from '../../src/elements/stencils/packs';
import {
  createStencil,
  DEFAULT_STENCIL_SIZE,
  genericIconIdOf,
  getGenericIcon,
  isRestylableStencil,
  isRotatableStencil,
  isValidEmbeddedSvg,
  isValidStencilRef,
  MAX_EMBEDDED_SVG_CHARS,
  STENCIL_LABEL_GAP,
} from '../../src/elements/stencils/registry';
import { reducer } from '../../src/engine/reducer';
import { validateElements } from '../../src/io/element_validation';
import {
  getElementBorderPoint,
  getElementPorts,
  getRotationHandleScreen,
} from '../../src/rendering/draw_selection';
import { flattenShapeCommands } from '../../src/rendering/shape_geometry';
import { Family } from './common';
import { encodeScene, SCENE_ENCODING, snapshot } from './scene_codec';

const SVG = `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg"/>')}`;
const STYLE = {
  strokeColor: '#000',
  fillColor: 'transparent',
  strokeWidth: 1,
  opacity: 1,
  roughness: 0,
};

function builtin(id = 's1', ref = 'generic/database'): StencilElement {
  return createStencil(
    id,
    { kind: 'builtin', ref },
    100,
    100,
    STYLE,
    'Users DB',
  );
}

function embedded(id = 'e1'): StencilElement {
  return createStencil(
    id,
    { kind: 'embedded', src: SVG, pack: 'AWS', name: 'Amazon S3' },
    100,
    100,
    STYLE,
    'Amazon S3',
  );
}

function clean<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const REFS = [
  'generic/api',
  'generic/server',
  'generic/database',
  'k8s/api',
  'k8s/pod',
  'k8s/pod-security',
  'generic/nope',
  'generic/toString',
  'generic/__proto__',
  'generic/constructor',
  'generic/hasOwnProperty',
  'generic/',
  'generic',
  '',
  '/server',
  'generic/server/extra',
  'GENERIC/server',
  'generic/Server',
  'aws/s3',
  '../etc/passwd',
  'generic/<script>',
  'generic/a-b_c',
  `generic/${'a'.repeat(64)}`,
  `generic/${'a'.repeat(65)}`,
  `k8s/${'x'.repeat(64)}`,
  'Generic1/x',
  'pack9/X_y-z',
];

export async function buildStencils(): Promise<Family> {
  await loadBundledPack('k8s');
  const fam = new Family('stencils', {
    inputs:
      'TS parameter names. genericIcon {ref}: getGenericIcon(ref) as {fill?, strokes, flatStrokes, ' +
      'flatFill?} (flat* = flattenShapeCommands), or null. reducer cases use the reducer family format ' +
      '(input {scene, command, isRemote}, output {scene, unchanged}). bundledPack {pack}: the loaded pack ' +
      'as [{id, label, category, srcLength}] in pack order; bundledIcon {ref}: getBundledIcon(ref) after ' +
      'the pack is loaded, or null.',
    sceneEncoding: SCENE_ENCODING,
    constants: {
      ICON_GRID,
      DEFAULT_STENCIL_SIZE,
      STENCIL_LABEL_GAP,
      MAX_EMBEDDED_SVG_CHARS,
    },
  });

  // Generic icon set.
  fam.add('generic icon ids', 'genericIconIds', {}, [...GENERIC_ICON_IDS]);
  for (const id of GENERIC_ICON_IDS) {
    const ref = `generic/${id}`;
    const icon = getGenericIcon(ref)!;
    fam.add(
      `test: ${id} stays inside the icon grid`,
      'genericIcon',
      { ref },
      {
        ...(icon.fill && { fill: icon.fill }),
        strokes: icon.strokes,
        flatStrokes: flattenShapeCommands(icon.strokes),
        ...(icon.fill && { flatFill: flattenShapeCommands(icon.fill) }),
      },
    );
  }
  for (const ref of REFS) {
    fam.add(
      `id of ${JSON.stringify(ref)}`,
      'genericIconIdOf',
      { ref },
      genericIconIdOf(ref),
    );
    fam.add(
      `valid ref ${JSON.stringify(ref)}`,
      'isValidStencilRef',
      { ref },
      isValidStencilRef(ref),
    );
    if (!getGenericIcon(ref)) {
      fam.add(
        `no generic icon for ${JSON.stringify(ref)}`,
        'genericIcon',
        { ref },
        null,
      );
    }
  }
  for (const id of ['api', 'toString', '__proto__', 'valueOf', '', 'API']) {
    fam.add(
      `is generic id ${JSON.stringify(id)}`,
      'isGenericIconId',
      { id },
      isGenericIconId(id),
    );
  }

  // Embedded SVG checks.
  const prefix = 'data:image/svg+xml;base64,';
  const svgs: Array<[string, string]> = [
    ['test: minimal svg', SVG],
    ['png data url', 'data:image/png;base64,AAAA'],
    ['test: attribute break out', `${SVG}" onload="alert(1)`],
    [
      'test: over the size cap',
      `${prefix}${'A'.repeat(MAX_EMBEDDED_SVG_CHARS)}`,
    ],
    [
      'exactly at the size cap',
      `${prefix}${'A'.repeat(MAX_EMBEDDED_SVG_CHARS - prefix.length)}`,
    ],
    [
      'one over the size cap',
      `${prefix}${'A'.repeat(MAX_EMBEDDED_SVG_CHARS - prefix.length + 1)}`,
    ],
    ['one padding', `${prefix}QUJD=`],
    ['two padding', `${prefix}QUI==`],
    ['three padding', `${prefix}QQ===`],
    ['empty payload', prefix],
    ['whitespace', `${prefix}QUJD QUJD`],
    ['newline at end', `${prefix}QUJD\n`],
    ['url safe alphabet', `${prefix}QU-_`],
    ['uppercase mime', 'data:IMAGE/SVG+XML;base64,QUJD'],
    ['utf8 svg', 'data:image/svg+xml;utf8,<svg/>'],
    ['javascript url', 'javascript:alert(1)'],
    ['empty', ''],
  ];
  for (const [name, src] of svgs) {
    fam.add(name, 'isValidEmbeddedSvg', { src }, isValidEmbeddedSvg(src));
  }

  // Restylable and rotatable rules.
  const sources: Array<[string, StencilElement]> = [
    ['generic builtin', builtin()],
    ['unknown generic builtin', builtin('s2', 'generic/nope')],
    ['k8s builtin', builtin('k1', 'k8s/pod')],
    ['other pack builtin', builtin('o1', 'aws/s3')],
    ['embedded', embedded()],
  ];
  for (const [name, el] of sources) {
    fam.add(
      `restylable ${name}`,
      'isRestylableStencil',
      { el },
      isRestylableStencil(el),
    );
    fam.add(
      `rotatable ${name}`,
      'isRotatableStencil',
      { el },
      isRotatableStencil(el),
    );
  }

  // createStencil.
  const creations: Array<[string, Parameters<typeof createStencil>]> = [
    [
      'test: builtin with label',
      [
        's1',
        { kind: 'builtin', ref: 'generic/database' },
        100,
        100,
        STYLE,
        'Users DB',
      ],
    ],
    [
      'without label',
      ['s2', { kind: 'builtin', ref: 'generic/server' }, 0, 0, STYLE, ''],
    ],
    [
      'custom size',
      [
        's3',
        { kind: 'builtin', ref: 'k8s/pod' },
        10.5,
        -20.25,
        STYLE,
        'Pod',
        96,
      ],
    ],
    [
      'test: embedded',
      [
        'e1',
        { kind: 'embedded', src: SVG, pack: 'AWS', name: 'Amazon S3' },
        100,
        100,
        STYLE,
        'Amazon S3',
      ],
    ],
    [
      'zero size',
      ['s4', { kind: 'builtin', ref: 'generic/api' }, 5, 5, STYLE, 'API', 0],
    ],
  ];
  for (const [name, args] of creations) {
    const [id, source, cx, cy, style, label, size] = args;
    fam.add(
      name,
      'createStencil',
      { id, source, cx, cy, style, label, ...(size !== undefined && { size }) },
      createStencil(...args),
    );
  }

  // Validation.
  const validations: Array<[string, unknown[]]> = [
    ['test: accepts built-in and embedded stencils', [builtin(), embedded()]],
    [
      'test: rejects a malformed builtin ref',
      [{ ...builtin(), source: { kind: 'builtin', ref: 'nope' } }],
    ],
    [
      'test: rejects a javascript embedded src',
      [
        {
          ...embedded(),
          source: {
            kind: 'embedded',
            src: 'javascript:alert(1)',
            pack: 'x',
            name: 'y',
          },
        },
      ],
    ],
    [
      'test: rejects a missing source',
      [clean({ ...builtin(), source: undefined })],
    ],
    [
      'test: rejects rotated embedded icons',
      [{ ...embedded(), rotation: 0.5 }],
    ],
    ['test: accepts rotated built-in icons', [{ ...builtin(), rotation: 0.5 }]],
    ['accepts an unknown generic icon ref', [builtin('u', 'generic/nope')]],
    [
      'rejects an unknown source kind',
      [{ ...builtin(), source: { kind: 'remote', ref: 'generic/api' } }],
    ],
    [
      'rejects an embedded source without pack',
      [{ ...embedded(), source: { kind: 'embedded', src: SVG, name: 'n' } }],
    ],
    ['accepts embedded rotation 0', [{ ...embedded(), rotation: 0 }]],
    [
      'accepts negative size stencil',
      [{ ...builtin(), width: -64, height: -64 }],
    ],
  ];
  for (const [name, value] of validations) {
    fam.add(
      name,
      'validateElements',
      { value: clean(value) },
      validateElements(clean(value)),
    );
  }

  // Reducer rules.
  const scene = (): Scene => ({
    ...createScene(),
    elements: [builtin(), embedded(), builtin('k1', 'k8s/pod')],
  });
  const reduce = (name: string, command: Command) => {
    const before = scene();
    const input = encodeScene(before);
    const next = reducer(before, command);
    fam.add(
      name,
      'reducer',
      { scene: input, command: snapshot(command), isRemote: false },
      {
        scene: encodeScene(next),
        unchanged: next === before,
      },
    );
  };
  reduce('test: never rotates embedded vendor icons', {
    type: 'SET_ROTATION',
    id: 'e1',
    rotation: 1,
  });
  reduce('test: rotates built-in icons', {
    type: 'SET_ROTATION',
    id: 's1',
    rotation: 1,
  });
  reduce('rotates bundled pack icons', {
    type: 'SET_ROTATION',
    id: 'k1',
    rotation: -0.5,
  });
  reduce(
    'test: restyles generic icons; vendor icons only take label color and opacity',
    {
      type: 'APPLY_STYLE',
      ids: ['s1', 'e1'],
      strokeColor: '#ff0000',
      fillColor: '#0000ff',
      labelColor: '#00ff00',
      opacity: 0.5,
    },
  );
  reduce('restyle bundled pack icon', {
    type: 'APPLY_STYLE',
    ids: ['k1'],
    strokeColor: '#ff0000',
    fillColor: '#0000ff',
    strokeWidth: 4,
    roughness: 2,
    strokeStyle: 'dashed',
    labelColor: '#00ff00',
    opacity: 0.25,
  });
  reduce('restyle every stencil kind with stroke width', {
    type: 'APPLY_STYLE',
    ids: ['s1', 'e1', 'k1'],
    strokeWidth: 3,
    shadowBlur: 4,
    shadowColor: '#333333',
  });
  reduce('test: resizes stencils', {
    type: 'RESIZE_ELEMENT',
    id: 'e1',
    width: 96,
    height: 96,
  });
  reduce('test: labels stencils', {
    type: 'SET_SHAPE_LABEL',
    id: 's1',
    label: 'Orders',
    labelFontSize: 14,
    labelFontFamily: 'Arial',
  });
  reduce('clears a stencil label', {
    type: 'SET_SHAPE_LABEL',
    id: 'e1',
    label: '',
    labelFontSize: 14,
    labelFontFamily: 'Arial',
  });
  reduce('moves a vendor icon', {
    type: 'MOVE_ELEMENT',
    id: 'e1',
    dx: 10,
    dy: -5,
  });

  // Selection geometry of stencils.
  const { label: _label, ...unlabeled } = builtin();
  const geometry: Array<[string, StencilElement]> = [
    ['labeled builtin', builtin()],
    ['unlabeled builtin', unlabeled as StencilElement],
    ['embedded', embedded()],
    ['rotated builtin', { ...builtin(), rotation: Math.PI }],
    ['rotated quarter', { ...builtin(), rotation: Math.PI / 2 }],
  ];
  for (const [name, el] of geometry) {
    fam.add(`ports ${name}`, 'getElementPorts', { el }, getElementPorts(el));
    for (const [tx, ty] of [
      [100, 400],
      [400, 100],
      [100, -300],
      [-300, 100],
      [250, 260],
    ] as const) {
      fam.add(
        `border point ${name} toward ${tx},${ty}`,
        'getElementBorderPoint',
        { el, targetX: tx, targetY: ty },
        getElementBorderPoint(el, tx, ty),
      );
    }
  }
  const vp = createViewport();
  const handles: Array<[string, Element[]]> = [
    ['test: builtin shows the rotation handle', [builtin()]],
    ['test: vendor icon in the selection hides it', [builtin(), embedded()]],
    ['vendor icon alone hides it', [embedded()]],
    ['bundled pack icon shows it', [builtin('k1', 'k8s/pod')]],
  ];
  for (const [name, elements] of handles) {
    fam.add(
      name,
      'getRotationHandleScreen',
      { elements, viewport: vp },
      getRotationHandleScreen(elements, vp),
    );
  }

  // Bundled packs.
  fam.add('bundled packs', 'bundledPacks', {}, clean(BUNDLED_PACKS));
  for (const pack of ['k8s', 'generic', 'aws', '', 'toString']) {
    fam.add(
      `is bundled ${JSON.stringify(pack)}`,
      'isBundledPack',
      { pack },
      isBundledPack(pack),
    );
  }
  fam.add(
    'k8s pack',
    'bundledPack',
    { pack: 'k8s' },
    (getLoadedPack('k8s') ?? []).map((icon) => ({
      id: icon.id,
      label: icon.label,
      category: icon.category,
      srcLength: icon.src.length,
    })),
  );
  for (const ref of [
    'k8s/pod',
    'k8s/api',
    'k8s/nope',
    'k8s/',
    'generic/server',
  ]) {
    fam.add(`bundled icon ${ref}`, 'bundledIcon', { ref }, getBundledIcon(ref));
  }
  return fam;
}
