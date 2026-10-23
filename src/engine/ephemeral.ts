/**
 * Commands that only affect local view state (viewport, selection, tool, colors,
 * grid). They are excluded from the undo/redo stack AND from the realtime
 * session, since each peer keeps its own viewport/selection/tool.
 *
 * Kept intentionally free of the `Command` type so this module can be imported
 * by the Cloudflare Worker (which must not pull in DOM-dependent browser code).
 */
export const EPHEMERAL_COMMANDS = new Set<string>([
  'PAN_VIEWPORT',
  'ZOOM_VIEWPORT',
  'SET_VIEWPORT',
  'SELECT_ELEMENTS',
  'CLEAR_SELECTION',
  'SET_TOOL',
  'SET_STROKE_COLOR', // appState default only, no element changes
  'SET_FILL_COLOR',
  'SET_STROKE_WIDTH',
  'TOGGLE_GRID',
  'SET_GRID_TYPE', // view setting only
  'SET_TOOL_LOCK',
  'CLEAR_JUST_CREATED_TEXT',
  'SET_JUST_CREATED_TEXT',
]);

export function isEphemeralCommand(type: string): boolean {
  return EPHEMERAL_COMMANDS.has(type);
}

/** Legacy wire ops from clients that predate per-user undo (engine/scene_diff.ts). */
const LEGACY_UNDO_OPS = new Set(['UNDO', 'REDO']);

/**
 * Whether a command should be relayed to the realtime session. Ephemeral
 * commands change view only (viewport, selection, tool, colors) and are never
 * shared. Undo/redo travel as the PATCH_ELEMENTS they produce; a bare UNDO/REDO
 * from an outdated client is dropped, since every peer would apply it to its
 * own stack and diverge.
 */
export function isSessionCommand(command: { type?: string }): boolean {
  const type = command?.type;
  return (
    type !== undefined &&
    !isEphemeralCommand(type) &&
    !LEGACY_UNDO_OPS.has(type)
  );
}
