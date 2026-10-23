import { measureTextBlock, wrapTextLines } from '../../src/core/text_metrics';
import type { ShapeKind } from '../../src/elements/element';
import { getShapeTextBox } from '../../src/rendering/shape_geometry';

/**
 * Node sizes derived from their labels, measured with the same metrics the
 * app wraps with, so a node created without width/height always fits its
 * text. Mirrors the renderer: shape labels wrap at the text area width
 * minus 16px (`drawShapeLabel`), ellipses and rhombi offer 70% of their
 * width.
 */

const LABEL_FONT = 'Arial, sans-serif';
const LABEL_SIZE = 16;
/** Breathing room around the text block inside a shape. */
const PAD = 24;
const MAX_W = 320;
const MAX_H = 4000;

export interface Size {
  readonly w: number;
  readonly h: number;
}

type SizedKind = 'rectangle' | 'ellipse' | 'rhombus' | ShapeKind;

/** Width of the label's widest explicit line. */
function naturalWidth(label: string): number {
  return measureTextBlock(label.split('\n'), LABEL_SIZE, LABEL_FONT).width;
}

/** Text block of a label wrapped to `maxWidth`. */
function block(label: string, maxWidth: number): Size {
  const lines = wrapTextLines(label, maxWidth, LABEL_SIZE, LABEL_FONT);
  const { width, height } = measureTextBlock(lines, LABEL_SIZE, LABEL_FONT);
  return { w: width, h: height };
}

const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));

/**
 * Smallest comfortable size for a labeled node: as wide as the text up to
 * MAX_W (then wrapped), at least the default size, tall enough for the
 * wrapped lines inside the shape's text area.
 */
export function sizeForLabel(
  kind: SizedKind,
  label: string,
  defaults: Size,
): Size {
  const text = naturalWidth(label);
  if (kind === 'rectangle') {
    const w = Math.ceil(clamp(text + PAD * 2, defaults.w, MAX_W));
    const b = block(label, w - 16);
    return { w, h: Math.ceil(Math.max(defaults.h, b.h + PAD)) };
  }
  if (kind === 'ellipse' || kind === 'rhombus') {
    const w = Math.ceil(
      clamp((text + 16) / 0.7 + PAD, defaults.w, MAX_W * 1.25),
    );
    const b = block(label, w * 0.7 - 16);
    // Height at which the text block's corners touch the outline:
    // ellipse (x/rx)^2 + (y/ry)^2 = 1, rhombus |x|/hw + |y|/hh = 1.
    const across = Math.min(0.95, (b.w + 8) / w);
    const h =
      kind === 'ellipse'
        ? (b.h + 8) / Math.sqrt(1 - across * across)
        : (b.h + 8) / (1 - across);
    return { w, h: Math.ceil(clamp(h, defaults.h, MAX_H)) };
  }
  // Flowchart symbols: grow until the symbol's text box holds the block.
  let w = Math.ceil(clamp(text + PAD * 2, defaults.w, MAX_W));
  for (let i = 0; i < 4; i++) {
    const box = getShapeTextBox(kind, w, defaults.h);
    if (box.w - 16 >= Math.min(text, MAX_W - PAD * 2)) break;
    w = Math.min(MAX_W * 1.5, Math.ceil(w * (w / Math.max(1, box.w - 16))));
  }
  const b = block(label, getShapeTextBox(kind, w, defaults.h).w - 16);
  let h = defaults.h;
  while (h < MAX_H && getShapeTextBox(kind, w, h).h < b.h + 8) h += 10;
  return { w, h };
}

/** Size of a text node: its content, unwrapped. */
export function sizeForText(content: string, fontSize: number): Size {
  const { width, height } = measureTextBlock(
    content.split('\n'),
    fontSize,
    LABEL_FONT,
  );
  // A few pixels of slack: the app never wraps a line that fits exactly.
  return { w: Math.ceil(width) + 4, h: Math.ceil(height) };
}
