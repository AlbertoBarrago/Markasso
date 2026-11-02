/**
 * `text` family: canvas-free text metrics (src/core/text_metrics.ts) and the
 * text element helpers (src/core/text_measure.ts). Inputs carry the TS
 * parameter names, as MKTextTests/TextFixtureTests.swift reads them.
 * Sticky-note character breaking is `wrapTextLines` with `breakWords`.
 */
import {
  getTextContentBox,
  measureTextBounds,
} from '../../src/core/text_measure';
import {
  LINE_HEIGHT_RATIO,
  measureTextBlock,
  measureTextWidth,
  wrapTextLines,
} from '../../src/core/text_metrics';
import type { TextElement } from '../../src/elements/element';
import { Family, nextDown, nextUp } from './common';

/** Every font stack the code uses, plus spellings that hit each table rule. */
const FONTS = [
  'Arial',
  'Georgia',
  'Courier New',
  'Arial, sans-serif',
  '"Courier New", monospace',
  'Georgia, serif',
  'monospace',
  'serif',
  'sans-serif',
  'Helvetica Neue, sans-serif',
  'SERIF',
  'Comic Neue',
  '',
];

/** The three stacks the app actually offers, for the heavier grids. */
const APP_FONTS = [
  'Arial, sans-serif',
  '"Courier New", monospace',
  'Georgia, serif',
];

const SIZES = [1, 12, 16, 37.5, 1000];

const STRINGS: ReadonlyArray<[string, string]> = [
  ['empty', ''],
  ['ascii word', 'Markasso'],
  ['ascii sentence', 'The quick brown fox jumps over the lazy dog'],
  ['digits', '0123456789'],
  ['punctuation', ' !"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~'],
  ['latin-1 letters', 'Città perché naïve façade ß ÿ Æ Ø Þ'],
  ['latin-1 symbols', '¡¿©®°±µ¶·¼½¾×÷'],
  ['no-break and soft hyphen', 'a b­c'],
  ['greek', 'Καλημέρα κόσμε'],
  ['cyrillic', 'Привет мир'],
  ['cjk', '漢字かなカナ'],
  ['hangul', '안녕하세요 세계'],
  ['hangul jamo', '각'],
  ['fullwidth', 'ＡＢＣ１２３'],
  ['emoji', '😀'],
  ['emoji zwj family', '👨‍👩‍👧‍👦'],
  ['emoji skin tone', '👍🏽'],
  ['flag', '🇮🇹'],
  ['keycap', '1️⃣'],
  ['heart with variation selector', '❤️'],
  ['combining acute', 'é'],
  ['stacked combining marks', 'à́̂'],
  ['tab', 'a\tb'],
  ['tabs', 'col1\tcol2\tcol3'],
  ['crlf', 'a\r\nb'],
  ['leading space', ' leading'],
  ['trailing space', 'trailing '],
  ['double space', 'double  space'],
  ['spaces only', '   '],
  ['long word', 'Supercalifragilisticexpialidocious'],
  ['url', 'https://example.com/a/very/long/path/without/spaces'],
  ['mixed scripts', 'Hello 世界 Привет 👋 κόσμε'],
];

const MULTILINE: ReadonlyArray<[string, string]> = [
  ['two lines', 'Sticky note\nsecond line'],
  ['empty line between', 'a\n\nb'],
  ['only newline', '\n'],
  ['two newlines', '\n\n'],
  ['trailing newline', 'end\n'],
  [
    'long paragraph',
    'Modello linguistico\nproduzione: GPT 4.1, AI Factory Azure',
  ],
  ['spaces around newline', 'one \n two'],
  ['cjk paragraph', '漢字漢字漢字漢字 かなかなかな\nカナカナ'],
  ['emoji paragraph', '👍🏽 👨‍👩‍👧‍👦 🇮🇹 done'],
];

function text(el: Partial<TextElement>): TextElement {
  return {
    id: 'text',
    type: 'text',
    x: 10,
    y: 20,
    width: 200,
    height: 100,
    content: 'Note',
    fontSize: 16,
    fontFamily: 'Arial, sans-serif',
    strokeColor: '#000',
    fillColor: 'transparent',
    strokeWidth: 1,
    opacity: 1,
    roughness: 0,
    ...el,
  };
}

export function buildText(): Family {
  const fam = new Family('text');

  fam.add('LINE_HEIGHT_RATIO', 'LINE_HEIGHT_RATIO', {}, LINE_HEIGHT_RATIO);

  // measureTextWidth: every string, font and weight; every size for the
  // app's stacks, 16px for the other spellings (same tables, fewer bytes).
  for (const [label, str] of [...STRINGS, ...MULTILINE]) {
    for (const fontFamily of FONTS) {
      for (const bold of [false, true]) {
        for (const fontSize of APP_FONTS.includes(fontFamily) ? SIZES : [16]) {
          fam.add(
            `width ${label} ${JSON.stringify(fontFamily)} ${bold ? 'bold' : 'regular'} ${fontSize}`,
            'measureTextWidth',
            { text: str, fontSize, fontFamily, bold },
            measureTextWidth(str, fontSize, fontFamily, bold),
          );
        }
      }
    }
  }

  // wrapTextLines: fixed widths, plus exact word-boundary widths +- 1 ulp.
  const wrap = (
    name: string,
    content: string,
    maxWidth: number,
    fontSize: number,
    fontFamily: string,
    bold: boolean,
    breakWords: boolean,
  ) =>
    fam.add(
      name,
      'wrapTextLines',
      { content, maxWidth, fontSize, fontFamily, bold, breakWords },
      wrapTextLines(content, maxWidth, fontSize, fontFamily, bold, breakWords),
    );
  const WIDTHS = [-1, 0, 1, 20, 60, 100, 150, 300, Number.POSITIVE_INFINITY];
  for (const [label, content] of [...STRINGS, ...MULTILINE]) {
    for (const fontFamily of APP_FONTS) {
      // Bold only for the default stack: it is the same rule on other tables.
      for (const bold of fontFamily === APP_FONTS[0]
        ? [false, true]
        : [false]) {
        for (const breakWords of [false, true]) {
          for (const maxWidth of WIDTHS) {
            wrap(
              `wrap ${label} ${fontFamily} ${bold ? 'bold' : 'regular'}${breakWords ? ' sticky' : ''} width ${maxWidth}`,
              content,
              maxWidth,
              16,
              fontFamily,
              bold,
              breakWords,
            );
          }
        }
      }
    }
  }
  for (const [label, content] of [
    ['ascii sentence', 'The quick brown fox jumps over the lazy dog'],
    ['long word', 'io siasdasdasdasdasd Supercalifragilistic'],
    ['double space', 'aa  bb   cc'],
    ['cjk', '漢字 かな カナ 한국'],
  ] as const) {
    const words = content.split(' ');
    for (const fontFamily of APP_FONTS) {
      for (const bold of [false, true]) {
        for (let k = 1; k <= words.length; k++) {
          const prefix = words.slice(0, k).join(' ');
          const exact = measureTextWidth(prefix, 14, fontFamily, bold);
          for (const [edge, maxWidth] of [
            ['below', nextDown(exact)],
            ['at', exact],
            ['above', nextUp(exact)],
          ] as const) {
            for (const breakWords of [false, true]) {
              wrap(
                `wrap boundary ${label} ${k} words ${edge} ${fontFamily} ${bold ? 'bold' : 'regular'}${breakWords ? ' sticky' : ''}`,
                content,
                maxWidth,
                14,
                fontFamily,
                bold,
                breakWords,
              );
            }
          }
        }
      }
    }
  }
  // Character breaking at each character boundary of a long word.
  {
    const word = 'Supercalifragilistic';
    const chars = Array.from(word);
    for (let k = 1; k <= 6; k++) {
      const exact = measureTextWidth(
        chars.slice(0, k).join(''),
        14,
        'Arial, sans-serif',
      );
      for (const [edge, maxWidth] of [
        ['below', nextDown(exact)],
        ['at', exact],
        ['above', nextUp(exact)],
      ] as const) {
        wrap(
          `sticky word ${k} chars ${edge}`,
          word,
          maxWidth,
          14,
          'Arial, sans-serif',
          false,
          true,
        );
      }
    }
    const emoji = '👍🏽👨‍👩‍👧‍👦🇮🇹é漢字';
    for (const maxWidth of [1, 14, 15, 28, 29, 42, 60]) {
      wrap(
        `sticky emoji code points width ${maxWidth}`,
        emoji,
        maxWidth,
        14,
        'Arial, sans-serif',
        false,
        true,
      );
    }
  }
  for (const fontSize of SIZES) {
    for (const maxWidth of [10, 100, 1000, 20000]) {
      wrap(
        `wrap paragraph size ${fontSize} width ${maxWidth}`,
        'Modello linguistico\nproduzione: GPT 4.1, AI Factory Azure',
        maxWidth,
        fontSize,
        'Arial, sans-serif',
        false,
        false,
      );
    }
  }

  // measureTextBlock.
  const BLOCKS: ReadonlyArray<[string, string[]]> = [
    ['no lines', []],
    ['one empty line', ['']],
    ['two lines', ['ab', 'abcd']],
    ['three mixed', ['Hello', '漢字かな', '👍🏽 ok']],
    [
      'wrapped paragraph',
      wrapTextLines(
        'Modello linguistico\nproduzione: GPT 4.1, AI Factory Azure',
        150,
        14,
        'Arial, sans-serif',
      ),
    ],
  ];
  for (const [label, lines] of BLOCKS) {
    for (const fontFamily of APP_FONTS) {
      for (const bold of [false, true]) {
        for (const fontSize of SIZES) {
          fam.add(
            `block ${label} ${fontFamily} ${bold ? 'bold' : 'regular'} ${fontSize}`,
            'measureTextBlock',
            { lines, fontSize, fontFamily, bold },
            measureTextBlock(lines, fontSize, fontFamily, bold),
          );
        }
      }
    }
  }

  // measureTextBounds.
  for (const [label, content] of [
    ...MULTILINE,
    ['empty', ''],
    ['ascii word', 'Markasso'],
    ['cjk', '漢字かなカナ'],
    ['emoji zwj', '👨‍👩‍👧‍👦'],
  ] as const) {
    for (const fontFamily of APP_FONTS) {
      for (const bold of [false, true]) {
        for (const fontSize of SIZES) {
          for (const padding of [0, 12, 0.5]) {
            fam.add(
              `bounds ${label} ${fontFamily} ${bold ? 'bold' : 'regular'} ${fontSize} padding ${padding}`,
              'measureTextBounds',
              { content, fontSize, fontFamily, bold, padding },
              measureTextBounds(content, fontSize, fontFamily, bold, padding),
            );
          }
        }
      }
    }
  }

  // getTextContentBox.
  const BOXES: ReadonlyArray<[string, Partial<TextElement>]> = [
    ['no padding', {}],
    ['padding 0', { padding: 0 }],
    ['sticky padding 12', { padding: 12, width: 200, height: 180 }],
    ['fractional padding', { padding: 2.5 }],
    ['padding over half width', { padding: 30, width: 40, height: 100 }],
    ['padding over half height', { padding: 30, width: 100, height: 20 }],
    ['negative padding', { padding: -5 }],
    ['tiny box', { padding: 12, width: 1, height: 1 }],
    ['zero box', { padding: 4, width: 0, height: 0 }],
    ['negative width', { padding: 4, width: -50, height: 30 }],
    ['offset origin', { padding: 8, x: -100.25, y: 3e6 }],
  ];
  for (const [label, el] of BOXES) {
    const element = text(el);
    fam.add(
      `content box ${label}`,
      'getTextContentBox',
      { el: element },
      getTextContentBox(element),
    );
  }
  return fam;
}
