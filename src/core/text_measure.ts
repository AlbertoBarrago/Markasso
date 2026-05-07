export function measureTextBounds(
  content: string,
  fontSize: number,
  fontFamily: string,
  bold?: boolean,
  italic?: boolean,
): { width: number; height: number } {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  ctx.font = `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${fontSize}px ${fontFamily}`;
  const lineHeight = fontSize * 1.2;
  const rawLines = content.split('\n');
  let maxWidth = 0;
  for (const line of rawLines) {
    maxWidth = Math.max(maxWidth, ctx.measureText(line).width);
  }
  return {
    width: Math.max(maxWidth, fontSize),
    height: Math.max(rawLines.length * lineHeight, fontSize),
  };
}
