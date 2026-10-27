import { describe, expect, it } from 'vitest';
import { getTextContentBox, measureTextBounds } from '../src/core/text_measure';
import {
  LINE_HEIGHT_RATIO,
  measureTextBlock,
  measureTextWidth,
  wrapTextLines,
} from '../src/core/text_metrics';

const ARIAL = 'Arial, sans-serif';

describe('measureTextWidth', () => {
  it('uses the measured Arial advances', () => {
    // Arial digits are 0.556em wide.
    expect(measureTextWidth('1234', 10, ARIAL)).toBeCloseTo(22.24, 2);
  });

  it('gives every Courier character the same width', () => {
    const mono = '"Courier New", monospace';
    expect(measureTextWidth('iiii', 16, mono)).toBeCloseTo(
      measureTextWidth('WWWW', 16, mono),
      5,
    );
  });

  it('measures bold wider than regular', () => {
    expect(measureTextWidth('Markasso', 16, ARIAL, true)).toBeGreaterThan(
      measureTextWidth('Markasso', 16, ARIAL),
    );
  });

  it('picks Georgia for serif families', () => {
    expect(measureTextWidth('Markasso', 16, 'Georgia, serif')).not.toBeCloseTo(
      measureTextWidth('Markasso', 16, ARIAL),
      1,
    );
  });

  it('measures accented letters and gives wide characters a full em', () => {
    expect(measureTextWidth('è', 10, ARIAL)).toBeCloseTo(
      measureTextWidth('e', 10, ARIAL),
      2,
    );
    expect(measureTextWidth('漢字', 10, ARIAL)).toBe(20);
  });
});

describe('wrapTextLines', () => {
  it('keeps explicit newlines and wraps long lines at word boundaries', () => {
    const lines = wrapTextLines(
      'Modello linguistico\nproduzione: GPT 4.1, AI Factory Azure',
      150,
      14,
      ARIAL,
    );
    expect(lines[0]).toBe('Modello linguistico');
    expect(lines.length).toBeGreaterThan(2);
    for (const line of lines)
      expect(measureTextWidth(line, 14, ARIAL)).toBeLessThanOrEqual(150);
  });

  it('never splits a single word', () => {
    expect(wrapTextLines('Supercalifragilistic', 20, 14, ARIAL)).toEqual([
      'Supercalifragilistic',
    ]);
  });

  it('splits an overlong word by character when breakWords is set', () => {
    const word = 'Supercalifragilistic';
    const lines = wrapTextLines(word, 40, 14, ARIAL, false, true);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join('')).toBe(word);
    for (const line of lines)
      expect(measureTextWidth(line, 14, ARIAL)).toBeLessThanOrEqual(40);
  });

  it('moves an overlong word to its own line before breaking it', () => {
    const lines = wrapTextLines(
      'io siasdasdasdasdasd',
      60,
      14,
      ARIAL,
      false,
      true,
    );
    expect(lines[0]).toBe('io');
    expect(lines.slice(1).join('')).toBe('siasdasdasdasdasd');
  });

  it('keeps at least one character per line in a too-narrow box', () => {
    expect(wrapTextLines('abc', 1, 14, ARIAL, false, true)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('keeps empty lines', () => {
    expect(wrapTextLines('a\n\nb', 100, 14, ARIAL)).toEqual(['a', '', 'b']);
  });
});

describe('measureTextBlock', () => {
  it('returns the widest line and the stacked height', () => {
    const block = measureTextBlock(['ab', 'abcd'], 10, ARIAL);
    expect(block.width).toBeCloseTo(measureTextWidth('abcd', 10, ARIAL), 5);
    expect(block.height).toBeCloseTo(2 * 10 * LINE_HEIGHT_RATIO, 5);
  });
});

describe('measureTextBounds with padding', () => {
  it('adds the padding on every side', () => {
    const bare = measureTextBounds('Note', 16, ARIAL);
    const padded = measureTextBounds('Note', 16, ARIAL, false, 12);
    expect(padded.width).toBe(bare.width + 24);
    expect(padded.height).toBe(bare.height + 24);
  });

  it('leaves a content box wide enough to keep each line unwrapped', () => {
    const content = 'Sticky note\nsecond line';
    const size = measureTextBounds(content, 24, ARIAL, false, 12);
    const box = getTextContentBox({
      id: 'note',
      type: 'text',
      x: 0,
      y: 0,
      ...size,
      content,
      padding: 12,
      fontSize: 24,
      fontFamily: ARIAL,
      strokeColor: '#000',
      fillColor: '#fde68a',
      strokeWidth: 1,
      opacity: 1,
      roughness: 0,
    });
    expect(wrapTextLines(content, box.width, 24, ARIAL)).toEqual([
      'Sticky note',
      'second line',
    ]);
  });
});
