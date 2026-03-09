import { reducer } from './reducer';
import { createScene, type Scene } from '../core/scene';
import type { Command } from '../commands/commands';

type Listener = (scene: Scene) => void;

// Pure view changes — do not push to undo/redo stack
const EPHEMERAL_COMMANDS = new Set<Command['type']>([
  'PAN_VIEWPORT',
  'ZOOM_VIEWPORT',
  'SELECT_ELEMENTS',
  'CLEAR_SELECTION',
  'SET_TOOL',
  'SET_STROKE_COLOR',   // appState default only, no element changes
  'SET_FILL_COLOR',
  'SET_STROKE_WIDTH',
  'TOGGLE_GRID',
  'SET_GRID_TYPE',      // view setting only
]);

export class History {
  private past:    Scene[] = [];
  private _present: Scene;
  private future:  Scene[] = [];
  private listeners: Listener[] = [];

  constructor(initial: Scene = createScene()) {
    this._present = initial;
  }

  get present(): Scene { return this._present; }

  dispatch(command: Command): void {
    const next = reducer(this._present, command);
    if (next === this._present) return;

    if (!EPHEMERAL_COMMANDS.has(command.type)) {
      this.past.push(this._present);
      this.future = [];
    }

    this._present = next;
    this.notify();
  }

  undo(): void {
    if (this.past.length === 0) return;
    this.future.push(this._present);
    this._present = this.past.pop()!;
    this.notify();
  }

  redo(): void {
    if (this.future.length === 0) return;
    this.past.push(this._present);
    this._present = this.future.pop()!;
    this.notify();
  }

  canUndo(): boolean { return this.past.length > 0; }
  canRedo(): boolean { return this.future.length > 0; }

  subscribe(listener: Listener): () => void {
    this.listeners.push(listener);
    return () => { this.listeners = this.listeners.filter((l) => l !== listener); };
  }

  private notify(): void {
    for (const l of this.listeners) l(this._present);
  }
}
