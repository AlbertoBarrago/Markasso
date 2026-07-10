import type { Command } from '../commands/commands';
import { track } from './track';

/**
 * Maps scene commands to RUM events. Only a subset of commands is
 * interesting for usage analytics — everything else is ignored.
 */
export function trackCommand(
  command: Command | { type: 'UNDO' | 'REDO' },
): void {
  switch (command.type) {
    case 'CREATE_ELEMENT':
      track('element_created', { element_type: command.element.type });
      return;
    case 'CREATE_ELEMENTS':
      track('element_created', {
        element_type: 'batch',
        count: String(command.elements.length),
      });
      return;
    case 'DELETE_ELEMENTS':
      track('element_deleted', { count: String(command.ids.length) });
      return;
    case 'SET_TOOL':
      track('tool_selected', { tool: command.tool });
      return;
    case 'UNDO':
      track('undo_used');
      return;
    case 'REDO':
      track('redo_used');
      return;
    default:
      return;
  }
}
