/** How often an open cloud board asks the server for changes made elsewhere, while visible. */
export const REMOTE_CHECK_INTERVAL = 30000;
/** Minimum gap between checks when the page becomes visible again. */
export const REMOTE_CHECK_THROTTLE = 5000;

/** What to do with a newer remote board returned by a background check. */
export type RemoteDecision = 'apply' | 'defer' | 'conflict' | 'drop';

/**
 * Decides how to handle a newer remote board, given what happened locally
 * since the check started.
 * - `drop`: the result no longer applies (board closed or switched, state no
 *   longer clean, or our own save already reached that version), or a save in
 *   flight will meet the remote change itself and report a conflict.
 * - `defer`: a drag or a text edit is in progress; decide again when it ends.
 * - `conflict`: local edits are waiting to be saved, so the remote board must
 *   not silently replace them.
 * - `apply`: nothing changed locally; load the remote board.
 */
export function remoteDecision(input: {
  /** The board was detached or replaced, or the client left saved/offline. */
  boardChanged: boolean;
  /** The client version already reached the remote version (our own save). */
  stale: boolean;
  /** A pointer is pressed or a text editor is open. */
  interacting: boolean;
  /** A PUT is in flight. */
  writing: boolean;
  /** Local changes are waiting to be saved. */
  unsaved: boolean;
  /** The scene elements changed since the check started. */
  elementsChanged: boolean;
}): RemoteDecision {
  if (input.boardChanged || input.stale) return 'drop';
  if (input.interacting) return 'defer';
  if (input.writing) return 'drop';
  if (input.unsaved) return 'conflict';
  // Elements changed but nothing is unsaved or being written: a save already
  // finished, and the next check compares against its version.
  if (input.elementsChanged) return 'drop';
  return 'apply';
}

/** Timer and visibility hooks, injectable so the schedule is testable without a DOM. */
export type RemoteCheckEnv = {
  now(): number;
  visible(): boolean;
  setInterval(run: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
};

/**
 * When to run background checks: every 30 s while the page is visible (no
 * timer runs while it is hidden), and once when it becomes visible again,
 * unless a check ran less than 5 s earlier.
 */
export class RemoteCheckSchedule {
  private handle: unknown = null;
  private active = false;
  private last = Number.NEGATIVE_INFINITY;
  constructor(
    private readonly check: () => void,
    private readonly env: RemoteCheckEnv,
  ) {}
  /** True while the periodic timer is running. */
  get polling(): boolean {
    return this.handle !== null;
  }
  /** Starts checking an opened board; the first periodic check is one interval away. */
  start(): void {
    this.active = true;
    this.last = this.env.now();
    if (this.env.visible()) this.startTimer();
  }
  /** Stops all checks, e.g. when the board is closed or detached. */
  stop(): void {
    this.active = false;
    this.stopTimer();
  }
  /** Call on `visibilitychange`. */
  visibilityChanged(): void {
    if (!this.active) return;
    if (!this.env.visible()) {
      this.stopTimer();
      return;
    }
    if (this.env.now() - this.last >= REMOTE_CHECK_THROTTLE) this.run();
    // Restart so the next periodic check is a full interval after this one.
    this.stopTimer();
    this.startTimer();
  }
  private run(): void {
    this.last = this.env.now();
    this.check();
  }
  private startTimer(): void {
    if (this.handle === null)
      this.handle = this.env.setInterval(() => {
        if (this.env.visible()) this.run();
      }, REMOTE_CHECK_INTERVAL);
  }
  private stopTimer(): void {
    if (this.handle === null) return;
    this.env.clearInterval(this.handle);
    this.handle = null;
  }
}
