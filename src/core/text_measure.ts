import { buildWrappedLines } from '../rendering/draw_element';

export function measureTextHeight(
  content: string,
  fontSize: number,
  fontFamily: string,
  width: number,
  bold?: boolean,
  italic?: boolean,
): number {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  ctx.font = `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${fontSize}px ${fontFamily}`;
  const lines = buildWrappedLines(ctx, content, width);
  return Math.max(lines.length * fontSize * 1.2, fontSize);
}
