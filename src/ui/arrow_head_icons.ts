import type { ArrowHeadStyle } from '../elements/element';
import { getArrowHeadShape } from '../rendering/connector_geometry';

/** i18n key of each arrowhead style's display name. */
export const ARROW_HEAD_STYLE_LABEL_KEYS: Readonly<
  Record<ArrowHeadStyle, string>
> = {
  open: 'headOpen',
  triangle: 'headTriangle',
  triangleFilled: 'headTriangleFilled',
  diamond: 'headDiamond',
  diamondFilled: 'headDiamondFilled',
  circle: 'headCircle',
};

/**
 * Panel icon for an arrowhead style, drawn with the renderer's geometry on
 * a short horizontal shaft. `placement` mirrors it for the start end.
 */
export function arrowHeadStyleIcon(
  style: ArrowHeadStyle,
  placement: 'start' | 'end',
): string {
  const [fromX, tipX] = placement === 'end' ? [2, 18] : [18, 2];
  // strokeWidth 0 → the minimum head length (12), which fits the 20px box.
  const shape = getArrowHeadShape(style, fromX, 10, tipX, 10, 0);
  let head: string;
  if (shape.kind === 'circle') {
    head = `<circle cx="${shape.cx}" cy="${shape.cy}" r="${shape.r}"/>`;
  } else {
    const points = shape.points
      .map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`)
      .join(' ');
    head =
      shape.kind === 'polygon'
        ? `<polygon points="${points}"${shape.filled ? ' fill="currentColor"' : ''}/>`
        : `<polyline points="${points}"/>`;
  }
  // The shaft stops at the back of closed heads so hollow ones stay hollow.
  const dir = Math.sign(tipX - fromX);
  const shaftEnd =
    shape.kind === 'circle'
      ? shape.cx - dir * shape.r
      : shape.kind === 'polygon'
        ? dir > 0
          ? Math.min(...shape.points.map((p) => p[0]))
          : Math.max(...shape.points.map((p) => p[0]))
        : tipX;
  return `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="${fromX}" y1="10" x2="${shaftEnd.toFixed(2)}" y2="10"/>${head}</svg>`;
}
