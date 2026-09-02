import type { Command } from '../commands/commands';
import { createScene, type Scene } from '../core/scene';
import { isEphemeralCommand } from './ephemeral';
import { reducer } from './reducer';

/**
 * For APPLY_STYLE commands without explicit `ids`, resolve the target elements
 * from the current selection (or the last-created element when nothing is
 * selected) and bake them into the command. This keeps the command
 * deterministic across a shared session.
 */
function withApplyStyleTargets(scene: Scene, command: Command): Command {
  if (command.type !== 'APPLY_STYLE' || command.ids !== undefined) {
    return command;
  }
  const ids =
    scene.selectedIds.size > 0
      ? [...scene.selectedIds]
      : scene.appState.lastCreatedId
        ? [scene.appState.lastCreatedId]
        : [];
  return { ...command, ids };
}

type Listener = (scene: Scene) => void;

export class History {
  private past: Scene[] = [];
  private _present: Scene;
  private future: Scene[] = [];
  private listeners: Listener[] = [];
  private _dragging = false;
  private dragHasUndoableChanges = false;
  private dragFuture: Scene[] | null = null;

  constructor(
    initial: Scene = createScene(),
    private onCommand?: (command: Command | { type: 'UNDO' | 'REDO' }) => void,
  ) {
    this._present = initial;
  }

  get present(): Scene {
    return this._present;
  }

  /** Call at the start of a drag (move/resize/rotate). Records the pre-drag
   *  state once so the entire drag undoes in a single Ctrl+Z step. */
  beginDrag(): void {
    if (this._dragging) return;
    this.past.push(this._present);
    this.dragFuture = this.future;
    this.future = [];
    this._dragging = true;
    this.dragHasUndoableChanges = false;
  }

  /** Call at the end of a drag. Pops the undo entry if nothing actually changed. */
  endDrag(): void {
    if (!this._dragging) return;
    this._dragging = false;
    if (!this.dragHasUndoableChanges) {
      this.past.pop();
      this.future = this.dragFuture ?? [];
    }
    this.dragHasUndoableChanges = false;
    this.dragFuture = null;
  }

  /** Cancel an in-progress drag and restore its pre-drag element state. */
  cancelDrag(): void {
    if (!this._dragging) return;
    const beforeDrag = this.past.pop();
    this._dragging = false;
    this.dragHasUndoableChanges = false;
    this.future = this.dragFuture ?? [];
    this.dragFuture = null;
    if (!beforeDrag) return;
    this._present = restoreSnapshot(beforeDrag, this._present, false);
    this.notify();
  }

  /** Set/replace the outbound hook used to forward local commands (e.g. to a
   *  realtime session). Undo/redo notifications and ephemeral filtering are left
   *  to the consumer. */
  setOnCommand(
    cb?: (command: Command | { type: 'UNDO' | 'REDO' }) => void,
  ): void {
    this.onCommand = cb;
  }

  /** Apply a command received from the network. Runs the same deterministic
   *  reducer for convergence but does NOT touch the undo/redo stack (other
   *  people's actions must not pollute your undo history) and does NOT
   *  re-broadcast it via onCommand (avoids echo loops). */
  applyRemote(command: Command): void {
    // `isRemote` keeps per-user appState defaults (colors, stroke width, font)
    // local: remote clients apply the element changes but never inherit the
    // sender's default style.
    const next = reducer(this._present, command, true);
    if (next === this._present) return;
    this._present = next;
    this.notify();
  }

  /** Reset the scene to a fresh board, then replay a list of commands (used when
   *  joining a live room: the room's log is authoritative). Does not touch undo. */
  resetForLiveReplay(commands: readonly Command[], keepViewport = true): void {
    const viewport = this._present.viewport;
    this.past = [];
    this.future = [];
    this._dragging = false;
    this.dragHasUndoableChanges = false;
    this._present = createScene();
    if (keepViewport) this._present = { ...this._present, viewport };
    for (const command of commands) this.applyRemote(command);
  }

  dispatch(command: Command): void {
    // APPLY_STYLE targets the local selection; bake those ids into the command
    // so a shared session applies the style to the SAME elements on every
    // client (never to each peer's own selection).
    const resolved = withApplyStyleTargets(this._present, command);
    const next = reducer(this._present, resolved);
    if (next === this._present) return;

    const isEphemeral = isEphemeralCommand(resolved.type);
    if (this._dragging && !isEphemeral) {
      this.dragHasUndoableChanges = true;
    } else if (!this._dragging && !isEphemeral) {
      this.past.push(this._present);
      this.future = [];
    }

    this._present = next;
    this.onCommand?.(resolved);
    this.notify();
  }

  undo(): void {
    if (this._dragging) {
      this.cancelDrag();
      return;
    }
    if (this.past.length === 0) return;
    this.future.push(this._present);
    this._present = restoreSnapshot(this.past.pop()!, this._present);
    this.onCommand?.({ type: 'UNDO' });
    this.notify();
  }

  redo(): void {
    if (this._dragging) {
      this.cancelDrag();
      return;
    }
    if (this.future.length === 0) return;
    this.past.push(this._present);
    this._present = restoreSnapshot(this.future.pop()!, this._present);
    this.onCommand?.({ type: 'REDO' });
    this.notify();
  }

  canUndo(): boolean {
    return this.past.length > 0;
  }
  canRedo(): boolean {
    return this.future.length > 0;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify(): void {
    for (const l of this.listeners) l(this._present);
  }
}

function restoreSnapshot(
  snapshot: Scene,
  current: Scene,
  preserveSelection = true,
): Scene {
  const elementIds = new Set(snapshot.elements.map((element) => element.id));
  const selectedIds = preserveSelection
    ? new Set([...current.selectedIds].filter((id) => elementIds.has(id)))
    : new Set(snapshot.selectedIds);
  const currentLastCreatedId = current.appState.lastCreatedId;

  return {
    ...snapshot,
    selectedIds,
    viewport: current.viewport,
    appState: {
      ...snapshot.appState,
      activeTool: current.appState.activeTool,
      strokeColor: current.appState.strokeColor,
      fillColor: current.appState.fillColor,
      strokeWidth: current.appState.strokeWidth,
      gridVisible: current.appState.gridVisible,
      gridType: current.appState.gridType,
      toolLocked: current.appState.toolLocked,
      justCreatedText: current.appState.justCreatedText,
      lastCreatedId:
        currentLastCreatedId && elementIds.has(currentLastCreatedId)
          ? currentLastCreatedId
          : null,
    },
  };
}
