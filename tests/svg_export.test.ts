import { describe, expect, it } from 'vitest';
import type { Element } from '../src/elements/element';
import { createStencil } from '../src/elements/stencils/registry';
import { sceneToSVG } from '../src/rendering/export';

const base = {
  strokeColor: '#e2e2ef',
  fillColor: 'transparent',
  strokeWidth: 2,
  opacity: 1,
  roughness: 0,
} as const;

const OPTIONS = { canvasColor: '#080808', withBackground: true } as const;

function diagram(): Element[] {
  return [
    {
      ...base,
      id: 'a',
      type: 'rectangle',
      x: 0,
      y: 0,
      width: 120,
      height: 60,
      label: 'API <gateway> & "edge"',
    },
    {
      ...base,
      id: 'db',
      type: 'shape',
      kind: 'database',
      x: 300,
      y: 200,
      width: 120,
      height: 80,
      label: 'Orders',
    },
    createStencil(
      's',
      { kind: 'builtin', ref: 'generic/server' },
      600,
      30,
      base,
      'Server',
    ),
    {
      ...base,
      id: 'l',
      type: 'line',
      x: 0,
      y: 0,
      x2: 0,
      y2: 0,
      arrowHead: 'end',
      routing: 'elbow',
      startElementId: 'a',
      endElementId: 'db',
      label: 'query',
    },
  ];
}

describe('sceneToSVG', () => {
  it('returns null for an empty scene', () => {
    expect(sceneToSVG([], OPTIONS)).toBeNull();
  });

  it('builds a standalone SVG document without a DOM', () => {
    const svg = sceneToSVG(diagram(), OPTIONS)!;
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(
      true,
    );
    expect(svg.endsWith('</svg>')).toBe(true);
    // Page background, the elbow route, shape and icon artwork.
    expect(svg).toContain('fill="#080808"');
    expect(svg).toContain('<polyline points=');
    expect(svg).toContain('<path d="M');
    expect(svg).toContain('>Orders<');
    expect(svg).toContain('>Server<');
  });

  it('masks elbow labels with the canvas color even without a background', () => {
    const svg = sceneToSVG(diagram(), {
      canvasColor: '#123456',
      withBackground: false,
    })!;
    expect(svg).toContain('fill="#123456"');
    expect(svg).not.toMatch(/<rect width="[\d.]+" height="[\d.]+" fill=/);
  });

  it('escapes label text', () => {
    const svg = sceneToSVG(diagram(), OPTIONS)!;
    expect(svg).toContain('API &lt;gateway&gt; &amp; &quot;edge&quot;');
    expect(svg).not.toContain('<gateway>');
  });
});
