import type { TextElement } from '../elements/element';
import { measureTextBlock } from './text_metrics';

/**
 * Natural size of a text element's content, measured with the same metrics
 * the renderer wraps with so the stored width never triggers a wrap.
 * `padding` is added on every side, matching {@link getTextContentBox}.
 */
export function measureTextBounds(
  content: string,
  fontSize: number,
  fontFamily: string,
  bold?: boolean,
  padding = 0,
): { width: number; height: number } {
  const { width, height } = measureTextBlock(
    content.split('\n'),
    fontSize,
    fontFamily,
    bold,
  );
  return {
    width: Math.max(Math.ceil(width), fontSize) + 2 * padding,
    height: Math.max(height, fontSize) + 2 * padding,
  };
}

/** Text bounds inside the element's background, shared by editing and export. */
export function getTextContentBox(el: TextElement): {
  x: number;
  y: number;
  width: number;
  height: number;
  padding: number;
} {
  const padding = Math.max(
    0,
    Math.min(el.padding ?? 0, el.width / 2, el.height / 2),
  );
  return {
    x: el.x + padding,
    y: el.y + padding,
    width: Math.max(1, el.width - 2 * padding),
    height: Math.max(1, el.height - 2 * padding),
    padding,
  };
}
