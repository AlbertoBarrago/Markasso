/**
 * `presets` family: src/io/presets.ts, the diagram templates inserted from
 * the library (flowchart, mind map, SWOT, sequence). Each case runs one
 * preset's `buildElements(cx, cy, isDark)` with `crypto.randomUUID` stubbed
 * to a counter, so the output elements (ids, bindings, z-order, colors and
 * the bounding-box centering of `translate`) are exact. One extra case
 * records the PRESETS list itself (ids, label keys, icon markup).
 * The inputs of tests/presets.test.ts (centers 0, 0 and 200, 300) are among
 * the cases.
 */
import { vi } from 'vitest';
import { PRESETS } from '../../src/io/presets';
import { Family } from './common';

/** Centers covering the origin, the test's (200, 300), fractions, negatives and large values. */
const CENTERS: ReadonlyArray<[string, number, number]> = [
  ['origin', 0, 0],
  ['test center', 200, 300],
  ['fractional', 12.5, -7.25],
  ['negative', -640.75, -480.125],
  ['large', 123456.789, -98765.4321],
  ['tiny', 0.1, 0.2],
];

/** Runs `fn` with `crypto.randomUUID` returning ...0001, ...0002, ... in call order. */
function withCountingIds<T>(fn: () => T): T {
  let n = 0;
  const spy = vi
    .spyOn(globalThis.crypto, 'randomUUID')
    .mockImplementation(
      () =>
        `00000000-0000-4000-8000-${(++n).toString(16).padStart(12, '0')}` as `${string}-${string}-${string}-${string}-${string}`,
    );
  try {
    return fn();
  } finally {
    spy.mockRestore();
  }
}

export function buildPresets(): Family {
  const fam = new Family('presets', {
    inputs:
      'buildElements {preset, cx, cy, isDark}: PRESETS.find(p => p.id === preset).buildElements(cx, cy, isDark), ' +
      'output the element array (z-order). crypto.randomUUID is stubbed per case as ' +
      '00000000-0000-4000-8000-000000000001, ...002, ... in call order. PRESETS {}: output the list in order as ' +
      '{id, labelKey, icon}.',
  });

  fam.add(
    'PRESETS list',
    'PRESETS',
    {},
    PRESETS.map((p) => ({ id: p.id, labelKey: p.labelKey, icon: p.icon })),
  );

  for (const preset of PRESETS) {
    for (const isDark of [true, false]) {
      for (const [label, cx, cy] of CENTERS) {
        const name = `${preset.id} ${isDark ? 'dark' : 'light'} ${label}`;
        const elements = withCountingIds(() =>
          preset.buildElements(cx, cy, isDark),
        );
        fam.add(
          name,
          'buildElements',
          { preset: preset.id, cx, cy, isDark },
          elements,
        );
      }
    }
  }
  return fam;
}
