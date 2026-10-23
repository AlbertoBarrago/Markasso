import { FONT_WIDTHS } from './font_metrics.generated';

/**
 * Canvas-free text measuring and wrapping, shared by the canvas renderer,
 * the SVG export and the MCP server. Line breaks are decided here from
 * width tables measured in Chrome (scripts/build-font-metrics.mjs) instead
 * of `ctx.measureText`, so every output wraps a label at exactly the same
 * words and sizes it to the same box, with or without a browser.
 */

/** Line height of every multi-line text, as a multiple of the font size. */
export const LINE_HEIGHT_RATIO = 1.2;

type WidthTable = ReadonlyArray<number>;

/** Index in a width table of the code point, or -1 when it has no entry. */
function tableIndex(code: number): number {
  if (code >= 32 && code <= 126) return code - 32;
  if (code >= 160 && code <= 255) return 95 + code - 160;
  return -1;
}

const N_INDEX = tableIndex('n'.codePointAt(0)!);

/** Wide (CJK, Hangul, fullwidth) characters take a full em in any font. */
function isWide(code: number): boolean {
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xff00 && code <= 0xff60) ||
    code >= 0x1f300
  );
}

/** Width table of the closest measured family: Courier, Georgia or Arial. */
function tableFor(fontFamily: string, bold: boolean): WidthTable {
  const family = fontFamily.toLowerCase();
  if (family.includes('courier') || family.includes('mono'))
    return bold ? FONT_WIDTHS.monoBold : FONT_WIDTHS.mono;
  if (
    family.includes('georgia') ||
    (family.includes('serif') && !family.includes('sans'))
  )
    return bold ? FONT_WIDTHS.serifBold : FONT_WIDTHS.serif;
  return bold ? FONT_WIDTHS.sansBold : FONT_WIDTHS.sans;
}

/** Width of one line of text in CSS pixels. */
export function measureTextWidth(
  text: string,
  fontSize: number,
  fontFamily: string,
  bold = false,
): number {
  const table = tableFor(fontFamily, bold);
  let width = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    const index = tableIndex(code);
    width +=
      index >= 0 ? table[index]! : isWide(code) ? 1 : (table[N_INDEX] ?? 0.55);
  }
  return width * fontSize;
}

/**
 * Splits text into the lines it is drawn on: explicit newlines first, then
 * word wrapping at `maxWidth`. A single word longer than the width keeps
 * its own line rather than being broken mid-word.
 */
export function wrapTextLines(
  content: string,
  maxWidth: number,
  fontSize: number,
  fontFamily: string,
  bold = false,
): string[] {
  const measure = (s: string) =>
    measureTextWidth(s, fontSize, fontFamily, bold);
  const result: string[] = [];
  for (const line of content.split('\n')) {
    if (!line || measure(line) <= maxWidth) {
      result.push(line);
      continue;
    }
    let current = '';
    for (const word of line.split(' ')) {
      const candidate = current ? `${current} ${word}` : word;
      if (current && measure(candidate) > maxWidth) {
        result.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) result.push(current);
  }
  return result;
}

/** Width of the widest line and height of a block of lines. */
export function measureTextBlock(
  lines: ReadonlyArray<string>,
  fontSize: number,
  fontFamily: string,
  bold = false,
): { width: number; height: number } {
  let width = 0;
  for (const line of lines)
    width = Math.max(width, measureTextWidth(line, fontSize, fontFamily, bold));
  return { width, height: lines.length * fontSize * LINE_HEIGHT_RATIO };
}
