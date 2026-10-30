/**
 * Recorders that turn the web's own reducer and History tests (and the
 * generator's scripted sessions) into replayable traces.
 *
 * `dump-fixtures.fixture.ts` swaps `reducer` and `History` for the wrappers
 * below through `vi.mock`, then imports the test files: every test runs as
 * usual and, while a session is open, each top-level `reducer` call and each
 * History operation is recorded with its inputs and results. Reducer calls
 * made by History itself are not recorded as reducer cases (they belong to
 * the History step that made them).
 *
 * This module only imports types and `createScene` from `src/`, so it can be
 * loaded from inside the `vi.mock` factories without a cycle.
 */
import type { Command } from '../../src/commands/commands';
import { createScene, type Scene } from '../../src/core/scene';
import type { History } from '../../src/engine/history';
import type { reducer as realReducer } from '../../src/engine/reducer';
import type { Json } from './common';
import { type EncodedScene, encodeScene, snapshot } from './scene_codec';

export interface TraceStep {
  readonly peer: number;
  readonly op: string;
  readonly args?: Json;
  scene?: EncodedScene;
  canUndo?: boolean;
  canRedo?: boolean;
  readonly emitted: Command[];
}

export interface ReducerCall {
  readonly input: { scene: EncodedScene; command: Command; isRemote: boolean };
  readonly output: { scene: EncodedScene; unchanged: boolean };
}

export interface Session {
  readonly steps: TraceStep[];
  readonly peers: History[];
  readonly reducerCalls: ReducerCall[];
}

let session: Session | null = null;
/** > 0 while any History method runs (its reducer calls are not cases). */
let historyDepth = 0;

export function beginSession(): Session {
  session = { steps: [], peers: [], reducerCalls: [] };
  return session;
}

export function endSession(): Session | null {
  const done = session;
  session = null;
  return done;
}

type Reducer = typeof realReducer;

export function recordingReducer(base: Reducer): Reducer {
  return (scene, command, isRemote = false) => {
    const recording = session !== null && historyDepth === 0;
    const before = recording ? encodeScene(scene) : null;
    const commandCopy = recording ? snapshot(command) : null;
    const next = base(scene, command, isRemote);
    if (recording && session && before && commandCopy) {
      session.reducerCalls.push({
        input: { scene: before, command: commandCopy, isRemote },
        output: { scene: encodeScene(next), unchanged: next === scene },
      });
    }
    return next;
  };
}

export function recordingHistory(Base: typeof History): typeof History {
  class RecordingHistory extends Base {
    private readonly recSession: Session | null;
    private readonly recPeer: number;
    private recForward: ((command: Command) => void) | undefined;
    private recDepth = 0;
    private recOpen: TraceStep | null = null;

    constructor(
      initial: Scene = createScene(),
      onCommand?: (command: Command) => void,
    ) {
      // The base always reports to the recorder, which forwards to the
      // caller's hook: emitted commands are captured even without one.
      const box: { self?: RecordingHistory } = {};
      super(initial, (command) => box.self?.recEmit(command));
      box.self = this;
      this.recForward = onCommand;
      this.recSession = session;
      this.recPeer = session ? session.peers.push(this) - 1 : -1;
      if (session) {
        const scene = encodeScene(initial);
        session.steps.push({
          peer: this.recPeer,
          op: 'create',
          args: { scene },
          scene,
          canUndo: false,
          canRedo: false,
          emitted: [],
        });
      }
    }

    override setOnCommand(cb?: (command: Command) => void): void {
      this.recForward = cb;
    }

    override dispatch(command: Command): void {
      this.recTrack('dispatch', { command }, () => super.dispatch(command));
    }

    override applyRemote(command: Command): void {
      this.recTrack('applyRemote', { command }, () =>
        super.applyRemote(command),
      );
    }

    override resetForLiveReplay(
      commands: readonly Command[],
      keepViewport = true,
    ): void {
      this.recTrack('resetForLiveReplay', { commands, keepViewport }, () =>
        super.resetForLiveReplay(commands, keepViewport),
      );
    }

    override beginDrag(): void {
      this.recTrack('beginDrag', undefined, () => super.beginDrag());
    }

    override endDrag(): void {
      this.recTrack('endDrag', undefined, () => super.endDrag());
    }

    override cancelDrag(): void {
      this.recTrack('cancelDrag', undefined, () => super.cancelDrag());
    }

    override undo(): void {
      this.recTrack('undo', undefined, () => super.undo());
    }

    override redo(): void {
      this.recTrack('redo', undefined, () => super.redo());
    }

    private recEmit(command: Command): void {
      this.recOpen?.emitted.push(snapshot(command));
      this.recForward?.(command);
    }

    /**
     * Runs one public operation. Only the outermost call on this instance is
     * a step (undo during a drag calls cancelDrag internally); calls on other
     * instances made from inside it (a room relaying the emitted command) are
     * steps of their own, recorded in entry order, which is a valid sequential
     * replay order since they never touch this instance.
     */
    private recTrack(op: string, args: Json | undefined, run: () => void) {
      const step: TraceStep | null =
        session && session === this.recSession && this.recDepth === 0
          ? {
              peer: this.recPeer,
              op,
              ...(args && { args: snapshot(args) }),
              emitted: [],
            }
          : null;
      if (step) {
        session?.steps.push(step);
        this.recOpen = step;
      }
      this.recDepth++;
      historyDepth++;
      try {
        run();
      } finally {
        this.recDepth--;
        historyDepth--;
      }
      if (step) {
        step.scene = encodeScene(this.present);
        step.canUndo = this.canUndo();
        step.canRedo = this.canRedo();
        this.recOpen = null;
      }
    }
  }
  return RecordingHistory;
}

/** Splits a recorded trace into the fixture's input and output halves. */
export function traceCase(steps: ReadonlyArray<TraceStep>): {
  input: Json;
  output: Json;
} {
  return {
    input: {
      steps: steps.map((s) => ({
        peer: s.peer,
        op: s.op,
        ...(s.args && { args: s.args }),
      })),
    },
    output: {
      steps: steps.map((s) => ({
        scene: s.scene,
        canUndo: s.canUndo,
        canRedo: s.canRedo,
        emitted: s.emitted,
      })),
    },
  };
}
