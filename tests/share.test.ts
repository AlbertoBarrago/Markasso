import { describe, expect, it } from 'vitest';
import type { Element } from '../src/elements/element';
import { decodeScene, encodeScene, isShareHash } from '../src/io/share';

function encodeLegacyHash(elements: ReadonlyArray<Element>): string {
  const json = JSON.stringify(elements);
  const legacy = encodeURIComponent(btoa(unescape(encodeURIComponent(json))));
  return `#share=${legacy}`;
}

const SAMPLE_ELEMENTS: Element[] = [
  {
    id: 'rect-12345678-1234-1234-1234-1234567890ab',
    type: 'rectangle',
    x: 120,
    y: 80,
    width: 260,
    height: 160,
    strokeColor: '#111111',
    fillColor: '#ffffff',
    strokeWidth: 2,
    opacity: 0.95,
    roughness: 0,
    strokeStyle: 'dashed',
    rotation: 0.15,
    label: 'Shared block',
    labelFontSize: 18,
    labelFontFamily: 'Virgil',
    groupId: 'group-abcdef',
  },
  {
    id: 'arrow-12345678-1234-1234-1234-1234567890ab',
    type: 'arrow',
    x: 220,
    y: 160,
    x2: 420,
    y2: 260,
    strokeColor: '#111111',
    fillColor: 'transparent',
    strokeWidth: 3,
    opacity: 1,
    roughness: 0,
    startElementId: 'rect-12345678-1234-1234-1234-1234567890ab',
    endElementId: 'text-12345678-1234-1234-1234-1234567890ab',
    label: 'flow',
    labelFontSize: 14,
    labelFontFamily: 'Virgil',
  },
  {
    id: 'text-12345678-1234-1234-1234-1234567890ab',
    type: 'text',
    x: 460,
    y: 240,
    content: 'Hello share link',
    fontSize: 20,
    fontFamily: 'Virgil',
    width: 180,
    height: 40,
    strokeColor: '#111111',
    fillColor: 'transparent',
    strokeWidth: 1,
    opacity: 1,
    roughness: 0,
    textAlign: 'center',
    bold: true,
  },
  {
    id: 'pen-12345678-1234-1234-1234-1234567890ab',
    type: 'freehand',
    x: 0,
    y: 0,
    points: [[12, 14], [26, 32], [44, 38], [58, 52]],
    pressures: [0.4, 0.7, 0.5, 0.8],
    strokeColor: '#ff5500',
    fillColor: 'transparent',
    strokeWidth: 4,
    opacity: 0.8,
    roughness: 0,
    visible: false,
  },
];

describe('share codec', () => {
  it('round-trips the compact share format', async () => {
    const encoded = await encodeScene(SAMPLE_ELEMENTS);
    const decoded = await decodeScene(`#s=${encoded}`);
    expect(decoded).toEqual(SAMPLE_ELEMENTS);
  });

  it('decodes legacy #share links', async () => {
    const decoded = await decodeScene(encodeLegacyHash(SAMPLE_ELEMENTS));
    expect(decoded).toEqual(SAMPLE_ELEMENTS);
  });

  it('recognizes both current and legacy share hashes', () => {
    expect(isShareHash('#s=abc')).toBe(true);
    expect(isShareHash('#share=abc')).toBe(true);
    expect(isShareHash('#nope=abc')).toBe(false);
  });

  it('produces shorter payloads than the legacy format for a representative scene', async () => {
    const current = await encodeScene(SAMPLE_ELEMENTS);
    const legacy = encodeLegacyHash(SAMPLE_ELEMENTS).slice('#share='.length);
    expect(current.length).toBeLessThan(legacy.length);
  });
});
