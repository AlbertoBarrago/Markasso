import type { ActiveTool } from '../core/app_state';

/**
 * Tool to switch back to when an inline label editor closes, or null to
 * leave the current tool alone.
 *
 * Opening a shape or connector label editor temporarily activates the text
 * tool, so the context panel shows label color and font while typing. Once
 * the editor closes, the previous tool must come back: otherwise every
 * following click keeps creating text or reopening labels, and shapes can
 * no longer be selected, moved or resized. Nothing is restored when the
 * text tool was already active before, or when the user picked another
 * tool while editing.
 */
export function toolAfterLabelEdit(
  previousTool: ActiveTool,
  currentTool: ActiveTool,
): ActiveTool | null {
  if (previousTool === 'text' || currentTool !== 'text') return null;
  return previousTool;
}
