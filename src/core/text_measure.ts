import { measureTextBlock } from './text_metrics';

/**
 * Natural size of a text element's content, measured with the same metrics
 * the renderer wraps with so the stored width never triggers a wrap.
 */
export function measureTextBounds(
  content: string,
  fontSize: number,
  fontFamily: string,
  bold?: boolean,
): { width: number; height: number } {
  const { width, height } = measureTextBlock(
    content.split('\n'),
    fontSize,
    fontFamily,
    bold,
  );
  return {
    width: Math.max(Math.ceil(width), fontSize),
    height: Math.max(height, fontSize),
  };
}
