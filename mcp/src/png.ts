import { Resvg } from '@resvg/resvg-js';
import { sceneToSVG } from '../../src/rendering/export';
import type { Diagram } from './diagram';
import { writeFileAtomic } from './storage';
import { findWarnings, formatWarnings } from './warnings';

/** Longest side of a rendered PNG, so huge boards stay a sane payload. */
const MAX_SIDE = 4096;

/**
 * Rasterizes an exported diagram SVG. The SVG export draws the same geometry
 * as the app's canvas (see tests/export_parity.test.ts), so this is what an
 * agent should look at to check its work. Text uses the system fonts, with
 * Arial as the fallback the app's default family resolves to.
 */
export function svgToPng(svg: string, scale = 2): Buffer {
  const size = svg.match(/<svg[^>]* width="([\d.]+)" height="([\d.]+)"/);
  const longest = size ? Math.max(Number(size[1]), Number(size[2])) : 0;
  const zoom = longest > 0 ? Math.min(scale, MAX_SIDE / longest) : scale;
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'zoom', value: zoom },
    font: { loadSystemFonts: true, defaultFontFamily: 'Arial' },
  });
  return resvg.render().asPng();
}

export interface PngExportOptions {
  /** File to write the PNG to. */
  readonly path?: string | undefined;
  readonly background?: 'dark' | 'transparent' | undefined;
  /** Return the image to the caller (default true). */
  readonly returnImage?: boolean | undefined;
}

export type PngExportContent =
  | { type: 'image'; data: string; mimeType: 'image/png' }
  | { type: 'text'; text: string };

/**
 * Result of diagram_export_png: the image unless `returnImage` is false
 * (an agent refreshing a preview file doesn't need it back), then what was
 * saved and the diagram's warnings.
 */
export async function exportPng(
  diagram: Diagram,
  options: PngExportOptions,
): Promise<PngExportContent[]> {
  const { path, background, returnImage = true } = options;
  if (!returnImage && !path)
    throw new Error(
      'Nothing to do: give a path to save the PNG, or leave returnImage on.',
    );
  await diagram.loadUsedIconPacks();
  const svg = sceneToSVG(diagram.elements, {
    canvasColor: '#080808',
    withBackground: (background ?? 'dark') === 'dark',
  });
  if (!svg)
    return [{ type: 'text', text: 'The diagram is empty: nothing to export.' }];
  const png = svgToPng(svg);
  if (path) await writeFileAtomic(path, png);
  const notes = [
    path ? `Saved PNG to ${path}.` : '',
    formatWarnings(findWarnings(diagram)),
  ].filter(Boolean);
  return [
    ...(returnImage
      ? [
          {
            type: 'image' as const,
            data: png.toString('base64'),
            mimeType: 'image/png' as const,
          },
        ]
      : []),
    ...notes.map((text) => ({ type: 'text' as const, text })),
  ];
}
