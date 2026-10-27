/**
 * Fonts a label is drawn with when its element does not store its own.
 * The canvas, the SVG export, the label editors and the MCP server's node
 * sizing all read them from here, so a default changes in one place.
 */

/** Family of every label: shapes, icons and connectors. */
export const DEFAULT_LABEL_FONT_FAMILY = 'Arial, sans-serif';

/** Label inside a rectangle, ellipse, rhombus or flowchart symbol. */
export const DEFAULT_SHAPE_LABEL_FONT_SIZE = 16;

/** Label hanging below an icon (stencil). */
export const DEFAULT_STENCIL_LABEL_FONT_SIZE = 14;

/** Label placed along a connector. */
export const DEFAULT_CONNECTOR_LABEL_FONT_SIZE = 12;
