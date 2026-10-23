import { Resvg } from '@resvg/resvg-js';

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
