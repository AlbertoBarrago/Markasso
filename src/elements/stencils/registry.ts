import {
  LINE_HEIGHT_RATIO,
  measureTextBlock,
  wrapTextLines,
} from '../../core/text_metrics';
import type { StencilElement, StencilSource } from '../element';
import {
  DEFAULT_LABEL_FONT_FAMILY,
  DEFAULT_STENCIL_LABEL_FONT_SIZE,
} from '../label_defaults';
import {
  GENERIC_ICONS,
  type GenericIcon,
  type GenericIconId,
  isGenericIconId,
} from './generic';

/** `<pack>/<id>`, e.g. `generic/database` or `k8s/pod`. */
const STENCIL_REF_PATTERN = /^[a-z0-9]+\/[A-Za-z0-9_-]{1,64}$/;

/**
 * Embedded icons must be base64 SVG data URLs with a strict alphabet: the
 * value may end up in an `src`/`href` attribute, so nothing that could
 * break out of an attribute is accepted.
 */
const EMBEDDED_SVG_PATTERN =
  /^data:image\/svg\+xml;base64,[A-Za-z0-9+/]+={0,2}$/;

/** Cap per embedded icon; official vendor icons are 2-6 KB. */
export const MAX_EMBEDDED_SVG_CHARS = 64 * 1024;

/** Default box of a newly inserted icon. */
export const DEFAULT_STENCIL_SIZE = 64;

/** Gap between a stencil's box and the first line of its label. */
export const STENCIL_LABEL_GAP = 6;

/**
 * Width available to a stencil label: icons are small, so labels may run
 * wider than the icon itself, as in other diagram editors.
 */
export function getStencilLabelWidth(boxWidth: number): number {
  return Math.max(boxWidth * 2, 180);
}

/** Lines the label is drawn on, wrapped to the label column. */
export function getStencilLabelLines(el: StencilElement): string[] {
  if (!el.label) return [];
  return wrapTextLines(
    el.label,
    getStencilLabelWidth(Math.abs(el.width)),
    el.labelFontSize ?? DEFAULT_STENCIL_LABEL_FONT_SIZE,
    el.labelFontFamily ?? DEFAULT_LABEL_FONT_FAMILY,
  );
}

/** Height the label hangs below the icon box (0 without a label). */
export function getStencilLabelHeight(el: StencilElement): number {
  const lines = getStencilLabelLines(el).length;
  if (lines === 0) return 0;
  const fontSize = el.labelFontSize ?? DEFAULT_STENCIL_LABEL_FONT_SIZE;
  return STENCIL_LABEL_GAP + lines * fontSize * LINE_HEIGHT_RATIO;
}

/**
 * Box the label occupies below the icon, gap included, as wide as its
 * widest line (never narrower than the icon); null without a label.
 */
export function getStencilLabelBox(
  el: StencilElement,
): { x: number; y: number; w: number; h: number } | null {
  const lines = getStencilLabelLines(el);
  if (lines.length === 0) return null;
  const fontSize = el.labelFontSize ?? DEFAULT_STENCIL_LABEL_FONT_SIZE;
  const { width } = measureTextBlock(
    lines,
    fontSize,
    el.labelFontFamily ?? DEFAULT_LABEL_FONT_FAMILY,
  );
  const iconW = Math.abs(el.width);
  const w = Math.max(width, iconW);
  const left = Math.min(el.x, el.x + el.width);
  const top = Math.min(el.y, el.y + el.height);
  return {
    x: left + iconW / 2 - w / 2,
    y: top + Math.abs(el.height),
    w,
    h: getStencilLabelHeight(el),
  };
}

export function isValidStencilRef(ref: string): boolean {
  return STENCIL_REF_PATTERN.test(ref);
}

export function isValidEmbeddedSvg(src: string): boolean {
  return src.length <= MAX_EMBEDDED_SVG_CHARS && EMBEDDED_SVG_PATTERN.test(src);
}

/** Id of a `generic/<id>` reference, or null for any other pack. */
export function genericIconIdOf(ref: string): GenericIconId | null {
  const [pack, id] = ref.split('/');
  return pack === 'generic' && id !== undefined && isGenericIconId(id)
    ? id
    : null;
}

/** Built-in generic icon for a `generic/<id>` reference, if it exists. */
export function getGenericIcon(ref: string): GenericIcon | null {
  const id = genericIconIdOf(ref);
  return id ? GENERIC_ICONS[id] : null;
}

/**
 * Stencils whose artwork may be restyled: only Markasso's own generic icons.
 * Vendor icons (embedded or from bundled packs) keep their original look.
 */
export function isRestylableStencil(el: StencilElement): boolean {
  return el.source.kind === 'builtin' && el.source.ref.startsWith('generic/');
}

/**
 * Vendor terms (Azure, AWS) forbid rotating their icons, so embedded
 * stencils never rotate.
 */
export function isRotatableStencil(el: StencilElement): boolean {
  return el.source.kind === 'builtin';
}

export interface StencilStyle {
  readonly strokeColor: string;
  readonly fillColor: string;
  readonly strokeWidth: number;
  readonly opacity: number;
  readonly roughness: number;
}

/** New stencil centered on (cx, cy), labeled with the icon's name. */
export function createStencil(
  id: string,
  source: StencilSource,
  cx: number,
  cy: number,
  style: StencilStyle,
  label: string,
  size = DEFAULT_STENCIL_SIZE,
): StencilElement {
  return {
    id,
    type: 'stencil',
    source,
    x: cx - size / 2,
    y: cy - size / 2,
    width: size,
    height: size,
    ...style,
    ...(label && { label }),
  };
}
