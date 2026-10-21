import { describe, expect, it } from 'vitest';
import type { Scene } from '../src/core/scene';
import { createScene } from '../src/core/scene';
import { createViewport } from '../src/core/viewport';
import type { StencilElement } from '../src/elements/element';
import {
  GENERIC_ICON_IDS,
  GENERIC_ICONS,
  type GenericIcon,
  ICON_GRID,
} from '../src/elements/stencils/generic';
import {
  createStencil,
  getGenericIcon,
  isValidEmbeddedSvg,
  isValidStencilRef,
  MAX_EMBEDDED_SVG_CHARS,
} from '../src/elements/stencils/registry';
import { reducer } from '../src/engine/reducer';
import { validateElements } from '../src/io/element_validation';
import {
  getElementPorts,
  getRotationHandleScreen,
} from '../src/rendering/draw_selection';
import { flattenShapeCommands } from '../src/rendering/shape_geometry';
import { GENERIC_ICON_LABEL_KEYS } from '../src/ui/stencil_icons';

const SVG = `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg"/>')}`;
const STYLE = {
  strokeColor: '#000',
  fillColor: 'transparent',
  strokeWidth: 1,
  opacity: 1,
  roughness: 0,
};

function builtin(id = 's1'): StencilElement {
  return createStencil(
    id,
    { kind: 'builtin', ref: 'generic/database' },
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

describe('generic icon set', () => {
  for (const id of GENERIC_ICON_IDS) {
    it(`${id} stays inside the icon grid and has a label`, () => {
      const icon: GenericIcon = GENERIC_ICONS[id];
      const paths = [
        ...flattenShapeCommands(icon.strokes),
        ...(icon.fill ? flattenShapeCommands(icon.fill) : []),
      ];
      expect(paths.length).toBeGreaterThan(0);
      for (const path of paths) {
        for (const [x, y] of path) {
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(ICON_GRID);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(y).toBeLessThanOrEqual(ICON_GRID);
        }
      }
      expect(GENERIC_ICON_LABEL_KEYS[id]).toMatch(/^icon/);
    });
  }

  it('resolves generic references only', () => {
    expect(getGenericIcon('generic/server')).toBe(GENERIC_ICONS.server);
    expect(getGenericIcon('generic/nope')).toBeNull();
    expect(getGenericIcon('k8s/pod')).toBeNull();
    // Inherited object keys are not icons.
    expect(getGenericIcon('generic/toString')).toBeNull();
  });
});

describe('stencil source checks', () => {
  it('accepts well-formed references', () => {
    expect(isValidStencilRef('generic/database')).toBe(true);
    expect(isValidStencilRef('k8s/pod-security')).toBe(true);
    expect(isValidStencilRef('generic')).toBe(false);
    expect(isValidStencilRef('../etc/passwd')).toBe(false);
    expect(isValidStencilRef('generic/<script>')).toBe(false);
  });

  it('accepts only strict base64 SVG data URLs within the size cap', () => {
    expect(isValidEmbeddedSvg(SVG)).toBe(true);
    expect(isValidEmbeddedSvg('data:image/png;base64,AAAA')).toBe(false);
    expect(isValidEmbeddedSvg(`${SVG}" onload="alert(1)`)).toBe(false);
    expect(
      isValidEmbeddedSvg(
        `data:image/svg+xml;base64,${'A'.repeat(MAX_EMBEDDED_SVG_CHARS)}`,
      ),
    ).toBe(false);
  });
});

describe('stencil validation', () => {
  it('accepts built-in and embedded stencils', () => {
    const els = [builtin(), embedded()];
    expect(validateElements(els)).toEqual(els);
  });

  it('rejects malformed sources', () => {
    expect(
      validateElements([
        { ...builtin(), source: { kind: 'builtin', ref: 'nope' } },
      ]),
    ).toBeNull();
    expect(
      validateElements([
        {
          ...embedded(),
          source: {
            kind: 'embedded',
            src: 'javascript:alert(1)',
            pack: 'x',
            name: 'y',
          },
        },
      ]),
    ).toBeNull();
    expect(validateElements([{ ...builtin(), source: undefined }])).toBeNull();
  });

  it('rejects rotated embedded icons but not rotated built-in ones', () => {
    expect(validateElements([{ ...embedded(), rotation: 0.5 }])).toBeNull();
    const rotated = { ...builtin(), rotation: 0.5 };
    expect(validateElements([rotated])).toEqual([rotated]);
  });
});

describe('stencil reducer rules', () => {
  const scene = (): Scene => ({
    ...createScene(),
    elements: [builtin(), embedded()],
  });

  it('never rotates embedded vendor icons', () => {
    const next = reducer(scene(), {
      type: 'SET_ROTATION',
      id: 'e1',
      rotation: 1,
    });
    expect(next.elements[1]).not.toHaveProperty('rotation');
    const rotated = reducer(scene(), {
      type: 'SET_ROTATION',
      id: 's1',
      rotation: 1,
    });
    expect(rotated.elements[0]).toMatchObject({ rotation: 1 });
  });

  it('restyles generic icons but only the label of vendor icons', () => {
    const next = reducer(scene(), {
      type: 'APPLY_STYLE',
      ids: ['s1', 'e1'],
      strokeColor: '#ff0000',
      labelColor: '#00ff00',
    });
    expect(next.elements[0]).toMatchObject({ strokeColor: '#ff0000' });
    expect(next.elements[1]).toMatchObject({
      strokeColor: '#000',
      labelColor: '#00ff00',
    });
  });

  it('resizes and labels stencils', () => {
    const resized = reducer(scene(), {
      type: 'RESIZE_ELEMENT',
      id: 'e1',
      width: 96,
      height: 96,
    });
    expect(resized.elements[1]).toMatchObject({ width: 96, height: 96 });
    const labeled = reducer(scene(), {
      type: 'SET_SHAPE_LABEL',
      id: 's1',
      label: 'Orders',
      labelFontSize: 14,
      labelFontFamily: 'Arial',
    });
    expect(labeled.elements[0]).toMatchObject({ label: 'Orders' });
  });
});

describe('stencil selection geometry', () => {
  it('exposes ports on the icon box', () => {
    const ports = getElementPorts(builtin());
    expect(ports.map((p) => [p.worldX, p.worldY])).toEqual([
      [100, 68],
      [132, 100],
      [100, 132],
      [68, 100],
    ]);
  });

  it('hides the rotation handle when a vendor icon is selected', () => {
    const vp = createViewport();
    expect(getRotationHandleScreen([builtin()], vp)).not.toBeNull();
    expect(getRotationHandleScreen([builtin(), embedded()], vp)).toBeNull();
  });
});
